---
name: Planejamento previsto curve revision coupling
description: Cross-file invariant linking the client previsto-curve revision guard to the server self-heal target revision.
---

The PREVISTO curve (CAMINHO B) lives in a single project-level JSON column
(`previsto_semanas_json`) but is specific to ONE revision (it embeds that
revision's `revisaoId` and per-activity baseline). The client only trusts the
curve when its `revisaoId` equals the displayed `revisaoAtiva.id`; on mismatch
the whole curve is discarded so cards AND the per-activity grid fall back
uniformly (never mix "aggregate-from-curve" with "rows-from-legacy-snapshot").

**Why:** if the server self-heal regenerates the curve for a *different*
revision than the one the client treats as active, the client's revision guard
never matches and the curve is silently ignored — the original ~1% freeze bug
reappears with no error.

**How to apply:** the client `revisaoAtiva` = last aprovada (highest `numero`),
else the first revision. The server self-heal in `getProjetoById` MUST pick the
SAME target (`aprovadas[aprovadas.length-1] ?? revs[0]`), reading the same
`proj.revisoes` array (ordered by `numero ASC`). Do NOT prefer `is_baseline` for
the self-heal target — that can diverge from `revisaoAtiva`. If you change how
either side selects the active revision, change both in lockstep.

Self-heal writes the same JSON column via an app function (an UPDATE, allowed) —
it is NOT an ALTER/DROP/DELETE, so it respects R-001/R-007/R-010. Guard it with
a baseline-leaf COUNT before regenerating so baseline-less projects don't rewrite
null→null on every read.

**Deleting/clearing a cronograma must clear the previsto in lockstep.** Any
mutation that wipes a revision's activity rows (`limparCronograma`, and by the
same logic `excluirRevisao`) MUST also clear `previsto_semanas_json` AND the MSP
snapshot in `calendario_json` (via `limparSnapshotMspDoProjeto`) when the stored
curve belongs to that revision (`snap.revisaoId === input.revisaoId`). Otherwise
the top bar "Avanço Físico" keeps showing the old Previsto (e.g. 18,37%) with 0
activities, because it reads the curve first and falls back to the snapshot —
deleting only the activity rows leaves both alive.
**Why:** the curve + snapshot are project-level columns, decoupled from the
activity rows; nothing cascades. **How to apply:** gate the clear on the
revisaoId match so curves of OTHER revisions survive; do it best-effort
(try/catch that only logs) so the core deletion never fails because of it.
