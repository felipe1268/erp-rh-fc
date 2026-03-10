import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  orcamentos,
  orcamentoItens,
  orcamentoInsumos,
  orcamentoBdi,
} from "../../drizzle/schema";
import { eq, and, desc, isNull, inArray } from "drizzle-orm";

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

// Parseia a aba Orçamento e retorna array de itens
function parsearAbaCorcamento(rows: any[][], metaPerc: number) {
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
    const vendaTotal     = toNum(row[24]);
    const custoTotalMat  = toNum(row[30]);
    const custoTotalMdo  = toNum(row[31]);
    const custoTotal     = toNum(row[32]);
    const metaTotal      = custoTotal * (1 - metaPerc);
    const vendaUnitTotal = quantidade > 0 ? vendaTotal / quantidade : 0;
    const metaUnitTotal  = quantidade > 0 ? metaTotal / quantidade : 0;
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
function parsearAbaBdi(rows: any[][], companyId: number) {
  let bdiPercentual = 0;
  const linhas: any[] = [];
  let ordem = 0;

  for (const row of rows) {
    const col1 = String(row[1] || '').trim();
    const col2 = String(row[2] || '').trim();
    const descCol = String(row[3] || '').trim();

    if ((col2 === 'B-02' || col1 === 'B-02') && !bdiPercentual) {
      bdiPercentual = toNum(row[7]) || toNum(row[6]);
    }

    if (col2 && descCol && descCol.length > 2) {
      const pct = toNum(row[7]);
      const val = toNum(row[9]);
      linhas.push({
        companyId,
        codigo:       col2.substring(0, 30),
        descricao:    descCol.substring(0, 255),
        percentual:   fix6(pct),
        valorAbsoluto: fix2(val),
        ordem: ordem++,
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
      const itens    = await db.select().from(orcamentoItens).where(eq(orcamentoItens.orcamentoId, input.id)).orderBy(orcamentoItens.ordem);
      const insumos  = await db.select().from(orcamentoInsumos).where(eq(orcamentoInsumos.orcamentoId, input.id)).orderBy(orcamentoInsumos.percentualTotal);
      const bdiLinhas = await db.select().from(orcamentoBdi).where(eq(orcamentoBdi.orcamentoId, input.id)).orderBy(orcamentoBdi.ordem);
      return { ...orc, itens, insumos, bdiLinhas };
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

      // Itens da EAP
      const itens = parsearAbaCorcamento(dataOrc, input.metaPercentual);
      if (itens.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum item encontrado na planilha.' });

      // BDI
      const { bdiPercentual, linhas: bdiLinhas } = parsearAbaBdi(dataBdi, input.companyId);

      // Insumos (aba "Insumos" se existir)
      const insumosTab = wb.SheetNames.find(n => n.toLowerCase() === 'insumos');
      const insumosItens = insumosTab
        ? parsearAbaInsumos(XLSX.utils.sheet_to_json(wb.Sheets[insumosTab], { header: 1, defval: '' }) as any[][], input.companyId)
        : [];

      // Calcular totais pelos itens de nível 1
      const nivel1 = itens.filter(i => i.nivel === 1);
      const totalVenda    = nivel1.reduce((s, i) => s + parseFloat(i.vendaTotal),    0);
      const totalCusto    = nivel1.reduce((s, i) => s + parseFloat(i.custoTotal),    0);
      const totalMeta     = totalCusto * (1 - input.metaPercentual);
      const totalMateriais = nivel1.reduce((s, i) => s + parseFloat(i.custoTotalMat), 0);
      const totalMdo      = nivel1.reduce((s, i) => s + parseFloat(i.custoTotalMdo),  0);

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

      return { id: orcamentoId, codigo, totalVenda, totalCusto, totalMeta, itemCount: itens.length };
    }),

  // ── Atualizar percentual Meta (admin_master) ──────────────
  updateMeta: protectedProcedure
    .input(z.object({
      id:             z.number(),
      metaPercentual: z.number().min(0).max(0.99),
      userName:       z.string(),
      userId:         z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco não disponível.' });

      const [orc] = await db.select().from(orcamentos).where(eq(orcamentos.id, input.id));
      if (!orc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Orçamento não encontrado.' });
      if (orc.status === 'fechado') throw new TRPCError({ code: 'FORBIDDEN', message: 'Orçamento fechado não pode ser alterado.' });

      const totalCusto = parseFloat(orc.totalCusto || '0');
      const totalMeta  = totalCusto * (1 - input.metaPercentual);

      await db.update(orcamentos).set({
        metaPercentual:    fix4(input.metaPercentual),
        totalMeta:         fix2(totalMeta),
        metaAprovadaPor:   input.userName,
        metaAprovadaEm:    new Date().toISOString(),
        metaAprovadaUserId: input.userId,
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
