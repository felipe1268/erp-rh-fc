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

- **Rev. 3311** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA (IMPORTAR EXTRATO) · A IMPORTAÇÃO DE EXTRATO EM PDF DO BANCO DO BRASIL DEPENDIA DO FALLBACK DE IA (REV. 3308), QUE ESTOURAVA A COTA DO GEMINI FREE-TIER (429 RESOURCE_EXHAUSTED), E UM EXTRATO BB SEM LANÇAMENTOS ("A CONTA NAO FOI MOVIMENTADA") CAÍA NA MESMA MENSAGEM GENÉRICA DE FALHA. AGORA O BANCO DO BRASIL TEM PARSER DETERMINÍSTICO PRÓPRIO (LEITURA DIRETA DO TEXTO DO PDF, SEM IA) E O CASO "CONTA NÃO MOVIMENTADA" RETORNA MENSAGEM CLARA. 100% BACKEND (+1 LINHA DE DICA NO FRONT) · ADITIVO · ZERO SCHEMA/ALTER/DROP/DELETE.** O extrato do BB é PDF de TEXTO selecionável (a Caixa devolve 0 linhas → ia direto pra IA). CORREÇÃO: novo `server/services/bbPdfParser.ts` (`parseBancoBrasilExtratoPdf`) lê o texto via `pdf-parse`, detecta BB + flag `semMovimento`, e por linha com data ignora "Saldo Anterior"/"S A L D O"/"SALDO DIA" e coleta tokens `R$,CC` (1º=Valor por D/C; último=Saldo). `parseExtratoLines` (`financial.ts`) virou 3 etapas: Caixa → BB determinístico (sem movimento → BAD_REQUEST claro; senão `bb.lines`) → fallback IA. FRONT (`FinanceiroConciliacao.tsx`): dica cita "Caixa e Banco do Brasil por leitura direta". NOTA: amostra disponível é SEM movimento — layout da linha de transação inferido da estrutura; revalidar com extrato COM lançamentos. Detalhe: `shared/changelog.ts`.

- **Rev. 3310** — **RH & DP / FOLHA DE PAGAMENTO · ABA "COMPARATIVO FOLHA × ERP (VERBA POR VERBA)" · O COMPARATIVO CRUZAVA VÁRIAS VERBAS (SAL. BASE, HE, DESCONTOS) MAS NÃO O VALOR MAIS IMPORTANTE: O LÍQUIDO. SÓ MOSTRAVA "LÍQUIDO FOLHA" (PDF) E UM "LÍQUIDO ERP PARCIAL" SEM INSS/IRRF/FGTS (SEMPRE MAIOR QUE O REAL). AGORA HÁ COLUNAS "LÍQUIDO ERP" (LÍQUIDO REAL DO PAGAMENTO SIMULADO/CONSOLIDADO, COM INSS/IRRF) E "DIF. LÍQUIDO", E A DIVERGÊNCIA TAMBÉM DISPARA POR DIFERENÇA DE LÍQUIDO. 100% FRONT · ADITIVO · ZERO SCHEMA/ALTER/DROP/DELETE.** FONTE: `payroll_payments.salarioLiquido` via `payrollEngine.listarPagamentos`. CORREÇÃO (`FolhaPagamento.tsx`, `ComparativoFolhaErpView` + `DetalhamentoVerbasFuncionario`): nova query `pagsErp` + `pagMap` (employeeId→salarioLiquido); `linhas` ganha `liqErpReal`/`temLiqErp`/`diffLiq` e `temDivergencia=diffTotal>1||diffLiq>1`; KPIs 5→6 cols ("Líquido ERP" real + "Dif. Líquido"); 2 colunas novas na tabela (colSpan 10→12); CSV + rodapé do expand + legenda. Sem simulação no mês → "—" (não infla divergência); `liqErpParcial` mantido. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3309** — **RH & DP / FÉRIAS · ABA "CALENDÁRIO DE FÉRIAS" · A LISTA DE COLABORADORES VINHA EM ORDEM ARBITRÁRIA (ORDEM DE CHEGADA DOS REGISTROS / employeeId), DIFICULTANDO ACHAR UMA PESSOA. AGORA O CALENDÁRIO É ORDENADO POR NOME DO COLABORADOR (A→Z), IGNORANDO ACENTOS. 100% FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** CORREÇÃO (`client/src/pages/Ferias.tsx`, useMemo `calendarioAgrupado`): após agrupar os períodos por `employeeId`, o `Object.values(map)` passou a ser ordenado por `removeAccents(employee.nome).localeCompare(..., "pt-BR")`. Sem mexer em backend/dados/legendas; só a ORDEM das linhas muda. Detalhe: `shared/changelog.ts`.

