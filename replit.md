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

- **Rev. 4557** — **FEAT: AVISO PRÉVIO — FLUXO RH → FINANCEIRO (ENVIAR AO CONTAS A PAGAR + BAIXA AUTOMÁTICA).** Novo botão "Enviar ao Financeiro" na aba Aguardando Baixa: mutation `enviarParaFinanceiro` lança a rescisão no Contas a Pagar (`financial_entries`, origem_modulo `aviso_previo`, venc. dataFim+10d — art. 477 CLT) e grava o link no aviso (novas colunas `enviado_financeiro_em/por` + `financeiro_entry_id`). Quando o Financeiro QUITA a baixa (`registrarBaixa`), hook chama `concluirAvisoPorBaixaFinanceira`: conclui o aviso e desliga o funcionário automaticamente (checklist obrigatória pendente = conclui mas NÃO desliga; já Desligado/Lista_Negra intocado). "Dar Baixa" manual preservado; badge "No Contas a Pagar" após envio. Arquivos: `avisoPrevioFerias.ts`, `financial.ts`, `AvisoPrevio.tsx`, `drizzle/schema.ts`.
- **Rev. 4556** — **FIX: AVISO PRÉVIO — BANNER "CONCLUÍDO INCORRETAMENTE" CONTAVA TODOS OS CONCLUÍDOS.** Verificado no Neon: os 53 concluídos JÁ tinham baixa registrada — o banner rosa usava stats.concluidos no lugar de um contador real. Fix: `concluidosSemBaixa` (sem baixaRescisaoData E sem dataBaixa) na condição/textos/botão; `revertAllConcluidos` restringido com isNull(dataBaixa)+isNull(baixaRescisaoData) (não reverte mais baixas legítimas em massa). Arquivos: `AvisoPrevio.tsx`, `avisoPrevioFerias.ts`. ZERO schema change.
### 5 one-liners

- **Rev. 4555** — **UX: TOGGLE DO ALERTA DE LOCAÇÕES NO PAINEL "ALMOXARIFADO" DAS CONFIGURAÇÕES.** Switch em `AlmoxarifadoConfigSection.tsx` lê/grava o MESMO critério `almox_alerta_locacao_auto` dos Critérios do Sistema (initDefaults antes do updateBatch se não seedado). ZERO schema/server change.
- **Rev. 4554** — **UX: ALERTA DE LOCAÇÕES A VENCER ABRE NO LOGIN (GLOBAL).** `AlertaLocacoesVencendo.tsx` montado no DashboardLayout (1x por sessão/empresa); CTA → `/equipamentos/locados`; `getItensLocadosVencendo` ganhou `obraNome`. Arquivos: `AlertaLocacoesVencendo.tsx`, `DashboardLayout.tsx`, `almoxarifado/index.tsx`, `compras.ts`. ZERO schema change.
- **Rev. 4553** — **FEAT: ALMOXARIFADO — ALERTA AUTOMÁTICO DE LOCAÇÕES A VENCER (POR OBRA + TOGGLE).** Modal abre automaticamente ao entrar no Almoxarifado; `getItensLocadosVencendo` filtra pelas obras do usuário; novo critério bool `almox_alerta_locacao_auto` (padrão ligado). Arquivos: `compras.ts`, `routers.ts`, `almoxarifado/index.tsx`, `Configuracoes.tsx`. ZERO schema change.
- **Rev. 4552** — **FEAT: ALMOXARIFADO — FOTO DO FUNCIONÁRIO NOS EMPRÉSTIMOS (CLIQUE = AMPLIAR).** `listOpenLoans` com leftJoin em `employees` retorna `funcionarioFotoUrl`; avatar no modal "Fechar Dia" e na aba "Emprestados", clique amplia no lightbox. Arquivos: `warehouse.ts`, `almoxarifado/index.tsx`. ZERO schema change.
- **Rev. 4551** — **UX: ALMOXARIFADO — VISÃO PADRÃO AGORA É "TODOS OS ALMOXARIFADOS (CONSOLIDADO)".** Estado inicial de `obraContexto` mudou de `null` (Central) para `"todos"` — a tela abre direto no Consolidado; auto-select de usuário restrito a UMA obra preservado. Arquivo: `almoxarifado/index.tsx`. ZERO schema/server change.
### Histórico completo

Ver `replit-history.md` para revisões Rev. 4550 e anteriores.

## User preferences

- **🔒 REGRA DE OURO — LÓGICA DO % PREVISTO (PLANEJAMENTO) É CONGELADA (Rev. 4534, 24/07/2026):** A cadeia de cálculo do PREVISTO (SEMANA) — `regenerarPrevistoSemanasCaminhoB` (motor, fallback de baseline defasada, clamp <100% da raiz), captura do literal (`previsto_literal_json`), precedência literal > raiz > snapshot no frontend (`raizAt`/`mspReadOnly`) — está VALIDADA contra o MSP real e NÃO PODE ser alterada como efeito colateral de outras melhorias. Qualquer task que precise tocar nesses caminhos deve: (1) ALERTAR o usuário explicitamente ANTES de mexer, (2) obter confirmação, (3) revalidar contra os XMLs reais do MSP após a mudança. Histórico: toda alteração "de melhoria" nessa área quebrou o sistema.

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
