// ============================================================================
// Rev. 2257 — Equipamentos Router (Fase 1 Sprint 2 do Módulo de Equipamentos)
// ============================================================================
// CRUD base + registro de eventos + auto-seed de parâmetros CAPEX.
// Páginas React virão na 2258. Cron de alerta de vencimento na 2259.
// ============================================================================

import { z } from "zod";
import crypto from "node:crypto";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter, companyInput } from "../companyHelper";
import { getCompaniesForUser } from "../db";
import {
  equipamentosProprios,
  equipamentosLocados,
  equipamentoLocadoEventos,
  faturaLocacaoConferencia,
  parametrosCapex,
} from "../../drizzle/schema";

// ----------------------------------------------------------------------------
// Defaults de parâmetros CAPEX (semeados na 1ª leitura por company)
// Benchmarks de construção civil pesada/edificações Brasil:
//   - TMA 1.2%/mês ≈ Selic real (~15%/ano) p/ análise CAPEX
//   - Manutenção/seguro: 8% / 1% do valor do ativo /ano (média setorial)
//   - Alçada R$ 5k: acima disso, override CAPEX exige aprovação
//   - Payback aceitável: ≤ 60% da vida útil do ativo
// ----------------------------------------------------------------------------
const PARAMETROS_CAPEX_DEFAULTS: Array<{
  chave: string;
  valorNumerico?: number;
  valorTexto?: string;
  descricao: string;
  categoria: string;
}> = [
  {
    chave: "tma_mensal",
    valorNumerico: 0.012,
    descricao: "Taxa mínima de atratividade mensal (decimal). Default 1.2%/mês ≈ Selic real.",
    categoria: "financeiro",
  },
  {
    chave: "limite_alcada_capex",
    valorNumerico: 5000,
    descricao: "Decisões CAPEX acima deste valor (R$) exigem aprovação se houver override da recomendação ERP.",
    categoria: "alcada",
  },
  {
    chave: "taxa_manutencao_anual",
    valorNumerico: 0.08,
    descricao: "Manutenção anual estimada como fração do valor do ativo (default 8%).",
    categoria: "tecnico",
  },
  {
    chave: "taxa_seguro_anual",
    valorNumerico: 0.01,
    descricao: "Seguro anual estimado como fração do valor do ativo (default 1%).",
    categoria: "tecnico",
  },
  {
    chave: "peso_utilizacao_historica",
    valorNumerico: 0.7,
    descricao: "Peso (0-1) da utilização histórica do equipamento no cálculo de payback. 1 = sempre usado, 0.7 = uso típico.",
    categoria: "tecnico",
  },
  {
    chave: "limiar_payback_fracao",
    valorNumerico: 0.6,
    descricao: "Payback aceitável como fração da vida útil. Default 60% — abaixo recomenda COMPRAR.",
    categoria: "financeiro",
  },
  // Vida útil por categoria (em meses)
  { chave: "vida_util_andaime",        valorNumerico: 120, descricao: "Vida útil estimada de andaimes (meses).",                categoria: "vida_util" },
  { chave: "vida_util_betoneira",      valorNumerico: 84,  descricao: "Vida útil estimada de betoneiras (meses).",              categoria: "vida_util" },
  { chave: "vida_util_compressor",     valorNumerico: 96,  descricao: "Vida útil estimada de compressores (meses).",            categoria: "vida_util" },
  { chave: "vida_util_gerador",        valorNumerico: 120, descricao: "Vida útil estimada de geradores (meses).",               categoria: "vida_util" },
  { chave: "vida_util_compactador",    valorNumerico: 60,  descricao: "Vida útil estimada de compactadores/placa vibratória.", categoria: "vida_util" },
  { chave: "vida_util_serra",          valorNumerico: 48,  descricao: "Vida útil estimada de serras (meses).",                  categoria: "vida_util" },
  { chave: "vida_util_ferramenta_eletrica", valorNumerico: 36, descricao: "Vida útil estimada de ferramentas elétricas leves.", categoria: "vida_util" },
];

/**
 * Garante que parametros_capex tenha as chaves default semeadas p/ a company.
 * Idempotente — só insere o que falta. Roda na 1ª listagem.
 */
async function seedParametrosCapexIfNeeded(db: any, companyId: number): Promise<void> {
  const existentes = await db
    .select({ chave: parametrosCapex.chave })
    .from(parametrosCapex)
    .where(eq(parametrosCapex.companyId, companyId));
  const chavesExistentes = new Set<string>(existentes.map((r: any) => r.chave));
  const faltam = PARAMETROS_CAPEX_DEFAULTS.filter(p => !chavesExistentes.has(p.chave));
  if (faltam.length === 0) return;
  await db.insert(parametrosCapex).values(
    faltam.map(p => ({
      companyId,
      chave: p.chave,
      valorNumerico: p.valorNumerico != null ? String(p.valorNumerico) : null,
      valorTexto: p.valorTexto ?? null,
      descricao: p.descricao,
      categoria: p.categoria,
      editavel: true,
    }))
  );
}

// ----------------------------------------------------------------------------
// Schemas Zod compartilhados
// ----------------------------------------------------------------------------
const fotoSchema = z.array(z.object({
  url: z.string(),
  legenda: z.string().optional(),
  uploadedAt: z.string().optional(),
})).optional();

const eventoTipoSchema = z.enum([
  "RECEBIMENTO",
  "SAIDA_ALMOX",
  "RETORNO_ALMOX",
  "DEVOLUCAO_FORNECEDOR",
  "RENOVACAO",
  "MANUTENCAO",
  "CHECK_IN_OBRA",
  "LOCALIZACAO_PENDENTE",
  "TRANSFERENCIA_OBRA",
]);

