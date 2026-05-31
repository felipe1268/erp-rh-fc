---
name: Planejamento previsto — duration-weighted % Concluída rollup
description: How to reproduce MSP's % Concluída (PercentComplete) curve for the ERP previsto, from a single baseline file
---

# Planejamento — previsto E realizado da MESMA coluna % Concluída

In the FC Engenharia planejamento XML (MS Project export):

- **% Concluída** = native `PercentComplete`. The column the user trusts. Source of truth for BOTH previsto and realizado.
- **% PREVISTO** = custom `Texto6` (FieldID 188743746, ProjDateDiff formula). **Ignore — not used in the intended design.**

## Intended ERP design (user-stated; supersedes the Caminho B "% PREVISTO = Texto6" rule)

- **Cadastro do cronograma:** user uploads ONE baseline file. ERP GENERATES the weekly previsto curve and stores it in a separate internal "avanços previsto" table.
- **Aba Avanço Semanal:** ERP reads the SAME % Concluída column (now = real progress) → realizado.
- Same column both moments → previsto e realizado comparáveis.

## VALIDATED algorithm to generate previsto from a single baseline file

For each weekly cutoff (Thursday 17:00) the root previsto = MSP's native summary `PercentComplete` rollup:

1. Per leaf (Summary≠1, with Baseline Number=0 Start/Finish):
   - `dur_i` = working minutes PDD(BLstart_i, BLfinish_i) over the project calendar (cal 6: Mon–Thu 540min, Fri 480min, holidays; no June holiday).
   - `pct_i(week)` = clamp( PDD(BLstart_i, week_status_17h) / dur_i , 0, 1 ).
2. Root = **round( Σ(dur_i × pct_i) / Σ(dur_i) × 100 )** — **DURATION-weighted, ROUNDED** (not floor, not work/cost-weighted).

Reproduces MSP exactly: 04/06=2, 11/06=9, 18/06=15, 25/06=20 (project PLN_816 R04 baseline 01/06→03/12/2026).

**Why it diverged before:** current `regenerarPrevistoSemanasCaminhoB` root = `floor(pctRaizMSP)` = pure calendar-time-elapsed over the WHOLE envelope (3/6/10/14), while realizado came from PercentComplete (2/9/15/20) → two different bases. Fix = root previsto via duration-weighted rounded rollup above.

**PRECISION CAVEAT (critical):** exact parity (2/9/15/20) needs MINUTE-level PDD with the real baseline TIMES (e.g. 07:00→16:00) AND per-weekday working intervals (Fri=480min not 540, lunch break). But the ERP stores baseline as `date()` only (import `fmtDate` truncates the time) and `calendarioJson` is DAY-granular (only weekDays + defaultStart/FinishTime + minutesPerDay, no per-weekday intervals). With date-only + day-granular the rollup drifts: week-4 = 21.7→22% instead of 20%. So a true fix requires ALSO capturing baseline timestamps + full per-weekday calendar at import — not just swapping the root formula. The duration-weighted day-granular version is "much closer but ~1-2pp off on later weeks".