- **Rev. 3308** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA (IMPORTAR EXTRATO) · A IMPORTAÇÃO DE EXTRATO EM PDF DO BANCO DO BRASIL QUEBRAVA COM "NÃO FOI POSSÍVEL EXTRAIR TRANSAÇÕES DO PDF. VERIFIQUE SE É O EXTRATO ... DA CAIXA". O PARSER DE PDF ERA HARDCODED PRO LAYOUT EM COLUNAS DA CAIXA — QUALQUER OUTRO BANCO (BB, ITAÚ, BRADESCO...) DEVOLVIA 0 LINHAS E CAÍA NO ERRO. AGORA, QUANDO O PARSER DA CAIXA NÃO RECONHECE NADA, A LEITURA CAI AUTOMATICAMENTE PRO FALLBACK DE IA (GEMINI VISION → ANTHROPIC), QUE LÊ O PDF DE QUALQUER BANCO. 100% BACKEND (+1 LINHA NO FRONT) · ADITIVO (SÓ FALLBACK) · ZERO SCHEMA/ALTER/DROP/DELETE.** CAUSA: `parseExtratoLines` (`financial.ts`) chamava SÓ `parseCaixaExtratoPdf` (classifica linhas por POSIÇÃO X fixa da Caixa); no PDF do BB as colunas ficam em X diferentes → 0 transações → `BAD_REQUEST`. CORREÇÃO: novo `server/services/extratoIaParser.ts` (`parseExtratoComIA`, reusa infra de visão da Rev. 3306, prompt+schema p/ `{data, descricao, valor c/ sinal, saldo}`, parser BR-aware + `salvageJson`); caminho PDF virou 2 etapas (Caixa determinístico → fallback IA); "não é PDF válido" continua fatal. FRONT (`FinanceiroConciliacao.tsx`): dica bank-agnostic. Detalhe: `shared/changelog.ts`.

- **Rev. 3307** — **FINANCEIRO / CONTROLE DE CARTÃO DE CRÉDITO (ABA FATURAS) · O BOTÃO "VINCULAR" (Rev. 3303) QUEBRAVA COM "ERRO AO VINCULAR — Failed query: UPDATE financial_cartao_faturas SET cartao_id=$1 ... WHERE id=$3 AND company_id= AND ..." (REPARE NO `company_id= ` SEM VALOR). NÃO ERA O company_id FALTANDO NO INPUT — ERA DESALINHAMENTO DE PLACEHOLDERS NO `dbExecute`. 100% BACKEND · BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** CAUSA: `dbExecute` (`cartao.ts`) liga params por ORDEM DE APARIÇÃO (`$N` é cosmético); o UPDATE de `vincularFaturaCartao` REUSAVA `$1` 2x (`SET cartao_id=$1` + `CASE WHEN $1::int`), gerando 4 fendas pra um array de 3 valores → CASE pegou `id`, WHERE id pegou `companyId`, e `company_id` ficou vazio. CORREÇÃO: cada aparição com seu placeholder (`$1..$4`) + array `[cartaoId, cartaoId, id, companyId]`; comentário inline alertando p/ não reusar `$N`. Detalhe: `shared/changelog.ts`.

- **Rev. 3306** — **FINANCEIRO / CONTROLE DE CARTÃO DE CRÉDITO (IMPORTAR FATURA POR IA) · A LEITURA DA FATURA (PDF) QUEBRAVA COM "GEMINI VISION FALHOU: 429 ... RESOURCE_EXHAUSTED" QUANDO A COTA DO FREE-TIER DO GOOGLE ESGOTAVA. AGORA, QUANDO O GEMINI FALHA (MESMO APÓS OS RETRIES QUE HONRAM O `retryDelay`), A LEITURA CAI AUTOMATICAMENTE PRO ANTHROPIC VISION (CLAUDE), QUE SUPORTA PDF VIA A INTEGRAÇÃO INSTALADA. 100% BACKEND · ADITIVO (SÓ FALLBACK) · ZERO SCHEMA/ALTER/DROP/DELETE.** CAUSA: `lerFaturaComIA` (`cartao.ts`) só caía pro Anthropic se `GOOGLE_API_KEY` AUSENTE; com a chave presente, a cota estourada propagava o 429. CORREÇÃO: chamada ao Gemini virou try/catch → em qualquer erro cai pro `invokeAnthropicVision` (`claude-sonnet-4-6`, PDF via bloco `document`, maxTokens 16384); se Anthropic também falhar, propaga o erro do Gemini. NOTA: cota DIÁRIA esgotada + Anthropic indisponível ainda falha. Detalhe: `shared/changelog.ts`.

- **Rev. 3305** — **RH & DP / FOLHA DE VALE + FOLHA DE PAGAMENTO · O BOTÃO "ARREDONDAMENTO" (Rev. 3302) NÃO MOSTRAVA EFEITO NA TELA: O TOAST DIZIA "N VALE(S) ARREDONDADO(S)" MAS OS VALORES CONTINUAVAM IGUAIS. NÃO ERA BUG DE BACKEND — BANCO/SNAPSHOT JÁ GRAVAVAM CERTO (CONFIRMADO NO NEON); A TELA NÃO RE-LIA O SNAPSHOT FRESCO. 100% FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** CAUSA: o effect de hidratação (`FolhaPagamento.tsx`) tem guard `if (lastLoadedPeriodId.current === pid) return;`; o `arredondarMut` só fazia `refetch()` → o guard pulava a re-leitura, deixando `valeResult`/`pagamentoResult` velhos. CORREÇÃO: no `onSuccess`, antes do `refetch()`, faz `lastLoadedPeriodId.current = null` p/ FORÇAR a re-hidratação (cobre vale E folha). Detalhe: `shared/changelog.ts`.

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
