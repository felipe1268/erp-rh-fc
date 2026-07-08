/**
 * server/routers/downloadSpedEcf.ts
 * GET /api/download/sped-ecf?companyId=&ano=&finalidade=
 *
 * SPED ECF — Escrituração Contábil Fiscal (IRPJ/CSLL — Lucro Presumido)
 * Layout ECF versão 9 (ADE Cosit nº 5/2023)
 * Referência: Receita Federal — Manual de Orientação do Leiaute
 */
import type { Express } from "express";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";

const COD_VER_ECF = "009";

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

export async function buildSpedEcfBuffer(
  companyId: number,
  ano: number,
  finalidade: "0"|"1"
): Promise<Buffer> {
  const db = getDb();

  const compQ = await db.$client.query(
    `SELECT "razaoSocial","nomeFantasia",cnpj FROM companies WHERE id=$1 LIMIT 1`,
    [companyId]
  );
  if (!compQ.rows.length) throw new Error("Empresa não encontrada");
  const comp = compQ.rows[0];
  const razao = ((comp.razaoSocial||comp.nomeFantasia) as string).slice(0,100);
  const cnpj  = dig(comp.cnpj as string,14);

  const cfgQ = await db.$client.query(
    `SELECT * FROM efd_icms_ipi_config WHERE company_id=$1 LIMIT 1`,
    [companyId]
  );
  const cfg = cfgQ.rows[0] ?? {};
  const ie     = (cfg.ie ?? "").slice(0,14);
  const codMun = (cfg.cod_mun ?? "").slice(0,7);
  const contNome  = (cfg.cont_nome ?? "").slice(0,100);
  const contCpf   = dig(cfg.cont_cpf,11);
  const contCrc   = (cfg.cont_crc ?? "").slice(0,15);

  const ecfQ = await db.$client.query(
    `SELECT * FROM sped_ecf_config WHERE company_id=$1 LIMIT 1`,
    [companyId]
  );
  const ecf = ecfQ.rows[0] ?? {};
  const codQualifPj   = (ecf.cod_qualif_pj ?? "05").slice(0,2);
  const setorAtiv     = (ecf.setor_ativ    ?? "04").slice(0,2);
  const percPresIrpj  = parseFloat(ecf.perc_pres_irpj  ?? "32");
  const percPresCSLL  = parseFloat(ecf.perc_pres_csll  ?? "32");
  const nire          = (ecf.nire ?? "").slice(0,20);

  // Período
  const dtIni = new Date(ano, 0, 1);
  const dtFin = new Date(ano, 11, 31);
  const dtIniStr = dtIni.toISOString().split("T")[0];
  const dtFinStr = dtFin.toISOString().split("T")[0];
  const dtIniF = fmtDate(dtIni);
  const dtFinF = fmtDate(dtFin);

  // Receita anual da empresa (fiscal_notes emitidas no período)
  const recQ = await db.$client.query(`
    SELECT COALESCE(SUM(fn.valor_bruto),0)::numeric AS total_rec
    FROM fiscal_notes fn
    WHERE fn.company_id=$1
      AND fn.data_emissao >= $2 AND fn.data_emissao <= $3
      AND COALESCE(fn.status,'normal') NOT IN ('cancelada')
      AND regexp_replace(COALESCE(fn.emitente_cnpj,''),'[^0-9]','','g') = $4
  `, [companyId, dtIniStr, dtFinStr, cnpj]);
  const receitaAnual = parseFloat(recQ.rows[0]?.total_rec ?? "0");

  // Receita por trimestre
  const recTriQ = await db.$client.query(`
    SELECT
      EXTRACT(QUARTER FROM fn.data_emissao)::int AS trimestre,
      SUM(fn.valor_bruto)::numeric               AS total
    FROM fiscal_notes fn
    WHERE fn.company_id=$1
      AND fn.data_emissao >= $2 AND fn.data_emissao <= $3
      AND COALESCE(fn.status,'normal') NOT IN ('cancelada')
      AND regexp_replace(COALESCE(fn.emitente_cnpj,''),'[^0-9]','','g') = $4
    GROUP BY 1 ORDER BY 1
  `, [companyId, dtIniStr, dtFinStr, cnpj]);
  const recTri: Record<number,number> = {1:0,2:0,3:0,4:0};
  for (const r of recTriQ.rows) recTri[r.trimestre as number] = parseFloat(r.total);

  // Limiar anual de IRPJ adicional: R$20.000/mês × 12 = R$240.000/ano sobre LP
  const LIMITE_ADIC_TRIMESTRAL = 60000; // R$60k por trimestre (R$20k/mês × 3)

  const linhas: string[] = [];
  const regCount: Record<string,number> = {};
  function push(s:string, regName:string) {
    linhas.push(s);
    regCount[regName] = (regCount[regName]||0)+1;
  }

  // ── BLOCO 0 ───────────────────────────────────────────────────────────────
  push(rec("0000",
    COD_VER_ECF,   // COD_VER
    dtIniF,        // DT_INI
    dtFinF,        // DT_FIN
    razao,         // NOME
    cnpj,          // CNPJ
    nire,          // NIRE
    "0",           // IND_SIT_ESPECIAL
    "0",           // IND_INATIVO
    "1",           // IND_PJ_ATIVO
    "0",           // IND_IMUNE_ISENTO
    "0",           // IND_PREPARO
    "0",           // IND_PJ_ORG_INTERN
    "0",           // IND_ESC_CONS_DEMO
    "",            // COD_SCP
    setorAtiv,     // SETOR_ATIV (04=Construção Civil)
    "0"            // IND_DI_VL
  ),"0000");

  push(rec("0001","0"),"0001");

  // 0010 — identificação da PJ
  // COD_INC_TRIB=3(LP), IND_PJ_ESTRANGEIRA=0, COD_PAIS=, IND_CONS_PREV=0,
  // IND_CONV=0, IND_LUCR_ARBIT=0, SIT_IMUNE=0, IND_DESONERA_FOLHA=0
  push(rec("0010","3","0","","0","0","0","0","0"),"0010");

  // 0020 — parâmetros Lucro Presumido
  // IND_ESTE=0, PERCL_IRPJ=percPresIrpj, PERCL_CSLL=percPresCSLL,
  // IND_CAL_CSLL_PR=1, COD_PARTE=0, VL_LIMITE_PERCL=0
  push(rec("0020","0",String(percPresIrpj),String(percPresCSLL),"1","0","0.00"),"0020");

  // 0030 — identificação dos sócios (simplificado)
  // Apenas um registro obrigatório se pessoa jurídica controladora
  // omitindo para simplificar

  // 0930 — declaração e assinatura do responsável
  // se contabilista preenchido
  if (contNome) {
    push(rec("0930",
      "1",      // IND_RESP_LEGAL=1 (contabilista)
      contNome,
      contCpf,
      contCrc,
      "",       // Cargo
      "",       // EMAIL
      ""        // FONE
    ),"0930");
  }

  push(rec("0990",String(linhas.length+1)),"0990");

  // ── BLOCO J — Balanço Patrimonial (simplificado) ──────────────────────────
  // Para PVA: necessário ao menos J001/J990 com IND_MOV=1
  // Dados contábeis completos exigem módulo contábil dedicado
  push(rec("J001","1"),"J001");
  push(rec("J990","2"),"J990");

  // ── BLOCO K — Mapeamento (sem movimento para LP) ──────────────────────────
  push(rec("K001","1"),"K001");
  push(rec("K990","2"),"K990");

  // ── BLOCO L — Lucro Real (não aplicável — LP) ─────────────────────────────
  push(rec("L001","1"),"L001");
  push(rec("L990","2"),"L990");

  // ── BLOCO M — CSLL Real (não aplicável — LP) ──────────────────────────────
  push(rec("M001","1"),"M001");
  push(rec("M990","2"),"M990");

  // ── BLOCO N — IRPJ Lucro Presumido ────────────────────────────────────────
  push(rec("N001","0"),"N001");
  push(rec("N010",cnpj,"1"),"N010"); // CNPJ, IND_PJ_ATIVO

  let totalIrpj = 0;
  let totalAdic = 0;

  for (let tri = 1; tri <= 4; tri++) {
    const recTrimestre  = recTri[tri] ?? 0;
    const basePresumida = recTrimestre * percPresIrpj / 100;
    const irpj15        = parseFloat((basePresumida * 0.15).toFixed(2));
    const excesso       = Math.max(0, basePresumida - LIMITE_ADIC_TRIMESTRAL);
    const adic          = parseFloat((excesso * 0.10).toFixed(2));
    const irpjTotal     = parseFloat((irpj15 + adic).toFixed(2));
    totalIrpj += irpj15;
    totalAdic += adic;

    const dtFimTri = new Date(ano, tri * 3 - 1 + 1, 0); // último dia do trimestre
    const perRef   = `${String(dtFimTri.getMonth()+1).padStart(2,"0")}/${ano}`;

    // N500 — receitas do trimestre
    push(rec("N500",
      perRef,
      fmtNum(recTrimestre),  // VL_REC_TRIM
      "0.00",                // VL_REC_VEND_MERC
      fmtNum(recTrimestre),  // VL_REC_PREST_SERV
      "0.00",                // VL_REC_OUTR
      "0.00",                // VL_GANHO_CAPITAL
      "0.00","0.00","0.00","0.00","0.00","0.00","0.00","0.00"
    ),"N500");

    // N600 — base presumida IRPJ
    push(rec("N600",
      perRef,
      fmtNum(basePresumida), // VL_BC_IRPJ
      String(percPresIrpj),  // PERCL_IRPJ
      fmtNum(basePresumida), // VL_LUCRO_PRES_TRIM
      "0.00","0.00","0.00","0.00","0.00",
      fmtNum(basePresumida)  // VL_BC_IRPJ_FINAL
    ),"N600");

    // N610 — IRPJ 15%
    push(rec("N610",perRef,fmtNum(irpj15),fmtNum(irpj15),fmtNum(irpj15)),"N610");

    // N612 — adicional 10%
    push(rec("N612",perRef,fmtNum(excesso),fmtNum(adic)),"N612");

    // N620 — estimativas pagas (deixar zerado)
    push(rec("N620",perRef,"0.00","0.00","0.00","0.00","0.00","0.00","0.00","0.00"),"N620");

    // N630 — compensações
    push(rec("N630",perRef,"0.00","0.00","0.00","0.00","0.00","0.00","0.00"),"N630");

    // N650 — IRPJ a pagar
    push(rec("N650",perRef,fmtNum(irpjTotal),"0.00",fmtNum(irpjTotal)),"N650");

    // N660 — saldo (DARF)
    push(rec("N660",perRef,fmtNum(irpjTotal),"0.00","0.00"),"N660");

    // N670 — pagamentos efetuados
    push(rec("N670",perRef,"0.00","0.00","0.00","0.00","0.00"),"N670");
  }

  push(rec("N990",String(linhas.length - (linhas.findIndex(l=>l.startsWith("|N001|"))+1)+1+1)),"N990");

  // ── BLOCO P — CSLL Lucro Presumido ────────────────────────────────────────
  push(rec("P001","0"),"P001");
  push(rec("P010",cnpj,"1"),"P010");

  let totalCsll = 0;

  for (let tri = 1; tri <= 4; tri++) {
    const recTrimestre  = recTri[tri] ?? 0;
    const basePresumida = recTrimestre * percPresCSLL / 100;
    const csll          = parseFloat((basePresumida * 0.09).toFixed(2));
    totalCsll += csll;

    const dtFimTri = new Date(ano, tri * 3 - 1 + 1, 0);
    const perRef   = `${String(dtFimTri.getMonth()+1).padStart(2,"0")}/${ano}`;

    // P100 — receitas
    push(rec("P100",perRef,fmtNum(recTrimestre),"0.00",fmtNum(recTrimestre),"0.00","0.00","0.00","0.00","0.00"),"P100");

    // P150 — ajustes
    push(rec("P150",perRef,"0.00","0.00","0.00","0.00"),"P150");

    // P200 — base CSLL
    push(rec("P200",perRef,fmtNum(basePresumida),String(percPresCSLL),fmtNum(basePresumida)),"P200");

    // P300 — CSLL 9%
    push(rec("P300",perRef,fmtNum(csll),fmtNum(csll),fmtNum(csll)),"P300");

    // P310 — CSLL trimestral
    push(rec("P310",perRef,fmtNum(csll),"0.00","0.00","0.00","0.00"),"P310");

    // P400 — pagamentos
    push(rec("P400",perRef,"0.00","0.00","0.00","0.00","0.00"),"P400");

    // P500 — CSLL a pagar
    push(rec("P500",perRef,fmtNum(csll),"0.00",fmtNum(csll)),"P500");
  }

  push(rec("P990",String(linhas.length - (linhas.findIndex(l=>l.startsWith("|P001|"))+1)+1+1)),"P990");

  // ── BLOCO T — Incentivos fiscais (sem movimento) ──────────────────────────
  push(rec("T001","1"),"T001");
  push(rec("T990","2"),"T990");

  // ── BLOCO X — Informações econômicas (sem movimento) ─────────────────────
  push(rec("X001","1"),"X001");
  push(rec("X990","2"),"X990");

  // ── BLOCO Y — Informações gerais (sem movimento) ──────────────────────────
  push(rec("Y001","1"),"Y001");
  push(rec("Y990","2"),"Y990");

  // ── BLOCO 9 — Encerramento ────────────────────────────────────────────────
  push(rec("9001","0"),"9001");
  const totalRegEntries = Object.entries(regCount);
  for (const [reg,cnt] of totalRegEntries) {
    push(rec("9900",reg,String(cnt)),"9900");
  }
  const nReg9900 = totalRegEntries.length + 4;
  push(rec("9900","9001","1"),"9900");
  push(rec("9900","9900",String(nReg9900)),"9900");
  push(rec("9900","9990","1"),"9900");
  push(rec("9900","9999","1"),"9900");
  push(rec("9990",String(linhas.length+2)),"9990");
  push(rec("9999",String(linhas.length+1)),"9999");

  return Buffer.from(linhas.join(""),"utf-8");
}

export function registerSpedEcfRoute(app: Express) {
  app.get("/api/download/sped-ecf", async (req: any, res: any) => {
    try {
      try { await sdk.authenticateRequest(req); } catch {
        return res.status(401).json({ error: "Não autenticado" });
      }
      const companyId = parseInt(req.query.companyId as string, 10);
      const ano       = parseInt(req.query.ano as string, 10);
      const finalidade= (req.query.finalidade as string) === "1" ? "1" : "0";
      if (!companyId || ano < 2009 || ano > 2099) {
        return res.status(400).json({ error: "Parâmetros inválidos" });
      }
      const buf = await buildSpedEcfBuffer(companyId, ano, finalidade as "0"|"1");
      const fin = finalidade === "1" ? "SUB" : "ORI";
      res.setHeader("Content-Type","text/plain; charset=utf-8");
      res.setHeader("Content-Disposition",
        `attachment; filename="SPED_ECF_${companyId}_${ano}_${fin}.txt"`);
      res.send(buf);
    } catch(e:any) {
      console.error("[SpedEcf]", e);
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  });
}
