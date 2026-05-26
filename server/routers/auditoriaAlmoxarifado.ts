/**
 * Rev. 2450 — Router de validação/consulta da auditoria do Almoxarifado.
 *
 * O LOG em si (excluir_item / excluir_unidade / alterar_quantidade) já é
 * gravado nas mutations de `compras.ts` desde Rev. 2388. Este router só
 * EXPOE a leitura/validação:
 *
 *  - `listar({ companyId, status?, obraId? })` — todas as auditorias
 *    visíveis pro user (admin vê tudo; restrito vê só obras permitidas).
 *  - `minhasPendencias({ companyId })` — count + lista resumida de
 *    pendentes em que o user atual é validador legítimo (admin_master ou
 *    aprovador da obra via `obra_responsaveis_estoque`).
 *  - `validar({ id, aprovar, observacao? })` — marca como validado
 *    ou rejeitado. Não desfaz a operação (a exclusão/alteração JÁ ocorreu);
 *    o "rejeitar" serve pra alertar a equipe a tomar ação manual (repor
 *    item, restaurar via /auditoria geral, abrir SC, etc.).
 *
 * REGRA DE VALIDADOR (autorização):
 *  - admin_master => valida QUALQUER auditoria da empresa.
 *  - admin        => valida QUALQUER auditoria das companies que ele
 *    tem acesso via `getCompaniesForUser`.
 *  - users com vínculo em `obra_responsaveis_estoque` => validam só
 *    auditorias cuja `obraId` está entre as suas obras de responsabilidade.
 *  - Auditorias com `obraId` NULL (excluir_unidade, item central) só
 *    admin/admin_master valida.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getCompaniesForUser, getEffectiveAllowedObraIds } from "../db";
import { and, eq, desc, inArray, isNull, or, sql } from "drizzle-orm";
import { almoxarifadoAuditoria, obraResponsaveisEstoque, obras } from "../../drizzle/schema";

async function obrasComoValidador(userId: number, companyId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ obraId: obraResponsaveisEstoque.obraId })
    .from(obraResponsaveisEstoque)
    .where(and(
      eq(obraResponsaveisEstoque.userId, userId),
      eq(obraResponsaveisEstoque.companyId, companyId),
    ));
  return rows.map(r => r.obraId);
}

function isAdminLike(role: string | null | undefined): boolean {
  return role === "admin_master" || role === "admin";
}

// Rev. 2450 — Guarda multi-tenant: admin_master atravessa empresas;
// admin precisa ter vínculo via `getCompaniesForUser`. Lança FORBIDDEN
// se não puder ver a empresa.
async function assertCompanyAccess(userId: number, role: string | null | undefined, companyId: number) {
  if (role === "admin_master") return;
  const companies = await getCompaniesForUser(userId, role ?? "");
  if (!companies.some(c => c.id === companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

export const auditoriaAlmoxarifadoRouter = router({
  /**
   * Lista auditorias da empresa, opcionalmente filtradas por status/obra.
   * Retorna join com nome da obra pra tela exibir sem N+1.
   */
  listar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      status: z.enum(["pendente", "validado", "rejeitado"]).optional(),
      obraId: z.number().nullable().optional(),
      limit: z.number().min(1).max(500).default(200),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertCompanyAccess(ctx.user.id, ctx.user.role, input.companyId);
      const conds: any[] = [eq(almoxarifadoAuditoria.companyId, input.companyId)];
      if (input.status) conds.push(eq(almoxarifadoAuditoria.statusValidacao, input.status));
      if (input.obraId === null) {
        conds.push(isNull(almoxarifadoAuditoria.obraId));
      } else if (typeof input.obraId === "number") {
        conds.push(eq(almoxarifadoAuditoria.obraId, input.obraId));
      }
      // Autorização por obra: restritos só veem auditorias das suas obras.
      // Auditorias sem obraId (NULL) ficam ocultas pra restritos.
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null) {
        if (allowed.length === 0) return [];
        conds.push(inArray(almoxarifadoAuditoria.obraId, allowed));
      }
      const rows = await db.select({
        id: almoxarifadoAuditoria.id,
        companyId: almoxarifadoAuditoria.companyId,
        obraId: almoxarifadoAuditoria.obraId,
        obraNome: obras.nome,
        userId: almoxarifadoAuditoria.userId,
        userNome: almoxarifadoAuditoria.userNome,
        acao: almoxarifadoAuditoria.acao,
        entidadeTipo: almoxarifadoAuditoria.entidadeTipo,
        entidadeId: almoxarifadoAuditoria.entidadeId,
        entidadeNome: almoxarifadoAuditoria.entidadeNome,
        dadosAntes: almoxarifadoAuditoria.dadosAntes,
        dadosDepois: almoxarifadoAuditoria.dadosDepois,
        justificativa: almoxarifadoAuditoria.justificativa,
        ip: almoxarifadoAuditoria.ip,
        statusValidacao: almoxarifadoAuditoria.statusValidacao,
        validadoPorId: almoxarifadoAuditoria.validadoPorId,
        validadoPorNome: almoxarifadoAuditoria.validadoPorNome,
        validadoEm: almoxarifadoAuditoria.validadoEm,
        observacaoValidacao: almoxarifadoAuditoria.observacaoValidacao,
        createdAt: almoxarifadoAuditoria.createdAt,
      })
        .from(almoxarifadoAuditoria)
        .leftJoin(obras, eq(obras.id, almoxarifadoAuditoria.obraId))
        .where(and(...conds))
        .orderBy(desc(almoxarifadoAuditoria.createdAt))
        .limit(input.limit);
      return rows;
    }),

  /**
   * Conta pendências em que o user atual é validador legítimo + retorna
   * a lista resumida (pra banner global mostrar quem/qual obra/quando).
   * Cap em 50 itens; banner mostra "+N" se exceder.
   */
  minhasPendencias: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { total: 0, itens: [] as any[] };
      // Empresas onde o user pode atuar.
      const companies = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const companyIds = (input.companyId ? [input.companyId] : companies.map(c => c.id))
        .filter(Boolean);
      if (companyIds.length === 0) return { total: 0, itens: [] };

      const adminLike = isAdminLike(ctx.user.role);
      const conds: any[] = [
        inArray(almoxarifadoAuditoria.companyId, companyIds),
        eq(almoxarifadoAuditoria.statusValidacao, "pendente"),
      ];
      if (!adminLike) {
        // Restrito: só vê pendências das obras onde é responsável de estoque.
        const allObras: number[] = [];
        for (const cid of companyIds) {
          const arr = await obrasComoValidador(ctx.user.id, cid);
          allObras.push(...arr);
        }
        if (allObras.length === 0) return { total: 0, itens: [] };
        conds.push(inArray(almoxarifadoAuditoria.obraId, allObras));
      }
      // COUNT real (sem limit) — pra banner saber se passou de 50.
      const [countRow] = await db.select({ n: sql<number>`count(*)::int` })
        .from(almoxarifadoAuditoria)
        .where(and(...conds));
      const total = Number(countRow?.n ?? 0);
      const rows = await db.select({
        id: almoxarifadoAuditoria.id,
        companyId: almoxarifadoAuditoria.companyId,
        obraId: almoxarifadoAuditoria.obraId,
        obraNome: obras.nome,
        acao: almoxarifadoAuditoria.acao,
        entidadeNome: almoxarifadoAuditoria.entidadeNome,
        userNome: almoxarifadoAuditoria.userNome,
        justificativa: almoxarifadoAuditoria.justificativa,
        createdAt: almoxarifadoAuditoria.createdAt,
      })
        .from(almoxarifadoAuditoria)
        .leftJoin(obras, eq(obras.id, almoxarifadoAuditoria.obraId))
        .where(and(...conds))
        .orderBy(desc(almoxarifadoAuditoria.createdAt))
        .limit(50);
      return { total, itens: rows };
    }),

  /**
   * Aprova ou rejeita uma auditoria pendente. Não desfaz a operação —
   * apenas registra que o gestor revisou. Re-validação proibida (idempotente).
   */
  validar: protectedProcedure
    .input(z.object({
      id: z.number(),
      aprovar: z.boolean(),
      observacao: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [aud] = await db.select().from(almoxarifadoAuditoria)
        .where(eq(almoxarifadoAuditoria.id, input.id));
      if (!aud) throw new TRPCError({ code: "NOT_FOUND", message: "Auditoria não encontrada." });
      if (aud.statusValidacao !== "pendente") {
        throw new TRPCError({ code: "CONFLICT", message: `Já ${aud.statusValidacao} por ${aud.validadoPorNome ?? "outro usuário"}.` });
      }
      // Guarda multi-tenant: o user precisa pertencer à empresa da auditoria.
      await assertCompanyAccess(ctx.user.id, ctx.user.role, aud.companyId);
      // Autorização: admin/admin_master OU aprovador da obra.
      const adminLike = isAdminLike(ctx.user.role);
      if (!adminLike) {
        if (!aud.obraId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores validam auditorias sem obra associada." });
        }
        const minhasObras = await obrasComoValidador(ctx.user.id, aud.companyId);
        if (!minhasObras.includes(aud.obraId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não é responsável de estoque desta obra." });
        }
      }
      await db.update(almoxarifadoAuditoria).set({
        statusValidacao: input.aprovar ? "validado" : "rejeitado",
        validadoPorId: ctx.user.id,
        validadoPorNome: ctx.user.name || null,
        validadoEm: new Date().toISOString(),
        observacaoValidacao: input.observacao?.trim() || null,
      }).where(eq(almoxarifadoAuditoria.id, input.id));
      return { success: true };
    }),
});
