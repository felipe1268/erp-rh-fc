# ERP RH & DP — FC Engenharia

## Project Overview
A full-stack HR/ERP system built for FC Engenharia. It handles employees, payroll, time tracking, training, safety (SST), legal cases, administrative functions, and budget management.

## Active Modules (8)
1. **RH & DP** — Payroll, time tracking, employees, benefits
2. **SST** — Safety (EPIs, ASOs, CIPA, NRs)
3. **Jurídico** — Labor lawsuits, deadlines, risk analysis
4. **Terceiros** — Third-party companies and contractors
5. **Parceiros** — Benefits partners (pharmacy, gas station, etc.)
6. **Orçamento** — Excel import, 3 budget versions (Venda/Custo/Meta), ABC curve, BDI, EAP tree
7. **Financeiro** (Rev.342) — 17 DB tables, 25+ tRPC endpoints, 12 React pages: DRE, fluxo de caixa, contas, conciliação bancária, obrigações fiscais
8. **Compras** (Rev.343) — 24 DB tables, 30+ tRPC endpoints, 8 novas páginas: SC emergencial, cotações (portal fornecedor), OC com numeração configurável, recebimentos, AP integrada, realocação de verba, comissões, bridge financeiro
9. **BIM 3D** (Rev.777-778) — Visualizador de modelos IFC no Planejamento. Three.js + web-ifc (WASM). Importação multi-disciplina com persistência no servidor. Tabela: `bim_models`. Router: `server/routers/bim.ts`. Frontend: `client/src/pages/planejamento/BimViewer.tsx`. Arquivos salvos em `server/uploads/bim/`. Limite 35MB por arquivo.

## Orçamento Module
- Routes: `/orcamento/painel`, `/orcamento/lista`, `/orcamento/importar`, `/orcamento/:id`
- Backend: `server/routers/orcamento.ts`, `server/routers/orcamentista.ts`
- Schema tables: `orcamentos`, `orcamento_itens`, `orcamento_insumos`, `orcamento_bdi`, `insumos_catalogo`, `composicoes_catalogo`
- Excel import: reads ALL sheets from BDI file; "Orçamento" tab (cols 9–32) + optional "Insumos" tab
- 3 versions: Venda (BDI applied), Custo (direct cost), Meta (cost × (1-metaPerc), default 20%)
- Meta % adjustable by admin_master role, recalculates all items
- BDI: stored with `nomeAba` per sheet, displayed grouped by sheet, 2 decimal places
- EAP: shows Mat/MO separately for leaf items, quantity 2 decimal places
- Catalog: auto-populated on each import; intelligent dedup by code + normalized description
- **ORCAMENTISTA PHD**: AI assistant widget (OrcamentistaWidget.tsx) floating in OrcamentoDetalhe
  - 6 quick insights: Resumo Executivo, Reduzir Custo, Maximizar Margem, Análise BDI, Curva ABC, Riscos
  - Full chat interface with orçamento context (totals, Mat/MO, top items, ABC insumos)
  - Uses invokeLLM (Gemini) via existing infrastructure

## Architecture
- **Frontend**: React 19 + Tailwind CSS 4 + shadcn/ui + Wouter (routing)
- **Backend**: Express 4 + tRPC 11 + Drizzle ORM
- **Database**: PostgreSQL (Neon) — all raw SQL uses PG syntax
- **Auth**: Manus OAuth (JWT) or local username/password
- **Build**: Vite 7 (embedded in Express in dev mode), TypeScript 5
- **Package Manager**: pnpm

## Project Structure
```
client/         # React frontend (root: client/, port 5000 via Express)
server/         # Express backend + tRPC routers
  _core/        # Auth, OAuth, Vite setup, env config
  routers/      # tRPC routers per module
  db.ts         # Database helpers (MySQL via Drizzle)
drizzle/        # Schema and migrations
shared/         # Shared types and constants
```

## Production Deployment — Railway
Files: `railway.toml` + `nixpacks.toml` (Node 20 + pnpm). GitHub repo: `felipe1268/erp-rh-fc`.
Railway env vars required: `NEON_DATABASE_URL`, `DATABASE_URL` (=same), `JWT_SECRET` (random 48-char hex), `NODE_ENV=production`, `SMTP_PASSWORD`, `GOOGLE_API_KEY`.
SyncSchema + SyncRevisions run on every cold start → Neon DB kept up to date automatically.

## Running the App
- Dev: `PORT=5000 NODE_ENV=development pnpm dev` — starts Express + Vite on port 5000
- Build: `pnpm build` — builds frontend to dist/public, bundles server to dist/
- Production: `node dist/index.js`

