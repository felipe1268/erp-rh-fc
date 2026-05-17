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

- **Rev. 1975**: **RH · RaioXFuncionario · BUGFIX CRÍTICO iOS Safari · `<Lock>` (lucide-react) não importado causava `TypeError: Illegal constructor` no iPad**. User (17/05/2026 07:55, IMG_0835 iPad WebView): print mostra ErrorBoundary com "TypeError: Illegal constructor" + componentStack "Lock@[native code] / 4×div / RaioXFuncionario:179". Erro só no iPad — desktop Chrome funcionava normal. **Diagnóstico** (após melhorar `ErrorBoundary` pra reportar componentStack via `/api/diag/client-error` — bloco âmbar inline + log no server): L973 de `RaioXFuncionario.tsx` (bloco "Isenção de Controle de Jornada — Art. 62 CLT" da Rev. 1878) usa `<Lock className="h-4 w-4" />` mas o import do `lucide-react` (L11-19) ESQUECEU de incluir `Lock`. Em ES modules o identificador não-importado cai no `globalThis`. **iOS Safari expõe `window.Lock`** como classe nativa da Web Locks API → JSX compilado `React.createElement(Lock, ...)` resolve `Lock` pra `window.Lock` → React tenta instanciar → classe nativa lança `TypeError: Illegal constructor`. Desktop Chrome NÃO expõe `window.Lock` global, então o caminho nunca disparou (e/ou o bloco só renderiza com `cargoConfianca===1`, condição rara em testes desktop). **Mudança** (1 linha em 1 arquivo): `client/src/components/RaioXFuncionario.tsx` L22 — adicionado `Lock,` no bloco de imports do `lucide-react`. Identificador local agora aponta pro ícone SVG correto, não mais pro nativo do iOS. version → 1975. **Validação preventiva**: `rg` em todos outros 8 arquivos com `<Lock>` (Colaboradores, EspelhoPonto, ReservasAlert, FechamentoPonto, FolhaPagamento, Login) — todos JÁ importam Lock corretamente. Só RaioX estava órfão. **Hardening paralelo** (`ErrorBoundary.tsx`, sem rev separada — preventivo): (a) reporta erro+componentStack pra `/api/diag/client-error` automaticamente — debug remoto sem precisar print do user; (b) bloco âmbar "Componente que falhou:" inline. **Follow-up sugerido**: ESLint `no-undef` ativo para JSX, ou plugin Vite validando JSX vs imports — pegaria isso em build. **Preservado**: Rev. 1974/1973/1972/1971/1970 INTACTAS. Bloco Art. 62 CLT renderizado idêntico. Backend INTACTO. Schema INTACTO. Zero ALTER/DROP/DELETE. R-001/R-007/R-010 OK. Reversível em 1 linha.
- ~~Rev. 1974~~ — ver `shared/changelog.ts`.
- ~~Rev. 1973~~ — ver `shared/changelog.ts`.
- ~~Rev. 1972~~ — ver `shared/changelog.ts`.
- ~~Rev. 1971~~ — ver `shared/changelog.ts`.
- ~~Rev. 1970~~ — ver `shared/changelog.ts`.
- ~~Rev. 1969~~ — ver `shared/changelog.ts`.
- ~~Rev. 1968~~ — ver `shared/changelog.ts`. User (16/05/2026, IMG_0822+IMG_0823): "Arrume estes gráficos tbm, quero todos responsivos, melhor elaborados, conforme a nossa regras de ouro". **Mudança** em 1 arquivo (`client/src/pages/sst/DashboardAtestadosAcidentes.tsx`): (1) NOVO helper `TooltipPtBR` (mês negrito + dot colorido + valor `fmtNum` pt-BR + sufixo por dataKey, opção `hideZeros` esconde séries zeradas — limpa meses futuros vazios); (2) filtros `lg:grid-cols-[1fr_1fr_auto]` → `md:` e `sm:grid-cols-2 lg:grid-cols-3` → `md:grid-cols-3` (iPad portrait 768px ganha layout completo); (3) gráfico headline "Evolução Mensal" — margens left/right 24, CartesianGrid `vertical={false}`, YAxis labels "Quantidade"/"Dias" rotacionadas, Tooltip custom com sufixo " d" pra dias e hideZeros=true, Legend iconType="circle", Bars `maxBarSize=48`, Lines strokeWidth 2→2.5 + activeDot r=5; (4)+(5) listas "Últimos Atestados/Acidentes" — itens viraram `<button>` clicável → abre raio-x do colaborador (EmployeeDetailDialog); nome em blue-700 + hover underline, hover emerald-50 / red-50, `tabular-nums` em dias/data. version → 1968. **Resultado**: iPad portrait com filtros em 1 tela; tooltip "Mai/26 | Atestados: 19 | Dias Atestado: 26 d" formatado pt-BR; meses futuros sem ruído; clique no Anderson da lista "Últimos" abre raio-x dele. **Preservado**: Rev. 1967/1966/1965 e anteriores INTACTAS. Backend tRPC `sstAnalytics.atestadosAcidentes` INTACTO (zero novo campo — `employeeId` já vinha no payload). Outros 9 gráficos do dash (porTipo/topCIDs/motivos/gravidade/partes/locais/obras/ranking/dia-semana) já estavam em `md:grid-cols-2` desde antes — preservados. Schema INTACTO. Zero tRPC novo. Zero ALTER/DROP/DELETE. R-001/R-007/R-010 OK. Reversível em 1 arquivo.
- ~~Rev. 1967~~ — ver `shared/changelog.ts`. User (16/05/2026, IMG_0820): "Quero poder clicar no nome do funcionário e ver todo cálculo pertinente ao aviso, quero poder selecionar vários e fazer um combo de demissões para ver o fluxo de caixa que vai acontecer". **Mudança** em 1 arquivo (`client/src/pages/dashboards/DashAvisoPrevio.tsx`): (1) novos states `detalheCalc`/`selecionados:Set<number>`/`comboOpen`; (2) helpers `computeDataPagamento` (Art. 477 §6: indenizado=+10d corridos, trabalhado=+diasAviso+1d aprox), `toggleSelecionado`, `toggleSelecionarTodos`, memos `linhasSelecionadas` + `comboAgregado` (somatórios de todas as verbas) + `cronogramaPagamentos` (agrupa por data prevista); (3) coluna checkbox como 1ª col + select-all no header (indeterminate quando parcial) + row destacada azul quando selecionada + tfoot colSpan 11→12; (4) clique no nome agora abre modal "Detalhe do Cálculo do Aviso" (saldo+aviso of/compl+13º+férias prop+vencidas+multa 40% = bruto; − descontos = líquido; + compl = custo total; data prevista pagto + FGTS informativo; botão "Abrir Raio-X"); raio-x movido pra ícone Stethoscope ao lado do nome; (5) barra flutuante azul sticky quando há seleção (contagem+total+botões Limpar/Gerar Combo); (6) modal "Combo de Demissões" com 4 KPIs (qtd/folha/bruto/total) + quebra por verba consolidada + cronograma `<details>` agrupado por data com lista de funcionários expandível. version → 1967. **Resultado**: clique no Anderson IMG_0820 abre detalhe R$ 73.902,97 quebrado verba-por-verba; selecionando 5 mestres abre Combo com cronograma "26/05/2026 · 5 pagamentos · R$ X" (indenizado) ou datas escalonadas (trabalhado). **Preservado**: Rev. 1966/1965/1964/1935 INTACTAS. Backend payload INTACTO (já tinha todos os campos). Schema INTACTO. Zero tRPC novo. Zero ALTER/DROP/DELETE. R-001/R-007/R-010 OK.
- ~~Rev. 1966~~ — ver `shared/changelog.ts`.
- **Rev. 1965 (resumo top-5 expirado, ver changelog)**: **RH · Aviso Prévio · BUGFIX `calcularDiasAviso` (modal subestimava ≈ R$ 2,6k) + DashFerias badge "Nº ano" nos drills não-Vencidas**. User (16/05/2026): (1) "Quero ver na tabela o valor total, que deve ser o mesmo do aviso prévio" — Anderson lista R$ 73.902,97 vs modal R$ 71.281,82, diff persistente pós-Rev. 1964. (2) Choice B prévia: renomear badge "Nº Per." → "Nº ano" nos drills não-Vencidas. **Diagnóstico** (parte 1): a divergência NÃO era no CDM (Rev. 1964 correta) — era no MODAL. Helper `calcularDiasAviso(anos, tipo)` em `server/utils/rescisaoCalc.ts` L250-255 retornava `30` fixos pra qualquer 'trabalhado' (corrente minoritária pre-Rev-1943). Rev. 1943 atualizou `prevTrab`/`prevInd` (L924/L953) pra `calcularDiasAvisoTotal` mas deixou o helper engine pra trás. Resultado: proc `calcular` (L617, usado pelo modal de simulação) computava `dataFimAviso = 16/05 + 30 = 15/06/2026` → 13º=6/12, férias=5/12 — enquanto CDM (com `calcularDiasAvisoTotal` desde Rev. 1909) usava `15/07` → 13º=7/12, férias=6/12. Diff matemática: 1 mês 13º complementar + 1 mês férias prop complementar (com 1/3) + estrutura idêntica oficial ≈ R$ 2.621. **Mudança** (parte 1) em `server/utils/rescisaoCalc.ts` L263-268: condições explícitas em `calcularDiasAviso` — `empregador_trabalhado` → `calcularDiasAvisoTotal(anos)` (alinha Rev. 1943); `empregado_*` outros → 30 fixos (CLT clássica empregado preservada); `empregado_indenizado` → 0 (mantido). Default → `calcularDiasAvisoTotal`. JSDoc extenso justificando + rastreando Rev. 1943. **Mudança** (parte 2) em `client/src/pages/dashboards/DashFerias.tsx` L853-877: badge detecta contexto via `drillDialog?.title.includes("vencidas")`. Drill Vencidas → label "Nº Per." + cor escalada (1=cinza, 2=laranja, 3+=vermelho) + tooltip Art. 137 CLT. Demais drills → label "Nº ano" + cinza neutro + tooltip "Nº ano de serviço". version → 1965. **Resultado**: (1) 4 call sites do `avisoPrevioFerias.ts` (L617 calcular, L1177 criar, L1349 atualizar, L1458 recalc) agora computam 60d (10 anos) pra `empregador_trabalhado` — modal Anderson vai bater 1:1 com CDM. (2) Drill "Finalizando em Mar 2026" mostra "DARCY 9º ano" / "ENIVALDO 13º ano" cinza neutro. **Preservado**: Rev. 1964/1963/1962/1961 INTACTAS. Schema INTACTO. Engine `calcularRescisaoCompleta` INTACTO. Empregado-side INTACTO. R-001/R-007/R-010 OK. Reversível em 2 hunks.
- **Rev. 1964 (resumo top-5 expirado, ver changelog)**: **RH · Dashboard Aviso Prévio · CDM agora calcula descontos legais (INSS+IRRF+pensão+sindical) → lista bate 1:1 com modal**. User (16/05/2026, pós-Rev. 1963, opção A): "Sim retorne". **Diagnóstico**: Anderson R$ 74.507,71 lista (bruto) vs R$ 71.281,82 modal (líquido+compl) — diff ≈ R$ 3.226 = INSS+IRRF. Coluna "Aviso Indeniz." agregava oficial+complementar (R$ 5.821,20+R$ 6.647,93=R$ 12.469,13) sem distinguir. **Mudança** em 2 arquivos: (1) `server/routers/dashboards.ts`: import `calcularDescontosRescisao`+`DescontosRescisaoContext`; SELECT do `getDashCustoDemissaoMassa` ganha 7 cols (`dependentesIR`, `pensaoAlimenticia`, `pensaoTipo`, `pensaoValor`, `pensaoPercentual`, `pensaoBase`, `contribuicaoSindical`); após `calcularRescisaoCompleta`, monta ctx lightweight (numDependentes=0 igual modal, pensaoConfig da row, salarioMinimo=1621, zeros pra faltas/vales/EPI/convênios/outros — ajustes operacionais ficam só no detalhe individual); chama engine → `totalDescontos`+`totalLiquido`; novos campos no objeto: `avisoOficial` (separado de `avisoComplementar`), `totalOficialBruto` (= `totalOficial` legado preservado), `totalOficialLiquido` (novo — pos-descontos, = o que o modal mostra), `totalDescontos`; `total = totalOficialLiquido + totalComplementar` (custo total exibido bate 1:1 com modal). Backwards-compat: `totalOficial` mantém semântica BRUTA legada; `avisoPrevioIndenizado` continua agregado. (2) `client/src/pages/dashboards/DashAvisoPrevio.tsx`: coluna "Aviso Indeniz." mostra `avisoOficial` principal + `+compl {valor}` violeta abaixo (pattern já em uso em "Custo Total" L678-683); tooltip da coluna "Custo Total" detalha `Oficial bruto − Descontos = Líquido + Complementar`; texto explicativo abaixo da tabela atualizado (substitui "Não inclui INSS/IRRF" pela nova composição + nota sobre ajustes operacionais). version → 1964. **Resultado**: Anderson na lista CDM agora aparece R$ 71.281,82 (= R$ 45.428,76 oficial líquido + R$ 25.853,06 complementar — idêntico ao modal). Coluna "Aviso Indeniz." mostra dos R$ 12.469,13 → R$ 5.821,20 oficiais (Lei 12.506) + R$ 6.647,93 complementar. **Premissa**: ajustes OPERACIONAIS (vales/EPI/convênios/faltas) NÃO entram na simulação — variam por mês de competência. Funcionários SEM esses ajustes batem 1:1; COM esses ajustes, CDM fica ligeiramente superior (semanticamente correto pra "pior cenário"). **Preservado**: Rev. 1963 e anteriores INTACTAS. Schema INTACTO (zero ADD COLUMN — só SELECT de cols existentes). Modal `avisoPrevioFerias.ts` INTACTO — só CDM foi alinhado. Zero ALTER/DROP/DELETE. R-001/R-007/R-010 OK. Reversível em 5 hunks.
- **Rev. 1963**: **RH · Dashboard de Férias · Drill "Vencidas" · Badge "Nº do período aquisitivo" agora aparece SEMPRE (não só 2º+)**. User (16/05/2026, screenshot IMG_0817 às 20:13): "Informe se é primeiro ou segundo período". **Diagnóstico**: no drill "Férias — Vencidas" (`DashFerias.tsx` L853-855), o badge `{numeroPeriodo}º Per.` só renderizava quando `np >= 2`. Resultado: EMERSON (1º) não tinha badge, ANA BEATRIZ (11º) tinha "11º Per." âmbar — sem como distinguir 1º de 2º no card. **Mudança** (`client/src/pages/dashboards/DashFerias.tsx`, único arquivo, L856-869): removida condicional `>= 2`. Badge agora SEMPRE renderiza com cor escalando o passivo Art. 137 CLT: 1º=cinza (`bg-slate-100`), 2º=laranja (`bg-orange-100`), 3º+=vermelho (`bg-red-100`). Tooltip explicativo ("1º período aquisitivo" / "Nº — acumulou X período(s) sem gozo, passivo pagamento em dobro Art. 137 CLT"). version → 1963. **Resultado**: cada linha do drill mostra imediatamente o período aquisitivo — triagem visual instantânea (cinza=primeira vez; laranja/vermelho=acúmulo crítico). EMERSON ganha "1º Per." cinza; ANA BEATRIZ mantém "11º Per." vermelho. **Preservado**: `f.numeroPeriodo` no payload backend INTACTO (só client-side); outros badges (RH/Abono) INTACTOS no flex-wrap. Rev. 1962/1961/1960/1959/1958 INTACTAS. Zero schema, zero backend, zero tRPC. Reversível em 1 hunk. R-001/R-007/R-010 OK.
- **Rev. 1962**: **RH · Dashboard de Férias · Bar chart "Em Gozo" (relabel + turquesa) + grids responsivos `lg:` → `md:`**. User (16/05/2026, screenshot IMG_0813 20:06): "No grafico em coluna falta o indicador de em gozo, e quero todos os gráficos responsivos conforme a regra de ouro em todos os dash deste módulo". **Diagnóstico**: (A) série "Em Férias" (azul) no bar chart é semanticamente Em Gozo mas o label+cor divergiam do donut e da Proporção Financeira (que já usam turquesa pra Em Gozo desde Rev. 1961) — usuário não achava o indicador; (B) grids só quebravam pra multi-col em `lg:` (1024px) — tablets 768-1023px desperdiçavam espaço. **Mudança** (`client/src/pages/dashboards/DashFerias.tsx`, único arquivo): (1) L455 série renomeada "Em Férias" → "Em Gozo" + cor `CHART_PALETTE[0]` → `#5CC5CF` (turquesa) — bate 1:1 com donut + barra Proporção Financeira. (2) L150 comentário drill: "0=Em Férias" → "0=Em Gozo". (3) L171 título drill default: "em Férias" → "em Gozo". (4) 5 grids reajustados: KPIs ganharam `md:grid-cols-4` (passo intermediário 7 cols), Linha 1 (timeline+donut) `lg:grid-cols-3` → `md:grid-cols-3` + `md:col-span-2`, Linha 2/3 (custo+setor / setores+obra) `lg:grid-cols-2` → `md:grid-cols-2`, Linha 4 (donuts períodos) `lg:` → `md:`, cards financeiros `lg:grid-cols-4` → `md:grid-cols-4`. version → 1962. **Resultado**: bar mostra "Em Gozo" turquesa imediatamente identificável; iPad portrait (768px) ganha layout 2-3 cols como desktop. Mobile ≤640px continua empilhado. **Preservado**: backend `timelineMensal.emFerias` INTACTO (só relabel client-side); drill mapping datasetIndex INTACTO; Rev. 1961 (cores donut/proporção) e anteriores INTACTAS. Zero schema, zero backend, zero tRPC. Reversível em 9 hunks. R-001/R-007/R-010 OK.
- **Rev. 1961**: **RH · Dashboard de Férias · Repaginação de cores (Concluídas = VERDE)**. User (16/05/2026, screenshot IMG_0812): "Mude as cores da legenda quero os concluídos fiquem na cor verde o resto pode ajustar no que for melhor". **Motivação**: "Concluída" é estado POSITIVO (ciclo fechado, passivo zerado) mas aparecia em CINZA `#6B7280` no donut "Distribuição por Status" e no bar "Colaboradores em Férias por Mês". Verde estava ocupado por "Em Gozo" (donut) e "Iniciando" (bar) — conflito. **Mudança** em 2 arquivos: (1) `server/routers/dashboards.ts` L3042-3047 (statusDist do donut): Em Gozo `#10B981`→`#5CC5CF` (turquesa), Concluídas `#6B7280`→`#10B981` (verde); (2) `client/src/pages/dashboards/DashFerias.tsx`: timeline mensal L454-457 — Iniciando `CHART_PALETTE[1]`→`#A78BDB` (lavanda), Concluídas `#6B7280`→`#10B981` (verde); barra "Proporção Financeira" L415 — Em Gozo `#3B82F6`→`#5CC5CF` + legenda L438 idem. Mantidas: Em Férias (azul), Finalizando (pêssego), Vencidas (vermelho), Agendadas (azul), Férias a Vencer (amber). version → 1961. **Resultado**: nos 3 gráficos do painel de férias, Concluída lê visualmente como sucesso (verde) e Em Gozo mantém destaque sem disputar a cor positiva. **Preservado**: Rev. 1960 (DDS áreas) e anteriores. Zero schema, zero tRPC novo, zero comportamento — apenas 4 strings hex trocadas. Reversível em 4 hunks. R-001/R-007/R-010 OK.
- ~~Rev. 1965~~ — ver `shared/changelog.ts`.
- ~~Rev. 1964~~ — ver `shared/changelog.ts`.
- ~~Rev. 1963~~ — ver `shared/changelog.ts`.
- ~~Rev. 1962~~ — ver `shared/changelog.ts`.
- ~~Rev. 1961~~ — ver `shared/changelog.ts`.
- ~~Rev. 1960~~ — ver `shared/changelog.ts`.
- ~~Rev. 1959~~ — ver `shared/changelog.ts`.
- ~~Rev. 1958~~ — ver `shared/changelog.ts`.
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
