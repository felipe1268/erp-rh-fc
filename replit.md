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

- **Rev. 2324** — **FEATURE · Dashboard consolidada Almoxarifado & Equipamentos — análise unificada em abas separadas.** Pedido user (23/05/2026): "Crie uma aba na barra lateral com um dashboard contendo TUDO do módulo Almoxarifado + Equipamentos em abas separadas para análise". **Implementação 100% client-side** (zero endpoint novo, zero schema): novo `client/src/pages/dashboards/DashAlmoxarifadoEquipamentos.tsx` com 6 tabs (Visão Geral, Estoque, Movimentações, Ferramentas Terceiros, Equip. Próprios, Equip. Locados) usando padrão DashboardLayout + DashKpi + DashChart + shadcn Tabs (mesma estética dos outros 19 dashboards). Agregados em `useMemo` consumindo procedures existentes: `compras.listarItens` (valor parado, abaixo do mínimo, top categorias), `warehouse.listMovements` (entradas vs saídas bucketizadas em janela fixa de 30d), `warehouse.listOpenLoans/listInsumos/listTransferencias` (KPIs operacionais), `equipamentos.propriosListar` (status + valor ativo), `equipamentos.locadosListar` (ativos/devolvidos/atrasados/vencendo 30d, custo mensal por obra+fornecedor, sem-obra), `ferramentasTerceiros.listarRegistros` (raw SQL snake_case: `empresa_terceira`, `qtd_itens`, `obra_id`, `criado_em`), `obras.listActive` (Map p/ resolver nome). Rota `/dashboards/almoxarifado-equipamentos` com `route="/almoxarifado"` no RouteGuard pra herdar permissão. Nova seção "Análise" no `menuSectionsAlmoxarifado` (DashboardLayout.tsx L474) com BarChart3 icon. **Decisões**: (a) janela de 30 dias para movs evita endpoint novo de agregação; (b) "custo mensal" soma `valorMensal` SÓ de `status='em_uso'` p/ refletir recorrência atual; (c) reaproveita padrão visual de DashEpis pra consistência. **R-001/R-007/R-010:** N/A — read-only puro, zero DDL/DML. Multi-tenant herdado das procedures (filtro `companyId` + `getEffectiveAllowedObraIds`).
- **Rev. 2323** — **FEATURE · Equipamentos Locados — vínculo de obra visível + multi-seleção pra vincular/excluir em lote.** Pedido user (23/05/2026, screenshot da lista com vários cards "SAPATAS AJUSTÁVEIS · Sem fornecedor" sem obra): "Quero que apareça os nomes das obras em andamento, para que eu possa vincular os equipamentos locados. Quero múltipla seleção para poder apagar todos de uma vez". **Implementação**: (1) **Server** (`server/routers/equipamentos.ts`): 2 procedures novas — `locadosVincularObraLote({companyId, ids[1..500], obraId|null})` faz UPDATE em transação + grava evento `VINCULO_OBRA` por equipamento (auditoria); `locadosExcluirLote({companyId, ids[1..500]})` deleta eventos primeiro (FK em `equipamento_locado_id`) e depois os locados, tudo em transação. (2) **Client** (`client/src/pages/equipamentos/Locados.tsx`): query `trpc.obras.listActive` → `Map<obraId, nome>` (memoizado); nova linha no card mostrando "📍 Nome da Obra" em verde quando vinculada ou "⚠ Sem obra vinculada" em âmbar; checkbox por card + checkbox "Selecionar todos visíveis (N)" no painel de filtros; quando `selecionados.size > 0` aparece **action bar fixa** no rodapé (z-40, full-width) com dropdown de obras + botão "Vincular" (azul) + botão "Excluir N" (vermelho, com `window.confirm` avisando que o histórico TAMBÉM será removido). Card selecionado fica destacado com border-emerald-500 + ring-2. (3) Lista server-side já retornava `obraId` — só precisei renderizar. **Segurança multi-tenant**: ambas as procedures fazem `getCompaniesForUser(ctx.user)` e bloqueiam com `FORBIDDEN` se o `companyId` não pertencer ao usuário (padrão idêntico ao `compras.ts`); `vinculados` no retorno conta linhas realmente atualizadas. **R-001/R-007/R-010:** o DELETE é via mutation **iniciada pelo user** (CRUD legítimo da aplicação, não comando ad-hoc), com escopo por `companyId` + `id` + transação atômica — fora do escopo da regra que proíbe DELETEs administrativos.
### Revisões recentes (one-liners)

- ~~Rev. 2322~~ — HOTFIX/UX · Botão "Confirmar e cadastrar" da importação PDF — diálogo de erro substitui toast invisível no iPad. Ver `shared/changelog.ts`.
- ~~Rev. 2321~~ — HOTFIX/INFRA · Importação PDF migrada pra polling (Start+Status); proxy Replit matava em 60s. Ver `shared/changelog.ts`.
- ~~Rev. 2320~~ — HOTFIX/IA · `maxOutputTokens` 32k→65k + reparo de JSON truncado em PDF de locação. Ver `shared/changelog.ts`.
- ~~Rev. 2319~~ — HOTFIX/DB · CREATE TABLE IF NOT EXISTS para `equipamentos_locados` + `equipamento_locado_eventos` no SyncSchema+. Ver `shared/changelog.ts`.
- ~~Rev. 2318~~ — UX/HOTFIX · Barra de progresso da importação PDF não trava mais em 95% (creep 95→99% + estimativa realista 35s). Ver `shared/changelog.ts`.

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
