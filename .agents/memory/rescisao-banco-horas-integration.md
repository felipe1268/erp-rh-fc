---
name: Rescisão × Banco de Horas integration
description: How the banco-de-horas balance is folded into termination (rescisão) calculations — sign convention and single source of truth.
---

Saldo do banco de horas entra na rescisão com sinais assimétricos: saldo POSITIVO vira
PROVENTO com o multiplicador ×1,5 (mesmo multiplicador do crédito normal de HE); saldo
NEGATIVO vira DESCONTO com valor CHEIO, SEM multiplicador (dívida de horas não é hora
extra, não deve ser "descontada com desconto").

**Why:** espelha a regra de crédito (HE credita no banco a ×1,5) mas evita que o
funcionário seja beneficiado por multiplicador ao "sair devendo" — só ganha o bônus
quem tem saldo a favor.

**How to apply:** toda leitura de saldo para rescisão passa por UM helper único
(`getSaldoBancoHorasParaRescisao`) que lê `banco_horas_saldo`; `calcularRescisaoCompleta`
recebe `saldoBancoHorasMinutos`/`valorHoraBancoHoras` como parâmetros opcionais e soma/
subtrai do `total` internamente — então `calcularDescontosRescisao`/`totalLiquido`
herdam o ajuste automaticamente sem wiring extra. Se adicionar um novo ponto de cálculo
de rescisão (há 8 hoje em `avisoPrevioFerias.ts`: create, list recalculation, getById,
gerar/generate, comparativo prevTrab/prevInd, update, recalcularEmLote), SEMPRE reusar
o mesmo helper — não duplicar a query.
