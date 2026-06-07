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

- **Rev. 2857** — **DATABOOK DE OBRA — "GERAR DATABOOK COMPLETO" / "FASE 1 DE 3: IMPORTAR MATERIAIS DE OCs" FALHAVA COM ERRO DE INSERT (`eap_codigo` ESTOURANDO varchar(100)).** Sintoma (print iPad — image_1780843904157.png, obra "QIU 2 - FASE 4"): Fase 1 abortava com `Failed query: INSERT INTO databook_fichas (...)`, com `eap_codigo` ($12) virando lista GIGANTE de códigos unidos por ", ". CAUSA-RAIZ (`server/routers/databook.ts`): ao CONSOLIDAR produtos repetidos por hash, o dedup acumulava TODOS os EAPs e gravava `eapList.join(", ")` numa coluna `varchar(100)` → Postgres rejeitava o INSERT inteiro ("value too long for type character varying(100)"). FEITO (SÓ código): NOVO helper `joinEapCodigos(list)` que junta o MÁXIMO de códigos INTEIROS ≤100 chars + sufixo " +N" se sobrar; usado no merge do dedup e como salvaguarda final no INSERT (também trunca `insumo_codigo` a 100). SEM ALTER TABLE (clamp do valor ao tamanho da coluna). ZERO ALTER/DROP/DELETE; ZERO schema; só backend. Detalhe: `shared/changelog.ts`.
- **Rev. 2856** — **CADASTRO DO COLABORADOR — ABA "UNIFORME / EPI" GANHA LAYOUT MODERNO, COLORIDO E INTERATIVO (CARTELAS COM CHIPS TOCÁVEIS), MANTENDO O PADRÃO INSTITUCIONAL FC (REGRA DE OURO).** Pedido (print iPad — image_1780843821310.png): "layout moderno, com cores, visual interativo e prático para facilitar o preenchimento, mantendo o padrão da regra de ouro". FEITO (`Colaboradores.tsx`, SÓ frontend): NOVA config module-level `EPI_CARDS` (3 cartelas Calçado/Camisa/Calça com ícone Footprints/Shirt/Ruler, emoji, acento sky/emerald/amber e classes Tailwind LITERAIS — sem concat dinâmica). Aba REDESENHADA: faixa FC no topo (gradiente #1B2A4A→#2c4470, caixa-alta letter-spacing, `printColorAdjust:exact`); 3 CARTELAS com cabeçalho colorido + selo do valor; grade de CHIPS tocáveis (`<button>`) que destacam o ativo (fill+scale-105) e ALTERNAM (tocar de novo limpa) + botão "Limpar/Não informado" + RESUMO em pills. Os `Select`/`TAMANHO_NONE` da Rev. 2855 foram REMOVIDOS; persistência via `set(card.key, valor|"")` inalterada (match com `.toUpperCase()`). ZERO ALTER/DROP/DELETE; ZERO schema; só UI. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2855** — CADASTRO DO COLABORADOR — TAMANHOS DE EPI/UNIFORME VIRAM ABA PRÓPRIA COM LISTAS PRONTAS (DROPDOWN), SEM DIGITAÇÃO LIVRE. FEITO (`Colaboradores.tsx`, SÓ frontend): NOVA ABA "🦺 Uniforme / EPI" (entre Profissional e Bancário); 3 inputs de texto viraram `Select` com LISTAS PRONTAS module-level (`TAMANHOS_CALCADO` 33–48, `TAMANHOS_CAMISA` PP…EXG, `TAMANHOS_CALCA` 36–58 par) + "— Não informado —" (sentinel `TAMANHO_NONE`→""). SEM schema/backend: colunas/whitelist da Rev. 2854 intactos. ZERO ALTER/DROP/DELETE; só UI. Detalhe: `shared/changelog.ts`.

- **Rev. 2854** — CADASTRO DO COLABORADOR — TAMANHOS DE EPI/UNIFORME (CALÇADO, CAMISA E CALÇA) + GRADE DE TAMANHOS PARA MAPEAR COMPRA E ESTOQUE. SCHEMA (`employees`): NOVAS colunas `tamanhoCalcado`/`tamanhoCamisa`/`tamanhoCalca` (varchar 10) + self-heal `[SyncSchema+]` (`ADD COLUMN IF NOT EXISTS`); whitelist `updateEmployee`; FORM com 3 campos + ficha de impressão; NOVO "Grade de Tamanhos" (Dialog agregando ativos por tamanho). ZERO ALTER destrutivo/DROP/DELETE; schema ADITIVO. Detalhe: `shared/changelog.ts`.

- **Rev. 2853** — RAIO-X DO FUNCIONÁRIO — NOVOS INDICADORES DE DESEMPENHO: ATRASOS, OBRAS GERIDAS (SE GESTOR), AVALIAÇÃO INTERNA E AVALIAÇÃO DO CLIENTE. BACKEND (`controleDocumentos.ts`, `docs.raioX`): NOVO bloco `desempenho` (após guard LGPD, escopo `companyId`) — `atrasos` {total,totalMinutos}, `obrasGeridas` (`responsavelId==employeeId`)+`isGestor`, `avaliacaoCliente` (`clienteAvaliacoes` cruzada por obra OU `ilike(gestorNome, nome)`), médias + histórico (`.limit(200)`). FRONTEND (`RaioXFuncionario.tsx`): +4 KPI cards + NOVA aba "Desempenho". ZERO ALTER/DROP/DELETE; ZERO schema; read-only. Detalhe: `shared/changelog.ts`.

- **Rev. 2852** — CONTROLE DE REVISÕES — AUTO-REGISTRO DE TODA REVISÃO (1879→ATUAL) QUE FALTAVA NA TELA (O ARRAY CONGELOU NA 1878). NOVO parser `server/changelogJsdoc.ts` (`parseChangelogJsdoc()` lê o próprio `changelog.ts` via fs); `syncRevisions.ts` usa SÓ o parser (não importa mais o array de ~4.6MB → OOM), insere ausentes em LOTES de 100; `db.ts` ganhou `getRegisteredRevisionVersions()` + `createRevisionsBulk()`. BACKFILL: 973 revisões (1495→2468). Go-forward: auto-registra no startup (bloco JSDoc + bump). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2851** — PORTAL DO CLIENTE — CONTROLE GRANULAR DE QUAIS OBRAS CADA USUÁRIO (CREDENCIAL) DO CLIENTE PODE VER, 100% GERENCIÁVEL PELO ADMIN. NOVA coluna `portal_credentials.obras_liberadas` (TEXT JSON array; NULL=todas, `[]`=nenhuma, `[ids]`=só essas) + self-heal `[SyncSchema+]`; `portalExterno.ts` faz ENFORCEMENT nos 7 pontos com escopo de obra + endpoints admin `setObrasLiberadasCliente`/`obrasDoClienteAdmin`; `ClientesPortalAdmin.tsx` ganha modal "Obras" por usuário. ZERO ALTER destrutivo/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
