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

- **Rev. 3892** — **EPI — SUGESTÃO DE KITS POR ESTOQUE REAL + ITENS FALTANTES EM VERMELHO.** Novo endpoint `iaSugerirKitsComEstoque`: lê funções cadastradas + catálogo EPI com `quantidadeEstoque`; IA retorna `disponivel` por item. Botão "🏭 Sugerir pelo Meu Estoque" na Config; painel verde/vermelho — itens ausentes em vermelho com badge "Comprar". ZERO DELETE.

- **Rev. 3891** — **EPI — BOTÃO IA DENTRO DO DIALOG DE KIT: PREENCHE ITENS POR FUNÇÃO.** Novo `iaKitsDialogMut` (mesmo endpoint com param `funcao`): ao receber sugestão, preenche nome/descrição/itens do form. Dialog redesenhado em 3 passos — box gradiente violeta destaca Função + botão IA lado a lado; loading mostra "Consultando NR-6 e NR-18..."; items têm numeração, toggle Obrig/Opc clicável, área vazia instrucional. ZERO DELETE.

### 5 one-liners

- **Rev. 3890** — **EPI — FOTO DO COLABORADOR EM TODAS AS TABELAS DO MÓDULO EPI.** `getDashEpis` adicionou `fotoUrl`; avatar circular em DashEpis + EpiDrillDown. ZERO DELETE.

- **Rev. 3889** — **EPI — OBSERVAÇÃO OBRIGATÓRIA QUANDO EPI FORA DO KIT + FLAG `fora_do_kit` + BADGE.** Coluna `fora_do_kit`; server valida observação obrigatória; textarea + badge ⚠ âmbar. ZERO DELETE.

- **Rev. 3888** — **EPI — CATÁLOGO GERENCIADO DE MOTIVOS (ADMIN-ONLY WRITE) + EDIT DIALOG VIRA SELECT.** Nova tabela `epi_motivos`; self-heal semeia 7 canônicos; tRPC listMotivos/create/update; `EpiMotivosConfig.tsx`. ZERO DELETE.

- **Rev. 3887** — **EPI — FOTO DO FUNCIONÁRIO NAS ENTREGAS + ALERTA DE KIT POR FUNÇÃO + MOTIVO PADRONIZADO.** Avatar circular + "Entregue por"; banner amber/verde por kit; Select 7 motivos canônicos; `[NormalizaMotivosEPI]`. ZERO DELETE.

- **Rev. 3886** — **TEMPLATES DE EXTRATO — PREVIEW FULLSCREEN + COLAPSO DE GRUPOS + DEDUP FRONTEND + GATE DE TEMPLATE NA CONCILIAÇÃO.** Dialog fullscreen; grupos colapsáveis; dedup por nome normalizado; gate na Conciliação. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3872 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
