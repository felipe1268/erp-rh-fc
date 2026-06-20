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

- **Rev. 3350** — **FINANCEIRO / DASHBOARD DE CHEQUES · GRÁFICO "EVOLUÇÃO MENSAL POR STATUS": O VERDE (COMPENSADO) AGORA FICA NA BASE DA BARRA EMPILHADA E AS DEMAIS SITUAÇÕES (PENDENTE / INDEFINIDO) SOBEM POR CIMA DELE — ANTES A ORDEM DO EMPILHAMENTO SEGUIA A ORDEM EM QUE OS STATUS APARECIAM NOS DADOS (VARIÁVEL). 100% FRONT · UX · READ-ONLY · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Pedido (usuário, no iPad, com print do gráfico): "Verde começa e depois sobre ele vem as demais". RAIZ: as `<Bar stackId="st">` vinham de `statusKeys` = `Array.from(new Set(cheques.map(statusEf)))`, então a base do empilhamento (1ª Bar = base no Recharts) dependia da ordem dos dados, podendo deixar Pendente (vermelho) embaixo. CORREÇÃO (`DashCheques.tsx`, 100% front): `statusKeys` agora é ORDENADO por `rank` fixo (`compens`→0/base, `pend`→1, demais→2; desempate `localeCompare`) → Compensado vira a base, Pendente/Indefinido sobem por cima; cores e drill por segmento inalterados, legenda segue a mesma ordem. tsc limpo. Detalhe: `shared/changelog.ts`.

- **Rev. 3349** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA (DASHBOARD + PANORAMA GERAL) · OS TOTAIS "ENTRADAS / SAÍDAS / SALDO" AGORA MOSTRAM O CAIXA REAL (EXTERNO): A MOVIMENTAÇÃO INTERNA (TRANSFERÊNCIA ENTRE CONTAS DA PRÓPRIA FC, APLICAÇÃO/RESGATE, PIX/TED INTRA-FC) SAIU DOS TOTAIS E GANHOU UM CARD SEPARADO "MOVIMENTAÇÃO INTERNA" COM DRILL-IN PARA CONFERÊNCIA — ANTES O DINHEIRO QUE SÓ GIRAVA ENTRE AS CONTAS DA EMPRESA INFLAVA O QUE ENTROU/SAIU DE VERDADE. 1 BACKEND (READ-ONLY) + 2 FRONTS · CLASSIFICAÇÃO · ZERO SCHEMA/ALTER/DROP/DELETE.** Pedido (usuário): "Faça uma conferência total de entrada e saída, tô achando que tem alguma coisa errada". RAIZ: as duas telas somavam TODO crédito/débito do extrato sem distinguir caixa real de transferência intra-FC (validação no Neon real, company 60002/2026: ~31,8% do giro bruto em R$ era interno — 290 de 2.841 linhas). CORREÇÃO: heurística ÚNICA em `financial.ts` (`_INTERNO_PATTERNS`/`_INTERNO_REGEX_SRC` alimenta AO MESMO TEMPO o predicado SQL `descricao ~* '<src>'` E o helper JS `_isLancInterno` — Dashboard e Panorama NÃO divergem; só CLASSIFICA, nada oculta/baixa); 3 endpoints READ-ONLY (`getConciliacaoReportGeral`/`getConciliacaoLancamentos`/`getBankAccountsConciliacaoStatus`) ganham `interno` por linha + `valorEntradas/SaidasExternas|Internas` (externa = bruto − interna); `DashConciliacao.tsx` e `FinanceiroConciliacao.tsx` exibem cards "(caixa real)" + 4º card "Movimentação interna" (indigo, `ArrowLeftRight`) com drill-in. Ressalva: sub-resumos POR CONTA seguem mostrando o giro TOTAL (externo+interno); só os agregados/cards de cima separam. tsc limpo. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3348** — **FOLHA DE PAGAMENTO / HORAS EXTRAS · DRILL-IN DOS DIAS: DÁ PRA CLICAR DIRETO NAS HORAS ("HE ÚTEIS", "HE FIM SEM.", "TOTAL HE") DE CADA FUNCIONÁRIO PARA ABRIR O DETALHAMENTO DIA A DIA — ANTES SÓ ABRIA POR UM ÍCONE DISCRETO AO LADO DO "VALOR HE". 100% FRONT · UX · READ-ONLY · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `FolhaPagamento.tsx`: helper `abrirMemorial()` (mesma validação do botão existente) + as 3 células de horas viram `<button>` (hover roxo, `stopPropagation`) quando há HE; reusa o dialog "Memorial de Cálculo". Detalhe: `shared/changelog.ts`.

