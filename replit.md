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

- **Rev. 3487** — **PLANO DE CONTAS · MODAL "NOVA CONTA" SIMPLIFICADO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Campo "Natureza" removido — derivado automático do Tipo. Removidos textos verbosos de Código, Nome e descrição do grupo pai. Detalhe: `shared/changelog.ts`.

- **Rev. 3486** — **PLANO DE CONTAS · CONTAS IMP REMOVIDAS: LANÇAMENTOS MIGRADOS + CONTAS RECODIFICADAS. NEON · ZERO ALTER/DROP/DELETE.** 8 IMP com equivalente → lançamentos migrados + ativo=0 (Comissão→5.1, Manut.Veículos→5.7, Pgto Empréstimo→7.1, Transporte→3.5, Assessoria Jur→6.1, Custas→6.2, Marketing/Com.Visual→5.2). 7 IMP recodificadas sem migração (5.9 Hospedagem, 5.10 Seguro Veículos, 4.11 Guias FGTS, 3.11 Topografia, 4.12 Telefone Celular, 5.11 Compra Terreno, 7.3 Invest.Financeiros). Detalhe: `shared/changelog.ts`.

- **Rev. 3485** — **PLANO DE CONTAS · CONTAS IMP-001…IMP-015 RECLASSIFICADAS. UPDATE NO NEON · ZERO ALTER/DROP/DELETE.** Todas tinham lançamentos → não excluídas. Movidas para grupos: Despesas Variáveis (8 contas), Despesas Administrativas (2), Custos de Obra (1), Despesas Financeiras (2), Despesas Jurídicas (2). nivel=2, tipo e natureza corrigidos. Detalhe: `shared/changelog.ts`.

- **Rev. 3484** — **PLANO DE CONTAS · BOTÃO "CARREGAR PADRÃO FC" DEFINITIVAMENTE REMOVIDO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Usuário quer só criação manual via "+ Nova Conta". Removidos: Sprout, confirmSeed, seedMut, botão, AlertDialog. Detalhe: `shared/changelog.ts`.

- **Rev. 3483** — **PLANO DE CONTAS · CHECKBOXES PARA SELEÇÃO MÚLTIPLA + EXCLUSÃO EM LOTE + BOTÕES SEMPRE VISÍVEIS. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Checkbox em cada linha + "Selecionar todas" no topo. Barra vermelha aparece ao marcar itens com botão "Excluir N selecionada(s)". AlertDialog de confirmação antes de excluir. Exclusão sequencial com relatório ok/fail. Botões +Subconta/Editar/Excluir agora sempre visíveis (sem hover-only). Linha selecionada com fundo azul. Detalhe: `shared/changelog.ts`.

- **Rev. 3482** — **PLANO DE CONTAS · BOTÃO "CARREGAR PADRÃO FC" REMOVIDO A PEDIDO DO USUÁRIO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Usuário quer montar o plano do zero. Removidos: botão, state `confirmSeed`, AlertDialog de confirmação, import `Sprout`, mutation `seedMut`. Estado vazio agora diz "Clique em + Nova Conta para começar." Detalhe: `shared/changelog.ts`.

- **Rev. 3481** — **PLANO DE CONTAS · LEGENDAS COMPLETAS + CONFIRMAÇÃO "CARREGAR PADRÃO" + DESCRIÇÕES EM TODOS OS CAMPOS DO FORMULÁRIO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Painel colapsível "Como funciona o Plano de Contas?" explica hierarquia (3 níveis), todos os 8 tipos com descrição prática, Credora × Devedora e os 3 botões de ação. "Carregar Padrão FC" agora abre AlertDialog de confirmação explicando o que será criado e oferecendo alternativa "criar do zero". Formulário: todos os campos com subtexto explicativo; Tipo e Natureza com descrição em cada opção do Select; hint abaixo do Tipo repete a descrição do tipo selecionado. Detalhe: `shared/changelog.ts`.

- **Rev. 3480** — **PLANO DE CONTAS · NOVO LAYOUT: CHIPS DE TIPO, BARRA COLORIDA LATERAL POR TIPO, BOTÃO "+ SUBCONTA" INLINE NO HOVER, FORMULÁRIO REORGANIZADO COM CAMPOS AVANÇADOS COLAPSÍVEIS. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Lista: barra colorida 1px na raiz (cor por tipo), ícone `ChevronRight` nas filhas, fundo diferenciado nas raízes, botão `+` no hover abre formulário pré-preenchido com aquela conta como pai. Filtros: Select de tipo substituído por chips pill horizontais com contagem. Formulário: "Conta Pai" renomeado para "Dentro de qual grupo?" + subtexto explicativo; "Sem pai (conta raiz)" virou "Grupo principal (sem pai)" com ícone; campo "Nível" removido (era derivado, confundia); DRE/Ordem movidos para seção "Configurações avançadas" colapsível; Código+Nome lado a lado. Detalhe: `shared/changelog.ts`.

- **Rev. 3479** — **DASHBOARD CONCILIAÇÃO BANCÁRIA · EXPANSÃO MASSIVA DE KPIs E GRÁFICOS: TOP FORNECEDORES, POR CATEGORIA, POR BANCO, SALDO ACUMULADO, % CONCILIAÇÃO POR MÊS. BACKEND ADITIVO + FRONTEND · ZERO ALTER DESTRUTIVO/DROP/DELETE.** Nova procedure `getConciliacaoDashExtra` (5 queries: top fornecedores/categorias despesa/receita/obras/extremos do extrato). No frontend: +6 KPI cards (ticket médio, maior entrada/saída, contas ativas, fornecedores únicos, descrições únicas), +10 novos gráficos (entradas×saídas/mês, % conciliado/mês via ComposedChart, saldo acumulado AreaChart, saídas/entradas/comparativo por banco, ranking fornecedores com minibar + horizontal bar, donut+ranking categorias despesa, bar+ranking categorias receita, stacked bar obras+ranking), +4 DetailDialogs de detalhe. Componentes auxiliares `SectionTitle`/`MiniBar`/`TopListCard` adicionados no próprio arquivo. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 3480** — **PLANO DE CONTAS · NOVO LAYOUT: CHIPS DE TIPO, BARRA COLORIDA LATERAL, BOTÃO "+ SUBCONTA" INLINE, CAMPO "NÍVEL" REMOVIDO, DRE/ORDEM COLAPSÍVEIS. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3478** — **CONCILIAÇÃO BANCÁRIA · RELATÓRIO NÃO RECARREGA AUTOMATICAMENTE A CADA AÇÃO — USUÁRIO CONTROLA VIA BOTÃO "ATUALIZAR". 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3477** — **CONCILIAÇÃO BANCÁRIA · (1) ERRO "THE STRING DID NOT MATCH THE EXPECTED PATTERN" MAPEADO PARA MENSAGEM AMIGÁVEL + (2) BUGFIX `getOcsPorMes` "operator does not exist: date ~ unknown". BACKEND PONTUAL + FRONTEND · ZERO ALTER DESTRUTIVO/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3476** — **FORNECEDORES · BUGFIX: BOTÃO "BUSCAR CNPJ" BLOQUEADO NO MODO EDIÇÃO. 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.

- **Rev. 3475** — **EMPRESAS TERCEIRAS · AUTO-PREENCHIMENTO DA FICHA AO DIGITAR O CNPJ (14 DÍGITOS). 100% FRONTEND · ZERO BACKEND/SCHEMA/ALTER/DROP/DELETE.** Detalhe: `shared/changelog.ts`.


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
