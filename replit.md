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

- **Rev. 3886** — **TEMPLATES DE EXTRATO — PREVIEW FULLSCREEN + COLAPSO DE GRUPOS + DEDUP FRONTEND + GATE DE TEMPLATE NA CONCILIAÇÃO.** Botão "Visualizar" abre Dialog fullscreen (faixa do banco, seções kw/skip/IA, auditoria, botões admin). Cabeçalho de cada grupo virou botão com ChevronDown/Up para colapsar. Banner amber detecta duplicados no frontend (por nome normalizado) com botão "Remover duplicados". Gate na Conciliação: se empresa tem templates mas PDF não casa com nenhum → fecha import, abre Dialog vermelho com passo-a-passo 4 etapas. Backend: `parseExtratoLines` rastreia `templateDetectado` (null/true/false) + COUNT de templates ativos. ZERO DELETE.

- **Rev. 3885** — **TEMPLATES DE EXTRATO — AUDITORIA (QUEM/QUANDO) + ACESSO RESTRITO A ADMIN.** Novas colunas `atualizado_por_id`/`atualizado_por_nome` via self-heal Rev. 3885. Mutation `update` grava o usuário da sessão. Cards exibem rodapé "Criado por / Editado por · data Brasília". Backend: `assertAdminRole` em `create`, `update`, `delete` e `analisarPdf` (FORBIDDEN para role=user). Frontend: botões de criação/edição/exclusão ocultados para não-admins; banner amber "somente leitura" no lugar. ZERO DELETE.

- **Rev. 3884** — **TEMPLATES DE EXTRATO — REDESIGN: AGRUPADO POR BANCO + CARDS EM GRADE.** Templates agrupados por banco com cabeçalho colorido (bolinha + paleta automática). Cards em grade 2-colunas com faixa de cor no topo, pills de stats (kws/skip/IA), botão "Visualizar" textual e painel expandido com seções coloridas. ZERO DELETE.

- **Rev. 3883** — **TEMPLATES DE EXTRATO — EYE PREVIEW + DEDUP GUARD + PROMPT RIGOROSO.** Eye/EyeOff icon com preview colorido em 3 seções (detecção/skip/IA). Backend: dedup no `create` (nome idêntico + overlap ≥50% de kws → CONFLICT). Batch: captura duplicatas separado de erros, painel 3 contadores. Prompt IA reescrito: mín. 5 kws literais + mín. 6 skip prefixes + 9 tópicos de instrução obrigatórios. ZERO DELETE.

- **Rev. 3882** — **TEMPLATES DE EXTRATO — ANÁLISE EM LOTE (MÚLTIPLOS PDFs).** 1 PDF → fluxo original (formulário para revisão). 2+ PDFs → modo lote: processa sequencialmente, salva automaticamente cada template, barra de progresso "Analisando X de Y", contadores parciais ✓/✗ e painel de resumo pós-conclusão. `<input multiple>` + `handleBatchFiles`. ZERO DELETE.

- **Rev. 3881** — **FIX TEMPLATES DE EXTRATO — companyId undefined.** `ExtratoTemplateTab` desestruturava `companyId` de `useCompany()`, mas o contexto expõe `companyIdNum` (não `companyId`) → `undefined` → erro Zod em todo acesso à aba. 1 linha corrigida em `ExtratoTemplateTab.tsx`. ZERO DELETE.

- **Rev. 3880** — **FIX CONCILIAÇÃO BANCÁRIA — CONTAS NÃO LISTADAS.** `getBankAccounts` explodia com `42703: column "contaBancariaId" does not exist` — subquery em `financial_opening_balances` usava camelCase com aspas, mas a tabela tem colunas snake_case (`conta_bancaria_id`/`company_id`). 1 linha corrigida em `financial.ts`. ZERO DELETE.

- **Rev. 3879** — **GERADOR DE TEMPLATES DE EXTRATO BANCÁRIO POR IA — ZERO CÓDIGO.** Upload de PDF → IA analisa o formato (Gemini Vision → fallback Anthropic) → proposta editável pré-preenchida → salvar. Mutation `analisarPdf` em `bankStatementTemplates.ts` valida PDF, chama IA com prompt de análise de formato, retorna `{ bancoNome, palavrasChave, skipPrefixes, instrucoesIa }`. Colunas `revisao` (ISO 9001, auto-incrementa no UPDATE) e `notas_revisao` adicionadas com self-heal. `ExtratoTemplateTab.tsx` reescrito: botão "Analisar extrato de novo banco", loading animado, formulário pré-preenchido, AlertDialog no delete (sem `window.confirm`). ZERO DELETE.

### 5 one-liners

- **Rev. 3878** — **FIX DROPDOWN DE CATEGORIAS — ALINHAMENTO TOTAL COM O CADASTRO.** Removido filtro por `tipo` em `catOpts` nos dois pontos do formulário de lançamento (Conciliação). ZERO DELETE.

- **Rev. 3877** — **TEMPLATES DE EXTRATO BANCÁRIO + PARSER SANTANDER IBPJ.** Nova tabela `bank_statement_templates` + CRUD tRPC + aba em Configurações. Parser Santander IBPJ. ZERO DELETE.

- **Rev. 3876** — **CHEQUE ESPECIAL — CONTROLE POR CONTA BANCÁRIA + ALERTA NA CONCILIAÇÃO.** Duas colunas novas em `company_bank_accounts`. Self-heal `[SyncSchema+]`. Badge "⚠ Ch. Especial" quando `chequeEspecialAtivo=1 && saldoAtual<0`. ZERO DELETE.

- **Rev. 3875** — **CONCILIAÇÃO — REGRA DE OURO: LIMPAR NÃO DESTRÓI CONCILIADOS SEM CONFIRMAÇÃO.** `limparExtrato`/`limparExtratoMes` retornam `{ ok: false, conciliadosCount }` sem `force=true`; client exige checkbox. ZERO DELETE.

- **Rev. 3874** — **DASH EPIs — CLIQUE NAS BARRAS DO GRÁFICO ABRE DETALHE.** `onChartClick` + state `detalheEpi` em `DashEpis.tsx`. ZERO DELETE.

- **Rev. 3873** — one-liner demovido; ver `replit-history.md`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3872 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
