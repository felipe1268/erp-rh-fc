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

- **Rev. 2075** — **Fechamento de Ponto · PJ não deve aparecer em rankings/KPIs (RH só controla ponto de CLT).** Pedido IMG_0984: "Atenção PJ, não tem controle de ponto, revise todo o ERP, para não ter este erro". Guard defensivo em 3 endpoints de `server/routers/fechamentoPonto.ts`: (1) `listRecords` L1542+: `sql\`COALESCE(${employees.tipoContrato}, 'CLT') <> 'PJ'\`` no array conditions; (2) `getSummary` L1576+: mesmo filtro no JOIN timeRecords⨝employees — corrige modal "Menos Dias Trabalhados" + 4 rankings (Pontuais/Atrasados/HE/Faltosos) + KPIs derivados client-side; (3) `getStats` L2311+: `NOT EXISTS` subquery pra excluir PJ dos KPIs Total Registros/Colaboradores/Inconsistências/Ajustes Manuais sem inflar query com JOIN. Convenção `<> 'PJ'` (não `= 'CLT'`) preserva estagiário/temporário/aprendiz futuros. COALESCE protege legados NULL. Hoje banco tem 5 employees todos CLT (leak não estava ativo) — fix é preventivo. ZERO migration, ZERO schema change.
- **Rev. 2074** — **Cotações · botão "Aprovar e Gerar Contrato de Serviço" ainda travava com "Defina o Prazo de Entrega" em MDO puro + cards de header/lateral mostravam "PRAZO ENTREGA: —" inutilmente.** Pedido IMG_0980: "Não tem prazo nem endereço de entrega quando é mão de obra, arruma esta lógica". Continuação da Rev. 2073: fluxo MDO da COT-2026-0166 NÃO passa por `comprasRouter.gerarOC` — passa por `terceiroContratos.aprovarEgerarContrato`, que tinha o MESMO bug. Fix: (1) `server/routers/terceiroContratos.ts` L2581+: `isServicoPuro = cot.tipo === 'servico'` + `dispensaPrazo = isServicoPuro || isMdoMedicao`; (2) `client/src/pages/compras/Cotacoes.tsx` L3103+ (header fullscreen): card "PRAZO ENTREGA" OMITIDO via spread condicional `...(tipo === 'servico' ? [] : [{...}])`; (3) L6258+ (painel lateral): mesmo tratamento via `{tipo !== 'servico' && <div>...}`. Label "Mobilização" agora só se aplica a `tipo === 'pacote'`. ZERO migration, ZERO schema change.

### Revisões recentes (one-liners)

- ~~Rev. 2073~~ — Cotações · "Prazo de Entrega" obrigatório em MDO puro (`tipo='servico'`) mesmo o campo não existir — fix em `validarCondicoesVencedor` + banner amber + server `gerarOC`. Ver `shared/changelog.ts`.
- ~~Rev. 2072~~ — Fechamento de Ponto · sub-modal "Menos Dias Trabalhados" (calendário) repaginado pelas regras de ouro (fullscreen + gradient + 6 KPI cards). Ver `shared/changelog.ts`.
- ~~Rev. 2071~~ — Cotações · `handleSalvar` força `tipoPagamento="medicao"` quando MDO+modoEfetivo=medicao + parser `ValidacaoErro` parava bullet inline (`\n` antes do primeiro). Ver `shared/changelog.ts`.
- ~~Rev. 2070~~ — SST Integração · `dashboardKpis` agora espelha `getBadgeCounts` (CTEs last_ok+em_processo, terceiros sem doc, anti-fantasma) — card "Pendentes" não mostra mais 0 quando há pendências. Ver `shared/changelog.ts`.
- ~~Rev. 2069~~ — SST Integração · multiseleção + select-all + bulk delete nas abas Aprovados e Reprovados (espelha padrão da Pendentes, reusa endpoint `excluirRegistros`). Ver `shared/changelog.ts`.

> Revisões 2068 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
