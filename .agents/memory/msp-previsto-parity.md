---
name: MSP %Previsto parity (Caminho B)
description: Why planejamento %PREVISTO must use baseline WITH TIME + minute-by-minute working-time engine to match MSP "% Concluída" exactly.
---

# %PREVISTO = réplica da coluna "% PREVISTO" (Texto10) do MSP

## VERDADE ATUAL (Rev. 2644, 31/05/2026) — substitui as regras de raiz=vão + trunc abaixo

Decisão do usuário: o "% PREVISTO" do cronograma inicial deve ser a **réplica EXATA da
coluna "% PREVISTO" (Texto10) do MS Project** — "verdade absoluta". O Texto10 é
`Int(Num Dur(Prev)[188743983] ÷ PESO DUR(BL)[188743982] × 100 + 0.5)`:
- **ROLLUP ponderado por DURAÇÃO das folhas** (NÃO o vão início→fim do projeto).
- **ARREDONDA** (`+0.5` antes do `Int` = `round`, NÃO trunca).

Régua no ERP (projeção p/ TODAS as semanas, motor minuto-a-minuto de `shared/diasUteis`):
- **RAIZ = ROLLUP** = `round(Σ minutos úteis DECORRIDOS das folhas ÷ Σ minutos úteis
  TOTAIS das folhas × 100)`. Acumular `raizElapsed[j] += unitsElapsed(folha)` no loop
  das folhas, dividir por `raizTotal = Σ unitsTotal(folha)`.
- **POR ATIVIDADE** = `round(unitsElapsed/total × 100)`.

**FONTE = coluna pelo ALIAS, não por FieldID fixo.** No cliente
(`ImportarCronograma.tsx`), `detectarFidPorAlias(doc,"% PREVISTO")` acha o FieldID pela
DEFINIÇÃO do ExtendedAttribute cujo `<Alias>` é "% PREVISTO". Cadeia de fallback:
`fidPrevisto → Texto10 (188743750) → Texto6 (188743746) → Texto11 (188743997)`.
**Texto6 NÃO é mais prioridade** — em templates LOTUS é coluna de lixo sem alias/fórmula
(raiz dava 3%). O "% PREVISTO" real é o Texto10.

**RESSALVA:** o XML de referência (PLN_816 R04) tem StatusDate 31/05 < StartDate 01/06
→ Texto10 = 0% em TODAS as 1430 tasks. A paridade NUMÉRICA da curva NÃO foi cravada
empiricamente nesta revisão; precisa re-validar com XML de status-date no meio do
projeto (Texto10 > 0). A régua matemática está alinhada à fórmula.

---

## HISTÓRICO (Rev. 2617, OBSOLETO desde Rev. 2644 — raiz=vão + trunc estava ERRADO)

Regra antiga: o %PREVISTO da curva Caminho B era a fração de duração da baseline em
TEMPO ÚTIL **minuto-a-minuto**, com **RAIZ = vão da baseline do PROJETO INTEIRO**
(`trunc(unitsElapsed(minStart,semana,maxFinish) ÷ unitsTotal(minStart,maxFinish) ×
100)`) e **`Math.trunc`** (achava que o MSP usava `int()` puro). Isso divergia do
Texto10, que é rollup das folhas + round (`+0.5`). Corrigido na Rev. 2644.

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

## Gate de integridade pré-upload do XML (porta de qualidade)

Se for criar uma validação que BLOQUEIA o upload de um XML "incompleto", os
critérios de bloqueio do CLIENT (`analisarIntegridadeMSP` em
`ImportarCronograma.tsx`) precisam espelhar EXATAMENTE os gates reais do motor do
server, senão dá selo verde falso e o server cai no fallback divergente:
- **Jornada**: replicar a regra do `temIntervalosUteis` (TODO dia útil com ≥1
  intervalo) — NÃO basta "algum dia tem intervalo".
- **Hora da baseline**: exigir hora nos DOIS lados (Start E Finish). O parser lê
  ts sem hora como 00:00, distorcendo envelope/fração; um lado date-only já diverge.
