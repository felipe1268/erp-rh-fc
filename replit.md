# ERP RH & DP — FC Engenharia

## Project Overview
A full-stack HR/ERP system built for FC Engenharia. It handles employees, payroll, time tracking, training, safety (SST), legal cases, administrative functions, and budget management.

## Active Modules (8)
1. **RH & DP** — Payroll, time tracking, employees, benefits
2. **SST** — Safety (EPIs, ASOs, CIPA, NRs)
3. **Jurídico** — Labor lawsuits, deadlines, risk analysis
4. **Terceiros** — Third-party companies, contractors, medição with inline-edit %, reject flow, comparativo (físico×medido×pago), item history, divergence alerts, partial medição, retenções/descontos (ISS/INSS/IRRF/outras/descontos), PDF boletim de medição (PDFKit), qty/unit/value columns, hierarchical EAP matching with normName()
5. **Parceiros** — Benefits partners (pharmacy, gas station, etc.)
6. **Orçamento** — Excel import, 3 budget versions (Venda/Custo/Meta), ABC curve, BDI, EAP tree, 3 cost categories (MAT/MDO/EQUIP). Equipment (EQUIP) = insumos with código 80.xx (SINAPI/DER pattern) auto-classified on import. Columns: `alocacao_equip` in `composicao_insumos`, `custo_unit_equip`/`meta_unit_equip`/`custo_total_equip`/`meta_total_equip` in `orcamento_itens`
7. **Financeiro** (Rev.342) — 17 DB tables, 25+ tRPC endpoints, 12 React pages: DRE, fluxo de caixa, contas, conciliação bancária, obrigações fiscais
8. **Compras** (Rev.849, FK fix Rev.1007) — 25 DB tables, 40+ tRPC endpoints, 8+ páginas: SC emergencial, cotações (portal fornecedor), OC com numeração configurável, recebimentos, AP integrada, realocação de verba, comissões, bridge financeiro. **FK Constraint Fix (Rev.1007)**: editarSolicitação agora NULLa FKs em `compras_cotacoes_itens` e `compras_ordens_itens` antes de deletar itens da SC, evitando erro de FK constraint. **Compras Inteligentes** (Rev.822): SC via EAP com explosão de insumos (2 modos: Via EAP Inteligente / Manual), saldo orçamentário em tempo real, consolidação automática de insumos, Meta×Real no mapa de cotação, histórico de preços por insumo, rastreabilidade SC→Cotação→OC, entregas programadas na OC, imagem de referência na SC (Rev.820), cobertura orçamentária no mapa de cotação (Rev.821), condição de pagamento estruturada com parcelas automáticas (Rev.822). **Meta MAT/MDO Separada** (Rev.888): Import de orçamento calcula metaUnitMat/metaUnitMdo separadamente. Mapa de cotação usa metaUnitMdo para cotações MDO/serviço. updateMeta recalcula todos os campos MAT/MDO. **Separação Profissional/Ajudante** (Rev.889): SC de serviço permite escolher se contratação inclui ajudante/auxiliar. Select global "Considerar MDO" (Equipe completa / Só profissional) com override por item. Decomposição visual do custo MDO (Prof R$X + Ajud R$Y). Meta ajustada na cotação. Classificação automática: nome contém "ajudante/servente/auxiliar" = ajudante. Campos: `incluir_ajudante`, `meta_mdo_profissional`, `meta_mdo_ajudante` em `compras_solicitacoes_itens`. **Agrupar Itens Iguais** (Rev.889): Toggle no mapa de cotação para consolidar itens com mesma descrição+unidade, somando quantidades. **Meta Fix** (Rev.890): `updateMeta` com `totalMetaExato` agora só atualiza totais do orçamento — não recalcula meta por item, preservando desconto da importação. Cálculo "Só prof." no mapa usa proporção sobre `meta_unit_mdo` (não recalcula do custo). Filtro "Com orçamento" no Dashboard Obras. **Cotação Tipo Fix** (Rev.891): Cotação herda tipo da SC ao ser criada; `getMapaCotacao` verifica SC tipo como fallback para cotações legadas com tipo=material incorreto; usa `meta_unit_mdo` para cotações de serviço. **SC Serviço/MDO — Contratação por Composição** (Rev.886): SC tipo servico contrata na unidade da composição (m², m³, kg) — sem explosão em insumos individuais de MDO. EAP tree mostra cards orçado/contratado/saldo por composição. `getEapParaObra` retorna `custoUnitMdo`, `mdoContratado`, `mdoSaldo`. Checkbox seleciona composição inteira. Aba "Por Insumo" ocultada quando tipo=servico. Sem-verba flow idêntico ao material (realocação → risco → admin). Preços ausentes na SC — apenas na cotação/OC.
**Controle de Saldo por Insumo** (Rev.849): saldo global consolidado por insumo (soma de TODAS as composições da obra), badges BLOQUEADO/LIMITADO/EXTRA-ORÇAMENTO, botão desbloquear extra-orçamento, validação handleSalvar por insumoCodigo, links clicáveis SC/COT/OC nos status de insumos (Rev.848). **PDF da OC**: geração de PDF profissional via PDFKit com layout de cabeçalho, dados da empresa/fornecedor, tabela de itens, totalizadores, observações e espaço para assinaturas. Endpoint Express `GET /api/download/oc/:id` com autenticação e autorização por empresa. Botões "Exportar PDF" e "Imprimir" na tela de detalhes da OC (`Ordens.tsx`). Arquivos: `server/services/purchaseOrderPdf.ts`, `server/routers/downloadOC.ts`. **Condição de Pagamento Estruturada** (Rev.822): Seletor padronizado (À Vista, DDL, 30/60, 30/60/90, Entrada+parcelas, Medição). Shared utility `shared/paymentConditions.ts` com `calcularParcelas()`. Bridge financeiro cria N financial_entries + N purchase_accounts_payable por OC. Colunas `tipo_pagamento` em `compras_cotacao_fornecedores`, `compras_ordens`, `purchase_orders`. Portal do fornecedor usa seletor estruturado. **Controle de Frete** (Rev.822): freteTipo (CIF/FOB), valorFrete, transportadora per supplier in quotation map; OC stores transportadora + codigoRastreamento + portalToken; FOB freight adds to cost totals, CIF is informational; supplier portal post-OC tracking update via token (`/portal/oc-entrega/:token`); financial bridge includes FOB freight in cost description; OC detail shows freight info with editable tracking fields; receiving screen shows delivery mode. New schema fields on `comprasSolicitacoesItens` (insumoCodigo, composicaoCodigo, precoMeta, quantidadeServico, coeficiente, origemEap). New table: `compras_entregas_programadas`. **Alertas Automáticos** (Rev.823): Endpoint `getAlertasCompras` com alertas de pagamentos vencidos/próximos (7 dias), entregas atrasadas, SCs sem cobertura orçamentária, divergências de recebimento (integração almoxarifado_notificacoes). **Dashboard por Obra** (Rev.823): Endpoin... **Alertas Automáticos Financeiro + Almoxarifado**: Na emissão de OC, alerta financeiro (notification_logs + email) com parcelas/vencimentos e alerta almoxarifado (almoxarifado_notificacoes + email) com itens/contato fornecedor. Entregas programadas geram alertas individuais. Job diário verifica entregas nos próximos 3 dias e cotações prestes a expirar. Painel de alertas no almoxarifado (slide-over com filtro pendentes/todos, marcar como recebido).
**Faturamento Direto (FD)** (Rev.884, Rev.896): FD Cliente — OC de material marcada como FD, valida saldo contra BDI FD (`bdi_fd` table), hard block se excede teto. FD Terceiro — limite definido no contrato PJ (`limite_fd` / `fd_consumido` em `pj_contracts`), rastreia OCs comprometidas, bloqueia se excede. **FD na Cotação** (Rev.896): FD pode ser definido na cotação antes de aprovar (material ou serviço). Usuário escolhe "FD Cliente" (saldo de FD orçado) ou "FD FC" (a FC paga diretamente). Ao aprovar e gerar OC ou Contrato de Serviço, FD é propagado automaticamente. Validação de saldo conta apenas cotações pendentes + OCs existentes (evita double-count). Colunas: `modalidade_fd`, `fd_valor`, `fd_pagador`, `fd_bdi_item_id` em `compras_cotacoes`. Card FD no mapa de cotação com definir/remover. Badge FD na listagem e painel lateral. Ajuste FD: somente Admin Master com justificativa+auditoria (`fd_ajustes` table) + company-scope auth. Medição PJ auto-deduz FD Terceiro pendente (`fd_desconto` / `fd_detalhe` em `pj_medicoes`). **PDF Aprovação FD**: `server/services/fdApprovalPdf.ts` + rota `/api/download/fd/:id` — PDF profissional com dados da obra, materiais, saldo FD e bloco de assinatura do cliente. **Auto-criação FD na medição cliente**: ao aprovar OC como FD Cliente, auto-insere `medicaoFdRegistros` (idempotente por `compraId`). **Adicionar/Remover itens FD**: `compras.adicionarItemFd` e `compras.removerItemFd` com Admin Master auth + company-scope + auditoria. **Detalhe expandível FD**: boletim de medição com row expandível mostrando breakdown de registros FD (`boletimDescontoId`). Painel FD: `client/src/pages/compras/PainelFd.tsx`, rota `/compras/painel-fd`, com tabela de OCs vinculadas e botão PDF. Endpoints: `compras.getSaldoFd`, `compras.marcarOcComoFd`, `compras.aprovarFdCliente`, `compras.ajustarFd`, `compras.getHistoricoFdAjustes`, `compras.adicionarItemFd`, `compras.removerItemFd`, `compras.marcarCotacaoFd`, `compras.removerCotacaoFd`, `pjContracts.definirLimiteFd`, `pjContracts.getSaldoFdTerceiro`, `pjContracts.marcarOcFdTerceiro`.
9. **Operacional** (Rev.1005) — Módulo de controle operacional de obra. 6 submódulos: RDO (Relatório Diário de Obra com clima, mão de obra, atividades, equipamentos, materiais, auto-preenchimento), Checklists (templates com itens configuráveis, preenchimento Conforme/NC/NA), Concretagem (mapa de elementos, lançamentos com controle de tempo usina→obra, CPs com datas de ruptura 7/14/28d), Não Conformidades (abertura, tratativa, fechamento com plano de ação, gravidade, disciplina), Registro Fotográfico (galeria com filtros disciplina/data, upload com legenda), Dashboard (KPIs consolidados, status RDO do dia). Tabelas: `rdo_relatorios`, `rdo_mao_obra`, `rdo_equipamentos`, `rdo_atividades`, `rdo_materiais`, `rdo_fotos`, `checklists_templates`, `checklists_template_itens`, `checklists_preenchidos`, `checklists_respostas`, `concretagem_mapa`, `concretagem_lancamentos`, `concretagem_cps`, `nao_conformidades`, `registro_fotografico`. Router: `server/routers/operacional.ts`. Frontend: `client/src/pages/operacional/`. Rotas: `/operacional/painel`, `/operacional/rdo`, `/operacional/checklists`, `/operacional/concretagem`, `/operacional/nc`, `/operacional/fotos`. Tema: amber. Ícone: HardHat.
10. **Databook de Obra** (Rev.1003) — Documentação técnica de produtos para entrega final ao cliente. Tabelas: `databook_fichas`, `databook_terceiro_entregas` + campos `databook_obrigatorio`/`databook_status` em `terceiro_contratos`. Router: `server/routers/databook.ts`. PDF: `server/services/databookPdf.ts`. Frontend: `client/src/pages/compras/Databook.tsx`. Rota: `/compras/databook`. Funcionalidades: importação automática de itens de OCs com deduplicação (hash MD5), 13 disciplinas, classificação e geração de especificações técnicas via IA (Claude/invokeLLM), busca de fotos via Gemini (GOOGLE_API_KEY), fluxo de status (pendente_ia→gerado→revisado→enviado→aprovado/reprovado) com validação de transição, entregas de terceiros com validação IA, aprovação idempotente, geração de PDF individual por ficha e índice geral, comparação com EAP do orçamento, dashboard com progresso por disciplina, ações em lote, exportação Excel.
10. **IntegraSign** (Rev.940) — Módulo interno de assinatura eletrônica de contratos de serviço (estilo DocuSign). Fluxo sequencial: Fornecedor(1)→Gestor(2)→Financeiro(3)→Diretor(4) + testemunhas opcionais. Tabelas: `integrasign_envelopes`, `integrasign_signatarios`, `integrasign_audit_log`. Router: `server/routers/integrasign.ts`. Email: `server/services/integrasignEmail.ts`. Frontend: `IntegraSignDashboard.tsx` (painel interno) + `IntegraSignAssinar.tsx` (página pública token-based). Auto-trigger: OC de serviço aprovada → gera contrato PJ + envelope IntegraSign automaticamente. Assinatura com canvas (rubrica+assinatura), hash SHA-256, geolocalização, IP, user-agent. Dashboard com progresso, recusa com justificativa, versionamento, reenvio de lembretes. Rota: `/integrasign` (interno), `/integrasign/assinar/:token` (público). Menu: Terceiros > Contratos e Medições.
10. **Portal do Prestador de Serviço** — Portal externo (acesso via token) para gestão de contratos de mão de obra/serviços. Tabelas: `service_contract_tokens`, `service_contract_measurements`, `service_contract_documents`, `service_contract_action_logs`. Campos adicionais em `supplier_contracts`: `tipo`, `escopo`, `obra_id`, `obra_nome`, `valor_total`, `condicao_pagamento`, `contrato_confirmado`, `confirmado_em`. Router: `server/routers/portalServico.ts` (publicProcedure para portal, protectedProcedure para gestão interna). Frontend: `client/src/pages/PortalServico.tsx` (portal externo), `client/src/pages/compras/MedicoesServico.tsx` (aprovação interna). Rotas: `/portal/servico/:token` (portal), `/compras/medicoes-servico` (interno). Funcionalidades: visualização de contrato, confirmação de recebimento, medições mensais (% concluído + valor), upload de documentação (ART, seguros, certidões), histórico de contratos, log de ações para rastreabilidade.
10. **BIM 3D/4D** (Rev.777-779) — Visualizador de modelos IFC no Planejamento. Three.js + web-ifc (WASM). Importação multi-disciplina com persistência no servidor. Seleção interativa de elementos 3D (raycasting + multi-select) para vincular a atividades do cronograma (BIM 4D). Tabelas: `bim_models`, `bim_links`. Router: `server/routers/bim.ts`. Frontend: `client/src/pages/planejamento/BimViewer.tsx`. Arquivos salvos em `server/uploads/bim/`. Limite 35MB por arquivo.

