---
name: drizzle db.execute ignora array de params
description: Por que queries raw com $1/$2 falham silenciosamente em financialKpiService.ts e como ligar params corretamente
---

# `db.execute(stringSQL, [params])` NÃO faz bind dos parâmetros posicionais

No drizzle node-postgres (`drizzle-orm/node-postgres`), `db.execute()` aceita
**apenas UM argumento**. Quando se passa `db.execute(\`...$1...$2...\`, [a, b])`,
o segundo argumento (array de params) é **silenciosamente ignorado** — os
placeholders `$1/$2/$3` chegam ao Postgres sem bind e a query lança
`there is no parameter $1`. No ERP isso aparece como
`[tRPC Error] ...: DB error: Failed query: ...` e o endpoint retorna erro.

**Como ligar params corretamente:** usar o pool pg subjacente:
`db.$client.query(text, paramsArray)` → retorna `{ rows: [...] }` (compatível com
o helper `r(v) = v?.rows ?? v`). Em `financialKpiService.ts` há o helper
`q(db, text, params)` que encapsula isso.

**Por que enganou (e pode enganar de novo):** validar a SQL rodando-a direto no
Neon via `pg` (ou via `executeSql`) FUNCIONA, porque `pg.query` liga os params.
O bug só aparece pelo CAMINHO DA APP (`getDb()` → `db.execute`). Para reproduzir
o bug real, rode a FUNÇÃO da app (ex.: `tsx` importando `calcularDRE`), não a SQL
crua. Confirme a causa olhando `e.cause?.message` (= `there is no parameter $1`).

**Regra durável:** qualquer query raw com placeholders `$N` em
`financialKpiService.ts` DEVE passar pelo helper `q()` (pool pg) — `db.execute`
com array de params nunca liga os binds nesse arquivo. Ao tocar/auditar uma função
do arquivo, confirme que ela usa `q()` e não `db!.execute(sql, [params])`.
