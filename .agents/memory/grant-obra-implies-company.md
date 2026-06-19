---
name: Conceder obra implica empresa (getCompaniesForUser)
description: Em controle de acesso multi-empresa, conceder uma OBRA a um usuário comum precisa derivar o acesso à EMPRESA dona dela.
---

# Conceder obra → empresa dona (getCompaniesForUser)

Regra: para `role="user"`, as empresas visíveis = UNIÃO de `user_companies` (vínculos
explícitos) + EMPRESAS DONAS das obras de `getEffectiveAllowedObraIds`
(`SELECT DISTINCT "companyId" FROM obras WHERE id = ANY(...)`). Só cai no fallback
`companies ORDER BY razaoSocial LIMIT 1` quando o conjunto fica REALMENTE vazio.

**Why:** um usuário comum com obra concedida em `allowed_obra_ids` mas SEM nenhum
vínculo em `user_companies` caía no fallback LIMIT 1 (1ª empresa alfabética = errada);
`companies.list` e `obras.listForAlmoxarifado` operavam na empresa errada e a obra
concedida nunca aparecia — só quando virava admin (que vê todas + ignora filtro de
obra). Daí o sintoma clássico "só aparece como Adm".

**How to apply:** ao mexer em visibilidade de empresa/obra de usuário comum, lembre
que conceder obra DEVE implicar acesso à empresa dona. Sem ciclo:
`getEffectiveAllowedObraIds` lê `user_companies` cru (não chama `getCompaniesForUser`).
Manter o fallback LIMIT 1 só p/ conjunto vazio. ACL de terceiros (routers.ts ~L2122)
lê `user_companies` cru de propósito — NÃO aplicar essa derivação lá.
