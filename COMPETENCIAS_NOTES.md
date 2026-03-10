# Gestão de Competências - Notas de Implementação

## Critérios Existentes no Banco (system_criteria)

### FOLHA (6 params - companyId 60002)
- folha_dia_vale = 20 (dia do mês para pagamento do vale)
- folha_dia_pagamento = 5 (dia útil para pagamento do salário)
- folha_percentual_adiantamento = 40 (percentual do salário para adiantamento)
- folha_desconto_vr_faltas = 1 (descontar VR nos dias de falta)
- folha_desconto_vt_faltas = 1 (descontar VT nos dias de falta)
- folha_bloquear_consolidacao_inconsistencias = 0 (bloquear consolidação com inconsistências)

### PONTO (5 params)
- ponto_tolerancia_atraso = 10 (minutos)
- ponto_tolerancia_saida = 10 (minutos)
- ponto_batida_impar_tolerancia = 30 (minutos)
- ponto_falta_apos_atraso = 120 (minutos)
- ponto_hora_noturna_reduzida = 52:30 (mm:ss)

### HORAS_EXTRAS (8 params)
- he_dias_uteis = 60 (%)
- he_domingos_feriados = 100 (%)
- he_interjornada = 50 (%)
- he_adicional_noturno = 20 (%)
- he_noturno_inicio = 22:00
- he_noturno_fim = 05:00
- he_limite_mensal = 44 (horas)
- he_banco_horas = 0 (bool)

### BENEFICIOS (3 params)
- ben_vt_percentual_desconto = 6 (%)
- ben_dias_uteis_mes = 22 (dias)
- ben_vr_valor_diario = 0 (R$)

### ADVERTENCIAS (4 params)
- adv_validade_meses = 6
- adv_qtd_para_suspensao = 3
- adv_dias_suspensao = 3
- adv_suspensoes_para_justa_causa = 3

### JORNADA (5 params)
- jornada_horas_diarias = 8
- jornada_horas_semanais = 44
- jornada_intervalo_almoco = 60 (min)
- jornada_descanso_semanal = 1 (dias)
- jornada_sabado_tipo = compensado

## Mapeamento Critério -> payrollEngine
O getPayrollCriteria usa chaves DIFERENTES das do system_criteria:
- ponto_dia_corte (não existe no system_criteria!) -> default 15
- adiantamento_percentual -> folha_percentual_adiantamento
- adiantamento_dia -> folha_dia_vale
- pagamento_dia_util -> folha_dia_pagamento
- adiantamento_max_faltas (não existe!) -> default 5
- jornada_horas_diarias -> jornada_horas_diarias
- fechar_no_escuro (não existe!) -> default sim
- desconto_vr_falta -> folha_desconto_vr_faltas
- desconto_vt_falta -> folha_desconto_vt_faltas
- ponto_tolerancia_atraso -> ponto_tolerancia_atraso
- ponto_falta_apos_atraso -> ponto_falta_apos_atraso
- jornada_horas_semanais -> jornada_horas_semanais
- jornada_intervalo_almoco -> jornada_intervalo_almoco
- jornada_sabado_tipo -> jornada_sabado_tipo

## PROBLEMAS IDENTIFICADOS:
1. getPayrollCriteria usa chaves diferentes das que estão no banco!
2. Precisa corrigir o mapeamento para usar as chaves corretas
3. Faltam colunas novas no processarPonto (origemRegistro, numBatidas, etc.)
4. Não há detecção de inconsistências (batidas ímpares, sobreposição, multi-obra)
5. Não há resolução inline de inconsistências
6. Interface é horizontal (pipeline), precisa virar wizard vertical
