/**
 * server/routers/downloadPacoteContador.ts
 * GET /api/download/pacote-contador?companyId=&mes=&ano=
 *
 * Gera ZIP no padrão solicitado pela contabilidade (Pronus):
 *
 *   FC_Engenharia_Jun_2026/
 *   ├── Faturas_Emitidas/           → espelho HTML por NFS-e + lista CSV
 *   ├── Servicos_Tomados/           → espelho HTML por NFS-e tomada + lista CSV
 *   ├── Extratos_Bancarios/         → 1 XLSX por conta + CSV geral
 *   ├── Extratos_Cartoes/           → CSV de lançamentos de cartão
 *   └── 00_CHECKLIST.txt / 01_Resumo.csv / 02_OCs.csv
 */
import type { Express, Request, Response } from "express";
import archiver from "archiver";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { buildExtratoBancarioBuffer } from "./downloadContabilidadeXlsx";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho",
  "Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ── Formatadores ──────────────────────────────────────────────────────────────
function fmtBRL(v: any): string {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(s: any): string {
  if (!s) return "";
  const str = String(s).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str.split("-").reverse().join("/");
  return str;
}
function fmtCnpj(v: any): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return String(v ?? "");
}
function bom(csv: string): Buffer {
  return Buffer.concat([Buffer.from("\uFEFF", "utf8"), Buffer.from(csv, "utf8")]);
}
function toCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.map(esc).join(";"), ...rows.map(r => r.map(esc).join(";"))].join("\r\n");
}
function safeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9À-ÿ\s\-_.]/g, "").replace(/\s+/g, "_").slice(0, 60);
}

