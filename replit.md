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


- **Rev. 2713** — **FROTA · DASHBOARD DE MANUTENÇÃO (`/frotas` → "Manutenções" → "Dashboard") · A "ANÁLISE INTELIGENTE (IA)" GANHOU UMA BARRA DE PROGRESSO DE 0 A 100% ENQUANTO PROCESSA, PARA O USUÁRIO ACOMPANHAR O ANDAMENTO.** Pedido (usuário, print IMG_1525): "Marca um percentual de 0 a 100% no avanço quero, acompanhar". Solução (SÓ CLIENT/UI; ZERO SERVER/SCHEMA — R-001/R-007/R-010): `client/src/pages/frotas/ManutencoesDashboard.tsx`. Como `getMaintenanceAIAnalysis` é uma única chamada (mutation) sem eventos de progresso reais, foi adicionado um progresso ANIMADO/ESTIMADO: estado `aiProgress` + `useEffect` que, enquanto `aiMut.isPending`, sobe de 8% até no máximo 95% num `setInterval` (passo que desacelera) e crava 100% ao concluir/errar. O bloco de loading mostra a barra (trilho + preenchimento gradiente violet→indigo) com rótulo "Progresso da análise" e "%"; o botão "Analisando…" também exibe o "%". Interval limpo no cleanup (sem leak). Nenhum dado/query/gráfico/tabela alterado. Validação: esbuild TSX EXIT 0. Ressalva: o "%" é estimativa visual (a chamada não reporta progresso real), pode pausar em 95% até a IA responder. Detalhe: `shared/changelog.ts`.
- **Rev. 2712** — **FROTA · DASHBOARD DE MANUTENÇÃO (`/frotas` → "Manutenções" → "Dashboard") · (1) CORRIGIDO O ERRO DA "ANÁLISE INTELIGENTE (IA)" ("The string did not match the expected pattern.") E (2) LAYOUT MODERNIZADO (HERO HEADER + KPIs).** Pedido (usuário, prints IMG_1522/1523/1524): "Tá com erro, na ia... e quero um layout moderno e inovador". Causa-raiz (IA): `getMaintenanceAIAnalysis` chamava `invokeLLM` SEM `fast: true` → Claude Sonnet NÃO-streaming pedindo ~6000 tokens leva 60-120s; o timeout do proxy/iOS mata a conexão antes da resposta e o Safari lança a DOMException "The string did not match the expected pattern.", que subia pelo tRPC (`aiMut.isError`). Solução (1) (SÓ SERVER; ZERO SCHEMA/ALTER — R-001/R-007/R-010): adicionado `fast: true` → `invokeGeminiFast` (Gemini 2.5 Flash, `thinkingBudget: 0`, respeita `response_format` json_object; `GOOGLE_API_KEY` já configurada; fallback Claude mantido). Solução (2) (SÓ CLIENT/UI): `ManutencoesDashboard.tsx` — hero header em gradiente escuro com brilhos + seletor de ano em vidro, e os 8 KPIs com chip de ícone em gradiente, barra de acento no topo e hover-lift (substituindo o hack `bg-clip-text`). Nenhum dado/query/gráfico/tabela alterado. Validação: esbuild TSX + server EXIT 0. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2711** — FROTA · VEÍCULOS (`/frotas` → "Veículos") · QUANDO O VEÍCULO ESTÁ COM STATUS "VENDIDO", O CARD AGORA MOSTRA O VALOR DA VENDA EM DESTAQUE (BLOCO VERMELHO "VENDIDO POR R$ X"). Solução (SÓ CLIENT/UI; ZERO SERVER/SCHEMA — R-001/R-007/R-010): `Veiculos.tsx` — bloco condicional que só aparece quando `statusVeiculo==="Vendido"` E há `valor_venda > 0`: chip vermelho com ícone `DollarSign`, rótulo "VENDIDO POR" e o valor formatado em negrito. O campo `valor_venda` já vinha do servidor (Rev. 2709). Validação: parse esbuild do TSX EXIT 0. Detalhe: `shared/changelog.ts`.

