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


- **Rev. 2664** — **CONTRATO DE EXPERIÊNCIA (gerado em `/colaboradores`) · O TÉRMINO IMPRESSO NO CONTRATO PARA DE FICAR 1 DIA À FRENTE — PASSA A SEGUIR A REGRA CLT (DIA DO INÍCIO CONTA COMO DIA 1), IGUAL AO PAINEL RH. VALE PARA TODOS EM EXPERIÊNCIA.** Pedido (usuário, prints): Lilian (admitida 18/05/2026, 45 dias) aparece CERTA no Painel RH (Fim 1º: 01/07/2026), mas no CONTRATO a "CLÁUSULA 5ª — DO PRAZO" imprimia término 02/07/2026 (1 dia à frente) e final 16/08 (deveria 15/08). Causa-raiz: Painel RH/`homeData` RECALCULA `fim1`/`fim2` (regra CLT `inicio + dias − 1`, Rev. 2500), mas o gerador do contrato em `Colaboradores.tsx` lia os valores GRAVADOS `experienciaFim1`/`experienciaFim2` — cadastros pré-Rev. 2500 ficaram salvos sem o `−1` e nunca foram regravados. R-001/R-007/R-010 proíbem UPDATE em massa → a correção recalcula na geração do documento. Fix (SÓ CLIENT/UI; ZERO SCHEMA; ZERO SERVER): CLIENT `Colaboradores.tsx` — helper `calcFimExp(base, dias, fallback)` faz `new Date(inicio).setDate(+dias − 1)` a partir de `inicio` (=`experienciaInicio || dataAdmissao`), mesma régua do painel; `fim1`/`fim2` do contrato passam a vir dele (fallback ao valor gravado se faltar `inicio`). Validação: Lilian → fim1 01/07/2026 ✓, fim2 15/08/2026 ✓. esbuild EXIT 0 (`pnpm build`/`tsc` estouram OOM no container). Detalhe: `shared/changelog.ts`.
- **Rev. 2663** — **PAINEL RH (`/painel-rh`) · CONTRATOS DE EXPERIÊNCIA: AS DATAS DE FIM (1º/2º PERÍODO) FICAM MAIORES E SURGE UM BANNER DE "LEMBRETE" PARA RH/USUÁRIO MASTER 5 DIAS ANTES DE QUALQUER CONTRATO VENCER (1º OU 2º PERÍODO).** Pedido (usuário, print image_1780282084751): (1) datas de vencimento "um pouco maiores"; (2) alerta para RH/master de contrato a vencer; (3) LEMBRETE 5 dias antes de qualquer contrato de experiência vencer (1º ou 2º período). Dados já existiam no SERVER (ZERO backend/schema): `homeData.experiencias` traz `fim1`/`fim2`/`status` e `diasRestantes` — que o backend JÁ calcula contra o FIM RELEVANTE (`fim1` no 1º período, `fim2` se prorrogado), logo o "5 dias" cobre ambos os períodos. Fix (SÓ CLIENT/UI; ZERO SCHEMA; ZERO SERVER; R-001/R-007/R-010): CLIENT `PainelRH.tsx` (card "Contratos de Experiência", já gated por `canSeeExperiencia` = RH + admin master) — sublinha de datas `text-[10px]`→`text-[11px]` com Fim 1º/Fim 2º em `text-sm font-bold` (o fim do período relevante fica `text-red-700` quando faltam ≤5 dias); BANNER no topo do `CardContent` via IIFE que filtra `experiencias.filter(e => e.diasRestantes >= 0 && e.diasRestantes <= 5)` e, havendo ≥1, renderiza bloco vermelho pulsante com `Bell` + "LEMBRETE — N contrato(s) … vencendo em até 5 dias" e lista (nome + badge período + "vence HOJE/em Nd (DD/MM/AAAA)"). Validado (estático): esbuild EXIT 0 (`pnpm build`/`tsc` estouram OOM no container). Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2662** — CONTAS A PAGAR (`/financeiro/contas-a-pagar`) · A TABELA É REDISTRIBUÍDA PARA QUE OS VALORES (R$) E O STATUS VOLTEM A APARECER — ESTAVAM ESCONDIDOS À DIREITA, ATRÁS DA COLUNA FIXA "AÇÕES". Causa-raiz (SÓ LAYOUT/UI): tabela em `overflow-x-auto` estourava a largura (Descrição `max-w-md`=448px + Ações `sticky` com 5 botões ~192px) → Valor/Status caíam fora/sob Ações. Fix (SÓ CLIENT/UI; ZERO SCHEMA/SERVER): CLIENT `FinanceiroContasAPagar.tsx` — Descrição→`max-w-[190px]`; Categoria→`max-w-[110px]`; Ações `gap-0.5`+botão Pagar enxuto; "Expandir/Recolher"→botão-ícone `ChevronRight`; padding `px-3`→`px-2`. Nenhuma coluna removida (texto longo no `title`). Detalhe: `shared/changelog.ts`.

