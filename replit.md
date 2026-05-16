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

> **Convenção OBRIGATÓRIA (não negociável)** — este arquivo guarda APENAS as últimas **5 revisões** em formato detalhado (o quê + por quê + arquivos tocados). Todas as outras revisões DEVEM aparecer como uma única linha: `- ~~Rev. NNNN~~ — ver \`shared/changelog.ts\`.`
>
> **Ao criar uma nova revisão**:
> 1. Adicionar o bloco detalhado da NOVA revisão no TOPO.
> 2. Pegar o bloco mais ANTIGO dos 5 expandidos e SUBSTITUIR ele inteiro por `- ~~Rev. NNNN~~ — ver \`shared/changelog.ts\`.`
> 3. NUNCA deletar parcialmente um bloco (deixando texto órfão sem o marcador `- **Rev. NNNN**:`). Se sobrar parágrafo solto sem prefixo `- `, é bug.
> 4. NUNCA usar marcadores HTML do tipo `<!-- DETALHES REVS ANTIGAS -->` — eles foram banidos na Rev. 1958 (faxina) por causarem confusão.
>
> O histórico completo (causa-raiz, stack traces, nomes de arquivos, comentários longos) vive em `shared/changelog.ts`. Esta convenção é validada visualmente: cada linha do bloco "Recent changes" deve começar com `- ` (hífen+espaço).

