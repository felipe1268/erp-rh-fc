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
- **Database**: MySQL 8 / TiDB (requires external MySQL connection via DATABASE_URL)
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
- `DATABASE_URL` — MySQL connection string (mysql://user:pass@host:port/db)
- `JWT_SECRET` — JWT signing secret
- `PORT` — Server port (default 5000 in dev)
- `VITE_APP_TITLE` — App title shown in UI
- `VITE_APP_LOGO` — Logo path
- `OAUTH_SERVER_URL` — Manus OAuth server URL (optional)
- `VITE_APP_ID` — OAuth App ID (optional)
- `OWNER_OPEN_ID` — Owner user OpenID (optional)

## Planejamento Module
- Routes: `/planejamento/:id` (tabs: cronograma, curva-s, avanco, refis, compras, ia-gestora, etc.)
- `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` — main file ~7430 lines
- Projects in DB: id=4 (Hotel do Papa), id=6 (Chlorum Palmeira), id=7 (Hotel QIU 2 - 4 Fase)
- **JULINHO AI**: Google Gemini (gemini-2.5-flash) via GOOGLE_API_KEY, system prompt = persona only, project context in user message
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

## User Preferences
- After every completed adjustment, always remind the user to click **Publish** to deploy. Deployment config: autoscale, build=`pnpm run build`, run=`node dist/index.js`.

## Notes
- The app runs without a database (gracefully returns empty data)
- MySQL is required for full functionality; Replit provides PostgreSQL (incompatible)
- To use a MySQL database, provide a `DATABASE_URL` with mysql:// scheme
- Default password for first login: `asdf1020`
