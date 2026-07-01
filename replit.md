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

- **Rev. 3932** — **SST — APR: EQUIPE — NR × ATIVIDADE + CIPA + AVISO PRÉVIO + BLOQUEIO.** Cross-check dinâmico: `tipoSelecionado.nr` parseado em array de NRs exigidas; cada funcionário próprio verificado em `emp.nrs` → badge verde ✓ (ok) / âmbar ⚠ (vencida, bloqueia) / vermelho ✗ (ausente, bloqueia). NRs extras exibidas em cinza. CIPA badge (rosa). Aviso Prévio badge (âmbar). Bloqueado: grayscale + Ban sobreposto + mensagem "⛔ NR-35 ausente". Terceiros não bloqueados. ZERO DELETE.

- **Rev. 3931** — **SST — APR: EQUIPE — PHOTO-GRID PICKER (CLT + PJ + TERCEIROS DA OBRA).** Step 1 substituiu inputs livres por grid de cards com fotos; `obras.funcionarios` + `terceiros.funcionarios.list`; `equipeJson` agora `[{nome, fotoUrl, tipo, funcao}]`; compat. reversa com `string[]`. ZERO DELETE.

### 5 one-liners

- **Rev. 3930** — **SST — APR: REDESIGN COMPLETO FULL-SCREEN + AUTO-FILLS + HORA INÍCIO.** Wizard full-screen, 2 painéis, auto-fills (data/hora/TST), coluna `hora_inicio`, ColFix v3930. ZERO DELETE.

- **Rev. 3929** — **SST — PT PRINT: MARGEM 1,5 CM + PADDING DE TELA 15MM.** `@page margin: 20mm → 15mm`. `@media screen { body { padding: 15mm } }`. ZERO DELETE.

- **Rev. 3928** — **SST — PT PRINT: MARGEM MÍNIMA 2 CM EM TODAS AS BORDAS.** `@page { margin: 14mm 16mm }` → `margin: 20mm` uniforme nos 4 lados. ZERO DELETE.

- **Rev. 3925** — **SST — PT DETALHE: HEADER AZUL (PADRÃO FC) + FIX LOGO FC SUMINDO.** `bg-emerald-800` → `bg-blue-800` no header. Fix logo FC: `??` → `||`. ZERO DELETE.

- **Rev. 3924** — **SST — PT DETALHE: FIX LOGOS ENORMES + REVERT CORES PARA EMERALD.** Logos: container fixo `w-10 h-8 overflow-hidden`; cores de marca para emerald. ZERO DELETE.

- **Rev. 3923** — **SST — PT DETALHE: PALETA FC AZUL + 3 LOGOS (FC + CLIENTE + GERENCIADORA).** `getById` expandido com logos do cliente e gerenciadora da obra. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3917 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
