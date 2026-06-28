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

- **Rev. 3845** — **TEMPLATE FC XLSX · SERVIÇO COMPARTILHADO + ABA "TEMPLATE DE PLANILHA" EM CONFIGURAÇÕES.** Novo serviço `server/services/excelFcTemplate.ts`: `applyFcHeader(wb,ws,header,config)` aplica bloco logo+título (rows 1-8) idêntico ao Extrato Bancário; `applyFcColumnHeader` estiliza row 9 com cor configurável; `loadFcXlsxConfig` lê banco + cache 60s; `gerarExemploTemplate` gera XLSX de preview. Nova tabela `xlsx_template_config` (SyncSchema+ Rev.3845). 3 endpoints em `settings.*`: `getXlsxTemplateConfig`/`saveXlsxTemplateConfig`/`downloadXlsxTemplateExemplo`. `folhaPagamento.exportarCustosObra` migrado do header azul simples para o template FC completo. Nova aba "Template de Planilha" em Configurações (emerald, role=admin): paleta de cores, color picker, preview inline, dirty-check, download de exemplo. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3844** — **PANORAMA FISCAL · AUTO-VÍNCULO NF-e × EXTRATO BANCÁRIO APÓS CONCILIAÇÃO.** Novo serviço `autoVincularNfService.ts`: crédito → NFS-e emitida (valor ±2%, data ±60d, prefere CNPJ da descrição == tomador_cnpj); débito → NF-e recebida SEFAZ (exige CNPJ desc == emitente_cnpj + valor ±2%). Injetado em 3 pontos de `financial.ts` (`conciliarLancamento`, `conciliarGrupoLancamentos`, `conciliarSugestoes`) como fire-and-forget. Sem botão, sem interação do usuário. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3843** — **NF-E RECEBIDAS · BUGFIX: BOTÃO "MUDAR STATUS" NÃO ABRIA DIALOG.** `onClick` chamava estado das Emitidas; corrigido para `setBulkRecStatusOpen`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3841** — **CONFIG. SMTP VIA UI · ALTERAR E-MAIL E SENHA SEM EDITAR VARIÁVEL DE AMBIENTE.** Tab em Configurações (admin_master), smtp_config via SyncSchema+, smtpService lê DB primeiro. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3840** — **EXTRATO BANCÁRIO XLSX · REPLICAÇÃO 100% DO MODELO PLANILHA_MODELO_FC.** Colunas B–I, larguras/alturas/merges exatos, bordas medium, fórmula saldo, cond.format. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3839** — **NF-E RECEBIDAS · MUDAR STATUS EM LOTE.** Botão "Mudar Status" na seleção múltipla (reusa `fiscalNotes.bulkUpdateStatus`). ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3838** — **EXTRATO BANCÁRIO XLSX · FORMATAÇÃO CONDICIONAL NATIVA EXCEL NA COLUNA SALDO.** `ws.addConditionalFormatting()` verde/vermelho. ZERO DELETE. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3843** — **NF-E RECEBIDAS · BUGFIX: BOTÃO "MUDAR STATUS" NÃO ABRIA DIALOG.** `onClick` chamava estado das Emitidas; corrigido para `setBulkRecStatusOpen`. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3841** — **CONFIG. SMTP VIA UI · ALTERAR E-MAIL E SENHA SEM EDITAR VARIÁVEL DE AMBIENTE.** Tab em Configurações (admin_master), smtp_config via SyncSchema+, smtpService lê DB primeiro. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3840** — **EXTRATO BANCÁRIO XLSX · REPLICAÇÃO 100% DO MODELO PLANILHA_MODELO_FC.** Colunas B–I, larguras/alturas/merges exatos, bordas medium, fórmula saldo, cond.format. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3839** — **NF-E RECEBIDAS · MUDAR STATUS EM LOTE.** Botão "Mudar Status" na seleção múltipla (reusa `fiscalNotes.bulkUpdateStatus`). ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3834** — **EXTRATO BANCÁRIO XLSX: LOGO FC ENGENHARIA + CONTORNO EXTERNO (MEDIUM BORDER).** `getLogoBuffer` retorna `{buffer,extension}`; `applyTableBorders` medium outer + thin inner. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3829** — **EXTRATO BANCÁRIO XLSX: REESCRITA COMPLETA COM EXCELJS PARA IGUALAR TEMPLATE DA CONTABILIDADE.** ZERO DELETE. Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3823 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
