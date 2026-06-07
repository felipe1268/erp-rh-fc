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

- **Rev. 2845** — **FINANCEIRO · PAINEL FINANCEIRO — SELETOR DE PERÍODO PADRONIZADO (MÊS/TRIMESTRE/SEMESTRE/ANO) IGUAL AO DRE.** Pedido (2 prints iPad — IMG_1657/IMG_1658): padronizar o seletor do "Painel Financeiro" (só tinha `<Select>` "Jan 2026") para o MESMO do DRE: navegação de ano (< 2026 >) + 12 chips de mês com pontinhos de status (azul=Com lançamento / verde=Consolidado / cinza=Sem dados) + chips de Trimestre (T1-T4) + Semestre (S1-S2) + "Ano inteiro". FEITO — FRONTEND (`FinanceiroDashboard.tsx`): removido o `<Select>`; replicado o padrão do DRE (tipo `Sel`, estado `ano`+`sel`, derivações `tipoPeriodo`/`periodo`/`tituloPeriodo`, `chipCls`, Card seletor); REUSO de `financial.getDREDisponibilidade` p/ os pontinhos; query manda `{mesCompetencia:periodo, tipoPeriodo}`. BACKEND (`financial.ts`, `getDashboardExecutivo`): NOVO input `tipoPeriodo` (default mensal); helpers `_rangeFor`/`_prevAnchor`; as 6 queries period-bound trocaram `=$1` por `BETWEEN $1 AND $2` (período + período anterior comparável de mesmo tamanho p/ `varReceita`/`varDespesa`); queries point-in-time (a receber/pagar/vencidos/evolução 30d/próx. vencimentos/saldos) intactas. ZERO ALTER/DROP/DELETE; ZERO schema; read-only. Detalhe: `shared/changelog.ts`.
- **Rev. 2844** — **FINANCEIRO · DRE — PAINEL "ANÁLISE INTELIGENTE" (IA) MOVIDO PARA ABAIXO DO DRE.** Pedido (2 prints iPad): "Quero que a análise e IA fique abaixo do DRE". O card de Análise IA estava ACIMA da tabela, empurrando o demonstrativo pra baixo da dobra. FEITO (`FinanceiroDRE.tsx`, SÓ frontend/ordem de render): a tabela DRE subiu pra logo após os KPIs e o card de Análise IA passou pra DEPOIS dela (antes do rodapé). NENHUMA lógica alterada — só a ordem dos dois `<Card>` irmãos foi trocada; estado, mutation `financial.analiseDRE`, fontes e comportamento on-demand intactos. ZERO backend; ZERO ALTER/DROP/DELETE; ZERO schema. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2843** — FINANCEIRO · EFD-REINF (R-2010) RECONSTRUÍDO CONTRA O SCHEMA REAL — RETENÇÃO DE INSS SOBRE SERVIÇOS TOMADOS (TERCEIROS), SEM FABRICAR VALOR. Follow-up da Rev. 2841: `gerarEFDReinf` teve o bind corrigido lá, mas o SQL seguia QUEBRADO (colunas inexistentes) → estourava em runtime. FEITO (`financialKpiService.ts`, função reescrita): R-2010 montado a partir das MEDIÇÕES DE TERCEIROS (UMA query `terceiro_medicoes JOIN terceiro_contratos JOIN empresas_terceiras`, filtro `company_id/periodo/status IN ('aprovada','faturada','paga')/retencao_inss>0`, agregado por CNPJ). ANTI-FABRICAÇÃO: usa a retenção JÁ gravada na medição, NADA recalculado com 11% chutado; PRESTADORES PJ removidos. PÓS-REVIEW: `faturada` incluída + JOINs com predicates de tenancy; endpoint ganhou guard `_assertFinanceiroCompanyAccess` (fecha IDOR). Validado no Neon (company 60002). ZERO ALTER/DROP/DELETE; ZERO schema; read-only. Detalhe: `shared/changelog.ts`.

- **Rev. 2842** — FINANCEIRO · DRE — REDESIGN MODERNO + ANÁLISE INTELIGENTE (IA) COM INDICADORES DO SETOR E FONTES CLICÁVEIS. NOVO serviço `dreAnaliseIA.ts` (`analisarDRE`): prompt com números reais de `calcularDRE` + benchmarks do setor + catálogo curado `FONTES_DRE` (Damodaran/IBGE/CBIC/INCC/BACEN/Assaf Neto…). ANTI-ALUCINAÇÃO (`sanitizeFontes`, campos clampados, período vazio não chama IA). `invokeLLM({fast,json})` Gemini→Claude. NOVO endpoint `financial.analiseDRE`. `FinanceiroDRE.tsx` redesenhado (navy+laranja, legenda por linha, painel on-demand). ZERO ALTER/DROP/DELETE; ZERO schema. Detalhe: `shared/changelog.ts`.

- **Rev. 2841** — FINANCEIRO · KPIs — TODAS AS QUERIES LIGAM OS PARÂMETROS POSICIONAIS + FIX DO SALDO BANCÁRIO (TABELA REAL). Continuação da Rev. 2838. O `.execute(sql,[params])` do drizzle node-postgres IGNORA o array → `$1/$2/$3` sem bind. FIX (`financialKpiService.ts`, só backend): chamadas `db!.execute` restantes migradas p/ `q(db!,sql,[params])` (`calcularKpis`, `projetarFluxoCaixa90Dias`, `gerarEFDReinf`). Validação no Neon expôs bug ALÉM do bind: query de SALDO lia colunas inexistentes → trocada por `financial_opening_balances` em `calcularKpis` E `projetarFluxoCaixa90Dias`. ZERO ALTER/DROP/DELETE; ZERO schema. Detalhe: `shared/changelog.ts`.

- **Rev. 2840** — TERCEIROS · RAIO-X 360° · ABA CONTRATOS — NÚMERO DO CONTRATO EM DESTAQUE + COLUNA "SALDO". Pedido (print iPad): "Faltou o Saldo e quero o número do contrato Em destaque." FIX (`TerceiroRaioX.tsx`, só frontend): número virou cabeçalho do card (ícone `FileText` laranja + navy bold mono); NOVA coluna "Saldo" = `baseContrato − valorPago` (`baseContrato = fdMaterialObra>0 ? valorLiquidoMdo : valorTotal`), vermelha quando devendo. ZERO ALTER/DROP/DELETE; ZERO schema; ZERO backend. Detalhe: `shared/changelog.ts`.

- **Rev. 2839** — TERCEIROS · NOME DO TERCEIRO SEMPRE EM MAIÚSCULAS NA EXIBIÇÃO (LISTA + RAIO-X). Pedido (print iPad): nome do terceiro sempre maiúsculo. FIX (só exibição): classe `uppercase` na razão social do card `EmpresasTerceiras.tsx` e no cabeçalho navy de `TerceiroRaioX.tsx`. DECISÃO: transformação só de CSS (não altera o dado) → cobre todos os registros sem `UPDATE` em massa e preserva a razão social oficial no banco. Só razão social (nome fantasia intacto). ZERO ALTER/DROP/DELETE; ZERO schema; ZERO backend. Detalhe: `shared/changelog.ts`.

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
