/**
 * server/routers/nfseEmitidas.ts
 * Consulta automática de NFS-e EMITIDAS pela empresa nas prefeituras municipais.
 * Suporta 4 provedores: NFS-e Nacional (RFB), SIL Tecnologia, GIAP/GINFES e TINUS/ABRASF.
 * Rev. 3561 — BACKEND ADITIVO · ZERO ALTER DESTRUTIVO/DROP/DELETE
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import https from "https";
import zlib from "zlib";
import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";

// ── Municípios pré-configurados ──────────────────────────────────────────────
// Guaratinguetá: SIAP GEO para notas até 31/12/2025 + Portal Nacional a partir de 01/01/2026
// ibge_code 35186020 (8 dígitos) = sintético para Portal Nacional (todos os IBGE reais têm 7 dígitos)
export const MUNICIPIOS_PADRAO = [
  {
    ibge_code: 3518602,
    nome_municipio: "Guaratinguetá",
    uf: "SP",
    provider: "siapgeo",
    endpoint: "https://guaratingueta.geosiap.net.br/pmguaratingueta/websis/siapnet/nfse/nfse.asmx",
    auth_type: "portal_login",
    descricao: "SIAP GEO — portal antigo (notas até 31/12/2025). Inscrição = login, token = senha.",
  },
  {
    ibge_code: 35186020,
    nome_municipio: "Guaratinguetá (NFS-e Nacional)",
    uf: "SP",
    provider: "nfse_nacional",
    endpoint: "https://sefin.nfse.gov.br/sefinnacional",
    auth_type: "certificado_a1",
    descricao: "Portal Nacional NFS-e (sefin.nfse.gov.br) — notas a partir de 01/01/2026. REST+mTLS via NSU com certificado A1 do SEFAZ.",
  },
  {
    ibge_code: 3502507,
    nome_municipio: "Aparecida",
    uf: "SP",
    provider: "sil",
    endpoint: "https://aparecida.siltecnologia.com.br/tbw/Consultas",
    auth_type: "portal_login",
    descricao: "SIL Tecnologia — portal do contribuinte com inscrição + senha",
  },
  {
    ibge_code: 3503208,
    nome_municipio: "Araraquara",
    uf: "SP",
    provider: "giap",
    endpoint: "https://araraquara.giap.com.br/ords/pma/ws/nfe",
    auth_type: "token",
    descricao: "GIAP/GINFES — token gerado no portal da prefeitura",
  },
  {
    ibge_code: 2606804,
    nome_municipio: "Igarassu",
    uf: "PE",
    provider: "tinus",
    endpoint: "https://www.tinus.com.br/csp/IGARASSU/nfse.webservice.cls",
    auth_type: "portal_login",
    descricao: "TINUS — portal do contribuinte com inscrição + senha",
  },
] as const;

// ── XML Parser ────────────────────────────────────────────────────────────────
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: true,
  allowBooleanAttributes: true,
  removeNSPrefix: true,  // strips soap:/soapenv:/s: prefixes → Envelope.Body.X sempre casa
});

// ── Helpers compartilhados ────────────────────────────────────────────────────
function pfxToPem(pfxBase64: string, password: string): { cert: string; key: string } {
  const pfxDer = forge.util.decode64(pfxBase64);
  const pfxAsn1 = forge.asn1.fromDer(pfxDer);
  const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, password);

  const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error("Certificado não encontrado no PFX");
  const certPem = forge.pki.certificateToPem(certBag.cert);

  const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error("Chave privada não encontrada no PFX");
  const keyPem = forge.pki.privateKeyToPem(keyBag.key);

  return { cert: certPem, key: keyPem };
}

function callHttps(
  url: string,
  body: string,
  headers: Record<string, string>,
  cert?: string,
  key?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const agentOpts: https.AgentOptions = { rejectUnauthorized: false };
    if (cert && key) { agentOpts.cert = cert; agentOpts.key = key; }
    const agent = new https.Agent(agentOpts);
    const bodyBuf = Buffer.from(body, "utf-8");
    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : 443,
      path: parsed.pathname + (parsed.search || ""),
      method: "POST",
      headers: { ...headers, "Content-Length": bodyBuf.byteLength },
      agent,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const text = (() => { try { return buf.toString("utf-8"); } catch { return buf.toString(); } })();
        // Rejeita respostas não-XML (HTML de erro 404/500, etc.)
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} — endpoint indisponível. Resposta: ${text.slice(0, 200).replace(/\s+/g, " ")}`));
          return;
        }
        const trimmed = text.trimStart();
        if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.startsWith("<HTML")) {
          reject(new Error(`HTTP ${res.statusCode ?? "?"} — portal retornou página HTML (endpoint inválido ou inativo). Verifique a URL configurada.`));
          return;
        }
        resolve(text);
      });
    });
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

// ── GET mTLS → JSON (Portal Nacional NFS-e) ──────────────────────────────────
function callHttpsGetJson(url: string, cert?: string, key?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const agentOpts: https.AgentOptions = { rejectUnauthorized: false };
    if (cert && key) { agentOpts.cert = cert; agentOpts.key = key; }
    const agent = new https.Agent(agentOpts);
    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : 443,
      path: parsed.pathname + (parsed.search || ""),
      method: "GET",
      headers: { "Accept": "application/json" },
      agent,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf-8");
        if (res.statusCode === 404 || res.statusCode === 204) { resolve(null); return; }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} — ${text.slice(0, 300).replace(/\s+/g, " ")}`));
          return;
        }
        try { resolve(JSON.parse(text)); } catch { resolve(null); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// ── Descomprime GZip+Base64 → string UTF-8 ────────────────────────────────────
function decompressGzipBase64(b64: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(b64, "base64");
    zlib.gunzip(buf, (err, result) => {
      if (err) reject(err);
      else resolve(result.toString("utf-8"));
    });
  });
}

// ── Parser do formato de exportação proprietário SIAP GEO ────────────────────
// Raiz <nfse> com múltiplos filhos <nf>. Valores em centavos (inteiros).
// Datas em DD/MM/YYYY. Uma única chamada retorna N notas.
type SiapGeoNota = {
  numero: string; chave: string; dataEmissao: string; dataPrestacao: string;
  prestadorCnpj: string; tomadorCnpj: string; tomadorNome: string;
  valorBruto: number; valorLiquido: number; valorIss: number;
  discriminacao: string; status: "pendente" | "cancelada";
};
function parseSiapGeoExportXml(xml: string): SiapGeoNota[] | null {
  // Detecta pelo prefixo da tag raiz
  if (!xml.includes("<nfse") || !xml.includes("<nf>")) return null;
  try {
    const parsed = xmlParser.parse(xml);
    const root = parsed?.nfse;
    if (!root) return null;
    // fast-xml-parser: array ou objeto único quando há 1 elemento
    const nfArr: any[] = Array.isArray(root.nf) ? root.nf : root.nf ? [root.nf] : [];
    if (!nfArr.length) return null;

    const parseDateBR = (s: string): string => {
      // DD/MM/YYYY → YYYY-MM-DD
      const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? `${m[3]}-${m[2]}-${m[1]}` : String(s || "").slice(0, 10);
    };
    const centsToReais = (v: any): number => {
      const n = parseInt(String(v ?? "0"), 10);
      return isNaN(n) ? 0 : n / 100;
    };

    return nfArr.map((nf: any): SiapGeoNota => {
      const bruto = centsToReais(nf.vl_servico);
      const retencoes = [nf.vl_inss, nf.vl_csll, nf.vl_pis, nf.vl_cofins, nf.vl_ir, nf.vl_outras_retencoes]
        .reduce((acc, v) => acc + centsToReais(v), 0);
      return {
        numero:        String(nf.nr_nf ?? ""),
        chave:         String(nf.codigoverificacao ?? ""),
        dataEmissao:   parseDateBR(String(nf.dt_emissao ?? "")),
        dataPrestacao: parseDateBR(String(nf.dt_prestacao ?? "")),
        prestadorCnpj: String(nf.p_documento ?? "").replace(/\D/g, ""),
        tomadorCnpj:   String(nf.t_documento ?? "").replace(/\D/g, ""),
        tomadorNome:   String(nf.t_razao_social ?? ""),
        valorBruto:    bruto,
        valorLiquido:  Math.max(0, bruto - retencoes),
        valorIss:      centsToReais(nf.vl_iss),
        discriminacao: String(nf.discriminacao ?? ""),
        status:        String(nf.id_nf_st) === "2" ? "cancelada" : "pendente",
      };
    }).filter(n => !!n.numero);
  } catch { return null; }
}

// ── Parser de NFS-e XML individual (Portal Nacional ABRASF) ──────────────────
function parseSefinNfseXml(xml: string): {
  numero: string; chave: string; dataEmissao: string;
  prestadorCnpj: string; prestadorNome: string;
  tomadorCnpj: string; tomadorNome: string;
  valorBruto: number; valorLiquido: number; discriminacao: string;
} | null {
  try {
    const parsed = xmlParser.parse(xml);
    const getAny = (...paths: string[]) => {
      for (const p of paths) {
        let node: any = parsed;
        for (const k of p.split(".")) { node = node?.[k]; }
        if (node !== undefined) return node;
      }
      return undefined;
    };
    const inf =
      getAny("CompNfse.Nfse.InfNfse") ||
      getAny("nfse.infNfse") ||
      {};
    if (!inf) return null;
    const vals = inf?.Servico?.Valores || {};
    const tom = inf?.Tomador?.IdentificacaoTomador?.CpfCnpj || {};
    const prest = inf?.PrestadorServico?.IdentificacaoPrestador?.CpfCnpj ||
                  inf?.Prestador?.CpfCnpj || {};
    const numero = String(inf?.Numero || inf?.numero || "");
    if (!numero) return null;
    return {
      numero,
      chave: String(inf?.CodigoVerificacao || inf?.ChaveNfse || inf?.chaveAcesso || ""),
      dataEmissao: String(inf?.DataEmissao || inf?.dataEmissao || "").slice(0, 10),
      prestadorCnpj: String(prest?.Cnpj || prest?.Cpf || "").replace(/\D/g, ""),
      prestadorNome: String(inf?.PrestadorServico?.RazaoSocial || inf?.Prestador?.RazaoSocial || ""),
      tomadorCnpj: String(tom?.Cnpj || tom?.Cpf || inf?.Tomador?.CpfCnpj?.Cnpj || "").replace(/\D/g, ""),
      tomadorNome: String(inf?.Tomador?.RazaoSocial || ""),
      valorBruto: parseFloat(vals?.ValorServicos || "0") || 0,
      valorLiquido: parseFloat(vals?.ValorLiquidoNfse || vals?.ValorServicos || "0") || 0,
      discriminacao: String(inf?.Servico?.Discriminacao || ""),
    };
  } catch { return null; }
}

// ── Parser COMPLETO de NFS-e XML ABRASF (Portal Nacional + SIAP GEO / SIL / TINUS) ───
export function parseSefinNfseXmlFull(xml: string): Record<string, any> | null {
  try {
    const parsed = xmlParser.parse(xml);

    // Suporta múltiplos envelopes ABRASF
    const getDeep = (obj: any, ...paths: string[]) => {
      for (const p of paths) {
        let n: any = obj;
        for (const k of p.split(".")) { n = n?.[k]; }
        if (n !== undefined && n !== null) return n;
      }
      return undefined;
    };

    const inf: any =
      getDeep(parsed, "CompNfse.Nfse.InfNfse") ||
      getDeep(parsed, "nfse.infNfse") ||
      getDeep(parsed, "Nfse.InfNfse") ||
      {};

    const numero = String(inf?.Numero || inf?.numero || "");
    if (!numero) return null;

    const vals    = inf?.Servico?.Valores   || inf?.servico?.Valores || {};
    const serv    = inf?.Servico            || inf?.servico          || {};
    const prest   = inf?.PrestadorServico   || inf?.Prestador        || {};
    const tom     = inf?.TomadorServico     || inf?.Tomador          || {};
    const rps     = inf?.IdentificacaoRps   || {};
    const orgao   = inf?.OrgaoGerador       || {};

    // Prestador
    const prestIdent  = prest?.IdentificacaoPrestador || {};
    const prestCnpj   = prestIdent?.CpfCnpj?.Cnpj || prestIdent?.CpfCnpj?.Cpf || prest?.CpfCnpj?.Cnpj || "";
    const prestInscr  = prestIdent?.InscricaoMunicipal || prest?.InscricaoMunicipal || "";
    const prestEnd    = prest?.Endereco || {};

    // Tomador
    const tomIdent    = tom?.IdentificacaoTomador || {};
    const tomCnpj     = tomIdent?.CpfCnpj?.Cnpj || tomIdent?.CpfCnpj?.Cpf || tom?.CpfCnpj?.Cnpj || "";
    const tomEnd      = tom?.Endereco || {};
    const tomContato  = tom?.Contato  || {};

    const fmtCnpj = (s: string) => {
      const d = String(s || "").replace(/\D/g, "");
      if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
      if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      return d;
    };
    const fmtCep = (s: string) => {
      const d = String(s || "").replace(/\D/g, "");
      return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, "$1-$2") : d;
    };

    const n = (v: any) => parseFloat(String(v || "0")) || 0;

    return {
      // Identificação da NFS-e
      numero,
      serie:                   String(rps?.Serie         || rps?.serie         || ""),
      rpsNumero:               String(rps?.Numero        || rps?.numero        || ""),
      rpsTipo:                 String(rps?.Tipo          || rps?.tipo          || ""),
      codigoVerificacao:       String(inf?.CodigoVerificacao || inf?.ChaveNfse || ""),
      dataEmissao:             String(inf?.DataEmissao   || "").replace("T", " ").slice(0, 19),
      competencia:             String(inf?.Competencia   || "").slice(0, 10),
      situacao:                String(inf?.NaturezaOperacao || inf?.situacao || ""),
      informacoesCompl:        String(inf?.InformacoesComplementares || inf?.informacoesComplementares || ""),

      // Serviço
      discriminacao:           String(serv?.Discriminacao || ""),
      codigoItemLista:         String(serv?.ItemListaServico || serv?.CodigoTributacaoMunicipio || ""),
      codigoTributacao:        String(serv?.CodigoTributacaoMunicipio || ""),
      codigoMunicipio:         String(serv?.CodigoMunicipio || orgao?.CodigoMunicipio || ""),
      municipioIncidencia:     String(serv?.MunicipioIncidencia || ""),

      // Valores
      valorServicos:           n(vals?.ValorServicos),
      valorDeducoes:           n(vals?.ValorDeducoes),
      valorPis:                n(vals?.ValorPis),
      valorCofins:             n(vals?.ValorCofins),
      valorInss:               n(vals?.ValorInss),
      valorIr:                 n(vals?.ValorIr),
      valorCsll:               n(vals?.ValorCsll),
      issRetido:               String(vals?.IssRetido || "2"), // 1=sim 2=não
      valorIss:                n(vals?.ValorIss),
      valorIssRetido:          n(vals?.ValorIssRetido),
      valorOutrasRetencoes:    n(vals?.OutrasRetencoes),
      baseCalculo:             n(vals?.BaseCalculo),
      aliquota:                n(vals?.Aliquota),
      valorLiquido:            n(vals?.ValorLiquidoNfse || vals?.ValorServicos),

      // Prestador (emitente)
      prestadorCnpj:           fmtCnpj(prestCnpj),
      prestadorInscricao:      String(prestInscr),
      prestadorNome:           String(prest?.RazaoSocial || prest?.razaoSocial || ""),
      prestadorEndereco:       [prestEnd?.Endereco, prestEnd?.Numero, prestEnd?.Complemento].filter(Boolean).join(", "),
      prestadorBairro:         String(prestEnd?.Bairro || ""),
      prestadorMunicipio:      String(prestEnd?.NomeMunicipio || prestEnd?.CodigoMunicipio || ""),
      prestadorUf:             String(prestEnd?.Uf || prestEnd?.UF || ""),
      prestadorCep:            fmtCep(prestEnd?.Cep || prestEnd?.CEP || ""),
      prestadorEmail:          String(prest?.Contato?.Email || ""),
      prestadorFone:           String(prest?.Contato?.Telefone || prest?.Contato?.Fone || ""),

      // Tomador (destinatário)
      tomadorCnpj:             fmtCnpj(tomCnpj),
      tomadorInscricao:        String(tomIdent?.InscricaoMunicipal || ""),
      tomadorNome:             String(tom?.RazaoSocial || tom?.razaoSocial || ""),
      tomadorEndereco:         [tomEnd?.Endereco, tomEnd?.Numero, tomEnd?.Complemento].filter(Boolean).join(", "),
      tomadorBairro:           String(tomEnd?.Bairro || ""),
      tomadorMunicipio:        String(tomEnd?.NomeMunicipio || tomEnd?.CodigoMunicipio || ""),
      tomadorUf:               String(tomEnd?.Uf || tomEnd?.UF || ""),
      tomadorCep:              fmtCep(tomEnd?.Cep || tomEnd?.CEP || ""),
      tomadorEmail:            String(tomContato?.Email || ""),
      tomadorFone:             String(tomContato?.Telefone || tomContato?.Fone || ""),

      // Órgão gerador
      orgaoMunicipio:          String(orgao?.CodigoMunicipio || ""),
      orgaoUf:                 String(orgao?.Uf || orgao?.UF || ""),
    };
  } catch { return null; }
}

// ── SOAP envelope ABRASF ConsultarNfse ───────────────────────────────────────
function buildAbrasrConsultarNfse(cnpj: string, inscricaoMunicipal: string, dataInicial: string, dataFinal: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    <ConsultarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
      <Prestador>
        <CpfCnpj><Cnpj>${cnpj.replace(/\D/g, "")}</Cnpj></CpfCnpj>
        <InscricaoMunicipal>${inscricaoMunicipal}</InscricaoMunicipal>
      </Prestador>
      <PeriodoEmissao>
        <DataInicial>${dataInicial}</DataInicial>
        <DataFinal>${dataFinal}</DataFinal>
      </PeriodoEmissao>
    </ConsultarNfseEnvio>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ── TINUS: ConsultarNfseServicoPrestado ───────────────────────────────────────
function buildTinusConsultarNfse(cnpj: string, inscricaoMunicipal: string, dataInicial: string, dataFinal: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ws="http://tempuri.org/">
  <soapenv:Header/>
  <soapenv:Body>
    <ws:ConsultarNfseServicoPrestado>
      <ws:nfseCabecMsg><![CDATA[<cabecalho versao="1.00"><versaoDados>1.00</versaoDados></cabecalho>]]></ws:nfseCabecMsg>
      <ws:nfseDadosMsg><![CDATA[<ConsultarNfseServicoPrestadoEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
        <Prestador>
          <CpfCnpj><Cnpj>${cnpj.replace(/\D/g, "")}</Cnpj></CpfCnpj>
          <InscricaoMunicipal>${inscricaoMunicipal}</InscricaoMunicipal>
        </Prestador>
        <PeriodoEmissao>
          <DataInicial>${dataInicial}</DataInicial>
          <DataFinal>${dataFinal}</DataFinal>
        </PeriodoEmissao>
      </ConsultarNfseServicoPrestadoEnvio>]]></ws:nfseDadosMsg>
    </ws:ConsultarNfseServicoPrestado>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ── Parser do retorno ABRASF → array de notas ─────────────────────────────────
function parseAbrasrResponse(xml: string): Array<{
  numero: string; chave: string; dataEmissao: string;
  tomadorCnpj: string; tomadorNome: string;
  valorBruto: number; valorLiquido: number; discriminacao: string;
}> {
  const parsed = xmlParser.parse(xml);
  const getPath = (obj: any, path: string) => {
    let n: any = obj;
    for (const k of path.split(".")) { n = n?.[k]; }
    return n;
  };
  const getAny = (...paths: string[]) => {
    for (const p of paths) {
      const v = getPath(parsed, p);
      if (v !== undefined) return v;
    }
    return undefined;
  };

  // ── Resolve resposta → objeto com ListaNfse ──────────────────────────────────
  // Padrão ABRASF direto (SIL, TINUS, GIAP):
  //   Envelope.Body.ConsultarNfseResposta.ListaNfse.CompNfse
  // Padrão .NET ASMX (SIAP GEO Guaratinguetá):
  //   Envelope.Body.ConsultarNfseResponse.ConsultarNfseResult  — pode ser objeto
  //   ou string CDATA/HTML-encoded com <RetornoConsultarNfse><ListaNfse>...</ListaNfse></RetornoConsultarNfse>
  let resposta: any =
    getAny("Envelope.Body.ConsultarNfseResposta") ||
    getAny("Envelope.Body.ConsultarNfseServicoPrestadoResposta") ||
    getAny("soapenv:Envelope.soapenv:Body.ConsultarNfseResposta");

  if (!resposta) {
    // Tenta path .NET ASMX
    const result =
      getAny("Envelope.Body.ConsultarNfseResponse.ConsultarNfseResult") ||
      getAny("Envelope.Body.ConsultarNfseResult");

    if (result !== undefined) {
      if (typeof result === "string" && result.trim().startsWith("<")) {
        // CDATA ou HTML-encoded — faz segundo parse
        const inner = xmlParser.parse(result);
        resposta =
          inner?.RetornoConsultarNfse ||
          inner?.ConsultarNfseResposta ||
          (inner?.ListaNfse ? inner : undefined);
      } else if (typeof result === "object") {
        resposta = result?.RetornoConsultarNfse || result;
      }
    }
  }

  if (!resposta) {
    // Último fallback: procura ListaNfse em qualquer lugar do corpo
    const body =
      getAny("Envelope.Body") ||
      getAny("soapenv:Envelope.soapenv:Body") ||
      {};
    const tryDeep = (obj: any, depth = 0): any => {
      if (!obj || typeof obj !== "object" || depth > 4) return undefined;
      if (obj.ListaNfse) return obj;
      for (const v of Object.values(obj)) {
        const found = tryDeep(v, depth + 1);
        if (found) return found;
      }
      return undefined;
    };
    resposta = tryDeep(body) || {};
  }

  const lista = resposta?.ListaNfse?.CompNfse;
  if (!lista) return [];
  const arr = Array.isArray(lista) ? lista : [lista];

  return arr.map((comp: any) => {
    const inf = comp?.Nfse?.InfNfse || {};
    const vals = inf?.Servico?.Valores || {};
    const tom = inf?.Tomador?.IdentificacaoTomador?.CpfCnpj || {};
    return {
      numero: String(inf?.Numero || ""),
      chave: String(inf?.CodigoVerificacao || inf?.ChaveNfse || ""),
      dataEmissao: String(inf?.DataEmissao || "").slice(0, 10),
      tomadorCnpj: String(tom?.Cnpj || tom?.Cpf || "").replace(/\D/g, ""),
      tomadorNome: String(inf?.Tomador?.RazaoSocial || ""),
      valorBruto: parseFloat(vals?.ValorServicos || "0") || 0,
      valorLiquido: parseFloat(vals?.ValorLiquidoNfse || vals?.ValorServicos || "0") || 0,
      discriminacao: String(inf?.Servico?.Discriminacao || ""),
    };
  });
}

// ── SIAP GEO: ConsultarNfse com login/senha no header SOAP ───────────────────
function buildSiapGeoConsultarNfse(
  login: string,
  senha: string,
  cnpj: string,
  inscricaoMunicipal: string,
  dataInicial: string,
  dataFinal: string,
) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:e="http://www.abrasf.org.br/nfse.xsd">
  <soapenv:Header>
    <AuthHeader xmlns="http://tempuri.org/">
      <Usuario>${login}</Usuario>
      <Senha>${senha}</Senha>
    </AuthHeader>
  </soapenv:Header>
  <soapenv:Body>
    <e:ConsultarNfseEnvio>
      <Prestador>
        <CpfCnpj><Cnpj>${cnpj.replace(/\D/g, "")}</Cnpj></CpfCnpj>
        <InscricaoMunicipal>${inscricaoMunicipal}</InscricaoMunicipal>
      </Prestador>
      <PeriodoEmissao>
        <DataInicial>${dataInicial}</DataInicial>
        <DataFinal>${dataFinal}</DataFinal>
      </PeriodoEmissao>
    </e:ConsultarNfseEnvio>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ── SIAP GEO: ConsultarNfseServicoTomado (FC como tomador de serviços) ────────
function buildSiapGeoConsultarNfseServicoTomado(
  login: string,
  senha: string,
  cnpj: string,
  inscricaoMunicipal: string,
  dataInicial: string,
  dataFinal: string,
) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:e="http://www.abrasf.org.br/nfse.xsd">
  <soapenv:Header>
    <AuthHeader xmlns="http://tempuri.org/">
      <Usuario>${login}</Usuario>
      <Senha>${senha}</Senha>
    </AuthHeader>
  </soapenv:Header>
  <soapenv:Body>
    <e:ConsultarNfseServicoTomadoEnvio>
      <Tomador>
        <CpfCnpj><Cnpj>${cnpj.replace(/\D/g, "")}</Cnpj></CpfCnpj>
        <InscricaoMunicipal>${inscricaoMunicipal}</InscricaoMunicipal>
      </Tomador>
      <PeriodoEmissao>
        <DataInicial>${dataInicial}</DataInicial>
        <DataFinal>${dataFinal}</DataFinal>
      </PeriodoEmissao>
    </e:ConsultarNfseServicoTomadoEnvio>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** Parseia resposta ConsultarNfseServicoTomadoResposta — extrai o Prestador (quem emitiu) */
