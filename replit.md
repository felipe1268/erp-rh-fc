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

- **Rev. 3965** — **EFETIVO OBRA: FOTO DO FUNCIONÁRIO NA TABELA "EQUIPE — {OBRA}".** `EmpAvatar` inline (foto circular ou iniciais) adicionado na coluna Nome da tabela agrupada por função em DashEfetivoObra. Backend já retornava `fotoUrl` — só frontend alterado. ZERO DELETE.

- **Rev. 3964** — **FOLHA DE PAGAMENTO: FIX `mes.split is not a function` (REGRESSÃO Rev. 3962).** `mes.split("-")[0]` no título da TabelaComparativaAnual → `ano`. ZERO DELETE.

### 5 one-liners

- **Rev. 3963** — **CARTÃO DE PONTO: FOTO DO FUNCIONÁRIO NOS RANKINGS DE FALTAS E ATRASOS.** `fotoUrl` adicionado ao select de allEmps; `EmpAvatar` (foto/iniciais) inserido entre badge numérico e nome nos dois Top 10. ZERO DELETE.

- **Rev. 3962** — **WHITE-CARD PERIOD SELECTOR: PADRÃO ERP EM TODOS OS DASHBOARDS RH.** `PeriodSelectorCard.tsx` (12 pills + nav ano) substituiu MonthSelector/seletores em 8 dashboards RH; estado YYYY-MM → ano+mes+mesStr nos 3 com query mensal. ZERO DELETE.

- **Rev. 3961** — **AVISO PRÉVIO / RESCISÃO: FILTRO CLT — PJ E SÓCIOS BLOQUEADOS.** Frontend: `activeEmployees` memo exclui `tipoContrato === "PJ"/"Socio"/"Sócio"`. Backend: guard `TRPCError BAD_REQUEST` em `avisoPrevio.create`. ZERO DELETE.

- **Rev. 3960** — **DRE IA: FIX DEFINITIVO JSON TRUNCADO.** `callOpus(sys, prompt, 4000)` explícito → sem arg (usa default 8000); `repairTruncatedJson` fecha stack aberta. ZERO DELETE.

- **Rev. 3959** — **NF-e: PAUSAR/RETOMAR SYNC + PRORROGAR (+2h/+4h/+8h/+24h).** `toggleSync` + `prorrogarSync` backend; footer unificado no card countdown. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3917 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
