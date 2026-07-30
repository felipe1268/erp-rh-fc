---
name: Meal benefit config vigência (effective-dating) pattern
description: How annual dissídio readjustments to meal_benefit_configs preserve history via close-old+insert-new instead of UPDATE in-place.
---

`meal_benefit_configs` (café/lanche/VA/janta) is effective-dated with `vigencia_inicio`/`vigencia_fim` (date, nullable, open-ended = current). Reads never query the raw table directly — they go through `server/services/mealBenefitResolver.ts`'s `resolveMealBenefitConfig(db, companyId, obraId, refDate)`, which does a 3-tier fallback: obra-specific vigente-at-date → company-wide vigente-at-date → any config (last resort, so VR is never silently zeroed by a vigência gap).

**Why:** the old design did `UPDATE` in-place on annual dissídio readjustment, which meant retroactive calculations (rescisão, past-month reports) picked up today's readjusted values instead of the values that were actually in effect at the time. The user hit this directly in a rescisão flow.

**How to apply:** any new write path to this table must follow the same rule — creating a new config for a scope (companyId+obraId) auto-closes the previously open one; readjustment logic closes the old row (vigencia_fim = day before the new effective date) and INSERTs a new row rather than mutating in place. Any new read site must call the resolver with the correct reference date for its context (rescisão date, payroll month, "today" for live screens) — never read the table raw or take "the current row" naively.

**Update (jul/2026):** por decisão do usuário, a config é ÚNICA por empresa (todos os CLTs iguais — fim da separação Escritório Central × obra). O seletor de obra saiu da UI; o fallback por obra do resolver continua existindo só p/ registros legados. A tela Configuração mostra só a vigente; encerradas caem automaticamente na guia "Histórico" (acinzentadas).
