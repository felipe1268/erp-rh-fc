---
name: Fluxo de Caixa — cheques a compensar (float)
description: Linha de cheques pendentes no Fluxo de Caixa é INFORMATIVA e nunca soma nas Saídas
---

Regra: cheques emitidos e pendentes ("Cheques a Compensar" / float) aparecem no Fluxo de Caixa como linha âmbar INFORMATIVA, agrupada pelo mês do vencimento ("bom para"). NUNCA somar esse valor em despesas/saídas ou no saldo acumulado.

**Why:** a conta correspondente já foi baixada como PAGA no Contas a Pagar na entrega do cheque (pago ≠ liquidado); somar o cheque de novo seria dupla contagem. O float só informa QUANDO o débito bate no extrato.

**How to apply:** qualquer tela/relatório que queira mostrar comprometimento de cheques deve reusar `cheques.pendentesPorVencimento` (ou o conceito) como camada informativa separada, sem alimentar totais de despesa. Falha nessa consulta não pode derrubar a tela (aviso inline, fora do isError principal).
