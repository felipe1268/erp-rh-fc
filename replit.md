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

- **Rev. 4187** — **SCORECARD: SUB-ABA "BANCO DE HORAS" NA ABA RH + FIX RETRY iOS WEBKIT.** Aba RH dividida em sub-abas: "Folha / Custos" (inalterada) e "Banco de Horas" (nova). Banco: KPI strip (Funcionários/Total HE/HE Pagas/Saldo Banco), tabela expansível por funcionário, sub-tabela histórico HE por mês (destino Banco ou Pagamento, valor, status). Fix main.tsx: queries agora reentam até 3× com backoff exp (2s/4s/8s) em erros iOS WebKit ("The string did not match the expected pattern" / "Failed to fetch"), corrigindo a tela de erro pré-existente no Scorecard. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4186** — **SCORECARD: REDESIGN COMPLETO — 6 ABAS TOP-LEVEL + DRE WATERFALL + METAS & DESVIOS.** `ScorecardTab.tsx` reescrito. 6 abas Pareto: 📊 Resultado | 🎯 Metas & Desvios | 👥 RH/Folha | 🛡️ Segurança | 📦 Compras | 🔧 Operacional. DRE waterfall 3 colunas (Contrato | (−) Custo | = Lucro LL). Warning explícito quando custoRealizado=0 (remove bug "Lucro R$9.5M"). Metas & Desvios: KPIs orçamento vs OC + gráfico mensal + tabela item-a-item (dentro/acima/sem-ref). Score+dimensões+KPI strip sempre visíveis. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4185** — **SCORECARD: ABA "👥 RH / FOLHA" + BACKEND getMetasDesvios.** `getCustosRH` procedure com fracionação proporcional por dias de obra. `getMetasDesvios` procedure: join OC itens × orçamento itens por nome, desvios de preço, gasto mensal vs meta. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4184** — **SCORECARD: ABA SEGURANÇA — QUADRO CLT/TERCEIROS, ASO, TREINAMENTOS, ADVERTÊNCIAS E EPI.** `getSeguranca` procedure — 7 queries. KPIs + quadros + Curva ABC EPI. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4183** — **SCORECARD: PAINEL ANÁLISE GERENCIAL DA OBRA (CURVA ABC, RECOMPRAS, FERRAMENTAS, LOCAÇÕES).** `getAnalise` — 6 queries. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4182** — **PLANEJAMENTO: SCORECARD DO GESTOR COM KPIs, BÔNUS E CONTROLE DE FERRAMENTAS/RETRABALHO.** Score 0-100 em 5 dimensões ponderadas. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4181** — **COMPRAS: CONDIÇÃO DE PAGAMENTO VIRA SELECT PADRONIZADO NAS OCs.** Campo livre → `<Select>` com `TIPOS_PAGAMENTO`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4176** — **COMPRAS/FINANCEIRO: PAINEL ANÁLISE SEPARADO DA TABELA (FULL-WIDTH).** `AnaliseDashPanel` 3 colunas horizontais + cabeçalho colapsável. Tabela full-width. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4143 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
