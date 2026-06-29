/**
 * server/routers/downloadPacoteContador.ts
 * GET /api/download/pacote-contador?companyId=&mes=&ano=
 *
 * Gera ZIP no padrão solicitado pela contabilidade (Pronus):
 *
 *   FC_Engenharia_Jun_2026/
 *   ├── Faturas_Emitidas/           → espelho HTML por NFS-e + Lista_Faturas_Emitidas.xlsx (FC template)
 *   ├── Servicos_Tomados/           → espelho HTML + Lista_Servicos_Tomados.xlsx + NF-e_Recebidas_Compras.xlsx
 *   ├── Extratos_Bancarios/         → Extrato_Bancario_<Mes>.xlsx (por conta) + Extrato_Completo.xlsx
 *   ├── Extratos_Cartoes/           → Extrato_Cartao_<Mes>.xlsx
 *   ├── 00_CHECKLIST.docx
 *   └── 02_OCs_NF-e.xlsx (FC template)
 */
import type { Express, Request, Response } from "express";
import archiver from "archiver";
import fs from "fs";
import path from "path";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType,
  Header, Footer, PageNumber, ImageRun,
} from "docx";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { buildExtratoBancarioBuffer, buildExtratCartaoBuffer } from "./downloadContabilidadeXlsx";
import ExcelJS from "exceljs";
import {
  applyFcHeader,
  applyFcColumnHeader,
  loadFcXlsxConfig,
  BRL as FC_BRL,
  medium as FC_MED,
  thin as FC_THIN_STYLE,
} from "../services/excelFcTemplate";
import type { FcXlsxConfig } from "../services/excelFcTemplate";

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
async function safeQuery(db: any, sql: string, params: any[]): Promise<any[]> {
  try {
    const r = await db.$client.query(sql, params);
    return r.rows ?? [];
  } catch (e: any) {
    console.warn("[PacoteContador] query falhou:", e?.message?.slice(0, 120));
    return [];
  }
}

