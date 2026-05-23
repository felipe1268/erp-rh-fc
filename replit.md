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

- **Rev. 2304** — **FEAT/UX · Filtro por PERÍODO de recebimento na tela Movimentações do Almoxarifado (pills de presets + range personalizado).** Pedido user (23/05/2026): "Quero poder filtrar por período de recebimento de materiais". Antes a tela mostrava só os últimos 300 registros — sem recorte temporal. **UX:** novo bloco "Período" (card branco, ícone `CalendarRange` emerald) com 6 pills: Todos / Hoje / Últimos 7 dias / Últimos 30 dias / Este mês / Personalizado. "Personalizado" abre 2 `<input type=date>` (De/Até) com constraints mútuos `min`/`max` + atalho "Limpar datas". Linha emerald-700 confirma "Mostrando recebimentos de DD/MM/AAAA até DD/MM/AAAA." quando há recorte. Cards do topo (Total/Entradas/Saídas) agora respondem à lista FILTRADA (antes contavam universo bruto). **Implementação** (`client/src/pages/almoxarifado/Movimentacoes.tsx`): helpers locais `toLocalIso/addDays/startOfMonth/brDate` p/ evitar bug de fuso (UTC→BR à noite faria "Hoje" pular um dia — mesmo padrão Rev. 2081); state `filtroPeriodo` + `dataInicio` + `dataFim`; `useMemo range` resolve `{ini,fim}` (custom aceita range parcial com auto-troca se ini>fim). Filtro aplicado no `useMemo lista` em AND com obra + busca + tipo, normalizando `criadoEm` via `toLocalIso(new Date(...))`. `limit` subiu de 300 → 1500 (Este mês passa de 300 fácil). Backend intocado. **R-001/R-007/R-010:** N/A — 100% client-side.
- **Rev. 2303** — **FEAT/REGRA-DE-OURO · Recebimento de material SÓ pode acontecer na obra da SC/OC + obra clicável na tela Movimentações (Almoxarifado).** Pedido user (23/05/2026, print de Movimentações): "Preciso poder clicar e localizar, em qual obra foi recebida... e só pode receber na obra que foi feita a solicitação e ordem de compra". Duas dores: (1) auditabilidade fraca — obra era texto morto nos cards; (2) risco de baixa cruzada — backend só checava `companyId`, então se o user na "Obra A" selecionasse uma OC da "Obra B" (visão geral, sem filtro obra), o estoque entrava em A e a quantidade era debitada da OC de B. **Fix UI** (`client/src/pages/almoxarifado/Movimentacoes.tsx`): ícone `MapPin` no lugar do `📍`, nome da obra vira `<button>` clicável (hover emerald) que seta `filtroObra: {id, nome}`; pill ativa no topo "Filtrando por obra: NOME" + botão "Limpar". `useMemo` da lista respeita filtroObra em AND com busca + tipo. `listMovements` já retornava `obraId/obraNome` — sem mexer backend pra essa parte. **Fix Backend** (`server/routers/warehouse.ts` `registerSmartEntry` L1537-1570): `select` da `ocCheck` virou leftJoin com `obras` pra trazer `obraNome` no mesmo round-trip; nova regra: input sem obra + OC com obra → auto-anexa `input.obraId = ocCheck.obraId`; input com obra ≠ OC → `TRPCError BAD_REQUEST` com message dedicada ("Esta OC OC-XXXX foi emitida para «obra Y». O recebimento só pode ser feito na MESMA obra da solicitação/ordem de compra."). Hard-check no backend é barreira final pra qualquer UI futura (Mobile, API). **R-001/R-007/R-010:** N/A — só leitura + INSERT/UPDATE de recebimento.
### Revisões recentes (one-liners)

- ~~Rev. 2302~~ — HOTFIX CRÍTICO · "Aprovar e Gerar OC" estourava: 7 colunas locação faltavam em `compras_ordens`. Auto-migration SyncSchema+ Rev. 2302. Ver `shared/changelog.ts`.
- ~~Rev. 2301~~ — UX · Pills de filtro por TIPO em Solicitações de Compra (Material/MDO/Pacote/Equip/Manutenção) com cross-filter; helper `effectiveTipo()`. Ver `shared/changelog.ts`.
- ~~Rev. 2300~~ — FEAT/UX · Funcionários Terceiros: múltipla seleção + barra de ações bulk (Apto/Inapto/Pendente) via Promise.allSettled. Ver `shared/changelog.ts`.
- ~~Rev. 2299~~ — HOTFIX · Funcionários Terceiros: typo `statusAptidaoTerceiro`→`statusAptidao` no cliente (5 sites) destravou filtros e contadores. Ver `shared/changelog.ts`.
- ~~Rev. 2298~~ — UX · Segunda linha de filtros na tela Cotações: pills por TIPO (Material/MDO/Pacote/Equipamento) com cross-filter de contadores. Ver `shared/changelog.ts`.

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
