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
- `server/`: Express backend + tRPC routers
  - `server/_core/`: Auth, OAuth, Vite setup, env config
  - `server/routers/`: tRPC routers per módulo
  - `server/db.ts`: Database helpers
- `drizzle/`: Schema and migrations
- `shared/`: Shared types and constants (`shared/version.ts`, `shared/changelog.ts`, `shared/paymentConditions.ts`, `shared/modules.ts`)
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: tRPC routers in `server/routers/`
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui` components

## Recent changes

> **Convenção (importante)**: este arquivo guarda APENAS as últimas **5 revisões**, em formato curto (1–3 linhas: o quê + por quê).
> Quando entrar uma nova revisão, **remova a mais antiga daqui** — o histórico completo (com causa-raiz, stack traces, nomes de arquivos, etc.) vive em `shared/changelog.ts`.
> Não duplique conteúdo entre os dois arquivos.

- **Rev. 1892**: **Planejamento · Cronograma · UX · Cascata AUTOMÁTICA do RESPONSÁVEL ciano em itens marcados como GRUPO/RESUMO** (sem modal). User (16/05/2026, screenshot "NAVE NORTE"): "QUANDO EU CLICAR NO BOTÃO DE ATRIBUIR RESPONSAVEL NO ITEM QUE TBM FOI DEMARCADO COMO GRUPO… TODAS ATIVIDADES ABAIXO DEVEM SER PREENCHIDAS AUTOMATICAMENTE POR ELES. CASO TENHA ALGUMA QUE NÃO FAÇA PARTE O USUÁRIO MUDARA AUTOMATICAMENTE DEPOIS." **Contexto**: Rev. 1860/1865 sempre abria modal AlertDialog (3 opções) quando pai tinha descendentes — fricção desnecessária em GRUPO (já declarado resumo). **Mudança** (em `PlanejamentoDetalhe.tsx` L4094-4119, dentro do `onBlur` do input ciano): novo ramo `if (a.isGrupo)` aplica `{responsavelLotus, _respManual:true}` em todos `descIdxs` num único `setLinhas` (= "Sobrescrever todos" do modal), toast `Grupo "<nome>": responsável aplicado a N descendentes (M sobrescritos)`, `return` imediato sem abrir modal. NÃO-grupo: comportamento Rev. 1860/1865 INTOCADO (modal continua p/ proteger mudanças acidentais em folhas com sub-itens). version → 1892. **Preservado**: detecção descendentes dotted+flat+nivel guard literal; cálculo semValor/comValor literal; modal cascadeResp JSX intacto; save mutation Rev. 1891 sem mudança; backend/DB/schema zero alteração. Reversível em 1 hunk + version bump. R-001/R-007/R-010 OK.
- **Rev. 1891**: **Planejamento · BUG-FIX CRÍTICO · RESPONSÁVEL digitado no Cronograma (campo ciano `responsavelLotus`) NÃO aparecia na Programação Semanal LOTUS** (regressão silenciosa desde Rev. 1817). User (16/05/2026): "estou indicando o responsavel pela atividade no cronograma, mas não esta aparecendo na programação semanal.. corrija este bug.. sem atrapalhar ou perder nada". **Causa**: `planejamento_atividades` NÃO tem coluna `company_id`, mas `server/routers/planejamento.ts` lia `rows[0].companyId` em 3 lugares — sempre `undefined`. Em `listarAtividades` L795 o `if (projetoId && companyId)` em volta de `resolverResponsaveisBatch` falhava 100% → `respMap` vazio → `a.responsavel: null` → PSEM mostrava placeholder "FC" em vez do "Rohr" digitado. Persistência (`responsavel_lotus`) sempre funcionou; só o READ-back estava quebrado. **Mudanças** (server/routers/planejamento.ts): (1) L723-761: ampliei o lookup `planejamento_projetos` que já buscava `dataCorteAtual` p/ trazer TAMBÉM `companyId` (0 query nova). Guard multi-tenant agora usa `projetoCompanyId` real. (2) L797-821: `resolverResponsaveisBatch` recebe `projetoIdAtual ?? rows[0].projetoId` + `projetoCompanyId`; adicionado warn se skip. (3) `kpiResponsavelPorProjeto` L891-915: novo select de `planejamentoProjetos.companyId` via projetoId; guard comparado com companyId real; degrada graciosamente p/ `[]` se não resolver. (4) version → 1891. **Preservado**: zero schema/migration/DELETE; INSERT/UPDATE de `responsavel_lotus` intacto (Rev. 1823/1838/1846); hierarquia externa→manual→contrato→FC (Rev. 1817/1818) intacta; cleanup legado MSP Rev. 1846 intacto; cascade pais→filhos Rev. 1860/1865 intacto; client/PSEM/cronograma/REFIS sem mudança. Reversível em 3 hunks + version bump. R-001/R-007/R-010 OK.
- **Rev. 1890**: **Planejamento · Detalhe da Obra · REFIS · REDESIGN do Drill-down EAP — sai de DENTRO de cada NAVE e vira UM ÚNICO BLOCO CONSOLIDADO abaixo de todas as NAVEs**. User (16/05/2026, após Rev. 1887, 2 screenshots): "Não quero desta forma quero refaça o layout, quero ele abaixo todos tópicos... seja criativo e prático, o usuário não pode ficar confuso". **Causa**: Rev. 1887 colocou o drill-down DENTRO de cada card de NAVE — em obra com N pavimentos o controle aparecia repetido N vezes. **Mudanças** (em `PlanejamentoDetalhe.tsx`): (1) L13490-13493: REMOVIDA toda UI de drill-down dentro do map do BLOCO 5 (~115 linhas) — só substituída por comentário. BarChart por etapa + mini-legenda desvios >5pp permanecem em cada card. (2) L13515-13720: NOVO BLOCO 5B consolidado entre último card de NAVE e BLOCO 6 — header gradient indigo→blue + 2 ações globais (Expandir tudo / Recolher tudo, disabled no estado-alvo) + legenda sticky de cores + cada NAVE como linha clicável (EAP-badge, nome bold, Prev/Real/Desvio) que ao abrir expande árvore recursiva via `renderRow(e,depth)` (chevron + EAP mono + nome + mini-barra dupla + Prev/Real/Desvio tabular, indentação 12+depth*18). (3) helper `collectIds(lista)` recursivo p/ "Expandir tudo" popular `expandedEtapas`. (4) states/toggles reusados da Rev. 1887. (5) version → 1890. **Preservado**: BarChart por NAVE, mini-legenda atraso>5pp, useMemo grupos + buildSubgrupos, descendentes/calc/prevInd/realMap, collapsedGrupos, BLOCO 6, export PDF/print (bloco nasce recolhido). Zero backend/DB/schema. Reversível em ~3 hunks + version bump. R-001/R-007/R-010 OK.
- **Rev. 1889**: **Planejamento · Programação Semanal LOTUS · EXPORT EXCEL: remove cinza herdado do TEMPLATE nas linhas de grupo + força largura 12 nas 4 colunas de data**. User (16/05/2026, após Rev. 1886): "o ERP ainda esta pintando de cinza as celulas tire isso e deixa sem preenchimento.., as colunas das datas não foram ajustadas.. adota a largura de 12.. ISSO VAI FUNCIONAR." **Causa**: (a) Rev. 1886 tirou nosso fill cinza manual, MAS o template `.xlsx` do cliente já vem com cinza nas linhas de grupo — sem sobrescrever, ExcelJS preserva. (b) `minWidths` E/F/G/H estavam 10 + comparador "só aumenta se menor"; template tinha ~7.x e 10 ainda era estreito. **Mudanças** (em `ProgramacaoSemanalLotus.tsx` dentro de `handleExportExcel`): (1) L1311-1322: linhas de grupo agora forçam `fill={type:"pattern",pattern:"none"}` em B-P (cols 2-16) sobrescrevendo o cinza do template. Linhas de tarefa intocadas (faixas dos dias J-P continuam pintadas normalmente). (2) L1150-1164: minWidths E/F/G/H 10→12 (exato do user), I 14→16; removido o `if (col.width < minW)` — agora SEMPRE força (`col.width = minW`). (3) version → 1889. **Preservado**: Rev. 1886 INTACTA (fmtCurto, override TOP=azul/BOTTOM=status, cores, logos, merges, cabeçalho), cálculos PV/EV, tela inalterada, Sáb/Dom do template não afetados (só limpamos GRUPOS). Zero backend/DB/schema. Reversível em ~2 hunks + version bump. R-001/R-007/R-010 OK.
- **Rev. 1888**: **Frotas · Sidebar · Dashboards específicos saíram da seção "Painel" e ganharam ABA PRÓPRIA "Dashboards" (mesmo padrão de RH-DP/SST)**. User (16/05/2026, após Rev. 1887, screenshot sidebar Frotas): "Separe os dash na aba de dash, não do painel. Faça conforme fizemos nos outros módulos." **Causa**: Rev. 1881 (hot-patch) adicionou os 3 dashes direto na seção "Painel", poluindo (5 itens, 3 dashes). Padrão em RH-DP (L127) / SST (L208) já era "Painel" = visão geral + "Dashboards" = drill-down por área. **Mudanças** (em `DashboardLayout.tsx` L569-587, `menuSectionsFrotas`): (1) "Painel" enxuta → 2 itens: Dashboard Frotas + Analítico. (2) NOVA seção "Dashboards" com 3 itens: Dash Manutenção (Wrench), Dash Combustível (Fuel), Dash Pedágios (Receipt) — mesmas rotas/ordem. (3) version → 1888. **Preservado**: rotas (`/frotas/*-dashboard`) inalteradas; permissões/feature-keys (`shared/modules.ts` L511-513), `shared/modulePages.ts` mapping, RouteGuards, App.tsx — tudo intocado. Zero backend/DB/schema. Reversível em 1 hunk + version bump. R-001/R-007/R-010 OK.
