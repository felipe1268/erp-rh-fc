/**
 * excelFcTemplate.ts — Serviço de Template Padrão FC para planilhas XLSX
 *
 * Aplica o cabeçalho institucional FC (logo + título + empresa + data + revisão)
 * a qualquer worksheet ExcelJS, seguindo exatamente o modelo PLANILHA_MODELO_FC
 * já vigente no Extrato Bancário (Rev. 3840+).
 *
 * Estrutura padrão (adaptável):
 *   Col A          → vazia (espaço visual)
 *   Cols B → lastDataCol → dados
 *   B2:C7          → logo FC (185×78px, sem distorção)
 *   D2:lastDataCol4 → título do relatório (Calibri 20pt bold, center)
 *   D5:G5          → nome da empresa | H5:lastDataCol5 → data de geração
 *   D6:G6          → subtítulo/período | H6:lastDataCol6 → código de revisão
 *   D7:G7          → (vazio) | H7:lastDataCol7 → emitido por
 *   Row 8          → espaço divisório (altura 8)
 *   Row 9          → cabeçalhos de colunas (fundo roxo #7030A0, branco bold)
 *   Row 10+        → dados (caller responsável)
 */

import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";
import { getDb } from "../db";

// ── Constantes de estilo exportadas (reutilizáveis nos geradores) ─────────────
export const PURPLE   = "FF7030A0";
export const GREEN_BG = "FF00B050";
export const RED_BG   = "FFFF0000";
export const BRL = '_-"R$"\\ * #,##0.00_-;\\-"R$"\\ * #,##0.00_-;_-"R$"\\ * "-"??_-;_-@_-';

export const thin   = { style: "thin"   as const, color: { argb: "FF000000" } };
export const medium = { style: "medium" as const, color: { argb: "FF000000" } };

export const thinBorder: Partial<ExcelJS.Borders> = {
  top: thin, bottom: thin, left: thin, right: thin,
};

// ── Config do template (lida do banco ou defaults) ────────────────────────────

export interface FcXlsxConfig {
  tituloEmpresa: string;
  revisao: string;
  corCabecalho: string; // ARGB hex, ex: "FF7030A0"
  aprovadoPor: string;
}

export const DEFAULT_FC_CONFIG: FcXlsxConfig = {
  tituloEmpresa: "FC ENGENHARIA E CONSTRUÇÃO LTDA",
  revisao: "Rev. 01",
  corCabecalho: PURPLE,
  aprovadoPor: "Sistema",
};

let _configCache: { ts: number; config: FcXlsxConfig } | null = null;

