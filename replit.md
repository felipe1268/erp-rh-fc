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


- **Rev. 2725** — **RH · RESCISÃO / HOME (Painel RH — card "Avisos Prévios em Andamento" × ficha "Cálculos da Rescisão") · CORRIGE A DIVERGÊNCIA DE VALORES: O CARD DA TELA INICIAL E O "TOTAL ESTIMADO DA RESCISÃO" MOSTRAVAM UM VALOR PERSISTIDO/CONGELADO, DIFERENTE DO "SUBTOTAL PROVENTOS" RECALCULADO AO VIVO (caso Mariana: card R$ 11.166,82 × subtotal R$ 19.391,67).** Causa-raiz: 2 fontes de verdade. `list` e `getById` já recalculam a previsão ao vivo (`calcularRescisaoCompleta`), mas (a) o `getById` retornava `...row` com a coluna persistida `valorEstimadoTotal` intacta e (b) o `homeData` lia essa mesma coluna — que só é regravada em create/update(recalcular)/recalcularTodos, ficando defasada quando salário/férias mudam DEPOIS da criação do aviso. Solução (SÓ SERVER; ZERO SCHEMA — R-001/R-007/R-010): `avisoPrevioFerias.ts` exporta `diasFeriasNoMesDaSaida` e o `getById` passa a retornar `valorEstimadoTotal: previsao.total` (pós-ajustes Súmula 276/FGTS real); `homeData.ts` recalcula o total de cada aviso ativo com a MESMA lógica do `list` (batch único de férias vencidas + `diasTrabalhadosMes` + `periodosVencidosOverride`) num `recomputedTotalMap` usado em `valorEstimado`/`saldoPendente`/"Desembolso pendente" (fallback p/ a coluna se falhar). Sem write-back (só leitura). Validação: esbuild server EXIT 0; `vitest server/rescisao.test.ts` 41/41 verde. Detalhe: `shared/changelog.ts`.
- **Rev. 2724** — **RH · RESCISÃO (Painel RH → funcionário em aviso → "Cálculos da Rescisão") · CORRIGE O AVISO PRÉVIO TRABALHADO: (1) O RÓTULO DO "AVISO PRÉVIO INDENIZADO" PASSA A MOSTRAR SÓ OS DIAS PROPORCIONAIS EXCEDENTES INDENIZADOS (ex.: 6) EM VEZ DO TOTAL DO AVISO (ex.: 36); (2) O INCREMENTO DA PROJEÇÃO (AVOS DE FÉRIAS/13º → GRUPO B) DEIXA DE INCLUIR OS DIAS TRABALHADOS, QUE SÃO COMPETÊNCIA REAL (GRUPO A).** Bug (print da rescisão da Myriélle): aviso TRABALHADO (`empregador_trabalhado`) exibia "Aviso Prévio Indenizado (36 dias) R$ 332,31" — o VALOR estava certo (R$ 332,31 ÷ 55,38/dia = 6 dias = só os dias proporcionais excedentes, sempre indenizados mesmo no trabalhado — Lei 12.506/2011), mas o RÓTULO "36 dias" enganava; e o usuário questionou se "não mudaríamos valores". Diagnóstico: no aviso trabalhado os 30 dias-base são cumpridos (competência real) e só os excedentes indenizados projetam o término (Súmula 371 / OJ 82 TST); os TOTAIS de férias/13º não mudam entre trabalhado/indenizado, mas a CLASSIFICAÇÃO A/B sim — o baseline "já era competência" deve ser o FIM do aviso, não o início. Solução (SERVER + CLIENT; ZERO SCHEMA — R-001/R-007/R-010): `server/utils/rescisaoCalc.ts` — `const baselineProvisao = tipo.includes('trabalhado') ? dataFimAviso : dataDesligamento` aplicado a `incAvosFerias` e `incAvos13` (indenizado segue no início do aviso; trabalhado usa o fim → só a projeção dos dias indenizados é Grupo B; caso Myriélle: incremento cai p/ 0, as 2/12 férias + 6/12 13º voltam 100% ao Grupo A, Grupo B fica só aviso 6 dias + multa 40%). `client/src/pages/PainelRH.tsx` — helper `diasAvisoIndenizadosLabel(p)` (lê `aviso.tipo`): trabalhado → "Aviso Prévio Indenizado — dias proporcionais (N dias)" via `diasExtrasAviso`; indenizado → "Aviso Prévio Indenizado (N dias)" via `diasAvisoTotal`; aplicado na lista de Proventos + Grupo B; comparativo `buildProventosFromPrevisao` ganhou param `isTrabalhado`. Nenhum total monetário muda (re-rotulagem + re-partição A/B). Validação: esbuild server + TSX EXIT 0; `vitest server/rescisao.test.ts` 41/41 verde. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2723** — RH · RESCISÃO (Painel RH → "Cálculos da Rescisão" → aba "Detalhes") · NOVO BLOCO "COMPOSIÇÃO DO CUSTO — PROVISIONADO x ADICIONAL DA DEMISSÃO": separa as verbas em 🟦 Grupo A (competência / já era custo da empresa) x 🟥 Grupo B (custo adicional da dispensa), com o "incremento da projeção do aviso" (avos extras de férias/13º) destacado no Grupo B; gating p/ tipo `empregador*` (pedido de demissão → tudo no Grupo A). ZERO SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 2722** — RH · RESCISÃO (Painel RH → "Cálculos da Rescisão") · CORRIGIDO O CÁLCULO DE FÉRIAS PROPORCIONAIS: O MÊS AQUISITIVO CORRENTE INCOMPLETO COM ≥15 DIAS NÃO ESTAVA SENDO CONTADO (REGRA DOS 15 DIAS — CLT Art. 146 §único). `calcularMesesFeriasProporcionais` usava só MESES COMPLETOS; reordenada em 2 ramos (completo→12/12; incompleto→`meses%12` + 1 avo se fração ≥15 dias). Caso Myriélle 1/12→2/12; ANTONIO 10→11; IVAN segue 12/12. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2721** — FROTA · DASHBOARD DE MANUTENÇÃO (`/frotas` → "Manutenções" → "Dashboard") · AJUSTE DO BREAKPOINT DA TABELA "DETALHE — PEÇAS QUE SE REPETEM" (Rev. 2720): NO IPAD (1024px landscape) AINDA APARECIA A TABELA ESPREMIDA EM VEZ DOS CARDS. Solução (SÓ CLIENT/UI; ZERO SERVER/SCHEMA): `ManutencoesDashboard.tsx` — corte subido de `lg` para `xl` (1280px): tabela `hidden xl:block` e cards `xl:hidden`; qualquer tela < 1280px recebe os cards que abrem ao tocar; só desktop ≥1280px vê a tabela. Validação: parse esbuild do TSX EXIT 0. Detalhe: `shared/changelog.ts`.

