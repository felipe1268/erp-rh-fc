---
name: Lógica do % Previsto (Planejamento) CONGELADA
description: Cadeia de cálculo do PREVISTO (SEMANA) validada contra MSP real — não alterar sem alerta explícito e confirmação do usuário.
---

**Regra:** A lógica do % Previsto do módulo Planejamento é considerada ESTÁVEL e CONGELADA pelo usuário (24/07/2026, Rev. 4534). Não alterar nenhum destes caminhos como efeito colateral de outras tasks:

- `server/routers/planejamento.ts` → `regenerarPrevistoSemanasCaminhoB` (motor da curva): engine minuto-a-minuto, fallback Rev. 4179 p/ revisão baseline, guard de baseline DEFASADA (ativo > baseline+7d → datas atuais como proxy), rollup da raiz com 2 casas decimais e clamp <100% até o fim real do cronograma.
- Captura/precedência do literal do XML semanal (`previsto_literal_json` prevalece sobre o motor).
- Frontend `PlanejamentoDetalhe.tsx` → `raizAt`/literalMap e `mspReadOnly` (precedência literal > raiz > snapshot).
- Self-heal em `getProjeto` (regenera curva só quando NULL ou fonte diverge).

**Why:** Toda vez que uma "melhoria" tocou nessa área, o sistema bugou (ex.: 100% em todas as semanas futuras). Os valores atuais foram validados linha a linha contra os XMLs reais do MS Project (Texto10).

**How to apply:** Se qualquer task exigir mexer nesses arquivos/funções, ALERTAR o usuário explicitamente antes, obter confirmação, e revalidar contra XMLs reais do MSP depois. Há um banner 🔒 no código marcando a zona congelada.
