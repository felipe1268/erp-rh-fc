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

- **Rev. 3300** — **FINANCEIRO / DASHBOARD · CONCILIAÇÃO BANCÁRIA · DOIS AJUSTES DO PILOTO FC: (1) APOSENTADO O "GIRO BRUTO" (ENTRADAS + SAÍDAS SOMADAS — "R$ 16 MI") POR NÃO TER SENTIDO CONTÁBIL; (2) O RELATÓRIO "CONCILIAÇÃO POR CONTA BANCÁRIA" (MODAL) PAROU DE CORTAR COLUNAS À DIREITA NO iPad. 100% ADITIVO NO BACKEND (SÓ AMPLIA UM SELECT READ-ONLY) · ZERO SCHEMA/ALTER/DROP/DELETE (R-001/R-007/R-010 OK).** PEDIDO: "tire estes 16 milhões — não faz sentido somar [entradas+saídas]" + "ajusta a tela do relatório que está cortando a informação". O "giro bruto" = Σ|valor| = entradas + saídas somadas (coincidia com Pendente/Total 2026); o "Pendente"/"% conciliado" (valor A CONCILIAR, núcleo do dashboard) PERMANECEM. BACKEND (`server/routers/financial.ts`, aditivo/READ-ONLY): `getConciliacaoResumoMensal` passou a devolver `valorEntradas`/`valorSaidas` por mês (mesma convenção de sinal de `getBankAccountsConciliacaoStatus`); `valorTotal`/`valorConciliado` continuam. FRONT (`DashConciliacao.tsx`): subtítulo do KPI "Saldo líquido" perdeu o "· giro bruto R$ X"; régua `ComparativoAnual` trocou `m.valorTotal` por `valorEntradas − valorSaidas` (SALDO LÍQUIDO mês a mês), título "Saldo líquido do extrato — mês a mês e ano a ano"; modal `DetailDialog` perdeu a coluna "Giro bruto (R$)" (9→8 colunas) e o `totalKey="valorTotal"` (some o chip/rodapé "Total R$ 16 mi"); demais colunas rolam pelo `overflow-x-auto` do `Table`. Validado: esbuild parse limpo; app sobe no Neon DEV. Detalhe: `shared/changelog.ts`.

