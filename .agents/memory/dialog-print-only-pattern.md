---
name: Print/PDF a Radix Dialog's content
description: How to add an "Imprimir/PDF" button that prints only a dialog's content, not the whole app
---

To print just the content of a Radix `Dialog` (not a whole page), do NOT use the
`window.open("", "_blank") + document.write(...)` pattern (that's for full custom-HTML
reports built entirely from data, used elsewhere in the codebase e.g. SeguroVida.tsx).

Instead use the `print-only` class convention (see `client/src/index.css` `@media print`
block, and `DashAvisoPrevio.tsx`):

1. Wrap the printable content in a `<div id="some-print-area">`.
2. On click: `el.classList.add('print-only')`, then `window.print()`.
3. Remove the class on the `afterprint` event (plus a `setTimeout` fallback ~5s, since
   some browsers don't fire `afterprint` reliably).
4. A global CSS rule already hides everything in the DOM tree except `.print-only` and
   its ancestors, and preserves the Radix portal containing it (dialog overlay/backdrop
   are otherwise hidden in print). No extra CSS needed per-dialog.
5. Optional: add a `<p className="hidden print:block">` header inside the print area for
   a print-only title (Tailwind `print:` variant is already enabled project-wide).

**Why:** browser-native full-page print/PDF of a SPA would print the whole app (sidebar,
backdrop, etc.); this project's established fix is a global CSS toggle, not per-page popup
windows or custom document.write HTML.

**How to apply:** whenever asked to "add a print/PDF button" to something rendered inside
a Dialog/Sheet/modal, reach for this pattern first (grep `print-only` for more examples:
`Epis.tsx`, `EspelhoPonto.tsx`, `PlanejamentoDetalhe.tsx`, `DashAvisoPrevio.tsx`).
