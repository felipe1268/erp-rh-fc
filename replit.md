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

- **Rev. 4409** — **CONTAS A PAGAR: LAYOUT ESTRUTURADO NAS SUB-LINHAS DO GRUPO PJ EXPANDIDO.** Sub-linhas dentro do grupo consolidado também recebem nome + pills. Dois blocos de renderização substituídos. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4408** — **CONTAS A PAGAR: LAYOUT ESTRUTURADO PARA LINHAS PJ (NOME + TAGS).** Célula PJ: linha 1 = nome negrito; linha 2 = pills [1ª/2ª Medição] [Contrato #X] [PJ-XXXXX] [MM/AAAA]. Demais origens inalteradas. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4407** — **CONTAS A PAGAR: BADGE "1ª/2ª MEDIÇÃO" + REF "PJ-XXXXX" PARA PAGAMENTOS PJ.** getRef() reconhece pagamento_pj → "PJ-892978". Badge inline azul/roxo detectado por regex na descricao. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4406** — **CONTAS A PAGAR: DESCRIÇÃO PJ ENRIQUECIDA COM NOME + Nº CONTRATO + MEDIÇÃO.** Ambas as rotas (aprovarComNF + bulkAprovar) geram "NOME — Contrato #X — 1ª/2ª Medição — MM/AAAA". Backfill dos entries existentes via SyncSchema+. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4405** — **FOLHA PJ: BADGE "APROVADO" + BOTÃO "CANCELAR" COM ESTORNO NO CONTAS A PAGAR.** Quando aprovadoEm != null: badge verde "✓ Aprovado" + botão laranja "Cancelar". Cancelar limpa aprovado_em/aprovado_por_nome/enviado_financeiro + DELETE financial_entries (origem_modulo='pagamento_pj'). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4404** — **FOLHA PJ: BOTÃO "APROVAR SELECIONADOS" COM PROGRESSO 0→100%.** Regra de Ouro: barra bg-blue-400/20 + texto "Aprovando... XX%". setInterval 3%/200ms cap 90% → 100% on success → reset 800ms. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4403** — **FOLHA PJ: CORREÇÃO CRÍTICA — DUPLICATAS (id duplicado em pj_contracts sem PRIMARY KEY).** pj_contracts sem PK → 2 linhas com id=1 → LEFT JOIN fan-out → ANDRE aparecia N×. Fix: DELETE via ctid do registro espúrio + INSERT fechamento Jul/ANDRE faltante + SyncSchema+ ADD CONSTRAINT UNIQUE(id). ZERO DELETE DE DADOS VÁLIDOS.

- **Rev. 4399** — **MÓDULO PJ: BOTÃO ENVIAR → ABRE FCSIGN DIALOG.** Clique no ícone Send da coluna Ações abre FCSignPJSendDialog inline (em vez de navegar para /contrato-pj/:id). Dialog monta HTML do template vigente + cria sessão FCSign + exibe links individuais por signatário. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4398** — **MÓDULO PJ: BOTÃO IMPRIMIR → ENVIAR (FCSIGN).** Ícone Printer → Send; tooltip "Imprimir / Ver contrato" → "Enviar para assinatura (FCSign)". Printer mantido (usado no Exportar PDF). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4397** — **CONTRATO PJ: 3 CORREÇÕES JURÍDICAS NO TEMPLATE (DB DIRETO).** 2.1: restaurado "plena autonomia" + "métodos, horários" + removido "desde que seja seguido os custos do orçamento executivo" (subordinação econômica = CLT). 2.3: removido "validada pela CONTRATANTE" (controle patronal). 3.1: "sendo obrigatória a comunicação prévia" → "independentemente de comunicação prévia" (exclusividade velada). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4396** — **CONTRATO PJ VIEW: CACHE ZERO + REMOÇÃO DE DADOS BANCÁRIOS DUPLICADOS.** `staleTime:0` em `pj.modeloContrato.useQuery` (eliminava divergência template×contrato em abas simultâneas). Seção hardcoded "DADOS BANCÁRIOS" removida do ContratoPJView (já está na Cláusula 9.3 do template). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4395** — **TEMPLATES ISO: EDITOR BLOQUEADO QUANDO VIGENTE.** Editor TipTap vira `readOnly` quando status=vigente; área Salvar/Comentário some; aviso âmbar instrui a clicar "Reabrir" → editar → salvar revisão → aprovar. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4394** — **CONTRATO PJ: REESCRITA JURÍDICA DO TEMPLATE — BLINDAGEM CONTRA CLT DISFARÇADO.** Template reescrito integralmente: (1) removido "exclusivamente" do CONSIDERANDO; (2) "mão de obra" → "serviços técnicos especializados"; (3) nova Cláusula Segunda — Autonomia (sem jornada fixa, sem subordinação, preposto permitido); (4) nova Cláusula Terceira — Não Exclusividade explícita; (5) nova Cláusula Oitava — Ausência de Vínculo (art. 3º CLT + Lei 13.467/2017, 4 requisitos ausentes listados, cláusula reversa pejotização forçada); (6) CONTRATADA responsável por INSS/ISS/IRPJ; (7) valores = natureza comercial, não salarial. 12 cláusulas. Atualização direta no banco. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4393** — **CONTRATO PJ: DADOS BANCÁRIOS DA CONTRATADA NO TEMPLATE.** Seção "6.3 DADOS BANCÁRIOS" inserida no template vigente (DB direto, Rev. 2), com placeholder `[DADOS_BANCARIOS_CONTRATADA]`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4392** — **CONTRATO PJ: REPRESENTANTE LEGAL = SÓCIO ADMINISTRADOR.** Subquery `companyRepresentante` usava `ORDER BY id ASC` (pegava sócio errado). Fix: cruza com `system_criteria.socio_administrador_employee_id`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4391** — **TEMPLATES ISO: CORREÇÃO CRÍTICA — APROVAR (VIGENTE) PERDIA EDIÇÕES.** `handleAprovar` em `TemplatesDocsTab.tsx` chamava só `aprovarMut` quando template já existia — edições eram descartadas silenciosamente. Fix: sempre executa `saveMut` antes de `aprovarMut` via `onSuccess`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4390** — **CONTRATO PJ: FONTE ÚNICA — APENAS TEMPLATE DE CONFIGURAÇÕES.** `plainTextModelToHtmlServer` removida. `modeloContrato` retorna só o vigente de `systemDocumentTemplates` (sem fallback hardcoded). `ContratoPJView` e `ModuloPJ` limpos: sem "Editar Cláusulas", sem fallback plain-text. Única fonte: Configurações → Templates de Documentos → Contrato PJ. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4389** — **MÓDULO PJ: BOTÃO IMPRIMIR CONTRATO → CONTRATOPJVIEW (TEMPLATE ISO).** Botão 🖨️ (verde) na coluna Ações navega para `/contrato-pj/:id`. ContratoPJView usa `pj.modeloContrato` que retorna o template vigente de `systemDocumentTemplates`. Controle de edição permanece em Configurações → Templates de Documentos. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4388** — **MÓDULO PJ: REMOÇÃO DO BOTÃO FCSIGN DA LISTA DE CONTRATOS.** Botão "Enviar para assinatura digital (FCSign)" removido completamente da coluna Ações + import/states/dialog/banner associados. Nova instrução de fluxo de assinatura será fornecida. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4387** — **CONTRATO PJ: AUTO-CURA SERVER-SIDE DO TEMPLATE VAZIO.** Template vigente aprovado com `conteudo_html=""` (race condition anterior à Rev. 4385) → `pj.modeloContrato` detecta vazio, chama `plainTextModelToHtmlServer()` (réplica server da função TipTap), grava no banco e retorna HTML. Próxima chamada já encontra o banco curado. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4386** — **CONTRATO PJ: TEMPLATE ISO INTEGRADO NA VIEW E FCSign.** `pj.modeloContrato` agora consulta `systemDocumentTemplates` vigente primeiro → retorna `{ modelo, modeloHtml }`. `ContratoPJView.tsx` renderiza via `dangerouslySetInnerHTML` com `replacePlaceholders()` aplicado. `FCSignPJSendDialog.tsx` passa `modeloHtml` para `buildContratoPjSignHtml()` (pula `corpoFromTemplate()`). CSS `.pj-iso-template` em `index.css`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4385** — **TEMPLATES ISO: CORREÇÃO CRÍTICA — CONTEÚDO SUMIA AO APROVAR.** Race condition entre dois useEffects: `getQuery.data={conteudoHtml:""}` sobrescrevia o modelo pré-populado. Fix: fundidos em 1 único useEffect (aguarda ambas as queries). `handleSalvar`/`handleAprovar` agora leem `editorRef.current?.getHTML()` em vez de state. Auto-cura templates aprovados vazios por engano. ZERO DELETE · ZERO ALTER destrutivo. `plainTextModelToHtml()` converte o MODELO_CONTRATO_PJ em HTML estruturado (h2/h3 para títulos, indentação para subitens 1.1/a)/(I), itálico para Parágrafo Único, negrito inline para valores/datas/contas bancárias + CONTRATANTE/CONTRATADA). Botão "Aprovar (Vigente)": antes disabled quando não salvo (verde mas inoperante). Agora auto-salva (saveMut) + aprova (aprovarMut) em um único clique; disabled só se editor vazio. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4382** — **TEMPLATES ISO: AUTO-PREENCHIMENTO DE "ELABORADO POR" E DATA DE VIGÊNCIA.** useEffect branch para selRow=null: setElaboradoPorNome(user.name) + setDataVigencia(hoje). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4381** — **TEMPLATES ISO: PRÉ-POPULA EDITOR CONTRATO PJ COM MODELO COMPLETO.** useEffect pré-popula editor com MODELO_CONTRATO_PJ quando sem DB template. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4380** — **CONFIGURAÇÕES: CONSOLIDAÇÃO DE TABS EM TEMPLATES DE DOCUMENTOS.** Templates Planilha/Word/Extrato removidos do grid e integrados como pills em TemplatesDocsTab. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4377** — **MÓDULO PJ: APROVAÇÃO DE MEDIÇÕES COM NF → CONTAS A PAGAR.** Botão "Aprovar" (azul, ShieldCheck) por linha pendente na Folha PJ. Dialog abre com upload drag-and-drop da NF (PDF/JPG/PNG) + toggle "Enviar para Contas a Pagar" (padrão ON). Ao aprovar: salva NF via storagePut, grava aprovado_em/aprovado_por_nome/enviado_financeiro em pj_payments, cria ou atualiza financial_entry com origemModulo='pagamento_pj' + anexo_url. Clipe roxo na tabela indica NF anexada. Schema: 5 colunas novas via SyncSchema+. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4376** — **MÓDULO PJ: AUTO-LINK %, AJUSTE EM LOTE, FOLHA DIVIDIDA.** % Adiantamento auto-calcula % Fechamento (100−valor); campo fechamento read-only. Botão ⚙️ na toolbar abre dialog de ajuste em lote de todos os contratos ativos. Folha PJ dividida em dois cards: "Dia 15" (adiantamentos) + "Final do Mês" (fechamentos). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4370** — **SCORECARD OBRA — FOLHA/CUSTOS: NORMALIZAÇÃO ZERO-PAD NO SERVIDOR.** Complemento da Rev. 4369: iOS Safari não recebe HMR → browser enviava "2026-6". Fix: `_pad()` server-side em `getCustosRH` antes de qualquer SQL. Defesa permanente independente do cliente. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4369** — **SCORECARD OBRA — FOLHA/CUSTOS: CORREÇÃO CRÍTICA DE MÊS SEM ZERO-PAD.** `"2026-6"` vs `"2026-06"`: comparação string falhava silenciosamente → "Sem dados". Fix: `padStart(2,"0")` no frontend. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4364** — **FOLHA DE PAGAMENTO: BOTÃO "LIMPAR MÊS" (ADMIN MASTER).** Nova procedure `folha.limparMes` em transação: apaga payroll_payments/advances/adjustments/rounding_ledger + reset payroll_periods + exclui lançamentos legados PDF. ZERO ALTER destrutivo no schema.

