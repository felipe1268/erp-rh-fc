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


- **Rev. 2653** — **FÉRIAS / LISTA DE FÉRIAS · A ORDENAÇÃO POR "INÍCIO DO GOZO" GANHA RÓTULOS MAIS CLAROS — "INICIA PRIMEIRO" / "INICIA POR ÚLTIMO" — ESPELHANDO O PADRÃO DE "VENCIMENTO".** Pedido (usuário, print IMG_1472): "Quero um filtro de início do gozo tbm para organizar quem inicia primeiro e quem inicia por último". A capacidade já existia desde a Rev. 2652 (`inicio_asc`/`inicio_desc` + faixa Início Gozo de/até), mas o print era da versão PUBLICADA (sem a Rev. 2652) e os rótulos diziam "mais cedo"/"mais tarde". Fix (SÓ CLIENT/UI — RÓTULO; R-001/R-007/R-010 — ZERO SCHEMA/SERVER): `client/src/pages/Ferias.tsx` — itens `inicio_asc`/`inicio_desc` passam para "Início Gozo — inicia primeiro/inicia por último"; lógica de ordenação e filtro de faixa inalteradas. Validado (estático): `pnpm build` exit 0. Detalhe: `shared/changelog.ts`.
- **Rev. 2652** — **FÉRIAS / LISTA DE FÉRIAS · A TELA GANHA ORDENAÇÃO AMPLIADA E NOVOS FILTROS — O USUÁRIO AGORA ORGANIZA POR NOME, VENCIMENTO, INÍCIO DO GOZO, FIM DO GOZO, PAGAMENTO, VALOR TOTAL E DIAS; E FILTRA POR CARGO, PERÍODO AQUISITIVO (1º / 2º+) E FAIXA DE DATA DE INÍCIO DO GOZO (DE/ATÉ), COM BOTÃO "LIMPAR FILTROS".** Pedido (usuário, print IMG_1471): "Quero poder organizar por nome, dará de início, fim todos os filtros que puder" (a aba "Lista de Férias" só tinha busca por nome/CPF, filtro de Status e ordenação por Vencimento/Alfabética). Fix (SÓ CLIENT/UI; R-001/R-007/R-010 — ZERO SCHEMA/SERVER): `client/src/pages/Ferias.tsx` — `sortBy` ampliado de 4→14 opções (Nome A→Z/Z→A, Vencimento ↑/↓, Início Gozo `dataInicio` ↑/↓, Fim Gozo `dataFim` ↑/↓, Pagamento `dataPagamento` ↑/↓, Valor Total `valorTotal` ↑/↓, Dias `diasGozo` ↑/↓; helpers `cmpDate`/`cmpNum`, vazios por último); novos filtros no `filtered` useMemo (`cargoFilter`, `periodoFilter` 1º/2º+, faixa `inicioDe`/`inicioAte` sobre `dataInicio`); 2ª linha de UI com Select de Cargo (`cargosDisponiveis` distinto da lista completa), Select de Período, dois `<input type=date>` e botão "Limpar filtros" (só com `filtrosAtivos`). Escopo: SÓ a aba "Lista de Férias"; Status segue filtrado no servidor. Validado (estático): `pnpm build` exit 0. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2651** — PLANEJAMENTO / CURVA S DE TRABALHO · A LINHA AZUL (BASELINE/PREVISTO) VOLTA A SER UMA CURVA S SUAVE E MONOTÔNICA — ACABOU O DEGRAU QUE A Rev. 2650 INTRODUZIU NO PONTO DO STATUS. A AZUL AGORA LÊ A MESMA FONTE DO HEADER (`previsto_semanas.raiz`), PASSANDO PELO "% PREVISTO" DO CABEÇALHO; COM PREVISTO=REALIZADO SE SOBREPÕE À VERDE. CAUSA-RAIZ: duas fontes na mesma linha. Fix (R-001/R-007/R-010 — SÓ LEITURA/CURVA): `server/routers/planejamento.ts` — `getCurvaS` ganha `curvaPrevistoSnapshot` (lê `previsto_semanas_json`, re-chaveia cutoff→segunda, clamp monotônico); injeção do Texto10 da Rev. 2650 REVOGADA. Detalhe: `shared/changelog.ts`.

- **Rev. 2650** — PLANEJAMENTO / CURVA S · (1) A LINHA AZUL (PREVISTO/BASELINE) VOLTA A PASSAR PELO % DO HEADER NO PONTO DO STATUS; (2) O CARD FINANCEIRO "PREVISTO (BCWS)" DEIXA DE MOSTRAR R$0,00 (DESVIO FANTASMA) — BCWS E BCWP NA MESMA SEMANA-BASE. CAUSA-RAIZ #1 (REVOGADA na Rev. 2651): injetar snapshot Texto10 na semana do status criava degrau. CAUSA-RAIZ #2 (VÁLIDA): BCWS medido em "hoje" (antes do início da obra) → R$0. Fix #2: CLIENT `PlanejamentoDetalhe.tsx` ancora o BCWS na última semana com Realizado (`finRefSemana`). Detalhe: `shared/changelog.ts`.

- **Rev. 2649** — PLANEJAMENTO / CURVA S · A LINHA "REALIZADO" (VERDE) PARA DE EXIBIR DADO-FANTASMA APÓS APAGAR OS AVANÇOS — AO LIMPAR/SALVAR AVANÇOS, A CURVA REGENERA NA HORA EM VEZ DE FICAR COM CACHE VELHO. CAUSA-RAIZ: as 4 mutations de avanço invalidavam `listarAvancos`/`getProjetoById` mas NUNCA `getCurvaS`/`getCurvaSFinanceira`/`getCurvasTodasRevisoes` → React Query servia a curva em cache. Fix (SÓ CLIENT/CACHE; R-001/R-007/R-010): `PlanejamentoDetalhe.tsx` — helper `invalidarCurvaS()` no `onSuccess` das 4 mutations. Detalhe: `shared/changelog.ts`.

- **Rev. 2648** — RH & DP / GERAL · A FOTO AMPLIADA (LIGHTBOX DO `PersonPhoto`) PARA DE SER CORTADA AO ABRIR — CABEÇA E PÉS VOLTAM A APARECER INTEIROS, EM TODA TELA COM FOTO DE PESSOA. CAUSA-RAIZ: lightbox `fixed inset-0` renderizado dentro da árvore da página; ancestral com `transform`/`filter`/`backdrop-filter` vira "containing block" do `fixed` → overlay preso/recortado. Fix (SÓ CLIENT/UI; R-001/R-007/R-010): `client/src/components/PersonPhoto.tsx` — overlay via `createPortal(..., document.body)`, devolvendo o `fixed` à viewport → foto completa (object-contain). Detalhe: `shared/changelog.ts`.

- **Rev. 2647** — PLANEJAMENTO · O "% PREVISTO" PASSA A LER UMA ÚNICA COLUNA FIXA EM TODOS OS PROJETOS: "% PREVISTO" = Texto10 (FieldID 188743750). ACABARAM A DETECÇÃO POR ALIAS E AS RESERVAS Texto6/Texto11 — SE Texto10 FALTAR, O VALOR FICA "—". Fix (LEITURA/CLIENT-ONLY; R-001/R-007/R-010 — ZERO SCHEMA): `client/src/pages/planejamento/ImportarCronograma.tsx` — removida `detectarFidPorAlias`; nova const `FID_PREVISTO_TEXTO10`; RAIZ e ATIVIDADE leem SÓ `valorPorFid[FID_PREVISTO_TEXTO10] ?? null` (sem alias, sem fallback). Detalhe: `shared/changelog.ts`.



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
