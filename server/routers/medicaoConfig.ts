// Rev. 3078 — Painel de Controle das Medições (por empresa).
// Governa o COMPORTAMENTO dos módulos "Medição de Cliente" (a receber) e
// "Medição de Terceiros" (a pagar). Ausência de linha = defaults permissivos.
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, getUserCompanyLinks } from "../db";
import { medicaoConfig } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const DEFAULTS = {
  terceirosAtivo: true,
  clienteAtivo: true,
  levantamentoObrigatorio: true,
  fotosObrigatorias: true,
  aprovacaoTresNiveis: true,
  divergenciaToleranciaPct: 5,
  diaMedicaoPadrao: 25,
};

// Guard PERMISSIVO de empresa (mesmo padrão de aiConfig/compras):
// admin libera; usuário SEM vínculo libera; só bloqueia usuário vinculado a
// empresas tentando uma empresa fora dos vínculos.
async function assertCompanyAccess(ctxUser: any, companyId: number) {
  if (!ctxUser?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  if (ctxUser.role === "admin" || ctxUser.role === "admin_master") return;
  const links = await getUserCompanyLinks(ctxUser.id);
  const allowedIds = (links as any[]).map((l: any) => l.companyId).filter((v: any) => typeof v === "number");
  if (allowedIds.length === 0) return;
  if (!allowedIds.includes(companyId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa." });
  }
}

const toBool = (v: any) => Number(v) !== 0;

export const medicaoConfigRouter = router({
  // Retorna a config da empresa, com defaults permissivos quando não há linha.
  getConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const [row] = await db
        .select()
        .from(medicaoConfig)
        .where(eq(medicaoConfig.companyId, input.companyId))
        .limit(1);
      if (!row) return { ...DEFAULTS };
      return {
        terceirosAtivo: toBool(row.terceirosAtivo),
        clienteAtivo: toBool(row.clienteAtivo),
        levantamentoObrigatorio: toBool(row.levantamentoObrigatorio),
        fotosObrigatorias: toBool(row.fotosObrigatorias),
        aprovacaoTresNiveis: toBool(row.aprovacaoTresNiveis),
        divergenciaToleranciaPct: Number(row.divergenciaToleranciaPct ?? DEFAULTS.divergenciaToleranciaPct),
        diaMedicaoPadrao: Number(row.diaMedicaoPadrao ?? DEFAULTS.diaMedicaoPadrao),
      };
    }),

  // Upsert da config. Aceita campos parciais — o que não vier mantém o valor atual
  // (ou o default, se ainda não houver linha).
  salvar: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      terceirosAtivo: z.boolean().optional(),
      clienteAtivo: z.boolean().optional(),
      levantamentoObrigatorio: z.boolean().optional(),
      fotosObrigatorias: z.boolean().optional(),
      aprovacaoTresNiveis: z.boolean().optional(),
      divergenciaToleranciaPct: z.number().min(0).max(100).optional(),
      diaMedicaoPadrao: z.number().int().min(1).max(31).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await assertCompanyAccess(ctx.user, input.companyId);
      const db = (await getDb())!;
      const updatedBy = ctx.user?.name || ctx.user?.email || String(ctx.user?.id ?? "");

      const [existing] = await db
        .select()
        .from(medicaoConfig)
        .where(eq(medicaoConfig.companyId, input.companyId))
        .limit(1);

      // boolean → 0/1, caindo no valor atual (ou default) quando não enviado.
      const b = (inp: boolean | undefined, curCol: any, def: boolean) =>
        (inp !== undefined ? inp : (existing ? toBool(curCol) : def)) ? 1 : 0;
      const num = (inp: number | undefined, curVal: any, def: number) =>
        inp !== undefined ? inp : (existing ? Number(curVal) : def);

      const values = {
        terceirosAtivo: b(input.terceirosAtivo, existing?.terceirosAtivo, DEFAULTS.terceirosAtivo),
        clienteAtivo: b(input.clienteAtivo, existing?.clienteAtivo, DEFAULTS.clienteAtivo),
        levantamentoObrigatorio: b(input.levantamentoObrigatorio, existing?.levantamentoObrigatorio, DEFAULTS.levantamentoObrigatorio),
        fotosObrigatorias: b(input.fotosObrigatorias, existing?.fotosObrigatorias, DEFAULTS.fotosObrigatorias),
        aprovacaoTresNiveis: b(input.aprovacaoTresNiveis, existing?.aprovacaoTresNiveis, DEFAULTS.aprovacaoTresNiveis),
        divergenciaToleranciaPct: String(num(input.divergenciaToleranciaPct, existing?.divergenciaToleranciaPct, DEFAULTS.divergenciaToleranciaPct)),
        diaMedicaoPadrao: num(input.diaMedicaoPadrao, existing?.diaMedicaoPadrao, DEFAULTS.diaMedicaoPadrao),
        updatedBy,
        updatedAt: new Date().toISOString(),
      };

      // Upsert atômico no índice único por empresa (uniq_medicao_config_company) —
      // elimina a janela de corrida entre o select e o insert.
      await db
        .insert(medicaoConfig)
        .values({ companyId: input.companyId, ...values })
        .onConflictDoUpdate({ target: medicaoConfig.companyId, set: values });
      return { ok: true };
    }),
});