- **Rev. 2720** — FROTA · DASHBOARD DE MANUTENÇÃO (`/frotas` → "Manutenções" → "Dashboard") · A TABELA "DETALHE — PEÇAS QUE SE REPETEM" VIROU RESPONSIVA: EM TABLET/CELULAR VIRA CARDS `<details>`/`<summary>` QUE ABREM AO TOCAR (antes a tabela larga ficava espremida no iPad). Solução (SÓ CLIENT/UI; ZERO SERVER/SCHEMA): `ManutencoesDashboard.tsx` — `<table>` vira `hidden lg:block` e abaixo de `lg` renderiza cards nativos (summary com placa/peça/chip "Nx" + chevron; ao abrir grid 3-col com intervalos e custo; críticos ≤180 dias em vermelho). Validação: parse esbuild do TSX EXIT 0. Detalhe: `shared/changelog.ts`.

- **Rev. 2719** — FROTA · DASHBOARD DE MANUTENÇÃO + LANÇAMENTO · (1) DASHBOARD DETERMINÍSTICO DE "PEÇAS RECORRENTES" (SEM IA, CARREGA NO LOAD); (2) ALERTA AO LANÇAR PEÇA JÁ TROCADA NO MESMO VEÍCULO. Solução (SERVER + 2 CLIENTS; ZERO SCHEMA — só SELECT): `frotas.ts` +`getRecurringPartsDashboard`/`getVehiclePartHistory`; `ManutencoesDashboard.tsx` nova seção "Peças Recorrentes" (KPIs/BarCharts/ranking/tabela); `Manutencoes.tsx` query do histórico + `matchPartHistory` (normalizado→contains≥4) + chips e linha de alerta por item (vermelho ≤180 dias; senão âmbar). Validação: esbuild server + 2 TSX EXIT 0. Detalhe: `shared/changelog.ts`.

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
