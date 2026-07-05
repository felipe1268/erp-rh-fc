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

- **Rev. 4057** — **PAINEL SAAS: DASHBOARD GANHA MÉTRICAS DETALHADAS (ARPU, ASSENTOS, CRESCIMENTO/CHURN DO MÊS, POPULARIDADE POR MÓDULO).** Usuário achou o Painel SaaS (Rev. 4056) raso demais — "coloca mais detalhes sobre o dash, isso valoriza bastante a gestão do sistema". `saasAdmin.ts` → `getSummary` ganhou `seatsTotal`, `arpuCents`, `newThisMonth`/`canceledThisMonth` (mês corrente) e `moduleBreakdown` (empresas ativas + receita por módulo, ordenado por popularidade); MRR/ARPU/breakdown agora respeitam os overrides de preço de `billing_module_prices` em tempo real. `SaasAdminPanel.tsx` ganhou 2ª fileira de cards + seção "Popularidade dos módulos" com barra proporcional. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4056** — **NOVO ITEM "GESTÃO DE VENDAS (SAAS)" NO MENU DE ADMINISTRAÇÃO + CROSS-LINK ENTRE OS 2 PAINÉIS EXISTENTES.** Usuário pediu um botão no menu suspenso da conta (seção Administração) que desse acesso a toda a parte gerencial do módulo de vendas (preços, quais empresas têm quais módulos, custo). A infra já existia mas estava fragmentada e sem link no menu: `SaasAdminPanel.tsx` (`/admin/saas`) lista empresas-cliente/assinaturas/MRR/suspender-reativar-cancelar; `AdminPrecos.tsx` (`/admin/saas/precos`) edita preços sincronizados com Stripe. Adicionado `DropdownMenuItem` "Gestão de Vendas (SaaS)" em `ModuleHub.tsx` (admin_master-only) → `/admin/saas`; botões cruzados nos cabeçalhos dos 2 painéis os unem num fluxo único. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4055** — **`/planos/modulos/:id`: SCREENSHOTS DE RH & DP REFEITAS COM DADOS 100% FICTÍCIOS (ZERO PII REAL).** Usuário anexou 5 prints do Raio-X do Funcionário mostrando PII real (nome, CPF, salário, nascimento, endereço) e exigiu que nenhum dado real aparecesse em screenshot de marketing — as prints de RH & DP da Rev. 4054 usavam dados reais da FC Engenharia. Criada empresa/obra/16 colaboradores 100% fictícios em `NEON_DATABASE_URL` (incl. 3 com contrato de experiência), reabilitado bypass de auth temporário em dev pra logar como admin fictício, recapturados `painel.png` e `dashboard-funcionarios.png` de `client/src/assets/screenshots/rh-dp/` já sem nenhum nome real; `top-funcoes-setores.png`/`folha-comparativo.png` mantidos (já não tinham PII). Bypass e todos os dados fictícios REMOVIDOS do banco ao final, sem vestígio. ZERO DELETE de dado real · ZERO ALTER destrutivo.

- **Rev. 4054** — **`/planos/modulos/:id`: SCREENSHOTS REAIS DO SISTEMA AUTENTICADO SUBSTITUEM O MOCKUP ABSTRATO.** Usuário pediu explicitamente "QUERO PRINTS REAIS DOS MÓDULOS.. PARA VALORIZAR A FERRAMENTA" — o `ModulePreviewMock` abstrato não convencia. Capturados screenshots reais de TODOS os 14 módulos via bypass de dev temporário (revertido 100% ao final, sem vestígio em produção), salvos em `client/src/assets/screenshots/*.jpg`. Pra RH & DP, usados os 4 melhores prints que o próprio usuário anexou (full-desktop, dados reais da FC Engenharia, sem mascarar nomes) em `client/src/assets/screenshots/rh-dp/*.png`. Novo `client/src/pages/portal/moduleScreenshots.ts` (`MODULE_SCREENSHOTS`); `ModuloDetalhe.tsx` mostra a 1ª screenshot no hero (frame de navegador, selo "Tela real do sistema", fallback pro mock se faltar print) + seção "Mais telas reais" em grid pras extras (hoje só RH & DP tem). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4053** — **`/planos`: CLIQUE NO MÓDULO ABRE PÁGINA DEDICADA COM TODAS AS FUNCIONALIDADES (SUBSTITUI O DIALOG PEQUENO).** Nova página `ModuloDetalhe.tsx` em `/planos/modulos/:id` com todas as funcionalidades por módulo, baseada 100% em `shared/modules.ts`; array `MODULES`/`ModulePreviewMock` extraídos pra arquivos próprios reusados entre `SiteVendas.tsx` e a nova página. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4052** — **`/planos`: AZUL MAIS ESCURO EM TODA A LANDING + MASCOTE "JULINHO" VIROU UM ROBÔ ANIMADO E INTERATIVO (AJUSTADO P/ MAIS VELHO/ALTO/RESPONSÁVEL).** Usuário achou o azul da Rev. 4051 claro demais e pediu robô no lugar do mascote humano; depois pediu, via canvas, que o robô fosse "mais velho, mais alto, transmitindo responsabilidade". Paleta aprofundada (blue-600→900 etc.); imagem final em `client/src/assets/julinho_robot.png`, flutuante/clicável no hero e CTA final. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4051** — **`/planos`: PALETA DE CORES TROCADA DE LARANJA/ÂMBAR PARA AZUL EM TODA A LANDING.** Usuário viu os screenshots da Rev. 4050 no canvas e pediu pra trocar laranja por azul ("gosto mais do azul"). Toda a identidade visual PRÓPRIA do site migrou de `orange-*/amber-*` pra `blue-*/sky-*`. Mantido de propósito: cores por categoria no array `MODULES`. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4050 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
