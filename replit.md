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


- **Rev. 2581** — **PLANEJAMENTO · ABA "EFETIVO × IA" · CORRIGE O ERRO "The string did not match the expected pattern" NO iPad/iOS SAFARI AO ABRIR A ABA.** User (screenshot iPad, obra REVTE-CIVIL): banner vermelho de erro na aba. CAUSA-RAIZ: a Rev. 2580 passou a renderizar `criadoEm` (TIMESTAMP do Postgres da nova tabela `planejamento_analises_efetivo`, lido por `listarAnalisesEfetivo`) no histórico via `new Date(a.criadoEm).toLocaleString("pt-BR")`; Drizzle/superjson entrega o timestamp como string crua "YYYY-MM-DD HH:MM:SS" (espaço, sem 'T'), e o iOS Safari 17+ lança "RangeError: The string did not match the expected pattern" que sobe pela error boundary global — mesma classe de bug já corrigida várias vezes no projeto. FIX (SÓ CLIENT, ZERO SERVER/SCHEMA): `AnaliseEfetivoIA.tsx` passa a usar o helper já existente `formatDateTime` (`client/src/lib/dateUtils.ts` — normaliza espaço→'T', trata Invalid Date→"—", fuso Brasília) nas 3 exibições de data (`criadoEm` no histórico + `geradoEm` no diagnóstico e na simulação). Validado via esbuild (client). Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2580** — **PLANEJAMENTO · ABA "EFETIVO × IA" · (1) TODA ANÁLISE CITA A REFERÊNCIA MAIS RENOMADA DO MUNDO NO ASSUNTO; (2) ANÁLISES FICAM SALVAS PARA CONSULTA FUTURA (NOVA ABA "HISTÓRICO"); (3) GRÁFICOS COM OS KPIs DAS INDICAÇÕES.** User: "toda análise deve citar a referência mais renomada do mundo, ficar salva pra consulta, e quero gráficos com os KPIs." FIX (ADITIVO, ZERO ALTER/DROP/DELETE): SCHEMA nova tabela `planejamentoAnalisesEfetivo` (`planejamento_analises_efetivo`: id, projeto_id, company_id, tipo, veredito, titulo, obra, revisao_numero, resultado(json completo), contexto(json), erro_ia, criado_por, criado_em) criada via `CREATE TABLE IF NOT EXISTS` + índice (sem `db:push`). SERVER (`server/routers/iaCronograma.ts`): prompts de `analisarEfetivo`/`simularEfetivo` ganham `referenciaPrincipal`{autor,obra,ano,porque} (IA cita a mais consagrada — PMBOK/TCPO/CII/Koskela/Brooks); diagnóstico também emite `referencias`; helper `salvarAnaliseEfetivo` (best-effort, só INSERT) grava o resultado completo (só quando `parsed`), ambas retornam `analiseId`; novas queries `listarAnalisesEfetivo`/`getAnaliseEfetivo` (mesma tenancy, anti-IDOR no get). CLIENT (`AnaliseEfetivoIA.tsx`): render extraído p/ `DiagnosticoView`/`SimuladorView` (reusadas no histórico); card `ReferenciaPrincipal` em destaque + `ReferenciasApoio`; gráficos recharts (barras Atual×Sugerido/Simulado + pizza distribuição das ações); 3ª aba "Histórico" lista e reabre as análises salvas. Validado via esbuild (server+client). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2579** — PLANEJAMENTO · ABA "EFETIVO × IA" · NOVO "SIMULADOR DE MÃO DE OBRA" — AJUSTE O EFETIVO POR FUNÇÃO (+/-) E A IA PROJETA O IMPACTO NO PRAZO, PRODUTIVIDADE, CUSTO E QUALIDADE, FUNDAMENTADO EM LITERATURA REAL. User: "Quero simular redução/aumento de mão de obra e ver previsões segundo as melhores literaturas." SERVER (`iaCronograma.ts`): refatora coleta p/ `coletarEfetivoCronograma()` + parse p/ `extrairJsonIa()`; nova query `efetivoAtual()` + mutation `simularEfetivo({ajustes:[{cargo,delta}]})` (cenário atual+delta clamp 0) → `invokeLLM` pedindo previsão fundamentada (Brooks, curva de aprendizado, PMBOK, Linha de Balanço, TCPO, CII overmanning, Lean) → `previsao`+`cenario`. CLIENT (`AnaliseEfetivoIA.tsx`): alternador Diagnóstico|Simulador, stepper +/-, veredito + 4 cards de impacto + indicadores + efeito por função + riscos/recomendações + fundamentação. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2578** — **PLANEJAMENTO · ABA "EFETIVO × IA" · CORRIGE O ERRO "Não foi possível gerar a análise de IA: Expected ',' or ']' after array element in JSON at position 9887" — JSON DA IA VINHA TRUNCADO POR ESTOURO DE TOKENS.** User (screenshot do banner de erro): a análise caía no fallback (só "Efetivo atual por função"). CAUSA: a resposta da IA estourava o `maxTokens: 4000` e voltava cortada no meio de um array. FIX (SÓ SERVER, `server/routers/iaCronograma.ts`, `analisarEfetivo`): `maxTokens` 4000→8000 + novo helper `repararJsonTruncado(str)` que fecha containers no último ponto seguro (retorna `null` se nada aproveitável); parse com try/catch tenta reparar, usa análise PARCIAL e seta `erroIa` como AVISO suave. Zero client. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2577** — **PLANEJAMENTO · ABA "EFETIVO × IA" · BARRA DE PROGRESSO 0–100% COM AS ETAPAS DO PROCESSAMENTO ENQUANTO A IA ANALISA.** User (screenshot do botão travado em "Analisando…"): "Quero de 0 a 100% e mostrar os detalhes que estão sendo feitos." FIX (SÓ CLIENT, `client/src/pages/planejamento/AnaliseEfetivoIA.tsx`): painel com barra 0–100% + percentual + lista das 5 etapas (ícone, spinner na ativa, check nas concluídas) enquanto `mutation.isPending`; avanço SIMULADO via `setInterval` (sobe até 95%, fecha em 100% no `onSuccess`). Zero servidor. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2576** — PLANEJAMENTO · NOVA ABA "EFETIVO × IA" (`/planejamento/:id`) · CRUZA O EFETIVO ATUAL DA OBRA COM O CRONOGRAMA E A IA DIAGNOSTICA O DIMENSIONAMENTO DA EQUIPE (CONTRATAR / REDUZIR / MANTER POR FUNÇÃO). User: "Quero uma aba que cruza o efetivo com o cronograma e analisa via IA se o efetivo está compatível com as atividades... indicadores pra saber se podemos reduzir ou contratar." FIX (SOMENTE LEITURA): SERVER nova mutation `analisarEfetivo({projetoId,companyId})` (`server/routers/iaCronograma.ts`) — resolve projeto+obra, escolhe revisão (baseline>aprovada>última), agrega efetivo via `getObraFuncionarios` por função/categoria MO/vínculo/status, lê atividades folha em andamento + próximas 8 semanas (56d) por peso, chama `invokeLLM` (Claude→fallback Gemini, json_object) pedindo JSON estruturado; fallback retorna efetivo bruto + `erroIa`. CLIENT novo `AnaliseEfetivoIA.tsx`; `PlanejamentoDetalhe.tsx`+`DashboardLayout.tsx` registram a aba `efetivo-ia`. Tenancy validado. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2575** — RH & DP · BANCO DE HORAS (`/banco-horas`, aba "Saldos") · SELEÇÃO MÚLTIPLA DE FUNCIONÁRIOS + "DAR BAIXA NOS SELECIONADOS" (ZERA O SALDO EM LOTE). User (screenshot com 62 func. com saldo): "Quero múltipla seleção, e poder dar baixa em todos, pq todos estes foram pagos da última vez." Antes só débito individual. FIX (não-destrutivo, só UPDATE/INSERT): SERVER nova mutation `debitarBancoLote({employeeIds[],companyId,descricao,data})` (`server/routers/horasExtras.ts`) que ZERA o saldo de cada selecionado gravando `tipo='debito'`; cada item em `db.transaction` (UPDATE `=0` com guard `>0` + saldo anterior via CTE/RETURNING + INSERT atômicos), `try/catch` isola falhas parciais; retorna `{processados,totalMinutos,ignorados,falhas}`. CLIENT (`BancoHoras.tsx`) checkbox + "selecionar todos", barra de ação, Dialog de confirmação (data + motivo default). Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.


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
