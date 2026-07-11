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

- **Rev. 4143** — **NFS-e: UPSERT NO UPLOAD ABRASF — XML CORRIGE NOTA EXISTENTE (SIAP GEO OU OUTRA). BATCH CORRIGE #22–#28.** Importador ABRASF individual substituiu "skip if exists" por UPSERT: se nota já existe (de qualquer origem), atualiza `valor_liquido` + `xml_payload` + retenções com o ValorLiquidoNfse do XML da prefeitura — zero cálculo. Batch SQL corrigiu 7 notas (#22–#28) com valores das DANFSes oficiais. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4142** — **NFS-e: VALOR LÍQUIDO LIDO DIRETAMENTE DO XML — ZERO CÁLCULO NO SERVIDOR.** `parseSiapGeoExportXml` parou de subtrair PIS+COFINS (apuração própria). `fiscalNotes.atualizar` agora reparsa `xml_payload` e usa `ValorLiquidoNfse` da prefeitura — frontend não influencia mais. Upload ABRASF usa `parseSefinNfseXmlFull` (completo) e grava todos os campos de retenção. Batch SQL corrigiu 497 notas SIAP GEO históricas. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4141** — **CONTROLE DE CHEQUES: EDIÇÃO COMPLETA — VALOR, FORNECEDOR, DATAS, BANCO, STATUS.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4139** — **BUILD: SINTAXE JSX INVÁLIDA EM FinanceiroChequesRecebidos.tsx — FRAGMENT WRAPPER.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4138** — **CHEQUES RECEBIDOS: ALOCAÇÃO ATÔMICA NO PAGAMENTO CONSOLIDADO + RASTREIO POR GRUPO + SCHEMA DRIZZLE.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4137** — **CONCILIAÇÃO: ERRO "<!DOCTYPE" AO LANÇAR NO CONTAS A PAGAR — MENSAGEM INTELIGÍVEL + RETRY AUTOMÁTICO.** ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4136** — **CONCILIAÇÃO: CHEQUES EMITIDOS (SANTANDER) NÃO APARECIAM COMO SUGESTÃO EM "SEM LANÇAMENTO".** ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4135 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