- **Rev. 2710** — FROTA · EDITAR/NOVO VEÍCULO (`/frotas` → "Veículos" → abrir/novo) · CORRIGIDO O CABEÇALHO DO DIÁLOGO EM TELA CHEIA QUE FICAVA CORTADO ATRÁS DA BARRA DO NAVEGADOR NO MOBILE, DEIXANDO OS BOTÕES "CANCELAR"/"SALVAR" INACESSÍVEIS. Solução (SÓ CLIENT/UI; ZERO SERVER/SCHEMA — R-001/R-007/R-010): `Veiculos.tsx` — no `<DialogContent>` do Editar/Novo Veículo, `top-0 left-0 translate-x-0 translate-y-0` (ancora no topo) e `h-screen` → `h-[100dvh]` (respeita a barra do navegador). Validação: parse esbuild do TSX EXIT 0. Detalhe: `shared/changelog.ts`.

- **Rev. 2709** — FROTA · EDITAR/NOVO VEÍCULO (`/frotas` → "Veículos") · QUANDO O STATUS É "VENDIDO" O VEÍCULO SAI DO "VALOR DO INVENTÁRIO" (KPI NO TOPO) E O CAMPO "VALOR DA VENDA" PASSA A SER OBRIGATÓRIO. Solução (SCHEMA + SERVER + CLIENT; `ADD COLUMN IF NOT EXISTS` não-destrutivo — R-001/R-007/R-010 OK): nova coluna `vehicles.valor_venda NUMERIC(14,2)` + self-heal em `ensureFleetTables()`; `createVehicle`/`updateVehicle` validam status "Vendido" sem valor > 0 → `BAD_REQUEST` (+ guard de tenancy no `createVehicle`); KPI "Valor do Inventário" exclui Vendido. Validação: esbuild TSX + server EXIT 0. Detalhe: `shared/changelog.ts`.

- **Rev. 2708** — FROTA · EDITAR/NOVO VEÍCULO (`/frotas` → "Veículos" → abrir/novo) · O DIÁLOGO EM TELA CHEIA DEIXOU DE TER FUNDO ACINZENTADO/TRANSLÚCIDO (`bg-muted/30`) E PASSOU A TER FUNDO BRANCO SÓLIDO, COMO O USUÁRIO PEDIU. Solução (SÓ CLIENT/UI; ZERO SERVER/SCHEMA — R-001/R-007/R-010): `client/src/pages/frotas/Veiculos.tsx` — no `<DialogContent>` do Editar/Novo Veículo, `bg-muted/30` virou `bg-white`. Validação: parse esbuild do TSX EXIT 0. Detalhe: `shared/changelog.ts`.

- **Rev. 2707** — FROTA · DASHBOARD DE MANUTENÇÃO (`/frotas` → "Manutenções" → "Dashboard") · NOVA SEÇÃO "ANÁLISE INTELIGENTE (IA)" QUE CRUZA PEÇAS RECORRENTES (MESMA PEÇA TROCADA ≥2× EM POUCO TEMPO NO MESMO VEÍCULO) E GERA PARECER POR VEÍCULO (VENDER/OBSERVAR/MANTER) COM SCORE 0-100. NÚMEROS DETERMINÍSTICOS (SQL); IA SÓ INTERPRETA. Solução (SERVER + CLIENT; ZERO SCHEMA/ALTER — R-001/R-007/R-010): `server/routers/frotas.ts` novo `getMaintenanceAIAnalysis` (CTE `LAG()` p/ gaps DIAS/KM + financeiro/veículo → `invokeLLM` com sanitização facts-only) + card IA em `ManutencoesDashboard.tsx`. esbuild server + parse TSX EXIT 0. Detalhe: `shared/changelog.ts`.

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
