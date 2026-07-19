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

- **Rev. 4420** — **FEATURES IA: C1 (CRIAR OC POR DOCUMENTO) + A1 (IMPORTAR ITENS ALMOXARIFADO POR DOCUMENTO).** C1: botão "Criar OC por IA" (azul, Sparkles) no CommandBar de OC; fluxo 3 passos: upload PDF/JPG/PNG → IA extrai fornecedor + itens + condições → revisão + "Preencher OC". Server: `extrairOCIA` (compras.ts) usa iaExtractionJobs+invokeAnthropicVision; reusa getIaExtractionResult p/ polling. A1: botão "Importar (IA)" no header do catálogo de Almoxarifado; fluxo: upload → IA extrai lista de itens → tabela editável com checkboxes → "Criar N Itens" com progresso 0→100% (Regra de Ouro). Server: `extrairItensAlmoxIA` (warehouse.ts) síncrono. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4419** — **CORREÇÕES C5 E S1 (AJUSTES_ERP_17072026).** C5: correção crítica em `criarOrdemDeCotacao` — participante estoque (`isEstoque=true`) entrava no fallback do frontend mas não do servidor; lançava "Nenhum fornecedor vencedor". Fix: `estoqueParticipante` incluído na cadeia `vencedorSelecionado ?? melhorForn ?? estoqueParticipante ?? null`. S1: `assertCentralWrite` relaxado para usuários com ≥1 obra (antes bloqueava todos os não-admins); `canWriteCentral` no frontend sincronizado. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4418** — **AJUSTES COMPRAS / ALMOXARIFADO / SST (LISTA AJUSTES_ERP_17072026).** 7 melhorias: C2/C3/C6 em Compras; A3/A4 no Almoxarifado; S2/S4 em SST. ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4417** — **AVISO ENCERRAMENTO PJ: BOTÃO "PRÉVIA DO DOCUMENTO" + PRAZO PADRÃO 15 DIAS.** Botão laranja Eye + buildDocData(preview?). ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4416** — **MÓDULO PJ: BOTÃO "ENVIAR AVISO DE ENCERRAMENTO" → DIALOG FCSIGN (FC-CON-003).** ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4415** — **TEMPLATES ISO: CORREÇÃO CRÍTICA — EDITOR EM BRANCO APÓS SALVAR/APROVAR.** Guard `if (getQuery.isFetching) return`. ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4414** — **TEMPLATES ISO: NOVO TIPO "AVISO DE ENCERRAMENTO DE CONTRATO PJ" (FC-CON-003).** 5 cláusulas, 8 placeholders. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4413 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
