# ERP RH & DP — FC Engenharia

A comprehensive full-stack ERP system for FC Engenharia, managing HR, payroll, projects, finance, procurement, and operational workflows.

## Run & Operate

- **Dev**: `PORT=5000 NODE_ENV=development pnpm dev`
- **Build**: `pnpm build`
- **Prod**: `node dist/index.js`

**Required Env Vars**:
- `NEON_DATABASE_URL` (or `DATABASE_URL`)
- `JWT_SECRET` (random 48-char hex)
- `NODE_ENV=production`
- `SMTP_PASSWORD`
- `GOOGLE_API_KEY`
- `FROTA_API_TOKEN` (for Infleet API)
- `VITE_APP_TITLE`
- `VITE_APP_LOGO`
- `OAUTH_SERVER_URL`
- `VITE_APP_ID`
- `OWNER_OPEN_ID`

## Stack

- **Frontend**: React 19, Tailwind CSS 4, shadcn/ui, Wouter
- **Backend**: Express 4, tRPC 11, Drizzle ORM
- **Database**: PostgreSQL (Neon)
- **Auth**: Manus OAuth (JWT) or local username/password
- **Build**: Vite 7
- **Package Manager**: pnpm

## Where things live

- `client/`: React frontend
- `server/`: Express backend + tRPC routers (`_core/`, `routers/`, `db.ts`)
- `drizzle/`: Schema (`schema.ts`) + migrations
- `shared/`: Tipos e constantes (`version.ts`, `changelog.ts`, `paymentConditions.ts`, `modules.ts`)
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui`

## Recent changes

> **Convenção (atualizada Rev. 2062 — mais enxuta)** — `replit.md` guarda apenas as **2 últimas revisões** em formato detalhado e as **5 seguintes** em one-liner. Detalhe completo (causa-raiz, arquivos tocados, racional, follow-ups) vive SEMPRE em `shared/changelog.ts`. Demais one-liners vão para `replit-history.md`.
>
> **Ao criar uma nova revisão**:
> 1. Adicionar bloco detalhado da NOVA revisão no TOPO (1-2 parágrafos: o quê + por quê + arquivos principais — sem racional longo, isso vai pro `changelog.ts`).
> 2. Demover a Rev. mais antiga das 2 detalhadas pra one-liner.
> 3. Demover a Rev. mais antiga dos 5 one-liners pra `replit-history.md`.
> 4. Bumpar `shared/version.ts` + prepender entrada COMPLETA (com todo o racional) no topo de `shared/changelog.ts`.

### Top 2 detalhadas

- **Rev. 3225** — **OBRAS / CADASTRO E EDIÇÃO · NOVO CAMPO "JORNADA DE TRABALHO DA OBRA" (POR DIA DA SEMANA: ENTRADA / INTERVALO / SAÍDA, SEG A DOM). QUANDO PREENCHIDA, ESSA JORNADA PREVALECE SOBRE A DO FUNCIONÁRIO PARA TODOS OS ALOCADOS — RESPEITANDO A OBRA EM QUE A BATIDA OCORREU E A DATA DE ALOCAÇÃO/TRANSFERÊNCIA. EX. REVTE: SEG–QUI 12:00–22:00 (INTERV. 18:00–19:00), SEX 12:00–21:00 (INTERV. 18:00–19:00).** PEDIDO (piloto FC): obra com horário próprio (ex.: REVTE entra meio-dia, sai 22h) fazia o ponto calcular atraso/HE errado, pois usava a jornada do cadastro pessoal; agora cadastra-se a jornada NA OBRA e ela manda para quem estiver alocado lá naquele dia. SOLUÇÃO (override obra > func, GATED = zero regressão onde nenhuma obra tem jornada): SCHEMA ADITIVO `obras.jornadaTrabalho` (mesmo JSON dia-a-dia de `employees`) + self-heal `ADD COLUMN IF NOT EXISTS`; helper `server/utils/jornadaObra.ts` (`obraTemJornada`/`jornadaEfetiva`/`obraNaDataFromAlocacoes` — obra do dia via `time_records.obraId` com batida ou `employee_site_history` sem batida; obra prevalece POR INTEIRO, dia vazio = folga); `fechamentoPonto.ts` obra-aware em todas as procedures de minutos esperados (`processRecords`, `recalcularPeriodo`, `getFaltasReport`, `getAtrasoDetalhe`, `manualEntry`, `getEmployeeDetail`, etc.) + `dixiPonto.importAFD` (obra pelo SN); `routers.ts` `obras.create/update` aceitam `jornadaTrabalho`; UI `Obras.tsx` editor SEG→DOM com `TimeCombobox`. ZERO ALTER destrutivo/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3224** — **PONTO / FECHAMENTO DE PONTO · RELATÓRIO DE "CONFLITOS DE OBRA NO MESMO DIA" · ELIMINADOS OS FALSOS POSITIVOS: BATIDAS NA MESMA OBRA EM HORÁRIOS DIFERENTES (EX.: 07:00 + 12:13) E ENTRADA SEM SAÍDA (FUNCIONÁRIO AINDA TRABALHANDO) NÃO SÃO MAIS MARCADAS COMO "BATIDA DUPLICADA". O CONFLITO AGORA NASCE SÓ DA PRESENÇA IMPOSSÍVEL — DUAS OBRAS DIFERENTES NO MESMO PERÍODO (EX.: QIU 07:00 SEM SAÍDA + PAPA 08:30).** PEDIDO (piloto FC): 07:00 sem saída é válido (não pode ser ignorado por "0h"); 07:00+12:13 é entrada+saída (manhã numa obra, tarde noutra) — não é conflito; conflito real = 2 obras no mesmo período (esqueceu a saída na obra A e bateu entrada na obra B). CAUSA-RAIZ: `getConflitosObraDia` era binária e IGNORAVA horário quando era a mesma obra (qualquer 2+ registros do mesmo func/obra/dia = "duplicada"); os lotes replicavam o erro. SOLUÇÃO (Opção A — só batidas IDÊNTICAS sinalizam): BACK (`fechamentoPonto.ts`) `getConflitosObraDia` ganhou motor de intervalos onde ENTRADA SEM SAÍDA ocupa até o fim do dia (fim=∞) e conflito = overlap entre OBRAS DIFERENTES; mesma obra só entra via `hasExactDuplicate` (horários idênticos). `resolveAllDuplicatas` subagrupa por assinatura de horários (só apaga idênticas; SELECT +entrada3/saida3). `resolveAllConflitos` só rateia com 2+ obras distintas. Front intacto (contadores/botões já liam `isSameObraDuplicate`/`hasOverlap`). ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3223** — **PONTO / FECHAMENTO DE PONTO · RELATÓRIO DE INCONSISTÊNCIAS · AO USAR O BOTÃO "CORRIGIR" (LÁPIS / LANÇAMENTO MANUAL) PARA TRATAR UMA INCONSISTÊNCIA, ELA AGORA DESAPARECE DA LISTA AUTOMATICAMENTE — NÃO PRECISA MAIS FAZER DOIS TRABALHOS (CORRIGIR E DEPOIS JUSTIFICAR). ANTES O LANÇAMENTO MANUAL SALVAVA O PONTO MAS A INCONSISTÊNCIA CONTINUAVA "PENDENTE" NA LISTA.** PEDIDO (piloto FC): "os corrigidos pelo botão editar não somem da lista; só somem se eu JUSTIFICAR, mas justificar não corrige o ponto — quero que ao editar eu já aprove a justificativa". CAUSA-RAIZ (2 pontos): (1) FRONT — o `ManualEntryDialog` (botão "Corrigir") chamava `handleManualSaved`, que dava refetch em stats/summary/conflitos mas NÃO em `inconsistencies`, então mesmo com o backend marcando "ajustado" a lista (filtro default "Pendentes") não recarregava; (2) BACK — `fechamentoPonto.manualEntry` só marcava `timeInconsistencies.status="ajustado"` no branch de UPDATE (dia com registro, ex.: batida ímpar), não no branch de INSERT (dia sem registro). SOLUÇÃO: FRONT (`FechamentoPonto.tsx`) `handleManualSaved` agora chama `inconsistencies.refetch()`; BACK (`fechamentoPonto.ts`, `manualEntry`) replica o UPDATE de `status='ajustado'` (filtro employeeId+data) também no branch de INSERT, na mesma transação. "Corrigir" vira ação única; "Justificar" segue para casos sem nada a corrigir. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3223** — **PONTO / FECHAMENTO DE PONTO · RELATÓRIO DE INCONSISTÊNCIAS · AO USAR O BOTÃO "CORRIGIR" (LÁPIS / LANÇAMENTO MANUAL) A INCONSISTÊNCIA DESAPARECE DA LISTA AUTOMATICAMENTE — NÃO PRECISA MAIS CORRIGIR E DEPOIS JUSTIFICAR.** FRONT (`FechamentoPonto.tsx`) `handleManualSaved` agora chama `inconsistencies.refetch()`; BACK (`fechamentoPonto.ts`, `manualEntry`) replica o UPDATE de `status='ajustado'` (employeeId+data) também no branch de INSERT (dia sem registro), na mesma transação. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3222** — **PONTO / ESPELHO DE PONTO · O ATESTADO MÉDICO (DIAS OU HORAS) LANÇADO NA CENTRAL DE DOCUMENTOS AGORA APARECE NO ESPELHO DE PONTO — O DIA VIRA "ATESTADO" (ROXO, ABONADO) EM VEZ DE "FALTA".** BACK (`horasExtras.ts`, `getEspelhoPontoRange`, read-only/retroativo): nova query em `atestados` projeta `atestadoDates` (tipo "dia": cobre `diasAfastamento` a partir de `dataEmissao`) e `atestadoHorasDates` (tipo "horas": só o dia; coluna snake_case `afastamento_tipo`). FRONT (`EspelhoPonto.tsx`): `getDayStatus` marca "Atestado" ("dia" sempre; "horas" só sem batida) e `summary` abona o dia. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3221** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · AS DUAS TELAS EXPANDIDAS DE PENDÊNCIA ("NO EXTRATO, SEM LANÇAMENTO" E "NO ERP, SEM EXTRATO") GANHARAM 3 CARDS DE RESUMO NO TOPO — TOTAL DE ENTRADAS, TOTAL DE SAÍDAS E SALDO (ENTRADAS − SAÍDAS) — E O LAYOUT DAS LINHAS FOI MODERNIZADO COM ÍCONE DIRECIONAL VERDE/VERMELHO + BADGE ENTRADA/SAÍDA.** FRONT-ONLY (`FinanceiroConciliacao.tsx`): no modal `expandedList` (serve AMBAS as telas) novo bloco de 3 cards; soma sobre a lista JÁ FILTRADA (`repExtView`/`repLanView`) → totais reagem à busca; direção no EXTRATO = `valor ≥ 0`, no ERP = `tipo === "receita"`; saldo = entradas − saídas (azul ≥ 0 / âmbar < 0). Linhas com avatar circular `ArrowDownCircle`/`ArrowUpCircle` + badge. ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE · só UI. Detalhe: `shared/changelog.ts`.

- **Rev. 3220** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · OS "DEMONSTRATIVOS DE PAGAMENTO" (PDF COM TODOS OS PIX + PDF COM TODOS OS BOLETOS PAGOS DO MÊS) AGORA PODEM SER LIDOS POR IA: BOTÃO "LER COM IA" COM BARRA DE PROGRESSO 0→100% E UMA TELA (MODAL) MOSTRANDO TUDO QUE A IA EXTRAIU — QUEM RECEBEU, CPF/CNPJ, VALOR (BRL), DATA E ID DA TRANSAÇÃO — COM BUSCA, CONTADOR E TOTAL. ANTES O PDF SÓ FICAVA ANEXADO P/ ABRIR MANUALMENTE.** BACK (`financial.ts`): `_lerDemonstrativoIA` (Gemini Vision, extrai LISTA ≠ `_lerComprovanteIA` 1-só) + procedure `lerDemonstrativoComIA` (guards de empresa/conta/IA; baixa PDF SÓ via `_baixarComprovante` /uploads = sem SSRF; persiste JSON idempotente); `getConciliacaoDemonstrativos` devolve `pix/boletoExtraido`+`LidoEm`. SCHEMA ADITIVO: `ADD COLUMN IF NOT EXISTS` em `financial_conciliacao_demonstrativos`. FRONT (`FinanceiroConciliacao.tsx`): botão "Ler com IA"/"Reler" + `<Progress>` 0→92%→100% + modal "Tudo que a IA leu". ZERO ALTER destrutivo/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3219** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · NOVO CAMPO DE BUSCA (TEXTO LIVRE) QUE FILTRA AS DUAS LISTAS DE PENDÊNCIA AO MESMO TEMPO — "NO EXTRATO, SEM LANÇAMENTO" (BANCO) E "NO ERP, SEM EXTRATO" — POR DESCRIÇÃO, FORNECEDOR, OBRA, DOCUMENTO, DATA E VALOR (BRL FORMATADO + NÚMERO CRU), COM NORMALIZAÇÃO DE ACENTO/CAIXA.** FRONT (`FinanceiroConciliacao.tsx`): estado único `buscaConc` filtra AMBAS as listas via `normBusca`+`matchBusca`; derivados `repExtView`/`repLanView` usados na visão de 2 colunas E no modo "Expandir". ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### REGRA DE OURO — Cabeçalho de documentos institucionais FC (Rev. 2106+)

Todo documento oficial FC (contrato, aviso prévio, termo de rescisão, comunicado interno, carta MDO, advertência etc.) DEVE usar este cabeçalho HTML:

```
[logo centralizado ~88px — fallback ${window.location.origin}/logo-fc.jpg]
[RAZÃO SOCIAL caixa alta 16pt bold centralizado]
[CNPJ: xx.xxx.xxx/xxxx-xx — 9.5pt centralizado cinza]
[ENDEREÇO COMPLETO uppercase 9pt centralizado cinza claro]
[faixa azul #1B2A4A full-width, border branco 2px, padding 14px,
 TÍTULO DO DOC caixa alta 13pt letter-spacing 3px branco]
