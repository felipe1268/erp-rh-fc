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

- **Rev. 4305** — **SCORECARD: FIX LOCAÇÕES INVISÍVEIS — data_fim_real EMPTY STRING QUEBRAVA DATE CAST.** `safe("locacoes")` retornava `[]` porque `data_fim_real=''` (não NULL) passava pelo `IS NOT NULL` mas `''::date` lançava erro. Fix: `NULLIF(col, '')::date` e `NULLIF(col, '') IS NOT NULL` em todos os 3 Ramos (A/B/C). Log de diagnóstico adicionado. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4304** — **SCORECARD: FIX CRÍTICO getCustosRH — CAST NUMÉRICO COM SEPARADOR DE MILHAR BR.** `getCustosRH` lançava "invalid input syntax for type numeric: '2.918.67'" porque salários VARCHAR no formato BR ("2.918,67") eram convertidos com apenas `REPLACE(',','.')` → dois pontos. Fix: duplo REPLACE em todas as 11 colunas. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4303** — **SCORECARD: FIX CUSTO MO INVISÍVEL + LOCAÇÕES VIA OC.** Ramo B `site_periods` COALESCE fix + Ramo C UNION para locações via compras_ordens. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4302** — **SMO: CUSTOS ÚNICOS DE ADMISSÃO (EPI COMPLETO, UNIFORME, JOGO INICIAL) NO CARD DE IMPACTO FINANCEIRO.** `computeCustoSMO` expõe `epiCompletoUnico/uniformeUnico/jogoInicialUnico`; nova seção âmbar no card. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4301** — **FCSIGN: BOTÃO "SOLICITAR REVISÃO" PARA O ASSINANTE NA TELA DE ASSINATURA.** Nova procedure pública `requestRevision`. Botão amber inline + card de confirmação em `AssinarDocumento.tsx`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4300** — **NFS-e: SUPORTE AO FORMATO NFS-e NACIONAL (SPED/RFB v1.01) NO IMPORT XML.** Novo bloco no importNfseXmlManual detecta `xmlParsed.NFSe.infNFSe` e faz INSERT. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4299** — **NFS-e: FIX IMPORT XML — DATAS INVÁLIDAS + SUPORTE ListaNfse + LOGGING.** `parseDateBR` retornava `"0"` → `"0"::date` explodindo no PostgreSQL. Fix: retorna `null`. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4292 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
