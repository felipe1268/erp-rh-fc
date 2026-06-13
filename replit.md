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

- **Rev. 3019** — **FINANCEIRO → "ANÁLISE DE CUSTOS": O CUSTO TOTAL DEIXA DE SOMAR A PROJEÇÃO DO CRONOGRAMA (VALOR DE CONTRATO DAS OBRAS) — PASSA A MOSTRAR SÓ OS CUSTOS REAIS. TOTAL CAI DE ~R$ 26,7 MI PARA ~R$ 11 MI.** PEDIDO: "Não pode ter 25 milhões... meus contratos não têm este valor total... deve ter vários valores duplicados, que devem ser corrigidos." INVESTIGAÇÃO (Neon, company 60002): o Custo Total (R$ 26.710.859,82) misturava R$ 15,7 mi de `origem_modulo='cronograma_atividade'` (a PROJEÇÃO do cronograma = valor de CONTRATO de cada obra via orçamento `totalVenda`, ponderado por `peso_financeiro` que soma EXATAMENTE 100% por revisão e distribuído mês a mês — o "x12" é fração por mês, NÃO duplicata) com ~R$ 11 mi de despesas REAIS (folha, compras, benefícios…). Somar os dois conta CADA OBRA DUAS VEZES (projeção do contrato + custo real de executá-lo); confirmado ainda 1 órfão obra 90004 HOTEL DO PAPA (R$ 1,73 mi, projeto apagado). DECISÃO (confirmada com o usuário — 3 opções, escolheu "só custos reais"): a Análise de Custos EXCLUI a projeção do cronograma, igual ao card "contas a pagar comprometidas". SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema, ZERO mudança de dado; endpoint compartilhado `financial.getContasAPagarByYear` NÃO tocado pra não afetar Contas a Pagar/Fluxo de Caixa/Lançamentos) em `FinanceiroAnaliseCustos.tsx` e `FinanceiroAnaliseCustosDetalhe.tsx`: `rowsAll` vira `useMemo([data])` que filtra `r.origemModulo !== 'cronograma_atividade'` — como TODOS os agregados (KPIs/barras/pizza/Pareto/ranking/centro/drill-down) derivam de `rowsAll`, a exclusão se propaga sozinha. REPUBLICAR (só front). Detalhe: `shared/changelog.ts`.
- **Rev. 3018** — **FINANCEIRO → "ANÁLISE DE CUSTOS" + TELA DE DETALHE: KPIs PASSAM A EXIBIR O VALOR EM REAIS NO FORMATO DE NÚMERO COMPLETO (`R$ 26.710.859,82`) EM VEZ DO COMPACTO (`R$ 26,7 mi`).** PEDIDO (com print): "Quero o valor em reais com formato de número completo." Na Rev. 3017 os KPIs usavam `BRLk` (`R$ 26,7 mi`) em destaque + 2ª linha com valor exato; o usuário prefere o número inteiro no destaque. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema; 100% client-side; só a formatação dos KPIs muda) em `FinanceiroAnaliseCustos.tsx` e `FinanceiroAnaliseCustosDetalhe.tsx`: valor em destaque dos KPIs monetários passa de `BRLk(c.value)` p/ `formatBRL(c.value)` (número completo pt-BR) e a 2ª linha pequena (redundante) foi removida. Pra caber numa linha só sem voltar a quebrar no meio do número (problema da Rev. 3017), fonte caiu `text-base lg:text-lg`→`text-sm lg:text-base`, mantendo `tabular-nums whitespace-nowrap` + `overflow-hidden text-ellipsis` (+ `title` no hover) como salvaguarda. KPIs inteiros (Lançamentos) seguem `toLocaleString("pt-BR")`. Gráficos/eixos/`LabelList` continuam em `BRLk` de propósito (não poluir eixos). REPUBLICAR (só front). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 3017** — FINANCEIRO → "ANÁLISE DE CUSTOS" (`/financeiro/analise-custos`): LAYOUT SEM SOBREPOSIÇÃO DE TEXTO + DRILL-DOWN — TODO KPI, BARRA, FATIA DE PIZZA E LINHA DE TABELA É CLICÁVEL E ABRE UMA TELA DE DETALHE COM OS LANÇAMENTOS PERTINENTES. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema; 100% client-side sobre `financial.getContasAPagarByYear`): fim da sobreposição nos KPIs/gráfico "Centro de Custo" (altura dinâmica, `YAxis` truncado) + helper `irParaDetalhe(tipo,valor)` torna clicáveis KPIs/barras/pizza/Pareto/fornecedores e NOVA TELA `FinanceiroAnaliseCustosDetalhe.tsx` (lazy, `useSearch`, recorte por tipo/valor + tabela detalhada). Detalhe: `shared/changelog.ts`.

