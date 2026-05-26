// ============================================================================
// Rev. 2465 — Comprovante de RECEBIMENTO de Equipamento Locado (PDF)
// ============================================================================
// Espelha o `equipmentReturnReceiptPdf.ts` (Rev. 2461) mas pro RECEBIMENTO
// inicial do equipamento na obra. Diferenças do PDF de devolução:
//  - Título: "COMPROVANTE DE RECEBIMENTO"
//  - Cards de partes INVERTIDOS: ENTREGADOR = locadora (quem trouxe na obra),
//    RECEBEDOR = operador FC (quem conferiu e assinou)
//  - Tabela: coluna DIAS substituída por DATA INÍCIO da locação
//  - Mostra Nº DA OC (Ordem de Compra) em destaque quando vinculado
//  - Usa `fotosRecebimentoJson` direto (sem fallback de devolução)
//
// Acessado via rota pública assinada
// `/api/comprovante-recebimento/:id/:token.pdf`.
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
  comprasOrdens,
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
  if (logoUrl) {
    if (logoUrl.startsWith("data:image")) {
      const m = logoUrl.match(/^data:image\/\w+;base64,(.+)$/);
      if (m?.[1]) return Buffer.from(m[1], "base64");
    } else if (logoUrl.startsWith("/uploads/")) {
      const localPath = path.join(process.cwd(), "server", logoUrl);
      if (fs.existsSync(localPath)) return localPath;
    }
  }
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

async function resolveImageBuffer(url: string | null | undefined): Promise<Buffer | null> {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("data:image")) return dataUrlToBuffer(url);
  if (url.startsWith("/uploads/")) {
    try {
      const localPath = path.join(process.cwd(), "server", url);
      if (fs.existsSync(localPath)) return fs.readFileSync(localPath);
    } catch {}
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
      if (buf.length < 8) return null;
      const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
      const isPng = buf[0] === 0x89 && buf[1] === 0x50;
      if (!isJpg && !isPng) return null;
      return buf;
    } catch { return null; }
  }
  return null;
}

export interface ReceiptData {
  evento: any;
  eventos: any[];                   // todos do mesmo token (normalmente 1)
  equipamentos: any[];
  company: any | null;
  obra: any | null;
  fornecedor: any | null;
  fornecedoresMap: Map<number, any>;
  /** Map equipId → numeroOc (rastreio da OC vinculada ao recebimento). */
  ocsMap: Map<number, string>;
  fotosBuffers: Map<number, Buffer>;
}