export async function loadFcXlsxConfig(companyId?: number): Promise<FcXlsxConfig> {
  const now = Date.now();
  if (_configCache && now - _configCache.ts < 60_000) return _configCache.config;
  try {
    const db = await getDb();
    const where = companyId ? `WHERE company_id = ${companyId}` : "";
    const r = await db.$client.query(
      `SELECT titulo_empresa, revisao, cor_cabecalho, aprovado_por
         FROM xlsx_template_config ${where} ORDER BY id DESC LIMIT 1`
    );
    if (r.rows.length > 0) {
      const row = r.rows[0] as any;
      const config: FcXlsxConfig = {
        tituloEmpresa: row.titulo_empresa || DEFAULT_FC_CONFIG.tituloEmpresa,
        revisao:       row.revisao       || DEFAULT_FC_CONFIG.revisao,
        corCabecalho:  row.cor_cabecalho ? ("FF" + row.cor_cabecalho.replace(/^#/, "")).toUpperCase()
                                         : DEFAULT_FC_CONFIG.corCabecalho,
        aprovadoPor:   row.aprovado_por  || DEFAULT_FC_CONFIG.aprovadoPor,
      };
      _configCache = { ts: now, config };
      return config;
    }
  } catch { /* fallback silencioso */ }
  return DEFAULT_FC_CONFIG;
}

/** Invalida cache (chamar após saveXlsxTemplateConfig) */
export function invalidateFcXlsxConfigCache() {
  _configCache = null;
}

// ── Helper de logo ─────────────────────────────────────────────────────────────

interface LogoResult { buffer: Buffer; extension: "png" | "jpeg" }

export function getLogoBuffer(): LogoResult | null {
  const candidates: Array<{ p: string; extension: "png" | "jpeg" }> = [
    { p: path.join(process.cwd(), "client/public/logo-fc.jpg"),                    extension: "jpeg" },
    { p: path.join(process.cwd(), "client/public/logo-fc-branco-amarelo.png"),     extension: "png"  },
    { p: path.join(process.cwd(), "server/assets/logo_contabilidade.png"),          extension: "png"  },
  ];
  for (const { p, extension } of candidates) {
    try {
      if (fs.existsSync(p)) return { buffer: fs.readFileSync(p), extension };
    } catch { /* try next */ }
  }
  return null;
}

// ── Helper de coluna (letra → índice 1-based e vice-versa) ────────────────────

export function colLetter(n: number): string {
  let s = "";
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}
export function colIndex(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

// ── applyTableBorders (igual ao extrato bancário) ─────────────────────────────

export function applyTableBorders(
  ws: ExcelJS.Worksheet,
  firstRow: number,
  lastRow: number,
  cols: string[],
) {
  const firstCol = cols[0];
  const lastCol  = cols[cols.length - 1];
  for (let r = firstRow; r <= lastRow; r++) {
    for (const col of cols) {
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
    }
  }
}

// ── applyFcHeader — função principal ──────────────────────────────────────────

export interface FcReportHeader {
  /** Título do relatório em maiúsculas. Ex: "RELATÓRIO DE CUSTOS POR OBRA" */
  titulo: string;
  /** Subtítulo ou período. Ex: "Janeiro / 2026 · OBRA ABC" */
  subtitulo?: string;
  /** Data de geração (DD/MM/AAAA). Padrão: hoje. */
  dataGeracao?: string;
  /** Nome do usuário que gerou. Padrão: config.aprovadoPor */
  emitidoPor?: string;
  /** Última coluna de dados (letra). Padrão: "I" */
  lastDataCol?: string;
}

/**
 * Aplica o cabeçalho padrão FC ao worksheet e retorna o número da próxima
 * linha disponível (9 = onde deve ir o header das colunas de dados).
 *
 * Convenção de linhas:
 *   Row 1        → empty
 *   Rows 2-7     → bloco logo + título
 *   Row 8        → divisória
 *   Row 9        → cabeçalho das colunas (caller aplica cor/texto)
 *   Rows 10+     → dados
 */
export function applyFcHeader(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  header: FcReportHeader,
  config: FcXlsxConfig = DEFAULT_FC_CONFIG,
): number {
  const LCD = (header.lastDataCol ?? "I").toUpperCase();
  const today = header.dataGeracao ?? new Date().toLocaleDateString("pt-BR");

  // Coluna A — vazia
  ws.getColumn("A").width = 1.0;

  // Alturas das linhas de cabeçalho
  ws.getRow(1).height = 15;
  ws.getRow(2).height = 14.4;
  ws.getRow(3).height = 14.4;
  ws.getRow(4).height = 14.4;
  ws.getRow(5).height = 15;
  ws.getRow(6).height = 15;
  ws.getRow(7).height = 15;
  ws.getRow(8).height = 8;
  ws.getRow(9).height = 19.2;

  // Logo B2:C7
  const logoResult = getLogoBuffer();
  if (logoResult) {
    const logoId = wb.addImage({ buffer: logoResult.buffer, extension: logoResult.extension });
    ws.addImage(logoId, {
      tl: { col: 1, row: 1 } as any,
      ext: { width: 185, height: 78 },
      editAs: "oneCell",
    });
  }
  // Bordas contorno logo B2:C7
  ws.getCell("B2").border = { top: medium, left: medium };
  ws.getCell("C2").border = { top: medium, right: medium };
  for (const r of [3, 4, 5, 6]) {
    ws.getCell(`B${r}`).border = { left: medium };
    ws.getCell(`C${r}`).border = { right: medium };
  }
  ws.getCell("B7").border = { bottom: medium, left: medium };
  ws.getCell("C7").border = { bottom: medium, right: medium };

  // D2:LCD4 — Título do relatório
  ws.mergeCells(`D2:${LCD}4`);
  const titleCell = ws.getCell("D2");
  titleCell.value     = header.titulo;
  titleCell.font      = { bold: true, size: 20, name: "Calibri" };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("D2").border = { top: medium, left: medium };
  ws.getCell(`${LCD}2`).border = { top: medium, right: medium };
  for (const r of [3]) {
    ws.getCell(`D${r}`).border = { left: medium };
    ws.getCell(`${LCD}${r}`).border = { right: medium };
  }
  // Borda inferior row 4 (linha completa D4→LCD4)
  {
    const midCols: string[] = [];
    for (let ci = colIndex("D"); ci <= colIndex(LCD); ci++) midCols.push(colLetter(ci));
    ws.getCell(`D4`).border = { top: thin, bottom: medium, left: medium };
    ws.getCell(`${LCD}4`).border = { top: thin, bottom: medium, right: medium };
    for (const c of midCols.slice(1, -1)) {
      ws.getCell(`${c}4`).border = { top: thin, bottom: medium };
    }
  }

  // D5:G5 — Empresa  |  H5:LCD5 — Data geração
  ws.mergeCells("D5:G5");
  const empCell = ws.getCell("D5");
  empCell.value     = config.tituloEmpresa;
  empCell.font      = { bold: true, size: 11, name: "Calibri" };
  empCell.alignment = { horizontal: "center", vertical: "middle" };
  empCell.border = { top: medium, bottom: thin, left: medium, right: thin };

  if (colIndex(LCD) > colIndex("H")) {
    ws.mergeCells(`H5:${LCD}5`);
  }
  const dateCell = ws.getCell("H5");
  dateCell.value     = `Emissão: ${today}`;
  dateCell.font      = { size: 10, name: "Calibri" };
  dateCell.alignment = { horizontal: "center", vertical: "middle" };
  dateCell.border = { top: medium, bottom: thin, left: thin, right: medium };

  // D6:G6 — Subtítulo/Período  |  H6:LCD6 — Revisão
  ws.mergeCells("D6:G6");
  const subCell = ws.getCell("D6");
  subCell.value     = header.subtitulo ?? "";
  subCell.font      = { size: 11, name: "Calibri" };
  subCell.alignment = { horizontal: "center", vertical: "middle" };
  subCell.border = { top: thin, bottom: thin, left: medium, right: thin };

  if (colIndex(LCD) > colIndex("H")) {
    ws.mergeCells(`H6:${LCD}6`);
  }
  const revCell = ws.getCell("H6");
  revCell.value     = config.revisao;
  revCell.font      = { bold: true, size: 10, name: "Calibri" };
  revCell.alignment = { horizontal: "center", vertical: "middle" };
  revCell.border = { top: thin, bottom: thin, left: thin, right: medium };

  // D7:G7 — (vazio)  |  H7:LCD7 — Emitido por
  ws.mergeCells("D7:G7");
  ws.getCell("D7").border = { top: thin, bottom: medium, left: medium, right: thin };
  ws.getCell("G7").border = { top: thin, bottom: medium, right: thin };

  if (colIndex(LCD) > colIndex("H")) {
    ws.mergeCells(`H7:${LCD}7`);
  }
  const byCell = ws.getCell("H7");
  byCell.value     = `Emitido por: ${header.emitidoPor ?? config.aprovadoPor}`;
  byCell.font      = { size: 9, name: "Calibri", italic: true };
  byCell.alignment = { horizontal: "center", vertical: "middle" };
  byCell.border = { top: thin, bottom: medium, left: thin, right: medium };

  // Row 8 — linha divisória vazia
  // (nenhum conteúdo; row 9 = cabeçalho de colunas definido pelo caller)
  return 9;
}

/**
 * Estiliza o row de cabeçalho de colunas (row 9 no padrão FC).
 * O caller já preencheu os valores no row; esta função aplica cor, fonte e bordas.
 */
export function applyFcColumnHeader(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  startCol: string,
  endCol: string,
  corBg: string = PURPLE,
) {
  const row = ws.getRow(rowNum);
  row.height = 19.2;
  for (let ci = colIndex(startCol); ci <= colIndex(endCol); ci++) {
    const col  = colLetter(ci);
    const cell = ws.getCell(`${col}${rowNum}`);
    cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: corBg } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
    const isFirst = ci === colIndex(startCol);
    const isLast  = ci === colIndex(endCol);
    cell.border = {
      top:    medium,
      bottom: medium,
      left:   isFirst ? medium : thin,
      right:  isLast  ? medium : thin,
    };
  }
}

/**
 * Gera um workbook de exemplo do template FC (para download de preview).
 */
export async function gerarExemploTemplate(config: FcXlsxConfig): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Exemplo de Relatório");
  ws.getColumn("B").width = 30;
  ws.getColumn("C").width = 40;
  ws.getColumn("D").width = 20;
  ws.getColumn("E").width = 20;
  ws.getColumn("F").width = 18;
  ws.getColumn("G").width = 18;
  ws.getColumn("H").width = 18;
  ws.getColumn("I").width = 18;

  applyFcHeader(wb, ws, {
    titulo:     "EXEMPLO DE RELATÓRIO FC ENGENHARIA",
    subtitulo:  `Gerado em ${new Date().toLocaleDateString("pt-BR")}`,
    lastDataCol: "I",
  }, config);

  // Cabeçalho de colunas (row 9)
  const headers = ["Código", "Descrição", "Unidade", "Qtd", "Valor Unit.", "Total"];
  const startColIdx = colIndex("B");
  headers.forEach((h, i) => {
    ws.getCell(`${colLetter(startColIdx + i)}9`).value = h;
  });
  applyFcColumnHeader(ws, 9, "B", "G", config.corCabecalho || PURPLE);

  // Dados de exemplo
  const dataRows = [
    ["FC-001", "Serviço de Engenharia Civil", "m²", 1200, 85.00, 102000.00],
    ["FC-002", "Fornecimento de Materiais",   "un",  350, 42.50,  14875.00],
    ["FC-003", "Mão de Obra Especializada",   "h",   980, 68.00,  66640.00],
  ];
  dataRows.forEach((row, i) => {
    const rowNum = 10 + i;
    row.forEach((val, j) => {
      const cell = ws.getCell(`${colLetter(startColIdx + j)}${rowNum}`);
      cell.value  = val;
      cell.border = thinBorder;
      cell.font   = { name: "Calibri", size: 11 };
      if (j >= 4) { cell.numFmt = BRL; }
    });
  });

  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}
