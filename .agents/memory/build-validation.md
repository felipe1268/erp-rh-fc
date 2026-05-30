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

## CRÍTICO: esbuild NÃO executa o código — não pega erros de RUNTIME

esbuild só faz parse/transform. Erros que só aparecem em execução passam batido
com exit 0. O caso clássico que mordeu este repo: **TDZ (Temporal Dead Zone)** —
usar uma `const`/`let` ANTES da sua linha de declaração (ex.: um helper `const
toUtc = ...` declarado ABAIXO do bloco que já o chama). JS lança
`ReferenceError: Cannot access 'X' before initialization` em runtime, mas esbuild
valida sem reclamar.

**Como aplicar:** depois de validar com esbuild, SEMPRE reinicie o workflow e
leia os logs do servidor (`refresh_all_logs`) procurando por `ReferenceError`,
`Cannot access`, `before initialization`. Para funções de servidor que gravam
dados condicionalmente dentro de try/catch (ex.: self-heal que popula uma coluna
JSON), um throw silencioso faz a função falhar SEMPRE sem erro visível na UI — o
sintoma vira "o dado nunca é gravado / fica NULL", não um crash. Confirme no
banco (read-only) que a escrita esperada de fato aconteceu.
