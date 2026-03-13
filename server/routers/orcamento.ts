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
  orcamentoParametros,
  encargosSociais,
  obras,
  companies,
  bdiIndiretos,
  bdiFd,
  bdiAdmCentral,
  bdiDespesasFinanceiras,
  bdiTributos,
  bdiTaxaComercializacao,
} from "../../drizzle/schema";

const ENCARGOS_DEFAULTS = [
  { grupo: 'A', codigo: 'A1',  descricao: 'INSS - Previdência Social (com desoneração da folha de pagamento)', valor: '20.0000', calculado: false, ordem: 1 },
  { grupo: 'A', codigo: 'A2',  descricao: 'FGTS - Fundo de Garantia por Tempo de Serviço', valor: '8.0000', calculado: false, ordem: 2 },
  { grupo: 'A', codigo: 'A3',  descricao: 'Salário Educação', valor: '2.5000', calculado: false, ordem: 3 },
  { grupo: 'A', codigo: 'A4',  descricao: 'SESI - Serviço Social da Indústria', valor: '1.5000', calculado: false, ordem: 4 },
  { grupo: 'A', codigo: 'A5',  descricao: 'SENAI - Serviço Nacional de Aprendizagem', valor: '1.0000', calculado: false, ordem: 5 },
  { grupo: 'A', codigo: 'A6',  descricao: 'INCRA - Instituto Nacional de Colonização e Reforma Agrária', valor: '0.2000', calculado: false, ordem: 6 },
  { grupo: 'A', codigo: 'A7',  descricao: 'Seguro contra os acidentes de trabalho (FAP x RAT)', valor: '3.0000', calculado: false, ordem: 7 },
  { grupo: 'A', codigo: 'A8',  descricao: 'SEBRAE - Serviço de Apoio à Pequena e Média Empresa', valor: '0.6000', calculado: false, ordem: 8 },
  { grupo: 'A', codigo: 'A9',  descricao: 'SECONCI - Serviço Social Indústrias da Construção e Mobiliário', valor: '0.0000', calculado: false, ordem: 9 },
  { grupo: 'A', codigo: 'A10', descricao: 'Adicional de mais de 500 funcionários (SENAI)', valor: '0.0000', calculado: false, ordem: 10 },
  { grupo: 'B', codigo: 'B1',  descricao: '13º Salário', valor: '8.3300', calculado: false, ordem: 11 },
  { grupo: 'B', codigo: 'B2',  descricao: 'Férias + 1/3 constitucional', valor: '11.1100', calculado: false, ordem: 12 },
  { grupo: 'B', codigo: 'B3',  descricao: 'Aviso prévio trabalhado', valor: '1.9400', calculado: false, ordem: 13 },
  { grupo: 'B', codigo: 'B4',  descricao: 'Auxílio Enfermidade', valor: '1.3900', calculado: false, ordem: 14 },
  { grupo: 'B', codigo: 'B5',  descricao: 'Auxílio Acidentes de Trabalho', valor: '0.0000', calculado: false, ordem: 15 },
  { grupo: 'B', codigo: 'B6',  descricao: 'Faltas justificadas por motivos diversos', valor: '0.0000', calculado: false, ordem: 16 },
  { grupo: 'B', codigo: 'B7',  descricao: 'Salário Maternidade', valor: '0.0000', calculado: false, ordem: 17 },
  { grupo: 'B', codigo: 'B8',  descricao: 'Licença Paternidade', valor: '0.0000', calculado: false, ordem: 18 },
  { grupo: 'B', codigo: 'B9',  descricao: 'Repouso semanal remunerado (DSR)', valor: '16.9100', calculado: false, ordem: 19 },
  { grupo: 'B', codigo: 'B10', descricao: 'Feriados no período', valor: '3.1300', calculado: false, ordem: 20 },
  { grupo: 'B', codigo: 'B11', descricao: 'Dias de chuva e outras dificuldades', valor: '1.9900', calculado: false, ordem: 21 },
  { grupo: 'C', codigo: 'C1',  descricao: 'Aviso prévio indenizado', valor: '9.1200', calculado: false, ordem: 22 },
  { grupo: 'C', codigo: 'C2',  descricao: 'Indenização adicional por ano trabalhado (3 dias por ano trabalhado)', valor: '0.3300', calculado: false, ordem: 23 },
  { grupo: 'C', codigo: 'C3',  descricao: 'Indenização (rescisão sem justa causa – multa de 40% do FGTS)', valor: '3.2000', calculado: false, ordem: 24 },
  { grupo: 'C', codigo: 'C4',  descricao: 'Indenização (rescisão sem justa causa – contribuição de 10% do FGTS)', valor: '0.0000', calculado: false, ordem: 25 },
  { grupo: 'E', codigo: 'E1',  descricao: 'Incidência do FGTS exclusivamente sobre o aviso prévio indenizado', valor: '0.7300', calculado: false, ordem: 26 },
  { grupo: 'E', codigo: 'E2',  descricao: 'Incidência do FGTS exclusivamente sobre o período médio de afastamento', valor: '0.0300', calculado: false, ordem: 27 },
  { grupo: 'E', codigo: 'E3',  descricao: 'Incidência dos encargos do Grupo A sobre o salário maternidade', valor: '0.0000', calculado: false, ordem: 28 },
  { grupo: 'F', codigo: 'F1',  descricao: 'Almoço', valor: '0.0000', calculado: false, ordem: 29 },
  { grupo: 'F', codigo: 'F2',  descricao: 'Jantar', valor: '0.0000', calculado: false, ordem: 30 },
  { grupo: 'F', codigo: 'F3',  descricao: 'Café da manhã', valor: '0.0000', calculado: false, ordem: 31 },
  { grupo: 'F', codigo: 'F4',  descricao: 'Equipamento de segurança (EPIs)', valor: '0.0000', calculado: false, ordem: 32 },
  { grupo: 'F', codigo: 'F5',  descricao: 'Vale-transporte', valor: '0.0000', calculado: false, ordem: 33 },
  { grupo: 'F', codigo: 'F6',  descricao: 'Seguro de vida e acidentes', valor: '1.1700', calculado: false, ordem: 34 },
  { grupo: 'F', codigo: 'F7',  descricao: 'Ferramentas Manuais', valor: '0.0000', calculado: false, ordem: 35 },
  { grupo: 'F', codigo: 'F8',  descricao: 'Adicional de Insalubridade (20% do salário mínimo)', valor: '0.0000', calculado: false, ordem: 36 },
  { grupo: 'F', codigo: 'F9',  descricao: 'Periculosidade', valor: '0.0000', calculado: false, ordem: 37 },
  { grupo: 'F', codigo: 'F10', descricao: 'Por horas extras a 60% + integralização do DSR', valor: '0.0000', calculado: false, ordem: 38 },
  { grupo: 'F', codigo: 'F11', descricao: 'Por horas extras a 100% + integralização do DSR', valor: '0.0000', calculado: false, ordem: 39 },
] as const;
import { eq, and, desc, isNull, inArray, sql } from "drizzle-orm";

// ============================================================
// UTILITÁRIOS
// ============================================================

function toNum(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}
const n = toNum; // alias curto usado nos cálculos CI-01

function fix2(v: number): string { return v.toFixed(2); }
function fix4(v: number): string { return v.toFixed(4); }
function fix6(v: number): string { return v.toFixed(6); }

// ============================================================
// CÁLCULO CI-01 — CLT vs Contrato (PJ)
// Encargos sociais CLT fixos conforme planilha Excel (AA8:AA13)
// ============================================================
// Encargos CLT completos para construção civil conforme planilha Excel:
// Encargos básicos:   INSS patronal ~20% + SAT/RAT ~3% + Sistema S ~5.8% + outros
// Encargos adicionais: 13°+férias+aviso+FGTS+multa+DSR ~49.42%
// Reincidências sobre adicionais elevam o total para 112,69%
// Valor extraído diretamente da planilha Excel de referência.
const TOTAL_ENCARGOS_CLT = 1.1269; // 112,69%

interface CI01Params {
  tempoObraMeses:         number; // prazo + eventual_atraso
  dissidioPct:            number; // ex: 0.05 = 5%
  incidenciaDissidioMeses: number; // meses do dissídio que incidem na obra
}

interface CI01Row {
  salarioBase:     number;
  bonusMensal:     number;
  quantidade:      number;
  tipoContrato:    string; // 'CLT' ou 'Contrato'
  txTransferencia: number; // ex: 0.10 = 10%
}

interface CI01Resultado {
  valorHora:            number;
  decimoTerceiroFerias: number;
  totalMes:             number;
  totalObra:            number;
  mesesObra:            number;
}

