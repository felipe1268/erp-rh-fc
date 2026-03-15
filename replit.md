# ERP RH & DP — FC Engenharia

## Project Overview
A full-stack HR/ERP system built for FC Engenharia. It handles employees, payroll, time tracking, training, safety (SST), legal cases, administrative functions, and budget management.

## Active Modules (6)
1. **RH & DP** — Payroll, time tracking, employees, benefits
2. **SST** — Safety (EPIs, ASOs, CIPA, NRs)
3. **Jurídico** — Labor lawsuits, deadlines, risk analysis
4. **Terceiros** — Third-party companies and contractors
5. **Parceiros** — Benefits partners (pharmacy, gas station, etc.)
6. **Orçamento** — Excel import, 3 budget versions (Venda/Custo/Meta), ABC curve, BDI, EAP tree

## Orçamento Module
- Routes: `/orcamento/painel`, `/orcamento/lista`, `/orcamento/importar`, `/orcamento/:id`
- Backend: `server/routers/orcamento.ts`, `server/routers/orcamentista.ts`
- Schema tables: `orcamentos`, `orcamento_itens`, `orcamento_insumos`, `orcamento_bdi`, `insumos_catalogo`, `composicoes_catalogo`
- Excel import: reads ALL sheets from BDI file; "Orçamento" tab (cols 9–32) + optional "Insumos" tab
- 3 versions: Venda (BDI applied), Custo (direct cost), Meta (cost × (1-metaPerc), default 20%)
- Meta % adjustable by admin_master role, recalculates all items
- BDI: stored with `nomeAba` per sheet, displayed grouped by sheet, 2 decimal places
- EAP: shows Mat/MO separately for leaf items, quantity 2 decimal places
- Catalog: auto-populated on each import; intelligent dedup by code + normalized description
- **ORCAMENTISTA PHD**: AI assistant widget (OrcamentistaWidget.tsx) floating in OrcamentoDetalhe
  - 6 quick insights: Resumo Executivo, Reduzir Custo, Maximizar Margem, Análise BDI, Curva ABC, Riscos
  - Full chat interface with orçamento context (totals, Mat/MO, top items, ABC insumos)
  - Uses invokeLLM (Gemini) via existing infrastructure

## Architecture
- **Frontend**: React 19 + Tailwind CSS 4 + shadcn/ui + Wouter (routing)
- **Backend**: Express 4 + tRPC 11 + Drizzle ORM
- **Database**: PostgreSQL (Neon) — all raw SQL uses PG syntax
- **Auth**: Manus OAuth (JWT) or local username/password
- **Build**: Vite 7 (embedded in Express in dev mode), TypeScript 5
- **Package Manager**: pnpm

## Project Structure
```
client/         # React frontend (root: client/, port 5000 via Express)
server/         # Express backend + tRPC routers
  _core/        # Auth, OAuth, Vite setup, env config
  routers/      # tRPC routers per module
  db.ts         # Database helpers (MySQL via Drizzle)
drizzle/        # Schema and migrations
shared/         # Shared types and constants
```

## Running the App
- Dev: `PORT=5000 NODE_ENV=development pnpm dev` — starts Express + Vite on port 5000
- Build: `pnpm build` — builds frontend to dist/public, bundles server to dist/
- Production: `node dist/index.js`

## Environment Variables
- `NEON_DATABASE_URL` — Neon PostgreSQL connection string (takes priority over DATABASE_URL)
- `DATABASE_URL` — Replit internal PostgreSQL fallback (runtime-managed by Replit)
- `JWT_SECRET` — JWT signing secret
- `PORT` — Server port (default 5000 in dev)
- `VITE_APP_TITLE` — App title shown in UI
- `VITE_APP_LOGO` — Logo path
- `OAUTH_SERVER_URL` — Manus OAuth server URL (optional)
- `VITE_APP_ID` — OAuth App ID (optional)
- `OWNER_OPEN_ID` — Owner user OpenID (optional)

## Database
- **Neon PostgreSQL** (production): `ep-young-water-ac67nuby.sa-east-1.aws.neon.tech`, db=`neondb`, project=`ERP INTEGRADO`
- Neon uses pooler URL for app connections, direct URL for migrations
- Priority: `NEON_DATABASE_URL` → `DATABASE_URL` (set in `server/_core/env.ts`)

