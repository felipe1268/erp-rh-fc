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

- **Rev. 4479** — **FEAT: GESTORES DE CONTRATOS — TESTEMUNHAS OBRIGATÓRIAS (RH + FINANCEIRO) COM FLUXO DE SUBSTITUIÇÃO.** Todo contrato FCSign/Integrasign passa a ter dois gestores internos obrigatórios: Gestor RH (T1) e Gestor Financeiro (T2). Quando um deles entra em férias/afastamento/desligamento, o RH solicita substituição e o Sócio Administrador aprova. Schema: `gestor_rh_id/nome` em companies + nova tabela `gestor_substituicao_solicitacoes`. Backend: 6 endpoints novos (`getGestoresAtivos`, `criarSolicitacaoSubstituicao`, `aprovarSolicitacao`, `rejeitarSolicitacao`, `encerrarSolicitacao`, `listarSolicitacoes`). UI: aba "Gestores" em Configurações com painéis de substituição pendente/ativa. FCSignPJSendDialog pré-popula T1/T2 automaticamente. Integrasign injeta RH+Financeiro server-side com nova ordem FORNECEDOR→RH→FINANCEIRO→GESTOR_PROJETO→DIRETOR. darBaixa auto-limpa campo gestor ao desligar.
- **Rev. 4478** — **FIX: "SEM ACESSO A ESTA EMPRESA" AO MARCAR/DESMARCAR EQUIPAMENTO NO ALMOXARIFADO.** `vincularItemAlmoxarifado` e `desvincularItemAlmoxarifado` usavam `getUserCompanyLinks` (legado, só `user_companies` direto). Usuários com acesso via obra concedida tinham `allowedIds` vazio → bloqueados. Fix: ambas passam a usar `getCompaniesForUser(userId, role)` — admin global + acesso derivado por obra, padrão do restante do arquivo. ZERO schema change.

### 5 one-liners

- **Rev. 4477** — **FEAT: TOOLBARS DO EDITOR ISO FICAM FIXAS ENQUANTO TEXTO ROLA.** Card do editor em `TemplatesDocsTab.tsx` agora é `sticky top-14 z-20`; toolbar de formatação `sticky top-0 z-10`; conteúdo rola internamente. ZERO schema change.
- **Rev. 4476** — **FIX: PRÉVIA DO CONTRATO NO DIÁLOGO FCSIGN ABRE O DOCUMENTO CORRETO.** `handlePreview()` gera HTML via `buildContratoPjSignHtml` em janela nova; toast se pop-up bloqueado. ZERO schema change.
- **Rev. 4475** — **FIX: BLOCO DE ASSINATURA DO CONTRATO PJ — REMOVE TEXTO REDUNDANTE + TESTEMUNHAS.** `stripPartyIdBlock()` em `contratoPjDocument.ts` remove blocos CONTRATANTE/CONTRATADA duplicados; `hasTestemunhas` renderiza slots de testemunha. ZERO schema change.
- **Rev. 4474** — **FEAT: FCSIGN PJ EXIBE SESSÃO ATIVA BLOQUEANTE + BOTÃO CANCELAR.** Novo endpoint `signatures.getActiveByObservacoes`; painel laranja com status + botão "Cancelar sessão" (Admin Master). ZERO schema change.
- **Rev. 4473** — **FIX: PRÉVIA DO CONTRATO PJ MOSTRA RASCUNHO + BANNER DE AVISO.** `pj.modeloContrato` aceita `forPreview: true` → fallback ao rascunho; banner âmbar quando `isRascunho=true`. ZERO schema change.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4471 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
