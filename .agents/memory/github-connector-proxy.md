---
name: Integração GitHub — SDK proxy e limites
description: Como o app fala com o GitHub e as armadilhas do proxy de connectors (endpoint legado vazio, corpo máx ~5MB, sem token bruto).
---

Regra: todo acesso ao GitHub no servidor passa pelo `@replit/connectors-sdk`
(`connectors.proxy("github", path)`), nunca pelo endpoint legado
`/api/v2/connection` nem por token cacheado.

**Why:** o endpoint legado passou a devolver `{"items":[]}` mesmo com a conexão
ativa (o painel mostrava "GitHub não conectado"); o SDK cuida de identidade e
refresh. Não há como extrair o token bruto (nem via listConnections — vem vazio
para github), então `git push` autenticado por token NÃO é possível por código.

**How to apply:**
- O proxy limita o corpo da requisição a ~5MB (413 acima disso). Upload grande
  (ex.: zip do snapshot de código) deve ser fatiado em partes ≤4MB — 1 blob git
  por parte + README com SHA-256 e instrução `cat *.part* > zip`.
- Para atualizar a branch main no GitHub use o gitPush da plataforma ou o painel
  Git; se der INDEX_LOCKED persistente, é trava da plataforma (não é lock local
  em .git) — orientar o usuário a usar o painel Git.
- Se o proxy voltar vazio/401: o vínculo repl↔conexão expirou; re-propor a
  integração ao usuário (ProposeIntegration) resolve.
