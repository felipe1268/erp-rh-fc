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

- **Rev. 3280** — **RH & DP / DISSÍDIO · O "RELATÓRIO DE DIFERENÇAS SALARIAIS RETROATIVAS (DISSÍDIO)" SAIU DE CONFIGURAÇÕES › SINDICAL/DISSÍDIO E PASSOU PARA O MÓDULO RH › FOLHA DE PAGAMENTO. NO CABEÇALHO DA FOLHA SURGIU O BOTÃO "DIFERENÇAS DISSÍDIO" (ÍCONE FILEBARCHART, AO LADO DE "APROVAÇÕES RH") QUE ABRE UM DIÁLOGO COM O RELATÓRIO ESCOPADO PELO ANO SELECIONADO NO CALENDÁRIO — ASSIM, NA COMPETÊNCIA DA DATA-BASE (MAIO), O RH VISUALIZA AS DIFERENÇAS A PAGAR. EM CONFIGURAÇÕES PERMANECE O CAMPO "DATA DE VIGÊNCIA" (A PARTIR DE QUANDO O REAJUSTE SE APLICA) NO CADASTRO "NOVO ANO". 100% FRONT · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** PEDIDO (piloto FC): tirar o relatório de diferenças de Configurações e colocá-lo na Folha de Pagamento (visível no mês de maio/data-base); e garantir em Configurações um campo para digitar a data a partir de quando o reajuste se aplica. SOLUÇÃO: a procedure `sindical.relatorioDiferencas` (read-only, guard `assertCompanyAccess`) foi REAPROVEITADA sem mudança de backend. Em `client/src/pages/Configuracoes.tsx` (`SindicalDissidioTab`) removidos o botão "Relatório Diferenças", o estado `showRelatorio`, a query `relatorioQuery` e todo o bloco da tabela. Em `client/src/pages/FolhaPagamento.tsx` (tela principal): novo estado `showDissidioRel`, query `dissidioRelQuery` (`relatorioDiferencas` com `anoReferencia: anoSelecionado`, `enabled` por `showDissidioRel` + acesso a empresa), botão "Diferenças Dissídio" no cabeçalho e um `Dialog` com 4 cards de totais (Total Geral / Na Folha / Resc. Complementar / Funcionários — BRL via `formatBRL`) + tabela por funcionário (Ano, Tipo Folha/Resc. Compl., mês de pagamento, %, base de verbas, diferença). O campo `<Input type="date">` "Data de Vigência" já existia no formulário "Novo Ano" (estado `novaVigencia` → `sindical.cadastrar` como `dataVigencia`), mantido. ZERO BACKEND NOVO · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3279** — **RH & DP / FOLHA DE PAGAMENTO (CÁLCULO INTERNO) · CORRIGIDA CONDIÇÃO DE CORRIDA QUE FAZIA O RESUMO DO VALE ("FUNCIONÁRIOS / TOTAL VALE" + "VER RESULTADO") E O RESUMO DO PAGAMENTO ("BRUTO / DESCONTOS / LÍQUIDO" + "VER RESULTADO") SUMIREM PARA ALGUNS USUÁRIOS DE FORMA "ALEATÓRIA" — O QUE A USUÁRIA ACHAVA SER PERMISSÃO, MAS NÃO ERA. OS RESUMOS NÃO TÊM TRAVA POR PAPEL; O QUE FALHAVA ERA A HIDRATAÇÃO DO ESTADO NO CLIENT. 100% FRONT · ZERO SCHEMA/ALTER/DROP/DELETE.** SINTOMA (piloto FC): Isabela (role `user`, "RH e DP") via "Concluído 27/05" no Calcular Vale e no Simular Pagamento mas NÃO via o mini-resumo nem "Ver Resultado"; Ana (admin_master) via tudo. DIAGNÓSTICO: (1) o render dos resumos (`{valeOk && valeResult && ...}` / `{valeResult && ...}` em `FolhaPagamento.tsx`) NÃO tem trava `isMaster`/papel; (2) `payrollEngine.getPeriod` faz `SELECT *` e devolve `valeResultJson`/`pagamentoResultJson` p/ qualquer user; (3) Isabela e Ana têm acesso IDÊNTICO (60002/60004/90001) e só há UMA competência/mês (60002) com o JSON → não era dado/empresa/papel/bundle; (4) a causa eram DOIS `useEffect` concorrentes — um hidratava de `payrollPeriod.data` (com guard `!valeResult`), outro (dep `[mesAno]`) zerava `vale/pagamento/afericaoResult` + `lastLoadedPeriodId`. Com o `getPeriod` do mês-alvo JÁ em cache do React Query (troca instantânea), os dois mudavam na MESMA renderização: o de hidratar rodava 1º, via o resultado do mês ANTERIOR (truthy), PULAVA pelo `!valeResult` (mas carimbava `lastLoadedPeriodId=novoId`); depois o de `[mesAno]` zerava tudo. Como `payrollPeriod.data` não mudava mais, nunca re-hidratava → resumos NULL "p/ sempre", NÃO-DETERMINÍSTICO por sessão (parecia permissão). SOLUÇÃO (`client/src/pages/FolhaPagamento.tsx`): os dois effects viraram UM, determinístico, chaveado pela IDENTIDADE do período (`pid = pd?.id ?? "none"`); só re-hidrata/limpa quando `pid` muda (mesma identidade → early-return preserva edições locais do refetch pós-mutação); com período, hidrata SEMPRE do snapshot (sem `!valeResult`) e limpa quando a coluna vier vazia; `pid === "none"` limpa os três. `lastLoadedPeriodId: number | "none" | null`. O reset ao fechar "Relatório de Aferição" segue compatível (força re-hidratação completa). ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3278** — **RH & DP / SINDICAL · O DISSÍDIO GANHOU UMA "DATA DE VIGÊNCIA". QUANDO O ACORDO É FECHADO COM ATRASO (EX.: VIGÊNCIA 01/05, APLICADO EM JUNHO), O MÊS JÁ PAGO NO VALOR ANTIGO NÃO É REABERTO — O ERP CALCULA A DIFERENÇA SALARIAL RETROATIVA (TODAS AS VERBAS DO PERÍODO × % DO REAJUSTE) E A LANÇA COMO PROVENTO "DIFERENÇA SALARIAL (REF. MM/AAAA)" NA FOLHA DO MÊS DE APLICAÇÃO. PJ NUNCA RECEBE. DESLIGADOS NO INTERVALO RETROATIVO GERAM RESCISÃO COMPLEMENTAR. NOVO RELATÓRIO DEDICADO LISTA SÓ AS DIFERENÇAS. SCHEMA 100% ADITIVO (ADD COLUMN IF NOT EXISTS) — ZERO ALTER/DROP/DELETE.** SCHEMA: `dissidios.dataVigencia` + `dissidio_funcionarios` (4 cols) + `termination_notices` (5 cols), tudo ADD COLUMN IF NOT EXISTS (`drizzle/schema.ts` + self-heal `[SyncSchema+]`). `sindical.cadastrar` aceita `dataVigencia`; `sindical.aplicar` soma verbas retroativas × % (CLT) e gera rescisão complementar p/ desligados (PJ ignorado); `payrollEngine.simularPagamento` injeta a diferença na folha; `sindical.relatorioDiferencas` (read-only) + UI. Detalhe: `shared/changelog.ts`.

