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


- **Rev. 2632** — **PLANEJAMENTO · IMPORTAÇÃO DE CRONOGRAMA · AUTO-COMPLETAR FERIADOS MÓVEIS NACIONAIS (CARNAVAL, SEXTA-FEIRA SANTA, CORPUS CHRISTI): QUANDO FALTAM NO CALENDÁRIO DO XML, O ERP CALCULA AS DATAS A PARTIR DA PÁSCOA, INJETA NO CÁLCULO DO "% PREVISTO" E AVISA O ENGENHEIRO.** Pedido (usuário): "A 1ª semana o previsto deu 3% no ERP, mas no MSP simulei e deu 2% — se a conta é igual, o erro está em outro lugar." CAUSA-RAIZ (provada por scripts contra os XMLs reais): a conta do ERP é IDÊNTICA à do MSP (ambos reproduzem o Texto6 do arquivo = 3%); a divergência está no DADO — o calendário UID=6 ("Padrão Guaratinguetá") do XML NÃO tem Corpus Christi (qui 04/06/2026 = Páscoa 05/04 + 60d), e lança Carnaval/Sexta Santa em datas FIXAS ERRADAS. Sem Corpus Christi, 04/06 conta como dia útil → semana 1 = 2160 min ÷ 68580 = 3,15% → 3%; COM = 1620 ÷ 68040 = 2,36% → 2% (= simulação do usuário). Diferença = 1 dia útil. Fix SÓ CLIENT (ZERO BACKEND/SCHEMA; R-001/R-007/R-010): `client/src/pages/planejamento/ImportarCronograma.tsx` — nova `feriadosMoveisBR(year)` (Páscoa por Meeus/Butcher → Carnaval seg/ter, Sexta Santa, Corpus Christi) e nova `completarFeriadosMoveisBR(cal,anoIni,anoFim)` ADITIVA (injeta em `cal.exceptions` os móveis que faltam e caem em dia útil, p/ cada ano do escopo, sem remover nada); chamada em `parseMSProjectFull` ANTES de montar o `calendarioJson` → o feriado flui pro server e entra na curva "% Previsto" (Caminho B), que tem prioridade no card (`mspReadOnly`/`previstoCurva`). AVISO âmbar (1º da lista) lista os feriados injetados. Prova numérica: SEM Corpus Christi = 3/6/10/14/18; COM = 2/6/10/14/17. Validado: `feriadosMoveisBR(2026)` confere as datas em node; esbuild transform limpo. Detalhe: `shared/changelog.ts`.
- **Rev. 2631** — **PLANEJAMENTO · IMPORTAÇÃO DE CRONOGRAMA · ANÁLISE DE INTEGRIDADE PRÉ-UPLOAD: O ERP EXAMINA O XML DO MS PROJECT ANTES DE SUBIR E, SE FALTAR INFORMAÇÃO ESSENCIAL PRO "% PREVISTO" BATER COM O MSP, BLOQUEIA O ENVIO E EXPLICA O QUE FALTA. ARQUIVO COMPLETO GANHA SELO VERDE; PENDÊNCIAS MENORES VIRAM AVISOS ÂMBAR.** Pedido (usuário): "Faça uma análise no arquivo antes do upload; se faltar algo, gere um alerta dizendo o que falta e não deixe subir — assim garantimos todas as informações." Até a Rev. 2630 o ERP caía num fallback aproximado EM SILÊNCIO. Fix SÓ CLIENT (ZERO BACKEND/SCHEMA; R-001/R-007/R-010): `client/src/pages/planejamento/ImportarCronograma.tsx` — novo `baselineReal` em `TarefaImportada` (TRUE só quando a `<Baseline 0>` tem Start E Finish válidos, não NA/2049, distinguindo baseline real do fallback); nova função pura `analisarIntegridadeMSP(tarefas,cal,statusDate)→{bloqueios,avisos}` chamada em `parseMSProjectFull`. BLOQUEIA (não deixa subir): (1) calendário sem jornada (`weekDayIntervals`), (2) NENHUMA atividade com baseline real, (3) baseline date-only (sem hora). AVISA (não bloqueia): baseline parcial (algumas folhas sem → usam datas vigentes, raiz continua correta pelo envelope), sem StatusDate, sem feriados. `handleFile` trava no passo upload com caixa vermelha listando o que falta; preview OK mostra selo verde + avisos. CALIBRAÇÃO CRÍTICA: o XML válido PLN_816 R04 tem 62/1105 folhas sem baseline e mesmo assim a curva raiz bate exato (régua usa o ENVELOPE min-início→max-término) — por isso parcial é AVISO, não bloqueio; verificado por script que o arquivo bom PASSA. Validado: HMR recompilou limpo (vite). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2630** — PLANEJAMENTO · ABA "AVANÇO SEMANAL" · O "% PREVISTO" ACUMULADO (CURVA CAMINHO B) PASSA A SER CALCULADO EXATAMENTE COMO O MS PROJECT A PARTIR DA BASELINE — SEM LER A COLUNA TEXTO6. ALVO CRAVADO PLN_816 R04 = 3/6/10/14/18. Fix SÓ recálculo da curva (ZERO SCHEMA/DESTRUTIVO — só UPDATE da coluna JSON `previsto_semanas_json`; R-001/R-007/R-010): `server/routers/planejamento.ts` (`regenerarPrevistoSemanasCaminhoB`) — RAIZ deixa de ser média ponderada das folhas e passa a `trunc(unitsElapsed(minStart,semana,maxFinish) ÷ unitsTotal(minStart,maxFinish) × 100)` (baseline do PROJETO INTEIRO em tempo útil minuto-a-minuto, régua da linha-resumo UID=0); POR ATIVIDADE `Math.round`→`Math.trunc` (paridade com `int()` do MSP). Motor `minutosUteisEntre` (shared/diasUteis) aplica feriados+almoço+sexta-curta do `calendarioJson`. Validado: jsdom rodou a fórmula via motor real no XML PLN_816 R04 → 3/6/10/14/18 EXATO. ESCOPO: `previstoMspSnapshot` (Texto6) vira só fallback (curva tem prioridade via `mspReadOnly`/`previstoCurva.raizAt`). Detalhe: `shared/changelog.ts`.

