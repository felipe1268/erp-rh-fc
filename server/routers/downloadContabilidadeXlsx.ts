/**
 * server/routers/downloadContabilidadeXlsx.ts
 * GET /api/download/contabilidade-xlsx?companyId=&mes=&ano=
 *
 * Gera planilha xlsx no formato do contador — 1 aba por conta bancária — com:
 * Data | Histórico do Banco | Histórico Real | Nº Nota Fiscal | Nº CNPJ | Entrada | Saída | Saldo
 *
 * Fonte: bank_statement_lines + LEFT JOIN financial_entries (para NF, CNPJ, nome real).
 * Saldo inicial: financial_opening_balances (se existir) ou 0.
 */
import type { Express, Request, Response } from "express";
import * as XLSX from "xlsx";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho",
  "Agosto","Setembro","Outubro","Novembro","Dezembro"];

function excelDate(dateStr: string): number {
  // Converts YYYY-MM-DD to Excel serial date number
  const d = new Date(dateStr + "T00:00:00Z");
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return Math.floor((d.getTime() - epoch.getTime()) / 86400000);
}

function fmtDate(s: any): string {
  if (!s) return "";
  // pg retorna colunas DATE como objetos Date (meia-noite UTC) — usar UTC para evitar off-by-one de timezone
  if (s instanceof Date) {
    const d = String(s.getUTCDate()).padStart(2, "0");
    const m = String(s.getUTCMonth() + 1).padStart(2, "0");
    const y = s.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }
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

/** Trunca nome da aba para 31 chars (limite do Excel) */
function sheetName(banco: string, desc: string): string {
  const full = [banco, desc].filter(Boolean).join(" - ");
  return full.length > 31 ? full.slice(0, 31) : full;
}

export function registerContabilidadeXlsxRoute(app: Express) {
  app.get("/api/download/contabilidade-xlsx", async (req: Request, res: Response) => {
    try {
      let user: any;
      try { user = await sdk.authenticateRequest(req); }
      catch { res.status(401).json({ error: "Não autenticado" }); return; }

      const companyId = parseInt(String(req.query.companyId ?? ""));
      const mes       = parseInt(String(req.query.mes ?? "0"));
      const ano       = parseInt(String(req.query.ano ?? new Date().getFullYear()));

      if (isNaN(companyId) || isNaN(mes) || mes < 1 || mes > 12 || isNaN(ano)) {
        res.status(400).json({ error: "Parâmetros inválidos (companyId, mes 1-12, ano obrigatórios)" });
        return;
      }

      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB indisponível" }); return; }

      // ── Empresa ─────────────────────────────────────────────────────────
      const empQ = await db.$client.query(
        `SELECT "razaoSocial", "nomeFantasia" FROM companies WHERE id = $1`, [companyId]
      );
      const empresa = empQ.rows[0]?.razaoSocial || empQ.rows[0]?.nomeFantasia || `Empresa ${companyId}`;

      // ── Contas com linhas no mês ─────────────────────────────────────────
      const contasQ = await db.$client.query(
        `SELECT DISTINCT bsl.conta_bancaria_id,
                cba.banco,
                cba.apelido   AS conta_desc,
                cba.agencia,
                cba.conta,
                cba."tipoConta" AS tipo_conta
           FROM bank_statement_lines bsl
           LEFT JOIN company_bank_accounts cba ON cba.id = bsl.conta_bancaria_id
          WHERE bsl.company_id = $1
            AND bsl.excluido_em IS NULL
            AND EXTRACT(MONTH FROM bsl.data) = $2
            AND EXTRACT(YEAR  FROM bsl.data) = $3
          ORDER BY bsl.conta_bancaria_id`,
        [companyId, mes, ano]
      );

      if (contasQ.rows.length === 0) {
        res.status(404).json({ error: `Nenhuma linha de extrato encontrada para ${MESES[mes-1]} ${ano}.` });
        return;
      }

      // ── Saldos iniciais (financial_opening_balances) ─────────────────────
      let openingBalances: Record<number, number> = {};
      try {
        const obQ = await db.$client.query(
          `SELECT conta_bancaria_id, saldo FROM financial_opening_balances
            WHERE company_id = $1`,
          [companyId]
        );
        for (const r of obQ.rows) {
          openingBalances[Number(r.conta_bancaria_id)] = parseFloat(r.saldo || "0");
        }
      } catch { /* tabela pode não existir — ignora */ }

      // ── Gera workbook ────────────────────────────────────────────────────
      const wb = XLSX.utils.book_new();

      const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "1E3A5F" } },
        alignment: { horizontal: "center" },
      };
      const titleStyle = {
        font: { bold: true, sz: 14 },
        alignment: { horizontal: "center" },
      };
      const subStyle = {
        font: { bold: true, sz: 11 },
      };
      const numStyle = {
        numFmt: '#,##0.00',
        alignment: { horizontal: "right" },
      };
      const greenStyle = {
        font: { color: { rgb: "006400" } },
        numFmt: '#,##0.00',
        alignment: { horizontal: "right" },
      };
      const redStyle = {
        font: { color: { rgb: "8B0000" } },
        numFmt: '#,##0.00',
        alignment: { horizontal: "right" },
      };

      for (const conta of contasQ.rows) {
        const contaId = Number(conta.conta_bancaria_id);
        const banco   = conta.banco || "Banco";
        const contaDesc = [conta.conta_desc, conta.agencia, conta.conta].filter(Boolean).join(" · ");

        // ── Linhas do mês para esta conta ──────────────────────────────────
        // fn1 = NF vinculada diretamente ao line (stmt_line_id)
        // Fallback: fe.nota_fiscal_numero (campo texto em financial_entries)
        const linesQ = await db.$client.query(
          `SELECT
              bsl.data,
              bsl.descricao,
              bsl.valor::float  AS valor,
              bsl.entry_id,
              fe.fornecedor_nome,
              fe.descricao      AS entry_desc,
              COALESCE(fn1.numero_nf, fe.nota_fiscal_numero, '')  AS numero_nf,
              COALESCE(fn1.emitente_cnpj, fn1.tomador_cnpj, '')   AS fornecedor_cnpj
             FROM bank_statement_lines bsl
             LEFT JOIN financial_entries fe  ON fe.id = bsl.entry_id
             LEFT JOIN fiscal_notes fn1      ON fn1.stmt_line_id = bsl.id
            WHERE bsl.company_id = $1
              AND bsl.conta_bancaria_id = $2
              AND bsl.excluido_em IS NULL
              AND EXTRACT(MONTH FROM bsl.data) = $3
              AND EXTRACT(YEAR  FROM bsl.data) = $4
            ORDER BY bsl.data, bsl.id`,
          [companyId, contaId, mes, ano]
        );

        const lines = linesQ.rows;
        const saldoInicial = openingBalances[contaId] ?? 0;

        // ── Monta dados da planilha ─────────────────────────────────────────
        // Seguindo o template do contador:
        // Row 1:  [empresa]            (col C)
        // Row 2-4: em branco
        // Row 5:  banco + Data Saldo Anterior + data
        // Row 6:  Saldo Anterior + valor
        // Row 7:  em branco
        // Row 8:  cabeçalhos
        // Row 9+: dados

        const di = `${ano}-${String(mes).padStart(2, "0")}-01`;

        const ws: XLSX.WorkSheet = {};

        // Row 1 — nome da empresa (col C = índice 2)
        XLSX.utils.sheet_add_aoa(ws, [
          ["", "", empresa, "", "", "", "", ""],
          ["", "", "", "", "", "", "", ""],
          ["", "", "", "", "", "", "", ""],
          ["", "", "", "", "", "", "", ""],
          [banco, "", "", "", "", "", "Data Saldo Anterior", fmtDate(di)],
          ["", "", "", "", "", "", "Saldo Anterior", saldoInicial],
          ["", "", "", "", "", "", "", ""],
          ["Data", "Histórico do Banco", "Histórico Real", "Nº Nota Fiscal", "Nº CNPJ", "Entrada", "Saída", "Saldo"],
        ], { origin: "A1" });

        // Aplica estilos nas células do cabeçalho
        ws["C1"] = { v: empresa, t: "s", s: titleStyle };
        ws["A5"] = { v: banco, t: "s", s: subStyle };
        ws["G5"] = { v: "Data Saldo Anterior", t: "s", s: subStyle };
        ws["H5"] = { v: fmtDate(di), t: "s" };
        ws["G6"] = { v: "Saldo Anterior", t: "s", s: subStyle };
        ws["H6"] = { v: saldoInicial, t: "n", s: numStyle };

        // Cabeçalhos (row 8)
        const hdrs = ["Data","Histórico do Banco","Histórico Real","Nº Nota Fiscal","Nº CNPJ","Entrada","Saída","Saldo"];
        const hdrCols = ["A","B","C","D","E","F","G","H"];
        hdrs.forEach((h, i) => {
          const cell = `${hdrCols[i]}8`;
          ws[cell] = { v: h, t: "s", s: headerStyle };
        });

        // Transações (row 9+)
        let saldo = saldoInicial;
        lines.forEach((line, idx) => {
          const row = idx + 9;
          const valor = parseFloat(String(line.valor)) || 0;
          const entrada = valor > 0 ? valor : 0;
          const saida   = valor < 0 ? Math.abs(valor) : 0;
          saldo += entrada - saida;

          const historicoReal = line.fornecedor_nome || line.entry_desc || "";
          const nf   = line.numero_nf  || "";
          const cnpj = line.fornecedor_cnpj ? fmtCnpj(line.fornecedor_cnpj) : "";

          ws[`A${row}`] = { v: fmtDate(line.data), t: "s" };
          ws[`B${row}`] = { v: line.descricao || "", t: "s" };
          ws[`C${row}`] = { v: historicoReal, t: "s" };
          ws[`D${row}`] = { v: nf, t: "s" };
          ws[`E${row}`] = { v: cnpj, t: "s" };
          ws[`F${row}`] = { v: entrada, t: "n", s: entrada > 0 ? greenStyle : numStyle };
          ws[`G${row}`] = { v: saida,   t: "n", s: saida   > 0 ? redStyle   : numStyle };
          ws[`H${row}`] = { v: saldo,   t: "n", s: { ...numStyle, font: { bold: saldo < 0 } } };
        });

        // Linha de total
        const totalRow = lines.length + 9;
        const totalEnt = lines.reduce((s, l) => { const v = parseFloat(String(l.valor)) || 0; return s + (v > 0 ? v : 0); }, 0);
        const totalSai = lines.reduce((s, l) => { const v = parseFloat(String(l.valor)) || 0; return s + (v < 0 ? Math.abs(v) : 0); }, 0);

        ws[`A${totalRow}`] = { v: "TOTAL", t: "s", s: { font: { bold: true } } };
        ws[`F${totalRow}`] = { v: totalEnt, t: "n", s: { ...greenStyle, font: { bold: true, color: { rgb: "006400" } } } };
        ws[`G${totalRow}`] = { v: totalSai, t: "n", s: { ...redStyle,   font: { bold: true, color: { rgb: "8B0000" } } } };
        ws[`H${totalRow}`] = { v: saldo,    t: "n", s: { ...numStyle,   font: { bold: true } } };

        // Set worksheet range
        ws["!ref"] = `A1:H${totalRow}`;

        // Column widths
        ws["!cols"] = [
          { wch: 12 },  // Data
          { wch: 45 },  // Histórico Banco
          { wch: 35 },  // Histórico Real
          { wch: 18 },  // Nº NF
          { wch: 20 },  // CNPJ
          { wch: 16 },  // Entrada
          { wch: 16 },  // Saída
          { wch: 16 },  // Saldo
        ];

        const sn = sheetName(banco, conta.conta_desc || "");
        XLSX.utils.book_append_sheet(wb, ws, sn);
      }

      // ── Escreve buffer e responde ────────────────────────────────────────
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const mesLabel = MESES[mes - 1];
      const filename = `Contabilidade_${empresa.replace(/[^a-zA-Z0-9]/g, "_")}_${mesLabel}_${ano}.xlsx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);

    } catch (err: any) {
      console.error("[ContabilidadeXlsx]", err);
      if (!res.headersSent) res.status(500).json({ error: "Erro ao gerar planilha" });
    }
  });
}
