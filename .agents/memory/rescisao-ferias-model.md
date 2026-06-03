---
name: Rescisão — modelo de férias proporcionais vs vencidas
description: Como calcularMesesFeriasProporcionais e periodosVencidos se dividem; por que o período corrente completo vira 12/12 proporcional e a regra dos 15 dias só vale no período incompleto.
---

# Modelo de férias na rescisão (server/utils/rescisaoCalc.ts)

`calcularRescisaoCompleta` / `calcularRescisaoComplementar` dividem férias em DOIS baldes:
- **PROPORCIONAL** = `calcularMesesFeriasProporcionais(admissao, dataProjecao)` (avos do período aquisitivo CORRENTE).
- **VENCIDAS** = `periodosVencidos = max(0, floor(mesesTotais/12) - 1)` (anos completos ANTERIORES; o `-1` é proposital).

**Consequência não óbvia:** o ÚLTIMO período completo NÃO entra em vencidas — ele é pago como PROPORCIONAL 12/12.
Por isso `calcularMesesFeriasProporcionais` retorna **12** quando `mesesTotais % 12 === 0 && > 0` (ano exato), e esse ramo
DEVE rodar ANTES de qualquer cálculo de fração, senão a fração residual do próximo período regride 1 ano exato para 1/12
(regressão real observada: caso IVAN 12→1).

**Regra dos 15 dias (CLT Art. 146 §único)** só se aplica ao período CORRENTE INCOMPLETO: mede a fração final
(início do mês aquisitivo corrente = `admissão + mesesTotais` meses → data ref) e soma +1 avo se `diasFracao >= 15`
(cap 12). É a MESMA regra que o 13º (`calcularMeses13o`) já aplicava — a divergência entre os dois era o bug.

**Why:** rescisão da Myriélle mostrava 1/12 onde o correto era 2/12; a função antiga usava `calcularMesesServico`
(só meses completos) e descartava a fração ≥15. Casos de "referência" antigos em testes (ex.: ANTONIO 10/12) podem
carregar o MESMO bug — ao corrigir a regra, reavalie se esses valores de referência também precisam subir +1 avo.

**How to apply:** qualquer mexida em férias da rescisão: (1) preserve a separação proporcional×vencidas com o `-1`;
(2) trate ano exato (12/12) antes da fração; (3) a fração ≥15 só no período incompleto; (4) ambas as funções
(oficial + complemento) compartilham `calcularMesesFeriasProporcionais`, então corrija na função, não no caller.
