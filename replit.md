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

- **Rev. 3376** — **FINANCEIRO / MENU · "CONTAS BANCÁRIAS" AGORA MANTÉM A BARRA LATERAL DO MÓDULO DE ORIGEM: AO CLICAR NO ITEM DENTRO DO MÓDULO FINANCEIRO (OU CADASTRO / RH&DP), O MENU CONTINUA NO MESMO MÓDULO EM VEZ DE TROCAR PARA "RH&DP". 100% FRONT (ROTEAMENTO DE MÓDULO) · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE · NENHUMA TELA NOVA.** Pedido (prints dos menus Financeiro e RH): "quando clicar na aba contas bancárias deve manter a barra lateral do módulo financeiro se eu estiver no financeiro; hoje tá mudando para o RH ou Cadastro, não pode." RAIZ: a rota `/contas-bancarias` é COMPARTILHADA (item nos menus Financeiro [Rev. 3374], Cadastro e RH&DP) mas está fixada em "rh-dp" no `ROUTE_MODULE_MAP`; o `useEffect` do `ModuleProvider` resolvia o módulo pela rota e FORÇAVA `setActiveModule("rh-dp")` ao navegar. FIX (`client/src/contexts/ModuleContext.tsx`, `STICKY_AMBIGUOUS`): adicionada `{ prefix: "/contas-bancarias", keepIf: ["financeiro", "cadastro", "rh-dp"] }` — o mecanismo sticky (já usado p/ `/terceiros/contratos`) faz o effect dar `return` ANTES do `setActiveModule` quando a rota casa o prefixo E o módulo ativo está em `keepIf`, mantendo o módulo de origem; outro caminho de acesso cai no default "rh-dp". VALIDAÇÃO: tsc limpo. Detalhe: `shared/changelog.ts`.

- **Rev. 3375** — **FINANCEIRO / CARTÃO DE CRÉDITO · IMPORTAÇÃO DE FATURAS AGORA EM LOTE (VÁRIOS PDFs DE UMA VEZ): A IA LÊ TODOS, CONSOLIDA NUM ÚNICO PREVIEW E — (A) CARTÃO RECONHECIDO PELO FINAL → VINCULA A FATURA AUTOMATICAMENTE; (B) NÃO RECONHECIDO → BOTÃO "CADASTRAR CARTÃO" JÁ PRÉ-PREENCHIDO (BANCO/BANDEIRA/FINAL/TITULAR DA IA) QUE, AO SALVAR, RE-CASA A(S) FATURA(S) NA HORA. BACKEND ADITIVO + FRONT · ZERO SCHEMA/ALTER/DROP/DELETE · NADA GRAVA SEM CONFIRMAR.** Pedido (`/financeiro/cartao` › "Importar fatura"): "subir vários PDFs de uma vez; se não reconhecer o cartão sugere cadastrar; se reconhecer já vincula a fatura automaticamente." FRONT (`client/src/pages/financeiro/FinanceiroCartaoCredito.tsx`): (1) `<input multiple>` + `onArquivosSelecionados` processa EM SÉRIE (IA = 1 chamada/arquivo), barra "Lendo X/N", acumula faturas (`montarPreview`) e coleta falhas por arquivo (`importFalhas`) sem abortar o lote; (2) cada fatura carrega `origemArquivo` (exibido no card + enviado no confirmar); (3) não identificado → botão "Cadastrar cartão" (`cadastrarCartaoDoImport`) abre o modal pré-preenchido; ao salvar, `salvarCartao` captura o `id` de `criarCartao` e `rematchPreview(final4,id)` marca as faturas do mesmo final4 como identificadas (sem re-rodar IA); `importCadastroRef` guarda o final4 e é limpo ao fechar; (4) identificado → badge "Vínculo automático"; (5) banner vermelho lista arquivos ilegíveis. BACKEND (`server/routers/cartao.ts`, `importarConfirmar`, aditivo): mapa `final4→id` da empresa auto-vincula faturas SEM `cartaoId` que casam um cartão (cobre cartão criado após o preview); input ganhou `origemArquivo` por fatura (INSERT usa `f.origemArquivo || origem`). Tenant guard (`cartaoId ∈ empresa`) + dedup idempotente preservados. VALIDAÇÃO: tsc limpo. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3374** — **FINANCEIRO · MENU · "CONTAS BANCÁRIAS" AGORA TAMBÉM APARECE NA SEÇÃO "CADASTROS" DO MÓDULO FINANCEIRO (ANTES SÓ NO MÓDULO CADASTRO). ATALHO PARA NÃO PRECISAR TROCAR DE MÓDULO — APONTA PARA A MESMA TELA/ROTA `/contas-bancarias`. 1 LINHA DE MENU · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE · NENHUMA TELA NOVA.** Pedido (prints dos menus Cadastro e Financeiro): "no módulo financeiro, coloca o cadastro da conta bancária tbm.. só replica do módulo de cadastro para cá tbm." FIX (`client/src/components/DashboardLayout.tsx`, `menuSectionsFinanceiro` › "Cadastros"): adicionado `{ icon: Landmark, label: "Contas Bancárias", path: "/contas-bancarias" }` entre "Centros de Custo" e "Configurações". Rota já existente (compartilhada com Cadastro); `Landmark` já importado. EFEITO: item aparece nos dois menus; Admin Master sempre vê. VALIDAÇÃO: tsc limpo. Detalhe: `shared/changelog.ts`.

