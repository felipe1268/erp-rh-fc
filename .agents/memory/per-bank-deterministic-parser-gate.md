---
name: Per-bank deterministic parser must gate on bank-detection
description: A heuristic deterministic parser used as a pre-AI shortcut must only emit when it positively identifies its bank, or it hijacks other banks' AI fallback.
---

When `parseExtratoLines` (server/routers/financial.ts) chains deterministic PDF
parsers before the AI fallback (Caixa → Banco do Brasil → IA), each bank-specific
parser also runs a GENERIC line heuristic (date + `9.999,99 C|D` money token) that
can extract plausible-but-wrong rows from ANY text PDF.

**Rule:** only adopt a per-bank parser's output when its own `isBancoX` detection
flag is true. Gating on "produced ≥1 line" is NOT enough — a non-BB text statement
can yield non-empty `bb.lines` and silently skip the IA fallback, importing garbage.

**Why:** Rev. 3311 first did `lines = bb.lines` unconditionally; architect caught
that an Itaú/Bradesco text PDF would be parsed by the BB heuristic and never reach
the AI fallback, corrupting the import.

**How to apply:** any new deterministic statement/invoice parser added as a pre-AI
shortcut must return a positive-identification flag and the caller must do
`if (parser.isThatBank) lines = parser.lines;` — otherwise leave `lines` empty so
the next stage (or AI fallback) runs.
