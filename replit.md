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

- **Rev. 4066** — **CONCILIAÇÃO BANCÁRIA: CAMPO CATEGORIA NÃO MOSTRAVA CONTAS DO PLANO DE CONTAS.** Usuário cadastrou "Licenças e Assinaturas de Software" (código 4.6) no Plano de Contas, mas ao pesquisar na tela de Conciliação Bancária (dialog "Lançar no Contas a Pagar") ela não aparecia. Causa: `FinanceiroConciliacao.tsx` buscava `financial.getAccounts` com `escopo: "categoria"`, que no backend filtra só contas `AUTO-*` (Categorias operacionais), excluindo o Plano de Contas — diferente de Contas a Pagar/Lançamentos, que já buscam sem escopo (Plano + Categorias). Fix: removido o filtro de escopo da query de listagem; mantido só na criação inline de categoria rápida ("+ Nova categoria"). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4065** — **NOTIFICAÇÕES DE CONTABILIDADE: BOTÕES E PERMISSÕES PADRONIZADOS COMO NO MÓDULO DE RH.** Usuário pediu pra padronizar a aba Contabilidade (`Switch` inline simples da Rev. 4064) no padrão mais rico já usado na aba RH (`NotificacoesEmailTab`): cards de resumo, badges coloridas por categoria, botões ícone ToggleRight/ToggleLeft + Settings + Trash2, formulário dedicado de criar/editar. Modelo de permissão evoluiu de 1 flag (`recebeExtrato`) pra 3: `ativo` (liga/desliga o destinatário sem excluir) + `recebeFiscal`/`recebeContabil` (por prazo automático). `normalizeDestinatarioContabilidade()` (client) e `normalizeEmail()` (`contabilidade.ts`) migram dados legados sem perda; job automático (`statusSyncJob.ts`) passa a checar a permissão específica do prazo que disparou o dia. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4064** — **NOTIFICAÇÕES DE CONTABILIDADE: TOGGLE POR DESTINATÁRIO PARA LIGAR/DESLIGAR O ENCAMINHAMENTO DO ARQUIVO POR E-MAIL.** Novo campo `recebeExtrato:boolean` (default true) em cada destinatário de `contabilidade_alertas_config.emails_json`; filtro aplicado no "Enviar Teste", dialog manual e job automático. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4063** — **`/planos`: "14 MÓDULOS DISPONÍVEIS" ERA NÚMERO FIXO — AGORA REFLETE OS MÓDULOS REALMENTE À VENDA.** `SiteVendas.tsx` trocou `"14"` hardcoded por `String(sellableModuleCards.length)`, mesma lista ao vivo de `billing.getCatalog`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4062** — **LOGOTIPO DE CADA MÓDULO NAS TELAS DE VENDA E GESTÃO DE ASSINATURA.** Ícone (`modulesData.ts`) reaproveitado em `AdminPrecos.tsx`, `MinhaAssinatura.tsx`/`ContratarPlano.tsx`, `SaasAdminPanel.tsx`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4061** — **ADMINPRECOS: SALVAR PREÇO FALHAVA COM "This price cannot be archived because it is the default price of its product" (STRIPE).** `adminUpdatePrices` (`billing.ts`) tentava arquivar o Price antigo ANTES de trocar o `default_price` do Product — Stripe recusa. Fix: inverter a ordem. Limpo também 1 Price órfão ativo duplicado deixado pela tentativa anterior. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4060** — **`/planos`: MÓDULO FORA DE VENDA AGORA SOME COMPLETAMENTE DA VITRINE, NÃO SÓ DO PREÇO.** `SiteVendas.tsx`: grid de módulos filtra `MODULES` contra `catalog.modules`; `ModuloDetalhe.tsx`: guard `isSellable` bloqueia acesso direto por URL a módulo desativado. ZERO DELETE · ZERO ALTER destrutivo (só frontend).

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4058 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
