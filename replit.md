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

- **Rev. 3872** — **FIX DATA NAS PLANILHAS XLSX — DD/MM/AAAA.** Causa-raiz: `fmtDate()` em `downloadPacoteContador.ts` não tratava objetos `Date` do Drizzle; `String(date).slice(0,10)` → `"Fri Jan 02"` cru no Excel. Fix: guard `instanceof Date` com UTC → DD/MM/AAAA. Cobre todos os 4 builders (ListaFaturas, NfeXlsx, ExtratoGeral, OcsXlsx). ZERO DELETE.

- **Rev. 3871** — **FIX PARSER EXTRATO BB — VALORES E TIPO D/C CORRETOS.** Causa-raiz: pdf-parse colapsa nº de documento BB diretamente contra o valor sem espaço (`"616.6731,44 D0,00 C"`). `[CD]\b` falha quando D/C é seguido de dígito → valor ignorado, saldo capturado como valor. Fix: pré-strip `RE_BB_DOCNUM` (`\d{3}.\d{3}.\d{3}.\d{3}.\d{3}`); regex `(?<!\d)…[CD](?=[\s\d]|$)`. Validado: 4 lançamentos corretos (Tarifa 1,44D / PIX 2.100C / Tarifa 91,66D / Empréstimo 1.996,42D). ZERO DELETE.

### 5 one-liners

- **Rev. 3870** — **SEFAZ — CURAR RATE-LIMIT + FIX resetNSU SEGURO.** `resetNSU` usa MAX(nsu_sefaz); `curarRateLimit` desliga sync+NSU seguro; botão "⏸ Pausar" na UI. ZERO DELETE.

- **Rev. 3869** — **ZIP PACOTE CONTADOR — PREFIXO 3 DÍGITOS (001_…006_).** Numeração `01_` → `001_` em todas as pastas e no checklist. ZERO DELETE.

- **Rev. 3866** — **PANORAMA FISCAL — EXTRATO UNIFICADO COM FILTROS.** `UnifiedBankTable` lista cronológica única; KPIs inline; filtros tipo/NF/banco; badge "NF# N". ZERO DELETE.

- **Rev. 3865** — **PACOTE CONTABILIDADE — EXTRATO CARTÃO FC TEMPLATE + CHECKLIST A4 + TEMPLATES NAS CONFIGURAÇÕES.** `buildExtratCartaoBuffer` ExcelJS; `buildChecklistDocx` A4; `docx_template_config` + 3 endpoints; aba "Template de Word". ZERO DELETE.

- **Rev. 3864** — **NF# NO EXTRATO — VÍNCULO BIDIRECIONAL NF-e ↔ EXTRATO BANCÁRIO.** `getPanoramaFiscal`: subquery fn_id/fn_numero cobre `stmt_line_id` OU `entry_id` chain; badge `NF# <número>` na Conciliação. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3863 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
