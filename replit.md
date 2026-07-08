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

- **Rev. 4090** — **CONCILIAÇÃO: DEDUP DE IMPORTAÇÃO CIENTE DE DUPLICATAS LEGÍTIMAS NO BATCH.** Bug: `importBankStatement` e `checkStatementDuplicates` usavam `LIMIT 1` — se o DB tinha 1 linha com chave (data+desc+valor+saldo), todas as demais idênticas no batch eram descartadas. Extrato IBPJ Locknow jun/2026 perdia 7 "Pix Enviado FC ENGENHARIA PROJETOS E" (2× R$50k em 05/06 + 5 outros). Fix: pré-passe conta ocorrências no batch e no DB; só pula quando `alreadyInDb + alreadyInSess >= batchTotal`. As 7 linhas faltantes foram inseridas via SQL de produção. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4089** — **NOTAS FISCAIS: CARDS DE TOTAIS EXCLUEM CANCELADAS/SUBSTITUÍDAS.** Bug: `totais.total` e `totais.valorTotal` usavam `nfs.length`/`somarLiq(nfs)` — incluíam NFs canceladas e substituídas no card "Total NFs" e na barra de progresso. Fix: novo filtro `ativas = nfs.filter(!cancelada && !substituida)` como base dos dois campos. Os sub-totais por status já estavam corretos. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

### 5 one-liners

- **Rev. 4088** — **NF-e: AUTO-VÍNCULO CROSS-MÊS — NFS-e DE MÊS ANTERIOR CONCILIADA AUTOMATICAMENTE AO CONSOLIDAR O MÊS SEGUINTE (REGIME DE COMPETÊNCIA).** 3 bugs corrigidos na janela de data invertida, período restrito e consolidarMes sem disparo. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4087** — **PANORAMA FISCAL: MATCHING RETROATIVO DE ENTRADAS BANCÁRIAS × NFS-e DE MESES ANTERIORES (REGIME DE COMPETÊNCIA).** Novo endpoint `nfseAntQ`; matching heurístico valor ≈ valor_liquido (±3%); AlertCard azul + badge "← NFS-e #N / data". ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4086** — **CONCILIAÇÃO: IMPORTAÇÃO EM LOTE INTELIGENTE — CONTA AUTO-DETECTADA DO CABEÇALHO OFX + DIÁLOGO DE REVISÃO POR ARQUIVO.** BatchImportDialog com auto-detect de conta do OFX + seletor de override. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4085** — **CONCILIAÇÃO: DEDUP DE IMPORTAÇÃO PASSA A SER CONTROLADO PELO USUÁRIO (DIÁLOGO DE REVISÃO) + PARSER OFX ROBUSTO PARA FORMATO BR.** Antes: duplicatas eram descartadas silenciosamente sem visibilidade. Fix: novo endpoint `checkStatementDuplicates` (dry-run, sem INSERT) + `handleImport` ganhou FASE 1.5 que pausa antes de gravar e abre `ReviewDuplicatesDialog`. ZERO DELETE · ZERO UPDATE · ZERO ALTER.

- **Rev. 4084** — **CONTAS A RECEBER: "NOVO TÍTULO" ENRIQUECIDO COM CONTA BANCÁRIA DE RECEBIMENTO + VÍNCULO DE NFS-e + BADGE NA LISTA.** Nova tabela `financial_nfse_vinculos`; `criarTituloReceber` recebe `contaBancariaId`+campos NFS-e; upload XML DOMParser multi-padrão; badge na lista. ZERO DELETE · ZERO ALTER em dados existentes · 1 CREATE TABLE.

- **Rev. 4083** — **CONCILIAÇÃO: PARSERS SANTANDER CORRIGIDOS — EXTRATO CONSOLIDADO INTELIGENTE (FEV/2026) E INTERNET BANKING EMPRESARIAL IBPJ (JUN/2026) FUNCIONAM INDEPENDENTEMENTE + TEMPLATES AUTO-SEEDED EM CONFIGURAÇÕES.** ZERO DELETE · ZERO UPDATE · ZERO ALTER.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4082 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
