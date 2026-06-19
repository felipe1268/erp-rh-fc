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

- **Rev. 3296** — **PLANEJAMENTO / EFETIVO × IA (VISÃO GERAL — TODAS AS OBRAS) · A IA AGORA ESTIMA EM QUE DATA VAI SOBRAR MÃO DE OBRA PARA REALOCAR: ALÉM DE APONTAR "SOBRA (-2)" POR FUNÇÃO, A ANÁLISE DIZ *QUANDO* A EQUIPE SE LIBERA — A SOBRA SURGE QUANDO UMA FRENTE/ATIVIDADE CONCLUI. NOVA SEÇÃO "PREVISÃO DE DISPONIBILIDADE (QUANDO SOBRA MÃO DE OBRA)" COM DATA ESTIMADA POR FUNÇÃO/OBRA + DATA "DISPONÍVEL A PARTIR DE" EM CADA CARD DE REMANEJAMENTO. 100% ADITIVO · CONTEXTO+PROMPT+SANITIZAÇÃO+UI · ZERO SCHEMA/ALTER/DROP/DELETE (R-001/R-007/R-010 OK).** DEFINIÇÃO: a sobra se materializa quando uma FRENTE (atividade) CONCLUI e libera a equipe; a fonte determinística da data é o `dataFim` das atividades-folha dentro do horizonte das próximas 8 semanas (em andamento + próximas que terminam ≤ 56 dias). BACKEND (`server/routers/iaCronograma.ts`, aditivo): `efetivoGlobal` — `ObraEfetivo` ganha `frentesConcluindo[]` (combina `emAndamento`+`proximas`, filtra `dataFim` no horizonte via helpers `hojeG`/`horizG`/`parseDtG`, ordena por término, top 6, "{nome} — conclui DD/MM/AAAA (recurso)"); esse bloco entra no contexto multi-obra ("Frentes que CONCLUEM no horizonte"); `systemPrompt` ganha diretriz "ESTIMATIVA DE DATA DE SOBRA"; schema JSON ganha `previsaoDisponibilidade[{cargo,obra,dataEstimada,quantidade,motivo,sugestao}]` + `transferencias[].dataDisponivel`. SANITIZAÇÃO: `previsaoDisponibilidade` só aceita obra existente (`obraInfo`), exige cargo+dataEstimada, clampa qtd; `dataDisponivel` normalizado (≤40, null se vazio); datas via `brDatasDeep`. FRONTEND (`EfetivoGlobalIA.tsx`): nova seção verde "Previsão de disponibilidade" (CalendarClock) com cards por função (badge data, obra, qtd, motivo, sugestão) — só quando há itens; cada card de Remanejamento mostra "Disponível a partir de DD/MM/AAAA". Validado: esbuild parse limpo nos 2 arquivos; app sobe no Neon DEV (HTTP 200). Detalhe: `shared/changelog.ts`.

