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

- **Rev. 2092** — **Financeiro · Centros de Custo / modal Novo/Editar redesenhado no padrão Categorias.** Pedido do user (screenshot do modal "Editar Centro de Custo" com scrollbar horizontal aparecendo na base + inputs altos demais): "refaça o layout, deixando ela mais ajustadas com tamanho e regras de ouro". **Problema:** o modal de Rev. 2088 estava destoante do padrão Categorias — `DialogContent max-w-md` sem `overflow-hidden`, `Input` h-10 default, `Label` shadcn sem uppercase e `Select` shadcn com SelectTrigger volumoso causavam transbordo lateral + visual frio sem header de cor. **Regras de ouro aplicadas (espelhadas de `FinanceiroCategorias.tsx`):** `DialogContent` ganha `p-0 overflow-hidden`; header com gradiente `from-blue-600 to-indigo-600` + ícone Building2 em pill `bg-white/15 ring-2 ring-white/30` + título compacto + subtítulo contextual; labels em `text-xs uppercase tracking-wide` ao invés de `<Label>`; `Input h-9`; `<select>` nativo nos campos Tipo e Obra Vinculada (mata o overflow); `gap-3` + `space-y-3`; autoFocus + Enter-to-save no Nome; footer `px-5 pb-4` + botão Cadastrar com ícone `PlusCircle`; dica em pill azul (só na criação) explicando auto-código + vínculo de obra. **Arquivo único:** `client/src/pages/financeiro/FinanceiroCentrosCusto.tsx`. Zero backend / zero schema.
- **Rev. 2091** — **Compras · "Atender pelo Estoque" agora pergunta a OBRA DE ORIGEM antes de baixar.** Pedido do user (screenshot `/almoxarifado` com dropdown "Por Obra" — Almoxarifado Central, HOTEL DO PAPA, ESCRITÓRIO CENTRAL, etc): "ir no estoque e me deixasse selecionar a obra e o material que quero... transferir umas folha de sulfite pro hotel do papa". Antes (Rev. 1640) o botão baixava direto, filtrando almox por `obraId IS NULL OR obraId = oc.obraId` — sem controle de qual almoxarifado sediava a saída. Agora abre modal "Transferir do Estoque" (destino = obra da SC, readonly; origem = `<select>` com Almoxarifado Central + obras ordenadas). **Backend (`server/routers/compras.ts`):** `criarOrdemDeCotacao` ganha input opcional `obraOrigemId: z.number().nullable().optional()` — `null` = central (`IS NULL`), número = obra, `undefined` = comportamento legado (compat). `motivo` da movimentação ganha "origem → destino" pra rastreabilidade. Validação de autorização contra `getEffectiveAllowedObraIds` (fix do code review). **Frontend (`client/src/pages/compras/Cotacoes.tsx`):** novo componente `TransferenciaEstoqueDialog` (module-scope) com card destino/origem + tabela de itens da SC mostrando saldo na origem + badges OK/insuficiente/sem-item + banner de erros. `handleAprovarGerarOC` divergente quando vencedor (selecionado OU fallback `melhorForn`) é estoque. Decisão UX: modal em vez de redirect pra `/almoxarifado` pra preservar contexto da cotação.

### Revisões recentes (one-liners)

- ~~Rev. 2090~~ — Compras · Ordens (OC/OS) ganha filtro por Obra. Novo `<Select>` Building2 com "Todas/Sem obra/lista ordenada", reusa `obrasQ`. Botão X limpa, pill de resultados conta o novo filtro. Ver `shared/changelog.ts`.
- ~~Rev. 2089~~ — Compras · Solicitações / ordenação clicável por coluna (default `criadoEm DESC`). Headers viraram `<button>` com ArrowUp/Down, pill "Ordenado por" + reset "↻ mais recentes". `localeCompare(numeric: true)`. Ver `shared/changelog.ts`.
- ~~Rev. 2088~~ — Financeiro · Centros de Custo CRUD completo (editar/inativar/reativar). Backend: `getCostCenters` ganhou `includeInactive`, novo `updateCostCenter` (SET dinâmico, soft delete R-007). Frontend: reescrita pro padrão Categorias (header gradient, KPI bar 4 cards, AlertDialog). Ver `shared/changelog.ts`.
- ~~Rev. 2087~~ — Permissões · menu "Categorias" (Financeiro) não aparecia para grupos sem level=admin/viewer. Fix: adicionar feature em `shared/modules.ts` + `shared/modulePages.ts` (Categorias herda pageId `plano_contas`, irmãs em Cadastros). Ver `shared/changelog.ts`.
- ~~Rev. 2086~~ — Painel RH / Home · Aniversariantes (mês + empresa) ordem cronológica relativa ao HOJE: sort em 3 buckets (isHoje=0 / futuros=1 / jaPassou=2 com tie-break por dia asc) em `server/routers/homeData.ts`. Ver `shared/changelog.ts`.

> Revisões 2084 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
