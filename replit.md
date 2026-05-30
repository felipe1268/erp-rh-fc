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


- **Rev. 2591** — **PLANEJAMENTO · ABA "EFETIVO × IA" · O PROGRESSO 0–100% (COM TODAS AS ETAPAS EM ANDAMENTO) FICA VISÍVEL NO iPad TAMBÉM NO SIMULADOR.** User (screenshot QIU 2 - FASE 4): "Quero um % de 0 a 100% e ver todos processo em andamento". O painel de progresso (barra 0–100% + 5 etapas com ícone/spinner) JÁ EXISTIA (Rev. 2577/2585), mas no Simulador ele nasce ABAIXO da tabela longa de ~47 funções — o usuário toca em "Simular previsão" no rodapé e o painel aparece fora da vista, parecendo que só há o botão "Simulando…" parado. FIX (SÓ CLIENT, ZERO SERVER/SCHEMA/ALTER/DROP/DELETE) em `client/src/pages/planejamento/AnaliseEfetivoIA.tsx`: (1) `PainelProgresso` ganha `ref`+`useEffect` com `scrollIntoView({behavior:"smooth",block:"center"})` ao montar — o painel entra na tela sozinho (vale Diagnóstico e Simulador, componente compartilhado); (2) os botões exibem o % enquanto processam ("Simulando… {progresso}%" / "Analisando… {progresso}%"), o % aparece onde o usuário toca mesmo antes de rolar. Sem mudança na lógica de progresso nem nas chamadas de IA. Validado via esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2590** — **PLANEJAMENTO · ABA "EFETIVO × IA" · SIMULADOR DE MÃO DE OBRA: (1) VOLTA A USAR A IA DO CLAUDE; (2) SEM LIMITE DE INFORMAÇÃO (NÃO TRUNCA MAIS A RESPOSTA); (3) O ERP AGORA DESENHA A LINHA DE BALANÇO (GRÁFICO); (4) NOVO "PLANO TÁTICO" ALOCANDO A EQUIPE NAS ATIVIDADES; (5) "GUIA PASSO A PASSO" DIDÁTICO PARA ATÉ UM ESTAGIÁRIO SEGUIR.** User (screenshot QIU 2 - FASE 4): a simulação vinha com "Resposta gerada de forma parcial (atingiu o limite de tamanho)". Pediu Claude, "consulta ilimitada", que o ERP gere a Linha de Balanço, didática total, plano tático por atividade e que até um estagiário consiga conduzir. DIAGNÓSTICO: a Rev. 2585 pôs `fast:true` (Gemini) por causa do timeout do iPad, mas o `maxTokens:8000` truncava o plano (maior desde a Rev. 2583/2588). FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE): SERVER (`server/routers/iaCronograma.ts`, `simularEfetivo`) remove `fast:true` (volta ao Claude; Gemini segue fallback), `maxTokens 8000→16000`, e o JSON do `planoAtaque` ganha `planoTatico` (alocação por ATIVIDADE — equipe/período BR/meta/ritmo/comoFazer/porQue/checagem), `linhaBalanco` (dados p/ o ERP desenhar — unidade/inicioRef/horizonteSemanas/atividades[inicioSemana,fimSemana,ritmo,equipe]/leitura) e `guiaEstagiario` (roteiro numerado) + instruções de didática. Trade-off de latência aceito, mitigado pela persistência (salva mesmo se o cliente cair no timeout) + restauração da última análise (Rev. 2588). CLIENT (`AnaliseEfetivoIA.tsx`, `PlanoAtaque`) novo `LinhaBalancoChart` (SVG sem deps — semanas no X, atividade = faixa diagonal/"linha de produção"), seção "Plano tático — quem faz cada atividade" e "Guia passo a passo" no topo do plano. Validado via esbuild server+client (exit 0). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2589** — PLANEJAMENTO · ABA "EFETIVO × IA" · (1) CORRIGE O "TIRE SUAS DÚVIDAS COM A IA" QUE NÃO RESPONDIA NO iPad/SAFARI (TIMEOUT); (2) TODA PERGUNTA DIGITADA PASSA A SER REGISTRADA E FICA VISÍVEL EM "TELEMETRIA & ANALYTICS › ANALYTICS DA IA". SERVER (`iaCronograma.ts` `perguntarEfetivo`): `invokeLLM` ganha `fast:true` (Gemini, responde antes do timeout; Claude fallback) + INSERT best-effort em `ia_modulo_conversas` (modulo "planejamento", pergunta/resposta/user/projeto, try/catch). CLIENT: nenhuma mudança — `Telemetria.tsx` já renderiza `ultimasPerguntas`. Zero schema/ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2588** — PLANEJAMENTO · ABA "EFETIVO × IA" · (1) A ANÁLISE/SIMULAÇÃO FICA SALVA E É RESTAURADA AO REABRIR A TELA; (2) O "PLANO DE ATAQUE" GANHA UMA "MESA DE GUERRA" QUE ALOCA OS FUNCIONÁRIOS NAS FRENTES. SERVER (`iaCronograma.ts`) novo query `ultimaAnaliseEfetivo` (anti-IDOR, última salva, `brDatasDeep`) + `simularEfetivo` ganha `alocacaoFrentes` no `planoAtaque` [{frente,local,objetivo,equipe[{cargo,qtd,papel}],totalPessoas,ritmo,duracao,dependeDe,risco}] (MESA DE GUERRA). CLIENT (`AnaliseEfetivoIA.tsx`) restaura a última análise (banner discreto) + seção "Mesa de guerra — alocação nas frentes". Validado via esbuild (exit 0). Ver `shared/changelog.ts`.
- **Rev. 2587** — PLANEJAMENTO · ABA "EFETIVO × IA" · A IA AGORA CONSIDERA AS FÉRIAS DOS FUNCIONÁRIOS ALOCADOS (RH › FÉRIAS) NO CÁLCULO DO EFETIVO, MEDE O IMPACTO NO PRAZO E APLICA A REGRA POR PERÍODO (1º REMANEJÁVEL / 2º E 3º INADIÁVEIS). User: a IA deve considerar as férias dos alocados, dizer o impacto no prazo e em qual período. Regra: 2º/3º período é INADIÁVEL (sai na data); 1º remanejável se a função for imprescindível. FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE; SOMENTE LEITURA de `vacation_periods`): SERVER (`iaCronograma.ts`) `coletarEfetivoCronograma` lê `vacationPeriods` (SEÇÃO 4b), extrai até 3 períodos, classifica bucket e retorna `feriasTxt`/`feriasResumoTxt`/`totalFeriasHorizonte`; `analisarEfetivo`/`simularEfetivo`/`perguntarEfetivo` ganham regra+seção; JSON ganha `impactoFerias` e `absorcaoFerias`. CLIENT (`AnaliseEfetivoIA.tsx`) `ImpactoFerias` + bloco "Absorção das férias". Validado via esbuild (exit 0). Ver `shared/changelog.ts`.
- **Rev. 2586** — PLANEJAMENTO · ABA "EFETIVO × IA" · DATAS SEMPRE NO PADRÃO BRASILEIRO (DD/MM/AAAA) EM TODA A SAÍDA DA IA — DIAGNÓSTICO, SIMULADOR (PLANO DE ATAQUE), ASSISTENTE E HISTÓRICO. User (screenshot): a "Missão" mostrava data em ISO cru. CAUSA: o cronograma alimentava a IA com datas ISO, então ela ecoava ISO nos textos livres; sem normalização na saída. FIX (SÓ SERVER, `iaCronograma.ts`): helpers `isoParaBR`/`brDatasTexto`/`brDatasDeep` (regex iOS-safe, sem `new Date`); entrada do prompt em BR; saída de `analisarEfetivo`/`simularEfetivo` via `brDatasDeep`, `perguntarEfetivo` via `brDatasTexto`; `getAnaliseEfetivo` corrige histórico antigo. Reforço nos 3 system prompts. Validado via esbuild (exit 0). Ver `shared/changelog.ts`.
- **Rev. 2585** — PLANEJAMENTO · ABA "EFETIVO × IA" · CORRIGE A "TRAVA EM 95%" DO SIMULADOR DE MÃO DE OBRA NO iPad/iOS — A SIMULAÇÃO AGORA CONCLUI EM VEZ DE FICAR PENDURADA E CAIR EM ERRO. CAUSA-RAIZ: o `planoAtaque` (Rev. 2583) tornou a `simularEfetivo` a chamada de IA mais pesada da aba (`maxTokens: 8000`); o `invokeLLM` usa Claude Sonnet 4 NÃO-STREAMING, lento demais → estoura o timeout do proxy/iOS antes de retornar. FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE): SERVER (`server/_core/llm.ts`) novo caminho rápido `invokeGeminiFast` (Gemini 2.5 Flash `generateContent`, `thinkingBudget=0`, `responseMimeType:"application/json"`); `invokeLLM` ganha flag `fast?` que tenta o rápido primeiro; `iaCronograma.ts` `simularEfetivo` passa `fast: true`. CLIENT (`AnaliseEfetivoIA.tsx`) barra segue crawl até 99% e salta pra 100% no sucesso. Validado via esbuild (exit 0). Ver `shared/changelog.ts`.


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
