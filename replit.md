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


- **Rev. 2655** — **CONTAS A PAGAR & CONTAS A RECEBER · A BAIXA/QUITAÇÃO GANHA CAMPOS FINANCEIROS DETALHADOS (VALOR + JUROS − DESCONTOS + OUTROS ± → TOTAL), OBSERVAÇÕES, ANEXO DE COMPROVANTE (PDF/WORD/FOTO) E, NO CONTAS A PAGAR, SUBFORMULÁRIO DE CHEQUE (PRÓPRIO/TERCEIROS) QUE ABRE AUTOMATICAMENTE QUANDO A FORMA DE PAGAMENTO = CHEQUE (PRÓPRIO → "Nº DO CHEQUE").** Pedido (usuário): nos diálogos de baixa de ambos os menus incluir Valor (puxado do lançamento) + Juros + Descontos + Outros (±) + Observações com Total = valor + juros − descontos + outros virando o valor realizado/recebido; anexar comprovante/documento; e cheque com seleção próprio/terceiros + campos do cheque. Fix: SCHEMA additivo (R-001/R-007/R-010 — só ADD COLUMN IF NOT EXISTS via `[SyncSchema+]`): `drizzle/schema.ts` — `financial_entries` ganha `juros`/`descontos`/`outros`+`cheque_tipo`; `financial_revenue` ganha `juros`/`descontos`/`outros` (`observacoes`/`comprovante_url`/`cheque_*` já existiam). SERVER `server/routers/financial.ts` — `updateEntryStatus` recebe juros/desc/outros/observacoes+chequeTipo+cheque_* e grava via COALESCE (`valorRealizado`=Total do cliente); `registrarRecebimento` recebe juros/desc/outros+comprovanteUrl nas duas rotas; NOVO `financial.uploadComprovante` (base64→`storagePut`). CLIENT — `FinanceiroContasAPagar.tsx` (modal `showPay`) e `FinanceiroContasAReceber.tsx` (`DarBaixaModal`): grid Valor/Juros/Descontos/Outros + linha "Total", `<input type=file>` de comprovante e (só Pagar) subform de cheque condicionado a `formaPagamento==="cheque"`. Cheque restrito ao Pagar (recebido é sempre de terceiros). Validado (estático): `pnpm build` exit 0. Detalhe: `shared/changelog.ts`.
- **Rev. 2654** — **CONTAS A PAGAR · O MODAL "REGISTRAR PAGAMENTO" FICA MAIOR E DEIXA DE EXIGIR BARRA DE ROLAGEM — A LARGURA CRESCE (`max-w-sm`→`max-w-lg`) E OS CAMPOS "DATA DO PAGAMENTO" E "FORMA DE PAGAMENTO" PASSAM A FICAR LADO A LADO (GRID 2 COL), REDUZINDO A ALTURA TOTAL.** Pedido (usuário, print image_1780276364266): "deixe a tela maior, para que nao precise da barra de rolagem". O modal de pagamento (OC OC-... + Data/Forma/Conta Bancária) era estreito (`max-w-sm`) e, com os 3 campos empilhados, ultrapassava o `max-h-[92dvh]` do `DialogContent` em telas mais baixas → `overflow-y-auto` mostrava barra. Fix (SÓ CLIENT/UI; R-001/R-007/R-010 — ZERO SCHEMA/SERVER): `client/src/pages/financeiro/FinanceiroContasAPagar.tsx` — modal `showPay`: `DialogContent` `max-w-sm`→`max-w-lg`; "Data do Pagamento"+"Forma de Pagamento" em `grid grid-cols-1 sm:grid-cols-2 gap-3`; "Conta Bancária" full-width; `space-y-4`→`space-y-3`. Lógica de pagamento inalterada. Validado (estático): `pnpm build` exit 0. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2653** — FÉRIAS / LISTA DE FÉRIAS · A ORDENAÇÃO POR "INÍCIO DO GOZO" GANHA RÓTULOS MAIS CLAROS — "INICIA PRIMEIRO" / "INICIA POR ÚLTIMO" — ESPELHANDO O PADRÃO DE "VENCIMENTO". Pedido (usuário, print IMG_1472). Fix (SÓ CLIENT/UI — RÓTULO): `client/src/pages/Ferias.tsx` — itens `inicio_asc`/`inicio_desc` passam para "Início Gozo — inicia primeiro/inicia por último". Detalhe: `shared/changelog.ts`.

