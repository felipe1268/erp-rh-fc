/**
 * server/routers/efdContribuicoes.ts
 * tRPC router — EFD Contribuições (PIS/COFINS)
 * Config específica da contribuição; dados da empresa vêm de efd_icms_ipi_config.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";

const cfgSchema = z.object({
  companyId:     z.number(),
  codIncTrib:    z.string().max(1).default("3"),   // 3=LP, 2=LR, 4=SN
  indRegCum:     z.string().max(1).default("1"),   // 1=cumulativo, 2=não-cum
  aliqPis:       z.string().max(6).default("0.65"),
  aliqCofins:    z.string().max(6).default("3.00"),
  percPresumido: z.string().max(6).default("32"),  // % base presumida serviços
});

export const efdContribuicoesRouter = router({
  getConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const r = await db.$client.query(
        `SELECT * FROM efd_contrib_config WHERE company_id=$1 LIMIT 1`,
        [input.companyId]
      );
      return r.rows[0] ?? null;
    }),

  saveConfig: protectedProcedure
    .input(cfgSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.$client.query(`
        INSERT INTO efd_contrib_config
          (company_id, cod_inc_trib, ind_reg_cum, aliq_pis, aliq_cofins, perc_presumido)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (company_id) DO UPDATE SET
          cod_inc_trib   = EXCLUDED.cod_inc_trib,
          ind_reg_cum    = EXCLUDED.ind_reg_cum,
          aliq_pis       = EXCLUDED.aliq_pis,
          aliq_cofins    = EXCLUDED.aliq_cofins,
          perc_presumido = EXCLUDED.perc_presumido,
          updated_at     = now()
      `, [input.companyId, input.codIncTrib, input.indRegCum,
          input.aliqPis, input.aliqCofins, input.percPresumido]);
      return { ok: true };
    }),
});
