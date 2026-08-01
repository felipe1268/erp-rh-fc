---
name: DXF escala — cabeçalho mente, clustering + plausibilidade
description: Como o Levantamento deriva a escala de DXFs com $INSUNITS errado e múltiplos desenhos no espaço; sidecar versionado no servidor.
---

**Regra:** nunca confiar cegamente no `$INSUNITS` do DXF — cabeçalhos reais mentem (mm com desenho em metros). O parser (`client/src/pages/medicao/dxfPlanta.ts`):
1. Agrupa traços em aglomerados espaciais (grid-hash 1/40 da dimensão + BFS 8-conexo) — arquivos CAD reais trazem 2+ desenhos deslocados (planta + carimbo/cópias). Escolhe o aglomerado que casa com `$EXTMIN/$EXTMAX` (margem 30%); fallback: o com mais pontos.
2. Plausibilidade: maior dimensão × mpu deve dar 3–1000 m; `$INSUNITS` fora disso → testa candidatos métricos/imperiais (`$MEASUREMENT`); único plausível → `escalaHeuristica=true`; ambíguo → `metrosPorUnidade=null` (usuário calibra).

**Poka-yoke:** escala heurística NÃO é `escalaOk` — exige Conferir (2 pontos numa cota, ±2%) antes de liberar o desenho, igual à calibração manual.

**Sidecar servidor:** DXF 50MB+ estoura o Safari/iPad → servidor pré-processa e grava `<key>.planta.json` (SVG+bbox+escala); rota `/api/upload/levantamento-planta/derivar` gera sob demanda (auth + tenant via prefixo da key, singleflight). `DXF_ALGO_VERSION` no JSON: qualquer mudança no parse DEVE bumpar a constante ou sidecars cacheados servem escala velha.

**Why:** DXFs reais do usuário (TÉRREO 19×10 m com INSUNITS=4/mm e 2 clusters; POITA 40×29 m) saíam 2,7×0,26 m.
**How to apply:** mudanças no motor DXF → bump `DXF_ALGO_VERSION`; upload de planta usa rota multipart (não base64 tRPC, teto 150MB por heap ~1GB com persistência base64 em DB).