- **Rev. 3016** — DASHBOARD ALMOXARIFADO/EQUIPAMENTOS → ABA "EQUIP. PRÓPRIOS": LISTA "20 MAIS RECENTES" REDESENHADA P/ FICAR MAIS INTUITIVA — STATUS COLORIDO, PATRIMÔNIO EM CHIP MONOSPACE E SINALIZAÇÃO CLARA DE ITENS "SEM VALOR". SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema; 100% client-side sobre `equipamentos.propriosListar`) em `DashAlmoxarifadoEquipamentos.tsx`: helper `statusProprioTheme(status)` (cores por status), cabeçalho repaginado (selo `HardHat`, "Exibindo X de N", badge "N sem valor", CTA "Ver todos"), linhas com hover indigo, patrimônio em chip `font-mono`, badge colorido e aviso âmbar "⚠ Sem valor" quando `valorAquisicao<=0`. Detalhe: `shared/changelog.ts`.

- **Rev. 3015** — EQUIPAMENTOS PRÓPRIOS (`/equipamentos/ln`): BOTÃO "GERAR PREÇOS" — ESTIMA COM IA O VALOR DE AQUISIÇÃO (BRL) DE TODOS OS EQUIPAMENTOS SEM VALOR NUMA TACADA SÓ. SOLUÇÃO (ZERO ALTER/DROP/DELETE — só UPDATE de `valor_aquisicao`): NOVA PROCEDURE `equipamentos.propriosGerarPrecosComIA` (tenant guard, SELECT combinações DISTINTAS sem preço, `invokeLLM` Anthropic prompt "avaliador de patrimônio FC", UPDATE por combinação idempotente, limite 400/call) + FRONT `Proprios.tsx` botão "Gerar preços" (`Sparkles`, confirm contextual, toast + invalidate). Detalhe: `shared/changelog.ts`.

- **Rev. 3014** — FINANCEIRO → NOVA ABA NA COLUNA LATERAL "ANÁLISE DE CUSTOS": DASHBOARD DEDICADO DE CUSTOS (KPIs + BARRAS + PIZZA POR CATEGORIA + PARETO 80/20 + RANKING DE FORNECEDORES) PRA ENXERGAR ONDE CORTAR. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE, ZERO backend/schema; 100% client-side sobre `financial.getContasAPagarByYear`): nova página `FinanceiroAnaliseCustos.tsx` (ano+mês, 6 KPIs, barras/pizza/Pareto/ranking, recharts BRL pt-BR), rota `/financeiro/analise-custos` em `App.tsx`, item de menu lateral em `DashboardLayout.tsx` + feature em `shared/modules.ts`. Detalhe: `shared/changelog.ts`.

- **Rev. 3013** — FINANCEIRO → CONTAS A RECEBER: FIM DA DUPLICAÇÃO DE MEDIÇÕES + LIMPEZA DE LANÇAMENTOS ÓRFÃOS (PHANTOM R$ 1,5 MI DO "HOTEL DO PAPA") — SEM APAGAR NADA. CAUSA-RAIZ: duplicação estrutural (3.4 grava entries+revenue; 3.5 relê revenue e cria 2ª entry) + entries órfãs de projetos apagados. SOLUÇÃO (ZERO ALTER/DROP/DELETE) em `financialIntegrationBridge.ts`: 3.5 ganha guard `NOT EXISTS(planejamento_medicao ativo)`; entries duplicadas/órfãs viram status='cancelado' via UPDATE (recebido INTACTO). Detalhe: `shared/changelog.ts`.

- **Rev. 3012** — MIGRAÇÃO DE DADOS → "EXPORTAR ZIP COMPLETO": REESCRITA TOTAL P/ POSTGRES/NEON — FIM DO "FETCH IS ABORTED" + DOWNLOAD DE 100% (BANCO + ARQUIVOS + CÓDIGO-FONTE) VIA STREAMING. SOLUÇÃO (ZERO ALTER/DROP/DELETE; só LEITURA + nova rota GET): `migrationService.ts` reescrito p/ Postgres (auto-descoberta `pg_tables`, `.rows`, `ON CONFLICT`); `streamFullExportZip` (`archiver`+`Readable.from`, base64 paginada por `ctid`, sem RAM); rota `GET /api/migration/export-completo.zip` (auth cookie+gate admin, chunked); `Migration.tsx` usa `<a download>`. Detalhe: `shared/changelog.ts`.


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