export async function fetchReceiptData(eventoId: number): Promise<ReceiptData> {
  const db = await getDb();
  const [evento] = await db.select().from(equipamentoLocadoEventos)
    .where(eq(equipamentoLocadoEventos.id, eventoId));
  if (!evento) throw new Error("Evento de recebimento não encontrado");
  if (evento.tipo !== "RECEBIMENTO") {
    throw new Error("Evento não é de recebimento");
  }

  // Recebimento é tipicamente 1 equipamento por evento, mas mantemos o
  // padrão de agrupamento por `pdfComprovanteToken` pra compat futura.
  let eventos: any[];
  if (evento.pdfComprovanteToken) {
    eventos = await db.select().from(equipamentoLocadoEventos)
      .where(and(
        eq(equipamentoLocadoEventos.companyId, evento.companyId),
        eq(equipamentoLocadoEventos.tipo, "RECEBIMENTO"),
        eq(equipamentoLocadoEventos.pdfComprovanteToken, evento.pdfComprovanteToken),
      ));
  } else {
    eventos = [evento];
  }

  const equipIds = eventos.map(e => e.equipamentoLocadoId);
  const equipamentos = equipIds.length > 0
    ? await db.select().from(equipamentosLocados)
        .where(eq(equipamentosLocados.companyId, evento.companyId))
        .then(list => list.filter(eq_ => equipIds.includes(eq_.id)))
    : [];

  const [company] = await db.select().from(companies).where(eq(companies.id, evento.companyId));

  let obra: any = null;
  if (evento.obraId) {
    const [o] = await db.select().from(obras).where(eq(obras.id, evento.obraId));
    obra = o ?? null;
  }

  let fornecedor: any = null;
  const fornecedoresMap: Map<number, any> = new Map();
  const fornIds = Array.from(new Set(equipamentos.map(e => (e as any).fornecedorId).filter(Boolean))) as number[];
  if (fornIds.length > 0) {
    const fRows = await db.select().from(fornecedores).where(inArray(fornecedores.id, fornIds));
    for (const f of fRows) fornecedoresMap.set(f.id, f);
    if (fornIds.length === 1) fornecedor = fornecedoresMap.get(fornIds[0]) ?? null;
  }

  // Rev. 2465 — busca numeroOc das OCs vinculadas (rastreio essencial).
  const ocsMap: Map<number, string> = new Map();
  const ocIds = Array.from(new Set(
    equipamentos.map(e => (e as any).ordemCompraId).filter(Boolean)
  )) as number[];
  if (ocIds.length > 0) {
    try {
      const ocRows = await db.select({
        id: comprasOrdens.id,
        numeroOc: comprasOrdens.numeroOc,
      }).from(comprasOrdens).where(inArray(comprasOrdens.id, ocIds));
      const ocById = new Map(ocRows.map(o => [o.id, o.numeroOc as string]));
      for (const eq_ of equipamentos) {
        const ocId = (eq_ as any).ordemCompraId;
        if (ocId && ocById.has(ocId)) ocsMap.set(eq_.id, ocById.get(ocId)!);
      }
    } catch { /* opcional */ }
  }

  // Fotos canônicas (fallback)
  const normalizar = (s: string): string =>
    (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase().replace(/\s+/g, " ").trim();
  const canonByDesc = new Map<string, string>();
  try {
    const canon = await db.select().from(equipamentosFotosCanonicas)
      .where(eq(equipamentosFotosCanonicas.companyId, evento.companyId));
    for (const c of canon) canonByDesc.set(c.descricaoNormalizada, c.fotoUrl);
  } catch {}

  // Pré-resolver UMA foto por equipamento. Prioridade no recebimento:
  //  1) `fotosRecebimentoJson` (foto do ato — quase sempre presente)
  //  2) `fotosJson` do próprio evento (mesmo conteúdo, fallback)
  //  3) foto canônica da empresa
  //  4) `fotoUrl` (legado IA)
  const fotosBuffers = new Map<number, Buffer>();
  const evByEquipId = new Map<number, any>();
  for (const e of eventos) evByEquipId.set(e.equipamentoLocadoId, e);
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
      } catch {}
    };
    pushArr(eq_.fotosRecebimentoJson);
    const ev_ = evByEquipId.get(eq_.id);
    if (ev_) pushArr(ev_.fotosJson);
    const canonUrl = canonByDesc.get(normalizar(eq_.descricao || ""));
    if (canonUrl) candidatos.push(canonUrl);
    if (eq_.fotoUrl) candidatos.push(eq_.fotoUrl);
    for (const url of candidatos) {
      const buf = await resolveImageBuffer(url);
      if (buf) { fotosBuffers.set(eq_.id, buf); return; }
    }
  }));

  return { evento, eventos, equipamentos, company, obra, fornecedor, fornecedoresMap, ocsMap, fotosBuffers };
}

