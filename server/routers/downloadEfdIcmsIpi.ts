/**
 * server/routers/downloadEfdIcmsIpi.ts
 * GET /api/download/efd-icms-ipi?companyId=&mes=&ano=&finalidade=
 *
 * Gera arquivo TXT da EFD-ICMS/IPI conforme Guia Prático v3.2.2
 * (Ato COTEPE/ICMS 44/2018 e atualizações — COD_VER 017).
 *
 * Estrutura: |REG|campo1|campo2|...|\r\n
 */
import type { Express } from "express";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";

const COD_VER = "017";
const COD_PAIS_BR = "1058";

// ── Formatadores ─────────────────────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(String(d).replace(" ", "T"));
  if (isNaN(dt.getTime())) return "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}${dt.getFullYear()}`;
}

function fmtNum(n: number | string | null | undefined, dec = 2): string {
  if (n == null || n === "") return "0.00".replace("00", dec === 2 ? "00" : "000".slice(0, dec));
  const num = typeof n === "string" ? parseFloat(n.replace(",", ".")) : n;
  if (isNaN(num)) return Number(0).toFixed(dec);
  return num.toFixed(dec);
}

function rec(...fields: (string | number | null | undefined)[]): string {
  return "|" + fields.map(f => (f == null ? "" : String(f))).join("|") + "|\r\n";
}

function cleanDigits(s: string | null | undefined, len: number): string {
  return (s || "").replace(/\D/g, "").padStart(len, "0").slice(-len);
}

// ── Parser XML NF-e ───────────────────────────────────────────────────────────

function xmlTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m?.[1]?.trim() ?? "";
}

function xmlAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp(`<${tag}\\s[^>]*${attr}="([^"]*)"`, "i"));
  return m?.[1] ?? "";
}

function xmlAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

interface NfeItem {
  nItem: string; codItem: string; descItem: string; ncm: string; cfop: string;
  unid: string; qtd: string; vlItem: string; vlDesc: string;
  cstIcms: string; aliqIcms: string; vlBcIcms: string; vlIcms: string;
  vlBcIcmsSt: string; vlIcmsSt: string;
  cstPis: string; vlBcPis: string; aliqPis: string; vlPis: string;
  cstCofins: string; vlBcCofins: string; aliqCofins: string; vlCofins: string;
  vlIpi: string;
}

interface NfeParsed {
  serie: string; numDoc: string; chave: string;
  dtDoc: string; dtES: string;
  indOper: "0" | "1"; indEmit: "0" | "1";
  codPart: string; nomePart: string; iePart: string;
  codMunPart: string; endPart: string; numPart: string;
  complPart: string; bairroPart: string;
  vlDoc: string; vlDesc: string; vlFrete: string; vlSeg: string; vlOutDa: string;
  vlBcIcms: string; vlIcms: string; vlBcIcmsSt: string; vlIcmsSt: string;
  vlIpi: string; vlMerc: string; vlPis: string; vlCofins: string;
  codSit: string; items: NfeItem[];
}

