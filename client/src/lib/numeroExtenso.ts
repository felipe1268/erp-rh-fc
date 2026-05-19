/**
 * client/src/lib/numeroExtenso.ts
 *
 * Rev. 2115 — Helpers de formatação monetária pt-BR + valor por extenso.
 *
 * Uso típico em contratos/documentos institucionais:
 *
 *   import { formatBRL, valorPorExtenso } from "@/lib/numeroExtenso";
 *   const v = 3200;
 *   `R$ ${formatBRL(v)} (${valorPorExtenso(v)})`
 *   // → "R$ 3.200,00 (três mil e duzentos reais)"
 *
 * Cobre 0 → 999.999.999.999,99 (até bilhões com centavos).
 */

/** Normaliza entrada (string "3200.00" / "3.200,00" / number 3200) para number. */
export function parseValor(v: unknown): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (v === null || v === undefined) return 0;
  let s = String(v).trim();
  if (!s) return 0;
  // Remove "R$", espaços, NBSP
  s = s.replace(/R\$\s*/gi, "").replace(/\s|\u00A0/g, "");
  // Detecta formato BR (1.234,56) vs US (1234.56)
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // "1.234.567,89" — pontos são milhar, vírgula é decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // "1234,56" — vírgula é decimal
    s = s.replace(",", ".");
  }
  // else: já está em formato US (1234.56) ou inteiro
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

/** Formata em real brasileiro: 3200 → "3.200,00". */
export function formatBRL(v: unknown): string {
  const n = parseValor(v);
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// --- Valor por extenso ---

const UNIDADES = [
  "", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis",
  "dezessete", "dezoito", "dezenove",
];
const DEZENAS = [
  "", "", "vinte", "trinta", "quarenta", "cinquenta",
  "sessenta", "setenta", "oitenta", "noventa",
];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];

function trioPorExtenso(n: number): string {
  // n: 0..999
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto < 20) {
      partes.push(UNIDADES[resto]);
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      if (u === 0) partes.push(DEZENAS[d]);
      else partes.push(DEZENAS[d] + " e " + UNIDADES[u]);
    }
  }
  return partes.join(" e ");
}

/**
 * Converte um valor monetário em extenso pt-BR.
 * Ex: 3200 → "três mil e duzentos reais"
 *     1234.56 → "um mil, duzentos e trinta e quatro reais e cinquenta e seis centavos"
 *     1 → "um real"
 *     0.50 → "cinquenta centavos"
 *     0 → "zero real"
 */
export function valorPorExtenso(v: unknown): string {
  const num = parseValor(v);
  const abs = Math.abs(num);
  // Arredonda pra 2 casas pra evitar lixo de ponto flutuante
  const cents = Math.round(abs * 100);
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;

  if (reais === 0 && centavos === 0) return "zero real";

  const escalas = [
    { sing: "bilhão", plur: "bilhões" },
    { sing: "milhão", plur: "milhões" },
    { sing: "mil", plur: "mil" },
    { sing: "", plur: "" },
  ];

  // Quebra em trios (até 999.999.999.999)
  const trios = [
    Math.floor(reais / 1_000_000_000) % 1000,
    Math.floor(reais / 1_000_000) % 1000,
    Math.floor(reais / 1_000) % 1000,
    reais % 1000,
  ];

  const partesReais: string[] = [];
  for (let i = 0; i < trios.length; i++) {
    const t = trios[i];
    if (t === 0) continue;
    const ext = trioPorExtenso(t);
    const esc = escalas[i];
    if (i === trios.length - 1) {
      // Trio das unidades
      partesReais.push(ext);
    } else if (esc.sing === "mil") {
      // "mil" não pluraliza nem precisa de "um" antes (1000 = "mil", não "um mil")
      // Mas alguns contratos usam "um mil" — vamos manter "mil" puro pra ficar natural
      if (t === 1) partesReais.push("mil");
      else partesReais.push(ext + " mil");
    } else {
      partesReais.push(ext + " " + (t === 1 ? esc.sing : esc.plur));
    }
  }

  // Junta com vírgulas e "e" antes do último (regra pt-BR)
  let textoReais = "";
  if (partesReais.length === 1) {
    textoReais = partesReais[0];
  } else if (partesReais.length > 1) {
    // Caso especial: se o último trio é < 100 ou múltiplo exato de 100,
    // usa "e" no lugar da vírgula. Senão, vírgula.
    const ultimoTrio = trios[trios.length - 1];
    const usarE = ultimoTrio > 0 && (ultimoTrio < 100 || ultimoTrio % 100 === 0);
    const head = partesReais.slice(0, -1).join(", ");
    const tail = partesReais[partesReais.length - 1];
    textoReais = usarE ? `${head} e ${tail}` : `${head}, ${tail}`;
  }

  const sufixoReais = reais === 1 ? "real" : "reais";
  const sufixoCentavos = centavos === 1 ? "centavo" : "centavos";

  if (reais > 0 && centavos > 0) {
    return `${textoReais} ${sufixoReais} e ${trioPorExtenso(centavos)} ${sufixoCentavos}`;
  }
  if (reais > 0) {
    return `${textoReais} ${sufixoReais}`;
  }
  // só centavos
  return `${trioPorExtenso(centavos)} ${sufixoCentavos}`;
}
