# ERP RH & DP — FC Engenharia

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

- **Rev. 2069** — **SST Integração · multiseleção + select-all + bulk delete nas abas Aprovados e Reprovados.** Pedido IMG_0971+0972: "faltou a multi seleção para apagar tudo, selecionado todos de uma vez nas duas abas". Até a Rev. 2068 só Pendentes tinha o padrão (Rev. 2045). Fix em `client/src/pages/sst/IntegracaoSST.tsx` espelhando 100% da Pendentes nas duas abas: `selecionados:Set<number>` + `confirmExcluir` + `excluirMut = trpc.integracaoSST.excluirRegistros` (endpoint já existe, soft-delete, scope por companyId), coluna checkbox no header (com `indeterminate`) e por linha (com highlight), coluna "Ações" com Trash2 por linha, botão bulk "Excluir N selecionado(s)" que aparece condicionalmente, AlertDialog de confirmação. Aprovados verde, Reprovados vermelho. ZERO backend, ZERO migration — endpoint já não filtrava status. Como servidor só considera `status='aprovado' AND deletedAt IS NULL` como integração válida, excluir um aprovado naturalmente devolve o colaborador pra Pendentes (comportamento documentado no AlertDialog).
- **Rev. 2068** — **Fechamento de Ponto · botão "Voltar ao ranking" parou de fechar a tela toda (regressão da Rev. 2065).** Pedido IMG_0968+0969: "quando eu clico no voltar ao ranking ele tá fechando a tela...não voltando". Bug raiz: os modais de detalhe (Atraso/HE/Faltas) são **irmãos** do Dialog do ranking (não filhos), e o Radix porta cada um na raiz do DOM. No iPad, ao tocar no botão, o inner fecha mas o evento bubble continua e o Radix do ranking interpreta como "tap fora" → dispara `onInteractOutside` → fecha o ranking também. Fix em `client/src/pages/FechamentoPonto.tsx` L2256-2261: adicionar `onInteractOutside={e.preventDefault()}` + `onPointerDownOutside={e.preventDefault()}` no `DialogContent` do ranking. Como ele já é `w-screen h-screen`, não tem "área fora" relevante mesmo — só fecha via X embutido ou Escape. ZERO lógica.

### Revisões recentes (one-liners)

- ~~Rev. 2067~~ — Raio-X · fix `100vh`→`100dvh` no overlay (cards SST/Integração cortados no iPad Safari). Ver `shared/changelog.ts`.
- ~~Rev. 2066~~ — Raio-X · Timeline agora inclui TODAS as movimentações (Folha/VR/Adiantamentos/Rateio/Insumos/Desc Almox/Atrasos/PJ Pagamentos + Férias com 3 eventos por período). Ver `shared/changelog.ts`.
- ~~Rev. 2065~~ — Fechamento de Ponto: botão "Voltar ao ranking" nos 3 modais de memória (Atraso/HE/Faltas). Ver `shared/changelog.ts`. (introduziu bug — fixado na Rev. 2068.)
- ~~Rev. 2064~~ — SST badge do menu lateral REALMENTE funciona · `sql\`ANY(${ids})\`` do Drizzle não serializa array JS; fix em `getBadgeCounts` com `sql.raw(\`ANY(ARRAY[...]::int[])\`)` validado por Zod. Ver `shared/changelog.ts`.
- ~~Rev. 2063~~ — SST badge do menu lateral: contagem passa a incluir terceiros (`funcionarios_terceiros` SEM `integracaoDocUrl`). Ver `shared/changelog.ts`.

> Revisões 2062 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
