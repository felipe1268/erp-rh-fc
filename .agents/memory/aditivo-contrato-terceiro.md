---
name: Aditivo de contrato de terceiro
description: Regras do fluxo de aditivo (excedente de medição) e o re-escalonamento de percentuais quando o teto do item cresce.
---

# Aditivo de contrato de terceiro (excedente de medição)

Regras acordadas com o usuário:
- Levantamento mede livre; a medição entra capada no saldo do contrato; o excedente por item fica em `terceiro_medicao_itens.quantidade_excedente` (calculado no sync do levantamento).
- Aditivo exige lastro: nasce de uma medição com excedente (`medicaoId` obrigatório), quantidade capada ao excedente medido, justificativa ≥15 chars + foto obrigatórias, preço unitário editável.
- Aprovação 2 níveis (gestor → sócio adm), tolerância zero; rejeição exige motivo. Lock advisory `478005 + contratoId` tanto no criar (pendente único por item) quanto na aprovação.

**Regra crítica (re-escalonamento):** todos os percentuais de medição são gravados em cima do `valorTotal` do item/contrato. Quando um aditivo aprovado aumenta o teto, é OBRIGATÓRIO re-escalar (`× valorAntigo/valorNovo`) os percentuais das medições ABERTAS (não aprovada/paga): `percentual_acumulado_anterior`, `percentual_medido_periodo`, `percentual_avanco_fisico` e `percentual_global`, além de zerar `quantidade_excedente`. Sem isso, o sync do levantamento volta a marcar excedente indevido e os % ficam inflados. Medições finalizadas ficam intactas (histórico).

**Why:** percentuais persistidos são relativos a um teto mutável; qualquer writer que mude `valorTotal` de item/contrato precisa reconciliar os % abertos.
**How to apply:** qualquer novo caminho que altere valorTotal de `terceiro_contrato_itens`/`terceiro_contratos` (renegociação, supressão etc.) deve replicar o re-escalonamento de `aprovarAditivoSocio` em terceiroContratos.ts.
