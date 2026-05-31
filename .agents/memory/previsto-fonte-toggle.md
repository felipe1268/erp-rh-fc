---
name: "% Previsto" motor vs manual toggle
description: How the Planejamento "% Previsto" curve switches between engine (Caminho B) and manual XML upload, and why the curve carries a `fonte` marker.
---

The "% Previsto" curve (`planejamento_projetos.previsto_semanas_json`) can come
from two sources, chosen by a GLOBAL per-company toggle
`oc_number_config.previsto_fonte` ('motor' | 'manual', default 'motor'):
- **motor** = `regenerarPrevistoSemanasCaminhoB` (computed from MSP baseline).
- **manual** = `regenerarPrevistoManual` (reads weekly XML uploads stored raw in
  `planejamento_projetos.previsto_manual_json`, % from PercentComplete column).

**Rule:** the generated curve JSON carries a `fonte:"motor"|"manual"` marker.
Old curves with no marker count as "motor". The `getProjeto`/`getProjetoById`
self-heal RECONCILES on read: if the curve's marker diverges from the global
fonte, it rebuilds lazily so flipping the toggle "just works" on next load.

**Why:** there is no event when the company flips the toggle — reconciliation has
to happen lazily on read. Without the marker the self-heal couldn't tell a manual
curve from a motor curve and would never rebuild.

**How to apply:**
- Any new writer of `previsto_semanas_json` MUST set the `fonte` marker, or the
  self-heal will think the curve is stale and rebuild it every read.
- When global=motor but the motor can't rebuild (zero baseline rows) AND the
  stored curve is still "manual", explicitly clear the curve (set null) so the UI
  falls back to "—" instead of showing a phantom manual curve.
- Manual upload mutations must be tenant-scoped (`assertProjetoRevisaoScope`):
  verify revision belongs to project and project belongs to user's company
  (admin/admin_master bypass) — same hardening as `salvarAtividades`.
