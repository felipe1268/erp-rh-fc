// Rev. — CRITÉRIOS DE MEDIÇÃO (catálogo global por empresa) + MAPA DE VÃOS
// (esquadrias marcadas no DXF dos pavimentos) + motor de desconto de vão /
// requadro com ledger (requadro de um vão é pago UMA única vez).
//
// Poka-Yoke central: o carimbo do requadro é atômico
// (UPDATE ... WHERE requadro_pago_em IS NULL) — corrida entre dois serviços
// nunca cobra duas vezes; o segundo sai zerado com justificativa automática.
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, getUserCompanyLinks } from "../db";
import {
  medicaoCriterios, obraEsquadriaTipologias, obraEsquadrias,
  obraPavimentos, medicaoCampo, medicaoCampoPdfs, medicaoCampoContornos,
  medicaoLevantamentoServicos, terceiroContratos,
} from "../../drizzle/schema";
import { and, eq, ne, isNull, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// Guard permissivo de empresa (mesmo padrão do medicaoConfig).
async function assertCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  // Estrito: sem vínculo = sem acesso (dados de medição/financeiro — nada de fallback permissivo).
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

// ───────────────────────── Seed de literatura (TCPO/SINAPI) ─────────────────────────
// Fichas iniciais em RASCUNHO para o usuário estudar/ajustar uma a uma.
const SEED_LITERATURA: Array<Partial<typeof medicaoCriterios.$inferInsert>> = [
  { servico: "Alvenaria de Vedação", chaveServico: "alvenaria", unidade: "m2", limiteVaoM2: "2.00", descontaAcima: "integral", pagaRequadro: 0,
    referencia: "TCPO: vãos ≤ 2,00 m² não descontam (compensam recortes); acima, desconta-se integral. Vergas/contravergas medidas à parte." },
  { servico: "Chapisco Interno", chaveServico: "chapisco", unidade: "m2", limiteVaoM2: "2.00", descontaAcima: "integral", pagaRequadro: 0,
    referencia: "Segue o critério do revestimento que recobre (reboco): vão ≤ 2,00 m² paga fechado." },
  { servico: "Chapisco Externo", unidade: "m2", limiteVaoM2: "2.00", descontaAcima: "integral", pagaRequadro: 0,
    referencia: "Segue o reboco externo; requadro normalmente remunerado no reboco, não no chapisco." },
  { servico: "Reboco/Emboço Interno", chaveServico: "reboco", unidade: "m2", limiteVaoM2: "2.00", descontaAcima: "integral", pagaRequadro: 1, requadroIncluiPeitoril: 0,
    quemPagaRequadro: "Somente se ainda não pago pelo externo",
    referencia: "TCPO: vão ≤ 2,00 m² paga fechado; > 2,00 m² desconta integral e paga requadro (perímetro × preço do m²). Requadro de cada vão é pago uma única vez." },
  { servico: "Reboco/Emboço Externo (fachada)", unidade: "m2", limiteVaoM2: "2.00", descontaAcima: "integral", pagaRequadro: 1, requadroIncluiPeitoril: 0,
    quemPagaRequadro: "Fachada (externo) tem prioridade",
    referencia: "TCPO: vão ≤ 2,00 m² paga fechado; acima desconta e paga o requadro/recuado das esquadrias. Platibandas, frisos e molduras medidos à parte." },
  { servico: "Massa Corrida / Gesso Liso", unidade: "m2", limiteVaoM2: "2.00", descontaAcima: "integral", pagaRequadro: 0,
    referencia: "Prática usual: mesmo critério do reboco (≤ 2,00 m² fechado). Requadros de gesso medidos em m linear à parte quando existirem." },
  { servico: "Pintura Interna", unidade: "m2", limiteVaoM2: "0.00", descontaAcima: "integral", pagaRequadro: 0,
    referencia: "SINAPI: desconta-se TODO vão (área líquida). Esquadrias pintadas usam multiplicadores próprios (porta madeira 2×, grade 2,5×...)." },
  { servico: "Pintura Externa", unidade: "m2", limiteVaoM2: "0.00", descontaAcima: "integral", pagaRequadro: 0,
    referencia: "SINAPI: área líquida (desconta todos os vãos). Requadros/frisos em m linear à parte." },
  { servico: "Textura / Grafiato Externo", unidade: "m2", limiteVaoM2: "2.00", descontaAcima: "integral", pagaRequadro: 1, requadroIncluiPeitoril: 0,
    referencia: "Prática usual de fachada: segue o reboco externo (≤ 2,00 m² fechado; requadro por perímetro quando desconta)." },
  { servico: "Cerâmica / Azulejo — Parede Interna", unidade: "m2", limiteVaoM2: "0.00", descontaAcima: "integral", pagaRequadro: 0,
    referencia: "Desconta-se todo vão (área líquida). Cantos, filetes e requadros cerâmicos medidos em m linear à parte." },
  { servico: "Revestimento de Fachada (cerâmica/porcelanato)", unidade: "m2", limiteVaoM2: "0.00", descontaAcima: "integral", pagaRequadro: 1, requadroIncluiPeitoril: 1,
    referencia: "Área líquida; requadro das esquadrias (perímetro completo) usualmente remunerado à parte." },
  { servico: "Piso Cerâmico / Porcelanato", unidade: "m2", limiteVaoM2: "0.00", descontaAcima: "integral", pagaRequadro: 0,
    referencia: "Área líquida do ambiente. Rodapé em m linear à parte." },
  { servico: "Contrapiso", unidade: "m2", limiteVaoM2: "0.00", descontaAcima: "integral", pagaRequadro: 0,
    referencia: "Área líquida do ambiente (entre paredes acabadas)." },
  { servico: "Forro (gesso/PVC)", unidade: "m2", limiteVaoM2: "0.00", descontaAcima: "integral", pagaRequadro: 0,
    referencia: "Projeção horizontal do forro. Tabica/moldura em m linear à parte. Sancas medidas por desenvolvimento." },
  { servico: "Impermeabilização", unidade: "m2", limiteVaoM2: "0.00", descontaAcima: "integral", pagaRequadro: 0,
    referencia: "Área real impermeabilizada incluindo rodapés/viradas (desenvolvimento), conforme projeto." },
  { servico: "Requadro / Recuado de Esquadria (avulso)", unidade: "m", limiteVaoM2: "0.00", descontaAcima: "nao_desconta", pagaRequadro: 0,
    referencia: "Item de remuneração do requadro quando contratado à parte: perímetro do vão × preço do m linear (ou fração do m² conforme contrato)." },
];

const toBool = (v: any) => Number(v) !== 0;

// Predicados de segurança do ledger: a liberação de carimbos de um contorno
// NUNCA pode cruzar o tipo de pin — vãos (porta/janela) e nichos usam o mesmo
// ledger requadro_*, então cada modo só solta os pins do SEU tipo.
const soPinsVao = sql`${obraEsquadrias.tipologiaId} NOT IN (SELECT id FROM obra_esquadria_tipologias WHERE tipo = 'nicho')`;
const soPinsNicho = sql`${obraEsquadrias.tipologiaId} IN (SELECT id FROM obra_esquadria_tipologias WHERE tipo = 'nicho')`;
const num = (v: any) => { const n = Number(v); return isFinite(n) ? n : 0; };

/** Perímetro do requadro: janela sem peitoril = 2×altura + largura; fechado = 2×(L+A); porta sempre 2×A + L. */
function requadroMlDe(tipo: string, L: number, A: number, incluiPeitoril: boolean): number {
  if (tipo === "porta") return 2 * A + L;
  return incluiPeitoril ? 2 * (L + A) : 2 * A + L;
}

export const medicaoCriteriosRouter = router({
  // ───────────── Catálogo (Configurações → Critérios do Sistema) ─────────────
  listar: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      let rows = await db.select().from(medicaoCriterios)
        .where(and(eq(medicaoCriterios.companyId, input.companyId), eq(medicaoCriterios.ativo, 1)))
        .orderBy(medicaoCriterios.ordem, medicaoCriterios.servico);
      if (rows.length === 0) {
        // Auto-seed: fichas de literatura em rascunho (1x por empresa). Lock
        // consultivo + índice único (company, lower(servico)) WHERE ativo=1
        // impedem seed duplicado em aberturas simultâneas.
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(478007, ${input.companyId})`);
          const [{ n }] = (await tx.execute(sql`SELECT COUNT(*)::int AS n FROM medicao_criterios WHERE company_id = ${input.companyId} AND ativo = 1`)).rows as any[];
          if (Number(n) > 0) return;
          await tx.insert(medicaoCriterios).values(SEED_LITERATURA.map((s, i) => ({
            ...s, companyId: input.companyId, status: "rascunho", ordem: i,
          })) as any).onConflictDoNothing();
        });
        rows = await db.select().from(medicaoCriterios)
          .where(and(eq(medicaoCriterios.companyId, input.companyId), eq(medicaoCriterios.ativo, 1)))
          .orderBy(medicaoCriterios.ordem, medicaoCriterios.servico);
      }
      return rows;
    }),

  salvar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id: z.number().optional(),
      servico: z.string().min(2).max(100),
      chaveServico: z.string().max(50).optional().nullable(),
      unidade: z.string().max(10).optional(),
      status: z.enum(["rascunho", "em_estudo", "definido"]).optional(),
      limiteVaoM2: z.number().min(0).max(9999).optional(),
      descontaAcima: z.enum(["integral", "nao_desconta"]).optional(),
      pagaRequadro: z.boolean().optional(),
      requadroIncluiPeitoril: z.boolean().optional(),
      quemPagaRequadro: z.string().max(100).optional().nullable(),
      referencia: z.string().max(4000).optional().nullable(),
      regraFc: z.string().max(4000).optional().nullable(),
      incluso: z.string().max(4000).optional().nullable(),
      observacoes: z.string().max(4000).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const atualizadoPor = ctx.user?.name || ctx.user?.email || String(ctx.user?.id ?? "");
      const values: any = {
        servico: input.servico.trim(),
        chaveServico: input.chaveServico ?? null,
        atualizadoPor,
        atualizadoEm: new Date(),
      };
      if (input.unidade !== undefined) values.unidade = input.unidade;
      if (input.status !== undefined) values.status = input.status;
      if (input.limiteVaoM2 !== undefined) values.limiteVaoM2 = String(input.limiteVaoM2);
      if (input.descontaAcima !== undefined) values.descontaAcima = input.descontaAcima;
      if (input.pagaRequadro !== undefined) values.pagaRequadro = input.pagaRequadro ? 1 : 0;
      if (input.requadroIncluiPeitoril !== undefined) values.requadroIncluiPeitoril = input.requadroIncluiPeitoril ? 1 : 0;
      if (input.quemPagaRequadro !== undefined) values.quemPagaRequadro = input.quemPagaRequadro;
      if (input.referencia !== undefined) values.referencia = input.referencia;
      if (input.regraFc !== undefined) values.regraFc = input.regraFc;
      if (input.incluso !== undefined) values.incluso = input.incluso;
      if (input.observacoes !== undefined) values.observacoes = input.observacoes;

      try {
        if (input.id) {
          const [row] = await db.update(medicaoCriterios).set(values)
            .where(and(eq(medicaoCriterios.id, input.id), eq(medicaoCriterios.companyId, input.companyId)))
            .returning();
          if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Critério não encontrado." });
          return row;
        }
        const [row] = await db.insert(medicaoCriterios).values({ companyId: input.companyId, ...values }).returning();
        return row;
      } catch (e: any) {
        if (String(e?.code) === "23505" || /duplicate key/i.test(String(e?.message)))
          throw new TRPCError({ code: "CONFLICT", message: `Já existe um critério ativo chamado "${values.servico}".` });
        throw e;
      }
    }),

  excluir: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      await db.update(medicaoCriterios).set({ ativo: 0, atualizadoEm: new Date() })
        .where(and(eq(medicaoCriterios.id, input.id), eq(medicaoCriterios.companyId, input.companyId)));
      return { ok: true };
    }),

  // ───────────── Tipologias de esquadrias (por obra) ─────────────
  listarTipologias: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      return db.select().from(obraEsquadriaTipologias)
        .where(and(eq(obraEsquadriaTipologias.obraId, input.obraId),
          eq(obraEsquadriaTipologias.companyId, input.companyId),
          isNull(obraEsquadriaTipologias.deletedAt)))
        .orderBy(obraEsquadriaTipologias.codigo);
    }),

  salvarTipologia: protectedProcedure
    .input(z.object({
      companyId: z.number(), obraId: z.number(), id: z.number().optional(),
      codigo: z.string().min(1).max(20), tipo: z.enum(["porta", "janela", "nicho"]),
      largura: z.number().min(0).max(50), altura: z.number().min(0).max(50),
      peitoril: z.number().min(0).max(50).optional().nullable(),
      descricao: z.string().max(255).optional().nullable(),
    }).refine(i => i.tipo === "nicho" || (i.largura > 0 && i.altura > 0), { message: "Informe largura e altura." }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const values: any = {
        codigo: input.codigo.trim().toUpperCase(), tipo: input.tipo,
        largura: String(input.largura), altura: String(input.altura),
        peitoril: input.tipo === "janela" && input.peitoril != null ? String(input.peitoril) : null,
        descricao: input.descricao ?? null,
      };
      if (input.id) {
        const [row] = await db.update(obraEsquadriaTipologias).set(values)
          .where(and(eq(obraEsquadriaTipologias.id, input.id),
            eq(obraEsquadriaTipologias.companyId, input.companyId),
            eq(obraEsquadriaTipologias.obraId, input.obraId)))
          .returning();
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Tipologia não encontrada." });
        return row;
      }
      // Código único por obra (entre não-excluídas)
      const dup = await db.select({ id: obraEsquadriaTipologias.id }).from(obraEsquadriaTipologias)
        .where(and(eq(obraEsquadriaTipologias.obraId, input.obraId),
          eq(obraEsquadriaTipologias.companyId, input.companyId),
          eq(obraEsquadriaTipologias.codigo, values.codigo),
          isNull(obraEsquadriaTipologias.deletedAt)));
      if (dup.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Já existe a tipologia ${values.codigo} nesta obra.` });
      const [row] = await db.insert(obraEsquadriaTipologias)
        .values({ companyId: input.companyId, obraId: input.obraId, ...values }).returning();
      return row;
    }),

  // Promove TODOS os critérios ativos da empresa para "definido" (validação em massa).
  definirTodos: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const res = await db.update(medicaoCriterios)
        .set({ status: "definido", atualizadoEm: new Date() })
        .where(and(eq(medicaoCriterios.companyId, input.companyId),
          eq(medicaoCriterios.ativo, 1), ne(medicaoCriterios.status, "definido")))
        .returning({ id: medicaoCriterios.id });
      return { atualizados: res.length };
    }),

  excluirTipologia: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const [tip] = await db.select().from(obraEsquadriaTipologias)
        .where(and(eq(obraEsquadriaTipologias.id, input.id), eq(obraEsquadriaTipologias.companyId, input.companyId)));
      if (!tip) throw new TRPCError({ code: "NOT_FOUND", message: "Tipologia não encontrada." });
      const emUso = await db.select({ id: obraEsquadrias.id }).from(obraEsquadrias)
        .where(and(eq(obraEsquadrias.tipologiaId, input.id), isNull(obraEsquadrias.deletedAt))).limit(1);
      if (emUso.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Tipologia em uso por esquadrias marcadas — exclua os pins primeiro." });
      await db.update(obraEsquadriaTipologias).set({ deletedAt: new Date() })
        .where(eq(obraEsquadriaTipologias.id, input.id));
      return { ok: true };
    }),

  // ───────────── Esquadrias (pins no DXF do pavimento) ─────────────
  listarEsquadrias: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number().optional(), pavimentoId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      if (!input.obraId && !input.pavimentoId) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe obraId ou pavimentoId." });
      const db = (await getDb())!;
      const conds = [eq(obraEsquadrias.companyId, input.companyId), isNull(obraEsquadrias.deletedAt)];
      if (input.obraId) conds.push(eq(obraEsquadrias.obraId, input.obraId));
      if (input.pavimentoId) conds.push(eq(obraEsquadrias.pavimentoId, input.pavimentoId));
      const rows = await db.select({
        e: obraEsquadrias,
        tipCodigo: obraEsquadriaTipologias.codigo,
        tipTipo: obraEsquadriaTipologias.tipo,
        largura: obraEsquadriaTipologias.largura,
        altura: obraEsquadriaTipologias.altura,
        peitoril: obraEsquadriaTipologias.peitoril,
      }).from(obraEsquadrias)
        .innerJoin(obraEsquadriaTipologias, eq(obraEsquadrias.tipologiaId, obraEsquadriaTipologias.id))
        .where(and(...conds))
        .orderBy(obraEsquadrias.codigo);
      return rows.map(r => ({
        ...r.e,
        tipCodigo: r.tipCodigo, tipTipo: r.tipTipo,
        largura: num(r.largura), altura: num(r.altura),
        peitoril: r.peitoril == null ? null : num(r.peitoril),
        areaVao: +(num(r.largura) * num(r.altura)).toFixed(4),
      }));
    }),

  criarEsquadria: protectedProcedure
    .input(z.object({
      companyId: z.number(), obraId: z.number(), pavimentoId: z.number(),
      tipologiaId: z.number(), posX: z.number().min(0).max(1), posY: z.number().min(0).max(1),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      // Pavimento e tipologia devem pertencer à MESMA obra/empresa (anti-IDOR).
      const [pav] = await db.select().from(obraPavimentos)
        .where(and(eq(obraPavimentos.id, input.pavimentoId), eq(obraPavimentos.companyId, input.companyId),
          eq(obraPavimentos.obraId, input.obraId), isNull(obraPavimentos.deletedAt)));
      if (!pav) throw new TRPCError({ code: "NOT_FOUND", message: "Pavimento não encontrado nesta obra." });
      const [tip] = await db.select().from(obraEsquadriaTipologias)
        .where(and(eq(obraEsquadriaTipologias.id, input.tipologiaId),
          eq(obraEsquadriaTipologias.companyId, input.companyId),
          eq(obraEsquadriaTipologias.obraId, input.obraId), isNull(obraEsquadriaTipologias.deletedAt)));
      if (!tip) throw new TRPCError({ code: "NOT_FOUND", message: "Tipologia não encontrada nesta obra." });
      // Sequência por pavimento+tipologia: parte do MAIOR sufixo já usado (inclusive
      // excluídos, p/ nunca reutilizar código) e re-tenta em corrida — índice único
      // parcial (pavimento_id, codigo) garante que dois toques simultâneos nunca
      // geram o mesmo J1-01.
      for (let tentativa = 0; tentativa < 5; tentativa++) {
        const [{ maxN }] = await db.select({
          maxN: sql<number>`COALESCE(MAX(NULLIF(regexp_replace(codigo, '^.*-', ''), '')::int), 0)`,
        }).from(obraEsquadrias)
          .where(and(eq(obraEsquadrias.pavimentoId, input.pavimentoId), eq(obraEsquadrias.tipologiaId, input.tipologiaId)));
        const codigo = `${tip.codigo}-${String(Number(maxN) + 1 + tentativa).padStart(2, "0")}`;
        try {
          const [row] = await db.insert(obraEsquadrias).values({
            companyId: input.companyId, obraId: input.obraId, pavimentoId: input.pavimentoId,
            tipologiaId: input.tipologiaId, codigo,
            posX: String(input.posX), posY: String(input.posY),
          }).returning();
          return row;
        } catch (e: any) {
          if (String(e?.code) !== "23505" && !/duplicate key/i.test(String(e?.message))) throw e;
        }
      }
      throw new TRPCError({ code: "CONFLICT", message: "Não foi possível gerar o código do pin — tente novamente." });
    }),

  // Rev. — Fluxo rápido "clicar e digitar": recebe as MEDIDAS direto, encontra
  // (ou cria automaticamente) a tipologia com essas medidas e marca o pin.
  // Código da tipologia é automático (J1, J2... / P1, P2...); pode ser informado.
  marcarVao: protectedProcedure
    .input(z.object({
      companyId: z.number(), obraId: z.number(), pavimentoId: z.number(),
      tipo: z.enum(["porta", "janela", "nicho"]),
      largura: z.number().min(0).max(50), altura: z.number().min(0).max(50),
      peitoril: z.number().min(0).max(50).optional().nullable(),
      codigo: z.string().max(20).optional(), // opcional: usuário pode forçar um código
      posX: z.number().min(0).max(1), posY: z.number().min(0).max(1),
    }).refine(i => i.tipo === "nicho" || (i.largura > 0 && i.altura > 0), { message: "Informe largura e altura." }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const [pav] = await db.select().from(obraPavimentos)
        .where(and(eq(obraPavimentos.id, input.pavimentoId), eq(obraPavimentos.companyId, input.companyId),
          eq(obraPavimentos.obraId, input.obraId), isNull(obraPavimentos.deletedAt)));
      if (!pav) throw new TRPCError({ code: "NOT_FOUND", message: "Pavimento não encontrado nesta obra." });

      const tips = await db.select().from(obraEsquadriaTipologias)
        .where(and(eq(obraEsquadriaTipologias.obraId, input.obraId),
          eq(obraEsquadriaTipologias.companyId, input.companyId),
          isNull(obraEsquadriaTipologias.deletedAt)));
      const igual = (a: any, b: number) => Math.abs(Number(a) - b) < 0.005;
      const peit = input.tipo === "janela" && input.peitoril != null ? input.peitoril : null;
      // 1) reusa tipologia com MESMO tipo + medidas (peitoril incluso p/ janela)
      let tip = tips.find((t: any) => t.tipo === input.tipo && igual(t.largura, input.largura) && igual(t.altura, input.altura)
        && (input.tipo !== "janela" || (t.peitoril == null ? peit == null : peit != null && igual(t.peitoril, peit))));
      if (!tip) {
        // 2) cria automática: próximo código livre da série (J/P) ou o informado
        let codigo = (input.codigo || "").trim().toUpperCase();
        if (!codigo) {
          const prefixo = input.tipo === "porta" ? "P" : input.tipo === "nicho" ? "N" : "J";
          const usados = new Set(tips.map((t: any) => String(t.codigo).toUpperCase()));
          let n = 1;
          while (usados.has(`${prefixo}${n}`)) n++;
          codigo = `${prefixo}${n}`;
        } else if (tips.some((t: any) => String(t.codigo).toUpperCase() === codigo)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Já existe a tipologia ${codigo} nesta obra (com outras medidas).` });
        }
        [tip] = await db.insert(obraEsquadriaTipologias).values({
          companyId: input.companyId, obraId: input.obraId, codigo, tipo: input.tipo,
          largura: String(input.largura), altura: String(input.altura),
          peitoril: peit != null ? String(peit) : null,
        }).returning();
      }
      // 3) pin com numeração automática (mesma sequência atômica do criarEsquadria)
      for (let tentativa = 0; tentativa < 5; tentativa++) {
        const [{ maxN }] = await db.select({
          maxN: sql<number>`COALESCE(MAX(NULLIF(regexp_replace(codigo, '^.*-', ''), '')::int), 0)`,
        }).from(obraEsquadrias)
          .where(and(eq(obraEsquadrias.pavimentoId, input.pavimentoId), eq(obraEsquadrias.tipologiaId, tip.id)));
        const codigoPin = `${tip.codigo}-${String(Number(maxN) + 1 + tentativa).padStart(2, "0")}`;
        try {
          const [row] = await db.insert(obraEsquadrias).values({
            companyId: input.companyId, obraId: input.obraId, pavimentoId: input.pavimentoId,
            tipologiaId: tip.id, codigo: codigoPin,
            posX: String(input.posX), posY: String(input.posY),
          }).returning();
          return { ...row, tipologia: tip };
        } catch (e: any) {
          if (String(e?.code) !== "23505" && !/duplicate key/i.test(String(e?.message))) throw e;
        }
      }
      throw new TRPCError({ code: "CONFLICT", message: "Não foi possível gerar o código do pin — tente novamente." });
    }),

  atualizarEsquadria: protectedProcedure
    .input(z.object({
      companyId: z.number(), id: z.number(),
      tipologiaId: z.number().optional(),
      posX: z.number().min(0).max(1).optional(), posY: z.number().min(0).max(1).optional(),
      observacoes: z.string().max(1000).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const [esq] = await db.select().from(obraEsquadrias)
        .where(and(eq(obraEsquadrias.id, input.id), eq(obraEsquadrias.companyId, input.companyId), isNull(obraEsquadrias.deletedAt)));
      if (!esq) throw new TRPCError({ code: "NOT_FOUND", message: "Esquadria não encontrada." });
      const values: any = { atualizadoEm: new Date() };
      if (input.tipologiaId !== undefined && input.tipologiaId !== esq.tipologiaId) {
        if (esq.requadroPagoEm) throw new TRPCError({ code: "BAD_REQUEST", message: "Este vão já teve requadro pago em medição — não é possível trocar a tipologia (as medidas mudariam o histórico)." });
        const [tip] = await db.select().from(obraEsquadriaTipologias)
          .where(and(eq(obraEsquadriaTipologias.id, input.tipologiaId),
            eq(obraEsquadriaTipologias.companyId, input.companyId),
            eq(obraEsquadriaTipologias.obraId, esq.obraId), isNull(obraEsquadriaTipologias.deletedAt)));
        if (!tip) throw new TRPCError({ code: "NOT_FOUND", message: "Tipologia não encontrada nesta obra." });
        values.tipologiaId = input.tipologiaId;
      }
      if (input.posX !== undefined) values.posX = String(input.posX);
      if (input.posY !== undefined) values.posY = String(input.posY);
      if (input.observacoes !== undefined) values.observacoes = input.observacoes;
      const [row] = await db.update(obraEsquadrias).set(values).where(eq(obraEsquadrias.id, input.id)).returning();
      return row;
    }),

  excluirEsquadria: protectedProcedure
    .input(z.object({ companyId: z.number(), id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const [esq] = await db.select().from(obraEsquadrias)
        .where(and(eq(obraEsquadrias.id, input.id), eq(obraEsquadrias.companyId, input.companyId), isNull(obraEsquadrias.deletedAt)));
      if (!esq) throw new TRPCError({ code: "NOT_FOUND", message: "Esquadria não encontrada." });
      if (esq.requadroPagoEm) throw new TRPCError({ code: "BAD_REQUEST", message: "Este vão já teve requadro pago em medição — remova o desconto do contorno antes de excluir o pin." });
      await db.update(obraEsquadrias).set({ deletedAt: new Date() }).where(eq(obraEsquadrias.id, input.id));
      return { ok: true };
    }),

  replicarPavimento: protectedProcedure
    .input(z.object({ companyId: z.number(), obraId: z.number(), dePavimentoId: z.number(), paraPavimentoIds: z.array(z.number()).min(1).max(50) }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const origem = await db.select().from(obraEsquadrias)
        .where(and(eq(obraEsquadrias.pavimentoId, input.dePavimentoId),
          eq(obraEsquadrias.companyId, input.companyId), eq(obraEsquadrias.obraId, input.obraId),
          isNull(obraEsquadrias.deletedAt)));
      if (!origem.length) throw new TRPCError({ code: "BAD_REQUEST", message: "O pavimento de origem não tem esquadrias marcadas." });
      const destinos = await db.select().from(obraPavimentos)
        .where(and(inArray(obraPavimentos.id, input.paraPavimentoIds),
          eq(obraPavimentos.companyId, input.companyId), eq(obraPavimentos.obraId, input.obraId),
          isNull(obraPavimentos.deletedAt)));
      if (destinos.length !== input.paraPavimentoIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "Pavimento de destino inválido." });
      let criados = 0; const pulados: string[] = [];
      for (const dest of destinos) {
        if (dest.id === input.dePavimentoId) continue;
        const existentes = await db.select({ id: obraEsquadrias.id }).from(obraEsquadrias)
          .where(and(eq(obraEsquadrias.pavimentoId, dest.id), isNull(obraEsquadrias.deletedAt))).limit(1);
        if (existentes.length) { pulados.push(dest.nome); continue; } // não mistura com marcação existente
        for (const e of origem) {
          await db.insert(obraEsquadrias).values({
            companyId: input.companyId, obraId: input.obraId, pavimentoId: dest.id,
            tipologiaId: e.tipologiaId, codigo: e.codigo,
            posX: e.posX, posY: e.posY,
          });
          criados++;
        }
      }
      return { ok: true, criados, pulados };
    }),

  // ───────────── Motor: aplicar/remover desconto de vãos num contorno ─────────────
  aplicarVaosContorno: protectedProcedure
    .input(z.object({ companyId: z.number(), contornoId: z.number(), esquadriaIds: z.array(z.number()).min(1).max(200) }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      return db.transaction(async (tx) => {
        const [cont] = await tx.select().from(medicaoCampoContornos)
          .where(and(eq(medicaoCampoContornos.id, input.contornoId),
            eq(medicaoCampoContornos.companyId, input.companyId), isNull(medicaoCampoContornos.deletedAt)));
        if (!cont) throw new TRPCError({ code: "NOT_FOUND", message: "Contorno não encontrado." });
        const [campo] = await tx.select().from(medicaoCampo)
          .where(and(eq(medicaoCampo.id, cont.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)));
        if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Levantamento não encontrado." });
        if (campo.consolidadoEm) throw new TRPCError({ code: "BAD_REQUEST", message: "Levantamento consolidado é só-leitura." });
        if (!cont.servico) throw new TRPCError({ code: "BAD_REQUEST", message: "Classifique o contorno num serviço antes de descontar vãos." });
        if ((cont.unidade || "m2") !== "m2" && cont.tipo !== "parede" && cont.tipo !== "area")
          throw new TRPCError({ code: "BAD_REQUEST", message: "Desconto de vão só se aplica a medições de área (m²)." });

        // Pavimento do contorno (via planta importada) — os pins têm que ser do MESMO pavimento.
        const [pdf] = await tx.select().from(medicaoCampoPdfs)
          .where(and(eq(medicaoCampoPdfs.id, cont.pdfId), eq(medicaoCampoPdfs.companyId, input.companyId)));
        if (!pdf?.pavimentoId) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta planta não está vinculada a um pavimento da obra (importe a planta do cadastro da obra)." });

        // Nome do serviço (linha do levantamento) p/ casar com o critério.
        const [srv] = await tx.select().from(medicaoLevantamentoServicos)
          .where(and(eq(medicaoLevantamentoServicos.medicaoCampoId, campo.id),
            eq(medicaoLevantamentoServicos.chave, cont.servico)));
        const nomeServico = (srv?.nome || cont.servico || "").trim();

        // Critério: contrato congelado (terceiros) > catálogo global "definido".
        let criterio: any = null; let origemCriterio = "";
        if (campo.origem === "terceiro") {
          const [ctr] = await tx.select({ j: terceiroContratos.criteriosMedicaoJson })
            .from(terceiroContratos).where(and(eq(terceiroContratos.id, campo.contratoId), eq(terceiroContratos.companyId, input.companyId)));
          if (ctr?.j) {
            try {
              const lista = JSON.parse(ctr.j);
              criterio = (Array.isArray(lista) ? lista : []).find((c: any) =>
                (c.chaveServico && c.chaveServico === cont.servico) ||
                String(c.servico || "").toLowerCase() === nomeServico.toLowerCase() ||
                nomeServico.toLowerCase().includes(String(c.servico || "§").toLowerCase()) ||
                String(c.servico || "").toLowerCase().includes(nomeServico.toLowerCase() || "§"));
              if (criterio) origemCriterio = "contrato";
            } catch { /* JSON inválido → cai no catálogo */ }
          }
        }
        if (!criterio) {
          const defs = await tx.select().from(medicaoCriterios)
            .where(and(eq(medicaoCriterios.companyId, input.companyId),
              eq(medicaoCriterios.status, "definido"), eq(medicaoCriterios.ativo, 1)));
          criterio = defs.find((c: any) =>
            (c.chaveServico && c.chaveServico === cont.servico) ||
            String(c.servico || "").toLowerCase() === nomeServico.toLowerCase()) ||
            defs.find((c: any) =>
              nomeServico && (nomeServico.toLowerCase().includes(String(c.servico).toLowerCase()) ||
                String(c.servico).toLowerCase().includes(nomeServico.toLowerCase())));
          if (criterio) origemCriterio = "catalogo";
        }
        if (!criterio) throw new TRPCError({ code: "BAD_REQUEST", message: `Nenhum critério de medição DEFINIDO para o serviço "${nomeServico}". Defina em Configurações → Critérios do Sistema → Critérios de Medição.` });

        const limite = num(criterio.limiteVaoM2);
        const descontaAcima = String(criterio.descontaAcima || "integral");
        const pagaRequadro = toBool(criterio.pagaRequadro);
        const incluiPeitoril = toBool(criterio.requadroIncluiPeitoril);

        // Se o contorno JÁ tinha vãos aplicados: libera os carimbos DESTE contorno e restaura a área bruta.
        let areaBruta = num(cont.area);
        if (cont.vaosJson) {
          try {
            const prev = JSON.parse(cont.vaosJson);
            if (prev?.modo === "nichos") throw new TRPCError({ code: "BAD_REQUEST", message: "Este contorno tem contagem de nichos aplicada — remova-a antes de descontar vãos." });
            if (prev?.areaBruta != null) areaBruta = num(prev.areaBruta);
          } catch (e) { if (e instanceof TRPCError) throw e; }
          await tx.update(obraEsquadrias).set({
            requadroPagoEm: null, requadroPagoServico: null, requadroPagoOrigem: null,
            requadroPagoContratoId: null, requadroPagoCampoId: null, requadroPagoContornoId: null,
            atualizadoEm: new Date(),
          }).where(and(eq(obraEsquadrias.requadroPagoContornoId, cont.id), eq(obraEsquadrias.companyId, input.companyId), soPinsVao));
        }

        const esqs = await tx.select({
          e: obraEsquadrias,
          tipCodigo: obraEsquadriaTipologias.codigo, tipTipo: obraEsquadriaTipologias.tipo,
          largura: obraEsquadriaTipologias.largura, altura: obraEsquadriaTipologias.altura,
          peitoril: obraEsquadriaTipologias.peitoril,
        }).from(obraEsquadrias)
          .innerJoin(obraEsquadriaTipologias, eq(obraEsquadrias.tipologiaId, obraEsquadriaTipologias.id))
          .where(and(inArray(obraEsquadrias.id, input.esquadriaIds),
            eq(obraEsquadrias.companyId, input.companyId),
            eq(obraEsquadrias.pavimentoId, pdf.pavimentoId),
            isNull(obraEsquadrias.deletedAt)));
        if (esqs.length !== input.esquadriaIds.length)
          throw new TRPCError({ code: "BAD_REQUEST", message: "Há esquadrias inválidas ou de outro pavimento na seleção." });
        if (esqs.some((r: any) => r.tipTipo === "nicho"))
          throw new TRPCError({ code: "BAD_REQUEST", message: "Pins de nicho não entram no desconto de vãos — use \"Contar nichos\" num contorno de contagem." });

        const agora = new Date();
        const itens: any[] = [];
        let descontoTotal = 0; let requadroTotal = 0;
        for (const r of esqs) {
          const L = num(r.largura), A = num(r.altura);
          const areaVao = +(L * A).toFixed(4);
          const desconta = descontaAcima !== "nao_desconta" && areaVao > limite;
          const desconto = desconta ? areaVao : 0;
          let requadro = 0; let requadroStatus = "nao_aplicavel"; let justificativa = "";
          if (desconta && pagaRequadro) {
            // Carimbo ATÔMICO: só cobra se o ledger estiver livre.
            const upd = await tx.update(obraEsquadrias).set({
              requadroPagoEm: agora,
              requadroPagoServico: nomeServico,
              requadroPagoOrigem: campo.origem,
              requadroPagoContratoId: campo.contratoId,
              requadroPagoCampoId: campo.id,
              requadroPagoContornoId: cont.id,
              atualizadoEm: agora,
            }).where(and(eq(obraEsquadrias.id, r.e.id), isNull(obraEsquadrias.requadroPagoEm))).returning({ id: obraEsquadrias.id });
            if (upd.length) {
              requadro = +requadroMlDe(r.tipTipo, L, A, incluiPeitoril).toFixed(4);
              requadroStatus = "pago_aqui";
            } else {
              const [led] = await tx.select({ s: obraEsquadrias.requadroPagoServico }).from(obraEsquadrias).where(eq(obraEsquadrias.id, r.e.id));
              requadroStatus = "ja_pago";
              justificativa = `Requadro não devido — já pago (${led?.s || "outro serviço"}).`;
            }
          } else if (desconta && !pagaRequadro) {
            requadroStatus = "criterio_nao_paga";
          }
          descontoTotal += desconto; requadroTotal += requadro;
          itens.push({
            esquadriaId: r.e.id, codigo: r.e.codigo, tipo: r.tipTipo,
            largura: L, altura: A, peitoril: r.peitoril == null ? null : num(r.peitoril),
            areaVao, desconto: +desconto.toFixed(4), requadroMl: requadro, requadroStatus, justificativa,
          });
        }

        const areaLiquida = Math.max(0, +(areaBruta - descontoTotal).toFixed(4));
        // quantidade acompanha a área na mesma proporção (fator de faces etc.)
        const qtdBruta = num(cont.quantidade);
        const fator = areaBruta > 0 ? areaLiquida / areaBruta : 1;
        const novaQtd = cont.quantidade == null ? null : String(+(qtdBruta === num(cont.area) ? areaLiquida : qtdBruta * fator).toFixed(4));

        const vaosJson = JSON.stringify({
          areaBruta: +areaBruta.toFixed(4),
          criterio: { servico: criterio.servico, origem: origemCriterio, limiteVaoM2: limite, pagaRequadro, incluiPeitoril },
          itens,
          aplicadoEm: agora.toISOString(),
          aplicadoPor: ctx.user?.name || ctx.user?.email || String(ctx.user?.id ?? ""),
        });
        await tx.update(medicaoCampoContornos).set({
          area: String(areaLiquida),
          quantidade: novaQtd,
          vaosJson,
          descontoVaos: String(+descontoTotal.toFixed(4)),
          requadroMl: String(+requadroTotal.toFixed(4)),
          atualizadoEm: agora,
        }).where(eq(medicaoCampoContornos.id, cont.id));

        return { ok: true, areaBruta, areaLiquida, descontoTotal: +descontoTotal.toFixed(4), requadroTotal: +requadroTotal.toFixed(4), itens };
      });
    }),

  // ───────────── Motor: contar NICHOS num contorno de contagem (un) ─────────────
  // O pin de nicho é a identidade única: pago UMA vez (mesmo ledger requadro_*).
  // Reaplicar libera os carimbos DESTE contorno e recarimba do zero — nichos já
  // pagos em OUTRA medição entram zerados com justificativa automática.
  aplicarNichosContorno: protectedProcedure
    .input(z.object({ companyId: z.number(), contornoId: z.number(), esquadriaIds: z.array(z.number()).min(1).max(500) }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      return db.transaction(async (tx) => {
        const [cont] = await tx.select().from(medicaoCampoContornos)
          .where(and(eq(medicaoCampoContornos.id, input.contornoId),
            eq(medicaoCampoContornos.companyId, input.companyId), isNull(medicaoCampoContornos.deletedAt)));
        if (!cont) throw new TRPCError({ code: "NOT_FOUND", message: "Contorno não encontrado." });
        const [campo] = await tx.select().from(medicaoCampo)
          .where(and(eq(medicaoCampo.id, cont.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)));
        if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Levantamento não encontrado." });
        if (campo.consolidadoEm) throw new TRPCError({ code: "BAD_REQUEST", message: "Levantamento consolidado é só-leitura." });
        if (!cont.servico) throw new TRPCError({ code: "BAD_REQUEST", message: "Classifique o contorno num serviço antes de contar nichos." });
        if (cont.tipo !== "contagem")
          throw new TRPCError({ code: "BAD_REQUEST", message: "Contagem de nichos só se aplica a contornos de contagem (un)." });

        const [pdf] = await tx.select().from(medicaoCampoPdfs)
          .where(and(eq(medicaoCampoPdfs.id, cont.pdfId), eq(medicaoCampoPdfs.companyId, input.companyId)));
        if (!pdf?.pavimentoId) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta planta não está vinculada a um pavimento da obra (importe a planta do cadastro da obra)." });

        const [srv] = await tx.select().from(medicaoLevantamentoServicos)
          .where(and(eq(medicaoLevantamentoServicos.medicaoCampoId, campo.id),
            eq(medicaoLevantamentoServicos.chave, cont.servico)));
        const nomeServico = (srv?.nome || cont.servico || "").trim();

        // Se JÁ tinha nichos aplicados: libera os carimbos DESTE contorno e restaura a quantidade original.
        let qtdBruta = num(cont.quantidade);
        if (cont.vaosJson) {
          try {
            const prev = JSON.parse(cont.vaosJson);
            if (prev?.modo !== "nichos") throw new TRPCError({ code: "BAD_REQUEST", message: "Este contorno tem desconto de vãos aplicado — remova-o antes de contar nichos." });
            if (prev?.qtdBruta != null) qtdBruta = num(prev.qtdBruta);
          } catch (e) { if (e instanceof TRPCError) throw e; }
          await tx.update(obraEsquadrias).set({
            requadroPagoEm: null, requadroPagoServico: null, requadroPagoOrigem: null,
            requadroPagoContratoId: null, requadroPagoCampoId: null, requadroPagoContornoId: null,
            atualizadoEm: new Date(),
          }).where(and(eq(obraEsquadrias.requadroPagoContornoId, cont.id), eq(obraEsquadrias.companyId, input.companyId), soPinsNicho));
        }

        const esqs = await tx.select({
          e: obraEsquadrias,
          tipCodigo: obraEsquadriaTipologias.codigo, tipTipo: obraEsquadriaTipologias.tipo,
        }).from(obraEsquadrias)
          .innerJoin(obraEsquadriaTipologias, eq(obraEsquadrias.tipologiaId, obraEsquadriaTipologias.id))
          .where(and(inArray(obraEsquadrias.id, input.esquadriaIds),
            eq(obraEsquadrias.companyId, input.companyId),
            eq(obraEsquadrias.pavimentoId, pdf.pavimentoId),
            isNull(obraEsquadrias.deletedAt)));
        if (esqs.length !== input.esquadriaIds.length)
          throw new TRPCError({ code: "BAD_REQUEST", message: "Há pins inválidos ou de outro pavimento na seleção." });
        if (esqs.some((r: any) => r.tipTipo !== "nicho"))
          throw new TRPCError({ code: "BAD_REQUEST", message: "Somente pins de NICHO entram na contagem — portas e janelas usam o desconto de vãos." });

        const agora = new Date();
        const itens: any[] = [];
        let pagos = 0;
        for (const r of esqs) {
          // Carimbo ATÔMICO: só conta se o ledger estiver livre.
          const upd = await tx.update(obraEsquadrias).set({
            requadroPagoEm: agora,
            requadroPagoServico: nomeServico,
            requadroPagoOrigem: campo.origem,
            requadroPagoContratoId: campo.contratoId,
            requadroPagoCampoId: campo.id,
            requadroPagoContornoId: cont.id,
            atualizadoEm: agora,
          }).where(and(eq(obraEsquadrias.id, r.e.id), isNull(obraEsquadrias.requadroPagoEm))).returning({ id: obraEsquadrias.id });
          if (upd.length) {
            pagos++;
            itens.push({ esquadriaId: r.e.id, codigo: r.e.codigo, status: "pago_aqui", justificativa: "" });
          } else {
            const [led] = await tx.select({ s: obraEsquadrias.requadroPagoServico }).from(obraEsquadrias).where(eq(obraEsquadrias.id, r.e.id));
            itens.push({ esquadriaId: r.e.id, codigo: r.e.codigo, status: "ja_pago", justificativa: `Nicho não devido — já pago (${led?.s || "outra medição"}).` });
          }
        }

        const vaosJson = JSON.stringify({
          modo: "nichos",
          qtdBruta: +qtdBruta.toFixed(4),
          servico: nomeServico,
          itens,
          aplicadoEm: agora.toISOString(),
          aplicadoPor: ctx.user?.name || ctx.user?.email || String(ctx.user?.id ?? ""),
        });
        await tx.update(medicaoCampoContornos).set({
          quantidade: String(pagos),
          contagem: pagos,
          unidade: "un",
          vaosJson,
          atualizadoEm: agora,
        }).where(eq(medicaoCampoContornos.id, cont.id));

        return { ok: true, pagos, jaPagos: itens.length - pagos, itens };
      });
    }),

  removerVaosContorno: protectedProcedure
    .input(z.object({ companyId: z.number(), contornoId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      return db.transaction(async (tx) => {
        const [cont] = await tx.select().from(medicaoCampoContornos)
          .where(and(eq(medicaoCampoContornos.id, input.contornoId),
            eq(medicaoCampoContornos.companyId, input.companyId), isNull(medicaoCampoContornos.deletedAt)));
        if (!cont) throw new TRPCError({ code: "NOT_FOUND", message: "Contorno não encontrado." });
        const [campo] = await tx.select().from(medicaoCampo)
          .where(and(eq(medicaoCampo.id, cont.medicaoCampoId), eq(medicaoCampo.companyId, input.companyId)));
        if (!campo) throw new TRPCError({ code: "NOT_FOUND", message: "Levantamento não encontrado." });
        if (campo.consolidadoEm) throw new TRPCError({ code: "BAD_REQUEST", message: "Levantamento consolidado é só-leitura." });
        if (!cont.vaosJson) return { ok: true };
        let areaBruta = num(cont.area);
        let prevJson: any = null;
        try { prevJson = JSON.parse(cont.vaosJson); if (prevJson?.areaBruta != null) areaBruta = num(prevJson.areaBruta); } catch {}
        // Contagem de nichos aplicada: libera os carimbos e restaura a quantidade original.
        if (prevJson?.modo === "nichos") {
          await tx.update(obraEsquadrias).set({
            requadroPagoEm: null, requadroPagoServico: null, requadroPagoOrigem: null,
            requadroPagoContratoId: null, requadroPagoCampoId: null, requadroPagoContornoId: null,
            atualizadoEm: new Date(),
          }).where(and(eq(obraEsquadrias.requadroPagoContornoId, cont.id), eq(obraEsquadrias.companyId, input.companyId), soPinsNicho));
          const qtdBruta = num(prevJson.qtdBruta);
          await tx.update(medicaoCampoContornos).set({
            quantidade: String(qtdBruta), contagem: Math.round(qtdBruta),
            vaosJson: null, atualizadoEm: new Date(),
          }).where(eq(medicaoCampoContornos.id, cont.id));
          return { ok: true, quantidadeRestaurada: qtdBruta };
        }
        // Libera os carimbos feitos por ESTE contorno.
        await tx.update(obraEsquadrias).set({
          requadroPagoEm: null, requadroPagoServico: null, requadroPagoOrigem: null,
          requadroPagoContratoId: null, requadroPagoCampoId: null, requadroPagoContornoId: null,
          atualizadoEm: new Date(),
        }).where(and(eq(obraEsquadrias.requadroPagoContornoId, cont.id), eq(obraEsquadrias.companyId, input.companyId), soPinsVao));
        const qtdAtual = num(cont.quantidade);
        const areaAtual = num(cont.area);
        const novaQtd = cont.quantidade == null ? null :
          String(qtdAtual === areaAtual ? areaBruta : +(areaAtual > 0 ? qtdAtual * (areaBruta / areaAtual) : areaBruta).toFixed(4));
        await tx.update(medicaoCampoContornos).set({
          area: String(areaBruta), quantidade: novaQtd,
          vaosJson: null, descontoVaos: null, requadroMl: null, atualizadoEm: new Date(),
        }).where(eq(medicaoCampoContornos.id, cont.id));
        return { ok: true, areaRestaurada: areaBruta };
      });
    }),
});