## Environment Variables
- `NEON_DATABASE_URL` — Neon PostgreSQL connection string (takes priority over DATABASE_URL)
- `DATABASE_URL` — Replit internal PostgreSQL fallback (runtime-managed by Replit)
- `JWT_SECRET` — JWT signing secret
- `PORT` — Server port (default 5000 in dev)
- `VITE_APP_TITLE` — App title shown in UI
- `VITE_APP_LOGO` — Logo path
- `OAUTH_SERVER_URL` — Manus OAuth server URL (optional)
- `VITE_APP_ID` — OAuth App ID (optional)
- `OWNER_OPEN_ID` — Owner user OpenID (optional)

## Golden Rules
- **#0**: Verificar comportamento real no banco ANTES de declarar bug.
- **#1**: Toda mudança = `APP_VERSION_NUMBER` em `shared/version.ts` + entrada em `shared/changelog.ts`.
- **#5**: Novas colunas via ColFix em `server/_core/index.ts` (syncSchema pode falhar antes).
- **#10**: Todo bugfix deve TAMBÉM corrigir dados existentes no banco (ColFix retroativo).
- **#11**: Excluir obra = cascata TOTAL. Nada do projeto deletado pode ser reaproveitado. `deleteObra()` em `server/db.ts` remove TODOS os dados filhos (37 tabelas) antes de soft-delete da obra. ColFix de startup limpa órfãos retroativamente.
- **#12**: O banco é SEMPRE Neon (`NEON_DATABASE_URL`). Nunca usar `DATABASE_URL` local como fallback. Consultas de debug/verificação devem usar `process.env.NEON_DATABASE_URL`.
- **#13**: Orçamentos têm ESTRUTURAS VARIÁVEIS.
- **#14**: PADRÃO ÚNICO DE ACESSO A DADOS. Todo dado deve ter UM caminho para leitura e UM caminho para escrita. (a) Toda mutation (update/delete) DEVE incluir `companyId` no WHERE, nunca filtrar apenas por `id`. (b) Frontend usa `useCompany()` de `@/hooks/useCompany` com `queryInput` padronizado. (c) Queries secundárias (por projetoId, revisaoId etc.) só devem disparar (`enabled`) quando TODOS os IDs pais estiverem resolvidos (>0). (d) Cruzamento orçamento×cronograma: filtrar por revisão ativa + match por nome exato com fallback LIKE para conteúdo parcial. Cada obra pode ter EAP com profundidades diferentes, com ou sem valores acumulados nos pais, nomenclaturas diversas. NUNCA fazer lógica rígida que assume uma única estrutura. Toda solução de cruzamento (orç × cronograma, curva financeira, medições) deve ser adaptativa: detectar automaticamente itens-folha, normalizar valores para totais do orçamento, e funcionar independente de quantos níveis EAP existam. Ao corrigir um orçamento, TESTAR SEMPRE em pelo menos 2 obras com estruturas diferentes (ex: Hotel do Papa e QIU 2).

## Database — CRITICAL: Somente Neon
- **Neon PostgreSQL** (único banco): `ep-young-water-ac67nuby.sa-east-1.aws.neon.tech`, db=`neondb`
  - Conectado via `NEON_DATABASE_URL` — **ESTE É O ÚNICO BANCO DO SISTEMA**
  - Toda query do app usa este banco. NÃO há fallback para `DATABASE_URL` local.
  - **REGRA DE OURO #5**: Ao adicionar novas colunas, SEMPRE adicionar via ColFix em `server/_core/index.ts`
    pois o `syncSchema` pode não rodar antes das queries falharem no startup. Ou adicionar diretamente
    no Neon via `node -e "... process.env.NEON_DATABASE_URL ..."` ANTES de fazer o deploy.
  - **REGRA DE OURO #12**: O banco é SEMPRE Neon. Nunca usar `DATABASE_URL` local do Replit como fallback.
    Consultas de debug/verificação devem usar `process.env.NEON_DATABASE_URL` diretamente.
- Neon usa pooler URL para conexões da app; syncSchema e ColFix também conectam ao Neon via getDb().

## Rev. 416 — Custo de MO nas Atividades (16/03/2026)
- **Novas tabelas**: `cargo_categorias_custo` (cargo→categoria), `folha_mo_transferencias` (histórico), `planejamento_custos_mo` (custo real por atividade/mês)
- **Router**: `server/routers/moAlocacao.ts` — CRUD categorias, `fecharFolhaMes`, `verificarTransferenciaMO`, `executarTransferenciaMO` (3 camadas: direto, indireta_obra, escritorio_central), `desfazerTransferenciaMO`
- **RH**: card "Fechar Folha para Custo de MO" + modal "Config. Cargos" em `FolhaPagamento.tsx`
- **Planejamento**: botão "Importar Custos MO" no cabeçalho de `PlanejamentoDetalhe.tsx` com dialog de pré-condições

