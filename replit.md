# ERP Gestão Integrada — FC Engenharia

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

- **Rev. 4086** — **CONCILIAÇÃO: IMPORTAÇÃO EM LOTE INTELIGENTE — CONTA AUTO-DETECTADA DO CABEÇALHO OFX + DIÁLOGO DE REVISÃO POR ARQUIVO.** O arquivo OFX já carrega `<BANKID>`+`<ACCTID>` no `<BANKACCTFROM>` — agora o sistema lê esses dados client-side e cruza com as contas cadastradas (normalização de zeros à esquerda). Ao subir 1 ou N arquivos OFX, abre `BatchImportDialog` (dark header, tabela arquivo×conta) onde cada linha mostra a conta detectada com badge ✅/⚠ e seletor de override. `handleBatchImport` processa cada arquivo para sua conta detectada (análise → dedup → insert). `PendImportFile` ganhou `contaId?: number`; `proceedWithInsert` usa `fg.contaId ?? contaId` por arquivo. No Workspace: banner azul quando conta do OFX diverge da selecionada, com botão "Usar esta conta". ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4085** — **CONCILIAÇÃO: DEDUP DE IMPORTAÇÃO PASSA A SER CONTROLADO PELO USUÁRIO (DIÁLOGO DE REVISÃO) + PARSER OFX ROBUSTO PARA FORMATO BR.** Antes: duplicatas eram descartadas silenciosamente sem visibilidade. Fix: novo endpoint `checkStatementDuplicates` (dry-run, sem INSERT) + `handleImport` ganhou FASE 1.5 que pausa antes de gravar e abre `ReviewDuplicatesDialog` listando cada linha duplicada com Checkbox (desmarcado por padrão). Usuário decide quais reimportar; confirmadas são enviadas com `forceInsert: true` que pula o dedup no `insertBankStatementBatch`. OFX parser agora normaliza "1.234,56" (ponto=milhar, vírgula=decimal) corretamente. Funciona em `FinanceiroConciliacao.tsx` e `FinanceiroConciliacaoWorkspace.tsx`. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

### 5 one-liners

- **Rev. 4084** — **CONTAS A RECEBER: "NOVO TÍTULO" ENRIQUECIDO COM CONTA BANCÁRIA DE RECEBIMENTO + VÍNCULO DE NFS-e + BADGE NA LISTA.** Nova tabela `financial_nfse_vinculos`; `criarTituloReceber` recebe `contaBancariaId`+campos NFS-e; upload XML DOMParser multi-padrão; badge na lista. ZERO DELETE · ZERO ALTER em dados existentes · 1 CREATE TABLE.

- **Rev. 4083** — **CONCILIAÇÃO: PARSERS SANTANDER CORRIGIDOS — EXTRATO CONSOLIDADO INTELIGENTE (FEV/2026) E INTERNET BANKING EMPRESARIAL IBPJ (JUN/2026) FUNCIONAM INDEPENDENTEMENTE + TEMPLATES AUTO-SEEDED EM CONFIGURAÇÕES.** Dois bugs corrigidos; seed script atualizado. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4082** — **CONCILIAÇÃO BANCÁRIA: "LANÇAR NO ERP" SUGERE CONDIÇÃO DE PAGAMENTO PRO FORNECEDOR COM CICLO DE FECHAMENTO CADASTRADO.** Novo endpoint `financial.getFornecedorCiclosConfig`; diálogo pré-preenche `cicloFormaPagamento` (só se vazia) + aviso do ciclo. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4081** — **CONCILIAÇÃO: CHEQUE DEVOLVIDO QUITADO POR MÚLTIPLOS PAGAMENTOS/FORMAS — CONTROLE DE CHEQUES PASSA A MOSTRAR COMO FOI PAGO.** Fix: nova coluna `forma_pagamento` no tipo 'ajuste'; seletor no diálogo Conciliação + popover "Ver pagamento" em Controle de Cheques. ZERO DELETE · ZERO UPDATE · 1 ALTER aditivo.

- **Rev. 4080** — **CONTAS A PAGAR: BOTÃO "ANO TODO" PADRONIZADO COM CONTAS A RECEBER.** Antes: barra tracejada full-width abaixo da grade de meses. Fix: `FinanceiroContasAPagar.tsx` — botão virou o mesmo pill compacto ao lado do seletor de ano (◀ 2026 ▶ [Ano todo]), igual ao Contas a Receber. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4079 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
