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
