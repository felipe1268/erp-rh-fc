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

- **Rev. 2777** — **EPI · CORRIGIDO O TOTAL DE UNIDADES DO CARD "VALOR TOTAL EM ESTOQUE" (TELA "ESTOQUE POR OBRA"): MOSTRAVA UM NÚMERO GIGANTE SEM SENTIDO (ex.: "10130191981646164110158 unid.") — ERA CONCATENAÇÃO DE STRING EM VEZ DE SOMA.** Sintoma (usuário, print): ao lado de "9 local(is)", o total de unidades vinha como uma sequência enorme de dígitos colados (as quantidades de cada local grudadas). Causa-raiz (SÓ CLIENT) em `client/src/pages/Epis.tsx`: o `reduce` de `unidObras` fazia `s + (r.totalUnidades || 0)`, mas `r.totalUnidades` vem do `SUM()` do Postgres como STRING → `0 + "1013"` vira concatenação em JS; o `unidCentral` já usava `Number()`, só o `unidObras` faltava. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER): `unidObras` soma com `s + Number(r.totalUnidades || 0)`. ZERO ALTER/DROP/DELETE. Validação: HMR ok; architect. Detalhe: `shared/changelog.ts`.
- **Rev. 2776** — **EPI · A NUMERAÇÃO DA BOTA (Nº) E O TAMANHO DO UNIFORME (TAM.) AGORA APARECEM CLARAMENTE NA TABELA "ESTOQUE POR OBRA" DA TELA DE EPIs.** Pedido (usuário, print): na tabela de Controle/Estoque de EPIs (Obra · EPI · CA · Categoria · Quantidade · Valor Unit. · Valor Total · Status) ele queria ver, item a item, a numeração da bota (calçado) e o tamanho do uniforme — info que o EPI já tem cadastrada (`epis.tamanho`) mas não era trazida/exibida nessa tabela. Fix (SERVER+CLIENT; ZERO SCHEMA — só faltava trazer/exibir): `server/routers/epis.ts` (`estoqueObraList`) passou a retornar `tamanhoEpi: epis.tamanho`; `client/src/pages/Epis.tsx` — memo `centralItensList` carrega `tamanhoEpi`, e a célula do EPI ganhou 2ª linha "Nº X" (calçado) / "Tam. X" (uniforme/EPI), mesmo padrão do histórico de transferências (Rev. 2771); só renderiza quando há tamanho. Ressalva: itens sem `tamanho` continuam sem a 2ª linha. ZERO ALTER/DROP/DELETE. Validação: servidor sobe limpo; HMR ok; architect. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2775** — EPI · O "ESTOQUE CENTRAL" DO ERP AGORA SE CHAMA "ALMOXARIFADO CENTRAL" NA TELA DE EPIs — ACABOU A CONFUSÃO COM A OBRA REAL "ESCRITÓRIO CENTRAL" (do cadastro de Obras p/ alocar funcionários). Fix (SÓ LABEL; ZERO SCHEMA; `value="central"` intacto): rótulo "Escritório Central" → "Almoxarifado Central" em TODOS os pontos do conceito-central no `client/src/pages/Epis.tsx` (dropdown, card central, `centralItensList.nomeObra`, botões de entrega/transferência, badge do histórico, empty-state) e em `server/routers/epis.ts` (`listarTransferencias.origemNome`). A OBRA REAL "ESCRITÓRIO CENTRAL" MANTÉM o nome. Detalhe: `shared/changelog.ts`.

- **Rev. 2774** — LOGIN/INFRA · CORRIGIDO O "ERRO" AO ENTRAR (TELA DE LOGIN ESTOURAVA UM TEXTÃO DE QUERY): CAUSA REAL ERA `timeout exceeded when trying to connect` — O POOL NÃO ABRIA CONEXÃO COM O NEON NO 1º REQUEST APÓS HIBERNAÇÃO (deploy autoscale suspende → keep-alive não roda → Neon dorme → cold-start >5s estourava `connectionTimeoutMillis: 5000`). Fix (SÓ SERVER; ZERO SCHEMA/CLIENT): `server/db.ts` — timeout 5000→15000 + `keepAlive: true`; corrigido vazamento do interval keep-alive (handle único `_keepAliveTimer`); novo helper `withDbRetry(fn, attempts=3)`. `server/routers.ts` (`loginLocal`): busca do usuário roda dentro de `withDbRetry`, refazendo `getDb()` a cada tentativa. A query `translate` NÃO mudou. Detalhe: `shared/changelog.ts`.

- **Rev. 2773** — EPI · TELA "ESTOQUE POR OBRA": OS CARDS DAS OBRAS E O CARD DO ESCRITÓRIO/ALMOXARIFADO CENTRAL FICARAM CLICÁVEIS — AO CLICAR, A TABELA DETALHADA ABAIXO FILTRA E MOSTRA, ITEM A ITEM, O QUE ESTÁ NO ESTOQUE DAQUELE LOCAL. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/Epis.tsx`: memos `centralItensList` (deriva do catálogo `episAllList` qtd>0) + `tabelaEstoqueList` (decide a fonte: central/obra/todas); cards de obra E central com `onClick` toggle + `ring`; dropdown ganhou o central; `episAllQ.limit` 200→1000. Bug TDZ corrigido (state movido p/ antes dos memos). Detalhe: `shared/changelog.ts`.

- **Rev. 2772** — ALMOXARIFADO · NOVA VISÃO "📍 SALDO POR OBRA": MOSTRA, OBRA A OBRA, TODOS OS INSUMOS ALOCADOS NO ESTOQUE — PRA AFERIR DE RELANCE ONDE TEM SALDO E ONDE ESTÁ ZERADO. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/almoxarifado/index.tsx`: seletor ganhou "📍 Saldo por Obra" (`obraContexto="porObra"`) reusando `listarItensConsolidado` (ZERO endpoint novo); bloco INVERTE "item→almoxarifados[]" p/ "obra→insumos" (consolida `nome|unidade`), filtro de saldo, seções colapsáveis por obra, destaque vermelho p/ zerados. Hardening tRPC: payloads que derivam `obraId` usam guarda `typeof obraContexto === "number"`. Detalhe: `shared/changelog.ts`.

- **Rev. 2771** — EPI · HISTÓRICO DE TRANSFERÊNCIAS 100% RASTREÁVEL: A DESCRIÇÃO DO ITEM AGORA MOSTRA O TAMANHO (Nº DA BOTA / TAM. DA CAMISA), A DATA GANHA HORA E APARECE O USUÁRIO QUE FEZ A TRANSFERÊNCIA. Constatação: o backend JÁ persistia tudo (`epi_transferencias.criadoPor`/`criadoPorUserId`/`createdAt` COM hora gravados no `transferir`); só faltava trazer/exibir. Fix (SERVER+CLIENT; ZERO SCHEMA): `listarTransferencias` traz `tamanhoEpi`/`categoriaEpi`/`criadoPorUserId`; `Epis.tsx` ganhou coluna "Data / Hora" (`createdAt`), 2ª linha com tamanho na descrição e coluna "Usuário". Ressalva: transferências antigas sem dados mostram "—" (sem backfill — R-001/R-007/R-010). Detalhe: `shared/changelog.ts`.

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
