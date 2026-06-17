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

- **Rev. 3198** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · OS ITENS DA LISTA "NO EXTRATO, SEM LANÇAMENTO" GANHARAM UM BOTÃO "LANÇAR" QUE ABRE UM FORMULÁRIO PRÉ-PREENCHIDO (DATA, CONTA E VALOR DO EXTRATO); O USUÁRIO SÓ COMPLETA OBRA, FORNECEDOR, CATEGORIA E CENTRO DE CUSTO, E AO SALVAR O LANÇAMENTO NASCE "PAGO" E JÁ CONCILIADO COM A LINHA.** PEDIDO (piloto FC): lançar direto da conciliação, sem ir ao módulo de Lançamentos nem redigitar data/valor. SOLUÇÃO: em `client/src/pages/financeiro/FinanceiroConciliacao.tsx`, cada linha de `repExt` virou um wrapper com a área de seleção (conciliação 1:1) + um botão "+ Lançar" (ícone `Plus`, `stopPropagation`) que abre um Dialog pré-preenchido — data (`s.data`), conta (`contaBancariaId` / `contaLabel` read-only) e valor (`abs(s.valor)` com máscara BRL `maskBRLInput`/`parseBRLInput`), tipo derivado do sinal (entrada→receita / saída→despesa). Selects: Obra (`obras.listActive`), Fornecedor (datalist `compras.listarFornecedores`), Categoria (datalist `financial.getAccounts`, herda o CC da categoria), Centro de Custo (`financial.getCostCenters`), forma e descrição. `submitLancar` cria via `financial.createEntry` (status `pago`, data/valor/conta preenchidos) e auto-concilia com a linha via `conciliarLancamento`. BACKEND: `createEntry` (`server/routers/financial.ts`) passou a aceitar/gravar `centroCustoId`/`centroCustoNome` em colunas JÁ EXISTENTES de `financial_entries` (ZERO ALTER; params na MESMA posição pelo `dbExecute`). RESSALVA: segue 1:1; se a conciliação pós-criação falhar, o lançamento já existe (aparece em "ERP sem extrato") e pode ser casado à mão. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3197** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · A ÁREA DE CONCILIAÇÃO MANUAL (LADO A LADO) GANHOU UMA FAIXA DE AJUDA EXPLICANDO O PASSO A PASSO PARA CASAR MANUALMENTE OS ITENS QUE NÃO DERAM MATCH AUTOMÁTICO.** PEDIDO (piloto FC): "os itens que não deram match automático — tem como conciliar manualmente?". A conciliação manual 1:1 já EXISTIA (Rev. 3187: clicar numa linha do extrato + no lançamento do ERP → barra azul no rodapé com botão "Conciliar"), mas o atrito era de DESCOBERTA — nada na tela dizia que era preciso clicar em um item de cada lado. SOLUÇÃO (FRONTEND-ONLY): em `client/src/pages/financeiro/FinanceiroConciliacao.tsx`, logo acima do grid das duas colunas foi adicionada uma faixa de ajuda (ícone `Link2`, fundo azul claro): clique em UM item de cada lado → confira o Δ → "Conciliar"; sempre 1 para 1. Só aparece com pendências (`repExt.length > 0 || repLan.length > 0`). Nenhuma mudança de lógica/mutação. RESSALVA: caso N:1 (vários vales/abastecimentos → 1 boleto) segue sem conciliação manual (agrupamento pendente). ZERO SCHEMA/ALTER/DROP/DELETE · ZERO BACKEND. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3196** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · AS DUAS LISTAS DE PENDÊNCIAS ("NO EXTRATO, SEM LANÇAMENTO" E "NO ERP, SEM EXTRATO") GANHARAM BOTÕES PARA EXPORTAR CADA UMA SEPARADAMENTE EM EXCEL (.XLSX) E EM PDF.** `exportarListaExcel`/`exportarListaPDF` em `FinanceiroConciliacao.tsx` (SheetJS `await import("xlsx")` + HTML com cabeçalho institucional FC e `print()`); botões ghost "Excel"/"PDF" por card, só com itens na lista. Colunas: extrato = Data/Descrição/Tipo/Valor; ERP = Data/Lançamento/Obra/Valor. ZERO SCHEMA/ALTER/DROP/DELETE · ZERO BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3195** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · AS PROJEÇÕES (CRONOGRAMA DA OBRA, FOLHA PROJETADA, VR/VA PROJETADO, FÉRIAS/RESCISÃO PROJETADAS ETC.) DEIXARAM DE APARECER NA CONCILIAÇÃO — ELA PASSA A TRATAR SOMENTE DO QUE FOI EFETIVAMENTE PAGO/RECEBIDO (CAIXA REAL).** As 3 queries que leem `financial_entries` na conciliação (`getConciliacaoReport` bloco 3 e 3b + `sugerirConciliacao`) ganharam `AND ${sqlNotProjecao("e.origem_modulo")}` (`shared/financeiroProjecao.ts`); SQL literal, não afeta a ligação posicional do `dbExecute`. RESSALVA: caso N:1 (vale/combustível → 1 boleto) é tema de outra revisão. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3194** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · A LISTA DE "SUGESTÕES AUTOMÁTICAS" GANHOU UM CABEÇALHO FIXO NO TOPO QUE DEIXA EXPLÍCITO QUE A COLUNA DA ESQUERDA É O "EXTRATO (BANCO)" E A DA DIREITA É O "LANÇAMENTO NO ERP".** PEDIDO (piloto FC): cada linha tem dois lados (extrato → lançamento) mas só havia um rótulo minúsculo repetido por linha; não ficava claro qual lado é banco e qual é ERP. SOLUÇÃO (FRONTEND-ONLY): em `client/src/pages/financeiro/FinanceiroConciliacao.tsx`, a lista ganhou uma linha de cabeçalho `sticky top-0` (fundo cinza, bold uppercase) com 3 colunas alinhadas às linhas — "Extrato (banco)" / "Lançamento no ERP" (azul) / "Confiança"; o `divide-y` migrou pra wrapper interno (borda+scroll `max-h` no container) p/ o cabeçalho grudar no scroll. Linhas/badges/lógica inalterados. ZERO SCHEMA/ALTER/DROP/DELETE · ZERO BACKEND. Detalhe: `shared/changelog.ts`.

