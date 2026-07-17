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

- **Rev. 4335** — **SCORECARD RH/FOLHA: PJ — DISTINCT ON (melhor contrato por funcionário) + badge "Sem contrato PJ".** `pj_best` CTE usa `DISTINCT ON (employeeId)` priorizando obra-específico → sem obra → qualquer; inclui TODOS funcionários do efetivo independente do `obra_id` do contrato. Badge laranja "⚠ Sem contrato PJ" para PJ sem contrato ativo vs amber "⚠ Sem folha" para CLT. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4334** — **SCORECARD RH/FOLHA: PJ — CUSTO VIA MÓDULO TERCEIROS (obra_id NULL fallback).** Query PJ ampliada: aceita `pj_contracts.obra_id = obraId` OU `obra_id IS NULL` com funcionário em `obra_funcionarios`. Contratos de outra obra excluídos. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4333** — **SCORECARD RH/FOLHA: EFETIVO COMPLETO — `period_emps` LEFT JOIN + badge "Sem folha".** `custos` CTE ancorando em `period_emps` LEFT JOIN payroll. Badge ⚠ amber para CLT sem folha. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4332** — **SCORECARD RH/FOLHA: CARD CUSTO EQUIPE — TOGGLE MIN/HORA/DIA/SEMANA/MÊS.** 5 pills: custoHora=custoDia÷8; custoMinuto=custoHora÷60. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4326** — **PT DE SERVIÇO: FIX HORÁRIO UTC → BRASÍLIA + DATA ISO → BR.** `timeZone:"America/Sao_Paulo"` no `toLocaleString`; conclusão `"2026-07-02"` → `"02/07/2026"`; default form usa `toLocaleDateString("sv-SE",{timeZone:...})`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4325** — **SCORECARD RH/FOLHA: BH — PADRÃO `site_periods` (Ramo A + B).** Substitui `emp_obra` simples pelo CTE `site_periods` idêntico ao `getCustosRH`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4324** — **SCORECARD RH/FOLHA: FIX BH VAZIO — SALDO VIA `banco_horas_saldo`.** Remove CTE `acumulado`; usa `LEFT JOIN banco_horas_saldo`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4323** — **SCORECARD RH/FOLHA: BANCO DE HORAS COM DADOS REAIS + PERIOD SELECTOR.** `getBancoHorasObra` reescrito; `PeriodSelectorCard` com bolinhas azuis; tabela "Mov. Mês|Ano" + "Saldo Acum.". ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4322** — **CONTRATOS TERCEIROS: OBRA OBRIGATÓRIA + ALERTA VISÍVEL SEM OBRA.** `ContratoNovo`: Obra obrigatória; `ContratosList`: banner vermelho. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4302 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
