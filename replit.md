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
- `server/`: Express backend + tRPC routers
  - `server/_core/`: Auth, OAuth, Vite setup, env config
  - `server/routers/`: tRPC routers per módulo
  - `server/db.ts`: Database helpers
- `drizzle/`: Schema and migrations
- `shared/`: Shared types and constants (`shared/version.ts`, `shared/changelog.ts`, `shared/paymentConditions.ts`, `shared/modules.ts`)
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: tRPC routers in `server/routers/`
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui` components

## Recent changes

> **Convenção (importante)**: este arquivo guarda APENAS as últimas **5 revisões**, em formato curto (1–3 linhas: o quê + por quê).
> Quando entrar uma nova revisão, **remova a mais antiga daqui** — o histórico completo (com causa-raiz, stack traces, nomes de arquivos, etc.) vive em `shared/changelog.ts`.
> Não duplique conteúdo entre os dois arquivos.

- **Rev. 1783**: **Planejamento · botão "Desconsolidar Cutoff" (admin only)**. Antes a premissa de cutoff era one-way lock e admin precisava editar SQL pra corrigir. Nova procedure `desconsolidarCutoff` em `planejamento.ts` (exige role admin/admin_master + motivo ≥5 chars + audit log com snapshot do estado anterior). Frontend `PlanejamentoDetalhe.tsx`: ao lado do badge "🔒 Consolidado" aparece botão "🔓 Desconsolidar" só pra admin, com `window.prompt` pedindo motivo.
- **Rev. 1782**: **Compras · diagnóstico melhorado no loop de retry de número de SC**. Erro do user "Falha ao gerar número único de SC após 8 tentativas" não dizia QUAL constraint estourava — o `continue` silencioso mascarava. Agora cada tentativa duplicada loga `console.warn` com `code/constraint/detail` e a mensagem final ao usuário cita a constraint exata + código pg. Aplicado em `criarSolicitacao` E `duplicarSolicitacao`. Sem schema change.
- **Rev. 1781**: **Regras de Ouro · arquivo permanente `REGRAS_DE_OURO.md` + fix full-screen no modal do Cartão de Ponto**. Pedido do user (screenshot modal pequeno %HE Cartão de Ponto): "grave uma regra de ouro, todas as telas novas e antigas devem ter layout moderno, intuitivo, full-screen". Criado `REGRAS_DE_OURO.md` na raiz com 10 regras (R-001…R-010) + checklist obrigatório. `replit.md` ganha seção destacada referenciando o arquivo. Aplicado fix R-001 no `IndicadorDetalheModal` inline do `DashCartaoPonto.tsx` (`resizable={false}` + `showCloseButton={false}` + `w-[100vw] sm:w-[98vw] h-[100dvh] sm:h-[96dvh]`) — antes estava em 512px por causa do style inline da shadcn DialogContent.
- **Rev. 1780**: **Cartão de Ponto · Modal lista funcionários ("meliantes") por mês em todos os 9 indicadores**. Backend `getDashCartaoPonto` ganha `topPorIndicador` no `resumo` (top 10 por chave: horasTrab/horasExtras/percHE/comReg via helper buildTopGenerico, faltas/atrasos via rankings existentes, ativos top 30, semReg/cobertura = ativos sem batida). Frontend modal: nova `<Card>` 'Funcionários por mês — {label}' entre Detalhamento e Insights, com cards rankeados (#1 âmbar/#2 cinza/#3 laranja), línea-through em desligados, valor formatado por chave. Sem schema change.
- **Rev. 1779**: **Dashboards · TabelaComparativaAnual em 6 dashboards** (HorasExtras, Folha, Funcionários, AvisoPrévio, Férias, Apontamentos). Componente reutilizável `client/src/components/TabelaComparativaAnual.tsx` (extraído da Rev.1778) + 6 procedures `*Comparativo` em `dashboards.ts` (loops reusam HE/Folha; SQL fresca com `generate_series` para Funcionários/Aviso/Férias/Apontamentos). Cada dashboard tem 4-6 indicadores com benchmarks (CBIC, CLT, eSocial) e 2-4 ações recomendadas por indicador. Sem schema change.
## 🏆 Regras de Ouro (LER OBRIGATORIAMENTE)

**Antes de criar ou editar QUALQUER tela, modal, dashboard ou componente visual, consulte `REGRAS_DE_OURO.md` na raiz do projeto.**

Resumo das 10 regras (detalhes + checklist em `REGRAS_DE_OURO.md`):

1. **R-001 · Modais full-screen** — `w-[100vw] h-[100dvh]` mobile / `w-[98vw] h-[96dvh]` desktop, **SEMPRE** com `resizable={false}` no DialogContent (senão o style inline da shadcn força 512px).
2. **R-002 · Visual rico** — gradient header, ícones grandes, badges, KPI cards. Nunca telas chapadas.
3. **R-003 · Tailwind JIT-safe** — cores via `Record<string, ...>`, nunca template literals.
4. **R-004 · Responsividade** — tabela vira cards no mobile, testar no iPad (768-1024px).
5. **R-005 · Acessibilidade** — `tabIndex`, `role`, `aria-label`, focus-visible:ring.
6. **R-006 · pt-BR** — toda comunicação em português brasileiro.
7. **R-007 · Imports lucide-react** — UM ÚNICO import por arquivo (Babel barra duplicates).
8. **R-008 · Versionamento** — bump `version.ts` + entry completa em `changelog.ts` + 5 últimas em `replit.md`.
9. **R-009 · Secrets** — nunca logar/exibir valores de env vars sensíveis.
10. **R-010 · SQL Drizzle** — aspas duplas em camelCase no WHERE, sempre filtrar `deleted_at IS NULL` + `companyId`.

**Checklist pré-conclusão** está no fim do `REGRAS_DE_OURO.md` — passar item a item antes de finalizar.

## User preferences

- **Idioma**: português brasileiro em toda comunicação.
- **Publicação**: Autoscale (`pnpm run build` + `node dist/index.js`).
- **Tom de UI**: visual rico, gradientes coloridos por contexto, badges, ícones grandes — evitar telas chapadas.
- **Modais SEMPRE full-screen** (R-001 das Regras de Ouro).
- **Nunca mostrar valores de secrets** em código ou logs.
