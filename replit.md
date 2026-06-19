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

- **Rev. 3323** — **PLANEJAMENTO / PROJETOS · O PAINEL "EFETIVO × IA — TODAS AS OBRAS" FICAVA SEMPRE ABERTO NO TOPO DA TELA DE PROJETOS, POLUINDO A VISÃO. AGORA É UM BOTÃO ("PAINEL GERENCIAL · ABRIR ANÁLISE") QUE ABRE A ANÁLISE EM TELA PRÓPRIA (COM "VOLTAR AOS PROJETOS"). 100% FRONT · UX/ADITIVO · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `client/src/pages/planejamento/PlanejamentoLista.tsx`: estado local `showEfetivoIA` (default false); no lugar do `EfetivoGlobalIA` inline entrou um card-botão (Sparkles + CTA "Abrir análise"); ao clicar, troca pra visão dedicada (só o painel + "Voltar aos projetos"). Cabeçalho/KPIs sempre visíveis; busca/grade só no modo lista. SEM rota/permissão nova — toggle na mesma página; `EfetivoGlobalIA` e endpoints (`efetivoGlobal`/`ultimaEfetivoGlobal`) intactos. Detalhe: `shared/changelog.ts`.

- **Rev. 3322** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O "PANORAMA GERAL DO MÊS" GANHOU OS CARDS "TOTAL DE ENTRADAS" E "TOTAL DE SAÍDAS" (+ "SALDO DO MÊS"), SOMANDO TODAS AS CONTAS QUANDO NENHUMA ESTÁ SELECIONADA E POR CONTA AO EXPANDIR CADA UMA. 100% FINANCEIRO (1 BACKEND READ-ONLY + 1 FRONT) · ADITIVO · ZERO SCHEMA/ALTER/DROP/DELETE.** Movimentação real do extrato: crédito (`valor > 0`) = entrada; débito (`valor < 0`) = saída; considera TODO o extrato do mês (conciliado + pendente), independe da conciliação. BACKEND (`getConciliacaoReportGeral`, `server/routers/financial.ts`): helpers `somaEntradas`/`somaSaidas`/`qtdEntradas`/`qtdSaidas` reusados por conta (`totais.valorEntradas`/`valorSaidas`) e no agregado da empresa (`[...conciliados, ...extratoSemLancamento]`); READ-ONLY (Regra de Ouro intacta). FRONT (`FinanceiroConciliacao.tsx`): 3 cards de destaque acima dos KPIs de conciliação + entradas/saídas na linha-resumo de cada conta + legenda atualizada. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3321** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O "PANORAMA GERAL DO MÊS" AINDA ESTOURAVA AO SELECIONAR UM MÊS — AGORA COM `DB: code=22007 | msg=invalid input syntax for type date: "60002"`; NENHUM PANORAMA CARREGAVA. AGORA MONTA NORMAL. 100% BACKEND · BUGFIX (2º HOTFIX da Rev. 3319) · ZERO SCHEMA/ALTER/DROP/DELETE.** RAIZ: o helper `dbExecute` (`server/routers/financial.ts`) liga params por ORDEM DE APARIÇÃO do `$N` no texto (o número é cosmético). Na query de descoberta de contas de `getConciliacaoReportGeral` os placeholders apareciam como `b.data >= $2`, `b.data <= $3`, `cba."companyId" = $1`, mas o array era `[companyId, dataInicio, dataFim]` → o `companyId` (60002) caía no `b.data >=` (`22007`). CORREÇÃO: renumerar p/ ordem natural e reordenar o array p/ `[dataInicio, dataFim, companyId]`. LIÇÃO: no `dbExecute` deste arquivo SEMPRE ordene o array pela ordem de APARIÇÃO dos `$N`. Detalhe: `shared/changelog.ts`.

