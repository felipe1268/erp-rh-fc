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

- **Rev. 4061** — **ADMINPRECOS: SALVAR PREÇO FALHAVA COM "This price cannot be archived because it is the default price of its product" (STRIPE).** Usuário anexou print do toast de erro ao salvar preço do módulo "RH & DP". `adminUpdatePrices` (`billing.ts`) criava o Price novo, tentava arquivar o Price antigo (`active:false`) e SÓ DEPOIS trocava o `default_price` do Product — mas a Stripe recusa arquivar um Price enquanto ele ainda é o default do produto. Fix: inverter a ordem (trocar `default_price` pro Price novo PRIMEIRO, arquivar o antigo DEPOIS). Limpo também 1 Price órfão ativo duplicado que a tentativa anterior deixou pra trás no Stripe (arquivado manualmente, sem impacto em assinatura existente). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4060** — **`/planos`: MÓDULO FORA DE VENDA AGORA SOME COMPLETAMENTE DA VITRINE, NÃO SÓ DO PREÇO.** Usuário reportou que desligar um módulo pra venda (Rev. 4059) só escondia o preço (mostrava "—"), com o card completo (nome/descrição/link) ainda visível — sensação de propaganda enganosa. `SiteVendas.tsx`: grid de módulos passou a filtrar `MODULES` contra `catalog.modules` (já é `sellableModules` do backend), então módulo fora de venda não renderiza card nenhum. `ModuloDetalhe.tsx`: guard `isSellable` bloqueia acesso direto por URL à página de detalhe de um módulo desativado (cai em "Módulo não encontrado"). `ContratarPlano.tsx` já estava correto desde a Rev. 4059. ZERO DELETE · ZERO ALTER destrutivo (só frontend).

### 5 one-liners

- **Rev. 4059** — **PAINEL SAAS / AJUSTE DE PREÇOS: NOVO CONTROLE PARA LIGAR/DESLIGAR MÓDULO DA VITRINE COMERCIAL.** Nova coluna `billing_module_prices.is_active`; `server/billingCatalog.ts` centraliza `getEffectiveCatalog()` (`modules` completo + `sellableModules` só ativos). `AdminPrecos.tsx` redesenhado em grid de cards com Switch + edição de preço. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4058** — **`/planos/modulos/:id`: SEÇÃO DE SCREENSHOTS VIRA CARROSSEL "MULTITELA" HORIZONTAL COM VÁRIAS TELAS REAIS POR MÓDULO.** Capturada 2ª screenshot real pra cada um dos 13 módulos que só tinham 1 print; `ModuloDetalhe.tsx` ganhou seção com scroll horizontal + setas de navegação. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4057** — **PAINEL SAAS: DASHBOARD GANHA MÉTRICAS DETALHADAS (ARPU, ASSENTOS, CRESCIMENTO/CHURN DO MÊS, POPULARIDADE POR MÓDULO).** `saasAdmin.ts` → `getSummary` ganhou `seatsTotal`, `arpuCents`, `newThisMonth`/`canceledThisMonth`, `moduleBreakdown`; `SaasAdminPanel.tsx` ganhou 2ª fileira de cards + seção "Popularidade dos módulos". ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4056** — **NOVO ITEM "GESTÃO DE VENDAS (SAAS)" NO MENU DE ADMINISTRAÇÃO + CROSS-LINK ENTRE OS 2 PAINÉIS EXISTENTES.** `SaasAdminPanel.tsx` (`/admin/saas`) e `AdminPrecos.tsx` (`/admin/saas/precos`) ganharam link no menu de conta (admin_master) + botões cruzados entre si. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4055** — **`/planos/modulos/:id`: SCREENSHOTS DE RH & DP REFEITAS COM DADOS 100% FICTÍCIOS (ZERO PII REAL).** Usuário anexou 5 prints do Raio-X do Funcionário mostrando PII real e exigiu zero dado real em screenshot de marketing; recapturado `painel.png`/`dashboard-funcionarios.png` com empresa/colaboradores 100% fictícios, tudo removido do banco ao final. ZERO DELETE de dado real · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4054 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
