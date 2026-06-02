---
name: Frota — veículos sem obra (obra_id NULL) e guard de edição
description: Por que NÃO relaxar o guard de obra do updateVehicle para veículos sem obra; modelo de visibilidade vs edição.
---

# Veículos sem obra (equipamentos próprios) — visibilidade == edição

No módulo Frota, veículos com `obra_id NULL` (equipamentos próprios da FC, ex.: máquinas
não alocadas) são visíveis em `listVehicles` **apenas para admin** (`getEffectiveAllowedObraIds`
retorna `null` só para `admin`/`admin_master`; qualquer outro perfil recebe um array — com
`length>0` o filtro `obra_id IN (allowed)` EXCLUI NULL, com `length===0` a lista retorna `[]`).

E `userCanAccessObra(user, role, null)` retorna `true` SÓ para admin (`allowed===null`) e
`false` para todo não-admin (`obraId == null` → restrito). Ou seja, o guard de `updateVehicle`
JÁ está alinhado à visibilidade: "edita quem vê".

**Regra:** NÃO relaxar o guard de `updateVehicle`/`deleteVehicle` para "só validar quando
`curObra != null`". Isso NÃO corrige nenhum bloqueio legítimo (admin já passa) e ABRE um IDOR —
`updateVehicle` recebe `{id, companyId}` do client e não valida acesso à empresa, então qualquer
autenticado editaria veículo sem obra por enumeração de id/companyId.

**Why:** numa tentativa de corrigir "marquei como vendido e não salva", o relaxamento do guard
foi reprovado em code review (Broken Access Control). A causa real do "não salva" era client-side:
`createMut`/`updateMut` sem `onError` engoliam o erro (clique sem feedback). Fix correto = adicionar
`onError` no client; server intocado.

**How to apply:** ao mexer em autorização de Frota, trate `obra_id NULL` como "admin-only" tanto
na leitura quanto na escrita; nunca dê bypass por obra nula. Falha silenciosa em mutation =
checar se o `useMutation` tem `onError` antes de suspeitar do backend.
