---
name: Dissídio diferença retroativa — fora da folha, encargos próprios
description: Diferença salarial retroativa do dissídio não entra nos totais da folha mensal; tem seu próprio cálculo de INSS/IRRF no relatório dedicado.
---

A diferença salarial retroativa gerada ao aplicar um dissídio com vigência no
passado (`dissidio_funcionarios.valorRetroativo`) é PAGA SEPARADAMENTE da folha
mensal (guia própria), não deve ser somada em `totalProventos`/INSS da folha.

**Why:** pedido explícito do piloto FC — a diferença é uma verba isolada, não
salário do mês corrente; misturá-la na folha inflava o bruto sem aplicar
nenhum desconto (o INSS da folha só incidia sobre `salarioBruto`).

**How to apply:** o relatório `sindical.relatorioDiferencas` é a ÚNICA fonte
que deve exibir/calcular essa verba (com INSS/IRRF via
`calcularINSSProgressivo`/`calcularIRRFProgressivo` de `rescisaoCalc.ts`).
`payrollEngine.ts` NÃO deve mais ler `dissidio_funcionarios` no cálculo
mensal. Tipo 'folha' (ativos) = incidência sobre o valor cheio isolado; tipo
'rescisao_complementar' (desligados) = incidência por verba usando o
`diferencaBreakdownJson` salvo (aviso prévio indenizado isento de
INSS/IRRF/FGTS). FGTS é só informativo, não desconta do líquido.
