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


- **Rev. 2644** — **PLANEJAMENTO · NO CRONOGRAMA INICIAL, O "% PREVISTO" PASSA A SER A RÉPLICA EXATA DA COLUNA "% PREVISTO" (Texto10) DO MS PROJECT — "VERDADE ABSOLUTA". A RAIZ VIRA ROLLUP (SOMA DAS DURAÇÕES DAS FOLHAS, IGUAL AO MSP) E A RÉGUA MUDA DE TRUNCAR PARA ARREDONDAR.** Pedido (usuário, via user_query): "o % previsto tem que ser réplica EXATA da coluna % PREVISTO do MS Project — verdade absoluta"; decisões: (1) abandonar baseline-trunc e alinhar à fórmula do Texto10; (2) no 1º upload, projetar previsto p/ TODAS as semanas; (3) RAIZ = ROLLUP = soma das durações das folhas (não o vão início→fim). CAUSA-RAIZ (régua divergente): o Caminho B (Rev. 2617) usava o VÃO da baseline do projeto (minStart→maxFinish) + `Math.trunc`; já o Texto10 é `Int(Num Dur(Prev) ÷ PESO DUR(BL) × 100 + 0.5)` = rollup ponderado por DURAÇÃO das folhas + ARREDONDA. E a leitura priorizava Texto6 (lixo sem alias neste template LOTUS); o "% PREVISTO" real é Texto10, identificável pelo Alias literal. Fix (ADITIVO/LEITURA; R-001/R-007/R-010): `server/routers/planejamento.ts` (`regenerarPrevistoSemanasCaminhoB`) — RAIZ vira `raizTotal = Σ totaisLeaf` com `raizElapsed[j]` acumulado no loop das folhas → `round(elapsed/total×100)`; por atividade `trunc`→`round`. `client/src/pages/planejamento/ImportarCronograma.tsx` — novo helper `detectarFidPorAlias(doc,"% PREVISTO")` (acha FieldID pelo `<Alias>` na definição do ExtendedAttribute); cadeia raiz+atividade resolve `fidPrevisto → Texto10 → Texto6 → Texto11`. RESSALVA: o XML de referência (PLN_816 R04) tem StatusDate < StartDate → Texto10 = 0% em tudo; paridade NUMÉRICA precisa re-validação com XML de status-date no meio do projeto. Validado (estático): esbuild client+server exit 0. Detalhe: `shared/changelog.ts`.
- **Rev. 2643** — **ANÁLISE DE EXPERIÊNCIA · A SEÇÃO "ATESTADOS" PASSA A SER CLICÁVEL: AO CLICAR NUM ATESTADO QUE TENHA ANEXO, O ERP ABRE O DOCUMENTO (PDF/IMAGEM EM PREVIEW INTERNO; OUTROS FORMATOS EM NOVA ABA).** Pedido (usuário): "Quero poder clicar no atestado e ver os anexos." CAUSA-RAIZ (ausência de feature): a procedure `employees.analiseExperiencia` (`server/routers.ts`) montava `atestLista` só com `data/dias/cid/tipo` — NÃO expunha o `documentoUrl` (que já existe na tabela `atestados`), então `AnaliseExperiencia.tsx` não tinha de onde abrir o anexo. Fix (ADITIVO, SOMENTE SELECT/UI; R-001/R-007/R-010): `server/routers.ts` — `atestLista` ganha `documentoUrl: a.documentoUrl || null`; `client/src/components/AnaliseExperiencia.tsx` — atestado com anexo vira `<li>` clicável (cursor/hover, `role=button`, `tabIndex`, Enter/Espaço) + ícone `Paperclip` azul, abrindo `DocumentPreviewDialog` (reuso do viewer do Raio-X) se `canPreviewFile` (PDF/imagem), senão `window.open` em nova aba; atestado sem anexo segue não-clicável. Validado: esbuild client+server exit 0. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2641** — CONTROLE DE DOCUMENTOS · TREINAMENTOS RENOVADOS CONTINUAVAM "VENCIDO": O PAINEL DE VALIDADE LISTAVA *TODO* REGISTRO DE TREINAMENTO COM VALIDADE, SEM DEDUP. AGORA SÓ O REGISTRO DE MAIOR VALIDADE POR (FUNCIONÁRIO + NORMA) APARECE → A RENOVAÇÃO ESCONDE O ANTIGO VENCIDO. Fix (SÓ BACKEND DE LEITURA; R-001/R-007/R-010): `server/routers/controleDocumentos.ts` — agrupa `treinRows` por `${employeeId}__${norma||nome}`, mantém maior `dataValidade`. Detalhe: `shared/changelog.ts`.

- **Rev. 2640** — RAIO-X DO FUNCIONÁRIO · O FILTRO "AVISO PRÉVIO" PERDIA GENTE: MOSTRAVA SÓ OS REGISTROS DO MÓDULO (`em_andamento`) E IGNORAVA OS COLABORADORES COM STATUS "AVISO" NO CADASTRO; AGORA UNE AS DUAS FONTES (DEDUPLICADO). Fix (SÓ CLIENT; R-001/R-007/R-010): `client/src/pages/relatorios/RaioXPage.tsx` — `avisoPrevioEmployeeIds` vira UNIÃO de `status==="Aviso"` + módulo `em_andamento`; badge "Aviso" laranja + label "Aviso Prévio". Detalhe: `shared/changelog.ts`.

