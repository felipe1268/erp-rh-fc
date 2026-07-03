---
name: pdf-parse splits table rows into multiple text lines
description: A bank-statement PDF table row can extract as 2-3 separate text lines (date-only, description, value) instead of one line; a single-line regex parser then silently matches nothing.
---

Some PDF table layouts (observed on Santander "Internet Banking Empresarial"/IBPJ
statements) extract via `pdf-parse` with each table CELL on its own text line
rather than the whole row on one line: a bare date line, then one or more
description lines, then a value line (sometimes with extra reference text glued
onto the value with no space, e.g. `"FELIPE COSTA ALVES ME- R$ 37.000,00"` or
`"26/06/2026- R$ 5,30"`).

**Why:** a parser written against a single-line-per-transaction regex will match
zero real lines against this extraction and fail SILENTLY (return an empty list
instead of throwing), because the per-bank detection gate (e.g. `isIbpj`) still
passes even though the row-level regex never fires.

**How to apply:** when writing/debugging a deterministic PDF statement parser,
don't assume `pdf-parse` preserves visual row layout — dump the raw extracted
text first and check whether each row is one line or split across several. If
split, use a stateful block scanner: open a block on a "pure marker" line (e.g.
date-only), accumulate lines as content, and close the block on the line that
contains the terminal marker (e.g. contains "R$"), treating leading text on that
line as extra content too. Validate any such fix by reconciling parsed amounts
against an independent total in the same document (e.g. daily running balance
lines) rather than just checking non-zero output.
