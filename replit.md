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
- Backend: `server/routers/orcamento.ts`
- Schema tables: `orcamentos`, `orcamento_itens`, `orcamento_insumos`, `orcamento_bdi`
- Excel import: reads "Orçamento" tab (cols 9–32) + "BDI" tab + optional "Insumos" tab
- 3 versions: Venda (BDI applied), Custo (direct cost), Meta (cost × (1-metaPerc), default 20%)
- Meta % adjustable by admin_master role, recalculates all items

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

## User Preferences
- After every completed adjustment, always remind the user to click **Publish** to deploy. Deployment config: autoscale, build=`pnpm run build`, run=`node dist/index.js`.

## Notes
- The app runs without a database (gracefully returns empty data)
- MySQL is required for full functionality; Replit provides PostgreSQL (incompatible)
- To use a MySQL database, provide a `DATABASE_URL` with mysql:// scheme
- Default password for first login: `asdf1020`
