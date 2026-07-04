---
name: Revision registry (Controle de Revisões)
description: Gotchas duráveis sobre como a tela "Controle de Revisões" é populada
---

# Registro de revisões (system_revisions)

A tela "Controle de Revisões" lê `system_revisions`, populada no startup por `syncRevisions`.

**Fonte de verdade = os blocos JSDoc `Rev. NNNN — ...` do topo de `shared/changelog.ts`**, NÃO o
array estruturado legado `CHANGELOG` (que congelou na Rev. 1878). Toda revisão futura se auto-registra
no startup desde que siga a convenção FC (bloco JSDoc no topo + bump de `version.ts`).

## Armadilhas (custaram tempo)
- **NÃO carregar `shared/changelog.ts` como MÓDULO** em nada que rode no startup: tem ~4.6MB e estoura
  o heap (app roda com `--max-old-space-size=1024`). Ler como TEXTO (`fs`) é leve.
- **Várias revisões compartilham UM único bloco `/** ... *​/`** (o 1º `*/` fica centenas de revisões
  abaixo). Ao fatiar o corpo de cada revisão, pare no PRÓXIMO header ou no `*/`, senão o `descricao`
  engole todas as seguintes (chegou a ~947KB por entrada).
- **Linhas de PROSA dentro de um corpo podem começar com `Rev. NNNN — ...`** (ex.: "Rev. 2479 — o
  screenshot..."). Distinção confiável: header real começa com maiúscula/`**`/dígito; prosa de
  continuação começa com letra MINÚSCULA — descarte essas.
- **`system_revisions.version` NÃO é UNIQUE** (só índice não-único). `ON CONFLICT (version)` não
  funciona; corrigir linhas é `UPDATE ... WHERE version=X` (nunca DELETE — R-001/R-007/R-010). Para
  backfill concorrente entre réplicas, serialize com `pg_advisory_lock`.

**How to apply:** valide via restart + DB (`getRegisteredRevisionVersions()` no Neon), não com
`tsc --noEmit` (estoura memória) nem importando o changelog num script tsx (OOM).

- **`extractData` casa o PRIMEIRO `dd/mm/yyyy` solto no CORPO da revisão como "data de publicação"**
  — se o corpo menciona uma data de negócio inválida (ex.: "29/02/2025", ano não-bissexto) ou
  qualquer dd/mm/yyyy que não seja data real de calendário, o INSERT do lote inteiro falha com
  `22008 date/time field value out of range` (silencioso, capturado por try/catch em
  `syncRevisions`, só aparece no log de startup). Evitar citar datas soltas em formato dd/mm/yyyy
  no corpo de um novo bloco JSDoc de revisão, ou usar formato por extenso quando for só exemplo.
