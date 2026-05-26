// ============================================================================
// Rev. 2458 — Comprovante de Devolução de Equipamentos Locados (PDF)
// ============================================================================
// Layout institucional FC, agora com:
//  - Cabeçalho CENTRADO no padrão FC (logo + razão social + CNPJ + endereço)
//  - Faixa azul com TÍTULO + Nº + Data de Emissão
//  - Tabela de equipamentos com COLUNA FOTO (thumb 32x32 — buscada do
//    `fotosDevolucaoJson` > `fotosRecebimentoJson` > `fotoUrl` canônica)
//  - Assinaturas (entregador FC + recebedor locadora)
//  - Rodapé compacto LOGO APÓS as assinaturas (fim do conteúdo) — NÃO mais
//    fixo em `pageH-35` (esse posicionamento estava gerando uma 2ª página
//    em branco com só o rodapé).
//
// Acessado via rota pública assinada `/api/comprovante-devolucao/:id/:token.pdf`.
// ============================================================================
import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";
import { getDb } from "../db";
import {
  equipamentoLocadoEventos,
  equipamentosLocados,
  equipamentosFotosCanonicas,
  companies,
  obras,
  fornecedores,
} from "../../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";

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

/**
 * Resolve uma URL de imagem em Buffer pro PDFKit.
 * Suporta:
 *  - `data:image/...;base64,...`
 *  - `/uploads/...` (local)
 *  - `http(s)://...` (fetch remoto, timeout 4s)
 * Retorna null em qualquer falha (PDF segue sem foto).
 */
async function resolveImageBuffer(url: string | null | undefined): Promise<Buffer | null> {
  if (!url || typeof url !== "string") return null;

  if (url.startsWith("data:image")) {
    return dataUrlToBuffer(url);
  }

  if (url.startsWith("/uploads/")) {
    try {
      const localPath = path.join(process.cwd(), "server", url);
      if (fs.existsSync(localPath)) return fs.readFileSync(localPath);
    } catch { /* ignore */ }
    return null;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      const buf = Buffer.from(arr);
      // PDFKit aceita JPG/PNG. Rejeita resto pra não estourar.
      if (buf.length < 8) return null;
      const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
      const isPng = buf[0] === 0x89 && buf[1] === 0x50;
      if (!isJpg && !isPng) return null;
      return buf;
    } catch { return null; }
  }

  return null;
}

export interface ReturnReceiptData {
  evento: any;                      // evento principal (com assinaturas)
  eventos: any[];                   // todos os eventos do mesmo lote
  equipamentos: any[];              // equipamentos devolvidos
  company: any | null;
  obra: any | null;
  fornecedor: any | null;
  /** Map equipId → Buffer da foto (pré-resolvida pra não tornar o gerador async). */
  fotosBuffers: Map<number, Buffer>;
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

  // Rev. 2458 — pré-buscar fotos canônicas da empresa pra fallback.
  const normalizar = (s: string): string =>
    (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase().replace(/\s+/g, " ").trim();
  let canonByDesc = new Map<string, string>();
  try {
    const canon = await db.select().from(equipamentosFotosCanonicas)
      .where(eq(equipamentosFotosCanonicas.companyId, evento.companyId));
    for (const c of canon) canonByDesc.set(c.descricaoNormalizada, c.fotoUrl);
  } catch { /* tabela pode não existir em ambientes antigos */ }

  // Rev. 2458 — pré-resolver UMA foto por equipamento. Ordem de prioridade:
  //   1) primeira URL de `fotosDevolucaoJson` (foto do ato da devolução)
  //   2) primeira URL de `fotosRecebimentoJson` (foto do recebimento na obra)
  //   3) foto canônica da empresa (por descrição normalizada)
  //   4) `fotoUrl` (legado IA Rev. 2340)
  const fotosBuffers = new Map<number, Buffer>();
  await Promise.all(equipamentos.map(async (eq_: any) => {
    const candidatos: string[] = [];

    const pushArr = (raw: any) => {
      if (!raw) return;
      try {
        const arr = Array.isArray(raw) ? raw : JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) {
          const first = arr[0];
          if (typeof first === "string") candidatos.push(first);
          else if (first?.url) candidatos.push(first.url);
        }
      } catch { /* ignore */ }
    };
    pushArr(eq_.fotosDevolucaoJson);
    pushArr(eq_.fotosRecebimentoJson);
    const canonUrl = canonByDesc.get(normalizar(eq_.descricao || ""));
    if (canonUrl) candidatos.push(canonUrl);
    if (eq_.fotoUrl) candidatos.push(eq_.fotoUrl);

    for (const url of candidatos) {
      const buf = await resolveImageBuffer(url);
      if (buf) { fotosBuffers.set(eq_.id, buf); return; }
    }
  }));

