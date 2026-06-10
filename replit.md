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

- **Rev. 2941** — **EFETIVO POR OBRA — O DRILL-DOWN "EQUIPE — {OBRA}" GANHOU UM FILTRO RÁPIDO POR SITUAÇÃO DE INTEGRAÇÃO (SST): "TODOS", "INTEGRAÇÃO VENCIDA" E "SEM INTEGRAÇÃO" — VARREDURA DE RISCO INSTANTÂNEA, NO DESKTOP E NO TABLET/CELULAR EM CAMPO.** Pedido (Task #75): em obras grandes o gestor de SST tinha que rolar a lista inteira pra achar pendência; um filtro por situação de integração agiliza a varredura. SOLUÇÃO (FRONT-only, `client/src/pages/ObraEfetivo.tsx`): novo estado `equipeIntegFilter: "todos" | "vencida" | "sem"` (reset ao abrir o modal). O filtro entra no MESMO `filteredFuncObra` que alimenta a tabela (lg+) E os cards (< lg) → vale p/ desktop e mobile; "vencida" = tem ≥1 integração `vencida`, "sem" = `integracoes` vazio. A contagem da equipe (badges de status + Total) reflete o filtro porque deriva de `filteredFuncObra`. UI: segmented control de 3 botões, cada um com a contagem do universo navegável (base status+busca, sem o filtro de integração). ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2940** — **EFETIVO POR OBRA — AS LISTAS GERAIS "TODOS" E "SEM OBRA" AGORA MOSTRAM A FOTO DO FUNCIONÁRIO NA COLUNA "FUNCIONÁRIO" (ANTES SÓ NOME + CPF) — IGUAL AO DRILL-DOWN "EQUIPE — {OBRA}".** Pedido (usuário, 2 prints do iPad): "coloca foto aqui tbm" nas abas "Todos (125)" e "Sem Obra (4)". SOLUÇÃO (FRONT + 1 ajuste read-only de BACK, ZERO ALTER/DROP/DELETE): `client/src/pages/ObraEfetivo.tsx` — a célula "Funcionário" das abas "Todos" e "Sem Obra" passou a renderizar `<PersonPhoto size="sm" src={emp.fotoUrl} caption={função}>` ao lado do nome (clicável p/ Raio-X) + CPF, no mesmo padrão do drill-down (`PersonPhoto` degrada p/ iniciais sem foto); `server/db.ts` (`getFuncionariosSemObra`) ganhou `fotoUrl: employees.fotoUrl` no `select` (a aba "Todos" já vinha de `employees.list`, que traz `fotoUrl`). Aba "Inconsistências" usa outra forma de dado (ponto, sem `fotoUrl`) → não recebeu foto. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2939** — EFETIVO POR OBRA — O DRILL-DOWN "EQUIPE — {OBRA}" FICOU AUTO-AJUSTÁVEL: EM TELAS GRANDES (lg+) CONTINUA A TABELA COMPLETA; EM TABLET/CELULAR (< lg) CADA FUNCIONÁRIO VIRA UM CARD EMPILHADO COM TODAS AS INFORMAÇÕES — ACABA O CORTE DA COLUNA "AÇÕES" NO iPad (~768px). Pedido (usuário, print do iPad): no modal "Equipe — {obra}" a coluna "Ações" (4 botões) estourava a largura e ficava CORTADA na direita; pediu pra "formatar a tela melhor para ser auto ajustável conforme a tela". SOLUÇÃO (FRONT-only, `client/src/pages/ObraEfetivo.tsx`): a tabela existente virou `<div className="hidden lg:block overflow-x-auto">` (só ≥1024px, onde cabe); abaixo de `lg` um novo `<div className="lg:hidden divide-y">` renderiza CADA funcionário como CARD de largura total — foto+nome (Raio-X)+CIPA, grid Função/Desde, bloco "Info Status" (badges aviso/dispensa/férias/afastado/licença/experiência/férias agendada), bloco "Integrações / NRs" (chips por cliente + NRs clicáveis com `Popover`/`NR_RESUMOS`) e barra de Ações SEMPRE com rótulo. Mesma lógica por funcionário da tabela, replicada no card; datas seguras p/ iOS via `fmtDataBR`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2938** — EFETIVO POR OBRA — AS ABAS "TODOS" E "SEM OBRA" AGORA MOSTRAM AS COLUNAS DE INTEGRAÇÕES (POR CLIENTE) E NRs (TREINAMENTOS) — ANTES SÓ NO DRILL-DOWN "EQUIPE — {OBRA}" — MAIS DOIS FILTROS COMBINÁVEIS (AND): POR INTEGRAÇÃO (CLIENTE) E POR NR (NORMA). Pedido (usuário): trazer pras listas gerais as colunas que só existiam no drill-down + filtrar por integração E por NR ao mesmo tempo. SOLUÇÃO (BACK+FRONT, read-only, tenant-safe): `server/db.ts` helper reusável `buildIntegracoesNrsMaps` + `getIntegracoesNrsPorFuncionario`; endpoint `obras.integracoesNrs`; `ObraEfetivo.tsx` ganhou `IntegNrsCell` (chips + Popover de NR), coluna "Integrações / NRs" nas 2 abas e 2 `Select` combináveis (matcher `matchIntegNr`, AND) + botão "Limpar". ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2937** — EFETIVO POR OBRA — CADA CARD AGORA MOSTRA, ALÉM DO EFETIVO TOTAL, O EFETIVO OPERACIONAL (100% DISPONÍVEL / "QUEM DÁ PRA CONTAR NA OBRA HOJE"), DESCONTANDO QUEM ESTÁ INDISPONÍVEL (FÉRIAS, AFASTADO, ATESTADO/LICENÇA, DISPENSADO NO AVISO E RECLUSO). Pedido (usuário): incluir o efetivo ativo/operacional além do total. SOLUÇÃO (FRONT-only, `ObraEfetivo.tsx`): no `.map` dos cards calcula `indisponiveis = qtdFerias+qtdAfastado+qtdLicenca+qtdAvisoDispensado+qtdRecluso` e `operacional = max(0, efetivo - indisponiveis)` — AVISO PRÉVIO conta; bloco esmeralda (ícone `UserCheck`) mostra o nº operacional + "N indisponível(is)". 100% leitura. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2936** — EQUIPE DA OBRA (DRILL-DOWN) — CLICAR NUM CHIP DE NR ABRE UM POPOVER COM O RESUMO DO QUE A NORMA TRATA (+ NOME DO TREINAMENTO E VALIDADE), FACILITANDO A ANÁLISE — INCLUSIVE NO TABLET/CELULAR, ONDE O TOOLTIP DE HOVER (`title`) NÃO FUNCIONA AO TOQUE. Pedido (usuário): ao clicar nas NRs, mostrar de forma resumida o que é cada uma. SOLUÇÃO (FRONT-only, `ObraEfetivo.tsx`): novo dicionário `NR_RESUMOS` (módulo) + helper `normalizeNrKey`; cada chip virou `<button>` dentro de `<Popover>` → badge NR-NN + validade + nome + resumo. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2935** — EQUIPE DA OBRA (DRILL-DOWN) — A TABELA AGORA CABE NO TABLET/CELULAR SEM CORTAR A COLUNA DE AÇÕES: OS 4 BOTÕES VIRAM SÓ-ÍCONE EM TELAS MENORES (`< lg`) E A TABELA GANHOU ROLAGEM HORIZONTAL DE SEGURANÇA. Pedido (usuário, iPad ~768px): na "Equipe — {obra}" a coluna "Ações" (4 botões COM TEXTO) estourava a largura e ficava CORTADA. SOLUÇÃO (FRONT-only, `ObraEfetivo.tsx`): `<table>` envolvida em `<div overflow-x-auto>` + botões compactos ícone-only até `lg` (com `title=`/`px-2`), rótulos voltam em `lg+`. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
