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

- **Rev. 3339** — **RH / DASHBOARD "CUSTO DE DEMISSÃO EM MASSA" (CDM) · CORREÇÃO: O "CUSTO TOTAL" DOS MEMBROS DA CIPA AGORA INCLUI A INDENIZAÇÃO DO PERÍODO DE ESTABILIDADE (SÚMULA 396 TST) + EMPREGADOS JÁ EM "AVISO" SÃO EXCLUÍDOS DA SIMULAÇÃO. 1 BACKEND (READ-ONLY) + 1 FRONT · BUGFIX/ADITIVO · ZERO SCHEMA/ALTER/DROP/DELETE.** Pedido (usuário, no iPad, com print do CDM): "para os membros da CIPA não está calculando a indenização por estabilidade no custo; a tag aparece mas o Custo Total ignora esse passivo". BUG1: a tag "CIPA" (Rev. 1936) era só VISUAL; como o CDM simula SEMPRE dispensa pelo empregador (`empregador_*`), demitir um cipeiro com estabilidade vigente gera custo ADICIONAL = remuneração do período restante (salários + 13º + férias+1/3 + FGTS 8% — `calcularIndenizacaoEstabilidade`), que não entrava no `total`. BUG2: o `activeWhere` não excluía quem já está em `employees.status='Aviso'`. CORREÇÃO BACKEND (`server/routers/dashboards.ts`, `getDashCustoDemissaoMassa`): import do helper; `activeWhere` += `status <> 'Aviso'`; no `.map` lê `cipaByEmp.get(r.id)` e, havendo `fimEstabilidade` futuro, computa a indenização → expõe `indenizacaoEstabilidade`+`cipaDiasEstabilidade` e soma ao `total` (propaga p/ TOTAL GERAL, KPI, sort, combo). READ-ONLY. CORREÇÃO FRONT (`client/src/pages/dashboards/DashAvisoPrevio.tsx`): sub-linha âmbar "+estab" na célula Custo Total, tooltip do badge CIPA enriquecido, e card âmbar "INDENIZAÇÃO DE ESTABILIDADE" no `DetalheCalculoModal` (que recalcula via `calcular`, sem estabilidade). RESSALVA: não testável autenticado no ambiente; re-publicar. Detalhe: `shared/changelog.ts`.

- **Rev. 3338** — **FINANCEIRO / DASHBOARD DE CONCILIAÇÃO BANCÁRIA · NOVA COLUNA "SALDO (R$)" NA TABELA "CONCILIAÇÃO POR CONTA BANCÁRIA" (DETAIL DIALOG), = ENTRADAS − SAÍDAS POR CONTA, COLORIDA (VERDE=POSITIVO, VERMELHO=NEGATIVO) + LINHA DE TOTAL NO RODAPÉ CONSOLIDANDO O SALDO GERAL — PRA VER DE RELANCE SE O PERÍODO FECHOU POSITIVO OU NEGATIVO. 100% FRONT · ADITIVO · READ-ONLY · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Pedido (usuário, no iPad, com print da tabela por conta): "quero ver o saldo tbm, entrada − saída, pra ver se o mês fechou positivo ou negativo". RAIZ: a tabela por conta JÁ mostrava Entradas e Saídas separadas, mas NÃO o saldo (entrou − saiu); o `saldoLiquido` só existia como KPI agregado do período, não por conta nem na tabela. CORREÇÃO (`client/src/pages/financeiro/dashboards/DashConciliacao.tsx`): (1) nova coluna `saldo` em `COLS` logo após "Saídas (R$)", com `format` custom que renderiza `formatBRL` colorido (`text-emerald-600` positivo / `text-red-600` negativo / `text-slate-500` zero, `font-semibold tabular-nums`); (2) cada linha de `detalheContas` ganhou `saldo: valorEntradas − valorSaidas`; (3) `<DetailDialog totalKey="saldo">` → rodapé sticky soma o saldo de TODAS as contas (saldo geral do período/ano). Sem query/rota/permissão nova — reusa `getConciliacaoReport`. RESSALVA: não testável autenticado no ambiente; re-publicar p/ o usuário ver. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3337** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · NO MODO "MÊS", CLICAR EM "ANO TODO" AGORA ABRE O "PANORAMA GERAL" CONSOLIDADO DO ANO INTEIRO (TODAS AS CONTAS), REAPROVEITANDO A MESMA VISÃO/LÓGICA DO PANORAMA MENSAL — ANTES "ANO TODO" SÓ MOSTRAVA O EMPTY-STATE ("SELECIONE UM MÊS…"). 100% FRONT · BUGFIX/UX · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** RAIZ: o gate `periodoDefinido` (Rev. 3328) era `modoData==="mes" ? mesSel != null : ...`; em "Ano todo" `mesSel` fica `null` → empty-state, mas o memo `dataInicio`/`dataFim` JÁ tratava `mesSel==null` como o ano inteiro e o backend `getConciliacaoReportGeral` JÁ aceita range arbitrário. CORREÇÃO (`client/src/pages/financeiro/FinanceiroConciliacao.tsx`): `periodoDefinido` no modo "mes" passou a ser sempre `true`; "Ano todo" ativa `geralAtivo` e renderiza o MESMO Panorama Geral consolidando JAN–DEZ. Recursos estritamente mensais seguem gated em `mesSel != null`. Detalhe: `shared/changelog.ts`.

