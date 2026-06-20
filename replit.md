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

- **Rev. 3371** — **FINANCEIRO / DASHBOARD "CONTROLE DE CHEQUES" · OS GRÁFICOS DE PIZZA (DONUT) "CHEQUES POR STATUS" E "DEVOLVIDOS POR MOTIVO" VIRARAM GRÁFICOS DE COLUNAS/BARRAS, PARA FICAR MAIS LEGÍVEL E ORGANIZADO. 100% FRONT (TROCA DE TIPO DE GRÁFICO) · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE · NADA CONCILIA/BAIXA SOZINHO.** Pedido (print do iPad na tela "Dashboard · Controle de Cheques"): "Quero gráficos melhores e mais organizado gosto dos gráficos de colunas". FIX (`client/src/pages/financeiro/dashboards/DashCheques.tsx`, só troca de componente — mesmos dados/cores/drill-in): (1) "Cheques por status" (`porStatus`) virou `<BarChart>` de COLUNAS VERTICAIS mantendo `statusColor(_key)` por `<Cell>` (pendente=vermelho/compensado=verde/indefinido=âmbar) + clique abre o mesmo drill via `barClick`; (2) "Devolvidos por motivo" (`devPorMotivo`) virou `<BarChart layout="vertical">` (BARRAS HORIZONTAIS — rótulos longos legíveis) mantendo `devMotivoCor(name)` por `<Cell>` + clique abre `abrirDev`. "Conferência com o extrato" e "Situação dos devolvidos" já eram barras (inalterados). Limpeza: `PieChart`/`Pie` removidos do import de recharts (`Legend`/`Cell` permanecem). Conciliação SÓ SUGESTIVA respeitada (gráficos informativos). VALIDAÇÃO: tsc limpo no arquivo tocado. Detalhe: `shared/changelog.ts`.

- **Rev. 3370** — **FINANCEIRO / DASHBOARD "CONTROLE DE CHEQUES" · NOVA SEÇÃO "CHEQUES DEVOLVIDOS" QUE MOSTRA OS CHEQUES SEM FUNDO, SUSTADOS, JÁ COMPENSADOS DEPOIS E OUTROS MOTIVOS — COM KPIs, GRÁFICO POR MOTIVO (PIZZA) E POR SITUAÇÃO (BARRA) + DRILL-IN POR CHEQUE (Nº, FORNECEDOR/OBRA/NF, MOTIVO, DATAS, SITUAÇÃO). 100% FRONT (NOVA QUERY READ-ONLY A ENDPOINT EXISTENTE) · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE · NADA CONCILIA/BAIXA SOZINHO.** Pedido (print do iPad na tela "Dashboard · Controle de Cheques", ao lado de "Cheques por status"): "Coloque aqui os cheques sem fundo, os compensados ou outros motivos". DESCOBERTA-CHAVE: os MOTIVOS de devolução NÃO existem em `financial_cheques` — são detectados dinamicamente no extrato (`bank_statement_lines`) por `detectarParesEstorno` (`shared/chequeMotivos.ts`, pareia débito-compensação + crédito-devolução e traduz a alínea Bacen). Por isso a fonte é a CONCILIAÇÃO: o dashboard chama `trpc.financial.getConciliacaoReportGeral` (company-wide, já existente) com a janela do ANO inteiro e lê `chequesDevolvidos` (`chequeNumero`, `fornecedor`, `obraNome`, `nf`, `motivoCodigo`/`motivoTexto`/`motivoGrupo`/`motivoSustado`, `dataDebito`, `dataCredito`, `valorCents`, `resolucao{tipo}`). FRONT (`client/src/pages/financeiro/dashboards/DashCheques.tsx`): nova query (no refetch geral) + helpers (`devValor`/`devResolvido`/`devSituacao`/`devSituacaoCor`/`devMotivoLabel`/`devMotivoCor` via `GRUPO_DEVOLUCAO_LABEL`) + `DEV_COLS`; memos `devolvidos`/`devStats`/`devPorMotivo`/`devPorSituacao`; nova seção (guard `devolvidos.length>0`) com 4 KPIs (Devolvidos no ano · Sem fundos · Sustados/contraordem · Compensados depois), pizza "Devolvidos por motivo", barra "Situação dos devolvidos" e 2º `DetailDialog` (`detDev`). Conciliação SÓ SUGESTIVA respeitada (seção informativa). VALIDAÇÃO: tsc limpo no arquivo tocado. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3369** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · "CHEQUES DEVOLVIDOS" NO PANORAMA GERAL DO MÊS VOLTOU A MOSTRAR AS INFORMAÇÕES DE CADA CHEQUE (Nº, FORNECEDOR/OBRA/NF, MOTIVO DA DEVOLUÇÃO, DATAS E SITUAÇÃO) — ANTES SÓ APARECIA "—  —  R$ valor" EM TODA LINHA. 100% FRONT (CORREÇÃO DE NOMES DE CAMPO) · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** RAIZ: o bloco do PANORAMA GERAL DO MÊS (`FinanceiroConciliacao.tsx`, ramo `cDevol`) lia campos INEXISTENTES no objeto do backend (`d.data`, `d.descricao`, `d.chequeFornecedor`) enquanto o endpoint monta cada cheque devolvido com `chequeNumero`/`fornecedor`/`obraNome`/`nf`/`motivoCodigo`/`motivoTexto`/`dataDebito`/`dataCredito`/`resolucao{tipo}`. FIX: render de `cDevol` passou a usar os MESMOS campos do bloco detalhado. Detalhe: `shared/changelog.ts`.

