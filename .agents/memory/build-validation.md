---
name: Build validation quirk
description: How to validate TypeScript edits in this repo when tsc runs out of memory.
---

Running a full `tsc` typecheck on this repo OOMs (the client file
`PlanejamentoDetalhe.tsx` alone is ~17k lines). To validate edits, transpile the
touched files in isolation with esbuild, which only checks syntax/transform (not
types) but is fast and reliable:

- Client TSX: `npx esbuild <file>.tsx --bundle=false --loader:.tsx=tsx --outfile=/tmp/x.js`
- Server TS:  `npx esbuild <file>.ts --bundle=false --outfile=/tmp/x.js`

Exit 0 = no syntax/transform errors. For type-level confidence, rely on the LSP
diagnostics tool on the specific edited ranges rather than a full project build.
