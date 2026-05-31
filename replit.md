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


- **Rev. 2630** — **PLANEJAMENTO · ABA "AVANÇO SEMANAL" · O "% PREVISTO" ACUMULADO (CURVA CAMINHO B) PASSA A SER CALCULADO EXATAMENTE COMO O MS PROJECT A PARTIR DA BASELINE — SEM LER A COLUNA TEXTO6. ALVO CRAVADO PLN_816 R04 = 3/6/10/14/18.** Pedido (usuário, repetido e enfático): "Esqueça completamente o Texto6, ele é um erro, NÃO vamos usar; o ERP precisa CALCULAR exatamente conforme o MSP." A curva vinha 1/8/14/20/25 (errado). Fix SÓ no recálculo da curva (ZERO SCHEMA/DESTRUTIVO — só UPDATE da própria coluna JSON `previsto_semanas_json`; R-001/R-007/R-010): `server/routers/planejamento.ts` (`regenerarPrevistoSemanasCaminhoB`) — RAIZ deixa de ser MÉDIA PONDERADA das folhas (`round(Σ minutos decorridos ÷ Σ minutos totais)`, que distorcia) e passa a ser `trunc(unitsElapsed(minStart, semana, maxFinish) ÷ unitsTotal(minStart, maxFinish) × 100)` = vão da baseline do PROJETO INTEIRO em tempo útil minuto-a-minuto, reproduzindo a régua interna do MSP para a linha-resumo UID=0; POR ATIVIDADE `Math.round`→`Math.trunc` (paridade com o `int()` do MSP); var `sumTotal` removida. O motor `minutosUteisEntre` (shared/diasUteis) já aplica feriados+almoço+sexta-curta lidos do `calendarioJson`. Validado: script jsdom rodou a nova fórmula via o motor real contra o XML real PLN_816 R04 (cal. UID=6, 396 feriados, 1043 folhas, baseline 01/06 07:00→03/12 16:00) → curva raiz nas 5 semanas = 3/6/10/14/18 EXATO; servidor recompilou limpo (tsx watch); Neon conectado. ESCOPO: o `previstoMspSnapshot` (Texto6) permanece só como fallback interno/portal (a curva tem prioridade no card via `mspReadOnly`/`previstoCurva.raizAt`). Detalhe: `shared/changelog.ts`.
- **Rev. 2629** — **PAINEL RH & DP · A SEÇÃO "QUADRO DE PESSOAL" GANHA UM CARD "TOTAL" COM O NÚMERO DE PESSOAS DA EMPRESA (TODOS OS COLABORADORES CADASTRADOS), IGUAL AO QUE JÁ EXISTE NA ABA COLABORADORES.** Pedido (usuário, com screenshot do Painel RH no iPad): "Coloca nesta tela tbm o card com a informação de quantas pessoas tem na empresa, igual foi feito na aba Colaboradores." Fix SÓ CLIENT (ZERO BACKEND/SCHEMA; R-001/R-007/R-010): `client/src/pages/PainelRH.tsx` — na grade "Quadro de Pessoal" adicionado como PRIMEIRO card (mesma ordem da aba Colaboradores) um `KpiCard title="Total"` (ícone `Users`, cor `blue`) lendo `s.totalFuncionarios` — o MESMO campo de `home.getData.stats` (`allEmps.length`) que alimenta a contagem total, garantindo paridade com a aba Colaboradores (cujo card "Total" usa `employees.stats.total`). Card clicável → `/colaboradores?status=Todos`. Grade passou de `lg:grid-cols-5` para `lg:grid-cols-6` pra acomodar os 6 cards numa linha no desktop, mantendo `grid-cols-2`/`md:grid-cols-3` no mobile/tablet. Validado: servidor reiniciado e recompilou limpo (tsx watch); Neon conectado. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2628** — ANÁLISE DE EXPERIÊNCIA · TRANSPARÊNCIA DO CARTÃO DE PONTO: O MODAL "ANÁLISE" AGORA AVISA QUANDO O CARTÃO DE PONTO NÃO FOI IMPORTADO/FECHADO NO PERÍODO (EM VEZ DE EXIBIR "0 FALTAS / 100% ASSIDUIDADE" ENGANOSO), EXPLICA O CRITÉRIO USADO E MOSTRA OS DADOS BRUTOS DO CARTÃO QUE O ERP ANALISOU — TUDO RESPONSIVO. Fix ADITIVO (SOMENTE SELECT/LEITURA; R-001/R-007/R-010). CAUSA-RAIZ: em `employees.analiseExperiencia`, faltas/assiduidade só enxergam `time_records`; sem nenhuma linha (mês não fechado) faltas=0 e assiduidade cai no DEFAULT 100%. Impl.: `server/routers.ts` (novo objeto `cartao` no retorno + `assiduidade.verificada`); `client/src/components/AnaliseExperiencia.tsx` (cards "N/D"+"sem cartão" quando não verificado; banner âmbar; caixa explicando o critério; seção "Cartão de Ponto (dados analisados)" responsiva). Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

