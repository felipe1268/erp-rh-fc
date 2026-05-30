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


- **Rev. 2587** — **PLANEJAMENTO · ABA "EFETIVO × IA" · A IA AGORA CONSIDERA AS FÉRIAS DOS FUNCIONÁRIOS ALOCADOS (RH › FÉRIAS) NO CÁLCULO DO EFETIVO, MEDE O IMPACTO NO PRAZO E APLICA A REGRA POR PERÍODO (1º REMANEJÁVEL / 2º E 3º INADIÁVEIS) PARA MANTER O PRAZO FINAL.** User: a IA deve considerar as férias dos alocados no cálculo do efetivo, dizer o impacto no prazo e em qual período (1º/2º/3º). Regra de negócio: 2º (e 3º) período é INADIÁVEL (o funcionário SAI na data); 1º período pode ser remanejado SE a função for imprescindível. FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE; SOMENTE LEITURA de `vacation_periods`): SERVER (`server/routers/iaCronograma.ts`) `coletarEfetivoCronograma` popula `empInfoById` e ganha SEÇÃO 4b que lê `vacationPeriods` (status pendente/agendada/em_gozo, não-deletados) dos alocados, extrai até 3 períodos (1º/2º/3º), descarta encerrados, classifica bucket (EM GOZO / PRÓXIMAS 8 SEM / FUTURO) e retorna `feriasTxt`, `feriasResumoTxt`, `totalFeriasHorizonte`; `analisarEfetivo` ganha bloco de regra no systemPrompt + seção no userPrompt + campo `impactoFerias` no JSON; `simularEfetivo` ganha a seção + `absorcaoFerias` dentro do `planoAtaque`; `perguntarEfetivo` ganha a seção + regra. CLIENT (`AnaliseEfetivoIA.tsx`) novo `ImpactoFerias` no `DiagnosticoView` (badge INADIÁVEL/remanejável por período + datas BR) e bloco "Absorção das férias" no `PlanoAtaque`. Validado via esbuild server+client (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2586** — **PLANEJAMENTO · ABA "EFETIVO × IA" · DATAS SEMPRE NO PADRÃO BRASILEIRO (DD/MM/AAAA) EM TODA A SAÍDA DA IA — DIAGNÓSTICO, SIMULADOR (PLANO DE ATAQUE), ASSISTENTE E HISTÓRICO.** User (screenshot do Plano de Ataque, obra "HOTEL QIU 2 - 4 FASE"): a "Missão" mostrava a data em ISO cru ("...entrega da FASE 4 em 2026-12-10...") — "Data sempre no padrão brasileiro." CAUSA-RAIZ: o cronograma alimentava a IA com datas em ISO (`fmtAtiv`, "Data de referência" via `hoje.toISOString().slice(0,10)`), então a IA ecoava ISO nos textos livres que gera (missão, manobras, condições de vitória…); não havia normalização na saída. FIX (SÓ SERVER, ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE) em `server/routers/iaCronograma.ts`: novos helpers de módulo `isoParaBR(s)` (uma string ISO→"DD/MM/AAAA"), `brDatasTexto(s)` (regex troca TODAS as datas ISO embutidas em texto livre, ignora a hora, com limites de dígito) e `brDatasDeep(obj)` (percorre recursivamente o JSON da IA) — tudo iOS-safe (só regex, sem `new Date`). ENTRADA do prompt em BR: `fmtAtiv` + as 3 "Data de referência" passam por `isoParaBR`. SAÍDA normalizada: `analisarEfetivo`/`simularEfetivo` envolvem o `parsed` em `brDatasDeep`; `perguntarEfetivo` envolve a `resposta` em `brDatasTexto`. HISTÓRICO retroativo: `getAnaliseEfetivo` aplica `brDatasDeep` no `resultado` lido (corrige análises antigas salvas em ISO). Reforço nos 3 system prompts: "TODAS as datas SEMPRE no padrão brasileiro DD/MM/AAAA". Validado via esbuild (exit 0). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2585** — PLANEJAMENTO · ABA "EFETIVO × IA" · CORRIGE A "TRAVA EM 95%" DO SIMULADOR DE MÃO DE OBRA NO iPad/iOS — A SIMULAÇÃO AGORA CONCLUI EM VEZ DE FICAR PENDURADA E CAIR EM ERRO. CAUSA-RAIZ: o `planoAtaque` (Rev. 2583) tornou a `simularEfetivo` a chamada de IA mais pesada da aba (`maxTokens: 8000`); o `invokeLLM` usa Claude Sonnet 4 NÃO-STREAMING, lento demais → estoura o timeout do proxy/iOS antes de retornar. FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE): SERVER (`server/_core/llm.ts`) novo caminho rápido `invokeGeminiFast` (Gemini 2.5 Flash `generateContent`, `thinkingBudget=0`, `responseMimeType:"application/json"`); `invokeLLM` ganha flag `fast?` que tenta o rápido primeiro; `iaCronograma.ts` `simularEfetivo` passa `fast: true`. CLIENT (`AnaliseEfetivoIA.tsx`) barra segue crawl até 99% e salta pra 100% no sucesso. Validado via esbuild (exit 0). Ver `shared/changelog.ts`.
- **Rev. 2584** — PLANEJAMENTO · ABA "EFETIVO × IA" · CORRIGE O BANNER DE ERRO CRÍPTICO "The string did not match the expected pattern." NO SIMULADOR/DIAGNÓSTICO/ASSISTENTE NO iPad/iOS SAFARI — AGORA EXIBE MENSAGEM CLARA E ACIONÁVEL. DIAGNÓSTICO: o banner é `mut.isError` (não `erroIa`/ErrorBoundary); server limpo; é falha de TRANSPORTE/RUNTIME do iOS (chamada de IA longa após o `planoAtaque` da Rev. 2583) exibida crua. FIX (SÓ CLIENT, `AnaliseEfetivoIA.tsx`): helper `msgErroIA(err,fallback,acao)` detecta padrões crípticos do iOS (did not match the expected pattern, load failed, failed to fetch, networkerror, aborted, timed out…) e troca por texto claro com a ação por call-site; erros reais seguem via fallback. Aplicado em `analisarEfetivo`, `simularEfetivo` e `perguntarEfetivo`. Zero schema/ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2583** — PLANEJAMENTO · ABA "EFETIVO × IA" · SIMULADOR DE MÃO DE OBRA GANHA "PLANO DE ATAQUE": A IA MONTA UMA CAMPANHA ESTILO GUERRA, BASEADA EM LINHA DE BALANÇO, PARA MANTER O PRAZO MESMO COM O EFETIVO REDUZIDO. SERVER (`iaCronograma.ts`, `simularEfetivo`) systemPrompt ganha "PLANO DE ATAQUE" (GUERRA: Sun Tzu/Clausewitz/OODA; RESTRIÇÕES: Goldratt/TRIZ/5 Porquês; PRODUÇÃO: LOB/takt/Last Planner/pré-fab); JSON ganha `planoAtaque` (missao, veredito, centroDeGravidade, frentesCriticas[], manobras[] sequenciadas, processosConstrutivos[], automacoes[], cenariosNaoObvios[], linhaBalancoPlano, kpis[], condicoesDeVitoria[], sePiorar[]); maxTokens 8000. CLIENT (`AnaliseEfetivoIA.tsx`) novo `PlanoAtaque` ("sala de guerra") no `SimuladorView`. Zero schema/ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2582** — PLANEJAMENTO · ABA "EFETIVO × IA" · REDESIGN MAIS DINÂMICO E MODERNO: (1) LEGENDA INTERATIVA + ASSISTENTE DE DÚVIDAS (Q&A COM A IA), (2) VÁRIOS GRÁFICOS ILUSTRATIVOS (PANORAMA DO EFETIVO) E (3) CARDS DE INSIGHT. SERVER novo endpoint SOMENTE LEITURA `iaCronograma.perguntarEfetivo` (reusa `coletarEfetivoCronograma`, anti-IDOR, `invokeLLM` maxTokens 1000, não persiste). CLIENT (`AnaliseEfetivoIA.tsx`): `PerguntarIA` (Q&A chat-like), `LegendaAjuda` (colapsável), `PanoramaEfetivo` (3 donuts + barra Top funções, client-side), `InsightsEfetivo`/`InsightCard`. Datas via `formatDateTime` iOS-safe. Zero schema/ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2581** — PLANEJAMENTO · ABA "EFETIVO × IA" · CORRIGE O ERRO "The string did not match the expected pattern" NO iPad/iOS SAFARI AO ABRIR A ABA. CAUSA: render de TIMESTAMP cru do Postgres ("YYYY-MM-DD HH:MM:SS") via `new Date(...).toLocaleString` lança RangeError no iOS Safari 17+. FIX (SÓ CLIENT): `AnaliseEfetivoIA.tsx` usa helper iOS-safe `formatDateTime` nas 3 datas; fonte real do erro era o **Simulador de Cenários de Compras** (`PlanejamentoDetalhe.tsx`) — trocado por `fmtTimestampBR`. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

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
