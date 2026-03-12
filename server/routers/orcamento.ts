import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  orcamentos,
  orcamentoItens,
  orcamentoInsumos,
  orcamentoBdi,
  orcamentoRevisoes,
  insumosCatalogo,
  composicoesCatalogo,
  composicaoInsumos,
  insumosGrupos,
  obras,
  companies,
} from "../../drizzle/schema";
import { eq, and, desc, isNull, inArray, sql } from "drizzle-orm";

// ============================================================
// UTILITÁRIOS
// ============================================================

function toNum(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function fix2(v: number): string { return v.toFixed(2); }
function fix4(v: number): string { return v.toFixed(4); }
function fix6(v: number): string { return v.toFixed(6); }

// ============================================================
// PROPAGAÇÃO: quando o preço de um insumo é alterado,
// atualiza precoUnitario e custoUnitTotal em TODAS as
// composicao_insumos que referenciam aquele insumo.
// ============================================================
async function propagarPrecoInsumo(
  db: any,
  companyId: number,
  insumoCodigo: string,
  novoPreco: number,
  novaDescricao?: string,
  novaUnidade?: string | null,
) {
  const updates: any = {
    precoUnitario: fix4(novoPreco),
    // Recalcula custo total = quantidade * novoPreco
    custoUnitTotal: sql`CAST(quantidade AS numeric) * ${novoPreco}`,
  };
  if (novaDescricao !== undefined) updates.insumoDescricao = novaDescricao;
  if (novaUnidade   !== undefined) updates.unidade         = novaUnidade || null;
  await db.update(composicaoInsumos)
    .set(updates)
    .where(and(
      eq(composicaoInsumos.companyId,    companyId),
      eq(composicaoInsumos.insumoCodigo, insumoCodigo),
    ));
}

// ── Normalização para dedup do catálogo ───────────────────────
// Remove acentos, pontuação, espaços duplos e converte para minúsculas.
// Palavras funcionais curtas são preservadas para manter semântica.
function normalizarTexto(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 490);
}

// ── Similaridade Jaccard (detecção de composições similares) ──
const SIMILAR_THRESHOLD = 0.65;
function jaccard(normA: string, normB: string): number {
  const wa = normA.split(' ').filter(w => w.length > 2);
  const wb = new Set(normB.split(' ').filter(w => w.length > 2));
  if (wa.length === 0 || wb.size === 0) return 0;
  const inter = wa.filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union > 0 ? inter / union : 0;
}

// ── Atualizar catálogo de insumos e composições ────────────────
// Chamado após cada importação. Faz upsert inteligente evitando duplicatas.
async function atualizarCatalogo(
  db: Awaited<ReturnType<typeof getDb>>,
  companyId: number,
  itens: any[],
  insumos: any[],
) {
  if (!db) return;

  // ── INSUMOS ──────────────────────────────────────────────────
  for (const ins of insumos) {
    if (!ins.descricao?.trim()) continue;
    const chave = normalizarTexto(ins.descricao);
    const preco = parseFloat(ins.precoUnitComEncargos || ins.precoUnitBase || '0');
    const qtd   = parseFloat(ins.quantidadeTotal || '0');

    // 1) Tenta match por código (se existir)
    let existente: any = null;
    if (ins.codigo?.trim()) {
      const rows = await db.select().from(insumosCatalogo)
        .where(and(
          eq(insumosCatalogo.companyId, companyId),
          eq(insumosCatalogo.codigo, ins.codigo.trim()),
        )).limit(1);
      existente = rows[0];
    }
    // 2) Tenta match por chave normalizada
    if (!existente) {
      const rows = await db.select().from(insumosCatalogo)
        .where(and(
          eq(insumosCatalogo.companyId, companyId),
          eq(insumosCatalogo.chaveNorm, chave),
        )).limit(1);
      existente = rows[0];
    }

    if (existente) {
      const oldCount = existente.totalOrcamentos || 0;
      const oldAvg   = parseFloat(existente.precoMedio || '0');
      const oldMin   = parseFloat(existente.precoMin   || '0');
      const oldMax   = parseFloat(existente.precoMax   || '0');
      const newAvg   = oldCount > 0 ? (oldAvg * oldCount + preco) / (oldCount + 1) : preco;
      await db.update(insumosCatalogo).set({
        precoUnitario:    fix4(preco),
        precoMedio:       fix4(newAvg),
        precoMin:         fix4(preco > 0 ? Math.min(oldMin > 0 ? oldMin : preco, preco) : oldMin),
        precoMax:         fix4(Math.max(oldMax, preco)),
        totalOrcamentos:  oldCount + 1,
        totalQuantidade:  fix4(parseFloat(existente.totalQuantidade || '0') + qtd),
        ultimaAtualizacao: new Date().toISOString(),
      }).where(eq(insumosCatalogo.id, existente.id));
    } else {
      await db.insert(insumosCatalogo).values({
        companyId,
        codigo:           ins.codigo?.trim().substring(0, 100) || null,
        descricao:        ins.descricao.trim().substring(0, 1000),
        unidade:          ins.unidade?.trim().substring(0, 30) || null,
        tipo:             ins.tipo?.trim().substring(0, 100) || null,
        precoUnitario:    fix4(preco),
        precoMin:         fix4(preco),
        precoMax:         fix4(preco),
        precoMedio:       fix4(preco),
        totalOrcamentos:  1,
        totalQuantidade:  fix4(qtd),
        chaveNorm:        chave,
        ultimaAtualizacao: new Date().toISOString(),
        criadoEm:         new Date().toISOString(),
      });
    }
  }

  // ── COMPOSIÇÕES (itens folha: nivel >= 3) ─────────────────────
  const folhas = itens.filter(i => i.nivel >= 3 && i.descricao?.trim());
  for (const item of folhas) {
    const chave    = normalizarTexto(item.descricao);
    const custoMat = parseFloat(item.custoUnitMat  || '0');
    const custoMdo = parseFloat(item.custoUnitMdo  || '0');
    const custoTot = parseFloat(item.custoUnitTotal || '0');

    let existente: any = null;
    if (item.servicoCodigo?.trim()) {
      const rows = await db.select().from(composicoesCatalogo)
        .where(and(
          eq(composicoesCatalogo.companyId, companyId),
          eq(composicoesCatalogo.codigo, item.servicoCodigo.trim()),
        )).limit(1);
      existente = rows[0];
    }
    if (!existente) {
      const rows = await db.select().from(composicoesCatalogo)
        .where(and(
          eq(composicoesCatalogo.companyId, companyId),
          eq(composicoesCatalogo.chaveNorm, chave),
        )).limit(1);
      existente = rows[0];
    }

    if (existente) {
      const oldCount = existente.totalOrcamentos || 0;
      await db.update(composicoesCatalogo).set({
        custoUnitMat:     fix4(custoMat),
        custoUnitMdo:     fix4(custoMdo),
        custoUnitTotal:   fix4(custoTot),
        totalOrcamentos:  oldCount + 1,
        ultimaAtualizacao: new Date().toISOString(),
      }).where(eq(composicoesCatalogo.id, existente.id));
    } else {
      await db.insert(composicoesCatalogo).values({
        companyId,
        codigo:           item.servicoCodigo?.trim().substring(0, 100) || null,
        descricao:        item.descricao.trim().substring(0, 1000),
        unidade:          item.unidade?.trim().substring(0, 30) || null,
        tipo:             item.tipo?.trim().substring(0, 100) || null,
        custoUnitMat:     fix4(custoMat),
        custoUnitMdo:     fix4(custoMdo),
        custoUnitTotal:   fix4(custoTot),
        totalOrcamentos:  1,
        chaveNorm:        chave,
        ultimaAtualizacao: new Date().toISOString(),
        criadoEm:         new Date().toISOString(),
      });
    }
  }
}

// Extrai metadados das primeiras linhas da aba Orçamento
function extrairMetadados(rows: any[][]): {
  cliente: string; local: string; obra: string;
  revisao: string; areaIntervencao: number; tempoObraMeses: number;
} {
  let cliente = '', local = '', obra = '', revisao = '';
  let areaIntervencao = 0, tempoObraMeses = 0;

  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const row = rows[i];
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').trim();
      if (cell.includes('CLIENTE:')) {
        cliente = cell.replace(/CLIENTE:\s*/i, '').trim();
        if (!cliente && typeof row[j + 1] === 'string') cliente = String(row[j + 1]).trim();
      }
      if (cell.includes('LOCAL:')) {
        local = cell.replace(/LOCAL:\s*/i, '').trim();
        if (!local && typeof row[j + 1] === 'string') local = String(row[j + 1]).trim();
      }
      if (cell.includes('OBRA:')) {
        obra = cell.replace(/OBRA:\s*/i, '').trim();
        if (!obra && typeof row[j + 1] === 'string') obra = String(row[j + 1]).trim();
      }
      if (/^R\d{2,3}$/.test(cell)) revisao = cell;
      if ((cell.includes('ÁREA DE INTERVENÇÃO') || cell.includes('AREA DE INTERVENCAO')) && typeof row[j + 1] === 'number') {
        areaIntervencao = toNum(row[j + 1]);
      }
      if (cell.includes('TEMPO DE OBRA') && typeof row[j + 2] === 'number') {
        tempoObraMeses = toNum(row[j + 2]);
      }
    }
    // revisão também pode estar em col separada
    if (!revisao) {
      for (const cell of row) {
        const s = String(cell || '').trim();
        if (/^R\d{2,3}$/.test(s)) revisao = s;
      }
    }
  }
  return { cliente, local, obra, revisao, areaIntervencao, tempoObraMeses };
}

// Extrai os totais gerais diretamente da linha "TOTAIS GERAIS" da planilha.
// Essa linha tem os valores em precisão total (sem arredondamento de 2 casas),
// que arredondados dão exatamente os valores exibidos na planilha.
// Colunas: mat=col[22], mdo=col[23], total=col[24]
function extrairTotaisPlanilha(rows: any[][]): { totalMat: number; totalMdo: number; totalCusto: number } | null {
  for (const row of rows) {
    const label = String(row[10] || '').trim().toUpperCase();
    if (label.includes('TOTAI') && label.includes('GERA')) {
      const totalMat   = toNum(row[22]);
      const totalMdo   = toNum(row[23]);
      const totalCusto = toNum(row[24]);
      if (totalCusto > 0) return { totalMat, totalMdo, totalCusto };
    }
  }
  return null;
}

