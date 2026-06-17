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

- **Rev. 3210** — **FINANCEIRO / CONTROLE DE CHEQUES · OS CARDS DE RESUMO (TOPO: TOTAL/COMPENSADOS/PENDENTES/OUTROS + OS 3 CARDS DO MÊS) VIRARAM BOTÕES CLICÁVEIS: CLICAR FILTRA A LISTA POR AQUELE STATUS (CLICAR DE NOVO NO CARD ATIVO LIMPA O FILTRO) E O GRID FICOU MAIS RESPONSIVO.** PEDIDO (piloto FC): "quero estes cards responsivos, quando clicar quero que seja filtrado as informações" + print dos cards. SOLUÇÃO — FRONT (`FinanceiroCheques.tsx`): cards viraram `<button>` com `onClick`→`toggleStatus(s)` (toggle p/ "todos"), estado ativo com `ring`/`aria-pressed` + hover; "Outros" usa novo filtro `"outros"` (sustado/cancelado/devolvido/indefinido) aplicado CLIENT-SIDE via `chequesFiltrados` (servidor só aceita 1 status); título da tabela mostra contagem filtrada + "limpar"; grid `grid-cols-1 sm:grid-cols-2 md:grid-cols-4` (topo) e `sm:grid-cols-3` (mês); `<Select>` Status ganhou "Outros". GROUNDWORK inerte: tabelas `financial_cartoes`/`_faturas`/`_itens` (`schema.ts` + self-heal `CREATE TABLE IF NOT EXISTS`) p/ futuro Cartão de Crédito (nenhum router/UI usa ainda). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3209** — **FINANCEIRO / CONTROLE DE CHEQUES · BUG NA IMPORTAÇÃO: AO GRAVAR, UMA PLANILHA COM DATA IMPOSSÍVEL (EX.: 29/02/2025 — NÃO BISSEXTO) DERRUBAVA O LOTE INTEIRO COM "FALHA AO GRAVAR · date/time field value out of range: 2025-02-29"; AGORA DATAS INVÁLIDAS VIRAM VAZIO E A IMPORTAÇÃO CONCLUI.** PEDIDO (piloto FC): print do modal com toast "Falha ao gravar · INSERT INTO financial_cheques … date/time field value out of range" ao clicar "Gravar 965 novo(s)". CAUSA-RAIZ: `parseData` (`server/routers/cheques.ts`) montava o ISO direto de dia/mês/ano SEM validar se a data existe (aceitava `da <= 31` p/ qualquer mês); "29/02/2025" virava `2025-02-29` e, como o INSERT roda numa única `db.transaction`, o Postgres abortava o lote todo. SOLUÇÃO — BACK: helper `ymdToISO(yr,mo,da)` que só retorna ISO se `Date.UTC` der data REAL (round-trip bate), senão `null`; `parseData` usa no ramo regex. Vale p/ vencimento E compensação; `ano_ref`/`mes_ref` já tinham fallback. ZERO SCHEMA/ALTER/DROP/DELETE · ZERO FRONT. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3208** — **FINANCEIRO · OS MODAIS "TELA CHEIA" (IMPORTAR CONTROLE DE CHEQUES E EXPANDIR LISTA DA CONCILIAÇÃO) ABRIAM ESTREITOS (~512px) COM SCROLL HORIZONTAL; AGORA ABREM EM TELA CHEIA (96vw) SEM SCROLL LATERAL.** CAUSA-RAIZ: `DialogContent` (`dialog.tsx`) tem `resizable` default `true` que aplica `style` INLINE `width: min(512px, …)` — vence o className, então os `w-[96vw]` das Rev. 3205/3206 eram ignorados. SOLUÇÃO — FRONT: `resizable={false}` nos `DialogContent` (`FinanceiroCheques.tsx` import + `FinanceiroConciliacao.tsx` expandir) + `max-h`. `dialog.tsx` NÃO alterado (fix por instância). ZERO BACKEND/SCHEMA. Detalhe: `shared/changelog.ts`.

- **Rev. 3207** — **FINANCEIRO / CONTROLE DE CHEQUES · A TELA GANHOU 3 CARDS DO MÊS SELECIONADO (TOTAL DE CHEQUES, COMPENSADOS E "FALTAM COMPENSAR" = PENDENTES), UMA LEGENDA DE STATUS PARA RASTREIO E O MARCADOR "CONCILIADO NO EXTRATO" + MOTIVO QUANDO O CHEQUE VOLTOU.** BACK (`server/routers/cheques.ts`): `resumo` aceita `mes` opcional (`AND mes_ref=$N`, ordem posicional mantida). FRONT (`FinanceiroCheques.tsx`): query `resumoMes`+`totaisMes` → 3 cards "Resumo de MÊS/ano" (Total/Compensados/Faltam, qtd+BRL) só com mês selecionado; coluna Status empilha badge + "Conciliado no extrato" (`Link2`+data) + "Motivo: …" (devolvido/sustado/cancelado); LEGENDA no cabeçalho. ZERO SCHEMA/ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 3206** — **FINANCEIRO / CONTROLE DE CHEQUES · O MODAL "IMPORTAR CONTROLE DE CHEQUES" ESTAVA APERTADO (`max-w-2xl`); GANHOU LAYOUT EM DUAS COLUNAS (DROPZONE + RESUMO) E A AMOSTRA EM LARGURA TOTAL.** Em `FinanceiroCheques.tsx` o `DialogContent` foi p/ `max-w-[96vw] w-[96vw] h-[94vh] flex flex-col`; corpo grid `lg:grid-cols-2` (dropzone `py-16` + botão `size="lg"` à esq; 6 KPIs `text-2xl` + chips à dir); amostra full-width (`max-h-[42vh]`, header sticky). ZERO lógica/BACKEND/SCHEMA. (Nota: a largura só passou a valer de fato na Rev. 3208.) Detalhe: `shared/changelog.ts`.

- **Rev. 3205** — **FINANCEIRO / CONCILIAÇÃO BANCÁRIA · AS DUAS LISTAS DE PENDÊNCIA ("NO EXTRATO, SEM LANÇAMENTO" E "NO ERP, SEM EXTRATO") GANHARAM UM BOTÃO "EXPANDIR" QUE ABRE A LISTA EM TELA CHEIA (MODAL 96vw × 92vh) PARA ANALISAR MELHOR.** Em `FinanceiroConciliacao.tsx` cada card ganhou botão "Expandir" (`Maximize2`) que abre `Dialog` full screen renderizando as MESMAS linhas (conciliar/Lançar/comprovante seguem); linha do extrato extraída em `renderExtratoRow`; estado `expandedList`. ZERO BACKEND · ZERO SCHEMA/ALTER/DROP/DELETE · só UI. Detalhe: `shared/changelog.ts`.

- **Rev. 3204** — **FINANCEIRO / CONTROLE DE CHEQUES · A TELA GANHOU A MESMA RÉGUA DE MÊS/ANO DA CONCILIAÇÃO BANCÁRIA: NAVEGAÇÃO POR ANO (SETAS `< 2026 >`), BOTÃO "ANO TODO" E A FAIXA DE MESES JAN–DEZ EM CHIPS COM BOLINHA DE STATUS.** Em `FinanceiroCheques.tsx` os dropdowns Ano/Mês viraram a régua da Conciliação (estado `ano:number` + `mesSel:number|null`); BACK (`server/routers/cheques.ts`): nova query `resumoMensal({companyId,ano})` com `assertCompanyAccess` p/ pintar a bolinha. ZERO SCHEMA/ALTER/DROP/DELETE · cheque NÃO vira lançamento. Detalhe: `shared/changelog.ts`.

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
