---
name: Conciliação — classificação "movimentação interna" (3 camadas)
description: Como a Conciliação Bancária separa caixa real (externo) de movimentação interna; o que precisa ficar em sincronia ao mexer nessa lógica.
---

# Classificação caixa real (externo) × movimentação interna

A Conciliação Bancária classifica cada linha de `bank_statement_lines` como
INTERNA (dinheiro que só gira entre as contas/empresas da própria FC) ou EXTERNA
(caixa real). São TRÊS camadas, todas em `server/routers/financial.ts`:

1. **Heurística por TEXTO** (Rev. 3349): `_INTERNO_PATTERNS` → `_INTERNO_REGEX_SRC`
   (transf. entre contas, aplica/resgate, cdb/rdb, "fc engenharia"…).
2. **Base cadastrável de CNPJs/CPFs** (Rev. 3351): tabela `financial_internal_cnpjs`
   (por empresa, soft `ativo`). Predicado = regex base OR
   `regexp_replace(descricao,'[^0-9]','','g') LIKE '%<cnpj>%'`.
3. **Exceção MANUAL por lançamento** (Rev. 3351): tabela
   `financial_internal_overrides` (UNIQUE company_id+line_id), natureza
   `efetivo`|`interno`|`auto`. Precedência: efetivo→NUNCA interno; interno→SEMPRE;
   auto→cai na regra automática (camadas 1+2).

**Regra de ouro — NÃO DIVERGIR:** o predicado SQL e o helper JS `_isLancInterno`
têm que espelhar EXATAMENTE a mesma lógica, senão Dashboard (`DashConciliacao`) e
Panorama (`FinanceiroConciliacao`) mostram totais diferentes. `_loadInternoConfig`
carrega dígitos+overrides num único load por request, consumido pelos 3 endpoints
read-only (`getConciliacaoReportGeral`, `getConciliacaoLancamentos`,
`getBankAccountsConciliacaoStatus`).

**Só CLASSIFICA** — nunca oculta/baixa/concilia nada. Tudo read-only.

**Why:** ~31,8% do giro (só texto) → ~43,7% (com base de CNPJs) em 60002/2026; sem
classificar, transferências intra-grupo inflavam Entradas/Saídas.

**How to apply:** ao tocar qualquer parte dessa classificação, atualize SQL + JS
juntos; mantenha a precedência do override; NÃO semeie PIX de arranjo de pagamento
(00360305/90400888/60701190 = instituições de pagamento, não empresas do grupo).
`setLancamentoNatureza` exige `motivo` no SERVIDOR p/ efetivo/interno (não só na UI).
