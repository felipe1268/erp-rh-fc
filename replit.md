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

- **Rev. 3919** — **SST — PT WIZARD: 10 TIPOS DE TRABALHO COM CHECKLIST DINÂMICO POR NR.** `TIPOS_TRABALHO` expandido de 6 para 10 tipos (⬆️ Altura NR-35, 🕳️ Espaço Confinado NR-33, ⛏️ Escavação NR-18, 🏗️ Andaime NR-35/18, ⚡ Elétrica NR-10, 🔨 Demolição, 🪝 Içamento NR-11, 🔥 Soldagem, 🏚️ Cobertura, 🦺 Geral). `PT_CHECKLISTS`: 10 checklists específicos por NR substituem o array fixo de 15 itens NR-35. `activeChecklistItems` (useMemo) deriva do tipo principal selecionado. `checkCount` corrigido (hardcoded 15 → length dinâmico). Detalhe da PT e header do wizard atualizados. ZERO DELETE.

- **Rev. 3918** — **CONCILIAÇÃO BANCÁRIA: FIX CHIP DE MÊS MOSTRANDO 100% FALSO (ARREDONDAMENTO).** `mesesPct` usava `Math.round`: 829/833 linhas = 99,52% arredondava para 100% mesmo com 4 pendentes na CEF. Fix: `conciliadas >= total ? 100 : Math.floor(...)` — 100% SÓ quando não há nenhuma linha pendente. ZERO DELETE.

### 5 one-liners

- **Rev. 3917** — **SST — PT WIZARD + EDIT DIALOG: CNPJ AUTO-FILL DA RAZÃO SOCIAL VIA BRASILAPI.** `compras.buscarCNPJ`, helper `formatCNPJ`, spinner/✓/erro, limpa ao mudar CNPJ. ZERO DELETE.

- **Rev. 3916** — **SST — PT PDF REDESIGN: 3 LOGOS + SOLICITANTE AUTO + CHECKLIST COM REFS NR.** Cabeçalho triplo + badge NR-35 + logos cliente/gerenciadora da obra. Solicitante = criadoPorNome. Checklist com coluna "Referência NR". ZERO DELETE.

- **Rev. 3915** — **CONCILIAÇÃO BANCÁRIA CEF JAN/2026: PARES ZERO-LÍQUIDO DESCONSIDERADOS + FIX REAPRESENTADOS NA LISTA.** 12 linhas de 6 pares zero-líquido desconsideradas. Filtro `repExt` corrigido. Resultado: 97% (115/119). ZERO DELETE.

- **Rev. 3914** — **CONCILIAÇÃO BANCÁRIA: FIX BARRA DE PROGRESSO (100% FALSO) + SUGESTÕES COM LINHAS DESCONSIDERADAS.** `totLinhas` passou a usar `accConciliadasMap[contaBancariaId]`; `sugerirConciliacao` ganhou `desconsiderado_em IS NULL`. ZERO DELETE.

- **Rev. 3913** — **SST — APR EXPANDIDA: 10 TIPOS DE ATIVIDADE COM CHECKLIST POR NR.** Wizard 3→5 steps: Tipo (10 cards) → Dados → Checklist (Sim/Não/NA) → Riscos (pré-populados) → EPIs+Aprovação. Schema +tipo_atividade+checklist_json (ColFix v3913). Detail dialog exibe checklist respondido. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3904 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
