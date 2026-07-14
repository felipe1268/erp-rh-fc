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

- **Rev. 4265** — **COMUNICADOS INTERNOS: PROGRESSO DE ASSINATURAS E BLOQUEIO DE CONCLUSÃO ATÉ TODOS ASSINAREM.** A lista ganha coluna "Status / Assinaturas" com badge `Pendente por Assinatura` (âmbar) + barra de progresso X/Y (NN%) para comunicados com destinatários. Linha com fundo âmbar enquanto faltam assinaturas. No toolbar de visualização, badge de contagem aparece e o botão "Concluir" fica desabilitado (label "Aguardando Assinaturas") até todos assinarem. Backend: `listar` retorna `totalDestinatarios`+`totalAssinados` (batch COUNT por ID); `concluir` bloqueia com mensagem explicativa se faltam assinaturas. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4264** — **COMUNICADOS INTERNOS: SETOR/DEPARTAMENTO, EMISSOR RESPONSÁVEL, DESTINATÁRIOS E FCSIGN.** Adiciona aos Comunicados Internos: campo Setor/Departamento (datalist com sugestões), seletor de Emissor Responsável (funcionários ativos), campo Cargo do Emissor (auto-preenchido pelo cargo do funcionário selecionado) e multi-select de Destinatários para assinatura digital. Botão "Solicitar Assinatura FCSign" na toolbar de visualização abre modal com campo e-mail e dispara envelope IntegSign. Badge colorido mostra status do FCSign (roxo=enviado, âmbar=pendente). Disponível em "Novo Comunicado" e "Editar". Schema: +5 colunas em `comunicados_internos` via SyncSchema+. Backend: `listarFuncionariosSimples`, `solicitarAssinaturaFCSign` (cria envelope+signatário+e-mail não-bloqueante). ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4263** — **EDITAR TÍTULO DIALOG MODERNIZADO + GRID 3-COLUNAS EM CONTAS A RECEBER.** Header branco+ícone azul; layout 3 colunas nas telas de Contas a Receber. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4261** — **CONTROLE DE CHEQUES: SINCRONIZAÇÃO AUTOMÁTICA COMPLETA COM O EXTRATO (AMBOS OS SENTIDOS).** Sentido inverso: cheque compensado no extrato → status "Compensado" automático + `conciliado=1`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4260** — **CONTROLE DE CHEQUES: STATUS "DEVOLVIDO" AUTOMÁTICO AO DETECTAR PAR COMP+DEV NO EXTRATO.** `autoMarcarChequesDevolvidos` (idempotente). Frontend: `useEffect` em `FinanceiroConciliacao.tsx`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4259** — **FIX: VALOR NEGOCIADO PACOTE — CORREÇÃO DE ARREDONDAMENTO NO ITEM ERRADO.** `lastNonZeroIdx` usado em AMBOS os pontos de correção em `calcNegociadoPreview`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4258** — **MAPA DE COTAÇÃO: 3 OTIMIZAÇÕES DE PERFORMANCE (812 ITENS).** 3 `useMemo` + substituição de IIFE + `Map` para `getMelhorPrecoItem`. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4252 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
