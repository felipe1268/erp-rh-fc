---
name: Afastamento INSS na Folha
description: Fonte das datas de afastamento e decisão do usuário sobre afastados sem data
---
Regra (Folha/simularPagamento): empresa paga os 15 primeiros dias corridos do afastamento (início..início+14, cruzando meses); do 16º dia em diante é INSS e sai da base do salário (mesma régua proporcional das férias).

**Fonte das datas** (não óbvio): início = `employees.licencaDataInicio`; fallback = `atestados` com `status_alterado=1` (ini=dataEmissao, fim=dataRetorno−1). Não existe histórico de status — sem essas datas não há como saber quando o afastamento começou.

**Decisão do Felipe (31/07/2026):** afastado SEM data de início conhecida permanece FORA da folha (fail-safe, sem chutar data) — ele optou por NÃO preencher retroativamente os 4 casos sem data.

**Why:** evitar pagamento em dobro (módulo de Férias/INSS já remunera) e evitar pagar salário cheio por status impreciso.
**How to apply:** qualquer novo cálculo que dependa de afastamento deve usar essas mesmas fontes/regra; fim em aberto só vale para quem AINDA está status Afastado.
