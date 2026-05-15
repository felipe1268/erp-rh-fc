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

- **Rev. 1848**: **Planejamento · REFIS Análise Detalhada — gráfico 'Avanço Físico por Grupo' mostra TODOS os tópicos (não só ESGOTO)**. User (15/05/2026, screenshot /planejamento/29 aba REFIS): "o refis esta fugado preciso que gere grafico de todo os topicos analise detalhada como estava anteriormente.. porque vc mudou isso?" + "hoje so apareceu o topico esgoto.. não da". **Causa**: `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` L11468-11470 — filtro de g1 (top-level groups) `a.nivel === 1 || !String(a.eapCodigo).includes('.')` é frágil pós-reimport MSP: depende de `nivel` exato (pode vir undefined) OU eapCodigo sem ponto (falha quando top já vem '1.1', '2.1'). Na obra 29 só ESGOTO casou, demais tópicos descartados silenciosamente. Bug não-determinístico por projeto. **Fix (1 arquivo, 1 hunk)**: L11471-11491 — substituído por DETECÇÃO ESTRUTURAL de raiz (achado architect: minDepth dropava ramos heterogêneos). Um grupo é raiz se NENHUM outro grupo é seu ancestral EAP (prefixo estrito): `gruposComEap.filter(a => !ancestrais(a.eapCodigo).some(p => eapsGruposSet.has(p)))`. Suporta hierarquias mistas (tops depth 1 + depth 2 coexistindo). Bloco 5 (etapas) beneficiado auto via `g.eapCodigo`/`gDepth+1`. **Preservado**: ZERO backend/contrato/schema/migration/DELETE; calc()/prevInd() intactos; filtro `g.nLeaves > 0` intacto; render blocos 4/5 não tocado; outros usos de `nivel===1` em `gruposEap` (L3123, L4025 — Gantt/Cronograma) NÃO alterados (escopo distinto). Reversível em 1 hunk. R-001 OK.
- **Rev. 1847**: **Fechamento de Ponto · Modal de Ranking (Mais Horas Extras / Atrasados / Pontuais / Faltas) — Tela cheia**. User (15/05/2026, screenshot do modal 'Mais Horas Extras' ocupando ~96vw x 92vh com bordas escuras visíveis): "coloque esta tela full screen para melhor visualização..". **Fix (1 arquivo, 1 hunk)**: `client/src/pages/FechamentoPonto.tsx` L2078 — `DialogContent` do modal de ranking (compartilhado pelos 4 tipos: pontuais, atrasados, extras, faltas) trocou `w-[96vw] max-w-7xl h-[92vh]` por `w-screen h-screen max-w-none sm:max-w-none rounded-none border-0`. Agora ocupa 100% da viewport, sem cantos arredondados — header com filtros, tabela de colaboradores e footer aproveitam toda a tela. **Preservado**: ZERO mudança em handlers, backend, schema; estrutura interna (flex-col, scroll do meio, footer fixo) intacta; outros DialogContent da página não tocados. Reversível em 1 hunk. R-001 OK.
- **Rev. 1846**: **Planejamento · Programação Semanal — Responsável Manual sagrado (cleanup one-shot do legado MSP)**. User (15/05/2026, 2 screenshots cronograma+PSEM): "indiquei no cronograma o responsavel é a rohr e mesmo assim na programação semanal esta mostrando como FC.. pq?". **Causa**: heurística runtime da Rev. 1818 em `server/_shared/responsavelAtividade.ts` ignorava qualquer `responsavelLotus` que casasse (norm) com `obras.responsavel` (engenheiro do projeto) — quando o engenheiro registrado é uma empresa terceira (ex.: 'Rohr'), o input legítimo do planejador no popover Responsável Manual era SILENCIOSAMENTE descartado e a Programação Semanal exibia 'FC' por fallback. Save persistia 'Rohr' no banco, mas read filtrava antes de devolver. **Fix (2 arquivos, 3 hunks)**: (1) `server/_core/index.ts` L538-578 novo bloco SyncSchema+ Rev. 1846 — `ADD COLUMN IF NOT EXISTS resp_lotus_legacy_cleaned BOOLEAN DEFAULT FALSE` em `planejamento_projetos` + CTE com **GUARDA ANTI-DESTRUIÇÃO** (achado de architect review): só NULLa `responsavel_lotus` em projetos elegíveis (qtd_match >= 10 atividades com mesmo valor — padrão de import em massa). Overrides manuais esparsos (1-9 atividades, ex.: caso 'Rohr' do user com 2) são protegidos e ficam intactos. Flag TRUE marcada em todos os alvos para evitar re-scan. Idempotente, só loga se rowCount>0. (2) `server/_shared/responsavelAtividade.ts` L163-182 removida query de obras.responsavel + engNorm; `VALORES_LEGADO_PADRAO` agora tem só literais triviais (`''`, `'fc'`, `'fc engenharia'`, `'fcengenharia'`). (3) L31-36 imports não-usados removidos (`planejamentoAtividades`, `planejamentoProjetos`, `obras`). **Esperado**: legado purgado uma vez no startup; depois disso input do planejador é SAGRADO mesmo que coincida com nome do engenheiro. **Preservado**: ZERO breaking; hierarquia 1817 intacta (isExterna > manual > contrato > FC); schema só ganha 1 boolean default FALSE; ZERO DELETE; importer MSP não tocado. Reversível em 3 hunks. R-001/R-007/R-010 OK.
- **Rev. 1845**: **Central de Alertas (Home/PainelRH) — exclui Reclusos e Afastados >15 dias**. User (15/05/2026, screenshot da Central com 19 alertas incluindo cards 'Sem ASO' de afastados longos): "tire da lista os afastados acima de 15 dias e reclusos..". **Causa**: `server/routers/homeData.ts` montava `asosAlerta`/`semAso`/`experiencias` a partir de `todosNaoDesligados` que só corta Desligado/Lista_Negra/Inativo — Afastados (INSS/B91, status setado só em casos >15d) e Reclusos passavam direto, gerando ruído (sem ação possível). **Fix (1 arquivo, 4 hunks)**: (1) L63-82 novo helper `isLongTermAfastado(emp)` (status='afastado' AND (sem `licencaDataInicio` OR `today - licencaDataInicio > 15` dias)) + `isReclusoOrLongAfast` + `alertableEmpIds = Set<number>` derivado. (2) L193-195 loop `asosAlerta` ganha guard `if (!alertableEmpIds.has(empId)) continue;`. (3) L227-229 `semAso.filter(e => alertableEmpIds.has(e.id) && !asoMap.has(e.id))`. (4) L492-494 `experiencias.filter(e => alertableEmpIds.has(e.id) && ...)`. **Preservado**: ZERO schema/migration/DELETE/contrato; `todosNaoDesligados` intacto (KPIs/aniversariantes/quadro continuam contando); `feriasAlerta` já filtra `status='Ativo'`; `avisosPrevios` legítimo manter (financeiro pendente); HE/MO solicitations não tocadas. Filtro client L155 PainelRH/L870-996 Home permanece como 2ª barreira. Reversível em 4 hunks. R-001/R-007/R-010 OK.
- **Rev. 1844**: **Aviso Prévio · Tendência mês-a-mês — 'Valor Estimado das Aberturas' com centavos (R$ x.xxx,yy)**. User (15/05/2026, screenshot da linha mostrando R$ 1.689 / 179.693 / 53.006 sem centavos): "coloca o valor em dinheiro no formato correto, quero com ponto e vírgula..". **Causa**: `client/src/pages/dashboards/DashAvisoPrevio.tsx` L27 — formatador do indicador `valorIniciados` usado pela `TabelaComparativaAnual` estava com `maximumFractionDigits: 0`, suprimindo os centavos. **Fix (1 arquivo, 1 hunk)**: L27 — `{ style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }` → `{ ..., minimumFractionDigits: 2, maximumFractionDigits: 2 }`. Agora `R$ 1.689` → `R$ 1.689,00` etc., mesma convenção de `fmtBRL` (L42). **Preservado**: ZERO backend/contrato/schema; `fmtBRLShort` mantém 1 casa nos eixos de gráfico (sufixo mil/mi); outros indicadores da tabela seguem como inteiros (são contagens). Reversível em 1 hunk. R-001 OK.
