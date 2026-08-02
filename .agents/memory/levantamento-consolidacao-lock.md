---
name: Consolidação do levantamento (lock) + revisão de medição
description: medicao_campo.consolidado_em = só-leitura; regras de guard em todo write, sync offline e PDFs; revisão em terceiro_medicoes
---

Regra: `medicao_campo.consolidado_em IS NOT NULL` = levantamento SÓ-LEITURA.

**Como aplicar (todo write novo do levantamento deve seguir):**
- Server: chamar `assertCampoNaoConsolidado` (medicao.ts) em QUALQUER procedure que escreva contorno/foto/serviço.
- Plantas (PDFs) vivem na BIBLIOTECA (campo status=biblioteca, nunca consolidado): guard é `assertPdfSemCampoConsolidado` — bloqueia excluirPdf e recalibração se ALGUM campo consolidado tem contornos naquela planta.
- sincronizarLote (offline): NUNCA devolver "erro" para op de campo consolidado (fila loopa no iPad) — descartar com status "ok" + mensagem "Ignorado: levantamento consolidado".
- Aprovar medição de terceiros (aprovarMedicao E aprovarNivelSocio) consolida automaticamente o levantamento vinculado (idempotente, `consolidado_em IS NULL`).
- Desconsolidar: bloqueado p/ viewer e se medição vinculada aprovada/paga — checar por consulta REVERSA `terceiro_medicoes.levantamento_campo_id = campo.id` (campo.medicaoId nem sempre populado).
- cancelarAprovacao incrementa `terceiro_medicoes.revisao` (+revisado_em/por_nome); REV. N aparece na lista, no PDF e no boletim FCSign.

**Why:** pedido do usuário (ago/2026): clique acidental não pode apagar levantamento; medição aprovada = quantitativo congelado; ajuste exige desaprovar → desconsolidar → editar → reconsolidar → nova revisão com rastro.

## Rev. 4807 — excluir planta = arquivar
Excluir planta da biblioteca NÃO é mais bloqueado por consolidação: soft-delete "arquiva" — getCampo re-inclui plantas deletadas que têm contornos ativos DO PRÓPRIO campo (flag `arquivada: true`, chip âmbar, sem X). Só contornos de campos NÃO consolidados são apagados junto; senha de ADM Master só quando há contornos em aberto que se perderiam.
**Why:** usuário precisa trocar a planta do contrato pela do cadastro da obra (projetos/pavimentos) sem perder o histórico consolidado.
