---
name: Notification recipient tenancy
description: How to scope email/notification recipients to a tenant company in this ERP
---

# Notification recipients must be tenant-scoped via user_companies

When a public/portal action fans out a notification (e.g. NPS email alert when a
client submits an evaluation), the recipient query MUST be scoped to the company
the action belongs to.

**Why:** the `users` table has **no `companyId` column**, and `getCompaniesForUser`
treats `admin_master` AND `admin` as GLOBAL access. So selecting recipients by
`role = 'admin_master'` alone notifies admins of EVERY company → cross-tenant leak
of operational data in a multi-company deployment.

**How to apply:** join `user_companies` (`userId`/`companyId`) and filter
`userCompanies.companyId = <action's company>` plus the admin roles you want, e.g.
`innerJoin(userCompanies, eq(userCompanies.userId, users.id))` +
`eq(userCompanies.companyId, decoded.companyId)` +
`inArray(users.role, ["admin_master","admin"])` + `isNull(users.deletedAt)`.
Dedupe emails. Tradeoff: a truly global owner-admin with NO `user_companies` link
won't be notified — acceptable (under-notify beats leaking across tenants).
