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

- **Rev. 1735**: **DDS — Modal 'Nova Sessão' agora puxa TODO o efetivo da obra (mesma fonte da aba 'Efetivo por Obra')**. Reportado: REVTE-CIVIL no DDS mostrava "Nenhum colaborador vinculado" enquanto a aba Efetivo por Obra mostrava 11 funcionários. Causa: a Rev. 1733 consolidou o sidebar por nome canônico mas partia do `obras.listActive` (filtra status='Em_Andamento'). Quando há cadastros duplicados com nomes idênticos mas STATUS diferentes (REVTE-CIVIL Em_Andamento + duplicata com outro status), o sidebar via só o ID Em_Andamento — mas os 11 colaboradores estavam vinculados à outra ID. `getEfetivoPorObra` (`server/db.ts`) consolida olhando TODAS as obras da empresa por nome canônico, independente de status — daí a divergência. Fix em `server/routers/dds.ts`: novo helper `expandObraIdsByCanonicalName(db, companyId, obraIdsInput)` valida ownership, extrai nomes canônicos (trim+UPPER), busca TODAS as obras da empresa, retorna união de IDs com nome igual. Aplicado em `funcionariosDaObra`, `colaboradoresParaTransferir`, `acidentesRecentes`. Sem schema change.
- **Rev. 1734**: **Solicitações de Compra — 9 mini-blocos do card 'Status das Solicitações' agora filtram a tabela**. Solicitado pelo usuário (screenshot iPad do card Rev. 1732): cada bloco (Aguardando aprovação / Aprovadas (sem OC) / Pendente / Em cotação / Em andamento / Entrega parcial / Concluídas / Recusadas / Canceladas) deve filtrar a tabela ao ser clicado. Fix em `client/src/pages/compras/Solicitacoes.tsx` sem schema change: (1) novo state `filtroBreakdown` independente do `filtroStatus` das KPI badges. (2) `breakdownPredicates` reusa a MESMA lógica do `useMemo statusBreakdown` (count e filtro batem pixel-por-pixel). (3) `listaFiltradaObra` ganha etapa adicional aplicando o predicado quando ativo. (4) `<div>` → `<button>` com toggle (clicar no mesmo bloco limpa); ativo ganha `ring-2 ring-inset` da cor do bullet + bg slate suave. (5) ativar breakdown reseta `filtroStatus` pra 'todos' (evita combinação inconsistente). (6) banner âmbar abaixo da grade quando há filtro ativo: 'Filtro ativo: N solicitação(ões)' + botão 'Limpar filtro ✕'. KPI badges abaixo seguem funcionais.
- **Rev. 1733**: **DDS — Sidebar de obras consolidado por nome (corrige '0 colaboradores' em obras duplicadas)**. Reportado: REVTE-CIVIL no modal Nova Sessão DDS mostrava "0 colaboradores na equipe" mas o cadastro > aba Efetivo exibia o time. Causa: existem cadastros DUPLICADOS com mesmo nome (IDs diferentes) — sidebar do DDS listava 1:1 e ao clicar consultava o efetivo de só UMA delas. O cadastro > Efetivo já consolida via `getEfetivoPorObra` (trim+UPPER do nome). Fix em 2 camadas, sem schema change: (1) **Server `dds.ts`**: as 3 queries do modal (`funcionariosDaObra`, `colaboradoresParaTransferir`, `acidentesRecentes`) passam a aceitar `obraIds: number[]` (opcional ao lado do `obraId` legado). Validam ownership de TODAS as ids contra `companyId`, deduplicam funcionários por `employeeId`. `colaboradoresParaTransferir` exclui quem está em QUALQUER duplicata. `acidentesRecentes` usa `inArray`. (2) **Client `DDSGuia.tsx`**: `obrasConsolidadas` (Map por chave canônica) usado no sidebar — cards mostram nome único e micro-label '(N cadastros consolidados)' quando há duplicatas. `sessaoForm.obraIds: number[]` carrega TODAS as ids do grupo ao clicar; `obraId` (canônico = primeiro id) preservado pra `criarSessao`. Badge ⚠️ no sidebar agrega acidentes de todas as duplicatas. Sub-diálogo de transferência envia para o id canônico. Avulsa → `obraIds: []`.
- **Rev. 1732**: **Solicitações de Compra — Card superior 'Status das Solicitações' (visão consolidada granular)**. Solicitado pelo usuário (screenshot iPad de `/compras/solicitacoes`): as 4 KPI badges existentes são macro-status — faltava uma visão por estado de aprovação/cotação/entrega. Fix em `client/src/pages/compras/Solicitacoes.tsx` SEM schema change: novo `useMemo statusBreakdown` calcula 11 métricas (total/ativas/aguardandoAprov/aprovadasSemOC/pendente/emCotacao/emAndamento/entreguesParcial/concluidas/recusadas/canceladas/urgentes) a partir do `listaKpisBase` (mesma fonte das KPI badges, respeita filtro de obra). Card renderizado ANTES das KPI badges com gradient slate, header 'Status das Solicitações ({total} no total · {ativas} ativas)' + subtítulo, badge vermelho pulsante '⚠️ N URGENTE(S)' à direita quando há urgentes ativas, grid responsivo (2/3/5/9 col conforme largura) com 9 mini-blocos divididos por borda — número grande tabular + bullet colorido (opaco quando 0) + label. As 4 KPI badges existentes seguem clicáveis como filtro abaixo, intactas.
- **Rev. 1731**: **DDS — Modal full-screen com obras como eixo principal + transferir colaborador inline + regra obrigatória de acidente D-1 (Lei art. 157 CLT)**. Solicitado pelo usuário em 3 frentes (vide screenshot iPad): (1) modal full-screen ajustado; (2) DDS é por obra → obras precisam aparecer já com o efetivo, com opção de transferir colaborador pra regularizar na hora; (3) **regra obrigatória**: se houver acidente cadastrado na empresa, o DDS do dia seguinte DEVE abordar o assunto com detalhes dos fatos. **Server (`server/routers/dds.ts`)**: 3 novos endpoints — (a) `colaboradoresParaTransferir(companyId, obraId)` lista ativos da empresa fora da obra (subquery `notInArray`); (b) `transferirParaObra(companyId, obraId, employeeId)` cria/reativa registro em `obra_funcionarios` com authz por companyId e bloqueio de status terminais; (c) `acidentesRecentes(companyId, obraId?, diasJanela=7)` retorna acidentes dos últimos 7 dias com flag `obrigatorio=true` quando `dataAcidente === ontem`, LEFT JOIN com employees/obras pra trazer nomes. **Client (`client/src/pages/sst/DDSGuia.tsx`)**: layout 2-painéis full-screen `!max-w-[98vw] h-[95vh]`. Sidebar esquerda (col-span-3): busca + card Avulsa/Escritório + cards de obras com badge pulsante vermelho '⚠️ N' quando há acidente obrigatório. Painel principal (col-span-9): (1) barra-resumo obra alvo + count colaboradores; (2) **banner vermelho 'DDS OBRIGATÓRIO HOJE — Acidente registrado ontem'** citando Lei art. 157 CLT/NR-1, com botão 'Aplicar como tema' que pré-popula título + conteúdo estruturado (data, colaborador, obra, tipo, gravidade, local, parte do corpo, agente causador, dias afastamento, descrição, ação corretiva, pontos a reforçar); (3) banner âmbar suave pra acidentes não-obrigatórios dos últimos 7 dias com chips de atalho; (4) Data/Hora com chips; (5) Tema agrupado por categoria; (6) Título + roteiro colapsável; (7) Instrutor com auto-fill; (8) Local com histórico; (9) **Bloco Equipe da Obra com botão azul 'Transferir colaborador'** que abre sub-diálogo com lista de candidatos, busca por nome/CPF/função, botão 'Transferir →' por linha — após transferência invalida queries e marca como presente automaticamente; (10) Observações. Footer fixo. Sem schema change.
<!-- Rev. ≤ 1730: ver shared/changelog.ts (histórico completo) -->

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
