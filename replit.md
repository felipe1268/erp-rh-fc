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


- **Rev. 2622** — **CONTRATOS DE EXPERIÊNCIA · NOVO BOTÃO "ANÁLISE" EM CADA COLABORADOR EM PERÍODO DE EXPERIÊNCIA QUE CRUZA TODAS AS OCORRÊNCIAS DO PERÍODO (ASSIDUIDADE/FALTAS, ATRASOS, ADVERTÊNCIAS, ATESTADOS, ACIDENTES E HISTÓRICO) E DEVOLVE UM VEREDITO SUGERIDO (SCORE 0–100) PRA SUBSIDIAR RH/DIRETORIA NA DECISÃO DE EFETIVAR/PRORROGAR/DESLIGAR.** Pedido (usuário): "em cada novo funcionário que está em experiência, precisa ter um botão chamado de análise, onde o ERP cruze todas as informações dele no período... a ficha completa para dar subsídio ao RH e diretoria". Fix ADITIVO (SOMENTE SELECT — ZERO ALTER/DROP/DELETE/SCHEMA; R-001/R-007/R-010): novo procedure `employees.analiseExperiencia` em `server/routers.ts` calcula a janela do contrato (mesma régua do `home.getData`: início=`experienciaInicio`||`dataAdmissao`, fim1/fim2 por `experienciaTipo` 30_30/45_45) e coleta em memória `warnings`/`time_records`/`atestados`/`accidents`/`employee_history` filtrando por [início, hoje]; computa assiduidade %, faltas, atrasos (qtd+min), advertências por tipo, atestados, acidentes e ocorrências; score base 100 penalizando só disciplina/assiduidade (suspensão −25, escrita −15, verbal −8, falta −6, atraso −2; atestados/acidentes NÃO reduzem) → veredito ≥85 efetivar / 70–84 ressalvas / 50–69 prorrogar / <50 desligar. Novo `client/src/components/AnaliseExperiencia.tsx` (Dialog com gauge SVG, motivos, cards de período/indicadores e listas de detalhe). Botão "Análise" (roxo, `FileBarChart`) + state `analiseEmpId` + modal em `Home.tsx` e `PainelRH.tsx` (em PainelRH fora do gate `canEditExperiencia` — é leitura). Validado: servidor reiniciado e recompilou limpo (tsx watch). Detalhe: `shared/changelog.ts`.
- **Rev. 2621** — **RAIO-X DO COLABORADOR · ABA "ACIDENTES" · CADA LINHA DA TABELA DE ACIDENTES DE TRABALHO PASSA A SER CLICÁVEL E ABRE UM MODAL COM TODOS OS DETALHES DO ACIDENTE (DESCRIÇÃO, CAT, AGENTE CAUSADOR, AÇÃO CORRETIVA, TESTEMUNHAS, ANEXO ETC.).** Pedido (usuário): "quero poder clicar e ver qual foi o acidente e analisar todos os detalhes". Fix SÓ CLIENT (ZERO BACKEND/SCHEMA — `docs.raioX` já devolve o registro inteiro de `accidents` via `db.select().from(accidents)`): `client/src/components/RaioXFuncionario.tsx` ganha state `acidenteDetalhe`; cada `<tr>` da tabela da aba "Acidentes" vira clicável (`onClick`/`onKeyDown` Enter|Espaço, `role=button`, `tabIndex`, hover vermelho, ícone `Eye` na coluna Descrição) → abre `<Dialog>` (max-w-2xl, scroll) com TODOS os campos em seções: badges (tipo/gravidade/dias), "Geral" (data, hora, dias, local, parte do corpo, agente causador), "CAT" (houve CAT?, nº, data, motivo sem CAT), "Descrição", "Ação Corretiva" condicional (status, responsável, prazo, descrição), "Testemunhas" e link p/ `documentoUrl`. Validado: servidor reiniciado e recompilou limpo (tsx watch), sem erros de compile. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2620** — DASHBOARD DE FUNCIONÁRIOS · OS RANKINGS "DE ADVERTÊNCIAS" E "DE ATESTADOS / FALTAS" PASSAM A EXIBIR A FOTO DO CADASTRO DE CADA FUNCIONÁRIO (FALLBACK = INICIAL DO NOME), COM A LINHA CLICÁVEL → RAIO-X. Fix ADITIVO (só SELECT; R-001/R-007/R-010): `server/routers/dashboards.ts` (`getDashFuncionarios`) — queries 18/19 ganham `employees.fotoUrl` no SELECT + `GROUP BY`; retorno inclui `employeeId`+`fotoUrl`. `DashFuncionarios.tsx` — novo `RankAvatar` (img `h-9 w-9` com `onError`→inicial); as duas listas renderizam avatar + viram `<Link href="/raio-x/${employeeId}">`. Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

- **Rev. 2619** — DASHBOARD DE FUNCIONÁRIOS · AS TELAS DE DETALHE DE CADA INDICADOR (ADMISSÕES, DEMISSÕES, ATIVOS, SALDO, TURNOVER) PASSAM A LISTAR OS FUNCIONÁRIOS PERTINENTES (NOME + FOTO) AO CLICAR NUM MÊS, RESPONSIVO. Fix ADITIVO (só SELECT; R-001/R-007/R-010) reusando `dashboards.drillDown`/`DrillDownModal`: `server/routers/dashboards.ts` ganha `filterType` `ativosMes` + `movimentacaoMes` (e filtros históricos deixam de excluir `Desligado`/`Lista_Negra`); `DrillDownModal.tsx` ganha prop `zIndex` + coluna "Demissão"; `TabelaComparativaAnual.tsx` cards do "Detalhamento mensal" viram `<button>` que abre o drill-down do mês; `DashFuncionarios.tsx` mapeia cada indicador ao filtro certo. Validado: recompile limpo (tsx watch). Detalhe: `shared/changelog.ts`.

