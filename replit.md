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

- **Rev. 2382** — **FEATURE · Multi-seleção de itens no Almoxarifado: alterar categoria em lote + unificar duplicatas (mesma obra, mesmo nome, mesma unidade) somando quantidades.** Pedido user (IMG_1182, 24/05/2026): "Preciso ter a opção de múltipla seleção e poder alterar as categorias de todos selecionados, preciso que o ERP unifique todos itens iguais, da mesma obra". **Backend** (`server/routers/compras.ts`): `atualizarCategoriaEmLote({ companyId, ids[], categoria })` com UPDATE escopado por `inArray`; `unificarItensEmLote({ companyId, ids[], dryRun })` agrupa por `obraId + nome normalizado (strip [N.N]) + unidade`, canonical = item com MAIOR quantidade, migra `almoxarifado_movimentacoes.item_id` + `almoxarifado_recebimento_itens.item_id` → canonical, soma quantidades, marca outros como `ativo=false` (NUNCA DELETE — R-010 OK). **Frontend** (`client/src/pages/almoxarifado/index.tsx`): botão "Selecionar" indigo (CheckSquare) na filter bar toggla `modoSelecao`; cards ganham ring indigo + checkbox 7x7 no canto sup-esq; sticky bar bottom (z-100) com contador + "Alterar categoria" (emerald Tag → modal com select) + "Unificar duplicatas" (violet Layers → preview dos grupos com qtd antes/depois → confirmar). Ambos os modais seguem padrão Rev. 2378+.
- **Rev. 2381** — **FEATURE · Botão "Trocar foto" nos cards do Almoxarifado: user ajuda a IA fornecendo termo de busca mais específico (modal com input + preview antes de aplicar).** Pedido user (24/05/2026): "Preciso poder alterar uma foto do item se eu quiser, quero é ajudar a IA a acertar a busca". Cards com foto não tinham como trocar; busca automática (Rev. 2377) usa o nome do item, mas nomes genéricos retornam imagens ruins. **Backend** (já existia desde Rev. 2369/2377): `buscarFotoWebPorNome` aceita `queryOverride` + `dryRun`. **Frontend** (`client/src/pages/almoxarifado/index.tsx`, UI-only): novo botão "Trocar" violet (Sparkles) no canto inferior direito dos cards COM foto; state `rebuscarFoto` com nome/termo/previewUrl/buscando/aplicando/erro; modal violet centralizado com input pré-preenchido editável + botão Buscar (dryRun=true) → preview com img object-contain + banner emerald "Foto encontrada" → "Usar esta foto" repete com `sobrescrever=true`. Backdrop clicável só quando idle. **R-001/R-007/R-010 OK:** só UPDATE escopado, zero DDL.

### Revisões recentes (one-liners)

- **Rev. 2380** — UX · Widget de progresso da "Busca de fotos na web" reformulado em card 340px com "{pct}%" gigante + ETA dinâmica + barra h-3 sky→blue + 3 contadores no footer. Ver `shared/changelog.ts`.
- **Rev. 2379** — UX · Polimento do modal "Buscar fotos" + conversão do `window.confirm()` do botão "Preencher preços com IA" pra modal violet/purple com Sparkles. Mesmo layout dos modais de fotos. Ver `shared/changelog.ts`.
- **Rev. 2378** — UX · Substituído `window.confirm()` por modal customizado no fluxo "Buscar fotos da web" do Almoxarifado. Print do iPad mostrava nativo Safari com URL Replit ocupando 3 linhas no título. Header sky/blue + Globe, body com bullets, z-[110]. UI-only. Ver `shared/changelog.ts`.
- **Rev. 2377** — FEATURE · "Buscar fotos da web" no Almoxarifado — mesma abordagem da Rev. 2366 (DDG Images, 1 chamada por nome, UPDATE em lote). Backend `compras.buscarFotoWebPorNome` com match normalizado por regex (strip `[N.N]` em ambos lados). Frontend: botão hero "Fotos da web" + botão por card + widget de progresso. Ver `shared/changelog.ts`.
- **Rev. 2376** — UX/ALERTA · Botão ENTRADA do Almoxarifado pisca com badge vermelho mostrando quantas OCs de MATERIAL estão pendentes (complementa Rev. 2375 que tratou só LOCAÇÃO). Nova `warehouse.listPendingOCs.useQuery` com refetch 60s. UI-only. Ver `shared/changelog.ts`.

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
