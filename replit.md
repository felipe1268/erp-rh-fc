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

- **Rev. 3822** — **FINANCEIRO · DESACOPLAMENTO CRONOGRAMA × FINANCEIRO: 5.252 entries cronograma_atividade migradas a_pagar→previsto (−R$16,5M fictícios do Contas a Pagar); cronograma removido de DRE_ORIGEM_OBRA; 'previsto' adicionado à exclusão do DRE; bridge futuro usa status='previsto'; sidebar "Cronograma Financeiro"→"Previsão de Caixa". ZERO DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3821** — **FINANCEIRO · PLANO DE CONTAS · CLASSIFICAÇÃO DRE EM MASSA: 28 contas sem classificacao_dre corrigidas (receita_bruta/custo_obra/despesa_fixa/variavel/financeira/outro); entry [886185] conta 51→281; DRE jan/2026 enxerga R$1,8M receita + R$699k CDO. ZERO DELETE.** Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3820** — **FINANCEIRO · PLANO DE CONTAS · LIMPEZA GRUPO 4 (DESPESAS ADM/ESCRITÓRIO): 12 entries conta 60→258; contas 66 e 378 desativadas. ZERO DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3819** — **FINANCEIRO · PLANO DE CONTAS · LIMPEZA GRUPO 3 (VALE/TRANSPORTE/COMISSÃO): 6 entries 73→381; 3 entries 58→315; contas 58 e 36 desativadas. ZERO DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3818** — **FINANCEIRO · PLANO DE CONTAS · LIMPEZA GRUPO 2 (CLT/FOLHA/ENCARGOS): entry [866121] 52→280; 30 entries 414→270; 11 contas desativadas. ZERO DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3817** — **FINANCEIRO · PLANO DE CONTAS · REESTRUTURAÇÃO SUBEMPREITEIROS/PJ: conta 23 → "SUBEMPREITEIROS / EMPRESAS"; conta 491 → "PRESTADORES PJ INDIVIDUAIS"; contas 507+57 desativadas; 1.186 entries atualizadas. ZERO DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3816** — **FINANCEIRO · DRE · LEGENDA "DRE GERENCIAL DE CAIXA" NO RODAPÉ: card fixo com comparativo DRE Gerencial × DRE Societário; explica status excluídos. ARQUIVO: `FinanceiroDRE.tsx`. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3813 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
