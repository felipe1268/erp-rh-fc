---
name: integrasign router lacks tenant guard
description: Every integrasign.ts endpoint trusts input.companyId with no access check — IDOR surface across the whole router.
---

# integrasign router — IDOR on input.companyId

Os endpoints do `server/routers/integrasign.ts` (ex.: `criarEnvelope`, `atualizarTextoContrato`, etc.) são `protectedProcedure` (só exigem login) e aceitam `input.companyId` cru, gravando/lendo envelopes e signatários nessa empresa SEM validar que o usuário tem acesso a ela. Não há `_assertCompanyAccess` / `getCompaniesForUser` em nenhum deles.

**Why:** um usuário autenticado pode forjar `companyId` e operar em outra empresa (broken access control multi-tenant). É o MESMO padrão já corrigido em `signatures.create` (ver `fcsign-create-tenancy.md`), mas o router `integrasign` ficou de fora.

**How to apply:** ao tocar QUALQUER mutation/query de `integrasign.ts` que receba `companyId`, adicionar guard de tenant (interseção com as empresas acessíveis via `getCompaniesForUser`) ANTES de qualquer insert/update/select. A Rev. 3050 (3 signatários no contrato) NÃO introduziu isso — é pré-existente e file-wide; tratar como fix de segurança transversal, não pontual.