- **Rev. 3295** — **PLANEJAMENTO / EFETIVO × IA (VISÃO GERAL — TODAS AS OBRAS) · O NÚMERO DETERMINÍSTICO POR FUNÇÃO AGORA ABATE QUEM ENTRA DE FÉRIAS NO HORIZONTE: ALÉM DO "EFETIVO ATUAL" (ATIVOS) E DO "RECOMENDADO" (IA), O HISTOGRAMA PASSA A MOSTRAR O "DISPONÍVEL NO HORIZONTE" = ATIVOS − QUEM ENTRA DE FÉRIAS INADIÁVEIS NAS PRÓXIMAS 8 SEMANAS, POR FUNÇÃO. A IA RECEBE ESSE DADO E LEVA EM CONTA A INDISPONIBILIDADE FUTURA AO APONTAR FALTA DE EQUIPE E PRIORIZAR TRANSFERÊNCIAS. 100% ADITIVO · SÓ CÁLCULO DETERMINÍSTICO + PROPAGAÇÃO + UI · ZERO SCHEMA/ALTER/DROP/DELETE (R-001/R-007/R-010 OK).** DEFINIÇÃO: "disponível no horizonte" por função = ATIVOS − (quem entra de FÉRIAS INADIÁVEIS dentro das próximas 8 semanas = mesmo horizonte do cronograma); quem JÁ está em gozo NÃO conta de novo (já sai dos ativos → evita dupla contagem); só o que cai no bucket "proximas" E inadiável abate (1º período remanejável NÃO). BACKEND (`server/routers/iaCronograma.ts`, determinístico): `coletarEfetivoCronograma` — `CargoAgg` ganha `feriasHorizonte`, novo `Set` de IDs ATIVOS por cargo, e seção que conta por função os ativos cujo período de férias cai em `proximas`+`inadiavel`; `efetivoGlobal` — `porCargo`/`histMap` propagam `feriasHorizonte`, histograma de saída ganha `feriasHorizonte` + `disponivelHorizonte=max(0,ativos−feriasHorizonte)`, `resumoTotais` soma o total, e o contexto+regra da IA mostram "entram de FÉRIAS ... → disponível no horizonte N". FRONTEND (`EfetivoGlobalIA.tsx`): KPI "Entram de férias (8 sem)" (âmbar) quando total>0; por função, barra âmbar "Disp.: {disponivelHorizonte}" + linha explicativa — só quando `feriasHorizonte>0`. Validado: `tsc` limpo nos 2 arquivos; app sobe no Neon DEV. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3294** — **PLANEJAMENTO / EFETIVO × IA · NOVA "VISÃO GERAL — EFETIVO × IA (TODAS AS OBRAS)": UMA TELA QUE CRUZA O EFETIVO ATUAL POR FUNÇÃO DE TODAS AS OBRAS ATIVAS DA EMPRESA SELECIONADA COM O CRONOGRAMA DAS PRÓXIMAS 8 SEMANAS, MOSTRA ONDE SOBRA/FALTA EQUIPE E SUGERE REMANEJAMENTO — MAS SÓ ENTRE OBRAS PRÓXIMAS (MESMA CIDADE/ESTADO). 100% ADITIVO · 2 ENDPOINTS + 1 COMPONENTE · ZERO SCHEMA NOVO/ALTER/DROP/DELETE.** PROXIMIDADE: "próximas" = MESMA `CIDADE|ESTADO`; filtro GARANTIDO NO SERVIDOR. 1 chamada de IA (free-tier): reusa `coletarEfetivoCronograma`, histograma DETERMINÍSTICO (Σ atual) + recomendado da IA. `efetivoGlobal`/`ultimaEfetivoGlobal` (`iaCronograma.ts`); reusa `planejamento_analises_efetivo` (`projetoId=0`/`tipo="global"`); FRONT `EfetivoGlobalIA.tsx` em Planejamento › Projetos. Detalhe: `shared/changelog.ts`.

- **Rev. 3293** — **RH & DP / FOLHA DE PAGAMENTO (VALE + FOLHA MENSAL) · ARREDONDAMENTO PARA MÚLTIPLOS DE R$ 1,00 COM CARRY-FORWARD AUDITÁVEL — O VALOR PAGO É O REAL INTEIRO MAIS PRÓXIMO DO LÍQUIDO EXATO E O RESIDUAL EM CENTAVOS VIRA SALDO QUE CARREGA PRA O PRÓXIMO EVENTO DO MESMO FUNCIONÁRIO (VALE → FOLHA → VALE...). CADA EVENTO MOSTRA "± Rx ARRED." NO HOLERITE E A TRILHA FICA NUMA TABELA-LEDGER. 100% ADITIVO · CREATE TABLE/ADD COLUMN IF NOT EXISTS · ZERO ALTER DESTRUTIVO/DROP/DELETE.** `pago_n=round(exato_n+B_{n-1})`; carry = `residualGerado` do ÚLTIMO evento anterior (maior `ordem`<atual, NÃO soma → idempotente). Tabela `payroll_rounding_ledger` + colunas `ajusteArredondamento`/`*Exato` em advances/payments (self-heal); helpers em `payrollEngine.ts`; VALE/FOLHA recalculam ledger; UI `FolhaPagamento.tsx`. Detalhe: `shared/changelog.ts`.

