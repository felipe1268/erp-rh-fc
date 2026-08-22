// Rev. 5108 — Prêmio de Compras escalonado (progressivo por faixas de economia)
// A economia da obra (% da meta) é fatiada por faixas; cada fatia do saving paga
// o percentual de prêmio da sua faixa (modelo progressivo, tipo imposto de renda).

export interface PremioFaixa {
  /** Limite superior da faixa em % de economia sobre a meta (null = sem limite / última faixa) */
  atePct: number | null;
  /** Percentual do saving desta fatia que vira prêmio */
  premioPct: number;
}

export const DEFAULT_PREMIO_FAIXAS: PremioFaixa[] = [
  { atePct: 3, premioPct: 5 },
  { atePct: 5, premioPct: 10 },
  { atePct: 10, premioPct: 15 },
  { atePct: null, premioPct: 20 },
];

/** Regra legada de percentual único → faixa única aberta (preserva o comportamento antigo). */
export function faixasFromLegacyPct(pct: number): PremioFaixa[] {
  const p = isFinite(pct) && pct >= 0 && pct <= 100 ? pct : 10;
  return [{ atePct: null, premioPct: p }];
}

/**
 * Resolve as faixas vigentes de uma regra persistida.
 * faixas_json vazio = regra criada antes do escalonamento → NÃO aplicar a tabela
 * default (mudaria a regra silenciosamente); preservar o percentual único da regra.
 */
export function resolveFaixasRegra(faixasJson: unknown, percentualLegado: number): PremioFaixa[] {
  const raw = typeof faixasJson === "string" ? faixasJson.trim() : faixasJson;
  if (!raw) return faixasFromLegacyPct(Number(percentualLegado));
  return parsePremioFaixas(raw);
}

/** Validação ESTRITA (para writes): última faixa aberta (atePct null), demais numéricas e estritamente crescentes. Retorna mensagem de erro ou null. */
export function validarFaixasEstrito(faixas: { atePct: number | null; premioPct: number }[]): string | null {
  if (!Array.isArray(faixas) || faixas.length < 1) return "Informe ao menos uma faixa.";
  if (faixas[faixas.length - 1].atePct !== null) return "A última faixa deve ser aberta ('acima de'), sem limite superior.";
  for (let i = 0; i < faixas.length; i++) {
    const f = faixas[i];
    if (!isFinite(f.premioPct) || f.premioPct < 0 || f.premioPct > 100) return "Percentual de prêmio deve estar entre 0 e 100.";
    if (i < faixas.length - 1) {
      if (f.atePct === null || !isFinite(f.atePct) || f.atePct <= 0) return "Apenas a última faixa pode ficar sem limite; as demais precisam de limite maior que zero.";
      if (i > 0 && f.atePct <= (faixas[i - 1].atePct as number)) return "Os limites de economia das faixas devem ser estritamente crescentes.";
    }
  }
  return null;
}

/** Parse tolerante do JSON persistido; inválido/vazio → default. */
export function parsePremioFaixas(raw: unknown): PremioFaixa[] {
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr) || !arr.length) return DEFAULT_PREMIO_FAIXAS;
    const out: PremioFaixa[] = [];
    for (const f of arr) {
      const ate = f?.atePct === null || f?.atePct === undefined || f?.atePct === "" ? null : Number(f.atePct);
      const pct = Number(f?.premioPct);
      if ((ate !== null && (!isFinite(ate) || ate <= 0)) || !isFinite(pct) || pct < 0 || pct > 100) return DEFAULT_PREMIO_FAIXAS;
      out.push({ atePct: ate, premioPct: pct });
    }
    // limites estritamente crescentes; só a última pode ser aberta (null)
    for (let i = 0; i < out.length; i++) {
      const cur = out[i];
      if (cur.atePct === null && i !== out.length - 1) return DEFAULT_PREMIO_FAIXAS;
      if (i > 0 && cur.atePct !== null && out[i - 1].atePct !== null && cur.atePct <= (out[i - 1].atePct as number)) return DEFAULT_PREMIO_FAIXAS;
    }
    if (out[out.length - 1].atePct !== null) out.push({ atePct: null, premioPct: out[out.length - 1].premioPct });
    return out;
  } catch {
    return DEFAULT_PREMIO_FAIXAS;
  }
}

/**
 * Prêmio progressivo da obra.
 * @param saldo   saving da obra em R$ (meta − comprado); ≤ 0 → prêmio 0
 * @param meta    meta de compras da obra em R$
 * @param faixas  tabela vigente
 * @param gatilhoMinPct economia mínima (% da meta) para o prêmio existir
 */
export function calcPremioProgressivo(saldo: number, meta: number, faixas: PremioFaixa[], gatilhoMinPct: number): { premio: number; pctEfetivo: number; economiaPct: number } {
  if (!(saldo > 0) || !(meta > 0)) return { premio: 0, pctEfetivo: 0, economiaPct: 0 };
  const economiaPct = (saldo / meta) * 100;
  if (economiaPct < gatilhoMinPct) return { premio: 0, pctEfetivo: 0, economiaPct };
  let premio = 0;
  let lower = 0;
  for (const f of faixas) {
    const upper = f.atePct === null ? Infinity : f.atePct;
    const slicePct = Math.min(economiaPct, upper) - lower;
    if (slicePct > 0) premio += (slicePct / 100) * meta * (f.premioPct / 100);
    lower = upper;
    if (economiaPct <= upper) break;
  }
  return { premio, pctEfetivo: (premio / saldo) * 100, economiaPct };
}

/** Rótulo textual de uma faixa, ex.: "até 3%", "3% a 5%", "acima de 10%". */
export function faixaLabel(faixas: PremioFaixa[], i: number): string {
  const f = faixas[i];
  const de = i === 0 ? 0 : faixas[i - 1].atePct ?? 0;
  const fmtN = (n: number) => String(n).replace(".", ",");
  if (f.atePct === null) return `acima de ${fmtN(de)}%`;
  if (i === 0) return `até ${fmtN(f.atePct)}%`;
  return `${fmtN(de)}% a ${fmtN(f.atePct)}%`;
}

/** Texto compacto da tabela p/ documentos, ex.: "até 3% → 5% · 3% a 5% → 10% · ...". */
export function faixasTexto(faixas: PremioFaixa[]): string {
  const fmtN = (n: number) => String(n).replace(".", ",");
  return faixas.map((f, i) => `${faixaLabel(faixas, i)} de economia → prêmio de ${fmtN(f.premioPct)}% dessa fatia do saving`).join("; ");
}
