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

- **Rev. 3029** — **FINANCEIRO → "ANÁLISE DE CUSTOS" · TELA DE DETALHE ("LANÇAMENTOS DETALHADOS"): (1) A COLUNA "FORNECEDOR" PASSA A MOSTRAR O NOME (ANTES "—" EM TUDO); (2) A DESCRIÇÃO GANHA UM BADGE LIMPO COM O Nº DO DOCUMENTO (`OC-2026-0029`, SEM O "OC #OC" REDUNDANTE) QUE É CLICÁVEL E ABRE A ORDEM DE COMPRA DE ORIGEM; (3) A DESCRIÇÃO FICA SEM POLUIÇÃO (REMOVE Nº DUPLICADO, O FORNECEDOR — QUE AGORA VIVE NA SUA COLUNA — E OS "*" DE PREVISÃO).** PEDIDO (prints IMG_1918/1919/1920): "mostra o fornecedor; deixa a descrição clicável p/ abrir a OC/OS de origem; número mais limpo, tudo organizado". CAUSA-RAIZ (dados REAIS do Neon): linhas de OC têm `origem_modulo='compras'`/`compra_oc`, `origem_id`=id da OC e `fornecedor_nome` SEMPRE NULL — o fornecedor vive embutido na descrição após o travessão "—" ("OC OC-2026-0105 — Ferragens Santa Rita"). A tela só lia `fornecedorNome` (null) → coluna "—" e descrição crua. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema; 100% client-side sobre `financial.getContasAPagarByYear`/alias `financial.ln`) em `FinanceiroAnaliseCustosDetalhe.tsx`: NOVO `parseLanc(r)` (extrai `docNumero` via regex `(OC|OS|FD)-\d{4}-\d+` canônico, `fornecedorDesc` pós-"—" limpo, e o `livre` sem nº/"#"/"*"); NOVO `fornecedorDe(r)` (`fornecedorNome` || `fornecedorDesc`) na coluna Fornecedor; NOVO `linkDeOrigem(r)` (compras/compra_oc → `/compras/ordens?destaque=<origem_id>`, que a tela de Ordens já abre); célula Descrição reescrita = badge índigo clicável (`ExternalLink` + `stopPropagation`) | badge cinza | texto livre; `abrirEdicao` pré-preenche o fornecedor extraído → abrir+salvar PERSISTE via `updateEntry`. `keyOf.fornecedor`/gráfico "Por Fornecedor" INTOCADOS (paridade de drill com a tela-mãe). REPUBLICAR (só front). Detalhe: `shared/changelog.ts`.
- **Rev. 3028** — **COMPRAS → FLUXO SC → COTAÇÃO: AO EDITAR UMA SOLICITAÇÃO E TROCAR O TIPO (EX.: DE "MATERIAL" P/ "PACOTE"), A MUDANÇA AGORA SE PROPAGA DEFINITIVAMENTE PARA A COTAÇÃO JÁ VINCULADA — A LEGENDA DA COTAÇÃO DEIXA DE FICAR DIVERGENTE DA SOLICITAÇÃO (ANTES: SC=MAT+MDO × COT=MDO).** PEDIDO (prints IMG_1914/IMG_1915): "editei a SC de material p/ pacote, a legenda da SC mudou mas a cotação não acompanhou; garante que TODA alteração na solicitação se propague pras fases seguintes, de forma definitiva". CAUSA-RAIZ: `compras.editarSolicitacao` (`server/routers/compras.ts`) atualizava o `tipo` da SC e descia o TÍTULO p/ `compras_cotacoes.descricao`, mas NUNCA tocava `compras_cotacoes.tipo` — a coluna de onde sai a legenda (material=MAT / servico=MDO / pacote=MAT+MDO / equipamento=EQUIP). O `tipo` da cotação ficava congelado no valor de criação. SOLUÇÃO (BACKEND, ZERO ALTER/DROP/DELETE — só UPDATE idempotente): no `editarSolicitacao`, o bloco que antes só descia o título agora RECONCILIA o tipo: `tipoPropagar = input.tipo ?? sc.tipo` e `db.update(comprasCotacoes).set({ tipo, ...(titulo ? {descricao} : {}) })` no MESMO `WHERE solicitacao_id = id AND status NOT IN ('cancelada','recusada')`. Idempotente; cotações canceladas/recusadas intactas; trava de "SC com OC em andamento" mantida (OCs emitidas não afetadas). `compras_cotacoes_itens` não tem coluna `tipo` (derivado na geração da OC via ratioMat) → nada a propagar lá. REFORÇO NA CRIAÇÃO: `aprovarSolicitacoesEmLote` criava a cotação automática SEM `tipo` (caía em "material"); agora nasce com `tipo: sc.tipo ?? "material"` → consistência SC×COT garantida na CRIAÇÃO e na EDIÇÃO. REPUBLICAR (só backend). FRONT inalterado. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3027** — FINANCEIRO → "ANÁLISE DE CUSTOS": (1) "CUSTO POR CATEGORIA"/"POR CENTRO DE CUSTO" GANHAM VISUAL EMPILHADO PAGO (VERDE)×PREVISÃO (ÂMBAR); (2) NOVA TABELA COMPARATIVA MÊS A MÊS POR CATEGORIA COM Δ (▲/▼); (3) CATEGORIAS PADRONIZADAS NUMA TAXONOMIA CANÔNICA (FÉRIAS/13º/RESCISÕES/SEGURO DE VIDA/IMPOSTOS/ACORDOS/BENEFÍCIOS/etc., SEM DUPLICADOS). SOLUÇÃO (FRONT-only + 1 módulo shared puro; ZERO ALTER/DROP/DELETE; client-side sobre `financial.getContasAPagarByYear`): NOVO `shared/custosCategorias.ts` (`GRUPOS_CUSTO_ORDEM` + `classificarGrupoCusto(contaNome, origemModulo)`, origem tem precedência); `FinanceiroAnaliseCustos.tsx` cards viram `<Bar stackId>` verde+âmbar + memo `tabelaMensal`; detalhe reaproveita o motor de drill da Rev. 3024 (`keyOf.grupo`). Detalhe: `shared/changelog.ts`.

