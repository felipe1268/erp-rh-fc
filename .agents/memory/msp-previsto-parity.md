---
name: MSP %Previsto parity (Caminho B)
description: Why planejamento %PREVISTO must use baseline WITH TIME + minute-by-minute working-time engine to match MSP "% Concluída" exactly.
---

# %PREVISTO ↔ MSP "% Concluída" paridade EXATA

Regra: o %PREVISTO da curva Caminho B é a fração de duração da baseline em TEMPO
ÚTIL **minuto-a-minuto** (motor `minutosUteisEntre` de `shared/diasUteis`, que já
aplica feriados/almoço/sexta-curta lidos do calendário do XML).

**RAIZ = vão da baseline do PROJETO INTEIRO, NÃO média ponderada das folhas.**
`trunc(unitsElapsed(minStart, semana, maxFinish) ÷ unitsTotal(minStart, maxFinish)
× 100)`, onde minStart/maxFinish = min/max das baselines das folhas. Reproduz a régua
interna do MSP para a linha-resumo (UID=0), que mede o próprio vão do resumo, não o
somatório das folhas. Por atividade = `trunc(elapsed/total × 100)`.

**`Math.trunc`, NÃO `round`/`floor`** — o MSP usa `int()` (trunca). (Atenção: uma
versão anterior desta nota dizia `round` ponderado pelas folhas — ESTAVA ERRADO,
dava 1/8/14/20/25; o alvo real PLN_816 R04 nas 5 semanas é 3/6/10/14/18.)

**Why:** duas armadilhas comprovadas contra os XMLs reais (PLN_816 R04, alvo
2/9/15/20):
- **Baseline date-only diverge** → dá 2/9/16/22. O MSP mede a fração com precisão
  de MINUTO; a baseline FC começa 07:00 e termina em horários quebrados. É
  obrigatório capturar a baseline COM HORA no import.
- **Motor day-granular diverge** → conta dia inteiro = 1 unidade, mas Sexta (480min)
  é mais curta que Seg–Qui (540min). Semanas com sexta pesam demais → 22% em vez
  de 20%. É preciso varrer minuto-a-minuto clipando aos intervalos de trabalho do
  calendário (`weekDayIntervals`, lidos de `<WorkingTime>` no XML).

**How to apply:** o motor minuto-a-minuto só liga quando o calendário está COMPLETO
(`temIntervalosUteis`: todo dia útil tem ≥1 intervalo). Calendário parcial ou XML
antigo (sem hora/sem intervalos) → fallback day-granular ponderado por duração
(backward compat — nunca quebrar projetos antigos). Cutoff semanal = fim-do-dia
(`T23:59:59Z`), NÃO a hora do StatusDate. Snapshot é congelado no `salvarAtividades`
(cadastro); avanço semanal não regenera (baseline imutável dentro da revisão).
Validar mudanças rodando o motor REAL (`shared/diasUteis`) contra o XML real — não
confiar só em esbuild.