## IA Especializada por Módulo (Rev. 771, Vision Rev. 775)
- **Router**: `server/routers/iaModulos.ts` — chat, historico, analytics, getModulos
- **Componente**: `client/src/components/IAModuloChat.tsx` — painel lateral reutilizável
- **Tabela auditoria**: `ia_modulo_conversas` (company_id, user_id, user_name, modulo, pergunta, resposta, projeto_id, criado_em)
- **Módulos**: planejamento, orcamento, compras, rh, financeiro, sst, medicao
- **Integração**: Auto-detecção no `DashboardLayout.tsx` via `IAModuloAutoDetect` (mapeia rota → módulo)
- **Upload de Imagens (Rev. 775)**: Botão ImagePlus + Ctrl+V paste para anexar prints/fotos. Imagens enviadas como base64 via tRPC (max 5MB, max 5 por msg, tipos: png/jpeg/webp/gif). Backend constrói content blocks com image_url para Anthropic Vision. VISION_INSTRUCTION adicionada ao system prompt quando imagens presentes.
- O antigo `AssistenteIAFloat` (botão azul genérico) foi removido na Rev. 772

## Planejamento Module
- Routes: `/planejamento/:id` (tabs: cronograma, curva-s, avanco, refis, compras, ia-gestora, etc.)
- `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` — main file ~7430 lines
- Projects in DB: id=4 (Hotel do Papa), id=6 (Chlorum Palmeira), id=7 (Hotel QIU 2 - 4 Fase), id=8 (active)
- **JULINHO AI**: Google Gemini (gemini-2.5-flash) via GOOGLE_API_KEY, system prompt = persona only, project context in user message
- **Prog. Semanal — Recursos**: `buscarRecursosSemana` endpoint (planejamento.ts:1100) has two-stage matching:
  1. Primary: match by `eapCodigo` (when cronograma and orçamento use the same EAP numbering)
  2. Fallback: match by `atividadeNomes` via ILIKE (when EAP codes differ — e.g. project 8 uses `2.4` vs `01.04`)
  - Returns `matchedByNome: true` flag; frontend shows amber warning badge when fallback used
  - Frontend file: `ProgramacaoSemanal.tsx`, `RecursosDaSemana` component (~line 460)
- **Prog. Semanal — JULINHO errors**: `iaErro` state captures and shows mutation errors (no more silent fail)
- **Curva S**: Shows spinner while loading; server generates curve using equal weights when no peso_financeiro set. gerarCurvaPlanejada uses toMondayStr() to normalize all dates to Monday before generating keys (aligns X-axis); uses Math.ceil for dur; skips invalid dates with isNaN guard. Projects: id=4 (Hotel do Papa), id=6 (Chlorum Palmeira), id=7 (QIU 2 F4 old), id=16 (QIU 2 F4 active, 1900 ativs, rev 25)
- **Avanço Semanal**: Import MS Project (XML/XLSX) → uses `salvarAvancoLote` batch endpoint (NOT 1512 individual requests)
  - `salvarAvancoLote` endpoint: 1 request with all items, processed in chunks of 50 on server
  - `filtroAtivo` states: "semana" (active week), "pendentes" (pending activities), "todas" (all)
- **REFIS tab** — enhanced report:
  - Desvio físico card (+/- pp) alongside SPI
  - "Faturamento do Mês" (renamed from Venda): Previsto, Realizado, Desvio (R$)
  - Curva S Física with trend line (purple dashed)
  - Curva S Financeira (R$) with trend line
  - "Modo Campo" toggle (EyeOff button) — hides all monetary values for field team
  - "Imprimir PDF" button — triggers browser print with `@media print` CSS
  - Histórico REFIS table (BLOCO 7) — shows all previous reports sortable by date
- **IA Gestora tab** — CRONOS AI assistant with 4 sub-tabs

