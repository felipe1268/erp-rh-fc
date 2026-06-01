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


- **Rev. 2659** — **INVENTÁRIO SEMANAL (`/almoxarifado/inventario`) · A TELA GANHA UM CAMPO DE BUSCA (POR NOME OU CÓDIGO INTERNO DO ITEM) IGUAL AO DO ALMOXARIFADO.** Pedido (usuário, prints image_1780281012042 + image_1780281026822): incluir um campo de busca como o do Almoxarifado para localizar itens (a sessão pode ter centenas de itens "Aguardando conferência"). Fix (SÓ CLIENT/UI; ZERO SCHEMA; ZERO SERVER; R-001/R-007/R-010): CLIENT `client/src/pages/almoxarifado/Inventario.tsx` — ícone `Search` + `useMemo`, state `busca`, `<input>` de busca (lupa + botão limpar) acima das listas (visível só com `total > 0`, estilo emerald), helper `norm`+`matchBusca` filtra por `itemNome` OU `itemCodigoInterno` (já retornados por `warehouse.getInventorySessionItems`); `pendentes`/`finalizados` viram `useMemo` filtrados — mas os TOTAIS e a barra de PROGRESSO seguem contando a sessão INTEIRA; empty-state "Nenhum item encontrado". Validado (estático): esbuild EXIT 0 (`pnpm build`/`tsc` estouram OOM no container). Detalhe: `shared/changelog.ts`.
- **Rev. 2658** — **CATEGORIAS (`/financeiro/categorias`) · CADA LINHA GANHA O BOTÃO EXCLUIR (🗑) — ALÉM DO EDITAR (✏️) E INATIVAR/REATIVAR (⏻) QUE JÁ EXISTIAM.** Pedido (usuário, print image_1780279537171): acrescentar um botão EXCLUIR por categoria na tela de Categorias Financeiras. Fix (SÓ CLIENT/UI — reusa rota existente; ZERO SCHEMA; R-001/R-007/R-010): SERVER — nenhuma alteração: a rota `financial.deleteAccount` JÁ EXISTIA e faz SOFT-DELETE (`UPDATE financial_accounts SET ativo=0`, NÃO DELETE físico) com GUARDA DE INTEGRIDADE (conta `financial_entries` por `conta_id` + contas-filhas por `conta_pai_id`; se houver, lança BAD_REQUEST e não exclui) + audit log. CLIENT `client/src/pages/financeiro/FinanceiroCategorias.tsx` — ícone `Trash2`, state `confirmDelete`, mutation `deleteMut` (= `deleteAccount`, toast + `refetch`), botão EXCLUIR (Trash2 vermelho) na barra de ações ao lado de Editar/Inativar, e AlertDialog "Excluir categoria?" que explica o bloqueio quando há vínculos. Erro do servidor (categoria em uso) chega via toast destructive — sem exclusão silenciosa. Validado (estático): esbuild EXIT 0 (`pnpm build`/`tsc` estouram OOM no container). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2657** — CONTAS A PAGAR (`/financeiro/contas-a-pagar`) · CADA LINHA GANHA EDITAR (✏️) E ANEXAR (📎) ALÉM DE VISUALIZAR/EXCLUIR; O FORNECEDOR/CLIENTE PASSA A APARECER NA LISTA E NO DETALHE; O DOCUMENTO ANEXADO (BOLETO/NF/FOTO) GANHA LINK NO DETALHE. Fix (CLIENT/UI + SERVER aditivo; só ADD COLUMN IF NOT EXISTS): SCHEMA `drizzle/schema.ts` (`financialEntries` +`anexo_url`/`anexo_nome`) + self-heal `[SyncSchema+]`; SERVER `server/routers/financial.ts` (`getContasAPagarByYear`/`getEntryDetalhe` SELECT anexo; `updateEntry`; NOVO `anexarDocumento`); CLIENT `FinanceiroContasAPagar.tsx`. Detalhe: `shared/changelog.ts`.

- **Rev. 2656** — LANÇAMENTOS (`/financeiro/lancamentos`) · LANÇAMENTOS REALIZADOS QUE APARECEM NO CONTAS A PAGAR VOLTAM À TELA DE LANÇAMENTOS; FILTRO DE PERÍODO VIRA CALENDÁRIO ABERTO (RANGE 2 MESES); CADA LINHA GANHA VISUALIZAR + EDITAR + EXCLUIR; EDIÇÃO/EXCLUSÃO REFLETE NO CONTAS A PAGAR/RECEBER E VICE-VERSA. Causa-raiz: `getEntries` filtrava só por `data_competencia`. Fix (SÓ CLIENT/UI + leitura no SERVER; ZERO SCHEMA): SERVER `server/routers/financial.ts` (`getEntries` — filtro de SOBREPOSIÇÃO competência/vencimento/criação); CLIENT `FinanceiroLancamentos.tsx` (Calendar range + botões por linha + `invalidarContas`). Detalhe: `shared/changelog.ts`.

- **Rev. 2655** — CONTAS A PAGAR & CONTAS A RECEBER · A BAIXA/QUITAÇÃO GANHA CAMPOS FINANCEIROS DETALHADOS (VALOR + JUROS − DESCONTOS + OUTROS ± → TOTAL), OBSERVAÇÕES, ANEXO DE COMPROVANTE (PDF/WORD/FOTO) E, NO CONTAS A PAGAR, SUBFORMULÁRIO DE CHEQUE (PRÓPRIO/TERCEIROS) AUTOMÁTICO QUANDO FORMA = CHEQUE. Fix: SCHEMA additivo (`drizzle/schema.ts` — `financial_entries`/`financial_revenue` ganham `juros`/`descontos`/`outros`+`cheque_tipo`); SERVER `server/routers/financial.ts` (`updateEntryStatus`/`registrarRecebimento` + NOVO `uploadComprovante`); CLIENT `FinanceiroContasAPagar.tsx`/`FinanceiroContasAReceber.tsx`. Detalhe: `shared/changelog.ts`.

- **Rev. 2654** — CONTAS A PAGAR · O MODAL "REGISTRAR PAGAMENTO" FICA MAIOR E DEIXA DE EXIGIR BARRA DE ROLAGEM — LARGURA `max-w-sm`→`max-w-lg` E "DATA DO PAGAMENTO"+"FORMA DE PAGAMENTO" LADO A LADO (GRID 2 COL). Pedido (usuário, print image_1780276364266). Fix (SÓ CLIENT/UI): `client/src/pages/financeiro/FinanceiroContasAPagar.tsx` — modal `showPay`. Detalhe: `shared/changelog.ts`.

- **Rev. 2653** — FÉRIAS / LISTA DE FÉRIAS · A ORDENAÇÃO POR "INÍCIO DO GOZO" GANHA RÓTULOS MAIS CLAROS — "INICIA PRIMEIRO" / "INICIA POR ÚLTIMO" — ESPELHANDO O PADRÃO DE "VENCIMENTO". Pedido (usuário, print IMG_1472). Fix (SÓ CLIENT/UI — RÓTULO): `client/src/pages/Ferias.tsx` — itens `inicio_asc`/`inicio_desc` passam para "Início Gozo — inicia primeiro/inicia por último". Detalhe: `shared/changelog.ts`.



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
