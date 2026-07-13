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

- **Rev. 4199** — **SCORECARD: FIX DEFINITIVO — ORÇAMENTO EM EMPRESA DIFERENTE DO GRUPO.** Root cause: `"companyId"` era filtro OUTER ao OR de 3 caminhos; quando orçamento está em empresa B e projeto em empresa A, nenhum path passava. Fix: companyId movido para dentro dos paths 2 e 3; path 1 (id=orcamentoId, FK direta do projeto) sem filtro de empresa. `getScore` também recebe `orcamentoId` agora. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4198** — **SCORECARD METAS & DESVIOS: QUERY TRI-CAMINHOS PARA DETECTAR ORÇAMENTO.** Query com OR em 3 caminhos: `id=orcamentoId` (prio 1) | `"obraId"=obraId` (prio 2) | `id IN (SELECT orcamento_id FROM planejamento_projetos WHERE obra_id=obraId)` (prio 3). Botão Atualizar invalida todos os caches do scorecard. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4197** — **SCORECARD METAS & DESVIOS: FIX VÍNCULO POR orcamentoId.** `getMetasDesvios` agora aceita `orcamentoId` opcional e prioriza lookup direto (`WHERE id=orcamentoId`) antes de fallback por `obraId`. Frontend passa `proj.orcamentoId`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4196** — **BANCO DE HORAS: TABELA DIA A DIA REFATORADA COMO TABLE HTML.** Grid CSS causava sobreposição "TRABALHADOJORNADA" em mobile. Substituída por `<table>` com colunas de largura natural + `tabular-nums`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4195** — **BANCO DE HORAS: STATUS DE AUTORIZAÇÃO DIA A DIA — ✓ AUTORIZADO vs ⚠ SEM AUTORIZAÇÃO.** Backend: `approvedSet` por funcionário+período em `memorialCalculo`; campo `autorizado` em cada dia. Frontend: coluna Aut. (✓ verde/⚠ âmbar), fundo âmbar nos dias sem autorização, resumo "Autorizado: +Xh / Sem autorização: +Xh". ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4194** — **BANCO DE HORAS: TABELA DIA A DIA SEMPRE ABERTA + DIA DA SEMANA COLORIDO + FERIADO MARCADO.** Sub-componente `PeriodoDiasTable` com useQuery próprio; tabela sem toggle — sempre visível. Dom em vermelho, Sáb em âmbar, Feriado com badge roxo "Fer" e fundo purple. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4193** — **BANCO DE HORAS: HISTÓRICO DIA A DIA EXPANSÍVEL.** Toggle "Ver dia a dia" em cada card de crédito; `memorialCalculo` lazy. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4192** — **BANCO DE HORAS: CARGO DE CONFIANÇA (ART. 62 CLT) EXCLUÍDO AUTOMATICAMENTE.** Filtro `cargo_confianca=0` em todos os 4 pontos de leitura. Banner azul informativo na aba Saldos. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4191** — **BANCO DE HORAS: HISTÓRICO REDESENHADO — CARDS MODERNOS COM SOLICITANTE, AUTORIZADOR, DATA/HORA E HORAS NÃO AUTORIZADAS.** Cards com barra lateral colorida, data+hora, "Solicitado por"/"Autorizado por", horas não autorizadas em âmbar. Backend: +3 colunas do `he_periods`. Fix TDZ. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4190** — **BANCO DE HORAS: HISTÓRICO INTERATIVO COM FOTO E STATUS DE AUTORIZAÇÃO.** Foto (PersonPhoto xs) em Saldos; clique abre Dialog com histórico rico de lançamentos (período HE, tipo, HE Realizada, Creditado, Autorização). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4189** — **BANCO DE HORAS: FIX CRÍTICO — LANÇAMENTOS NUNCA ERAM GRAVADOS + BACKFILL AUTOMÁTICO.** `String(period.dataFim).slice(0,10)` gerava `"Fri May 15"` → `::date` falha no Postgres. Fix: helper `toDateStr` + backfill 53 lançamentos. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4188** — **SCORECARD: FIX MULTI-ABA — ORÇAMENTO, SEGURANÇA, RH E METAS & DESVIOS RETORNAVAM VAZIO.** camelCase columns em `orcamentos`/`obra_funcionarios`/`employees` causavam "column does not exist" silencioso. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4186** — **SCORECARD: REDESIGN COMPLETO — 6 ABAS TOP-LEVEL + DRE WATERFALL + METAS & DESVIOS.** `ScorecardTab.tsx` reescrito. 6 abas Pareto. DRE waterfall 3 colunas. Warning quando custoRealizado=0. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4185** — **SCORECARD: ABA "👥 RH / FOLHA" + BACKEND getMetasDesvios.** `getCustosRH` procedure com fracionação proporcional por dias de obra. `getMetasDesvios` procedure. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4184** — **SCORECARD: ABA SEGURANÇA — QUADRO CLT/TERCEIROS, ASO, TREINAMENTOS, ADVERTÊNCIAS E EPI.** `getSeguranca` procedure — 7 queries. KPIs + quadros + Curva ABC EPI. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4143 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
