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


- **Rev. 2542** — **ALMOXARIFADO · INVENTÁRIO VISUAL (BAIAS) · OBRAS NÃO APARECIAM PARA USUÁRIOS ALOCADOS.** User: Wesley e Leonardo não viam NENHUMA obra no dropdown da guia Baias (lista vazia). CAUSA: a tela mostra `obrasComItem` = INTERSEÇÃO de `obrasAtivas` (vinha de `obras.listActive`) com as obras que têm baia (`warehouse.baiaAgregadosListar({obraId:null})`); AMBAS filtravam por `getEffectiveAllowedObraIds`/`userCanAccessObra`, que reconhecem obra só via grupo `acesso_todas_obras`, `allowed_obra_ids` ou onde o user é RESPONSÁVEL — IGNORANDO alocação via `obra_funcionarios`. Membro de equipe alocado (não-responsável, sem allowed_obra_ids) recebia conjunto vazio nas duas pontas → dropdown vazio; e qualquer operação de baia (criar/registrar leitura/etc.) daria FORBIDDEN. FIX EM 2 FRENTES: (1) CLIENT `InventarioVisual.tsx`: `listActive`→`listForAlmoxarifado` (inclui alocação; já usado pela Visão Geral). (2) SERVER: novos helpers allocation-aware ESPECÍFICOS do almox em `server/db.ts` — `getAlmoxAllowedObraIdSet` (= `getEffectiveAllowedObraIds` ∪ alocação `obra_funcionarios` por e-mail) e `userCanAccessObraAlmox`; aplicados em `warehouse.ts` no `baiaAgregadosListar` (branch null usa o set; branch específico) + nas 7 mutations de baia (criar/editar/desativar/listar-leituras/registrar/deletar/autoEnsure). Guard SEM fallback "todas obras" (ausência de vínculo ⇒ nega = seguro). NÃO alterado: `getEffectiveAllowedObraIds`/`userCanAccessObra` (autorização global do ERP), transferências/empréstimos do warehouse, Inventário Semanal (`Inventario.tsx`, mesmo bug — deixado p/ confirmação do user). Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2541** — **PERMISSÕES · PROPAGAÇÃO DE MELHORIAS PARA TODOS OS USUÁRIOS COM ACESSO AO MÓDULO.** User: melhorias estavam "seletivas" — features novas não apareciam para todos que têm acesso ao módulo. CAUSA: no nível `custom` do module_access, a visibilidade de cada página depende do `pageId` estar PRESENTE com `view:true` no JSON salvo; ao adicionar uma página/aba NOVA, esse `pageId` não existe no JSON dos usuários custom (configurado antes da feature) → `canViewPage`/`groupCanAccessRoute` caíam em default-deny. Como toda perm custom NASCE completa (`defaultPagesForLevel`), ausência ⇒ "feature nova", não "negada de propósito" (negação grava `{view:false}`, fica presente). FIX (`client/src/contexts/PermissionsContext.tsx`): página AUSENTE herda o acesso ao módulo (visível) em `canViewPage` e nas duas branches de `groupCanAccessRoute` — mas SÓ quando o módulo está efetivamente acessível (gate `some(p.view)`, idêntico a `canAccessModule`); presente respeita o flag. Gate fecha a brecha (apontada no code review) de um custom com TUDO negado abrir rota nova por URL direta. Ações de ESCRITA seguem default-deny. NÃO mudou: `canAccessModule` (custom com tudo negado não ganha módulo por página nova), negações explícitas, guard server-side de obra do Raio-X (Rev. 2539), `sensitiveHidden` LGPD, e módulos NOVOS (exigem concessão explícita). Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2540** — FINANCEIRO · CONTA BANCÁRIA NA BAIXA (Contas a Pagar E Receber). Ao dar baixa faltava informar em qual conta bancária o dinheiro saiu/entrou. FIX: `updateEntryStatus`/`registrarRecebimento` ganharam `contaBancariaId` (COALESCE), nova coluna `financial_revenue.conta_bancaria_id` via SyncSchema+, prefill nos clients Contas a Pagar/Receber. Ver `shared/changelog.ts`.

- **Rev. 2539** — LGPD · RAIO-X DO COLABORADOR · GUARD SERVER-SIDE DE OBRA NO DOSSIÊ. `docs.raioX` não tinha guard de obra; qualquer user puxava o dossiê de qualquer colaborador por ID. FIX: helpers `getUserModuleAccessMap`/`userIsRhOrAdmin`/`userCanAccessEmployeeDossier` em `server/db.ts` + guard `FORBIDDEN` em `controleDocumentos.ts`. Ver `shared/changelog.ts`.

- **Rev. 2538** — COMPRAS · ORDENS · CORREÇÃO DO "classificarNaturezaItemAlmox is not defined" (re-export ESM sem binding local). `server/routers/compras.ts` L93 fazia RE-EXPORT puro que não cria binding local; bundle prod (esbuild) gerava ReferenceError em `atualizarStatusOrdem`. FIX: `import` + `export` separados. Ver `shared/changelog.ts`.

- **Rev. 2537** — FERRAMENTAS DE TERCEIROS · CORREÇÃO DO "Acesso negado: empresa não autorizada". Módulo Almoxarifado › Ferramentas › Terceiros aparecia VAZIO; prod logava em loop nos 9 procedures. CAUSA: guard `assertSameCompany` (Rev. 1884) comparava coluna única `ctx.user.companyId === input.companyId`, mas o ERP é multi-empresa (governado por `user_companies`). FIX: `assertSameCompany`→`assertCompanyAccess` (async) espelhando `terceiros._assertCompanyAccess`; 9 callsites com `await`. `server/routers/ferramentasTerceiros.ts`. Ver `shared/changelog.ts`.
- **Rev. 2536** — EQUIPAMENTOS PRÓPRIOS · CORREÇÃO DA LISTAGEM QUEBRADA. Tela Almoxarifado › Equipamentos › Próprios voltava vazia (`equipamentos.propriosListar: invalid reference to FROM-clause entry for table "equipamentos_proprios"`). CAUSA: query usava alias `FROM equipamentos_proprios ep` mas WHERE Drizzle (`companyFilter`/`eq`) qualifica pelo NOME REAL → no Postgres o nome original deixa de ser referência válida. FIX: removido alias `ep`; SELECT/JOIN/ORDER BY usam `equipamentos_proprios`. `server/routers/equipamentos.ts` ~L269. Ver `shared/changelog.ts`.

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