async function queryData(db: any, companyId: number, di: string, df: string) {
  const [nfseEmitidas, nfseTomadas, nfe, bank, ocs, cartao] = await Promise.all([
    // NFS-e emitidas (a empresa presta serviço)
    safeQuery(db, `
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
    safeQuery(db, `
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
    safeQuery(db, `
      SELECT numero_nf, emitente_cnpj, emitente_nome,
             valor_bruto, data_emissao, status, chave_acesso
      FROM fiscal_notes
      WHERE company_id = $1 AND data_emissao >= $2 AND data_emissao < $3
        AND (origem = 'sefaz_nfe' OR origem = 'xml_upload') AND status != 'cancelada'
      ORDER BY data_emissao ASC
    `, [companyId, di, df]),

    // Extrato bancário (contas correntes)
    safeQuery(db, `
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
    safeQuery(db, `
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

    // Cartão de crédito — itens das faturas do mês (financial_cartao_*)
    safeQuery(db, `
      SELECT ci.data, ci.descricao, ci.valor::float AS valor, ci.tipo,
             UPPER(c.banco) || ' · final ' || c.final4 AS conta_nome, c.banco,
             '' AS fn_numero, '' AS fornecedor_nome
      FROM financial_cartao_itens ci
      JOIN financial_cartao_faturas cf
        ON cf.id = ci.fatura_id AND cf.company_id = ci.company_id AND cf.excluido_em IS NULL
      JOIN financial_cartoes c
        ON c.id = cf.cartao_id AND c.company_id = ci.company_id AND c.excluido_em IS NULL
      WHERE ci.company_id = $1
        AND ci.excluido_em IS NULL
        AND cf.mes_ref = EXTRACT(MONTH FROM $2::date)
        AND cf.ano_ref = EXTRACT(YEAR  FROM $2::date)
      ORDER BY c.banco, c.final4, ci.data, ci.id
    `, [companyId, di, df]),
  ]);

  return { nfseEmitidas, nfseTomadas, nfe, bank, ocs, cartao };
}

// ── XLSX builders — padrão FC template ────────────────────────────────────────

const XLSX_FILLS = {
  white : { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFFFFF" } },
  zebra : { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF5F8FF" } },
  total : { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFF2CC" } },
};

async function buildListaFaturasXlsx(
  rows: any[],
  tipo: "emitida" | "tomada",
  label: string,
  fcConfig: FcXlsxConfig,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(tipo === "emitida" ? "Faturas Emitidas" : "Serviços Tomados");

  ws.getColumn("B").width = 8;
  ws.getColumn("C").width = 42;
  ws.getColumn("D").width = 20;
  ws.getColumn("E").width = 18;
  ws.getColumn("F").width = 18;
  ws.getColumn("G").width = 13;
  ws.getColumn("H").width = 12;
  ws.getColumn("I").width = 12;
  ws.getColumn("J").width = 12;
  ws.getColumn("K").width = 12;
  ws.getColumn("L").width = 14;

  applyFcHeader(wb, ws, {
    titulo: tipo === "emitida"
      ? "NFS-e EMITIDAS — FATURAS DE SERVIÇOS"
      : "NFS-e TOMADAS — SERVIÇOS CONTRATADOS",
    subtitulo: label,
    lastDataCol: "L",
  }, fcConfig);

  const hdrs = tipo === "emitida"
    ? ["NF#","Tomador","CNPJ Tomador","Valor Bruto","Valor Líquido","ISS Retido","INSS Ret.","IRRF Ret.","PIS/COF Ret.","Emissão","Status"]
    : ["NF#","Prestador","CNPJ Prestador","Valor Bruto","Valor Líquido","ISS Retido","INSS Ret.","IRRF Ret.","PIS/COF Ret.","Emissão","Status"];
  const DCOLS = ["B","C","D","E","F","G","H","I","J","K","L"];
  hdrs.forEach((h, i) => { ws.getCell(`${DCOLS[i]}9`).value = h; });
  applyFcColumnHeader(ws, 9, "B", "L", fcConfig.corCabecalho);

  const MONEY = new Set(["E","F","G","H","I","J"]);
  const CENT  = new Set(["B","K"]);

  rows.forEach((n, idx) => {
    const r   = idx + 10;
    const btm = idx === rows.length - 1 ? FC_MED : FC_THIN_STYLE;
    const fill = idx % 2 === 0 ? XLSX_FILLS.white : XLSX_FILLS.zebra;
    const vals: [string, any][] = [
      ["B", n.numero_nf ?? ""],
      ["C", (tipo === "emitida" ? n.tomador_razao_social : n.emitente_nome) ?? ""],
      ["D", fmtCnpj(tipo === "emitida" ? n.tomador_cnpj : n.emitente_cnpj)],
      ["E", parseFloat(String(n.valor_bruto ?? 0)) || 0],
      ["F", parseFloat(String(n.valor_liquido ?? n.valor_bruto ?? 0)) || 0],
      ["G", parseFloat(String(n.iss_retido ?? 0)) || 0],
      ["H", parseFloat(String(n.retencao_inss ?? 0)) || 0],
      ["I", parseFloat(String(n.retencao_irrf ?? 0)) || 0],
      ["J", parseFloat(String(n.retencao_pis_cofins ?? 0)) || 0],
      ["K", fmtDate(n.data_emissao)],
      ["L", n.status ?? ""],
    ];
    vals.forEach(([col, val]) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.value = val;
      if (MONEY.has(col)) cell.numFmt = FC_BRL;
      cell.font = { size: 11, name: "Calibri" };
      cell.alignment = {
        horizontal: MONEY.has(col) ? "right" : CENT.has(col) ? "center" : "left",
        vertical: "middle",
      };
      cell.fill = fill;
      cell.border = {
        top: FC_THIN_STYLE, bottom: btm,
        left: col === "B" ? FC_MED : FC_THIN_STYLE,
        right: col === "L" ? FC_MED : FC_THIN_STYLE,
      };
    });
  });

  const lastDataRow = rows.length > 0 ? rows.length + 9 : 9;
  const totRow = lastDataRow + 1;
  DCOLS.forEach(col => {
    const cell = ws.getCell(`${col}${totRow}`);
    if (col === "B") {
      cell.value = "TOTAL";
      cell.font = { bold: true, size: 11, name: "Calibri" };
    } else if (MONEY.has(col) && rows.length > 0) {
      cell.value = { formula: `SUM(${col}10:${col}${lastDataRow})`, result: 0 };
      cell.numFmt = FC_BRL;
      cell.font = { bold: true, size: 11, name: "Calibri" };
      cell.alignment = { horizontal: "right", vertical: "middle" };
    }
    cell.fill = XLSX_FILLS.total;
    cell.border = {
      top: FC_MED, bottom: FC_MED,
      left: col === "B" ? FC_MED : FC_THIN_STYLE,
      right: col === "L" ? FC_MED : FC_THIN_STYLE,
    };
  });

  if (rows.length > 0) {
    ws.addConditionalFormatting({
      ref: `L10:L${lastDataRow}`,
      rules: [
        { type: "containsText", operator: "containsText", text: "conciliada", priority: 1,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FF00B050" } }, font: { color: { argb: "FFFFFFFF" }, bold: true, name: "Calibri", size: 11 } } },
        { type: "containsText", operator: "containsText", text: "pendente",   priority: 2,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC000" } }, font: { color: { argb: "FF7B3500" }, name: "Calibri", size: 11 } } },
        { type: "containsText", operator: "containsText", text: "cancelada",  priority: 3,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFF0000" } }, font: { color: { argb: "FFFFFFFF" }, bold: true, name: "Calibri", size: 11 } } },
      ],
    } as any);
  }
  if (rows.length === 0) {
    ws.getCell("B10").value = "Nenhuma nota fiscal no período.";
    ws.getCell("B10").font = { italic: true, color: { argb: "FF64748B" }, name: "Calibri", size: 11 };
  }
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

async function buildNfeXlsx(
  rows: any[],
  label: string,
  fcConfig: FcXlsxConfig,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("NF-e Recebidas");

  ws.getColumn("B").width = 10;
  ws.getColumn("C").width = 38;
  ws.getColumn("D").width = 20;
  ws.getColumn("E").width = 18;
  ws.getColumn("F").width = 12;
  ws.getColumn("G").width = 14;
  ws.getColumn("H").width = 48;

  applyFcHeader(wb, ws, {
    titulo: "NF-e RECEBIDAS — COMPRAS DE MATERIAIS/PRODUTOS",
    subtitulo: label,
    lastDataCol: "H",
  }, fcConfig);

  const hdrs = ["NF#","Emitente","CNPJ Emitente","Valor Bruto","Emissão","Status","Chave de Acesso"];
  const DCOLS = ["B","C","D","E","F","G","H"];
  hdrs.forEach((h, i) => { ws.getCell(`${DCOLS[i]}9`).value = h; });
  applyFcColumnHeader(ws, 9, "B", "H", fcConfig.corCabecalho);

  rows.forEach((n, idx) => {
    const r   = idx + 10;
    const btm = idx === rows.length - 1 ? FC_MED : FC_THIN_STYLE;
    const fill = idx % 2 === 0 ? XLSX_FILLS.white : XLSX_FILLS.zebra;
    const vals: [string, any][] = [
      ["B", n.numero_nf ?? ""],
      ["C", n.emitente_nome ?? ""],
      ["D", fmtCnpj(n.emitente_cnpj)],
      ["E", parseFloat(String(n.valor_bruto ?? 0)) || 0],
      ["F", fmtDate(n.data_emissao)],
      ["G", n.status ?? ""],
      ["H", n.chave_acesso ?? ""],
    ];
    vals.forEach(([col, val]) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.value = val;
      if (col === "E") cell.numFmt = FC_BRL;
      cell.font = { size: 10, name: "Calibri" };
      cell.alignment = {
        horizontal: col === "E" ? "right" : col === "B" || col === "F" ? "center" : "left",
        vertical: "middle",
        wrapText: col === "H",
      };
      cell.fill = fill;
      cell.border = {
        top: FC_THIN_STYLE, bottom: btm,
        left: col === "B" ? FC_MED : FC_THIN_STYLE,
        right: col === "H" ? FC_MED : FC_THIN_STYLE,
      };
    });
  });

  const lastDataRow = rows.length > 0 ? rows.length + 9 : 9;
  const totRow = lastDataRow + 1;
  DCOLS.forEach(col => {
    const cell = ws.getCell(`${col}${totRow}`);
    if (col === "B") {
      cell.value = "TOTAL";
      cell.font = { bold: true, size: 11, name: "Calibri" };
    } else if (col === "E" && rows.length > 0) {
      cell.value = { formula: `SUM(E10:E${lastDataRow})`, result: 0 };
      cell.numFmt = FC_BRL;
      cell.font = { bold: true, size: 11, name: "Calibri" };
      cell.alignment = { horizontal: "right", vertical: "middle" };
    }
    cell.fill = XLSX_FILLS.total;
    cell.border = {
      top: FC_MED, bottom: FC_MED,
      left: col === "B" ? FC_MED : FC_THIN_STYLE,
      right: col === "H" ? FC_MED : FC_THIN_STYLE,
    };
  });

  if (rows.length > 0) {
    ws.addConditionalFormatting({
      ref: `G10:G${lastDataRow}`,
      rules: [
        { type: "containsText", operator: "containsText", text: "conciliada", priority: 1,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FF00B050" } }, font: { color: { argb: "FFFFFFFF" }, bold: true, name: "Calibri", size: 10 } } },
        { type: "containsText", operator: "containsText", text: "pendente",   priority: 2,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC000" } }, font: { color: { argb: "FF7B3500" }, name: "Calibri", size: 10 } } },
        { type: "containsText", operator: "containsText", text: "cancelada",  priority: 3,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFF0000" } }, font: { color: { argb: "FFFFFFFF" }, bold: true, name: "Calibri", size: 10 } } },
      ],
    } as any);
  }
  if (rows.length === 0) {
    ws.getCell("B10").value = "Nenhuma NF-e recebida no período.";
    ws.getCell("B10").font = { italic: true, color: { argb: "FF64748B" }, name: "Calibri", size: 11 };
  }
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

async function buildExtratoGeralXlsx(
  rows: any[],
  label: string,
  fcConfig: FcXlsxConfig,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Extrato Completo");

  ws.getColumn("B").width = 12;
  ws.getColumn("C").width = 28;
  ws.getColumn("D").width = 10;
  ws.getColumn("E").width = 16;
  ws.getColumn("F").width = 52;
  ws.getColumn("G").width = 34;
  ws.getColumn("H").width = 18;
  ws.getColumn("I").width = 10;
  ws.getColumn("J").width = 12;

  applyFcHeader(wb, ws, {
    titulo: "EXTRATO BANCÁRIO CONSOLIDADO",
    subtitulo: label,
    lastDataCol: "J",
  }, fcConfig);

  const hdrs = ["Data","Conta","Agência","Nº Conta","Descrição","Histórico Real","Valor","Tipo","Conciliado"];
  const DCOLS = ["B","C","D","E","F","G","H","I","J"];
  hdrs.forEach((h, i) => { ws.getCell(`${DCOLS[i]}9`).value = h; });
  applyFcColumnHeader(ws, 9, "B", "J", fcConfig.corCabecalho);

  rows.forEach((b, idx) => {
    const r    = idx + 10;
    const btm  = idx === rows.length - 1 ? FC_MED : FC_THIN_STYLE;
    const fill = idx % 2 === 0 ? XLSX_FILLS.white : XLSX_FILLS.zebra;
    const valor = parseFloat(String(b.valor)) || 0;
    const tipo  = b.tipo === "credito" ? "Entrada" : "Saída";
    const vals: [string, any][] = [
      ["B", fmtDate(b.data)],
      ["C", b.conta_nome ?? ""],
      ["D", b.conta_agencia ?? ""],
      ["E", b.conta_numero ?? ""],
      ["F", b.descricao ?? ""],
      ["G", b.fornecedor_nome ?? ""],
      ["H", valor],
      ["I", tipo],
      ["J", b.conciliado ? "Sim" : "Não"],
    ];
    vals.forEach(([col, val]) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.value = val;
      if (col === "H") cell.numFmt = FC_BRL;
      cell.font = { size: 11, name: "Calibri" };
      cell.alignment = {
        horizontal: col === "H" ? "right" : ["B","I","J"].includes(col) ? "center" : "left",
        vertical: "middle",
      };
      cell.fill = fill;
      cell.border = {
        top: FC_THIN_STYLE, bottom: btm,
        left: col === "B" ? FC_MED : FC_THIN_STYLE,
        right: col === "J" ? FC_MED : FC_THIN_STYLE,
      };
    });
  });

  const lastDataRow = rows.length > 0 ? rows.length + 9 : 9;
  const totRow1 = lastDataRow + 1;
  const totRow2 = lastDataRow + 2;
  const totRow3 = lastDataRow + 3;

  const writeSumRow = (r: number, lbl: string, formula: string, isLast: boolean) => {
    DCOLS.forEach(col => {
      const cell = ws.getCell(`${col}${r}`);
      if (col === "B") {
        cell.value = lbl;
        cell.font = { bold: true, size: 11, name: "Calibri" };
      } else if (col === "H" && rows.length > 0) {
        cell.value = { formula, result: 0 };
        cell.numFmt = FC_BRL;
        cell.font = { bold: true, size: 11, name: "Calibri" };
        cell.alignment = { horizontal: "right", vertical: "middle" };
      }
      cell.fill = XLSX_FILLS.total;
      cell.border = {
        top: FC_THIN_STYLE,
        bottom: isLast ? FC_MED : FC_THIN_STYLE,
        left: col === "B" ? FC_MED : FC_THIN_STYLE,
        right: col === "J" ? FC_MED : FC_THIN_STYLE,
      };
    });
  };

  writeSumRow(totRow1, "Total Entradas",  `SUMIF(H10:H${lastDataRow},">0")`, false);
  writeSumRow(totRow2, "Total Saídas",    `ABS(SUMIF(H10:H${lastDataRow},"<0"))`, false);
  writeSumRow(totRow3, "Saldo Líquido",   `SUM(H10:H${lastDataRow})`, true);

  if (rows.length > 0) {
    ws.addConditionalFormatting({
      ref: `H10:H${lastDataRow}`,
      rules: [
        { type: "cellIs", operator: "greaterThan", formulae: [0], priority: 1,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFE8F5E9" } }, font: { color: { argb: "FF1B5E20" }, name: "Calibri", size: 11 } } },
        { type: "cellIs", operator: "lessThan",    formulae: [0], priority: 2,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFCE4D6" } }, font: { color: { argb: "FFB71C1C" }, name: "Calibri", size: 11 } } },
      ],
    } as any);
    ws.addConditionalFormatting({
      ref: `I10:I${lastDataRow}`,
      rules: [
        { type: "containsText", operator: "containsText", text: "Entrada", priority: 1,
          style: { font: { color: { argb: "FF1B5E20" }, bold: true, name: "Calibri", size: 11 } } },
        { type: "containsText", operator: "containsText", text: "Saída", priority: 2,
          style: { font: { color: { argb: "FFB71C1C" }, bold: true, name: "Calibri", size: 11 } } },
      ],
    } as any);
  }
  if (rows.length === 0) {
    ws.getCell("B10").value = "Nenhum lançamento bancário no período.";
    ws.getCell("B10").font = { italic: true, color: { argb: "FF64748B" }, name: "Calibri", size: 11 };
  }
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

async function buildOcsXlsx(
  rows: any[],
  label: string,
  fcConfig: FcXlsxConfig,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ordens de Compra");

  ws.getColumn("B").width = 10;
  ws.getColumn("C").width = 38;
  ws.getColumn("D").width = 20;
  ws.getColumn("E").width = 18;
  ws.getColumn("F").width = 28;
  ws.getColumn("G").width = 12;
  ws.getColumn("H").width = 14;
  ws.getColumn("I").width = 12;
  ws.getColumn("J").width = 14;

  applyFcHeader(wb, ws, {
    titulo: "ORDENS DE COMPRA × NF-e",
    subtitulo: label,
    lastDataCol: "J",
  }, fcConfig);

  const hdrs = ["OC#","Fornecedor","CNPJ","Valor Total","Obra","Tipo","Status","Criado em","NF-e Vinculada"];
  const DCOLS = ["B","C","D","E","F","G","H","I","J"];
  hdrs.forEach((h, i) => { ws.getCell(`${DCOLS[i]}9`).value = h; });
  applyFcColumnHeader(ws, 9, "B", "J", fcConfig.corCabecalho);

  rows.forEach((o, idx) => {
    const r   = idx + 10;
    const btm = idx === rows.length - 1 ? FC_MED : FC_THIN_STYLE;
    const fill = idx % 2 === 0 ? XLSX_FILLS.white : XLSX_FILLS.zebra;
    const vals: [string, any][] = [
      ["B", o.numero ?? ""],
      ["C", o.supplier_razao ?? ""],
      ["D", fmtCnpj(o.supplier_cnpj)],
      ["E", parseFloat(String(o.valor_total ?? 0)) || 0],
      ["F", o.obra_nome ?? ""],
      ["G", o.tipo ?? ""],
      ["H", o.status ?? ""],
      ["I", fmtDate(o.created_at)],
      ["J", o.nfe_vinculada ?? "—"],
    ];
    vals.forEach(([col, val]) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.value = val;
      if (col === "E") cell.numFmt = FC_BRL;
      cell.font = { size: 11, name: "Calibri" };
      cell.alignment = {
        horizontal: col === "E" ? "right" : ["B","I"].includes(col) ? "center" : "left",
        vertical: "middle",
      };
      cell.fill = fill;
      cell.border = {
        top: FC_THIN_STYLE, bottom: btm,
        left: col === "B" ? FC_MED : FC_THIN_STYLE,
        right: col === "J" ? FC_MED : FC_THIN_STYLE,
      };
    });
  });

  const lastDataRow = rows.length > 0 ? rows.length + 9 : 9;
  const totRow = lastDataRow + 1;
  DCOLS.forEach(col => {
    const cell = ws.getCell(`${col}${totRow}`);
    if (col === "B") {
      cell.value = "TOTAL";
      cell.font = { bold: true, size: 11, name: "Calibri" };
    } else if (col === "E" && rows.length > 0) {
      cell.value = { formula: `SUM(E10:E${lastDataRow})`, result: 0 };
      cell.numFmt = FC_BRL;
      cell.font = { bold: true, size: 11, name: "Calibri" };
      cell.alignment = { horizontal: "right", vertical: "middle" };
    }
    cell.fill = XLSX_FILLS.total;
    cell.border = {
      top: FC_MED, bottom: FC_MED,
      left: col === "B" ? FC_MED : FC_THIN_STYLE,
      right: col === "J" ? FC_MED : FC_THIN_STYLE,
    };
  });

  if (rows.length > 0) {
    ws.addConditionalFormatting({
      ref: `H10:H${lastDataRow}`,
      rules: [
        { type: "containsText", operator: "containsText", text: "aprovada", priority: 1,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FF00B050" } }, font: { color: { argb: "FFFFFFFF" }, bold: true, name: "Calibri", size: 11 } } },
        { type: "containsText", operator: "containsText", text: "pendente", priority: 2,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC000" } }, font: { color: { argb: "FF7B3500" }, name: "Calibri", size: 11 } } },
        { type: "containsText", operator: "containsText", text: "cancelada", priority: 3,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFF0000" } }, font: { color: { argb: "FFFFFFFF" }, bold: true, name: "Calibri", size: 11 } } },
      ],
    } as any);
    ws.addConditionalFormatting({
      ref: `J10:J${lastDataRow}`,
      rules: [
        { type: "notContainsText", operator: "notContains", text: "—", priority: 1,
          style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFE8F5E9" } }, font: { color: { argb: "FF1B5E20" }, name: "Calibri", size: 11 } } },
      ],
    } as any);
  }
  if (rows.length === 0) {
    ws.getCell("B10").value = "Nenhuma ordem de compra no período.";
    ws.getCell("B10").font = { italic: true, color: { argb: "FF64748B" }, name: "Calibri", size: 11 };
  }
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
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

export interface DocxTemplateConfig {
  corPrincipal:  string;
  emailContador: string;
  nomeContador:  string;
}

export const DEFAULT_DOCX_CONFIG: DocxTemplateConfig = {
  corPrincipal:  "1B2A4A",
  emailContador: "contabil@pronustributario.com.br",
  nomeContador:  "Pronus Tributário",
};

export async function buildChecklistDocxExemplo(empresa: string, cfg: DocxTemplateConfig): Promise<Buffer> {
  const fakeData = {
    nfseEmitidas: Array(5).fill({}),
    nfseTomadas:  [],
    nfe:          Array(12).fill({}),
    bank:         [
      ...Array(20).fill({ tipo: "credito", fn_numero: null }),
      ...Array(48).fill({ tipo: "debito",  fn_numero: null }),
      ...Array(10).fill({ tipo: "credito", fn_numero: "12345" }),
      ...Array(5).fill({ tipo: "debito",   fn_numero: "67890" }),
    ],
    ocs:    Array(8).fill({ nfe_vinculada: true }),
    cartao: Array(14).fill({}),
  };
  return buildChecklistDocx("Exemplo — Junho 2026", empresa, fakeData as any, cfg);
}

async function buildChecklistDocx(label: string, empresa: string, d: ReturnType<typeof sumarizar>, docxCfg?: DocxTemplateConfig): Promise<Buffer> {
  const cfg = docxCfg ?? DEFAULT_DOCX_CONFIG;
  const { nfseEmitidas, nfseTomadas, nfe, bank, ocs, cartao } = d;
  const entSemNF = bank.filter((b: any) => b.tipo === "credito" && !b.fn_numero).length;
  const saiSemNF = bank.filter((b: any) => b.tipo === "debito"  && !b.fn_numero).length;
  const ocsSemNF = ocs.filter((o: any) => !o.nfe_vinculada).length;
  const geradoEm = new Date().toLocaleString("pt-BR");
  const temPendencias = entSemNF + saiSemNF + ocsSemNF > 0;

  const AZUL   = cfg.corPrincipal.replace(/^#/, "");
  const CINZA  = "64748B";
  const VERDE  = "166534";
  const LARANJA = "B45309";
  const FONTE  = "Calibri";

  // ── Logo da empresa ────────────────────────────────────────────────────────
  const logoCandidates = [
    { p: path.join(process.cwd(), "client/public/logo-fc.jpg"),               type: "jpg"  as const },
    { p: path.join(process.cwd(), "client/public/logo-fc-branco-amarelo.png"), type: "png"  as const },
    { p: path.join(process.cwd(), "server/assets/logo_contabilidade.png"),     type: "png"  as const },
  ];
  let logoBuffer: Buffer | null = null;
  let logoType: "jpg" | "png" = "jpg";
  for (const c of logoCandidates) {
    try { if (fs.existsSync(c.p)) { logoBuffer = fs.readFileSync(c.p); logoType = c.type; break; } } catch { /* próximo */ }
  }
  // Logo 137×63px → exibir ~4.5cm largo (EMU: 1cm=360000)
  const LOGO_W = 1620000; // ~4.5cm
  const LOGO_H = 745000;  // proporcional 63/137

  // ── Medidas absolutas em twips (DXA) ──────────────────────────────────────
  // A4 retrato: 11906 × 16838 twips
  // Margens: L=1134 R=1134 → área de conteúdo = 11906 - 1134 - 1134 = 9638 twips
  const W = 9638;            // largura total do conteúdo
  const W_LOGO = 3000;       // coluna logo no cabeçalho
  const W_NOME = W - W_LOGO; // coluna nome empresa no cabeçalho
  const W_LABEL = 3000;      // coluna "Rótulo" na tabela de controle
  const W_VALOR = W - W_LABEL;  // coluna "Valor"
  const W_DOC   = 7800;      // coluna "Tipo de Documento" no resumo
  const W_QTD   = W - W_DOC; // coluna "Qtd."

  const SEM = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
  const BRD = (c = "D0D5DD") => ({ style: BorderStyle.SINGLE, size: 6, color: c }) as const;

  // ── Helpers de células ─────────────────────────────────────────────────────
  function cLabel(txt: string) {
    return new TableCell({
      shading: { type: ShadingType.SOLID, color: "EFF4FB", fill: "EFF4FB" },
      margins: { top: 80, bottom: 80, left: 160, right: 160 },
      borders: { top: BRD(), bottom: BRD(), left: BRD(), right: BRD() },
      width: { size: W_LABEL, type: WidthType.DXA },
      children: [new Paragraph({ children: [new TextRun({ text: txt, bold: true, size: 18, color: CINZA, font: FONTE })] })],
    });
  }
  function cValor(txt: string) {
    return new TableCell({
      margins: { top: 80, bottom: 80, left: 160, right: 160 },
      borders: { top: BRD(), bottom: BRD(), left: BRD(), right: BRD() },
      width: { size: W_VALOR, type: WidthType.DXA },
      children: [new Paragraph({ children: [new TextRun({ text: txt, size: 18, font: FONTE })] })],
    });
  }
  function cHead(txt: string, w: number) {
    return new TableCell({
      shading: { type: ShadingType.SOLID, color: AZUL, fill: AZUL },
      margins: { top: 100, bottom: 100, left: 160, right: 160 },
      borders: { top: BRD(AZUL), bottom: BRD(AZUL), left: BRD(AZUL), right: BRD(AZUL) },
      width: { size: w, type: WidthType.DXA },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: txt, bold: true, size: 18, color: "FFFFFF", font: FONTE })] })],
    });
  }
  function cData(txt: string, w: number, center = false) {
    return new TableCell({
      margins: { top: 80, bottom: 80, left: 160, right: 160 },
      borders: { top: BRD(), bottom: BRD(), left: BRD(), right: BRD() },
      width: { size: w, type: WidthType.DXA },
      children: [new Paragraph({ alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: txt, size: 20, font: FONTE, bold: center })] })],
    });
  }

  // ── Seção colorida (faixa título) ─────────────────────────────────────────
  function secao(titulo: string) {
    return new Table({
      width: { size: W, type: WidthType.DXA },
      columnWidths: [W],
      borders: { top: SEM, bottom: SEM, left: SEM, right: SEM, insideH: SEM, insideV: SEM },
      rows: [new TableRow({ children: [new TableCell({
        shading: { type: ShadingType.SOLID, color: AZUL, fill: AZUL },
        margins: { top: 100, bottom: 100, left: 200, right: 200 },
        borders: { top: SEM, bottom: SEM, left: SEM, right: SEM },
        width: { size: W, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: titulo, bold: true, size: 22, color: "FFFFFF", font: FONTE })] })],
      })]})],
    });
  }

  // ── Item de lista ─────────────────────────────────────────────────────────
  function item(txt: string, ok = false) {
    const icone = ok ? "\u2611  " : "\u25A1  ";
    return new Paragraph({
      children: [
        new TextRun({ text: icone, size: 20, font: FONTE, color: ok ? VERDE : CINZA }),
        new TextRun({ text: txt,   size: 20, font: FONTE }),
      ],
      spacing: { before: 80, after: 80 },
      indent: { left: 480 },
    });
  }

  // ── Pendência ─────────────────────────────────────────────────────────────
  function pend(txt: string, err: boolean) {
    return new Paragraph({
      children: [
        new TextRun({ text: err ? "\u26A0  " : "\u2713  ", bold: true, size: 20, font: FONTE, color: err ? LARANJA : VERDE }),
        new TextRun({ text: txt, size: 20, font: FONTE, color: err ? LARANJA : VERDE }),
      ],
      spacing: { before: 80, after: 80 },
      indent: { left: 480 },
    });
  }

  // ── Espaçador ─────────────────────────────────────────────────────────────
  function esp(pts = 120) { return new Paragraph({ text: "", spacing: { before: pts, after: 0 } }); }

  // ── Tabela de controle (cabeçalho do documento) ───────────────────────────
  const tblControle = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W_LABEL, W_VALOR],
    rows: [
      new TableRow({ children: [cLabel("Empresa"),       cValor(empresa)] }),
      new TableRow({ children: [cLabel("Período"),       cValor(label)] }),
      new TableRow({ children: [cLabel("Documento Nº"), cValor("FC-CONT-001")] }),
      new TableRow({ children: [cLabel("Gerado em"),     cValor(geradoEm)] }),
    ],
  });

  // ── Tabela de resumo ──────────────────────────────────────────────────────
  const tblResumo = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W_DOC, W_QTD],
    rows: [
      new TableRow({ children: [cHead("Tipo de Documento", W_DOC), cHead("Qtd.", W_QTD)] }),
      new TableRow({ children: [cData("NFS-e emitidas (faturas)",  W_DOC), cData(String(nfseEmitidas.length), W_QTD, true)] }),
      new TableRow({ children: [cData("NFS-e tomadas (serviços)",  W_DOC), cData(String(nfseTomadas.length),  W_QTD, true)] }),
      new TableRow({ children: [cData("NF-e recebidas (compras)",  W_DOC), cData(String(nfe.length),          W_QTD, true)] }),
      new TableRow({ children: [cData("Entradas bancárias",        W_DOC), cData(String(bank.filter((b: any) => b.tipo === "credito").length), W_QTD, true)] }),
      new TableRow({ children: [cData("Saídas bancárias",          W_DOC), cData(String(bank.filter((b: any) => b.tipo === "debito" ).length), W_QTD, true)] }),
      new TableRow({ children: [cData("Lançamentos de cartão",     W_DOC), cData(String(cartao.length), W_QTD, true)] }),
      new TableRow({ children: [cData("Ordens de compra",          W_DOC), cData(String(ocs.length),    W_QTD, true)] }),
    ],
  });

  // ── Banner de título ──────────────────────────────────────────────────────
  const tituloDoc = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W],
    borders: { top: SEM, bottom: SEM, left: SEM, right: SEM, insideH: SEM, insideV: SEM },
    rows: [new TableRow({ children: [new TableCell({
      shading: { type: ShadingType.SOLID, color: AZUL, fill: AZUL },
      margins: { top: 180, bottom: 180, left: 240, right: 240 },
      borders: { top: SEM, bottom: SEM, left: SEM, right: SEM },
      width: { size: W, type: WidthType.DXA },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `CHECKLIST — PACOTE CONTABILIDADE  ·  ${label}`, bold: true, size: 30, color: "FFFFFF", font: FONTE })],
      })],
    })]})],
  });

  // ── Documento ─────────────────────────────────────────────────────────────
  const doc = new Document({
    creator: "ERP FC Engenharia",
    title:   `Checklist Contabilidade — ${label}`,
    sections: [{
      properties: {
        page: {
          size:   { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1134, bottom: 1134, left: 1134, header: 709, footer: 709 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: AZUL, space: 4 } },
            spacing: { before: 0, after: 80 },
            children: [
              new TextRun({ text: "FC ENGENHARIA  ·  PACOTE CONTABILIDADE  ·  ", size: 16, font: FONTE, color: CINZA }),
              new TextRun({ text: label, size: 16, font: FONTE, color: AZUL, bold: true }),
            ],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: "D0D5DD", space: 4 } },
            spacing: { before: 80, after: 0 },
            children: [
              new TextRun({ text: `Gerado pelo ERP FC Engenharia  ·  ${geradoEm}  ·  Pág. `, size: 16, font: FONTE, color: "94A3B8" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, font: FONTE, color: "94A3B8" }),
              new TextRun({ text: " / ", size: 16, font: FONTE, color: "94A3B8" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: FONTE, color: "94A3B8" }),
            ],
          })],
        }),
      },
      children: [
        // ── Cabeçalho com logo ────────────────────────────────────────────
        new Table({
          width: { size: W, type: WidthType.DXA },
          columnWidths: [W_LOGO, W_NOME],
          borders: { top: SEM, bottom: { style: BorderStyle.SINGLE, size: 8, color: AZUL }, left: SEM, right: SEM, insideH: SEM, insideV: SEM },
          rows: [new TableRow({ children: [
            // ── Logo ──────────────────────────────────────────────────────
            new TableCell({
              borders: { top: SEM, bottom: SEM, left: SEM, right: SEM },
              margins: { top: 60, bottom: 60, left: 0, right: 160 },
              width: { size: W_LOGO, type: WidthType.DXA },
              verticalAlign: "center" as any,
              children: [new Paragraph({
                alignment: AlignmentType.LEFT,
                children: logoBuffer ? [new ImageRun({
                  data: logoBuffer,
                  transformation: { width: LOGO_W, height: LOGO_H },
                  type: logoType,
                } as any)] : [new TextRun({ text: "FC ENGENHARIA", bold: true, size: 28, color: AZUL, font: FONTE })],
              })],
            }),
            // ── Nome + certificação ───────────────────────────────────────
            new TableCell({
              borders: { top: SEM, bottom: SEM, left: SEM, right: SEM },
              margins: { top: 60, bottom: 60, left: 160, right: 0 },
              width: { size: W_NOME, type: WidthType.DXA },
              verticalAlign: "center" as any,
              children: [
                new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 40 }, children: [new TextRun({ text: "FC ENGENHARIA E CONSTRUÇÃO LTDA", bold: true, size: 28, color: AZUL, font: FONTE })] }),
                new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 0  }, children: [new TextRun({ text: "Sistema de Gestão da Qualidade  ·  ISO 9001", size: 16, color: CINZA, font: FONTE, italics: true })] }),
              ],
            }),
          ]})],
        }),
        esp(180),
        // ── Tabela de controle ───────────────────────────────────────────
        tblControle,
        esp(180),
        // ── Banner de título ─────────────────────────────────────────────
        tituloDoc,
        esp(240),
        // ── Seção 1 ──────────────────────────────────────────────────────
        secao("1. ESTRUTURA DO PACOTE"),
        esp(120),
        item("01_Faturas_Emitidas/     →  NFS-e emitidas (espelho HTML + Lista_Faturas_Emitidas.xlsx)", true),
        item("02_Servicos_Tomados/    →  NFS-e tomadas (HTML + Lista_Servicos_Tomados.xlsx)", true),
        item("02_Servicos_Tomados/    →  NF-e recebidas compras (NF-e_Recebidas_Compras.xlsx)", true),
        item("03_Extratos_Bancarios/  →  Extrato_Bancario_<Mes>.xlsx + Extrato_Completo.xlsx", true),
        item("04_Extratos_Cartoes/    →  Extrato_Cartao_<Mes>.xlsx (cartão de crédito)", true),
        item("05_OCs_NF-e/             →  OCs_NF-e.xlsx (ordens de compra × NF-e vinculada)", true),
        item("06_OS_Servico/           →  Ordens de Serviço emitidas no período", true),
        esp(240),
        // ── Seção 2 ──────────────────────────────────────────────────────
        secao("2. RESUMO DO PERÍODO"),
        esp(120),
        tblResumo,
        esp(240),
        // ── Seção 3 ──────────────────────────────────────────────────────
        secao(`3. PENDÊNCIAS${!temPendencias ? "  —  NENHUMA  \u2713" : ""}`),
        esp(120),
        pend(entSemNF > 0 ? `${entSemNF} entrada(s) bancária(s) SEM NFS-e vinculada` : "Entradas bancárias — OK", entSemNF > 0),
        pend(saiSemNF > 0 ? `${saiSemNF} saída(s) bancária(s) SEM NF-e vinculada`   : "Saídas bancárias — OK",   saiSemNF > 0),
        pend(ocsSemNF > 0 ? `${ocsSemNF} OC(s) SEM NF-e correspondente`             : "Ordens de compra — OK",   ocsSemNF > 0),
        esp(240),
        // ── Seção 4 ──────────────────────────────────────────────────────
        secao(`4. ENVIAR AO CONTADOR  (${cfg.emailContador})`),
        esp(120),
        item("Este arquivo ZIP completo"),
        item("Guia de ISS recolhido (gerada no portal da prefeitura)"),
        item("Folha de pagamento assinada + holerites"),
        item("Comprovantes de pagamento FGTS / GPS"),
        item("Declaração de faturamento (se solicitado)"),
        esp(240),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
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
    `  Faturas_Emitidas/          → NFS-e emitidas (espelho HTML + Lista_Faturas_Emitidas.xlsx)`,
    `  Servicos_Tomados/          → NFS-e tomadas (HTML + Lista_Servicos_Tomados.xlsx + NF-e_Recebidas_Compras.xlsx)`,
    `  Extratos_Bancarios/        → Extrato_Bancario_<Mes>.xlsx + Extrato_Completo.xlsx`,
    `  Extratos_Cartoes/          → Extrato_Cartao_<Mes>.xlsx (lançamentos de cartão)`,
    `  02_OCs_NF-e.xlsx           → Ordens de compra × NF-e`,
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

      const fcConfig = await loadFcXlsxConfig(companyId);

      // Carrega config do template Word (docx_template_config)
      let docxConfig: import("./downloadPacoteContador").DocxTemplateConfig = DEFAULT_DOCX_CONFIG;
      try {
        const dcQ = await db.$client.query(
          `SELECT cor_principal, email_contador, nome_contador FROM docx_template_config WHERE company_id=$1 ORDER BY id DESC LIMIT 1`,
          [companyId]
        );
        if (dcQ.rows.length > 0) {
          const dr = dcQ.rows[0] as any;
          docxConfig = {
            corPrincipal:  dr.cor_principal  ?? DEFAULT_DOCX_CONFIG.corPrincipal,
            emailContador: dr.email_contador ?? DEFAULT_DOCX_CONFIG.emailContador,
            nomeContador:  dr.nome_contador  ?? DEFAULT_DOCX_CONFIG.nomeContador,
          };
        }
      } catch { /* fallback silencioso ao DEFAULT_DOCX_CONFIG */ }


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
        archive.append(await buildChecklistDocx(label, empresa, data, docxConfig), { name: `${f}/00_CHECKLIST.docx` });

        // ── 01 — Faturas Emitidas ─────────────────────────────────────────────
        for (const n of nfseEmitidas) {
          const nome = safeName(`NFS-e_${n.numero_nf || n.id}_${n.tomador_razao_social || "SemNome"}`);
          archive.append(buildNfseHtml(n, "emitida", empresa), { name: `${f}/01_Faturas_Emitidas/${nome}.html` });
        }
        try {
          const xlsxFat = await buildListaFaturasXlsx(nfseEmitidas, "emitida", label, fcConfig);
          archive.append(xlsxFat, { name: `${f}/01_Faturas_Emitidas/Lista_Faturas_Emitidas.xlsx` });
        } catch (e: any) {
          console.error("[PacoteContador] XLSX faturas emitidas erro:", e.message);
          if (nfseEmitidas.length === 0) {
            archive.append(Buffer.from("Nenhuma NFS-e emitida no período.\n","utf8"), { name: `${f}/01_Faturas_Emitidas/sem_dados.txt` });
          }
        }

        // ── 02 — Serviços Tomados ─────────────────────────────────────────────
        for (const n of nfseTomadas) {
          const nome = safeName(`NFS-e_${n.numero_nf || n.id}_${n.emitente_nome || "SemNome"}`);
          archive.append(buildNfseHtml(n, "tomada", empresa), { name: `${f}/02_Servicos_Tomados/${nome}.html` });
        }
        try {
          const xlsxSvc = await buildListaFaturasXlsx(nfseTomadas, "tomada", label, fcConfig);
          archive.append(xlsxSvc, { name: `${f}/02_Servicos_Tomados/Lista_Servicos_Tomados.xlsx` });
        } catch (e: any) {
          console.error("[PacoteContador] XLSX serviços tomados erro:", e.message);
        }
        try {
          const xlsxNfe = await buildNfeXlsx(nfe, label, fcConfig);
          archive.append(xlsxNfe, { name: `${f}/02_Servicos_Tomados/NF-e_Recebidas_Compras.xlsx` });
        } catch (e: any) {
          console.error("[PacoteContador] XLSX NF-e recebidas erro:", e.message);
        }
        if (nfseTomadas.length + nfe.length === 0) {
          archive.append(Buffer.from("Nenhuma NFS-e tomada ou NF-e recebida no período.\n","utf8"), { name: `${f}/02_Servicos_Tomados/sem_dados.txt` });
        }

        // ── 03 — Extratos Bancários ───────────────────────────────────────────
        try {
          const xlsxBuf = await buildExtratoBancarioBuffer(db, companyId, m, ano, empresa);
          archive.append(xlsxBuf, { name: `${f}/03_Extratos_Bancarios/Extrato_Bancario_${MESES[m-1]}_${ano}.xlsx` });
        } catch (e: any) {
          console.error("[PacoteContador] XLSX bancário erro:", e.message);
        }
        try {
          const xlsxExt = await buildExtratoGeralXlsx(bank, label, fcConfig);
          archive.append(xlsxExt, { name: `${f}/03_Extratos_Bancarios/Extrato_Completo.xlsx` });
        } catch (e: any) {
          console.error("[PacoteContador] XLSX extrato geral erro:", e.message);
          if (bank.length === 0) {
            archive.append(Buffer.from("Nenhum extrato bancário importado no período.\n","utf8"), { name: `${f}/03_Extratos_Bancarios/sem_dados.txt` });
          }
        }

        // ── 04 — Extratos Cartões ─────────────────────────────────────────────
        try {
          const cartaoXlsx = await buildExtratCartaoBuffer(db, companyId, m, ano, empresa);
          archive.append(cartaoXlsx, { name: `${f}/04_Extratos_Cartoes/Extrato_Cartao_${MESES[m-1]}_${ano}.xlsx` });
        } catch (e: any) {
          console.error("[PacoteContador] XLSX cartão erro:", e.message);
        }

        // ── 05 — Compras / OCs ───────────────────────────────────────────────
        try {
          const xlsxOcs = await buildOcsXlsx(ocs, label, fcConfig);
          archive.append(xlsxOcs, { name: `${f}/05_OCs_NF-e/OCs_NF-e.xlsx` });
        } catch (e: any) {
          console.error("[PacoteContador] XLSX OCs erro:", e.message);
          archive.append(Buffer.from("Nenhuma ordem de compra no período.\n","utf8"), { name: `${f}/05_OCs_NF-e/sem_dados.txt` });
        }

        // ── 06 — Ordens de Serviço ────────────────────────────────────────────
        archive.append(
          Buffer.from(`Ordens de Serviço — ${label}\n\nEsta pasta destina-se às Ordens de Serviço (OS) emitidas no período.\nImporte ou adicione os arquivos de OS aqui antes de enviar ao contador.\n`, "utf8"),
          { name: `${f}/06_OS_Servico/LEIA-ME.txt` }
        );
      };

      if (mes >= 1 && mes <= 12) {
        // Pacote mensal
        const folder = `${safeName(empresa)}_${MESES[mes-1]}_${ano}`;
        const filename = `Pacote_Contador_${MESES[mes-1]}_${ano}.zip`;
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        archive.pipe(res);
        await processarMes(mes, folder);
      } else {
        // Pacote anual
        const filename = `Pacote_Contador_Anual_${ano}.zip`;
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        archive.pipe(res);
        for (let m = 1; m <= 12; m++) {
          await processarMes(m, `${String(m).padStart(2,"0")}_${MESES[m-1]}`);
        }
      }

      await archive.finalize();
    } catch (err: any) {
      console.error("[PacoteContador] Erro geral:", err);
      if (!res.headersSent) res.status(500).json({ error: "Erro interno ao gerar pacote" });
    }
  });
}
