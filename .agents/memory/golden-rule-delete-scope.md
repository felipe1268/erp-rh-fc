---
name: Escopo real da Regra de Ouro (ALTER/DROP/DELETE)
description: O que a regra "JAMAIS ALTER/DROP/DELETE" proíbe de fato — DDL de schema, não CRUD de runtime.
---

A regra "R-001/R-007/R-010: JAMAIS executar ALTER TABLE, DROP, ou DELETE" + o
mantra "só CREATE TABLE / ADD COLUMN IF NOT EXISTS" se refere a **DDL de
schema / self-heal / migrações** que o AGENTE escreve (bloco `[SyncSchema+]`,
ColFix). NÃO proíbe o `db.delete(...)` de uma única linha disparado pelo USUÁRIO
em CRUD normal.

**Why:** o app inteiro depende de `db.delete()` físico para remoções CRUD
(ex.: `excluirMedicao`, `removerMedicaoItem`, `excluirContrato` em
`server/routers/terceiroContratos.ts` — todos `db.delete`). Trocar um único
endpoint novo (ex.: `excluirFdTerceiro`) por soft-delete seria INCONSISTENTE com
o módulo e ainda criaria órfãos. Um code-review (architect) marcou isso como
"bloqueante" por ler a regra fora de contexto — não é.

**How to apply:** ao adicionar um endpoint de remoção CRUD, siga o padrão do
router (db.delete físico + tenant guard `_assertCompanyAccess` + checagem de
ownership da linha). A regra só morde quando você for escrever DDL destrutivo no
self-heal/migração — aí sim use só CREATE TABLE / ADD COLUMN IF NOT EXISTS.
