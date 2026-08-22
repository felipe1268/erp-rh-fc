// Rev. 5054 — srcDoc do contrato de terceiros (prévia da cotação E detalhe do
// contrato usam o MESMO wrapper visual): motor da Central de Documentos
// (buildFcDocument) com o HTML do template preenchido no servidor.
// Extraído de Cotacoes.tsx para reuso em ContratoDetalhe.tsx.
import DOMPurify from "dompurify";
import { buildFcDocument } from "@/lib/fcDocumentTemplate";

// XSS hardening antes de injetar (iframe sandbox).
export const CONTRATO_PREVIEW_SANITIZE = {
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "link", "meta", "base"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit", "formaction"],
  ALLOW_DATA_ATTR: false,
} as const;

// Rev. 5018 — padroniza a caixa dos nomes das assinaturas (Title Case).
function _tituloNomeAssinatura(v: any): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || /^_+$/.test(s)) return s;
  const minusculas = new Set(["de", "da", "do", "das", "dos", "e"]);
  return s.toLowerCase().split(/\s+/).map((w, i) =>
    i > 0 && minusculas.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(" ");
}

export function buildContratoPreviewSrcDoc(data: any, anexoSections?: Array<{ titulo: string; subtitulo?: string; pages: string[] }>, logoDataUrl?: string | null, emissorNome?: string | null): string {
  const corpo = DOMPurify.sanitize(String(data?.html || ""), CONTRATO_PREVIEW_SANITIZE as any);
  // Rev. 5008/5021 — TODOS os anexos (proposta, projetos por disciplina,
  // cronograma, outros) continuam DENTRO do documento, após as assinaturas,
  // cada um com capa própria. Só aceita data:image (páginas renderizadas
  // localmente) — nunca URL arbitrária.
  const escA = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const secsOk = (anexoSections || []).map(s => ({ ...s, pages: (s.pages || []).filter(u => typeof u === "string" && u.startsWith("data:image/")) })).filter(s => s.pages.length);
  const apendiceHtml = secsOk.map((sec) => `
<div class="fc-doc" style="margin-top:28px;page-break-before:always;min-height:257mm;display:flex;align-items:center;justify-content:center">
  <div style="text-align:center;width:100%">
    <div style="font-family:'Helvetica','Arial',sans-serif;font-size:8.5pt;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">Documento complementar — parte integrante do contrato</div>
    <div style="background-color:#1B2A4A;color:#fff;padding:14px 16px;text-align:center;border-radius:2px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
      <span style="font-family:'Helvetica','Arial',sans-serif;font-size:13pt;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#fff">${escA(sec.titulo)}</span>
    </div>
    <div style="font-family:'Helvetica','Arial',sans-serif;font-size:9.5pt;color:#6b7280;margin-top:12px">${escA(String(sec.subtitulo || ""))}${sec.subtitulo ? " — " : ""}${sec.pages.length} página${sec.pages.length > 1 ? "s" : ""}</div>
  </div>
</div>
<div class="fc-doc" style="margin-top:28px;page-break-before:always">
  ${sec.pages.map((src, i) => `<img src="${src}" alt="${escA(sec.titulo)} — página ${i + 1}" style="width:100%;display:block;margin:0 0 14px 0;border:1px solid #e5e7eb;page-break-inside:avoid" />`).join("")}
</div>`).join("");
  const meta = data?.docMeta || {};
  const emp = meta.empresa || {};
  const hoje = new Date().toLocaleDateString("pt-BR");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Rev. 5022 — o iframe é sandboxed (origem opaca, sem cookie de sessão), então
  // logo de /uploads (autenticado) quebrava. O caller baixa a logo e passa como
  // dataURL; fallback: URL absoluta (funciona pra assets públicos como /logo-fc.jpg).
  const logoAbs = (logoDataUrl && logoDataUrl.startsWith("data:image/"))
    ? logoDataUrl
    : emp.logoUrl ? (String(emp.logoUrl).startsWith("/") ? `${origin}${emp.logoUrl}` : emp.logoUrl) : `${origin}/logo-fc.jpg`;
  return buildFcDocument({
    espacamentoAmplo: true,
    empresa: {
      razaoSocial: emp.razaoSocial || undefined,
      nomeFantasia: emp.nomeFantasia || undefined,
      cnpj: emp.cnpj || undefined,
      endereco: emp.endereco || undefined,
      cidade: emp.cidade || undefined,
      estado: emp.estado || undefined,
      logoUrl: logoAbs,
    },
    titulo: "CONTRATO TERCEIROS",
    numero: data?.numeroContrato || "S/N",
    dataEmissao: hoje,
    assunto: { valor: String((data as any)?.titulo || "Contrato de Prestação de Serviços") },
    corpoHtml: corpo,
    assinaturas: {
      localData: meta.localData || undefined,
      // 4 assinaturas obrigatórias (Rev. 5005): Contratado → Gestor do Projeto →
      // Financeiro → Sócio Administrador + 2 testemunhas opcionais.
      partes: [
        { nome: _tituloNomeAssinatura(meta.contratadaNome) || "CONTRATADA", subtitulo: meta.contratadaCnpj ? `CNPJ: ${meta.contratadaCnpj} — CONTRATADA` : "CONTRATADA" },
        { nome: _tituloNomeAssinatura(meta.gestorProjetoNome) || "____________________", subtitulo: "Gestor do Projeto" },
        { nome: _tituloNomeAssinatura(meta.financeiroNome) || "____________________", subtitulo: "Responsável Financeiro" },
        { nome: _tituloNomeAssinatura((meta as any).contratanteRepresentante || emp.razaoSocial) || "____________________", subtitulo: "Sócio Administrador — CONTRATANTE" },
      ],
      testemunhas: true,
    },
    // Rev. 5022 — LGPD: nome do usuário que emitiu, no rodapé de cada página.
    geradoPor: emissorNome || "Sistema",
    pageTitle: "Prévia do Contrato de Serviço",
    logoSrc: logoAbs,
    forSign: true,
    apendiceHtml,
  });
}