// ── Queries ───────────────────────────────────────────────────────────────────
async function queryData(db: any, companyId: number, di: string, df: string) {
  const [nfseQ, nfeTomadaQ, nfeQ, bankQ, ocQ, cartaoQ] = await Promise.all([
    // NFS-e emitidas (a empresa presta serviço)
    db.$client.query(`
      SELECT id, numero_nf, tomador_razao_social, tomador_cnpj,
             valor_bruto, valor_liquido, iss_retido, retencao_inss, retencao_irrf,
             retencao_pis_cofins, data_emissao, data_competencia, status,
             descricao_servico, cd_lista_servico, aliquota_iss, xml_payload
      FROM fiscal_notes
      WHERE company_id = $1 AND data_emissao >= $2 AND data_emissao < $3
        AND origem NOT LIKE '%tomada%'
        AND origem NOT IN ('sefaz_nfe','xml_upload')
        AND status != 'cancelada'
      ORDER BY data_emissao ASC
    `, [companyId, di, df]),

    // NFS-e tomadas (empresa toma serviço de terceiros)
    db.$client.query(`
      SELECT id, numero_nf, emitente_nome, emitente_cnpj,
             valor_bruto, valor_liquido, iss_retido, retencao_inss, retencao_irrf,
             retencao_pis_cofins, data_emissao, data_competencia, status,
             descricao_servico, xml_payload
      FROM fiscal_notes
      WHERE company_id = $1 AND data_emissao >= $2 AND data_emissao < $3
        AND origem LIKE '%tomada%' AND status != 'cancelada'
      ORDER BY data_emissao ASC
    `, [companyId, di, df]),

    // NF-e recebidas do SEFAZ (compras de produtos)
    db.$client.query(`
      SELECT numero_nf, emitente_cnpj, emitente_nome,
             valor_bruto, data_emissao, status, chave_acesso
      FROM fiscal_notes
      WHERE company_id = $1 AND data_emissao >= $2 AND data_emissao < $3
        AND (origem = 'sefaz_nfe' OR origem = 'xml_upload') AND status != 'cancelada'
      ORDER BY data_emissao ASC
    `, [companyId, di, df]),

    // Extrato bancário (contas correntes)
    db.$client.query(`
      SELECT bsl.id, bsl.data, bsl.descricao, bsl.valor::float AS valor, bsl.tipo, bsl.conciliado,
             bsl.entry_id, bsl.conta_bancaria_id,
             COALESCE(cba.apelido, cba.banco, '') AS conta_nome,
             COALESCE(cba.agencia, '') AS conta_agencia,
             COALESCE(cba.conta, '') AS conta_numero,
             cba.banco, cba."tipoConta",
             COALESCE(fn.numero_nf, '') AS fn_numero,
             fe.fornecedor_nome,
             COALESCE(fn.emitente_cnpj, fn.tomador_cnpj, '') AS fornecedor_cnpj
      FROM bank_statement_lines bsl
      LEFT JOIN company_bank_accounts cba ON cba.id = bsl.conta_bancaria_id
      LEFT JOIN financial_entries fe ON fe.id = bsl.entry_id
      LEFT JOIN fiscal_notes fn ON fn.stmt_line_id = bsl.id
      WHERE bsl.company_id = $1 AND bsl.data >= $2 AND bsl.data < $3
        AND bsl.excluido_em IS NULL
        AND COALESCE(cba."tipoConta", 'corrente') NOT ILIKE '%cartao%'
      ORDER BY bsl.data ASC, bsl.id ASC
      LIMIT 5000
    `, [companyId, di, df]),

    // Ordens de compra
    db.$client.query(`
      SELECT co.numero_oc AS numero,
             COALESCE(f.razao_social, co.fornecedor_nome, '') AS supplier_razao,
             co.total AS valor_total, co.status, co.created_at,
             COALESCE(o.nome, '') AS obra_nome,
             COALESCE(co.tipo, 'compra') AS tipo,
             COALESCE(f.cnpj, '') AS supplier_cnpj,
             (SELECT fn.numero_nf FROM fiscal_notes fn
              WHERE fn.emitente_cnpj = COALESCE(f.cnpj, '') AND fn.company_id = $1
                AND fn.data_emissao >= $2 AND fn.data_emissao < $3
                AND fn.status != 'cancelada' LIMIT 1) AS nfe_vinculada
      FROM compras_ordens co
      LEFT JOIN fornecedores f ON f.id = co.fornecedor_id AND f.company_id = $1
      LEFT JOIN obras o ON o.id = co.obra_id
      WHERE co.company_id = $1 AND co.status NOT IN ('cancelada','rascunho')
        AND co.created_at >= $2 AND co.created_at < $3
      ORDER BY co.created_at ASC LIMIT 500
    `, [companyId, di, df]),

    // Cartão de crédito (contas tipoConta ilike cartao)
    db.$client.query(`
      SELECT bsl.data, bsl.descricao, bsl.valor::float AS valor, bsl.conciliado,
             COALESCE(cba.apelido, cba.banco, '') AS conta_nome, cba.banco,
             COALESCE(fn.numero_nf, '') AS fn_numero, fe.fornecedor_nome
      FROM bank_statement_lines bsl
      LEFT JOIN company_bank_accounts cba ON cba.id = bsl.conta_bancaria_id
      LEFT JOIN financial_entries fe ON fe.id = bsl.entry_id
      LEFT JOIN fiscal_notes fn ON fn.stmt_line_id = bsl.id
      WHERE bsl.company_id = $1 AND bsl.data >= $2 AND bsl.data < $3
        AND bsl.excluido_em IS NULL
        AND cba."tipoConta" ILIKE '%cartao%'
      ORDER BY bsl.data ASC, bsl.id ASC
    `, [companyId, di, df]),
  ]);

  return {
    nfseEmitidas: nfseQ.rows     as any[],
    nfseTomadas:  nfeTomadaQ.rows as any[],
    nfe:          nfeQ.rows       as any[],
    bank:         bankQ.rows      as any[],
    ocs:          ocQ.rows        as any[],
    cartao:       cartaoQ.rows    as any[],
  };
}

