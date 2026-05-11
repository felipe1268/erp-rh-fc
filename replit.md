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

- **Rev. 1638.4**: Janela de recuperação ganhou **input livre** + **bloqueio por prazo** (Programação Semanal). Novo subcomponente `RecoveryPicker` (1) mantém as pills 1/2/4/6/8/12, (2) adiciona `<input type="number">` ao lado pra digitar 1-52 sem (commit no Enter ou blur) e (3) calcula `maxSemanas = floor((limite − semFim) / 7)` onde **limite = MIN** entre: (a) `dataTerminoContratual` do projeto, (b) menor `dataFim` de atividade do **caminho crítico** (float ≤ 0) ainda não concluída, (c) menor `dataInicio` de atividade futura ainda não iniciada. Pills > maxSemanas viram cinza riscado com tooltip "Bloqueado — N sem ultrapassa {motivo} em DD/MM/AAAA". Input rejeita > maxSemanas com banner vermelho "⚠️ Máximo permitido: X sem (limite: DD/MM — {motivo})" e reverte pro último valor válido. Sufixo discreto "(máx. X sem — não passa de DD/MM)" sempre visível. Nova prop `dataTerminoContratual` em `ProgramacaoSemanal`, alimentada por `proj?.dataTerminoContratual` em `PlanejamentoDetalhe.tsx`.
- **Rev. 1638.3**: Legenda explícita por indicador no card "Avanço Físico" da Programação Semanal. Antes, o usuário tinha só o parágrafo único "Como ler" + tooltips em hover (que não funcionam em iPad/touch). Agora, bloco `<details>` colapsável "**O que significa cada indicador?**" abrindo um grid 2 colunas com a definição clara de cada KPI: **Previsto** (delta da Curva S baseline, overlap dias × peso ÷ duração), **Realizado** (delta de avanço físico real ponderado), **Aderência (SPI sem.)** (Realizado ÷ Previsto, ≥95% verde), **Atraso a recuperar** (PV − EV de semanas fechadas, métrica gerencial não desconta baseline), **Meta diluída (N sem)** (Previsto baseline + Atraso ÷ N), **Recuperar em N sem** (janela de Recovery Schedule AACE 23R-02), **💡 Sugerido** (janela mínima viável = débito ÷ folga de pico do histórico), **📅 Atraso zerado em** (data de convergência se a meta diluída for entregue toda semana). Rodapé reforça que "baseline (PV) é imutável". Cada bloco tem dot/ícone colorido pareando com a cor do KPI no banner.
- **Rev. 1638.2**: Bugfix do seletor "Recuperar em N semanas" no card Avanço Físico da Programação Semanal. No iPad/iOS Safari o `<select>` nativo abre um picker tela cheia que só commita o valor ao tocar "Concluído" — tocar fora cancela silenciosamente e o valor reverte pro último persistido, gerando o sintoma "fixa sempre em 12". Substituído por **pills clicáveis** (1/2/4/6/8) com `<button>` em `role="radiogroup"`, commit instantâneo no `onClick` em qualquer plataforma. Visual: agrupado em `inline-flex` com fundo `bg-slate-100` (rail) e a opção ativa em `bg-blue-600 text-white`.
- **Rev. 1638.1**: Tolerância PROPORCIONAL ao peso no helper `calcAtrasada` (Programação Semanal). Antes, qualquer atividade com diff (prev_linear_até_cutoff − real) ≥ 2pp já virava "Atrasada", inclusive frentes minúsculas (peso ~0,17%) cuja "dívida" no projeto era < 0,01pp — ruído visual. Nova regra: além do diff ≥ 2pp, precisa de pelo menos UMA: **(a)** vencida pelo cutoff (`fim ≤ ref`) — sempre flaga, sem exceção (recuperação de cronograma já expirado); **(b)** dívida material no projeto: `peso × diff / 100 ≥ 0,05pp` — filtra atividades de baixo peso; **(c)** lag grotesco ≥ 30pp — rede de segurança para atividades minúsculas mas gritantemente atrás. Aplicado nos 4 call sites com `n(a.pesoFinanceiro)`. Caso REVTE-CIVIL: 2.3.1 Canteiro (peso 0,17%, real 34% vs linear 33,3%) deixou de ser "Atrasada" porque a diferença de 0,7pp gera dívida de 0,001pp no projeto; 4.5.8.1 Rampa (real 0% com diff ~67pp) continua atrasada pela cláusula (c).
- **Rev. 1638**: **Frentes fora do plano da semana (Last Planner System)** na Programação Semanal. Quando o engenheiro de campo abre uma frente que NÃO estava programada para a semana corrente, ela passa a aparecer separadamente — sem contaminar PPC/SPI/aderência (regra LPS: PPC mede previsibilidade do plano, não produtividade bruta). Implementação 100% client-side em `client/src/pages/planejamento/ProgramacaoSemanal.tsx`: (1) Novo `useMemo frentesForaPlano` classifica todas as folhas em duas listas — **ANTECIPADAS** (`dataInicio > semFim` e `av > 0`, programadas pra futuro mas em execução) e **ARRASTADAS** (`dataFim < semIni` e `0 < av < 100`, cronograma expirado ainda não fechou). (2) Sub-linha informativa no card "Avanço Físico" do topo: badges azul "🚀 +X.XXpp antecipado (N ativ.)" e âmbar "⏪ +Y.YYpp recuperando (N ativ.)" com tooltip explicando que NÃO entram no PV/SPI da semana. (3) Bloco B (azul, abaixo da tabela principal): mini-tabela "Frentes Antecipadas — fora do plano da semana" com EAP, badge 🚀 ANTECIPADA, "Programada para DD/MM/AAAA · Sem. N", peso projeto, real %, EV gerado em pp. tfoot totalizador. (4) Bloco C (âmbar): mini-tabela "Recuperação de Atrasos — frentes expiradas em execução" com mesma estrutura, mas mostrando "Devia terminar em" e "Falta" (peso × (100−av)/100). (5) Ordenação por `peso × av` desc (mais relevante no topo). Decisão arquitetural: snapshot atual (não delta semanal) — `avancosMap` neste componente já é só o snapshot, então a flag indica "frente fora do plano em execução acumulada", o que é o que o engenheiro precisa pra agir. Aderência PPC/SPI/Realizado seguem inalterados na regra Last Planner. Portal do Cliente continua mostrando o número oficial — blocos B/C aparecem também no portalMode (são informativos, não mudam KPI).
- **Rev. 1637.3**: "Atrasada" agora só aparece com **dívida acumulada de semanas FECHADAS**. Helper único `calcAtrasada(a, av, semanaIni)` em `ProgramacaoSemanal.tsx` calcula a referência como domingo 23:59 da semana anterior — atividades em curso na semana corrente NÃO ficam vermelhas só porque o tempo passou; viram "Em curso" (âmbar) ou "No prazo". Aplicado em 4 pontos onde a regra estava inconsistente: tabela principal (status + ícone Desvio), pill de aderência semanal, chips do navegador semanal, modo report e payload dos alertas IA do JULINHO.
- **Rev. 1637.2**: Top card "Avanço Físico" no `PlanejamentoDetalhe.tsx` agora ignora `semanaVisualizacao` quando em **modo Oficial** — sempre usa o cutoff oficial (data de corte) como referência. Fallback client-side para última quinta caso a query `getDataCorte` ainda esteja em loading, evitando flash de "−2,75% atrasado" entre uma atualização e outra.
- **Rev. 1637**: **Data de Corte (Status Date PMBOK 7 / EVM)** por projeto para eliminar o "atraso fantasma" entre quintas-feiras. Procedimento FC: cronograma é formalmente atualizado toda quinta; entre uma atualização e a próxima o EV (numerador) ficava congelado mas o PV (denominador) avançava com `today()`, produzindo SPI 0,33 / -2,75% atrasado em uma simples segunda — exatamente o caso REVTE-CIVIL relatado. (1) Nova tabela de campos em `planejamento_projetos`: `dataCorteAtual` (date), `dataCorteAtualizadaEm` (timestamp), `dataCorteAtualizadaPor` (varchar 200), garantidos via SyncSchema+. (2) Helper compartilhado `shared/dataCorte.ts` com `ultimaQuintaAte`, `proximaQuinta`, `cutoffEfetivo`, `fmtBR`. (3) Backend `server/routers/planejamento.ts`: novas procedures `getDataCorte` (resolve cutoff oficial — usa o gravado ou cai na última quinta ≤ today) e `fecharSemana` (avança o cutoff e grava auditoria). (4) `portalExterno.planejamentoObra` substituiu `today` cru por `cutoffStr` em TODOS os cálculos (PV, EV, semana atual segunda→domingo, atrasadas, caminho crítico). Payload retorna `dataCorte: {oficial, atualizadoEm, atualizadoPor, proximaAtualizacao, nuncaFechado, hoje}`. (5) Portal do Cliente (`PortalPlanejamentoCliente.tsx`) ganhou banner explícito no card Avanço Físico: "Status oficial — atualizado em DD/MM · Próxima atualização: DD/MM (quinta-feira)" com badge âmbar quando `nuncaFechado=true`. `statusBadge` agora recebe `cutoff` para nunca marcar como "Atrasada" entre fechamentos. (6) ERP interno (`PlanejamentoDetalhe.tsx`) ganhou **toggle Live ↔ Oficial** no header da barra Avanço Físico (default Live para o gestor agir; Oficial = espelho exato do Portal) + botão **"Fechar semana"** que avança o cutoff oficial. `avancoAtual` e `avancoPrevistoDia` consomem `refDateStr` derivado do modo, garantindo paridade pixel-a-pixel com o Portal quando em modo Oficial. Conforme a regra de ouro Portal × Planejamento: a fonte da verdade continua sendo o módulo Planejamento, e o Portal apenas espelha o cutoff oficial.
- **Rev. 1636**: **Férias e Rescisão de Aviso projetadas em rubricas próprias** no Contas a Pagar. (1) `getQuadroCLT` em `payrollProjectionBridge.ts` agora só conta `status='Ativo'` — quem está em Férias ou Aviso saiu da folha mensal regular para evitar dupla contagem. (2) Nova função `getFeriasProjetadas` lê `vacation_periods` (status `agendada`/`em_gozo`/`pendente`) nos próximos 12 meses e gera 1 lançamento por período em **"Férias a Pagar (Projeção)"** com vencimento = `dataPagamento` (ou início − 2 dias corridos) conforme **CLT 145** (FC Engenharia: 8 férias, R$ 25,1k). Valor = `valorTotal` se gravado; senão `(salário × dias/30) × (1 + 1/3)`. (3) Nova função `getRescisoesProjetadas` lê funcionários `status='Aviso'` e gera **"Rescisões a Pagar (Projeção)"** com vencimento = desligamento + 10 dias corridos (**CLT 477 §6º** Lei 13.467/17). Quando `dataDesligamentoEfetiva` está NULL (caso atual dos 3 em Aviso), assume fim do mês corrente + 30d como aviso projetado, com badge "estimada" no memorial. Valor = saldo + férias prop. 6/12 × 4/3 + 13º prop. 6/12 + multa FGTS 40% sobre depósitos estimados. (4) Memoriais dedicados em `getEntryDetalhe`: férias mostram período aquisitivo, gozo, valor por rubrica (férias + 1/3 + abono); rescisões mostram cálculo verba a verba. (5) `PROJ_ORIGENS`, `PROJECAO_ORIGENS` (Contas a Pagar) e `financialOrigins.ts` (label/icon/cor violeta) atualizados. Bug colateral corrigido: parsing de `vacation_periods.valorTotal` (formato US dot, não BR comma). Resultado FC Eng.: 118 lançamentos projetados (107 anteriores + 8 férias + 3 rescisões).
- **Rev. 1635**: Folha CLT projetada agora respeita **Lei 8.213/91 art. 60 §3º** (afastamento >15d → INSS paga), Lei 4.090/62 e Decreto 99.684/90 — só consideram **custo direto da empresa**: `Ativo`, `Ferias` e `Aviso prévio`. Excluídos `Afastado`, `Licenca`, `Recluso`, `Desligado`, `Lista_Negra`, soft-deleted, registros de teste sem matrícula e nomes contendo "TESTE". Resultado FC Engenharia: **101 funcionários** (93 Ativo + 5 Férias + 3 Aviso) no lugar de 105 fantasmas. UI do memorial: coluna "Matr." substituída por "**Código**" (`codigoInterno`/JFC200), cargo movido para baixo do nome, status virou "**Situação**" com 6 badges legais explicativos (ex.: "Férias (custo da empresa)", "Afastado >15d (INSS)", "Recluso (auxílio-reclusão)"). Re-projetados 107 lançamentos × 12 meses.
- **Rev. 1634**: Drill-down completo das **projeções de Folha/Benefícios/13º/PJ** no modal "Detalhe do Título" do Contas a Pagar. Backend (`getEntryDetalhe`) gera memorial: para `folha_projetada`/`encargos_projetado`/`beneficio_vr_projetado`/`beneficio_va_projetado`/`decimo_terceiro_projetado` lista os **105 funcionários CLT ativos** com matrícula, cargo, status, salário bruto e **parcela individual rateada** (∑ parcelas = valor do lançamento). Para `pj_projetado` mostra o contrato vigente + lista de todos os PJs ativos com destaque do prestador atual. Cada memorial vem com **fórmula de cálculo** explicando a regra (ex.: "Folha bruta R$ 300.829,61 × 33,8% = R$ 101.680,41"). UI: modal ampliado para `max-w-7xl w-[98vw]`, abas com labels truncadas (resolveu sobreposição "Origem (Encargos (Projeção))" no iPad), aba "Origem" rebatizada para "Memorial" quando há funcionários/PJs, tabela com `tfoot` totalizador e badge de status colorido por funcionário.
- **Rev. 1633**: **FASE 2 CFO Suite** entregue em `/financeiro/cfo-suite` com 5 abas: (1) **Three-Way Match** PO×Recebimento×NF/AP com tolerância 2%, ações Bloquear/Liberar pagamento e badges OK/Parcial/BLOQ_VALOR/BLOQ_RECEBIMENTO/BLOQ_NF; (2) **Reconciliação OFX/CNAB com IA** — parser OFX SGML/XML + CNAB 240/400, scoring rule-based (Δvalor + Δdata + tipo) + refinamento Claude Sonnet 4 para casos ambíguos, dropdown manual de override; (3) **Dynamic Discounting** — calcula desconto = valor × taxa diária × dias antecipação (WACC alvo configurável, default 18% a.a., janela 7-365 dias); (4) **DRE Dual** — Gerencial (previsto+realizado, IFRS 15 PoC) vs Fiscal (apenas realizado), com diferenças por linha + margens EBITDA; (5) **Alertas Push** — tabela `financial_alerts` (id/tipo/severidade/dados JSONB/lida) com job `generateFinancialAlerts` detectando vencidos, vencendo 3d, 13º (Lei 4.090/62), bloqueio 3WM, dedup de 24h. Endpoints novos em `server/routers/financial.ts` (10 procedures) e service único `server/services/cfoPhase2.ts`.
- **Rev. 1632**: Bugfix crítico no `payrollProjectionBridge.ts` — o `dbExecute` interno substituía os placeholders `$N` pela ORDEM TEXTUAL (não pelo número), invertendo parâmetros em queries com `$2 ... $1` (ex.: `companyId` virava `220`). Resultado: Folha CLT, Encargos, VR, VA e 13º **não eram projetados** (apenas PJ). Agora o regex `/\$(\d+)/g` honra o número do placeholder. Também corrigido o parser SQL de valores BR ("9.999,99") via `brMoneySql()` usando `REGEXP_REPLACE` para remover pontos antes de trocar vírgula por ponto. Descrições limpas: "Folha CLT — 105 funcionário(s) — ref. Mai/2026" no lugar de "PJ (Projeção) 2026-04 — Prestador PJ". Após fix: 107 lançamentos projetados / 12 meses / R$ 5,7 milhões em FC Engenharia.
- **Rev. 1631**: Nova página dedicada **Análise CFO** (`/financeiro/analise-cfo`) com 6 KPIs Hackett/IFRS9/AFP — DPO/DSO/CCC com benchmarks setor, Variance Orçado×Realizado×Forecast, Cash 13 semanas com 3 cenários, PDD IFRS 9 por aging, Pareto 80/20 fornecedores e clientes, KPIs Processo AP. Endpoint único `getAnaliticosCFO`.
- **Rev. 1630**: Projeção de Folha (CLT) + Encargos 33,8% + VR/VA + 13º + PJ para os próximos 12 meses, persistida em `financial_entries` (status `previsto`, origens `*_projetado`). Reflete nos cards Próx 7d/15d/30d/60d/90d e no novo card "Calendário Folha & Benefícios — 12 meses" no Contas a Pagar, com alerta de 13º (Lei 4.090/62). Job idempotente diário via `payrollProjectionBridge.ts`.

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