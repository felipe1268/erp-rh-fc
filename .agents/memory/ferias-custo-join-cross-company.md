---
name: Férias custo via JOIN cross-company
description: Bug onde custo estimado de férias mostrava valor errado (ex: R$42,41) porque empSalarioMap perdia funcionários de empresa irmã do grupo.
---

## O problema

`feriasCustoProximo` em `homeData.ts` construía um `empSalarioMap` a partir de `allEmps`, que era filtrado por `companyFilter(employees.companyId, input)`. Quando os funcionários com férias agendadas pertencem a uma empresa irmã do grupo (companyId diferente do input), `empSalarioMap.get(v.employeeId)` retornava `undefined → 0`, zerando o custo estimado de todos eles.

Só o registro que já tinha `valorTotal` processado pela folha contribuía — causando o valor absurdamente baixo.

## O fix

O `allVacations` já fazia INNER JOIN com `employees`. Bastou adicionar `empSalarioBase: employees.salarioBase` no `select()`. O `reduce` passou a usar `v.empSalarioBase` diretamente, sem depender do `empSalarioMap`.

**Why:** O `companyFilter` é necessário para o tenant-gate das vacation_periods, mas não pode filtrar os funcionários de referência — esses vêm de empresas irmãs que compartilham recursos.

**How to apply:** Qualquer agregação que precise de dado do funcionário e use vacation_periods (ou outra tabela com companyFilter) deve buscar o dado via JOIN no mesmo select, não via Map separado de `allEmps`.

## salarioBase é varchar BR

A coluna `employees.salarioBase` é `varchar({ length: 20 })` e pode conter formato BR (`"3.500,00"`). Use sempre `parseSalarioBR()`:

```ts
const parseSalarioBR = (val: any): number => {
  if (!val) return 0;
  const str = String(val).trim();
  if (!str.includes(',')) return parseFloat(str) || 0;
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
};
```
