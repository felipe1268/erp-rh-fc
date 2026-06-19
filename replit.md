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

- **Rev. 3292** — **RH & DP / FOLHA DE PAGAMENTO (VALE / ADIANTAMENTO) · "POR QUE ESTÁ CALCULANDO VALE PRA ENIVALDO SE ELE É PJ?" — UM FUNCIONÁRIO RECONTRATADO COMO PJ CONTINUAVA APARECENDO NO CARD DE VALE (E NA LISTA DE "DECISÃO NECESSÁRIA") COM ADIANTAMENTO PROPORCIONAL, PORQUE O SNAPSHOT DO VALE (`payroll_periods.valeResultJson`) FOI GERADO QUANDO ELE AINDA ERA CLT MENSALISTA E NUNCA REGEROU APÓS A VIRADA PRA PJ. AGORA O SNAPSHOT É SANITIZADO NA LEITURA (PJ/SÓCIO/EXCLUÍDO SOME DA TELA) E HÁ GUARDA DURA NA APROVAÇÃO (PJ/SÓCIO NUNCA RECEBE VALE, NEM SE FORÇADO). 100% BACKEND · READ-ONLY NO READ + UPDATE DEFENSIVO NA DECISÃO · ZERO SCHEMA/ALTER/DROP/DELETE.** DIAGNÓSTICO (Neon): ENIVALDO tem 3 cadastros — id=12 (CLT Desligado maio/2026), id=1200013 (CLT, comp 60005) e id=136 (PJ Ativo, comp 60002, admissão 04/06/2026 — recontratação CORRETA). O `valeResultJson` da comp 60002 (06/2026) trazia o id=136 com `isMensalista:true`, gerado quando ainda era CLT; após virar PJ o snapshot (imutável até "Gerar Vale") não regerou → entrada fantasma de R$ 1.440 (4.000×27/30×40%) + linha órfã em `payroll_advances`. FIX (`server/routers/payrollEngine.ts`, aditivo): (1) novo helper READ-ONLY `getIdsInelegiveisVale` (busca `tipoContrato`/`deletedAt` ATUAIS) + `sanitizarValeSnapshotNaoClt` chamado em `getPeriod` — remove do JSON quem hoje é PJ/Sócio/excluído e recalcula `totalFuncionarios`/`totalAlertas`/`totalVale`; retorna JSON original intacto se ninguém é inelegível; (2) `decidirVale` ganhou guarda dura — `pagar:true` p/ inelegível vira `rejeitado`+`bloqueado` e NÃO gera `financial_events`. `gerarVale` já filtrava CLT; o fix cobre o intervalo entre gerações. Órfã em `payroll_advances` higieniza no próximo "Gerar Vale" (sem DELETE manual). Detalhe: `shared/changelog.ts`.

- **Rev. 3291** — **PLANEJAMENTO / EFETIVO × IA (DIAGNÓSTICO + SIMULADOR DE MÃO DE OBRA) · "RESOLVE ISSO DE VEZ": O SIMULADOR (E O DIAGNÓSTICO) CAÍA NO iPad/SAFARI COM "A IA DEMOROU DEMAIS OU A CONEXÃO CAIU" E, AO REABRIR, NUNCA RESTAURAVA O RESULTADO — PORQUE A TABELA `planejamento_analises_efetivo` ESTAVA DESSINCRONIZADA DO SCHEMA: EM PRODUÇÃO FALTAVA A COLUNA `contexto` E EM DEV A TABELA NEM EXISTIA. SELF-HEAL ADITIVO · ZERO ALTER DESTRUTIVO/DROP/DELETE.** DIAGNÓSTICO (logs de PRODUÇÃO): `[salvarAnaliseEfetivo] falha ao persistir (ignorado)` (INSERT falhando) + `[ultimaAnaliseEfetivo] falha (retornando null)` (SELECT falhando) — ambas referenciam a coluna `contexto`. Inspeção do Neon de DEV: a tabela NEM EXISTIA. Causa: a tabela foi definida em `drizzle/schema.ts` (com `contexto json`) mas NUNCA recebeu entrada no self-heal `[SyncSchema+]` → nasceu dessincronizada (prod sem `contexto`; dev sem tabela). Como `db.select()` lista TODAS as colunas, persistência E leitura morriam, e a recuperação após queda (iPad) — que faz polling de `ultimaAnaliseEfetivo` — nunca achava a análise recém-gerada, reexibindo o erro de transporte. FIX (`server/_core/index.ts`, `[SyncSchema+]`, 100% ADITIVO/IDEMPOTENTE — R-001/R-007/R-010 OK): `CREATE TABLE IF NOT EXISTS planejamento_analises_efetivo (...)` com TODAS as colunas do schema + `ADD COLUMN IF NOT EXISTS` p/ cada coluna opcional (especialmente `contexto`) + índice `idx_plan_anal_efet (projeto_id, company_id, tipo, criado_em DESC)`; cura tanto o ambiente onde falta a tabela (cria) quanto o onde existe sem colunas novas (adiciona). Aplicado ao Neon de DEV (validado: 13 colunas). EFEITO: a IA passa a PERSISTIR; ao reabrir, o último resultado volta sozinho; e quando o iPad derruba a requisição APÓS o servidor já ter salvado, o polling de recuperação acha a análise e a exibe em vez do erro. RESSALVA: quota Gemini free-tier (429) sem `ANTHROPIC_API_KEY` segue podendo falhar de fato — agora reportada via `erroIa`, não mais mascarada. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3290** — **RH & DP / DASHBOARD DE FUNCIONÁRIOS (DRILL-DOWN "FUNÇÃO: X") · A TABELA QUE LISTA OS FUNCIONÁRIOS DE UMA FUNÇÃO GANHOU DUAS COLUNAS: "OBRA" (ONDE A PESSOA ESTÁ ALOCADA AGORA) E "CIPA" ("CIPA ATIVA" SE É MEMBRO DO MANDATO VIGENTE OU "ESTÁVEL (ANTERIOR)" SE TEM ESTABILIDADE DE MANDATO PASSADO). 100% BACKEND READ-ONLY + FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** `getDrillDown` (`server/routers/dashboards.ts`, aditivo, 2 queries sem N+1): OBRA ATIVA via `obra_funcionarios` isActive=1 ⋈ `obras.nome`; CIPA via `cipa_members` ⋈ `cipa_elections` ("ativa" se `mandatoFim>=hoje`, senão "estavel_anterior" se `fimEstabilidade>=hoje`). FRONT: badges azul (Obra) e verde/âmbar (CIPA) em todos os recortes. Detalhe: `shared/changelog.ts`.

