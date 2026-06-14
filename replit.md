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

- **Rev. 3102** — **MEDIÇÃO / LEVANTAMENTO DE CAMPO ABERTO A PARTIR DE UMA MEDIÇÃO DE TERCEIROS · O COMBOBOX DE VÍNCULO DE CONTORNOS VOLTA A LISTAR OS ITENS DO CONTRATO (BLOCO B/FORROS ETC.) EM VEZ DE EXIBIR "ESTE CONTRATO NÃO TEM ORÇAMENTO VINCULADO" E FICAR VAZIO — MESMO O CONTRATO TENDO ITENS NA ABA "ITENS".** CAUSA: `useLevantamentoOffline` buscava itens SÓ via `medicao.getItensOrcamento({orcamentoId})` (`enabled orcamentoId>0`); contrato de terceiro tem `orcamentoId` 0/null → query nunca roda → lista vazia → dica errada. Itens de terceiro vivem em `terceiro_contrato_itens`. SOLUÇÃO (FRONTEND-ONLY, ZERO BACKEND/ALTER/DROP/DELETE/SCHEMA): o hook ganha arg opcional `itensOverride?: any[]|null` (`undefined`=cliente/obra via query; `null`=carregando; array=resolvido); `itensResolved` (override > query) vira fonte única do snapshot/`itensOrcamento`/consolidação; query de orçamento ganha `&& !overriding`. `MedicaoLevantamento.tsx`: quando `isTerceiro`, busca `terceiroContratos.listarItens({contratoId})` e mapeia `items`→formato consolidável (`vendaUnitTotal←valorUnitario`, `vendaTotal←valorTotal` + id/eapCodigo/descricao/unidade/quantidade) como override; `vincularEmptyHint` ganha ramo `isTerceiro` (mensagens próprias, sem falar de orçamento). Itens de terceiro são folhas com `eapCodigo` → `buildItensVinculaveis` aceita; `contornos.orcamentoItemId` é integer SEM FK (+ `itemEapCodigo`/`itemDescricao` denormalizados) → salvar id de terceiro é seguro. RESSALVA/DRIFT: nenhuma — caminho Cliente/obra idêntico (override `undefined`). Detalhe: `shared/changelog.ts`.