- **Rev. 4363** — **SCORECARD OBRA — FOLHA/CUSTOS: mesesComDados DERIVADO DA QUERY PRINCIPAL.** Remove query SQL paralela (incompleta). mesesComDados calculado em JS sobre `funcs` + filtros férias/afastado por mês. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4375** — **FOLHA PJ: MULTI-SELEÇÃO E CONSOLIDAR PERÍODO COMO PAGO.** Checkboxes + barra de ação em lote. Procedures: bulkDelete, bulkMarcarPago, consolidarPeriodo. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4374** — **MÓDULO PJ — CONTRATOS: PADRÃO 50/50 E INPUT LIBERADO.** 40/60→50/50; fix bug "trava ao apagar". ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4373** — **CONFIGURAÇÕES TERCEIROS: PARÂMETRO "PJ FORMA DE PAGAMENTO".** Parâmetro `terceiros_pj_forma_pagamento` (PIX/TED…). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4372** — **MÓDULO PJ — CONTRATOS PJ: FORMA DE PAGAMENTO.** Campo `formaPagamento` em pj_contracts + pj_payments. SyncSchema+ Rev. 4372. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4371** — **MÓDULO PJ — FOLHA PJ: PERIOD SELECTOR COM DOTS E LEGENDA.** PeriodSelectorCard padrão + dots + statusAnual. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4349** — **SCORECARD OBRA — FOLHA/CUSTOS: CORREÇÃO CRÍTICA DE REGRESSÃO.** `rnd2` antes da declaração `const` → ReferenceError → "Sem dados". Fix: moveu declaração. Seguro de vida proporcional (sMensal × fracao). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4348** — **SCORECARD OBRA — FOLHA/CUSTOS: PROPORCIONAL POR DIAS ÚTEIS (SEG-SEX).** CLT SQL + PJ SQL: `generate_series + DOW`. JS sintético CLT: `countWorkingDays`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4345** — **ALMOXARIFADO: 5 MELHORIAS LISTA LEONARDO/17-07.** Item 2: seleção múltipla locados em lote. Item 5: campo `quantidade` em `equipamentos_locados`. Item 6: botão Renovar Locação. Item 7: badge vencimento colorido. Item 8: `onError` em `proprioCriar`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4344** — **ALMOXARIFADO: CORREÇÃO — PAINEL DE VALOR TOTAL NÃO ATUALIZAVA APÓS OPERAÇÕES.** 4 mutations esqueciam `getDashboard.invalidate()`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4341** — **EQUIPAMENTOS PRÓPRIOS: AGRUPAMENTO POR NOME (accordion inline).** `dataAgrupada`, grupos expandíveis com count badge + chips de localização. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4340** — **EQUIPAMENTOS PRÓPRIOS: FLUXO DE TRANSFERÊNCIA ENTRE OBRAS.** Nova tabela + coluna `transferencia_pendente_id`. 5 procedures tRPC. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4322 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