function parseServicoTomadoResponse(respXml: string): Array<{
  numero: string; chave: string; dataEmissao: string;
  prestadorCnpj: string; prestadorNome: string;
  valorBruto: number; valorLiquido: number; discriminacao: string; situacao: string;
}> {
  try {
    const parsed = xmlParser.parse(respXml);
    const getAny = (...paths: string[]) => {
      for (const p of paths) {
        let n: any = parsed;
        for (const k of p.split(".")) { n = n?.[k]; }
        if (n !== undefined) return n;
      }
      return undefined;
    };
    const erroMatch = respXml.match(/<(?:[^:]+:)?(?:faultstring|Mensagem|Erro|Error|Message)>([^<]{1,300})<\//i);
    if (erroMatch) throw new Error(`SIAP GEO: ${erroMatch[1].trim()}`);

    const resposta =
      getAny("Envelope.Body.ConsultarNfseServicoTomadoResposta") ||
      getAny("Envelope.Body.ConsultarNfseResposta") ||
      {};
    const lista = resposta?.ListaNfse?.CompNfse;
    if (!lista) return [];
    const arr = Array.isArray(lista) ? lista : [lista];
    return arr.map((comp: any) => {
      const inf = comp?.Nfse?.InfNfse || {};
      const vals = inf?.Servico?.Valores || {};
      const prest = inf?.PrestadorServico || inf?.Prestador || {};
      const prestIdent = prest?.IdentificacaoPrestador?.CpfCnpj || prest?.CpfCnpj || {};
      return {
        numero: String(inf?.Numero || ""),
        chave: String(inf?.CodigoVerificacao || inf?.ChaveNfse || ""),
        dataEmissao: String(inf?.DataEmissao || "").slice(0, 10),
        prestadorCnpj: String(prestIdent?.Cnpj || prestIdent?.Cpf || "").replace(/\D/g, ""),
        prestadorNome: String(prest?.RazaoSocial || prest?.razaoSocial || ""),
        valorBruto: parseFloat(vals?.ValorServicos || "0") || 0,
        valorLiquido: parseFloat(vals?.ValorLiquidoNfse || vals?.ValorServicos || "0") || 0,
        discriminacao: String(inf?.Servico?.Discriminacao || ""),
        situacao: String(comp?.Situacao || inf?.Situacao || "Normal"),
      };
    });
  } catch (e: any) {
    console.warn(`[NfseTomadas] parseServicoTomadoResponse erro: ${e?.message}`);
    return [];
  }
}

// ── SIL Tecnologia: login/senha via SOAP ─────────────────────────────────────
function buildSilConsultarNfse(
  login: string,
  senha: string,
  cnpj: string,
  inscricaoMunicipal: string,
  dataInicial: string,
  dataFinal: string,
) {
  // SIL usa nfseCabecMsg + credenciais em nfseDadosMsg (ABRASF 2.x)
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ser="http://www.siltecnologia.com.br/">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:ConsultarNfse>
      <ser:nfseCabecMsg><![CDATA[<cabecalho versao="2.03"><versaoDados>2.03</versaoDados></cabecalho>]]></ser:nfseCabecMsg>
      <ser:nfseDadosMsg><![CDATA[<ConsultarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
        <Prestador>
          <CpfCnpj><Cnpj>${cnpj.replace(/\D/g, "")}</Cnpj></CpfCnpj>
          <InscricaoMunicipal>${inscricaoMunicipal}</InscricaoMunicipal>
        </Prestador>
        <PeriodoEmissao>
          <DataInicial>${dataInicial}</DataInicial>
          <DataFinal>${dataFinal}</DataFinal>
        </PeriodoEmissao>
        <Usuario>${login}</Usuario>
        <Senha>${senha}</Senha>
      </ConsultarNfseEnvio>]]></ser:nfseDadosMsg>
    </ser:ConsultarNfse>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// ── Consulta por provedor ─────────────────────────────────────────────────────
async function consultarPorProvider(opts: {
  provider: string;
  endpoint: string;
  cnpj: string;
  inscricaoMunicipal: string;
  token?: string | null;  // senha do portal (todos) ou token API (giap)
  certPfxBase64?: string | null;
  certPassword?: string | null;
  dataInicial: string;
  dataFinal: string;
}): Promise<Array<{ numero: string; chave: string; dataEmissao: string; tomadorCnpj: string; tomadorNome: string; valorBruto: number; valorLiquido: number; discriminacao: string }>> {
  const { provider, endpoint, cnpj, inscricaoMunicipal, token, certPfxBase64, certPassword, dataInicial, dataFinal } = opts;
  const login = inscricaoMunicipal; // login = inscrição municipal em todos os portais

  // ── GIAP (Araraquara) — API REST com token ──────────────────────────────────
  if (provider === "giap") {
    if (!token) throw new Error("Token GIAP não configurado. Gere em araraquara.giap.com.br.");
    const url = `${endpoint}/simula_nfe?p_cnpj=${cnpj.replace(/\D/g, "")}&p_data_ini=${dataInicial}&p_data_fim=${dataFinal}`;
    const resp = await callHttps(url, "", {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    });
    let data: any[] = [];
    try { data = JSON.parse(resp); } catch { return []; }
    if (!Array.isArray(data)) data = data?.items || data?.notas || [];
    return data.map((n: any) => ({
      numero: String(n.numero || n.nfse_numero || ""),
      chave: String(n.chave || n.codigo_verificacao || ""),
      dataEmissao: String(n.data_emissao || n.dataEmissao || "").slice(0, 10),
      tomadorCnpj: String(n.tomador_cnpj || n.cnpj_tomador || "").replace(/\D/g, ""),
      tomadorNome: String(n.tomador_nome || n.razao_social_tomador || ""),
      valorBruto: parseFloat(n.valor_servicos || n.valor || "0") || 0,
      valorLiquido: parseFloat(n.valor_liquido || n.valor_servicos || "0") || 0,
      discriminacao: String(n.discriminacao || ""),
    }));
  }

  // ── SIAP GEO (Guaratinguetá) — SOAP com login/senha no header ───────────────
  if (provider === "siapgeo") {
    if (!token) throw new Error("Senha do portal não configurada.");
    const soapBody = buildSiapGeoConsultarNfse(login, token, cnpj, inscricaoMunicipal, dataInicial, dataFinal);
    const respXml = await callHttps(endpoint, soapBody, {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": "http://tempuri.org/ConsultarNfse",
    });
    console.log(`[NfseMun][siapgeo] cnpj=${cnpj.replace(/\D/g,"").slice(-4)} inscricao=${inscricaoMunicipal} periodo=${dataInicial}→${dataFinal}`);
    console.log(`[NfseMun][siapgeo] resposta(${respXml.length}): ${respXml.slice(0, 1500).replace(/\n/g, " ")}`);
    const notas = parseAbrasrResponse(respXml);
    console.log(`[NfseMun][siapgeo] notas parseadas=${notas.length}`);
    if (notas.length === 0) {
      // Log da estrutura parseada para diagnóstico de path mismatch
      try {
        const parsedDebug = xmlParser.parse(respXml);
        const bodyKeys = Object.keys(parsedDebug?.Envelope?.Body || parsedDebug?.["soapenv:Envelope"]?.["soapenv:Body"] || {});
        console.log(`[NfseMun][siapgeo] body keys: [${bodyKeys.join(", ")}]`);
        const bodyNode = parsedDebug?.Envelope?.Body || {};
        for (const k of bodyKeys) {
          const childKeys = typeof bodyNode[k] === "object" ? Object.keys(bodyNode[k] || {}) : [`(${typeof bodyNode[k]})`];
          console.log(`  ${k} → [${childKeys.join(", ")}]`);
        }
      } catch { /* diagnóstico opcional */ }
      // Tenta detectar mensagem de erro no XML bruto
      const erroMatch = respXml.match(/<(?:[^:]+:)?(?:faultstring|Mensagem|Erro|Error|Message)>([^<]{1,200})<\//i);
      if (erroMatch) throw new Error(`SIAP GEO: ${erroMatch[1].trim()}`);
    }
    return notas;
  }

  // ── SIL Tecnologia (Aparecida) — SOAP ABRASF com login/senha ────────────────
  if (provider === "sil") {
    if (!token) throw new Error("Senha do portal não configurada.");
    const soapBody = buildSilConsultarNfse(login, token, cnpj, inscricaoMunicipal, dataInicial, dataFinal);
    const respXml = await callHttps(endpoint, soapBody, {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": "ConsultarNfse",
    });
    return parseAbrasrResponse(respXml);
  }

  // ── TINUS (Igarassu) — SOAP ABRASF 1.00 com certificado ou login/senha ──────
  if (provider === "tinus") {
    let cert: string | undefined; let key: string | undefined;
    if (certPfxBase64) {
      const pem = pfxToPem(certPfxBase64, certPassword || "");
      cert = pem.cert; key = pem.key;
    }
    const soapBody = buildTinusConsultarNfse(cnpj, inscricaoMunicipal, dataInicial, dataFinal);
    const respXml = await callHttps(
      endpoint.endsWith(".cls") ? endpoint : endpoint + ".cls",
      soapBody,
      { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "http://tempuri.org/ConsultarNfseServicoPrestado" },
      cert, key,
    );
    return parseAbrasrResponse(respXml);
  }

  // ── NFS-e Nacional (sefin.nfse.gov.br) — REST GET /DFe/{NSU} + mTLS ────────
  // O sync NSU é tratado diretamente em executarSyncMunicipio (loop por lote de 50).
  // Nunca deve chegar aqui via consultarPorProvider.
  if (provider === "nfse_nacional") {
    throw new Error("nfse_nacional usa path NSU direto em executarSyncMunicipio.");
  }

  throw new Error(`Provider desconhecido: ${provider}`);
}

// ── Função principal de sincronização ─────────────────────────────────────────
async function executarSyncMunicipio(opts: {
  companyId: number;
  ibgeCode: number;
  cnpj: string;
  dataInicial?: string;
  dataFinal?: string;
}): Promise<{ importadas: number; ignoradas: number; erro?: string; aviso?: string }> {
  const db = await getDb();
  const { companyId, ibgeCode, cnpj } = opts;

  const munRes = await db.$client.query<any>(
    `SELECT * FROM company_nfse_municipal_config WHERE company_id=$1 AND ibge_code=$2`,
    [companyId, ibgeCode]
  );
  const mun = munRes.rows[0];
  if (!mun) return { importadas: 0, ignoradas: 0, erro: "Município não configurado." };
  if (!mun.inscricao_municipal) return { importadas: 0, ignoradas: 0, aviso: "Inscrição Municipal não preenchida." };

  // Pega certificado da config SEFAZ (compartilhado)
  const sefazRes = await db.$client.query<any>(
    `SELECT cert_pfx_base64, cert_password FROM company_nfe_config WHERE company_id=$1`,
    [companyId]
  );
  const sefazCfg = sefazRes.rows[0];

  const hoje = new Date();
  let importadas = 0;
  let ignoradas = 0;
  const origem = `nfse_mun_${ibgeCode}`;

  // ── Path A: Portal Nacional NFS-e (REST mTLS) ────────────────────────────────
  // DIAGNÓSTICO (testado 24/06/2026): A API sefin.nfse.gov.br v1.6.0 NÃO fornece
  // endpoint de distribuição em lote. Os únicos endpoints disponíveis são:
  //   POST /sefinnacional/nfse         — emitir NFS-e
  //   GET  /sefinnacional/nfse/{chave} — consultar nota por chave de 50 dígitos
  //   (retorna E2401 "Chave não encontrada" p/ chave inexistente → auth ok)
  // Não existe /DFe/{NSU}, /distribuicao, /contribuinte/nfse nem listagem por CNPJ.
  // A importação de NFS-e recebidas deve ser feita via PDF (DANFSe) importado
  // manualmente — o prestador envia o PDF e o usuário usa "Importar PDF".
  if (mun.provider === "nfse_nacional") {
    try {
      if (!sefazCfg?.cert_pfx_base64) {
        return { importadas: 0, ignoradas: 0, aviso: "Certificado A1 não configurado. Configure em Configurações → SEFAZ." };
      }
      // Valida cert e faz probe de autenticação com chave fictícia de 50 zeros
      const { cert, key } = pfxToPem(sefazCfg.cert_pfx_base64, sefazCfg.cert_password || "");
      const baseUrl = (mun.endpoint || "https://sefin.nfse.gov.br/sefinnacional").replace(/\/$/, "");
      let probeResp: any = null;
      let probeHttpStatus = 0;
      try {
        probeResp = await callHttpsGetJson(`${baseUrl}/nfse/${"0".repeat(50)}`, cert, key);
        probeHttpStatus = probeResp === null ? 404 : 200;
      } catch (probeErr: any) {
        // HTTP >= 400 (exceto 404) → rejeita; ex: 403 = sem cert / 401 = cert inválido
        const m = String(probeErr?.message || "");
        const match = m.match(/HTTP (\d+)/);
        probeHttpStatus = match ? Number(match[1]) : 0;
        if (probeHttpStatus !== 404) throw probeErr; // propaga para o catch externo
      }
      const probeErro = probeResp?.erro?.codigo ?? probeResp?.erros?.[0]?.Codigo ?? "";
      // E2401 = "Chave não encontrada" → auth OK (resp. JSON)
      // probeResp===null (HTTP 404) WITH cert = cert aceito pelo WAF → auth OK implícito
      // (sem cert → 403; com cert inválido → 401/403 → throw acima)
      const authOk = probeErro === "E2401" || probeResp === null;

      const aviso = authOk
        ? "Certificado A1 aceito pelo Portal Nacional ✓ — API respondendo. " +
          "Porém, sefin.nfse.gov.br v1.6.0 não oferece distribuição em lote de NFS-e tomadas. " +
          "Para importar NFS-e de serviços recebidos, solicite o DANFSe (PDF) ao prestador e use 'Importar PDF'."
        : `Portal Nacional respondeu código '${probeErro || `HTTP ${probeHttpStatus}`}'. ` +
          "Verifique se o certificado A1 está correto em Configurações → SEFAZ.";

      await db.$client.query(
        `UPDATE company_nfse_municipal_config
         SET last_sync_at=NOW(), last_sync_result=$1, updated_at=NOW()
         WHERE company_id=$2 AND ibge_code=$3`,
        [JSON.stringify({ importadas: 0, ignoradas: 0, aviso }), companyId, ibgeCode]
      );
      console.log(`[NfseMun][nfse_nacional] probe authOk=${authOk} probeErro=${probeErro}`);
      return { importadas: 0, ignoradas: 0, aviso };
    } catch (e: any) {
      const msg = e?.message || "Erro desconhecido";
      await db.$client.query(
        `UPDATE company_nfse_municipal_config
         SET last_sync_at=NOW(), last_sync_result=$1, updated_at=NOW()
         WHERE company_id=$2 AND ibge_code=$3`,
        [JSON.stringify({ erro: msg }), companyId, ibgeCode]
      ).catch(() => {});
      return { importadas, ignoradas, erro: msg };
    }
  }

  // ── Path B: provedores SOAP (SIAP GEO, SIL, TINUS, GIAP) — baseados em data ─
  // Nota Rev. 3673: SIAP GEO de Guaratinguetá TEM notas de 2026 (confirmado no portal ISS Online).
  // O cap 2025-12-31 foi removido — usa hoje como dataFinal para todos os provedores.
  const isSiapGeo = mun.provider === "siapgeo";
  const dataFinalDefault = hoje.toISOString().slice(0, 10); // todos os provedores: até hoje
  const dataFinal = opts.dataFinal || dataFinalDefault;

  // Calcula dataInicial: primeira sync desde 2018; syncs seguintes retomam do último dataFinal
  // escaneado (salvo em last_sync_result.dataFinal) + 1 dia.
  const dataInicial = opts.dataInicial || (() => {
    if (mun.last_sync_at == null) return "2018-01-01"; // primeira sync: histórico completo
    // Retomar do dia seguinte ao último dataFinal escaneado (todos os provedores SOAP)
    try {
      const lastResult = JSON.parse(mun.last_sync_result || "{}");
      if (lastResult.dataFinal) {
        const d = new Date(lastResult.dataFinal);
        d.setDate(d.getDate() + 1);
        return d.toISOString().slice(0, 10);
      }
    } catch { /* ignora */ }
    // last_sync_at != null mas sem dataFinal: incrementar pelo último mês
    const d = new Date(hoje);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  })();

  // Range impossível: dataInicial > dataFinal (provedor esgotado ou data futura)
  {
    const di = new Date(dataInicial), df = new Date(dataFinal);
    if (di > df) {
      console.log(`[NfseMunSync] company=${companyId} ibge=${ibgeCode} provider=${mun.provider}: dataInicial(${dataInicial}) > dataFinal(${dataFinal}) — sem novas notas.`);
      return { importadas: 0, ignoradas: 0, aviso: `Sem notas a consultar: ${dataInicial} > ${dataFinal}.` };
    }
  }

  try {
    const notas = await consultarPorProvider({
      provider: mun.provider,
      endpoint: mun.endpoint,
      cnpj,
      inscricaoMunicipal: mun.inscricao_municipal,
      token: mun.token,
      certPfxBase64: sefazCfg?.cert_pfx_base64 || null,
      certPassword: sefazCfg?.cert_password || null,
      dataInicial,
      dataFinal,
    });

    for (const nota of notas) {
      if (!nota.numero) { ignoradas++; continue; }

      const existingRes = await db.$client.query<any>(
        `SELECT id FROM fiscal_notes WHERE company_id=$1 AND numero_nf=$2 AND origem=$3`,
        [companyId, nota.numero, origem]
      );
      if (existingRes.rows[0]) { ignoradas++; continue; }

      await db.$client.query(
        `INSERT INTO fiscal_notes
          (company_id, numero_nf, chave_acesso, data_emissao, tomador_cnpj, tomador_razao_social,
           descricao_servico, valor_bruto, valor_liquido, status, origem, created_at, updated_at)
         VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,'pendente',$10,NOW(),NOW())`,
        [
          companyId, nota.numero, nota.chave || null,
          nota.dataEmissao || hoje.toISOString().slice(0, 10),
          nota.tomadorCnpj || null, nota.tomadorNome || null,
          nota.discriminacao || null, nota.valorBruto, nota.valorLiquido, origem,
        ]
      );
      importadas++;
    }

    await db.$client.query(
      `UPDATE company_nfse_municipal_config
       SET last_sync_at=NOW(), last_sync_result=$1, updated_at=NOW()
       WHERE company_id=$2 AND ibge_code=$3`,
      [JSON.stringify({ importadas, ignoradas, dataInicial, dataFinal }), companyId, ibgeCode]
    );

    return { importadas, ignoradas };
  } catch (e: any) {
    const msg = e?.message || "Erro desconhecido";
    await db.$client.query(
      `UPDATE company_nfse_municipal_config
       SET last_sync_at=NOW(), last_sync_result=$1, updated_at=NOW()
       WHERE company_id=$2 AND ibge_code=$3`,
      [JSON.stringify({ erro: msg }), companyId, ibgeCode]
    ).catch(() => {});
    return { importadas, ignoradas, erro: msg };
  }
}

// ── Router ────────────────────────────────────────────────────────────────────
export const nfseEmitidasRouter = router({
  // Lista municípios configurados; auto-semeia os 4 padrão se não existirem
  getMunicipios: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const { companyId } = input;

      // Auto-seed: Guaratinguetá SIAP GEO (notas até 2025) + Portal Nacional (notas 2026+)
      // COALESCE preserva o que o usuário já editou, sem sobrescrever
      const guara = MUNICIPIOS_PADRAO[0]; // SIAP GEO
      const guaraNacional = MUNICIPIOS_PADRAO[1]; // Portal Nacional
      await db.$client.query(
        `INSERT INTO company_nfse_municipal_config
          (company_id, ibge_code, nome_municipio, uf, provider, endpoint,
           inscricao_municipal, token, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0)
         ON CONFLICT (company_id, ibge_code) DO UPDATE
           SET endpoint            = EXCLUDED.endpoint,
               inscricao_municipal = COALESCE(company_nfse_municipal_config.inscricao_municipal, EXCLUDED.inscricao_municipal),
               token               = COALESCE(company_nfse_municipal_config.token,               EXCLUDED.token)`,
        [
          companyId, guara.ibge_code, guara.nome_municipio, guara.uf,
          guara.provider, guara.endpoint,
          "13239401",  // inscrição municipal FC (login do portal SIAP GEO)
          "31335504",  // senha do Portal do Contribuinte de Guaratinguetá
        ]
      );
      // Guaratinguetá Portal Nacional (notas a partir de 01/01/2026) — usa certificado A1 do SEFAZ
      // token=NULL pois autenticação é via certificado A1 (compartilhado com SEFAZ)
      // ON CONFLICT: atualiza provider/endpoint/nome para corrigir registros antigos criados
      // antes da Rev.3619 quando 'nfse_nacional' ainda não existia como provider type.
      await db.$client.query(
        `INSERT INTO company_nfse_municipal_config
          (company_id, ibge_code, nome_municipio, uf, provider, endpoint,
           inscricao_municipal, token, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,0)
         ON CONFLICT (company_id, ibge_code) DO UPDATE
           SET provider         = EXCLUDED.provider,
               endpoint         = EXCLUDED.endpoint,
               nome_municipio   = EXCLUDED.nome_municipio,
               uf               = EXCLUDED.uf,
               inscricao_municipal = COALESCE(company_nfse_municipal_config.inscricao_municipal, EXCLUDED.inscricao_municipal)`,
        [
          companyId, guaraNacional.ibge_code, guaraNacional.nome_municipio, guaraNacional.uf,
          guaraNacional.provider, guaraNacional.endpoint,
          "13239401",  // mesma inscrição municipal
        ]
      );

      const rows = await db.$client.query<any>(
        `SELECT *, COALESCE(sync_hora, 6) AS sync_hora FROM company_nfse_municipal_config WHERE company_id=$1 ORDER BY nome_municipio`,
        [companyId]
      );

      return rows.rows.map((r: any) => ({
        ...r,
        ibge_code: Number(r.ibge_code),
        enabled: r.enabled === true || Number(r.enabled) === 1,
        sync_hora: Number(r.sync_hora ?? 6),
      }));
    }),

  // Adiciona nova cidade manualmente
  addMunicipio: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      nomeMunicipio: z.string().min(2),
      uf: z.string().length(2),
      provider: z.string().default("siapgeo"),
      endpoint: z.string().optional(),
      inscricaoMunicipal: z.string().optional(),
      token: z.string().optional(),
      ibgeCode: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // ibge_code: usa o fornecido ou gera um baseado no timestamp (9000000-9999999)
      const ibge = input.ibgeCode || (9000000 + (Date.now() % 999999));
      // Endpoint padrão por provider se não informado
      const defaultEndpoints: Record<string, string> = {
        siapgeo: "https://[cidade].geosiap.net.br/[prefixo]/webservices/nfse.asmx",
        sil: "https://[cidade].siltecnologia.com.br/tbw/Consultas",
        giap: "https://[cidade].giap.com.br/ords/pma/ws/nfe",
        tinus: "https://www.tinus.com.br/csp/[CIDADE]/nfse.webservice.cls",
        nfse_nacional: "https://sefin.nfse.gov.br/sefinnacional",
      };
      const endpoint = input.endpoint || defaultEndpoints[input.provider] || "";
      await db.$client.query(
        `INSERT INTO company_nfse_municipal_config
          (company_id, ibge_code, nome_municipio, uf, provider, endpoint,
           inscricao_municipal, token, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0)
         ON CONFLICT (company_id, ibge_code) DO UPDATE
           SET nome_municipio=$3, uf=$4, provider=$5, endpoint=$6,
               inscricao_municipal=$7, token=$8`,
        [input.companyId, ibge, input.nomeMunicipio, input.uf.toUpperCase(),
          input.provider, endpoint, input.inscricaoMunicipal || null, input.token || null]
      );
      return { success: true, ibgeCode: ibge };
    }),

  // Remove cidade (config apenas — notas já importadas são mantidas)
  deleteMunicipio: protectedProcedure
    .input(z.object({ companyId: z.number(), ibgeCode: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.$client.query(
        `DELETE FROM company_nfse_municipal_config WHERE company_id=$1 AND ibge_code=$2`,
        [input.companyId, input.ibgeCode]
      );
      return { success: true };
    }),

  // Salva inscrição municipal, token, toggle e horário de sincronização
  saveMunicipio: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ibgeCode: z.number(),
      inscricaoMunicipal: z.string().optional(),
      token: z.string().optional(),
      enabled: z.boolean(),
      syncHora: z.number().min(0).max(23).default(6),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.$client.query(
        `UPDATE company_nfse_municipal_config
         SET inscricao_municipal=$1, token=$2, enabled=$3, sync_hora=$4, updated_at=NOW()
         WHERE company_id=$5 AND ibge_code=$6`,
        [
          input.inscricaoMunicipal || null,
          input.token || null,
          input.enabled ? 1 : 0,
          input.syncHora,
          input.companyId,
          input.ibgeCode,
        ]
      );
      return { success: true };
    }),

  // Sincroniza TODOS os municípios configurados de uma vez (histórico completo)
  syncAllMunicipios: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      dataInicial: z.string().optional(),
      dataFinal: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const cfgRes = await db.$client.query<any>(
        `SELECT cnpj FROM company_nfe_config WHERE company_id=$1`,
        [input.companyId]
      );
      const cnpj = cfgRes.rows[0]?.cnpj || "";
      const munRes = await db.$client.query<any>(
        `SELECT ibge_code, nome_municipio, uf FROM company_nfse_municipal_config
         WHERE company_id=$1 AND inscricao_municipal IS NOT NULL AND inscricao_municipal != ''`,
        [input.companyId]
      );
      const resultados: Array<{ ibge: number; nome: string; uf: string; importadas: number; ignoradas: number; erro?: string }> = [];
      for (const mun of munRes.rows) {
        try {
          const r = await executarSyncMunicipio({
            companyId: input.companyId,
            ibgeCode: Number(mun.ibge_code),
            cnpj,
            dataInicial: input.dataInicial,
            dataFinal: input.dataFinal,
          });
          resultados.push({ ibge: Number(mun.ibge_code), nome: mun.nome_municipio, uf: mun.uf, importadas: r.importadas, ignoradas: r.ignoradas, erro: r.erro });
        } catch (e: any) {
          resultados.push({ ibge: Number(mun.ibge_code), nome: mun.nome_municipio, uf: mun.uf, importadas: 0, ignoradas: 0, erro: e?.message || "Erro desconhecido" });
        }
      }
      const totalImportadas = resultados.reduce((a, r) => a + r.importadas, 0);
      const totalIgnoradas = resultados.reduce((a, r) => a + r.ignoradas, 0);
      return { resultados, totalImportadas, totalIgnoradas, municipios: munRes.rows.length };
    }),

  // Sincroniza um município manualmente
  syncMunicipio: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ibgeCode: z.number(),
      dataInicial: z.string().optional(),
      dataFinal: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      // Pega CNPJ da config SEFAZ
      const [sefazCfg] = (await db.$client.query<any>(
        `SELECT cnpj FROM company_nfe_config WHERE company_id=$1`,
        [input.companyId]
      )).rows;
      const cnpj = sefazCfg?.cnpj || "";
      return executarSyncMunicipio({ ...input, cnpj });
    }),

  // Detalhes completos de uma NFS-e (parse do xml_payload)
  getDetalhesNFse: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const res = await db.$client.query<any>(
        `SELECT id, numero_nf, chave_acesso, data_emissao, tomador_cnpj, tomador_razao_social,
                descricao_servico, valor_bruto, valor_liquido, status, origem, xml_payload,
                arquivo_url, observacoes, created_at
         FROM fiscal_notes
         WHERE id=$1 AND company_id=$2`,
        [input.id, input.companyId]
      );
      const row = res.rows[0];
      if (!row) throw new Error("Nota não encontrada");
      const detalhes = row.xml_payload ? parseSefinNfseXmlFull(row.xml_payload) : null;
      return { row, detalhes };
    }),

  // Lista NFS-e importadas via prefeituras
  listNFseEmitidasMunicipal: protectedProcedure
    .input(z.object({ companyId: z.number(), ibgeCode: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const rows = await db.$client.query<any>(
        `SELECT fn.*, m.nome_municipio, m.uf
         FROM fiscal_notes fn
         LEFT JOIN company_nfse_municipal_config m
           ON m.company_id = fn.company_id
           AND fn.origem = 'nfse_mun_' || m.ibge_code::text
         WHERE fn.company_id=$1
           AND fn.origem LIKE 'nfse_mun_%'
           ${input.ibgeCode ? `AND fn.origem = 'nfse_mun_${input.ibgeCode}'` : ""}
         ORDER BY fn.data_emissao DESC NULLS LAST`,
        [input.companyId]
      );
      return rows.rows;
    }),

  // ── NFS-e Tomadas: sync histórico por ano (2018-2025, SIAP GEO) ──────────────
  syncNfseTomadas: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ibgeCode: z.number().optional(),
      anoInicial: z.number().min(2018).max(2025).optional(),
      anoFinal: z.number().min(2018).max(2025).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [sefazCfg] = (await db.$client.query<any>(
        `SELECT cnpj, cert_pfx_base64 FROM company_nfe_config WHERE company_id=$1`,
        [input.companyId]
      )).rows;
      const cnpj = sefazCfg?.cnpj || "";
      // Portal Nacional NFS-e (ibge_code sintético 35186020) usa mTLS com cert A1 do SEFAZ.
      // O mesmo DFe endpoint retorna emitidas + tomadas — basta classificar pelo CNPJ do prestador.
      const IBGE_PORTAL_NACIONAL = 35186020;
      const result = await executarSyncMunicipio({
        companyId: input.companyId,
        ibgeCode: IBGE_PORTAL_NACIONAL,
        cnpj,
      });
      return {
        importadas: result.importadas,
        ignoradas: result.ignoradas,
        erros: result.erro ? [result.erro] : [],
        aviso: result.aviso,
        anos: [],
      };
    }),

  // ── NFS-e Tomadas: lista (onde FC é tomador) ──────────────────────────────────
  listNfseTomadas: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ano: z.number().optional(),
      mes: z.number().min(1).max(12).optional(),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const ano = input.ano ?? new Date().getFullYear();
      const params: any[] = [input.companyId, ano];
      let mesFiltro = "";
      if (input.mes) {
        params.push(input.mes);
        mesFiltro = `AND EXTRACT(MONTH FROM data_emissao::date) = $${params.length}`;
      }
      let searchFiltro = "";
      if (input.search && input.search.trim()) {
        params.push(`%${input.search.trim()}%`);
        searchFiltro = `AND (emitente_nome ILIKE $${params.length} OR emitente_cnpj ILIKE $${params.length} OR numero_nf ILIKE $${params.length})`;
      }
      const rows = await db.$client.query<any>(
        `SELECT id, numero_nf, chave_acesso, data_emissao, emitente_cnpj, emitente_nome,
                descricao_servico, valor_bruto, valor_liquido, status, origem, created_at
         FROM fiscal_notes
         WHERE company_id=$1
           AND (origem LIKE 'nfse_tomada_%' OR origem = 'nfse_tomada_nacional')
           AND EXTRACT(YEAR FROM data_emissao::date) = $2
           ${mesFiltro}
           ${searchFiltro}
         ORDER BY data_emissao DESC NULLS LAST`,
        params
      );
      // Totais para KPIs
      const kpiRows = await db.$client.query<any>(
        `SELECT
           COUNT(*)::int AS total,
           COALESCE(SUM(valor_bruto::numeric), 0)::numeric AS valor_total,
           COUNT(DISTINCT EXTRACT(MONTH FROM data_emissao::date))::int AS meses_com_nota,
           COUNT(DISTINCT emitente_cnpj)::int AS prestadores_distintos
         FROM fiscal_notes
         WHERE company_id=$1
           AND (origem LIKE 'nfse_tomada_%' OR origem = 'nfse_tomada_nacional')
           AND EXTRACT(YEAR FROM data_emissao::date) = $2`,
        [input.companyId, ano]
      );
      // Contagem anual para verificar se já tem dados históricos
      const totalGeralRows = await db.$client.query<any>(
        `SELECT COUNT(*)::int AS total FROM fiscal_notes
         WHERE company_id=$1 AND (origem LIKE 'nfse_tomada_%' OR origem = 'nfse_tomada_nacional')`,
        [input.companyId]
      );
      const kpi = kpiRows.rows[0] ?? {};
      return {
        items: rows.rows,
        kpi: {
          total: Number(kpi.total ?? 0),
          valorTotal: parseFloat(kpi.valor_total ?? "0"),
          mesesComNota: Number(kpi.meses_com_nota ?? 0),
          prestadoresDistintos: Number(kpi.prestadores_distintos ?? 0),
        },
        totalGeral: Number(totalGeralRows.rows[0]?.total ?? 0),
      };
    }),

  // ── Importação manual de XMLs de NFS-e (Portal Nacional ABRASF, 2026+) ──────
  importNfseXmlManual: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      xmlContents: z.array(z.object({ name: z.string(), content: z.string() })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      let importadas = 0;
      let ignoradas = 0;
      const erros: string[] = [];
      const hoje = new Date().toISOString().slice(0, 10);

      for (const file of input.xmlContents) {
        try {
          // ── Formato SIAP GEO Export (<nfse> com N filhos <nf>) ──────────
          const siapNotas = parseSiapGeoExportXml(file.content);
          if (siapNotas !== null) {
            // Arquivo de exportação SIAP GEO — pode conter dezenas de notas
            for (const nota of siapNotas) {
              try {
                const dup = await db.$client.query<any>(
                  `SELECT id FROM fiscal_notes WHERE company_id=$1 AND numero_nf=$2 AND origem LIKE 'nfse%'`,
                  [input.companyId, nota.numero]
                );
                if (dup.rows[0]) { ignoradas++; continue; }
                await db.$client.query(
                  `INSERT INTO fiscal_notes
                    (company_id, numero_nf, chave_acesso, data_emissao,
                     tomador_cnpj, tomador_razao_social, descricao_servico,
                     valor_bruto, valor_liquido, status, origem,
                     created_at, updated_at)
                   VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,'nfse_siapgeo_export',NOW(),NOW())`,
                  [
                    input.companyId,
                    nota.numero,
                    nota.chave || null,
                    nota.dataEmissao || hoje,
                    nota.tomadorCnpj || null,
                    nota.tomadorNome || null,
                    nota.discriminacao || null,
                    nota.valorBruto,
                    nota.valorLiquido,
                    nota.status,
                  ]
                );
                importadas++;
              } catch (e: any) {
                erros.push(`${file.name} NF#${nota.numero}: ${e?.message || "Erro"}`);
              }
            }
            continue; // próximo arquivo
          }

          // ── Formato ABRASF individual (Portal Nacional, uma nota por XML) ─
          const nota = parseSefinNfseXml(file.content);
          if (!nota || !nota.numero) {
            erros.push(`${file.name}: XML inválido ou formato não reconhecido (suporte: ABRASF individual ou exportação SIAP GEO)`);
            continue;
          }
          const dup = await db.$client.query<any>(
            `SELECT id FROM fiscal_notes WHERE company_id=$1 AND numero_nf=$2 AND origem LIKE 'nfse%'`,
            [input.companyId, nota.numero]
          );
          if (dup.rows[0]) { ignoradas++; continue; }
          await db.$client.query(
            `INSERT INTO fiscal_notes
              (company_id, numero_nf, chave_acesso, data_emissao,
               tomador_cnpj, tomador_razao_social, descricao_servico,
               valor_bruto, valor_liquido, status, origem, xml_payload,
               created_at, updated_at)
             VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,'pendente','nfse_xml_manual',$10,NOW(),NOW())`,
            [
              input.companyId,
              nota.numero,
              nota.chave || null,
              nota.dataEmissao || hoje,
              nota.tomadorCnpj || null,
              nota.tomadorNome || null,
              nota.discriminacao || null,
              nota.valorBruto,
              nota.valorLiquido,
              file.content,
            ]
          );
          importadas++;
        } catch (e: any) {
          erros.push(`${file.name}: ${e?.message || "Erro desconhecido"}`);
        }
      }
      return { importadas, ignoradas, erros };
    }),
});

