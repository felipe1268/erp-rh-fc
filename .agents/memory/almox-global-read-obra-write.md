---
name: Almoxarifado — leitura global, escrita por obra
description: Modelo de autorização do módulo Almoxarifado desde a visibilidade global ("ver tudo, mexer só no seu")
---

Regra: reads do Almoxarifado (itens, consolidado, timeline/movimentos, empréstimos, baias, equipamentos locados) são GLOBAIS por empresa — sem filtro por obras permitidas, mas SEMPRE com guard de empresa explícito (`_assertCompanyAccess`/`getCompaniesForUser`), porque o filtro SQL por `companyId` de input NÃO é autorização. Writes (mutations, recebimento de OCs) exigem permissão na OBRA do item via `getAlmoxAllowedObraIdSet` (null = admin; obraId null = Central liberado pela empresa).

**Why:** o usuário aprovou visibilidade total para facilitar transferências entre obras; review de segurança mostrou que abrir reads sem guard de empresa vira IDOR cross-tenant, e que `registerEntry/registerExit` historicamente não tinham guard NENHUM.

**How to apply:** qualquer novo endpoint do módulo — read: guard de empresa, sem filtro de obra; write: guard de empresa + obra do RECURSO (não do input). Frontend usa `podeEditarItemObra()`/flag `podeEditar` de `obras.listForAlmoxarifado` só como UX; o backend é a autoridade.
