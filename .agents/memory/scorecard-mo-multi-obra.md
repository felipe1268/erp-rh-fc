---
name: Scorecard MO — equipe duplicada multi-obra e cross-company payroll
description: Dois padrões de falha no Scorecard RH/Folha; ambos causam "Sem dados" mesmo com folha processada.
---

## Problema 1 — NOT EXISTS excludia histórico (Ramo B)

`site_periods` Ramo B (obra_funcionarios sem employee_site_history) usava NOT EXISTS para excluir workers com alocação mais recente em outra obra. Isso resolvia a duplicação mas apagava todo o histórico da obra atual quando o worker era transferido → obras com alta rotatividade ficavam com `relevant_emp` vazio.

**Fix Rev. 4303**: substituído NOT EXISTS por COALESCE que fecha `periodo_fim` na data de nova alocação:
```sql
COALESCE(
  (SELECT MIN(of3."createdAt"::date) FROM obra_funcionarios of3
   WHERE of3."employeeId" = of2."employeeId" AND of3."companyId" = of2."companyId"
     AND of3."obraId" <> of2."obraId" AND of3."createdAt" > of2."createdAt"),
  CURRENT_DATE
) AS periodo_fim
```

**Why:** Anti-duplicata fica preservada via período fechado (custo proporcional), não via exclusão total.

## Problema 2 — Cross-company payroll invisível

`payroll_frac`, `vr_data`, `custos`, férias e seguro filtravam por `companyId = input.companyId` (empresa da obra). Mas a folha é gerada sob a empresa EMPREGADORA do funcionário (`employees.companyId`), que pode ser diferente da empresa da obra em grupos multi-empresa.

**Fix Rev. 4303**: substituído filtro fixo `pp."companyId" = input.companyId` por JOIN contra `employees` para usar o companyId real:
```sql
JOIN employees emp_folha ON emp_folha.id = pp."employeeId"
  AND pp."companyId" = emp_folha."companyId"
```
Mesmo padrão aplicado em: `payroll_payments`, `vr_benefits`, `vacation_periods`, `seguro_vida_coberturas`, e JOIN de `employees` no CTE `custos`.

**Why:** Segurança mantida: `relevant_emp` já é scoped à obra específica (via `obra_funcionarios.obraId + companyId`). Payroll só é buscado para employees DESSA obra, independente de qual empresa pagou.

**How to apply:** Se "Sem dados de folha" aparecer em obra com workers confirmados, verificar se a empresa da obra ≠ empresa empregadora dos funcionários. A solução é usar empresa do funcionário, não da obra.

## Problema 3 — Funcionários fantasma via time_records (histórico)

`relevant_emp` fazia UNION com `time_records`, puxando qualquer pessoa que bateu ponto nesta obra mesmo sem alocação formal → inflava o Scorecard.

**Fix (anterior)**: Removido o UNION com time_records do `relevant_emp`. O time_records continua como fallback de CONTAGEM DE DIAS (subquery GREATEST em payroll_frac), mas não define mais QUEM pertence à equipe.
