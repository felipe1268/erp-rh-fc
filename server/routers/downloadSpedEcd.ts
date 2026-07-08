/**
 * server/routers/downloadSpedEcd.ts
 * GET /api/download/sped-ecd?companyId=&ano=&finalidade=
 *
 * SPED ECD — Escrituração Contábil Digital (anual)
 * Layout ECD versão 11 (ADE Cosit nº 12/2023)
 * Gera a estrutura base com Razão Contábil derivado de financial_entries.
 */
import type { Express } from "express";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";

const COD_VER_ECD = "011";

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

// Converte natureza ('receita'|'despesa') para indicador D/C do SPED ECD
// Na escrituração contábil: receita = Crédito, despesa = Débito
function indDC(natureza: string): "D"|"C" {
  return natureza === "receita" ? "C" : "D";
}

export async function buildSpedEcdBuffer(
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
  const contNome = (cfg.cont_nome ?? "").slice(0,100);
  const contCpf  = dig(cfg.cont_cpf,11);
  const contCrc  = (cfg.cont_crc ?? "").slice(0,15);

  const ecdQ = await db.$client.query(
    `SELECT * FROM sped_ecd_config WHERE company_id=$1 LIMIT 1`,
    [companyId]
  );
  const ecd = ecdQ.rows[0] ?? {};
  const nire          = (ecd.nire ?? "").slice(0,20);
  const indSitEspecial= (ecd.ind_sit_especial ?? "0").slice(0,1);
  const indEscCons    = (ecd.ind_esc_cons ?? "0").slice(0,1);
  const codScp        = (ecd.cod_scp ?? "").slice(0,14);
  const setorAtiv     = (ecd.setor_ativ ?? "04").slice(0,2);

  // Período
  const dtIni = new Date(ano, 0, 1);
  const dtFin = new Date(ano, 11, 31);
  const dtIniStr = dtIni.toISOString().split("T")[0];
  const dtFinStr = dtFin.toISOString().split("T")[0];
  const dtIniF = fmtDate(dtIni);
  const dtFinF = fmtDate(dtFin);

  // Plano de Contas (financial_accounts)
  const contasQ = await db.$client.query(`
    SELECT fa.id, fa.nome, fa.tipo, fa.codigo,
           fa.parent_id, fa.ativo, fa.is_group
    FROM financial_accounts fa
    WHERE fa.company_id=$1 AND fa.ativo=true
    ORDER BY COALESCE(fa.codigo,''), fa.nome
  `, [companyId]);
  const contas = contasQ.rows;

  // Lançamentos do período (financial_entries agrupados por conta)
  const lancQ = await db.$client.query(`
    SELECT
      fe.conta_id,
      fa.nome         AS conta_nome,
      fa.tipo         AS conta_tipo,
      fa.codigo       AS conta_codigo,
      SUM(CASE WHEN fe.natureza='receita' THEN fe.valor ELSE 0 END)::numeric AS total_credito,
      SUM(CASE WHEN fe.natureza='despesa' THEN fe.valor ELSE 0 END)::numeric AS total_debito,
      COUNT(*)        AS num_lancamentos
    FROM financial_entries fe
    LEFT JOIN financial_accounts fa ON fa.id = fe.conta_id
    WHERE fe.company_id=$1
      AND fe.data_lancamento >= $2 AND fe.data_lancamento <= $3
      AND COALESCE(fe.status,'normal') NOT IN ('cancelado','cancelada')
    GROUP BY fe.conta_id, fa.nome, fa.tipo, fa.codigo
    ORDER BY COALESCE(fa.codigo,''), fa.nome
  `, [companyId, dtIniStr, dtFinStr]);
  const lancs = lancQ.rows;

  // Totais para J150 (DRE)
  const totalReceita = lancs.reduce((s:number,r:any)=>s+parseFloat(r.total_credito||"0"),0);
  const totalDespesa = lancs.reduce((s:number,r:any)=>s+parseFloat(r.total_debito||"0"),0);
  const resultado    = totalReceita - totalDespesa;

  const linhas: string[] = [];
  const regCount: Record<string,number> = {};
  function push(s:string,regName:string) {
    linhas.push(s);
    regCount[regName]=(regCount[regName]||0)+1;
  }

  // ── BLOCO 0 ───────────────────────────────────────────────────────────────
  push(rec("0000",
    COD_VER_ECD,   // COD_VER
    dtIniF,        // DT_INI
    dtFinF,        // DT_FIN
    razao,         // NOME
    cnpj,          // CNPJ
    nire,          // NIRE
    indSitEspecial,// IND_SIT_ESPECIAL
    "0",           // IND_SIT_GER (0=normal)
    indEscCons,    // IND_ESC_CONS_DEMO
    codScp,        // COD_SCP
    setorAtiv,     // SETOR_ATIV
    "0",           // IND_NIRE_ANTERIOR
    ""             // COD_HASH_ENT
  ),"0000");

  push(rec("0001","0"),"0001");

  // 0007 — assinatura da escrituração (simplificado)
  if (contNome) {
    push(rec("0007",
      "0",      // COD_TIP_ENT=0 (própria PJ)
      contNome,
      contCpf,
      "4",      // COD_QUALIF_RESP=4 (contador)
      contCrc,
      contCrc,  // NUMSEQ_ASSINA (reutilizando CRC)
      "1",      // IND_PKI=1 (assinatura digital)
      ""        // HASH
    ),"0007");
  }

  // 0035 — identificação da entidade (estabelecimento único)
  push(rec("0035",cnpj,razao,ie,"SP","","","","","","",""),"0035");

  push(rec("0990",String(linhas.length+1)),"0990");

  // ── BLOCO I — Escrituração ────────────────────────────────────────────────
  push(rec("I001","0"),"I001");

  // I010 — identificação do livro
  push(rec("I010",
    "G",  // IND_LIV=G (Livro Diário com escrituração completa)
    "0",  // IND_SIT_ESP=0
    "",   // NIRE_ANTERIOR
    nire,
    "001",// COD_HASH_ENT
    dtIniF,
    dtFinF,
    "1",  // QTD_LIN
    razao
  ),"I010");

  // I012 — arquivos da escrituração
  push(rec("I012","001","ESCRITURACAO",dtIniF,dtFinF,"I"),"I012");

  // I015 — declaração de completude
  push(rec("I015",
    "1", // IND_DAD_INI=1 (dados completos a partir de zero)
    "",
    "",
    ""
  ),"I015");

  // I020 — versão do plano de contas
  push(rec("I020","0001",dtIniF,dtFinF,String(contas.length),"PLANO DE CONTAS FC ENGENHARIA"),"I020");

  // I050 — plano de contas (uma linha por conta)
  for (const c of contas) {
    const codConta = (c.codigo || String(c.id).padStart(10,"0")).slice(0,20);
    const nivelConta = c.is_group ? "S" : "A"; // S=sintética, A=analítica
    const indDCAcc = c.tipo === "receita" ? "C" : "D";
    push(rec("I050",
      dtIniF,       // DT_INI_CONTA
      dtFinF,       // DT_FIM_CONTA
      codConta,     // COD_CONTA
      nivelConta,   // COD_NAT_CONTA (S/A)
      indDCAcc,     // IND_CTA (D/C)
      "2",          // NIVEL_CTA
      c.nome.slice(0,60), // DESCR_CONTA
      "",           // COD_CONTA_SUPERIOR
      ""            // COD_INCL_EXCL
    ),"I050");
  }

  // I051 — mapeamento conta→plano referencial (mínimo exigido)
  // Para construtoras: omitir por enquanto (PVA aceita mas emite aviso)

  // I052 — descrição das contas (opcional, omitir)

  // I100 — saldo de abertura (simplificado — PVA exige pelo menos uma linha)
  push(rec("I100",
    dtIniF,   // DT_INI
    "0.00",   // VL_SLD_INI
    "0",      // IND_DC_INI
    "0.00",   // VL_SLD_FIN
    "0",      // IND_DC_FIN
    "0001"    // COD_HIST (código padrão)
  ),"I100");

  // I150 — saldos por conta analítica
  for (const l of lancs) {
    if (!l.conta_id) continue;
    const codConta = (l.conta_codigo || String(l.conta_id).padStart(10,"0")).slice(0,20);
    const vlCred   = parseFloat(l.total_credito || "0");
    const vlDeb    = parseFloat(l.total_debito  || "0");
    const saldo    = Math.abs(vlCred - vlDeb);
    const indDCFin = vlCred >= vlDeb ? "C" : "D";
    push(rec("I150",
      dtIniF,           // DT_INI
      dtFinF,           // DT_FIN
      codConta,         // COD_CONTA
      "0.00",           // VL_SLD_INI
      "0",              // IND_DC_INI
      fmtNum(saldo),    // VL_SLD_FIN
      indDCFin          // IND_DC_FIN
    ),"I150");
  }

  // I200 — lançamentos (um por conta/mês agregado)
  let seqLanc = 1;
  for (const l of lancs) {
    if (!l.conta_id) continue;
    const vlCred = parseFloat(l.total_credito || "0");
    const vlDeb  = parseFloat(l.total_debito  || "0");
    const vlTotal= vlCred + vlDeb;
    if (vlTotal === 0) continue;
    const codConta = (l.conta_codigo || String(l.conta_id).padStart(10,"0")).slice(0,20);
    const seqStr   = String(seqLanc++).padStart(8,"0");

    push(rec("I200",
      seqStr,           // NUM_LANC
      dtFinF,           // DT_LANC (data do balancete mensal)
      vlCred>0?"C":"D", // IND_DC
      fmtNum(vlTotal),  // VL_LANC
      "001",            // COD_HIST
      "",               // COD_PART_A
      ""                // IND_DC_A
    ),"I200");

    // I250 — partidas do lançamento
    push(rec("I250",
      seqStr,           // NUM_LANC
      codConta,         // COD_CONTA
      l.conta_nome?.slice(0,100)||"Sem nome",
      vlCred>0?"C":"D", // IND_DC
      fmtNum(vlTotal),  // VL_DC
      "",               // NUM_ARQ_ENT
      ""                // COD_CCUS
    ),"I250");
  }

  push(rec("I990",String(linhas.length - (linhas.findIndex(l=>l.startsWith("|I001|"))+1)+1+1)),"I990");

  // ── BLOCO J — Demonstrações Contábeis ─────────────────────────────────────
  push(rec("J001","0"),"J001");

  // J005 — identificação das demonstrações
  push(rec("J005",
    dtIniF,          // DT_INI
    dtFinF,          // DT_FIN
    "1",             // IND_DEM=1 (demonstrações obrigatórias)
    razao,           // NOME_MOEDA
    "BRL",           // COD_MOEDA
    "0",             // IND_SITUACAO_PJ
    "",              // IND_USO_ECF
    "0"              // IND_CONT_IMOBI
  ),"J005");

  // J100 — Balanço Patrimonial
  // Ativo = saldo das contas de despesa (simplificado)
  // Para um ECD real, seria necessário mapear cada conta ao BP
  push(rec("J100",
    "1.01",           // COD_AGL (classificação padrão ativo circulante)
    "Ativo Total",
    fmtNum(totalDespesa),
    "D",
    fmtNum(totalDespesa),
    "D"
  ),"J100");

  push(rec("J100",
    "2.03",
    "Patrimônio Líquido",
    fmtNum(Math.abs(resultado)),
    resultado >= 0 ? "C" : "D",
    fmtNum(Math.abs(resultado)),
    resultado >= 0 ? "C" : "D"
  ),"J100");

  // J150 — DRE
  push(rec("J150",
    "3.01",           // COD_AGL
    "Receita Bruta de Serviços",
    fmtNum(totalReceita),
    "C",
    fmtNum(totalReceita),
    "C"
  ),"J150");

  push(rec("J150",
    "3.09",
    "Despesas Operacionais",
    fmtNum(totalDespesa),
    "D",
    fmtNum(totalDespesa),
    "D"
  ),"J150");

  push(rec("J150",
    "3.11",
    `${resultado >= 0 ? "Lucro" : "Prejuízo"} Líquido do Período`,
    fmtNum(Math.abs(resultado)),
    resultado >= 0 ? "C" : "D",
    fmtNum(Math.abs(resultado)),
    resultado >= 0 ? "C" : "D"
  ),"J150");

  // J900 — partes (responsáveis pela assinatura)
  if (contNome) {
    push(rec("J900","1",contNome,contCpf,"4",contCrc,"","1"),"J900");
  }

  // J930 — assinatura digital (simplificada)
  push(rec("J930","1",dtFinF,"","1",""),"J930");

  push(rec("J990",String(linhas.length-(linhas.findIndex(l=>l.startsWith("|J001|"))+1)+1+1)),"J990");

  // ── BLOCO K — Razão Auxiliar (sem movimento) ──────────────────────────────
  push(rec("K001","1"),"K001");
  push(rec("K990","2"),"K990");

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

export function registerSpedEcdRoute(app: Express) {
  app.get("/api/download/sped-ecd", async (req: any, res: any) => {
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
      const buf = await buildSpedEcdBuffer(companyId, ano, finalidade as "0"|"1");
      const fin = finalidade === "1" ? "SUB" : "ORI";
      res.setHeader("Content-Type","text/plain; charset=utf-8");
      res.setHeader("Content-Disposition",
        `attachment; filename="SPED_ECD_${companyId}_${ano}_${fin}.txt"`);
      res.send(buf);
    } catch(e:any) {
      console.error("[SpedEcd]", e);
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  });
}
