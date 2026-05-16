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

- **Rev. 1894**: **Planejamento · Programação Semanal LOTUS · PINTURA DE PREVISTO E REALIZADO agora RESPEITA o CUTOFF** (tela + export Excel). User (16/05/2026, screenshot do Excel): "TEM OUTRO ERRO, A PINTURA DEVE DO PREVISTO E REALIZADO REVE RESPEITAR O CUTOFF". **Causa**: `faixasCelula(...)` pintava o envelope previsto completo + qualquer real, ignorando o status-date oficial. Padrão LOTUS/PMBOK: relatório é foto da obra ATÉ o cutoff — dias > cutoff devem ficar EM BRANCO. **Mudanças** (em `ProgramacaoSemanalLotus.tsx`): (1) L168-174: novo parâmetro `cutoffStr: string|null = null` em `faixasCelula`. (2) L177-178: guard `if (cutoffStr && ds > cutoffStr) return {top:null, bottom:null}` corta TODA pintura após o cutoff. (3) L326-335: novo memo `cutoffStrGlobal = cutoffIso?.slice(0,10) ?? null` acessível por tela + export. (4) L1399 (export) e L1798 (tela): passam `cutoffStrGlobal` no `faixasCelula` — paridade absoluta. (5) version → 1894. **Preservado**: Rev. 1785 (PPC fechamento semana), Rev. 1875 (sáb/dom extras), Rev. 1664.1/1677/1688 (auto-derivação real), Rev. 1886 (override TOP=azul no export), Rev. 1893 (cinza Sáb/Dom) INTACTAS — cutoff só REMOVE pintura > cutoff; ds ≤ cutoff roda como antes. Sem cutoffIso, comportamento legado. Zero backend/DB/schema. Reversível em 4 hunks + version bump. R-001/R-007/R-010 OK.
- **Rev. 1893**: **Planejamento · Programação Semanal LOTUS · EXPORT EXCEL · Sábado (col 15) e Domingo (col 16) agora SAEM PREENCHIDOS DE CINZA** conforme padrão do cliente. User (16/05/2026, 2 screenshots): "FALTA PREENCHER DE CINZA OS DIAS DE SABADO E DOMINGO CONFOREM O PADRAO DO CLIENTE". **Causa**: Rev. 1889 fez `fill:none` em B-P das linhas de grupo p/ tirar cinza herdado — limpou demais e arrancou Sáb/Dom também. Nas linhas de tarefa, o template não tinha cinza confiável e o loop de dias só pinta quando há previsto/realizado. **Mudanças** (em `ProgramacaoSemanalLotus.tsx` dentro de `handleExportExcel`): (1) L1306-1321: novo helper `pintaCinzaFds(r0)` aplica `#FFD9D9D9` nas 4 linhas do slot em cols 15 e 16. (2) L1334: strip da linha de grupo mudou `cIdx<=16` → `cIdx<=14` (não arranca mais cinza de Sáb/Dom). (3) L1339: após strip, chama `pintaCinzaFds` na linha de grupo. (4) L1345-1349: na linha de tarefa, chama `pintaCinzaFds` ANTES do loop dos dias — cinza vira fundo padrão e `dias.forEach` sobrescreve naturalmente quando há trabalho em sáb/dom (Rev. 1875). (5) version → 1893. **Preservado**: Rev. 1886/1889 INTACTAS (override azul/status, minWidths E/F/G/H=12, strip cols 2-14 grupo), Rev. 1818 (responsavel.labelCurto), Rev. 1875 (dias_trabalhados_extras sobrescreve quando há faixa). Zero backend/DB/schema/tela. Reversível em 1 hunk + version bump. R-001/R-007/R-010 OK.
- **Rev. 1892**: **Planejamento · Cronograma · UX · Cascata AUTOMÁTICA do RESPONSÁVEL ciano em itens marcados como GRUPO/RESUMO** (sem modal). User (16/05/2026, screenshot "NAVE NORTE"): "QUANDO EU CLICAR NO BOTÃO DE ATRIBUIR RESPONSAVEL NO ITEM QUE TBM FOI DEMARCADO COMO GRUPO… TODAS ATIVIDADES ABAIXO DEVEM SER PREENCHIDAS AUTOMATICAMENTE POR ELES. CASO TENHA ALGUMA QUE NÃO FAÇA PARTE O USUÁRIO MUDARA AUTOMATICAMENTE DEPOIS." **Contexto**: Rev. 1860/1865 sempre abria modal AlertDialog (3 opções) quando pai tinha descendentes — fricção desnecessária em GRUPO (já declarado resumo). **Mudança** (em `PlanejamentoDetalhe.tsx` L4094-4119, dentro do `onBlur` do input ciano): novo ramo `if (a.isGrupo)` aplica `{responsavelLotus, _respManual:true}` em todos `descIdxs` num único `setLinhas` (= "Sobrescrever todos" do modal), toast `Grupo "<nome>": responsável aplicado a N descendentes (M sobrescritos)`, `return` imediato sem abrir modal. NÃO-grupo: comportamento Rev. 1860/1865 INTOCADO (modal continua p/ proteger mudanças acidentais em folhas com sub-itens). version → 1892. **Preservado**: detecção descendentes dotted+flat+nivel guard literal; cálculo semValor/comValor literal; modal cascadeResp JSX intacto; save mutation Rev. 1891 sem mudança; backend/DB/schema zero alteração. Reversível em 1 hunk + version bump. R-001/R-007/R-010 OK.
- **Rev. 1891**: **Planejamento · BUG-FIX CRÍTICO · RESPONSÁVEL digitado no Cronograma (campo ciano `responsavelLotus`) NÃO aparecia na Programação Semanal LOTUS** (regressão silenciosa desde Rev. 1817). User (16/05/2026): "estou indicando o responsavel pela atividade no cronograma, mas não esta aparecendo na programação semanal.. corrija este bug.. sem atrapalhar ou perder nada". **Causa**: `planejamento_atividades` NÃO tem coluna `company_id`, mas `server/routers/planejamento.ts` lia `rows[0].companyId` em 3 lugares — sempre `undefined`. Em `listarAtividades` L795 o `if (projetoId && companyId)` em volta de `resolverResponsaveisBatch` falhava 100% → `respMap` vazio → `a.responsavel: null` → PSEM mostrava placeholder "FC" em vez do "Rohr" digitado. Persistência (`responsavel_lotus`) sempre funcionou; só o READ-back estava quebrado. **Mudanças** (server/routers/planejamento.ts): (1) L723-761: ampliei o lookup `planejamento_projetos` que já buscava `dataCorteAtual` p/ trazer TAMBÉM `companyId` (0 query nova). Guard multi-tenant agora usa `projetoCompanyId` real. (2) L797-821: `resolverResponsaveisBatch` recebe `projetoIdAtual ?? rows[0].projetoId` + `projetoCompanyId`; adicionado warn se skip. (3) `kpiResponsavelPorProjeto` L891-915: novo select de `planejamentoProjetos.companyId` via projetoId; guard comparado com companyId real; degrada graciosamente p/ `[]` se não resolver. (4) version → 1891. **Preservado**: zero schema/migration/DELETE; INSERT/UPDATE de `responsavel_lotus` intacto (Rev. 1823/1838/1846); hierarquia externa→manual→contrato→FC (Rev. 1817/1818) intacta; cleanup legado MSP Rev. 1846 intacto; cascade pais→filhos Rev. 1860/1865 intacto; client/PSEM/cronograma/REFIS sem mudança. Reversível em 3 hunks + version bump. R-001/R-007/R-010 OK.
- **Rev. 1890**: **Planejamento · Detalhe da Obra · REFIS · REDESIGN do Drill-down EAP — sai de DENTRO de cada NAVE e vira UM ÚNICO BLOCO CONSOLIDADO abaixo de todas as NAVEs**. User (16/05/2026, após Rev. 1887, 2 screenshots): "Não quero desta forma quero refaça o layout, quero ele abaixo todos tópicos... seja criativo e prático, o usuário não pode ficar confuso". **Causa**: Rev. 1887 colocou o drill-down DENTRO de cada card de NAVE — em obra com N pavimentos o controle aparecia repetido N vezes. **Mudanças** (em `PlanejamentoDetalhe.tsx`): (1) L13490-13493: REMOVIDA toda UI de drill-down dentro do map do BLOCO 5 (~115 linhas) — só substituída por comentário. BarChart por etapa + mini-legenda desvios >5pp permanecem em cada card. (2) L13515-13720: NOVO BLOCO 5B consolidado entre último card de NAVE e BLOCO 6 — header gradient indigo→blue + 2 ações globais (Expandir tudo / Recolher tudo, disabled no estado-alvo) + legenda sticky de cores + cada NAVE como linha clicável (EAP-badge, nome bold, Prev/Real/Desvio) que ao abrir expande árvore recursiva via `renderRow(e,depth)` (chevron + EAP mono + nome + mini-barra dupla + Prev/Real/Desvio tabular, indentação 12+depth*18). (3) helper `collectIds(lista)` recursivo p/ "Expandir tudo" popular `expandedEtapas`. (4) states/toggles reusados da Rev. 1887. (5) version → 1890. **Preservado**: BarChart por NAVE, mini-legenda atraso>5pp, useMemo grupos + buildSubgrupos, descendentes/calc/prevInd/realMap, collapsedGrupos, BLOCO 6, export PDF/print (bloco nasce recolhido). Zero backend/DB/schema. Reversível em ~3 hunks + version bump. R-001/R-007/R-010 OK.
