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

- **Rev. 3760** — **DASHBOARD · CONCILIAÇÃO BANCÁRIA · OS VALORES EM DINHEIRO QUE O USUÁRIO LÊ (RANKINGS, KPIs "TICKET MÉDIO/MAIOR ENTRADA/MAIOR SAÍDA" E O DETALHE D/R DO RANKING DE OBRAS) PASSAM A APARECER POR EXTENSO COM PONTO DE MILHAR E VÍRGULA DECIMAL (`formatBRL` → "R$ 928.000,00") EM VEZ DE ABREVIADO ("R$ 928 mil"/"R$ 2,4 mi"); E OS GRÁFICOS FICAM RESPONSIVOS. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Pedido do usuário (prints da "Conciliação Bancária"): "dinheiro em valor de número separando por ponto e vírgula" + "gráficos responsivos". Fix: em `DashConciliacao.tsx`, o `TopListCard` (usado por TODOS os rankings da tela) e os 3 KPIs trocaram `formatBRLCompact` → `formatBRL` (+ `whitespace-nowrap`); o detalhe "D: … · R: …" do ranking de obras passou a `formatBRL` E AGORA É RENDERIZADO (`item.extra` existia no tipo mas nunca era exibido — apontado no code review). Os `tickFormatter` dos EIXOS PERMANECEM compactos de propósito (guia de escala; `BRLTooltip` já mostra full). Responsividade: o root do `ChartCard` (`_kit.tsx`) ganhou `min-w-0 w-full` p/ encolher no CSS grid sem overflow horizontal (beneficia os 5 dashboards). Escopo restrito: NÃO toquei no `formatBRLCompact` global. `tsc` limpo (filtrado); HTTP 200; code review aprovado. Arquivos: `client/src/pages/financeiro/dashboards/DashConciliacao.tsx`, `client/src/pages/financeiro/dashboards/_kit.tsx`. Detalhe: `shared/changelog.ts`.

- **Rev. 3759** — **FINANCEIRO · FLUXO DE CAIXA · A LINHA "ENTRADAS (RECEITAS)" PASSA A REFLETIR O DINHEIRO REAL DE CONTAS A RECEBER (`financial_entries` tipo='receita'), EXATAMENTE COMO AS DESPESAS REFLETEM CONTAS A PAGAR, P/ O CAIXA FECHAR COM O EXTRATO. ANTES VINHA DA MATRIZ DE PREVISÃO DE FATURAMENTO (~R$ 200 MIL DE FORECAST) EM VEZ DOS ~R$ 2,59 MI EFETIVAMENTE A RECEBER. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Pedido do usuário (Opção 1, recomendada): Despesas vinham do livro real (`getContasAPagarByYear`) e Receitas da matriz (`getContasReceberMatrix`) → descasavam. Fix: a fonte das Receitas trocou p/ `getContasAReceberByYear` (endpoint IRMÃO de `getContasAPagarByYear`: títulos reais a receber por ano de `data_vencimento`, já filtrando projeção via `sqlNotProjecao()` com a TRAVA `FINANCEIRO_SOMENTE_REAL`). O memo de Receitas foi reescrito ESPELHANDO o de Despesas: agrupa por `dataVencimento`, split Efetivo×Projeção pela MESMA `isProjecaoOrigem(origemModulo)`, e "— já recebido em caixa" soma `COALESCE(valorRealizado,valorPrevisto)` de status recebido/pago. KPIs/seletor/Resultado/Saldo Inicial intactos. Validado no Neon (company 60002, 2026): a receber R$ 2.592.652,46 / recebido R$ 2.167.652,46 — vs. ~R$ 200 mil da matriz. `tsc` limpo (filtrado); HTTP 200. Arquivo: `client/src/pages/financeiro/FinanceiroFluxoCaixa.tsx`. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3758** — **DASHBOARD · CONCILIAÇÃO BANCÁRIA · BUGFIX: A CONTA "CAIXA INTERNO - ADM" (LANÇAMENTOS MANUAIS, SEM EXTRATO) APARECIA NO GRÁFICO "POR CONTA BANCÁRIA — CONCILIADO × PENDENTE" COM BARRA VAZIA (R$ 0,00) MESMO TENDO 31 LANÇAMENTOS CONFIRMADOS. CAUSA: A QUERY `resCi` SÓ COMPUTAVA COUNT E HARDCODAVA R$ EM 0; AGORA CALCULA OS VALORES NO SQL ESPELHANDO `getEntradasCaixaInterno`. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3757** — **DASHBOARD · CONCILIAÇÃO BANCÁRIA · BUGFIX CRÍTICO: TODOS OS CARDS DE ANÁLISE ESTAVAM VAZIOS ("NENHUMA RECEITA/DESPESA CATEGORIZADA", "NENHUM FORNECEDOR IDENTIFICADO", "NENHUM LANÇAMENTO COM OBRA IDENTIFICADA") MESMO COM DADOS REAIS (R$ 2,24 MI EM RECEITAS, 12.894 DESPESAS, 123 CATEGORIAS). CAUSA: A QUERY #4 (TOP OBRAS) DO `getConciliacaoDashExtra` USAVA `ORDER BY (despesas+receitas)` COM ALIASES DE SAÍDA DENTRO DE EXPRESSÃO (POSTGRES SÓ ACEITA ALIAS SOZINHO) → `column "despesas" does not exist`; SEM try/catch POR QUERY, O THROW ABORTAVA O ENDPOINT INTEIRO → `extra` UNDEFINED → CARDS VAZIOS. FIX: SUBQUERY `(...) t` + ORDER BY NA QUERY EXTERNA. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3756** — **DASHBOARD · NOTAS FISCAIS (DashNotasFiscais) · NOVO CARD "MOVIMENTOS COM NOTA × SEM NOTA": COMPARATIVO EM R$ — QUANTO DAS ENTRADAS/SAÍDAS BANCÁRIAS TEM NOTA FISCAL IDENTIFICADA (VIA `stmt_line_id`/`fn_id`) VS NÃO IDENTIFICÁVEL; HEADER COM % + 2 BARRAS EMPILHADAS CLICÁVEIS (DETALHE POR SEGMENTO). FEATURE · 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3755** — **DASHBOARD · CONCILIAÇÃO BANCÁRIA · NOVO FILTRO "MÊS A MÊS": SELETOR DE PERÍODO WHITE-CARD (CHIPS "TUDO" + JAN…DEZ, DOT VERDE/CINZA COM/SEM DADOS) QUE ESCOPA TODO O DASHBOARD (KPIs, RANKINGS, CATEGORIAS, OBRAS, STATUS POR CONTA, DIÁLOGOS); "TUDO" = ANO INTEIRO. GRÁFICOS MENSAIS SEGUEM YEAR-WIDE POR DESIGN. FEATURE · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3754** — **AUDIT LOG · CONTINUAÇÃO DO Rev. 3753 NOS DEMAIS CALL-SITES: 11 CHAMADAS `createAuditLog(db, {...})` (2 ARGS) EM `financial.ts` (7) E `heSolicitacoes.ts` (4) PASSAVAM O `db` COMO `data`, DESCARTANDO O PAYLOAD E ENGOLINDO O INSERT NO try/catch → O LOG DE AUDITORIA NUNCA ERA GRAVADO (A FEATURE SEGUIA OK). PADRONIZADAS P/ `createAuditLog({...})` (1 ARG, ASSINATURA REAL EM `server/db.ts`, QUE OBTÉM O `db` INTERNAMENTE). 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3745 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
