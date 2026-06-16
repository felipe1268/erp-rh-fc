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

- **Rev. 3169** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · NOVO BOTÃO "CONSOLIDAR {MÊS}" / "DESCONSOLIDAR {MÊS}" QUE FECHA OU REABRE O MÊS INTEIRO DE UMA VEZ — MARCANDO/DESMARCANDO TODAS AS LINHAS DO EXTRATO DA CONTA+PERÍODO COMO CONCILIADAS (BOLINHA DO MÊS VIRA VERDE/"CONSOLIDADO" OU VOLTA A "COM LANÇAMENTO").** PEDIDO: "quero um botão para consolidar e desconciliar o mês". BACKEND (`server/routers/financial.ts`, tenant-safe): `consolidarMes({companyId,contaBancariaId,dataInicio,dataFim})` faz `UPDATE bank_statement_lines SET conciliado=1` nas linhas pendentes do período (só o flag da linha, não toca `financial_entries`); `desconsolidarMes(...)` reabre — reverte SÓ o flag de conciliação dos lançamentos vinculados (`conciliado=0, data_conciliacao=NULL`, preservando status/valor/baixa) e zera `conciliado`/`entry_id` das linhas. FRONTEND (`FinanceiroConciliacao.tsx`): botão toggle no header (ao lado de "Importar Extrato") que só aparece com CONTA + MÊS específico não-vazio; "consolidado"→"Desconsolidar {Mês}" (`RotateCcw`), senão "Consolidar {Mês}" (verde, `CheckCircle`); repinta extrato + bolinhas (`refetchSt`/`refetchStAno`). ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3168** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · A SELEÇÃO DA CONTA DEIXOU DE SER UM DROPDOWN ("SELECIONE A CONTA...") E PASSOU A SER UMA GRADE DE CARDS CLICÁVEIS — UM CARD POR CONTA, COM ÍCONE/COR DO BANCO, NOME + DESCRIÇÃO E AGÊNCIA/CONTA VISÍVEIS DE UMA VEZ; CLICAR SELECIONA (CHECK AZUL) E CLICAR DE NOVO LIMPA.** PEDIDO: "melhore a apresentação das contas, coloque em cards, para facilitar". Antes a conta era escolhida por um `<Select>` que escondia as 8 contas da FC atrás de um clique. MUDANÇA (FRONTEND-ONLY `client/src/pages/financeiro/FinanceiroConciliacao.tsx`): o dropdown "Conta Bancária" virou um grid responsivo (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) de `<button>`s-card; cada card tem avatar `Landmark` colorido por banco (helper `bancoCor` — Caixa=azul, Santander=vermelho, Itaú=laranja, Bradesco=rosa, BB=amarelo, senão cinza), nome (+ ` · descrição/tipo`) e `Ag. {agencia} / {conta}` em mono; card selecionado ganha realce azul + check; reclicar limpa (`setContaBancariaId("")`). MESMO estado `contaBancariaId` — queries/bolinhas/importação/conciliação intactos; filtro "Status" mantido abaixo; estado vazio adicionado. Imports `Landmark`+`Check`. ZERO SCHEMA/ALTER/DROP/DELETE · ZERO BACKEND. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3167** — **CADASTRO · "CONTAS BANCÁRIAS" (RH&DP) · CORRIGIDO O BUG EM QUE A TELA MOSTRAVA "NENHUMA CONTA BANCÁRIA CADASTRADA" (0 CONTAS) MESMO COM A FC ENGENHARIA SELECIONADA — ENQUANTO O DROPDOWN DO FINANCEIRO LISTAVA AS 8 CONTAS.** CAUSA-RAIZ: `folha.listarContasBancarias` lê tb `financial_opening_balances` (self-heal snake_case `company_id`/`created_at`), mas o schema Drizzle declarava `companyId: integer()`/`createdAt: timestamp()` SEM nome explícito (sem `casing` global) → Drizzle emitia `"companyId"` inexistente → endpoint estourava → tela vazia. FIX (SCHEMA-MAPPING ONLY `drizzle/schema.ts`): `integer("company_id")` + `timestamp("created_at",{...})`. ZERO SCHEMA/ALTER/DROP/DELETE no banco. Detalhe: `shared/changelog.ts`.

