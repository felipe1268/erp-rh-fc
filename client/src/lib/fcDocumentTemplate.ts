/**
 * client/src/lib/fcDocumentTemplate.ts
 *
 * Rev. 2114 — Template ÚNICO para documentos institucionais FC.
 *
 * Por quê este arquivo existe:
 *   O Comunicado Interno (ComunicadosInternos.tsx ~L556-635) é renderizado
 *   como JSX React com Tailwind, impresso via window.print() da própria
 *   página. Já o Contrato de Experiência (Colaboradores.tsx) é HTML string
 *   injetado em window.open() + write() — janela isolada SEM Tailwind, onde
 *   tudo precisa ser inline-style. Essa diferença estrutural levou a 10
 *   revisões (2104→2113) tentando "deixar o contrato igual ao comunicado"
 *   com micro-ajustes que nunca pegavam tudo.
 *
 *   Esta função replica EXATAMENTE o visual do Comunicado JSX em HTML puro
 *   com inline styles. Sai 100% compatível com 3 cenários:
 *     1) window.open + document.write (popup imprimir)
 *     2) Viewer FCSign /assinar/:token (DOMPurify scopado)
 *     3) PDF gerado pelo Chrome (mesma string HTML)
 *
 * REGRAS DE OURO (Rev. 2106+):
 *   - Inline styles em TODOS os elementos críticos (DOMPurify pode descartar
 *     <style> externo, e janela popup não tem CSS herdado).
 *   - <style> tag SEMPRE dentro do <body> (não no <head>) — alguns viewers
 *     ignoram <head>.
 *   - print-color-adjust:exact inline na faixa azul (cores no print).
 *   - JAMAIS usar on* handlers (onerror, onload, onclick) — filtro XSS do
 *     signatures.create rejeita.
 *   - Logo SEMPRE com fallback ${window.location.origin}/logo-fc.jpg via src
 *     puro (sem onerror).
 *
 * Medidas calibradas a partir do Comunicado React real:
 *   - Container: max-w-3xl (~720px) mx-auto, padding 32px (print: 16px)
 *   - Logo: 64px altura
 *   - Razão social: 18px bold uppercase, cor navy #1B2A4A
 *   - CNPJ/endereço: 10px cinza
 *   - Faixa azul: bg #1B2A4A, padding 10px 16px, rounded-sm (2px),
 *                 texto 14px tracking-wider (.05em — NÃO 4px!)
 *   - Linha Nº/Data: flex justify-between, 11px, cor cinza (Nº em navy bold)
 *   - Bloco ASSUNTO: border cinza, padding 16px, mb-6
 *   - Corpo: border cinza, padding 24px, mb-6
 *   - Assinaturas: mt-12 pt-6, flex justify-between gap-12, border-top
 *                  cinza, texto 12px navy
 *   - Rodapé: mt-8 pt-4 border-top, flex justify-between, 9px cinza
 *
 * @page rules:
 *   - size: A4
 *   - margin: 14mm 10mm (igual à lista de assinatura do Comunicado)
 *   - body NÃO tem padding adicional no print (evita soma com @page margin)
 */

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface FcEmpresa {
  razaoSocial?: string;
  nomeFantasia?: string;
  cnpj?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  logoUrl?: string;
}

export interface FcAssinaturaParte {
  /** Nome principal exibido em cima da linha (após assinar). Ex: "FC ENGENHARIA E CONSTRUCAO LTDA". */
  nome: string;
  /** Subtítulo abaixo do nome. Ex: "CNPJ: 29.353.906/0001-71" ou "Departamento de RH". */
  subtitulo?: string;
  /**
   * Rev. 2120: role do FCSign — quando preenchido, insere um placeholder
   * `<!--FCSIGN:SIG:{role}-->` ACIMA da linha de assinatura. O servidor
   * (`renderFinalHtml` em `server/routers/signatures.ts`) substitui esse
   * placeholder pela `<img>` da assinatura quando o signatário assina.
   * Sem este campo, a área de assinatura fica em branco (modo PDF/impressão).
   */
  role?: "empregado" | "empregador" | "contratado" | "contratante" | "testemunha_1" | "testemunha_2";
}

