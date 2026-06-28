/**
 * server/routers/downloadContabilidadeXlsx.ts
 * GET /api/download/contabilidade-xlsx?companyId=&mes=&ano=
 *
 * Gera planilha XLSX no formato EXATO do modelo da contabilidade:
 *   Logo        → A1:B4 (imagem PNG da FC Engenharia)
 *   C1:H2       → nome da empresa (Calibri 24pt bold, center)
 *   A5:E6       → BANCO X (bold 11pt, center, sem fundo)
 *   G5 / H5     → "Data Saldo Anterior" / data
 *   G6 / H6     → "Saldo Anterior" / valor R$
 *   Row 8       → cabeçalhos (fundo roxo #7030A0, bold 11pt, center, bordas finas, h=24)
 *   Row 9+      → dados (H col = fórmula acumulada + fundo cinza claro)
 *   Larguras    → A=12.29 B=25.57 C=24.43 D=20 E=18.29 F=11.71 G=18.43 H=21.43
 */
import type { Express, Request, Response } from "express";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho",
  "Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ── Helpers de formatação ─────────────────────────────────────────────────────

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

/** Retorna Date (UTC) do último dia do mês anterior ao período. */
function prevMonthLastDate(mes: number, ano: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 0));
}

// ── Constantes de estilo (modelo contabilidade) ───────────────────────────────

const PURPLE   = "FF7030A0";  // roxo do cabeçalho (ARGB)
const SALDO_BG = "FFEFEFEF";  // fundo cinza-claro coluna Saldo

/** Formato R$ contábil exato do modelo (numFmt 44) */
const BRL = '_-"R$"\ * #,##0.00_-;\-"R$"\ * #,##0.00_-;_-"R$"\ * "-"??_-;_-@_-';

const thin = { style: "thin" as const, color: { argb: "FF000000" } };
const thinBorder: Partial<ExcelJS.Borders> = {
  top: thin, bottom: thin, left: thin, right: thin,
};

// ── Caminho do logo ───────────────────────────────────────────────────────────

function getLogoBuffer(): Buffer | null {
  const candidates = [
    path.join(process.cwd(), "server/assets/logo_contabilidade.png"),
    path.join(__dirname, "../assets/logo_contabilidade.png"),
    path.join(process.cwd(), "attached_assets/logo_contabilidade.png"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p);
    } catch { /* try next */ }
  }
  return null;
}

// ── Função exportável (usada também pelo Pacote Contador) ─────────────────────

