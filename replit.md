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

- **Rev. 4285** — **FIX: COTAÇÕES — DIALOG "CONDIÇÕES DE PAGAMENTO" EXIBIA DRIFT DE CENTAVOS (+R$ 0,05).** Causa raiz: branch de edição recomputava `preco_unitario × qty` para todos os itens — mas `preco_unitario` (4dp) é arredondado do valor original exato, então `preco*qty ≠ total` salvo (item 7096: 1481.03×18=26658.54 vs total=26658.49, diff=5¢). Fix em 4 pontos: (1) branch edição usa `resp.total` diretamente para itens não-alterados, recomputa só os alterados; (2) branch não-edição usa `totalOrcado` do DB; (3) backend `totaisPorFornecedor` acumula em centavos inteiros; (4) badge tabela prefere `totalOrcado`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4284** — **COTAÇÕES/COMPRAS: ADIANTAMENTO (SINAL) E RETENÇÃO DE GARANTIA NO DIALOG "CONDIÇÕES DE PAGAMENTO".** Nova seção "Adiantamento & Retenção" no dialog de Condições de Pagamento (visível apenas em contratos de medição MDO/Pacote). Adiantamento: checkbox, tipo %/valor, prazo DDL, amortização proporcional ou parcelas fixas. Retenção: checkbox, % do bruto por medição, liberação no encerramento ou etapas. 10 colunas novas em `compras_cotacao_fornecedores`, 10 em `compras_ordens`, 3 em `terceiro_medicoes`. Bridge financeiro calcula deduções automaticamente ao criar lançamento. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4283** — **FIX: COTAÇÕES — DRIFT DE CENTAVOS NO DIALOG "CONDIÇÕES DE PAGAMENTO".** Fix backend: acumula `totalOrcado` em centavos inteiros. Fix frontend (incompleto — corrigido em Rev. 4285). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4282** — **CONTROLE DE CHEQUES: "VER PAGAMENTO" EXIBE VALOR TOTAL DO PIX QUANDO ALOCAÇÃO É PARCIAL.** PIX R$ 5.800,00 → 2 cheques de R$ 2.900,00: popover mostra o alocado + linha âmbar "Valor total do PIX: R$ 5.800,00 · alocado a este cheque: R$ 2.900,00". Backend: `getVinculosPorChequeNumero` retorna `valorLinhaPix`; frontend: `isParcial` + riscado. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4281** — **FIX: CONTROLE DE CHEQUES — autoMarcarChequesDevolvidos SOBRESCREVIA STATUS COMPENSADO.** Fix: `AND data_compensacao IS NULL` no SELECT e UPDATE. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4280** — **CONCILIAÇÃO: ALERTAS DE COBERTURA NO PAINEL "QUITAR CHEQUES DEVOLVIDOS".** Verde/âmbar/vermelho por totalSel vs pixVal. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4279** — **CONCILIAÇÃO: STATUS DO CHEQUE DEVOLVIDO SINCRONIZA COM CONTROLE DE CHEQUES (bidirecional).** 3 bugs em camadas: `chequeNumero` nunca passado, INSERT NULL, desconciliar não estornava vínculos. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4278** — **FIX: CONCILIAÇÃO — 1 PIX → N CHEQUES DEVOLVIDOS SÓ MOSTRAVA O PRIMEIRO.** `vincByPix` Map sobrescrevia; alterado para array com push. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4277** — **CONCILIAÇÃO BANCÁRIA: RESUMO DOS CHEQUES JÁ VINCULADOS NO HEADER DO PAINEL.** Backend: `listVinculosByPixLine`; frontend: count + lista com ✓. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4276** — **FIX: QUITAR CHEQUES DEVOLVIDOS — LISTA SEMPRE VAZIA (3 BUGS EM CAMADAS).** status nunca gravado; `desconsiderado_em IS NULL` bloqueava confirmados; param-binding $1×3. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4267 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