- **Rev. 3292** — **RH & DP / FOLHA DE PAGAMENTO (VALE / ADIANTAMENTO) · UM FUNCIONÁRIO RECONTRATADO COMO PJ CONTINUAVA APARECENDO NO CARD DE VALE (E NA "DECISÃO NECESSÁRIA") COM ADIANTAMENTO PROPORCIONAL PORQUE O SNAPSHOT `payroll_periods.valeResultJson` FOI GERADO QUANDO ELE AINDA ERA CLT E NUNCA REGEROU APÓS A VIRADA PRA PJ. AGORA O SNAPSHOT É SANITIZADO NA LEITURA (PJ/SÓCIO/EXCLUÍDO SOME DA TELA) E HÁ GUARDA DURA NA APROVAÇÃO (PJ/SÓCIO NUNCA RECEBE VALE). 100% BACKEND · READ-ONLY NO READ + UPDATE DEFENSIVO · ZERO SCHEMA/ALTER/DROP/DELETE.** Helper READ-ONLY `getIdsInelegiveisVale` (lê `tipoContrato`/`deletedAt` ATUAIS) + `sanitizarValeSnapshotNaoClt` em `getPeriod` (recalcula totais; JSON intacto se ninguém inelegível); `decidirVale` ganhou guarda — `pagar:true` p/ inelegível vira `rejeitado`+`bloqueado` e NÃO gera `financial_events`. Órfã em `payroll_advances` higieniza no próximo "Gerar Vale". Detalhe: `shared/changelog.ts`.

- **Rev. 3291** — **PLANEJAMENTO / EFETIVO × IA (DIAGNÓSTICO + SIMULADOR) · O SIMULADOR/DIAGNÓSTICO CAÍA NO iPad COM "A IA DEMOROU DEMAIS" E NUNCA RESTAURAVA O RESULTADO PORQUE A TABELA `planejamento_analises_efetivo` ESTAVA DESSINCRONIZADA (PROD SEM `contexto`, DEV SEM A TABELA); SELF-HEAL ADITIVO A CRIA/COMPLETA. ZERO ALTER DESTRUTIVO/DROP/DELETE.** `[SyncSchema+]` (`server/_core/index.ts`): `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` (esp. `contexto`) + índice; INSERT/SELECT voltam a funcionar e a recuperação após queda acha a análise. Detalhe: `shared/changelog.ts`.

- **Rev. 3290** — **RH & DP / DASHBOARD DE FUNCIONÁRIOS (DRILL-DOWN "FUNÇÃO: X") · A TABELA QUE LISTA OS FUNCIONÁRIOS DE UMA FUNÇÃO GANHOU DUAS COLUNAS: "OBRA" (ONDE A PESSOA ESTÁ ALOCADA AGORA) E "CIPA" ("CIPA ATIVA" SE É MEMBRO DO MANDATO VIGENTE OU "ESTÁVEL (ANTERIOR)" SE TEM ESTABILIDADE DE MANDATO PASSADO). 100% BACKEND READ-ONLY + FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** `getDrillDown` (`server/routers/dashboards.ts`, aditivo, 2 queries sem N+1): OBRA ATIVA via `obra_funcionarios` isActive=1 ⋈ `obras.nome`; CIPA via `cipa_members` ⋈ `cipa_elections` ("ativa" se `mandatoFim>=hoje`, senão "estavel_anterior" se `fimEstabilidade>=hoje`). FRONT: badges azul (Obra) e verde/âmbar (CIPA) em todos os recortes. Detalhe: `shared/changelog.ts`.

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
