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


- **Rev. 2601** — **PLANEJAMENTO · A CAUSA-RAIZ REAL DO PREVISTO TRAVADO EM ~1%: UM BUG DE ZONA MORTA TEMPORAL (TDZ) NO SERVIDOR IMPEDIA A CURVA CAMINHO B DE SER GERADA/GRAVADA. AS REV. 2599/2600 (CLIENT) ESTAVAM CERTAS — SÓ FALTAVA O DADO, QUE NUNCA EXISTIU.** Sintoma (screenshots IMG_1418–1421, projeto 35 REVTE-CIVIL): mesmo após as Rev. 2599/2600 o Previsto seguia travado em ~1% em TODAS as semanas; os cards "PREVISTO (SEMANA)" exibiam "Lido do snapshot MS Project (UID=0)" (= fallback, curva NÃO usada). INVESTIGAÇÃO (read-only no Neon + logs): `previsto_semanas_json` estava NULL em TODOS os projetos apesar de a rev. baseline (50) ter 66 folhas com baseline preenchida; replicando a lógica sobre os dados reais a curva sai PERFEITA (60 sem, raiz 1,61%→100%); os logs entregaram `Cannot access 'toUtc' before initialization`. CAUSA-RAIZ (TDZ): em `regenerarPrevistoSemanasCaminhoB` a construção de `folhas` chamava `toUtc()`/`toDateStr()` ANTES das suas declarações `const` (logo abaixo) → `ReferenceError` SEMPRE → a coluna NUNCA era gravada (cadastro E self-heal). O esbuild isolado não executa o código, então passou batido nas Rev. anteriores. FIX (SÓ SERVER — `server/routers/planejamento.ts`; ZERO CLIENT/SCHEMA/ALTER/DROP/DELETE): mover `toDateStr`/`toUtc` para ANTES de `folhas` (após `const diaCorte`). Uma reordenação. BACKFILL (UPDATE da própria coluna JSON via função do app — permitido): script replica a lógica do self-heal (alvo = última aprovada → 1ª; `diaCorteSemana` do projeto) e popula a coluna; projeto 35 GRAVADO (60 sem, raiz 1,61%→100%, revisaoId=50 casa com a revisão ativa). Projetos 29/33/36/38 sem baseline em NENHUMA revisão → ficam "—"/CTA reimportar (estado de dado, fora de escopo). Self-heal de `getProjetoById` agora popula qualquer projeto ao abrir. Validado: esbuild server (exit 0) + workflow sem o erro de TDZ + verificação SQL da curva gravada. Detalhe: `shared/changelog.ts`.
- **Rev. 2600** — **PLANEJAMENTO · HOTFIX DA REV. 2599: (1) CORRIGE O CRASH `ReferenceError: Can't find variable: previstoCurva` QUE DERRUBAVA A TELA INTEIRA; (2) DESTRAVA O PREVISTO DA BARRA SUPERIOR (ANTES CONGELADO EM ~1%).** Sintoma (screenshots IMG_1415/IMG_1416): ao abrir o Planejamento a página quebrava com "Ocorreu um erro inesperado · ReferenceError: Can't find variable: previstoCurva" (stack em `AvancoSemanal`); quando carregava, a barra superior "Avanço Físico" seguia com Previsto travado em 1,00% mesmo no modo Live. CAUSA-RAIZ: (1) a Rev. 2599 definiu `previstoCurva` no componente PRINCIPAL (`PlanejamentoDetalheInner`) mas as refs vivem no componente SEPARADO `AvancoSemanal` (funções irmãs, escopo léxico distinto) → em runtime resolvia para global inexistente → ReferenceError; (2) o previsto do topo vem de `avancoPrevistoDia` (`PlanejamentoDetalheInner`), que lia SÓ o snapshot UID=0 (`previstoMspSnapshot`, congelado na StatusDate 07/05) — a Rev. 2599 só tocou `AvancoSemanal`. FIX (SÓ CLIENT — `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`; ZERO SERVER/SCHEMA/ALTER/DROP/DELETE): (1) `previstoCurva` (def única) é PROPAGADO como prop para `<AvancoSemanal>` (recebido na desestruturação) — todas as refs resolvem via prop, sem duplicar useMemo; (2) `avancoPrevistoDia` passa a LER `previstoCurva.raizAt(topRefStr)` na data do modo (Live = cutoff de hoje; Oficial = StatusDate), snapshot UID=0 vira FALLBACK — cascateia para o card "Avanço Físico", o badge de atraso e o SPI. Decisão MANTIDA: CAMINHO B fica, "ERP só LÊ". Validado via esbuild client (exit 0) + workflow reiniciado sem erros. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2599** — PLANEJAMENTO · AVANÇO SEMANAL · PREVISTO DESTRAVADO: A TELA (CLIENT) PASSA A LER A CURVA CAMINHO B (`previsto_semanas_json`) POR SEMANA — ANTES FICAVA CONGELADA EM ~1% (SNAPSHOT ÚNICO DA RAIZ UID=0). FIX-A (CLIENT — `PlanejamentoDetalhe.tsx`): novo useMemo `previstoCurva` (parser com `raizAt`/`ativAt`/`idxAt`); `mspReadOnly`, `previstoRealizadoSemana` e a coluna % por atividade passam a LER a curva (snapshot/fórmulas legadas viram FALLBACK). FIX-B (SERVER — `getProjetoById`): self-heal que regenera a curva quando NULL. Decisão MANTIDA: CAMINHO B fica, ERP só LÊ. **NOTA: o self-heal não populava de fato por causa do bug de TDZ — corrigido na Rev. 2601.** Validado via esbuild (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2598** — PLANEJAMENTO · AVANÇO SEMANAL VIRA LEITURA PURA DO MS PROJECT: REMOVIDA A AUTO-DISTRIBUIÇÃO (Rev. 2237) QUE INVENTAVA AS SEMANAS PASSADAS A PARTIR DA CURVA PREVISTA. Decisão do usuário ("ERP só LÊ, não calcula"): no import semanal o ERP só lê a `% Concluída` (PercentComplete) do XML e grava a semana do StatusDate — sem preencher semanas anteriores com cumulativo planejado. O PREVISTO continua sendo a curva CAMINHO B gerada no cadastro (`regenerarPrevistoSemanasCaminhoB`). FIX (SÓ CLIENT; ZERO SERVER/SCHEMA/ALTER/DROP/DELETE): `PlanejamentoDetalhe.tsx` (`importarDoMSProject`) — removido o bloco de auto-distribuição + `matched` + contadores/toasts `semanasAutoSalvas`/`avancosAutoSalvos`/`avancosPreservados`. REFIS e indiretas intocados. Validado via esbuild client (exit 0). Detalhe: `shared/changelog.ts`.

- **Rev. 2597** — **PLANEJAMENTO · ABA "EFETIVO × IA" · PLANO DE ATAQUE ENXUTO: FICA SÓ O GUIA PASSO A PASSO + O PLANO TÁTICO + A LINHA DE BALANÇO; AS DEMAIS SEÇÕES NARRATIVAS DA "MESA DE GUERRA" SAEM DA TELA.** User: "só deixa o guia passo a passo" (manter também Linha de Balanço e Plano Tático). FIX (SÓ CLIENT — UI; ZERO SERVER/SCHEMA/ALTER/DROP/DELETE; prompt da IA INTOCADO): `AnaliseEfetivoIA.tsx` (`PlanoAtaque`) mantém Missão/veredito + Guia passo a passo + Plano Tático + Linha de Balanço; remove da renderização Centro de Gravidade, Frentes Críticas, Mesa de Guerra, Manobras, Realocação, Assertividade, Processos/Automações, Cenários, Absorção das férias, KPIs e Condições de vitória. Validado via esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2596** — **PLANEJAMENTO · ABA "EFETIVO × IA" · PLANO DE ATAQUE · LINHA DE BALANÇO POR PAVIMENTO: O EIXO Y PASSA A USAR OS NOMES/NUMERAÇÃO REAIS DO CRONOGRAMA (NÃO MAIS "PAVIMENTO 1..N" GENÉRICOS INVENTADOS PELA IA).** User (screenshot IMG_1412): "numere/nomeie o pavimento CORRETO seguindo o cronograma — veja os NOMES informados lá". CAUSA-RAIZ: o ERP JÁ detecta os pavimentos reais (`detectarPavimento`→`pavimentosDetectados`, Rev. 2593) e os envia à IA, mas o gráfico desenhava `linhaBalancoPavimentos.pavimentos` preenchido PELA IA, que parafraseava ("Pav. 6"→"Pavimento 6") ou renumerava como "Pavimento 1..N". FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE — só leitura + IA + pós-processo no server; CLIENT INTOCADO): SERVER (`server/routers/iaCronograma.ts`) novos helpers `normalizarChavePav` (lowercase + remove acentos NFD iOS-safe + "pavimento"/"andar"→"pav"), `indicePavPorNome` (nome→índice na lista real: exato → por número → contains) e `forcarPavimentosReais` que, quando há `pavimentosDetectados`, SOBRESCREVE `linhaBalancoPavimentos.pavimentos` com a lista REAL (base→topo) e REALINHA cada atividade resolvendo `pavInicio`/`pavFim` por NOME (fallback: índice numérico antigo clampado); chamado após o parse em `simularEfetivo`. Schema ganhou `pavInicioNome`/`pavFimNome` e a instrução manda copiar LITERALMENTE os nomes detectados. CLIENT: nenhuma mudança (`LinhaBalancoPavimentoChart` já lê `lob.pavimentos` + `pavInicio`/`pavFim`). Simulações antigas não são reescritas (re-simular). Validado via esbuild server (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2595** — PLANEJAMENTO · ABA "EFETIVO × IA" · PLANO DE ATAQUE: (1) O BADGE DE FÉRIAS PASSA A MOSTRAR O *MOTIVO* DA INADIABILIDADE; (2) AS LINHAS DE BALANÇO FICAM RESPONSIVAS AO CLIQUE/TOQUE; (3) LEGENDAS CLICÁVEIS NOS DOIS GRÁFICOS LOB. User (screenshots IMG_1410/IMG_1411). FIX (ADITIVO, ZERO SCHEMA/ALTER/DROP/DELETE — IA + UI): SERVER (`iaCronograma.ts`) schemas de `analisarEfetivo`/`simularEfetivo` ganham `motivoInadiavel` (IA COPIA o motivo já vindo do ERP). CLIENT (`AnaliseEfetivoIA.tsx`) renderiza "Por que é inadiável: …" + `LinhaBalancoPavimentoChart`/`LinhaBalancoChart` ganham estado `sel` (clique destaca atividade; legenda vira botões). Validado via esbuild (exit 0). Ver `shared/changelog.ts`.

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
