/**
 * Padronização de nomes de empresas (razão social / nome fantasia).
 *
 * Objetivo: não importa como o usuário digitar (TUDO MAIÚSCULO, tudo minúsculo,
 * misturado), o nome é sempre salvo em "Title Case" português culto, padronizando
 * a lista de fornecedores / empresas terceiras.
 *
 * Regras:
 *   1. Trim + colapsar espaços múltiplos.
 *   2. Lowercase de base e recapitalização palavra a palavra.
 *   3. Preposições/artigos/conectivos ficam minúsculos (exceto a 1ª palavra).
 *   4. Formas jurídicas e siglas conhecidas ficam MAIÚSCULAS (LTDA, ME, EPP, S/A...).
 *   5. Numerais romanos conhecidos ficam MAIÚSCULOS (II, III, IV...).
 *   6. Hífens e "&" preservados, capitalizando cada parte.
 *
 * Usado no backend (terceiros.empresas.create / update) e no frontend (onBlur dos
 * campos Razão Social / Nome Fantasia).
 */

const LOWER_WORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "a", "o", "as", "os",
  "com", "para", "no", "na", "nos", "nas", "ao", "aos", "à", "às", "ou",
]);

const UPPER_WORDS = new Set([
  "ltda", "ltda.", "me", "epp", "eireli", "mei", "ei", "sa", "s/a",
  "s.a", "s.a.", "cia", "cia.", "ss", "slu", "spe", "cnpj", "cpf",
]);

const ROMAN_WORDS = new Set([
  "ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "xii", "xiii", "xiv", "xv",
]);

/** Capitaliza um token, respeitando hífens internos (ex.: "santa-rita"). */
function capToken(w: string): string {
  if (!w) return w;
  return w
    .split("-")
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join("-");
}

/**
 * Converte um nome de empresa para Title Case português culto.
 * Idempotente: aplicar duas vezes dá o mesmo resultado.
 */
export function titleCaseEmpresa(input?: string | null): string {
  const trimmed = (input || "").trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  return trimmed
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (w === "") return w;
      if (UPPER_WORDS.has(w)) return w.toUpperCase();
      if (ROMAN_WORDS.has(w)) return w.toUpperCase();
      if (i > 0 && LOWER_WORDS.has(w)) return w;
      return capToken(w);
    })
    .join(" ");
}
