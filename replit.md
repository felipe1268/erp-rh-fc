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


- **Rev. 2651** — **PLANEJAMENTO / CURVA S DE TRABALHO · A LINHA AZUL (BASELINE/PREVISTO) VOLTA A SER UMA CURVA S SUAVE E MONOTÔNICA ("SEGUE A LITERATURA") — ACABOU O DEGRAU (QUEDA) QUE A Rev. 2650 INTRODUZIU NO PONTO DO STATUS. A AZUL AGORA LÊ A MESMA FONTE DO HEADER (`previsto_semanas.raiz`), PASSANDO EXATAMENTE PELO "% PREVISTO" DO CABEÇALHO; COM PREVISTO=REALIZADO ELA SE SOBREPÕE À VERDE.** Pedido (usuário, print IMG_1470): "Está errado a curva s.. não faz sentido siga a literatura correta" (azul subindo, CAINDO em S2–S3 e disparando depois — curva S não pode regredir). DIAGNÓSTICO (Neon READ-ONLY, proj 39, rev 58): `previsto_semanas.raiz`=[2,9,15,20,…] (monotônica, cutoff=Quinta); o header lê o previsto via `previstoCurva.raizAt(statusDate)` (carry-forward), NÃO o `gerarCurvaPlanejadaMSP`. A Rev. 2650 injetava o Texto10 POR ATIVIDADE em UMA única semana (a do status) — fonte distinta das semanas vizinhas (datas) → ponto fora da trajetória = degrau. CAUSA-RAIZ: duas fontes na mesma linha; a fonte canônica do previsto (header/cards) é `previsto_semanas.raiz`, já monotônica e cobrindo todas as semanas. Fix (R-001/R-007/R-010 — ZERO SCHEMA; SÓ LEITURA/CURVA): SERVER `server/routers/planejamento.ts` — `getCurvaS` ganha helper `curvaPrevistoSnapshot` que LÊ `previsto_semanas_json`, re-chaveando cada cutoff (Quinta)→segunda (`toMondayStr`) p/ alinhar com a Realizada, com ponto-zero e clamp monotônico (vale só p/ a revisão dona do snapshot + modo duração); `gerarCurvaPlanejadaMSP` tem a injeção do Texto10 (Rev. 2650) REVOGADA, voltando a ser só fallback por datas. EFEITO (simulado no Neon): azul=[05-25=0,06-01=2,06-08=9,06-15=15,…] — sem degrau; azul@06-08=9=realizado=header → sobrepostas, "no prazo". RESSALVA: revoga só a CAUSA-RAIZ #1 da Rev. 2650; o fix do card financeiro "PREVISTO (BCWS)" (CAUSA-RAIZ #2) PERMANECE. Validado (estático): `pnpm build` exit 0. Detalhe: `shared/changelog.ts`.
- **Rev. 2650** — **PLANEJAMENTO / CURVA S · (1) NA CURVA S DE TRABALHO, A LINHA AZUL (PREVISTO/BASELINE) VOLTA A PASSAR PELO MESMO % DO HEADER NO PONTO DO STATUS — COM PREVISTO=REALIZADO AS LINHAS SE SOBREPÕEM. (2) NA CURVA S FINANCEIRA, O CARD "PREVISTO (BCWS)" DEIXA DE MOSTRAR R$ 0,00 (E O DESVIO FANTASMA "+R$… ADIANTADO") — BCWS E BCWP PASSAM A SER MEDIDOS NA MESMA SEMANA-BASE.** Pedido (usuário): "se a previsto está conforme o realizado =, a linha deveria estar alinhadas e sobrepostas... e veja o financeiro não está igual a curva s de trabalho pq?" (prints: Trabalho com header Previsto=Realizado=9% mas verde abaixo da azul; Financeira com BCWS R$0,00 e Desvio +R$188.512,60). DIAGNÓSTICO (Neon READ-ONLY, proj 39, rev 58): avanços em 06-01/06-08, snapshot previsto=realizado=9%, statusDate=2026-06-11 (QUINTA), CUTOFF=Qui; `previsto_semanas.raiz`=9% em 06-11 → header e verde certos, a azul é que diverge. CAUSA-RAIZ #1 (REVOGADA na Rev. 2651): `curvaBaseline = gerarCurvaPlanejadaMSP` só usava o snapshot Texto10 quando `sunIso===statusDate`; o fix da 2650 (injetar snapshot na semana do status) criava degrau e foi substituído pela leitura de `previsto_semanas.raiz`. CAUSA-RAIZ #2 (VÁLIDA): no card financeiro o BCWS (`finPrevHoje`) era medido em "hoje" (31/05, antes do início da obra 01/06) → R$0, enquanto o BCWP era medido na última semana com avanço → Desvio = BCWP inteiro "adiantado". Fix CAUSA-RAIZ #2: CLIENT `PlanejamentoDetalhe.tsx` ancora o BCWS na última semana com Realizado (`finRefSemana`). RESSALVA: Trabalho (% por duração/snapshot MSP) e Financeira (R$ por peso financeiro + BCWP dos avanços) são métricas distintas — pequenas diferenças entre elas são esperadas; o bug era só o BCWS R$0. Validado (estático): `pnpm build` exit 0. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2649** — PLANEJAMENTO / CURVA S · A LINHA "REALIZADO" (VERDE) PARA DE EXIBIR DADO-FANTASMA APÓS APAGAR OS AVANÇOS — AO LIMPAR/SALVAR AVANÇOS, A CURVA REGENERA NA HORA EM VEZ DE FICAR COM CACHE VELHO. CAUSA-RAIZ: as 4 mutations de avanço invalidavam `listarAvancos`/`getProjetoById` mas NUNCA `getCurvaS`/`getCurvaSFinanceira`/`getCurvasTodasRevisoes` → React Query servia a curva em cache. Fix (SÓ CLIENT/CACHE; R-001/R-007/R-010): `PlanejamentoDetalhe.tsx` — helper `invalidarCurvaS()` no `onSuccess` das 4 mutations. Detalhe: `shared/changelog.ts`.

