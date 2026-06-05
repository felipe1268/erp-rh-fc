---
name: % Previsto congelado no cadastro
description: A curva "% Previsto" (Caminho B) deve ser gerada uma única vez no cadastro do cronograma e nunca regenerada no upload semanal de avanço.
---

A curva "% Previsto" por semana (`planejamento_projetos.previsto_semanas_json`,
Caminho B) é DERIVADA da baseline pelo motor minuto-a-minuto. Ela deve ser
gerada UMA vez (no cadastro/reimport pela aba Cronograma) e CONGELADA.

**Regra:** `salvarMetadadosMSProject` recebe `origem: "cadastro"|"avanco"`
(default "cadastro"). No fluxo de AVANÇO semanal (`origem:"avanco"`): NÃO
regenera o previsto E, ao gravar `calendarioJson`, MESCLA preservando do
cadastro `previstoMspSnapshot` + calendário (`weekDayIntervals`/`exceptions`/
`weekDays`); só `realizadoMspSnapshot`/`statusDateSnapshot` vêm do XML semanal.

**Why:** desde a Rev. 2646 o avanço semanal regenerava a curva com o
calendário daquela semana, re-rodando o motor → oscilação ±1% vs MS Project,
crescente nas semanas avançadas. O XML NÃO tem coluna "previsto semana a
semana"; só baseline + calendário + Texto10 (raiz). Logo a curva precisa ser
congelada, não re-derivada.

**How to apply:** qualquer novo chamador de `salvarMetadadosMSProject` no
caminho de avanço/realizado DEVE passar `origem:"avanco"`. Só o cadastro
(aba Cronograma, `ImportarCronograma.tsx`) pode regenerar a curva. O cliente
lê a curva congelada via `previstoCurva.raizAt` como fonte primária
(`previstoMspSnapshot` é só fallback).
