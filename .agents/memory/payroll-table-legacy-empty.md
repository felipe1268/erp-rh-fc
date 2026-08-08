---
name: Tabela payroll legada está vazia
description: Fonte real de holerites é payroll_payments; a tabela payroll nunca é escrita pelo motor atual
---
A tabela `payroll` está VAZIA para o sistema inteiro — o motor de folha atual grava em `payroll_payments` (holerites por competência, valores em formato BR e US misturados). Banco de horas vive em `banco_horas_saldo`/`banco_horas_lancamentos` (saldo keyed por employee+company).

**Why:** o Raio-X lia de `payroll` e `extra_payments` (HE em dinheiro) e sempre mostrava vazio — toda HE vira banco de horas, nunca é paga em dinheiro.

**How to apply:** qualquer leitura de folha por colaborador deve usar `payroll_payments` (+ filtro `companyId` — dossiê por obra compartilhada NÃO estabelece escopo de empresa, escopar por `emp.companyId`). Para HE de CLT, mostre banco de horas, não `extra_payments`.
