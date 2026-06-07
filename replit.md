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

- **Rev. 2818** — **COMPRAS · PAINEL FD — REDESIGN COMPLETO + FIX "FD REALIZADA NÃO APARECE".** Pedido (usuário): "A REVTE tem FD realizada e não aparece; refaça um layout COMPLETAMENTE NOVO do Painel FD — aba inicial com os itens considerados no FD, lista com a numeração do FD, e info de valor total/utilizado/saldo; facilitar a análise diária." CAUSA-RAIZ (independente das Rev. 2814–2817, que só fizeram o painel CARREGAR): o "Utilizado" (antes "FD Comprometido") só somava `fd_valor` de OCs `fd_cliente`, mas (a) as OCs FD da REVTE são `fd_fc` (criação direta) e (b) `fd_valor` é raramente preenchido — no Neon (company 60002), 35 das 37 OCs FD têm `fd_valor` NULL. As 2 OCs `fd_fc` da REVTE (obra 12) somam R$ 22.478,72 + R$ 67.045,63 = R$ 89.524,35, valor que vive em `compras_ordens.total`. Resultado: painel reportava R$ 0,00 utilizado. REGRA NOVA: VALOR EFETIVO de uma OC FD = `fd_valor` quando > 0, senão o `total` da OC; "Utilizado" = soma do valorEfetivo de TODAS as modalidades FD (fd_cliente/fd_fc/fd_terceiro). O QUE FOI FEITO: (1) `getSaldoFd` e `getSaldoFdTodasObras` (`server/routers/compras.ts`) trazem `total`+`criadoEm` no select; cada OC ganha `valorEfetivo`/`total`/`data`; `totalFdComprometido` soma valorEfetivo de TODAS as OCs FD; (2) `PainelFd.tsx` REDESENHADO — KPIs sempre visíveis (Orçamento FD / Utilizado (Realizado) / Saldo + barra de % com alerta ≥90%) e layout em ABAS: obra específica = "Itens do FD" (default, com Adicionar/Ajustar/Remover) · "Lançamentos FD" (lista numerada Nº FD/OC, Data, Descrição, Modalidade, Status, Valor, PDF + rodapé total) · "Histórico"; "Todas as obras" = "Por Obra" (com coluna Utilização % + Detalhar) · "Lançamentos FD" consolidado. RESSALVA: leitura/agregação + UI. ZERO ALTER/DROP/DELETE; ZERO schema novo; ZERO mutation. Validação: esbuild OK + diagnóstico Neon. Detalhe: `shared/changelog.ts`.
- **Rev. 2817** — **COMPRAS · PAINEL FD — HOTFIX FINAL (SEGUNDO BUG, "AINDA VAZIO" APÓS A REV. 2816) + NOVA VISÃO "TODAS AS OBRAS".** Pedido (usuário, screenshot REVTE-CIVIL ainda vazio): "Ainda vazio, arruma isso de vez e quero ver por obra e ter a opção de ver todas as obras". CAUSA-RAIZ (segundo bug, independente do `descricao` da Rev. 2816): o `getSaldoFd` resolvia o orçamento da obra com `db.execute(SELECT orcamento_id FROM obras WHERE id=... AND company_id=...)`, mas a tabela real `obras` no Neon NÃO tem `company_id` (a coluna é camelCase `companyId`) NEM `orcamento_id` (o vínculo obra→orçamento vive em `orcamentos.obraId`). O SELECT cru lançava em runtime (`column "company_id" does not exist`) → `getSaldoFd` continuava quebrando p/ TODAS as obras → painel vazio. Confirmado no Neon: `obras` tem `companyId`/`isActive`/`nome` (camelCase); obra 12 (REVTE-CIVIL) → orçamento 57 (R$ 270.855,12 BDI FD). O QUE FOI FEITO: (1) `getSaldoFd` (`server/routers/compras.ts`) passa a resolver o orçamento via query Drizzle em `orcamentos` (`eq(companyId)`+`eq(obraId)`+`isNull(deletedAt)`, `asc(id).limit(1)`), com nomes introspectados corretos; (2) NOVO endpoint `getSaldoFdTodasObras(companyId)` agrega por obra (orçado = soma `bdi_fd` do orçamento ativo; comprometido = soma `fdValor` das OCs `fd_cliente`; qtd OCs FD; saldo) + lista consolidada de OCs FD com nome da obra + totais; (3) `PainelFd.tsx` ganha a opção "Todas as obras" (sentinela -1, agora o DEFAULT) com 3 cards de totais + tabela "Saldo de FD por Obra" (botão "Detalhar") + tabela de OCs FD com coluna Obra; obra específica mantém a visão detalhada + estados vazios/erro explícitos. RESSALVA: correção de query + leitura/agregação + UI. ZERO ALTER/DROP/DELETE; ZERO schema novo; ZERO mutation. Validação: esbuild OK (`compras.ts`+`PainelFd.tsx`) + consultas ao Neon (37 OCs FD na company 60002; obra 12 → orçamento 57). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2816** — COMPRAS · PAINEL FD: HOTFIX (CONTINUAÇÃO 2814/2815) — PAINEL CONTINUAVA TOTALMENTE VAZIO (REVTE/OC-2026-339) porque `getSaldoFd` selecionava `comprasOrdens.descricao` (coluna inexistente; o campo livre é `observacoes`) → `db.select` LANÇAVA em runtime p/ TODAS as obras. FIX: select usa `observacoes`; payload mantém a chave `descricao`. (Necessário mas insuficiente — ver Rev. 2817/2818.) ZERO ALTER/DROP/DELETE; ZERO front. Detalhe: `shared/changelog.ts`.

