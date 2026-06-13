---
name: cronograma_atividade é projeção (valor de contrato), não custo real
description: Por que somar origem_modulo='cronograma_atividade' com despesas reais infla/duplica os custos; a Análise de Custos exclui essa origem.
---

Lançamentos `financial_entries` com `origem_modulo='cronograma_atividade'` NÃO são despesas reais: são a PROJEÇÃO do cronograma de cada obra. O valor vem do orçamento (`totalVenda`/negociado) ponderado por `peso_financeiro` (soma EXATAMENTE 100% por revisão) e DISTRIBUÍDO mês a mês entre data_inicio→data_fim (`valorMensal = valorTotalAt/meses`). Por isso uma atividade aparece "x12" (uma fração por mês) — isso NÃO é duplicata; o total por obra ≈ o valor do contrato.

**Regra:** qualquer tela de CUSTO REAL deve EXCLUIR `cronograma_atividade`, senão conta cada obra DUAS vezes (projeção do contrato + folha/compras/etc. reais de executá-lo). O ERP já faz isso no card "contas a pagar comprometidas" (`financial.ts`: `AND COALESCE(origem_modulo,'') <> 'cronograma_atividade'`). A "Análise de Custos" passou a filtrar `r.origemModulo !== 'cronograma_atividade'` no `rowsAll` (front).

**Why:** usuário viu Custo Total ~R$ 26,7 mi e reclamou ("meus contratos não têm este valor"); R$ 15,7 mi disso era a projeção do cronograma somada aos ~R$ 11 mi reais.

**How to apply:** ao criar/alterar KPI ou dashboard que some despesas de `getContasAPagarByYear` (endpoint `financial.n`, compartilhado por Contas a Pagar/Fluxo de Caixa/Lançamentos — NÃO alterar o endpoint), decida se é "real" (exclui cronograma) ou "projetado/comprometido" (inclui). Atenção a órfãos: obra com lançamentos de cronograma mas projeto de planejamento apagado (ex.: HOTEL DO PAPA obra 90004).
