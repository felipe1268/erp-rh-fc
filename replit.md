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

- **Rev. 3357** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · A SUGESTÃO DE "PROVÁVEL FORNECEDOR/CLIENTE" (TEXTO DO CADASTRO NA LINHA DO EXTRATO) GANHOU UM ALGORITMO DE CRUZAMENTO MUITO MELHOR (POR TOKENS, PONDERADO POR TAMANHO, COM FUZZY/DICE E MELHOR-MATCH EM VEZ DO "1º SUBSTRING VENCE") E, NO DIÁLOGO "LANÇAR", A SUGESTÃO É PRÉ-PREENCHIDA E TOTALMENTE EDITÁVEL P/ O USUÁRIO ESCOLHER O FORNECEDOR CORRETO DO CADASTRO. 1 MATCHER REESCRITO (BACKEND) + 1 FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** Pedido (usuário): a indicação de "provável fornecedor" estava MUITO errada; quer (a) algoritmo melhor de cruzamento (nome/proximidade/fuzzy) e (b) campo no "Lançar" para alterar e escolher o fornecedor correto. RAIZ (`server/routers/financial.ts`, `matchCadastro`): a etapa por NOME retornava o PRIMEIRO cadastro cujo nome normalizado fosse substring da descrição INTEIRA (`nm.includes(n) || n.includes(nm)`, `len>=6`) na ordem de inserção do Map — sem pontuação nem melhor-match → qualquer fornecedor curto presente em qualquer pedaço "vencia" (ex.: "POSTO UMUARAMA…" casou "COIMBRA"). NOVO ALGORITMO: CNPJ continua o sinal FORTE (confiança "alta"); por nome tokeniza descrição+beneficiário e o cadastro, descarta ruído bancário/societário (`_STOP_TOKENS`: PAG/BOLETO/IBC/TED/PIX/LTDA/COMERCIO/INDUSTRIA…), pontua cada candidato pelo PESO (tamanho) dos tokens que casam — exato/prefixo/Dice de bigramas ≥0.82 —, exige token forte (≥4) e ≥50% do peso do nome; VENCE o de MAIOR peso (desempate por ratio); confiança "media" (ratio≥0.9 e folga≥4 vs 2º) ou "baixa". Helpers `_tokset`/`_bigrams`/`_dice`. FRONT (`FinanceiroConciliacao.tsx`): texto do vínculo reflete a confiança (CNPJ verde; nome "media"=âmbar "· sugestão"; "baixa"=cinza "· palpite"); diálogo "Lançar no Contas a Pagar" pré-preenche o campo Fornecedor (datalist editável) quando confiança CNPJ/"media" + nota com a sugestão e botão "usar". VALIDAÇÃO: tsc limpo nos arquivos tocados. Detalhe: `shared/changelog.ts`.

- **Rev. 3356** — **FINANCEIRO / OBRIGAÇÕES FISCAIS · O FILTRO DE PERÍODO FOI TROCADO PELO SELETOR DE ANO + MESES (CHIPS JAN…DEZ COM NAVEGAÇÃO DE ANO, BOTÃO "ANO TODO" E BOLINHA DE STATUS POR MÊS), IGUAL AO PADRÃO JÁ USADO EM CONTAS A RECEBER/PAGAR. SUBSTITUI O SELECT "TODAS AS COMPETÊNCIAS". 100% FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** Pedido (usuário): aplicar na tela "Obrigações Fiscais" o mesmo seletor de ano + meses de `FinanceiroContasAReceberTitulos.tsx`, no lugar do Select "Todas as Competências" + Select de status. DECISÃO DE DADOS: o backend `getTaxObligations` filtrava por `mesCompetencia` EXATO; como obrigações fiscais são baixo volume, a query passou a buscar TODAS as obrigações da empresa (só `companyId`) e o filtro de ano/mês/status é feito no CLIENTE (igual à tela de Títulos), permitindo pintar a bolinha de status de CADA mês sem N requisições. FRONT (`FinanceiroObrigacoesFiscais.tsx`): novos states `ano` (default ano atual) e `mesSel` (1..12, default mês atual; 0="Ano todo"); card de navegação com ChevronLeft/Right (± ano), label do ano, botão "Ano todo" e grade `grid-cols-6 sm:grid-cols-12`; `mesesStatus` (useMemo) por mês do ano: VERDE=todas pagas/canceladas, AZUL=há guia(s) a pagar, CINZA=sem dados; legenda "A pagar / Tudo pago / Sem dados"; memos `doAno`→`mesData`→`filtradas` (status num canto); cor de seleção laranja (paleta da tela). KPIs (A Pagar/Vencidas/Pagas) refletem o PERÍODO (`mesData`); lista e empty-state usam `filtradas`. Removidos imports/states órfãos (`Calendar`, `meses`, `mesFilter`). VALIDAÇÃO: tsc limpo no arquivo tocado. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3355** — **FOLHA / FERIADOS · NOVO "BAIXAR FERIADOS {ANO}": BAIXA AUTOMATICAMENTE OS NACIONAIS (FIXOS + MÓVEIS) E, NUM DIÁLOGO, DEIXA O USUÁRIO ESCOLHER AS UFs PARA OS ESTADUAIS (PRÉ-MARCANDO AS UFs DAS OBRAS ATIVAS). MUNICIPAIS FICAM P/ CADASTRO MANUAL. 1 CONST (25 UFs) + 1 MUTATION + 1 QUERY + 1 FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** Descoberta (Neon): as 55 obras ativas estão com `estado`/`cidade` NULL → auto-detectar UF seria no-op; HE só trata estadual como feriado quando `obra.estado===UF` → caminho honesto = usuário ESCOLHER as UFs. `FERIADOS_ESTADUAIS` (Record<UF,{nome,data}[]>, 25 UFs); mutation `baixarFeriados({...,ufs?})` semeia nacionais (dedup) + estaduais escolhidos; query `ufsEstaduaisDisponiveis`; `Feriados.tsx` com diálogo + chips de UF pré-marcados. Detalhe: `shared/changelog.ts`.

