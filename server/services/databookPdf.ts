import PDFDocument from "pdfkit";
import { getDb } from "../db";
import { obras, companies } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  try {
    const date = new Date(d.length === 10 ? d + "T00:00:00" : d);
    return date.toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
};

interface FornecedorData {
  razaoSocial?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  contato?: string | null;
  telefone?: string | null;
  celular?: string | null;
  email?: string | null;
}

interface DatabookFichaData {
  id: number;
  numero_sequencial: number;
  descricao: string;
  disciplina: string;
  especificacoes?: string | null;
  foto_url?: string | null;
  observacoes?: string | null;
  fornecedor_nome?: string | null;
  fornecedor_id?: number | null;
  contrato_numero?: string | null;
  eap_codigo?: string | null;
  origem: string;
  status: string;
}

interface ObraData {
  nome: string;
  endereco?: string | null;
  gerenciadoraNome?: string | null;
  gerenciadoraLogoUrl?: string | null;
  clienteLogoUrl?: string | null;
}

interface CompanyData {
  razaoSocial: string;
  logoUrl?: string | null;
}

function drawLogo(doc: PDFKit.PDFDocument, logoUrl: string | null | undefined, x: number, y: number, maxW: number, maxH: number) {
  if (!logoUrl) return;
  try {
    if (logoUrl.startsWith("data:image")) {
      const base64Data = logoUrl.split(",")[1];
      if (base64Data) {
        const buf = Buffer.from(base64Data, "base64");
        doc.image(buf, x, y, { fit: [maxW, maxH], align: "center", valign: "center" });
      }
    }
  } catch {}
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, x: number, y: number, w: number): number {
  doc.save();
  doc.rect(x, y, w, 22).fill("#e2e8f0");
  doc.fillColor("#1a365d").fontSize(10).font("Helvetica-Bold")
    .text(title, x + 8, y + 6, { width: w - 16 });
  doc.restore();
  return y + 22;
}

function drawFieldRow(doc: PDFKit.PDFDocument, fields: { label: string; value: string; width: number }[], x: number, y: number, rowH: number = 16): number {
  doc.fontSize(9).font("Helvetica");
  let cx = x;
  for (const field of fields) {
    doc.fillColor("#333").font("Helvetica-Bold").text(field.label, cx, y, { continued: true, width: field.width });
    doc.font("Helvetica").text(` ${field.value}`, { width: field.width });
    cx += field.width;
  }
  return y + rowH;
}

