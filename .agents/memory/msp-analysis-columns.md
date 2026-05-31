---
name: MSP columns — % Concluída vs % Previsto
description: Which MSP column to trust when analyzing this ERP's planejamento XML uploads
---

# MSP "% Concluída" vs "% PREVISTO"

In the FC Engenharia planejamento XML (MS Project export), two distinct columns:

- **% Concluída** = native field `PercentComplete`. **Typed by the planner** = the REAL progress (realizado). The ERP's "Avanço Semanal" reads this column.
- **% PREVISTO** = custom field `Texto6` (FieldID 188743746), Alias "% PREVISTO", a `ProjDateDiff` formula (planned/forecast). MSP's `int()` TRUNCATES (not rounds), so 6.99% → 6%.

**User preference (durable):** when analyzing these MSP files, ALWAYS read **% Concluída (`PercentComplete`)** and IGNORE the **% PREVISTO (Texto6)** column.
**Why:** the planner enters % Concluída manually and treats it as the source of truth for progress; the Texto6 forecast is auto-calculated and not what they track.
**How to apply:** any future MSP-XML analysis/comparison for this project → report PercentComplete per StatusDate, not Texto6.