- **Rev. 3347** — **FINANCEIRO / DASHBOARD DE CHEQUES · DRILL-IN: A COLUNA "STATUS" DA TABELA DE DETALHE AGORA EXIBE UM SELO COLORIDO (COMPENSADO=VERDE, PENDENTE=VERMELHO, INDEFINIDO=ÂMBAR, DEVOLVIDO/SUSTADO=VERMELHO ESCURO) EM VEZ DE TEXTO CRU — PARA FICAR CLARO NA TELA, NA IMPRESSÃO E NO RELATÓRIO/PDF. 100% FRONT · UX · READ-ONLY · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `DashCheques.tsx`: novo helper `statusPill(s)` reusa a régua `statusColor` (Rev. 3341) e renderiza selo arredondado branco; a coluna "Status" vira `align:"center"` + `format:(_v,row)=>statusPill(statusEf(row))` (status EFETIVO); `printColorAdjust:"exact"` inline garante a cor no print/PDF. Detalhe: `shared/changelog.ts`.

- **Rev. 3346** — **FINANCEIRO / DASHBOARD DE CONCILIAÇÃO BANCÁRIA · CONFERÊNCIA TOTAL DE ENTRADAS E SAÍDAS: OS CARDS "ENTRADAS (CRÉDITOS)", "SAÍDAS (DÉBITOS)" E "SALDO LÍQUIDO" AGORA ABREM TODAS AS LINHAS INDIVIDUAIS DO EXTRATO (TODAS AS CONTAS) PARA ANÁLISE — ANTES ABRIAM APENAS O RESUMO POR CONTA. 1 BACKEND (READ-ONLY) + 1 FRONT · ADITIVO · ZERO SCHEMA/ALTER/DROP/DELETE.** Novo endpoint READ-ONLY `financial.getConciliacaoLancamentos({companyId,dataInicio,dataFim})` (`SELECT` em `bank_statement_lines`, `_assertFinanceiroCompanyAccess`); front `DashConciliacao.tsx` ganha estado `lanc` + query lazy + reuso do `DetailDialog`; `totalKey="valor"` faz o rodapé BATER com o KPI do card. Detalhe: `shared/changelog.ts`.

- **Rev. 3345** — **FINANCEIRO / DASHBOARDS · CORREÇÃO DE LAYOUT: GRÁFICOS DOS DASHBOARDS FINANCEIROS APARECIAM SOBREPOSTOS (SVG "FANTASMA" DO RECHARTS NO Safari/iPad VAZAVA POR CIMA DO CARD DE BAIXO, EMBARALHANDO TÍTULOS/LISTAS). 100% FRONT · BUGFIX/UX · READ-ONLY · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `_kit.tsx` (`ChartCard`, compartilhado pelos 5 dashboards): container do gráfico passou a `className="relative w-full isolate overflow-hidden"` (mantendo `style={{height}}`) → recorta o SVG-fantasma à caixa reservada; Recharts sempre dimensiona p/ caber, nada legítimo é cortado. Detalhe: `shared/changelog.ts`.

- **Rev. 3344** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · TODOS OS CONTADORES INTEIROS DO PAINEL EXIBEM SEPARADOR DE MILHAR pt-BR (2.434, 2.967…) — ANTES SÓ OS VALORES EM R$; AS CONTAGENS APARECIAM CRUAS. 100% FRONT · UX · READ-ONLY · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** `FinanceiroConciliacao.tsx`: helper `formatInt(v)`=`Intl.NumberFormat("pt-BR")` aplicado a TODOS os contadores (Panorama Geral, cabeçalhos, badges por conta, painéis, drill-in, KPIs, PDFs). `%` segue sem milhar; valores R$ intactos. Detalhe: `shared/changelog.ts`.

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
