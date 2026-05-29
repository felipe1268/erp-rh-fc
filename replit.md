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


- **Rev. 2547** — **RAIO-X DO COLABORADOR · VISUALIZAR DOCUMENTO (ATESTADOS) · FIX "Rendered more hooks than during the previous render" (CRASH DA TELA).** User: ao clicar para ver os atestados a tela quebrava com "Ocorreu um erro inesperado — Rendered more hooks…" (stack `DocumentPreviewDialog.tsx:14` ← `RaioXFuncionario.tsx:181`). CAUSA (Rules of Hooks): em `DocumentPreviewDialog.tsx` o early return `if (!fileUrl || !fileName) return null;` estava ENTRE os dois `useEffect` (após o 1º de reset de zoom, antes do 2º de atalhos de teclado) — sem arquivo o componente retornava cedo e o 2º useEffect não rodava; com arquivo passava a rodar → React detecta mais hooks que no render anterior e derruba a árvore. FIX: (1) early return MOVIDO para depois de todos os hooks (após o 2º useEffect); (2) `showPdf`/`showImage` guardados com `!!(fileUrl && fileName) && …` (são lidos pelo 2º useEffect via deps); (3) `handleDownload` ganhou guard `if(!fileUrl) return;`. `client/src/components/DocumentPreviewDialog.tsx`. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2546** — **ALMOXARIFADO · INVENTÁRIO SEMANAL · FIX "Rendered more hooks than during the previous render" (CRASH DA TELA).** User: a tela Almoxarifado › Inventário quebrava com "Ocorreu um erro inesperado — Rendered more hooks…" (stack `Inventario.tsx:395`). CAUSA (Rules of Hooks): havia um EARLY RETURN `if (loadingSession) return <Loader/>` ANTES de dois `useMemo` (pendentes/finalizados) — no 1º render (loading=true) os useMemo não rodavam; ao resolver a query (loading=false) passavam a rodar → React detecta mais hooks que no render anterior e derruba a árvore. FIX: early return de loading MOVIDO para DEPOIS de todos os hooks (logo antes do `return` principal, após `nomeContexto`); ordem/qtd de hooks idêntica em todo render. Nenhuma lógica de dados mudou. `client/src/pages/almoxarifado/Inventario.tsx`. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2545** — RAIO-X · TIMELINE · MOSTRAR SOMENTE EVENTOS QUE JÁ PASSARAM (OCULTAR FUTUROS/AGENDADOS). Timeline do dossiê exibia eventos FUTUROS (férias programadas, retorno previsto). FIX (server `controleDocumentos.ts`, após o sort final ~L2222): `hojeStr` = hoje `YYYY-MM-DD` no fuso "America/Sao_Paulo" (`toLocaleDateString("en-CA",{timeZone})`); filtra `timelinePassados` mantendo só `raw.slice(0,10) <= hojeStr` quando casa `^\d{4}-\d{2}-\d{2}` (vazias/legado DD/MM/AAAA mantidas). Outras abas do dossiê intactas. Ver `shared/changelog.ts`.

- **Rev. 2544** — RAIO-X · TIMELINE · MODAL DE DETALHE · REDESIGN MODERNO (SEM ROLAGEM HORIZONTAL) + FIX DE DATA/HORA. Modal do evento (Rev. 2543) exigia rolagem horizontal e o print (DDS #32) mostrava "Assinado Em" embaralhado ("28 00:28:36.47334/05/2026"). CAUSA: `formatDate` LOCAL (L30) faz `split("-")` ingênuo que quebra timestamps. FIX: helper `fmtDateSmart` (data-only→DD/MM/AAAA; timestamp→DD/MM/AAAA HH:mm; senão crua) usado em `fmtVal`/cabeçalho. REDESIGN: DialogContent `overflow-x-hidden rounded-2xl`, cabeçalho gradiente + pill, pares viraram TILES responsivos (`grid sm:grid-cols-2`, `min-w-0`/`truncate`/`break-words`). LGPD da 2543 mantida. `RaioXFuncionario.tsx`. Ver `shared/changelog.ts`.

- **Rev. 2543** — RAIO-X · TIMELINE · (1) BUG da CONFIRMAÇÃO DE HE FANTASMA + (2) RASTREABILIDADE (timeline clicável → modal). Timeline mostrava "HE — Assinatura Confirmação" fantasma; pedido de cada item clicável abrindo modal com todos os dados. CAUSA: `heSolicitacoes.editar` apaga/reinsere `he_solicitacao_funcionarios` mas nunca remove `he_solicitacao_confirmacoes` → confirmação órfã; `empHeConfirmacoes` lia por employeeId sem filtrar status da solicitação-mãe nem checar participação. FIX read-side (não-destrutivo): `innerJoin` + `ne(status,'cancelada'/'rejeitada')`. FEATURE: 40 `timeline.push` ganharam `refTipo`/`refId`/`meta`; modal client com grade key-value respeitando LGPD. Ver `shared/changelog.ts`.

- **Rev. 2542** — ALMOXARIFADO · INVENTÁRIO VISUAL (BAIAS) · OBRAS NÃO APARECIAM PARA USUÁRIOS ALOCADOS. Dropdown da guia Baias vazio p/ membro alocado (não-responsável). CAUSA: `obrasComItem` cruzava `obras.listActive` × baias, ambas via `getEffectiveAllowedObraIds`/`userCanAccessObra` que ignoram alocação `obra_funcionarios`. FIX: client `InventarioVisual.tsx` `listActive`→`listForAlmoxarifado`; server novos helpers `getAlmoxAllowedObraIdSet`/`userCanAccessObraAlmox` em `db.ts` aplicados no `baiaAgregadosListar` + 7 mutations de baia. Ver `shared/changelog.ts`.

- **Rev. 2541** — PERMISSÕES · PROPAGAÇÃO DE MELHORIAS PARA TODOS OS USUÁRIOS COM ACESSO AO MÓDULO. Features novas não apareciam para todos com acesso ao módulo (nível `custom`: página sem `pageId` no JSON caía em default-deny). FIX (`PermissionsContext.tsx`): página AUSENTE herda acesso ao módulo em `canViewPage`/`groupCanAccessRoute`, gated por `some(p.view)`; escrita segue default-deny. Ver `shared/changelog.ts`.

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
