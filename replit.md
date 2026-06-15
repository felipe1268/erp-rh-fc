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

- **Rev. 3133** — **FINANCEIRO / LANÇAMENTOS (`/financeiro/lancamentos`) · O SELETOR DE PERÍODO PASSOU A USAR O MESMO PADRÃO DO CONTAS A RECEBER / CONTAS A PAGAR — TIMELINE "ANO + FAIXA DE MESES (JAN–DEZ)" COM BOLINHAS DE STATUS (COM LANÇAMENTO AZUL / CONSOLIDADO VERDE / SEM DADOS CINZA), NO LUGAR DO CALENDÁRIO DE RANGE ABERTO + BOTÕES "MÊS ANTERIOR/ATUAL/PRÓXIMO/ANO TODO".** PEDIDO (iPad, com 2 prints da tela "Lançamentos Financeiros"): "COLOCA O MESMO PADRÃO DE FILTRAR CONFORME O CONTAS A RECEBER E CONTAS A PAGAR." UI (espelha `FinanceiroContasAPagar.tsx`): navegação `‹ ANO ›` (ChevronLeft/Right) + botão "Ano todo" + faixa `grid grid-cols-6 sm:grid-cols-12` com os 12 meses, cada um com bolinha de status + legenda; Tipo/Status/Busca seguem numa 2ª linha (border-t). A timeline NÃO substitui a engine de filtro — apenas COMANDA os mesmos `dataInicio`/`dataFim` que já são a fonte de verdade do `getEntries` via `useEffect([ano, mesSel])` (mês → 1º..último dia; `mesSel=null` → ano inteiro); default segue mês corrente. BOLINHAS: novo endpoint READ-ONLY `financial.getEntriesResumoMensal({companyId, ano, tipo?})` agrega SÓ CONTAGENS por mês (`COUNT(*)` + `SUM(status NOT IN ('pago','recebido'))` agrupado por `EXTRACT(MONTH FROM COALESCE(data_competencia, data_vencimento, created_at::date))`), MESMA âncora do `getEntries`, exclui `cancelado`; classifica vazio/consolidado/com-lançamento e respeita o filtro de Tipo. TENANCY: `_assertFinanceiroCompanyAccess` (anti-IDOR) + `resolveCompanyIds`. FRONTEND + 1 endpoint read-only; ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3132** — **FINANCEIRO / LANÇAMENTOS · IMPORTAÇÃO EM LOTE (SCRIPT CONTROLADO, SEM MÓDULO/ABA) DA PLANILHA `Financeiro - Pagamentos 2026` INTEIRA — TODOS OS MESES — CADASTRANDO OS PAGAMENTOS QUE FALTAVAM NO ERP SEM DUPLICAR O QUE JÁ FOI LANÇADO À MÃO.** PEDIDO (iPad): "Leia toda a planilha, de todos os meses, cadastre tudo que ainda não está no ERP e garanta não duplicar o que já foi lançado manualmente" (usuário pediu importar inclusive duvidosos/Cliente + relatório de aprovação depois). BUG-RAIZ corrigido na leitura: os valores são NÚMEROS NATIVOS (`304.8` = R$ 304,80), não texto BR — ler `raw:true` + `Math.round(parseFloat(v)*100)` dos DOIS lados (planilha e Neon). ESCOPO (company FC 60002): 3.143 pagos na planilha (R$ 6.042.866,56, fev/2025 + set/2025→mar/2026); dedup por centavos+data±3d+token fornecedor vs 10.931 lançamentos → 268 já existiam (PULADOS), 148 duvidosos, 2.727 novos. IMPORTADOS 2.875 (R$ 5.354.832,25) em UMA transação (ZERO ALTER/DROP/DELETE), `status='pago'`, categoria em `conta_nome` (texto), contas resolvidas (SANTANDER FC→id4 etc.; não-cadastradas/multi-conta → null + texto em `observacoes`), 13 categorias + 16 obras novas criadas. REVERSÍVEL (parcial — só os lançamentos; categorias/obras criadas permanecem): lote marcado `origem_modulo='importacao_excel'` + `origem_descricao='IMP_PLANILHA_v1|<classe>'` → desfazer com `UPDATE financial_entries SET status='cancelado' WHERE company_id=60002 AND origem_modulo='importacao_excel' AND origem_descricao LIKE 'IMP_PLANILHA_v1%'` (SEMPRE com escopo de tenant). Entregue relatório xlsx (comparativo mês a mês + duvidosos + cliente). Conciliação extrato/PIX = Etapa 2. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3131** — **RH / COLETA DE CAMPO · QUANDO A COLETA ATINGE 100% DOS FUNCIONÁRIOS A COLETAR ELA AGORA SE FINALIZA SOZINHA (DÁ COMO "CONCLUÍDO" + FECHA O LINK / `ativo=0`) MESMO QUANDO A CONCLUSÃO NÃO VEIO DO ÚLTIMO ENVIO PÚBLICO.** PEDIDO (iPad, print da tela "Coleta"): "quando acabar tudo, fecha a coleta e dê como concluído." CAUSA-RAIZ: duas regras desalinhadas em `server/routers/coletaRh.ts` — o badge "Concluído" de `listarSessoes` é DERIVADO ao vivo (`coletados >= totalAlocados`), mas o auto-close (`SET ativo=0`) só existia em `enviarResposta` (último envio do link). Se batia 100% por outro caminho (ex.: funcionário DESALOCADO encolhe o universo), o badge virava "Concluído" mas o link seguia ATIVO. CORREÇÃO (BACKEND-ONLY; ZERO SCHEMA/ALTER/DROP/DELETE): `listarSessoes` se AUTO-CURA — calcula conclusão, junta `finalizarIds`, UM `UPDATE ... SET ativo=0 WHERE id IN (...) AND companyId IN (...) AND ativo=1 RETURNING id` (best-effort, idempotente, tenant-safe), só os IDs RETORNADOS rebaixam `ativo:0` no payload. Auto-close de `enviarResposta` (Rev. 2902) intacto. Detalhe: `shared/changelog.ts`.

