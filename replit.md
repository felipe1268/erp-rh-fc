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

- **Rev. 3380** — **FINANCEIRO / CARTÃO DE CRÉDITO · CORREÇÃO DO AUTO-PREENCHIMENTO DE DIA FECHAMENTO E DIA VENCIMENTO AO CADASTRAR CARTÃO VIA IMPORTAÇÃO DE FATURA: A IA AGORA EXTRAI OS DIAS DIRETAMENTE COMO NÚMERO INTEIRO (1-31) — ROBUSTO PARA FATURAS QUE SÓ EXIBEM O DIA SEM DATA COMPLETA. BACKEND ADITIVO (2 NOVOS CAMPOS NO PROMPT+SCHEMA: `diaFechamento` E `diaVencimento`) + FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** Problema: após Rev. 3379, ao clicar em "Cadastrar cartão" no preview de importação, banco/bandeira/final4/titular/limite preenchiam mas dia fechamento e dia vencimento ficavam vazios. Causa-raiz: o auto-fill dependia de `f.fechamento`/`f.vencimento` serem strings YYYY-MM-DD completas (`.slice(8,10)`), mas muitas faturas (ex.: Santander) não exibem data completa de fechamento/vencimento — a IA retornava `null` e os campos ficavam `""`. BACKEND (`server/routers/cartao.ts`): adicionados `diaFechamento` e `diaVencimento` ao `PROMPT_FATURA` (instrução explícita: "extraia SEMPRE o dia mesmo que seja só o número", ex.: "fecha dia 28", "corte: 28") e ao `SCHEMA_FATURA` (`{type:"number",nullable:true}`). `normalizarFatura()` expõe `diaFechamentoIA`/`diaVencimentoIA` (inteiro, Number.isFinite guard). FRONT (`FinanceiroCartaoCredito.tsx`, `cadastrarCartaoDoImport`): estratégia 2 camadas — prefere `diaFechamentoIA`/`diaVencimentoIA` (inteiro direto da IA); fallback para fatiar a string ISO. VALIDAÇÃO: tsc limpo. Detalhe: `shared/changelog.ts`.

- **Rev. 3379** — **FINANCEIRO / CARTÃO DE CRÉDITO · CADASTRO DE CARTÃO COM LAYOUT MODERNO (FULLSCREEN REDESIGN) + AUTO-PREENCHIMENTO DA FATURA (IA LÊ DIA FECHAMENTO, DIA VENCIMENTO E LIMITE DO PDF E PRÉ-CARREGA O FORMULÁRIO) + PAINEL "MELHOR DATA DE COMPRA" CALCULADO AO VIVO (BASE PARA SUGESTÃO DE CARTÃO NO MÓDULO DE COMPRAS). BACKEND MÍNIMO ADITIVO (1 CAMPO NO PROMPT DA IA: `limiteTotalCartao`) + FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** Pedido: layout moderno, ao importar fatura cadastrar dia vencimento/limite/fechamento automaticamente, criar regra "melhor data de compra". BACKEND (`server/routers/cartao.ts`): `limiteTotalCartao` adicionado ao `PROMPT_FATURA` e `SCHEMA_FATURA` (IA extrai limite total quando aparece na fatura). FRONT (`client/src/pages/financeiro/FinanceiroCartaoCredito.tsx`): (A) REDESIGN MODAL: cartão-preview ao vivo (gradiente por bandeira, banco/final4/titular atualizando ao digitar), chips de banco (Santander/Itaú/Bradesco/Caixa/BB/Nubank/Sicredi/Inter/BTG/Outro) e de bandeira (Visa/Mastercard/Elo/Amex/Hipercard), 3 seções em cards com header-chip+ícone, footer fixo navy; (B) AUTO-FILL: `cadastrarCartaoDoImport` extrai diaFechamento/diaVencimento das datas YYYY-MM-DD da fatura + preenche limite quando IA extrai; (C) `calcMelhorDataCompra`: helper puro (diaCompra=diaFecha+1; prazoMax=30+gap) exibido como painel esmeralda no formulário e badge no card da lista. VALIDAÇÃO: tsc limpo. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3378** — **CONTROLE DE REVISÕES · OS NÚMEROS DOS CARDS DE RESUMO (TOTAL / NOVA FUNCIONALIDADE / CORREÇÃO DE BUG / MELHORIA / SEGURANÇA / PERFORMANCE) AGORA APARECEM COM SEPARADOR DE MILHAR pt-BR (EX.: "1.380" EM VEZ DE "1380"). 100% FRONT (SÓ FORMATAÇÃO DE EXIBIÇÃO) · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE · NENHUMA TELA NOVA.** FIX (`client/src/pages/Revisoes.tsx`): card "Total" usa `APP_VERSION_NUMBER.toLocaleString("pt-BR")`; cards por tipo usam `count.toLocaleString("pt-BR")`; indicador de filtro "(N revisões)" usa `filteredRevisions.length.toLocaleString("pt-BR")`. Detalhe: `shared/changelog.ts`.

