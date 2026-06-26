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

- **Rev. 3744** — **NF-e RECEBIDAS · SEFAZ AUTO-SYNC — "O CRONÔMETRO ZERA MAS NÃO SINCRONIZA": ALINHADAS AS 4 FÓRMULAS DE GATE (CLIENTE, AUTO-DISPARO, CRON, DIAGNÓSTICO) AO GATE REAL DO BACKEND (`intervalo*60 + 3` ×backoff). AGORA, AO RENOVAR A COTA/INTERVALO CONFIGURADO, O ERP EFETIVAMENTE CONSULTA A SEFAZ. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Havia 4 fórmulas de gate inconsistentes; só o gate de `executarSyncNFe` (`cooldownMin = intervaloHoras*60 + 3` ×backoff 1/2/4) é autoritativo. O cronômetro/auto-disparo do cliente usava `*60 - 2`, a seleção do cron `*60 - 8` (sem backoff) e o diagnóstico `*60 - 2` → todos disparavam ANTES do gate abrir. O auto-disparo batia no gate, era rejeitado (`aviso`, sem atualizar `last_sync_at`), e o guard `autoSyncFiredForTsRef` marcava a janela como já-disparada → nunca re-tentava ("zera mas não sincroniza"); o cron desperdiçava o 1º tick. Fix: alinhar TODAS ao gate real `intervalo*60 + 3` (cliente countdown+ring; cron seleção+diagnóstico+log de boot) + 3s de folga no countdown do cliente p/ absorver floor/jitter (nunca disparar ~1s antes do servidor). Backoff progressivo (Rev. 3738, anti-656) PRESERVADO. Arquivos: `server/routers/sefaz.ts`, `client/src/pages/financeiro/FinanceiroNotasFiscais.tsx`. Detalhe: `shared/changelog.ts`.

- **Rev. 3743** — **CONTAS A PAGAR & A RECEBER (TÍTULOS) — BAIXA PARCIAL COM HISTÓRICO: PAGAR/RECEBER UM TÍTULO EM VÁRIAS PARCELAS (DATAS/CONTAS DIFERENTES), VER SALDO EM ABERTO + BADGE "PARCIAL", ESTORNAR CADA BAIXA, E "QUITAR SALDO" MANUAL (OPÇÃO C). SCHEMA ADITIVO (1 TABELA NOVA) · ZERO ALTER DESTRUTIVO/DROP/DELETE.** Nova tabela aditiva `financial_entry_baixas` = histórico (1 linha/baixa, ambos os tipos; estorno soft via `estornada_em`). `valor_realizado` do entry vira ROLLUP = SUM(baixas ativas), recalculado pelo helper `_aplicarRollupBaixas` a cada baixa/estorno — decide status (receita → `recebido_parcial`/`recebido`; despesa MANTÉM `a_pagar` no parcial → `pago` ao fechar, zero status novo) e `data_pagamento`. Quitado por `forceQuit` (baixa `quitou_total=1`) ou `acumulado+0.005≥previsto`. Backend: `getEntryBaixas`, `registrarBaixa` (valor 0 só com `quitarTotal`; guards `_assertFinanceiroCompanyAccess`+`_assertContaBancariaPertenceEmpresa`; BACKFILL semeia "baixa anterior" p/ parciais legados sem histórico, evitando que o rollup zere o valor antigo), `estornarBaixaItem`. Self-heal `[SyncSchema+]` CREATE TABLE IF NOT EXISTS + índices. Front: diálogos de Pagar/Receber repontados p/ `registrarBaixa`, pré-preenchem saldo, mostram "já pago/saldo", listam histórico c/ estorno por baixa + botão "Quitar saldo"; lista ganha badge "Parcial"+saldo. Arquivos: `drizzle/schema.ts`, `server/_core/index.ts`, `server/routers/financial.ts`, `client/src/pages/financeiro/FinanceiroContasAPagar.tsx`, `.../FinanceiroContasAReceberTitulos.tsx`. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3742** — **CONCILIAÇÃO BANCÁRIA · CHEQUES DEVOLVIDOS — NOVO BOTÃO "DESCONSIDERAR DA CONCILIAÇÃO": TIRA O PAR DO CÁLCULO DO % SEM APAGAR O CHEQUE (P/ O % CHEGAR A 100% QUANDO O PAGAMENTO REAL FOI POR PIX/TED CONCILIADO EM OUTRA CONTA). REVERSÍVEL. SCHEMA ADITIVO (3 COLUNAS) · ZERO ALTER DESTRUTIVO/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3741** — **CONCILIAÇÃO · CAIXA INTERNO — NOVO LANÇAMENTO NÃO APARECIA NA LISTA SEM RECARREGAR A PÁGINA. AGORA A LISTA (A CONFIRMAR / CONFIRMADAS) ATUALIZA NA HORA. 100% FRONTEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3740** — **CONCILIAÇÃO · CAIXA INTERNO — COMBO DE OBRA NO "LANÇAR NO CONTAS A RECEBER" ESCONDIA A OBRA AO BUSCAR (FILTRO POR CLIENTE BLOQUEAVA OBRA DE OUTRO CLIENTE). AGORA, AO DIGITAR, BUSCA EM TODAS AS OBRAS. 100% FRONTEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3739** — **CONCILIAÇÃO · CAIXA INTERNO — FORNECEDOR DIGITADO MANUALMENTE (SEM CONFIRMAR NO DROPDOWN) AGORA SALVA. 100% FRONTEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3738** — **NF-e RECEBIDAS · SEFAZ — GATE DE COOLDOWN ACIMA DO LIMITE DE 2h (`cooldownMin = intervalo*60 + 3`) → FIM DO 656 INTERMITENTE POR CHAMADA CEDO DEMAIS. BACKEND PONTUAL · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3717 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
