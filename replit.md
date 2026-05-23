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

- **Rev. 2307** — **UX · Pills de filtro por TIPO (Material/MDO/MAT+MDO/Equipamento) na tela Ordens de Compra, com cross-filter de contadores.** Pedido user (23/05/2026): "Filtre tbm, por mão de obra, material, equipamentos, pacotes etc... todos os status que tiverem". A tela tinha pills de status mas nenhum filtro por tipo (só badges coloridos na coluna Número OC). Mesmo padrão da Rev. 2301 (Solicitações). **Implementação** (`client/src/pages/compras/Ordens.tsx`): state `filtroTipo: "todos"|"compra"|"servico"|"pacote"|"equipamento"` (compra = Material default, cobre `tipo` null/vazio). Nova linha de pills logo abaixo das pills de status, cores batem com badges existentes (Material azul, MDO roxo, MAT+MDO indigo, Equipamento ciano). Cada pill exibe contador cross-filter (`contadoresTipo` re-aplica todos os filtros do `filt` EXCETO tipo, agrupa por `(tipo ?? "compra")` pra capturar OCs antigas). Reset do botão de aba "OC" volta `filtroTipo` pra "todos". **R-001/R-007/R-010:** N/A — 100% client-side.
- **Rev. 2306** — **HOTFIX/UX · Estorno do Almoxarifado: liberar Recebimento avulso (sem OC) + sinalizar mov vinculada a OC como não-selecionável.** Print user (23/05/2026, 18h03): das 606 movs, quase todas vinham de Recebimento ("Recebimento inteligente" puro ou "OC OC-XXX entregue") e o regex `/^\s*recebimento\b/i` da Rev. 2305 bloqueava ambos — feature ficou inútil. **Backend** (`server/routers/warehouse.ts`): helper `isFromOcOrSmartEntry` virou `isLinkedToOc`, mantendo APENAS `/\boc[\s-]/i`. Justificativa: o que de fato dessincroniza é o vínculo com OC (estorno sem mexer em `qtd_entregue`/status da OC deixa OC mentindo); recebimento avulso sem OC só atualizou estoque, estornar reverte exatamente isso. Mensagem reformulada: "Vinculada a Ordem de Compra — estorne pela tela de Recebimentos para reverter o status da OC". **UX** (`Movimentacoes.tsx`): novo flag `vinculadaOc`; em modo seleção, cards de OC mostram `Ban` no slot do checkbox (mesmo tratamento das estornadas) + tooltip "Vinculada a OC — estorne pela tela de Recebimentos"; `podeSelecionar` agora é `!estornada && !vinculadaOc` (clique não responde, economiza tentativas+toasts). Tooltips também para casos válidos/estornadas. **R-001/R-007/R-010:** N/A — só regra de negócio + UX.
### Revisões recentes (one-liners)

- ~~Rev. 2305~~ — FEAT · Seleção múltipla + ESTORNO em lote de movimentações do Almoxarifado (soft-delete auditável + transação atômica + multi-tenant). Ver `shared/changelog.ts`.
- ~~Rev. 2304~~ — FEAT/UX · Filtro por PERÍODO em Movimentações (pills Todos/Hoje/7d/30d/Este mês/Personalizado + range customizado com helpers de fuso local). Ver `shared/changelog.ts`.
- ~~Rev. 2303~~ — FEAT/REGRA-DE-OURO · Recebimento só na obra da SC/OC + obra clicável (`filtroObra`) em Movimentações; hard-check backend em `registerSmartEntry`. Ver `shared/changelog.ts`.
- ~~Rev. 2302~~ — HOTFIX CRÍTICO · "Aprovar e Gerar OC" estourava: 7 colunas locação faltavam em `compras_ordens`. Auto-migration SyncSchema+ Rev. 2302. Ver `shared/changelog.ts`.
- ~~Rev. 2301~~ — UX · Pills de filtro por TIPO em Solicitações de Compra (Material/MDO/Pacote/Equip/Manutenção) com cross-filter; helper `effectiveTipo()`. Ver `shared/changelog.ts`.

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
