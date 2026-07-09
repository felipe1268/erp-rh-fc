/**
 * server/routers/downloadEfdContribuicoes.ts
 * GET /api/download/efd-contribuicoes?companyId=&mes=&ano=&finalidade=
 *
 * EFD Contribuições — PIS/COFINS — Regime Cumulativo (Lucro Presumido)
 * Guia Prático EFD-Contribuições versão 1.34 (ADE Cosit nº 17/2020)
 * Formato: |REG|campo1|...|campo_n|\r\n
 */
import type { Express } from "express";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";

const COD_VER_CONTRIB = "006";

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(String(d).replace(" ", "T"));
  if (isNaN(dt.getTime())) return "";
  return `${String(dt.getDate()).padStart(2,"0")}${String(dt.getMonth()+1).padStart(2,"0")}${dt.getFullYear()}`;
}

function fmtNum(n: number | string | null | undefined, dec = 2): string {
  const num = typeof n === "string" ? parseFloat(n.replace(",",".")) : Number(n ?? 0);
  return isNaN(num) ? Number(0).toFixed(dec) : num.toFixed(dec);
}

function rec(...fields: (string|number|null|undefined)[]): string {
  return "|" + fields.map(f => f == null ? "" : String(f)).join("|") + "|\r\n";
}

function dig(s:string|null|undefined, len:number): string {
  return (s||"").replace(/\D/g,"").slice(-len).padStart(len,"0");
}

// ── Builder principal ─────────────────────────────────────────────────────────

