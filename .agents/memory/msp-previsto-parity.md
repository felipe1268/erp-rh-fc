---
name: MSP %Previsto parity (Caminho B)
description: Why planejamento %PREVISTO must use baseline WITH TIME + minute-by-minute working-time engine to match MSP "% Concluída" exactly.
---

# %PREVISTO = réplica da coluna "% PREVISTO" (Texto10) do MSP

## ⚙️ PADRÃO ATUAL (Rev. 2646, 31/05/2026): o "% Previsto" REGENERA EM TODO UPLOAD do XML — REVOGA "regenera só no salvarAtividades"

O snapshot da curva "% Previsto" passa a ser regenerado em TODO import do XML —
inclusive o upload SEMANAL — e não mais só no `salvarAtividades` (cadastro/substituir).
O gancho fica em `salvarMetadadosMSProject` (server): ele já regrava o `calendarioJson`
em todo upload, então depois do `db.update` do patch ele resolve a revisão ativa
(última aprovada → 1ª, igual ao self-heal de leitura) + respeita a fonte global
(manual/motor) + regenera. Só dispara se veio `calendarioJson`; em try/catch (nunca
quebra o save). É IDEMPOTENTE (baseline imutável dentro da revisão = mesma curva).

**Why:** fixes no PARSER do client (ex.: Rev. 2645 parou de injetar feriados móveis)
só corrigem o `calendarioJson` gravado — mas a CURVA persistida ficava velha até um
reimport MANUAL do cronograma inicial, porque o avanço semanal não regenerava. Com
isso, projetos ANTIGOS se AUTO-CURAM no próximo upload semanal; novos já nascem certos.
**RESSALVA:** projetos dormentes (sem novos uploads) ainda exigem reimport manual.
Esta regra REVOGA o trecho histórico abaixo "Snapshot é congelado no salvarAtividades;
avanço semanal não regenera (baseline imutável)".

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

**RESSALVA (RESOLVIDA na Rev. 2645):** a paridade NUMÉRICA foi cravada empiricamente
com 5 XMLs PLN_816 R04 de StatusDate no MEIO do projeto — a curva da raiz bate o
Texto10 EXATO (2/9/15/20/26) e o Número6 reproduz em 1042/1042 folhas. A única
correção necessária foi PARAR de auto-injetar feriados móveis (ver seção "⚠️ NÃO
auto-injete feriados móveis" abaixo). A régua matemática da Rev. 2644 estava certa.

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

## ⚠️ NÃO auto-injete feriados móveis — o calendário do XML é VERDADE ABSOLUTA (Rev. 2645, corrige Rev. 2632)

**A regra-chave: o "% Previsto" do ERP tem que bater com a coluna "% PREVISTO"
(Texto10) do MSP, e o MSP calcula o Texto10 com o calendário DELE.** Logo o ERP deve
usar o calendário do XML VERBATIM — nunca acrescentar feriados (Carnaval/Sexta
Santa/Corpus Christi) que o calendário do Project não tem. Injetar um feriado a mais
ENCURTA o tempo útil decorrido e baixa a curva ~1%.

**Why (prova empírica com 5 XMLs reais PLN_816 R04, StatusDate no MEIO do projeto —
04.06/11.06/18.06/25.06/02.07):** reproduzindo o `ProjDateDiff` do MSP em JS sobre a
cal UID=6 ("Padrão Guaratinguetá": Seg–Qui 540min, Sex 480min, feriados SOMENTE os do
XML — que NÃO inclui Corpus Christi 04/06/2026):
- Número6 (PESO DUR BL, gravado no XML) reproduzido EXATO em **1042/1042 folhas** (erro 0).
- Curva da raiz = `round(ΣNúmero7/ΣNúmero6×100)`:
  - calendário do XML verbatim (SEM Corpus) → **2/9/15/20/26** = Texto10 da raiz EXATO. ✅
  - COM Corpus Christi injetado → **2/8/14/20/25** = o "~1% a menos" relatado pelo dono. ❌

**A "decisão" anterior (Rev. 2632: "auto-completar é o comportamento desejado, 2/6/10/14/17
é o correto, não reverter") estava ERRADA** — foi tirada de um XML cego (StatusDate <
StartDate → Texto10 = 0% em tudo), sem poder comparar números reais. Os XMLs com
StatusDate no meio do projeto provaram o contrário.

**How to apply:** a função no client (`ImportarCronograma.tsx`) é
`detectarFeriadosMoveisAusentes` (era `completarFeriadosMoveisBR`) e é **DETECT-ONLY**:
NÃO faz `cal.exceptions.push`, só retorna a lista de móveis ausentes para um AVISO
informativo ("o calendário do Project não inclui X; o ERP tratou como dia útil — igual
ao MSP — para bater 100%"). `feriadosMoveisBR(year)` (Páscoa Meeus/Butcher) continua,
mas só alimenta a detecção. Se algum dia precisar "corrigir" calendário do XML,
faça-o como AVISO/opção explícita do usuário — JAMAIS mutando `cal` silenciosamente,
porque isso quebra a paridade com o Texto10.

**Regra geral de debug:** quando ERP × MSP divergem no % Previsto e a CONTA é
comprovadamente idêntica, suspeite do CALENDÁRIO — mas a direção certa é o ERP
ESPELHAR o calendário do XML, não "consertá-lo". O MSP já calculou tudo
(Número6/Número7/Texto10) com o calendário que tem; replique-o fielmente.
