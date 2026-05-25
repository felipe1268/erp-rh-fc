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

- **Rev. 2411** — **EQUIPAMENTOS LOCADOS ↔ ALMOXARIFADO/BUGFIX + RASTREABILIDADE · Devolução/exclusão de locado agora propaga pro almox + 3 novos statuses (aguardando_chegada, quebrado, solicitado_substituicao).** Pedido user (25/05/2026): excluiu locados em lote e cards "Equipamento Locado #8221/#7530/#7531" continuavam no almox apontando pra IDs órfãos. Causa raiz: Rev. 2405 montou sync unidirecional (equip→almox); faltava reverso em `locadoDevolver`/`locadosExcluirLote`/`locadoAtualizar(→devolvido)`. Fix em 4 frentes: (1) 3 helpers novos em `server/lib/almoxEquipamentoSync.ts` (`removeAlmoxItemForEquipamento`, `removeAlmoxItemsForEquipamentos` bulk via `ANY($1::int[])`, `purgeStaleAlmoxLinks` startup); (2) 3 mutations patcheadas — `locadoDevolver` calcula `tempoNaObraDias = dataFimReal−dataInicio` e grava no `observacao` do evento "[Tempo na obra: N dias]", `locadosExcluirLote` retorna `almoxRemovidos`, `locadoAtualizar` com guard pra `status==="devolvido"`; (3) `purgeStaleAlmoxLinks` no startup limpa o estado herdado; (4) 3 statuses novos no enum + STATUS_LABELS/COLORS/PILLS (cyan/rose/fuchsia, 5→8 pills). Rastreabilidade reusa `equipamento_locado_eventos` (Rev. 2306) — já registra usuario+obra+fotos+data. R-001/R-007/R-010 OK (só DELETE row-level, sem DDL). Detalhe completo + follow-ups Rev. 2412 (modal dedicado + aba histórico + coluna `tempoNaObraDias`): `shared/changelog.ts`.
- **Rev. 2410** — **AVALIAÇÃO INTELIGENTE/BUGFIX · `getDb()` chamado sem `await` em `carregarInputs` quebrava a tela inteira ("db.select is not a function").** Pedido user (25/05/2026): screenshot da tela "Avaliação Inteligente de Funcionários" totalmente em branco — só header e disclaimer. Log: `[tRPC Error] avaliacaoFuncionarios.getResumo: db.select is not a function`. Causa raiz: `server/db.ts` exporta `getDb()` como função async (lazy init do pool Neon), mas `avaliacaoFuncionarios.ts` L74 chamava `const db = getDb()` SEM await — `db` era Promise, não instância drizzle. Fix: `const db = await getDb();` (1 caractere). Único call site síncrono no `server/` confirmado via rg. R-001/R-007/R-010 OK. Detalhe completo: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2409** — IA/PERFORMANCE · Desligado "modo thinking" do Gemini 2.5 Flash em `invokeGeminiVision` (server/_core/llm.ts). `thinkingConfig.thinkingBudget=0` + param `thinking?:"off"|"auto"` default "off" + guarda regex `gemini-2.5+`. Combate "trava em 99%": PDF pequeno 25-40s→8-15s. Ver `shared/changelog.ts`.
- **Rev. 2408** — EQUIPAMENTOS LOCADOS/UX · Filtro por LOCADORA (fornecedor) na toolbar da Visão Geral. State `filtroFornecedor` + useMemo `dataPorFornecedor` (pipeline status→obra→cat→**fornecedor**→venc), `fornecedoresComItens` derivado dos próprios equipamentos (não dos 1190 cadastrados), comparação case-insensitive. UI: grid 2→3 cols, select amber Truck, chip amber. Zero backend. Ver `shared/changelog.ts`.
- **Rev. 2407** — EQUIPAMENTOS LOCADOS/IMPORT · Multi-PDF no modal "Importar contratos de locação (PDF · IA)". Fila client-side (`importFilas`/`Ref`), `handlePdfPickMultiple({append})`, poll done acumula preview e auto-avança, branches error/expired/start-error também avançam. `<input multiple>`, badge X/N, "+ Adicionar PDFs", lista da fila. Zero backend. Ver `shared/changelog.ts`.
- **Rev. 2406** — ALMOXARIFADO/UX · Filtro por vínculo Equipamento (Próprio/Locado/Qualquer/Nenhum) nas 2 barras de filtro da Visão Geral. Novo state `filtroEquip` (5 valores) em `almoxarifado/index.tsx`, filtro aplicado em `lista` e `consListFinal`, 2 `<select>` indigo idênticos. Zero backend. Ver `shared/changelog.ts`.
- **Rev. 2405** — ALMOXARIFADO ← EQUIPAMENTOS · Sync reverso (vínculo bidirecional). Novo `server/lib/almoxEquipamentoSync.ts` com `ensureAlmoxItemForEquipamento` (idempotente, INSERT/UPDATE conforme transferência) + `backfillAlmoxFromEquipamentos` (SQL bulk no startup). Hooks `locadoCriar`/`locadoAtualizar`. Zero migration. Ver `shared/changelog.ts`.

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

> Revisões anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
- **Métricas de avanço de obra — fonte ÚNICA é o MS Project (XML LOTUS).** O ERP deve SEMPRE ler do XML do MSP pra garantir paridade absoluta com o que o engenheiro vê no Project. Convenção fixa (Rev. 2260+):
  - **PREVISTO** = campo `% PREVISTO` calculado pelo MSP na **tarefa-resumo** (UID=0). Lido em ordem de prioridade: Texto10 (FieldID 188743750, 4 casas) → Texto11 (188743997) → Texto6 (188743746, inteiro — usado pelo template LOTUS R05). Por atividade: mesma ordem (Texto10 → Texto6).
  - **REALIZADO** = `PercentComplete` da **tarefa-resumo** do projeto. Por atividade: Texto7 (188743747 — %Reali AUX) com fallback `ActualDuration / (ActualDuration + RemainingDuration)` (precisão MSP-nativa).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