- **Baseline parcial NÃO bloqueia** (é só aviso): a RAIZ usa o ENVELOPE do projeto
  (min-início/max-término), então folhas sem baseline própria caem no fallback de
  datas vigentes sem estragar a curva da raiz. **Comprovado:** o XML válido PLN_816
  R04 (curva exata 3/6/10/14/18) tem 62/1105 folhas SEM baseline e mesmo assim bate.
  Bloquear "qualquer folha sem baseline" = falso bloqueio do arquivo bom.

**Why:** uma régua de validação mais frouxa OU mais rígida que o motor real engana
o engenheiro — frouxa promete paridade que o server não entrega; rígida barra o
arquivo que de fato produz a curva certa.

## DECISÃO DO USUÁRIO (31/05/2026): % Previsto correto = calendário CORRIGIDO, NÃO o Texto6 cru

O usuário declarou (2x, enfático): **NUNCA validar % Previsto pela coluna "% Previsto"
do MSP (Texto6) — ela sai ERRADA quando o calendário do XML está incompleto. A coluna
confiável é "% Concluída" (`PercentComplete`).** Para PLN_816 R04 isso REVISA o "alvo
cravado" anterior:
- **3/6/10/14/18** = curva do MSP cru (= Texto6) com calendário SEM Corpus Christi → ERRADO (não usar).
- **2/6/10/14/17** = curva com o calendário CORRIGIDO (Corpus Christi injetado pela Rev. 2632) → é o % Previsto correto que o usuário quer.
- **2/9/15/20/26** = % Concluída (`PercentComplete` raiz UID=0) lida em cada upload semanal — coluna de validação.

**NÃO REVERTER a Rev. 2632.** O auto-completar de feriados móveis é o comportamento
desejado; o instinto de "espelhar o MSP cru (3/6/10/14/18)" está ERRADO segundo o dono.

**How to apply:** o card "% Previsto" (mspReadOnly em PlanejamentoDetalhe.tsx) já lê a
curva Caminho B (`previstoCurva.raizAt`) com prioridade; o Texto6 (`previstoMspSnapshot`)
é só fallback desativado. A curva fica congelada em `previsto_semanas_json` e só
regenera no `salvarAtividades` → **projeto importado ANTES da Rev. 2632 continua
mostrando 3% até REIMPORTAR o cronograma.** A correção operacional é reimportar o XML.

## Calendário do XML pode FALTAR feriados móveis nacionais (ERP auto-completa)

Quando ERP × MSP divergem no %Previsto e a CONTA é comprovadamente idêntica, suspeite
do DADO — especialmente do CALENDÁRIO do XML. Calendários FC (ex.: "Padrão
Guaratinguetá", UID=6) podem **omitir** os feriados móveis nacionais (Carnaval,
Sexta-feira Santa, Corpus Christi) e/ou lançá-los em datas FIXAS erradas. Eles
dependem da Páscoa, então mudam de data todo ano. Faltando um deles em dia útil, o
ERP conta aquele dia como trabalhável e a curva sobe (caso real PLN_816 R04: sem
Corpus Christi qui 04/06/2026 a 1ª semana deu 3% em vez de 2% — exatamente 1 dia
útil de diferença).

Solução adotada (AUTO-COMPLETAR + AVISAR, SÓ CLIENT): `feriadosMoveisBR(year)` calcula
a Páscoa (Meeus/Butcher) → Carnaval (Páscoa−48/−47), Sexta Santa (Páscoa−2), Corpus
Christi (Páscoa+60); `completarFeriadosMoveisBR(cal, anoIni, anoFim)` injeta em
`cal.exceptions` (ADITIVO, só os que faltam e caem em dia útil) ANTES de montar o
`calendarioJson` → flui pro server e entra na curva. Um aviso âmbar lista o que foi
injetado.

**How to apply:** injete na FONTE (mutando `cal` no parser do client, antes de
serializar o `calendarioJson`), NÃO no server — assim a correção atravessa todo o
pipeline (motor minuto-a-minuto lê `exceptions` com `working:false` como folga) sem
tocar backend/schema. Mantenha ADITIVO: nunca remova/corrija exceções já existentes
(o usuário pode ter feriados regionais legítimos). Sempre AVISE o engenheiro do que
foi auto-completado e recomende cadastrar no Project.
