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

- **Rev. 2090** — **Compras · Ordens (OC/OS): novo filtro por Obra.** Pedido do user (screenshot `/compras/ordens` mostrando filtros de Número/Fornecedor/Valor/Data, mas sem opção de obra): "em ordem de compra, fazer um ajuste que me permita filtrar por obra". **Frontend (`client/src/pages/compras/Ordens.tsx`):** novo estado `filtroObra` (default `"todas"`). Branch no `filt`: `"todas"` não filtra, `"sem_obra"` mostra só OCs órfãs, id numérico bate em `o.obraId`. Novo `<Select>` na linha 2 dos filtros (ícone Building2, `min-w-56`) com opções "Todas as obras" / "— Sem obra vinculada —" / lista ordenada via `localeCompare(sensitivity: base)`. Botão `X` pra limpar + pill "N resultados" passa a considerar `filtroObra` como ativo. Reusa `obrasQ` (`trpc.obras.listActive`) — sem nova query. Zero schema/backend.
- **Rev. 2089** — **Compras · Solicitações: ordenação clicável por coluna (default = mais recentes primeiro).** Pedido do user (screenshot `/compras/solicitacoes` em ordem aparentemente aleatória): "não estão por ordem de data postada. Sugiro colocar aquela setinha lateral como filtro, onde eu possa selecionar por ordem de data, por ordem de solicitação e etc". Diagnóstico: `listaFiltradaObra` ia direto pro `.map()` sem `.sort()` — ordem vinha do backend, e as "setinhas" lembradas do screenshot na real não existiam. **Frontend (`client/src/pages/compras/Solicitacoes.tsx`):** novo `sortKey/sortDir` (default `criadoEm DESC`) + `toggleSort(k)` (mesma coluna → inverte; outra → default sensato: data/número DESC, texto ASC). `useMemo listaFiltradaObra` aplica `.sort()` com getter por coluna e tie-break sempre `criadoEm DESC`. Headers (Aprovação/Status/Número/Título/Obra/Necessidade) viraram `<button>` com `ArrowUpDown` (inativo opacity-40) → `ArrowUp`/`ArrowDown` (ativo amber-700). Pill "Ordenado por: X" + botão "↻ mais recentes" pra reset. `localeCompare(numeric: true)` pra ordenação natural de `numeroSc`.

### Revisões recentes (one-liners)

- ~~Rev. 2088~~ — Financeiro · Centros de Custo CRUD completo (editar/inativar/reativar). Backend: `getCostCenters` ganhou `includeInactive`, novo `updateCostCenter` (SET dinâmico, soft delete R-007). Frontend: reescrita pro padrão Categorias (header gradient, KPI bar 4 cards, AlertDialog). Ver `shared/changelog.ts`.
- ~~Rev. 2087~~ — Permissões · menu "Categorias" (Financeiro) não aparecia para grupos sem level=admin/viewer. Fix: adicionar feature em `shared/modules.ts` + `shared/modulePages.ts` (Categorias herda pageId `plano_contas`, irmãs em Cadastros). Ver `shared/changelog.ts`.
- ~~Rev. 2086~~ — Painel RH / Home · Aniversariantes (mês + empresa) ordem cronológica relativa ao HOJE: sort em 3 buckets (isHoje=0 / futuros=1 / jaPassou=2 com tie-break por dia asc) em `server/routers/homeData.ts`. Ver `shared/changelog.ts`.
- ~~Rev. 2085~~ — Almoxarifado · Smart Entry / modal "Receber Material" max-w-lg → max-w-2xl + KPI cards viraram `<button>` filtrando lista (ocFilter: all/pendentes/parciais/atrasadas, toggle ao clicar). Ver `shared/changelog.ts`.
- ~~Rev. 2084~~ — Financeiro · Centro de Custo / código auto-gerado (`CC-{nnnn}`). `createCostCenter`: `codigo` opcional, MAX(REGEXP_REPLACE) + filtro regex `^CC-[0-9]+$` → padded 4 dígitos. Frontend label sem `*`, placeholder "Gerado automaticamente". Ver `shared/changelog.ts`.
- ~~Rev. 2082~~ — Financeiro · Lançamentos / cadastro inline de Categoria no modal "Novo Lançamento" + link opcional a Centro de Custo. ColFix `centro_custo_id` + UNIQUE parcial + `createAccount` aceita `codigo` opcional (auto AUTO-{nnnn}) + dedup case-insensitive. Ver `shared/changelog.ts`.

> Revisões 2073 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
