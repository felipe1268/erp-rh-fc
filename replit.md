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

- **Rev. 4231** — **SCORECARD SST: FIX CUSTO ATESTADOS — PARSER MISTO salarioBase + salarioBrutoMes.** `payroll_payments.salarioBrutoMes` usa decimal inglês (`"2650.32"`); double REPLACE removia o ponto decimal → R$ 265.032 em vez de R$ 2.650 (100× errado). `employees.salarioBase` tem formato misto (279 BR / 102 EN); EN sem vírgula quebrava igual. Fix: payroll → `REPLACE(NULLIF(TRIM(val),''),',','.')::numeric`; salarioBase → CASE WHEN LIKE '%,%'. Custo corrigido: R$ 667.266 → ~R$ 31.254. 6 ocorrências em Q12+Q13. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4230** — **SMO: FIX SALÁRIO DE REFERÊNCIA — MEDIANA COM FILTRO DE OUTLIERS.** `salarioRef` era MÉDIA (vulnerável a 1 funcionário com salário errado no cadastro → R$ 270.786 p/ pedreiro). Fix: `calcSalarioMediana()` — mediana + filtra valores >5× mediana bruta. 4 ocorrências corrigidas em smo.ts. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4229** — **SCORECARD SST: NOVA FÓRMULA CUSTO ATESTADOS — CUSTO REAL MENSAL.** `(salário_bruto×1,33 + VA/VR_mensal) ÷ dias_do_mês × dias_afastados`. Q12: 2 LATERAL JOINs em payroll_payments + vr_benefits. Q13 ates CTE: subconsultas correlacionadas. Frontend: labels atualizados. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4228** — **SCORECARD SST: FOTO DE CADASTRO EM ACIDENTES, ADVERTÊNCIAS E TOP 5 EPI.** Backend: Q4/Q5/Q6/Q8 passam a retornar `foto_url` (CLT via `fotoUrl`, terceiros via `ft.foto_url`). Frontend: avatar circular com foto real (ou iniciais coloridas como fallback) adicionado aos cards de Acidentes e rows de Advertências. Top 5 EPI já tinha código mas dependia do Q6 retornar a foto. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4227** — **SCORECARD SST: FIX BOLINHAS + GRÁFICOS HISTÓRICO — salarioBase com ponto de milhar.** Causa raiz real: `"2.774,20"` após REPLACE(',','.') vira `"2.774.20"` (dois pontos) → crash silencioso. Fix: REPLACE duplo — remover ponto de milhar ANTES de converter vírgula decimal. Q12 (4 ocorrências) + Q13 ates CTE (1 ocorrência). Validado direto no Neon: Q13 retorna 12 linhas com dds/atestados/epi por mês. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4226** — **SCORECARD SST: FIX CAST TIPOS — valor_produto NUMERIC + salarioBase VARCHAR.** REPLACE(numeric_col) quebra silenciosamente; epis.valor_produto é NUMERIC → COALESCE(ep.valor_produto,0); employees.salarioBase é VARCHAR → REPLACE(COALESCE,'0'),',','.'). Q6/Q7/Q12/Q13 corrigidos. Atestados e gráficos voltam. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4225** — **SCORECARD SST: FIX FILTRO PERÍODO + CUSTO EPI + GRÁFICOS HISTÓRICO.** 5 bugs cirúrgicos corrigidos no backend: Q4 (advertências CLT) e Q5 (terceiros) sem filtro de data → Darcy aparecia em qualquer mês; Q6 (`custo_estimado` vs `custo_total`) → R$ 0,00 no Top 5 EPI; Q6+Q7 sem filtro de período → EPI ignorava mês selecionado; Q13 epi_agg com `valor_produto::numeric` sem REPLACE → crash silencioso no safe() zerava todos os gráficos histórico e bolinhas do PeriodSelectorCard. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4224** — **SCORECARD SST: REDESIGN COMPLETO — DASHBOARD RICO COM 12 BLOCOS INTERATIVOS.** Substituída toda a aba "🦺 SST" no ScorecardTab.tsx por dashboard moderno: 2×4 KPI Hero Cards, Gauge ASO SVG + Treinamentos progress bars + Custo Atestados breakdown (BLOCO 2), 6 mini-gráficos expandíveis via Dialog (BLOCO 3), comparativo mês atual×anterior (BLOCO 4), EPI Curva ABC horizontal + Top 5 + estoque (BLOCO 5), 7 seções colapsáveis (acidentes/atestados/advertências/DDS/APR+PT/equipe CLT/terceiros). ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4223** — **SCORECARD SST: FIX COLUNAS CAMELCASE + NOVA PÁGINA "GESTOR SST POR OBRA".** Corrigidas Q1/Q3/Q4/Q6/Q7/Q8/Q13. Nova página `/sst/gestor-por-obra`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4221** — **SCORECARD SST: REDESIGN COMPLETO — ABA "SEGURANÇA" → "🦺 SST".** Fix bolinhas PeriodSelectorCard. Q14 backend estoque EPI. Dashboard EPI: gráficos, Curva ABC, Top 5 maior/menor uso c/ foto, estoque obra. Atestados: Top 5 c/ foto + CID breakdown. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4219** — **SCORECARD COMPRAS: FERRAMENTAS ALMOX + LOCAÇÕES — LAYOUT CARD COM FOTO + FIX LOCAÇÕES VAZIAS.** Cards horizontais, badge Próprio, JOIN almoxarifado_itens, foto/responsável/custo/mês. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4218** — **SCORECARD SEGURANÇA: LEGENDA + monthStatus + TABELA COMPARATIVA + 4 GRÁFICOS.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4217** — **REGRA DE OURO GRAVADA: SELETOR DE MÊS/ANO → SEMPRE `<PeriodSelectorCard>`.** `segMes: string → number | null`. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4205 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
