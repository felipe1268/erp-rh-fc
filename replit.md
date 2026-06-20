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

- **Rev. 3369** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · "CHEQUES DEVOLVIDOS" NO PANORAMA GERAL DO MÊS VOLTOU A MOSTRAR AS INFORMAÇÕES DE CADA CHEQUE (Nº, FORNECEDOR/OBRA/NF, MOTIVO DA DEVOLUÇÃO, DATAS E SITUAÇÃO) — ANTES SÓ APARECIA "—  —  R$ valor" EM TODA LINHA. 100% FRONT (CORREÇÃO DE NOMES DE CAMPO) · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Pedido (print do iPad em "Conciliação Bancária", bloco "Cheques devolvidos (38)"): "precisa aparecer as informações dos cheques, arrumar isso". RAIZ: o bloco do PANORAMA GERAL DO MÊS (`FinanceiroConciliacao.tsx`, ramo `cDevol`) lia campos INEXISTENTES no objeto do backend — `d.data`, `d.descricao`, `d.chequeFornecedor` — enquanto o endpoint monta cada cheque devolvido (par de estorno) com `chequeNumero`, `fornecedor`, `obraNome`, `nf`, `motivoCodigo`/`motivoTexto`/`motivoSustado`, `dataDebito`, `dataCredito`, `valor`/`valorCents` e `resolucao{tipo}`. Por isso toda linha resolvia para "—  —". A versão DETALHADA ("Abrir conta" → `repDevol`) já lia os nomes certos; só o resumo do panorama estava fora do padrão. FIX: o render de `cDevol` passou a usar os MESMOS campos do bloco detalhado — "Cheque nº {chequeNumero}" (fallback "Doc"), badge "Mot. {codigo} · {texto}" (vermelho se sustado), identificação `[fornecedor · obra · NF]`, "Comp. {dataDebito} → devol. {dataCredito}" e selo de situação via `resolucao.tipo` (✓ reapresentado / ✓ quitado (PIX/TED) / ⚠ sem quitação). Conciliação SÓ SUGESTIVA respeitada (bloco informativo). VALIDAÇÃO: tsc limpo no arquivo tocado. Detalhe: `shared/changelog.ts`.

- **Rev. 3368** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · (A) UMA RECEITA DE CLIENTE QUE CAÍA COMO "MOVIMENTAÇÃO INTERNA" VOLTOU AO "CAIXA REAL"; (B) NOVO "MAPA DA MOVIMENTAÇÃO INTERNA DO GRUPO" QUE MOSTRA QUANTO ENTROU/SAIU COM CADA CONTRAPARTE (LOCNOW, SÓCIOS, APLICAÇÃO/RESGATE, TRANSF. ENTRE CONTAS PRÓPRIAS) NO PERÍODO. SÓ BACKEND (1 PADRÃO REMOVIDO + 1 ENDPOINT READ-ONLY) + 1 FRONT · ZERO SCHEMA/ALTER/DROP/DELETE · NADA CONCILIA SOZINHO.** Pedido: (A) corrigir os números + (B) relatório da movimentação interna (usuário escolheu AS DUAS). DIAGNÓSTICO (Neon, company_id=60002, 2026): a hipótese de "vazamento ~3mi" estava ERRADA — a régua JÁ pega 2,87mi de débitos como internos via espelho; só ~178k "vazam com espelho" e são quase todos FORNECEDOR REAL (Hotel Consagrado, Ferragens Santa Rita…) batendo em valor redondo por coincidência → casar interno por valor+data é PERIGOSO, NÃO implementado auto-matching. A assimetria (entrou 9,17mi/saiu 4,56mi do grupo) é dinheiro REAL (grupo bancando a FC). ÚNICO erro real: Arquidiocese de Aparecida (R$ 53.344,75, CLIENTE) classificada interna pelo padrão GENÉRICO `"credito transf internet"` (rótulo da Caixa que também aparece em TED de cliente). FIX (A) (`server/routers/financial.ts`, `_INTERNO_PATTERNS`): REMOVIDO `"credito transf internet"` — internos legítimos seguem casando por nome/CNPJ do grupo + `"fc engenharia"`; efeito cirúrgico (só a Arquidiocese volta p/ caixa real). FEATURE (B): NOVO endpoint READ-ONLY `getMovimentacaoInternaGrupo` (mesma fonte única `internoExpr`) agrega o período POR CONTRAPARTE com baldes DINÂMICOS de `financial_internal_cnpjs` (CNPJ OU nome forte) + 3 fixos (Aplicação/Resgate, Transf. entre contas próprias, Outras); retorna `{periodo,buckets[{label,tipo,entrou,saiu,liquido,qtd}],totais,lines[]}`. FRONT: NOVO `_MapaMovimentacaoInterna.tsx` (diálogo com totais + tabela de baldes + drill-in por linha → reclassificação pontual via `NaturezaOverrideDialog`) + botão/state em `FinanceiroConciliacao.tsx`; SEM rota/menu/permissão nova. Conciliação SÓ SUGESTIVA respeitada. VALIDAÇÃO: tsc limpo nos arquivos tocados. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3367** — **FINANCEIRO / CADASTRO · CONTAS BANCÁRIAS · O BOTÃO "EXCLUIR" AGORA REALMENTE TIRA A CONTA DA LISTA. ANTES, AO CLICAR EM "EXCLUIR" E CONFIRMAR, A CONTA CONTINUAVA APARECENDO NO ERP (E NOS CARDS "TOTAL DE CONTAS"/"ATIVAS"). SÓ BACKEND (1 FILTRO) · ZERO SCHEMA/ALTER/DROP/DELETE.** RAIZ: a mutation `folha.excluirContaBancaria` JÁ fazia o soft-delete certo, mas a LEITURA `folha.listarContasBancarias` filtrava só por `companyFilter(companyId)` — SEM `deletedAt IS NULL` — então a conta "excluída" voltava na próxima leitura. FIX (`server/routers/folhaPagamento.ts`): `where` virou `and(companyFilter(...), sql\`${companyBankAccounts.deletedAt} IS NULL\`)`. Detalhe: `shared/changelog.ts`.

