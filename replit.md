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

- **Rev. 4074** — **CONTAS A PAGAR: FERRAGENS SANTA RITA (E OUTROS FORNECEDORES COM CICLO) NÃO CONSOLIDAVAM 100% DAS OCS — LANÇAMENTO FINANCEIRO DA OC NUNCA GRAVAVA `fornecedor_nome`.** Usuário reportou que várias OCs da Ferragens Santa Rita ficavam soltas ao lado do grupo consolidado "25x", impedindo dar baixa corretamente, e pediu explicação + varredura retroativa. Causa-raiz: `_agruparContasPagarPorCicloForn` (Rev. 4070) casa o título ao ciclo lendo `r.fornecedorNome`, mas a integração financeira da OC (`server/routers/compras.ts`) NUNCA gravava essa coluna em `financial_entries` (só usava o nome dentro do texto de `descricao`) — 142 de 263 lançamentos de OC em aberto no sistema inteiro tinham `fornecedor_nome` NULO, caindo sempre como linha individual mesmo com ciclo configurado. Fix: (1) INSERT do lançamento agora grava `fornecedorNome`; (2) `getContasAPagarByYear` ganhou fallback `COALESCE(fornecedor_nome, co.fornecedor_nome)` via join existente; (3) varredura retroativa direto no banco corrigiu 137/144 lançamentos órfãos (os 7 restantes referenciam OCs já excluídas, sem fonte pra recuperar o nome). Ferragens Santa Rita passa de ~26 títulos soltos pra 44 consolidados na janela de 01/07 + 9 na de 15/07. ZERO DELETE · 1 UPDATE em massa restrito a `fornecedor_nome IS NULL/vazio` · ZERO ALTER destrutivo.

- **Rev. 4073** — **CONDIÇÕES DE PAGAMENTO (COTAÇÕES) PASSAM A RESPEITAR O CICLO DE FECHAMENTO CADASTRADO DO FORNECEDOR, COM EXCEÇÃO POR PRODUTO E EXCEÇÃO MANUAL PONTUAL.** Usuário exigiu que compradores parem de escolher livremente forma/parcelamento de pagamento por cotação quando o fornecedor já tem ciclo de fechamento cadastrado (`empresas_terceiras.cicloPagamento`) — regra confirmada: "O que não tiver a condição de fechamento cadastrado, fica livre. O que tiver, deve ser respeitado." Exceções por produto (`regrasProdutoJson`) continuam com prioridade sobre o ciclo geral; nova coluna `excecao_manual` em `comprasCotacaoFornecedores` permite ao comprador declarar uma exceção pontual (ex.: compra emergencial) que libera a condição só para aquela cotação. No modal "Condições de Pagamento" (`Cotacoes.tsx`), quando há condição efetiva (regra de produto > ciclo do fornecedor) e a exceção manual não está marcada, a tela fica travada (forma/parcelamento forçados, aba "Fechamento" custom escondida) com banner + checkbox "Esta compra é uma exceção" para liberar. Fornecedor sem ciclo continua 100% livre. ZERO DELETE · ZERO ALTER destrutivo (1 coluna aditiva).

### 5 one-liners

- **Rev. 4072** — **CONTAS A PAGAR CONSOLIDADO: NUNCA AGRUPAR/MISTURAR TÍTULOS DE FATURAMENTO DIRETO (FD) NO CICLO DE FECHAMENTO PRÓPRIO DA FC.** Novo `_isFdModalidade()` bloqueia agrupamento por ciclo sempre que o título for FD; query ganhou `LEFT JOIN compras_ordens` + `modalidadeFd`. ZERO DELETE · ZERO ALTER destrutivo (100% leitura).

- **Rev. 4071** — **CONTAS A PAGAR CONSOLIDADO: JANELA DE FECHAMENTO ERA CALCULADA PELO VENCIMENTO INDIVIDUAL DA OC, NÃO PELA DATA DA COMPRA — FRAGMENTAVA O AGRUPAMENTO.** Causa dupla: janela calculada via `dataVencimento` (varia OC a OC) em vez de `dataCompetencia`; Madeireira Andorra sem ciclo cadastrado no banco. Fix usa `dataCompetencia ?? dataVencimento`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4070** — **CONTAS A PAGAR: CONSOLIDAÇÃO DE TÍTULOS POR CICLO DE FECHAMENTO DO FORNECEDOR (CADASTRO) + PAGAMENTO ÚNICO QUE AUTO-DIVIDE EM N CHEQUES E LANÇA NO CONTROLE DE CHEQUES.** Fornecedores com ciclo configurado no cadastro geravam dezenas de títulos separados (1 por OC/obra); novo `_agruparContasPagarPorCicloForn` consolida numa linha expansível + `pagarConsolidadoFornecedor` dá baixa em lote e lança N cheques. ZERO DELETE · ZERO ALTER destrutivo (100% aditivo).

- **Rev. 4069** — **CONTAS A PAGAR: FILTRO DE MÊS ERA IGNORADO DURANTE A BUSCA + FALTAVA OPÇÃO "ANO TODO".** Usuário selecionou Julho e pesquisou um fornecedor — a lista trouxe títulos de todos os meses. Fix: novo toggle "Ano todo (AAAA)" + `escopoData` do qual TUDO deriva. ZERO DELETE · ZERO ALTER destrutivo (100% client-side).

- **Rev. 4068** — **CONCILIAÇÃO BANCÁRIA NÃO BAIXAVA O CHEQUE NO CONTROLE DE CHEQUES + MOTIVO/CONTA TENTATIVA DE DEVOLUÇÃO AGORA FICAM REGISTRADOS.** `conciliarLancamento` nunca tocava `financial_cheques`; novas colunas de motivo/conta tentativa + baixa automática do cheque ao conciliar (match por Nº normalizado + valor). ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4067 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