## Telemetria & Analytics Module (Rev. 799)
- Route: `/admin/telemetria` (admin_master only, MasterOnlyGuard)
- Backend: `server/routers/telemetria.ts` (7 tRPC endpoints)
- Schema table: `user_activity_log` (company_id, user_id, user_name, tipo, pagina, acao, modulo, detalhes, duracao_segundos, criado_em)
- Tracker: `client/src/components/ActivityTracker.tsx` — invisible component in DashboardLayout that logs page visits, time spent, and supports action tracking via `trackAction()` export
- Frontend: `client/src/pages/Telemetria.tsx` — full analytics dashboard with 2 tabs:
  - **Uso da Plataforma**: KPIs (acessos, usuários ativos, tempo médio, inativos), daily/hourly charts, page ranking, module usage, engagement score (0-100), user ranking with drill-down profile, dead features alert, inactive users alert
  - **Analytics da IA**: total conversations, per-module breakdown, user ranking, full history with search/expand
- Endpoints: trackPageVisit, trackPageLeave, trackAction, dashboardGeral, perfilUsuario, analyticsIA, historicoCompleto, scoreEngajamento
- Menu: sidebar "Administração" section, visible only to admin_master (adminMasterOnly flag)

## Dashboard Executivo de Obras (Rev. 794)
- Backend: `planejamento.dashboardGeral` endpoint in `server/routers/planejamento.ts`
- Frontend: `client/src/pages/planejamento/DashboardObras.tsx`
- Toggle Dashboard ↔ Projetos na barra de ações do PlanejamentoLista
- KPIs: total projetos, em andamento, concluídos, atrasados, valor total, atividades
- Indicadores: avanço médio previsto vs realizado (barra dupla), SPI/CPI médios com semáforo, custo meta, margem bruta
- Ranking por obra: avanço, SPI, CPI, dias restantes, valor, cards expansíveis com detalhes
- Matriz de Saúde: verde/amarelo/vermelho baseado em SPI/CPI
- Filtro por obra individual, ordenação por avanço/SPI/valor/prazo/nome
- Controle de acesso por obra para usuários não-admin (mesma lógica de `listarProjetos`)