[Nº NNN/AAAA (esq) ───── Data de Emissão: DD/MM/AAAA (dir)]
```

Regras técnicas obrigatórias:
- **Inline styles** em TODOS elementos críticos (DOMPurify pode descartar `<style>` externo).
- `<style>` interno SEMPRE dentro do `<body>` (não no `<head>`).
- `print-color-adjust: exact` inline na faixa azul (cores de fundo no print).
- JAMAIS usar `onerror=`, `onload=` ou qualquer handler `on*` (filtro XSS do `signatures.create`).
- Logo SEMPRE com fallback `${window.location.origin}/logo-fc.jpg`.
- Corpo: `text-align:justify; hyphens:auto`, Times serif 11.5pt.
- Cláusulas com `border-left:3px solid #1B2A4A; padding-left:8px` no título.

> Revisões anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).

## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
- **Moeda SEMPRE em formato BRL pt-BR (`R$ 100.000,00` — ponto p/ milhar, vírgula p/ centavos).** Tanto na EXIBIÇÃO (usar `formatBRL`) quanto em INPUTS de digitação de valor (usar máscara `maskBRL`/`parseMaskBRL`). Nunca exibir/aceitar o formato cru anglo `100000.00`.
- **REGRA DE OURO — CAMINHO B (Rev. 2646+, substitui Rev. 2644/2617/2533/2603).** O "% PREVISTO" é a réplica da coluna **"% PREVISTO" (Texto10) do MS Project** — "verdade absoluta". O "% CONCLUÍDA" segue a coluna `PercentComplete`. As duas régua são alinhadas às fórmulas do MSP:
  - **% PREVISTO — FÓRMULA-FONTE (Texto10):** a coluna "% PREVISTO" do MSP é `Int(Num Dur(Prev)[188743983] ÷ PESO DUR(BL)[188743982] × 100 + 0.5)` = fração de duração da baseline DECORRIDA até o StatusDate, ponderada por DURAÇÃO das folhas, **ARREDONDADA** (`+0.5` antes do `Int` = `round`, NÃO trunca).
  - **% PREVISTO — RÉGUA NO ERP (projeção p/ TODAS as semanas):** motor de **TEMPO ÚTIL MINUTO-A-MINUTO** da baseline (`unitsElapsed`/`unitsTotal` sobre `shared/diasUteis`, clipando aos `weekDayIntervals` do calendário). **RAIZ = ROLLUP** = `round(Σ minutos úteis DECORRIDOS das folhas ÷ Σ minutos úteis TOTAIS das folhas × 100)` — soma das DURAÇÕES das folhas, **NÃO** o vão início→fim do projeto (corrigido na Rev. 2644). POR ATIVIDADE = `round(elapsed/total × 100)`. `round` (não `trunc`) p/ espelhar o `+0.5` do Texto10.
  - **% PREVISTO — LEITURA DO VALOR-SNAPSHOT (cliente) (Rev. 2647+, substitui Rev. 2644):** `client/.../ImportarCronograma.tsx` lê SEMPRE a MESMA coluna FIXA `Texto10 (188743750)` via const `FID_PREVISTO_TEXTO10`, em TODOS os projetos (presentes e futuros). **ACABARAM a detecção por `<Alias>` (`detectarFidPorAlias` removida) e as reservas Texto6/Texto11.** Se Texto10 faltar no XML, o valor fica `null` → a tela mostra "—" (jamais lê outra coluna; Texto6 em templates LOTUS é lixo sem alias/fórmula). Vale pra RAIZ (`parseMSProjectFull`) e pra cada ATIVIDADE (`parseMSProjectTasksFromDoc`).
  - **Baseline COM HORA é OBRIGATÓRIA.** Lê `baseline_start_ts`/`baseline_finish_ts` (TEXT ISO com hora). Sem `weekDayIntervals` OU sem TS → fallback day-granular ponderado por duração (backward compat). Cutoff semanal = fim-do-dia (`T23:59:59Z`).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **PADRÃO ATUAL (Rev. 2646): o snapshot "% Previsto" REGENERA EM TODO UPLOAD DO XML — inclusive o SEMANAL — usando o calendário do XML como verdade absoluta.** Acontece em `salvarAtividades` (cadastro/substituir) E em `salvarMetadadosMSProject` (que roda em todo import e regrava o `calendarioJson` limpo). Como a baseline é imutável dentro da revisão, re-rodar é IDEMPOTENTE (mesma curva), mas garante que projetos ANTIGOS se AUTO-CUREM no próximo upload semanal (ex.: a curva ~1% baixa por feriado injetado pré-Rev. 2645 some sozinha). REVOGA a regra anterior "snapshot regenerado SÓ no salvarAtividades / avanço semanal NÃO regenera". RESSALVA: projetos dormentes (sem novos uploads) só corrigem com reimport do cronograma inicial.
  - **RESSALVA DE PARIDADE NUMÉRICA:** o XML de referência (PLN_816 R04) tem StatusDate < StartDate → Texto10 = 0% em tudo, então a curva numérica NÃO foi cravada empiricamente nesta revisão. A régua matemática está alinhada à fórmula; falta re-validar com XML de status-date no meio do projeto.
  - Implementação: `server/routers/planejamento.ts` (`regenerarPrevistoSemanasCaminhoB` — rollup das folhas + round; chamada pós-transaction em `salvarAtividades` E em `salvarMetadadosMSProject` — Rev. 2646, que roda em TODO upload e resolve a revisão ativa + respeita a fonte; `importarComModo` propaga os TS), `client/src/pages/planejamento/ImportarCronograma.tsx` (`detectarFidPorAlias` + parser `<Baseline Number=0>` COM HORA + `<WorkingTime>`→`weekDayIntervals`), `shared/diasUteis.ts` (motor minuto-a-minuto), `drizzle/schema.ts` + self-heal `[SyncSchema+]` (`baseline_start_ts`/`baseline_finish_ts`).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
