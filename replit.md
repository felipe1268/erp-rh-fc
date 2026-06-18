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

- **Rev. 3287** — **PLANEJAMENTO / EFETIVO × IA (SIMULADOR DE MÃO DE OBRA + DIAGNÓSTICO) · A SIMULAÇÃO TRAVAVA EM 99% E DEPOIS MOSTRAVA "A IA DEMOROU DEMAIS OU A CONEXÃO CAIU DURANTE O PROCESSAMENTO — COMUM NO IPAD/SAFARI", MESMO QUANDO O SERVIDOR JÁ TINHA TERMINADO E SALVO A SIMULAÇÃO. AGORA, AO CAIR A CONEXÃO, O ERP RECUPERA AUTOMATICAMENTE O RESULTADO QUE O SERVIDOR PERSISTIU EM VEZ DE MOSTRAR O ERRO. 100% FRONT (RECUPERAÇÃO) + AJUSTE FINO DE BACKOFF NO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE.** DIAGNÓSTICO (log de produção): `[Gemini Fast] 429 (tentativa 1/4)` — a chamada `simularEfetivo` (caminho rápido Gemini 2.5 Flash, `maxTokens: 16000`) é LONGA e o free-tier ainda devolve 429, então o tempo total estoura o timeout do proxy/WebKit do iPad, que DERRUBA a requisição HTTP. PORÉM o handler tRPC CONTINUA rodando, termina a IA e PERSISTE o resultado em `planejamento_analises_efetivo` (já era assim) — só o CLIENTE perdia a resposta. FIX FRONT (`client/src/pages/planejamento/AnaliseEfetivoIA.tsx`): novo hook `useRecuperarAposQueda` + predicado `isErroTransporteIos`. Quando a mutação (`simularEfetivo`/`analisarEfetivo`) falha por erro de TRANSPORTE (DOMException iOS), o hook faz POLLING de `iaCronograma.ultimaAnaliseEfetivo` (~4s + 5s/tentativa, até ~90s); ao iniciar faz `await ultimaQ.refetch()` p/ capturar uma baseline FRESCA da `criadoEm` (não o cache `staleTime` 60s, que geraria falso positivo) e, se aparecer uma com `criadoEm` DIFERENTE (= o servidor gravou uma NOVA), exibe o resultado e limpa o erro (`mut.reset()`). Enquanto recupera, banner âmbar substitui o de erro; sem novidade na janela, desiste e o erro vermelho reaparece. Aplicado ao Simulador E ao Diagnóstico. FIX BACKEND (`server/_core/llm.ts`, `invokeGeminiFast`): retry de 429 passou a HONRAR o `retryDelay` da API (`extrairRetryDelayMs`) — `min(max(sugerido, backoff), 20s)` — em vez de só backoff cego. INALTERADO: pipeline de IA, prompts, `maxTokens`, persistência, histórico, restauração, barra de progresso. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3286** — **PLANEJAMENTO / PORTAL DO CLIENTE · O "% REALIZADO" DO PORTAL DIVERGIA DO MÓDULO PLANEJAMENTO (FONTE DA VERDADE): NA OBRA REVTE-CIVIL O PORTAL MOSTRAVA REALIZADO 20,72% ENQUANTO O MÓDULO MOSTRAVA 9,00%. AGORA O PORTAL ESPELHA EXATAMENTE O SNAPSHOT MSP DA RAIZ (`realizadoMspSnapshot`), IGUAL AO PLANEJAMENTO. 100% BACKEND · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** DIAGNÓSTICO (Neon, projeto id=43, FC 60002): o módulo (`PlanejamentoDetalhe.avancoAtual`) lê o snapshot da raiz UID=0 do XML (`calendarioJson.realizadoMspSnapshot` = AD/(AD+RD) = 9,00% @ statusDate 11/06/2026); já o Portal (`server/routers/portalExterno.ts`, `cliente.planejamentoObra`, `kpis.realizado`) RECALCULAVA o realizado como média ponderada por `pesoFinanceiro` das folhas (`somaRealizado` = 20,72%), ignorando o snapshot. O `% Previsto` do Portal JÁ usava o snapshot — só o realizado ficou para trás. FIX: `pctTotalRealizado` passou a espelhar `calMSP.realizadoMspSnapshot` com o MESMO gate do `avancoAtual` (snapshot presente + `statusDateSnapshot` + `envSnapOk` + monotonicidade `cutoffStr >= statusDateSnapshot`); fallback p/ o cálculo ponderado SÓ quando o snapshot está ausente/stale (XML antigo sem AD/RD). REGRA DE OURO respeitada: o Portal só REPLICA o snapshot do MS Project, NUNCA recalcula. INALTERADO: `% Previsto`, Curva S por semana, aba REFIS / modo "com indiretas", atividades/atrasadas/próximas. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3285** — **RH & DP / FECHAMENTO DE PONTO · CONFLITOS DE OBRA NO MESMO DIA · AO CONFIRMAR UM DESLOCAMENTO REAL ENTRE OBRAS, O ERP MOSTRAVA TOAST DE SUCESSO MAS O CONFLITO NÃO SUMIA DA LISTA (REAPARECIA NO REFETCH). AGORA SAI DA LISTA. 100% BACKEND · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** `getConflitosObraDia` (`server/routers/fechamentoPonto.ts`) passou a trazer `justificativa`; no ramo multi-obra `todosConfirmados = entries.every(... inclui "Deslocamento confirmado")` → `continue` (não lista); novo upload Dixi sem marcador faz o conflito reaparecer p/ reconferência. Detalhe: `shared/changelog.ts`.

