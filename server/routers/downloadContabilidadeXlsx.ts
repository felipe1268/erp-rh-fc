/**
 * server/routers/downloadContabilidadeXlsx.ts
 * GET /api/download/contabilidade-xlsx?companyId=&mes=&ano=
 *
 * Gera planilha XLSX no formato EXATO do modelo PLANILHA_MODELO_FC:
 *   Coluna A    → vazia (sem largura explícita)
 *   Larguras    → B=12.33 C=62.66 D=58.44 E=20 F=18.33 G=20.78 H=20.78 I=20.78
 *   Alturas     → Row1=15 Row2=14.4 Row3=14.4 Row5-8=15 Row9=19.2
 *   Logo        → B2:C7 (merge B2:C7, contorno medium)
 *   D2:I5       → Nome empresa (Calibri 24pt bold, center, merge, borda medium exterior)
 *   D6:G7       → Nome banco (bold 11pt, center, merge, borda medium exterior)
 *   H6 / I6     → "Data Saldo Anterior" / data (borda medium tudo)
 *   H7 / I7     → "Saldo Anterior" / valor R$ (borda medium bottom+left/right)
 *   Row 8       → vazia, borda bottom medium B-I
 *   Row 9       → cabeçalhos (roxo #7030A0, bold 11pt, white, center, h=19.2)
 *   Row 10+     → dados (I col = fórmula + cond. format. verde/vermelho)
 *   Saldo fml   → I10=I7+G10-H10; I{n}=I{n-1}+G{n}-H{n}
 */
import type { Express, Request, Response } from "express";
import ExcelJS from "exceljs";
import { loadFcXlsxConfig } from "../services/excelFcTemplate";
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

const PURPLE    = "FF7030A0";  // roxo do cabeçalho (ARGB)
const GREEN_BG  = "FF00B050";  // saldo positivo
const RED_BG    = "FFFF0000";  // saldo negativo

/** Formato R$ contábil exato do modelo (numFmt 44) */
const BRL = '_-"R$"\ * #,##0.00_-;\-"R$"\ * #,##0.00_-;_-"R$"\ * "-"??_-;_-@_-';

const thin   = { style: "thin"   as const, color: { argb: "FF000000" } };
const medium = { style: "medium" as const, color: { argb: "FF000000" } };

const thinBorder: Partial<ExcelJS.Borders> = {
  top: thin, bottom: thin, left: thin, right: thin,
};

/** Aplica bordas com contorno externo (medium) para um range de células.
 *  firstRow/lastRow são índices 1-based (igual ExcelJS).
 *  firstCol/lastCol são letras ("A".."H").
 */
function applyTableBorders(
  ws: ExcelJS.Worksheet,
  firstRow: number,
  lastRow: number,
  cols: string[],
) {
  const firstCol = cols[0];
  const lastCol  = cols[cols.length - 1];
  for (let r = firstRow; r <= lastRow; r++) {
    cols.forEach((col) => {
      const cell = ws.getCell(`${col}${r}`);
      const isTop    = r === firstRow;
      const isBottom = r === lastRow;
      const isLeft   = col === firstCol;
      const isRight  = col === lastCol;
      cell.border = {
        top:    isTop    ? medium : thin,
        bottom: isBottom ? medium : thin,
        left:   isLeft   ? medium : thin,
        right:  isRight  ? medium : thin,
      };
    });
  }
}

// ── Caminho do logo ───────────────────────────────────────────────────────────

interface LogoResult { buffer: Buffer; extension: "png" | "jpeg" }

function getLogoBuffer(): LogoResult | null {
  // Prioridade: logo FC Engenharia (colorido) > logo contabilidade (fallback)
  const candidates: Array<{ p: string; extension: "png" | "jpeg" }> = [
    { p: path.join(process.cwd(), "client/public/logo-fc.jpg"),  extension: "jpeg" },
    { p: path.join(process.cwd(), "client/public/logo-fc-branco-amarelo.png"), extension: "png" },
    { p: path.join(process.cwd(), "server/assets/logo_contabilidade.png"),     extension: "png" },
  ];
  for (const { p, extension } of candidates) {
    try {
      if (fs.existsSync(p)) return { buffer: fs.readFileSync(p), extension };
    } catch { /* try next */ }
  }
  return null;
}