- **Rev. 2661** — CONTAS A PAGAR (`/financeiro/contas-a-pagar`) · TÍTULOS VINCULADOS A OUTRO MÓDULO PASSAM A SER EDITÁVEIS; A EDIÇÃO ABRE EM FULLSCREEN; AS ALTERAÇÕES RETORNAM À OC DE ORIGEM (COMPRAS); FICA REGISTRADO QUEM EDITOU. Fix (SCHEMA ADITIVO + SERVER + CLIENT; só ADD COLUMN IF NOT EXISTS): SCHEMA `drizzle/schema.ts` (`financialEntries` + `editado_por_id`/`editado_por_nome`/`editado_em`) + self-heal `[SyncSchema+]`; SERVER `server/routers/financial.ts` (`updateEntry` revoga bloqueio "edite na origem", grava editor, WRITE-BACK ATÔMICO pra `compras_ordens` de fornecedor/vencimento/forma/obs na MESMA `db.transaction` com `RETURNING id`+`rowCount===1` senão ROLLBACK + `TRPCError CONFLICT`); CLIENT `FinanceiroContasAPagar.tsx` (modal `showEdit` fullscreen + banner âmbar; detalhe ganha "Editado por"). Detalhe: `shared/changelog.ts`.

- **Rev. 2660** — CONTAS A PAGAR (`/financeiro/contas-a-pagar`) · O MODAL "REGISTRAR PAGAMENTO" FICA MAIOR (`max-w-lg`→`max-w-2xl`) E DEIXA DE EXIGIR BARRA DE ROLAGEM. Fix (SÓ CLIENT/UI; ZERO SCHEMA; ZERO SERVER; R-001/R-007/R-010): CLIENT `FinanceiroContasAPagar.tsx` (modal `showPay`) — `DialogContent` `max-w-lg`→`max-w-2xl`; "Conta Bancária" e "Comprovante / Documento" passam a dividir UMA linha (grid 2 col), caindo a altura o suficiente para caber sem rolagem no caso comum (sem subform de cheque); mesmos campos/mutations. Detalhe: `shared/changelog.ts`.

- **Rev. 2659** — INVENTÁRIO SEMANAL (`/almoxarifado/inventario`) · A TELA GANHA UM CAMPO DE BUSCA (POR NOME OU CÓDIGO INTERNO DO ITEM) IGUAL AO DO ALMOXARIFADO. Fix (SÓ CLIENT/UI; ZERO SCHEMA; ZERO SERVER; R-001/R-007/R-010): CLIENT `client/src/pages/almoxarifado/Inventario.tsx` — ícone `Search` + `useMemo`, state `busca`, `<input>` de busca (lupa + botão limpar) acima das listas (visível só com `total > 0`), helper `norm`+`matchBusca` filtra por `itemNome` OU `itemCodigoInterno`; `pendentes`/`finalizados` viram `useMemo` filtrados — mas os TOTAIS e a barra de PROGRESSO seguem contando a sessão INTEIRA; empty-state "Nenhum item encontrado". Detalhe: `shared/changelog.ts`.

- **Rev. 2658** — CATEGORIAS (`/financeiro/categorias`) · CADA LINHA GANHA O BOTÃO EXCLUIR (🗑) ALÉM DE EDITAR/INATIVAR. Fix (SÓ CLIENT/UI — reusa rota existente; ZERO SCHEMA): a rota `financial.deleteAccount` JÁ EXISTIA e faz SOFT-DELETE (`ativo=0`, NÃO DELETE físico) com guarda de integridade (bloqueia se houver `financial_entries`/contas-filhas) + audit log; CLIENT `FinanceiroCategorias.tsx` ganha botão Trash2 + AlertDialog "Excluir categoria?". Erro (categoria em uso) via toast destructive. Detalhe: `shared/changelog.ts`.

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
