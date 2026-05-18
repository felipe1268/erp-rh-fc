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

- **Rev. 2087** — **Permissões · menu "Categorias" (Financeiro) não aparecia para usuários de grupo sem level=admin/viewer.** Pedido do user (screenshot Lilian "Usuário" no sidebar Financeiro mostrando Plano de Contas / Centros de Custo / Conciliação / Configurações, mas SEM "Categorias"): "no usuário da Lilian não está aparecendo o menu CATEGORIAS". Causa-raiz: Rev. 2083 registrou a rota `/financeiro/categorias` em 6 lugares (App/DashboardLayout/ModuleContext/Configuracoes/ActivityTracker/GruposUsuarios) mas faltou nos DOIS mapas compartilhados: `shared/modules.ts` (array `features` do módulo financeiro) e `shared/modulePages.ts` (`ROUTE_TO_PAGEID.financeiro`). Sem isso, `groupCanAccessRoute` retorna `false` no sistema novo de `module_access` (linha ~345 do PermissionsContext) — grupos com level admin/viewer ainda passavam pelo curto-circuito da linha 351, mas grupos com permissões granulares por página (caso Lilian) nunca viam o menu. **Fix:** adicionar a feature em `shared/modules.ts` E em `shared/modulePages.ts` com Categorias herdando o pageId `plano_contas` (são irmãs em Cadastros — quem tem acesso a Plano de Contas ganha Categorias automaticamente, sem precisar re-salvar grupo).
- **Rev. 2086** — **Painel RH / Home · Aniversariantes do Mês + Aniversários de Empresa: ordem cronológica relativa ao dia atual (HOJE primeiro → próximos → já passados no fim).** Pedido do user (screenshot do card em 18/maio com "Dia 10, Dia 12, Dia 12" riscados no topo e o aniversariante de hoje afogado no meio + badge "1 hoje!"): "faz aparecer primeiro o aniversariante do dia, conforme vai passando os dias o próximo vai entrando". Causa-raiz em `server/routers/homeData.ts`: sort `a.dia - b.dia` (asc) não considerava se já tinha passado. Fix: sort em 3 buckets — `isHoje`(0) / futuros(1) / `jaPassou`(2) com tie-break por dia asc. Aplicado em AMBOS arrays (`aniversariantes` mês + `aniversariosEmpresa` anos de casa). Zero schema change, campos `isHoje`/`jaPassou` já existiam.

### Revisões recentes (one-liners)

- ~~Rev. 2085~~ — Almoxarifado · Smart Entry / modal "Receber Material" max-w-lg → max-w-2xl + KPI cards viraram `<button>` filtrando lista (ocFilter: all/pendentes/parciais/atrasadas, toggle ao clicar). Ver `shared/changelog.ts`.
- ~~Rev. 2084~~ — Financeiro · Centro de Custo / código auto-gerado (`CC-{nnnn}`). `createCostCenter`: `codigo` opcional, MAX(REGEXP_REPLACE) + filtro regex `^CC-[0-9]+$` → padded 4 dígitos. Frontend label sem `*`, placeholder "Gerado automaticamente". Ver `shared/changelog.ts`.
- ~~Rev. 2083~~ — Financeiro · Nova tela "Categorias" no sidebar (Cadastros) para CRUD completo de `financial_accounts`. Header gradient blue + KPI bar + filtros + AlertDialog inativar (sem DELETE, R-007). Registrado em 6 pontos (App/DashboardLayout/ModuleContext/ActivityTracker/Configuracoes/GruposUsuarios). Ver `shared/changelog.ts`.
- ~~Rev. 2082~~ — Financeiro · Lançamentos / cadastro inline de Categoria no modal "Novo Lançamento" + link opcional a Centro de Custo. ColFix `centro_custo_id` + UNIQUE parcial + `createAccount` aceita `codigo` opcional (auto AUTO-{nnnn}) + dedup case-insensitive. Ver `shared/changelog.ts`.
- ~~Rev. 2081~~ — Almoxarifado · Smart Entry / modal "Receber Material" repaginado pelas regras de ouro (header gradient emerald, KPI bar 4 cards, busca, indicador atraso colorido, CTA gradient). Ver `shared/changelog.ts`.
- ~~Rev. 2080~~ — HOTFIX PROD · Cotação Parcial / Geração de OC quebrada (`pg_advisory_xact_lock(bigint, integer) does not exist`). Cast `::bigint, ::int` virou `::int, ::int`. Ver `shared/changelog.ts`.

> Revisões 2073 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
