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

- **Rev. 3766** — **FINANCEIRO · DASHBOARD · CONCILIAÇÃO BANCÁRIA · DRILL-DOWN POR ITEM ESPECÍFICO: CLICAR EM UMA FATIA/BARRA DE CATEGORIA (DESPESAS OU RECEITAS) OU EM UM ITEM DO RANKING ABRE OS LANÇAMENTOS INDIVIDUAIS DAQUELA CATEGORIA; CLICAR EM UMA BARRA DE OBRA OU ITEM DO RANKING DE OBRAS ABRE OS LANÇAMENTOS DA OBRA. 2 NOVOS ENDPOINTS BACKEND (READ-ONLY) + FRONTEND. ZERO SCHEMA/ALTER/DROP/DELETE.** Pedido: clicar em "MEDIÇÃO DE OBRA" deve mostrar SÓ os lançamentos daquela categoria. Backend (`server/routers/financial.ts`): `getConciliacaoEntradasPorCategoria(companyId,ano,mes?,contaNome,tipo)` filtra `financial_entries` por `TRIM(LOWER(conta_nome))=$2` + período + tipo (LEFT JOIN `financial_accounts`); `getConciliacaoEntradasPorObra(companyId,ano,mes?,obraNome)` filtra por `obra_nome`; ambos retornam até 500 entries (data, descricao, valor, contaNome, fornecedorNome, obraNome, status). Frontend: estados `categDrill`/`obraDrill`; queries lazy; `ENTRY_COLS` (Data, Desc, Valor colorido, Categoria, Fornecedor, Obra, Status); Pie despesas/BarChart receitas/TopListCards categorias → `setCategDrill({nome,tipo})`; BarChart obras/TopListCard obras → `setObraDrill({nome})`; 2 novos `<DetailDialog>`. Botão "Abrir ↗" mantém lista agregada. Detalhe: `shared/changelog.ts`.

- **Rev. 3765** — **FINANCEIRO · DASHBOARD · CONCILIAÇÃO BANCÁRIA · TODOS OS GRÁFICOS DA TELA GANHARAM DRILL-DOWN (CLIQUE): BARRAS DE MÊS NAVEGAM O SELETOR DE PERÍODO; BARRAS DE CONTA BANCÁRIA ABREM DIALOG COM OS LANÇAMENTOS FILTRADOS DA CONTA; BARRAS/RANKING DE FORNECEDOR ABREM DIALOG COM OS LANÇAMENTOS DO FORNECEDOR (MATCH POR DESCRIÇÃO DO EXTRATO); GRÁFICOS DE CATEGORIA E OBRA ABREM A LISTA AGRUPADA EXISTENTE; ITENS DOS TOPLISTCARDS (FORNECEDORES, CATEGORIAS, OBRAS) TAMBÉM FICARAM CLICÁVEIS. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Pedido do usuário: clicar em qualquer gráfico e ver os lançamentos pertinentes. Frontend (`client/src/pages/financeiro/dashboards/DashConciliacao.tsx`): novo estado `drill` + `drillRows` (useMemo filtra `lancArr` pelo `filterFn` + tipo); `lancamentos` passa a carregar também quando `drill !== null`; handlers `onMesClick` (→ `setMes`), `onContaClick(tipo)` (→ `setDrill` filtrando por `contaBancariaId`), `onFornClick` (→ `setDrill` filtrando por `includes(up)` na `descricao`); `TopListCard` ganhou prop `onItemClick`; novo `<DetailDialog>` de drill (usa `LANC_COLS` completo com botão Classificar); subtítulos de todos os gráficos atualizados. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3764** — **FINANCEIRO · DASHBOARD · CONTROLE DE CHEQUES · GANHOU O FILTRO "MÊS A MÊS": SELETOR WHITE-CARD "PERÍODO" (CHIP "TUDO" + JAN…DEZ, DOT VERDE = COM DADOS / CINZA = SEM DADOS), IGUAL AO DA CONCILIAÇÃO BANCÁRIA (Rev. 3755). 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3763** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · CHEQUES DEVOLVIDOS QUE JÁ TIVERAM AS 2 LINHAS (COMPENSAÇÃO + DEVOLUÇÃO) CONCILIADAS VOLTAM A APARECER NO CARD "CHEQUES DEVOLVIDOS NO BANCO" — MARCADOS COMO "CONCILIADO NO EXTRATO" (RESOLVIDO). BACKEND READ-ONLY · NÃO ALTERA O CÁLCULO DO % · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3762** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · O CARD "CHEQUES DEVOLVIDOS NO BANCO" GANHOU O BOTÃO "OCULTAR RESOLVIDOS": ESCONDE DA TELA OS CHEQUES JÁ TRATADOS (QUITADO REAPRESENTADO / QUITADO POR OUTRO MEIO PIX-TED / QUITADO POR SUBSTITUIÇÃO / DESCONSIDERADO DO %), MOSTRANDO SÓ OS PENDENTES. NÃO APAGA NADA, NÃO MUDA O CONTADOR DO CARD NEM O CÁLCULO DO %. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3761** — **FINANCEIRO · DRE — DEMONSTRATIVO DE RESULTADO · CADA LINHA DO DRE FICOU CLICÁVEL (DRILL-DOWN): AO CLICAR ABRE UM DIÁLOGO COM OS VALORES QUE COMPÕEM A LINHA (LINHAS-FOLHA = LANÇAMENTOS REAIS POR CATEGORIA + LISTA; LINHAS-TOTAL = FÓRMULA; MARGENS = DIVISÃO). BACKEND READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3760** — **DASHBOARD · CONCILIAÇÃO BANCÁRIA · OS VALORES EM DINHEIRO QUE O USUÁRIO LÊ (RANKINGS, KPIs "TICKET MÉDIO/MAIOR ENTRADA/MAIOR SAÍDA" E O DETALHE D/R DO RANKING DE OBRAS) PASSAM A APARECER POR EXTENSO COM PONTO DE MILHAR E VÍRGULA DECIMAL (`formatBRL` → "R$ 928.000,00") EM VEZ DE ABREVIADO ("R$ 928 mil"/"R$ 2,4 mi"); E OS GRÁFICOS FICAM RESPONSIVOS. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3759 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
