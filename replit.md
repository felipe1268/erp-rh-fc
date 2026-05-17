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

- **Rev. 2065** — **Fechamento de Ponto · botão "Voltar ao ranking" nos 3 modais de memória de cálculo.** Pedido IMG_0965: "Coloca um botão para voltar e ver a tela anterior". Os modais (Atraso/HE/Faltas) já preservavam o ranking embaixo, mas o único affordance era o X minúsculo do shadcn — confundia. Fix em `client/src/pages/FechamentoPonto.tsx` (3 edits idênticos): adiciona `<Button>← Voltar ao ranking</Button>` no topo de cada `DialogHeader`, handler = mesmo do X. ZERO lógica, ZERO schema.
- **Rev. 2064** — **SST badge do menu lateral REALMENTE funciona agora · bug crítico de serialização de array Drizzle.** Pedido IMG_0963/0964. `refresh_all_logs` revelou que `getBadgeCounts` falhava desde a Rev. 2058: `malformed array literal: "60002"` — `sql\`ANY(${ids})\`` do Drizzle não serializa array JS; `useQuery` silenciava o erro. Fix em `server/routers/integracaoSST.ts` L319: 4 ocorrências passam pra `sql.raw(\`ANY(ARRAY[${idsList}]::int[])\`)` com lista validada por Zod. Bônus: `alertas` (L1380) também consertada (colunas reais camelCase quoted: `"employeeId"`/`"companyId"`/`"deletedAt"`; `employees` usa `"nomeCompleto"`).

### Revisões recentes (one-liners)

- ~~Rev. 2063~~ — SST badge do menu lateral: contagem passa a incluir terceiros (`funcionarios_terceiros` SEM `integracaoDocUrl`). Ver `shared/changelog.ts`. (Nota: só passou a funcionar de fato com a Rev. 2064.)
- ~~Rev. 2062~~ — Faxina do `replit.md`: convenção mudou de 5+10 pra 2+5 (compactos). Ver `shared/changelog.ts`.
- ~~Rev. 2061~~ — Raio-X · card SST · coluna Certificado ganha botões Ver + PDF para aprovados (cert gerado on-the-fly via `generateCertificadoIntegracaoSstPdf`). Ver `shared/changelog.ts`.
- ~~Rev. 2060~~ — Fechamento de Ponto: bug crítico de verificação de HE aprovada — ciclo 16→15 perdia HEs de mês anterior + contador não checava `status === "aprovada"`. Fix: BETWEEN no server + filtro de status no client. Ver `shared/changelog.ts`.
- ~~Rev. 2059~~ — SST Integração: +13 perguntas sobre Segurança na Obra (total 35) + botão "Editar Perguntas" com label visível. Ver `shared/changelog.ts`.

> Revisões 2058 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
