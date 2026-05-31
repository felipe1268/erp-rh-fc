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


- **Rev. 2626** — **DASHBOARD DE FUNCIONÁRIOS · O SELETOR "ANO DE ANÁLISE" PASSA A FILTRAR TUDO: OS 4 CARDS DO TOPO (ATIVOS / DESLIGADOS / ADVERTÊNCIAS / ATESTADOS) E TODOS OS GRÁFICOS (STATUS, GÊNERO, CONTRATO, FUNÇÕES, SETORES, PIRÂMIDE ETÁRIA, TEMPO DE CASA, ETC.) REFLETEM A SITUAÇÃO DO ANO ESCOLHIDO.** Pedido (usuário): trocar o "Ano de análise" não mudava os cards/gráficos do topo (só as tabelas comparativas embaixo); pediu explicitamente que o filtro afetasse "TUDO no dashboard". Fix ADITIVO (SOMENTE SELECT/LEITURA — ZERO ALTER/DROP/DELETE; R-001/R-007/R-010). SEMÂNTICA (snapshot do ano): **Ativos** = quadro ativo AO FIM do ano (ponto-no-tempo por datas de admissão/demissão; ANO ATUAL mantém a régua de STATUS atual → zero regressão, 123 continua 123); **Desligados/Advertências/Atestados** = ocorridos DURANTE o ano (por `dataDemissao`/`dataOcorrencia`/`dataEmissao`); **gráficos** = ativos na data de referência (idade/tempo calculados NAQUELA data); **admissões/demissões mensais** = meses do ano-calendário. LIMITAÇÃO HONESTA: só há STATUS ATUAL (sem histórico) → para anos PASSADOS o gráfico "Status" mostra só Ativo/Férias reconstruídos por `vacationPeriods` (Afastado/Recluso ficam dobrados em Ativo). Impl.: `server/routers/dashboards.ts` (`getDashFuncionarios(companyId, companyIds?, ano?)` year-aware: `refDate`/`yearStart`/`yearEndEvt` + `refDateLit` via `sql.raw` p/ casar SELECT+GROUP BY; `activeWhere` ramifica; +3 queries 23/24/25; retorno inclui `ano`; procedure aceita `ano` no zod + na cacheKey); `client/src/pages/dashboards/DashFuncionarios.tsx` (query passa `ano: anoAnalise` — causa-raiz; 4 KPIs ganham `sub` com o ano). Validado: servidor reiniciado e recompilou limpo (tsx watch); Neon conectado. Detalhe: `shared/changelog.ts`.
- **Rev. 2625** — **DASHBOARD DE FUNCIONÁRIOS · A TABELA "CONTRATAÇÕES x DESLIGAMENTOS — COMPARATIVO ANUAL" (ADMISSÕES E DEMISSÕES) FICA TOTALMENTE RESPONSIVA NO CELULAR: EM VEZ DE UMA TABELA DE 9 COLUNAS COM ROLAGEM HORIZONTAL, CADA ANO VIRA UM CARD COM AS INFORMAÇÕES FÁCEIS DE LER.** Pedido (usuário, com screenshot do Dashboard de Funcionários no iPad): "Quero a tabela responsivos e fácil acesso as informações". Fix SÓ CLIENT (ZERO BACKEND/SCHEMA; R-001/R-007/R-010): `client/src/components/ComparativoAnosFuncionarios.tsx` — o helper interno `TabelaMetric` (usado nas duas tabelas, Admissões e Demissões) ganha layout DUPLO: abaixo de `sm` (celular) renderiza um CARD por ano (cabeçalho com ano + badge "ref", TOTAL em destaque e `VarBadge` vs. ano anterior, depois grid de mini-stats `grid-cols-4` T1–T4 e `grid-cols-2` 1º/2º Sem — sem rolagem horizontal); de `sm` pra cima mantém a tabela completa de 9 colunas, agora em `hidden sm:block overflow-x-auto`. Mesmos dados/cálculos (`varPct`/`VarBadge`/destaque do ano-ref) — só apresentação. A "Movimentação mês-a-mês" (`TabelaComparativaAnual.tsx`) já era responsiva (cards mobile + tabela desktop) — sem alteração. Validado: servidor reiniciado e recompilou limpo (tsx watch). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2624** — DASHBOARD DE AVALIAÇÃO · NOVO RANKING "FUNCIONÁRIOS EM EXPERIÊNCIA" QUE LISTA TODOS OS COLABORADORES EM PERÍODO DE EXPERIÊNCIA (MAIS URGENTES PRIMEIRO) E, EM CADA UM, UM BOTÃO "ANÁLISE" QUE ABRE A FICHA TÉCNICA E DETALHADA DO CONTRATO (REUSA A ANÁLISE DA REV. 2622). Fix ADITIVO (SOMENTE SELECT; R-001/R-007/R-010): `server/routers/avaliacaoFuncionarios.ts` — `carregarInputs` traz campos do contrato no SELECT de `employees`; novo helper `calcularExperiencia` (memória, ZERO SQL) usa a MESMA régua do `home.getData`; `montarLinhaScore` anexa `emExperiencia`+`experiencia`. `DashAvaliacaoFuncionarios.tsx` — `useMemo` `emExperiencia` + Card "Funcionários em Experiência" (tabela responsiva, prazo com badge por urgência, botão "Análise" → `<AnaliseExperiencia>` reusado). Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

