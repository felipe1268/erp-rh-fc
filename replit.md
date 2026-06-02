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


- **Rev. 2696** — **FROTA · "IMPORTAR OS COM IA" (`/frotas/manutencoes` → "Importar OS (IA)") · CORRIGIDO O ERRO `Unterminated string in JSON at position NNNN` QUE QUEBRAVA A IMPORTAÇÃO QUANDO A OS ERA EXTENSA (MUITOS ITENS / DESCRIÇÕES LONGAS).** Pedido (usuário, print com toast "Erro: Unterminated string in JSON at position 4816"): "está dando este erro quando faço importação". Causa-raiz: `parseMaintenanceOS` chamava `invokeAnthropicVision` com `maxTokens: 2048`; em OSs longas o modelo estourava o teto e a resposta vinha CORTADA no meio de uma string → `JSON.parse` falhava. Fix (SÓ SERVER; ZERO SCHEMA/CLIENT — R-001/R-007/R-010): `server/routers/frotas.ts` — (1) `maxTokens` 2048→8192; (2) novo helper `salvageTruncatedOS(text)` que, quando o parse falha, varre o array `"items"` com chaves balanceadas (respeitando strings/escapes), mantém só os objetos que FECHARAM e remonta resultado válido (`confidence:"baixa"`) — OS truncada ainda importa os itens completos; (3) se nem o 1º item fechou, mensagem amigável. esbuild EXIT 0. Detalhe: `shared/changelog.ts`.
- **Rev. 2695** — **FROTA · "IMPORTAR OS COM IA" (`/frotas/manutencoes` → botão "Importar OS (IA)") · AGORA DÁ PRA ANEXAR VÁRIOS PDFs/FOTOS DE ORDENS DE SERVIÇO DE VÁRIOS CARROS DE UMA VEZ; A IA LÊ CADA ARQUIVO, EXTRAI OS DADOS (VEÍCULO, SERVIÇOS, CUSTOS, FORNECEDOR) E JUNTA TUDO NUMA ÚNICA LISTA PARA CONFERÊNCIA E CADASTRO EM LOTE.** Pedido (usuário): poder anexar vários PDFs de vários carros de uma vez, ler com IA e cadastrar corretamente. Solução (SÓ CLIENT/UI; ZERO SCHEMA/SERVER — `frotas.parseMaintenanceOS` já lê 1 arquivo → vários itens, bastou orquestrar o loop no cliente): `client/src/pages/frotas/Manutencoes.tsx` — estado `osFile`/`osPreview` virou `osFiles: File[]`; novos `osProcessing` (dirige a barra no lugar de `parseMut.isPending`) e `osCurrentFile` (`{idx,total,name}`); `handleOsFileChange` aceita múltiplos (`<input multiple>`), valida cada (tipo/10MB) e faz append com dedup `name__size`; helper `fileToBase64`; `processOS` itera os arquivos em sequência (progresso fatiado por arquivo), agrega itens em `allItems` (cada item ganha `__file`) e coleta `fileErrors`; `osParsed = {items, fileErrors, confidence}`. UI: dropzone "vários PDFs/fotos" + "Escolher Arquivos"; lista de arquivos (remover individual + "Adicionar mais"); barra de progresso com label "Analisando X de N: nome"; badge do arquivo de origem por item; bloco âmbar resume arquivos sem itens. `saveOSItems` idêntico; resets → `setOsFiles([])`. vite/tsc EXIT 0. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2694** — ALMOXARIFADO · EMPRÉSTIMO DE FERRAMENTAS/EQUIPAMENTOS (`/almoxarifado` → "Emprestar Ferramenta" → "CONFIRMAR EMPRÉSTIMO") · CORRIGIDO O ERRO `column "foto_devolucao_url" of relation "warehouse_loans" does not exist` QUE IMPEDIA REGISTRAR EMPRÉSTIMOS EM PRODUÇÃO. Causa-raiz: as colunas da Rev. 2256 (`foto_devolucao_url`, `equipamento_proprio_id`, `equipamento_locado_id`) entraram no `drizzle/schema.ts` mas nunca ganharam guard `ADD COLUMN IF NOT EXISTS` no `[SyncSchema+]`; o INSERT do Drizzle lista todas as colunas do schema → 42703 no Neon de PROD. Fix (SÓ SELF-HEAL; ZERO ALTER/DROP/DELETE DESTRUTIVO — R-001/R-007/R-010): `server/_core/index.ts` — bloco `Rev. 2694` com 3× `ALTER TABLE warehouse_loans ADD COLUMN IF NOT EXISTS`. NECESSÁRIO PUBLICAR. Detalhe: `shared/changelog.ts`.

