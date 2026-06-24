/**
 * server/routers/downloadPacoteContador.ts
 * GET /api/download/pacote-contador?companyId=&mes=&ano=
 * Gera um ZIP organizado com todos os documentos mensais/anuais para o contador.
 */
import type { Express, Request, Response } from "express";
import archiver from "archiver";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

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
  return v ?? "";
}

function bom(csv: string): Buffer {
  return Buffer.concat([Buffer.from("\uFEFF", "utf8"), Buffer.from(csv, "utf8")]);
}

function toCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(";")];
  for (const row of rows) lines.push(row.map(esc).join(";"));
  return lines.join("\r\n");
}

async function queryPeriod(db: any, companyId: number, di: string, df: string) {
  const [nfseQ, nfeQ, bankQ, ocQ] = await Promise.all([
    db.$client.query(`
      SELECT numero_nf, tomador_razao_social, tomador_cnpj,
             valor_bruto, valor_liquido, iss_retido, retencao_inss, retencao_irrf,
             retencao_pis_cofins, data_emissao, data_competencia, status
      FROM fiscal_notes
      WHERE company_id = $1 AND data_emissao >= $2 AND data_emissao < $3
        AND origem LIKE 'nfse_%' AND status != 'cancelada'
      ORDER BY data_emissao ASC
    `, [companyId, di, df]),

    db.$client.query(`
      SELECT numero_nf, emitente_cnpj, emitente_nome,
             valor_bruto, data_emissao, status, chave_acesso
      FROM fiscal_notes
      WHERE company_id = $1 AND data_emissao >= $2 AND data_emissao < $3
        AND (origem = 'sefaz_nfe' OR origem = 'xml_upload') AND status != 'cancelada'
      ORDER BY data_emissao ASC
    `, [companyId, di, df]),

    db.$client.query(`
      SELECT bsl.data, bsl.descricao, bsl.valor, bsl.tipo, bsl.conciliado,
        COALESCE(cba.apelido, cba.banco, '') AS conta_nome,
        COALESCE(cba.agencia, '') AS conta_agencia,
        COALESCE(cba.conta, '') AS conta_numero,
        (SELECT fn.numero_nf FROM fiscal_notes fn WHERE fn.stmt_line_id = bsl.id AND fn.company_id = $1 LIMIT 1) AS fn_numero
      FROM bank_statement_lines bsl
      LEFT JOIN company_bank_accounts cba ON cba.id = bsl.conta_bancaria_id
      WHERE bsl.company_id = $1 AND bsl.data >= $2 AND bsl.data < $3
      ORDER BY bsl.tipo DESC, bsl.data ASC
      LIMIT 2000
    `, [companyId, di, df]),

    db.$client.query(`
      SELECT po.numero, po.supplier_nome, po.valor_total, po.status,
             po.created_at, po.obra_nome, po.tipo,
             COALESCE(f.cnpj, '') AS supplier_cnpj,
             COALESCE(f.razao_social, po.supplier_nome, '') AS supplier_razao,
             (SELECT fn.numero_nf FROM fiscal_notes fn
              WHERE fn.emitente_cnpj = f.cnpj AND fn.company_id = $1
                AND fn.data_emissao >= $2 AND fn.data_emissao < $3
                AND fn.status != 'cancelada' LIMIT 1) AS nfe_vinculada
      FROM purchase_orders po
      LEFT JOIN fornecedores f ON f.id = po.supplier_id AND f.company_id = $1
      WHERE po.company_id = $1 AND po.status NOT IN ('cancelada','rascunho')
        AND po.created_at >= $2 AND po.created_at < $3
      ORDER BY po.created_at ASC
      LIMIT 500
    `, [companyId, di, df]),
  ]);

  return {
    nfse: nfseQ.rows as any[],
    nfe:  nfeQ.rows  as any[],
    bank: bankQ.rows as any[],
    ocs:  ocQ.rows   as any[],
  };
}

