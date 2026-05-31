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


- **Rev. 2614** — **ORÇAMENTOS · A LISTA PASSA A EXIBIR O NOME DA OBRA VINCULADA (CADASTRO) EM CADA CARD — ANTES SÓ MOSTRAVA CÓDIGO, DESCRIÇÃO, CLIENTE E LOCAL; A OBRA SELECIONADA NO CADASTRO NÃO APARECIA NA TELA.** Pedido (usuário, screenshot Orçamentos): "QUERO QUE NA TELA, FIQUE O NOME DA OBRA, NO CADASTRO". Contexto: o orçamento já guarda `obraId` (campo "Obra vinculada" do form Editar) e `obras.list` já era carregado (só no `<select>`). Fix (SÓ CLIENT — `client/src/pages/orcamento/OrcamentoLista.tsx`; ZERO SERVER/SCHEMA/ALTER/DROP/DELETE): novo `useMemo` `obraNomeById` (Map `String(obra.id) → obra.nome`, fallback `codigo`); card ganha chip azul (ícone `Building2`) com o nome da obra ANTES de "Cliente"/"Local" (só quando há `obraId` + nome); busca passa a casar também pelo nome da obra vinculada. Validado: esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2613** — **RECRUTAMENTO/CURRÍCULOS · LAYOUT NOVO, MODERNO E MINIMALISTA (MAIS ESPAÇO EM BRANCO, FÁCIL UTILIZAÇÃO) — SÓ VISUAL, TODA A LÓGICA/HANDLERS/tRPC/DIALOGS PRESERVADOS.** Pedido (usuário): "QUERO UM LAYOUT NOVO.. moderno e fácil utilização" — escopo confirmado: SÓ a tela `client/src/pages/Curriculos.tsx`, estilo "Moderno e clean (espaço em branco, minimalista)". Fix (SÓ CLIENT — `Curriculos.tsx`; ZERO SERVER/SCHEMA/ALTER/DROP/DELETE; todos onClick/handlers/mutations/estado intactos): fundo `bg-slate-50` (sem gradiente); header com ícone em caixa suave + título `font-semibold tracking-tight` e botões "Upload com IA"/"Novo Currículo" movidos pro canto sup. direito (removidos da toolbar, eram duplicados); sidebar Funções/Status em cards `rounded-2xl border-slate-200/70` com labels uppercase, itens ativos `bg-amber-50`, contadores `tabular-nums`; busca virou input slim isolado `h-12 rounded-xl`; bulk bar branca `border-amber-200`; tabela repaginada com mais respiro (`py-3.5`), cabeçalho uppercase e AVATARES por candidato (inicial em círculo amber); modal "Upload com IA" ganha `overflow-x-hidden` + `max-w-2xl` (corrige scroll horizontal do screenshot) e lista de arquivos em chips. Validado: esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
### Revisões recentes (one-liners)

- **Rev. 2612** — COLABORADORES · O CARD "NA EMPRESA" PASSA A SER CLICÁVEL E FILTRA A LISTA (TODOS COM VÍNCULO = TOTAL − DESLIGADOS − BLACKLIST) — ANTES NÃO ACONTECIA NADA AO CLICAR. Causa: card (Rev. 2608) com `filter: null` → `onClick` no-op. Fix (SÓ CLIENT — `Colaboradores.tsx`): card ganha `filter: "NaEmpresa"`; `serverStatus` trata como `undefined`; `displayEmployees` aplica `list.filter(e => !isInativo(e))`; dropdown ganha `<SelectItem value="NaEmpresa">`. Validado: esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2611** — GERENCIADORAS · AO DIGITAR O CNPJ OS DADOS SÃO PUXADOS AUTOMATICAMENTE DA RECEITA FEDERAL (RAZÃO SOCIAL, NOME FANTASIA, ENDEREÇO, MUNICÍPIO/UF/CEP, SITUAÇÃO CADASTRAL, TELEFONE, E-MAIL E SÓCIOS) + MODAL EM 2 COLUNAS SEM BARRA DE ROLAGEM. SCHEMA `gerenciadoras` ganha colunas ADITIVAS `razao_social/.../cep/situacao_cadastral` + `socios` (json) (R-001/R-007/R-010); SELF-HEAL `[SyncSchema+] Rev. 2611` com `ADD COLUMN IF NOT EXISTS`; router aceita os campos; `Gerenciadoras.tsx` faz `fetchCnpjData` à BrasilAPI ao completar 14 dígitos, modal `max-w-3xl` grid 2 colunas. Validado: esbuild client+server+schema (exit 0). Detalhe: `shared/changelog.ts`.

- **Rev. 2610** — CADASTRO · NOVA PÁGINA/MENU "GERENCIADORAS" — O CADASTRO DE GERENCIADORAS (NOME + LOGO + CNPJ/TELEFONE/E-MAIL) GANHA PÁGINA DEDICADA NO MENU "CADASTRO", ABAIXO DE "CLIENTES". A tabela `gerenciadoras` e o router (list/criar/atualizar/excluir) já existiam (Rev. 2606), mas só pelo combobox "+ Cadastrar" da obra. `Gerenciadoras.tsx` (NOVO, padrão `Clientes.tsx`) + rota `/gerenciadoras` em `App.tsx` + item de menu (ícone `Network`) + permissão `cadastro-gerenciadoras` em `shared/modules.ts`. Validado: esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2609** — CLIENTES · BOTÕES "EDITAR"/"EXCLUIR" DOS CARDS SEMPRE VISÍVEIS NO TOUCH (iPad/CELULAR) — ANTES SÓ NO HOVER DO MOUSE, ENTÃO NO TABLET SUMIAM. Fix (SÓ CLIENT — `Clientes.tsx`): `opacity-100 md:opacity-0 md:group-hover:opacity-100` + estilo de pílula (âmbar Editar, vermelho Excluir) e rótulo só no mobile (`md:hidden`). Validado: esbuild client (exit 0). Detalhe: `shared/changelog.ts`.
- **Rev. 2608** — COLABORADORES · NOVO CARD "NA EMPRESA" — SOMATÓRIA DE TODOS OS FUNCIONÁRIOS QUE AINDA TÊM VÍNCULO COM A EMPRESA (TODOS MENOS OS DISPENSADOS). "Na Empresa" = `total − desligados − blacklist` (equivale a Ativos + Férias + Afastados + Licença + Aviso + Reclusos). Fonte única: `server/db.ts` (`getEmployeeStats`) ganha campo `naEmpresa` das contagens já agregadas (sem nova query) + fallback `if (!db)`; `Colaboradores.tsx` ganha card "Na Empresa" (ícone `UsersRound`, teal) após "Total", sem filtro. Validado: esbuild server + client (exit 0). Detalhe: `shared/changelog.ts`.

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
