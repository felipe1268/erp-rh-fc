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

- **Rev. 3813** — **FINANCEIRO · DRE · REMOVE BLOCO MEMO INVESTIMENTOS/CAPEX DO RODAPÉ: bloco informativo "Investimentos / CAPEX — Não entra no resultado" removido de `FinanceiroDRE.tsx`; import `Landmark` removido. Backend continua retornando `investimentoCapex` (sem breaking change). ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3812** — **FINANCEIRO · DRE · RECLASSIFICAÇÃO CAPEX: TERRENO TIZIANA + VERSÁTIL. (1) CONTA 420 "Compra de Terreno": `classificacao_dre=null→'investimento'`. (2) 12 ENTRIES VERSÁTIL MIGRADOS PARA CONTA 420: boletos "VERSATIL/VERSATIL ENGENHARIA" estavam em PRÓ-LABORE (conta 29); 1 em Cartório (290); 1 sem conta. R$209.801,63 saem das Despesas Variáveis. PRÓ-LABORE de sócios NÃO tocado. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3811** — **FINANCEIRO · DRE · INVESTIMENTOS/CAPEX + EXEMPLOS EDUCATIVOS POR LINHA: SEÇÃO MEMO CAPEX + `calcularDRE` retorna `investimentoCapex`; `dreLinhaPredicate` exclui `'investimento'`; popover ℹ️ com exemplos "✓ Entra / ✗ Não entra" em todas as linhas. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3810** — **FINANCEIRO · DRE · ROTEAMENTO AUTOMÁTICO CDO vs. FOLHA — `importFolhaRHToFinancial`: REGRA: direto→conta 22 (CDO, variavel), indireta_obra→conta 21 (CDO, variavel), escritorio/NULL→conta 506 (fixo). PATH 1: folha_itens + JOIN job_functions + LATERAL; PATH 2: payroll table. CONSTANTE FOLHA_CATEGORIA_CONFIG + helper _folhaCatConfig. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3809** — **FINANCEIRO · DRE · ROTEAMENTO CDO vs. FOLHA — PILOTO JAN/2026: 33 PIX MIGRADOS DE FOLHA (506) PARA CDO (21+22, R$54.651); OBRA_ID EM 14 ENTRIES; 2 ENTRIES SEM MATCH (R$2.503) PERMANECEM EM 506. ZERO SCHEMA/ALTER/DROP.** Detalhe: `shared/changelog.ts`.

- **Rev. 3808** — **FINANCEIRO · DRE · RECLASSIFICAÇÃO CONCEITUAL CDO (CPC 17 + CPC 33): ALIMENTAÇÃO → VALE ALIMENTAÇÃO (id=265); PENSÃO → FOLHA (506); UNIFORME custo_obra→despesa_variavel (R$26.346 SAEM DO CDO); 12 DESYNC CORRIGIDOS; 4 CONTAS DESATIVADAS. CDO CAI ~R$131.000. ZERO SCHEMA/ALTER/DROP.** Detalhe: `shared/changelog.ts`.

- **Rev. 3807** — **FINANCEIRO · PLANO DE CONTAS · REESTRUTURAÇÃO DESPESAS FINANCEIRAS PARTE 2: 20 ENTRIES 37→389; CONTA 389 "TÍTULOS DE CAPITALIZAÇÃO"; CONTA 509 "CONSÓRCIO VEICULAR"; CONTA 421 DESATIVADA; ORPHANS 81+87 CORRIGIDOS. ZERO SCHEMA/ALTER/DROP.** Detalhe: `shared/changelog.ts`.

- **Rev. 3806** — **FINANCEIRO · LIMPEZA GLOBAL DE ZEROS ABSOLUTOS: 8.759 entries varridos; 24 ABSOLUTAMENTE VAZIOS DELETADOS; 8.735 ORÇAMENTOS LEGÍTIMOS PRESERVADOS. ZERO SCHEMA/ALTER/DROP.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3805 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
