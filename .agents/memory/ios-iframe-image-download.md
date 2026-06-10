---
name: iOS iframe image/attachment → download
description: Why image attachments must render via <img>, not <iframe>, in document viewers
---

On iOS Safari, an IMAGE url (or any url served with `Content-Disposition: attachment`)
placed inside an `<iframe src=...>` does NOT render inline — Safari treats it as a
top-level navigation and offers Save/Download. Symptom: a "Visualizar documento"
modal shows a blank gray area + the browser's download prompt for the file.

**Rule:** in-app document viewers must branch by type — render images with `<img>`
(renders inline everywhere, ignoring Content-Disposition) and reserve `<iframe>` for
PDFs. Reuse `client/src/components/DocumentPreviewDialog.tsx`, which already does this
(needs both `fileUrl` AND `fileName` — returns null otherwise — and infers type from
the URL/name extension).

**Why:** a hand-rolled `Dialog`+`<iframe>` viewer in the SST `EmployeeDetailDialog`
caused exactly this on the iPad for `.jpeg` atestados.

**How to apply:** any new "view attachment on screen" feature should go through
`DocumentPreviewDialog` rather than a raw iframe. If the URL has no extension, type
inference fails and it falls back to an "Abrir em nova aba" link — acceptable, but
extension-bearing URLs preview correctly.
