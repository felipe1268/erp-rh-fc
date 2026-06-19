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

- **Rev. 3305** — **RH & DP / FOLHA DE VALE + FOLHA DE PAGAMENTO · O BOTÃO "ARREDONDAMENTO" (Rev. 3302) NÃO MOSTRAVA EFEITO NA TELA: AO ESCOLHER CIMA/BAIXO/MAIS-PRÓXIMO, O TOAST DIZIA "N VALE(S) ARREDONDADO(S)" MAS OS VALORES EXIBIDOS CONTINUAVAM IGUAIS (EX.: ACÁCIO SEGUIA 1.167,00 EM VEZ DE 1.166,00 NO "PARA BAIXO"). NÃO ERA BUG DE BACKEND — BANCO E SNAPSHOT JÁ GRAVAVAM CERTO (CONFIRMADO NO NEON); A TELA É QUE NÃO RE-LIA O SNAPSHOT FRESCO. 100% FRONT · ZERO MUDANÇA DE BACKEND/DADOS/ENDPOINT/SCHEMA (R-001/R-007/R-010 OK).** SINTOMA (piloto FC): "o arredondamento não funciona — não muda nada nem pra cima nem pra baixo". DIAGNÓSTICO (Neon via pg, company 60002 / 2026-06): a mutation `arredondarLote` RODOU e PERSISTIU certo — `payroll_advances.valorLiquidoVale`=1166.00 (exato 1166.88 preservado) e `sincronizarValeJson` reescreveu `valeResultJson.valorLiquido`=1166 (idem path FOLHA em `pagamentoResultJson`); um reload da página mostraria o valor correto. CAUSA: o effect de hidratação em `FolhaPagamento.tsx` tem guard `if (lastLoadedPeriodId.current === pid) return;` (preserva edições locais no refetch do MESMO período); as demais mutações de vale fazem `setValeResult` otimista, mas o `arredondarMut` só fazia `refetch()` → o guard pulava a re-leitura, deixando `valeResult`/`pagamentoResult` velhos. CORREÇÃO (`client/src/pages/FolhaPagamento.tsx`, só wiring do `arredondarMut`): `useRef lastLoadedPeriodId` movido p/ ANTES da mutation; no `onSuccess`, antes do `refetch()`, faz `lastLoadedPeriodId.current = null` p/ FORÇAR a re-hidratação do snapshot fresco (cobre vale E folha). Nenhuma outra mutation mexida. Validado: esbuild parse limpo + `tsc --noEmit` sem erro no arquivo; app sobe no Neon DEV. Detalhe: `shared/changelog.ts`.

- **Rev. 3304** — **FINANCEIRO / CONTROLE DE CARTÃO DE CRÉDITO (CADASTRO DE CARTÃO) · O BOTÃO "SALVAR" DO MODAL "NOVO CARTÃO / EDITAR CARTÃO" FICAVA INACESSÍVEL EM TELAS MAIS BAIXAS (iPad): O CONTEÚDO DO FORMULÁRIO (IDENTIFICAÇÃO + DATAS & LIMITE + OBSERVAÇÃO + AVISO PF) FICAVA MAIS ALTO QUE A VIEWPORT E, COMO O DIALOG TINHA `overflow-hidden` SEM TETO DE ALTURA NEM SCROLL, O RODAPÉ COM "CANCELAR/SALVAR" ERA CORTADO ABAIXO DA DOBRA — O USUÁRIO PREENCHIA E NÃO ENCONTRAVA COMO SALVAR. 100% FRONT/CSS · ZERO MUDANÇA DE DADOS/ENDPOINT/SCHEMA (R-001/R-007/R-010 OK).** SINTOMA (piloto FC): "na tela de cadastro de cartão de crédito não tem botão de salvar, então quando coloco as informações elas não salvam" (o print mostrava o form até "Observação", com o rodapé fora da tela). CAUSA: o `<DialogContent>` do modal de cartão usava `max-w-xl p-0 overflow-hidden gap-0` SEM `max-height` nem área de scroll; em viewports baixas o conteúdo extrapolava e o `DialogFooter` (que SEMPRE existiu, com o botão Salvar chamando `salvarCartao` → `criarCartao`/`atualizarCartao`) ficava clipado — não era ausência de botão, era recorte. CORREÇÃO (`client/src/pages/financeiro/FinanceiroCartaoCredito.tsx`, só layout do modal cartão): `DialogContent` ganhou `flex flex-col max-h-[90vh]`; `DialogHeader` e `DialogFooter` ganharam `shrink-0` (fixos topo/rodapé); a `<div>` do corpo virou `flex-1 min-h-0 overflow-y-auto` (rola internamente). Resultado: rodapé com Cancelar/Salvar SEMPRE visível e o miolo rola quando não cabe. Validado: esbuild parse limpo (70.0kb); app sobe no Neon DEV. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3303** — **FINANCEIRO / CONTROLE DE CARTÃO DE CRÉDITO (ABA FATURAS) · NOVO BOTÃO "VINCULAR" EM CADA FATURA PARA ESCOLHER MANUALMENTE A QUAL CARTÃO CADASTRADO A FATURA PERTENCE — RESOLVE FATURAS "NÃO IDENTIFICADAS" NA IMPORTAÇÃO POR IA; VÍNCULO PERMANENTE QUE PROPAGA O CARTÃO P/ OS ITENS. 100% ADITIVO · ZERO SCHEMA/ALTER/DROP/DELETE.** BACKEND (`cartao.ts`, `vincularFaturaCartao`): assertCompanyAccess + tenant guard; transaction UPDATE `financial_cartao_faturas` + cascata `financial_cartao_itens`; `cartaoId=null` desvincula. FRONT (`FinanceiroCartaoCredito.tsx`): botão "Vincular" + dialog Select de cartões. Detalhe: `shared/changelog.ts`.

