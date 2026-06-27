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

- **Rev. 3756** — **DASHBOARD · NOTAS FISCAIS (DashNotasFiscais) · NOVO CARD "MOVIMENTOS COM NOTA × SEM NOTA": COMPARATIVO VISUAL E DIRETO EM R$ — QUANTO DAS ENTRADAS E SAÍDAS BANCÁRIAS TEM NOTA FISCAL IDENTIFICADA (VINCULADA VIA `stmt_line_id`/`fn_id`) VS QUANTO É NÃO IDENTIFICÁVEL. FEATURE · 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Pedido do usuário (X com nota × Y sem nota, em R$). Card inserido após "Saúde Fiscal" (antes do gráfico Entradas×Saídas), usando os arrays já retornados por `getPanoramaFiscal` (`entradasComNota`/`entradasSemNota`/`saidasComNota`/`saidasSemNota`) + helper `sumB`. Header com % "Identificado" + 2 grandes totais COM (verde) × SEM (vermelho) em R$/qtd/%; 2 barras horizontais empilhadas (Entradas/Saídas) com rótulo in-bar (≥16%) e linha de detalhe; cada segmento é `<button>` que abre `DetailDialog` (2 novos: `saidasComNota`/`entradasComNota`; "sem nota" reusa diálogos existentes). Respeita seletor de mês white-card (`data`+`periodoLabel`). `tsc` limpo (filtrado) + esbuild fresh; HTTP 200. Arquivo: `client/src/pages/financeiro/dashboards/DashNotasFiscais.tsx`. Detalhe: `shared/changelog.ts`.

