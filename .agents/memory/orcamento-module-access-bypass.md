---
name: Orçamentista — bypass de obra no módulo Orçamento
description: Regra de autorização do módulo Orçamento (grupo com módulo liberado ignora lista de obras)
---

Regra: usuário cujo grupo (`user_groups.module_access` JSON) libera o módulo `orcamento` com `level:"admin"` tem acesso a TODOS os orçamentos das empresas que acessa — a lista `allowed_obra_ids` NÃO restringe o módulo Orçamento.

**Why:** pedido explícito do usuário ("se tem permissão na tela de orçamento, tudo que envolva orçamento tem que ter autorização") — orçamentista cria orçamento para obra nova/qualquer obra. Caso André: bloqueado com "Sem permissão para acessar este orçamento".

**How to apply:** helpers `userHasOrcamentoModuleAccess` (db.ts) e `orcAllowedObraIds(ctx, companyId)` (orcamento.ts). Cuidados aprendidos no review:
- Bypass SÓ com level `admin` do módulo — `viewer` ganharia escrita (mutations confiam só no assert de obra).
- Bypass exige companyId do recurso ∈ getCompaniesForUser (senão IDOR cross-empresa por id previsível); `assertOrcamentoObraAccess` busca o companyId do orçamento no banco se o caller não passou.
- Sem companyId validável → cai na regra padrão por obra.