export async function buildEfdContribuicoesBuffer(
  companyId: number,
  mes: number,
  ano: number,
  finalidade: "0"|"1"
): Promise<Buffer> {
  const db = await getDb();

  // Empresa
  const compQ = await db.$client.query(
    `SELECT "razaoSocial", "nomeFantasia", cnpj FROM companies WHERE id=$1 LIMIT 1`,
    [companyId]
  );
  if (!compQ.rows.length) throw new Error("Empresa não encontrada");
  const comp = compQ.rows[0];
  const razao = ((comp.razaoSocial || comp.nomeFantasia) as string).slice(0,100);
  const cnpj  = dig(comp.cnpj as string, 14);

  // Config (IE, IM, endereço, contabilista)
  const cfgQ = await db.$client.query(
    `SELECT * FROM efd_icms_ipi_config WHERE company_id=$1 LIMIT 1`,
    [companyId]
  );
  const cfg = cfgQ.rows[0] ?? {};
  const ie      = (cfg.ie ?? "").slice(0,14);
  const im      = (cfg.im ?? "").slice(0,20);
  const codMun  = (cfg.cod_mun ?? "").slice(0,7);
  const cep     = dig(cfg.cep, 8);
  const logradouro = (cfg.logradouro ?? "").slice(0,60);
  const numero     = (cfg.numero_end ?? "").slice(0,10);
  const compl      = (cfg.complemento ?? "").slice(0,60);
  const bairro     = (cfg.bairro ?? "").slice(0,60);
  const fone       = dig(cfg.telefone, 11);
  const email      = (cfg.email ?? "").slice(0,255);
  const contNome   = (cfg.cont_nome ?? "").slice(0,100);
  const contCpf    = dig(cfg.cont_cpf, 11);
  const contCrc    = (cfg.cont_crc ?? "").slice(0,15);
  const contCnpj   = dig(cfg.cont_cnpj, 14);
  const contCodMun = (cfg.cont_cod_mun ?? codMun).slice(0,7);
  const contCep    = dig(cfg.cont_cep, 8);
  const contEnd    = (cfg.cont_logradouro ?? "").slice(0,60);
  const contNum    = (cfg.cont_numero ?? "").slice(0,10);
  const contCompl  = (cfg.cont_complemento ?? "").slice(0,60);
  const contBairro = (cfg.cont_bairro ?? "").slice(0,60);
  const contFone   = dig(cfg.cont_fone, 11);
  const contFax    = dig(cfg.cont_fax, 11);
  const contEmail  = (cfg.cont_email ?? "").slice(0,255);

  // Config específica de contribuições
  const ccQ = await db.$client.query(
    `SELECT * FROM efd_contrib_config WHERE company_id=$1 LIMIT 1`,
    [companyId]
  );
  const cc = ccQ.rows[0] ?? {};
  const codIncTrib = (cc.cod_inc_trib ?? "3"); // 3=Lucro Presumido
  const indRegCum  = (cc.ind_reg_cum  ?? "1"); // 1=cumulativo
  const aliqPis    = parseFloat(cc.aliq_pis    ?? "0.65");
  const aliqCofins = parseFloat(cc.aliq_cofins ?? "3.00");

  // Período
  const dtIni = new Date(ano, mes - 1, 1);
  const dtFin = new Date(ano, mes, 0);
  const dtIniStr = dtIni.toISOString().split("T")[0];
  const dtFinStr = dtFin.toISOString().split("T")[0];
  const mesRef   = `${String(mes).padStart(2,"0")}/${ano}`;
  const dtIniF   = fmtDate(dtIni);
  const dtFinF   = fmtDate(dtFin);

  // ── NFS-e do período (serviços ISS — Bloco A) ────────────────────────────
  const nfseQ = await db.$client.query(`
    SELECT fn.numero_nf, fn.data_emissao, fn.tomador_razao_social, fn.tomador_cnpj,
           fn.emitente_cnpj, fn.emitente_nome, fn.valor_bruto, fn.status,
           fn.chave_acesso, fn.origem
    FROM fiscal_notes fn
    WHERE fn.company_id=$1
      AND fn.data_emissao >= $2 AND fn.data_emissao <= $3
      AND COALESCE(fn.origem,'manual') IN
          ('nfse_siapgeo','nfse_siapgeo_export','nfse_nacional','nfse_xml_manual','manual_nfse')
    ORDER BY fn.data_emissao, fn.id
  `, [companyId, dtIniStr, dtFinStr]);

  // ── NF-e do período (mercadorias — Bloco C) ───────────────────────────────
  const nfeQ = await db.$client.query(`
    SELECT fn.numero_nf, fn.data_emissao, fn.tomador_razao_social, fn.tomador_cnpj,
           fn.emitente_cnpj, fn.emitente_nome, fn.valor_bruto, fn.status, fn.chave_acesso
    FROM fiscal_notes fn
    WHERE fn.company_id=$1
      AND fn.data_emissao >= $2 AND fn.data_emissao <= $3
      AND COALESCE(fn.origem,'manual') NOT IN
          ('nfse_siapgeo','nfse_siapgeo_export','nfse_nacional','nfse_xml_manual','manual_nfse')
    ORDER BY fn.data_emissao, fn.id
  `, [companyId, dtIniStr, dtFinStr]);

  // ── Mapa de participantes ─────────────────────────────────────────────────
  const parts = new Map<string,{nome:string}>();
  parts.set(cnpj, { nome: razao });
  for (const r of [...nfseQ.rows, ...nfeQ.rows]) {
    const emitD = dig(r.emitente_cnpj as string, 14);
    const isSaida = emitD === cnpj;
    const partCnpj = isSaida ? dig(r.tomador_cnpj as string,14) : emitD;
    const partNome = isSaida
      ? (r.tomador_razao_social as string||"").slice(0,100)
      : (r.emitente_nome as string||"").slice(0,100);
    if (partCnpj && partCnpj !== "00000000000000") parts.set(partCnpj,{nome:partNome});
  }

  // ── Acumular totais PIS/COFINS ────────────────────────────────────────────
  let totalRecNfse = 0;
  let totalRecNfe  = 0;
  const linhas: string[] = [];
  const regCount: Record<string,number> = {};
  function push(s:string, regName:string) {
    linhas.push(s);
    regCount[regName] = (regCount[regName]||0)+1;
  }

  // ── BLOCO 0 ───────────────────────────────────────────────────────────────
  push(rec("0000",COD_VER_CONTRIB,"0",finalidade,mesRef,String(ano),
           razao,cnpj,"SP",ie,codMun,"",dtIniF,dtFinF,"0","1","0"),"0000");

  push(rec("0001","0"),"0001");  // IND_MOV=0 → tem dados

  // 0100 — contabilista (se preenchido)
  if (contNome) {
    push(rec("0100",contNome,contCpf,contCrc,contCnpj||"",contCep,
             contEnd,contNum,contCompl,contBairro,contFone,contFax,contEmail,contCodMun),"0100");
  }

  // 0110 — regime tributário
  // COD_INC_TRIB | IND_APROP_CRED | COD_TIPO_CONT | IND_REG_CUM
  push(rec("0110",codIncTrib,"1","1",indRegCum),"0110");

  // 0140 — estabelecimento
  push(rec("0140","0001",razao,cnpj,"SP",ie,codMun,im,""),"0140");

  // 0145 — atividade construtora (CNAE 4120400)
  push(rec("0145","0001","4120400","0001"),"0145");

  // 0150 — participantes
  for (const [pcnpj,pd] of parts) {
    if (pcnpj === cnpj) continue;
    push(rec("0150",pcnpj,pd.nome,"1058",pcnpj,"","","","","","","",""),"0150");
  }

  // 0190 — unidades
  push(rec("0190","UN","Unidade"),"0190");
  push(rec("0190","M2","Metro quadrado"),"0190");

  push(rec("0990",String(linhas.length+1)),"0990");

  // ── BLOCO A — NFS-e (Serviços) ───────────────────────────────────────────
  const blocoAstart = linhas.length;
  push(rec("A001","0"),"A001");
  push(rec("A010",cnpj),"A010");

  for (const r of nfseQ.rows) {
    const emitD   = dig(r.emitente_cnpj as string,14);
    const isSaida = emitD === cnpj;
    if (!isSaida) continue;  // cumulativo: só saídas geram PIS/COFINS
    if (r.status === "cancelada") continue;

    const valor    = parseFloat(r.valor_bruto as string || "0");
    const vlPis    = parseFloat((valor * aliqPis/100).toFixed(2));
    const vlCofins = parseFloat((valor * aliqCofins/100).toFixed(2));
    totalRecNfse  += valor;

    const partCnpj = dig(r.tomador_cnpj as string,14) || "00000000000000";
    const numDoc   = String(r.numero_nf||"0").replace(/\D/g,"").padStart(15,"0").slice(-15);
    const dtDoc    = fmtDate(r.data_emissao as string);
    const chave    = ((r.chave_acesso as string)||"").replace(/\D/g,"").slice(0,50);

    push(rec("A100",
      "1",          // IND_OPER=1 (saída)
      "0",          // IND_EMIT=0 (nossa empresa)
      partCnpj,     // COD_PART
      "00",         // COD_SIT
      "001",        // SER
      "",           // SUB_SER
      codMun,       // COD_MUNIC (município da empresa)
      chave,        // CHV_NFSE
      dtDoc,        // DT_DOC
      dtDoc,        // DT_EXE_SERV
      fmtNum(valor),// VL_DOC
      "0",          // IND_PGTO
      "0.00",       // VL_DESC
      fmtNum(valor),// VL_BC_PIS
      fmtNum(aliqPis,2),    // ALIQ_PIS
      fmtNum(vlPis),        // VL_PIS
      fmtNum(valor),        // VL_BC_COFINS
      fmtNum(aliqCofins,2), // ALIQ_COFINS
      fmtNum(vlCofins),     // VL_COFINS
      "",           // COD_CTA
      codMun        // COD_MUNIC_SERV
    ),"A100");
  }

  push(rec("A990",String(linhas.length - blocoAstart + 1)),"A990");

  // ── BLOCO C — NF-e (mercadorias) ─────────────────────────────────────────
  const blocoCstart = linhas.length;
  push(rec("C001","0"),"C001");
  push(rec("C010",cnpj,"1"),"C010"); // IND_ESCRIT=1

  for (const r of nfeQ.rows) {
    const emitD   = dig(r.emitente_cnpj as string,14);
    const isSaida = emitD === cnpj;
    if (r.status === "cancelada") continue;

    const valor    = parseFloat(r.valor_bruto as string || "0");
    const partCnpj = isSaida
      ? dig(r.tomador_cnpj as string,14) || "00000000000000"
      : emitD || "00000000000000";
    const numDoc   = String(r.numero_nf||"0").replace(/\D/g,"").padStart(9,"0").slice(-9);
    const chave    = ((r.chave_acesso as string)||"").replace(/\D/g,"").slice(0,44);
    const dtDoc    = fmtDate(r.data_emissao as string);
    // Entrada: CST_PIS=50 (sem crédito cumulativo); Saída: CST=49
    const cstPis   = isSaida ? "49" : "50";

    if (isSaida) totalRecNfe += valor;

    push(rec("C100",
      isSaida ? "1" : "0", // IND_OPER
      isSaida ? "0" : "1", // IND_EMIT
      partCnpj, "55",       // COD_PART, COD_MOD
      r.status==="cancelada"?"02":"00", // COD_SIT
      "001", numDoc, chave, dtDoc, dtDoc,
      fmtNum(valor),        // VL_DOC
      "0",                  // IND_PGTO
      "0.00","0.00",        // VL_DESC, VL_ABAT_NT
      fmtNum(valor),        // VL_MERC
      "0",                  // IND_FRT
      "0.00","0.00","0.00", // VL_FRT, VL_SEG, VL_OUT_DA
      "0.00","0.00","0.00","0.00", // VL_BC_ICMS, VL_ICMS, VL_BC_ICMS_ST, VL_ICMS_ST
      "0.00",               // VL_IPI
      isSaida ? fmtNum(valor*aliqPis/100) : "0.00",    // VL_PIS
      isSaida ? fmtNum(valor*aliqCofins/100) : "0.00", // VL_COFINS
      "0.00","0.00"         // VL_PIS_ST, VL_COFINS_ST
    ),"C100");

    // C190 — agregação CFOP/CST/alíq
    const cfop = isSaida ? "5933" : "1556";
    push(rec("C190",cstPis,cfop,"0",fmtNum(valor),
             "0.00","0.00","0.00","0.00","0.00","0.00",""),"C190");

    // C191 — PIS por C100
    push(rec("C191",partCnpj,cstPis,fmtNum(valor),"0.00",
             isSaida ? fmtNum(valor) : "0.00",
             isSaida ? fmtNum(aliqPis,2) : "0.00",
             "0",
             "0.00",
             isSaida ? fmtNum(valor*aliqPis/100) : "0.00",
             "",""),"C191");

    // C195 — COFINS por C100
    push(rec("C195",partCnpj,cstPis,fmtNum(valor),"0.00",
             isSaida ? fmtNum(valor) : "0.00",
             isSaida ? fmtNum(aliqCofins,2) : "0.00",
             "0",
             "0.00",
             isSaida ? fmtNum(valor*aliqCofins/100) : "0.00",
             "",""),"C195");
  }

  push(rec("C990",String(linhas.length - blocoCstart + 1)),"C990");

  // ── BLOCO D — Transportes (sem movimento) ────────────────────────────────
  push(rec("D001","1"),"D001");
  push(rec("D990","2"),"D990");

  // ── BLOCO F — Demais documentos (sem movimento) ──────────────────────────
  push(rec("F001","1"),"F001");
  push(rec("F990","2"),"F990");

  // ── BLOCO M — Apuração PIS/COFINS ────────────────────────────────────────
  const totalRec = totalRecNfse + totalRecNfe;
  const vlPisTotal    = parseFloat((totalRec * aliqPis/100).toFixed(2));
  const vlCofinsTotal = parseFloat((totalRec * aliqCofins/100).toFixed(2));

  push(rec("M001","0"),"M001");
  push(rec("M010",cnpj),"M010");

  // M200 — PIS consolidado
  push(rec("M200",
    "0.00",               // VL_TOT_CONT_NC_PER (não-cumulativo)
    "0.00",               // VL_TOT_CRED_DESC
    "0.00",               // VL_TOT_CRED_DESC_ANT
    "0.00",               // VL_TOT_CRED_COOF
    "0.00",               // VL_COF_CONT_PER
    fmtNum(vlPisTotal),   // VL_CONT_CUMULATIVO
    "0.00",               // VL_TOT_CONT_NC_DEV
    "0.00",               // VL_RET_NC
    "0.00",               // VL_OUT_DED_NC
    "0.00",               // VL_CONT_NC_REC
    "0.00",               // VL_TOT_CONT_CUM_DES
    "0.00",               // VL_RET_CUM
    "0.00",               // VL_OUT_DED_CUM
    fmtNum(vlPisTotal),   // VL_CONT_CUM_REC
    fmtNum(vlPisTotal)    // VL_TOT_CONT_REC
  ),"M200");

  // M210 — PIS por COD_CONT (cumulativo)
  if (totalRec > 0) {
    push(rec("M210",
      "01",                  // COD_CONT (venda mercado interno cumulativo)
      fmtNum(totalRec),      // VL_REC_BRT
      fmtNum(totalRec),      // VL_BC_CONT
      fmtNum(aliqPis,2),     // ALIQ_PIS_OU_QUANT
      "0",                   // QUANT_BC_PIS
      fmtNum(vlPisTotal),    // VL_CONT_APUR
      "0.00",                // VL_AJUS_ACRES
      "0.00",                // VL_AJUS_REDUC
      "0.00",                // VL_CONT_DIF
      "0.00",                // VL_CONT_ATIVO
      fmtNum(vlPisTotal),    // VL_CONT_APUR1
      "Vendas de serviços e mercadorias — regime cumulativo"
    ),"M210");
  }

  // M600 — COFINS consolidado
  push(rec("M600",
    "0.00",
    "0.00",
    "0.00",
    "0.00",
    "0.00",
    fmtNum(vlCofinsTotal),
    "0.00","0.00","0.00","0.00","0.00","0.00","0.00",
    fmtNum(vlCofinsTotal),
    fmtNum(vlCofinsTotal)
  ),"M600");

  // M610 — COFINS por COD_CONT
  if (totalRec > 0) {
    push(rec("M610",
      "01",
      fmtNum(totalRec),
      fmtNum(totalRec),
      fmtNum(aliqCofins,2),
      "0",
      fmtNum(vlCofinsTotal),
      "0.00","0.00","0.00","0.00",
      fmtNum(vlCofinsTotal),
      "Vendas de serviços e mercadorias — regime cumulativo"
    ),"M610");
  }

  push(rec("M990",String(linhas.length - (
    linhas.findIndex(l=>l.startsWith("|M001|"))+1
  )+1+1)),"M990");

  // ── BLOCO 1 — Complemento (sem movimento) ────────────────────────────────
  push(rec("1001","1"),"1001");
  push(rec("1990","2"),"1990");

  // ── BLOCO 9 — Encerramento ────────────────────────────────────────────────
  push(rec("9001","0"),"9001");
  const totalLinhas = linhas.length + 4; // 9001 + 9900s + 9990 + 9999
  const totalRegEntries = Object.entries(regCount);
  for (const [reg, cnt] of totalRegEntries) {
    push(rec("9900",reg,String(cnt)),"9900");
  }
  // Adicionar as entradas do próprio bloco 9
  const nReg9900 = totalRegEntries.length + 4;
  push(rec("9900","9001","1"),"9900");
  push(rec("9900","9900",String(nReg9900)),"9900");
  push(rec("9900","9990","1"),"9900");
  push(rec("9900","9999","1"),"9900");
  push(rec("9990",String(linhas.length+2)),"9990");
  const totalFinal = linhas.length + 1;
  push(rec("9999",String(totalFinal)),"9999");

  return Buffer.from(linhas.join(""), "utf-8");
}

