---
name: Extrato bancário PDF import — per-bank deterministic parsers + AI fallback
description: How the Conciliação Bancária PDF import resolves a bank, and why deterministic parsers beat the AI fallback for large statements
---

The bank-statement PDF importer (Conciliação Bancária → Importar Extrato) resolves
the bank in `parseExtratoLines` (`server/routers/financial.ts`) as a chain of
**per-bank deterministic parsers, each gated by its OWN bank-detection** (Caixa →
Banco do Brasil → Santander → ...), and only falls back to `parseExtratoComIA`
(Gemini Vision → Anthropic) when NO bank parser claims the PDF. "Not a valid PDF"
stays a FATAL error (no AI call).

**Why deterministic > AI for these PDFs:** internet-banking statements are
text-selectable, so a state-machine parser over `pdf-parse` text is exact and free.
The AI fallback has a hard failure mode on LARGE statements: a 14-page / ~377
value-line extract blew past `maxTokens:16384` and returned **truncated JSON** →
`JSON.parse` aborted the whole batch with "Não consegui interpretar o JSON da IA".
A deterministic parser sidesteps the token ceiling entirely.

**Per-bank gate rule (critical):** a deterministic parser must emit lines ONLY when
it has POSITIVELY confirmed its own bank (e.g. `isSantander`). Gating merely on
"≥1 line produced" lets one bank's parser hijack another bank's PDF and starve the
AI fallback. Validate a new parser against a REAL PDF before shipping: totals must
reconcile (e.g. Santander dez/2024 → 349 rows, Créditos = Débitos = header total).

**How to apply:** to add a bank, write `server/services/<bank>PdfParser.ts` + a
strict detector, insert it in the chain BEFORE the AI fallback, and only fall through
to AI for banks you don't have a sample for. Watch the AI free-tier quota (same
ceiling as the cartão reader); scanned/photo statements still fail → UI steers users
to OFX/CSV.

**Multi-file import (Rev. 3354):** the importer accepts several files at once
(`importFiles[]` in `FinanceiroConciliacao.tsx`); each is analyzed + inserted in
sequence. Month/year of each line is DERIVED from the line's own date, so multi-file
is inherently multi-month — the "extrato de outro mês" guard runs ONLY in single-file
mode.
