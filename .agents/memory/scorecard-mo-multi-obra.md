---
name: Scorecard MO — equipe duplicada multi-obra
description: Funcionário aparecia em múltiplas obras simultaneamente no Scorecard; time_records puxava extras sem alocação formal.
---

## Problema 1 — Funcionário em múltiplas obras (custo duplicado)

`site_periods` Ramo B (obra_funcionarios sem employee_site_history) não tinha guard para o caso em que o mesmo employee_id estava em `obra_funcionarios` de VÁRIAS obras ao mesmo tempo (alocações sem transferência formal). O funcionário aparecia com 30 dias em CADA uma das obras.

**Fix**: Adicionado NOT EXISTS no Ramo B:
```sql
AND NOT EXISTS (
  SELECT 1 FROM obra_funcionarios of3
  WHERE of3."employeeId" = of2."employeeId"
    AND of3."companyId"  = of2."companyId"
    AND of3."obraId"    <> of2."obraId"
    AND of3."createdAt"  > of2."createdAt"
)
```
Garante que o funcionário só aparece na obra onde foi mais recentemente alocado.

**Why:** O botão "Transferir" na tela de Equipe atualiza employee_site_history, mas se o usuário apenas aloca sem transferir formalmente, o registro em obra_funcionarios fica em múltiplas obras.

**How to apply:** Sempre que o Scorecard RH/Folha exibir mais funcionários do que a tela de Equipe mostra, suspeitar deste padrão. A solução definitiva para o usuário é usar "Transferir" (não apenas "Alocar") ao mover funcionários entre obras.

## Problema 2 — Funcionários fantasma via time_records

`relevant_emp` fazia UNION com `time_records`, puxando qualquer pessoa que bateu ponto nesta obra mesmo sem alocação formal. Isso inflava o número de funcionários no Scorecard.

**Fix**: Removido o UNION com time_records do `relevant_emp`. O time_records continua como fallback de CONTAGEM DE DIAS (subquery GREATEST em payroll_frac), mas não define mais QUEM pertence à equipe.

**Why:** "Quem é da equipe" = quem está formalmente alocado (obra_funcionarios ou employee_site_history). Bater ponto é uma consequência, não uma definição de pertencimento.
