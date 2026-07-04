---
name: Changelog JSDoc date extraction validation gap
description: extractData() in server/changelogJsdoc.ts only range-checked day 1-31 / month 1-12, not days-in-month; recurred after a prior "fix" documented in changelog.ts wasn't actually implemented in code.
---

`extractData()` (parses the first `dd/mm/yyyy` in a changelog JSDoc body into `dataPublicacao`) validated only `1<=d<=31` and `1<=mo<=12`, not the real days-in-month. A date like `29/02/2025` (2025 isn't a leap year) or `31/04/...` passes that check, then `createRevisionsBulk`'s INSERT throws `date/time field value out of range`, caught and logged by `syncRevisions` (non-fatal, but noisy on every restart).

**Why:** a changelog.ts entry earlier *described* fixing this exact bug ("datas inválidas viram vazio"), but the described fix was never actually landed in `changelogJsdoc.ts` — the description and the code diverged. Don't trust a changelog narrative as proof the underlying code still has the guard; verify the current source.

**How to apply:** if this error resurfaces, check `extractData()` in `server/changelogJsdoc.ts` computes days-in-month via `new Date(year, month, 0).getDate()` and rejects `day > diasNoMes`. If any new changelog entry accidentally embeds an impossible `dd/mm/yyyy` in prose, this guard now returns `undefined` (no dataPublicacao) instead of crashing the sync.
