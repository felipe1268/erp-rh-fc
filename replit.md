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
- `server/`: Express backend + tRPC routers
  - `server/_core/`: Auth, OAuth, Vite setup, env config
  - `server/routers/`: tRPC routers per módulo
  - `server/db.ts`: Database helpers
- `drizzle/`: Schema and migrations
- `shared/`: Shared types and constants (`shared/version.ts`, `shared/changelog.ts`, `shared/paymentConditions.ts`, `shared/modules.ts`)
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: tRPC routers in `server/routers/`
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui` components

## Recent changes

> **Convenção (importante)**: este arquivo guarda APENAS as últimas **5 revisões**, em formato curto (1–3 linhas: o quê + por quê).
> Quando entrar uma nova revisão, **remova a mais antiga daqui** — o histórico completo (com causa-raiz, stack traces, nomes de arquivos, etc.) vive em `shared/changelog.ts`.
> Não duplique conteúdo entre os dois arquivos.

- **Rev. 1779**: **Dashboards · TabelaComparativaAnual em 6 dashboards** (HorasExtras, Folha, Funcionários, AvisoPrévio, Férias, Apontamentos). Componente reutilizável `client/src/components/TabelaComparativaAnual.tsx` (extraído da Rev.1778) + 6 procedures `*Comparativo` em `dashboards.ts` (loops reusam HE/Folha; SQL fresca com `generate_series` para Funcionários/Aviso/Férias/Apontamentos). Cada dashboard tem 4-6 indicadores com benchmarks (CBIC, CLT, eSocial) e 2-4 ações recomendadas por indicador. Sem schema change.
- **Rev. 1778**: **Cartão de Ponto · Tabela comparativa redesenhada — legenda visível + sparkline + modal full-screen de análise aprofundada**. Lookup estático `COR_CLASSES` (Tailwind JIT-safe), mini-sparkline SVG na nova coluna Tendência, cards stacked no mobile, linhas clicáveis (Enter/Space, focus-ring). Modal `98vw×95vh`: header gradient com nav cíclico, 4 KPI cards (Maior/Menor cores invertidas quando `lowerIsBetter`), `DashChart` line com `spanGaps`, detalhamento mensal em grid, **insights auto-gerados** e **recomendações de ação** por indicador. Sem server change.
- **Rev. 1777**: **Cartão de Ponto · tabela comparativa Janeiro→mês atual**. Nova procedure `cartaoPontoComparativo` em `server/routers/dashboards.ts`. Frontend `DashCartaoPonto.tsx` com 9 indicadores, δ vs mês anterior, badges Observar/OK. Fix paralelo: drilldown `admissaoMes`/`demissaoMes` precisava aspas duplas em `dataAdmissao`/`dataDemissao` no WHERE.
- **Rev. 1776**: **Currículos · renomear função** + **Gestão de Documentos · criar sub-pasta na árvore**. Botão lápis em cada função → renomeia (UPPERCASE, propaga `funcaoNome`, bloqueia duplicata). Botão verde 📁+ no hover de categoria/disciplina → cria sub-pasta. Sem schema change.
- **Rev. 1775**: **Gestão de Documentos · explorador redesenhado + backfill defensivo + auto-clone de templates**. Painel esquerdo 256→288px, abas viram cards com gradient/badge ATIVO. `UPDATE gd_disciplinas SET tipo_acervo='projeto' WHERE tipo_acervo IS NULL` no ColFix v1775. `ensureDisciplinasProjetoNoFicheiro` em `getFicheiroDetail` clona templates ARQ/EST/ROHR pra obras vazias.

## User preferences

- **Idioma**: português brasileiro em toda comunicação.
- **Publicação**: Autoscale (`pnpm run build` + `node dist/index.js`).
- **Tom de UI**: visual rico, gradientes coloridos por contexto, badges, ícones grandes — evitar telas chapadas.
- **Nunca mostrar valores de secrets** em código ou logs.
