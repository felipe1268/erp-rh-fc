---
name: Gemini free-tier transient failures in batch AI reads
description: Why batch Gemini vision reads (ASOs) fail en masse and the retry/pacing pattern that fixes it
---

# Gemini free-tier transient failures (batch vision reads)

When a screen fires many Gemini vision calls in a burst (e.g. ASO OCR batch of ~94),
the vast majority of "failures" are TRANSIENT API errors, not bad inputs:
- `429` — free-tier quota / per-minute rate limit (metric `generate_content_free_tier_requests`)
- `503` — "model experiencing high demand" / UNAVAILABLE
- occasional truncated JSON when `maxTokens` too low (`Unterminated string in JSON`)

**Why:** the `GOOGLE_API_KEY` here is on the FREE TIER. A client-side burst blows the
per-minute cap; and a retry path that only catches `429` lets `503/500` die on the
first try.

**How to apply (the durable fix shape):**
- Backend `invokeGeminiVision` (server/_core/llm.ts): retry must cover 429/500/502/503/504,
  and wait `max(API-suggested retryDelay, exponential backoff)`. The API returns the
  suggested delay in the error body under `error.details[].retryDelay` ("30s") — parse it.
- For long laudos bump `maxTokens` and make the JSON parser SALVAGE truncated output
  (cut at last top-level comma + close brace → partial reviewable extraction, not "Falha").
- Client batch runner: PACE between items (~3.5s) AND retry per-item on transient errors,
  so the two layers reinforce instead of hammering the quota.

**Hard ceiling:** retry+pacing only smooth out per-minute/transient errors. If the
DAILY free-tier quota is exhausted, NO code change helps — needs a paid Gemini key or
switching to ANTHROPIC/OPENAI (both are missing_secrets; anthropic integration installed).
