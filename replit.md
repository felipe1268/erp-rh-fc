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

- **Rev. 3244** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · NO PAINEL "CHEQUES DEVOLVIDOS NO BANCO", A LEGENDA (TAG-PÍLULA) DO MOTIVO DA DEVOLUÇÃO AGORA APARECE SEMPRE EM CADA CHEQUE — INCLUSIVE QUANDO O EXTRATO NÃO TROUXE O CÓDIGO/ALÍNEA BACEN, CASO EM QUE MOSTRA "MOTIVO NÃO INFORMADO". ANTES, SEM O CÓDIGO, A TAG SUMIA E O CHEQUE FICAVA SEM NENHUMA INDICAÇÃO DE MOTIVO, DIFICULTANDO A ANÁLISE. SÓ CONSULTA.** PEDIDO (piloto FC): "coloque a legenda do motivo que foi devolvido sempre, para facilitar a análise". SOLUÇÃO (FRONT, `FinanceiroConciliacao.tsx`, bloco "Rev. 3235 — CHEQUES DEVOLVIDOS"): a renderização do badge de motivo passou de `{d.motivoCodigo != null && (…)}` (só com código) para um ternário — COM código → tag como antes (vermelha se sustado, âmbar caso contrário, `title`=`motivoTexto`); SEM código → tag NEUTRA cinza "Motivo não informado" com `title` explicando que o extrato não trouxe a alínea Bacen e orientando a conferir direto no extrato/banco. ZERO backend · ZERO SCHEMA/ALTER/DROP/DELETE · "Conciliação só sugestiva" preservada. Detalhe: `shared/changelog.ts`.

- **Rev. 3243** — **FINANCEIRO · NOVA CATEGORIA "DASHBOARDS" NO MENU DO MÓDULO FINANCEIRO, COM 5 PAINÉIS VISUAIS DEDICADOS (CONTAS A RECEBER, CONTAS A PAGAR, CONCILIAÇÃO BANCÁRIA, CONTROLE DE CHEQUES E CARTÃO DE CRÉDITO). CADA PAINEL TEM CABEÇALHO MODERNO COM GRADIENTE + SELETOR DE ANO + ATUALIZAR, CARDS DE INDICADOR (KPI) E GRÁFICOS RESPONSIVOS (RECHARTS) — TUDO CLICÁVEL: UM CLIQUE EM QUALQUER CARD OU GRÁFICO ABRE A TELA OPERACIONAL CORRESPONDENTE PRA O USUÁRIO AGIR. 100% READ-ONLY.** PEDIDO (piloto FC): "criar uma categoria de Dashboards no Financeiro com painéis dedicados por área, visual moderno, gráficos responsivos e que ao clicar leve pra tela da operação". SOLUÇÃO (FRONT, novo diretório `client/src/pages/financeiro/dashboards/`): `_kit.tsx` (kit de apresentação compartilhado — `formatBRL`/`formatBRLCompact` eixos pt-BR "R$ 120 mil"/"R$ 1,2 mi", `MESES_ABREV`, `PALETTE`, `THEMES`, `DashHeader`, `KpiCard` clicável, `ChartCard`, `EmptyState`, `BRLTooltip`); `DashReceber` (emerald, `getContasAReceberByYear`), `DashPagar` (rose, `getContasAPagarByYear`), `DashCheques` (violet, `cheques.resumo`+`verificarExtratoResumo`+`listar`), `DashCartao` (amber, `cartao.listarFaturas`), `DashConciliacao` (blue, `getBankAccounts`+`getBankAccountsConciliacaoStatus` — tooltip de CONTAGEM, não BRL). Agregação 100% client-side via `useMemo` (por mês/status/aging/top-N). MENU: nova seção "Dashboards" em `menuSectionsFinanceiro` (`DashboardLayout.tsx`) após o "Painel". ROTAS: 5 em `App.tsx` (`/financeiro/dashboards/{receber,pagar,conciliacao,cheques,cartao}`) via `lazyWithRetry`+`RouteGuard`, REUSANDO a `route` de permissão da tela operacional de cada painel (sem mexer em `shared/modules.ts`). ZERO backend novo · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3242** — **FINANCEIRO / CONTROLE DE CHEQUES · A TELA GANHOU FILTROS E CARDS DEDICADOS À CONFERÊNCIA COM O EXTRATO BANCÁRIO: COMPENSADOS *E* VERIFICADOS ("CONFERIDOS NO EXTRATO"), OS QUE JÁ BATEM MAS FALTA MARCAR ("CONFERE — FALTA MARCAR") E DIVERGÊNCIAS. TRÊS CARDS CLICÁVEIS (QTD + BRL) FILTRAM A LISTA + TAG-PÍLULA POR LANÇAMENTO. SÓ CONSULTA.** FRONT (`FinanceiroCheques.tsx`): `EXTRATO_FILTERS=["conferido","confere","divergente"]` DERIVADOS das flags do `listar`; NÃO vão no `listarArgs.status` (guard), aplicados client-side em `chequesFiltrados`. Cards alimentados por `verificarExtratoResumo`. BACK: resumo soma TOTAIS BRL — READ-ONLY. ZERO SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3241** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O PAINEL "SUGESTÕES AUTOMÁTICAS DE CONCILIAÇÃO" GANHOU BOTÃO "EXPANDIR" QUE ABRE EM TELA CHEIA (MAIS ESPAÇO PRA REVISAR AS SUGESTÕES); "RECOLHER" VOLTA AO NORMAL. TODA A FUNCIONALIDADE CONTINUA IDÊNTICA — SÓ MUDA O TAMANHO. "CONCILIAÇÃO SÓ SUGESTIVA" PRESERVADA.** FRONT (`FinanceiroConciliacao.tsx`): em vez de duplicar a tabela, o PRÓPRIO card vira tela cheia via toggle de classe (estado `sugFull` → `fixed inset-3 z-50` + backdrop; ZERO duplicação de JSX, mesma árvore React); botão `Expandir`/`Recolher` (Maximize2/Minimize2) no header. ZERO backend · ZERO SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3240** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · DEMONSTRATIVOS · A LISTA "TUDO QUE A IA LEU" (PIX + BOLETOS) GANHOU VISÃO EM TELA CHEIA COM LAYOUT MODERNO E CARDS DE TOTAL (GERAL/PIX/BOLETOS); TABELA NA LARGURA TODA (SEM TRUNCAR VALOR), BUSCA LIVRE E CHIPS DE TIPO; ABRE JÁ FILTRADA POR PIX OU BOLETOS DOS SLOTS DE ANEXO OU DO BOTÃO "TELA CHEIA". SÓ CONSULTA.** FRONT (`FinanceiroConciliacao.tsx`): `useMemo` ÚNICO `leituraIA` alimenta lista inline + diálogo full-screen (sem deriva); estado `leituraFull` + `abrirLeituraFull(kind)`; padrão `expandedList` (`w-[98vw] h-[96vh] p-0`). ZERO backend · ZERO SCHEMA · read-only. Detalhe: `shared/changelog.ts`.

