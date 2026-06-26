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

- **Rev. 3726** — **PLANILHA CONTADOR · BUGFIX "column fe.fiscal_note_id does not exist" — BOTÃO "PLANILHA CONTADOR" RETORNAVA ERRO. BACKEND PONTUAL · ZERO SCHEMA/ALTER/DROP/DELETE.** `fe.fiscal_note_id` não existe em `financial_entries`. Fix: remove JOIN fn2; usa `COALESCE(fn1.numero_nf, fe.nota_fiscal_numero)`. Arquivo: `downloadContabilidadeXlsx.ts`. Detalhe: `shared/changelog.ts`.

- **Rev. 3725** — **CONTABILIDADE · 3 BUGFIXES: BADGE NF-e RECEBIDAS ZERO + IMPORT NFS-e SPED CHAVE 50 DÍGITOS + TOAST ERRO DETALHADO. PONTUAL · ZERO SCHEMA/ALTER/DROP/DELETE.** (1) Badge "NF-e Recebidas" no painel mensal mostrava 0 mesmo com notas presentes: query do calendário usava `origem='sefaz_nfe'` apenas; `getDocumentosMes` usava `OR origem='xml_upload'`. Fix: alinhar filtros em `contabilidade.ts`. (2) Import XML NFS-e Nacional SPED: chave tem 50 dígitos (não 44). Check `!==44` rejeitava todas → fix: `<15`. Suporte a wrappers `nfseProc`/`compNfse`. (3) Toast exibe texto do primeiro erro. Arquivos: `contabilidade.ts`, `sefaz.ts`, `FinanceiroNotasFiscais.tsx`. Detalhe: `shared/changelog.ts`.

- **Rev. 3724** — **NF-e RECEBIDAS · VISUALIZADOR DANFE EMBUTIDO — BOTÃO "VER DANFE" NO DIALOG. BACKEND ADITIVO + FRONTEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Rota `GET /api/fiscal-notes/:id/danfe` gera HTML DANFE server-side do `xml_payload` (emitente/dest/itens/impostos/protocolo); fallback sem XML. Dialog 5xl com iframe. Botão "Ver DANFE" (azul) + "Abrir em nova aba / Imprimir". Arquivo: `server/routers/danfeRoute.ts` + `FinanceiroNotasFiscais.tsx`. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3723** — **CONTABILIDADE · TABELA EXTRATO — COLUNA "VALOR" → ENTRADA | SAÍDA | SALDO ACUMULADO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3722** — **PLANILHA CONTABILIDADE · BUGFIX DATA "Fri Jan 02" → "02/01/2026" + JOIN DUPLO NF. BACKEND PONTUAL · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3721** — **IMPORT XML · SUPORTE A NFS-e NACIONAL SPED (Portal Nacional sped.fazenda.gov.br). BACKEND PONTUAL · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3720** — **INTEGRAÇÃO OMIE · IMPORTAÇÃO NF-e RECEBIDAS COM TOGGLE HABILITAR/DESABILITAR. BACKEND ADITIVO + SCHEMA + FRONTEND · ZERO ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3719** — **CONTABILIDADE · PAINEL DE DOCUMENTOS COM ABAS ANTES DO DOWNLOAD. BACKEND ADITIVO + FRONTEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3717 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
