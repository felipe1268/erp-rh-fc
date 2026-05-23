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

- **Rev. 2295** — **FEAT/UX · Auto-cotação ao criar SC (qualquer tipo, incluindo EQUIP·LOCAÇÃO) + Coluna "Aprovação" virou "Tipo" e nova coluna "Prioridade" ordenáveis na tabela de SCs.** Pedido user (23/05/2026): "as cotações aprovadas venham diretamente para as cotações.. não veio a solicitação de locação de equipamento.. preciso poder organizar as colunas". Server (`server/routers/compras.ts` L2796-2906): `criarSolicitacao` agora insere itens com `.returning()` e em seguida (try/catch independente) cria automaticamente 1 `comprasCotacoes` `status="pendente"` (numeroCotacao `COT-AAAA-NNNN`, tipo herdado, solicitacaoId apontando pra SC) + N `comprasCotacoesItens` mapeando 1-pra-1 com `precoUnitario=0`, e `UPDATE comprasSolicitacoes SET status="cotacao"`. Falha silenciosa não derruba a SC. Resolve o ponto "SC de locação não aparecia em /compras/cotacoes" — ela existia mas ninguém disparou o "Enviar para Cotação"; agora o disparo é automático. Client (`Solicitacoes.tsx`): `SortKey` (L1109) trocou `aprovacaoStatus` por `tipo` + `prioridade`; switch `getVal` (L2290-2307) adicionou case `tipo` (string ordenada com sufixo `_loc` pra agrupar EQUIP·LOC perto de EQUIP) e `prioridade` (peso semântico URGENTE=0→ALTA=1→NORMAL=2→BAIXA=3, NÃO alfabético); cabeçalho clicável da coluna "Aprovação" foi substituído por "Tipo" + "Prioridade" inserida ao lado (L2586-2598); a célula `<AprovBadge>` deu lugar a 2 células novas — badge Tipo (MAT azul, MDO roxo, MAT+MDO indigo, EQUIP cyan, EQUIP·LOC cyan, VEÍC teal) e badge Prioridade (URGENTE vermelho, ALTA laranja, NORMAL slate, BAIXA cinza); `colSpan` 9→10. Botão manual "Enviar para Cotação" mantido pra back-compat/segurança. Função `AprovBadge` mantida no código (cleanup futuro). **R-001/R-007/R-010:** N/A (só INSERT e UPDATE de status; nenhuma DDL).
- **Rev. 2294** — **FEAT/UX · Aprovação automática de SC e OC — fluxo manual descontinuado. "Se tem SC, o ERP já entende como aprovada".** Pedido user (23/05/2026): "TIRAR A FUNÇÃO DE PRECISAR APROVAR A OS, OU OC". Server (`server/routers/compras.ts`): `criarSolicitacao` (L2742) agora insere SC com `aprovacaoStatus="aprovada"` + `aprovadoEm=now` + aprovador=criador; `criarCotacao` (L3339) removeu o gate `aprovacaoStatus!=="aprovada"` (só bloqueia recusada); `criarOrdemDeCotacao` (L6128) força OC sempre `status="aprovada"` mesmo com estouro de orçamento (persiste `aprovacaoExtraMotivo` pra auditoria, sem gate). Backfill aditivo idempotente em `server/_core/index.ts` (L850-877): `UPDATE compras_solicitacoes SET aprovacao_status='aprovada' WHERE aprovacao_status='aguardando' AND status NOT IN ('cancelado','recusado')` + `UPDATE compras_ordens SET status='aprovada', aprovacao_status='aprovado' WHERE status='aguardando_aprovacao_extra'`. Validação pós-restart: 219 SCs aprovadas (1 SC cancelada preservada). Client: bloco APROVAÇÃO removido do detalhe SC (L5134-5194); banner "Aguardando aprovação" removido (L5460); gate do botão "Enviar para Cotação" removido (L5469); botão "Aprovar Selecionadas" do batch removido (L2501); página `Aprovacoes.tsx` substituída por tela informativa "Aprovações automáticas" com CTA pra Solicitações; menu "Aprovações Pendentes" removido (`DashboardLayout.tsx` L396 + `shared/modules.ts` L470). Mutations legadas (`aprovarSolicitacao`, `aprovarOcExtra`) mantidas no tRPC pra back-compat. **Emergencial.tsx mantido com dupla aprovação** (caso especial). **R-001/R-007/R-010:** N/A (backfill é UPDATE de status em colunas existentes, sem DROP/DELETE).
### Revisões recentes (one-liners)

- ~~Rev. 2293~~ — HOTFIX CRÍTICO · Sumiram todas as SCs — colunas locação faltavam no Neon PROD; auto-migration SyncSchema+ idempotente. Ver `shared/changelog.ts`.
- ~~Rev. 2292~~ — UX · Modal "Descartar solicitação?" redesenhado no padrão FC (faixa âmbar + footer sticky). Ver `shared/changelog.ts`.
- ~~Rev. 2291~~ — HOTFIX/DX · Erro real do Postgres agora exposto no toast + server log ao criar SC (cause.message). Ver `shared/changelog.ts`.
- ~~Rev. 2290~~ — FEAT · Locação de Equipamento na SC (engenheiro indica o aluguel + período já na Solicitação). Ver `shared/changelog.ts`.
- ~~Rev. 2289~~ — FEAT/UX · Filtro por VÍNCULO (CLT/PJ/TERCEIRO) na tela Efetivo da Obra. Ver `shared/changelog.ts`.

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
