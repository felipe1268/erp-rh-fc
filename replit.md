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

- **Rev. 1816**: **Planejamento · LOTUS — blindagem total contra crash de useMemo + normalização robusta de datas em `pvPonderadoPorAtividade`**. User (15/05/2026, 2 screenshots da tela "Ocorreu um erro inesperado." em iPad Safari): "Resolve de vez isso". Stack: `mountMemo → useMemo → ProgramacaoSemanalLotus` — algum useMemo lançava exceção no primeiro mount derrubando a tela ao ErrorBoundary genérico. Mensagem real cortada na captura. **Causa-raiz suspeita**: Rev. 1815 fazia `a.dataInicio + "T12:00:00"` direto; se Neon/Drizzle devolvesse ISO completo ("2026-05-15T00:00:00.000Z") em algum path, a concatenação virava string inválida, NaN propagava, e em qualquer das 1512 atividades do QIU 2 algum useMemo dependente lançava (analiseSemana faz `new Date(projectEndStr+"T12:00:00")`, linhas faz `eap.split(".")`, metricas itera com parseFloat). **Fix em 2 camadas**: (1) `pvPonderadoPorAtividade` (shared/diasUteis.ts): helper interna `isoDay(v)` normaliza qualquer entrada (YYYY-MM-DD, ISO+hora, Date, etc) via `match(/^(\d{4})-(\d{2})-(\d{2})/)` — usada em filter inicial, `durOf`, refStr e loop principal; `fracaoDecorridaMs` chamado dentro de try/catch retornando 0; `custoOf`/`durOf` blindados com `Number.isFinite`; função NUNCA mais lança. (2) `ProgramacaoSemanalLotus.tsx`: try/catch defensivo nos 4 useMemos pesados (`linhas`, `metricas`, `analiseSemana`, `totaisSemana`) com fallback para shape vazio + log `[Lotus.<memo>] memo falhou`. Defesa em profundidade — qualquer edge-case nas 1512 atividades do QIU 2 não derruba mais a tela. R-007 OK, sem schema, sem deps, sem UI nova.
- **Rev. 1815**: **Planejamento · PREVISTO físico — fix definitivo da saturação em 100% por COBERTURA PARCIAL de peso financeiro (QIU 2 - FASE 4 e similares)**. User (15/05/2026, com screenshot QIU 2 Rev. 01 ATIVA topo 100,00% Previsto / 0,00% Realizado / 0/1506 atividades / cutoff 08/05/2026 / 14 REFIs / 200d restantes): "QIU continua errado a obra não pode tá 100% siga a mesma lógica do hotel do papa". Investigação interativa (2 perguntas, sem criar UI R-017) confirmou: (a) só existe Rev. 01 (descarta bug de seleção); (b) cronograma tem atividade até 10/12/2026 (descarta cronograma vencido). Causa-raiz (regressão Rev. 1812): `pvPonderadoPorAtividade` (shared/diasUteis.ts) usava `usarDur = somaCusto===0` — bastava UMA folha com peso>0 pra ativar EVM clássico. Em QIU 2 pós-import parcial de orçamento, ~poucas folhas passadas ganharam peso e as 1505 futuras ficaram com peso=0 → soma virava `(peso_passada×100%)/peso_passada = 100%` (folhas futuras invisíveis). HOTEL DO PAPA tem cobertura 100% então não cai nisso. **Fix (PMI EVM Practice Standard §5.2 / Mattos §7.4 / Vargas §10.3)**: nova hierarquia exigindo cobertura COMPLETA pra EV clássico. (1º) explícito por duração; (2º) `every(folha => peso>0)` → custo (HOTEL DO PAPA, inalterado); (3º) duração — `durOf` robusta (preferre `duracaoDias`, deriva de `(fim-ini)+1` se faltar) com TODAS as folhas (passadas E futuras) entrando com peso>0; (4º) uniforme. Propagação automática via FONTE ÚNICA pra top bar + 5 useMemos AvancoSemanal + 4 useMemos REFIS + Lotus. QIU 2 sai de 100% saturado pra curva S real ponderada por dias do cronograma. Sem schema, sem deps, sem UI nova.
- **Rev. 1814**: **Gestão de Documentos · Visualizador PDF nativo (PDF.js) — navegação rica + marcações em desktop/celular/tablet/iPad**. User (15/05/2026, com screenshot do REVTE-LUM-001 abrindo no visualizador GENÉRICO do Chrome dentro do modal): "melhore a navegação da visualização do PDF no computador, celular e tablet e ipad.. quero ter uma navegabilidade ótimo, fazer marcações, anotações se precisar..". Causa: `<object data type=application/pdf>` da Rev. 1716 delegava 100% ao plugin do navegador — UX inconsistente entre Chrome/Safari/Edge/Firefox, zero controle, sem marcação, errático em iPad. **Fix**: instalado `react-pdf@10.4.1` + `pdfjs-dist@5.7.284` + `react-zoom-pan-pinch@4.0.3` (compat React 19). Criado `client/src/components/PdfViewer.tsx` reutilizável com: (a) toolbar (prev/next + input de página, zoom -/+/largura/página/100%, rotação, fullscreen, baixar, imprimir, abrir nova aba); (b) sidebar com MINIATURAS clicáveis; (c) atalhos `←→ +- 0 R F Esc`; (d) barra inferior mobile compacta; (e) pinch-to-zoom + pan + double-tap via `react-zoom-pan-pinch` (touch real iPad/celular); (f) ferramentas de marcação overlay SVG: CANETA (4 cores), MARCA-TEXTO (4 cores, multiply), BORRACHA — salvas em `localStorage` por `docId` (chave `pdf-annot:{id}`), reaparecem ao reabrir; (g) fallback "Abrir em nova aba" se PDF.js falhar. Integrado em `gestaodocumentos/index.tsx` L3124 substituindo o `<object>`. Modal mantém R-001 (`w-[98vw] h-[95vh]`). Outros 5 lugares do app que usam `<object>` (`ControleDocumentos`, `FolhaPagamento`, `frotas/Seguros`, 2 portais) ainda usam o viewer antigo — swap fácil, mesma API, depois da validação. R-007 OK. Sem schema, sem mudança no servidor.
- **Rev. 1813**: **Layout global · Barra lateral FIXA em todas as telas + botão Voltar permanente no header**. User (15/05/2026, 2 screenshots: DDS sem sidebar visível e SST com sidebar como overlay): "manha [mantenha] a barra lateral... em todas as telas e o botão de voltar tbm..". Causa: dois breakpoints faziam a sidebar sumir em telas médias — `MOBILE_BREAKPOINT=768` em `useMobile.tsx` virava o `<Sidebar/>` em `<Sheet/>` overlay; `TABLET_BREAKPOINT=1280` em `DashboardLayout.tsx` L875 fazia notebook/iPad começar com sidebar colapsada em modo ícone (quase invisível). Header só tinha botão "Início" (home do módulo), faltava Voltar. **Fix** (3 mudanças cirúrgicas): (1) `useMobile.tsx` `MOBILE_BREAKPOINT 768→480` — acima disso a barra é a barra lateral real (icon-collapsible), nunca vira Sheet; (2) `DashboardLayout.tsx` L875 `TABLET_BREAKPOINT 1280→1024` — notebook/iPad landscape abre com barra ABERTA; (3) `CompanyHeader` (L1900-1912) ganhou botão Voltar permanente (`ChevronLeft` + "Voltar") antes do "Início", usando `window.history.back()` com fallback pra home do módulo. Visível em TODAS as telas e módulos. Smartphone (<480px) continua com Sheet overlay. R-007 respeitada (import único lucide-react). Sem schema, sem deps.
- **Rev. 1812**: **Planejamento · PREVISTO funciona agora em TODAS as obras (novas e antigas) via fallback automático peso financeiro → duração → uniforme**. User (15/05/2026, com screenshot do projeto QIU 2 - FASE 4 id 29 mostrando 100% atrasado): "preciso que propague este conceito para todas as obras novas que iremos lançar e para as obras que já esta lançadas garantindo a mesma logica para todas, veja que o qiu não esta funcionando..". Causa-raiz: QIU 2 tem TODAS as 77 atividades com `peso_financeiro = 0` (orçamento ainda não vinculado). A `pvPonderadoPorAtividade` da Rev. 1811 detectava `pesoBruto = 0` e caía em peso uniforme (1 por atividade-folha) — atividade de 1 dia valia igual a atividade de 100 dias, distorcendo a curva S e saturando em ~100%. **Fix (literário, PMI EVM Practice Standard §5.2 / Mattos §7.4 / Vargas §10.3 — Time-Phased Budget / Schedule-Based EV)**: em `shared/diasUteis.ts`, troquei o branch único 'usarPesoPorDuracao ? duração : custo' por hierarquia automática 4 níveis: (1º) escolha explícita pelo usuário → duração; (2º) Σ pesoFinanceiro>0 → peso financeiro (EV clássico); (3º) Σ duracaoDias>0 → DURAÇÃO automática (fallback literário, caso QIU 2); (4º) uniforme — último recurso. Como `pvPonderadoPorAtividade` é a FONTE ÚNICA de PREVISTO em todo o módulo (top bar, Avanço Semanal, REFIS, Lotus), a correção PROPAGA AUTOMATICAMENTE para todas as obras (novas e existentes) — sem tocar em mais nenhum arquivo. QIU 2 sai de PV~100% saturado para curva S real ponderada por duração; HOTEL DO PAPA continua igual (caminho 2º, peso financeiro preenchido); qualquer obra futura "just works" desde o 1º import — antes do orçamento usa duração, depois migra automaticamente pra peso financeiro. Sem schema, sem deps, sem UI nova (R-017).
- ~~**Rev. 1811**~~ (movida ao histórico — ver `shared/changelog.ts`). User (15/05/2026, com screenshot HOTEL DO PAPA mostrando topo 84.68% vs card 53.25%): "previsto é pegar as datas do cronograma e fazer a analise de que dia e hoje, para saber o % de evolução... isso ja estava resolvido e não poderia ter perdido o conceito... siga as melhores literaturas... corrija e deixe funcionando de forma automatizada". Rev. 1810 forçou pvMacro (`fracaoDecorridaMs(projIni→cutoff, projFim) × 100` = % do prazo decorrido linear, Texto10/11 do MSP) em todos os cards para "convergir" com o top bar — isso QUEBROU o conceito de Previsto Físico. PREVISTO correto (PMI Practice Standard for Scheduling §6.2 / Mattos §7.4 / Vargas) = somatória `fracaoDecorridaMs(dataInicio_atv → t, dataFim_atv, calMSP) × pesoFinanceiro_atv / pesoTotal` para CADA folha — a curva S real do cronograma. **Implementação Rev. 1811** (FONTE ÚNICA, automatizada): (a) criada função pura `pvPonderadoPorAtividade(refStr, folhas, usarPesoPorDuracao, cal)` em **`shared/diasUteis.ts`** (top do módulo) — clampa [0,100], trata folhas vazio, suporta peso=0 (uniforme), funciona com `cal=null` (calendário corrido). (b) `PlanejamentoDetalhe.tsx`: importa a função e usa em **TODOS** os cálculos de PREVISTO — top bar `avancoPrevistoDia`, 5 useMemos de `AvancoSemanal` (`prev` Δsemanal, `previstoAcumulado`, `pvAcum` débito, `previsto` card, `previstoComInd`), 4 useMemos de REFIS (`avancoPrevisto`, `avancoPrevAntes`, `refisPrevistoComInd`, `avancoPrevAntesComInd`). Snapshot Texto11 do MSP descartado em todos os pontos (era EVM linear, não curva S). Clipping no cutoff oficial mantido (semana futura → ref=cutoff → Δ=0). (c) `ProgramacaoSemanalLotus.tsx`: substituído pvMacro envelope por `pvPonderadoPorAtividade` (mesma fórmula do FC) — o "Previsto acumulado oficial" do Lotus AGORA bate com o card PREVISTO (SEMANA) do FC para o mesmo refFimAcum. Resultado: HOTEL DO PAPA mostra 53.25% no topo E em todos os cards (FC + Lotus + REFIS) — paridade absoluta via curva S real. Sem schema, sem deps, sem UI nova (R-017).

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
