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

- **Rev. 3317** — **RH & DP / FOLHA DE VALE (CÁLCULO INTERNO — VALE/ADIANTAMENTO) · O TOGGLE "VISÃO GERAL / POR BANCO" QUE JÁ EXISTIA SÓ NA FOLHA DE PAGAMENTO FOI REPLICADO NA FOLHA DO VALE. ANTES, PRA SABER QUANTO SAIRIA DE CADA CONTA-EMPRESA PAGADORA NO VALE, O USUÁRIO TINHA QUE CONFERIR FUNCIONÁRIO A FUNCIONÁRIO; AGORA O VALE TEM A MESMA VISÃO AGRUPADA POR CONTA BANCÁRIA DA EMPRESA (CARDS-RESUMO + TABELAS POR CONTA COM CPF/AGÊNCIA/CONTA/PIX/BRUTO/IR/LÍQUIDO). 100% RH & DP (1 BACKEND READ-ONLY + 1 FRONT) · ADITIVO · ZERO SCHEMA/ALTER/DROP/DELETE.** RAIZ: o agrupamento "Por Banco" da Folha de Pagamento usa campos `contaEmpresa*` injetados em cada funcionário SÓ dentro de `simularPagamento`; a Folha do Vale (`gerarVale`) persiste um SNAPSHOT (`payroll_periods.valeResultJson`) que NÃO carrega esses campos. SOLUÇÃO (JOIN client-side, funciona até em snapshots antigos): BACKEND (`server/routers/payrollEngine.ts`) nova QUERY read-only `contasBancariasFolha({companyId, companyIds?})` → mapa `employeeId → {cpf, tipoChavePix, chavePix, contaEmpresaId, contaEmpresaBanco/CodigoBanco/Agencia/Conta/Tipo/Apelido}` (JOIN `employees.contaBancariaEmpresaId` ⋈ `company_bank_accounts`, `deletedAt IS NULL`). FRONT (`FolhaPagamento.tsx`, view `calculo_vale`): novo state `valeSubView` + query `contasBancariasFolha`; toggle de 2 botões idêntico ao da Folha de Pagamento; em "Por Banco" os funcionários do vale (excluindo rejeitados/excluídos) são agrupados pela conta-empresa via o mapa — cards-resumo (líquido por conta) + tabela por conta + subtotais; sem conta-empresa → "Sem conta definida". Líquido=`valorLiquido ?? valorTotalVale`, Bruto=`valorTotalVale`, IR=`irRetido`. SEGURANÇA: query com tenant guard explícito (interseção `resolveCompanyIds` × `getCompaniesForUser`, vazio→FORBIDDEN); SEM remessa CNAB no vale (continua exclusiva da Folha de Pagamento). Detalhe: `shared/changelog.ts`.

