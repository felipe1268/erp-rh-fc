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

- **Rev. 3235** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · CHEQUE DEVOLVIDO = TENTATIVA DE PAGAMENTO FRUSTRADA · O ERP AGORA ENTENDE O PAR "DÉBITO DA COMPENSAÇÃO + CRÉDITO DA DEVOLUÇÃO DO MESMO CHEQUE" COMO UM ÚNICO EVENTO DE SALDO ZERO (NÃO É SAÍDA NEM ENTRADA REAL): RETIRA OS DOIS DA LISTA "NO EXTRATO, SEM LANÇAMENTO" E OS MOSTRA NUM BLOCO PRÓPRIO "CHEQUES DEVOLVIDOS", JÁ COM O MOTIVO TRADUZIDO (ALÍNEA BACEN — BIBLIOTECA INTERNA) E A BUSCA DA QUITAÇÃO REAL (REAPRESENTAÇÃO COMPENSADA OU PIX/TED DE MESMO VALOR). TUDO READ-ONLY — NADA É BAIXADO.** PEDIDO (piloto FC): "cheque compensado e depois devolvido é tentativa de pagamento que não deu certo — não conta como saída nem o crédito da devolução como entrada; juntar os dois, dizer o motivo e procurar se foi quitado de outro jeito (reapresentação ou PIX); quero também uma biblioteca dos motivos de devolução do Bacen". CAUSA-RAIZ: a Conciliação listava compensação (saída) e devolução (entrada) como 2 linhas soltas — o usuário não via que era o MESMO cheque (saldo zero) e podia lançar despesa que nunca vingou; pior, a Rev. 3234 podia confirmar (conciliado=1) um cheque cujo débito foi depois estornado. SOLUÇÃO: NOVA BIBLIOTECA `shared/chequeMotivos.ts` (`MOTIVOS_DEVOLUCAO_CHEQUE` alíneas Bacen 11–72 com grupo/sustado/reapresentavel; `getMotivoDevolucao` fallback genérico; parsers; motor `detectarParesEstorno` casa crédito-devolução×débito-compensação por Doc/nº [forte] ou valor+data [fraco]). BACK conciliação (`financial.ts`, `getConciliacaoReport`): monta `chequesDevolvidos[]` (herdando fornecedor/obra/NF do `matchChequeLinha`) + busca quitação nas linhas LIVRES (reapresentação=débito cheque mesmo valor data≥devolução; PIX/TED mesmo valor data≥compensação); marca `reversal`/`reversalResolveGrupo`. BACK controle (`cheques.ts`, `montarMatcherExtrato`): exclui débitos estornados de `byNumVal`/`byValData` e expõe `extratoDevolvido`/`extratoMotivoCodigo`/`extratoMotivoTexto`. FRONT (`FinanceiroConciliacao.tsx`): `repExt` filtra estornos/quitações; novo Card "Cheques devolvidos no banco" (motivo, par compensou→devolvido, resolução verde/azul/âmbar); `FinanceiroCheques.tsx` badge âmbar "Devolvido no banco · mot. NN". ZERO baixa/status automático · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3234** — **FINANCEIRO / CONTROLE DE CHEQUES · DUPLA CHECAGEM EXTRATO ↔ CHEQUE · O ERP AGORA CONFERE CADA CHEQUE DO CONTROLE CONTRA O EXTRATO BANCÁRIO IMPORTADO: QUANDO O BANCO REALMENTE COMPENSOU O CHEQUE E O CONTROLE JÁ DIZ "COMPENSADO", O ERP MARCA O CHEQUE COMO CONFERIDO (conciliado=1 + data_conciliacao); QUANDO O BANCO COMPENSOU MAS O CONTROLE DIZ DEVOLVIDO/SUSTADO/PENDENTE/ETC, O ERP GERA UM ALERTA VERMELHO P/ ANÁLISE MANUAL — NUNCA CORRIGE O STATUS AUTOMATICAMENTE.** PEDIDO (piloto FC): "fazer dupla checagem: quando o ERP verifica o extrato e confirma que o cheque compensou, marcar no controle; se o cheque estiver com status ≠ compensado mas o banco compensou, gerar alerta pra análise". CAUSA-RAIZ: `conciliado=1` nunca era escrito (badge "Conciliado no extrato" era código morto); a Conciliação (Rev. 3229) já cruzava extrato→cheque mas não expunha status nem alimentava o Controle. SOLUÇÃO (BACK, `server/routers/cheques.ts`): helpers `montarMatcherExtrato` (carrega `bank_statement_lines` snake_case; maps `byNumVal` nº+valor [forte] e `byValData` valor+data [fraco, só único + `pareceCheque`], espelhando Rev. 3229) + `classificarExtrato` (extratoConfirmado×extratoDivergente); `listar` anexa os flags; 2 procedures novas — `verificarExtratoResumo` (read-only: confirmados/divergências/jaConferidos/naoEncontrados/aConferir + `divergenciasLista[]`) e `conferirExtrato` (AÇÃO EXPLÍCITA: `UPDATE conciliado=1`+data_conciliacao SÓ nos confirmados consistentes via `FROM (VALUES (...)::int,(...)::date)` CHUNK 200, `COALESCE(conciliado,0)<>1` idempotente, company_id por ÚLTIMO no flat pois `dbExecute` liga por ordem de aparição; NUNCA toca divergência/status). FRONT (`FinanceiroCheques.tsx`): botão "Conferir com o extrato" + AlertDialog (honra "conciliação só sugestiva"), banner vermelho + diálogo "Analisar divergências", badge ⚠/✓ por linha, legenda. ZERO mudança de status automática · ZERO baixa financeira · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3233** — **FINANCEIRO / CONTROLE DE CHEQUES · IMPORTAÇÃO · A GRAVAÇÃO NÃO TRAVA MAIS PERTO DO FIM (~92% + ERRO AO GRAVAR ~1122 CHEQUES): A INSERÇÃO PASSOU DE 1 INSERT POR CHEQUE (1122 IDAS SEQUENCIAIS NA TRANSAÇÃO → TIMEOUT) PARA INSERT MULTI-LINHA EM LOTES DE 100 (~12 IDAS), MESMO RESULTADO (DEDUP/MATCH/GRAVAÇÃO SOFT).** BACK (`cheques.ts`, `inserirCheques`): 2 fases — dedup+match em memória → `INSERT ... VALUES (...),(...)` em CHUNKS de 100 (dbExecute liga params por ordem de aparição). Vale p/ planilha E PDF/IA. ZERO mudança de comportamento · ZERO SCHEMA/ALTER/DROP/DELETE · ZERO front. Detalhe: `shared/changelog.ts`.

