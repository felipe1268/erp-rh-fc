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

- **Rev. 3247** — **FINANCEIRO / CONTROLE DE CHEQUES · A DATA DE COMPENSAÇÃO AGORA É PREENCHIDA AUTOMATICAMENTE PELO ERP QUANDO O CHEQUE É COMPENSADO NO EXTRATO. AO RODAR "CONFERIR COM O EXTRATO", ALÉM DE MARCAR O CHEQUE COMO CONFERIDO, O SISTEMA GRAVA A DATA EM QUE O BANCO COMPENSOU (DATA DO EXTRATO) NO CAMPO "DATA DE COMPENSAÇÃO" — E TAMBÉM FAZ BACKFILL DESSA DATA NOS CHEQUES JÁ CONFERIDOS QUE ESTAVAM SEM ELA. A COLUNA "DIAS P/ COMPENSAR" PASSA A MOSTRAR "COMPENSADO · DD/MM" CORRETO, GARANTINDO INFORMAÇÃO CONFIÁVEL PARA ANÁLISE FUTURA.** PEDIDO (piloto FC): "a data de compensação deve ser preenchida automaticamente pelo ERP, quando o cheque for compensado no extrato, garantindo as informações corretas para análise futura" (antes ficava sempre "—"). SOLUÇÃO (BACK, `server/routers/cheques.ts`, `conferirExtrato`): o UPDATE em lote dos recém-conferidos passou a gravar também `data_compensacao = COALESCE(f.data_compensacao, v.dt)` + `updated_at=NOW()` (v.dt = data do extrato/`extratoData`, mesma fonte do `data_conciliacao`, sem sobrescrever data existente); NOVO passo de BACKFILL — já conferidos (`conciliado=1`) sem `data_compensacao` entram na lista `backfill` e recebem a data via UPDATE próprio (`WHERE ... AND f.data_compensacao IS NULL`); retorno ganhou `backfilled` e o early-return considera `alvos`+`backfill`. "Conciliação só sugestiva" preservada (ação explícita, sem mudar status nem baixa). FRONT (`FinanceiroCheques.tsx`): toast informa "Data de compensação preenchida em N cheque(s)". ZERO SCHEMA/ALTER/DROP/DELETE (coluna já existia) · só UPDATE de dado. Detalhe: `shared/changelog.ts`.

- **Rev. 3246** — **FINANCEIRO / CONTROLE DE CHEQUES · A LISTA GANHOU UMA COLUNA "DIAS P/ COMPENSAR" QUE MOSTRA A CONTAGEM REGRESSIVA ATÉ O VENCIMENTO DE CADA CHEQUE ("FALTAM N DIAS" / "COMPENSA HOJE" / "VENCIDO HÁ N DIAS"), OU "COMPENSADO · DD/MM" QUANDO JÁ COMPENSOU. A COLUNA "MÊS" — QUE REPETIA O MÊS JÁ SELECIONADO NO FILTRO — SÓ APARECE AGORA NA VISÃO "ANO TODO". A ANTIGA COLUNA "COMPENSAÇÃO" (SÓ DATA) FOI ABSORVIDA PELA NOVA. SÓ APRESENTAÇÃO.** PEDIDO (piloto FC): "melhore este layout e coloque quantos dias faltam para cada cheque compensar; não sei se faz sentido ter o mês na coluna já que separamos o lançamento por mês". SOLUÇÃO (FRONT, `FinanceiroCheques.tsx`): helper `diasAteData(v)` (diff em DIAS no fuso LOCAL à meia-noite — evita off-by-one + crash `new Date()` no iOS via `+"T00:00:00"`); renderer `compensaCell(c)` — compensado (status OU `dataCompensacao`) → "Compensado · DD/MM" verde; `devolvido` → selo âmbar; `sustado`/`cancelado` → "—"; pendente/indefinido → pílula pelo vencimento (futuro azul "faltam N dias", hoje âmbar "compensa hoje", passado vermelho "vencido há N dias"), `title` com data real. Coluna "Compensação" SUBSTITUÍDA pela "Dias p/ compensar"; coluna "Mês" (`th`+`td`) virou CONDICIONAL `mesSel == null`; `whitespace-nowrap` em Vencimento/Dias/Mês. ZERO backend · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3245** — **FINANCEIRO / CONTROLE DE CHEQUES · A TELA GANHOU MÚLTIPLA SELEÇÃO: UMA CAIXA DE MARCAÇÃO POR CHEQUE (+ "SELECIONAR TODOS" NO CABEÇALHO) E UMA BARRA DE AÇÃO QUE, COM ≥1 CHEQUE SELECIONADO, PERMITE ALTERAR O STATUS DE TODOS DE UMA VEZ (COMPENSADO/PENDENTE/SUSTADO/CANCELADO/DEVOLVIDO/INDEFINIDO), COM CONFIRMAÇÃO. ANTES O STATUS SÓ MUDAVA UM A UM PELO LÁPIS.** PEDIDO (piloto FC): "quero múltipla seleção para poder alterar o status do cheque". SOLUÇÃO (BACK, `server/routers/cheques.ts`): nova procedure `atualizarStatusLote` ({companyId, ids[], status}) — UPDATE ATÔMICO único `... WHERE id IN (...) AND company_id=$N AND excluido_em IS NULL`; `assertCompanyAccess` + `z.enum(STATUS_VALIDOS)` + de-dup dos ids + cap 1000; placeholders na ORDEM DE APARIÇÃO que o `dbExecute` exige (status, ids…, company). FRONT (`FinanceiroCheques.tsx`): coluna de `Checkbox` (linha + cabeçalho indeterminate); `selectedIds:Set`/`bulkStatus`/`bulkOpen`; seleção SÓ age sobre os VISÍVEIS e é LIMPA via `useEffect` ao trocar filtro/mês/ano/busca; barra azul com Select + "Aplicar" → AlertDialog → `aplicarBulkStatus` invalida `listar`/`resumo`/`resumoMensal`/`verificarExtratoResumo`. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3244** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · NO PAINEL "CHEQUES DEVOLVIDOS NO BANCO", A LEGENDA (TAG-PÍLULA) DO MOTIVO DA DEVOLUÇÃO AGORA APARECE SEMPRE EM CADA CHEQUE — INCLUSIVE QUANDO O EXTRATO NÃO TROUXE O CÓDIGO/ALÍNEA BACEN, CASO EM QUE MOSTRA "MOTIVO NÃO INFORMADO". ANTES, SEM O CÓDIGO, A TAG SUMIA E O CHEQUE FICAVA SEM NENHUMA INDICAÇÃO DE MOTIVO, DIFICULTANDO A ANÁLISE. SÓ CONSULTA.** PEDIDO (piloto FC): "coloque a legenda do motivo que foi devolvido sempre, para facilitar a análise". SOLUÇÃO (FRONT, `FinanceiroConciliacao.tsx`, bloco "Rev. 3235 — CHEQUES DEVOLVIDOS"): a renderização do badge de motivo passou de `{d.motivoCodigo != null && (…)}` (só com código) para um ternário — COM código → tag como antes (vermelha se sustado, âmbar caso contrário, `title`=`motivoTexto`); SEM código → tag NEUTRA cinza "Motivo não informado" com `title` explicando que o extrato não trouxe a alínea Bacen e orientando a conferir direto no extrato/banco. ZERO backend · ZERO SCHEMA/ALTER/DROP/DELETE · "Conciliação só sugestiva" preservada. Detalhe: `shared/changelog.ts`.

