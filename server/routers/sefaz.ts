/**
 * server/routers/sefaz.ts
 * Integração com o WebService NFeDistribuicaoDFe da SEFAZ Federal.
 * Busca automaticamente todas as NF-e onde o CNPJ da empresa é destinatário.
 * Rev. 3550 — BACKEND ADITIVO · ZERO ALTER DESTRUTIVO/DROP/DELETE
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import https from "https";
import { gunzipSync } from "zlib";
import { XMLParser } from "fast-xml-parser";

// ── URLs do WebService ──────────────────────────────────────────────────────
const SEFAZ_URL_PROD = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
const SEFAZ_URL_HOM  = "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";

// Códigos IBGE de UF para o campo cUFAutor
const UF_CODES: Record<string, number> = {
  AC:12, AL:27, AP:16, AM:13, BA:29, CE:23, DF:53, ES:32,
  GO:52, MA:21, MT:51, MS:50, MG:31, PA:15, PB:25, PR:41,
  PE:26, PI:22, RJ:33, RN:24, RS:43, RO:11, RR:14, SC:42,
  SP:35, SE:28, TO:17,
};

// ── Parser XML ────────────────────────────────────────────────────────────────
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: true,
  allowBooleanAttributes: true,
});

// ── Helpers ────────────────────────────────────────────────────────────────────
function cleanCnpj(cnpj: string) {
  return cnpj.replace(/\D/g, "");
}

function padNSU(nsu: string | number) {
  return String(nsu || 0).replace(/\D/g, "").padStart(15, "0");
}

function buildSoapEnvelope(cnpj: string, cUFAutor: number, ultNSU: string, tpAmb: number) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <cUFAutor>${cUFAutor}</cUFAutor>
          <CNPJ>${cleanCnpj(cnpj)}</CNPJ>
          <distNSU>
            <ultNSU>${ultNSU}</ultNSU>
          </distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInt>
  </soap12:Body>
</soap12:Envelope>`;
}

function callSefaz(url: string, soapXml: string, pfxBase64: string, pfxPassword: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const pfxBuf = Buffer.from(pfxBase64, "base64");
    const agent = new https.Agent({ pfx: pfxBuf, passphrase: pfxPassword });
    const body = Buffer.from(soapXml, "utf-8");
    const urlObj = new URL(url);

    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: "POST",
      agent,
      headers: {
        "Content-Type": "application/soap+xml; charset=utf-8",
        "Content-Length": body.length,
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        if ((res.statusCode ?? 0) >= 400) {
          reject(new Error(`SEFAZ HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
        } else {
          resolve(raw);
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

interface ResNFe {
  chNFe: string;
  CNPJ?: string;
  xNome?: string;
  dhEmi?: string;
  tpNF?: string;
  vNF?: string;
  cSitNFe?: string;
  nProt?: string;
  dhRecbto?: string;
  nsu?: string;
}

function processDocZip(base64gz: string, nsu: string): ResNFe | null {
  try {
    const buf = Buffer.from(base64gz.trim(), "base64");
    const xml = gunzipSync(buf).toString("utf-8");
    const parsed = xmlParser.parse(xml);
    const root = parsed["resNFe"] || parsed["nfeProc"] || parsed["procEventoNFe"];
    if (!root) return null;
    // resNFe (resumo)
    if (parsed["resNFe"]) {
      const r = parsed["resNFe"];
      return {
        chNFe: String(r.chNFe || ""),
        CNPJ: String(r.CNPJ || ""),
        xNome: String(r.xNome || ""),
        dhEmi: String(r.dhEmi || ""),
        tpNF: String(r.tpNF ?? ""),
        vNF: String(r.vNF || "0"),
        cSitNFe: String(r.cSitNFe || "1"),
        nProt: String(r.nProt || ""),
        nsu,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function extractNumeroNf(chave: string): string {
  // chave NF-e (44 dígitos): 2 UF + 6 AAAAMM + 14 CNPJ + 2 mod + 9 nNF + 1 tpEmis + 8 cod + 1 dig
  if (chave.length !== 44) return chave.slice(0, 9) || "";
  return String(parseInt(chave.substring(25, 34), 10)); // nNF (9 dígitos sem zeros à esquerda)
}

// ── Função principal de sincronização ────────────────────────────────────────
export async function executarSyncNFe(companyId: number): Promise<{ importadas: number; ignoradas: number; erro?: string }> {
  const db = getDb();

  // Buscar config
  const cfgRows = (await db.execute(sql`
    SELECT cnpj, cert_pfx_base64, cert_password, ultimo_nsu, ambiente, uf
    FROM company_nfe_config WHERE company_id = ${companyId} AND ativo = 1
  `)) as any;
  const cfg = (cfgRows?.rows ?? cfgRows)?.[0];
  if (!cfg || !cfg.cert_pfx_base64 || !cfg.cert_password) {
    return { importadas: 0, ignoradas: 0, erro: "Certificado não configurado." };
  }

  const cnpj = cleanCnpj(cfg.cnpj || "");
  const tpAmb = cfg.ambiente === "homologacao" ? 2 : 1;
  const url = tpAmb === 2 ? SEFAZ_URL_HOM : SEFAZ_URL_PROD;
  const ufCodigo = UF_CODES[String(cfg.uf || "SP").toUpperCase()] || 35;

  let ultNSU = padNSU(cfg.ultimo_nsu || "0");
  let importadas = 0;
  let ignoradas = 0;
  let paginas = 0;

  try {
    // Loop de paginação — cada chamada retorna até 50 docs; continua enquanto maxNSU > ultNSU
    while (paginas < 20) {
      paginas++;
      const soap = buildSoapEnvelope(cnpj, ufCodigo, ultNSU, tpAmb);
      const respXml = await callSefaz(url, soap, cfg.cert_pfx_base64, cfg.cert_password);

      const parsed = xmlParser.parse(respXml);
      // Navegar pelo envelope SOAP
      const env = parsed["soap12:Envelope"] || parsed["s:Envelope"] || parsed["Envelope"] || parsed;
      const body = env?.["soap12:Body"] || env?.["s:Body"] || env?.["Body"] || env;
      const resp = body?.["nfeDistDFeIntResponse"] || body;
      const ret = resp?.["nfeDistDFeIntResult"]?.["nfeRetDistDFeInt"]
        || resp?.["nfeRetDistDFeInt"]
        || {};

      const cStat = String(ret?.cStat ?? "");
      const xMotivo = String(ret?.xMotivo ?? "");
      const novoUltNSU = padNSU(ret?.ultNSU ?? ultNSU);
      const maxNSU = padNSU(ret?.maxNSU ?? ultNSU);

      // 137 = sem documentos | 138 = documento localizado | 498 = consultaNSU diferenciada
      if (cStat === "137") break; // sem mais docs
      if (cStat !== "138" && cStat !== "498") {
        throw new Error(`SEFAZ cStat=${cStat}: ${xMotivo}`);
      }

      // Processar documentos
      const lote = ret?.loteDistDFeInt?.docZip;
      const docs: any[] = Array.isArray(lote) ? lote : lote ? [lote] : [];

      for (const doc of docs) {
        const nsuDoc = padNSU(doc?.["@_NSU"] || doc?.NSU || "0");
        const schema = String(doc?.["@_schema"] || doc?.schema || "");
        const b64 = String(doc?.["#text"] || doc || "");

        if (!schema.startsWith("resNFe") && !schema.startsWith("nfeProc")) {
          ignoradas++;
          continue;
        }

        const nfe = processDocZip(b64, nsuDoc);
        if (!nfe || !nfe.chNFe) { ignoradas++; continue; }

        // Verificar se já existe pela chave de acesso
        const existe = (await db.execute(sql`
          SELECT id FROM fiscal_notes WHERE company_id = ${companyId} AND chave_acesso = ${nfe.chNFe} LIMIT 1
        `)) as any;
        const existeRows = (existe?.rows ?? existe) as any[];
        if (existeRows?.length > 0) { ignoradas++; continue; }

        // Cancelada → não importar
        if (nfe.cSitNFe === "2" || nfe.cSitNFe === "3") { ignoradas++; continue; }

        const dataEmissao = nfe.dhEmi ? nfe.dhEmi.substring(0, 10) : new Date().toISOString().substring(0, 10);
        const valorNum = parseFloat(nfe.vNF || "0") || 0;
        const numNf = extractNumeroNf(nfe.chNFe);

        await db.execute(sql`
          INSERT INTO fiscal_notes
            (company_id, numero_nf, chave_acesso, data_emissao, tomador_cnpj, tomador_razao_social,
             descricao_servico, valor_bruto, valor_liquido, status, origem, emitente_cnpj, emitente_nome, nsu_sefaz,
             criado_por_nome, created_at, updated_at)
          VALUES
            (${companyId}, ${numNf}, ${nfe.chNFe}, ${dataEmissao}::date, ${cnpj}, 'FC ENGENHARIA',
             ${'NF-e recebida via SEFAZ' + (nfe.xNome ? ' — ' + nfe.xNome : '')},
             ${valorNum}, ${valorNum}, 'pendente', 'sefaz_nfe', ${cleanCnpj(nfe.CNPJ || '')}, ${nfe.xNome || ''},
             ${nsuDoc}, 'SEFAZ Auto-Sync', NOW(), NOW())
        `);
        importadas++;
      }

      // Atualizar NSU
      const novoNSU = novoUltNSU > ultNSU ? novoUltNSU : ultNSU;
      await db.execute(sql`
        UPDATE company_nfe_config
        SET ultimo_nsu = ${novoNSU}, last_sync_at = NOW(),
            last_sync_result = ${JSON.stringify({ importadas, ignoradas, paginas, cStat, xMotivo })}
        WHERE company_id = ${companyId}
      `);
      ultNSU = novoNSU;

      if (novoUltNSU >= maxNSU) break; // não há mais páginas
    }

    // Salvar resultado final
    await db.execute(sql`
      UPDATE company_nfe_config
      SET last_sync_at = NOW(),
          last_sync_result = ${JSON.stringify({ importadas, ignoradas, paginas })}
      WHERE company_id = ${companyId}
    `);

    return { importadas, ignoradas };
  } catch (e: any) {
    const msg = e?.message || "Erro desconhecido";
    await db.execute(sql`
      UPDATE company_nfe_config
      SET last_sync_at = NOW(), last_sync_result = ${JSON.stringify({ erro: msg })}
      WHERE company_id = ${companyId}
    `).catch(() => {});
    return { importadas, ignoradas, erro: msg };
  }
}

// ── Cron simples: roda 1× por dia às 06:00 ───────────────────────────────────
let _cronStarted = false;
export function startSefazCron() {
  if (_cronStarted) return;
  _cronStarted = true;

  const runAll = async () => {
    try {
      const db = getDb();
      const rows = (await db.execute(sql`
        SELECT company_id FROM company_nfe_config WHERE ativo = 1 AND sync_enabled = 1
      `)) as any;
      const list = (rows?.rows ?? rows) as any[];
      for (const r of list) {
        try {
          const res = await executarSyncNFe(Number(r.company_id));
          console.log(`[SefazSync] company=${r.company_id} importadas=${res.importadas} ignoradas=${res.ignoradas}${res.erro ? " ERRO=" + res.erro : ""}`);
        } catch (e: any) {
          console.error(`[SefazSync] company=${r.company_id} ERRO:`, e?.message);
        }
      }
    } catch (e: any) {
      console.error("[SefazSync] Cron erro:", e?.message);
    }
  };

  // Rodar às 06:00 todos os dias
  const scheduleNext = () => {
    const now = new Date();
    const next = new Date();
    next.setHours(6, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const ms = next.getTime() - now.getTime();
    setTimeout(async () => {
      await runAll();
      scheduleNext();
    }, ms);
  };
  scheduleNext();
  console.log("[SefazSync] Cron diário agendado (06:00).");
}

// ── tRPC Router ────────────────────────────────────────────────────────────────
export const sefazRouter = router({

  getConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user?.isAdminLike) throw new TRPCError({ code: "FORBIDDEN" });
      const db = getDb();
      const rows = (await db.execute(sql`
        SELECT company_id, cnpj, uf, ambiente, sync_enabled, ativo,
               ultimo_nsu, last_sync_at, last_sync_result,
               CASE WHEN cert_pfx_base64 IS NOT NULL AND cert_pfx_base64 <> '' THEN true ELSE false END AS tem_certificado
        FROM company_nfe_config WHERE company_id = ${input.companyId}
      `)) as any;
      const r = (rows?.rows ?? rows)?.[0];
      return r ?? null;
    }),

  saveConfig: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      cnpj: z.string(),
      uf: z.string().default("SP"),
      ambiente: z.enum(["producao", "homologacao"]).default("producao"),
      syncEnabled: z.boolean().default(true),
      certPfxBase64: z.string().optional(),
      certPassword: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user?.isAdminLike) throw new TRPCError({ code: "FORBIDDEN" });
      const db = getDb();

      // Upsert
      const exists = (await db.execute(sql`
        SELECT id FROM company_nfe_config WHERE company_id = ${input.companyId}
      `)) as any;
      const row = (exists?.rows ?? exists)?.[0];

      if (row) {
        await db.execute(sql`
          UPDATE company_nfe_config SET
            cnpj = ${input.cnpj},
            uf = ${input.uf},
            ambiente = ${input.ambiente},
            sync_enabled = ${input.syncEnabled ? 1 : 0},
            ativo = 1,
            ${input.certPfxBase64 ? sql`cert_pfx_base64 = ${input.certPfxBase64},` : sql``}
            ${input.certPassword ? sql`cert_password = ${input.certPassword},` : sql``}
            updated_at = NOW()
          WHERE company_id = ${input.companyId}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO company_nfe_config
            (company_id, cnpj, uf, ambiente, sync_enabled, ativo,
             cert_pfx_base64, cert_password, ultimo_nsu, created_at, updated_at)
          VALUES
            (${input.companyId}, ${input.cnpj}, ${input.uf}, ${input.ambiente},
             ${input.syncEnabled ? 1 : 0}, 1,
             ${input.certPfxBase64 || null}, ${input.certPassword || null},
             '000000000000000', NOW(), NOW())
        `);
      }
      return { ok: true };
    }),

  syncNow: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user?.isAdminLike) throw new TRPCError({ code: "FORBIDDEN" });
      const result = await executarSyncNFe(input.companyId);
      return result;
    }),

  resetNSU: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user?.isAdminLike) throw new TRPCError({ code: "FORBIDDEN" });
      const db = getDb();
      await db.execute(sql`
        UPDATE company_nfe_config SET ultimo_nsu = '000000000000000' WHERE company_id = ${input.companyId}
      `);
      return { ok: true };
    }),
});
