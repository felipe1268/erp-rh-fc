/**
 * server/routers/omie.ts
 * Integração com a API REST da Omie — importação de NF-e recebidas.
 * Rev. 3720 — BACKEND ADITIVO · ZERO ALTER/DROP/DELETE
 *
 * Fluxo:
 *  1. Admin configura App Key + App Secret (gerados no painel Omie).
 *  2. Testa conexão com `testConnection`.
 *  3. Inicia `syncNfe` (assíncrono, atualiza progresso no DB).
 *  4. Frontend faz poll em `getSyncProgress`.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

// ── Helpers ──────────────────────────────────────────────────────────────────

function cleanCnpj(v: string | null | undefined) {
  return (v ?? "").replace(/\D/g, "");
}

/** "DD/MM/AAAA" → "AAAA-MM-DD" (retorna null se inválido) */
function parseOmieDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const p = d.split("/");
  if (p.length !== 3) return null;
  return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
}

function toNum(v: any): number {
  const n = parseFloat(String(v ?? "0").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** Chamada genérica à API Omie */
async function callOmie(
  appKey: string,
  appSecret: string,
  endpoint: string,
  callName: string,
  param: Record<string, any>
): Promise<any> {
  const body = JSON.stringify({
    call: callName,
    app_key: appKey,
    app_secret: appSecret,
    param: [param],
  });
  const resp = await fetch(`https://app.omie.com.br/api/v1/${endpoint}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`Omie HTTP ${resp.status}: ${resp.statusText}`);
  const json: any = await resp.json();
  if (json.faultstring) throw new Error(`Omie API: ${json.faultstring}`);
  if (json.descricao_status) throw new Error(`Omie: ${json.descricao_status}`);
  return json;
}

/** Extrai o array de NF-e da resposta (a Omie usa chaves diferentes conforme versão) */
function extractNfeArray(response: any): any[] {
  return (
    response.nfeSaida ??
    response.nfeEntrada ??
    response.nfeRetorno ??
    response.lista ??
    []
  );
}

// ── Job de sync assíncrono ────────────────────────────────────────────────────

const activeSyncs = new Set<number>(); // guard de concorrência em memória

async function runOmieSync(companyId: number) {
  const db = getDb();
  try {
    // Lê config
    const cfgRows = await db.$client.query(
      `SELECT app_key, app_secret, ano_inicio FROM omie_nfe_config WHERE company_id = $1 AND enabled = TRUE`,
      [companyId]
    );
    if (!cfgRows.rows.length) return;
    const { app_key, app_secret, ano_inicio } = cfgRows.rows[0];

    const anoInicio = Number(ano_inicio ?? 2020);
    const anoAtual = new Date().getFullYear();

    let totalImportadas = 0;
    let totalPaginasGlobal = 0;
    let paginaGlobal = 0;

    // Primeiro, estima total de páginas (todos os anos, 1 chamada/ano para saber o total)
    // Para simplificar, vamos apenas iterar ano a ano, página a página
    for (let ano = anoInicio; ano <= anoAtual; ano++) {
      const de = `01/01/${ano}`;
      const ate = `31/12/${ano}`;

      let pagina = 1;
      let totalPaginas = 1;

      while (pagina <= totalPaginas) {
        // Pausa para não exceder rate limit da Omie
        if (pagina > 1 || ano > anoInicio) {
          await new Promise(r => setTimeout(r, 250));
        }

        let response: any;
        try {
          response = await callOmie(app_key, app_secret, "financas/nfe", "ListarNFe", {
            pagina,
            registros_por_pagina: 50,
            filtrar_por_data_de: de,
            filtrar_por_data_ate: ate,
            apenas_importado_api: "N",
          });
        } catch (apiErr: any) {
          // Erro 5019 = sem registros no período → avança para próximo ano
          const msg = String(apiErr?.message ?? "");
          if (msg.includes("5019") || msg.toLowerCase().includes("nenhum")) break;
          throw apiErr;
        }

        totalPaginas = Number(response.total_de_paginas ?? 1);
        totalPaginasGlobal += totalPaginas;
        paginaGlobal++;

        const notas: any[] = extractNfeArray(response);

        for (const n of notas) {
          const chave = String(n.cChaveNFe ?? n.chaveNFe ?? "").replace(/\D/g, "");
          if (!chave || chave.length < 10) continue;

          const dataEmissao = parseOmieDate(n.dEmi ?? n.dEmissao) ?? `${ano}-01-01`;
          const emiCnpj = cleanCnpj(n.cCNPJ_emit ?? n.CNPJ_emit ?? n.cnpjEmit ?? "");
          const destCnpj = cleanCnpj(n.cCNPJ_dest ?? n.CNPJ_dest ?? n.cnpjDest ?? "");
          const emiNome = String(n.cNome_emit ?? n.cRazaoSocial ?? n.razaoSocial ?? "").slice(0, 255);
          const destNome = String(n.cNome_dest ?? "").slice(0, 255);
          const numeroNf = String(n.nNF ?? n.numeroNF ?? "").slice(0, 20);
          const serie = String(n.cSerie ?? n.serie ?? "1").slice(0, 20);

          const valorBruto = toNum(n.nTotal ?? n.nTotalNF ?? n.valorNF ?? n.total);
          const icms = toNum(n.nVICMS ?? n.nICMS ?? 0);
          const ipi = toNum(n.nVIPI ?? n.nIPI ?? 0);
          const pis = toNum(n.nVPIS ?? n.nPIS ?? 0);
          const cofins = toNum(n.nVCOFINS ?? n.nCOFINS ?? 0);
          const iss = toNum(n.nISSQN ?? n.nISS ?? 0);
          const ir = toNum(n.nIR ?? n.irRetido ?? 0);
          const inss = toNum(n.nINSS ?? n.inssRetido ?? 0);

          const sit = String(n.cSit ?? n.situacao ?? "N").toUpperCase();
          const status = sit === "C" ? "cancelada" : "importada";

          const natureza = String(n.cNatureza ?? n.cDescNatureza ?? n.natureza ?? "").slice(0, 255);

          const payloadJson = JSON.stringify(n);

          // Dedup por chave_acesso + company_id
          await db.$client.query(
            `INSERT INTO fiscal_notes
               (company_id, numero_nf, serie, chave_acesso, data_emissao,
                emitente_cnpj, emitente_nome, tomador_cnpj, tomador_razao_social,
                valor_bruto, valor_liquido,
                iss_retido, retencao_irrf, retencao_inss, retencao_pis, retencao_cofins,
                descricao_servico, status, origem, xml_payload,
                created_at, updated_at)
             SELECT $1,$2,$3,$4,$5, $6,$7,$8,$9, $10,$10, $11,$12,$13,$14,$15, $16,$17,$18,$19, NOW(),NOW()
             WHERE NOT EXISTS (
               SELECT 1 FROM fiscal_notes
               WHERE company_id = $1 AND chave_acesso = $4 AND chave_acesso <> ''
             )`,
            [
              companyId,
              numeroNf, serie, chave, dataEmissao,
              emiCnpj, emiNome, destCnpj, destNome,
              valorBruto,
              iss, ir, inss, pis, cofins,
              natureza,
              status,
              "omie_nfe",
              payloadJson,
            ]
          );
          totalImportadas++;
        }

        // Atualiza progresso no DB a cada página
        await db.$client.query(
          `UPDATE omie_nfe_config
           SET sync_pagina = $2, sync_notas_importadas = $3, updated_at = NOW()
           WHERE company_id = $1`,
          [companyId, paginaGlobal, totalImportadas]
        );

        pagina++;
      }
    }

    // Marca como concluído
    await db.$client.query(
      `UPDATE omie_nfe_config
       SET sync_status = 'done', sync_notas_importadas = $2,
           last_sync_at = NOW(), sync_error = NULL, updated_at = NOW()
       WHERE company_id = $1`,
      [companyId, totalImportadas]
    );
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    try {
      await getDb().$client.query(
        `UPDATE omie_nfe_config
         SET sync_status = 'error', sync_error = $2, updated_at = NOW()
         WHERE company_id = $1`,
        [companyId, msg.slice(0, 1000)]
      );
    } catch (_) {}
  } finally {
    activeSyncs.delete(companyId);
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export const omieRouter = router({
  /** Retorna configuração Omie da empresa */
  getConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.$client.query(
        `SELECT id, company_id, app_key, app_secret, enabled, ano_inicio,
                last_sync_at, sync_status, sync_pagina, sync_paginas_total,
                sync_notas_importadas, sync_error
         FROM omie_nfe_config WHERE company_id = $1`,
        [input.companyId]
      );
      return (rows.rows[0] as any) ?? null;
    }),

  /** Salva App Key, App Secret, enabled, ano_inicio */
  saveConfig: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      appKey:     z.string().max(200),
      appSecret:  z.string().max(200),
      enabled:    z.boolean(),
      anoInicio:  z.number().min(2010).max(2030),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.$client.query(
        `INSERT INTO omie_nfe_config (company_id, app_key, app_secret, enabled, ano_inicio, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (company_id) DO UPDATE
         SET app_key = $2, app_secret = $3, enabled = $4, ano_inicio = $5, updated_at = NOW()`,
        [input.companyId, input.appKey, input.appSecret, input.enabled, input.anoInicio]
      );
      return { success: true };
    }),

  /** Testa as credenciais Omie — chama ListarNFe com mês atual */
  testConnection: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      appKey:    z.string(),
      appSecret: z.string(),
    }))
    .mutation(async ({ input }) => {
      const anoAtual = new Date().getFullYear();
      const de = `01/01/${anoAtual}`;
      const ate = `31/12/${anoAtual}`;

      let response: any;
      try {
        response = await callOmie(input.appKey, input.appSecret, "financas/nfe", "ListarNFe", {
          pagina: 1,
          registros_por_pagina: 3,
          filtrar_por_data_de: de,
          filtrar_por_data_ate: ate,
          apenas_importado_api: "N",
        });
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        // Erro 5019 = "nenhum registro" — mas conexão funcionou!
        if (msg.includes("5019") || msg.toLowerCase().includes("nenhum")) {
          return { ok: true, totalNotas: 0, amostra: [], mensagem: "Conexão OK — sem NF-e em " + anoAtual };
        }
        return { ok: false, totalNotas: 0, amostra: [], mensagem: msg };
      }

      const total = Number(response.total_de_registros ?? 0);
      const amostra = extractNfeArray(response).slice(0, 3).map((n: any) => ({
        numero: n.nNF ?? n.numeroNF,
        chave: n.cChaveNFe ?? n.chaveNFe,
        emitente: n.cNome_emit ?? n.cRazaoSocial,
        data: n.dEmi,
        valor: n.nTotal ?? n.nTotalNF,
      }));

      return {
        ok: true,
        totalNotas: total,
        amostra,
        mensagem: `Conexão OK — ${total} NF-e encontradas em ${anoAtual}`,
      };
    }),

  /** Retorna progresso atual do sync */
  getSyncProgress: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.$client.query(
        `SELECT sync_status, sync_pagina, sync_paginas_total,
                sync_notas_importadas, sync_error, last_sync_at
         FROM omie_nfe_config WHERE company_id = $1`,
        [input.companyId]
      );
      return (rows.rows[0] as any) ?? { sync_status: "idle" };
    }),

  /** Dispara sync assíncrono (retorna imediatamente) */
  syncNfe: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      if (activeSyncs.has(input.companyId)) {
        throw new TRPCError({ code: "CONFLICT", message: "Sync já em andamento para esta empresa." });
      }

      const db = getDb();
      const cfgRows = await db.$client.query(
        `SELECT app_key, app_secret, ano_inicio FROM omie_nfe_config
         WHERE company_id = $1 AND enabled = TRUE`,
        [input.companyId]
      );
      if (!cfgRows.rows.length) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Integração Omie não configurada ou desabilitada." });
      }

      // Marca como running
      await db.$client.query(
        `UPDATE omie_nfe_config
         SET sync_status = 'running', sync_pagina = 0, sync_paginas_total = 0,
             sync_notas_importadas = 0, sync_error = NULL, updated_at = NOW()
         WHERE company_id = $1`,
        [input.companyId]
      );

      activeSyncs.add(input.companyId);
      setImmediate(() => runOmieSync(input.companyId));
      return { started: true };
    }),

  /** Cancela sync (apenas marca como idle — o processo ainda termina a página atual) */
  cancelSync: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      activeSyncs.delete(input.companyId);
      const db = getDb();
      await db.$client.query(
        `UPDATE omie_nfe_config SET sync_status = 'idle', updated_at = NOW() WHERE company_id = $1`,
        [input.companyId]
      );
      return { success: true };
    }),
});
