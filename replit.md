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

- **Rev. 2080** — **HOTFIX PROD · Cotação Parcial / Geração de OC quebrada (`function pg_advisory_xact_lock(bigint, integer) does not exist`).** Screenshot do user mostrava toast vermelho ao confirmar cotação parcial. Causa: Postgres só tem overloads `pg_advisory_xact_lock(bigint)` ou `(int, int)` — NÃO existe `(bigint, int)`. As Rev. 1985/1986 castavam `${companyId}::bigint, 1001::int` (combinação inexistente) → transação abortava ANTES do INSERT da OC. Fix em `server/routers/compras.ts` L148 + L232: ambos os casts pra `::int` (companyId é serial INTEGER, max 2³¹ — sem risco). Os outros usos do pattern (`fechamentoPonto.ts:2112` sem cast, `comunicadosInternos.ts:73` já com `::int,::int`) estavam corretos. Zero schema change.
- **Rev. 2079** — **Comunicados Internos · novo botão "Lista para Assinatura" com modos digital (canvas) ou impressão (linha em branco).** Pedido: lista com todos os funcionários ativos da empresa, com opção de assinar digitalmente OU imprimir pra colher fisicamente. Nova tabela `comunicado_assinaturas` (CREATE IF NOT EXISTS no startup — R-001 OK) + 3 endpoints (`listarFuncionariosParaAssinatura`/`assinar`/`removerAssinatura`). Client `ComunicadosInternos.tsx`: `SignaturePad` inline (canvas HTML5 DPR-aware, pointer events mouse+toque, sem libs externas), state `listaAssinaturaId`+`assinaturaMode`+`signingFuncionario`, botão indigo na toolbar do viewComunicado, sub-view (early return) com toolbar+tabs+3 KPIs (ativos/assinados/%)+busca+tabela imprimível com cabeçalho institucional (logo+CNPJ+nº comunicado+declaração de ciência). Print CSS @media inline: esconde tudo exceto `.lista-assinatura-print`, A4 portrait, thead repete por página. Upsert via delete+insert (re-assinatura sempre atualiza assinadoEm).

### Revisões recentes (one-liners)

- ~~Rev. 2078~~ — Aviso Prévio · foto do colaborador ao lado do nome + clique amplia em modal. Backend `avisoPrevioFerias.listar` SELECT + mapper devolvendo `fotoUrl`; client com Avatar 36px clicável + modal Dialog gradient. Ver `shared/changelog.ts`.
- ~~Rev. 2077~~ — Fechamento de Ponto · selo "⚠ Aviso Prévio" agora aparece nos 4 rankings (Pontuais/Atrasados/HE/Menos Dias Trabalhados). Backend já devolvia `emAvisoPrevio`, fix no map do client + render do badge. Ver `shared/changelog.ts`.
- ~~Rev. 2076~~ — Contratos de Terceiros · `confirm()` nativo do navegador substituído por `AlertDialog` shadcn (bulk delete + trash por linha) seguindo padrão de `OrcamentoLista.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2075~~ — Fechamento de Ponto · PJ não deve aparecer em rankings/KPIs · guard `COALESCE(tipoContrato,'CLT') <> 'PJ'` em `listRecords`/`getSummary`/`getStats` (3 endpoints + 4 KPIs). Ver `shared/changelog.ts`.
- ~~Rev. 2074~~ — Cotações · botão "Aprovar e Gerar Contrato de Serviço" travava com "Defina o Prazo de Entrega" em MDO puro · fix em `terceiroContratos.aprovarEgerarContrato` + cards "PRAZO ENTREGA" omitidos em header/painel lateral. Ver `shared/changelog.ts`.

> Revisões 2073 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
