---
name: Validação TS sem tsc
description: Como validar mudanças TypeScript neste ERP quando o tsc completo não roda.
---

# Validação sem tsc

O `tsc` completo do projeto estoura OOM (heap) — não use para validar.

**Como aplicar:** após editar um arquivo `.ts`/`.tsx`, valide compilando-o
isolado via esbuild (bundle, externals para react/@/* etc.) e confirme exit 0.
Para remoções de blocos JSX/consts, faça também um `rg` com alternância real
(não `-F` com `\|`, que vira literal) para garantir zero referências órfãs aos
identificadores removidos.

**Why:** validação por esbuild é a convenção do projeto (registrada nas entradas
de `shared/changelog.ts`); pega erros de sintaxe/import sem o custo de memória do
type-check completo. esbuild NÃO faz type-check e NÃO acusa identificador
indefinido em runtime, por isso o grep de refs órfãs é complementar e necessário.
