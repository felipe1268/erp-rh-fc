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

- **Rev. 3084** — **MEDIÇÃO DE TERCEIROS · LIMPEZA FINAL DO MENU + A TELA `/terceiros/medicoes` PASSA A LISTAR OS CONTRATOS ATIVOS PRONTOS PARA MEDIR (SÓ APÓS ASSINATURA CONCLUÍDA).** PEDIDO (prints iPad): "retire deste módulo tudo que está no módulo medições" + "Contratos não precisa estar no Medições; lá só devem aparecer os contratos ativos para fazer a medição, e só depois das assinaturas finalizadas". MUDANÇAS: (1) `DashboardLayout.tsx` — "Medições PJ" (`/pj-medicoes`) sai de `menuSectionsTerceiros` e entra na barra dedicada `menuSectionsMedicaoTerceiros`; "Contratos de Serviço" REMOVIDO da barra dedicada (deixa de ser item de menu). (2) `ModuleContext.tsx` — `ROUTE_MODULE_MAP["/pj-medicoes"]` → "medicao-terceiros". (3) BACKEND `server/routers/terceiroContratos.ts` — NOVA query `listarContratosParaMedicao({companyId})` retorna contratos `status="ativo"` cujo envelope FcSign não-excluído está "concluido" (mesma regra adesiva do `getContrato`, Rev. 3064), com `empresaNome`/`obraNome`/`% medido`/`saldoAMedir` (READ-ONLY, ZERO ALTER/DROP/DELETE). (4) FE `Medicoes.tsx` — bloco "Contratos ativos para medir" (cards com barra de progresso, BRL pt-BR, navega p/ `/terceiros/contratos/:id?tab=medicoes`) acima de "Medições registradas". Detalhe: `shared/changelog.ts`.

- **Rev. 3083** — **MEDIÇÃO DE TERCEIROS · VIRA MÓDULO DEDICADO COM BARRA DE COMANDO PRÓPRIA: AO ABRIR `/terceiros/medicoes` A SIDEBAR MOSTRA SÓ AS FUNÇÕES DE MEDIÇÃO (NÃO O MENU INTEIRO DO TERCEIROS) E O ITEM "MEDIÇÕES" FOI REMOVIDO DO MENU DE TERCEIROS (DEDUP — A FUNÇÃO FICA EM UM SÓ LUGAR).** PEDIDO (print iPad): "ao clicar em Medições de Terceiros abrir uma barra de comando específica, não o menu inteiro do Terceiros" + "limpa o Terceiros, Medições não precisa aparecer em duas telas". Até a Rev. 3082 `/terceiros/medicoes` resolvia `activeModule="terceiros"`. SOLUÇÃO (FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND/PERMISSÕES): `ModuleContext.tsx` — novo `ModuleId` "medicao-terceiros"; `ROUTE_MODULE_MAP["/terceiros/medicoes"]` → "medicao-terceiros" (exact-match vence longest-prefix); `MODULE_LABELS` + validação de localStorage atualizadas. `DashboardLayout.tsx` — nova seção `menuSectionsMedicaoTerceiros` (Medições a pagar + Contratos de Serviço), registrada nos Records exaustivos `MODULE_SECTIONS`/`MODULE_HOME_ROUTES`/`MODULE_THEME` (Receipt, laranja) + entrada no seletor `ALL_MODULE_DEFS` reutilizando gating do Terceiros; REMOVIDO o item "Medições" de `menuSectionsTerceiros`. ACL: a feature `terceiros-medicoes` em `shared/modules.ts` foi MANTIDA de propósito (o `routeToFeatureKey` resolve a permissão da rota por ela; módulo reutiliza a permissão "terceiros") — sem mudança de permissões. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3082** — MEDIÇÕES · FECHAMENTO DO SESSION_PLAN (T003 + T007): HISTÓRICO "JÁ MEDIDO" ACUMULADO POR CONTRATO NO LEVANTAMENTO DE CAMPO (CINZA, P/ NÃO REMEDIR O MESMO ITEM) + A ABA "MEDIÇÕES" DO CONTRATO VIRA ESPELHO SÓ-LEITURA POR PADRÃO (TOGGLE "EDITAR NESTA ABA" + CTA P/ O MÓDULO DEDICADO). ZERO ALTER/DROP/DELETE/SCHEMA (T003 query READ-ONLY; T007 FRONTEND-ONLY). `server/routers/medicao.ts` (`getHistoricoQuantidades`) + `MedicaoLevantamento.tsx` + `ContratoDetalhe.tsx` (`modoEdicao`). Detalhe: `shared/changelog.ts`.

