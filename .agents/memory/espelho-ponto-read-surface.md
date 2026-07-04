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
NÃO é bug do abono: é mismatch de superfície read/write. O "Relatório de Faltas"
(`FechamentoPonto.tsx`) SIM cruza a tabela `atestados` e mostra "Falta Justificada" — daí
o mesmo dia divergir entre as duas telas (sintoma que o usuário reporta). Gotcha extra:
`timecard_daily` só é populado quando o fechamento/folha roda pro período; num mês ainda
não processado fica VAZIO, e o UPDATE do abono afeta 0 linhas silenciosamente.

**Como aplicar:** qualquer coisa que precise aparecer no Espelho de Ponto tem que estar
em `time_records.tipoDia` OU ser projetada no retorno de `getEspelhoPontoRange` (padrão
dos sets de datas, igual `feriasDates`). Não adianta gravar só em `timecard_daily`.
Atestado de tipo "dia" cobre `diasAfastamento` dias; tipo "horas" cobre só `dataEmissao`
(parcial — frontend só marca atestado se não houve batida, pra preservar trabalho parcial).
Coluna `afastamento_tipo` é snake_case no DB (as demais da tabela `atestados` são camelCase).

**Apontamento de campo (`field_notes`) → espelho:** o espelho NÃO lê `field_notes`, só
`time_records`. Logo, a resolução de uma ocorrência (`fieldNotes.resolve`) PRECISA gravar
as batidas corrigidas no `time_records` pra refletir.

**Princípio durável (separar HORÁRIO de DISCIPLINA):** a BATIDA confirmada/ajustada na
resolução é FATO (horário real), não ação disciplinar — deve sincronizar no `time_records`
mesmo quando `acaoTomada='nenhuma'`. Já o marcador disciplinar (falta/atraso) é que respeita
a `acaoTomada`. São dois gates distintos; não acoplar um ao outro. Atenção: ramos de tipos
com batida (atraso/saída antecipada) precisam gravar TODAS as batidas + recalcular horas, não
só o marcador/justificativa.

**Sincronizar field_notes→time_records só onde é seguro:** uma batida em `time_records` com
`fonte='manual'`/`'dixi'` (ou `dixi+apontamento`) é correção/importação que veio DEPOIS do
apontamento; reescrevê-la com o horário antigo do field_note corromperia o ponto. Regra: só
sobrescrever batidas se o RH digitou um horário NOVO na resolução, OU se a linha ainda é
`fonte='apontamento'`. Qualquer backfill em massa de divergências deve ter o mesmo escopo
(tocar só `fonte='apontamento'`).
