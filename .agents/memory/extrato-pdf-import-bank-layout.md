---
name: Extrato bancário PDF import is Caixa-layout-only + AI fallback
description: Why non-Caixa bank statements (Banco do Brasil etc.) need the AI-vision fallback path on import
---

The bank-statement PDF importer (Conciliação Bancária → Importar Extrato) has a
**deterministic parser that ONLY understands the CAIXA internet-banking layout**
(`server/services/caixaPdfParser.ts` classifies rows by FIXED X column positions).
Any other bank (Banco do Brasil, Itaú, Bradesco, Santander...) has different X
positions → the Caixa parser returns 0 rows.

**Rule:** the PDF path in `parseExtratoLines` (`server/routers/financial.ts`) is
two-stage: (1) try the Caixa deterministic parser; (2) if it yields 0 lines, fall
back to `parseExtratoComIA` (`server/services/extratoIaParser.ts`), which reads the
PDF via Gemini Vision → Anthropic fallback (same vision infra as the credit-card
invoice reader). "Not a valid PDF" stays a FATAL error (no AI call).

**Why:** a Caixa-only parser made the screen reject every non-Caixa extract with a
misleading "envie o extrato da Caixa" message. The fix is additive (AI fallback),
not a per-bank deterministic parser — there are too many bank layouts.

**How to apply:** if you add support for a new bank or touch the import flow, do NOT
hardcode another column-position parser unless you have that bank's PDF in hand;
the AI fallback already covers arbitrary banks. Watch the free-tier quota (same
ceiling as the cartão reader): scanned/photo statements and exhausted Gemini+Anthropic
still fail → the UI steers users to OFX/CSV.
