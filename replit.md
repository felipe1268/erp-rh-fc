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

- **Rev. 2284** — **FIX · Aba REFIS abre na SEMANA-CUTOFF atual (Sex→Qui p/ cutoff=Qui), não na semana ISO (Seg→Dom).** Pedido user (23/05/2026, IMG_1070): "Deveria aparecer 4ª semana não 3ª semana" + "A tela sempre abre na semana atual". Hoje sáb 23/05/2026, cutoff do projeto = Quinta. Semana-cutoff atual = Sex 22/05 → Qui 28/05 (4ª desde início 04/05), mas tela abria em "3ª Semana — 15/05 até 21/05" (anterior). Causa raiz em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` L12997: `useState(() => toMonday(new Date()))` retorna Segunda da semana ISO (18/05 p/ Sáb 23/05) → label `cutoffWeekFromMonday(18/05,4)` = semana anterior. Fix: (a) inicializa com `mondayOfCutoffWeek(todayLocalISO(), 4)` (Segunda DENTRO da semana-cutoff que contém HOJE = Seg 25/05 → label "22/05 até 28/05"), (b) novo `useEffect([cutoffDow])` + `cutoffDowRealignedRef` realinha 1× quando cutoffDow real do projeto chega (mesmo padrão do parent L504-509), (c) usa `setSemanaRaw` direto pra não disparar `onSemanaChange` no realinhamento. Effects existentes (initialSemana do popup + manter semana dentro de `semanas`) preservados. ZERO mudança em schema/mutation. **R-001/R-007/R-010:** N/A (client-only).
- **Rev. 2283** — **FIX CRÍTICO · `emitirRefis()` agora grava `realOficialRefis` (snapshot MSP raiz UID=0) em vez de `avancoRealAtual` (cálculo local).** Pedido user (23/05/2026, follow-up das Revs 2278/2282): "o 6,86 % veio do MSP, use os mesmos valores do avanço". Investigação confirmou: Curva S Financeira mostrava R$ 34.700 / 6,86 % (via `realOficialRefis × totalContrato / 100`, fixado na Rev. 2278), enquanto a tabela "Histórico de Relatórios" linha #003 mostrava 4,61 % / R$ 8.886 — valores GRAVADOS no banco vindos de `avancoRealAtual` (ponderação local). Resultado visível: obra adiantada (+R$ 10.848) e atrasada (−0,10 pp / −R$ 194) na MESMA tela, single-source-of-truth violado. Fix em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`: (a) `custoRealAuto` (L13577) passa a usar `realOficialRefis`, (b) `emitirRefis()` grava `avancoRealizado: realOficialRefis` em vez de `avancoRealAtual`, (c) `avancoSemanalRealizado` recalculado como `Math.max(0, realOficialRefis - avancoRealAntes)` p/ manter delta semanal coerente com o acumulado MSP. ZERO mudança em schema/migration/procedure — só altera VALOR no payload da mutation `salvarRefis` (upsert idempotente). **Como aplicar nos REFIS já gravados:** re-emitir cada semana via modal "Emitir REFIS" (endpoint é upsert por `projetoId+semana`). Para #003 (ATUAL): clicar em "Emitir REFIS" na tela aberta; para passadas, navegar via dropdown e re-emitir. NÃO há comando bulk (regra R-001). **R-001/R-007/R-010:** N/A (client-only, sem DDL/DELETE/UPDATE direto).
### Revisões recentes (one-liners)

- ~~Rev. 2282~~ — FEAT/UX · Histórico REFIS expansível c/ painel comparativo (banner veredito + Δ KPIs + tabela densa + observações). Ver `shared/changelog.ts`.
- ~~Rev. 2281~~ — UX · REFIS Análise do Cronograma — redesign sweeping (group cards header + Faturamento KPIs + Histórico). Ver `shared/changelog.ts`.
- ~~Rev. 2280~~ — FIX · LOTUS Prog. Semanal: atividade ANTECIPADA / NÃO PROGRAMADA na semana corrente não pintava célula r0+2 (UI+Excel). Ver `shared/changelog.ts`.
- ~~Rev. 2279~~ — CHORE · Solicitação de Equipamento (SE) DELETADA do ERP (Etapa 1 da consolidação SE→SC). Ver `shared/changelog.ts`.
- ~~Rev. 2278~~ — FIX · Curva S Financeira KPI/linha verde usa `realOficialRefis` (snapshot MSP raiz UID=0) em vez de `avancoRealAtual`. Ver `shared/changelog.ts`.

### REGRA DE OURO — Cabeçalho de documentos institucionais FC (Rev. 2106+)

Todo documento oficial FC (contrato, aviso prévio, termo de rescisão, comunicado interno, carta MDO, advertência etc.) DEVE usar este cabeçalho HTML:

```
[logo centralizado ~88px — fallback ${window.location.origin}/logo-fc.jpg]
[RAZÃO SOCIAL caixa alta 16pt bold centralizado]
[CNPJ: xx.xxx.xxx/xxxx-xx — 9.5pt centralizado cinza]
[ENDEREÇO COMPLETO uppercase 9pt centralizado cinza claro]
[faixa azul #1B2A4A full-width, border branco 2px, padding 14px,
 TÍTULO DO DOC caixa alta 13pt letter-spacing 3px branco]
[Nº NNN/AAAA (esq) ───── Data de Emissão: DD/MM/AAAA (dir)]
```

Regras técnicas obrigatórias:
- **Inline styles** em TODOS elementos críticos (DOMPurify pode descartar `<style>` externo).
- `<style>` interno SEMPRE dentro do `<body>` (não no `<head>`).
- `print-color-adjust: exact` inline na faixa azul (cores de fundo no print).
- JAMAIS usar `onerror=`, `onload=` ou qualquer handler `on*` (filtro XSS do `signatures.create`).
- Logo SEMPRE com fallback `${window.location.origin}/logo-fc.jpg`.
- Corpo: `text-align:justify; hyphens:auto`, Times serif 11.5pt.
- Cláusulas com `border-left:3px solid #1B2A4A; padding-left:8px` no título.

> Revisões 2098 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).

> Revisões 2084 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
- **Métricas de avanço de obra — fonte ÚNICA é o MS Project (XML LOTUS).** O ERP deve SEMPRE ler do XML do MSP pra garantir paridade absoluta com o que o engenheiro vê no Project. Convenção fixa (Rev. 2260+):
  - **PREVISTO** = campo `% PREVISTO` calculado pelo MSP na **tarefa-resumo** (UID=0). Lido em ordem de prioridade: Texto10 (FieldID 188743750, 4 casas) → Texto11 (188743997) → Texto6 (188743746, inteiro — usado pelo template LOTUS R05). Por atividade: mesma ordem (Texto10 → Texto6).
  - **REALIZADO** = `PercentComplete` da **tarefa-resumo** do projeto. Por atividade: Texto7 (188743747 — %Reali AUX) com fallback `ActualDuration / (ActualDuration + RemainingDuration)` (precisão MSP-nativa).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
