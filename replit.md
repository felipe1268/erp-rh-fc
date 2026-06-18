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

- **Rev. 3282** — **FINANCEIRO / DASHBOARD DE CONCILIAÇÃO BANCÁRIA · O CARD ÚNICO "MOVIMENTADO NO EXTRATO" (QUE SOMAVA ENTRADAS + SAÍDAS NUM VALOR SÓ E PARECIA INFLADO/DUPLICADO) FOI SUBSTITUÍDO POR 3 CARDS CLAROS NO GRUPO "MOVIMENTAÇÃO DO EXTRATO": ENTRADAS (CRÉDITOS, VERDE), SAÍDAS (DÉBITOS, VERMELHO) E SALDO LÍQUIDO (ENTROU − SAIU). O "GIRO BRUTO" (A SOMA ANTIGA) VIROU SUBTÍTULO DO SALDO LÍQUIDO; OS KPIs DE CONCILIAÇÃO (CONCILIADO / PENDENTE / % CONCILIADO) FORAM AGRUPADOS NUM SEGUNDO BLOCO ROTULADO "CONCILIAÇÃO". 100% READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** PEDIDO (piloto FC): o "Movimentado no extrato" (R$ 16.006.184,16/2026) parecia errado/duplicado; pediu p/ separar entrada e saída "p/ não ficar confuso" e questionou a utilidade prática do total de movimentação. DIAGNÓSTICO (Neon, FC ENGENHARIA 60002, 2026): SEM duplicação (1999 linhas, 0 duplicatas) — o valor é o GIRO BRUTO (`SUM(ABS(valor))`) = Entradas R$ 7.919.219,44 + Saídas R$ 8.086.964,72 (saldo líquido −R$ 167.745,28); a fórmula está correta, o problema era SEMÂNTICO (um KPI só somando o que entrou COM o que saiu dá falsa impressão de valor inflado). BACK (`server/routers/financial.ts`, `getBankAccountsConciliacaoStatus`): a query por conta ganhou `valorEntradas` (`SUM(valor>=0)`) e `valorSaidas` (`SUM(ABS(valor) WHERE valor<0)`) — 100% aditivo, READ-ONLY. FRONT (`client/src/pages/financeiro/dashboards/DashConciliacao.tsx`): `kpis` agrega entradas/saídas/saldoLiquido; o grid de 4 KPIs virou 2 grupos rotulados; o detalhe por conta ganhou colunas Entradas/Saídas e "Movimentado"→"Giro bruto". NA PRÁTICA (resposta ao usuário): o giro bruto é só métrica de VOLUME/sanidade de importação — Entradas/Saídas/Saldo líquido é o acionável, por isso passaram a liderar e o giro virou subtítulo. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3281** — **RH & DP / FOLHA DE ADIANTAMENTO (VALE — CÁLCULO INTERNO) · FUNCIONÁRIOS EM AVISO PRÉVIO TRABALHADO (STATUS "AVISO") E EM FÉRIAS (STATUS "FERIAS") VOLTARAM A APARECER NO VALE. ANTES A SELEÇÃO PEGAVA SÓ status='Ativo' ESTRITO, ENTÃO QUEM VIRAVA "AVISO"/"FERIAS" NO FIM DO MÊS (AVISO/GOZO COMEÇANDO APÓS O DIA 15) SUMIA DA FOLHA DE ADIANTAMENTO MESMO TENDO TRABALHADO A 1ª QUINZENA INTEIRA. 100% BACKEND (SELEÇÃO) · ZERO SCHEMA/ALTER/DROP/DELETE.** SINTOMA (piloto FC, maio/2026): KELLEN (Aviso; aviso trabalhado 26/05→24/06) e LUIS CLAUDIO (Ferias; gozo 25/05→23/06) NÃO apareciam, apesar de terem trabalhado a 1ª quinzena inteira; ELIZEU (Desligado; aviso CONCLUÍDO em março, 02/03→31/03) aparecia como SNAPSHOT antigo (linha de maio gerada quando ainda estava "Ativo"). CAUSA: `gerarVale` (`server/routers/payrollEngine.ts`) selecionava `eq(employees.status,'Ativo')`; o caminho de "desligados com aviso" exige status='Desligado' (aviso concluído), então "Aviso"/"Ferias" caíam fora de ambos → nenhuma linha em `payroll_advances` p/ 2026-05. SOLUÇÃO (VALE): a seleção de ativos (`empListAtivos`) e a de "excluídos por falta de dado salarial" passaram p/ `status IN ('Ativo','Aviso','Ferias')`. A proporcionalidade de férias (`feriasMesMap`/`feriasQuinzenaMap`) e o bloqueio "<10 dias úteis na quinzena 1–15" já existentes tratam quem não trabalhou o suficiente (vira alerta/bloqueio, não some) — o ramo blunt de "Aviso" é seguro pois esse gate zera aviso indenizado/sem ponto. SOLUÇÃO (FOLHA): p/ o vale não ficar órfão, `simularPagamento` ganhou um ramo `status='Aviso'` ESPELHANDO o de Desligado-em-aviso (`EXISTS` de aviso NÃO-cancelado, NÃO-indenizado, sobrepondo o mês) — 100% ADITIVO (não altera 'Ativo'/'Ferias'/'Desligado'); o `tipo NOT LIKE '%indenizado%'` é obrigatório porque `criarAvisoPrevioInterno` carimba status='Aviso' p/ todo tipo. Elizeu sai num recálculo (aviso `dataFim` 31/03 reprova o `>= 01/05`). AÇÃO RH: regerar o vale de maio ("Consolidar Vale") p/ o snapshot refletir a nova seleção. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3280** — **RH & DP / DISSÍDIO · O "RELATÓRIO DE DIFERENÇAS SALARIAIS RETROATIVAS (DISSÍDIO)" SAIU DE CONFIGURAÇÕES › SINDICAL/DISSÍDIO E PASSOU PARA O MÓDULO RH › FOLHA DE PAGAMENTO; NO CABEÇALHO DA FOLHA SURGIU O BOTÃO "DIFERENÇAS DISSÍDIO" (FILEBARCHART) QUE ABRE UM DIÁLOGO COM O RELATÓRIO ESCOPADO PELO ANO SELECIONADO. EM CONFIGURAÇÕES PERMANECE O CAMPO "DATA DE VIGÊNCIA" NO CADASTRO "NOVO ANO". 100% FRONT · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** Procedure `sindical.relatorioDiferencas` (read-only) reaproveitada; `Configuracoes.tsx` (`SindicalDissidioTab`) perdeu o bloco do relatório; `FolhaPagamento.tsx` ganhou estado `showDissidioRel` + query `dissidioRelQuery` + botão no cabeçalho + `Dialog` com 4 cards de totais (BRL) e tabela por funcionário. Detalhe: `shared/changelog.ts`.

