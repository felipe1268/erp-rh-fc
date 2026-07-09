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

- **Rev. 4128** — **DIÁLOGO "ATRIBUIR HABILIDADE" MOSTRA FOTO + OBRA ATUAL DO FUNCIONÁRIO.** `Habilidades.tsx`: busca de funcionário no diálogo "Atribuir: [Habilidade]" ganhou `Avatar` (foto real via `fotoUrl`, fallback com iniciais) + linha secundária com a obra atual (`obraAtualNome`, já enriquecido pelo `employees.list`/`getEmployees` via join com `obra_funcionarios` ativo), ou "Sem obra alocada" quando não há alocação. Zero mudança de backend/schema — só exibição de dados já retornados pela API. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4127** — **CNPJ OBRIGATÓRIO PARA CRIAR NOVO FORNECEDOR/EMPRESA TERCEIRA.** Regra do usuário: só permite CRIAR (não edita) fornecedor/empresa terceira com CNPJ preenchido. `criarFornecedor` (compras.ts) e `empresas.create` (terceiros.ts) tiveram o schema Zod do `cnpj` endurecido pra `.refine()` exigindo 14 dígitos (antes era `.optional()`/`min(1)` fraco) — barreira real no backend, não só no formulário. Fornecedores.tsx ganhou checagem client-side espelhada + label "*" só na criação; EmpresasTerceiras.tsx já validava. Edição de cadastros antigos sem CNPJ continua permitida. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4126** — **PADRONIZAÇÃO DO FILTRO DE MÊS/ANO + BOTÃO "ANO TODO" (EFD CONTRIBUIÇÕES / EFD ICMS-IPI COM DOWNLOAD EM LOTE).** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4125** — **FIX RAIZ: VALOR LÍQUIDO DE NF-e/NFS-e IMPORTADA DIVERGINDO DO DOCUMENTO REAL.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4124** — **PLANILHA DE EXTRATO — RASTREABILIDADE DE NF-e CONCILIADA COM PAGAMENTO (ANÁLISE + HARDENING).** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4123** — **FIX: PLANILHA/PACOTE DE EXTRATO BANCÁRIO — CONTA DESATIVADA/EXCLUÍDA CONTINUAVA APARECENDO.** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4122** — **CATEGORIAS DE FORNECIMENTO: CRIAR NOVA CATEGORIA COM BLOQUEIO DE DUPLICIDADE.** ZERO DELETE · ZERO ALTER.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4121 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
