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

- **Rev. 3183** — **FINANCEIRO / CONFIGURAÇÕES · NOVO TOGGLE POR EMPRESA "IMPORTAÇÃO AUTOMÁTICA DE DADOS" (LIGA/DESLIGA) — DEFAULT DESLIGADO; AGORA O USUÁRIO DECIDE DE FORMA CLARA E EXPLÍCITA SE OS LANÇAMENTOS FINANCEIROS ENTRAM SOZINHOS OU SÓ MANUALMENTE.** PEDIDO (piloto FC FEV/2026): "não quero nada automático por hora... porém coloque nas Configurações a opção de habilitar ou não a opção de vir automático". O que ainda rodava sozinho: o JOB agendado (`financialAutoImportJob` — startup/retroação 6 meses + ciclo 30 min: folha, PJ, parceiros, despesas, receitas/medições, projeção 12m) e os GATILHOS em tempo real (`financialEventTrigger`, inclusive o "medição aprovada entra automática"). SOLUÇÃO (BACKEND + FRONTEND): coluna additiva `financial_tax_config.auto_import_enabled` (SMALLINT DEFAULT 0) + self-heal `[SyncSchema+] Rev. 3183`; helper `isAutoImportFinanceiroEnabled(companyId)` (ausente/erro/0 = DESLIGADO) gateia `triggerFinancialSync`, `triggerFinancialSyncAwaited` e os 2 loops por empresa do job — SEM tocar os ~12 callers espalhados. API: `getTaxConfig` devolve `autoImportEnabled` + nova mutation `financial.setAutoImport` (auditada). UI espelhada em `FinanceiroConfigSection.tsx` (sub-seção com `Switch`) e na tela legada `FinanceiroConfiguracoes.tsx` (card). Botão manual "Auto-Importar Dados" e "Recebíveis Previstos" seguem disponíveis. Alertas e sync revenue→planejamento ficaram FORA do gate (não importam dados novos). ZERO SCHEMA destrutivo/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3182** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · NOVO "PAINEL DE CONCILIAÇÃO" — UMA TELA SÓ, ESPAÇOSA, COM OS 3 BLOCOS QUE O USUÁRIO PEDIU: (1) SUGESTÕES AUTOMÁTICAS, (2) "NO EXTRATO, SEM LANÇAMENTO NO ERP" E (3) "NO ERP, SEM EXTRATO". ABRE DIRETO APÓS IMPORTAR O EXTRATO.** PEDIDO (piloto FC FEV/2026): o usuário rejeitou o botão "Abrir em tela cheia" (Workspace/stepper Rev. 3178) — queria UMA tela ampla com os 3 blocos visíveis ao mesmo tempo, aberta logo após importar. SOLUÇÃO (FRONTEND-ONLY, ZERO BACKEND — backend já entregava tudo): NOVA página `client/src/pages/financeiro/FinanceiroConciliacaoPainel.tsx` (rota `/financeiro/conciliacao/painel`, reusa permissão `route="/financeiro/conciliacao"`), tela única rolável que lê `?conta=&ano=&mes=`: cabeçalho fixo (conta + nav ano/mês com dots + tolerância + Importar/Atualizar/Relatório PDF), KPIs, BLOCO 1 sugestões (`sugerirConciliacao`→checkbox/lote via `conciliarSugestoes`), BLOCO 2 duas colunas `extratoSemLancamento`×`lancamentosSemExtrato` (`getConciliacaoReport`) + barra fixa de match manual (`conciliarLancamento`), `<details>` conciliados, dialogs Importar/Detalhe/Limpar Extrato. Na tela clássica (`FinanceiroConciliacao.tsx`): botão "Abrir em tela cheia"→"Painel de Conciliação" apontando p/ a rota nova + redirect automático ao Painel após import. Workspace stepper preservado em `/workspace`. ZERO SCHEMA/ALTER/DROP/DELETE · ZERO BACKEND. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3181** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O DIÁLOGO "IMPORTAR EXTRATO BANCÁRIO" PAROU DE PEDIR A CONTA BANCÁRIA DE NOVO — AGORA MOSTRA (SÓ LEITURA) A CONTA E O MÊS JÁ ESCOLHIDOS NA TELA/ETAPA E SÓ PEDE O ARQUIVO.** PEDIDO (piloto FC FEV/2026): a conta já é escolhida antes (Workspace: mês→conta→importar; tela clássica: card de conta no topo), então o `Select` "Conta Bancária *" dentro do diálogo era redundante e perigoso (dava pra importar em conta diferente da que se estava conciliando). SOLUÇÃO (FRONTEND-ONLY, ZERO BACKEND) nos 2 diálogos (`FinanceiroConciliacaoWorkspace.tsx` + `FinanceiroConciliacao.tsx`): `Select` editável → cartão SÓ-LEITURA com ícone/cor do banco (`bancoCor`), banco+descrição, `Ag./Conta` (`formatAgencia`/`formatConta`) e período (mês/ano). Importação segue usando `importConta` (já pré-preenchido com `contaBancariaId` na abertura); sem conta → aviso âmbar + botão "Importar" desabilitado (gate `!importConta` intacto). Bloqueio de mês errado (Rev. 3179) e barra de progresso (Rev. 3175) preservados. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3180** — **FINANCEIRO / CONTAS A RECEBER · NOVO BOTÃO "ANO TODO" NO SELETOR DE MESES QUE MOSTRA TODOS OS LANÇAMENTOS DO ANO DE UMA VEZ (SEM PRECISAR CLICAR MÊS A MÊS).** PEDIDO: "coloca um botão do ano todo para ver todos lançamentos do ano — facilita muito". A tela "Contas a Receber" só mostrava um mês por vez (Jan…Dez). SOLUÇÃO (FRONTEND-ONLY `client/src/pages/financeiro/FinanceiroContasAReceberTitulos.tsx`): botão "Ano todo" ao lado da navegação de ano, usando a sentinela `mesSel === 0` (clicar de novo volta ao mês atual). Ativo → `mesData` para de filtrar por mês e devolve TODAS as linhas do ano (busca/cliente/status continuam valendo); KPIs viram "A receber no ano"/"Recebido no ano"; lista por cliente e estado vazio ("Nenhum título a receber em {ano}") se ajustam; guarda contra `MESES[-1]` nos pontos que liam `MESES[mesSel-1]`/`MESES_LONGO[mesSel-1]`. ZERO SCHEMA/ALTER/DROP/DELETE · ZERO BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3179** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · AGORA DÁ PRA "LIMPAR EXTRATO" (REMOVER UM EXTRATO IMPORTADO POR ENGANO, POR CONTA + PERÍODO) E A IMPORTAÇÃO BLOQUEIA AUTOMATICAMENTE QUANDO O ARQUIVO É DE UM MÊS DIFERENTE DO MÊS SELECIONADO NA TELA.** SOFT-DELETE reversível via novo `financial.limparExtrato` (reverte conciliação + marca `bank_statement_lines.excluido_em`, sem `DELETE`; reads/dedup filtram `excluido_em IS NULL`); nova coluna additiva `excluido_em`. FRONTEND (2 telas): `handleImport(skipMonthCheck)` calcula mês dominante e aborta+`AlertDialog` se divergir do selecionado; botão "Limpar extrato". ZERO SCHEMA destrutivo/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3178** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · NOVO "WORKSPACE DE CONCILIAÇÃO" EM TELA CHEIA (3 ETAPAS GUIADAS) QUE LEMBRA ONDE VOCÊ PAROU AO SAIR/VOLTAR E GERA RELATÓRIO PDF DO CONCILIADO + DO QUE FALTA.** NOVA PÁGINA `FinanceiroConciliacaoWorkspace.tsx` (rota `/financeiro/conciliacao/workspace`, reusa permissão `route="/financeiro/conciliacao"`); stepper 3 etapas; persistência em `localStorage`. BACKEND: endpoint read-only `financial.getConciliacaoReport` (tenant guard). ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3177** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · NAS "SUGESTÕES AUTOMÁTICAS" DÁ PRA CLICAR NO LANÇAMENTO DO ERP E ABRIR UM DETALHE CONSULTIVO (READ-ONLY) ANTES DE CONCILIAR — EVITANDO CASAR O EXTRATO COM O LANÇAMENTO ERRADO.** FRONTEND `FinanceiroConciliacao.tsx`: lado "Lançamento" virou `<button>` (preventDefault+stopPropagation, ícone olho) + `Dialog` read-only via `financial.getEntryDetalhe`. BACKEND: `getEntryDetalhe` ganhou `_assertFinanceiroCompanyAccess` (anti-IDOR). ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