function parseNfeXml(xml: string, myCnpj: string): NfeParsed | null {
  try {
    const infNFe = xmlTag(xml, "infNFe");
    if (!infNFe) return null;

    const ide    = xmlTag(infNFe, "ide");
    const emit   = xmlTag(infNFe, "emit");
    const dest   = xmlTag(infNFe, "dest");
    const total  = xmlTag(infNFe, "total");
    const icmsTot = xmlTag(total, "ICMSTot");

    const emitCnpj = cleanDigits(xmlTag(emit, "CNPJ"), 14);
    const isSaida  = emitCnpj === cleanDigits(myCnpj, 14);
    const indOper  = isSaida ? "1" : "0";
    const indEmit  = isSaida ? "0" : "1";

    const partXml  = isSaida ? dest : emit;
    const partEnder = isSaida ? xmlTag(infNFe, "enderDest") : xmlTag(infNFe, "enderEmit");
    const partCnpj  = cleanDigits(xmlTag(partXml, "CNPJ") || xmlTag(partXml, "CPF"), 14);
    const partNome  = (xmlTag(partXml, "xNome") || xmlTag(partXml, "xFant") || "").slice(0, 100);
    const partIE    = xmlTag(partXml, "IE").slice(0, 14);
    const partCodMun = xmlTag(partEnder || partXml, "cMun").slice(0, 7);
    const partEnd   = xmlTag(partEnder || partXml, "xLgr").slice(0, 60);
    const partNum   = xmlTag(partEnder || partXml, "nro").slice(0, 10);
    const partCompl = xmlTag(partEnder || partXml, "xCpl").slice(0, 60);
    const partBairro = xmlTag(partEnder || partXml, "xBairro").slice(0, 60);

    const dhEmi   = xmlTag(ide, "dhEmi") || xmlTag(ide, "dEmi");
    const dhSaiEnt = xmlTag(ide, "dhSaiEnt") || xmlTag(ide, "dSaiEnt");
    const dtDoc   = fmtDate(dhEmi.split("T")[0]);
    const dtES    = dhSaiEnt ? fmtDate(dhSaiEnt.split("T")[0]) : dtDoc;

    const numDoc  = (xmlTag(ide, "nNF") || "0").padStart(9, "0").slice(-9);
    const serie   = (xmlTag(ide, "serie") || "001").padStart(3, "0").slice(-3);
    const chave   = (xmlTag(xml, "chNFe") || "").replace(/\D/g, "");

    // Totais
    const vlNF    = xmlTag(icmsTot, "vNF") || xmlTag(total, "vNF");
    const vlDesc  = xmlTag(icmsTot, "vDesc");
    const vlFrete = xmlTag(icmsTot, "vFrete");
    const vlSeg   = xmlTag(icmsTot, "vSeg");
    const vlOutDa = xmlTag(icmsTot, "vOutro");
    const vlBcIcms = xmlTag(icmsTot, "vBC");
    const vlIcms  = xmlTag(icmsTot, "vICMS");
    const vlBcIcmsSt = xmlTag(icmsTot, "vBCST");
    const vlIcmsSt  = xmlTag(icmsTot, "vST");
    const vlIpi   = xmlTag(icmsTot, "vIPI");
    const vlMerc  = xmlTag(icmsTot, "vProd");
    const vlPis   = xmlTag(icmsTot, "vPIS") || xmlTag(total, "vPIS");
    const vlCofins = xmlTag(icmsTot, "vCOFINS") || xmlTag(total, "vCOFINS");

    // Items
    const detBlocks = xmlAll(infNFe, "det");
    const items: NfeItem[] = detBlocks.map((det, idx) => {
      const nItem  = xmlAttr(`<det ${idx}="${det}">`, "det", String(idx)) || String(idx + 1);
      const prod   = xmlTag(det, "prod");
      const imp    = xmlTag(det, "imposto");
      const icmsG  = xmlTag(imp, "ICMS");
      // CST-ICMS: extrair de qualquer filho do bloco ICMS (ICMS00, ICMS10, ICMSSN101 etc.)
      const icmsInner = icmsG.replace(/<\/?(?:ICMS\w*|icms\w*)[^>]*>/gi, "").trim();
      const icmsChildMatch = icmsG.match(/<(?:ICMS|ICMSSN)\w+[^>]*>([\s\S]*?)<\/(?:ICMS|ICMSSN)\w+>/i);
      const icmsInner2 = icmsChildMatch?.[1] || icmsInner;
      const orig   = xmlTag(icmsInner2, "orig") || "0";
      const cst    = xmlTag(icmsInner2, "CST") || xmlTag(icmsInner2, "CSOSN") || "00";
      const cstIcms = orig + cst.padStart(2, "0");

      const ipiG   = xmlTag(imp, "IPI");
      const ipiInner = ipiG.match(/<(?:IPITrib|IPINT)[^>]*>([\s\S]*?)<\/(?:IPITrib|IPINT)>/i)?.[1] || "";
      const pisG   = xmlTag(imp, "PIS");
      const pisInner = pisG.match(/<(?:PISAliq|PISQtde|PISNT|PISOutr)[^>]*>([\s\S]*?)<\/(?:PISAliq|PISQtde|PISNT|PISOutr)>/i)?.[1] || "";
      const cofG   = xmlTag(imp, "COFINS");
      const cofInner = cofG.match(/<(?:COFINSAliq|COFINSQtde|COFINSNT|COFINSOutr)[^>]*>([\s\S]*?)<\/(?:COFINSAliq|COFINSQtde|COFINSNT|COFINSOutr)>/i)?.[1] || "";

      return {
        nItem: String(idx + 1).padStart(3, "0"),
        codItem: xmlTag(prod, "cProd").slice(0, 60),
        descItem: xmlTag(prod, "xProd").slice(0, 60),
        ncm: xmlTag(prod, "NCM"),
        cfop: xmlTag(prod, "CFOP"),
        unid: xmlTag(prod, "uCom") || "UN",
        qtd: xmlTag(prod, "qCom"),
        vlItem: fmtNum(xmlTag(prod, "vProd")),
        vlDesc: fmtNum(xmlTag(prod, "vDesc")),
        cstIcms,
        aliqIcms: fmtNum(xmlTag(icmsInner2, "pICMS")),
        vlBcIcms: fmtNum(xmlTag(icmsInner2, "vBC")),
        vlIcms: fmtNum(xmlTag(icmsInner2, "vICMS")),
        vlBcIcmsSt: fmtNum(xmlTag(icmsInner2, "vBCST")),
        vlIcmsSt: fmtNum(xmlTag(icmsInner2, "vICMSST")),
        cstPis: xmlTag(pisInner, "CST"),
        vlBcPis: fmtNum(xmlTag(pisInner, "vBC")),
        aliqPis: fmtNum(xmlTag(pisInner, "pPIS"), 4),
        vlPis: fmtNum(xmlTag(pisInner, "vPIS")),
        cstCofins: xmlTag(cofInner, "CST"),
        vlBcCofins: fmtNum(xmlTag(cofInner, "vBC")),
        aliqCofins: fmtNum(xmlTag(cofInner, "pCOFINS"), 4),
        vlCofins: fmtNum(xmlTag(cofInner, "vCOFINS")),
        vlIpi: fmtNum(xmlTag(ipiInner, "vIPI")),
      };
    });

    return {
      serie, numDoc, chave,
      dtDoc, dtES,
      indOper, indEmit,
      codPart: partCnpj, nomePart: partNome, iePart: partIE,
      codMunPart: partCodMun, endPart: partEnd,
      numPart: partNum, complPart: partCompl, bairroPart: partBairro,
      vlDoc: fmtNum(vlNF), vlDesc: fmtNum(vlDesc), vlFrete: fmtNum(vlFrete),
      vlSeg: fmtNum(vlSeg), vlOutDa: fmtNum(vlOutDa),
      vlBcIcms: fmtNum(vlBcIcms), vlIcms: fmtNum(vlIcms),
      vlBcIcmsSt: fmtNum(vlBcIcmsSt), vlIcmsSt: fmtNum(vlIcmsSt),
      vlIpi: fmtNum(vlIpi), vlMerc: fmtNum(vlMerc),
      vlPis: fmtNum(vlPis), vlCofins: fmtNum(vlCofins),
      codSit: "00", items,
    };
  } catch {
    return null;
  }
}

