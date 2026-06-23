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
import forge from "node-forge";

// ── URLs do WebService ──────────────────────────────────────────────────────
const SEFAZ_URL_PROD = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
const SEFAZ_URL_HOM  = "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";

// ── URLs Manifestação do Destinatário (MD-e) ────────────────────────────────
const MDEV_URL_PROD = "https://nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx";
const MDEV_URL_HOM  = "https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx";

const MDEV_TP_EVENTO: Record<string, number> = {
  acatada:      210200,   // Confirmação da Operação
  recusada:     210220,   // Operação Não Realizada
  desconhecida: 210240,   // Desconhecimento da Operação
};
const MDEV_DESC: Record<number, string> = {
  210200: "Confirmacao da Operacao",
  210220: "Operacao nao Realizada",
  210240: "Desconhecimento da Operacao",
};

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
  // Evita converter strings de 12+ dígitos (chave NF-e, CNPJ, NSU) para float64
  // — float64 perde precisão em 44 dígitos, resultando em notação científica (ex: 3.526e+43)
  numberParseOptions: { skipLike: /^\d{12,}$/, leadingZeros: false },
});

// ── Helpers ────────────────────────────────────────────────────────────────────
function cleanCnpj(cnpj: string) {
  return cnpj.replace(/\D/g, "");
}

function padNSU(nsu: string | number) {
  return String(nsu || 0).replace(/\D/g, "").padStart(15, "0");
}

function buildSoapEnvelope(cnpj: string, cUFAutor: number, ultNSU: string, tpAmb: number) {
  // Operação renomeada no WSDL atual: nfeDistDFeInteresse (não nfeDistDFeInt)
  // nfeCabecMsg no Header é obrigatório em todos os WS SEFAZ
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <cUF>${cUFAutor}</cUF>
      <versaoDados>1.01</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
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
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
}

/**
 * Extrai cert + key PEM do PFX usando node-forge.
 * Necessário porque Node 18+/OpenSSL 3.0 rejeita o RC2-40-CBC usado nos
 * certificados A1 brasileiros (ICP-Brasil) com "Unsupported PKCS12 PFX data".
 */
function pfxToPem(pfxBase64: string, password: string): { cert: string; key: string } {
  const pfxDer = forge.util.decode64(pfxBase64);
  const pfxAsn1 = forge.asn1.fromDer(pfxDer);
  const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, password);

  // Extrai certificado
  const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("Certificado não encontrado no PFX.");
  const certPem = forge.pki.certificateToPem(certBag.cert);

  // Extrai chave privada
  const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error("Chave privada não encontrada no PFX.");
  const keyPem = forge.pki.privateKeyToPem(keyBag.key);

  return { cert: certPem, key: keyPem };
}