// Parseia a aba Orçamento e retorna array de itens
// bdiPercentual: decimal fraction (ex: 0.2456 = 24.56%)
// Venda = Custo × (1 + BDI%)   |   Meta = Custo × (1 − Meta%)
function parsearAbaCorcamento(rows: any[][], metaPerc: number, bdiPercentual: number = 0) {
  // Detectar linha de cabeçalho: coluna 10 = "Item"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    if (String(rows[i][10] || '').trim() === 'Item') { headerIdx = i; break; }
  }
  if (headerIdx === -1) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Estrutura da planilha não reconhecida. Coluna "Item" não encontrada na linha de cabeçalho.' });

  const itens = [];
  let ordem = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const eapCodigo = String(row[10] || '').trim();
    const descricao = String(row[15] || '').trim();
    if (!eapCodigo || !descricao) continue;

    const nivel = toNum(row[9]);
    if (nivel < 1 || nivel > 10) continue;

    const composicaoTipo = String(row[11] || '').trim();
    const servicoCodigo  = String(row[13] || '').trim();
    const tipo           = String(row[14] || '').trim();
    const unidade        = String(row[16] || '').trim();
    const quantidade     = toNum(row[17]);
    const custoUnitMat   = toNum(row[18]);
    const custoUnitMdo   = toNum(row[20]);
    const custoUnitTotal = custoUnitMat + custoUnitMdo;
    const custoTotalMat  = toNum(row[30]);
    const custoTotalMdo  = toNum(row[31]);
    const custoTotal     = toNum(row[32]);

    // Venda calculada a partir do custo + BDI (NÃO lemos da coluna 24)
    const vendaTotal     = custoTotal * (1 + bdiPercentual);
    const vendaUnitTotal = custoUnitTotal * (1 + bdiPercentual);

    const metaTotal      = custoTotal * (1 - metaPerc);
    const metaUnitTotal  = custoUnitTotal * (1 - metaPerc);
    const abcServico     = String(row[25] || '').trim().substring(0, 5);

    ordem++;
    itens.push({
      eapCodigo,
      nivel,
      tipo: tipo.substring(0, 50),
      composicaoTipo: composicaoTipo.substring(0, 20),
      servicoCodigo: servicoCodigo.substring(0, 50),
      descricao: descricao.substring(0, 1000),
      unidade: unidade.substring(0, 30),
      quantidade:     fix4(quantidade),
      custoUnitMat:   fix4(custoUnitMat),
      custoUnitMdo:   fix4(custoUnitMdo),
      custoUnitTotal: fix4(custoUnitTotal),
      vendaUnitTotal: fix4(vendaUnitTotal),
      metaUnitTotal:  fix4(metaUnitTotal),
      custoTotalMat:  fix2(custoTotalMat),
      custoTotalMdo:  fix2(custoTotalMdo),
      custoTotal:     fix2(custoTotal),
      vendaTotal:     fix2(vendaTotal),
      metaTotal:      fix2(metaTotal),
      abcServico,
      ordem,
    });
  }
  return itens;
}

// Parseia aba BDI
// nomeAba: nome da aba de origem para exibição multi-aba
function parsearAbaBdi(rows: any[][], companyId: number, nomeAba = 'BDI') {
  let bdiPercentual = 0;
  const linhas: any[] = [];
  let ordem = 0;

  for (const row of rows) {
    const col1    = String(row[1] || '').trim();
    const col2    = String(row[2] || '').trim();
    const descCol = String(row[3] || '').trim();

    // Extrai o BDI total do item B-02 (percentual sobre custo direto)
    if ((col2 === 'B-02' || col1 === 'B-02') && !bdiPercentual) {
      bdiPercentual = toNum(row[7]) || toNum(row[6]);
    }

    // Inclui apenas linhas com código + descrição válidos
    // e percentual razoável (< 10 = < 1000% como decimal) para ignorar bugs de parsing
    if (col2 && descCol && descCol.length > 2) {
      const pct = toNum(row[7]);
      const val = toNum(row[9]);
      // Ignora linhas com percentual absurdo (ex: linha ARQUIVO, valores de célula errados)
      if (Math.abs(pct) > 10) continue;
      linhas.push({
        companyId,
        nomeAba,
        codigo:        col2.substring(0, 30),
        descricao:     descCol.substring(0, 255),
        percentual:    fix6(pct),
        valorAbsoluto: fix2(val),
        ordem:         ordem++,
      });
    }
  }
  return { bdiPercentual, linhas };
}

// Parseia aba Insumos para curva ABC
function parsearAbaInsumos(rows: any[][], companyId: number) {
  const raw: { codigo: string; descricao: string; tipo: string; precoUnitBase: number; precoUnitComEncargos: number; quantidadeTotal: number; custoTotal: number }[] = [];

  for (const row of rows) {
    const codigo    = String(row[1] || '').trim();
    const descricao = String(row[2] || '').trim();
    if (!codigo || !descricao || typeof row[4] !== 'number') continue;
    const tipo                 = String(row[6] || '').trim();
    const precoUnitBase        = toNum(row[4]);
    const precoUnitComEncargos = toNum(row[5]);
    const quantidadeTotal      = toNum(row[7]);
    const custoTotal           = toNum(row[8]);
    if (custoTotal <= 0) continue;
    raw.push({ codigo, descricao, tipo, precoUnitBase, precoUnitComEncargos, quantidadeTotal, custoTotal });
  }

  raw.sort((a, b) => b.custoTotal - a.custoTotal);
  const totalGeral = raw.reduce((s, i) => s + i.custoTotal, 0);
  let acumulado = 0;

  return raw.map(ins => {
    const pct = totalGeral > 0 ? ins.custoTotal / totalGeral : 0;
    acumulado += pct;
    const curvaAbc = acumulado <= 0.8 ? 'A' : acumulado <= 0.95 ? 'B' : 'C';
    return {
      companyId,
      codigo:                ins.codigo.substring(0, 50),
      descricao:             ins.descricao.substring(0, 500),
      unidade:               '',
      tipo:                  ins.tipo.substring(0, 100),
      precoUnitBase:         fix4(ins.precoUnitBase),
      precoUnitComEncargos:  fix4(ins.precoUnitComEncargos),
      quantidadeTotal:       fix4(ins.quantidadeTotal),
      custoTotal:            fix2(ins.custoTotal),
      percentualTotal:       fix6(pct),
      percentualAcumulado:   fix6(Math.min(acumulado, 1)),
      curvaAbc,
    };
  });
}

// ============================================================
// PARSER ABA INSUMOS PARA CATÁLOGO STANDALONE
// Importa TODOS os insumos da planilha (mesmo sem uso / qty=0).
// Col[1]=código, [2]=desc, [3]=unidade, [4]=preçoBase, [5]=comEncargos, [6]=subGrupo
// ============================================================
function parsearAbaInsumosParaCatalogo(rows: any[][], companyId: number) {
  const result: {
    companyId: number; codigo: string; descricao: string; unidade: string; tipo: string;
    precoBase: number; precoComEncargos: number; quantidadeTotal: number; custoTotal: number;
  }[] = [];

  for (const row of rows) {
    const codigo    = String(row[1] || '').trim();
    const descricao = String(row[2] || '').trim();
    // Exige código no padrão nn.nn.nn e descrição não vazia
    if (!codigo || !descricao || !/^\d{2}\.\d{2}/.test(codigo)) continue;
    const unidade          = String(row[3] || '').trim();
    const precoBase        = toNum(row[4]);
    const precoComEncargos = toNum(row[5]);
    const tipo             = String(row[6] || '').trim();
    const quantidadeTotal  = toNum(row[7]);
    const custoTotal       = toNum(row[8]);
    // Exige pelo menos um preço válido
    if (precoBase <= 0 && precoComEncargos <= 0) continue;
    result.push({ companyId, codigo, descricao, unidade, tipo, precoBase, precoComEncargos, quantidadeTotal, custoTotal });
  }
  return result;
}

// ============================================================
// PARSER ABA CPUs (Composições de Preços Unitários)
// Colunas: [0]=tipo(S/INS), [1]=Cód_1, [2]=Cód_Aux, [3]=Cód_Insumo,
//          [4]=Descrição, [5]=Un, [6]=Qtd, [7]=PU_insumo,
//          [8]=Alocação_MAT, [9]=Alocação_MO, [12]=PU_Total
// ============================================================
function parsearAbaCPUs(rows: any[][], companyId: number) {
  const composicoes: {
    companyId: number; codigo: string; descricao: string; unidade: string;
    custoUnitMat: string; custoUnitMdo: string; custoUnitTotal: string;
    tipo: string; chaveNorm: string;
  }[] = [];

  const linhasInsumos: {
    companyId: number; composicaoCodigo: string; insumoCodigo: string;
    insumoDescricao: string; unidade: string; quantidade: string;
    precoUnitario: string; alocacaoMat: string; alocacaoMdo: string;
    custoUnitTotal: string;
  }[] = [];

  let currentCod = '';

  for (const row of rows) {
    const tipo = String(row[0] || '').trim();
    if (tipo === 'S') {
      currentCod = String(row[1] || '').trim();
      if (!currentCod) continue;
      const descricao = String(row[4] || '').trim();
      const unidade   = String(row[5] || '').trim();
      const puMat     = toNum(row[10]);
      const puMdo     = toNum(row[11]);
      const puTotal   = toNum(row[12]);
      composicoes.push({
        companyId,
        codigo:        currentCod.substring(0, 100),
        descricao:     descricao.substring(0, 1000),
        unidade:       unidade.substring(0, 30),
        custoUnitMat:  fix4(puMat),
        custoUnitMdo:  fix4(puMdo),
        custoUnitTotal: fix4(puTotal),
        tipo:          'CPU',
        chaveNorm:     (descricao.toLowerCase().replace(/[^a-z0-9]/g, '')).substring(0, 500),
      });
    } else if (tipo === 'INS' && currentCod) {
      const insumoCodigo   = String(row[3] || '').trim();
      const insumoDescricao = String(row[4] || '').trim();
      const unidade         = String(row[5] || '').trim();
      const quantidade      = toNum(row[6]);
      const precoUnitario   = toNum(row[7]);
      const alocacaoMat     = toNum(row[8]);
      const alocacaoMdo     = toNum(row[9]);
      const custoUnit       = toNum(row[12]);
      if (!insumoCodigo && !insumoDescricao) continue;
      linhasInsumos.push({
        companyId,
        composicaoCodigo: currentCod.substring(0, 100),
        insumoCodigo:     insumoCodigo.substring(0, 100),
        insumoDescricao:  insumoDescricao.substring(0, 1000),
        unidade:          unidade.substring(0, 30),
        quantidade:       fix6(quantidade),
        precoUnitario:    fix4(precoUnitario),
        alocacaoMat:      fix6(alocacaoMat),
        alocacaoMdo:      fix6(alocacaoMdo),
        custoUnitTotal:   fix6(custoUnit),
      });
    }
  }

  return { composicoes, linhasInsumos };
}

// ============================================================
// IN-MEMORY JOB STORE (importação de insumos em background)
// ============================================================
interface ImportJob {
  total: number;
  done: number;
  inseridos: number;
  atualizados: number;
  status: 'running' | 'done' | 'error';
  error?: string;
  createdAt: number;
}
const importJobs = new Map<string, ImportJob>();

// Limpeza automática de jobs com mais de 10 min
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, job] of importJobs) {
    if (job.createdAt < cutoff) importJobs.delete(id);
  }
}, 5 * 60 * 1000);

