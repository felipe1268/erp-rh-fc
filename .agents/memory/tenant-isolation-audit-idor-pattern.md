---
name: Tenant isolation audit — recurring IDOR pattern
description: Class of bug found repeatedly when auditing multi-tenant data isolation (Fase 0 SaaS hardening); what to check first on future audits.
---

Recurring bug class found across `downloadSST.ts`, `danfeRoute.ts`, `dissidio.buscarPorId`,
`horasExtras.getDetalhe`/`memorialCalculo`, `folhaPagamento.listarItens`: a `protectedProcedure`
(or authenticated Express route) fetches a row **by numeric/opaque ID** and returns sensitive data
(salary, health docs, invoices) WITHOUT checking that the row's `companyId` is one the requesting
user can access. Auth ≠ authorization — being logged in was enough to read any other tenant's data.

**Why:** these procedures were written when the product was single-tenant "in practice" (one real
client), so cross-tenant exploitation never happened even though the code allowed it. Becomes a
real LGPD/security requirement once the product becomes multi-tenant SaaS.

**How to apply:** when auditing a new router for tenant isolation, grep for `protectedProcedure` +
`.query`/`.mutation` that look up a row by `id` and immediately `return`/select related tables —
if there's no `getCompaniesForUser(ctx.user.id, ctx.user.role)` (or equivalent `assertCompanyAccess`)
check against the row's `companyId` before returning, it's a likely IDOR. Standard fix pattern:
fetch the row's `companyId` first, call `getCompaniesForUser`, and throw `FORBIDDEN` if not included
(admin/admin_master naturally pass since `getCompaniesForUser` returns all companies for them).

Also confirmed by design during this audit (not a bug): `getCompaniesForUser` treats role `admin`
(not just `admin_master`) as global access — both are internal FC Engenharia roles. When building the
SaaS Painel Mestre, any "empresa-cliente admin" role must use a DIFFERENT role name, or it will
inherit unintended cross-tenant access.
