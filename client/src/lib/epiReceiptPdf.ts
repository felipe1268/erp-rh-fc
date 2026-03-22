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

// ─────────────────────────────────────────────────────────────────────────────
// FICHA EPI COMPLETA — gerada a partir do fichaDelivery (Epis.tsx)
// ─────────────────────────────────────────────────────────────────────────────

interface FichaEpiParams {
  nomeFunc: string;
  funcaoFunc?: string;
  cpfFunc?: string;
  matriculaFunc?: string;
  obraNome?: string;
  nomeEpi: string;
  caEpi?: string;
  quantidade: number;
  vidaUtil?: string;
  valorUnit?: string;
  motivo?: string;
  dataEntrega?: string;
  emitidoPor?: string;
  empresaNome?: string;
  empresaCnpj?: string;
  textoDeclaracao?: string;
  assinaturaFuncUrl?: string | null;
  assinaturaResponsavelUrl?: string | null;
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

export async function generateFichaEpiPdf(params: FichaEpiParams): Promise<string> {
  const {
    nomeFunc, funcaoFunc, cpfFunc, matriculaFunc, obraNome,
    nomeEpi, caEpi, quantidade, vidaUtil, valorUnit, motivo,
    dataEntrega, emitidoPor, empresaNome, empresaCnpj, textoDeclaracao,
    assinaturaFuncUrl, assinaturaResponsavelUrl,
  } = params;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const M = 14;
  const cW = W - M * 2;
  let y = M;

  const agora = new Date();
  const dataHora = agora.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const dataEntregaFmt = dataEntrega
    ? new Date(dataEntrega + "T00:00:00").toLocaleDateString("pt-BR")
    : "—";

  // ── Pre-fetch signature images ──
  const [sigFuncData, sigRespData] = await Promise.all([
    assinaturaFuncUrl ? urlToDataUrl(assinaturaFuncUrl) : Promise.resolve(null),
    assinaturaResponsavelUrl ? urlToDataUrl(assinaturaResponsavelUrl) : Promise.resolve(null),
  ]);

  // ── Header: company block + title ──
  pdf.setFillColor(27, 42, 74);
  pdf.rect(0, 0, W, 20, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(255, 255, 255);
  pdf.text(empresaNome || "FC ENGENHARIA PROJETOS E CONSULTORIA LTDA", W / 2, 8, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  if (empresaCnpj) {
    pdf.text(`CNPJ: ${empresaCnpj}`, W / 2, 13, { align: "center" });
  }
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.text("FICHA DE ENTREGA DE EPI", W / 2, 18, { align: "center" });
  y = 26;

  // ── Issue info ──
  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 100, 100);
  pdf.text(`Data da Entrega: ${dataEntregaFmt}`, M, y);
  pdf.text(`Emitido em: ${dataHora}   Emitido por: ${emitidoPor || "—"}`, W - M, y, { align: "right" });
  y += 5;

  // ── Employee info box ──
  pdf.setDrawColor(200, 200, 200);
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(M, y, cW, 26, 1.5, 1.5, "FD");

  const L = M + 4;
  const C2 = M + cW / 2 + 2;
  let ry = y + 6;
  const rH = 6;

  const field = (label: string, value: string, x: number, yy: number, labelW = 18) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(120, 120, 120);
    pdf.text(label, x, yy);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(27, 42, 74);
    pdf.text(value || "—", x + labelW, yy);
  };

  field("Funcionário:", nomeFunc, L, ry, 22);
  field("Função:", funcaoFunc || "—", C2, ry, 14);
  ry += rH;
  field("CPF:", cpfFunc || "—", L, ry, 22);
  field("Matrícula:", matriculaFunc || "—", C2, ry, 18);
  ry += rH;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(120, 120, 120);
  pdf.text("Obra / Local:", L, ry);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(27, 42, 74);
  pdf.text(obraNome || "—", L + 22, ry);

  y += 32;

  // ── EPI Table ──
  pdf.setFillColor(27, 42, 74);
  pdf.rect(M, y, cW, 7, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);

  const cols = [0, 70, 90, 107, 127, 152];
  const headers = ["EPI", "CA", "Qtd", "Vida Útil", "Valor Unit.", "Motivo"];
  headers.forEach((h, i) => pdf.text(h, L + cols[i], y + 5));
  y += 7;

  pdf.setFillColor(255, 255, 255);
  pdf.rect(M, y, cW, 8, "F");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(30, 30, 30);
  pdf.text(nomeEpi.substring(0, 38), L + cols[0], y + 5.5);
  pdf.text(caEpi || "—", L + cols[1], y + 5.5);
  pdf.text(String(quantidade), L + cols[2], y + 5.5);
  pdf.text(vidaUtil || "—", L + cols[3], y + 5.5);
  pdf.text(valorUnit || "—", L + cols[4], y + 5.5);
  pdf.text((motivo || "Entrega regular").substring(0, 18), L + cols[5], y + 5.5);
  pdf.setDrawColor(200, 200, 200);
  pdf.rect(M, y - 7, cW, 15);
  y += 12;

  // ── Policy box ──
  pdf.setDrawColor(27, 42, 74);
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(M, y, cW, 38, 1.5, 1.5, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(27, 42, 74);
  pdf.text("IMPORTANTE — POLÍTICA DE CONSERVAÇÃO, TROCA E COBRANÇA DE EPI", L, y + 5);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(60, 60, 60);

  const policyText = vidaUtil
    ? `O EPI acima possui vida útil mínima de ${vidaUtil} a partir da data de entrega. A troca por desgaste natural de uso é realizada sem custo ao colaborador, mediante apresentação do EPI danificado e registro fotográfico obrigatório.`
    : `A troca por desgaste natural de uso é realizada sem custo ao colaborador, mediante apresentação do EPI danificado e registro fotográfico obrigatório.`;
  const policyLines = pdf.splitTextToSize(policyText, cW - 8);
  pdf.text(policyLines, L, y + 11);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(180, 0, 0);
  pdf.text("COBRANÇA:", L, y + 22);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(60, 60, 60);
  const cobrancaText = `Em caso de perda, extravio, furto, dano por mau uso ou negligência, o valor indicado será descontado integralmente na folha de pagamento do mesmo mês, conforme Art. 462, §1º da CLT.`;
  const cobrancaLines = pdf.splitTextToSize(cobrancaText, cW - 22);
  pdf.text(cobrancaLines, L + 18, y + 22);

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(140, 100, 0);
  pdf.text("FOTO OBRIGATÓRIA:", L, y + 33);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(60, 60, 60);
  pdf.text("Para qualquer troca, é obrigatório registro fotográfico do EPI antigo.", L + 28, y + 33);
  y += 44;

  // ── Declaration ──
  const declText = textoDeclaracao ||
    "Declaro ter recebido os Equipamentos de Proteção Individual (EPIs) acima descritos, comprometendo-me a utilizá-los corretamente durante a jornada de trabalho, conforme orientações recebidas. Estou ciente de que a não utilização, o uso inadequado ou a perda/dano por negligência poderá acarretar desconto em meu salário dentro do mesmo mês da ocorrência, conforme Art. 462, §1º da CLT e NR-6 do MTE.";
  const declLines = pdf.splitTextToSize(declText, cW);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(30, 30, 30);
  pdf.text(declLines, M, y);
  y += declLines.length * 4 + 3;

  // ── Obligations ──
  pdf.setDrawColor(210, 210, 210);
  pdf.setFillColor(250, 250, 250);
  pdf.roundedRect(M, y, cW, 20, 1, 1, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(60, 60, 60);
  pdf.text("Obrigações do Empregado (NR-6, item 6.7.1 do MTE):", L, y + 5);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(80, 80, 80);
  const obs = [
    "a) Usar o EPI apenas para a finalidade a que se destina;",
    "b) Responsabilizar-se pela guarda e conservação;",
    "c) Comunicar ao empregador qualquer alteração que o torne impróprio para uso;",
    "d) Cumprir as determinações do empregador sobre o uso adequado.",
  ];
  obs.forEach((ob, i) => pdf.text(ob, L, y + 9 + i * 3));
  y += 25;

  // ── Signatures ──
  const sigBoxW = (cW - 8) / 2;
  const sigBoxH = 35;

  // Left: employee
  pdf.setDrawColor(200, 200, 200);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(M, y, sigBoxW, sigBoxH, 1, 1, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(60, 60, 60);
  pdf.text("Assinatura do Funcionário", M + sigBoxW / 2, y + 4, { align: "center" });

  if (sigFuncData) {
    try {
      pdf.addImage(sigFuncData, "PNG", M + 5, y + 6, sigBoxW - 10, 22);
    } catch (_) {}
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(0, 140, 0);
    pdf.text("✓ Assinatura digital coletada", M + sigBoxW / 2, y + 31, { align: "center" });
  } else {
    pdf.setDrawColor(180, 180, 180);
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(M + 10, y + 26, M + sigBoxW - 10, y + 26);
    pdf.setLineDashPattern([], 0);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(150, 150, 150);
    pdf.text("(assine acima da linha)", M + sigBoxW / 2, y + 31, { align: "center" });
  }

  // Right: responsible
  const sigR = M + sigBoxW + 8;
  pdf.setDrawColor(200, 200, 200);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(sigR, y, sigBoxW, sigBoxH, 1, 1, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(60, 60, 60);
  pdf.text("Responsável pela Entrega", sigR + sigBoxW / 2, y + 4, { align: "center" });

  if (sigRespData) {
    try {
      pdf.addImage(sigRespData, "PNG", sigR + 5, y + 6, sigBoxW - 10, 22);
    } catch (_) {}
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(0, 140, 0);
    pdf.text("✓ Assinatura digital coletada", sigR + sigBoxW / 2, y + 31, { align: "center" });
  } else {
    pdf.setDrawColor(180, 180, 180);
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(sigR + 10, y + 26, sigR + sigBoxW - 10, y + 26);
    pdf.setLineDashPattern([], 0);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(150, 150, 150);
    pdf.text("(assine acima da linha)", sigR + sigBoxW / 2, y + 31, { align: "center" });
  }
  y += sigBoxH + 4;

  // ── Footer ──
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.setTextColor(160, 160, 160);
  pdf.text(
    `Conforme Art. 462, §1º da CLT e NR-6 (item 6.7.1) do MTE — Equipamentos de Proteção Individual`,
    W / 2, y + 4, { align: "center" }
  );
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(27, 42, 74);
  pdf.text(empresaNome || "FC ENGENHARIA PROJETOS E CONSULTORIA LTDA", W / 2, y + 9, { align: "center" });

  // ── Digital audit stamp ──
  if (sigFuncData || sigRespData) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6);
    pdf.setTextColor(120, 120, 120);
    pdf.text(
      `Documento com assinatura(s) digital(is) — gerado em ${dataHora} · Base legal: MP 2.200-2/2001, Art. 10, §2º`,
      W / 2, y + 14, { align: "center" }
    );
  }

  // Return base64 string (without the data URI prefix)
  const pdfBase64 = pdf.output("datauristring");
  const base64Only = pdfBase64.split(",")[1];

  // Also trigger download
  const filename = `Ficha_EPI_${nomeFunc.replace(/\s+/g, "_")}_${agora.toISOString().split("T")[0]}.pdf`;
  pdf.save(filename);

  return base64Only;
}