function calcCI01Linha(row: CI01Row, params: CI01Params): CI01Resultado {
  const sal    = row.salarioBase;
  const bonus  = row.bonusMensal;
  const qtd    = row.quantidade;
  const meses  = params.tempoObraMeses;
  const txTr   = row.txTransferencia;
  const isCLT  = row.tipoContrato?.toLowerCase() === 'clt';

  if (sal === 0 || qtd === 0 || meses === 0) {
    return { valorHora: 0, decimoTerceiroFerias: 0, totalMes: 0, totalObra: 0, mesesObra: meses };
  }

  // 1. Valor hora base (com ou sem encargos CLT)
  let vhBase = sal / 220;
  if (isCLT) vhBase = vhBase * (1 + TOTAL_ENCARGOS_CLT);

  // 2. Com taxa de transferência de base
  const vhTransf = vhBase * (1 + txTr);

  // 3. Com dissídio coletivo (proporcional aos meses que incidem)
  const dissidioFator = meses > 0
    ? (params.incidenciaDissidioMeses / meses) * params.dissidioPct
    : 0;
  const valorHora = vhTransf * (1 + dissidioFator);

  // 4. 13°+Férias — só para Contrato (PJ); CLT já tem nos encargos
  const decimoTerceiroFerias = isCLT ? 0 : meses * (sal / 12) * 2;

  // 5. Total mensal e da obra
  // CLT: custo mensal = valor_hora × 220h + bônus
  // PJ:  custo mensal = valor_hora × 220h + bônus + 13°+Férias proporcionais
  const totalMes = valorHora * 220 + bonus + (isCLT ? 0 : decimoTerceiroFerias / meses);
  const totalObra = totalMes * meses * qtd;

  return {
    valorHora:            Math.round(valorHora * 1e6) / 1e6,
    decimoTerceiroFerias: Math.round(decimoTerceiroFerias * 100) / 100,
    totalMes:             Math.round(totalMes * 100) / 100,
    totalObra:            Math.round(totalObra * 100) / 100,
    mesesObra:            meses,
  };
}

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
// Varre todas as colunas para encontrar o label — independente do layout.
function extrairTotaisPlanilha(rows: any[][], colMap?: Record<string, number>): { totalMat: number; totalMdo: number; totalCusto: number } | null {
  for (const row of rows) {
    // Procura "TOTAIS GERAIS" em qualquer coluna da linha
    const labelIdx = row.findIndex((c: any) => {
      const s = String(c || '').trim().toUpperCase();
      return s.includes('TOTAI') && s.includes('GERA');
    });
    if (labelIdx === -1) continue;
    // Se temos o mapa de colunas, usa ele; caso contrário tenta os índices clássicos
    if (colMap) {
      const mat   = toNum(row[colMap['cuTotalMat']  ?? -1]);
      const mdo   = toNum(row[colMap['cuTotalMdo']  ?? -1]);
      const custo = toNum(row[colMap['custoTotal']  ?? -1]);
      if (custo > 0) return { totalMat: mat, totalMdo: mdo, totalCusto: custo };
      // fallback soma
      const soma = mat + mdo;
      if (soma > 0) return { totalMat: mat, totalMdo: mdo, totalCusto: soma };
    } else {
      // Pega os 3 maiores números da linha (mat, mdo, total)
      const nums = row.map((c: any) => toNum(c)).filter(n => n > 0).sort((a, b) => b - a);
      if (nums.length >= 1) return { totalMat: nums[1] ?? 0, totalMdo: nums[2] ?? 0, totalCusto: nums[0] };
    }
  }
  return null;
}

// ─── Mapeador de colunas pelo cabeçalho ──────────────────────────────────────
// Normaliza uma string: minúsculas + sem acentos + sem pontos/espaços
function normCol(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.\s_\-/]/g, '');
}

// Mapa de aliases: chave semântica → lista de valores normalizados aceitos
const COL_ALIASES: Record<string, string[]> = {
  item:           ['item', 'cod', 'codigo', 'eap', 'codigoeap'],
  descricao:      ['descricao', 'descri', 'desc', 'denominacao', 'servico', 'especificacao'],
  unidade:        ['un', 'und', 'unid', 'unidade'],
  quantidade:     ['qtd', 'qt', 'quant', 'quantidade', 'qde'],
  nivel:          ['nivel', 'niv', 'lvl', 'hierarquia'],
  composicaoTipo: ['composicao', 'comp', 'composicaotipo', 'tipocomposicao'],
  servicoCodigo:  ['codigoservico', 'codservico', 'servcod', 'cods', 'codsv'],
  tipo:           ['tipo'],
  cuUnitMat:      ['punitmat', 'pumat', 'cunitmat', 'custounitmat', 'precounitmat', 'valorunitmat', 'custounitariomaterial', 'pumateria', 'valorunitariomaterial'],
  cuUnitMdo:      ['punitmo', 'pumo', 'cunitmo', 'custounitmo', 'precounitmo', 'valorunitmo', 'custounitariomo', 'pumaodeobra', 'valorunitariomo'],
  cuTotalMat:     ['ptotalmat', 'pttotalmat', 'ctmat', 'custototalmat', 'totalmat', 'totalmaterial'],
  cuTotalMdo:     ['ptotalmo', 'pttotalmo', 'ctmo', 'custototalmo', 'totalmo', 'totalmaodeobra'],
  custoTotal:     ['custo', 'custototal', 'totalcusto', 'ct', 'ptotal', 'preçototal', 'valortotal', 'totalservico', 'totalgeral'],
  abc:            ['abc'],
};

function detectarColunas(headerRow: any[]): Record<string, number> {
  const colMap: Record<string, number> = {};
  headerRow.forEach((cell: any, idx: number) => {
    const n = normCol(String(cell || ''));
    if (!n) return;
    for (const [field, aliases] of Object.entries(COL_ALIASES)) {
      if (colMap[field] !== undefined) continue; // já encontrou
      if (aliases.some(a => n === a || n.startsWith(a))) {
        colMap[field] = idx;
      }
    }
  });
  return colMap;
}

