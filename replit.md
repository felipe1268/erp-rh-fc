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

- **Rev. 3080** — **MEDIÇÃO DE TERCEIROS (A PAGAR) · MÓDULO DEDICADO `/terceiros/medicoes` ELEVADO AO FLUXO COMPLETO: APROVAÇÃO EM 3 NÍVEIS (MEDE → GESTOR DA OBRA → SÓCIO ADM LIBERA FINANCEIRO) COM FALLBACK 1-CLIQUE, BADGE DE ALERTA DE DIVERGÊNCIA, FD ABATIDO + LÍQUIDO A PAGAR E STRIP VISUAL DOS NÍVEIS — GOVERNADO PELO `medicao_config` POR EMPRESA.** Continuação da Rev. 3079 (que entregou o fluxo na ABA do contrato); aqui leva o MESMO comportamento à TELA DEDICADA já existente (`client/src/pages/terceiros/Medicoes.tsx`, rota `/terceiros/medicoes`, menu "Medições" de Terceiros), que só tinha aprovação 1-nível — virando o HUB cross-contrato do "a pagar". FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA (backend/schema já existiam da Rev. 3078/3079; `listarMedicoes` já retorna a linha completa). MAPA DO PLANO: a infra já existia em grande parte — Medição de CLIENTE (a receber, % auto do avanço semanal) já vive em `/medicao` (MedicaoContratos + MedicaoDetalhe, auto-fill via `getAvancosParaMedicao` → T006 atendido) e rotas/menu/permissões dos 2 módulos já registradas (`shared/modules.ts`/`App.tsx`/`DashboardLayout.tsx` → T008 atendido). DESVIOS conscientes (anti-regressão): T007 (aba do contrato → espelho 100% read-only) NÃO aplicado — os editores de levantamento/FD/itens vivem na aba; torná-la read-only órfã o fluxo enquanto a tela dedicada não replica esses editores inline. T003 (histórico "já medido" cinza por contrato) fica parcial — engine de levantamento já é compartilhada via rota `/medicao/:contratoId/levantamento/:campoId`. IMPLEMENTAÇÃO: query `medicaoConfig.getConfig` → `tresNiveis`; mutations `aprovarNivelGestor`/`aprovarNivelSocio` + `aprovarMedicao`/`rejeitarMedicao`; botão condicional Gestor/Sócio; badge divergência (lê `alertaDivergencia`/`percentualDivergencia`) + contador; bloco FD abatido/Líquido (BRL pt-BR); strip Medido→Gestor→Sócio por `nivelAprovacao`. Detalhe: `shared/changelog.ts`.

- **Rev. 3079** — **MEDIÇÃO DE TERCEIROS (A PAGAR) · BACKEND + UI DO FLUXO COMPLETO NA ABA "MEDIÇÕES" DO CONTRATO: APROVAÇÃO 3 NÍVEIS (MEDE → GESTOR DA OBRA → SÓCIO ADM LIBERA FINANCEIRO), PAINEL "FD DO PERÍODO" (MANUAL, ABATE OBRIGATORIAMENTE O VALOR A PAGAR COM LÍQUIDO AO VIVO) E VÍNCULO DO LEVANTAMENTO + ALERTA DE DIVERGÊNCIA (LEVANTADO × CRONOGRAMA) CONTRA A TOLERÂNCIA DE `medicao_config`.** Continuação direta da Rev. 3078 (que entregou config + schema); aqui liga o COMPORTAMENTO ao schema já existente — ZERO ALTER/DROP/DELETE/SCHEMA (só código). Decisão de escopo: enriquecer a aba "Medições" do contrato de Terceiros (entrega funcional ponta-a-ponta) em vez de já criar telas/menu dedicados. BACKEND `server/routers/terceiroContratos.ts` (todas com `_assertCompanyAccess` + dono do contrato/medição — anti-IDOR): `listarFdsTerceiro`/`criarFdTerceiro`/`atualizarFdTerceiro`/`excluirFdTerceiro` (FD manual em `terceiro_medicao_fds`, `origem:"manual"`, bloqueia se medição aprovada/paga); `vincularLevantamentoMedicao` (grava `levantamento_campo_id`/`quantidade_levantada`/`unidade_levantada` + calcula `percentual_divergencia` e `alerta_divergencia` se `|div| > divergencia_tolerancia_pct`; anti-IDOR valida o `levantamento_campo_id` contra `medicao_campo` — mesma empresa + mesmo contrato + `origem='terceiro'`); `aprovarNivelGestor` (nível 0→1, sem financeiro) e `aprovarNivelSocio` (exige nível≥1, tx replica sync de `terceiro_contrato_itens` do `aprovarMedicao` + grava `fd_total_abatido` + dispara `triggerFinancialSyncAwaited`). O 1-clique `aprovarMedicao` segue p/ empresas com `aprovacao_tres_niveis=0`. FRONTEND `client/src/pages/terceiros/contratos/ContratoDetalhe.tsx`: queries `medCfg`/`fdsTerceiro` + mutations `aprovarGestorMut`/`aprovarSocioMut`/`criarFdTerceiroMut`/`excluirFdTerceiroMut` propagadas ao `MedicoesTab`; `tresNiveis` troca o botão "Aprovar" por "Aprovar (Gestor)"→"Liberar (Sócio Adm)"; strip visual dos 3 níveis; novo `FdMedicaoPanel` (lista FDs + form inline com máscara BRL `R$ 0,00` + rodapé Medido/Total FD/Líquido). Corrigido bug latente: `companyId` BARE → `contrato.companyId`. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3078** — MEDIÇÕES · FUNDAÇÃO DA REESTRUTURAÇÃO EM 2 MÓDULOS (CLIENTE A RECEBER × TERCEIROS A PAGAR): NOVO "PAINEL DE CONTROLE DAS MEDIÇÕES" EM CONFIGURAÇÕES (POR EMPRESA) + SCHEMA/SELF-HEAL. Tabela `medicao_config` (flags terceiros/cliente/levantamento/fotos/3-níveis + tolerância divergência + dia medição) + router `medicaoConfig.ts` + UI `MedicaoConfigSection.tsx`; 10 colunas de 3º nível/levantamento/FD em `terceiro_medicoes`; tabela `terceiro_medicao_fds`; `medicao_campo.medicao_id`/`.origem`. ZERO ALTER destrutivo/DROP/DELETE (só CREATE TABLE / ADD COLUMN IF NOT EXISTS); verificado no NEON direto. Detalhe: `shared/changelog.ts`.

