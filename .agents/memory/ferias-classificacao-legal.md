---
name: Férias INADIÁVEL × REMANEJÁVEL — situação legal, não só ordem
description: Como classificar se uma férias pode ser remanejada no módulo Planejamento / Efetivo × IA
---

# Classificação de férias INADIÁVEL × REMANEJÁVEL

A marcação de "pode adiar" (remanejável) vs "tem que sair na data" (inadiável) NÃO
pode olhar só a ordem do parcelamento (1º/2º/3º). Um 1º período também é INADIÁVEL
quando a lei obriga o gozo.

**Regra (ordem de precedência):**
1. fração ordem ≥ 2 → INADIÁVEL (saldo final por lei).
2. já em gozo (hoje entre início/fim) → INADIÁVEL (não interromper).
3. status `vencida` (ou flag `vencida=1`) OU `periodoConcessivoFim < hoje` → INADIÁVEL
   (férias VENCIDAS, gozo obrigatório — adiar gera passivo em DOBRO).
4. `periodoConcessivoFim` a 0..45 dias do FIM do gozo → INADIÁVEL (vencendo, sem folga).
5. caso contrário → 1º período REMANEJÁVEL se a função for imprescindível.

**Why:** o concessivo é o deadline legal para gozar; um 1º período comum vira
obrigatório quando esse prazo está estourando ou já passou. Olhar só a ordem
classificava errado (bug reportado: 1º período com concessivo a ~15d aparecia
"remanejável").

**How to apply:** em `coletarEfetivoCronograma` (server/routers/iaCronograma.ts).
O SELECT de `vacationPeriods` filtra status IN ('pendente','agendada','em_gozo') —
NÃO inclui 'vencida' de propósito; por isso o vencimento é detectado por `vencida=1`
OU pelo cálculo do `periodoConcessivoFim`, não pelo status. O badge do client
(`AnaliseEfetivoIA.tsx` ImpactoFerias) já lê o flag `inadiavel` da resposta da IA —
o server marca e o prompt manda a IA copiar.
