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

- **Rev. 2920** — **INTEGRAÇÃO DE SEGURANÇA (SST) · PORTAL PÚBLICO — VÍDEO DE TREINAMENTO AGORA APARECE CENTRALIZADO, NA PROPORÇÃO CERTA E COM CARREGAMENTO/ERRO TRATADOS (FIM DO "BURACO PRETO" E DO "NÃO CARREGA").** Bug (usuário, com print): na etapa "Módulos de Treinamento" o vídeo aparecia desalinhado (grande "buraco preto" embaixo do player) e parecia não carregar (0:00, sem duração). CAUSA: `VideoPlayer` em `client/src/pages/sst/IntegracaoPublica.tsx` prendia o `<video>` numa caixa rígida `aspect-video` (16:9) com `w-full h-full` — vídeo de proporção ≠16:9 ou com metadata ainda carregando renderiza no tamanho intrínseco padrão (~300×150) preso ao topo, sobrando preto embaixo; sem preload/erro/loading não havia feedback em arquivos grandes (o vídeo de integração tem ~140MB). BACKEND PROVADO OK: `/uploads` responde `Range: bytes=0-` com `206`+`Content-Range bytes 0-8388607/146488466` (chunk de 8MB da Rev. 2917) — era LAYOUT, não servidor. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE): player de upload usa proporção NATURAL (`w-full max-h-[70vh] object-contain`) em container `flex items-center justify-center max-w-3xl mx-auto` (sempre centralizado, sem buraco preto); estados `videoLoading`/`videoError` (overlay "Carregando vídeo…" + fallback "Abrir o vídeo em nova aba" no `onError`); `preload="metadata"`+`playsInline`+`key={url}`+reset no `useEffect([url])`; branch YouTube também centralizado. Sem mudança de backend/schema. Detalhe: `shared/changelog.ts`.
- **Rev. 2919** — **USUÁRIOS E PERMISSÕES · GRUPOS — SALVAR PERMISSÕES DE MÓDULOS FICOU À PROVA DE FALHA: INDICADOR DE "ALTERAÇÕES NÃO SALVAS" + ERRO LOUD + CONFIRMAÇÃO DO QUE FOI PERSISTIDO.** Bug (usuário, com print): abrir grupo "TST", clicar "Todos admin" + salvar e a tela voltar a mostrar só os módulos antigos (RH/DP, SST, Terceiros…), como se o save "revertesse". INVESTIGAÇÃO: toda a cadeia front→tRPC `setGroupModuleAccess`→Neon→`userGroups.list`→`normalizeModulePerm` foi PROVADA correta (round-trip de 17 módulos no banco OK); cache headers OK (`index.html` no-cache, assets immutable). Causa real: o estado só persistia com clique EXPLÍCITO em "Salvar Grupo" (sem aviso de pendência), falhas de save eram silenciosas e o redisplay dependia de refetch que podia reexibir estado ANTIGO. SOLUÇÃO (FRONT-only, ZERO ALTER/DROP/DELETE): `client/src/pages/Usuarios.tsx` — helper `serializeGroupState` + snapshot `gBaseline` → `gDirty`; botão âmbar/pulsante + aviso "Alterações não salvas" quando há pendência; `handleSaveGroup` com `try/catch` (erro LOUD), e pós-save atualiza `gBaseline` + `selectedGroup.moduleAccess` localmente (confirma na UI sem depender do refetch). Sem mudança de backend/schema. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2918** — INTEGRAÇÃO DE SEGURANÇA (SST) · DASHBOARD — CLICAR NUM CARD DE KPI AGORA FILTRA: LEVA DIRETO PRA ABA CORRESPONDENTE (APROVADOS/PENDENTES/REPROVADOS). Os 5 cards (Total/Aprovados/Pendentes/Reprovados/Vencendo 30d) eram `<div>` estático. FRONT-only `client/src/pages/sst/IntegracaoSST.tsx`: `KpiCard` ganhou prop `onClick` (clicável: cursor, hover, `role=button`, `tabIndex=0`, Enter/Espaço, rótulo "Ver lista ›"); `DashboardTab` recebe `onNavigate` e liga Aprovados→"aprovados", Pendentes→"pendentes", Reprovados→"reprovados", Vencendo(30d)→"pendentes". "Total" segue informativo. Sem mudança de backend/schema. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2917** — INTEGRAÇÃO DE SEGURANÇA (SST) · PORTAL PÚBLICO — VÍDEO DE TREINAMENTO VOLTOU A TOCAR: CORREÇÃO DO 500 AO SERVIR ARQUIVOS GRANDES DE `/uploads` ATRÁS DO PROXY DO DEPLOY. O proxy do deploy (Cloud Run) rejeita com 500 respostas com Content-Length > ~32MB; o `express.static` servia o `Range: bytes=0-` (aberto) com o arquivo INTEIRO (140MB). Novo middleware em `server/_core/index.ts` ANTES do `express.static("/uploads")` LIMITA cada resposta a `UPLOADS_MAX_CHUNK=8MB` (reescreve `Range`, força 206); mesmo cap no fallback DB; HEAD/arquivos pequenos passam intactos; trata `bytes=-N`, 416 e path traversal. Efeito só em PROD após republicar. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2916** — CONTROLE DE EPIs · NECESSIDADE — CORREÇÃO DO INPUT DE CONFIG QUE TRAVAVA EM ZERO: AGORA DÁ PRA APAGAR O CAMPO "CAMISAS/CALÇAS/CALÇADOS POR PESSOA" E DIGITAR OUTRO NÚMERO. Input numérico fazia `parseInt(value)||0` gravando número; ao apagar, `NaN→0` reexibia `0`. FRONT-only `client/src/pages/EpiNecessidade.tsx`: guarda config como STRING; `onChange` aceita `""`/1-2 dígitos; `onBlur`/Salvar clampam 0..99. Sem mudança de backend/schema. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2915** — CONTROLE DE EPIs · NECESSIDADE — CONVERSÃO INTERNA (SEM BOTÃO) DO TAMANHO DAS CALÇAS DE LETRA (P/M/G/GG...) PARA NÚMERO, PARA CASAR COM O `tamanhoCalca` NUMÉRICO DOS FUNCIONÁRIOS. Calças em LETRA caíam no balde CAMISA e a seção Calça mostrava estoque 0. MAPA (nominal/inferior da faixa): PP→34, P→36, M→38, G→42, GG→46, XG→48, XGG→50, EXG→50, XXGG→52, XXXGG→54. Backfill no startup `server/_core/index.ts` (`[SyncSchema+]`) — único UPDATE em `epis` `categoria='Uniforme'` + `nome ILIKE '%calç%'` + tamanho∈letras; IDEMPOTENTE; estoque/entregas ligam por `epiId` (intactos). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2914** — CONTROLE DE EPIs · NOVA ABA "NECESSIDADE" — CRUZA OS TAMANHOS CADASTRADOS DE CADA FUNCIONÁRIO ATIVO (CAMISA/CALÇA/CALÇADO) COM O ESTOQUE TOTAL (CENTRAL + OBRAS), DESCONTA O QUE JÁ FOI ENTREGUE E MOSTRA QUANTO FALTA COMPRAR POR TAMANHO. Necessidade CONFIGURÁVEL por tipo (default 1). Schema `drizzle/schema.ts` companies `epiNecCamisa/Calca/Calcado` + self-heal (3× ADD COLUMN IF NOT EXISTS); backend `server/routers/epis.ts` (`getNecessidadeConfig`/`setNecessidadeConfig`/`necessidadeVsEstoque`); front `client/src/pages/EpiNecessidade.tsx` + aba ShoppingCart "Necessidade" em `Epis.tsx`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
- **REGRA DE OURO — CAMINHO B (Rev. 2646+, substitui Rev. 2644/2617/2533/2603).** O "% PREVISTO" é a réplica da coluna **"% PREVISTO" (Texto10) do MS Project** — "verdade absoluta". O "% CONCLUÍDA" segue a coluna `PercentComplete`. As duas régua são alinhadas às fórmulas do MSP:
  - **% PREVISTO — FÓRMULA-FONTE (Texto10):** a coluna "% PREVISTO" do MSP é `Int(Num Dur(Prev)[188743983] ÷ PESO DUR(BL)[188743982] × 100 + 0.5)` = fração de duração da baseline DECORRIDA até o StatusDate, ponderada por DURAÇÃO das folhas, **ARREDONDADA** (`+0.5` antes do `Int` = `round`, NÃO trunca).
  - **% PREVISTO — RÉGUA NO ERP (projeção p/ TODAS as semanas):** motor de **TEMPO ÚTIL MINUTO-A-MINUTO** da baseline (`unitsElapsed`/`unitsTotal` sobre `shared/diasUteis`, clipando aos `weekDayIntervals` do calendário). **RAIZ = ROLLUP** = `round(Σ minutos úteis DECORRIDOS das folhas ÷ Σ minutos úteis TOTAIS das folhas × 100)` — soma das DURAÇÕES das folhas, **NÃO** o vão início→fim do projeto (corrigido na Rev. 2644). POR ATIVIDADE = `round(elapsed/total × 100)`. `round` (não `trunc`) p/ espelhar o `+0.5` do Texto10.
  - **% PREVISTO — LEITURA DO VALOR-SNAPSHOT (cliente) (Rev. 2647+, substitui Rev. 2644):** `client/.../ImportarCronograma.tsx` lê SEMPRE a MESMA coluna FIXA `Texto10 (188743750)` via const `FID_PREVISTO_TEXTO10`, em TODOS os projetos (presentes e futuros). **ACABARAM a detecção por `<Alias>` (`detectarFidPorAlias` removida) e as reservas Texto6/Texto11.** Se Texto10 faltar no XML, o valor fica `null` → a tela mostra "—" (jamais lê outra coluna; Texto6 em templates LOTUS é lixo sem alias/fórmula). Vale pra RAIZ (`parseMSProjectFull`) e pra cada ATIVIDADE (`parseMSProjectTasksFromDoc`).
  - **Baseline COM HORA é OBRIGATÓRIA.** Lê `baseline_start_ts`/`baseline_finish_ts` (TEXT ISO com hora). Sem `weekDayIntervals` OU sem TS → fallback day-granular ponderado por duração (backward compat). Cutoff semanal = fim-do-dia (`T23:59:59Z`).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **PADRÃO ATUAL (Rev. 2646): o snapshot "% Previsto" REGENERA EM TODO UPLOAD DO XML — inclusive o SEMANAL — usando o calendário do XML como verdade absoluta.** Acontece em `salvarAtividades` (cadastro/substituir) E em `salvarMetadadosMSProject` (que roda em todo import e regrava o `calendarioJson` limpo). Como a baseline é imutável dentro da revisão, re-rodar é IDEMPOTENTE (mesma curva), mas garante que projetos ANTIGOS se AUTO-CUREM no próximo upload semanal (ex.: a curva ~1% baixa por feriado injetado pré-Rev. 2645 some sozinha). REVOGA a regra anterior "snapshot regenerado SÓ no salvarAtividades / avanço semanal NÃO regenera". RESSALVA: projetos dormentes (sem novos uploads) só corrigem com reimport do cronograma inicial.
  - **RESSALVA DE PARIDADE NUMÉRICA:** o XML de referência (PLN_816 R04) tem StatusDate < StartDate → Texto10 = 0% em tudo, então a curva numérica NÃO foi cravada empiricamente nesta revisão. A régua matemática está alinhada à fórmula; falta re-validar com XML de status-date no meio do projeto.
  - Implementação: `server/routers/planejamento.ts` (`regenerarPrevistoSemanasCaminhoB` — rollup das folhas + round; chamada pós-transaction em `salvarAtividades` E em `salvarMetadadosMSProject` — Rev. 2646, que roda em TODO upload e resolve a revisão ativa + respeita a fonte; `importarComModo` propaga os TS), `client/src/pages/planejamento/ImportarCronograma.tsx` (`detectarFidPorAlias` + parser `<Baseline Number=0>` COM HORA + `<WorkingTime>`→`weekDayIntervals`), `shared/diasUteis.ts` (motor minuto-a-minuto), `drizzle/schema.ts` + self-heal `[SyncSchema+]` (`baseline_start_ts`/`baseline_finish_ts`).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
