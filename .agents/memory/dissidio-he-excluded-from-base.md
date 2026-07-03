---
name: Dissídio — horas extras excluídas da base da diferença retroativa
description: Business rule confirmed by user — overtime never enters the dissídio retroactive salary-difference base, because all overtime is compensated via banco de horas.
---

# Regra de negócio

Nesta empresa, TODA hora extra é compensada via banco de horas — nunca é paga em dinheiro.
Portanto, a base de cálculo da diferença salarial retroativa do dissídio (`sindical.ts`,
`aplicar` e `recalcularDiferencas`) NÃO deve incluir HE. Base = salário bruto + férias
(quando aplicável), apenas.

**Why:** o líquido do relatório "Diferenças Salariais Retroativas (Dissídio)" batia
matematicamente com uma base que incluía HE, mas o usuário confirmou que HE nunca gera
diferença monetária a reajustar (sempre vira banco de horas), então incluir HE contaminava
o valor mesmo estando "certo" pela fórmula.

**How to apply:** qualquer cálculo de reajuste/diferença retroativa de salário (dissídio,
reajuste de convenção, etc.) deve considerar apenas verbas efetivamente pagas em dinheiro
sujeitas ao percentual do dissídio — nunca somar HE. Se essa premissa mudar no futuro
(empresa passar a pagar HE em dinheiro), reverter exigirá reintroduzir a soma de HE
(`hePeriodEmployees`/`hePeriods`, filtrado por status aprovado/pago) na base.
