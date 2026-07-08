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

- **Rev. 4094** — **CORREÇÕES DE PRODUÇÃO: 3 BUGS (SQL $N, ferias.list coerce, getAlertasCompras try/catch).** (1) `financial.ts`: uniquePrefixes com `$100` etc. quebravam `dbExecute` (split regex `\$\d+`); fix: filter antes do VALUES CTE. (2) `avisoPrevioFerias.ts`: `companyId: z.number()` → `z.coerce.number()` (frontend enviava string). (3) `compras.ts` `getAlertasCompras`: try/catch global com `console.error(stack)` + retorno de default seguro para "Cannot convert undefined or null to object". (4) `FinanceiroNotasFiscais.tsx`: `calcValorLiquido` remove ISS da fórmula; Valor Líquido vira `<input>` editável. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4093** — **SPED: EFD CONTRIBUIÇÕES (PIS/COFINS) + SPED ECF (IRPJ/CSLL LP) + SPED ECD.** 3 novos geradores de arquivo SPED: (1) EFD Contribuições COD_VER 006 — regime cumulativo LP, Blocos A(NFS-e)/C(NF-e)/M(apuração PIS M200-210/COFINS M600-610); (2) SPED ECF COD_VER 009 LP — Blocos N(IRPJ trim 15%+10%)/P(CSLL 9%); (3) SPED ECD COD_VER 011 — plano de contas + lançamentos de `financial_accounts`/`financial_entries`. 3 tRPC routers (efdContribuicoes/spedEcf/spedEcd) + 3 Express routes + 3 páginas frontend + SyncSchema+ cria `efd_contrib_config`, `sped_ecf_config`, `sped_ecd_config` (UNIQUE company_id) + seed FC. Menu Contabilidade: +3 itens. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

### 5 one-liners

- **Rev. 4092** — **EFD-ICMS/IPI: GERADOR DE ARQUIVO TXT (SPED) — GUIA PRÁTICO v3.2.2, COD_VER 017.** Novo tRPC router `efdIcmsIpi` (getConfig/saveConfig) + Express route. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4090** — **CONCILIAÇÃO: DEDUP DE IMPORTAÇÃO CIENTE DE DUPLICATAS LEGÍTIMAS NO BATCH.** Fix: pré-passe conta ocorrências no batch e no DB; só pula quando `alreadyInDb + alreadyInSess >= batchTotal`. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4089** — **NOTAS FISCAIS: CARDS DE TOTAIS EXCLUEM CANCELADAS/SUBSTITUÍDAS.** Fix: `ativas = nfs.filter(!cancelada && !substituida)` como base de `total` e `valorTotal`. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4088** — **NF-e: AUTO-VÍNCULO CROSS-MÊS — NFS-e DE MÊS ANTERIOR CONCILIADA AUTOMATICAMENTE AO CONSOLIDAR O MÊS SEGUINTE (REGIME DE COMPETÊNCIA).** 3 bugs corrigidos na janela de data invertida, período restrito e consolidarMes sem disparo. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4087** — **PANORAMA FISCAL: MATCHING RETROATIVO DE ENTRADAS BANCÁRIAS × NFS-e DE MESES ANTERIORES (REGIME DE COMPETÊNCIA).** Novo endpoint `nfseAntQ`; matching heurístico valor ≈ valor_liquido (±3%); AlertCard azul + badge "← NFS-e #N / data". ZERO DELETE · ZERO UPDATE · ZERO ALTER.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4084 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
