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


- **Rev. 2572** — **GLOBAL · COMPONENTE `<PersonPhoto>` · LIGHTBOX (FOTO AMPLIADA) NÃO CORTA MAIS A CABEÇA/PÉS DA PESSOA NO iPad/SAFARI MOBILE.** User (2 screenshots de iPad na tela Controle de Documentos → Advertências): "Tá com bug quando clico para ampliar a foto." Ao ampliar a foto de DARCY AUGUSTO RIBEIRO, a lightbox mostrava só o TORSO (cabeça cortada no topo, pés no rodapé). CAUSA: a lightbox do `<PersonPhoto>` (`client/src/components/PersonPhoto.tsx`) usava `maxHeight: calc(96vh - 70px)` + `max-h-[96vh]`; no Safari mobile `100vh` = viewport MÁXIMA (sem barras), maior que a área visível → a imagem retrato estourava a altura e, com o overlay `flex items-center`, era clipada em cima/embaixo. FIX (não-destrutivo, SÓ CLIENT/CSS): troca de `vh` por `dvh` (viewport dinâmica, desconta as barras) — `<figure>` `max-h-[96dvh]` e `<img>` `maxHeight: calc(96dvh - 96px)`; `maxWidth` segue em `vw`. Vale global p/ toda tela que usa `<PersonPhoto>`. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2571** — **RH & DP · CONTROLE DE ANIVERSÁRIOS · TELA CHEIA "ANIVERSARIANTES — <MÊS>" · SÓ MONITORAR FUNCIONÁRIOS ATIVOS.** User: "Quem tá com status de desligado, lista negra.. não pode aparecer no controle de aniversário... só vamos monitorar quem está ATIVO." (1 screenshot da tela "Aniversariantes — Maio" com 3 itens "Lista Negra" no topo.) CAUSA: a procedure `home.getAniversariantesMes` (`server/routers/homeData.ts` ~L797), que alimenta a tela cheia, filtrava só `e.status !== "Desligado"` → deixava passar "Lista Negra", "Inativo" e demais não-ativos; já os cards da Home (`getData`) usam `ativos = status === "Ativo"` (estrito) → drift card×tela cheia. FIX (não-destrutivo, só leitura): `getAniversariantesMes` passou a usar o MESMO check estrito dos cards (`e.status === "Ativo"`) + exclusão explícita de Lista Negra (`listaNegra !== 1`). Exclui Desligado/Lista Negra/Inativo/Afastado/Férias/Licença/Recluso. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2570** — RH & DP · HORA EXTRA · ANÁLISE DA SOLICITAÇÃO (`/solicitacao-he`, modal "Análise da Solicitação HE-NNNNN") · FUNCIONÁRIO DE CARGO DE CONFIANÇA NÃO GERA VALOR DE HORA EXTRA A PAGAR (CLT art. 62, II). User: "se for cargo de confiança não tem valor a ser pago de hora extra." `heSolicitacoes.getById` não projetava `cargo_confianca`/`cargo_confianca_inciso` e a Análise calculava HE p/ todos. FIX (não-destrutivo): SERVER `getById` projeta os 2 campos; CLIENT (`SolicitacaoHE.tsx`) helper `isCargoConfianca(f)`; reduces de custo pulam confiança; linha vira selo `colSpan={3}` "Isento de hora extra (CLT art. 62)" + badge; resumo nota "N cargo de confiança". Motor de folha intocado. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.
- **Rev. 2569** — RH & DP · HORA EXTRA · ANÁLISE DA SOLICITAÇÃO (`/solicitacao-he`) · A TABELA DE FUNCIONÁRIOS PASSA A EXIBIR A FOTO DO CADASTRO. A coluna "Nome" só mostrava texto; `heSolicitacoes.getById` não projetava `fotoUrl` (a listagem `getAll` já trazia). FIX (não-destrutivo): SERVER `getById` projeta `employeeFotoUrl`; CLIENT importa `PersonPhoto` e a coluna Nome renderiza avatar (lightbox + fallback) + nome clicável p/ Raio-X. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2568** — RH & DP · PAINEL RH · CENTRAL DE ALERTAS · OS CARDS DE ALERTA POR FUNCIONÁRIO PASSAM A EXIBIR A FOTO DO CADASTRO. Cards em grid (`PainelRH.tsx` ~L1163) mostravam só o nome; `alertasList` não propagava `fotoUrl` no `push` embora as fontes do `homeData` já retornem. FIX (SÓ CLIENT): tipo ganhou `fotoUrl?`; 6 `push` incluem `fotoUrl`; alertas de FUNCIONÁRIO renderizam `<PersonPhoto>` + nome (lightbox + fallback), Solicitações HE/MO seguem só nome. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2567** — ALMOXARIFADO · VISÃO GERAL (`/almoxarifado`) · O ALERTA "N LOCAÇÕES A VENCER" PASSA A SER CLICÁVEL E ABRE MODAL COM OS DETALHES. O alerta era `<div>` estático (detalhe só via tooltip, ruim no mobile); dados já vinham de `trpc.compras.getItensLocadosVencendo`. FIX (SÓ CLIENT): novo estado `modalLocacoesVencendo`; `<div>`→`<button>`; modal lista cada locação (nome, fornecedor, vencimento, valor mensal, badge de dias/"Vencido há Nd") + ações Devolver e "Ver Equipamentos Locados". Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2566** — ALMOXARIFADO · MOVIMENTAÇÕES (`/almoxarifado/movimentacoes`) · OS 5 CARDS DE RESUMO (TOTAL/ESTOQUE/FERRAMENTAS/INSUMOS/TRANSFER.) VIRAM FILTROS CLICÁVEIS POR FONTE. Cards eram `<div>` puros; estado `filtroFonte` já existia (chips abaixo). FIX (SÓ CLIENT): `<div>`→`<button>` via `.map`; cada card seta `filtroFonte` + `filtroTipo="todos"`, sincronizado com os chips; card ativo ganha `ring-2`/`aria-pressed`; `resumo` deriva de `listaBase` (sem fonte/tipo) → cards não zeram entre si. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

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
