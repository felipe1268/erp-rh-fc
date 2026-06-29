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

- **Rev. 3860** — **EXTRATO BANCÁRIO XLSX · COLUNA "Nº NOTA FISCAL" CENTRALIZADA.** `textCols.forEach` em `downloadContabilidadeXlsx.ts`: `col === "E" ? "center" : "left"` — somente a coluna E (nfNumero) centralizada; C, D, F continuam à esquerda. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3859** — **TEMPLATE XLSX · BORDA SUPERIOR DO LOGO + LOGO CENTRALIZADO.** `ws.mergeCells("B2:C7")` → contorno completo incluindo topo; offset horizontal dinâmico via `nativeColOff` em EMU centraliza logo 185×78. ZERO DELETE. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3858** — **CONTAS A RECEBER · CARDS KPI CLICÁVEIS FILTRAM A LISTA.** `KCard` ganha `onClick/active/activeRing`; `cardAtivo` + `ativarCard`; 4 cards filtram status+período; chip ✕; Select ganha "Em aberto"/"Vencidos". ZERO DELETE.

- **Rev. 3857** — **NF-e × EXTRATO · JANELA DO EXTRATO REDUZIDA (±45 dias) + BADGE DE PERÍODO NO DIALOG.** `obterSugestoesPeriodo` +90→+45 dias; badge "Jan/2026 · Emitidas" no dialog header. ZERO DELETE.

- **Rev. 3856** — **TEMPLATE XLSX · FIX SAVE + DATA AUTOMÁTICA + VISUALIZADOR INLINE.** Botão salvar sempre habilitado; `vigentDesde` automático = data do save; visualizador inline em tempo real. ZERO DELETE.

- **Rev. 3855** — **CONCILIAÇÃO BANCÁRIA · TOLERÂNCIA PERCENTUAL NAS SUGESTÕES (≤15% RECEITA / ≤5% DESPESA).** `sugerirConciliacao`: 2ª passagem fuzzy; receita ≤15%, despesa ≤5%; badge "Δ valor: X%". ZERO DELETE.

- **Rev. 3854** — **NF-e × EXTRATO · SCORING RIGOROSO + BOTÕES INDEPENDENTES + BARRA DE STATUS + SEM-MATCH.** `processarRecebidas` pré-filtro ≤5%; barra % vinculadas; sem-match collapsible. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3853 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
