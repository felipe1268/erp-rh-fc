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

- **Rev. 3805** — **FINANCEIRO · DESPESAS FINANCEIRAS · REESTRUTURAÇÃO: (1) "JUROS RECEBIDOS" → "JUROS E MULTAS BANCÁRIAS" + RECLASSIFICADO DE receita_financeira PARA despesa_financeira (R$13.072 ERA DESPESA, NÃO RECEITA); (2) "TARIFAS E TAXAS BANCÁRIAS" (82, 55 ENTRIES) UNIFICADA EM "DESPESAS BANCÁRIAS" (279), CONTA 82 DESATIVADA; (3) "MÚTUOS INTERCOMPANY" (493) TIRADO DE despesa_financeira → outro (R$60.000 É ATIVO, NÃO DESPESA); (4) "INVESTIMENTOS FINANCEIROS" (421) → outro (APLICAÇÕES/CONSÓRCIO/TÍTULO NÃO SÃO DESPESAS). 42 ZEROS DELETADOS.** Detalhe: `shared/changelog.ts`.

- **Rev. 3804** — **FINANCEIRO · CONCILIAÇÃO · DEDUP CROSS-CONTA NO IMPORT DE EXTRATO: DEDUP SECUNDÁRIO POR Doc/E-CODE AGORA BUSCA EM TODA A EMPRESA (SEM FILTRO conta_bancaria_id), BLOQUEANDO O MESMO LANÇAMENTO SER IMPORTADO EM CONTA DIFERENTE. FIX EM 2 PONTOS (importarExtrato + insertBankStatementBatch). TAMBÉM: 13 ENTRIES ZERADOS FOLHA JAN/2026 DELETADOS; CONSIGNADO FUNCIONÁRIOS RECLASSIFICADO DE DESPESAS FINANCEIRAS → FOLHA DE PAGAMENTO; CONTAS 26+288 UNIFICADAS EM 259 (SEGURANÇA E MONITORAMENTO); 9 ENTRIES "SEM CATEGORIA" JAN/2026 CATEGORIZADOS. 100% BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3803** — **FINANCEIRO · PLANO DE CONTAS · DEDUP POR SIMILARIDADE: _normalizeAccountName() NORMALIZA ACENTOS+PREPOSIÇÕES+ESPAÇOS; createAccount BLOQUEIA CRIAÇÃO SE NOME NORMALIZADO JÁ EXISTE ("Seguro Veículos" == "SEGURO DE VEÍCULOS"). TAMBÉM: CONTAS 411 "Seguro Veículos" UNIFICADA EM 443 "SEGURO DE VEÍCULOS" (33 ENTRIES MIGRADAS, conta 411 DESATIVADA). 100% BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3802** — **FINANCEIRO · CONCILIAÇÃO · FIX DEDUP DE IMPORTAÇÃO DE EXTRATO: DEDUP SECUNDÁRIO POR ID DE TRANSAÇÃO (E003.../Doc NNNNNN) EVITA DUPLICATAS QUANDO MESMO EXTRATO É IMPORTADO EM FORMATOS DIFERENTES (PDF CURTO vs OFX LONGO). TAMBÉM: ENTRY 885425 PIX AHMAD R$300 CATEGORIZADO EM MONITORAMENTO E SEGURANÇA; LINHAS FANTASMAS 2415+12135 DELETADAS; 5 ENTRIES CAMERAS R$0 (IDs 865959/865960/866096/866106/866120) DELETADOS. 100% BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3801** — **FINANCEIRO · CONCILIAÇÃO · REMOÇÃO DE LANÇAMENTO DUPLICADO (BUG IMPORTAÇÃO): FERRI LORIGGIO R$5.769,60/14-01-2026 EXISTIA EM CAIXA JF (CORRETO) E CAIXA FC APARECIDA (ERRÔNEO). ENTRY 885854 DELETADA; EXTRATO 13062 DELETADO. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3800** — **FINANCEIRO · DRE · UNIFICAÇÃO "MONITORAMENTO VEICULAR" (id=38) → "LICENÇAS E ASSINATURAS DE SOFTWARE" (id=71): INFLEET É LICENÇA DE SOFTWARE. ENTRY 886027 R$1.020,60 MOVIDO; CONTA 38 DESATIVADA. UPDATE EM financial_entries + financial_accounts · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3799** — **FINANCEIRO · DRE · CONSOLIDAÇÃO ZOOP BRASIL → VALE ALIMENTAÇÃO: "BENEFÍCIOS - OBRA" (id=379) 2 LANÇAMENTOS ZOOP. DUPLICATA R$7.969 DELETADA; PIX R$1.361,50 MOVIDO; CONTA 379 DESATIVADA. DELETE + UPDATE · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3798** — **FINANCEIRO · DRE · RECLASSIFICAÇÃO "SERVIÇOS DE CARTÓRIO" (id=290): HERDAVA despesa_fixa DO PAI; É DESPESA EVENTUAL (PROTESTO). classificacao_dre='despesa_variavel' QUEBRA A HERANÇA. UPDATE EM financial_accounts · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3797** — **FINANCEIRO · DRE · UNIFICAÇÃO DE CONTAS DE SOFTWARE: 4 CONTAS REDUNDANTES UNIFICADAS EM "LICENÇAS E ASSINATURAS DE SOFTWARE" (id=71). 9 ENTRIES MIGRADAS. CONTAS 235, 272 e 309 DESATIVADAS. UPDATE EM financial_accounts + financial_entries · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3762 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
