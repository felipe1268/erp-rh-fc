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

- **Rev. 1801**: **Padronização "Item" (era "EAP") + auto-sincronização de CÓDIGOS Orçamento↔Cronograma (R-013 reforçada)**. User (screenshots 14/05/2026): item "Tapume autoportante..." aparecia como `03.02.10` no Orçamento (coluna "Item") e como `3.1.0.1` no Planejamento (coluna "EAP") — terminologia confusa + códigos divergentes em base existente importada antes da Rev. 1797. **Parte A (UI)**: 24 lugares trocados em 8 arquivos do client — coluna `EAP` → `Item` em `PlanejamentoDetalhe.tsx` (cronograma, avanço semanal, gantt), `ProgramacaoSemanal.tsx` (3 headers), `ImportarCronograma.tsx` (Item/WBS), `DiagnosticoEapOrcCron.tsx` (header + título do modal), `MedicaoDetalhe.tsx` (placeholder + 3 headers), `Databook.tsx`, `ContratoDetalhe.tsx` (5 lugares incl. botão "Vincular Item"), `PortalPlanejamentoCliente.tsx` (4 lugares). Mantidos: nomes de variáveis (`eapCodigo`), comentários técnicos, textos didáticos longos. **Parte B (cascade)**: nova mutation `autoSincronizarCodigosEapComOrcamento` em planejamento.ts L3796 — espelho da Rev. 1798. Match estrito por **descrição normalizada UNIQUE** em ambos os lados (se duplicada, marca ambígua e PULA). Cascade em transaction: `planejamento_atividades.eap_codigo` + `predecessora` (parse `;,` e remap tokens preservando lag FS+5d) + `medicao_boletim_itens.eap_codigo` (FK atividadeId) + `smo_atividades_eap` (FK atividadeId) + `terceiro_contrato_itens` (FK planejamentoAtividadeId). Auto-disparada quando o user abre o Diagnóstico se houver itens "só no cronograma" ou "só no orçamento". Banner violet mostra resumo (X códigos + Y predecessoras + Z dependentes + N ambíguos). Idempotente.
- **Rev. 1800**: **Programação Semanal · fix "Converting circular structure to JSON" ao exportar Excel**. User (screenshot 14/05/2026): toast vermelho "Erro ao exportar Excel — Converting circular structure to JSON --> object with constructor 'Lexports' | property '_workbook' --> object with constructor 'Lexports' | property 'worksheets' --> Array --- index 57 closes the circle". Causa raiz em `ProgramacaoSemanalLotus.tsx`: `JSON.parse(JSON.stringify(...))` aplicado em objetos do ExcelJS (instâncias de `Anchor` em `_media[].range` e ocasionalmente `cell.style` com `border.diagonal`/`fill.gradients`) que mantêm refs internas ao Workbook (`_workbook` → `worksheets[N]` → si mesmo). Fix: 3 helpers de clone seguro `safeCloneAnchor`/`safeCloneRange`/`safeCloneStyle` que extraem APENAS os campos conhecidos (DTO puro) — `safeCloneStyle` tenta JSON.stringify dentro de try/catch e cai em pick explícito se falhar. 5 sites trocados (clone do template, captura dos 3 RANGE_*, addImage, spliceRows snapshot/aplicação).
- **Rev. 1799**: **R-014 · Geração de numero_sc 100% atômica via counter table — fim definitivo das race conditions de SC**. User (screenshot recorrente "Não foi possível criar a SC após 3 tentativas — uq_compras_solicitacoes_numero"). Logs prod 14/05/2026 mostraram 3 retries computando MESMO `SC-2026-0010` para company 60002 — advisory lock da Rev.1795 ainda permitia race por release/reacquire entre tentativas + MVCC stale. **Fix definitivo**: nova tabela `compras_sc_counters(company_id, ano, ultimo_seq) PK(company_id, ano)` criada/semeada via ColFix em `_core/index.ts` L553 (`ON CONFLICT DO UPDATE SET ultimo_seq = GREATEST(...)` — não regride). Nova função `gerarProximoNumeroScAtomico(tx, companyId)` em compras.ts L878 faz UM ÚNICO statement `INSERT ... ON CONFLICT DO UPDATE ultimo_seq+1 RETURNING` — Postgres garante atomicidade no row-level lock, colisão impossível. `criarSolicitacao` e `duplicarSolicitacao` agora **sem retry, sem advisory lock**. `lockEGerarNumeroSc` virou alias (compat com epis/frotas). **R-014 documentada** em `REGRAS_DE_OURO.md` proibindo MAX+1/COUNT+1 para todo número sequencial multitenancy.
- **Rev. 1797**: **R-013 · EAP do Orçamento é IMUTÁVEL — Diagnóstico Orçamento↔Cronograma + bloqueio de renumeração**. User (screenshots Avanço Semanal "4.1.1" vs Cronograma "2.5.x" mesma atividade): "garantir que o número do item do orçamento importado seja exatamente o mesmo do cronograma, hoje o ERP esta renumerando". Causa raiz: `ImportarCronograma.tsx:502` tinha fallback `String(i+1)` quando planilha Excel não tinha coluna WBS — gerava 1,2,3 silencioso. Fixes: (1) ImportarCronograma L501-524 BLOQUEIA importação sem coluna WBS com erro citando R-013; (2) novo proc tRPC `diagnosticoEapOrcVsCron` em planejamento.ts L3460-3585 (compara EAPs orçamento vs cronograma, retorna 3 listas + flag descrição divergente); (3) novo `DiagnosticoEapOrcCron.tsx` (modal full-screen R-001 violet, 4 KPIs, 3 abas, busca, CSV); (4) botão violet ao lado do ImportarCronograma em PlanejamentoDetalhe.tsx L3276; (5) **R-013 documentada** em `REGRAS_DE_OURO.md` + checklist.

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