- **Rev. 3316** — **FINANCEIRO / DASHBOARD DE CONCILIAÇÃO BANCÁRIA · O CARD "PENDENTE" SOMAVA ENTRADAS (CRÉDITOS) + SAÍDAS (DÉBITOS) EM MÓDULO COMO SE FOSSEM O MESMO SINAL (EX.: R$ 8,2M + R$ 9,6M = R$ 17,9M "A CONCILIAR"), UM VALOR SEM SIGNIFICADO CONTÁBIL QUE CONFUNDIA O USUÁRIO. AGORA O "PENDENTE" VIROU DOIS CARDS — "CRÉDITOS A CONCILIAR" E "DÉBITOS A CONCILIAR" — E AS DUAS SEÇÕES (MOVIMENTAÇÃO E CONCILIAÇÃO) GANHARAM LEGENDA EXPLICANDO O CÁLCULO/CONSIDERAÇÃO DE CADA CARD. 100% FINANCEIRO (1 BACKEND READ-ONLY + 1 FRONT) · ADITIVO · ZERO SCHEMA/ALTER/DROP/DELETE.** BACKEND (`server/routers/financial.ts`, `getBankAccountsConciliacaoStatus`): query agregada ganhou `valorConciliadoEntradas`/`valorConciliadoSaidas` (Σ conciliado por direção) + `pendentesEntradas`/`pendentesSaidas` (contagem de linhas não conciliadas por direção); guard de tenant e `excluido_em IS NULL` mantidos. FRONT (`DashConciliacao.tsx`): KPI calcula `valorPendenteEntradas/Saidas = movimentado − conciliado` por direção; seção "Conciliação" virou grid de 4 (Conciliado, Créditos a conciliar, Débitos a conciliar, % conciliado); `DetailDialog` por conta ganhou colunas "Créd./Déb. a conciliar" (antigo "Pendente"→"Total a conciliar"); cada seção ganhou `<p>` "Como é calculado: …". Gráficos pizza/barras intactos. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3315** — **RH & DP / DISSÍDIO COLETIVO · A APLICAÇÃO EM MASSA DO REAJUSTE (EX.: 5,15% DA DATA-BASE DE MAIO) PASSOU A (1) ALCANÇAR TODOS OS FUNCIONÁRIOS CLT ATIVOS — NÃO SÓ OS COM STATUS LITERAL "ATIVO" — E (2) SEPARAR OS ADMITIDOS NO MÊS DA DATA-BASE NUMA LISTA DE DECISÃO MANUAL (QUEM ENTROU NAQUELE MÊS COSTUMA JÁ TER O SALÁRIO NEGOCIADO E NÃO DEVE RECEBER O REAJUSTE AUTOMÁTICO; EX.: LILIAN=NÃO APLICA, MATEUS SIQUEIRA 9,95/H=APLICA). ANTES SÓ PEGAVA `status='Ativo'` (DEIXAVA FÉRIAS/AVISO/AFASTADO DE FORA) E APLICAVA O % LINEARMENTE A QUALQUER UM. 100% RH & DP (1 BACKEND + 1 FRONT) · ADITIVO/BUGFIX · ZERO SCHEMA/ALTER/DROP/DELETE.** REGRA: "ativo" virou NÃO-DESLIGADO via `notInArray(employees.status, EMPLOYEE_STATUS_DESLIGADOS)` (PJ segue fora). Helper `admitidoNoMesBase(dataAdmissao,mesDataBase,anoReferencia)` (`server/routers/dissidio.ts`): em `simular` cada linha ganha `requerDecisao`+`dataAdmissao` e os totais automáticos somam só `!requerDecisao` (`resumo.totalAutomaticos`/`totalRequerDecisao`); em `aplicar` novo input `funcionariosMesBaseAprovados:number[]` — quem é do mês-base e não aprovado é gravado `status:'excluido'` com `motivoExclusao` próprio (não toca salário; conta `naoAplicadosMesBase`). FRONT (`Dissidio.tsx`): aviso laranja na simulação; `AplicarDissidioView` com 2 tabelas (Admitidos no mês = checkbox "Aplicar" default OFF + col Admissão; Demais = "Incluir" default ON); submit manda os 2 arrays; `mesNome` extraído p/ módulo. SEGURANÇA: `simular` ganhou `ctx`+tenant guard `getCompaniesForUser`→FORBIDDEN; `aplicar` segue admin_master-only. Detalhe: `shared/changelog.ts`.

