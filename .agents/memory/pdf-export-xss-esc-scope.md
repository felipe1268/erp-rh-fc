---
name: PDF/print export functions need their OWN local esc/escAttr
description: Each window.open()+document.write() export defines esc locally; new ones (and AI-fed fields) must escape or it's DOM XSS.
---

# Every print/PDF export builds raw HTML → escape ALL dynamic content per-function

The print/PDF exports in this app (e.g. `handleExportSST`, `gerarFichaAvaliacaoCliente`
in `RaioXFuncionario.tsx`) build an HTML string and feed it to a NEW window via
`printWindow.document.write(html)`. `esc`/`escAttr` are defined **locally inside each
function** — there is no shared/global escaper. A new export function (or new fields
added to an existing one) that interpolates dynamic data without `esc()` is DOM-based
XSS in the authenticated context.

**Why:** Rev. 3119 added AI-extracted ASO text (restrições/fatores de risco — fully
attacker-influenceable) straight into `handleExportSST`'s HTML; that function had NO
esc in scope (the `esc` a few lines below belonged to a *different* function). Code
review FAILed it as XSS until a local `esc`/`escAttr` was added and every dynamic
token (AI ficha, ASO/training rows, header, attachment/logo URLs) was wrapped.

**How to apply:** when touching ANY `document.write`/`new window` HTML builder, confirm
the function defines its own `esc`/`escAttr` and that EVERY `${...}` of non-constant
data goes through `esc` (text) or `escAttr` (href/src/attributes). AI-sourced text is
the highest-risk input — never trust it as "internal".
