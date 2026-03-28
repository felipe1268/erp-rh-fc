import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";
import { getDb } from "../db";
import {
  comprasOrdens,
  comprasOrdensItens,
  fornecedores,
  companies,
  obras,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

type ComprasOrdem = InferSelectModel<typeof comprasOrdens>;
type ComprasOrdemItem = InferSelectModel<typeof comprasOrdensItens>;
type Fornecedor = InferSelectModel<typeof fornecedores>;
type Company = InferSelectModel<typeof companies>;
type Obra = InferSelectModel<typeof obras>;

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

export interface OCData {
  oc: ComprasOrdem;
  itens: ComprasOrdemItem[];
  fornecedor: Fornecedor | null;
  company: Company | null;
  obra: Obra | null;
}

export async function fetchOCData(ocId: number): Promise<OCData> {
  const db = await getDb();
  const [oc] = await db
    .select()
    .from(comprasOrdens)
    .where(eq(comprasOrdens.id, ocId));
  if (!oc) throw new Error("Ordem de Compra não encontrada");

  const itens = await db
    .select()
    .from(comprasOrdensItens)
    .where(eq(comprasOrdensItens.ordemId, ocId));

  let fornecedor: Fornecedor | null = null;
  if (oc.fornecedorId) {
    const [f] = await db
      .select()
      .from(fornecedores)
      .where(eq(fornecedores.id, oc.fornecedorId));
    fornecedor = f ?? null;
  }

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, oc.companyId));

  let obra: Obra | null = null;
  if (oc.obraId) {
    const [o] = await db
      .select()
      .from(obras)
      .where(eq(obras.id, oc.obraId));
    obra = o ?? null;
  }

  return { oc, itens, fornecedor, company: company ?? null, obra };
}

function resolveLogoPath(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("data:image")) return null;
  if (logoUrl.startsWith("/uploads/")) {
    const localPath = path.join(process.cwd(), "server", logoUrl);
    if (fs.existsSync(localPath)) return localPath;
  }
  if (logoUrl.startsWith("http://") || logoUrl.startsWith("https://")) {
    return null;
  }
  return null;
}

function drawInfoRow(
  doc: PDFKit.PDFDocument,
  entries: [string, string][],
  x: number,
  y: number,
  colW: number,
  colors: { label: string; value: string }
): number {
  for (let i = 0; i < entries.length; i += 2) {
    const [lLabel, lValue] = entries[i];
    const right = entries[i + 1];
    doc.font("Helvetica").fontSize(7).fillColor(colors.label).text(lLabel, x, y);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(colors.value).text(lValue, x, y + 10, { width: colW - 10 });
    if (right) {
      doc.font("Helvetica").fontSize(7).fillColor(colors.label).text(right[0], x + colW, y);
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(colors.value).text(right[1], x + colW, y + 10, { width: colW - 10 });
    }
    y += 26;
  }
  return y;
}

