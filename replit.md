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

- **Rev. 1840**: **Espelho de Ponto · Reconhecimento automático de feriados — 01/05 deixa de aparecer como 'Falta'**. User (15/05/2026, screenshot SEX 01/05 com badge vermelho 'Falta'): "este dia é feriado não pode constar como falta. deve considerar feriado..". **Causa-raiz**: server `getFaltasReport` (fechamentoPonto.ts L4869-4887/L4982) JÁ ignora feriados via tabela `feriados` (companyId IN cids OR NULL, recorrentes expandidos). Bug era VISUAL no client `EspelhoPonto.tsx` `getDayStatus` L86-111: só marcava 'feriado' se `rec?.tipoDia === "feriado"` (manual). Sem consulta à tabela → 01/05 sem batida caía em "falta" (L104). **Fix (2 arquivos, 5 hunks)**: (1) `server/routers/feriados.ts` L244-308 nova procedure `listarPeriodo({companyId, companyIds?, dataInicio, dataFim})` → `string[]` YYYY-MM-DD; replica lógica de fechamentoPonto + merge com `FERIADOS_NACIONAIS` fixos + `feriadosMoveis(ano)` (Carnaval/Sexta Santa/Corpus Christi) garantindo reconhecimento mesmo sem `seedNacionais`; SQL bindado com `sql.join`. (2) `EspelhoPonto.tsx` L86-111 `getDayStatus` ganha 6º param `feriadosSet?: Set<string>`; novo `const noBatidas = ...`; ANTES de "falta" — `if (feriadosSet?.has(dateStr) && noBatidas) return 'feriado'`. Feriado trabalhado segue fluxo normal (vira HE 100% server-side). (3) L625-637 query paralela `trpc.feriados.listarPeriodo` com `staleTime: 5min` + `feriadosSet` useMemo. (4) L1028 call site recebe `feriadosSet`. (5) L651-677 `summary` — `isFeriadoNacional` entra no `isAbonado` existente; feriado não soma `diasFalta`/`trabalhados`/`totalTrabMins`; HE só soma se houve batida. **Preservado**: ZERO mudança em backend de cálculo, ZERO schema/migration/DELETE/contrato (procedure nova read-only), `tipoDia='feriado'` manual mantém precedência (L96 antes do auto-detect), sábado/domingo continua cinza (branches `isSat`/`isSun` antes do auto-detect). Reversível em 5 hunks. R-001/R-007/R-010 OK.
- **Rev. 1839**: **Fechamento de Ponto · Relatório Faltas/Atrasos — KPIs viram filtros clicáveis**. User (15/05/2026, screenshot do modal Relatório no FechamentoPonto): "quero os filtros resolsivos que quando clicar, filtre a informação..". **Causa pré-existente**: em `client/src/pages/FechamentoPonto.tsx` L5481-5505 (`RelatorioFaltasModal`), os 5 cards de totais (474 Inj/28 Just/163 DSR/128 Atr/85 Saí.Ant.) eram puramente decorativos (`<div>` estático). Sem atalho para ver só quem tinha atrasos, ou só injustificadas etc. — precisava ler a tabela inteira coluna por coluna. **Fix (1 arquivo, 4 hunks)**: (1) L5292-5326 adiciona estado `kpiFilter` (`'all'|'injustificadas'|'justificadas'|'dsrPerdido'|'atrasos'|'saidasAntecipadas'`) + mapa `kpiToDetalheTipo`; `useMemo` de `filtered` ganha filtro `f[kpiFilter] > 0` ANTES do search (composição correta). (2) L5501-5539 cards viram `<button>` em loop a partir de array de config (mantendo cores rose/cyan/purple/yellow/orange e a grid responsiva da Rev. 1836); estado ativo = `bg-{cor}-100 ring-2 ring-{cor}-500`; toggle (clicar no ativo limpa); `aria-pressed`, `focus-visible:ring`, hover lift. (3) L5541-5559 banner abaixo dos cards quando filtro ativo (`bg-slate-100` + label + botão 'Limpar filtro') — sempre comunica que a lista está filtrada e como sair. (4) L5645-5679 badges de detalhes expandidos também filtrados pelo tipo correspondente (exceto `dsrPerdido` que é derivado). **Preservado**: ZERO backend/contrato/payload (filtragem client-side); PDF/Excel automaticamente herdam o filtro porque já consomem `filtered`; search e filtro KPI compõem; mantém `data-testid`/`colSpan={9}`/responsividade Rev. 1836. Estado local — fechar+reabrir reseta. Reversível em 4 hunks. R-001 OK.
- **Rev. 1838**: **Planejamento · Salvar Cronograma — fim do timeout 'Failed to execute json on Response' (UPDATE batch CASE WHEN)**. User (15/05/2026, screenshot toast vermelho no REVTE-CIVIL): "erro quando salvo o cronograma..". **Causa-raiz**: erro do browser ao fazer `.json()` em body vazio = proxy picard cortou a conexão por timeout. Gargalo em `server/_shared/recalcularPesos.ts` L182-186 — loop sequencial `for (const u of updates) await db.update(...)` rodava SÍNCRONO dentro de `salvarAtividades`. Para 114 atividades = 114 round-trips ao Neon (~7s); para projetos grandes (1900 atividades suportadas pela Rev. 1822) = ~60-90s → bate no proxy. O `salvarAtividades` já tinha batching CASE WHEN, mas o recalc subsequente não. **Fix (2 arquivos, 3 hunks)**: (1) `recalcularPesos.ts` L22 adiciona `sql` ao import drizzle-orm. (2) L182-186 substitui loop pelo mesmo padrão batch CASE WHEN do `salvarAtividades` (BATCH=500, `sql.raw('UPDATE planejamento_atividades SET peso_financeiro = CASE id WHEN ${id} THEN ${peso}::numeric ... ELSE peso_financeiro END WHERE id IN (...)')`) — 1900 round-trips → 4. (3) `PlanejamentoDetalhe.tsx` L2957-2967 — `salvarMutation.onError` traduz padrão de proxy-cut (`Failed to execute 'json'|Unexpected end of JSON input|Unexpected token`) para mensagem pt-BR amigável sugerindo retry. Outros erros (TRPCError, Zod) intactos. **Preservado**: cálculo de pesos idêntico (custoMap/totalCusto/durByEap/eapCanonico/rateio item 4 Rev. 1820), `console.error('[API Mutation Error]')` em main.tsx mantém stack. Sem SQL injection (ids do banco, pesos sanitizados via `parseFloat(u.peso) || 0`). Zero schema/migration/DELETE/contrato tRPC. Reversível em 3 hunks. **Esperado**: REVTE-CIVIL salva em <2s, projetos 1900+ saem do timeout. R-001/R-007/R-010 OK.
- **Rev. 1837**: **Folha de Pagamento · Memorial de Cálculo HE — redesign moderno**. User (15/05/2026, screenshot do modal sobre Folha de Pagamento): "melhore esta tela com um layout moderno, e seguindos nossas regras de ouro". **Causa pré-existente**: `client/src/pages/FolhaPagamento.tsx` tinha DUAS instâncias byte-idênticas (L3165-3282 + L5031-5148) com layout antigo — DialogContent simples, header genérico, tabela tipo planilha (`border` em `<table>` + `border-t` em `<tr>`), sem KPIs de topo, fórmula em cinza-sobre-cinza. **Fix (1 arquivo, 1 hunk `replace_all: true` sincroniza ambas)**: DialogContent vira `max-w-4xl max-h-[92dvh] flex flex-col p-0 gap-0 overflow-hidden`; header com gradiente `from-purple-700 via-purple-600 to-fuchsia-600` + ícone Calculator em pill `bg-white/15 backdrop-blur` + subtítulo; body scrollable em `bg-slate-50/60`; loading vira spinner roxo, error vira alert; card funcionário com header gradient + 4 chips em `divide-x`; **3 KPIs de topo** (Total HE/azul, Valor Total/roxo, Dias com HE/esmeralda); tabela em `<div className='bg-white rounded-xl border shadow-sm'>` com header próprio + `min-w-[760px]` + zebra moderna + hover roxo + coluna 'Dia' como **badge colorido** (Dom red-100, Sáb orange-100); todas numéricas com `tabular-nums whitespace-nowrap`; tfoot TOTAL em gradiente roxo; fórmula em card branco com `Calculator` icon + chip mono. **Preservado**: ZERO mudança em lógica — todas as referências `m.totalHE*Mins`, `m.descontoAtrasoMins`, `d.heMins`, `d.fator`, `m.valorTotal*` etc. intocadas. Mesma condicional de atrasos. Ícones (Calculator/Clock/Wallet/CalendarDays/User/AlertCircle) já no top-level. Zero schema/migration/DELETE/contrato tRPC. Reversível em 1 hunk. R-001 OK.
- **Rev. 1836**: **Fechamento de Ponto · Relatório Faltas/Atrasos/Saídas — layout 100% responsivo**. User (15/05/2026, screenshot do modal full-screen): "melhore este layout para, querto tudo reponsivo e respeite nossas regras de ouro". **Causa pré-existente**: `client/src/pages/FechamentoPonto.tsx` L5435-5621 tinha (1) filtros em `md:grid-cols-12` apertados em 768-1024px, (2) cards de totais `md:grid-cols-5` com texto quebrando, (3) tabela sem `overflow-x-auto` e sem `min-w` — colunas numéricas com sufixos tipo "(10h14)" quebravam linha, (4) Ações em `flex justify-between` que colapsavam em mobile. **Fix (1 arquivo, 1 hunk)**: filtros viram `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` + `min-w-0` em cada item + Obras Popover com `<span truncate>` + `w-[min(300px,calc(100vw-2rem))]`; cards de totais `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` com padding/tipografia fluida (`p-2 sm:p-3`, `text-xl sm:text-2xl`, `tabular-nums`, `leading-tight`) + 5º card `col-span-2 sm:col-span-1`; Ações `flex-col sm:flex-row` + botão PDF colapsa texto via `hidden sm:inline`/`sm:hidden`; tabela ganha wrapper `overflow-x-auto` + `<table min-w-[680px]>` + todas as células numéricas com `whitespace-nowrap tabular-nums`; coluna Funcionário vira `flex flex-wrap` (badge não vaza) + cargo aparece EMBAIXO do nome em mobile (`md:hidden`) já que a coluna dedicada é `hidden md:table-cell`; coluna Cargo (md+) com `max-w-[180px] truncate` + `title`. **Preservado**: zero schema/migration/DELETE/contrato tRPC, todos os handlers (`onToggleExpanded`, `exportarPDF`, `exportarExcel`, `fmtMin`, `fmtBR`), `data-testid`, `colSpan={9}`. Só JSX/Tailwind. Reversível em 1 hunk. R-001 OK.
