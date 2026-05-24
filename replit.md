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

- **Rev. 2392** — **ALMOXARIFADO/UX · Após transferir TODO o estoque de um item de obra, o item SOME da lista (soft-delete via `ativo=false`).** Pedido user (IMG_1199, 24/05/2026, 20:27): após usar o lote da Rev. 2390 pra transferir os 6 itens da obra, os cards continuaram aparecendo zerados (0 un, "Sem mínimo", botão Trocar) — viraram fantasmas que poluem a tela. Causa: débito setava `quantidadeAtual=0` mas mantinha `ativo=true`, e a lista filtra por `ativo=true`. **Backend** (`server/routers/warehouse.ts`): UPDATE do débito em `createTransferencia` single (L1259-1270) e `createTransferenciaLote` (L1428-1437) agora seta `ativo=false` via CASE WHEN quando `obraId IS NOT NULL` AND saldo final `<= 0` — atômico, sem race. Itens CENTRAIS ficam visíveis mesmo a 0 (catálogo). Upsert no destino (single L1290-1295, lote L1461-1466) também seta `ativo=true` no UPDATE pra reativar item que zerou anteriormente, evitando duplicatas. Soft-delete preserva FK de `almoxarifado_movimentacoes` e `almoxarifado_transferencias.itemIdOrigem` — histórico íntegro. Zero ALTER/DROP/DELETE (R-001/R-007/R-010 OK).
- **Rev. 2391** — **OBRAS/GOVERNANÇA · Não permitir encerrar obra com estoque no Almoxarifado — pre-check + modal com CTA pra transferir.** Pedido user (IMG_1197, 24/05/2026, 20:23): antes, mudar status da obra pra Concluída/Cancelada/Paralisada era aceito mesmo com itens no almoxarifado da obra — ficavam órfãos sem destino auditável. **Backend** (`server/routers.ts`): nova query `obras.checarEstoquePendente({obraId})` lê `almoxarifado_itens` filtrando `companyId + obraId + ativo + COALESCE(qtd,0)>0` com AUTHZ via `getObraById` + `getEffectiveAllowedObraIds` (anti-IDOR). Guard server-side em `obras.update` SÓ dispara na TRANSIÇÃO pra encerrador (`statusAtual !== data.status` AND novo ∈ {Concluida,Cancelada,Paralisada}) — editar cadastro de obra já encerrada com estoque legado segue permitido. Mensagem humanizada com 3 primeiros itens + "e mais N". **Frontend Obras** (`client/src/pages/Obras.tsx`): `handleSave` async, pre-checa via `trpc.useUtils().obras.checarEstoquePendente.fetch` quando editing+status encerrador; se pendente, abre modal âmbar→laranja listando itens com qtd/unidade e 2 botões: "Cancelar" mantém o FullScreenDialog aberto, "Ir ao Almoxarifado pra transferir" navega via wouter pra `/almoxarifado?obra=<id>`. **Frontend Almoxarifado** (`client/src/pages/almoxarifado/index.tsx` L1238-1258): handler URL param estendido pra ler `?obra=ID` e setar `obraContexto` automaticamente — deep-link já abre filtrado pela obra, user marca itens e usa botão "Transferir" do sticky bar (Rev. 2390). R-001/R-007/R-010 OK.

### Revisões recentes (one-liners)

- **Rev. 2390** — ALMOXARIFADO/UX · Transferência em LOTE no sticky bar do modo seleção (N itens → 1 destino comum, qtd editável por linha). Novo `createTransferenciaLote` itera linha-a-linha reusando lógica do single; modal max-w-2xl roxo→indigo com painel de resultado parcial (sucessos/falhas). Ver `shared/changelog.ts`.
- **Rev. 2389** — GOVERNANÇA/COMPRAS · Guarda determinística impede que OCs de SERVIÇO / ADMINISTRATIVO / TRIBUTO virem item de Almoxarifado. Função `classificarNaturezaItemAlmox` aplicada em `atualizarStatusOrdem` (per-item) + `warehouse.registerSmartEntry` (itemNovo). Ver `shared/changelog.ts`.
- **Rev. 2388** — SEGURANÇA · Controle rígido de auditoria no Almoxarifado: excluir item/unidade + alterar qtd manualmente → senha (se user local) + justificativa; log com snapshot antes/depois; tela de admin pra validar/rejeitar. Nova tabela `almoxarifado_auditoria` (CREATE IF NOT EXISTS). Ver `shared/changelog.ts`.
- **Rev. 2387** — UX · Substituídos os 2 `window.confirm()` nativos que sobravam no Almoxarifado por modais customizados (header red→rose + Trash2). Print iPad mostrava confirm nativo do Safari com URL Replit ocupando 3 linhas + opção "Bloquear caixas". Ver `shared/changelog.ts`.
- **Rev. 2386** — FEATURE · IA sugere categorias para itens "Sem categoria" no Almoxarifado (em lote, com modal de revisão); vocabulário fechado (`almoxarifado_categorias`); apply POR IDS via `atualizarCategoriaEmLote`. Ver `shared/changelog.ts`.

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
