---
name: orcamentos valor_negociado snake_case
description: valor_negociado usa nome explícito snake_case no schema — queries raw SQL devem usar valor_negociado, não "valorNegociado".
---

# orcamentos — valor_negociado é snake_case

## A regra

`orcamentos.valorNegociado` é definido com nome explícito no Drizzle schema:
```typescript
valorNegociado: numeric("valor_negociado", { precision: 18, scale: 2 }).default("0"),
```
Portanto a coluna no Neon é `valor_negociado` (snake_case), **não** `"valorNegociado"`.

Todas as outras colunas de `orcamentos` (`obraId`, `companyId`, `totalVenda`, `totalCusto`, `tempoObraMeses`) são camelCase (sem nome explícito).

**Why:** `safe()` em `scorecard.ts` engole erros silenciosamente (`catch → return []`). Uma query que falha com "column does not exist" retorna `[]`, causando `return null` no procedure — o frontend exibe "Nenhum orçamento vinculado" sem nenhuma indicação de erro. O diagnóstico só foi possível adicionando logging ao safe().

**How to apply:** Em qualquer raw SQL que referencie `orcamentos`, usar `valor_negociado` (sem aspas duplas). Para as demais colunas, usar `"obraId"`, `"companyId"`, `"totalVenda"`, `"totalCusto"`, `"tempoObraMeses"` com aspas duplas.

**Lição geral:** Quando safe() engole erros e o resultado é silenciosamente vazio, adicionar logging temporário ao catch antes de mudar a lógica da query. A causa pode ser SQL inválido, não ausência de dados.
