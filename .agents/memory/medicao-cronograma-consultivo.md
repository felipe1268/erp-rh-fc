---
name: Cronograma é consultivo na medição de terceiros
description: O avanço do cronograma nunca escreve o medido; só comparativo com alerta
---

Regra (pedido explícito do usuário, ago/2026): na medição de terceiros o **medido oficial vem do Levantamento de Campo ou digitação manual**. O avanço do cronograma (planejamentoAvancos) é APENAS consultivo.

**How to apply:**
- `gerarMedicao` cria itens ZERADOS; grava o avanço só em `percentualAvancoFisico` (referência).
- `recalcularMedicao` NÃO sobrescreve `percentualMedidoPeriodo`/valores a partir do avancoMap; recalcula totais do que está na planilha e gera o comparativo: |medidoAcum − avançoObra| > 3% → alerta "medido ACIMA/ABAIXO do avanço da obra" gravado em `alerta_divergencia` (consultivo, não bloqueia). Botão na UI: "Comparar c/ Avanço da Obra".
- Qualquer novo caminho que escreva medido a partir do cronograma quebra essa regra — não criar.

**Why:** o campo é soberano; puxar do cronograma sobrescrevia o levantamento real (2.891 → 5.572 num recálculo) e podia pagar mais do que o executado.

**Quantitativo do levantamento é soberano:** `terceiroLevantamentoSync` calcula valor do período = qtd medida × preço unitário (exato) e deriva o % do valor (nunca o contrário — % arredondado distorcia centavos). `recalcularMedicao` reaplica o levantamento vinculado antes de recomputar totais; item `editadoManualmente` nunca é sobrescrito.

**Futuro combinado:** comparar também com a medição do CLIENTE — % pago ao terceiro não deve superar o % medido/recebido do cliente.
