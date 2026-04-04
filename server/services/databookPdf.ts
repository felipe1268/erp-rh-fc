import PDFDocument from "pdfkit";
import { getDb } from "../db";
import { obras, companies } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";

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

interface DatabookFichaData {
  id: number;
  numero_sequencial: number;
  descricao: string;
  disciplina: string;
  especificacoes?: string | null;
  foto_url?: string | null;
  observacoes?: string | null;
  fornecedor_nome?: string | null;
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

export async function gerarDatabookFichaPdf(
  ficha: DatabookFichaData,
  obra: ObraData,
  company: CompanyData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = 595.28;
    const margin = 50;
    const contentW = pageW - margin * 2;

    doc.rect(0, 0, pageW, 100).fill("#1a365d");

    const logoW = 80;
    const logoH = 40;
    const logoY = 25;
    drawLogo(doc, company.logoUrl, margin, logoY, logoW, logoH);
    drawLogo(doc, obra.gerenciadoraLogoUrl, pageW / 2 - logoW / 2, logoY, logoW, logoH);
    drawLogo(doc, obra.clienteLogoUrl, pageW - margin - logoW, logoY, logoW, logoH);

    doc.fillColor("white").fontSize(10).font("Helvetica")
      .text("DATABOOK DE OBRA", margin, 70, { width: contentW, align: "center" });

    let y = 115;

    doc.fillColor("#1a365d").fontSize(16).font("Helvetica-Bold")
      .text(`DATABOOK-${String(ficha.numero_sequencial).padStart(3, "0")}`, margin, y);
    y += 25;

    doc.fillColor("#333").fontSize(10).font("Helvetica")
      .text(`Obra: ${obra.nome}`, margin, y);
    y += 15;
    if (obra.endereco) {
      doc.text(`Endereço: ${obra.endereco}`, margin, y);
      y += 15;
    }
    doc.text(`Construtora: ${company.razaoSocial}`, margin, y);
    y += 15;
    if (obra.gerenciadoraNome) {
      doc.text(`Gerenciadora: ${obra.gerenciadoraNome}`, margin, y);
      y += 15;
    }
    doc.text(`Disciplina: ${ficha.disciplina}`, margin, y);
    y += 15;
    doc.text(`Origem: ${ficha.origem === "oc" ? "Ordem de Compra" : "Contrato Terceiro"}`, margin, y);
    y += 5;

    y += 10;
    doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("#ddd").lineWidth(1).stroke();
    y += 15;

    doc.fillColor("#1a365d").fontSize(12).font("Helvetica-Bold")
      .text("Descrição do Produto", margin, y);
    y += 18;
    doc.fillColor("#333").fontSize(10).font("Helvetica")
      .text(ficha.descricao, margin, y, { width: contentW });
    y = doc.y + 10;

    if (ficha.fornecedor_nome) {
      doc.fillColor("#666").fontSize(9)
        .text(`Fornecedor: ${ficha.fornecedor_nome}`, margin, y);
      y += 14;
    }
    if (ficha.contrato_numero) {
      doc.text(`OC/Contrato: ${ficha.contrato_numero}`, margin, y);
      y += 14;
    }
    if (ficha.eap_codigo) {
      doc.text(`Código EAP: ${ficha.eap_codigo}`, margin, y);
      y += 14;
    }

    if (ficha.especificacoes) {
      y += 10;
      doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("#ddd").lineWidth(1).stroke();
      y += 15;

      doc.fillColor("#1a365d").fontSize(12).font("Helvetica-Bold")
        .text("Especificações Técnicas", margin, y);
      y += 18;
      doc.fillColor("#333").fontSize(10).font("Helvetica")
        .text(ficha.especificacoes, margin, y, { width: contentW });
      y = doc.y + 10;
    }

    if (ficha.foto_url) {
      y += 10;
      doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("#ddd").lineWidth(1).stroke();
      y += 15;

      doc.fillColor("#1a365d").fontSize(12).font("Helvetica-Bold")
        .text("Foto do Produto", margin, y);
      y += 18;

      try {
        if (ficha.foto_url.startsWith("data:image")) {
          const base64Data = ficha.foto_url.split(",")[1];
          if (base64Data) {
            const buf = Buffer.from(base64Data, "base64");
            doc.image(buf, margin, y, { fit: [contentW, 200], align: "center" });
            y += 210;
          }
        } else {
          doc.fillColor("#999").fontSize(9)
            .text(`Foto: ${ficha.foto_url}`, margin, y);
          y += 14;
        }
      } catch {
        doc.fillColor("#999").fontSize(9)
          .text("[Foto não disponível]", margin, y);
        y += 14;
      }
    }

    if (ficha.observacoes) {
      y += 10;
      doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("#ddd").lineWidth(1).stroke();
      y += 15;

      doc.fillColor("#1a365d").fontSize(12).font("Helvetica-Bold")
        .text("Observações", margin, y);
      y += 18;
      doc.fillColor("#333").fontSize(10).font("Helvetica")
        .text(ficha.observacoes, margin, y, { width: contentW });
    }

    const pageH = 841.89;
    doc.fillColor("#aaa").fontSize(8)
      .text(`DATABOOK-${String(ficha.numero_sequencial).padStart(3, "0")} | ${obra.nome} | ${company.razaoSocial}`,
        margin, pageH - 30, { width: contentW, align: "center" });

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