- **Rev. 3279** — **RH & DP / FOLHA DE PAGAMENTO (CÁLCULO INTERNO) · CORRIGIDA CONDIÇÃO DE CORRIDA QUE FAZIA O RESUMO DO VALE E DO PAGAMENTO ("VER RESULTADO") SUMIREM "ALEATORIAMENTE" P/ ALGUNS USUÁRIOS — PARECIA PERMISSÃO, MAS ERA HIDRATAÇÃO DE ESTADO NO CLIENT. 100% FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** Dois `useEffect` concorrentes (um hidratava de `payrollPeriod.data` com guard `!valeResult`, outro zerava tudo por `[mesAno]`) colidiam quando o `getPeriod` do mês-alvo já estava em cache do React Query → resumos ficavam NULL "p/ sempre", de forma NÃO-DETERMINÍSTICA por sessão. Viraram UM effect determinístico chaveado pela IDENTIDADE do período (`pid = pd?.id ?? "none"`), que só re-hidrata/limpa quando `pid` muda (`client/src/pages/FolhaPagamento.tsx`). Detalhe: `shared/changelog.ts`.

- **Rev. 3278** — **RH & DP / SINDICAL · O DISSÍDIO GANHOU UMA "DATA DE VIGÊNCIA". QUANDO O ACORDO É FECHADO COM ATRASO (EX.: VIGÊNCIA 01/05, APLICADO EM JUNHO), O MÊS JÁ PAGO NO VALOR ANTIGO NÃO É REABERTO — O ERP CALCULA A DIFERENÇA SALARIAL RETROATIVA (TODAS AS VERBAS DO PERÍODO × % DO REAJUSTE) E A LANÇA COMO PROVENTO "DIFERENÇA SALARIAL (REF. MM/AAAA)" NA FOLHA DO MÊS DE APLICAÇÃO. PJ NUNCA RECEBE. DESLIGADOS NO INTERVALO RETROATIVO GERAM RESCISÃO COMPLEMENTAR. NOVO RELATÓRIO DEDICADO LISTA SÓ AS DIFERENÇAS. SCHEMA 100% ADITIVO (ADD COLUMN IF NOT EXISTS) — ZERO ALTER/DROP/DELETE.** SCHEMA: `dissidios.dataVigencia` + `dissidio_funcionarios` (4 cols) + `termination_notices` (5 cols), tudo ADD COLUMN IF NOT EXISTS (`drizzle/schema.ts` + self-heal `[SyncSchema+]`). `sindical.cadastrar` aceita `dataVigencia`; `sindical.aplicar` soma verbas retroativas × % (CLT) e gera rescisão complementar p/ desligados (PJ ignorado); `payrollEngine.simularPagamento` injeta a diferença na folha; `sindical.relatorioDiferencas` (read-only) + UI. Detalhe: `shared/changelog.ts`.

