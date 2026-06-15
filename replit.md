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

- **Rev. 3136** — **FINANCEIRO / LANÇAMENTOS · OS LANÇAMENTOS DE ORIGEM "CRONOGRAMA" (PROJEÇÕES DO VALOR DE CONTRATO DISTRIBUÍDO MÊS A MÊS) SAÍRAM DA TELA DE LANÇAMENTOS — QUE AGORA MOSTRA SÓ CAIXA REAL (O QUE REALMENTE ENTROU/SAIU DAS CONTAS).** PEDIDO (iPad, print da tela cheia de "Cronograma: … • Origem: Cronograma • A Pagar"): "estes lançamentos do cronograma tire daqui… vamos estudar esta função em outro momento; agora preciso dos valores REAIS conforme lançamentos e conciliação bancária." CAUSA: a tela listava `financial.getEntries` sem filtrar origem → as projeções `cronograma_atividade` (valor de contrato distribuído mês a mês, NÃO caixa real — cf. regra "cronograma_atividade = projeção, não custo real") apareciam misturadas, poluindo a leitura e inflando contagem/bolinhas. CORREÇÃO (BACKEND ADITIVO + FRONTEND; ZERO ALTER/DROP/DELETE/SCHEMA): (1) `financial.ts` — `getEntries` e `getEntriesResumoMensal` ganharam param OPCIONAL `excluirCronograma:boolean` (default ausente → INTACTO p/ outros consumidores, ex. `FinanceiroConciliacao.tsx`); quando `true`, adiciona cond LITERAL `COALESCE(origem_modulo,'') <> 'cronograma_atividade'` (sem placeholder → não mexe na ligação posicional do `dbExecute`), valendo p/ listagem, count e resumo mensal; (2) `FinanceiroLancamentos.tsx` passa `excluirCronograma: true` nas duas queries. RESSALVA: restrito à tela de Lançamentos; função Cronograma e demais telas inalteradas; nenhum dado tocado (lançamentos seguem no banco). Detalhe: `shared/changelog.ts`.

