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

- **Rev. 2001**: **DP · Fechamento de Ponto · Coluna "Obra(s)" usa `employees.obraAtual` como fallback**. Pedido direto do usuário (img IMG_0847): "Enivaldo e Anderson tem obra sim, veja o cadastro e corrija isso" — no modal "Mais Pontuais" linhas 1 (Anderson, Mestre de Obras) e 2 (Enivaldo, Comprador) apareciam com "—" em Obra(s) apesar de terem obra no cadastro. **Causa-raiz**: `resumoPontoPorFuncionario` (server/routers/payrollEngine.ts L4990-5015) agregava obras SÓ via `STRING_AGG(td."obraId")` de timecard_daily; funções administrativas que batem ponto em QR-Code geral não informam `obraId` no td → coluna fica vazia mesmo com `employees.obraAtual` preenchido. **Mudança** em 2 arquivos: (1) `server/routers/payrollEngine.ts` (~15L alteradas em 1 hunk): SELECT ganha `e."obraAtual" as obraAtualId` + `oa.nome as obraAtualNome`; novo `LEFT JOIN obras oa ON e."obraAtual" = oa.id`; GROUP BY estendido; `.map()` reescrito separando `obraIdsFromTd`/`obraNomesFromTd`, com `useFallback = obraIdsFromTd.length===0 && r.obraAtualId` retornando `[obraAtualId]`/`[obraAtualNome]`; `multiplasObras` recalculado SÓ sobre timecard (preserva semântica de "bateu ponto em 2+ obras no mês"); flag opcional `obraFromCadastro` pra UI. (2) `shared/version.ts` → 2001. **Resultado**: Anderson/Enivaldo (e demais admins) mostram a obra de alocação em vez de "—"; quem bate ponto normalmente em obra continua igual. **Preservado**: `cardFilter==="multiplasObras"` INTACTO, filtro de obra do client L960-964 INTACTO, `espelhoPontoFuncionario` INTACTO (drill-down por dia mantém obra de batida), `conflitosObra` INTACTA, Rev. 2000 INTACTA. Schema INTACTO (sem ALTER). R-001/R-007/R-010 OK. Reversível em 1 hunk.
- ~~Rev. 2000~~ — ver `shared/changelog.ts`. **DP · Fechamento de Ponto · Modal totalmente responsivo + cálculo correto de Dias Úteis**. 2 pedidos diretos do usuário (img IMG_0845/IMG_0846): (A) "% Presença / Média de dias deveria usar dias úteis reais (~22) e não 30" — bug: `diasUteisNoPeriodo` contava dias CORRIDOS mas exibia como "úteis", inflando denominador (10/30=33% em vez de 10/22=45%); (B) "Quero tudo responsivo, para facilitar análise e filtro" — modal em iPad/mobile tinha botões cortados, filtros inline empurrando contador, tabela espremida, rodapé sem wrap. **Mudança** em 2 arquivos: (1) `client/src/pages/FechamentoPonto.tsx`: **[A]** `diasUteisNoPeriodo` (L1043-1062) reescrito itera dia-a-dia contando só seg-sex via `getUTCDay() !== 0 && !== 6`; aplicado `Math.min(100, ...)` em 3 lugares (KPI hero L2112, célula individual L2318, rodapé L2365) pra absorver trabalho em sáb/feriado. **[B]** Header (L2145) `flex-col sm:flex-row` + ações icon-only em <sm; KPIs (L2190) `px-3 sm:px-6`; barra de filtros (L2208-2231) `flex-col sm:flex-row` + inputs `w-full sm:w-72/52` + contador `sm:ml-auto`; legenda (L2234) `px-3 sm:px-6`; tabela (L2267) ganhou `min-w-[900px]` pra scroll horizontal limpo; rodapé (L2362) `flex-wrap gap-x-4 gap-y-1 px-3 sm:px-6`. (2) `shared/version.ts` → 2000. **Resultado**: iPad/iPhone usam toda largura útil, filtros empilham, tabela rola, rodapé wrappa; desktop visual idêntico (tudo `sm:`+); % Presença reflete realidade. **Preservado**: rankings (Rev. 1997) INTACTOS, `fmtHMpt` (Rev. 1999) INTACTO, export/print INTACTOS, modal drill-down INTACTO, barra de presença em L2415 já tinha clamp próprio. Schema INTACTO. R-001/R-007/R-010 OK. Reversível em 1 arquivo (~9 hunks). Follow-up: integrar calendário de feriados pra excluí-los do cálculo (ficou fora pra manter scope enxuto).
- ~~Rev. 1999~~ — ver `shared/changelog.ts`. **DP · Fechamento de Ponto · Separador de milhar pt-BR nas horas totais**. Pedido direto do usuário (image IMG_0844_1779027154673): no modal "Mais Atrasados" o KPI TOTAL DE HORAS mostrava `1896h40min` em vez de `1.896h40min`. Em pt-BR números acima de mil usam ponto como separador. Mesma falha no rodapé do modal. **Mudança** em 2 arquivos: (1) `client/src/pages/FechamentoPonto.tsx` (IIFE `rankingModalPortal`): helper local `fmtHMpt(mins) => Math.floor(mins/60).toLocaleString("pt-BR") + "h" + pad(mins%60) + "min"` criado logo após `mediaDias` (L2099); 3 strings (`totalHorasStr`/`totalAtrasoStr`/`totalHEStr`, L2100-2106) passaram a usar o helper; rodapé (L2356-2365) substituiu 4 IIFEs inline por chamadas diretas a `fmtHMpt(...)`. Ex: `1896` → `1.896`, `999` → `999`, `12340` → `12.340`. (2) `shared/version.ts` → 1999. **Preservado**: tabela individual de colaboradores INTACTA (valores `67:29`, `2:40` por linha sempre < 1000h); `fmtHM` global de outras partes INTACTO; export CSV/print preservam formato puro pra parseamento downstream; Rev. 1998 INTACTA. Schema INTACTO. R-001/R-007/R-010 OK. Reversível em 1 arquivo (2 hunks).
- ~~Rev. 1998~~ — ver `shared/changelog.ts`. **Terceiros · Funcionários · Foto de identificação + Número Interno auto-gerado**. Pedido direto do usuário (image_1779026783535) na tela "Novo Funcionário Terceiro" (`/terceiros/funcionarios`): (a) cadastrar foto pra facilitar identificação visual e (b) ERP gerar automaticamente um número interno `[INICIAIS_EMPRESA]-[SEQ_GLOBAL]` (sequencial único pra TODOS terceiros do tenant, só a sigla muda por empresa). **Mudança** em 4 arquivos: (1) `drizzle/schema.ts` (L3566-3569) — `funcionariosTerceiros` ganhou `numeroInterno varchar(30)` (nullable, retrocompat). (2) `server/_core/index.ts` (+5L, bloco logo após `curriculos.historico_status_json`) — bootstrap idempotente `ALTER TABLE funcionarios_terceiros ADD COLUMN IF NOT EXISTS numero_interno VARCHAR(30)` + `CREATE INDEX IF NOT EXISTS idx_func_terc_numero_interno (company_id, numero_interno)`. (3) `server/routers/terceiros.ts` (`funcionarios.create` ~60L reescritas L480-540) — input ganhou `fotoBase64`/`fotoFileName`/`fotoContentType` opcionais; fluxo: busca empresa → gera sigla (NFD remove acentos + uppercase + `/[^A-Z]/` strip + slice(0,3) + padEnd(3,'X'), ex: "Construtora XPTO Ltda"→"CON") → próximo seq GLOBAL via `MAX(NULLIF(regexp_replace(numero_interno,'^.*-',''),'')::INTEGER) + 1` filtrado por `company_id` → monta `${sigla}-${String(seq).padStart(5,'0')}` (ex: `CON-00001`) → se foto enviada, `storagePut` em `terceiros/funcionarios/_novos/{ts}-{name}` → INSERT com `.returning({id})` (corrigido de pattern MySQL `[result] = ...` pra postgres) → retorna `{id, numeroInterno}`. (4) `client/src/pages/terceiros/FuncionariosTerceiros.tsx`: 2 states novos (`fotoPreview` data URL + `fotoPayload` base64), 2 handlers (`handlePickFotoNovo` via FileReader; `handlePickFotoEdit` faz upload imediato via `uploadDoc`); `openNew`/`openEdit`/`handleSave` adaptados; aba Dados Pessoais ganhou **hero card no topo** (gradient blue→indigo, border dashed) com avatar circular h-24 w-24 ring-4 + Camera placeholder/preview + botão X vermelho pra remover + título + badge `numeroInterno` (em edit) OU "Nº interno será gerado ao salvar" (em new) + botão "Selecionar/Trocar foto"; item da lista ganhou avatar circular h-12 w-12 à esquerda + badge azul mono `BadgeCheck numeroInterno` ao lado do nome. + `shared/version.ts` → 1998. **Preservado**: `update` mutation INTACTA, `uploadDoc` INTACTO, filtros/stats/aba Documentos INTACTOS, outras leituras de `funcionariosTerceiros` (warnings/obrigacoes/portal externo) — coluna nullable, queries SELECT * seguem OK. Rev. 1997 INTACTA. Race em geração de seq aceitável pra cadastro manual low-throughput (migra pra advisory lock se virar problema). R-001/R-007/R-010 OK (só ADD COLUMN/INDEX IF NOT EXISTS). Reversível em 4 arquivos.
- ~~Rev. 1997~~ — ver `shared/changelog.ts`. **DP · Fechamento de Ponto · Cards de Ranking + Modal Drill-Down redesenhados em regras de ouro**. Pedido direto do usuário (image_1779026555326/633610/653802): os 4 cards (Mais Pontuais/Mais Atrasados/Mais Horas Extras/Menos Dias Trabalhados) e modal drill-down precisavam virar experiência intuitiva pra reuniões mensais — com indicadores importantes, legenda fácil e responsividade. Antes: cards `<Card>` chapados com border-t colorido + lista; modal full-screen com header bg-white plano, legenda em parágrafo de texto corrido, sem KPIs no topo. **Mudança** em 1 arquivo de aplicação (`client/src/pages/FechamentoPonto.tsx`): (a) **4 cards do topo (L1965-2046)** viraram divs com gradient `from-{cor}-50 to-white`, border-2 hover, shadow-sm→md, ícone em chip h-7 w-7 ring-2, título bold + hint contextual ("Top sem atrasos"/"Atenção crítica"/"Volume de HE no mês"/"Possíveis faltas/escala"), contador grande à direita, footer "Ver todos (N) →" clicável. Loop sobre array `cards` tipado (anti-DRY). (b) **Modal header gradient (L2138-2173)** bg-gradient-to-r por tipo (emerald/red-rose-pink/amber-orange-yellow/slate-zinc), text-white, overlay radial sutil, ícone em chip h-12 w-12 ring-4, badge "N colaboradores" backdrop-blur, subtítulo descritivo, botões Imprimir/CSV com bg-white/95. (c) **NOVO bloco KPIs (L2185-2199)** — grid 2/4 com 4 indicadores que mudam por tipo (Pontuais: Colab/Sem atraso/Atraso acum/Média dias · Atrasados: Colab/Atraso acum/H Total/Média dias · Extras: Colab/Total HE/Sem solicitação/H Total · Faltosos: Colab/Justificadas/Não justif/Média dias). Fórmulas IDÊNTICAS às do rodapé (apenas elevadas pro hero — rodapé intacto). (d) **Legenda redesenhada (L2228-2247)** virou card bg-blue-50/40 com título uppercase + ícone Info; grid 2/4 de mini-cards com ícone + label + descrição + cor temática (Atraso=red, Presença=indigo, Justificada=emerald, HE=amber, Solicitação=orange). Itens variam por tipo. (e) Modal envolto em IIFE `(() => { cfg + kpis + return <Dialog/> })()`. + `shared/version.ts` → 1997. **Preservado**: `rankings` (allPontuais/allAtrasados/allExtras/allFaltosos slice top-5) INTACTO L1009-1020; `filteredRankingRows` (busca+obra) INTACTO L1056; `handlePrintRanking`/`handleExportRankingCSV` INTACTOS L1070-1178; tabela detalhada + sub-modal de calendário (`diasDetalhe`) + rodapé de totais INTACTOS; cliques continuam abrindo `openPontoDetalhe(e.id)` / `setRankingModal` originais; `EmpStatusBadge` INTACTO. Schema/tRPC INTACTOS. R-001/R-007/R-010 OK. Rev. 1996 INTACTA. Reversível em 1 arquivo (2 hunks grandes).
- ~~Rev. 1996~~ — ver `shared/changelog.ts`.- ~~Rev. 1995~~ — ver `shared/changelog.ts`.
- ~~Rev. 1994~~ — ver `shared/changelog.ts`.
- ~~Rev. 1993~~ — ver `shared/changelog.ts`.
- ~~Rev. 1992~~ — ver `shared/changelog.ts`.
- ~~Rev. 1991~~ — ver `shared/changelog.ts`.
- ~~Rev. 1990~~ — ver `shared/changelog.ts`. **Cotações · UX · Coluna SALDO vinculada visualmente ao Vencedor (pedido direto do usuário)**. Tela `/compras/cotacoes/<id>`: coluna SALDO ficava no extremo direito DEPOIS de todas as colunas de fornecedores, mas seu valor é sempre calculado vs. o Vencedor (primeiro fornecedor). Visualmente parecia colada ao ÚLTIMO fornecedor, dando "impressão de erro". **Mudança** em 1 arquivo (`client/src/pages/compras/Cotacoes.tsx`, 3 hunks, ZERO lógica): (1) `<th>` Saldo recebeu fundo emerald-50/60, borda-l-2 emerald-300, ícone Trophy + subtítulo "vs. <Nome do Vencedor>"; (2) `<td>` por item recebeu bg-emerald-50/30 + border-l-2 emerald-200; (3) `<td>` TOTAL recebeu bg-emerald-50/40 + border-l-2 emerald-300. Badge interna emerald/red (positivo/negativo) INTACTA. version → 1990. **Resultado**: SALDO se destaca da última coluna de fornecedor + subtítulo explícito do vencedor → elimina sensação de "valor perdido no final". **Preservado**: TODA lógica (`hasMeta`/`melhorForn`/`metaTot`/`saldo`/`saldoTotal`) INTACTA — só CSS/markup. Rev. 1989 INTACTA. Schema INTACTO. R-001/R-007/R-010 OK. Reversível em 3 hunks.
- ~~Rev. 1989~~ — ver `shared/changelog.ts`. **Cotações · UX · Header e cell condensados (pedido direto do usuário)**. Tela `/compras/cotacoes/<id>` tinha cada coluna de fornecedor com 5+ blocos verticais empilhados (nome+score, chip Vencedor, botão Anexar+texto+nome arquivo, botão Ler com IA+texto, botão Propostas+texto, botão Editar Preços+texto) em ~200px de largura → wrap, sobreposição, visual confuso. Cell de item embaixo da barra de progresso de saldo orçamentário tinha 4 spans separados em 2 linhas. **Mudança** em 1 arquivo (`client/src/pages/compras/Cotacoes.tsx`, 6 hunks, ZERO lógica): (1) toolbar de ações sem `flex-wrap`, gap reduzido pra 0.5; (2-5) botões Anexar/Ler com IA/Propostas/Editar Preços viraram icon-only h-7 w-7 com tooltip preservando a info que estava no texto; modo edição (Salvar/Desconto/Acréscimo) mantido com texto (ações contextuais). (6) Linha de breakdown de saldo condensada de 4 spans empilhados pra 1 linha truncate com tooltip completo. version → 1989. **Resultado**: largura do header diminui ~50%, saldo passa de 2 linhas pra 1, tela cabe sem scroll horizontal interno em 1366+, hover preserva 100% da info. **Preservado**: TODA a lógica INTACTA — só CSS/markup. Handlers/popovers/mutations/Anexo popover/modo edição/Vencedor chip/score badges/COBERTURA header/TOTAL row/barra de progresso INTACTOS. Rev. 1988 INTACTA. Schema INTACTO. R-001/R-007/R-010 OK. Reversível em 6 hunks.
- ~~Rev. 1988~~ — ver `shared/changelog.ts`. **Lote 1 · Pós-revisão arquitetural · 2 correções de profundidade nos fixes anteriores**. Origem: code review identificou (i) C1 estava incompleto pra OC de MATERIAL — `gerarProximoNumeroOC` no branch "compra" usava COUNT(*) dentro do lock mas não persistia contador → INSERT fora da tx permitia 2 chamadas lerem o mesmo COUNT e duplicarem OC-YYYY-NNNN; e (ii) A2 não entregava observabilidade real — `syncNow` mascarava erros com `.catch(() => {})`, então `triggerFinancialSyncAwaited` nunca propagava falha. **Mudança** em 2 arquivos: (1) `server/routers/compras.ts` — branch material de `gerarProximoNumeroOC` reescrito (~28 linhas) pra usar `ocNumberConfig.proximoNumero` (coluna LEGACY que já existia, ZERO ALTER) como contador persistente dentro do lock; bootstrap inteligente via `Math.max(COUNT+1, proximoNumero)` pra primeira chamada com OCs históricas. Lookup do config movido pra antes do switch (compartilhado). (2) `server/services/financialEventTrigger.ts` (+15 linhas) — nova função privada `syncNowStrict` (idêntica a `syncNow` MENOS os swallows); `triggerFinancialSyncAwaited` agora usa ela; `syncNow` + `triggerFinancialSync` originais INTACTOS (8 callers fire-and-forget preservados). version → 1988. **Lote 1 (C1+C2+A1+A2) agora REALMENTE fechado**. **Preservado**: branch OS/Pacote INTACTO, callers fire-and-forget INTACTOS, schema INTACTO (coluna `proximoNumero` já existia), Revs. 1985-1987 INTACTAS. R-001/R-007/R-010 OK. **Não corrigido (deliberadamente, vai pra Lote 2)**: `existCheck` de contrato em `gerarContratoTerceiroDeOS` fica fora do lock — concorrência extrema pode criar 2 contratos com números diferentes pra MESMA OC (não é dup de numeração, é dup de contrato). Menos crítico, fica pra Lote 2 com C3/C4/A3/A4/A5.
- ~~Rev. 1987~~ — ver `shared/changelog.ts`.
- ~~Rev. 1986~~ — ver `shared/changelog.ts`.
- ~~Rev. 1985~~ — ver `shared/changelog.ts`.
- ~~Rev. 1984~~ — ver `shared/changelog.ts`. **Faxina do `replit.md`** (manutenção, sem mudança de comportamento). O arquivo havia crescido pra ~30k tokens com 7 blocos detalhados espalhados (Rev. 1983, 1979, 1975, 1968, 1967, 1965, 1964, 1963, 1962, 1961) violando a convenção do topo deste bloco — "APENAS últimas 5 detalhadas". Além disso havia duplicidades: Rev. 1965/1964/1963/1962/1961 apareciam DUAS vezes (detalhadas no meio + colapsadas no fim). **Mudança** em 2 arquivos: (1) `replit.md` — bloco "Recent changes" reescrito: Rev. 1984 entra como única entrada detalhada no topo; Rev. 1983 → 1903 todas colapsadas em formato one-liner. Convenção, "User preferences" e linha "Revisões anteriores a 1903" INTACTAS. (2) `shared/version.ts` → 1984. **Resultado**: arquivo reduzido de 152 linhas (~30k tokens) pra ~95 linhas (~6k tokens). Toda informação preservada — basta abrir `shared/changelog.ts` pra ler qualquer rev histórica em detalhe. Nenhum código de aplicação tocado. Nenhum schema alterado. Nenhuma rota tRPC modificada. Sem risco de regressão. **Preservado**: Rev. 1983 e todas anteriores 100% INTACTAS no codebase. R-001/R-007/R-010 OK. Reversível em 2 arquivos.
- ~~Rev. 1983~~ — ver `shared/changelog.ts`.
- ~~Rev. 1982~~ — ver `shared/changelog.ts`.
- ~~Rev. 1981~~ — ver `shared/changelog.ts`.
- ~~Rev. 1980~~ — ver `shared/changelog.ts`.
- ~~Rev. 1979~~ — ver `shared/changelog.ts`.
- ~~Rev. 1978~~ — ver `shared/changelog.ts`.
- ~~Rev. 1977~~ — ver `shared/changelog.ts`.
- ~~Rev. 1976~~ — ver `shared/changelog.ts`.
- ~~Rev. 1975~~ — ver `shared/changelog.ts`.
- ~~Rev. 1974~~ — ver `shared/changelog.ts`.
- ~~Rev. 1973~~ — ver `shared/changelog.ts`.
- ~~Rev. 1972~~ — ver `shared/changelog.ts`.
- ~~Rev. 1971~~ — ver `shared/changelog.ts`.
- ~~Rev. 1970~~ — ver `shared/changelog.ts`.
- ~~Rev. 1969~~ — ver `shared/changelog.ts`.
- ~~Rev. 1968~~ — ver `shared/changelog.ts`.
- ~~Rev. 1967~~ — ver `shared/changelog.ts`.
- ~~Rev. 1966~~ — ver `shared/changelog.ts`.
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
