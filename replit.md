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


- **Rev. 2568** — **RH & DP · PAINEL RH · CENTRAL DE ALERTAS (modal com abas Todos/ASOs/Férias/Experiência/Avisos/HE/MO) · OS CARDS DE ALERTA POR FUNCIONÁRIO PASSAM A EXIBIR A FOTO DO CADASTRO.** User: "Quero todos com fotos do cadastro." (5 screenshots da Central de Alertas.) CAUSA: os cards em grid (`client/src/pages/PainelRH.tsx` ~L1163) só mostravam o NOME (`alerta.nome`), sem avatar; o `PersonPhoto` já era usado em ~30 outros pontos do MESMO arquivo, mas não aqui. O array `alertasList` (~L100-125) não propagava `fotoUrl` no `push`, embora as fontes do servidor (`homeData.asosAlerta/.semAso/.feriasAlerta/.experiencias/.avisosPrevios` de `server/routers/homeData.ts`) JÁ retornem `fotoUrl`. FIX (não-destrutivo, SÓ CLIENT): tipo de `alertasList` ganhou `fotoUrl?`; os 6 `push` derivados de `homeData` passam a incluir `fotoUrl: x.fotoUrl`; no card, a linha do nome virou condicional → alertas de FUNCIONÁRIO renderizam `<PersonPhoto src={alerta.fotoUrl} size="sm" />` + nome (lightbox + fallback de iniciais), enquanto Solicitações (HE/MO, não-pessoas) mantêm só o nome. SERVER INTOCADO. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2567** — **ALMOXARIFADO · VISÃO GERAL (`/almoxarifado`) · O ALERTA "N LOCAÇÕES A VENCER" (cabeçalho) PASSA A SER CLICÁVEL E ABRE UM MODAL COM OS DETALHES.** User: "Quero poder clicar no alerta e ver as informações pertinentes." (2 screenshots: Visão Geral + close-up do badge "2 locações a vencer".) CAUSA: o alerta em `client/src/pages/almoxarifado/index.tsx` (~L1553) era `<div>` ESTÁTICO; só dava pra ver detalhe via `title` (tooltip), ruim no mobile. Os dados completos já existiam no client via `trpc.compras.getItensLocadosVencendo` (`itensLocadosVencendo` L1168 — itens `origem='alugado'` + `diasParaVencimento` + `alertaDias`). FIX (não-destrutivo, SÓ CLIENT): novo estado `modalLocacoesVencendo`; o `<div>` virou `<button>` que abre o modal. Novo modal lista cada locação com nome, fornecedor, data de vencimento, valor mensal (`toLocaleString` inline — NÃO usa o `fmtBRL` de escopo local da L1832) e badge de dias restantes (âmbar) / "Vencido há Nd" (vermelho, card vermelho quando `≤0`). Ações: por item "Devolver" → `abrirDevolverLocacao(i)` (fluxo já existente L1247); rodapé "Ver Equipamentos Locados" → `setLocation("/equipamentos/locados")`. SERVER INTOCADO (nenhuma query/rota nova). Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.
- **Rev. 2566** — **ALMOXARIFADO · MOVIMENTAÇÕES (`/almoxarifado/movimentacoes`) · OS 5 CARDS DE RESUMO (TOTAL / ESTOQUE / FERRAMENTAS / INSUMOS / TRANSFER.) PASSAM A SER FILTROS CLICÁVEIS POR FONTE.** User: "preciso que estes filtros sejam responsivos.. quando clicar apareça as informações pertinentes." (2 screenshots da faixa de cards no topo da tela.) CAUSA: os 5 cards em `client/src/pages/almoxarifado/Movimentacoes.tsx` eram `<div>` PUROS (estáticos), só exibiam contagens de `resumo`; o usuário esperava clicá-los para filtrar a timeline pela fonte. O estado `filtroFonte` já existia (controlado pelos chips "Fonte" logo abaixo), mas os cards não estavam ligados a ele. FIX (não-destrutivo, SÓ CLIENT): os `<div>` viraram `<button type="button">` gerados por `.map` sobre array de config; cada card faz `onClick={() => { setFiltroFonte(c.fonte); setFiltroTipo("todos"); }}` (Total→`todos`, Estoque→`movimentacao`, Ferramentas→`emprestimo`, Insumos→`insumo`, Transfer.→`transferencia`), reaproveitando o MESMO `filtroFonte` dos chips → clicar num card destaca card + chip (estado sincronizado, fonte única). Card ativo ganha `ring-2` na cor do tema + `shadow-sm` + `aria-pressed`; inativos `hover:shadow-md`. REFINAMENTO UX: `useMemo` `lista` dividido em `listaBase` (natureza/obra/busca, SEM fonte/tipo) + `lista` (=base+fonte+tipo); `resumo` (cards) passou a derivar de `listaBase` → ao clicar num card os OUTROS NÃO zeram (permanecem comparativos/clicáveis). SERVER INTOCADO. Zero schema. Zero ALTER/DROP/DELETE. Detalhe: `shared/changelog.ts`.

