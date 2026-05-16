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

- **Rev. 1851**: **Programação Semanal LOTUS · Indiretas/LoE auto-progridem (PMBOK §6.4.2) — coluna Real e status corrigidos**. User (15/05/2026, screenshot LOTUS Sem.1 REVTE-CIVIL): 'As atividades indiretas foram medidas tbm, pq está apresentando que não teve atividade?'. Atividades 01.01-01.05 marcadas INDIRETA (LoE) tinham Prev. preenchido mas Real=0% / 'Não exec.' (vermelho), distorcendo PPC. **Causa**: `client/src/components/planejamento/ProgramacaoSemanalLotus.tsx` L495/L1011 — `realPct = peso * somaSemanal/100` onde somaSemanal vem de `planejamento_avancos`; LoE não têm avancos manuais por design (auto-progridem). **Fix (2 hunks)**: para `a.isIndireta`, `realPct = metaPct` e `acumPct` sintetizado como `min(100, duDecorrido/duEnv * 100)` (dias úteis decorridos vs envelope até cutoff). Aplicado nos memos `metricas` (tela L498-522) e export PDF (L1014-1037). **Fundamento**: PMBOK 7ª §6.4.2 / DCMA #6 — Level of Effort por definição realizado = planejado. **Preservado**: ZERO backend/contrato/schema; statusLabel/aderenciaPct intactos; diretas inalteradas (continuam exigindo medição manual). Reversível em 2 hunks. R-001 OK.
- **Rev. 1850**: **Planejamento · REFIS Análise Detalhada — gráfico organizado por CATEGORIA (5°/6° PAVIMENTO etc) usando hierarquia MSP nivel/ordem**. User (15/05/2026, screenshot Rev. 1849 com ESGOTO/INFRA/VENTILAÇÃO repetidos 4-5x cada): 'quero ver por grupo de categoria, 5 pavimento, 6 pavimento'. **Causa**: Rev. 1849 mostrava todos os grupos com eapCodigo. Na obra 29 a estrutura é Pavimento (nivel=1, sem eapCodigo) → 02 ESGOTO (nivel=2) → 02.01.01 INFRA (nivel=3) → folhas — eapCodigo se repete entre pavimentos, gerando bars duplicados sem contexto, e pavimentos (categorias raiz pedidas) ficavam excluídos pelo filtro `&& a.eapCodigo`. **Fix** (`client/src/pages/planejamento/PlanejamentoDetalhe.tsx` L11475-11528): refatorado memo `grupos` para hierarquia MSP real — `ativOrdenadas` por `ordem`, helper `descendentes(g)` faz varredura sequencial até próxima linha com `nivel <= g.nivel`, `g1 = grupos com (nivel ?? 1) === 1` sem exigir eapCodigo, gLeaves/etapas extraídos do range de descendentes. Filtro `g.nLeaves > 0` mantido. **Preservado**: ZERO backend/contrato/schema; calc()/blocos 4/5 render intactos; outros usos de nivel===1/eapCodigo (Gantt/Cronograma) não tocados. Reversível em 1 hunk. R-001 OK.
- **Rev. 1849**: **Planejamento · REFIS gráfico mostra TODOS os grupos (qualquer profundidade) + iOS Safari date fix**. User (15/05/2026, após Rev. 1848 não resolver): "No" REFIS ainda só ESGOTO + "No" toast 'string did not match expected pattern' começou no iPhone tela LOTUS REVTE-CIVIL. **Diagnóstico**: Rev. 1848 (raiz estrutural) era equivalente ao filtro original quando projeto tem 1 raiz EAP — obra 29 tem '01'=ESGOTO + sub-grupos '01.01'/'01.02'/'01.07'/'01.15'. **Fix 1** (`client/src/pages/planejamento/PlanejamentoDetalhe.tsx` L11471-11480): grupos memo simplificado para pegar TODOS grupos com eapCodigo (qualquer profundidade), ordenados; filtro `g.nLeaves > 0` preservado descarta containers vazios. **Fix 2** (mesmo arquivo L9683-9692, coluna 'Tempo de casa' Equipe): `new Date(e.dataAdmissao)` cru quebrava iOS Safari quando backend devolve timestamp completo. Patch defensivo igual `FinanceiroContasAPagar.tsx` L154: `String(x).slice(0,10)` + regex YYYY-MM-DD + `T00:00:00` + `isNaN` guard, fallback '—'. **Preservado**: ZERO backend/contrato/schema; calc()/blocos 4/5 render intactos; outros `new Date()` em PlanejamentoDetalhe NÃO tocados (dataInicio/dataFim já são DATE columns 'YYYY-MM-DD' seguros no iOS). Reversível em 2 hunks. R-001 OK.
- **Rev. 1848**: **Planejamento · REFIS Análise Detalhada — gráfico 'Avanço Físico por Grupo' mostra TODOS os tópicos (não só ESGOTO)**. User (15/05/2026, screenshot /planejamento/29 aba REFIS): "o refis esta fugado preciso que gere grafico de todo os topicos analise detalhada como estava anteriormente.. porque vc mudou isso?" + "hoje so apareceu o topico esgoto.. não da". **Causa**: `client/src/pages/planejamento/PlanejamentoDetalhe.tsx` L11468-11470 — filtro de g1 (top-level groups) `a.nivel === 1 || !String(a.eapCodigo).includes('.')` é frágil pós-reimport MSP: depende de `nivel` exato (pode vir undefined) OU eapCodigo sem ponto (falha quando top já vem '1.1', '2.1'). Na obra 29 só ESGOTO casou, demais tópicos descartados silenciosamente. Bug não-determinístico por projeto. **Fix (1 arquivo, 1 hunk)**: L11471-11491 — substituído por DETECÇÃO ESTRUTURAL de raiz (achado architect: minDepth dropava ramos heterogêneos). Um grupo é raiz se NENHUM outro grupo é seu ancestral EAP (prefixo estrito): `gruposComEap.filter(a => !ancestrais(a.eapCodigo).some(p => eapsGruposSet.has(p)))`. Suporta hierarquias mistas (tops depth 1 + depth 2 coexistindo). Bloco 5 (etapas) beneficiado auto via `g.eapCodigo`/`gDepth+1`. **Preservado**: ZERO backend/contrato/schema/migration/DELETE; calc()/prevInd() intactos; filtro `g.nLeaves > 0` intacto; render blocos 4/5 não tocado; outros usos de `nivel===1` em `gruposEap` (L3123, L4025 — Gantt/Cronograma) NÃO alterados (escopo distinto). Reversível em 1 hunk. R-001 OK.
- **Rev. 1847**: **Fechamento de Ponto · Modal de Ranking (Mais Horas Extras / Atrasados / Pontuais / Faltas) — Tela cheia**. User (15/05/2026, screenshot do modal 'Mais Horas Extras' ocupando ~96vw x 92vh com bordas escuras visíveis): "coloque esta tela full screen para melhor visualização..". **Fix (1 arquivo, 1 hunk)**: `client/src/pages/FechamentoPonto.tsx` L2078 — `DialogContent` do modal de ranking (compartilhado pelos 4 tipos: pontuais, atrasados, extras, faltas) trocou `w-[96vw] max-w-7xl h-[92vh]` por `w-screen h-screen max-w-none sm:max-w-none rounded-none border-0`. Agora ocupa 100% da viewport, sem cantos arredondados — header com filtros, tabela de colaboradores e footer aproveitam toda a tela. **Preservado**: ZERO mudança em handlers, backend, schema; estrutura interna (flex-col, scroll do meio, footer fixo) intacta; outros DialogContent da página não tocados. Reversível em 1 hunk. R-001 OK.
- **Rev. 1846 (DROP)**: **Planejamento · Programação Semanal — Responsável Manual sagrado (cleanup one-shot do legado MSP)**. User (15/05/2026, 2 screenshots cronograma+PSEM): "indiquei no cronograma o responsavel é a rohr e mesmo assim na programação semanal esta mostrando como FC.. pq?". **Causa**: heurística runtime da Rev. 1818 em `server/_shared/responsavelAtividade.ts` ignorava qualquer `responsavelLotus` que casasse (norm) com `obras.responsavel` (engenheiro do projeto) — quando o engenheiro registrado é uma empresa terceira (ex.: 'Rohr'), o input legítimo do planejador no popover Responsável Manual era SILENCIOSAMENTE descartado e a Programação Semanal exibia 'FC' por fallback. Save persistia 'Rohr' no banco, mas read filtrava antes de devolver. **Fix (2 arquivos, 3 hunks)**: (1) `server/_core/index.ts` L538-578 novo bloco SyncSchema+ Rev. 1846 — `ADD COLUMN IF NOT EXISTS resp_lotus_legacy_cleaned BOOLEAN DEFAULT FALSE` em `planejamento_projetos` + CTE com **GUARDA ANTI-DESTRUIÇÃO** (achado de architect review): só NULLa `responsavel_lotus` em projetos elegíveis (qtd_match >= 10 atividades com mesmo valor — padrão de import em massa). Overrides manuais esparsos (1-9 atividades, ex.: caso 'Rohr' do user com 2) são protegidos e ficam intactos. Flag TRUE marcada em todos os alvos para evitar re-scan. Idempotente, só loga se rowCount>0. (2) `server/_shared/responsavelAtividade.ts` L163-182 removida query de obras.responsavel + engNorm; `VALORES_LEGADO_PADRAO` agora tem só literais triviais (`''`, `'fc'`, `'fc engenharia'`, `'fcengenharia'`). (3) L31-36 imports não-usados removidos (`planejamentoAtividades`, `planejamentoProjetos`, `obras`). **Esperado**: legado purgado uma vez no startup; depois disso input do planejador é SAGRADO mesmo que coincida com nome do engenheiro. **Preservado**: ZERO breaking; hierarquia 1817 intacta (isExterna > manual > contrato > FC); schema só ganha 1 boolean default FALSE; ZERO DELETE; importer MSP não tocado. Reversível em 3 hunks. R-001/R-007/R-010 OK.