- **Rev. 2629** — PAINEL RH & DP · A SEÇÃO "QUADRO DE PESSOAL" GANHA UM CARD "TOTAL" COM O NÚMERO DE PESSOAS DA EMPRESA (TODOS OS COLABORADORES CADASTRADOS), IGUAL AO QUE JÁ EXISTE NA ABA COLABORADORES. Fix SÓ CLIENT (ZERO BACKEND/SCHEMA; R-001/R-007/R-010): `client/src/pages/PainelRH.tsx` — na grade "Quadro de Pessoal" adicionado como PRIMEIRO card um `KpiCard title="Total"` (ícone `Users`, cor `blue`) lendo `s.totalFuncionarios` (o MESMO campo de `home.getData.stats`), garantindo paridade com a aba Colaboradores. Card clicável → `/colaboradores?status=Todos`. Grade `lg:grid-cols-5`→`lg:grid-cols-6`. Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

- **Rev. 2628** — ANÁLISE DE EXPERIÊNCIA · TRANSPARÊNCIA DO CARTÃO DE PONTO: O MODAL "ANÁLISE" AGORA AVISA QUANDO O CARTÃO DE PONTO NÃO FOI IMPORTADO/FECHADO NO PERÍODO (EM VEZ DE EXIBIR "0 FALTAS / 100% ASSIDUIDADE" ENGANOSO), EXPLICA O CRITÉRIO USADO E MOSTRA OS DADOS BRUTOS DO CARTÃO QUE O ERP ANALISOU — TUDO RESPONSIVO. Fix ADITIVO (SOMENTE SELECT/LEITURA; R-001/R-007/R-010). CAUSA-RAIZ: em `employees.analiseExperiencia`, faltas/assiduidade só enxergam `time_records`; sem nenhuma linha (mês não fechado) faltas=0 e assiduidade cai no DEFAULT 100%. Impl.: `server/routers.ts` (novo objeto `cartao` no retorno + `assiduidade.verificada`); `client/src/components/AnaliseExperiencia.tsx` (cards "N/D"+"sem cartão" quando não verificado; banner âmbar; caixa explicando o critério; seção "Cartão de Ponto (dados analisados)" responsiva). Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

- **Rev. 2627** — DASHBOARD DE FUNCIONÁRIOS · NOVO PAINEL "TOTAL DE FUNCIONÁRIOS POR ANO": MOSTRA O QUADRO ATIVO AO FIM DE CADA ANO DESDE A FUNDAÇÃO DA EMPRESA (GRÁFICO DE BARRAS + CARDS POR ANO) E, AO CLICAR EM UM ANO, ABRE A LISTA COMPLETA DE QUEM ESTAVA ATIVO NAQUELE ANO (NOME + FOTO). Fix ADITIVO (SOMENTE SELECT; R-001/R-007/R-010). SEMÂNTICA: "ativo ao fim do ano" = ponto-no-tempo por DATAS (admitido até 31/12 E sem demissão OU demitido depois); range do 1º ano com admissão até o corrente; INDEPENDE do seletor "Ano de análise". PARIDADE: nº do card usa a MESMA régua do drill `ativosAno`. Impl.: `server/routers/dashboards.ts` (`getDashFuncionariosHeadcountAnual` com CTE `bounds`+`generate_series`; procedure `funcionariosHeadcountAnual`; case `ativosAno` em `getDrillDown`); `HeadcountAnualFuncionarios.tsx` (NOVO); `DashFuncionarios.tsx`. Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

- **Rev. 2626** — DASHBOARD DE FUNCIONÁRIOS · O SELETOR "ANO DE ANÁLISE" PASSA A FILTRAR TUDO: OS 4 CARDS DO TOPO (ATIVOS / DESLIGADOS / ADVERTÊNCIAS / ATESTADOS) E TODOS OS GRÁFICOS REFLETEM A SITUAÇÃO DO ANO ESCOLHIDO. Fix ADITIVO (SOMENTE SELECT; R-001/R-007/R-010). SEMÂNTICA (snapshot do ano): Ativos = quadro ativo AO FIM do ano (por datas; ano atual mantém a régua de STATUS atual → zero regressão); Desligados/Advertências/Atestados = ocorridos DURANTE o ano; gráficos = ativos na data de referência. Impl.: `server/routers/dashboards.ts` (`getDashFuncionarios` year-aware: `refDate`/`yearStart`/`yearEndEvt` + `refDateLit` via `sql.raw`; +3 queries; procedure aceita `ano`); `DashFuncionarios.tsx` (query passa `ano: anoAnalise`; 4 KPIs ganham `sub` com o ano). Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

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
