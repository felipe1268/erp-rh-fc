import jsPDF from "jspdf";
import { formatDateTime } from "@/lib/dateUtils";

/**
 * Rev. 3054 — Reescrita COMPLETA do PDF do contrato assinado (IntegraSign/FcSign).
 *
 * O antigo gerador despejava o `textoContrato` cru em fonte monoespaçada (Courier 7)
 * preservando a tabela EAP em ASCII (pipes/dashes) e ainda vazava o marcador
 * `{{FLUXOGRAMA_PAGAMENTO}}` literal — visual "péssimo" (print iPad CT-2026-0006).
 *
 * Agora o documento é 100% formatado no padrão institucional FC (REGRA DE OURO):
 * - Cabeçalho: logo centralizado + RAZÃO SOCIAL + CNPJ + ENDEREÇO (parseados do
 *   bloco CONTRATANTE do próprio texto) + faixa azul #1B2A4A com o título.
 * - Corpo em fonte SERIF (Times) com parágrafos JUSTIFICADOS, cláusulas em negrito,
 *   alíneas/subitens indentados — espelha a visualização da tela (ContratoDetalhe).
 * - Escopo EAP renderizado como TABELA real (bordas + cabeçalho azul), não ASCII.
 * - Fluxo de medição/pagamento (6 etapas) desenhado como diagrama, no lugar do
 *   marcador `{{FLUXOGRAMA_PAGAMENTO}}`.
 * - Assinaturas no LOCAL DE ASSINATURA: blocos eletrônicos (nome + cargo + CPF/CNPJ
 *   + "Assinado eletronicamente em…") substituem as linhas estáticas `____`.
 *
 * Robustez:
 * - Logo `${origin}/logo-fc.jpg` com fallback silencioso (nunca quebra o download).
 * - Datas via `formatDateTime` (iOS-safe).
 * - Fonte Times (WinAnsi) cobre acentuação pt-BR.
 */

const AZUL: [number, number, number] = [27, 42, 74]; // #1B2A4A
const CINZA_TXT: [number, number, number] = [33, 33, 33];

interface SignatarioPdf {
  nome: string;
  papelLabel: string;
  status: string;
  dataAssinatura?: string | null;
  cpfCnpj?: string | null;
  cargo?: string | null;
  /** PNG base64 (data URL) da assinatura desenhada pelo signatário no FcSign. */
  assinaturaImagem?: string | null;
  /** PNG base64 (data URL) da rúbrica desenhada pelo signatário no FcSign. */
  rubricaImagem?: string | null;
  hashAssinatura?: string | null;
  hashRubrica?: string | null;
  ipAddress?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  geoAccuracy?: string | number | null;
  dispositivoInfo?: string | null;
  nomeConfirmado?: string | null;
  cpfCnpjConfirmado?: string | null;
  termoAceito?: boolean | null;
  dataVisualizacao?: string | null;
}

interface ContratoPdfParams {
  titulo: string;
  textoContrato: string;
  hash?: string | null;
  signatarios: SignatarioPdf[];
  /**
   * "download" (padrão) salva o arquivo; "abrir" exibe o PDF (visualização).
   * Em iOS o `window.open` precisa ser disparado DENTRO do gesto do clique;
   * por isso aceita uma `janela` já aberta de forma síncrona antes do await.
   */
  modo?: "download" | "abrir";
  janela?: Window | null;
  /**
   * Rev. 5000 — Proposta comercial do fornecedor (anexo da cotação): emendada
   * automaticamente ao FINAL do PDF do contrato (Anexo I), evitando distorção
   * de informação entre proposta e contrato. PDF é mesclado página a página
   * (pdf-lib); JPG/PNG viram página A4. Falha no anexo NÃO bloqueia o contrato.
   */
  anexoProposta?: { url: string; nome?: string | null } | null;
}

