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

- **Rev. 3958** — **DRE IA: PÁGINA FULL-SCREEN + FIX JSON TRUNCADO (maxTokens 4000→8000) + PARETO RECHARTS.** Causa-raiz do JSON error: maxTokens=4000 tokens ≠ chars → Opus truncava a resposta no meio do array. Fix: maxTokens=8000 em `callOpus`. Nova página `FinanceiroDREAnalise.tsx` em `/financeiro/dre-analise` (full-screen, seletor white-card, barra 0→100%, pareto recharts horizontal + tabela acumulada, indicadores × benchmarks, plano de ação, fontes). Botão DRE navega via `abrirAnaliseIA()` (wouter). ZERO DELETE.

- **Rev. 3957** — **DRE IA: CLAUDE OPUS 4-5 DIRETO + DIALOG POPUP (FIX 95% TRAVADO).** Causa-raiz: `invokeLLM` usava Sonnet 4-6 com 6k tokens → timeout iOS antes de retornar → barra presa em 95%. Fix: `callOpus()` chama Anthropic SDK direto com `claude-opus-4-5` (maxTokens 4000). Sheet lateral da análise virou Dialog centralizado (`max-w-4xl`), com badge "Claude Opus 4-5" no título. ZERO DELETE.

### 5 one-liners

- **Rev. 3956** — **DFC: PÁGINA DEDICADA `/financeiro/dfc` (ROTA EXCLUSIVA, FULL-SCREEN).** `FinanceiroDFC.tsx`; seletor white-card; 4 KPIs; waterfall/ajustes/bridge/indicadores. ZERO DELETE.

- **Rev. 3955** — **DFC: VISUALIZAÇÃO IN-APP (SHEET) SUBSTITUINDO O PDF.** Sheet 4 seções; fix getDFCData `.rows`. ZERO DELETE.

- **Rev. 3954** — **ANÁLISE IA DO DRE: PARETO DE CUSTOS + PLANO DE AÇÃO.** dreAnaliseIA.ts reescrito; Pareto top 15; prompt "CFO de empreitada"; resposta com `planoAcao[]`+`paretoCustos[]`; UI cards. ZERO DELETE.

- **Rev. 3952** — **DRE: CORREÇÃO DE CLASSIFICAÇÃO + CARD CONTEXTUAL DRE × CAIXA.** Fix: FINANCIAMENTOS → 'investimento'; MÚTUO INTERCOMPANY → 'nao_operacional'; predicado exclui nao_operacional de receitaBruta. Novo getDREBankComparison + card azul/âmbar/verde. ZERO DELETE.

- **Rev. 3949** — **CONCILIAÇÃO: FIX DEDUP SECUNDÁRIO DESCARTA LANÇAMENTOS COM MESMO DOC.** Fase 1+2 receberam `($5::numeric IS NULL OR saldo_apos=$6)`. Saldo distinto = transação distinta. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3917 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