// Função auxiliar que processa insumos em background (sem bloquear o HTTP)
async function processarImportacaoBackground(
  jobId: string, insumos: ReturnType<typeof parsearAbaInsumosParaCatalogo>,
  companyId: number, db: any,
) {
  const job = importJobs.get(jobId)!;
  try {
    for (const ins of insumos) {
      const chave = normalizarTexto(ins.descricao);
      const preco = ins.precoComEncargos > 0 ? ins.precoComEncargos : ins.precoBase;

      let existente: any = null;
      const byCode = await db.select().from(insumosCatalogo)
        .where(and(eq(insumosCatalogo.companyId, companyId), eq(insumosCatalogo.codigo, ins.codigo)))
        .limit(1);
      existente = byCode[0];

      if (!existente) {
        const byKey = await db.select().from(insumosCatalogo)
          .where(and(eq(insumosCatalogo.companyId, companyId), eq(insumosCatalogo.chaveNorm, chave)))
          .limit(1);
        existente = byKey[0];
      }

      if (existente) {
        const codigoFinal   = ins.codigo.substring(0, 100);
        const descricaoFinal = ins.descricao.substring(0, 1000);
        const unidadeFinal  = ins.unidade.substring(0, 30) || existente.unidade;
        await db.update(insumosCatalogo).set({
          codigo:            codigoFinal,
          descricao:         descricaoFinal,
          unidade:           unidadeFinal,
          tipo:              ins.tipo.substring(0, 100) || existente.tipo,
          precoUnitario:     fix4(preco),
          precoMin:          fix4(Math.min(parseFloat(existente.precoMin || String(preco)), preco)),
          precoMax:          fix4(Math.max(parseFloat(existente.precoMax || '0'), preco)),
          precoMedio:        fix4(preco),
          ultimaAtualizacao: new Date().toISOString(),
        }).where(eq(insumosCatalogo.id, existente.id));
        // Propaga preço atualizado para todas as composições que usam este insumo
        await propagarPrecoInsumo(db, companyId, codigoFinal, preco, descricaoFinal, unidadeFinal);
        job.atualizados++;
      } else {
        await db.insert(insumosCatalogo).values({
          companyId,
          codigo:            ins.codigo.substring(0, 100),
          descricao:         ins.descricao.substring(0, 1000),
          unidade:           ins.unidade.substring(0, 30) || null,
          tipo:              ins.tipo.substring(0, 100) || null,
          precoUnitario:     fix4(preco),
          precoMin:          fix4(preco),
          precoMax:          fix4(preco),
          precoMedio:        fix4(preco),
          totalOrcamentos:   0,
          totalQuantidade:   fix4(ins.quantidadeTotal),
          chaveNorm:         chave,
          ultimaAtualizacao: new Date().toISOString(),
          criadoEm:          new Date().toISOString(),
        });
        job.inseridos++;
      }

      job.done++;
    }
    job.status = 'done';
  } catch (err: any) {
    job.status = 'error';
    job.error = err?.message ?? 'Erro desconhecido';
  }
}

// ============================================================
// HELPER: gera próximo código 99.XX.XX para insumos manuais
// ============================================================
function gerarProximoCodigo99(codigosUsados: Set<string>): string {
  const manual = [...codigosUsados]
    .filter(c => /^99\.\d{2}\.\d{2}$/.test(c))
    .map(c => { const p = c.split('.'); return parseInt(p[1]) * 100 + parseInt(p[2]); })
    .sort((a, b) => b - a);
  const seq  = (manual[0] ?? 0) + 1;
  const sub  = Math.floor((seq - 1) / 99 + 1).toString().padStart(2, '0');
  const item = ((seq - 1) % 99 + 1).toString().padStart(2, '0');
  const cod  = `99.${sub}.${item}`;
  codigosUsados.add(cod);
  return cod;
}

// ============================================================
// PROCESSADOR DE IMPORTAÇÃO DE COMPOSIÇÕES (background)
// Fluxo:
//   1. Para cada composição (linha S): upsert em composicoes_catalogo
//   2. Para cada insumo da composição (linha INS):
//      a. Busca em insumos_catalogo pelo código da planilha
//      b. Se não achar: busca por descrição normalizada
//      c. Se ainda não achar: cria o insumo com código 99.XX.XX
//      d. Salva em composicao_insumos com o código do nosso catálogo
// ============================================================
async function processarImportacaoComposicoesBackground(
  jobId: string,
  parsed: ReturnType<typeof parsearAbaCPUs>,
  companyId: number, db: any,
) {
  const job = importJobs.get(jobId)!;
  try {
    // Pré-carrega códigos já usados (composições e insumos) para geração de códigos únicos
    const exComp = await db.select({ codigo: composicoesCatalogo.codigo })
      .from(composicoesCatalogo).where(eq(composicoesCatalogo.companyId, companyId));
    const codigosCompUsados = new Set<string>(exComp.map((r: any) => r.codigo ?? ''));

    const exIns = await db.select({ codigo: insumosCatalogo.codigo })
      .from(insumosCatalogo).where(eq(insumosCatalogo.companyId, companyId));
    const codigosInsUsados = new Set<string>(exIns.map((r: any) => r.codigo ?? ''));

    // Agrupa linhas INS por código de composição (chave = código da planilha)
    const insMap = new Map<string, typeof parsed.linhasInsumos>();
    for (const ins of parsed.linhasInsumos) {
      const arr = insMap.get(ins.composicaoCodigo) ?? [];
      arr.push(ins);
      insMap.set(ins.composicaoCodigo, arr);
    }

    for (const comp of parsed.composicoes) {
      // chaveNorm já vem do parsearAbaCPUs
      let existente: any = null;
      let codigoFinalComp = comp.codigo;

      // 1. Busca composição por código
      if (comp.codigo) {
        const r = await db.select().from(composicoesCatalogo)
          .where(and(eq(composicoesCatalogo.companyId, companyId), eq(composicoesCatalogo.codigo, comp.codigo)))
          .limit(1);
        existente = r[0];
      }
      // 2. Busca composição por chave normalizada
      if (!existente && comp.chaveNorm) {
        const r = await db.select().from(composicoesCatalogo)
          .where(and(eq(composicoesCatalogo.companyId, companyId), eq(composicoesCatalogo.chaveNorm, comp.chaveNorm)))
          .limit(1);
        existente = r[0];
      }

      if (existente) {
        codigoFinalComp = existente.codigo ?? codigoFinalComp;
        await db.update(composicoesCatalogo).set({
          codigo:           comp.codigo || existente.codigo,
          descricao:        comp.descricao,
          unidade:          comp.unidade || existente.unidade,
          tipo:             'CPU',
          custoUnitMat:     comp.custoUnitMat,
          custoUnitMdo:     comp.custoUnitMdo,
          custoUnitTotal:   comp.custoUnitTotal,
          ultimaAtualizacao: new Date().toISOString(),
        }).where(eq(composicoesCatalogo.id, existente.id));
        job.atualizados++;
      } else {
        // Garante código único para a composição
        if (!codigoFinalComp || codigosCompUsados.has(codigoFinalComp)) {
          codigoFinalComp = gerarProximoCodigo99(codigosCompUsados);
        } else {
          codigosCompUsados.add(codigoFinalComp);
        }
        await db.insert(composicoesCatalogo).values({
          companyId,
          codigo:           codigoFinalComp.substring(0, 100),
          descricao:        comp.descricao,
          unidade:          comp.unidade || null,
          tipo:             'CPU',
          custoUnitMat:     comp.custoUnitMat,
          custoUnitMdo:     comp.custoUnitMdo,
          custoUnitTotal:   comp.custoUnitTotal,
          totalOrcamentos:  0,
          chaveNorm:        comp.chaveNorm,
          ultimaAtualizacao: new Date().toISOString(),
          criadoEm:         new Date().toISOString(),
        });
        job.inseridos++;
      }

      // ── Processa os insumos desta composição ─────────────────
      const linhas = insMap.get(comp.codigo) ?? [];

      // Remove insumos anteriores desta composição (reimporta limpo)
      await db.delete(composicaoInsumos).where(
        and(
          eq(composicaoInsumos.companyId, companyId),
          eq(composicaoInsumos.composicaoCodigo, codigoFinalComp),
        )
      );

      for (const ins of linhas) {
        const codigoPlnilha = ins.insumoCodigo?.trim() ?? '';
        const descricaoIns  = ins.insumoDescricao?.trim() ?? '';
        const chaveIns      = (descricaoIns.toLowerCase().replace(/[^a-z0-9]/g, '')).substring(0, 500);
        let codigoInsumo    = '';

        // a. Busca por código na planilha
        if (codigoPlnilha) {
          const r = await db.select({ codigo: insumosCatalogo.codigo })
            .from(insumosCatalogo)
            .where(and(eq(insumosCatalogo.companyId, companyId), eq(insumosCatalogo.codigo, codigoPlnilha)))
            .limit(1);
          if (r[0]) codigoInsumo = r[0].codigo;
        }

        // b. Busca por descrição normalizada
        if (!codigoInsumo && chaveIns) {
          const r = await db.select({ codigo: insumosCatalogo.codigo })
            .from(insumosCatalogo)
            .where(and(eq(insumosCatalogo.companyId, companyId), eq(insumosCatalogo.chaveNorm, chaveIns)))
            .limit(1);
          if (r[0]) codigoInsumo = r[0].codigo;
        }

        // c. Não encontrou: cria insumo novo com código 99.XX.XX
        if (!codigoInsumo) {
          codigoInsumo = gerarProximoCodigo99(codigosInsUsados);
          const precoIns = toNum(ins.precoUnitario);
          await db.insert(insumosCatalogo).values({
            companyId,
            codigo:            codigoInsumo,
            descricao:         descricaoIns.substring(0, 1000) || `Insumo importado ${codigoPlnilha}`,
            unidade:           (ins.unidade ?? '').substring(0, 30) || null,
            tipo:              null,
            precoUnitario:     fix4(precoIns),
            precoMin:          fix4(precoIns),
            precoMax:          fix4(precoIns),
            precoMedio:        fix4(precoIns),
            totalOrcamentos:   0,
            totalQuantidade:   fix4(toNum(ins.quantidade)),
            chaveNorm:         chaveIns,
            ultimaAtualizacao: new Date().toISOString(),
            criadoEm:          new Date().toISOString(),
          });
        }

        // d. Insere na composicao_insumos com código do nosso catálogo
        await db.insert(composicaoInsumos).values({
          companyId,
          composicaoCodigo: codigoFinalComp,
          insumoCodigo:     codigoInsumo,
          insumoDescricao:  descricaoIns.substring(0, 1000) || null,
          unidade:          (ins.unidade ?? '').substring(0, 30) || null,
          quantidade:       fix6(toNum(ins.quantidade)),
          precoUnitario:    fix4(toNum(ins.precoUnitario)),
          alocacaoMat:      fix6(toNum(ins.alocacaoMat)),
          alocacaoMdo:      fix6(toNum(ins.alocacaoMdo)),
          custoUnitTotal:   fix6(toNum(ins.custoUnitTotal)),
        });
      }

      job.done++;
    }
    job.status = 'done';
  } catch (err: any) {
    job.status = 'error';
    job.error = err?.message ?? 'Erro desconhecido';
  }
}

// ============================================================
// ROUTER
// ============================================================

