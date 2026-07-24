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

- **Rev. 4554** — **UX: ALERTA DE LOCAÇÕES A VENCER AGORA ABRE NO LOGIN (GLOBAL).** Novo componente `AlertaLocacoesVencendo.tsx` montado no DashboardLayout — o modal abre automaticamente em QUALQUER tela após o login (1x por sessão/empresa), não mais só ao entrar no Almoxarifado; CTA → `/equipamentos/locados`; `getItensLocadosVencendo` ganhou `obraNome`; toggle `almox_alerta_locacao_auto` e filtro por obra (Rev. 4553) preservados. Arquivos: `AlertaLocacoesVencendo.tsx` (novo), `DashboardLayout.tsx`, `almoxarifado/index.tsx`, `compras.ts`. ZERO schema change.
- **Rev. 4553** — **FEAT: ALMOXARIFADO — ALERTA AUTOMÁTICO DE LOCAÇÕES A VENCER (POR OBRA + TOGGLE).** Modal "Locações a Vencer" abre AUTOMATICAMENTE ao entrar no Almoxarifado quando há itens vencendo (1x por sessão/empresa via sessionStorage); `getItensLocadosVencendo` agora filtra pelas obras do usuário (`getAlmoxAllowedObraIdSet` — restrito não vê Central; admin vê tudo); novo critério bool `almox_alerta_locacao_auto` (padrão ligado) na nova categoria "Almoxarifado / Locações" dos Critérios do Sistema. Arquivos: `compras.ts`, `routers.ts`, `almoxarifado/index.tsx`, `Configuracoes.tsx`. ZERO schema change.
### 5 one-liners

- **Rev. 4552** — **FEAT: ALMOXARIFADO — FOTO DO FUNCIONÁRIO NOS EMPRÉSTIMOS (CLIQUE = AMPLIAR).** `listOpenLoans` com leftJoin em `employees` retorna `funcionarioFotoUrl`; avatar no modal "Fechar Dia" e na aba "Emprestados", clique amplia no lightbox. Arquivos: `warehouse.ts`, `almoxarifado/index.tsx`. ZERO schema change.
- **Rev. 4551** — **UX: ALMOXARIFADO — VISÃO PADRÃO AGORA É "TODOS OS ALMOXARIFADOS (CONSOLIDADO)".** Estado inicial de `obraContexto` mudou de `null` (Central) para `"todos"` — a tela abre direto no Consolidado; auto-select de usuário restrito a UMA obra preservado. Arquivo: `almoxarifado/index.tsx`. ZERO schema/server change.
- **Rev. 4550** — **REMOVE: ALMOXARIFADO — VISÃO "📍 SALDO POR OBRA" RETIRADA DO SELETOR.** A pedido do usuário, removida a visão obra→insumos da Rev. 2772: opção do seletor, bloco de render (~150 linhas), estados órfãos e sentinela "porObra". Consolidado, Central e obra específica intactos. Arquivo: `almoxarifado/index.tsx`. ZERO schema/server change.
- **Rev. 4549** — **FIX: TERCEIROS — FILTRO DE OBRA EM FUNCIONÁRIOS TERCEIROS + TOLERÂNCIA NO DETECTOR DE BASELINE.** Obras duplicadas entre empresas do grupo (mesmo nome, ids diferentes) → filtro por id nunca casava; fix: casa por id OU nome normalizado da obra selecionada. Detector de baseline: envelope só diverge com deslocamento >7 dias (falso positivo POITA limpo no Neon). Arquivos: `FuncionariosTerceiros.tsx`, `planejamento.ts`. ZERO schema change.
- **Rev. 4548** — **FEAT+FIX: PLANEJAMENTO — PACOTE DE ROBUSTEZ DO % PREVISTO (caso QIU 2 FASE 4 / R03).** Motor congelado intocado, tudo camada de leitura: detector de baseline divergente no upload semanal (banner âmbar persistente), chip de fonte no card PREVISTO, piso do motor (nunca recua abaixo do último literal), limpeza cirúrgica em `limparAvancosSemana`, tenant guards (IDOR). Arquivos: `planejamento.ts`, `previstoCurva.ts`, `PlanejamentoDetalhe.tsx`. ZERO schema change.
### Histórico completo

Ver `replit-history.md` para revisões Rev. 4547 e anteriores.

## User preferences

- **🔒 REGRA DE OURO — LÓGICA DO % PREVISTO (PLANEJAMENTO) É CONGELADA (Rev. 4534, 24/07/2026):** A cadeia de cálculo do PREVISTO (SEMANA) — `regenerarPrevistoSemanasCaminhoB` (motor, fallback de baseline defasada, clamp <100% da raiz), captura do literal (`previsto_literal_json`), precedência literal > raiz > snapshot no frontend (`raizAt`/`mspReadOnly`) — está VALIDADA contra o MSP real e NÃO PODE ser alterada como efeito colateral de outras melhorias. Qualquer task que precise tocar nesses caminhos deve: (1) ALERTAR o usuário explicitamente ANTES de mexer, (2) obter confirmação, (3) revalidar contra os XMLs reais do MSP após a mudança. Histórico: toda alteração "de melhoria" nessa área quebrou o sistema.

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
