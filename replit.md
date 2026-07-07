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

- **Rev. 4083** — **CONCILIAÇÃO: PARSERS SANTANDER CORRIGIDOS — EXTRATO CONSOLIDADO INTELIGENTE (FEV/2026) E INTERNET BANKING EMPRESARIAL IBPJ (JUN/2026) FUNCIONAM INDEPENDENTEMENTE + TEMPLATES AUTO-SEEDED EM CONFIGURAÇÕES.** Dois bugs: (1) `santanderPdfParser.ts` detectava `|santander/i` (muito amplo — capturava o IBPJ que menciona "Santander" na seção de contato), trocado para `/EXTRATO CONSOLIDADO INTELIGENTE/i && !/IBPJ/i`; (2) `santanderIbpjParser.ts` no bloco multi-linha — "Saldo do dia..." era `isSkippable=true` (pulava o `continue`), mas o valor da linha seguinte era emitido como transação → adicionado `if (isSaldoText(l2)) break;` para abortar o bloco inteiro. Além disso, `SKIP_LINE_RES` ganhou LOCNOW, Julio Ferraz e números de página. SyncSchema+ Rev. 4083 faz INSERT idempotente dos dois templates Santander para TODAS as empresas no startup; seed script atualizado com palavras-chave corretas ("EXTRATO CONSOLIDADO INTELIGENTE", "Extrato_PJ_A4_Inteligente") e instruções de IA descrevendo o layout real. ZERO DELETE · ZERO UPDATE em dado · ZERO ALTER.

- **Rev. 4082** — **CONCILIAÇÃO BANCÁRIA: "LANÇAR NO ERP" AGORA SUGERE A CONDIÇÃO DE PAGAMENTO PRO FORNECEDOR COM CICLO DE FECHAMENTO CADASTRADO.** Caso de EXCEÇÃO: lançamento retroativo de extrato (mês sem OS/OC) pra fornecedor que já tem ciclo configurado no cadastro (`empresas_terceiras.ciclo_*`) — no fluxo normal (com OS/OC) a forma de pagamento já vem certa automaticamente, isso não muda. Investigação: "Pagar consolidado" só agrupa títulos NÃO PAGOS; um lançamento criado via "Lançar no ERP" já nasce PAGO/conciliado (a baixa é o próprio extrato), então nunca entraria na consolidação — o pedido é 100% de UX. Fix: novo endpoint `financial.getFornecedorCiclosConfig` (mesmo padrão `includeAllGroup` do `compras.listarFornecedores`); no diálogo "Lançar no ERP" (`FinanceiroConciliacao.tsx`), ao confirmar um fornecedor com ciclo configurado (match por substring, maior nome primeiro), a forma de pagamento é pré-preenchida com `cicloFormaPagamento` (só se vazia — nunca sobrescreve escolha do usuário) + aviso explicando o ciclo/parcelamento sugerido. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

### 5 one-liners

- **Rev. 4081** — **CONCILIAÇÃO: CHEQUE DEVOLVIDO QUITADO POR MÚLTIPLOS PAGAMENTOS/FORMAS — CONTROLE DE CHEQUES PASSA A MOSTRAR COMO FOI PAGO.** Fix: nova coluna `forma_pagamento` no tipo 'ajuste'; seletor no diálogo Conciliação + popover "Ver pagamento" em Controle de Cheques. ZERO DELETE · ZERO UPDATE · 1 ALTER aditivo.

- **Rev. 4080** — **CONTAS A PAGAR: BOTÃO "ANO TODO" PADRONIZADO COM CONTAS A RECEBER.** Antes: barra tracejada full-width abaixo da grade de meses. Fix: `FinanceiroContasAPagar.tsx` — botão virou o mesmo pill compacto ao lado do seletor de ano (◀ 2026 ▶ [Ano todo]), igual ao Contas a Receber. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4079** — **CONCILIAÇÃO BANCÁRIA: CHEQUE DEVOLVIDO MAIS DE UMA VEZ (MESMA IDENTIDADE, MOTIVOS DIFERENTES) PASSA A QUITAR TODAS AS OCORRÊNCIAS DE UMA SÓ VEZ.** Causa: cobertura já somava por identidade, mas o desconsiderar automático só marcava o par exato passado naquela chamada. Fix: busca TODOS os pares da conta com a mesma identidade e desconsidera juntos (`registrarVinculoChequeDevolvido`/`estornarVinculoChequeDevolvido`). ZERO DELETE · ZERO ALTER · UPDATE só em `desconsiderado_em`.

- **Rev. 4078** — **FATURAMENTO DIRETO (FD): NOMENCLATURA UNIFICADA E MAIS CLARA — "FORA DO CONTRATO" x "ABATE CONTRATO" — EM CONTAS A PAGAR + PDF DA OC, COM LEGENDA EXPLICATIVA.** Usuário reportou que os 3 selos ("FD Cliente"/"FD"/"FD Terceiro") confundiam mais do que ajudavam — só existem 2 conceitos reais: desconta ou não desconta do contrato da FC (`fd_fc` e `fd_terceiro` são o MESMO conceito, não 2). Fix: `fdBadgeInfo()` unificado em 2 rótulos com tooltip + `FdLegendaPopover`. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4077** — **CONTAS A PAGAR: NOVO FILTRO "SÓ FD / SEM FD" PRA ISOLAR TÍTULOS DE FATURAMENTO DIRETO NA LISTA.** `FinanceiroContasAPagar.tsx` ganhou estado `fdFilter` + toggle de 3 botões reaproveitando `fdBadgeInfo()`. ZERO DELETE · ZERO UPDATE · ZERO ALTER (100% frontend).

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4076 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