- **Rev. 3314** — **ALMOXARIFADO / EQUIPAMENTOS PRÓPRIOS · CADASTRO "NOVO EQUIPAMENTO" GANHOU CAMPO "QUANTIDADE" PRA REGISTRAR VÁRIOS ITENS IDÊNTICOS DE UMA VEZ. ANTES, CADASTRAR 10 PRANCHAS IGUAIS EXIGIA PREENCHER O MODAL 10 VEZES. AGORA O USUÁRIO DIGITA A QUANTIDADE (1..100) E O SERVIDOR CRIA N REGISTROS, CADA UM COM SEU PRÓPRIO PATRIMÔNIO EQP-NNNN SEQUENCIAL. 100% ADITIVO (1 BACKEND + 1 FRONT) · ZERO SCHEMA/ALTER/DROP/DELETE.** BACKEND (`server/routers/equipamentos.ts`, `proprioCriar`): novo input opcional `quantidade` (z.int 1..100); o INSERT virou loop externo de N iterações mantendo o retry de 8 tentativas em UNIQUE violation por item; `proximoCodigoPatrimonio` relê o MAX a cada item → números encadeados (EQP-0114, EQP-0115…); retorno `{id,codigoPatrimonio,quantidadeCriada,codigos[]}` (backward-compat). FRONT (`Proprios.tsx`): `EMPTY_FORM.quantidade="1"`; campo "Quantidade" (stepper −/+ , clamp 1..100) abaixo do Patrimônio, SÓ no NOVO; dica "Serão criados N…"; `salvar()` manda `quantidade`; `onSuccess` mostra "N equipamentos cadastrados (EQP-AAAA a EQP-BBBB)!". SEGURANÇA: `proprioCriar` ganhou tenant guard explícito (`getCompaniesForUser` → FORBIDDEN) — o INSERT confiava no `companyId` do cliente e o lote eleva o raio de impacto. Edição e import do Almoxarifado intactos. Detalhe: `shared/changelog.ts`.

- **Rev. 3313** — **RH & DP / FOLHA DE VALE · O "BOTÃO" DE EXCLUIR O PAGAMENTO DO VALE (POR FUNCIONÁRIO) NÃO FUNCIONAVA: NA TABELA SEM ALERTA, O "⊘ EXCLUIR"/"✓ OK" ERA BADGE DECORATIVO NÃO-CLICÁVEL E A EXCLUSÃO (`decidirVale` PAGAR:FALSE) ATUALIZAVA SÓ `payroll_advances`, NÃO O SNAPSHOT `valeResultJson` → REVERTIA NO RELOAD. AGORA O "EXCLUIR" DA LINHA É BOTÃO E A DECISÃO PERSISTE. 100% BUGFIX (1 BACKEND + 1 FRONT) · ZERO SCHEMA/ALTER/DROP/DELETE.** `FolhaPagamento.tsx`: branch não-rejeitado virou `<button>` "Excluir"→`decidirValeMut`; `decidirVale` (`payrollEngine.ts`) chama `sincronizarValeJson` após o loop. Detalhe: `shared/changelog.ts`.

- **Rev. 3312** — **RH & DP / FOLHA DE VALE · UM FUNCIONÁRIO DESLIGADO (ELIZEU, SAÍDA EFETIVA 15/05/2026) CONTINUAVA APARECENDO E "RECEBENDO" VALE EM JUNHO/2026 PORQUE O SNAPSHOT `valeResultJson` FICOU CONGELADO E A SANITIZAÇÃO DE LEITURA NÃO REMOVIA DESLIGADOS. AGORA A SANITIZAÇÃO REMOVE DA LEITURA (E BLOQUEIA APROVAÇÃO/REVERSÃO) DESLIGADOS COM SAÍDA ANTERIOR AO 1º DIA DO MÊS. 100% BACKEND · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** `getIdsInelegiveisVale(db, ids, mesReferencia?)` (`payrollEngine.ts`) ganhou o mês e marca inelegível quem está em `EMPLOYEE_STATUS_DESLIGADOS` com `(dataDesligamentoEfetiva ?? dataDemissao) < ${mes}-01`. Detalhe: `shared/changelog.ts`.

- **Rev. 3311** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA (IMPORTAR EXTRATO) · BANCO DO BRASIL GANHOU PARSER DETERMINÍSTICO PRÓPRIO (LEITURA DIRETA DO TEXTO DO PDF VIA `pdf-parse`, SEM IA), E O CASO "CONTA NÃO MOVIMENTADA" RETORNA MENSAGEM CLARA EM VEZ DE FALHA GENÉRICA. 100% BACKEND (+1 LINHA NO FRONT) · ADITIVO · ZERO SCHEMA/ALTER/DROP/DELETE.** Novo `server/services/bbPdfParser.ts` (`parseBancoBrasilExtratoPdf`, detecta BB + flag `semMovimento`); `parseExtratoLines` (`financial.ts`) virou 3 etapas (Caixa → BB determinístico → fallback IA). Detalhe: `shared/changelog.ts`.

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
