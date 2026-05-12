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
  - `server/routers/`: tRPC routers per module
  - `server/db.ts`: Database helpers
- `drizzle/`: Schema and migrations
- `shared/`: Shared types and constants (e.g., `shared/version.ts`, `shared/changelog.ts`, `shared/paymentConditions.ts`, `shared/modules.ts`)
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: Defined by tRPC routers in `server/routers/`
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui` components

## Recent changes

> Histórico completo em `shared/changelog.ts`. Aqui ficam apenas as últimas ~5 entregas. Para revisões anteriores (Rev. ≤ 1657), consulte o changelog.

- **Rev. 1662**: **Programação Semanal — Visão LOTUS (toggle gerenciadora)**. Novo padrão visual exclusivo para gerenciadoras que exigem layout próprio (LOTUS no Santuário Nacional Aparecida). Toggle no header (`Padrão FC | Padrão LOTUS`), preferência por projeto em `localStorage`. Render: header com logos (gerenciadora + cliente, lidos de `obras`), tabela com hierarquia EAP, colunas DATA (previsto) + Real (editável inline → salva em `planejamento_atividades.data_inicio_real/data_fim_real`), RESPONSÁVEL = engenheiro da obra, Gantt diário 7 colunas com 5 cores (🟦 Previsto · 🟩 Realizado · 🟨 Não programado · 🟧 Antecipado · 🟥 Atrasado), legenda fixa. Exporta Excel (ExcelJS com cores) e PDF (print A3 paisagem). 2 colunas novas via ColFix; `getProjetoById` faz join com `obras`; nova mutation `setRealDates`. Componente novo `client/src/components/planejamento/ProgramacaoSemanalLotus.tsx`. Não afeta EVM/SPI/Curva S — visão paralela.
- **Rev. 1661**: **Login — busca de usuário accent-insensitive**. Reportado: `[Login] Falha: 'Myriélle Arcanjo' - encontrados: 0`. Causa: a busca em `users` era case-insensitive mas NÃO accent-insensitive — `LOWER(username)='myriélle'` não bate com `myrielle` no banco. Correção em `server/routers.ts` ~L1888-1901: input normalizado com `String.normalize('NFD').replace(/[\u0300-\u036f]/g,'')`, colunas via `LOWER(translate(col, 'áàâãäéè...', 'aaaaaee...'))` (sem precisar da extensão `unaccent`). Cobre as 4 combinações COM/SEM acento.
- **Rev. 1660**: **Férias — `definirData` agora invalida TODAS as queries do namespace (corrige "salvou mas não aparece")**. Bug Nelson/Josué: toast de sucesso aparecia mas a linha continuava "-"/"A Vencer". Causa: `onSuccess` chamava só `refetch()` do `feriasList` filtrado; `allFeriasList`, `calendarioCompleto`, `feriasDoFuncionario` e `listarVencidas` ficavam com cache antigo, e em React Query 5 o `refetch()` direto pode ser deduplicado quando o componente re-renderiza várias vezes no mesmo tick (reset de `definirItem`/`definirForm`). Corrigido para `await utils.avisoPrevio.ferias.invalidate()` — invalida TODO o namespace de uma vez. `client/src/pages/Ferias.tsx` ~L755-765.
- **Rev. 1659**: **Férias — Conclusão automática no término do gozo**. Novo job `FeriasAutoConclude` (a cada 6h, 1ª execução em 90s) varre `vacationPeriods` por `status='em_gozo' AND dataFim < hoje AND deletedAt IS NULL` e: (a) atualiza `status='concluida'`; (b) devolve o status do colaborador `Ferias→Ativo` apenas se NÃO houver outra férias 'em_gozo' do mesmo employeeId; (c) registra `logStatusChange` com `alteradoPor='Sistema (auto)'` e motivo "Férias concluídas automaticamente (término do gozo em DD)"; (d) dispara `corrigirPontoFuncionario` async. `server/routers/avisoPrevioFerias.ts` ~L3600-3700 (`autoConcluirFeriasVencidas` + `startFeriasAutoConcludeJob`); `server/_core/index.ts` ~L2070 (registro do job, t=20s).
- **Rev. 1658**: **Férias — Auto-prompt no início do gozo**. Quando uma férias com `status='agendada'` chega na `dataInicio` (≤ hoje), abre modal automático: "Colaborador X está com férias agendada para hoje, confirma o início do gozo de férias? [Sim] [Não]". Sim → dispara `updateFerias({status:'em_gozo'})` (mesma mutation do botão "Iniciar Gozo"). Não → segundo modal "Deseja reagendar data ou cancelar agendamento?" com 3 ações: Reagendar (abre `handleDefinirData` existente), Cancelar agendamento (`updateFerias({status:'cancelada'})` com confirm), ou Agora não (adia). Itens dispensados ficam em `sessionStorage` (chave `feriasGozoSkip:<companyId>`, valor `id:dataInicio`) — não voltam a perguntar na sessão; se reagendar p/ outra data, volta a perguntar. `client/src/pages/Ferias.tsx` ~L609-684 (state+effect+helpers) e ~L2943-3050 (Dialog 2-stage no fim do componente).
<!-- Rev. ≤ 1657: ver shared/changelog.ts -->

## Architecture decisions

- **Consolidated Payroll Model**: Parent company (`input.companyId`) owns payroll periods and records. Read queries use `allCompanyIds` IN clauses for subsidiary data, while write queries use `input.companyId` for consolidation.
- **Single Database Source (Neon)**: The system exclusively uses Neon PostgreSQL via `NEON_DATABASE_URL`. `DATABASE_URL` is *never* used as a fallback. All schema changes and fixes are applied directly to Neon.
- **Tenant Isolation**: All data operations (`INSERT`, `SELECT`, `UPDATE`, `DELETE`) consistently filter by `companyId` to ensure strict tenant isolation. Soft-deletes are handled by filtering `deletedAt IS NOT NULL`.
- **EAP Adaptability**: Budget structures (EAP) can vary wildly per project (depth, naming, accumulated values). Cross-module logic (budget × schedule, financial curve, measurements) is designed to be adaptive, automatically detecting leaf items and normalizing values.
- **Specialized AI per Module**: Instead of a generic AI assistant, each module (Planning, Budget, Purchasing, HR, Finance, SST, Measurement) integrates a dedicated AI widget with specific system prompts and context for relevant insights.

## Product

- **HR & DP**: Payroll, time tracking, employee management, benefits.
- **SST (Safety)**: EPIs, ASOs, CIPA, NRs, PGR/PCMSO/LTCAT management with AI-powered document upload.
- **Jurídico**: Legal case management (Labor, Tax, Civil) with rich dashboards, KPIs, and alerts.
- **Terceiros**: Third-party contractors, detailed measurement workflows, PDF generation, financial integration.
- **Parceiros**: Benefits partners management.
- **Orçamento**: Budget creation (Excel import), 3 versions (Sale/Cost/Target), ABC curve, BDI, EAP tree, AI assistant.
- **Financeiro Integrado**: Comprehensive financial module integrating all other modules, auto-DRE, cash flow projection, KPI tracking, COSO approvals.
- **Compras**: Full procurement cycle (SC → Quotation → PO → Warehouse), smart purchasing, budget control, supplier portal, automated alerts.
- **Operacional**: Construction site operations including Daily Log, RDO, Checklists, Concreting, Non-Conformities, Photo Register, Technological Tests, BIM 3D/4D viewer.
- **IntegraSign**: Internal electronic signature module for service contracts.
- **Portal do Prestador de Serviço**: External portal for service contract management and measurements.
- **Frotas**: Fleet and vehicle management (maintenance, fuel, tolls, fines, insurance, tracking, vehicle checklists, Infleet API integration).
- **SMO (Manpower Request)**: Workflow for requesting manpower, financial impact analysis, onboarding checklists, approval process.
- **HE (Overtime Request)**: Workflow for requesting overtime, approval, and financial impact.
- **Currículos**: Resume bank with AI-powered parsing, status tracking, and duplicate detection.
- **Controle de Integrações**: Tracking employee integrations with clients and internal refreshers.
- **Integração de Segurança SST**: Onboarding/training module for safety with public quiz portal and admin dashboard.
- **Telemetria & Analytics**: Tracks platform usage, user engagement, and AI interaction for administrative insights.
- **Dashboard Executivo de Obras**: High-level project KPIs, progress tracking, and health matrix.
- **Proj./Doc. Técnicos**: Document management system for technical project documentation with revision control and ART/RRT management.
- **Medição**: Contract measurement sheets, bulletin generation, direct invoicing (FD).
- **Integração Mas Controle ERP**: Data import from Mas Controle ERP via API or CSV.

## User preferences

- After every completed adjustment, remind the user to click **Publish** to deploy. Deployment config: autoscale, build=`pnpm run build`, run=`node dist/index.js`.
- **Regra de ouro — Datas no padrão brasileiro**: TODA data exibida ao usuário (tabelas, drill-downs, modais, listas, exports visuais) deve estar em **dd/MM/aaaa**. Nunca exibir `YYYY-MM-DD` cru vindo do banco. Padrão de conversão simples: `s.split("-").reverse().join("/")`.
- **Regra de ouro — Paridade Portal × Planejamento**: O Portal do Cliente NUNCA pode divergir do módulo Planejamento (REFIS, Curva S, Avanço Físico, SPI, etc.). O módulo **Planejamento é a fonte única da verdade**. Sempre que houver cálculo replicado no Portal (`PortalPlanejamentoCliente.tsx`), ele deve espelhar EXATAMENTE a fórmula do ERP em `PlanejamentoDetalhe.tsx` — mesmo universo de atividades (folhas com `dataInicio && dataFim`), mesmo denominador, mesma convenção para indiretas (curva prevista linear no realizado). Antes de fechar qualquer ajuste em métrica de planejamento, verificar lado-a-lado os dois lados.

## Gotchas

- **CamelCase in Raw SQL**: Always quote camelCase column names in raw SQL (e.g., `"companyId"`) because PostgreSQL lowercases unquoted identifiers, leading to mismatches with Drizzle schemas.
- **New Columns**: For new database columns, always add them via `ColFix` in `server/_core/index.ts` to ensure they are present before queries run, as `syncSchema` might not execute early enough during startup.
- **Deleting Projects**: Deleting a project triggers a CASCADE delete of ALL child data across 37 tables. No deleted project data is reusable.
- **Budget Structures**: Budgets have VARIABLE structures. Never assume a single EAP structure; cross-module solutions must be adaptive and tested across diverse project structures.
- **New Module Registration**: When creating a new module, it MUST be registered in `server/routers.ts` (`ALL_MODULES`), `client/src/pages/Configuracoes.tsx` (`MODULE_INFO`, `MODULE_PAGES`), and `client/src/pages/ModuleHub.tsx` (`MODULES`) for full visibility and functionality.
- **Soft-Deleted Companies**: All queries, aggregations, listings, and jobs MUST filter out companies with `companies."deletedAt" IS NOT NULL`.

## Pointers

- **Drizzle ORM**: [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
- **tRPC**: [https://trpc.io/docs](https://trpc.io/docs)
- **Tailwind CSS**: [https://tailwindcss.com/docs](https://tailwindcss.com/docs)
- **Neon PostgreSQL**: [https://neon.tech/docs/introduction/about](https://neon.tech/docs/introduction/about)
- **Manus OAuth**: _(External documentation not provided, assume internal docs)_
- **Replit Deployment**: [https://docs.replit.com/](https://docs.replit.com/)
- **Infleet API**: [https://api.infleet.com.br/v1/graphql](https://api.infleet.com.br/v1/graphql)
- **BrasilAPI (CNPJ lookup)**: [https://brasilapi.com.br/docs](https://brasilapi.com.br/docs)
