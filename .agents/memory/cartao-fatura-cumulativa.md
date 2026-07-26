---
name: Fatura de cartão é cumulativa
description: Como ler saldo em aberto e OCs a faturar do cartão de crédito sem dupla contagem
---
Regra: NUNCA somar o histórico de `financial_cartao_faturas` como "em aberto". A fatura de cartão é cumulativa — saldo não pago rola pra fatura seguinte, e o pagamento da fatura anterior aparece como crédito NEGATIVO na coluna `pagamentos` da seguinte (padrão confirmado nos dados reais do Neon).

**Why:** somar todas as faturas "sem pagamento registrado" gerou R$194 mil de comprometido irreal; e `total - pagamentos` com pagamentos negativo INFLA o saldo em vez de abater.

**How to apply:** saldo em aberto = só faturas com `vencimento::date >= CURRENT_DATE`, com `GREATEST(total - GREATEST(pagamentos,0), 0)`. OCs "a faturar" = só OCs criadas DEPOIS do último fechamento do cartão (as anteriores já estão dentro da fatura, mesmo sem vínculo item→OC) + dedup `NOT EXISTS financial_cartao_itens.compra_oc_id`. Se o negócio passar a importar mais de uma fatura futura por cartão, restringir à mais próxima do vencimento.
