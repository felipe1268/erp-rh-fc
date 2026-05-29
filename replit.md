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


- **Rev. 2570** — **RH & DP · HORA EXTRA · ANÁLISE DA SOLICITAÇÃO (`/solicitacao-he`, modal "Análise da Solicitação HE-NNNNN") · FUNCIONÁRIO DE CARGO DE CONFIANÇA NÃO GERA VALOR DE HORA EXTRA A PAGAR (CLT art. 62, II).** User: "o ERP precisa verificar se o funcionário é de cargo de confiança ou não, se for não tem valor a ser pago de hora extra, verifique isso nos critérios de cadastro do funcionário." CAUSA: a tela de Análise calculava custo de HE para TODOS os funcionários da solicitação, ignorando o campo `cargo_confianca` (smallint 0/1) + `cargo_confianca_inciso` já existentes no cadastro do colaborador; além disso o `heSolicitacoes.getById` nem projetava essas colunas. FIX (não-destrutivo): SERVER `getById` passou a projetar `employeeCargoConfianca`/`employeeCargoConfiancaInciso`; CLIENT (`SolicitacaoHE.tsx`) ganhou helper `isCargoConfianca(f)` + `confiancaList`; os reduces `custoTotal`/`totalNormalGlobal` PULAM cargo de confiança; por linha `custoHE=0`/`custoExtra=0` e as 3 colunas de custo viram selo `colSpan={3}` "Isento de hora extra — nada a pagar (CLT art. 62)", com badge na Função e realce violeta; resumo "Funcionários" ganhou nota "N cargo de confiança (sem HE)"; `semSalario` exclui confiança. Motor de folha INTOCADO. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2569** — **RH & DP · HORA EXTRA · ANÁLISE DA SOLICITAÇÃO (`/solicitacao-he`, modal "Análise da Solicitação HE-NNNNN") · A TABELA DE FUNCIONÁRIOS PASSA A EXIBIR A FOTO DO CADASTRO DE CADA COLABORADOR.** User: "quero as fotos dos colaboradores." (1 screenshot da tela HE-120020.) CAUSA: a coluna "Nome" da tabela de Análise (`SolicitacaoHE.tsx` ~L1715) só mostrava o nome (texto azul → Raio-X), sem avatar; e `heSolicitacoes.getById` não projetava `fotoUrl` (a listagem `getAll` já trazia, mas o `getById` do modal não). FIX (não-destrutivo, leitura/UI): SERVER `getById` projeta `employeeFotoUrl: employees.fotoUrl`; CLIENT importa `PersonPhoto` e a coluna "Nome" passa a renderizar `<PersonPhoto src={f.employeeFotoUrl} size="sm" caption={função} />` + nome (lightbox + fallback de iniciais), nome segue clicável p/ Raio-X. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2568** — RH & DP · PAINEL RH · CENTRAL DE ALERTAS · OS CARDS DE ALERTA POR FUNCIONÁRIO PASSAM A EXIBIR A FOTO DO CADASTRO. Cards em grid (`PainelRH.tsx` ~L1163) mostravam só o nome; `alertasList` não propagava `fotoUrl` no `push` embora as fontes do `homeData` já retornem. FIX (SÓ CLIENT): tipo ganhou `fotoUrl?`; 6 `push` incluem `fotoUrl`; alertas de FUNCIONÁRIO renderizam `<PersonPhoto>` + nome (lightbox + fallback), Solicitações HE/MO seguem só nome. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2567** — ALMOXARIFADO · VISÃO GERAL (`/almoxarifado`) · O ALERTA "N LOCAÇÕES A VENCER" PASSA A SER CLICÁVEL E ABRE MODAL COM OS DETALHES. O alerta era `<div>` estático (detalhe só via tooltip, ruim no mobile); dados já vinham de `trpc.compras.getItensLocadosVencendo`. FIX (SÓ CLIENT): novo estado `modalLocacoesVencendo`; `<div>`→`<button>`; modal lista cada locação (nome, fornecedor, vencimento, valor mensal, badge de dias/"Vencido há Nd") + ações Devolver e "Ver Equipamentos Locados". Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2566** — ALMOXARIFADO · MOVIMENTAÇÕES (`/almoxarifado/movimentacoes`) · OS 5 CARDS DE RESUMO (TOTAL/ESTOQUE/FERRAMENTAS/INSUMOS/TRANSFER.) VIRAM FILTROS CLICÁVEIS POR FONTE. Cards eram `<div>` puros; estado `filtroFonte` já existia (chips abaixo). FIX (SÓ CLIENT): `<div>`→`<button>` via `.map`; cada card seta `filtroFonte` + `filtroTipo="todos"`, sincronizado com os chips; card ativo ganha `ring-2`/`aria-pressed`; `resumo` deriva de `listaBase` (sem fonte/tipo) → cards não zeram entre si. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2565** — OBRAS · EFETIVO · REALOCAÇÃO DE MÃO DE OBRA (`/obras/efetivo`) · PICKER "OBRA DE DESTINO" MOSTRA TODAS AS OBRAS ATIVAS DA EMPRESA PARA QUALQUER ENGENHEIRO DE CAMPO, SEM FILTRO DE `allowed_obra_ids`. O seletor "Obra de Destino" (`ObraEfetivo.tsx` ~L1185) era populado por `obrasAtivas` (`trpc.obras.listActive`, filtra por `getEffectiveAllowedObraIds`) → engenheiro só via obras permitidas, embora o servidor JÁ permitisse a alocação para qualquer obra (`transferirEmLote`, sem gate por obra). FIX (aditivo): SERVER nova query `obras.listActiveAll` (sem filtro de permissão, mantém escopo empresa+ativo; `listActive` intocado); CLIENT nova query `obrasTodas` usada SÓ no destino (picker, card de condições, resumo, confirmação); listas de visualização seguem em `obrasAtivas`. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2564** — ALMOXARIFADO · EQUIPAMENTOS PRÓPRIOS · MODAL "EDITAR EQUIPAMENTO" · PICKER "OBRA ATUAL" PASSA A APARECER SEMPRE (TAMBÉM NA EDIÇÃO). O picker "Obra atual" (`<select>` de `trpc.obras.listForAlmoxarifado`) em `client/src/pages/equipamentos/Proprios.tsx` na EDIÇÃO só renderizava se `form.status==="em_obra"` → equipamento "Disponível" escondia o picker. FIX (SÓ CLIENT): condição trocada pra sempre verdadeira → picker visível SEMPRE (cadastro E edição, qualquer status); `onChange` já cuida da coerência (escolher obra ⇒ "Em obra"; limpar ⇒ "Disponível"). Servidor INTOCADO (`proprioCriar`/`proprioAtualizar` já aceitam `localizacaoAtualObraId`/`localizacaoAtualTipo`). Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

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
