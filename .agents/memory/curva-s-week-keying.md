---
name: Curva S week-keying & earned-value pitfalls
description: Two recurring bugs in Planejamento Curva S — status-week anchoring of the MSP snapshot, and BCWS/BCWP must share a data-date.
---

## Snapshot Texto10 must anchor to the STATUS WEEK, not an exact day
The baseline curve (`gerarCurvaPlanejadaMSP` in `server/routers/planejamento.ts`) overlays
the MSP %Previsto (Texto10) snapshot at the status point. The MSP `statusDate` in the XML
falls on a working day (e.g. Thursday), but the curve iterates weeks by Monday and the
per-week marker is the Sunday. Comparing `sunday === statusDate` therefore NEVER matches →
the baseline silently falls back to the date-fraction value and sits ABOVE the realizado
even when header says Previsto = Realizado.
**Rule:** anchor to the week via `toMondayStr(statusDate)` and compare against the loop's
Monday (`cur === statusMonday`). This mirrors how `curvaRealizada` already anchors the
realizado snapshot. Any curve line that should pass through the snapshot at the status point
must use the same week key, or it won't overlap.

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