- **Rev. 2639** — COLABORADORES · A FILEIRA DE FILTROS POR STATUS SUMIA INTEIRA DURANTE O CARREGAMENTO/REFETCH DO STATS; AGORA FICA SEMPRE VISÍVEL QUANDO HÁ EMPRESA SELECIONADA. CAUSA-RAIZ: fileira renderizada só dentro de `{statsQ.data && (...)}`, some no refetch. Fix (SÓ CLIENT; R-001/R-007/R-010): `client/src/pages/Colaboradores.tsx` — gate passa para `{hasValidSelection && (...)}`; contadores com fallback `?? "—"`. Detalhe: `shared/changelog.ts`.

- **Rev. 2638** — RH & DP · MENU "RELATÓRIOS" ENXUTO: REMOVIDOS OS RELATÓRIOS QUE NÃO FAZEM MAIS SENTIDO (PONTO, FOLHA, DIVERGÊNCIAS, CUSTO POR OBRA, HABILIDADES POR OBRA); FICA SÓ O "RAIO-X DO FUNCIONÁRIO". Fix (SÓ CLIENT; R-001/R-007/R-010): `client/src/components/DashboardLayout.tsx` — na seção `Relatórios` do sidebar, `items` reduzido a `{ Raio-X do Funcionário → /relatorios/raio-x }`. Conservador: só a VISIBILIDADE no menu; rotas/permissões intactas. Detalhe: `shared/changelog.ts`.


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
- **REGRA DE OURO — CAMINHO B (Rev. 2644+, substitui Rev. 2617/2533/2603).** O "% PREVISTO" é a réplica da coluna **"% PREVISTO" (Texto10) do MS Project** — "verdade absoluta". O "% CONCLUÍDA" segue a coluna `PercentComplete`. As duas régua são alinhadas às fórmulas do MSP:
  - **% PREVISTO — FÓRMULA-FONTE (Texto10):** a coluna "% PREVISTO" do MSP é `Int(Num Dur(Prev)[188743983] ÷ PESO DUR(BL)[188743982] × 100 + 0.5)` = fração de duração da baseline DECORRIDA até o StatusDate, ponderada por DURAÇÃO das folhas, **ARREDONDADA** (`+0.5` antes do `Int` = `round`, NÃO trunca).
  - **% PREVISTO — RÉGUA NO ERP (projeção p/ TODAS as semanas):** motor de **TEMPO ÚTIL MINUTO-A-MINUTO** da baseline (`unitsElapsed`/`unitsTotal` sobre `shared/diasUteis`, clipando aos `weekDayIntervals` do calendário). **RAIZ = ROLLUP** = `round(Σ minutos úteis DECORRIDOS das folhas ÷ Σ minutos úteis TOTAIS das folhas × 100)` — soma das DURAÇÕES das folhas, **NÃO** o vão início→fim do projeto (corrigido na Rev. 2644). POR ATIVIDADE = `round(elapsed/total × 100)`. `round` (não `trunc`) p/ espelhar o `+0.5` do Texto10.
  - **% PREVISTO — LEITURA DO VALOR-SNAPSHOT (cliente):** `client/.../ImportarCronograma.tsx` acha o FieldID pelo `<Alias>` literal "% PREVISTO" via `detectarFidPorAlias(doc,"% PREVISTO")` → resolve `fidPrevisto → Texto10 (188743750) → Texto6 (188743746) → Texto11 (188743997)`. **Texto6 NÃO é mais prioridade** (em templates LOTUS é coluna de lixo sem alias/fórmula); o "% PREVISTO" real é o Texto10.
  - **Baseline COM HORA é OBRIGATÓRIA.** Lê `baseline_start_ts`/`baseline_finish_ts` (TEXT ISO com hora). Sem `weekDayIntervals` OU sem TS → fallback day-granular ponderado por duração (backward compat). Cutoff semanal = fim-do-dia (`T23:59:59Z`).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - Snapshot é regenerado SÓ no `salvarAtividades` (substituir/cadastro). Mudou baseline = nova revisão = novo snapshot. Avanço semanal NÃO regenera (baseline é imutável dentro da revisão).
  - **RESSALVA DE PARIDADE NUMÉRICA:** o XML de referência (PLN_816 R04) tem StatusDate < StartDate → Texto10 = 0% em tudo, então a curva numérica NÃO foi cravada empiricamente nesta revisão. A régua matemática está alinhada à fórmula; falta re-validar com XML de status-date no meio do projeto.
  - Implementação: `server/routers/planejamento.ts` (`regenerarPrevistoSemanasCaminhoB` — rollup das folhas + round; chamada pós-transaction em `salvarAtividades`; `importarComModo` propaga os TS), `client/src/pages/planejamento/ImportarCronograma.tsx` (`detectarFidPorAlias` + parser `<Baseline Number=0>` COM HORA + `<WorkingTime>`→`weekDayIntervals`), `shared/diasUteis.ts` (motor minuto-a-minuto), `drizzle/schema.ts` + self-heal `[SyncSchema+]` (`baseline_start_ts`/`baseline_finish_ts`).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
