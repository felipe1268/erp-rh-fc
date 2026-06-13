---
name: Medição duplicada no Contas a Receber (dupla escrita)
description: Por que cada medição aparecia 2x no Contas a Receber e como o dedup deve ser feito (contra o par canônico, não por medicao_id IS NULL).
---

# Medição = receita escrita por DOIS caminhos

Cada medição podia aparecer **2x** no Contas a Receber porque dois importadores no
bridge (`server/services/financialIntegrationBridge.ts`) escrevem a MESMA medição:

- O importador de medições do planejamento grava `financial_entries`
  (`origem_modulo='planejamento_medicao'`) **e** `financial_revenue` (com `medicao_id`).
- O importador `financial_revenue → financial_entries` então lê esse mesmo
  `financial_revenue` e cria uma **2ª** `financial_entries` (`origem_modulo='revenue'`,
  descrição "Faturamento de Obras").

**Regra de dedup (Rev. 3013):** no passo `revenue → entries`, pular a criação quando
já existe o lado canônico: `NOT EXISTS (financial_entries WHERE
origem_modulo='planejamento_medicao' AND origem_id=fr.medicao_id AND
COALESCE(status,'') <> 'cancelado')`.

**Por que NÃO usar `medicao_id IS NULL` cego:** outro importador
(`importAllMedicoesPrevistaToRevenue`) também grava `financial_revenue` COM
`medicao_id`. Filtrar por `medicao_id IS NULL` mataria receitas legítimas. O dedup tem
que ser **contra a existência do par canônico**, não pela presença/ausência de `medicao_id`.

**Why:** receita manual (`medicao_id` NULL) e medições sem par de planejamento precisam
continuar fluindo; só a 2ª cópia da MESMA medição deve ser bloqueada.

**Limitação conhecida (follow-up):** fluxos que sincronizam status filtrando
`origem_modulo='revenue'` (`updateRevenueStatus`, `registrarRecebimento`,
`cancelarRecebimento`) viram no-op para medições que agora só existem no lado
`planejamento_medicao`. O recebimento pela tela funciona (opera na entry visível), mas
operar pelo fluxo `financial_revenue` pode divergir o status entre telas.

**Canônico = `planejamento_medicao`** porque relatórios em `server/routers/financial.ts`
dependem dele; `getContasAReceberByYear` lê só `financial_entries`. `entryExists`
ignora status → uma entry cancelada bloqueia recriação (idempotência).
