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

- **Rev. 3274** — **COMPRAS / ORDEM DE COMPRA · O MESMO INSUMO QUE A OC GRAVA DIVIDIDO POR ETAPA DA EAP (EX.: CIMENTO EM FUNDAÇÃO/LAJE/ETC.) AGORA APARECE NUMA ÚNICA LINHA — TANTO NA TELA QUANTO NO PDF/IMPRESSÃO —, COM QTD/ENTREGUE/TOTAL SOMADOS. NA TELA, COM MAIS DE UMA ETAPA A LINHA É EXPANSÍVEL E MOSTRA O RATEIO POR ETAPA. O CUSTO POR ETAPA SEGUE CALCULADO SEPARADAMENTE (EM VALOR, R$) — PURAMENTE APRESENTAÇÃO. ZERO SCHEMA/ALTER/DROP/DELETE; SEM CONVERSÃO DE UNIDADE.** PEDIDO (piloto FC): "na OC reatendemos por etapa e o mesmo item (ex.: CIMENTO) se divide várias vezes; calcule o custo por etapa mas mostre como UM ÚNICO ITEM na OC" — confirmado: consolidar tela+PDF com detalhe por etapa expansível; saldo por etapa em VALOR; não mexer em unidade. CAUSA (por design, Rev. 2486): a OC agrupa por etapa — cada linha de `compras_ordens_itens` carrega o código da EAP em `insumoCodigo`, então o mesmo insumo p/ N etapas vira N linhas. SOLUÇÃO (SÓ APRESENTAÇÃO): helper `shared/ocItensConsolidados.ts` (`consolidarOcItens`) agrupa por `descrição+unidade` (normalizado), soma qtd/entregue/total (fallback `qtd×preço`), deriva preço unit. PONDERADO (`total÷qtd`) e preserva as linhas em `etapas[]` + flags `temSemVerba/temEstouro/temAvulso`. FRONT (`client/src/pages/compras/Ordens.tsx`): componente `OcItensConsolidados` (estado de expansão próprio — evita ordem de hooks) substitui a tabela inline do diálogo `detalhe`; badge "N etapas" + chevron expande "↳ Etapa <EAP>"; badges FORA DO ORÇAMENTO/PREJUÍZO preservados. PDF (`server/services/purchaseOrderPdf.ts`): loop itera `consolidarOcItens(itens)` (1 linha/insumo); TOTAIS usam `oc.subtotal`/`oc.total` (não soma das linhas) → consolidação não altera totais. RESSALVA: descrições divergentes não se fundem. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3273** — **RH & DP / FÉRIAS · NA COLUNA "STATUS", LOGO ABAIXO DA TAG "AGENDADA", AGORA APARECE A DATA EM QUE A FÉRIAS FOI AGENDADA ("Agendada em DD/MM/AAAA") — ANTES SÓ HAVIA A DATA DE PAGAMENTO (NOUTRA COLUNA), SEM REGISTRO DE QUANDO O AGENDAMENTO FOI FEITO. SCHEMA ADITIVO (NOVA COLUNA + BACKFILL IDEMPOTENTE) — ZERO ALTER DESTRUTIVO/DROP/DELETE.** PEDIDO (piloto FC): "em férias, abaixo da tag AGENDADA mostrar a data em que a férias foi agendada (hoje só mostra a data de pagamento)". CAUSA: `vacation_periods` não guardava a data do agendamento (só `dataPagamento` e `createdAt`). SCHEMA (ADITIVO): nova coluna `dataAgendamento TIMESTAMP` em `vacation_periods` (`drizzle/schema.ts`, camelCase `"dataAgendamento"`) + self-heal `[ColFix]` (`server/_core/index.ts`): `ALTER TABLE … ADD COLUMN IF NOT EXISTS "dataAgendamento" TIMESTAMP` + BACKFILL idempotente `UPDATE … SET "dataAgendamento"="createdAt" WHERE "dataAgendamento" IS NULL AND "dataInicio" IS NOT NULL`. GOTCHA: o bloco `[ColFix]` é VERSION-GATED por `COLFIX_VERSION` — foi necessário BUMPAR a constante (`v3273-2026-06-18-ferias-dataAgendamento`) p/ o ALTER+backfill rodar (sem o bump loga "Versão ok, pulando migrations"). BACK (`server/routers/avisoPrevioFerias.ts`): carimba `dataAgendamento` nos 4 caminhos→agendada (create; update genérico via `COALESCE("dataAgendamento", NOW())`; `definirDataFerias`; `reverterEmGozo` — sempre preservando a 1ª data) + expõe a coluna no SELECT de `ferias.list`. FRONT (`client/src/pages/Ferias.tsx`): sob o badge de Status, `status==="agendada" && dataAgendamento` → `<div>` "Agendada em {formatDate(String(f.dataAgendamento).slice(0,10))}" (slice protege o `formatDate`, que faz `split("-")` e quebra com timestamp). VALIDAÇÃO (Neon): coluna criada; backfill cobriu 45/45 "agendada" + 6/6 "em_gozo". ZERO ALTER DESTRUTIVO/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3272** — **OBRAS / CADASTRO (RELÓGIOS DE PONTO) · UMA OBRA CONTAVA 3 RELÓGIOS QUANDO DEVERIA TER 2 — O MESMO SN APARECIA DUPLICADO NA MESMA OBRA (RE-VÍNCULO CRIAVA 2ª LINHA ATIVA; O GUARD SÓ BARRAVA SN ATIVO EM OUTRA OBRA). AGORA O VÍNCULO É IDEMPOTENTE, O DADO FOI CURADO (1 LINHA ATIVA POR SN+OBRA) E AS TELAS/CONTAGENS DEDUPLICAM. ZERO ALTER/DROP/DELETE (ÚNICA DDL: ÍNDICE ÚNICO PARCIAL ADITIVO `uq_obra_sn_ativo`).** `addSnToObra` (`server/db.ts`) passou a buscar linha ativa antes do INSERT (idempotente; try/catch no 23505); bloco `[SyncSchema+] Rev. 3272` (`server/_core/index.ts`) desativa as ativas excedentes mantendo a de menor dataVínculo; `getObraSns`/`getAvailableSns`/`fechamentoPonto.ts` deduplicam + exigem `status='ativo'`. Detalhe: `shared/changelog.ts`.

