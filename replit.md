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

- **Rev. 2418** — **ALMOXARIFADO / VALOR TOTAL DO ESTOQUE · Exclui equipamentos LOCADOS por padrão + respeita filtros visíveis.** Pedido user (25/05/2026, screenshot do banner verde com filtro "Apenas Locados" ativo mostrando R$ 17.466,87): "os valores dos equipamentos locados estão sendo computados no valor total do almoxarifado? se não preciso que esteja, se quando fazer o filtro o valor deve mostrar somente o que ta no filtro definido". Diagnóstico: ambas as visões (consolidada "todos" e por obra) somavam a lista CRUA (`consItens`/`itens` da query), ignorando filtros UI e somando locados como se fossem patrimônio. Regra nova unificada: (a) **default** `filtroEquip="todos"` → locados EXCLUÍDOS + badge "X locado(s) excluído(s)"; (b) `filtroEquip="locado"` ou `"vinculado"` → incluí-los (user pediu explicitamente esse subgrupo); (c) demais filtros (busca/categoria/abaixo do mínimo/proprio/nenhum) → total reflete lista filtrada + badge "filtrado". **Frontend** `client/src/pages/almoxarifado/index.tsx` (5 blocos): visão consolidada L1627-1662 (`itensParaTotal` derivado de `consListFinal` com filtro de locado, recalcula `valorMap`/`valorTotal`, helpers `totalReflectsFilter` e `qtdLocadosExcluidos`); banner L1685-1698 (troca `consolidado.totalGeral` → `valorTotal`); tfoot L1997-2008 (idem + condição `valorTotal > 0`); visão por obra L2030-2043 (`itensParaTotalObra` derivado de `lista` filtrada); banner obra L2070-2078. **Backend ZERO mudanças** — `consolidado.totalGeral` continua exposto pra outros consumidores mas UI ignora. R-001/R-007/R-010 OK. Detalhe completo: `shared/changelog.ts`.
- **Rev. 2417** — **ALMOXARIFADO/INVENTÁRIO VISUAL DE BAIAS · SÓ categoria "Agregados" + INPUT NUMÉRICO de volume + CONSUMO do dia.** Pedido user (25/05/2026): (1) "so vai para baia oque estiver na categoria agregados ok.. mais facil controlar"; (2) trocar 5 botões de % por foto + volume restante digitado + display do consumo (saldoAnterior+entradaHoje−saldoAtual). Decisão ADD COLUMN idempotente: `almoxarifado_baia_leituras.volume_estimado NUMERIC(14,3) NULL`; coluna `percentual` antiga continua NOT NULL pra compat — quando user só digita volume, backend deriva `round(vol/cap*100)` clamp 0-100 (ou 0 se baia sem capacidade). Verdade operacional = volume digitado. **Backend `warehouse.ts`**: filtro agora `normalizarCat(it.categoria) === "agregados"` (NFD + lowercase + trim), removidos AGGR_RE/UNI_GRANEL da Rev.2415; SELECTs `mapUlt`/`mapPenult` + 2 `toCamel` incluem `volumeEstimado`; novo helper `calcConsumoHoje(ult, ant, ent)` aplicado nos 3 push do combine; `baiaLeituraRegistrar.input` ganha `volumeEstimado.optional()` + `percentual.optional()` com guard "ao menos um", INSERT escreve volumeEstimado e percentualFinal derivado. **SyncSchema+** (`server/_core/index.ts` L2092): `ADD COLUMN IF NOT EXISTS volume_estimado NUMERIC(14,3)`. **Frontend `InventarioVisual.tsx`**: constante NIVEIS DELETADA (corPorPct sobrevive p/ fallback histórico); state `leituraPct→leituraVolume:string`; `abrirLeitura(baia)` (sem 2º arg) pré-popula com `ultimaLeitura.volumeEstimado`; `confirmarLeitura` parseia vírgula→ponto, valida `>=0`, manda `volumeEstimado`; card refeito: 3 mini-cards (sky "Chegou hoje", emerald "Restante", amber "Consumo dia") + linha "Última leitura: X un" + botão único grande "Registrar baixa" / "Refazer leitura"; modal "Registrar baixa da baia" com gradiente amber→orange + `<Input inputMode=decimal>` grande centralizado; histórico mostra `volumeEstimado un` com fallback p/ `%`. Helper `fmtNum` pt-BR. R-001/R-007/R-010 OK (só ADD COLUMN). Detalhe completo: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2416** — ALMOXARIFADO/INVENTÁRIO VISUAL DE BAIAS · Opção "Todas as obras" (visão consolidada) de volta no seletor. `baiaAgregadosListar.input.obraId` vira `nullable()`, resolve `targetObras` via `userCanAccessObra`, indexação `${obraId}:${itemId}`, frontend grupado por obra. Zero migration. Ver `shared/changelog.ts`.
- **Rev. 2415** — ALMOXARIFADO/INVENTÁRIO VISUAL · agregados aparecem automaticamente — almoxarife não cadastra baia, só dá baixa. 2 endpoints novos (`baiaAgregadosListar` + `baiaAutoEnsureFromItem`); filtro regex de vocabulário FC; cards com 3 badges (sky/amber/saldo). Ver `shared/changelog.ts`.
- **Rev. 2414** — ALMOXARIFADO/INVENTÁRIO VISUAL DE BAIAS · Reformatado pra MESMA LINGUAGEM do Inventário Semanal — sessão DIÁRIA por obra. ZERO backend (sessão derivada de `baia_leituras`). Helpers `hojeYmdLocal()` + `isLeituraHoje()`. 5 estados (placeholder/loading/sem baia/iniciar aferição/sessão), modo "Gerenciar" toggle. Ver `shared/changelog.ts`.
- **Rev. 2413** — EQUIPAMENTOS LOCADOS/IMPORT · Fornecedor (locadora) OBRIGATÓRIO antes de cadastrar itens via PDF (IA). `confirmarImport()` 2º guard após o de obra (conta `fornecedorNome` vazios, popup com 8 primeiros números). Botão "Confirmar" prioriza visual semObra > semForn > OK. Mesma simetria de Rev. 2353. Zero backend. Ver `shared/changelog.ts`.
- **Rev. 2412** — AVALIAÇÃO INTELIGENTE/UX · Modal "Score Detalhado" modernizado (faixa azul #1B2A4A, hero card colorido, 4 sub-cards por dimensão via `SUBSCORE_COLOR_MAP` estático, `DadoBrutoRow` tabela, footer LGPD). `DialogContent max-w-2xl→3xl p-0 overflow-hidden gap-0`. Zero backend. Ver `shared/changelog.ts`.

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