## Integração Mas Controle ERP (Rev. 231)
- **Rota**: `/integracoes/mas-controle` (visível para admin_master)
- **Tabelas DB**: `mas_controle_config` (credenciais + status), `migration_logs` (log detalhado por tipo)
- **Router server**: `server/routers/masControle.ts` → registrado como `masControle:` no appRouter
- **Página**: `client/src/pages/integracoes/MasControle.tsx`
- **Abas**: Configuração (credenciais + teste API) | Importar via API | Importar via CSV | Histórico
- **Importação via API**: Basic Auth → tenta 3 URLs base diferentes do Mas Controle; fallback para CSV
- **Importação via CSV**: Parser robusto (vírgula ou ponto-e-vírgula; campos com aspas); mapeamento flexível de colunas; sempre disponível
- **Idempotente**: nunca duplica dados (verifica por CNPJ para fornecedores, nome para obras e insumos)
- **Logs**: migration_logs registra total encontrado/importado/duplicado/erros por execução

## Módulo de Compras (Rev. 245 — Completo)
- **Rotas**: `/compras/painel`, `/compras/solicitacoes`, `/compras/cotacoes`, `/compras/ordens`, `/compras/fornecedores`, `/compras/almoxarifado`
- **Tabelas DB**: `fornecedores`, `almoxarifado_itens`, `almoxarifado_movimentacoes`, `compras_solicitacoes`, `compras_solicitacoes_itens`, `compras_cotacoes`, `compras_cotacoes_itens`, `compras_ordens`, `compras_ordens_itens`
- **Router server**: `server/routers/compras.ts`
- **Fluxo completo**: SC (Solicitação de Compra) → Cotação → OC (Ordem de Compra) → Almoxarifado
- **obraId obrigatório** em SC, Cotação e OC — propaga automaticamente SC→Cotação e Cotação→OC
- **Integração OC→Almoxarifado** (Rev. 245): ao marcar OC como "entregue", itens entram automaticamente no almoxarifado com movimentação de entrada; SC item recebe quantidadeAtendida; SC marcada "concluída" quando todos os itens atendidos
- **Painel de Compras**: KPIs, alertas de entrega, gastos mensais, SCs e OCs recentes com nome da obra visível
- **Almoxarifado**: Itens com semáforo de estoque; movimentações entrada/saída vinculadas à obra; entradas automáticas via OC entregue
- **Módulo Almoxarifado independente** (Rev. 297): UI mobile-first com 4 botões de ação rápida (ENTRADA/SAÍDA/EMPRESTAR/FECHAR DIA); comodato diário de ferramentas por código JFCxxxx; inventário semanal com barra de progresso e botões BATE/DIFERENTE; páginas Movimentações e Inventário Semanal; 3 novas tabelas DB (warehouse_loans, warehouse_inventory_sessions, warehouse_inventory_session_items); router warehouse.ts; PWA (manifest.json, metas Apple/Android, banner de instalação)
- **Almoxarifado Central + por Obra** (Rev. 298): coluna `obra_id` em `almoxarifado_itens` (NULL=Central, número=Obra); seletor de contexto horizontal com pills (verde=Central, azul=Obra); lista de itens recarregada ao trocar contexto; criação de item vinculada ao contexto; título da página dinâmico; backend filtra por obraId (IS NULL / = X)
- **Inventário Semanal por contexto** (Rev. 299): seletor de contexto (pills) também na página de Inventário; cada contexto (Central ou Obra) tem sessão de inventário independente por semana; itens carregados conforme o contexto; coluna `obra_id` adicionada a `warehouse_inventory_sessions`
- **Cadastro de Unidades de Medida** (Rev. 300): nova tabela `almoxarifado_unidades`; 22 unidades padrão pré-cadastradas; campo de unidade agora é select controlado (não digitação livre); modal "Gerenciar Unidades" com CRUD completo (adicionar com sigla+descrição, excluir com proteção contra uso); endpoints `listarUnidades`, `criarUnidade`, `excluirUnidade` em compras.ts
- **Fornecedores**: Cadastro completo com busca automática CNPJ via BrasilAPI

## User Preferences
- After every completed adjustment, remind the user to click **Publish** to deploy. Deployment config: autoscale, build=`pnpm run build`, run=`node dist/index.js`.

## Critical DB Patterns (PostgreSQL/Neon)
- `db.execute()` returns QueryResult object, NOT array. Use: `((await db.execute(sql`...`)) as any).rows || []`
- All camelCase column names in raw SQL MUST be quoted: `"companyId"`, `"deletedAt"`, `"nomeCompleto"`, etc.
- MySQL → PG conversions: `CURDATE()` → `CURRENT_DATE`; `DATE_FORMAT(c,'%Y-%m')` → `TO_CHAR(c,'YYYY-MM')`; `TIMESTAMPDIFF(YEAR,c,CURRENT_DATE)` → `EXTRACT(YEAR FROM AGE(CURRENT_DATE,"c"))`; `IFNULL(a,b)` → `COALESCE(a,b)`; `GROUP_CONCAT(x)` → `STRING_AGG(x,',')`; boolean: `= 1` → `= true`
- Schema changes via raw SQL only (db:push broken); use `json()` not `jsonb()`
- Login: `felipe@fcengenhariacivil.com.br` / `asdf1020` (role: admin_master, userId: 601043)
- Company IDs: 60002 (FC Engenharia), 60004 (CF Hotelaria), 60005 (Julio Ferraz), 90001 (Locnow)

