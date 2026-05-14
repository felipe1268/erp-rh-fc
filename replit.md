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

- **Rev. 1794**: **Aviso Prévio · Cards Data de Admissão + Tempo de Empresa**. Pedido do user (screenshot): destacar admissão e tempo de casa logo abaixo do seletor de Colaborador no modal Novo Aviso Prévio. Em `AvisoPrevio.tsx` L1879-1923, novo bloco `grid md:grid-cols-2` condicional a `selectedEmp?.dataAdmissao` com: card azul "Data de Admissão" (Calendar + data pt-BR + dia da semana) e card emerald "Tempo de Empresa" (Clock + anos/meses/dias calculados via aritmética civil + total em dias). Reativo a `form.dataAviso` (recalcula até a data do aviso quando preenchida; senão usa hoje). Pluralização pt-BR. Sem novos imports.
- **Rev. 1793**: **Planejamento · Exportação Excel LOTUS — fix de logos distorcidos (range nativo TwoCellAnchor)**. Pedido do user (com screenshots): "precisa ser idêntico para garantir a cópia exata". Inspecionei via ExcelJS template em uso vs REVTE-PSEM-FC original — 100% IDÊNTICOS (larguras, alturas, merges, pageSetup, ranges de imagem). Causa raiz dos logos distorcidos: `insertLogos` chutava posições com `col: 1.9999`/`8.9999`/`13.9999` (=fim da célula), empurrando logo pra próxima coluna. Fix em `ProgramacaoSemanalLotus.tsx` (handleExportExcel L768-803): captura UMA vez os 3 ranges nativos das imagens originais via `tplWs._media`, clona profundo (`JSON.parse(JSON.stringify(range))`), e re-anexa preservando EMU offsets exatos (`nativeCol/nativeColOff/nativeRow/nativeRowOff`). Validado no sandbox: ranges saem bit-a-bit idênticos ao original. Larguras/alturas nunca foram tocadas (cloneSheetFromTemplate já as preservava + preencherAba só mexe em values/fills/merges).
- **Rev. 1792**: **R-012 · Tela de impressão sem páginas em branco/vazias (CSS print global blindado)**. Pedido do user (screenshot do print do Controle de Documentos): "arrumar a tela de impressão de todo sistema, não quero página branca, vazia... 100%". Em vez de auditar 30+ telas individualmente, ataquei a CAUSA RAIZ no `@media print` global de `client/src/index.css` em 8 blocos numerados: (1) reset `html/body/#root { height:auto; overflow:visible }`, (2) anula `min-h-screen / h-[100dvh] / h-[calc(100vh-…)]`, (3) libera todos `.overflow-*` (`overflow:visible; max-height:none`), (4) esconde overlays Radix (`[data-radix-portal/dialog-overlay/popper]`) salvo `.print-keep`, (5) **modo `.print-only`** via `body:has(.print-only) *:not(.print-only):not(.print-only *):not(:has(.print-only)) { display:none }` (recursivo, preserva ancestrais+descendentes+próprio elemento) — esconde TODO o resto da árvore para imprimir apenas a área marcada (ideal pra modal aberto sem background atrás; portais Radix com `.print-only`/`.print-keep` dentro também são preservados), (6) mantém oculto sidebar/botões/toasts, (7) `last-child { margin/padding-bottom:0 }` impede página em branco trailing, (8) body white+black 11px. **R-012** documentada em `REGRAS_DE_OURO.md` com causa raiz, checklist pré-PR e exemplos.
- **Rev. 1791**: **Planejamento · Exportação Excel cumulativa padrão LOTUS (template-fill com 3 logos do cadastro)**. Pedido do user: o export Excel da Programação Semanal estava genérico — queria IDÊNTICO ao template oficial Lotus (REVTE-PSEM-FC) e CUMULATIVO (uma aba por semana, da 1 até a selecionada). Reescrevi `handleExportExcel` em `ProgramacaoSemanalLotus.tsx` em modo template-fill: carrega `client/public/templates/programacao_semanal_lotus.xlsx` via `wb.xlsx.load`, preserva 100% styling (A4 landscape, fonts, merges, theme colors), helper `cloneSheetFromTemplate` clona aba dentro do mesmo workbook (ExcelJS não tem clone nativo), helper `insertLogos` limpa imagens herdadas e re-anexa 3 logos do cadastro (`empresaLogoUrl`+`clienteLogoUrl`+`gerenciadoraLogoUrl`) nas mesmas posições TwoCellAnchor do template. `empresaLogoUrl` exposto via LEFT JOIN companies em `getProjetoById` (`server/routers/planejamento.ts`). Barras pintadas no esquema 4-linhas-por-tarefa Lotus (r0+1=Previsto azul #4472C4, r0+2=Realizado verde/vermelho/laranja/amarelo) reusando `faixasCelula` para paridade absoluta com a UI. Naming `REVTE-PSEM-FC-AA-MM-DD.xlsx`.
- **Rev. 1790**: **Compras · fix race condition na criação de SC (advisory lock transacional)**. Bug do user (toast '8 tentativas — uq_compras_solicitacoes_numero'). Causa: `MAX(suffix)+1+offset` com 8 retries — N usuários simultâneos liam o mesmo MAX e empatavam todos os offsets em paralelo. Fix: novo `lockEGerarNumeroSc(tx, companyId)` em `server/routers/compras.ts` usa `pg_advisory_xact_lock(871234, (companyId<<16)|(ano-2000))` dentro de transaction antes do MAX+1. Aplicado em `criarSolicitacao` e `duplicarSolicitacao`. Retry reduzido 8→3.
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
11. **R-011 · Indiretas/LoE não compõem o Caminho Crítico** (PMBOK §6.4.2 / DCMA #6).
12. **R-012 · Tela de impressão sem páginas em branco/vazias** — fix global no `@media print` de `index.css`. Para imprimir só conteúdo de modal aberto, envolva com `<div className="print-only">…</div>` (esconde o resto da árvore automaticamente).

**Checklist pré-conclusão** está no fim do `REGRAS_DE_OURO.md` — passar item a item antes de finalizar.

## User preferences

- **Idioma**: português brasileiro em toda comunicação.
- **Publicação**: Autoscale (`pnpm run build` + `node dist/index.js`).
- **Tom de UI**: visual rico, gradientes coloridos por contexto, badges, ícones grandes — evitar telas chapadas.
- **Modais SEMPRE full-screen** (R-001 das Regras de Ouro).
- **Nunca mostrar valores de secrets** em código ou logs.
