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

- **Rev. 4454** — **FEAT: LOOKUP CNPJ AUTOMÁTICO NO CONTRATO PJ (ENDEREÇO + SÓCIOS).** Ao digitar 14 dígitos no campo CNPJ do Prestador (ou clicar em 🔍), o formulário consulta BrasilAPI (Receita Federal, sem auth) e auto-preenche: Razão Social, Endereço, Cidade, Estado, CEP. Quadro Societário exibido como pills + salvo em JSON. 5 novas colunas em `pj_contracts` via ColFix v4454. `ContratoPJView` ganhou suporte a `[CONTRATADA_CEP]`. ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4453** — **FIX: CNPJ DA CONTRATADA NÃO APARECIA NO CONTRATO PJ.** `pj.contratos.getById` retornava `cnpjPrestador` direto do registro; se null, contrato exibia `_______________`. List já tinha fallback (`carregarCnpjPorEmployee`). Fix: `getById` passa a usar `COALESCE(cnpjPrestador, subquery no contrato mais recente do mesmo employeeId)`. Mesmo padrão para `razaoSocialPrestador`. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4452** — **FIX: CUSTO RH — AFASTADO INSS > 15 DIAS NÃO ERA EXCLUÍDO DO CUSTO ESTIMADO SINTÉTICO.** Loop sintético verificava gozo de férias e recluso, mas ignorava `Afastado`. Fix: `licencaDt15` + limita `overlapEnd`. ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4451** — **FIX: CUSTO RH — DATA INVÁLIDA "YYYY-MM-31" QUEBRAVA MESES COM <31 DIAS.** `getCustosRH`: query `vacation_periods` usava `|| '-31'` → `date out of range`. Fix: 3 ocorrências → `((mesFeriasFim||'-01')::date + INTERVAL '1 month' - INTERVAL '1 day')::date`. ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4450** — **FEAT: CUSTO RH — PREVISÃO vs. CONSOLIDADO (badges de status + VR/VA estimado).** Tabela "Custo por Mês" ganha coluna "Folha" com badge (~ Previsão / ◎ Aberta / ⊗ Fechada / ✓ Pago) + VR/VA estimado em meses sem folha. ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4449** — **FEAT: RAIO-X — USUÁRIO + HORÁRIO NA MUDANÇA DE OBRA (Timeline).** Card de Mudança de Obra / Alocação / Saída exibe abaixo da descrição o nome do usuário que transferiu e o timestamp (DD/MM/AAAA HH:MM). ZERO DELETE · ZERO ALTER destrutivo.
- **Rev. 4448b** — **FIX: CUSTO RH — PRIORIDADE 1 site_periods IGNORAVA isActive (raiz real).** Ramo A Prioridade 1: `WHEN BOOL_OR(dataFim IS NULL)` passa a exigir `NOT EXISTS(OF) OR EXISTS(OF.isActive=1)`. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4413 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
