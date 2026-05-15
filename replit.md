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

- **Rev. 1811**: **Planejamento · PREVISTO unificado em CURVA S POR ATIVIDADE em TODO o módulo (reversão conceitual da Rev. 1810)**. User (15/05/2026, com screenshot HOTEL DO PAPA mostrando topo 84.68% vs card 53.25%): "previsto é pegar as datas do cronograma e fazer a analise de que dia e hoje, para saber o % de evolução... isso ja estava resolvido e não poderia ter perdido o conceito... siga as melhores literaturas... corrija e deixe funcionando de forma automatizada". Rev. 1810 forçou pvMacro (`fracaoDecorridaMs(projIni→cutoff, projFim) × 100` = % do prazo decorrido linear, Texto10/11 do MSP) em todos os cards para "convergir" com o top bar — isso QUEBROU o conceito de Previsto Físico. PREVISTO correto (PMI Practice Standard for Scheduling §6.2 / Mattos §7.4 / Vargas) = somatória `fracaoDecorridaMs(dataInicio_atv → t, dataFim_atv, calMSP) × pesoFinanceiro_atv / pesoTotal` para CADA folha — a curva S real do cronograma. **Implementação Rev. 1811** (FONTE ÚNICA, automatizada): (a) criada função pura `pvPonderadoPorAtividade(refStr, folhas, usarPesoPorDuracao, cal)` em **`shared/diasUteis.ts`** (top do módulo) — clampa [0,100], trata folhas vazio, suporta peso=0 (uniforme), funciona com `cal=null` (calendário corrido). (b) `PlanejamentoDetalhe.tsx`: importa a função e usa em **TODOS** os cálculos de PREVISTO — top bar `avancoPrevistoDia`, 5 useMemos de `AvancoSemanal` (`prev` Δsemanal, `previstoAcumulado`, `pvAcum` débito, `previsto` card, `previstoComInd`), 4 useMemos de REFIS (`avancoPrevisto`, `avancoPrevAntes`, `refisPrevistoComInd`, `avancoPrevAntesComInd`). Snapshot Texto11 do MSP descartado em todos os pontos (era EVM linear, não curva S). Clipping no cutoff oficial mantido (semana futura → ref=cutoff → Δ=0). (c) `ProgramacaoSemanalLotus.tsx`: substituído pvMacro envelope por `pvPonderadoPorAtividade` (mesma fórmula do FC) — o "Previsto acumulado oficial" do Lotus AGORA bate com o card PREVISTO (SEMANA) do FC para o mesmo refFimAcum. Resultado: HOTEL DO PAPA mostra 53.25% no topo E em todos os cards (FC + Lotus + REFIS) — paridade absoluta via curva S real. Sem schema, sem deps, sem UI nova (R-017).
- **Rev. 1810**: **Planejamento · Avanço Semanal — convergência absoluta dos KPIs com o top card "Avanço Físico"**. User (15/05/2026, com screenshot do projeto QIU 2 - FASE 4 (id 29)): "indicares divergentes, verifique o valor real se é o do topo todos as informações da tela tem que convergir a informação correta..". Topo: Previsto 31.48% / Realizado 0% / "31.46% atrasado" (cutoff oficial 08/05). Logo abaixo, painel Semanal 16ª Semana mostrava PREVISTO (SEMANA) 100%, VARIAÇÃO -100%, footer "Previsto (Acum.) 0%". Causa: 4 useMemos em `AvancoSemanal` (PlanejamentoDetalhe.tsx) usavam o ternário `(cutoff >= semanaAtual && cutoff < semanaFim) ? cutoff : semanaFim` — só clipava no cutoff quando este caía DENTRO da semana selecionada. Para semanas FUTURAS (cutoff < semanaAtual) caía em `semanaFim` e `pvMacro` saturava em 100% (ele clampa em [0,100]). Top bar usa fórmula paralela ancorada no cutoff oficial — daí a divergência. Fix: trocado pra `(cutoff && cutoff < semanaFim) ? cutoff : semanaFim` em L5213-5215, L5238-5239, L5342-5343 e L5398-5399 — clipa no cutoff sempre que cutoff for antes do fim da semana (corrente OU futura). Semana passada (já fechada) preserva semanaFim (PV histórico). Bonus: card Variação L6018 trocou rótulo "Semana 2026-06-11" (ISO bruto) por "{n}ª Semana — DD/MM/YYYY a DD/MM/YYYY" pt-BR. Sem schema, sem deps, sem UI nova (R-017 da Rev. 1809).
- **Rev. 1809**: **Planejamento · REMOÇÃO do "Diagnóstico de Avanços" da Rev. 1808 a pedido explícito do usuário**. User (15/05/2026): "tire isso não crie botão para fazer seu trabalho.. jamais..". Removidos integralmente: (a) estado `diagOpen` + `useQuery` lazy em `PlanejamentoDetalhe.tsx` (L4892-4898), (b) botão azul "Diagnóstico" do toolbar da aba Avanço Semanal (L5827-5836), (c) modal full-screen R-001 com KPIs/tabela por revisão/10 últimos/audit log (L6478-6645), (d) endpoint tRPC `diagnosticarAvancos` em `server/routers/planejamento.ts` (L1530-1690). Sobrou apenas marcador-comentário no router avisando que **NUNCA MAIS** se cria botão/modal/endpoint de diagnóstico do agente na UI do usuário. Origem do problema dos avanços continua sob investigação: análise estática mostra `salvarAtividades` L1102-1112 faz HARD DELETE de atividades fora do payload — re-salvar a Rev. 41 órfana os avanços sem `eapCodigo` recuperável. Solução recomendada (sem código): **Point-in-Time Restore da Neon** (janela 7d) restaura 100% dos avanços com zero risco. Sem schema, sem deps.
- **Rev. 1808**: **Planejamento · botão "Diagnóstico" (read-only) na aba Avanço Semanal — REMOVIDO na Rev. 1809**. Implementação 100% read-only criada para investigar avanços que sumiram do projeto QIU 2 - FASE 4 (id 29), sem mexer em dado. Endpoint tRPC `diagnosticarAvancos` calculava por revisão: total avanços, órfãos, semanas distintas, último timestamp/usuário, range de IDs ativ vs IDs referenciados. Modal full-screen exibia 3 KPI cards, tabela por revisão, 10 últimos lançamentos e audit log 72h. **Tudo deletado na Rev. 1809** porque o usuário rejeitou a abordagem de criar UI extra como ferramenta de diagnóstico do agente.
- **Rev. 1807**: **Planejamento · destrava save de projetos legados (R-015) + acaba com a lentidão da aba Avanço Semanal (R-016)**. User (15/05/2026): "fizemos modificações no modulo em outros projetos, isso pode ter prejudicado os projetos prontos" + "página extremamente lenta, mais de 1s". DOIS fixes cirúrgicos: **(A) Regressão Rev. 1798**: `salvarAtividades` em `server/routers/planejamento.ts` L1042-1046 abortava com `TRPCError BAD_REQUEST` quando qualquer atividade-folha tinha `eapCodigo` fora do orçamento — projetos prontos importados antes da R-013 ficavam travados. Trocado `throw` por `console.warn` estruturado (amostra dos 5 primeiros + total). Auto-sync de nome (R-013, L1014-1026) MANTIDO intacto. Save volta a completar; divergências viram diagnóstico visual, não bloqueio. **(B) Lentidão**: `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` L5031-5076 — `semanasComDados` tinha loop triplo `O(S × M × K)` com `.filter+.sort` aninhados (250M iterações em projeto de 100 semanas × 500 atividades × 5000 avanços, travava 2s+). Refatorado para `O(K log K + S × M)` com pré-indexação em `Map<atividadeId, Array<{sem,pct}>>` ASC + ponteiros monotônicos por atividade (two-pointer/merge). Speedup ~5000×. **Novas regras de ouro** R-015 (validação retroativa = warning + bypass legado) e R-016 (jamais loop O(n²) em useMemo) registradas em `REGRAS_DE_OURO.md` com padrões obrigatórios e checklist. Sem mudança de schema, sem novas dependências.

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