## Planejamento Module
- Routes: `/planejamento/:id` (tabs: cronograma, curva-s, avanco, refis, compras, ia-gestora, etc.)
- `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` — main file ~7430 lines
- Projects in DB: id=4 (Hotel do Papa), id=6 (Chlorum Palmeira), id=7 (Hotel QIU 2 - 4 Fase), id=8 (active)
- **JULINHO AI**: Google Gemini (gemini-2.5-flash) via GOOGLE_API_KEY, system prompt = persona only, project context in user message
- **Prog. Semanal — Recursos**: `buscarRecursosSemana` endpoint (planejamento.ts:1100) has two-stage matching:
  1. Primary: match by `eapCodigo` (when cronograma and orçamento use the same EAP numbering)
  2. Fallback: match by `atividadeNomes` via ILIKE (when EAP codes differ — e.g. project 8 uses `2.4` vs `01.04`)
  - Returns `matchedByNome: true` flag; frontend shows amber warning badge when fallback used
  - Frontend file: `ProgramacaoSemanal.tsx`, `RecursosDaSemana` component (~line 460)
- **Prog. Semanal — JULINHO errors**: `iaErro` state captures and shows mutation errors (no more silent fail)
- **Curva S**: Shows spinner while loading; server generates curve using equal weights when no peso_financeiro set
- **Avanço Semanal**: Import MS Project (XML/XLSX) → uses `salvarAvancoLote` batch endpoint (NOT 1512 individual requests)
  - `salvarAvancoLote` endpoint: 1 request with all items, processed in chunks of 50 on server
  - `filtroAtivo` states: "semana" (active week), "pendentes" (pending activities), "todas" (all)
- **REFIS tab** — enhanced report:
  - Desvio físico card (+/- pp) alongside SPI
  - "Faturamento do Mês" (renamed from Venda): Previsto, Realizado, Desvio (R$)
  - Curva S Física with trend line (purple dashed)
  - Curva S Financeira (R$) with trend line
  - "Modo Campo" toggle (EyeOff button) — hides all monetary values for field team
  - "Imprimir PDF" button — triggers browser print with `@media print` CSS
  - Histórico REFIS table (BLOCO 7) — shows all previous reports sortable by date
- **IA Gestora tab** — CRONOS AI assistant with 4 sub-tabs

## Integração Mas Controle ERP (Rev. 231)
- **Rota**: `/integracoes/mas-controle` (visível para admin_master)
- **Tabelas DB**: `mas_controle_config` (credenciais + status), `migration_logs` (log detalhado por tipo)
- **Router server**: `server/routers/masControle.ts` → registrado como `masControle:` no appRouter
- **Página**: `client/src/pages/integracoes/MasControle.tsx`
- **Abas**: Configuração (credenciais + teste API) | Importar via API | Importar via CSV | Histórico
- **Importação via API**: Basic Auth → tenta 3 URLs base diferentes do Mas Controle; fallback para CSV
- **Importação via CSV**: Parser robusto (vírgula ou ponto-e-vírgula; campos com aspas); mapeamento flexível de colunas; sempre disponível
- **Idempotente**: nunca duplica dados (verifica por CNPJ para fornecedores, nome para obras e insumos)
- **Logs**: migration_logs registra total encontrado/importado/duplicado/erros por execução

## Módulo de Compras (Rev. 245 — Completo)
- **Rotas**: `/compras/painel`, `/compras/solicitacoes`, `/compras/cotacoes`, `/compras/ordens`, `/compras/fornecedores`, `/compras/almoxarifado`
- **Tabelas DB**: `fornecedores`, `almoxarifado_itens`, `almoxarifado_movimentacoes`, `compras_solicitacoes`, `compras_solicitacoes_itens`, `compras_cotacoes`, `compras_cotacoes_itens`, `compras_ordens`, `compras_ordens_itens`
- **Router server**: `server/routers/compras.ts`
- **Fluxo completo**: SC (Solicitação de Compra) → Cotação → OC (Ordem de Compra) → Almoxarifado
- **obraId obrigatório** em SC, Cotação e OC — propaga automaticamente SC→Cotação e Cotação→OC
- **Integração OC→Almoxarifado** (Rev. 245): ao marcar OC como "entregue", itens entram automaticamente no almoxarifado com movimentação de entrada; SC item recebe quantidadeAtendida; SC marcada "concluída" quando todos os itens atendidos
- **Painel de Compras**: KPIs, alertas de entrega, gastos mensais, SCs e OCs recentes com nome da obra visível
- **Almoxarifado**: Itens com semáforo de estoque; movimentações entrada/saída vinculadas à obra; entradas automáticas via OC entregue
- **Módulo Almoxarifado independente** (Rev. 297): UI mobile-first com 4 botões de ação rápida (ENTRADA/SAÍDA/EMPRESTAR/FECHAR DIA); comodato diário de ferramentas por código JFCxxxx; inventário semanal com barra de progresso e botões BATE/DIFERENTE; páginas Movimentações e Inventário Semanal; 3 novas tabelas DB (warehouse_loans, warehouse_inventory_sessions, warehouse_inventory_session_items); router warehouse.ts; PWA (manifest.json, metas Apple/Android, banner de instalação)
- **Almoxarifado Central + por Obra** (Rev. 298): coluna `obra_id` em `almoxarifado_itens` (NULL=Central, número=Obra); seletor de contexto horizontal com pills (verde=Central, azul=Obra); lista de itens recarregada ao trocar contexto; criação de item vinculada ao contexto; título da página dinâmico; backend filtra por obraId (IS NULL / = X)
- **Fornecedores**: Cadastro completo com busca automática CNPJ via BrasilAPI

