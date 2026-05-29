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


- **Rev. 2553** — **ALMOXARIFADO · EQUIPAMENTOS LOCADOS · "TROCAR FORNECEDOR" POR ITEM (painel de detalhes).** User: "não consigo trocar o fornecedor — o martelete de 16KG é da Minas Locc mas está marcado como nosso (FC Engenharia)". CAUSA: a procedure `locadoAtualizar` NÃO aceitava/gravava `fornecedorNome` (só obra/status/datas/etc.) e o painel de detalhes mostrava o fornecedor só como texto; o único caminho era o rename em LOTE (Rev. 2518), que sobrescreve TODAS as unidades de uma locadora — inadequado p/ corrigir 1 item entre vários fornecedores. FIX/FEATURE (não-destrutivo): SERVER `locadoAtualizar` ganhou input `fornecedorNome` (nullable opcional), normaliza (trim/null) e grava; após o UPDATE sincroniza `almoxarifado_itens.fornecedor_locacao` do item vinculado (try/catch, não-bloqueante); tenant preservado (UPDATE filtra companyId). CLIENT `Locados.tsx`: estado `editForn` + `atualizarLocadoMut` (onSuccess invalida `locadosListar`, atualiza o modal aberto via variables, toast); na seção "Fornecedor" do painel, botão "Trocar" (Pencil) abre edição inline com input + `<datalist>` das locadoras em uso + Salvar/Cancelar — atinge só o id aberto. Coluna `fornecedorNome` já existia. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2552** — **ALMOXARIFADO · EQUIPAMENTOS PRÓPRIOS · FIX "(intermediate value) is not iterable" AO SALVAR NOVO + CAMPO "OBRA ATUAL" NO CADASTRO.** User: (1) "Salvar" no cadastro de NOVO equipamento dava erro "(intermediate value) is not iterable"; (2) faltava indicar em qual OBRA o equipamento está já na criação (só existia na edição). CAUSA (bug #1): driver é `drizzle-orm/node-postgres`, onde `db.execute()` retorna QueryResult `{ rows }` (NÃO array). `proximoCodigoPatrimonio` fazia `const [row] = await db.execute(...)` → desestruturação de não-iterável → crash logo no início de `proprioCriar` (antes do INSERT). Mesmo padrão em `propriosListar` (`(result as any[]).map`) deixava a LISTA vazia em silêncio. FIX (server, não-destrutivo): ambos leem via `(res?.rows ?? res ?? [])`. FEATURE (bug #2): `proprioCriar` (input zod) passou a aceitar `status` + `localizacaoAtualObraId` (opcionais); baseVals usa `input.status ?? "disponivel"` com a MESMA coerência da edição (só "em_obra" grava obra; senão almoxarifado/null). Client `Proprios.tsx`: seletor Status + picker Obra (antes só em `editingId`) agora também no cadastro; auditoria "Cadastrado por…" segue edit-only; `salvar()` no ramo criar valida obra obrigatória quando "em_obra". Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2551** — RH & DP · NOVA FEATURE "CONVENÇÃO COLETIVA (IA)". Aba nova (seção Inteligência Artificial) onde o RH sobe o PDF da CCT/circular do sindicato → a IA lê e extrai TODAS as mudanças (% reajuste, piso, VA/VR/VT, cesta/café, seguro de vida, adicionais, contribuição assistencial, data-base, sindicato, nº CCT, vigência) → relatório/diff REVISÁVEL → simulação por funcionário → aplicação em massa, auditoria por funcionário/campo, status (analisado→aplicado), sem reaplicar e histórico por ano. IA: `extrairCctComIA` (`invokeAnthropicVision` PDF base64 → fallback `invokeGeminiVision`; SEM fallback silencioso). SALÁRIO pelo MOTOR DE DISSÍDIO existente (Art. 468 não-regressão); BENEFÍCIOS pelas colunas de `employees`. SCHEMA: `convencao_analises` + `convencao_analise_itens` via `CREATE TABLE IF NOT EXISTS` — ZERO ALTER/DROP/DELETE. Backend `server/routers/convencaoIA.ts`; client `ConvencaoColetivaIA.tsx`. Ver `shared/changelog.ts`.

- **Rev. 2550** — ALMOXARIFADO · INVENTÁRIO SEMANAL · REMOÇÃO DA BUSCA/SCANNER DE CÓDIGO DE BARRAS — "VOLTA COMO ESTAVA" (PRÉ-REV. 2530). User: "cancela a opção de código de barras para o módulo de inventário, volta como estava." Removida por completo a caixa de busca/leitor (input com `ScanLine`/limpar/legenda) do bloco `{session.status === "em_andamento" && (...)}` em `Inventario.tsx`; removidos `[busca,setBusca]`/`buscaRef`; `pendentes`/`finalizados` voltam a derivar direto de `sessionItems.filter(...)` (sem `useMemo`/`norm`/`filterFn`); imports órfãos limpos (`useMemo`/`useRef`, `Search`/`ScanLine`/`X`). Rules of Hooks OK. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2549** — ALMOXARIFADO · INVENTÁRIO SEMANAL · "INICIAR INVENTÁRIO NÃO FUNCIONA" — FIX DO CRASH QUE IMPEDIA A LISTA DE ITENS DE CARREGAR. `warehouse.getInventorySessionItems` projetava `itemCodigoBarras: almoxarifadoItens.codigoBarras` (Rev. 2530), mas a coluna `codigo_barras` NÃO existe em `almoxarifado_itens` → `undefined` → Drizzle "Cannot convert undefined or null to object" em toda chamada → itens nunca carregavam. FIX (não-destrutivo): removida a projeção no server + refs mortas no client `Inventario.tsx`; busca por `itemCodigoInterno`. Sem DELETE. Zero schema. Ver `shared/changelog.ts`.

- **Rev. 2548** — ATESTADOS · AFASTAMENTO POR HORAS · CLAREZA NA FICHA DO RAIO-X (TELA + PDF). User: pediu que o atestado "de horas" (afastamento parcial, ex.: 0h48min) fique claro no cadastro E na ficha do Raio-X; no print a tabela de Atestados mostrava "Dias Afastamento 0" para todo atestado de horas. SITUAÇÃO: o CADASTRO já suportava horas (toggle "Dia(s) inteiro(s)"/"Horas (parcial)" + input HH:MM em `ControleDocumentos.tsx`; schema `atestados` já tinha `afastamentoTipo`/`horasAfastamento`; `docs.raioX` já devolvia via select() completo) — o gap era só a EXIBIÇÃO. FIX (client puro, `RaioXFuncionario.tsx`): helpers `fmtHorasAfast`(decimal→"Xh Ymin" com carry de 60min) e `fmtAfastamentoAtestado`(horas ou "N dia(s)"); coluna "Dias Afastamento"→"Afastamento" mostrando BADGE âmbar com `Clock`+"Xh Ymin" quando `afastamentoTipo==='horas'`, senão "N dia(s)"; PDF (`generateHTML`) com a mesma coluna e sufixo "(horas)". Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2546** — ALMOXARIFADO · INVENTÁRIO SEMANAL · FIX "Rendered more hooks than during the previous render" (CRASH DA TELA). EARLY RETURN `if(loadingSession)` estava ANTES de dois `useMemo` (pendentes/finalizados) → ao resolver a query rodavam mais hooks que no render anterior. FIX: early return movido para DEPOIS de todos os hooks (após `nomeContexto`). `client/src/pages/almoxarifado/Inventario.tsx`. Ver `shared/changelog.ts`.

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
