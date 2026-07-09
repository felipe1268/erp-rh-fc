---
name: OFX CHECKNUM as cheque number source
description: Newer OFX bank statement exports carry the cheque number in a structured field, not just free text.
---

Some banks (e.g. Santander, in newer OFX exports) put the cheque number in the `<CHECKNUM>` field of each `<STMTTRN>`, separate from `<MEMO>` (which may say only "CHEQUE EMITIDO/DEBITADO" with no number at all). `<CHECKNUM>00000000</CHECKNUM>` means "not applicable" (non-cheque transactions) — must be treated as absent, not as a real number.

**Why:** relying only on regex extraction from the description text misses these lines entirely, since the free-text memo has no digits to extract; that was the direct cause of ~190 unmatched cheque reconciliation lines for one tenant.

**How to apply:** when parsing OFX, always check `<CHECKNUM>` first (ignore all-zero). Treat it as the most reliable source of the cheque number — more trustworthy than any description-based heuristic. In `server/routers/financial.ts`, the OFX parser appends `" Nº <checknum>"` to the description when a cheque keyword is present and the number isn't already in the text, so the existing `identificarCheque()` heuristics pick it up naturally without needing a schema change.

**Retroactive backfill without re-import:** `bank_statement_lines` has no `fitid`/`numero_cheque` column, so rows imported before this fix can only be corrected by matching the (re-)provided file's parsed transactions (date + valor + tipo, per `company_id`/`conta_bancaria_id`) against existing DB rows and patching `descricao` directly. If more than one DB row matches a given date+valor+tipo (e.g. two identical-value cheques same day), skip it — never guess which is which.
