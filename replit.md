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

- **Rev. 4046** — **SITE DE VENDAS COMPLETO EM `/planos` (LANDING PAGE, NÃO SÓ O FORMULÁRIO).** Nova página `client/src/pages/portal/SiteVendas.tsx` (dark/gradiente laranja-âmbar sobre navy): hero com CTA duplo, stats bar, grid dos 14 módulos (ícone/cor/descrição/preço espelhando `shared/billingModules.ts`), seção "Por que a FC" com o case ÚNICO real (FC Engenharia como cliente-zero do próprio produto — sem cliente fictício), benefícios, vídeo institucional placeholder (`INSTITUTIONAL_VIDEO_URL`), Instagram/YouTube desabilitados "(em breve)" via `SOCIAL_LINKS`, CTA final e footer. `/planos` agora renderiza `SiteVendas`; `/contratar` continua sendo o formulário `ContratarPlano` (conversão), alvo dos CTAs da landing. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4045** — **PROJETO SAAS "FASE 4" (FINAL) — MODULE GATING (ENFORCEMENT): EMPRESA-CLIENTE SÓ ACESSA O QUE CONTRATOU.** Gate GLOBAL via middleware tRPC (`server/_core/moduleGating.ts` + `requireModuleGate` em `protectedProcedure`), não router-por-router: `ROUTER_MODULE_MAP` liga namespace tRPC → módulo faturável (`shared/billingModules.ts`). Regra crítica: empresa SEM `company_subscriptions` (todo o parque interno FC pré-SaaS) = "legada", acesso irrestrito; só empresa-cliente com subscription é gateada pelos módulos contratados em `company_subscription_modules` (status trialing/active/past_due). `admin`/`admin_master` sempre bypassam (design da Rev. 4040). Cache 30s invalidado nas mutations de billing + no webhook de sync. Frontend: `billing.getContractedModules` integrado em `ModuleConfigContext.isModuleEnabled`. Fecha o plano de 4 fases da transformação SaaS. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4044** — **PROJETO SAAS "FASE 3" — LIFECYCLE DE ASSINATURA: SELF-SERVICE REAL PRA `ADM_CLIENTE`.** `server/routers/billing.ts` ganhou `getMySubscription`/`createPortalSession` (Stripe Billing Portal)/`updateSubscription` (add/remove módulo + assentos com proration)/`cancelMySubscription`/`reactivateMySubscription`, todos via `getOwnSubscriptionOrThrow` (só `adm_cliente`, só a própria empresa). Nova página `MinhaAssinatura.tsx` com guard dedicado `AdmClienteGuard` em `/minha-assinatura`; item de sidebar visível só pra `adm_cliente`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4041** — **PROJETO SAAS: NOVO PERFIL "ADM CLIENTE" + 2 VULNS CRÍTICAS DE `listUsers`/`createLocalUser` CORRIGIDAS.** Novo papel `adm_cliente` (gerencia só usuários `role:"user"` da própria empresa); achado GRAVE corrigido: `listUsers`/`createLocalUser` sem check de role permitiam escalação total e vazamento cross-tenant. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4040** — **PROJETO SAAS "FASE 0" — AUDITORIA DE ISOLAMENTO ENTRE EMPRESAS (LGPD) E CORREÇÃO DE 6 GAPS DE IDOR CONFIRMADOS.** 6 gaps de IDOR cross-tenant corrigidos (SST, DANFE, dissídio, horas extras, folha) antes de iniciar o projeto SaaS. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4039** — **DASHBOARD ALMOXARIFADO & EQUIPAMENTOS: ARQUIVO ÚNICO DE 1851 LINHAS COM 6 ABAS VIROU 6 PÁGINAS PRÓPRIAS.** Pedido: dividir `DashAlmoxarifadoEquipamentos.tsx` (controlava 6 seções via `?tab=`) em 6 páginas independentes com item próprio na sidebar, mais análise por funcionário, "top itens por valor", alerta de "itens sem categoria" e click-to-drill-down em todo gráfico. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4038** — **DASHBOARDS DE APR E PT (REV. 4037): GRÁFICOS RASOS DEMAIS — "COLOCA MAIS GRÁFICOS DETALHADOS".** 3 novas agregações em `aprAnalises.dashboard` (matrizRisco, topPerigos, timelinePorStatus) + 2 em `ptPermissoes.dashboard` (porEmpresaExecutante, timelinePorStatus); frontend ganhou heatmap + bar charts nos 2 dashboards. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4036 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
