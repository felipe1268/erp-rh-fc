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

- **Rev. 3344** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · TODOS OS CONTADORES INTEIROS DO PAINEL AGORA EXIBEM SEPARADOR DE MILHAR pt-BR (2.434, 2.967, 2.841…) — ANTES SÓ OS VALORES EM R$ ESTAVAM FORMATADOS; AS CONTAGENS (CRÉDITOS, DÉBITOS, LINHAS DO EXTRATO, CONCILIADOS, NO EXTRATO/ERP, CONTAS, SUGESTÕES) APARECIAM CRUAS (2434, 2967…). 100% FRONT · UX · READ-ONLY · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Pedido (usuário, no iPad, com 1 print do "Panorama geral do período"): "Todos números separados por ponto e vírgula" — padronizar as CONTAGENS com o mesmo separador de milhar pt-BR já usado nos valores em R$. RAIZ: valores monetários usam `formatBRL` (Intl pt-BR), mas os contadores inteiros eram interpolados crus no JSX/HTML. CORREÇÃO (`client/src/pages/financeiro/FinanceiroConciliacao.tsx`, 100% front): novo helper `formatInt(v)` = `Intl.NumberFormat("pt-BR")`. Aplicado em TODOS os contadores visíveis: cards do Panorama Geral, cabeçalho "Conciliação por conta (N)", linha/badges de cada conta, painéis expandidos, diálogo de drill-in, KPIs da visão de conta individual e cards/cabeçalhos dos PDFs (Conciliação + Cheques Devolvidos). O `%` segue sem milhar (é percentual). Valores em R$ intactos. tsc limpo. Detalhe: `shared/changelog.ts`.

- **Rev. 3343** — **FINANCEIRO / CONTAS BANCÁRIAS + CONTROLE DE CHEQUES · CONTROLE DE TALÕES DE CHEQUE PARA RASTREABILIDADE 100%: (1) NO CADASTRO DE CONTAS DÁ PRA MARCAR "ESTA CONTA TEM TALÃO DE CHEQUE"; (2) SÓ CONTAS COM TALÃO APARECEM NO SELETOR DE "LANÇAR CHEQUE"; (3) CADA CONTA GANHA GESTÃO DE TALÕES (Nº DO CHEQUE INICIAL + QTD DE FOLHAS) COM GRADE FOLHA-A-FOLHA — USADA / DISPONÍVEL / PERDIDA / CANCELADA — PRA SABER NA HORA SE EXISTE FOLHA PERDIDA. SCHEMA ADITIVO (1 COL + 1 TABELA VIA SELF-HEAL) + 3 BACKENDS + 3 FRONTS · ADITIVO · ZERO ALTER/DROP/DELETE DESTRUTIVO.** Pedido (usuário): rastreabilidade total dos cheques — saber quais folhas já foram usadas e, principalmente, se alguma se PERDEU; só contas com talão devem aparecer ao lançar cheque. SCHEMA (`drizzle/schema.ts`): `companyBankAccounts.temTalao` (`smallint` default 0) + nova tabela `financialChequeTaloes` (`financial_cheque_taloes`: numero_inicial/quantidade_folhas/numero_final, `folhas_status_json` só com EXCEÇÕES manuais, soft-delete `excluido_em`); SELF-HEAL em `server/_core/index.ts` (`ADD COLUMN IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS` + índices). BACKEND: `folhaPagamento.ts` (criar/atualizarContaBancaria aceitam `temTalao`), `financial.ts` (`getBankAccounts` traz `temTalao`), `cheques.ts` (procedures `listarTaloes`/`criarTalao`/`atualizarTalao`/`marcarFolha`/`excluirTalao`, TODAS com `assertCompanyAccess` + guard anti-IDOR; folha "usada" é DERIVADA cruzando `financial_cheques.numero_cheque` por `${contaId}:${nº}`; `marcarFolha` bloqueia marcar como perdida/cancelada uma folha com cheque emitido). FRONT: `ContasBancarias.tsx` (checkbox + badge + botão "Talões"), novo `financeiro/TaloesDialog.tsx` (grade colorida + marcar folha + AlertDialog de exclusão), `FinanceiroCheques.tsx` (`contaOpts` filtra `temTalao===1`). Moeda BRL. RESSALVA: re-publicar; tabela se auto-cria no boot via self-heal. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3342** — **FINANCEIRO / DASHBOARD DE CHEQUES · CORREÇÃO: CHEQUES JÁ COMPENSADOS (COM DATA DE COMPENSAÇÃO, MAS COLUNA `status` AINDA "PENDENTE") NÃO APARECIAM COMO "COMPENSADO" NOS GRÁFICOS — CAÍAM EM "PENDENTE" NA PIZZA E NO EMPILHADO. AGORA O DASHBOARD USA O MESMO STATUS EFETIVO DA TELA "CONTROLE DE CHEQUES" (status="compensado" OU dataCompensacao preenchida ⇒ COMPENSADO). 100% FRONT · BUGFIX · READ-ONLY · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `DashCheques.tsx`: helper `statusEf(c)` espelha `jaCompensado = status==="compensado" || !!dataCompensacao`; pizza (`porStatus`) e empilhado (`statusKeys`/`evolStatus`) passam a agregar client-side por `statusEf`; filtros de clique idem. Detalhe: `shared/changelog.ts`.

