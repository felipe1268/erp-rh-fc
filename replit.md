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

- **Rev. 4461** — **FIX: DESMARCAR SERVIÇO EAP NA SC E SALVAR NÃO PERSISTE (REABRE COM ITEM AINDA MARCADO).** Race condition entre cache stale do React Query e abertura do form de edição. `detalheQ` fica desabilitada (`showDetalhe=null`) durante edição → `detalheQ.refetch()` no `onSuccess` era no-op → cache ficava com dados antigos → reabrindo o detalhe rapidamente e clicando "Editar" populava o form com dados stale. Fix: (A) `onSuccess` usa `trpcCtx.compras.getSolicitacao.invalidate()` em vez do no-op refetch; (B) handler do botão "Editar" agora faz `await trpcCtx.compras.getSolicitacao.fetch()` antes de popular o form. O servidor (branch `hasLinkedCot`) já estava correto desde Rev. 4458/4459. ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4460** — **FIX: "SEM ACESSO A ESTA EMPRESA" AO MARCAR ITEM DO ALMOXARIFADO COMO EQUIPAMENTO.** `vincularItemAlmoxarifado` e `desvincularItemAlmoxarifado` usavam guard quebrado: `getCompaniesForUser` retorna objetos, não IDs → `allowed.includes(numericId)` sempre false → FORBIDDEN universal. Fix: padrão canônico com `getUserCompanyLinks` (admin bypass + vínculos reais + sem vínculos = libera). ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4459** — **FIX: ITENS NOVOS ERAM DELETADOS LOGO APÓS INSERT (ORDEM ERRADA NO BRANCH `hasLinkedCot`).** Após Rev. 4458, o DELETE de itens removidos acontecia DEPOIS do INSERT dos novos, incluindo os recém-inseridos no snapshot de `existingItems` → apagava os próprios itens que acabara de criar. Fix: mover DELETE para antes do INSERT. ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4458** — **FIX: ITENS DA SC NÃO ERAM SALVOS AO EDITAR SC COM COTAÇÃO VINCULADA.** `ItemForm` sem `id`; mapeamento e payload nunca enviavam o id. Servidor no branch `hasLinkedCot` só processava itens com `id` → `inputItemIds=[]` → zero UPDATE/DELETE/INSERT. Fix em 4 pontos. ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4457** — **FIX: CAMPOS DE LOCAÇÃO NÃO PERSISTIAM AO EDITAR SC DE EQUIPAMENTO.** `getSolicitacao` omitiu os 4 campos de locação no retorno. ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4456** — **FEAT: FICHA COMPLETA DO FORNECEDOR (PÁGINA FULL-SCREEN) + EXCLUSÃO DEFINITIVA.** Clicar no nome da empresa navega para `/compras/fornecedores/:id`. Para inativas: 🗑️ hard DELETE com guard de vínculos. ZERO ALTER destrutivo.
- **Rev. 4455** — **FIX: VR/VA NÃO PAGO NOS DIAS DE FÉRIAS (CUSTO RH + GERAÇÃO DE VALE).** Fix em scorecard.ts + valeAlimentacao.ts. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4413 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
