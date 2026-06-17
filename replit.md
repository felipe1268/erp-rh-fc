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

- **Rev. 3189** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O DROPDOWN "TOLERÂNCIA (DIAS)" PAROU DE ABRIR NO MEIO DA TELA: O SELETOR VIROU UM `<select>` NATIVO, CUJO MENU O PRÓPRIO BROWSER ANCORA LOGO ABAIXO DO CAMPO.** PEDIDO (piloto FC FEV/2026): "quando clico para abrir os dias, a janela não fica no local correto — fica no meio da tela. Arrume isso." (print: lista 0,1,2,3,5,7,10,15,28 flutuando no canto sup. esquerdo, longe do campo à direita). CAUSA: o seletor usava o Radix `Select` (shadcn) e, mesmo com os props de popper da Rev. 3184 (`position="popper" side="bottom" align="start" avoidCollisions={false}`), no ambiente do usuário ele caía no modo "item-aligned" (clampado à viewport → jogava o menu pro meio/canto). SOLUÇÃO (FRONTEND-ONLY, ZERO BACKEND/SCHEMA): troquei o Radix `Select` da Tolerância por um `<select>` HTML NATIVO em `client/src/pages/financeiro/FinanceiroConciliacao.tsx` e `FinanceiroConciliacaoWorkspace.tsx` — o dropdown nativo é ancorado pelo browser/SO sempre colado ao campo, impossível "saltar". Mantidos `tolOptions` (0,1,2,3,5,7,10,15 + dias do mês), rótulo "(mês)", estado `toleranciaDias` (agora `onChange`) e estilo Tailwind equivalente ao trigger (`h-8 w-20`, borda, foco-ring). Demais Radix `Select` dessas telas (Status, conta, formato de import) mantidos. ZERO SCHEMA/ALTER/DROP/DELETE · ZERO BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3188** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O KPI "ERP SEM EXTRATO" PAROU DE MUDAR DE VALOR A CADA CONTA: OS LANÇAMENTOS SEM CONTA BANCÁRIA DEFINIDA (`conta_bancaria_id` NULL) SAÍRAM DO NÚMERO DA CONTA E GANHARAM UM BLOCO PRÓPRIO "SEM CONTA BANCÁRIA DEFINIDA".** PEDIDO (piloto FC FEV/2026): o usuário viu o KPI "ERP sem extrato" variar ao clicar em contas diferentes (APLICAÇÃO 394 / BB 408 / CAIXA ADM 411 / CEF 3083-8 578 / Santander Aparecida 844). CAUSA: a query `getConciliacaoReport` (bloco 3 `lancamentosSemExtrato`) filtrava `(e.conta_bancaria_id=$2 OR e.conta_bancaria_id IS NULL)` — somava os lançamentos DA conta + TODOS os SEM conta; como o grosso dos manuais de FEV foi digitado sem conta, esse "piso" (~394) era contado em TODAS as contas e cada conta somava os próprios. SOLUÇÃO (BACKEND+FRONTEND): no `server/routers/financial.ts` o bloco 3 passou a filtrar SÓ `e.conta_bancaria_id=$2` e nasceu o bloco 3b `lancamentosSemConta` (`IS NULL`, independe da conta); no `client/src/pages/financeiro/FinanceiroConciliacao.tsx` o KPI/lista "ERP sem extrato" conta SÓ `repLan`, e os "sem conta" viraram card colapsável "Sem conta bancária definida (N) · R$…" com nota (não entram no número da conta, mas ainda casam com o extrato). Linha de lançamento extraída p/ `renderEntryRow` (reuso); par manual procura em `repLan`+`repSemConta`; PDF ganhou seção 4. Revisão de código: botão "Conciliar" passou a gatear/agir pelos objetos resolvidos `ext`/`lan` (não pelos IDs crus stale). ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3187** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · REDESIGN PARA TELA ÚNICA: O "PAINEL DE CONCILIAÇÃO" SEPARADO FOI APOSENTADO E SEUS 3 BLOCOS (CONCILIADO / EXTRATO-SEM-LANÇAMENTO / ERP-SEM-EXTRATO) PASSARAM A VIVER NA PRÓPRIA TELA `/financeiro/conciliacao`, COM BARRA DE PROGRESSO, KPIs, RELATÓRIO PDF E ANEXO DE COMPROVANTE.** `FinanceiroConciliacao.tsx` lê `getConciliacaoReport` como fonte única dos 3 blocos; card de PROGRESSO + 4 KPIs; "Relatório PDF" (`gerarRelatorioPDF`, `esc()` anti-XSS); match manual 2 colunas + clipe de comprovante; removidos `FinanceiroConciliacaoPainel.tsx` + rota painel. Code review: estado de ERRO dedicado pro report + IDOR fechado (`_assertFinanceiroCompanyAccess`). ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3186** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O BOTÃO "PAINEL DE CONCILIAÇÃO" SAIU DO CABEÇALHO E PASSOU PRA LOGO ABAIXO DO "SUGERIR CONCILIAÇÃO" (DENTRO DO CARD "SUGESTÕES AUTOMÁTICAS").** Em `FinanceiroConciliacao.tsx` o `<Button>` "Painel de Conciliação" (`Maximize2`) saiu da barra de ações do topo e foi pro `CardHeader` do card de sugestões; controles à direita viraram coluna (Tolerância+Sugerir / Painel abaixo). Mesma rota/permissão. ZERO SCHEMA/ALTER/DROP/DELETE · ZERO BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3185** — **FINANCEIRO / MENU · "CONCILIAÇÃO BANCÁRIA" SAIU DO GRUPO "CADASTROS" E PASSOU PRO GRUPO "MOVIMENTAÇÕES" (LOGO ABAIXO DE "CONTAS A PAGAR").** Em `client/src/components/DashboardLayout.tsx` o item `Conciliação Bancária` (`/financeiro/conciliacao`) saiu do bloco `title: "Cadastros"` e entrou no `title: "Movimentações"`, após "Contas a Pagar" — mesma rota/permissão/ícone (`ArrowLeftRight`), só reagrupamento visual. ZERO SCHEMA/ALTER/DROP/DELETE · ZERO BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3184** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · CORREÇÃO DE UX: O DROPDOWN "TOLERÂNCIA (DIAS)" AGORA ABRE SEMPRE LOGO ABAIXO DO CAMPO, EM VEZ DE "SALTAR" PRO MEIO/TOPO DA TELA.** Nos 3 seletores de Tolerância (`FinanceiroConciliacao.tsx`, `FinanceiroConciliacaoWorkspace.tsx`, `FinanceiroConciliacaoPainel.tsx`) o `SelectContent` passou a fixar `position="popper" side="bottom" sideOffset={4} align="start" avoidCollisions={false}` — ancora SEMPRE logo abaixo do campo (a própria lista rola, já tem `max-h`+overflow). Isolado nos 3 selects (NÃO mexe no `select.tsx` global). ZERO SCHEMA/ALTER/DROP/DELETE · ZERO BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3183** — **FINANCEIRO / CONFIGURAÇÕES · NOVO TOGGLE POR EMPRESA "IMPORTAÇÃO AUTOMÁTICA DE DADOS" (LIGA/DESLIGA, DEFAULT DESLIGADO) — O USUÁRIO DECIDE SE OS LANÇAMENTOS FINANCEIROS ENTRAM SOZINHOS OU SÓ MANUALMENTE.** BACKEND+FRONTEND: coluna additiva `financial_tax_config.auto_import_enabled` (SMALLINT DEFAULT 0) + self-heal Rev. 3183; helper `isAutoImportFinanceiroEnabled(companyId)` (ausente/erro/0 = DESLIGADO) gateia `triggerFinancialSync`/`triggerFinancialSyncAwaited` + os 2 loops do `financialAutoImportJob`; `getTaxConfig` devolve `autoImportEnabled` + mutation `financial.setAutoImport`; UI em `FinanceiroConfigSection.tsx` + `FinanceiroConfiguracoes.tsx`. Botão manual de import segue disponível. ZERO SCHEMA destrutivo/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