- **Rev. 3277** — **RH & DP / RESCISÃO · O CÁLCULO DE FÉRIAS VENCIDAS NA RESCISÃO PASSOU A CONSIDERAR O SALDO POR DIA (GOZO PARCIAL), NÃO MAIS PERÍODOS INTEIROS — UM PERÍODO COMPLETO COM GOZO PARCIAL (EX.: 5 DE 30 DIAS, status='concluida') TINHA OS 25 DIAS RESTANTES IGNORADOS (RESCISÃO PAGAVA R$ 0); AGORA PAGA OS REMANESCENTES (base/30 × diasRestantes + 1/3). ZERO SCHEMA/ALTER/DROP/DELETE.** `server/utils/rescisaoCalc.ts` ganhou `diasVencidosOverride?`; `server/routers/avisoPrevioFerias.ts` tem fonte única `saldoDiasVencidoPeriodo`/`getFeriasVencidasSaldo` e as 8 chamadas propagam o override (fallback `periodos×30` se a query falhar). Detalhe: `shared/changelog.ts`.

- **Rev. 3276** — **COMPRAS / SOLICITAÇÃO DE COMPRA (SC) · A TELA "SOLICITAÇÕES (SC)" GANHOU UM FILTRO POR PERÍODO (DE/ATÉ) AO LADO DO SELETOR "TODAS AS OBRAS", FILTRANDO PELA "DATA POSTADA" (criadoEm) — A MESMA DATA DA ORDENAÇÃO PADRÃO E EXIBIDA NA LISTA. ESCOLHIDO O PERÍODO, A TABELA, OS PILLS DE TIPO, OS MINI-BLOCOS DO CARD "STATUS DAS SOLICITAÇÕES" E OS KPIs PASSAM A REFLETIR SÓ AS SCs DAQUELE INTERVALO; UM BOTÃO "X" LIMPA O PERÍODO. 100% FRONT · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** Estados `filtroDataDe`/`filtroDataAte` ("YYYY-MM-DD"); predicado `dentroDoPeriodo(r)` compara `r.criadoEm` contra `[de T00:00:00 .. até T23:59:59]` (inclusivo); aplicado em `listaFiltradaObraBase` E `listaKpisBase` (`client/src/pages/compras/Solicitacoes.tsx`); UI: dois `<Input type="date">` + botão `X`. ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
