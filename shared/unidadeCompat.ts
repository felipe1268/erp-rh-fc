// Rev. 4792 — Compatibilidade de UNIDADES entre levantamento e planilha.
// Poka-Yoke: vincular um trecho medido em m² a um item da planilha em m
// geraria quantitativo errado silenciosamente. Normalizamos variações comuns
// (m2/m², ml/m, un/und/unid/pç…) e comparamos.

export function normalizarUnidade(u: string | null | undefined): string {
  if (!u) return "";
  let s = String(u).toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // sem acento
    .replace(/[.\s]/g, "");
  // sinônimos
  if (s === "m2" || s === "m²") return "m2";
  if (s === "m3" || s === "m³") return "m3";
  if (s === "ml" || s === "m" || s === "metro" || s === "metrolinear") return "m";
  if (["un", "und", "unid", "unidade", "pc", "pç", "pca", "pça", "peca", "pecas"].includes(s)) return "un";
  if (["vb", "verba", "gb", "glb", "global"].includes(s)) return "vb";
  if (s === "kg" || s === "quilo") return "kg";
  if (s === "cj" || s === "conj" || s === "conjunto") return "cj";
  if (s === "h" || s === "hr" || s === "hora" || s === "horas") return "h";
  return s.replace("²", "2").replace("³", "3");
}

/** true quando dá para vincular sem risco (ou quando falta unidade de um dos lados). */
export function unidadesCompativeis(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarUnidade(a), nb = normalizarUnidade(b);
  if (!na || !nb) return true; // sem informação suficiente p/ travar
  return na === nb;
}
