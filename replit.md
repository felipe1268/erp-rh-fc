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

- **Rev. 3810** — **FINANCEIRO · DRE · ROTEAMENTO AUTOMÁTICO CDO vs. FOLHA — `importFolhaRHToFinancial`: REGRA: direto→conta 22 (CDO, variavel), indireta_obra→conta 21 (CDO, variavel), escritorio/NULL→conta 506 (fixo). PATH 1: folha_itens + JOIN job_functions + LATERAL manual_obra_assignments/time_records → agrupa por categoria_mo, até 3 entries/batch; obra primária = mais frequente no grupo; dedup por origemModulo (folha_rh_direto/indireta/adm)+lancId; fallback sem itens = legado conta 506. PATH 2: payroll table com JOIN employees+job_functions → mesma lógica por (tipoFolha, categoria_mo). CONSTANTE FOLHA_CATEGORIA_CONFIG + helper _folhaCatConfig. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3809** — **FINANCEIRO · DRE · ROTEAMENTO CDO vs. FOLHA — PILOTO JAN/2026: (1) JOB_FUNCTION COORDENADOR(A) DE PLANEJAMENTO (id=47) NULL→indireta_obra; (2) 33 PIX INDIVIDUAIS (R$54.651,50) MIGRADOS DE FOLHA (506) PARA CDO: 21 ENTRIES direto→MÃO DE OBRA DIRETA (id=22, R$27.385) + 12 ENTRIES indireta_obra→MÃO DE OBRA INDIRETA (id=21, R$27.266); (3) OBRA_ID ATRIBUÍDO A 14 ENTRIES VIA time_records; (4) 2 ENTRIES SEM MATCH (R$2.503) PERMANECEM EM 506. DIAGNÓSTICO COMPLETO: 93 DIRETO + 32 INDIRETA_OBRA + 0 ESCRITORIO_CENTRAL ATIVOS. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3808** — **FINANCEIRO · DRE · RECLASSIFICAÇÃO CONCEITUAL CDO (CPC 17 + CPC 33): (1) ALIMENTAÇÃO — IFood/Zoop (R$99.789+R$308) MIGRADOS DE ALIMENTAÇÃO-OBRA → VALE ALIMENTAÇÃO (id=265, Benefícios); (2) PENSÃO ALIMENTÍCIA (id=28) → FILHO DE FOLHA DE PAGAMENTO (id=506); (3) UNIFORME (id=35+232) custo_obra→despesa_variavel (R$26.346 SAEM DO CDO); (4) 12 ENTRIES conta_nome DESYNC CORRIGIDOS; (5) 4 CONTAS DUPLICADAS/VAZIAS DESATIVADAS (285,385,304,438); ENTRY 438→224. CDO CAI ~R$131.000. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3807** — **FINANCEIRO · PLANO DE CONTAS · REESTRUTURAÇÃO DESPESAS FINANCEIRAS (PARTE 2 — CONFORME CPC/NBC TG): (1) 20 ENTRIES 37→389; CONTA 389 → "TÍTULOS DE CAPITALIZAÇÃO" (pai→80, despesa_financeira); CONTA 37 DESATIVADA; (2) CONTA 509 → "CONSÓRCIO VEICULAR" (pai→80, despesa_financeira); (3) CONTA 421 DESATIVADA (ficou vazia); (4) ORPHANS 81+87 CORRIGIDOS (pai NULL→80); (5) CONTA 493 → "ADIANTAMENTOS A PARTES RELACIONADAS" (mantém outro — CPC 05 R1: mútuo concedido é ativo, não despesa). ZERO SCHEMA/ALTER/DROP.** Detalhe: `shared/changelog.ts`.

- **Rev. 3806** — **FINANCEIRO · LIMPEZA GLOBAL DE ZEROS ABSOLUTOS: VARREDURA GLOBAL (8.759 entries zero) IDENTIFICOU 24 ABSOLUTAMENTE VAZIOS (realizado=0 E previsto=0); 8.735 ORÇAMENTOS LEGÍTIMOS (previsto>0) PRESERVADOS. 24 DELETADOS: 18×MÃO DE OBRA TERCEIRIZADA (CHLORUM/NOV-2024), 4×DESPESAS COM MATERIAIS (OC JUN-2026), 2×MATERIAIS PARA OBRA (PALES+UTC). ZERO SCHEMA/ALTER/DROP.** Detalhe: `shared/changelog.ts`.

- **Rev. 3805** — **FINANCEIRO · DESPESAS FINANCEIRAS · REESTRUTURAÇÃO: (1) "JUROS RECEBIDOS" → "JUROS E MULTAS BANCÁRIAS" + RECLASSIFICADO DE receita_financeira PARA despesa_financeira (R$13.072 ERA DESPESA, NÃO RECEITA); (2) "TARIFAS E TAXAS BANCÁRIAS" (82, 55 ENTRIES) UNIFICADA EM "DESPESAS BANCÁRIAS" (279), CONTA 82 DESATIVADA; (3) "MÚTUOS INTERCOMPANY" (493) TIRADO DE despesa_financeira → outro (R$60.000 É ATIVO, NÃO DESPESA); (4) "INVESTIMENTOS FINANCEIROS" (421) → outro (APLICAÇÕES/CONSÓRCIO/TÍTULO NÃO SÃO DESPESAS). 42 ZEROS DELETADOS.** Detalhe: `shared/changelog.ts`.

- **Rev. 3804** — **FINANCEIRO · CONCILIAÇÃO · DEDUP CROSS-CONTA NO IMPORT DE EXTRATO: DEDUP SECUNDÁRIO POR Doc/E-CODE AGORA BUSCA EM TODA A EMPRESA (SEM FILTRO conta_bancaria_id), BLOQUEANDO O MESMO LANÇAMENTO SER IMPORTADO EM CONTA DIFERENTE. FIX EM 2 PONTOS (importarExtrato + insertBankStatementBatch). TAMBÉM: 13 ENTRIES ZERADOS FOLHA JAN/2026 DELETADOS; CONSIGNADO FUNCIONÁRIOS RECLASSIFICADO DE DESPESAS FINANCEIRAS → FOLHA DE PAGAMENTO; CONTAS 26+288 UNIFICADAS EM 259 (SEGURANÇA E MONITORAMENTO); 9 ENTRIES "SEM CATEGORIA" JAN/2026 CATEGORIZADOS. 100% BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3802 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
