---
name: Radix Select popper overflow cuts long item text on mobile
description: Long SelectItem text (e.g. obra/project names) gets visually clipped inside the dropdown on narrow viewports
---

The shared `SelectContent` (position="popper") has no max-width — content width can grow to fit
the longest single-line item, exceeding the mobile viewport. Radix's collision handling then
shifts/clips the popover, visually cutting off the start of long item labels (looked like the
first letter(s) of a long obra/project name were missing).

**Why:** `SelectItem`/`SelectValue` have no wrap/truncate styling by default, and `SelectContent`
only sets a `min-width` tied to the trigger, not a `max-width` tied to the viewport.

**How to apply:** for any Select whose options can contain long free-text names (obra, cliente,
projeto, fornecedor...), override per-instance:
- `SelectContent className="max-w-[min(28rem,calc(100vw-2rem))]"`
- `SelectItem className="whitespace-normal break-words leading-snug py-2"`

This wraps long labels onto multiple lines instead of letting them overflow/clip. Don't change
the shared `select.tsx` globally — apply the override at the specific call site to avoid affecting
other selects that rely on single-line truncation.