- **Rev. 3026** — EQUIPAMENTOS PRÓPRIOS → BOTÃO "GERAR PREÇOS" (IA): A GERAÇÃO PASSA A MOSTRAR UMA EVOLUÇÃO DE 0 A 100% FASE A FASE (BARRA DE PROGRESSO + LISTA DE FASES + CONTAGEM VIVA), EM VEZ DO ANTIGO "GERANDO PREÇOS…" ESTÁTICO. SOLUÇÃO — PROCESSAMENTO POR LOTE (client-driven batching stateless; ZERO ALTER/DROP/DELETE). BACKEND (`equipamentos.ts` · `propriosGerarPrecosComIA`): input ganha `offset`/`loteMax`(30, cap 400); cada call processa 1 lote e retorna `totalCombos`/`proximoOffset`/`haMaisLotes`; paginação assimétrica (sobrescrever AVANÇA offset; só-sem-valor fica em 0). FRONT (`Proprios.tsx`): estado `precoRun` + LOOP de `mutateAsync` + `Dialog` de progresso (`<Progress>` 0→100%, fases, contagem viva). Detalhe: `shared/changelog.ts`.

- **Rev. 3025** — FINANCEIRO → "ANÁLISE DE CUSTOS" · TELA DE DETALHE: CADA LINHA FICA CLICÁVEL P/ EDITAR QUALQUER INFO (DESCRIÇÃO, FORNECEDOR, CATEGORIA, CENTRO DE CUSTO, DATAS, VALOR) E HÁ SELEÇÃO MÚLTIPLA P/ DEFINIR CATEGORIA + CENTRO DE CUSTO EM MASSA — PERSISTE NO BANCO E PROPAGA PRO ERP. BACKEND (`financial.ts`, ZERO ALTER/DROP/DELETE): `updateEntry` ganha `contaId`/`obraId`; NOVA `bulkReclassificar` (só categoria/centro, permitida em pago/recebido, tenant-guard + ids inlinados + audit). FRONT (`FinanceiroAnaliseCustosDetalhe.tsx`): checkbox por linha + Dialog de edição (MoneyInput BRL; pago/recebido salva só classificação) + barra sticky de ações em massa; pós-sucesso invalida `getContasAPagarByYear`. Detalhe: `shared/changelog.ts`.

- **Rev. 3024** — FINANCEIRO → "ANÁLISE DE CUSTOS" · TELA DE DETALHE (DRILL-DOWN): OS GRÁFICOS ("DISTRIBUIÇÃO POR MÊS" E A QUEBRA "POR FORNECEDOR"/"POR CENTRO DE CUSTO"/"POR CATEGORIA") FICAM CLICÁVEIS — CADA BARRA ABRE UM RECORTE AINDA MAIS DETALHADO NA MESMA TELA (INCLUSIVE O BUCKET "SEM FORNECEDOR") — E TODOS OS RÓTULOS DE VALOR PASSAM A APARECER EM R$ POR EXTENSO (`R$ 9.000,00`) EM VEZ DO COMPACTO (`R$ 9 mil`). SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema, 100% client-side sobre `financial.getContasAPagarByYear`) em `FinanceiroAnaliseCustosDetalhe.tsx`: NOVO param de URL `extra` = JSON `[{t,v}]` com a cadeia de drills; `rows` aplica mês herdado + filtro primário + cada passo via `aplicaFiltro` (`keyOf` canônicas — corrige o filtro de "Sem fornecedor"); `breakdown` escolhe a 1ª dimensão não filtrada (fornecedor→centro→categoria); `<Bar onClick>` empilha drill; "Voltar" sobe 1 nível; `<LabelList>` trocam `BRLk`→`formatBRL`. Detalhe: `shared/changelog.ts`.

- **Rev. 3023** — EQUIPAMENTOS PRÓPRIOS → BOTÃO "GERAR PREÇOS" (IA): A CONFIRMAÇÃO DEIXA DE USAR O `window.confirm()` NATIVO (FEIO, MOSTRAVA A URL `*.picard.replit.dev`) E PASSA A USAR MODAL shadcn `AlertDialog`. SOLUÇÃO (FRONT-only) em `Proprios.tsx`: estado `confirmPrecos`; `handleGerarPrecos` calcula `semValor` (lógica anti-sobrescrita da Rev. 3015) e abre o modal com ícone `Sparkles` e 2 variantes (há itens sem valor → aviso verde; todos com valor → aviso âmbar de SOBRESCRITA); ação dispara `gerarPrecos.mutate({companyId, sobrescrever})`. `confirm()` de EXCLUIR mantido. Detalhe: `shared/changelog.ts`.

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
