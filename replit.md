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

- **Rev. 4076** — **CONTAS A PAGAR: SELO VISUAL "FD" NAS LINHAS DE FATURAMENTO DIRETO — DEIXA CLARO POR QUE ESSAS OCS NÃO ENTRAM NO AGRUPAMENTO CONSOLIDADO POR CICLO DO FORNECEDOR.** Usuário reportou que ainda via OCs da Ferragens Santa Rita "soltas" ao lado do grupo consolidado. Investigação (Neon direto) confirmou que TODAS têm `modalidade_fd = fd_cliente` — comportamento correto por desenho (Rev. 4072: FD é dinheiro que o cliente paga direto ao fornecedor, a FC nunca desembolsa). O problema era só de exibição: essas linhas apareciam idênticas às normais, sem indicador. Fix: `FinanceiroContasAPagar.tsx` ganhou `fdBadgeInfo()`/`<FdBadge>` — selo colorido ("FD Cliente" azul / "FD"/"FD Terceiro" âmbar, com tooltip explicando a regra) nos 3 pontos de exibição da linha, usando o campo `modalidadeFd` que o backend já retornava. ZERO DELETE · ZERO UPDATE · ZERO ALTER (100% frontend).

- **Rev. 4075** — **CONTAS A PAGAR: FECHAMENTO POR CICLO PASSA A ANCORAR NA DATA DE LANÇAMENTO NO SISTEMA (COMPETÊNCIA), NÃO MAIS NO `dataVencimento` DIGITADO À MÃO NA OC — COM SUPORTE A LANÇAMENTO RETROATIVO.** Usuário reportou que os vencimentos individuais dentro do grupo consolidado "43x" (janela 01/07) não batiam com a lógica do ciclo cadastrado (`quinzenal_semana`, ref. 17/jun, quartas-feiras), perguntando por que não fecha automaticamente pelo critério exato. A janela de fechamento já usava corretamente `dataCompetencia`; o problema era o `data_vencimento` gravado por OC, historicamente digitado errado pelo comprador (ex.: prazo calculado de data-base errada) — confundia ao abrir o grupo, mas a consolidação em si já estava certa. Fix: (1) `atualizarStatusOrdem` (`compras.ts`) — fornecedor com ciclo cadastrado (≠ avista) passa a usar `dataCompetencia` como vencimento do lançamento (quem decide a data real é `_agruparContasPagarPorCicloForn`), ignorando o campo digitado na OC; (2) novo input opcional `dataLancamento` + dialog "Data de Lançamento no Financeiro" em `Ordens.tsx` (Aprovar/Entregar/Entrega Parcial) permite lançar retroativamente uma OC/nota esquecida na janela histórica correta; (3) varredura retroativa corrigiu 7 lançamentos com vencimento inconsistente (fornecedor com ciclo, vencimento < competência). ZERO DELETE · 1 UPDATE restrito a 7 casos · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4074** — **CONTAS A PAGAR: FERRAGENS SANTA RITA (E OUTROS FORNECEDORES COM CICLO) NÃO CONSOLIDAVAM 100% DAS OCS — LANÇAMENTO FINANCEIRO DA OC NUNCA GRAVAVA `fornecedor_nome`.** Causa-raiz: `_agruparContasPagarPorCicloForn` (Rev. 4070) casa pelo nome mas a integração financeira da OC nunca gravava `fornecedor_nome` — 142/263 lançamentos NULOS. Fix: INSERT passa a gravar + fallback COALESCE + varredura retroativa corrigiu 137/144 órfãos. ZERO DELETE · 1 UPDATE em massa restrito · ZERO ALTER destrutivo.

- **Rev. 4073** — **CONDIÇÕES DE PAGAMENTO (COTAÇÕES) PASSAM A RESPEITAR O CICLO DE FECHAMENTO CADASTRADO DO FORNECEDOR, COM EXCEÇÃO POR PRODUTO E EXCEÇÃO MANUAL PONTUAL.** Fornecedor com ciclo cadastrado trava forma/parcelamento na cotação (exceção por produto tem prioridade; nova coluna `excecao_manual` libera pontualmente); sem ciclo continua livre. ZERO DELETE · ZERO ALTER destrutivo (1 coluna aditiva).

- **Rev. 4072** — **CONTAS A PAGAR CONSOLIDADO: NUNCA AGRUPAR/MISTURAR TÍTULOS DE FATURAMENTO DIRETO (FD) NO CICLO DE FECHAMENTO PRÓPRIO DA FC.** Novo `_isFdModalidade()` bloqueia agrupamento por ciclo sempre que o título for FD; query ganhou `LEFT JOIN compras_ordens` + `modalidadeFd`. ZERO DELETE · ZERO ALTER destrutivo (100% leitura).

- **Rev. 4071** — **CONTAS A PAGAR CONSOLIDADO: JANELA DE FECHAMENTO ERA CALCULADA PELO VENCIMENTO INDIVIDUAL DA OC, NÃO PELA DATA DA COMPRA — FRAGMENTAVA O AGRUPAMENTO.** Causa dupla: janela calculada via `dataVencimento` (varia OC a OC) em vez de `dataCompetencia`; Madeireira Andorra sem ciclo cadastrado no banco. Fix usa `dataCompetencia ?? dataVencimento`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4070** — **CONTAS A PAGAR: CONSOLIDAÇÃO DE TÍTULOS POR CICLO DE FECHAMENTO DO FORNECEDOR (CADASTRO) + PAGAMENTO ÚNICO QUE AUTO-DIVIDE EM N CHEQUES E LANÇA NO CONTROLE DE CHEQUES.** Fornecedores com ciclo configurado no cadastro geravam dezenas de títulos separados (1 por OC/obra); novo `_agruparContasPagarPorCicloForn` consolida numa linha expansível + `pagarConsolidadoFornecedor` dá baixa em lote e lança N cheques. ZERO DELETE · ZERO ALTER destrutivo (100% aditivo).

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4069 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
