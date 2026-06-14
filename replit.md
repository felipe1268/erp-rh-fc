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

- **Rev. 3105** — **MEDIÇÃO / LEVANTAMENTO DE CAMPO · O DESENHO DOS CONTORNOS GANHA ESCOLHA DE COR E DE OPACIDADE DO PREENCHIMENTO — ANTES O PREENCHIMENTO ERA FIXO E "FRACO" (18%) E A COR ERA AUTOMÁTICA POR TIPO, SEM JEITO DE TROCAR.** PEDIDO: "a cor do preenchimento do contorno está muito fraca; quero poder escolher a cor e a opacidade". SOLUÇÃO (FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND — o campo `cor` do contorno JÁ existia e JÁ persistia via `off.saveContorno`): (1) ESTADO PERSISTIDO em localStorage (por usuário) em `MedicaoLevantamento.tsx`: `corDesenho` ("" = automática por tipo via `COR_TIPO`) e `fillOpacity` (0.05..0.9, default 0.32 — antes 0.18 fixo), espelhados via `useEffect` p/ `medCorDesenho`/`medFillOpacity`. (2) RENDER: contornos salvos passam de `fillOpacity={fecha?0.18:0}` p/ `fillOpacity={fecha?fillOpacity:0}`; previews (retângulo/livre) usam `corPreview`/`fillOpacity`; novos contornos gravam `cor: corDesenho || COR_TIPO[tipo]` em `finalizarContorno`. (3) UI "ESTILO" (Popover na toolbar, espelha o do OSnap): swatch "Auto" + 9 cores preset (`CORES_PRESET`) + `<input type="color">` + slider `<input type="range">` 5..90%. (4) RECOLORIR EM MASSA: na barra azul de multi-seleção (Rev. 3101) fileira "Recolorir:" com as 9 cores → `recolorSelecionados(cor)` → `recolorContorno(c,cor)` reusa `off.saveContorno` por id/uuid PRESERVANDO todos os campos (geometria/métricas/número/vínculo `orcamentoItemId`/`itemEapCodigo`/`itemDescricao`) — espelho exato do `bindContornoItem`. RESSALVA/DRIFT: opacidade é setting GLOBAL de render (não por contorno); cor é por contorno (gravada). Detalhe: `shared/changelog.ts`.