- **Rev. 2618** — DASHBOARD DE FUNCIONÁRIOS · SELETOR DE "ANO DE ANÁLISE" + NOVA TABELA COMPARATIVA ANUAL DE CONTRATAÇÕES x DESLIGAMENTOS (TRIMESTRE/SEMESTRE/ANOS ANTERIORES). Fix ADITIVO (só SELECT; R-001/R-007/R-010): `DashFuncionarios.tsx` ganha state `anoAnalise` + `<Select>` "Ano de análise" (7 anos) que alimenta a query mensal e a nova anual; NOVO procedure `dashboards.funcionariosAnual` (UNION ALL adm/dem agregando `EXTRACT(YEAR/QUARTER)` p/ ano-ref + 4 anteriores → T1–T4, 1º/2º sem, anual) + NOVO `ComparativoAnosFuncionarios.tsx` (cards-resumo c/ variação % + 2 tabelas Admissões/Demissões). Validado: esbuild client+server (exit 0). Detalhe: `shared/changelog.ts`.

- **Rev. 2617** — PLANEJAMENTO · CAMINHO B · O % PREVISTO PASSA A TER PARIDADE EXATA (CRAVADA) COM A COLUNA "% CONCLUÍDA" DO MS PROJECT — NO PLN_816 R04 A CURVA DA RAIZ BATE 2/9/15/20 (ANTES 2/9/16/22). Fix ADITIVO: `shared/diasUteis.ts` ganha `weekDayIntervals` + `minutosUteisEntre`/`fracaoMinutos` (motor minuto-a-minuto, fallback day-granular); `drizzle/schema.ts`+self-heal ganham `baseline_start_ts`/`baseline_finish_ts` (TEXT ISO com hora, `ADD COLUMN IF NOT EXISTS`); `ImportarCronograma.tsx` lê `<WorkingTime>`→intervalos e baseline COM HORA; `planejamento.ts` raiz = `round(Σ min úteis decorridos ÷ Σ totais × 100)`. Validado: motor REAL contra PLN_816 R04 (1042 folhas) → 2/9/15/20 CRAVADO. Detalhe: `shared/changelog.ts`.

- **Rev. 2616** — PLANEJAMENTO · MODAL "NOVO PROJETO" · O NOME DA OBRA PASSA A APARECER POR INTEIRO NO DROPDOWN "SELECIONAR OBRA" — ANTES NOMES LONGOS ESTOURAVAM/ERAM CORTADOS. Fix (SÓ CLIENT — `PlanejamentoLista.tsx`): span interno do `SelectItem` quebra linha (`block min-w-0 whitespace-normal break-words leading-snug`); `SelectContent` ganha `max-w-[min(28rem,var(--radix-select-content-available-width))]`; gatilho fechado segue `truncate`. Validado: esbuild client (exit 0). Detalhe: `shared/changelog.ts`.

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
- **REGRA DE OURO — CAMINHO B (Rev. 2617+, substitui Rev. 2533/2603).** FONTE ÚNICA = coluna `PercentComplete` ("% Concluída") do MS Project, lida nos dois momentos com a MESMA régua → paridade EXATA (PLN_816 R04 = 2/9/15/20 CRAVADO):
  - **% PREVISTO** (raiz e atividades) = fração de duração da baseline em **TEMPO ÚTIL MINUTO-A-MINUTO** (motor `minutosUteisEntre`/`fracaoMinutos` de `shared/diasUteis`, varrendo dia a dia e clipando aos intervalos de trabalho `weekDayIntervals` do calendário do XML). RAIZ = `round(Σ minutos úteis DECORRIDOS de cada folha ÷ Σ minutos úteis TOTAIS × 100)` (ponderado por minutos úteis, NÃO por contagem de atividades); POR ATIVIDADE = `round(fracaoMinutos(BL_Start, semana, BL_Finish, cal) × 100)`. `round` (não `floor`) porque a coluna "% Concluída" do MSP é arredondada.
  - **Baseline COM HORA é OBRIGATÓRIA.** Lê `baseline_start_ts`/`baseline_finish_ts` (TEXT ISO com hora capturada no import). Date-only diverge (PLN_816 daria 2/9/16/22). Sem `weekDayIntervals` no calendário OU sem TS → fallback day-granular ponderado por duração (backward compat). Cutoff semanal segue fim-do-dia (`T23:59:59Z`).
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **Mesma coluna nos dois momentos** = paridade matemática absoluta MSP × ERP. Sem `Texto6`/`Texto10`/`Texto11` (continuam sendo gravados em `previsto_msp_pct` por atividade só pra retrocompat — leitura desativada).
  - Snapshot é regenerado SÓ no `salvarAtividades` (substituir/cadastro). Mudou baseline = nova revisão = novo snapshot. Avanço semanal NÃO regenera (baseline é imutável dentro da revisão).
  - Implementação: `server/routers/planejamento.ts` (helper `regenerarPrevistoSemanasCaminhoB` + chamada pós-transaction em `salvarAtividades`; `importarComModo` propaga os TS), `client/src/pages/planejamento/ImportarCronograma.tsx` (parser `<Baseline Number=0>` COM HORA + `<WorkingTime>`→`weekDayIntervals`), `shared/diasUteis.ts` (motor minuto-a-minuto), `drizzle/schema.ts` + self-heal `[SyncSchema+]` (`baseline_start_ts`/`baseline_finish_ts`).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
