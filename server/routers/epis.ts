import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { epis, epiDeliveries, employees, systemCriteria } from "../../drizzle/schema";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { storagePut } from "../storage";

export const episRouter = router({
  // ============================================================
  // CATÁLOGO DE EPIs
  // ============================================================
  list: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(epis).where(eq(epis.companyId, input.companyId)).orderBy(epis.nome);
    }),

  create: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nome: z.string().min(1),
      ca: z.string().optional(),
      validadeCa: z.string().optional(),
      fabricante: z.string().optional(),
      fornecedor: z.string().optional(),
      quantidadeEstoque: z.number().default(0),
      valorProduto: z.number().optional(),
      tempoMinimoTroca: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const result = await db.insert(epis).values({
        companyId: input.companyId,
        nome: input.nome,
        ca: input.ca || null,
        validadeCa: input.validadeCa || null,
        fabricante: input.fabricante || null,
        fornecedor: input.fornecedor || null,
        quantidadeEstoque: input.quantidadeEstoque,
        valorProduto: input.valorProduto != null ? String(input.valorProduto) : null,
        tempoMinimoTroca: input.tempoMinimoTroca || null,
      } as any);
      return { id: result[0].insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      ca: z.string().optional(),
      validadeCa: z.string().optional(),
      fabricante: z.string().optional(),
      fornecedor: z.string().optional(),
      quantidadeEstoque: z.number().optional(),
      valorProduto: z.number().nullable().optional(),
      tempoMinimoTroca: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      const updateData: any = {};
      if (data.nome !== undefined) updateData.nome = data.nome;
      if (data.ca !== undefined) updateData.ca = data.ca;
      if (data.validadeCa !== undefined) updateData.validadeCa = data.validadeCa;
      if (data.fabricante !== undefined) updateData.fabricante = data.fabricante;
      if (data.fornecedor !== undefined) updateData.fornecedor = data.fornecedor;
      if (data.quantidadeEstoque !== undefined) updateData.quantidadeEstoque = data.quantidadeEstoque;
      if (data.valorProduto !== undefined) updateData.valorProduto = data.valorProduto != null ? String(data.valorProduto) : null;
      if (data.tempoMinimoTroca !== undefined) updateData.tempoMinimoTroca = data.tempoMinimoTroca;
      await db.update(epis).set(updateData).where(eq(epis.id, id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(epiDeliveries).where(eq(epiDeliveries.epiId, input.id));
      await db.delete(epis).where(eq(epis.id, input.id));
      return { success: true };
    }),

  deleteBatch: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { inArray } = await import("drizzle-orm");
      await db.delete(epiDeliveries).where(inArray(epiDeliveries.epiId, input.ids));
      await db.delete(epis).where(inArray(epis.id, input.ids));
      return { success: true, deleted: input.ids.length };
    }),

  // ============================================================
  // ENTREGAS DE EPIs
  // ============================================================
  listDeliveries: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number().optional(),
      epiId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conds: any[] = [eq(epiDeliveries.companyId, input.companyId), isNull(epiDeliveries.deletedAt)];
      if (input.employeeId) conds.push(eq(epiDeliveries.employeeId, input.employeeId));
      if (input.epiId) conds.push(eq(epiDeliveries.epiId, input.epiId));

      return db.select({
        id: epiDeliveries.id,
        companyId: epiDeliveries.companyId,
        epiId: epiDeliveries.epiId,
        employeeId: epiDeliveries.employeeId,
        quantidade: epiDeliveries.quantidade,
        dataEntrega: epiDeliveries.dataEntrega,
        dataDevolucao: epiDeliveries.dataDevolucao,
        motivo: epiDeliveries.motivo,
        observacoes: epiDeliveries.observacoes,
        motivoTroca: epiDeliveries.motivoTroca,
        valorCobrado: epiDeliveries.valorCobrado,
        fichaUrl: epiDeliveries.fichaUrl,
        createdAt: epiDeliveries.createdAt,
        nomeEpi: epis.nome,
        caEpi: epis.ca,
        valorProdutoEpi: epis.valorProduto,
        tempoMinimoTrocaEpi: epis.tempoMinimoTroca,
        nomeFunc: employees.nomeCompleto,
        funcaoFunc: employees.funcao,
      })
        .from(epiDeliveries)
        .leftJoin(epis, eq(epiDeliveries.epiId, epis.id))
        .leftJoin(employees, eq(epiDeliveries.employeeId, employees.id))
        .where(and(...conds))
        .orderBy(desc(epiDeliveries.dataEntrega));
    }),

  createDelivery: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      epiId: z.number(),
      employeeId: z.number(),
      quantidade: z.number().min(1).default(1),
      dataEntrega: z.string(),
      dataDevolucao: z.string().optional(),
      motivo: z.string().optional(),
      observacoes: z.string().optional(),
      motivoTroca: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;

      // Get EPI info for charge calculation
      const [epi] = await db.select().from(epis).where(eq(epis.id, input.epiId));
      let valorCobrado: string | null = null;

      // If motivo_troca is perda or mau_uso, calculate charge with BDI
      if (input.motivoTroca && ['perda', 'mau_uso', 'furto'].includes(input.motivoTroca) && epi?.valorProduto) {
        // Get BDI percentage from system criteria
        const bdiRows = await db.select().from(systemCriteria)
          .where(and(
            eq(systemCriteria.companyId, input.companyId),
            eq(systemCriteria.chave, 'epi_bdi_percentual')
          ));
        const bdiPct = bdiRows.length > 0 ? parseFloat(bdiRows[0].valor) : 40; // default 40%
        const custoBase = parseFloat(String(epi.valorProduto));
        valorCobrado = String(Math.round(custoBase * (1 + bdiPct / 100) * 100) / 100);
      }

      const result = await db.insert(epiDeliveries).values({
        companyId: input.companyId,
        epiId: input.epiId,
        employeeId: input.employeeId,
        quantidade: input.quantidade,
        dataEntrega: input.dataEntrega,
        dataDevolucao: input.dataDevolucao || null,
        motivo: input.motivo || null,
        observacoes: input.observacoes || null,
        motivoTroca: input.motivoTroca || null,
        valorCobrado,
      } as any);

      // Update stock (decrement)
      await db.update(epis)
        .set({ quantidadeEstoque: sql`GREATEST(${epis.quantidadeEstoque} - ${input.quantidade}, 0)` })
        .where(eq(epis.id, input.epiId));

      return { id: result[0].insertId, valorCobrado };
    }),

  deleteDelivery: protectedProcedure
    .input(z.object({ id: z.number(), epiId: z.number(), quantidade: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(epiDeliveries).set({
        deletedAt: sql`NOW()`,
        deletedBy: ctx.user.name ?? 'Sistema',
        deletedByUserId: ctx.user.id
      } as any).where(eq(epiDeliveries.id, input.id));
      // Return to stock
      await db.update(epis)
        .set({ quantidadeEstoque: sql`${epis.quantidadeEstoque} + ${input.quantidade}` })
        .where(eq(epis.id, input.epiId));
      return { success: true };
    }),

  // Upload signed EPI delivery form
  uploadFicha: protectedProcedure
    .input(z.object({ deliveryId: z.number(), fileBase64: z.string(), fileName: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.fileName.split(".").pop() || "pdf";
      const key = `documentos/epi-fichas/${input.deliveryId}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, ext === "pdf" ? "application/pdf" : "application/octet-stream");
      await db.update(epiDeliveries).set({ fichaUrl: url } as any).where(eq(epiDeliveries.id, input.deliveryId));
      return { url };
    }),

  // ============================================================
  // BDI CONFIGURATION
  // ============================================================
  getBdi: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db.select().from(systemCriteria)
        .where(and(
          eq(systemCriteria.companyId, input.companyId),
          eq(systemCriteria.chave, 'epi_bdi_percentual')
        ));
      return { bdiPercentual: rows.length > 0 ? parseFloat(rows[0].valor) : 40 };
    }),

  setBdi: protectedProcedure
    .input(z.object({ companyId: z.number(), bdiPercentual: z.number().min(0).max(200) }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const existing = await db.select().from(systemCriteria)
        .where(and(
          eq(systemCriteria.companyId, input.companyId),
          eq(systemCriteria.chave, 'epi_bdi_percentual')
        ));
      if (existing.length > 0) {
        await db.update(systemCriteria).set({
          valor: String(input.bdiPercentual),
          atualizadoPor: ctx.user.name ?? 'Sistema',
        }).where(eq(systemCriteria.id, existing[0].id));
      } else {
        await db.insert(systemCriteria).values({
          companyId: input.companyId,
          categoria: 'epi',
          chave: 'epi_bdi_percentual',
          valor: String(input.bdiPercentual),
          descricao: 'Percentual de BDI sobre custo de EPI para cobrança por perda/mau uso',
          valorPadraoClt: '40',
          unidade: '%',
          atualizadoPor: ctx.user.name ?? 'Sistema',
        });
      }
      return { success: true };
    }),

  // ============================================================
  // EPI FORM TEXT CONFIGURATION
  // ============================================================
  getFormText: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db.select().from(systemCriteria)
        .where(and(
          eq(systemCriteria.companyId, input.companyId),
          eq(systemCriteria.chave, 'epi_ficha_texto')
        ));
      return {
        texto: rows.length > 0 ? rows[0].valor : 'Declaro ter recebido os Equipamentos de Proteção Individual (EPIs) acima descritos, comprometendo-me a utilizá-los corretamente durante a jornada de trabalho, conforme orientações recebidas. Estou ciente de que a não utilização, o uso inadequado ou a perda/dano por negligência poderá acarretar desconto em meu salário, conforme Art. 462, §1º da CLT e NR-6 do MTE.'
      };
    }),

  setFormText: protectedProcedure
    .input(z.object({ companyId: z.number(), texto: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const existing = await db.select().from(systemCriteria)
        .where(and(
          eq(systemCriteria.companyId, input.companyId),
          eq(systemCriteria.chave, 'epi_ficha_texto')
        ));
      if (existing.length > 0) {
        await db.update(systemCriteria).set({
          valor: input.texto,
          atualizadoPor: ctx.user.name ?? 'Sistema',
        }).where(eq(systemCriteria.id, existing[0].id));
      } else {
        await db.insert(systemCriteria).values({
          companyId: input.companyId,
          categoria: 'epi',
          chave: 'epi_ficha_texto',
          valor: input.texto,
          descricao: 'Texto padrão da ficha de entrega de EPI',
          unidade: 'texto',
          atualizadoPor: ctx.user.name ?? 'Sistema',
        });
      }
      return { success: true };
    }),

  // ============================================================
  // STATS
  // ============================================================
  stats: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const allEpis = await db.select().from(epis).where(eq(epis.companyId, input.companyId));
      const allDeliveries = await db.select().from(epiDeliveries)
        .where(and(eq(epiDeliveries.companyId, input.companyId), isNull(epiDeliveries.deletedAt)));

      const hoje = new Date().toISOString().split("T")[0];
      const totalItens = allEpis.length;
      const estoqueTotal = allEpis.reduce((sum, e) => sum + (e.quantidadeEstoque || 0), 0);
      const estoqueBaixo = allEpis.filter(e => (e.quantidadeEstoque || 0) <= 5).length;
      const caVencido = allEpis.filter(e => e.validadeCa && e.validadeCa < hoje).length;
      const totalEntregas = allDeliveries.length;

      // Valor total do inventário
      const valorTotalInventario = allEpis.reduce((sum, e) => {
        const valor = e.valorProduto ? parseFloat(String(e.valorProduto)) : 0;
        const qtd = e.quantidadeEstoque || 0;
        return sum + (valor * qtd);
      }, 0);

      // Entregas últimos 30 dias
      const ha30dias = new Date();
      ha30dias.setDate(ha30dias.getDate() - 30);
      const ha30diasStr = ha30dias.toISOString().split("T")[0];
      const entregasMes = allDeliveries.filter(d => d.dataEntrega >= ha30diasStr).length;

      return {
        totalItens,
        estoqueTotal,
        estoqueBaixo,
        caVencido,
        totalEntregas,
        entregasMes,
        valorTotalInventario,
      };
    }),
});
