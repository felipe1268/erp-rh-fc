---
name: Recebíveis só entram no livro por decisão manual
description: Nenhuma receita prevista/a_receber se materializa sozinha em financial_entries; o usuário escolhe na tela "Recebíveis Previstos". financial_revenue continua sendo a FONTE.
---

# Receita NÃO cai mais sozinha no Contas a Receber

Decisão (Rev. 3161 → 3162 → 3163): NENHUM caminho materializa receita automaticamente
em `financial_entries`. O recebível só vira lançamento quando o usuário seleciona na
tela "Recebíveis Previstos" (`getRecebiveisPrevistos` / `transferirRecebiveisPrevistos`
em `server/routers/financial.ts`, UI em `FinanceiroLancamentos.tsx`).

**ARMADILHA (Rev. 3163):** desligar os importers do BRIDGE não basta — existe um caminho
DIRETO no router. `createRevenue` (`server/routers/financial.ts`, mutation manual de
"nova receita/faturamento") inseria em `financial_revenue` E logo um `financial_entry`
origem='revenue' a_receber ("Faturamento: …"). Esse INSERT automático foi REMOVIDO;
`createRevenue` agora popula só `financial_revenue` (one-shot, sem dedup acoplado → seguro
remover). Ao auditar "receita caindo sozinha", procure TODAS as fontes: bridge importers
+ `createRevenue` + `registrarRecebimento`. Como a receita não materializa mais sozinha,
a "Dar Baixa" (`registrarRecebimento` caminho `frId`) ganhou um INSERT...WHERE NOT EXISTS
que cria o entry 'recebido' se faltar (baixa sobre previsto não-lançado não some do livro).

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
