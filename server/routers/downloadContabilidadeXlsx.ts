/**
 * server/routers/downloadContabilidadeXlsx.ts
 * GET /api/download/contabilidade-xlsx?companyId=&mes=&ano=
 *
 * Gera planilha XLSX no formato exato do modelo contador (Pronus):
 *   Row 2  : [empresa] — negrito 18pt centralizado (A2:H2 merged)
 *   Row 5-6: [BANCO X] — box com borda (A5:F6 merged) + Data Saldo Anterior + Saldo Anterior
 *   Row 8  : cabeçalhos roxo (#7030A0) texto branco
 *   Row 9+ : Data | Hist.Banco | Hist.Real | Nº NF | Nº CNPJ | Entrada | Saída | Saldo
 *   Saldo  : fundo verde (≥0) ou vermelho (<0)
 *   Moeda  : formato "R$ #,##0.00" com zero → "R$ -"
 */
import type { Express, Request, Response } from "express";
import * as XLSX from "xlsx";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho",
  "Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ── Helpers de formatação ────────────────────────────────────────────────────

function fmtDate(s: any): string {
  if (!s) return "";
  if (s instanceof Date) {
    const d = String(s.getUTCDate()).padStart(2, "0");
    const m = String(s.getUTCMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${s.getUTCFullYear()}`;
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

function sheetName(banco: string, desc: string): string {
  const full = [banco, desc].filter(Boolean).join(" - ");
  return full.length > 31 ? full.slice(0, 31) : full;
}

function lastDayOfPrevMonth(mes: number, ano: number): string {
  const d = new Date(ano, mes - 1, 0); // dia 0 do mês atual = último dia do mês anterior
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

// ── Paleta ───────────────────────────────────────────────────────────────────

const C = {
  PURPLE : "7030A0",
  GREEN  : "92D050",
  RED    : "FF4040",
  WHITE  : "FFFFFF",
  BLACK  : "000000",
  GREY   : "D9D9D9",
  LIGHT  : "F2F2F2",
};

// Formato BRL: positivo "R$ 10,00" | negativo "-R$ 10,00" | zero "R$ -"
const BRL = '"R$ "#,##0.00;"-R$ "#,##0.00;"R$ -"';

// ── Builders de estilo ───────────────────────────────────────────────────────

const borderThin = {
  top:    { style: "thin",   color: { rgb: C.BLACK } },
  bottom: { style: "thin",   color: { rgb: C.BLACK } },
  left:   { style: "thin",   color: { rgb: C.BLACK } },
  right:  { style: "thin",   color: { rgb: C.BLACK } },
};
const borderMedium = {
  top:    { style: "medium", color: { rgb: C.BLACK } },
  bottom: { style: "medium", color: { rgb: C.BLACK } },
  left:   { style: "medium", color: { rgb: C.BLACK } },
  right:  { style: "medium", color: { rgb: C.BLACK } },
};

function sTitle(): any {
  return {
    font: { bold: true, sz: 18, color: { rgb: C.BLACK } },
    alignment: { horizontal: "center", vertical: "center" },
  };
}

function sBank(): any {
  return {
    font: { bold: true, sz: 12, color: { rgb: C.BLACK } },
    alignment: { horizontal: "center", vertical: "center" },
    border: borderMedium,
  };
}

function sBankEmpty(): any {
  return { border: borderMedium };
}

function sInfoLabel(): any {
  return {
    font: { bold: true, sz: 10 },
    alignment: { horizontal: "left", vertical: "center" },
  };
}

function sInfoDate(): any {
  return {
    font: { sz: 10 },
    alignment: { horizontal: "right", vertical: "center" },
  };
}

function sInfoMoney(): any {
  return {
    font: { sz: 10 },
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: BRL,
  };
}

function sHeader(): any {
  return {
    font: { bold: true, sz: 11, color: { rgb: C.WHITE } },
    fill: { patternType: "solid", fgColor: { rgb: C.PURPLE } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: borderThin,
  };
}

function sText(bold = false): any {
  return {
    font: { sz: 10, bold },
    alignment: { horizontal: "left", vertical: "center" },
    border: borderThin,
  };
}

function sDate(): any {
  return {
    font: { sz: 10 },
    alignment: { horizontal: "center", vertical: "center" },
    border: borderThin,
  };
}

function sMoney(saldoSign: "positive" | "negative" | "neutral", bold = false): any {
  const fillMap: Record<string, string | undefined> = {
    positive: C.GREEN,
    negative: C.RED,
    neutral : undefined,
  };
  const fill = fillMap[saldoSign];
  return {
    font: { sz: 10, bold, color: { rgb: C.BLACK } },
    ...(fill ? { fill: { patternType: "solid", fgColor: { rgb: fill } } } : {}),
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: BRL,
    border: borderThin,
  };
}

function sTotal(isMoney = false): any {
  return {
    font: { bold: true, sz: 10 },
    fill: { patternType: "solid", fgColor: { rgb: C.GREY } },
    alignment: { horizontal: isMoney ? "right" : "left", vertical: "center" },
    ...(isMoney ? { numFmt: BRL } : {}),
    border: borderThin,
  };
}

// ── Helper para adicionar célula ─────────────────────────────────────────────

function addCell(ws: XLSX.WorkSheet, addr: string, v: any, t: "s"|"n"|"b", s: any) {
  ws[addr] = { v, t, s } as XLSX.CellObject;
}

// ── Função exportável (usada também pelo Pacote Contador) ────────────────────

export async function buildExtratoBancarioBuffer(
  db: any,
  companyId: number,
  mes: number,
  ano: number,
  empresaLabel: string,
): Promise<Buffer> {
  const tituloEmpresa = empresaLabel.toUpperCase();

  // Contas com extrato no mês
  const contasQ = await db.$client.query(
    `SELECT DISTINCT bsl.conta_bancaria_id,
            cba.banco,
            cba.apelido   AS conta_desc,
            cba.agencia,
            cba.conta
       FROM bank_statement_lines bsl
       LEFT JOIN company_bank_accounts cba ON cba.id = bsl.conta_bancaria_id
      WHERE bsl.company_id = $1
        AND bsl.excluido_em IS NULL
        AND EXTRACT(MONTH FROM bsl.data) = $2
        AND EXTRACT(YEAR  FROM bsl.data) = $3
      ORDER BY bsl.conta_bancaria_id`,
    [companyId, mes, ano]
  );

  // Saldos de abertura
  let openingMap: Record<number, { saldo: number; data: string }> = {};
  try {
    const obQ = await db.$client.query(
      `SELECT conta_bancaria_id, saldo, data FROM financial_opening_balances WHERE company_id = $1`,
      [companyId]
    );
    for (const r of obQ.rows) {
      openingMap[Number(r.conta_bancaria_id)] = {
        saldo: parseFloat(r.saldo ?? "0"),
        data : r.data ? fmtDate(r.data) : "",
      };
    }
  } catch { /* tabela pode não existir */ }

  const wb = XLSX.utils.book_new();

  for (const conta of contasQ.rows) {
    const contaId    = Number(conta.conta_bancaria_id);
    const banco      = (conta.banco || "Banco").toUpperCase();
    const contaDesc  = conta.conta_desc || conta.conta || "";
    const bancoLabel = `BANCO ${banco}`;

    const ob = openingMap[contaId] ?? { saldo: 0, data: "" };
    const saldoInicial    = ob.saldo;
    const dataSaldoAnt    = ob.data || lastDayOfPrevMonth(mes, ano);

    // Linhas do extrato para esta conta
    const linesQ = await db.$client.query(
      `SELECT
          bsl.data,
          bsl.descricao,
          bsl.valor::float  AS valor,
          bsl.entry_id,
          fe.fornecedor_nome,
          fe.descricao      AS entry_desc,
          COALESCE(fn1.numero_nf, '')                         AS numero_nf,
          COALESCE(fn1.emitente_cnpj, fn1.tomador_cnpj, '')  AS fornecedor_cnpj
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
    const ws: XLSX.WorkSheet = {};

    addCell(ws, "A2", tituloEmpresa, "s", sTitle());

    for (const addr of ["B5","C5","D5","E5","F5","A6","B6","C6","D6","E6","F6"]) {
      addCell(ws, addr, "", "s", sBankEmpty());
    }
    addCell(ws, "A5", bancoLabel, "s", sBank());

    addCell(ws, "G5", "Data Saldo Anterior", "s", sInfoLabel());
    addCell(ws, "H5", dataSaldoAnt,           "s", sInfoDate());
    addCell(ws, "G6", "Saldo Anterior",        "s", sInfoLabel());
    addCell(ws, "H6", saldoInicial,            "n", sInfoMoney());

    const hdrs = ["Data","Histórico do Banco","Histórico Real",
                  "Nº Nota Fiscal","Nº CNPJ","Entrada","Saída","Saldo"];
    const cols = ["A","B","C","D","E","F","G","H"];
    hdrs.forEach((h, i) => addCell(ws, `${cols[i]}8`, h, "s", sHeader()));

    let saldo = saldoInicial;
    lines.forEach((line, idx) => {
      const row   = idx + 9;
      const valor = parseFloat(String(line.valor)) || 0;
      const ent   = valor > 0 ? valor : 0;
      const sai   = valor < 0 ? Math.abs(valor) : 0;
      saldo += valor;

      const histReal = line.fornecedor_nome || line.entry_desc || "";
      const nf       = String(line.numero_nf || "");
      const cnpj     = line.fornecedor_cnpj ? fmtCnpj(line.fornecedor_cnpj) : "";
      const sSign    = saldo >= 0 ? "positive" : "negative";

      addCell(ws, `A${row}`, fmtDate(line.data), "s", sDate());
      addCell(ws, `B${row}`, line.descricao || "", "s", sText());
      addCell(ws, `C${row}`, histReal,             "s", sText());
      addCell(ws, `D${row}`, nf,                   "s", sText());
      addCell(ws, `E${row}`, cnpj,                 "s", sText());
      addCell(ws, `F${row}`, ent,  "n", sMoney("neutral"));
      addCell(ws, `G${row}`, sai,  "n", sMoney("neutral"));
      addCell(ws, `H${row}`, saldo,"n", sMoney(sSign));
    });

    const totalRow = lines.length + 9;
    let totEnt = 0, totSai = 0;
    lines.forEach(l => {
      const v = parseFloat(String(l.valor)) || 0;
      if (v > 0) totEnt += v; else totSai += Math.abs(v);
    });

    addCell(ws, `A${totalRow}`, "TOTAL", "s", sTotal(false));
    ["B","C","D","E"].forEach(c => addCell(ws, `${c}${totalRow}`, "", "s", sTotal(false)));
    addCell(ws, `F${totalRow}`, totEnt, "n", sTotal(true));
    addCell(ws, `G${totalRow}`, totSai, "n", sTotal(true));
    addCell(ws, `H${totalRow}`, saldo,  "n", sTotal(true));

    ws["!ref"] = `A1:H${totalRow}`;
    ws["!merges"] = [
      { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
      { s: { r: 4, c: 0 }, e: { r: 5, c: 5 } },
    ];
    ws["!cols"] = [
      { wch: 12 }, { wch: 44 }, { wch: 34 },
      { wch: 18 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 16 },
    ];
    ws["!rows"] = new Array(8).fill(null);
    ws["!rows"][0] = { hpt: 8  };
    ws["!rows"][1] = { hpt: 32 };
    ws["!rows"][2] = { hpt: 6  };
    ws["!rows"][3] = { hpt: 6  };
    ws["!rows"][4] = { hpt: 22 };
    ws["!rows"][5] = { hpt: 22 };
    ws["!rows"][6] = { hpt: 8  };
    ws["!rows"][7] = { hpt: 28 };

    XLSX.utils.book_append_sheet(wb, ws, sheetName(banco, contaDesc));
  }

  if (wb.SheetNames.length === 0) {
    const ws: XLSX.WorkSheet = {};
    addCell(ws, "A1", "Nenhum lançamento bancário no período.", "s", sText());
    ws["!ref"] = "A1:A1";
    XLSX.utils.book_append_sheet(wb, ws, "Sem dados");
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ── Rota principal ───────────────────────────────────────────────────────────

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
        res.status(400).json({ error: "Parâmetros inválidos (companyId, mes 1-12, ano)" });
        return;
      }

      const db = await getDb();
      if (!db) { res.status(500).json({ error: "DB indisponível" }); return; }

      // Empresa
      const empQ = await db.$client.query(
        `SELECT "razaoSocial", "nomeFantasia" FROM companies WHERE id = $1`, [companyId]
      );
      const razao   = empQ.rows[0]?.razaoSocial || `Empresa ${companyId}`;
      const fantasia = empQ.rows[0]?.nomeFantasia;
      const empresaLabel = (fantasia || razao).toUpperCase();

      const buffer   = await buildExtratoBancarioBuffer(db, companyId, mes, ano, empresaLabel);
      const mesLabel = MESES[mes - 1];
      const filename = `Contabilidade_${razao.replace(/[^a-zA-Z0-9]/g, "_")}_${mesLabel}_${ano}.xlsx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);

    } catch (err: any) {
      console.error("[ContabilidadeXlsx]", err);
      if (!res.headersSent) res.status(500).json({ error: "Erro ao gerar planilha" });
    }
  });
}
