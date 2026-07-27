---
name: Aviso Prévio ↔ Contas a Pagar link
description: Invariantes do fluxo RH→Financeiro da rescisão (enviar ao Contas a Pagar + baixa automática)
---

- Link 1:1: `termination_notices.financeiro_entry_id` ↔ `financial_entries` com `origem_modulo='aviso_previo'`, `origem_id=aviso.id`. Índice único parcial `uq_fin_entries_aviso_previo` (origem_id WHERE origem_modulo='aviso_previo' AND status<>'cancelado') existe SÓ no Neon (criado manualmente — SyncSchema não o gera).
- **Duas vias de pagamento exclusivas**: baixa manual do RH OU envio ao Financeiro — nunca as duas. `enviarParaFinanceiro` rejeita se `baixaRescisaoData`/`dataBaixa` já existem. Desde Rev. 4687 o botão "Dar Baixa" foi REMOVIDO da UI (decisão do usuário: baixa vem SEMPRE do Financeiro); a procedure server `darBaixa` existe por compatibilidade — não recriar caminho de UI para ela.
- Rev. 4687: `enviarParaFinanceiro` aceita `valor` opcional editado pelo RH (parser estrito BR/US); edição registrada em observações + audit log com a previsão original.
- `enviarParaFinanceiro` é transacional com `pg_advisory_xact_lock(477001, avisoId)` + re-check dentro do lock. Novos writers desse link devem usar o mesmo lock key.
- Quitação em `registrarBaixa` (if roll.quitado) dispara `concluirAvisoPorBaixaFinanceira` via dynamic import, try/catch não-bloqueante. Checklist obrigatória pendente → conclui aviso mas NÃO desliga; status terminal do funcionário nunca é tocado; idempotente.
- Reenvio só quando o lançamento vinculado está `cancelado`; `revertConcluido` cancela lançamento ainda `a_pagar` e limpa o link, mas BLOQUEIA reversão se já houve pagamento (estornar no Financeiro antes).
- **Why:** review apontou risco de pagamento duplicado (duas vias) e avisos "presos" após cancelamento no Financeiro.
- **How to apply:** qualquer mudança em baixa/estorno/cancelamento no Financeiro ou em reverts do Aviso Prévio deve preservar esses guards.
- Gaps aceitos: `pagarConsolidadoFornecedor` não dispara o hook; estorno da baixa não reabre o aviso.
- Colunas termination_notices: `dataBaixa` é camelCase QUOTED no banco; `baixa_rescisao_data`/`financeiro_entry_id` são snake.
