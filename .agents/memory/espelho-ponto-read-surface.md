---
name: Espelho de Ponto — fonte de leitura vs abono
description: Onde o Espelho de Ponto lê os dias e por que abonos (atestado) podem não aparecer
---

O Espelho de Ponto (tela `EspelhoPonto.tsx`) lê de `horasExtras.getEspelhoPontoRange`,
que consulta `time_records` (recordMap, com `tipoDia`), `vacation_periods` (férias) e
aviso prévio — e, a partir da Rev. 3222, também a tabela `atestados` (projetando
`atestadoDates`/`atestadoHorasDates`).

**Armadilha:** o abono de atestado (`abonarPontoPorAtestado` na Central de Documentos)
escreve SÓ em `timecard_daily` (statusDia='atestado') e `ponto_descontos` — NENHUM dos
quais é lido pelo espelho. Logo "abonei o atestado mas o dia continua Falta no espelho"
NÃO é bug do abono: é mismatch de superfície read/write.

**Como aplicar:** qualquer coisa que precise aparecer no Espelho de Ponto tem que estar
em `time_records.tipoDia` OU ser projetada no retorno de `getEspelhoPontoRange` (padrão
dos sets de datas, igual `feriasDates`). Não adianta gravar só em `timecard_daily`.
Atestado de tipo "dia" cobre `diasAfastamento` dias; tipo "horas" cobre só `dataEmissao`
(parcial — frontend só marca atestado se não houve batida, pra preservar trabalho parcial).
Coluna `afastamento_tipo` é snake_case no DB (as demais da tabela `atestados` são camelCase).
