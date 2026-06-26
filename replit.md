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

- **Rev. 3731** — **XLSX EXTRATO BANCÁRIO · LAYOUT PRONUS EXATO — FORMATO ZERO "R$ 0,00" + LAYOUT COMPACTO (EMPRESA L1, BANCO L3-4, CABEÇALHO L5, DADOS L6+). BACKEND PONTUAL · ZERO SCHEMA/ALTER/DROP/DELETE.** BRL sem seção zero (zero = "R$ 0,00"); layout compacto: A1:H1 título, A3:F4 banco, L5 cabeçalho, L6+ dados. Arquivo: `downloadContabilidadeXlsx.ts`. Detalhe: `shared/changelog.ts`.

- **Rev. 3730** — **PACOTE CONTADOR · XLSX EXTRATO BANCÁRIO — BUGFIX LINHAS VAZIAS: buildExtratoBancarioBuffer EXPORTADA DE downloadContabilidadeXlsx.ts (query EXTRACT/MONTH/YEAR, layout Pronus). BACKEND PONTUAL · ZERO SCHEMA/ALTER/DROP/DELETE.** Causa: query de range `bsl.data >= $3` não retornava linhas; fix: usa `EXTRACT(MONTH/YEAR)` como o download avulso (que funciona). Solução estrutural: função exportada, zero duplicação. Arquivos: `downloadContabilidadeXlsx.ts`, `downloadPacoteContador.ts`. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3729** — **PACOTE CONTADOR · XLSX EXTRATO BANCÁRIO — LAYOUT PRONUS (CABEÇALHO ROXO #7030A0, LINHAS LAVANDA/BRANCO, SALDO VERDE/VERMELHO). BACKEND PONTUAL · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3728** — **PACOTE CONTADOR · BUGFIX "Erro interno ao gerar pacote" — JOINs INVÁLIDOS EM financial_entries NO downloadPacoteContador.ts. BACKEND PONTUAL · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3727** — **FINANCEIRO · PADRONIZAÇÃO DE CORES — ENTRADA=VERDE, SAÍDA=VERMELHO EM TODOS OS GRÁFICOS. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3726** — **PLANILHA CONTADOR · BUGFIX "column does not exist" — JOIN EM COLUNA INEXISTENTE EM financial_entries. BACKEND PONTUAL · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3725** — **CONTABILIDADE · 3 BUGFIXES: BADGE NF-e RECEBIDAS ZERO + IMPORT NFS-e SPED CHAVE 50 DÍGITOS + TOAST ERRO DETALHADO. PONTUAL · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3724** — **NF-e RECEBIDAS · VISUALIZADOR DANFE EMBUTIDO — BOTÃO "VER DANFE" NO DIALOG. BACKEND ADITIVO + FRONTEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3723** — **CONTABILIDADE · TABELA EXTRATO — COLUNA "VALOR" → ENTRADA | SAÍDA | SALDO ACUMULADO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3717 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