export function generateReceiptPdf(data: ReceiptData): PDFKit.PDFDocument {
  const { evento, eventos, equipamentos, company, obra, fornecedor, fornecedoresMap, ocsMap, fotosBuffers } = data;
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const mL = 40, mR = 40;
  const cW = pageW - mL - mR;

  const primary    = "#1B2A4A";
  const accent     = "#2563EB";
  const accentRec  = "#059669"; // verde pro recebimento (vs azul devolução)
  const dark       = "#0F172A";
  const midGray    = "#64748B";
  const lightGray  = "#F1F5F9";
  const cardBg     = "#F8FAFC";
  const borderColor= "#E2E8F0";
  const white      = "#ffffff";

  function drawHLine(y: number, color = borderColor, width = 0.5) {
    doc.strokeColor(color).lineWidth(width).moveTo(mL, y).lineTo(pageW - mR, y).stroke();
  }

  function sectionTitle(title: string, y: number): number {
    const pillW = 3, pillH = 11;
    doc.rect(mL, y + 1, pillW, pillH).fill(accent);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(dark)
      .text(title.toUpperCase(), mL + pillW + 6, y + 1, { characterSpacing: 0.8 });
    y += 14;
    drawHLine(y, borderColor, 0.6);
    return y + 8;
  }

  // ── CABEÇALHO FC ────────────────────────────────────────────────────────
  let y = 22;
  const logoSrc = resolveLogoSource(company?.logoUrl);
  const logoSize = 58;
  const headerX = logoSrc ? mL + logoSize + 14 : mL;
  const headerW = pageW - mR - headerX;

  if (logoSrc) {
    try { doc.image(logoSrc, mL, y, { fit: [logoSize, logoSize] }); } catch {}
  }

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

  doc.strokeColor(accentRec).lineWidth(1.5).moveTo(mL, y).lineTo(mL + 60, y).stroke();
  doc.strokeColor(borderColor).lineWidth(0.5).moveTo(mL + 60, y).lineTo(pageW - mR, y).stroke();
  y += 12;

  // Faixa verde (recebimento — vs azul da devolução)
  const stripH = 40;
  doc.rect(mL, y, cW, stripH).fill(primary);
  doc.rect(mL, y, 4, stripH).fill(accentRec);

  doc.font("Helvetica-Bold").fontSize(12).fillColor(white)
    .text("COMPROVANTE DE RECEBIMENTO", mL + 14, y + 7, {
      width: cW - 28, align: "left", characterSpacing: 2,
    });
  doc.font("Helvetica").fontSize(8).fillColor("#CBD5E1")
    .text(`Nº ${String(evento.id).padStart(6, "0")}`, mL + 14, y + 24, {
      width: (cW - 28) / 2, align: "left",
    });
  doc.font("Helvetica").fontSize(8).fillColor("#CBD5E1")
    .text(`Emitido em ${fmtDateTime(evento.createdAt)}`,
      mL + 14 + (cW - 28) / 2, y + 24, { width: (cW - 28) / 2, align: "right" });
  y += stripH + 14;

  // ── Nº OC em destaque (quando todos os equipamentos têm a mesma OC) ──
  const ocNumerosUnicos = Array.from(new Set(ocsMap.values()));
  if (ocNumerosUnicos.length === 1) {
    const ocBoxH = 26;
    doc.rect(mL, y, cW, ocBoxH).fill("#ECFDF5"); // verde claro
    doc.rect(mL, y, 3, ocBoxH).fill(accentRec);
    doc.font("Helvetica-Bold").fontSize(7).fillColor(accentRec)
      .text("ORDEM DE COMPRA", mL + 10, y + 5, { characterSpacing: 0.8 });
    doc.font("Helvetica-Bold").fontSize(13).fillColor(dark)
      .text(`Nº ${ocNumerosUnicos[0]}`, mL + 10, y + 13, { width: cW - 20 });
    y += ocBoxH + 12;
  } else if (ocNumerosUnicos.length > 1) {
    // Múltiplas OCs (raro em recebimento single) — mostra na tabela.
    const ocBoxH = 22;
    doc.rect(mL, y, cW, ocBoxH).fill("#ECFDF5");
    doc.rect(mL, y, 3, ocBoxH).fill(accentRec);
    doc.font("Helvetica-Bold").fontSize(7).fillColor(accentRec)
      .text(`${ocNumerosUnicos.length} ORDENS DE COMPRA VINCULADAS`, mL + 10, y + 7, { characterSpacing: 0.8 });
    doc.font("Helvetica").fontSize(8).fillColor(midGray)
      .text("Ver coluna OC na tabela abaixo", mL + 200, y + 7);
    y += ocBoxH + 12;
  }

  // ── SEÇÃO 1: PARTES ENVOLVIDAS (cards) ────────────────────────────────
  y = sectionTitle("Partes Envolvidas", y);

  const gap = 12;
  const cardW = (cW - gap) / 2;
  const cardH = 56;

  // Card 1 — ENTREGADOR · LOCADORA (Rev. 2465: invertido vs devolução)
  doc.rect(mL, y, cardW, cardH).fill(cardBg);
  doc.rect(mL, y, 3, cardH).fill(accent);
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor(accent)
    .text("ENTREGADOR · LOCADORA", mL + 10, y + 7, { width: cardW - 16, characterSpacing: 0.6 });

  let locadoraNome = "—";
  let locadoraSub = "";
  if (fornecedor) {
    locadoraNome = (fornecedor.razaoSocial || fornecedor.nomeFantasia || "—").toString();
    locadoraSub = fornecedor.cnpj ? `CNPJ ${fornecedor.cnpj}` : "";
  } else if (fornecedoresMap && fornecedoresMap.size > 1) {
    locadoraNome = `${fornecedoresMap.size} locadoras envolvidas`;
  } else {
    const fallback = equipamentos.find((e: any) => e.fornecedorNome);
    if (fallback) locadoraNome = fallback.fornecedorNome;
  }
  doc.font("Helvetica-Bold").fontSize(11).fillColor(dark)
    .text(locadoraNome, mL + 10, y + 18, { width: cardW - 16, ellipsis: true });
  if (locadoraSub) {
    doc.font("Helvetica").fontSize(8).fillColor(midGray)
      .text(locadoraSub, mL + 10, y + 33, { width: cardW - 16, ellipsis: true });
  }
  doc.font("Helvetica").fontSize(7).fillColor("#94A3B8")
    .text(`Entregue por: ${evento.assinaturaEntregadorNome || "—"}`,
      mL + 10, y + 44, { width: cardW - 16, ellipsis: true });

  // Card 2 — RECEBEDOR · FC ENGENHARIA
  const card2X = mL + cardW + gap;
  doc.rect(card2X, y, cardW, cardH).fill(cardBg);
  doc.rect(card2X, y, 3, cardH).fill(accentRec);
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor(accentRec)
    .text("RECEBEDOR · FC ENGENHARIA", card2X + 10, y + 7, { width: cardW - 16, characterSpacing: 0.6 });
  doc.font("Helvetica-Bold").fontSize(11).fillColor(dark)
    .text(evento.assinaturaRecebedorNome || evento.usuarioNome || "—",
      card2X + 10, y + 18, { width: cardW - 16, ellipsis: true });
  if (obra?.nome) {
    doc.font("Helvetica").fontSize(8).fillColor(midGray)
      .text(`Obra: ${obra.nome}`, card2X + 10, y + 33, { width: cardW - 16, ellipsis: true });
  }
  doc.font("Helvetica").fontSize(7).fillColor("#94A3B8")
    .text(`Data: ${fmtDateTime(evento.createdAt)}`, card2X + 10, y + 44, { width: cardW - 16 });

  y += cardH + 14;

  // ── SEÇÃO 2: EQUIPAMENTOS RECEBIDOS ────────────────────────────────────
  y = sectionTitle(`Equipamentos recebidos (${equipamentos.length})`, y);

  const hasMultiOc = ocNumerosUnicos.length > 1;
  const hasMultiLocadora = fornecedoresMap && fornecedoresMap.size > 1;
  const colFotoW = cW * 0.07;
  const colDescW = cW * (hasMultiOc || hasMultiLocadora ? 0.32 : 0.42);
  const colPatW  = cW * 0.13;
  const colOcW   = cW * (hasMultiOc ? 0.13 : 0.00);
  const colLocW  = cW * (hasMultiLocadora ? 0.16 : 0.00);
  const colInicioW = cW - colFotoW - colDescW - colPatW - colOcW - colLocW;

  doc.rect(mL, y, cW, 18).fill(primary);
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(white);
  doc.text("FOTO",       mL + 6,                                                   y + 5.5, { width: colFotoW - 8, align: "center" });
  doc.text("DESCRIÇÃO",  mL + colFotoW + 6,                                        y + 5.5, { width: colDescW - 8, characterSpacing: 0.5 });
  doc.text("PATRIMÔNIO", mL + colFotoW + colDescW + 6,                             y + 5.5, { width: colPatW - 8, characterSpacing: 0.5 });
  if (hasMultiOc) {
    doc.text("OC",       mL + colFotoW + colDescW + colPatW + 6,                   y + 5.5, { width: colOcW - 8, characterSpacing: 0.5 });
  }
  if (hasMultiLocadora) {
    doc.text("LOCADOR",  mL + colFotoW + colDescW + colPatW + colOcW + 6,          y + 5.5, { width: colLocW - 8, characterSpacing: 0.5 });
  }
  doc.text("DATA INÍCIO", mL + colFotoW + colDescW + colPatW + colOcW + colLocW + 6, y + 5.5, { width: colInicioW - 8, align: "right", characterSpacing: 0.5 });
  y += 18;

  const rowH = 40;
  let zebra = false;
  for (const eq_ of equipamentos) {
    if (y + rowH > pageH - 220) { doc.addPage(); y = 40; zebra = false; }
    if (zebra) doc.rect(mL, y, cW, rowH).fill(lightGray);
    zebra = !zebra;

    // FOTO
    const fotoBuf = fotosBuffers.get(eq_.id);
    const thumb = 32;
    const thumbX = mL + (colFotoW - thumb) / 2;
    const thumbY = y + (rowH - thumb) / 2;
    if (fotoBuf) {
      try { doc.image(fotoBuf, thumbX, thumbY, { fit: [thumb, thumb] }); }
      catch { doc.rect(thumbX, thumbY, thumb, thumb).lineWidth(0.5).strokeColor(borderColor).stroke(); }
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

    // OC (só quando múltiplas)
    if (hasMultiOc) {
      const ocNum = ocsMap.get(eq_.id) || "—";
      doc.font("Helvetica-Bold").fontSize(8).fillColor(accentRec);
      doc.text(ocNum, mL + colFotoW + colDescW + colPatW + 6, y + rowH / 2 - 4,
        { width: colOcW - 8, ellipsis: true });
    }

    // LOCADOR (só quando múltiplas)
    if (hasMultiLocadora) {
      const eqForn = (eq_ as any).fornecedorId ? fornecedoresMap.get((eq_ as any).fornecedorId) : null;
      const eqFornNome = eqForn?.razaoSocial || eqForn?.nomeFantasia || (eq_ as any).fornecedorNome || "—";
      doc.font("Helvetica").fontSize(7.5).fillColor(midGray);
      doc.text(eqFornNome, mL + colFotoW + colDescW + colPatW + colOcW + 6, y + rowH / 2 - 4,
        { width: colLocW - 8, ellipsis: true });
    }

    // DATA INÍCIO
    doc.font("Helvetica-Bold").fontSize(9).fillColor(primary);
    doc.text(fmtDate((eq_ as any).dataInicio),
      mL + colFotoW + colDescW + colPatW + colOcW + colLocW + 6, y + rowH / 2 - 5,
      { width: colInicioW - 12, align: "right" });

    y += rowH;
    drawHLine(y, borderColor, 0.3);
  }
  y += 10;

  // ── SEÇÃO 3: OBSERVAÇÃO ────────────────────────────────────────────────
  const obs = (evento.observacao || "").trim();
  if (obs) {
    if (y > pageH - 220) { doc.addPage(); y = 40; }
    y = sectionTitle("Observação (estado / acessórios)", y);
    doc.font("Helvetica").fontSize(8.5).fillColor(dark).text(obs, mL, y, { width: cW });
    y += doc.heightOfString(obs, { width: cW }) + 8;
  }

  // ── SEÇÃO 4: ASSINATURAS ───────────────────────────────────────────────
  if (y > pageH - 170) { doc.addPage(); y = 40; }
  y = sectionTitle("Assinaturas", y);

  const sigW = (cW - 16) / 2;
  const sigH = 80;

  const sigEntBuf = dataUrlToBuffer(evento.assinaturaEntregadorUrl);
  const sigRecBuf = dataUrlToBuffer(evento.assinaturaRecebedorUrl);

  // Caixa entregador (locadora)
  doc.rect(mL, y, sigW, sigH).lineWidth(0.5).strokeColor(borderColor).stroke();
  if (sigEntBuf) {
    try { doc.image(sigEntBuf, mL + 6, y + 6, { fit: [sigW - 12, sigH - 26] }); } catch {}
  }
  doc.moveTo(mL + 10, y + sigH - 18).lineTo(mL + sigW - 10, y + sigH - 18).strokeColor(midGray).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(dark)
    .text(evento.assinaturaEntregadorNome || "—", mL, y + sigH - 14, { width: sigW, align: "center" });
  doc.font("Helvetica").fontSize(6.5).fillColor(midGray)
    .text("Entregador (Locadora)", mL, y + sigH - 5, { width: sigW, align: "center" });

  // Caixa recebedor (FC)
  const recX = mL + sigW + 16;
  doc.rect(recX, y, sigW, sigH).lineWidth(0.5).strokeColor(borderColor).stroke();
  if (sigRecBuf) {
    try { doc.image(sigRecBuf, recX + 6, y + 6, { fit: [sigW - 12, sigH - 26] }); } catch {}
  }
  doc.moveTo(recX + 10, y + sigH - 18).lineTo(recX + sigW - 10, y + sigH - 18).strokeColor(midGray).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(dark)
    .text(evento.assinaturaRecebedorNome || evento.usuarioNome || "—",
      recX, y + sigH - 14, { width: sigW, align: "center" });
  doc.font("Helvetica").fontSize(6.5).fillColor(midGray)
    .text("Recebedor (FC Engenharia)", recX, y + sigH - 5, { width: sigW, align: "center" });

  y += sigH + 16;

  // ── RODAPÉ ─────────────────────────────────────────────────────────────
  doc.strokeColor(borderColor).lineWidth(0.5).moveTo(mL, y).lineTo(pageW - mR, y).stroke();
  doc.font("Helvetica").fontSize(6.5).fillColor("#94A3B8")
    .text(
      `Documento gerado eletronicamente · ${fmtDateTime(new Date().toISOString())} · ${company?.razaoSocial || "FC ENGENHARIA"}`,
      mL, y + 5, { width: cW, align: "center" }
    );

  return doc;
}
