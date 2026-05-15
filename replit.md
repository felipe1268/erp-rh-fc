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

- **Rev. 1837**: **Folha de Pagamento · Memorial de Cálculo HE — redesign moderno**. User (15/05/2026, screenshot do modal sobre Folha de Pagamento): "melhore esta tela com um layout moderno, e seguindos nossas regras de ouro". **Causa pré-existente**: `client/src/pages/FolhaPagamento.tsx` tinha DUAS instâncias byte-idênticas (L3165-3282 + L5031-5148) com layout antigo — DialogContent simples, header genérico, tabela tipo planilha (`border` em `<table>` + `border-t` em `<tr>`), sem KPIs de topo, fórmula em cinza-sobre-cinza. **Fix (1 arquivo, 1 hunk `replace_all: true` sincroniza ambas)**: DialogContent vira `max-w-4xl max-h-[92dvh] flex flex-col p-0 gap-0 overflow-hidden`; header com gradiente `from-purple-700 via-purple-600 to-fuchsia-600` + ícone Calculator em pill `bg-white/15 backdrop-blur` + subtítulo; body scrollable em `bg-slate-50/60`; loading vira spinner roxo, error vira alert; card funcionário com header gradient + 4 chips em `divide-x`; **3 KPIs de topo** (Total HE/azul, Valor Total/roxo, Dias com HE/esmeralda); tabela em `<div className='bg-white rounded-xl border shadow-sm'>` com header próprio + `min-w-[760px]` + zebra moderna + hover roxo + coluna 'Dia' como **badge colorido** (Dom red-100, Sáb orange-100); todas numéricas com `tabular-nums whitespace-nowrap`; tfoot TOTAL em gradiente roxo; fórmula em card branco com `Calculator` icon + chip mono. **Preservado**: ZERO mudança em lógica — todas as referências `m.totalHE*Mins`, `m.descontoAtrasoMins`, `d.heMins`, `d.fator`, `m.valorTotal*` etc. intocadas. Mesma condicional de atrasos. Ícones (Calculator/Clock/Wallet/CalendarDays/User/AlertCircle) já no top-level. Zero schema/migration/DELETE/contrato tRPC. Reversível em 1 hunk. R-001 OK.
- **Rev. 1836**: **Fechamento de Ponto · Relatório Faltas/Atrasos/Saídas — layout 100% responsivo**. User (15/05/2026, screenshot do modal full-screen): "melhore este layout para, querto tudo reponsivo e respeite nossas regras de ouro". **Causa pré-existente**: `client/src/pages/FechamentoPonto.tsx` L5435-5621 tinha (1) filtros em `md:grid-cols-12` apertados em 768-1024px, (2) cards de totais `md:grid-cols-5` com texto quebrando, (3) tabela sem `overflow-x-auto` e sem `min-w` — colunas numéricas com sufixos tipo "(10h14)" quebravam linha, (4) Ações em `flex justify-between` que colapsavam em mobile. **Fix (1 arquivo, 1 hunk)**: filtros viram `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` + `min-w-0` em cada item + Obras Popover com `<span truncate>` + `w-[min(300px,calc(100vw-2rem))]`; cards de totais `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` com padding/tipografia fluida (`p-2 sm:p-3`, `text-xl sm:text-2xl`, `tabular-nums`, `leading-tight`) + 5º card `col-span-2 sm:col-span-1`; Ações `flex-col sm:flex-row` + botão PDF colapsa texto via `hidden sm:inline`/`sm:hidden`; tabela ganha wrapper `overflow-x-auto` + `<table min-w-[680px]>` + todas as células numéricas com `whitespace-nowrap tabular-nums`; coluna Funcionário vira `flex flex-wrap` (badge não vaza) + cargo aparece EMBAIXO do nome em mobile (`md:hidden`) já que a coluna dedicada é `hidden md:table-cell`; coluna Cargo (md+) com `max-w-[180px] truncate` + `title`. **Preservado**: zero schema/migration/DELETE/contrato tRPC, todos os handlers (`onToggleExpanded`, `exportarPDF`, `exportarExcel`, `fmtMin`, `fmtBR`), `data-testid`, `colSpan={9}`. Só JSX/Tailwind. Reversível em 1 hunk. R-001 OK.
- **Rev. 1835**: **Planejamento · Curva S Financeira — distribuição working time MSP (AACE 80R-13 §5.3 / Mattos), elimina retangular**. User (15/05/2026, screenshots Curva S Financeira × Trabalho do REVTE-CIVIL): "pq o formato é diferente? não deveria ser igual?" → após discussão da literatura (PMBOK/EVM, AACE, MSP, Mattos), pediu "implante a leitura correta". **Causa pré-existente**: `getCurvaSFinanceira` (`server/routers/planejamento.ts` L5582-5607) distribuía R$ LINEARMENTE pelas semanas (`semValor = valorAtiv / dur`) → curva RETANGULAR, não-S. Violava AACE 80R-13 §5.3 (PV deve seguir resource loading real). Atividades caras antecipadas (Tapumes/Mobilização) inflavam início artificialmente. **Fix (1 arquivo, 2 hunks)**: (1) L5532-5546 query do projeto seleciona `calendarioJson`+`dataInicio`+`dataTerminoContratual`; `parseCalendarioJson` gera `calMspFin` (parser unificado, mesmo do `getCurvaS`). (2) L5582-5650 bloco de distribuição reescrito: estrutura `FolhaFin` per-leaf pré-parseada alimenta 2 caminhos. Caminho MSP (calMSP presente): BCWS(W) = Σ valor_i × `fracaoDecorridaMs(ini_i, min(sun_W, fim_i), fim_i, calMSP)` por Monday do envelope; mesma estrutura iterativa de `gerarCurvaPlanejadaMSP` (Rev. 1689.1). Caminho fallback (XML sem calMSP): mantém algoritmo retangular legado idêntico. **Preservado**: BCWP, receita, tendência, contrato `pontos[]`, `valorPorAtiv` map, `totalVenda`. Zero schema/migration/DELETE/contrato tRPC. Reversível em 2 hunks. **Compliance**: AACE 80R-13 §5.3 + PMBOK 7ª/EVM Practice Std + MSP nativo + Mattos cap. 12. **Esperado REVTE-CIVIL**: Financeira ganha forma de S real, próxima da Trabalho, divergindo só pela escala (R$ vs %) e antecipação de mobilização (working time, não retangular). R-001/R-007/R-010 OK.
- **Rev. 1834**: **Planejamento · Importer MSP — barra de progresso mais responsiva + mensagem por estágio (acaba a sensação de 'travou no 88%')**. User (15/05/2026, screenshot 'Processando arquivo... 88%' no REVTE-CIVIL): "pq quando chega no 88% ele trava e demora muito?". **Causa pré-existente (Rev. 1822)**: backend processa o XML inteiro em transação única, sem streaming. Frontend usava curva assintótica `+ (99-p)*0.06 / 120ms` que desacelerava dramaticamente (p=88→+0,66pp/tick, p=95→+0,24pp/tick); 88→99 demorava ~10s e depois pinava em 99% por 20-60s aguardando INSERT no Postgres. Sem feedback de estágio = parecia travamento. **Fix (1 arquivo, 4 hunks)**: (1) L687-707 curva mais agressiva — tick 100ms, decay 0.10, min 0.20pp → 90% em ~2s, 95% em ~3s, 99% em ~6s. (2) L696/700/715 novo state `progressoTotalAtv` propagado por `iniciarProgresso(totalAtividades)`. (3) L720-730 função `progressoMensagem(p, totalAtv)` com 4 estágios: 'Lendo arquivo MS Project…' (<30), 'Convertendo N atividades…' (<75), 'Enviando para o servidor…' (<95), 'Salvando N atividades no banco — projetos grandes podem levar até 60s…' (<100, >300 atv) ou 'Salvando no banco — pode levar alguns segundos…'. (4) L946 + L1427-1448 — JSX usa msg dinâmica, spans `truncate`+`shrink-0`. **Honestidade**: usuário sabe explicitamente que aos ~95-99% a espera é o INSERT no Postgres. Zero schema/migration/DELETE/contrato. Reversível em 4 edits. R-001/R-007/R-010 OK.
- **Rev. 1833**: **Planejamento · Paridade MSP TRAVADA — toggle removido, ERP sempre pondera por duração**. User (15/05/2026, após Rev. 1832): "só quero o MSP, não quero outra informação". **Fix (1 arquivo, 2 hunks)**: (1) `PlanejamentoDetalhe.tsx` L251-258 — state `usarPesoPorDuracao`+localStorage da Rev. 1832 substituídos por `const usarPesoPorDuracao = true`. Sem opção de toggle. Árvore inteira (avancoAtual, AvancoSemanal, Refis, pvPonderado) recebe `true` e pondera por `duracaoDias`. (2) L911-928 — toggle 2-botões substituído por badge estático azul '📐 Paridade MSP (Duração)' com tooltip da fórmula (Σ AD_leaf / Σ Duration_leaf). **Por que é seguro**: caminho 'duracao' já existia desde Rev. 1343, ativado pela Rev. 1832, agora vira único. Previsto LIVE intocado (usa `pctRaizMSP` Rev. 1825). Entradas órfãs em localStorage `planejamentoPesoBase:*` ficam sem efeito. **Esperado**: REVTE-CIVIL Realizado bate com a coluna '% concluída' da raiz MSP (~1%). Reversível em 2 edits. Zero schema/migration. R-001/R-007/R-010 OK.
