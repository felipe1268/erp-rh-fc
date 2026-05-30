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


- **Rev. 2599** — **PLANEJAMENTO · AVANÇO SEMANAL · PREVISTO DESTRAVADO: A TELA PASSA A LER A CURVA CAMINHO B (`previsto_semanas_json`) POR SEMANA — ANTES FICAVA CONGELADA EM ~1% (SNAPSHOT ÚNICO DA RAIZ UID=0) E NÃO MUDAVA AO NAVEGAR ENTRE AS SEMANAS.** Sintoma: o card "PREVISTO (SEMANA)" e os derivados (Variação, Avanço Global, "Previsto acumulado", coluna % Previsto por atividade) travavam em ~1% e não mudavam ao trocar a semana. DUAS causas somadas: (1) o CLIENT nunca lia a coluna `previsto_semanas_json` (curva CAMINHO B gerada no cadastro pela fórmula nativa do MSP sobre a baseline) — `mspReadOnly` e os useMemos de previsto liam só o snapshot único da raiz UID=0 do `calendarioJson`, congelado na StatusDate; (2) a coluna estava NULL em TODOS os projetos (curva nunca persistida — cadastros pré-Rev. 2533 / regenerar pós-transaction que não pegou a baseline a tempo). Decisão do usuário MANTIDA: CAMINHO B fica, o ERP só LÊ — esta revisão NÃO altera a geração da curva, só faz a tela LÊ-LA por semana e popula a coluna quando ausente. FIX-A (CLIENT — `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`; ZERO cálculo novo, ZERO schema): novo useMemo `previstoCurva` (parser de `proj.previstoSemanasJson` com `raizAt(alvo)`/`ativAt(id,alvo)`, `idxAt`=maior cutoff `<=` alvo); `mspReadOnly`, `previstoRealizadoSemana` (Δsem/acumulado/débito) e a coluna % por atividade passam a LER a curva (snapshot único e fórmulas legadas viram FALLBACK). FIX-B (SERVER — `server/routers/planejamento.ts` `getProjetoById`; UPDATE da própria coluna JSON via função do app, NÃO é ALTER/DROP/DELETE; ZERO schema): self-heal — se `previsto_semanas_json` está NULL, chama `regenerarPrevistoSemanasCaminhoB` UMA vez para a revisão exibida (is_baseline → última aprovada → 1ª), re-lê e retorna a curva fresca. REFIS, indiretas (estimativa do ERP, única exceção) e TOP BAR (UID=0, não semana-dependente) intocados. Validado via esbuild client + server (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2598** — **PLANEJAMENTO · AVANÇO SEMANAL VIRA LEITURA PURA DO MS PROJECT: REMOVIDA A AUTO-DISTRIBUIÇÃO (Rev. 2237) QUE INVENTAVA AS SEMANAS PASSADAS A PARTIR DA CURVA PREVISTA.** Decisão do usuário (modelo "ERP só LÊ, não calcula"): no import semanal o ERP deve apenas ler a `% Concluída` (PercentComplete) do XML e gravar a semana do StatusDate — sem preencher semanas anteriores com cumulativo planejado. Os 2 XMLs reais confirmaram: no CADASTRO `PercentComplete=0` em todas as 115 atividades, o previsto vive em `Texto6 / % PREVISTO` (fórmula nativa do MSP sobre a baseline) e o realizado/agregados vêm prontos na raiz UID=0. O PREVISTO continua sendo a curva inteira gerada no cadastro pelo CAMINHO B (`regenerarPrevistoSemanasCaminhoB`, = opção escolhida pelo usuário) — NÃO foi aposentado. FIX (SÓ CLIENT — UI/import; ZERO SERVER/SCHEMA/ALTER/DROP/DELETE): `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` (`importarDoMSProject`) — removido o bloco de auto-distribuição (semanas 1..N-1 via `fracaoDecorridaMs`/fallback dias úteis) + o array `matched` + os contadores `semanasAutoSalvas`/`avancosAutoSalvos`/`avancosPreservados` e as mensagens de toast correspondentes. O import passa a só popular `avancoLocal` da semana selecionada (revisão + Salvar) e regravar o snapshot da raiz UID=0. REFIS e indiretas intocados (REFIS já lê snapshots MSP; indiretas seguem com estimativa do ERP, única exceção). Validado via esbuild client (exit 0) + grep zero refs órfãs. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2597** — **PLANEJAMENTO · ABA "EFETIVO × IA" · PLANO DE ATAQUE ENXUTO: FICA SÓ O GUIA PASSO A PASSO + O PLANO TÁTICO + A LINHA DE BALANÇO; AS DEMAIS SEÇÕES NARRATIVAS DA "MESA DE GUERRA" SAEM DA TELA.** User: "só deixa o guia passo a passo" (manter também Linha de Balanço e Plano Tático). FIX (SÓ CLIENT — UI; ZERO SERVER/SCHEMA/ALTER/DROP/DELETE; prompt da IA INTOCADO): `AnaliseEfetivoIA.tsx` (`PlanoAtaque`) mantém Missão/veredito + Guia passo a passo + Plano Tático + Linha de Balanço; remove da renderização Centro de Gravidade, Frentes Críticas, Mesa de Guerra, Manobras, Realocação, Assertividade, Processos/Automações, Cenários, Absorção das férias, KPIs e Condições de vitória. Validado via esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2596** — **PLANEJAMENTO · ABA "EFETIVO × IA" · PLANO DE ATAQUE · LINHA DE BALANÇO POR PAVIMENTO: O EIXO Y PASSA A USAR OS NOMES/NUMERAÇÃO REAIS DO CRONOGRAMA (NÃO MAIS "PAVIMENTO 1..N" GENÉRICOS INVENTADOS PELA IA).** User (screenshot IMG_1412): "numere/nomeie o pavimento CORRETO seguindo o cronograma — veja os NOMES informados lá". CAUSA-RAIZ: o ERP JÁ detecta os pavimentos reais (`detectarPavimento`→`pavimentosDetectados`, Rev. 2593) e os envia à IA, mas o gráfico desenhava `linhaBalancoPavimentos.pavimentos` preenchido PELA IA, que parafraseava ("Pav. 6"→"Pavimento 6") ou renumerava como "Pavimento 1..N". FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE — só leitura + IA + pós-processo no server; CLIENT INTOCADO): SERVER (`server/routers/iaCronograma.ts`) novos helpers `normalizarChavePav` (lowercase + remove acentos NFD iOS-safe + "pavimento"/"andar"→"pav"), `indicePavPorNome` (nome→índice na lista real: exato → por número → contains) e `forcarPavimentosReais` que, quando há `pavimentosDetectados`, SOBRESCREVE `linhaBalancoPavimentos.pavimentos` com a lista REAL (base→topo) e REALINHA cada atividade resolvendo `pavInicio`/`pavFim` por NOME (fallback: índice numérico antigo clampado); chamado após o parse em `simularEfetivo`. Schema ganhou `pavInicioNome`/`pavFimNome` e a instrução manda copiar LITERALMENTE os nomes detectados. CLIENT: nenhuma mudança (`LinhaBalancoPavimentoChart` já lê `lob.pavimentos` + `pavInicio`/`pavFim`). Simulações antigas não são reescritas (re-simular). Validado via esbuild server (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2595** — PLANEJAMENTO · ABA "EFETIVO × IA" · PLANO DE ATAQUE: (1) O BADGE DE FÉRIAS PASSA A MOSTRAR O *MOTIVO* DA INADIABILIDADE; (2) AS LINHAS DE BALANÇO FICAM RESPONSIVAS AO CLIQUE/TOQUE; (3) LEGENDAS CLICÁVEIS NOS DOIS GRÁFICOS LOB. User (screenshots IMG_1410/IMG_1411). FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE — IA + UI): SERVER (`iaCronograma.ts`) schemas de `analisarEfetivo`/`simularEfetivo` ganham `motivoInadiavel` (IA COPIA o motivo já vindo do ERP). CLIENT (`AnaliseEfetivoIA.tsx`) renderiza "Por que é inadiável: …" + `LinhaBalancoPavimentoChart`/`LinhaBalancoChart` ganham estado `sel` (clique destaca atividade; legenda vira botões). Validado via esbuild (exit 0). Ver `shared/changelog.ts`.
- **Rev. 2594** — PLANEJAMENTO · ABA "EFETIVO × IA" · "IMPACTO DAS FÉRIAS NO PRAZO": A CLASSIFICAÇÃO INADIÁVEL × REMANEJÁVEL DEIXA DE OLHAR SÓ A ORDEM DA FRAÇÃO E PASSA A CONSIDERAR A SITUAÇÃO LEGAL (VENCIDA / CONCESSIVO VENCENDO / EM GOZO). User: férias de "Anderson Júnior" apareciam "1º período · remanejável" sendo que o concessivo está VENCENDO (gozo obrigatório). FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE — só leitura de `vacation_periods` + IA): SERVER (`iaCronograma.ts`) `coletarEfetivoCronograma` — `FeriasPeriodo` ganha `inadiavel`/`motivoInadiavel`; SELECT traz `concessivoFim`+`vencida`; classifica por fração ROBUSTO (ordem≥2 / em gozo / VENCIDA / concessivo ≤45d → INADIÁVEL). Prompts `analisarEfetivo`/`simularEfetivo` ganham "MARCAÇÃO LEGAL DO ERP (PRIORITÁRIA)". CLIENT intocado. Validado via esbuild server (exit 0). Ver `shared/changelog.ts`.
- **Rev. 2593** — PLANEJAMENTO · ABA "EFETIVO × IA" · SIMULADOR: LINHA DE BALANÇO DINÂMICA POR PAVIMENTO + REALOCAÇÃO DE EQUIPES (FLUXO DE TAKT) + % DE ASSERTIVIDADE EM TODO O PLANO. User: (1) Linha de Balanço dinâmica analisando TODOS os pavimentos/atividades; (2) Plano de Ataque por pavimento (onde alocar a MDO, por quanto tempo, e depois realocar); (3) plano tático com % de assertividade. FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE — só leitura + IA + UI): SERVER (`iaCronograma.ts`) novo helper `detectarPavimento` (regex iOS-safe); `coletarEfetivoCronograma` anota `__pav`, monta `pavimentosDetectados`/`pavimentosTxt`; `simularEfetivo` estende `planoAtaque` com `linhaBalancoPavimentos`, `realocacaoEquipes`, `assertividadeGlobal` e `assertividade`/`baseAssertividade` por item. CLIENT (`AnaliseEfetivoIA.tsx`) `AssertBadge` + `LinhaBalancoPavimentoChart` (SVG LOB) + seções "Realocação de equipes" e "Assertividade do plano". Validado via esbuild (exit 0). Ver `shared/changelog.ts`.


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
- **REGRA DE OURO — CAMINHO B (Rev. 2533+, substitui Rev. 2427).** FONTE ÚNICA = coluna `PercentComplete` do MS Project, lida nos dois momentos:
  - **% PREVISTO** (raiz e atividades) = EXPANSÃO de `PercentComplete` sobre `BaselineStart`/`BaselineFinish` pela fórmula nativa do MSP `floor(((cutoff − BL_Start) / (BL_Finish − BL_Start)) * 100)`, gerada uma vez no `salvarAtividades` (cadastro do cronograma) e congelada em `planejamento_projetos.previsto_semanas_json`. Matematicamente idêntico a varrer "Data do Status" no MSP semana a semana (Caminho A) — mesma fórmula, mesmo resultado, sem o trabalho repetido.
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **Mesma coluna nos dois momentos** = paridade matemática absoluta MSP × ERP. Sem `Texto6`/`Texto10`/`Texto11` (continuam sendo gravados em `previsto_msp_pct` por atividade só pra retrocompat — leitura desativada).
  - Snapshot é regenerado SÓ no `salvarAtividades` (substituir/cadastro). Mudou baseline = nova revisão = novo snapshot. Avanço semanal NÃO regenera (baseline é imutável dentro da revisão).
  - Implementação: `server/routers/planejamento.ts` (helper `regenerarPrevistoSemanasCaminhoB` L96-203 + chamada pós-transaction em `salvarAtividades`), `client/src/pages/planejamento/ImportarCronograma.tsx` (parser `<Baseline Number=0>` L470-490).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
