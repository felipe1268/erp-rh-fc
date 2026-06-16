---
name: Recebíveis só entram no livro por decisão manual
description: Nenhuma receita prevista/a_receber se materializa sozinha em financial_entries; o usuário escolhe na tela "Recebíveis Previstos". financial_revenue continua sendo a FONTE.
---

# Receita NÃO cai mais sozinha no Contas a Receber

Decisão (Rev. 3161 → 3162): NENHUM importador do bridge
(`server/services/financialIntegrationBridge.ts`) materializa receita automaticamente
em `financial_entries`. O recebível só vira lançamento quando o usuário seleciona na
tela "Recebíveis Previstos" (`getRecebiveisPrevistos` / `transferirRecebiveisPrevistos`
em `server/routers/financial.ts`, UI em `FinanceiroLancamentos.tsx`).

**Importadores que agora escrevem SÓ em `financial_revenue` (a FONTE da lista/aviso),
nunca em entries:**
- `importPlanejamentoMedicoesToFinancial` (dedup revenue por `medicao_id`)
- `importPlanejamentoProjetosPrevistoToFinancial` (dedup `observacoes='planejamento_previsto'`)
- `importObrasToFinancialRevenue` (dedup `observacoes='obra_previsto'`)
- `importAllMedicoesPrevistaToFinancial` → **NO-OP** (`return 0`); a fonte equivalente
  é `importAllMedicoesPrevistaToRevenue`
- `importFinancialRevenueToEntries` → chamada COMENTADA em `runAllReceitasImport`

**Why:** o usuário excluía um recebível e ele "voltava" no próximo sync/startup porque
`deleteEntry` é HARD DELETE de não-efetivados e o importer recriava. Agora a exclusão
"cola".

**How to apply:** qualquer NOVO writer de receita NÃO deve inserir em `financial_entries`
automaticamente — popule `financial_revenue` e deixe a tela lançar. O dedup do branch
`origem='revenue'` (em `getRecebiveisPrevistos`, no SELECT do transferir e no
INSERT...WHERE NOT EXISTS) inclui `AND COALESCE(fe.status,'') <> 'cancelado'`, então um
recebível excluído/cancelado REAPARECE como lançável (não some).

**Não tocados (proposital):** `importMedicoesPJToFinancial` /
`importTerceiroCobravelToFinancial` (dedup acoplado ao próprio entry, sem contrapartida
em revenue, dormentes na FC); `importAtividadesCronogramaToFinancial` (é DESPESA/projeção).
