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


- **Rev. 2493** — **TERCEIROS · Campo "Função" virou Combobox vinculado ao catálogo `jobFunctions` (saiu de texto livre).** User (image_1779887618252+631987+678443, all-caps p/ ênfase): "A FUNÇÃO DOS TERCEIROS NÃO QUERO PODER DIGITAR.. QUERO QUE SIGA AS FUNÇÕES QUE JÁ TEMOS NO NOSSO BANCO DE DADOS" — terceiro AILTON (Promatel) tinha `<Input>` digitando "ENCARREGADO DE OBRAS", quebrando agrupamento em Painel RH / Distribuição por Função (Rev. 2492) / kits EPI / NR-1 quando texto variava ("Encarregado Obras" etc). 3 alterações: (1) NOVO `client/src/components/FuncaoCombobox.tsx` extraído da impl inline que vivia em `Colaboradores.tsx` Rev. 2169 — API `{value,onChange,options,placeholder?,triggerClassName?}`, Popover+cmdk com filtro acento-insensitive, largura herdada, "—" pra limpar + bonus rail com CBO. (2) `Colaboradores.tsx` removeu 88 linhas inline e importa o shared (behavior idêntico). (3) `FuncionariosTerceiros.tsx`: import + query `trpc.jobFunctions.list({companyId})` (MESMO endpoint, MESMO companyId da FC pq catálogo é da FC) + troca `<Input>` por `<FuncaoCombobox>` com filtro `f.isActive!==false` (espelha Colaboradores L1762). Field `form.funcao` continua VARCHAR, salva `nome` (não id) pra preservar agregados. Sem mudança de schema/backend. Detalhe: `shared/changelog.ts`.
- **Rev. 2492** — **EFETIVO DA OBRA (Planejamento) · Gráfico "Distribuição por Função" virou clicável — filtra a Lista de Funcionários abaixo (cross-filter).** User (image_1779886994646): "quero poder filtrar por função quando clicar no nome da função". Em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`: novo state `filtroFuncao` (L11287) + filtro em `listaFiltrada` (L11340, comparando contra `e.funcao||e.cargo||"Não informado"` — mesma normalização do `funcaoMap` pra evitar mismatch) + barras viraram `<button>` com toggle, `aria-pressed` e 3 estados visuais (ativa = ring azul + gradient escuro + label bold; demais quando há filtro = opacity-40 hover-100; neutro = hover slate). Pill `{filtroFuncao} [×]` no título do card + botão "Limpar" global agora reseta os 4 filtros. `funcaoMap` INTOCADO de propósito (se aplicasse o filtro, o gráfico colapsaria pra uma única barra — UX morta). Backend intacto. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2491** — EFETIVO DA OBRA · Redesign modal "Transferir em Lote" — header FC #1B2A4A, fluxo De→Para, chips, progresso real (bulkProgress), atalhos Esc/Ctrl+Enter, responsivo. `PlanejamentoDetalhe.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2490** — USUÁRIOS & PERMISSÕES · "Dashboards RH" explodido em 13 entradas (master + 12 dashboard_*) em `shared/modulePages.ts` módulo `rh.pages`. `PageRouteMap` intacto. Ver `shared/changelog.ts`.
- **Rev. 2489** — FOLHA · Cálculo Interno + Consolidações persistindo de verdade — helper `ensurePeriodExists` chamado em 11 mutations (gerarVale, realizarAfericao×2, simularPagamento + 8 consolidar/desconsolidar) corrige UPDATEs que afetavam 0 linhas. `server/routers/payrollEngine.ts` L204-251. Ver `shared/changelog.ts`.
- **Rev. 2488** — COTAÇÕES · Mapa de Cotação em fullscreen + célula de Item enxuta (estilo ERP de mercado). Em `Cotacoes.tsx`: wrapper condicional `abaAtiva==="mapa"` (`px-3 py-3`) + bloco poluído da célula Item virou tooltip+ícone Info. Ver `shared/changelog.ts`.
- **Rev. 2487** — COMPRAS · Ordenação clicável por coluna em Cotações (`Cotacoes.tsx`) e OCs (`Ordens.tsx`) com setinhas ↑↓ no padrão SC. `[sortKey,sortDir]` + `toggleSort`, `localeCompare("pt-BR",{numeric:true,sensitivity:"base"})`. Ver `shared/changelog.ts`.

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
