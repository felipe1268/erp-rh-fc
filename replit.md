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

- **Rev. 3850** — **NF-e × EXTRATO · DIALOG "REVISAR SUGESTÕES": LISTA DE PARES PARA CONFIRMAR OU IGNORAR INDIVIDUALMENTE.** `obterSugestoesPeriodo` (read-only, score ≥ 30, até 200 pares). Endpoint `fiscalNotes.obterSugestoes`. Dialog max-w-4xl com badge Alta/Média/Baixa, botão [Vincular]/[Ignorar] por linha, delta % de valor, footer "Vincular todas de Alta Confiança". Botão "Revisar Sugestões" (cinza) em ambas as abas ao lado de "Vincular Automaticamente" (violeta). `FinanceiroNotasFiscais.tsx`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3849** — **NF-e × EXTRATO · VÍNCULO AUTOMÁTICO MELHORADO: NAME-TOKEN MATCHING + ±10% TOLERÂNCIA + VARREDURA RETROATIVA.** `autoVincularNfService.ts` reescrito: `extractTokens()`, `calcScore()` (0-100), `sincronizarNfsPeriodo` (greedy bipartite). Endpoint `fiscalNotes.sincronizarComExtrato`. Botão "Vincular Automaticamente" nas abas Emitidas e Recebidas. ZERO DELETE. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3848** — **CONCILIAÇÃO · CHEQUE DEVOLVIDO = MOVIMENTAÇÃO, NÃO ENTRADA.** Padrões `"cheque devol"` e `"dev.*cheq"` em `_INTERNO_PATTERNS`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3847** — **TEMPLATE XLSX · SAVE CORRIGIDO + "APROVADO POR" AUTOMÁTICO + LISTA COMPLETA DE RELATÓRIOS.** `XlsxTemplateTab.tsx`, `Configuracoes.tsx`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3846** — **CONFIGURAÇÕES · NOTIFICAÇÕES E-MAIL UNIFICADAS COM SUBCATEGORIAS.** Os dois tabs fundidos num tab com seletor [RH] | [Contabilidade] via `NOTIF_SUBCATS`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3845** — **TEMPLATE FC XLSX · SERVIÇO COMPARTILHADO + ABA "TEMPLATE DE PLANILHA" EM CONFIGURAÇÕES.** `excelFcTemplate.ts` + tabela `xlsx_template_config` + 3 endpoints + `exportarCustosObra` migrado. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3844** — **PANORAMA FISCAL · AUTO-VÍNCULO NF-e × EXTRATO BANCÁRIO APÓS CONCILIAÇÃO.** `autoVincularNfService.ts` fire-and-forget em 3 pontos de `financial.ts`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3838 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
