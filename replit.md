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


- **Rev. 2564** — **ALMOXARIFADO · EQUIPAMENTOS PRÓPRIOS · MODAL "EDITAR EQUIPAMENTO" · PICKER "OBRA ATUAL" PASSA A APARECER SEMPRE (TAMBÉM NA EDIÇÃO).** User: "precisa ter a opção de indicar a obra que o equipamento está..." (screenshot do modal da "PISTOLA FINCA PINO - ANCORA", status "Disponível"). CAUSA: o picker "Obra atual" (`<select>` consumindo `trpc.obras.listForAlmoxarifado`) JÁ existia em `client/src/pages/equipamentos/Proprios.tsx`, mas na EDIÇÃO só renderizava se `form.status==="em_obra"` (condição `(form.status === "em_obra" || !editingId)`) → equipamento "Disponível" escondia o picker, forçando o user a clicar "Em obra" antes pra poder indicar a obra. FIX (não-destrutivo, SÓ CLIENT): condição de render trocada pra sempre verdadeira (`{(`) → picker "Obra atual" visível SEMPRE (cadastro E edição, qualquer status). A lógica de coerência já existente no `onChange` do `<select>` cuida do resto (escolher obra ⇒ status "Em obra" automático; limpar `— Almoxarifado (sem obra) —` ⇒ "Disponível"); texto de ajuda passou a aparecer em ambos os modos quando `status≠em_obra`. Servidor INTOCADO: `proprioCriar`/`proprioAtualizar` (`server/routers/equipamentos.ts`) já aceitam/validam `localizacaoAtualObraId`/`localizacaoAtualTipo` (obra da mesma empresa) e colunas `localizacao_atual_tipo`/`localizacao_atual_obra_id` já existem no schema. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2563** — **RH & DP · AVISO PRÉVIO · CARD "AVISOS PRÉVIOS EM ANDAMENTO" (PainelRH/Home) · "ÚLTIMO DIA TRABALHADO" CALCULADO AUTOMATICAMENTE NA REDUÇÃO DE 7 DIAS CORRIDOS (Art. 488 CLT).** User: "preciso que tenha o último dia de trabalho — se optar por redução de 2h segue normal os dias, porém se definir redução dos 7 dias a data do último dia trabalhado deve ser calculada automaticamente." REGRA (aviso TRABALHADO do empregador): redução 2h/dia → trabalha todos os dias (último dia = `dataFim`); redução 7 dias corridos → dispensado nos últimos 7 dias (último dia = `dataFim − 7`). CAUSA: o card (`client/src/pages/PainelRH.tsx` L411-417) renderiza `a.ultimoDiaTrabalhado` vindo de `homeData.avisosPrevios`; o cálculo em `server/routers/homeData.ts` (L604-618) só cobria `dataDesligamentoEfetiva` / indenizado (`dataInicio−1`) / trabalhado (`dataFim`), SEM olhar `reducaoJornada` → aviso com redução de 7 dias mostrava último dia = término (errado). O cálculo `dataFim−7` JÁ existia e correto em `server/db.ts` (L2032/2585/3068), `AvisoPrevio.tsx` (L2731-2734, tabela L1177) e `DashAvisoPrevio.tsx` (L1242-1244) — era inconsistência só do card. FIX (não-destrutivo, só leitura/cálculo no server): novo ramo em `homeData.ts` — sem `dataDesligamentoEfetiva`, não-indenizado e `reducaoJornada==='7_dias_corridos'` → último dia = `dataFim−7`; 2h/dia e "nenhuma" seguem no `else` (=`dataFim`). Bônus: `diasRestantes` (usa `ultimoDiaTrabalhadoStr`) passa a contar até o último dia EFETIVO. `reducaoJornada` já vinha no `db.select().from(terminationNotices)` (L592) → zero query nova. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2562** — OBRAS · EFETIVO · DIALOG "EQUIPE" (`/obras/efetivo`) · (1) HARDENING DO TOAST DE REMOÇÃO + (2) DIAGNÓSTICO "DARCY DUPLICADO". (1) Erro "Unexpected end of JSON input" = corpo VAZIO no `httpBatchLink` (worker do `tsx watch` reiniciando), padrão das Rev. 2558/2559 — não é bug de lógica/SQL. FIX (só CLIENT `ObraEfetivo.tsx`): `isTransientNetErr(err)` + no `onError` do `removeMut`, em erro transitório, refetch da lista (remoção idempotente) + `toast.warning` acionável; erros reais seguem mostrando msg. (2) "DARCY DUPLICADO" (Neon): não viola o invariante 1-func-1-obra; são DOIS CADASTROS da MESMA pessoa em 2 empresas (60002/60005) na mesma obra. LIMPEZA (autorizada, SÓ UPDATE/INSERT): script tsx manteve o cadastro da empresa DONA da obra e desativou (`isActive=0`+'saida') a alocação da OUTRA nos 3 casos mesma-obra; pós=0. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2561** — ALMOXARIFADO · EQUIPAMENTOS PRÓPRIOS · FIX "ERRO FEIO" (PAREDÃO DE BASE64) AO CADASTRAR/EDITAR EQUIPAMENTO PRÓPRIO (`/equipamentos`, `Proprios.tsx`). Toast gigante com dump base64 ilegível. CAUSA: fotos em BASE64 (`fotosJson`); INSERT do `proprioCriar` falhando re-lançava erro CRU do Drizzle (`"Failed query: <sql> params:..."` com base64); client fazia `toast.error(e.message)`. Verificação no Neon: banco aceita base64 até 30MB → o "erro feio" foi TRANSIENTE (restart do `tsx watch`) mascarado pelo dump. FIX (não-destrutivo): SERVER helpers `pgInfo(e)`+`cleanDbError(e,acao)` (TRPCError BAD_REQUEST curto pt-BR, nunca expõe SQL/base64) em `proprioCriar`/`proprioAtualizar`; CLIENT `errMsg(e)` detecta dump e mostra msg genérica. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2560** — OBRAS · EFETIVO · AUDITORIA + GARANTIA DEFINITIVA "1 FUNCIONÁRIO = 1 OBRA ATIVA". Auditoria no Neon: 0 funcionários com >1 alocação ativa (dados já limpos pela Rev. 2559); únicos writes que ativam `isActive=1` (`server/db.ts` `allocateEmployeeToObra` + `server/routers/dds.ts` vínculo CLT) já em transação + advisory lock. GARANTIA (não-destrutivo): `CREATE UNIQUE INDEX IF NOT EXISTS uniq_obra_func_active_employee ON obra_funcionarios("employeeId") WHERE "isActive"=1` (índice único parcial → impossível 2 ativas do mesmo funcionário) criado no Neon + no `SyncSchema+` de startup; `try/catch` traduz a unique violation `23505` em msg de domínio. Tripla camada: dados+app+DB. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2559** — OBRAS · EFETIVO · FIX FUNCIONÁRIOS DUPLICADOS NA OBRA (mesmo funcionário 2-3x na dialog "Equipe", rota `/obras/efetivo`) + LIMPEZA DOS DUPLICADOS EXISTENTES. CAUSA: `allocateEmployeeToObra` (`server/db.ts`) desativava só a 1ª alocação ativa e inseria nova sem transação → sob duplo-submit/concorrência acumulava várias `isActive=1`. FIX 1 (raiz, não-destrutivo): reescrita em `db.transaction` + `pg_advisory_xact_lock(employeeId)` desativando TODAS as ativas antes de inserir (idempotente, auto-cura dups); mesmo padrão no outro write (`server/routers/dds.ts`, vínculo CLT). FIX 2 (limpeza, SÓ UPDATE — ZERO DELETE): script tsx no Neon mantém a alocação mais recente e desativa as demais (4 linhas, recontagem pós=0). Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2558** — OBRAS · EFETIVO · FIX "Unexpected end of JSON input" AO REMOVER FUNCIONÁRIO DA OBRA (rota `/obras/efetivo`). Msg = `JSON.parse('')` do `httpBatchLink` (corpo VAZIO) — resposta cortada (worker em restart sob `tsx watch` / blip de rede), não bug de lógica/SQL. FIX (não-destrutivo): SERVER `removeEmployeeFromObra` passa a `return { success: true }` (payload garantido); CLIENT `ObraEfetivo.tsx` `removeMut` ganhou `retry` IDEMPOTENTE (até 2x, 800ms) SÓ em msgs transitórias (a função é idempotente `WHERE isActive=1` → 2ª chamada vira no-op). Erros reais não reexecutam. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

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
