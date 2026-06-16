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

- **Rev. 3143** — **FINANCEIRO / LANÇAMENTOS · NOVA AÇÃO EM LOTE "EXCLUIR" NA BARRA DE SELEÇÃO — DÁ PARA APAGAR TODOS OS LANÇAMENTOS SELECIONADOS DE UMA VEZ (NÃO EFETIVADOS), SEM IR DE LIXEIRA EM LIXEIRA.** PEDIDO (iPad): "quero poder apagar todos lançamentos quando selecionar". CONTEXTO: a barra de seleção (sempre ativa desde a Rev. 3141) só tinha "Dar baixa", "Cancelar baixa" e "Limpar" — excluir um lote grande exigia clicar a lixeira de cada linha. CORREÇÃO: NOVA `financial.bulkDelete` em `server/routers/financial.ts` que ESPELHA o `deleteEntry` single — hard-delete SÓ dos não efetivados (`status NOT IN ('pago','recebido')`; pagos/recebidos são pulados → usar "Cancelar baixa" antes). Mesmo padrão dos demais bulks: tenant-guard `_assertFinanceiroCompanyAccess`, `id IN (${inlineIds(idList)})` (evita o bug de array do `dbExecute`, Rev. 3142), `RETURNING id` p/ contar real, `createAuditLog` ("financial_entries_bulk_deleted") com motivo+contagem; input exige `motivo` mín. 5 chars. Frontend `FinanceiroLancamentos.tsx`: botão "Excluir (N)" (rose) + contador `selExcluiveis` + diálogo de confirmação com motivo obrigatório que avisa quantos pagos/recebidos serão ignorados. ZERO ALTER/DROP/SCHEMA — o DELETE de financial_entries não-efetivados já é a regra existente do `deleteEntry`. Detalhe: `shared/changelog.ts`.

- **Rev. 3142** — **FINANCEIRO / LANÇAMENTOS · CORRIGIDO O ERRO "cannot cast type record to integer" (DB code=42846) AO DAR BAIXA EM LOTE OU CANCELAR A BAIXA (ESTORNO) EM LOTE — A AÇÃO EM LOTE VOLTOU A FUNCIONAR.** PEDIDO (iPad, toast vermelho "Erro no estorno em lote — DB: code=42846 | msg=cannot cast type record to integer" ao clicar "Cancelar baixa (2)"): "está com erro na baixa do mês". CAUSA-RAIZ: `financial.bulkBaixa`/`bulkEstornar` (Rev. 3139) e `bulkUpdateStatus` (Rev. 1620) filtravam com `id = ANY($N::int[])` passando a lista de ids como ARRAY JS ao `dbExecute` — mas o template `sql` do Drizzle EXPANDE arrays JS numa lista de placeholders `$a, $b, $c`, então `ANY($N::int[])` virava `ANY($a, $b, $c::int[])` = `ANY(ROW(...))` → tenta converter `record` em `integer` → 42846. CORREÇÃO (BACKEND-ONLY; ZERO ALTER/DROP/DELETE/SCHEMA): em `server/routers/financial.ts` as TRÊS procedures trocaram `id = ANY($N::int[])` pelo padrão já comprovado `id IN (${inlineIds(idList)})` (helper que materializa inteiros já validados por `Number.isInteger`); `idList` saiu do array de params (placeholders restantes em ordem de aparição, como o `dbExecute` exige). Nenhuma lógica de baixa/estorno/tenancy/dados tocada. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3141** — **FINANCEIRO / LANÇAMENTOS · A SELEÇÃO MÚLTIPLA FICOU SEMPRE ATIVA — O CHECKBOX POR LINHA + A BARRA DE BAIXA/ESTORNO EM LOTE APARECEM DIRETO, SEM PRECISAR LIGAR O MODO "SELEÇÃO MÚLTIPLA".** `FinanceiroLancamentos.tsx` — estado `selecting`/botão de alternância REMOVIDOS; checkboxes, "Selecionar todos" e barra de ação (Dar baixa / Cancelar baixa / Limpar) renderizam SEMPRE. FRONTEND-ONLY; ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3140** — **RH / COLABORADORES · O MODAL "GRADE DE TAMANHOS (EPI)" ABRE EM TELA CHEIA.** `client/src/pages/Colaboradores.tsx` — o `<DialogContent>` da Grade ganhou o padrão de tela cheia comprovado (`resizable={false}` + classes que anulam a centralização base do Dialog) + estrutura flex-col (header/footer fixos, só o corpo rola). FRONTEND-ONLY; ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3139** — **FINANCEIRO / LANÇAMENTOS · BAIXA/ESTORNO EM LOTE (MULTI-SELEÇÃO) PARA AGILIZAR A CONCILIAÇÃO BANCÁRIA.** NOVOS `financial.bulkBaixa` (marca pago/recebido em lote só nos não-efetivados) e `financial.bulkEstornar` (reverte pago→a_pagar / recebido→a_receber em lote) + multi-seleção (checkbox + "Selecionar todos" + barra de ação) em `FinanceiroLancamentos.tsx`. Tenant-guard `_assertFinanceiroCompanyAccess`. ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3138** — **PORTAL DO CLIENTE / AVALIAÇÃO (NPS) · O LINK DE PESQUISA JÁ RESPONDIDO NÃO É MAIS "DESATIVADO": AO REABRIR, O CLIENTE VÊ "PESQUISA JÁ CONCLUÍDA · OBRIGADO!" EM VEZ DO TEXTO DE LIMITE MENSAL / "MÓDULO DESATIVADO".** O link público é de USO ÚNICO e NÃO é desativado; era problema de TEXTO (caía no card de limite por janela do portal logado). `shared/portalAvaliacaoI18n.ts` ganhou `concluidaTitulo`/`concluidaTexto` (pt/en/zh) e `PortalDashboardCliente.tsx` renderiza, em `isPublic`, o card "pesquisa concluída". ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3137** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O ERP LÊ O EXTRATO IMPORTADO E SUGERE AUTOMATICAMENTE, PARA CADA LINHA, O LANÇAMENTO QUE BATE — E CONCILIA EM LOTE DANDO BAIXA (PAGO/RECEBIDO) COM A DATA REAL DO EXTRATO.** NOVO READ-ONLY `financial.sugerirConciliacao` (valor centavos × direção × proximidade de data, greedy 1-pra-1, confiança alta/média) + NOVO `financial.conciliarSugestoes` (lote: marca conciliado + baixa com `data_pagamento`=data do extrato via COALESCE); `FinanceiroConciliacao.tsx` ganhou "Sugestões Automáticas". Tenant via `_assertFinanceiroCompanyAccess`. ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

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
