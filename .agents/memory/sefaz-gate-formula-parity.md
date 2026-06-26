---
name: SEFAZ auto-sync gate formula parity
description: Why "o cronômetro zera mas não sincroniza" — the 4 SEFAZ gate formulas must all match the one authoritative backend gate.
---

# SEFAZ auto-sync: todas as fórmulas de gate devem casar com o gate autoritativo

There is ONE authoritative gate that decides if SEFAZ is actually called: `executarSyncNFe`
in `server/routers/sefaz.ts`, `cooldownMin = intervaloHoras*60 + 3` (× backoff progressivo
1/2/4 conforme 656 consecutivos lidos de `last_sync_result.rateLimitConsecutive`).

There are THREE other places that estimate "when can we sync again", and they MUST mirror it:
1. Client countdown + display ring (`FinanceiroNotasFiscais.tsx`) — drives both the visible
   timer AND the auto-disparo at countdownSec===0.
2. Cron eligible-company selection (`runHour` in sefaz.ts).
3. Cron diagnostic log line.

**Why:** Se qualquer uma delas usa um valor MENOR (ex. `*60 - 2` ou `*60 - 8`), ela "abre"
antes do gate real. O auto-disparo do cliente então chama `syncNow` cedo demais, o gate
atômico do backend REJEITA (retorna `aviso`, NÃO atualiza `last_sync_at`), e o guard de
"1 disparo por janela" (`autoSyncFiredForTsRef`) marca a janela como já-disparada → NUNCA
re-tenta. Sintoma: cronômetro zera e fica em "Cota renovada — sincronizando automaticamente"
sem nunca importar nada.

**How to apply:** Ao mexer em QUALQUER timer/seleção de SEFAZ, garanta paridade com
`intervalo*60 + 3` (×backoff). O cliente deve incluir o ×mult do backoff no countdown e uma
pequena folga (ex. +3s) para nunca disparar ~1s antes do servidor (floor do countdown +
jitter de relógio desperdiçariam o one-shot). NÃO remover o backoff (Rev. 3738, anti-656).
A garantia de "consulta após o intervalo" vem do CRON (página fechada); o auto-disparo do
cliente é só conveniência quando a página está aberta. Seleção do cron pode ficar permissiva
quando mult>1 (seleciona em +3 base, gate interno em +3×mult rejeita barato sem HTTP).
