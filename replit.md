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

- **Rev. 4180** — **COMPRAS/FINANCEIRO: ANÁLISE FORNECEDOR — TOGGLE MÊS/SEMANA + GRUPOS SIMILARES + INTERVALO.** Toggle "Mês | Semana" no gráfico de gastos (barras azul-sky, estatísticas de pico/média). Seção "Grupos Similares" agrupa variantes de nome por família léxica ("Prego 17x21" + "Prego de Aço 17x21" → Prego). Intervalo entre compras no drill-down: KPI "Frequência" + mini bar chart dos intervalos consecutivos colorido por urgência. Backend: `intervaloDias` e `familiaKey` em cada item. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4179** — **PLANEJAMENTO: FIX % PREVISTO GLOBAL — FALLBACK PARA REVISÃO BASELINE.** `regenerarPrevistoSemanasCaminhoB` agora detecta revisão ativa sem baseline e usa automaticamente a revisão `is_baseline=true` do mesmo projeto, mantendo o revisaoId ativo no snapshot. Self-heal no getProjeto simplificado (sem pré-check de cnt). Corrige discrepância 51,80% vs 41% (MSP Text10) no QIU 2 - FASE 4. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4176** — **COMPRAS/FINANCEIRO: PAINEL ANÁLISE SEPARADO DA TABELA (FULL-WIDTH).** `AnaliseDashPanel` redesenhado: 3 colunas horizontais (Curva ABC | Destaques em grade 2×3 | Fragmentação) com cabeçalho colapsável e badge de alertas. Tabela full-width; Formas de Pgto + Obras em grid 2 col. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4175** — **COMPRAS: REDESIGN MODERNO DO OcMiniDialog.** Header gradiente dinâmico (cor varia por status: verde=entregue, azul=aprovada, âmbar=pendente), total da OC em destaque 2xl, chips de pagamento/itens/almox em glass effect. Timeline horizontal 4 etapas (Solicitação→OC→Aprovação→Entrega) com círculos preenchidos. Chips de detalhes em pill cards coloridos. Itens colapsáveis com mini-barra de proporção (peso % no total) por linha. Almoxarifado colapsável em timeline vertical com dots teal/rose. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4177** — **COMPRAS/FINANCEIRO: ABA DEDICADA "ANÁLISE" NO DETALHE DE FORNECEDOR.** 3º tab "Análise" (badge "IA"); AnaliseDashPanel + Formas de Pagamento + Obras Atendidas. State `'lancamentos' | 'itens' | 'analise'`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4174** — **COMPRAS/FINANCEIRO: PAINEL DASH + ALMOXARIFADO NA OC.** `AnaliseDashPanel.tsx` (Curva ABC, destaques, fragmentação). Barra busca na tabela. `getOrdemMiniDetalhe` almox via `motivo ILIKE`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4173** — **COMPRAS/FINANCEIRO: REDESIGN DO MINI-DIALOG DE DETALHE DA OC.** Backend com nomes de criador/aprovador; layout rastreabilidade SC→OC→Aprovação; tabela de Itens com total. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4172** — **COMPRAS/FINANCEIRO: OC CLICÁVEL NA TABELA DE OCORRÊNCIAS DA ANÁLISE DE FORNECEDOR.** `ordem_id` no `ocorrRes`; `OcMiniDialog` exportado; célula Nº OC virou `<button>`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4171** — **COMPRAS/FINANCEIRO: UNIDADE NAS CÉLULAS DE PREÇO DA ANÁLISE DE FORNECEDOR.** Sufixo `/un`, `/sc`, `/m³` etc.; itens unidade mista sem sufixo. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4143 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
