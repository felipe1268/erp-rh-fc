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

- **Rev. 2286** — **FEAT/UX · Histórico de Relatórios REFIS com seleção múltipla + exclusão em lote (admin-only).** Pedido user (23/05/2026): "Coloca múltipla seleção do refis para poder apagar todas de uma vez". Após Revs 2283/2285, os 3 REFIS gravados carregam valores do cálculo local antigo — user quer limpar tudo e re-emitir. Backend `deletarRefisLote` já existia desde Rev. 1859 (admin-only, companyId guard, ≤100 IDs). Frontend em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` componente Refis: (1) estados `selectedRefisIdsHist`/`confirmBulkDeleteHist` + mutation `deletarRefisLoteHistMut`, (2) toolbar contextual vermelha que aparece quando ≥1 marcado (contador + limpar + excluir), (3) coluna checkbox no header com "select all" + checkbox por linha (stopPropagation p/ não conflitar com expand da Rev. 2282), (4) AlertDialog copiando padrão da Visão Geral (L2840) c/ lista detalhada dos REFIS marcados, (5) `totalCols` ajustado +1 quando admin p/ colSpan correto. Visível APENAS p/ admin (`isAdminMaster`). **R-001/R-007/R-010:** N/A — endpoint DELETE já existia, esta Rev. só expõe na UI. Frontend-only.
- **Rev. 2285** — **FIX · TODA aba REFIS lê `realOficialRefis` (snapshot MSP raiz UID=0) — eliminadas as últimas 3 ocorrências visuais de `avancoRealAtual` (ponderação local).** Pedido user (23/05/2026, IMG_1073): "Os valores devem bater, o percentual de avanço foi de 6,86% não 4,08%. Lê toda aba de REFIS e garanta que A INFORMAÇÃO SEJA A MESMA EM TODAS AS TELAS E ABAS". Card "Avanço Acumulado da Obra" mostrava 6,86 % (MSP) mas coexistiam 3 pontos calculando local: (1) KPI "AVANÇO SEMANAL REALIZADO" (L13333) = `avancoRealAtual − avancoRealAntes`, (2) painel "Revisão Atual / Realizado / Desvio" da Curva S Física (L14745) = `fPct_(avancoRealAtual)` mostrando 4,61 %, (3) `refisDistReal` (L13385) = `refisRealComInd − avancoRealAtual` p/ distorção indiretas. Fix em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`: 3 substituições `avancoRealAtual` → `realOficialRefis`. Definição (L13294), fallbacks (L13343/13433) e comentários (L13602/14826) preservados. Continuidade direta das Revs 2278/2283/2284. ZERO mudança em schema/persistência. **R-001/R-007/R-010:** N/A (client-only).
### Revisões recentes (one-liners)

- ~~Rev. 2284~~ — FIX · Aba REFIS abre na SEMANA-CUTOFF atual (Sex→Qui p/ cutoff=Qui). Ver `shared/changelog.ts`.
- ~~Rev. 2283~~ — FIX CRÍTICO · `emitirRefis()` grava `realOficialRefis` (snapshot MSP raiz UID=0) em vez de `avancoRealAtual`. Ver `shared/changelog.ts`.
- ~~Rev. 2282~~ — FEAT/UX · Histórico REFIS expansível c/ painel comparativo (banner veredito + Δ KPIs + tabela densa + observações). Ver `shared/changelog.ts`.
- ~~Rev. 2281~~ — UX · REFIS Análise do Cronograma — redesign sweeping (group cards header + Faturamento KPIs + Histórico). Ver `shared/changelog.ts`.
- ~~Rev. 2280~~ — FIX · LOTUS Prog. Semanal: atividade ANTECIPADA / NÃO PROGRAMADA na semana corrente não pintava célula r0+2 (UI+Excel). Ver `shared/changelog.ts`.

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
