---
name: company_partners write surfaces
description: company_partners (dados financeiros dos sócios) tem MAIS de uma tela/endpoint que escrevem; blindar TODOS.
---

# company_partners tem múltiplas superfícies de escrita

A tabela `company_partners` (pró-labore/%/PIX/venc. dos sócios) é escrita por mais de um
caminho — não confie que "removi o CRUD de uma tela" fecha o recurso:

- `financial.upsertPartnerByEmployee` — caminho novo (Configurações → aba "Sócios").
- `financial.createPartner` / `financial.updatePartner` — LEGADOS, ainda chamados pela
  tela `client/src/pages/financeiro/FinanceiroConfiguracoes.tsx` (≠ do
  `FinanceiroConfigSection.tsx` que virou ponteiro).

**Regra:** dado financeiro de sócio é sensível → TODO endpoint de escrita em
`company_partners` exige `_assertFinanceiroCompanyAccess` (tenant, anti-IDOR) +
papel `admin`/`admin_master`. Vínculo sócio↔financeiro é por `employee_id`, com índice
ÚNICO parcial `idx_cp_employee_uniq (company_id, employee_id) WHERE employee_id IS NOT NULL`
(1 registro financeiro por sócio).

**Why:** code review pegou privilege-escalation no endpoint novo e IDOR nos legados
porque a UI antiga foi esquecida. Inventariar TODAS as telas/rotas que escrevem no
recurso antes de declarar "fonte única segura".

**How to apply:** ao mexer em qualquer write de sócio/partner, faça `rg createPartner|updatePartner|upsertPartnerByEmployee` em client+server e garanta os 2 guards em cada um.