- **Rev. 2627** — DASHBOARD DE FUNCIONÁRIOS · NOVO PAINEL "TOTAL DE FUNCIONÁRIOS POR ANO": MOSTRA O QUADRO ATIVO AO FIM DE CADA ANO DESDE A FUNDAÇÃO DA EMPRESA (GRÁFICO DE BARRAS + CARDS POR ANO) E, AO CLICAR EM UM ANO, ABRE A LISTA COMPLETA DE QUEM ESTAVA ATIVO NAQUELE ANO (NOME + FOTO). Fix ADITIVO (SOMENTE SELECT; R-001/R-007/R-010). SEMÂNTICA: "ativo ao fim do ano" = ponto-no-tempo por DATAS (admitido até 31/12 E sem demissão OU demitido depois); range do 1º ano com admissão até o corrente; INDEPENDE do seletor "Ano de análise". PARIDADE: nº do card usa a MESMA régua do drill `ativosAno`. Impl.: `server/routers/dashboards.ts` (`getDashFuncionariosHeadcountAnual` com CTE `bounds`+`generate_series`; procedure `funcionariosHeadcountAnual`; case `ativosAno` em `getDrillDown`); `HeadcountAnualFuncionarios.tsx` (NOVO); `DashFuncionarios.tsx`. Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

- **Rev. 2626** — DASHBOARD DE FUNCIONÁRIOS · O SELETOR "ANO DE ANÁLISE" PASSA A FILTRAR TUDO: OS 4 CARDS DO TOPO (ATIVOS / DESLIGADOS / ADVERTÊNCIAS / ATESTADOS) E TODOS OS GRÁFICOS REFLETEM A SITUAÇÃO DO ANO ESCOLHIDO. Fix ADITIVO (SOMENTE SELECT; R-001/R-007/R-010). SEMÂNTICA (snapshot do ano): Ativos = quadro ativo AO FIM do ano (por datas; ano atual mantém a régua de STATUS atual → zero regressão); Desligados/Advertências/Atestados = ocorridos DURANTE o ano; gráficos = ativos na data de referência. Impl.: `server/routers/dashboards.ts` (`getDashFuncionarios` year-aware: `refDate`/`yearStart`/`yearEndEvt` + `refDateLit` via `sql.raw`; +3 queries; procedure aceita `ano`); `DashFuncionarios.tsx` (query passa `ano: anoAnalise`; 4 KPIs ganham `sub` com o ano). Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

- **Rev. 2625** — **DASHBOARD DE FUNCIONÁRIOS · A TABELA "CONTRATAÇÕES x DESLIGAMENTOS — COMPARATIVO ANUAL" (ADMISSÕES E DEMISSÕES) FICA TOTALMENTE RESPONSIVA NO CELULAR: EM VEZ DE UMA TABELA DE 9 COLUNAS COM ROLAGEM HORIZONTAL, CADA ANO VIRA UM CARD COM AS INFORMAÇÕES FÁCEIS DE LER.** Pedido (usuário, com screenshot do Dashboard de Funcionários no iPad): "Quero a tabela responsivos e fácil acesso as informações". Fix SÓ CLIENT (ZERO BACKEND/SCHEMA; R-001/R-007/R-010): `client/src/components/ComparativoAnosFuncionarios.tsx` — o helper interno `TabelaMetric` (usado nas duas tabelas, Admissões e Demissões) ganha layout DUPLO: abaixo de `sm` (celular) renderiza um CARD por ano (cabeçalho com ano + badge "ref", TOTAL em destaque e `VarBadge` vs. ano anterior, depois grid de mini-stats `grid-cols-4` T1–T4 e `grid-cols-2` 1º/2º Sem — sem rolagem horizontal); de `sm` pra cima mantém a tabela completa de 9 colunas, agora em `hidden sm:block overflow-x-auto`. Mesmos dados/cálculos (`varPct`/`VarBadge`/destaque do ano-ref) — só apresentação. A "Movimentação mês-a-mês" (`TabelaComparativaAnual.tsx`) já era responsiva (cards mobile + tabela desktop) — sem alteração. Validado: servidor reiniciado e recompilou limpo (tsx watch). Detalhe: `shared/changelog.ts`.

