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

- **Rev. 3877** — **TEMPLATES DE EXTRATO BANCÁRIO + PARSER SANTANDER IBPJ.** Novo parser determinístico para Santander Internet Banking PJ (IBPJ): detecta `"Internet Banking Empresarial"`, ignora "Saldo do dia", parse de `DD/MM/AAAA` + `[- ]R$`. Inserido como passo 2.7 em `parseExtratoLines` (após Santander Consolidado, antes de IA). Nova tabela `bank_statement_templates` (por empresa: palavras-chave, skip-prefixes, instruções IA) + CRUD tRPC + aba "Templates de Extrato" em Configurações. `parseExtratoComIA` aceita `extraInstructions?` para injetar o template no prompt. ZERO DELETE.

- **Rev. 3876** — **CHEQUE ESPECIAL — CONTROLE POR CONTA BANCÁRIA + ALERTA NA CONCILIAÇÃO.** Duas colunas novas em `company_bank_accounts` (`cheque_especial_ativo` + `cheque_especial_limite`). Self-heal no `[SyncSchema+]`. `getBankAccounts` SQL retorna `chequeEspecialAtivo`, `chequeEspecialLimite` e `saldoAtual` (saldo abertura + total extrato). Zod de `criarContaBancaria`/`atualizarContaBancaria` inclui novos campos. `ContasBancarias.tsx` ganha toggle + MoneyInput + badge laranja. `FinanceiroConciliacao.tsx` exibe badge "⚠ Ch. Especial" quando `chequeEspecialAtivo=1 && saldoAtual<0`. ZERO DELETE.

### 5 one-liners

- **Rev. 3875** — **CONCILIAÇÃO — REGRA DE OURO: LIMPAR NÃO DESTRÓI CONCILIADOS SEM CONFIRMAÇÃO.** `limparExtrato`/`limparExtratoMes` retornam `{ ok: false, conciliadosCount }` sem `force=true`; client exige checkbox. ZERO DELETE.

- **Rev. 3874** — **DASH EPIs — CLIQUE NAS BARRAS DO GRÁFICO ABRE DETALHE.** `onChartClick` + state `detalheEpi` em `DashEpis.tsx`. ZERO DELETE.

- **Rev. 3873** — **FIX CHECKLIST DOCX — WORD "ERRO AO ABRIR".** `LOGO_W=170px`/`LOGO_H=78px` (pixels, não EMUs). `downloadPacoteContador.ts`. ZERO DELETE.

- **Rev. 3872** — **FIX DATA NAS PLANILHAS XLSX — DD/MM/AAAA.** Guard `instanceof Date` em `fmtDate()` → DD/MM/AAAA em vez de "Fri Jan 02". ZERO DELETE.

- **Rev. 3871** — **FIX PARSER EXTRATO BB — VALORES E TIPO D/C CORRETOS.** Pré-strip `RE_BB_DOCNUM`; regex `[CD](?=[\s\d]|$)`. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3869 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
