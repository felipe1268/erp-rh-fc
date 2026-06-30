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

- **Rev. 3903** — **SST — PT WIZARD: FIX OBRAS + LAYOUT MODERNO.** Bug fix: `trpc.getObrasByCompanyActive` (inexistente) → `trpc.obras.listActive` (obras agora aparecem). Redesign: header gradiente emerald, stepper horizontal com pills + check, conteúdo scrollável + footer fixo, 3 cards seccionados com ícones no passo 0 (Responsáveis/Local/Execução), idem passos 1 e 3. ZERO DELETE.

- **Rev. 3902** — **SST — PDF IMPRIMÍVEL PT/APR + FCSIGN PT + ALERTA PT VENCIDAS NO PAINEL.** Três features follow-up: (1) `gerarHtml` em PT e APR → window.open + print (A4 PT / A4-landscape APR); (2) `enviarFCSign` cria sessão FCSign (3 signatários: empregador/contratante/contratado) + vincula `fc_sign_session_id`; (3) query `alertas` + card "Permissões de Trabalho" no Painel SST com badge de vencidas e atualização 60s. ZERO DELETE.

### 5 one-liners

- **Rev. 3901** — **APR — ANÁLISE PRELIMINAR DE RISCO 100% DIGITAL.** Wizard 3 passos; matriz P×G; canvas pad; rota `/sst/apr`. ZERO DELETE.

- **Rev. 3900** — **PT — PERMISSÃO DE TRABALHO (NR-35) 100% DIGITAL.** Wizard 4 passos; canvas pad; FCSign; rota `/sst/pt`. ZERO DELETE.

- **Rev. 3899** — **NF-e EMITIDAS — STATUS SEGUE SEFAZ + CONSOLIDAR MÊS.** ZERO DELETE.

- **Rev. 3898** — **CONTRATOS PJ — EDIÇÃO DE CLÁUSULAS POR CONTRATO.** ZERO DELETE.

- **Rev. 3897** — **ORÇAMENTO — FIX IMPORTAÇÃO: SPLIT MAT/MO CORRETO EM LINHAS DE AGRUPAMENTO.** ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3894 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
