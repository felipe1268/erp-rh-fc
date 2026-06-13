---
name: AI JSON breaks on BR number format
description: LLM price/number JSON often emits BR-formatted numbers that break strict JSON.parse; need a salvage path.
---

When an LLM is asked to return JSON with numeric values (prices, valor, etc.), it
will sometimes ignore "use dot decimal / no thousand separator" instructions and
emit Brazilian-format numbers like `"valor": 2.500,00` or `2.500.00`. These are
syntactically INVALID JSON — `JSON.parse` reads `2.500` then hits `,00`/`.00` and
throws `Expected ',' or '}' after property value in JSON at position N`. A single
malformed value aborts the WHOLE batch, so nothing gets saved.

**Why:** strict `JSON.parse(raw)` as the only path is brittle for LLM output.

**How to apply:** wrap LLM JSON parsing as `try { JSON.parse } catch { salvage }`.
The salvage = regex that extracts each object's string fields + the numeric token,
then normalize the number with a BR-aware parser (both `.`+`,` → last separator is
decimal; only `,` → decimal if ≤2 trailing digits else thousand; only `.` →
`2.500.00`→2500.00, `2.500`(3 trailing)→2500 thousand, else keep decimal). Make the
value-capture regex tolerant of an `R$ ` prefix too. Reference impl lives in
`equipamentos.ts` `propriosGerarPrecosComIA` (`parseValorBR`, `extrairPrecosResiliente`).
