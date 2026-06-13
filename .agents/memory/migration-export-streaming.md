---
name: Migração de dados — export/import
description: Como o ZIP de migração deve ser servido (streaming) e por que o import precisa de whitelist de identificadores
---

# Export/Import de migração

## Download grande = STREAMING, nunca buffer-em-RAM + upload + window.open
O export "completo" (banco + `uploaded_files` base64 + código-fonte) é grande demais
para montar o ZIP em memória, subir pro storage e abrir a URL — esse caminho dava
**"Fetch is aborted"** (timeout/limite do proxy + RAM).

**Regra:** sirva via rota Express `GET` que faz `archiver.pipe(res)` com
`Readable.from(asyncGenerator)`; pagine tabelas pesadas (`uploaded_files`) por `ctid`
LIMIT/OFFSET para nunca carregar todos os blobs de uma vez. Auth pelo COOKIE de
sessão (`sdk.authenticateRequest`) + gate de role — o browser baixa via `<a download>`
(mesma origem manda o cookie). ZIP é `application/zip` (incompressível) → o middleware
`compression` pula; resposta chunked → sem teto de ~32MB do proxy.

**How to apply:** qualquer export volumoso novo → rota GET streaming, não procedure
tRPC que devolve URL.

## Import: parâmetros NÃO protegem identificadores
No import, os nomes de TABELA e COLUNA vêm do JSON enviado pelo usuário. Placeholders
`$1` do node-postgres protegem só VALORES; interpolar `"${tableName}"`/`"${col}"` no SQL
é injeção. **Sempre** valide identificadores contra uma whitelist real
(`information_schema.columns` do schema `public`) + regex `^[A-Za-z_][A-Za-z0-9_]*$`
antes de montar o SQL; descarte o que não existir.

**Why:** code review reprovou exatamente por isso; um JSON malicioso poderia rodar SQL
destrutivo no banco de destino.

## Este app é PostgreSQL/Neon (não MySQL)
`migrationService.ts` nasceu em sintaxe MySQL (crases, `rows[0]`, `ON DUPLICATE KEY`,
lista fixa de tabelas) → toda query falhava. Em Postgres: aspas duplas em
identificadores, `result.rows`, auto-descoberta via `pg_tables`, upsert
`ON CONFLICT (id) DO UPDATE/NOTHING`. `db.$client` é o Pool node-postgres.
