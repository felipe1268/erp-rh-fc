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

- **Rev. 2929** — **CONTROLE DE EPIs · ESTOQUE POR OBRA — CLICAR NUMA LINHA DO ALMOXARIFADO CENTRAL (FILTRO "CENTRAL") NÃO ABRE MAIS O AJUSTE DE OBRA: VAI DIRETO AO CATÁLOGO CENTRAL.** Code review da Rev. 2928: a tabela "Estoque por Obra" reaproveita o grid para mostrar as linhas do Central (filtro "central"), que são SINTÉTICAS com `id:"central-<epiId>"` (string) e `obraId:"central"`. Na 2928 o clique/lápis passaram a chamar `epis.ajustarEstoqueObra` (input `id:z.number()`) → numa linha central o `id` é string "central-N" → tRPC rejeitaria a mutation, e "Ajustar estoque na obra" não fazia sentido ali. SOLUÇÃO (FRONT-only, `client/src/pages/Epis.tsx`): clique na linha com `e.obraId==="central"` abre o CATÁLOGO CENTRAL (`viewMode='editar_epi'`); lápis "Ajustar estoque na obra" só renderiza quando `e.obraId!=="central"`; botão Package "Editar cadastro do EPI" continua em ambas. Sem backend/schema. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2928** — **CONTROLE DE EPIs · ESTOQUE POR OBRA — A CAIXA DA OBRA FICOU INDEPENDENTE DO ALMOXARIFADO CENTRAL: EDITAR A QUANTIDADE NUMA OBRA NÃO MEXE MAIS NO CENTRAL, E A TRANSFERÊNCIA FICOU ATÔMICA (À PROVA DE SALDO CORROMPIDO).** Pedido (usuário): (1) editar a quantidade de um EPI na aba "Estoque por Obra" mudava junto o saldo do Central — as duas caixas têm que ser INDEPENDENTES; (2) a transferência (central→obra e devolução obra→central) "ficava bugada". CAUSA-RAIZ (1): na tabela "Estoque por Obra" o CLIQUE na linha e o lápis ("Editar EPI") abriam o editor do CATÁLOGO CENTRAL (`viewMode='editar_epi'` → `epis.update`, que grava `epis.quantidadeEstoque`); não existia mutation pra ajustar `epi_estoque_obra.quantidade`. SOLUÇÃO: nova mutation `epis.ajustarEstoqueObra` ({id, quantidade, observacao?}) que altera SOMENTE `epi_estoque_obra.quantidade` (clamp ≥0) + `alterado_por`, NUNCA `epis.quantidadeEstoque`; guard de tenant/IDOR derivando a empresa do próprio registro. No front (`client/src/pages/Epis.tsx`), clique/lápis (re-rotulado "Ajustar estoque na obra") abrem novo diálogo de ajuste (obra, EPI+tamanho, estoque atual, aviso "não afeta o central"); ícone separado (Package) "Editar cadastro do EPI" leva ao catálogo. CAUSA-RAIZ (2): picker vazio já resolvido na Rev. 2927; `epis.transferir` NÃO rodava em transação (falha no meio corrompia saldo) e o histórico gravava `destinoObraId: null` na devolução obra→central (viola `NOT NULL`). SOLUÇÃO: `transferir` num único `db.transaction` (origem+destino+histórico); destino=central usa sentinela `0` (UI trata falsy como "Central"); + guard de tenant/IDOR pela empresa-dona do EPI. ZERO ALTER/DROP/DELETE — só UPDATE/INSERT. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2927** — REGISTRAR ENTREGA DE EPI — A LISTA QUE NÃO MOSTRAVA OS EPIs ("NENHUM EPI ENCONTRADO") VOLTOU, O ESTOQUE EXIBIDO PASSA A BATER COM A ORIGEM (CENTRAL × OBRA) E AO SELECIONAR O FUNCIONÁRIO O ERP JÁ MOSTRA OS TAMANHOS. Causa: `episAllQ` pedia `limit:1000` mas `epis.list` validava `.max(200)` → tRPC rejeitava → picker vazio; teto subiu p/ `.max(2000)`. Subtítulo passou a ler estoque da OBRA quando origem=obra (`estoqueObraMap`); card do func. ganhou chips Camisa/Calça/Calçado. Tudo em `Epis.tsx`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2926** — CONTROLE DE EPIs · LISTA — AS CALÇAS VOLTARAM A MOSTRAR O TAMANHO EM LETRA (P/M/G…) JUNTO COM O NÚMERO ("38 (M)"). Desde a Rev. 2915 (conversão LETRA→NÚMERO no banco p/ casar com o `tamanhoCalca` numérico do func.) a letra do almoxarife sumiu da tela. FRONT-only (ZERO ALTER/DROP/DELETE — não toca o dado): helper `client/src/lib/epiTamanho.ts` espelha o mapa da 2915 e DERIVA letra↔número; `labelTamanhoEpi` aplica dupla exibição SÓ em calça; aplicado em `Epis.tsx` e `EpiNecessidade.tsx`. Detalhe: `shared/changelog.ts`.

