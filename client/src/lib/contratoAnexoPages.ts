// Rev. 5054 — renderização dos ANEXOS do contrato de terceiros (proposta,
// projetos, cronograma, outros) em páginas data:image p/ o iframe srcDoc.
// Extraído de Cotacoes.tsx (Rev. 5008/5021) p/ reuso no detalhe do contrato:
// prévia da cotação E ContratoDetalhe mostram os MESMOS anexos após as
// assinaturas, cada um com capa própria.

export function safeAnexoHref(u: any): string | undefined {
  return typeof u === "string" && (/^https?:\/\//i.test(u) || u.startsWith("/")) ? u : undefined;
}

export type AnexoSection = { titulo: string; subtitulo?: string; pages: string[] };

/**
 * data: { propostaUrl?, propostaNome?, anexosContrato? } — mesmo shape do
 * previewContratoFromCotacao e do documentoHtml.
 * isCancelled: caller cancela via closure (efeito React desmontado).
 */
export async function buildAnexoSections(data: any, isCancelled: () => boolean): Promise<AnexoSection[] | null> {
  const pUrl = safeAnexoHref(data?.propostaUrl);
  if (!pUrl) return null;
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url" as any)).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const renderUrl = async (url: string, nome: string): Promise<string[]> => {
    const isPdf = /\.pdf($|\?)/i.test(url) || /\.pdf$/i.test(nome);
    if (!isPdf) {
      // Imagem: dataURL — URL relativa não resolve dentro do iframe srcDoc.
      const blob = await fetch(url).then(r => { if (!r.ok) throw new Error("fetch anexo"); return r.blob(); });
      const dataUrl = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(blob); });
      return dataUrl.startsWith("data:image/") ? [dataUrl] : [];
    }
    const doc = await pdfjs.getDocument(url).promise;
    const max = Math.min(doc.numPages, 30);
    const pages: string[] = [];
    for (let i = 1; i <= max; i++) {
      if (isCancelled()) return pages;
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) throw new Error("canvas 2d");
      await page.render({ canvasContext: ctx2d, viewport: vp } as any).promise;
      pages.push(canvas.toDataURL("image/jpeg", 0.85));
    }
    return pages;
  };
  // Rev. 5021 — mesma ordem/numeração oficial do PDF final: I proposta;
  // II projetos (por disciplina); III cronograma; IV+ outros — só o que existe.
  const romanos = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
  const ax: any = data?.anexosContrato || {};
  const sections: AnexoSection[] = [];
  const propostaPages = await renderUrl(pUrl, String(data?.propostaNome || pUrl));
  if (isCancelled()) return null;
  if (propostaPages.length) sections.push({ titulo: "ANEXO I — PROPOSTA COMERCIAL DA CONTRATADA", subtitulo: String(data?.propostaNome || "Proposta Comercial"), pages: propostaPages });
  let n = 1; // próximo número após a proposta (I)
  const projetos: any[] = Array.isArray(ax.projetos) ? ax.projetos.filter((p: any) => p?.disciplina && Array.isArray(p.arquivos) && p.arquivos.length) : [];
  if (projetos.length) {
    n += 1;
    for (const disc of projetos) {
      const pages: string[] = [];
      for (const a of disc.arquivos) {
        try { pages.push(...await renderUrl(safeAnexoHref(a.url) || "", String(a.nome || ""))); } catch { /* segue sem este arquivo */ }
        if (isCancelled()) return null;
      }
      if (pages.length) sections.push({ titulo: `ANEXO ${romanos[n - 1]} — PROJETOS: ${String(disc.disciplina).toUpperCase()}`, subtitulo: `${disc.arquivos.length} arquivo${disc.arquivos.length > 1 ? "s" : ""}`, pages });
    }
  }
  if (ax.cronograma?.url) {
    try {
      const pages = await renderUrl(safeAnexoHref(ax.cronograma.url) || "", String(ax.cronograma.nome || ""));
      if (isCancelled()) return null;
      if (pages.length) { n += 1; sections.push({ titulo: `ANEXO ${romanos[n - 1]} — CRONOGRAMA`, subtitulo: String(ax.cronograma.nome || ""), pages }); }
    } catch { /* segue sem */ }
  }
  for (const o of (Array.isArray(ax.outros) ? ax.outros : [])) {
    if (!o?.url || !o?.titulo) continue;
    try {
      const pages = await renderUrl(safeAnexoHref(o.url) || "", String(o.nome || ""));
      if (isCancelled()) return null;
      if (pages.length) { n += 1; sections.push({ titulo: `ANEXO ${romanos[n - 1]} — ${String(o.titulo).toUpperCase()}`, subtitulo: String(o.nome || ""), pages }); }
    } catch { /* segue sem */ }
  }
  return sections.length ? sections : null;
}
