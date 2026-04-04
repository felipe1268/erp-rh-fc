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
  let photoBuf: Buffer | null = null;
  if (ficha.foto_url) {
    if (ficha.foto_url.startsWith("data:image")) {
      const b64 = ficha.foto_url.split(",")[1];
      if (b64) photoBuf = Buffer.from(b64, "base64");
    } else if (ficha.foto_url.startsWith("http")) {
      try {
        const resp = await fetch(ficha.foto_url, { signal: AbortSignal.timeout(15000) });
        if (resp.ok) photoBuf = Buffer.from(await resp.arrayBuffer());
      } catch {}
    }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = 595.28;
    const pageH = 841.89;
    const m = 50;
    const contentW = pageW - m * 2;
    const midX = m + contentW / 2;
    const rightCol = m + contentW * 0.5;
    const lineH = 15;
    const s = (v: any) => (v == null || v === "") ? "" : String(v);

    let y = m;

    const drawSectionTitle = (title: string) => {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("black");
      doc.text(title, m, y);
      y = doc.y + 2;
      doc.moveTo(m, y).lineTo(m + contentW, y).lineWidth(0.8).strokeColor("black").stroke();
      y += 6;
    };

    const drawHR = () => {
      doc.moveTo(m, y).lineTo(m + contentW, y).lineWidth(0.5).strokeColor("#999999").stroke();
      y += 8;
    };

    drawSectionTitle("DADOS CONTRATUAIS:");
    y += 2;

    const tableTop = y;
    const rowH = 16;
    const col1W = contentW * 0.5;
    const col2W = contentW * 0.5;

    const contractRows = [
      [
        "Contratada: " + (s(fornecedor?.razaoSocial) || s(ficha.fornecedor_nome)),
        "Contrato nº: " + s(ficha.contrato_numero),
      ],
      [
        "Endereço: " + s(fornecedor?.endereco),
        "Bairro: " + s(fornecedor?.bairro),
      ],
      [
        "Município: " + s(fornecedor?.cidade),
        "Estado: " + s(fornecedor?.estado) + "       CEP: " + s(fornecedor?.cep),
      ],
      [
        "Contato: " + s(fornecedor?.contato),
        "Fone Comercial: " + s(fornecedor?.telefone),
      ],
      [
        "Email: " + s(fornecedor?.email),
        "Celular: " + s(fornecedor?.celular),
      ],
    ];

    doc.font("Helvetica").fontSize(8.5);
    for (let i = 0; i < contractRows.length; i++) {
      const rowY = tableTop + i * rowH;
      doc.rect(m, rowY, col1W, rowH).stroke();
      doc.rect(m + col1W, rowY, col2W, rowH).stroke();
      doc.text(contractRows[i][0], m + 3, rowY + 3, { width: col1W - 6 });
      doc.text(contractRows[i][1], m + col1W + 3, rowY + 3, { width: col2W - 6 });
    }

    y = tableTop + contractRows.length * rowH + 12;

    drawSectionTitle("DESCRIÇÃO DO PRODUTO / SERVIÇO:");
    y += 2;

    const descBoxTop = y;
    doc.font("Helvetica").fontSize(9);
    doc.text(ficha.descricao, m + 4, y + 3, { width: contentW - 8 });
    const descBoxH = Math.max(20, doc.y - descBoxTop + 6);
    doc.rect(m, descBoxTop, contentW, descBoxH).stroke();
    y = descBoxTop + descBoxH + 12;

    drawSectionTitle("ESPECIFICAÇÕES:");
    y += 4;

    if (ficha.especificacoes) {
      const lines = ficha.especificacoes.split("\n").filter(l => l.trim());
      doc.font("Helvetica").fontSize(8.5);
      for (const line of lines) {
        if (y > pageH - 120) {
          doc.addPage();
          y = m;
        }
        const clean = line.replace(/^[\s•\-\*○◦▪o]+/, "").trim();
        if (clean) {
          doc.text("       o    " + clean, m + 10, y, { width: contentW - 20 });
          y = doc.y + 2;
        }
      }
    }

    y += 10;

    if (y > pageH - 280) {
      doc.addPage();
      y = m;
    }

    drawSectionTitle("OUTRAS INFORMAÇÕES / FOTO:");
    y += 6;

    if (photoBuf) {
      try {
        const photoMaxW = contentW - 40;
        const photoMaxH = Math.min(260, pageH - y - 120);
        if (photoMaxH > 60) {
          const imgX = m + 20;
          doc.image(photoBuf, imgX, y, { fit: [photoMaxW, photoMaxH] });
          y += photoMaxH + 10;
        }
      } catch {
        y += 20;
      }
    } else {
      y += 60;
    }

    y += 8;

    if (y > pageH - 80) {
      doc.addPage();
      y = m;
    }

    drawSectionTitle("OBSERVAÇÕES:");
    y += 2;

    const obsBoxTop = y;
    doc.font("Helvetica").fontSize(9);
    const obsText = ficha.observacoes || "";
    doc.text(obsText, m + 4, y + 3, { width: contentW - 8 });
    const obsBoxH = Math.max(20, doc.y - obsBoxTop + 6);
    doc.rect(m, obsBoxTop, contentW, obsBoxH).stroke();

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
    doc.font("Helvetica").fontSize(10)
      .text("Obra: " + obra.nome + " | Construtora: " + company.razaoSocial, margin, y);
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
    doc.font("Helvetica-Bold").fontSize(8);
    for (const col of cols) {
      doc.text(col.label, cx, y, { width: col.w - 10 });
      cx += col.w;
    }
    y += 14;
    doc.moveTo(margin, y).lineTo(pageW - margin, y).strokeColor("black").lineWidth(0.5).stroke();
    y += 6;

    doc.font("Helvetica").fontSize(8);
    for (const ficha of fichas) {
      if (y > 540) {
        doc.addPage();
        y = 40;
      }
      cx = margin + 5;
      const row = [
        "DATABOOK-" + String(ficha.numero_sequencial).padStart(3, "0"),
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