- **Rev. 3289** — **CONTROLE DE ACESSO / USUÁRIOS · USUÁRIO COMUM COM OBRA CONCEDIDA MAS SEM EMPRESA MARCADA NÃO VIA A OBRA (ALMOXARIFADO ETC.) — SÓ COMO "ADM"; AGORA O ACESSO À EMPRESA É DERIVADO DAS OBRAS CONCEDIDAS. 100% BACKEND · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** `getCompaniesForUser` (`server/db.ts`, ramo usuário comum): empresas visíveis = UNIÃO de `user_companies` + EMPRESAS DONAS das obras de `getEffectiveAllowedObraIds` via `SELECT DISTINCT "companyId" FROM obras WHERE id = ANY(...)`; fallback LIMIT 1 só se realmente vazio. Aditivo (ninguém perde acesso); auto-cura usuários existentes. Detalhe: `shared/changelog.ts`.

- **Rev. 3288** — **PLANEJAMENTO / PORTAL DO CLIENTE · O "% PREVISTO" E A CURVA S DO PORTAL DIVERGIAM DO MÓDULO PLANEJAMENTO (FONTE DA VERDADE): NA OBRA REVTE-CIVIL O PORTAL MOSTRAVA PREVISTO 8% (DESVIO +1%) ENQUANTO O MÓDULO MOSTRAVA 9% (DESVIO 0) NO CUTOFF 11/06/2026. AGORA O PORTAL LÊ O "% PREVISTO" DA MESMA CURVA ÚNICA DO ENGENHEIRO (`previsto_semanas_json` + OVERRIDE LITERAL `previsto_literal_json`) E A CURVA S DE TRABALHO REUSA O NÚCLEO COMPARTILHADO `computeCurvaSData` — IDÊNTICA AO MÓDULO. 100% BACKEND · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** Novo helper puro `shared/previstoCurva.ts` (`parsePrevistoCurva().raizAt(cutoff)`); `portalExterno.planejamentoObra.pctTotalPrevisto` usa-o como fonte primária; `planejamento.getCurvaS` extraído p/ `computeCurvaSData` reusado pelo Portal. Validado Neon: previsto 8→9, desvio +1→0. Detalhe: `shared/changelog.ts`.

- **Rev. 3287** — **PLANEJAMENTO / EFETIVO × IA (SIMULADOR + DIAGNÓSTICO) · A SIMULAÇÃO TRAVAVA EM 99% E MOSTRAVA "A IA DEMOROU DEMAIS / A CONEXÃO CAIU" MESMO COM O SERVIDOR JÁ TENDO TERMINADO E SALVO; AGORA, AO CAIR A CONEXÃO (iPad/Safari), O ERP RECUPERA AUTOMATICAMENTE O RESULTADO PERSISTIDO. FRONT (RECUPERAÇÃO) + BACKOFF NO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Novo hook `useRecuperarAposQueda` + `isErroTransporteIos` (`AnaliseEfetivoIA.tsx`): em erro de TRANSPORTE faz polling de `iaCronograma.ultimaAnaliseEfetivo` (~90s) contra baseline FRESCA de `criadoEm` e exibe a nova; backend `invokeGeminiFast` passou a honrar o `retryDelay` da API no 429. Detalhe: `shared/changelog.ts`.

- **Rev. 3286** — **PLANEJAMENTO / PORTAL DO CLIENTE · O "% REALIZADO" DO PORTAL DIVERGIA DO MÓDULO (REVTE-CIVIL 20,72% vs 9,00%); AGORA ESPELHA O `realizadoMspSnapshot` DA RAIZ, IGUAL AO PLANEJAMENTO. 100% BACKEND · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** `pctTotalRealizado` (`portalExterno.ts`) espelha `calMSP.realizadoMspSnapshot` com o MESMO gate do `avancoAtual` (snapshot + statusDate + envSnapOk + monotonicidade); fallback ponderado só se snapshot ausente/stale. Detalhe: `shared/changelog.ts`.

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
