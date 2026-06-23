---
name: SyncSchema+ log capture vs dead-zone
description: Log file for a startup can be cut off before all SyncSchema+ entries finish; entries are NOT in a dead zone.
---

## Rule
The SyncSchema+ block in `server/_core/index.ts` (inside `server.listen → syncSchema().then(async () => { try { ... } }`) runs ALL entries sequentially — there is NO dead zone.

**Why:** Log files captured mid-run appeared to end at `[SyncSchema+] Rev. 3051: índice único idx_cp_employee_uniq` (code line ~1296), making it seem like entries on lines 1297+ never ran. In reality the log file was simply captured before those entries finished printing. A full capture shows Rev.2551, Rev.2805, etc. all running normally after Rev.3051-idx.

**How to apply:** New SyncSchema+ entries can be placed anywhere in the block and will run. To verify an entry ran, either wait for the full log (2793+ lines) or query Neon directly to confirm the schema change.

## SEFAZ chave_acesso double corruption
The 115 `fiscal_notes` rows with `numero_nf LIKE '%.%'` also have `chave_acesso` in scientific notation (e.g. "3.526062546426e+43"). fast-xml-parser parsed the 44-digit key as float64, losing ~28 digits of precision. Position 26-34 (the NF number) falls beyond float64 precision → cannot be recovered via SQL. Only XML recovery via SEFAZ (`recuperarXmlsBackfill`) can fix these rows. Frontend `resolveNumeroNf()` displays defensively until XMLs are recovered.
