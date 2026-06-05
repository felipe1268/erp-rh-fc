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

- **Rev. 2781** — **PLANEJAMENTO · AVANÇO SEMANAL: O "% CONCLUÍDA" (REALIZADO ACUM.) AGORA FICA SALVO EM TODAS AS SEMANAS JÁ ENVIADAS — ANTES SÓ APARECIA NA ÚLTIMA SEMANA CADASTRADA E AS ANTERIORES MOSTRAVAM "—".** Pedido (usuário): "o valor da semana que já passou não está ficando salvo o % concluído... só fica na última semana cadastrada... quero que fique em todas". Causa (arquitetural): o PREVISTO tem curva por-semana (`previsto_semanas_json`), mas o REALIZADO só tinha 1 snapshot único no `calendarioJson` (`realizadoMspSnapshot`+`statusDateSnapshot` = última foto); no hook `mspReadOnly` (`PlanejamentoDetalhe.tsx`) o branch `semanaFim < statusDateSnapshot` caía em "—". Regra de Ouro proíbe o card de recalcular agregado. Fix (SERVER+CLIENT+SHARED; ZERO SCHEMA — só novas chaves no JSON `calendarioJson` via UPDATE do app, R-001/R-007/R-010 OK): `shared/diasUteis.ts` ganhou `realizadoSemanas?: Record<string,number>` (interface + preservação no `parseCalendarioJson`, que faz whitelist); `salvarMetadadosMSProject` acumula `realizadoSemanas[statusDate]=realizadoMspSnapshot` (merge aditivo, preserva fotos antigas; `limparSnapshot` zera junto); `mspReadOnly` na semana passada lê a foto exata da semana ou a mais recente anterior (carry-forward, realizado é monotônico) — leitura pura de snapshot. Ressalva: projetos antigos auto-curam a partir do próximo upload semanal (sem backfill). ZERO ALTER/DROP/DELETE. Validação: restart server; architect. Detalhe: `shared/changelog.ts`.
- **Rev. 2780** — **EPI · TELA "ESTOQUE POR OBRA": AO CLICAR NUMA OBRA, OS DEMAIS CARDS NÃO SOMEM MAIS — TODOS OS LOCAIS PERMANECEM VISÍVEIS NO PAINEL FIXO; O CLIQUE SÓ DESTACA O CARD (ÂMBAR) E FILTRA A TABELA DE INSUMOS ABAIXO.** Pedido (usuário, 2 prints): "quando clico numa obra ele tá sumindo com as demais, não queria isso... deixar como na 1ª foto, todas obras fixas, só destacar a selecionada". Na Rev. 2779 o clique encolhia o painel. Causa (SÓ CLIENT) em `client/src/pages/Epis.tsx`: o mesmo `filterObraEstoque` que filtra a tabela também filtrava a grade (`filteredObras`) e escondia o central (`showCentral`). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER): DESACOPLADO o painel do filtro — `filteredObras = estoqueResumo` (sempre todas) e `showCentral = true` (central sempre visível); destaque âmbar do selecionado e filtragem da TABELA (`tabelaEstoqueList`) continuam intactos. ZERO ALTER/DROP/DELETE. Validação: HMR ok; architect. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2779** — EPI · TELA "ESTOQUE POR OBRA": OS CARDS (RESUMO + ALMOXARIFADO CENTRAL + OBRAS) FICARAM FIXOS (STICKY) NO TOPO — SÓ A TABELA DE INSUMOS ABAIXO ROLA; E O CARD CLICADO GANHOU COR DE DESTAQUE DISTINTA (ÂMBAR). Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/Epis.tsx`: card-resumo + grade em `sticky top-0 z-20 bg-background border-b`; grade com `max-h-[42vh] overflow-y-auto`; realce do selecionado de `ring esmeralda/azul` para `ring-2 ring-amber-500 bg-amber-100/70 shadow-md`. Detalhe: `shared/changelog.ts`.

- **Rev. 2778** — EPI · OS NÚMEROS DA TELA "ESTOQUE POR OBRA" AGORA SÃO FORMATADOS COM SEPARADOR DE MILHAR (PADRÃO pt-BR) — ex.: "2.102 unid.". Pedido (usuário): "separe tudo com ponto e vírgula certinho". Fix (SÓ CLIENT; ZERO SCHEMA/SERVER) em `client/src/pages/Epis.tsx`: `.toLocaleString('pt-BR')` em TODOS os contadores inteiros do resumo/cards (`unidTotal`, `totalLocais`, `unidCentral`/`estoqueCentral.totalItens`, `r.totalUnidades`/`r.totalItens`); valores STRING do banco (`SUM()`/`COUNT()`) blindados com `Number(... || 0)` antes do format; monetários (R$) já formatados, intactos. Detalhe: `shared/changelog.ts`.

- **Rev. 2777** — EPI · CORRIGIDO O TOTAL DE UNIDADES DO CARD "VALOR TOTAL EM ESTOQUE" (TELA "ESTOQUE POR OBRA"): MOSTRAVA UM NÚMERO GIGANTE SEM SENTIDO (ex.: "10130191981646164110158 unid.") — ERA CONCATENAÇÃO DE STRING EM VEZ DE SOMA. Causa-raiz (SÓ CLIENT) em `client/src/pages/Epis.tsx`: o `reduce` de `unidObras` fazia `s + (r.totalUnidades || 0)`, mas `r.totalUnidades` vem do `SUM()` do Postgres como STRING → `0 + "1013"` vira concatenação em JS; só faltava o `Number()` (o `unidCentral` já tinha). Fix: `unidObras` soma com `s + Number(r.totalUnidades || 0)`. Detalhe: `shared/changelog.ts`.

- **Rev. 2776** — EPI · A NUMERAÇÃO DA BOTA (Nº) E O TAMANHO DO UNIFORME (TAM.) AGORA APARECEM NA TABELA "ESTOQUE POR OBRA" DA TELA DE EPIs — antes só o nome do item. Fix (SERVER+CLIENT; ZERO SCHEMA — só faltava trazer/exibir): `server/routers/epis.ts` (`estoqueObraList`) retorna `tamanhoEpi: epis.tamanho`; `client/src/pages/Epis.tsx` — memo `centralItensList` carrega `tamanhoEpi` e a célula do EPI ganhou 2ª linha "Nº X" (calçado) / "Tam. X" (uniforme), mesmo padrão da Rev. 2771; só renderiza quando há tamanho. Detalhe: `shared/changelog.ts`.

- **Rev. 2775** — EPI · O "ESTOQUE CENTRAL" DO ERP AGORA SE CHAMA "ALMOXARIFADO CENTRAL" NA TELA DE EPIs — ACABOU A CONFUSÃO COM A OBRA REAL "ESCRITÓRIO CENTRAL" (do cadastro de Obras p/ alocar funcionários). Fix (SÓ LABEL; ZERO SCHEMA; `value="central"` intacto): rótulo "Escritório Central" → "Almoxarifado Central" em TODOS os pontos do conceito-central no `client/src/pages/Epis.tsx` (dropdown, card central, `centralItensList.nomeObra`, botões de entrega/transferência, badge do histórico, empty-state) e em `server/routers/epis.ts` (`listarTransferencias.origemNome`). A OBRA REAL "ESCRITÓRIO CENTRAL" MANTÉM o nome. Detalhe: `shared/changelog.ts`.

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
