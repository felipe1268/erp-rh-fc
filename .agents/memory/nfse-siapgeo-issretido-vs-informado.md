---
name: SIAP GEO NFS-e bulk import — ISS informado ≠ ISS retido
description: Why the SIAP GEO bulk NFSe XML export must never map vl_iss into the fiscal_notes.iss_retido column
---

The SIAP GEO bulk NFSe export format (`<nfse><nf>...</nf></nfse>`, values in centavos) has NO field indicating whether ISS was actually retained by the tomador — `vl_iss` is just the ISS due/informed on the note.

`fiscal_notes.iss_retido` is a monetary column read by the Notas Fiscais screen's `calcValorLiquido` to RECOMPUTE Valor Líquido every time a note is reopened/saved (Bruto − ISS retido − retenções federais). Writing `vl_iss` into `iss_retido` at import time silently corrupts the correct import-time Valor Líquido the first time someone reopens and saves the note.

**Why:** caused a real data-corruption incident — 569 already-imported NFS-e ended up with Valor Líquido diverging from the real document (Rev. 4125 fix + backfill).

**How to apply:** for any NFS-e import format lacking an explicit retention flag, default `iss_retido = 0` (informational ISS goes into a text annotation, e.g. Discriminação, not the retido column). Only individual ABRASF XML (which has `ValorLiquidoNfse` and `IssRetido` 1/2 flag) or AI/PDF extraction (trusting the document's own declared Valor Líquido) are safe to trust directly — never recompute Valor Líquido from a guessed retention amount.
