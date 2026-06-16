---
name: PJ payments grouping is frontend-only
description: Why PJ payment entries are grouped in the UI (not consolidated in the backend like Folha)
---

# Agrupamento de pagamentos PJ na tela de Lançamentos

Na tela Financeiro / Lançamentos, os pagamentos PJ (`financial_entries.origem_modulo='pagamento_pj'`) são agrupados por mês numa única linha visual, igual à Folha.

**Diferença crucial vs. Folha:** a Folha já chega CONSOLIDADA do backend (o bridge agrupa por tipo_folha antes de materializar o entry). Os PJ NÃO — cada pagamento (adiantamento/fechamento) permanece como um `financial_entry` INDIVIDUAL no banco, com sua própria baixa, conciliação e vínculo `origem_id = pj_payments.id`.

**Why:** consolidar PJ no backend (1 entry/mês) quebraria a baixa e a conciliação por item — cada medição PJ precisa ser baixada/conciliada separadamente. Por isso o agrupamento PJ é PURAMENTE VISUAL (frontend), reaproveitando a engine de agrupamento da Frota (introduzida na Rev. 3154).

**How to apply:** qualquer mudança no agrupamento da tela de Lançamentos deve manter os entries PJ individuais no banco; só a apresentação colapsa. A engine de grupo é compartilhada Frota+PJ (`DisplayRow.groupKind`, `grupoKeyOf`, `displayRows`); o nome do contratado vem de um LEFT JOIN read-only em `getEntries` (coluna `pjFornecedor`), pois o entry PJ só guarda descrição genérica + `origem_id`.
