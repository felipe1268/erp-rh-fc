import jsPDF from "jspdf";

export interface CertificadoIntegracaoSstParams {
  registroId: number;
  employeeNome: string;
  employeeCpf?: string | null;
  employeeFuncao?: string | null;
  obraNome?: string | null;
  configNome?: string | null;
  dataRealizacao?: string | null;
  dataValidade?: string | null;
  nota: number;
  notaMinima: number;
  acertos?: number | null;
  totalPerguntas?: number | null;
  tentativa?: number | null;
  empresaNome?: string;
  /** 'save' baixa o PDF (default). 'preview' abre numa janela; se `winRef` for
   *  passada (aberta sincronamente ANTES do await — defesa contra pop-up
   *  blocker do Safari/iPad), redireciona-a; senão tenta window.open e cai pra
   *  save() se for bloqueado. */
  mode?: "save" | "preview";
  winRef?: Window | null;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return "—"; }
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

function fmtCpf(cpf?: string | null): string {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

// Cache do logo entre chamadas (não muda durante a sessão).
// Rev. 2048 follow-up architect: usa Promise cache (deduplica chamadas
// concorrentes) e re-tenta em falha transitória (não trava em null pra
// sempre como `_logoTried` fazia).
type LogoData = { dataUrl: string; w: number; h: number } | null;
let _logoPromise: Promise<LogoData> | null = null;
async function loadLogo(): Promise<LogoData> {
  if (_logoPromise) return _logoPromise;
  _logoPromise = (async () => {
    try {
      const res = await fetch("/logo-fc.jpg", { cache: "force-cache" });
      if (!res.ok) throw new Error(`logo http ${res.status}`);
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
      // Limpa cache pra permitir retry numa próxima chamada
      _logoPromise = null;
      return null;
    }
  })();
  return _logoPromise;
}

export async function generateCertificadoIntegracaoSstPdf(p: CertificadoIntegracaoSstParams) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297;
  const H = 210;

  // Cores da marca FC (verde institucional + navy)
  const FC_GREEN: [number, number, number] = [5, 150, 105];   // emerald-600
  const FC_GREEN_LIGHT: [number, number, number] = [236, 253, 245]; // emerald-50
  const FC_NAVY: [number, number, number] = [30, 58, 95];

  // Moldura externa dupla (cor da marca)
  pdf.setDrawColor(...FC_GREEN);
  pdf.setLineWidth(1.5);
  pdf.rect(8, 8, W - 16, H - 16);
  pdf.setLineWidth(0.3);
  pdf.rect(11, 11, W - 22, H - 22);

  // Faixa superior
  pdf.setFillColor(...FC_GREEN);
  pdf.rect(11, 11, W - 22, 16, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(255, 255, 255);
  pdf.text("CERTIFICADO DE INTEGRAÇÃO DE SEGURANÇA DO TRABALHO", W / 2, 21, { align: "center" });

  // Logo (canto superior esquerdo dentro da faixa branca abaixo do header)
  const logo = await loadLogo();
  if (logo) {
    try {
      // Altura alvo 18mm, largura proporcional
      const targetH = 18;
      const targetW = (logo.w / logo.h) * targetH;
      pdf.addImage(logo.dataUrl, "JPEG", 18, 31, Math.min(targetW, 50), targetH, undefined, "FAST");
    } catch {
      // se addImage falhar (formato), apenas ignora
    }
  }

  // Subtítulo empresa (centro)
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...FC_NAVY);
  pdf.text(p.empresaNome || "FC Engenharia", W / 2, 38, { align: "center" });

  // "Parabéns!" — destaque solicitado pelo usuário
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(...FC_GREEN);
  pdf.text("Parabéns!", W / 2, 50, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(80, 80, 80);
  pdf.text("Certificamos que", W / 2, 58, { align: "center" });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(...FC_NAVY);
  pdf.text((p.employeeNome || "").toUpperCase(), W / 2, 70, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(80, 80, 80);
  const identLine = [
    p.employeeCpf ? `CPF ${fmtCpf(p.employeeCpf)}` : null,
    p.employeeFuncao || null,
  ].filter(Boolean).join("  ·  ");
  if (identLine) pdf.text(identLine, W / 2, 77, { align: "center" });

  // Corpo
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.setTextColor(40, 40, 40);
  const obraTxt = p.obraNome ? ` lotado(a) na obra ${p.obraNome},` : "";
  const cfgTxt = p.configNome ? ` no programa "${p.configNome}",` : "";
  const corpo = `concluiu com aproveitamento${obraTxt}${cfgTxt} a integração admissional de segurança, atendendo aos requisitos das Normas Regulamentadoras aplicáveis e às Regras de Ouro da FC Engenharia.`;
  const split = pdf.splitTextToSize(corpo, W - 60);
  pdf.text(split, W / 2, 90, { align: "center" });

  // Quadro de pontuação
  const boxY = 112;
  pdf.setDrawColor(...FC_GREEN);
  pdf.setFillColor(...FC_GREEN_LIGHT);
  pdf.setLineWidth(0.4);
  pdf.roundedRect(W / 2 - 90, boxY, 180, 32, 3, 3, "FD");

  // Nota grande
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(34);
  pdf.setTextColor(...FC_GREEN);
  pdf.text(`${p.nota}%`, W / 2 - 60, boxY + 22, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.text(`Nota mínima: ${p.notaMinima}%`, W / 2 - 60, boxY + 28, { align: "center" });

  // Acertos
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(...FC_NAVY);
  const acertosTxt = p.acertos != null && p.totalPerguntas != null
    ? `${p.acertos}/${p.totalPerguntas}`
    : "—";
  pdf.text(acertosTxt, W / 2, boxY + 20, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.text("Acertos", W / 2, boxY + 28, { align: "center" });

  // Tentativa
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(...FC_NAVY);
  pdf.text(`${p.tentativa ?? 1}ª`, W / 2 + 60, boxY + 20, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.text("Tentativa", W / 2 + 60, boxY + 28, { align: "center" });

  // Datas (destaque na validade)
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(60, 60, 60);
  pdf.text(`Data de realização: ${fmtDate(p.dataRealizacao)}`, W / 2 - 70, 156, { align: "center" });
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...FC_GREEN);
  pdf.text(`Válido até: ${fmtDate(p.dataValidade)}`, W / 2 + 70, 156, { align: "center" });

  // Linha de assinatura
  pdf.setDrawColor(150, 150, 150);
  pdf.line(W / 2 - 50, 175, W / 2 + 50, 175);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(80, 80, 80);
  pdf.text("Técnico de Segurança do Trabalho (TST)", W / 2, 180, { align: "center" });

  // Rodapé
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(7);
  pdf.setTextColor(120, 120, 120);
  pdf.text(
    `Certificado nº ${String(p.registroId).padStart(8, "0")}  ·  Emitido em ${fmtDateTime(new Date().toISOString())}  ·  Documento gerado eletronicamente`,
    W / 2, 195, { align: "center" }
  );

  const filename = `certificado-integracao-${String(p.registroId).padStart(6, "0")}.pdf`;

  if (p.mode === "preview") {
    // Rev. 2048 follow-up architect: cria URL manualmente pra poder revogar
    // depois (output('bloburl') não dá hook de cleanup → vaza memória em
    // sessões com muitas pré-visualizações).
    const blob = pdf.output("blob") as Blob;
    const url = URL.createObjectURL(blob);
    // Revoga em 2min (tempo de sobra pro navegador carregar e renderizar)
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* noop */ } }, 120_000);
    if (p.winRef && !p.winRef.closed) {
      try { p.winRef.location.href = url; return; } catch { /* fall through */ }
    }
    const w = window.open(url, "_blank");
    if (!w) {
      // pop-up bloqueado → fallback pra download (não deixa o usuário sem nada)
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
      pdf.save(filename);
    }
    return;
  }

  pdf.save(filename);
}