- **Rev. 3166** — **USUÁRIOS E PERMISSÕES · O RÓTULO "DESLIGADO" / "ACESSO DESLIGADO" VIROU "INATIVO" / "ACESSO INATIVO" NA TELA (SÓ TEXTO — O VALOR DE STATUS `"desligado"` NO BANCO/BACKEND CONTINUA INTACTO) E O CABEÇALHO DO PAINEL DE DETALHE DO USUÁRIO GANHOU UM LAYOUT MAIS LIMPO.** FRONTEND-ONLY `Usuarios.tsx`: renomeação só de strings exibidas (badge/pill/confirm) preservando comparações `status==="desligado"` e o valor gravado; cabeçalho do detalhe envolvido num card com avatar maior, pill de status (verde "Ativo"/vermelho "Inativo") e ações agrupadas à direita. ZERO SCHEMA/ALTER/DROP/DELETE · ZERO BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3165** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O FILTRO DE PERÍODO DEIXOU DE SER DOIS CAMPOS DE DATA E PASSOU A USAR O MESMO SELETOR-PADRÃO DE MÊS/ANO DO RESTANTE DO FINANCEIRO (‹ ANO ›, "ANO TODO", CHIPS JAN–DEZ COM BOLINHAS DE STATUS).** FRONTEND-ONLY `FinanceiroConciliacao.tsx`: removidos os 2 `<Input type="date">`+`getDefaultDates()`; estado `ano`+`mesSel` (`null`="Ano todo") deriva `dataInicio`/`dataFim` via `useMemo` (mesma assinatura das queries); UI replica o bloco do Lançamentos (Rev. 3133); bolinhas por mês via `getBankStatements` do ano (cinza/verde/azul). ZERO SCHEMA/ALTER/DROP/DELETE · ZERO BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3164** — **FINANCEIRO / LANÇAMENTOS · OS PAGAMENTOS DE PJ PASSARAM A SEGUIR A MESMA LÓGICA DA FOLHA — UMA ÚNICA LINHA POR MÊS COM O TOTAL DAS MEDIÇÕES PJ PAGAS; CLICAR ABRE O DIÁLOGO COM CADA PAGAMENTO (ADIANTAMENTO/FECHAMENTO) RASTREÁVEL POR CONTRATADO E DATA.** Agrupamento SÓ no FRONTEND (`FinanceiroLancamentos.tsx`, engine da Frota generalizada `agrupar`/`grupo*`+`groupKind:"frota"|"pj"`; PJ ficam entries INDIVIDUAIS no banco p/ não quebrar baixa por item); backend READ-ONLY `financial.ts·getEntries` ganhou `pjFornecedor` via LEFT JOIN `pj_payments`+`employees` (1:1 por PK + guarda de company). ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3163** — **FINANCEIRO / LANÇAMENTOS · FECHADA A ÚLTIMA PORTA DO LANÇAMENTO AUTOMÁTICO DE RECEITA — createRevenue NÃO DERRUBA MAIS A RECEITA NO CONTAS A RECEBER; NASCE SÓ COMO PREVISTO (financial_revenue) E SÓ VIRA LANÇAMENTO QUANDO O USUÁRIO CONFIRMA EM "RECEBÍVEIS PREVISTOS".** `financial.ts`: `createRevenue` perdeu o INSERT automático em `financial_entries` (mantém só `financial_revenue`, fonte dos previstos); `registrarRecebimento` (caminho `frId`) ganhou INSERT...WHERE NOT EXISTS que cria o lançamento 'recebido' se faltar (idempotente). ZERO SCHEMA/ALTER/DROP/DELETE · ZERO FRONTEND. Detalhe: `shared/changelog.ts`.

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
