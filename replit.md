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

- **Rev. 3768** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · DIÁLOGOS "CONCILIAR PIX NO EXTRATO" E "TROCAR LANÇAMENTO VINCULADO" AGORA PRIORIZAM NO TOPO DA LISTA "CHEQUES DO CONTROLE DE CHEQUES (SEM LANÇAMENTO)" OS CHEQUES CUJO VALOR BATE COM O DA LINHA/PIX SENDO CONCILIADA. ANTES, FORNECEDOR COM CENTENAS DE CHEQUES (FERRAGENS SANTA RITA = 928) FAZIA O CHEQUE-ALVO CAIR FORA DO TETO DE 30 E SUMIR DA LISTA. BACKEND READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** Caso (Doc 860 · FERRAGENS SANTA RITA · R$ 7.852,16): cheque auto-detectado "Quitado por outro meio (PIX/TED)", elegível (conciliado=0, lancamento_id NULL), mas na posição 71 da ordenação por `data_compensacao DESC` → cortado pelo `limit: 30`; busca só por nome, ignorando valor. Backend (`getChequesParaConciliacao`): novo input `valorRef` opcional → prefixa ORDER BY com `CASE WHEN ABS(c.valor-$N)<0.015 THEN 0 ELSE 1 END` (cheques de valor igual no topo, dentro do limit); sem valorRef = inalterado; `dbExecute` liga por ORDEM DE APARIÇÃO → push do valorRef antes do limit. Frontend (`FinanceiroConciliacao.tsx`): "Conciliar PIX" manda valor do cheque, "Trocar lançamento" manda `extratoValor`. Regra de ouro preservada: só reordena (read-only), confirmação explícita continua no "⚡ Conciliar agora". Detalhe: `shared/changelog.ts`.

- **Rev. 3767** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · VÍNCULO DE CHEQUE DEVOLVIDO ↔ PIX/TED AGORA (a) APARECE DIRETO NA CONCILIAÇÃO (SELO "🔗 SUBSTITUI CHEQUE DEVOLVIDO DOC NNN · R$ X · VÍNCULO POR FULANO" NA LINHA DO EXTRATO) E (b) O CABEÇALHO DO DIÁLOGO "VINCULAR CHEQUE DEVOLVIDO" PARA DE MOSTRAR "VINCULADO R$ 0,00" QUANDO O VÍNCULO EXISTE MAS A LINHA DO CHEQUE TROCOU DE ID NUM RE-IMPORT. BACKEND READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** "Conciliado" (linha↔financial_entry) e "vínculo de cheque" (`bank_cheque_vinculos`) são processos independentes; o vínculo (criado depois da conciliação) ficava invisível na conciliação, mas o usuário verifica direto lá. Backend (`_computeConciliacaoReport`): carrega `bank_cheque_vinculos` ativos (pix_line_id NOT NULL) + descrição da linha de débito → `vincByPix` (Map pix→{doc,chequeNumero,valor,criadoPorNome,...}); `_enrichVinc` anexa `substituiChequeDevolvido` em `conciliados`+`extratoSemLancamento`. Frontend (`FinanceiroConciliacao.tsx`): selo na lista "Já conciliados"; no diálogo, `debId`/`info` viram `let` + fallback por IDENTIDADE (varre `vincMap` por `_idCents`+doc/nº quando a chave direta não cobre). Regra de ouro: read-only, nunca cria/altera linha. Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3766** — **FINANCEIRO · DASHBOARD · CONCILIAÇÃO BANCÁRIA · DRILL-DOWN POR ITEM ESPECÍFICO: CLICAR EM UMA FATIA/BARRA DE CATEGORIA (DESPESAS OU RECEITAS) OU EM UM ITEM DO RANKING ABRE OS LANÇAMENTOS INDIVIDUAIS DAQUELA CATEGORIA; CLICAR EM UMA BARRA DE OBRA OU ITEM DO RANKING DE OBRAS ABRE OS LANÇAMENTOS DA OBRA. 2 NOVOS ENDPOINTS BACKEND (READ-ONLY) + FRONTEND. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3765** — **FINANCEIRO · DASHBOARD · CONCILIAÇÃO BANCÁRIA · TODOS OS GRÁFICOS DA TELA GANHARAM DRILL-DOWN (CLIQUE): BARRAS DE MÊS NAVEGAM O SELETOR DE PERÍODO; CONTA BANCÁRIA/FORNECEDOR ABREM DIALOG COM OS LANÇAMENTOS FILTRADOS; CATEGORIA E OBRA ABREM A LISTA AGRUPADA; ITENS DOS TOPLISTCARDS TAMBÉM FICARAM CLICÁVEIS. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3764** — **FINANCEIRO · DASHBOARD · CONTROLE DE CHEQUES · GANHOU O FILTRO "MÊS A MÊS": SELETOR WHITE-CARD "PERÍODO" (CHIP "TUDO" + JAN…DEZ, DOT VERDE = COM DADOS / CINZA = SEM DADOS), IGUAL AO DA CONCILIAÇÃO BANCÁRIA (Rev. 3755). 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3763** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · CHEQUES DEVOLVIDOS QUE JÁ TIVERAM AS 2 LINHAS (COMPENSAÇÃO + DEVOLUÇÃO) CONCILIADAS VOLTAM A APARECER NO CARD "CHEQUES DEVOLVIDOS NO BANCO" — MARCADOS COMO "CONCILIADO NO EXTRATO" (RESOLVIDO). BACKEND READ-ONLY · NÃO ALTERA O CÁLCULO DO % · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3762** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · O CARD "CHEQUES DEVOLVIDOS NO BANCO" GANHOU O BOTÃO "OCULTAR RESOLVIDOS": ESCONDE DA TELA OS CHEQUES JÁ TRATADOS (QUITADO REAPRESENTADO / QUITADO POR OUTRO MEIO PIX-TED / QUITADO POR SUBSTITUIÇÃO / DESCONSIDERADO DO %), MOSTRANDO SÓ OS PENDENTES. NÃO APAGA NADA, NÃO MUDA O CONTADOR DO CARD NEM O CÁLCULO DO %. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3759 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
