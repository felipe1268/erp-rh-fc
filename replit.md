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

- **Rev. 4591** — **FEAT: CARTÃO DE CRÉDITO — LIMITE DISPONÍVEL (PREVISÃO) QUE DESCE COM AS OCs.** Pedido: limite disponível que desce automaticamente conforme as OCs usam o cartão. Comprometido = faturas em aberto + OCs pagas no cartão ainda não faturadas (dedup pelo vínculo `financial_cartao_itens.compra_oc_id` da importação de fatura — sem dupla contagem); disponível = limite − comprometido. `listarCartoes` retorna comprometidoFatura/comprometidoOc/limiteDisponivel; `resumoParaCompra` soma OCs não faturadas (sugestão de cartão em Compras mais realista). UI: linha "Disponível (previsão)" + barra colorida por faixa (verde/âmbar/vermelho) no card da listagem + painel no modal Datas & Limite. Validado contra Neon real. Arquivos: `server/routers/cartao.ts`, `FinanceiroCartaoCredito.tsx`. ZERO schema change.
- **Rev. 4590** — **UX: CARTÃO DE CRÉDITO — MODAL "USO DO CARTÃO" COM TILES VISUAIS.** Pedido: layout moderno e mais fácil de entender no modal Editar cartão. Escopo e Finalidade deixaram de ser dropdowns com parágrafos longos e viraram nova seção "Uso do cartão" com tiles clicáveis (ícone + título + descrição curta): "De quem é o cartão?" (FC/Local) e "Para que ele serve?" (4 finalidades, cada uma com selo verde "Aparece em Compras" ou cinza "Fora de Compras") + banner dinâmico embaixo dizendo na hora se o cartão vai ou não aparecer nas Cotações/OCs. Poka-Yoke por design: consequência visível ANTES de escolher. Arquivo: `FinanceiroCartaoCredito.tsx`. ZERO schema/server change.
### 5 one-liners

- **Rev. 4589** — **FEAT: CARTÃO DE CRÉDITO — FINALIDADE DE USO + FILTRO EM COMPRAS.** Campo `finalidade` (recorrentes/corporativo/obra/geral); `resumoParaCompra` só retorna recorrentes/geral (escopo fc) — comprador nem vê o cartão errado. Detalhe em `shared/changelog.ts`.
- **Rev. 4588** — **FIX: DEPLOY — BUILD QUEBRAVA POR SCRIPT EXCLUÍDO NO .dockerignore.** `scripts/` voltou pra imagem (368 KB) + `gen-build-info` virou não-fatal (`|| echo`); server já tolera `build-info.json` ausente. Detalhe em `shared/changelog.ts`. ZERO código de app change.
- **Rev. 4587** — **FEAT: CONTAS A PAGAR — EDITAR COM AS MESMAS INFORMAÇÕES DE PAGAMENTO DO "PAGAR".** Editar ganhou cheque próprio/terceiro/débito automático, seletor de conta bancária (anti-IDOR) e cadastro de cheques pendentes no Controle. Detalhe em `shared/changelog.ts`. ZERO schema change.
- **Rev. 4586** — **UX: FLUXO DE CAIXA — POP-UP DE DETALHAMENTO ULTRA MODERNO + BUSCA RÁPIDA.** Redesign client-only do drill-down: cabeçalho em degradê + busca rápida + cards ranqueados com % do total e barra de proporção + badges coloridos + fix da descrição duplicada. Detalhe em `shared/changelog.ts`. ZERO schema/server change.
- **Rev. 4585** — **FIX: FLUXO DE CAIXA — CRONOGRAMA FORA DA CONFERÊNCIA DE DUPLICIDADES.** `getPossiveisDuplicidades` exclui `origem_modulo='cronograma_atividade'` (projeções de contrato, nunca pagamentos reais); card cai de 61 p/ 31 pares. Detalhe em `shared/changelog.ts`. ZERO schema change.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4584 e anteriores.

## User preferences

- **🔒 REGRA DE OURO — POKA-YOKE EM TODA REVISÃO (25/07/2026):** Toda nova revisão/feature deve aplicar o princípio Poka-Yoke (à prova de erros): preferir SEMPRE o nível mais forte viável — (3) prevenção pelo design (máscara/select/campo que só aceita valor válido) > (2) bloqueio (validação que impede salvar dado inconsistente, ex.: data no passado, valor zero, duplicidade) > (1) aviso (alerta visual). Ao revisar um fluxo existente, identificar e propor Poka-Yokes faltantes na área tocada.

- **🔒 REGRA DE OURO — LÓGICA DO % PREVISTO (PLANEJAMENTO) É CONGELADA (Rev. 4534, 24/07/2026):** A cadeia de cálculo do PREVISTO (SEMANA) — `regenerarPrevistoSemanasCaminhoB` (motor, fallback de baseline defasada, clamp <100% da raiz), captura do literal (`previsto_literal_json`), precedência literal > raiz > snapshot no frontend (`raizAt`/`mspReadOnly`) — está VALIDADA contra o MSP real e NÃO PODE ser alterada como efeito colateral de outras melhorias. Qualquer task que precise tocar nesses caminhos deve: (1) ALERTAR o usuário explicitamente ANTES de mexer, (2) obter confirmação, (3) revalidar contra os XMLs reais do MSP após a mudança. Histórico: toda alteração "de melhoria" nessa área quebrou o sistema.

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
