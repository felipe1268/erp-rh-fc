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

- **Rev. 1821**: **Planejamento · EAP — match CANÔNICO orçamento ↔ cronograma (sem zero à esquerda) corrige "Sem meta" em massa**. User (16/05/2026, com screenshots HOTEL DO PAPA): "ERP está renumerando atividades, gera desconexão com o orçamento... seria apagar os cronogramas e refazer? Preciso ser certeiro". Diagnóstico: NÃO era renumeração — `salvarAtividades` grava `eap_codigo` LITERAL. Era DIVERGÊNCIA DE FORMATO: orçamento Excel `02.16.02.01` (zero-padded) vs cronograma MSP `2.16.2.1` (WBS sem zero) → comparação string falhava em `recalcularPesos.ts` L88/L94 e `diagnosticoEapOrcVsCron` L3771/L3775 → peso=0 → "Sem meta". Auditoria PROD: HOTEL DO PAPA 0/449, CHLORUM 0/187, QIU 2 1/1512. Decisão alinhada (interview): match ON-THE-FLY sem persistir, sem schema, sem coluna nova. Implementação: (1) `server/_shared/normalizarEap.ts` NOVO — função pura `eapCanonico(s)` remove zero à esquerda de cada segmento (`02.16.02.01`→`2.16.2.1`), idempotente. (2) `recalcularPesos.ts` — 4 substituições de `.trim()` por `eapCanonico()` no custoMap + rateio item 4. FONTE ÚNICA preservada (Rev. 1820); 3 hooks defensivos herdam o fix. (3) `diagnosticoEapOrcVsCron` (L3704) — chaves dos Maps viram canônicas, mas EAP exibido na UI permanece o LITERAL (formato original do contrato). (4) Considerei criar procedure+UI nova de diagnóstico, REJEITEI antes de shipar — `<DiagnosticoEapOrcCron />` existente já cobre (R-017). Por que NÃO apagar e refazer: 1.512 atividades QIU 2 inviável; apagaria histórico de avanços; bug REAPARECE no próximo import sem o fix de código. Reversível em 1 linha. Zero schema/migration/DELETE; `eap_codigo` no banco INTACTO. Auto-sync existente (`autoSincronizarCodigosEapComOrcamento`) agora só dispara em divergência REAL de descrição.
- **Rev. 1820**: **Pesos financeiros — RATEIO por duração entre folhas da mesma EAP (item 4) + RECÁLCULO AUTOMÁTICO na importação de cronograma E orçamento (item 10)**. User: "arrume o 4 e deixa o 10 automático" + "Na hora da importação" + "Já deve calcular o peso". (1) **Item 4**: procedure `recalcularPesosFinanceiros` replicava peso integral da EAP em cada folha que a compartilhava (4 folhas de "Estrutura 1.2" ganhavam 80% cada → Σ=320%). Fix: agrupa folhas por EAP, calcula `pesoEapPct = (custo_EAP / Σcusto)×100` e RATEIA proporcional a `duracaoDias` (fallback: uniforme 1/N). Σ final = 100% (PMI EVM PS §3.2, ANSI EIA-748 §2.b, PMBOK §6.4.2 apportioned effort). (2) **Item 10**: criado `server/_shared/recalcularPesos.ts` com `recalcularPesosCore` (FONTE ÚNICA) e `recalcularPesosByOrcamento` (recalcula última revisão de TODOS os projetos vinculados). 3 hooks defensivos (try/catch, nunca bloqueiam): `planejamento.salvarAtividades` (L1396 — import MSP/save manual), `orcamento.importar` (L2098 — após inserir itens), `orcamento.reimportar` (L2510 — após substituir itens). Procedure `recalcularPesosFinanceiros` virou wrapper de 3 linhas. Sem schema, sem DELETE, R-007 OK, contrato tRPC inalterado.
- **Rev. 1819**: **Planejamento · LOTUS — reversão do fallback de duração no `metricas`; PADRÃO ÚNICO via `pesoFinanceiro`**. User: "todas obras tem peso, não podemos ter formas diferentes, padrão é tudo, verifique quais obras estão sem peso" + "valores dos contratos devem ser validado no módulo orçamento". Decisão arquitetural: UM padrão de cálculo — EVM clássico ponderado por `pesoFinanceiro`, FONTE ÚNICA = `orcamento_itens.custoTotal` agregado por `eapCodigo` via procedure `recalcularPesosFinanceiros` (server/routers/planejamento.ts L5614). NÃO usar valor de contrato (quebraria EVM, PMI §5.2). Reverti em `ProgramacaoSemanalLotus.tsx` memo `metricas` (L437-540) a hierarquia custo→duração→uniforme que eu havia introduzido por engano — voltou para `metaPct = peso × (duJanela / duEnvelope)` puro. Mantido try/catch da Rev. 1816. **Auditoria PROD (executeSql SELECT-only)**: HOTEL DO PAPA (4) 0/449 com peso (orçamento 15 VAZIO, 0 itens); CHLORUM PALMEIRA (6) 0/187 (orçamento 17 cheio: 292 itens, R$ 2,97 mi); HOTEL QIU 2 - 4ª FASE (7) 1/1512 (orçamento 18 cheio: 1.875 itens, R$ 31,88 mi). CHLORUM e QIU 2 têm orçamento mas a procedure nunca foi disparada pós-cadastro. **Ação requerida**: usuário deve abrir Planejamento → Detalhe e clicar "Recalcular pesos" em cada (executeSql production é READ-ONLY na plataforma). HOTEL DO PAPA precisa importar orçamento primeiro. Zero schema, zero DELETE, zero dado PROD tocado. R-007 OK.
- **Rev. 1818**: **Planejamento · Responsável — ignora nome do engenheiro herdado do MS Project; default vira FC**. User (15/05/2026, com screenshot QIU 2 mostrando "CAIO AUGUSTO" em toda a coluna RESPONSÁVEL): "Ainda, não alterou o responsável tá aparecendo como Caio, nao era para aparecer o nome da construtora se não tiver OS APROVADA?". Causa-raiz: import MS Project legado populou `responsavel_lotus` com nome do engenheiro da FC (Texto1/Texto5 do MSP, lido de `obras.responsavel`); Rev. 1817 tratava como override manual → vencia o fallback FC. Decisão alinhada (2 perguntas): (a) ignorar valor legado MSP — default vira "FC ENGENHARIA"; (b) manter regra de contrato `status='ativo'` + item vinculado pra mostrar empresa terceira (sem exigir medição aprovada). Fix: (1) `resolverResponsaveisBatch` busca o engenheiro do projeto (LEFT JOIN `planejamento_projetos → obras`) e ignora `responsavelLotus` que case com ele OU com "FC"/"FC ENGENHARIA" (case/trim-insensitive); (2) LOTUS — input usa `responsavel?.labelCurto` no defaultValue/placeholder em vez do raw `responsavelLotus`; `onBlur` aceita 4 padrões pra reverter ao automático. Sem schema, sem DELETE — legado preservado, reversível trocando 1 condição. R-007 OK.
- **Rev. 1817**: **Planejamento · Programação Semanal — Responsável AUTOMÁTICO (override → contrato terceiro vinculado → FC)**. User (15/05/2026, após várias rodadas de plano): "Vamos por partes, não elimine o padrão da FC...vamos focar no plano de vincular o responsável primeiro depois vamos madurecendo... Pode, garanta q não vai pagar nenhum dado". Implementação literária e mínima invasão: (a) `server/_shared/responsavelAtividade.ts` NOVO — tipos `ResponsavelInfo`, helper `truncarNomeEmpresa` (remove LTDA/EIRELI/ME/EPP/S/A, 2 palavras significativas, máx 22 chars), e `resolverResponsaveisBatch` em 1 query única (sem N+1) usando o vínculo CANÔNICO `terceiro_contrato_itens.planejamentoAtividadeId` (achado de ouro — sem heurística por EAP). (b) `server/routers/planejamento.ts` — `listarAtividades` enriquecido com campo `responsavel`; nova procedure `kpiResponsavelPorProjeto` (chave/label/labelCurto/count/pesoPct, ordenado por peso desc com FC último); `setRealDates` estendido com `isExterna` + `externaResponsavel`. (c) `<ResponsavelCell />` + `<ResponsavelOverridePopover />` em arquivo novo (texto preto puro, sem badges; popover 3 modos Auto/Manual/Externa). (d) LOTUS — ZERO mudança visual (decisão do usuário); só o `defaultValue` do input passa a usar `labelCurto` resolvido; `onBlur` reconhece todos os "defaults" e persiste null pra voltar ao automático. (e) Padrão FC — coluna RESPONSÁVEL nova depois de Status (sem mexer colSpan), KPI compacto + filtro multi-select de chips antes da tabela (só renderiza se `kpiResp.length > 1`). Filtro em memória (`Set<string>`), zera ao trocar de obra. Garantias: zero schema/coluna/migration/DELETE; reaproveita campos existentes; `readOnly={portalMode}` no cell. R-007 OK.


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
- **Sempre citar o NOME do projeto** ao falar de algum projeto de planejamento (não usar só o id). Ex.: "projeto 29 (QIU 2 - FASE 4)" e não só "projeto 29". Se não souber o nome, falar isso explicitamente em vez de omitir.
