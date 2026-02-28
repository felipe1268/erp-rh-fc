# Análise dos Bugs de Cálculo de Rescisão

## Caso: Renato Encarregado
- Admissão: ?
- Tipo: Empregador (Trabalhado) 
- Início Aviso: 14/02/2026
- Término Aviso: 15/03/2026
- Dias Aviso: 30 dias
- Salário Base: R$ 6.199,60
- Redução: 7 dias corridos (Art. 488 CLT)

## Bug 1: Saldo de Salário (13 dias → deveria ser 16 dias)
- O sistema calcula `diasTrabalhadosMes = dtDeslig.getDate()` → 14 (dia 14/02) 
- Mas `dataDesligamento` é o último dia trabalhado ANTES do aviso
- O correto: calcular até o TÉRMINO do aviso (15/03/2026)
- No mês de março: 15 dias trabalhados → mas a memória diz 16 dias
- Espera: parece que o sistema está usando dataDesligamento = 14/02 (início do aviso)
- E calculando saldo no mês de fevereiro: dia 14 → mas fev tem 28 dias, não 30
- 6199.60 / 28 = 221.41/dia × 13 dias = 2878.43 (sistema mostra 2686.49)
- 6199.60 / 30 = 206.65/dia × 13 dias = 2686.49 ← ESTÁ USANDO 30 DIAS!
- Mas o código diz `diasReaisMes = new Date(...)` que deveria dar 28 para fev
- PROBLEMA: dataDesligamento está apontando para 14/02 mas o cálculo deveria ser até 15/03

## Bug 2: Férias Proporcionais (9 meses → deveria ser 10 meses)
- calcularMesesFeriasProporcionais usa dataDesligamento
- Se dataDesligamento = 14/02 (início do aviso), calcula até 14/02
- Correto: calcular até 15/03 (término do aviso)
- Diferença: 1 mês a mais

## Bug 3: 13º Salário Proporcional (não aparece no sistema)
- calcularMeses13o existe no código
- decimoTerceiroProporcional é calculado
- Mas NÃO aparece na tela do frontend!
- O frontend não está exibindo o 13º proporcional

## Bug 4: Multa FGTS (calculando 1 mês a menos)
- calcularMesesServico usa dataDesligamento
- Se dataDesligamento = 14/02, calcula até 14/02
- Correto: calcular até 15/03 (término do aviso)

## RAIZ DO PROBLEMA:
O `dataDesligamento` passado para `calcularRescisaoCompleta` é a data de INÍCIO do aviso (14/02/2026), 
mas deveria ser a data de TÉRMINO do aviso (15/03/2026) para férias, 13º e FGTS.

Para saldo de salário, precisa calcular os dias trabalhados no mês do TÉRMINO (março).

## Solução:
1. Passar `dataFimAviso` para calcularRescisaoCompleta
2. Usar dataFimAviso para férias, 13º e FGTS
3. Calcular saldo de salário no mês do término do aviso
4. Exibir 13º proporcional no frontend
