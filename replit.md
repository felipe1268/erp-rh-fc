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

- **Rev. 3853** — **HOTFIX · `autoVincularNfService`: `column "tomador_nome" does not exist`.** 3 queries corrigidas para `tomador_razao_social AS tomador_nome` (emitidas em autoVincular, obterSugestoes, sincronizar). ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3852** — **PANORAMA FISCAL · CHEQUE DEVOLVIDO EXCLUÍDO DAS "SAÍDAS SEM NF-e".** `getPanorama`: SQL + `desconsiderado_em IS NULL`; regex `_PANORAMA_INTERNO_RE` (cheque devol, tarifas, TED/PIX próprio, etc.) → `bankDebitosReais` para `saidasSemNota`, `saidasBancarias` e `coberturaSaidaNfe`. `saidasInternas` retornado como campo informativo. ZERO DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3851** — **NF-e × EXTRATO · CARD DE VÍNCULO + SCORING DEFINITIVO COM valor_bruto E CNPJ-RAIZ.** `calcScore` recebe `fnValorBruto` (melhor de líquido vs bruto) + CNPJ-raiz +25 pts + patamar ≤2% +22 pts. Pré-filtro duplo (líquido OR bruto ≤15%) em todas as 3 funções. `fiscalNotes.list` e `sefaz.listNFeRecebidas` enricidos com batch-fetch de `bank_statement_lines` → `stmtLine:{descricao,valor,data}`. VÍNCULOS (emitidas e recebidas): card violeta com descrição+valor+data quando vinculado. ZERO DELETE. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3850** — **NF-e × EXTRATO · DIALOG "REVISAR SUGESTÕES":** `obterSugestoesPeriodo`, endpoint `fiscalNotes.obterSugestoes`, dialog max-w-4xl badge Alta/Média/Baixa, [Vincular]/[Ignorar] por linha, "Vincular todas de Alta Confiança". ZERO DELETE.

- **Rev. 3849** — **NF-e × EXTRATO · VÍNCULO AUTOMÁTICO MELHORADO:** `extractTokens()`, `calcScore()` (0-100), `sincronizarNfsPeriodo` (greedy bipartite). Botão "Vincular Automaticamente". ZERO DELETE.

- **Rev. 3848** — **CONCILIAÇÃO · CHEQUE DEVOLVIDO = MOVIMENTAÇÃO, NÃO ENTRADA.** Padrões `"cheque devol"` e `"dev.*cheq"` em `_INTERNO_PATTERNS`. ZERO DELETE.

- **Rev. 3847** — **TEMPLATE XLSX · SAVE CORRIGIDO + "APROVADO POR" AUTOMÁTICO + LISTA COMPLETA DE RELATÓRIOS.** `XlsxTemplateTab.tsx`, `Configuracoes.tsx`. ZERO DELETE.

- **Rev. 3846** — **CONFIGURAÇÕES · NOTIFICAÇÕES E-MAIL UNIFICADAS COM SUBCATEGORIAS.** Os dois tabs fundidos num tab com seletor [RH] | [Contabilidade] via `NOTIF_SUBCATS`. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3838 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