- **Rev. 3239** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · UNIFICAÇÃO DE LANÇAMENTOS QUE NO EXTRATO APARECEM COMO UM ÚNICO VALOR · VR (RH) VIRA 1 LINHA/MÊS (TOTAL); COMBUSTÍVEL E MANUTENÇÃO (FROTA) AGRUPADOS PELO FORNECEDOR/POSTO. CADA GRUPO É 1 LINHA SINTÉTICA (SELO+QTD+EXPANDIR); CASAR O GRUPO BAIXA TODOS OS MEMBROS (N:1); SOMA NÃO MUDA.** BACK (`financial.ts`): `_normNomeConc`+`_agruparConciliacao` (READ-ONLY); SELECTs trazem `origem_modulo`+fornecedor real via LEFT JOIN `fleet_fuel_records`/`fleet_maintenances`; procedure `conciliarGrupoLancamentos` (reserva atômica + baixa membros + tabela-link `financial_conciliacao_grupo` c/ `revertido_em`); `desconsolidarMes` passo "1b". FRONT: `renderEntryRow` trata `agrupado`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3238** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · SEGUNDA VERIFICAÇÃO PELOS DEMONSTRATIVOS · LINHA "SEM LANÇAMENTO" NÃO IDENTIFICADA (NEM CHEQUE NEM FATURA) AGORA CONSULTA "TUDO QUE A IA LEU NOS DEMONSTRATIVOS" (PIX/BOLETOS) P/ DIZER QUEM RECEBEU E SE FOI PIX/BOLETO; SELO ROXO + "LANÇAR NO ERP" PRÉ-PREENCHIDO. READ-ONLY; SÓ-POR-VALOR = "PROVÁVEL".** BACK (`financial.ts`/`getConciliacaoReport`): passo "2c-bis" monta catálogo `DemoItem` do período; `matchDemonstrativoLinha` só após cheque/fatura e só em saídas; estratégia txid→valor+data→valor único. FRONT: selo roxo, `abrirLancar` pré-preenche forma/beneficiário. ZERO escrita · ZERO SCHEMA. Detalhe: `shared/changelog.ts`.

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
