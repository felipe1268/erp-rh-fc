---
name: Férias ↔ Contas a Pagar
description: Título automático de férias no financeiro — regras, hooks e armadilhas
---

Férias agendada/em_gozo gera título automático em financial_entries (origem_modulo='ferias', conta 'FÉRIAS - MÃO DE OBRA'), padrão análogo ao Aviso Prévio.

**Regras:**
- Motor: `sincronizarFinanceiroFerias`/`cancelarFinanceiroFerias` em avisoPrevioFerias.ts, never-throw.
- Valor = valorLiquido || valorTotal; PARSE BR-AWARE obrigatório — colunas varchar guardam ora "3068.97" ora "3.068,97" (parseFloat cru transformou R$ 3.068,97 em 3,32 num backfill).
- Vencimento = dataPagamento || dataInicio−2d (art. 145 CLT). Competência = dataInicio.
- Dedup: vínculo vacation_periods.financeiro_entry_id + índice único parcial `uq_fin_entries_ferias (origem_modulo,origem_id) WHERE origem_modulo='ferias' AND status<>'cancelado'`.
- Título 'a_pagar' é sincronizado (valor/venc); título com baixa é intocável.
- WHERE do UPDATE/CANCEL inclui company_id do período (defesa anti-IDOR — helpers não confiam só no caller).

**Hooks — TODA transição de status precisa reconciliar o título:**
- gera/sync: create c/ dataInicio, update, definirDataFerias, reverterParaEmGozo, reverterEmGozo→agendada.
- cancela: cancelarAgendamento, delete, cancelarConclusaoFerias, reverterEmGozo→pendente, confirmarVencidas* (pago fora do CP → cancela p/ evitar pagamento em dobro).

**Why:** férias do Caio Matheus entrou em gozo sem lançamento no financeiro; e a rota de agendamento principal do RH é `definirDataFerias`, não só create/update — hook incompleto deixa buraco.
**How to apply:** ao criar nova mutation que muda status/valores de vacationPeriods, chamar sincronizar/cancelar conforme o estado final.