## Performance Optimizations (March 2026)
- **Gzip compression**: `compression` middleware added as first middleware in Express (`server/_core/index.ts`). Level 6, threshold 1KB. Reduces vendor bundles from ~1.2MB → ~350KB over the wire.
- **Static asset caching**: `/assets/*` served with `Cache-Control: max-age=31536000, immutable` (1 year). `index.html` served with `no-cache` to force re-check.
- **React Query staleTime=30s**: All queries now cached for 30 seconds after fetch. Navigation between pages no longer triggers redundant API calls. `refetchOnWindowFocus: false` prevents refetch on tab switch. Smart retry: no retry on 401/403/404.
- **DB connection pool**: Explicit `max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`.
- **12 new composite DB indexes**: `idx_emp_company_status_deleted` (employees), `idx_emp_company_deleted`, `idx_td_company_mes` (timecard_daily), `idx_td_emp_mes`, `idx_aso_company_emp_deleted`, `idx_of_employee_active`, `idx_emp_nome_search` (GIN trigram), `idx_ppay_company_mes_emp`, `idx_ed_company_emp_deleted`, `idx_vp_company_emp_status`, `idx_pp_company_status` (payroll_periods), `idx_he_company_status` (he_solicitacoes).
- **pg_trgm extension**: Enabled for fast text search on employee names.
- **Vite build**: `sourcemap: false`, target `es2020`, finer manual chunks (added `vendor-utils-sm` for superjson/zod/clsx).
- **Dashboard queries parallelized with Promise.all**: Reduced from 66 sequential `await db.` calls to 8, using 10 `Promise.all()` groups. Each dashboard function now runs all independent queries in parallel: getDashFuncionarios (20→parallel), getDashDocumentos (26→parallel), getDashControleDocumentos (6→parallel), getDashHorasExtras (5→parallel), getDashEpis (5→parallel), getDashPerfilTempoCasa (5→parallel), getDashCompetenciasAnual (4→parallel), getDashFolhaPagamento (2→parallel), getDashCartaoPonto (2→parallel). Expected ~10x reduction in dashboard response time.

## ⚠️ REGRA DE OURO — Criação de Novo Módulo
Todo novo módulo criado OBRIGATORIAMENTE deve ser registrado em **3 lugares**:
1. **`server/routers.ts`** → array `ALL_MODULES` (linha ~2065): adicionar a chave do módulo (ex: `"novo-modulo"`)
2. **`client/src/pages/Configuracoes.tsx`** → objeto `MODULE_INFO` (linha ~2056): adicionar entrada com `label`, `subtitle`, `icon`, `color`, `bgColor`, `borderColor`, `description`
3. **`client/src/contexts/ModuleContext.tsx`** → tipo `ModuleId` + mapeamento de rotas `ROUTE_MODULE_MAP`

Sem isso, o módulo NÃO aparece em Configurações → Módulos do Sistema e NÃO pode ser habilitado/desabilitado pelo admin.

Módulos atualmente registrados (Rev. 394): `rh`, `sst`, `juridico`, `avaliacao`, `terceiros`, `parceiros`, `orcamento`, `planejamento`, `cadastro`, `compras`, `almoxarifado`, `financeiro`

## Notes
- Default password for first login: `asdf1020`
- After every completed adjustment, click **Publish** to deploy (autoscale, build=`pnpm run build`, run=`node dist/index.js`)

---

## 🚨 MEMÓRIA ANTI-REGRESSÃO — Bugs Corrigidos e Padrões Obrigatórios

> Esta seção é OBRIGATÓRIA de ler antes de qualquer mudança nos módulos listados.
> Objetivo: impedir que bugs já corrigidos voltem e manter consistência nas melhorias.

### PROTOCOLO OBRIGATÓRIO ANTES DE QUALQUER MUDANÇA

**Antes de implementar qualquer ajuste, devo:**
1. Verificar se o arquivo/módulo afetado aparece nesta seção de anti-regressão
2. Se aparecer → **PARAR e avisar o usuário** com:
   - O que será alterado
   - Qual bug/melhoria anterior pode ser afetado
   - Qual o risco de regressão
   - Aguardar confirmação explícita antes de prosseguir
