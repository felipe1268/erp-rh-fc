/**
 * Rev. 4027 — Gerador do PDF/Impressão do Boletim de Medição, para envio ao
 * cliente validar a medição do período (Aprovação de Boletim).
 */
import jsPDF from "jspdf";

const AZUL: [number, number, number] = [27, 42, 74];
const CINZA: [number, number, number] = [33, 33, 33];
const CINZA_CLARO: [number, number, number] = [110, 110, 110];
const VERDE: [number, number, number] = [5, 150, 105];
const VIOLETA: [number, number, number] = [109, 40, 217];
const CINZA_BG: [number, number, number] = [246, 247, 249];
const AZUL_BG: [number, number, number] = [219, 234, 254];

export interface BoletimPdfItem {
  eapCodigo: string | null;
  descricao: string;
  isFd?: boolean;
  valorContratual: string | number;
  percentualAcumuladoAnterior: string | number;
  percentualPeriodo: string | number;
  percentualAcumuladoAtual: string | number;
  valorPeriodo: string | number;
}

export interface BoletimPdfParams {
  companyName?: string;
  contratoNome: string;
  contratoCliente?: string | null;
  contratoLocal?: string | null;
  boletimNumero: number;
  periodoReferencia: string;
  dataInicio?: string | null;
  dataFim?: string | null;
  status: string;
  valorBruto: number;
  descontoSinal: number;
  descontoRetencao: number;
  glosa: number;
  deducaoFd: number;
  valorLiquido: number;
  itens: BoletimPdfItem[];
}

