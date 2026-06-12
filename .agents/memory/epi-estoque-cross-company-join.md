---
name: EPI estoque obra join não escopa empresa
description: Por que cards de obra duplicados/fantasma aparecem em "Estoque por Obra" e a régua certa.
---

`estoqueObraResumo` / `estoqueObraList` (server/routers/epis.ts) fazem `leftJoin(obras)` por `obraId`
SEM exigir `obras.companyId == epiEstoqueObra.companyId`. Como o seletor de obra pode listar obras de
várias empresas (pools/grupo), dá pra gravar uma linha de `epi_estoque_obra` de uma empresa apontando
para a obra de OUTRA empresa. Resultado: a obra "estrangeira" resolve nome normalmente e vira um CARD
EXTRA na tela, frequentemente com o MESMO nome de uma obra real da empresa (ex.: 3 obras "QIU 2 - FASE 4"
em empresas diferentes) → parece "bug do filtro" / cards duplicados.

**Why:** dado cross-company mal atribuído + join sem tenant guard. O filtro por card (`tabelaEstoqueList`,
`String(e.obraId)===filterObraEstoque`) está CORRETO; o problema é dados + join.

**How to apply:** ao mexer nessas queries, escopar o join à mesma empresa
(`and(eq(epiEstoqueObra.obraId, obras.id), eq(obras.companyId, epiEstoqueObra.companyId))`) e/ou exibir
linhas órfãs como anomalia explícita. Para limpar o dado: as linhas órfãs são UPDATE de `obraId`
(reatribuir à obra correta da empresa) — NUNCA DELETE; confirmar com o usuário qual obra é a canônica.
Inspeção real: query no NEON_DATABASE_URL via bash+pg (sandbox não expõe process.env).