export async function gerarDatabookFichaPdf(
  ficha: DatabookFichaData,
  obra: ObraData,
  company: CompanyData,
  fornecedor?: FornecedorData | null,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = 595.28;
    const pageH = 841.89;
    const margin = 40;
    const contentW = pageW - margin * 2;
    const col1W = contentW * 0.6;
    const col2W = contentW * 0.4;

    const headerH = 55;
    doc.rect(0, 0, pageW, headerH).fill("#1a365d");

    const logoW = 70;
    const logoH = 35;
    const logoY = 10;
    drawLogo(doc, company.logoUrl, margin + 5, logoY, logoW, logoH);
    drawLogo(doc, obra.gerenciadoraLogoUrl, pageW / 2 - logoW / 2, logoY, logoW, logoH);
    drawLogo(doc, obra.clienteLogoUrl, pageW - margin - logoW - 5, logoY, logoW, logoH);

    doc.fillColor("white").fontSize(11).font("Helvetica-Bold")
      .text("DATABOOK DE OBRA", margin, headerH - 18, { width: contentW, align: "center" });

    let y = headerH + 8;

    doc.fillColor("#666").fontSize(8).font("Helvetica")
      .text(`Obra: ${obra.nome}`, margin, y, { width: col1W });
    doc.text(`Construtora: ${company.razaoSocial}`, margin + col1W, y, { width: col2W, align: "right" });
    y += 12;
    if (obra.endereco) {
      doc.text(`Endereço: ${obra.endereco}`, margin, y, { width: contentW });
      y += 12;
    }
    doc.text(`Ficha: DATABOOK-${String(ficha.numero_sequencial).padStart(3, "0")}`, margin, y, { width: col1W });
    doc.text(`Disciplina: ${ficha.disciplina}`, margin + col1W, y, { width: col2W, align: "right" });
    y += 12;
    doc.text(`Origem: ${ficha.origem === "oc" ? "Ordem de Compra" : "Contrato Terceiro"}`, margin, y, { width: col1W });
    if (ficha.contrato_numero) {
      doc.text(`Contrato nº: ${ficha.contrato_numero}`, margin + col1W, y, { width: col2W, align: "right" });
    }
    y += 15;

    doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("#ccc").lineWidth(0.5).stroke();
    y += 8;

    y = drawSectionTitle(doc, "DADOS CONTRATUAIS:", margin, y, contentW);
    y += 6;

    const fornNome = fornecedor?.razaoSocial || ficha.fornecedor_nome || "—";
    const fornEndereco = fornecedor?.endereco || "—";
    const fornBairro = fornecedor?.bairro || "—";
    const fornCidade = fornecedor?.cidade || "—";
    const fornEstado = fornecedor?.estado || "—";
    const fornCep = fornecedor?.cep || "—";
    const fornContato = fornecedor?.contato || "—";
    const fornTelefone = fornecedor?.telefone || "—";
    const fornEmail = fornecedor?.email || "—";
    const fornCelular = fornecedor?.celular || "—";
    const contratoNum = ficha.contrato_numero || "—";

    doc.fontSize(9).font("Helvetica").fillColor("#333");

    const labelW = 90;
    const val1W = col1W - labelW - 5;
    const label2W = 95;
    const val2W = col2W - label2W;

    const drawRow = (l1: string, v1: string, l2: string, v2: string) => {
      doc.font("Helvetica-Bold").fillColor("#333")
        .text(l1, margin + 8, y, { width: labelW, continued: false });
      doc.font("Helvetica")
        .text(v1, margin + 8 + labelW, y, { width: val1W });
      doc.font("Helvetica-Bold")
        .text(l2, margin + col1W + 5, y, { width: label2W, continued: false });
      doc.font("Helvetica")
        .text(v2, margin + col1W + 5 + label2W, y, { width: val2W });
      y += 14;
    };

    drawRow("Contratada:", fornNome, "Contrato nº:", contratoNum);
    drawRow("Endereço:", fornEndereco, "Bairro:", fornBairro);
    drawRow("Município:", fornCidade, "Estado:", `${fornEstado}       CEP: ${fornCep}`);
    drawRow("Contato:", fornContato, "Fone Comercial:", fornTelefone);
    drawRow("Email:", fornEmail, "Celular:", fornCelular);

    y += 6;

    y = drawSectionTitle(doc, "DESCRIÇÃO DO PRODUTO / SERVIÇO:", margin, y, contentW);
    y += 8;
    doc.fontSize(10).font("Helvetica").fillColor("#333")
      .text(ficha.descricao, margin + 10, y, { width: contentW - 20 });
    y = doc.y + 12;

    if (ficha.especificacoes) {
      y = drawSectionTitle(doc, "ESPECIFICAÇÕES:", margin, y, contentW);
      y += 8;

      const lines = ficha.especificacoes.split("\n").filter(l => l.trim());
      doc.fontSize(9).font("Helvetica").fillColor("#333");
      for (const line of lines) {
        if (y > pageH - 80) {
          doc.addPage();
          y = 40;
        }
        const cleanLine = line.replace(/^[\s•\-\*○◦▪]+/, "").trim();
        if (cleanLine) {
          doc.text(`     •    ${cleanLine}`, margin + 10, y, { width: contentW - 20 });
          y = doc.y + 4;
        }
      }
      y += 6;
    }

    y = drawSectionTitle(doc, "OUTRAS INFORMAÇÕES / FOTO:", margin, y, contentW);
    y += 8;

    if (ficha.foto_url) {
      try {
        if (ficha.foto_url.startsWith("data:image")) {
          const base64Data = ficha.foto_url.split(",")[1];
          if (base64Data) {
            const buf = Buffer.from(base64Data, "base64");
            const maxFotoH = Math.min(220, pageH - y - 120);
            if (maxFotoH > 60) {
              doc.image(buf, margin + 10, y, { fit: [contentW - 20, maxFotoH], align: "center" });
              y += maxFotoH + 10;
            }
          }
        } else if (ficha.foto_url.startsWith("http")) {
          doc.fillColor("#666").fontSize(9).font("Helvetica")
            .text(`Foto: ${ficha.foto_url}`, margin + 10, y, { width: contentW - 20 });
          y = doc.y + 10;
        }
      } catch {
        doc.fillColor("#999").fontSize(9)
          .text("[Foto não disponível]", margin + 10, y);
        y += 14;
      }
    } else {
      y += 40;
    }

    if (y > pageH - 100) {
      doc.addPage();
      y = 40;
    }

    y = drawSectionTitle(doc, "OBSERVAÇÕES:", margin, y, contentW);
    y += 8;
    if (ficha.observacoes) {
      doc.fontSize(9).font("Helvetica").fillColor("#333")
        .text(ficha.observacoes, margin + 10, y, { width: contentW - 20 });
    } else {
      y += 30;
    }

    doc.fillColor("#aaa").fontSize(7)
      .text(
        `DATABOOK-${String(ficha.numero_sequencial).padStart(3, "0")} | ${obra.nome} | ${company.razaoSocial}`,
        margin, pageH - 25, { width: contentW, align: "center" }
      );

    doc.end();
  });
}

