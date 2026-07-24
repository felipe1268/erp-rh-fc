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

- **Rev. 4536** — **UX: ALMOXARIFADO — PROGRESSO 0→100% NO BOTÃO "REMOVER TODOS" (EXCLUSÃO EM LOTE).** `ModalConfirmacaoAuditoria` ganhou prop `progresso`: durante o lote, o botão confirmar mostra barra `bg-white/15` crescendo + "Removendo… XX%". Progresso REAL por unidade processada (cards + `_subItems`, incrementado em `finally` no loop de `handleExcluirSelecionados`); reseta pra null no retry pós-erro de senha. Arquivos: `ModalConfirmacaoAuditoria.tsx`, `almoxarifado/index.tsx`. ZERO schema change.
- **Rev. 4535** — **UX: ALMOXARIFADO CENTRAL — SELEÇÃO NATURAL (CHECKBOX SEMPRE VISÍVEL NOS CARDS).** Removido o modo "Selecionar" (Rev. 2382): cada card agora tem checkbox sempre visível no canto superior esquerdo da foto; botão do header virou "Selecionar todos"/"Desmarcar todos" com badge de contagem; a sticky bar de ações em lote aparece quando `selecionados.size > 0`. Drag-lasso mantido só para mouse (touchAction livre → iPad scrolla normal). Seleções de locação (âmbar) e do view consolidado não foram tocadas. Arquivo: `client/src/pages/almoxarifado/index.tsx`. ZERO schema change.

### 5 one-liners

- **Rev. 4534** — **FIX: PLANEJAMENTO — PREVISTO (SEMANA) 100% EM TODAS AS SEMANAS FUTURAS (BASELINE DEFASADA).** Guard no fallback de `regenerarPrevistoSemanasCaminhoB` (baseline defasada → datas atuais como proxy) + rollup da raiz 2 casas com clamp <100 até o fim real. 🔒 Lógica CONGELADA — ver User preferences. ZERO schema change.
- **Rev. 4533** — **FIX: PLANEJAMENTO — REALIZADO ACUMULADO RETROATIVO AO ENVIAR NOVO XML (REFIS/CURVA S).** 3 caminhos de leitura (`avancoAtual`, `realizadoAcum`, `realizadoComInd`) agora consultam o mapa `realizadoSemanas` antes de cair no EVM ponderado; Curva S backend injeta pontos históricos do mapa. ZERO schema change.
- **Rev. 4532** — **FEAT: CONTROLE DE DOCUMENTOS — PAINEL DOSSIÊ COM MULTI-SELECT E DOWNLOAD ZIP.** Nova aba "Dossiê": tabela multi-select de funcionários ativos, linhas expansíveis (ASO/Treinamentos/Atestados/Advertências), `docs.painelDossie` tRPC + rota `GET /api/download/dossie-zip` (archiver, guard multi-tenant). ZERO schema change.
- **Rev. 4531** — **FEAT: FÉRIAS — BLOQUEIO CLT ART. 135, §3° NA DATA DE INÍCIO.** Função pura `verificarDataInicioFerias` bloqueia sexta/sábado e os 2 dias antes de qualquer feriado. Banner azul informativo permanente + alerta vermelho com citação do artigo quando data inválida. Botão "Confirmar Data" desabilitado. Query `listarPeriodo` para feriados nacionais+empresa. ZERO schema change.
- **Rev. 4530** — **FEAT: FUNCIONÁRIOS TERCEIROS — HISTÓRICO COMPLETO DE VÍNCULOS.** Nova tabela `terceiro_obra_vinculos`. Mutations `encerrarVinculo`/`reativar`. Toggle pills Ativos/Desligados/Todos. `VinculosHistoricoSection` no Raio-X. ZERO schema change.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4506 e anteriores.

## User preferences

- **🔒 REGRA DE OURO — LÓGICA DO % PREVISTO (PLANEJAMENTO) É CONGELADA (Rev. 4534, 24/07/2026):** A cadeia de cálculo do PREVISTO (SEMANA) — `regenerarPrevistoSemanasCaminhoB` (motor, fallback de baseline defasada, clamp <100% da raiz), captura do literal (`previsto_literal_json`), precedência literal > raiz > snapshot no frontend (`raizAt`/`mspReadOnly`) — está VALIDADA contra o MSP real e NÃO PODE ser alterada como efeito colateral de outras melhorias. Qualquer task que precise tocar nesses caminhos deve: (1) ALERTAR o usuário explicitamente ANTES de mexer, (2) obter confirmação, (3) revalidar contra os XMLs reais do MSP após a mudança. Histórico: toda alteração "de melhoria" nessa área quebrou o sistema.

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