export interface FcAssinaturasBlock {
  /** Pares principais (2 colunas). Ex: [empregador, empregado] ou [RH, Direção]. */
  partes: FcAssinaturaParte[];
  /** Se true, adiciona uma 2ª linha com 2 testemunhas (nome/CPF em branco). */
  testemunhas?: boolean;
  /** Texto "Local/UF, dd/mm/aaaa" acima das assinaturas (opcional). */
  localData?: string;
}

export interface FcDocumentParams {
  empresa: FcEmpresa;
  /** Nome do documento — vai dentro da faixa azul. Ex: "CONTRATO DE EXPERIÊNCIA". */
  titulo: string;
  /** Número formatado. Ex: "034/2026". */
  numero: string;
  /** Data de emissão formatada pt-BR. Ex: "18/05/2026". */
  dataEmissao: string;
  /** Bloco ASSUNTO — label opcional (default "ASSUNTO:") + valor uppercase. */
  assunto: { label?: string; valor: string };
  /**
   * HTML do corpo do documento (parágrafos, cláusulas etc). Deve ser HTML
   * já formatado pelo chamador, com inline styles próprios se quiser
   * destacar (strong, etc). Use <p> com margens explícitas se precisar.
   *
   * **ATENÇÃO SEGURANÇA:** este campo é injetado RAW (sem escape). O
   * chamador é RESPONSÁVEL por escapar dados vindos do banco/usuário
   * antes de interpolar (use o próprio `esc()` do arquivo que monta o
   * corpo, ou DOMPurify se houver fontes não-confiáveis). Em geral o
   * conteúdo é texto controlado + cláusulas hard-coded, mas qualquer
   * campo vindo de input livre PRECISA ser escapado.
   */
  corpoHtml: string;
  /** Blocos de assinatura (partes + opcionalmente testemunhas). */
  assinaturas: FcAssinaturasBlock;
  /** Nome do usuário que está gerando o documento — vai no rodapé. */
  geradoPor: string;
  /** Título da aba/janela. Ex: "Contrato de Experiência - João Silva". */
  pageTitle?: string;
  /**
   * Logo override. Se não vier, usa empresa.logoUrl. Sempre tem fallback
   * para ${origin}/logo-fc.jpg. Passe um data:URL ou uma URL absoluta para
   * funcionar dentro do window.open isolado.
   */
  logoSrc?: string;
}

/**
 * Constrói o HTML completo de um documento institucional FC.
 * Retorna string pronta pra window.open().document.write() ou pra ser
 * enviada como documentHtml ao FCSign.
 */
