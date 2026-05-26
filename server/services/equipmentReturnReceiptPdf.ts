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
  // Rev. 2461 — fallback pro logo institucional FC quando a company não
  // tem `logoUrl` cadastrado (caso comum em emissões iniciais).
  if (logoUrl) {
    if (logoUrl.startsWith("data:image")) {
      const m = logoUrl.match(/^data:image\/\w+;base64,(.+)$/);
      if (m?.[1]) return Buffer.from(m[1], "base64");
    } else if (logoUrl.startsWith("/uploads/")) {
      const localPath = path.join(process.cwd(), "server", logoUrl);
      if (fs.existsSync(localPath)) return localPath;
    }
  }
  // Fallback: logo institucional FC publicado em client/public.
  const fallbacks = [
    path.join(process.cwd(), "client", "public", "logo-fc.jpg"),
    path.join(process.cwd(), "public", "logo-fc.jpg"),
  ];
  for (const p of fallbacks) {
    try { if (fs.existsSync(p)) return p; } catch {}
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
  /** Rev. 2461 — todos os fornecedores envolvidos, indexados por id (nome
   *  da locadora por equipamento quando há mais de uma no lote). */
  fornecedoresMap: Map<number, any>;
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

  // Rev. 2461 — buscamos TODOS os fornecedores envolvidos pra exibir o
  // nome da locadora no card "Partes envolvidas" e também por equipamento
  // na tabela (rastreio quando há múltiplas locadoras no mesmo lote).
  let fornecedor: any = null;
  let fornecedoresMap: Map<number, any> = new Map();
  const fornIds = Array.from(new Set(equipamentos.map(e => (e as any).fornecedorId).filter(Boolean))) as number[];
  if (fornIds.length > 0) {
    const fRows = await db.select().from(fornecedores).where(inArray(fornecedores.id, fornIds));
    for (const f of fRows) fornecedoresMap.set(f.id, f);
    if (fornIds.length === 1) fornecedor = fornecedoresMap.get(fornIds[0]) ?? null;
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

  return { evento, eventos, equipamentos, company, obra, fornecedor, fornecedoresMap, fotosBuffers };
}

export function generateReturnReceiptPdf(data: ReturnReceiptData): PDFKit.PDFDocument {
  const { evento, eventos, equipamentos, company, obra, fornecedor, fornecedoresMap, fotosBuffers } = data;
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const mL = 40, mR = 40;
  const cW = pageW - mL - mR;

  // Rev. 2461 — paleta modernizada (mais contraste, accent azul claro).
  const primary    = "#1B2A4A";   // azul institucional FC
  const accent     = "#2563EB";   // azul accent (linhas/divisores)
  const dark       = "#0F172A";   // texto principal
  const midGray    = "#64748B";
  const lightGray  = "#F1F5F9";
  const cardBg     = "#F8FAFC";
  const borderColor= "#E2E8F0";
  const white      = "#ffffff";

  function drawHLine(y: number, color = borderColor, width = 0.5) {
    doc.strokeColor(color).lineWidth(width).moveTo(mL, y).lineTo(pageW - mR, y).stroke();
  }

  function sectionTitle(title: string, y: number): number {
    // Rev. 2461 — pílula colorida à esquerda + título cinza escuro + linha sutil.
    const pillW = 3;
    const pillH = 11;
    doc.rect(mL, y + 1, pillW, pillH).fill(accent);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(dark)
      .text(title.toUpperCase(), mL + pillW + 6, y + 1, { characterSpacing: 0.8 });
    y += 14;
    drawHLine(y, borderColor, 0.6);
    return y + 8;
  }

  // ── CABEÇALHO MODERNO FC (Rev. 2461) ────────────────────────────────────
  // Logo à ESQUERDA + razão social + CNPJ + endereço à DIREITA (split),
  // linha accent fina abaixo, faixa azul gradient-feel com título + Nº/Data
  // dentro da própria faixa (mais compacto, sem linha solta).
  let y = 22;
  const logoSrc = resolveLogoSource(company?.logoUrl);
  const logoSize = 58;
  const headerX = logoSrc ? mL + logoSize + 14 : mL;
  const headerW = pageW - mR - headerX;

  if (logoSrc) {
    try {
      doc.image(logoSrc, mL, y, { fit: [logoSize, logoSize] });
    } catch { /* sem logo */ }
  }

  // Bloco textual à direita do logo
  let yh = y + 2;
  doc.font("Helvetica-Bold").fontSize(14).fillColor(dark)
    .text((company?.razaoSocial || "FC ENGENHARIA").toUpperCase(), headerX, yh, {
      width: headerW, align: "left", characterSpacing: 0.3,
    });
  yh += 17;
  if (company?.cnpj) {
    doc.font("Helvetica").fontSize(8.5).fillColor(midGray)
      .text(`CNPJ ${company.cnpj}`, headerX, yh, { width: headerW, align: "left" });
    yh += 11;
  }
  if (company?.endereco) {
    let addr = company.endereco;
    if (company.cidade) addr += ` · ${company.cidade}`;
    if (company.estado) addr += `/${company.estado}`;
    if (company.cep)    addr += ` · CEP ${company.cep}`;
    doc.font("Helvetica").fontSize(7.5).fillColor("#94A3B8")
      .text(addr, headerX, yh, { width: headerW, align: "left" });
    yh += 11;
  }
  y = Math.max(y + logoSize, yh) + 6;

  // Linha accent fina (separa header da faixa)
  doc.strokeColor(accent).lineWidth(1.5).moveTo(mL, y).lineTo(mL + 60, y).stroke();
  doc.strokeColor(borderColor).lineWidth(0.5).moveTo(mL + 60, y).lineTo(pageW - mR, y).stroke();
  y += 12;

  // Faixa azul institucional COMPACTA — agora abriga título + Nº + data
  const stripH = 40;
  doc.rect(mL, y, cW, stripH).fill(primary);
  // Barra accent à esquerda dentro da faixa
  doc.rect(mL, y, 4, stripH).fill(accent);

  doc.font("Helvetica-Bold").fontSize(12).fillColor(white)
    .text("COMPROVANTE DE DEVOLUÇÃO", mL + 14, y + 7, {
      width: cW - 28, align: "left", characterSpacing: 2,
    });
  // Linha inferior dentro da faixa: Nº (esq) + Data (dir)
  doc.font("Helvetica").fontSize(8).fillColor("#CBD5E1")
    .text(`Nº ${String(evento.id).padStart(6, "0")}`, mL + 14, y + 24, {
      width: (cW - 28) / 2, align: "left",
    });
  doc.font("Helvetica").fontSize(8).fillColor("#CBD5E1")
    .text(`Emitido em ${fmtDateTime(evento.createdAt)}`,
      mL + 14 + (cW - 28) / 2, y + 24, { width: (cW - 28) / 2, align: "right" });
  y += stripH + 14;

  // ── SEÇÃO 1: PARTES ENVOLVIDAS (cards modernos lado a lado) ─────────────
  y = sectionTitle("Partes Envolvidas", y);

  const gap = 12;
  const cardW = (cW - gap) / 2;
  // Card 1 — ENTREGADOR (FC) ───────────────────────────────────
  const card1H = 56;
  doc.rect(mL, y, cardW, card1H).fill(cardBg);
  doc.rect(mL, y, 3, card1H).fill(primary);
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor(primary)
    .text("ENTREGADOR · FC ENGENHARIA", mL + 10, y + 7, { width: cardW - 16, characterSpacing: 0.6 });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(dark)
    .text(evento.assinaturaEntregadorNome || evento.usuarioNome || "—",
      mL + 10, y + 18, { width: cardW - 16, ellipsis: true });
  if (obra?.nome) {
    doc.font("Helvetica").fontSize(8).fillColor(midGray)
      .text(`Obra: ${obra.nome}`, mL + 10, y + 33, { width: cardW - 16, ellipsis: true });
  }
  doc.font("Helvetica").fontSize(7).fillColor("#94A3B8")
    .text(`Data: ${fmtDateTime(evento.createdAt)}`, mL + 10, y + 44, { width: cardW - 16 });

  // Card 2 — LOCADORA ─────────────────────────────────────────
  // Rev. 2461 — agora destaca o NOME DA EMPRESA locadora (rastreio),
  // não só quem assinou. Quando há múltiplas locadoras no lote, lista
  // "X locadoras" com link pra tabela abaixo.
  const card2X = mL + cardW + gap;
  doc.rect(card2X, y, cardW, card1H).fill(cardBg);
  doc.rect(card2X, y, 3, card1H).fill(accent);
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor(accent)
    .text("LOCADORA", card2X + 10, y + 7, { width: cardW - 16, characterSpacing: 0.6 });

  let locadoraNome = "—";
  let locadoraSubtitulo = "";
  if (fornecedor) {
    locadoraNome = (fornecedor.razaoSocial || fornecedor.nomeFantasia || "—").toString();
    locadoraSubtitulo = fornecedor.cnpj ? `CNPJ ${fornecedor.cnpj}` : "";
  } else if (fornecedoresMap && fornecedoresMap.size > 1) {
    locadoraNome = `${fornecedoresMap.size} locadoras envolvidas`;
    locadoraSubtitulo = "Ver coluna LOCADOR na tabela abaixo";
  } else {
    // Fallback: nome denormalizado do primeiro equipamento.
    const fallback = equipamentos.find((e: any) => e.fornecedorNome);
    if (fallback) locadoraNome = fallback.fornecedorNome;
  }
  doc.font("Helvetica-Bold").fontSize(11).fillColor(dark)
    .text(locadoraNome, card2X + 10, y + 18, { width: cardW - 16, ellipsis: true });
  if (locadoraSubtitulo) {
    doc.font("Helvetica").fontSize(8).fillColor(midGray)
      .text(locadoraSubtitulo, card2X + 10, y + 33, { width: cardW - 16, ellipsis: true });
  }
  doc.font("Helvetica").fontSize(7).fillColor("#94A3B8")
    .text(`Recebido por: ${evento.assinaturaRecebedorNome || "—"}`,
      card2X + 10, y + 44, { width: cardW - 16, ellipsis: true });

  y += card1H + 14;

  // ── SEÇÃO 2: EQUIPAMENTOS DEVOLVIDOS (com FOTO + LOCADOR) ───────────────
  y = sectionTitle(`Equipamentos devolvidos (${equipamentos.length})`, y);

  // Rev. 2461 — adicionada coluna LOCADOR (essencial pro rastreio).
  // Larguras de coluna recalibradas (some 8pt da OBRA, vira coluna LOCADOR).
  const hasMultiLocadora = fornecedoresMap && fornecedoresMap.size > 1;
  const colFotoW = cW * 0.07;
  const colDescW = cW * (hasMultiLocadora ? 0.34 : 0.46);
  const colPatW  = cW * 0.13;
  const colLocW  = cW * (hasMultiLocadora ? 0.16 : 0.00);
  const colObraW = cW * 0.22;
  const colDiasW = cW - colFotoW - colDescW - colPatW - colLocW - colObraW;

  // Header da tabela
  doc.rect(mL, y, cW, 18).fill(primary);
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(white);
  let cx = mL + 6;
  doc.text("FOTO",       cx,                                                       y + 5.5, { width: colFotoW - 8, align: "center" });
  doc.text("DESCRIÇÃO",  mL + colFotoW + 6,                                        y + 5.5, { width: colDescW - 8, characterSpacing: 0.5 });
  doc.text("PATRIMÔNIO", mL + colFotoW + colDescW + 6,                             y + 5.5, { width: colPatW - 8, characterSpacing: 0.5 });
  if (hasMultiLocadora) {
    doc.text("LOCADOR",  mL + colFotoW + colDescW + colPatW + 6,                   y + 5.5, { width: colLocW - 8, characterSpacing: 0.5 });
  }
  doc.text("OBRA",       mL + colFotoW + colDescW + colPatW + colLocW + 6,         y + 5.5, { width: colObraW - 8, characterSpacing: 0.5 });
  doc.text("DIAS",       mL + colFotoW + colDescW + colPatW + colLocW + colObraW + 6, y + 5.5, { width: colDiasW - 8, align: "right", characterSpacing: 0.5 });
  y += 18;

  const evByEquipId = new Map<number, any>();
  eventos.forEach(e => evByEquipId.set(e.equipamentoLocadoId, e));

  const rowH = 40;
  let zebra = false;
  for (const eq_ of equipamentos) {
    if (y + rowH > pageH - 220) { doc.addPage(); y = 40; zebra = false; }

    // Zebra striping (alterna lightGray)
    if (zebra) doc.rect(mL, y, cW, rowH).fill(lightGray);
    zebra = !zebra;

    const ev_ = evByEquipId.get(eq_.id);
    const obs = ev_?.observacao || "";
    const diasMatch = obs.match(/Tempo na obra: (\d+) dias/);
    const dias = diasMatch ? diasMatch[1] : "—";

    // FOTO
    const fotoBuf = fotosBuffers.get(eq_.id);
    const thumb = 32;
    const thumbX = mL + (colFotoW - thumb) / 2;
    const thumbY = y + (rowH - thumb) / 2;
    if (fotoBuf) {
      try {
        doc.image(fotoBuf, thumbX, thumbY, { fit: [thumb, thumb] });
      } catch {
        doc.rect(thumbX, thumbY, thumb, thumb).lineWidth(0.5).strokeColor(borderColor).stroke();
      }
    } else {
      doc.rect(thumbX, thumbY, thumb, thumb).lineWidth(0.5).strokeColor(borderColor).stroke();
    }

    // DESCRIÇÃO
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(dark);
    doc.text(eq_.descricao || "(sem descrição)",
      mL + colFotoW + 6, y + 8,
      { width: colDescW - 10, height: rowH - 14, ellipsis: true });
    if (eq_.categoria) {
      doc.font("Helvetica").fontSize(6.5).fillColor(midGray)
        .text(eq_.categoria, mL + colFotoW + 6, y + 23, { width: colDescW - 10, ellipsis: true });
    }

    // PATRIMÔNIO
    doc.font("Helvetica").fontSize(8).fillColor(dark);
    doc.text(eq_.codigoPatrimonioFornecedor || "—",
      mL + colFotoW + colDescW + 6, y + rowH / 2 - 4,
      { width: colPatW - 8, ellipsis: true });

    // LOCADOR (só quando múltiplas)
    if (hasMultiLocadora) {
      const eqForn = (eq_ as any).fornecedorId ? fornecedoresMap.get((eq_ as any).fornecedorId) : null;
      const eqFornNome = eqForn?.razaoSocial || eqForn?.nomeFantasia || (eq_ as any).fornecedorNome || "—";
      doc.font("Helvetica").fontSize(7.5).fillColor(midGray);
      doc.text(eqFornNome,
        mL + colFotoW + colDescW + colPatW + 6, y + rowH / 2 - 4,
        { width: colLocW - 8, ellipsis: true });
    }

    // OBRA
    doc.font("Helvetica").fontSize(8).fillColor(midGray);
    doc.text(obra?.nome || "—",
      mL + colFotoW + colDescW + colPatW + colLocW + 6, y + rowH / 2 - 4,
      { width: colObraW - 8, ellipsis: true });

    // DIAS
    doc.font("Helvetica-Bold").fontSize(10).fillColor(primary);
    doc.text(String(dias),
      mL + colFotoW + colDescW + colPatW + colLocW + colObraW + 6, y + rowH / 2 - 5,
      { width: colDiasW - 12, align: "right" });

    y += rowH;
    drawHLine(y, borderColor, 0.3);
  }
  y += 10;

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