export const orcamentoRouter = router({

  // ── Listar orçamentos da empresa ──────────────────────────
  list: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId:    z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [
        eq(orcamentos.companyId, input.companyId),
        isNull(orcamentos.deletedAt),
      ];
      if (input.obraId) conditions.push(eq(orcamentos.obraId, input.obraId));
      return db.select().from(orcamentos).where(and(...conditions)).orderBy(desc(orcamentos.createdAt));
    }),

  // ── Buscar orçamento por ID com itens / insumos / BDI ─────
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [orc] = await db.select().from(orcamentos).where(eq(orcamentos.id, input.id));
      if (!orc) return null;
      const [itens, insumos, bdiLinhas] = await Promise.all([
        db.select().from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, input.id)).orderBy(orcamentoItens.ordem),
        db.select().from(orcamentoInsumos).where(eq(orcamentoInsumos.orcamentoId, input.id)).orderBy(orcamentoInsumos.percentualTotal),
        db.select().from(orcamentoBdi).where(eq(orcamentoBdi.orcamentoId, input.id)).orderBy(orcamentoBdi.ordem),
      ]);
      // Buscar obra e empresa em paralelo
      const [obraRes, empresaRes] = await Promise.all([
        orc.obraId
          ? db.select().from(obras).where(eq(obras.id, orc.obraId)).then(r => r[0] ?? null)
          : Promise.resolve(null),
        db.select({
          id:          companies.id,
          razaoSocial: companies.razaoSocial,
          nomeFantasia: companies.nomeFantasia,
          cnpj:        companies.cnpj,
          cidade:      companies.cidade,
          estado:      companies.estado,
          telefone:    companies.telefone,
          logoUrl:     companies.logoUrl,
        }).from(companies).where(eq(companies.id, orc.companyId)).then(r => r[0] ?? null),
      ]);
      return { ...orc, itens, insumos, bdiLinhas, obra: obraRes, empresa: empresaRes };
    }),

  // ── Importar planilha Excel (base64) ──────────────────────
  importar: protectedProcedure
    .input(z.object({
      companyId:      z.number(),
      obraId:         z.number().optional(),
      fileBase64:     z.string().min(10),
      fileName:       z.string(),
      metaPercentual: z.number().min(0).max(0.99).default(0.2),
      userName:       z.string(),
    }))
    .mutation(async ({ input }) => {
      const XLSX = await import('xlsx');

      // Decodificar base64
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const wb = XLSX.read(buffer, { type: 'buffer' });

      // Localizar abas obrigatórias
      const orcTab = wb.SheetNames.find(n =>
        n.toLowerCase().replace(/[^a-z]/g, '').startsWith('or') ||
        n.toLowerCase().includes('orcamento') ||
        n.toLowerCase().includes('orçamento')
      );
      const bdiTab = wb.SheetNames.find(n => n.toLowerCase() === 'bdi');

      if (!orcTab) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aba "Orçamento" não encontrada. A planilha deve ter uma aba chamada "Orçamento".' });

      const dataOrc = XLSX.utils.sheet_to_json(wb.Sheets[orcTab], { header: 1, defval: '' }) as any[][];
      const dataBdi = bdiTab ? (XLSX.utils.sheet_to_json(wb.Sheets[bdiTab], { header: 1, defval: '' }) as any[][]) : [];

      // Metadados
      const meta = extrairMetadados(dataOrc);

      // BDI primeiro — necessário para calcular venda dos itens
      const { bdiPercentual, linhas: bdiLinhas } = parsearAbaBdi(dataBdi, input.companyId);

      // Itens da EAP — venda calculada via Custo × (1 + BDI%)
      const itens = parsearAbaCorcamento(dataOrc, input.metaPercentual, bdiPercentual);
      if (itens.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum item encontrado na planilha.' });

      // Insumos (aba "Insumos" se existir)
      const insumosTab = wb.SheetNames.find(n => n.toLowerCase() === 'insumos');
      const insumosItens = insumosTab
        ? parsearAbaInsumos(XLSX.utils.sheet_to_json(wb.Sheets[insumosTab], { header: 1, defval: '' }) as any[][], input.companyId)
        : [];

      // CPUs — Composições de Preços Unitários (aba "CPUs" se existir)
      const cpusTab = wb.SheetNames.find(n => n === 'CPUs' || n === 'Cpus' || n.toLowerCase() === 'cpus');
      const cpusParsed = cpusTab
        ? parsearAbaCPUs(XLSX.utils.sheet_to_json(wb.Sheets[cpusTab], { header: 1, defval: '' }) as any[][], input.companyId)
        : { composicoes: [], linhasInsumos: [] };

      // Totais: lê a linha "TOTAIS GERAIS" da planilha (precisão total, sem arredondamento intermediário).
      // Fallback para somas das folhas apenas se a linha não existir.
      const totaisGerais  = extrairTotaisPlanilha(dataOrc);
      const nivel1        = itens.filter(i => i.nivel === 1);
      const totalVenda    = nivel1.reduce((s, i) => s + parseFloat(i.vendaTotal),    0);
      const totalCusto    = totaisGerais?.totalCusto  ?? nivel1.reduce((s, i) => s + parseFloat(i.custoTotal),    0);
      const totalMateriais = totaisGerais?.totalMat   ?? nivel1.reduce((s, i) => s + parseFloat(i.custoTotalMat), 0);
      const totalMdo      = totaisGerais?.totalMdo    ?? nivel1.reduce((s, i) => s + parseFloat(i.custoTotalMdo),  0);
      const totalMeta     = totalCusto * (1 - input.metaPercentual);

      const codigo = input.fileName.replace(/\.[^/.]+$/, '').substring(0, 100);

      // Salvar no banco
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco de dados não disponível.' });

      const res = await db.insert(orcamentos).values({
        companyId:       input.companyId,
        obraId:          input.obraId || null,
        codigo,
        descricao:       meta.obra || codigo,
        revisao:         meta.revisao,
        cliente:         meta.cliente,
        local:           meta.local,
        dataBase:        '',
        tempoObraMeses:  meta.tempoObraMeses || null,
        areaIntervencao: meta.areaIntervencao > 0 ? fix2(meta.areaIntervencao) : null,
        bdiPercentual:   fix4(bdiPercentual),
        metaPercentual:  fix4(input.metaPercentual),
        totalVenda:      fix2(totalVenda),
        totalCusto:      fix2(totalCusto),
        totalMeta:       fix2(totalMeta),
        totalMateriais:  fix2(totalMateriais),
        totalMdo:        fix2(totalMdo),
        totalEquipamentos: '0.00',
        status:          'rascunho',
        importadoPor:    input.userName,
        importadoEm:     new Date().toISOString(),
      }).returning();

      const orcamentoId = res[0].id;

      // Inserir itens em lotes
      const BATCH = 200;
      for (let i = 0; i < itens.length; i += BATCH) {
        await db.insert(orcamentoItens).values(
          itens.slice(i, i + BATCH).map(it => ({ ...it, orcamentoId, companyId: input.companyId }))
        );
      }

      // Inserir insumos em lotes
      for (let i = 0; i < insumosItens.length; i += BATCH) {
        await db.insert(orcamentoInsumos).values(
          insumosItens.slice(i, i + BATCH).map(it => ({ ...it, orcamentoId }))
        );
      }

      // Inserir BDI
      if (bdiLinhas.length > 0) {
        for (let i = 0; i < bdiLinhas.length; i += BATCH) {
          await db.insert(orcamentoBdi).values(
            bdiLinhas.slice(i, i + BATCH).map(b => ({ ...b, orcamentoId }))
          );
        }
      }

      // CPUs: upsert composições e seus insumos no catálogo global da empresa
      if (cpusParsed.composicoes.length > 0) {
        // 1) Apagar as composições anteriores desta empresa (reimporta limpo)
        await db.delete(composicoesCatalogo).where(eq(composicoesCatalogo.companyId, input.companyId));
        await db.delete(composicaoInsumos).where(eq(composicaoInsumos.companyId, input.companyId));

        // 2) Inserir composições
        for (let i = 0; i < cpusParsed.composicoes.length; i += BATCH) {
          await db.insert(composicoesCatalogo).values(
            cpusParsed.composicoes.slice(i, i + BATCH).map(c => ({
              ...c,
              totalOrcamentos: 1,
              ultimaAtualizacao: new Date().toISOString(),
              criadoEm: new Date().toISOString(),
            }))
          );
        }

        // 3) Inserir insumos de cada composição
        for (let i = 0; i < cpusParsed.linhasInsumos.length; i += BATCH) {
          await db.insert(composicaoInsumos).values(
            cpusParsed.linhasInsumos.slice(i, i + BATCH)
          );
        }
      }

      // Catálogo NÃO é atualizado automaticamente — usuário decide via "Enviar para Biblioteca"
      return {
        id: orcamentoId, codigo, totalVenda, totalCusto, totalMeta,
        itemCount: itens.length,
        composicoesCount: cpusParsed.composicoes.length,
      };
    }),

  // ── Atualizar percentual Meta (admin_master) ──────────────
  updateMeta: protectedProcedure
    .input(z.object({
      id:              z.number(),
      metaPercentual:  z.number().min(0).max(0.9999),
      totalMetaExato:  z.number().optional(), // R$ exato digitado pelo usuário — prioridade sobre o % arredondado
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });

      const [orc] = await db.select().from(orcamentos).where(eq(orcamentos.id, input.id));
      if (!orc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Orçamento não encontrado.' });
      if (orc.status === 'fechado') throw new TRPCError({ code: 'FORBIDDEN', message: 'Orçamento fechado não pode ser alterado.' });

      const totalCusto = parseFloat(orc.totalCusto || '0');
      // Se o usuário digitou R$ exato, usa direto. Caso contrário, deriva do %.
      const totalMeta  = input.totalMetaExato != null
        ? input.totalMetaExato
        : totalCusto * (1 - input.metaPercentual);

      await db.update(orcamentos).set({
        metaPercentual:    fix4(input.metaPercentual),
        totalMeta:         fix2(totalMeta),
        metaAprovadaPor:   ctx.user?.username ?? null,
        metaAprovadaEm:    new Date().toISOString(),
        metaAprovadaUserId: ctx.user?.id ?? null,
        status:            'aprovado',
      }).where(eq(orcamentos.id, input.id));

      // Atualizar metaTotal de todos os itens
      const itens = await db.select().from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, input.id));
      for (let i = 0; i < itens.length; i += 500) {
        const batch = itens.slice(i, i + 500);
        for (const item of batch) {
          const custo    = parseFloat(item.custoTotal || '0');
          const meta     = custo * (1 - input.metaPercentual);
          const qtd      = parseFloat(item.quantidade || '0');
          const metaUnit = qtd > 0 ? meta / qtd : 0;
          await db.update(orcamentoItens).set({
            metaTotal:     fix2(meta),
            metaUnitTotal: fix4(metaUnit),
          }).where(eq(orcamentoItens.id, item.id));
        }
      }

      return { success: true };
    }),

  // ── Re-importar planilha ORC (atualizar itens mantendo o orçamento) ──
  reimportar: protectedProcedure
    .input(z.object({
      orcamentoId:    z.number(),
      companyId:      z.number(),
      fileBase64:     z.string().min(10),
      fileName:       z.string(),
      userName:       z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });

      const [orc] = await db.select().from(orcamentos).where(eq(orcamentos.id, input.orcamentoId));
      if (!orc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Orçamento não encontrado.' });
      if (Number(orc.companyId) !== Number(input.companyId)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão.' });

      const XLSX = await import('xlsx');
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const wb = XLSX.read(buffer, { type: 'buffer' });

      // Localizar aba de orçamento
      const orcTab = wb.SheetNames.find(n =>
        n.toLowerCase().replace(/[^a-z]/g, '').startsWith('or') ||
        n.toLowerCase().includes('orcamento') ||
        n.toLowerCase().includes('orçamento')
      );
      const bdiTab = wb.SheetNames.find(n => n.toLowerCase() === 'bdi');

      if (!orcTab) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aba "Orçamento" não encontrada na planilha.' });

      const dataOrc = XLSX.utils.sheet_to_json(wb.Sheets[orcTab], { header: 1, defval: '' }) as any[][];
      const dataBdi = bdiTab ? (XLSX.utils.sheet_to_json(wb.Sheets[bdiTab], { header: 1, defval: '' }) as any[][]) : [];

      // BDI e itens
      const metaPerc = parseFloat(orc.metaPercentual || '0.2');
      const { bdiPercentual, linhas: bdiLinhas } = parsearAbaBdi(dataBdi, input.companyId);
      const bdiFinal = bdiPercentual > 0 ? bdiPercentual : parseFloat(orc.bdiPercentual || '0');

      const itens = parsearAbaCorcamento(dataOrc, metaPerc, bdiFinal);
      if (itens.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum item encontrado na planilha.' });

      // Insumos opcionais
      const insumosTab = wb.SheetNames.find(n => n.toLowerCase() === 'insumos');
      const insumosItens = insumosTab
        ? parsearAbaInsumos(XLSX.utils.sheet_to_json(wb.Sheets[insumosTab], { header: 1, defval: '' }) as any[][], input.companyId)
        : [];

      // Totais: lê a linha "TOTAIS GERAIS" da planilha (precisão total, sem arredondamento intermediário).
      const totaisGerais  = extrairTotaisPlanilha(dataOrc);
      const nivel1        = itens.filter(i => i.nivel === 1);
      const totalVenda    = nivel1.reduce((s, i) => s + parseFloat(i.vendaTotal), 0);
      const totalCusto    = totaisGerais?.totalCusto  ?? nivel1.reduce((s, i) => s + parseFloat(i.custoTotal),    0);
      const totalMateriais = totaisGerais?.totalMat   ?? nivel1.reduce((s, i) => s + parseFloat(i.custoTotalMat), 0);
      const totalMdo      = totaisGerais?.totalMdo    ?? nivel1.reduce((s, i) => s + parseFloat(i.custoTotalMdo),  0);
      const totalMeta     = totalCusto * (1 - metaPerc);

      // Apagar dados antigos
      await db.delete(orcamentoItens).where(eq(orcamentoItens.orcamentoId, input.orcamentoId));
      await db.delete(orcamentoInsumos).where(eq(orcamentoInsumos.orcamentoId, input.orcamentoId));
      if (bdiLinhas.length > 0) {
        await db.delete(orcamentoBdi).where(eq(orcamentoBdi.orcamentoId, input.orcamentoId));
      }

      // Inserir novos dados em lotes
      const BATCH = 200;
      for (let i = 0; i < itens.length; i += BATCH) {
        await db.insert(orcamentoItens).values(
          itens.slice(i, i + BATCH).map(it => ({ ...it, orcamentoId: input.orcamentoId, companyId: input.companyId }))
        );
      }
      for (let i = 0; i < insumosItens.length; i += BATCH) {
        await db.insert(orcamentoInsumos).values(
          insumosItens.slice(i, i + BATCH).map(it => ({ ...it, orcamentoId: input.orcamentoId }))
        );
      }
      if (bdiLinhas.length > 0) {
        for (let i = 0; i < bdiLinhas.length; i += BATCH) {
          await db.insert(orcamentoBdi).values(
            bdiLinhas.slice(i, i + BATCH).map(b => ({ ...b, orcamentoId: input.orcamentoId }))
          );
        }
      }

      // Atualizar totais do orçamento (mantendo codigo/metadados existentes)
      await db.update(orcamentos).set({
        bdiPercentual:  fix4(bdiFinal),
        totalVenda:     fix2(totalVenda),
        totalCusto:     fix2(totalCusto),
        totalMeta:      fix2(totalMeta),
        totalMateriais: fix2(totalMateriais),
        totalMdo:       fix2(totalMdo),
        importadoPor:   input.userName,
        importadoEm:    new Date().toISOString(),
        updatedAt:      new Date().toISOString(),
      }).where(eq(orcamentos.id, input.orcamentoId));

      // Catálogo NÃO é atualizado automaticamente — usuário decide via "Enviar para Biblioteca"

      return {
        success: true,
        itemCount:    itens.length,
        insumosCount: insumosItens.length,
        totalCusto,
        totalVenda,
        bdiPercentual: bdiFinal,
      };
    }),

  // ── Editar metadados ──────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id:            z.number(),
      codigo:        z.string().min(1).max(100),
      descricao:     z.string().max(500).optional(),
      cliente:       z.string().max(255).optional(),
      local:         z.string().max(255).optional(),
      revisao:       z.string().max(20).optional(),
      dataBase:      z.string().max(20).optional(),
      obraId:        z.number().nullable().optional(),
      tempoObraMeses: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      const [orc] = await db.select().from(orcamentos).where(eq(orcamentos.id, input.id));
      if (!orc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Orçamento não encontrado.' });
      if (orc.status === 'fechado') throw new TRPCError({ code: 'FORBIDDEN', message: 'Orçamento fechado não pode ser alterado.' });
      await db.update(orcamentos).set({
        codigo:        input.codigo,
        descricao:     input.descricao ?? orc.descricao,
        cliente:       input.cliente ?? orc.cliente,
        local:         input.local ?? orc.local,
        revisao:       input.revisao ?? orc.revisao,
        dataBase:      input.dataBase ?? orc.dataBase,
        obraId:        input.obraId !== undefined ? input.obraId : orc.obraId,
        tempoObraMeses: input.tempoObraMeses !== undefined ? input.tempoObraMeses : orc.tempoObraMeses,
        updatedAt:     new Date().toISOString(),
      }).where(eq(orcamentos.id, input.id));
      return { success: true };
    }),

  // ── Alterar status ────────────────────────────────────────
  updateStatus: protectedProcedure
    .input(z.object({
      id:     z.number(),
      status: z.enum(['rascunho', 'aguardando_aprovacao', 'aprovado', 'fechado']),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      const [orc] = await db.select().from(orcamentos).where(eq(orcamentos.id, input.id));
      if (!orc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Orçamento não encontrado.' });
      if (orc.status === 'fechado' && input.status !== 'fechado') throw new TRPCError({ code: 'FORBIDDEN', message: 'Orçamento base fechado não pode ser reaberto.' });
      await db.update(orcamentos).set({ status: input.status }).where(eq(orcamentos.id, input.id));
      return { success: true };
    }),

  // ── Importar BDI separadamente para um orçamento existente ──
  importarBdi: protectedProcedure
    .input(z.object({
      companyId:   z.number(),
      orcamentoId: z.number(),
      fileBase64:  z.string(),
      fileName:    z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });

      const [orc] = await db.select().from(orcamentos).where(eq(orcamentos.id, input.orcamentoId));
      if (!orc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Orçamento não encontrado.' });
      if (Number(orc.companyId) !== Number(input.companyId)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão.' });

      const XLSX = await import('xlsx');
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const wb = XLSX.read(buffer, { type: 'buffer' });

      // ── Processar TODAS as abas da planilha BDI ─────────────────
      // A aba principal de BDI é identificada pelo nome que contém "bdi".
      // As demais abas (Resumo, Composição, Lucratividade, etc.) são
      // importadas com o mesmo parser e armazenadas com o nomeAba original.
      const todasLinhas: any[] = [];
      let bdiPercentual = 0;
      const abas = wb.SheetNames;

      // Abas que não são EAP nem insumos — ignorar apenas aba de orçamento principal
      const abasIgnorar = ['orçamento', 'orcamento', 'orc', 'insumos', 'abc', 'resumo geral'];

      for (const aba of abas) {
        const nomeLower = aba.toLowerCase();
        if (abasIgnorar.some(k => nomeLower === k)) continue;

        const rows = XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, defval: '' }) as any[][];
        const { bdiPercentual: bdiAba, linhas } = parsearAbaBdi(rows, input.companyId, aba);

        if (linhas.length > 0) {
          todasLinhas.push(...linhas);
          // O BDI total é extraído preferencialmente da aba que contém "bdi" no nome
          if (!bdiPercentual && bdiAba > 0 && nomeLower.includes('bdi')) {
            bdiPercentual = bdiAba;
          }
          if (!bdiPercentual && bdiAba > 0) {
            bdiPercentual = bdiAba;
          }
        }
      }

      if (!todasLinhas.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhuma linha encontrada nas abas da planilha.' });
      }

      // Limpar BDI anterior e inserir tudo novo
      await db.delete(orcamentoBdi).where(eq(orcamentoBdi.orcamentoId, input.orcamentoId));

      const BATCH = 500;
      for (let i = 0; i < todasLinhas.length; i += BATCH) {
        await db.insert(orcamentoBdi).values(
          todasLinhas.slice(i, i + BATCH).map(b => ({ ...b, orcamentoId: input.orcamentoId }))
        );
      }

      // Recalcular Venda de todos os itens: Venda = Custo × (1 + BDI%)
      if (bdiPercentual > 0) {
        const itens = await db.select().from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, input.orcamentoId));

        for (let i = 0; i < itens.length; i += BATCH) {
          const batch = itens.slice(i, i + BATCH);
          for (const item of batch) {
            const custo     = parseFloat(item.custoTotal     || '0');
            const custoUnit = parseFloat(item.custoUnitTotal || '0');
            const venda     = custo     * (1 + bdiPercentual);
            const vendaUnit = custoUnit * (1 + bdiPercentual);
            await db.update(orcamentoItens).set({
              vendaTotal:     fix2(venda),
              vendaUnitTotal: fix4(vendaUnit),
            }).where(eq(orcamentoItens.id, item.id));
          }
        }

        // Atualizar totais do orçamento
        const nivel1     = itens.filter(i => i.nivel === 1);
        const totalVenda = nivel1.reduce((s, i) => s + parseFloat(i.custoTotal || '0') * (1 + bdiPercentual), 0);

        await db.update(orcamentos).set({
          bdiPercentual: fix6(bdiPercentual),
          totalVenda:    fix2(totalVenda),
        }).where(eq(orcamentos.id, input.orcamentoId));
      }

      const abasImportadas = [...new Set(todasLinhas.map(l => l.nomeAba))];

      return {
        success: true,
        linhasCount:    todasLinhas.length,
        bdiPercentual,
        abasImportadas,
      };
    }),

  // ── Atualizar percentual de linha BDI ─────────────────────
  updateBdiLinha: protectedProcedure
    .input(z.object({
      id:         z.number(),
      percentual: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      await db.update(orcamentoBdi)
        .set({ percentual: fix6(input.percentual) })
        .where(eq(orcamentoBdi.id, input.id));
      return { success: true };
    }),

  // ── Aplicar BDI% a todos os itens do orçamento ────────────
  aplicarBdi: protectedProcedure
    .input(z.object({
      orcamentoId:   z.number(),
      bdiPercentual: z.number(),   // decimal fraction: 0.2456 = 24.56%
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });

      const bdi   = input.bdiPercentual;
      const itens = await db.select().from(orcamentoItens)
        .where(eq(orcamentoItens.orcamentoId, input.orcamentoId));

      const BATCH = 500;
      for (let i = 0; i < itens.length; i += BATCH) {
        for (const item of itens.slice(i, i + BATCH)) {
          const custo     = parseFloat(item.custoTotal     || '0');
          const custoUnit = parseFloat(item.custoUnitTotal || '0');
          await db.update(orcamentoItens).set({
            vendaTotal:     fix2(custo     * (1 + bdi)),
            vendaUnitTotal: fix4(custoUnit * (1 + bdi)),
          }).where(eq(orcamentoItens.id, item.id));
        }
      }

      const nivel1     = itens.filter(i => i.nivel === 1);
      const totalVenda = nivel1.reduce((s, i) => s + parseFloat(i.custoTotal || '0') * (1 + bdi), 0);

      await db.update(orcamentos).set({
        bdiPercentual: fix6(bdi),
        totalVenda:    fix2(totalVenda),
      }).where(eq(orcamentos.id, input.orcamentoId));

      return { success: true, totalVenda, bdiPercentual: bdi };
    }),

  // ── Deletar (soft delete) ─────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      const [orc] = await db.select().from(orcamentos).where(eq(orcamentos.id, input.id));
      if (!orc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Orçamento não encontrado.' });
      if (orc.status === 'fechado') throw new TRPCError({ code: 'FORBIDDEN', message: 'Orçamento fechado não pode ser excluído.' });
      await db.update(orcamentos).set({ deletedAt: new Date().toISOString() }).where(eq(orcamentos.id, input.id));
      return { success: true };
    }),

  // ── Preview: o que será enviado à biblioteca ────────────────
  previewBiblioteca: protectedProcedure
    .input(z.object({ orcamentoId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const todosItens = await db.select().from(orcamentoItens)
        .where(eq(orcamentoItens.orcamentoId, input.orcamentoId))
        .orderBy(orcamentoItens.ordem);

      const isGroup = new Set<string>();
      todosItens.forEach((item, idx) => {
        if (idx + 1 < todosItens.length && (todosItens[idx + 1].nivel ?? 0) > (item.nivel ?? 0))
          isGroup.add(item.eapCodigo ?? '');
      });
      const folhas = todosItens.filter(i => (i.nivel ?? 0) >= 2 && !isGroup.has(i.eapCodigo ?? '') && i.descricao?.trim());

      const catalogComp = await db.select().from(composicoesCatalogo)
        .where(eq(composicoesCatalogo.companyId, input.companyId));
      const catalogIns  = await db.select().from(insumosCatalogo)
        .where(eq(insumosCatalogo.companyId, input.companyId));

      const compCodigoMap = new Map(catalogComp.filter(c => c.codigo).map(c => [c.codigo!, c]));
      const compChaveMap  = new Map(catalogComp.map(c => [c.chaveNorm, c]));
      const insCodigoMap  = new Map(catalogIns.filter(i => i.codigo).map(i => [i.codigo!, i]));
      const insChaveMap   = new Map(catalogIns.map(i => [i.chaveNorm, i]));

      const composicoes: any[] = folhas.map(item => {
        const chave  = normalizarTexto(item.descricao ?? '');
        const byCod  = (item as any).servicoCodigo?.trim() ? compCodigoMap.get((item as any).servicoCodigo.trim()) : null;
        const byChave = compChaveMap.get(chave);
        if (byCod || byChave) return { ...item, status: 'atualizado', similar: null };
        let maxSim = 0, simEntry: any = null;
        for (const c of catalogComp) {
          const s = jaccard(chave, c.chaveNorm);
          if (s > maxSim) { maxSim = s; simEntry = c; }
        }
        if (maxSim >= SIMILAR_THRESHOLD) return { ...item, status: 'similar', similar: { ...simEntry, similaridade: maxSim } };
        return { ...item, status: 'novo', similar: null };
      });

      const orcIns = await db.select().from(orcamentoInsumos)
        .where(eq(orcamentoInsumos.orcamentoId, input.orcamentoId));

      const insumosRes: any[] = orcIns.map(ins => {
        const chave  = normalizarTexto(ins.descricao ?? '');
        const byCod  = ins.codigo?.trim() ? insCodigoMap.get(ins.codigo.trim()) : null;
        const byChave = insChaveMap.get(chave);
        if (byCod || byChave) return { ...ins, status: 'atualizado', similar: null };
        let maxSim = 0, simEntry: any = null;
        for (const c of catalogIns) {
          const s = jaccard(chave, c.chaveNorm);
          if (s > maxSim) { maxSim = s; simEntry = c; }
        }
        if (maxSim >= SIMILAR_THRESHOLD) return { ...ins, status: 'similar', similar: { ...simEntry, similaridade: maxSim } };
        return { ...ins, status: 'novo', similar: null };
      });

      const cnt = (arr: any[], st: string) => arr.filter(x => x.status === st).length;
      return {
        composicoes,
        insumos: insumosRes,
        totais: {
          comp: { novo: cnt(composicoes,'novo'), atualizado: cnt(composicoes,'atualizado'), similar: cnt(composicoes,'similar') },
          ins:  { novo: cnt(insumosRes,'novo'), atualizado: cnt(insumosRes,'atualizado'), similar: cnt(insumosRes,'similar') },
        },
      };
    }),

  // ── Enviar à biblioteca (usuário confirma) ───────────────────
  enviarParaBiblioteca: protectedProcedure
    .input(z.object({ orcamentoId: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const todosItens = await db.select().from(orcamentoItens)
        .where(eq(orcamentoItens.orcamentoId, input.orcamentoId))
        .orderBy(orcamentoItens.ordem);

      const isGroup = new Set<string>();
      todosItens.forEach((item, idx) => {
        if (idx + 1 < todosItens.length && (todosItens[idx + 1].nivel ?? 0) > (item.nivel ?? 0))
          isGroup.add(item.eapCodigo ?? '');
      });
      const folhas = todosItens.filter(i => (i.nivel ?? 0) >= 2 && !isGroup.has(i.eapCodigo ?? ''));
      const orcIns = await db.select().from(orcamentoInsumos)
        .where(eq(orcamentoInsumos.orcamentoId, input.orcamentoId));

      await atualizarCatalogo(db, input.companyId,
        folhas.map(i => ({
          nivel: i.nivel, descricao: i.descricao ?? '', unidade: i.unidade ?? '',
          tipo: i.tipo ?? '', servicoCodigo: (i as any).servicoCodigo ?? '',
          custoUnitMat: i.custoUnitMat ?? '0', custoUnitMdo: i.custoUnitMdo ?? '0',
          custoUnitTotal: i.custoUnitTotal ?? '0',
        })),
        orcIns.map(i => ({
          codigo: i.codigo ?? '', descricao: i.descricao ?? '', unidade: i.unidade ?? '',
          tipo: i.tipo ?? '', precoUnitComEncargos: i.precoUnitComEncargos ?? '0',
          precoUnitBase: i.precoUnitBase ?? '0', quantidadeTotal: i.quantidadeTotal ?? '0',
        })),
      );

      return { success: true, composicoes: folhas.length, insumos: orcIns.length };
    }),

  // ── Biblioteca: listar catálogos ─────────────────────────────
  listarInsumosCatalogo: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // Calcula totalOrcamentos dinamicamente via subquery
      return db.select({
        id:              insumosCatalogo.id,
        companyId:       insumosCatalogo.companyId,
        codigo:          insumosCatalogo.codigo,
        descricao:       insumosCatalogo.descricao,
        unidade:         insumosCatalogo.unidade,
        tipo:            insumosCatalogo.tipo,
        precoUnitario:   insumosCatalogo.precoUnitario,
        precoMin:        insumosCatalogo.precoMin,
        precoMax:        insumosCatalogo.precoMax,
        precoMedio:      insumosCatalogo.precoMedio,
        totalQuantidade: insumosCatalogo.totalQuantidade,
        ultimaAtualizacao: insumosCatalogo.ultimaAtualizacao,
        criadoEm:        insumosCatalogo.criadoEm,
        totalOrcamentos: sql<number>`(
          SELECT COUNT(DISTINCT oi."orcamentoId")
          FROM orcamento_insumos oi
          WHERE oi.codigo = ${insumosCatalogo.codigo}
        )`.as('totalOrcamentos'),
      })
        .from(insumosCatalogo)
        .where(eq(insumosCatalogo.companyId, input.companyId))
        .orderBy(insumosCatalogo.tipo, insumosCatalogo.codigo)
        .limit(10000);
    }),

  // ── CRUD de grupos/categorias de insumos ─────────────────────
  listarGruposInsumos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(insumosGrupos)
        .where(eq(insumosGrupos.companyId, input.companyId))
        .orderBy(insumosGrupos.nome);
    }),

  salvarGrupoInsumo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id:   z.number().optional(),
      nome: z.string().min(1).max(150),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      const nome = input.nome.trim();
      if (input.id) {
        // Renomear também nos insumos existentes
        await db.update(insumosCatalogo).set({ tipo: nome })
          .where(and(
            eq(insumosCatalogo.companyId, input.companyId),
            eq(insumosCatalogo.tipo as any, (
              await db.select({ nome: insumosGrupos.nome }).from(insumosGrupos)
                .where(eq(insumosGrupos.id, input.id!)).limit(1)
            )[0]?.nome ?? '')
          ));
        await db.update(insumosGrupos).set({ nome })
          .where(and(eq(insumosGrupos.id, input.id), eq(insumosGrupos.companyId, input.companyId)));
      } else {
        await db.insert(insumosGrupos).values({ companyId: input.companyId, nome });
      }
      return { ok: true };
    }),

  excluirGrupoInsumo: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      await db.delete(insumosGrupos)
        .where(and(eq(insumosGrupos.id, input.id), eq(insumosGrupos.companyId, input.companyId)));
      return { ok: true };
    }),

  // ── Gerar próximo código único para insumo manual ────────────
  // Reserva o espaço 99.XX.XX para insumos criados manualmente
  gerarCodigoInsumo: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return '99.00.01';
      const rows = await db.select({ codigo: insumosCatalogo.codigo })
        .from(insumosCatalogo)
        .where(eq(insumosCatalogo.companyId, input.companyId));
      // Filtra códigos no padrão 99.XX.XX
      const manual = rows
        .map(r => r.codigo ?? '')
        .filter(c => /^99\.\d{2}\.\d{2}$/.test(c))
        .map(c => {
          const parts = c.split('.');
          return parseInt(parts[1]) * 100 + parseInt(parts[2]);
        })
        .sort((a, b) => b - a);
      const next = (manual[0] ?? 0) + 1;
      const sub  = Math.floor(next / 100).toString().padStart(2, '0');
      const item = (next % 100 === 0 ? 1 : next % 100).toString().padStart(2, '0');
      // Gera formato nn.nn.nn sempre único
      const seq = manual.length > 0 ? manual[0] + 1 : 1;
      const sub2  = Math.floor((seq - 1) / 99 + 1).toString().padStart(2, '0');
      const item2 = ((seq - 1) % 99 + 1).toString().padStart(2, '0');
      return `99.${sub2}.${item2}`;
    }),

  // ── Salvar insumo (criar ou editar) ─────────────────────────
  salvarInsumo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id:        z.number().optional(),
      codigo:    z.string().max(100),
      descricao: z.string().min(1).max(1000),
      unidade:   z.string().max(30).optional().default(''),
      tipo:      z.string().max(100).optional().default(''),
      precoUnitario: z.string().optional().default('0'),
      precoMin:      z.string().optional().default('0'),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      const chave = normalizarTexto(input.descricao);
      const preco = parseFloat(input.precoUnitario || '0');

      if (input.id) {
        // Atualizar existente
        const novoCodigoTrimmed = input.codigo.trim();
        const novaDescricao     = input.descricao.trim();
        const novaUnidade       = (input.unidade ?? '').trim() || null;
        await db.update(insumosCatalogo).set({
          codigo:            novoCodigoTrimmed,
          descricao:         novaDescricao,
          unidade:           novaUnidade,
          tipo:              (input.tipo ?? '').trim() || null,
          precoUnitario:     fix4(preco),
          precoMin:          fix4(parseFloat(input.precoMin || '0')),
          precoMedio:        fix4(preco),
          chaveNorm:         chave,
          ultimaAtualizacao: new Date().toISOString(),
        }).where(and(eq(insumosCatalogo.id, input.id), eq(insumosCatalogo.companyId, input.companyId)));

        // Propaga preço atualizado para todas as composições que usam este insumo
        await propagarPrecoInsumo(db, input.companyId, novoCodigoTrimmed, preco, novaDescricao, novaUnidade);
      } else {
        // Verificar se código já existe
        const existing = await db.select({ id: insumosCatalogo.id })
          .from(insumosCatalogo)
          .where(and(eq(insumosCatalogo.companyId, input.companyId), eq(insumosCatalogo.codigo, input.codigo.trim())))
          .limit(1);
        if (existing.length > 0) throw new TRPCError({ code: 'CONFLICT', message: `Código "${input.codigo}" já existe.` });
        await db.insert(insumosCatalogo).values({
          companyId:         input.companyId,
          codigo:            input.codigo.trim(),
          descricao:         input.descricao.trim(),
          unidade:           (input.unidade ?? '').trim() || null,
          tipo:              (input.tipo ?? '').trim() || null,
          precoUnitario:     fix4(preco),
          precoMin:          fix4(parseFloat(input.precoMin || '0')),
          precoMax:          fix4(preco),
          precoMedio:        fix4(preco),
          totalOrcamentos:   0,
          totalQuantidade:   '0',
          chaveNorm:         chave,
          ultimaAtualizacao: new Date().toISOString(),
          criadoEm:          new Date().toISOString(),
        });
      }
      return { ok: true };
    }),

  // ── Excluir insumo do catálogo ───────────────────────────────
  excluirInsumo: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      await db.delete(insumosCatalogo)
        .where(and(eq(insumosCatalogo.id, input.id), eq(insumosCatalogo.companyId, input.companyId)));
      return { ok: true };
    }),

  // ── Excluir vários insumos por lista de IDs ──────────────────
  excluirInsumosBulk: protectedProcedure
    .input(z.object({ companyId: z.number(), ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      await db.delete(insumosCatalogo)
        .where(and(eq(insumosCatalogo.companyId, input.companyId), inArray(insumosCatalogo.id, input.ids)));
      return { ok: true, deletados: input.ids.length };
    }),

  // ── Excluir todos os insumos da empresa ──────────────────────
  excluirTodosInsumos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      const result = await db.delete(insumosCatalogo)
        .where(eq(insumosCatalogo.companyId, input.companyId));
      return { ok: true };
    }),

  // ── Importar insumos: inicia o job em background e retorna jobId ──
  importarInsumosCatalogo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      fileBase64: z.string().min(10),
      fileName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco de dados não disponível.' });

      // Importação dinâmica do xlsx (igual às outras procedures)
      const XLSX = await import('xlsx');
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const wb = XLSX.read(buffer, { type: 'buffer' });

      const insTab = wb.SheetNames.find((n: string) => n.toLowerCase() === 'insumos');
      if (!insTab) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aba "Insumos" não encontrada na planilha.' });

      const dataIns = XLSX.utils.sheet_to_json(wb.Sheets[insTab], { header: 1, defval: '' }) as any[][];
      const insumos = parsearAbaInsumosParaCatalogo(dataIns, input.companyId);
      if (insumos.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum insumo com preço válido encontrado na aba "Insumos".' });

      // Cria job e inicia processamento em background (não bloqueia o HTTP)
      const jobId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      importJobs.set(jobId, { total: insumos.length, done: 0, inseridos: 0, atualizados: 0, status: 'running', createdAt: Date.now() });
      processarImportacaoBackground(jobId, insumos, input.companyId, db);

      return { jobId, total: insumos.length };
    }),

  // ── Consultar progresso de um job de importação ────────────
  progressoImportacao: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const job = importJobs.get(input.jobId);
      if (!job) return null;
      return {
        total:      job.total,
        done:       job.done,
        inseridos:  job.inseridos,
        atualizados: job.atualizados,
        status:     job.status,
        error:      job.error,
        pct:        job.total > 0 ? Math.round((job.done / job.total) * 100) : 0,
      };
    }),

  listarComposicoesCatalogo: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // Pré-agrega totalOrcamentos em uma única passada (evita N subqueries correlacionadas)
      const countsSub = db.select({
        codigo: orcamentoItens.servicoCodigo,
        total:  sql<number>`CAST(COUNT(DISTINCT ${orcamentoItens.orcamentoId}) AS INT)`.as('total'),
      }).from(orcamentoItens).groupBy(orcamentoItens.servicoCodigo).as('cnt');

      // Pré-agrega totalInsumos por composição (para mostrar no botão de expand)
      const insumosSub = db.select({
        composicaoCodigo: composicaoInsumos.composicaoCodigo,
        total: sql<number>`CAST(COUNT(*) AS INT)`.as('total'),
      }).from(composicaoInsumos)
        .where(eq(composicaoInsumos.companyId, input.companyId))
        .groupBy(composicaoInsumos.composicaoCodigo).as('ins_cnt');

      return db.select({
        id:               composicoesCatalogo.id,
        companyId:        composicoesCatalogo.companyId,
        codigo:           composicoesCatalogo.codigo,
        descricao:        composicoesCatalogo.descricao,
        unidade:          composicoesCatalogo.unidade,
        tipo:             composicoesCatalogo.tipo,
        custoUnitMat:     composicoesCatalogo.custoUnitMat,
        custoUnitMdo:     composicoesCatalogo.custoUnitMdo,
        custoUnitTotal:   composicoesCatalogo.custoUnitTotal,
        ultimaAtualizacao: composicoesCatalogo.ultimaAtualizacao,
        criadoEm:         composicoesCatalogo.criadoEm,
        totalOrcamentos:  sql<number>`COALESCE(cnt.total, 0)`.as('totalOrcamentos'),
        totalInsumos:     sql<number>`COALESCE(ins_cnt.total, 0)`.as('totalInsumos'),
      })
        .from(composicoesCatalogo)
        .leftJoin(countsSub, eq(composicoesCatalogo.codigo, countsSub.codigo))
        .leftJoin(insumosSub, eq(composicoesCatalogo.codigo, insumosSub.composicaoCodigo))
        .where(eq(composicoesCatalogo.companyId, input.companyId))
        .orderBy(composicoesCatalogo.tipo, composicoesCatalogo.codigo)
        .limit(5000);
    }),

  // ── Importar composições do catálogo via CPUs tab ────────────
  importarComposicoesCatalogo: protectedProcedure
    .input(z.object({ companyId: z.number(), fileBase64: z.string().min(10), fileName: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível.' });
      const { default: XLSX } = await import('xlsx');
      const buf = Buffer.from(input.fileBase64, 'base64');
      const wb  = XLSX.read(buf, { type: 'buffer' });

      // Busca aba de CPUs (composições)
      const cpusTab = wb.SheetNames.find(n =>
        /cpu|compos|cpu/i.test(n) && !n.toLowerCase().includes('bdi')
      );
      if (!cpusTab) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aba de CPUs não encontrada na planilha. Verifique se o arquivo contém uma aba "CPUs" ou "Composições".' });

      const rows = XLSX.utils.sheet_to_json(wb.Sheets[cpusTab], { header: 1, defval: '' }) as any[][];
      const parsed = parsearAbaCPUs(rows, input.companyId);
      if (parsed.composicoes.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhuma composição encontrada na aba CPUs (linhas tipo "S").' });

      const jobId = crypto.randomUUID();
      importJobs.set(jobId, { total: parsed.composicoes.length, done: 0, inseridos: 0, atualizados: 0, status: 'running', createdAt: Date.now() });
      setImmediate(() => processarImportacaoComposicoesBackground(jobId, parsed, input.companyId, db));
      return { jobId, total: parsed.composicoes.length };
    }),

  // ── Gerar código único para composição manual ─────────────────
  gerarCodigoComposicao: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return '99.01.01';
      const rows = await db.select({ codigo: composicoesCatalogo.codigo })
        .from(composicoesCatalogo)
        .where(eq(composicoesCatalogo.companyId, input.companyId));
      const manual = rows
        .map((r: any) => r.codigo ?? '')
        .filter((c: string) => /^99\.\d{2}\.\d{2}$/.test(c))
        .map((c: string) => { const p = c.split('.'); return parseInt(p[1]) * 100 + parseInt(p[2]); })
        .sort((a: number, b: number) => b - a);
      const seq = (manual[0] ?? 0) + 1;
      const sub  = Math.floor((seq - 1) / 99 + 1).toString().padStart(2, '0');
      const item = ((seq - 1) % 99 + 1).toString().padStart(2, '0');
      return `99.${sub}.${item}`;
    }),

  // ── Salvar composição (criar ou editar) ───────────────────────
  salvarComposicao: protectedProcedure
    .input(z.object({
      companyId:    z.number(),
      id:           z.number().optional(),
      codigo:       z.string().max(100),
      descricao:    z.string().min(1).max(1000),
      unidade:      z.string().max(30).optional().default(''),
      tipo:         z.string().max(100).optional().default(''),
      custoUnitMat: z.string().optional().default('0'),
      custoUnitMdo: z.string().optional().default('0'),
      custoUnitTotal: z.string().optional().default('0'),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      const chave = normalizarTexto(input.descricao);
      const mat   = parseFloat(input.custoUnitMat || '0');
      const mdo   = parseFloat(input.custoUnitMdo || '0');
      const tot   = parseFloat(input.custoUnitTotal || '0') || mat + mdo;
      if (input.id) {
        await db.update(composicoesCatalogo).set({
          codigo:           input.codigo.trim(),
          descricao:        input.descricao.trim(),
          unidade:          (input.unidade ?? '').trim() || null,
          tipo:             (input.tipo ?? '').trim() || null,
          custoUnitMat:     fix4(mat),
          custoUnitMdo:     fix4(mdo),
          custoUnitTotal:   fix4(tot),
          chaveNorm:        chave,
          ultimaAtualizacao: new Date().toISOString(),
        }).where(and(eq(composicoesCatalogo.id, input.id), eq(composicoesCatalogo.companyId, input.companyId)));
      } else {
        const existing = await db.select({ id: composicoesCatalogo.id })
          .from(composicoesCatalogo)
          .where(and(eq(composicoesCatalogo.companyId, input.companyId), eq(composicoesCatalogo.codigo, input.codigo.trim())))
          .limit(1);
        if (existing.length > 0) throw new TRPCError({ code: 'CONFLICT', message: `Código "${input.codigo}" já existe.` });
        await db.insert(composicoesCatalogo).values({
          companyId:        input.companyId,
          codigo:           input.codigo.trim(),
          descricao:        input.descricao.trim(),
          unidade:          (input.unidade ?? '').trim() || null,
          tipo:             (input.tipo ?? '').trim() || null,
          custoUnitMat:     fix4(mat),
          custoUnitMdo:     fix4(mdo),
          custoUnitTotal:   fix4(tot),
          totalOrcamentos:  0,
          chaveNorm:        chave,
          ultimaAtualizacao: new Date().toISOString(),
          criadoEm:         new Date().toISOString(),
        });
      }
      return { ok: true };
    }),

  // ── Excluir composição ────────────────────────────────────────
  excluirComposicao: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      await db.delete(composicoesCatalogo)
        .where(and(eq(composicoesCatalogo.id, input.id), eq(composicoesCatalogo.companyId, input.companyId)));
      return { ok: true };
    }),

  excluirComposicoesBulk: protectedProcedure
    .input(z.object({ companyId: z.number(), ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      await db.delete(composicoesCatalogo)
        .where(and(eq(composicoesCatalogo.companyId, input.companyId), inArray(composicoesCatalogo.id, input.ids)));
      return { ok: true };
    }),

  excluirTodasComposicoes: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      await db.delete(composicoesCatalogo).where(eq(composicoesCatalogo.companyId, input.companyId));
      return { ok: true };
    }),

  // ── Lista todos os insumos de todas as composições do catálogo ─
  listarComposicaoInsumosCatalogo: protectedProcedure
    .input(z.object({ companyId: z.number(), composicaoCodigo: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const where = input.composicaoCodigo
        ? and(eq(composicaoInsumos.companyId, input.companyId), eq(composicaoInsumos.composicaoCodigo, input.composicaoCodigo))
        : eq(composicaoInsumos.companyId, input.companyId);
      const rows = await db.select({
        id:               composicaoInsumos.id,
        composicaoCodigo: composicaoInsumos.composicaoCodigo,
        insumoCodigo:     composicaoInsumos.insumoCodigo,
        insumoDescricao:  composicaoInsumos.insumoDescricao,
        unidade:          composicaoInsumos.unidade,
        quantidade:       composicaoInsumos.quantidade,
        precoUnitario:    composicaoInsumos.precoUnitario,
        precoAtual:       insumosCatalogo.precoUnitario,
        alocacaoMat:      composicaoInsumos.alocacaoMat,
        alocacaoMdo:      composicaoInsumos.alocacaoMdo,
        custoUnitTotal:   composicaoInsumos.custoUnitTotal,
      })
        .from(composicaoInsumos)
        .leftJoin(
          insumosCatalogo,
          and(
            eq(insumosCatalogo.companyId, input.companyId),
            eq(insumosCatalogo.codigo, composicaoInsumos.insumoCodigo),
          )
        )
        .where(where)
        .orderBy(composicaoInsumos.composicaoCodigo, composicaoInsumos.id);
      return rows.map(r => {
        const pu  = parseFloat(r.precoAtual ?? r.precoUnitario ?? '0');
        const qty = parseFloat(r.quantidade ?? '0');
        return {
          ...r,
          precoUnitario:  fix4(pu),
          custoUnitTotal: fix6(qty * pu),
        };
      });
    }),

  // ── Busca insumos do catálogo (autocomplete p/ adicionar à composição) ──
  buscarInsumosCatalogo: protectedProcedure
    .input(z.object({ companyId: z.number(), q: z.string().default('') }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const q = input.q.trim().toLowerCase();
      const rows = await db.select({
        id: insumosCatalogo.id, codigo: insumosCatalogo.codigo,
        descricao: insumosCatalogo.descricao, unidade: insumosCatalogo.unidade,
        precoUnitario: insumosCatalogo.precoUnitario,
      })
        .from(insumosCatalogo)
        .where(eq(insumosCatalogo.companyId, input.companyId))
        .orderBy(insumosCatalogo.codigo)
        .limit(5000);
      if (!q) return rows.slice(0, 30);
      const fil = rows.filter((r: any) =>
        r.codigo?.toLowerCase().includes(q) || r.descricao?.toLowerCase().includes(q)
      );
      return fil.slice(0, 30);
    }),

  // ── Adicionar insumo a uma composição ────────────────────────
  adicionarInsumoComposicao: protectedProcedure
    .input(z.object({
      companyId: z.number(), composicaoCodigo: z.string(),
      insumoCodigo: z.string(), quantidade: z.string().default('1'),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      const ins = await db.select().from(insumosCatalogo)
        .where(and(eq(insumosCatalogo.companyId, input.companyId), eq(insumosCatalogo.codigo, input.insumoCodigo)))
        .limit(1);
      if (!ins[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Insumo não encontrado no catálogo.' });
      const i = ins[0];
      const qty = parseFloat(input.quantidade) || 1;
      const pu  = parseFloat(i.precoUnitario ?? '0');
      await db.insert(composicaoInsumos).values({
        companyId:        input.companyId,
        composicaoCodigo: input.composicaoCodigo,
        insumoCodigo:     i.codigo ?? '',
        insumoDescricao:  i.descricao ?? '',
        unidade:          i.unidade ?? null,
        quantidade:       fix6(qty),
        precoUnitario:    fix4(pu),
        alocacaoMat:      '0',
        alocacaoMdo:      '0',
        custoUnitTotal:   fix6(qty * pu),
      });
      return { ok: true };
    }),

  // ── Atualizar quantidade de um insumo na composição ───────────
  atualizarQuantidadeInsumoComposicao: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number(), quantidade: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      const qty = parseFloat(input.quantidade.replace(',', '.')) || 0;
      // Busca registro para calcular custo total atualizado
      const row = await db.select().from(composicaoInsumos)
        .where(and(eq(composicaoInsumos.id, input.id), eq(composicaoInsumos.companyId, input.companyId)))
        .limit(1);
      if (!row[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Registro não encontrado.' });
      const pu = parseFloat(row[0].precoUnitario ?? '0');
      await db.update(composicaoInsumos).set({
        quantidade:     fix6(qty),
        custoUnitTotal: fix6(qty * pu),
      }).where(and(eq(composicaoInsumos.id, input.id), eq(composicaoInsumos.companyId, input.companyId)));
      return { ok: true };
    }),

  // ── Remover insumo de uma composição ─────────────────────────
  removerInsumoComposicao: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      await db.delete(composicaoInsumos)
        .where(and(eq(composicaoInsumos.id, input.id), eq(composicaoInsumos.companyId, input.companyId)));
      return { ok: true };
    }),

  // ── Composições com insumos de um orçamento ───────────────────
  // Busca as composições (CPUs) usadas nos itens folha deste orçamento,
  // junto com seus insumos detalhados do catálogo da empresa.
  getComposicoesCatalogo: protectedProcedure
    .input(z.object({ orcamentoId: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // Pega todos os itens do orçamento para encontrar os servicoCodigos únicos
      const itens = await db.select({
        eapCodigo:    orcamentoItens.eapCodigo,
        descricao:    orcamentoItens.descricao,
        unidade:      orcamentoItens.unidade,
        quantidade:   orcamentoItens.quantidade,
        nivel:        orcamentoItens.nivel,
        custoTotal:   orcamentoItens.custoTotal,
        custoTotalMat: orcamentoItens.custoTotalMat,
        custoTotalMdo: orcamentoItens.custoTotalMdo,
        servicoCodigo: (orcamentoItens as any).servicoCodigo,
      }).from(orcamentoItens)
        .where(eq(orcamentoItens.orcamentoId, input.orcamentoId))
        .orderBy(orcamentoItens.ordem);

      // Identifica folhas (sem filhos — itens que nenhum outro item começa com seu código + ".")
      const folhas = itens.filter(i => {
        const cod = i.eapCodigo ?? '';
        return !itens.some(j => {
          const jcod = j.eapCodigo ?? '';
          return jcod !== cod && jcod.startsWith(cod + '.');
        });
      });

      // Pega os servicoCodigos únicos das folhas
      const serviceCodes = [...new Set(
        folhas.map(i => i.servicoCodigo).filter(Boolean) as string[]
      )];

      if (serviceCodes.length === 0) return [];

      // Busca as composições do catálogo por esses códigos
      const comps = await db.select().from(composicoesCatalogo)
        .where(and(
          eq(composicoesCatalogo.companyId, input.companyId),
          inArray(composicoesCatalogo.codigo, serviceCodes)
        ));

      // Busca os insumos de cada composição
      const compCodigos = comps.map(c => c.codigo).filter(Boolean) as string[];
      const insumosRows = compCodigos.length > 0
        ? await db.select().from(composicaoInsumos)
            .where(and(
              eq(composicaoInsumos.companyId, input.companyId),
              inArray(composicaoInsumos.composicaoCodigo, compCodigos)
            ))
        : [];

      // Monta mapa de insumos por composição
      const insMap = new Map<string, typeof insumosRows>();
      for (const ins of insumosRows) {
        const list = insMap.get(ins.composicaoCodigo) ?? [];
        list.push(ins);
        insMap.set(ins.composicaoCodigo, list);
      }

      // Para cada folha EAP, une com sua composição + insumos
      return folhas
        .filter(f => f.servicoCodigo)
        .sort((a, b) => parseFloat(b.custoTotal ?? '0') - parseFloat(a.custoTotal ?? '0'))
        .map(f => {
          const comp = comps.find(c => c.codigo === f.servicoCodigo);
          const insumos = insMap.get(f.servicoCodigo ?? '') ?? [];
          const qtdOrcada = parseFloat(f.quantidade ?? '1') || 1;
          return {
            eapCodigo:    f.eapCodigo,
            descricao:    f.descricao,
            unidade:      f.unidade,
            quantidade:   f.quantidade,
            custoTotal:   f.custoTotal,
            custoTotalMat: f.custoTotalMat,
            custoTotalMdo: f.custoTotalMdo,
            servicoCodigo: f.servicoCodigo,
            comp: comp ? {
              codigo:        comp.codigo,
              descricao:     comp.descricao,
              unidade:       comp.unidade,
              custoUnitMat:  comp.custoUnitMat,
              custoUnitMdo:  comp.custoUnitMdo,
              custoUnitTotal: comp.custoUnitTotal,
            } : null,
            insumos: insumos.map(ins => ({
              insumoCodigo:   ins.insumoCodigo,
              insumoDescricao: ins.insumoDescricao,
              unidade:        ins.unidade,
              quantidade:     ins.quantidade,
              precoUnitario:  ins.precoUnitario,
              alocacaoMat:    ins.alocacaoMat,
              alocacaoMdo:    ins.alocacaoMdo,
              custoUnitTotal: ins.custoUnitTotal,
              // Custo total = custo_unit × qtd orçada
              custoTotalMat:  (parseFloat(ins.alocacaoMat ?? '0') * qtdOrcada).toFixed(2),
              custoTotalMdo:  (parseFloat(ins.alocacaoMdo ?? '0') * qtdOrcada).toFixed(2),
              custoTotal:     (parseFloat(ins.custoUnitTotal ?? '0') * qtdOrcada).toFixed(2),
            })),
          };
        });
    }),

  // ── Resumo para o painel ──────────────────────────────────
  painel: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { total: 0, totalVenda: 0, totalCusto: 0, totalMeta: 0, recentes: [] };
      const lista = await db.select().from(orcamentos)
        .where(and(eq(orcamentos.companyId, input.companyId), isNull(orcamentos.deletedAt)))
        .orderBy(desc(orcamentos.createdAt))
        .limit(50);
      const total      = lista.length;
      const totalVenda = lista.reduce((s, o) => s + parseFloat(o.totalVenda || '0'), 0);
      const totalCusto = lista.reduce((s, o) => s + parseFloat(o.totalCusto || '0'), 0);
      const totalMeta  = lista.reduce((s, o) => s + parseFloat(o.totalMeta  || '0'), 0);
      return { total, totalVenda, totalCusto, totalMeta, recentes: lista.slice(0, 5) };
    }),
});
