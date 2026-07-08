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

- **Rev. 4102** — **NOVO LANÇAMENTO: SUGESTÃO DE CHEQUES RECEBIDOS AO PAGAR COM CHEQUE.** Quando forma=Cheque numa despesa, painel verde mostra cheques de terceiros disponíveis em carteira e sugere combinações de 1/2/3 cheques mais próximas do valor (com hint "sobram R$X → pague em Pix" / "faltam R$X"). ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4101** — **CHEQUES RECEBIDOS: FIX IMPORT — IGNORA LINHA DE TOTAL DA PLANILHA.** Parser XLSX importava rodapé "TOTAL" como cheque real (nº="TOTAL", valor=soma de todos). Fix: regex pula a linha antes de criar registro. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

### 5 one-liners

- **Rev. 4098** — **CHEQUES RECEBIDOS: VÍNCULO COM CLIENTE (FILTRO + ATRIBUIÇÃO EM LOTE + CAMPO NO IMPORT).** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4097** — **CHEQUES RECEBIDOS: REDESIGN COMPLETO DA PÁGINA (LAYOUT PADRÃO EMITIDOS + IMPORT MULTI-XLSX + BARRA DE PROGRESSO).** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4096** — **CONTROLE DE CHEQUES RECEBIDOS: NOVO SUB-MÓDULO COMPLETO (CADASTRO + IMPORT XLSX + SUGESTÃO NO PAGAMENTO).** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4095** — **NFS-e: FÓRMULA DO VALOR LÍQUIDO CORRIGIDA (ISS RETIDO ENTRA NO CÁLCULO) + CAMPO VOLTA A SER READ-ONLY.** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4094** — **CORREÇÕES DE PRODUÇÃO: 3 BUGS (SQL $N, ferias.list coerce, getAlertasCompras try/catch).** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4088 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
