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

- **Rev. 1797**: **R-013 · EAP do Orçamento é IMUTÁVEL — Diagnóstico Orçamento↔Cronograma + bloqueio de renumeração**. User (screenshots Avanço Semanal "4.1.1" vs Cronograma "2.5.x" mesma atividade): "garantir que o número do item do orçamento importado seja exatamente o mesmo do cronograma, hoje o ERP esta renumerando". Causa raiz: `ImportarCronograma.tsx:502` tinha fallback `String(i+1)` quando planilha Excel não tinha coluna WBS — gerava 1,2,3 silencioso. Fixes: (1) ImportarCronograma L501-524 BLOQUEIA importação sem coluna WBS com erro citando R-013; (2) novo proc tRPC `diagnosticoEapOrcVsCron` em planejamento.ts L3460-3585 (compara EAPs orçamento vs cronograma, retorna 3 listas + flag descrição divergente); (3) novo `DiagnosticoEapOrcCron.tsx` (modal full-screen R-001 violet, 4 KPIs, 3 abas, busca, CSV); (4) botão violet ao lado do ImportarCronograma em PlanejamentoDetalhe.tsx L3276; (5) **R-013 documentada** em `REGRAS_DE_OURO.md` + checklist.
- **Rev. 1796**: **Avanço Físico Semanal · Legendas (tooltips) em todos os indicadores**. Pedido do user (screenshot): "coloca as legendas de cada indicador para saber o que cada coisa". Em `PlanejamentoDetalhe.tsx`, adicionados tooltips ricos via `title` nativo em 5 indicadores: cards **Previsto (semana)** L5896, **Realizado (acum.)** L5906, **Variação (Real−Prev.)** L5916 (cada um com explicação do que é + como é calculado + para que serve, com valores numéricos atuais na fórmula da Variação) — ícone `Info` discreto no canto + cursor-help; e na linha azul: **Aderência** L6130 (fórmula SPI% PMBOK + faixas de cor) e **X atividades diretas** L6136. Sem novos imports.
- **Rev. 1795**: **Compras · fix DEFINITIVO race condition de SC — extensão do advisory lock para EPIs e Frotas (+ correções do code review)**. Bug do user (toast '3 tentativas — uq_compras_solicitacoes_numero' MESMO depois da Rev. 1790). Causa raiz: a Rev. 1790 só colocou lock em `criarSolicitacao`/`duplicarSolicitacao`, mas havia 3 outros pontos inserindo direto em `compras_solicitacoes` SEM lock usando `COUNT(*)+1`: `epis.ts:501` (reposição auto), `epis.ts:1945` (gerar SC EPIs em lote), `frotas.ts:4520` (manutenção→SC). Fix: `lockEGerarNumeroSc` exportado de `compras.ts`; os 3 pontos envolvem INSERT em `db.transaction(tx => { numeroSc = await lockEGerarNumeroSc(tx, companyId); tx.insert(...) })`. **Correções pós code-review**: (a) bug de escopo `numeroSc` resolvido retornando `row` completo do callback; (b) INSERTs de `comprasSolicitacoesItens` movidos pra dentro da mesma transaction (sem SC órfã); (c) em `frotas.ts`, `SELECT FOR UPDATE` em `fleet_maintenances` + recheck `sc_id` + `UPDATE sc_id` tudo dentro da tx (impede double-create do vínculo).
- **Rev. 1794**: **Aviso Prévio · Cards Data de Admissão + Tempo de Empresa**. Pedido do user (screenshot): destacar admissão e tempo de casa logo abaixo do seletor de Colaborador no modal Novo Aviso Prévio. Em `AvisoPrevio.tsx` L1879-1923, novo bloco `grid md:grid-cols-2` condicional a `selectedEmp?.dataAdmissao` com: card azul "Data de Admissão" (Calendar + data pt-BR + dia da semana) e card emerald "Tempo de Empresa" (Clock + anos/meses/dias calculados via aritmética civil + total em dias). Reativo a `form.dataAviso` (recalcula até a data do aviso quando preenchida; senão usa hoje). Pluralização pt-BR. Sem novos imports.
- **Rev. 1793**: **Planejamento · Exportação Excel LOTUS — fix de logos distorcidos (range nativo TwoCellAnchor)**. Pedido do user (com screenshots): "precisa ser idêntico para garantir a cópia exata". Inspecionei via ExcelJS template em uso vs REVTE-PSEM-FC original — 100% IDÊNTICOS (larguras, alturas, merges, pageSetup, ranges de imagem). Causa raiz dos logos distorcidos: `insertLogos` chutava posições com `col: 1.9999`/`8.9999`/`13.9999` (=fim da célula), empurrando logo pra próxima coluna. Fix em `ProgramacaoSemanalLotus.tsx` (handleExportExcel L768-803): captura UMA vez os 3 ranges nativos das imagens originais via `tplWs._media`, clona profundo (`JSON.parse(JSON.stringify(range))`), e re-anexa preservando EMU offsets exatos (`nativeCol/nativeColOff/nativeRow/nativeRowOff`). Larguras/alturas nunca foram tocadas.

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
