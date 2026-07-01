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

- **Rev. 3949** — **CONCILIAÇÃO: FIX DEDUP SECUNDÁRIO DESCARTA LANÇAMENTOS COM MESMO DOC.** 7x DEBITO CAPITALIZACAO R$109,83 no mesmo dia → só 1 importado. Causa: dedup secundário (Rev.3802) fazia `ILIKE '%Doc 369639%'` sem checar `saldo_apos`. Fix: adicionado `($5::numeric IS NULL OR saldo_apos=$6)` em Fase 1 + Fase 2. Saldo distinto = transação distinta. ZERO DELETE.

- **Rev. 3948** — **CONVENÇÃO COLETIVA IA: DATAS BR + CORES + AVISO DISSÍDIO + FIX PISO IA.** `sanitizarExtracao()` normaliza valores numéricos da IA (fix "2.302.75"→230275 via parseBRL bug); datas mostram DD/MM/AAAA via `isoToBR/brToISO`; tabela simulação com ▲ vermelho/▼ verde; banner âmbar se dissídio existente; banner vermelho se piso > 10k. ZERO DELETE.

### 5 one-liners

- **Rev. 3947** — **CONVENÇÃO COLETIVA IA: REDESIGN DIALOG "NOVA ANÁLISE".** Header gradient indigo + ícone; ano + upload em linha única (seletor `h-9` inline com nome truncado ao selecionar); aviso amber compacto; footer `bg-slate-50`; sem scrollbar. Barra 0→100% mantida. ZERO DELETE.

- **Rev. 3946** — **CONVENÇÃO COLETIVA IA: FIX COLUNAS SNAKE_CASE (Drizzle).** `convencaoIA.listar` e `processarPdf` falhavam com `column "companyId" does not exist` — tabela criada via SyncSchema+ usa `company_id`; schema Drizzle não tinha mapeamento → `"companyId"` (camelCase com aspas). Fix: nome explícito em TODOS os campos camelCase de `convencaoAnalises` + `convencaoAnaliseItens`. ZERO DELETE.

- **Rev. 3945** — **CONVENÇÃO COLETIVA IA: BOTÃO "ANALISANDO" COM % 0→100.** Regra de Ouro: `setInterval` simulado 0→90% (fase IA, 700ms/tick); `onSuccess` salta p/ 100% e limpa em 800ms; `onError` zera. Botão `overflow-hidden` + `bg-white/15` crescendo via `width: X%` + texto "Analisando… XX%". ZERO DELETE.

- **Rev. 3944** — **CONTAS A RECEBER: MULTI-SELEÇÃO + AJUSTE EM LOTE.** Botão "Selecionar" expande grupos, checkboxes nas linhas, barra flutuante com valor total, `BulkAjustarDialog` 3 abas (Categoria/Obra, Vencimento, Receber em lote). Novo endpoint `bulkAtualizarVencimento`. ZERO DELETE.

- **Rev. 3943** — **CONVENÇÃO COLETIVA IA: ADICIONA BARRA LATERAL.** Faltava `DashboardLayout` no componente. Envolvidos os 2 returns (lista + relatório). ZERO DELETE.

- **Rev. 3942** — **CONVENÇÃO COLETIVA IA: FIX "SELECIONE UMA EMPRESA".** `selectedCompany` é OBJETO → `parseInt(obj)=NaN=0` → guard disparava. Fix: `companyIdNum` (já coerced). ZERO DELETE.

- **Rev. 3941** — **CONTAS A RECEBER: BADGE DUPLICATA + FIX ESTORNO-CHEQUE.** Window function `COUNT(*) OVER (PARTITION BY company_id, valor, data_vencimento)`; badge âmbar "⚠ Possível duplicata". Fix `_INTERNO_PATTERNS` cheque-estorno. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3917 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