export async function gerarIndicePdf(
  fichas: DatabookFichaData[],
  obra: ObraData,
  company: CompanyData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = 841.89;
    const margin = 40;
    const contentW = pageW - margin * 2;

    doc.rect(0, 0, pageW, 60).fill("#1a365d");
    doc.fillColor("white").fontSize(14).font("Helvetica-Bold")
      .text("ÍNDICE DO DATABOOK", margin, 20, { width: contentW, align: "center" });

    let y = 75;
    doc.fillColor("#333").fontSize(10).font("Helvetica")
      .text(`Obra: ${obra.nome} | Construtora: ${company.razaoSocial}`, margin, y);
    y += 20;

    const cols = [
      { label: "Nº", w: 50 },
      { label: "Disciplina", w: 120 },
      { label: "Descrição", w: 300 },
      { label: "Fornecedor", w: 150 },
      { label: "OC/Contrato", w: 80 },
      { label: "Status", w: 70 },
    ];

    doc.rect(margin, y, contentW, 18).fill("#e2e8f0");
    let cx = margin + 5;
    doc.fillColor("#1a365d").fontSize(8).font("Helvetica-Bold");
    for (const col of cols) {
      doc.text(col.label, cx, y + 4, { width: col.w - 10 });
      cx += col.w;
    }
    y += 20;

    doc.font("Helvetica").fontSize(8).fillColor("#333");
    for (const ficha of fichas) {
      if (y > 540) {
        doc.addPage();
        y = 40;
      }
      cx = margin + 5;
      const row = [
        `DATABOOK-${String(ficha.numero_sequencial).padStart(3, "0")}`,
        ficha.disciplina || "—",
        ficha.descricao.substring(0, 60) + (ficha.descricao.length > 60 ? "..." : ""),
        ficha.fornecedor_nome || "—",
        ficha.contrato_numero || "—",
        ficha.status,
      ];
      for (let i = 0; i < cols.length; i++) {
        doc.text(row[i], cx, y, { width: cols[i].w - 10 });
        cx += cols[i].w;
      }
      y += 16;
    }

    doc.end();
  });
}

export async function gerarDatabookCompletoPdf(
  companyId: number,
  obraId: number,
): Promise<{ pdfBuffer: Buffer; fichas: DatabookFichaData[] }> {
  const db = await getDb();

  const [obraRow] = await db.select().from(obras).where(eq(obras.id, obraId));
  const [companyRow] = await db.select().from(companies).where(eq(companies.id, companyId));

  const obraData: ObraData = {
    nome: obraRow?.nome || "Obra",
    endereco: obraRow?.endereco,
    gerenciadoraNome: (obraRow as any)?.gerenciadoraNome,
    gerenciadoraLogoUrl: (obraRow as any)?.gerenciadoraLogoUrl,
    clienteLogoUrl: (obraRow as any)?.clienteLogoUrl,
  };
  const companyData: CompanyData = {
    razaoSocial: companyRow?.razaoSocial || "Empresa",
    logoUrl: companyRow?.logoUrl,
  };

  const result = await db.execute(sql`
    SELECT * FROM databook_fichas
    WHERE company_id = ${companyId} AND obra_id = ${obraId}
    ORDER BY numero_sequencial ASC
  `);
  const fichas = ((result as any).rows ?? result ?? []) as DatabookFichaData[];

  const indicePdf = await gerarIndicePdf(fichas, obraData, companyData);

  return { pdfBuffer: indicePdf, fichas };
}
