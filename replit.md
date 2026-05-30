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


- **Rev. 2584** — **PLANEJAMENTO · ABA "EFETIVO × IA" · CORRIGE O BANNER DE ERRO CRÍPTICO "The string did not match the expected pattern." NO SIMULADOR (E NO DIAGNÓSTICO/ASSISTENTE) NO iPad/iOS SAFARI — AGORA EXIBE MENSAGEM CLARA E ACIONÁVEL.** User (screenshot DEV, obra "HOTEL QIU 2 - 4 FASE", Rev. 0, 47 alocados): ao tocar "Simular previsão" no iPad, banner VERMELHO mostrava a DOMException nativa crua do WebKit. DIAGNÓSTICO (auditoria exaustiva): o banner é `mut.isError` da mutation `simularEfetivo` (não o `erroIa` âmbar nem o ErrorBoundary global). SERVER (`simularEfetivo`/`coletarEfetivoCronograma`/`invokeLLM`) lido e LIMPO (datas via `parseDt`+`isNaN`, `geradoEm` é `.toISOString()` STRING, falhas de IA viram `erroIa` âmbar nunca rejeição); Node não produz essa msg (é nativa iOS/JSC). Comprovado EMPIRICAMENTE que `superjson.serialize()` da resposta dá `meta: undefined` → client NÃO faz `new Date` na desserialização. Client sem `new Date`/`color input`, sem service worker/PWA, sem `superjson.registerCustom`, sem link tRPC custom. CONCLUSÃO: é falha de TRANSPORTE/RUNTIME do iOS (chamada de IA longa/pesada após o `planoAtaque` da Rev. 2583; WebKit aborta/derruba) exibida crua — sem bug rastreável no pipeline. FIX (SÓ CLIENT, ADITIVO, ZERO SCHEMA/SERVER/ALTER/DROP/DELETE) em `AnaliseEfetivoIA.tsx`: novo helper `msgErroIA(err, fallback, acao)` detecta padrões crípticos de transporte/runtime do iOS ("did not match the expected pattern", "load failed", "failed to fetch", "networkerror", "network connection", "the operation couldn't be completed/was aborted", "aborted", "timed out", "tempo limite", vazio) e troca por texto claro e acionável com a AÇÃO parametrizada por call-site (Gerar análise / Simular previsão / Enviar pergunta) + dica de navegador/desktop; erros reais (ex.: validação) seguem intactos via fallback. Aplicado nos 3 pontos de IA: `analisarEfetivo`, `simularEfetivo` e o chat `perguntarEfetivo`. Validado via esbuild (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2583** — **PLANEJAMENTO · ABA "EFETIVO × IA" · SIMULADOR DE MÃO DE OBRA GANHA "PLANO DE ATAQUE": A IA MONTA UMA CAMPANHA ESTILO GUERRA, BASEADA EM LINHA DE BALANÇO, PARA MANTER O PRAZO MESMO COM O EFETIVO REDUZIDO.** User: "no simulador, faça sugestão da Linha de Balanço pra manter o prazo mesmo reduzindo MO — processos construtivos melhores, automações, cenários que um humano não veria; plano de ataque detalhado igual uma guerra; vencer com o que temos; junte literaturas de planejamento + estratégia de guerra + resolução de problemas." FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE): SERVER (`iaCronograma.ts`, `simularEfetivo`) systemPrompt ganha "MISSÃO ESPECIAL — PLANO DE ATAQUE" combinando GUERRA (Sun Tzu, Clausewitz/centro de gravidade, manobra, OODA, logística), RESTRIÇÕES (Goldratt/TOC, primeiros princípios, TRIZ, 5 Porquês) e PRODUÇÃO (LOB/takt, Last Planner, fast-track/crashing, pré-fab/mecanização); JSON ganha objeto `planoAtaque` (missao, vereditoPrazo, centroDeGravidade, principioGuia, frentesCriticas[], manobras[] sequenciadas, processosConstrutivos[], automacoes[], cenariosNaoObvios[], linhaBalancoPlano, kpisAcompanhamento[], condicoesDeVitoria[], sePiorar[]); regra do userPrompt adapta tom por `deltaTotal` (Δ<0 → plano agressivo); maxTokens 8000 + parse tolerante; persistido → aparece no Histórico. CLIENT (`AnaliseEfetivoIA.tsx`) novo `PlanoAtaque` ("sala de guerra" slate-900) no `SimuladorView`: cabeçalho+missão+veredito, centro de gravidade, frentes críticas, manobras como timeline numerada (badge de tipo, fase, impacto prazo, ajuste LOB, fundamento), novo plano LOB, processos/automações, "cenários que um humano não veria", KPIs, vitória × se piorar; guards `Array.isArray`. Validado via esbuild (server+client, exit 0). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2582** — PLANEJAMENTO · ABA "EFETIVO × IA" · REDESIGN MAIS DINÂMICO E MODERNO: (1) LEGENDA INTERATIVA + ASSISTENTE DE DÚVIDAS (Q&A COM A IA), (2) VÁRIOS GRÁFICOS ILUSTRATIVOS (PANORAMA DO EFETIVO) E (3) CARDS DE INSIGHT. SERVER novo endpoint SOMENTE LEITURA `iaCronograma.perguntarEfetivo` (reusa `coletarEfetivoCronograma`, anti-IDOR, `invokeLLM` maxTokens 1000, não persiste). CLIENT (`AnaliseEfetivoIA.tsx`): `PerguntarIA` (Q&A chat-like), `LegendaAjuda` (colapsável), `PanoramaEfetivo` (3 donuts + barra Top funções, client-side), `InsightsEfetivo`/`InsightCard`. Datas via `formatDateTime` iOS-safe. Zero schema/ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2581** — PLANEJAMENTO · ABA "EFETIVO × IA" · CORRIGE O ERRO "The string did not match the expected pattern" NO iPad/iOS SAFARI AO ABRIR A ABA. CAUSA: render de TIMESTAMP cru do Postgres ("YYYY-MM-DD HH:MM:SS") via `new Date(...).toLocaleString` lança RangeError no iOS Safari 17+. FIX (SÓ CLIENT): `AnaliseEfetivoIA.tsx` usa helper iOS-safe `formatDateTime` nas 3 datas; fonte real do erro era o **Simulador de Cenários de Compras** (`PlanejamentoDetalhe.tsx`) — trocado por `fmtTimestampBR`. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2580** — PLANEJAMENTO · ABA "EFETIVO × IA" · TODA ANÁLISE CITA A REFERÊNCIA MAIS RENOMADA DO MUNDO + ANÁLISES SALVAS (NOVA ABA "HISTÓRICO") + GRÁFICOS DOS KPIs. SCHEMA nova tabela `planejamentoAnalisesEfetivo` via `CREATE TABLE IF NOT EXISTS` (sem `db:push`); SERVER (`iaCronograma.ts`) prompts ganham `referenciaPrincipal`+`referencias`, helper `salvarAnaliseEfetivo` (só INSERT) e queries `listarAnalisesEfetivo`/`getAnaliseEfetivo` (anti-IDOR); CLIENT `DiagnosticoView`/`SimuladorView` reusados no histórico + `ReferenciaPrincipal`/`ReferenciasApoio` + gráficos recharts + 3ª aba "Histórico". Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2579** — PLANEJAMENTO · ABA "EFETIVO × IA" · NOVO "SIMULADOR DE MÃO DE OBRA" — AJUSTE O EFETIVO POR FUNÇÃO (+/-) E A IA PROJETA O IMPACTO NO PRAZO, PRODUTIVIDADE, CUSTO E QUALIDADE, FUNDAMENTADO EM LITERATURA REAL. User: "Quero simular redução/aumento de mão de obra e ver previsões segundo as melhores literaturas." SERVER (`iaCronograma.ts`): refatora coleta p/ `coletarEfetivoCronograma()` + parse p/ `extrairJsonIa()`; nova query `efetivoAtual()` + mutation `simularEfetivo({ajustes:[{cargo,delta}]})` (cenário atual+delta clamp 0) → `invokeLLM` pedindo previsão fundamentada (Brooks, curva de aprendizado, PMBOK, Linha de Balanço, TCPO, CII overmanning, Lean) → `previsao`+`cenario`. CLIENT (`AnaliseEfetivoIA.tsx`): alternador Diagnóstico|Simulador, stepper +/-, veredito + 4 cards de impacto + indicadores + efeito por função + riscos/recomendações + fundamentação. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2578** — **PLANEJAMENTO · ABA "EFETIVO × IA" · CORRIGE O ERRO "Não foi possível gerar a análise de IA: Expected ',' or ']' after array element in JSON at position 9887" — JSON DA IA VINHA TRUNCADO POR ESTOURO DE TOKENS.** User (screenshot do banner de erro): a análise caía no fallback (só "Efetivo atual por função"). CAUSA: a resposta da IA estourava o `maxTokens: 4000` e voltava cortada no meio de um array. FIX (SÓ SERVER, `server/routers/iaCronograma.ts`, `analisarEfetivo`): `maxTokens` 4000→8000 + novo helper `repararJsonTruncado(str)` que fecha containers no último ponto seguro (retorna `null` se nada aproveitável); parse com try/catch tenta reparar, usa análise PARCIAL e seta `erroIa` como AVISO suave. Zero client. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
