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

- **Rev. 4049** — **RENOMEAÇÃO DO NOME DO SISTEMA: "ERP FC Engenharia" → "ERP Gestão Integrada" EM TODO O APP.** Usuário informou o nome oficial do sistema. Distinção preservada: "FC Engenharia" também é a empresa REAL cliente-zero (seed em `initSetup.ts`, fallback de nome de empresa, case real na landing) — essas referências à ENTIDADE ficaram intactas; só o NOME DO PRODUTO/SISTEMA foi trocado (navbar/footer de `SiteVendas.tsx`, heading `ContratarPlano.tsx`, rodapés de PDF/HTML em ~15 arquivos client+server, `VITE_APP_TITLE` env var, `SETUP_LOCAL.md`). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4048** — **`/planos` GANHA SEÇÃO DE "CASES ILUSTRATIVOS" (50 EXEMPLOS FICTÍCIOS, CLARAMENTE RÓTULADOS).** Usuário pediu "mais 50 cases para validação social"; como a regra é nunca inventar cliente fictício apresentado como real, foi confirmado por pergunta que são depoimentos fictícios com aviso explícito. `SiteVendas.tsx` ganhou `TESTIMONIALS` (50 objetos fictícios) + `TestimonialCardView` (badge "Ilustrativo"), nova seção "Exemplos de uso" com disclaimer permanente acima de um carrossel de 2 faixas com scroll infinito (`marquee-left`/`marquee-right` em `client/src/index.css`, pausa no hover). Case único REAL da FC Engenharia intacto em "Por que a FC". ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4047** — **`/planos` REDESENHADA (TEMA CLARO/VÍVIDO) + MASCOTE "JULINHO" + PREÇOS AJUSTÁVEIS PELO ADMIN.** Nova tabela `billing_module_prices` (self-heal) + `applyPriceOverrides()`; `server/routers/billing.ts` ganhou `adminGetPrices`/`adminUpdatePrices`; nova página `AdminPrecos.tsx` em `/admin/saas/precos`; `SiteVendas.tsx` reescrita com fundo claro/vívido e mascote "Julinho". ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4046** — **SITE DE VENDAS COMPLETO EM `/planos` (LANDING PAGE, NÃO SÓ O FORMULÁRIO).** Nova página `client/src/pages/portal/SiteVendas.tsx` (dark/gradiente laranja-âmbar sobre navy): hero com CTA duplo, stats bar, grid dos 14 módulos, seção "Por que a FC" com o case ÚNICO real, benefícios, vídeo institucional placeholder, CTA final e footer. `/planos` agora renderiza `SiteVendas`; `/contratar` continua sendo `ContratarPlano`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4045** — **PROJETO SAAS "FASE 4" (FINAL) — MODULE GATING (ENFORCEMENT): EMPRESA-CLIENTE SÓ ACESSA O QUE CONTRATOU.** Gate GLOBAL via middleware tRPC (`server/_core/moduleGating.ts` + `requireModuleGate`); empresa sem `company_subscriptions` = "legada" (acesso irrestrito); `admin`/`admin_master` sempre bypassam. Fecha o plano de 4 fases da transformação SaaS. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4044** — **PROJETO SAAS "FASE 3" — LIFECYCLE DE ASSINATURA: SELF-SERVICE REAL PRA `ADM_CLIENTE`.** `server/routers/billing.ts` ganhou `getMySubscription`/`createPortalSession`/`updateSubscription`/`cancelMySubscription`/`reactivateMySubscription`; nova página `MinhaAssinatura.tsx` com guard `AdmClienteGuard` em `/minha-assinatura`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4041** — **PROJETO SAAS: NOVO PERFIL "ADM CLIENTE" + 2 VULNS CRÍTICAS DE `listUsers`/`createLocalUser` CORRIGIDAS.** Novo papel `adm_cliente` (gerencia só usuários `role:"user"` da própria empresa); achado GRAVE corrigido: `listUsers`/`createLocalUser` sem check de role permitiam escalação total e vazamento cross-tenant. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4040 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