// ── HTML espelho NFS-e ────────────────────────────────────────────────────────
function buildNfseHtml(n: any, tipo: "emitida" | "tomada", empresa: string): Buffer {
  const numero   = n.numero_nf  || "—";
  const parte    = tipo === "emitida"
    ? `<tr><td>Tomador</td><td>${n.tomador_razao_social || "—"}</td></tr>
       <tr><td>CNPJ Tomador</td><td>${fmtCnpj(n.tomador_cnpj)}</td></tr>`
    : `<tr><td>Prestador</td><td>${n.emitente_nome || "—"}</td></tr>
       <tr><td>CNPJ Prestador</td><td>${fmtCnpj(n.emitente_cnpj)}</td></tr>`;

  const retencoes = [
    n.iss_retido         ? `ISS Retido: ${fmtBRL(n.iss_retido)}` : "",
    n.retencao_inss      ? `INSS Ret.: ${fmtBRL(n.retencao_inss)}` : "",
    n.retencao_irrf      ? `IRRF Ret.: ${fmtBRL(n.retencao_irrf)}` : "",
    n.retencao_pis_cofins? `PIS/COFINS Ret.: ${fmtBRL(n.retencao_pis_cofins)}` : "",
  ].filter(Boolean).join(" &nbsp;|&nbsp; ") || "Sem retenções";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>NFS-e ${numero}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:720px;margin:32px auto;color:#1a1a1a}
  h1{font-size:18px;text-align:center;margin-bottom:4px;color:#1e3a5f}
  .sub{text-align:center;color:#666;font-size:12px;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  tr:nth-child(even){background:#f5f8ff}
  td{padding:6px 10px;border:1px solid #dde5f0}
  td:first-child{font-weight:bold;width:38%;color:#1e3a5f;background:#eef3fc}
  .box{background:#f0f7ff;border:1px solid #b3cde8;border-radius:6px;padding:14px;margin:16px 0}
  .total{font-size:16px;font-weight:bold;color:#1e3a5f}
  .liq{font-size:14px;color:#2e7d32}
  .ret{font-size:12px;color:#666;margin-top:4px}
  .tipo-badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:bold;
    background:${tipo==="emitida"?"#e8f5e9":"#fff3e0"};color:${tipo==="emitida"?"#2e7d32":"#e65100"}}
  @media print{body{margin:16px}}
</style>
</head>
<body>
<h1>NOTA FISCAL DE SERVIÇOS ELETRÔNICA</h1>
<p class="sub">
  <span class="tipo-badge">${tipo === "emitida" ? "EMITIDA" : "TOMADA"}</span>
  &nbsp; NFS-e Nº ${numero} &nbsp;|&nbsp; ${empresa}
</p>
<table>
  <tr><td>Data de Emissão</td><td>${fmtDate(n.data_emissao)}</td></tr>
  <tr><td>Competência</td><td>${fmtDate(n.data_competencia)}</td></tr>
  ${parte}
  <tr><td>Descrição do Serviço</td><td>${n.descricao_servico || "—"}</td></tr>
  <tr><td>Código do Serviço</td><td>${n.cd_lista_servico || "—"}</td></tr>
  ${n.aliquota_iss ? `<tr><td>Alíquota ISS</td><td>${n.aliquota_iss}%</td></tr>` : ""}
  <tr><td>Status</td><td>${n.status || "—"}</td></tr>
</table>
<div class="box">
  <div class="total">Valor Bruto: ${fmtBRL(n.valor_bruto)}</div>
  <div class="liq">Valor Líquido: ${fmtBRL(n.valor_liquido || n.valor_bruto)}</div>
  <div class="ret">${retencoes}</div>
</div>
<p style="font-size:11px;color:#aaa;text-align:center;margin-top:32px">
  Documento gerado pelo ERP FC Engenharia em ${new Date().toLocaleString("pt-BR")} · Para impressão em PDF, use Ctrl+P → Salvar como PDF
</p>
</body></html>`;
  return Buffer.from(html, "utf8");
}

// ── CSV builders ──────────────────────────────────────────────────────────────
function buildNfseCsv(rows: any[], tipo: "emitida" | "tomada"): string {
  const headers = tipo === "emitida"
    ? ["NF#","Tomador","CNPJ Tomador","Valor Bruto","Valor Líquido","ISS Ret.","INSS Ret.","IRRF Ret.","PIS/COF Ret.","Emissão","Competência","Status"]
    : ["NF#","Prestador","CNPJ Prestador","Valor Bruto","Valor Líquido","ISS Ret.","INSS Ret.","IRRF Ret.","PIS/COF Ret.","Emissão","Competência","Status"];

  return toCsv(headers, rows.map(n => [
    n.numero_nf ?? "",
    (tipo === "emitida" ? n.tomador_razao_social : n.emitente_nome) ?? "",
    fmtCnpj(tipo === "emitida" ? n.tomador_cnpj : n.emitente_cnpj),
    fmtBRL(n.valor_bruto), fmtBRL(n.valor_liquido),
    fmtBRL(n.iss_retido), fmtBRL(n.retencao_inss),
    fmtBRL(n.retencao_irrf), fmtBRL(n.retencao_pis_cofins),
    fmtDate(n.data_emissao), fmtDate(n.data_competencia), n.status ?? "",
  ]));
}

function buildNfeCsv(rows: any[]): string {
  return toCsv(
    ["NF#","Emitente","CNPJ Emitente","Valor Bruto","Emissão","Status","Chave de Acesso"],
    rows.map(n => [
      n.numero_nf ?? "", n.emitente_nome ?? "", fmtCnpj(n.emitente_cnpj),
      fmtBRL(n.valor_bruto), fmtDate(n.data_emissao), n.status ?? "", n.chave_acesso ?? "",
    ])
  );
}

function buildExtratoGralCsv(rows: any[]): string {
  return toCsv(
    ["Data","Conta","Agência","Nº Conta","Descrição","Histórico Real","Valor","Tipo","Conciliado","NF Vinculada"],
    rows.map(b => [
      fmtDate(b.data), b.conta_nome ?? "", b.conta_agencia ?? "", b.conta_numero ?? "",
      b.descricao ?? "", b.fornecedor_nome ?? "", fmtBRL(b.valor),
      b.tipo === "credito" ? "Entrada" : "Saída",
      b.conciliado ? "Sim" : "Não", b.fn_numero ?? "—",
    ])
  );
}

function buildCartaoCsv(rows: any[]): string {
  if (rows.length === 0) {
    return toCsv(["Informação"], [["Não há lançamentos de cartão de crédito no período."]]);
  }
  return toCsv(
    ["Data","Cartão","Descrição","Fornecedor","Valor","Conciliado","NF Vinculada"],
    rows.map(b => [
      fmtDate(b.data), b.conta_nome ?? b.banco ?? "", b.descricao ?? "",
      b.fornecedor_nome ?? "", fmtBRL(b.valor),
      b.conciliado ? "Sim" : "Não", b.fn_numero ?? "—",
    ])
  );
}

function buildOcsCsv(rows: any[]): string {
  return toCsv(
    ["OC#","Fornecedor","CNPJ","Valor Total","Obra","Tipo","Status","Criado em","NF-e Vinculada"],
    rows.map(o => [
      o.numero ?? "", o.supplier_razao ?? "", fmtCnpj(o.supplier_cnpj),
      fmtBRL(o.valor_total), o.obra_nome ?? "", o.tipo ?? "", o.status ?? "",
      fmtDate(o.created_at), o.nfe_vinculada ?? "—",
    ])
  );
}

function buildChecklist(label: string, empresa: string, d: ReturnType<typeof sumarizar>): Buffer {
  const { nfseEmitidas, nfseTomadas, nfe, bank, ocs, cartao } = d;
  const entSemNF = bank.filter(b => b.tipo === "credito" && !b.fn_numero).length;
  const saiSemNF = bank.filter(b => b.tipo === "debito"  && !b.fn_numero).length;
  const ocsSemNF = ocs.filter(o => !o.nfe_vinculada).length;

  const lines = [
    `═══════════════════════════════════════════════════════════`,
    `  PACOTE CONTABILIDADE — ${label}`,
    `  Empresa: ${empresa}`,
    `  Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    `═══════════════════════════════════════════════════════════`,
    ``,
    `📂 ESTRUTURA DO PACOTE:`,
    `  Faturas_Emitidas/          → NFS-e emitidas (espelho HTML + lista CSV)`,
    `  Servicos_Tomados/          → NFS-e tomadas (espelho HTML + lista CSV)`,
    `  Extratos_Bancarios/        → Planilha XLSX por banco + CSV geral`,
    `  Extratos_Cartoes/          → Lançamentos de cartão de crédito`,
    `  02_OCs_NF-e.csv            → Ordens de compra × NF-e`,
    ``,
    `📊 RESUMO DO PERÍODO:`,
    `  • NFS-e emitidas (faturas): ${nfseEmitidas.length} notas`,
    `  • NFS-e tomadas (serviços): ${nfseTomadas.length} notas`,
    `  • NF-e recebidas (compras): ${nfe.length} notas`,
    `  • Entradas bancárias:       ${bank.filter(b=>b.tipo==="credito").length} lançamentos`,
    `  • Saídas bancárias:         ${bank.filter(b=>b.tipo==="debito").length} lançamentos`,
    `  • Lançamentos cartão:       ${cartao.length}`,
    `  • Ordens de compra:         ${ocs.length}`,
    ``,
    `⚠️  PENDÊNCIAS:`,
    entSemNF > 0 ? `  • ${entSemNF} entrada(s) SEM NFS-e vinculada` : `  ✓ Entradas OK`,
    saiSemNF > 0 ? `  • ${saiSemNF} saída(s) SEM NF-e vinculada`   : `  ✓ Saídas OK`,
    ocsSemNF > 0 ? `  • ${ocsSemNF} OC(s) SEM NF-e correspondente` : `  ✓ OCs OK`,
    ``,
    `📋 ENVIAR À PRONUS (contabil@pronustributario.com.br):`,
    `  □ Este ZIP completo`,
    `  □ Guia de ISS recolhido (gerada no portal da prefeitura)`,
    `  □ Folha de pagamento assinada + holerites`,
    `  □ Comprovantes de pagamento FGTS/GPS`,
    ``,
    `═══════════════════════════════════════════════════════════`,
  ];
  return Buffer.from(lines.join("\n"), "utf8");
}

function sumarizar(data: Awaited<ReturnType<typeof queryData>>) { return data; }

// ── Rota principal ────────────────────────────────────────────────────────────
export function registerPacoteContadorRoute(app: Express) {
  app.get("/api/download/pacote-contador", async (req: Request, res: Response) => {
    try {
      let user: any;
      try { user = await sdk.authenticateRequest(req); }
      catch { res.status(401).json({ error: "Não autenticado" }); return; }

      const companyId = parseInt(String(req.query.companyId ?? ""));
      const mes       = parseInt(String(req.query.mes ?? "0"));
      const ano       = parseInt(String(req.query.ano ?? new Date().getFullYear()));

      if (isNaN(companyId) || isNaN(ano)) {
        res.status(400).json({ error: "Parâmetros inválidos" }); return;
      }

      const db = await getDb();
      const empQ = await db.$client.query(
        `SELECT "razaoSocial", "nomeFantasia" FROM companies WHERE id = $1`, [companyId]
      );
      const empresa = empQ.rows[0]?.razaoSocial || empQ.rows[0]?.nomeFantasia || `Empresa ${companyId}`;

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", (err: any) => {
        console.error("[PacoteContador] Erro ZIP:", err);
        if (!res.headersSent) res.status(500).json({ error: "Erro ao gerar ZIP" });
      });

      const processarMes = async (m: number, rootFolder: string) => {
        const di = `${ano}-${String(m).padStart(2,"0")}-01`;
        const mProx = m === 12 ? 1 : m + 1;
        const aProx = m === 12 ? ano + 1 : ano;
        const df = `${aProx}-${String(mProx).padStart(2,"0")}-01`;
        const label = `${MESES[m-1]} ${ano}`;

        const data = await queryData(db, companyId, di, df);
        const { nfseEmitidas, nfseTomadas, nfe, bank, ocs, cartao } = data;
        const total = nfseEmitidas.length + nfseTomadas.length + nfe.length + bank.length + ocs.length;
        if (total === 0) return;

        const f = rootFolder;

        // ── 00_CHECKLIST ──────────────────────────────────────────────────────
        archive.append(buildChecklist(label, empresa, data), { name: `${f}/00_CHECKLIST.txt` });

        // ── Faturas Emitidas ──────────────────────────────────────────────────
        for (const n of nfseEmitidas) {
          const nome = safeName(`NFS-e_${n.numero_nf || n.id}_${n.tomador_razao_social || "SemNome"}`);
          archive.append(buildNfseHtml(n, "emitida", empresa), { name: `${f}/Faturas_Emitidas/${nome}.html` });
        }
        if (nfseEmitidas.length > 0) {
          archive.append(bom(buildNfseCsv(nfseEmitidas, "emitida")), { name: `${f}/Faturas_Emitidas/Lista_Faturas_Emitidas.csv` });
        } else {
          archive.append(Buffer.from("Nenhuma NFS-e emitida no período.\n","utf8"), { name: `${f}/Faturas_Emitidas/sem_dados.txt` });
        }

        // ── Serviços Tomados ──────────────────────────────────────────────────
        for (const n of nfseTomadas) {
          const nome = safeName(`NFS-e_${n.numero_nf || n.id}_${n.emitente_nome || "SemNome"}`);
          archive.append(buildNfseHtml(n, "tomada", empresa), { name: `${f}/Servicos_Tomados/${nome}.html` });
        }
        if (nfseTomadas.length > 0) {
          archive.append(bom(buildNfseCsv(nfseTomadas, "tomada")), { name: `${f}/Servicos_Tomados/Lista_Servicos_Tomados.csv` });
        }
        if (nfe.length > 0) {
          archive.append(bom(buildNfeCsv(nfe)), { name: `${f}/Servicos_Tomados/NF-e_Recebidas_Compras.csv` });
        }
        if (nfseTomadas.length + nfe.length === 0) {
          archive.append(Buffer.from("Nenhuma NFS-e tomada ou NF-e recebida no período.\n","utf8"), { name: `${f}/Servicos_Tomados/sem_dados.txt` });
        }

        // ── Extratos Bancários ────────────────────────────────────────────────
        try {
          const xlsxBuf = await buildExtratoBancarioBuffer(db, companyId, m, ano, empresa);
          archive.append(xlsxBuf, { name: `${f}/Extratos_Bancarios/Extrato_Bancario_${MESES[m-1]}_${ano}.xlsx` });
        } catch (e: any) {
          console.error("[PacoteContador] XLSX bancário erro:", e.message);
        }
        if (bank.length > 0) {
          archive.append(bom(buildExtratoGralCsv(bank)), { name: `${f}/Extratos_Bancarios/Extrato_Completo.csv` });
        } else {
          archive.append(Buffer.from("Nenhum extrato bancário importado no período.\n","utf8"), { name: `${f}/Extratos_Bancarios/sem_dados.txt` });
        }

        // ── Extratos Cartões ──────────────────────────────────────────────────
        archive.append(bom(buildCartaoCsv(cartao)), { name: `${f}/Extratos_Cartoes/Extrato_Cartao_${MESES[m-1]}_${ano}.csv` });

        // ── Compras / OCs ─────────────────────────────────────────────────────
        if (ocs.length > 0) {
          archive.append(bom(buildOcsCsv(ocs)), { name: `${f}/02_OCs_NF-e.csv` });
        }
      };

      if (mes >= 1 && mes <= 12) {
        // Pacote mensal
        const folder = `${safeName(empresa)}_${MESES[mes-1]}_${ano}`;
        await processarMes(mes, folder);
        const filename = `Pacote_Contador_${MESES[mes-1]}_${ano}.zip`;
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        archive.pipe(res);
      } else {
        // Pacote anual
        for (let m = 1; m <= 12; m++) {
          await processarMes(m, `${String(m).padStart(2,"0")}_${MESES[m-1]}`);
        }
        const filename = `Pacote_Contador_Anual_${ano}.zip`;
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        archive.pipe(res);
      }

      await archive.finalize();
    } catch (err: any) {
      console.error("[PacoteContador] Erro geral:", err);
      if (!res.headersSent) res.status(500).json({ error: "Erro interno ao gerar pacote" });
    }
  });
}
