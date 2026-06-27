---
name: Panorama Fiscal — duas noções de "com nota"
description: No DashNotasFiscais há DOIS conceitos distintos de cobertura fiscal; não confundir ao mexer em gauges vs comparativos.
---

O dashboard "Notas Fiscais" (DashNotasFiscais.tsx, backend `getPanoramaFiscal` em fiscalNotes.ts) tem DUAS noções diferentes de "movimento com nota", que NÃO batem entre si:

1. **Gauge "Saída c/ nota" (`coberturaSaidaNfe`)** = ratio de VOLUME: Σ NF-e recebidas / Σ débitos bancários. NÃO depende de conciliação manual; reflete cobertura documental agregada. Idem `coberturaNfseReceita` (Σ NFS-e / Σ créditos).

2. **Split por linha (`entradasComNota`/`entradasSemNota`/`saidasComNota`/`saidasSemNota`)** = identificação LINHA-A-LINHA: uma linha de extrato é "com nota" quando existe `fiscal_notes.stmt_line_id = bank_line.id` (`fn_id != null`). É o vínculo conciliado real, por movimento.

**Why:** o card "Movimentos com Nota × sem Nota" (Rev. 3756) usa o split (2), enquanto a "Saúde Fiscal" usa o ratio (1). Os percentuais divergem por design — um é volume documental, o outro é vínculo por lançamento. Confundir os dois leva a "por que o % da saúde fiscal não bate com o comparativo?".

**How to apply:** ao somar valores do split, use `Math.abs` (helper `sumB` no front / `sumV` no back) — linhas de débito/crédito guardam sinal. Para % de identificação por movimento, derive do split, NUNCA reuse `coberturaSaidaNfe`/`coberturaNfseReceita`.
