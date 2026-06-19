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

- **Rev. 3290** — **RH & DP / DASHBOARD DE FUNCIONÁRIOS (DRILL-DOWN "FUNÇÃO: X") · A TABELA QUE LISTA OS FUNCIONÁRIOS DE UMA FUNÇÃO (EX.: "FUNÇÃO: CARPINTEIRO") GANHOU DUAS COLUNAS NOVAS: "OBRA" (A OBRA EM QUE A PESSOA ESTÁ ALOCADA AGORA) E "CIPA" (SE É MEMBRO DA CIPA DO MANDATO VIGENTE — "CIPA ATIVA" — OU SE FOI MEMBRO DE UM MANDATO ANTERIOR MAS AINDA TEM ESTABILIDADE — "ESTÁVEL (ANTERIOR)"). 100% BACKEND READ-ONLY + FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** A tela é o `DrillDownModal` (`client/src/components/DrillDownModal.tsx`), aberto do Dashboard de Funcionários e alimentado por `dashboards.drillDown` → `getDrillDown` (`server/routers/dashboards.ts`), que trazia só colunas de `employees`. FIX BACKEND (`getDrillDown`, aditivo, READ-ONLY, sem N+1 — 2 queries): coleta `empIds` e faz (1) OBRA ATIVA via `obra_funcionarios` isActive=1 ⋈ `obras.nome` (escopo `companyWhere` + `inArray`, ≤1 alocação ativa/func) → `Map`; (2) CIPA via `cipa_members` ⋈ `cipa_elections` (escopo empresa + empIds): "ativa" se `mandatoFim>=hoje`, senão "estavel_anterior" se `fimEstabilidade>=hoje` (estabilidade Art. 10 ADCT até 1 ano após o mandato); ativa tem prioridade; cada query em try/catch. Retorno ganhou `obra`, `cipaStatus`, `cipaCargo`, `cipaFimEstabilidade`. FRONT: colunas "Obra" (badge azul `MapPin`) e "CIPA" (badge verde "CIPA Ativa" / âmbar "Estável (anterior)" com `title`); aparecem em TODOS os recortes do drill-down (genérico). tsc limpo. Detalhe: `shared/changelog.ts`.

- **Rev. 3289** — **CONTROLE DE ACESSO / USUÁRIOS · UM USUÁRIO COMUM (PERFIL "USUÁRIO") COM UMA OBRA CONCEDIDA EM "OBRAS COM ACESSO" MAS SEM NENHUMA EMPRESA MARCADA EM "EMPRESAS COM ACESSO" NÃO CONSEGUIA VER A OBRA (ALMOXARIFADO ETC.) — SÓ APARECIA QUANDO O PERFIL VIRAVA "ADM". CAUSA: CONCEDER UMA OBRA NÃO CONCEDIA ACESSO À EMPRESA DONA DELA, E O USUÁRIO SEM VÍNCULO DE EMPRESA CAÍA NUM FALLBACK QUE ENTREGAVA A 1ª EMPRESA ALFABÉTICA (LIMIT 1) — UMA EMPRESA ERRADA. AGORA O ACESSO À EMPRESA É DERIVADO DAS OBRAS CONCEDIDAS. 100% BACKEND · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** DIAGNÓSTICO (Neon): Manoel Rocha (role="user") tinha `allowed_obra_ids`=[13] (obra IGREJA SÃO GERALDO, empresa 60002 FC ENGENHARIA) mas `user_companies` VAZIO; `getCompaniesForUser` (server/db.ts), p/ usuário sem vínculo, devolvia a 1ª empresa do sistema (ORDER BY razaoSocial LIMIT 1) → seletor de empresa (`companies.list`) e `obras.listForAlmoxarifado` operavam na empresa ERRADA, e a obra 13 nunca aparecia. Admin vê todas + ignora filtro de obra, por isso "só como Adm". FIX (`getCompaniesForUser`, ramo usuário comum): empresas visíveis = UNIÃO de `user_companies` + EMPRESAS DONAS das obras de `getEffectiveAllowedObraIds` (allowed_obra_ids + responsável + grupo Escritório Central) via `SELECT DISTINCT "companyId" FROM obras WHERE id = ANY(...)`; fallback LIMIT 1 só quando o conjunto fica REALMENTE vazio. 100% ADITIVO (ninguém perde acesso). EFEITO: conceder a obra libera automaticamente a empresa dona → a obra aparece no seletor e no almoxarifado sem marcar empresa à mão nem virar Adm; vale p/ usuários existentes (auto-cura, sem backfill) e novos. INALTERADO: admin/admin_master; ACL de terceiros (lê user_companies cru); filtro EM_ANDAMENTO. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3288** — **PLANEJAMENTO / PORTAL DO CLIENTE · O "% PREVISTO" E A CURVA S DO PORTAL DIVERGIAM DO MÓDULO PLANEJAMENTO (FONTE DA VERDADE): NA OBRA REVTE-CIVIL O PORTAL MOSTRAVA PREVISTO 8% (DESVIO +1%) ENQUANTO O MÓDULO MOSTRAVA 9% (DESVIO 0) NO CUTOFF 11/06/2026. AGORA O PORTAL LÊ O "% PREVISTO" DA MESMA CURVA ÚNICA DO ENGENHEIRO (`previsto_semanas_json` + OVERRIDE LITERAL `previsto_literal_json`) E A CURVA S DE TRABALHO REUSA O NÚCLEO COMPARTILHADO `computeCurvaSData` — IDÊNTICA AO MÓDULO. 100% BACKEND · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** Novo helper puro `shared/previstoCurva.ts` (`parsePrevistoCurva().raizAt(cutoff)`); `portalExterno.planejamentoObra.pctTotalPrevisto` usa-o como fonte primária; `planejamento.getCurvaS` extraído p/ `computeCurvaSData` reusado pelo Portal. Validado Neon: previsto 8→9, desvio +1→0. Detalhe: `shared/changelog.ts`.