- **Rev. 3284** — **RH & DP / APONTAMENTO DE CAMPO ↔ ESPELHO DE PONTO · AO RESOLVER UM APONTAMENTO DE ATRASO/SAÍDA ANTECIPADA AJUSTANDO O HORÁRIO DA BATIDA, A CORREÇÃO FICAVA SÓ NO `field_notes` E O ESPELHO (QUE LÊ `time_records`) MOSTRAVA O VALOR ANTIGO (EX.: ACÁCIO 10/06/2026 — OCORRÊNCIA 07:37, ESPELHO 07:00). AGORA AS BATIDAS CONFIRMADAS NA RESOLUÇÃO SINCRONIZAM SEMPRE NO `time_records`, MESMO COM acaoTomada='nenhuma'. 100% BACKEND + BACKFILL ESTREITO (2 LINHAS) · ZERO SCHEMA/ALTER/DROP/DELETE.** `resolve` (`server/routers/fieldNotes.ts`) separou `deveMarcarDisciplina` (respeita acaoTomada) de `deveSincronizarHorario` (tipo time-bearing + horário resolvido, INDEPENDENTE da ação); ramo atraso/saída grava fE1/fS1/fE2/fS2 + recalcula horas; backfill transacional só de `atraso`/`saida_antecipada` + `fonte='apontamento'` (NÃO tocou `manual`/`dixi`). Detalhe: `shared/changelog.ts`.

