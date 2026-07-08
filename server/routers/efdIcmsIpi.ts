/**
 * server/routers/efdIcmsIpi.ts
 * tRPC router — configuração da EFD-ICMS/IPI por empresa.
 * Tabela: efd_icms_ipi_config (criada no SyncSchema+ do index.ts)
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";

const ConfigSchema = z.object({
  companyId: z.number(),
  // Empresa
  ie: z.string().max(14).default(""),
  im: z.string().max(20).default(""),
  codMun: z.string().max(7).default(""),
  cep: z.string().max(8).default(""),
  logradouro: z.string().max(60).default(""),
  numeroEnd: z.string().max(10).default(""),
  complemento: z.string().max(60).default(""),
  bairro: z.string().max(60).default(""),
  telefone: z.string().max(11).default(""),
  fax: z.string().max(11).default(""),
  email: z.string().max(255).default(""),
  suframa: z.string().max(9).default(""),
  perfil: z.enum(["A", "B", "C"]).default("A"),
  // Contabilista
  contNome: z.string().max(100).default(""),
  contCpf: z.string().max(11).default(""),
  contCrc: z.string().max(15).default(""),
  contCodMun: z.string().max(7).default(""),
  contCnpj: z.string().max(14).default(""),
  contCep: z.string().max(8).default(""),
  contLogradouro: z.string().max(60).default(""),
  contNumero: z.string().max(10).default(""),
  contComplemento: z.string().max(60).default(""),
  contBairro: z.string().max(60).default(""),
  contFone: z.string().max(11).default(""),
  contFax: z.string().max(11).default(""),
  contEmail: z.string().max(255).default(""),
});

export const efdIcmsIpiRouter = router({
  getConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const q = await db.$client.query(
        `SELECT * FROM efd_icms_ipi_config WHERE company_id=$1 LIMIT 1`,
        [input.companyId]
      );
      const r = q.rows[0];
      if (!r) return null;
      return {
        companyId: r.company_id,
        ie: r.ie || "",
        im: r.im || "",
        codMun: r.cod_mun || "",
        cep: r.cep || "",
        logradouro: r.logradouro || "",
        numeroEnd: r.numero_end || "",
        complemento: r.complemento || "",
        bairro: r.bairro || "",
        telefone: r.telefone || "",
        fax: r.fax || "",
        email: r.email || "",
        suframa: r.suframa || "",
        perfil: (r.perfil || "A") as "A" | "B" | "C",
        contNome: r.cont_nome || "",
        contCpf: r.cont_cpf || "",
        contCrc: r.cont_crc || "",
        contCodMun: r.cont_cod_mun || "",
        contCnpj: r.cont_cnpj || "",
        contCep: r.cont_cep || "",
        contLogradouro: r.cont_logradouro || "",
        contNumero: r.cont_numero || "",
        contComplemento: r.cont_complemento || "",
        contBairro: r.cont_bairro || "",
        contFone: r.cont_fone || "",
        contFax: r.cont_fax || "",
        contEmail: r.cont_email || "",
      };
    }),

  saveConfig: protectedProcedure
    .input(ConfigSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      await db.$client.query(`
        INSERT INTO efd_icms_ipi_config
          (company_id, ie, im, cod_mun, cep, logradouro, numero_end, complemento, bairro,
           telefone, fax, email, suframa, perfil,
           cont_nome, cont_cpf, cont_crc, cont_cod_mun, cont_cnpj, cont_cep,
           cont_logradouro, cont_numero, cont_complemento, cont_bairro,
           cont_fone, cont_fax, cont_email, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,now())
        ON CONFLICT (company_id) DO UPDATE SET
          ie=$2, im=$3, cod_mun=$4, cep=$5, logradouro=$6, numero_end=$7,
          complemento=$8, bairro=$9, telefone=$10, fax=$11, email=$12,
          suframa=$13, perfil=$14,
          cont_nome=$15, cont_cpf=$16, cont_crc=$17, cont_cod_mun=$18,
          cont_cnpj=$19, cont_cep=$20, cont_logradouro=$21, cont_numero=$22,
          cont_complemento=$23, cont_bairro=$24, cont_fone=$25, cont_fax=$26,
          cont_email=$27, updated_at=now()
      `, [
        input.companyId, input.ie, input.im, input.codMun, input.cep,
        input.logradouro, input.numeroEnd, input.complemento, input.bairro,
        input.telefone, input.fax, input.email, input.suframa, input.perfil,
        input.contNome, input.contCpf, input.contCrc, input.contCodMun,
        input.contCnpj, input.contCep, input.contLogradouro, input.contNumero,
        input.contComplemento, input.contBairro, input.contFone, input.contFax,
        input.contEmail,
      ]);
      return { ok: true };
    }),
});
