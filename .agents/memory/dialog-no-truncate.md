---
name: Dialog no-truncate rule
description: User preference — dialogs must NEVER truncate text; use break-words/break-all for long strings (e.g. bank IDs, PIX hashes).
---

## Rule
In **dialog panels** (Radix Dialog, createPortal modals, AlertDialog, sheets): **never use `truncate`**.
Use `break-words` for normal text, `break-all` for technical IDs/hashes (bank statement descriptions, PIX keys, UUIDs, hex IDs).

**Why:** User explicitly demanded: "A tela não pode ter nada cortado, memorize isso e nunca esqueça" (2026-06-21). Long bank statement descriptions like `E003603052026011915090fc72e0a5a7 - DEB PIX CHAVE - ...` were being cut off.

**How to apply:**
- Dialogs: swap `truncate` → `break-words` (names/labels) or `break-all` (IDs/hashes).
- Compact table rows / list cards: `truncate` is acceptable but **add a `title` attribute** so the user can hover to read the full text.
- Dialog headers/subtitles: remove `truncate` entirely, let text wrap.
- Fixed-width sidebar items, badges, tags: `truncate` is fine (space truly constrained).