async function _appendAnexoProposta(contractBytes: ArrayBuffer, anexoUrl: string): Promise<Blob | null> {
  const { PDFDocument } = await import("pdf-lib");
  const resp = await fetch(anexoUrl, { credentials: "include" });
  if (!resp.ok) return null;
  const bytes = await resp.arrayBuffer();
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  const head = new Uint8Array(bytes.slice(0, 4));
  const isPdf = ct.includes("pdf") || /\.pdf(\?|$)/i.test(anexoUrl)
    || (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46); // %PDF
  const isPng = ct.includes("png") || /\.png(\?|$)/i.test(anexoUrl);
  const isJpg = ct.includes("jpeg") || ct.includes("jpg") || /\.jpe?g(\?|$)/i.test(anexoUrl);
  if (!isPdf && !isPng && !isJpg) return null;

  const doc = await PDFDocument.load(contractBytes);

  // Rev. 5009 — pedido do user (IMG_5524): o contrato "morre" na página de
  // assinaturas; o anexo entra depois de uma FOLHA DE ROSTO própria, dando a
  // sensação de documento complementar unificado (como um merge de PDFs).
  try {
    const { StandardFonts, rgb } = await import("pdf-lib");
    const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontR = await doc.embedFont(StandardFonts.Helvetica);
    const A4W = 595.28, A4H = 841.89;
    const capa = doc.addPage([A4W, A4H]);
    const navy = rgb(27 / 255, 42 / 255, 74 / 255);
    const cy = A4H / 2;
    const sub1 = "DOCUMENTO COMPLEMENTAR — PARTE INTEGRANTE DO CONTRATO";
    capa.drawText(sub1, { x: (A4W - fontR.widthOfTextAtSize(sub1, 8)) / 2, y: cy + 52, size: 8, font: fontR, color: rgb(0.6, 0.64, 0.69) });
    capa.drawRectangle({ x: 40, y: cy - 4, width: A4W - 80, height: 40, color: navy });
    const t1 = "ANEXO I — PROPOSTA COMERCIAL DA CONTRATADA";
    capa.drawText(t1, { x: (A4W - fontB.widthOfTextAtSize(t1, 13)) / 2, y: cy + 10, size: 13, font: fontB, color: rgb(1, 1, 1) });
  } catch { /* capa é cosmética — nunca bloqueia o merge */ }

  if (isPdf) {
    const anexo = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await doc.copyPages(anexo, anexo.getPageIndices());
    for (const p of pages) doc.addPage(p);
  } else {
    const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const A4W = 595.28, A4H = 841.89, M = 28;
    const page = doc.addPage([A4W, A4H]);
    const scale = Math.min((A4W - 2 * M) / img.width, (A4H - 2 * M) / img.height, 1);
    page.drawImage(img, {
      x: (A4W - img.width * scale) / 2,
      y: (A4H - img.height * scale) / 2,
      width: img.width * scale,
      height: img.height * scale,
    });
  }
  const out = await doc.save();
  return new Blob([out as unknown as BlobPart], { type: "application/pdf" });
}

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const FLUX_STEPS: { title: string; color: [number, number, number] }[] = [
  { title: "Medição Física", color: [27, 42, 74] },
  { title: "Aprovação", color: [37, 99, 235] },
  { title: "Documentação", color: [124, 58, 237] },
  { title: "Emissão NF", color: [8, 145, 178] },
  { title: "Liberação OP", color: [5, 150, 105] },
  { title: "Pagamento", color: [217, 119, 6] },
];