- **Rev. 2815** — COMPRAS · PAINEL FD: HOTFIX (CONTINUAÇÃO DA REV. 2814) — OCs DE FAT. DIRETO NÃO APARECIAM QUANDO A OBRA NÃO TINHA ORÇAMENTO FD VINCULADO (REVTE-CIVIL). O `getSaldoFd` fazia EARLY-RETURN antes da query de `ocsComFd`; a lista foi MOVIDA p/ antes da checagem de orçamento e devolvida nos dois retornos. (Necessário mas insuficiente — ver Rev. 2816/2817.) ZERO ALTER/DROP/DELETE; ZERO front. Detalhe: `shared/changelog.ts`.

- **Rev. 2814** — COMPRAS · PAINEL FD: HOTFIX — OCs DE FATURAMENTO DIRETO CRIADAS DIRETO NA TELA DE ORDENS (SELO "FAT. DIRETO", `modalidadeFd='fd_fc'`) NÃO APARECIAM NO PAINEL FD. O `getSaldoFd` filtrava só `IN ('fd_cliente','fd_terceiro')`; passou a incluir `'fd_fc'`. (Necessário mas insuficiente — ver Rev. 2815/2816.) ZERO ALTER/DROP/DELETE; ZERO front. Detalhe: `shared/changelog.ts`.

- **Rev. 2813** — COMPRAS · ORDENS: HOTFIX (DADOS INCONSISTENTES) — NA OC O CAMPO "ORIGEM" MOSTRAVA "Cotação #<id>" USANDO O ID INTERNO (ex.: "Cotação #433"), QUE NÃO BATE COM O NÚMERO VISÍVEL (`COT-2026-0292`). FIX: `listarOrdens` passou a expor `cotacaoNumero` (busca em LOTE o `numeroCotacao`); os 3 pontos de exibição da "Origem" em `Ordens.tsx` usam `formatNumeroCotacaoDisplay` (`COT-NNNN-AAAA`). Só EXIBIÇÃO. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2812** — COMPRAS · ORDENS: HOTFIX — AO CLICAR EM "EDITAR OC" O VÍNCULO DA ETAPA (EAP) SE PERDIA (SELETOR "SELECIONAR ETAPA DO ORÇAMENTO" ABRIA VAZIO) EM OCs ORIUNDAS DE COTAÇÃO. CAUSA: os 2 caminhos de criação de OC a partir de cotação (`criarOrdemDeCotacao`/`criarOCsParciais`) inseriam itens sem `insumoCodigo` (a etapa vive na SC, `comprasSolicitacoesItens.eapCodigo`). FIX: `getOrdem` herda `eapCodigo` da SC na leitura (conserta OCs existentes) + os dois caminhos passam a gravar `insumoCodigo` na criação. ZERO ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

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
