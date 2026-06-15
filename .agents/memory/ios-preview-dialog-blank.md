---
name: iOS preview dialog blank
description: Why DocumentPreviewDialog can render blank on iPad/iOS Safari even when the file serves correctly
---

# DocumentPreviewDialog blank on iOS

When a document preview opens BLANK on iPad/iOS Safari but the file serves
fine (HTTP 200, correct Content-Type) and renders in top-level navigation,
the cause is CLIENT-SIDE rendering inside the Radix Dialog, NOT serving.

Two distinct iOS Safari/WKWebView traps:
- An `<img>` carrying an always-on (even identity) `transform` + `transition-transform`
  nested inside a `position:fixed` (transformed) modal triggers iOS's blank
  compositing-layer bug. Fix: apply the transform ONLY when non-identity
  (zoom!==1 || rotation!==0 || pan!=0); at rest use `transform: undefined`.
- iOS Safari does NOT paint PDFs in `<iframe>` → blank. Provide a top-level
  "Abrir" (`window.open`) escape hatch; for PDFs on iOS show a "tap Abrir" card
  instead of the iframe.

**Why:** Rev. 3108 already fixed the SERVING side (octet-stream→correct MIME via
mimeFromKey). The residual iOS blank was purely the dialog's CSS/iframe behavior.

**How to apply:** Before chasing serving/Content-Type for an "abre em branco no
iPad" report, curl the URL + screenshot the raw URL top-level. If it renders,
the bug is in the preview component, not the backend. Always give images/PDFs a
guaranteed "Abrir" button + image onError fallback.
