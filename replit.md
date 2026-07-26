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

- **Rev. 4595** — **FEAT: CONTROLE DE CHEQUES — BLOQUEIO DE Nº DE CHEQUE DUPLICADO (POKA-YOKE) + LIMPEZA DE DUPLICATAS.** Limpeza direto no Neon: 10 duplicatas de 2026 soft-deletadas (zeros à esquerda "000531"×"531", relançamento em mês errado, planilha importada 2×), mantendo sempre a versão compensada/conciliada; série J ALVES 516–520 corrigida (517 dup excluído, 518/519 vencimentos ajustados, 520 criado). Regra nova server-side em `cheques.ts`: `assertNumeroChequeDisponivel` bloqueia (CONFLICT) lançar/editar cheque com nº normalizado já existente na mesma conta bancária OU fornecedor — aplicado em criarManual, criarManualLote (+ unicidade dentro do lote) e atualizar (só quando o nº muda). Mensagem diz qual cheque já existe; importação de planilha mantém dedup idempotente. ZERO schema change. Arquivos: `server/routers/cheques.ts`.
- **Rev. 4594** — **FEAT: CONTAS A PAGAR — FATURA DE CARTÃO IDENTIFICADA + OPÇÕES TOTAL / MÍNIMO / PARCIAL.** Importador extrai `pagamentoMinimo` da fatura (prompt+schema) → coluna nova `pagamento_minimo` ([SyncSchema+] 4594, validada no Neon); nova query `cartao.faturaPorEntry` (tenant guard) identifica banco/final4/mês da fatura no título; dialog "Pagar" ganha painel "💳 Cartão {banco} final {final4}" com tiles Pagar total / Pagamento mínimo / Valor parcial que preenchem o Valor + aviso Poka-Yoke quando valor < mínimo. Código curto "CARTÃO-{id}" e label "Fatura de Cartão". Arquivos: `cartao.ts`, `_core/index.ts`, `financialOrigins.ts`, `FinanceiroContasAPagar.tsx`.
### 5 one-liners

- **Rev. 4593** — **FEAT: CARTÃO DE CRÉDITO — FATURA ENTRA AUTOMATICAMENTE NO CONTAS A PAGAR (VÍNCULO BIDIRECIONAL).** Fatura vira título (origem 'cartao_fatura', idempotente); baixa no Contas a Pagar faz fan-out pro acumulado da fatura; coluna nova `financial_entry_id`. Detalhe em `shared/changelog.ts`.
- **Rev. 4592** — **FIX: CARTÃO DE CRÉDITO — SALDO EM ABERTO LIDO COMO O BANCO LÊ.** Fatura em aberto = só vencimento >= hoje, abatendo só `pagamentos > 0`; OCs a faturar = só criadas após o último fechamento. Validado no Neon. Detalhe em `shared/changelog.ts`. ZERO schema/client change.
- **Rev. 4591** — **FEAT: CARTÃO DE CRÉDITO — LIMITE DISPONÍVEL (PREVISÃO) QUE DESCE COM AS OCs.** Comprometido = faturas em aberto + OCs pagas no cartão não faturadas (dedup via `compra_oc_id`); disponível = limite − comprometido; barra colorida no card + painel no modal. Detalhe em `shared/changelog.ts`. ZERO schema change.
- **Rev. 4590** — **UX: CARTÃO DE CRÉDITO — MODAL "USO DO CARTÃO" COM TILES VISUAIS.** Escopo/Finalidade viraram tiles clicáveis com selo "Aparece em Compras"/"Fora de Compras" + banner dinâmico — consequência visível antes de escolher. Detalhe em `shared/changelog.ts`. ZERO schema/server change.
- **Rev. 4589** — **FEAT: CARTÃO DE CRÉDITO — FINALIDADE DE USO + FILTRO EM COMPRAS.** Campo `finalidade` (recorrentes/corporativo/obra/geral); `resumoParaCompra` só retorna recorrentes/geral (escopo fc) — comprador nem vê o cartão errado. Detalhe em `shared/changelog.ts`.
### Histórico completo

Ver `replit-history.md` para revisões Rev. 4588 e anteriores.

## User preferences

- **🔒 REGRA DE OURO — POKA-YOKE EM TODA REVISÃO (25/07/2026):** Toda nova revisão/feature deve aplicar o princípio Poka-Yoke (à prova de erros): preferir SEMPRE o nível mais forte viável — (3) prevenção pelo design (máscara/select/campo que só aceita valor válido) > (2) bloqueio (validação que impede salvar dado inconsistente, ex.: data no passado, valor zero, duplicidade) > (1) aviso (alerta visual). Ao revisar um fluxo existente, identificar e propor Poka-Yokes faltantes na área tocada.

- **🔒 REGRA DE OURO — LÓGICA DO % PREVISTO (PLANEJAMENTO) É CONGELADA (Rev. 4534, 24/07/2026):** A cadeia de cálculo do PREVISTO (SEMANA) — `regenerarPrevistoSemanasCaminhoB` (motor, fallback de baseline defasada, clamp <100% da raiz), captura do literal (`previsto_literal_json`), precedência literal > raiz > snapshot no frontend (`raizAt`/`mspReadOnly`) — está VALIDADA contra o MSP real e NÃO PODE ser alterada como efeito colateral de outras melhorias. Qualquer task que precise tocar nesses caminhos deve: (1) ALERTAR o usuário explicitamente ANTES de mexer, (2) obter confirmação, (3) revalidar contra os XMLs reais do MSP após a mudança. Histórico: toda alteração "de melhoria" nessa área quebrou o sistema.

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