- **Rev. 3243** — **FINANCEIRO · NOVA CATEGORIA "DASHBOARDS" NO MENU DO MÓDULO FINANCEIRO, COM 5 PAINÉIS VISUAIS DEDICADOS (CONTAS A RECEBER, CONTAS A PAGAR, CONCILIAÇÃO BANCÁRIA, CONTROLE DE CHEQUES E CARTÃO DE CRÉDITO), CABEÇALHO MODERNO + KPIs + GRÁFICOS RESPONSIVOS (RECHARTS), TUDO CLICÁVEL LEVANDO À TELA OPERACIONAL. 100% READ-ONLY.** FRONT (novo dir `client/src/pages/financeiro/dashboards/`): `_kit.tsx` compartilhado + 5 painéis (`DashReceber/Pagar/Conciliacao/Cheques/Cartao`); agregação client-side `useMemo`; nova seção "Dashboards" em `menuSectionsFinanceiro` + 5 rotas em `App.tsx` reusando a `route` de permissão de cada tela. ZERO backend novo · ZERO SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3242** — **FINANCEIRO / CONTROLE DE CHEQUES · A TELA GANHOU FILTROS E CARDS DEDICADOS À CONFERÊNCIA COM O EXTRATO BANCÁRIO: COMPENSADOS *E* VERIFICADOS ("CONFERIDOS NO EXTRATO"), OS QUE JÁ BATEM MAS FALTA MARCAR ("CONFERE — FALTA MARCAR") E DIVERGÊNCIAS. TRÊS CARDS CLICÁVEIS (QTD + BRL) FILTRAM A LISTA + TAG-PÍLULA POR LANÇAMENTO. SÓ CONSULTA.** FRONT (`FinanceiroCheques.tsx`): `EXTRATO_FILTERS=["conferido","confere","divergente"]` DERIVADOS das flags do `listar`; NÃO vão no `listarArgs.status` (guard), aplicados client-side em `chequesFiltrados`. Cards alimentados por `verificarExtratoResumo`. BACK: resumo soma TOTAIS BRL — READ-ONLY. ZERO SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3241** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O PAINEL "SUGESTÕES AUTOMÁTICAS DE CONCILIAÇÃO" GANHOU BOTÃO "EXPANDIR" QUE ABRE EM TELA CHEIA (MAIS ESPAÇO PRA REVISAR AS SUGESTÕES); "RECOLHER" VOLTA AO NORMAL. TODA A FUNCIONALIDADE CONTINUA IDÊNTICA — SÓ MUDA O TAMANHO. "CONCILIAÇÃO SÓ SUGESTIVA" PRESERVADA.** FRONT (`FinanceiroConciliacao.tsx`): em vez de duplicar a tabela, o PRÓPRIO card vira tela cheia via toggle de classe (estado `sugFull` → `fixed inset-3 z-50` + backdrop; ZERO duplicação de JSX, mesma árvore React); botão `Expandir`/`Recolher` (Maximize2/Minimize2) no header. ZERO backend · ZERO SCHEMA. Detalhe: `shared/changelog.ts`.

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