- **Rev. 3354** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA — IMPORTAÇÃO DE EXTRATO · (1) CORRIGIDO O ERRO "NÃO CONSEGUI INTERPRETAR O JSON DA IA" AO IMPORTAR EXTRATO DO SANTANDER EM PDF (PARSER DETERMINÍSTICO PRÓPRIO, SEM IA); (2) O SELETOR DE ARQUIVO PASSA A ACEITAR VÁRIOS EXTRATOS DE UMA VEZ, CADA UM CAINDO NO SEU MÊS. 1 PARSER + 1 GATE + 1 FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** RAIZ: PDF c/ ~377 linhas estourava `maxTokens:16384` do fallback de IA → JSON truncado. `server/services/santanderPdfParser.ts` (NOVO, state machine sobre `pdf-parse`; validado 349 lançs, Créditos=Débitos=R$ 1.495.860,19); GATE `isSantander` após BB e antes da IA; `FinanceiroConciliacao.tsx` ganhou `multiple` + fila `importFiles[]` + progresso "Arquivo i/N". Detalhe: `shared/changelog.ts`.

- **Rev. 3353** — **FINANCEIRO / MOVIMENTAÇÃO INTERNA (CNPJs/CPFs DO GRUPO) · LAYOUT MODERNO (LINHAS-CARTÃO COM AVATAR/SELO/TIPO DO DOC), MÁSCARA VIVA pt-BR NO CAMPO CPF/CNPJ E AUTO-PREENCHIMENTO DO "NOME / IDENTIFICAÇÃO" PELO CNPJ (CADASTRO: EMPRESAS DO GRUPO→FORNECEDORES→TERCEIRAS; ÚLTIMO CASO RECEITA/BrasilAPI). 1 HELPER + 1 ROTA READ-ONLY + 1 FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** `maskCpfCnpj` (`formatters.ts`, viva por nº de dígitos, cobre raiz de 8); nova query READ-ONLY `consultarCnpj` (tenant guard `_assertFinanceiroCompanyAccess` + cascata `companies`/`fornecedores`/`empresas_terceiras` + BrasilAPI host-fixo só-dígitos, sem SSRF); `FinanceiroConfiguracoes.tsx` com `useQuery` lazy + preenche o Nome só se vazio. Detalhe: `shared/changelog.ts`.

- **Rev. 3352** — **FOLHA / HORAS EXTRAS · CALENDÁRIO DE FERIADOS GANHOU OBSERVÂNCIA POR EMPRESA E ESCOPO POR CIDADE. PONTO FACULTATIVO (CARNAVAL, CORPUS CHRISTI) NASCE "NÃO SEGUIDO" (DIA NORMAL, SEM HE INDEVIDA) ATÉ O GESTOR MARCAR "SEGUE", E PODE LIMITAR POR CIDADE/UF. O HE SÓ TRATA O DIA COMO FERIADO (HE 100%) QUANDO OBSERVADO NA CIDADE DA OBRA ONDE A PESSOA BATEU PONTO. 1 COLUNA NOVA (SELF-HEAL) + BACKEND + 2 ROTAS DE HE + 1 FRONT · ZERO ALTER/DROP/DELETE.** `feriados.observado smallint DEFAULT 1` + backfill ÚNICO `WHERE tipo='ponto_facultativo'` (copy-on-write); `getFeriadosObservadosForPeriod`/`isFeriadoObservado(idx,data,cidade,estado)`; mutation `definirObservancia`; HE faz LEFT JOIN obras p/ cidade/estado; `Feriados.tsx` com selo "Segue/Não segue" + datalist de cidades das obras. Detalhe: `shared/changelog.ts`.

- **Rev. 3351** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · A "MOVIMENTAÇÃO INTERNA" (DINHEIRO QUE SÓ GIRA ENTRE CONTAS/EMPRESAS DA PRÓPRIA FC) GANHOU UMA BASE DE CNPJs/CPFs CADASTRÁVEL (NOVA ABA EM CONFIGURAÇÕES FINANCEIRAS) ALÉM DA HEURÍSTICA POR TEXTO; CLASSIFICAÇÃO SIMÉTRICA (ENTRADA E SAÍDA) E EXCEÇÃO MANUAL POR LANÇAMENTO ("EFETIVO"/"INTERNO") COM MOTIVO. 2 TABELAS NOVAS (SELF-HEAL) + BACKEND READ-ONLY/CRUD + 3 FRONTS · ZERO ALTER/DROP/DELETE.** `financial_internal_cnpjs` + `financial_internal_overrides`; `_loadInternoConfig` + predicado SQL/JS espelhados + override por id; CRUD com `_assertFinanceiroCompanyAccess`; aba em `FinanceiroConfiguracoes.tsx` + `_NaturezaOverride.tsx` + drill-ins. Detalhe: `shared/changelog.ts`.

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