- **Rev. 3101** — **MEDIÇÃO / LEVANTAMENTO DE CAMPO · A LISTA "CONTORNOS DESTA PÁGINA" GANHA MULTI-SELEÇÃO: O USUÁRIO MARCA VÁRIOS CONTORNOS COM CAIXINHAS (OU "SELECIONAR TODOS") E APAGA OU VINCULA UM ITEM DO ORÇAMENTO A TODOS DE UMA VEZ — EM VEZ DE REPETIR A AÇÃO CONTORNO A CONTORNO.** PEDIDO: "quero múltipla seleção para apagar ou modificar vários de uma vez". SOLUÇÃO (FRONTEND-ONLY, ZERO BACKEND/ALTER/DROP/DELETE/SCHEMA): `MedicaoLevantamento.tsx` ganha estado `selContornos` (Set de ids) + `bulkBusy`; `useEffect` poda a seleção p/ ids que ainda existem na página. Cada linha ganha `<Checkbox>`; cabeçalho "Selecionar todos" + contagem "N selecionado(s)" + "Limpar"; barra de ações azul (só com algo selecionado) com `VincularItemCombobox` (nova prop opcional `placeholder`) p/ vincular o mesmo item a TODOS os selecionados + botão "Excluir selecionados" (`confirm` + spinner). `bindItem` refatorado → `bindContornoItem(c, itemId)` reusado no vínculo individual e no `vincularItemSelecionados` (loop `await`); exclusão em massa = loop `off.excluirContorno`. Tudo via hook offline-first. RESSALVA/DRIFT: nenhuma — ações individuais intactas; multi-seleção é aditiva. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3100** — MEDIÇÃO / LEVANTAMENTO DE CAMPO · A ÁREA DE DESENHO SOBRE A PLANTA (PDF) GANHA "OSNAP" ESTILO AUTOCAD (OBJECT SNAP): AO MARCAR/CONECTAR PONTOS, ELES "GRUDAM" NAS GEOMETRIAS NOTÁVEIS DOS CONTORNOS JÁ DESENHADOS — EXTREMIDADE, PONTO MÉDIO, INTERSEÇÃO, NÓ/CENTRO, PERPENDICULAR E PRÓXIMO (SOBRE A LINHA). `MedicaoLevantamento.tsx` ganha motor de Object Snap (helpers `SnapKind`/`OSNAP_DEFS`/`SNAP_PRIO`/`toolUsaSnap`/`projetarNoSegmento`/`interseccaoSegmentos`); `useMemo snapData` coleta candidatos dos contornos da página + referência + rascunho; `applySnap` escolhe o melhor dentro de **14px de TELA**; aplicado no `onTap` e nos cantos do Retângulo; marcador SVG no hover; botão "OSnap" + Popover de modos + atalho **F3**. Pontos normalizados [0..1] inalterados. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3099** — MEDIÇÃO / LEVANTAMENTO DE CAMPO · A ÁREA DE DESENHO SOBRE A PLANTA (PDF) GANHA ZOOM PELA RODINHA DO MOUSE (ESTILO AUTOCAD, EM DIREÇÃO AO CURSOR) NO PC, MANTENDO A PINÇA DE 2 DEDOS NO CELULAR/TABLET — E O ZOOM ACONTECE SÓ NA PLANTA, NUNCA NA PÁGINA INTEIRA. `MedicaoLevantamento.tsx` registra listener NATIVO `wheel` `{passive:false}` no `canvasWrapRef`; handler calcula a fração sob o cursor (mesma matemática do pinch) e reusa `focusRef`+`useLayoutEffect` (Rev. 3097) p/ zoom focal. Passo `exp(clamp(-deltaY*0.0015))` clampado 0.5..6×; `zoom/baseWidth/pageDims` via refs p/ evitar closure stale. Pinça e pan intactos. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3098** — MEDIÇÃO DE TERCEIROS · NA "CONFIGURAÇÃO DE RETENÇÕES DO CONTRATO (%)" O USUÁRIO VOLTA A CONSEGUIR APAGAR O "0" DOS CAMPOS (ISS/INSS/IRRF/OUTRAS/RET. TÉCNICA) NO TABLET (iPad/Safari) — O FIX DA Rev. 3096 RESOLVEU O ESTADO REACT, MAS O `<input type="number">` NO iOS CONTINUAVA "GRUDANDO" O 0 AO APAGAR. `ContratoDetalhe.tsx`: os 5 inputs passam de `type="number"` p/ `type="text" inputMode="decimal"`; `onChange` sanitiza p/ dígitos/ponto/vírgula mantendo TEXTO; conversão p/ número só no "Salvar Config" com vírgula pt-BR (`parseFloat(String(...).replace(",", ".")) || 0`). FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3097** — MEDIÇÃO / LEVANTAMENTO DE CAMPO · A TELA DE DESENHO SOBRE A PLANTA (PDF) VIRA TÁTIL E "FLUIDA" ESTILO AUTOCAD: PLANTA EM P&B POR PADRÃO, ZOOM POR PINÇA + PAN, FERRAMENTAS RETÂNGULO/DESENHO LIVRE/PAREDE (L×A→m²), TOOLBAR FIXA, DESFAZER E ENTRADA DE ALTURA/ESCALA POR CAMPO NO APP (FIM DO `window.prompt`). `shared/levantamentoGeo.ts` ganha tipo "parede" + `simplificarPontos` (RDP); `salvarContorno` aceita "parede"; `MedicaoLevantamento.tsx` filtro CSS P&B só no `<Page>` + gestos Pointer Events + `NumberPromptDialog`. Engine Cliente/Terceiros, offline-first. FRONTEND + BACKEND ADITIVO, ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3096** — MEDIÇÃO DE TERCEIROS · NA "CONFIGURAÇÃO DE RETENÇÕES DO CONTRATO (%)" O USUÁRIO VOLTA A CONSEGUIR APAGAR O "0" DOS CAMPOS (ISS/INSS/IRRF/OUTRAS/RET. TÉCNICA) PARA DIGITAR O PERCENTUAL. `ContratoDetalhe.tsx`: `percConfig` passa de estado NUMÉRICO p/ TEXTO; `onChange` grava o valor cru (permite vazio); conversão `parseFloat(...) || 0` só no "Salvar Config". FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3095** — MEDIÇÃO DE TERCEIROS · A LISTA "MEDIÇÕES REGISTRADAS" PASSA A SER ORGANIZADA POR MÊS E ANO, COM NAVEGADOR DE ANO (`< 2026 >`) E 12 CHIPS (JAN–DEZ), CADA UM COM "DOT" DE STATUS (AZUL = COM LANÇAMENTO · VERDE = CONSOLIDADO · CINZA = SEM DADOS), IGUAL À LEGENDA DO CONTAS A PAGAR. `Medicoes.tsx`: helper `periodoDe(m)` extrai `{ano,mes}` de `m.periodo`/`m.dataReferencia`; `mesesStatus` (useMemo) classifica o dot; `filtradas` filtra por mês/ano+status; UI espelha o padrão inline de `FinanceiroContasAPagar.tsx`. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.





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
