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

- **Rev. 4527** — **FEAT: CARTÃO DE CRÉDITO — FILTRO POR STATUS NA ABA CARTÕES.** Pills de filtro (Todos / Ativos / Renegociados / Bloqueados / Cancelados / Inativos) no header da aba Cartões. Estado `fStatusCartao` + useMemo `cartoesFiltrados`. Pills com count=0 ocultadas; título mostra "N de M" quando filtrado. Grid usa lista filtrada. ZERO schema change.
- **Rev. 4526** — **FEAT: CHEQUES EMITIDOS — OBRAS ATIVAS + AUTO-NÚMERO DO TALÃO.** `criarManual` estendido com `obraId`/`obraNome` ($21/$22 no INSERT). Duas novas queries: `obrasAtivas` e `nextNumeroCheque`. Frontend: bloco "Obra" + botão Wand2 + filtro por obra + chip ativo. ZERO schema change.

### 5 one-liners

- **Rev. 4525** — **FIX: INVENTÁRIO SEMANAL → ESTOQUE NÃO ATUALIZAVA.** `finishInventorySession` percorre itens e aplica `quantidadeAtual = quantidadeFisica`. ZERO schema change.
- **Rev. 4524** — **FIX: CHEQUES RECEBIDOS — LISTA VAZIA.** `fe.referencia` removido do SELECT de `listar`. ZERO schema change.
- **Rev. 4523** — **FEAT: ALMOXARIFADO — ITENS ZERADOS SEPARADOS.** `somenteZerados` no `listarItens` backend. `lista` useMemo exclui qty=0. Botão "Itens Zerados" com badge contador. Tabela lazy de itens zerados. ZERO schema change.
- **Rev. 4522** — **FEAT: DOTS DE MÊS NO SELETOR (LOCADOS UTILIZAÇÃO).** Segunda query `mes=null` + `monthStatus` useMemo. PeriodSelectorCard com `showLegend`. ZERO schema change.
- **Rev. 4521** — **FEAT: DASHBOARD UTILIZAÇÃO — EQUIPAMENTOS PRÓPRIOS.** `propriosUtilizacao` tRPC + `PropriosUtilizacao.tsx` (tema azul). KPIs + DrillModals. ZERO schema change.
- **Rev. 4520** — **FEAT: KPIs CLICÁVEIS + MODAL DRILL-DOWN + RESPONSIVO.** 3 KPIs abrem DrillModal tela-cheia. FIX: employees aspas duplas. ZERO schema change.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4506 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
