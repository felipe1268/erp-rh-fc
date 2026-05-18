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

- **Rev. 2071** — **Cotações · "Prazo de Entrega" obrigatório mesmo em MDO+Medição + badge "0 PENDÊNCIAS" com erro visível.** Pedido IMG_0976+0977: "Todas informações estão corretas, não falta nada e o erro ainda persiste". Dois bugs no mesmo fluxo: (1) modal Condições de Pagamento mostrava "Por Medição" visualmente selecionado (via `moduloMedicao` persistido), mas `editTipoPag` carregava `tipoPagamento=null` de registros antigos — usuário não tocava na aba, `handleSalvar` enviava `tipoPagamento=""`, server gravava NULL, validação `isMdoMedicao` (client L2293 / server L5885) virava false e exigia Prazo de Entrega (campo inexistente no fluxo). (2) Dialog `ValidacaoErro` parseava `mensagem.split("\n").filter(l => l.startsWith("•"))` mas o template `"...preencher: • Prazo de Entrega"` deixava o bullet inline → `campos.length=0` → badge `"0 pendência"`. Fix em `client/src/pages/compras/Cotacoes.tsx`: derivar `tipoPagamentoFinal` de `mdoModoEfetivo` (fonte da verdade visível) + `\n` antes do primeiro bullet. ZERO backend.
- **Rev. 2070** — **SST Integração · cards do Dashboard mostravam 0 pendentes mesmo havendo vários.** Pedido IMG_0970: "Arrume os cards, está dizendo que tem 0 pendências e não verdade tem várias". O card "Pendentes" contava só rows com `status='pendente'` (campo legado, raramente populado), enquanto a aba Pendentes e o badge do menu (Rev. 2063/2064) já usam lógica correta: colaboradores ativos sem aprovação válida (CLT/PJ + terceiros sem doc). Fix em `server/routers/integracaoSST.ts` L1286+ (`dashboardKpis`): espelho 100% da query do `getBadgeCounts` — CTEs `last_ok` + `em_processo`, filtro anti-fantasma (`deletedAt`+`listaNegra`+`dataDemissao`), terceiros sem `integracao_doc_url`, +`emProcessoCount` pra cobrir rows pendente/em_andamento. Bônus: `total` agora soma o universo real e `taxaAprovacao` denominador atualizado. ZERO frontend, ZERO migration.

### Revisões recentes (one-liners)

- ~~Rev. 2069~~ — SST Integração · multiseleção + select-all + bulk delete nas abas Aprovados e Reprovados (espelha padrão da Pendentes, reusa endpoint `excluirRegistros`). Ver `shared/changelog.ts`.
- ~~Rev. 2068~~ — Fechamento de Ponto · fix "Voltar ao ranking" fechava a tela toda no iPad · `onInteractOutside={e.preventDefault()}` no Dialog externo. Ver `shared/changelog.ts`.
- ~~Rev. 2067~~ — Raio-X · fix `100vh`→`100dvh` no overlay (cards SST/Integração cortados no iPad Safari). Ver `shared/changelog.ts`.
- ~~Rev. 2066~~ — Raio-X · Timeline agora inclui TODAS as movimentações (Folha/VR/Adiantamentos/Rateio/Insumos/Desc Almox/Atrasos/PJ Pagamentos + Férias com 3 eventos por período). Ver `shared/changelog.ts`.
- ~~Rev. 2065~~ — Fechamento de Ponto: botão "Voltar ao ranking" nos 3 modais de memória (Atraso/HE/Faltas). Ver `shared/changelog.ts`. (introduziu bug — fixado na Rev. 2068.)

> Revisões 2064 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
