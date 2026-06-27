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

**Readout vs axis tick (opposite of the sweep):** when a user asks for full BRL "com ponto e
vírgula" in a dashboard, switch only the VALUE READOUTS they actually read (ranking lists,
KPI cards, label/`extra` lines) `formatBRLCompact`→`formatBRL`. Keep the chart-axis
`tickFormatter` COMPACT on purpose — axes are scale guides on a narrow track and the shared
`BRLTooltip` already shows the full value on hover/tap; full numbers there overlap/clip.
**Why:** done this way in the Conciliação dashboard so precise amounts are legible without
breaking axis layout. **Scope trap:** `formatBRL`/`formatBRLCompact` live in
`dashboards/_kit.tsx` and feed ALL 5 financial dashboards — edit the call sites in the one
target screen, never the shared formatter, unless the change is meant to be global.

**Recharts responsiveness:** `ResponsiveContainer` won't shrink inside a CSS grid cell unless
the card root has `min-w-0` (grid items default `min-width:auto`), causing horizontal overflow
on narrow/iPad-portrait. `ChartCard` root carries `min-w-0 w-full` for this reason.
