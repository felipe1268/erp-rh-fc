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

- **Rev. 2798** — **PLANEJAMENTO · REFIS (RELATÓRIO DE EVOLUÇÃO FÍSICA DA OBRA): REVERTIDA A ALTURA 760px DA REV. 2797 — QUE FICOU PÉSSIMA (CURVA ESTICADA NUM BOX ALTO E VAZIO, LONGE DO MODELO DE CURVA S, QUE É LARGO E BAIXO). OS 2 CHART-BOX (FÍSICA 3A + FINANCEIRA 3B) VOLTARAM PARA `height: 560` → PROPORÇÃO LARGA, COMO O MODELO.** Pedido (usuário): "Está péssimo, ajuste a curva igual ao modelo somente na largura, arrume isso" (anexou print do estado atual alto/esticado da Rev. 2797 + o MODELO clássico de Curva S "AVANÇO FÍSICO ACUMULADO — PREVISTO x REALIZADO", largo e baixo). Causa: na Rev. 2797 interpretei a "área marcada" como pedido de MAIS ALTURA e subi o chart-box 560→760px; na prática o S-curve não preencheu o box — virou curva fina esticada num retângulo alto e vazio, oposto do modelo (largo/baixo). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): revertidos os 2 `.refis-chart-box` (3A físico + 3B financeiro) de `style={{ height: 760 }}` → `560` (ResponsiveContainer `width="100%" height="100%"` segue ocupando toda a largura); seletor de impressão de volta `[style*="height: 760"]` → `[style*="height: 560"]` (PDF capado em `360pt`, inalterado desde a Rev. 2795). `break-inside: avoid` + largura forçada à folha (Rev. 2792) mantidos. Só ALTURA (revert) — nenhuma série/cálculo/eixo/dado mudou. ZERO ALTER/DROP/DELETE. Validação: esbuild OK; HMR. RESSALVA: se quiser a curva ainda mais achatada/larga tipo Excel, o próximo passo é BAIXAR a altura (360–420px), NÃO subir; o "vazio à direita" vem da baseline atingir 100% antes do fim do eixo (dado, não largura). Detalhe: `shared/changelog.ts`.
- **Rev. 2797** — **PLANEJAMENTO · REFIS (RELATÓRIO DE EVOLUÇÃO FÍSICA DA OBRA): OS DOIS GRÁFICOS DA CURVA S (FÍSICA 3A E FINANCEIRA 3B) FICARAM BEM MAIORES NA TELA — A ALTURA DO CHART-BOX SUBIU DE 560 → 760px PARA PREENCHER A ÁREA QUE O USUÁRIO MARCOU (ANTES SOBRAVA BRANCO ABAIXO DA CURVA DENTRO DO CARD).** Pedido (usuário): "A, quero eles do tamanho da área que deixei marcada" (anexou 2 prints — Física e Financeira — com moldura amarela à mão em volta de TODO o card, bem abaixo de onde a curva termina). Causa: o card é só faixa-título + KPI strip + chart-box; o chart-box tinha `height: 560` e a curva ocupava só a faixa superior, deixando branco até a borda. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): os 2 `.refis-chart-box` (BLOCO 3A físico + 3B financeiro) passaram de `style={{ height: 560 }}` → `760` (ResponsiveContainer `height="100%"` acompanha); o seletor de impressão acompanhou `[style*="height: 560"]` → `[style*="height: 760"]` (PDF segue capado em `360pt` — aumento SÓ NA TELA). `break-inside: avoid` + largura forçada à folha (Rev. 2792) mantidos. Nenhuma série/cálculo/eixo/dado mudou — só ALTURA na tela. ZERO ALTER/DROP/DELETE. Validação: esbuild OK; HMR. RESSALVA: no PDF a altura segue 360pt (A4 não comporta 760px); subir o `360pt` é trivial se quiser maior também no PDF (atenção ao limite em LANDSCAPE). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2796** — PLANEJAMENTO · REFIS: REMOVIDOS DE VEZ A MOLDURA POR PÁGINA E O CABEÇALHO FIXO REPETIDO (LOGO FC + DATA DE STATUS) DA REV. 2793 — ELES DUPLICAVAM A MOLDURA E O LOGO QUE O PRÓPRIO DOCUMENTO JÁ TEM (PÁG. 1 SAÍA COM 2 LOGOS FC + LINHA DE MOLDURA INDEVIDA). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): removido JSX+CSS de `.refis-page-frame`/`.refis-running-header`; `@page` com margem uniforme; data de status vermelha mantida só no cabeçalho próprio. Detalhe: `shared/changelog.ts`.

- **Rev. 2795** — PLANEJAMENTO · REFIS: REVERTIDA A ALTURA DE IMPRESSÃO "ORIENTATION-AWARE" DA REV. 2794 (QUE BUGAVA — RETRATO 480pt ESTOURAVA O BLOCO FAIXA+KPIs+GRÁFICO COM `break-inside:avoid`); IMPRESSÃO VOLTOU A VALOR ÚNICO SEGURO (330→360pt), GRÁFICO SEGUE GRANDE NA TELA. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): removida a interpolação `${orientacaoPdf...}` do seletor `[style*="height: 560"]` → valor único `360pt`. Detalhe: `shared/changelog.ts`.

- **Rev. 2794** — PLANEJAMENTO · REFIS: TENTATIVA (REVERTIDA NA REV. 2795) DE ALTURA DE IMPRESSÃO "ORIENTATION-AWARE" P/ A CURVA S (RETRATO 480pt) PRA TIRAR O BRANCO ABAIXO; BUGOU (EM RETRATO O BLOCO FAIXA+KPIs+GRÁFICO COM `break-inside:avoid` ESTOUROU A PÁGINA). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): containers 3A/3B `height` 460→560; seletor print `[style*="height: 560"]` com ternário `landscape 330pt : portrait 480pt`. Detalhe: `shared/changelog.ts`.

- **Rev. 2793** — PLANEJAMENTO · REFIS: NA IMPRESSÃO GANHOU MOLDURA FECHANDO O RETÂNGULO DE CADA PÁGINA + CABEÇALHO FIXO REPETIDO (LOGO FC + OBRA + DATA DE STATUS) E A DATA DE STATUS PASSOU A SAIR EM VERMELHO; REFORÇO ANTI-CORTE. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): `.refis-page-frame` + `.refis-running-header` (`position:fixed`, fora do `#refis-print-area`, repetem por página; `@page` +16mm no topo); data-status vermelha no chip-título e na célula da ficha; `tr/thead/tfoot break-inside/repeat` + orphans/widows. Detalhe: `shared/changelog.ts`.

- **Rev. 2792** — PLANEJAMENTO · REFIS: NA IMPRESSÃO OS GRÁFICOS DA CURVA S PREENCHEM A LARGURA DA FOLHA (ACABOU O BRANCO À DIREITA) E OS RÓTULOS DO EIXO X NÃO SE SOBREPÕEM MAIS. Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): chart-box ganham largura útil da folha (mm→px) antes do `window.print()` via `resize`, restaurada no `afterprint`; `interval` dos eixos passou a espaçar rótulos + `minTickGap={6}`. Detalhe: `shared/changelog.ts`.

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