- **Rev. 3193** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · OS COMPROVANTES (PIX/BOLETO) VIRARAM FONTE DE IDENTIFICAÇÃO NO MATCH EXTRATO×ERP: A IA LÊ O COMPROVANTE (BENEFICIÁRIO, CNPJ/CPF, ID DA TRANSAÇÃO) E ISSO É USADO COMO DESEMPATE — NUNCA CONCILIA PELO NOME SOZINHO (SEMPRE EXIGE O VALOR BATENDO) E O USUÁRIO SEMPRE CONFERE.** Novo módulo de IA `financeiro` (`shared/aiModules.ts`); 6 colunas aditivas em `financial_entries` (comprovante_* via self-heal, ZERO ALTER); `_lerComprovanteIA` (Gemini Vision), `_baixarComprovante` (SÓ /uploads internos, anti-SSRF), `lerComprovante`/`relerComprovantesPendentes`/`anexarComprovanteEntry` (write sanitizado via `_sanitizeComprovante`); desempate em `sugerirConciliacao` (txid/CNPJ/beneficiário → `identificadoVia`, exige valor+data). Gateado por `assertAiModuleEnabled(...,"financeiro")`. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3192** — **COLABORADORES · CORREÇÃO: O CARD "CLT" CONTAVA SÓ OS CLT ATIVOS — AGORA CONTA TODOS OS CLT QUE AINDA TÊM VÍNCULO COM A EMPRESA (ATIVO, FÉRIAS, AFASTADO, LICENÇA, AVISO, RECLUSO), EXCLUINDO APENAS OS DESLIGADOS/BLACKLIST.** CAUSA-RAIZ: a contagem CLT/PJ/Sócio no servidor (`getEmployeeStats` em `server/db.ts`) filtrava `status = 'Ativo'`, divergindo do filtro do cliente (`Colaboradores.tsx`, `isInativo`). SOLUÇÃO (BACKEND-ONLY): a query de `tipoContrato` passou a usar `status NOT IN ('Desligado','Lista_Negra') AND COALESCE("listaNegra",0) <> 1`. Validado no Neon (FC 60002): CLT 95→112; PJ/Sócio inalterados. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