// ============================================================================
// ROUTER
// ============================================================================
export const equipamentosRouter = router({

  // ── PARÂMETROS CAPEX ──────────────────────────────────────────────────────

  parametrosCapexListar: protectedProcedure
    .input(companyInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await seedParametrosCapexIfNeeded(db, input.companyId);
      return await db
        .select()
        .from(parametrosCapex)
        .where(companyFilter(parametrosCapex.companyId, input))
        .orderBy(parametrosCapex.categoria, parametrosCapex.chave);
    }),

  parametrosCapexAtualizar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      chave: z.string().min(1).max(80),
      valorNumerico: z.number().nullable().optional(),
      valorTexto: z.string().max(255).nullable().optional(),
      descricao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db
        .select()
        .from(parametrosCapex)
        .where(and(
          eq(parametrosCapex.companyId, input.companyId),
          eq(parametrosCapex.chave, input.chave),
        ))
        .limit(1);
      if (existing && existing.editavel === false) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Parâmetro não-editável." });
      }
      const payload = {
        companyId: input.companyId,
        chave: input.chave,
        valorNumerico: input.valorNumerico != null ? String(input.valorNumerico) : null,
        valorTexto: input.valorTexto ?? null,
        descricao: input.descricao ?? existing?.descricao ?? null,
        categoria: existing?.categoria ?? null,
        atualizadoPorId: ctx.user.id,
        atualizadoPorNome: ctx.user.name || String(ctx.user.id),
        updatedAt: sql`now()`,
      };
      if (existing) {
        await db.update(parametrosCapex)
          .set(payload)
          .where(eq(parametrosCapex.id, existing.id));
        return { id: existing.id, action: "updated" as const };
      }
      const [inserted] = await db.insert(parametrosCapex).values(payload).returning({ id: parametrosCapex.id });
      return { id: inserted.id, action: "created" as const };
    }),

  // ── EQUIPAMENTOS PRÓPRIOS ─────────────────────────────────────────────────

  propriosListar: protectedProcedure
    .input(companyInput.extend({
      status: z.enum(["disponivel", "em_obra", "manutencao", "baixado"]).optional(),
      categoria: z.string().optional(),
      obraId: z.number().optional(),
      busca: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conds: any[] = [companyFilter(equipamentosProprios.companyId, input), eq(equipamentosProprios.ativo, true)];
      if (input.status) conds.push(eq(equipamentosProprios.status, input.status));
      if (input.categoria) conds.push(eq(equipamentosProprios.categoria, input.categoria));
      if (input.obraId) conds.push(eq(equipamentosProprios.localizacaoAtualObraId, input.obraId));
      if (input.busca && input.busca.trim()) {
        const q = `%${input.busca.trim()}%`;
        conds.push(sql`(${equipamentosProprios.descricao} ILIKE ${q} OR ${equipamentosProprios.codigoPatrimonio} ILIKE ${q} OR ${equipamentosProprios.numeroSerie} ILIKE ${q})`);
      }
      return await db.select().from(equipamentosProprios).where(and(...conds)).orderBy(desc(equipamentosProprios.id));
    }),

  proprioById: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select().from(equipamentosProprios)
        .where(and(eq(equipamentosProprios.id, input.id), eq(equipamentosProprios.companyId, input.companyId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  proprioCriar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      codigoPatrimonio: z.string().min(1).max(50),
      descricao: z.string().min(1).max(255),
      categoria: z.string().max(100).optional(),
      numeroSerie: z.string().max(100).optional(),
      marca: z.string().max(100).optional(),
      modelo: z.string().max(100).optional(),
      dataAquisicao: z.string().max(10).optional(),
      valorAquisicao: z.number().optional(),
      vidaUtilMeses: z.number().int().optional(),
      custoManutencaoMedioMes: z.number().optional(),
      custoSeguroMedioMes: z.number().optional(),
      fotos: fotoSchema,
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Garante unicidade de patrimônio
      const [dup] = await db.select({ id: equipamentosProprios.id }).from(equipamentosProprios)
        .where(and(
          eq(equipamentosProprios.companyId, input.companyId),
          eq(equipamentosProprios.codigoPatrimonio, input.codigoPatrimonio),
        )).limit(1);
      if (dup) throw new TRPCError({ code: "CONFLICT", message: "Patrimônio já cadastrado." });
      const [created] = await db.insert(equipamentosProprios).values({
        companyId: input.companyId,
        codigoPatrimonio: input.codigoPatrimonio,
        descricao: input.descricao,
        categoria: input.categoria ?? null,
        numeroSerie: input.numeroSerie ?? null,
        marca: input.marca ?? null,
        modelo: input.modelo ?? null,
        dataAquisicao: input.dataAquisicao ?? null,
        valorAquisicao: input.valorAquisicao != null ? String(input.valorAquisicao) : null,
        vidaUtilMeses: input.vidaUtilMeses ?? null,
        custoManutencaoMedioMes: input.custoManutencaoMedioMes != null ? String(input.custoManutencaoMedioMes) : "0",
        custoSeguroMedioMes: input.custoSeguroMedioMes != null ? String(input.custoSeguroMedioMes) : "0",
        fotosJson: input.fotos ?? null,
        observacoes: input.observacoes ?? null,
        status: "disponivel",
        localizacaoAtualTipo: "almoxarifado",
      }).returning({ id: equipamentosProprios.id });
      return { id: created.id };
    }),

  proprioAtualizar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id: z.number(),
      descricao: z.string().max(255).optional(),
      categoria: z.string().max(100).nullable().optional(),
      marca: z.string().max(100).nullable().optional(),
      modelo: z.string().max(100).nullable().optional(),
      valorAquisicao: z.number().nullable().optional(),
      vidaUtilMeses: z.number().int().nullable().optional(),
      custoManutencaoMedioMes: z.number().nullable().optional(),
      custoSeguroMedioMes: z.number().nullable().optional(),
      status: z.enum(["disponivel", "em_obra", "manutencao", "baixado"]).optional(),
      localizacaoAtualTipo: z.enum(["almoxarifado", "obra"]).optional(),
      localizacaoAtualObraId: z.number().nullable().optional(),
      observacoes: z.string().nullable().optional(),
      fotos: fotoSchema,
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const update: any = { updatedAt: sql`now()` };
      const map = (k: string, v: any) => { if (v !== undefined) update[k] = v; };
      map("descricao", input.descricao);
      map("categoria", input.categoria);
      map("marca", input.marca);
      map("modelo", input.modelo);
      if (input.valorAquisicao !== undefined) update.valorAquisicao = input.valorAquisicao != null ? String(input.valorAquisicao) : null;
      map("vidaUtilMeses", input.vidaUtilMeses);
      if (input.custoManutencaoMedioMes !== undefined) update.custoManutencaoMedioMes = input.custoManutencaoMedioMes != null ? String(input.custoManutencaoMedioMes) : null;
      if (input.custoSeguroMedioMes !== undefined) update.custoSeguroMedioMes = input.custoSeguroMedioMes != null ? String(input.custoSeguroMedioMes) : null;
      map("status", input.status);
      map("localizacaoAtualTipo", input.localizacaoAtualTipo);
      map("localizacaoAtualObraId", input.localizacaoAtualObraId);
      map("observacoes", input.observacoes);
      if (input.fotos !== undefined) update.fotosJson = input.fotos ?? null;
      const r = await db.update(equipamentosProprios).set(update)
        .where(and(eq(equipamentosProprios.id, input.id), eq(equipamentosProprios.companyId, input.companyId)))
        .returning({ id: equipamentosProprios.id });
      if (r.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: r[0].id };
    }),

  // ── EQUIPAMENTOS LOCADOS ──────────────────────────────────────────────────

  locadosListar: protectedProcedure
    .input(companyInput.extend({
      status: z.string().optional(),
      obraId: z.number().optional(),
      fornecedorId: z.number().optional(),
      ordemCompraId: z.number().optional(),
      vencendoEmDias: z.number().int().optional(),  // ex: 30 = vence nos próximos 30d
      busca: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conds: any[] = [companyFilter(equipamentosLocados.companyId, input)];
      if (input.status) conds.push(eq(equipamentosLocados.status, input.status));
      if (input.obraId) conds.push(eq(equipamentosLocados.obraId, input.obraId));
      if (input.fornecedorId) conds.push(eq(equipamentosLocados.fornecedorId, input.fornecedorId));
      if (input.ordemCompraId) conds.push(eq(equipamentosLocados.ordemCompraId, input.ordemCompraId));
      if (input.vencendoEmDias != null) {
        const hoje = new Date();
        const limite = new Date();
        limite.setDate(hoje.getDate() + input.vencendoEmDias);
        const limiteISO = limite.toISOString().slice(0, 10);
        conds.push(sql`${equipamentosLocados.dataFimPrevista} <= ${limiteISO}`);
        conds.push(sql`${equipamentosLocados.status} = 'em_uso'`);
      }
      if (input.busca && input.busca.trim()) {
        const q = `%${input.busca.trim()}%`;
        conds.push(sql`(${equipamentosLocados.descricao} ILIKE ${q} OR ${equipamentosLocados.codigoPatrimonioFornecedor} ILIKE ${q} OR ${equipamentosLocados.codigoInternoErp} ILIKE ${q} OR ${equipamentosLocados.numeroSerie} ILIKE ${q})`);
      }
      return await db.select().from(equipamentosLocados).where(and(...conds)).orderBy(desc(equipamentosLocados.id));
    }),

  locadoById: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select().from(equipamentosLocados)
        .where(and(eq(equipamentosLocados.id, input.id), eq(equipamentosLocados.companyId, input.companyId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  locadoCriar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      fornecedorId: z.number().optional(),
      fornecedorNome: z.string().max(255).optional(),
      ordemCompraId: z.number().optional(),
      contratoLocacaoId: z.number().optional(),
      codigoPatrimonioFornecedor: z.string().max(100).optional(),
      codigoInternoErp: z.string().max(50).optional(),
      descricao: z.string().min(1).max(255),
      categoria: z.string().max(100).optional(),
      numeroSerie: z.string().max(100).optional(),
      dataInicio: z.string().min(10).max(10),
      dataFimPrevista: z.string().min(10).max(10),
      valorDiario: z.number().optional(),
      valorMensal: z.number().optional(),
      fotosRecebimento: fotoSchema,
      funcionarioResponsavelId: z.number().optional(),
      funcionarioResponsavelNome: z.string().max(255).optional(),
      observacoes: z.string().optional(),
      ocAnteriorId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Foto OBRIGATÓRIA no recebimento (regra de negócio do user)
      if (!input.fotosRecebimento || input.fotosRecebimento.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Foto de recebimento é obrigatória." });
      }
      const [created] = await db.insert(equipamentosLocados).values({
        companyId: input.companyId,
        obraId: input.obraId ?? null,
        fornecedorId: input.fornecedorId ?? null,
        fornecedorNome: input.fornecedorNome ?? null,
        ordemCompraId: input.ordemCompraId ?? null,
        contratoLocacaoId: input.contratoLocacaoId ?? null,
        codigoPatrimonioFornecedor: input.codigoPatrimonioFornecedor ?? null,
        codigoInternoErp: input.codigoInternoErp ?? null,
        descricao: input.descricao,
        categoria: input.categoria ?? null,
        numeroSerie: input.numeroSerie ?? null,
        dataInicio: input.dataInicio,
        dataFimPrevista: input.dataFimPrevista,
        valorDiario: input.valorDiario != null ? String(input.valorDiario) : null,
        valorMensal: input.valorMensal != null ? String(input.valorMensal) : null,
        status: "em_uso",
        fotosRecebimentoJson: input.fotosRecebimento,
        funcionarioResponsavelId: input.funcionarioResponsavelId ?? null,
        funcionarioResponsavelNome: input.funcionarioResponsavelNome ?? null,
        observacoes: input.observacoes ?? null,
        ocAnteriorId: input.ocAnteriorId ?? null,
      }).returning({ id: equipamentosLocados.id });

      // Registra evento RECEBIMENTO automaticamente
      await db.insert(equipamentoLocadoEventos).values({
        companyId: input.companyId,
        equipamentoLocadoId: created.id,
        tipo: "RECEBIMENTO",
        obraId: input.obraId ?? null,
        fotosJson: input.fotosRecebimento,
        observacao: input.observacoes ?? null,
        funcionarioId: input.funcionarioResponsavelId ?? null,
        funcionarioNome: input.funcionarioResponsavelNome ?? null,
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || String(ctx.user.id),
      });
      return { id: created.id };
    }),

  locadoAtualizar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id: z.number(),
      obraId: z.number().nullable().optional(),
      status: z.enum(["em_uso", "devolvido", "atrasado", "em_renovacao", "localizacao_pendente", "em_manutencao"]).optional(),
      dataFimPrevista: z.string().max(10).optional(),
      funcionarioResponsavelId: z.number().nullable().optional(),
      funcionarioResponsavelNome: z.string().max(255).nullable().optional(),
      observacoes: z.string().nullable().optional(),
      codigoInternoErp: z.string().max(50).nullable().optional(),
      codigoPatrimonioFornecedor: z.string().max(100).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const update: any = { updatedAt: sql`now()` };
      const map = (k: string, v: any) => { if (v !== undefined) update[k] = v; };
      map("obraId", input.obraId);
      map("status", input.status);
      map("dataFimPrevista", input.dataFimPrevista);
      map("funcionarioResponsavelId", input.funcionarioResponsavelId);
      map("funcionarioResponsavelNome", input.funcionarioResponsavelNome);
      map("observacoes", input.observacoes);
      map("codigoInternoErp", input.codigoInternoErp);
      map("codigoPatrimonioFornecedor", input.codigoPatrimonioFornecedor);
      const r = await db.update(equipamentosLocados).set(update)
        .where(and(eq(equipamentosLocados.id, input.id), eq(equipamentosLocados.companyId, input.companyId)))
        .returning({ id: equipamentosLocados.id });
      if (r.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: r[0].id };
    }),

  // Rev. 2323 — Vincular obra em lote + Excluir em lote (multi-seleção na UI).
  locadosVincularObraLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ids: z.array(z.number()).min(1).max(500),
      obraId: z.number().nullable(), // null = desvincular
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Tenant isolation — confirma que a empresa pertence ao usuário.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      // Rev. 2329 — Bulkificação. Antes (Rev. 2323/2325): 1 UPDATE +
      // 1 INSERT por ID = 2N round-trips ao Neon (200 itens = 400
      // viagens, ~30s no proxy). Agora: 1 UPDATE WHERE IN + 1 INSERT
      // multi-VALUES = 2 round-trips totais. ~50× mais rápido.
      const updated = await db.update(equipamentosLocados)
        .set({ obraId: input.obraId, updatedAt: sql`now()` })
        .where(and(
          inArray(equipamentosLocados.id, input.ids),
          eq(equipamentosLocados.companyId, input.companyId),
        ))
        .returning({ id: equipamentosLocados.id });
      const total = updated.length;
      if (total > 0) {
        const obsTxt = input.obraId == null
          ? "Desvinculado da obra (lote)"
          : `Vinculado à obra #${input.obraId} (lote)`;
        const userNome = ctx.user.name || String(ctx.user.id);
        const rows = updated.map(u => ({
          companyId: input.companyId,
          equipamentoLocadoId: u.id,
          tipo: "VINCULO_OBRA" as const,
          obraId: input.obraId,
          observacao: obsTxt,
          usuarioId: ctx.user.id,
          usuarioNome: userNome,
        }));
        await db.insert(equipamentoLocadoEventos).values(rows);
      }
      return { ok: true as const, vinculados: total };
    }),

  locadosExcluirLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ids: z.array(z.number()).min(1).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Tenant isolation — confirma que a empresa pertence ao usuário.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }
      // Rev. 2329 — Bulkificação. Antes (Rev. 2323/2325): 1 DELETE
      // eventos + 1 DELETE locado por ID = 2N round-trips (200 itens
      // = 400 viagens). Agora: 1 DELETE eventos WHERE IN + 1 DELETE
      // locados WHERE IN = 2 round-trips totais. ~50× mais rápido.
      // Sem transaction explícito: eventos primeiro (FK), depois
      // locados; se o 2º falhar, eventos órfãos seriam apagados de
      // novo na próxima tentativa (idempotente).
      await db.delete(equipamentoLocadoEventos).where(and(
        inArray(equipamentoLocadoEventos.equipamentoLocadoId, input.ids),
        eq(equipamentoLocadoEventos.companyId, input.companyId),
      ));
      const deleted = await db.delete(equipamentosLocados)
        .where(and(
          inArray(equipamentosLocados.id, input.ids),
          eq(equipamentosLocados.companyId, input.companyId),
        ))
        .returning({ id: equipamentosLocados.id });
      return { ok: true as const, excluidos: deleted.length };
    }),

  locadoDevolver: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id: z.number(),
      dataFimReal: z.string().min(10).max(10),
      fotosDevolucao: fotoSchema,
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (!input.fotosDevolucao || input.fotosDevolucao.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Foto de devolução é obrigatória." });
      }
      const [eq_] = await db.select().from(equipamentosLocados)
        .where(and(eq(equipamentosLocados.id, input.id), eq(equipamentosLocados.companyId, input.companyId)))
        .limit(1);
      if (!eq_) throw new TRPCError({ code: "NOT_FOUND" });
      if (eq_.status === "devolvido") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Equipamento já foi devolvido." });
      }
      await db.update(equipamentosLocados).set({
        status: "devolvido",
        dataFimReal: input.dataFimReal,
        fotosDevolucaoJson: input.fotosDevolucao,
        updatedAt: sql`now()`,
      }).where(and(
        eq(equipamentosLocados.id, input.id),
        eq(equipamentosLocados.companyId, input.companyId),
      ));

      await db.insert(equipamentoLocadoEventos).values({
        companyId: input.companyId,
        equipamentoLocadoId: input.id,
        tipo: "DEVOLUCAO_FORNECEDOR",
        obraId: eq_.obraId,
        fotosJson: input.fotosDevolucao,
        observacao: input.observacao ?? null,
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || String(ctx.user.id),
      });
      return { id: input.id, action: "devolvido" as const };
    }),

  locadoCheckIn: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id: z.number(),
      observacao: z.string().optional(),
      fotos: fotoSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const hojeISO = new Date().toISOString().slice(0, 10);
      const r = await db.update(equipamentosLocados).set({
        ultimoCheckInData: hojeISO,
        ultimoCheckInUserId: ctx.user.id,
        updatedAt: sql`now()`,
      }).where(and(eq(equipamentosLocados.id, input.id), eq(equipamentosLocados.companyId, input.companyId)))
        .returning({ id: equipamentosLocados.id, obraId: equipamentosLocados.obraId });
      if (r.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
      await db.insert(equipamentoLocadoEventos).values({
        companyId: input.companyId,
        equipamentoLocadoId: input.id,
        tipo: "CHECK_IN_OBRA",
        obraId: r[0].obraId,
        fotosJson: input.fotos ?? null,
        observacao: input.observacao ?? null,
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || String(ctx.user.id),
      });
      return { id: r[0].id, ultimoCheckInData: hojeISO };
    }),

  locadoRegistrarEvento: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      equipamentoLocadoId: z.number(),
      tipo: eventoTipoSchema,
      obraId: z.number().nullable().optional(),
      obraNome: z.string().max(255).nullable().optional(),
      funcionarioId: z.number().nullable().optional(),
      funcionarioNome: z.string().max(255).nullable().optional(),
      fotos: fotoSchema,
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [created] = await db.insert(equipamentoLocadoEventos).values({
        companyId: input.companyId,
        equipamentoLocadoId: input.equipamentoLocadoId,
        tipo: input.tipo,
        obraId: input.obraId ?? null,
        obraNome: input.obraNome ?? null,
        funcionarioId: input.funcionarioId ?? null,
        funcionarioNome: input.funcionarioNome ?? null,
        fotosJson: input.fotos ?? null,
        observacao: input.observacao ?? null,
        usuarioId: ctx.user.id,
        usuarioNome: ctx.user.name || String(ctx.user.id),
      }).returning({ id: equipamentoLocadoEventos.id });
      return { id: created.id };
    }),

  eventosListar: protectedProcedure
    .input(z.object({ companyId: z.number(), equipamentoLocadoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return await db.select().from(equipamentoLocadoEventos)
        .where(and(
          eq(equipamentoLocadoEventos.companyId, input.companyId),
          eq(equipamentoLocadoEventos.equipamentoLocadoId, input.equipamentoLocadoId),
        ))
        .orderBy(desc(equipamentoLocadoEventos.dataEvento));
    }),

  // ── IMPORTAÇÃO EM LOTE VIA PDF DA LOCADORA (Rev. 2308) ────────────────────
  // Cada locadora (Jalves, Locamerica, Mills, etc.) tem um layout próprio de
  // relatório. A IA (Gemini Vision) detecta o layout, extrai contratos+itens
  // e devolve uma estrutura padronizada. O usuário revisa no preview e
  // confirma o cadastro em lote (sem foto obrigatória — é cadastro inicial,
  // fotos virão nos próximos recebimentos via fluxo de compras/recebimento).

  // Rev. 2321 — Polling job store pra parse de PDF (evita timeout 60s do proxy Replit).
  // O Gemini com PDFs grandes leva 60-120s e o proxy mata a conexão (cliente vê
  // "Load failed" no iOS Safari). Solução: mutation `Start` retorna jobId
  // imediatamente, parse roda em background; query `Status` faz polling a cada
  // 2.5s até `done`/`error`. Sem long-lived HTTP.
  parsearContratoLocacaoPdfStart: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      pdfBase64: z.string().min(100),
      mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
      nomeArquivo: z.string().max(255).optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.pdfBase64.length > 25 * 1024 * 1024) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "PDF muito grande (>18MB). Reduza ou divida o arquivo." });
      }
      const jobId = crypto.randomUUID();
      parseContratoJobs.set(jobId, { status: "pending", startedAt: Date.now() });
      // Fire-and-forget — o request HTTP retorna em ms.
      executeParseContratoLocacao(input)
        .then((result) => parseContratoJobs.set(jobId, { status: "done", startedAt: Date.now(), result }))
        .catch((err: any) => parseContratoJobs.set(jobId, { status: "error", startedAt: Date.now(), error: err?.message || String(err) }));
      return { jobId };
    }),

  parsearContratoLocacaoPdfStatus: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(({ input }) => {
      const j = parseContratoJobs.get(input.jobId);
      if (!j) return { status: "expired" as const };
      if (j.status === "done") return { status: "done" as const, result: j.result };
      if (j.status === "error") return { status: "error" as const, error: j.error };
      return { status: "pending" as const };
    }),

  // (Procedure legada — mantida só pra retrocompatibilidade; cliente agora usa Start/Status.)
  parsearContratoLocacaoPdf: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      pdfBase64: z.string().min(100),
      mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
      nomeArquivo: z.string().max(255).optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.pdfBase64.length > 25 * 1024 * 1024) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "PDF muito grande (>18MB). Reduza ou divida o arquivo." });
      }
      return executeParseContratoLocacao(input);
    }),

  importarContratosLocacaoLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number().optional(),
      nomeArquivo: z.string().max(255).optional(),
      contratos: z.array(z.object({
        numeroContrato: z.string().max(50),
        fornecedorNome: z.string().max(255).optional(),
        fornecedorId: z.number().optional(),
        obraId: z.number().optional(),
        localObra: z.string().optional(),
        periodoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodoFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        valorTotal: z.number().optional(),
        atendenteResponsavel: z.string().max(255).optional(),
        itens: z.array(z.object({
          patrimonio: z.string().max(100).optional(),
          descricao: z.string().min(1).max(255),
          quantidade: z.number().min(1).default(1),
          subtotal: z.number().optional(),
          // Rev. 2337 — categoria inferida pela IA durante o parse do PDF
          categoria: z.string().max(100).optional(),
        })).min(1),
      })).min(1).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Rev. 2333 — bulk INSERT POR CONTRATO em transação.
      // Causa raiz do "Load failed" iOS Safari: o loop antigo fazia 2 INSERTs
      // POR UNIDADE dentro de transação grande (1218 unid × 2 = 2436 round-trips
      // ao Neon → estoura 60s do proxy). Agora: para cada contrato, 1 bulk
      // INSERT das unidades + 1 bulk INSERT dos eventos. 46 contratos × 2 = 92
      // round-trips em vez de 2436 (~25× menos). Pareamento eventos→locados
      // é DETERMINÍSTICO porque dentro de um único contrato todos os eventos
      // compartilham obraId+numeroContrato — não dependemos da ordem do
      // RETURNING. Atomicidade preservada pela transaction.
      const ids: number[] = [];
      let totalItens = 0;
      await db.transaction(async (tx: any) => {
        for (const c of input.contratos) {
          const obraIdCt = c.obraId ?? input.obraId ?? null;
          const locadosRows: any[] = [];
          for (const it of c.itens) {
            const qty = Math.max(1, Math.floor(it.quantidade || 1));
            const subtotalUnidade = it.subtotal && qty > 0 ? (it.subtotal / qty) : (it.subtotal || 0);
            for (let i = 0; i < qty; i++) {
              locadosRows.push({
                companyId: input.companyId,
                obraId: obraIdCt,
                fornecedorId: c.fornecedorId ?? null,
                fornecedorNome: c.fornecedorNome ?? null,
                codigoPatrimonioFornecedor: it.patrimonio ?? null,
                descricao: it.descricao,
                categoria: it.categoria ?? null,
                dataInicio: c.periodoInicio,
                dataFimPrevista: c.periodoFim,
                valorMensal: subtotalUnidade > 0 ? String(subtotalUnidade.toFixed(2)) : null,
                status: "em_uso",
                observacoes: c.localObra ? `Local da obra (PDF): ${c.localObra}` : null,
                numeroContratoFornecedor: c.numeroContrato,
                atendenteResponsavel: c.atendenteResponsavel ?? null,
                arquivoOrigemUrl: input.nomeArquivo ?? null,
                valorSubtotalContrato: it.subtotal != null ? String(it.subtotal.toFixed(2)) : null,
                fotosRecebimentoJson: [] as any,
              });
            }
          }
          if (locadosRows.length === 0) continue;
          const created = await tx.insert(equipamentosLocados).values(locadosRows).returning({ id: equipamentosLocados.id });
          totalItens += created.length;
          const observacao = `Cadastro inicial via import PDF · Contrato ${c.numeroContrato}${input.nomeArquivo ? ` · ${input.nomeArquivo}` : ""}`;
          const eventos = created.map((r: any) => {
            ids.push(r.id);
            return {
              companyId: input.companyId,
              equipamentoLocadoId: r.id,
              tipo: "RECEBIMENTO" as const,
              obraId: obraIdCt,
              observacao,
              usuarioId: ctx.user.id,
              usuarioNome: ctx.user.name || String(ctx.user.id),
            };
          });
          if (eventos.length > 0) await tx.insert(equipamentoLocadoEventos).values(eventos);
        }
      });
      return {
        ok: true as const,
        contratosImportados: input.contratos.length,
        itensImportados: totalItens,
        ids,
      };
    }),

  // ── Rev. 2337 — CATEGORIZAÇÃO EM LOTE VIA IA ──────────────────────────────
  // Backfill de `categoria` em equipamentos_locados existentes.
  // Estratégia: lê descrições DISTINCT → IA propõe categorias + mapping →
  // bulk UPDATE agrupado por categoria (1 round-trip por categoria, não por linha).
  // Idempotente: por padrão só toca registros com categoria NULL/vazia.
  locadosCategorizarComIA: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      sobrescrever: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Tenant isolation — confirma que a empresa pertence ao usuário
      // (mesmo padrão de locadosVincularObraLote/locadosExcluirLote).
      // SEM isto, qualquer usuário autenticado poderia disparar a IA
      // sobre dados de OUTRO tenant passando companyId alheio.
      const allowedCompanies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const allowedIds = (allowedCompanies as any[]).map(c => c.id);
      if (!allowedIds.includes(input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
      }

      // 1. Descrições distintas pendentes de categorização.
      const condCat = input.sobrescrever ? sql`TRUE` : sql`(categoria IS NULL OR categoria = '')`;
      const rowsResult: any = await db.execute(sql`
        SELECT DISTINCT descricao, COUNT(*)::int AS qtd
        FROM equipamentos_locados
        WHERE company_id = ${input.companyId}
          AND descricao IS NOT NULL
          AND descricao <> ''
          AND ${condCat}
        GROUP BY descricao
        ORDER BY qtd DESC, descricao ASC
      `);
      const descricoes: { descricao: string; qtd: number }[] = (rowsResult.rows || rowsResult) as any[];
      if (descricoes.length === 0) {
        return { ok: true as const, categorias: [] as string[], itensAtualizados: 0, descricoesAnalisadas: 0, descricoesNaoMapeadas: [] as string[] };
      }

      // 2. Chama IA. Limite defensivo: 800 descrições por call (cabe em 1 prompt
      // de ~40k tokens com folga). Acima disso o user roda 2x.
      const MAX_DESC = 800;
      const lote = descricoes.slice(0, MAX_DESC);
      const { invokeLLM } = await import("../_core/llm");
      const systemPrompt = `Você é um especialista em classificação de equipamentos de obra de construção civil pesada brasileira. Recebe uma lista de descrições de equipamentos LOCADOS de uma única construtora e deve agrupá-las em categorias úteis para análise gerencial.

Regras OBRIGATÓRIAS:
1. PROPOR de 5 a 10 CATEGORIAS curtas (≤ 40 chars), usando o jargão de obra brasileira (andaime, escoramento, elétrico, ferramenta, EPI, etc.). Cada categoria deve ter ≥ 2 descrições para evitar pulverização. Itens isolados vão pra "Outros".
2. Para CADA descrição da lista, atribuir UMA das categorias propostas. NÃO invente categorias novas no mapping.
3. Retornar APENAS JSON válido — sem markdown, sem preâmbulo:
   {
     "categorias": ["Andaime e escoramento", "Equipamento elétrico", ...],
     "mapping": [ {"descricao": "TEXTO EXATO ORIGINAL", "categoria": "Andaime e escoramento"}, ... ]
   }
4. O campo "descricao" do mapping deve ser IGUAL (caractere a caractere) ao recebido.`;

      const userPrompt = `Classifique as ${lote.length} descrições abaixo (números entre parênteses = quantidade de unidades dessa descrição no acervo, para você priorizar categorias relevantes):

${lote.map(d => `- ${d.descricao}  (${d.qtd})`).join("\n")}

Gere o JSON conforme o esquema. Não omita nenhuma descrição.`;

      let parsed: any;
      try {
        const resp = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          maxTokens: 16000,
          response_format: { type: "json_object" },
        });
        const content = resp.choices?.[0]?.message?.content;
        let raw = (typeof content === "string" ? content : Array.isArray(content) ? content.map((c: any) => c?.text ?? "").join("") : "").trim();
        const m = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (m) raw = m[1].trim();
        const fi = raw.indexOf("{"); const li = raw.lastIndexOf("}");
        if (fi >= 0 && li > fi) raw = raw.slice(fi, li + 1);
        parsed = JSON.parse(raw);
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes("Nenhuma chave de IA")) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nenhuma IA configurada (ANTHROPIC_API_KEY ou GOOGLE_API_KEY ausente)." });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Falha na IA: ${msg.slice(0, 200)}` });
      }

      const categoriasValidas: string[] = Array.isArray(parsed.categorias) ? parsed.categorias.map((c: any) => String(c).slice(0, 100).trim()).filter(Boolean) : [];
      const categoriaSet = new Set(categoriasValidas);
      const mapping: { descricao: string; categoria: string }[] = Array.isArray(parsed.mapping) ? parsed.mapping : [];

      // 3. Agrupa descrições por categoria → 1 UPDATE por categoria (round-trips = #categorias).
      const porCategoria = new Map<string, string[]>();
      const descricoesNaoMapeadas: string[] = [];
      const setEnviadas = new Set(lote.map(d => d.descricao));
      for (const m2 of mapping) {
        const desc = String(m2?.descricao ?? "");
        const cat = String(m2?.categoria ?? "").slice(0, 100).trim();
        if (!desc || !setEnviadas.has(desc)) continue;
        if (!categoriaSet.has(cat)) continue;
        const arr = porCategoria.get(cat) || [];
        arr.push(desc);
        porCategoria.set(cat, arr);
      }
      const mapeadasSet = new Set<string>();
      for (const arr of porCategoria.values()) for (const d of arr) mapeadasSet.add(d);
      for (const d of lote) if (!mapeadasSet.has(d.descricao)) descricoesNaoMapeadas.push(d.descricao);

      let itensAtualizados = 0;
      for (const [cat, descs] of porCategoria.entries()) {
        if (descs.length === 0) continue;
        // UPDATE em chunks de 200 descrições pra evitar SQL gigante.
        for (let i = 0; i < descs.length; i += 200) {
          const slice = descs.slice(i, i + 200);
          const condSobre = input.sobrescrever ? sql`TRUE` : sql`(categoria IS NULL OR categoria = '')`;
          const res: any = await db.execute(sql`
            UPDATE equipamentos_locados
               SET categoria = ${cat}, updated_at = NOW()
             WHERE company_id = ${input.companyId}
               AND ${condSobre}
               AND descricao = ANY(${sql.raw(`ARRAY[${slice.map(d => `'${d.replace(/'/g, "''")}'`).join(",")}]::varchar[]`)})
          `);
          itensAtualizados += Number(res.rowCount ?? res.rows?.length ?? 0);
        }
      }

      return {
        ok: true as const,
        categorias: categoriasValidas,
        itensAtualizados,
        descricoesAnalisadas: lote.length,
        descricoesNaoMapeadas: descricoesNaoMapeadas.slice(0, 20),
        haMaisLotes: descricoes.length > MAX_DESC,
      };
    }),

  // ── FATURA DE LOCAÇÃO (skeleton; OCR vem na Fase 3) ───────────────────────

  faturasListar: protectedProcedure
    .input(companyInput.extend({
      status: z.enum(["pendente", "conferida", "aprovada", "contestada", "paga"]).optional(),
      mesReferencia: z.string().max(7).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conds: any[] = [companyFilter(faturaLocacaoConferencia.companyId, input)];
      if (input.status) conds.push(eq(faturaLocacaoConferencia.status, input.status));
      if (input.mesReferencia) conds.push(eq(faturaLocacaoConferencia.mesReferencia, input.mesReferencia));
      return await db.select().from(faturaLocacaoConferencia).where(and(...conds))
        .orderBy(desc(faturaLocacaoConferencia.id));
    }),
});

