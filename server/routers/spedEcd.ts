/**
 * server/routers/spedEcd.ts
 * tRPC router — SPED ECD (Escrituração Contábil Digital — anual)
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";

const cfgSchema = z.object({
  companyId:      z.number(),
  nire:           z.string().max(20).default(""),
  indSitEspecial: z.string().max(1).default("0"),
  indEscCons:     z.string().max(1).default("0"),  // 0=não consolidado
  codScp:         z.string().max(14).default(""),
  setorAtiv:      z.string().max(2).default("04"),
  codHashEnt:     z.string().max(50).default(""),
});

export const spedEcdRouter = router({
  getConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const r = await db.$client.query(
        `SELECT * FROM sped_ecd_config WHERE company_id=$1 LIMIT 1`,
        [input.companyId]
      );
      return r.rows[0] ?? null;
    }),

  saveConfig: protectedProcedure
    .input(cfgSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.$client.query(`
        INSERT INTO sped_ecd_config
          (company_id, nire, ind_sit_especial, ind_esc_cons, cod_scp, setor_ativ, cod_hash_ent)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (company_id) DO UPDATE SET
          nire            = EXCLUDED.nire,
          ind_sit_especial= EXCLUDED.ind_sit_especial,
          ind_esc_cons    = EXCLUDED.ind_esc_cons,
          cod_scp         = EXCLUDED.cod_scp,
          setor_ativ      = EXCLUDED.setor_ativ,
          cod_hash_ent    = EXCLUDED.cod_hash_ent,
          updated_at      = now()
      `, [input.companyId, input.nire, input.indSitEspecial,
          input.indEscCons, input.codScp, input.setorAtiv, input.codHashEnt]);
      return { ok: true };
    }),
});
