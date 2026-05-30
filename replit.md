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


- **Rev. 2595** — **PLANEJAMENTO · ABA "EFETIVO × IA" · PLANO DE ATAQUE: (1) O BADGE DE FÉRIAS PASSA A MOSTRAR O *MOTIVO* DA INADIABILIDADE; (2) AS LINHAS DE BALANÇO FICAM RESPONSIVAS AO CLIQUE/TOQUE; (3) LEGENDAS CLICÁVEIS NOS DOIS GRÁFICOS LOB.** User (screenshots IMG_1410/IMG_1411): (1) estranhou "1º período · INADIÁVEL" — achava que inadiável só seria 2º período; faltava EXPLICAR no badge POR QUE (a Rev. 2594 já calcula o motivo, mas o client não exibia). (2) queria a Linha de Balanço "responsiva ao clique" e (3) legendas úteis (rótulos vinham truncados). FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE — IA + UI): SERVER (`server/routers/iaCronograma.ts`) os schemas dos prompts `analisarEfetivo` (`impactoFerias.itens[]`) e `simularEfetivo` (`absorcaoFerias[]`) ganharam o campo `motivoInadiavel` e as instruções de FÉRIAS mandam a IA COPIAR o motivo (que já vem entre parênteses na lista do ERP) — `inadiavel` continua copiado da Rev. 2594. CLIENT (`client/src/pages/planejamento/AnaliseEfetivoIA.tsx`) REQ1: `ImpactoFerias` + bloco "Absorção das férias" renderizam "Por que é inadiável: …" (AlertTriangle rose) + `title` no badge; REQ2+3: `LinhaBalancoPavimentoChart` e `LinhaBalancoChart` ganharam estado `sel` (useState antes dos early-returns) — clicar na linha/faixa OU na legenda destaca a atividade (opacidade 1, traço grosso, rótulo completo) e apaga as demais; clicar de novo limpa; legenda virou botões clicáveis (ring/bg sky no ativo). Validado via esbuild server+client (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2594** — **PLANEJAMENTO · ABA "EFETIVO × IA" · "IMPACTO DAS FÉRIAS NO PRAZO": A CLASSIFICAÇÃO INADIÁVEL × REMANEJÁVEL DEIXA DE OLHAR SÓ A ORDEM DA FRAÇÃO E PASSA A CONSIDERAR A SITUAÇÃO LEGAL (VENCIDA / CONCESSIVO VENCENDO / EM GOZO).** User (screenshot): a info das férias estava ERRADA — "Anderson Júnior" aparecia como "1º período · remanejável" sendo que o concessivo dele está VENCENDO (gozo obrigatório, não dá pra adiar) e o ERP não detectou; "garanta essa lógica melhor para não ter erro". DIAGNÓSTICO (via Neon real — bancos dev/prod-replica do Replit vazios): Anderson (employee 420056) — férias 01/06→30/06/2026, fração 1, aquisitivo 16/07/2024→15/07/2025, concessivo até 15/07/2026, `vencida=0`, status `agendada`: é 1º período mas o concessivo está a ~15d do fim do gozo → gozo OBRIGATÓRIO. CAUSA-RAIZ: a classificação usava SÓ a ordem (1º=remanejável) e ignorava a situação legal. FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE — só leitura de `vacation_periods` + IA + texto; client intocado): SERVER (`server/routers/iaCronograma.ts`) `coletarEfetivoCronograma` — `type FeriasPeriodo` ganha `inadiavel`/`motivoInadiavel`; SELECT traz `concessivoFim`+`vencida`; por fração classifica ROBUSTO: ordem≥2 / em gozo / VENCIDA / concessivo vencendo (≤45d do fim do gozo) → INADIÁVEL (com motivo), senão 1º REMANEJÁVEL; removido `ordemLabel` e o `fmtDBR` duplicado (movido pra antes do loop); `feriasTxt` mostra a classificação real. Prompts `analisarEfetivo`/`simularEfetivo` ganham "MARCAÇÃO LEGAL DO ERP (PRIORITÁRIA)" — IA deve respeitar/copiar o flag `inadiavel`, nunca sugerir adiar um INADIÁVEL. CLIENT: nenhuma mudança (badge já lê `inadiavel`). Validado via esbuild server (exit 0). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2593** — PLANEJAMENTO · ABA "EFETIVO × IA" · SIMULADOR: LINHA DE BALANÇO DINÂMICA POR PAVIMENTO + REALOCAÇÃO DE EQUIPES (FLUXO DE TAKT) + % DE ASSERTIVIDADE EM TODO O PLANO. User: (1) Linha de Balanço dinâmica analisando TODOS os pavimentos/atividades; (2) Plano de Ataque por pavimento (onde alocar a MDO, por quanto tempo, e depois realocar); (3) plano tático com % de assertividade. FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE — só leitura + IA + UI): SERVER (`iaCronograma.ts`) novo helper `detectarPavimento` (regex iOS-safe); `coletarEfetivoCronograma` anota `__pav`, monta `pavimentosDetectados`/`pavimentosTxt`; `simularEfetivo` estende `planoAtaque` com `linhaBalancoPavimentos`, `realocacaoEquipes`, `assertividadeGlobal` e `assertividade`/`baseAssertividade` por item. CLIENT (`AnaliseEfetivoIA.tsx`) `AssertBadge` + `LinhaBalancoPavimentoChart` (SVG LOB) + seções "Realocação de equipes" e "Assertividade do plano". Validado via esbuild (exit 0). Ver `shared/changelog.ts`.
- **Rev. 2592** — PLANEJAMENTO · ABA "EFETIVO × IA" · CORRIGE "ESTÁ DANDO ERRO E NÃO ESTÁ SALVANDO AS VERIFICAÇÕES E SIMULAÇÕES" NO iPad. DUAS causas (SÓ SERVER, ZERO SCHEMA/ALTER/DROP/DELETE) em `iaCronograma.ts`: (1) TIMEOUT — a Rev. 2590 removeu o `fast` de `simularEfetivo`; Claude não-streaming estoura o timeout do iPad antes de retornar e, como salvar só ocorre `if (parsed)`, nada persistia → `analisarEfetivo`/`simularEfetivo` voltam a `fast:true` (Gemini Flash dentro do timeout; Claude fallback). (2) OVERFLOW — `veredito` (`varchar(40)`) era gravado sem truncar → INSERT estourava e o try/catch engolia → truncar a 40 chars (texto completo segue no json). Ver `shared/changelog.ts`.
- **Rev. 2591** — PLANEJAMENTO · ABA "EFETIVO × IA" · O PROGRESSO 0–100% (COM TODAS AS ETAPAS EM ANDAMENTO) FICA VISÍVEL NO iPad TAMBÉM NO SIMULADOR. O painel de progresso (barra 0–100% + 5 etapas) JÁ EXISTIA mas nascia abaixo da tabela longa de ~47 funções. FIX (SÓ CLIENT, ZERO SERVER/SCHEMA/ALTER/DROP/DELETE) em `AnaliseEfetivoIA.tsx`: `PainelProgresso` ganha `ref`+`useEffect` com `scrollIntoView` ao montar; os botões exibem o % enquanto processam ("Simulando… {progresso}%"/"Analisando… {progresso}%"). Validado via esbuild client (exit 0). Ver `shared/changelog.ts`.
- **Rev. 2590** — PLANEJAMENTO · ABA "EFETIVO × IA" · SIMULADOR DE MÃO DE OBRA: (1) VOLTA A USAR CLAUDE; (2) SEM LIMITE DE INFORMAÇÃO (NÃO TRUNCA); (3) O ERP DESENHA A LINHA DE BALANÇO; (4) NOVO "PLANO TÁTICO" POR ATIVIDADE; (5) "GUIA PASSO A PASSO" DIDÁTICO. SERVER (`iaCronograma.ts` `simularEfetivo`) removeu `fast:true` e subiu `maxTokens 8000→16000`; `planoAtaque` ganhou `planoTatico`/`linhaBalanco`/`guiaEstagiario`. CLIENT (`AnaliseEfetivoIA.tsx`) novo `LinhaBalancoChart` (SVG) + seções. **NOTA: a remoção do `fast` causou timeout no iPad — revertido na Rev. 2592.** Zero schema/ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2589** — PLANEJAMENTO · ABA "EFETIVO × IA" · (1) CORRIGE O "TIRE SUAS DÚVIDAS COM A IA" QUE NÃO RESPONDIA NO iPad/SAFARI (TIMEOUT); (2) TODA PERGUNTA DIGITADA PASSA A SER REGISTRADA E FICA VISÍVEL EM "TELEMETRIA & ANALYTICS › ANALYTICS DA IA". SERVER (`iaCronograma.ts` `perguntarEfetivo`): `invokeLLM` ganha `fast:true` (Gemini, responde antes do timeout; Claude fallback) + INSERT best-effort em `ia_modulo_conversas` (modulo "planejamento", pergunta/resposta/user/projeto, try/catch). CLIENT: nenhuma mudança — `Telemetria.tsx` já renderiza `ultimasPerguntas`. Zero schema/ALTER/DROP/DELETE. Ver `shared/changelog.ts`.


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
