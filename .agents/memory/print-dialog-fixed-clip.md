---
name: Printing content from a Radix Dialog
description: Why print output from inside a Dialog gets clipped/ugly, and the preferred fix.
---

Printing a report that lives inside a Radix `DialogContent` (`position:fixed` + internal
`overflow-y-auto`/`overflow-x-auto`) via a `.print-only` CSS class + `window.print()` is fragile:
columns/pages get clipped because the browser prints the scrolled/overflow-constrained box, not a
reflowed document, even after `position:fixed` is neutralized for print.

**Why:** the dialog's own layout constraints (fixed position, scroll container, inherited SPA CSS/
Tailwind utility conflicts) fight the print engine's page-flow model. The result is columns cut off
and unstyled output as reported by real users ("layout de impressão horrível").

**How to apply:** for any report/table triggered from inside a Dialog, prefer generating a fully
self-contained HTML string (own `<style>`, `esc()` for XSS-safety per `pdf-export-xss-esc-scope`,
letterhead with logo) and opening it via `window.open('', '_blank')` + `document.write` + `window.print()`
in a `setTimeout`. This is the proven pattern already used in `DashAvisoPrevio.tsx`
(`gerarRelatorioCombo`) and now also in `FolhaPagamento.tsx` (`handlePrintDissidioRel`, dissídio
report). It sidesteps all Dialog/overflow/CSS-print fragility entirely and gives full control over
page orientation (e.g. landscape for wide tables), fonts, and colors (`-webkit-print-color-adjust:exact`).
Only use the `.print-only` class approach for content that's NOT inside a scrollable/fixed Dialog.