- **Rev. 3077** — CONTRATOS DE TERCEIROS · A "DATA DE CORTE" (DIA DA MEDIÇÃO) SÓ É CONFIGURÁVEL ANTES DA ASSINATURA; DEPOIS DE ASSINADO O CARD "CRITÉRIOS DE MEDIÇÃO E PAGAMENTO" TRAVA (selo "🔒 Travado após assinatura") E FICA EXPLÍCITO QUE MUDAR O CORTE REAJUSTA SOZINHO O PERÍODO DAS MEDIÇÕES (VARIA POR OBRA). Em `ContratoDetalhe.tsx`: botão "Configurar" gated por `assinaturaStatus !== "concluido"` + nota informativa `bg-blue-50`. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3076** — **CONTRATOS DE TERCEIROS · "GERAR MEDIÇÃO AUTOMÁTICA" · A 1ª MEDIÇÃO PASSA A COMEÇAR NA DATA DE INÍCIO DA OBRA/CONTRATO E O FIM DE TODA MEDIÇÃO É SEMPRE O "DIA DA MEDIÇÃO" DO CONTRATO (CORTE — Ex.: DIA 25), CRIANDO OS VÍNCULOS CORRETOS.** PEDIDO (prints iPad, modal "Medição 01" 01/06→30/06 vs card Dia 25): "O CALENDÁRIO DEVERIA SER MEDIDO DO DIA QUE INICIO A OBRA, E A DATA DE CORTE SERÁ DIA 25 DO MES... ISSO PODE VARIAR CONFORME INDICADO NO CONTRATO... CONFIGURA ISSO PARA TER OS VINCULOS CORRETOS." Complementa a Rev. 3075. SOLUÇÃO (FRONTEND-ONLY, ZERO ALTER/DROP/DELETE, ZERO schema/backend — `gerarMedicao` já recebe `dataInicio`/`dataFim`) em `client/src/pages/terceiros/contratos/ContratoDetalhe.tsx`: (1) `useEffect([showGerarMedicao])` da 1ª medição semeia `medicaoDataInicio` = `contrato.dataInicio` (data de início da obra; fallback hoje), início segue editável; (2) `fimEfetivo` deixa de depender de `isFirst` e é SEMPRE `cutoffOnOrAfterISO(diaMed, inicioEfetivo)` (1º Dia da Medição em/após o início) — mudar o início recalcula o fim; (3) campo "Fim" vira read-only ("Fim (Dia da Medição)") também na 1ª medição; (4) removido o state órfão `medicaoDataFim`. `diaMed = contrato.diaMedicao ?? 25` (varia por contrato). Detalhe: `shared/changelog.ts`.

- **Rev. 3075** — CONTRATOS DE TERCEIROS · "GERAR MEDIÇÃO AUTOMÁTICA" PASSA A RESPEITAR O "DIA DA MEDIÇÃO" DEFINIDO NOS CRITÉRIOS DO CONTRATO — O PERÍODO DEIXA DE CAIR EM "1º → ÚLTIMO DIA DO MÊS" E PASSA A FECHAR NO DIA DA MEDIÇÃO. Em `client/src/pages/terceiros/contratos/ContratoDetalhe.tsx`: helpers de módulo `addDaysISO` (soma via `Date.UTC`, sem fuso), `cutoffMedicaoISO` (corte = Dia da Medição clampado ao último dia do mês) e `cutoffOnOrAfterISO` (próximo corte em/ após o início). `gerarMedicao` já recebe `dataInicio`/`dataFim`. FRONTEND-ONLY, ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3074** — CIPA · DIÁLOGO "NOVO MANDATO / ELEIÇÃO" GANHA AUTO-PREENCHIMENTO DO PERÍODO: AO DIGITAR O INÍCIO DO MANDATO, O FIM É CALCULADO SOZINHO (+1 ANO, PADRÃO NR-5) E VICE-VERSA. Em `client/src/pages/CipaCompleta.tsx`: novo helper puro `addYearsStr(s, n)` (soma/subtrai anos de "YYYY-MM-DD" via string, SEM `new Date()` — evita bug de fuso iOS; clampa 29/02→28/02). Os dois `<Input type="date">` do período usam updater funcional bidirecional (Início→Fim +1ano / Fim→Início −1ano); limpar um limpa o outro. Vale p/ "Nova eleição" e "Mandato anterior". FRONTEND-ONLY, ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
