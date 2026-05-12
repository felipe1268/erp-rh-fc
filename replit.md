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

> Histórico completo em `shared/changelog.ts`. Aqui ficam apenas as últimas ~5 entregas. Para revisões anteriores (Rev. ≤ 1669), consulte o changelog.

- **Rev. 1672**: **Avanço Semanal — Importar MS Project agora lê Texto7 (%Reali AUX) em vez de PercentComplete inteiro**. Reportado: import do XML com avanço = previsto trazia Realizado < Previsto (33,33% previsto vs 29% realizado por atividade, Δ −0,08% no agregado). Causa: `importarDoMSProject` em `PlanejamentoDetalhe.tsx` ~L5318 lia `<PercentComplete>` com `parseInt` — campo nativo MSP é INTEIRO (granularidade 1%), enquanto Texto7 (`%Reali AUX`, FieldID 188743747) tem 4 casas e bate com o "% Previsto" exibido (calculado via `fracaoDecorridaMs`). Fix em 3 fases: **F1** parser passa a extrair primeiro Texto7 dos `ExtendedAttribute` filhos diretos do `<Task>` (mesma lógica oficial do `ImportarCronograma.tsx` Rev. 1670, vírgula BR → ponto); **F2** fallback `parseFloat(<PercentComplete>)` quando Texto7 ausente (não trunca); **F3** banner de sucesso quebra por fonte ("X via %Reali AUX · Y via %Concluído MSP · Z sem dado") pra usuário ver imediatamente se XML tem snapshot ou se ERP caiu no fallback. XLSX preservado.
- **Rev. 1671 — Fases 2-5**: **Planejamento — Unificação MSP/Orçamento concluída (helpers únicos, PV/EV oficiais, Curva $ via Orçamento, auditoria pré-save)**. Fechamento da unificação iniciada na Rev. 1670 Fase 1. Entrega ADITIVA — nenhum cálculo existente alterado. **F2** `pvEvOficialAt` (server tRPC ~L1932-2030): retorna PV/EV/SPI + drill-down por atividade para qualquer refDate; quando ref===statusDate gravado no XML, soma snapshots Texto10/Texto7 ponderados (paridade absoluta com MSP). **F3** `shared/planejamentoMath.ts`: helpers `pvAt`/`evAt`/`folhasContaveis`/`calcularPesos`/`spi` reutilizáveis client+server. **F4** `getCurvaSFinanceiraOrcamento` (server ~L4307-4423): JOIN `planejamento_atividades.eapCodigo` × `orcamento_itens.eapCodigo`, usa `custoTotal` do Orçamento como valor por atividade; sem match cai no fallback peso% × totalVenda. R$ NUNCA do XML (Cost ×100). **F5** painel auditoria MSP×ERP em `ImportarCronograma.tsx` ~L1165-1198: mostra contagem snapshot Texto10/Texto7 + Σ %Previsto/Realizado ponderado ANTES do save. Refatoração progressiva dos consumers (top card, Avanço Semanal, Programação Semanal, Portal Cliente) para `pvEvOficialAt` fica como cleanup futuro.
- **Rev. 1670 — Fase 1**: **Planejamento — snapshot Texto10/Texto7 por atividade persistido no import (unificação MSP, fase 1/5)**. Parser XML extrai ExtendedAttributes Texto10 (FieldID 188743750, %PREVISTO) e Texto7 (FieldID 188743747, %Reali AUX) por atividade, grava em `previsto_msp_pct`/`realizado_msp_pct` NUMERIC(8,4) nullable em `planejamento_atividades`. Aplicado em SUBSTITUIR (`salvarAtividades`) e MESCLAR (`importarComModo`). XLSX legado / XML sem ExtendedAttributes deixam null. ColFix garante colunas em todo startup.
- **Rev. 1669**: **Avanço Semanal — Input de % com digitação livre (xx,xx)**. O input numérico nativo (`type=number`, `parseFloat(e.target.value) || 0`) forçava "0" sempre que o campo ficava vazio durante a edição — apagar "28" pra digitar "33,5" virava "0" e bloqueava o resto. Trocado para `type=text` + `inputMode=decimal` com buffer de digitação por linha (`inputRaw`); aceita vírgula e ponto, parseia/clampa só no blur (ou Enter). UX: foco seleciona tudo. `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (state ~L4785, input ~L6115-6140).
- **Rev. 1669**: **Avanço Semanal — Paridade do "% Previsto" com Programação Semanal (dias úteis MSP)**. Reportado: mesma atividade (04/05→22/05, cutoff 07/05) mostrava Previsto 16,67% no Avanço Semanal e 26,67% na Programação Semanal. Causa: Avanço Semanal usava interpolação linear por **dias corridos** (3/18=16,67%); Programação Semanal usa `fracaoDecorridaMs` com **dias úteis do calendário MSP** (4/15=26,67%). Fix: trocado o `prevInd` per-row do Avanço Semanal para a MESMA fórmula `fracaoDecorridaMs(ini, ref, fim, calMSP)` (calMSP já estava no escopo do componente desde Rev. 1645). Cutoff = fim da semana cutoff EOD. `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` ~L6045-6058.
- **Rev. 1669**: **Avanço Semanal — Coluna "% Previsto" + rename "% Acumulado"→"% Realizado (Acum.)"**. Solicitado: ver, por atividade, quanto o cronograma diz que deveria estar feito até o cutoff (ao lado do % realizado, que já existia mas estava rotulado como "% Acumulado"). Adicionada coluna "% Previsto" em laranja (mesma cor do "Previsto" do header), reaproveitando o `prevInd` já calculado por linha (interpolação linear entre dataInicio e dataFim no fim da semana cutoff). Coluna "% Acumulado" renomeada para "% Realizado (Acum.)" pra clareza. `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` ~L6020-6024 (header), ~L6029/6034 (colSpan 7→8), ~L6097-6100 (cell).
<!-- Rev. ≤ 1668: ver shared/changelog.ts (histórico completo) -->

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
