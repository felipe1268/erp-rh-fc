---
name: /uploads DB-fallback MIME + traversal
description: Why off-disk attachments serve octet-stream (and break iOS preview), and the security guard the fallback needs.
---

# /uploads serving has TWO paths with different MIME behavior

`server/_core/index.ts` serves `/uploads` via (a) `express.static` (disk) and (b) a
DB fallback (`dbRetrieve` → `uploaded_files`) used when the ephemeral disk has lost
the file (Cloud Run / restarts).

- **Disk path** infers Content-Type from the file extension → correct MIME.
- **DB fallback** historically echoed the stored `uploaded_files.content_type`.
  Many legacy rows were stored as `application/octet-stream`.

**Why it matters:** Safari/iOS REFUSES to render an `image/*` or PDF inside
`<img>`/`<iframe>` when the response is `application/octet-stream` → the preview
(`DocumentPreviewDialog`) opens BLANK. The bug is intermittent because the disk
path (correct MIME) works until the file is evicted, then the fallback (bad MIME)
kicks in. The screen wiring is NOT the bug — look at the serve headers.

**How to apply:** when content_type is empty/octet-stream, derive MIME from the key
extension (`mimeFromKey`) before setting the header. Prefer fixing the data too
(`UPDATE uploaded_files.content_type` by extension; never touch `.dwg`/`.ifc` CAD —
no browser MIME). Both belong together.

## Security: the DB fallback writes to disk from a request-derived key
The fallback does `writeFileSync(path.join(uploadsRoot, key), buffer)` where `key`
comes from `req.path`. This is a path-traversal write sink — confine it with
`path.resolve(uploadsRoot, key)` + `startsWith(uploadsRoot + sep)` (else 400).
The disk middleware guards traversal; the DB fallback must repeat the guard.

## The DB-fallback key must be decodeURIComponent'd, or space/accent filenames 404
Inside the async `/uploads` DB-fallback handler, `req.path` arrives still
URL-encoded (`%20` etc.) — unlike in the sibling Range-cap middleware a few lines
above, which already calls `decodeURIComponent`. If the fallback key isn't decoded
too, it never matches `uploaded_files.file_key` (stored with literal spaces/accents)
→ false 404 "Arquivo não encontrado".

**Why it stayed hidden for months:** the ephemeral container disk still had a local
copy of recently-uploaded files, so `express.static` served them BEFORE ever
reaching the buggy fallback. Only files whose disk copy was evicted (old upload +
container restart/redeploy) actually exercised the fallback and exposed the bug —
looked "random"/"only old files", not "any filename with a space".

**How to apply:** any code that derives a storage/DB key from `req.path` (or builds
one manually to compare against a stored key) must decode it first. When a fallback
mechanism has two related middlewares, verify they treat the request path IDENTICALLY
(decode, casing, trailing slash) — divergence between "twin" middlewares is a classic
source of intermittent, hard-to-reproduce-locally-until-you-check bugs.
