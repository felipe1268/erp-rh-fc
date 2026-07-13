---
name: payroll/HR tables camelCase
description: payroll_payments, employee_site_history, vr_benefits, vacation_periods são camelCase; seguro_vida_coberturas é snake_case.
---

## Regra

As tabelas de RH/Folha criadas via self-heal são camelCase. Qualquer query raw SQL deve usar aspas duplas.

## Mapeamento confirmado (diagnóstico direto no Neon)

**`employee_site_history`** — camelCase:
- `obra_id` → `"obraId"`
- `company_id` → `"companyId"`
- `employee_id` → `"employeeId"`
- `data_inicio` → `"dataInicio"`
- `data_fim` → `"dataFim"`

**`payroll_payments`** — camelCase:
- `company_id` → `"companyId"`
- `employee_id` → `"employeeId"`
- `mes_referencia` → `"mesReferencia"`
- `salario_bruto_mes` → `"salarioBrutoMes"`
- `horas_extras_valor` → `"horasExtrasValor"`
- `adicionais_valor` → `"adicionaisValor"`
- `desconto_inss` → `"descontoInss"`
- `desconto_fgts` → `"descontoFgts"`
- `total_proventos` → `"totalProventos"`
- `total_descontos` → `"totalDescontos"`
- `salario_liquido` → `"salarioLiquido"`
- `status` → `status` (mesmo)

**`vr_benefits`** — camelCase:
- `company_id` → `"companyId"`
- `employee_id` → `"employeeId"`
- `mes_referencia` → `"mesReferencia"`
- `valor_total` → `"valorTotal"`
- `valor_va` → `"valorVa"`

**`vacation_periods`** — camelCase:
- `company_id` → `"companyId"`
- `employee_id` → `"employeeId"`
- `data_inicio` → `"dataInicio"`
- `data_fim` → `"dataFim"`
- `data_pagamento` → `"dataPagamento"`
- `valor_total` → `"valorTotal"`
- `status` → `status` (mesmo)

**`seguro_vida_coberturas`** — snake_case (EXCEÇÃO):
- `company_id`, `employee_id`, `status`, `data_adesao` etc. são snake normais

## Por que é silencioso

Quando o PostgreSQL não encontra uma coluna, em contextos como `safe(query)` ou `db.execute` sem handling explícito, a query retorna 0 linhas em vez de lançar exceção visível no frontend. O resultado é "Sem dados" em vez de "Erro".

## Como aplicar

Em CTEs, use alias snake_case nos outputs para não propagar o camelCase downstream:
```sql
SELECT
  esh."employeeId"   AS employee_id,
  esh."dataInicio"::date AS periodo_inicio,
  ...
FROM employee_site_history esh
```
