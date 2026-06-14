---
name: react-pdf ↔ pdfjs-dist worker version coupling
description: PDF viewers show "Erro ao carregar PDF" when the bundled worker version differs from react-pdf's internal pdfjs API version.
---

The PDF viewers (`MedicaoLevantamento.tsx`, `PdfViewer.tsx`) import the worker via
`import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url"` (the HOISTED
`pdfjs-dist`), while react-pdf uses its OWN bundled `pdfjs-dist` for the API.

**Rule:** the direct `pdfjs-dist` version in `package.json` MUST equal the exact
version react-pdf depends on (check `react-pdf/package.json` → `dependencies.pdfjs-dist`,
e.g. react-pdf@10.4.1 → 5.4.296). Pin it exactly, not `^`.

**Why:** pdf.js throws a hard fatal error when API and Worker versions differ
("The API version X does not match the Worker version Y"); react-pdf then renders
its `error` fallback = the cryptic "Erro ao carregar PDF". The file itself serves
fine (HTTP 200, valid bytes) — symptom is render-only, easy to misdiagnose as a
storage/serving bug.

**How to apply:** when "Erro ao carregar PDF" appears, first compare versions:
`react-pdf/package.json` deps vs hoisted `node_modules/pdfjs-dist/package.json`
(and `.pnpm/` symlinks). Any upgrade of react-pdf is a COUPLED change — realign the
`pdfjs-dist` pin in the same revision. Worker stays Vite-bundled (no CDN) to keep
the field-survey offline mode working.
