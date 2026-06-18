---
name: Portal do Cliente ↔ Planejamento parity
description: O Portal externo deve REPLICAR a fonte única do módulo Planejamento (% Previsto, realizado, desvio, Curva S), nunca recalcular.
---

# Portal do Cliente ↔ Planejamento — single source of truth

**Regra:** o Portal externo (`server/routers/portalExterno.ts`, `cliente.planejamentoObra`)
não pode ter cálculo PRÓPRIO de avanço para os KPIs/curvas visíveis ao cliente. Ele tem que
ler EXATAMENTE a mesma fonte que o engenheiro vê no módulo (`PlanejamentoDetalhe.tsx`):

- **% Previsto (raiz):** usar `parsePrevistoCurva(previstoSemanasJson, previstoLiteralJson, revisaoId).raizAt(cutoff)`
  (`shared/previstoCurva.ts`) — réplica fiel do hook `previstoCurva`/`raizAt`. O override
  literal (`previsto_literal_json`) tem PRIORIDADE sobre a curva `.raiz` (motor minuto-a-minuto).
  Ordem de precedência num mesmo cutoff: **literal > raiz da curva > `previstoMspSnapshot` (Texto11)**.
  São 3 valores que podem coexistir e DIFERIR (ex.: REVTE-CIVIL 11/06/2026 = literal 9, raiz 10, snapshot 8).
- **% Realizado (raiz):** espelhar `calendarioJson.realizadoMspSnapshot` com o gate do `avancoAtual`
  (snapshot + statusDate + envSnapOk + monotonicidade cutoff>=statusDate). Nunca média ponderada própria.
- **Curva S de trabalho:** reusar o núcleo `computeCurvaSData(input)` extraído de `planejamento.getCurvaS`
  (getCurvaS virou wrapper). Chamar com `usarPesoPorDuracao:true` via `await import("./planejamento")`
  (import dinâmico — planejamento.ts NÃO importa portalExterno.ts, então sem ciclo).

**Why:** o piloto FC usa o módulo interno como "verdade absoluta"; qualquer recálculo paralelo
no Portal gera divergência visível ao cliente (% Previsto, desvio e Curva S diferentes da tela
do engenheiro). Histórico: Rev. 3286 (realizado), Rev. 3288 (% previsto + Curva S).

**How to apply:** ao tocar QUALQUER KPI/curva do Portal de planejamento, primeiro ache o
equivalente no módulo e replique-o; fallback (snapshot/linear/curva ponderada local) só quando
a fonte primária está ausente/stale — e LOGAR no catch p/ não mascarar divergência silenciosa.
