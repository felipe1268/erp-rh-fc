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


- **Rev. 2562** — **OBRAS · EFETIVO · DIALOG "EQUIPE" (rota `/obras/efetivo`) · (1) HARDENING DO TOAST DE REMOÇÃO + (2) DIAGNÓSTICO DO "DARCY DUPLICADO".** User: "verifica o erro.. e precisa verificar que ainda tem funcionário duplicado.. veja o caso o darcy." (1) ERRO "Failed to execute 'json' on 'Response': Unexpected end of JSON input" = corpo de resposta VAZIO no `httpBatchLink` (worker do `tsx watch` reiniciando no meio do request / blip), MESMO padrão das Rev. 2558/2559 — NÃO é bug de lógica/SQL. Servidor já correto (`removeEmployeeFromObra` retorna `{success:true}`, idempotente `WHERE isActive=1`; `removeMut` já tinha `retry` 2x). Lacuna: ao esgotar os retries o `onError` exibia o `err.message` cru. FIX (não-destrutivo, só CLIENT `ObraEfetivo.tsx`): helper `isTransientNetErr(err)` + no `onError` do `removeMut`, em erro transitório, refetch da lista (remoção idempotente → pode ter concluído) + `toast.warning` acionável em vez do paredão; erros REAIS seguem mostrando msg. (2) "DARCY DUPLICADO" (verificação no Neon): NÃO viola o invariante "1 funcionário=1 obra ativa" da Rev. 2560 (índice é por `employeeId`; check global = 0 com >1 ativa). São DOIS CADASTROS DISTINTOS da MESMA pessoa em DUAS empresas do grupo, ambos na obra 90002 ("LUCIANA - FINAL BLOCO B", company 60002): emp 10 (60002 FC ENGENHARIA, status Aviso) + emp 1200004 (60005 JULIO FERRAZ, status Ativo); a dialog carrega por `obraId` e o efetivo é multi-empresa → os dois aparecem. PADRÃO: 11 pessoas com 2 cadastros ativos entre 60002/60005 (Darcy/Geraldo/Marcos com os 2 na MESMA obra). LIMPEZA (autorizada pelo user, SÓ UPDATE/INSERT — ZERO DELETE/ALTER/DROP): script tsx no Neon em transação manteve o cadastro da empresa DONA da obra e desativou (`isActive=0, dataFim=CURRENT_DATE` + 'saida' no `employee_site_history`) a alocação do cadastro da OUTRA empresa nos 3 casos mesma-obra (alocs 56/58/180007, todas 60005 JULIO FERRAZ em obras 60002 FC ENG); recontagem mesma-obra pós=0. Os outros 8 casos (obras diferentes) não tocados. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2561** — **ALMOXARIFADO · EQUIPAMENTOS PRÓPRIOS · FIX "ERRO FEIO" (PAREDÃO DE BASE64) AO CADASTRAR/EDITAR EQUIPAMENTO PRÓPRIO (rota `/equipamentos`, `Proprios.tsx`).** User: "quando eu tento cadastrar uma das ferramentas está dando esse erro para salvar" — toast gigante com paredão ilegível de base64 + dados do usuário, sem mensagem acionável. CAUSA-RAIZ do PAREDÃO: as fotos são salvas como BASE64 data URL (`FotosUploader` em `_shared.tsx`, `canvas.toDataURL`, resize ≤800px) em `fotosJson` (jsonb); quando o INSERT do `proprioCriar` (`server/routers/equipamentos.ts`) falhava por motivo NÃO-unique, ele re-lançava o erro CRU do Drizzle (`throw e`), cuja `.message` é o dump `"Failed query: <sql> params: <todos os params>"` — incluindo o base64 + `criadoPorUserId`/`criadoPorNome`. O `onError` do tRPC (`server/_core/index.ts`) só LOGA o motivo real, não reformata o que vai ao cliente; e o client fazia `toast.error(e.message)` → exibia o dump. VERIFICAÇÃO no Neon (script tsx via `NEON_DATABASE_URL`): todas as colunas existem e o INSERT com base64 de até 30MB passa SEM erro → banco aceita cadastro normal; o "erro feio" foi um erro TRANSIENTE (tentativa às 17:50 coincidiu com restarts do `tsx watch` da Rev. 2560, padrão idêntico à Rev. 2558) MASCARADO pelo dump cru. FIX (não-destrutivo, ZERO ALTER/DROP/DELETE): SERVER novos helpers `pgInfo(e)` (lê code/message do erro pg via `e.cause`) + `cleanDbError(e, acao)` (TRPCError BAD_REQUEST com msg curta/acionável pt-BR, NUNCA expõe SQL/params/base64; mapeia 22001/22003/23502/22P02/53400/57014) usados em `proprioCriar` (não-unique) e `proprioAtualizar` (UPDATE em try/catch); causa real segue logada. CLIENT helper `errMsg(e)` (defesa em profundidade): detecta dump (`Failed query`/`data:image/`/`;base64,` ou >300 chars) e mostra msg genérica, aplicado nos 3 `onError`. Zero schema. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2560** — OBRAS · EFETIVO · AUDITORIA + GARANTIA DEFINITIVA "1 FUNCIONÁRIO = 1 OBRA ATIVA". Auditoria no Neon: 0 funcionários com >1 alocação ativa (dados já limpos pela Rev. 2559); únicos writes que ativam `isActive=1` (`server/db.ts` `allocateEmployeeToObra` + `server/routers/dds.ts` vínculo CLT) já em transação + advisory lock. GARANTIA (não-destrutivo): `CREATE UNIQUE INDEX IF NOT EXISTS uniq_obra_func_active_employee ON obra_funcionarios("employeeId") WHERE "isActive"=1` (índice único parcial → impossível 2 ativas do mesmo funcionário) criado no Neon + no `SyncSchema+` de startup; `try/catch` traduz a unique violation `23505` em msg de domínio. Tripla camada: dados+app+DB. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2559** — OBRAS · EFETIVO · FIX FUNCIONÁRIOS DUPLICADOS NA OBRA (mesmo funcionário 2-3x na dialog "Equipe", rota `/obras/efetivo`) + LIMPEZA DOS DUPLICADOS EXISTENTES. CAUSA: `allocateEmployeeToObra` (`server/db.ts`) desativava só a 1ª alocação ativa e inseria nova sem transação → sob duplo-submit/concorrência acumulava várias `isActive=1`. FIX 1 (raiz, não-destrutivo): reescrita em `db.transaction` + `pg_advisory_xact_lock(employeeId)` desativando TODAS as ativas antes de inserir (idempotente, auto-cura dups); mesmo padrão no outro write (`server/routers/dds.ts`, vínculo CLT). FIX 2 (limpeza, SÓ UPDATE — ZERO DELETE): script tsx no Neon mantém a alocação mais recente e desativa as demais (4 linhas, recontagem pós=0). Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2558** — OBRAS · EFETIVO · FIX "Unexpected end of JSON input" AO REMOVER FUNCIONÁRIO DA OBRA (rota `/obras/efetivo`). Msg = `JSON.parse('')` do `httpBatchLink` (corpo VAZIO) — resposta cortada (worker em restart sob `tsx watch` / blip de rede), não bug de lógica/SQL. FIX (não-destrutivo): SERVER `removeEmployeeFromObra` passa a `return { success: true }` (payload garantido); CLIENT `ObraEfetivo.tsx` `removeMut` ganhou `retry` IDEMPOTENTE (até 2x, 800ms) SÓ em msgs transitórias (a função é idempotente `WHERE isActive=1` → 2ª chamada vira no-op). Erros reais não reexecutam. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2557** — **RH & DP · DASHBOARDS · DRILL-DOWN DE FUNCIONÁRIOS MOSTRA A FOTO DO FUNCIONÁRIO (ex.: "Admissões em MM/AAAA").** User: na tela de drill-down de `/dashboards/funcionarios` (ex.: "Admissões em 05/2026") a coluna NOME mostrava só o círculo azul com a INICIAL — queria a FOTO real. CAUSA: (1) `DrillDownModal.tsx` renderizava avatar fixo de inicial (`<div>{emp.nome?.charAt(0)}</div>`); (2) `getDrillDown` (`server/routers/dashboards.ts`, exposto como `dashboards.drillDown`) não projetava `employees.fotoUrl` no SELECT, então a foto nem chegava ao client. FIX (não-destrutivo, só leitura/UI): SERVER adicionou `fotoUrl: employees.fotoUrl` ao `db.select` de `getDrillDown` (coluna já existente; schema intocado; nenhuma outra query afetada). CLIENT novo subcomponente `EmpAvatar({src,nome})` que renderiza `<img>` rounded-full/object-cover/lazy quando há `fotoUrl`, com FALLBACK para o círculo da inicial quando vazio OU quando a imagem falha (`onError`→estado local). Vale p/ todos os drill-downs (status/sexo/setor/função/admissão/demissão). Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

- **Rev. 2556** — **RH & DP · AVISO PRÉVIO / CUSTO DE DEMISSÃO EM MASSA · FÉRIAS VENCIDAS JÁ PAGAS NÃO INFLAM MAIS O CUSTO POR FUNCIONÁRIO.** No CDM o custo de cada encarregado contava férias vencidas JÁ PAGAS como em aberto. FIX (só SQL de leitura): `AND ("dataPagamento" IS NULL OR "dataPagamento" > <cutoff>)` nos 8 sites de contagem/listagem de vencidas (1× `dashboards.ts` `vpCountByEmp`; 7× `avisoPrevioFerias.ts`), preservando paridade CDM × modal Aviso Prévio. Override sempre do banco. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

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