export { executarSyncMunicipio };

// ── Sync NFS-e Tomadas (onde FC é o tomador de serviços) ──────────────────────
// Busca por ano no SIAP GEO para evitar timeout em períodos longos.
async function executarSyncNfseTomado(opts: {
  companyId: number;
  ibgeCode: number;
  cnpj: string;
  anoInicial?: number;
  anoFinal?: number;
}): Promise<{ importadas: number; ignoradas: number; erros: string[]; anos: number[] }> {
  const db = await getDb();
  const { companyId, ibgeCode, cnpj } = opts;

  const munRes = await db.$client.query<any>(
    `SELECT * FROM company_nfse_municipal_config WHERE company_id=$1 AND ibge_code=$2`,
    [companyId, ibgeCode]
  );
  const mun = munRes.rows[0];
  if (!mun) return { importadas: 0, ignoradas: 0, erros: ["Município não configurado."], anos: [] };
  if (!mun.token) return { importadas: 0, ignoradas: 0, erros: ["Senha do portal não configurada."], anos: [] };
  if (!mun.inscricao_municipal) return { importadas: 0, ignoradas: 0, erros: ["Inscrição Municipal não preenchida."], anos: [] };

  const login = mun.inscricao_municipal;
  const senha = mun.token;
  const cleanCnpj = cnpj.replace(/\D/g, "");
  const hoje = new Date();
  const anoInicial = opts.anoInicial ?? 2018;
  // SIAP GEO cobre apenas até 31/12/2025 (notas 2026+ vêm do Portal Nacional)
  const anoFinal = Math.min(opts.anoFinal ?? 2025, 2025);

  let totalImportadas = 0, totalIgnoradas = 0;
  const erros: string[] = [];
  const anosProcessados: number[] = [];

  for (let ano = anoInicial; ano <= anoFinal; ano++) {
    const dataInicial = `${ano}-01-01`;
    const dataFinal = `${ano}-12-31`;
    const origem = `nfse_tomada_${ibgeCode}`;

    try {
      const soapBody = buildSiapGeoConsultarNfseServicoTomado(login, senha, cleanCnpj, mun.inscricao_municipal, dataInicial, dataFinal);
      console.log(`[NfseTomadas][siapgeo] company=${companyId} ano=${ano} endpoint=${mun.endpoint}`);
      const respXml = await callHttps(mun.endpoint, soapBody, {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://tempuri.org/ConsultarNfseServicoTomado",
      });
      console.log(`[NfseTomadas][siapgeo] ano=${ano} resposta(${respXml.length}): ${respXml.slice(0, 400).replace(/\n/g, " ")}`);

      const notas = parseServicoTomadoResponse(respXml);
      console.log(`[NfseTomadas][siapgeo] ano=${ano} notas=${notas.length}`);
      anosProcessados.push(ano);

      for (const nota of notas) {
        if (!nota.numero) { totalIgnoradas++; continue; }
        const existingRes = await db.$client.query<any>(
          `SELECT id FROM fiscal_notes WHERE company_id=$1 AND numero_nf=$2 AND origem=$3`,
          [companyId, nota.numero, origem]
        );
        if (existingRes.rows[0]) { totalIgnoradas++; continue; }
        await db.$client.query(
          `INSERT INTO fiscal_notes
            (company_id, numero_nf, chave_acesso, data_emissao, emitente_cnpj, emitente_nome,
             tomador_cnpj, descricao_servico, valor_bruto, valor_liquido, status, origem, created_at, updated_at)
           VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,'pendente',$11,NOW(),NOW())
           ON CONFLICT DO NOTHING`,
          [
            companyId, nota.numero, nota.chave || null,
            nota.dataEmissao || hoje.toISOString().slice(0, 10),
            nota.prestadorCnpj || null, nota.prestadorNome || null,
            cleanCnpj || null,
            nota.discriminacao || null, nota.valorBruto, nota.valorLiquido,
            origem,
          ]
        );
        totalImportadas++;
      }
    } catch (e: any) {
      const msg = e?.message || "Erro desconhecido";
      console.error(`[NfseTomadas][siapgeo] ano=${ano} ERRO: ${msg}`);
      erros.push(`${ano}: ${msg}`);
    }
  }

  console.log(`[NfseTomadas] concluído — importadas=${totalImportadas} ignoradas=${totalIgnoradas} erros=${erros.length}`);
  return { importadas: totalImportadas, ignoradas: totalIgnoradas, erros, anos: anosProcessados };
}

