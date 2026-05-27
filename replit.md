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


- **Rev. 2492** — **EFETIVO DA OBRA (Planejamento) · Gráfico "Distribuição por Função" virou clicável — filtra a Lista de Funcionários abaixo (cross-filter).** User (image_1779886994646): "quero poder filtrar por função quando clicar no nome da função". Em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`: novo state `filtroFuncao` (L11287) + filtro em `listaFiltrada` (L11340, comparando contra `e.funcao||e.cargo||"Não informado"` — mesma normalização do `funcaoMap` pra evitar mismatch) + barras viraram `<button>` com toggle, `aria-pressed` e 3 estados visuais (ativa = ring azul + gradient escuro + label bold; demais quando há filtro = opacity-40 hover-100; neutro = hover slate). Pill `{filtroFuncao} [×]` no título do card + botão "Limpar" global agora reseta os 4 filtros. `funcaoMap` INTOCADO de propósito (se aplicasse o filtro, o gráfico colapsaria pra uma única barra — UX morta). Backend intacto. Detalhe: `shared/changelog.ts`.
- **Rev. 2491** — **EFETIVO DA OBRA (Planejamento) · Redesign do modal "Transferir em Lote" — regras de ouro FC + progresso real + atalhos.** User (image_1779886579164): "quero que melhore este layout considerando uma tela de fácil interação de layout conforme regras de ouro". Modal Rev. 2484 (43 selecionados) era visualmente carregado, sem fluxo "de→para" claro e sem feedback durante execução one-by-one. Em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (L11226-11228 + L11995-12180): (1) header institucional FC gradient `#1B2A4A→#2C4170` inline-styled, (2) fluxo visual De→Para em grid `1fr_auto_1fr` com seta + card destino que muda dashed→solid azul ao selecionar, (3) lista de selecionados em chips pill (43 nomes em ~4 linhas vs ~25 antes), (4) steps numerados "1. Obra de destino" / "2. Motivo" com select `autoFocus`, (5) barra de progresso REAL via novo state `bulkProgress:{done,total}` incrementado após cada `mutateAsync` — botão CTA mostra `4/43`, (6) atalhos `Esc` cancela / `Ctrl+Enter` confirma com hint `<kbd>` no footer, (7) responsivo `max-w-2xl` + `max-h-[92vh]` + header/footer fixos e body scroll, (8) aviso âmbar ganhou `<AlertCircle />`. Backend INTACTO (`obras.allocateEmployee` em loop). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2490** — USUÁRIOS & PERMISSÕES · "Dashboards RH" explodido em 13 entradas (master + 12 dashboard_*) em `shared/modulePages.ts` módulo `rh.pages`. `PageRouteMap` intacto. Ver `shared/changelog.ts`.
- **Rev. 2489** — FOLHA · Cálculo Interno + Consolidações persistindo de verdade — helper `ensurePeriodExists` chamado em 11 mutations (gerarVale, realizarAfericao×2, simularPagamento + 8 consolidar/desconsolidar) corrige UPDATEs que afetavam 0 linhas. `server/routers/payrollEngine.ts` L204-251. Ver `shared/changelog.ts`.
- **Rev. 2488** — COTAÇÕES · Mapa de Cotação em fullscreen + célula de Item enxuta (estilo ERP de mercado). Em `Cotacoes.tsx`: wrapper condicional `abaAtiva==="mapa"` (`px-3 py-3`) + bloco poluído da célula Item virou tooltip+ícone Info. Ver `shared/changelog.ts`.
- **Rev. 2487** — COMPRAS · Ordenação clicável por coluna em Cotações (`Cotacoes.tsx`) e OCs (`Ordens.tsx`) com setinhas ↑↓ no padrão SC. `[sortKey,sortDir]` + `toggleSort`, `localeCompare("pt-BR",{numeric:true,sensitivity:"base"})`. Ver `shared/changelog.ts`.
- **Rev. 2486** — ORDENS DE COMPRA · Form de itens AGRUPADO POR ETAPA (EAP) — 1 etapa × N itens. Refatoração 100% frontend em `Ordens.tsx`: `GrupoForm`, helpers `flattenGrupos`/`agruparItens`, UI card lilás por etapa com Popover EAP no header + stack de itens. Backend/payload INTACTOS. Ver `shared/changelog.ts`.

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
- **REGRA DE OURO — Leitura do XML do MS Project (Rev. 2427+, vale pra TODAS as obras).** Fonte ÚNICA pra cronograma e avanços semanais. Validada com paridade 100% no XML HOTEL DO PAPA (BL 25/05/2026). Conventions canônicas:
  - **% PREVISTO** (raiz e atividades) = `Texto6` (FieldID 188743746) puro do XML. O MSP calcula via fórmula `Int(((StatusDate − BL_Start)/(BL_Finish − BL_Start))*100)` sobre as datas da BASELINE — não precisa ler `<Baseline>` separado. Fallback compatível: Texto10 (188743750) → Texto11 (188743997).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` nativo do MSP. ZERO heurística (Texto7, AD/(AD+RD), Texto9, Texto12, PhysicalPercentComplete ficaram fora — não são a coluna que o engenheiro vê na tela).
  - JAMAIS recalcular dinamicamente quando o XML tem snapshot — o snapshot do MSP é a verdade.
  - Implementação: `client/src/pages/planejamento/ImportarCronograma.tsx` (bloco "REGRA DE OURO" L257-281).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
