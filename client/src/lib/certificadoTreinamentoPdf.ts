import jsPDF from "jspdf";

// Rev. 5027 — Certificado de Treinamentos SST no layout aprovado pelo usuário
// (MODELO_DE_CERTIFICADO_TREINAMENTOS_SST_R01). O layout é uma arte raster
// (960x540pt, 16:9) exportada para /cert-treinamento-bg1.jpg (frente) e
// /cert-treinamento-bg2.jpg (conteúdo programático). O PDF é gerado no MESMO
// tamanho de página da arte, então as coordenadas abaixo são pt 1:1 do modelo.
//
// Empregador documental JF (Julio Ferraz): Rev. 5029 — a JF tem arte PRÓPRIA
// (MODELO_DE_CERTIFICADO_TREINAMENTOS_SST_R00_JF), exportada para
// /cert-treinamento-jf-bg1.jpg e /cert-treinamento-jf-bg2.jpg. Nada de cobrir
// a arte FC com retângulos: escolhemos o fundo pelo empregador documental e
// usamos o mapa de coordenadas do modelo correspondente.

export interface CertificadoTreinamentoParams {
  treinamentoId: number;
  employeeNome: string;
  treinamentoNome: string;
  norma?: string | null;
  cargaHoraria?: string | null; // texto livre, ex.: "8" ou "8h"
  dataRealizacao?: string | null; // ISO
  instrutor?: string | null;
  entidade?: string | null;
  conteudoProgramatico?: string | null; // texto livre (observações do treinamento)
  // Rev. 5028 — assinaturas digitais (dataURL PNG) desenhadas sobre as linhas da arte
  assinaturaColaborador?: string | null;
  assinaturaInstrutor?: string | null;
  /** Empregador documental: se JF, troca logo e razão social. */
  empregadorJf?: { nome: string; logoUrl?: string | null } | null;
  mode?: "save" | "preview";
  winRef?: Window | null;
}

type ImgData = { dataUrl: string; w: number; h: number } | null;
const _imgCache = new Map<string, Promise<ImgData>>();
async function loadImg(url: string): Promise<ImgData> {
  if (_imgCache.has(url)) return _imgCache.get(url)!;
  const p = (async (): Promise<ImgData> => {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const blob = await res.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ""));
        r.onerror = () => reject(new Error("read fail"));
        r.readAsDataURL(blob);
      });
      const dims: { w: number; h: number } = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
        img.onerror = () => resolve({ w: 1, h: 1 });
        img.src = dataUrl;
      });
      return { dataUrl, w: dims.w, h: dims.h };
    } catch {
      _imgCache.delete(url);
      return null;
    }
  })();
  _imgCache.set(url, p);
  return p;
}

function imgFormat(dataUrl: string): "PNG" | "JPEG" {
  return dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
}

const NAVY: [number, number, number] = [26, 42, 84];
const GRAY: [number, number, number] = [70, 70, 70];

/** Escreve texto centralizado encolhendo a fonte até caber em maxW. */
function fitText(pdf: jsPDF, text: string, cx: number, y: number, maxW: number, size: number, minSize = 8) {
  let s = size;
  while (s > minSize && pdf.getTextWidth(text) * (s / pdf.getFontSize()) > maxW) s -= 0.5;
  pdf.setFontSize(s);
  pdf.text(text, cx, y, { align: "center" });
}