- **Rev. 3277** — **RH & DP / RESCISÃO · O CÁLCULO DE FÉRIAS VENCIDAS NA RESCISÃO PASSOU A CONSIDERAR O SALDO POR DIA (GOZO PARCIAL), NÃO MAIS PERÍODOS INTEIROS — UM PERÍODO COMPLETO COM GOZO PARCIAL (EX.: 5 DE 30 DIAS, status='concluida') TINHA OS 25 DIAS RESTANTES IGNORADOS (RESCISÃO PAGAVA R$ 0); AGORA PAGA OS REMANESCENTES (base/30 × diasRestantes + 1/3). ZERO SCHEMA/ALTER/DROP/DELETE.** `server/utils/rescisaoCalc.ts` ganhou `diasVencidosOverride?`; `server/routers/avisoPrevioFerias.ts` tem fonte única `saldoDiasVencidoPeriodo`/`getFeriasVencidasSaldo` e as 8 chamadas propagam o override (fallback `periodos×30` se a query falhar). Detalhe: `shared/changelog.ts`.

- **Rev. 3276** — **COMPRAS / SOLICITAÇÃO DE COMPRA (SC) · A TELA "SOLICITAÇÕES (SC)" GANHOU UM FILTRO POR PERÍODO (DE/ATÉ) AO LADO DO SELETOR "TODAS AS OBRAS", FILTRANDO PELA "DATA POSTADA" (criadoEm) — A MESMA DATA DA ORDENAÇÃO PADRÃO E EXIBIDA NA LISTA. ESCOLHIDO O PERÍODO, A TABELA, OS PILLS DE TIPO, OS MINI-BLOCOS DO CARD "STATUS DAS SOLICITAÇÕES" E OS KPIs PASSAM A REFLETIR SÓ AS SCs DAQUELE INTERVALO; UM BOTÃO "X" LIMPA O PERÍODO. 100% FRONT · READ-ONLY · ZERO SCHEMA/ALTER/DROP/DELETE.** Estados `filtroDataDe`/`filtroDataAte` ("YYYY-MM-DD"); predicado `dentroDoPeriodo(r)` compara `r.criadoEm` contra `[de T00:00:00 .. até T23:59:59]` (inclusivo); aplicado em `listaFiltradaObraBase` E `listaKpisBase` (`client/src/pages/compras/Solicitacoes.tsx`); UI: dois `<Input type="date">` + botão `X`. ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3275** — **RH & DP / FÉRIAS · AGORA É POSSÍVEL CANCELAR O AGENDAMENTO DE UMA FÉRIAS. NA LINHA DE UMA FÉRIAS COM STATUS "AGENDADA" SURGIU O BOTÃO "CANCELAR" (ÍCONE BAN, VERMELHO) QUE, APÓS CONFIRMAÇÃO EM DIÁLOGO (MOTIVO OPCIONAL), DEVOLVE O PERÍODO PARA "A VENCER" (status='pendente') LIMPANDO AS DATAS DO GOZO (INÍCIO/FIM/PAGAMENTO/AGENDAMENTO). ANTES SÓ DAVA P/ EDITAR A DATA OU INICIAR O GOZO — NÃO HAVIA COMO DESFAZER O AGENDAMENTO. ZERO SCHEMA/ALTER/DROP/DELETE.** PEDIDO (piloto FC): "preciso ter a possibilidade de cancelar o agendamento de férias". CAUSA: o ciclo de status de `vacation_periods` só tinha reversão a partir de `em_gozo` (`reverterEmGozo`) e `concluida` (`reverterParaEmGozo`); para uma férias apenas AGENDADA não havia caminho de volta (só Editar/Iniciar Gozo). BACK (`server/routers/avisoPrevioFerias.ts`): nova procedure `cancelarAgendamento` (`{id, motivo?}`) — GUARD DE TENANT anti-IDOR (`periodo.companyId ∈ getCompaniesForUser`, senão FORBIDDEN) + valida `status==='agendada'` (senão BAD_REQUEST), faz UPDATE `status='pendente'` ZERANDO `dataInicio`/`dataFim`/`dataPagamento`/`dataAgendamento`, preserva valores calculados, carimba `[AGENDAMENTO CANCELADO]` em `observacoes` + `createAuditLog` (`CANCELAR_AGENDAMENTO_FERIAS`) + `corrigirPontoFuncionario` (fire-and-forget). NÃO mexe no status do employee (agendada nunca leva a `Ferias`). `vencida` segue derivada na leitura. FRONT (`client/src/pages/Ferias.tsx`): hook `cancelarAgendamento` (invalida list/vencidas/employees) + estados do diálogo; botão "Cancelar" (`Ban`) quando `status==='agendada' && !perdeuFerias` abre diálogo de confirmação (colaborador+período+gozo, Motivo opcional). ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3274** — **COMPRAS / ORDEM DE COMPRA · O MESMO INSUMO DIVIDIDO POR ETAPA DA EAP (EX.: CIMENTO EM FUNDAÇÃO/LAJE) AGORA APARECE NUMA ÚNICA LINHA — TELA E PDF —, COM QTD/ENTREGUE/TOTAL SOMADOS; NA TELA A LINHA É EXPANSÍVEL E MOSTRA O RATEIO POR ETAPA. SÓ APRESENTAÇÃO; ZERO SCHEMA/ALTER/DROP/DELETE; SEM CONVERSÃO DE UNIDADE.** Helper `shared/ocItensConsolidados.ts` (`consolidarOcItens`) agrupa por descrição+unidade, soma qtd/entregue/total, deriva preço ponderado e preserva linhas em `etapas[]`; `client/src/pages/compras/Ordens.tsx` (`OcItensConsolidados`, expansão própria) + `server/services/purchaseOrderPdf.ts` (1 linha/insumo; totais via `oc.subtotal`/`oc.total`). Detalhe: `shared/changelog.ts`.

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
