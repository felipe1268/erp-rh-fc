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

- **Rev. 2802** — **COMPRAS · SOLICITAÇÕES — O NÚMERO DA SC PASSA A SER EXIBIDO COMO `SC-NNNN-AAAA` (NÚMERO DA SOLICITAÇÃO PRIMEIRO, ANO DEPOIS) EM VEZ DE `SC-AAAA-NNNN`. MUDANÇA SÓ DE EXIBIÇÃO — O VALOR PERSISTIDO NO BANCO CONTINUA CANÔNICO `SC-AAAA-NNNN`. TUDO CLIENT-ONLY; ZERO SCHEMA/SERVER.** Pedido (usuário, com screenshot da lista "Solicitações de Compra"): "primeiro apareça o número da solicitação depois o ano". Por que não mexer no gravado: `numero_sc` é gerado por counter table + índice único `uq_compras_solicitacoes_numero` e o seed/ColFix usa regex `^SC-\d{4}-\d+$` — inverter o persistido quebraria geração/unicidade/ordenação. Fix: novo helper `shared/numeroSc.ts` (`formatNumeroScDisplay("SC-2026-0325") === "SC-0325-2026"`, preserva zero-padding, formatos fora do padrão devolvidos intactos, null→"") aplicado nos pontos de EXIBIÇÃO: `client/src/pages/compras/Solicitacoes.tsx` (lista, cabeçalho do detalhe, selo "já solicitado", banner URGENTE, toast de cópia, HTML do PDF), `Painel.tsx` (2 listas), `Cotacoes.tsx` (`RastreabilidadeTag`, linha "SC:" do print, dropdown de SC), `frotas/Manutencoes.tsx` (toast). BUSCA/ORDENAÇÃO seguem no valor canônico (buscar por dígitos continua OK; ordem ano→sequencial preservada). ZERO ALTER/DROP/DELETE. Validação: esbuild OK nos 4 arquivos + helper; HMR limpo. Detalhe: `shared/changelog.ts`.
- **Rev. 2801** — **COMPRAS · COTAÇÕES — OS DIÁLOGOS DE CONFIRMAÇÃO DO `window.confirm()` NATIVO (QUE EXIBIAM A URL FEIA "…replit.dev diz" NO TÍTULO) FORAM SUBSTITUÍDOS PELO MODAL CUSTOMIZADO `useConfirm` (ALERTDIALOG shadcn, COM TOM/ÍCONE, TÍTULO LIMPO E BOTÕES ROTULADOS). TUDO CLIENT-ONLY; ZERO SCHEMA/SERVER.** Pedido (usuário): tirar o "código"/URL feia que aparecia no cabeçalho do confirm nativo (print "Excluir proposta e remover preços vinculados?"). Fix (SÓ `client/src/pages/compras/Cotacoes.tsx`): importado o hook já existente `@/hooks/useConfirm`, instanciado `const { confirm, ConfirmDialog } = useConfirm()` no componente `Cotacoes` e `{ConfirmDialog}` renderizado antes do fechamento do `DashboardLayout`; substituídas TODAS as 7 chamadas de `window.confirm()` por `await confirm({ title, description, tone, confirmText, cancelText })` com onClick/handlers convertidos p/ `async` — "Excluir proposta" (destrutivo), 2× "Reabrir cotação?" (info), "Reverter aprovação?" (warning), "Cancelar cotação?" (destrutivo), 2× "Valor acima da meta orçamentária" (warning); `handleConfirmarTotal` virou `async`; textos longos viraram `description` (mantêm `\n\n`, modal usa `whitespace-pre-wrap`). ZERO ALTER/DROP/DELETE. Validação: esbuild OK em `Cotacoes.tsx`; HMR limpo. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2800** — COMPRAS · COTAÇÕES: LEITURA POR IA PASSA A ACEITAR VÁRIOS ARQUIVOS DE UMA VEZ (PÁGINAS/FOTOS DA MESMA COTAÇÃO) NUMA ÚNICA CHAMADA AO CLAUDE VISION (UM JOB / UMA PROPOSTA, SEM DUPLICAR ITENS). `invokeAnthropicVision` aceita `files[]`, `extrairCotacaoIA` ganha `arquivos[]` (.min1.max10) e o botão "Ler cotação (IA)" ganha `multiple`. ZERO schema novo; ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2799** — COMPRAS · COTAÇÕES: OVERLAY "CONFERÊNCIA — LEITURA IA" REFEITO COM LIBERDADE TOTAL DE MATCH POR LINHA (COMBOBOX COM BUSCA + TOP-3 SUGESTÕES ★ + REMOVER VÍNCULO) + BOTÃO CLARO "LER COTAÇÃO (IA)" NO TOOLBAR DO FORNECEDOR (1 CLIQUE: ANEXA + LÊ + ABRE A CONFERÊNCIA). TUDO CLIENT-ONLY; ZERO SCHEMA/SERVER; REUSA `extrairCotacaoIA` E `salvarRespostasLote`. Detalhe: `shared/changelog.ts`.

- **Rev. 2798** — PLANEJAMENTO · REFIS: REVERTIDA A ALTURA 760px DA REV. 2797 — QUE FICOU PÉSSIMA (CURVA ESTICADA NUM BOX ALTO/VAZIO); OS 2 CHART-BOX (FÍSICA 3A + FINANCEIRA 3B) VOLTARAM A `height: 560` (PROPORÇÃO LARGA/BAIXA, COMO O MODELO DE CURVA S). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): 2 `.refis-chart-box` 760→560; seletor de impressão `[style*="height: 760"]`→`[style*="height: 560"]` (PDF segue 360pt). Detalhe: `shared/changelog.ts`.

- **Rev. 2797** — PLANEJAMENTO · REFIS: OS DOIS GRÁFICOS DA CURVA S (FÍSICA 3A E FINANCEIRA 3B) FICARAM BEM MAIORES NA TELA — A ALTURA DO CHART-BOX SUBIU DE 560 → 760px PARA PREENCHER A ÁREA MARCADA PELO USUÁRIO (REVERTIDA NA REV. 2798 — FICOU ESTICADA NUM BOX ALTO/VAZIO). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): 2 `.refis-chart-box` 560→760; seletor de impressão `[style*="height: 560"]`→`[style*="height: 760"]` (PDF segue 360pt — aumento só na tela). Detalhe: `shared/changelog.ts`.

- **Rev. 2796** — PLANEJAMENTO · REFIS: REMOVIDOS DE VEZ A MOLDURA POR PÁGINA E O CABEÇALHO FIXO REPETIDO (LOGO FC + DATA DE STATUS) DA REV. 2793 — ELES DUPLICAVAM A MOLDURA E O LOGO QUE O PRÓPRIO DOCUMENTO JÁ TEM (PÁG. 1 SAÍA COM 2 LOGOS FC + LINHA DE MOLDURA INDEVIDA). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`Refis`): removido JSX+CSS de `.refis-page-frame`/`.refis-running-header`; `@page` com margem uniforme; data de status vermelha mantida só no cabeçalho próprio. Detalhe: `shared/changelog.ts`.

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
