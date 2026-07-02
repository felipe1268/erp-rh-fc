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

- **Rev. 3972** — **AUTO-PONTO: FÉRIAS NÃO GERAM FALTA NO FECHAMENTO DA FOLHA.** Loop do `simulaFolha` marcava `isFalta=1` em todos os dias úteis sem `time_record`, incluindo dias de gozo de férias. Corrigido: pré-carrega `vacation_periods` que intersectam o período do ponto; dias de férias recebem `tipoDia='ferias'`, bloqueando os guards `if (tipoDia==='util') isFalta=1`. Padrão idêntico ao da fase do escuro. ZERO DELETE.

- **Rev. 3971** — **CONVÊNIOS: FIX COLUNA VAZIA NA FOLHA (`competencia_desconto` NULL).** `aprovar` mutation nunca gravava `competenciaDesconto` no update — agora persiste `competenciaSelecionada` do RH. ColFix v3971 backfilla todos os aprovados antigos com `competencia_desconto IS NULL` pela regra dia-15/16. ZERO DELETE.

### 5 one-liners

- **Rev. 3970** — **REFIS: FIX CARDS INFERIORES PREVISTO/REALIZADO (DELTA → ACUMULADO).** `rPrevSem`/`rRealSem` substituídos por `rPrev`/`rReal` (acumulados); barra de progresso ajustada; legenda → "Snapshot MSP". ZERO DELETE.

- **Rev. 3969** — **DISSÍDIO: FIX DIFERENÇAS RETROATIVAS QUANDO VIGÊNCIA == MÊS DE APLICAÇÃO.** `mesesRetroativosEntre("2026-05","2026-05")` retornava `[]`; guard inclui o próprio mês quando vigência == aplicação; `recalcularDiferencas` corrigido igual; botão "Calcular Diferenças Retroativas" adicionado no dialog da Folha. ZERO DELETE.

- **Rev. 3968** — **VALE ALIMENTAÇÃO: SELETOR PERÍODO → PADRÃO WHITE-CARD.** `MonthSelector` → `PeriodSelectorCard` nas 3 abas (lancamento/por_obra/alertas_faltas); `mesAno` → `ano`+`mes`+`mesStr`; todas as queries e mutations atualizadas. ZERO DELETE.

- **Rev. 3967** — **EFETIVO OBRA: FIX ÚLTIMO GRUPO CORTADO NA TABELA EQUIPE.** `p-4` → `p-4 pb-16` no container scroll da FullScreenDialog; último grupo de funções não ficava mais visível. ZERO DELETE.

- **Rev. 3966** — **EFETIVO OBRA: LIGHTBOX DE FOTO AO CLICAR NA TABELA "EQUIPE — {OBRA}".** `EmpAvatar` recebe `onClick`; Dialog shadcn 256×256 abre ao clicar na miniatura; iniciais sem foto não são clicáveis. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3917 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
