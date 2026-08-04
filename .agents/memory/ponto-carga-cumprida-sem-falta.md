---
name: Ponto — carga cumprida nunca vira falta/atraso
description: Regra do processarPonto — dia com batidas e carga do dia cumprida ignora divergência de horário com a jornada do cadastro
---
Regra (decisão do user, ago/2026): o REGISTRO DE PONTO é o que conta. Dia útil com batidas e carga cumprida (horas trabalhadas ≥ carga esperada − tolerância) NUNCA vira falta nem atraso por divergência de entrada/saída com a jornada do cadastro (ex.: cadastro 07–17h, turno real 12–22h).

**Why:** funcionários mudam de turno sem atualizar o cadastro; a regra antiga (atraso na entrada > limite = falta CHEIA) gerou 14 faltas falsas num mês inteiro trabalhado.

**How to apply:** guard `cargaCumpridaDia` no processarPonto antes das checagens de atraso/saída antecipada. Espelho de Ponto já era deficit-based; a folha lê timecard_daily → precisa REPROCESSAR o ponto da competência para limpar flags antigas. Obra: auto-transfer DIXI já cuida da alocação pelo ponto.

**Feriados (Rev. 4893):** processarPonto e o AUTO-PONTO da simulação não consultavam a tabela `feriados` (só o Espelho consultava) → feriado sem batida virava falta. Agora ambos carregam feriados ativos (+recorrentes por MM-DD) e marcam tipoDia='feriado'. Qualquer novo writer de timecard_daily deve repetir o padrão.
