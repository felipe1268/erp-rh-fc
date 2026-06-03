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


- **Rev. 2732** — **COMPRAS · NOVA SOLICITAÇÃO (SC) · VINCULAR UM MATERIAL A UMA ETAPA DA EAP NÃO PODE DUPLICAR A LINHA (item "fantasma": material + etapa, etapa caindo "S/ VERBA" na cotação).** Bug (continuação da Rev. 2731): "ele puxa a etapa como duas vezes o item e está dando sem verba." Na cotação da SC-2026-0299 (COT-2026-0275) o item aparecia DUPLICADO: linha do material "Madeirite Plastificado" (m², 435,6; META 77,35×435,6 = R$ 33.693,66; saldo −391,6) E uma 2ª linha "[03.02.10] Proteção dos Escoramentos…" (m², 435) marcada "S/ VERBA". A SC tem só 1 item real (id=7157, material vinculado à etapa 59586); a 2ª linha era um item "fantasma" da própria etapa. Causa (`Solicitacoes.tsx`, `ManualEapLink` → `onLinkMultiple`): ao vincular linha com descrição própria a uma etapa, fazia `novos.splice(idx + 1, 0, ...novosItens)` — MANTINHA a linha original E INSERIA a nova abaixo, DUPLICANDO. Solução (SÓ CLIENT/UI; ZERO SERVER/SCHEMA — R-001/R-007/R-010): reescrito p/ vincular a 1ª etapa NA PRÓPRIA LINHA (in place, idêntico ao `onLink`: `{ ...it, orcamentoItemId, eapCodigo }`, preserva todos os campos — torna o "keep unit" da Rev. 2731 automático); só etapas ADICIONAIS viram linhas novas; linha vazia → 1ª etapa vira a etapa. `novos.splice(idx, 1, linkedRow, ...novosResto)` SUBSTITUI a linha, eliminando a duplicação. Não altera registros gravados. Validação: esbuild server EXIT 0; parse TSX EXIT 0; `vitest server/rescisao.test.ts` 41/41 verde. Detalhe: `shared/changelog.ts`.
- **Rev. 2731** — **COMPRAS · NOVA SOLICITAÇÃO (SC) · VÍNCULO MANUAL DE UM ITEM À ETAPA DA EAP NÃO PODE TROCAR A UNIDADE DO ITEM PELA DA ETAPA.** Bug (relato): "Caio postou a solicitação e ela está puxando a etapa como um item." Na SC-2026-0299 o item "Madeirite Plastificado" (comprado em UNIDADES) aparecia com unidade "m²" — a unidade da etapa [03.02.10] medida em m². Causa (`Solicitacoes.tsx`, `ManualEapLink` → `onLinkMultiple`): cada item vinculado era montado com `unidade: e.unidade || it.unidade || "un"`, SEMPRE preferindo a unidade da etapa, mesmo na primeira linha onde a descrição digitada pelo usuário (um MATERIAL) é preservada; o vínculo à EAP é só orçamentário ("Vinculado a:") e não deveria mudar a unidade de compra. Solução (SÓ CLIENT/UI; ZERO SERVER/SCHEMA — R-001/R-007/R-010): flag `manterItemUsuario` (linha com descrição própria + 1ª do vínculo) preserva a unidade digitada; só linhas SEM descrição (que VIRAM a própria etapa) herdam a unidade da etapa. Descrição/quantidade já eram preservadas. Não altera o registro já gravado (sem UPDATE de dados). Validação: esbuild server EXIT 0; parse TSX EXIT 0; `vitest server/rescisao.test.ts` 41/41 verde. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2730** — PLANEJAMENTO · DETALHE DO PROJETO · PREV. MEDIÇÃO ("Previsão de Medição — Por Avanço Físico") · NENHUMA MEDIÇÃO PODE SER RECEBIDA ANTES DO RECEBIMENTO DO SINAL (cliente demora até ~30 dias p/ enviar o contrato; o sinal só sai após a assinatura e a nota da medição do mês acompanha a do sinal). `PlanejamentoDetalhe.tsx` (memo `previsoesMensais`) hoisteia `sinalDataRecebimento = cfgDataPrimeiroFat || cfgDataInicioObra` e trava cada `dataRecebimentoPrev` mensal em `>= sinalDataRecebimento`; flag `recebimentoTravadoSinal` mostra "aguarda sinal" no lugar de "+Nd.úteis". Não muda valores/%/retenção/sinal. SÓ CLIENT/UI; ZERO SERVER/SCHEMA. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2729** — PLANEJAMENTO · DETALHE DO PROJETO · REMOVIDA A ABA "PREVISTO" (tela "Previsto (Manual)" — upload manual de XML do MS Project por semana). A empresa usa o MOTOR (CAMINHO B) como fonte real do "% Previsto", logo a aba Manual estava sem uso. `PlanejamentoDetalhe.tsx` remove import/id `"previsto"`/entrada de `TAB_DEFS`/bloco de render da aba; `AbaPrevistoManual.tsx` apagado; endpoints tRPC `getPrevistoManual`/`salvar`/`limpar` ficam intocados (sem chamadores). SÓ CLIENT/UI; ZERO SERVER/SCHEMA. `vitest` verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2728** — FINANCEIRO · LANÇAMENTOS / NOVO LANÇAMENTO → TRANSFERÊNCIA · CORRIGE O BUG DE SELECIONAR UMA CONTA E MARCAR DUAS (Santander marcava a Caixa, 2 checkmarks) + layout que cortava o nome. Causa: ids duplicados em `company_bank_accounts` (serial sem PK + sequence dessincronizada). Reparo DADOS em produção (UPDATE+setval; ZERO ALTER/DROP/DELETE) e `getBankAccounts` filtra `deletedAt IS NULL AND ativo=1`; `FinanceiroLancamentos.tsx` ajusta grid/truncate/align dos selects. `vitest` verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2727** — RH · RAIO-X DO FUNCIONÁRIO / TIMELINE CRONOLÓGICA (`controleDocumentos.raioX`) · A MUDANÇA DE OBRA DO FUNCIONÁRIO AGORA FICA REGISTRADA NA TIMELINE (antes nunca aparecia). Causa: troca de obra grava em `employee_site_history`, mas a timeline só agregava `employee_history` (tabela diferente). Fix: `raioX` lê também `employee_site_history` (transferencia→"Mudança de Obra", alocacao→"Alocação", saida→"Saída"; dedup da saída-par; gestor_obra ignorado). SÓ SERVER; ZERO SCHEMA. `vitest` 41/41 verde. Detalhe: `shared/changelog.ts`.

- **Rev. 2726** — RH · RESCISÃO / HOME + AVISO PRÉVIO (card "Avisos Prévios em Andamento" × lista × ficha "Cálculos da Rescisão") · CORRIGE A DIVERGÊNCIA: o card/lista IGNORAVAM as férias vencidas que a ficha incluía (caso Mariana: card R$ 11.799,50 × subtotal R$ 19.391,67; diff R$ 7.592,17 = 1 férias vencida). Causa: `list`/`homeData` contam vencidas via query EM LOTE `(VALUES…) AS p(emp_id, data_fim)` com `data_fim` TEXT → Postgres lança `operator does not exist: date < text`, a query falha no try/catch e o mapa fica vazio (0 p/ todos). Fix: cast `p.data_fim::date` nas 2 comparações em `avisoPrevioFerias.ts` (`list`) e `homeData.ts`. SÓ SERVER; ZERO SCHEMA. `vitest` verde. Detalhe: `shared/changelog.ts`.

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