- **Rev. 3081** — HUB DE MÓDULOS (HOME) · O CARD ÚNICO "MEDIÇÃO" FOI DESDOBRADO NOS DOIS MÓDULOS DEDICADOS: "MEDIÇÃO CLIENTE" (A RECEBER → `/medicao`) E "MEDIÇÃO TERCEIROS" (A PAGAR → `/terceiros/medicoes`). FRONTEND-ONLY em `ModuleHub.tsx`: card "medicao" renomeado (Ruler, teal); NOVO card "medicao-terceiros" (Receipt, laranja) com campo opcional `permId?` no type `Module` (`permId = m.permId ?? m.id` resolve gate de grupo/visibilidade/`canAccessModule`; `hubToConfigKey["medicao-terceiros"]="terceiros"`). ZERO ALTER/DROP/DELETE/SCHEMA/BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3080** — MEDIÇÃO DE TERCEIROS (A PAGAR) · MÓDULO DEDICADO `/terceiros/medicoes` ELEVADO AO FLUXO COMPLETO: APROVAÇÃO 3 NÍVEIS (MEDE → GESTOR → SÓCIO ADM LIBERA FINANCEIRO) COM FALLBACK 1-CLIQUE, BADGE DE DIVERGÊNCIA, FD ABATIDO + LÍQUIDO A PAGAR E STRIP VISUAL — GOVERNADO PELO `medicao_config` POR EMPRESA. Leva o fluxo da Rev. 3079 (aba do contrato) à TELA DEDICADA (`client/src/pages/terceiros/Medicoes.tsx`), que só tinha 1-nível, virando o HUB cross-contrato do "a pagar". FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3079** — MEDIÇÃO DE TERCEIROS (A PAGAR) · BACKEND + UI DO FLUXO COMPLETO NA ABA "MEDIÇÕES" DO CONTRATO: APROVAÇÃO 3 NÍVEIS (MEDE → GESTOR → SÓCIO ADM LIBERA FINANCEIRO), PAINEL "FD DO PERÍODO" (MANUAL, ABATE O VALOR A PAGAR COM LÍQUIDO AO VIVO) E VÍNCULO DO LEVANTAMENTO + ALERTA DE DIVERGÊNCIA. `server/routers/terceiroContratos.ts` (anti-IDOR): CRUD de `terceiro_medicao_fds`, `vincularLevantamentoMedicao` (calcula `percentual_divergencia`/`alerta_divergencia`), `aprovarNivelGestor`/`aprovarNivelSocio` (replica sync de itens + grava `fd_total_abatido` + dispara `triggerFinancialSyncAwaited`); FE `ContratoDetalhe.tsx` (botão Gestor→Sócio, strip 3 níveis, `FdMedicaoPanel`). ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3078** — MEDIÇÕES · FUNDAÇÃO DA REESTRUTURAÇÃO EM 2 MÓDULOS (CLIENTE A RECEBER × TERCEIROS A PAGAR): NOVO "PAINEL DE CONTROLE DAS MEDIÇÕES" EM CONFIGURAÇÕES (POR EMPRESA) + SCHEMA/SELF-HEAL. Tabela `medicao_config` (flags terceiros/cliente/levantamento/fotos/3-níveis + tolerância divergência + dia medição) + router `medicaoConfig.ts` + UI `MedicaoConfigSection.tsx`; 10 colunas de 3º nível/levantamento/FD em `terceiro_medicoes`; tabela `terceiro_medicao_fds`; `medicao_campo.medicao_id`/`.origem`. ZERO ALTER destrutivo/DROP/DELETE (só CREATE TABLE / ADD COLUMN IF NOT EXISTS); verificado no NEON direto. Detalhe: `shared/changelog.ts`.

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