  return { evento, eventos, equipamentos, company, obra, fornecedor, fotosBuffers };
}

export function generateReturnReceiptPdf(data: ReturnReceiptData): PDFKit.PDFDocument {
  const { evento, eventos, equipamentos, company, obra, fornecedor, fotosBuffers } = data;
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

  // ── CABEÇALHO PADRÃO FC (Rev. 2106+) — CENTRADO ─────────────────────────
  // Logo centralizado em cima, razão social, CNPJ, endereço — tudo centrado.
  // Faixa azul full-width com TÍTULO + Nº + Data.
  let y = 18;
  const logoSrc = resolveLogoSource(company?.logoUrl);
  const logoSize = 50;
  if (logoSrc) {
    try {
      doc.image(logoSrc, (pageW - logoSize) / 2, y, { fit: [logoSize, logoSize] });
      y += logoSize + 4;
    } catch { /* sem logo */ }
  }

  doc.font("Helvetica-Bold").fontSize(13).fillColor(dark)
    .text((company?.razaoSocial || "FC ENGENHARIA").toUpperCase(), mL, y, { width: cW, align: "center" });
  y += 16;

  if (company?.cnpj) {
    doc.font("Helvetica").fontSize(8).fillColor(midGray)
      .text(`CNPJ: ${company.cnpj}`, mL, y, { width: cW, align: "center" });
    y += 10;
  }
  if (company?.endereco) {
    let addr = company.endereco;
    if (company.cidade) addr += ` — ${company.cidade}`;
    if (company.estado) addr += `/${company.estado}`;
    if (company.cep)    addr += ` — CEP: ${company.cep}`;
    doc.font("Helvetica").fontSize(7.5).fillColor("#8a8a8a")
      .text(addr.toUpperCase(), mL, y, { width: cW, align: "center" });
    y += 10;
  }

  // Faixa azul institucional
  y += 6;
  const stripH = 30;
  doc.rect(mL, y, cW, stripH).fill(primary);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(white)
    .text("COMPROVANTE DE DEVOLUÇÃO", mL, y + 9, {
      width: cW, align: "center", characterSpacing: 2.5,
    });
  y += stripH + 4;

  // Linha Nº / Data de Emissão
  doc.font("Helvetica-Bold").fontSize(9).fillColor(dark)
    .text(`Nº ${String(evento.id).padStart(6, "0")}`, mL, y, { width: cW / 2, align: "left" });
  doc.font("Helvetica").fontSize(9).fillColor(midGray)
    .text(`Data de Emissão: ${fmtDateTime(evento.createdAt)}`, mL + cW / 2, y, {
      width: cW / 2, align: "right",
    });
  y += 18;

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

  // ── SEÇÃO 2: EQUIPAMENTOS DEVOLVIDOS (com FOTO) ─────────────────────────
  y = sectionTitle(`Equipamentos devolvidos (${equipamentos.length})`, y);

  // Larguras de coluna — agora com FOTO (8%)
  const colFotoW = cW * 0.08;
  const colDescW = cW * 0.47;
  const colPatW  = cW * 0.15;
  const colObraW = cW * 0.22;
  const colDiasW = cW * 0.08;

  // Header da tabela
  doc.rect(mL, y, cW, 16).fill(lightGray);
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(dark);
  doc.text("FOTO",          mL + 4,                                              y + 4.5, { width: colFotoW - 8, align: "center" });
  doc.text("DESCRIÇÃO",     mL + colFotoW + 4,                                   y + 4.5, { width: colDescW - 8 });
  doc.text("PATRIMÔNIO",    mL + colFotoW + colDescW + 4,                        y + 4.5, { width: colPatW - 8 });
  doc.text("OBRA",          mL + colFotoW + colDescW + colPatW + 4,              y + 4.5, { width: colObraW - 8 });
  doc.text("DIAS",          mL + colFotoW + colDescW + colPatW + colObraW + 4,   y + 4.5, { width: colDiasW - 8, align: "right" });
  y += 16;

  const evByEquipId = new Map<number, any>();
  eventos.forEach(e => evByEquipId.set(e.equipamentoLocadoId, e));

  const rowH = 38; // altura maior pra acomodar a thumb 32x32
  for (const eq_ of equipamentos) {
    // Page break preserva o bloco assinaturas (~180pt) + rodapé (~40pt).
    if (y + rowH > pageH - 220) { doc.addPage(); y = 40; }

    const ev_ = evByEquipId.get(eq_.id);
    const obs = ev_?.observacao || "";
    const diasMatch = obs.match(/Tempo na obra: (\d+) dias/);
    const dias = diasMatch ? diasMatch[1] : "—";

    // FOTO (thumb 32x32 centralizada na célula)
    const fotoBuf = fotosBuffers.get(eq_.id);
    const thumb = 32;
    if (fotoBuf) {
      try {
        doc.image(fotoBuf, mL + (colFotoW - thumb) / 2, y + (rowH - thumb) / 2, {
          fit: [thumb, thumb],
        });
      } catch {
        // Placeholder se imagem corromper
        doc.rect(mL + (colFotoW - thumb) / 2, y + (rowH - thumb) / 2, thumb, thumb)
          .lineWidth(0.5).strokeColor(borderColor).stroke();
      }
    } else {
      // Placeholder vazio com "—"
      doc.rect(mL + (colFotoW - thumb) / 2, y + (rowH - thumb) / 2, thumb, thumb)
        .lineWidth(0.5).strokeColor(borderColor).stroke();
      doc.font("Helvetica").fontSize(7).fillColor("#cccccc")
        .text("—", mL, y + rowH / 2 - 4, { width: colFotoW, align: "center" });
    }

    // DESCRIÇÃO (até 2 linhas)
    doc.font("Helvetica").fontSize(8).fillColor(dark);
    doc.text(eq_.descricao || "(sem descrição)",
      mL + colFotoW + 4, y + 6,
      { width: colDescW - 8, height: rowH - 12, ellipsis: true });

    // PATRIMÔNIO
    doc.font("Helvetica").fontSize(8).fillColor(midGray);
    doc.text(eq_.codigoPatrimonioFornecedor || "—",
      mL + colFotoW + colDescW + 4, y + rowH / 2 - 5,
      { width: colPatW - 8, ellipsis: true });

    // OBRA
    const obraNome = obra?.nome || "—";
    doc.text(obraNome,
      mL + colFotoW + colDescW + colPatW + 4, y + rowH / 2 - 5,
      { width: colObraW - 8, ellipsis: true });

    // DIAS
    doc.font("Helvetica-Bold").fontSize(9).fillColor(primary);
    doc.text(String(dias),
      mL + colFotoW + colDescW + colPatW + colObraW + 4, y + rowH / 2 - 5,
      { width: colDiasW - 8, align: "right" });

    y += rowH;
    drawHLine(y);
  }
  y += 8;

  // ── SEÇÃO 3: OBSERVAÇÃO ─────────────────────────────────────────────────
  const obsLote = (evento.observacao || "").replace(/^\[Lote(?: · Tempo na obra: \d+ dias)?\]\s*/, "");
  if (obsLote) {
    if (y > pageH - 220) { doc.addPage(); y = 40; }
    y = sectionTitle("Observação", y);
    doc.font("Helvetica").fontSize(8.5).fillColor(dark).text(obsLote, mL, y, { width: cW });
    y += doc.heightOfString(obsLote, { width: cW }) + 8;
  }

  // ── SEÇÃO 4: ASSINATURAS ────────────────────────────────────────────────
  // Garante espaço pras 2 caixas (sigH=80) + rótulos + rodapé (~50).
  if (y > pageH - 170) { doc.addPage(); y = 40; }
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

  y += sigH + 12;

  // ── RODAPÉ ──────────────────────────────────────────────────────────────
  // Rev. 2458 — rodapé agora fica LOGO após as assinaturas (não mais em
  // `pageH-35`, que estava jogando o texto numa 2ª página em branco).
  drawHLine(y, borderColor, 0.5);
  y += 5;
  doc.font("Helvetica").fontSize(6.5).fillColor(midGray)
    .text(
      `Comprovante eletrônico emitido por ${company?.razaoSocial || "FC Engenharia"} · Evento #${evento.id} · ${fmtDateTime(evento.createdAt)}`,
      mL, y, { width: cW, align: "center" }
    );
  doc.text(
    "Documento gerado digitalmente. As assinaturas acima foram coletadas eletronicamente no momento da devolução.",
    mL, y + 9, { width: cW, align: "center" }
  );

  return doc;
}