- **Rev. 3271** — **OBRAS / CADASTRO · O BADGE "Xh/SEMANA" DA "JORNADA DE TRABALHO DA OBRA" MOSTRAVA 35h/SEMANA QUANDO A JORNADA LANÇADA SOMAVA 44h (SEG–QUI 12:00–22:00 c/ 1h INTERVALO = 9h; SEX 12:00–21:00 c/ 1h = 8h → 4×9+8 = 44h). CAUSA: UM DIA TINHA O INTERVALO GRAVADO COMO O RÓTULO "1 hora" (NÃO O VALUE "01:00"), QUEBRANDO O PARSE E DESCARTANDO O DIA INTEIRO. AGORA O CÁLCULO É ROBUSTO E BATE OS 44h. 100% SÓ FRONT.** PEDIDO (piloto FC): "no cadastro de obra, por que você está considerando 35h semanais sendo que a jornada lançada soma 44h?". CAUSA: o badge somava minutos com `intv.split(":").map(Number)`; quando o intervalo estava como RÓTULO "1 hora" (digitação livre no `TimeCombobox`, cujo `parseTimeInput` não convertia "1 hora", ou dado antigo), `"1 hora".split(":")` → `NaN` → `mins` virava `NaN`, o guard `if (mins>0)` falhava e o dia (9h) era descartado: 44−9 = 35h. Como "01:00" e "1 hora" exibem igual no combobox, o bug passava despercebido. SOLUÇÃO (SÓ FRONT): (1) `client/src/pages/Obras.tsx` — helpers `jornadaParaMinutos` (tolera "HH:MM", "1 hora"/"2 horas", "1h30", "30 min", número puro=horas) + `minutosParaHHMM`; o badge passou a usar `jornadaParaMinutos(sai) − (ent) − (intv)`; (2) `comporJornadaObra` NORMALIZA entrada/intervalo/saída p/ "HH:MM" canônico ao gravar — cura o dado na origem (intervalo inválido→"", entrada/saída inválidas mantêm o raw); (3) `client/src/components/TimeCombobox.tsx` — `parseTimeInput` ganhou branch "1 hora"/"2 horas" → "01:00"/"02:00". RESSALVA: obras antigas só têm o JSON curado ao reabrir+salvar; o badge já exibe certo ao vivo. ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3270** — **RH & DP / COLABORADORES · AO IMPRIMIR (OU GERAR PDF) A "LISTA DE COLABORADORES DESLIGADOS", OS FUNCIONÁRIOS DA BLACKLIST (LISTA NEGRA) AGORA TAMBÉM ENTRAM NA LISTA IMPRESSA, INTERCALADOS EM ORDEM ALFABÉTICA COM OS DESLIGADOS NORMAIS E COM O BADGE "⚑ BLACKLIST" NA COLUNA STATUS. NA TELA NADA MUDA — OS CARDS "DESLIGADOS" E "BLACKLIST" SEGUEM SEPARADOS; A BLACKLIST SÓ APARECE NO PAPEL/PDF. 100% READ-ONLY · SÓ FRONT.** PEDIDO (piloto FC): "preciso que ao imprimir, os funcionários da blacklist também estejam na lista de desligados". CAUSA: o filtro "Desligado" carrega do servidor SÓ `status='Desligado'` (`getEmployees` → `eq(status,'Desligado')`), então a lista negra (`status='Lista_Negra'`/`listaNegra=1`) nem chegava ao cliente — e a impressão é `window.print()` do DOM visível (`PrintActions`), logo o que não está na tela não sai no papel. SOLUÇÃO (SÓ FRONT, `client/src/pages/Colaboradores.tsx`): (1) query paralela `blacklistPrintRaw` (`employees.list` com `status:"Lista_Negra"`) habilitada SÓ quando `statusFilter==="Desligado"` E `isAdminMaster` (não-master nunca vê lista negra); (2) `blacklistPrintList` (useMemo) aplica os MESMOS filtros secundários dos desligados (skill/período/idade/função/foto); (3) `renderRows` (useMemo) mescla `displayEmployees` (printOnly:false) + blacklist (printOnly:true) ordenado por nome; o `<tbody>` mapeia `renderRows` e cada `<tr>` printOnly leva `className "hidden print:table-row"` (oculto na tela, visível só no print); seleção/checkbox seguem em `displayEmployees`; (4) o rótulo "N colaboradores no período" ganhou variante `hidden print:inline` com `renderRows.length` (combinado) enquanto a tela mantém `displayEmployees.length`. A coluna Status já mostrava o badge "⚑ Blacklist". ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3269** — **FINANCEIRO / CARTÃO DE CRÉDITO · A TELA DE CADASTRO DE CARTÕES GANHOU O CAMPO "STATUS" (ATIVO / BLOQUEADO / RENEGOCIADO / CANCELADO / INATIVO), EXIBIDO COMO BADGE COLORIDO EM CADA CARTÃO DA LISTA. ALÉM DISSO, OS 5 CARTÕES DA PLANILHA ENVIADA PELO PILOTO FORAM CADASTRADOS NO ERP (4 NA FC ENGENHARIA, 1 NA LOCNOW).** PEDIDO (piloto FC): "na tela de cadastro dos cartões coloque o status, e cadastre todos os cartões dessa planilha no ERP". CAUSA: a tabela `financial_cartoes` só tinha o flag binário `ativo` (0/1), sem situação cadastral rica (renegociado, bloqueado, cancelado). SCHEMA (ADITIVO): nova coluna `status VARCHAR(20) DEFAULT 'ativo'` em `financial_cartoes` (`drizzle/schema.ts`) + self-heal `[SyncSchema+]` em `server/_core/index.ts` (na CREATE TABLE + `ALTER TABLE … ADD COLUMN IF NOT EXISTS status`). O `ativo` legado passou a ser DERIVADO do status (`cancelado`/`inativo`→0; demais→1) p/ preservar o de-para da IA (só cartão ativo casa fatura) e o esmaecimento da listagem. BACK (`server/routers/cartao.ts`): const `STATUS_CARTAO` + helper `ativoDeStatus`; `listarCartoes` retorna `COALESCE(status,'ativo')`; `criarCartao`/`atualizarCartao` gravam status + sincronizam `ativo`. FRONT (`client/src/pages/financeiro/FinanceiroCartaoCredito.tsx`): `CARTAO_FORM_INICIAL.status`, `STATUS_CARTAO_OPCOES`, helper `statusCartaoBadge`, novo `<Select>` "Status" ao lado de "Tipo", badge na listagem; abrirEditar/salvar propagam status. DADOS (INSERT no Neon, tenant correto, guard anti-duplicidade por `final4`): Caixa/Elo 9754 (renegociado), Caixa/Visa 9552 (ativo, lim. R$ 20.000), Banco do Brasil/Elo 0840 (cancelado), Santander/Mastercard 5578 (ativo, lim. R$ 70.000) → FC ENGENHARIA (60002); Santander/Mastercard 4466 (ativo, lim. R$ 45.000) → LOCNOW (90001). ZERO ALTER DESTRUTIVO/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3268** — **FINANCEIRO / MENU LATERAL · O ITEM "PREVISÃO DE FATURAMENTO" SAIU DO GRUPO "MOVIMENTAÇÕES" E PASSOU PARA O GRUPO "ANÁLISE" (LOGO ACIMA DE "ANÁLISE DE CUSTOS"), QUE FAZ MAIS SENTIDO PELO CARÁTER ANALÍTICO/PROJETIVO DA TELA. SÓ ORGANIZAÇÃO DE MENU — A ROTA E A TELA NÃO MUDAM.** PEDIDO (piloto FC): "coloque a previsão de faturamento no grupo de análise, faz mais sentido ela lá". SOLUÇÃO (SÓ FRONT, `client/src/components/DashboardLayout.tsx`, `menuSectionsFinanceiro`): o item `{ icon: TrendingUp, label: "Previsão de Faturamento", path: "/financeiro/contas-a-receber" }` foi REMOVIDO da seção "Movimentações" e INSERIDO no topo da seção "Análise". A rota, o ícone e a permissão associada são exatamente os mesmos — nenhuma rota nova, nenhum registro de permissão a mexer. ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