- **Rev. 3377** — **FINANCEIRO / CADASTRO · CONTAS BANCÁRIAS · O CARD DE CADA CONTA AGORA MOSTRA, ALÉM DO BADGE "TALÃO", UM BADGE "APLICAÇÃO AUTOMÁTICA" QUANDO A CONTA TEM APLICAÇÃO/RESGATE AUTOMÁTICO (VARREDURA DIÁRIA) ATIVADO. 100% FRONT · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** FIX (`client/src/pages/ContasBancarias.tsx`): novo `<Badge>` "Aplicação automática" (ícone TrendingUp, esmeralda) condicionado a `Number(conta.temAplicacaoAutomatica) === 1`. Detalhe: `shared/changelog.ts`.

- **Rev. 3376** — **FINANCEIRO / MENU · "CONTAS BANCÁRIAS" AGORA MANTÉM A BARRA LATERAL DO MÓDULO DE ORIGEM: AO CLICAR NO ITEM DENTRO DO MÓDULO FINANCEIRO (OU CADASTRO / RH&DP), O MENU CONTINUA NO MESMO MÓDULO EM VEZ DE TROCAR PARA "RH&DP". 100% FRONT (ROTEAMENTO DE MÓDULO) · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE · NENHUMA TELA NOVA.** FIX (`client/src/contexts/ModuleContext.tsx`, `STICKY_AMBIGUOUS`): adicionada `{ prefix: "/contas-bancarias", keepIf: ["financeiro", "cadastro", "rh-dp"] }`. Detalhe: `shared/changelog.ts`.

- **Rev. 3375** — **FINANCEIRO / CARTÃO DE CRÉDITO · IMPORTAÇÃO DE FATURAS AGORA EM LOTE (VÁRIOS PDFs DE UMA VEZ): A IA LÊ TODOS, CONSOLIDA NUM ÚNICO PREVIEW E — (A) CARTÃO RECONHECIDO PELO FINAL → VINCULA A FATURA AUTOMATICAMENTE; (B) NÃO RECONHECIDO → BOTÃO "CADASTRAR CARTÃO" JÁ PRÉ-PREENCHIDO (BANCO/BANDEIRA/FINAL/TITULAR DA IA) QUE, AO SALVAR, RE-CASA A(S) FATURA(S) NA HORA. BACKEND ADITIVO + FRONT · ZERO SCHEMA/ALTER/DROP/DELETE · NADA GRAVA SEM CONFIRMAR.** Detalhe: `shared/changelog.ts`.

- **Rev. 3374** — **FINANCEIRO · MENU · "CONTAS BANCÁRIAS" AGORA TAMBÉM APARECE NA SEÇÃO "CADASTROS" DO MÓDULO FINANCEIRO (ANTES SÓ NO MÓDULO CADASTRO). ATALHO PARA NÃO PRECISAR TROCAR DE MÓDULO — APONTA PARA A MESMA TELA/ROTA `/contas-bancarias`. 1 LINHA DE MENU · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE · NENHUMA TELA NOVA.** FIX (`client/src/components/DashboardLayout.tsx`). Detalhe: `shared/changelog.ts`.

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
