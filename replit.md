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

- **Rev. 3817** — **FINANCEIRO · PLANO DE CONTAS · REESTRUTURAÇÃO SUBEMPREITEIROS/PJ: conta 23 → "SUBEMPREITEIROS / EMPRESAS"; conta 491 → "PRESTADORES PJ INDIVIDUAIS"; conta 507 "MEDIÇÃO PJ" desativada; conta 57 "Subempreiteiros" desativada; conta_nome atualizado em 1.186 entries históricas. ZERO SCHEMA/ALTER/DROP/DELETE de lançamentos.** Detalhe: `shared/changelog.ts`.

- **Rev. 3816** — **FINANCEIRO · DRE · LEGENDA "DRE GERENCIAL DE CAIXA" NO RODAPÉ: card fixo com comparativo DRE Gerencial (caixa, só realizados) × DRE Societário (competência, exigido por lei); explica status excluídos e redireciona projeções ao Fluxo de Caixa. ARQUIVO: `FinanceiroDRE.tsx`. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3815** — **FINANCEIRO · DRE · REVERTE 3814 + EXCLUI `a_pagar`/`a_receber` DO DRE: só realizados no DRE; WHERE exclui `a_pagar`/`a_receber` em ambas as CTEs; valor = `COALESCE(valor_realizado, 0)`. ARQUIVO: `financialKpiService.ts`. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3814** — **[REVERTIDO por 3815] FINANCEIRO · DRE · COALESCE(realizado, previsto, 0) — conceito incorreto.** Detalhe: `shared/changelog.ts`.

- **Rev. 3813** — **FINANCEIRO · DRE · REMOVE BLOCO MEMO INVESTIMENTOS/CAPEX DO RODAPÉ: bloco removido de `FinanceiroDRE.tsx`; import `Landmark` removido. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3812** — **FINANCEIRO · DRE · RECLASSIFICAÇÃO CAPEX: CONTA 420 `classificacao_dre→'investimento'`; 12 ENTRIES VERSÁTIL (PRÓ-LABORE+CARTÓRIO+SEM CONTA) → CONTA 420; R$209.801,63 saem das Despesas Variáveis. PRÓ-LABORE SÓCIOS NÃO TOCADO. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3811** — **FINANCEIRO · DRE · INVESTIMENTOS/CAPEX + EXEMPLOS EDUCATIVOS POR LINHA: SEÇÃO MEMO CAPEX + `calcularDRE` retorna `investimentoCapex`; `dreLinhaPredicate` exclui `'investimento'`; popover ℹ️ com exemplos "✓ Entra / ✗ Não entra" em todas as linhas. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3810 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