- **Rev. 1959**: **SST · DDS Guia · Nova aba "Uso por Obra"** (já usados vs ainda não usados, respeitando permissão do user). User (16/05/2026, screenshot 19h06): "Cria uma aba dizendo o tema já usado na obra que o usuário tem permissão e o que ainda não foram usados". **Diferença vs Rev. 1957** (que conta uso por COMPANY): nova aba conta uso POR OBRA, com seletor que respeita as obras às quais o user tem permissão via `obras.listActive` + `allowedObras` server-side (Rev. 1731). **Mudança** (`client/src/pages/sst/DDSGuia.tsx`, único arquivo): (a) `abrirNovaSessao` ganha 2º parâmetro opcional `obraPre?:{id,ids?}` pra pre-selecionar obra no modal Nova Sessão (compatível c/ chamadas antigas); (b) state `usoObraSelId` (null=todas) + `useMemo usoPorTemaObra` que agrega `sessoes` por `temaId` filtrando por `s.obraId`; quando "todas" usa Set de IDs permitidos do `obrasQ.data` (Avulsas/sem obra contam); (c) `TabsTrigger value="usoobra"` entre Biblioteca e Sessões; (d) `TabsContent` com card de seletor (chips pra cada obra ativa + chip "🌐 Todas minhas obras") + layout 2 colunas: amber "✓ Já usados" ordenado por `diasAtras ASC` (recente 1º) e emerald "✨ Ainda não usados" ordenado por categoria+título. Cada card tem código/categoria/título/linha de uso + botão "Sessão" (Plus) que chama `abrirNovaSessao(t, obraSel)` pré-selecionando obra. Empty states ("Todos foram apresentados 🎉"). Cores por categoria (NR=rose, CAMPANHA=blue, VACINACAO=violet, LIVRE=slate). max-h 600px + overflow auto. version → 1959. **Resultado**: engenheiro abre aba → escolhe sua obra → vê IMEDIATAMENTE os N temas já apresentados ali e os M ainda não; 1 click no "Sessão" abre Nova Sessão com obra pré-selecionada. **Preservado**: Rev. 1957 (`usoPorTema` por company, badges, alerta modal, toggles) INTACTOS — `usoPorTemaObra` é independente. `obras.listActive` permission filter Rev. 1731 INTACTO. Rev. 1956/1955/1954/1953, modal Nova Sessão Rev. 1731, criarSessao mutation. Zero ALTER/DROP/DELETE, zero backend, zero schema, zero tRPC novo. Reversível em 4 hunks. R-001/R-007/R-010 OK.
- **Rev. 1958**: **Infra · Faxina do replit.md + reforço da convenção top-5** (zero código de produção tocado). User (16/05/2026, após 3 sinalizações do sistema de "arquivo grande"): "tem outros 10+ blocos truncados antigos no meio do arquivo... faz uma rev de manutenção só pra essa faxina... arruma isso s para nunca mais acontecer". **Causa-raiz**: revisões anteriores ao colapsar blocos antigos deixaram parágrafos órfãos no meio do arquivo — texto solto sem o prefixo `- **Rev. NNNN**:` (ex.: linhas começando com " User (...)" ou ": respeitar..."). Alguns blocos truncados ficaram com placeholder HTML `<!-- DETALHES REVS ANTIGAS -->` no meio do parágrafo, criando duplicação confusa entre `replit.md` e `shared/changelog.ts`. **Mudança** (`replit.md` único arquivo): (a) seção "Recent changes" reescrita do zero: 5 revisões expandidas (1958/1957/1956/1955/1954) + 49 revisões colapsadas (1953→1905) cada uma em 1 linha limpa `- ~~Rev. NNNN~~ — ver \`shared/changelog.ts\`.`; (b) bloco "Convenção" expandido com regra explícita ANTI-bug: cada linha deve começar com `- ` (hífen+espaço), placeholders HTML BANIDOS, fluxo step-by-step ao criar nova rev. version → 1958 (bump simbólico — apenas infra/docs). **Resultado**: replit.md cai de 111 linhas (~10400 tokens) p/ ~70 linhas (~3500 tokens). Sistema deixa de sinalizar "arquivo grande". Convenção reforçada protege contra regressão futura. **Preservado**: Cabeçalhos Run/Stack/Where things live INTACTOS, `shared/changelog.ts` INTACTO (continua sendo a fonte única de detalhes históricos), Rev. 1957 (DDS uso/badge/alerta), Rev. 1956/1955/1954/1953 (geração IA + 80 temas). Zero código aplicação, zero schema, zero backend. Reversível em 1 hunk. R-001/R-007/R-010 OK.
- **Rev. 1957**: **SST · DDS Guia · Biblioteca · Rastreio de USO + ordenação + alerta de repetição** (100% client-side, zero schema). User (16/05/2026): "evitar repetir tema na obra... temas já tratados vão sumindo... aba indicando qual já foi usada... se quiser falar de novo, alerta sugerindo tema novo". **Mudança** (`client/src/pages/sst/DDSGuia.tsx`): (a) helper `useMemo usoPorTema` agrega `sessoes` por `temaId` retornando Map<id,{count,ultimaData,diasAtras}>; (b) 2 toggles na toolbar Biblioteca: "Esconder já usados" + "Novos primeiro" (default ON) + contador "X novo / Y já usado"; (c) sort: menos usados primeiro → desempate por uso mais antigo (rotaciona envelhecidos); (d) badge no card: uso=0 emerald "✨ Tema novo", uso>0 e <30d amber "✓ Usado N× · há Yd", ≥30d slate; (e) Select do modal Nova Sessão ordena por count ASC + sufixo "· ✓Nx" ou "· ✨ novo" em cada item; (f) alerta amber abaixo do Select QUANDO tema escolhido tem uso>0, com última data + diasAtras + botão "✨ Trocar por <título>" (atalho que troca p/ 1º tema novo mesma categoria). Nada bloqueia — usuário pode repetir. version → 1957. **Resultado**: rotação óbvia visualmente, ocultar usados em 1 click, alerta-sugestão automático no fluxo de criação. **Preservado**: `listSessoes`/`ddsSessoes.temaId` INTACTOS, Rev. 1956 (paralelização IA), Rev. 1955 (barra modal), Rev. 1954/1953/1747/1740 (geração IA), modal cascadeResp. Zero ALTER/DROP/DELETE. Reversível em 4 hunks. R-001/R-007/R-010 OK.
- **Rev. 1956**: **SST · DDS Guia · "Gerar todos os roteiros com IA" · 2 melhorias combinadas**: (A) **sub-progresso animado** entre itens (antes parado 5-15s entre temas — user screenshot 4/60: "Travou em 7%"); (B) **paralelização worker pool concorrência=4** (~5min → ~1min15s em 60 temas — user: "E faça ser mais rápido"). **Mudança** (`client/src/pages/sst/DDSGuia.tsx`, único arquivo): novos refs `bulkStartedAt`/`bulkItemStartedAt`, state `bulkTick` + useEffect(setInterval 250ms) enquanto `bulkIA.ativo` força re-render. `gerarTodosComIA` refatorado: `for(i)` substituído por 4 IIFEs async em `Promise.all`, cursor compartilhado, cada worker faz `while{pull; mutateAsync; idx=ok+fail}` — `idx` agora = COMPLETOS (pct monotônico). Render: `etaPorItem` adaptativo = `max(2000, elapsedTotal/completos)` (com 4 workers vira ~1.25s/slot); `fracItem = min(0.95, elapsedItem/etaPorItem)` interpola entre saltos; pct cap 99% até último worker; ETA m+s = `restantes × etaPorItem + msRestSlot`. version → 1956. **Resultado**: barra sobe continuamente; 60 temas em ~75s (4x speedup). Cancelamento e falhas isoladas preservados. **Preservado**: backend `gerarRoteiroComIA` Rev. 1740 INTACTO (chamada isolada por tema), `atualizarTema`, modal confirm Rev. 1747, botões "faltantes"/"todos", Rev. 1955 (barra modal gerar+mais). Concorrência=4 conservadora (Anthropic Tier 1: 50req/min, usa ~20). Zero backend/DB. Reversível em 3 hunks. R-001/R-007/R-010 OK.
- **Rev. 1955**: **SST · DDS Guia · Modal "Gerar mais temas com IA" · Barra de progresso 0–100%** estimada pelo tempo decorrido vs ETA (qtd × 1,5s). User (16/05/2026, screenshot mid-loading "Gerando 30 temas..."): "Coloca % de 0 a 100%". **Mudança** (`client/src/pages/sst/DDSGuia.tsx`, único arquivo): novo state `gerarMaisProgress`+refs `gerarMaisStartedAt`/`gerarMaisTimerRef`, helper `stopGerarMaisTimer`. `onMutate` da mutation Rev. 1953 inicia setInterval(200ms) com curva `pct=min(95, round(95*(1-(1-elapsed/ETA)^1.6)))` — sobe rápido no início e desacelera, trava em 95% até resposta real. `onSuccess` seta 100% + setTimeout(600ms) p/ fechar modal (user vê o 100%). `onError` reseta. Visual: bloco condicional dentro do modal entre o seletor de quantidade e input de foco — header Loader2-spin + "Gerando N temas com IA..." + `<span tabular-nums>{N}%</span>`; barra h-2.5 bg-slate-200 com filho gradient emerald-500→600 + transition-all duration-300 ease-out controlado por `style.width:${pct}%`; legenda dinâmica (<95% "Conectando ao modelo..." vs ≥95% "Quase lá — salvando no banco..."). version → 1955. **Resultado**: usuário vê feedback contínuo do 0 ao 100, não parece mais travado. **Preservado**: mutation backend Rev. 1953 INTACTA (não precisou streaming), 80 temas seed Rev. 1954, layout modal Rev. 1953, invalidate listTemas+calendarioAnual. Zero backend/DB/tRPC. Reversível em 2 hunks. R-001/R-007/R-010 OK.
- ~~Rev. 1954~~ — ver `shared/changelog.ts`.
- ~~Rev. 1953~~ — ver `shared/changelog.ts`.
- ~~Rev. 1952~~ — ver `shared/changelog.ts`.
- ~~Rev. 1951~~ — ver `shared/changelog.ts`.
- ~~Rev. 1950~~ — ver `shared/changelog.ts`.
- ~~Rev. 1949~~ — ver `shared/changelog.ts`.
- ~~Rev. 1948~~ — ver `shared/changelog.ts`.
- ~~Rev. 1947~~ — ver `shared/changelog.ts`.
- ~~Rev. 1946~~ — ver `shared/changelog.ts`.
- ~~Rev. 1945~~ — ver `shared/changelog.ts`.
- ~~Rev. 1944~~ — ver `shared/changelog.ts`.
- ~~Rev. 1943~~ — ver `shared/changelog.ts`.
- ~~Rev. 1942~~ — ver `shared/changelog.ts`.
- ~~Rev. 1941~~ — ver `shared/changelog.ts`.
- ~~Rev. 1940~~ — ver `shared/changelog.ts`.
- ~~Rev. 1939~~ — ver `shared/changelog.ts`.
- ~~Rev. 1938~~ — ver `shared/changelog.ts`.
- ~~Rev. 1937~~ — ver `shared/changelog.ts`.
- ~~Rev. 1936~~ — ver `shared/changelog.ts`.
- ~~Rev. 1935~~ — ver `shared/changelog.ts`.
- ~~Rev. 1934~~ — ver `shared/changelog.ts`.
- ~~Rev. 1933~~ — ver `shared/changelog.ts`.
- ~~Rev. 1932~~ — ver `shared/changelog.ts`.
- ~~Rev. 1931~~ — ver `shared/changelog.ts`.
- ~~Rev. 1930~~ — ver `shared/changelog.ts`.
- ~~Rev. 1929~~ — ver `shared/changelog.ts`.
- ~~Rev. 1928~~ — ver `shared/changelog.ts`.
- ~~Rev. 1927~~ — ver `shared/changelog.ts`.
- ~~Rev. 1926~~ — ver `shared/changelog.ts`.
- ~~Rev. 1925~~ — ver `shared/changelog.ts`.
- ~~Rev. 1924~~ — ver `shared/changelog.ts`.
- ~~Rev. 1923~~ — ver `shared/changelog.ts`.
- ~~Rev. 1922~~ — ver `shared/changelog.ts`.
- ~~Rev. 1921~~ — ver `shared/changelog.ts`.
- ~~Rev. 1920~~ — ver `shared/changelog.ts`.
- ~~Rev. 1919~~ — ver `shared/changelog.ts`.
- ~~Rev. 1918~~ — ver `shared/changelog.ts`.
- ~~Rev. 1917~~ — ver `shared/changelog.ts`.
- ~~Rev. 1916~~ — ver `shared/changelog.ts`.
- ~~Rev. 1915~~ — ver `shared/changelog.ts`.
- ~~Rev. 1914~~ — ver `shared/changelog.ts`.
- ~~Rev. 1913~~ — ver `shared/changelog.ts`.
- ~~Rev. 1912~~ — ver `shared/changelog.ts`.
- ~~Rev. 1911~~ — ver `shared/changelog.ts`.
- ~~Rev. 1910~~ — ver `shared/changelog.ts`.
- ~~Rev. 1909~~ — ver `shared/changelog.ts`.
- ~~Rev. 1908~~ — ver `shared/changelog.ts`.
- ~~Rev. 1907~~ — ver `shared/changelog.ts`.
- ~~Rev. 1906~~ — ver `shared/changelog.ts`.
- ~~Rev. 1905~~ — ver `shared/changelog.ts`.
- ~~Rev. 1904~~ — ver `shared/changelog.ts`.
- ~~Rev. 1903~~ — ver `shared/changelog.ts`.

> Revisões anteriores à 1903: ver `shared/changelog.ts` (histórico completo).

## User preferences

- Idioma de comunicação: pt-BR direto e objetivo.
- Toda revisão DEVE: editar código + bumpar `shared/version.ts` + adicionar entrada NO TOPO de `shared/changelog.ts` + pop oldest do top-5 de `replit.md` (ver convenção acima).
- R-001 / R-007 / R-010: JAMAIS executar `ALTER TABLE`, `DROP`, ou `DELETE` em produção.
