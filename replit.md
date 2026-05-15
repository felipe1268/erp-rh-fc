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

- **Rev. 1819**: **Planejamento · LOTUS — reversão do fallback de duração no `metricas`; PADRÃO ÚNICO via `pesoFinanceiro`**. User: "todas obras tem peso, não podemos ter formas diferentes, padrão é tudo, verifique quais obras estão sem peso" + "valores dos contratos devem ser validado no módulo orçamento". Decisão arquitetural: UM padrão de cálculo — EVM clássico ponderado por `pesoFinanceiro`, FONTE ÚNICA = `orcamento_itens.custoTotal` agregado por `eapCodigo` via procedure `recalcularPesosFinanceiros` (server/routers/planejamento.ts L5614). NÃO usar valor de contrato (quebraria EVM, PMI §5.2). Reverti em `ProgramacaoSemanalLotus.tsx` memo `metricas` (L437-540) a hierarquia custo→duração→uniforme que eu havia introduzido por engano — voltou para `metaPct = peso × (duJanela / duEnvelope)` puro. Mantido try/catch da Rev. 1816. **Auditoria PROD (executeSql SELECT-only)**: HOTEL DO PAPA (4) 0/449 com peso (orçamento 15 VAZIO, 0 itens); CHLORUM PALMEIRA (6) 0/187 (orçamento 17 cheio: 292 itens, R$ 2,97 mi); HOTEL QIU 2 - 4ª FASE (7) 1/1512 (orçamento 18 cheio: 1.875 itens, R$ 31,88 mi). CHLORUM e QIU 2 têm orçamento mas a procedure nunca foi disparada pós-cadastro. **Ação requerida**: usuário deve abrir Planejamento → Detalhe e clicar "Recalcular pesos" em cada (executeSql production é READ-ONLY na plataforma). HOTEL DO PAPA precisa importar orçamento primeiro. Zero schema, zero DELETE, zero dado PROD tocado. R-007 OK.
- **Rev. 1818**: **Planejamento · Responsável — ignora nome do engenheiro herdado do MS Project; default vira FC**. User (15/05/2026, com screenshot QIU 2 mostrando "CAIO AUGUSTO" em toda a coluna RESPONSÁVEL): "Ainda, não alterou o responsável tá aparecendo como Caio, nao era para aparecer o nome da construtora se não tiver OS APROVADA?". Causa-raiz: import MS Project legado populou `responsavel_lotus` com nome do engenheiro da FC (Texto1/Texto5 do MSP, lido de `obras.responsavel`); Rev. 1817 tratava como override manual → vencia o fallback FC. Decisão alinhada (2 perguntas): (a) ignorar valor legado MSP — default vira "FC ENGENHARIA"; (b) manter regra de contrato `status='ativo'` + item vinculado pra mostrar empresa terceira (sem exigir medição aprovada). Fix: (1) `resolverResponsaveisBatch` busca o engenheiro do projeto (LEFT JOIN `planejamento_projetos → obras`) e ignora `responsavelLotus` que case com ele OU com "FC"/"FC ENGENHARIA" (case/trim-insensitive); (2) LOTUS — input usa `responsavel?.labelCurto` no defaultValue/placeholder em vez do raw `responsavelLotus`; `onBlur` aceita 4 padrões pra reverter ao automático. Sem schema, sem DELETE — legado preservado, reversível trocando 1 condição. R-007 OK.
- **Rev. 1817**: **Planejamento · Programação Semanal — Responsável AUTOMÁTICO (override → contrato terceiro vinculado → FC)**. User (15/05/2026, após várias rodadas de plano): "Vamos por partes, não elimine o padrão da FC...vamos focar no plano de vincular o responsável primeiro depois vamos madurecendo... Pode, garanta q não vai pagar nenhum dado". Implementação literária e mínima invasão: (a) `server/_shared/responsavelAtividade.ts` NOVO — tipos `ResponsavelInfo`, helper `truncarNomeEmpresa` (remove LTDA/EIRELI/ME/EPP/S/A, 2 palavras significativas, máx 22 chars), e `resolverResponsaveisBatch` em 1 query única (sem N+1) usando o vínculo CANÔNICO `terceiro_contrato_itens.planejamentoAtividadeId` (achado de ouro — sem heurística por EAP). (b) `server/routers/planejamento.ts` — `listarAtividades` enriquecido com campo `responsavel`; nova procedure `kpiResponsavelPorProjeto` (chave/label/labelCurto/count/pesoPct, ordenado por peso desc com FC último); `setRealDates` estendido com `isExterna` + `externaResponsavel`. (c) `<ResponsavelCell />` + `<ResponsavelOverridePopover />` em arquivo novo (texto preto puro, sem badges; popover 3 modos Auto/Manual/Externa). (d) LOTUS — ZERO mudança visual (decisão do usuário); só o `defaultValue` do input passa a usar `labelCurto` resolvido; `onBlur` reconhece todos os "defaults" e persiste null pra voltar ao automático. (e) Padrão FC — coluna RESPONSÁVEL nova depois de Status (sem mexer colSpan), KPI compacto + filtro multi-select de chips antes da tabela (só renderiza se `kpiResp.length > 1`). Filtro em memória (`Set<string>`), zera ao trocar de obra. Garantias: zero schema/coluna/migration/DELETE; reaproveita campos existentes; `readOnly={portalMode}` no cell. R-007 OK.
- **Rev. 1816**: **Planejamento · LOTUS — blindagem total contra crash de useMemo + normalização robusta de datas em `pvPonderadoPorAtividade`**. User (15/05/2026, 2 screenshots da tela "Ocorreu um erro inesperado." em iPad Safari): "Resolve de vez isso". Stack: `mountMemo → useMemo → ProgramacaoSemanalLotus` — algum useMemo lançava exceção no primeiro mount derrubando a tela ao ErrorBoundary genérico. Mensagem real cortada na captura. **Causa-raiz suspeita**: Rev. 1815 fazia `a.dataInicio + "T12:00:00"` direto; se Neon/Drizzle devolvesse ISO completo ("2026-05-15T00:00:00.000Z") em algum path, a concatenação virava string inválida, NaN propagava, e em qualquer das 1512 atividades do QIU 2 algum useMemo dependente lançava (analiseSemana faz `new Date(projectEndStr+"T12:00:00")`, linhas faz `eap.split(".")`, metricas itera com parseFloat). **Fix em 2 camadas**: (1) `pvPonderadoPorAtividade` (shared/diasUteis.ts): helper interna `isoDay(v)` normaliza qualquer entrada (YYYY-MM-DD, ISO+hora, Date, etc) via `match(/^(\d{4})-(\d{2})-(\d{2})/)` — usada em filter inicial, `durOf`, refStr e loop principal; `fracaoDecorridaMs` chamado dentro de try/catch retornando 0; `custoOf`/`durOf` blindados com `Number.isFinite`; função NUNCA mais lança. (2) `ProgramacaoSemanalLotus.tsx`: try/catch defensivo nos 4 useMemos pesados (`linhas`, `metricas`, `analiseSemana`, `totaisSemana`) com fallback para shape vazio + log `[Lotus.<memo>] memo falhou`. Defesa em profundidade — qualquer edge-case nas 1512 atividades do QIU 2 não derruba mais a tela. R-007 OK, sem schema, sem deps, sem UI nova.
- **Rev. 1815**: **Planejamento · PREVISTO físico — fix definitivo da saturação em 100% por COBERTURA PARCIAL de peso financeiro (QIU 2 - FASE 4 e similares)**. User (15/05/2026, com screenshot QIU 2 Rev. 01 ATIVA topo 100,00% Previsto / 0,00% Realizado / 0/1506 atividades / cutoff 08/05/2026 / 14 REFIs / 200d restantes): "QIU continua errado a obra não pode tá 100% siga a mesma lógica do hotel do papa". Investigação interativa (2 perguntas, sem criar UI R-017) confirmou: (a) só existe Rev. 01 (descarta bug de seleção); (b) cronograma tem atividade até 10/12/2026 (descarta cronograma vencido). Causa-raiz (regressão Rev. 1812): `pvPonderadoPorAtividade` (shared/diasUteis.ts) usava `usarDur = somaCusto===0` — bastava UMA folha com peso>0 pra ativar EVM clássico. Em QIU 2 pós-import parcial de orçamento, ~poucas folhas passadas ganharam peso e as 1505 futuras ficaram com peso=0 → soma virava `(peso_passada×100%)/peso_passada = 100%` (folhas futuras invisíveis). HOTEL DO PAPA tem cobertura 100% então não cai nisso. **Fix (PMI EVM Practice Standard §5.2 / Mattos §7.4 / Vargas §10.3)**: nova hierarquia exigindo cobertura COMPLETA pra EV clássico. (1º) explícito por duração; (2º) `every(folha => peso>0)` → custo (HOTEL DO PAPA, inalterado); (3º) duração — `durOf` robusta (preferre `duracaoDias`, deriva de `(fim-ini)+1` se faltar) com TODAS as folhas (passadas E futuras) entrando com peso>0; (4º) uniforme. Propagação automática via FONTE ÚNICA pra top bar + 5 useMemos AvancoSemanal + 4 useMemos REFIS + Lotus. QIU 2 sai de 100% saturado pra curva S real ponderada por dias do cronograma. Sem schema, sem deps, sem UI nova.


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