// ── Cron horário: a cada hora cheia verifica quais municípios têm sync_hora = hora atual ──
let _nfseMunCronStarted = false;
export function startNfseMunCron() {
  if (_nfseMunCronStarted) return;
  _nfseMunCronStarted = true;

  const runHour = async () => {
    try {
      const db = await getDb();
      // Sincroniza todo município habilitado que não foi consultado nas últimas 55 min.
      // Prefeituras municipais não têm o limite rígido da SEFAZ, então podemos rodar toda hora.
      const rows = await db.$client.query<any>(
        `SELECT m.company_id, m.ibge_code, c.cnpj
         FROM company_nfse_municipal_config m
         LEFT JOIN company_nfe_config c ON c.company_id = m.company_id
         WHERE m.enabled = 1 AND m.inscricao_municipal IS NOT NULL
           AND (m.last_sync_at IS NULL OR m.last_sync_at < NOW() - INTERVAL '55 minutes')`
      );
      if (rows.rows.length > 0) {
        console.log(`[NfseMunSync] Cron disparado — ${rows.rows.length} município(s) elegível(is) para sync`);
      }
      for (const r of rows.rows) {
        try {
          const res = await executarSyncMunicipio({
            companyId: Number(r.company_id),
            ibgeCode: Number(r.ibge_code),
            cnpj: r.cnpj || "",
          });
          console.log(`[NfseMunSync] company=${r.company_id} ibge=${r.ibge_code} importadas=${res.importadas} ignoradas=${res.ignoradas}${res.erro ? " ERRO=" + res.erro : ""}`);
        } catch (e: any) {
          console.error(`[NfseMunSync] company=${r.company_id} ibge=${r.ibge_code} ERRO:`, e?.message);
        }
      }
    } catch (e: any) {
      console.error("[NfseMunSync] Cron erro:", e?.message);
    }
  };

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
  console.log("[NfseMunSync] Cron horário agendado — sincroniza automaticamente toda hora (prefeituras municipais).");
}
