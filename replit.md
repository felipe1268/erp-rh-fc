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

- **Rev. 4517** — **FIX: FONTE DE DADOS DE UTILIZAÇÃO — warehouse_loans.** `locadosUtilizacao` reescrito para usar `warehouse_loans` via `almoxarifado_itens.equipamento_vinculado_id` (antes lia `equipamento_locado_eventos` vazia → 0 em campo). `proprioRaioX` "Quem mais utiliza" idem. `locadoRaioX` inclui retiradas do almox na timeline e responsáveis. ZERO schema change.
- **Rev. 4516** — **FEAT: CONVERSÃO DE TIPO (PRÓPRIO ↔ LOCADO).** Badge "LOCADO → Próprio" no card de Locados + badge "PRÓPRIO" (hover) nos cards de Proprios + botões "→ Próprio" / "→ Locado" na barra de ação em lote. Próprio→Locado pede fornecedor+data. 2 novas mutations tRPC. ZERO schema change.

### 5 one-liners

- **Rev. 4515** — **REVERSÃO Rev. 4513:** 47 proprios deletados; 41 locados restaurados para em_uso; 6 locados nota limpa. Transação atômica no Neon.
- **Rev. 4514b** — **FIX: EDIÇÃO INLINE DE CATEGORIA (LOCADOS DETALHES).** `locadoAtualizar`+schema; seção Categoria com datalist no modalEventos. ZERO schema change.
- **Rev. 4514** — **FEAT: RAIO-X DE EQUIPAMENTO LOCADO.** `locadoRaioX` tRPC + `EquipamentoLocadoRaioXModal.tsx` (3 abas: KPIs, Timeline, Dados). ZERO schema change.
- **Rev. 4513** — REVERTIDA (Rev. 4515). Migração Locados→Próprios desfeita.
- **Rev. 4512** — **FEAT: DASH UTILIZAÇÃO DE EQUIPAMENTOS LOCADOS.** Nova página `/equipamentos/locados-utilizacao`: KPIs, seção "Pagando parado no almox", gráfico barras mensais, rankings, histórico de ciclos. ZERO schema change.
- **Rev. 4510** — **FEAT: RAIO-X DO EQUIPAMENTO PRÓPRIO + FOTOS NA PRESENÇA DDS.** Modal redesenhado com 3 abas, donut, area chart, bar chart dias da semana, "quem mais usa". Fotos de colaborador na lista de presença das sessões DDS. ZERO schema change.
- **Rev. 4509** — **FEAT: RAIO-X DO EQUIPAMENTO PRÓPRIO.** Modal Raio-X com KPIs, gráfico de ocupação mensal, timeline. `proprioRaioX` tRPC. ZERO schema change.
- **Rev. 4508** — **FEAT: CP — APAGAR EM LOTE (cancelEntryBulk).** Botão "Apagar selecionados" + Dialog confirmação + motivo. ZERO schema change.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4506 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
