import PDFDocument from "pdfkit";
import { getDb } from "../db";
import {
  comprasOrdens,
  comprasOrdensItens,
  fornecedores,
  companies,
  obras,
  bdiFd,
} from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  try {
    const date = new Date(d.length === 10 ? d + "T00:00:00" : d);
    return date.toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
};

const n = (v: any) => parseFloat(v ?? "0") || 0;

export async function generateFdApprovalPdf(ocId: number): Promise<Buffer> {
  const db = await getDb();

  const [oc] = await db.select().from(comprasOrdens).where(eq(comprasOrdens.id, ocId));
  if (!oc) throw new Error("OC não encontrada");

  const itens = await db.select().from(comprasOrdensItens).where(eq(comprasOrdensItens.ordemId, ocId));

  let fornecedor: any = null;
  if (oc.fornecedorId) {
    const [f] = await db.select().from(fornecedores).where(eq(fornecedores.id, oc.fornecedorId));
    fornecedor = f ?? null;
  }

  const [company] = await db.select().from(companies).where(eq(companies.id, oc.companyId));

  let obra: any = null;
  let orcamentoId: number | null = null;
  if (oc.obraId) {
    const obraRes = await db.execute(sql`SELECT * FROM obras WHERE id = ${oc.obraId} LIMIT 1`);
    obra = (obraRes as any).rows?.[0];
    orcamentoId = obra?.orcamento_id ?? null;
  }

  let itensFd: any[] = [];
  let totalFdOrcado = 0;
  let totalFdComprometido = 0;
  if (orcamentoId) {
    itensFd = await db.select().from(bdiFd).where(and(eq(bdiFd.orcamentoId, orcamentoId), eq(bdiFd.companyId, oc.companyId)));
    totalFdOrcado = itensFd.reduce((s, i) => s + n(i.total), 0);

    const ocsComFd = await db.select({ fdValor: comprasOrdens.fdValor })
      .from(comprasOrdens)
      .where(and(
        eq(comprasOrdens.companyId, oc.companyId),
        eq(comprasOrdens.obraId, oc.obraId!),
        sql`${comprasOrdens.modalidadeFd} = 'fd_cliente'`,
        sql`${comprasOrdens.status} != 'cancelada'`,
      ));
    totalFdComprometido = ocsComFd.reduce((s, o) => s + n(o.fdValor), 0);
  }

  const saldoFd = totalFdOrcado - totalFdComprometido;
  const fdValor = n((oc as any).fdValor);

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const pageW = doc.page.width;
  const mL = 40;
  const mR = 40;
  const cW = pageW - mL - mR;
  const primary = "#1B3A5C";
  const accent = "#2980b9";
  const dark = "#1a1a2e";
  const midGray = "#666666";
  const borderColor = "#dee2e6";

  function drawHLine(y: number, color = borderColor, width = 0.5) {
    doc.strokeColor(color).lineWidth(width).moveTo(mL, y).lineTo(pageW - mR, y).stroke();
  }

  let curY = 40;

  doc.font("Helvetica-Bold").fontSize(14).fillColor(primary)
    .text("SOLICITAÇÃO DE APROVAÇÃO — FATURAMENTO DIRETO", mL, curY, { align: "center", width: cW });
  curY += 25;

  doc.font("Helvetica").fontSize(9).fillColor(midGray)
    .text(`Documento gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`, mL, curY, { align: "center", width: cW });
  curY += 20;
  drawHLine(curY, accent, 1);
  curY += 15;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(primary).text("DADOS DA EMPRESA", mL, curY);
  curY += 15;
  doc.font("Helvetica").fontSize(9).fillColor(dark)
    .text(`Empresa: ${company?.name || "—"}`, mL, curY);
  curY += 13;
  doc.text(`CNPJ: ${(company as any)?.cnpj || "—"}`, mL, curY);
  curY += 20;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(primary).text("DADOS DA OBRA", mL, curY);
  curY += 15;
  doc.font("Helvetica").fontSize(9).fillColor(dark)
    .text(`Obra: ${obra?.nome || "—"}`, mL, curY);
  curY += 13;
  doc.text(`Local: ${obra?.local || obra?.endereco || "—"}`, mL, curY);
  curY += 20;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(primary).text("DADOS DA ORDEM DE COMPRA", mL, curY);
  curY += 15;
  doc.font("Helvetica").fontSize(9).fillColor(dark)
    .text(`OC: ${oc.numeroOc || `#${oc.id}`}`, mL, curY);
  curY += 13;
  doc.text(`Fornecedor: ${fornecedor?.nomeFantasia || fornecedor?.razaoSocial || "—"}`, mL, curY);
  curY += 13;
  doc.text(`Data: ${fmtDate(oc.criadoEm)}`, mL, curY);
  curY += 20;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(primary).text("MATERIAIS DO FATURAMENTO DIRETO", mL, curY);
  curY += 15;

  const colWidths = [35, 200, 45, 60, 70, 70];
  const headers = ["#", "Descrição", "Unid", "Qtd", "Preço Unit", "Total"];
  doc.font("Helvetica-Bold").fontSize(8).fillColor(primary);
  let xPos = mL;
  headers.forEach((h, i) => {
    doc.text(h, xPos, curY, { width: colWidths[i], align: i >= 3 ? "right" : "left" });
    xPos += colWidths[i] + 5;
  });
  curY += 13;
  drawHLine(curY);
  curY += 5;

  let totalItens = 0;
  doc.font("Helvetica").fontSize(8).fillColor(dark);
  itens.forEach((item, idx) => {
    xPos = mL;
    const subtotal = n(item.quantidade) * n(item.precoUnitario);
    totalItens += subtotal;
    const vals = [String(idx + 1), item.descricao || "—", item.unidade || "un", String(n(item.quantidade)), fmt(n(item.precoUnitario)), fmt(subtotal)];
    vals.forEach((v, i) => {
      doc.text(v, xPos, curY, { width: colWidths[i], align: i >= 3 ? "right" : "left" });
      xPos += colWidths[i] + 5;
    });
    curY += 13;
  });
  drawHLine(curY);
  curY += 8;

  doc.font("Helvetica-Bold").fontSize(9).fillColor(dark)
    .text(`Total dos Itens: ${fmt(totalItens)}`, mL, curY, { align: "right", width: cW });
  curY += 20;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(primary).text("SALDO DE FATURAMENTO DIRETO", mL, curY);
  curY += 15;

  const saldoData = [
    ["Orçamento FD Total:", fmt(totalFdOrcado)],
    ["FD Comprometido (todas OCs):", fmt(totalFdComprometido)],
    ["Saldo Disponível:", fmt(saldoFd)],
    ["Valor desta OC FD:", fmt(fdValor)],
    ["Saldo Após Aprovação:", fmt(saldoFd - fdValor)],
  ];
  doc.font("Helvetica").fontSize(9).fillColor(dark);
  saldoData.forEach(([label, value]) => {
    doc.text(label, mL, curY, { continued: false });
    doc.font("Helvetica-Bold").text(value, mL + 250, curY - 11);
    doc.font("Helvetica");
    curY += 15;
  });
  curY += 20;

  drawHLine(curY, accent, 1);
  curY += 20;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(primary).text("APROVAÇÃO DO CLIENTE", mL, curY);
  curY += 20;

  doc.font("Helvetica").fontSize(9).fillColor(dark)
    .text("Eu, abaixo assinado, aprovo o faturamento direto dos materiais acima descritos,", mL, curY);
  curY += 13;
  doc.text("autorizando a dedução do valor correspondente na próxima medição.", mL, curY);
  curY += 40;

  doc.text("________________________________________", mL, curY);
  curY += 13;
  doc.text("Assinatura do Cliente / Responsável", mL, curY);
  curY += 8;
  doc.fontSize(8).fillColor(midGray).text("Nome:", mL, curY);
  curY += 12;
  doc.text("Data:", mL, curY);
  curY += 25;

  doc.text("________________________________________", mL + 280, curY - 37);
  doc.text("Assinatura FC Engenharia", mL + 280, curY - 24);

  doc.end();

  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