## Proj./Doc. Técnicos Module (Rev. 791-801)
- Route: `/gestao-documentos` (hierarchical navigation: Ficheiros → Disciplinas → Pastas → Documentos)
- Backend: `server/routers/gestaodocumentos.ts` (35+ tRPC endpoints)
- Schema tables: `gd_ficheiros_obra`, `gd_disciplinas` (+ ficheiro_id), `gd_pastas`, `gd_documentos` (+ ficheiro_id, pasta_id), `gd_tipos_documento`, `gd_revisoes`, `gd_revisao_comentarios`, `gd_distribuicao`, `gd_download_log`, `gd_arts`, `gd_tipos_subpasta`
- New endpoints (Rev.795): listObrasDisponiveis, listFicheiros, createFicheiro, deleteFicheiro, getFicheiroDetail, createDisciplinaFicheiro (auto-creates DWG/PDF/IFC/DOC pastas), deleteDisciplinaFicheiro, listPastas
- Flow (Rev.801): Create ficheiro first (one-click, no wizard), then add disciplinas with subpastas inside the ficheiro. No pre-configuration required. Modal with quick-add shortcuts for standard disciplinas (ARQ, EST, ELE, HID...) and custom form. Duplicate sigla check. Discipline list with delete option inside modal.
- Features: Ficheiro de Obra (linked to obras em andamento), Disciplines with color-coded sigla, auto-created folder structure (DWG/PDF/IFC/DOC), Document CRUD per pasta, revision control (create/approve/reject), ART/RRT management with expiry alerts (30 days)
- ConfigSection (Rev.800): Editable tables for Disciplinas, Tipos de Documento, Sub-pastas with inline edit/delete/create
- All endpoints enforce companyId ownership validation (tenant isolation)
- Tab deep-linking via `?tab=` query param
- Module ID: `gestao-documentos` (registered in shared/modules.ts, ModuleContext, DashboardLayout)