- **Rev. 3299** — **PLANEJAMENTO / EFETIVO × IA (VISÃO GERAL — TODAS AS OBRAS) · NOVA "AGENDA POR MÊS" + DUAS MELHORIAS NO "PLANO DE AÇÃO POR EQUIPE": (1) NENHUMA SUGESTÃO É RETROATIVA — TODA DATA IDEAL/ESTIMADA É CLAMPADA P/ HOJE OU FUTURO (VENCIDA → HOJE, COM SELO "ATRASADO"); (2) NOVA AÇÃO "ANTECIPAR FÉRIAS" COMO ALTERNATIVA AO AVISO PRÉVIO — QUANDO A FUNÇÃO QUE SOBRA TEM FUNCIONÁRIO(S) COM FÉRIAS FUTURAS AGENDÁVEIS, A IA SUGERE ANTECIPAR AS FÉRIAS P/ GANHAR ~30 DIAS E BUSCAR REALOCAÇÃO ANTES DE DEMITIR (ORDEM REALOCAR > ANTECIPAR FÉRIAS > AVISO PRÉVIO). MAIS A "AGENDA POR MÊS" — TABELA RESUMO AGRUPADA POR MÊS/ANO DE QUANDO COMEÇAR CADA AÇÃO. TUDO NA TELA E NO PDF PADRÃO FC. 100% ADITIVO · CONTEXTO+PROMPT+SCHEMA+SANITIZAÇÃO+UI · ZERO SCHEMA/ALTER/DROP/DELETE · ESCAPAGEM XSS (esc/escAttr) PRESERVADA (R-001/R-007/R-010 OK).** PEDIDOS (piloto FC): resumo por mês/ano de quando começar a realocar/demitir (gap 30 dias); nenhuma ação retroativa (só de hoje p/ frente); antes de demitir, se há férias a vencer, sugerir antecipá-las p/ ganhar tempo e tentar realocar. BACKEND (`server/routers/iaCronograma.ts`, aditivo/determinístico): `CargoAgg`/`ObraEfetivo.porCargo` ganharam `feriasAntecipaveis` (seção "4d" conta ativos com período de férias FUTURO não iniciado, bucket≠em_gozo, início>hoje; propagado no contexto/`cargosTxt`); helper `naoRetroativoBR(brData)→{data,atrasado}` (clampa data<hoje p/ hoje) + `antecipFeriasSet` (whitelist `obra|cargo`); `systemPrompt` ganhou ação `antecipar_ferias` + regra dura não-retroativa; sanitização aplica `naoRetroativoBR` em `transferencias.dataDisponivel`/`previsaoDisponibilidade.dataEstimada`/`planoEquipe.dataIdeal` (+flag `atrasado`) e só aceita `antecipar_ferias` se `antecipFeriasSet` confirmar (senão rebaixa p/ `aviso_previo`). FRONT (`EfetivoGlobalIA.tsx`): helpers `acaoMeta`/`ehAtrasado` + `agruparPorMes`/`AgendaRow`/`useMemo agenda`; cards âmbar "ANTECIPAR FÉRIAS" (Plane) entre realocar (verde) e aviso (vermelho), badge de data rosa "· atrasado"; agenda por mês com contagem por ação; PDF `tagAcao`+`.tag-ferias`+`tagAtraso`, rodapés explicativos, texto IA escapado pelos `esc`/`escAttr` LOCAIS. Validado: esbuild parse limpo nos 2 arquivos; app sobe no Neon DEV. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3298** — **PLANEJAMENTO / EFETIVO × IA (VISÃO GERAL — TODAS AS OBRAS) · REDESIGN GERENCIAL DO PAINEL ON-SCREEN: NOVO LAYOUT "PAINEL GERENCIAL" MAIS MODERNO E DETALHADO, COM CABEÇALHO NA FAIXA INSTITUCIONAL FC (#1B2A4A), UM DIAL/GAUGE RADIAL DE "SAÚDE DO EFETIVO" (% DE FUNÇÕES EQUILIBRADAS, COR VERDE/ÂMBAR/VERMELHO) AO LADO DOS KPIs MAIORES, TÍTULOS DE SEÇÃO COM CONTADOR/ACENTO E HISTOGRAMA POR FUNÇÃO EM CARDS LADO-A-LADO COM NÚMEROS EM DESTAQUE. 100% VISUAL/ADITIVO · ZERO MUDANÇA DE DADOS/ENDPOINTS/SCHEMA · O PDF E TODA A LÓGICA tRPC/SANITIZAÇÃO FICAM INTACTOS (R-001/R-007/R-010 OK).** PEDIDO (piloto FC): "faz um layout mais moderno e detalhado... quero uma apresentação dial — gerencial". SÓ apresentação em `client/src/pages/planejamento/EfetivoGlobalIA.tsx`: cabeçalho em gradiente #1B2A4A→#22315a com ícone Gauge + selo "PAINEL GERENCIAL" (wrapper externo neutro rounded-2xl); novo `useMemo` `saude` (deriva do `histograma`: nº de funções equilibradas/falta/sobra + Σ deltas + % saúde) alimenta um DIAL SVG donut (raio 40, circunferência 251,33, cor ≥80% verde / ≥50% âmbar / senão vermelho) ao lado de KPIs maiores em grid 12-col; novo componente `SectionTitle` (acento + chip de contagem) nas 4 seções; histograma virou cards brancos em grid 2-col (xl) com pills de situação, barras com trilho slate-100 e números `tabular-nums` à direita; riscos/recomendações/resumo em cards com leve gradiente. PRESERVADO: fonte de dados, `imprimirRelatorio` (PDF padrão FC) e escapagem XSS (`esc`/`escAttr` locais) IDÊNTICOS. Validado: esbuild parse limpo (44,6kb); app sobe no Neon DEV. Detalhe: `shared/changelog.ts`.

- **Rev. 3297** — **PLANEJAMENTO / EFETIVO × IA (VISÃO GERAL — TODAS AS OBRAS) · NOVO RELATÓRIO IMPRIMÍVEL/PDF NO PADRÃO INSTITUCIONAL FC (FAIXA AZUL #1B2A4A) + "PLANO DE AÇÃO POR EQUIPE" QUE, PARA CADA SOBRA, DECIDE ENTRE *REALOCAR* (HÁ OBRA PRÓXIMA COM DEMANDA — COM A DATA IDEAL EM QUE A EQUIPE SE LIBERA) E *AVISO PRÉVIO* (OBRA CONCLUINDO SEM DEMANDA PRÓXIMA — DATA IDEAL ~30 DIAS ANTES DO FIM DO SERVIÇO, P/ O AVISO TERMINAR JUNTO COM A OBRA). 100% ADITIVO · PROMPT+SCHEMA+SANITIZAÇÃO+UI+BOTÃO IMPRIMIR · ZERO SCHEMA/ALTER/DROP/DELETE (R-001/R-007/R-010 OK).** DEFINIÇÃO: para cada equipe que SOBRA (frente/obra concluindo no horizonte), a IA escolhe UMA ação — "realocar" quando há OUTRA obra do MESMO grupo de proximidade (mesma cidade/estado) com FALTA da função (`dataIdeal`=quando libera na origem + `destino`); "aviso_previo" quando a obra conclui SEM demanda próxima (como o aviso dura ~30 dias, `dataIdeal`≈30 dias antes do fim). Nunca aviso quando há realocação possível. BACKEND (`server/routers/iaCronograma.ts`, aditivo): nova diretriz no `systemPrompt`; schema JSON ganha `planoEquipe[{cargo,obra,quantidade,acao,dataIdeal,destino,motivo}]`; sanitização `7c` (obra ∈ `obraInfo`; `acao` enum realocar|aviso_previo; `destino` só se for OUTRA obra existente E realocar; clamp qtd) → `resultado.planoEquipe`. FRONTEND (`EfetivoGlobalIA.tsx`): nova seção on-screen "Plano de ação por equipe" (cards verdes REALOCAR / vermelhos AVISO PRÉVIO + badge da data ideal) + botão "Imprimir / PDF" que monta HTML padrão FC (logo fallback `${origin}/logo-fc.jpg`, KPIs, leitura geral, tabela do plano, remanejamento, previsão, efetivo por função, riscos/recomendações). XSS: `esc`/`escAttr` LOCAIS em TODO texto de IA. Validado: esbuild parse limpo nos 2 arquivos; app sobe no Neon DEV (HTTP 200). Detalhe: `shared/changelog.ts`.

- **Rev. 3296** — **PLANEJAMENTO / EFETIVO × IA (VISÃO GERAL — TODAS AS OBRAS) · A IA AGORA ESTIMA EM QUE DATA VAI SOBRAR MÃO DE OBRA PARA REALOCAR: ALÉM DE APONTAR "SOBRA (-2)" POR FUNÇÃO, A ANÁLISE DIZ *QUANDO* A EQUIPE SE LIBERA — A SOBRA SURGE QUANDO UMA FRENTE/ATIVIDADE CONCLUI. NOVA SEÇÃO "PREVISÃO DE DISPONIBILIDADE (QUANDO SOBRA MÃO DE OBRA)" COM DATA ESTIMADA POR FUNÇÃO/OBRA + DATA "DISPONÍVEL A PARTIR DE" EM CADA CARD DE REMANEJAMENTO. 100% ADITIVO · CONTEXTO+PROMPT+SANITIZAÇÃO+UI · ZERO SCHEMA/ALTER/DROP/DELETE (R-001/R-007/R-010 OK).** DEFINIÇÃO: a sobra se materializa quando uma FRENTE (atividade) CONCLUI e libera a equipe; a fonte determinística da data é o `dataFim` das atividades-folha dentro do horizonte das próximas 8 semanas (em andamento + próximas que terminam ≤ 56 dias). BACKEND (`server/routers/iaCronograma.ts`, aditivo): `efetivoGlobal` — `ObraEfetivo` ganha `frentesConcluindo[]` (combina `emAndamento`+`proximas`, filtra `dataFim` no horizonte via helpers `hojeG`/`horizG`/`parseDtG`, ordena por término, top 6, "{nome} — conclui DD/MM/AAAA (recurso)"); esse bloco entra no contexto multi-obra ("Frentes que CONCLUEM no horizonte"); `systemPrompt` ganha diretriz "ESTIMATIVA DE DATA DE SOBRA"; schema JSON ganha `previsaoDisponibilidade[{cargo,obra,dataEstimada,quantidade,motivo,sugestao}]` + `transferencias[].dataDisponivel`. SANITIZAÇÃO: `previsaoDisponibilidade` só aceita obra existente (`obraInfo`), exige cargo+dataEstimada, clampa qtd; `dataDisponivel` normalizado (≤40, null se vazio); datas via `brDatasDeep`. FRONTEND (`EfetivoGlobalIA.tsx`): nova seção verde "Previsão de disponibilidade" (CalendarClock) com cards por função (badge data, obra, qtd, motivo, sugestão) — só quando há itens; cada card de Remanejamento mostra "Disponível a partir de DD/MM/AAAA". Validado: esbuild parse limpo nos 2 arquivos; app sobe no Neon DEV (HTTP 200). Detalhe: `shared/changelog.ts`.

- **Rev. 3295** — **PLANEJAMENTO / EFETIVO × IA (VISÃO GERAL — TODAS AS OBRAS) · O NÚMERO DETERMINÍSTICO POR FUNÇÃO AGORA ABATE QUEM ENTRA DE FÉRIAS NO HORIZONTE: ALÉM DO "EFETIVO ATUAL" (ATIVOS) E DO "RECOMENDADO" (IA), O HISTOGRAMA PASSA A MOSTRAR O "DISPONÍVEL NO HORIZONTE" = ATIVOS − QUEM ENTRA DE FÉRIAS INADIÁVEIS NAS PRÓXIMAS 8 SEMANAS, POR FUNÇÃO. A IA RECEBE ESSE DADO E LEVA EM CONTA A INDISPONIBILIDADE FUTURA AO APONTAR FALTA DE EQUIPE E PRIORIZAR TRANSFERÊNCIAS. 100% ADITIVO · SÓ CÁLCULO DETERMINÍSTICO + PROPAGAÇÃO + UI · ZERO SCHEMA/ALTER/DROP/DELETE (R-001/R-007/R-010 OK).** DEFINIÇÃO: "disponível no horizonte" por função = ATIVOS − (quem entra de FÉRIAS INADIÁVEIS dentro das próximas 8 semanas = mesmo horizonte do cronograma); quem JÁ está em gozo NÃO conta de novo (já sai dos ativos → evita dupla contagem); só o que cai no bucket "proximas" E inadiável abate (1º período remanejável NÃO). BACKEND (`server/routers/iaCronograma.ts`, determinístico): `coletarEfetivoCronograma` — `CargoAgg` ganha `feriasHorizonte`, novo `Set` de IDs ATIVOS por cargo, e seção que conta por função os ativos cujo período de férias cai em `proximas`+`inadiavel`; `efetivoGlobal` — `porCargo`/`histMap` propagam `feriasHorizonte`, histograma de saída ganha `feriasHorizonte` + `disponivelHorizonte=max(0,ativos−feriasHorizonte)`, `resumoTotais` soma o total, e o contexto+regra da IA mostram "entram de FÉRIAS ... → disponível no horizonte N". FRONTEND (`EfetivoGlobalIA.tsx`): KPI "Entram de férias (8 sem)" (âmbar) quando total>0; por função, barra âmbar "Disp.: {disponivelHorizonte}" + linha explicativa — só quando `feriasHorizonte>0`. Validado: `tsc` limpo nos 2 arquivos; app sobe no Neon DEV. Detalhe: `shared/changelog.ts`.

- **Rev. 3294** — **PLANEJAMENTO / EFETIVO × IA · NOVA "VISÃO GERAL — EFETIVO × IA (TODAS AS OBRAS)": UMA TELA QUE CRUZA O EFETIVO ATUAL POR FUNÇÃO DE TODAS AS OBRAS ATIVAS DA EMPRESA SELECIONADA COM O CRONOGRAMA DAS PRÓXIMAS 8 SEMANAS, MOSTRA ONDE SOBRA/FALTA EQUIPE E SUGERE REMANEJAMENTO — MAS SÓ ENTRE OBRAS PRÓXIMAS (MESMA CIDADE/ESTADO). 100% ADITIVO · 2 ENDPOINTS + 1 COMPONENTE · ZERO SCHEMA NOVO/ALTER/DROP/DELETE.** PROXIMIDADE: "próximas" = MESMA `CIDADE|ESTADO`; filtro GARANTIDO NO SERVIDOR. 1 chamada de IA (free-tier): reusa `coletarEfetivoCronograma`, histograma DETERMINÍSTICO (Σ atual) + recomendado da IA. `efetivoGlobal`/`ultimaEfetivoGlobal` (`iaCronograma.ts`); reusa `planejamento_analises_efetivo` (`projetoId=0`/`tipo="global"`); FRONT `EfetivoGlobalIA.tsx` em Planejamento › Projetos. Detalhe: `shared/changelog.ts`.

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
