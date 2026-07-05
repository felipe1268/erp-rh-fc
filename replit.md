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

- **Rev. 4037** — **"CADÊ O DASH DA APR E DA PT?" — FALTAVAM DASHBOARDS DEDICADOS NO GRUPO "DASHBOARDS" DA SIDEBAR.** Usuário mandou print (IMG_3318) do grupo "Dashboards" da sidebar SST mostrando só EPIs/Atestados & Acidentes/DDS e perguntou "Cadê o dash da APR e da PT?" — a Rev. 4036 só tinha padronizado o ESTILO dos KPI cards dentro das telas de APR/PT, não criado dashboards dedicados. Novo procedimento `dashboard` em `aprAnalises.ts` (stats + porObra + porTipoAtividade + timeline mensal + porNivelRisco Baixo/Médio/Alto/Crítico + recentes) e em `ptPermissoes.ts` (stats + porObra + porTipoTrabalho + timeline + recentes); novas páginas `DashboardAprAnalise.tsx`/`DashboardPermissaoTrabalho.tsx` no padrão visual de `DDSDashboard.tsx`; rotas `/sst/dashboard-apr` e `/sst/dashboard-pt` + 2 itens novos no grupo "Dashboards" da sidebar + mapeamento de permissão em `modulePages.ts`. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4036** — **APR — ANÁLISE PRELIMINAR DE RISCO: CARDS DE INDICADORES FORA DO PADRÃO VISUAL DA PT.** Usuário mandou print da tela "Permissão de Trabalho (PT)" pedindo pra "criar o dash da APR igual é o da PT também" — ambas já tinham cards de indicadores, mas com estilos divergentes (APR usava cards em gradiente cheio + ícone branco; PT usa cards planos com "dot" colorido). `AprAnalise.tsx`: array `CARDS` trocado de `{color: gradient, icon}` para `{color: text-*, bg: bg-*-50 border-*-200, dot: bg-*-500}` (mesma paleta semântica: Em Análise=âmbar, Aprovadas=verde, Concluídas=azul, Total=slate); bloco de render dos KPI Cards reescrito no mesmo markup da PT (dot + label + número grande, sem ícone/gradiente), mantendo o filtro por clique já existente. ZERO DELETE · ZERO ALTER destrutivo.

### 5 one-liners

- **Rev. 4035** — **BOLETIM DE MEDIÇÃO (PDF): DOCUMENTO SEM ORGANIZAÇÃO, SEM RELATO E SEM PADRÃO — REDESENHO COMPLETO.** Nova seção "Relatório do Período" (campo `observacoes`), itens agrupados em 2 seções (Cronograma × FD Compras) com subtotal + total geral, coluna "Item"→"Nº" sequencial, descrição sem cortar palavras. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4034** — **MEDIÇÃO DE CONTRATOS: "VINCULAR FD DE COMPRAS" GERAVA ITEM COM tipoAvanco INVÁLIDO ("fd_compra") — CAUSA-RAIZ DO ERRO REVELADO PELA REV. 4033.** `MedicaoDetalhe.tsx`: `tipoAvanco` do item de FD trocado para `"financeiro_material"` (valor fora do enum fazia qualquer boletim com FD vinculado nunca salvar). ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4033** — **MEDIÇÃO DE CONTRATOS: BOTÃO "SALVAR E CALCULAR DEDUÇÕES" PARECIA NÃO FAZER NADA (SEM FEEDBACK DE ERRO).** Race condition entre `recalcularMutation` e `salvarItensMutation` + falta de `onError` engolindo falhas reais; recálculo movido pro `onSuccess` de salvar itens + `toast.error` nas duas mutations. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4032** — **MEDIÇÃO DE CONTRATOS: ESPAÇAMENTO E ALINHAMENTO VERTICAL DOS CAMPOS "DATA INÍCIO"/"DATA FIM".** Grid `gap-3`→`gap-6` + `min-w-0`/`w-full` nas colunas; inputs de data com `flex items-center h-10 leading-normal` pra centralizar o texto. ZERO DELETE · ZERO ALTER destrutivo.

- **Rev. 4031** — **MEDIÇÃO DE CONTRATOS: ÍCONE DECORATIVO NOS CAMPOS DE DATA SOBREPUNHA O ÍCONE NATIVO DO NAVEGADOR — REMOVIDO.** Removido o wrapper/ícone/padding dos 4 campos de data (modalBoletim e modalEditBoletim), voltando a inputs simples sem ícone sobreposto. ZERO DELETE · ZERO ALTER destrutivo.

### Histórico completo

Ver `replit-history.md` para revisões Rev. 4030 e anteriores.

## User preferences

- Seletor de período nos dashboards = white-card (padrão PanoramaFiscal), NUNCA DashHeader gradiente.
- Dialogs nunca truncam texto; use break-words/break-all.
- Commits/revisões seguem convenção acima; detalhe sempre em `shared/changelog.ts`.
- **REGRA DE OURO — Botões de carregamento longo:** todo botão que dispara operação assíncrona longa (IA, geração em lote, salvamento sequencial) DEVE mostrar percentual 0→100% no próprio botão. Padrão: barra de fundo `bg-white/15` crescendo via `style={{ width: pct% }}` + texto `"Ação... XX%"`. Fase IA (não-determinística) usa intervalo simulado até ~33%; fase de salvamento por item usa progresso real ((i+1)/total). Estado: `[progress, setProgress] = useState(0)`; limpar com `setTimeout(..., 800)` após 100% para o usuário ver o completado.
