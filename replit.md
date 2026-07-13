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

- **Rev. 4206** — **SCORECARD RH/FOLHA: FIX CAST VÍRGULA — `REPLACE(',','.')::numeric` em todos os casts de colunas varchar.** Bug persistia após Rev.4205 (camelCase correto): a `Promise.all` das 3 queries rejeitava com `ERROR: invalid input syntax for type numeric: "680,75"`. Todas as colunas numéricas são VARCHAR no Neon — `vr_benefits.valorTotal` e outros guardam valores com vírgula BR. Cast `::numeric` direto falha → endpoint lança exceção → `analiseRH.data` fica `undefined` → UI mostra "Sem dados" silenciosamente. Fix: `COALESCE(REPLACE(col, ',', '.')::numeric, 0)` em `payroll_payments` (8 colunas), `vr_benefits` (2 colunas), `vacation_periods.valorTotal`, `employees.seguroVida`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4205** — **SCORECARD RH/FOLHA: FIX RAIZ DEFINITIVO — payroll_payments + employee_site_history + vr_benefits + vacation_periods SÃO camelCase.** Bug persistia após Rev.4204: `getCustosRH` usava snake_case em TODAS as outras tabelas também. Diagnóstico via Neon confirmou 289 linhas de folha existentes para a obra (obraId=90001, companyId=60002, 2026-01→2026-06). Fix: `employee_site_history` (`"obraId"`, `"companyId"`, `"employeeId"`, `"dataInicio"`, `"dataFim"`); `payroll_payments` (`"companyId"`, `"employeeId"`, `"mesReferencia"`, `"salarioBrutoMes"`, etc.); `vr_benefits` + `vacation_periods` idem. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4204** — **SCORECARD RH/FOLHA: FIX employees camelCase + REDESIGN ABA + FÉRIAS + SEGURO DE VIDA.** Bug raiz: snake_case em `employees`; Fix camelCase + 3 queries paralelas + UI com seletor ano/mês. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4203** — **SCORECARD METAS & DESVIOS: FIX orcamento_itens camelCase + CONTRATOS DE TERCEIROS.** CTE `orca_itens` usava snake_case (`orcamento_id`, `meta_unit_total`, `custo_unit_total`) para colunas camelCase → lista vazia silenciosa. Fix + nova query `terceiro_contratos` com medições aprovadas. Frontend: total comprometido = OCs + Contratos. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4201** — **SCORECARD: FIX RAIZ — BUSCA POR obraId SEM FILTRO companyId.** Path 2 simplificado para `"obraId"=O` sem companyId. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4198** — **SCORECARD METAS & DESVIOS: QUERY TRI-CAMINHOS PARA DETECTAR ORÇAMENTO.** Query com OR em 3 caminhos: `id=orcamentoId` | `"obraId"=obraId` | `id IN (SELECT orcamento_id FROM planejamento_projetos WHERE obra_id=obraId)`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4197** — **SCORECARD METAS & DESVIOS: FIX VÍNCULO POR orcamentoId.** `getMetasDesvios` aceita `orcamentoId` opcional, prioriza lookup direto. Frontend passa `proj.orcamentoId`. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4143 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
