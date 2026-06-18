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

- **Rev. 3255** — **FINANCEIRO / CONTROLE DE CHEQUES · OS DROPDOWNS DE STATUS (FILTRO "STATUS", AÇÃO EM LOTE "ALTERAR STATUS PARA" E EDIÇÃO POR CHEQUE) PASSARAM A ABRIR ANCORADOS LOGO ABAIXO DO CAMPO, ALINHADOS À ESQUERDA — EM VEZ DE FLUTUAR CENTRALIZADOS "NO MEIO DA TELA" (PROBLEMA VISÍVEL NO IPAD/SAFARI). SÓ POSICIONAMENTO DO MENU — MESMAS OPÇÕES E MESMA LÓGICA.** PEDIDO (piloto FC): "Arrume a tela de status, ela está aparecendo no meio da tela e não abaixo do campo status como deveria ser" (prints IMG_2180/2181). CAUSA: o componente compartilhado `client/src/components/ui/select.tsx` usa `position="popper"` porém `align="center"` por padrão, centralizando o menu sobre um gatilho estreito (`w-[150px]`/`w-[170px]`) e dando a impressão de menu "solto no meio" (agravado no Safari/iPad com a página rolada). SOLUÇÃO (FRONT, `client/src/pages/financeiro/FinanceiroCheques.tsx`): os 3 `SelectContent` de status receberam props explícitas `position="popper" side="bottom" align="start" sideOffset={4}` (abre colado à borda inferior-esquerda do gatilho, mantendo flip automático). Nenhuma mudança no componente compartilhado (não afeta selects de todo o app). ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3254** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · OS "LANÇAMENTOS PARCEIRO" (MÓDULO PARCEIROS CONVENIADOS) AGORA SÃO UNIFICADOS NA LISTA DE PENDÊNCIAS — IGUAL À FROTA (COMBUSTÍVEL/MANUTENÇÃO) — SOMANDO TODOS OS LANÇAMENTOS DO MESMO PARCEIRO NO MÊS NUMA ÚNICA LINHA SINTÉTICA COM O TOTAL EM BRL (NO EXTRATO PAGA-SE SÓ O TOTAL MENSAL). CLICAR NO CHEVRON EXPANDE OS LANÇAMENTOS-MEMBRO PARA ANÁLISE; CONCILIAÇÃO É N:1 (GRUPO INTEIRO × 1 LINHA DO EXTRATO). 100% READ-ONLY — ENTRIES SEGUEM INDIVIDUAIS NO BANCO.** PEDIDO (piloto FC): "mesma unificação da Frota para o módulo Parceiro — total por fornecedor, pois no extrato pagamos só o total do mês" (prints IMG_2175/2176/2177). SOLUÇÃO (reaproveita engine da Rev. 3239): BACK (`server/routers/financial.ts`, `_agruparConciliacao` READ-ONLY) — `parceiro_lancamento: "parceiro"` no mapa `GRUP`; parceiro agrupa pela nova coluna `parceiroFornecedor` com chave por MÊS (`parceiro|<forn>|<YYYY-MM>`); `_fornCount`/prefixo cobrem "Parceiro"; as 2 queries da `getConciliacaoReport` (conta + "sem conta") ganharam `LEFT JOIN lancamentos_parceiros lp ... AND lp.id=e.origem_id` + `LEFT JOIN parceiros_conveniados pc ON pc.id=lp."parceiroId"` e a coluna `COALESCE(NULLIF(TRIM(pc.nome_fantasia),''),NULLIF(TRIM(pc.razao_social),'')) AS "parceiroFornecedor"`, tudo company-scoped. FRONT (`FinanceiroConciliacao.tsx`, `renderEntryRow`): `grpLabel`/`grpColor` ganharam o caso "parceiro" (pílula fúcsia); expandir/total/conciliação N:1 já eram genéricos. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3253** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O DIÁLOGO "LANÇAR NO ERP" (ABERTO A PARTIR DE UM ITEM DO EXTRATO) GANHOU O LAYOUT MODERNO PADRÃO FC: CABEÇALHO EM FAIXA AZUL (`#1B2A4A`→`#2c3f63`) COM ÍCONE EM CÍRCULO E PÍLULAS DE CONTEXTO (CONTA, DATA E VALOR EM BRL — VERDE P/ RECEITA, VERMELHO P/ DESPESA), CORPO SECCIONADO ("VALORES & DATA" / "CLASSIFICAÇÃO") E RODAPÉ DESTACADO. SÓ APRESENTAÇÃO — MESMA LÓGICA DE LANÇAMENTO/CONCILIAÇÃO.** PEDIDO (piloto FC): "Melhore o layout para ficar no padrão moderno" (print IMG_2174). SOLUÇÃO (FRONT, `client/src/pages/financeiro/FinanceiroConciliacao.tsx`, bloco "Rev. 3198 — Lançar no ERP"): `DialogContent` → `p-0 gap-0 overflow-hidden max-w-lg` + utilitárias `[&_[data-slot=dialog-close]]`/`[&_[data-slot=dialog-maximize]]` p/ botões brancos sobre a faixa; `DialogHeader` virou faixa azul (gradiente, `text-left`, `space-y-0`, `px-6 py-5`) com ícone `Plus` em círculo `bg-white/15`, `DialogTitle`+`DialogDescription` (importada agora) em branco e 3 pílulas — Conta (`Landmark`+`contaLabel`), Data (`fmtData`) e Valor (`ArrowUpCircle`/`ArrowDownCircle`+`formatBRL` de `Math.abs(Number(valor))`, esmeralda/vermelho por `Number(valor)>=0`); corpo `px-6 py-4` + 2 rótulos de seção uppercase + input de Valor `tabular-nums`; rodapé `border-t bg-gray-50 px-6 py-4`. ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3252** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O PAINEL "CHEQUES DEVOLVIDOS NO BANCO" GANHOU UM BOTÃO "PDF / IMPRIMIR" QUE GERA UM RELATÓRIO INSTITUCIONAL FC (LOGO + FAIXA AZUL) COM CARDS DE RESUMO (QTD/TOTAL BRL, PENDENTES, QUITADOS) E TABELA POR CHEQUE (IDENTIFICAÇÃO, VALOR, MOTIVO/ALÍNEA BACEN, DATAS COMP./DEVOL. E SITUAÇÃO). 100% READ-ONLY — APENAS APRESENTA O QUE A TELA JÁ MOSTRA, PRONTO P/ IMPRIMIR OU SALVAR EM PDF.** PEDIDO (piloto FC): "quero poder gerar relatório em PDF desta lista e imprimir". SOLUÇÃO (FRONT, `client/src/pages/financeiro/FinanceiroConciliacao.tsx`): nova função `gerarRelatorioDevolvidosPDF()` no mesmo molde de `gerarRelatorioPDF`/`exportarListaPDF` — HTML com `esc()` (XSS), cabeçalho `logo-fc-branco-amarelo.png` + faixa azul `#1B2A4A` + meta (conta/período/emitido), 3 cards (`repDevol.length`+`totalDevol` via `reduce`, `nPend` por `resolucao.tipo`, `nQuit`), tabela (Cheque/Identificação, Valor, Motivo Bacen ou "Motivo não informado", Datas Comp./Devol., Situação reapresentado/pix/pendente), `window.open`+`print` (guard de pop-up). Botão "PDF / Imprimir" (`FileDown`) no header do card (`CardHeader` reorganizado em flex). ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3251** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · O DIÁLOGO "CONFIRMAR CONCILIAÇÃO?" GANHOU O LAYOUT MODERNO PADRÃO FC: CABEÇALHO EM FAIXA AZUL (`#1B2A4A`→`#2c3f63`) COM ÍCONE EM CÍRCULO + PÍLULAS DE CONTEXTO (N PARES SELECIONADOS + TOTAL EM BRL), CORPO COM A LISTA DE PARES (EXTRATO → LANÇAMENTO) EM CARDS POLIDOS (HOVER, SETA EM CÍRCULO AZUL, VALORES `tabular-nums`) E RODAPÉ DESTACADO. "CONCILIAÇÃO SÓ SUGESTIVA" PRESERVADA — SÓ APRESENTAÇÃO.** PEDIDO (piloto FC): "melhore o layout para ficar no padrão moderno que estamos fazendo" (print do diálogo ainda no estilo antigo). SOLUÇÃO (FRONT, `client/src/pages/financeiro/FinanceiroConciliacao.tsx`, bloco "Rev. 3201 — Confirmação OBRIGATÓRIA"): `AlertDialogContent` → `p-0 gap-0 overflow-hidden`; `AlertDialogHeader` virou faixa azul (gradiente, `text-left`, `space-y-0`) com ícone `CheckCircle` em círculo `bg-white/15`, título/descrição em branco e 2 pílulas — "N par(es) selecionado(s)" (`Link2`) e "Total <BRL>" (`reduce` de `Math.abs(extratoValor)`); corpo `px-6 py-4` + lista `rounded-lg` com cada par em card (`hover:bg-gray-50/80`, seta `ArrowRight` em círculo `bg-blue-50`, rótulos uppercase, fornecedor em `text-blue-700`); rodapé `border-t bg-gray-50 px-6 py-4`. Mesma lógica/botões/mutation (`conciliarSugMut`/`confirmarConciliacao`). ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3250** — **FINANCEIRO / CONTROLE DE CARTÃO DE CRÉDITO · O DIÁLOGO "CLASSIFICAR ITENS DA FATURA" GANHOU LAYOUT MODERNO E MUITO MAIS USÁVEL: CABEÇALHO EM FAIXA AZUL COM ÍCONE + PÍLULAS (CARTÃO/FINAL, VENCIMENTO, TOTAL BRL); BARRA DE PROGRESSO (X/Y ITENS COM OBRA + %) + CHIPS DE VALOR CONFIRMADO E VALOR SEM OBRA; BUSCA POR DESCRIÇÃO/CIDADE E FILTRO POR STATUS; NOVO BOTÃO "CLASSIFICAR EM MASSA" QUE APLICA OBRA/CENTRO DE CUSTO/CATEGORIA A TODOS OS ITENS FILTRADOS DE UMA VEZ (CAMPOS COM "MANTER ATUAL"); E TABELA POLIDA (HOVER, ITENS SEM OBRA EM ÂMBAR, STATUS COMO PÍLULA COLORIDA). 100% READ-ONLY NO BACKEND.** PEDIDO (piloto FC): "quero um layout moderno e fácil usabilidade" (fatura com dezenas de linhas, todas "sem obra", classificadas uma a uma). SOLUÇÃO (FRONT, `client/src/pages/financeiro/FinanceiroCartaoCredito.tsx`): diálogo redesenhado (`DialogContent p-0 gap-0`, faixa azul `#1B2A4A`→`#2c3f63` + pílulas, rodapé destacado); novos `itemBusca`/`itemStatus`/`itensFiltrados` (useMemo: busca desc.+cidade, filtro por status ou "sem obra") e `resumoItens` (useMemo: classificados/total, %, valor confirmado/sem obra); `aplicarBulk()` percorre `itensFiltrados` chamando a mutation existente `cartao.classificarItem` por item, patch montado dos selects de massa ("Manter atual"=`keep` / "—"=`none` / id) + refetch único + toast, dentro de um AlertDialog com 3 selects (Obra/CC/Categoria) e botão "Aplicar a N"; tabela itera `itensFiltrados` (empty-state de filtro), hover, realce âmbar p/ sem-obra, gatilho de status colorido, `tabular-nums`; filtros resetados ao fechar (`resetFaturaFiltros`). ZERO BACKEND NOVO · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3249** — **FINANCEIRO / CONTROLE DE CARTÃO DE CRÉDITO · O DIÁLOGO "NOVO CARTÃO / EDITAR CARTÃO" GANHOU UM LAYOUT MODERNO (CABEÇALHO AZUL COM ÍCONE, SEÇÕES "IDENTIFICAÇÃO" E "DATAS & LIMITE", RODAPÉ DESTACADO) E O CAMPO "LIMITE" PASSOU A USAR MÁSCARA DE MOEDA BRL AUTOMÁTICA — DIGITANDO OS NÚMEROS, O VALOR JÁ APARECE "R$ 10.000,00" (PONTO P/ MILHAR, VÍRGULA P/ CENTAVOS), FACILITANDO O LANÇAMENTO.** PEDIDO (piloto FC): "quero um layout moderno e todos os valores separados por ponto e vírgula para facilitar o lançamento". SOLUÇÃO (FRONT, `client/src/pages/financeiro/FinanceiroCartaoCredito.tsx`): novos helpers locais `maskBRL`/`parseMaskBRL` (motor "digita centavos → 1.234,56" já usado em Contas a Receber) — `onChange` do Limite passa por `maskBRL`, `salvarCartao` converte com `cartaoForm.limite.trim()===""? null : parseMaskBRL(...)` (preserva 0,00), `abrirEditarCartao` formata o valor do banco via `maskBRL(String(Math.round(Number(c.limite)*100)))`; diálogo redesenhado (`DialogContent` sem padding, faixa azul `#1B2A4A` + ícone, corpo seccionado com rótulos uppercase, input do Limite com prefixo "R$" embutido + `tabular-nums`/`inputMode`, rodapé destacado). ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
