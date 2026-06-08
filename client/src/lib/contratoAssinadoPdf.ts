import jsPDF from "jspdf";
import { formatDateTime } from "@/lib/dateUtils";

/**
 * Rev. 2897 — Download do contrato assinado (IntegraSign/FcSign) agora gera um
 * PDF profissional (logo da construtora + faixa azul institucional + corpo do
 * contrato preservando a tabela EAP + registro de assinaturas + hash), no lugar
 * do antigo `.txt` plano. Conteúdo idêntico ao da visualização da tela pública.
 *
 * Observações de robustez:
 * - Logo carregado de `${origin}/logo-fc.jpg` com fallback silencioso (PDF sai
 *   sem logo se a imagem falhar — nunca quebra o download).
 * - Corpo em fonte monoespaçada (Courier) p/ manter o alinhamento da tabela EAP
 *   (separadores `|` / `-`), que vem em texto pré-formatado.
 * - Datas via `formatDateTime` (iOS-safe) — evita o crash do Safari/iPad com
 *   strings "YYYY-MM-DD HH:MM:SS" (mode:"string").
 */

const AZUL: [number, number, number] = [27, 42, 74]; // #1B2A4A

interface SignatarioPdf {
  nome: string;
  papelLabel: string;
  status: string;
  dataAssinatura?: string | null;
}

interface ContratoPdfParams {
  titulo: string;
  textoContrato: string;
  hash?: string | null;
  signatarios: SignatarioPdf[];
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

export async function gerarContratoAssinadoPdf(params: ContratoPdfParams): Promise<void> {
  const { titulo, textoContrato, hash, signatarios } = params;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const MARGIN = 14;
  const contentW = W - MARGIN * 2;
  const bottom = H - MARGIN;
  let y = MARGIN;

  const novaPaginaSe = (alturaNecessaria: number) => {
    if (y + alturaNecessaria > bottom) {
      pdf.addPage();
      y = MARGIN;
      return true;
    }
    return false;
  };

  // ── Logo (centralizado) ──
  const logo = await urlToDataUrl(`${window.location.origin}/logo-fc.jpg`);
  if (logo) {
    const logoH = 20;
    const logoW = 20;
    try {
      pdf.addImage(logo, "JPEG", (W - logoW) / 2, y, logoW, logoH, undefined, "FAST");
      y += logoH + 4;
    } catch {
      /* logo opcional */
    }
  }

  // ── Faixa azul com o título do contrato ──
  const faixaH = 11;
  pdf.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
  pdf.rect(MARGIN, y, contentW, faixaH, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(255, 255, 255);
  pdf.text((titulo || "Contrato").toUpperCase(), W / 2, y + faixaH / 2 + 1.6, {
    align: "center",
    maxWidth: contentW - 8,
  });
  y += faixaH + 8;

  // ── Corpo do contrato (monoespaçado p/ preservar a tabela EAP) ──
  pdf.setTextColor(20, 20, 20);
  pdf.setFont("courier", "normal");
  pdf.setFontSize(7);
  const lineH = 3.2;
  const linhas = pdf.splitTextToSize(textoContrato || "", contentW);
  for (const ln of linhas) {
    novaPaginaSe(lineH);
    pdf.text(ln, MARGIN, y);
    y += lineH;
  }

  // ── Registro de Assinaturas Eletrônicas ──
  y += 6;
  novaPaginaSe(28);
  pdf.setDrawColor(AZUL[0], AZUL[1], AZUL[2]);
  pdf.setLineWidth(0.4);
  pdf.line(MARGIN, y, W - MARGIN, y);
  y += 5;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(AZUL[0], AZUL[1], AZUL[2]);
  pdf.text("REGISTRO DE ASSINATURAS ELETRÔNICAS", W / 2, y, { align: "center" });
  y += 3;
  pdf.line(MARGIN, y, W - MARGIN, y);
  y += 7;

  pdf.setTextColor(30, 30, 30);
  for (const s of signatarios) {
    novaPaginaSe(7);
    const dataTxt =
      s.status === "assinado"
        ? `Assinado em ${formatDateTime(s.dataAssinatura)}`
        : s.status;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text(`${s.nome}`, MARGIN, y);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(110, 110, 110);
    pdf.setFontSize(8);
    pdf.text(`(${s.papelLabel})`, MARGIN + pdf.getTextWidth(`${s.nome} `) + 1, y);
    pdf.setTextColor(30, 30, 30);
    pdf.text(dataTxt, W - MARGIN, y, { align: "right" });
    pdf.setTextColor(30, 30, 30);
    y += 6;
  }

  // ── Rodapé institucional (hash + autoria) ──
  y += 4;
  novaPaginaSe(18);
  pdf.setDrawColor(220, 220, 220);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN, y, W - MARGIN, y);
  y += 5;
  pdf.setFont("courier", "normal");
  pdf.setFontSize(6.5);
  pdf.setTextColor(90, 90, 90);
  if (hash) {
    const hashLinhas = pdf.splitTextToSize(`Hash SHA-256: ${hash}`, contentW);
    for (const hl of hashLinhas) {
      novaPaginaSe(3);
      pdf.text(hl, MARGIN, y);
      y += 3;
    }
  }
  y += 1;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(110, 110, 110);
  pdf.text("Documento gerado via FcSign — FC Engenharia", MARGIN, y);
  y += 4;
  pdf.text(`Data de download: ${new Date().toLocaleString("pt-BR")}`, MARGIN, y);
  y += 4;
  pdf.setFontSize(6.5);
  pdf.setTextColor(140, 140, 140);
  pdf.text(
    "Assinatura eletrônica em conformidade com MP 2.200-2/2001 e Lei 14.063/2020",
    MARGIN,
    y,
  );

  // ── Numeração de páginas ──
  const totalPaginas = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Página ${p} de ${totalPaginas}`, W - MARGIN, H - 6, { align: "right" });
  }

  const nomeArquivo = `${(titulo || "Contrato")
    .replace(/[^a-zA-Z0-9À-ú ._-]/g, "")
    .trim()}_assinado.pdf`;
  pdf.save(nomeArquivo);
}
