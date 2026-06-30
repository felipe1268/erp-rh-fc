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

- **Rev. 3906** — **SST — PT: FIX ASSINATURA + STATUS QUEM ASSINOU + CORES AZUL + LOGO NO PDF.** Bug root cause: `posicao: max(6)` rejeitava envolvidos nas posições 7-30 (zod BAD_REQUEST silencioso) + invalidate com chave errada (`ptId` vs `id`). Fixes: `max(30)`, chave correta. Banner de progresso: "X de N assinaturas coletadas" + barra + lista "Falta assinar". PDF: cores verde → azul FC (#1e3a5f) + logo da empresa no cabeçalho. ZERO DELETE.

- **Rev. 3905** — **SST — PT WIZARD: GATES DE CHECKLIST + ENVOLVIDOS COM TERCEIROS.** Step 2 (Checklist): banner âmbar se perguntas sem resposta + banner vermelho se N > 0; botão "Próximo" disabled até tudo preenchido E sem não-conformidades (alinhado NR-35). Step 3 (Envolvidos): query `obraTerceirosQ` (terceiros.funcionarios.list com obraId) agrega efetivo próprio + terceiros em seções separadas; badge âmbar "Terceiro"; limite 20→30. ZERO DELETE.

### 5 one-liners

- **Rev. 3904** — **SST — PT WIZARD: OBRA PRIMEIRO + TST/ENCARREGADO NO CADASTRO DE OBRAS.** Schema obras: +`tst_id`/`encarregado_id` (ColFix v3904). Novo procedure `ptPermissoes.getObraSST`. Step 0 redesenhado: Obra PRIMEIRO → 3 cards SST auto-fill. ZERO DELETE.

- **Rev. 3903** — **SST — PT WIZARD: FIX OBRAS + LAYOUT MODERNO.** Bug fix: `trpc.getObrasByCompanyActive` (inexistente) → `trpc.obras.listActive`. Redesign: header gradiente emerald, stepper horizontal com pills. ZERO DELETE.

- **Rev. 3902** — **SST — PDF IMPRIMÍVEL PT/APR + FCSIGN PT + ALERTA PT VENCIDAS NO PAINEL.** Três features follow-up. ZERO DELETE.

- **Rev. 3901** — **APR — ANÁLISE PRELIMINAR DE RISCO 100% DIGITAL.** Wizard 3 passos; matriz P×G; canvas pad; rota `/sst/apr`. ZERO DELETE.

- **Rev. 3900** — **PT — PERMISSÃO DE TRABALHO (NR-35) 100% DIGITAL.** Wizard 4 passos; canvas pad; FCSign; rota `/sst/pt`. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3894 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
