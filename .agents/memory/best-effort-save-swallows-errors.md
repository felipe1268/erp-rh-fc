---
name: Best-effort save swallowing schema errors
description: Why "não está salvando" bugs in this ERP can hide a silent DB error, not just an upstream failure
---

# "Não está salvando" pode ter DUAS causas independentes

Quando o usuário relata que algo "não está salvando" (ex.: Histórico de
Efetivo×IA no Planejamento), investigar SEMPRE os logs de runtime do workflow,
não só o caminho de timeout/IA.

**Why:** persistências best-effort neste ERP usam `try/catch` que só faz
`console.error(...)` e segue (para nunca derrubar a resposta principal). Isso
esconde erros REAIS de banco. Um caso concreto: o INSERT falhava com
`value too long for type character varying(N)` porque um campo de texto gerado
por IA (uma frase de diagnóstico) era gravado numa coluna estreita (`varchar(40)`)
SEM truncar — enquanto colunas vizinhas (`titulo`/`obra`) já eram cortadas com
`.slice(...)`. O erro era engolido e nada aparecia no Histórico.

**How to apply:**
- Texto vindo de LLM destinado a coluna `varchar(N)` estreita DEVE ser truncado
  com `.slice(0, N)` no ponto de gravação. O texto completo costuma já viver numa
  coluna `json`/`text` (ex.: `resultado`), então truncar o rótulo curto é seguro.
- Não dá pra alargar a coluna: R-001/R-007/R-010 proíbem `ALTER/DROP/DELETE`.
  A correção é sempre code-side (truncar), não schema-side.
- Para confirmar a causa raiz de um INSERT best-effort que falha, reproduza o
  INSERT direto via SQL (com o valor longo) — a mensagem do Drizzle só diz
  "Failed query", a causa real (constraint/tipo) vem do Postgres.
