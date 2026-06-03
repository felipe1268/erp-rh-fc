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


- **Rev. 2729** — **PLANEJAMENTO · DETALHE DO PROJETO · REMOVIDA A ABA "PREVISTO" (tela "Previsto (Manual)" — upload manual de 1 XML do MS Project por semana). Pedido do usuário: "tire esta função, não precisamos mais".** A empresa usa o MOTOR (CAMINHO B) como fonte real do "% Previsto" (snapshot Texto10 regenerado em todo upload do XML), logo a aba Manual estava sem uso (o aviso da própria tela já dizia que a curva só usaria esses valores ao ativar Critérios do Sistema → Planejamento → Fonte do "% Previsto" → Manual). Solução (SÓ CLIENT/UI; ZERO SERVER/SCHEMA — R-001/R-007/R-010): `PlanejamentoDetalhe.tsx` — removidos o import de `AbaPrevistoManual`, o id `"previsto"` do type `Tab`, a entrada de `TAB_DEFS` (como `TAB_IDS`/`tabOrder` derivam dela, a aba some da navegação e ordens salvas em localStorage são filtradas por `TAB_IDS.includes`) e o bloco de render `aba === "previsto"`; arquivo órfão `AbaPrevistoManual.tsx` APAGADO. Endpoints tRPC `getPrevistoManual`/`salvarPrevistoManualSemana`/`limparPrevistoManualSemana` ficam intocados (sem chamadores; remoção de server fora do escopo). NÃO mexe no motor "% Previsto" (CAMINHO B), barras Previsto×Realizado, Curva S nem snapshot Texto10. Validação: Vite compila sem erro; esbuild server EXIT 0; `vitest server/rescisao.test.ts` verde. Detalhe: `shared/changelog.ts`.
- **Rev. 2728** — **FINANCEIRO · LANÇAMENTOS / NOVO LANÇAMENTO → TRANSFERÊNCIA (selects "Conta de Origem"/"Conta de Destino") · CORRIGE O BUG DE SELECIONAR UMA CONTA E MARCAR DUAS (ex.: Santander marcava a Caixa junto, 2 checkmarks) + LAYOUT QUE CORTAVA O NOME DA CONTA; inclui reparo de DADOS de ids duplicados em produção.** Causa-raiz (Neon): `company_bank_accounts` tem `id serial()` SEM PK/UNIQUE e a sequence `company_bank_accounts_id_seq` estava dessincronizada (`last_value=2` com `id=3` já existente) → todo INSERT reusava id existente. Empresa 60002 (única com contas; 5 linhas): `id=1` em 2 linhas idênticas da Caixa 0306/1596-0 (ambas soft-deletadas — o delete por `id=1` atingiu as 2); `id=2` colidindo entre Caixa-Guaratinguetá (22 lançamentos) e Santander (0 refs). value/key repetidos → Radix Select marca 2 itens; e a transferência (`id IN (origem,destino)` exigindo 2 linhas) quebrava. Solução DADOS (UPDATE+setval; ZERO ALTER/DROP/DELETE — R-001/R-007/R-010): Santander `id=2→4`, cópia duplicada da Caixa `id=1→5` (mantida deletada), Caixa original RESTAURADA (`deletedAt=NULL`, era a origem da transferência do usuário), `setval(seq,5)`. Estado final ids únicos: 1=Caixa, 2=Guaratinguetá, 3=Aparecida, 4=Santander, 5=cópia deletada. Solução CÓDIGO: `financial.ts` (`getBankAccounts`) filtra `deletedAt IS NULL AND ativo=1`; `FinanceiroLancamentos.tsx` grid `grid-cols-1 sm:grid-cols-2`, `min-w-0`, SelectTrigger `w-full min-w-0`, `SelectContent align="start"` + `max-w` (default `center` vazava p/ esquerda e era cortado pelo modal), item em `<span truncate>`. Validação: queries Neon (0 refs Santander; sem id ativo dup); esbuild server EXIT 0; `vitest server/rescisao.test.ts` verde. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2727** — RH · RAIO-X DO FUNCIONÁRIO / TIMELINE CRONOLÓGICA (`controleDocumentos.raioX`) · A MUDANÇA DE OBRA DO FUNCIONÁRIO AGORA FICA REGISTRADA NA TIMELINE (antes nunca aparecia). Causa: troca de obra grava em `employee_site_history`, mas a timeline só agregava `employee_history` (tabela diferente). Fix: `raioX` lê também `employee_site_history` (transferencia→"Mudança de Obra", alocacao→"Alocação", saida→"Saída"; dedup da saída-par; gestor_obra ignorado). SÓ SERVER; ZERO SCHEMA. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2726** — RH · RESCISÃO / HOME + AVISO PRÉVIO (card "Avisos Prévios em Andamento" × lista × ficha "Cálculos da Rescisão") · CORRIGE A DIVERGÊNCIA: o card/lista IGNORAVAM as férias vencidas que a ficha incluía (caso Mariana: card R$ 11.799,50 × subtotal R$ 19.391,67; diff R$ 7.592,17 = 1 férias vencida). Causa: `list`/`homeData` contam vencidas via query EM LOTE `(VALUES…) AS p(emp_id, data_fim)` com `data_fim` TEXT → Postgres lança `operator does not exist: date < text`, a query falha no try/catch e o mapa fica vazio (0 p/ todos). Fix: cast `p.data_fim::date` nas 2 comparações em `avisoPrevioFerias.ts` (`list`) e `homeData.ts`. SÓ SERVER; ZERO SCHEMA. `vitest` verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2725** — RH · RESCISÃO / HOME (Painel RH — card "Avisos Prévios em Andamento" × ficha "Cálculos da Rescisão") · CORRIGE DIVERGÊNCIA: o card da home e o "Total Estimado" liam coluna persistida/congelada (`valorEstimadoTotal`), diferente do "Subtotal Proventos" recalculado ao vivo. `avisoPrevioFerias.ts` exporta `diasFeriasNoMesDaSaida`; `getById` retorna `valorEstimadoTotal: previsao.total`; `homeData.ts` recalcula cada aviso ativo com a MESMA lógica do `list` (`recomputedTotalMap`, fallback p/ a coluna). SÓ SERVER; ZERO SCHEMA. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2724** — RH · RESCISÃO (Painel RH → "Cálculos da Rescisão") · CORRIGE O AVISO PRÉVIO TRABALHADO: (1) o rótulo do "Aviso Prévio Indenizado" passa a mostrar só os dias proporcionais excedentes indenizados (ex.: 6) em vez do total do aviso (ex.: 36); (2) o incremento da projeção (avos de férias/13º → Grupo B) deixa de incluir os dias trabalhados, que são competência real (Grupo A). `rescisaoCalc.ts` usa baseline = fim do aviso no trabalhado (Súmula 371/OJ 82 TST); `PainelRH.tsx` helper `diasAvisoIndenizadosLabel`. Nenhum total monetário muda. ZERO SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 2723** — RH · RESCISÃO (Painel RH → "Cálculos da Rescisão" → aba "Detalhes") · NOVO BLOCO "COMPOSIÇÃO DO CUSTO — PROVISIONADO x ADICIONAL DA DEMISSÃO": separa as verbas em 🟦 Grupo A (competência / já era custo da empresa) x 🟥 Grupo B (custo adicional da dispensa), com o "incremento da projeção do aviso" (avos extras de férias/13º) destacado no Grupo B; gating p/ tipo `empregador*` (pedido de demissão → tudo no Grupo A). ZERO SCHEMA. Detalhe: `shared/changelog.ts`.

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
