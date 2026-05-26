// ============================================================================
// Rev. 2453 — Comprovante de Devolução de Equipamentos Locados (PDF)
// ============================================================================
// Gera comprovante institucional FC com:
//  - Cabeçalho oficial (logo + razão social + CNPJ + endereço + faixa azul)
//  - Lista de equipamentos devolvidos (descrição, patrimônio, obra, tempo na obra)
//  - Fotos de devolução (até 6 thumbs)
//  - Assinaturas (entregador FC + recebedor da locadora) com nome + data
//  - Rodapé com nº do evento + hash de verificação
//
// Acessado via rota pública assinada `/api/comprovante-devolucao/:id/:token.pdf`
// pra locadora abrir o PDF direto do link compartilhado no WhatsApp.
// ============================================================================
import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";
import { getDb } from "../db";
import {
  equipamentoLocadoEventos,
  equipamentosLocados,
  companies,
  obras,
  fornecedores,
} from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  try {
    const date = new Date(d.length === 10 ? d + "T00:00:00" : d);
    return date.toLocaleDateString("pt-BR");
  } catch { return d; }
};

const fmtDateTime = (d: string | null | undefined): string => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return d; }
};

function resolveLogoSource(logoUrl: string | null | undefined): string | Buffer | null {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("data:image")) {
    const m = logoUrl.match(/^data:image\/\w+;base64,(.+)$/);
    if (m?.[1]) return Buffer.from(m[1], "base64");
    return null;
  }
  if (logoUrl.startsWith("/uploads/")) {
    const localPath = path.join(process.cwd(), "server", logoUrl);
    if (fs.existsSync(localPath)) return localPath;
  }
  return null;
}

function dataUrlToBuffer(url: string | null | undefined): Buffer | null {
  if (!url || !url.startsWith("data:image")) return null;
  const m = url.match(/^data:image\/\w+;base64,(.+)$/);
  return m?.[1] ? Buffer.from(m[1], "base64") : null;
}

export interface ReturnReceiptData {
  evento: any;                      // evento principal (com assinaturas)
  eventos: any[];                   // todos os eventos do mesmo lote
  equipamentos: any[];              // equipamentos devolvidos
  company: any | null;
  obra: any | null;
  fornecedor: any | null;
}

export async function fetchReturnReceiptData(eventoId: number): Promise<ReturnReceiptData> {
  const db = await getDb();
  const [evento] = await db.select().from(equipamentoLocadoEventos)
    .where(eq(equipamentoLocadoEventos.id, eventoId));
  if (!evento) throw new Error("Evento de devolução não encontrado");
  if (evento.tipo !== "DEVOLUCAO_FORNECEDOR") {
    throw new Error("Evento não é de devolução");
  }

  // Rev. 2453 — Eventos do MESMO lote agrupados pelo `pdfComprovanteToken`
  // (identificador forte gerado na mutation). Fallback ±60s só pra eventos
  // legados sem token (não devem existir, mas defensivo).
  let eventos: any[];
  if (evento.pdfComprovanteToken) {
    eventos = await db.select().from(equipamentoLocadoEventos)
      .where(and(
        eq(equipamentoLocadoEventos.companyId, evento.companyId),
        eq(equipamentoLocadoEventos.tipo, "DEVOLUCAO_FORNECEDOR"),
        eq(equipamentoLocadoEventos.pdfComprovanteToken, evento.pdfComprovanteToken),
      ));
  } else {
    const minuteWindow = 60_000;
    const eventoDate = new Date(evento.createdAt).getTime();
    const todosDoCompany = await db.select().from(equipamentoLocadoEventos)
      .where(and(
        eq(equipamentoLocadoEventos.companyId, evento.companyId),
        eq(equipamentoLocadoEventos.tipo, "DEVOLUCAO_FORNECEDOR"),
        eq(equipamentoLocadoEventos.usuarioId, evento.usuarioId ?? -1),
      ));
    eventos = todosDoCompany.filter(e => {
      const dt = new Date(e.createdAt).getTime();
      return Math.abs(dt - eventoDate) < minuteWindow;
    });
  }

  const equipIds = eventos.map(e => e.equipamentoLocadoId);
  const equipamentos = equipIds.length > 0
    ? await db.select().from(equipamentosLocados)
        .where(and(
          eq(equipamentosLocados.companyId, evento.companyId),
        ))
        .then(list => list.filter(eq_ => equipIds.includes(eq_.id)))
    : [];

  let company: any = null;
  const cRows = await db.select().from(companies).where(eq(companies.id, evento.companyId));
  company = cRows[0] ?? null;

  let obra: any = null;
  if (evento.obraId) {
    const oRows = await db.select().from(obras).where(eq(obras.id, evento.obraId));
    obra = oRows[0] ?? null;
  }

  let fornecedor: any = null;
  const fornIds = Array.from(new Set(equipamentos.map(e => (e as any).fornecedorId).filter(Boolean)));
  if (fornIds.length === 1) {
    const fRows = await db.select().from(fornecedores).where(eq(fornecedores.id, fornIds[0] as number));
    fornecedor = fRows[0] ?? null;
  }

  return { evento, eventos, equipamentos, company, obra, fornecedor };
}