- **Rev. 2925** — INTEGRAÇÃO DE SEGURANÇA (SST) · APROVADOS — DIÁLOGO "ASSINATURA EM LOTE" GANHOU LAYOUT NOVO (2 COLUNAS) QUE CABE NA TELA DO TABLET SEM BARRA DE ROLAGEM. A janela "Assinatura em Lote — N colaboradores" (Rev. 2922) estava alta demais (lista + nome do TST + canvas em coluna única) → barra de rolagem. FRONT-only no `AssinarTstLoteDialog` (`client/src/pages/sst/IntegracaoSST.tsx`): GRID `md:grid-cols-2` (esquerda = nome do TST + resumo colapsável; direita = canvas) reduz altura; SEM overflow-x (`DialogContent` `max-h-[92vh] overflow-hidden flex flex-col`); header/footer `shrink-0` (botão "Assinar" sempre visível); canvas re-mede em resize/rotação (`ResizeObserver`+`orientationchange`). Mutation/validações idênticas. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2924** — INTEGRAÇÃO DE SEGURANÇA (SST) · ABA "VÍDEOS" (ADMIN) — O VÍDEO DE TREINAMENTO VOLTOU A APARECER NO CARD, CENTRALIZADO E COM FALLBACK QUANDO NÃO CARREGA (FIM DO "BURACO PRETO" SEM FEEDBACK). O player do card (`isFileVideo` em `client/src/pages/sst/IntegracaoSST.tsx`) era um `<video preload="metadata">` cru sem estado de carregando/erro: metadata que não chega (arquivo grande, `moov` no fim do mp4, cap 8MB/chunk do proxy — Rev. 2917) deixava buraco preto eterno. FRONT-only: novo `VideoCardPlayer` espelhando o portal público (Rev. 2920) — `object-contain` centralizado, overlay spinner até `onLoadedMetadata`/`onCanPlay`, `onError`/fallback 12s "Abrir em nova aba". ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2923** — DASHBOARD FINANCEIRO · CARDS "A PAGAR"/"A RECEBER" — FIM DOS VALORES INFLADOS (R$ 25 MI QUE NÃO EXISTIAM): SÓ CONTAS REAIS + DEDUP DO IMPORT DO CRONOGRAMA. "A Pagar"=R$ 25,2M inflado: (1) card somava PROJEÇÕES do cronograma (`origem_modulo='cronograma_atividade'`) junto com contas reais (idem "A Receber" com `revenue`); (2) import duplicava entradas até 18× pois a dedup comparava `String(data_competencia).substring(0,10)` (objeto Date → "Sun Jun 01…") ≠ "2026-06-01" e não havia UNIQUE. SOLUÇÃO (ZERO ALTER/DROP/DELETE): `financial.ts getDashboardExecutivo` ganhou `exclProjPagar/exclProjReceber` (A Pagar/Receber/vencidos/próximos vencimentos); `financialIntegrationBridge.ts` passou a usar `TO_CHAR(data_competencia,'YYYY-MM-DD')` (idempotente); limpeza via UPDATE→`status='cancelado'` (mantém MIN(id), 2450 linhas). Efeito: A Pagar →R$ 5,44M; A Receber →R$ 555,8 mil. Detalhe: `shared/changelog.ts`.

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
