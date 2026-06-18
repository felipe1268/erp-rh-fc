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

- **Rev. 3261** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · OS PAGAMENTOS DE PRESTADORES PJ (MÓDULO TERCEIROS, ORIGEM `pagamento_pj` — EX.: "ADIANTAMENTO 40%" / "FECHAMENTO 60%") DEIXARAM DE APARECER SOLTOS E SEM NOME NA LISTA DE PENDÊNCIAS E AGORA SÃO UNIFICADOS POR PRESTADOR + MÊS NUMA ÚNICA LINHA SINTÉTICA "PAGAMENTO PJ · NOME DO PRESTADOR" COM O TOTAL EM BRL — IGUAL À FROTA E AO PARCEIRO (REV. 3254). O CHEVRON EXPANDE OS PAGAMENTOS-MEMBRO (ADIANTAMENTO/FECHAMENTO); CONCILIAÇÃO É N:1 (GRUPO × 1 LINHA DO EXTRATO). NÃO ASSUME PIX — A FORMA DE PAGAMENTO É A DEFINIDA PELO USUÁRIO. 100% READ-ONLY — ENTRIES SEGUEM INDIVIDUAIS NO BANCO.** PEDIDO (piloto FC): "estes pagamentos vêm dos colaboradores PJ; faça a mesma lógica e venha SEPARADO POR NOME DE CADA TERCEIRO; normalmente é pix mas a forma é definida pelo usuário" (prints IMG_2192/2193/2194). CAUSA: o agrupador read-only `_agruparConciliacao` (mapa `GRUP`) só conhecia VR/Frota/Parceiro; `pagamento_pj` não estava no mapa → cada pagamento caía no `passthrough` como linha solta, e o `financial_entry` PJ só guarda descrição genérica sem o contratado (memória interna dizia que já agrupava — estava desatualizada; ground-truth = `GRUP` sem `pagamento_pj`). SOLUÇÃO (reaproveita engine Rev. 3239/3254): BACK (`server/routers/financial.ts`) — `pagamento_pj: "pj"` no `GRUP`; tipo "pj" agrupa COMO parceiro (por PRESTADOR + MÊS, chave `pj|<prestador>|<YYYY-MM>`, rótulo "Pagamento PJ") via nova coluna `pjFornecedor`; as 2 queries da `getConciliacaoReport` (conta + "sem conta") ganharam 3 `LEFT JOIN` read-only amarrados por `origem_id`+`companyId` (`pj_payments pjp`, `employees pjemp`, `pj_contracts pjc`) e `COALESCE(NULLIF(TRIM(pjemp."nomeCompleto"),''), NULLIF(TRIM(pjc."razaoSocialPrestador"),'')) AS "pjFornecedor"`. FRONT (`FinanceiroConciliacao.tsx`, `renderEntryRow`): `grpLabel`/`grpColor` ganharam o caso "pj" (pílula índigo); expandir/total/conciliação N:1 já eram genéricos. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3260** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · OS 3 RELATÓRIOS EM PDF/IMPRESSÃO DESTE MÓDULO (RELATÓRIO DE CONCILIAÇÃO BANCÁRIA, LISTAS POR STATUS E "CHEQUES DEVOLVIDOS NO BANCO") DEIXARAM DE APARECER COM O LOGO "CORTADO" NO CABEÇALHO. ANTES USAVAM O LOGO BRANCO+AMARELO (FEITO P/ FUNDO ESCURO); COMO A PÁGINA DO PDF É BRANCA, A PARTE BRANCA DO LOGO SUMIA E SOBRAVA SÓ O ARCO AMARELO, DANDO IMPRESSÃO DE CORTE. AGORA USAM O LOGO INSTITUCIONAL COLORIDO (`logo-fc.jpg`), PADRÃO FC P/ DOCUMENTOS DE FUNDO BRANCO. SÓ APRESENTAÇÃO.** PEDIDO (piloto FC): "Ajuste a página não pode cortar o logo, precisa manter nosso padrão sempre" (print IMG_2187). CAUSA: as 3 funções de relatório de `client/src/pages/financeiro/FinanceiroConciliacao.tsx` usavam `logo-fc-branco-amarelo.png` (variante p/ fundo ESCURO); sobre o corpo BRANCO do PDF os traços brancos sumiam e só o arco amarelo aparecia → "logo cortado". A REGRA DE OURO FC define o cabeçalho de fundo branco com o logo colorido `logo-fc.jpg`. SOLUÇÃO (FRONT, só troca de `src`): os 3 `<img class="logo">` passaram a `${window.location.origin}/logo-fc.jpg?v=3260`, mantendo a classe `.logo` (height 54px, centralizado) e o resto do cabeçalho (h1.brand + faixa azul `#1B2A4A`) intactos. Ambos os assets já existem em `client/public/`. Aplicado nos 3 relatórios p/ manter o padrão consistente. ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3259** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · NO PAINEL "CHEQUES DEVOLVIDOS NO BANCO", A LEGENDA DO MOTIVO DA DEVOLUÇÃO PASSOU A MOSTRAR A DESCRIÇÃO REAL (BACEN/COMPE) AO LADO DO CÓDIGO — INCLUSIVE O MOTIVO 39, QUE ANTES CAÍA NO GENÉRICO "DEVOLUÇÃO DE CHEQUE (MOTIVO 39)". TAMBÉM ENTRARAM OS MOTIVOS 26 E 27, COMPLETANDO A TABELA OFICIAL. SÓ CONSULTA.** PEDIDO (piloto FC): "Coloca a legenda de cada motivo, ex.: qual é o motivo 39?" (IMG_2186). SOLUÇÃO (SÓ DADOS, `shared/chequeMotivos.ts`): `MOTIVOS_DEVOLUCAO_CHEQUE` ganhou `39`="Imagem do cheque fora dos padrões técnicos da COMPE (truncagem)", `26`="Inoperância temporária de transporte" e `27`="Feriado municipal não previsto", confirmados contra COMPE/FEBRABAN e BACEN (Circ. 3.535 / Res. 1.682); `33`=endosso mantido. Vale p/ tela E relatório PDF (mesmo `motivoTexto`). ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3258** — **FINANCEIRO / CRONOGRAMA FINANCEIRO · OS VALORES DA TELA "CRONOGRAMA FINANCEIRO" (PREVISÃO DE FATURAMENTO × CUSTO × RESULTADO POR OBRA) PASSARAM A SER 100% FIÉIS AO ORÇAMENTO + CRONOGRAMA, SEM UM CENTAVO DE DIFERENÇA: RECEITA = VENDA DO ORÇAMENTO, CUSTO = CUSTO DO ORÇAMENTO, AMBOS DISTRIBUÍDOS PELO CRONOGRAMA FÍSICO-FINANCEIRO COM TOTAL POR OBRA CRAVADO NO ORÇAMENTO. 100% READ-ONLY.** PEDIDO (piloto FC): "preciso 100% fiel ao orçamento e planejamento, nenhum centavo de diferença" (IMG_2184/2185). SOLUÇÃO (BACK READ-ONLY, `server/routers/financial.ts`, `getCronogramaFinanceiro` reescrito): VENDA=`COALESCE(NULLIF(valor_contrato,0),orc.valor_negociado,orc."totalVenda",…)`, CUSTO=`COALESCE(orc."totalCusto",…)`; distribui por atividade-folha `frac=peso/Σpeso` (NORMALIZA a 100%), resto no ÚLTIMO mês → total = orçamento EXATO (diff R$ 0,00 no Neon); REALIZADO honesto (medições + despesas pagas excl. `cronograma_atividade`); saída `{meses,obras,totais}` → FRONT inalterado. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3257** — **FINANCEIRO / DASHBOARDS · O DIÁLOGO DE DRILL-DOWN (CLIQUE NUM GRÁFICO/BARRA DOS 5 PAINÉIS) PASSOU A ABRIR QUASE EM TELA CHEIA COM O LAYOUT MODERNO PADRÃO FC: FAIXA AZUL COM ÍCONE + PÍLULAS (Nº DE ITENS + TOTAL BRL), BARRA DE BUSCA QUE FILTRA, TABELA POLIDA (HEADER STICKY, ZEBRA, HOVER) E RODAPÉ COM "ABRIR TELA OPERACIONAL". SÓ APRESENTAÇÃO.** PEDIDO (piloto FC): "Quero esta tela em full screen, layout moderno e detalhado" (print IMG_2183). SOLUÇÃO (FRONT, `client/src/pages/financeiro/dashboards/_kit.tsx`, `DetailDialog`): `DialogContent` `resizable={false}` + `w-[96vw] sm:max-w-[1400px] h-[90dvh]`; header faixa azul (prop opcional `icon`, default `ListFilter`) + 2 pílulas; nova busca (`searchable`, default true) com `useMemo` `filtered`; corpo `flex-1 min-h-0`, tabela sticky/zebra/hover + rodapé TOTAL BRL. Vale p/ os 5 dashboards (props opcionais). ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3256** — **FINANCEIRO / DASHBOARDS · NA TABELA COMPARATIVA (MÊS A MÊS / ANO A ANO) DOS 5 PAINÉIS, AS COLUNAS DE ANO PASSARAM A SEGUIR ORDEM CRONOLÓGICA — O ANO MAIS ANTIGO À ESQUERDA E O MAIS RECENTE À DIREITA (EX.: 2025 ANTES DE 2026), EM VEZ DO ATUAL PRIMEIRO. SÓ ORDEM DAS COLUNAS — VALORES, VARIAÇÕES Δ A/A E Δ M/M E CLIQUES POR MÊS IDÊNTICOS.** PEDIDO (piloto FC): "Altere a ordem — o ano mais velho fica à esquerda e aí sucessivamente" (print IMG_2182). SOLUÇÃO (FRONT, `client/src/pages/financeiro/dashboards/_kit.tsx`, `ComparativoAnual`): no cabeçalho, nas linhas de cada mês e na linha de TOTAL, as duas células de ano foram trocadas — `{anoPrev}`/`totPrev`/`prev` vêm ANTES de `{anoAtual}`/`totAtual`/`cur` (cor de destaque acompanhou: recente `text-slate-900`, anterior `text-slate-500`). Lógica dos `DeltaBadge` e `onOpenMes` inalterada; vale p/ os 5 dashboards (kit compartilhado). ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3255** — **FINANCEIRO / CONTROLE DE CHEQUES · OS DROPDOWNS DE STATUS (FILTRO "STATUS", AÇÃO EM LOTE "ALTERAR STATUS PARA" E EDIÇÃO POR CHEQUE) PASSARAM A ABRIR ANCORADOS LOGO ABAIXO DO CAMPO, ALINHADOS À ESQUERDA — EM VEZ DE FLUTUAR CENTRALIZADOS "NO MEIO DA TELA" (PROBLEMA VISÍVEL NO IPAD/SAFARI). SÓ POSICIONAMENTO DO MENU — MESMAS OPÇÕES E MESMA LÓGICA.** PEDIDO (piloto FC): "Arrume a tela de status, ela está aparecendo no meio da tela e não abaixo do campo status como deveria ser" (prints IMG_2180/2181). CAUSA: o componente compartilhado `client/src/components/ui/select.tsx` usa `position="popper"` porém `align="center"` por padrão, centralizando o menu sobre um gatilho estreito (`w-[150px]`/`w-[170px]`) e dando a impressão de menu "solto no meio" (agravado no Safari/iPad com a página rolada). SOLUÇÃO (FRONT, `client/src/pages/financeiro/FinanceiroCheques.tsx`): os 3 `SelectContent` de status receberam props explícitas `position="popper" side="bottom" align="start" sideOffset={4}` (abre colado à borda inferior-esquerda do gatilho, mantendo flip automático). Nenhuma mudança no componente compartilhado (não afeta selects de todo o app). ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