- **Rev. 2623** — DASHBOARD DE AVALIAÇÃO · MODAL "SCORE DETALHADO" (AVALIAÇÃO 360°, 6 DIMENSÕES) GANHA LAYOUT MAIS LIMPO E TOTALMENTE RESPONSIVO PARA iPad/CELULAR, COM OS DADOS PERTINENTES MAIS FÁCEIS DE LOCALIZAR. Fix SÓ CLIENT (ZERO BACKEND/SCHEMA): `DashAvaliacaoFuncionarios.tsx` — `DialogContent` `resizable={false}` + largura/padding responsivos + `max-h-[80vh]`; hero empilha no mobile; grid das 6 dimensões `grid-cols-2 sm:grid-cols-3` e `SubScoreCard` não trunca mais o rótulo; "Dados Brutos" viram helper `Stat` (número em destaque + cor de alerta). Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

- **Rev. 2622** — CONTRATOS DE EXPERIÊNCIA · NOVO BOTÃO "ANÁLISE" EM CADA COLABORADOR EM PERÍODO DE EXPERIÊNCIA QUE CRUZA TODAS AS OCORRÊNCIAS DO PERÍODO (ASSIDUIDADE/FALTAS, ATRASOS, ADVERTÊNCIAS, ATESTADOS, ACIDENTES E HISTÓRICO) E DEVOLVE UM VEREDITO SUGERIDO (SCORE 0–100). Fix ADITIVO (SOMENTE SELECT; R-001/R-007/R-010): novo procedure `employees.analiseExperiencia` em `server/routers.ts` (janela do contrato + coleta em memória + score base 100 penalizando disciplina/assiduidade → veredito efetivar/ressalvas/prorrogar/desligar); novo `client/src/components/AnaliseExperiencia.tsx` (Dialog com gauge SVG); botão "Análise" + modal em `Home.tsx` e `PainelRH.tsx`. Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

- **Rev. 2621** — RAIO-X DO COLABORADOR · ABA "ACIDENTES" · CADA LINHA DA TABELA DE ACIDENTES DE TRABALHO PASSA A SER CLICÁVEL E ABRE UM MODAL COM TODOS OS DETALHES DO ACIDENTE (DESCRIÇÃO, CAT, AGENTE CAUSADOR, AÇÃO CORRETIVA, TESTEMUNHAS, ANEXO ETC.). Fix SÓ CLIENT (ZERO BACKEND/SCHEMA — `docs.raioX` já devolve o registro inteiro de `accidents`): `client/src/components/RaioXFuncionario.tsx` ganha state `acidenteDetalhe`; cada `<tr>` da aba "Acidentes" vira clicável (`role=button`, `tabIndex`, hover, ícone `Eye`) → `<Dialog>` (max-w-2xl, scroll) com todos os campos em seções (badges, Geral, CAT, Descrição, Ação Corretiva, Testemunhas, link p/ `documentoUrl`). Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

- **Rev. 2620** — DASHBOARD DE FUNCIONÁRIOS · OS RANKINGS "DE ADVERTÊNCIAS" E "DE ATESTADOS / FALTAS" PASSAM A EXIBIR A FOTO DO CADASTRO DE CADA FUNCIONÁRIO (FALLBACK = INICIAL DO NOME), COM A LINHA CLICÁVEL → RAIO-X. Fix ADITIVO (só SELECT; R-001/R-007/R-010): `server/routers/dashboards.ts` (`getDashFuncionarios`) — queries 18/19 ganham `employees.fotoUrl` no SELECT + `GROUP BY`; retorno inclui `employeeId`+`fotoUrl`. `DashFuncionarios.tsx` — novo `RankAvatar` (img `h-9 w-9` com `onError`→inicial); as duas listas renderizam avatar + viram `<Link href="/raio-x/${employeeId}">`. Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

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