- **Rev. 3135** — **FINANCEIRO / ANÁLISE DE CUSTOS · O SELETOR/GRÁFICO "CENTRO DE CUSTO" PASSOU A LISTAR OS CENTROS DE CUSTO CADASTRADOS (RH, DIRETORIA, DESPESAS GERAIS DE OBRAS, FINANCEIRO…) NO LUGAR DAS OBRAS — NO DASHBOARD E NA TELA DE DETALHE (FILTRO + EDIÇÃO/RECLASSIFICAÇÃO EM LOTE).** PEDIDO (iPad): "quero ver os Centros de Custo cadastrados, não as obras." CAUSA: a Análise de Custos agrupava o eixo "centro de custo" por `r.obraNome` (usava a OBRA como se fosse o CC); os Centros REAIS já existiam em `financial_cost_centers` (`financial.getCostCenters`) e o vínculo natural é CATEGORIA → CC via `financial_accounts.centroCustoId`. CORREÇÃO (FRONTEND + ADITIVO; ZERO ALTER/DROP/DELETE — só `ADD COLUMN IF NOT EXISTS`): (1) `shared/centroCusto.ts` (NOVO) com `buildCentroCustoMaps`+`centroCustoNomeDe` — prioridade CC explícito no lançamento → derivado da categoria → "Sem centro de custo"; (2) `drizzle/schema.ts`+self-heal `[SyncSchema+]`: `financialEntries` ganhou `centro_custo_id`/`centro_custo_nome` p/ CC explícito (override); (3) `financial.ts`: `getContasAPagarByYear` traz os campos; `bulkReclassificar`+`updateEntry` gravam o CC; (4) `FinanceiroAnaliseCustos.tsx`+`FinanceiroAnaliseCustosDetalhe.tsx`: queries `getAccounts`+`getCostCenters`→maps; agrupador e TODA a UI (filtro, edição inline, lote, dialog) convertidos obra→centro; removidos `obrasData`/`obraOpcoes`/`resolveObra`. RESSALVA: sem categoria mapeada → "Sem centro de custo" (agrupador honesto); telas por OBRA inalteradas. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3134** — **FINANCEIRO / ANÁLISE DE CUSTOS · O GRÁFICO "CUSTO POR MÊS" (E SEU DRILL-DOWN) PASSOU A BUCKETIZAR OS LANÇAMENTOS PELA DATA DE PAGAMENTO (REGIME DE CAIXA), NÃO MAIS PELA COMPETÊNCIA.** `getContasAPagarByYear` ganhou param OPCIONAL `baseData:"vencimento"|"caixa"` (default "vencimento" intacto); com "caixa" o filtro de ano vira `(status='pago' AND year(data_pagamento)=ano) OR (status<>'pago' AND year(COALESCE(venc,created))=ano)` e `mesNumDe` usa DATA EFETIVA, eliminando o vazamento cross-ano em TODOS os agregados. ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3133** — **FINANCEIRO / LANÇAMENTOS · O SELETOR DE PERÍODO PASSOU A USAR O MESMO PADRÃO DO CONTAS A RECEBER / CONTAS A PAGAR — TIMELINE "ANO + FAIXA DE MESES (JAN–DEZ)" COM BOLINHAS DE STATUS, NO LUGAR DO CALENDÁRIO DE RANGE ABERTO.** UI espelha `FinanceiroContasAPagar.tsx`; a timeline só COMANDA os mesmos `dataInicio`/`dataFim` do `getEntries`. Bolinhas: novo endpoint READ-ONLY `financial.getEntriesResumoMensal` (SÓ contagens por mês, mesma âncora do `getEntries`, exclui `cancelado`). Tenancy `_assertFinanceiroCompanyAccess`+`resolveCompanyIds`. ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3132** — **FINANCEIRO / LANÇAMENTOS · IMPORTAÇÃO EM LOTE (SCRIPT CONTROLADO, SEM MÓDULO/ABA) DA PLANILHA `Financeiro - Pagamentos 2026` INTEIRA — TODOS OS MESES — SEM DUPLICAR O QUE JÁ FOI LANÇADO À MÃO.** BUG-RAIZ na leitura: valores são NÚMEROS NATIVOS (`304.8`=R$304,80) → `raw:true`+`Math.round(parseFloat*100)`. FC 60002: 2.875 novos (R$ 5.354.832,25) em 1 transação, `status='pago'`, dedup por centavos+data±3d+token fornecedor (268 já existiam). REVERSÍVEL via `origem_modulo='importacao_excel'`+`origem_descricao LIKE 'IMP_PLANILHA_v1%'` → UPDATE status='cancelado' (com tenant). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3131** — **RH / COLETA DE CAMPO · QUANDO A COLETA ATINGE 100% DOS FUNCIONÁRIOS A COLETAR ELA AGORA SE FINALIZA SOZINHA (DÁ COMO "CONCLUÍDO" + FECHA O LINK / `ativo=0`) MESMO QUANDO A CONCLUSÃO NÃO VEIO DO ÚLTIMO ENVIO PÚBLICO.** PEDIDO (iPad, print da tela "Coleta"): "quando acabar tudo, fecha a coleta e dê como concluído." CAUSA-RAIZ: duas regras desalinhadas em `server/routers/coletaRh.ts` — o badge "Concluído" de `listarSessoes` é DERIVADO ao vivo (`coletados >= totalAlocados`), mas o auto-close (`SET ativo=0`) só existia em `enviarResposta` (último envio do link). Se batia 100% por outro caminho (ex.: funcionário DESALOCADO encolhe o universo), o badge virava "Concluído" mas o link seguia ATIVO. CORREÇÃO (BACKEND-ONLY; ZERO SCHEMA/ALTER/DROP/DELETE): `listarSessoes` se AUTO-CURA — calcula conclusão, junta `finalizarIds`, UM `UPDATE ... SET ativo=0 WHERE id IN (...) AND companyId IN (...) AND ativo=1 RETURNING id` (best-effort, idempotente, tenant-safe), só os IDs RETORNADOS rebaixam `ativo:0` no payload. Auto-close de `enviarResposta` (Rev. 2902) intacto. Detalhe: `shared/changelog.ts`.

- **Rev. 3130** — **CONTROLE DE DOCUMENTOS / ABA "MAPEAMENTO" · ASO JÁ LIDO POR IA NÃO REAPARECE NO LOTE DE LEITURA — INCLUSIVE OS "DESCARTADOS" (REJEITADOS) — EVITANDO RELER O MESMO PDF VÁRIAS VEZES.** PEDIDO (iPad, com print do painel "Revisão das leituras da IA"): "Quem já foi lido por ia não precisa aparecer novamente, para evitar leitura do mesmo arquivo várias vezes." CAUSA: o filtro de pendentes (em `lerLoteIA` e `listPendentesIA` de `server/routers/controleDocumentos.ts`) excluía da fila só ASOs com extração `aguardando_revisao`/`aprovado`; quem o usuário DESCARTAVA (botão "Descartar" → `rejeitarExtracaoIA` grava `rejeitado`) caía de volta na fila e era RELIDO no próximo lote. CORREÇÃO (BACKEND-ONLY; ZERO SCHEMA/ALTER/DROP/DELETE): o filtro passou a tratar como "já lido" os 3 estados terminais — `aguardando_revisao | aprovado | rejeitado` (nenhum reaparece no `runLote` → `listPendentesIA`); mantido `erro` re-tentável (leitura que FALHOU e nunca concluiu — 429/503 Gemini, Rev. 3128) p/ não perder ASO por falha transitória. Botões manuais ("Ler com IA"/"Ler selecionados") seguem deliberados. Tenancy + `assertAiModuleEnabled` inalterados. Detalhe: `shared/changelog.ts`.

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
