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

- **Rev. 3738** — **NF-e RECEBIDAS · SEFAZ — GATE DE COOLDOWN AGORA FICA ACIMA DO LIMITE DE 2h (FIM DO 656 INTERMITENTE POR CHAMADA CEDO DEMAIS). BACKEND PONTUAL (1 LINHA + COMENTÁRIO) · ZERO SCHEMA/ALTER/DROP/DELETE.** Continuação da Rev. 3737: com o reset de boot removido (NSU já avançava 9627→9634), o Log AINDA mostrava Rate Limit em algumas rodadas. Causa: `cooldownMin = intervaloHoras*60 - 2` (118 min p/ 2h) + cron a cada 15 min podia disparar a chamada em ~1h58–2h00 (ABAIXO de 2h) → SEFAZ 656 (Consumo Indevido) → re-armava backoff (656 intermitente mesmo com NSU certo). A folga de -2 min empurrava a chamada para BAIXO do limite. Fix: `cooldownMin = intervaloHoras*60 + 3` → janela SEMPRE acima do intervalo (chamada efetiva ~2h03–2h15), espaçamento > 2h/CNPJ garantido. Gate de `executarSyncNFe` é autoridade única (cron/syncNow/backfill passam por ele). Arquivo: `server/routers/sefaz.ts`. Detalhe: `shared/changelog.ts`.

- **Rev. 3737** — **NF-e RECEBIDAS · SEFAZ — FIM DO LOOP ETERNO DE RATE-LIMIT (cStat=656). REMOVIDO RESET DE NSU NO BOOT (Rev. 3596) QUE RE-ZERAVA O NSU BOM A CADA RESTART. BACKEND (1 BLOCO DE STARTUP REMOVIDO) · ZERO SCHEMA/ALTER/DROP/DELETE.** Sync "só dava erro": Log mostrava Rate Limit em quase toda rodada com NSU inicial=0; Neon confirmou `ultimo_nsu=0` + `last_sync_result=NULL`. Causa: bloco `[SyncSchema+]` da Rev. 3596 rodava a CADA boot zerando `ultimo_nsu` de toda empresa com `nsuSalvo!=null` E `importadas=0` — premissa OBSOLETA, pois esse é o estado CORRETO após `cStat=656` (a SEFAZ devolve o ultNSU de retomada e importadas=0 é normal). Resultado: NSU bom → reset p/ 0 no boot → SEFAZ 656 de novo → loop infinito. Fix: removido o bloco de reset (substituído por comentário); nada mais zera o NSU no boot; o `ultimo_nsu=0` atual se auto-corrige com segurança na próxima sync (656 traz o ponto de retomada, que agora persiste). Empresa-piloto teve `ultimo_nsu` ajustado p/ `MAX(fiscal_notes.nsu_sefaz)`=9627 (retomada segura). Arquivo: `server/_core/index.ts`. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3736** — **CONCILIAÇÃO BANCÁRIA · SUGESTÃO — CHEQUES/BOLETOS AGORA BUSCAM LANÇAMENTOS DE OUTROS MESES + CASAMENTO PELO Nº DO CHEQUE. BACKEND READ-ONLY (`sugerirConciliacao`) · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3735** — **CONCILIAÇÃO · CAIXA INTERNO — ALERTA DE DUPLICIDADE NO "NOVO LANÇAMENTO" + BOTÃO EXCLUIR NAS LINHAS. BACKEND ADITIVO (1 QUERY READ-ONLY) + FRONTEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3734** — **NF-e RECEBIDAS · CRONÔMETRO SEFAZ AGORA DISPARA A SYNC AO ZERAR (ANTES ERA SÓ VISUAL). 100% FRONTEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3733** — **PACOTE CONTADOR · XLSX EXTRATO (BANCÁRIO + CARTÃO) — IDENTIDADE VISUAL FC (AZUL-MARINHO + DOURADO) + LAYOUT DE APRESENTAÇÃO. 100% FORMATAÇÃO · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3732** — **PACOTE CONTADOR · EXTRATO CARTÃO DE CRÉDITO — XLSX PRONUS (UMA ABA/FATURA) COM DADOS REAIS DE financial_cartao_*. BACKEND PONTUAL · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3717 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
