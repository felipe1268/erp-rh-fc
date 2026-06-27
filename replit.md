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

- **Rev. 3794** — **FINANCEIRO · DRE · AUDITORIA COMPLETA DE CLASSIFICAÇÃO: PREDICADOS dreLinhaPredicate ATUALIZADOS PARA RESPEITAR class_dre DO PLANO DE CONTAS (despesasFixas: natureza='fixo' OR class_dre='despesa_fixa'; despesasVariaveis EXCLUI class_dre IN ('despesa_fixa','despesa_financeira'); despesasFinanceiras ADICIONA OR class_dre='despesa_financeira'). 20 CONTAS RECLASSIFICADAS: custo_obra→{12 grupos de Obra — Fretes, Uniformes, EPIs, Aluguel, Alojamento, Viagens, Utilidades, Alimentação, Mobilização, Manutenção Equipamentos, Infraestrutura, Vale Transporte-Obra}; despesa_fixa→{Salários ADM, Honorários, Honorários Jurídicos, Materiais Consumo ADM, Seguro Veículos, Seguros Empresariais}; despesa_financeira→{Dívidas Bancárias, Limite/Ch.Especial, Investimentos Financeiros, Mútuos Intercompany}. IMPACTO JAN/2026: Despesas Variáveis R$1.094.438→R$63.027 (-94%); Despesas Fixas R$0→R$88.647; CDO R$1.155.441→R$1.362.829. DADOS: UPDATE EM financial_accounts · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3793** — **FINANCEIRO · DRE · DRILL-DOWN DE CATEGORIA: CADA CATEGORIA NO DIALOG DE DETALHAMENTO DO DRE PASSA A SER CLICÁVEL — ABRE VISTA FULLSCREEN COM OS LANÇAMENTOS INDIVIDUAIS DAQUELA CATEGORIA (DATA, DESCRIÇÃO, CONTRAPARTE, OBRA, VALOR). BOTÃO "VOLTAR" RETORNA À LISTA. ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### 5 one-liners

- **Rev. 3792** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · CARD "CHEQUES DEVOLVIDOS" · CORREÇÃO DEFINITIVA: DOC 655 E DOC 1077 "PENDENTES" MESMO COM PIX/TED VINCULADO. BACKEND PRÉ-CARREGA bank_cheque_vinculos E CLASSIFICA resolucao.tipo="vinculado" POR IDENTIDADE. BACKEND READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3791** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · PAINEL DE SELEÇÃO DE CONTA GANHA DOIS BOTÕES DISTINTOS: "LIMPAR ESTA CONTA" E "LIMPAR TODAS AS CONTAS". 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3790** — **FINANCEIRO · DRE · DIALOGS DE DRILL-DOWN REDESENHADOS: CABEÇALHO NAVY+LARANJA, TOTAL EM DESTAQUE, BARRAS DE PROPORÇÃO POR CATEGORIA. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3789** — **FINANCEIRO · DRE · CORREÇÃO CRÍTICA: DRE PASSA A REFLETIR SOMENTE REALIZADOS. ANTES USAVA COALESCE(realizado,previsto) — INFLAVA DESPESAS VARIÁVEIS DE JAN/2026 DE R$2,2M PARA R$4,1M. ZERO SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3788** — **FINANCEIRO · CONCILIAÇÃO BANCÁRIA · BOTÃO "CONFERIR CHEQUES" REMOVIDO DO CABEÇALHO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3762 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
