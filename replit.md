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

- **Rev. 3848** — **CONCILIAÇÃO · CHEQUE DEVOLVIDO = MOVIMENTAÇÃO, NÃO ENTRADA.** Padrões `"cheque devol"` e `"dev.*cheq"` adicionados a `_INTERNO_PATTERNS` em `financial.ts`. Par crédito+débito ("CHEQUE DEVOLVIDO MOT 11") vai para `valorEntradasInternas`/`valorSaidasInternas` (movimentação), saindo do caixa real — idêntico ao tratamento de `aplica`/`resgate`. Base: NBC TG 03/IAS 7 (estorno puro, net=0). Arquivo: `financial.ts`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3847** — **TEMPLATE XLSX · SAVE CORRIGIDO + "APROVADO POR" AUTOMÁTICO + LISTA COMPLETA DE RELATÓRIOS.** (1) Save silencioso corrigido: companyId=0 agora exibe toast; mutation usa `onSuccess`/`onError` (toast visível em mobile). (2) "Aprovado por" vira read-only preenchido com o nome do usuário logado (prop `userName` de `useAuth`). (3) Lista completa de 7 relatórios XLSX com badge "usa template". Arquivos: `XlsxTemplateTab.tsx`, `Configuracoes.tsx`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3846** — **CONFIGURAÇÕES · NOTIFICAÇÕES E-MAIL UNIFICADAS COM SUBCATEGORIAS.** Os dois tabs fundidos num tab com seletor [RH] | [Contabilidade] via `NOTIF_SUBCATS`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3845** — **TEMPLATE FC XLSX · SERVIÇO COMPARTILHADO + ABA "TEMPLATE DE PLANILHA" EM CONFIGURAÇÕES.** `excelFcTemplate.ts` + tabela `xlsx_template_config` + 3 endpoints + `exportarCustosObra` migrado. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3844** — **PANORAMA FISCAL · AUTO-VÍNCULO NF-e × EXTRATO BANCÁRIO APÓS CONCILIAÇÃO.** `autoVincularNfService.ts` fire-and-forget em 3 pontos de `financial.ts`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3843** — **NF-E RECEBIDAS · BUGFIX: BOTÃO "MUDAR STATUS" NÃO ABRIA DIALOG.** `onClick` chamava estado das Emitidas; corrigido para `setBulkRecStatusOpen`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3841** — **CONFIG. SMTP VIA UI · ALTERAR E-MAIL E SENHA SEM EDITAR VARIÁVEL DE AMBIENTE.** Tab em Configurações (admin_master), smtp_config via SyncSchema+, smtpService lê DB primeiro. ZERO DELETE. Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3838 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
