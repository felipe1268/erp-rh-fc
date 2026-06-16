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

- **Rev. 3155** — **FINANCEIRO / LANÇAMENTOS · O AGRUPAMENTO DOS LANÇAMENTOS DE FROTA PASSOU DE "POR TIPO" PARA "POR POSTO/FORNECEDOR" — CADA LINHA-GRUPO É UM POSTO (COMBUSTÍVEL) OU UMA OFICINA/FORNECEDOR (MANUTENÇÃO), ESPELHANDO O DASH "POSTOS MAIS UTILIZADOS".** PEDIDO (IMG_2096/IMG_2097, iPad): correção da Rev. 3154 — o posto/fornecedor EXISTE sim no módulo Frota ("Auto Posto Umuarama", "AUTO POSTO BRASIL GAS"), então agrupar por POSTO/FORNECEDOR, não por tipo. DADOS: posto vive em `fleet_fuel_records.posto`, fornecedor de manutenção em `fleet_maintenances.fornecedor`, ligados a `financial_entries` via `origem_id`+`origem_modulo`; `fornecedor_nome` chega vazio nesses (por isso 3154 não enxergava). BACKEND (READ-ONLY, `financial.ts`·`getEntries`): 2 `LEFT JOIN` 1:1 por PK (guarda `company_id`) expõem `frotaFornecedor = COALESCE(NULLIF(BTRIM(fornecedor_nome),''), ffr.posto, fm.fornecedor)`; COUNT/`getEntriesTotais` intactos. FRONTEND (`FinanceiroLancamentos.tsx`): `frotaTipoKey` isola o tipo (ícone+fallback); `frotaGrupoOf` agrupa por `frotaFornecedor` com chave `${tipoKey}::${forn}` (não mistura posto×oficina de mesmo nome) e label = nome do posto/fornecedor; sem fornecedor cai em "Combustível (sem posto)"/"Manutenção (sem fornecedor)"; ícone da linha/diálogo via `tipoKey`. Toda a mecânica da 3154 (checkbox em lote, diálogo de membros, toggle, contador real, grupo de 1 = linha normal) preservada. ZERO BACKEND DE ESCRITA/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3154** — **FINANCEIRO / LANÇAMENTOS · OS LANÇAMENTOS VINDOS DO MÓDULO FROTA (COMBUSTÍVEL, MANUTENÇÃO, PEDÁGIO/SEM PARAR) PASSARAM A SER AGRUPADOS NUMA ÚNICA LINHA POR TIPO — A TELA FICOU LIMPA; CLICAR NA LINHA ABRE UM DIÁLOGO COM TODOS OS LANÇAMENTOS DAQUELE GRUPO.** PEDIDO (IMG_2093, iPad): a lista vinha poluída por dezenas de linhas de combustível (uma por veículo/abastecimento) — agrupar tudo que vem de Frotas por TIPO, com detalhe sob demanda. OBSERVAÇÃO DE DADOS: os lançamentos de frota NÃO trazem posto/fornecedor (`fornecedor_nome` vazio; `descricao`=o VEÍCULO), então agrupar por "posto" é impossível com os dados atuais → agrupa por TIPO. Hoje o banco tem `frota_abastecimento`/`frota_manutencao`; Pedágio/Sem Parar ainda não existe mas já é detectado (origem futura `frota_pedagio` OU texto "pedágio"/"sem parar"). COMPORTAMENTO (FRONTEND-ONLY, `FinanceiroLancamentos.tsx`): `frotaGrupoOf`/`isFrotaLanc` + `displayRows` colapsa frota numa LINHA-GRUPO (ícone+label+contagem+total) na 1ª ocorrência (grupo de 1 item vira linha normal); checkbox do grupo seleciona/desseleciona todos os não-cancelados (indeterminado quando parcial), preservando as ações em lote; clicar abre diálogo `frotaGrupoKey` com cada membro (checkbox, Pagar, olho→`setViewId`); toggle "Frota agrupada/expandida" (default agrupada) no cabeçalho só aparece com frota no recorte; contador de lançamentos segue mostrando o número REAL. ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3153** — **FINANCEIRO / LANÇAMENTOS · CORRIGIDO O ERRO "The string did not match the expected pattern" AO CANCELAR BAIXA EM LOTE NO iPad — A AÇÃO VOLTOU A FUNCIONAR E A LISTA ATUALIZA SOZINHA MESMO QUANDO O iOS DERRUBA A REQUEST.** DOMException CRUA do iOS Safari quando a request da mutation em lote é derrubada no transporte; como as 3 ações (baixa/estorno/exclusão) são IDEMPOTENTES, a operação muitas vezes JÁ foi aplicada. CORREÇÃO (FRONTEND-ONLY, `FinanceiroLancamentos.tsx`): `isTransportErr` + `retry: bulkRetry` + `onError` resiliente (fecha diálogo, limpa seleção, `refetch()`+`invalidarContas()`, aviso brando). ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3152** — **FINANCEIRO / LANÇAMENTOS · OS LANÇAMENTOS CANCELADOS PASSARAM A FICAR OCULTOS POR PADRÃO NA LISTA — UM BOTÃO "Mostrar cancelados (N)" NO CABEÇALHO REVELA/OCULTA SOB DEMANDA; O RASTRO NUNCA É APAGADO, SÓ ESCONDIDO.** Lista some `status==="cancelado"` por padrão; botão "Mostrar/Ocultar cancelados (N)" quando há ≥1 cancelado no recorte; escolher explicitamente o status "Cancelado" no filtro sempre os mostra. Agregados de topo já ignoram cancelado no servidor → esconder é puramente visual, totais batem. FRONTEND-ONLY (`FinanceiroLancamentos.tsx`). ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3151** — **FINANCEIRO / CUSTO TOTAL (Análise de Custos · Detalhe) · OS 5 CARDS DE KPI ("Custo do recorte", "Pago", "Em aberto", "Vencido", "Lançamentos") VIRARAM FILTRO CLICÁVEL — TOCAR NUM CARD RESTRINGE OS GRÁFICOS E A TABELA ÀQUELE STATUS.** Cards seguem mostrando o RESUMO COMPLETO; clicar em Pago/Em aberto/Vencido aplica filtro de status com toggle; "Custo do recorte"/"Lançamentos" limpam. O filtro só restringe "Distribuição por Mês", "Por Fornecedor" e a tabela "Lançamentos detalhados", preservando os KPIs de topo. FRONTEND-ONLY (`FinanceiroAnaliseCustosDetalhe.tsx`: `cardFiltro` + `rowsView`; cards `role=button`+teclado). ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3150** — **FINANCEIRO / LANÇAMENTOS · OS LANÇAMENTOS IMPORTADOS DA PLANILHA (ORIGEM `importacao_excel`) PASSARAM A SER EDITÁVEIS PELO LÁPIS — ANTES O ERP BLOQUEAVA COM "Edição bloqueada — edite na origem".** Bloqueio era SÓ no front (`FinanceiroLancamentos.tsx`); o backend `financial.updateEntry` já edita qualquer origem desde a Rev. 2661 (só barra pago/recebido/cancelado). Os dois gates (`openEditEntry` + botão "Editar" do diálogo) passaram a aceitar também `origemModulo === "importacao_excel"`. O save não toca `conta_bancaria_id`/`juros`/`descontos`/carimbo de rastreio → vínculo bancário e rastreabilidade do lote sobrevivem. FRONTEND-ONLY; ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3149** — **FINANCEIRO / LANÇAMENTOS · IMPORTADA A PLANILHA-MESTRE DE PAGAMENTOS (003_DADOS_TRATADOS) PARA A FC=60002 — 8.080 LANÇAMENTOS / R$ 12.431.027,02 (AGO/2024 → ABR/2026), TODOS "A PAGAR".** De-para token-aware (thr 0.62) criando só o genuinamente novo (3 obras / 2 categorias / 3 contas), dedup data+valor (0 colisões), filtro anti-linha-`TOTAL` (sem ele o total dobrava), importador psycopg2 fora do app espelhando `createEntry`, origem_modulo='importacao_excel'+origem_descricao rastreável/reversível. ZERO ALTER/DROP/SCHEMA; DELETE só do próprio lote. Detalhe: `shared/changelog.ts`.

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
