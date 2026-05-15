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

- **Rev. 1843**: **Impressão/PDF (global) — toggle Retrato/Paisagem + matar página em branco em definitivo**. User (15/05/2026, screenshot do dialog do navegador sobre /dashboards/controle-documentos com '5 folhas de papel', maioria vazias): "melhore a pagina de impressão, dando a opção de fazer em paisagem ou retrato e não quero pagina em branco arrume isso de vez..". **Causas**: (a) `PrintActions.tsx` (componente global, REGRA DE OURO em todas as telas) só tinha botões Imprimir/PDF chamando `window.print()` cru — usuário tinha que escolher orientação no dialog do Chrome. (b) Apesar das regras R-012 já em `index.css` L256-490, ainda sobravam páginas trailing por `div:empty` e `space-y-*` deixando margin-bottom no último filho. **Fix (2 arquivos, 3 hunks)**: (1) `client/src/components/PrintActions.tsx` reescrito — `ToggleGroup` Retrato/Paisagem (default portrait, ícones `RectangleVertical`/`RectangleHorizontal`); função `applyOrientationAndPrint(o)` injeta `<style id='__print_orientation_runtime__' media='print'>` com `@page { size: A4 ${o}; margin: ... }` (margens menores em paisagem) + reforço anti-blank inline; seta `data-print-orientation` no `<body>`; `afterprint` listener faz cleanup; useEffect de cleanup no unmount cobre fechamento de tela. (2) `client/src/index.css` L549-595 — bloco 'Rev. 1843' dentro do `@media print`: `div:empty/section:empty/article:empty/aside:empty/p:empty { display:none }` em `.print-area`; último filho de `.print-area`/body/main/#root com `margin-bottom:0 + page-break-after: avoid`; último filho de `.space-y-{2,3,4,5,6,8}` com `margin-bottom:0`; ajustes seletivos para landscape via `body[data-print-orientation='landscape']` (table font 9.5px, grid gap 6px). (3) Demais telas: ZERO mudança — propaga automaticamente onde `PrintActions` já é usado (DashControleDocumentos, RelatorioHabilidadesObra, Equipes, Comunicados etc.). Implementações específicas com `window.print()` inline (PlanejamentoDetalhe atrasos/refis, Lotus) NÃO são tocadas — usam pattern visibility:visible que não sofre do problema. **Preservado**: ZERO backend/contrato/schema/migration/DELETE; PrintHeader/PrintFooterLGPD intactos; regras R-012 pré-existentes complementadas, não substituídas. Reversível em 3 hunks. R-001 OK.
- **Rev. 1842**: **Planejamento · Avanço Físico (top bar) — paridade absoluta com card 'Previsto (Semana)' do Avanço Semanal**. User (15/05/2026, 2 screenshots): "quero que seja a mesma informação lida para os dois, considerando a data cutoff". **Causa-raiz**: dois cálculos de fim-de-semana divergentes para o MESMO conceito. (a) Top bar (`avancoAtual` L547, `avancoPrevistoDia` L601) usava `semanaVisualizacao + 7 * 86400000` (naive, Mon→Mon=Sex). (b) Card 'PREVISTO (SEMANA)' (L4985) usa `cutoffWeekFromMonday(semanaAtual, cutoffDow).fim` (respeita cutoff=Qui→fim=Qui). Para 2ª sem com cutoff=Qui, top calculava até 15/05 (3.82%/-0.51%) e bottom até 14/05 (3.13%/+0.19%). **Fix (1 arquivo, 5 hunks)**: (1) L425 parent scope (após `dataCorteInfo` L415 p/ evitar TDZ) — `const cutoffDowTop = (dataCorteInfo as any)?.diaCorteSemana ?? 4`. (2) L547 `avancoAtual` — `semFim = cutoffWeekFromMonday(semanaVisualizacao, cutoffDowTop).fim`. (3) L552/L603 — `naSemanaCorrente` agora `cutoffOficial <= semFim` (semFim virou inclusivo no dia do cutoff). (4) L601 `avancoPrevistoDia` — mesma substituição. (5) Deps arrays L577/L625 ganham `cutoffDowTop` para reagir a mudança de dia de cutoff. **Esperado**: top bar = card inferior em qualquer semana e cutoffDow. **Preservado**: ZERO backend/schema/contrato. `cutoffWeekFromMonday`/`mondayOfCutoffWeek` (L100-115) intactas. Toggle Live/Oficial (Rev. 1637), Paridade MSP (Rev. 1833), refisComIndiretasGlobal (Rev. 1584) intactos. Sem semana selecionada, top mantém lock no cutoff oficial (Rev. 1655). Reversível em 5 hunks. R-001 OK.
- **Rev. 1841**: **Apontamentos de Campo · Modal 'Detalhes da ocorrência' — modal maior, sem barras de rolagem**. User (15/05/2026, screenshot do modal sobre Apontamentos de Campo com scrollbar horizontal): "arrume esta tela, quero ela maior, não quero precisar das barras de rolagem..". **Causa pré-existente**: `client/src/pages/ApontamentosCampo.tsx` L820 (modal Detalhes da Rev. 1755) usava `DialogContent max-w-2xl max-h-[92vh] overflow-y-auto` (672px) — em viewports ~1024px, header + chips Status/Tipo/Prioridade + grid 2x4 de batidas + footer com 4 botões ultrapassavam horizontalmente, e sem `overflow-x-hidden` o navegador exibia scrollbar horizontal no rodapé do dialog. **Fix (1 arquivo, 2 hunks)**: (1) L820 DialogContent — `resizable={false}` (essencial: sem isso o `useResizableWidth(512)` do `components/ui/dialog.tsx` injeta inline `width: min(512px, ...)` que sobrescreve as classes Tailwind), largura `w-[min(1100px,96vw)] sm:max-w-[min(1100px,96vw)]` (1100px desktop, até 96vw mobile), `max-h-[94dvh]` (dvh respeita UI mobile melhor que vh), `overflow-x-hidden` explícito impede scroll horizontal mesmo com chip muito longo, `p-0 gap-0` mantidos. (2) L882 grid de batidas `gap-2 → gap-3` (folga proporcional). **Preservado**: ZERO mudança em handlers (Resolver/Editar/Reabrir/Excluir/Fechar), backend, contrato tRPC, schema/migration. Header gradiente, chips, grid 2x4, descrição, resposta RH, metadados e footer com ações — tudo idêntico, só acomoda em largura maior. Reversível em 2 hunks. R-001 OK.
- **Rev. 1840**: **Espelho de Ponto · Reconhecimento automático de feriados — 01/05 deixa de aparecer como 'Falta'**. User (15/05/2026, screenshot SEX 01/05 com badge vermelho 'Falta'): "este dia é feriado não pode constar como falta. deve considerar feriado..". **Causa-raiz**: server `getFaltasReport` (fechamentoPonto.ts L4869-4887/L4982) JÁ ignora feriados via tabela `feriados` (companyId IN cids OR NULL, recorrentes expandidos). Bug era VISUAL no client `EspelhoPonto.tsx` `getDayStatus` L86-111: só marcava 'feriado' se `rec?.tipoDia === "feriado"` (manual). Sem consulta à tabela → 01/05 sem batida caía em "falta" (L104). **Fix (2 arquivos, 5 hunks)**: (1) `server/routers/feriados.ts` L244-308 nova procedure `listarPeriodo({companyId, companyIds?, dataInicio, dataFim})` → `string[]` YYYY-MM-DD; replica lógica de fechamentoPonto + merge com `FERIADOS_NACIONAIS` fixos + `feriadosMoveis(ano)` (Carnaval/Sexta Santa/Corpus Christi) garantindo reconhecimento mesmo sem `seedNacionais`; SQL bindado com `sql.join`. (2) `EspelhoPonto.tsx` L86-111 `getDayStatus` ganha 6º param `feriadosSet?: Set<string>`; novo `const noBatidas = ...`; ANTES de "falta" — `if (feriadosSet?.has(dateStr) && noBatidas) return 'feriado'`. Feriado trabalhado segue fluxo normal (vira HE 100% server-side). (3) L625-637 query paralela `trpc.feriados.listarPeriodo` com `staleTime: 5min` + `feriadosSet` useMemo. (4) L1028 call site recebe `feriadosSet`. (5) L651-677 `summary` — `isFeriadoNacional` entra no `isAbonado` existente; feriado não soma `diasFalta`/`trabalhados`/`totalTrabMins`; HE só soma se houve batida. **Preservado**: ZERO mudança em backend de cálculo, ZERO schema/migration/DELETE/contrato (procedure nova read-only), `tipoDia='feriado'` manual mantém precedência (L96 antes do auto-detect), sábado/domingo continua cinza (branches `isSat`/`isSun` antes do auto-detect). Reversível em 5 hunks. R-001/R-007/R-010 OK.
- **Rev. 1839**: **Fechamento de Ponto · Relatório Faltas/Atrasos — KPIs viram filtros clicáveis**. User (15/05/2026, screenshot do modal Relatório no FechamentoPonto): "quero os filtros resolsivos que quando clicar, filtre a informação..". **Causa pré-existente**: em `client/src/pages/FechamentoPonto.tsx` L5481-5505 (`RelatorioFaltasModal`), os 5 cards de totais (474 Inj/28 Just/163 DSR/128 Atr/85 Saí.Ant.) eram puramente decorativos (`<div>` estático). Sem atalho para ver só quem tinha atrasos, ou só injustificadas etc. — precisava ler a tabela inteira coluna por coluna. **Fix (1 arquivo, 4 hunks)**: (1) L5292-5326 adiciona estado `kpiFilter` (`'all'|'injustificadas'|'justificadas'|'dsrPerdido'|'atrasos'|'saidasAntecipadas'`) + mapa `kpiToDetalheTipo`; `useMemo` de `filtered` ganha filtro `f[kpiFilter] > 0` ANTES do search (composição correta). (2) L5501-5539 cards viram `<button>` em loop a partir de array de config (mantendo cores rose/cyan/purple/yellow/orange e a grid responsiva da Rev. 1836); estado ativo = `bg-{cor}-100 ring-2 ring-{cor}-500`; toggle (clicar no ativo limpa); `aria-pressed`, `focus-visible:ring`, hover lift. (3) L5541-5559 banner abaixo dos cards quando filtro ativo (`bg-slate-100` + label + botão 'Limpar filtro') — sempre comunica que a lista está filtrada e como sair. (4) L5645-5679 badges de detalhes expandidos também filtrados pelo tipo correspondente (exceto `dsrPerdido` que é derivado). **Preservado**: ZERO backend/contrato/payload (filtragem client-side); PDF/Excel automaticamente herdam o filtro porque já consomem `filtered`; search e filtro KPI compõem; mantém `data-testid`/`colSpan={9}`/responsividade Rev. 1836. Estado local — fechar+reabrir reseta. Reversível em 4 hunks. R-001 OK.