- **Rev. 2624** — DASHBOARD DE AVALIAÇÃO · NOVO RANKING "FUNCIONÁRIOS EM EXPERIÊNCIA" QUE LISTA TODOS OS COLABORADORES EM PERÍODO DE EXPERIÊNCIA (MAIS URGENTES PRIMEIRO) E, EM CADA UM, UM BOTÃO "ANÁLISE" QUE ABRE A FICHA TÉCNICA E DETALHADA DO CONTRATO (REUSA A ANÁLISE DA REV. 2622). Fix ADITIVO (SOMENTE SELECT; R-001/R-007/R-010): `server/routers/avaliacaoFuncionarios.ts` — `carregarInputs` traz campos do contrato no SELECT de `employees`; novo helper `calcularExperiencia` (memória, ZERO SQL) usa a MESMA régua do `home.getData`; `montarLinhaScore` anexa `emExperiencia`+`experiencia`. `DashAvaliacaoFuncionarios.tsx` — `useMemo` `emExperiencia` + Card "Funcionários em Experiência" (tabela responsiva, prazo com badge por urgência, botão "Análise" → `<AnaliseExperiencia>` reusado). Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

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
- **REGRA DE OURO — CAMINHO B (Rev. 2617+, substitui Rev. 2533/2603).** FONTE ÚNICA = coluna `PercentComplete` ("% Concluída") do MS Project, lida nos dois momentos com a MESMA régua → paridade EXATA (PLN_816 R04 = 2/9/15/20 CRAVADO):
  - **% PREVISTO** (raiz e atividades) = fração de duração da baseline em **TEMPO ÚTIL MINUTO-A-MINUTO** (motor `minutosUteisEntre`/`fracaoMinutos` de `shared/diasUteis`, varrendo dia a dia e clipando aos intervalos de trabalho `weekDayIntervals` do calendário do XML). RAIZ = `round(Σ minutos úteis DECORRIDOS de cada folha ÷ Σ minutos úteis TOTAIS × 100)` (ponderado por minutos úteis, NÃO por contagem de atividades); POR ATIVIDADE = `round(fracaoMinutos(BL_Start, semana, BL_Finish, cal) × 100)`. `round` (não `floor`) porque a coluna "% Concluída" do MSP é arredondada.
  - **Baseline COM HORA é OBRIGATÓRIA.** Lê `baseline_start_ts`/`baseline_finish_ts` (TEXT ISO com hora capturada no import). Date-only diverge (PLN_816 daria 2/9/16/22). Sem `weekDayIntervals` no calendário OU sem TS → fallback day-granular ponderado por duração (backward compat). Cutoff semanal segue fim-do-dia (`T23:59:59Z`).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **Mesma coluna nos dois momentos** = paridade matemática absoluta MSP × ERP. Sem `Texto6`/`Texto10`/`Texto11` (continuam sendo gravados em `previsto_msp_pct` por atividade só pra retrocompat — leitura desativada).
  - Snapshot é regenerado SÓ no `salvarAtividades` (substituir/cadastro). Mudou baseline = nova revisão = novo snapshot. Avanço semanal NÃO regenera (baseline é imutável dentro da revisão).
  - Implementação: `server/routers/planejamento.ts` (helper `regenerarPrevistoSemanasCaminhoB` + chamada pós-transaction em `salvarAtividades`; `importarComModo` propaga os TS), `client/src/pages/planejamento/ImportarCronograma.tsx` (parser `<Baseline Number=0>` COM HORA + `<WorkingTime>`→`weekDayIntervals`), `shared/diasUteis.ts` (motor minuto-a-minuto), `drizzle/schema.ts` + self-heal `[SyncSchema+]` (`baseline_start_ts`/`baseline_finish_ts`).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
