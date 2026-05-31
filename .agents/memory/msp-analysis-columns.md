---
name: MSP columns — planejamento previsto/realizado both from % Concluída
description: Intended ERP design for planejamento — same MSP column feeds both previsto and realizado
---

# Planejamento — previsto E realizado saem da MESMA coluna % Concluída

In the FC Engenharia planejamento XML (MS Project export):

- **% Concluída** = native field `PercentComplete`. Manually set by the planner. Source of truth.
- **% PREVISTO** = custom field `Texto6` (FieldID 188743746, `ProjDateDiff` formula). **NOT used in the intended design — ignore it.**

## Intended ERP design (user-stated, supersedes the Caminho B "% PREVISTO = Texto6" rule in replit.md)

- **No cadastro do cronograma:** ERP reads **% Concluída** and stores it as the **PREVISÃO de avanço** in a separate internal table ("avanços previsto"). The cadastro "modelos" are MSP files where the planner ran Atualizar Projeto so % Concluída = planned cumulative per StatusDate (e.g. 2/9/15/20 % for the 4 weeks).
- **Na aba Avanço Semanal:** ERP reads the **same % Concluída** column (now = activities actually done in the week/period) and stores as **REALIZADO**.
- **Mesma coluna nos dois momentos** = previsto e realizado comparáveis maçã-com-maçã. This is the WHOLE point.

**Why the old divergence:** current ERP derives previsto from the Texto6 formula (3/6/10/14) but realizado from PercentComplete (2/9/15/20) → two different columns → never matched. Fix = previsto also from % Concluída.

**Open question (confirm before building):** at cadastro, how does the weekly previsto curve arrive — multiple weekly files (one % Concluída per week, like the 4 modelos), or one file the ERP must distribute?