// ── Construtor do buffer EFD ──────────────────────────────────────────────────

export async function buildEfdIcmsIpiBuffer(
  db: any,
  companyId: number,
  mes: number,
  ano: number,
  finalidade: "0" | "1",
): Promise<Buffer> {
  const lines: string[] = [];
  const regCount: Record<string, number> = {};

  function emit(line: string) {
    lines.push(line);
    const regCode = line.match(/^\|([0-9A-Z]{4})\|/)?.[1];
    if (regCode) regCount[regCode] = (regCount[regCode] ?? 0) + 1;
  }

  // Período
  const dtIni = new Date(ano, mes - 1, 1);
  const dtFin = new Date(ano, mes, 0);
  const strIni = fmtDate(dtIni);
  const strFin = fmtDate(dtFin);

  // Config EFD
  const cfgQ = await db.$client.query(
    `SELECT * FROM efd_icms_ipi_config WHERE company_id=$1 LIMIT 1`,
    [companyId]
  );
  const cfg = cfgQ.rows[0] ?? {};

  // Empresa
  const empQ = await db.$client.query(
    `SELECT "razaoSocial", "nomeFantasia", cnpj FROM companies WHERE id=$1`,
    [companyId]
  );
  const emp = empQ.rows[0] ?? {};
  const razao   = ((emp.razaoSocial as string) || `Empresa ${companyId}`).slice(0, 100);
  const fantasia = ((emp.nomeFantasia as string) || razao).slice(0, 60);
  const cnpj    = cleanDigits(emp.cnpj as string, 14);

  // Campos configuráveis com defaults da FC Engenharia
  const ie        = (cfg.ie        ?? "").slice(0, 14);
  const im        = (cfg.im        ?? "").slice(0, 20);
  const codMun    = (cfg.cod_mun   ?? "3518701").slice(0, 7);
  const cep       = (cfg.cep       ?? "").replace(/\D/g, "").slice(0, 8);
  const logradouro = (cfg.logradouro ?? "").slice(0, 60);
  const numero    = (cfg.numero_end ?? "").slice(0, 10);
  const complemento = (cfg.complemento ?? "").slice(0, 60);
  const bairro    = (cfg.bairro    ?? "").slice(0, 60);
  const telefone  = (cfg.telefone  ?? "").replace(/\D/g, "").slice(0, 11);
  const fax       = (cfg.fax       ?? "").replace(/\D/g, "").slice(0, 11);
  const email     = (cfg.email     ?? "").slice(0, 255);
  const suframa   = (cfg.suframa   ?? "").slice(0, 9);
  const perfil    = ((cfg.perfil   ?? "A") as "A" | "B" | "C");

  // Contabilista
  const contNome   = (cfg.cont_nome  ?? "").slice(0, 100);
  const contCpf    = (cfg.cont_cpf   ?? "").replace(/\D/g, "").slice(0, 11);
  const contCrc    = (cfg.cont_crc   ?? "").slice(0, 15);
  const contCodMun = (cfg.cont_cod_mun ?? codMun).slice(0, 7);
  const contCnpj   = (cfg.cont_cnpj  ?? "").replace(/\D/g, "").slice(0, 14);
  const contCep    = (cfg.cont_cep   ?? "").replace(/\D/g, "").slice(0, 8);
  const contEnd    = (cfg.cont_logradouro ?? "").slice(0, 60);
  const contNum    = (cfg.cont_numero ?? "").slice(0, 10);
  const contCompl  = (cfg.cont_complemento ?? "").slice(0, 60);
  const contBairro = (cfg.cont_bairro ?? "").slice(0, 60);
  const contFone   = (cfg.cont_fone  ?? "").replace(/\D/g, "").slice(0, 11);
  const contFax    = (cfg.cont_fax   ?? "").replace(/\D/g, "").slice(0, 11);
  const contEmail  = (cfg.cont_email ?? "").slice(0, 255);

  // NF-e do período (exclui NFS-e municipal)
  const dtIniStr = dtIni.toISOString().split("T")[0];
  const dtFinStr = dtFin.toISOString().split("T")[0];
  const nfeQ = await db.$client.query(`
    SELECT id, numero_nf, data_emissao, tomador_razao_social, tomador_cnpj,
           emitente_cnpj, emitente_nome, valor_bruto, status, chave_acesso, xml_payload, origem
    FROM fiscal_notes
    WHERE company_id=$1
      AND data_emissao >= $2 AND data_emissao <= $3
      AND COALESCE(origem,'manual') NOT IN ('nfse_siapgeo','nfse_siapgeo_export','nfse_nacional','nfse_xml_manual')
    ORDER BY data_emissao, id
  `, [companyId, dtIniStr, dtFinStr]);

  // Parse / fallback das NF-e
  interface ParsedRow extends NfeParsed { dbId: number }
  const parsed: ParsedRow[] = [];

  for (const row of nfeQ.rows) {
    if (row.xml_payload) {
      const p = parseNfeXml(row.xml_payload as string, cnpj);
      if (p) {
        if (row.status === "cancelada") p.codSit = "02";
        parsed.push({ ...p, dbId: row.id as number });
        continue;
      }
    }
    // Fallback sem XML
    const emitCnpjDb = cleanDigits(row.emitente_cnpj as string, 14);
    const isSaida = emitCnpjDb === cnpj;
    const partCnpj = isSaida
      ? cleanDigits(row.tomador_cnpj as string, 14)
      : emitCnpjDb;
    const partNome = isSaida
      ? ((row.tomador_razao_social as string) || "").slice(0, 100)
      : ((row.emitente_nome as string) || "").slice(0, 100);
    const numDoc = String(row.numero_nf || "0").replace(/\D/g, "").padStart(9, "0");
    const chave  = ((row.chave_acesso as string) || "").replace(/\D/g, "");
    const dt     = fmtDate(row.data_emissao as string);
    parsed.push({
      dbId: row.id as number,
      serie: "001", numDoc, chave,
      dtDoc: dt, dtES: dt,
      indOper: isSaida ? "1" : "0",
      indEmit: isSaida ? "0" : "1",
      codPart: partCnpj || "00000000000000",
      nomePart: partNome,
      iePart: "", codMunPart: "", endPart: "", numPart: "", complPart: "", bairroPart: "",
      vlDoc: fmtNum(row.valor_bruto), vlDesc: "0.00", vlFrete: "0.00",
      vlSeg: "0.00", vlOutDa: "0.00",
      vlBcIcms: "0.00", vlIcms: "0.00", vlBcIcmsSt: "0.00", vlIcmsSt: "0.00",
      vlIpi: "0.00", vlMerc: fmtNum(row.valor_bruto), vlPis: "0.00", vlCofins: "0.00",
      codSit: row.status === "cancelada" ? "02" : "00",
      items: [],
    });
  }

  // Catálogos de participantes, itens e unidades
  const parts = new Map<string, { nome: string; ie: string; codMun: string; end: string; num: string; compl: string; bairro: string }>();
  // Inclui a própria empresa
  parts.set(cnpj, { nome: razao, ie, codMun, end: logradouro, num: numero, compl: complemento, bairro });

  const itens   = new Map<string, { descr: string; ncm: string; unid: string; tipoItem: string }>();
  const unidades = new Set<string>(["UN"]);

  for (const p of parsed) {
    if (p.codPart && p.codPart.length >= 11 && !parts.has(p.codPart)) {
      parts.set(p.codPart, { nome: p.nomePart, ie: p.iePart, codMun: p.codMunPart, end: p.endPart, num: p.numPart, compl: p.complPart, bairro: p.bairroPart });
    }
    for (const item of p.items) {
      if (item.codItem && !itens.has(item.codItem)) {
        itens.set(item.codItem, { descr: item.descItem, ncm: item.ncm, unid: item.unid || "UN", tipoItem: "07" });
      }
      if (item.unid) unidades.add(item.unid.toUpperCase().slice(0, 6));
    }
  }

  // Acumuladores ICMS para E110
  let totalDebitos  = 0; // saídas CFOP 5xxx/6xxx
  let totalCreditos = 0; // entradas CFOP 1xxx/2xxx

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO 0 — Abertura, identificação e referências
  // ═══════════════════════════════════════════════════════════════════════════
  emit(rec("0000", COD_VER, finalidade, strIni, strFin,
    razao, cnpj, "", "SP", ie, codMun, im, suframa, perfil, "1"));
  emit(rec("0001", "0"));
  emit(rec("0005", fantasia, cep, logradouro, numero, complemento, bairro, telefone, fax, email));
  if (contNome) {
    emit(rec("0100", contNome, contCpf, contCrc, contEnd, contNum, contCompl, contBairro, contFone, contFax, contEmail, contCodMun, contCnpj, contCep));
  }
  for (const [partCnpj, pd] of parts.entries()) {
    emit(rec("0150", partCnpj, pd.nome.slice(0, 100), COD_PAIS_BR, partCnpj, "", pd.ie, pd.codMun, "", pd.end, pd.num, pd.compl, pd.bairro));
  }
  for (const unid of unidades) {
    const descUnid = unid === "UN" ? "UNIDADE" : unid === "M2" ? "METRO QUADRADO" : unid === "M3" ? "METRO CUBICO" : unid === "KG" ? "QUILOGRAMA" : unid === "TON" ? "TONELADA" : unid;
    emit(rec("0190", unid, descUnid));
  }
  for (const [codItem, itemData] of itens.entries()) {
    emit(rec("0200", codItem.slice(0, 60), itemData.descr.slice(0, 60), "", "", itemData.unid.slice(0, 6), itemData.tipoItem, itemData.ncm, "", "", "", "0.00"));
  }
  // 0990 contagem do bloco 0 (inclui o próprio 0990)
  const cnt0 = lines.filter(l => /^\|0/.test(l)).length + 1;
  emit(rec("0990", cnt0));

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO B — ISS (sem movimento para construtora no EFD-ICMS/IPI)
  // ═══════════════════════════════════════════════════════════════════════════
  emit(rec("B001", "1"));
  emit(rec("B990", 2));

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO C — Documentos Fiscais NF-e (modelo 55)
  // ═══════════════════════════════════════════════════════════════════════════
  const hasMovC = parsed.some(p => p.codSit !== "02");
  emit(rec("C001", hasMovC ? "0" : "1"));

  for (const p of parsed) {
    // C100
    emit(rec(
      "C100",
      p.indOper, p.indEmit, p.codPart, "55", p.codSit,
      p.serie, p.numDoc, p.chave,
      p.dtDoc, p.dtES,
      p.vlDoc, "2", p.vlDesc, "",
      "0.00", p.vlPis, p.vlCofins, "0.00", "0.00",
      p.vlFrete, p.vlSeg, p.vlOutDa,
      p.vlBcIcms, p.vlIcms, p.vlBcIcmsSt, p.vlIcmsSt,
      p.vlIpi, p.vlMerc,
    ));

    if (p.codSit === "02") continue; // canceladas: apenas C100

    // C170 — Itens (Perfil A com XML disponível)
    if (perfil === "A" && p.items.length > 0) {
      for (const item of p.items) {
        emit(rec(
          "C170",
          item.nItem, item.codItem, "",
          fmtNum(item.qtd, 5), item.unid.slice(0, 6),
          item.vlItem, item.vlDesc, "0",
          item.cstIcms, item.cfop,
          "", "0.00", "0.00", item.vlIpi,
          item.cstPis, item.vlBcPis, item.aliqPis, "0.000", "0.0000", item.vlPis,
          item.cstCofins, item.vlBcCofins, item.aliqCofins, "0.000", "0.0000", item.vlCofins,
          "", "0.00",
        ));
      }
    }

    // C190 — Totalização analítica por CST+CFOP+ALIQ do documento
    if (p.items.length > 0) {
      const docC190 = new Map<string, { vlOpr: number; vlBcIcms: number; vlIcms: number; vlBcSt: number; vlIcmsSt: number }>();
      for (const item of p.items) {
        if (!item.cfop) continue;
        const aliq = item.aliqIcms || "0.00";
        const key  = `${item.cstIcms}|${item.cfop}|${aliq}`;
        const ex   = docC190.get(key) ?? { vlOpr: 0, vlBcIcms: 0, vlIcms: 0, vlBcSt: 0, vlIcmsSt: 0 };
        ex.vlOpr   += parseFloat(item.vlItem)   || 0;
        ex.vlBcIcms += parseFloat(item.vlBcIcms) || 0;
        ex.vlIcms   += parseFloat(item.vlIcms)   || 0;
        ex.vlBcSt   += parseFloat(item.vlBcIcmsSt) || 0;
        ex.vlIcmsSt += parseFloat(item.vlIcmsSt)   || 0;
        docC190.set(key, ex);
      }
      for (const [key, val] of docC190.entries()) {
        const [cst, cfop, aliq] = key.split("|");
        const first = cfop?.[0] ?? "1";
        if (first === "5" || first === "6") totalDebitos  += val.vlIcms;
        else                                totalCreditos += val.vlIcms;
        emit(rec("C190", cst, cfop, aliq,
          fmtNum(val.vlOpr), fmtNum(val.vlBcIcms), fmtNum(val.vlIcms),
          fmtNum(val.vlBcSt), fmtNum(val.vlIcmsSt), "0.00", ""));
      }
    } else {
      // Sem XML: C190 genérico para não quebrar o arquivo
      const cfop = p.indOper === "1" ? "5933" : "1556";
      const first = p.indOper === "1" ? "5" : "1";
      const vlBcNum = parseFloat(p.vlBcIcms) || 0;
      const vlIcmsNum = parseFloat(p.vlIcms) || 0;
      if (first === "5") totalDebitos  += vlIcmsNum;
      else               totalCreditos += vlIcmsNum;
      emit(rec("C190", "090", cfop, "0.00",
        fmtNum(p.vlDoc), fmtNum(vlBcNum), fmtNum(vlIcmsNum),
        "0.00", "0.00", "0.00", ""));
    }
  }

  const cntC = lines.filter(l => /^\|C/.test(l)).length + 1;
  emit(rec("C990", cntC));

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO D — Transporte (sem movimento)
  // ═══════════════════════════════════════════════════════════════════════════
  emit(rec("D001", "1"));
  emit(rec("D990", 2));

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO E — Apuração do ICMS
  // ═══════════════════════════════════════════════════════════════════════════
  emit(rec("E001", "0"));
  emit(rec("E100", strIni, strFin));
  const vlApurado   = Math.max(0, totalDebitos - totalCreditos);
  const vlCredorTrans = Math.max(0, totalCreditos - totalDebitos);
  emit(rec("E110",
    fmtNum(totalDebitos),  // VL_TOT_DEBITOS
    "0.00",                 // VL_AJ_DEBITOS
    "0.00",                 // VL_TOT_AJ_DEBITOS
    "0.00",                 // VL_ESTORNOS_CRED
    fmtNum(totalCreditos), // VL_TOT_CREDITOS
    "0.00",                 // VL_AJ_CREDITOS
    "0.00",                 // VL_TOT_AJ_CREDITOS
    "0.00",                 // VL_ESTORNOS_DEB
    "0.00",                 // VL_SLD_CREDOR_ANT
    fmtNum(vlApurado),     // VL_SLD_APURADO
    "0.00",                 // VL_TOT_DED
    fmtNum(vlApurado),     // VL_ICMS_RECOLHER
    fmtNum(vlCredorTrans), // VL_SLD_CREDOR_TRANSP
    "0.00",                 // DEB_ESP
  ));
  const cntE = lines.filter(l => /^\|E/.test(l)).length + 1;
  emit(rec("E990", cntE));

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO G — CIAP (sem dados)
  // ═══════════════════════════════════════════════════════════════════════════
  emit(rec("G001", "1"));
  emit(rec("G990", 2));

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO H — Inventário (sem dados)
  // ═══════════════════════════════════════════════════════════════════════════
  emit(rec("H001", "1"));
  emit(rec("H990", 2));

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO 1 — Informações Adicionais
  // ═══════════════════════════════════════════════════════════════════════════
  emit(rec("1001", "1"));
  emit(rec("1010", "N", "N", "N", "N", "N", "N", "N", "N", "N", "N", "N", "N", "N"));
  const cntUm = lines.filter(l => /^\|1/.test(l)).length + 1;
  emit(rec("1990", cntUm));

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOCO 9 — Encerramento
  // ═══════════════════════════════════════════════════════════════════════════
  // Snapshot dos contadores antes do Bloco 9
  const regCountSnap = { ...regCount };

  const b9Lines: string[] = [];
  b9Lines.push(rec("9001", "0"));

  const sortedRegs = Object.keys(regCountSnap).sort();
  for (const r of sortedRegs) {
    b9Lines.push(rec("9900", r, regCountSnap[r]));
  }
  // Conta o próprio registro 9001
  b9Lines.push(rec("9900", "9001", 1));
  // Conta todos os 9900 (incluindo este próprio)
  const total9900 = sortedRegs.length + 2 + 1; // +linhas acima +9001 +self
  b9Lines.push(rec("9900", "9900", total9900));
  b9Lines.push(rec("9900", "9990", 1));
  b9Lines.push(rec("9900", "9999", 1));

  const bloco9Count = b9Lines.length + 2; // +9990 +9999
  b9Lines.push(rec("9990", bloco9Count));

  const grandTotal = lines.length + b9Lines.length + 1; // +9999
  b9Lines.push(rec("9999", grandTotal));

  lines.push(...b9Lines);

  return Buffer.from(lines.join(""), "utf-8");
}