- **Rev. 3302** — **RH & DP / FOLHA DE VALE + FOLHA DE PAGAMENTO · NOVO BOTÃO "ARREDONDAMENTO" (TOPO-DIREITO, SÓ MASTER) QUE FORÇA O LÍQUIDO P/ O REAL CHEIO (SEM CENTAVOS) EM LOTE OU INDIVIDUAL, ESCOLHENDO A DIREÇÃO (↑ ceil / ↓ floor / ≈ round). O VALOR FORÇADO VIRA O *PAGO FINAL* — SEM CARRY-FORWARD (RESIDUAL 0), COMO O OVERRIDE MANUAL DO MASTER. USADO NA CONFERÊNCIA COM A CONTABILIDADE. 100% ADITIVO · ZERO SCHEMA/ALTER/DROP/DELETE (R-001/R-007/R-010 OK).** BACKEND (`payrollEngine.ts`, `arredondarLote`, admin_master): VALE→`payroll_advances`/ledger/`financial_events`; FOLHA→`payroll_payments`/ledger/`pagamentoResultJson`. FRONT (`FolhaPagamento.tsx`): `ArredondamentoDialog` (Lote/Individual), botão Calculator nos 2 headers só p/ `isMaster`. Detalhe: `shared/changelog.ts`.

- **Rev. 3301** — **RH & DP / FOLHA DE PAGAMENTO · CONFERÊNCIA COM CONTABILIDADE · O BOTÃO "COMPARATIVO FOLHA × ERP (VERBA POR VERBA)" QUEBRAVA A TELA INTEIRA COM `TypeError: Cannot read properties of undefined (reading 'localeCompare')` ASSIM QUE ABRIA. CAUSA: NO `ComparativoFolhaErpView`, A LINHA POR FUNCIONÁRIO COPIAVA `nome: it.nome` DIRETO DO ITEM DO PDF ANALÍTICO (`folha.listarItens`); ITEM SEM `nome` (LINHA SEM FUNCIONÁRIO VINCULADO / TOTALIZADOR) DEIXAVA `nome` `undefined` E O SORT PADRÃO POR NOME (`a.nome.localeCompare(...)`) ESTOURAVA. 100% FRONT · DEFENSIVO · ZERO SCHEMA/ALTER/DROP/DELETE (R-001/R-007/R-010 OK).** SINTOMA: "o botão de comparativo de folha não está funcionando... dá erro na tela". CORREÇÃO (`client/src/pages/FolhaPagamento.tsx`, `ComparativoFolhaErpView`): `nome: it.nome` → `nome: (it.nome || "")` (cobre também o filtro `l.nome.toLowerCase()`); sort `(a.nome || "").localeCompare(b.nome || "", "pt-BR")`. Sem mexer em backend/dados/layout; só blinda contra `nome` ausente. Validado: esbuild parse limpo; app sobe no Neon DEV. Detalhe: `shared/changelog.ts`.