- **Rev. 3755** — **DASHBOARD · CONCILIAÇÃO BANCÁRIA · NOVO FILTRO "MÊS A MÊS": SELETOR DE PERÍODO WHITE-CARD (PADRÃO PERÍODO DO DashNotasFiscais) COM CHIPS "TUDO" + JAN…DEZ E DOT VERDE/CINZA "COM DADOS / SEM DADOS". SELECIONAR UM MÊS ESCOPA TODO O DASHBOARD (KPIs, RANKINGS, CATEGORIAS, OBRAS, STATUS POR CONTA, DIÁLOGOS); "TUDO" = ANO INTEIRO. OS GRÁFICOS MENSAIS (ENTRADAS×SAÍDAS, %CONCILIADO, SALDO ACUMULADO, COMPARATIVO ANO×ANO) SEGUEM YEAR-WIDE POR DESIGN. FEATURE · ZERO SCHEMA/ALTER/DROP/DELETE.** Regra de ouro respeitada: período = white-card; DashHeader gradiente só p/ o ano. Backend (`getConciliacaoDashExtra`): input ganhou `mes` (`z.int().min(0).max(12).optional()`, 0=ano todo); helper `periodo(expr)` monta `EXTRACT(YEAR)=yr` + opcional `AND EXTRACT(MONTH)=mo`; 5 queries month-scoped inline-adas (`cid`+`periodo`, params `[]`), `porContaMes` mantida year-wide. O inline também repara bug latente Rev. 3714 (UNION recebia `$N` repetido → 2ª metade NULL via binding posicional do `dbExecute`). Frontend: `mes` state + `dataInicio/dataFim/periodoLabel` derivados; memo `mesesComDados` (Set de meses com `valorTotal>0` do resumo mensal) p/ os dots; white-card PERÍODO; subtitles month-scoped → `periodoLabel`, charts mensais mantêm `${ano}`. `tsc` limpo; HTTP 200; architect PASS. Arquivos: `server/routers/financial.ts`, `client/src/pages/financeiro/dashboards/DashConciliacao.tsx`. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3754** — **AUDIT LOG · CONTINUAÇÃO DO Rev. 3753 NOS DEMAIS CALL-SITES: 11 CHAMADAS `createAuditLog(db, {...})` (2 ARGS) EM `financial.ts` (7) E `heSolicitacoes.ts` (4) PASSAVAM O `db` COMO `data`, DESCARTANDO O PAYLOAD E ENGOLINDO O INSERT NO try/catch → O LOG DE AUDITORIA NUNCA ERA GRAVADO (A FEATURE SEGUIA OK). PADRONIZADAS P/ `createAuditLog({...})` (1 ARG, ASSINATURA REAL EM `server/db.ts`, QUE OBTÉM O `db` INTERNAMENTE). 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3753** — **CONCILIAÇÃO BANCÁRIA · "ERRO AO DESCONSIDERAR" NUM CHEQUE DEVOLVIDO MOSTRAVA "Unexpected end of JSON input" (CORPO VAZIO = QUEDA DE TRANSPORTE), MESMO COM A ALTERAÇÃO POSSIVELMENTE APLICADA; E O AUDIT LOG DE DESCONSIDERAR/RECONSIDERAR NUNCA ERA GRAVADO. FIX: BACKEND `createAuditLog({...})` (1 ARG) NAS 2 MUTATIONS; FRONTEND — COMO SÃO IDEMPOTENTES, `onError` DISTINGUE QUEDA DE TRANSPORTE (RECARREGA + AVISO "CONEXÃO INSTÁVEL") DE ERRO DE NEGÓCIO. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3752** — **CONCILIAÇÃO BANCÁRIA · OS DIÁLOGOS "CONCILIAR PIX NO EXTRATO" E "TROCAR LANÇAMENTO VINCULADO" SÓ BUSCAVAM EM `financial_entries` — CHEQUES QUE EXISTEM SÓ NO CONTROLE DE CHEQUES (`financial_cheques`), SEM LANÇAMENTO DE DESPESA, NÃO APARECIAM COMO CANDIDATOS. AGORA OS 2 DIÁLOGOS INCLUEM OS CHEQUES PENDENTES NA BUSCA, MOSTRAM O Nº DO CHEQUE/DOC EM CADA CANDIDATO, E (OPÇÃO A) SELECIONAR UM CHEQUE SEM LANÇAMENTO + "CONCILIAR AGORA" CRIA DESPESA (PAGO) + CONCILIA A LINHA + BAIXA O CHEQUE, ATÔMICO. SCHEMA-NEUTRO · ZERO ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3751** — **CONCILIAÇÃO BANCÁRIA · "JÁ CONCILIEI O CHEQUE E AO RECARREGAR A PÁGINA ELE VOLTA": A LINHA SUMIA AO CLICAR EM "CONCILIAR SELECIONADAS" MAS REAPARECIA NO RELOAD (EX.: DOC 001052, −R$ 1.500,00, BRAVO LOCAÇÕES). CAUSA: SUCESSO-FALSO NO FRONTEND (ESCONDIA TODOS OS SELECIONADOS INDEP. DO QUE O BACKEND GRAVOU) + BACKEND SÓ DEVOLVIA A CONTAGEM. AGORA O BACKEND RETORNA AS LINHAS REALMENTE GRAVADAS E O FRONTEND ESCONDE SÓ ESSAS + REANALISA AS QUE FALHARAM. 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3750** — **CONCILIAÇÃO BANCÁRIA · "VINCULAR CHEQUE DEVOLVIDO A PIX/TED" (Rev. 3747): CHEQUE COM VÍNCULO ATIVO MOSTRAVA "VINCULADO R$ 0,00"/SALDO CHEIO E A SEÇÃO "VÍNCULOS REGISTRADOS" SUMIA (EX.: DOC 1063, PIER BRASIL, R$ 4.344,60; VÍNCULO REAL R$ 3.212,92). CAUSA: COBERTURA ANCORADA NO `debito_line_id` VOLÁTIL (RE-IMPORT RECRIA LINHAS); AGORA CASA PELA IDENTIDADE DO CHEQUE (valor + doc/nº). 100% BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3745 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
