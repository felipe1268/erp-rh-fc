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
import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";

// ── Municípios pré-configurados ──────────────────────────────────────────────
// Guaratinguetá usa SIAP GEO (geosiap.net.br) — inscrição/login + senha do portal
export const MUNICIPIOS_PADRAO = [
  {
    ibge_code: 3518602,
    nome_municipio: "Guaratinguetá",
    uf: "SP",
    provider: "siapgeo",
    endpoint: "https://guaratingueta.geosiap.net.br/pmguaratingueta/webservices/nfse.asmx",
    auth_type: "portal_login",
    descricao: "SIAP GEO — portal contribuinte com inscrição municipal (login) + senha",
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
        try { resolve(buf.toString("utf-8")); }
        catch { resolve(buf.toString()); }
      });
    });
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
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
  const getAny = (...paths: string[]) => {
    for (const p of paths) {
      let node: any = parsed;
      for (const k of p.split(".")) { node = node?.[k]; }
      if (node !== undefined) return node;
    }
    return undefined;
  };

  const resposta =
    getAny("Envelope.Body.ConsultarNfseResposta") ||
    getAny("Envelope.Body.ConsultarNfseServicoPrestadoResposta") ||
    getAny("soapenv:Envelope.soapenv:Body.ConsultarNfseResposta") ||
    {};

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
    // Log para diagnóstico — mostra os primeiros 1000 chars da resposta bruta
    console.log(`[NfseMun][siapgeo] cnpj=${cnpj.replace(/\D/g,"").slice(-4)} inscricao=${inscricaoMunicipal} periodo=${dataInicial}→${dataFinal}`);
    console.log(`[NfseMun][siapgeo] resposta(${respXml.length}): ${respXml.slice(0, 1000).replace(/\n/g, " ")}`);
    const notas = parseAbrasrResponse(respXml);
    console.log(`[NfseMun][siapgeo] notas parseadas=${notas.length}`);
    if (notas.length === 0) {
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

  // ── NFS-e Nacional (fallback) ─────────────────────────────────────────────
  if (!certPfxBase64) throw new Error("Certificado A1 não configurado. Configure em Integração SEFAZ.");
  const { cert, key } = pfxToPem(certPfxBase64, certPassword || "");
  const soapBody = buildAbrasrConsultarNfse(cnpj, inscricaoMunicipal, dataInicial, dataFinal);
  const respXml = await callHttps(endpoint, soapBody, {
    "Content-Type": "text/xml; charset=utf-8",
    "SOAPAction": "http://www.abrasf.org.br/nfse.xsd/ConsultarNfse",
  }, cert, key);
  return parseAbrasrResponse(respXml);
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
  const dataFinal = opts.dataFinal || hoje.toISOString().slice(0, 10);
  const dataInicial = opts.dataInicial || (() => {
    const d = new Date(hoje);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  })();

  let importadas = 0;
  let ignoradas = 0;

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

    const origem = `nfse_mun_${ibgeCode}`;

    for (const nota of notas) {
      if (!nota.numero) { ignoradas++; continue; }

      // Dedup por (company_id, numero_nf, origem)
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
          companyId,
          nota.numero,
          nota.chave || null,
          nota.dataEmissao || hoje.toISOString().slice(0, 10),
          nota.tomadorCnpj || null,
          nota.tomadorNome || null,
          nota.discriminacao || null,
          nota.valorBruto,
          nota.valorLiquido,
          origem,
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

      // Auto-seed: só Guaratinguetá (SIAP GEO) como cidade padrão
      // inscricao_municipal e token pré-preenchidos — COALESCE preserva o que já foi salvo
      const guara = MUNICIPIOS_PADRAO[0];
      await db.$client.query(
        `INSERT INTO company_nfse_municipal_config
          (company_id, ibge_code, nome_municipio, uf, provider, endpoint,
           inscricao_municipal, token, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0)
         ON CONFLICT (company_id, ibge_code) DO UPDATE
           SET inscricao_municipal = COALESCE(company_nfse_municipal_config.inscricao_municipal, EXCLUDED.inscricao_municipal),
               token               = COALESCE(company_nfse_municipal_config.token,               EXCLUDED.token)`,
        [
          companyId, guara.ibge_code, guara.nome_municipio, guara.uf,
          guara.provider, guara.endpoint,
          "13239401",  // inscrição municipal FC (login do portal SIAP GEO)
          "31335504",  // senha do Portal do Contribuinte de Guaratinguetá
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
        nfse_nacional: "https://www.nfse.gov.br/SistemaNacional/nfse.asmx",
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
});

export { executarSyncMunicipio };

// ── Cron horário: a cada hora cheia verifica quais municípios têm sync_hora = hora atual ──
let _nfseMunCronStarted = false;
export function startNfseMunCron() {
  if (_nfseMunCronStarted) return;
  _nfseMunCronStarted = true;

  const runHour = async (horaAtual: number) => {
    try {
      const db = await getDb();
      const rows = await db.$client.query<any>(
        `SELECT company_id, ibge_code FROM company_nfse_municipal_config
         WHERE enabled = 1 AND inscricao_municipal IS NOT NULL
           AND COALESCE(sync_hora, 6) = $1`,
        [horaAtual]
      );
      for (const r of rows.rows) {
        try {
          const res = await executarSyncMunicipio(Number(r.company_id), Number(r.ibge_code));
          console.log(`[NfseMunSync] company=${r.company_id} ibge=${r.ibge_code} hora=${horaAtual}h importadas=${res.importadas} ignoradas=${res.ignoradas}${res.erro ? " ERRO=" + res.erro : ""}`);
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
      await runHour(new Date().getHours());
      scheduleNext();
    }, ms);
  };
  scheduleNext();
  console.log("[NfseMunSync] Cron diário agendado (verifica cada hora cheia; roda por município conforme sync_hora configurado).");
}