export async function generateCertificadoTreinamentoPdf(p: CertificadoTreinamentoParams) {
  const W = 960;
  const H = 540;
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [W, H] });

  const jf = p.empregadorJf || null;
  const [bg1, bg2] = await Promise.all([
    // ?v= — cache-busting: as artes foram editadas (rótulo do instrutor removido)
    loadImg(jf ? "/cert-treinamento-jf-bg1.jpg?v=5032" : "/cert-treinamento-bg1.jpg?v=5032"),
    loadImg(jf ? "/cert-treinamento-jf-bg2.jpg" : "/cert-treinamento-bg2.jpg"),
  ]);
  if (!bg1) throw new Error("Não foi possível carregar o modelo do certificado.");

  // Mapa de coordenadas por modelo (pt, página 960x540) — medido sobre a arte.
  const C = jf
    ? {
        nomeY: 289, nomeCx: 480, nomeMaxW: 560,
        treinCx: 592, treinY: 322, treinMaxW: 320,
        ddX: 334, mmX: 395, yyX: 466, dataY: 350,
        chCx: 674, chMaxW: 46,
        sigBaseY: 435, sigColabCx: 336, sigInstrCx: 645,
        p2TituloCx: 516, p2TituloY: 135, bodyX: 240, bodyW: 580, bodyY0: 162,
      }
    : {
        nomeY: 285, nomeCx: W / 2, nomeMaxW: 560,
        treinCx: 578, treinY: 317, treinMaxW: 315,
        ddX: 333, mmX: 390, yyX: 456, dataY: 340,
        chCx: 653, chMaxW: 44,
        sigBaseY: 418, sigColabCx: 340, sigInstrCx: 635,
        p2TituloCx: 512, p2TituloY: 128, bodyX: 245, bodyW: 560, bodyY0: 158,
      };

  // ============================== PÁGINA 1 ==============================
  pdf.addImage(bg1.dataUrl, "JPEG", 0, 0, W, H, undefined, "FAST");

  // Nome do colaborador (sobre a linha grande)
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.setTextColor(...NAVY);
  fitText(pdf, (p.employeeNome || "").toUpperCase(), C.nomeCx, C.nomeY, C.nomeMaxW, 26, 12);

  // Nome do treinamento (linha "pela participação e conclusão de ____")
  // Rev. 5030 — em MAIOR EVIDÊNCIA: caixa alta, fonte maior e norma em dourado.
  const nomeTrein = [p.treinamentoNome, p.norma ? `(${p.norma})` : null].filter(Boolean).join(" ");
  {
    const GOLD: [number, number, number] = [204, 141, 16];
    const nomeUp = (p.treinamentoNome || "").toUpperCase();
    const normaUp = p.norma ? `(${String(p.norma).toUpperCase()})` : "";
    pdf.setFont("helvetica", "bold");
    // encolhe até o conjunto (nome + espaço + norma) caber na linha
    let s = 20;
    const widthAt = (size: number) => {
      pdf.setFontSize(size);
      return pdf.getTextWidth(normaUp ? `${nomeUp} ${normaUp}` : nomeUp);
    };
    while (s > 9 && widthAt(s) > C.treinMaxW) s -= 0.5;
    pdf.setFontSize(s);
    const total = pdf.getTextWidth(normaUp ? `${nomeUp} ${normaUp}` : nomeUp);
    let x = C.treinCx - total / 2;
    pdf.setTextColor(...NAVY);
    pdf.text(nomeUp, x, C.treinY);
    if (normaUp) {
      x += pdf.getTextWidth(`${nomeUp} `);
      pdf.setTextColor(...GOLD);
      pdf.text(normaUp, x, C.treinY);
      pdf.setTextColor(...NAVY);
    }
  }

  // Data de realização dd / mm / aaaa
  let dd = "", mm = "", yy = "";
  if (p.dataRealizacao) {
    const m = String(p.dataRealizacao).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) { yy = m[1]; mm = m[2]; dd = m[3]; }
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...NAVY);
  if (dd) pdf.text(dd, C.ddX, C.dataY, { align: "center" });
  if (mm) pdf.text(mm, C.mmX, C.dataY, { align: "center" });
  if (yy) pdf.text(yy, C.yyX, C.dataY, { align: "center" });

  // Carga horária
  const ch = (p.cargaHoraria || "").replace(/\s*h(oras?)?\.?\s*$/i, "").trim();
  if (ch) fitText(pdf, ch, C.chCx, C.dataY, C.chMaxW, 13, 8);

  // Rev. 5028 — assinaturas digitais sobre as linhas da arte.
  // Linha do participante: centro x≈340pt; linha do instrutor: centro x≈635pt;
  // ambas com a linha em y≈422pt. A assinatura é ancorada com a BASE ~4pt acima.
  const drawAssinatura = async (dataUrl: string | null | undefined, cx: number, baseY: number = C.sigBaseY) => {
    if (!dataUrl || !dataUrl.startsWith("data:image/")) return;
    const dims: { w: number; h: number } = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = dataUrl;
    });
    const maxW = 175;
    const maxH = 52;
    let w = maxW;
    let h = (dims.h / dims.w) * w;
    if (h > maxH) { h = maxH; w = (dims.w / dims.h) * h; }
    try { pdf.addImage(dataUrl, imgFormat(dataUrl), cx - w / 2, baseY - h, w, h, undefined, "FAST"); } catch { /* segue sem assinatura */ }
  };
  await drawAssinatura(p.assinaturaColaborador, C.sigColabCx);
  await drawAssinatura(p.assinaturaInstrutor, C.sigInstrCx);

  // Rev. 5032 — abaixo da linha do instrutor: NOME DO INSTRUTOR e, embaixo, "INSTRUTOR".
  // O rótulo original ("ASSINATURA DO INSTRUTOR...") foi removido direto da arte de fundo.
  if (p.instrutor && p.instrutor.trim()) {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...NAVY);
    // mesmo tamanho do rótulo da arte ("ASSINATURA DO PARTICIPANTE" ≈ 9pt)
    fitText(pdf, p.instrutor.trim().toUpperCase(), C.sigInstrCx, C.sigBaseY + 22, 250, 9, 7);
    pdf.setFontSize(7.5);
    pdf.text("INSTRUTOR", C.sigInstrCx, C.sigBaseY + 33, { align: "center" });
  }

  // ============================== PÁGINA 2 ==============================
  if (bg2) {
    pdf.addPage([W, H], "landscape");
    pdf.addImage(bg2.dataUrl, "JPEG", 0, 0, W, H, undefined, "FAST");

    // Rev. 5030 — cobre a razão social do rodapé da arte (já consta na frente)
    pdf.setFillColor(255, 255, 255);
    pdf.rect(290, 470, 400, 34, "F");

    // Nome do treinamento como subtítulo do conteúdo
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.setTextColor(...NAVY);
    fitText(pdf, nomeTrein.toUpperCase(), C.p2TituloCx, C.p2TituloY, 560, 15, 9);

    // Corpo: conteúdo programático (observações) + instrutor/entidade/carga
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12.5);
    pdf.setTextColor(...GRAY);
    const bodyX = C.bodyX;
    const bodyW = C.bodyW;
    let y = C.bodyY0;
    const conteudo = (p.conteudoProgramatico || "").trim();
    if (conteudo) {
      // Quebra por linhas do usuário; linhas viram bullets se não tiverem marcador
      const rawLines = conteudo.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const raw of rawLines) {
        const line = /^[-•*]/.test(raw) ? raw.replace(/^[-*]\s*/, "• ") : `• ${raw}`;
        const wrapped: string[] = pdf.splitTextToSize(line, bodyW);
        for (const wl of wrapped) {
          if (y > 440) break;
          pdf.text(wl, bodyX, y);
          y += 19;
        }
        if (y > 440) break;
      }
    } else {
      pdf.setFont("helvetica", "italic");
      pdf.text("Conteúdo conforme programa do treinamento e norma aplicável.", bodyX, y);
      pdf.setFont("helvetica", "normal");
      y += 19;
    }

    // Rev. 5030 — verso só com o conteúdo programático: sem bloco de
    // carga/instrutor/entidade (já constam na frente) e sem razão social no rodapé.
  }

  const filename = `certificado-treinamento-${String(p.treinamentoId).padStart(6, "0")}.pdf`;

  if (p.mode === "preview") {
    const blob = pdf.output("blob") as Blob;
    const url = URL.createObjectURL(blob);
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* noop */ } }, 120_000);
    if (p.winRef && !p.winRef.closed) {
      try { p.winRef.location.href = url; return; } catch { /* fall through */ }
    }
    const w = window.open(url, "_blank");
    if (!w) {
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
      pdf.save(filename);
    }
    return;
  }

  pdf.save(filename);
}
