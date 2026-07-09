/**
 * server/routers/spedEcf.ts
 * tRPC router — SPED ECF (IRPJ/CSLL Lucro Presumido — anual)
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";

const cfgSchema = z.object({
  companyId:        z.number(),
  codQualifPj:      z.string().max(2).default("05"),  // 05=Ltda
  setorAtiv:        z.string().max(2).default("04"),   // 04=Construção Civil
  percPresIrpj:     z.string().max(6).default("32"),   // % base presumida IRPJ
  percPresCSLL:     z.string().max(6).default("32"),   // % base presumida CSLL
  codIndEco:        z.string().max(2).default(""),
  indEscConsDem:    z.string().max(1).default("0"),
  nire:             z.string().max(20).default(""),
});

export const spedEcfRouter = router({
  getConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const r = await db.$client.query(
        `SELECT * FROM sped_ecf_config WHERE company_id=$1 LIMIT 1`,
        [input.companyId]
      );
      return r.rows[0] ?? null;
    }),

  saveConfig: protectedProcedure
    .input(cfgSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.$client.query(`
        INSERT INTO sped_ecf_config
          (company_id, cod_qualif_pj, setor_ativ, perc_pres_irpj, perc_pres_csll,
           cod_ind_eco, ind_esc_cons_dem, nire)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (company_id) DO UPDATE SET
          cod_qualif_pj   = EXCLUDED.cod_qualif_pj,
          setor_ativ      = EXCLUDED.setor_ativ,
          perc_pres_irpj  = EXCLUDED.perc_pres_irpj,
          perc_pres_csll  = EXCLUDED.perc_pres_csll,
          cod_ind_eco     = EXCLUDED.cod_ind_eco,
          ind_esc_cons_dem= EXCLUDED.ind_esc_cons_dem,
          nire            = EXCLUDED.nire,
          updated_at      = now()
      `, [input.companyId, input.codQualifPj, input.setorAtiv,
          input.percPresIrpj, input.percPresCSLL, input.codIndEco,
          input.indEscConsDem, input.nire]);
      return { ok: true };
    }),
});
