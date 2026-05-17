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

- **Rev. 2067** — **Raio-X · fix de corte no rodapé no iPad (cards de Integração inacessíveis).** Pedido IMG_0967: "a tela tem um limite de rolagem aí corta a informação". Bug raiz: overlay full-screen em `client/src/components/RaioXFuncionario.tsx` L770 usava `height: "100vh"` — em iOS Safari o `100vh` ignora a barra de URL/tabs, fazendo o container ficar mais alto que a viewport real e jogando os últimos cards (SST, Registrar Integração) fora do alcance do scroll. Fix: `100vh` → `100dvh` (dynamic viewport height respeita a barra do navegador). 1 char trocado, ZERO lógica.
- **Rev. 2066** — **Raio-X do Funcionário · Timeline Cronológica agora inclui TODAS as movimentações.** Pedido IMG_0966: "Preciso que a time line parar de tudoooo, não deixa passar nenhuma movimentação". O print mostrava só 4 eventos mesmo a tela tendo "Férias 12"/"Ponto 4"/"Folha"/etc. Bug raiz: forEach de Férias (L1736) só pushava se `f.dataInicio` setado (períodos aquisitivos abertos sem gozo nunca apareciam). + 8 fontes consultadas eram devolvidas mas NUNCA pushadas pra timeline. Fix em `server/routers/controleDocumentos.ts` L1738-1865: Férias emite 3 eventos (período aquisitivo/início gozo/retorno) + push de Folha/VR/Adiantamentos/Rateio Obra/Insumos/Desc Almox/Atrasos/PJ Pagamentos. Schemas conferidos contra `\d` (lição Rev. 2064: `v.valorTotal` não `v.valor`, `a.valorLiquido` não `a.valor`, `d.valorDesconto`, `i.createdAt` não `dataSaida`). ZERO schema, ZERO query nova.

### Revisões recentes (one-liners)

- ~~Rev. 2065~~ — Fechamento de Ponto: botão "Voltar ao ranking" nos 3 modais de memória (Atraso/HE/Faltas). Ver `shared/changelog.ts`.
- ~~Rev. 2064~~ — SST badge do menu lateral REALMENTE funciona · `sql\`ANY(${ids})\`` do Drizzle não serializa array JS; fix em `getBadgeCounts` com `sql.raw(\`ANY(ARRAY[...]::int[])\`)` validado por Zod. Bônus: `alertas` corrigida com colunas camelCase quoted. Ver `shared/changelog.ts`.
- ~~Rev. 2063~~ — SST badge do menu lateral: contagem passa a incluir terceiros (`funcionarios_terceiros` SEM `integracaoDocUrl`). Ver `shared/changelog.ts`.
- ~~Rev. 2062~~ — Faxina do `replit.md`: convenção mudou de 5+10 pra 2+5 (compactos). Ver `shared/changelog.ts`.
- ~~Rev. 2061~~ — Raio-X · card SST · coluna Certificado ganha botões Ver + PDF para aprovados (cert gerado on-the-fly via `generateCertificadoIntegracaoSstPdf`). Ver `shared/changelog.ts`.

> Revisões 2060 → 2044 e anteriores: ver [`replit-history.md`](./replit-history.md) e `shared/changelog.ts` (detalhe completo).


## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + atualizar `replit.md` (convenção 2+5 — ver acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
