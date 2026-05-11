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

> Histórico completo em `shared/changelog.ts`. Aqui ficam apenas as últimas ~8 entregas relevantes.

- **Rev. 1651**: **Programação Semanal — paridade EXATA com top card via snapshot Texto11**. Após Rev. 1650 o card mostrava 1,39% vs top card 1,41% (diff ~0,02pp) — aritmética em minutos do MSP. Solução em `ProgramacaoSemanal.tsx` ~L480: quando `aIni == projIniStr` E `fimEfetivo == statusDateSnapshot` E envelope intacto, retorna `previstoMspSnapshot` (Texto11). Idêntico ao bypass do top card (Rev. 1646.4). Validação: top card = card Programação Semanal = 1,41%.
- **Rev. 1650**: **Programação Semanal — "Previsto da semana" usa fórmula MSP**. O card mostrava 0,00% na Semana 1 mesmo com cutoff dentro da semana (top card = 1,41%). Causa: preferia `evmSemana.previstoCurvaS` (curva-S keyed por segunda-feira), que pós-Rev. 1647 (semanas sex→qui) desalinhou com `acumAt`. Correção em `ProgramacaoSemanal.tsx` ~L1017: quando há `calMSPParsed + projetoStart + projetoFinish`, usa `previstoSemanaDelta` (mesma fórmula EVM do top card: `du(semana∩envelope até cutoff) / du(envelope)`). Fallback histórico via curva-S preservado quando MSP ausente.
- **Rev. 1649**: **Barra superior "Avanço Físico" acompanha simulação de semana**. A barra do topo de Planejamento → Detalhe agora segue `semanaVisualizacao` em AMBOS os modos (Live e Oficial). Antes, o modo Oficial congelava no cutoff (1,41%) mesmo quando o usuário simulava uma semana futura com 10,76% — agora simula junto. Sem semana selecionada, comportamento anterior preservado. `avancoAtual` (~L491) e `avancoPrevistoDia` (~L533) usam `semanaVisualizacao + 7d` quando há semana selecionada, senão `refDateStr` (cutoff). Snapshot Texto11 MSP continua quando refStr === statusDateSnapshot.
- **Rev. 1648**: **Importar Cronograma — primeira importação traz 100% sem perguntar modo**. Quando o projeto ainda não tem cronograma, o seletor "Mesclar / Apenas Predecessora / Substituir tudo" fica oculto e o import roda direto importando todas as atividades do arquivo (cartão verde "Primeira importação — todas as N atividades serão importadas"). O seletor só aparece em ATUALIZAÇÕES de cronograma existente. Detecção via `listarAtividades(revisaoId)` em `ImportarCronograma.tsx`; useEffect força `modoImport='substituir'` quando `!jaTemCronograma`. Comportamento das atualizações permanece idêntico (default `mesclar`).
- **Rev. 1647**: **Cutoff configurável por projeto + janela cobrável alinhada na Programação Semanal (Opção A+B com lock de consolidação)**. Resolve o "atraso fantasma" entre o cutoff (quinta) e a semana cobrável (seg→sex). Agora o dia do cutoff é configurável por projeto (default qui), e cada semana vai do dia seguinte ao cutoff anterior até o próximo cutoff (ex.: cutoff=qui → semana = sex→qui — paridade total entre PV e EV). Adicionada PREMISSA com botão **Consolidar** (one-way lock): antes de consolidar, gestor pode trocar o dia; depois fica imutável (proteção contra trocas acidentais). Schema: `planejamento_projetos` +4 colunas (`dia_corte_semana` int default 4, `cutoff_consolidado` bool, `cutoff_consolidado_em/_por`). Helper `shared/dataCorte.ts` generalizado: `ultimoDiaSemanaAte/proximoDiaSemana/ehDiaSemana/semanaDoCutoff/nomeDiaSemana` — aliases `ultimaQuintaAte/proximaQuinta/ehQuinta` mantidos para retrocompat. Backend: `getDataCorte` retorna `diaCorteSemana+cutoffConsolidado`; novas mutations `setDiaCorte` (bloqueia se consolidado) e `consolidarCutoff` (one-way); `fecharSemana` valida via `ehDiaSemana(novoCorte, projeto.diaCorteSemana)`. ProgramacaoSemanal.tsx: `computeWeeks(atividades, diaCorteSemana)` gera weeks alinhadas; substituídos 5 call sites que somavam +2/+3 dias para chegar em domingo — agora `fim` É o cutoff, end-of-day exclusivo = `fim+1d`. ColFix idempotente em `server/_core/index.ts`. UI: seletor de dia + badge "Consolidado/Consolidar" no header.
- **Rev. 1646.6**: **`pvMacro` — fonte única do "Previsto%" (EVM clássico)**. Eliminadas as 4 fórmulas paralelas que mostravam números diferentes para "Previsto%" na aba Avanço Semanal (1,41% / 1,98% / 2,24%). Novo helper `pvMacro(refStr)` em AvancoSemanal (`PlanejamentoDetalhe.tsx` ~L4687-4718) replica exatamente a fórmula da raiz do MS Project (Texto10/Texto11): `PV(t) = du(início → t) / du(envelope) × 100` usando `calendarioJson` MSP. Quando `refStr === statusDateSnapshot`, retorna o snapshot exato Texto11 (paridade absoluta com top card). Para qualquer outra semana (passada/futura), calcula com a mesma fórmula — usuário navega livremente sem re-importar XML. Refatoradas 3 useMemo: (a) `previstoRealizadoSemana` (banner "Semana N — Previsto" = `pvMacro(refFim) − pvMacro(semIni)`, com `refFim=cutoff` quando semana contém cutoff; débito acumulado também via `pvMacro` capeado no cutoff — não cobra débito de semana futura); (b) `previsto` (card "PREVISTO SEMANA"); (c) `previstoComInd` (variante com indiretas). Fallback (sem MSP) preservado em todas as 3 — interp linear por datas + pesoFinanceiro. Literatura: PMBOK 7ª, AACE 23R-02 (Earned Schedule), ANSI/EIA-748-D, Fleming "Earned Value PM". Validação REVTE-CIVIL (cutoff 07/05): Top card = Card SEMANA = Banner Sem 1 = **1,41%**.
- **Rev. 1646.5**: **Paridade banner Programação Semanal × top card**. `ProgramacaoSemanal.tsx`: `previstoSemanaDelta` agora tem **modo MSP** (quando `calendarioJson` + `projetoStart` + `projetoFinish` presentes): EVM clássico — semana ANTES do cutoff = `du(semana)/du(envelope)`; semana CORRENTE = `du(semIni → cutoff)/du(envelope)` (PV exigível); semana FUTURA = `du(semana)/du(envelope)` (informativo). **Modo legado** (sem MSP) mantém peso financeiro × overlap. Novas props `projetoStart` e `projetoFinish` em `Props`, passadas de `PlanejamentoDetalhe.tsx`.
- **Rev. 1646.4**: **Snapshot oficial do %PREVISTO MSP (Texto11) p/ paridade exata** no card "Avanço Físico" do Planejamento. `parseMSProjectFull` extrai `<FieldID>188743997</FieldID>` (Texto11) da raiz UID=0 e embute no `calendarioJson` como `previstoMspSnapshot` + `statusDateSnapshot` + `envelopeStart/FinishSnapshot`. `avancoPrevistoDia` retorna o snapshot direto quando `refStr === statusDateSnapshot` E o envelope ainda bate; senão cai no cálculo dinâmico `fracaoDecorridaMs`. Espelhado em `portalExterno.ts` (`pctTotalPrevisto`).
- **Rev. 1642**: **Paridade 100% MS Project no Previsto%** — Cutoff = `<StatusDate>` do XML + interpolação por **dias úteis** usando `<Calendars>` do XML. Nova coluna `calendarioJson` em `planejamento_projetos`. Helper compartilhado `shared/diasUteis.ts`: `parseCalendarioJson`, `ehDiaUtil`, `diasUteisEntre`, `fracaoDecorridaMs(iniMs,refMs,fimMs,cal)` (fallback linear quando `cal=null`). Parser `ImportarCronograma.tsx` extrai `<Calendars>` e `<StatusDate>`; `salvarMetadadosMSProject` grava em `dataCorteAtual` + `calendarioJson`. Refatorados 5 call sites (4 em `PlanejamentoDetalhe.tsx`, 1 em `ProgramacaoSemanal.tsx`). Portal do Cliente espelha via `parseCalendarioJson(projeto.calendarioJson)`.
- **Rev. 1641**: **Atividade Externa** (terceiro fora do escopo da FC) no Planejamento. Colunas `is_externa boolean` + `externa_responsavel varchar(200)` em `planejamentoAtividades`. UI: checkbox âmbar no editor + row laranja na tabela + badge "⚠️ EXTERNA" + barra Gantt laranja. **Last Planner — exclui do PPC/Aderência** (3 call sites em `ProgramacaoSemanal.tsx`); **NÃO exclui de SPI / Curva S / EV**. Portal do Cliente mostra badge idem.
- **Rev. 1640**: **Atender pelo Estoque (Almoxarifado)** como fonte alternativa no Mapa de Cotação. Colunas `isEstoque` + `almoxarifadoOrigemId` em `comprasCotacaoFornecedores` (sentinel `fornecedorId=0`). `adicionarEstoqueAoMapa` auto-popula preço médio + qty limitada ao saldo; `criarOrdemDeCotacao` ramifica para `tipo='estoque'` quando vencedor é Estoque (gera saída no almox + financial_entries PAGO + decrementa saldo). Nova origem `transferencia_estoque` em `financialOrigins.ts`.
- **Rev. 1639**: **Baixa da Rescisão Complementar** no modal "Dar Baixa no Aviso Prévio". 4 colunas novas em `termination_notices` (`baixa_complementar_*`). `darBaixa` aceita `tipo: 'rescisao' | 'fgts' | 'complementar'`; conclusão considera as 3 baixas. UI mostra 3 cards quando `previsaoRescisaoComplementar.total > 0`.
- **Rev. 1638**: **Frentes fora do plano da semana (Last Planner System)** na Programação Semanal. `frentesForaPlano` classifica em **ANTECIPADAS** (`dataInicio > semFim` e `av > 0`) e **ARRASTADAS** (`dataFim < semIni` e `0 < av < 100`). Sub-linha informativa no top card + Bloco B (azul, antecipadas) + Bloco C (âmbar, recuperação). Aderência PPC/SPI/Realizado inalterados. Sub-revisões (1638.1-1638.4) refinam tolerância proporcional ao peso, pills clicáveis no seletor de janela, legenda explícita por indicador, e janela de recuperação com input livre + bloqueio por prazo.
- **Rev. 1637**: **Data de Corte (Status Date PMBOK 7 / EVM)** por projeto para eliminar o "atraso fantasma" entre quintas-feiras. Colunas `dataCorteAtual/AtualizadaEm/AtualizadaPor` em `planejamento_projetos`. Helper `shared/dataCorte.ts` (`ultimaQuintaAte`, `proximaQuinta`, `cutoffEfetivo`). Procedures `getDataCorte` e `fecharSemana`. Portal do Cliente substituiu `today` cru por `cutoffStr` em TODOS os cálculos (PV, EV, atrasadas, caminho crítico). ERP ganhou toggle **Live ↔ Oficial** + botão "Fechar semana". Sub-revisões 1637.2/1637.3 fixam top card (ignora `semanaVisualizacao` no modo Oficial) e regra de "Atrasada" (só com dívida acumulada de semanas FECHADAS).
- **Rev. 1636**: **Férias e Rescisão de Aviso projetadas em rubricas próprias** no Contas a Pagar. `getQuadroCLT` agora só conta `status='Ativo'`. Nova `getFeriasProjetadas` (lê `vacation_periods`, vencimento conforme **CLT 145**) e `getRescisoesProjetadas` (lê `status='Aviso'`, vencimento +10d corridos conforme **CLT 477 §6º** Lei 13.467/17). Memoriais dedicados em `getEntryDetalhe`. Resultado FC: 118 lançamentos projetados (107 + 8 férias + 3 rescisões).

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