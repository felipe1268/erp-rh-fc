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

- **Rev. 3231** — **FINANCEIRO / CONTROLE DE CHEQUES · NOVOS BOTÕES "LIMPAR MÊS" E "LIMPAR ANO INTEIRO" PARA APAGAR OS REGISTROS DE CHEQUE DO PERÍODO, COM DUPLA CONFIRMAÇÃO + SENHA DO LOGIN DO USUÁRIO (CONFERIDA NO BACKEND) + ALERTA VERMELHO DE PERDA TOTAL DOS REGISTROS. GUARDA DE INTEGRIDADE: SE QUALQUER CHEQUE DO PERÍODO JÁ FOI CONCILIADO EM ALGUM EXTRATO (MÊS CONSOLIDADO), O ERP PROÍBE A LIMPEZA E MOSTRA AVISO — PRA NÃO GERAR ERRO NA CONCILIAÇÃO BANCÁRIA.** PEDIDO (piloto FC): "botão para limpar as informações de cadastro do mês e do ano inteiro, com duas confirmações e a senha do login digitada, e um alerta claro em vermelho de que vai perder todos os registros; porém, se o cheque já foi conciliado em algum extrato e mês consolidado, o ERP deve avisar e PROIBIR apagar, pra não gerar erros no sistema." SOLUÇÃO: exclusão SOFT (`excluido_em=NOW()`) no mesmo padrão de `excluir`/`reverterLote` (ZERO ALTER/DROP/DELETE físico) — reimportar a planilha recupera. BACK (`server/routers/cheques.ts`): `limparPreview` (query read-only) devolve `total/conciliados/compensados/consolidado/valor/bloqueado` por MÊS (mes!=null) ou ANO (mes=null); `limparCadastro` (mutation) faz (1) `assertCompanyAccess`, (2) confere a SENHA do usuário logado via bcrypt no servidor (OAuth sem senha local cai na própria sessão, mesma semântica de `wipeMonthEntries`), (3) GUARDA: conta `conciliado=1` no período e, se >0, lança `FORBIDDEN` sem apagar, (4) total=0 retorna sem ação, (5) `UPDATE financial_cheques SET excluido_em=NOW()` por company_id + ano_ref (+ mes_ref no escopo mês), RETURNING id pra contar. FRONT (`FinanceiroCheques.tsx`): 2 botões vermelhos no cabeçalho ("Limpar mês" desabilitado em "Ano todo"; "Limpar ano inteiro") + diálogo de 2 etapas (1ª = alerta vermelho + total; 2ª = input senha tipo password, Enter dispara); quando `bloqueado`, troca pro card "Limpeza proibida" sem botão de ação; pós-sucesso invalida listar/resumo/resumoMensal. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3230** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · A LISTA "NO EXTRATO, SEM LANÇAMENTO" AGORA CRUZA TAMBÉM O CONTROLE DE CARTÃO DE CRÉDITO: QUANDO UMA LINHA DO EXTRATO BATE COM O VALOR TOTAL DE UMA FATURA, A LINHA MOSTRA "💳 FATURA <CARTÃO> · REF · VENC." E O "LANÇAR NO ERP" JÁ ABRE PRÉ-PREENCHIDO COMO UM ÚNICO PAGAMENTO (FORMA = CARTÃO). O DETALHE DOS GASTOS POR OBRA/CENTRO DE CUSTO CONTINUA NO MÓDULO CARTÃO DE CRÉDITO — A CONCILIAÇÃO SÓ OLHA O VALOR TOTAL DA FATURA (PAGA OU NÃO).** PEDIDO (piloto FC): "o cartão tem a mesma lógica do controle de cheques, porém aqui o ERP deve considerar APENAS o valor total da fatura pra ver se foi paga; quem quiser o detalhe vê no módulo Cartão de Crédito — mas a conciliação bancária deve OBRIGATORIAMENTE consultar esse banco também." CAUSA-RAIZ: a Rev. 3229 cruzou só `financial_cheques`; a fatura do cartão (pagamento único = total da fatura) não era identificada, então a linha vinha crua e o "Lançar" abria em branco. SOLUÇÃO (READ-ONLY): BACK (`server/routers/financial.ts`, `getConciliacaoReport`) carrega `financial_cartao_faturas` (excluido_em IS NULL, total NOT NULL) com LEFT JOIN em `financial_cartoes` (banco/bandeira/final4), monta `fatByTotal` (cents) e `fatByTotalVenc` (cents+vencimento) e aplica `matchFaturaLinha` SÓ em SAÍDAS — (1) valor total + data do extrato == vencimento, único; (2) valor total + descrição com indício de cartão/fatura (`pareceCartao`), único — anexando `faturaId/faturaCartao/faturaVencimento/faturaTotal/faturaMesRef/faturaAnoRef/faturaConciliado` (cheque tem precedência). FRONT (`FinanceiroConciliacao.tsx`): chip índigo na linha, `abrirLancar` pré-preenche descrição + forma=cartão (SEM obra/fornecedor — rateio é do módulo Cartão), faixa índigo no diálogo "Lançar", busca livre cobre cheque+fatura, PDF imprime a linha da fatura. ZERO BACKEND DE GRAVAÇÃO · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3229** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · A LISTA "NO EXTRATO, SEM LANÇAMENTO" AGORA CRUZA TODAS AS INFORMAÇÕES DO CONTROLE DE CHEQUES: CADA LINHA DE COMPENSAÇÃO MOSTRA O FAVORECIDO (FORNECEDOR · OBRA · NF) E O "LANÇAR NO ERP" ABRE PRÉ-PREENCHIDO (FORNECEDOR / OBRA / FORMA = CHEQUE / DESCRIÇÃO).** BACK (`server/routers/financial.ts`, `getConciliacaoReport`) carrega `financial_cheques` e aplica `matchChequeLinha` (nº+valor; fallback valor+data único COM TRAVA `pareceCheque`) anexando fornecedor/obra/nf/etc. FRONT (`FinanceiroConciliacao.tsx`): chip verde + pré-preenchimento do "Lançar" + PDF. ZERO BACKEND DE GRAVAÇÃO · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3228** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · DEMONSTRATIVOS DE PAGAMENTO (PIX + BOLETOS) · A LEITURA POR IA DEIXOU DE ABRIR UM MODAL E AGORA APARECE INLINE, LOGO ABAIXO DOS ANEXOS, NUMA LISTA COMBINADA (PIX + BOLETOS) NO MESMO MOLDE DO EXTRATO/ERP — COM CARDS DE TOTAL GERAL / PIX / BOLETOS, CHIPS DE TIPO E BUSCA LIVRE; ANEXAR UM PDF JÁ DISPARA A ANÁLISE.** FRONT-ONLY (`FinanceiroConciliacao.tsx`): removido `verLeitura`; `demoFiltro` (todos|pix|boleto); `<Card>` inline com lista combinada (`_tipo`), busca livre, 3 cards sobre a lista FILTRADA e tabela com coluna "Tipo"; `onDemoFile`→`lerDemoIA(kind)`. ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3227** — **FINANCEIRO / CONTROLE DE CHEQUES · IMPORTAÇÃO DA PLANILHA · A PRÉVIA AGORA LISTA TODOS OS CHEQUES LIDOS (NÃO MAIS UMA AMOSTRA DE 40) NUMA TABELA FILTRÁVEL E PESQUISÁVEL, COM A ABA E A LINHA EXATA DO EXCEL DE CADA UM. OS CARDS VIRARAM FILTROS CLICÁVEIS (TODOS / NOVOS / JÁ EXISTEM / DUPLICADOS / SEM FORNECEDOR / SEM CONTA / SEM VALOR) + NOVOS CARDS "SEM CONTA" E "SEM VALOR".** BACK (`server/routers/cheques.ts`) `ChequeRow` ganhou `aba`/`linhaExcel`; `importarPreview` monta `linhas[]` com TODAS as linhas + contador `semValor`; `amostra` mantida p/ compat; gravação intacta. FRONT (`FinanceiroCheques.tsx`) `previewFiltro`/`previewBusca` + useMemo `previewLinhas`; tabela "Cheques lidos na planilha" com chips contáveis, busca, cap 1000; KPIs viraram `<button>` filtrantes. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3226** — **FINANCEIRO / CONTROLE DE CHEQUES · IMPORTAÇÃO DA PLANILHA · A MENSAGEM "IGNORADAS" AGORA EXPLICA QUE SÃO ABAS (PLANILHAS) NÃO LIDAS — NÃO CHEQUES — E MOSTRA, POR ABA PULADA, NOME + MOTIVO + QUANTAS LINHAS COM CARA DE CHEQUE FICARAM DE FORA.** BACK (`cheques.ts`) novo tipo `AbaIgnorada {nome,motivo,linhas}`; `parseWorkbook` conta linhas via `contarLinhasCheque` e classifica motivo ("não é aba de mês" / "aba de mês sem cheques válidos"). FRONT (`FinanceiroCheques.tsx`) bloco "Abas ignoradas" com badge + dica de renomear; retrocompat string OU objeto. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3225** — **OBRAS / CADASTRO E EDIÇÃO · NOVO CAMPO "JORNADA DE TRABALHO DA OBRA" (SEG A DOM: ENTRADA/INTERVALO/SAÍDA). QUANDO PREENCHIDA, PREVALECE SOBRE A DO FUNCIONÁRIO PARA TODOS OS ALOCADOS, RESPEITANDO A OBRA DA BATIDA E A DATA DE ALOCAÇÃO.** SCHEMA ADITIVO `obras.jornadaTrabalho` + self-heal; helper `server/utils/jornadaObra.ts`; `fechamentoPonto.ts` obra-aware em todas as procedures de minutos esperados + `dixiPonto.importAFD`; `routers.ts` obras.create/update; UI `Obras.tsx`. ZERO ALTER destrutivo/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