- **Rev. 2648** — RH & DP / GERAL · A FOTO AMPLIADA (LIGHTBOX DO `PersonPhoto`) PARA DE SER CORTADA AO ABRIR — CABEÇA E PÉS VOLTAM A APARECER INTEIROS, EM TODA TELA COM FOTO DE PESSOA. CAUSA-RAIZ: lightbox `fixed inset-0` renderizado dentro da árvore da página; ancestral com `transform`/`filter`/`backdrop-filter` vira "containing block" do `fixed` → overlay preso/recortado. Fix (SÓ CLIENT/UI; R-001/R-007/R-010): `client/src/components/PersonPhoto.tsx` — overlay via `createPortal(..., document.body)`, devolvendo o `fixed` à viewport → foto completa (object-contain). Detalhe: `shared/changelog.ts`.

- **Rev. 2647** — PLANEJAMENTO · O "% PREVISTO" PASSA A LER UMA ÚNICA COLUNA FIXA EM TODOS OS PROJETOS: "% PREVISTO" = Texto10 (FieldID 188743750). ACABARAM A DETECÇÃO POR ALIAS E AS RESERVAS Texto6/Texto11 — SE Texto10 FALTAR, O VALOR FICA "—". Fix (LEITURA/CLIENT-ONLY; R-001/R-007/R-010 — ZERO SCHEMA): `client/src/pages/planejamento/ImportarCronograma.tsx` — removida `detectarFidPorAlias`; nova const `FID_PREVISTO_TEXTO10`; RAIZ e ATIVIDADE leem SÓ `valorPorFid[FID_PREVISTO_TEXTO10] ?? null` (sem alias, sem fallback). Detalhe: `shared/changelog.ts`.

- **Rev. 2646** — PLANEJAMENTO · O FIX DA Rev. 2645 (PARAR DE INJETAR FERIADOS MÓVEIS) AGORA SE PROPAGA AUTOMATICAMENTE A TODOS OS PROJETOS — A CURVA "% PREVISTO" REGENERA EM TODO UPLOAD DO XML (INCLUSIVE O SEMANAL), NÃO MAIS SÓ NO CADASTRO/SUBSTITUIR. CAUSA-RAIZ: a curva só regenerava no `salvarAtividades`; o upload semanal regrava o `calendarioJson` limpo mas não o previsto → resíduo ~1% baixo. Fix (ADITIVO/LEITURA; R-001/R-007/R-010): `server/routers/planejamento.ts` (`salvarMetadadosMSProject`) regenera o previsto pós-patch (resolve revisão ativa + respeita a fonte; idempotente; try/catch). Projetos antigos se AUTO-CURAM no próximo upload. Detalhe: `shared/changelog.ts`.

- **Rev. 2645** — PLANEJAMENTO · O "% PREVISTO" VOLTA A BATER 100% COM A COLUNA "% PREVISTO" (Texto10) DO MSP: O ERP PARA DE AUTO-INJETAR FERIADOS MÓVEIS (CARNAVAL/SEXTA SANTA/CORPUS CHRISTI) NO CALENDÁRIO IMPORTADO — O CALENDÁRIO DO XML VIRA VERDADE ABSOLUTA. CAUSA-RAIZ: a Rev. 2632 injetava os móveis em `cal.exceptions`, encurtando o tempo útil → curva ~1% baixa (MSP usa o calendário dele, sem Corpus Christi). Fix (LEITURA/ADITIVO; R-001/R-007/R-010): `client/.../ImportarCronograma.tsx` — `completarFeriadosMoveisBR`→`detectarFeriadosMoveisAusentes` DETECT-ONLY; aviso reescrito. Detalhe: `shared/changelog.ts`.



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
