---
name: Fatura de cartão ↔ Contas a Pagar
description: Vínculo bidirecional automático fatura de cartão × financial_entries e suas invariantes
---

Regra: fatura de cartão importada/vinculada gera título em `financial_entries` com `origem_modulo='cartao_fatura'`, `origem_id=faturaId`; vínculo direto em `financial_cartao_faturas.financial_entry_id`. Baixa (total/parcial) no Contas a Pagar faz fan-out no rollup de baixas gravando o acumulado em `financial_cartao_faturas.pagamentos` — que alimenta "em aberto" e limite disponível.

**Why:** fatura de cartão é cumulativa e o usuário quer 1 fonte de verdade; pagamentos manuais antigos não são dedupáveis, então o backfill só olha faturas com vencimento >= hoje.

**How to apply:**
- Unicidade é garantida por índice único parcial `uniq_fe_cartao_fatura_ativo` (company_id, origem_id WHERE origem_modulo='cartao_fatura' AND status<>'cancelado'). Qualquer NOVO caminho que crie esse título DEVE usar `ON CONFLICT ... DO NOTHING` + re-SELECT do id canônico.
- Título com baixa ativa NUNCA é sobrescrito/atualizado pela sincronização; exclusão de fatura CANCELA (status='cancelado'), nunca deleta.
- Fan-out do rollup é try/catch não-bloqueante — falha não pode travar a baixa.