// ── Express route ─────────────────────────────────────────────────────────────

export function registerEfdContribuicoesRoute(app: Express) {
  app.get("/api/download/efd-contribuicoes", async (req: any, res: any) => {
    try {
      try { await sdk.authenticateRequest(req); } catch {
        return res.status(401).json({ error: "Não autenticado" });
      }
      const companyId = parseInt(req.query.companyId as string, 10);
      const mes       = parseInt(req.query.mes as string, 10);
      const ano       = parseInt(req.query.ano as string, 10);
      const finalidade= (req.query.finalidade as string) === "1" ? "1" : "0";
      if (!companyId || mes < 1 || mes > 12 || ano < 2009 || ano > 2099) {
        return res.status(400).json({ error: "Parâmetros inválidos" });
      }
      const buf = await buildEfdContribuicoesBuffer(companyId, mes, ano, finalidade as "0"|"1");
      const mesStr = String(mes).padStart(2,"0");
      const fin = finalidade === "1" ? "SUB" : "ORI";
      res.setHeader("Content-Type","text/plain; charset=utf-8");
      res.setHeader("Content-Disposition",
        `attachment; filename="EFD_CONTRIB_${companyId}_${mesStr}_${ano}_${fin}.txt"`);
      res.send(buf);
    } catch(e:any) {
      console.error("[EfdContribuicoes]", e);
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  });
}
