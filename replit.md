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


- **Rev. 2609** — **CLIENTES · BOTÕES "EDITAR" E "EXCLUIR" DOS CARDS PASSAM A FICAR SEMPRE VISÍVEIS NO TOUCH (iPad/CELULAR) — ANTES SÓ APARECIAM NO HOVER DO MOUSE, ENTÃO NO TABLET "SUMIAM" E NÃO HAVIA COMO EDITAR/APAGAR UM CLIENTE.** Pedido (usuário, no iPad): "Cadê a opção de apagar, editar as informações". Causa-raiz: em `client/src/pages/Clientes.tsx` o container dos botões (Pencil/Trash2) usava `opacity-0 group-hover:opacity-100` — sem hover no touch, os botões ficavam invisíveis. A lógica de editar (`abrirEditar`) e excluir (`excluirMut` + confirm) já existia; era só VISIBILIDADE. Fix (SÓ CLIENT; ZERO SERVER/SCHEMA/ALTER/DROP/DELETE): botões agora `opacity-100 md:opacity-0 md:group-hover:opacity-100` (sempre visíveis <md; hover no desktop ≥md) + estilo de pílula com borda/fundo (âmbar Editar, vermelho Excluir) e rótulo de texto visível só no mobile (`md:hidden`). Validado: esbuild client (exit 0) + workflow reiniciado. Detalhe: `shared/changelog.ts`.
- **Rev. 2608** — **COLABORADORES · NOVO CARD "NA EMPRESA" — SOMATÓRIA DE TODOS OS FUNCIONÁRIOS QUE AINDA TÊM VÍNCULO/CONEXÃO COM A EMPRESA (TODOS MENOS OS DISPENSADOS), PARA SABER A QUANTIDADE TOTAL ATUAL NA EMPRESA.** Pedido (usuário): "mantem como esta so inclua mais um.. considerando a somatória de todos funcionários que de certa forma ainda tem conexão com a empresa.. (seria somar todos, menos os dispensados).. para saber a quantidade total na empresa". Cards existentes mantidos exatamente como estavam — apenas ADICIONADO um novo. DEFINIÇÃO: "Na Empresa" = `total − desligados − blacklist` (dispensados = desligados + blacklist); equivale à soma de Ativos + Férias + Afastados + Licença + Aviso + Reclusos (ex.: 306 − 161 − 23 = 122). Fonte única no servidor: `server/db.ts` (`getEmployeeStats`) ganha campo `naEmpresa` calculado das contagens reais já agregadas (sem nova query) + adicionado ao fallback `if (!db)`; `client/src/pages/Colaboradores.tsx` ganha card "Na Empresa" (ícone `UsersRound`, teal) logo após "Total", sem filtro de clique, com fallback de recálculo no client (retrocompat). Validado: esbuild server + client (exit 0) + workflow reiniciado. Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2607** — CLIENTES · CADASTRO DE LOGO NO PRÓPRIO CLIENTE (UMA VEZ SÓ) — O FORM "EDITAR/NOVO CLIENTE" GANHA UPLOAD DE LOGO E A OBRA PASSA A REPLICAR AUTOMATICAMENTE OS LOGOS DO CADASTRO DE CLIENTE E DE GERENCIADORA (BOXES NA OBRA VIRAM SOMENTE LEITURA). Nova coluna `logo_url` (text, nullable) em `clientes` (aditiva via `syncSchema()` no startup, ZERO ALTER — R-001/R-007/R-010) + self-heal no startup; `clientes.criar/atualizar` aceitam `logoUrl`; `Clientes.tsx` ganha bloco "Logo do Cliente"; `Obras.tsx` ao selecionar cliente preenche `clienteLogoUrl` e os boxes de logo viram SOMENTE LEITURA (fonte única = cadastro). Validado: esbuild server (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2606** — OBRAS · CADASTRO REUTILIZÁVEL DE GERENCIADORAS (COM LOGO) — O CAMPO "GERENCIADORA" DO FORM "NOVA OBRA" DEIXA DE SER TEXTO LIVRE E VIRA UM COMBOBOX QUE LÊ UM CADASTRO PERSISTIDO, PREENCHENDO NOME + LOGO AUTOMATICAMENTE AO SELECIONAR — IGUAL JÁ ACONTECE COM "CLIENTE". Nova tabela `gerenciadoras` (migration `0026` `CREATE TABLE IF NOT EXISTS`, 100% aditivo) + router `gerenciadoras` + combobox com busca/mini-logo e mini-modal "+ Cadastrar". Upload direto na obra mantido como override; compatível com obras existentes. Validado: esbuild server (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2605** — PLANEJAMENTO · REFIS · O "PREVISTO ACUMULADO" DO RELATÓRIO PASSA A LER A MESMA CURVA CAMINHO B DA BARRA "AVANÇO FÍSICO" DO TOPO — ANTES RECALCULAVA O PV NO CLIENT E DIVERGIA (REFIS 3,13% vs TOPO 3,00% NO PROJETO 35). FIX (SÓ CLIENT — `PlanejamentoDetalhe.tsx`): prop `previstoCurva` propagada ao `<Refis>`; `avancoPrevisto`/`avancoPrevAntes` leem `previstoCurva.raizAt(...)` (clamp 0–100), `pctRaizMSP`/ponderado só como fallback. REFIS = topo = curva = MSP. Validado: esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2604** — PLANEJAMENTO · AVANÇO SEMANAL · O REALIZADO IMPORTADO DO MS PROJECT PASSA A LER SOMENTE A COLUNA "% CONCLUÍDA" (PercentComplete). ANTES O IMPORT PRIORIZAVA "%REALI AUX" (Texto7) E "DURAÇÃO REAL" (AD/(AD+RD)), GRAVANDO VALORES FRACIONADOS DIVERGENTES DO QUE O ENGENHEIRO CADASTRA NO PROJECT. FIX (SÓ CLIENT — `PlanejamentoDetalhe.tsx` `importarDoMSProject`): lê EXCLUSIVAMENTE `PercentComplete` (clamp 0–100); removida a cascata Texto7→ActualDuration. Dados legados só corrigem ao REIMPORTAR cada XML. Validado: esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2603** — PLANEJAMENTO · A CURVA DO PREVISTO (CAMINHO B) PASSA A USAR O MOTOR DE TEMPO ÚTIL DO MSP (ProjDateDiff sobre o calendário do XML) EM VEZ DE DIAS CORRIDOS + RAIZ POR MÉDIA PONDERADA — ANTES DIVERGIA DO MSP E DO TOP BAR (0,2,4,5,7 vs 1,3,4,6,8). FIX (SÓ SERVER — `regenerarPrevistoSemanasCaminhoB`): RAIZ = `floor(pctRaizMSP(semana, min(BL_Start), max(BL_Finish), cal))`, POR ATIVIDADE = `floor(fracaoDecorridaMs(...)×100)`; sem calendário → fallback dias corridos. Validado via esbuild server (exit 0). Detalhe: `shared/changelog.ts`.

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
  - **% PREVISTO** (raiz e atividades) = fórmula NATIVA do MSP em **TEMPO ÚTIL** (ProjDateDiff sobre o calendário do XML), **NÃO** dias corridos (Rev. 2603). RAIZ = `floor(pctRaizMSP(semana, min(BL_Start), max(BL_Finish), cal))` (fórmula sobre a baseline DA PRÓPRIA RAIZ, sem ponderação por peso, INT como a coluna Texto6); POR ATIVIDADE = `floor(fracaoDecorridaMs(BL_Start, semana, BL_Finish, cal) × 100)`. Usa o MESMO motor de `shared/diasUteis` que o top bar/`mspReadOnly` (curva = top bar = MSP). Sem calendário gravado → fallback dias corridos (backward compat). Gerada uma vez no `salvarAtividades` (cadastro do cronograma) e congelada em `planejamento_projetos.previsto_semanas_json`. Matematicamente idêntico a varrer "Data do Status" no MSP semana a semana. (Antes da Rev. 2603: dias corridos + raiz por média ponderada → divergia 0,2,4,5,7 vs 1,3,4,6,8.)
  - **% CONCLUÍDA** (raiz e atividades) = `PercentComplete` do XML em cada upload semanal na aba "Avanço Semanal" → grava em `planejamento_avancos.percentual_acumulado` pra a semana do StatusDate.
  - **Mesma coluna nos dois momentos** = paridade matemática absoluta MSP × ERP. Sem `Texto6`/`Texto10`/`Texto11` (continuam sendo gravados em `previsto_msp_pct` por atividade só pra retrocompat — leitura desativada).
  - Snapshot é regenerado SÓ no `salvarAtividades` (substituir/cadastro). Mudou baseline = nova revisão = novo snapshot. Avanço semanal NÃO regenera (baseline é imutável dentro da revisão).
  - Implementação: `server/routers/planejamento.ts` (helper `regenerarPrevistoSemanasCaminhoB` L96-203 + chamada pós-transaction em `salvarAtividades`), `client/src/pages/planejamento/ImportarCronograma.tsx` (parser `<Baseline Number=0>` L470-490).
- **PROIBIÇÃO ABSOLUTA DE CÁLCULO NO PLANEJAMENTO (Rev. 2265+).** O módulo Planejamento NÃO executa NENHUM cálculo de avanço próprio para os cards/agregados visíveis ao engenheiro. Só LÊ o snapshot do MSP (`previstoMspSnapshot` / `realizadoMspSnapshot` do `calendarioJson`). Quando o snapshot está ausente (XML antigo, semana fora do cutoff, envelope mexido), o ERP exibe "—" com tooltip explicando o motivo e CTA pra reimportar o XML — JAMAIS recorre a fallback calculado (ponderação por duração/custo/dias úteis). Indiretas existem apenas no ERP (fora do XML), então no painel "Avanço Global" os valores "Diretas" e "Global" são idênticos ao snapshot da raiz UID=0 e a "distorção" foi aposentada. Single-source-of-truth: hook `mspReadOnly` em `client/src/pages/planejamento/PlanejamentoDetalhe.tsx`. Editor de avanços (linhas/inputs por atividade) e exportações internas (REFIS, Curva S) podem usar os useMemos legados, mas **nenhum card agregado novo** deve fazê-lo.