function buildResumo(label: string, empresa: string, data: ReturnType<typeof buildResumo> extends Promise<infer T> ? T : any, nfse: any[], nfe: any[], bank: any[], ocs: any[]): string {
  const sumV = (arr: any[], f = "valor") => arr.reduce((s, r) => s + Math.abs(parseFloat(r[f] ?? "0")), 0);
  const entradas = bank.filter(b => b.tipo === "credito");
  const saidas   = bank.filter(b => b.tipo === "debito");
  const totNfse  = sumV(nfse, "valor_bruto");
  const totNfe   = sumV(nfe,  "valor_bruto");
  const totEnt   = sumV(entradas);
  const totSai   = sumV(saidas);
  const totOcs   = sumV(ocs, "valor_total");

  const cobNfse  = totEnt  > 0 ? Math.min(100, Math.round(totNfse / totEnt  * 100)) : null;
  const cobOc    = totOcs  > 0 ? Math.round(sumV(ocs.filter(o => o.nfe_vinculada), "valor_total") / totOcs * 100) : null;
  const cobSai   = totSai  > 0 ? Math.round(sumV(saidas.filter(b => b.fn_numero), ) / totSai * 100) : null;

  const rows: string[][] = [
    ["Empresa", empresa],
    ["Competência", label],
    [""],
    ["INDICADOR", "QUANTIDADE", "VALOR (R$)", "COBERTURA NF (%)"],
    ["NFS-e Emitidas", String(nfse.length), fmtBRL(totNfse), cobNfse != null ? `${cobNfse}%` : "—"],
    ["NF-e Recebidas (SEFAZ)", String(nfe.length), fmtBRL(totNfe), "—"],
    ["Entradas Bancárias", String(entradas.length), fmtBRL(totEnt), cobNfse != null ? `${cobNfse}%` : "—"],
    ["Saídas Bancárias",  String(saidas.length),   fmtBRL(totSai), cobSai  != null ? `${cobSai}%`  : "—"],
    ["Ordens de Compra",  String(ocs.length),       fmtBRL(totOcs), cobOc   != null ? `${cobOc}%`   : "—"],
  ];
  return toCsv(["Campo", "Valor", "Valor2", "Cobertura"], rows);
}

function buildNfse(rows: any[]): string {
  return toCsv(
    ["NF#","Tomador","CNPJ Tomador","Valor Bruto","Valor Líquido","ISS Retido","INSS Retido","IRRF Retido","PIS/COFINS Ret.","Emissão","Competência","Status"],
    rows.map(n => [
      n.numero_nf ?? "", n.tomador_razao_social ?? "", fmtCnpj(n.tomador_cnpj),
      fmtBRL(n.valor_bruto), fmtBRL(n.valor_liquido),
      fmtBRL(n.iss_retido), fmtBRL(n.retencao_inss), fmtBRL(n.retencao_irrf), fmtBRL(n.retencao_pis_cofins),
      fmtDate(n.data_emissao), fmtDate(n.data_competencia), n.status ?? "",
    ])
  );
}

function buildNfe(rows: any[]): string {
  return toCsv(
    ["NF#","Emitente","CNPJ Emitente","Valor Bruto","Emissão","Status","Chave de Acesso"],
    rows.map(n => [
      n.numero_nf ?? "", n.emitente_nome ?? "", fmtCnpj(n.emitente_cnpj),
      fmtBRL(n.valor_bruto), fmtDate(n.data_emissao), n.status ?? "", n.chave_acesso ?? "",
    ])
  );
}

function buildExtrato(rows: any[], tipo: "credito" | "debito"): string {
  const filtered = rows.filter(b => b.tipo === tipo);
  return toCsv(
    ["Data","Conta","Agência","Nº Conta","Descrição","Valor","Conciliado","NF Vinculada"],
    filtered.map(b => [
      fmtDate(b.data), b.conta_nome ?? "", b.conta_agencia ?? "", b.conta_numero ?? "",
      b.descricao ?? "", fmtBRL(b.valor),
      b.conciliado ? "Sim" : "Não", b.fn_numero ?? "—",
    ])
  );
}

function buildOcs(rows: any[]): string {
  return toCsv(
    ["OC#","Fornecedor","CNPJ","Valor Total","Obra","Tipo","Status","Criado em","NF-e Vinculada"],
    rows.map(o => [
      o.numero ?? "", o.supplier_razao ?? o.supplier_nome ?? "", fmtCnpj(o.supplier_cnpj),
      fmtBRL(o.valor_total), o.obra_nome ?? "", o.tipo ?? "", o.status ?? "",
      fmtDate(o.created_at), o.nfe_vinculada ?? "—",
    ])
  );
}

