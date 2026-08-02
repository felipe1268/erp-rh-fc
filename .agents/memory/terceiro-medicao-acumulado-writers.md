---
name: Acumulado dos itens de contrato de terceiros
description: Quem pode escrever percentual/valor_medido_acumulado em terceiro_contrato_itens e por quê
---
Regra: `terceiro_contrato_itens.percentual_medido_acumulado`/`valor_medido_acumulado` refletem SOMENTE medições aprovadas/pagas. Writers permitidos: aprovar (gestor simples/sócio), cancelarAprovacao, excluirMedicao, re-escala de aditivo. `recalcularMedicao` NUNCA escreve nessas colunas.

**Why:** Rev. 4804 — recalcular um RASCUNHO gravava o acumulado no item; ao excluir o rascunho a reversão era pulada (`status !== 'aprovada'`) → contrato mostrava "Medido Acumulado"/"Saldo a Liberar" fantasma com 0 medições (CT-2026-0006).

**How to apply:** exclusão/cancelamento devem RECALCULAR o acumulado a partir das medições aprovadas/pagas remanescentes (não subtrair), em transação. Qualquer novo caminho de escrita nessas colunas deve checar o status da medição e ter `_assertCompanyAccess`.

## Rev. 4808 — "Já medido neste contrato" (levantamento)
getHistoricoQuantidades e getContornosReferencia só contam campos cuja medição vinculada (terceiro_medicoes.levantamento_campo_id OU campo.medicao_id) está aprovada/paga — helper filtrarCamposComMedicaoFechada. **Why:** levantamentos duplicados/abandonados (rascunho, consolidado sem medição fechada) mostravam m² "já medidos" fantasmas na primeira medição.