3. Se não aparecer → implementar normalmente, mas documentar aqui se criar novo padrão importante

**Arquivos de alto risco (qualquer mudança exige aviso prévio):**
- `server/routers/avisoPrevioFerias.ts` → BUG-001 (férias vencidas na rescisão)
- `server/routers/payrollEngine.ts` → BUG-002 (vale férias, aprovações manuais, consolidar)
- `client/src/pages/FolhaPagamento.tsx` → BUG-002 (botão consolidar bloqueado com alertas)
- `client/src/pages/Ferias.tsx` → BUG-003, BUG-004, BUG-005 (valores manuais, status, editar)
- `server/_core/index.ts` → ColFix (startup crítico — não remover nenhum bloco existente)
- `shared/version.ts` e `shared/changelog.ts` → controle de versão

---

### REGRAS DE OURO ABSOLUTAS (violar = breaking change)

| # | Regra | Detalhe |
|---|-------|---------|
| 0 | **Verificar no banco ANTES de declarar bug** | Sempre consultar dados reais de produção antes de assumir que algo está errado no código |
| 1 | **Versão + Changelog obrigatórios** | Toda mudança exige: (a) incrementar `APP_VERSION_NUMBER` em `shared/version.ts`, (b) adicionar entrada em `shared/changelog.ts` com campo `tipo` (NOT NULL) |
| 2 | **DashboardLayout obrigatório** | Toda nova página DEVE envolver seu conteúdo em `<DashboardLayout>` — sem isso, a sidebar e header não aparecem |
| 3 | **NUNCA usar `npm run db:push`** | É interativo e pode DROPAR colunas silenciosamente. Sempre usar `code_execution` com `executeSql` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| 4 | **Novas colunas via ColFix** | Adicionar colunas em `server/_core/index.ts` via ColFix (padrão já existente), NÃO via syncSchema — o ColFix roda no startup e garante que a coluna existe antes de qualquer query |
| 5 | **SQL camelCase com aspas duplas** | Toda coluna camelCase em SQL raw DEVE ter aspas: `"employeeId"`, `"deletedAt"`, `"periodoConcessivoFim"`. Sem aspas = PostgreSQL converte para minúsculas e falha |
| 6 | **db.execute() retorna objeto, não array** | `db.execute(sql\`...\`)` retorna `QueryResult`. SEMPRE acessar via `((await db.execute(sql\`...\`)) as any).rows \|\| []` |
| 7 | **Não sobrescrever dados manuais** | Antes de recalcular qualquer valor (salário, férias, rescisão), verificar se há valor manual salvo (`> 0`) — se houver, respeitar e não sobrescrever |
| 8 | **Status inativos específicos** | Status que indicam funcionário inativo: `'Desligado'`, `'Afastado'`, `'Recluso'`, `'Lista_Negra'`; em férias: `'Ferias'`; ativo = `'Ativo'`. Não inventar outros |
| 9 | **Company IDs fixos** | FC Engenharia employees: `companyId = 60002`. Obras: `companyId = 1`. CF Hotelaria: `60004`. Julio Ferraz: `60005`. Locnow: `90001` |
| 10 | **CORREÇÃO RETROATIVA OBRIGATÓRIA** | Todo bugfix ou melhoria que altera como dados são calculados ou armazenados DEVE também corrigir os registros já existentes no banco. Nunca corrigir apenas o código (novos lançamentos) e deixar os registros históricos com dados errados. Usar ColFix ou migration SQL no startup para propagar a correção a todos os registros pertinentes. |

---

### BUGS CORRIGIDOS — Não reintroduzir

#### [BUG-001] Rescisão — Férias Vencidas inflacionadas (Rev. 716)
- **Módulo**: Rescisão / `avisoPrevioFerias.ts`
- **Causa**: `calcularRescisaoCompleta` usava `calcularFeriasVencidas(dataAdmissao, dataProjecao)` = fórmula matemática `Math.floor(meses/12)`. Ignorava completamente o que estava no banco (`vacation_periods`), contando como "vencidos" períodos que já foram pagos e marcados como "Concluída".
- **Correção**: Adicionado parâmetro `periodosVencidosOverride?: number`. Antes de cada chamada à função, consultar:
  ```sql
  SELECT COUNT(*)::int AS total FROM vacation_periods
  WHERE "employeeId" = $id
    AND status NOT IN ('concluida', 'cancelada', 'em_gozo')
    AND "periodoConcessivoFim" < $dataFimAviso
    AND "deletedAt" IS NULL
  ```