- **Rev. 2693** — FINANCEIRO · NOVO LANÇAMENTO (`/financeiro/lancamentos` → "Novo Lançamento" → tipo "Transferência") · A ABA "TRANSFERÊNCIA" GANHOU FLUXO PRÓPRIO E ENXUTO PARA REGISTRAR TRANSFERÊNCIAS ENTRE CONTAS, LANÇANDO AS 2 PERNAS (SAÍDA+ENTRADA) DE UMA VEZ JÁ COMO PAGAS E CONCILIANDO JUNTAS. Grava 2 `financial_entries` `tipo='transferencia'`/`status='pago'` ligadas por `transferencia_grupo_id` (UUID), fora de Pagar/Receber/Fluxo/DRE/KPIs. Fix (1 COLUNA READ-ONLY VIA SELF-HEAL + SERVER + CLIENT; ZERO ALTER/DROP/DELETE): `drizzle/schema.ts`+self-heal `server/_core/index.ts`; `server/routers/financial.ts` (`createEntry`/`conciliarLancamento`); `server/services/cfoPhase2.ts`; `client/.../FinanceiroLancamentos.tsx`. Bônus: `getEntries` `42601` (COUNT usava `conds.slice(0,-0)`) → `conds.join(" AND ")`. Detalhe: `shared/changelog.ts`.

- **Rev. 2692** — FINANCEIRO · CONTAS A PAGAR (`/financeiro/contas-a-pagar` → aba "Pagos" → "Estornar") · CORRIGIDO O ERRO `22P02 | invalid input syntax for type integer: "<nome do usuário>"` AO ESTORNAR (DESFAZER A BAIXA) DE UMA CONTA JÁ PAGA. Causa-raiz: o helper `dbExecute` liga os parâmetros pela ORDEM DE APARIÇÃO do `$N` (ignora o número); no UPDATE os placeholders apareciam `$3,$4,$1,$2` mas o array era `[id, companyId, name, motivo]` → o `WHERE id=` recebia o NOME. Fix (SÓ SERVER; ZERO SCHEMA — R-001/R-007/R-010): `server/routers/financial.ts` (`estornarPagamento`) — renumerei placeholders p/ ordem de aparição e reordenei o array p/ `[name, motivo, id, companyId]`. esbuild EXIT 0. Detalhe: `shared/changelog.ts`.

- **Rev. 2691** — FROTA · VEÍCULOS (`/frotas/veiculos` → "Editar Veículo" / "Consolidar Cadastro" e aviso "Cadastros Pendentes") · CORRIGIDO O ERRO `column "kmAtual" does not exist` AO SALVAR/CONSOLIDAR VEÍCULO E LISTAR PENDENTES. Causa-raiz: 3 queries SQL cruas selecionavam `"kmAtual"` (camelCase, case-sensitive no Postgres) mas a coluna física é `km_atual`. Fix (SÓ SERVER; ZERO SCHEMA — R-001/R-007/R-010): `server/routers/frotas.ts` — `getVehiclesWithPendingRegistration`, `getVehiclesPendingRegistration` e `consolidateVehicleRegistration` trocam `"kmAtual"` por `km_atual AS "kmAtual"` (alias preserva a chave lida por `checkVehicleRegistration`). esbuild EXIT 0. Detalhe: `shared/changelog.ts`.
- **Rev. 2690** — FROTA · VEÍCULOS (`/frotas/veiculos`) · NOVO MODO "SELECIONAR" PARA MARCAR VÁRIOS VEÍCULOS DE UMA VEZ (CHECKBOX EM CADA CARD + "SELECIONAR TODOS") E ALTERAR O STATUS DE TODOS OS SELECIONADOS EM LOTE (ATIVO / EM MANUTENÇÃO / INATIVO / VENDIDO) NUMA ÚNICA AÇÃO. Fix (SÓ CLIENT/UI; ZERO SCHEMA — reusa `frotas.updateVehicle`): `client/src/pages/frotas/Veiculos.tsx` — botão "Selecionar" (toggle `selectMode`); cada card clicável c/ `Checkbox`+`ring` ciano; barra sticky "Selecionar todos"+contador+`Select` status+"Aplicar"; `applyBulkStatus()` itera IDs via `updateVehicle` (guard de obra respeitado) + `refetch`/toast. Detalhe: `shared/changelog.ts`.


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
