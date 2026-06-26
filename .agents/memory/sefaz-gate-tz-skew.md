---
name: timestamp-without-tz read under TZ=America/Sao_Paulo skews JS time math by 3h
description: Why "aguarde +413 min" while the ring shows ~4h — the SEFAZ gate did JS elapsed on a timestamp-without-tz column under a non-UTC process TZ.
---

# `timestamp without time zone` + `process.env.TZ='America/Sao_Paulo'` = 3h skew em aritmética de tempo no JS

`server/_core/index.ts` faz `process.env.TZ = 'America/Sao_Paulo'`, então TODO o processo Node
roda em BRT (não UTC). Várias colunas de timestamp são `timestamp without time zone` gravando
horário **UTC** (a sessão do Postgres está em GMT, então `NOW()` persiste UTC).

Quando você lê uma coluna `timestamp without time zone` via node-pg (`db.$client.query` ou
`db.execute`), o driver constrói o JS `Date` interpretando o valor na TZ **LOCAL do processo**
(BRT). Resultado: `new Date(coluna)` sai **3h adiantado** em termos absolutos vs `Date.now()`
(que é sempre UTC absoluto). Fazer `Date.now() - new Date(coluna)` → delta com erro de ~−180 min.

**Sintoma concreto (gate SEFAZ):** o gate de `executarSyncNFe` calculava
`elapsedMs = Date.now() - new Date(ts.last_sync_at)` → `elapsed` negativo → a espera ("aguarde
mais X min", cStat=656) inflava em ~180 min (ex.: mostrava 413 min enquanto o anel do cliente,
que usa `parseAsUTC`, mostrava ~233). Isso rejeitava a sync por 3h a mais — no botão manual E no
cron — sustentando o "o cronômetro zera mas não sincroniza".

**Por que o cron parecia OK mas não sincronizava:** a SELEÇÃO do cron e o claim atômico usam SQL
puro (`last_sync_at < NOW() - interval`, `EXTRACT(EPOCH FROM NOW()-last_sync_at)`), que é
TZ-consistente no Postgres. Então o cron SELECIONAVA na hora certa, mas o gate JS interno
rejeitava por 3h. O diagnóstico do cron (SQL) dizia "ELEGÍVEL" enquanto o gate (JS) dizia "espere".

**How to apply / regra geral:** NUNCA fazer aritmética de tempo em JS (`Date.now() - new Date(col)`)
com colunas `timestamp without time zone` enquanto o processo está em TZ ≠ UTC. Calcule o delta
NO BANCO: `EXTRACT(EPOCH FROM (NOW() - col)) AS elapsed_sec` e use `elapsed_sec*1000`. Para exibição
no cliente, usar `parseAsUTC` (já é o padrão). Validar deltas conectando ao NEON_DATABASE_URL via
`pg` COM `process.env.TZ='America/Sao_Paulo'` setado no script — um `node` avulso roda em UTC e
NÃO reproduz o bug.
