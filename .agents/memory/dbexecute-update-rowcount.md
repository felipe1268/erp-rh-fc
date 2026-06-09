---
name: db.execute UPDATE rowCount unreliable
description: db.execute(sql`UPDATE ...`) sem RETURNING não expõe rowCount confiável neste app; log mostrou 0 com 14 linhas alteradas.
---

# db.execute UPDATE: rowCount não confiável sem RETURNING

`await db.execute(sql\`UPDATE ... \`)` (drizzle + node-postgres deste projeto) NÃO
expõe de forma confiável a contagem de linhas afetadas: um UPDATE que alterou 14
linhas logou `rowCount ?? rows.length = 0` (o objeto retornado não trouxe `.rowCount`
e `rows` vinha vazio porque não havia `RETURNING`).

**Why:** confunde verificação — parece que o backfill não fez nada quando na verdade
funcionou (confirmado pelo `alterado_por` carimbado nas linhas).

**How to apply:** para contar linhas afetadas num UPDATE de backfill no startup,
adicione `RETURNING id` e conte o resultado, tolerando as 3 formas de retorno:
`Array.isArray(r) ? r.length : (r?.rows?.length ?? r?.rowCount ?? 0)`. Para CONFERIR
o efeito real, consulte o Neon direto (script pg read-only com NEON_DATABASE_URL) —
o tool `executeSql` bate no Postgres do Replit, não no Neon.
