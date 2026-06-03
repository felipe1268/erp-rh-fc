---
name: Rescisão — Grupo A (provisão) x Grupo B (custo da demissão)
description: Como separar verbas da rescisão entre já-provisionado e custo-adicional, e o gating por tipo de aviso.
---

# Composição do custo da rescisão (tela "Cálculos da Rescisão", Painel RH)

A tela separa proventos em 🟦 Grupo A (já era custo da empresa / competência) x 🟥 Grupo B
(custo adicional gerado pela dispensa). É só RE-APRESENTAÇÃO: A+B = subtotal de proventos,
nenhum total calculado muda.

## Modelo de datas (router avisoPrevioFerias.ts / rescisaoCalc.ts)
- `dataDesligamento` = `row.dataInicio` = INÍCIO do aviso (baseline SEM projeção).
- `dataFimAviso` = `row.dataFim`; `dataProjecao` = último dia do mês de `dataFimAviso` (COM projeção).
- O "incremento da projeção do aviso" = avos extras de férias/13º que só existem porque o aviso
  prévio projeta o término do contrato (Súmula 371 / OJ 82 TST).

## Por que o incremento de férias usa contagem CRUA de avos
`calcularMesesFeriasProporcionais` tem um atalho "período corrente já completo (meses%12===0) → 12/12".
Se o início do aviso cai EXATAMENTE no aniversário de admissão, esse atalho devolve 12 no baseline e a
subtração projetado−base fica negativa. Por isso o incremento usa um helper cru (`mesesServico%12` +
regra dos 15 dias, cap 12). Ex.: alguém demitido no aniversário → base 0 avos, projetado 2 → incremento 2/12.

## GATING por tipo de demissão (decisão pós-review)
O incremento da projeção só é "custo adicional da demissão" quando a dispensa parte do EMPREGADOR.
**Why:** em pedido de demissão (`aviso.tipo` = `empregado_*`) o aviso indenizado e a multa FGTS já são 0,
então o Grupo B conteria APENAS a projeção — rotulando avos de férias/13º como "custo da demissão" numa
saída a pedido, o que é incorreto.
**How to apply:** no client, `isDemissaoEmpregador = aviso.tipo.startsWith('empregador')`; quando false,
zere os campos de projeção (fpProj/tcProj/d13Proj) → férias/13º ficam integralmente no Grupo A e o Grupo B
fica vazio ("sem custo adicional").
