---
name: Employee Direto/Indireto category source
description: Where the Direto/Indireto classification of a colaborador comes from (not employees.list)
---

# Classificação Direto/Indireto de colaborador

`employees.list` / `getEmployees` (server/db.ts) NÃO retorna o campo `categoria`.
Apenas `getEquipeObra` calcula `categoria` (via `categoriaDe`).

A verdade da classificação vive em `jobFunctions.categoriaMO`:
- `"indireta_obra"` ou `"escritorio_central"` → **Indireto**
- qualquer outro valor (ou função não cadastrada / sem categoriaMO) → **Direto** (default)

**How to apply:** para filtrar/classificar colaboradores por Direto/Indireto no client,
consulte `trpc.jobFunctions.list` e monte um Map `nome.trim().toUpperCase() → categoriaMO`,
casando com `employee.funcao` (fallback `cargo`). Não espere `categoria` vir do list de employees.

**Why:** evita reinventar a regra e evita a armadilha de assumir que `employees.list`
já traz a categoria — ele não traz.
