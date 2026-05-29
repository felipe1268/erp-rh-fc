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


- **Rev. 2560** — **OBRAS · EFETIVO · AUDITORIA + GARANTIA DEFINITIVA "1 FUNCIONÁRIO = 1 OBRA ATIVA" (mesmo funcionário NÃO pode estar em 2 obras ao mesmo tempo).** User: "auditoria no ERP pra garantir que o mesmo funcionário não pode estar em 2 obras ao mesmo tempo... resolva isso de vez, e garanta que isso não irá acontecer." Segue a Rev. 2559. AUDITORIA (script tsx no Neon via `NEON_DATABASE_URL`): 0 funcionários com >1 alocação ativa, 0 cross-obra, 132 ativas totais — dados JÁ limpos pela Rev. 2559. AUDITORIA DE CÓDIGO: os ÚNICOS writes que ativam (`isActive=1`) são `server/db.ts` (`allocateEmployeeToObra`) e `server/routers/dds.ts` (vínculo CLT), ambos já em `db.transaction` + `pg_advisory_xact_lock` desativando TODAS as ativas antes de inserir; os demais writes só desativam (`isActive=0`: `removeEmployeeFromObra`, `avisoPrevioFerias.darBaixa`, fechar obra em `routers.ts`). GARANTIA DEFINITIVA (não-destrutivo, ZERO ALTER/DROP/DELETE): `CREATE UNIQUE INDEX IF NOT EXISTS uniq_obra_func_active_employee ON obra_funcionarios("employeeId") WHERE "isActive" = 1` — índice único PARCIAL (mesmo padrão de `uniq_resp_estoque_principal` Rev. 2429.1) que torna IMPOSSÍVEL 2 alocações ativas do mesmo funcionário a nível de banco; qualquer write futuro fora do padrão FALHA com unique violation em vez de duplicar. Criado imediatamente no Neon (dados limpos → OK, verificado) + adicionado ao `SyncSchema+` de startup (`server/_core/index.ts`, bloco Rev. 2560, `IF NOT EXISTS`, boot verificado no log) → persiste em todo boot/deploy. UX (rec. do code review): `allocateEmployeeToObra` (`server/db.ts`) e o vínculo CLT (`server/routers/dds.ts`) ganharam `try/catch` que traduz a unique violation `23505` deste índice numa mensagem de domínio clara ("funcionário já alocado em outra obra…") — Error no db.ts, `TRPCError CONFLICT` no dds.ts; erros não-23505 re-lançados. Tripla camada: dados limpos + app-level (lock/transação) + DB-level (índice). Zero schema de tabela. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2559** — **OBRAS · EFETIVO · FIX FUNCIONÁRIOS DUPLICADOS NA OBRA (mesmo funcionário 2-3x na dialog "Equipe", rota `/obras/efetivo`) + LIMPEZA DOS DUPLICADOS EXISTENTES.** User: na obra "HOTEL DO PAPA" vários repetidos (DESILDO 2x, GERALDO 3x, mesma data 26/05/2026). CAUSA-RAIZ: `allocateEmployeeToObra` (`server/db.ts`) lia/desativava só a PRIMEIRA alocação ativa (`const [alocAnterior] = ...isActive=1`) e inseria nova linha ativa — sem transação e sem garantir "≤1 alocação ativa por funcionário". Sob duplo-submit (usuário reclica "Alocar/Transferir" ao ver o erro transitório "Unexpected end of JSON input" da Rev. 2558) ou requisições concorrentes, acumulavam-se múltiplas `isActive=1`, inflando a dialog "Equipe" e a contagem de efetivo. FIX 1 (raiz, não-destrutivo): `allocateEmployeeToObra` reescrita dentro de `db.transaction` + `pg_advisory_xact_lock(employeeId)` (serializa concorrência do mesmo funcionário sob READ COMMITTED) + desativa TODAS as ativas do funcionário (não só a 1ª, `orderBy` determinístico p/ histórico) → idempotente e AUTO-CURA dups; `transferirFuncionariosEmLote` herda o fix. Mesmo padrão aplicado ao OUTRO caminho de escrita (`server/routers/dds.ts`, vínculo colaborador↔obra do DDS) que inseria/reativava direto e podia criar duplicata cross-obra — invariante fechado nos dois únicos writes que ativam `isActive=1` (code review PASS). FIX 2 (limpeza dos existentes, SÓ UPDATE — permitido R-001/R-007/R-010, ZERO DELETE): script tsx pontual no Neon (`NEON_DATABASE_URL`; `executeSql` aponta pro Postgres local VAZIO) em transação — mantém a alocação mais recente (`ORDER BY dataInicio DESC, id DESC`, pois os `id` não são monotônicos com a data) e desativa as demais (`isActive=0, dataFim=CURRENT_DATE`); 4 linhas corrigidas (emp 13/15/420076/420105), recontagem pós = 0. Validação esbuild OK. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2558** — OBRAS · EFETIVO · FIX "Unexpected end of JSON input" AO REMOVER FUNCIONÁRIO DA OBRA (rota `/obras/efetivo`). Msg = `JSON.parse('')` do `httpBatchLink` (corpo VAZIO) — resposta cortada (worker em restart sob `tsx watch` / blip de rede), não bug de lógica/SQL. FIX (não-destrutivo): SERVER `removeEmployeeFromObra` passa a `return { success: true }` (payload garantido); CLIENT `ObraEfetivo.tsx` `removeMut` ganhou `retry` IDEMPOTENTE (até 2x, 800ms) SÓ em msgs transitórias (a função é idempotente `WHERE isActive=1` → 2ª chamada vira no-op). Erros reais não reexecutam. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2557** — **RH & DP · DASHBOARDS · DRILL-DOWN DE FUNCIONÁRIOS MOSTRA A FOTO DO FUNCIONÁRIO (ex.: "Admissões em MM/AAAA").** User: na tela de drill-down de `/dashboards/funcionarios` (ex.: "Admissões em 05/2026") a coluna NOME mostrava só o círculo azul com a INICIAL — queria a FOTO real. CAUSA: (1) `DrillDownModal.tsx` renderizava avatar fixo de inicial (`<div>{emp.nome?.charAt(0)}</div>`); (2) `getDrillDown` (`server/routers/dashboards.ts`, exposto como `dashboards.drillDown`) não projetava `employees.fotoUrl` no SELECT, então a foto nem chegava ao client. FIX (não-destrutivo, só leitura/UI): SERVER adicionou `fotoUrl: employees.fotoUrl` ao `db.select` de `getDrillDown` (coluna já existente; schema intocado; nenhuma outra query afetada). CLIENT novo subcomponente `EmpAvatar({src,nome})` que renderiza `<img>` rounded-full/object-cover/lazy quando há `fotoUrl`, com FALLBACK para o círculo da inicial quando vazio OU quando a imagem falha (`onError`→estado local). Vale p/ todos os drill-downs (status/sexo/setor/função/admissão/demissão). Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2556** — **RH & DP · AVISO PRÉVIO / CUSTO DE DEMISSÃO EM MASSA · FÉRIAS VENCIDAS JÁ PAGAS NÃO INFLAM MAIS O CUSTO POR FUNCIONÁRIO.** No CDM o custo de cada encarregado contava férias vencidas JÁ PAGAS como em aberto. FIX (só SQL de leitura): `AND ("dataPagamento" IS NULL OR "dataPagamento" > <cutoff>)` nos 8 sites de contagem/listagem de vencidas (1× `dashboards.ts` `vpCountByEmp`; 7× `avisoPrevioFerias.ts`), preservando paridade CDM × modal Aviso Prévio. Override sempre do banco. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2555** — ALMOXARIFADO · EQUIPAMENTOS PRÓPRIOS · PICKER "OBRA ATUAL" SÓ MOSTRA OBRAS EM ANDAMENTO E PERMITIDAS AO USUÁRIO. User (seguimento da Rev. 2554): "só deve aparecer as obras que estão em status de andamento, e que o usuário tem permissão de acesso." CAUSA: picker usava `trpc.obras.list` (TODAS as obras, sem filtro de permissão/status) + filtro client inócuo. FIX (não-destrutivo): CLIENT `Proprios.tsx` troca para `trpc.obras.listForAlmoxarifado` (respeita permissão + só `status='Em_Andamento'`/`isActive=1`/`deletedAt IS NULL`); SERVER `obras.listForAlmoxarifado` ganhou `AND o.status='Em_Andamento'` no branch `allowed_obra_ids`. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2554** — ALMOXARIFADO · EQUIPAMENTOS PRÓPRIOS · INDICAR A OBRA DIRETO NO CADASTRO DO ITEM. No modal "Novo Equipamento" o seletor de obra (Rev. 2514) só aparecia com `status==="em_obra"` (nascido "Disponível") — escondido. FIX (client puro `Proprios.tsx`): picker passa a `form.status === "em_obra" || !editingId` (no cadastro aparece SEMPRE); `onChange` auto-ajusta status (obra⇒"em_obra"; limpar⇒"disponivel"); label dinâmico, opção "— Almoxarifado (sem obra) —" e hint. Server intocado. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

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
- **REGRA DE OURO — CAMINHO B (Rev. 2533+, substitui Rev. 2427).** FONTE ÚNICA = coluna `PercentComplete` do MS Project, lida nos dois momentos:
  - **% PREVISTO** (raiz e atividades) = EXPANSÃO de `PercentComplete` sobre `BaselineStart`/`BaselineFinish` pela fórmula nativa do MSP `floor(((cutoff − BL_Start) / (BL_Finish − BL_Start)) * 100)`, gerada uma vez no `salvarAtividades` (cadastro do cronograma) e congelada em `planejamento_projetos.previsto_semanas_json`. Matematicamente idêntico a varrer "Data do Status" no MSP semana a semana (Caminho A) — mesma fórmula, mesmo resultado, sem o trabalho repetido.
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **Mesma coluna nos dois momentos** = paridade matemática absoluta MSP × ERP. Sem `Texto6`/`Texto10`/`Texto11` (continuam sendo gravados em `previsto_msp_pct` por atividade só pra retrocompat — leitura desativada).
  - Snapshot é regenerado SÓ no `salvarAtividades` (substituir/cadastro). Mudou baseline = nova revisão = novo snapshot. Avanço semanal NÃO regenera (baseline é imutável dentro da revisão).
  - Implementação: `server/routers/planejamento.ts` (helper `regenerarPrevistoSemanasCaminhoB` L96-203 + chamada pós-transaction em `salvarAtividades`), `client/src/pages/planejamento/ImportarCronograma.tsx` (parser `<Baseline Number=0>` L470-490).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