function parseFluxValores(texto: string) {
  const grab = (re: RegExp, def: number) => {
    const m = texto.match(re);
    return m ? Number(m[1]) : def;
  };
  const dm = grab(/MEDIÇÃO FÍSICA\s*\(Dia\s*(\d+)/i, 25);
  const pa = grab(/APROVAÇÃO DA MEDIÇÃO\s*\(Até\s*(\d+)/i, 5);
  const pnf = grab(/EMISSÃO DA NOTA FISCAL\s*\(Até\s*(\d+)/i, 3);
  const plop = grab(/LIBERAÇÃO DA ORDEM DE PAGAMENTO\s*\(Até\s*(\d+)/i, 5);
  const dp = grab(/[fF]\)\s*PAGAMENTO\s*\(Dia\s*(\d+)/i, 10);
  return [
    `Dia ${dm} de cada mês`,
    `Até ${pa} dias úteis`,
    "NF + Certidões",
    `Até ${pnf} dias úteis`,
    `Até ${plop} dias úteis`,
    `Dia ${dp} mês seguinte`,
  ];
}

export async function gerarContratoAssinadoPdf(params: ContratoPdfParams): Promise<void> {
  const { titulo, textoContrato, hash, signatarios } = params;
  const modo = params.modo ?? "download";

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const MARGIN = 14;
  const contentW = W - MARGIN * 2;
  const bottom = H - MARGIN - 16;
  let y = MARGIN;

  const novaPaginaSe = (alturaNecessaria: number) => {
    if (y + alturaNecessaria > bottom) {
      pdf.addPage();
      y = MARGIN;
      return true;
    }
    return false;
  };

  // ─────────────────────────────────────────────────────────────
  // Cabeçalho institucional FC (REGRA DE OURO)
  // ─────────────────────────────────────────────────────────────
  const logo = await urlToDataUrl(`${window.location.origin}/logo-fc.jpg`);
  if (logo) {
    const logoW = 22;
    const logoH = 22;
    try {
      pdf.addImage(logo, "JPEG", (W - logoW) / 2, y, logoW, logoH, undefined, "FAST");
      y += logoH + 2.5;
    } catch {
      /* logo opcional */
    }
  }

  // Razão social / CNPJ / endereço do CONTRATANTE (parseados do texto)
  const mCont = textoContrato.match(
    /CONTRATANTE:\s*(.+?),\s*inscrita no CNPJ sob o n[ºo]?\s*([\d.\/-]+),\s*com sede (?:em|à|na)\s*(.+?),\s*neste ato/i,
  );
  const razao = mCont?.[1]?.trim();
  const cnpj = mCont?.[2]?.trim();
  const endereco = mCont?.[3]?.trim();

  if (razao) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
    pdf.text(razao.toUpperCase(), W / 2, y + 3, { align: "center", maxWidth: contentW });
    y += 6;
  }
  if (cnpj) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(110, 110, 110);
    pdf.text(`CNPJ: ${cnpj}`, W / 2, y, { align: "center" });
    y += 4;
  }
  if (endereco) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(140, 140, 140);
    const eLinhas = pdf.splitTextToSize(endereco.toUpperCase(), contentW - 10);
    for (const el of eLinhas) {
      pdf.text(el, W / 2, y, { align: "center" });
      y += 3.4;
    }
  }
  y += 3;

  // Faixa azul com o título do contrato
  const faixaH = 11;
  pdf.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
  pdf.rect(MARGIN, y, contentW, faixaH, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11.5);
  pdf.setTextColor(255, 255, 255);
  pdf.text((titulo || "Contrato").toUpperCase(), W / 2, y + faixaH / 2 + 1.4, {
    align: "center",
    maxWidth: contentW - 8,
  });
  y += faixaH + 7;

  // ─────────────────────────────────────────────────────────────
  // Helpers de texto (Times serif, justificado)
  // ─────────────────────────────────────────────────────────────
  const addParagraph = (
    text: string,
    opts: {
      size?: number;
      style?: "normal" | "bold" | "italic";
      indentL?: number;
      justify?: boolean;
      align?: "left" | "center";
      color?: [number, number, number];
      gapAfter?: number;
      gapBefore?: number;
    } = {},
  ) => {
    const {
      size = 10.5,
      style = "normal",
      indentL = 0,
      justify = true,
      align = "left",
      color = CINZA_TXT,
      gapAfter = 1.8,
      gapBefore = 0,
    } = opts;
    if (gapBefore) y += gapBefore;
    pdf.setFont("times", style);
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
    const lineH = size * 0.47;
    const availW = contentW - indentL;
    const x0 = MARGIN + indentL;
    const spaceW = pdf.getTextWidth(" ");
    const words = (text || "").split(/\s+/).filter(Boolean);
    let line: string[] = [];
    let lineW = 0;

    const flush = (isLast: boolean) => {
      novaPaginaSe(lineH + 1);
      if (align === "center") {
        pdf.text(line.join(" "), W / 2, y, { align: "center" });
      } else if (justify && !isLast && line.length > 1) {
        const wordsW = line.reduce((s, w) => s + pdf.getTextWidth(w), 0);
        const gap = (availW - wordsW) / (line.length - 1);
        let x = x0;
        for (const w of line) {
          pdf.text(w, x, y);
          x += pdf.getTextWidth(w) + gap;
        }
      } else {
        pdf.text(line.join(" "), x0, y);
      }
      y += lineH;
    };

    for (const w of words) {
      const wW = pdf.getTextWidth(w);
      const add = line.length ? spaceW + wW : wW;
      if (lineW + add > availW && line.length) {
        flush(false);
        line = [w];
        lineW = wW;
      } else {
        line.push(w);
        lineW += add;
      }
    }
    if (line.length) flush(true);
    y += gapAfter;
  };

  // ─────────────────────────────────────────────────────────────
  // Tabela EAP real (bordas + cabeçalho azul)
  // ─────────────────────────────────────────────────────────────
  const renderTabelaEAP = (rows: string[][]) => {
    const cols = [
      { w: 20, align: "left" as const },
      { w: 76, align: "left" as const },
      { w: 12, align: "center" as const },
      { w: 20, align: "right" as const },
      { w: 27, align: "right" as const },
      { w: 27, align: "right" as const },
    ];
    const headerLabels = ["EAP", "Descrição", "Un", "Qtd", "Vlr Unit.", "Total"];
    const fs = 7.8;
    const padX = 1.4;
    const lineH = fs * 0.46;
    const padY = 1.4;

    const colX = (idx: number) => MARGIN + cols.slice(0, idx).reduce((s, c) => s + c.w, 0);

    const drawHeader = () => {
      novaPaginaSe(8);
      const rowH = lineH + padY * 2;
      pdf.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
      pdf.rect(MARGIN, y, contentW, rowH, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(fs);
      pdf.setTextColor(255, 255, 255);
      headerLabels.forEach((lbl, i) => {
        const x = colX(i);
        const tx = cols[i].align === "right" ? x + cols[i].w - padX : cols[i].align === "center" ? x + cols[i].w / 2 : x + padX;
        pdf.text(lbl, tx, y + padY + lineH - 0.6, { align: cols[i].align });
      });
      y += rowH;
    };

    drawHeader();
    pdf.setDrawColor(210, 210, 210);
    pdf.setLineWidth(0.15);

    rows.forEach((cells, ri) => {
      const isTotal = cells.some((c) => /TOTAL/i.test(c));
      pdf.setFont("times", isTotal ? "bold" : "normal");
      pdf.setFontSize(fs);
      pdf.setTextColor(CINZA_TXT[0], CINZA_TXT[1], CINZA_TXT[2]);
      // descrição (col 1) pode quebrar em várias linhas
      const descLines = pdf.splitTextToSize(cells[1] || "", cols[1].w - padX * 2);
      const nLines = Math.max(1, descLines.length);
      const rowH = nLines * lineH + padY * 2;
      if (novaPaginaSe(rowH + 2)) drawHeader();

      if (isTotal) {
        pdf.setFillColor(238, 241, 247);
        pdf.rect(MARGIN, y, contentW, rowH, "F");
      } else if (ri % 2 === 1) {
        pdf.setFillColor(248, 249, 251);
        pdf.rect(MARGIN, y, contentW, rowH, "F");
      }

      cells.forEach((cell, i) => {
        if (i >= cols.length) return;
        const x = colX(i);
        const baseY = y + padY + lineH - 0.6;
        if (i === 1) {
          descLines.forEach((dl: string, li: number) => {
            pdf.text(dl, x + padX, baseY + li * lineH);
          });
        } else {
          const tx = cols[i].align === "right" ? x + cols[i].w - padX : cols[i].align === "center" ? x + cols[i].w / 2 : x + padX;
          pdf.text(cell || "", tx, baseY, { align: cols[i].align });
        }
      });

      // bordas
      pdf.setDrawColor(220, 220, 220);
      pdf.line(MARGIN, y + rowH, MARGIN + contentW, y + rowH);
      y += rowH;
    });
    // moldura externa lateral
    y += 1;
  };

  // ─────────────────────────────────────────────────────────────
  // Fluxograma de medição/pagamento (6 etapas)
  // ─────────────────────────────────────────────────────────────
  const renderFluxograma = () => {
    const descs = parseFluxValores(textoContrato);
    const boxH = 16;
    novaPaginaSe(boxH + 10);
    y += 2;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text("FLUXOGRAMA DO PROCESSO DE MEDIÇÃO E PAGAMENTO", W / 2, y, { align: "center" });
    y += 4;

    const n = FLUX_STEPS.length;
    const gap = 1.5;
    const boxW = (contentW - gap * (n - 1)) / n;
    FLUX_STEPS.forEach((step, i) => {
      const x = MARGIN + i * (boxW + gap);
      pdf.setFillColor(step.color[0], step.color[1], step.color[2]);
      pdf.roundedRect(x, y, boxW, boxH, 1.2, 1.2, "F");
      // número
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.text(String(i + 1), x + boxW / 2, y + 4.4, { align: "center" });
      // título
      pdf.setFontSize(6.4);
      const tLines = pdf.splitTextToSize(step.title.toUpperCase(), boxW - 2);
      let ty = y + 8;
      tLines.forEach((tl: string) => {
        pdf.text(tl, x + boxW / 2, ty, { align: "center" });
        ty += 2.5;
      });
      // descrição
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(5.6);
      const dLines = pdf.splitTextToSize(descs[i], boxW - 1.5);
      let dy = y + boxH - 3.2;
      dLines.slice(0, 2).forEach((dl: string, idx: number, arr: string[]) => {
        pdf.text(dl, x + boxW / 2, dy - (arr.length - 1 - idx) * 2.2, { align: "center" });
      });
    });
    y += boxH + 4;
  };

  // ─────────────────────────────────────────────────────────────
  // Classificação de linhas (espelha ContratoDetalhe.tsx)
  // ─────────────────────────────────────────────────────────────
  const lines = (textoContrato || "").split("\n");
  let i = 0;
  let signatureMode = false;

  const isSep = (t: string) => /^[-\s|]+$/.test(t) && /[-|]/.test(t);
  const isTableRow = (t: string) => t.includes("|") && !isSep(t);

  while (i < lines.length) {
    if (signatureMode) break;
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      y += 1.4;
      i++;
      continue;
    }

    // Início do bloco de assinaturas estático (___) → renderiza blocos eletrônicos
    if (/^_{4,}/.test(trimmed) || /^TESTEMUNHAS:/i.test(trimmed)) {
      signatureMode = true;
      break;
    }

    // Fluxograma
    if (/^\{\{FLUXOGRAMA_PAGAMENTO\}\}$/.test(trimmed) || /^MEDIÇÃO \(dia .*→.*PAGAMENTO/.test(trimmed)) {
      renderFluxograma();
      i++;
      continue;
    }

    // Tabela EAP (coleta linhas contíguas com "|")
    if (isTableRow(trimmed)) {
      const dataRows: string[][] = [];
      while (i < lines.length && (isTableRow(lines[i].trim()) || isSep(lines[i].trim()))) {
        const lt = lines[i].trim();
        if (isSep(lt)) {
          i++;
          continue;
        }
        const cells = lt.split("|").map((c) => c.trim());
        const isHeader = /^(EAP|Item|Código)$/i.test(cells[0] || "");
        if (!isHeader) dataRows.push(cells);
        i++;
      }
      if (dataRows.length) renderTabelaEAP(dataRows);
      continue;
    }

    const isTitulo = /^CONTRATO\s+DE\s+/i.test(trimmed);
    const isClausula = /^CL[ÁA]USULA\s/i.test(trimmed);
    const isSectionHeader = /^(ESCOPO DETALHADO|QUADRO|TABELA|RESUMO DOS PRAZOS)/i.test(trimmed);
    const isAlinea = /^[a-z]\)\s/.test(trimmed);
    const isSubClausulaTitle =
      /^\d+\.\d+\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(trimmed) &&
      /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}/.test(trimmed.split(/\s+/)[1] || "");
    const isSubItem = /^\d+\.\d+[\s.]/.test(trimmed) && !isSubClausulaTitle;
    const isNumericItem = /^\d+\.\s/.test(trimmed);
    const isBullet = /^[•●▪▸►-]\s/.test(trimmed);

    if (isTitulo) {
      addParagraph(trimmed.toUpperCase(), { size: 12, style: "bold", align: "center", justify: false, color: [20, 20, 20], gapAfter: 4, gapBefore: 1 });
    } else if (isClausula) {
      addParagraph(trimmed.toUpperCase(), { size: 11, style: "bold", justify: false, color: AZUL, gapBefore: 4, gapAfter: 2 });
    } else if (isSectionHeader) {
      addParagraph(trimmed.toUpperCase(), { size: 9.5, style: "bold", justify: false, color: [70, 70, 70], gapBefore: 3, gapAfter: 1.5 });
    } else if (isSubClausulaTitle) {
      addParagraph(trimmed, { size: 10.5, style: "bold", indentL: 3, justify: true, gapBefore: 2, gapAfter: 1.5 });
    } else if (isAlinea) {
      addParagraph(trimmed, { size: 10, indentL: 10, justify: true, gapAfter: 1.5 });
    } else if (isBullet) {
      addParagraph(trimmed, { size: 10, indentL: 12, justify: false, gapAfter: 0.8 });
    } else if (isSubItem) {
      addParagraph(trimmed, { size: 10.5, indentL: 6, justify: true, gapAfter: 1.2 });
    } else if (isNumericItem) {
      addParagraph(trimmed, { size: 10.5, indentL: 3, justify: true, gapAfter: 1.5 });
    } else {
      addParagraph(trimmed, { size: 10.5, justify: true, gapAfter: 2 });
    }
    i++;
  }

  // ─────────────────────────────────────────────────────────────
  // Blocos de assinatura eletrônica (no local de assinatura)
  // ─────────────────────────────────────────────────────────────
  y += 4;
  novaPaginaSe(20);
  pdf.setDrawColor(AZUL[0], AZUL[1], AZUL[2]);
  pdf.setLineWidth(0.4);
  pdf.line(MARGIN, y, W - MARGIN, y);
  y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
  pdf.text("ASSINATURAS ELETRÔNICAS", W / 2, y, { align: "center" });
  y += 6;

  const blockGap = 10;
  const blockW = (contentW - blockGap) / 2;
  const blockH = 30;

  for (let s = 0; s < signatarios.length; s += 2) {
    if (novaPaginaSe(blockH + 4)) {
      // re-render nada (cabeçalho de seção não precisa repetir)
    }
    const rowY = y;
    for (let c = 0; c < 2; c++) {
      const sig = signatarios[s + c];
      if (!sig) continue;
      const x = MARGIN + c * (blockW + blockGap);
      const assinado = sig.status === "assinado";

      // Assinatura desenhada (imagem real) acima da linha; fallback p/ nome em itálico
      const lineY = rowY + 13;
      if (assinado) {
        let imagemDesenhada = false;
        if (sig.assinaturaImagem && /^data:image\//i.test(sig.assinaturaImagem)) {
          try {
            const props = pdf.getImageProperties(sig.assinaturaImagem);
            const ratio = props.width && props.height ? props.width / props.height : 3;
            const maxW = blockW - 14;
            const maxH = 11;
            let w = maxW;
            let h = w / ratio;
            if (h > maxH) {
              h = maxH;
              w = h * ratio;
            }
            const ix = x + (blockW - w) / 2;
            const fmt = /^data:image\/jpe?g/i.test(sig.assinaturaImagem) ? "JPEG" : "PNG";
            pdf.addImage(sig.assinaturaImagem, fmt, ix, lineY - h - 0.5, w, h, undefined, "FAST");
            imagemDesenhada = true;
          } catch {
            imagemDesenhada = false;
          }
        }
        if (!imagemDesenhada) {
          pdf.setFont("times", "italic");
          pdf.setFontSize(13);
          pdf.setTextColor(40, 60, 110);
          pdf.text(sig.nome, x + blockW / 2, lineY - 2, { align: "center", maxWidth: blockW - 6 });
        }
      }
      // linha de assinatura
      pdf.setDrawColor(120, 120, 120);
      pdf.setLineWidth(0.3);
      pdf.line(x + 4, lineY, x + blockW - 4, lineY);

      // nome
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(CINZA_TXT[0], CINZA_TXT[1], CINZA_TXT[2]);
      pdf.text(sig.nome, x + blockW / 2, lineY + 4, { align: "center", maxWidth: blockW - 4 });

      // cargo / papel
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(110, 110, 110);
      const cargoTxt = sig.cargo?.trim() || sig.papelLabel;
      pdf.text(cargoTxt, x + blockW / 2, lineY + 8, { align: "center", maxWidth: blockW - 4 });
      if (sig.cargo?.trim() && sig.papelLabel && sig.cargo.trim().toLowerCase() !== sig.papelLabel.toLowerCase()) {
        pdf.setFontSize(6.8);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`(${sig.papelLabel})`, x + blockW / 2, lineY + 11, { align: "center", maxWidth: blockW - 4 });
      }

      // CPF/CNPJ
      let infoY = lineY + 14.5;
      if (sig.cpfCnpj) {
        pdf.setFontSize(7);
        pdf.setTextColor(130, 130, 130);
        pdf.text(`CPF/CNPJ: ${sig.cpfCnpj}`, x + blockW / 2, infoY, { align: "center" });
        infoY += 3.5;
      }

      // status
      pdf.setFont("helvetica", assinado ? "bold" : "normal");
      pdf.setFontSize(7);
      if (assinado) {
        pdf.setTextColor(5, 150, 105);
        pdf.text(`Assinado em ${formatDateTime(sig.dataAssinatura)}`, x + blockW / 2, infoY, {
          align: "center",
          maxWidth: blockW - 4,
        });
      } else {
        pdf.setTextColor(160, 160, 160);
        pdf.text("Aguardando assinatura", x + blockW / 2, infoY, { align: "center" });
      }
    }
    y = rowY + blockH;
  }

  // ─────────────────────────────────────────────────────────────
  // Trilha de auditoria / Controle de assinaturas (padrão FcSign)
  // ─────────────────────────────────────────────────────────────
  const assinados = signatarios.filter((s) => s.status === "assinado");
  const fmtGeo = (sig: SignatarioPdf) => {
    const lat = sig.latitude != null && sig.latitude !== "" ? Number(sig.latitude) : null;
    const lon = sig.longitude != null && sig.longitude !== "" ? Number(sig.longitude) : null;
    if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) return null;
    const acc = sig.geoAccuracy != null && sig.geoAccuracy !== "" ? Number(sig.geoAccuracy) : null;
    const accTxt = acc != null && !Number.isNaN(acc) ? ` (±${Math.round(acc)}m)` : "";
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}${accTxt}`;
  };
  const parseDispositivo = (info?: string | null) => {
    if (!info) return null;
    try {
      const o = JSON.parse(info);
      const partes = [o.platform, o.screen, o.timezone, o.language].filter(Boolean);
      return partes.length ? partes.join(" · ") : null;
    } catch {
      return info.length > 80 ? `${info.slice(0, 80)}…` : info;
    }
  };

  if (assinados.length) {
    y += 6;
    novaPaginaSe(24);
    pdf.setDrawColor(AZUL[0], AZUL[1], AZUL[2]);
    pdf.setLineWidth(0.4);
    pdf.line(MARGIN, y, W - MARGIN, y);
    y += 5;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
    pdf.text("CONTROLE DE ASSINATURAS — TRILHA DE AUDITORIA", W / 2, y, { align: "center" });
    y += 4;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(120, 120, 120);
    pdf.text(
      "Confirmação de identidade e integridade de cada assinatura eletrônica (MP 2.200-2/2001 · Lei 14.063/2020).",
      W / 2,
      y,
      { align: "center", maxWidth: contentW },
    );
    y += 5;

    assinados.forEach((sig, idx) => {
      const linhaLabel = (label: string, valor: string) => {
        novaPaginaSe(4);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.setTextColor(90, 90, 90);
        pdf.text(label, MARGIN + 3, y);
        const lblW = pdf.getTextWidth(label) + 2;
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(60, 60, 60);
        const vLines = pdf.splitTextToSize(valor, contentW - 6 - lblW);
        vLines.forEach((vl: string, li: number) => {
          if (li > 0) novaPaginaSe(3.4);
          pdf.text(vl, MARGIN + 3 + lblW, y);
          if (li < vLines.length - 1) y += 3.4;
        });
        y += 4;
      };

      novaPaginaSe(10);
      // Cabeçalho do card do signatário
      pdf.setFillColor(238, 241, 247);
      pdf.rect(MARGIN, y - 3, contentW, 6, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
      const cargoTxt = sig.cargo?.trim() || sig.papelLabel;
      pdf.text(`${idx + 1}. ${sig.nome}  —  ${cargoTxt}`, MARGIN + 3, y + 1.2, { maxWidth: contentW - 6 });
      y += 6;

      const nomeConf = sig.nomeConfirmado?.trim() || sig.nome;
      const cpfConf = sig.cpfCnpjConfirmado?.trim() || sig.cpfCnpj?.trim();
      linhaLabel("Confirmado por:", `${nomeConf}${cpfConf ? `  ·  CPF/CNPJ: ${cpfConf}` : ""}`);
      linhaLabel("Data/hora da assinatura:", formatDateTime(sig.dataAssinatura) || "—");
      if (sig.dataVisualizacao) linhaLabel("Visualizado em:", formatDateTime(sig.dataVisualizacao) || "—");
      linhaLabel("Endereço IP:", sig.ipAddress?.trim() || "Não capturado");
      const geo = fmtGeo(sig);
      if (geo) linhaLabel("Geolocalização:", geo);
      const disp = parseDispositivo(sig.dispositivoInfo);
      if (disp) linhaLabel("Dispositivo:", disp);
      linhaLabel(
        "Termo de aceite:",
        sig.termoAceito ? "Aceito (li e concordo com os termos do documento)" : "Não registrado",
      );
      if (sig.hashAssinatura) {
        novaPaginaSe(4);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.setTextColor(90, 90, 90);
        pdf.text("Hash SHA-256 da assinatura:", MARGIN + 3, y);
        y += 3.4;
        pdf.setFont("courier", "normal");
        pdf.setFontSize(6.2);
        pdf.setTextColor(110, 110, 110);
        const hLines = pdf.splitTextToSize(sig.hashAssinatura, contentW - 6);
        hLines.forEach((hl: string) => {
          novaPaginaSe(3);
          pdf.text(hl, MARGIN + 3, y);
          y += 3;
        });
      }
      y += 3;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Rodapé institucional (hash + conformidade legal)
  // ─────────────────────────────────────────────────────────────
  y += 2;
  novaPaginaSe(20);
  pdf.setDrawColor(220, 220, 220);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN, y, W - MARGIN, y);
  y += 5;
  if (hash) {
    pdf.setFont("courier", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(90, 90, 90);
    const hashLinhas = pdf.splitTextToSize(`Hash SHA-256: ${hash}`, contentW);
    for (const hl of hashLinhas) {
      novaPaginaSe(3);
      pdf.text(hl, MARGIN, y);
      y += 3;
    }
    y += 1;
  }
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(110, 110, 110);
  pdf.text("Documento gerado via FcSign — ERP Gestão Integrada", MARGIN, y);
  y += 4;
  pdf.text(`Data de download: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, MARGIN, y);
  y += 4;
  pdf.setFontSize(6.5);
  pdf.setTextColor(140, 140, 140);
  pdf.text(
    "Assinatura eletrônica em conformidade com a MP 2.200-2/2001 e a Lei 14.063/2020.",
    MARGIN,
    y,
  );

  // ─────────────────────────────────────────────────────────────
  // Rúbrica dos signatários em TODAS as páginas
  // (integridade do documento — garante que nenhuma página foi
  //  trocada/inserida após a assinatura)
  // ─────────────────────────────────────────────────────────────
  const rubricantes = signatarios.filter((s) => s.status === "assinado");
  const rubInfo = rubricantes.map((s) => {
    let ratio = 3;
    let fmt: "PNG" | "JPEG" = "PNG";
    let temImagem = false;
    if (s.rubricaImagem && /^data:image\//i.test(s.rubricaImagem)) {
      try {
        const props = pdf.getImageProperties(s.rubricaImagem);
        if (props.width && props.height) ratio = props.width / props.height;
        fmt = /^data:image\/jpe?g/i.test(s.rubricaImagem) ? "JPEG" : "PNG";
        temImagem = true;
      } catch {
        temImagem = false;
      }
    }
    const partes = (s.nome || "").split(/\s+/).filter(Boolean);
    const primeiroNome = partes[0] || s.nome || "—";
    const iniciais = partes.slice(0, 3).map((w) => w[0]?.toUpperCase() || "").join("");
    return { sig: s, ratio, fmt, temImagem, primeiroNome, iniciais };
  });

  const desenharRubricas = () => {
    if (rubInfo.length === 0) return;
    const yLine = H - 18;
    pdf.setDrawColor(205, 205, 205);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN, yLine, W - MARGIN, yLine);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5);
    pdf.setTextColor(150, 150, 150);
    pdf.text("RUBRICAS DOS SIGNATÁRIOS", MARGIN, yLine - 1.3);

    const usableW = contentW - 34; // reserva ~34mm à direita p/ o nº da página
    const maxShow = Math.min(rubInfo.length, 4);
    const slotW = usableW / maxShow;
    for (let i = 0; i < maxShow; i++) {
      const info = rubInfo[i];
      const cx = MARGIN + i * slotW + slotW / 2;
      let desenhou = false;
      if (info.temImagem && info.sig.rubricaImagem) {
        const maxW = slotW - 6;
        const maxH = 5.5;
        let w = maxW;
        let h = w / info.ratio;
        if (h > maxH) {
          h = maxH;
          w = h * info.ratio;
        }
        try {
          pdf.addImage(info.sig.rubricaImagem, info.fmt, cx - w / 2, yLine + 2.5, w, h, undefined, "FAST");
          desenhou = true;
        } catch {
          desenhou = false;
        }
      }
      if (!desenhou) {
        pdf.setFont("times", "italic");
        pdf.setFontSize(8);
        pdf.setTextColor(70, 90, 140);
        pdf.text(info.iniciais || info.primeiroNome, cx, yLine + 6, { align: "center" });
      }
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(4.6);
      pdf.setTextColor(150, 150, 150);
      pdf.text(info.primeiroNome, cx, yLine + 11, { align: "center", maxWidth: slotW - 2 });
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Numeração de páginas + rúbrica em cada página
  // ─────────────────────────────────────────────────────────────
  const totalPaginas = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p);
    desenharRubricas();
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Página ${p} de ${totalPaginas}`, W - MARGIN, H - 6, { align: "right" });
  }

  const nomeArquivo = `${(titulo || "Contrato")
    .replace(/[^a-zA-Z0-9À-ú ._-]/g, "")
    .trim()}_assinado.pdf`;

  // Rev. 5000 — emenda a proposta comercial (Anexo I) ao final do PDF, se houver.
  let blobFinal: Blob | null = null;
  if (params.anexoProposta?.url) {
    try {
      blobFinal = await _appendAnexoProposta(pdf.output("arraybuffer") as ArrayBuffer, params.anexoProposta.url);
    } catch (e) {
      console.warn("[contratoAssinadoPdf] Falha ao anexar proposta comercial (contrato segue sem o anexo):", e);
    }
  }

  if (modo === "abrir") {
    try {
      // Só visualiza se a janela foi aberta DENTRO do gesto do clique (iOS/popup-blocker).
      // Sem janela válida (popup bloqueado), cai para download — evita clique sem efeito.
      if (params.janela && !params.janela.closed) {
        params.janela.location.href = blobFinal
          ? URL.createObjectURL(blobFinal)
          : (pdf.output("bloburl") as unknown as string);
        return;
      }
    } catch {
      // fallback: se a visualização falhar, baixa o arquivo
      try { params.janela?.close(); } catch { /* noop */ }
    }
  }

  if (blobFinal) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blobFinal);
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove(); } catch { /* noop */ } }, 5000);
    return;
  }
  pdf.save(nomeArquivo);
}
