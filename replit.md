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

- **Rev. 1788**: **Portal Cliente · KPI "Desvio" pinta valor em vermelho quando negativo (atraso)**. Pedido do user na Curva S: o '-0,05%' do card DESVIO ficava em slate-900 neutro mesmo com bg vermelho-suave e ícone AlertTriangle vermelho — atraso passava despercebido. `KpiCard` em `PortalPlanejamentoCliente.tsx` ganha props `valueClassName` e `subClassName`; chamada do Desvio passa `text-red-600` quando `desvio<0`, `text-emerald-600` quando `>0`. Demais cards mantêm slate-900 default.
- **Rev. 1787**: **Programação Semanal LOTUS · fix "Sem meta" em semanas futuras (cutoff só vale na semana corrente)**. Bug do user (Portal Cliente, semana 3+ todas com "Sem meta"): em `ProgramacaoSemanalLotus.tsx` L426 o `cutoffStr = min(hoje, semFim)` cravava cutoff=hoje em TODA semana — semanas futuras ficavam com `janIni > janFim` → `metaPct=0`. Corrigido: cutoff só usa hoje se a semana CONTEM hoje (semana corrente); senão usa semFim cheio (look-ahead Lean / PPC fechado). Bug existia desde Rev 593494e2 (12/05).
- **Rev. 1786**: **Planejamento · LoE/Indiretas excluídas do Caminho Crítico (PMBOK §6.4.2 / DCMA #6) + sugestão no import**. Antes Administração de Obra (90%+ duração) era pintada CRÍTICA vermelha a obra toda — ansiedade falsa. Agora 4 locais filtram `!isIndireta && !isExterna` do CPM (`ProgramacaoSemanal.tsx`, `ProgramacaoSemanalLotus.tsx`, `PlanejamentoDetalhe.tsx` x2). Novo badge slate `INDIRETA (LoE)` em vez de CRÍTICA. `ImportarCronograma.tsx` ganha heurística: cobertura ≥90% pré-marca checkbox para usuário confirmar. Reusa `isIndireta` boolean já em schema. Nova **R-011** em `REGRAS_DE_OURO.md`.
- **Rev. 1785**: **Programação Semanal LOTUS · vermelho só em semanas fechadas (Last Planner / PPC)**. Antes a regra `passou = dia ≤ hoje` pintava ter/qua vermelho na meio da semana em curso, gerando ansiedade visual antes do cutoff. Agora `passou = dia < início da semana corrente` — semana atual fica toda azul até fechar (alinhado a Last Planner System: PPC só é avaliado no fechamento). Mudança em `ProgramacaoSemanalLotus.tsx` `faixasCelula()` + novo memo `inicioSemanaCorrente`. Comportamento antigo preservado se semanas não contém hoje.
- **Rev. 1784**: **Portal Cliente · modal "Liberar módulos & abas" full-screen (R-001 + R-002)**. Antes era 512px chapado com lista vertical. Agora full-screen com header gradient indigo→violet→purple, badge do cliente no header, KPI strip (3 cards: usuários ativos / abas liberadas total / sem nenhuma aba), grid responsivo 1/2/3 colunas com avatar circular gradiente + iniciais, badges de status (verde se tem abas, âmbar "sem acesso" se zero), hover/focus-ring, chevron lateral. Vazio mostra empty state com ícone Users e mensagem.
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