// Parseia a aba Orçamento e retorna array de itens
// bdiPercentual: decimal fraction (ex: 0.2456 = 24.56%)
// Venda = Custo × (1 + BDI%)   |   Meta = Custo × (1 − Meta%)
function parsearAbaCorcamento(rows: any[][], metaPerc: number, bdiPercentual: number = 0) {
  // ─── 1. Detectar linha de cabeçalho ────────────────────────────────────────
  // A linha deve conter ao menos "Item" (EAP) e "Descri..." em células distintas
  let headerIdx = -1;
  let colMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const row = rows[i];
    const cells = row.map((c: any) => normCol(String(c || '')));
    const hasItem = cells.some(c => c === 'item' || c === 'codigo' || c === 'eap');
    const hasDesc = cells.some(c => c.startsWith('descri') || c === 'desc' || c === 'denominacao');
    if (hasItem && hasDesc) {
      headerIdx = i;
      colMap = detectarColunas(row);
      break;
    }
  }

  if (headerIdx === -1) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Estrutura da planilha não reconhecida. Linha de cabeçalho com "Item" e "Descrição" não encontrada nas primeiras 30 linhas.',
    });
  }
  if (colMap['item'] === undefined) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Coluna "Item" não mapeada.' });
  }
  if (colMap['descricao'] === undefined) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Coluna "Descrição" não mapeada.' });
  }

  // ─── 2. Helper de leitura ──────────────────────────────────────────────────
  const col = (row: any[], field: string): any => {
    const idx = colMap[field];
    return idx !== undefined ? row[idx] : undefined;
  };

  // ─── 3. Parsear linhas de dados ────────────────────────────────────────────
  const itens = [];
  let ordem = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const eapCodigo = String(col(row, 'item') ?? '').trim();
    const descricao = String(col(row, 'descricao') ?? '').trim();
    if (!eapCodigo || !descricao) continue;

    // Nível: usa coluna explícita se existir, senão infere pela profundidade do código EAP
    // Ex: "01" → 1  |  "01.01" → 2  |  "01.01.01" → 3
    let nivel: number;
    if (colMap['nivel'] !== undefined) {
      nivel = toNum(col(row, 'nivel'));
    } else {
      nivel = eapCodigo.split('.').length;
    }
    if (nivel < 1 || nivel > 10) continue;

    const composicaoTipo = String(col(row, 'composicaoTipo') ?? '').trim();
    const servicoCodigo  = String(col(row, 'servicoCodigo')  ?? '').trim();
    const tipo           = String(col(row, 'tipo')           ?? '').trim();
    const unidade        = String(col(row, 'unidade')        ?? '').trim();
    const quantidade     = toNum(col(row, 'quantidade'));
    const custoUnitMat   = toNum(col(row, 'cuUnitMat'));
    const custoUnitMdo   = toNum(col(row, 'cuUnitMdo'));
    const custoUnitTotal = custoUnitMat + custoUnitMdo;

    const custoTotalMat  = toNum(col(row, 'cuTotalMat'));
    const custoTotalMdo  = toNum(col(row, 'cuTotalMdo'));
    let   custoTotal     = toNum(col(row, 'custoTotal'));

    // Fallbacks para custoTotal: soma das partes → qty × custo unitário
    if (custoTotal === 0 && (custoTotalMat > 0 || custoTotalMdo > 0))
      custoTotal = custoTotalMat + custoTotalMdo;
    if (custoTotal === 0 && quantidade > 0 && custoUnitTotal > 0)
      custoTotal = quantidade * custoUnitTotal;

    const vendaTotal     = custoTotal     * (1 + bdiPercentual);
    const vendaUnitTotal = custoUnitTotal * (1 + bdiPercentual);
    const metaTotal      = custoTotal     * (1 - metaPerc);
    const metaUnitTotal  = custoUnitTotal * (1 - metaPerc);
    const abcServico     = String(col(row, 'abc') ?? '').trim().substring(0, 5);

    ordem++;
    itens.push({
      eapCodigo,
      nivel,
      tipo:           tipo.substring(0, 50),
      composicaoTipo: composicaoTipo.substring(0, 20),
      servicoCodigo:  servicoCodigo.substring(0, 50),
      descricao:      descricao.substring(0, 1000),
      unidade:        unidade.substring(0, 30),
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

  return { itens, colMap };
}

// Parseia aba BDI
// nomeAba: nome da aba de origem para exibição multi-aba
// Aceita APENAS códigos BDI válidos — rejeita tudo mais (lixo do Excel)
// Padrões válidos: CD, CI, DI, B, L, JF, J, PVN, PV-2, PV-3, V1-V10,
//                  CD-01..CD-03, CI-01..CI-08, DI-01..DI-10,
//                  B-01, B-02, B-04, L-01..L-04, "CD + CI ="
// Ordem importa: padrões mais específicos ANTES dos curtos (CD-01 antes de CD)
// B-03 e B-05 excluídos (duplicatas erradas — L-01..L-04 são os corretos)
// PV aceita espaços: "PV - 2" e "PV-2" equivalentes; Sub-códigos CD-02.1, CI-01.x permitidos
const BDI_COD_VALIDO = /^(CD-\d{2}(\.\d+)?|CI-\d{2}(\.\d+)?|DI-\d{2}|B-0[124]|L-\d{2}|V\d{1,2}|PV\s*-\s*[23]|PVN|JF?|CD\s*\+.*|CD|CI|DI|B|L)$/;

function parsearAbaBdi(rows: any[][], companyId: number, nomeAba = 'BDI') {
  let bdiPercentual = 0;
  const linhas: any[] = [];
  let ordem = 0;

  for (const row of rows) {
    const col2    = String(row[2] || '').trim();
    const descCol = String(row[3] || '').trim();

    // Rejeita qualquer linha cujo código não bate com o padrão BDI válido
    if (!BDI_COD_VALIDO.test(col2)) continue;
    // Exige descrição mínima
    if (descCol.length < 3) continue;

    const pct = toNum(row[7]);
    const val = toNum(row[9]);
    // Ignora percentuais absurdos (> 1000%)
    if (Math.abs(pct) > 10) continue;

    // Extrai BDI total do B-02
    if (col2 === 'B-02' && !bdiPercentual) {
      bdiPercentual = pct;
    }

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
  return { bdiPercentual, linhas };
}

// ── Parsers dedicados por aba BDI ────────────────────────────────────────
// Cada aba tem estrutura completamente diferente no Excel.
// Esses parsers extraem dados nos campos certos de cada tabela dedicada.

function parsearAbaIndiretos(rows: any[][], companyId: number, orcamentoId: number) {
  const linhas: any[] = [];
  let secao = '';
  let ordem = 0;

  for (const row of rows) {
    const c3 = String(row[3] || '').trim();
    const c4 = String(row[4] || '').trim();
    const c0 = String(row[0] || '').trim();

    // ── Cabeçalho de seção: col[3] = 'CI-01', 'CI-02', etc. ──────────────
    if (c3.match(/^CI-\d+$/) && c4.length > 2) {
      secao = c3;
      linhas.push({
        orcamentoId, companyId, secao, isHeader: true,
        codigo: c3, descricao: c4.substring(0, 255),
        quantidade: '0', mesesObra: '0', salarioBase: '0',
        bonusMensal: '0', decimoTerceiroFerias: '0', valorHora: '0',
        totalMes: '0', totalObra: '0', modalidade: '', tipoContrato: '', ordem: ordem++,
      });
      continue;
    }

    // Linha de dados: col[3] tem padrão numérico (N.NN ou NN.NN.NN.NN)
    if (!c3.match(/^\d+(\.\d+)+$/) || c4.length < 2) continue;

    if (secao === 'CI-01') {
      // ── CI-01: Mão de obra — col mapping original ─────────────────────────
      // Só processa se col[0] for dígito (linha real, não sub-header)
      if (!c0.match(/^\d+$/)) continue;
      const qty       = toNum(row[9]);
      const meses     = toNum(row[11]);
      const sal       = toNum(row[12]);
      const bonus     = toNum(row[13]);
      const decTer    = toNum(row[14]);
      const vh        = toNum(row[15]);
      const totalMes  = toNum(row[16]) || toNum(row[17]) || (sal + bonus);
      const totalObra = totalMes * (meses || 1);
      linhas.push({
        orcamentoId, companyId, secao, isHeader: false,
        codigo:               c3.substring(0, 30),
        descricao:            c4.substring(0, 255),
        modalidade:           String(row[7] || '').trim().substring(0, 50),
        tipoContrato:         String(row[8] || '').trim().substring(0, 30),
        quantidade:           fix2(qty || 1),
        mesesObra:            fix2(meses),
        salarioBase:          fix2(sal),
        bonusMensal:          fix2(bonus),
        decimoTerceiroFerias: fix2(decTer),
        valorHora:            fix6(vh),
        totalMes:             fix2(totalMes),
        totalObra:            fix2(totalObra),
        ordem:                ordem++,
      });

    } else if (secao.match(/^CI-0[2-7]$/)) {
      // ── CI-02+: Refeições / Transportes / Equipamentos / Despesas / Segurança / Consultoria
      // Excel cols: I=unidade J=qty K=vida_util L=delta_t M=pct_incid N=tempo O=valor_unit P=total
      // Array indices:           8        9         10         11         12        13       14       15
      const unidade    = String(row[8]  || '').trim().substring(0, 20);
      const qty        = toNum(row[9]);
      const vidaUtil   = toNum(row[10]);
      const deltaTRaw  = String(row[11] || '').trim();
      const deltaT     = deltaTRaw === '' || deltaTRaw.toUpperCase() === 'N/A' ? null : toNum(row[11]);
      const pctRaw     = toNum(row[12]);
      // pct_incidencia: se delta_t é N/A → 1.0; se vem do Excel direto usa esse valor
      const pctIncid   = deltaT === null ? 1.0 : (vidaUtil > 0 ? deltaT / vidaUtil : (pctRaw || 1.0));
      const tempo      = toNum(row[13]); // meses_obra (N col)
      const valorUnit  = toNum(row[14]);
      const totalRaw   = toNum(row[15]);
      // total = qty × pct × tempo × valorUnit   (se tempo=0, usa 1 para itens avulsos)
      const tempoEfetivo = tempo || 1;
      const totalCalc  = qty * pctIncid * tempoEfetivo * valorUnit;
      const total      = totalRaw || totalCalc;

      // Sub-headers (ex: "08.01 Refeição - Produção"): sem unidade e qty=0
      const isSub = qty === 0 && valorUnit === 0 && !unidade;

      linhas.push({
        orcamentoId, companyId, secao, isHeader: isSub,
        codigo:        c3.substring(0, 30),
        descricao:     c4.substring(0, 255),
        modalidade:    '',
        tipoContrato:  '',
        unidade,
        quantidade:    fix2(qty),
        mesesObra:     fix2(tempoEfetivo),
        vidaUtil:      vidaUtil > 0 ? fix2(vidaUtil) : '0',
        deltaT:        deltaT !== null ? fix2(deltaT) : null,
        pctIncidencia: fix6(pctIncid),
        valorUnit:     fix2(valorUnit),
        totalLinha:    fix2(total),
        // CI-01 fields zeroed for CI-02+
        salarioBase: '0', bonusMensal: '0', decimoTerceiroFerias: '0',
        valorHora: '0', totalMes: '0', totalObra: fix2(total),
        ordem: ordem++,
      });
    }
  }
  return linhas;
}

function parsearAbaFd(rows: any[][], companyId: number, orcamentoId: number) {
  const linhas: any[] = [];
  let ordem = 0;
  for (const row of rows) {
    const cod  = String(row[0] || '').trim();
    const desc = String(row[1] || '').trim();
    const un   = String(row[2] || '').trim();
    // Linha de material: código tipo 'XX.XX.XX' ou similar
    if (cod.match(/^\d{2}\.\d{2}/) && desc.length > 2) {
      const qty   = toNum(row[3]);
      const pu    = toNum(row[4]);
      const total = toNum(row[5]) || fix2(qty * pu);
      const forn  = String(row[6] || '').trim();
      linhas.push({
        orcamentoId, companyId,
        codigoInsumo: cod.substring(0, 30),
        descricao:    desc.substring(0, 255),
        unidade:      un.substring(0, 20),
        qtdOrcada:    fix2(qty),
        precoUnit:    fix6(pu),
        total:        fix2(parseFloat(total)),
        fornecedor:   forn.substring(0, 255),
        ordem:        ordem++,
      });
    }
  }
  return linhas;
}

function parsearAbaAdmCentral(rows: any[][], companyId: number, orcamentoId: number) {
  const linhas: any[] = [];
  let ordem = 0;
  for (const row of rows) {
    const c1 = String(row[1] || '').trim();
    const c4 = String(row[4] || '').trim();
    const c5 = String(row[5] || '').trim();
    // Linha de pessoal: c1 é número sequencial, c4 é código X.XX
    if (c1.match(/^\d+$/) && c4.match(/^\d+\.\d+/) && c5.length > 2) {
      const base     = toNum(row[9]);
      const tempo    = toNum(row[8]);
      const encargos = toNum(row[9]);
      const benef    = toNum(row[10]);
      const total    = toNum(row[11]);
      linhas.push({
        orcamentoId, companyId, isHeader: false,
        codigo:    c4.substring(0, 30),
        descricao: c5.substring(0, 255),
        base:      fix2(base),
        tempoObra: fix2(tempo),
        encargos:  fix6(encargos),
        beneficios: fix2(benef),
        total:     fix2(total),
        ordem:     ordem++,
      });
    }
  }
  return linhas;
}

function parsearAbaDespesasFinanceiras(rows: any[][], companyId: number, orcamentoId: number) {
  const linhas: any[] = [];
  let ordem = 0;
  for (const row of rows) {
    const c1 = String(row[1] || '').trim();
    const c2 = String(row[2] || '').trim();
    // Linha com código de 1 letra seguido de ' -' e descrição
    if ((c1.match(/^[a-zA-Z]\s*[-–]/) || c1.match(/^[a-zA-Z]$/)) && c2.length > 3) {
      const val = toNum(row[4]) || toNum(row[5]);
      linhas.push({
        orcamentoId, companyId, isHeader: false,
        codigo:    c1.substring(0, 30),
        descricao: c2.substring(0, 255),
        valor:     fix6(val),
        unidade:   String(row[3] || '').trim().substring(0, 50),
        ordem:     ordem++,
      });
    }
    // Parâmetros principais: Taxa de custo financeiro, Custo Direto, ΣMj
    if (c2.match(/^(Taxa de custo|Custo Direto|ΣMj|ΣMj=)/i) && row[2]) {
      const val = toNum(row[5]) || toNum(row[2]) || toNum(row[3]);
      linhas.push({
        orcamentoId, companyId, isHeader: false,
        codigo:    (ordem+1).toString(),
        descricao: c2.substring(0, 255),
        valor:     fix6(val),
        unidade:   '',
        ordem:     ordem++,
      });
    }
  }
  return linhas;
}

function parsearAbaTributos(rows: any[][], companyId: number, orcamentoId: number) {
  const linhas: any[] = [];
  let ordem = 0;
  for (const row of rows) {
    const c1 = String(row[1] || '').trim();
    const c2 = String(row[2] || '').trim();
    // Cabeçalho de grupo: 'A', 'B', etc.
    if (c1.match(/^[A-Z]$/) && c2.length > 3 && !c1.match(/^\d/)) {
      linhas.push({
        orcamentoId, companyId, isHeader: true,
        codigo: c1, descricao: c2.substring(0, 255),
        aliquota: '0', baseCalculo: '', valorCalculado: '0', ordem: ordem++,
      });
      continue;
    }
    // Linha de tributo: c1 = 'A.1', 'A.2', 'B.1' etc.
    if (c1.match(/^[A-Z]\.\d+/) && c2.length > 2) {
      const aliq = toNum(row[5]) || toNum(row[8]);
      const base = String(row[7] || '').trim();
      const calc = toNum(row[9]);
      linhas.push({
        orcamentoId, companyId, isHeader: false,
        codigo:         c1.substring(0, 30),
        descricao:      c2.substring(0, 255),
        aliquota:       fix6(aliq),
        baseCalculo:    base.substring(0, 50),
        valorCalculado: fix2(calc),
        ordem:          ordem++,
      });
    }
    // Sub-total
    if (c2.toLowerCase().startsWith('subtotal') && toNum(row[5]) !== 0) {
      linhas.push({
        orcamentoId, companyId, isHeader: true,
        codigo: 'Σ', descricao: c2.substring(0, 255),
        aliquota: fix6(toNum(row[5])), baseCalculo: '', valorCalculado: '0', ordem: ordem++,
      });
    }
  }
  return linhas;
}

function parsearAbaTaxaComercializacao(rows: any[][], companyId: number, orcamentoId: number) {
  const linhas: any[] = [];
  let ordem = 0;
  for (const row of rows) {
    const nonEmpty = row.filter((c: any) => String(c).trim() !== '');
    if (nonEmpty.length < 2) continue;
    // Procura linhas com código e descrição e valor numérico
    const col1 = String(row[1] || '').trim();
    const col2 = String(row[2] || '').trim();
    const col3 = String(row[3] || '').trim();
    if ((col1 || col2) && (col2 || col3).length > 2) {
      const desc = col2.length > 2 ? col2 : col3;
      const pct  = toNum(row[5]) || toNum(row[4]) || toNum(row[6]);
      const val  = toNum(row[7]) || toNum(row[8]) || toNum(row[9]);
      if (desc.length > 2 && (pct !== 0 || val !== 0)) {
        linhas.push({
          orcamentoId, companyId, isHeader: false,
          codigo:     (col1 || (ordem + 1).toString()).substring(0, 30),
          descricao:  desc.substring(0, 255),
          percentual: fix6(pct),
          valor:      fix2(val),
          ordem:      ordem++,
        });
      }
    }
  }
  return linhas;
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
      const [itens, insumos, bdiLinhas, tcLinhas] = await Promise.all([
        db.select().from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, input.id)).orderBy(orcamentoItens.ordem),
        db.select().from(orcamentoInsumos).where(eq(orcamentoInsumos.orcamentoId, input.id)).orderBy(desc(orcamentoInsumos.percentualTotal)),
        db.select().from(orcamentoBdi).where(eq(orcamentoBdi.orcamentoId, input.id)).orderBy(orcamentoBdi.ordem),
        db.select().from(bdiTaxaComercializacao).where(eq(bdiTaxaComercializacao.orcamentoId, input.id)),
      ]);
      // Soma dos percentuais de Lucro (L-0x) da taxa de comercialização → margem de lucro do BDI
      const margemLucroBdi = tcLinhas
        .filter(l => !l.isHeader)
        .reduce((s, l) => s + parseFloat(l.percentual || '0'), 0);
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
      return { ...orc, itens, insumos, bdiLinhas, margemLucroBdi, obra: obraRes, empresa: empresaRes };
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
      const { itens, colMap: colMapOrc } = parsearAbaCorcamento(dataOrc, input.metaPercentual, bdiPercentual);
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
      const totaisGerais  = extrairTotaisPlanilha(dataOrc, colMapOrc);
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

  // ── Definir Valor Negociado (por orçamento) ────────────────────────────
  setValorNegociado: protectedProcedure
    .input(z.object({
      id:             z.number(),
      valorNegociado: z.number().nullable(), // null = limpar/usar valor calculado
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      await db.update(orcamentos)
        .set({ valorNegociado: input.valorNegociado !== null ? fix2(input.valorNegociado) : null })
        .where(eq(orcamentos.id, input.id));
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

      const { itens, colMap: colMapOrc2 } = parsearAbaCorcamento(dataOrc, metaPerc, bdiFinal);
      if (itens.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum item encontrado na planilha.' });

      // Insumos opcionais
      const insumosTab = wb.SheetNames.find(n => n.toLowerCase() === 'insumos');
      const insumosItens = insumosTab
        ? parsearAbaInsumos(XLSX.utils.sheet_to_json(wb.Sheets[insumosTab], { header: 1, defval: '' }) as any[][], input.companyId)
        : [];

      // CPUs opcionais — Composições de Preços Unitários
      const cpusTabReimp = wb.SheetNames.find(n => n === 'CPUs' || n === 'Cpus' || n.toLowerCase() === 'cpus');
      const cpusParsedReimp = cpusTabReimp
        ? parsearAbaCPUs(XLSX.utils.sheet_to_json(wb.Sheets[cpusTabReimp], { header: 1, defval: '' }) as any[][], input.companyId)
        : { composicoes: [], linhasInsumos: [] };

      // Totais: lê a linha "TOTAIS GERAIS" da planilha (precisão total, sem arredondamento intermediário).
      const totaisGerais  = extrairTotaisPlanilha(dataOrc, colMapOrc2);
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

      // CPUs: upsert composições e seus insumos no catálogo global da empresa
      if (cpusParsedReimp.composicoes.length > 0) {
        await db.delete(composicoesCatalogo).where(eq(composicoesCatalogo.companyId, input.companyId));
        await db.delete(composicaoInsumos).where(eq(composicaoInsumos.companyId, input.companyId));
        for (let i = 0; i < cpusParsedReimp.composicoes.length; i += BATCH) {
          await db.insert(composicoesCatalogo).values(
            cpusParsedReimp.composicoes.slice(i, i + BATCH).map(c => ({
              ...c,
              totalOrcamentos: 1,
              ultimaAtualizacao: new Date().toISOString(),
              criadoEm: new Date().toISOString(),
            }))
          );
        }
        for (let i = 0; i < cpusParsedReimp.linhasInsumos.length; i += BATCH) {
          await db.insert(composicaoInsumos).values(
            cpusParsedReimp.linhasInsumos.slice(i, i + BATCH)
          );
        }
      }

      return {
        success: true,
        itemCount:    itens.length,
        insumosCount: insumosItens.length,
        composicoesCount: cpusParsedReimp.composicoes.length,
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

  // Alias para compatibilidade com o frontend
  changeStatus: protectedProcedure
    .input(z.object({
      id:     z.number(),
      status: z.enum(['rascunho', 'aguardando_aprovacao', 'aprovado', 'fechado']),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      const [orc] = await db.select().from(orcamentos).where(eq(orcamentos.id, input.id));
      if (!orc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Orçamento não encontrado.' });
      if (orc.status === 'fechado' && input.status !== 'fechado') throw new TRPCError({ code: 'FORBIDDEN', message: 'Orçamento fechado não pode ser reaberto.' });
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

      const cid = input.companyId;
      const oid = input.orcamentoId;
      const BATCH = 200;

      // Helpers para identificar cada aba pelo nome normalizado
      const findSheet = (...keys: string[]) =>
        wb.SheetNames.find(n => keys.some(k => n.toLowerCase().replace(/\s+/g,'').includes(k)));

      const getRows = (name: string) =>
        XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as any[][];

      // ── 1. Aba BDI (resumo principal) ──────────────────────────
      const bdtSheet = findSheet('bdi');
      if (!bdtSheet) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aba BDI não encontrada na planilha.' });

      const { bdiPercentual, linhas: bdiLinhas } = parsearAbaBdi(getRows(bdtSheet), cid, 'BDI');

      // ── 2. Indiretos ────────────────────────────────────────────
      const indiSheet = findSheet('indiretos');
      const indiLinhas = indiSheet ? parsearAbaIndiretos(getRows(indiSheet), cid, oid) : [];

      // ── 3. F.D. ─────────────────────────────────────────────────
      const fdSheet = findSheet('f.d.', 'fd', 'faturamentodireto');
      const fdLinhas = fdSheet ? parsearAbaFd(getRows(fdSheet), cid, oid) : [];

      // ── 4. Adm Central ──────────────────────────────────────────
      const admSheet = findSheet('admcentral', 'admcentral', 'central');
      const admLinhas = admSheet ? parsearAbaAdmCentral(getRows(admSheet), cid, oid) : [];

      // ── 5. Despesas Financeiras ─────────────────────────────────
      const dfSheet = findSheet('despesasfinanceiras', 'financeiras', 'despesas');
      const dfLinhas = dfSheet ? parsearAbaDespesasFinanceiras(getRows(dfSheet), cid, oid) : [];

      // ── 6. Tributos Fiscais ─────────────────────────────────────
      const tribSheet = findSheet('tributosfiscais', 'tributos', 'fiscais');
      const tribLinhas = tribSheet ? parsearAbaTributos(getRows(tribSheet), cid, oid) : [];

      // ── 7. Taxa de Comercialização ──────────────────────────────
      const tcSheet = findSheet('taxadecomercialização', 'taxacomercializacao', 'comercialização', 'comercializacao');
      const tcLinhas = tcSheet ? parsearAbaTaxaComercializacao(getRows(tcSheet), cid, oid) : [];

      if (!bdiLinhas.length && !indiLinhas.length && !fdLinhas.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhuma linha BDI encontrada na planilha.' });
      }

      // ── Limpar dados antigos ────────────────────────────────────
      await db.delete(orcamentoBdi)               .where(eq(orcamentoBdi.orcamentoId,               oid));
      await db.delete(bdiIndiretos)               .where(eq(bdiIndiretos.orcamentoId,               oid));
      await db.delete(bdiFd)                      .where(eq(bdiFd.orcamentoId,                      oid));
      await db.delete(bdiAdmCentral)              .where(eq(bdiAdmCentral.orcamentoId,              oid));
      await db.delete(bdiDespesasFinanceiras)     .where(eq(bdiDespesasFinanceiras.orcamentoId,     oid));
      await db.delete(bdiTributos)                .where(eq(bdiTributos.orcamentoId,                oid));
      await db.delete(bdiTaxaComercializacao)     .where(eq(bdiTaxaComercializacao.orcamentoId,     oid));

      // ── Inserir dados novos ─────────────────────────────────────
      for (let i = 0; i < bdiLinhas.length; i += BATCH)
        await db.insert(orcamentoBdi).values(bdiLinhas.slice(i, i + BATCH).map(b => ({ ...b, orcamentoId: oid })));

      for (let i = 0; i < indiLinhas.length; i += BATCH)
        await db.insert(bdiIndiretos).values(indiLinhas.slice(i, i + BATCH));

      for (let i = 0; i < fdLinhas.length; i += BATCH)
        await db.insert(bdiFd).values(fdLinhas.slice(i, i + BATCH));

      for (let i = 0; i < admLinhas.length; i += BATCH)
        await db.insert(bdiAdmCentral).values(admLinhas.slice(i, i + BATCH));

      for (let i = 0; i < dfLinhas.length; i += BATCH)
        await db.insert(bdiDespesasFinanceiras).values(dfLinhas.slice(i, i + BATCH));

      for (let i = 0; i < tribLinhas.length; i += BATCH)
        await db.insert(bdiTributos).values(tribLinhas.slice(i, i + BATCH));

      for (let i = 0; i < tcLinhas.length; i += BATCH)
        await db.insert(bdiTaxaComercializacao).values(tcLinhas.slice(i, i + BATCH));

      // ── Recalcular Venda dos itens com novo BDI% ───────────────
      if (bdiPercentual > 0) {
        const itens = await db.select().from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, oid));
        for (let i = 0; i < itens.length; i += BATCH) {
          for (const item of itens.slice(i, i + BATCH)) {
            const custo     = parseFloat(item.custoTotal     || '0');
            const custoUnit = parseFloat(item.custoUnitTotal || '0');
            await db.update(orcamentoItens).set({
              vendaTotal:     fix2(custo     * (1 + bdiPercentual)),
              vendaUnitTotal: fix4(custoUnit * (1 + bdiPercentual)),
            }).where(eq(orcamentoItens.id, item.id));
          }
        }
        const nivel1 = itens.filter(i => i.nivel === 1);
        await db.update(orcamentos).set({
          bdiPercentual: fix6(bdiPercentual),
          totalVenda:    fix2(nivel1.reduce((s, i) => s + parseFloat(i.custoTotal || '0') * (1 + bdiPercentual), 0)),
        }).where(eq(orcamentos.id, oid));
      }

      const abasImportadas = [
        bdtSheet  ? 'BDI'                    : null,
        indiSheet ? 'Indiretos'              : null,
        fdSheet   ? 'F.D.'                   : null,
        admSheet  ? 'Adm Central'            : null,
        dfSheet   ? 'Despesas Financeiras'   : null,
        tribSheet ? 'Tributos Fiscais'       : null,
        tcSheet   ? 'Taxa de Comercialização': null,
      ].filter(Boolean) as string[];

      return {
        success: true,
        linhasCount:    bdiLinhas.length + indiLinhas.length + fdLinhas.length + admLinhas.length + dfLinhas.length + tribLinhas.length + tcLinhas.length,
        bdiPercentual,
        abasImportadas,
      };
    }),

  // ── Buscar todos os dados detalhados BDI de um orçamento ──────
  getBdiDetalhes: protectedProcedure
    .input(z.object({ orcamentoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      const oid = input.orcamentoId;
      const [bdi, indiretos, fd, adm, despFinanc, tributos, taxaComercializacao] = await Promise.all([
        db.select().from(orcamentoBdi)           .where(eq(orcamentoBdi.orcamentoId,           oid)).orderBy(orcamentoBdi.ordem),
        db.select().from(bdiIndiretos)           .where(eq(bdiIndiretos.orcamentoId,           oid)).orderBy(bdiIndiretos.ordem),
        db.select().from(bdiFd)                  .where(eq(bdiFd.orcamentoId,                  oid)).orderBy(bdiFd.ordem),
        db.select().from(bdiAdmCentral)          .where(eq(bdiAdmCentral.orcamentoId,          oid)).orderBy(bdiAdmCentral.ordem),
        db.select().from(bdiDespesasFinanceiras) .where(eq(bdiDespesasFinanceiras.orcamentoId, oid)).orderBy(bdiDespesasFinanceiras.ordem),
        db.select().from(bdiTributos)            .where(eq(bdiTributos.orcamentoId,            oid)).orderBy(bdiTributos.ordem),
        db.select().from(bdiTaxaComercializacao) .where(eq(bdiTaxaComercializacao.orcamentoId, oid)).orderBy(bdiTaxaComercializacao.ordem),
      ]);
      return { bdi, indiretos, fd, adm, despFinanc, tributos, taxaComercializacao };
    }),

  // ── QUADRO 01 + 02: buscar parâmetros do orçamento ─────────────
  getBdiOrcamentoParams: protectedProcedure
    .input(z.object({ orcamentoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      const rows = await db.execute(
        `SELECT id, "tempoObraMeses", data_inicio, eventual_atraso_meses,
                dissidio_pct, dissidio_data, dissidio_incidencia_meses,
                hora_extra_uteis_pct, hora_extra_sabados_pct, hora_extra_domingos_pct,
                adicional_noturno_pct, incidencia_dissidio_meses, mdo_local_pct,
                dias_uteis_mes, horas_trab_sabados_mes, dias_uteis_noturno_mes, dom_trab_noturno_mes,
                presenca_mdo_uteis_d_pct, presenca_mdo_sab_d_pct, presenca_mdo_dom_d_pct,
                presenca_mdo_uteis_n_pct, presenca_mdo_sab_n_pct, presenca_mdo_dom_n_pct,
                nr_media_homens_mes, nr_qtd_bacia, nr_qtd_maximo,
                nr_ambulatorio, nr_tec_seg, nr_eng_seg,
                q2_cafe_manha, q2_almoco, q2_lanche_pct, q2_jantar_valor, q2_cestas_pct, q2_ref_coord,
                q2_cap_casa, q2_tarifa_mun, q2_tarifa_mun_pct, q2_tarifa_interbano, q2_tarifa_inter_pct,
                q2_transp_pub_prod, q2_transp_pub_sup, q2_transp_pub_coord,
                q2_transp_prop_prod, q2_transp_prop_sup, q2_transp_prop_coord,
                q2_mdo_aloj_prod, q2_mdo_aloj_sup, q2_mdo_aloj_coord,
                q2_aloj_prod, q2_aloj_sup, q2_aloj_coord,
                q2_naloj_prod, q2_naloj_sup, q2_naloj_coord
         FROM orcamentos WHERE id = ${input.orcamentoId} LIMIT 1`
      );
      return (rows.rows?.[0] ?? rows[0] ?? null) as any;
    }),

  updateBdiOrcamentoParams: protectedProcedure
    .input(z.object({
      orcamentoId: z.number(),
      tempoObraMeses: z.number().optional(),
      dataInicio: z.string().nullable().optional(),
      eventualAtrasoMeses: z.number().optional(),
      dissidioPct: z.number().optional(),
      dissidioData: z.string().nullable().optional(),
      dissidioIncidenciaMeses: z.number().optional(),
      horaExtraUteisPct: z.number().optional(),
      horaExtraSabadosPct: z.number().optional(),
      horaExtraDomingosPct: z.number().optional(),
      adicionalNoturnoPct: z.number().optional(),
      incidenciaDissidioMeses: z.number().optional(),
      mdoLocalPct: z.number().optional(),
      diasUteisMes: z.number().optional(),
      horasTrabSabadosMes: z.number().optional(),
      diasUteisNoturnaMes: z.number().optional(),
      domTrabNoturnaMes: z.number().optional(),
      presencaMdoUteisDPct: z.number().optional(),
      presencaMdoSabDPct: z.number().optional(),
      presencaMdoDomDPct: z.number().optional(),
      presencaMdoUteisNPct: z.number().optional(),
      presencaMdoSabNPct: z.number().optional(),
      presencaMdoDomNPct: z.number().optional(),
      nrMediaHomens: z.number().optional(),
      nrQtdBacia: z.number().optional(),
      nrQtdMaximo: z.number().optional(),
      nrAmbulatorio: z.string().optional(),
      nrTecSeg: z.string().optional(),
      nrEngSeg: z.string().optional(),
      // QUADRO 02
      q2CafeManha: z.number().optional(),
      q2Almoco: z.number().optional(),
      q2LanchePct: z.number().optional(),
      q2JantarValor: z.number().optional(),
      q2CestasPct: z.number().optional(),
      q2RefCoord: z.number().optional(),
      q2CapCasa: z.number().optional(),
      q2TarifaMun: z.number().optional(),
      q2TarifaMunPct: z.number().optional(),
      q2TarifaInterbano: z.number().optional(),
      q2TarifaInterPct: z.number().optional(),
      q2TranspPubProd: z.number().optional(),
      q2TranspPubSup: z.number().optional(),
      q2TranspPubCoord: z.number().optional(),
      q2TranspPropProd: z.number().optional(),
      q2TranspPropSup: z.number().optional(),
      q2TranspPropCoord: z.number().optional(),
      q2MdoAlojProd: z.number().optional(),
      q2MdoAlojSup: z.number().optional(),
      q2MdoAlojCoord: z.number().optional(),
      q2AlojProd: z.number().optional(),
      q2AlojSup: z.number().optional(),
      q2AlojCoord: z.number().optional(),
      q2NalojProd: z.number().optional(),
      q2NalojSup: z.number().optional(),
      q2NalojCoord: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      const { orcamentoId, ...fields } = input;
      const sets: string[] = [];
      const colMap: Record<string, string> = {
        tempoObraMeses: '"tempoObraMeses"',
        dataInicio: 'data_inicio',
        eventualAtrasoMeses: 'eventual_atraso_meses',
        dissidioPct: 'dissidio_pct',
        dissidioData: 'dissidio_data',
        dissidioIncidenciaMeses: 'dissidio_incidencia_meses',
        horaExtraUteisPct: 'hora_extra_uteis_pct',
        horaExtraSabadosPct: 'hora_extra_sabados_pct',
        horaExtraDomingosPct: 'hora_extra_domingos_pct',
        adicionalNoturnoPct: 'adicional_noturno_pct',
        incidenciaDissidioMeses: 'incidencia_dissidio_meses',
        mdoLocalPct: 'mdo_local_pct',
        diasUteisMes: 'dias_uteis_mes',
        horasTrabSabadosMes: 'horas_trab_sabados_mes',
        diasUteisNoturnaMes: 'dias_uteis_noturno_mes',
        domTrabNoturnaMes: 'dom_trab_noturno_mes',
        presencaMdoUteisDPct: 'presenca_mdo_uteis_d_pct',
        presencaMdoSabDPct: 'presenca_mdo_sab_d_pct',
        presencaMdoDomDPct: 'presenca_mdo_dom_d_pct',
        presencaMdoUteisNPct: 'presenca_mdo_uteis_n_pct',
        presencaMdoSabNPct: 'presenca_mdo_sab_n_pct',
        presencaMdoDomNPct: 'presenca_mdo_dom_n_pct',
        nrMediaHomens: 'nr_media_homens_mes',
        nrQtdBacia: 'nr_qtd_bacia',
        nrQtdMaximo: 'nr_qtd_maximo',
        nrAmbulatorio: 'nr_ambulatorio',
        nrTecSeg: 'nr_tec_seg',
        nrEngSeg: 'nr_eng_seg',
        q2CafeManha: 'q2_cafe_manha',
        q2Almoco: 'q2_almoco',
        q2LanchePct: 'q2_lanche_pct',
        q2JantarValor: 'q2_jantar_valor',
        q2CestasPct: 'q2_cestas_pct',
        q2RefCoord: 'q2_ref_coord',
        q2CapCasa: 'q2_cap_casa',
        q2TarifaMun: 'q2_tarifa_mun',
        q2TarifaMunPct: 'q2_tarifa_mun_pct',
        q2TarifaInterbano: 'q2_tarifa_interbano',
        q2TarifaInterPct: 'q2_tarifa_inter_pct',
        q2TranspPubProd: 'q2_transp_pub_prod',
        q2TranspPubSup: 'q2_transp_pub_sup',
        q2TranspPubCoord: 'q2_transp_pub_coord',
        q2TranspPropProd: 'q2_transp_prop_prod',
        q2TranspPropSup: 'q2_transp_prop_sup',
        q2TranspPropCoord: 'q2_transp_prop_coord',
        q2MdoAlojProd: 'q2_mdo_aloj_prod',
        q2MdoAlojSup: 'q2_mdo_aloj_sup',
        q2MdoAlojCoord: 'q2_mdo_aloj_coord',
        q2AlojProd: 'q2_aloj_prod',
        q2AlojSup: 'q2_aloj_sup',
        q2AlojCoord: 'q2_aloj_coord',
        q2NalojProd: 'q2_naloj_prod',
        q2NalojSup: 'q2_naloj_sup',
        q2NalojCoord: 'q2_naloj_coord',
      };
      for (const [key, col] of Object.entries(colMap)) {
        const val = (fields as any)[key];
        if (val === undefined) continue;
        if (val === null) sets.push(`${col} = NULL`);
        else if (typeof val === 'string') sets.push(`${col} = '${val.replace(/'/g, "''")}'`);
        else sets.push(`${col} = ${val}`);
      }
      if (sets.length > 0)
        await db.execute(`UPDATE orcamentos SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ${orcamentoId}`);

      // Recalcular CI-01 automaticamente quando parâmetros mudam
      const pRows = await db.execute(
        `SELECT "tempoObraMeses", eventual_atraso_meses, dissidio_pct, incidencia_dissidio_meses
         FROM orcamentos WHERE id = ${orcamentoId} LIMIT 1`
      );
      const p = (pRows.rows?.[0] ?? (pRows as any)[0]) as any;
      if (p) {
        const params: CI01Params = {
          tempoObraMeses:          (n(p.tempoObraMeses) || 0) + n(p.eventual_atraso_meses),
          dissidioPct:             n(p.dissidio_pct),
          incidenciaDissidioMeses: n(p.incidencia_dissidio_meses),
        };
        const linhas = await db.select().from(bdiIndiretos).where(eq(bdiIndiretos.orcamentoId, orcamentoId));
        for (const row of linhas) {
          if (!row.secao || row.secao !== 'CI-01') continue;
          if (!row.tipoContrato || row.tipoContrato === 'SUBHDR' || row.isHeader) continue;
          const rowData: CI01Row = {
            salarioBase:     n(row.salarioBase),
            bonusMensal:     n(row.bonusMensal),
            quantidade:      n(row.quantidade),
            tipoContrato:    row.tipoContrato ?? '',
            txTransferencia: n(row.txTransferencia ?? '0'),
          };
          const calc = calcCI01Linha(rowData, params);
          await db.update(bdiIndiretos).set({
            valorHora:            fix6(calc.valorHora),
            decimoTerceiroFerias: fix2(calc.decimoTerceiroFerias),
            totalMes:             fix2(calc.totalMes),
            totalObra:            fix2(calc.totalObra),
            mesesObra:            String(calc.mesesObra),
          }).where(eq(bdiIndiretos.id, row.id));
        }
      }

      return { success: true };
    }),

  // ── Update endpoints — cada sub-aba tem o seu ──────────────────
  updateBdiIndiretosLinha: protectedProcedure
    .input(z.object({
      id:                   z.number(),
      // CI-01 fields
      quantidade:           z.number().optional(),
      salarioBase:          z.number().optional(),
      bonusMensal:          z.number().optional(),
      txTransferencia:      z.number().optional(),
      decimoTerceiroFerias: z.number().optional(),
      tipoContrato:         z.string().optional(),
      // CI-02+ fields
      vidaUtil:             z.number().optional(),
      deltaT:               z.number().nullable().optional(),
      pctIncidencia:        z.number().optional(),
      valorUnit:            z.number().optional(),
      mesesObra:            z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      const { id } = input;
      const upd: any = {};
      if (input.quantidade         !== undefined) upd.quantidade         = fix2(input.quantidade);
      if (input.salarioBase        !== undefined) upd.salarioBase        = fix2(input.salarioBase);
      if (input.bonusMensal        !== undefined) upd.bonusMensal        = fix2(input.bonusMensal);
      if (input.txTransferencia    !== undefined) upd.txTransferencia    = fix6(input.txTransferencia);
      if (input.tipoContrato       !== undefined) upd.tipoContrato       = input.tipoContrato;
      if (input.vidaUtil           !== undefined) upd.vidaUtil           = fix2(input.vidaUtil);
      if (input.deltaT             !== undefined) upd.deltaT             = input.deltaT !== null ? fix2(input.deltaT) : null;
      if (input.pctIncidencia      !== undefined) upd.pctIncidencia      = fix6(input.pctIncidencia);
      if (input.valorUnit          !== undefined) upd.valorUnit          = fix2(input.valorUnit);
      if (input.mesesObra          !== undefined) upd.mesesObra          = fix2(input.mesesObra);
      if (Object.keys(upd).length === 0) return { success: true };
      await db.update(bdiIndiretos).set(upd).where(eq(bdiIndiretos.id, id));

      // Recarregar linha atualizada
      const [row] = await db.select().from(bdiIndiretos).where(eq(bdiIndiretos.id, id));
      if (!row || row.isHeader) return { success: true };

      const secao = row.secao ?? '';

      if (secao === 'CI-01' || !secao) {
        // ── CI-01: recalcular Valor/h, 13°+Férias, TotalMês, TotalObra ─────────
        const effectiveTipo = (input.tipoContrato ?? row.tipoContrato ?? '');
        const isPersonnel   = effectiveTipo === 'CLT' || effectiveTipo === 'Contrato';
        if (isPersonnel) {
          const pRows = await db.execute(
            `SELECT "tempoObraMeses", eventual_atraso_meses, dissidio_pct, incidencia_dissidio_meses
             FROM orcamentos WHERE id = ${row.orcamentoId} LIMIT 1`
          );
          const p = (pRows.rows?.[0] ?? (pRows as any)[0]) as any;
          if (p) {
            const params: CI01Params = {
              tempoObraMeses:          (n(p.tempoObraMeses) || 0) + n(p.eventual_atraso_meses),
              dissidioPct:             n(p.dissidio_pct),
              incidenciaDissidioMeses: n(p.incidencia_dissidio_meses),
            };
            const rowData: CI01Row = {
              salarioBase:     n(upd.salarioBase  ?? row.salarioBase),
              bonusMensal:     n(upd.bonusMensal  ?? row.bonusMensal),
              quantidade:      n(upd.quantidade   ?? row.quantidade),
              tipoContrato:    effectiveTipo,
              txTransferencia: n(upd.txTransferencia ?? row.txTransferencia ?? '0'),
            };
            const calc = calcCI01Linha(rowData, params);
            await db.update(bdiIndiretos).set({
              valorHora:            fix6(calc.valorHora),
              decimoTerceiroFerias: fix2(calc.decimoTerceiroFerias),
              totalMes:             fix2(calc.totalMes),
              totalObra:            fix2(calc.totalObra),
              mesesObra:            String(calc.mesesObra),
            }).where(eq(bdiIndiretos.id, id));
          }
        }

      } else if (secao.match(/^CI-0[2-7]$/)) {
        // ── CI-02+: recalcular total_linha = qty × pct × meses × valor_unit ──
        const qty   = n(upd.quantidade   ?? row.quantidade);
        const meses = n(upd.mesesObra    ?? row.mesesObra) || 1;
        const vu    = n(upd.valorUnit    ?? row.valorUnit);
        // pct: se delta_t mudou recalcula; senão usa pct_incidencia armazenado
        let pct: number;
        const newDeltaT  = upd.deltaT !== undefined ? (upd.deltaT !== null ? n(upd.deltaT) : null) : (row.deltaT !== null && row.deltaT !== undefined ? n(row.deltaT) : null);
        const vidaUtilV  = n(upd.vidaUtil ?? row.vidaUtil);
        if (newDeltaT === null) {
          pct = 1.0; // N/A → 100%
        } else if (upd.deltaT !== undefined || upd.vidaUtil !== undefined) {
          pct = vidaUtilV > 0 ? newDeltaT / vidaUtilV : 1.0;
        } else {
          pct = n(upd.pctIncidencia ?? row.pctIncidencia) || 1.0;
        }
        const total = qty * pct * meses * vu;
        await db.update(bdiIndiretos).set({
          pctIncidencia: fix6(pct),
          totalLinha:    fix2(total),
          totalObra:     fix2(total),
        }).where(eq(bdiIndiretos.id, id));
      }

      return { success: true };
    }),

  recalcularBdiCI01: protectedProcedure
    .input(z.object({ orcamentoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      const { orcamentoId } = input;

      // Parâmetros do orçamento
      const pRows = await db.execute(
        `SELECT "tempoObraMeses", eventual_atraso_meses, dissidio_pct, incidencia_dissidio_meses
         FROM orcamentos WHERE id = ${orcamentoId} LIMIT 1`
      );
      const p = (pRows.rows?.[0] ?? (pRows as any)[0]) as any;
      if (!p) return { updated: 0 };

      const params: CI01Params = {
        tempoObraMeses:          (n(p.tempoObraMeses) || 0) + n(p.eventual_atraso_meses),
        dissidioPct:             n(p.dissidio_pct),
        incidenciaDissidioMeses: n(p.incidencia_dissidio_meses),
      };

      // Buscar todas as linhas CI-01 com modalidade válida
      const linhas = await db.select().from(bdiIndiretos).where(
        eq(bdiIndiretos.orcamentoId, orcamentoId)
      );
      const ci01Linhas = linhas.filter(l =>
        l.secao === 'CI-01' && l.tipoContrato && l.tipoContrato !== 'SUBHDR' && !l.isHeader
      );

      let updated = 0;
      for (const row of ci01Linhas) {
        const rowData: CI01Row = {
          salarioBase:     n(row.salarioBase),
          bonusMensal:     n(row.bonusMensal),
          quantidade:      n(row.quantidade),
          tipoContrato:    row.tipoContrato ?? '',
          txTransferencia: n(row.txTransferencia ?? '0'),
        };
        const calc = calcCI01Linha(rowData, params);
        await db.update(bdiIndiretos).set({
          valorHora:            fix6(calc.valorHora),
          decimoTerceiroFerias: fix2(calc.decimoTerceiroFerias),
          totalMes:             fix2(calc.totalMes),
          totalObra:            fix2(calc.totalObra),
          mesesObra:            String(calc.mesesObra),
        }).where(eq(bdiIndiretos.id, row.id));
        updated++;
      }
      return { updated };
    }),

  updateBdiFdLinha: protectedProcedure
    .input(z.object({ id: z.number(), qtdOrcada: z.number().optional(), precoUnit: z.number().optional(), fornecedor: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      const { id, qtdOrcada, precoUnit, fornecedor } = input;
      const upd: any = {};
      if (qtdOrcada  !== undefined) { upd.qtdOrcada = fix2(qtdOrcada); }
      if (precoUnit  !== undefined) { upd.precoUnit = fix6(precoUnit); }
      if (fornecedor !== undefined) { upd.fornecedor = fornecedor.substring(0, 255); }
      if (upd.qtdOrcada !== undefined || upd.precoUnit !== undefined) {
        const [cur] = await db.select().from(bdiFd).where(eq(bdiFd.id, id));
        if (cur) {
          const qty = upd.qtdOrcada !== undefined ? parseFloat(upd.qtdOrcada) : parseFloat(cur.qtdOrcada || '0');
          const pu  = upd.precoUnit  !== undefined ? parseFloat(upd.precoUnit)  : parseFloat(cur.precoUnit  || '0');
          upd.total = fix2(qty * pu);
        }
      }
      if (Object.keys(upd).length > 0)
        await db.update(bdiFd).set(upd).where(eq(bdiFd.id, id));
      return { success: true };
    }),

  updateBdiAdmCentralLinha: protectedProcedure
    .input(z.object({ id: z.number(), base: z.number().optional(), encargos: z.number().optional(), beneficios: z.number().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      const { id, base, encargos, beneficios } = input;
      const upd: any = {};
      if (base       !== undefined) upd.base       = fix2(base);
      if (encargos   !== undefined) upd.encargos   = fix6(encargos);
      if (beneficios !== undefined) upd.beneficios = fix2(beneficios);
      if (upd.base !== undefined || upd.encargos !== undefined || upd.beneficios !== undefined) {
        const [cur] = await db.select().from(bdiAdmCentral).where(eq(bdiAdmCentral.id, id));
        if (cur) {
          const b = upd.base       ?? parseFloat(cur.base       || '0');
          const e = upd.encargos   ?? parseFloat(cur.encargos   || '0');
          const n = upd.beneficios ?? parseFloat(cur.beneficios || '0');
          upd.total = fix2(parseFloat(b) * (1 + parseFloat(e)) + parseFloat(n));
        }
      }
      if (Object.keys(upd).length > 0)
        await db.update(bdiAdmCentral).set(upd).where(eq(bdiAdmCentral.id, id));
      return { success: true };
    }),

  updateBdiDespesasFinanceirasLinha: protectedProcedure
    .input(z.object({ id: z.number(), valor: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      await db.update(bdiDespesasFinanceiras).set({ valor: fix6(input.valor) }).where(eq(bdiDespesasFinanceiras.id, input.id));
      return { success: true };
    }),

  updateBdiTributosLinha: protectedProcedure
    .input(z.object({ id: z.number(), aliquota: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      await db.update(bdiTributos).set({ aliquota: fix6(input.aliquota) }).where(eq(bdiTributos.id, input.id));
      return { success: true };
    }),

  updateBdiTaxaComercializacaoLinha: protectedProcedure
    .input(z.object({ id: z.number(), percentual: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });
      await db.update(bdiTaxaComercializacao).set({ percentual: fix6(input.percentual) }).where(eq(bdiTaxaComercializacao.id, input.id));
      return { success: true };
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

  // ── Parâmetros de encargos (L.S. e H.E.) ─────────────────
  getParametros: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ls: '0', he: '0' };
      const rows = await db.select().from(orcamentoParametros)
        .where(eq(orcamentoParametros.companyId, input.companyId))
        .limit(1);
      if (rows.length === 0) return { ls: '0', he: '0' };
      return { ls: rows[0].ls ?? '0', he: rows[0].he ?? '0' };
    }),

  salvarParametros: protectedProcedure
    .input(z.object({ companyId: z.number(), ls: z.string(), he: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      const lsVal = parseFloat(input.ls) || 0;
      const heVal = parseFloat(input.he) || 0;
      const existing = await db.select({ id: orcamentoParametros.id })
        .from(orcamentoParametros)
        .where(eq(orcamentoParametros.companyId, input.companyId))
        .limit(1);
      if (existing.length > 0) {
        await db.update(orcamentoParametros)
          .set({ ls: String(lsVal), he: String(heVal), atualizadoEm: new Date().toISOString() })
          .where(eq(orcamentoParametros.companyId, input.companyId));
      } else {
        await db.insert(orcamentoParametros).values({
          companyId: input.companyId,
          ls: String(lsVal),
          he: String(heVal),
        });
      }
      return { ok: true };
    }),

  // ── Encargos Sociais ──────────────────────────────────────
  listarEncargos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      let rows = await db.select().from(encargosSociais)
        .where(eq(encargosSociais.companyId, input.companyId))
        .orderBy(encargosSociais.ordem);
      if (rows.length === 0) {
        await db.insert(encargosSociais).values(
          ENCARGOS_DEFAULTS.map(d => ({ ...d, companyId: input.companyId }))
        );
        rows = await db.select().from(encargosSociais)
          .where(eq(encargosSociais.companyId, input.companyId))
          .orderBy(encargosSociais.ordem);
      }
      return rows;
    }),

  salvarEncargo: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number(), valor: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      const valorNum = parseFloat(input.valor) || 0;
      await db.update(encargosSociais)
        .set({ valor: valorNum.toFixed(4) })
        .where(and(eq(encargosSociais.id, input.id), eq(encargosSociais.companyId, input.companyId)));
      const rows = await db.select().from(encargosSociais)
        .where(eq(encargosSociais.companyId, input.companyId));
      const sumGroup = (g: string) => rows.filter(r => r.grupo === g).reduce((s, r) => s + parseFloat(r.valor || '0'), 0);
      const subA = sumGroup('A');
      const subB = sumGroup('B');
      const subC = sumGroup('C');
      const subE = sumGroup('E');
      const subF = sumGroup('F');
      const groupD = (subA * subB) / 100;
      const totalLs = subA + subB + subC + groupD + subE + subF;
      const existing = await db.select().from(orcamentoParametros)
        .where(eq(orcamentoParametros.companyId, input.companyId)).limit(1);
      if (existing.length > 0) {
        await db.update(orcamentoParametros)
          .set({ ls: totalLs.toFixed(4), atualizadoEm: new Date().toISOString() })
          .where(eq(orcamentoParametros.companyId, input.companyId));
      } else {
        await db.insert(orcamentoParametros).values({ companyId: input.companyId, ls: totalLs.toFixed(4), he: '0' });
      }
      return { ok: true, totalLs: totalLs.toFixed(2) };
    }),

  // ── Restaurar encargos ao padrão ─────────────────────────
  restaurarEncargos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB indisponível' });
      await db.delete(encargosSociais).where(eq(encargosSociais.companyId, input.companyId));
      await db.insert(encargosSociais).values(
        ENCARGOS_DEFAULTS.map(d => ({ ...d, companyId: input.companyId }))
      );
      const subA = ENCARGOS_DEFAULTS.filter(d => d.grupo === 'A').reduce((s, d) => s + parseFloat(d.valor), 0);
      const subB = ENCARGOS_DEFAULTS.filter(d => d.grupo === 'B').reduce((s, d) => s + parseFloat(d.valor), 0);
      const subC = ENCARGOS_DEFAULTS.filter(d => d.grupo === 'C').reduce((s, d) => s + parseFloat(d.valor), 0);
      const subE = ENCARGOS_DEFAULTS.filter(d => d.grupo === 'E').reduce((s, d) => s + parseFloat(d.valor), 0);
      const subF = ENCARGOS_DEFAULTS.filter(d => d.grupo === 'F').reduce((s, d) => s + parseFloat(d.valor), 0);
      const groupD  = (subA * subB) / 100;
      const totalLs = subA + subB + subC + groupD + subE + subF;
      const existing = await db.select().from(orcamentoParametros)
        .where(eq(orcamentoParametros.companyId, input.companyId)).limit(1);
      if (existing.length > 0) {
        await db.update(orcamentoParametros)
          .set({ ls: totalLs.toFixed(4), atualizadoEm: new Date().toISOString() })
          .where(eq(orcamentoParametros.companyId, input.companyId));
      } else {
        await db.insert(orcamentoParametros).values({ companyId: input.companyId, ls: totalLs.toFixed(4), he: '0' });
      }
      return { ok: true, totalLs: totalLs.toFixed(2) };
    }),

  // ── Resumo para o painel ──────────────────────────────────
  painel: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return {
        total: 0, totalVenda: 0, totalCusto: 0, totalMeta: 0, totalMat: 0, totalMdo: 0, totalEquip: 0,
        bdiMedio: 0, margemMedia: 0, recentes: [], porStatus: [], porCliente: [], porBdi: [], porMargem: [], lista: [],
      };

      const lista = await db.select().from(orcamentos)
        .where(and(eq(orcamentos.companyId, input.companyId), isNull(orcamentos.deletedAt)))
        .orderBy(desc(orcamentos.createdAt));

      const n = (v: any) => parseFloat(v || '0');

      // Totais gerais
      const total      = lista.length;
      const totalVenda = lista.reduce((s, o) => s + n(o.totalVenda), 0);
      const totalCusto = lista.reduce((s, o) => s + n(o.totalCusto), 0);
      const totalMeta  = lista.reduce((s, o) => s + n(o.totalMeta),  0);
      const totalMat   = lista.reduce((s, o) => s + n(o.totalMateriais), 0);
      const totalMdo   = lista.reduce((s, o) => s + n(o.totalMdo),   0);
      const totalEquip = lista.reduce((s, o) => s + n(o.totalEquipamentos), 0);

      // BDI médio ponderado por custo
      const bdiMedio = totalCusto > 0
        ? lista.reduce((s, o) => s + n(o.bdiPercentual) * n(o.totalCusto), 0) / totalCusto
        : 0;
      const margemMedia = totalVenda > 0 ? (totalVenda - totalCusto) / totalVenda : 0;

      // Por status
      const statusMap: Record<string, { count: number; venda: number; custo: number }> = {};
      for (const o of lista) {
        const s = o.status || 'rascunho';
        if (!statusMap[s]) statusMap[s] = { count: 0, venda: 0, custo: 0 };
        statusMap[s].count++;
        statusMap[s].venda += n(o.totalVenda);
        statusMap[s].custo += n(o.totalCusto);
      }
      const porStatus = Object.entries(statusMap).map(([status, d]) => ({ status, ...d }));

      // Top clientes por volume de venda
      const clienteMap: Record<string, number> = {};
      for (const o of lista) {
        const c = o.cliente?.trim() || 'Sem cliente';
        clienteMap[c] = (clienteMap[c] || 0) + n(o.totalVenda);
      }
      const porCliente = Object.entries(clienteMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([cliente, venda]) => ({ cliente: cliente.length > 20 ? cliente.slice(0, 20) + '…' : cliente, venda }));

      // Por BDI
      const porBdi = lista
        .filter(o => n(o.bdiPercentual) > 0 && n(o.totalCusto) > 0)
        .sort((a, b) => n(b.bdiPercentual) - n(a.bdiPercentual))
        .slice(0, 10)
        .map(o => ({
          codigo: o.codigo.length > 12 ? o.codigo.slice(0, 12) + '…' : o.codigo,
          bdi: Math.round(n(o.bdiPercentual) * 10000) / 100,
          venda: n(o.totalVenda),
          custo: n(o.totalCusto),
        }));

      // Por margem
      const porMargem = lista
        .filter(o => n(o.totalVenda) > 0 && n(o.totalCusto) > 0)
        .sort((a, b) => n(b.totalVenda) - n(a.totalVenda))
        .slice(0, 10)
        .map(o => {
          const venda = n(o.totalVenda);
          const custo = n(o.totalCusto);
          const margem = venda > 0 ? ((venda - custo) / venda) * 100 : 0;
          return {
            codigo: o.codigo.length > 12 ? o.codigo.slice(0, 12) + '…' : o.codigo,
            venda, custo, meta: n(o.totalMeta),
            margem: Math.round(margem * 100) / 100,
            bdi: Math.round(n(o.bdiPercentual) * 10000) / 100,
          };
        });

      return {
        total, totalVenda, totalCusto, totalMeta, totalMat, totalMdo, totalEquip,
        bdiMedio, margemMedia,
        recentes: lista.slice(0, 5),
        porStatus, porCliente, porBdi, porMargem,
        lista: lista.slice(0, 50).map(o => ({
          id: o.id, codigo: o.codigo, cliente: o.cliente, local: o.local,
          status: o.status, bdiPercentual: o.bdiPercentual,
          totalVenda: o.totalVenda, totalCusto: o.totalCusto, totalMeta: o.totalMeta,
          createdAt: o.createdAt,
        })),
      };
    }),
});
