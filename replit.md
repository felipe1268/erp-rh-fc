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

- **Rev. 2954** — **FINANCEIRO → FLUXO DE CAIXA — CORREÇÃO DO ERRO "NÃO FOI POSSÍVEL CARREGAR O FLUXO DE CAIXA / FALHA AO CONSULTAR CONTAS A RECEBER E/OU CONTAS A PAGAR": OTIMIZAÇÃO DE PERFORMANCE DO `getContasReceberMatrix` (~20s → ~4s), COM RESULTADO NUMÉRICO IDÊNTICO.** Sintoma (usuário, iPad, company 60002, Admin Master): `/financeiro/fluxo-caixa` mostrava card de erro. Reproduzido via `createCaller` real: as duas queries da tela resolvem OK, mas `getContasReceberMatrix` levava ~20s (Pagar ~1,4s) → pelo proxy/iPad a request tRPC estoura timeout → `isError`. Não era falha de query/permissão, era LENTIDÃO. CAUSA-RAIZ (EXPLAIN ANALYZE): as 2 queries de distribuição mensal (dist `numero DESC` + baseline `numero ASC`, ~15s cada, em `Promise.all`) tinham a CTE `match_contains` com `NOT EXISTS` correlacionado contra a CTE materializada `match_exact` (que explode p/ ~48k linhas por nomes duplicados) → **Nested Loop Anti Join removendo ~280 MILHÕES de linhas (~30s)**. SOLUÇÃO (BACK read-only / SQL only, ZERO ALTER/DROP/DELETE, `server/routers/financial.ts`, nas DUAS queries): novas CTEs `match_exact_items AS MATERIALIZED (SELECT DISTINCT item_id FROM match_exact)` e `unmatched_items AS MATERIALIZED (...norm_name sem match exato...)`; `match_contains` agora parte de `unmatched_items`. O `MATERIALIZED` é o pulo do gato (fence): força o filtro de itens-sem-match ANTES do cross-join LIKE — sem ele o planner inlina e reconstrói o anti-join O(n²). EQUIVALÊNCIA PROVADA no Neon: resultado byte-a-byte IDÊNTICO nas 2 revisões (66 linhas, `IDENTICAL=true`); `getContasReceberMatrix` caiu de ~20,3s p/ ~4,2s via `createCaller`. `match_exact` (que alimenta `venda_frac`/`proj_sums`) intacto → zero mudança em valores financeiros. Detalhe: `shared/changelog.ts`.
- **Rev. 2953** — **COMBO DE DEMISSÕES (DASHBOARD AVISO PRÉVIO) — MODAL MAIOR + BOTÃO "GERAR PDF P/ DIRETORIA" (RELATÓRIO COMPLETO COM TODOS OS NOMES + TEMPO DE CASA) + NOVA SEÇÃO "REDUÇÃO MENSAL RECORRENTE DA FOLHA (SOBRA DE CAIXA)" — SALÁRIOS + SEGURO DE VIDA + VALE ALIMENTAÇÃO.** Pedido (usuário): no modal "Combo de Demissões — Fluxo de Caixa Consolidado" (`/dashboards/aviso-previo`) (1) tela maior; (2) gerar PDF dos selecionados p/ análise com a diretoria, com nomes de TODOS + tempo de casa; (3) previsão de redução MENSAL da folha + seguro de vida + vale alimentação (sobra de caixa). SOLUÇÃO (BACK read-only + FRONT, ZERO ALTER/DROP/DELETE): `server/routers/dashboards.ts` (`getDashCustoDemissaoMassa`) — SELECT passou a trazer `employees.seguroVida`/`valeAlimentacao` e cada linha devolve `seguroVidaMensal`/`valeAlimentacaoMensal` via `parseBRL` (vazio→0; sem query nova); `client/src/pages/dashboards/DashAvisoPrevio.tsx` — `comboAgregado` soma os benefícios, `<DialogContent>` `max-w-4xl`→`max-w-6xl w-[95vw]`, nova seção "Redução Mensal Recorrente" (5 cards: salários/seguro/VA/total mensal/anual ×12) e botão "Gerar PDF p/ diretoria" (`gerarRelatorioCombo` abre janela HTML auto-contida com cabeçalho FC + tabela de todos os selecionados + custo rescisório + redução mensal/anual e `window.print()`). Seguro/VA vêm do cadastro (vazio=R$0); anual = projeção linear ×12. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2952** — ATESTADOS & ACIDENTES (SST) — AS LISTAS "ÚLTIMOS ATESTADOS" E "ÚLTIMOS ACIDENTES" (ABA VISÃO GERAL) AGORA MOSTRAM A FOTO DO FUNCIONÁRIO NO LUGAR DO ÍCONE GENÉRICO (ESTETOSCÓPIO / TRIÂNGULO). SOLUÇÃO (BACK read-only + FRONT): `server/routers/sstAnalytics.ts` repassa `fotoUrl: r.employeeFotoUrl || null` em `ultimosAtestados`/`ultimosAcidentes`; `DashboardAtestadosAcidentes.tsx` troca o `<div>` do ícone por `<PersonPhoto size="sm">` num `<span>` com `stopPropagation`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2951** — CONTROLE DE DOCUMENTOS (DASHBOARD) — A TABELA "DOCUMENTAÇÃO INCOMPLETA" AGORA MOSTRA A FOTO DO FUNCIONÁRIO NA COLUNA "FUNCIONÁRIO", AO LADO DO NOME (CLICÁVEL P/ RAIO-X) E DO CPF. SOLUÇÃO (BACK read-only + FRONT): `server/routers/dashboards.ts` (`getDashControleDocumentos`) — SELECT de `ativosRows` passou a trazer `employees.fotoUrl` e o tipo/`push` de `funcIncompletos` ganharam `fotoUrl: emp.fotoUrl ?? null`; `client/src/pages/dashboards/DashControleDocumentos.tsx` — célula "Funcionário" virou flex com `<PersonPhoto src={f.fotoUrl} size="sm">` + nome (Raio-X) + CPF, `stopPropagation` no clique. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2950** — CATÁLOGO DE EPIs — ESTOQUE SEPARADO POR OBRA (IGUAL EM ENTREGAS): SELETOR DE LOCAL (CENTRAL + OBRAS DO USUÁRIO) NO TOPO + CAMPO "LOCAL DO ESTOQUE" NO CADASTRO, COM PERMISSÃO POR OBRA (`users.allowedObraIds`); RESTRITO NÃO ESCREVE NO CENTRAL. SOLUÇÃO (BACK+FRONT): `server/routers/epis.ts` (helpers `assertObraWrite`/`assertCentralWrite`; `list` `obraId?`+`stockExpr`; `create` `obraLocalId?`; guards anti-IDOR + `assertCentralWrite` em toda rota que escreve no Central) + `client/src/pages/Epis.tsx` (seletor de local, campo Local do estoque, dialogs só com obras permitidas). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2949** — CONTROLE DE DOCUMENTOS (DASHBOARD) — A TABELA "DOCUMENTAÇÃO INCOMPLETA" AGORA É CLICÁVEL: AO CLICAR NUMA LINHA ABRE UM DIÁLOGO LISTANDO EXATAMENTE QUAIS DOCUMENTOS ESTÃO VENCIDOS / NÃO CADASTRADOS DO FUNCIONÁRIO. SOLUÇÃO (BACK read-only + FRONT): `server/routers/dashboards.ts` (`getDashControleDocumentos`) anexa a cada `funcIncompleto` um array `pendencias[]` montado pela MESMA lógica das contagens (paridade 1:1, com categoria/tipo/dataValidade/diasAtraso/motivo); `DashControleDocumentos.tsx` deixou a `<tr>` clicável + `<Dialog>` listando cada documento pendente. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2948** — ATESTADOS & ACIDENTES (SST) — NOVA TABELA "ATESTADOS POR OBRA — RANKING" (ABA OBRAS / AÇÕES): LISTA AS OBRAS ORDENADAS POR QUANTIDADE DE ATESTADOS (MAIS → MENOS). SOLUÇÃO (FRONT-only, `client/src/pages/sst/DashboardAtestadosAcidentes.tsx`): a tela JÁ recebia `d.atestadosPorObra`; novo `<Card>` (ícone Stethoscope) com colunas #, Obra, Atestados, Dias Afast., Colab. Afetados, INSS (≥15d), reordenado por `qtdAtestados` desc, 1ª linha destacada + Total no rodapé. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
