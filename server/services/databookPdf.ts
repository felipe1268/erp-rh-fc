import PDFDocument from "pdfkit";
import { getDb } from "../db";
import { obras, companies } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";

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

export async function gerarDatabookFichaPdf(
  ficha: DatabookFichaData,
  obra: ObraData,
  company: CompanyData,
  fornecedor?: FornecedorData | null,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = 595.28;
    const pageH = 841.89;
    const margin = 50;
    const contentW = pageW - margin * 2;
    const midX = margin + contentW * 0.55;

    let y = margin;

    const fornNome = fornecedor?.razaoSocial || ficha.fornecedor_nome || "";
    const fornEndereco = fornecedor?.endereco || "";
    const fornBairro = fornecedor?.bairro || "";
    const fornCidade = fornecedor?.cidade || "";
    const fornEstado = fornecedor?.estado || "";
    const fornCep = fornecedor?.cep || "";
    const fornContato = fornecedor?.contato || "";
    const fornTelefone = fornecedor?.telefone || "";
    const fornEmail = fornecedor?.email || "";
    const fornCelular = fornecedor?.celular || "";
    const contratoNum = ficha.contrato_numero || "";

    doc.font("Helvetica-Bold").fontSize(11).fillColor("black")
      .text("DADOS CONTRATUAIS:", margin, y);
    y += 18;

    const labelFont = "Helvetica-Bold";
    const valueFont = "Helvetica";
    const fontSize = 9;
    const lineH = 15;

    const drawContractRow = (label1: string, value1: string, label2: string, value2: string) => {
      doc.font(labelFont).fontSize(fontSize).fillColor("black");
      doc.text(label1, margin + 5, y);
      doc.font(valueFont);
      doc.text(value1, margin + 5 + 70, y, { width: midX - margin - 75 });

      doc.font(labelFont);
      doc.text(label2, midX, y);
      doc.font(valueFont);
      doc.text(value2, midX + 90, y, { width: pageW - margin - midX - 90 });
      y += lineH;
    };

    drawContractRow("Contratada:", fornNome, "Contrato nº:", contratoNum);
    drawContractRow("Endereço:", fornEndereco, "Bairro:", fornBairro);

    doc.font(labelFont).fontSize(fontSize).fillColor("black");
    doc.text("Município:", margin + 5, y);
    doc.font(valueFont);
    doc.text(fornCidade, margin + 5 + 70, y, { width: midX - margin - 75 });
    doc.font(labelFont);
    doc.text("Estado:", midX, y);
    doc.font(valueFont);
    doc.text(fornEstado, midX + 50, y);
    doc.font(labelFont);
    doc.text("CEP:", midX + 90, y);
    doc.font(valueFont);
    doc.text(fornCep, midX + 115, y);
    y += lineH;

    drawContractRow("Contato:", fornContato, "Fone Comercial:", fornTelefone);
    drawContractRow("Email:", fornEmail, "Celular:", fornCelular);

    y += 20;

    doc.font("Helvetica-Bold").fontSize(11).fillColor("black")
      .text("DESCRIÇÃO DO PRODUTO / SERVIÇO:", margin, y);
    y += 18;

    doc.font("Helvetica").fontSize(10).fillColor("black")
      .text(ficha.descricao, margin + 10, y, { width: contentW - 20 });
    y = doc.y + 25;

    doc.font("Helvetica-Bold").fontSize(11).fillColor("black")
      .text("ESPECIFICAÇÕES:", margin, y);
    y += 20;

    if (ficha.especificacoes) {
      const lines = ficha.especificacoes.split("\n").filter(l => l.trim());
      doc.font("Helvetica").fontSize(9).fillColor("black");
      for (const line of lines) {
        if (y > pageH - 80) {
          doc.addPage();
          y = margin;
        }
        const cleanLine = line.replace(/^[\s•\-\*○◦▪]+/, "").trim();
        if (cleanLine) {
          doc.text(`              o    ${cleanLine}`, margin, y, { width: contentW });
          y = doc.y + 3;
        }
      }
    }

    y += 20;

    if (y > pageH - 200) {
      doc.addPage();
      y = margin;
    }

    doc.font("Helvetica-Bold").fontSize(11).fillColor("black")
      .text("OUTRAS INFORMAÇÕES / FOTO:", margin, y);
    y += 20;

    if (ficha.foto_url) {
      try {
        if (ficha.foto_url.startsWith("data:image")) {
          const base64Data = ficha.foto_url.split(",")[1];
          if (base64Data) {
            const buf = Buffer.from(base64Data, "base64");
            const maxFotoH = Math.min(250, pageH - y - 120);
            if (maxFotoH > 60) {
              doc.image(buf, margin + 10, y, { fit: [contentW - 20, maxFotoH], align: "center" });
              y += maxFotoH + 10;
            }
          }
        } else if (ficha.foto_url.startsWith("http")) {
          doc.font("Helvetica").fontSize(9).fillColor("black")
            .text(`Foto: ${ficha.foto_url}`, margin + 10, y, { width: contentW - 20 });
          y = doc.y + 10;
        }
      } catch {
        y += 10;
      }
    }

    y += 20;

    if (y > pageH - 80) {
      doc.addPage();
      y = margin;
    }

    doc.font("Helvetica-Bold").fontSize(11).fillColor("black")
      .text("OBSERVAÇÕES:", margin, y);
    y += 20;

    if (ficha.observacoes) {
      doc.font("Helvetica").fontSize(9).fillColor("black")
        .text(ficha.observacoes, margin + 10, y, { width: contentW - 20 });
    }

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

    doc.font("Helvetica-Bold").fontSize(14).fillColor("black")
      .text("ÍNDICE DO DATABOOK", margin, 30, { width: contentW, align: "center" });

    let y = 60;
    doc.font("Helvetica").fontSize(10).fillColor("black")
      .text(`Obra: ${obra.nome} | Construtora: ${company.razaoSocial}`, margin, y);
    y += 25;

    const cols = [
      { label: "Nº", w: 50 },
      { label: "Disciplina", w: 120 },
      { label: "Descrição", w: 300 },
      { label: "Fornecedor", w: 150 },
      { label: "OC/Contrato", w: 80 },
      { label: "Status", w: 70 },
    ];

    let cx = margin + 5;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("black");
    for (const col of cols) {
      doc.text(col.label, cx, y, { width: col.w - 10 });
      cx += col.w;
    }
    y += 14;
    doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("black").lineWidth(0.5).stroke();
    y += 6;

    doc.font("Helvetica").fontSize(8).fillColor("black");
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
