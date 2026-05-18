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

- **Rev. 2078** — **Aviso Prévio (`AvisoPrevio.tsx`) · foto do colaborador ao lado do nome + clique amplia em modal.** Pedido IMG_0988: "Coloca a foto do funcionário ao lado do nome, e quando clicar quero que a foto aumente". Backend `avisoPrevioFerias.listar` (L364-367) não devolvia `fotoUrl` — fix em 2 hunks: SELECT + mapper. Client `AvisoPrevio.tsx`: import `Avatar/AvatarFallback/AvatarImage` + `UserCheck/ImageOff`; estado `fotoZoom`+`fotoLoadError`+`getInitials`; reestrutura `<td>` da coluna Colaborador pra `<div flex>{avatar 36px clicável}{<div col>{button nome}{badges}}</div>`; modal Dialog gradient slate-900 com img max-h-70vh + placeholder `ImageOff` (cópia 1:1 do pattern Rev. 2015 de FechamentoPonto). Funciona pros 4 status (Em Andamento/Aguard. Baixa/Concluídos/Cancelados — mesmo render).
- **Rev. 2077** — **Fechamento de Ponto · selo "⚠ Aviso Prévio" agora aparece nos 4 rankings (Pontuais/Atrasados/HE/Menos Dias Trabalhados), não só na tabela principal.** Pedido IMG_0986: "Marquem quem está de aviso prévio tbm em todos os cards". Backend `getSummary` (server/routers/fechamentoPonto.ts L1779) já devolvia `emAvisoPrevio: boolean` por colaborador, mas o map de transformação em `FechamentoPonto.tsx` L1020-1041 descartava esse campo (copiava só foto/CIPA/férias). Fix em 2 hunks: (1) L1044-1045 — adiciona `emAvisoPrevio: !!e.emAvisoPrevio` ao objeto do map; (2) L2477-2482 — render do badge amber ("⚠ Aviso Prévio") logo após o bloco CIPA, no ranking modal compartilhado pelos 4 cards. Mesma classe visual do badge da tabela principal (L3382). ZERO backend change.

### Revisões recentes (one-liners)

- ~~Rev. 2076~~ — Contratos de Terceiros · `confirm()` nativo do navegador substituído por `AlertDialog` shadcn (bulk delete + trash por linha) seguindo padrão de `OrcamentoLista.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2075~~ — Fechamento de Ponto · PJ não deve aparecer em rankings/KPIs · guard `COALESCE(tipoContrato,'CLT') <> 'PJ'` em `listRecords`/`getSummary`/`getStats` (3 endpoints + 4 KPIs). Ver `shared/changelog.ts`.
- ~~Rev. 2074~~ — Cotações · botão "Aprovar e Gerar Contrato de Serviço" travava com "Defina o Prazo de Entrega" em MDO puro · fix em `terceiroContratos.aprovarEgerarContrato` + cards "PRAZO ENTREGA" omitidos em header/painel lateral. Ver `shared/changelog.ts`.
- ~~Rev. 2073~~ — Cotações · "Prazo de Entrega" obrigatório em MDO puro (`tipo='servico'`) mesmo o campo não existir — fix em `validarCondicoesVencedor` + banner amber + server `gerarOC`. Ver `shared/changelog.ts`.
- ~~Rev. 2072~~ — Fechamento de Ponto · sub-modal "Menos Dias Trabalhados" (calendário) repaginado pelas regras de ouro (fullscreen + gradient + 6 KPI cards). Ver `shared/changelog.ts`.

> Revisões 2071 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