- **Rev. 3341** — **FINANCEIRO / DASHBOARD DE CHEQUES · GRÁFICO "EVOLUÇÃO MENSAL POR STATUS": CORES FIXAS POR SITUAÇÃO (PENDENTE=VERMELHO, COMPENSADO=VERDE, INDEFINIDO=ÂMBAR) + CLIQUE NO SEGMENTO ABRE OS CHEQUES DAQUELE MÊS NAQUELA SITUAÇÃO + EIXO X RESPONSIVO (TODOS OS MESES VISÍVEIS). MESMAS CORES NA PIZZA "CHEQUES POR STATUS". 100% FRONT · UX/BUGFIX · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Pedido (usuário, no iPad): "Pendente vermelho, compensado verde, âmbar p/ indefinido; gráfico responsivo; clicar p/ ver as informações". RAIZ: o empilhado colorava por `PALETTE[i % n]` (cor dependia da ORDEM dos status); clique só no MÊS inteiro; eixo X escondia meses. CORREÇÃO (`client/src/pages/financeiro/dashboards/DashCheques.tsx`): helper `statusColor(s)` (`pend`→#ef4444, `compens`→#16a34a, `indefin`/vazio→#f59e0b); cada `<Bar>` usa `statusColor(k)` + `onClick` próprio (mês+situação); eixo X `interval={0}`; pizza colore via `statusColor`. Detalhe: `shared/changelog.ts`.

- **Rev. 3340** — **FINANCEIRO / DASHBOARD DE CARTÃO DE CRÉDITO · NOVA SEÇÃO "ANÁLISE DETALHADA DAS FATURAS — ITENS" NO DASHBOARD (`/financeiro/dashboards/cartao`): MAPEIA CADA LANÇAMENTO (COMPRAS, ENCARGOS/IOF/JUROS/ANUIDADE, CRÉDITOS), CRUZA OS MESMOS LOCAIS DE COMPRA, MOSTRA "ONDE MAIS GASTAMOS" (TOP POR VALOR + POR CIDADE), PERFIL DE PARCELAMENTO, ENCARGOS POR NATUREZA E GASTO POR OBRA/CATEGORIA. 1 BACKEND (READ-ONLY, +2 CORTES) + 1 FRONT · ADITIVO · ZERO SCHEMA/ALTER/DROP/DELETE.** A aba "Gerencial" (Rev. 3332) já agregava itens DENTRO de `/financeiro/cartao`; faltava trazer a análise por ITEM pro DASHBOARD. `server/routers/cartao.ts` (`analiseGerencial` READ-ONLY) ganhou `maioresEstabelecimentos` (top 20 por valor) + `porCidade`; `DashCartao.tsx` ganhou seção com 5 KPIs, pizza de composição, evolução compras×encargos, "onde mais gastamos"/"por cidade", locais recorrentes, encargos por natureza, perfil de parcelamento e por obra/categoria. Detalhe: `shared/changelog.ts`.

- **Rev. 3339** — **RH / DASHBOARD "CUSTO DE DEMISSÃO EM MASSA" (CDM) · CORREÇÃO: O "CUSTO TOTAL" DOS MEMBROS DA CIPA AGORA INCLUI A INDENIZAÇÃO DO PERÍODO DE ESTABILIDADE (SÚMULA 396 TST) + EMPREGADOS JÁ EM "AVISO" SÃO EXCLUÍDOS DA SIMULAÇÃO. 1 BACKEND (READ-ONLY) + 1 FRONT · BUGFIX/ADITIVO · ZERO SCHEMA/ALTER/DROP/DELETE.** A tag "CIPA" (Rev. 1936) era só VISUAL; como o CDM simula sempre dispensa pelo empregador, demitir cipeiro com estabilidade vigente gera custo adicional (`calcularIndenizacaoEstabilidade`) que não entrava no `total`; `activeWhere` também não excluía `status='Aviso'`. `server/routers/dashboards.ts` (`getDashCustoDemissaoMassa`) soma a indenização ao `total` (propaga p/ TOTAL/KPI/sort/combo); `DashAvisoPrevio.tsx` ganhou sub-linha "+estab", tooltip CIPA e card "INDENIZAÇÃO DE ESTABILIDADE". Detalhe: `shared/changelog.ts`.

- **Rev. 3338** — **FINANCEIRO / DASHBOARD DE CONCILIAÇÃO BANCÁRIA · NOVA COLUNA "SALDO (R$)" NA TABELA "CONCILIAÇÃO POR CONTA BANCÁRIA" (DETAIL DIALOG), = ENTRADAS − SAÍDAS POR CONTA, COLORIDA (VERDE=POSITIVO, VERMELHO=NEGATIVO) + LINHA DE TOTAL NO RODAPÉ CONSOLIDANDO O SALDO GERAL — PRA VER DE RELANCE SE O PERÍODO FECHOU POSITIVO OU NEGATIVO. 100% FRONT · ADITIVO · READ-ONLY · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `client/src/pages/financeiro/dashboards/DashConciliacao.tsx`: nova coluna `saldo` em `COLS` (logo após "Saídas (R$)") com `formatBRL` colorido (verde/vermelho/cinza, `tabular-nums`); cada linha de `detalheContas` ganhou `saldo: valorEntradas − valorSaidas`; `<DetailDialog totalKey="saldo">` soma o saldo geral no rodapé sticky. Reusa `getConciliacaoReport`. Detalhe: `shared/changelog.ts`.

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
