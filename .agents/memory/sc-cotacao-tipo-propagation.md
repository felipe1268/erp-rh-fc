---
name: SC → cotação propagation of `tipo`
description: editing a SC must reconcile linked cotação, and EVERY cotação-creation path must seed tipo from the SC
---

A cotação's badge (MAT / MDO / MAT+MDO / EQUIP) is driven by `compras_cotacoes.tipo`
(varchar 30, default "material"), set independently from `compras_solicitacoes.tipo`.

**Rule:** consistency SC×COT must be enforced on BOTH ends:
1. On EDIT — `editarSolicitacao` must propagate the resolved `tipo` (`input.tipo ?? sc.tipo`)
   to active linked cotações (`WHERE solicitacao_id = id AND status NOT IN ('cancelada','recusada')`),
   not just the título→descricao. The tipo used to be left frozen at creation.
2. On CREATE — every path that inserts a cotação from a SC must seed `tipo: sc.tipo ?? "material"`.
   `aprovarSolicitacoesEmLote` was omitting it (fell to "material"); the unitary approval path set it.

**Why:** the tipo drives downstream OC generation (MAT/MDO/FD split via `cot.tipo`, with fallback
to `sc.tipo` in some readers) and the visible legend. A divergent tipo silently mislabels the
cotação and can mis-split the OC.

**How to apply:** when adding any NEW cotação-insert or SC-edit path, set/propagate tipo. Note
`compras_cotacoes_itens` has NO tipo column — per-item tipo is derived at OC generation via ratioMat,
so nothing to propagate at item level.
