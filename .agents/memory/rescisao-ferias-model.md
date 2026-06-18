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

## Saldo de férias vencidas por DIA (gozo parcial) — Rev. 3277+

**Bug:** o valor de "férias vencidas" era `(base/30) × (periodos × 30)`, ou seja, sempre múltiplo de 30 dias.
As contagens de períodos usavam SQL `status NOT IN ('concluida','cancelada','em_gozo')` + `COUNT(*)`, então
um período aquisitivo COMPLETO em que o colaborador gozou só parte (ex.: 5 de 30 dias, `status='concluida'`,
`diasGozo=5`) era DESCARTADO inteiro → os 25 dias remanescentes pagavam R$ 0 (caso Isabela emp 420136).

**Correção:** `calcularRescisaoCompleta`/`calcularRescisaoComplementar` ganharam `diasVencidosOverride?: number`;
quando presente, `feriasVencidasBase = (base/30) × diasVencidos` (+1/3). Sem ele, fallback `periodos × 30` (compat).
Fonte única do saldo em `server/routers/avisoPrevioFerias.ts`:
`saldoDiasVencidoPeriodo(r, corte)` → concluida/em_gozo: `30 − diasGozo − (abono?10:0)`; pendente/agendada/vencida:
30 salvo `dataPagamento ≤ corte` → 0; cancelada/excluída/paf ≥ corte → 0. `getFeriasVencidasSaldo(db, emp, corte)`
agrega `{periodosVencidos, diasVencidos, detalhes[]}`; falha de query → undefined → fallback matemático.

**Why:** períodos parcialmente gozados são reais (gozo fracionado) e o modelo de blocos de 30d ignorava o resíduo,
subpagando a rescisão. O override por DIA reflete o saldo real.

**How to apply:** existem 8 chamadas de `calcularRescisaoCompleta` + 4 de `buildPrevisaoComplementar` no router
(create, batch list, getById, preview/simular, complementar-simular, update/recalcular, recalcularTodos). TODAS
devem propagar `diasVencidosOverride` — é fácil esquecer o ramo `update(recalcular)` ou o batch list (que calcula
em JS, não via helper de banco). Se uma esquecer, esse fluxo regride ao bloco de 30d e diverge dos demais.