function callSefaz(url: string, soapXml: string, pfxBase64: string, pfxPassword: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let cert: string, key: string;
    try {
      ({ cert, key } = pfxToPem(pfxBase64, pfxPassword));
    } catch (e: any) {
      return reject(new Error("Erro ao ler certificado PFX: " + (e?.message || e)));
    }
    const agent = new https.Agent({ cert, key, rejectUnauthorized: false });
    const body = Buffer.from(soapXml, "utf-8");
    const urlObj = new URL(url);

    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + (urlObj.search || ""),
      method: "POST",
      agent,
      headers: {
        "Content-Type": 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"',
        "Content-Length": body.byteLength,
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

// ── XMLDsig RSA-SHA1 para Manifestação do Destinatário ──────────────────────

/**
 * Assina o XML do infEvento com RSA-SHA1 (XMLDsig enveloped, C14N 1.0).
 * Retorna o bloco <Signature> completo para inserir dentro de <evento>.
 *
 * O infEventoXml DEVE ter o namespace declarado em si mesmo
 * (xmlns="http://www.portalfiscal.inf.br/nfe") para que a canonicalização
 * do elemento isolado seja trivial (sem namespaces herdados).
 */
function signInfEvento(infEventoXml: string, refId: string, certPem: string, keyPem: string): string {
  // 1. SHA-1 digest do infEvento (C14N trivial: o XML já é o canonical form
  //    pois o namespace está declarado no próprio elemento)
  const mdDigest = forge.md.sha1.create();
  mdDigest.update(forge.util.encodeUtf8(infEventoXml));
  const digestValue = forge.util.encode64(mdDigest.digest().bytes());

  // 2. SignedInfo (sem whitespace entre tags; namespace no próprio elemento)
  const signedInfoXml =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>` +
    `<Reference URI="#${refId}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  // 3. RSA-SHA1 sobre a C14N do SignedInfo
  const pkey = forge.pki.privateKeyFromPem(keyPem);
  const mdSign = forge.md.sha1.create();
  mdSign.update(forge.util.encodeUtf8(signedInfoXml));
  const signatureValue = forge.util.encode64(pkey.sign(mdSign));

  // 4. X509 cert (strip marcadores PEM + newlines)
  const x509 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\r?\n/g, "");

  return (
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfoXml +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${x509}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`
  );
}

/**
 * Monta o envEvento assinado pronto para enviar à SEFAZ.
 */
function buildEnvEvento(opts: {
  cnpj: string;
  chaveNFe: string;
  tpEvento: number;
  tpAmb: number;
  justificativa?: string;
  certPem: string;
  keyPem: string;
}): string {
  const { cnpj, chaveNFe, tpEvento, tpAmb, justificativa, certPem, keyPem } = opts;

  // dhEvento no fuso BRT (UTC-3) — SEFAZ exige offset explícito
  const now = new Date();
  const localIso = new Date(now.getTime() - 3 * 3600000).toISOString().slice(0, 19) + "-03:00";
  const nSeqEvento = 1;
  const id = `ID${tpEvento}${chaveNFe}${String(nSeqEvento).padStart(2, "0")}`;
  const desc = MDEV_DESC[tpEvento];

  const xJust = justificativa
    ? `<xJust>${justificativa.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</xJust>`
    : "";

  const detEvento =
    `<detEvento versao="1.00"><descEvento>${desc}</descEvento>${tpEvento === 210220 ? xJust : ""}</detEvento>`;

  // infEvento com namespace próprio para C14N trivial
  const infEventoXml =
    `<infEvento xmlns="http://www.portalfiscal.inf.br/nfe" Id="${id}">` +
    `<cOrgao>91</cOrgao>` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<CNPJ>${cleanCnpj(cnpj)}</CNPJ>` +
    `<chNFe>${chaveNFe}</chNFe>` +
    `<dhEvento>${localIso}</dhEvento>` +
    `<tpEvento>${tpEvento}</tpEvento>` +
    `<nSeqEvento>${nSeqEvento}</nSeqEvento>` +
    `<verEvento>1.00</verEvento>` +
    detEvento +
    `</infEvento>`;

  const signature = signInfEvento(infEventoXml, id, certPem, keyPem);

  const eventoXml =
    `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">` +
    infEventoXml + signature +
    `</evento>`;

  return (
    `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">` +
    `<idLote>1</idLote>` +
    eventoXml +
    `</envEvento>`
  );
}

function buildSoapEventoEnvelope(envEventoXml: string): string {
  const wsdl = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4";
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Header>` +
    `<nfeCabecMsg xmlns="${wsdl}"><cUF>91</cUF><versaoDados>1.00</versaoDados></nfeCabecMsg>` +
    `</soap12:Header>` +
    `<soap12:Body>` +
    `<nfeRecepcaoEvento xmlns="${wsdl}"><nfeDadosMsg>${envEventoXml}</nfeDadosMsg></nfeRecepcaoEvento>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

function callSefazEvento(url: string, soapXml: string, pfxBase64: string, pfxPassword: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let cert: string, key: string;
    try {
      ({ cert, key } = pfxToPem(pfxBase64, pfxPassword));
    } catch (e: any) {
      return reject(new Error("Erro ao ler certificado PFX: " + (e?.message || e)));
    }
    const agent = new https.Agent({ cert, key, rejectUnauthorized: false });
    const body = Buffer.from(soapXml, "utf-8");
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + (urlObj.search || ""),
      method: "POST",
      agent,
      headers: {
        "Content-Type": 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento"',
        "Content-Length": body.byteLength,
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        if ((res.statusCode ?? 0) >= 400) {
          reject(new Error(`SEFAZ HTTP ${res.statusCode}: ${raw.slice(0, 400)}`));
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

/** Extrai cStat/xMotivo/nProt do XML de retorno do NFeRecepcaoEvento4 */
function parseRetEnvEvento(respXml: string): { cStat: string; xMotivo: string; nProt: string } {
  try {
    const parsed = xmlParser.parse(respXml);
    // Navega pela estrutura SOAP → retEnvEvento → retEvento → infEvento
    const body =
      parsed?.["soap12:Envelope"]?.["soap12:Body"] ??
      parsed?.["soap:Envelope"]?.["soap:Body"] ?? {};
    const result = body["nfeRecepcaoEventoResult"] ?? body["nfeRecepcaoEvento4Result"] ?? {};
    const retEnv = result["retEnvEvento"] ?? parsed["retEnvEvento"] ?? {};
    const retEvento = retEnv["retEvento"] ?? retEnv;
    const infRet = retEvento["infEvento"] ?? retEvento;

    // cStat pode estar no nível retEvento.infEvento ou retEnvEvento
    const cStat   = String(infRet?.cStat   ?? retEnv?.cStat   ?? "");
    const xMotivo = String(infRet?.xMotivo ?? retEnv?.xMotivo ?? "Resposta não reconhecida");
    const nProt   = String(infRet?.nProt   ?? "");
    return { cStat, xMotivo, nProt };
  } catch {
    return { cStat: "", xMotivo: "Erro ao interpretar resposta da SEFAZ", nProt: "" };
  }
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
  rawXml?: string; // XML completo para armazenar no xml_payload
}

function processDocZip(base64gz: string, nsu: string): ResNFe | null {
  try {
    const buf = Buffer.from(base64gz.trim(), "base64");
    const xml = gunzipSync(buf).toString("utf-8");
    const parsed = xmlParser.parse(xml);
    const root = parsed["resNFe"] || parsed["nfeProc"] || parsed["procEventoNFe"];
    if (!root) return null;
    // resNFe (resumo distribuído pelo SEFAZ) — sem XML completo
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
        rawXml: undefined, // resumo não tem XML completo
      };
    }
    // nfeProc (NF-e completa com protocolo) — salva XML completo
    if (parsed["nfeProc"]) {
      const proc = parsed["nfeProc"];
      const infNFe = proc?.["NFe"]?.["infNFe"] || {};
      const infProt = proc?.["protNFe"]?.["infProt"] || {};
      const ide = infNFe?.["ide"] || {};
      const emit = infNFe?.["emit"] || {};
      const total = infNFe?.["total"]?.["ICMSTot"] || {};
      const chNFe = String(infProt?.["chNFe"] || "").replace(/\D/g, "");
      if (!chNFe || chNFe.length !== 44) return null;
      return {
        chNFe,
        CNPJ: String(emit?.["CNPJ"] || emit?.["CPF"] || ""),
        xNome: String(emit?.["xNome"] || ""),
        dhEmi: String(ide?.["dhEmi"] || ""),
        tpNF: String(ide?.["tpNF"] ?? ""),
        vNF: String(total?.["vNF"] || "0"),
        cSitNFe: String(infProt?.["cStat"] === "101" ? "2" : infProt?.["cStat"] === "110" ? "3" : "1"),
        nProt: String(infProt?.["nProt"] || ""),
        nsu,
        rawXml: xml, // XML completo disponível no nfeProc
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parseia o XML completo de uma NF-e (nfeProc) e retorna estrutura de detalhes.
 * Usado pelo endpoint getDetalhesNFe.
 */
function parseNFeXml(xml: string): Record<string, any> | null {
  try {
    const p = xmlParser.parse(xml);
    const proc = p["nfeProc"] || p;
    const nfe = proc["NFe"] || proc["nfe"] || {};
    const infNFe = nfe["infNFe"] || {};
    const infProt = proc["protNFe"]?.["infProt"] || {};
    const ide = infNFe["ide"] || {};
    const emit = infNFe["emit"] || {};
    const dest = infNFe["dest"] || {};
    const transp = infNFe["transp"] || {};
    const cobr = infNFe["cobr"] || {};
    const total = infNFe["total"]?.["ICMSTot"] || {};
    const infAdic = infNFe["infAdic"] || {};

    // Produtos — pode ser array ou objeto único
    const rawDet = infNFe["det"];
    const detArr: any[] = Array.isArray(rawDet) ? rawDet : rawDet ? [rawDet] : [];
    const itens = detArr.map((det: any) => {
      const prod = det["prod"] || {};
      const imp = det["imposto"] || {};
      const icmsBlock = imp["ICMS"] || {};
      const icmsInner = icmsBlock[Object.keys(icmsBlock)[0]] || {};
      const ipiBlock = imp["IPI"]?.["IPITrib"] || {};
      const pisBlock = imp["PIS"]?.["PISAliq"] || imp["PIS"]?.["PISNT"] || {};
      const cofinsBlock = imp["COFINS"]?.["COFINSAliq"] || imp["COFINS"]?.["COFINSNT"] || {};
      return {
        nItem: det["@_nItem"] ?? "",
        cProd: String(prod["cProd"] || ""),
        xProd: String(prod["xProd"] || ""),
        ncm: String(prod["NCM"] || ""),
        cfop: String(prod["CFOP"] || ""),
        uCom: String(prod["uCom"] || ""),
        qCom: String(prod["qCom"] || "0"),
        vUnCom: String(prod["vUnCom"] || "0"),
        vProd: String(prod["vProd"] || "0"),
        vDesc: String(prod["vDesc"] || "0"),
        cst: String(icmsInner["CST"] || icmsInner["CSOSN"] || ""),
        vBC: String(icmsInner["vBC"] || "0"),
        pICMS: String(icmsInner["pICMS"] || "0"),
        vICMS: String(icmsInner["vICMS"] || "0"),
        pIPI: String(ipiBlock["pIPI"] || "0"),
        vIPI: String(ipiBlock["vIPI"] || "0"),
        pPIS: String(pisBlock["pPIS"] || "0"),
        vPIS: String(pisBlock["vPIS"] || "0"),
        pCOFINS: String(cofinsBlock["pCOFINS"] || "0"),
        vCOFINS: String(cofinsBlock["vCOFINS"] || "0"),
      };
    });

    // Endereço emitente
    const enderEmit = emit["enderEmit"] || {};
    const enderDest = dest["enderDest"] || {};

    // Duplicatas
    const rawDup = cobr["dup"];
    const dups: any[] = Array.isArray(rawDup) ? rawDup : rawDup ? [rawDup] : [];

    // Volumes
    const rawVol = transp["vol"];
    const vols: any[] = Array.isArray(rawVol) ? rawVol : rawVol ? [rawVol] : [];

    return {
      ide: {
        nNF: String(ide["nNF"] || ""),
        serie: String(ide["serie"] || ""),
        mod: String(ide["mod"] || ""),
        dhEmi: String(ide["dhEmi"] || ""),
        dhSaiEnt: String(ide["dhSaiEnt"] || ""),
        tpNF: String(ide["tpNF"] ?? ""),
        natOp: String(ide["natOp"] || ""),
        tpEmis: String(ide["tpEmis"] || ""),
        finNFe: String(ide["finNFe"] || ""),
      },
      emit: {
        cnpj: String(emit["CNPJ"] || emit["CPF"] || ""),
        xNome: String(emit["xNome"] || ""),
        xFant: String(emit["xFant"] || ""),
        ie: String(emit["IE"] || ""),
        endereco: `${enderEmit["xLgr"] || ""}, ${enderEmit["nro"] || ""}${enderEmit["xCpl"] ? " " + enderEmit["xCpl"] : ""}`,
        bairro: String(enderEmit["xBairro"] || ""),
        municipio: String(enderEmit["xMun"] || ""),
        uf: String(enderEmit["UF"] || ""),
        cep: String(enderEmit["CEP"] || ""),
        fone: String(enderEmit["fone"] || ""),
      },
      dest: {
        cnpj: String(dest["CNPJ"] || dest["CPF"] || ""),
        xNome: String(dest["xNome"] || ""),
        ie: String(dest["IE"] || ""),
        email: String(dest["email"] || ""),
        endereco: `${enderDest["xLgr"] || ""}, ${enderDest["nro"] || ""}${enderDest["xCpl"] ? " " + enderDest["xCpl"] : ""}`,
        bairro: String(enderDest["xBairro"] || ""),
        municipio: String(enderDest["xMun"] || ""),
        uf: String(enderDest["UF"] || ""),
        cep: String(enderDest["CEP"] || ""),
      },
      itens,
      total: {
        vBC: String(total["vBC"] || "0"),
        vICMS: String(total["vICMS"] || "0"),
        vICMSDeson: String(total["vICMSDeson"] || "0"),
        vST: String(total["vST"] || "0"),
        vProd: String(total["vProd"] || "0"),
        vFrete: String(total["vFrete"] || "0"),
        vSeg: String(total["vSeg"] || "0"),
        vDesc: String(total["vDesc"] || "0"),
        vII: String(total["vII"] || "0"),
        vIPI: String(total["vIPI"] || "0"),
        vPIS: String(total["vPIS"] || "0"),
        vCOFINS: String(total["vCOFINS"] || "0"),
        vOutro: String(total["vOutro"] || "0"),
        vNF: String(total["vNF"] || "0"),
      },
      transp: {
        modFrete: String(transp["modFrete"] ?? ""),
        transportadora: String(transp["transporta"]?.["xNome"] || ""),
        volumes: vols.map((v: any) => ({
          qVol: String(v["qVol"] || ""),
          esp: String(v["esp"] || ""),
          marca: String(v["marca"] || ""),
          nVol: String(v["nVol"] || ""),
          pesoL: String(v["pesoL"] || ""),
          pesoB: String(v["pesoB"] || ""),
        })),
      },
      fatura: cobr["fat"] ? {
        nFat: String(cobr["fat"]["nFat"] || ""),
        vOrig: String(cobr["fat"]["vOrig"] || "0"),
        vDesc: String(cobr["fat"]["vDesc"] || "0"),
        vLiq: String(cobr["fat"]["vLiq"] || "0"),
      } : null,
      duplicatas: dups.map((d: any) => ({
        nDup: String(d["nDup"] || ""),
        dVenc: String(d["dVenc"] || ""),
        vDup: String(d["vDup"] || "0"),
      })),
      infAdic: String(infAdic["infCpl"] || infAdic["infAdFisco"] || ""),
      protocolo: {
        nProt: String(infProt["nProt"] || ""),
        dhRecbto: String(infProt["dhRecbto"] || ""),
        cStat: String(infProt["cStat"] || ""),
        xMotivo: String(infProt["xMotivo"] || ""),
      },
    };
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
  const db = await getDb();

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

  const ultNSUInicial = padNSU(cfg.ultimo_nsu || "0");
  let ultNSU = ultNSUInicial;
  let importadas = 0;
  let ignoradas = 0;
  let paginas = 0;
  let rateLimited = false;
  let rateLimitedNsu: string | null = null; // NSU que a SEFAZ instrui usar na próxima chamada

  // ── Gate de cooldown: evitar queimar cota SEFAZ se já foi rate-limited recentemente ──
  try {
    const prevResult = JSON.parse(cfg.last_sync_result || "{}");
    if (prevResult?.aviso && prevResult?.rateLimitedAt) {
      const elapsedMs = Date.now() - new Date(prevResult.rateLimitedAt).getTime();
      const cooldownMs = 58 * 60 * 1000; // 58 minutos
      if (elapsedMs < cooldownMs) {
        const restantMin = Math.ceil((cooldownMs - elapsedMs) / 60000);
        const aviso = `Limite SEFAZ — aguarde mais ${restantMin} min antes de tentar novamente (cooldown automático).`;
        console.log(`[SefazSync] company=${companyId} COOLDOWN=${restantMin}min — sem chamada à API`);
        return { importadas: 0, ignoradas: 0, aviso };
      }
    }
  } catch { /* ignora erro de parse */ }

  try {
    // Loop de paginação — cada chamada retorna até 50 docs; continua enquanto maxNSU > ultNSU
    while (paginas < 20) {
      paginas++;
      const soap = buildSoapEnvelope(cnpj, ufCodigo, ultNSU, tpAmb);
      let respXml: string;
      try {
        respXml = await callSefaz(url, soap, cfg.cert_pfx_base64, cfg.cert_password);
      } catch (httpErr: any) {
        console.error(`[SefazSync] company=${companyId} HTTP error:`, httpErr?.message);
        throw httpErr;
      }

      // Log das primeiras 800 chars para diagnóstico (sem dados sensíveis)
      console.log(`[SefazSync] company=${companyId} raw(${respXml.length}): ${respXml.slice(0, 800).replace(/\n/g, " ")}`);

      const parsed = xmlParser.parse(respXml);
      // Resposta usa prefixo "soap:" (não "soap12:") — cobrir todos os prefixos conhecidos
      const env = parsed["soap:Envelope"] || parsed["soap12:Envelope"] || parsed["s:Envelope"] || parsed["Envelope"] || parsed;
      const body = env?.["soap:Body"] || env?.["soap12:Body"] || env?.["s:Body"] || env?.["Body"] || env;
      const resp = body?.["nfeDistDFeInteresseResponse"] || body?.["nfeDistDFeIntResponse"] || body;
      // Campo da resposta: retDistDFeInt (operação Interesse) ou nfeRetDistDFeInt (legado)
      const ret = resp?.["nfeDistDFeInteresseResult"]?.["retDistDFeInt"]
        || resp?.["nfeDistDFeInteresseResult"]?.["nfeRetDistDFeInt"]
        || resp?.["nfeDistDFeIntResult"]?.["nfeRetDistDFeInt"]
        || resp?.["nfeRetDistDFeInt"]
        || {};

      const cStat = String(ret?.cStat ?? "");
      const xMotivo = String(ret?.xMotivo ?? "");
      const novoUltNSU = padNSU(ret?.ultNSU ?? ultNSU);
      const maxNSU = padNSU(ret?.maxNSU ?? ultNSU);

      console.log(`[SefazSync] company=${companyId} cStat=${cStat} xMotivo="${xMotivo}" ultNSU=${ultNSU} novoUltNSU=${novoUltNSU} maxNSU=${maxNSU}`);

      // 137 = sem documentos | 138 = documento localizado | 498 = consultaNSU diferenciada
      // 656 = rate limit (Consumo Indevido) — NÃO avança NSU, sinaliza para UI
      if (cStat === "137") break;
      if (cStat === "656") {
        rateLimited = true;
        // SEFAZ retorna o ultNSU correto: salvar para que a próxima chamada use esse ponto
        if (novoUltNSU && novoUltNSU > "000000000000000") rateLimitedNsu = novoUltNSU;
        break;
      }
      if (cStat !== "138" && cStat !== "498") {
        // Inclui trecho do XML bruto na mensagem para diagnóstico
        throw new Error(`SEFAZ cStat=${cStat}: ${xMotivo} | xml=${respXml.slice(0, 300)}`);
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
             xml_payload, criado_por_nome, created_at, updated_at)
          VALUES
            (${companyId}, ${numNf}, ${nfe.chNFe}, ${dataEmissao}::date, ${cnpj}, 'FC ENGENHARIA',
             ${'NF-e recebida via SEFAZ' + (nfe.xNome ? ' — ' + nfe.xNome : '')},
             ${valorNum}, ${valorNum}, 'pendente', 'sefaz_nfe', ${cleanCnpj(nfe.CNPJ || '')}, ${nfe.xNome || ''},
             ${nsuDoc}, ${nfe.rawXml || null}, 'SEFAZ Auto-Sync', NOW(), NOW())
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
    // Rate-limit: SEFAZ retorna ultNSU no 656, mas só deve ser salvo se houve progresso real.
    // Se importadas=0 (bloqueado logo na 1ª chamada sem processar nada), NÃO avançar o NSU
    // — caso contrário o reset de histórico seria desfeito (NSU pularia de 0 para o atual).
    const deveAvancarNsu = rateLimited && rateLimitedNsu && importadas > 0;
    const avisoRateLimit = rateLimited
      ? `Limite SEFAZ (cStat=656). Tente novamente após 1 hora.${deveAvancarNsu ? ` NSU salvo: ${rateLimitedNsu}.` : ""}`
      : undefined;
    const resultPayload = rateLimited
      ? { importadas, ignoradas, paginas, aviso: avisoRateLimit, rateLimitedAt: new Date().toISOString(), nsuSalvo: deveAvancarNsu ? rateLimitedNsu : null }
      : { importadas, ignoradas, paginas };
    if (deveAvancarNsu) {
      // Progresso real antes do rate-limit — salvar checkpoint do NSU
      await db.execute(sql`
        UPDATE company_nfe_config
        SET last_sync_at = NOW(),
            ultimo_nsu = ${rateLimitedNsu},
            last_sync_result = ${JSON.stringify(resultPayload)}
        WHERE company_id = ${companyId}
      `);
      console.log(`[SefazSync] company=${companyId} rateLimitedNsu salvo (progresso real): ${rateLimitedNsu}`);
    } else {
      // Sem progresso (rate-limit na 1ª chamada) ou sem rateLimitedNsu
      // Mantém ultimo_nsu intacto (preserva reset de histórico); salva apenas timing
      await db.execute(sql`
        UPDATE company_nfe_config
        SET last_sync_at = NOW(),
            last_sync_result = ${JSON.stringify(resultPayload)}
        WHERE company_id = ${companyId}
      `);
      if (rateLimited) console.log(`[SefazSync] company=${companyId} rate-limited sem progresso — ultimo_nsu preservado (${ultNSU})`);
    }

    console.log(`[SefazSync] company=${companyId} DONE importadas=${importadas} ignoradas=${ignoradas}${avisoRateLimit ? " RATE-LIMITED" : ""}`);

    return rateLimited
      ? { importadas, ignoradas, aviso: avisoRateLimit }
      : { importadas, ignoradas };
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

// ── Cron horário: a cada hora verifica quais empresas têm sync_hora = hora atual ──
let _cronStarted = false;
export function startSefazCron() {
  if (_cronStarted) return;
  _cronStarted = true;

  const runHour = async () => {
    try {
      const db = await getDb();
      // Sincroniza TODA empresa com sync_enabled=1 que não foi sincronizada nos últimos 58 minutos.
      // Isso aproveita ao máximo o limite SEFAZ (1 chamada/hora/CNPJ) e traz o histórico completo
      // automaticamente, 50 NF-e por hora, sem nenhuma ação manual.
      const rows = (await db.execute(sql`
        SELECT company_id FROM company_nfe_config
        WHERE ativo = 1 AND sync_enabled = 1
          AND (last_sync_at IS NULL OR last_sync_at < NOW() - INTERVAL '58 minutes')
      `)) as any;
      const list = (rows?.rows ?? rows) as any[];
      if (list.length > 0) {
        console.log(`[SefazSync] Cron disparado — ${list.length} empresa(s) elegível(is) para sync`);
      }
      for (const r of list) {
        try {
          const res = await executarSyncNFe(Number(r.company_id));
          console.log(`[SefazSync] company=${r.company_id} importadas=${res.importadas} ignoradas=${res.ignoradas}${(res as any).aviso ? " AVISO=" + (res as any).aviso : ""}${res.erro ? " ERRO=" + res.erro : ""}`);
        } catch (e: any) {
          console.error(`[SefazSync] company=${r.company_id} ERRO:`, e?.message);
        }
      }
    } catch (e: any) {
      console.error("[SefazSync] Cron erro:", e?.message);
    }
  };

  // Agendamento: dispara no início de cada hora cheia
  const scheduleNext = () => {
    const now = new Date();
    const next = new Date();
    next.setMinutes(0, 0, 0);
    next.setHours(now.getHours() + 1);
    const ms = next.getTime() - now.getTime();
    setTimeout(async () => {
      await runHour();
      scheduleNext();
    }, ms);
  };
  scheduleNext();
  console.log("[SefazSync] Cron horário agendado — sincroniza automaticamente toda hora (máx SEFAZ: 1 chamada/hora/CNPJ).");
}

// ── tRPC Router ────────────────────────────────────────────────────────────────
export const sefazRouter = router({

  getConfig: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin_master" && ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      const rows = (await db.execute(sql`
        SELECT company_id, cnpj, uf, ambiente, sync_enabled, ativo,
               COALESCE(sync_hora, 6) AS sync_hora,
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
      syncHora: z.number().min(0).max(23).default(6),
      certPfxBase64: z.string().optional(),
      certPassword: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin_master" && ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();

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
            sync_hora = ${input.syncHora},
            ativo = 1,
            ${input.certPfxBase64 ? sql`cert_pfx_base64 = ${input.certPfxBase64},` : sql``}
            ${input.certPassword ? sql`cert_password = ${input.certPassword},` : sql``}
            updated_at = NOW()
          WHERE company_id = ${input.companyId}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO company_nfe_config
            (company_id, cnpj, uf, ambiente, sync_enabled, sync_hora, ativo,
             cert_pfx_base64, cert_password, ultimo_nsu, created_at, updated_at)
          VALUES
            (${input.companyId}, ${input.cnpj}, ${input.uf}, ${input.ambiente},
             ${input.syncEnabled ? 1 : 0}, ${input.syncHora}, 1,
             ${input.certPfxBase64 || null}, ${input.certPassword || null},
             '000000000000000', NOW(), NOW())
        `);
      }
      return { ok: true };
    }),

  syncNow: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin_master" && ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const result = await executarSyncNFe(input.companyId);
      return result;
    }),

  resetNSU: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin_master" && ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      // Zera NSU E limpa last_sync_result (inclui rateLimitedAt) para que o cooldown
      // não bloqueie a próxima chamada explícita do usuário.
      await db.execute(sql`
        UPDATE company_nfe_config
        SET ultimo_nsu = '000000000000000', last_sync_result = NULL
        WHERE company_id = ${input.companyId}
      `);
      return { ok: true };
    }),

  // ── Importação por upload de XML (histórico 2018-2026) ───────────────────────
  importXml: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      xmlFiles: z.array(z.object({
        name: z.string(),
        content: z.string().max(2_000_000), // 2MB por arquivo
      })).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin_master" && ctx.user?.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      let importadas = 0;
      let ignoradas = 0;
      const erros: string[] = [];

      for (const file of input.xmlFiles) {
        try {
          const parsed = xmlParser.parse(file.content);

          // Suporta: nfeProc (completo), NFe (sem protocolo), resNFe (resumo)
          const nfeProcRoot = parsed["nfeProc"] || parsed;
          const nfeNode = nfeProcRoot["NFe"] || nfeProcRoot["nfeProc"]?.["NFe"] || nfeProcRoot;
          const infNFe = nfeNode["infNFe"] || nfeNode["NFe"]?.["infNFe"];
          const protNFe = nfeProcRoot["protNFe"];
          const infProt = protNFe?.["infProt"];

          // Chave de acesso — campo mais crítico
          const idAttr = String(infNFe?.["@_Id"] || infNFe?.Id || "").replace(/^NFe/, "");
          const chNFe = String(infProt?.["chNFe"] || idAttr || "").replace(/\D/g, "").padStart(44, "");
          if (chNFe.length !== 44) {
            erros.push(`${file.name}: chave de acesso não encontrada ou inválida`);
            ignoradas++;
            continue;
          }

          // Duplicata
          const existe = (await db.execute(sql`
            SELECT id FROM fiscal_notes WHERE company_id=${input.companyId} AND chave_acesso=${chNFe} LIMIT 1
          `)) as any;
          if (((existe?.rows ?? existe) as any[])?.length > 0) { ignoradas++; continue; }

          // cStat: 101=cancelada, 102=inutilizada → não importar
          const cStat = String(infProt?.["cStat"] || "100");
          if (cStat === "101" || cStat === "102") { ignoradas++; continue; }

          const ide = infNFe?.["ide"] || {};
          const emit = infNFe?.["emit"] || {};
          const total = infNFe?.["total"]?.["ICMSTot"] || {};
          const infAdic = infNFe?.["infAdic"] || {};

          const nNF = String(ide?.["nNF"] || ide?.nNF || "0");
          const dhEmi = String(ide?.["dhEmi"] || ide?.dhEmi || "").slice(0, 10);
          const emitenteCnpj = cleanCnpj(String(emit?.["CNPJ"] || emit?.CPF || ""));
          const emitenteNome = String(emit?.["xNome"] || emit?.xNome || "");
          const valor = parseFloat(String(total?.["vNF"] || "0")) || 0;
          const desc = String(infAdic?.["infCpl"] || infAdic?.infCpl || `NF-e ${nNF} — importada via XML`).slice(0, 500);

          const dataEmissao = dhEmi || new Date().toISOString().slice(0, 10);

          await db.execute(sql`
            INSERT INTO fiscal_notes
              (company_id, numero_nf, chave_acesso, data_emissao, descricao_servico,
               valor_bruto, valor_liquido, status, origem, emitente_cnpj, emitente_nome,
               xml_payload, criado_por_nome, created_at, updated_at)
            VALUES
              (${input.companyId}, ${nNF}, ${chNFe}, ${dataEmissao}::date, ${desc},
               ${valor}, ${valor}, 'pendente', 'xml_upload', ${emitenteCnpj}, ${emitenteNome},
               ${file.content}, 'Import XML', NOW(), NOW())
          `);
          importadas++;
        } catch (e: any) {
          erros.push(`${file.name}: ${(e?.message || "Erro desconhecido").slice(0, 120)}`);
        }
      }

      console.log(`[SefazXmlImport] company=${input.companyId} importadas=${importadas} ignoradas=${ignoradas} erros=${erros.length}`);
      return { importadas, ignoradas, erros };
    }),

  manifestar: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      status: z.enum(["acatada", "recusada", "desconhecida", "pendente"]),
      justificativa: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // "pendente" = reverter localmente, sem evento SEFAZ
      if (input.status === "pendente") {
        await db.execute(sql`
          UPDATE fiscal_notes SET status = 'pendente', updated_at = NOW()
          WHERE id = ${input.id} AND company_id = ${input.companyId}
            AND origem IN ('sefaz_nfe', 'xml_upload')
        `);
        return { ok: true, local: true };
      }

      const tpEvento = MDEV_TP_EVENTO[input.status];
      if (!tpEvento) throw new TRPCError({ code: "BAD_REQUEST", message: "Status inválido." });

      // Operação Não Realizada exige justificativa (15–255 chars, NT 2014.002)
      if (tpEvento === 210220) {
        const just = (input.justificativa || "").trim();
        if (just.length < 15 || just.length > 255)
          throw new TRPCError({ code: "BAD_REQUEST", message: "Justificativa obrigatória (15–255 caracteres) para recusa." });
      }

      // Busca nota
      const noteRows = (await db.execute(sql`
        SELECT id, chave_acesso FROM fiscal_notes
        WHERE id = ${input.id} AND company_id = ${input.companyId}
          AND origem IN ('sefaz_nfe', 'xml_upload')
      `)) as any;
      const note = (noteRows?.rows ?? noteRows)?.[0];
      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada." });

      const chaveNFe = String(note.chave_acesso || "").replace(/\D/g, "");
      if (chaveNFe.length !== 44)
        throw new TRPCError({ code: "BAD_REQUEST", message: `Chave de acesso inválida (${chaveNFe.length} dígitos — esperado 44). Não é possível manifestar.` });

      // Busca certificado da empresa
      const cfgRows = (await db.execute(sql`
        SELECT cnpj, cert_pfx_base64, cert_password, ambiente
        FROM company_nfe_config WHERE company_id = ${input.companyId} AND ativo = 1
      `)) as any;
      const cfg = (cfgRows?.rows ?? cfgRows)?.[0];
      if (!cfg?.cert_pfx_base64 || !cfg?.cert_password)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Certificado A1 não configurado. Acesse Configurações → Financeiro → SEFAZ." });

      const cnpj = cleanCnpj(cfg.cnpj || "");
      const tpAmb = cfg.ambiente === "homologacao" ? 2 : 1;
      const url   = tpAmb === 2 ? MDEV_URL_HOM : MDEV_URL_PROD;

      // Extrai PEM do PFX
      let certPem: string, keyPem: string;
      try {
        ({ cert: certPem, key: keyPem } = pfxToPem(cfg.cert_pfx_base64, cfg.cert_password));
      } catch (e: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao ler certificado: " + (e?.message || e) });
      }

      // Monta e assina envEvento
      const envEventoXml = buildEnvEvento({
        cnpj, chaveNFe, tpEvento, tpAmb,
        justificativa: input.justificativa,
        certPem, keyPem,
      });
      const soap = buildSoapEventoEnvelope(envEventoXml);

      console.log(`[SefazMDE] company=${input.companyId} chave=${chaveNFe.slice(0, 10)}… tpEvento=${tpEvento} tpAmb=${tpAmb} url=${url}`);

      // Envia para SEFAZ
      let respXml: string;
      try {
        respXml = await callSefazEvento(url, soap, cfg.cert_pfx_base64, cfg.cert_password);
      } catch (e: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro de comunicação com SEFAZ: " + (e?.message || e) });
      }

      const { cStat, xMotivo, nProt } = parseRetEnvEvento(respXml);
      console.log(`[SefazMDE] cStat=${cStat} xMotivo=${xMotivo} nProt=${nProt}`);

      // 135 = registrado e vinculado | 136 = registrado (NF-e não no AN) | 628 = já existe (idempotente)
      const isOk = ["135", "136", "628"].includes(cStat);
      if (!isOk) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `SEFAZ ${cStat}: ${xMotivo}` });
      }

      // Atualiza status local
      await db.execute(sql`
        UPDATE fiscal_notes SET status = ${input.status}, updated_at = NOW()
        WHERE id = ${input.id} AND company_id = ${input.companyId}
          AND origem IN ('sefaz_nfe', 'xml_upload')
      `);

      return { ok: true, cStat, xMotivo, nProt };
    }),

  getDetalhesNFe: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const rows = (await db.execute(sql`
        SELECT id, numero_nf, chave_acesso, data_emissao, emitente_cnpj, emitente_nome,
               valor_bruto, valor_liquido, status, descricao_servico, nsu_sefaz,
               xml_payload, created_at
        FROM fiscal_notes
        WHERE id = ${input.id} AND company_id = ${input.companyId}
          AND origem IN ('sefaz_nfe', 'xml_upload')
        LIMIT 1
      `)) as any;
      const row = (rows?.rows ?? rows)?.[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Nota não encontrada." });
      const xml = row.xml_payload ? String(row.xml_payload) : null;
      const detalhes = xml ? parseNFeXml(xml) : null;
      return {
        id: Number(row.id),
        numeroNf: String(row.numero_nf || ""),
        chaveAcesso: row.chave_acesso || null,
        dataEmissao: row.data_emissao ? String(row.data_emissao).slice(0, 10) : null,
        emitenteCnpj: row.emitente_cnpj || null,
        emitenteNome: row.emitente_nome || null,
        valorBruto: parseFloat(row.valor_bruto || "0") || 0,
        valorLiquido: parseFloat(row.valor_liquido || "0") || 0,
        status: String(row.status || "pendente"),
        descricaoServico: row.descricao_servico || null,
        nsuSefaz: row.nsu_sefaz || null,
        createdAt: row.created_at ? String(row.created_at).slice(0, 10) : null,
        temXml: !!xml,
        detalhes, // null quando só temos o resNFe (resumo SEFAZ)
      };
    }),

  listNFeRecebidas: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ano: z.number().optional(),
      mes: z.number().optional(),
      search: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const rows = (await db.execute(sql`
        SELECT id, numero_nf, chave_acesso, data_emissao, emitente_cnpj, emitente_nome,
               nsu_sefaz, valor_bruto, valor_liquido, status, descricao_servico,
               entry_id, created_at
        FROM fiscal_notes
        WHERE company_id = ${input.companyId}
          AND origem IN ('sefaz_nfe', 'xml_upload')
          ${input.ano ? sql`AND EXTRACT(YEAR FROM data_emissao) = ${input.ano}` : sql``}
          ${input.mes ? sql`AND EXTRACT(MONTH FROM data_emissao) = ${input.mes}` : sql``}
          ${input.status && input.status !== "todos" ? sql`AND status = ${input.status}` : sql``}
          ${input.search ? sql`AND (
            emitente_nome ILIKE ${'%' + input.search + '%'}
            OR emitente_cnpj ILIKE ${'%' + input.search + '%'}
            OR numero_nf ILIKE ${'%' + input.search + '%'}
            OR chave_acesso ILIKE ${'%' + input.search + '%'}
          )` : sql``}
        ORDER BY data_emissao DESC, id DESC
        LIMIT 500
      `)) as any;
      return ((rows?.rows ?? rows) as any[]).map((r: any) => ({
        id: Number(r.id),
        numeroNf: String(r.numero_nf || ""),
        chaveAcesso: r.chave_acesso || null,
        dataEmissao: r.data_emissao ? String(r.data_emissao).slice(0, 10) : null,
        emitenteCnpj: r.emitente_cnpj || null,
        emitenteNome: r.emitente_nome || null,
        nsuSefaz: r.nsu_sefaz || null,
        valorBruto: parseFloat(r.valor_bruto || "0") || 0,
        valorLiquido: parseFloat(r.valor_liquido || "0") || 0,
        status: String(r.status || "pendente"),
        descricaoServico: r.descricao_servico || null,
        entryId: r.entry_id ? Number(r.entry_id) : null,
        createdAt: r.created_at ? String(r.created_at).slice(0, 10) : null,
      }));
    }),
});