- **Rev. 3232** — **FINANCEIRO / CONTROLE DE CHEQUES · IMPORTAÇÃO · O DIÁLOGO "IMPORTAR CONTROLE DE CHEQUES" GANHOU UM SEGUNDO MODO: ALÉM DA PLANILHA .XLSX, AGORA DÁ PRA SUBIR VÁRIOS PDFs/FOTOS DE CHEQUE DE UMA VEZ — A IA LÊ CADA UM, EXTRAI OS CHEQUES E O ERP IMPORTA TODOS NAS DATAS/MESES RESPECTIVOS (mes_ref/ano_ref DERIVADOS DA DATA DE CADA CHEQUE), COM A MESMA PRÉVIA (KPIs CLICÁVEIS, TABELA FILTRÁVEL, DEDUP, "GRAVAR N NOVOS").** SOLUÇÃO: reaproveita TODO o pipeline do import por planilha (dedup nº+valor+ano+mês, match fornecedor/conta, relatório dry-run, gravação SOFT em transação); só muda a FONTE das linhas (leitura por IA — Gemini Vision primário + fallback Anthropic). BACK (`cheques.ts`): helpers IA + `sanitizeChequeRow` (re-valida tudo no servidor) + refactor `montarRelatorio`/`inserirCheques` + 3 procedures `lerChequesPdf`/`importarPdfPreview`/`importarPdfConfirmar`. FRONT (`FinanceiroCheques.tsx`): seletor de modo + dropzone `multiple` + leitura em loop. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3231** — **FINANCEIRO / CONTROLE DE CHEQUES · NOVOS BOTÕES "LIMPAR MÊS" E "LIMPAR ANO INTEIRO" PARA APAGAR OS REGISTROS DE CHEQUE DO PERÍODO, COM DUPLA CONFIRMAÇÃO + SENHA DO LOGIN DO USUÁRIO (CONFERIDA NO BACKEND) + ALERTA VERMELHO DE PERDA TOTAL. GUARDA DE INTEGRIDADE: SE QUALQUER CHEQUE DO PERÍODO JÁ FOI CONCILIADO EM ALGUM EXTRATO (MÊS CONSOLIDADO), O ERP PROÍBE A LIMPEZA E AVISA.** SOLUÇÃO: exclusão SOFT (`excluido_em=NOW()`) no padrão de `excluir`/`reverterLote` (ZERO ALTER/DROP/DELETE físico). BACK (`cheques.ts`): `limparPreview` (read-only) devolve `total/conciliados/.../bloqueado` por mês/ano; `limparCadastro` faz `assertCompanyAccess` + confere senha via bcrypt + GUARDA (conciliado>0 → `FORBIDDEN`) + `UPDATE ... SET excluido_em=NOW()` por company+ano(+mês). FRONT (`FinanceiroCheques.tsx`): 2 botões vermelhos + diálogo de 2 etapas (alerta+total → senha) + card "Limpeza proibida". ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3230** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · A LISTA "NO EXTRATO, SEM LANÇAMENTO" AGORA CRUZA TAMBÉM O CONTROLE DE CARTÃO DE CRÉDITO: QUANDO UMA LINHA DO EXTRATO BATE COM O VALOR TOTAL DE UMA FATURA, A LINHA MOSTRA "💳 FATURA <CARTÃO> · REF · VENC." E O "LANÇAR NO ERP" JÁ ABRE PRÉ-PREENCHIDO COMO UM ÚNICO PAGAMENTO (FORMA = CARTÃO). O DETALHE DOS GASTOS POR OBRA/CENTRO DE CUSTO CONTINUA NO MÓDULO CARTÃO DE CRÉDITO — A CONCILIAÇÃO SÓ OLHA O VALOR TOTAL DA FATURA (PAGA OU NÃO).** PEDIDO (piloto FC): "o cartão tem a mesma lógica do controle de cheques, porém aqui o ERP deve considerar APENAS o valor total da fatura pra ver se foi paga; quem quiser o detalhe vê no módulo Cartão de Crédito — mas a conciliação bancária deve OBRIGATORIAMENTE consultar esse banco também." CAUSA-RAIZ: a Rev. 3229 cruzou só `financial_cheques`; a fatura do cartão (pagamento único = total da fatura) não era identificada, então a linha vinha crua e o "Lançar" abria em branco. SOLUÇÃO (READ-ONLY): BACK (`server/routers/financial.ts`, `getConciliacaoReport`) carrega `financial_cartao_faturas` (excluido_em IS NULL, total NOT NULL) com LEFT JOIN em `financial_cartoes` (banco/bandeira/final4), monta `fatByTotal` (cents) e `fatByTotalVenc` (cents+vencimento) e aplica `matchFaturaLinha` SÓ em SAÍDAS — (1) valor total + data do extrato == vencimento, único; (2) valor total + descrição com indício de cartão/fatura (`pareceCartao`), único — anexando `faturaId/faturaCartao/faturaVencimento/faturaTotal/faturaMesRef/faturaAnoRef/faturaConciliado` (cheque tem precedência). FRONT (`FinanceiroConciliacao.tsx`): chip índigo na linha, `abrirLancar` pré-preenche descrição + forma=cartão (SEM obra/fornecedor — rateio é do módulo Cartão), faixa índigo no diálogo "Lançar", busca livre cobre cheque+fatura, PDF imprime a linha da fatura. ZERO BACKEND DE GRAVAÇÃO · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3229** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · A LISTA "NO EXTRATO, SEM LANÇAMENTO" AGORA CRUZA TODAS AS INFORMAÇÕES DO CONTROLE DE CHEQUES: CADA LINHA DE COMPENSAÇÃO MOSTRA O FAVORECIDO (FORNECEDOR · OBRA · NF) E O "LANÇAR NO ERP" ABRE PRÉ-PREENCHIDO (FORNECEDOR / OBRA / FORMA = CHEQUE / DESCRIÇÃO).** BACK (`server/routers/financial.ts`, `getConciliacaoReport`) carrega `financial_cheques` e aplica `matchChequeLinha` (nº+valor; fallback valor+data único COM TRAVA `pareceCheque`) anexando fornecedor/obra/nf/etc. FRONT (`FinanceiroConciliacao.tsx`): chip verde + pré-preenchimento do "Lançar" + PDF. ZERO BACKEND DE GRAVAÇÃO · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