- **Rev. 3300** — **FINANCEIRO / DASHBOARD · CONCILIAÇÃO BANCÁRIA · APOSENTADO O "GIRO BRUTO" (ENTRADAS+SAÍDAS SOMADAS, "R$ 16 MI") SEM SENTIDO CONTÁBIL + RELATÓRIO "CONCILIAÇÃO POR CONTA BANCÁRIA" PAROU DE CORTAR COLUNAS NO iPad (9→8 COLUNAS); RÉGUA MÊS/ANO PASSOU A MOSTRAR SALDO LÍQUIDO (ENTROU−SAIU). 100% ADITIVO NO BACKEND (SELECT READ-ONLY) · ZERO SCHEMA/ALTER/DROP/DELETE.** BACKEND (`financial.ts`): `getConciliacaoResumoMensal` devolve `valorEntradas`/`valorSaidas` por mês. FRONT (`DashConciliacao.tsx`): KPI sem "giro bruto", régua usa entradas−saídas, modal sem coluna/total "Giro bruto". Detalhe: `shared/changelog.ts`.

- **Rev. 3299** — **PLANEJAMENTO / EFETIVO × IA (VISÃO GERAL — TODAS AS OBRAS) · NOVA "AGENDA POR MÊS" + DUAS MELHORIAS NO "PLANO DE AÇÃO POR EQUIPE": (1) NENHUMA SUGESTÃO É RETROATIVA — TODA DATA IDEAL/ESTIMADA É CLAMPADA P/ HOJE OU FUTURO (VENCIDA → HOJE, COM SELO "ATRASADO"); (2) NOVA AÇÃO "ANTECIPAR FÉRIAS" COMO ALTERNATIVA AO AVISO PRÉVIO — QUANDO A FUNÇÃO QUE SOBRA TEM FUNCIONÁRIO(S) COM FÉRIAS FUTURAS AGENDÁVEIS, A IA SUGERE ANTECIPAR AS FÉRIAS P/ GANHAR ~30 DIAS E BUSCAR REALOCAÇÃO ANTES DE DEMITIR (ORDEM REALOCAR > ANTECIPAR FÉRIAS > AVISO PRÉVIO). MAIS A "AGENDA POR MÊS" — TABELA RESUMO AGRUPADA POR MÊS/ANO DE QUANDO COMEÇAR CADA AÇÃO. TUDO NA TELA E NO PDF PADRÃO FC. 100% ADITIVO · CONTEXTO+PROMPT+SCHEMA+SANITIZAÇÃO+UI · ZERO SCHEMA/ALTER/DROP/DELETE · ESCAPAGEM XSS (esc/escAttr) PRESERVADA (R-001/R-007/R-010 OK).** PEDIDOS (piloto FC): resumo por mês/ano de quando começar a realocar/demitir (gap 30 dias); nenhuma ação retroativa (só de hoje p/ frente); antes de demitir, se há férias a vencer, sugerir antecipá-las p/ ganhar tempo e tentar realocar. BACKEND (`server/routers/iaCronograma.ts`, aditivo/determinístico): `CargoAgg`/`ObraEfetivo.porCargo` ganharam `feriasAntecipaveis` (seção "4d" conta ativos com período de férias FUTURO não iniciado, bucket≠em_gozo, início>hoje; propagado no contexto/`cargosTxt`); helper `naoRetroativoBR(brData)→{data,atrasado}` (clampa data<hoje p/ hoje) + `antecipFeriasSet` (whitelist `obra|cargo`); `systemPrompt` ganhou ação `antecipar_ferias` + regra dura não-retroativa; sanitização aplica `naoRetroativoBR` em `transferencias.dataDisponivel`/`previsaoDisponibilidade.dataEstimada`/`planoEquipe.dataIdeal` (+flag `atrasado`) e só aceita `antecipar_ferias` se `antecipFeriasSet` confirmar (senão rebaixa p/ `aviso_previo`). FRONT (`EfetivoGlobalIA.tsx`): helpers `acaoMeta`/`ehAtrasado` + `agruparPorMes`/`AgendaRow`/`useMemo agenda`; cards âmbar "ANTECIPAR FÉRIAS" (Plane) entre realocar (verde) e aviso (vermelho), badge de data rosa "· atrasado"; agenda por mês com contagem por ação; PDF `tagAcao`+`.tag-ferias`+`tagAtraso`, rodapés explicativos, texto IA escapado pelos `esc`/`escAttr` LOCAIS. Validado: esbuild parse limpo nos 2 arquivos; app sobe no Neon DEV. Detalhe: `shared/changelog.ts`.

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