- **Rev. 3287** — **PLANEJAMENTO / EFETIVO × IA (SIMULADOR + DIAGNÓSTICO) · A SIMULAÇÃO TRAVAVA EM 99% E MOSTRAVA "A IA DEMOROU DEMAIS / A CONEXÃO CAIU" MESMO COM O SERVIDOR JÁ TENDO TERMINADO E SALVO; AGORA, AO CAIR A CONEXÃO (iPad/Safari), O ERP RECUPERA AUTOMATICAMENTE O RESULTADO PERSISTIDO. FRONT (RECUPERAÇÃO) + BACKOFF NO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE.** Novo hook `useRecuperarAposQueda` + `isErroTransporteIos` (`AnaliseEfetivoIA.tsx`): em erro de TRANSPORTE faz polling de `iaCronograma.ultimaAnaliseEfetivo` (~90s) contra baseline FRESCA de `criadoEm` e exibe a nova; backend `invokeGeminiFast` passou a honrar o `retryDelay` da API no 429. Detalhe: `shared/changelog.ts`.

- **Rev. 3286** — **PLANEJAMENTO / PORTAL DO CLIENTE · O "% REALIZADO" DO PORTAL DIVERGIA DO MÓDULO (REVTE-CIVIL 20,72% vs 9,00%); AGORA ESPELHA O `realizadoMspSnapshot` DA RAIZ, IGUAL AO PLANEJAMENTO. 100% BACKEND · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** `pctTotalRealizado` (`portalExterno.ts`) espelha `calMSP.realizadoMspSnapshot` com o MESMO gate do `avancoAtual` (snapshot + statusDate + envSnapOk + monotonicidade); fallback ponderado só se snapshot ausente/stale. Detalhe: `shared/changelog.ts`.

- **Rev. 3285** — **RH & DP / FECHAMENTO DE PONTO · CONFLITOS DE OBRA NO MESMO DIA · AO CONFIRMAR UM DESLOCAMENTO REAL ENTRE OBRAS, O ERP MOSTRAVA TOAST DE SUCESSO MAS O CONFLITO NÃO SUMIA DA LISTA (REAPARECIA NO REFETCH). AGORA SAI DA LISTA. 100% BACKEND · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** `getConflitosObraDia` (`server/routers/fechamentoPonto.ts`) passou a trazer `justificativa`; no ramo multi-obra `todosConfirmados = entries.every(... inclui "Deslocamento confirmado")` → `continue` (não lista); novo upload Dixi sem marcador faz o conflito reaparecer p/ reconferência. Detalhe: `shared/changelog.ts`.

- **Rev. 3284** — **RH & DP / APONTAMENTO DE CAMPO ↔ ESPELHO DE PONTO · AO RESOLVER UM APONTAMENTO DE ATRASO/SAÍDA ANTECIPADA AJUSTANDO O HORÁRIO DA BATIDA, A CORREÇÃO FICAVA SÓ NO `field_notes` E O ESPELHO (QUE LÊ `time_records`) MOSTRAVA O VALOR ANTIGO (EX.: ACÁCIO 10/06/2026 — OCORRÊNCIA 07:37, ESPELHO 07:00). AGORA AS BATIDAS CONFIRMADAS NA RESOLUÇÃO SINCRONIZAM SEMPRE NO `time_records`, MESMO COM acaoTomada='nenhuma'. 100% BACKEND + BACKFILL ESTREITO (2 LINHAS) · ZERO SCHEMA/ALTER/DROP/DELETE.** `resolve` (`server/routers/fieldNotes.ts`) separou `deveMarcarDisciplina` (respeita acaoTomada) de `deveSincronizarHorario` (tipo time-bearing + horário resolvido, INDEPENDENTE da ação); ramo atraso/saída grava fE1/fS1/fE2/fS2 + recalcula horas; backfill transacional só de `atraso`/`saida_antecipada` + `fonte='apontamento'` (NÃO tocou `manual`/`dixi`). Detalhe: `shared/changelog.ts`.

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