export async function buildExtratoBancarioBuffer(
  db: any,
  companyId: number,
  mes: number,
  ano: number,
  empresaLabel: string,
): Promise<Buffer> {
  const tituloEmpresa = empresaLabel.toUpperCase();

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

  let openingMap: Record<number, { saldo: number; data: Date | null }> = {};
  try {
    const obQ = await db.$client.query(
      `SELECT conta_bancaria_id, valor, data_abertura FROM financial_opening_balances WHERE company_id = $1`,
      [companyId]
    );
    for (const r of obQ.rows) {
      openingMap[Number(r.conta_bancaria_id)] = {
        saldo: parseFloat(r.valor ?? "0"),
        data : r.data_abertura ? new Date(r.data_abertura) : null,
      };
    }
  } catch { /* tabela pode não existir */ }

  const wb = new ExcelJS.Workbook();

  // Logo (opcional — se não encontrar, planilha sai sem logo)
  const logoBuffer = getLogoBuffer();
  const logoId = logoBuffer
    ? wb.addImage({ buffer: logoBuffer, extension: "png" })
    : null;

  for (const conta of contasQ.rows) {
    const contaId   = Number(conta.conta_bancaria_id);
    const banco     = (conta.banco || "Banco").toUpperCase();
    const contaDesc = conta.conta_desc || conta.conta || "";

    const ob = openingMap[contaId] ?? { saldo: 0, data: null };
    const saldoInicial = ob.saldo;
    const dataSaldoAnt = ob.data ?? prevMonthLastDate(mes, ano);

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
    const ws = wb.addWorksheet(sheetName(banco, contaDesc));

    // ── Larguras das colunas (exatas do modelo) ───────────────────────────────
    ws.columns = [
      { width: 12.29 },  // A - Data
      { width: 25.57 },  // B - Histórico do Banco
      { width: 24.43 },  // C - Histórico Real
      { width: 20.00 },  // D - Nº Nota Fiscal
      { width: 18.29 },  // E - Nº CNPJ
      { width: 11.71 },  // F - Entrada
      { width: 18.43 },  // G - Saída
      { width: 21.43 },  // H - Saldo
    ];

    // ── Logo (A1:B4 — posição do modelo) ─────────────────────────────────────
    if (logoId !== null) {
      ws.addImage(logoId, {
        tl: { col: 0.15, row: 0 } as any,
        br: { col: 1.85, row: 4 } as any,
        editAs: "oneCell",
      });
    }

    // ── C1:H2 — Nome da empresa (Calibri 24pt bold, center) ──────────────────
    ws.mergeCells("C1:H2");
    const titleCell = ws.getCell("C1");
    titleCell.value = tituloEmpresa;
    titleCell.font  = { bold: true, size: 24, name: "Calibri" };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    // ── Linhas 3-4 — vazias (logo ocupa esta área) ───────────────────────────

    // ── A5:E6 — Nome do banco (bold 11pt, center, sem fundo) ─────────────────
    ws.mergeCells("A5:E6");
    const bankCell = ws.getCell("A5");
    bankCell.value = `BANCO ${banco}`;
    bankCell.font  = { bold: true, size: 11, name: "Calibri" };
    bankCell.alignment = { horizontal: "center", vertical: "middle" };

    // ── G5 / H5 — Data Saldo Anterior ────────────────────────────────────────
    ws.getCell("G5").value = "Data Saldo Anterior";
    ws.getCell("G5").font  = { size: 11, name: "Calibri" };

    const h5 = ws.getCell("H5");
    h5.value  = dataSaldoAnt;
    h5.numFmt = "dd/mm/yyyy";

    // ── G6 / H6 — Saldo Anterior ──────────────────────────────────────────────
    ws.getCell("G6").value = "Saldo Anterior";
    ws.getCell("G6").font  = { size: 11, name: "Calibri" };

    const h6 = ws.getCell("H6");
    h6.value  = saldoInicial;
    h6.numFmt = BRL;

    // ── Linha 7 — vazia (separação antes do cabeçalho) ───────────────────────

    // ── Linha 8 — Cabeçalhos (roxo #7030A0, bold, center, bordas finas) ──────
    ws.getRow(8).height = 24;
    const hdrs = [
      "Data", "Histórico do Banco", "Histórico Real",
      "Nº Nota Fiscal ", "Nº CNPJ", "Entrada", "Saída", "Saldo",
    ];
    ["A","B","C","D","E","F","G","H"].forEach((col, i) => {
      const cell = ws.getCell(`${col}8`);
      cell.value = hdrs[i];
      cell.font  = { bold: true, size: 11, name: "Calibri" };
      cell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = thinBorder;
    });

    // ── Linhas 9+ — Dados ─────────────────────────────────────────────────────
    lines.forEach((line: any, idx: number) => {
      const row   = idx + 9;
      const valor = parseFloat(String(line.valor)) || 0;
      const ent   = valor > 0 ? valor : 0;
      const sai   = valor < 0 ? Math.abs(valor) : 0;

      const histReal = line.fornecedor_nome || line.entry_desc || "";
      const nf       = String(line.numero_nf || "");
      const cnpj     = line.fornecedor_cnpj ? fmtCnpj(line.fornecedor_cnpj) : "";

      // A — Data
      const aCell = ws.getCell(`A${row}`);
      const rawDate = line.data;
      if (rawDate instanceof Date) {
        aCell.value  = rawDate;
        aCell.numFmt = "dd/mm/yyyy";
      } else {
        const dstr   = String(rawDate ?? "").slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(dstr)) {
          const [yr, mo, dy] = dstr.split("-").map(Number);
          aCell.value  = new Date(Date.UTC(yr, mo - 1, dy));
          aCell.numFmt = "dd/mm/yyyy";
        } else {
          aCell.value = fmtDate(rawDate);
        }
      }
      aCell.alignment = { horizontal: "left", vertical: "middle" };

      // B–E — Texto
      const textData: Array<[string, string]> = [
        ["B", line.descricao || ""],
        ["C", histReal],
        ["D", nf],
        ["E", cnpj],
      ];
      textData.forEach(([col, val]) => {
        const cell = ws.getCell(`${col}${row}`);
        cell.value = val;
        cell.alignment = { horizontal: "left", vertical: "middle" };
      });

      // F — Entrada
      const fCell = ws.getCell(`F${row}`);
      fCell.value  = ent;
      fCell.numFmt = BRL;
      fCell.alignment = { horizontal: "left", vertical: "middle" };

      // G — Saída
      const gCell = ws.getCell(`G${row}`);
      gCell.value  = sai;
      gCell.numFmt = BRL;
      gCell.alignment = { horizontal: "left", vertical: "middle" };

      // H — Saldo (fórmula acumulada + fundo cinza claro)
      const hCell   = ws.getCell(`H${row}`);
      const prevRef = idx === 0 ? "H6" : `H${row - 1}`;
      hCell.value   = { formula: `F${row}-G${row}+${prevRef}` };
      hCell.numFmt  = BRL;
      hCell.fill    = { type: "pattern", pattern: "solid", fgColor: { argb: SALDO_BG } };
      hCell.alignment = { horizontal: "left", vertical: "middle" };
    });

    if (lines.length === 0) {
      // Linha em branco para não gerar planilha totalmente vazia
      ws.getCell("A9").value = "Nenhum lançamento no período.";
    }
  }

  if (wb.worksheets.length === 0) {
    const ws = wb.addWorksheet("Sem dados");
    ws.getCell("A1").value = "Nenhum lançamento bancário no período.";
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ── Extrato Cartão de Crédito (XLSX — xlsx-js-style) ─────────────────────────
// (mantém o modelo antigo por não ter template da contabilidade para cartões)

const C = {
  NAVY     : "0F3778",
  NAVY_DARK: "082047",
  GOLD     : "E9AB2B",
  ZEBRA    : "EEF2F9",
  WHITE    : "FFFFFF",
  BLACK    : "000000",
  GREEN_BG : "D6EBD8",
  GREEN_TX : "1E7B34",
  RED_BG   : "F6D4D4",
  RED_TX   : "B02A2A",
  GRID     : "BBC7DC",
};

const BRL_XLSX = '"R$ "#,##0.00;"-R$ "#,##0.00';

const borderThin = {
  top:    { style: "thin", color: { rgb: C.GRID } },
  bottom: { style: "thin", color: { rgb: C.GRID } },
  left:   { style: "thin", color: { rgb: C.GRID } },
  right:  { style: "thin", color: { rgb: C.GRID } },
};
const borderNavy = {
  top:    { style: "medium", color: { rgb: C.NAVY } },
  bottom: { style: "medium", color: { rgb: C.NAVY } },
  left:   { style: "medium", color: { rgb: C.NAVY } },
  right:  { style: "medium", color: { rgb: C.NAVY } },
};

function sTitle(): any {
  return {
    font: { bold: true, sz: 18, color: { rgb: C.WHITE } },
    fill: { patternType: "solid", fgColor: { rgb: C.NAVY } },
    alignment: { horizontal: "center", vertical: "center" },
    border: { bottom: { style: "thick", color: { rgb: C.GOLD } } },
  };
}
function sBank(): any {
  return {
    font: { bold: true, sz: 12, color: { rgb: C.WHITE } },
    fill: { patternType: "solid", fgColor: { rgb: C.NAVY_DARK } },
    alignment: { horizontal: "center", vertical: "center" },
    border: borderNavy,
  };
}
function sBankEmpty(): any {
  return {
    fill: { patternType: "solid", fgColor: { rgb: C.NAVY_DARK } },
    border: borderNavy,
  };
}
function sInfoLabel(): any {
  return {
    font: { bold: true, sz: 10, color: { rgb: C.NAVY } },
    alignment: { horizontal: "left", vertical: "center" },
  };
}
function sInfoDate(): any {
  return { font: { sz: 10 }, alignment: { horizontal: "right", vertical: "center" } };
}
function sInfoMoney(): any {
  return {
    font: { bold: true, sz: 10 },
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: BRL_XLSX,
  };
}
function sHeader(): any {
  return {
    font: { bold: true, sz: 11, color: { rgb: C.WHITE } },
    fill: { patternType: "solid", fgColor: { rgb: C.NAVY } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: borderThin,
  };
}
function sText(alt = false): any {
  return {
    font: { sz: 10, color: { rgb: C.BLACK } },
    fill: { patternType: "solid", fgColor: { rgb: alt ? C.ZEBRA : C.WHITE } },
    alignment: { horizontal: "left", vertical: "center" },
    border: borderThin,
  };
}
function sDate(alt = false): any {
  return {
    font: { sz: 10, color: { rgb: C.BLACK } },
    fill: { patternType: "solid", fgColor: { rgb: alt ? C.ZEBRA : C.WHITE } },
    alignment: { horizontal: "center", vertical: "center" },
    border: borderThin,
  };
}
function sMoney(alt = false): any {
  return {
    font: { sz: 10, color: { rgb: C.BLACK } },
    fill: { patternType: "solid", fgColor: { rgb: alt ? C.ZEBRA : C.WHITE } },
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: BRL_XLSX,
    border: borderThin,
  };
}
function sTotal(isMoney = false): any {
  return {
    font: { bold: true, sz: 10, color: { rgb: C.NAVY_DARK } },
    fill: { patternType: "solid", fgColor: { rgb: C.GOLD } },
    alignment: { horizontal: isMoney ? "right" : "left", vertical: "center" },
    ...(isMoney ? { numFmt: BRL_XLSX } : {}),
    border: borderNavy,
  };
}

function addCell(ws: XLSX.WorkSheet, addr: string, v: any, t: "s"|"n"|"b", s: any) {
  ws[addr] = { v, t, s } as XLSX.CellObject;
}

export async function buildExtratCartaoBuffer(
  db: any,
  companyId: number,
  mes: number,
  ano: number,
  empresaLabel: string,
): Promise<Buffer> {
  const tituloEmpresa = empresaLabel.toUpperCase();

  const itemsQ = await db.$client.query(
    `SELECT
        ci.data,
        ci.descricao,
        ci.cidade,
        ci.valor::float            AS valor,
        ci.tipo,
        ci.parcela_atual,
        ci.parcela_total,
        ci.obra_nome,
        ci.centro_custo_nome,
        ci.categoria_nome,
        cf.id                      AS fatura_id,
        cf.vencimento,
        cf.total::float            AS fatura_total,
        UPPER(c.banco)             AS banco,
        c.final4,
        c.titular,
        UPPER(c.banco) || ' · final ' || c.final4 AS cartao_label
      FROM financial_cartao_itens ci
      JOIN financial_cartao_faturas cf
        ON cf.id = ci.fatura_id
       AND cf.company_id = ci.company_id
       AND cf.excluido_em IS NULL
      JOIN financial_cartoes c
        ON c.id = cf.cartao_id
       AND c.company_id = ci.company_id
       AND c.excluido_em IS NULL
     WHERE ci.company_id = $1
       AND ci.excluido_em IS NULL
       AND cf.mes_ref = $2
       AND cf.ano_ref = $3
     ORDER BY c.banco, c.final4, cf.id, ci.data, ci.id`,
    [companyId, mes, ano]
  );

  const wbXlsx = XLSX.utils.book_new();

  if (itemsQ.rows.length === 0) {
    const ws: XLSX.WorkSheet = {};
    addCell(ws, "A1", "Nenhum lançamento de cartão de crédito no período.", "s", sText());
    ws["!ref"] = "A1:A1";
    XLSX.utils.book_append_sheet(wbXlsx, ws, "Sem dados");
    return XLSX.write(wbXlsx, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  const byFatura = new Map<number, { meta: any; items: any[] }>();
  for (const row of itemsQ.rows) {
    const fid = Number(row.fatura_id);
    if (!byFatura.has(fid)) {
      byFatura.set(fid, {
        meta: {
          cartao_label : row.cartao_label,
          banco        : row.banco,
          final4       : row.final4,
          vencimento   : row.vencimento ? fmtDate(row.vencimento) : "",
          fatura_total : parseFloat(String(row.fatura_total)) || 0,
        },
        items: [],
      });
    }
    byFatura.get(fid)!.items.push(row);
  }

  const usedNames = new Set<string>();
  for (const [, fatura] of byFatura) {
    const { meta, items } = fatura;
    const base = sheetName(meta.banco, meta.final4);
    let sn = base;
    let n = 2;
    while (usedNames.has(sn)) { sn = `${base.slice(0, 27)}(${n++})`; }
    usedNames.add(sn);

    const ws: XLSX.WorkSheet = {};
    const hdrs = ["Data","Descrição","Cidade","Tipo","Parcela","Obra","Categoria","Valor"];
    const cols = ["A","B","C","D","E","F","G","H"];

    addCell(ws, "A1", tituloEmpresa, "s", sTitle());
    for (const addr of ["B3","C3","D3","E3","F3","A4","B4","C4","D4","E4","F4"]) {
      addCell(ws, addr, "", "s", sBankEmpty());
    }
    addCell(ws, "A3", meta.cartao_label, "s", sBank());
    addCell(ws, "G3", "Vencimento",      "s", sInfoLabel());
    addCell(ws, "H3", meta.vencimento,   "s", sInfoDate());
    addCell(ws, "G4", "Total Fatura",    "s", sInfoLabel());
    addCell(ws, "H4", meta.fatura_total, "n", sInfoMoney());

    hdrs.forEach((h, i) => addCell(ws, `${cols[i]}5`, h, "s", sHeader()));

    let totalValor = 0;
    items.forEach((item: any, idx: number) => {
      const row   = idx + 6;
      const valor = parseFloat(String(item.valor)) || 0;
      totalValor += valor;
      const parcela = item.parcela_atual && item.parcela_total
        ? `${item.parcela_atual}/${item.parcela_total}` : "";
      const tipo = item.tipo
        ? String(item.tipo).charAt(0).toUpperCase() + String(item.tipo).slice(1)
        : "Compra";
      const alt = idx % 2 === 1;

      addCell(ws, `A${row}`, fmtDate(item.data),     "s", sDate(alt));
      addCell(ws, `B${row}`, item.descricao || "",    "s", sText(alt));
      addCell(ws, `C${row}`, item.cidade || "",       "s", sText(alt));
      addCell(ws, `D${row}`, tipo,                    "s", sText(alt));
      addCell(ws, `E${row}`, parcela,                 "s", sText(alt));
      addCell(ws, `F${row}`, item.obra_nome || "",    "s", sText(alt));
      addCell(ws, `G${row}`, item.categoria_nome || item.centro_custo_nome || "", "s", sText(alt));
      addCell(ws, `H${row}`, valor,                   "n", sMoney(alt));
    });

    const totalRow = items.length + 6;
    addCell(ws, `A${totalRow}`, "TOTAL", "s", sTotal(false));
    ["B","C","D","E","F","G"].forEach(c => addCell(ws, `${c}${totalRow}`, "", "s", sTotal(false)));
    addCell(ws, `H${totalRow}`, totalValor, "n", sTotal(true));

    ws["!ref"] = `A1:H${totalRow}`;
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 2, c: 0 }, e: { r: 3, c: 5 } },
    ];
    ws["!cols"] = [
      { wch: 12 }, { wch: 40 }, { wch: 18 }, { wch: 12 },
      { wch: 10 }, { wch: 24 }, { wch: 22 }, { wch: 15 },
    ];
    ws["!rows"] = new Array(5).fill(null);
    ws["!rows"][0] = { hpt: 32 };
    ws["!rows"][1] = { hpt: 6  };
    ws["!rows"][2] = { hpt: 22 };
    ws["!rows"][3] = { hpt: 22 };
    ws["!rows"][4] = { hpt: 28 };

    XLSX.utils.book_append_sheet(wbXlsx, ws, sn);
  }

  return XLSX.write(wbXlsx, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ── Rota principal ────────────────────────────────────────────────────────────

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

      const empQ = await db.$client.query(
        `SELECT "razaoSocial", "nomeFantasia" FROM companies WHERE id = $1`, [companyId]
      );
      const razao      = empQ.rows[0]?.razaoSocial || `Empresa ${companyId}`;
      const fantasia   = empQ.rows[0]?.nomeFantasia;
      const empresaLabel = (fantasia || razao).toUpperCase();

      const buffer   = await buildExtratoBancarioBuffer(db, companyId, mes, ano, empresaLabel);
      const mesLabel = MESES[mes - 1];
      const filename = `Extrato_${razao.replace(/[^a-zA-Z0-9]/g, "_")}_${mesLabel}_${ano}.xlsx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);

    } catch (err: any) {
      console.error("[ContabilidadeXlsx]", err);
      if (!res.headersSent) res.status(500).json({ error: "Erro ao gerar planilha" });
    }
  });
}
