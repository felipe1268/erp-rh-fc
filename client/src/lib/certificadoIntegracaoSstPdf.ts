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

export function generateCertificadoIntegracaoSstPdf(p: CertificadoIntegracaoSstParams) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297;
  const H = 210;

  // Moldura externa
  pdf.setDrawColor(5, 150, 105); // emerald-600
  pdf.setLineWidth(1.5);
  pdf.rect(8, 8, W - 16, H - 16);
  pdf.setLineWidth(0.3);
  pdf.rect(11, 11, W - 22, H - 22);

  // Faixa superior
  pdf.setFillColor(5, 150, 105);
  pdf.rect(11, 11, W - 22, 14, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(255, 255, 255);
  pdf.text("CERTIFICADO DE INTEGRAÇÃO DE SEGURANÇA DO TRABALHO", W / 2, 20, { align: "center" });

  // Subtítulo empresa
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(80, 80, 80);
  pdf.text(p.empresaNome || "FC Engenharia", W / 2, 32, { align: "center" });

  // Texto principal
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(60, 60, 60);
  pdf.text("Certificamos que", W / 2, 48, { align: "center" });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.setTextColor(30, 58, 95); // navy
  pdf.text((p.employeeNome || "").toUpperCase(), W / 2, 62, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(80, 80, 80);
  const identLine = [
    p.employeeCpf ? `CPF ${fmtCpf(p.employeeCpf)}` : null,
    p.employeeFuncao || null,
  ].filter(Boolean).join("  ·  ");
  if (identLine) pdf.text(identLine, W / 2, 69, { align: "center" });

  // Corpo
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.setTextColor(40, 40, 40);
  const obraTxt = p.obraNome ? ` lotado(a) na obra ${p.obraNome},` : "";
  const cfgTxt = p.configNome ? ` no programa "${p.configNome}",` : "";
  const corpo = `concluiu com aproveitamento${obraTxt}${cfgTxt} a integração admissional de segurança, atendendo aos requisitos das Normas Regulamentadoras aplicáveis.`;
  const split = pdf.splitTextToSize(corpo, W - 60);
  pdf.text(split, W / 2, 84, { align: "center" });

  // Quadro de pontuação
  const boxY = 108;
  pdf.setDrawColor(5, 150, 105);
  pdf.setFillColor(236, 253, 245); // emerald-50
  pdf.setLineWidth(0.4);
  pdf.roundedRect(W / 2 - 90, boxY, 180, 32, 3, 3, "FD");

  // Nota grande
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(34);
  pdf.setTextColor(5, 150, 105);
  pdf.text(`${p.nota}%`, W / 2 - 60, boxY + 22, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.text(`Nota mínima: ${p.notaMinima}%`, W / 2 - 60, boxY + 28, { align: "center" });

  // Acertos
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(30, 58, 95);
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
  pdf.setTextColor(30, 58, 95);
  pdf.text(`${p.tentativa ?? 1}ª`, W / 2 + 60, boxY + 20, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.text("Tentativa", W / 2 + 60, boxY + 28, { align: "center" });

  // Datas
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(60, 60, 60);
  pdf.text(`Data de realização: ${fmtDate(p.dataRealizacao)}`, W / 2 - 70, 152, { align: "center" });
  pdf.text(`Válido até: ${fmtDate(p.dataValidade)}`, W / 2 + 70, 152, { align: "center" });

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

  pdf.save(`certificado-integracao-${String(p.registroId).padStart(6, "0")}.pdf`);
}