## Medição Module (Rev. 789-790)
- Routes: `/medicao/:contratoId`
- Backend: `server/routers/medicao.ts`
- Schema tables: `medicao_contratos`, `medicao_boletins`, `medicao_boletim_itens`, `medicao_fd_registros`
- 3 tabs: Planilha de Medição (global EAP view), Boletins de Medição, Faturamento Direto (FD)
- Auto-populate boletim items from physical progress (`planejamento_avancos`)
- EAP normalization: `01.01` → `1.1` to bridge orçamento vs cronograma formats
- Status-filtered accumulation: only `enviado/aprovado/finalizado` boletins count in medido totals
- companyId enforcement on all procedures

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
- **#14**: PADRÃO ÚNICO DE ACESSO A DADOS. Todo dado deve ter UM caminho para leitura e UM caminho para escrita. (a) Toda mutation (update/delete) DEVE incluir `companyId` no WHERE, nunca filtrar apenas por `id`. (b) Frontend usa `useCompany()` de `@/hooks/useCompany` com `queryInput` padronizado. (c) Queries secundárias (por projetoId, revisaoId etc.) só devem disparar (`enabled`) quando TODOS os IDs pais estiverem resolvidos (>0). (d) Cruzamento orçamento×cronograma: filtrar por revisão ativa + match por nome exato com fallback LIKE para conteúdo parcial. Cada obra pode ter EAP com profundidades differentes, com ou sem valores acumulados nos pais, nomenclaturas diversas. NUNCA fazer lógica rígida que assume uma única estrutura. Toda solução de cruzamento (orç × cronograma, curva financeira, medições) deve ser adaptativa: detectar automaticamente itens-folha, normalizar valores para totais do orçamento, e funcionar independente de quantos níveis EAP existam. Ao corrigir um orçamento, TESTAR SEMPRE em pelo menos 2 obras com estruturas diferentes (ex: Hotel do Papa e QIU 2).
- **#17**: Todo novo módulo DEVE ser adicionado ao array `ALL_MODULE_DEFS` em `client/src/components/DashboardLayout.tsx` (~ linha 1132). Esse array alimenta o dropdown de mudança rápida de módulo no sidebar. Sem essa entrada, o módulo não aparece no seletor. Checklist: (1) `ALL_MODULE_DEFS` com id, label, icon, color, bg, path, canSee; (2) `ModuleId` type em `client/src/contexts/ModuleContext.tsx`; (3) `MODULE_LABELS` no mesmo arquivo; (4) `ROUTE_MODULE_MAP` com todas as rotas do módulo; (5) Sidebar menu sections (`menuSections*`) no DashboardLayout.

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
- **Upload de Imagens (Rev. 775)**: Botão ImagePlus + Ctrl+V paste para anexar prints/fotos. Imagens enviadas como base64 via tRPC (max 5MB, max 5 por msg, tipos: png/jpeg/webp/gif). Backend constrói content blocks with image_url para Anthropic Vision. VISION_INSTRUCTION adicionada ao system prompt quando imagens presentes.
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
- **Cadastro de Unidades de Medida** (Rev. 300): nova tabela `almoxarifado_unidades`; 22 unidades padrão pré-cadastradas; campo de unidade agora é select controlado (não digitação livre); modal "Gerenciar Unidades" com CRUD completo (adicionar com sigla+descrição, excluir com proteção contra uso); endpoints `listarUnidades`, `criarUnidade`, `excluirUnidade` in compras.ts
- **Fornecedores**: Cadastro completo com busca automática CNPJ via BrasilAPI