- **Regra anti-regressão**: NUNCA calcular férias vencidas na rescisão apenas por matemática de anos. SEMPRE consultar o banco.
- **Call sites afetados**: `calcular`, `comparativo`, `create`, `update` (recalcular), `recalcularTodos`, `getById` — todos têm a consulta real.

#### [BUG-002] Vale Férias — Valor R$ 0,00 para funcionários com alerta (Rev. 711-712)
- **Módulo**: Folha de Pagamento / `payrollEngine.ts`
- **Causa**: Funcionários com alerta de férias (período vencido) exibiam `valorFerias = 0` no vale, pois o cálculo proporcional não era aplicado quando havia bloqueio por férias.
- **Correção**: Calcular valor proporcional real mesmo para alertas. Funcionários "aprovados manualmente" (`motivoBloqueio LIKE '%[APROVADO%'`) são capturados no `aprovadosAlertaSet` antes de deletar e recebem `foiAprovadoManualmente = true` → bypass do bloqueio, grava `[APROVADO MANUALMENTE]` em `motivoBloqueio`.
- **Regra anti-regressão**: O botão "Consolidar Vale" deve permanecer DESABILITADO enquanto houver alertas pendentes. Não remover esse bloqueio.

#### [BUG-003] Férias — Valores manuais sobrescritos pelo recálculo automático (Rev. 713)
- **Módulo**: Férias / endpoint `list` em `avisoPrevioFerias.ts`
- **Causa**: O endpoint `list` recalculava o valor das férias com base no salário atual, sobrescrevendo valores que o usuário havia editado manualmente.
- **Correção**: Verificar `temValorManual = r.valorFerias && parseFloat(r.valorFerias) > 0`. Se verdadeiro, retornar `r` sem recalcular.
- **Regra anti-regressão**: O endpoint `list` de férias NUNCA deve recalcular quando `valorFerias > 0` (indica edição manual).

#### [BUG-004] Férias — Status "Vencida" não atualizado automaticamente (Rev. 714)
- **Módulo**: Férias
- **Causa**: Períodos com `periodoConcessivoFim < hoje` e `status = 'pendente'` não tinham seu status atualizado automaticamente para "vencida".
- **Correção**: Três camadas: (1) ColFix no startup faz UPDATE no banco; (2) endpoint `list` retorna status dinâmico baseado na data; (3) filtro 'vencida' inclui períodos vencidos por data mesmo sem a flag atualizada.
- **Regra anti-regressão**: Manter as três camadas. Não remover o ColFix de `vacation_periods` do startup.

#### [BUG-005] Férias — Botão editar desabilitado para status "Agendada" (Rev. 715)
- **Módulo**: Férias / `Ferias.tsx`
- **Causa**: O botão lápis (editar período) só estava habilitado para `pendente`, `vencida`, `em_gozo` — não para `agendada`.
- **Correção**: Adicionar `agendada` à lista de status editáveis.
- **Regra anti-regressão**: Status editáveis de férias = `['pendente', 'vencida', 'em_gozo', 'agendada']`.

---

### PADRÕES DE IMPLEMENTAÇÃO — Manter sempre

#### Módulo Férias
- `vacation_periods` tem colunas mistas: camelCase com aspas duplas (`"employeeId"`, `"periodoConcessivoFim"`, `"deletedAt"`) E snake_case sem aspas (`ajuste_inss`, `valor_liquido`, `bonus_valor`, `bonus_desc`, `pensao_desconto`, `outros_descontos`, `outros_descontos_desc`, `recibo_url`, `recibo_nome`).
- Status válidos: `pendente`, `vencida`, `agendada`, `em_gozo`, `concluida`, `cancelada`.
- Badge de status "vencida" é calculado dinamicamente (não só pelo campo `vencida=1`): comparar `periodoConcessivoFim` com data de hoje.

#### Módulo Rescisão
- Toda previsão de rescisão DEVE incluir contagem real de `vacation_periods` (ver BUG-001).
- `calcularRescisaoCompleta` tem parâmetro `periodosVencidosOverride` — sempre passar resultado da query do banco.
- Aviso prévio integra ao tempo de serviço (Art. 487 §1º CLT): usar `dataFimAviso` (término do aviso) para férias, 13º e FGTS — NÃO `dataDesligamento`.

#### Módulo Folha / Vale
- `aprovadosAlertaSet`: sempre capturar antes de deletar para manter aprovações manuais entre recálculos.
- "Consolidar Vale": só habilitar quando não houver alertas pendentes (`alertasFeriasCount === 0`).
- Valor proporcional de férias no vale: calcular mesmo para funcionários com alerta — exibir valor real, não R$ 0,00.

