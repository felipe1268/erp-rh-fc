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

- **Rev. 4081** — **CONCILIAÇÃO: CHEQUE DEVOLVIDO QUITADO POR MÚLTIPLOS PAGAMENTOS/FORMAS — CONTROLE DE CHEQUES PASSA A MOSTRAR COMO FOI PAGO.** Usuário quer suportar um cheque devolvido quitado por VÁRIOS pagamentos somando o total (ex.: 2k+2k+1k PIX em contas diferentes, OU 4k dinheiro + 1k PIX), com o status do Controle de Cheques refletindo isso. Investigação: o vínculo múltiplo 1→N já funcionava (`bank_cheque_vinculos`, Rev. 3747/4079); faltava (1) dinheiro/outras formas sem linha de extrato ficarem só como "ajuste" genérico e (2) `statusBadge()` do Controle de Cheques não ter case pra `compensado_pix` (caía em "Indefinido"). Fix: nova coluna `forma_pagamento` (dinheiro/depósito/cheque próprio/outro) obrigatória no tipo 'ajuste'; `FinanceiroConciliacao.tsx` ganhou seletor de forma de pagamento no lugar do botão genérico + badges mostram a forma escolhida; novo endpoint `getVinculosPorChequeNumero` + popover "Ver pagamento" em `FinanceiroCheques.tsx` mostra o detalhamento completo (todas as formas/pagamentos) sem abrir a Conciliação. ZERO DELETE · ZERO UPDATE em dado existente · 1 ALTER aditivo (coluna nullable, self-heal `IF NOT EXISTS`).

- **Rev. 4080** — **CONTAS A PAGAR: BOTÃO "ANO TODO" PADRONIZADO COM CONTAS A RECEBER.** Usuário notou que o botão "Ano todo" do Contas a Pagar não estava na mesma posição/estilo do Contas a Receber. Antes: barra tracejada full-width abaixo da grade de meses. Fix: `FinanceiroContasAPagar.tsx` — botão virou o mesmo pill compacto ao lado do seletor de ano (◀ 2026 ▶ [Ano todo]), igual ao Contas a Receber; clique agora alterna liga/desliga. Nenhuma mudança de comportamento (`verAnoTodo`/`escopoData`) — 100% visual/posição. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

### 5 one-liners

- **Rev. 4079** — **CONCILIAÇÃO BANCÁRIA: CHEQUE DEVOLVIDO MAIS DE UMA VEZ (MESMA IDENTIDADE, MOTIVOS DIFERENTES) PASSA A QUITAR TODAS AS OCORRÊNCIAS DE UMA SÓ VEZ.** Causa: cobertura já somava por identidade, mas o desconsiderar automático só marcava o par exato passado naquela chamada. Fix: busca TODOS os pares da conta com a mesma identidade e desconsidera juntos (`registrarVinculoChequeDevolvido`/`estornarVinculoChequeDevolvido`). ZERO DELETE · ZERO ALTER · UPDATE só em `desconsiderado_em`.

- **Rev. 4078** — **FATURAMENTO DIRETO (FD): NOMENCLATURA UNIFICADA E MAIS CLARA — "FORA DO CONTRATO" x "ABATE CONTRATO" — EM CONTAS A PAGAR + PDF DA OC, COM LEGENDA EXPLICATIVA.** Usuário reportou que os 3 selos ("FD Cliente"/"FD"/"FD Terceiro") confundiam mais do que ajudavam — só existem 2 conceitos reais: desconta ou não desconta do contrato da FC (`fd_fc` e `fd_terceiro` são o MESMO conceito, não 2). Fix: `fdBadgeInfo()` unificado em 2 rótulos com tooltip + `FdLegendaPopover`. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4077** — **CONTAS A PAGAR: NOVO FILTRO "SÓ FD / SEM FD" PRA ISOLAR TÍTULOS DE FATURAMENTO DIRETO NA LISTA.** `FinanceiroContasAPagar.tsx` ganhou estado `fdFilter` + toggle de 3 botões reaproveitando `fdBadgeInfo()`. ZERO DELETE · ZERO UPDATE · ZERO ALTER (100% frontend).

- **Rev. 4076** — **CONTAS A PAGAR: SELO VISUAL "FD" NAS LINHAS DE FATURAMENTO DIRETO.** `FinanceiroContasAPagar.tsx` ganhou `fdBadgeInfo()`/`<FdBadge>` — selo colorido com tooltip nos 3 pontos de exibição da linha. ZERO DELETE · ZERO UPDATE · ZERO ALTER (100% frontend).

- **Rev. 4075** — **CONTAS A PAGAR: FECHAMENTO POR CICLO PASSA A ANCORAR NA DATA DE LANÇAMENTO NO SISTEMA (COMPETÊNCIA), NÃO MAIS NO `dataVencimento` DIGITADO À MÃO — COM SUPORTE A LANÇAMENTO RETROATIVO.** ZERO DELETE · 1 UPDATE restrito a 7 casos · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4071 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