function buildChecklist(label: string, empresa: string, nfse: any[], nfe: any[], bank: any[], ocs: any[]): Buffer {
  const entSemNF = bank.filter(b => b.tipo === "credito" && !b.fn_numero).length;
  const saiSemNF = bank.filter(b => b.tipo === "debito"  && !b.fn_numero).length;
  const ocsSemNf = ocs.filter(o => !o.nfe_vinculada).length;
  const lines = [
    `═══════════════════════════════════════════════════════════`,
    `  CHECKLIST FISCAL — ${label}`,
    `  Empresa: ${empresa}`,
    `  Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    `═══════════════════════════════════════════════════════════`,
    ``,
    `📂 ARQUIVOS NESTE PACOTE:`,
    `  01_Resumo.csv                — Indicadores e coberturas`,
    `  02_NFS-e_Emitidas.csv        — Notas de serviço emitidas`,
    `  03_NF-e_Recebidas_SEFAZ.csv  — NF-e de fornecedores`,
    `  04_OCs_x_NF-e.csv            — Ordens de compra × notas`,
    `  05_Extrato_Entradas.csv       — Créditos bancários`,
    `  06_Extrato_Saidas.csv         — Débitos bancários`,
    ``,
    `📊 RESUMO:`,
    `  • NFS-e emitidas:       ${nfse.length} notas`,
    `  • NF-e recebidas:       ${nfe.length} notas`,
    `  • Entradas bancárias:   ${bank.filter(b=>b.tipo==="credito").length} lançamentos`,
    `  • Saídas bancárias:     ${bank.filter(b=>b.tipo==="debito").length} lançamentos`,
    `  • Ordens de compra:     ${ocs.length} OCs`,
    ``,
    `⚠️  PENDÊNCIAS:`,
    entSemNF  > 0 ? `  • ${entSemNF} entrada(s) SEM NFS-e vinculada — verificar nota de serviço` : `  ✓ Todas as entradas com NFS-e`,
    saiSemNF  > 0 ? `  • ${saiSemNF} saída(s) SEM NF-e vinculada — solicitar nota ao fornecedor`   : `  ✓ Todas as saídas com NF-e`,
    ocsSemNf  > 0 ? `  • ${ocsSemNf} OC(s) SEM NF-e correspondente — cobrar nota do fornecedor`    : `  ✓ Todas as OCs com NF-e`,
    ``,
    `📋 DOCUMENTOS MENSAIS A ENTREGAR AO CONTADOR:`,
    `  □ Extrato bancário completo do mês (PDF do banco)`,
    `  □ NFS-e emitidas — conferir valores e retenções`,
    `  □ NF-e dos fornecedores — conferir CNPJ e valores`,
    `  □ Guia de ISS recolhido`,
    `  □ Guia de INSS (se houver retenção)`,
    `  □ Guia de IRRF (se houver retenção)`,
    `  □ Folha de pagamento assinada`,
    `  □ Holerites dos funcionários`,
    `  □ Comprovantes de pagamento FGTS (GFIP/eSocial)`,
    `  □ Comprovante de pagamento GPS (INSS empregador)`,
    ``,
    `📋 DOCUMENTOS TRIMESTRAIS:`,
    `  □ DCTF (Declaração de Débitos e Créditos Tributários Federais)`,
    `  □ Balancete trimestral`,
    `  □ Relatório de pró-labore`,
    ``,
    `📋 DOCUMENTOS ANUAIS:`,
    `  □ DIRF (Declaração do Imposto de Renda Retido na Fonte)`,
    `  □ RAIS`,
    `  □ SPED Contábil`,
    `  □ SPED Fiscal (EFD-ICMS/IPI ou EFD-PIS/COFINS)`,
    `  □ Balanço Patrimonial e DRE`,
    `  □ Livro Caixa (se for Simples Nacional / Lucro Presumido)`,
    `  □ Declaração de Imposto de Renda Pessoa Jurídica (ECF)`,
    ``,
    `═══════════════════════════════════════════════════════════`,
  ];
  return Buffer.from(lines.join("\n"), "utf8");
}

export function registerPacoteContadorRoute(app: Express) {
  app.get("/api/download/pacote-contador", async (req: Request, res: Response) => {
    try {
      let user: any;
      try { user = await sdk.authenticateRequest(req); }
      catch { res.status(401).json({ error: "Não autenticado" }); return; }

      const companyId = parseInt(String(req.query.companyId ?? ""));
      const mes       = parseInt(String(req.query.mes ?? "0"));
      const ano       = parseInt(String(req.query.ano ?? new Date().getFullYear()));

      if (isNaN(companyId) || isNaN(mes) || isNaN(ano)) {
        res.status(400).json({ error: "Parâmetros inválidos" }); return;
      }

      const db = await getDb();

      // Busca nome da empresa
      const empQ = await db.$client.query(
        `SELECT nome, razao_social FROM companies WHERE id = $1`, [companyId]
      );
      const empresa = empQ.rows[0]?.razao_social || empQ.rows[0]?.nome || `Empresa ${companyId}`;

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", (err) => {
        console.error("[PacoteContador] Erro ZIP:", err);
        if (!res.headersSent) res.status(500).json({ error: "Erro ao gerar ZIP" });
      });

      // Modos: mês específico ou ano todo
      if (mes >= 1 && mes <= 12) {
        // ── Pacote mensal ──────────────────────────────────────────────────
        const label = `${MESES[mes - 1]} ${ano}`;
        const di = `${ano}-${String(mes).padStart(2, "0")}-01`;
        const mesProx = mes === 12 ? 1 : mes + 1;
        const anoProx = mes === 12 ? ano + 1 : ano;
        const df = `${anoProx}-${String(mesProx).padStart(2, "0")}-01`;

        const { nfse, nfe, bank, ocs } = await queryPeriod(db, companyId, di, df);
        const folder = `${String(mes).padStart(2,"0")}_${MESES[mes-1]}_${ano}`;

        archive.append(buildChecklist(label, empresa, nfse, nfe, bank, ocs), { name: `${folder}/00_CHECKLIST.txt` });
        archive.append(bom(buildResumo(label, empresa, null as any, nfse, nfe, bank, ocs)), { name: `${folder}/01_Resumo.csv` });
        archive.append(bom(buildNfse(nfse)),             { name: `${folder}/02_NFS-e_Emitidas.csv` });
        archive.append(bom(buildNfe(nfe)),               { name: `${folder}/03_NF-e_Recebidas_SEFAZ.csv` });
        archive.append(bom(buildOcs(ocs)),               { name: `${folder}/04_OCs_x_NF-e.csv` });
        archive.append(bom(buildExtrato(bank,"credito")),{ name: `${folder}/05_Extrato_Entradas.csv` });
        archive.append(bom(buildExtrato(bank,"debito")), { name: `${folder}/06_Extrato_Saidas.csv` });

        const filename = `Pacote_Contador_${MESES[mes-1]}_${ano}.zip`;
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        archive.pipe(res);

      } else {
        // ── Pacote anual: uma pasta por mês ────────────────────────────────
        for (let m = 1; m <= 12; m++) {
          const label = `${MESES[m - 1]} ${ano}`;
          const di = `${ano}-${String(m).padStart(2, "0")}-01`;
          const mProx = m === 12 ? 1 : m + 1;
          const aProx = m === 12 ? ano + 1 : ano;
          const df = `${aProx}-${String(mProx).padStart(2, "0")}-01`;

          const { nfse, nfe, bank, ocs } = await queryPeriod(db, companyId, di, df);
          if (nfse.length + nfe.length + bank.length + ocs.length === 0) continue;

          const folder = `${String(m).padStart(2,"0")}_${MESES[m-1]}`;

          archive.append(buildChecklist(label, empresa, nfse, nfe, bank, ocs), { name: `${folder}/00_CHECKLIST.txt` });
          archive.append(bom(buildResumo(label, empresa, null as any, nfse, nfe, bank, ocs)), { name: `${folder}/01_Resumo.csv` });
          archive.append(bom(buildNfse(nfse)),             { name: `${folder}/02_NFS-e_Emitidas.csv` });
          archive.append(bom(buildNfe(nfe)),               { name: `${folder}/03_NF-e_Recebidas_SEFAZ.csv` });
          archive.append(bom(buildOcs(ocs)),               { name: `${folder}/04_OCs_x_NF-e.csv` });
          archive.append(bom(buildExtrato(bank,"credito")),{ name: `${folder}/05_Extrato_Entradas.csv` });
          archive.append(bom(buildExtrato(bank,"debito")), { name: `${folder}/06_Extrato_Saidas.csv` });
        }

        const filename = `Pacote_Contador_Anual_${ano}.zip`;
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        archive.pipe(res);
      }

      await archive.finalize();
    } catch (err) {
      console.error("[PacoteContador] Erro geral:", err);
      if (!res.headersSent) res.status(500).json({ error: "Erro interno ao gerar pacote" });
    }
  });
}
