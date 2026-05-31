---
name: Curva S week-keying & earned-value pitfalls
description: Planejamento Curva S pitfalls — blue baseline must read the whole previsto_semanas snapshot (not inject Texto10 at one point), and BCWS/BCWP must share a data-date.
---

## Blue baseline = read `previsto_semanas.raiz` whole; DON'T inject Texto10 per-activity at one point
The blue Baseline/Previsto line of the Work Curva S must BE the canonical `previsto_semanas`
snapshot — the SAME source the header reads via `previstoCurva.raizAt(statusDate)` — read in
full and re-keyed week-by-week, NOT the date-fraction curve with a single overridden point.
**Why:** an earlier attempt (Rev. 2650) tried to make the blue line pass through the header's
%Previsto by injecting the per-activity Texto10 snapshot into ONE week (the status week) inside
`gerarCurvaPlanejadaMSP`, leaving every other week on the date-fraction source. Two sources on
one line → the status-week point fell off the smooth trajectory = a non-monotonic dip/step
("curva S não pode regredir"). The fix (Rev. 2651): in `getCurvaS`, helper
`curvaPrevistoSnapshot` reads `previsto_semanas_json` (`semanas[]` cutoff=Thursday + `raiz[]`,
already monotonic), re-keys each cutoff to its Monday via `toMondayStr` (aligns with the green
realizado axis), prepends a zero point, and applies a defensive monotonic clamp.
**How to apply:** any curve line that must agree with the header/cards %Previsto should read the
ONE canonical snapshot (`previsto_semanas.raiz`) end-to-end, never mix it with a second
per-point source. Gate it to the snapshot's owning revision (`revisaoId`; legacy snapshots
without `revisaoId` only apply to the active `input.revisaoId`) and to duration mode
(`usarPesoPorDuracao` — `raiz` is duration-weighted). `gerarCurvaPlanejadaMSP` is now ONLY the
fallback by dates for projects lacking the snapshot.

## BCWS and BCWP must be measured at the SAME data-date
The financial Curva S card (`PlanejamentoDetalhe.tsx`) showed BCWS = R$0 with a phantom
"+R$… adiantado" desvio. Root cause: BCWS (`finPrevHoje`) was read at `todayLocalISO()`,
but a project that hasn't started relative to today has no `semana <= hoje` with planned
cost → R$0, while BCWP was read at the last week with realizado. Different reference weeks =
nonsense schedule variance.
**Rule:** for earned-value (SV = BCWP − BCWS) both must be taken at the same reference week —
anchor BCWS to the last week with realizado (`lastRealPoint.semana`), falling back to today
only when there is no realizado at all.

## Work curve vs Financial curve will differ — that's expected, not a bug
Work Curva S = % weighted by DURATION using the MSP snapshot for realizado. Financial Curva S
= R$ weighted by peso financeiro with BCWP coming from the weekly avancos (not the snapshot).
Different metrics → small divergences are normal; don't "fix" them into equality.
