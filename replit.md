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

- **Rev. 4440** — **FEAT: MARGENS CONFIGURÁVEIS POR EMPRESA — Central de Documentos.** 4 colunas em `companies` (`docMarginTop/Right/Bottom/LeftMm`, DEFAULT 10); ColFix `v4440`; tRPC `getDocumentMargins`+`updateDocumentMargins`; hook `useDocumentMargins`; UI "Configurações de Página" em TemplatesDocsTab; todos os callers de `buildFcDocument`/`buildContratoPjSignHtml` atualizados (10 arquivos). ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4439** — **UX: BOTÃO LIMPAR ASSINATURA — AssinarDocumento (FCSign).** Botão "↺ Limpar" ao lado do título da área de assinatura; chama `padRef.current?.clear()`. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4438** — **LAYOUT: MARGENS 1cm EM TODOS OS LADOS — PADRÃO DEFINITIVO (buildFcDocument).** `@page`: `10mm`; `.fc-doc` padding: `1cm`. ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4437** — **LAYOUT: MARGENS LATERAIS 1,5cm — TEMPLATE ISO (buildFcDocument).** `@page`: `20mm 15mm`; `.fc-doc` padding: `2cm 1.5cm`. ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4436** — **LAYOUT: REDUÇÃO DE MARGENS DO TEMPLATE ISO (buildFcDocument).** `@page` margin: `25mm 15mm` → `20mm`; `.fc-doc` padding: `2.5cm 1.5cm` → `2cm`. ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4435** — **FIX: BOTÃO VOLTAR — ContratoPJView e AditivoPJView.** `window.history.back()` no-op; substituído por `navigate("/modulo-pj")` / `navigate(\`/contrato-pj/${contractId}\`)`. ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4429** — **FIX: PDF CONTRATO PJ = 100% TEMPLATE DA CENTRAL DE DOCUMENTOS.** `buildContratoPjSignHtml` usa template ISO diretamente; HTML shell mínimo `@page A4`. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4413 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