- **Rev. 3336** — **FINANCEIRO / CONTROLE DE CARTÃO DE CRÉDITO · CORREÇÃO: NO DIÁLOGO "VINCULAR FATURA AO CARTÃO", O SELETOR "CARTÃO" NÃO PERMITIA ESCOLHER O CARTÃO NO TABLET/iPad — A LISTA SUSPENSA ABRIA RECORTADA (ÚLTIMAS OPÇÕES CORTADAS, SEM ROLAGEM USÁVEL NO TOQUE). 100% FRONT · BUGFIX/UX · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `client/src/pages/financeiro/FinanceiroCartaoCredito.tsx`: `<SelectContent>` do cartão passou a `position="popper" side="bottom" align="start" sideOffset={4} className="max-h-[50vh] overflow-y-auto z-[60]"` (ancora abaixo do gatilho, altura limitada + rolagem própria touch-friendly, z acima do diálogo) + `<SelectTrigger>` ganhou `h-11`. Mesmo padrão `popper` já usado em outros selects. Detalhe: `shared/changelog.ts`.

- **Rev. 3335** — **FINANCEIRO / CONTROLE DE CHEQUES · DIÁLOGO "LANÇAR CHEQUE MANUALMENTE" REDESENHADO (LAYOUT MODERNO, CABEÇALHO NAVY FC) + AUTOMAÇÃO: "FAVORECIDO" CONSULTA O CADASTRO DE FORNECEDORES (BUSCA NOME/CNPJ, FALLBACK "DIGITAR MANUALMENTE") E UM SELETOR "CONTA DE ONDE O CHEQUE FOI EMITIDO" PREENCHE BANCO/AGÊNCIA/CONTA AO CLICAR. 100% FRONT · UX/ADITIVO · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Backend `criarManual` JÁ aceitava `fornecedorId`/`contaBancariaId` (guard anti-IDOR) — só faltava a UI. `client/src/pages/financeiro/FinanceiroCheques.tsx`: Favorecido virou `<SearchableSelect>` (queries READ-ONLY `compras.listarFornecedores`/`financial.getBankAccounts`); seletor de conta emitente autopreenche e fixa `contaBancariaId`; visual no molde estável + cabeçalho navy. Detalhe: `shared/changelog.ts`.

- **Rev. 3334** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · CORREÇÃO: NO "PANORAMA GERAL DO MÊS", CLICAR NOS CARDS/OLHO (DRILL-IN DA Rev. 3327) NÃO ABRIA O DIÁLOGO EM ALGUNS DISPOSITIVOS (Safari/iPad/touch). 100% FRONT · BUGFIX/UX · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** RAIZ: o `DialogContent` do drill usava `w-screen h-[100dvh]` + `resizable` PADRÃO (true) — injeta `width` inline + handles + `dvh` frágil no Safari → combo instável no toque. CORREÇÃO (`client/src/pages/financeiro/FinanceiroConciliacao.tsx`): `resizable={false} className="max-w-2xl w-[calc(100vw-1rem)] sm:w-auto max-h-[88vh] flex flex-col p-0 gap-0"` (mesmo molde do `detalheEntryId` funcional). Sem mudança de lógica. Detalhe: `shared/changelog.ts`.

- **Rev. 3333** — **FINANCEIRO / DASHBOARD · CONTROLE DE CHEQUES · NOVA SEÇÃO "ANÁLISE GERENCIAL" NO DASHBOARD DE CHEQUES (`/financeiro/dashboards/cheques`), REPLICANDO O FORMATO DETALHADO/SEGREGADO DA ABA "GERENCIAL" DO CARTÃO (Rev. 3332): KPIs ANALÍTICOS (TICKET MÉDIO, PRAZO MÉDIO DE COMPENSAÇÃO, TAXA DE DEVOLUÇÃO, % CONCILIADO) + EVOLUÇÃO MENSAL POR STATUS (BARRAS EMPILHADAS), POR BANCO EMISSOR, POR OBRA, PERFIL DE PARCELAMENTO (À VISTA × Nx), DISTRIBUIÇÃO POR FAIXA DE VALOR, PRAZO DE COMPENSAÇÃO (BUCKETS DE DIAS) E FORNECEDORES RECORRENTES (VEZES · MESES · VALOR). 100% FRONT · ADITIVO · READ-ONLY · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Pedido (usuário): "mesmo formato detalhado/segregado do dash do cartão de crédito, com indicadores importantes p/ análise refinada". Segue o padrão dos dashboards `_kit`-based: agregação 100% CLIENT-SIDE a partir de `cheques.listar({companyId, ano, limit:2000})`. `client/src/pages/financeiro/dashboards/DashCheques.tsx`: seção "Análise gerencial" (ícone `BarChart3`) + memos (`stats`, `evolStatus`, `porBanco`, `porObra`, `perfilParcelas`, `porFaixa`, `prazoBuckets`, `recorrentes`); gráficos recharts do `_kit`; cortes clicáveis abrem `DetailDialog`. Detalhe: `shared/changelog.ts`.

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
