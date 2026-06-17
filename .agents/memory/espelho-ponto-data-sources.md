---
name: Espelho de Ponto data sources vs atestado abono
description: Why a registered atestado/justificativa can still show "Falta" on the Espelho de Ponto
---

The **Espelho de Ponto** (`horasExtras.getEspelhoPontoRange` → `client/src/pages/EspelhoPonto.tsx` `getDayStatus`) classifies a day reading from a NARROW set of sources:
- `time_records` row for the day (its `tipoDia`: normal/feriado/atestado/bh — set only by the manual editor / ManualEntryDialog)
- `vacation_periods` (férias), `feriados`, employee dismissal date, cargo_confiança.

It does **NOT** consult the `atestados` table, nor `timecard_daily`, nor `ponto_descontos`.
If a day has no `time_records` row (or row with 0 worked hours) and isn't weekend/holiday/vacation → it defaults to **"Falta"**.

Registering an atestado (`controleDocumentos` → `abonarPontoPorAtestado`) writes the abono to a DIFFERENT layer:
- `atestados` table (the record itself)
- `timecard_daily` (`statusDia='atestado'`, `isFalta=0`, `atestadoId`) — payroll/fechamento layer
- `ponto_descontos` (`status='abonado'`)

It never touches `time_records.tipoDia`. So the abono never reaches the Espelho de Ponto.

**Why:** the "Relatório de Faltas" (`FechamentoPonto.tsx` via `pontoDescontos.atestadosMes`) cross-references the `atestados` table, so it correctly shows "Falta Justificada — Atestado Médico". The Espelho does not, so the SAME day shows red "Falta". This mismatch between the two screens is the symptom users report.

Extra gotcha: `timecard_daily` is populated only when fechamento/payroll runs for the período; for an unprocessed month it's EMPTY, so `abonarPontoPorAtestado`'s UPDATE affects 0 rows (silent) — but even with rows it wouldn't help the Espelho, which reads `time_records`.

**How to apply / fix path:** make `getEspelhoPontoRange` also load atestados overlapping the range (same pattern as `feriasDates`) and project an "atestado" status onto covered dates, so `getDayStatus` shows "Atestado" instead of "Falta". Read-only addition; no schema/ALTER/DROP/DELETE.
