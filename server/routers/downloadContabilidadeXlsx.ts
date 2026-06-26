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

// Formato BRL: positivo "R$ 10,00" | negativo "-R$ 10,00" | zero "R$ 0,00"
const BRL = '"R$ "#,##0.00;"-R$ "#,##0.00';

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

    // Linha 1 — título empresa (A1:H1)
    addCell(ws, "A1", tituloEmpresa, "s", sTitle());

    // Linhas 3-4 — caixa banco (A3:F4 mesclado) + metadata saldo anterior
    for (const addr of ["B3","C3","D3","E3","F3","A4","B4","C4","D4","E4","F4"]) {
      addCell(ws, addr, "", "s", sBankEmpty());
    }
    addCell(ws, "A3", bancoLabel, "s", sBank());

    addCell(ws, "G3", "Data Saldo Anterior", "s", sInfoLabel());
    addCell(ws, "H3", dataSaldoAnt,           "s", sInfoDate());
    addCell(ws, "G4", "Saldo Anterior",        "s", sInfoLabel());
    addCell(ws, "H4", saldoInicial,            "n", sInfoMoney());

    // Linha 5 — cabeçalho roxo
    const hdrs = ["Data","Histórico do Banco","Histórico Real",
                  "Nº Nota Fiscal","Nº CNPJ","Entrada","Saída","Saldo"];
    const cols = ["A","B","C","D","E","F","G","H"];
    hdrs.forEach((h, i) => addCell(ws, `${cols[i]}5`, h, "s", sHeader()));

    // Linha 6+ — dados
    let saldo = saldoInicial;
    lines.forEach((line, idx) => {
      const row   = idx + 6;
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

    // Linha TOTAL
    const totalRow = lines.length + 6;
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
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },  // A1:H1 — título
      { s: { r: 2, c: 0 }, e: { r: 3, c: 5 } },  // A3:F4 — caixa banco
    ];
    ws["!cols"] = [
      { wch: 12 }, { wch: 44 }, { wch: 34 },
      { wch: 18 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 16 },
    ];
    ws["!rows"] = new Array(5).fill(null);
    ws["!rows"][0] = { hpt: 32 };  // Linha 1 — título
    ws["!rows"][1] = { hpt: 6  };  // Linha 2 — espaço
    ws["!rows"][2] = { hpt: 22 };  // Linha 3 — banco (topo)
    ws["!rows"][3] = { hpt: 22 };  // Linha 4 — banco (base)
    ws["!rows"][4] = { hpt: 28 };  // Linha 5 — cabeçalho

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

// ── Extrato Cartão de Crédito (XLSX Pronus) ──────────────────────────────────

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

  const wb = XLSX.utils.book_new();

  if (itemsQ.rows.length === 0) {
    const ws: XLSX.WorkSheet = {};
    addCell(ws, "A1", "Nenhum lançamento de cartão de crédito no período.", "s", sText());
    ws["!ref"] = "A1:A1";
    XLSX.utils.book_append_sheet(wb, ws, "Sem dados");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  // Agrupa por fatura
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

  // Uma aba por fatura
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

    // Linha 1 — título empresa (A1:H1)
    addCell(ws, "A1", tituloEmpresa, "s", sTitle());

    // Linhas 3-4 — caixa cartão (A3:F4 mesclado) + metadata
    for (const addr of ["B3","C3","D3","E3","F3","A4","B4","C4","D4","E4","F4"]) {
      addCell(ws, addr, "", "s", sBankEmpty());
    }
    addCell(ws, "A3", meta.cartao_label, "s", sBank());
    addCell(ws, "G3", "Vencimento",   "s", sInfoLabel());
    addCell(ws, "H3", meta.vencimento, "s", sInfoDate());
    addCell(ws, "G4", "Total Fatura", "s", sInfoLabel());
    addCell(ws, "H4", meta.fatura_total, "n", sInfoMoney());

    // Linha 5 — cabeçalho roxo
    hdrs.forEach((h, i) => addCell(ws, `${cols[i]}5`, h, "s", sHeader()));

    // Linha 6+ — itens
    let totalValor = 0;
    items.forEach((item, idx) => {
      const row   = idx + 6;
      const valor = parseFloat(String(item.valor)) || 0;
      totalValor += valor;
      const parcela = item.parcela_atual && item.parcela_total
        ? `${item.parcela_atual}/${item.parcela_total}` : "";
      const tipo = item.tipo
        ? String(item.tipo).charAt(0).toUpperCase() + String(item.tipo).slice(1)
        : "Compra";

      addCell(ws, `A${row}`, fmtDate(item.data),                   "s", sDate());
      addCell(ws, `B${row}`, item.descricao || "",                  "s", sText());
      addCell(ws, `C${row}`, item.cidade || "",                     "s", sText());
      addCell(ws, `D${row}`, tipo,                                  "s", sText());
      addCell(ws, `E${row}`, parcela,                               "s", sText());
      addCell(ws, `F${row}`, item.obra_nome || "",                  "s", sText());
      addCell(ws, `G${row}`, item.categoria_nome
                          || item.centro_custo_nome || "",          "s", sText());
      addCell(ws, `H${row}`, valor,                                 "n", sMoney("neutral"));
    });

    // Linha TOTAL
    const totalRow = items.length + 6;
    addCell(ws, `A${totalRow}`, "TOTAL", "s", sTotal(false));
    ["B","C","D","E","F","G"].forEach(c => addCell(ws, `${c}${totalRow}`, "", "s", sTotal(false)));
    addCell(ws, `H${totalRow}`, totalValor, "n", sTotal(true));

    ws["!ref"] = `A1:H${totalRow}`;
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },  // A1:H1 — título
      { s: { r: 2, c: 0 }, e: { r: 3, c: 5 } },  // A3:F4 — caixa cartão
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

    XLSX.utils.book_append_sheet(wb, ws, sn);
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
