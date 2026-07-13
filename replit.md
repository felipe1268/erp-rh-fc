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

- **Rev. 4221** — **SCORECARD SST: REDESIGN COMPLETO — ABA "SEGURANÇA" → "🦺 SST".** Fix bolinhas PeriodSelectorCard (inicializa todos 12 meses + checa epi_entregas). Q14 backend (estoque EPI por obra). Dashboard EPI: gráficos mensais, Curva ABC, Top 5 maior/menor uso c/ foto, estoque obra. Atestados: Top 5 c/ foto + CID breakdown (25 códigos BR) + tabela com badge CID. Comparativo + EPIs. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4220** — **SCORECARD RH: MATRÍCULA + CARGO LEGÍVEIS NA TABELA CUSTO POR FUNCIONÁRIO.** Matrícula em mono, cargo em indigo visível (oculto quando nulo). Aplicado nas 2 tabelas. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4219** — **SCORECARD COMPRAS: FERRAMENTAS ALMOX + LOCAÇÕES — LAYOUT CARD COM FOTO + FIX LOCAÇÕES VAZIAS.** Cards horizontais, badge Próprio, JOIN almoxarifado_itens, foto/responsável/custo/mês. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4218** — **SCORECARD SEGURANÇA: LEGENDA + monthStatus + TABELA COMPARATIVA + 4 GRÁFICOS.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4217** — **REGRA DE OURO GRAVADA: SELETOR DE MÊS/ANO → SEMPRE `<PeriodSelectorCard>`.** `segMes: string → number | null`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4216** — **SCORECARD: SEGURANÇA — GRADE CLT COM STATUS, DESLIGADOS VISÍVEIS, CIPA, PERÍODO EXPERIÊNCIA.** Q1 sem filtro status. Badges: Status · Exp. 1º/2º · CIPA · ASO · Advertências. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4214** — **SCORECARD: ABA SEGURANÇA — APR, PT, DDS, ACIDENTES E ATESTADOS.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4213** — **SCORECARD + EQUIPE: FIX RAMO A + BADGE "VEIO DA OBRA X".** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4212** — **SCORECARD: BACKFILL AUTOMÁTICO employee_site_history PARA ALOCAÇÕES SEM HISTÓRICO.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4211** — **SCORECARD RH/FOLHA: FIX EQUIPE — ELIMINA DUPLICAÇÃO MULTI-OBRA E PONTO-SEM-ALOCAÇÃO.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4210** — **SCORECARD RH/FOLHA: FIX CUSTO MO — PISO = dataInicio DA OBRA.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4209** — **SCORECARD: FIX BÔNUS + BETA GATE POR EMPRESA.** ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4205 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
