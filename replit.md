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

- **Rev. 4476** — **FIX: PRÉVIA DO CONTRATO NO DIÁLOGO FCSIGN ABRE O DOCUMENTO CORRETO.** Botão "Prévia do Contrato" antes fazia `window.open('/contrato-pj/:id')` (abrindo o ContratoPJView antigo). Agora `handlePreview()` gera o HTML via `buildContratoPjSignHtml` (idêntico ao enviado ao FCSign) e abre numa janela nova. Botão desabilitado enquanto carregando; toast se pop-up bloqueado. ZERO schema change.
- **Rev. 4475** — **FIX: BLOCO DE ASSINATURA DO CONTRATO PJ — REMOVE TEXTO REDUNDANTE + TESTEMUNHAS.** Nova função `stripPartyIdBlock()` em `contratoPjDocument.ts`: remove `<p>` com "CONTRATANTE:"/„CONTRATADA:" e linhas avulsas "CNPJ: ..." do corpoHtml ISO (eram texto duplicado do template). `hasTestemunhas` propagado do diálogo FCSign → `buildFcDocument` renderiza slots de testemunha_1/testemunha_2 quando ao menos uma testemunha for preenchida. ZERO schema change.

### 5 one-liners

- **Rev. 4474** — **FEAT: FCSIGN PJ EXIBE SESSÃO ATIVA BLOQUEANTE + BOTÃO CANCELAR.** Novo endpoint `signatures.getActiveByObservacoes`; `FCSignPJSendDialog.tsx` mostra painel laranja com status, signatários (✓/⏱) e botão "Cancelar sessão" (Admin Master). Formulário oculto enquanto houver sessão ativa. ZERO schema change.
- **Rev. 4473** — **FIX: PRÉVIA DO CONTRATO PJ MOSTRA RASCUNHO + BANNER DE AVISO.** `pj.modeloContrato` aceita `forPreview: true` → fallback ao rascunho quando não há vigente + retorna `isRascunho`. `ContratoPJView.tsx` usa `forPreview: true`; banner âmbar quando `isRascunho=true`. ZERO schema change.
- **Rev. 4472** — **FIX: PREVIEW DO CONTRATO PJ USA SOMENTE O TEMPLATE DA CENTRAL DE DOCUMENTOS.** `handlePreviewContrato` bloqueia com toast de erro se `modeloHtml=null`; botão desabilitado + spinner enquanto query não resolve. Template legado NUNCA mais exibido. ZERO schema change.
- **Rev. 4471** — **FEAT: VALOR E DADOS BANCÁRIOS EM VERMELHO + TABELA NO PDF DO CONTRATO PJ.** `replacePlaceholders` em `contratoPjDocument.ts`: ISO path → `[VALOR_MENSAL]`/`[VALOR_EXTENSO]` → vermelho, `[DADOS_BANCARIOS_CONTRATADA]` → mini-tabela HTML. ZERO schema change.
- **Rev. 4470** — **FEAT: COMBOBOX PESQUISÁVEL DE BANCOS BRASILEIROS NO CONTRATO PJ.** Campo "Banco" em §5 → `BancoCombobox` (Popover+Command). Nova lib `bancosBrasil.ts` com ~250 bancos; filtra por código/nome; normaliza acentos. ZERO schema change.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4413 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