- **Rev. 3366** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O "PAINEL GERAL DO MÊS" PAROU DE CONTAR COMO "SAÍDA DE CAIXA REAL" OS PIX/TRANSFERÊNCIAS PARA EMPRESAS DO PRÓPRIO GRUPO QUANDO O BANCO TRAZ SÓ O NOME NA LINHA (SEM O CNPJ). AGORA CASA TAMBÉM PELO NOME DISTINTIVO, DOS DOIS LADOS. SÓ BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Fonte única (`server/routers/financial.ts`): NOVA const `_NAME_STOP_TOKENS` + helper `_nameTokenForte(nome)` (1º token ≥5 alfanum sem acento fora da stop-list → "locnow"); `_loadInternoConfig` devolve `nameTokens[]`; `_internoSqlPredicate` ganhou 3º param; `_isLancInternoRow` checa tokens. Neon: EXATAMENTE 1 linha reclassificada (Locnow −105k), ZERO falso-positivo. Detalhe: `shared/changelog.ts`.

- **Rev. 3365** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · AS BOLINHAS DE STATUS DA TIMELINE DE MESES (AZUL "COM LANÇAMENTO" / VERDE "CONSOLIDADO" / CINZA "SEM DADOS") AGORA ACENDEM SEM PRECISAR ABRIR UMA CONTA. 1 ENDPOINT READ-ONLY NOVO + TROCA DE FONTE NO FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** RAIZ: as bolinhas vinham de `getBankStatements` com `enabled: !!companyId && !!contaBancariaId` — sem conta aberta a query não dispara → 12 meses cinza. FIX: NOVO endpoint READ-ONLY `getBankStatementsMonthlyStatus` agrega `bank_statement_lines` por mês p/ a EMPRESA (ou só a conta); `FinanceiroConciliacao.tsx` roda com `enabled: !!companyId`. Detalhe: `shared/changelog.ts`.

- **Rev. 3364** — **FOLHA / HORA EXTRA (RELATÓRIO DE PERÍODOS HE) · A FOTO DO COLABORADOR AGORA AMPLIA AO TOCAR — COM ROBUSTEZ NO iPad/iOS SAFARI (SELO DE ZOOM PERMANENTE NO AVATAR + LIGHTBOX MAIOR SEM `transform`, FALLBACK onError E BOTÃO "ABRIR" EM NOVA ABA). 100% FRONT.** `FolhaPagamento.tsx`: avatar virou `<button>` com selo `ZoomIn` + `title`; lightbox `max-w-2xl`/`max-h-[78vh]`, `<img>` com `style.transform:"none"` (evita o compositing-layer branco do iOS), `onError` com fallback + link "Abrir" (`ExternalLink`, `target=_blank`). Detalhe: `shared/changelog.ts`.

- **Rev. 3363** — **FINANCEIRO / CONCILIAÇÃO · APLICAÇÃO/RESGATE AUTOMÁTICO (CDB ContaMax / SANTANDER): (1) FLAG POR CONTA NO CADASTRO; (2) APLICAÇÃO E RESGATE CAEM COMO MOVIMENTAÇÃO INTERNA (NÃO-CAIXA); (3) O RENDIMENTO DO MÊS É LIDO DO EXTRATO E PROPOSTO PRA CONFIRMAÇÃO — AO CONFIRMAR, GERA 3 LANÇAMENTOS: RECEITA FINANCEIRA (BRUTO) + IOF + IR. NUNCA LANÇA SOZINHO. 1 COLUNA NOVA (SELF-HEAL) + PARSER + 1 MUTATION + 1 ALERTDIALOG.** Coluna `temAplicacaoAutomatica` em `company_bank_accounts` + checkbox; `_INTERNO_PATTERNS` já reconhece "aplica/resgate/contamax/cdb"; `santanderPdfParser.ts` lê "Acumulado Mês" (bruto resgatado/IOF/IR); NOVA `lancarRendimentoAplicacao` (3 entries, find-or-create categorias, conciliado=1, idempotente race-safe por conta+ano/mês via `pg_advisory_xact_lock`, tenant guard duplo); `FinanceiroConciliacao.tsx` AlertDialog pós-import. Detalhe: `shared/changelog.ts`.

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
