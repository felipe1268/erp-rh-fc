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

- **Rev. 4119** — **FIX: BADGE DE SITUAÇÃO CNPJ FALSO-POSITIVO EM VERMELHO + `regimeTributario` ARRAY QUEBRANDO O SALVAR.** Comparação estrita de `situacaoCodigo` disparava aviso vermelho mesmo com "ATIVA" — agora usa código OU texto. BrasilAPI retorna `regime_tributario` como array de registros anuais (não string) quando não é Simples/MEI — extrai `forma_de_tributacao` do ano mais recente + sanitização defensiva no submit do form (nunca envia array). ZERO DELETE · ZERO ALTER.

- **Rev. 4118** — **EXECUÇÃO DO BACKFILL EM MASSA + 2 BUGS CRÍTICOS CORRIGIDOS + CLASSIFICAÇÃO DE CATEGORIA PARA TODOS.** Rodado o backfill da Rev. 4117 direto na base real (company 60002) + novo script `classificarCategoriasTodos.ts` classifica por IA a categoria de TODOS os fornecedores sem categoria (com ou sem CNPJ): 581→0. Ficha incompleta: 941→503 (restante majoritariamente CNPJ com dígito verificador inválido). 2 bugs corrigidos em `compras.ts`: BrasilAPI exigia header `User-Agent` (403 sem ele); `telefone` varchar(20) estourava com telefones concatenados da ReceitaWS (novo mapa `MAX_LEN` trunca antes do PATCH). ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4117** — **EMPRESAS TERCEIRAS (FORNECEDORES): FILTROS DE CADASTRO INCOMPLETO + AUTO-COMPLETAR VIA RECEITA FEDERAL/IA.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4116** — **PLANILHA CONTABILIDADE: CNPJ + NOME FORNECEDOR — EXTRAÇÃO DA DESCRIÇÃO DO BANCO (6 CAMADAS).** ZERO DELETE · ZERO ALTER.

- **Rev. 4115** — **CNPJ ÚNICO EM FORNECEDORES: VERIFICAÇÃO EM TEMPO REAL + BLOQUEIO NO SALVAR + FILTRO DE INATIVOS.** ZERO DELETE · ZERO ALTER.

- **Rev. 4114** — **FIX: SALVAR FORNECEDOR — FALHA SILENCIOSA + AUTO-MERGE CNPJ NA EDIÇÃO.** ZERO DELETE · ZERO ALTER.

- **Rev. 4113** — **FIX CODE REVIEW: CHEQUES RECEBIDOS — 3 GAPS (compensado_em + import 2 fases + entry_valor).** ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4112 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