export function buildFcDocument(p: FcDocumentParams): string {
  const nomeEmpresa = esc(p.empresa.razaoSocial || p.empresa.nomeFantasia || "FC ENGENHARIA");
  const cnpj = p.empresa.cnpj ? esc(p.empresa.cnpj) : "";
  const enderecoParts = [p.empresa.endereco, p.empresa.cidade, p.empresa.estado].filter(Boolean);
  const enderecoFull = enderecoParts.length ? esc(enderecoParts.join(" - ")) : "";
  const logo = esc(p.logoSrc || p.empresa.logoUrl || "/logo-fc.jpg");
  const assuntoLabel = esc(p.assunto.label || "ASSUNTO:");
  const assuntoValor = esc(p.assunto.valor);
  const pageTitle = esc(p.pageTitle || p.titulo);
  const titulo = esc(p.titulo);
  const numero = esc(p.numero);
  const dataEmissao = esc(p.dataEmissao);
  const userName = esc(p.geradoPor || "Sistema");
  const horaAgora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hojeStr = new Date().toLocaleDateString("pt-BR");

  // Rev. 2120: slot ACIMA da linha — o servidor injeta a <img> da assinatura aqui
  // quando o signatário assina. Sem assinatura, fica espaço em branco (50px) que
  // mantém o layout estável (linha continua na mesma posição vertical).
  // O placeholder usa comentário HTML pra não vazar nada caso fique sem replace.
  const slotHtml = (role?: FcAssinaturaParte["role"]) =>
    role
      ? `<div style="height:50px;display:flex;align-items:flex-end;justify-content:center;margin-bottom:-2px"><!--FCSIGN:SIG:${role}--></div>`
      : `<div style="height:50px"></div>`;

  // Assinaturas — 1ª linha (partes principais, 2 colunas equivalentes)
  const partesHtml = p.assinaturas.partes
    .map(
      (pt) => `
    <td style="text-align:center;padding:0 24px;vertical-align:top;width:50%">
      <div style="margin-top:24px">
        ${slotHtml(pt.role)}
        <div style="border-top:1px solid #6b7280;padding-top:8px">
          <div style="font-family:'Helvetica','Arial',sans-serif;font-size:11pt;font-weight:700;color:#1B2A4A">${esc(pt.nome)}</div>
          ${pt.subtitulo ? `<div style="font-family:'Helvetica','Arial',sans-serif;font-size:9pt;color:#6b7280;margin-top:2px">${esc(pt.subtitulo)}</div>` : ""}
        </div>
      </div>
    </td>`
    )
    .join("");

  const testemunhasHtml = p.assinaturas.testemunhas
    ? `
  <table style="margin-top:24px;width:100%;border-collapse:collapse;table-layout:fixed;page-break-inside:avoid"><tbody><tr>
    <td style="text-align:center;padding:0 24px;vertical-align:top;width:50%">
      <div style="margin-top:16px">
        ${slotHtml("testemunha_1")}
        <div style="border-top:1px solid #6b7280;padding-top:8px">
          <div style="font-family:'Helvetica','Arial',sans-serif;font-size:10pt;font-weight:600;color:#1B2A4A">Testemunha 1</div>
          <div style="font-family:'Helvetica','Arial',sans-serif;font-size:9pt;color:#6b7280;margin-top:2px">Nome: ____________________________</div>
          <div style="font-family:'Helvetica','Arial',sans-serif;font-size:9pt;color:#6b7280;margin-top:1px">CPF: __________________</div>
        </div>
      </div>
    </td>
    <td style="text-align:center;padding:0 24px;vertical-align:top;width:50%">
      <div style="margin-top:16px">
        ${slotHtml("testemunha_2")}
        <div style="border-top:1px solid #6b7280;padding-top:8px">
          <div style="font-family:'Helvetica','Arial',sans-serif;font-size:10pt;font-weight:600;color:#1B2A4A">Testemunha 2</div>
          <div style="font-family:'Helvetica','Arial',sans-serif;font-size:9pt;color:#6b7280;margin-top:2px">Nome: ____________________________</div>
          <div style="font-family:'Helvetica','Arial',sans-serif;font-size:9pt;color:#6b7280;margin-top:1px">CPF: __________________</div>
        </div>
      </div>
    </td>
  </tr></tbody></table>`
    : "";

  const localDataHtml = p.assinaturas.localData
    ? `<p style="text-align:center;margin:24px 0 0 0;font-size:11pt">${esc(p.assinaturas.localData)}</p>`
    : "";

  // Container principal: max-w-3xl ~ 720px (igual ao Comunicado React)
  // Padding 32px tela / 16px print (do print:p-4 do Tailwind)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${pageTitle}</title></head><body style="margin:0;padding:0;background:#f8fafc;-webkit-print-color-adjust:exact;print-color-adjust:exact">
<style>
@page{size:A4;margin:10mm 10mm 10mm 10mm}
body{font-family:'Helvetica','Arial','Liberation Sans',sans-serif;font-size:11pt;line-height:1.55;color:#1a1a1a}
.fc-doc{max-width:760px;margin:0 auto;background:#fff;padding:1cm 1cm;box-sizing:border-box}
.fc-doc p{margin:0 0 10px 0;text-align:justify}
.fc-doc strong{font-weight:700;color:#1a1a1a}
@media print{
  body{background:#fff}
  .fc-doc{max-width:none;padding:0;box-shadow:none;border:none}
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
}
</style>

<div class="fc-doc">

  <!-- ===== CABEÇALHO ===== -->
  <div style="text-align:center;margin-bottom:16px">
    <img src="${logo}" alt="${nomeEmpresa}" style="display:inline-block;height:64px;width:auto;max-width:200px;object-fit:contain;margin-bottom:8px" />
    <div style="font-family:'Helvetica','Arial',sans-serif;font-size:13pt;font-weight:700;color:#1B2A4A;letter-spacing:.3px;line-height:1.2;margin:4px 0 2px 0">${nomeEmpresa}</div>
    ${cnpj ? `<div style="font-family:'Helvetica','Arial',sans-serif;font-size:9pt;color:#6b7280;line-height:1.3">CNPJ: ${cnpj}</div>` : ""}
    ${enderecoFull ? `<div style="font-family:'Helvetica','Arial',sans-serif;font-size:9pt;color:#9ca3af;line-height:1.3;margin-top:1px">${enderecoFull}</div>` : ""}
  </div>

  <!-- ===== FAIXA AZUL TÍTULO ===== -->
  <div style="background-color:#1B2A4A;color:#fff;padding:10px 16px;text-align:center;border-radius:2px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
    <span style="font-family:'Helvetica','Arial',sans-serif;font-size:11pt;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#fff">${titulo}</span>
  </div>

  <!-- ===== LINHA Nº / DATA ===== -->
  <table style="width:100%;border-collapse:collapse;margin:12px 0 0 0;font-size:10.5pt"><tbody><tr>
    <td style="text-align:left;padding:0 4px;font-family:'Helvetica','Arial',sans-serif;color:#1B2A4A;font-weight:600">Nº ${numero}</td>
    <td style="text-align:right;padding:0 4px;font-family:'Helvetica','Arial',sans-serif;color:#4b5563">Data de Emissão: ${dataEmissao}</td>
  </tr></tbody></table>

  <!-- ===== BLOCO ASSUNTO (com border cinza, igual Comunicado) ===== -->
  <div style="border:1px solid #d1d5db;border-radius:3px;padding:14px 16px;margin:16px 0 20px 0">
    <div style="font-family:'Helvetica','Arial',sans-serif;font-size:9pt;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">${assuntoLabel}</div>
    <div style="font-family:'Helvetica','Arial',sans-serif;font-size:12pt;font-weight:700;color:#1B2A4A;line-height:1.3">${assuntoValor}</div>
  </div>

  <!-- ===== CORPO (com border cinza, igual Comunicado) ===== -->
  <div style="border:1px solid #e5e7eb;border-radius:3px;padding:20px 24px;margin-bottom:24px;font-family:'Helvetica','Arial','Liberation Sans',sans-serif;font-size:11pt;line-height:1.6;color:#1f2937;text-align:justify">
    ${p.corpoHtml}
  </div>

  <!-- ===== LOCAL E DATA (opcional) ===== -->
  ${localDataHtml}

  <!-- ===== ASSINATURAS — partes principais ===== -->
  <table style="margin-top:36px;width:100%;border-collapse:collapse;table-layout:fixed;page-break-inside:avoid"><tbody><tr>${partesHtml}</tr></tbody></table>

  ${testemunhasHtml}

  <!-- ===== RODAPÉ (border-top cinza, 9pt, igual Comunicado) ===== -->
  <table style="width:100%;border-collapse:collapse;margin-top:36px;border-top:1px solid #e5e7eb;padding-top:8px"><tbody><tr>
    <td style="text-align:left;font-family:'Helvetica','Arial',sans-serif;font-size:8.5pt;color:#9ca3af;padding:8px 0 0 0">Documento gerado pelo ERP - Gestão Integrada</td>
    <td style="text-align:right;font-family:'Helvetica','Arial',sans-serif;font-size:8.5pt;color:#9ca3af;padding:8px 0 0 0">Emitido em: ${hojeStr} às ${horaAgora} | Por: ${userName}</td>
  </tr></tbody></table>

</div>

</body></html>`;
}