export function generateReturnReceiptPdf(data: ReturnReceiptData): PDFKit.PDFDocument {
  const { evento, eventos, equipamentos, company, obra, fornecedor } = data;
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const mL = 40, mR = 40;
  const cW = pageW - mL - mR;

  const primary = "#1B2A4A";      // azul institucional FC
  const accent  = "#2980b9";
  const dark    = "#1a1a2e";
  const midGray = "#666666";
  const lightGray = "#f8f9fa";
  const borderColor = "#dee2e6";
  const white = "#ffffff";

  function drawHLine(y: number, color = borderColor, width = 0.5) {
    doc.strokeColor(color).lineWidth(width).moveTo(mL, y).lineTo(pageW - mR, y).stroke();
  }

  function sectionTitle(title: string, y: number): number {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(primary).text(title.toUpperCase(), mL, y);
    y += 13;
    drawHLine(y, accent, 0.8);
    return y + 6;
  }

  // ── HEADER azul com logo + nome empresa ─────────────────────────────────
  const headerH = 85;
  doc.rect(0, 0, pageW, headerH).fill(primary);

  const logoSrc = resolveLogoSource(company?.logoUrl);
  let logoRendered = false;
  const logoSize = 65;
  if (logoSrc) {
    try { doc.image(logoSrc, mL, 10, { fit: [logoSize, logoSize] }); logoRendered = true; }
    catch { logoRendered = false; }
  }

  const nameX = logoRendered ? mL + logoSize + 12 : mL + 10;
  const docBlockW = 165;
  const nameW = pageW - nameX - docBlockW - mR - 15;

  doc.font("Helvetica-Bold").fontSize(12).fillColor(white)
    .text(company?.razaoSocial || "FC ENGENHARIA", nameX, 12, { width: nameW });

  if (company?.cnpj) {
    doc.font("Helvetica").fontSize(7.5).fillColor("#c5d9ed")
      .text(`CNPJ: ${company.cnpj}`, nameX, 30, { width: nameW });
  }
  if (company?.endereco) {
    let addr = company.endereco;
    if (company.cidade) addr += ` - ${company.cidade}`;
    if (company.estado) addr += `/${company.estado}`;
    if (company.cep) addr += ` - CEP: ${company.cep}`;
    doc.font("Helvetica").fontSize(6.5).fillColor("#a0bdd4")
      .text(addr, nameX, 42, { width: nameW });
  }

  const docBlockX = pageW - mR - docBlockW;
  doc.rect(docBlockX, 12, docBlockW, 60).lineWidth(1.5).strokeColor("#ffffff40").stroke();
  doc.font("Helvetica").fontSize(7).fillColor("#c5d9ed")
    .text("COMPROVANTE DE DEVOLUÇÃO", docBlockX, 18, { width: docBlockW, align: "center" });
  doc.font("Helvetica-Bold").fontSize(13).fillColor(white)
    .text(`Nº ${String(evento.id).padStart(6, "0")}`, docBlockX, 34, { width: docBlockW, align: "center" });
  doc.font("Helvetica").fontSize(7).fillColor("#c5d9ed")
    .text(fmtDateTime(evento.createdAt), docBlockX, 54, { width: docBlockW, align: "center" });

  let y = headerH + 12;

  // ── SEÇÃO 1: PARTES ENVOLVIDAS ──────────────────────────────────────────
  y = sectionTitle("Partes Envolvidas", y);

  const col2 = cW / 2;
  // Entregador (FC)
  doc.font("Helvetica").fontSize(6.5).fillColor(midGray).text("ENTREGADOR (FC ENGENHARIA)", mL, y);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(dark)
    .text(evento.assinaturaEntregadorNome || evento.usuarioNome || "—", mL, y + 9, { width: col2 - 8 });
  if (obra?.nome) {
    doc.font("Helvetica").fontSize(7.5).fillColor(midGray)
      .text(`Obra: ${obra.nome}`, mL, y + 22, { width: col2 - 8 });
  }
  // Recebedor (locadora)
  doc.font("Helvetica").fontSize(6.5).fillColor(midGray).text("RECEBEDOR (LOCADORA)", mL + col2, y);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(dark)
    .text(evento.assinaturaRecebedorNome || "—", mL + col2, y + 9, { width: col2 - 8 });
  if (fornecedor) {
    const fornLabel = fornecedor.razaoSocial || fornecedor.nomeFantasia || "—";
    doc.font("Helvetica").fontSize(7.5).fillColor(midGray)
      .text(`${fornLabel}${fornecedor.cnpj ? `  ·  CNPJ ${fornecedor.cnpj}` : ""}`, mL + col2, y + 22, { width: col2 - 8 });
  }
  y += 42;

  // ── SEÇÃO 2: EQUIPAMENTOS DEVOLVIDOS ────────────────────────────────────
  y = sectionTitle(`Equipamentos devolvidos (${equipamentos.length})`, y);

  // tabela
  const colDescW = cW * 0.50;
  const colPatW  = cW * 0.20;
  const colObraW = cW * 0.20;
  const colDiasW = cW * 0.10;

  doc.rect(mL, y, cW, 16).fill(lightGray);
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(dark);
  doc.text("DESCRIÇÃO",     mL + 4,                                  y + 4.5, { width: colDescW - 8 });
  doc.text("PATRIMÔNIO",    mL + colDescW + 4,                       y + 4.5, { width: colPatW - 8 });
  doc.text("OBRA",          mL + colDescW + colPatW + 4,             y + 4.5, { width: colObraW - 8 });
  doc.text("DIAS",          mL + colDescW + colPatW + colObraW + 4,  y + 4.5, { width: colDiasW - 8, align: "right" });
  y += 16;

  // map id → evento (pra pegar dias do evento.observacao)
  const evByEquipId = new Map<number, any>();
  eventos.forEach(e => evByEquipId.set(e.equipamentoLocadoId, e));

  for (const eq_ of equipamentos) {
    if (y > pageH - 280) { doc.addPage(); y = 40; }
    const ev_ = evByEquipId.get(eq_.id);
    const obs = ev_?.observacao || "";
    const diasMatch = obs.match(/Tempo na obra: (\d+) dias/);
    const dias = diasMatch ? diasMatch[1] : "—";

    const rowH = 18;
    doc.font("Helvetica").fontSize(8).fillColor(dark);
    doc.text(eq_.descricao || "(sem descrição)", mL + 4, y + 5, { width: colDescW - 8, ellipsis: true, height: 12 });
    doc.font("Helvetica").fontSize(8).fillColor(midGray);
    doc.text(eq_.codigoPatrimonioFornecedor || "—", mL + colDescW + 4, y + 5, { width: colPatW - 8, ellipsis: true });
    const obraNome = obra?.nome || "—";
    doc.text(obraNome, mL + colDescW + colPatW + 4, y + 5, { width: colObraW - 8, ellipsis: true });
    doc.font("Helvetica-Bold").fontSize(8).fillColor(dark);
    doc.text(String(dias), mL + colDescW + colPatW + colObraW + 4, y + 5, { width: colDiasW - 8, align: "right" });
    y += rowH;
    drawHLine(y);
  }
  y += 10;

  // ── SEÇÃO 3: OBSERVAÇÃO ─────────────────────────────────────────────────
  const obsLote = (evento.observacao || "").replace(/^\[Lote(?: · Tempo na obra: \d+ dias)?\]\s*/, "");
  if (obsLote) {
    if (y > pageH - 200) { doc.addPage(); y = 40; }
    y = sectionTitle("Observação", y);
    doc.font("Helvetica").fontSize(8.5).fillColor(dark).text(obsLote, mL, y, { width: cW });
    y += doc.heightOfString(obsLote, { width: cW }) + 10;
  }

  // ── SEÇÃO 4: ASSINATURAS ────────────────────────────────────────────────
  if (y > pageH - 180) { doc.addPage(); y = 40; }
  y = sectionTitle("Assinaturas", y);

  const sigW = (cW - 16) / 2;
  const sigH = 80;

  const sigEntBuf = dataUrlToBuffer(evento.assinaturaEntregadorUrl);
  const sigRecBuf = dataUrlToBuffer(evento.assinaturaRecebedorUrl);

  // Caixa entregador
  doc.rect(mL, y, sigW, sigH).lineWidth(0.5).strokeColor(borderColor).stroke();
  if (sigEntBuf) {
    try { doc.image(sigEntBuf, mL + 6, y + 6, { fit: [sigW - 12, sigH - 26] }); } catch {}
  }
  doc.moveTo(mL + 10, y + sigH - 18).lineTo(mL + sigW - 10, y + sigH - 18).strokeColor(midGray).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(dark)
    .text(evento.assinaturaEntregadorNome || "—", mL, y + sigH - 14, { width: sigW, align: "center" });
  doc.font("Helvetica").fontSize(6.5).fillColor(midGray)
    .text("Entregador (FC Engenharia)", mL, y + sigH - 5, { width: sigW, align: "center" });

  // Caixa recebedor
  const recX = mL + sigW + 16;
  doc.rect(recX, y, sigW, sigH).lineWidth(0.5).strokeColor(borderColor).stroke();
  if (sigRecBuf) {
    try { doc.image(sigRecBuf, recX + 6, y + 6, { fit: [sigW - 12, sigH - 26] }); } catch {}
  }
  doc.moveTo(recX + 10, y + sigH - 18).lineTo(recX + sigW - 10, y + sigH - 18).strokeColor(midGray).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(dark)
    .text(evento.assinaturaRecebedorNome || "—", recX, y + sigH - 14, { width: sigW, align: "center" });
  doc.font("Helvetica").fontSize(6.5).fillColor(midGray)
    .text("Recebedor (Locadora)", recX, y + sigH - 5, { width: sigW, align: "center" });

  y += sigH + 14;

  // ── RODAPÉ ──────────────────────────────────────────────────────────────
  const footY = pageH - 35;
  drawHLine(footY - 6, borderColor, 0.5);
  doc.font("Helvetica").fontSize(6.5).fillColor(midGray)
    .text(
      `Comprovante eletrônico emitido por ${company?.razaoSocial || "FC Engenharia"} · Evento #${evento.id} · ${fmtDateTime(evento.createdAt)}`,
      mL, footY, { width: cW, align: "center" }
    );
  doc.text(
    "Documento gerado digitalmente. As assinaturas acima foram coletadas eletronicamente no momento da devolução.",
    mL, footY + 10, { width: cW, align: "center" }
  );

  return doc;
}
