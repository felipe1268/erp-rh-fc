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

- **Rev. 3150** — **FINANCEIRO / LANÇAMENTOS · OS LANÇAMENTOS IMPORTADOS DA PLANILHA (ORIGEM `importacao_excel`) PASSARAM A SER EDITÁVEIS PELO LÁPIS — ANTES O ERP BLOQUEAVA COM "Edição bloqueada — Lançamento vinculado a 'importacao_excel' — edite na origem".** PEDIDO (IMG_2082): editar um lançamento vindo da importação da planilha-mestre (Rev. 3149) e tomar o toast "edite na origem". DIAGNÓSTICO: bloqueio era SÓ no front (`FinanceiroLancamentos.tsx`); o backend `financial.updateEntry` JÁ edita qualquer origem desde a Rev. 2661 (só barra pago/recebido/cancelado). O client barrava TODA origem ≠ `recorrente` em dois pontos: o handler `openEditEntry` (lápis da linha + botão "Editar" do detalhe) e o gate de exibição do botão "Editar" no rodapé do diálogo de visualização. RACIONAL: `importacao_excel` foi um CADASTRO ÚNICO (espelho de planilha, igual a manual) — não há origem viva a editar, então edita-se aqui mesmo. CORREÇÃO (FRONTEND-ONLY): os dois gates passaram a aceitar também `origemModulo === "importacao_excel"`. PRESERVAÇÃO: o save só envia tipo/natureza/valor/datas/descrição/conta(categoria)/obra/forma/fornecedor/observações; `conta_bancaria_id`, `juros`, `descontos` e o carimbo de rastreio (`origem_modulo`/`origem_descricao`=IMP_PLANILHA_v2_*) NÃO estão no input → vínculo bancário e rastreabilidade do lote sobrevivem à edição. ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3149** — **FINANCEIRO / LANÇAMENTOS · IMPORTADA A PLANILHA-MESTRE DE PAGAMENTOS (003_DADOS_TRATADOS) PARA A FC=60002 — 8.080 LANÇAMENTOS / R$ 12.431.027,02 (AGO/2024 → ABR/2026), TODOS COMO "A PAGAR", COMO UM HUMANO LANÇARIA À MÃO.** PEDIDO: subir a planilha de pagamentos para o ERP como lançamento manual (lógica do `financial.createEntry`), com de-para de nomes (obras/categorias/contas) e dedup. CONFIRMADO: status='a_pagar', TODOS os meses mês a mês, apaga o lote anterior (193 da v1) e refaz. BUG CORRIGIDO ANTES DE GRAVAR: cada aba mensal tem uma linha `TOTAL` no rodapé (Data="TOTAL") — sem filtro o total dobrava (~R$ 24,8 mi); FILTRO = só linha cuja Data casa o regex `DD/MM/AAAA`. Resultado bate 1:1 com o Resumo do usuário (8.080 / R$ 12.431.027,02 / juros R$ 20.522,87 / desc R$ 15.231,66; 17 abas, recorrentes Mai–Dez/2026 EXCLUÍDAS). DEDUP = 0 colisões (data+valor) vs os 295 reais existentes. EXECUÇÃO (importador psycopg2 fora do app, espelhando colunas do `createEntry`): cria SÓ o novo após de-para token-aware thr 0.62 — 3 obras (Hotel Qiu 2 - Fase 3, JFC - Almoxarifado Itaguaçu, JFC - Casa Itaguaçu), 2 categorias (IMP-014 Propaganda e Marketing, IMP-015 Comunicação Visual), 3 contas (CAIXA ADM, BB FC 37400-8, Santander - JF); INSERT com tipo='despesa', conta_nome=CATEGORIA, conta_bancaria_id pelo de-para, juros/descontos na linha, origem_modulo='importacao_excel' + origem_descricao='IMP_PLANILHA_v2_<YYYY-MM>' (lote rastreável/reversível). 6 linhas "CAIXA ECONOMICA" + multi-conta/Faturamento Direto/Pagamento Cliente ficam SEM banco (rótulo em observações) — resolver na conciliação (Etapa 2). PERF: de-para memoizado + `execute_values` (import inteiro ~10s). ZERO ALTER/DROP/SCHEMA no app; DELETE só do próprio lote 'importacao_excel'. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3148** — **FINANCEIRO / LANÇAMENTOS · NOVO BOTÃO "ZERAR MÊS" (SÓ ADMIN MASTER, COM A SENHA DELE CONFERIDA NO BACKEND) QUE APAGA TODOS OS LANÇAMENTOS DO MÊS ANALISADO — DEIXANDO O MÊS COMPLETAMENTE ZERADO.** NOVA `financial.wipeMonthEntries` ({companyId, dataInicio, dataFim, password, motivo}) com 5 camadas — role admin_master, SENHA via `bcrypt.compareSync` contra `users.password`, tenant-guard `_assertFinanceiroCompanyAccess`, `motivo` obrigatório, auditoria `financial_month_wiped` com snapshot ANTES de apagar. ESCOPO = mesmo conjunto da tela (sobreposição competência↔vencimento↔criação + exclui projeções) e apaga TODAS as situações reais. Frontend: botão "Zerar mês" só p/ admin_master + mês selecionado; gate de role DUPLO. ZERO ALTER/DROP/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3147** — **FINANCEIRO (MÓDULO INTEIRO) · TRAVA "SÓ REAL" — AS TELAS PASSARAM A MOSTRAR APENAS CAIXA REAL (LANÇAMENTOS EFETIVOS); TODAS AS PROJEÇÕES SUMIRAM POR PADRÃO.** NOVO `shared/financeiroProjecao.ts` (set único `PROJECAO_ORIGENS` + `isProjecaoOrigem` + `sqlNotProjecao` + flag global `FINANCEIRO_SOMENTE_REAL=true`); `financial.ts` esconde projeções em `getEntries`/`getEntriesTotais`/`getEntriesResumoMensal`/`getContasAPagarByYear`/`getContasAReceberByYear`; client some o seletor Efetivo/Projeção/Todos. REVERSÍVEL flipando a const; ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3146** — **FINANCEIRO / CONTAS A PAGAR · O CARD "TOTAL <MÊS>" VOLTOU A BATER — A CONTAGEM DE CONTAS PASSOU A USAR O MESMO ESCOPO (EFETIVO/PROJEÇÃO/TODOS) DO VALOR, ENTÃO "TOTAL = PAGO + A PAGAR" FECHA TAMBÉM NA QUANTIDADE.** Em `FinanceiroContasAPagar.tsx` a contagem do card passou de `mesData.length` (todas, inclui projeções) para `escopoMes.length` (= pagos + pendentes), batendo com o valor; no modo "Efetivo" mostra sufixo "· +N em projeção". FRONTEND-ONLY; ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3145** — **FINANCEIRO / LANÇAMENTOS · OS CARDS "TOTAL RECEITAS / DESPESAS / RESULTADO" PASSARAM A SOMAR TODOS OS LANÇAMENTOS DO PERÍODO NO SERVIDOR (NÃO SÓ AS ~500 DA LISTA).** NOVA procedure READ-ONLY `financial.getEntriesTotais` que espelha 1:1 os filtros do `getEntries` sem limit/offset e agrega `SUM(valor_previsto)` por tipo; frontend lê o agregado (fallback p/ a lista enquanto carrega). ADITIVA; ZERO ALTER/DROP/DELETE/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3144** — **RH / RAIO-X · FICHA DE AVALIAÇÃO DO CLIENTE (PDF) NÃO VAZA MAIS DA PÁGINA — MARGENS ENXUTAS, TEXTO QUEBRA NA CÉLULA E A DATA SAI CERTA ("16/06/2026").** `@page` margins reduzidas (`8mm 8mm 12mm 8mm`) + `word-break`/`overflow-wrap` em `th`/`td`; extração da data trocou `.split("T")[0]` por `.split(/[T ]/)[0]` (o timestamp vem com ESPAÇO, não "T") nos 4 pontos do Raio-X. FRONTEND-ONLY; ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