## User Preferences
- After every completed adjustment, remind the user to click **Publish** to deploy. Deployment config: autoscale, build=`pnpm run build`, run=`node dist/index.js`.

## Critical DB Patterns (PostgreSQL/Neon)
- `db.execute()` returns QueryResult object, NOT array. Use: `((await db.execute(sql`...`)) as any).rows || []`
- All camelCase column names in raw SQL MUST be quoted: `"companyId"`, `"deletedAt"`, `"nomeCompleto"`, etc.
- MySQL → PG conversions: `CURDATE()` → `CURRENT_DATE`; `DATE_FORMAT(c,'%Y-%m')` → `TO_CHAR(c,'YYYY-MM')`; `TIMESTAMPDIFF(YEAR,c,CURRENT_DATE)` → `EXTRACT(YEAR FROM AGE(CURRENT_DATE,"c"))`; `IFNULL(a,b)` → `COALESCE(a,b)`; `GROUP_CONCAT(x)` → `STRING_AGG(x,',')`; boolean: `= 1` → `= true`
- Schema changes via raw SQL only (db:push broken); use `json()` not `jsonb()`
- Login: `felipe@fcengenhariacivil.com.br` / `asdf1020` (role: admin_master, userId: 601043)
- Company IDs: 60002 (FC Engenharia), 60004 (CF Hotelaria), 60005 (Julio Ferraz), 90001 (Locnow)

## Performance Optimizations (March 2026)
- **Gzip compression**: `compression` middleware added as first middleware in Express (`server/_core/index.ts`). Level 6, threshold 1KB. Reduces vendor bundles from ~1.2MB → ~350KB over the wire.
- **Static asset caching**: `/assets/*` served with `Cache-Control: max-age=31536000, immutable` (1 year). `index.html` served with `no-cache` to force re-check.
- **React Query staleTime=30s**: All queries now cached for 30 seconds after fetch. Navigation between pages no longer triggers redundant API calls. `refetchOnWindowFocus: false` prevents refetch on tab switch. Smart retry: no retry on 401/403/404.
- **DB connection pool**: Explicit `max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`.
- **12 new composite DB indexes**: `idx_emp_company_status_deleted` (employees), `idx_emp_company_deleted`, `idx_td_company_mes` (timecard_daily), `idx_td_emp_mes`, `idx_aso_company_emp_deleted`, `idx_of_employee_active`, `idx_emp_nome_search` (GIN trigram), `idx_ppay_company_mes_emp`, `idx_ed_company_emp_deleted`, `idx_vp_company_emp_status`, `idx_pp_company_status` (payroll_periods), `idx_he_company_status` (he_solicitacoes).
- **pg_trgm extension**: Enabled for fast text search on employee names.
- **Vite build**: `sourcemap: false`, target `es2020`, finer manual chunks (added `vendor-utils-sm` for superjson/zod/clsx).
- **Dashboard queries parallelized with Promise.all**: Reduced from 66 sequential `await db.` calls to 8, using 10 `Promise.all()` groups. Each dashboard function now runs all independent queries in parallel: getDashFuncionarios (20→parallel), getDashDocumentos (26→parallel), getDashControleDocumentos (6→parallel), getDashHorasExtras (5→parallel), getDashEpis (5→parallel), getDashPerfilTempoCasa (5→parallel), getDashCompetenciasAnual (4→parallel), getDashFolhaPagamento (2→parallel), getDashCartaoPonto (2→parallel). Expected ~10x reduction in dashboard response time.

## Notes
- Default password for first login: `asdf1020`
- After every completed adjustment, click **Publish** to deploy (autoscale, build=`pnpm run build`, run=`node dist/index.js`)
