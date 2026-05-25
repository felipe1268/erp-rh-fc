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

- **Rev. 2399** — **FINANCEIRO/LANÇAMENTOS · Filtro por período LIVRE (calendário aberto, passado E futuro) substitui o dropdown de mês.** Pedido user (IMG_image_1779708822339, 25/05/2026): lançamentos lançados pra meses futuros ficavam invisíveis (cards zerados) embora aparecessem em Contas a Pagar — o dropdown de mês listava só os ÚLTIMOS 12 meses, sem futuro. Causa-raiz: o filtro padrão era `mesCompetencia` (mês único) e o array de meses (`d.setMonth(d.getMonth() - i)` x12) era retroativo. O endpoint `financial.getEntries` já aceitava `dataInicio`/`dataFim` (server/routers/financial.ts L509-510), só não era usado. **Frontend** (`client/src/pages/financeiro/FinanceiroLancamentos.tsx`): novos helpers `getPrimeiroDiaMes`/`getUltimoDiaMes`; state `mes` removido → 2 states `dataInicio` + `dataFim` (default = mês atual completo); `getEntries.useQuery` passa o range em vez de `mesCompetencia`; `limit` subiu 200→500. Toolbar ganhou 2 `<Input type="date">` (De / Até) + 4 atalhos rápidos: "Mês anterior", "Mês atual", "Próximo mês", "Ano todo". Tipo/Status/Busca preservados. Zero mudança em backend (filtros pré-existentes). R-001/R-007/R-010 OK.
- **Rev. 2398** — **FINANCEIRO/LANÇAMENTOS · Botões de Editar e Excluir em cada linha da lista de lançamentos.** Pedido user (25/05/2026): lista só tinha X (cancelar) + Pagar/Receber, faltava editar/excluir. Causa-raiz: backend não tinha endpoint `updateEntry` geral (só `updateEntryStatus`); edição de lançamento manual era um buraco no fluxo. **Backend** (`server/routers/financial.ts` L1445-1517): novo `updateEntry` com SET dinâmico (descricao, valorPrevisto, dataCompetencia, dataVencimento, contaNome, obraNome, formaPagamento, fornecedorNome, observacoes, natureza, tipo). Guards: bloqueia status `pago`/`recebido` (FORBIDDEN — estornar antes), `cancelado`, e `origem_modulo NOT IN (null, 'recorrente')` (não deixa mascarar entries de OC/folha/almox). Audit log `financial_entry_updated` com snapshot do antes + `ctx.user`. **Frontend** (`client/src/pages/financeiro/FinanceiroLancamentos.tsx`): novo state `editEntryId`/`showDelete`/`deleteMotivo`; `updateEntryMut`+`deleteEntryMut`; `openEditEntry(l)` valida origem/status na UI antes de abrir modal e preenche `form` com todos os campos (inclui fornecedorNome da Rev. 2396 + natureza herdada da Rev. 2397). Reusa Dialog "Novo Lançamento" — header dinâmico ("Editar Lançamento" quando `editEntryId`) e esconde toggle Único/Recorrente. `handleSave` non-recorrente despacha pra updateEntry quando editando. Lista (L601-632) ganha 3 botões: **Editar (Pencil azul)** se manual+não-finalizado → **Excluir (Trash2 rose)** se status != pago/recebido → **Cancelar (X cinza)** mantém comportamento legado. Modal de exclusão (max-w-sm rose) com badge "remove definitivamente", Textarea de motivo (min 5 chars) + contador, botão destructive. R-001/R-007/R-010 OK.
### Revisões recentes (one-liners)

- **Rev. 2397** — FINANCEIRO/LANÇAMENTOS · Natureza (Fixo/Variável) herda da categoria via `financial_accounts.natureza`; `categoriasFiltradas` propaga campo + `useEffect` sincroniza `form.natureza`; Select fica `disabled` com chip "DA CATEGORIA". Ver `shared/changelog.ts`.
- **Rev. 2396** — FINANCEIRO/CONTAS A PAGAR · Nome do fornecedor visível na lista e no detalhe. ADD COLUMN IF NOT EXISTS `fornecedor_nome` em `financial_entries` + backfill via JOIN com `financial_recurring_entries`; `createEntry`/`materializeRecorrentes` copiam o campo; UI mostra `" — {fornecedor}"` na lista e linha "🏢" no modal. Ver `shared/changelog.ts`.
- **Rev. 2394** — ALMOXARIFADO/CONFIG · Cadastro de Categorias exposto em Configurações + `excluirCategoria` migra itens pra "Sem categoria" (UPDATE categoria=NULL) atomicamente em `db.transaction`. Ver `shared/changelog.ts`.
- **Rev. 2393** — ALMOXARIFADO/UX · Drag-to-select (lasso) na grade de cards via Pointer Events + botão "Excluir" red→rose no sticky bar do modo seleção (reusa `ModalConfirmacaoAuditoria` da Rev. 2388). Ver `shared/changelog.ts`.
- **Rev. 2392** — ALMOXARIFADO/UX · Após transferir TODO o estoque de um item de obra, o item SOME da lista (soft-delete via `ativo=false`). UPDATE em `createTransferencia`/`createTransferenciaLote` seta `ativo=false` via CASE WHEN quando obraId IS NOT NULL e saldo final ≤ 0; upsert no destino reativa via `ativo=true` evitando duplicata. Ver `shared/changelog.ts`.

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