// ── Rev. 2321 — Job store in-memory pra parse de PDF (polling).
// `Start` cria entrada em "pending" e dispara `executeParseContratoLocacao`
// em background; `Status` é polled pelo cliente. GC limpa entradas finalizadas
// após 10 min (pending nunca expira — protege polls longos > 60s).
type ParseContratoJob = {
  status: "pending" | "done" | "error";
  startedAt: number;
  result?: { contratos: any[]; totalContratos: number; totalItens: number };
  error?: string;
};
const parseContratoJobs = new Map<string, ParseContratoJob>();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, j] of parseContratoJobs.entries()) {
    if (j.status !== "pending" && j.startedAt < cutoff) parseContratoJobs.delete(id);
  }
}, 60_000).unref?.();

// ── Rev. 2321 — Helper que executa o parse (chamado pela Start e pela legada).
// Extraído pra fora do router porque a Start dispara em background (fire-and-forget)
// e armazena o resultado no jobs Map; a procedure HTTP retorna em ms, evitando
// timeout de 60s do proxy Replit (que matava a conexão com PDFs grandes).
async function executeParseContratoLocacao(input: {
  companyId: number;
  pdfBase64: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  nomeArquivo?: string;
}): Promise<{ contratos: any[]; totalContratos: number; totalItens: number }> {
  const { invokeGeminiVision } = await import("../_core/llm");
  const systemPrompt = `Você é um extrator de relatórios de locação de equipamentos para construção civil no Brasil.\nCada locadora tem um layout próprio (Jalves, Mills, Locamerica, etc.). Detecte automaticamente o layout e extraia TODOS os contratos e seus respectivos itens.\nDatas no formato brasileiro DD/MM/AAAA. Valores em reais (R$). Quantidades inteiras ou decimais.`;
  const prompt = `Extraia TODOS os contratos de locação deste documento. Para cada contrato, capture:\n- numeroContrato (ex: "19096-32")\n- fornecedorNome (razão social/nome fantasia da locadora — geralmente no cabeçalho)\n- localObra (endereço/identificação da obra)\n- periodoInicio (DD/MM/AAAA)\n- periodoFim (DD/MM/AAAA)\n- valorTotal (numérico, sem R$, ponto como separador decimal)\n- atendenteResponsavel\n- itens: array de {patrimonio, descricao, quantidade (number), valorUnitario (subtotal/qtde, number), subtotal (number), categoria}\n\nPara o campo "categoria" de CADA ITEM, classifique em UMA das categorias abaixo (escolha a MAIS específica):\n- "Andaime e escoramento" (guarda-corpo, pranchão, diagonal, sapata ajustável, escora, cruzeta, longarina, plataforma metálica, base regulável, painel de escoramento, viga H20)\n- "Equipamento elétrico" (gerador, betoneira, vibrador, lixadeira, esmerilhadeira, serra circular/policorte, compressor, bomba submersa/centrífuga, transformador, quadro de força)\n- "Ferramenta manual" (carrinho de mão, marreta, martelete, furadeira não-elétrica, alavanca, pá, picareta)\n- "EPI/EPC" (capacete, cinto de segurança, luva, óculos, redes de proteção, tela de fachada)\n- "Veículo/Máquina pesada" (caminhão, retroescavadeira, escavadeira, guindaste, manipulador telescópico)\n- "Container/Mobiliário" (container, mesa, cadeira, armário, escritório de obra)\n- "Outros" (use somente se NÃO encaixar em nenhuma acima)\n\nRetorne APENAS JSON válido no formato {contratos: [...]}. Se um campo estiver ausente, use string vazia ou 0. Datas SEMPRE em DD/MM/AAAA.`;

  const responseSchema = {
    type: "object",
    properties: {
      contratos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            numeroContrato: { type: "string" },
            fornecedorNome: { type: "string" },
            localObra: { type: "string" },
            periodoInicio: { type: "string" },
            periodoFim: { type: "string" },
            valorTotal: { type: "number" },
            atendenteResponsavel: { type: "string" },
            itens: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  patrimonio: { type: "string" },
                  descricao: { type: "string" },
                  quantidade: { type: "number" },
                  valorUnitario: { type: "number" },
                  subtotal: { type: "number" },
                  categoria: { type: "string" },
                },
                required: ["patrimonio", "descricao", "quantidade", "subtotal"],
              },
            },
          },
          required: ["numeroContrato", "periodoInicio", "periodoFim", "itens"],
        },
      },
    },
    required: ["contratos"],
  };

  const raw = await invokeGeminiVision({
    prompt,
    systemPrompt,
    base64: input.pdfBase64,
    mimeType: input.mimeType,
    maxTokens: 65536, // Rev. 2320 — dobrado (era 32768): PDFs com 40+ contratos estouravam o cap e truncavam o JSON.
    responseSchema,
  });
  if (!raw?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "IA não retornou dados — verifique se o PDF é legível." });

  // Rev. 2320 — Reparo de JSON truncado caractere a caractere.
  const tryRepairTruncated = (s: string): any | null => {
    const idx = s.indexOf('"contratos"');
    if (idx < 0) return null;
    const arrStart = s.indexOf("[", idx);
    if (arrStart < 0) return null;
    let depth = 0, inStr = false, esc = false, lastClose = -1;
    for (let i = arrStart + 1; i < s.length; i++) {
      const ch = s[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) lastClose = i; }
    }
    if (lastClose < 0) return null;
    const head = s.slice(0, arrStart + 1);
    const body = s.slice(arrStart + 1, lastClose + 1);
    try { return JSON.parse(`${head}${body}]}`); } catch { return null; }
  };
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); }
      catch { parsed = tryRepairTruncated(raw); }
    } else {
      parsed = tryRepairTruncated(raw);
    }
    if (!parsed) throw new TRPCError({ code: "BAD_REQUEST", message: "Resposta da IA truncada/inválida. Tente dividir o PDF em arquivos menores." });
  }
  const contratos: any[] = Array.isArray(parsed?.contratos) ? parsed.contratos : [];
  if (contratos.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum contrato detectado no documento." });

  const toIso = (br: string) => {
    if (!br) return "";
    const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    const m2 = br.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m2 ? `${m2[1]}-${m2[2]}-${m2[3]}` : "";
  };
  for (const c of contratos) {
    c.periodoInicio = toIso(c.periodoInicio);
    c.periodoFim = toIso(c.periodoFim);
    if (!Array.isArray(c.itens)) c.itens = [];
  }

  return {
    contratos,
    totalContratos: contratos.length,
    totalItens: contratos.reduce((a, c) => a + (c.itens?.length || 0), 0),
  };
}
