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

- **Rev. 2407** — **EQUIPAMENTOS LOCADOS/IMPORT · Multi-PDF no modal "Importar contratos de locação (PDF · IA)" — N arquivos da MESMA empresa de uma vez, com acúmulo no preview.** Pedido user (25/05/2026): "QUERO PODER IMPORTAR VARIOS PDFS DE UMA VEZ... SE FOR DA MESMA EMPRESA". Hoje cada PDF exige drop→esperar 30-60s→confirmar→reabrir modal. Com 8 PDFs JALVES/MILLS num fechamento, são minutos perdidos em cliques. 100% client-side em `client/src/pages/equipamentos/Locados.tsx`: novo state da fila (`importFilas`/`importTotalFiles`/`importFileIdx` + `importFilasRef` pra escapar do closure stale do polling), novo `handlePdfPickMultiple(files[])` que enfileira e dispara o 1º, `processarArquivoPdf(file)` extraído pra ser reusado. Poll done branch acumula no preview com `setImportPreview(prev => prev ? [...prev, ...comMatch] : comMatch)` e auto-avança pro próximo da fila com `setTimeout(50)`. Branches error/expired também avançam (não trava o batch). UI: `<input multiple>`, badge `1/8` indigo no display do arquivo atual, botão `+ Adicionar PDFs`, card listando a fila pendente. Zero backend, zero migration. R-001/R-007/R-010 OK. Detalhe completo: `shared/changelog.ts`.
- **Rev. 2406** — **ALMOXARIFADO/UX · Filtro por vínculo Equipamento (Próprio/Locado/Qualquer/Nenhum) nas 2 barras de filtro da Visão Geral.** Sequência natural das Revs. 2404/2405: com o backfill materializando 1218+ locados como itens de almox, o almoxarife precisa segmentar a lista pra ver só equipamento (ou só consumível). Implementação 100% client-side em `client/src/pages/almoxarifado/index.tsx`: novo state `filtroEquip` (5 valores), filtro aplicado no useMemo `lista` (L824, view por-almox) e no `consListFinal` (L1599, view consolidada), 2 `<select>` indigo idênticos inseridos logo após o select de categoria. Semântica: `todos` (default, sem filtro), `vinculado` (qualquer dos 2 tipos), `proprio`/`locado` (específico), `nenhum` (sem vínculo, foco em consumíveis). KPIs do topo continuam refletindo o universo total. Zero backend (campo `equipamentoVinculadoTipo` já vem do SELECT *). R-001/R-007/R-010 OK. Detalhe completo: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2405** — ALMOXARIFADO ← EQUIPAMENTOS · Sync reverso (vínculo bidirecional). Novo `server/lib/almoxEquipamentoSync.ts` com `ensureAlmoxItemForEquipamento` (idempotente, INSERT/UPDATE conforme transferência) + `backfillAlmoxFromEquipamentos` (SQL bulk no startup). Hooks `locadoCriar`/`locadoAtualizar`. Zero migration. Ver `shared/changelog.ts`.
- **Rev. 2404** — ALMOXARIFADO/EQUIPAMENTOS · Marcar item do almox como Equipamento Próprio/Locado direto do card. 3 colunas novas em `almoxarifado_itens` (`equipamento_vinculado_tipo/_id/_em` via ADD COLUMN IF NOT EXISTS). Novo `ModalVincularEquipamento.tsx` (toggle Próprio indigo / Locado amber) reaproveita nome→descrição, categoria, foto e valor unitário. Card ganha badge + botão `<Wrench/>` indigo entre Editar e Histórico. Ver `shared/changelog.ts`.
- **Rev. 2403** — CONFIGURAÇÕES/UX · Abas viraram cards coloridos (1 cor por módulo) num grid responsivo 2/3/4/5/7 cols. `allTabs` ganhou campo `color` (14 cores); mapa estático `TAB_COLOR_STYLES` em `Configuracoes.tsx` L89-105 contorna o Tailwind JIT (não pega classes interpoladas). Card ativo: gradient `from-{c}-500 to-{c}-600` + ring + shadow + chip translúcido. Ver `shared/changelog.ts`.
- **Rev. 2402** — CONFIGURAÇÕES/UX · Abas com `flex-wrap` (várias linhas) em vez de scroll horizontal. `overflow-x-auto`+`inline-flex` → `flex flex-wrap`, padding `px-4`→`px-3`. Aposentada pela Rev. 2403. Ver `shared/changelog.ts`.
- **Rev. 2401** — CONFIGURAÇÕES/UX · Barra de abas com scroll horizontal em vez de quebrar texto vertical. Wrapper `overflow-x-auto` + container interno `inline-flex min-w-full` + botões `flex-shrink-0 whitespace-nowrap`. Aposentada pela Rev. 2402/2403. Ver `shared/changelog.ts`.

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
