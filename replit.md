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

- **Rev. 3746** — **CONCILIAÇÃO BANCÁRIA · 2 BUGS APÓS VINCULAR CONTA NO RECEBIMENTO: (1) LANÇAMENTO RECEBIDO/BAIXADO COM CONTA INFORMADA CONTINUAVA EM "SEM CONTA BANCÁRIA DEFINIDA" — O ROLLUP DA BAIXA NÃO PROPAGAVA A CONTA PRO ENTRY; (2) "CONFIRMAR" NA CONCILIAÇÃO SEM-CONTA QUEBRAVA COM `42703 column "company_id" does not exist` (A COLUNA É `company_bank_accounts."companyId"`, camelCase). 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** O piloto FC corrigiu 3 recebimentos (Projeto Sr. Julio R$24.370, Medição R$208.089,23, LUCIANA R$100.000) ajustando datas e vinculando a conta CAIXA INTERNO ADM (id=22) via "Registrar recebimento", mas os três seguiam em "Sem conta definida" e "Confirmar" estourava erro. BUG #1: `registrarBaixa` grava `conta_bancaria_id` só em `financial_entry_baixas`; o rollup `_aplicarRollupBaixas` atualizava valor/status/data mas NUNCA a conta do entry → ficava NULL. Fix: o rollup busca a conta da última baixa ativa (`ORDER BY data DESC, id DESC LIMIT 1`) e faz `conta_bancaria_id = COALESCE(<baixa>, conta_bancaria_id)` (nunca sobrescreve com NULL) + backfill dos 3 entries. BUG #2: `conciliarSemContaComExtrato` validava a conta caixa com `company_id=$2`, mas `company_bank_accounts` é camelCase → 42703 (única ref errada do arquivo). Fix: `"companyId"=$2`. Arquivo: `server/routers/financial.ts`. Detalhe: `shared/changelog.ts`.

- **Rev. 3745** — **NF-e RECEBIDAS · SEFAZ AUTO-SYNC — CAUSA-RAIZ REAL DO "ZERA MAS NÃO SINCRONIZA" / "AGUARDE +413 MIN" COM O ANEL EM ~4H: O GATE CALCULAVA `elapsed` EM JS SOBRE `last_sync_at` (`timestamp without time zone`, GRAVA UTC) COM O PROCESSO EM `TZ=America/Sao_Paulo` → node-pg LIA 3H ADIANTADO → `elapsed` NEGATIVO → ESPERA INFLADA ~180 MIN, REJEITANDO MANUAL **E** CRON POR 3H A MAIS. AGORA `elapsed` VEM DO SQL (`EXTRACT(EPOCH FROM NOW()-MAX(last_sync_at))`), TZ-SAFE. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Sintoma pós-3744: toast "aguarde mais 413 min" enquanto o anel mostrava "3h 52min" — divergência de ~180 min = offset BRT↔UTC. O gate autoritativo de `executarSyncNFe` comparava `Date.now()` (UTC) com `new Date(ts.last_sync_at)`; como a coluna é `timestamp without time zone` (grava UTC, sessão GMT) e o processo força `TZ=America/Sao_Paulo` (`server/_core/index.ts`), o node-pg parseava o valor na TZ local (BRT) → Date 3h adiantado → `elapsedMs ≈ −167 min` → `restante = 246 − (−167) = 413`. O cron SELECIONAVA certo (SQL puro), mas o gate JS rejeitava por 3h. Fix: a query do gate retorna `EXTRACT(EPOCH FROM (NOW()-MAX(last_sync_at))) AS elapsed_sec` e o código usa `elapsedMs = max(0, elapsed_sec*1000)`. Validado no Neon sob BRT: antigo 405 min (bug) → novo 225 min (anel). Backoff (3738) e fórmulas (3744) PRESERVADOS. Arquivo: `server/routers/sefaz.ts`. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3744** — **NF-e RECEBIDAS · SEFAZ AUTO-SYNC — "O CRONÔMETRO ZERA MAS NÃO SINCRONIZA": ALINHADAS AS 4 FÓRMULAS DE GATE (CLIENTE, AUTO-DISPARO, CRON, DIAGNÓSTICO) AO GATE REAL DO BACKEND (`intervalo*60 + 3` ×backoff). AGORA, AO RENOVAR A COTA/INTERVALO CONFIGURADO, O ERP EFETIVAMENTE CONSULTA A SEFAZ. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3743** — **CONTAS A PAGAR & A RECEBER (TÍTULOS) — BAIXA PARCIAL COM HISTÓRICO: VÁRIAS PARCELAS POR TÍTULO (DATAS/CONTAS DIFERENTES), SALDO EM ABERTO + BADGE "PARCIAL", ESTORNO POR BAIXA, "QUITAR SALDO" MANUAL. SCHEMA ADITIVO (1 TABELA NOVA) · ZERO ALTER DESTRUTIVO/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3742** — **CONCILIAÇÃO BANCÁRIA · CHEQUES DEVOLVIDOS — NOVO BOTÃO "DESCONSIDERAR DA CONCILIAÇÃO": TIRA O PAR DO CÁLCULO DO % SEM APAGAR O CHEQUE (P/ O % CHEGAR A 100% QUANDO O PAGAMENTO REAL FOI POR PIX/TED CONCILIADO EM OUTRA CONTA). REVERSÍVEL. SCHEMA ADITIVO (3 COLUNAS) · ZERO ALTER DESTRUTIVO/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3741** — **CONCILIAÇÃO · CAIXA INTERNO — NOVO LANÇAMENTO NÃO APARECIA NA LISTA SEM RECARREGAR A PÁGINA. AGORA A LISTA (A CONFIRMAR / CONFIRMADAS) ATUALIZA NA HORA. 100% FRONTEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3740** — **CONCILIAÇÃO · CAIXA INTERNO — COMBO DE OBRA NO "LANÇAR NO CONTAS A RECEBER" ESCONDIA A OBRA AO BUSCAR (FILTRO POR CLIENTE BLOQUEAVA OBRA DE OUTRO CLIENTE). AGORA, AO DIGITAR, BUSCA EM TODAS AS OBRAS. 100% FRONTEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3717 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
