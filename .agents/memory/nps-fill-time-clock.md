---
name: NPS fill-time clock
description: How the client NPS evaluation fill-duration is measured and why mount-time is wrong for logged-in users.
---

`tempoRespostaSegundos` on `cliente_avaliacoes` records how long the client took to fill the NPS survey (form open → submit), shown only to Admin Master.

**How:** `inicioAvaliacaoRef = useRef(Date.now())` in `PortalDashboardCliente.tsx`, RESTARTED via `useEffect` when `tab === "avaliacao" && !avaliado`. On submit send `min(86400, max(1, round((Date.now()-start)/1000)))`.

**Why the restart (not just mount):** the public short-link opens directly on the "avaliacao" tab, but a logged-in portal user starts on "obras". If the clock started at component mount, time spent browsing Obras/Comentários before answering would inflate the metric. Restarting on tab entry scopes it to the actual fill period.

**How to apply:** any new entry path into the evaluation form must reset the ref, or the duration will be wrong. Value is clamped 0..86400 again on the backend (`criarAvaliacao`).
