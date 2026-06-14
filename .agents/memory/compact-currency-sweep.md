---
name: Sweeping out compact/abbreviated currency formatters
description: How to find ALL "R$ X mil/mi/K/M/k" formatters in this ERP — grep by output pattern, not by name.
---

Compact currency formatters are scattered under MANY ad-hoc names across `client/src`
(`BRLk`, `BRLShort`, `fmtBRLShort`, `fmtBRLAxis`, `fmtK`, `formatBRL(v,compact)`,
`finTickFmt`, plus anonymous inline `tickFormatter`/`LabelList formatter`).

**Rule:** to find them all, grep by the ABBREVIATION OUTPUT pattern, not by formatter name.
Patterns that catch them: `+ "k"` / `+ "M"`, `}k\`` / `}M\`` / `} mil\`` / `} mi\``,
`/1e6)...M`, `/1e3)...k`, `/1_000`, `/1_000_000`. Grepping by name (`BRLk` etc.) MISSES
the inline ones and the `finTickFmt` locals defined deep inside component bodies.

**Why:** Rev. 3067 standardized everything to full BRL (`R$ X.XXX,XX` via
`toLocaleString("pt-BR",{style:"currency",currency:"BRL"})`). A name-based grep looked clean
but a code review still found a live `finTickFmt` (compact) + a `maximumFractionDigits:0` BRL.

**Gotchas — these `/1000` uses are NOT currency, leave them:** seconds (ProcessosTrabalhistas/
Migration/Locados/Oraculo), km (PrecosCombustivel), `mm` rainfall (chuva), and the "mil" por
extenso in contracts (numeroExtenso.ts/contratoPjDocument.ts/ContratoPJView.tsx).

**How to apply:** when widening a `<YAxis>` from compact→full, bump its `width` (~108, or ~116
for accumulated/millions axes) or the full value clips. Always `rg` scoped to `client/src`
(changelog.ts/*.md grep times out).