- **Rev. 3130** — **CONTROLE DE DOCUMENTOS / ABA "MAPEAMENTO" · ASO JÁ LIDO POR IA NÃO REAPARECE NO LOTE DE LEITURA — INCLUSIVE OS "DESCARTADOS" (REJEITADOS) — EVITANDO RELER O MESMO PDF VÁRIAS VEZES.** PEDIDO (iPad, com print do painel "Revisão das leituras da IA"): "Quem já foi lido por ia não precisa aparecer novamente, para evitar leitura do mesmo arquivo várias vezes." CAUSA: o filtro de pendentes (em `lerLoteIA` e `listPendentesIA` de `server/routers/controleDocumentos.ts`) excluía da fila só ASOs com extração `aguardando_revisao`/`aprovado`; quem o usuário DESCARTAVA (botão "Descartar" → `rejeitarExtracaoIA` grava `rejeitado`) caía de volta na fila e era RELIDO no próximo lote. CORREÇÃO (BACKEND-ONLY; ZERO SCHEMA/ALTER/DROP/DELETE): o filtro passou a tratar como "já lido" os 3 estados terminais — `aguardando_revisao | aprovado | rejeitado` (nenhum reaparece no `runLote` → `listPendentesIA`); mantido `erro` re-tentável (leitura que FALHOU e nunca concluiu — 429/503 Gemini, Rev. 3128) p/ não perder ASO por falha transitória. Botões manuais ("Ler com IA"/"Ler selecionados") seguem deliberados. Tenancy + `assertAiModuleEnabled` inalterados. Detalhe: `shared/changelog.ts`.

- **Rev. 3129** — **PORTAL DO CLIENTE / AVALIAÇÕES (NPS) · "EXCLUIR SELECIONADOS" (EXCLUSÃO EM LOTE DE LINKS DE AVALIAÇÃO) PAROU DE FALHAR COM ERRO DE SQL — `ANY($2, $3::text[])` INVÁLIDO.** CAUSA-RAIZ: em `server/routers/portalExterno.ts` o `excluirLinksAvaliacao` usava `AND codigo = ANY(${input.codigos}::text[])`; o `sql` template do Drizzle EXPANDE um array JS em placeholders por vírgula (`$2, $3`) → SQL INVÁLIDO `ANY($2, $3::text[])`. CORREÇÃO (BACKEND-ONLY; ZERO SCHEMA/ALTER/DROP/DELETE): trocado para `codigo IN (${input.codigos})` (gera `IN ($2, $3)` válido). Tenancy (company_id) + gate Admin Master inalterados. Detalhe: `shared/changelog.ts`.

- **Rev. 3128** — **CONTROLE DE DOCUMENTOS / ABA "MAPEAMENTO" · A LEITURA DE ASOs POR IA DEIXOU DE "FALHAR EM MASSA" (~73 FALHAS P/ 6 SUCESSOS) — AGORA RESISTE A ERROS TRANSITÓRIOS DO GEMINI (429 COTA FREE-TIER / 503 "HIGH DEMAND") COM RETRY + RITMO (PACING) + SALVAGE DE JSON TRUNCADO.** DIAGNÓSTICO (erro_msg reais de `aso_extracao_ia`): ~95% das falhas eram TRANSITÓRIAS (429/503) + 1 JSON truncado por `maxTokens:2048`. CORREÇÃO (ZERO SCHEMA): `server/_core/llm.ts` retry cobre 429/500/502/503/504, `MAX_RETRIES` 3→5, espera `max(retryDelay, backoff)`; `controleDocumentos.ts` maxTokens 2048→4096 + `parseAsoIaLoose` com salvage; `ControleDocumentos.tsx` `runBatch` com ritmo (~3,5s) + até 3 tentativas/ASO. RESSALVA: chave Gemini FREE-TIER — cota DIÁRIA esgotada exige chave paga. Detalhe: `shared/changelog.ts`.

- **Rev. 3127** — **MEDIÇÃO / "LEVANTAMENTO" (ENGINE COMPARTILHADA CLIENTE×TERCEIRO) · A TELA DEIXOU DE EXIGIR ESPECIFICAMENTE O MÓDULO DE MEDIÇÃO-CLIENTE — AGORA É LIBERADA P/ QUEM TEM O MÓDULO DE MEDIÇÃO (CLIENTE) OU O DE TERCEIROS.** PEDIDO (iPad, build mode): usuária "Kellen Larissa" (perfil Usuário) recebia "Acesso Restrito" ao abrir `/medicao/17/levantamento/1?origem=terceiro`. CAUSA: a rota usava `<RouteGuard route="/medicao" />` (exige Medição-Cliente), mas o Levantamento é engine COMPARTILHADA cliente×terceiro. CORREÇÃO (FRONTEND-ONLY; ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE): rota passou p/ `route={["/medicao", "/terceiros/medicoes"]}` (RouteGuard já aceita array) — libera p/ quem tem Medição OU Terceiros; DADOS seguem protegidos pelos guards de tenancy no backend. Detalhe: `shared/changelog.ts`.

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
- **Moeda SEMPRE em formato BRL pt-BR (`R$ 100.000,00` — ponto p/ milhar, vírgula p/ centavos).** Tanto na EXIBIÇÃO (usar `formatBRL`) quanto em INPUTS de digitação de valor (usar máscara `maskBRL`/`parseMaskBRL`). Nunca exibir/aceitar o formato cru anglo `100000.00`.
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