- **Rev. 2652** — FÉRIAS / LISTA DE FÉRIAS · A TELA GANHA ORDENAÇÃO AMPLIADA (4→14 OPÇÕES) E NOVOS FILTROS (CARGO, PERÍODO AQUISITIVO 1º/2º+, FAIXA DE DATA DE INÍCIO DO GOZO) COM BOTÃO "LIMPAR FILTROS". Pedido (usuário, print IMG_1471). Fix (SÓ CLIENT/UI): `client/src/pages/Ferias.tsx` — `sortBy` ampliado + filtros no `filtered` useMemo. Detalhe: `shared/changelog.ts`.

- **Rev. 2651** — PLANEJAMENTO / CURVA S DE TRABALHO · A LINHA AZUL (BASELINE/PREVISTO) VOLTA A SER UMA CURVA S SUAVE E MONOTÔNICA — ACABOU O DEGRAU QUE A Rev. 2650 INTRODUZIU NO PONTO DO STATUS. A AZUL AGORA LÊ A MESMA FONTE DO HEADER (`previsto_semanas.raiz`), PASSANDO PELO "% PREVISTO" DO CABEÇALHO; COM PREVISTO=REALIZADO SE SOBREPÕE À VERDE. CAUSA-RAIZ: duas fontes na mesma linha. Fix (R-001/R-007/R-010 — SÓ LEITURA/CURVA): `server/routers/planejamento.ts` — `getCurvaS` ganha `curvaPrevistoSnapshot` (lê `previsto_semanas_json`, re-chaveia cutoff→segunda, clamp monotônico); injeção do Texto10 da Rev. 2650 REVOGADA. Detalhe: `shared/changelog.ts`.

- **Rev. 2650** — PLANEJAMENTO / CURVA S · (1) A LINHA AZUL (PREVISTO/BASELINE) VOLTA A PASSAR PELO % DO HEADER NO PONTO DO STATUS; (2) O CARD FINANCEIRO "PREVISTO (BCWS)" DEIXA DE MOSTRAR R$0,00 (DESVIO FANTASMA) — BCWS E BCWP NA MESMA SEMANA-BASE. CAUSA-RAIZ #1 (REVOGADA na Rev. 2651): injetar snapshot Texto10 na semana do status criava degrau. CAUSA-RAIZ #2 (VÁLIDA): BCWS medido em "hoje" (antes do início da obra) → R$0. Fix #2: CLIENT `PlanejamentoDetalhe.tsx` ancora o BCWS na última semana com Realizado (`finRefSemana`). Detalhe: `shared/changelog.ts`.

- **Rev. 2649** — PLANEJAMENTO / CURVA S · A LINHA "REALIZADO" (VERDE) PARA DE EXIBIR DADO-FANTASMA APÓS APAGAR OS AVANÇOS — AO LIMPAR/SALVAR AVANÇOS, A CURVA REGENERA NA HORA EM VEZ DE FICAR COM CACHE VELHO. CAUSA-RAIZ: as 4 mutations de avanço invalidavam `listarAvancos`/`getProjetoById` mas NUNCA `getCurvaS`/`getCurvaSFinanceira`/`getCurvasTodasRevisoes` → React Query servia a curva em cache. Fix (SÓ CLIENT/CACHE; R-001/R-007/R-010): `PlanejamentoDetalhe.tsx` — helper `invalidarCurvaS()` no `onSuccess` das 4 mutations. Detalhe: `shared/changelog.ts`.


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