#### Banco de Dados / SQL
- Sempre usar `::int` ou `::text` nos casts PostgreSQL quando necessário.
- `COUNT(*)::int` para retornar número (não string) do PostgreSQL.
- Raw SQL com template literal: `sql\`SELECT ... WHERE "col" = ${variable}\`` — interpolação segura via Drizzle.
- Para checks de existência: `SELECT EXISTS(SELECT 1 FROM ...)::bool` é mais eficiente que `COUNT(*)`.

#### Módulo SST — Biometria Facial (Rev. 718)
- Biblioteca: `face-api.js` roda 100% no navegador (sem API externa). Modelos em `client/public/models/`.
- Modelos usados: `tinyFaceDetector`, `faceLandmark68TinyNet`, `faceRecognitionNet` (~7MB total, carregados uma vez).
- Tabela: `employee_face_descriptors` (employee_id UNIQUE, descriptor TEXT JSON, foto_capturada_url).
- `epi_deliveries` ganhou: `biometria_facial_url`, `biometria_capturada_em`, `modo_identificacao`.
- Rotas: `/epi-entrega` (entrega), `/biometria-facial` (enrollment admin).
- Router server: `faceRecognition` em `server/routers/faceRecognition.ts`.
- PDF: `client/src/lib/epiReceiptPdf.ts` usa jsPDF. Foto biométrica = prova legal (Lei 14.063/2020).
- FaceCaptureCamera: componente reutilizável para ambos os modos (`enroll` / `recognize`).

#### Versioning
- `shared/version.ts`: `APP_VERSION`, `APP_VERSION_DATE` (DD/MM/YYYY), `APP_VERSION_NUMBER` (número inteiro).
- `shared/changelog.ts`: campo `tipo` é `'feature' | 'bugfix' | 'melhoria' | 'seguranca' | 'performance'`. **Não** usar `'correcao'` ou `'bug'` — esses valores quebram o NOT NULL do enum.
- Rev. atual: **718**. Próxima: **719**.

#### Golden Rule #16 — Curva S SEMPRE inicia em 0%
- Toda curva S (Baseline, Revisão Atual, Realizado, Tendência) DEVE ter o primeiro ponto com acumulado = 0%.
- O backend insere automaticamente `{ semana: semana_anterior_ao_primeiro_dado, acumulado: 0 }` como ponto inicial.
- Isso se aplica a `gerarCurvaPlanejada`, `curvaRealizada`, e `getCurvasTodasRevisoes`.
- A curva financeira (`getCurvaSFinanceira`) já segue esta regra.

#### Golden Rule #15 — Padrão Wrapper key={id} para páginas de detalhe
- Toda página que usa `useRoute(".../:id")` DEVE usar o padrão Wrapper:
  ```tsx
  export default function XWrapper() {
    const [, params] = useRoute("/rota/:id");
    const id = parseInt(params?.id ?? "0");
    return <XInner key={id} routeId={id} />;
  }
  function XInner({ routeId }: { routeId: number }) { ... }
  ```
- O `key={id}` força remontagem completa ao navegar entre IDs (ex: /planejamento/22 → /planejamento/30).
- SEM isso, React reutiliza a instância e useState mantém valores do registro anterior (stale state).
- Páginas já padronizadas (Rev.763): PlanejamentoDetalhe, OrcamentoDetalhe, OrcamentoPrint, OrcamentoDashPage, ContratoDetalhe, ContratoPJView.

#### Design / UI
- **Usuário prefere design limpo, branco e didático** — sem gradientes coloridos, sem cards com cores vibrantes.
- Usar `badge` com cores neutras (cinza, âmbar) para indicadores de status — não vermelho/verde vibrante para informações não-críticas.
- Tabelas com `hover:bg-gray-50`, header `bg-gray-50 text-gray-600 text-xs uppercase`.

---

### CHECKLIST antes de cada deploy

- [ ] `shared/version.ts` atualizado com Rev. N+1
- [ ] `shared/changelog.ts` com entrada da Rev. N+1 (incluindo campo `tipo` válido)
- [ ] Novas colunas adicionadas via ColFix (não via db:push)
- [ ] Valores manuais não são sobrescritos pelos recálculos automáticos
- [ ] `periodosVencidosOverride` passado em TODOS os call sites de `calcularRescisaoCompleta`
- [ ] SQL com colunas camelCase usa aspas duplas
- [ ] `db.execute()` acessado via `.rows || []`
- [ ] Novas páginas envoltas em `<DashboardLayout>`
