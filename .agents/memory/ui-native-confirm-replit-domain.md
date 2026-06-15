---
name: window.confirm shows ugly Replit domain
description: Native confirm/alert/prompt prefix the origin ("<domain> diz") which in the Replit preview is a long hash — use a styled dialog instead.
---

Native `window.confirm()` / `window.alert()` / `window.prompt()` ALWAYS prefix the
popup with the page origin ("<domínio> diz" / "<domain> says"). In the Replit
preview the origin is a long hash like `b41aedae-….replit.dev`, which looks broken
to users. There is NO way to remove or style that prefix on a native dialog.

**Why:** users repeatedly flag the hash domain as "códigos feios" in alerts.

**How to apply:** for any destructive confirmation in a page, use the shadcn
`AlertDialog` (`@/components/ui/alert-dialog`) via a small reusable pattern — a
`confirmDlg` state + `askConfirm({title, description, confirmText, onConfirm})`
helper rendering ONE `<AlertDialog>` at the end of the component. For value input
prompts use a `NumberPromptDialog`-style modal, not `window.prompt`.
