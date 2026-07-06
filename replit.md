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

- **Rev. 4078** — **FATURAMENTO DIRETO (FD): NOMENCLATURA UNIFICADA E MAIS CLARA — "FORA DO CONTRATO" x "ABATE CONTRATO" — EM CONTAS A PAGAR + PDF DA OC, COM LEGENDA EXPLICATIVA.** Usuário reportou que os 3 selos ("FD Cliente"/"FD"/"FD Terceiro") confundiam mais do que ajudavam — só existem 2 conceitos reais: desconta ou não desconta do contrato da FC (`fd_fc` e `fd_terceiro` são o MESMO conceito, não 2). Fix: `fdBadgeInfo()` unificado em 2 rótulos ("FD Fora do Contrato" azul / "FD Abate Contrato" âmbar) com tooltip; filtro evolui pra 4 opções; novo `FdLegendaPopover` (ícone "O que é FD?", clicável) explica os 2 tipos; `purchaseOrderPdf.ts` alinhado à mesma nomenclatura + corrigido bug que fazia OCs `fd_terceiro` caírem no default "Empresa FC". ZERO mudança nos valores gravados — 100% camada de exibição. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4077** — **CONTAS A PAGAR: NOVO FILTRO "SÓ FD / SEM FD" PRA ISOLAR TÍTULOS DE FATURAMENTO DIRETO NA LISTA.** Na sequência da Rev. 4076 (selo visual "FD"), usuário pediu um filtro pra ver só os títulos FD de uma vez, sem caçar o selo manualmente. Fix: `FinanceiroContasAPagar.tsx` ganhou o estado `fdFilter` ("all"/"fd"/"normal") + toggle de 3 botões ao lado do filtro de Origem, reaproveitando `fdBadgeInfo()` (Rev. 4076) como critério único de verdade. ZERO DELETE · ZERO UPDATE · ZERO ALTER (100% frontend).

### 5 one-liners

- **Rev. 4076** — **CONTAS A PAGAR: SELO VISUAL "FD" NAS LINHAS DE FATURAMENTO DIRETO — DEIXA CLARO POR QUE ESSAS OCS NÃO ENTRAM NO AGRUPAMENTO CONSOLIDADO POR CICLO DO FORNECEDOR.** Usuário reportou que ainda via OCs da Ferragens Santa Rita "soltas" ao lado do grupo consolidado. Investigação (Neon direto) confirmou que TODAS têm `modalidade_fd = fd_cliente` — comportamento correto por desenho. Fix: `FinanceiroContasAPagar.tsx` ganhou `fdBadgeInfo()`/`<FdBadge>` — selo colorido com tooltip nos 3 pontos de exibição da linha. ZERO DELETE · ZERO UPDATE · ZERO ALTER (100% frontend).

- **Rev. 4075** — **CONTAS A PAGAR: FECHAMENTO POR CICLO PASSA A ANCORAR NA DATA DE LANÇAMENTO NO SISTEMA (COMPETÊNCIA), NÃO MAIS NO `dataVencimento` DIGITADO À MÃO NA OC — COM SUPORTE A LANÇAMENTO RETROATIVO.** Janela de fechamento já usava `dataCompetencia`; o problema era `data_vencimento` digitado errado pelo comprador. Fix: `atualizarStatusOrdem` passa a usar `dataCompetencia` como vencimento p/ fornecedor com ciclo + novo input `dataLancamento` p/ lançamento retroativo. ZERO DELETE · 1 UPDATE restrito a 7 casos · ZERO ALTER destrutivo.

- **Rev. 4074** — **CONTAS A PAGAR: FERRAGENS SANTA RITA (E OUTROS FORNECEDORES COM CICLO) NÃO CONSOLIDAVAM 100% DAS OCS — LANÇAMENTO FINANCEIRO DA OC NUNCA GRAVAVA `fornecedor_nome`.** Causa-raiz: `_agruparContasPagarPorCicloForn` (Rev. 4070) casa pelo nome mas a integração financeira da OC nunca gravava `fornecedor_nome` — 142/263 lançamentos NULOS. Fix: INSERT passa a gravar + fallback COALESCE + varredura retroativa corrigiu 137/144 órfãos. ZERO DELETE · 1 UPDATE em massa restrito · ZERO ALTER destrutivo.

- **Rev. 4073** — **CONDIÇÕES DE PAGAMENTO (COTAÇÕES) PASSAM A RESPEITAR O CICLO DE FECHAMENTO CADASTRADO DO FORNECEDOR, COM EXCEÇÃO POR PRODUTO E EXCEÇÃO MANUAL PONTUAL.** Fornecedor com ciclo cadastrado trava forma/parcelamento na cotação (exceção por produto tem prioridade; nova coluna `excecao_manual` libera pontualmente); sem ciclo continua livre. ZERO DELETE · ZERO ALTER destrutivo (1 coluna aditiva).

- **Rev. 4072** — **CONTAS A PAGAR CONSOLIDADO: NUNCA AGRUPAR/MISTURAR TÍTULOS DE FATURAMENTO DIRETO (FD) NO CICLO DE FECHAMENTO PRÓPRIO DA FC.** Novo `_isFdModalidade()` bloqueia agrupamento por ciclo sempre que o título for FD; query ganhou `LEFT JOIN compras_ordens` + `modalidadeFd`. ZERO DELETE · ZERO ALTER destrutivo (100% leitura).

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4071 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
