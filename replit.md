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

- **Rev. 3900** — **PT — PERMISSÃO DE TRABALHO (NR-35) 100% DIGITAL.** Novo módulo SST; tabelas `pt_permissoes` + `pt_assinaturas` via ColFix; wizard 4 passos (Solicitação, Descrição, Checklist 15 itens NR-35, Envolvidos); assinaturas canvas pad por worker (touch/mouse); fluxo em_andamento → liberada → concluida; stats cards clicáveis; rota `/sst/pt`; sidebar SST atualizado. ZERO DELETE.

- **Rev. 3899** — **NF-e EMITIDAS — STATUS SEGUE SEFAZ + CONSOLIDAR MÊS.** "Conciliada" só aparece quando há extrato bancário vinculado (stmtLineId); status base de notas = "Emitida"; vincular lançamento financeiro não muda mais status; desvincular extrato → "Emitida"; botão renomeado "Consolidar Mês" grava flag em `fiscal_notes_meses_consolidados` sem alterar NF-e individuais; STATUS_MAP + filtros + bulk status atualizados; 204 notas incorretas + 717 pendentes corrigidas no Neon. ZERO DELETE.

### 5 one-liners

- **Rev. 3898** — **CONTRATOS PJ — EDIÇÃO DE CLÁUSULAS POR CONTRATO.** ZERO DELETE.

- **Rev. 3897** — **ORÇAMENTO — FIX IMPORTAÇÃO: SPLIT MAT/MO CORRETO EM LINHAS DE AGRUPAMENTO.** ZERO DELETE.

- **Rev. 3895** — **EPI — DIAGNÓSTICO DE FUNÇÕES NO DIALOG DE KIT + BOTÃO GERAR E SALVAR TODOS.** ZERO DELETE.

- **Rev. 3894** — **EPI — KIT COBRE FUNÇÕES SIMILARES (CARPINTEIRO I, II, III → 1 KIT).** Nova coluna `funcoes_cobertas_json` em `epi_kits`; ColFix garante coluna; dialog exibe chips "Cobre funções similares"; card mostra "+N similares". ZERO DELETE.

- **Rev. 3893** — **EPI — CAMPO FUNÇÃO DO KIT VIRA SELECT COM FUNÇÕES SEM KIT.** Endpoint `funcoesDisponiveis`: cruza `job_functions` ativas com `epi_kits` ativos e retorna só as funções que ainda não têm kit. Dialog "Novo Kit" substitui Input por Select; loading state; refetch automático. ZERO DELETE.

- **Rev. 3892** — **EPI — SUGESTÃO DE KITS POR ESTOQUE REAL + ITENS FALTANTES EM VERMELHO.** Novo endpoint `iaSugerirKitsComEstoque`; IA retorna `disponivel` por item; painel verde/vermelho; badge "Comprar". ZERO DELETE.

- **Rev. 3891** — **EPI — BOTÃO IA DENTRO DO DIALOG DE KIT: PREENCHE ITENS POR FUNÇÃO.** `iaKitsDialogMut` preenche nome/descrição/itens do form; dialog 3 passos; box gradiente violeta; loading "Consultando NR-6/NR-18". ZERO DELETE.

- **Rev. 3889** — **EPI — OBSERVAÇÃO OBRIGATÓRIA QUANDO EPI FORA DO KIT + FLAG `fora_do_kit` + BADGE.** Coluna `fora_do_kit`; server valida observação obrigatória; textarea + badge ⚠ âmbar. ZERO DELETE.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 3887 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
