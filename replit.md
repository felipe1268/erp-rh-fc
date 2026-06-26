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

- **Rev. 3741** — **CONCILIAÇÃO · CAIXA INTERNO — NOVO LANÇAMENTO NÃO APARECIA NA LISTA SEM RECARREGAR A PÁGINA. AGORA A LISTA (A CONFIRMAR / CONFIRMADAS) ATUALIZA NA HORA. 100% FRONTEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Ao criar um lançamento ("Novo lançamento") no Caixa Interno, ele só aparecia após F5. Causa: a lista do Caixa Interno vem de `getEntradasCaixaInterno` (`caixaData`/`refetchCaixa`), mas o `submitLancar` só chamava `setReportStale(true)` (que, por design Rev. 3478, apenas marca o RELATÓRIO como desatualizado sem refazer fetch) e limpava o form — nunca `refetchCaixa()`. Fix: ao final do caminho de sucesso do `submitLancar` (ramos ENTRADA→Receber e SAÍDA→Pagar), após `setLancStatement(null)`, chama `refetchCaixa()` (no-op quando a query está desabilitada, então não afeta a conciliação com extrato). Sem TDZ (`submitLancar` é function declaration, roda só no clique). Arquivo: `client/src/pages/financeiro/FinanceiroConciliacao.tsx`. Detalhe: `shared/changelog.ts`.

- **Rev. 3740** — **CONCILIAÇÃO · CAIXA INTERNO — COMBO DE OBRA NO "LANÇAR NO CONTAS A RECEBER" ESCONDIA A OBRA AO BUSCAR (FILTRO POR CLIENTE BLOQUEAVA OBRA DE OUTRO CLIENTE). AGORA, AO DIGITAR, BUSCA EM TODAS AS OBRAS. 100% FRONTEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Com cliente "Qiu Xianquan" selecionado, a obra "Hotel Qiu" não aparecia ao digitar "hotel". Causa: `obrasParaLanc` filtra as obras pelo cliente (texto `obras.cliente` + junction `obra_clientes`); como ~28 obras estão SEM cliente cadastrado, `cnNorm.includes("")` (string vazia) faz TODAS casarem → `merged` não-vazio → o fallback "mostra todas" NUNCA dispara; e "Hotel Qiu" (vinculada ao cliente "HOTEL J Q LTDA", diferente do selecionado) ficava fora por design. Fix: quando o usuário ESTÁ DIGITANDO no campo de obra (`lancObraDisplay` não-vazio), `obrasParaLanc` retorna TODAS as obras — o filtro por cliente vale só como sugestão inicial (campo vazio). `lancObraDisplay` movido p/ antes do useMemo (evita TDZ) + deps. Label → "sugerido por cliente · digite p/ buscar todas". Arquivo: `client/src/pages/financeiro/FinanceiroConciliacao.tsx`. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3739** — **CONCILIAÇÃO · CAIXA INTERNO — FORNECEDOR DIGITADO MANUALMENTE (SEM CONFIRMAR NO DROPDOWN) AGORA SALVA. 100% FRONTEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3738** — **NF-e RECEBIDAS · SEFAZ — GATE DE COOLDOWN ACIMA DO LIMITE DE 2h (`cooldownMin = intervalo*60 + 3`) → FIM DO 656 INTERMITENTE POR CHAMADA CEDO DEMAIS. BACKEND PONTUAL · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3737** — **NF-e RECEBIDAS · SEFAZ — FIM DO LOOP ETERNO DE RATE-LIMIT (cStat=656): REMOVIDO RESET DE NSU NO BOOT (Rev. 3596) QUE RE-ZERAVA O NSU BOM A CADA RESTART. BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3736** — **CONCILIAÇÃO BANCÁRIA · SUGESTÃO — CHEQUES/BOLETOS AGORA BUSCAM LANÇAMENTOS DE OUTROS MESES + CASAMENTO PELO Nº DO CHEQUE. BACKEND READ-ONLY (`sugerirConciliacao`) · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3735** — **CONCILIAÇÃO · CAIXA INTERNO — ALERTA DE DUPLICIDADE NO "NOVO LANÇAMENTO" + BOTÃO EXCLUIR NAS LINHAS. BACKEND ADITIVO (1 QUERY READ-ONLY) + FRONTEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3717 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
