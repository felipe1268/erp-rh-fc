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

- **Rev. 3977** — **BANCO DE HORAS: MULTIPLICADOR 1,5x, EXCEÇÃO POR FUNCIONÁRIO E RESCISÃO.** (1) Crédito de HE no banco de horas agora aplica ×1,5. (2) Atraso/falta debita minutos do banco (em vez de desconto monetário) quando a empresa usa banco de horas, com exceção por funcionário (`employees.bancoHorasExcecao`) e reversão idempotente. (3) Critério `he_banco_horas` ↔ `companies.heDestinoPadrao` sincronizados bidirecionalmente. (4) Novas listas de alerta MENSAL (saldo negativo) e TRIMESTRAL (saldo positivo) na página Banco de Horas, sem baixa automática. (5) Rescisão passa a incluir o saldo do banco de horas: positivo = provento (×1,5), negativo = desconto (valor cheio, sem multiplicador) — plugado nos 8 pontos de cálculo de `avisoPrevioFerias.ts` e exibido em `PainelRH.tsx`. ZERO DELETE.

- **Rev. 3976** — **TERCEIROS: TRIPLE-FIX NOS DOCUMENTOS DE FUNCIONÁRIOS TERCEIROS.** (1) Validade fechava a página: `updateMut.onSuccess` tem `setShowForm(false)` → trocado para `bulkUpdateMut` no onChange inline. (2) Upload não refletia na UI: `onSuccess` agora faz `setForm(f=>({...f,[field]:url}))` antes do refetch + `onError` com toast. (3) Validade de NR-10/NR-33/NR-35 e 8 outros campos nunca salvava: Zod descartava silenciosamente → 11 campos adicionados ao schema do `update`. ZERO DELETE.

### 5 one-liners

- **Rev. 3975** — **FECHAMENTO PONTO: SELETOR DE PERÍODO NO UPLOAD DIXI.** Batidas do próximo ciclo (ex: 15/06 em arquivo 15/05–14/06) geravam falta indevida. Fix: dialog de upload exibe bloco âmbar "Período a considerar" (campos De/Até obrigatórios); botão Importar bloqueado sem período válido; backend filtra em memória todos os registros fora do intervalo após `processRecords`, antes de gravar. Lógica DIXI inalterada. ZERO DELETE.

- **Rev. 3974** — **FOLHA: AUTO-RECONCILIAR FALTA ÓRFÃ DO ESCURO CONTRA REGISTRO MANUAL.** Fix: após auto-ponto, UPDATE-CTE cancela adjustments órfãos + limpa `adjMap` em memória. ZERO DELETE.

- **Rev. 3973** — **AUTO-PONTO: TURNO INCOMPLETO COMPUTA DÉFICIT TOTAL COMO ATRASO.** Fix: após cálculo de HE, `if actualMins < expectedMins → minutosAtraso = max(minutosAtraso, deficit)`. Guard `isFalta===0` evita dupla contagem. ZERO DELETE.

- **Rev. 3972** — **AUTO-PONTO: FÉRIAS NÃO GERAM FALTA NO FECHAMENTO DA FOLHA.** Pré-carrega `vacation_periods` que intersectam o período; dias de férias recebem `tipoDia='ferias'`, bloqueando `isFalta=1`. Padrão idêntico ao da fase do escuro. ZERO DELETE.

- **Rev. 3971** — **CONVÊNIOS: FIX COLUNA VAZIA NA FOLHA (`competencia_desconto` NULL).** `aprovar` mutation nunca gravava `competenciaDesconto` no update — agora persiste `competenciaSelecionada` do RH. ColFix v3971 backfilla todos os aprovados antigos com `competencia_desconto IS NULL` pela regra dia-15/16. ZERO DELETE.

- **Rev. 3970** — **REFIS: FIX CARDS INFERIORES PREVISTO/REALIZADO (DELTA → ACUMULADO).** `rPrevSem`/`rRealSem` substituídos por `rPrev`/`rReal` (acumulados); barra de progresso ajustada; legenda → "Snapshot MSP". ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3917 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