export function generateOCPdf(data: OCData): PDFKit.PDFDocument {
  const { oc, itens, fornecedor, company, obra } = data;
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  const pageW = doc.page.width;
  const marginL = 40;
  const marginR = 40;
  const contentW = pageW - marginL - marginR;

  const darkColor = "#1a1a2e";
  const accentColor = "#16537e";
  const lightGray = "#f5f5f5";
  const medGray = "#888888";
  const lineColor = "#cccccc";
  const colors = { label: medGray, value: darkColor };

  function drawLine(y: number, color = lineColor) {
    doc.strokeColor(color).lineWidth(0.5).moveTo(marginL, y).lineTo(pageW - marginR, y).stroke();
  }

  doc.rect(marginL, 40, contentW, 60).fill(accentColor);

  const logoPath = resolveLogoPath(company?.logoUrl);
  let logoRendered = false;
  if (logoPath) {
    try {
      doc.image(logoPath, marginL + 10, 47, { height: 46, fit: [80, 46] });
      logoRendered = true;
    } catch {
      logoRendered = false;
    }
  }

  const textStartX = logoRendered ? marginL + 100 : marginL + 15;
  const textWidth = logoRendered ? contentW * 0.45 : contentW * 0.6;

  doc.font("Helvetica-Bold").fontSize(18).fillColor("#ffffff")
    .text(company?.razaoSocial || "FC Engenharia", textStartX, 55, { width: textWidth });

  if (company?.nomeFantasia && company.nomeFantasia !== company.razaoSocial) {
    doc.font("Helvetica").fontSize(9).fillColor("#d0e8f5")
      .text(company.nomeFantasia, textStartX, 78, { width: textWidth });
  }

  doc.font("Helvetica-Bold").fontSize(14).fillColor("#ffffff")
    .text("ORDEM DE COMPRA", pageW - marginR - 200, 55, { width: 185, align: "right" });

  doc.font("Helvetica-Bold").fontSize(16).fillColor("#ffffff")
    .text(oc.numeroOc || "—", pageW - marginR - 200, 73, { width: 185, align: "right" });

  let y = 110;

  const companyDetails: string[] = [];
  if (company?.cnpj) companyDetails.push(`CNPJ: ${company.cnpj}`);
  if (company?.inscricaoEstadual) companyDetails.push(`IE: ${company.inscricaoEstadual}`);
  if (company?.endereco) {
    let addr = company.endereco;
    if (company.cidade) addr += ` - ${company.cidade}`;
    if (company.estado) addr += `/${company.estado}`;
    if (company.cep) addr += ` - CEP: ${company.cep}`;
    companyDetails.push(addr);
  }
  if (company?.telefone) companyDetails.push(`Tel: ${company.telefone}`);
  if (company?.email) companyDetails.push(`Email: ${company.email}`);

  if (companyDetails.length > 0) {
    doc.font("Helvetica").fontSize(7.5).fillColor(medGray)
      .text(companyDetails.join("  |  "), marginL, y, { width: contentW, align: "center" });
    y += 15;
  }

  y += 5;
  drawLine(y);
  y += 10;

  doc.font("Helvetica-Bold").fontSize(9).fillColor(accentColor).text("DADOS DA ORDEM", marginL, y);
  y += 14;

  const colW = contentW / 2;
  const infoEntries: [string, string][] = [
    ["Data de Emissão", fmtDate(oc.criadoEm)],
    ["Status", (oc.status || "pendente").toUpperCase()],
    ["Prazo de Entrega", fmtDate(oc.dataEntregaPrevista)],
    ["Forma de Pagamento", oc.formaPagamento ?? "—"],
  ];
  if (oc.dataVencimento) {
    infoEntries.push(["Vencimento Pagamento", fmtDate(oc.dataVencimento)]);
  }
  y = drawInfoRow(doc, infoEntries, marginL, y, colW, colors);

  y += 5;
  drawLine(y);
  y += 10;

  doc.font("Helvetica-Bold").fontSize(9).fillColor(accentColor).text("FORNECEDOR", marginL, y);
  y += 14;

  if (fornecedor) {
    const fornEntries: [string, string][] = [
      ["Razão Social", fornecedor.razaoSocial || "—"],
      ["CNPJ", fornecedor.cnpj || "—"],
    ];
    if (fornecedor.nomeFantasia) fornEntries.push(["Nome Fantasia", fornecedor.nomeFantasia]);
    if (fornecedor.endereco) {
      let addr = fornecedor.endereco;
      if (fornecedor.numero) addr += `, ${fornecedor.numero}`;
      if (fornecedor.complemento) addr += ` - ${fornecedor.complemento}`;
      if (fornecedor.bairro) addr += ` - ${fornecedor.bairro}`;
      if (fornecedor.cidade) addr += ` - ${fornecedor.cidade}`;
      if (fornecedor.estado) addr += `/${fornecedor.estado}`;
      if (fornecedor.cep) addr += ` - CEP: ${fornecedor.cep}`;
      fornEntries.push(["Endereço", addr]);
    }
    if (fornecedor.telefone) fornEntries.push(["Telefone", fornecedor.telefone]);
    if (fornecedor.email) fornEntries.push(["Email", fornecedor.email]);
    if (fornecedor.contatoNome) fornEntries.push(["Contato", fornecedor.contatoNome]);
    y = drawInfoRow(doc, fornEntries, marginL, y, colW, colors);
  } else if (oc.fornecedorNome) {
    doc.font("Helvetica").fontSize(8.5).fillColor(darkColor).text(oc.fornecedorNome, marginL, y);
    y += 16;
  } else {
    doc.font("Helvetica").fontSize(8.5).fillColor(medGray).text("Não informado", marginL, y);
    y += 16;
  }

  if (obra) {
    y += 2;
    drawLine(y);
    y += 10;

    doc.font("Helvetica-Bold").fontSize(9).fillColor(accentColor).text("LOCAL DE ENTREGA (OBRA)", marginL, y);
    y += 14;

    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(darkColor).text(obra.nome || "—", marginL, y);
    y += 12;

    if (obra.endereco) {
      let addr = obra.endereco;
      if (obra.cidade) addr += ` - ${obra.cidade}`;
      if (obra.estado) addr += `/${obra.estado}`;
      doc.font("Helvetica").fontSize(8).fillColor(darkColor).text(addr, marginL, y);
      y += 12;
    }
  }

  y += 8;
  drawLine(y, accentColor);
  y += 10;

  doc.font("Helvetica-Bold").fontSize(9).fillColor(accentColor).text("ITENS DA ORDEM DE COMPRA", marginL, y);
  y += 16;

  const colWidths = [30, contentW - 30 - 50 - 60 - 80 - 80, 50, 60, 80, 80];
  const headers = ["#", "Descrição", "Un.", "Qtd", "Preço Unit.", "Total"];

  doc.rect(marginL, y, contentW, 18).fill(accentColor);

  let xPos = marginL;
  headers.forEach((h, i) => {
    const align: "left" | "right" = i >= 3 ? "right" : "left";
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff")
      .text(h, xPos + 4, y + 5, { width: colWidths[i] - 8, align });
    xPos += colWidths[i];
  });
  y += 18;

  itens.forEach((item, idx) => {
    if (y > doc.page.height - 120) {
      doc.addPage();
      y = 40;
    }

    const bgColor = idx % 2 === 0 ? "#ffffff" : lightGray;
    doc.rect(marginL, y, contentW, 18).fill(bgColor);

    const qty = parseFloat(item.quantidade || "0");
    const price = parseFloat(item.precoUnitario || "0");
    const total = parseFloat(item.total || "0");

    xPos = marginL;
    const rowData = [
      String(idx + 1),
      item.descricao || "—",
      item.unidade || "un",
      qty.toLocaleString("pt-BR", { minimumFractionDigits: 0 }),
      fmt(price),
      fmt(total),
    ];

    rowData.forEach((val, i) => {
      const align: "left" | "right" = i >= 3 ? "right" : "left";
      const fontName = i === 1 ? "Helvetica-Bold" : "Helvetica";
      doc.font(fontName).fontSize(7.5).fillColor(darkColor)
        .text(val, xPos + 4, y + 5, { width: colWidths[i] - 8, align, lineBreak: false });
      xPos += colWidths[i];
    });
    y += 18;
  });

  drawLine(y, accentColor);
  y += 10;

  const subtotal = parseFloat(oc.subtotal ?? oc.total ?? "0");
  const frete = parseFloat(oc.frete ?? "0");
  const outrasDespesas = parseFloat(oc.outrasDespesas ?? "0");
  const impostos = parseFloat(oc.impostos ?? "0");
  const desconto = parseFloat(oc.desconto ?? "0");
  const totalOC = parseFloat(oc.total ?? "0");

  const summaryX = pageW - marginR - 200;
  const summaryW = 200;

  const summaryLines: { label: string; value: string; negative: boolean }[] = [
    { label: "Subtotal Itens", value: fmt(subtotal), negative: false },
  ];
  if (frete > 0) summaryLines.push({ label: "(+) Frete", value: fmt(frete), negative: false });
  if (outrasDespesas > 0) summaryLines.push({ label: "(+) Outras Despesas", value: fmt(outrasDespesas), negative: false });
  if (impostos > 0) summaryLines.push({ label: "(+) Impostos", value: fmt(impostos), negative: false });
  if (desconto > 0) summaryLines.push({ label: "(−) Desconto", value: fmt(desconto), negative: true });

  summaryLines.forEach((line) => {
    doc.font("Helvetica").fontSize(8).fillColor(medGray)
      .text(line.label, summaryX, y, { width: 100, align: "right" });
    doc.font("Helvetica-Bold").fontSize(8).fillColor(line.negative ? "#cc0000" : darkColor)
      .text(line.value, summaryX + 105, y, { width: 90, align: "right" });
    y += 14;
  });

  y += 2;
  doc.strokeColor(accentColor).lineWidth(1).moveTo(summaryX, y).lineTo(summaryX + summaryW, y).stroke();
  y += 6;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(accentColor)
    .text("TOTAL GERAL", summaryX, y, { width: 100, align: "right" });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(accentColor)
    .text(fmt(totalOC), summaryX + 105, y, { width: 90, align: "right" });
  y += 25;

  if (oc.formaPagamento && oc.dataVencimento) {
    if (y > doc.page.height - 160) {
      doc.addPage();
      y = 40;
    }
    drawLine(y);
    y += 10;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(accentColor).text("CONDIÇÃO DE PAGAMENTO E PARCELAS", marginL, y);
    y += 14;

    doc.font("Helvetica").fontSize(8).fillColor(darkColor)
      .text(`Forma: ${oc.formaPagamento}`, marginL, y);
    y += 12;

    const numParcelas = 1;
    const valorParcela = totalOC / numParcelas;
    const vencBase = new Date(oc.dataVencimento + "T00:00:00");

    doc.rect(marginL, y, contentW * 0.6, 16).fill(accentColor);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff")
      .text("Parcela", marginL + 4, y + 4, { width: 60 });
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff")
      .text("Vencimento", marginL + 70, y + 4, { width: 100 });
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff")
      .text("Valor", marginL + 200, y + 4, { width: 100, align: "right" });
    y += 16;

    for (let p = 0; p < numParcelas; p++) {
      const venc = new Date(vencBase);
      venc.setMonth(venc.getMonth() + p);
      const bg = p % 2 === 0 ? "#ffffff" : lightGray;
      doc.rect(marginL, y, contentW * 0.6, 16).fill(bg);
      doc.font("Helvetica").fontSize(7.5).fillColor(darkColor)
        .text(`${p + 1}/${numParcelas}`, marginL + 4, y + 4, { width: 60 });
      doc.font("Helvetica").fontSize(7.5).fillColor(darkColor)
        .text(venc.toLocaleDateString("pt-BR"), marginL + 70, y + 4, { width: 100 });
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(darkColor)
        .text(fmt(valorParcela), marginL + 200, y + 4, { width: 100, align: "right" });
      y += 16;
    }
    y += 6;
  }

  if (oc.observacoes) {
    if (y > doc.page.height - 140) {
      doc.addPage();
      y = 40;
    }
    drawLine(y);
    y += 10;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(accentColor).text("OBSERVAÇÕES", marginL, y);
    y += 14;
    doc.font("Helvetica").fontSize(8).fillColor(darkColor)
      .text(oc.observacoes, marginL, y, { width: contentW });
    y += doc.heightOfString(oc.observacoes, { width: contentW, fontSize: 8 }) + 10;
  }

  if (y > doc.page.height - 140) {
    doc.addPage();
    y = 40;
  }

  y = Math.max(y + 20, doc.page.height - 140);
  drawLine(y);
  y += 30;

  const sigW = (contentW - 40) / 2;

  doc.strokeColor(darkColor).lineWidth(0.5).moveTo(marginL, y + 30).lineTo(marginL + sigW, y + 30).stroke();
  doc.font("Helvetica").fontSize(8).fillColor(darkColor)
    .text("Responsável pela Compra", marginL, y + 35, { width: sigW, align: "center" });

  doc.strokeColor(darkColor).lineWidth(0.5).moveTo(pageW - marginR - sigW, y + 30).lineTo(pageW - marginR, y + 30).stroke();
  doc.font("Helvetica").fontSize(8).fillColor(darkColor)
    .text("Aprovação", pageW - marginR - sigW, y + 35, { width: sigW, align: "center" });

  const footerY = doc.page.height - 25;
  doc.font("Helvetica").fontSize(6.5).fillColor(medGray)
    .text(
      `Documento gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")} — ${company?.razaoSocial || "FC Engenharia"}`,
      marginL, footerY, { width: contentW, align: "center" }
    );

  return doc;
}
