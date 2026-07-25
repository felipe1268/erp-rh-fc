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

- **Rev. 4587** — **FEAT: CONTAS A PAGAR — EDITAR COM AS MESMAS INFORMAÇÕES DE PAGAMENTO DA TELA "PAGAR".** Usuário pediu que o lápis (Editar) tivesse tudo que o Pagar tem. Forma de Pagamento ganhou Cheque (próprio)/Cheque de Terceiro/Débito Automático; novo seletor de Conta bancária (updateEntry ganhou contaBancariaId opcional + guard anti-IDOR); seção de cheque próprio com nº do 1º cheque, parcelas e prévia — ao salvar cadastra os cheques PENDENTES no Controle de Cheques (só se o nº foi informado — Poka-Yoke contra duplicidade); seção de cheque de terceiro seleciona cheques em carteira e aloca ao título. Sem baixa — pagar continua no fluxo "Pagar". Arquivos: `FinanceiroContasAPagar.tsx`, `financial.ts`. ZERO schema change.
- **Rev. 4586** — **UX: FLUXO DE CAIXA — POP-UP DE DETALHAMENTO ULTRA MODERNO + BUSCA RÁPIDA.** Usuário pediu layout "agradável, intuitivo, colorido, ultra moderno" p/ o drill-down (Rev. 4584). Redesign client-only: cabeçalho em degradê (esmeralda→teal entradas / rosa→laranja saídas) com pills de contexto + total grande; campo de busca rápida (X de Y visíveis + soma, total da célula imutável); cards ranqueados com bolinha numerada, % do total e barra de proporção vs. maior lançamento; badges coloridos (status verde/âmbar/cinza, conta azul, obra índigo, projeção violeta); fix da descrição duplicada (fornecedor só aparece se ≠ descrição). Arquivo: `FinanceiroFluxoCaixa.tsx`. ZERO schema/server change.
### 5 one-liners

- **Rev. 4585** — **FIX: FLUXO DE CAIXA — CRONOGRAMA FORA DA CONFERÊNCIA DE DUPLICIDADES.** `getPossiveisDuplicidades` exclui `origem_modulo='cronograma_atividade'` (projeções de contrato, nunca pagamentos reais); card cai de 61 p/ 31 pares. Detalhe em `shared/changelog.ts`. ZERO schema change.
- **Rev. 4584** — **FEAT: FLUXO DE CAIXA — DRILL-DOWN EM TODA A MATRIZ.** Todo valor da matriz virou clicável e abre Dialog somente-leitura com os lançamentos que formam o número; filtro espelha EXATA a agregação da matriz (Poka-Yoke por transparência). Detalhe em `shared/changelog.ts`. ZERO schema/server change.

- **Rev. 4583** — **FIX: FLUXO DE CAIXA — BALDES DE SAÍDA LEEM O PLANO DE CONTAS.** `bucketDespesa()` ganhou 2º critério `CONTA_RULES` sobre `conta_nome` (despesas da conciliação têm origem NULL); "Outros" caiu de R$ 14,5 mi p/ 1,59 mi. Detalhe em `shared/changelog.ts`. ZERO schema/server change.
- **Rev. 4582** — **FIX: FLUXO DE CAIXA — SWEEP CONTAMAX NEUTRALIZADO + TEXTOS CORRIGIDOS.** Sweep bancário separado em `sweepAplicado/sweepResgatado` (fora da linha azul) + 37 despesas CONTAMAX da 60004 → `aplicacao_financeira`. Detalhe em `shared/changelog.ts`. ZERO schema change.
- **Rev. 4581** — **FIX+FEAT: FLUXO DE CAIXA — TRANSFERÊNCIAS AO GRUPO FORA DAS SAÍDAS + CONFERÊNCIA DE DUPLICIDADES.** 36 despesas ao próprio grupo → `transferencia_interna`; card rosa de duplicidades com confirmação humana par a par (reversível). Detalhe em `shared/changelog.ts`. ZERO schema change.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4580 e anteriores.

## User preferences

- **🔒 REGRA DE OURO — POKA-YOKE EM TODA REVISÃO (25/07/2026):** Toda nova revisão/feature deve aplicar o princípio Poka-Yoke (à prova de erros): preferir SEMPRE o nível mais forte viável — (3) prevenção pelo design (máscara/select/campo que só aceita valor válido) > (2) bloqueio (validação que impede salvar dado inconsistente, ex.: data no passado, valor zero, duplicidade) > (1) aviso (alerta visual). Ao revisar um fluxo existente, identificar e propor Poka-Yokes faltantes na área tocada.

- **🔒 REGRA DE OURO — LÓGICA DO % PREVISTO (PLANEJAMENTO) É CONGELADA (Rev. 4534, 24/07/2026):** A cadeia de cálculo do PREVISTO (SEMANA) — `regenerarPrevistoSemanasCaminhoB` (motor, fallback de baseline defasada, clamp <100% da raiz), captura do literal (`previsto_literal_json`), precedência literal > raiz > snapshot no frontend (`raizAt`/`mspReadOnly`) — está VALIDADA contra o MSP real e NÃO PODE ser alterada como efeito colateral de outras melhorias. Qualquer task que precise tocar nesses caminhos deve: (1) ALERTAR o usuário explicitamente ANTES de mexer, (2) obter confirmação, (3) revalidar contra os XMLs reais do MSP após a mudança. Histórico: toda alteração "de melhoria" nessa área quebrou o sistema.

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