// ── Rota Express ──────────────────────────────────────────────────────────────

export function registerEfdIcmsIpiRoute(app: Express) {
  app.get("/api/download/efd-icms-ipi", async (req: any, res: any) => {
    try {
      try { await sdk.authenticateRequest(req); } catch {
        return res.status(401).json({ error: "Não autenticado" });
      }

      const companyId = parseInt(req.query.companyId as string, 10);
      const mes       = parseInt(req.query.mes as string, 10);
      const ano       = parseInt(req.query.ano as string, 10);
      const finalidade = (req.query.finalidade as string) === "1" ? "1" : "0";

      if (!companyId || mes < 1 || mes > 12 || ano < 2009 || ano > 2099) {
        return res.status(400).json({ error: "Parâmetros inválidos (companyId, mes 1-12, ano)" });
      }

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "DB indisponível" });

      const buf = await buildEfdIcmsIpiBuffer(db, companyId, mes, ano, finalidade as "0" | "1");

      const mesStr = String(mes).padStart(2, "0");
      const fin = finalidade === "1" ? "SUB" : "ORI";
      const filename = `EFD_ICMS_IPI_${companyId}_${mesStr}_${ano}_${fin}.txt`;

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buf);

    } catch (err: any) {
      console.error("[EfdIcmsIpi]", err);
      if (!res.headersSent)
        res.status(500).json({ error: "Erro ao gerar EFD-ICMS/IPI: " + (err?.message ?? err) });
    }
  });
}