const n = (v: unknown) => parseFloat(String(v ?? "0")) || 0;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toFixed(2)}%`;
const fmtData = (d?: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—");

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado ao Cliente",
  aprovado: "Aprovado pelo Cliente",
  finalizado: "Finalizado",
};

async function fetchLogo(origin: string): Promise<string | null> {
  try {
    const r = await fetch(`${origin}/logo-fc.jpg`, { cache: "no-store" });
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string | null>((res) => {
      const fr = new FileReader();
      fr.onloadend = () => res(fr.result as string);
      fr.onerror = () => res(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

async function buildBoletimPdf(params: BoletimPdfParams): Promise<jsPDF> {
  const { itens } = params;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 14, CW = W - M * 2, BOTTOM = H - M - 12;
  let y = M;

  const novaPage = (needed = 10) => {
    if (y + needed > BOTTOM) { pdf.addPage(); y = M; return true; }
    return false;
  };

  const logo = await fetchLogo(window.location.origin);
  if (logo) {
    try { pdf.addImage(logo, "JPEG", (W - 16) / 2, y, 16, 16, undefined, "FAST"); y += 18; }
    catch { /* logo opcional */ }
  }

  const empresa = params.companyName ?? "FC Engenharia";
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(...AZUL);
  pdf.text(empresa.toUpperCase(), W / 2, y + 4, { align: "center" });
  y += 7;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...CINZA_CLARO);
  pdf.text("Medição de Contratos — Documento para validação do cliente", W / 2, y, { align: "center" });
  y += 8;

  pdf.setFillColor(...AZUL);
  pdf.rect(M, y, CW, 12, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(255, 255, 255);
  pdf.text(`BOLETIM DE MEDIÇÃO Nº ${String(params.boletimNumero).padStart(2, "0")}`, W / 2, y + 4.5, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(`Período de referência: ${params.periodoReferencia}   ·   Status: ${STATUS_LABEL[params.status] ?? params.status}`, W / 2, y + 9, { align: "center" });
  y += 12 + 6;

  // ── Bloco de identificação do contrato ──
  pdf.setDrawColor(220, 220, 220);
  pdf.setFillColor(...CINZA_BG);
  const infoH = 24;
  pdf.roundedRect(M, y, CW, infoH, 2, 2, "FD");
  pdf.setFontSize(8.5);
  const rowLbl = (label: string, value: string, lx: number, ly: number) => {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...CINZA_CLARO);
    pdf.text(label, lx, ly);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...CINZA);
    pdf.text(value || "—", lx, ly + 4);
  };
  const col1 = M + 4, col2 = M + CW / 2 + 2;
  rowLbl("OBRA / PROJETO", params.contratoNome, col1, y + 6);
  rowLbl("CLIENTE", params.contratoCliente || "—", col2, y + 6);
  rowLbl("PERÍODO MEDIDO", `${fmtData(params.dataInicio)}  a  ${fmtData(params.dataFim)}`, col1, y + 16);
  rowLbl("LOCAL", params.contratoLocal || "—", col2, y + 16);
  y += infoH + 6;

  // ── Cards de totais ──
  const cardW = (CW - 8) / 3, cardH = 16;
  const cards: { label: string; valor: string; bg: [number, number, number]; fg: [number, number, number] }[] = [
    { label: "BRUTO (NÃO-FD)", valor: brl(params.valorBruto), bg: CINZA_BG, fg: CINZA },
    { label: "DEDUÇÃO FD", valor: `-${brl(params.deducaoFd)}`, bg: [237, 233, 254], fg: VIOLETA },
    { label: "VALOR LÍQUIDO", valor: brl(params.valorLiquido), bg: [209, 250, 229], fg: VERDE },
  ];
  cards.forEach((c, i) => {
    const cx = M + i * (cardW + 4);
    pdf.setFillColor(...c.bg);
    pdf.roundedRect(cx, y, cardW, cardH, 2, 2, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.setTextColor(...c.fg);
    pdf.text(c.label, cx + 3, y + 5);
    pdf.setFontSize(10.5);
    pdf.text(c.valor, cx + 3, y + 12);
  });
  y += cardH + 6;

  if (params.descontoSinal || params.descontoRetencao || params.glosa) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...CINZA_CLARO);
    pdf.text(
      `Descontos aplicados — Sinal: -${brl(params.descontoSinal)}   Retenção: -${brl(params.descontoRetencao)}   Glosa: -${brl(params.glosa)}`,
      M, y
    );
    y += 6;
  }

  // ── Tabela de itens ──
  novaPage(12);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...AZUL);
  pdf.text("ITENS MEDIDOS NO PERÍODO", M, y);
  y += 5;

  const cols = [
    { key: "item", label: "Item", w: CW * 0.08, align: "left" as const },
    { key: "desc", label: "Descrição", w: CW * 0.30, align: "left" as const },
    { key: "origem", label: "Origem", w: CW * 0.12, align: "left" as const },
    { key: "vc", label: "V. Contratual", w: CW * 0.13, align: "right" as const },
    { key: "pa", label: "% Ant.", w: CW * 0.09, align: "right" as const },
    { key: "pp", label: "% Período", w: CW * 0.09, align: "right" as const },
    { key: "pac", label: "% Acum.", w: CW * 0.09, align: "right" as const },
    { key: "vp", label: "V. Período", w: CW * 0.10, align: "right" as const },
  ];
  const ROW_H = 6;

  const drawHeader = () => {
    pdf.setFillColor(240, 242, 248);
    pdf.rect(M, y, CW, ROW_H, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(...CINZA);
    let cx = M;
    cols.forEach(c => {
      pdf.text(c.label, c.align === "right" ? cx + c.w - 2 : cx + 2, y + 4, { align: c.align === "right" ? "right" : "left" });
      cx += c.w;
    });
    y += ROW_H;
  };
  drawHeader();

  itens.forEach((item, i) => {
    if (novaPage(ROW_H + 2)) drawHeader();
    if (item.isFd) { pdf.setFillColor(...[237, 233, 254] as [number, number, number]); pdf.rect(M, y, CW, ROW_H, "F"); }
    else if (i % 2 === 1) { pdf.setFillColor(...CINZA_BG); pdf.rect(M, y, CW, ROW_H, "F"); }

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...CINZA);
    let cx = M;
    const descTrunc = pdf.splitTextToSize(item.descricao, cols[1].w - 4)[0] ?? item.descricao;
    const vals = [
      item.eapCodigo || "—",
      descTrunc,
      item.isFd ? "FD Compras" : "Cronograma",
      brl(n(item.valorContratual)),
      pct(n(item.percentualAcumuladoAnterior)),
      pct(n(item.percentualPeriodo)),
      pct(n(item.percentualAcumuladoAtual)),
      brl(n(item.valorPeriodo)),
    ];
    cols.forEach((c, ci) => {
      if (c.key === "origem" && item.isFd) pdf.setTextColor(...VIOLETA);
      else pdf.setTextColor(...CINZA);
      pdf.text(vals[ci], c.align === "right" ? cx + c.w - 2 : cx + 2, y + 4, { align: c.align === "right" ? "right" : "left" });
      cx += c.w;
    });
    y += ROW_H;
  });

  y += 10;
  novaPage(40);

  // ── Assinaturas ──
  const sigW = (CW - 10) / 2;
  const sigY = Math.min(y + 20, BOTTOM - 20);
  if (y + 30 > BOTTOM) { pdf.addPage(); y = M; }
  y += 15;
  pdf.setDrawColor(...CINZA_CLARO);
  pdf.line(M, y, M + sigW, y);
  pdf.line(M + sigW + 10, y, M + sigW + 10 + sigW, y);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...CINZA);
  pdf.text(empresa, M, y + 5);
  pdf.text(params.contratoCliente || "Cliente", M + sigW + 10, y + 5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(...CINZA_CLARO);
  pdf.text("Contratada", M, y + 9);
  pdf.text("Validação do Cliente", M + sigW + 10, y + 9);

  // ── Rodapé ──
  const pageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(...CINZA_CLARO);
    pdf.text(
      `Gerado em ${new Date().toLocaleString("pt-BR")}  ·  Página ${p} de ${pageCount}`,
      W / 2, H - 8, { align: "center" }
    );
  }

  return pdf;
}

export async function gerarBoletimMedicaoPdf(params: BoletimPdfParams): Promise<void> {
  const pdf = await buildBoletimPdf(params);
  pdf.save(`Boletim_Medicao_${String(params.boletimNumero).padStart(2, "0")}_${params.periodoReferencia}.pdf`);
}

export async function imprimirBoletimMedicao(params: BoletimPdfParams): Promise<void> {
  const pdf = await buildBoletimPdf(params);
  const blobUrl = pdf.output("bloburl");
  const win = window.open(blobUrl as unknown as string, "_blank");
  if (win) {
    win.addEventListener("load", () => {
      try { win.print(); } catch { /* deixa o usuário imprimir manualmente pelo viewer do PDF */ }
    });
  }
}

/**
 * Envia o boletim via WhatsApp. Em navegadores com suporte a Web Share API
 * nível 2 (a maioria dos celulares), abre a folha nativa de compartilhamento
 * já com o PDF anexado e o WhatsApp como uma das opções. Em desktop (sem
 * suporte a compartilhar arquivo), baixa o PDF e abre o WhatsApp Web com uma
 * mensagem pronta — o usuário só precisa anexar o arquivo já baixado.
 */
export async function compartilharBoletimMedicaoWhatsApp(params: BoletimPdfParams): Promise<"compartilhado" | "baixado"> {
  const pdf = await buildBoletimPdf(params);
  const fileName = `Boletim_Medicao_${String(params.boletimNumero).padStart(2, "0")}_${params.periodoReferencia}.pdf`;
  const texto = `Boletim de Medição nº ${String(params.boletimNumero).padStart(2, "0")} — ${params.contratoNome} — Período: ${params.periodoReferencia}`;
  const blob = pdf.output("blob") as Blob;

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData & { files?: File[] }) => boolean;
    share?: (data: ShareData & { files?: File[] }) => Promise<void>;
  };

  if (nav.share && nav.canShare) {
    try {
      const file = new File([blob], fileName, { type: "application/pdf" });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: fileName, text: texto });
        return "compartilhado";
      }
    } catch (err) {
      if ((err as any)?.name === "AbortError") return "compartilhado";
      /* cai no fallback abaixo */
    }
  }

  pdf.save(fileName);
  window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n\n(o PDF foi baixado — anexe o arquivo "${fileName}" nesta conversa)`)}`, "_blank");
  return "baixado";
}
