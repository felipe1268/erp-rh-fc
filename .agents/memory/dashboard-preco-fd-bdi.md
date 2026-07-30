---
name: Preço "impossível" no Dashboard Gerencial = cotação com BDI
description: Preços absurdos na análise de compras costumam vir de cotação FD digitada com preço de orçamento (com BDI), não de erro de conversão.
---
# Preço distorcido no dash de compras — checar cotação/BDI antes de suspeitar de conversão

Regra: quando um preço unitário parece impossível (ex.: cimento a R$ 51,72/sc quando o balcão é ~R$ 38,90), a conversão kg↔saco costuma estar CERTA (1,0344/kg × 50 = 51,72). A causa raiz típica é o preço digitado na **cotação** ser o valor de orçamento **com BDI** (38,90 × 1,33 ≈ 51,72), especialmente em OCs de Faturamento Direto (`modalidade_fd='fd_cliente'`), e propagar pra OC.

**Why:** auditoria de 30/07/2026 (cimento CPIII, Ferragens Santa Rita): todas as linhas a 51,72 vinham de `compras_cotacao_respostas.preco_unitario=1.0344`; totais das OCs batiam — nada de bug de conversão.

**How to apply:** ao investigar preço estranho no dash, rastrear OC → cotação (`compras_cotacao_respostas` join `compras_cotacoes_itens`) e conferir `modalidade_fd`. Não reescrever preços de OCs entregues (têm vínculo financeiro) — reportar. OCs `rascunho` ficam FORA da análise de preço/recorrência (Rev. 4755). Alerta pendente: OC-2026-510 tem itens 2× duplicados também no recebimento (almoxarifado_recebimento_itens receb 107).