### Revisões recentes (one-liners)

- **Rev. 2565** — OBRAS · EFETIVO · REALOCAÇÃO DE MÃO DE OBRA (`/obras/efetivo`) · PICKER "OBRA DE DESTINO" MOSTRA TODAS AS OBRAS ATIVAS DA EMPRESA PARA QUALQUER ENGENHEIRO DE CAMPO, SEM FILTRO DE `allowed_obra_ids`. O seletor "Obra de Destino" (`ObraEfetivo.tsx` ~L1185) era populado por `obrasAtivas` (`trpc.obras.listActive`, filtra por `getEffectiveAllowedObraIds`) → engenheiro só via obras permitidas, embora o servidor JÁ permitisse a alocação para qualquer obra (`transferirEmLote`, sem gate por obra). FIX (aditivo): SERVER nova query `obras.listActiveAll` (sem filtro de permissão, mantém escopo empresa+ativo; `listActive` intocado); CLIENT nova query `obrasTodas` usada SÓ no destino (picker, card de condições, resumo, confirmação); listas de visualização seguem em `obrasAtivas`. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2564** — ALMOXARIFADO · EQUIPAMENTOS PRÓPRIOS · MODAL "EDITAR EQUIPAMENTO" · PICKER "OBRA ATUAL" PASSA A APARECER SEMPRE (TAMBÉM NA EDIÇÃO). O picker "Obra atual" (`<select>` de `trpc.obras.listForAlmoxarifado`) em `client/src/pages/equipamentos/Proprios.tsx` na EDIÇÃO só renderizava se `form.status==="em_obra"` → equipamento "Disponível" escondia o picker. FIX (SÓ CLIENT): condição trocada pra sempre verdadeira → picker visível SEMPRE (cadastro E edição, qualquer status); `onChange` já cuida da coerência (escolher obra ⇒ "Em obra"; limpar ⇒ "Disponível"). Servidor INTOCADO (`proprioCriar`/`proprioAtualizar` já aceitam `localizacaoAtualObraId`/`localizacaoAtualTipo`). Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2563** — RH & DP · AVISO PRÉVIO · CARD "AVISOS PRÉVIOS EM ANDAMENTO" (PainelRH/Home) · "ÚLTIMO DIA TRABALHADO" CALCULADO NA REDUÇÃO DE 7 DIAS CORRIDOS (Art. 488 CLT). O card renderiza `a.ultimoDiaTrabalhado` de `homeData.avisosPrevios`, mas o cálculo em `server/routers/homeData.ts` (L604-618) não olhava `reducaoJornada` → aviso com redução de 7 dias mostrava último dia = término (errado). FIX (não-destrutivo, só server): novo ramo — não-indenizado + `reducaoJornada==='7_dias_corridos'` → último dia = `dataFim−7` (2h/dia e "nenhuma" seguem `=dataFim`); `diasRestantes` passa a contar até o último dia efetivo. `reducaoJornada` já vinha na query. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

- **Rev. 2562** — OBRAS · EFETIVO · DIALOG "EQUIPE" (`/obras/efetivo`) · (1) HARDENING DO TOAST DE REMOÇÃO + (2) DIAGNÓSTICO "DARCY DUPLICADO". (1) Erro "Unexpected end of JSON input" = corpo VAZIO no `httpBatchLink` (worker do `tsx watch` reiniciando), padrão das Rev. 2558/2559 — não é bug de lógica/SQL. FIX (só CLIENT `ObraEfetivo.tsx`): `isTransientNetErr(err)` + no `onError` do `removeMut`, em erro transitório, refetch da lista (remoção idempotente) + `toast.warning` acionável; erros reais seguem mostrando msg. (2) "DARCY DUPLICADO" (Neon): não viola o invariante 1-func-1-obra; são DOIS CADASTROS da MESMA pessoa em 2 empresas (60002/60005) na mesma obra. LIMPEZA (autorizada, SÓ UPDATE/INSERT): script tsx manteve o cadastro da empresa DONA da obra e desativou (`isActive=0`+'saida') a alocação da OUTRA nos 3 casos mesma-obra; pós=0. Zero schema. Zero ALTER/DROP/DELETE. Ver `shared/changelog.ts`.

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
