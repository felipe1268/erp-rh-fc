import jsPDF from "jspdf";

interface ItemEntrega {
  epiId: number;
  epiNome: string;
  ca: string | null;
  quantidade: number;
}

interface Funcionario {
  id: number;
  nomeCompleto: string;
  numeroInterno: string;
  cargo: string;
  fotoUrl?: string | null;
}

interface Obra {
  id: number;
  nome: string;
}

interface ReceiptParams {
  funcionario: Funcionario;
  itens: ItemEntrega[];
  obraId?: string;
  obras?: Obra[];
  modoIdentificacao: string;
  biometriaFoto?: string;
}

export async function generateEpiReceiptPdf(params: ReceiptParams) {
  const { funcionario, itens, obraId, obras = [], modoIdentificacao, biometriaFoto } = params;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const MARGIN = 15;
  const contentW = W - MARGIN * 2;
  let y = MARGIN;

  const agora = new Date();
  const dataHora = agora.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const obraObj = obraId ? obras.find((o) => o.id === Number(obraId)) : null;

  const modoLabel: Record<string, string> = {
    facial: "Reconhecimento Facial (Biometria)",
    qrcode: "QR Code",
    numero: "Número Interno",
    manual: "Manual",
  };

  // ── Header ──
  pdf.setFillColor(30, 30, 30);
  pdf.rect(0, 0, W, 18, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(255, 255, 255);
  pdf.text("FICHA DE ENTREGA DE EPI — NR-6", W / 2, 11, { align: "center" });
  y = 24;

  // ── Info block ──
  pdf.setDrawColor(220, 220, 220);
  pdf.setFillColor(250, 250, 250);
  pdf.roundedRect(MARGIN, y, contentW, 36, 2, 2, "FD");

  pdf.setFontSize(9);
  pdf.setTextColor(80, 80, 80);
  pdf.setFont("helvetica", "normal");

  const col1x = MARGIN + 4;
  const col2x = MARGIN + contentW / 2 + 2;
  let rowY = y + 7;
  const rowH = 6;

  const row = (label: string, value: string, x: number, yy: number) => {
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(120, 120, 120);
    pdf.text(label, x, yy);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(30, 30, 30);
    pdf.text(value, x + 22, yy);
  };

  row("Funcionário:", funcionario.nomeCompleto, col1x, rowY);
  row("Data/Hora:", dataHora, col2x, rowY);
  rowY += rowH;

  row("Nº Interno:", funcionario.numeroInterno, col1x, rowY);
  row("Obra:", obraObj?.nome || "Almoxarifado Central", col2x, rowY);
  rowY += rowH;

  row("Cargo:", funcionario.cargo, col1x, rowY);
  row("Identificação:", modoLabel[modoIdentificacao] || modoIdentificacao, col2x, rowY);
  rowY += rowH;

  y += 44;

  // ── EPIs Table ──
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.setFillColor(30, 30, 30);
  pdf.rect(MARGIN, y, contentW, 7, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.text("ITEM", col1x, y + 5);
  pdf.text("EPI / DESCRIÇÃO", col1x + 10, y + 5);
  pdf.text("CA", col1x + 110, y + 5);
  pdf.text("QTDE", col1x + 135, y + 5);
  y += 7;

  pdf.setFont("helvetica", "normal");
  itens.forEach((item, idx) => {
    const bg = idx % 2 === 0 ? [255, 255, 255] : [247, 247, 247];
    pdf.setFillColor(bg[0], bg[1], bg[2]);
    pdf.rect(MARGIN, y, contentW, 7, "F");
    pdf.setTextColor(30, 30, 30);
    pdf.text(String(idx + 1), col1x, y + 5);
    pdf.text(item.epiNome.substring(0, 55), col1x + 10, y + 5);
    pdf.text(item.ca || "—", col1x + 110, y + 5);
    pdf.text(String(item.quantidade), col1x + 135, y + 5);
    y += 7;
  });

  pdf.setDrawColor(200, 200, 200);
  pdf.rect(MARGIN, y - itens.length * 7 - 7, contentW, itens.length * 7 + 7);
  y += 10;

  // ── Declaração ──
  pdf.setFillColor(245, 245, 245);
  pdf.setDrawColor(200, 200, 200);
  pdf.roundedRect(MARGIN, y, contentW, 22, 2, 2, "FD");
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(30, 30, 30);
  pdf.text("DECLARAÇÃO DO TRABALHADOR (NR-6, item 6.8.1)", col1x, y + 6);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(60, 60, 60);
  const decl = "Declaro ter recebido os Equipamentos de Proteção Individual acima especificados, estar ciente da obrigatoriedade " +
    "de utilizá-los, conservá-los e devolvê-los quando solicitado. Recebi treinamento e orientação sobre o uso correto.";
  const declLines = pdf.splitTextToSize(decl, contentW - 8);
  pdf.text(declLines, col1x, y + 12);
  y += 28;

  // ── Biometria foto ──
  if (biometriaFoto && modoIdentificacao === "facial") {
    try {
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(30, 30, 30);
      pdf.text("FOTO CAPTURADA NA ENTREGA (PROVA BIOMÉTRICA):", col1x, y + 5);
      y += 8;
      pdf.addImage(biometriaFoto, "JPEG", col1x, y, 35, 35);

      pdf.setFontSize(7);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(100, 100, 100);
      pdf.text("Foto capturada por reconhecimento facial no momento da entrega.", col1x + 40, y + 10);
      pdf.text("Equivale à assinatura eletrônica qualificada — Lei 14.063/2020.", col1x + 40, y + 16);
      pdf.text(`Data/hora: ${dataHora}`, col1x + 40, y + 22);
      y += 42;
    } catch (_) {}
  } else {
    // Espaço para assinatura manual (fallback)
    pdf.setDrawColor(180, 180, 180);
    pdf.line(MARGIN, y + 15, MARGIN + 80, y + 15);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(120, 120, 120);
    pdf.text("Assinatura do Funcionário", col1x, y + 20);
    y += 28;
  }

  // ── Footer ──
  pdf.setFontSize(7);
  pdf.setTextColor(150, 150, 150);
  pdf.setFont("helvetica", "normal");
  pdf.text(
    `Documento gerado eletronicamente em ${dataHora} · Modo de identificação: ${modoLabel[modoIdentificacao] || modoIdentificacao}`,
    W / 2,
    290,
    { align: "center" }
  );

  const filename = `EPI_${funcionario.nomeCompleto.replace(/\s+/g, "_")}_${agora.toISOString().split("T")[0]}.pdf`;
  pdf.save(filename);
}
