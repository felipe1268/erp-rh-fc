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

- **Rev. 1866**: **UI · Sidebar visível em iPad portrait/tablets — breakpoint md → xs (768→480px)**. User (16/05/2026, screenshot DDS no iPad portrait): 'Mantenha a barra lateral visível nesta tela'. **Causa**: `sidebar.tsx` L211/L236 usavam `hidden md:block` / `md:flex` (md=768px), mas Rev. 1813 já tinha reduzido `useMobile` pra 480px — gap de 480-768px deixava sidebar invisível (não virava Sheet, mas CSS escondia). **Fix (2 hunks de 1 linha)**: `md:` → `xs:` (480px, definido em `index.css` `--breakpoint-xs`). Agora coerente: <480px = Sheet mobile; ≥480px = sidebar fixed (icon-collapse <1024px, expandida ≥1024px). Cobre iPad mini/standard/Pro em portrait E landscape, Android tablets. **Preservado**: ZERO mudança em layout/SidebarProvider; desktop/mobile intactos. Reversível em 2 hunks. R-001 OK.
- **Rev. 1865**: **Cronograma · Cascata Responsável Manual — fix detecção de descendentes em EAP 'flat' (02.0 → 02.01)**. User (16/05/2026, screenshot pós Rev. 1862): 'Não está propagando o responsável para os filhos abaixo DA ATIVIDADE PAI'. **Causa**: Rev. 1862 só pegava EAP dotted (`'02.0.1'.startsWith('02.0.')`), mas cliente usa EAP **flat** (`'02.01'.startsWith('02.0.')` = false → cascade aborta silenciosamente). **Fix (PlanejamentoDetalhe.tsx L4046-4080, 1 hunk)**: walk forward por idx+1 com prefix permissivo — se `child.eap.startsWith(parent.eap)` E próximo char é '.' (dotted) OU dígito 0-9 (flat) → descendente; senão BREAK. Fallback nivel quando EAP vazio. Cobre dotted clássico (NBR 12721), flat hierárquico (MSP padrão) e misto. AlertDialog 3-ações + particionamento semValor/comValor preservados. **Preservado**: ZERO backend; hasChildren L3902 (só dotted) não tocado. Reversível em 1 hunk. R-001 OK.
- **Rev. 1864**: **DDS · Modal Novo Tema redesenhado + IA gera tema completo via prompt curto**. User (16/05/2026, screenshot modal antigo): 'Faça o Layout novo e fácil lançamento e com ia para gerar novos temas altomaticos'. **Solução**: (1) Backend novo `gerarTemaIA(companyId, prompt)` em `server/routers/dds.ts` L1173-1268 — usa `invokeLLM` com `response_format: json_object`, prompt classifica categoria (NR/CAMPANHA/VACINACAO/LIVRE), gera código/duração e roteiro markdown nas 6 seções padrão. Saneamento: tolera ```json, recorta {...}, valida lengths/clamp 5-60min/conteudoMd ≥300 chars. (2) Modal `Novo tema` em DDSGuia.tsx redesenhado: header gradient indigo→violet, bloco 'Gerar com IA' (só modo criar) com input + botão + 6 chips de sugestão clicáveis (Trabalho em altura, Betoneira, etc), Enter dispara geração, auto-preenche form. Título destacado em linha própria; linha compacta Categoria/Código/Duração com ícones; conteudoMd com contador de chars. Footer com botão indigo + Check. (3) Estados novos: `iaPrompt` + `gerarTemaIAMut` + `handleGerarTemaIA`. **Preservado**: ZERO schema; criarTema/atualizarTema/excluirTema intactos; modo Editar não muda; `gerarRoteiroComIA` (só roteiro) preservado — este endpoint é complementar (gera tema inteiro). Reversível em 2 hunks. R-001 OK. Requer ANTHROPIC_API_KEY ou GOOGLE_API_KEY.
- **Rev. 1863**: **DDS · Dashboard de KPIs — nova tela analítica completa**. User (16/05/2026): 'Cria um dash de DDS COMVRIOS KPIS importantes que devem ser analisados'. **Solução**: (1) Backend novo `dds.dashboardKpis(companyId, dataInicio?, dataFim?, obraId?)` em `server/routers/dds.ts` L1445-1645 — agregação em 1 chamada (4 SELECTs + processamento em memória), default últimos 365 dias em SP, retorna {kpis, temasPorCategoria, sessoesPorMes, porCategoria, porObra, topTemas, topInstrutores, porDiaSemana, semDDS}. KPIs: total/finalizadas/abertas/canceladas/30d, temas ativos, taxaPresenca%, taxaAssinatura%, cobertura% (atendidos/ativos), gap (sem DDS). (2) Nova página `client/src/pages/sst/DDSDashboard.tsx` (~340 linhas) com filtro de período, 8 KPI cards (2 linhas: volume + qualidade), 7 charts recharts (LineChart mensal, PieChart categoria, 3 BarCharts horizontais top10 obras/temas/instrutores, BarChart dia-semana, lista cards funcionários sem DDS). (3) Rota `/sst/dds-dashboard` em App.tsx (lazy + RouteGuard). (4) Botão 'Dashboard' (cyan, BarChart3) no header de DDSGuia.tsx + hook useLocation. **Preservado**: ZERO schema/mutation; PainelSST e outras queries intactos. Reversível em 4 hunks. R-001 OK.
- **Rev. 1862**: **Cronograma · Cascata Responsável Manual — fix detecção de descendentes (EAP-prefix vs nivel)**. User (16/05/2026, pós Rev. 1860): 'Não tá funcionando' — modal de cascata não abria ao sair do campo. **Causa**: `PlanejamentoDetalhe.tsx` L4047 (Rev. 1860) detectava descendentes via `nivel` — quebrava no 1º filho quando `nivel` vem `undefined` (comum em imports MSP). Resto do arquivo (L3902 hasChildren) usa **prefixo EAP**, que é confiável. **Fix (1 hunk L4047-4072)**: estratégia híbrida — se `a.eapCodigo` existe, scan `linhas` por `l.eapCodigo.startsWith(parentEap + '.')` (toda subárvore qualquer profundidade); senão fallback no loop por nivel original. Particionamento semValor/comValor + AlertDialog 3-ações intactos. **Preservado**: ZERO backend; outras lógicas com `nivel` (Gantt, render, indent) não tocadas. Reversível em 1 hunk. R-001 OK.
