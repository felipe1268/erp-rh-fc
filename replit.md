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

- **Rev. 2394** — **ALMOXARIFADO/CONFIG · Cadastro de Categorias exposto em Configurações + `excluirCategoria` migra itens automaticamente pra "Sem categoria" (NULL).** Pedido user (IMG_1200/1201, 24/05/2026 21:03): (1) tornar o cadastro de categorias fácil de achar em Configurações; (2) apagar a categoria "Compras" movendo seus itens pra "Sem categoria". A página `/almoxarifado/categorias` (CRUD) já existia mas estava invisível — sem entry point. E `excluirCategoria` antigo só fazia DELETE da row deixando `compras_itens.categoria='Compras'` como string órfã (continuava aparecendo no dropdown DISTINCT). **Backend** (`server/routers/compras.ts` L2862-2907): `excluirCategoria` reescrita atomicamente em `db.transaction` — SELECT do nome pelo id (scoped companyId, NOT_FOUND explícito), UPDATE `almoxarifado_itens SET categoria=NULL WHERE categoria=<nome>` capturando `rowCount`, DELETE da row de categoria. Retorna `{itensMigrados, categoriaNome}`. Nova query `contarItensPorCategoria` agrupa por `COALESCE(NULLIF(TRIM(categoria),''),'__sem__')` filtrando `ativo=true` — mesma chave `__sem__` do filtro do Almoxarifado. **Frontend**: novo `AlmoxarifadoConfigSection.tsx` (60L, card emerald com Warehouse icon, chip ambar "⚠ N sem categoria") em `Configuracoes.tsx` L658 entre Compras e Financeiro, navega via wouter pra `/almoxarifado/categorias` (mantém RouteGuard). `Categorias.tsx` carrega contagens em paralelo, mostra "N itens" font-mono ao lado de cada categoria (visível sempre em mobile/iPad — hover-reveal `md:opacity-0 md:group-hover` só pros botões de ação no desktop). AlertDialog de exclusão avisa "Os N itens serão movidos para 'Sem categoria'" ANTES da ação. Toast `onSuccess` reporta count. Helper `invalidarTudo()` cross-router invalida `listarCategorias` + `contarItensPorCategoria` + `listarCategoriasAlmoxarifado` (filtro Almoxarifado L804) + `warehouse.listarItens`. Zero ALTER/DROP/CREATE schema; DELETE em CONFIG table (sem FK apontando) com migração de string-ref antes — R-001/R-007/R-010 OK.
- **Rev. 2393** — **ALMOXARIFADO/UX · Drag-to-select (lasso) na grade de cards + botão "Excluir" em lote no sticky bar.** Pedido user (24/05/2026 pós Rev. 2392): "selecionar arrastando o dedo como janela de seleção" + "apagar selecionados tudo de uma vez". Antes, modo seleção (Rev. 2382) só com tap item-a-item, e sticky bar sem "Excluir" em lote. **Frontend** (`client/src/pages/almoxarifado/index.tsx`): novo state `dragSel` (L141-146) + `gridRef`, wrapper relativo no grid de cards (L2013-2080) com handlers Pointer Events (cobrem mouse+touch iPad/Safari uniformemente). Drag inicia SÓ em espaço vazio (filtro `closest('[data-card-id]')` + buttons/inputs) — tap em card mantém toggle individual (compat Rev. 2382). `setPointerCapture` segura eventos fora do bbox. Hit-test AABB via `getBoundingClientRect()` de cada `[data-card-id]`. `touchAction: 'none'` só com modoSelecao ativo. Overlay retângulo `indigo-500 bg-indigo-400/15`. Drag é ADITIVO via snapshot `origin`. Novo handler `handleExcluirSelecionados` (L488-536) reusa `ModalConfirmacaoAuditoria` (Rev. 2388) e itera `compras.excluirItem` (soft-delete). Botão "Excluir" red→rose com Trash2 entre Transferir e Cancelar no sticky bar (L4196-4204). Zero mudança backend. R-001/R-007/R-010 OK.

### Revisões recentes (one-liners)

- **Rev. 2392** — ALMOXARIFADO/UX · Após transferir TODO o estoque de um item de obra, o item SOME da lista (soft-delete via `ativo=false`). UPDATE em `createTransferencia`/`createTransferenciaLote` seta `ativo=false` via CASE WHEN quando obraId IS NOT NULL e saldo final ≤ 0; upsert no destino reativa via `ativo=true` evitando duplicata. Ver `shared/changelog.ts`.
- **Rev. 2391** — OBRAS/GOVERNANÇA · Não permitir encerrar obra com estoque no Almoxarifado — pre-check `obras.checarEstoquePendente` + guard em `obras.update` (só na transição pra encerrador) + modal âmbar→laranja com CTA pra `/almoxarifado?obra=<id>`. Ver `shared/changelog.ts`.
- **Rev. 2390** — ALMOXARIFADO/UX · Transferência em LOTE no sticky bar do modo seleção (N itens → 1 destino comum, qtd editável por linha). Novo `createTransferenciaLote` itera linha-a-linha reusando lógica do single; modal max-w-2xl roxo→indigo com painel de resultado parcial (sucessos/falhas). Ver `shared/changelog.ts`.
- **Rev. 2389** — GOVERNANÇA/COMPRAS · Guarda determinística impede que OCs de SERVIÇO / ADMINISTRATIVO / TRIBUTO virem item de Almoxarifado. Função `classificarNaturezaItemAlmox` aplicada em `atualizarStatusOrdem` (per-item) + `warehouse.registerSmartEntry` (itemNovo). Ver `shared/changelog.ts`.
- **Rev. 2388** — SEGURANÇA · Controle rígido de auditoria no Almoxarifado: excluir item/unidade + alterar qtd manualmente → senha (se user local) + justificativa; log com snapshot antes/depois; tela de admin pra validar/rejeitar. Nova tabela `almoxarifado_auditoria` (CREATE IF NOT EXISTS). Ver `shared/changelog.ts`.

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
