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

- **Rev. 2301** — **UX · Filtro por TIPO em pills coloridos na tela Solicitações de Compra (substitui o dropdown "Classificação") com contador cross-filter por status.** Pedido user (23/05/2026): "Quero filtro aqui tbm, para solicitação de material, mão de obra, equipamentos... todos status que temos para facilitar a usabilidade". Mesmo pedido que motivou a Rev. 2298 em Cotações. O filtro JÁ EXISTIA como dropdown mas passava despercebido — virou linha de 6 pills coloridos (Todos slate / Material azul·Package / MDO roxo·HardHat / Pacote indigo·Layers / Equipamento ciano·Warehouse / Manutenção âmbar·Wrench) lado a lado com busca e filtro de obra. Cada pill mostra contador com **cross-filter**: respeita busca + obra + status (cards breakdown + KPI Pend. OC/Entrega) e só ignora o próprio filtro de classificação — escolhendo "Pendente" no breakdown superior, os pills mostram quantas SCs pendentes existem por tipo. Refactor leve: helper `effectiveTipo(r)` (L2263-2271) unifica a regra de "manutencao" (cobre `pecas_veiculo` + `manutencao` + qualquer SC com `vehicleId`). Mudanças em `client/src/pages/compras/Solicitacoes.tsx`: imports HardHat/Warehouse/Wrench, helper `effectiveTipo`, `listaFiltradaObraSemBreakdown` simplificado, dropdown substituído por IIFE com pills (L2491-2528). State `filtroClassificacao` preservado. **R-001/R-007/R-010:** N/A — 100% client-side.
- **Rev. 2300** — **FEAT/UX · Funcionários Terceiros: múltipla seleção + barra de ações pra alterar status (Apto/Inapto/Pendente) de vários funcionários de uma vez.** Pedido user (23/05/2026): "Quero múltipla seleção para poder alterar o status de todos de uma vez ou alguns específicos". Antes só dava pra editar um por vez via form. Agora: checkbox em cada card (com ring azul no card selecionado), header "Selecionar todos (N)" sobre a lista FILTRADA (respeita busca + Empresa + Aptidão), e barra sticky azul quando há seleção, com 3 botões coloridos (verde=Apto / vermelho=Inapto / âmbar=Pendente) + "Limpar". Backend: reutiliza `trpc.terceiros.funcionarios.update` (já aceita `statusAptidao` no Zod) via `bulkUpdateMut` SILENCIOSA + `Promise.allSettled` com `mutateAsync` pra paralelizar e tolerar falha parcial — 1 toast no fim (`X atualizados, Y falharam` quando aplicável), 1 refetch só. `window.confirm` antes do bulk pra evitar clique acidental. Mudanças em `client/src/pages/terceiros/FuncionariosTerceiros.tsx`: imports Checkbox/Loader2, state `selectedIds: Set<number>` + `bulkBusy`, helpers `toggleSelect`/`toggleSelectAll`/`bulkSetStatus`, barra sticky L376-394, header L396-408, checkbox no card L424-428. **R-001/R-007/R-010:** N/A — updates legítimos via tRPC com `companyFilter` no escopo.
### Revisões recentes (one-liners)

- ~~Rev. 2299~~ — HOTFIX · Funcionários Terceiros: typo `statusAptidaoTerceiro`→`statusAptidao` no cliente (5 sites) destravou filtros e contadores. Ver `shared/changelog.ts`.
- ~~Rev. 2298~~ — UX · Segunda linha de filtros na tela Cotações: pills por TIPO (Material/MDO/Pacote/Equipamento) com cross-filter de contadores. Ver `shared/changelog.ts`.
- ~~Rev. 2297~~ — UX/Padrão global · Componente `<PersonPhoto>` com lightbox embutido aplicado em 5 telas SEM zoom anterior. Ver `shared/changelog.ts`.
- ~~Rev. 2296~~ — UX · Filtros de status da tela Cotações em pills coloridos com ícone + contador (Todos/Pendente/Aprovada/Concluída/Recusada/Expirada). Ver `shared/changelog.ts`.
- ~~Rev. 2295~~ — FEAT/UX · Auto-cotação ao criar SC (qualquer tipo, incluindo EQUIP·LOC) + Coluna "Aprovação"→"Tipo" + nova coluna "Prioridade" ordenáveis em Solicitacoes.tsx. Ver `shared/changelog.ts`.

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
