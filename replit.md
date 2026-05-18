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

- **Rev. 2085** — **Almoxarifado · Smart Entry / modal "Receber Material" largura aumentada (max-w-lg → max-w-2xl) + KPI cards superiores viraram BOTÕES que filtram a lista de OCs.** Pedido do user (screenshot iPad com modal estreito + 4 KPIs estáticos): "ajuste a largura da tela e quando clicar no card superior, filtre o que for pertinente". Mudanças em `client/src/pages/almoxarifado/SmartEntry.tsx`: (1) `max-w-lg` (512px) → `max-w-2xl` (672px), +31% em tablets sem afetar mobile/desktop; (2) novo estado `ocFilter` ("all"|"pendentes"|"parciais"|"atrasadas"); (3) `filteredOCs` useMemo aplica AMBOS filtros (status + busca textual) — pendentes exclui parcial, parciais só parcial, atrasadas usa `dataEntregaPrevista < todayIso`; (4) KPI cards viraram `<button>` com `tone`/`activeTone` (cores sólidas brancas quando ativo: slate/blue/amber/red), toggle ao clicar (volta pra "all" exceto Total), `active:scale-95`, `hover:brightness-105`, title dinâmico.
- **Rev. 2084** — **Financeiro · Centro de Custo / código auto-gerado (`CC-{nnnn}`).** Pedido do user (screenshot do modal "Novo Centro de Custo"): "o código das categorias e centro de custo precisam preencher automaticamente". Categorias já gerava (Rev. 2082 — `AUTO-{nnnn}` em `createAccount`); faltava replicar pra Centros de Custo. Backend `server/routers/financial.ts` L1867 — `createCostCenter`: `codigo` virou opcional; se vazio, `SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(codigo,'\\D','','g') AS INTEGER)),0) WHERE codigo ~ '^CC-[0-9]+$'` → próximo padded 4 dígitos → `CC-{nnnn}`. Filtro regex isola códigos legados manuais. `RETURNING id, codigo`. Frontend `FinanceiroCentrosCusto.tsx`: Label "Código *" → "Código", placeholder "Gerado automaticamente" + hint cinza, validação `nome.trim().length < 2` no botão Salvar. Mesma estratégia da Rev. 2082, zero schema change.

### Revisões recentes (one-liners)

- ~~Rev. 2083~~ — Financeiro · Nova tela "Categorias" no sidebar (Cadastros) para CRUD completo de `financial_accounts`. Header gradient blue + KPI bar + filtros + AlertDialog inativar (sem DELETE, R-007). Registrado em 6 pontos (App/DashboardLayout/ModuleContext/ActivityTracker/Configuracoes/GruposUsuarios). Ver `shared/changelog.ts`.
- ~~Rev. 2082~~ — Financeiro · Lançamentos / cadastro inline de Categoria no modal "Novo Lançamento" + link opcional a Centro de Custo. ColFix `centro_custo_id` + UNIQUE parcial + `createAccount` aceita `codigo` opcional (auto AUTO-{nnnn}) + dedup case-insensitive. Ver `shared/changelog.ts`.
- ~~Rev. 2081~~ — Almoxarifado · Smart Entry / modal "Receber Material" repaginado pelas regras de ouro (header gradient emerald, KPI bar 4 cards, busca, indicador atraso colorido, CTA gradient). Ver `shared/changelog.ts`.
- ~~Rev. 2080~~ — HOTFIX PROD · Cotação Parcial / Geração de OC quebrada (`pg_advisory_xact_lock(bigint, integer) does not exist`). Cast `::bigint, ::int` virou `::int, ::int`. Ver `shared/changelog.ts`.
- ~~Rev. 2079~~ — Comunicados Internos · botão "Lista para Assinatura" com modos digital (SignaturePad canvas DPR-aware) ou impressão. Nova tabela `comunicado_assinaturas` + 3 endpoints + sub-view com 3 KPIs + tabela imprimível institucional. Ver `shared/changelog.ts`.
- ~~Rev. 2077~~ — Fechamento de Ponto · selo "⚠ Aviso Prévio" agora aparece nos 4 rankings (Pontuais/Atrasados/HE/Menos Dias Trabalhados). Backend já devolvia `emAvisoPrevio`, fix no map do client + render do badge. Ver `shared/changelog.ts`.

> Revisões 2073 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
