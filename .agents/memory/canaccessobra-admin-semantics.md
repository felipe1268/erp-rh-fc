---
name: canAccessObra true-for-all only for admin_master
description: PermissionsContext canAccessObra/allowedObraIds semantics — plain isAdmin is NOT covered, unlike canWriteCentral
---

`canAccessObra(obraId)` (from `PermissionsContext`) returns true for ALL obras
only when `allowedObraIds === null`, which is set ONLY for admin_master. A plain
`isAdmin` (non-master) has `allowedObraIds = []`, so any obra list filtered by
`canAccessObra` comes back EMPTY for admin comum.

**Why:** A bug had the EPI "Nova Transferência" obra dropdown empty for admin
comum because the derived `obrasPermitidas` filtered by `canAccessObra`. The
write-permission gate `canWriteCentral` already used the broader rule
`isAdminMaster || isAdmin || allowedObraIds === null`, so the two were
inconsistent.

**How to apply:** When deriving an "obras the user may write to" list, mirror
`canWriteCentral`: return all obras when `isAdminMaster || isAdmin ||
allowedObraIds === null`, and only fall back to `canAccessObra` filtering for
genuinely restricted users. Don't reuse `canAccessObra` alone as an admin gate.
