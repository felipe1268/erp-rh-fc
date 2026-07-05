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

- **Rev. 4041** — **PROJETO SAAS: NOVO PERFIL "ADM CLIENTE" (ADMIN RESTRITO À(S) PRÓPRIA(S) EMPRESA(S)) + 2 VULNS CRÍTICAS DE `listUsers`/`createLocalUser` CORRIGIDAS.** Seguindo a Rev. 4040, novo papel `adm_cliente`: gerencia SÓ usuários `role: "user"` dentro das próprias empresas (criar/editar/resetar senha/ativar-desativar), sem acesso a módulos/grupos/config (isso continua exclusivo de admin/admin_master). Durante a implementação, achado GRAVE: `listUsers` e `createLocalUser` (`server/routers.ts`) não tinham NENHUM check de role — qualquer usuário comum podia criar uma conta `admin_master` pra si mesmo (escalação total) e `listUsers` vazava todos os usuários de todas as empresas. Corrigido com novo helper `assertAdmClienteTargetScope` + guard de role explícito em `createLocalUser`/`setUserCompanies`/`setUserObras`/`resetPassword`/`updateUser`/`setUserStatus`; `setUserGroups` ficou fora do alcance do Adm Cliente. Frontend: `PermissionsContext.isAdmCliente`, `Usuarios.tsx` trava criação em `role:"user"` pro Adm Cliente, `App.tsx` ganhou guard dedicado `UsuariosGuard` (admin_master+admin+adm_cliente) só pra `/usuarios` (MasterOnlyGuard compartilhado intocado), sidebar libera o item pros 3 papéis. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4040** — **PROJETO SAAS: "FASE 0" — AUDITORIA DE ISOLAMENTO ENTRE EMPRESAS (LGPD) E CORREÇÃO DE 6 GAPS DE IDOR CONFIRMADOS.** Antes de iniciar a transformação em SaaS multi-cliente, auditoria de isolamento cross-tenant (financeiro, folha/RH, rotas públicas, criação de usuário/empresa) + scans automatizados. Corrigidos 6 gaps de IDOR confirmados onde um usuário podia ler/baixar dado de OUTRA empresa manipulando um ID: `downloadSST.ts` (ZIP de ASO/saúde de qualquer funcionário), `danfeRoute.ts` (DANFE via companyId de query param não validado), `dissidio.buscarPorId`, `horasExtras.getDetalhe`/`memorialCalculo`, `folhaPagamento.listarItens` (salário/dados bancários). Todos usam o mesmo padrão: `getCompaniesForUser`/`userCompanies` guard antes de retornar o dado. Confirmado por design (não é bug): `admin` tem acesso global igual `admin_master` — painel mestre SaaS deve usar role distinto pra admin de empresa-cliente. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4039** — **DASHBOARD ALMOXARIFADO & EQUIPAMENTOS: ARQUIVO ÚNICO DE 1851 LINHAS COM 6 ABAS VIROU 6 PÁGINAS PRÓPRIAS.** Pedido: dividir `DashAlmoxarifadoEquipamentos.tsx` (controlava 6 seções via `?tab=`) em 6 páginas independentes com item próprio na sidebar, mais análise por funcionário, "top itens por valor", alerta de "itens sem categoria" e click-to-drill-down em todo gráfico. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4038** — **DASHBOARDS DE APR E PT (REV. 4037): GRÁFICOS RASOS DEMAIS — "COLOCA MAIS GRÁFICOS DETALHADOS".** 3 novas agregações em `aprAnalises.dashboard` (matrizRisco, topPerigos, timelinePorStatus) + 2 em `ptPermissoes.dashboard` (porEmpresaExecutante, timelinePorStatus); frontend ganhou heatmap + bar charts nos 2 dashboards. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4037** — **"CADÊ O DASH DA APR E DA PT?" — FALTAVAM DASHBOARDS DEDICADOS NO GRUPO "DASHBOARDS" DA SIDEBAR.** Novo procedimento `dashboard` em `aprAnalises.ts`/`ptPermissoes.ts`; novas páginas `DashboardAprAnalise.tsx`/`DashboardPermissaoTrabalho.tsx`; rotas `/sst/dashboard-apr` e `/sst/dashboard-pt` + 2 itens novos no grupo "Dashboards" da sidebar. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4036** — **APR — ANÁLISE PRELIMINAR DE RISCO: CARDS DE INDICADORES FORA DO PADRÃO VISUAL DA PT.** `AprAnalise.tsx`: array `CARDS` padronizado no mesmo markup da PT (dot + label + número grande, sem ícone/gradiente), mantendo o filtro por clique já existente. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4035** — **BOLETIM DE MEDIÇÃO (PDF): DOCUMENTO SEM ORGANIZAÇÃO, SEM RELATO E SEM PADRÃO — REDESENHO COMPLETO.** Nova seção "Relatório do Período" (campo `observacoes`), itens agrupados em 2 seções (Cronograma × FD Compras) com subtotal + total geral, coluna "Item"→"Nº" sequencial, descrição sem cortar palavras. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4033 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
