---
name: Group-expansion IDOR
description: Per-group read endpoints must intersect the company-group with the user's accessible companies, not just validate the input companyId.
---
Endpoints que resolvem o GRUPO empresarial (ex.: `getCompanyIdsDoGrupo(companyId)`) e
depois consultam dados (employees/PII) de TODAS as empresas do grupo vazam dados
entre empresas se só validarem o `input.companyId`.

**Regra:** após expandir o grupo, intersecte com as empresas que o usuário pode
acessar (`getCompaniesForUser(userId, role)`); admin/admin_master = grupo inteiro.
No módulo recontratação isso virou o helper `empresasGrupoPermitidas(ctx, db, companyId)`,
usado em verificarCpf/getDadosCopia/criarSolicitacao.

**Why:** um RH com acesso só à empresa A conseguia enumerar desligados/PII de outras
empresas do grupo passando o companyId de A (o grupo é resolvido no servidor, mas sem
filtrar pelo acesso do user).

**How to apply:** qualquer novo read que use grupo empresarial. Além disso,
agregadores de notificação (ex.: `notifications.pendingRequestCounts`) usam
`companyFilter(col, input)` e confiam no companyId/companyIds DO CLIENTE — para
não-admin, filtre `resolveCompanyIds(input)` pelas empresas permitidas (`safeInput`)
antes de qualquer query, retornando vazio se nada for permitido.
