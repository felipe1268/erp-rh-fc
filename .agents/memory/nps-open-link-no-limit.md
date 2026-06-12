---
name: NPS open link had no per-use limit
description: Public NPS evaluation links (no credId) accept unlimited submissions unless a per-link claim exists
---

The Portal do Cliente NPS "link aberto" (token without `credId`/`portalId`)
historically had NO submission limit: `criarAvaliacao` only marked
`cliente_avaliacao_marcacoes` when a `credId` was present, and
`podeAvaliarEsteMes` returned `podeAvaliar:true` whenever `!credId`. So one
shared link = unlimited evaluations.

**Why it matters:** if you need "one evaluation per link", you cannot rely on
the period/credId machinery — those paths are skipped for open links. You need
a per-link nonce.

**How to apply:** one-shot links embed a `linkId` (UUID) in the JWT and are
"consumed" via an atomic `INSERT ... ON CONFLICT (link_id) DO NOTHING RETURNING`
into `cliente_avaliacao_link_uso`. Do the claim INSIDE the same transaction as
the avaliacao insert so a failed insert rolls the claim back (ZERO DELETE rule
forbids compensating deletes). Tokens WITHOUT `linkId` keep the old unlimited
behavior (backward-compat).
