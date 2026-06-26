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

- **Rev. 3749** — **CONCILIAÇÃO BANCÁRIA · "CONCILIAR SELECIONADAS (N)" COM MAIS DE UM PAGAMENTO FALHAVA COM TOAST "ERRO AO CONCILIAR / Unexpected end of JSON input", APESAR DE O SERVIDOR TER GRAVADO (SUCESSO PARCIAL SILENCIOSO). CONCILIAR 1 FUNCIONAVA. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Causa: `conciliarSugestoes` iterava `input.pares` fazendo 2-3 round-trips ao banco POR PAR (reserva da linha + baixa do lançamento + undo), em série, antes de enviar o 1º byte; com vários cheques a latência crescia (~1.3s p/ 3 vs ~0.4s p/ 1, medido no Neon) e a resposta se perdia no proxy do preview (o backend completava e gravava → estado parcial que a UI nunca via). Fix: reescrito p/ UM ÚNICO statement set-based (CTE) via `db.$client.query` (raw pg — `dbExecute` liga params por ordem de aparição): `pares(VALUES)` → `elig` (só pares com AMBOS os lados livres, escopado por `company_id`) → `upd_l` (marca linha) + `upd_e` (baixa lançamento) → `count` do JOIN. Atômico (sem sucesso parcial), idempotente, 1 round-trip (~155ms validado no Neon em ROLLBACK). Conciliação segue SÓ SUGESTIVA. Arquivo: `server/routers/financial.ts`. Detalhe: `shared/changelog.ts`.

- **Rev. 3748** — **CONCILIAÇÃO BANCÁRIA · SUGESTÃO DE CHEQUE CRUZAVA O CHEQUE ERRADO QUANDO HÁ DOIS DO MESMO FORNECEDOR/VALOR/DATA (EX.: JEFCAR Nº 902 × 903, AMBOS R$2.050 EM 06/01): A LINHA DO 903 NO EXTRATO CASAVA COM O LANÇAMENTO DO 902. AGORA A TRAVA "NÚMERO DIFERENTE ⇒ NÃO É O MESMO CHEQUE" TAMBÉM LÊ O Nº ESTRUTURADO DO LANÇAMENTO (`cheque_numero`/`comprovante_documento`), NÃO SÓ O TEXTO DA DESCRIÇÃO. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Em `getConciliacaoSugestoes`, o gate de cheque/boleto já descartava pares com números divergentes, mas extraía o nº do lançamento (`eNum`) só do TEXTO da descrição; quando o número mora no campo estruturado (`cheque_numero`/`comprovante_documento` "Doc 000902"), `eNum` ficava NULL, a trava não disparava e o lançamento virava candidato de qualquer linha de mesmo valor/data → com 902/903 idênticos (R$2.050, 06/01) a linha do 903 ficava ambígua (55%) e o greedy pegava o 902. Fix: SELECT passou a trazer `cheque_numero AS "chequeNumero"`; novo helper `extrairNumEstruturado` usado como fallback de `eNum` (prioriza `cheque_numero`; aceita `comprovante_documento` só se ≤8 dígitos — longo = CNPJ/CPF). Conciliação segue SÓ SUGESTIVA. Arquivo: `server/routers/financial.ts`. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3747** — **CONCILIAÇÃO BANCÁRIA · CHEQUES DEVOLVIDOS — VÍNCULO PIX/TED REFORMULADO: BOTÃO "VINCULAR PIX/TED" SEMPRE VISÍVEL, VARREDURA AUTOMÁTICA POR VALOR EXATO EM TODAS AS CONTAS, VÍNCULO PARCIAL 1→N PAGAMENTOS COM HISTÓRICO/ESTORNO POR VÍNCULO + "QUITAR SALDO". SCHEMA ADITIVO (1 TABELA NOVA) · ZERO ALTER DESTRUTIVO/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3746** — **CONCILIAÇÃO BANCÁRIA · 2 BUGS APÓS VINCULAR CONTA NO RECEBIMENTO: (1) LANÇAMENTO RECEBIDO/BAIXADO COM CONTA CONTINUAVA EM "SEM CONTA BANCÁRIA DEFINIDA" (ROLLUP DA BAIXA NÃO PROPAGAVA A CONTA PRO ENTRY); (2) "CONFIRMAR" NA CONCILIAÇÃO SEM-CONTA QUEBRAVA COM `42703 column "company_id" does not exist` (COLUNA É `company_bank_accounts."companyId"`, camelCase). 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3745** — **NF-e RECEBIDAS · SEFAZ AUTO-SYNC — CAUSA-RAIZ DO "ZERA MAS NÃO SINCRONIZA"/"AGUARDE +413 MIN": GATE CALCULAVA `elapsed` EM JS SOBRE `timestamp without time zone` (UTC) COM PROCESSO EM `TZ=America/Sao_Paulo` → 3H DE SKEW → ESPERA INFLADA. AGORA `elapsed` VEM DO SQL (`EXTRACT(EPOCH ...)`), TZ-SAFE. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3744** — **NF-e RECEBIDAS · SEFAZ AUTO-SYNC — "O CRONÔMETRO ZERA MAS NÃO SINCRONIZA": ALINHADAS AS 4 FÓRMULAS DE GATE (CLIENTE, AUTO-DISPARO, CRON, DIAGNÓSTICO) AO GATE REAL DO BACKEND (`intervalo*60 + 3` ×backoff). AGORA, AO RENOVAR A COTA/INTERVALO CONFIGURADO, O ERP EFETIVAMENTE CONSULTA A SEFAZ. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3743** — **CONTAS A PAGAR & A RECEBER (TÍTULOS) — BAIXA PARCIAL COM HISTÓRICO: VÁRIAS PARCELAS POR TÍTULO (DATAS/CONTAS DIFERENTES), SALDO EM ABERTO + BADGE "PARCIAL", ESTORNO POR BAIXA, "QUITAR SALDO" MANUAL. SCHEMA ADITIVO (1 TABELA NOVA) · ZERO ALTER DESTRUTIVO/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3740 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