- **Rev. 3283** — **FINANCEIRO / CONTROLE DE CARTÃO DE CRÉDITO · A LISTA "CARTÕES CADASTRADOS" GANHOU UM VISUAL DE CARTÃO FÍSICO: CADA CARTÃO TEM UMA FAIXA SUPERIOR COLORIDA (GRADIENTE POR BANDEIRA) COM O LOGO DA BANDEIRA (VISA, MASTERCARD, ELO, AMEX, HIPERCARD, DINERS, DISCOVER + FALLBACK GENÉRICO), CHIP DOURADO DECORATIVO, OS DÍGITOS MASCARADOS "•••• •••• •••• 9552" E O TITULAR; O CORPO BRANCO ABAIXO MANTÉM STATUS, LIMITE, FECHA/VENCE DIA, O ALERTA DE CARTÃO PESSOAL (PF) E OS BOTÕES EDITAR/EXCLUIR. 100% FRONT · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** PEDIDO (piloto FC): "melhore o layout e coloca o símbolo dos cartões para facilitar e melhorar o visual" (cards planos sem identidade de bandeira). NOVO COMPONENTE (`client/src/components/BandeiraCartao.tsx`): `resolverBandeira()` normaliza o texto livre do campo "Bandeira" (minúsculo, sem acento) p/ chave canônica; `bandeiraGradiente()` devolve o gradiente Tailwind da faixa por bandeira; `<BandeiraLogo>` renderiza o logo (Visa/Hipercard = wordmark, Mastercard = 2 círculos SVG, Elo = "elo" + 3 dots, Amex/Diners = pill, Discover = wordmark + dot, genérico = ícone CreditCard) pensado p/ fundo escuro; `<ChipCartao>` é um chip dourado SVG. Tudo inline/local — SEM imagem externa/asset. TELA (`client/src/pages/financeiro/FinanceiroCartaoCredito.tsx`, aba "Cartões"): cada item virou um card com faixa superior `bandeiraGradiente` text-white (banco + logo, chip + dígitos mascarados → `final4`, titular + badge PJ/PF) e corpo branco (status + Limite, grid Fecha/Vence dia, alerta PF, ações sobre borda); grid `gap-4`, cards `rounded-xl` + `hover:shadow-md`. INALTERADO: dados/queries/mutations/formulário/importação por IA. ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3282** — **FINANCEIRO / DASHBOARD DE CONCILIAÇÃO BANCÁRIA · O CARD ÚNICO "MOVIMENTADO NO EXTRATO" (QUE SOMAVA ENTRADAS + SAÍDAS NUM VALOR SÓ E PARECIA INFLADO/DUPLICADO) FOI SUBSTITUÍDO POR 3 CARDS CLAROS NO GRUPO "MOVIMENTAÇÃO DO EXTRATO": ENTRADAS (CRÉDITOS, VERDE), SAÍDAS (DÉBITOS, VERMELHO) E SALDO LÍQUIDO (ENTROU − SAIU). O "GIRO BRUTO" (A SOMA ANTIGA) VIROU SUBTÍTULO DO SALDO LÍQUIDO; OS KPIs DE CONCILIAÇÃO (CONCILIADO / PENDENTE / % CONCILIADO) FORAM AGRUPADOS NUM SEGUNDO BLOCO ROTULADO "CONCILIAÇÃO". 100% READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** PEDIDO (piloto FC): o "Movimentado no extrato" (R$ 16.006.184,16/2026) parecia errado/duplicado; pediu p/ separar entrada e saída "p/ não ficar confuso" e questionou a utilidade prática do total de movimentação. DIAGNÓSTICO (Neon, FC ENGENHARIA 60002, 2026): SEM duplicação (1999 linhas, 0 duplicatas) — o valor é o GIRO BRUTO (`SUM(ABS(valor))`) = Entradas R$ 7.919.219,44 + Saídas R$ 8.086.964,72 (saldo líquido −R$ 167.745,28); a fórmula está correta, o problema era SEMÂNTICO (um KPI só somando o que entrou COM o que saiu dá falsa impressão de valor inflado). BACK (`server/routers/financial.ts`, `getBankAccountsConciliacaoStatus`): a query por conta ganhou `valorEntradas` (`SUM(valor>=0)`) e `valorSaidas` (`SUM(ABS(valor) WHERE valor<0)`) — 100% aditivo, READ-ONLY. FRONT (`client/src/pages/financeiro/dashboards/DashConciliacao.tsx`): `kpis` agrega entradas/saídas/saldoLiquido; o grid de 4 KPIs virou 2 grupos rotulados; o detalhe por conta ganhou colunas Entradas/Saídas e "Movimentado"→"Giro bruto". NA PRÁTICA (resposta ao usuário): o giro bruto é só métrica de VOLUME/sanidade de importação — Entradas/Saídas/Saldo líquido é o acionável, por isso passaram a liderar e o giro virou subtítulo. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3281** — **RH & DP / FOLHA DE ADIANTAMENTO (VALE — CÁLCULO INTERNO) · FUNCIONÁRIOS EM AVISO PRÉVIO TRABALHADO (STATUS "AVISO") E EM FÉRIAS (STATUS "FERIAS") VOLTARAM A APARECER NO VALE — ANTES A SELEÇÃO PEGAVA SÓ status='Ativo' ESTRITO, ENTÃO QUEM VIRAVA "AVISO"/"FERIAS" NO FIM DO MÊS SUMIA DA FOLHA MESMO TENDO TRABALHADO A 1ª QUINZENA. 100% BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE.** `gerarVale` (`payrollEngine.ts`) passou `empListAtivos` p/ `status IN ('Ativo','Aviso','Ferias')`; `simularPagamento` ganhou ramo `status='Aviso'` espelhando Desligado-em-aviso (`EXISTS` aviso não-cancelado/não-indenizado). Gates de proporcionalidade/quinzena já tratam quem não trabalhou. Detalhe: `shared/changelog.ts`.

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
