---
name: Portal público (link aberto) — tenant guard próprio
description: Tokens JWT "link aberto" (sem credId) pulam a whitelist da credencial; qualquer write com obraId precisa validar empresa por conta própria.
---

O Portal do Cliente tem links públicos "abertos" (NPS): JWT `{tipo:"cliente", companyId, linkAberto:true}` SEM `portalId/credId`, anônimo e reutilizável.

**Regra:** `_assertObraPermitida` / `_obrasLiberadasDaCredencial` retornam `null` (= "tudo liberado") quando o token NÃO tem credId. Logo, em endpoints `publicProcedure` alcançáveis por esse token, confiar só nesse helper NÃO valida tenancy — um `obraId` (ou outro id) arbitrário vindo do `input` grava com o `companyId` do token = IDOR cross-tenant.

**Como aplicar:** todo write público que aceita um id de recurso (obra, etc.) deve validar explicitamente `SELECT ... WHERE id=? AND companyId=decoded.companyId AND deletedAt IS NULL` e rejeitar (`FORBIDDEN`) se não achar — independentemente da whitelist da credencial. Reaproveite esse mesmo SELECT para puxar nome/labels (não faça lookup por id isolado).

**Por que:** descoberto na Rev. 2892 (link NPS por obra). A trava da obra via `decoded.obraId ?? input.obraId` protege o caso "link por obra", mas o caso "link geral" (sem obra no token) ainda aceitava `input.obraId` cru → faltava o guard por empresa.

**Bônus (front):** decodificar payload JWT no client p/ ler claims públicas (ex. `obraNome`) exige normalizar base64url (`-`→`+`, `_`→`/`, e padding `=` até `length%4==0`) antes do `atob`, senão tokens sem padding canônico falham silenciosamente.
