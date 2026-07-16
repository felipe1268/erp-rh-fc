---
name: Scorecard MO — equipe duplicada multi-obra
description: Funcionário aparecia em múltiplas obras simultaneamente no Scorecard; time_records puxava extras sem alocação formal.
---

## Problema 1 — Funcionário em múltiplas obras (custo duplicado)

`site_periods` Ramo B (obra_funcionarios sem employee_site_history) não tinha guard para o caso em que o mesmo employee_id estava em `obra_funcionarios` de VÁRIAS obras ao mesmo tempo (alocações sem transferência formal). O funcionário aparecia com 30 dias em CADA uma das obras.

**Fix Rev. 4303 (substitui fix anterior)**: Em vez de NOT EXISTS (que excluía completamente o histórico do funcionário na obra quando ele se movia para outra), usa COALESCE que fecha o `periodo_fim` na data de alocação mais recente em outra obra:
```sql
COALESCE(
  (SELECT MIN(of3."createdAt"::date)
   FROM obra_funcionarios of3
   WHERE of3."employeeId" = of2."employeeId"
     AND of3."companyId"  = of2."companyId"
     AND of3."obraId"    <> of2."obraId"
     AND of3."createdAt"  > of2."createdAt"),
  CURRENT_DATE
) AS periodo_fim
```

**Why:** O fix anterior com NOT EXISTS resolvia a duplicação mas causava efeito colateral grave: obras com alta rotatividade (todos os workers transferidos) ficavam com `relevant_emp` vazio → "Sem dados de folha". O novo fix preserva a anti-duplicata via período fechado — o custo é proporcionalizado só aos meses em que o funcionário estava nesta obra.

**How to apply:** Se "Sem dados de folha" aparecer em obra com workers históricos, suspeitar de Ramo B. A solução definitiva para o usuário é usar "Transferir" (não apenas "Alocar") ao mover funcionários — isso cria `employee_site_history` e usa o Ramo A (mais preciso).

## Problema 2 — Funcionários fantasma via time_records

`relevant_emp` fazia UNION com `time_records`, puxando qualquer pessoa que bateu ponto nesta obra mesmo sem alocação formal. Isso inflava o número de funcionários no Scorecard.

**Fix**: Removido o UNION com time_records do `relevant_emp`. O time_records continua como fallback de CONTAGEM DE DIAS (subquery GREATEST em payroll_frac), mas não define mais QUEM pertence à equipe.

**Why:** "Quem é da equipe" = quem está formalmente alocado (obra_funcionarios ou employee_site_history). Bater ponto é uma consequência, não uma definição de pertencimento.