## User Preferences
- After every completed adjustment, remind the user to click **Publish** to deploy. Deployment config: autoscale, build=`pnpm run build`, run=`node dist/index.js`.

## Golden Rule: New Module Checklist
When creating a new module, ALWAYS register it in ALL 3 places:
1. **`server/routers.ts`** → `ALL_MODULES` array in `moduleConfig.list` (~line 2411)
2. **`client/src/pages/Configuracoes.tsx`** → `MODULE_INFO` object (label, subtitle, icon, colors, description) AND `MODULE_PAGES` object (sub-features with section/label/path)
3. **`client/src/pages/ModuleHub.tsx`** → `MODULES` array (icon, label, path, theme colors)

## Critical DB Patterns (PostgreSQL/Neon)
- `db.execute()` returns QueryResult object, NOT array. Use: `((await db.execute(sql`...`)) as any).rows || []`
- All camelCase column names in raw SQL MUST be quoted: `"companyId"`, `"deletedAt"`, `"nomeCompleto"`, etc.
- MySQL → PG conversions: `CURDATE()` → `CURRENT_DATE`; `DATE_FORMAT(c,'%Y-%m')` → `TO_CHAR(c,'YYYY-MM')`; `TIMESTAMPDIFF(YEAR,c,CURRENT_DATE)` → `EXTRACT(YEAR FROM AGE(CURRENT_DATE,"c"))`; `IFNULL(a,b)` → `COALESCE(a,b)`; `GROUP_CONCAT(x)` → `STRING_AGG(x,',')`; boolean: `= 1` → `= true`
- Schema changes via raw SQL only (db:push broken); use `json()` not `jsonb()`
- Login: `felipe@fcengenhariacivil.com.br` / `asdf1020` (role: admin_master, userId: 601043)
- Company IDs: 60002 (FC Engenharia), 60004 (CF Hotelaria), 60005 (Julio Ferraz), 90001 (Locnow)
