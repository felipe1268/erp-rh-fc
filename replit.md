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
- `server/`: Express backend + tRPC routers
  - `server/_core/`: Auth, OAuth, Vite setup, env config
  - `server/routers/`: tRPC routers per módulo
  - `server/db.ts`: Database helpers
- `drizzle/`: Schema and migrations
- `shared/`: Shared types and constants (`shared/version.ts`, `shared/changelog.ts`, `shared/paymentConditions.ts`, `shared/modules.ts`)
- **DB Schema**: `drizzle/schema.ts`
- **API Contracts**: tRPC routers in `server/routers/`
- **Theme/UI**: `client/src/index.css`, `tailwind.config.ts`, `shadcn/ui` components

## Recent changes

> **Convenção (importante)**: este arquivo guarda APENAS as últimas **5 revisões**, em formato curto (1–3 linhas: o quê + por quê).
> Quando entrar uma nova revisão, **remova a mais antiga daqui** — o histórico completo (com causa-raiz, stack traces, nomes de arquivos, etc.) vive em `shared/changelog.ts`.
> Não duplique conteúdo entre os dois arquivos.

- **Rev. 1870**: **DashFerias · Gráfico mensal ganha 4ª série 'Concluídas' + drill-down por série (regra de ouro fullscreen)**. User (16/05/2026): 'Coloca no gráficos em barras as férias concluídas... quando clicar quero ver as informações pertinentes em tela'. **Mudanças**: (1) Backend `dashboards.ts` L2596-2613 — `timelineMensal` agora inclui `concluidas` (status='concluida' E dataFim no mês). (2) Frontend `DashFerias.tsx` L444 — 4ª barra cinza `#6B7280` (coerente com donut de status). (3) `drillByChart` timeline L149-176 — agora respeita `info.datasetIndex` (0=overlap/Em Férias, 1=Iniciando=dataInicio, 2=Finalizando=dataFim, 3=Concluídas=status+dataFim) com título dinâmico por série. **Responsividade**: DashChart já usa `responsive:true,maintainAspectRatio:false` + container fixo. **Regra de ouro**: drill abre fullscreen via modal corrigido na Rev. 1869. **Preservado**: ZERO mudança em outros gráficos/KPIs/financeiro. Reversível em 3 hunks. R-001 OK.
- **Rev. 1869**: **DashFerias · Modal drill-down 'Colaboradores em Férias' fullscreen no iPad (regra de ouro)**. User (16/05/2026, screenshot modal apertado no centro do iPad): 'Arrume esta tela, conforme nossa regra de ouro'. **Causa**: `DialogContent` do shadcn tem `resizable` default `true` (dialog.tsx L222) que injeta `style={width:'min(512px, ...)'}` inline — vence Tailwind sem `!important`, então a className `w-screen sm:w-[98vw] sm:max-w-[1600px]` era ignorada e modal grudava em 512px. **Fix (1 linha DashFerias.tsx L670)**: adicionado `resizable={false}` — pattern já usado em 18+ outros DialogContents fullscreen do app (ChartCard, EmployeeDetailDialog, DashEpis, Solicitacoes, etc). Architect tinha sugerido essa hardening na review da Rev. 1868. **Preservado**: ZERO mudança em filtros/busca/export CSV/lógica do drill-down. Reversível em 1 linha. R-001 OK.
- **Rev. 1868**: **DDS · Modal Novo/Editar Tema em fullscreen + 2 colunas (lançamento mais fluido em tablets)**. User (16/05/2026, screenshot iPad portrait): 'Ajuste a tela full screen e deixa mais fácil e fluido o lançamento'. **Causa**: modal antigo (`max-w-3xl max-h-[92vh]`) ficava apertado em tablet, scroll longo. **Solução (1 hunk DDSGuia.tsx)**: DialogContent fullscreen (`!w-screen !h-[100dvh]` mesmo padrão do modal Sessão Rev. 1731) com 3 zonas — header sticky (gradiente indigo→violet), área central `flex-1 overflow-y-auto`, footer sticky. Grid `1 col / lg:2 cols` (esquerda: IA + Título/Categoria/Código/Duração/Descrição/Norma; direita: textarea Roteiro grande `min-h-500px lg:resize-none`). Container `max-w-[1600px] mx-auto`. Bloco IA `flex-col sm:flex-row` em smartphone. **Preservado**: ZERO backend; estados/handlers/sugestões/contador chars/identidade visual intactos. Reversível em 1 hunk. R-001 OK.
- **Rev. 1867**: **Menu · Dashboard DDS adicionado à seção Dashboards (sidebar SST)**. User (16/05/2026, screenshot DASHBOARDS): 'Cadê a dash do DDS DIAOGO DUARIO DE OBRA'. **Causa**: Rev. 1863 criou `/sst/dds-dashboard` mas só plugou botão no header do DDSGuia — entrada no menu não foi adicionada. **Fix (2 hunks de 1 linha)**: (1) `DashboardLayout.tsx` L211 — adicionado item `{ icon: ClipboardCheck, label: 'DDS — Diálogo Diário', path: '/sst/dds-dashboard' }` após 'Atestados & Acidentes'. (2) `shared/modules.ts` L218 — feature `dashboard-dds` no módulo SST (permissão via MenuConfig). **Preservado**: ZERO mudança em rota/página/RouteGuard/backend; botão no header do DDSGuia intacto. Reversível em 2 hunks. R-001 OK.
- **Rev. 1866**: **UI · Sidebar visível em iPad portrait/tablets — breakpoint md → xs (768→480px)**. User (16/05/2026, screenshot DDS no iPad portrait): 'Mantenha a barra lateral visível nesta tela'. **Causa**: `sidebar.tsx` L211/L236 usavam `hidden md:block` / `md:flex` (md=768px), mas Rev. 1813 já tinha reduzido `useMobile` pra 480px — gap de 480-768px deixava sidebar invisível (não virava Sheet, mas CSS escondia). **Fix (2 hunks de 1 linha)**: `md:` → `xs:` (480px, definido em `index.css` `--breakpoint-xs`). Agora coerente: <480px = Sheet mobile; ≥480px = sidebar fixed (icon-collapse <1024px, expandida ≥1024px). Cobre iPad mini/standard/Pro em portrait E landscape, Android tablets. **Preservado**: ZERO mudança em layout/SidebarProvider; desktop/mobile intactos. Reversível em 2 hunks. R-001 OK.
