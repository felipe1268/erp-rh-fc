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

- **Rev. 1962**: **RH · Dashboard de Férias · Bar chart "Em Gozo" (relabel + turquesa) + grids responsivos `lg:` → `md:`**. User (16/05/2026, screenshot IMG_0813 20:06): "No grafico em coluna falta o indicador de em gozo, e quero todos os gráficos responsivos conforme a regra de ouro em todos os dash deste módulo". **Diagnóstico**: (A) série "Em Férias" (azul) no bar chart é semanticamente Em Gozo mas o label+cor divergiam do donut e da Proporção Financeira (que já usam turquesa pra Em Gozo desde Rev. 1961) — usuário não achava o indicador; (B) grids só quebravam pra multi-col em `lg:` (1024px) — tablets 768-1023px desperdiçavam espaço. **Mudança** (`client/src/pages/dashboards/DashFerias.tsx`, único arquivo): (1) L455 série renomeada "Em Férias" → "Em Gozo" + cor `CHART_PALETTE[0]` → `#5CC5CF` (turquesa) — bate 1:1 com donut + barra Proporção Financeira. (2) L150 comentário drill: "0=Em Férias" → "0=Em Gozo". (3) L171 título drill default: "em Férias" → "em Gozo". (4) 5 grids reajustados: KPIs ganharam `md:grid-cols-4` (passo intermediário 7 cols), Linha 1 (timeline+donut) `lg:grid-cols-3` → `md:grid-cols-3` + `md:col-span-2`, Linha 2/3 (custo+setor / setores+obra) `lg:grid-cols-2` → `md:grid-cols-2`, Linha 4 (donuts períodos) `lg:` → `md:`, cards financeiros `lg:grid-cols-4` → `md:grid-cols-4`. version → 1962. **Resultado**: bar mostra "Em Gozo" turquesa imediatamente identificável; iPad portrait (768px) ganha layout 2-3 cols como desktop. Mobile ≤640px continua empilhado. **Preservado**: backend `timelineMensal.emFerias` INTACTO (só relabel client-side); drill mapping datasetIndex INTACTO; Rev. 1961 (cores donut/proporção) e anteriores INTACTAS. Zero schema, zero backend, zero tRPC. Reversível em 9 hunks. R-001/R-007/R-010 OK.
- **Rev. 1961**: **RH · Dashboard de Férias · Repaginação de cores (Concluídas = VERDE)**. User (16/05/2026, screenshot IMG_0812): "Mude as cores da legenda quero os concluídos fiquem na cor verde o resto pode ajustar no que for melhor". **Motivação**: "Concluída" é estado POSITIVO (ciclo fechado, passivo zerado) mas aparecia em CINZA `#6B7280` no donut "Distribuição por Status" e no bar "Colaboradores em Férias por Mês". Verde estava ocupado por "Em Gozo" (donut) e "Iniciando" (bar) — conflito. **Mudança** em 2 arquivos: (1) `server/routers/dashboards.ts` L3042-3047 (statusDist do donut): Em Gozo `#10B981`→`#5CC5CF` (turquesa), Concluídas `#6B7280`→`#10B981` (verde); (2) `client/src/pages/dashboards/DashFerias.tsx`: timeline mensal L454-457 — Iniciando `CHART_PALETTE[1]`→`#A78BDB` (lavanda), Concluídas `#6B7280`→`#10B981` (verde); barra "Proporção Financeira" L415 — Em Gozo `#3B82F6`→`#5CC5CF` + legenda L438 idem. Mantidas: Em Férias (azul), Finalizando (pêssego), Vencidas (vermelho), Agendadas (azul), Férias a Vencer (amber). version → 1961. **Resultado**: nos 3 gráficos do painel de férias, Concluída lê visualmente como sucesso (verde) e Em Gozo mantém destaque sem disputar a cor positiva. **Preservado**: Rev. 1960 (DDS áreas) e anteriores. Zero schema, zero tRPC novo, zero comportamento — apenas 4 strings hex trocadas. Reversível em 4 hunks. R-001/R-007/R-010 OK.
- **Rev. 1960**: **SST · DDS Guia · Classificação automática por ÁREA TEMÁTICA via IA + filtros de chip nas abas Biblioteca e Uso por Obra**. User (16/05/2026, após Rev. 1959): "Já classifica cada DDS automaticamente por ia quando fizer o roteiro por categoria e faças filtros separando por categoria fica mais fácil escolher os temas". **Motivação**: `categoria` (NR | CAMPANHA | VACINACAO | LIVRE) é grossa demais — 252+ temas dentro de "NR" vira pajadão. **Decisão**: nova coluna `dds_temas.area_tema VARCHAR(40)` com vocabulário FECHADO de 17 valores (ALTURA, ELETRICA, MAQUINAS, ESCAVACAO, ESPACO_CONFINADO, SOLDAGEM, QUIMICOS, INCENDIO, ERGONOMIA, EPI, SAUDE, TRANSITO, EMERGENCIA, CONDUTA, DOCUMENTACAO, AMBIENTE, GERAL) em `shared/ddsAreas.ts`. Ortogonal a `categoria`. **Mudança** em 6 arquivos: (1) `shared/ddsAreas.ts` (NOVO): catálogo + helpers `coerceDDSArea`/`DDS_AREAS_PROMPT_TEXT`; (2) `drizzle/schema.ts`: coluna nullable + índice; (3) `server/_core/index.ts`: `ALTER TABLE dds_temas ADD COLUMN IF NOT EXISTS area_tema VARCHAR(40)` + index (additivo, padrão SyncSchema+); (4) `server/routers/dds.ts`: `gerarRoteiroComIA` ganha Regra 8 — IA emite `<!-- AREA_TEMA: XXX -->` na 1ª linha, server parseia/remove/retorna `{conteudoMd, areaTema}`. `gerarTemaIA` + `gerarMaisTemasIA` ganham campo `areaTema` no JSON. `criarTema`/`atualizarTema` aceitam areaTema (Zod nullable). Coerção segura: undefined preserva, null limpa, inválido vira null; (5) `client/src/pages/sst/DDSGuia.tsx`: import `DDS_AREAS`/`DDS_AREA_VALUES` + ícone Filter; state `areaFiltro: Set<string>` compartilhado entre Biblioteca/Uso por Obra; chip-row em ambas abas (multi-seleção, contador, "limpar (N)"); badge colorido nos cards (`{emoji} {label}`); novo `<Select>` "Área temática" no modal Novo/Editar; bulk IA (Rev. 1956) e botão individual salvam areaTema SOMENTE se tema ainda não tinha (não sobrescreve manual). `temaForm` ganha campo. handleGerarTemaIA preserva areaTema retornada. version → 1960. **Resultado**: cada tema/roteiro novo é auto-classificado pela IA na mesma requisição (zero round-trip extra); filtro de chips multi-seleção localiza tema em segundos ("queremos falar de andaime" → chip Altura → 8 temas); compartilhado entre as 2 abas. Temas antigos caem em "GERAL" e ganham classificação ao regerar com IA. **Preservado**: Rev. 1959 (Uso por Obra), Rev. 1957 (uso por company), Rev. 1956 (bulk IA), Rev. 1955/1954/1953, templates de roteiro 6 seções, categoria intacta, backwards-compat (campo opcional). Zero DROP/DELETE/ALTER destrutivo (apenas ADD COLUMN IF NOT EXISTS — padrão estabelecido). R-001/R-007/R-010 OK. Reversível em 9 hunks.
- **Rev. 1959**: **SST · DDS Guia · Nova aba "Uso por Obra"** (já usados vs ainda não usados, respeitando permissão do user). User (16/05/2026, screenshot 19h06): "Cria uma aba dizendo o tema já usado na obra que o usuário tem permissão e o que ainda não foram usados". **Diferença vs Rev. 1957** (que conta uso por COMPANY): nova aba conta uso POR OBRA, com seletor que respeita as obras às quais o user tem permissão via `obras.listActive` + `allowedObras` server-side (Rev. 1731). **Mudança** (`client/src/pages/sst/DDSGuia.tsx`, único arquivo): (a) `abrirNovaSessao` ganha 2º parâmetro opcional `obraPre?:{id,ids?}` pra pre-selecionar obra no modal Nova Sessão (compatível c/ chamadas antigas); (b) state `usoObraSelId` (null=todas) + `useMemo usoPorTemaObra` que agrega `sessoes` por `temaId` filtrando por `s.obraId`; quando "todas" usa Set de IDs permitidos do `obrasQ.data` (Avulsas/sem obra contam); (c) `TabsTrigger value="usoobra"` entre Biblioteca e Sessões; (d) `TabsContent` com card de seletor (chips pra cada obra ativa + chip "🌐 Todas minhas obras") + layout 2 colunas: amber "✓ Já usados" ordenado por `diasAtras ASC` (recente 1º) e emerald "✨ Ainda não usados" ordenado por categoria+título. Cada card tem código/categoria/título/linha de uso + botão "Sessão" (Plus) que chama `abrirNovaSessao(t, obraSel)` pré-selecionando obra. Empty states ("Todos foram apresentados 🎉"). Cores por categoria (NR=rose, CAMPANHA=blue, VACINACAO=violet, LIVRE=slate). max-h 600px + overflow auto. version → 1959. **Resultado**: engenheiro abre aba → escolhe sua obra → vê IMEDIATAMENTE os N temas já apresentados ali e os M ainda não; 1 click no "Sessão" abre Nova Sessão com obra pré-selecionada. **Preservado**: Rev. 1957 (`usoPorTema` por company, badges, alerta modal, toggles) INTACTOS — `usoPorTemaObra` é independente. `obras.listActive` permission filter Rev. 1731 INTACTO. Rev. 1956/1955/1954/1953, modal Nova Sessão Rev. 1731, criarSessao mutation. Zero ALTER/DROP/DELETE, zero backend, zero schema, zero tRPC novo. Reversível em 4 hunks. R-001/R-007/R-010 OK.
- **Rev. 1958**: **Infra · Faxina do replit.md + reforço da convenção top-5** (zero código de produção tocado). User (16/05/2026, após 3 sinalizações do sistema de "arquivo grande"): "tem outros 10+ blocos truncados antigos no meio do arquivo... faz uma rev de manutenção só pra essa faxina... arruma isso s para nunca mais acontecer". **Causa-raiz**: revisões anteriores ao colapsar blocos antigos deixaram parágrafos órfãos no meio do arquivo — texto solto sem o prefixo `- **Rev. NNNN**:` (ex.: linhas começando com " User (...)" ou ": respeitar..."). Alguns blocos truncados ficaram com placeholder HTML `<!-- DETALHES REVS ANTIGAS -->` no meio do parágrafo, criando duplicação confusa entre `replit.md` e `shared/changelog.ts`. **Mudança** (`replit.md` único arquivo): (a) seção "Recent changes" reescrita do zero: 5 revisões expandidas (1958/1957/1956/1955/1954) + 49 revisões colapsadas (1953→1905) cada uma em 1 linha limpa `- ~~Rev. NNNN~~ — ver \`shared/changelog.ts\`.`; (b) bloco "Convenção" expandido com regra explícita ANTI-bug: cada linha deve começar com `- ` (hífen+espaço), placeholders HTML BANIDOS, fluxo step-by-step ao criar nova rev. version → 1958 (bump simbólico — apenas infra/docs). **Resultado**: replit.md cai de 111 linhas (~10400 tokens) p/ ~70 linhas (~3500 tokens). Sistema deixa de sinalizar "arquivo grande". Convenção reforçada protege contra regressão futura. **Preservado**: Cabeçalhos Run/Stack/Where things live INTACTOS, `shared/changelog.ts` INTACTO (continua sendo a fonte única de detalhes históricos), Rev. 1957 (DDS uso/badge/alerta), Rev. 1956/1955/1954/1953 (geração IA + 80 temas). Zero código aplicação, zero schema, zero backend. Reversível em 1 hunk. R-001/R-007/R-010 OK.
- ~~Rev. 1957~~ — ver `shared/changelog.ts`.
- ~~Rev. 1956~~ — ver `shared/changelog.ts`.
- ~~Rev. 1955~~ — ver `shared/changelog.ts`.
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
