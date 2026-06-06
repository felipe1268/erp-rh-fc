---
name: AI module toggle enforcement
description: Per-company on/off for each module's AI features; how the gate is enforced and which sinks are intentionally ungated.
---

# AI module toggle (Configurações › Inteligência Artificial)

A per-company switch enables/disables AI per module. Table `ai_module_config`,
helper `server/_core/aiConfig.ts` (`isAiModuleEnabled` / `assertAiModuleEnabled`).

**Rule:** every USER-TRIGGERED AI endpoint must call `assertAiModuleEnabled(companyId, modulo)`
as its first instruction (after any company-access guard). There is NO automatic interception
in `invokeLLM`/`invokeAnthropicVision`/`invokeGeminiVision` — new AI endpoints must add the gate
themselves or they silently bypass the toggle.

**Why:** the helper is PERMISSIVE (no resolvable companyId / no config row = enabled), so a
missing gate is invisible until someone disables the module and the feature keeps running.

**How to apply / gotchas:**
- For project-scoped endpoints (planejamento/iaCronograma), resolve the REAL companyId from the
  project row via `companyIdDoProjeto(projetoId)` — `ctx.user.companyId` is empty for admin-master,
  so gating on it would never enforce.
- Audit by SINK, not by endpoint name: grep every `invokeLLM`/`invoke*Vision` call and map it to its
  enclosing procedure. Code review repeatedly found bypasses this way (1 endpoint gated per module is
  NOT enough).
- Intentionally UNGATED in compras: `classificarTipoControleIA` and the embalagem resolver
  (`getConversaoIA`) — background helpers auto-fired during item creation (a non-AI flow); gating
  them would break item creation.
- Mixed endpoints: `compras.buscarPorCodigoBarras` keeps the local DB lookup always-on and gates
  ONLY the IA fallback branch (use `isAiModuleEnabled` returning found:false, not assert/throw).