- **Rev. 3320** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O "PANORAMA GERAL DO MÊS" (Rev. 3319) ESTOURAVA "NÃO CONSEGUI MONTAR O PANORAMA — DB: code=42703 | msg=column cba.company_id does not exist" AO SELECIONAR QUALQUER MÊS; NENHUM PANORAMA CARREGAVA. AGORA MONTA NORMAL. 100% BACKEND · BUGFIX (HOTFIX da Rev. 3319) · ZERO SCHEMA/ALTER/DROP/DELETE.** RAIZ: a query de descoberta de contas em `getConciliacaoReportGeral` (`server/routers/financial.ts`) referenciava `cba.company_id` e `cba.descricao`, mas `company_bank_accounts` é camelCase (`"companyId"`) e NÃO tem `descricao` (rótulo vem de `apelido`); a self-heal `bank_statement_lines` é snake_case — a mistura induziu o erro (Postgres aborta na 1ª coluna inexistente, `42703`). CORREÇÃO: `cba."companyId"` + `cba.apelido AS "descricao"`. Detalhe: `shared/changelog.ts`.

- **Rev. 3319** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · AO SELECIONAR UM MÊS SEM ESCOLHER CONTA, A TELA SÓ MOSTRAVA "SELECIONE UMA CONTA"; AGORA EXIBE O "PANORAMA GERAL DO MÊS": TOTAIS AGREGADOS (CONCILIADOS / EXTRATO SEM LANÇAMENTO / ERP SEM EXTRATO / % CONCILIADO) DE TODAS AS CONTAS COM EXTRATO + BLOCO EXPANSÍVEL POR CONTA E DRILL-IN; CONCILIA 1-A-1 DENTRO DO PANORAMA (BARRA INFERIOR + ALERTDIALOG). 100% FINANCEIRO · ADITIVO · REGRA DE OURO MANTIDA (NADA CONCILIA SEM CONFIRMAÇÃO) · ZERO SCHEMA/ALTER/DROP/DELETE.** Motor de `getConciliacaoReport` extraído p/ helper `_computeConciliacaoReport`; nova query read-only `getConciliacaoReportGeral` roda por conta + agrega + re-chaveia ids sintéticos de grupo por conta; guards de conta nas mutations `conciliarLancamento`/`conciliarGrupoLancamentos`. FRONT (`FinanceiroConciliacao.tsx`): empty-state virou painel "Panorama geral do mês". Detalhe: `shared/changelog.ts`.

- **Rev. 3318** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O BOTÃO "DESCONSOLIDAR MÊS" QUEBRAVA COM `25P02 — current transaction is aborted` EM EMPRESAS QUE NUNCA USARAM CONCILIAÇÃO EM GRUPO; QUEM CONSOLIDOU UM MÊS POR ENGANO NÃO CONSEGUIA REVERTER. AGORA DESCONSOLIDA NORMAL. 100% BACKEND · BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** RAIZ: o passo 1b de `desconsolidarMes` (`financial.ts`) reverte membros de grupo via `financial_conciliacao_grupo` (auto-criada só no 1º uso → inexistente em quem nunca usou grupo); o `try/catch` interno engolia `relation does not exist`, mas no Postgres o statement falho ABORTA a transação e o passo 2 estourava `25P02`. CORREÇÃO: checar `to_regclass('public.financial_conciliacao_grupo')` FORA da transação e só rodar 1b quando `temGrupo`. LIÇÃO: nunca tolerar tabela/coluna inexistente com try/catch DENTRO de transação Postgres — cheque com to_regclass FORA ou use SAVEPOINT. Detalhe: `shared/changelog.ts`.

- **Rev. 3317** — **RH & DP / FOLHA DE VALE (CÁLCULO INTERNO — VALE/ADIANTAMENTO) · O TOGGLE "VISÃO GERAL / POR BANCO" DA FOLHA DE PAGAMENTO FOI REPLICADO NA FOLHA DO VALE (CARDS-RESUMO + TABELAS POR CONTA-EMPRESA COM CPF/AGÊNCIA/CONTA/PIX/BRUTO/IR/LÍQUIDO). 100% RH & DP (1 BACKEND READ-ONLY + 1 FRONT) · ADITIVO · ZERO SCHEMA/ALTER/DROP/DELETE.** Nova query read-only `contasBancariasFolha` (`payrollEngine.ts`, JOIN `employees.contaBancariaEmpresaId` ⋈ `company_bank_accounts`, tenant guard); FRONT (`FolhaPagamento.tsx`, view `calculo_vale`): `valeSubView` + toggle + agrupamento client-side por conta-empresa (funciona em snapshots antigos). Detalhe: `shared/changelog.ts`.

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
