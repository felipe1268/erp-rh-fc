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

- **Rev. 4113** — **FIX CODE REVIEW: CHEQUES RECEBIDOS — 3 GAPS (compensado_em + import 2 fases + entry_valor).** `compensado_em TIMESTAMP` via SyncSchema+; mutation `atualizar` seta/limpa ao mudar status; import dividido em Fase 1 (Analisar, dry-run) + Fase 2 (Confirmar — botão verde só após revisar totais); `fe.valor AS entry_valor` no SELECT do listar + exibe no drilldown. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4112** — **AUTO-MERGE DE FORNECEDORES DUPLICADOS NO BOOT (MESMO CNPJ OU MESMO NOME).** Job `[AutoMergeFornecedores]` roda a cada restart (t=10s): detecta grupos por CNPJ idêntico (14 dígitos) ou UPPER(TRIM(razao_social)) idêntico, mantém o com mais OCs, migra 11 FKs em db.transaction, COALESCE-enriquece dados, soft-delete do descartado. Idempotente. 5 pares unificados na 1ª execução. Aba manual de "Duplicidades" removida. ZERO DELETE DE DADOS REAIS · ZERO ALTER.

### 5 one-liners

- **Rev. 4111** — **EMPRESAS TERCEIRAS: ABA "DUPLICIDADES" (VERSÃO INICIAL MANUAL).** Supercedida pela Rev. 4112 (auto-merge). ZERO DELETE · ZERO ALTER.

- **Rev. 4110** — **FIX: EMPRESAS TERCEIRAS — BOTÃO "REATIVAR" AUSENTE + FIX JOIN `et."companyId"` NA PLANILHA CONTABILIDADE.** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4109** — **PLANO DE CONTAS: COLUNA "CÓDIGO CONTABILIDADE" — MAPEAMENTO COM PLANO DO CONTADOR.** ZERO DELETE · ZERO UPDATE nas tabelas existentes.

- **Rev. 4108** — **FIX: CHEQUES RECEBIDOS — DROPDOWN "TODOS OS CLIENTES" LISTAVA SÓ OS COM CHEQUE VINCULADO.** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4107** — **FIX CRÍTICO: EFD CONTRIBUIÇÕES + SPED ECF/ECD — ERRO "Cannot read properties of undefined (reading 'query')" + VALORES ZERADOS.** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4106** — **FIX PARSER SANTANDER PDF: PIX RECEBIDO SUMIDO + LANÇAMENTOS FANTASMA DE SALDO.** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4105** — **FIX CRÍTICO: IMPORTAÇÃO DE EXTRATO — DUPLICATAS LEGÍTIMAS PERDIDAS.** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4104** — **NOVO LANÇAMENTO: CHEQUE EMPRESA × CHEQUE DE TERCEIRO (SELEÇÃO INTERATIVA + COMPLEMENTO).** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4095 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