- **Rev. 3104** — **MEDIÇÃO / LEVANTAMENTO DE CAMPO · A TELA DE DESENHO SOBRE A PLANTA PASSA A ACEITAR ARQUIVOS DXF (CAD VETORIAL) ALÉM DE PDF — E, COMO O DXF CARREGA COORDENADAS REAIS, A ESCALA É CALIBRADA AUTOMATICAMENTE (SEM O PASSO MANUAL "CALIBRAR 2 PONTOS"). DWG (PAGO) FICA PARA DEPOIS.** PEDIDO: "no levantamento de campo, aceita também arquivo de CAD"; decisão: DXF+PDF agora, DWG depois. SOLUÇÃO (FRONTEND + BACKEND ADITIVO, ZERO ALTER/DROP/DELETE/SCHEMA): o motor de desenho/área/zoom/pan/osnap já opera em coords NORMALIZADAS [0..1] sobre o container → DXF reusa 100% do motor, só troca o "fundo" PDF por SVG vetorial e injeta a escala. (1) NOVO util `client/src/pages/medicao/dxfPlanta.ts` `parseDxfPlanta(text)` (lib `dxf-parser`): tessela LINE/LWPOLYLINE/POLYLINE/CIRCLE/ARC/ELLIPSE/SPLINE-aprox/SOLID/3DFACE → polilinhas, expande INSERT recursivo (depth≤6), bbox em unidades DXF, emite `<svg viewBox=bbox preserveAspectRatio="none" vector-effect="non-scaling-stroke">` com Y invertido, e deriva `metrosPorUnidade` do `$INSUNITS` (mm/cm/m/in/ft/yd/dm; 0/desconhecido→null). (2) `MedicaoLevantamento.tsx`: `isDxf` (nome/url `.dxf`); fetch(`pdfFileFor`)→texto→`parseDxfPlanta`→`dxfData`; `pageDims={w,h}` da bbox (`numPaginas=1`) → `normToPt` dá unidades DXF e ÁREA em m²; `dxfAutoCalib` (Calibracao sintética via $INSUNITS) + `calibAtualEff = calibAtual || dxfAutoCalib` em `finalizarContorno` → mede SEM calibrar (unitless cai no fluxo manual); render troca `<Document>/<Page>` por `<div dangerouslySetInnerHTML={svg}>` no MESMO wrapper/overlay/filtro P&B; input `accept="application/pdf,.dxf"`, botão "Planta (PDF/DXF)", status "Escala automática do DXF…". (3) BACKEND `medicao.uploadPdf`: extensão da storage key derivada de `arquivoNome`/`contentType` (.dxf vs .pdf). RESSALVA/DRIFT: caminho PDF idêntico (só saiu de dentro do `<Document>` que envolvia tudo); DXF é aproximação vetorial (TEXT/MTEXT/DIMENSION/HATCH não desenhados, SPLINE pelos pontos de ajuste — não afeta a medição); DWG não suportado (follow-up); lib `dxf` (bjnortier) testada e descartada. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3103** — MEDIÇÃO DE TERCEIROS · O CARD DA LISTA "MEDIÇÕES REGISTRADAS" GANHA NOME AMIGÁVEL "MED-01" (EM VEZ DE "MEDIÇÃO #1") E EXIBE O PERÍODO EM FORMATO BRASILEIRO (MM/AAAA, EX.: 06/2026) EM VEZ DO CRU "2026-06". SOLUÇÃO (FRONTEND-ONLY): em `client/src/pages/terceiros/Medicoes.tsx` dois helpers — `medLabel(numero)` → `MED-${padStart(2,"0")}` e `fmtPeriodo(m)` (reusa `periodoDe` → `MM/AAAA`, fallback p/ valor cru). ZERO BACKEND/ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3102** — MEDIÇÃO / LEVANTAMENTO DE CAMPO (TERCEIROS) · O COMBOBOX DE VÍNCULO DE CONTORNOS VOLTA A LISTAR OS ITENS DO CONTRATO (BLOCO B/FORROS) EM VEZ DE "SEM ORÇAMENTO VINCULADO", MESMO COM ITENS NA ABA "ITENS". CAUSA: `useLevantamentoOffline` só buscava itens via `getItensOrcamento` (orçamento de obra); contrato de terceiro tem `orcamentoId` 0/null e itens em `terceiro_contrato_itens` → query nunca roda → vazio. SOLUÇÃO (FRONTEND-ONLY): hook ganha `itensOverride?:any[]|null`; `MedicaoLevantamento.tsx` carrega `terceiroContratos.listarItens` e injeta como override; `vincularEmptyHint` ganha ramo terceiro. ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3101** — MEDIÇÃO / LEVANTAMENTO DE CAMPO · A LISTA "CONTORNOS DESTA PÁGINA" GANHA MULTI-SELEÇÃO: O USUÁRIO MARCA VÁRIOS CONTORNOS COM CAIXINHAS (OU "SELECIONAR TODOS") E APAGA OU VINCULA UM ITEM DO ORÇAMENTO A TODOS DE UMA VEZ — EM VEZ DE REPETIR A AÇÃO CONTORNO A CONTORNO. `MedicaoLevantamento.tsx` ganha estado `selContornos` (Set de ids) + `bulkBusy`; cada linha ganha `<Checkbox>`; cabeçalho "Selecionar todos" + barra de ações azul com `VincularItemCombobox` (nova prop `placeholder`) p/ vincular o mesmo item a TODOS + "Excluir selecionados"; `bindItem`→`bindContornoItem(c,itemId)` reusado no individual e no `vincularItemSelecionados` (loop). Tudo offline-first. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3100** — MEDIÇÃO / LEVANTAMENTO DE CAMPO · A ÁREA DE DESENHO SOBRE A PLANTA (PDF) GANHA "OSNAP" ESTILO AUTOCAD (OBJECT SNAP): AO MARCAR/CONECTAR PONTOS, ELES "GRUDAM" NAS GEOMETRIAS NOTÁVEIS DOS CONTORNOS JÁ DESENHADOS — EXTREMIDADE, PONTO MÉDIO, INTERSEÇÃO, NÓ/CENTRO, PERPENDICULAR E PRÓXIMO (SOBRE A LINHA). `MedicaoLevantamento.tsx` ganha motor de Object Snap (helpers `SnapKind`/`OSNAP_DEFS`/`SNAP_PRIO`/`toolUsaSnap`/`projetarNoSegmento`/`interseccaoSegmentos`); `useMemo snapData` coleta candidatos dos contornos da página + referência + rascunho; `applySnap` escolhe o melhor dentro de **14px de TELA**; aplicado no `onTap` e nos cantos do Retângulo; marcador SVG no hover; botão "OSnap" + Popover de modos + atalho **F3**. Pontos normalizados [0..1] inalterados. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3099** — MEDIÇÃO / LEVANTAMENTO DE CAMPO · A ÁREA DE DESENHO SOBRE A PLANTA (PDF) GANHA ZOOM PELA RODINHA DO MOUSE (ESTILO AUTOCAD, EM DIREÇÃO AO CURSOR) NO PC, MANTENDO A PINÇA DE 2 DEDOS NO CELULAR/TABLET — E O ZOOM ACONTECE SÓ NA PLANTA, NUNCA NA PÁGINA INTEIRA. `MedicaoLevantamento.tsx` registra listener NATIVO `wheel` `{passive:false}` no `canvasWrapRef`; handler calcula a fração sob o cursor (mesma matemática do pinch) e reusa `focusRef`+`useLayoutEffect` (Rev. 3097) p/ zoom focal. Passo `exp(clamp(-deltaY*0.0015))` clampado 0.5..6×; `zoom/baseWidth/pageDims` via refs p/ evitar closure stale. Pinça e pan intactos. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

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
- **Moeda SEMPRE em formato BRL pt-BR (`R$ 100.000,00` — ponto p/ milhar, vírgula p/ centavos).** Tanto na EXIBIÇÃO (usar `formatBRL`) quanto em INPUTS de digitação de valor (usar máscara `maskBRL`/`parseMaskBRL`). Nunca exibir/aceitar o formato cru anglo `100000.00`.
- **REGRA DE OURO — CAMINHO B (Rev. 2646+, substitui Rev. 2644/2617/2533/2603).** O "% PREVISTO" é a réplica da coluna **"% PREVISTO" (Texto10) do MS Project** — "verdade absoluta". O "% CONCLUÍDA" segue a coluna `PercentComplete`. As duas régua são alinhadas às fórmulas do MSP:
  - **% PREVISTO — FÓRMULA-FONTE (Texto10):** a coluna "% PREVISTO" do MSP é `Int(Num Dur(Prev)[188743983] ÷ PESO DUR(BL)[188743982] × 100 + 0.5)` = fração de duração da baseline DECORRIDA até o StatusDate, ponderada por DURAÇÃO das folhas, **ARREDONDADA** (`+0.5` antes do `Int` = `round`, NÃO trunca).
  - **% PREVISTO — RÉGUA NO ERP (projeção p/ TODAS as semanas):** motor de **TEMPO ÚTIL MINUTO-A-MINUTO** da baseline (`unitsElapsed`/`unitsTotal` sobre `shared/diasUteis`, clipando aos `weekDayIntervals` do calendário). **RAIZ = ROLLUP** = `round(Σ minutos úteis DECORRIDOS das folhas ÷ Σ minutos úteis TOTAIS das folhas × 100)` — soma das DURAÇÕES das folhas, **NÃO** o vão início→fim do projeto (corrigido na Rev. 2644). POR ATIVIDADE = `round(elapsed/total × 100)`. `round` (não `trunc`) p/ espelhar o `+0.5` do Texto10.
  - **% PREVISTO — LEITURA DO VALOR-SNAPSHOT (cliente) (Rev. 2647+, substitui Rev. 2644):** `client/.../ImportarCronograma.tsx` lê SEMPRE a MESMA coluna FIXA `Texto10 (188743750)` via const `FID_PREVISTO_TEXTO10`, em TODOS os projetos (presentes e futuros). **ACABARAM a detecção por `<Alias>` (`detectarFidPorAlias` removida) e as reservas Texto6/Texto11.** Se Texto10 faltar no XML, o valor fica `null` → a tela mostra "—" (jamais lê outra coluna; Texto6 em templates LOTUS é lixo sem alias/fórmula). Vale pra RAIZ (`parseMSProjectFull`) e pra cada ATIVIDADE (`parseMSProjectTasksFromDoc`).
  - **Baseline COM HORA é OBRIGATÓRIA.** Lê `baseline_start_ts`/`baseline_finish_ts` (TEXT ISO com hora). Sem `weekDayIntervals` OU sem TS → fallback day-granular ponderado por duração (backward compat). Cutoff semanal = fim-do-dia (`T23:59:59Z`).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **PADRÃO ATUAL (Rev. 2646): o snapshot "% Previsto" REGENERA EM TODO UPLOAD DO XML — inclusive o SEMANAL — usando o calendário do XML como verdade absoluta.** Acontece em `salvarAtividades` (cadastro/substituir) E em `salvarMetadadosMSProject` (que roda em todo import e regrava o `calendarioJson` limpo). Como a baseline é imutável dentro da revisão, re-rodar é IDEMPOTENTE (mesma curva), mas garante que projetos ANTIGOS se AUTO-CUREM no próximo upload semanal (ex.: a curva ~1% baixa por feriado injetado pré-Rev. 2645 some sozinha). REVOGA a regra anterior "snapshot regenerado SÓ no salvarAtividades / avanço semanal NÃO regenera". RESSALVA: projetos dormentes (sem novos uploads) só corrigem com reimport do cronograma inicial.
  - **RESSALVA DE PARIDADE NUMÉRICA:** o XML de referência (PLN_816 R04) tem StatusDate < StartDate → Texto10 = 0% em tudo, então a curva numérica NÃO foi cravada empiricamente nesta revisão. A régua matemática está alinhada à fórmula; falta re-validar com XML de status-date no meio do projeto.
  - Implementação: `server/routers/planejamento.ts` (`regenerarPrevistoSemanasCaminhoB` — rollup das folhas + round; chamada pós-transaction em `salvarAtividades` E em `salvarMetadadosMSProject` — Rev. 2646, que roda em TODO upload e resolve a revisão ativa + respeita a fonte; `importarComModo` propaga os TS), `client/src/pages/planejamento/ImportarCronograma.tsx` (`detectarFidPorAlias` + parser `<Baseline Number=0>` COM HORA + `<WorkingTime>`→`weekDayIntervals`), `shared/diasUteis.ts` (motor minuto-a-minuto), `drizzle/schema.ts` + self-heal `[SyncSchema+]` (`baseline_start_ts`/`baseline_finish_ts`).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
