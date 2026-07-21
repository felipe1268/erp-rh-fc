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

- **Rev. 4481** — **FEAT: COLABORADOR ↔ USUÁRIO — VÍNCULO EXPLÍCITO (employees.userId).** Toda integração colaborador ↔ sistema dependia de match por e-mail (frágil). Solução: nova coluna `user_id` em `employees`; SyncSchema+ idempotente; `updateEmployee` aceita `userId`; 2 novos endpoints (`employees.linkUser`, `employees.getLinkedEmployee`); `getGestoresContrato` usa `employee.userId` como fonte primária; `salvarGestoresContrato` auto-deriva userId do employee (remove seletor manual); ficha de Colaboradores ganha seção "Conta no Sistema" na aba Profissional; Usuários exibe card "Colaborador Vinculado" no painel de detalhe.
- **Rev. 4480** — **FEAT: GESTORES — VÍNCULO EXPLÍCITO COM USUÁRIO DO SISTEMA.** Badge "Conta no sistema" dos gestores de contratos passava a usar match por e-mail, o que falhava quando o e-mail diferia entre employees e users. Solução: 2 novas colunas `gestor_financeiro_user_id` / `gestor_rh_user_id` em companies; endpoint `listUsuariosSistema` lista usuários ativos vinculados à empresa; `getGestoresContrato` busca por userId explícito (principal) com fallback por e-mail retroativo; UI adiciona `<select>` "Conta do sistema" em cada card de gestor; `GestorUserStatusBadge` atualizado para exibir vínculo direto.

### 5 one-liners

- **Rev. 4479** — **FEAT: GESTORES DE CONTRATOS — TESTEMUNHAS OBRIGATÓRIAS (RH + FINANCEIRO) COM FLUXO DE SUBSTITUIÇÃO.** Schema: `gestor_rh_id/nome` em companies + tabela `gestor_substituicao_solicitacoes`. 6 endpoints. UI: aba "Gestores" em Configurações. FCSignPJSendDialog pré-popula T1/T2. Integrasign server-side.
- **Rev. 4478** — **FIX: "SEM ACESSO A ESTA EMPRESA" AO MARCAR/DESMARCAR EQUIPAMENTO NO ALMOXARIFADO.** `vincularItemAlmoxarifado` / `desvincularItemAlmoxarifado` usavam `getUserCompanyLinks` (legado). Fix: `getCompaniesForUser`. ZERO schema change.
- **Rev. 4477** — **FEAT: TOOLBARS DO EDITOR ISO FICAM FIXAS ENQUANTO TEXTO ROLA.** Card do editor em `TemplatesDocsTab.tsx` agora é `sticky top-14 z-20`; toolbar de formatação `sticky top-0 z-10`; conteúdo rola internamente. ZERO schema change.
- **Rev. 4476** — **FIX: PRÉVIA DO CONTRATO NO DIÁLOGO FCSIGN ABRE O DOCUMENTO CORRETO.** `handlePreview()` gera HTML via `buildContratoPjSignHtml` em janela nova; toast se pop-up bloqueado. ZERO schema change.
- **Rev. 4475** — **FIX: BLOCO DE ASSINATURA DO CONTRATO PJ — REMOVE TEXTO REDUNDANTE + TESTEMUNHAS.** `stripPartyIdBlock()` em `contratoPjDocument.ts` remove blocos CONTRATANTE/CONTRATADA duplicados; `hasTestemunhas` renderiza slots de testemunha. ZERO schema change.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4474 e anteriores.

## User preferences

- **REGRA DE OURO — Seletor de mês/ano:** SEMPRE usar `<PeriodSelectorCard>` (`client/src/components/PeriodSelectorCard.tsx`). Layout padrão: navegação `< ANO >` + botão "Ano todo" no cabeçalho + 12 pills de mês (Jan…Dez) em grade horizontal. Estado: `mes: number | null` (null = ano todo). NUNCA usar seletor inline customizado (‹/›, dropdown, ou similar). Aplicar em TODA tela que filtra por mês/ano.
- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
