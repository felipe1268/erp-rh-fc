# ERP Gestão Integrada — FC Engenharia

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

- **Rev. 4208** — **SCORECARD RH/FOLHA: FIX SEGURO DE VIDA (R$0→real) + VR/VA DOUBLE-COUNT + PONTO FALLBACK.** (1) Seguro: `employees.seguroVida` era texto "sim/não" → zero; fix usa `svc.premio_vg + svc.premio_apc` direto. (2) VR/VA: `valorTotal` já inclui tudo; `valorVa` separado = double-count; fix = coluna única `va_total`. (3) Ponto: `dias_na_obra` agora é `GREATEST(alocação, COUNT ponto)`; `relevant_emp` inclui UNION de `time_records`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4207** — **SCORECARD RH/FOLHA: FIX DIAS_NA_OBRA (150→30) + FOTO DO COLABORADOR.** Bug: `site_periods` CTE listava TODAS as linhas de `employee_site_history` sem agrupar por funcionário. ACACIO tinha 8 linhas → SUM somava 8× o overlap de Abril → 150 dias impossível. Fix: GROUP BY `"employeeId"` com `MIN("dataInicio")` + `CASE WHEN BOOL_OR("dataFim" IS NULL) THEN CURRENT_DATE ELSE MAX("dataFim")`. Foto: backend retorna `e."fotoUrl"` na CTE custos; frontend exibe avatar 28px (foto real ou iniciais com bg-indigo). ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4206** — **SCORECARD RH/FOLHA: FIX CAST VARCHAR→NUMERIC COM PADRÃO SEGURO.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4205** — **SCORECARD RH/FOLHA: FIX camelCase em payroll_payments + employee_site_history + vr_benefits + vacation_periods.** 289 linhas existiam mas ficavam invisíveis. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4204** — **SCORECARD RH/FOLHA: FIX employees camelCase + REDESIGN ABA + FÉRIAS + SEGURO DE VIDA.** Bug raiz: snake_case em `employees`; Fix camelCase + 3 queries paralelas + UI com seletor ano/mês. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4203** — **SCORECARD METAS & DESVIOS: FIX orcamento_itens camelCase + CONTRATOS DE TERCEIROS.** CTE `orca_itens` usava snake_case → lista vazia silenciosa. Fix + nova query `terceiro_contratos`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4201** — **SCORECARD: FIX RAIZ — BUSCA POR obraId SEM FILTRO companyId.** ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4143 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
