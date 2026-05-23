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

- **Rev. 2310** — **UX · Barra de progresso 0→100% no modal de importação PDF (IA) de contratos de locação.** Pedido user (23/05/2026): "Coloca a barra de 0 a 100%". O modal de Importar PDF (Rev. 2308) mostrava apenas um spinner com texto "IA analisando layout... 10-30s" — sem indicação visual de progresso, o que dava sensação de travamento durante chamadas longas ao Gemini. **Implementação** (`client/src/pages/equipamentos/Locados.tsx`): novo state `importProgresso` (0-100), `useEffect` dispara `setInterval` (200ms) enquanto `parsearPdf.isPending=true` e calcula progresso com curva **ease-out** (`pct = 95 * (1 - (1-t)²)` sobre estimativa de 20s) — cresce rápido e desacelera perto de 95%; `onSuccess` força 100%; `onError` zera. UI: substitui spinner por barra de 12px com gradient `indigo→purple→fuchsia` em pista `bg-indigo-100 ring-1`, contador `{pct}%` em bold tabular à direita, ícone Sparkles pulsando à esquerda, hint "Tempo típico: 10–30s · não feche esta janela". Gemini não expõe progresso real (resposta blocking single-shot), então é animação estimada — preferida a spinner mudo. **R-001/R-007/R-010:** N/A — 100% client-side.
- **Rev. 2309** — **UX · Redesign moderno da tela Equipamentos Locados + modal "Receber locação" turbinado.** Pedido user (23/05/2026): "quero um layout moderno e inovador... quero poder receber os equipamentos pelo botão receber para facilitar o fluxo". A tela tinha layout corporativo cinza com tabela densa de 7 colunas; o modal de receber era um grid 2-col sem hierarquia visual. **Tela principal** (`client/src/pages/equipamentos/Locados.tsx`): (a) **hero header** com gradient emerald→teal→cyan, glassmorphism nos botões, ícone Truck em badge ring; (b) **KPI cards** modernos (novo helper `Kpi`) com ícone colorido em badge + valor 3xl + ring colorida por tint (blue/amber/red/emerald); (c) **pills de filtro de status** com gradient quando ativo + contador inline (substitui o `<select>` antigo); (d) **lista em cards** 1-2-3 colunas responsivos (substitui a tabela): faixa de cor de 1px no topo por status, foto 16×16 com fallback Camera, badge de status redondo, footer com período/preço, ações pílula (Histórico/Check-in/Devolver). **Modal "Receber locação"**: 100% reorganizado em 5 seções com ícone+título colorido (novo helper `Section`): Equipamento (emerald) → Fornecedor (blue) → Período & Valores (amber) → Responsabilidade & Observações (slate) → Fotos do recebimento (red). **0 lógica de negócio alterada** — mesmas procedures tRPC, mesmo schema. Sidebar (`DashboardLayout.tsx`): item "Locados" renomeado pra "Equipamentos Locados". **R-001/R-007/R-010:** N/A — 100% client-side.
### Revisões recentes (one-liners)

- ~~Rev. 2308~~ — FEAT · Importação em lote de contratos de locação via PDF (Gemini Vision); SyncSchema+ aditivo. Ver `shared/changelog.ts`.
- ~~Rev. 2307~~ — UX · Pills de filtro por TIPO (Material/MDO/MAT+MDO/Equipamento) na tela Ordens de Compra, com cross-filter de contadores. Ver `shared/changelog.ts`.
- ~~Rev. 2306~~ — HOTFIX/UX · Estorno do Almoxarifado: liberar Recebimento avulso (sem OC) + sinalizar mov vinculada a OC como não-selecionável. Ver `shared/changelog.ts`.
- ~~Rev. 2305~~ — FEAT · Seleção múltipla + ESTORNO em lote de movimentações do Almoxarifado (soft-delete auditável + transação atômica + multi-tenant). Ver `shared/changelog.ts`.
- ~~Rev. 2304~~ — FEAT/UX · Filtro por PERÍODO em Movimentações (pills Todos/Hoje/7d/30d/Este mês/Personalizado + range customizado com helpers de fuso local). Ver `shared/changelog.ts`.

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