// ── Helpers NF lookup ─────────────────────────────────────────────────────────

function cleanDoc(v: any): string {
  return String(v ?? "").replace(/\D/g, "");
}

/** Chave de cruzamento NF × extrato: cnpj_limpo|centavos_arredondados */
function nfKey(cnpj: string, valor: number): string {
  return `${cleanDoc(cnpj)}|${Math.round(Math.abs(valor) * 100)}`;
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
  const fcCfg = await loadFcXlsxConfig(companyId).catch(() => null);
  const HEADER_COLOR = fcCfg?.corCabecalho ?? PURPLE;

  // ── 1. Contas com lançamentos no mês ──────────────────────────────────────
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

  // ── 2. Saldo de abertura por conta ────────────────────────────────────────
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

  // ── 3. Pré-carregar TODAS as NFs do mês para cruzamento ──────────────────
  // Mapas de cruzamento (fallback quando stmt_line_id não está preenchido):
  //   nfByCnpjValor : cnpj_limpo|centavos → { numero_nf, cnpj }[]
  //   nfByEntryId   : entry_id            → { numero_nf, cnpj }
  interface NfInfo { numero_nf: string; cnpj: string }
  const nfByCnpjValor = new Map<string, NfInfo[]>();
  const nfByEntryId   = new Map<number, NfInfo>();

  try {
    const nfQ = await db.$client.query(
      `SELECT id, numero_nf, entry_id,
              COALESCE(emitente_cnpj, tomador_cnpj, '') AS cnpj,
              valor_bruto::float AS valor
         FROM fiscal_notes
        WHERE company_id = $1
          AND status != 'cancelada'
          AND data_emissao >= $2 AND data_emissao < $3`,
      [
        companyId,
        `${ano}-${String(mes).padStart(2,"0")}-01`,
        mes === 12 ? `${ano+1}-01-01` : `${ano}-${String(mes+1).padStart(2,"0")}-01`,
      ]
    );

    for (const r of nfQ.rows) {
      const info: NfInfo = {
        numero_nf: String(r.numero_nf || ""),
        cnpj: String(r.cnpj || ""),
      };
      // por entry_id (link mais confiável)
      if (r.entry_id) {
        const eid = Number(r.entry_id);
        if (!nfByEntryId.has(eid)) nfByEntryId.set(eid, info);
      }
      // por CNPJ + valor (fallback)
      if (info.cnpj && r.valor) {
        const k = nfKey(info.cnpj, parseFloat(String(r.valor)));
        if (!nfByCnpjValor.has(k)) nfByCnpjValor.set(k, []);
        nfByCnpjValor.get(k)!.push(info);
      }
    }
  } catch (e: any) {
    console.warn("[ExtratoXlsx] Não foi possível carregar NFs:", e?.message?.slice(0,80));
  }

  const wb = new ExcelJS.Workbook();

  // Logo (FC Engenharia — opcional)
  const logoResult = getLogoBuffer();
  const logoId = logoResult
    ? wb.addImage({ buffer: logoResult.buffer, extension: logoResult.extension })
    : null;

  for (const conta of contasQ.rows) {
    const contaId   = Number(conta.conta_bancaria_id);
    const banco     = (conta.banco || "Banco").toUpperCase();
    const contaDesc = conta.conta_desc || conta.conta || "";
    // Label completo: "BANCO SANTANDER – LOCNOW – APARECIDA – 130051325"
    const bancoLabel = contaDesc
      ? `BANCO ${banco} – ${contaDesc.toUpperCase()}`
      : `BANCO ${banco}`;

    const ob = openingMap[contaId] ?? { saldo: 0, data: null };
    const saldoInicial = ob.saldo;
    const dataSaldoAnt = ob.data ?? prevMonthLastDate(mes, ano);

    // ── Lançamentos da conta (inclui links via stmt_line_id E entry_id) ──────
    const linesQ = await db.$client.query(
      `SELECT
          bsl.id          AS bsl_id,
          bsl.data,
          bsl.descricao,
          bsl.valor::float  AS valor,
          bsl.entry_id,
          fe.fornecedor_nome,
          NULL::text          AS entry_cnpj,
          fe.descricao        AS entry_desc,
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
    // A = vazia  B=Data  C=Hist.Banco  D=Hist.Real  E=NF  F=CNPJ  G=Entrada  H=Saída  I=Saldo
    ws.getColumn("A").width = 1.0;
    ws.getColumn("B").width = 12.33;
    ws.getColumn("C").width = 62.66;
    ws.getColumn("D").width = 58.44;
    ws.getColumn("E").width = 20.00;
    ws.getColumn("F").width = 18.33;
    ws.getColumn("G").width = 20.78;
    ws.getColumn("H").width = 20.78;
    ws.getColumn("I").width = 20.78;

    // ── Alturas das linhas do cabeçalho ───────────────────────────────────────
    ws.getRow(1).height = 15;
    ws.getRow(2).height = 14.4;
    ws.getRow(3).height = 14.4;
    ws.getRow(5).height = 15;
    ws.getRow(6).height = 15;
    ws.getRow(7).height = 15;
    ws.getRow(8).height = 15;
    ws.getRow(9).height = 19.2;

    // ── Logo: imagem em B2:C7 — tamanho FIXO (não estica para preencher a área) ─
    if (logoId !== null) {
      ws.addImage(logoId, {
        tl: { col: 1, row: 1 } as any,  // canto superior-esquerdo em B2 (0-based)
        ext: { width: 185, height: 78 }, // dimensões fixas em pixels (não distorce)
        editAs: "oneCell",
      });
    }

    // ── Bordas do bloco logo B2:C7 (contorno medium completo) ────────────────
    ws.getCell("B2").border = { top: medium, left: medium };
    ws.getCell("C2").border = { top: medium, right: medium };
    for (const r of [3, 4, 5, 6]) {
      ws.getCell(`B${r}`).border = { left: medium };
      ws.getCell(`C${r}`).border = { right: medium };
    }
    ws.getCell("B7").border = { bottom: medium, left: medium };
    ws.getCell("C7").border = { bottom: medium, right: medium };

    // ── D2:I5 — Nome da empresa (merge, Calibri 24pt bold, center) ───────────
    ws.mergeCells("D2:I5");
    const titleCell = ws.getCell("D2");
    titleCell.value     = tituloEmpresa;
    titleCell.font      = { bold: true, size: 24, name: "Calibri" };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    // Topo: D2=top+left, E-H2=top, I2=top+right
    ws.getCell("D2").border = { top: medium, left: medium };
    for (const c of ["E","F","G","H"]) ws.getCell(`${c}2`).border = { top: medium };
    ws.getCell("I2").border = { top: medium, right: medium };
    // Laterais rows 3-4: D=left, I=right
    for (const r of [3, 4]) {
      ws.getCell(`D${r}`).border = { left: medium };
      ws.getCell(`I${r}`).border = { right: medium };
    }
    // Borda inferior de D2:I5 (row 5) — COMPLETA: todos os cantos e lados
    ws.getCell("D5").border = { left: medium, bottom: medium };
    for (const c of ["E","F","G","H"]) ws.getCell(`${c}5`).border = { bottom: medium };
    ws.getCell("I5").border = { right: medium, bottom: medium };

    // ── D6:G7 — Nome do banco (merge, bold 11pt, center, borda medium exterior) ─
    ws.mergeCells("D6:G7");
    const bankCell  = ws.getCell("D6");
    bankCell.value     = bancoLabel;
    bankCell.font      = { bold: true, size: 11, name: "Calibri" };
    bankCell.alignment = { horizontal: "center", vertical: "middle" };
    // Topo row 6: D=top+left, E-F=top, G=top+right (fecha lado direito)
    ws.getCell("D6").border = { top: medium, left: medium };
    ws.getCell("E6").border = { top: medium };
    ws.getCell("F6").border = { top: medium };
    ws.getCell("G6").border = { top: medium, right: medium };
    // Base row 7: D=bottom+left, E-F=bottom, G=bottom+right (fecha lado direito)
    ws.getCell("D7").border = { bottom: medium, left: medium };
    ws.getCell("E7").border = { bottom: medium };
    ws.getCell("F7").border = { bottom: medium };
    ws.getCell("G7").border = { bottom: medium, right: medium };

    // ── H6 — "Data Saldo Anterior" (bordas medium em todos os lados) ──────────
    const cellH6 = ws.getCell("H6");
    cellH6.value  = "Data Saldo Anterior";
    cellH6.font   = { size: 11, name: "Calibri" };
    cellH6.border = { top: medium, bottom: medium, left: medium, right: medium };

    // ── I6 — data do saldo anterior ───────────────────────────────────────────
    const cellI6 = ws.getCell("I6");
    cellI6.value  = dataSaldoAnt;
    cellI6.numFmt = "dd/mm/yyyy";
    cellI6.font   = { size: 11, name: "Calibri" };
    cellI6.border = { top: medium, bottom: medium, left: medium, right: medium };

    // ── H7 — "Saldo Anterior" label ───────────────────────────────────────────
    const cellH7 = ws.getCell("H7");
    cellH7.value  = "Saldo Anterior";
    cellH7.font   = { size: 11, name: "Calibri" };
    cellH7.border = { bottom: medium, left: medium, right: medium };

    // ── I7 — valor do saldo anterior (âncora das fórmulas de saldo) ──────────
    const cellI7 = ws.getCell("I7");
    cellI7.value     = saldoInicial;
    cellI7.numFmt    = BRL;
    cellI7.font      = { size: 11, name: "Calibri" };
    cellI7.alignment = { horizontal: "right", vertical: "middle" };
    cellI7.border    = { bottom: medium, left: thin, right: medium };

    // ── Row 8 — vazia, borda inferior medium (separa cabeçalho dos headers) ───
    ws.getCell("B8").border = { bottom: medium, left: medium };
    for (const c of ["C","D","E","F","G","H"]) ws.getCell(`${c}8`).border = { bottom: medium };
    ws.getCell("I8").border = { bottom: medium, right: medium };

    // ── Row 9 — Cabeçalhos (roxo #7030A0, bold 11pt, branco, centralizado) ───
    const HDRS: [string, string][] = [
      ["B","Data"], ["C","Histórico do Banco"], ["D","Histórico Real"],
      ["E","Nº Nota Fiscal"], ["F","Nº CNPJ"],
      ["G","Entrada"], ["H","Saída"], ["I","Saldo"],
    ];
    HDRS.forEach(([col, label]) => {
      const cell = ws.getCell(`${col}9`);
      cell.value     = label;
      cell.font      = { bold: true, size: 11, name: "Calibri", color: { argb: "FFFFFFFF" } };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_COLOR } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border    = {
        bottom: thin,
        left:   col === "B" ? medium : thin,
        right:  col === "I" ? medium : thin,
      };
    });

    // ── Rows 10+ — Dados ──────────────────────────────────────────────────────
    const usedNfKeys = new Set<string>();
    let saldoAcum = saldoInicial;

    lines.forEach((line: any, idx: number) => {
      const row   = idx + 10;  // dados começam na row 10
      const valor = parseFloat(String(line.valor)) || 0;
      const ent   = valor > 0 ? valor : 0;
      const sai   = valor < 0 ? Math.abs(valor) : 0;
      saldoAcum   = Math.round((saldoAcum + valor) * 100) / 100;

      const histReal = line.fornecedor_nome || line.entry_desc || "";

      // ── Cruzamento NF (3 camadas) ────────────────────────────────────────────
      let nfNumero = String(line.numero_nf || "");
      let nfCnpj   = String(line.fornecedor_cnpj || "");
      if (!nfNumero && line.entry_id) {
        const byEntry = nfByEntryId.get(Number(line.entry_id));
        if (byEntry) { nfNumero = byEntry.numero_nf; nfCnpj = byEntry.cnpj; }
      }
      if (!nfNumero) {
        const cnpjRef = cleanDoc(line.entry_cnpj || line.fornecedor_cnpj || "");
        if (cnpjRef && Math.abs(valor) > 0) {
          const k = nfKey(cnpjRef, valor);
          const cands = nfByCnpjValor.get(k);
          if (cands) {
            const pick = cands.find(c => !usedNfKeys.has(`${k}|${c.numero_nf}`));
            if (pick) { nfNumero = pick.numero_nf; nfCnpj = pick.cnpj; usedNfKeys.add(`${k}|${pick.numero_nf}`); }
          }
        }
      }
      const cnpjFmt = nfCnpj ? fmtCnpj(nfCnpj) : "";

      // Todas as células de dados: thin em todos os lados,
      // exceto B (left=medium) e I (right=medium)
      const isLast = idx === lines.length - 1;
      const btm    = isLast ? medium : thin;

      // B — Data
      const bCell = ws.getCell(`B${row}`);
      const rawDate = line.data;
      if (rawDate instanceof Date) {
        bCell.value  = rawDate;
        bCell.numFmt = "dd/mm/yyyy";
      } else {
        const dstr = String(rawDate ?? "").slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(dstr)) {
          const [yr, mo, dy] = dstr.split("-").map(Number);
          bCell.value  = new Date(Date.UTC(yr, mo - 1, dy));
          bCell.numFmt = "dd/mm/yyyy";
        } else {
          bCell.value = fmtDate(rawDate);
        }
      }
      bCell.font      = { size: 11, name: "Calibri" };
      bCell.alignment = { horizontal: "left", vertical: "middle" };
      bCell.border    = { top: thin, bottom: btm, left: medium, right: thin };

      // C, D, E, F — Texto
      const textCols: [string, string][] = [
        ["C", line.descricao || ""],
        ["D", histReal],
        ["E", nfNumero],
        ["F", cnpjFmt],
      ];
      textCols.forEach(([col, val]) => {
        const cell  = ws.getCell(`${col}${row}`);
        cell.value     = val;
        cell.font      = { size: 11, name: "Calibri" };
        cell.alignment = { horizontal: col === "E" ? "center" : "left", vertical: "middle" };
        cell.border    = { top: thin, bottom: btm, left: thin, right: thin };
      });

      // G — Entrada
      const gCell = ws.getCell(`G${row}`);
      gCell.value     = ent;
      gCell.numFmt    = BRL;
      gCell.font      = { size: 11, name: "Calibri" };
      gCell.alignment = { horizontal: "right", vertical: "middle" };
      gCell.border    = { top: thin, bottom: btm, left: thin, right: thin };

      // H — Saída
      const hCell = ws.getCell(`H${row}`);
      hCell.value     = sai;
      hCell.numFmt    = BRL;
      hCell.font      = { size: 11, name: "Calibri" };
      hCell.alignment = { horizontal: "right", vertical: "middle" };
      hCell.border    = { top: thin, bottom: btm, left: thin, right: thin };

      // I — Saldo (fórmula): I10=I7+G10-H10; In=I{n-1}+Gn-Hn
      const prevRef = idx === 0 ? "I7" : `I${row - 1}`;
      const iCell = ws.getCell(`I${row}`);
      iCell.value     = { formula: `=${prevRef}+G${row}-H${row}`, result: saldoAcum };
      iCell.numFmt    = BRL;
      iCell.font      = { size: 11, name: "Calibri" };
      iCell.alignment = { horizontal: "right", vertical: "middle" };
      iCell.border    = { top: thin, bottom: btm, left: thin, right: medium };
    });

    // ── Formatação condicional nativa Excel na coluna I (Saldo) ──────────────
    // Aplica-se a: I10:I{lastDataRow}
    const lastDataRow = lines.length > 0 ? 9 + lines.length : 10;
    ws.addConditionalFormatting({
      ref: `I10:I${lastDataRow}`,
      rules: [
        {
          type: "cellIs", operator: "lessThan", formulae: [0], priority: 1,
          style: {
            fill: { type: "pattern", pattern: "solid", bgColor: { argb: RED_BG } },
            font: { color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 },
          },
        },
        {
          type: "cellIs", operator: "greaterThan", formulae: [0], priority: 2,
          style: {
            fill: { type: "pattern", pattern: "solid", bgColor: { argb: GREEN_BG } },
            font: { color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 },
          },
        },
      ],
    } as any);

    if (lines.length === 0) {
      ws.getCell("B10").value = "Nenhum lançamento no período.";
    }
  }

  if (wb.worksheets.length === 0) {
    const ws = wb.addWorksheet("Sem dados");
    ws.getCell("B1").value = "Nenhum lançamento bancário no período.";
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