- **Rev. 3368** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · (A) UMA RECEITA DE CLIENTE QUE CAÍA COMO "MOVIMENTAÇÃO INTERNA" VOLTOU AO "CAIXA REAL"; (B) NOVO "MAPA DA MOVIMENTAÇÃO INTERNA DO GRUPO" (QUANTO ENTROU/SAIU COM CADA CONTRAPARTE NO PERÍODO). SÓ BACKEND (1 PADRÃO REMOVIDO + 1 ENDPOINT READ-ONLY) + 1 FRONT · ZERO SCHEMA/ALTER/DROP/DELETE · NADA CONCILIA SOZINHO.** RAIZ (Neon, company_id=60002): a Arquidiocese de Aparecida (R$ 53.344,75, CLIENTE) caía como interna pelo padrão GENÉRICO `"credito transf internet"`; REMOVIDO de `_INTERNO_PATTERNS` (internos seguem casando por nome/CNPJ do grupo). FEATURE (B): NOVO endpoint READ-ONLY `getMovimentacaoInternaGrupo` (baldes dinâmicos por contraparte) + `_MapaMovimentacaoInterna.tsx`. Conciliação SÓ SUGESTIVA respeitada. Detalhe: `shared/changelog.ts`.

- **Rev. 3367** — **FINANCEIRO / CADASTRO · CONTAS BANCÁRIAS · O BOTÃO "EXCLUIR" AGORA REALMENTE TIRA A CONTA DA LISTA. ANTES, AO CLICAR EM "EXCLUIR" E CONFIRMAR, A CONTA CONTINUAVA APARECENDO NO ERP (E NOS CARDS "TOTAL DE CONTAS"/"ATIVAS"). SÓ BACKEND (1 FILTRO) · ZERO SCHEMA/ALTER/DROP/DELETE.** RAIZ: a mutation `folha.excluirContaBancaria` JÁ fazia o soft-delete certo, mas a LEITURA `folha.listarContasBancarias` filtrava só por `companyFilter(companyId)` — SEM `deletedAt IS NULL` — então a conta "excluída" voltava na próxima leitura. FIX (`server/routers/folhaPagamento.ts`): `where` virou `and(companyFilter(...), sql\`${companyBankAccounts.deletedAt} IS NULL\`)`. Detalhe: `shared/changelog.ts`.

- **Rev. 3366** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O "PAINEL GERAL DO MÊS" PAROU DE CONTAR COMO "SAÍDA DE CAIXA REAL" OS PIX/TRANSFERÊNCIAS PARA EMPRESAS DO PRÓPRIO GRUPO QUANDO O BANCO TRAZ SÓ O NOME NA LINHA (SEM O CNPJ). AGORA CASA TAMBÉM PELO NOME DISTINTIVO, DOS DOIS LADOS. SÓ BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Fonte única (`server/routers/financial.ts`): NOVA const `_NAME_STOP_TOKENS` + helper `_nameTokenForte(nome)` (1º token ≥5 alfanum sem acento fora da stop-list → "locnow"); `_loadInternoConfig` devolve `nameTokens[]`; `_internoSqlPredicate` ganhou 3º param; `_isLancInternoRow` checa tokens. Neon: EXATAMENTE 1 linha reclassificada (Locnow −105k), ZERO falso-positivo. Detalhe: `shared/changelog.ts`.

- **Rev. 3365** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · AS BOLINHAS DE STATUS DA TIMELINE DE MESES (AZUL "COM LANÇAMENTO" / VERDE "CONSOLIDADO" / CINZA "SEM DADOS") AGORA ACENDEM SEM PRECISAR ABRIR UMA CONTA. 1 ENDPOINT READ-ONLY NOVO + TROCA DE FONTE NO FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** RAIZ: as bolinhas vinham de `getBankStatements` com `enabled: !!companyId && !!contaBancariaId` — sem conta aberta a query não dispara → 12 meses cinza. FIX: NOVO endpoint READ-ONLY `getBankStatementsMonthlyStatus` agrega `bank_statement_lines` por mês p/ a EMPRESA (ou só a conta); `FinanceiroConciliacao.tsx` roda com `enabled: !!companyId`. Detalhe: `shared/changelog.ts`.

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