- **Rev. 3373** — **FINANCEIRO / CADASTRO · CONTAS BANCÁRIAS · REDESENHO DA TELA "EDITAR/NOVA CONTA BANCÁRIA" (FORMULÁRIO EM FULLSCREEN): LAYOUT MODERNO, INTERATIVO E DE FÁCIL VISUALIZAÇÃO — CARTÃO-PREVIEW AO VIVO DA CONTA NO TOPO, SELEÇÃO RÁPIDA DE BANCO POR CHIPS CLICÁVEIS, CAMPOS AGRUPADOS EM 3 SEÇÕES (IDENTIFICAÇÃO / RECURSOS / SALDO), OS 2 CHECKBOXES (TALÃO + APLICAÇÃO AUTOMÁTICA) VIRARAM CARDS-TOGGLE QUE ACENDEM AO ATIVAR, E RODAPÉ FIXO DE AÇÕES. 100% FRONT (SÓ APRESENTAÇÃO) · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE · MESMO ESTADO/HANDLERS/MUTATIONS.** Pedido (print do iPad na tela "Editar Conta Bancária"): "quero um layout moderno interativo e fácil visualização.. melhore isso mantendo o nosso padrão." FIX (`client/src/pages/ContasBancarias.tsx`, só o bloco do `<FullScreenDialog>` — `form`/`handleBancoSelect`/`handleSave`/`createMut`/`updateMut`/validações INALTERADOS): (1) CARTÃO-PREVIEW ao vivo (gradiente navy #1B2A4A→#243660→#2d4a7a) com banco/tipo/agência/conta/código atualizando ao digitar; (2) seleção rápida virou GRID de CHIPS clicáveis (chip ativo = borda/anel navy + check, mesmo `handleBancoSelect`); (3) 3 SEÇÕES em cards com header-chip+ícone (Identificação · Recursos · Saldo); os 2 checkboxes viraram CARDS-TOGGLE com borda esmeralda + selo "Ativo" (mesma semântica/textos); (4) ações Cancelar/Salvar movidas pro `footer` fixo do `FullScreenDialog` (sticky, safe-area iOS), Salvar mantém `bg-[#1B2A4A] hover:bg-[#243660]`; (5) `max-w-3xl mx-auto` + grids `sm:grid-cols-2`; ícones novos Hash/Sparkles/Check/Calendar. Padrão navy mantido. VALIDAÇÃO: tsc limpo. Detalhe: `shared/changelog.ts`.

- **Rev. 3372** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · NOVO PAINEL "CONFERIR CHEQUES COM O EXTRATO" (PRÉ-CONFIRMAÇÃO EM LOTE): MOSTRA OS CHEQUES COMPENSADOS QUE CONFEREM COM O EXTRATO MAS AINDA NÃO FORAM CONCILIADOS, SEPARADOS EM MATCH FORTE (Nº+VALOR, PRÉ-SELECIONADO) × FRACO (VALOR+DATA, "CONFIRA ANTES") × DIVERGÊNCIAS (SÓ ALERTA), COM CONFIRMAÇÃO EM LOTE. NADA É MARCADO SOZINHO. BACKEND ADITIVO (READ-ONLY + SUBSET DE IDS) + 1 FRONT · ZERO SCHEMA/ALTER/DROP/DELETE · NADA BAIXA FINANCEIRAMENTE.** Pedido do piloto FC: "se o cheque foi compensado e verificado no extrato, não poderia ter uma tela de resumo pro usuário confirmar?" — escolhida a TELA DE PRÉ-CONFIRMAÇÃO (não baixa automática, pois match fraco engana e a regra é conciliação SÓ SUGESTIVA). BACKEND (`server/routers/cheques.ts`, aditivo): `classificarExtrato` expõe `extratoForte`; `verificarExtratoResumo` (read-only) devolve `aConferirLista` + contadores forte/fraco; `conferirExtrato` ganhou input opcional `ids[]` (marca só o subconjunto, mas RE-VALIDA cada cheque via `extratoConfirmado` — id nunca confiado cru). FRONT: novo `_ConferirChequesExtrato.tsx` (3 blocos, checkbox por linha, AlertDialog de revisão) + botão "Conferir cheques" na toolbar da `FinanceiroConciliacao.tsx` (período = ano/mês do seletor). VALIDAÇÃO: tsc limpo. Detalhe: `shared/changelog.ts`.

- **Rev. 3371** — **FINANCEIRO / DASHBOARD "CONTROLE DE CHEQUES" · OS GRÁFICOS DE PIZZA (DONUT) "CHEQUES POR STATUS" E "DEVOLVIDOS POR MOTIVO" VIRARAM GRÁFICOS DE COLUNAS/BARRAS, PARA FICAR MAIS LEGÍVEL E ORGANIZADO. 100% FRONT (TROCA DE TIPO DE GRÁFICO) · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE · NADA CONCILIA/BAIXA SOZINHO.** Pedido (print do iPad na tela "Dashboard · Controle de Cheques"): "Quero gráficos melhores e mais organizado gosto dos gráficos de colunas". FIX (`client/src/pages/financeiro/dashboards/DashCheques.tsx`): "Cheques por status" virou `<BarChart>` de colunas e "Devolvidos por motivo" virou `<BarChart layout="vertical">` (barras horizontais), mantendo cores por `<Cell>` e drill-in. Detalhe: `shared/changelog.ts`.

- **Rev. 3370** — **FINANCEIRO / DASHBOARD "CONTROLE DE CHEQUES" · NOVA SEÇÃO "CHEQUES DEVOLVIDOS" QUE MOSTRA OS CHEQUES SEM FUNDO, SUSTADOS, JÁ COMPENSADOS DEPOIS E OUTROS MOTIVOS — COM KPIs, GRÁFICO POR MOTIVO (PIZZA) E POR SITUAÇÃO (BARRA) + DRILL-IN POR CHEQUE (Nº, FORNECEDOR/OBRA/NF, MOTIVO, DATAS, SITUAÇÃO). 100% FRONT (NOVA QUERY READ-ONLY A ENDPOINT EXISTENTE) · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE · NADA CONCILIA/BAIXA SOZINHO.** Pedido (print do iPad na tela "Dashboard · Controle de Cheques", ao lado de "Cheques por status"): "Coloque aqui os cheques sem fundo, os compensados ou outros motivos". DESCOBERTA-CHAVE: os MOTIVOS de devolução NÃO existem em `financial_cheques` — são detectados dinamicamente no extrato (`bank_statement_lines`) por `detectarParesEstorno` (`shared/chequeMotivos.ts`, pareia débito-compensação + crédito-devolução e traduz a alínea Bacen). Por isso a fonte é a CONCILIAÇÃO: o dashboard chama `trpc.financial.getConciliacaoReportGeral` (company-wide, já existente) com a janela do ANO inteiro e lê `chequesDevolvidos`. FRONT (`client/src/pages/financeiro/dashboards/DashCheques.tsx`): nova query + helpers + memos + seção com 4 KPIs, pizza/barra e 2º DetailDialog. Conciliação SÓ SUGESTIVA respeitada. Detalhe: `shared/changelog.ts`.

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
