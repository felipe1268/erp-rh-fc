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

- **Rev. 1846**: **Planejamento · Programação Semanal — Responsável Manual sagrado (cleanup one-shot do legado MSP)**. User (15/05/2026, 2 screenshots cronograma+PSEM): "indiquei no cronograma o responsavel é a rohr e mesmo assim na programação semanal esta mostrando como FC.. pq?". **Causa**: heurística runtime da Rev. 1818 em `server/_shared/responsavelAtividade.ts` ignorava qualquer `responsavelLotus` que casasse (norm) com `obras.responsavel` (engenheiro do projeto) — quando o engenheiro registrado é uma empresa terceira (ex.: 'Rohr'), o input legítimo do planejador no popover Responsável Manual era SILENCIOSAMENTE descartado e a Programação Semanal exibia 'FC' por fallback. Save persistia 'Rohr' no banco, mas read filtrava antes de devolver. **Fix (2 arquivos, 3 hunks)**: (1) `server/_core/index.ts` L538-578 novo bloco SyncSchema+ Rev. 1846 — `ADD COLUMN IF NOT EXISTS resp_lotus_legacy_cleaned BOOLEAN DEFAULT FALSE` em `planejamento_projetos` + CTE com **GUARDA ANTI-DESTRUIÇÃO** (achado de architect review): só NULLa `responsavel_lotus` em projetos elegíveis (qtd_match >= 10 atividades com mesmo valor — padrão de import em massa). Overrides manuais esparsos (1-9 atividades, ex.: caso 'Rohr' do user com 2) são protegidos e ficam intactos. Flag TRUE marcada em todos os alvos para evitar re-scan. Idempotente, só loga se rowCount>0. (2) `server/_shared/responsavelAtividade.ts` L163-182 removida query de obras.responsavel + engNorm; `VALORES_LEGADO_PADRAO` agora tem só literais triviais (`''`, `'fc'`, `'fc engenharia'`, `'fcengenharia'`). (3) L31-36 imports não-usados removidos (`planejamentoAtividades`, `planejamentoProjetos`, `obras`). **Esperado**: legado purgado uma vez no startup; depois disso input do planejador é SAGRADO mesmo que coincida com nome do engenheiro. **Preservado**: ZERO breaking; hierarquia 1817 intacta (isExterna > manual > contrato > FC); schema só ganha 1 boolean default FALSE; ZERO DELETE; importer MSP não tocado. Reversível em 3 hunks. R-001/R-007/R-010 OK.
- **Rev. 1845**: **Central de Alertas (Home/PainelRH) — exclui Reclusos e Afastados >15 dias**. User (15/05/2026, screenshot da Central com 19 alertas incluindo cards 'Sem ASO' de afastados longos): "tire da lista os afastados acima de 15 dias e reclusos..". **Causa**: `server/routers/homeData.ts` montava `asosAlerta`/`semAso`/`experiencias` a partir de `todosNaoDesligados` que só corta Desligado/Lista_Negra/Inativo — Afastados (INSS/B91, status setado só em casos >15d) e Reclusos passavam direto, gerando ruído (sem ação possível). **Fix (1 arquivo, 4 hunks)**: (1) L63-82 novo helper `isLongTermAfastado(emp)` (status='afastado' AND (sem `licencaDataInicio` OR `today - licencaDataInicio > 15` dias)) + `isReclusoOrLongAfast` + `alertableEmpIds = Set<number>` derivado. (2) L193-195 loop `asosAlerta` ganha guard `if (!alertableEmpIds.has(empId)) continue;`. (3) L227-229 `semAso.filter(e => alertableEmpIds.has(e.id) && !asoMap.has(e.id))`. (4) L492-494 `experiencias.filter(e => alertableEmpIds.has(e.id) && ...)`. **Preservado**: ZERO schema/migration/DELETE/contrato; `todosNaoDesligados` intacto (KPIs/aniversariantes/quadro continuam contando); `feriasAlerta` já filtra `status='Ativo'`; `avisosPrevios` legítimo manter (financeiro pendente); HE/MO solicitations não tocadas. Filtro client L155 PainelRH/L870-996 Home permanece como 2ª barreira. Reversível em 4 hunks. R-001/R-007/R-010 OK.
- **Rev. 1844**: **Aviso Prévio · Tendência mês-a-mês — 'Valor Estimado das Aberturas' com centavos (R$ x.xxx,yy)**. User (15/05/2026, screenshot da linha mostrando R$ 1.689 / 179.693 / 53.006 sem centavos): "coloca o valor em dinheiro no formato correto, quero com ponto e vírgula..". **Causa**: `client/src/pages/dashboards/DashAvisoPrevio.tsx` L27 — formatador do indicador `valorIniciados` usado pela `TabelaComparativaAnual` estava com `maximumFractionDigits: 0`, suprimindo os centavos. **Fix (1 arquivo, 1 hunk)**: L27 — `{ style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }` → `{ ..., minimumFractionDigits: 2, maximumFractionDigits: 2 }`. Agora `R$ 1.689` → `R$ 1.689,00` etc., mesma convenção de `fmtBRL` (L42). **Preservado**: ZERO backend/contrato/schema; `fmtBRLShort` mantém 1 casa nos eixos de gráfico (sufixo mil/mi); outros indicadores da tabela seguem como inteiros (são contagens). Reversível em 1 hunk. R-001 OK.
- **Rev. 1843**: **Impressão/PDF (global) — toggle Retrato/Paisagem + matar página em branco em definitivo**. User (15/05/2026, screenshot do dialog do navegador sobre /dashboards/controle-documentos com '5 folhas de papel', maioria vazias): "melhore a pagina de impressão, dando a opção de fazer em paisagem ou retrato e não quero pagina em branco arrume isso de vez..". **Causas**: (a) `PrintActions.tsx` (componente global, REGRA DE OURO em todas as telas) só tinha botões Imprimir/PDF chamando `window.print()` cru — usuário tinha que escolher orientação no dialog do Chrome. (b) Apesar das regras R-012 já em `index.css` L256-490, ainda sobravam páginas trailing por `div:empty` e `space-y-*` deixando margin-bottom no último filho. **Fix (2 arquivos, 3 hunks)**: (1) `client/src/components/PrintActions.tsx` reescrito — `ToggleGroup` Retrato/Paisagem (default portrait, ícones `RectangleVertical`/`RectangleHorizontal`); função `applyOrientationAndPrint(o)` injeta `<style id='__print_orientation_runtime__' media='print'>` com `@page { size: A4 ${o}; margin: ... }` (margens menores em paisagem) + reforço anti-blank inline; seta `data-print-orientation` no `<body>`; `afterprint` listener faz cleanup; useEffect de cleanup no unmount cobre fechamento de tela. (2) `client/src/index.css` L549-595 — bloco 'Rev. 1843' dentro do `@media print`: `div:empty/section:empty/article:empty/aside:empty/p:empty { display:none }` em `.print-area`; último filho de `.print-area`/body/main/#root com `margin-bottom:0 + page-break-after: avoid`; último filho de `.space-y-{2,3,4,5,6,8}` com `margin-bottom:0`; ajustes seletivos para landscape via `body[data-print-orientation='landscape']` (table font 9.5px, grid gap 6px). (3) Demais telas: ZERO mudança — propaga automaticamente onde `PrintActions` já é usado (DashControleDocumentos, RelatorioHabilidadesObra, Equipes, Comunicados etc.). Implementações específicas com `window.print()` inline (PlanejamentoDetalhe atrasos/refis, Lotus) NÃO são tocadas — usam pattern visibility:visible que não sofre do problema. **Preservado**: ZERO backend/contrato/schema/migration/DELETE; PrintHeader/PrintFooterLGPD intactos; regras R-012 pré-existentes complementadas, não substituídas. Reversível em 3 hunks. R-001 OK.
- **Rev. 1842**: **Planejamento · Avanço Físico (top bar) — paridade absoluta com card 'Previsto (Semana)' do Avanço Semanal**. User (15/05/2026, 2 screenshots): "quero que seja a mesma informação lida para os dois, considerando a data cutoff". **Causa-raiz**: dois cálculos de fim-de-semana divergentes para o MESMO conceito. (a) Top bar (`avancoAtual` L547, `avancoPrevistoDia` L601) usava `semanaVisualizacao + 7 * 86400000` (naive, Mon→Mon=Sex). (b) Card 'PREVISTO (SEMANA)' (L4985) usa `cutoffWeekFromMonday(semanaAtual, cutoffDow).fim` (respeita cutoff=Qui→fim=Qui). Para 2ª sem com cutoff=Qui, top calculava até 15/05 (3.82%/-0.51%) e bottom até 14/05 (3.13%/+0.19%). **Fix (1 arquivo, 5 hunks)**: (1) L425 parent scope (após `dataCorteInfo` L415 p/ evitar TDZ) — `const cutoffDowTop = (dataCorteInfo as any)?.diaCorteSemana ?? 4`. (2) L547 `avancoAtual` — `semFim = cutoffWeekFromMonday(semanaVisualizacao, cutoffDowTop).fim`. (3) L552/L603 — `naSemanaCorrente` agora `cutoffOficial <= semFim` (semFim virou inclusivo no dia do cutoff). (4) L601 `avancoPrevistoDia` — mesma substituição. (5) Deps arrays L577/L625 ganham `cutoffDowTop` para reagir a mudança de dia de cutoff. **Esperado**: top bar = card inferior em qualquer semana e cutoffDow. **Preservado**: ZERO backend/schema/contrato. `cutoffWeekFromMonday`/`mondayOfCutoffWeek` (L100-115) intactas. Toggle Live/Oficial (Rev. 1637), Paridade MSP (Rev. 1833), refisComIndiretasGlobal (Rev. 1584) intactos. Sem semana selecionada, top mantém lock no cutoff oficial (Rev. 1655). Reversível em 5 hunks. R-001 OK.