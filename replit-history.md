# Histórico de revisões antigas — ERP RH & DP FC Engenharia

> Este arquivo guarda os one-liners das revisões antigas para manter o `replit.md` enxuto.

- **Rev. 2390** — ALMOXARIFADO/UX · Transferência em LOTE no sticky bar do modo seleção (N itens → 1 destino comum, qtd editável por linha). Novo `createTransferenciaLote` itera linha-a-linha reusando lógica do single; modal max-w-2xl roxo→indigo com painel de resultado parcial (sucessos/falhas). Ver `shared/changelog.ts`.
- **Rev. 2389** — GOVERNANÇA/COMPRAS · Guarda determinística impede que OCs de SERVIÇO / ADMINISTRATIVO / TRIBUTO virem item de Almoxarifado. Função `classificarNaturezaItemAlmox` aplicada em `atualizarStatusOrdem` (per-item) + `warehouse.registerSmartEntry` (itemNovo). Ver `shared/changelog.ts`.
- **Rev. 2388** — SEGURANÇA · Controle rígido de auditoria no Almoxarifado: excluir item/unidade + alterar qtd manualmente → senha (se user local) + justificativa; log com snapshot antes/depois; tela de admin pra validar/rejeitar. Nova tabela `almoxarifado_auditoria` (CREATE IF NOT EXISTS). Ver `shared/changelog.ts`.
- **Rev. 2387** — UX · Substituídos os 2 `window.confirm()` nativos que sobravam no Almoxarifado por modais customizados (header red→rose + Trash2). Print iPad mostrava confirm nativo do Safari com URL Replit ocupando 3 linhas + opção "Bloquear caixas". Ver `shared/changelog.ts`.
- **Rev. 2386** — FEATURE · IA sugere categorias para itens "Sem categoria" no Almoxarifado (em lote, com modal de revisão); vocabulário fechado (`almoxarifado_categorias`); apply POR IDS via `atualizarCategoriaEmLote`. Ver `shared/changelog.ts`.
- **Rev. 2385** — UX · Filtro "⚠️ Sem categoria" no dropdown de categorias do Almoxarifado (view por obra E consolidado). `<option value="__sem__">` + filtro em `lista`/`consFinal`. Ver `shared/changelog.ts`.
- **Rev. 2382** — FEATURE · Multi-seleção de itens no Almoxarifado (por obra): alterar categoria em lote + unificar duplicatas (mesma obra/nome/unidade) somando quantidades no item de MAIOR qtd, migrando movimentações + recebimentos. Transação. Ver `shared/changelog.ts`.
- **Rev. 2381** — FEATURE · Botão "Trocar foto" nos cards do Almoxarifado (modal violet com input editável + preview dryRun → aplicar). Usuário ajuda a IA fornecendo termo de busca mais específico quando nomes genéricos retornam fotos ruins. Ver `shared/changelog.ts`.
- **Rev. 2380** — UX · Widget de progresso da "Busca de fotos na web" reformulado em card 340px com "{pct}%" gigante + ETA dinâmica + barra h-3 sky→blue + 3 contadores no footer. Ver `shared/changelog.ts`.
- **Rev. 2379** — UX · Polimento do modal "Buscar fotos" + conversão do `window.confirm()` do botão "Preencher preços com IA" pra modal violet/purple com Sparkles. Mesmo layout dos modais de fotos. Ver `shared/changelog.ts`.
- **Rev. 2378** — UX · Substituído `window.confirm()` por modal customizado no fluxo "Buscar fotos da web" do Almoxarifado. Print do iPad mostrava nativo Safari com URL Replit ocupando 3 linhas no título. Header sky/blue + Globe, body com bullets, z-[110]. UI-only. Ver `shared/changelog.ts`.
- **Rev. 2377** — FEATURE · "Buscar fotos da web" no Almoxarifado — mesma abordagem da Rev. 2366 (DDG Images, 1 chamada por nome, UPDATE em lote). Backend `compras.buscarFotoWebPorNome` com match normalizado por regex (strip `[N.N]` em ambos lados). Frontend: botão hero "Fotos da web" + botão por card + widget de progresso. Ver `shared/changelog.ts`.
- **Rev. 2376** — UX/ALERTA · Botão ENTRADA do Almoxarifado pisca com badge vermelho mostrando quantas OCs de MATERIAL estão pendentes (complementa Rev. 2375 que tratou só LOCAÇÃO). Nova `warehouse.listPendingOCs.useQuery` com refetch 60s. UI-only. Ver `shared/changelog.ts`.
- **Rev. 2375** — UX/ALERTA · Botão "RECEBER LOCAÇÃO" do Almoxarifado pisca com badge vermelho da qtd. de equipamentos pra chegar (OCs de locação pendentes). Reusa `equipamentos.ocsLocacaoPendentes` (Rev. 2371) com refetch 60s. UI-only. Ver `shared/changelog.ts`.
- **Rev. 2374** — FEATURE · Classificar equipamentos do Almoxarifado como Próprio FC ou Alugado em LOTE — múltipla seleção visual + sticky bar com 2 botões; fila em sessionStorage (com companyId guard) leva pros forms de Próprios/Locados pré-preenchidos. Ver `shared/changelog.ts`.
- **Rev. 2373** — FEATURE · Controle de insumos a granel (areia/pedra/lajota): (A) toggle MANUAL "insumo a granel = aplicação direta" no cadastro; (B) nova tela "Inventário Visual (Baias)" mobile-first com 5 botões grandes (VAZIA / 1/4 / METADE / 3/4 / CHEIA), foto opcional, histórico c/ tendência. Ver `shared/changelog.ts`.
- **Rev. 2372** — UX · "DEVOLVER LOCAÇÃO" do Almoxarifado agora abre PICKER VISUAL com cards grandes (foto + descrição + obra + fornecedor) dos equipamentos em uso — operador de 4ª série escolhe e devolve em 2 cliques. Ver `shared/changelog.ts`.
- **Rev. 2371** — FEATURE · "Receber Locação na Obra" lista OCs de locação pendentes no topo do modal (almoxarife dá entrada com 1 clique). Backend `equipamentos.ocsLocacaoPendentes` com companyFilter, frontend pré-preenche dados. Ver `shared/changelog.ts`.
- **Rev. 2370** — UX/BUGFIX · Barra de busca de Equipamentos Locados promovida pra linha própria full-width (no iPad colapsava em ~100px mostrando só o ícone) + botão limpar (X). Selects Obra+Categoria migrados pra row abaixo. Ver `shared/changelog.ts`.
- **Rev. 2369** — FEATURE/UX · "Trocar foto com outro termo": modal de rebusca com query customizada + preview antes de aplicar. Backend `queryOverride`+`dryRun` em `locadosBuscarFotoWebPorDescricao` e `fotosCanonicasBuscarWebUpsert`. Ver `shared/changelog.ts`.
- **Rev. 2368** — UX · Lightbox de foto na Biblioteca: clicar no thumbnail amplia em fullscreen (ESC ou click fora fecha). Aplicado em 4 lugares (modal Biblioteca, cards de grupo, cards de unidade, modal Eventos). Ver `shared/changelog.ts`.
- **Rev. 2367** — FEATURE/UX · Extensão do "Buscar na web" (Rev. 2366) pra dentro do modal Biblioteca de fotos — DDG → baixa o arquivo → storagePut → upsert em `equipamentos_fotos_canonicas` → propaga pras unidades. SSRF guard em 3 camadas no download. Ver `shared/changelog.ts`.
- **Rev. 2366** — FEATURE/UX · Busca de foto "como usuário normal faria" em `/equipamentos/locados`: descrição → DuckDuckGo Images → 1º resultado → UPDATE em todas as unidades. ZERO LLM. Botão hero, thumbnails interativos, widget de progresso. Ver `shared/changelog.ts`.
- **Rev. 2365** — UX/REORG + KPI · Análise IA "Comprar vs Continuar Alugando" migrada de `/equipamentos/locados` pra Dashboard Almoxarifado aba "Equip. Locados", agora com KPI 0-100% em anel SVG. Ver `shared/changelog.ts`.
- **Rev. 2364** — UX/REDESIGN · Modal de cadastro de Equipamentos Próprios refeito do zero pra "servente consegue cadastrar" (foto no topo c/ câmera traseira, descrição único obrigatório, 8 chips de categoria toque, mais detalhes collapsible, bottom-sheet). Ver `shared/changelog.ts`.
- **Rev. 2363** — UX/FILTRO · Cards KPI da aba "Equip. Locados" do Dashboard Almoxarifado ficaram CLICÁVEIS — clique aplica filtro contextual à tabela abaixo (troca fonte + título + colunas). Ver `shared/changelog.ts`.
- **Rev. 2362** — FEATURE/IA · Nova análise "Comprar vs Continuar Alugando" em /equipamentos/locados — IA estima preço de mercado de cada descrição e calcula payback + recomendação (migrada pra Dashboard na Rev. 2365). Ver `shared/changelog.ts`.
- **Rev. 2361** — UX/FILTRO · Cards KPI de Equipamentos Locados ficaram CLICÁVEIS (drill-down por urgência) + novo card "Vencendo (5d)" + grid 5col responsivo (2/3/5). Ver `shared/changelog.ts`.
- **Rev. 2358** — FEATURE/UX · Import PDF de locação ganha campo "Fornecedor (locadora) deste PDF" + botão "Aplicar a todos" pra padronizar o fornecedor em todos os contratos do mesmo PDF. Ver `shared/changelog.ts`.
- **Rev. 2357** — HOTFIX/UX · Modal drill-down de "Locações mês a mês" ganha botão "Fechar" no rodapé + altura usa `dvh` em vez de `vh` pra respeitar a URL bar dinâmica do iOS Safari. Ver `shared/changelog.ts`.
- **Rev. 2356** — UX/REDESIGN · Hub de Equipamentos (`/equipamentos`) ganha layout 100% renovado: agrupamento client-side por (descricao+obra+fornecedor+fim), 4 KPIs, cards com badge urgência semaforizado e barra de progresso. Ver `shared/changelog.ts`.
- **Rev. 2355** — FEATURE/SOLUÇÃO DEFINITIVA · Biblioteca CURADA de fotos de equipamentos locados por descrição canônica. Substitui de vez a "busca de fotos com IA" (revs 2340-2350). User sobe 1 foto por descrição → ERP propaga pra TODAS as unidades atuais + futuras. Ver `shared/changelog.ts`.
- **Rev. 2354** — UX · Inputs de dinheiro no preview do import PDF de locação passam a usar formato BRL "R$ X.XXX,XX" (ponto de milhar + vírgula decimal). Ver `shared/changelog.ts`.
- **Rev. 2353** — FEATURE/REGRA · Import PDF de locação EXIGE obra vinculada por contrato antes de cadastrar (client bloqueia botão + server recusa BAD_REQUEST + banner vermelho + agrupamento por descricao+obra). Ver `shared/changelog.ts`.
- **Rev. 2351** — HOTFIX/FEATURE · Extração de PERÍODO DE LOCAÇÃO por contrato no import PDF reforçada (prompt Gemini com 8 regras + 3 exemplos F051/R051; `toIso` aceita D/M/AAAA, DD-MM, DD.MM; fallback fim = início + 30 dias). Ver `shared/changelog.ts`.
- **Rev. 2350** — CAUSA RAIZ ENCONTRADA · Busca de fotos com IA — GOOGLE_API_KEY tem Custom Search BLOQUEADO no GCP + OpenVerse/Wikimedia indexam quase só EN. Fix: LLM gera query EN curta, cascade OV→WM, blocklist cirúrgica + barra PDFs, fallback EN por categoria. Ver `shared/changelog.ts`.
- **Rev. 2349** — SOLUÇÃO DEFINITIVA · Busca de fotos com IA inverte a arquitetura: LLM gera a QUERY PT-BR perfeita por item e confia no 1º resultado do Google (substituída pela Rev. 2350 ao descobrir Google CSE bloqueado). Ver `shared/changelog.ts`.
- **Rev. 2348** — HOTFIX/UX · Busca de fotos com IA ganha auto-loop client-side (não para mais em 60 por click) + validação strict "foto EXATA do produto" com categoria no payload. Ver `shared/changelog.ts`.
- **Rev. 2347** — HOTFIX/FILOSOFIA · Busca de fotos volta a buscar em PORTUGUÊS com validação rigorosa em todos os candidatos; Phase B "busca ampla sem validação" da Rev. 2345 removida (era ela que aplicou foto errada em RODAPÉ 20 CM). Ver `shared/changelog.ts`.
- **Rev. 2346** — UX/i18n · Inteiros ≥ 1.000 em Equipamentos Locados formatados em pt-BR com separador de milhar (1220 → "1.220"). Ver `shared/changelog.ts`.
- **Rev. 2345** — FEATURE/FILOSOFIA · Busca de fotos com IA passa a garantir cobertura 100% via 3 fases (A match preciso → B busca ampla → C placeholder SVG por categoria). Ver `shared/changelog.ts`.
- **Rev. 2344** — UX/PERF · Tela Equipamentos Locados ganha AGRUPAMENTO por descrição+obra (default ON); 1218 cards individuais viram ~60 cards agregados com modal drill-down. Ver `shared/changelog.ts`.
- **Rev. 2343** — HOTFIX · Busca de fotos com IA traduz PT→EN (guards anti-alucinação) antes dos providers. Ver `shared/changelog.ts`.
- **Rev. 2342** — HOTFIX/FEATURE · Busca de fotos da IA passa por validação rigorosa via Gemini antes de persistir + botão "Limpar fotos IA" pra reset em massa. Ver `shared/changelog.ts`.
- **Rev. 2341** — FEATURE/HOTFIX · Busca de fotos com IA usa chain de provedores públicos (OpenVerse + Wikimedia Commons + Google CSE opcional) — destrava feature mesmo com GOOGLE_API_KEY restrita. Ver `shared/changelog.ts`.
- **Rev. 2340** — FEATURE · Busca de foto ilustrativa dos equipamentos locados via IA (Google Custom Search Image) + thumbnail nos cards com badge "IA". Ver `shared/changelog.ts`.
- **Rev. 2339** — FEATURE/UX · Card de Equipamento Locado clicável + painel de detalhes completos (foto, KPIs, obra/fornecedor, galeria, timeline). Ver `shared/changelog.ts`.
- **Rev. 2338** — UX · KPI cards de Equipamentos Locados responsivos (1→2→4 cols) + `clamp()`. Ver `shared/changelog.ts`.
- **Rev. 2336** — FEATURE/UX · Drill-down clicável nas células da tabela "Locações mês a mês" → modal moderno. Ver `shared/changelog.ts`.
- **Rev. 2334** — UX · Filtro por OBRA em Equipamentos Locados + grid 2-col busca+obra + chips. Ver `shared/changelog.ts`.
- **Rev. 2333** — HOTFIX/PERF/UX · Import PDF de locação: bulk INSERT no server (corrige "Load failed" iOS Safari) + chunking de 10 contratos no client. Ver `shared/changelog.ts`.
- **Rev. 2331** — UX · Layout modernizado das 6 tabelas mês a mês do Dashboard Almox & Equip. + segmented pill p/ filtro de período. Ver `shared/changelog.ts`.
- **Rev. 2330** — FEATURE · Filtro de período (Últimos 12 meses ou ano fechado) nas 6 tabelas mês a mês do Dashboard Almox & Equip. Ver `shared/changelog.ts`.
- **Rev. 2329** — PERF · Exclusão/vinculação em lote de locados ~50× mais rápida via bulk SQL. Ver `shared/changelog.ts`.
- **Rev. 2328** — HOTFIX/UX · Exclusão/vinculação em lote de locados parecia travada — chunk 500→200 + spinner + tempo decorrido. Ver `shared/changelog.ts`.
- **Rev. 2327** — UX · Cada aba do Dashboard Almox & Equip. vira item próprio na sidebar + tabela mês a mês (12 meses) em cada. Ver `shared/changelog.ts`.
- **Rev. 2326** — FEATURE · Importação PDF de locação cruza endereço com obras em andamento e sugere vínculo automático. Ver `shared/changelog.ts`.
- **Rev. 2325** — HOTFIX/UX · Exclusão/vinculação em lote de equipamentos locados — chunking de 500 + modais bonitos. Ver `shared/changelog.ts`.

- **Rev. 2335** — UX · Padrão do filtro de período dos 6 dashboards mês a mês passa de "últimos 12 meses" pro ano corrente. Ver `shared/changelog.ts`.
- **Rev. 2332** — UX · Nome do mês capitalizado ("Jan 2026") + indicador MoM (▲/▼ %) nas 6 tabelas mês a mês. Ver `shared/changelog.ts`.
- **Rev. 2337** — FEATURE · Categorização automática dos equipamentos locados via IA (Claude→Gemini fallback) + filtro por categoria; coluna `categoria` já existia; UPDATE por categoria (7 round-trips vs 1218). Hardening pós-review: guard `getCompaniesForUser`. Ver `shared/changelog.ts`.

- ~~Rev. 2318~~ — UX/HOTFIX · Barra de progresso da importação PDF não trava mais em 95% (creep 95→99% + estimativa realista 35s). Ver `shared/changelog.ts`.
- ~~Rev. 2317~~ — UX · Remove IMPORTAR PDF (IA) do header do Almoxarifado; fica só RECEBER + DEVOLVER LOCAÇÃO. Ver `shared/changelog.ts`.
- ~~Rev. 2316~~ — UX · Restaura RECEBER + DEVOLVER LOCAÇÃO como botões dedicados no header do Almoxarifado (Importar PDF removido depois na Rev. 2317). Ver `shared/changelog.ts`.
- ~~Rev. 2315~~ — UX · Removido botão "Receber locação" do hero da tela Equipamentos Locados; Importar PDF (IA) vira CTA primária. Ver `shared/changelog.ts`.
- ~~Rev. 2314~~ — UX/ANALYTICS · Tabela "Custo por obra" agregada no preview da importação PDF de locação. Ver `shared/changelog.ts`.
- ~~Rev. 2313~~ — UX · Substitui 2 botões de locação por 1 "IMPORTAR PDF (IA)" no Almoxarifado (revertido parcialmente na Rev. 2316 → 2317). Ver `shared/changelog.ts`.
- ~~Rev. 2312~~ — UX · Botões dedicados RECEBER/DEVOLVER LOCAÇÃO no header do Almoxarifado (re-restaurado na Rev. 2316). Ver `shared/changelog.ts`.
- ~~Rev. 2311~~ — UX · Atalho "Receber/Devolver locação" dentro do modal Receber Material (revertido na Rev. 2312 → 2313). Ver `shared/changelog.ts`.
- ~~Rev. 2310~~ — UX · Barra de progresso 0→100% animada (ease-out) no modal de importação PDF (Gemini) de contratos de locação. Ver `shared/changelog.ts`.
- ~~Rev. 2309~~ — UX · Redesign moderno tela Equipamentos Locados (hero gradient + KPIs + pills + lista em cards) + modal Receber em 5 seções coloridas. Ver `shared/changelog.ts`.
- ~~Rev. 2308~~ — FEAT · Importação em lote de contratos de locação via PDF (Gemini Vision); SyncSchema+ aditivo. Ver `shared/changelog.ts`.
- ~~Rev. 2307~~ — UX · Pills de filtro por TIPO (Material/MDO/MAT+MDO/Equipamento) na tela Ordens de Compra, com cross-filter de contadores. Ver `shared/changelog.ts`.
- ~~Rev. 2306~~ — HOTFIX/UX · Estorno do Almoxarifado: liberar Recebimento avulso (sem OC) + sinalizar mov vinculada a OC como não-selecionável. Ver `shared/changelog.ts`.
- ~~Rev. 2305~~ — FEAT · Seleção múltipla + ESTORNO em lote de movimentações do Almoxarifado (soft-delete auditável + transação atômica + multi-tenant). Ver `shared/changelog.ts`.
- ~~Rev. 2304~~ — FEAT/UX · Filtro por PERÍODO em Movimentações (pills Todos/Hoje/7d/30d/Este mês/Personalizado + range customizado com helpers de fuso local). Ver `shared/changelog.ts`.
- ~~Rev. 2303~~ — FEAT/REGRA-DE-OURO · Recebimento só na obra da SC/OC + obra clicável (`filtroObra`) em Movimentações; hard-check backend em `registerSmartEntry`. Ver `shared/changelog.ts`.
- ~~Rev. 2302~~ — HOTFIX CRÍTICO · "Aprovar e Gerar OC" estourava: 7 colunas locação faltavam em `compras_ordens`. Auto-migration SyncSchema+ Rev. 2302. Ver `shared/changelog.ts`.
- ~~Rev. 2301~~ — UX · Pills de filtro por TIPO em Solicitações de Compra (Material/MDO/Pacote/Equip/Manutenção) com cross-filter; helper `effectiveTipo()`. Ver `shared/changelog.ts`.
- ~~Rev. 2300~~ — FEAT/UX · Funcionários Terceiros: múltipla seleção + barra de ações bulk (Apto/Inapto/Pendente) via Promise.allSettled. Ver `shared/changelog.ts`.
- ~~Rev. 2299~~ — HOTFIX · Funcionários Terceiros: typo `statusAptidaoTerceiro`→`statusAptidao` no cliente (5 sites) destravou filtros e contadores. Ver `shared/changelog.ts`.
- ~~Rev. 2298~~ — UX · Segunda linha de filtros na tela Cotações: pills por TIPO (Material/MDO/Pacote/Equipamento) com cross-filter de contadores. Ver `shared/changelog.ts`.
- ~~Rev. 2297~~ — UX/Padrão global · Componente `<PersonPhoto>` com lightbox embutido aplicado em 5 telas SEM zoom anterior. Ver `shared/changelog.ts`.
- ~~Rev. 2296~~ — UX · Filtros de status da tela Cotações em pills coloridos com ícone + contador (Todos/Pendente/Aprovada/Concluída/Recusada/Expirada). Ver `shared/changelog.ts`.
- ~~Rev. 2295~~ — FEAT/UX · Auto-cotação ao criar SC (qualquer tipo, incluindo EQUIP·LOC) + Coluna "Aprovação"→"Tipo" + nova coluna "Prioridade" ordenáveis em Solicitacoes.tsx. Ver `shared/changelog.ts`.
- ~~Rev. 2294~~ — FEAT/UX · Aprovação automática de SC e OC — fluxo manual descontinuado. "Se tem SC, o ERP já entende como aprovada". Ver `shared/changelog.ts`.
- ~~Rev. 2293~~ — HOTFIX CRÍTICO · Sumiram todas as SCs — colunas locação faltavam no Neon PROD; auto-migration SyncSchema+ idempotente. Ver `shared/changelog.ts`.
- ~~Rev. 2292~~ — UX · Modal "Descartar solicitação?" redesenhado no padrão FC (faixa âmbar + footer sticky). Ver `shared/changelog.ts`.
- ~~Rev. 2291~~ — HOTFIX/DX · Erro real do Postgres agora exposto no toast + server log ao criar SC (cause.message). Ver `shared/changelog.ts`.
- ~~Rev. 2290~~ — FEAT · Locação de Equipamento na SC (engenheiro indica o aluguel + período já na Solicitação). Ver `shared/changelog.ts`.
- ~~Rev. 2289~~ — FEAT/UX · Filtro por VÍNCULO (CLT/PJ/TERCEIRO) na tela Efetivo da Obra. Ver `shared/changelog.ts`.
- ~~Rev. 2288~~ — HOTFIX · ReferenceError fotoZoom (Efetivo da Obra) — state movido de EfetivoObraTab pra EfetivoObraView. Ver `shared/changelog.ts`.
- ~~Rev. 2287~~ — FEAT/UX · Foto do funcionário clicável (lightbox) na aba Efetivo da Obra. Ver `shared/changelog.ts`.
- ~~Rev. 2286~~ — FEAT/UX · Histórico REFIS com seleção múltipla + exclusão em lote (admin-only). Ver `shared/changelog.ts`.
- ~~Rev. 2285~~ — FIX · TODA aba REFIS lê `realOficialRefis` (snapshot MSP raiz UID=0) — eliminadas últimas 3 ocorrências de `avancoRealAtual`. Ver `shared/changelog.ts`.
- ~~Rev. 2284~~ — FIX · Aba REFIS abre na SEMANA-CUTOFF atual (Sex→Qui p/ cutoff=Qui). Ver `shared/changelog.ts`.
- ~~Rev. 2283~~ — FIX CRÍTICO · `emitirRefis()` grava `realOficialRefis` (snapshot MSP raiz UID=0) em vez de `avancoRealAtual`. Ver `shared/changelog.ts`.
- ~~Rev. 2282~~ — FEAT/UX · Histórico REFIS expansível c/ painel comparativo (banner veredito + Δ KPIs + tabela densa + observações). Ver `shared/changelog.ts`.
- ~~Rev. 2281~~ — UX · REFIS Análise do Cronograma — redesign sweeping (group cards header + Faturamento KPIs + Histórico). Ver `shared/changelog.ts`.
- ~~Rev. 2280~~ — FIX · LOTUS Prog. Semanal: atividade ANTECIPADA / NÃO PROGRAMADA na semana corrente não pintava célula r0+2 (UI+Excel). Ver `shared/changelog.ts`.
- ~~Rev. 2279~~ — CHORE · Solicitação de Equipamento (SE) DELETADA do ERP (Etapa 1 da consolidação SE→SC). Ver `shared/changelog.ts`.
- ~~Rev. 2278~~ — FIX · Curva S Financeira KPI/linha verde usa `realOficialRefis` (snapshot MSP raiz UID=0) em vez de `avancoRealAtual`. Ver `shared/changelog.ts`.
- ~~Rev. 2277~~ — FEAT · Filtro "Apenas atrasadas" na seção "Avanço Físico por Grupo" com pill clicável e contador. Ver `shared/changelog.ts`.
- ~~Rev. 2276~~ — UX · "AVANÇO FÍSICO POR GRUPO" redesenhado no estilo CRONOGRAMA, macro BarChart redundante removido. Ver `shared/changelog.ts`.
- ~~Rev. 2275~~ — FEAT · "AVANÇO FÍSICO POR GRUPO" separa pais e filhos até as FOLHAS finais com barras horizontais por nível. Ver `shared/changelog.ts`.
- ~~Rev. 2274~~ — FIX · Curva S Trabalho: snapshot MSP raiz UID=0 sobrescreve ponderação local na semana do StatusDate. Ver `shared/changelog.ts`.
- ~~Rev. 2257~~ — FEATURE · Módulo Controle de Equipamentos Fase 1 Sprint 2 (tRPC router 18 procedures + auto-seed CAPEX). Ver `shared/changelog.ts`.
- ~~Rev. 2256~~ — FEATURE · Módulo Controle de Equipamentos Fase 1 Sprint 1 (6 tabelas novas + 2 extensões aditivas + migration 0025 idempotente). Ver `shared/changelog.ts`.
- ~~Rev. 2255~~ — FIX · Barra superior "Avanço Físico" (Planejamento → Detalhe) passa a refletir avanço real desde a 1ª renderização. Ver `shared/changelog.ts`.
- ~~Rev. 2254~~ — FIX · Programação Semanal LOTUS preserva hierarquia EAP completa via walk-back por `nivel`+ordem. Ver `shared/changelog.ts`.
- ~~Rev. 2253~~ — UX · Campo "Responsável" do modal "Nova Revisão" vira FIXO (readOnly). Ver `shared/changelog.ts`.
- ~~Rev. 2252~~ — FIX · Modal "Nova Revisão" lê `obra.engenheiroResponsavel` (não `proj.responsavel` legado). Ver `shared/changelog.ts`.
- ~~Rev. 2251~~ — UX/FIX · Modal "Nova Revisão" auto-preenche Responsável com engenheiro do cadastro (1ª tentativa, lia `proj.responsavel` legado). Refinada em 2252/2253. Ver `shared/changelog.ts`.
- ~~Rev. 2248~~ — FIX/CONSISTÊNCIA · Unifica ABSOLUTAMENTE régua topo↔REFIS via `topRefStr` no parent. Ver `shared/changelog.ts`.
- ~~Rev. 2246~~ — PRIVACY/UX · Removido card "Ocorrências de Segurança" do Painel SST (vazava advertências disciplinares com nome). Ver `shared/changelog.ts`.
- ~~Rev. 2245~~ — SECURITY/UX · Removido card "Atividade Recente - SST" do Painel SST (vazava lançamentos financeiros via `trpc.audit.list` sem filtro de módulo). Ver `shared/changelog.ts`.
- ~~Rev. 2244~~ — FIX/TZ · `todayLocalISO()` substitui `new Date().toISOString().split("T")[0]` em TODO `PlanejamentoDetalhe.tsx` — corrige badge "ATUAL" antecipando 1 dia em UTC. 19 trocas. Ver `shared/changelog.ts`.
- ~~Rev. 2243~~ — FIX/UX · "Importar MS Project" do Avanço Semanal vira self-healing (matching por NOME + backfill auto de `msp_uid`). Backend `backfillMspUid` (chunks 50, idempotente); frontend dispara em background após match via EAP/nome. Ver `shared/changelog.ts`.
- ~~Rev. 2242~~ — FEATURE/DEFESA · Alerta visível de drift `msp_uid` no importer MSP (follow-up 2241). Toast vermelho se `xmlUids>10 && pctFolhasUid<0.30`. Ver `shared/changelog.ts`.
- ~~Rev. 2241~~ — FIX/SCHEMA · Coluna `msp_uid` criada em `planejamento_atividades` (DRIFT drizzle↔DB); renomeados índices `clcom_*` da `clienteComentarios`. Ver `shared/changelog.ts`.
- ~~Rev. 2240~~ — FIX/UX · Header de grupo no Avanço Semanal funciona p/ atividades SEM `eapCodigo` (stack-walk por nivel em `grupoParentByAtivId`). `PlanejamentoDetalhe.tsx:6427-6450`. Ver `shared/changelog.ts`.
- ~~Rev. 2239~~ — UX/AVANÇO-SEMANAL · Headers de grupo (EAP-pai imediato) antes de cada bloco de atividades. `.flatMap` detecta troca de pai. Limitação EAP-only corrigida em 2240. Ver `shared/changelog.ts`.
- ~~Rev. 2238~~ — STYLE/UI · Regra de Ouro FC aplicada no modal "Nova Revisão do Cronograma": faixa `#1B2A4A` no header. Ver `shared/changelog.ts`.
- ~~Rev. 2237~~ — FEATURE/IMPORTER · Distribuição auto do avanço importado MSP em semanas passadas seguindo curva prevista. `cumW=min(planAtW,imp)`. Ver `shared/changelog.ts`.
- ~~Rev. 2236~~ — FIX/IMPORTER (continuação 2235) · Avanço de terceiros (Rohr/Lotus/Friul/Santuário `isIndireta=true`) não importava. `folhas`→`folhasComInd`. Ver `shared/changelog.ts`.

- **Rev. 2235** — FIX/IMPORTER · Importar MS Project pulava 20-30% das atividades (sem campo Item). DOIS maps (UID + Item), removida guarda `if (!wbs) return`. Ver `shared/changelog.ts`.
- **Rev. 2234** — FIX/UX · Planejamento abria sempre na 1ª semana, não na atual. Effect UNIFICADO em `[semanas, cutoffDow]`. Ver `shared/changelog.ts`.
- **Rev. 2233** — FIX/RACE · Cronograma: responsável (cyan) digitado SUMIA ao clicar Salvar. Sync DOM→state via `querySelectorAll('[data-resp-input]')` no `onClick`. Ver `shared/changelog.ts`.
- **Rev. 2229** — CHORE/CLEANUP · Removidas 4 procedures duplicadas (warnings esbuild "Duplicate key") em `server/routers/financial.ts` + `payrollEngine.ts`. Ver `shared/changelog.ts`.
- **Rev. 2230/2231/2232** — FIX/PARSER (3 iterações, 2232 estável) · Importar Cronograma MS Project XLSX com linhas de título acima dos headers e headers MSP-PT-BR full. 2232 híbrido equals+word-boundary com norm() NFD + best-match. Ver `shared/changelog.ts`.
- **Rev. 2228** — FEATURE/UX · Contas a Pagar: (1) sem scroll horizontal compactando Categoria; (2) botão EXCLUIR duplicidade com confirm+motivo+auditoria (`financial.deleteEntry`, HARD DELETE bloqueado se `status='pago'`); (3) botão ESTORNAR pagamento aba Pagos (`financial.estornarPagamento`). Ver `shared/changelog.ts`.
- **Rev. 2227** — FIX/UX · Tela Contas a Pagar cortava coluna Ações. `FinanceiroContasAPagar.tsx`: L477 `max-w-[1600px]`→`w-full`; L809 `<th>` Ações `sticky right-0 bg-gray-50 w-32`; L1162 `<td>` mesma stickiness. Ver `shared/changelog.ts`.
- **Rev. 2226** — FEATURE/UX · Fornecedor/Prestador no modal "Novo Lançamento" Financeiro: agora em AMBOS modos (Único+Recorrente), autocomplete `compras.listarFornecedores`, botão "Cadastrar novo" abre `/compras/fornecedores` em nova aba, DialogContent tela cheia. Ver `shared/changelog.ts`.
- **Rev. 2225** — FIX/UX · Botão "Cadastrar contas" do Painel Financeiro abria Regime Tributário. `FinanceiroDashboard.tsx:162` `Link href="/financeiro/configuracoes"` → `/contas-bancarias`. Novo botão "+ Nova / Gerenciar" no header. Ver `shared/changelog.ts`.
- **Rev. 2224** — FIX/PARSER · Contrato puxava "R$ 3,20" quando salário base era "3.200" (formato BR de milhar). `client/src/lib/numeroExtenso.ts:17-37` `parseValor` novo ramo `else if (hasDot)`: se último grupo após ponto tem 3 dígitos exatos = milhar BR (strip pontos); senão decimal US. Ver `shared/changelog.ts`.
- **Rev. 2223** — UX · Foto do funcionário no alerta "HE aprovada SEM ponto". `HEAprovadaSemPontoAlert.tsx`: avatar (h-5 w-5) com `<AvatarImage src=fotoUrl>` quando existe ou `<AvatarFallback>` com iniciais. Sem backend. Ver `shared/changelog.ts`.
- **Rev. 2222** — FEATURE/UX · Alerta "HE aprovada SEM ponto" permite DIGITAR o ponto direto no card (individual/lote) e gravar via `heSolicitacoes.lancarPontoFromHE` (`server/routers/heSolicitacoes.ts:330-432`) — UPSERT em `time_records` com `pg_advisory_xact_lock`, `fonte=manual`, `ajusteManual=1`. Ver `shared/changelog.ts`.
- **Rev. 2221** — FIX/LOGIC · Alerta "HE aprovada SEM ponto" agora detecta falta de batida NO HORÁRIO APROVADO (não só no dia). Novo `NOT EXISTS` em `heSolicitacoes.ts:269-287` considera "bateu HE" se `horasExtras > 0` OU alguma das 6 batidas (entrada1..3/saida1..3) cai BETWEEN `[horaInicio, horaFim]`. Ver `shared/changelog.ts`.
- **Rev. 2220** — UX · Alerta "HE aprovada SEM ponto" agora vive EXCLUSIVAMENTE no Módulo Hora Extra da Folha. Removido de `SolicitacaoHE.tsx` (L1128) e `FechamentoPonto.tsx` (L1600). Componente compartilhado + procedure intactos. Ver `shared/changelog.ts`.
- **Rev. 2219** — UX/PAYROLL · Alerta HE-sem-ponto mostra status do período HE + aviso de duplicidade. LEFT JOIN LATERAL com `he_periods` (tie-break pago>aprovado>calculado) + EXISTS `he_period_employees`. Ver `shared/changelog.ts`.
- **Rev. 2218** — FIX/UX · Alerta "HE aprovada SEM ponto" propagado pra Fechamento de Ponto + Módulo HE + bugfix tenant na 2217. Componente compartilhado aceita companyId+companyIds, mesReferencia OU dataInicio/dataFim. Ver `shared/changelog.ts`. *(superseded pela Rev. 2220)*.
- **Rev. 2217** — UX/HE · Alerta "HE aprovada SEM ponto batido" na aba Aprovações. Nova procedure `heSolicitacoes.aprovadasSemPonto` (`server/routers/heSolicitacoes.ts:184-264`) com raw SQL + `NOT EXISTS` contra `time_records`, respeitando `getEffectiveAllowedObraIds`. Ver `shared/changelog.ts`.
- **Rev. 2216** — FIX/PAYROLL · Memorial de Cálculo de HE reconhece feriados (nacionais fixos, móveis e custom). Novo helper `getFeriadosSetForPeriod` exportado de `server/routers/feriados.ts`; `computeHEForPeriod`+`memorialCalculo` tratam feriado idêntico a domingo. Ver `shared/changelog.ts`.
- **Rev. 2215** — UX/LAYOUT · Tela Contas a Pagar usa largura estendida (1600px) — `FinanceiroContasAPagar.tsx:480` `max-w-7xl` → `max-w-[1600px]`, coluna "Ações" não corta mais. Ver `shared/changelog.ts`.
- **Rev. 2214** — FIX/UX · Lançamentos recorrentes aparecem automaticamente em Contas a Pagar. Novo helper `materializeRecorrentes(db, companyId, horizonteMeses)` (`server/routers/financial.ts:94-187`) idempotente chamado por `getContasAPagarByYear` ANTES do SELECT (horizonte = meses até fim do ano consultado, capado em 13). Ver `shared/changelog.ts`.
- **Rev. 2213** — UX/CRUD · Botão "Excluir" nos Lançamentos Recorrentes. Nova procedure `financial.deleteRecurringEntry` + UI Trash2 vermelho com `confirm()` em `FinanceiroRecorrentes.tsx`. Lançamentos já materializados em `financial_entries` permanecem intactos. Ver `shared/changelog.ts`.
- **Rev. 2212** — HOTFIX · Contagem "N membros" dos cards de grupo não atualizava ao trocar usuário (mesmo após Rev. 2211). `handleQuickSetGroup` agora awaita `Promise.all([list.refetch(), listAllMembers.refetch(), getMembers.invalidate()])` antes do toast. Ver `shared/changelog.ts`.
- **Rev. 2211** — HOTFIX · Trocar grupo do usuário não atualizava painel "Membros do Grupo" do grupo antigo. `setGroupsMut.onSuccess` agora invalida `userGroups.getMembers` (sem filtro) + `userGroups.list`. Ver `shared/changelog.ts`.
- **Rev. 2210** — UX · Aba "Grupos de Acesso" abre o 1º grupo automaticamente em vez de mostrar painel vazio. Novo `useEffect` chama `openGroup(filteredGroups[0])` ao entrar na aba sem seleção. Ver `shared/changelog.ts`.
- **Rev. 2209** — UX · Mudar Grupo de Acesso do usuário virou INSTANTÂNEO (clicar no radio salva automaticamente). Novo `handleQuickSetGroup` dispara `userGroups.setUserGroups` no `onChange` do radio. Ver `shared/changelog.ts`.
- **Rev. 2208** — SEGURANÇA/HOTFIX · Sigilo do "Aviso Prévio" fecha brechas no Raio-X, Dashboards, Painel RH e Seguro de Vida (5 procedures). `avisoPrevio.list`, `docs.raioX`, `dashboards.avisoPrevio*`, `home.getData`, `seguroVida.listarFuncionariosComStatus`. Ver `shared/changelog.ts`.
- **Rev. 2207** — SEGURANÇA/UX · Sigilo do status "Aviso Prévio" agora é OPT-IN configurável por grupo (checkbox em Grupos → Informações). Nova coluna `user_groups.ver_status_aviso` (aditiva). Helper `userCanSeeAvisoStatus` reescrito. Secure by default. Ver `shared/changelog.ts`.
- **Rev. 2206** — SEGURANÇA · Sigilo do status "Aviso Prévio" — visível só p/ Admin Master e grupo RH/DP (1ª iteração com regex no nome do grupo, substituída pela 2207). Backend mascara em `employees.list/stats/getById`; frontend mascara em `Colaboradores.tsx`. Ver `shared/changelog.ts`.
- **Rev. 2205** — MELHORIA UX · Campo "Quando venceu" no preview de Aviso Prévio mostra a data limite (Art. 134 CLT) de cada período de férias vencidas. Novo campo `periodosVencidosDetalhes` no procedure `calcular` + bloco UI listando aquisitivo/limite por período. Ver `shared/changelog.ts`.
- **Rev. 2204** — FIX UX · Impressão do Espelho de Ponto refatorada (acabou bagunça de 5 páginas com 1ª em branco). Bloco `.print-only` self-contained com cabeçalho institucional FC, faixa azul, TABELA HTML real (`thead display:table-header-group` repete cabeçalho). Ver `shared/changelog.ts`.
- **Rev. 2203** — MELHORIA UX · Banner âmbar "Sugestão de Diluição de Caixa" no preview de Aviso Prévio quando há `feriasVencidas > 0 && !isPedidoDemissao` (Art. 145 CLT, suspensão de contrato, redução do caixa imediato). Ver `shared/changelog.ts`.
- **Rev. 2202** — MELHORIA UX · Filtro do Histórico Catalogado (Frotas → Controle de Km) virou INTERVALO de datas (de → até) em vez de data única. State `DateInicio`+`DateFim`, comparação lexicográfica YYYY-MM-DD. Ver `shared/changelog.ts`.
- **Rev. 2201** — HOTFIX · Excluir Aviso Prévio agora reverte `employees.status` de 'Aviso' para 'Ativo' (guard preserva Desligado/Férias). Cleanup direto no Neon p/ Robson. Ver `shared/changelog.ts`.
- **Rev. 2200** — MELHORIA UX · Calendário do topo da Folha de Pagamento adotou padrão visual do calendário do Fechamento de Ponto (cores sólidas + Lock no canto). Ver `shared/changelog.ts`.
- **Rev. 2199** — HOTFIX · Calendário da Folha respeita cores da legenda com múltiplas linhas em `payroll_periods` por mês. Agrupa por `mesReferencia` num `Map` e usa `Array.some()` (`anyTravada` → consolida vale+pag de uma vez). Ver `shared/changelog.ts`.
- **Rev. 2198** — HOTFIX UX · Mês SELECIONADO no calendário da Folha respeita cor da legenda em vez de virar branco. Separou `statusClasses` (bg+text sempre aplicado) de `borderClasses` (prioriza seleção). Ver `shared/changelog.ts`.
- **Rev. 2197** — HOTFIX · Calendário da Folha volta a pintar meses calculados pelo Cálculo Interno (Rev. 2180+). `listarMesesComLancamentos` agora lê `folha_lancamentos` + `payroll_periods` (legacy + novo). Ver `shared/changelog.ts`.
- **Rev. 2196** — MELHORIA UX · Avatar 32px do colaborador no Relatório de Períodos HE virou clicável: abre lightbox com foto ampliada (max-h 70vh, fundo preto). Fallback iniciais não ganha click. Ver `shared/changelog.ts`.

- **Rev. 2195** — NOVA FEATURE · Tela "Encargos Sociais sobre Folha" (RH&DP > Operacional) p/ upload DCTFWeb + FGTS Digital. Nova tabela `encargos_sociais_documentos`, router `encargosSociais.ts`, página `EncargosSociais.tsx`. Ver `shared/changelog.ts`.

- **Rev. 2194** — REMOÇÃO DE FEATURE · Bloco "Conferência com Contabilidade" removido da aba Folha de Pagamento (Card colapsável + Dialog de alerta + states `showConferencia`/`conferenciaDialog`). Server intacto. Ver `shared/changelog.ts`.

- **Rev. 2193** — MELHORIA UX · Layout da Ficha de Entrega de EPI reorganizado em documento ÚNICO. Ver `shared/changelog.ts`.
- **Rev. 2192** — MELHORIA UX · Nome do funcionário e do responsável aparecem em destaque abaixo de cada assinatura na Ficha de Entrega de EPI. Schema aditivo `epi_deliveries.assinatura_responsavel_{nome,em}`. Ver `shared/changelog.ts`.

- **Rev. 2191** — MELHORIA UX · Ficha de Entrega de EPI passou a exibir bloco "📷 FOTOS ANEXADAS" com `fotoEstadoUrl` (foto obrigatória em troca por desgaste/mau_uso). Ver `shared/changelog.ts`.

- **Rev. 2190** — HOTFIX BLOQUEANTE · Assinatura de EPI "sumia" ao abrir via olhinho. Causa: `fichaUrl` (PDF) gerado ANTES da assinatura nunca regerado. Fix: olhinho abre preview in-app (sobrepõe `assinaturaUrl` como `<img>`). Ver `shared/changelog.ts`.

- **Rev. 2189** — MELHORIA UX · Tabela do Relatório de Períodos HE mostra foto do colaborador (avatar 32px circular) à esquerda do nome via `employees.fotoUrl`. Fallback iniciais quando null. Ver `shared/changelog.ts`.

- **Rev. 2188** — HOTFIX UX · Dropdown "Filtrar por obra" do Relatório de Períodos HE listava QUALQUER obra em que o funcionário bateu ponto, mesmo sem HE. Fix server `semSolRows`: `tr."horasExtras" IS NOT NULL` + `NOT IN (, 0, 0:00, 00:00, 0:0)`. Ver `shared/changelog.ts`.
> O detalhamento completo (causa-raiz, stack traces, arquivos tocados, comentários longos) de TODAS as revisões — incluindo as listadas abaixo — vive em `shared/changelog.ts`.

- ~~Rev. 2187~~ — HOTFIX UX · Dropdown "Filtrar por obra" do Relatório de Períodos HE mostrava opção "Sem Obra" agrupando `time_records.obraId=NULL`. Fix: server `LEFT JOIN obras`→`JOIN obras` + `IS NOT NULL`; client pula `obraId==null`. Ver `shared/changelog.ts`.
- ~~Rev. 2186~~ — MELHORIA UX + HOTFIX VISUAL · Lista de Entregas de EPI: olhinho só com `assinaturaUrl`; entregas sem assinatura mostram ⚠ âmbar "Aguardando assinatura"; novo filtro tri-state Todas/✓ Assinadas/⚠ Não assinadas. Ver `shared/changelog.ts`.
- ~~Rev. 2185~~ — HOTFIX BLOQUEANTE · Filtro por OBRA no Relatório de Períodos HE mostrava linha "Aprovada" sob obra ERRADA. Fix: `obrasPorEmp` separado POR ORIGEM no server (aprovada via `he_solicitacoes`; sem_solicitacao via `time_records` + NOT EXISTS); client `obrasMap` re-chaveado `Map<"empId|origem", Set<obra>>`. Ver `shared/changelog.ts`.
- ~~Rev. 2184~~ — NOVA FEATURE · Drill-down do badge "✅ Aprovada" no Relatório de Períodos HE: clicar abre dialog listando solicitações HE aprovadas que cobrem o funcionário no período. Reusa `heSolicitacoes.historyByEmployee`. Ver `shared/changelog.ts`.
- ~~Rev. 2183~~ — NOVA FEATURE · Filtro por OBRA no Relatório de Períodos HE (Select acima dos cards KPI da Rev. 2182). Backend `getDetalhe` retorna `obrasPorEmp` via `time_records` JOIN `obras`. **OBS: revisado pela Rev. 2185 — agora separa por origem.** Ver `shared/changelog.ts`.
- ~~Rev. 2182~~ — NOVA FEATURE · 3 cards KPI clicáveis (Total HE / Aprovadas / Sem solicitação) acima da tabela do Relatório de Períodos HE, azul institucional FC #1B2A4A, filtro on-click via state `heOrigemFilter`. Ver `shared/changelog.ts`.
- ~~Rev. 2181~~ — MELHORIA UX · Botão Memorial de Cálculo agora aparece em TODAS as linhas do Relatório de Períodos HE (Rev. 2179 gateou por `isFirst`); fix removeu o gate em `FolhaPagamento.tsx:4804`. Ver `shared/changelog.ts`.
- ~~Rev. 2180~~ — HOTFIX BLOQUEANTE · "Calcular Vale" salvava `payroll_advances` mas falhava no UPDATE final de `payroll_periods` (13 colunas faltantes no DB Neon — `valeResultJson` etc); fix via ADD COLUMN IF NOT EXISTS aditivo + bootstrap `[SyncSchema+] Rev. 2180`. Ver `shared/changelog.ts`.
- ~~Rev. 2179~~ — NOVA FEATURE · Relatório de Períodos HE ganhou coluna "Solicitação" (✅ Aprovada / ⚠️ Sem solicitação) + quebra funcionário em até 2 linhas com Pagar/Banco independente por origem. Schema `he_period_employees.origem` + `computeHEForPeriod` classifica por dia. Ver `shared/changelog.ts`.
- ~~Rev. 2178~~ — HOTFIX BLOQUEANTE · Adiantamento (vale) saía sobre salário INTEGRAL pra colaboradores admitidos no meio do mês — `gerarVale` em `payrollEngine.ts:2316` ignorava `diasAntesAdmissao`; fix unifica férias+aviso+admissão via flag `temProporcional`. Ver `shared/changelog.ts`.
- ~~Rev. 2177~~ — MELHORIA MOBILE · Scroll horizontal automático em QUALQUER tabela do ERP que estourar a viewport — fix global via CSS `:has()` em `client/src/index.css` `@media (max-width: 767px)`, zero edição de páginas. Ver `shared/changelog.ts`.

- **Rev. 2176** — HOTFIX BLOQUEANTE · Criar conta no Plano de Contas com mesmo nome de uma Categoria existente "criava" silenciosamente sem aparecer em lugar nenhum. Dedup `SELECT ... WHERE ativo=1` ignorava escopo; fix passa a checar `codigo LIKE 'AUTO-%'` e devolve TRPCError apontando Categoria conflitante.


- **Rev. 2175** — MELHORIA UX · Mensagem de conflito de nome no Plano de Contas agora diz onde está a conta conflitante (Plano vs Categorias / código). SELECT extra no catch 23505 da Rev. 2174 classifica pelo prefixo do código (`AUTO-*` = Categorias).


- **Rev. 2174** — HOTFIX UX · Erro PG 23505 cru no toast ao editar conta do Plano de Contas — traduzido pra mensagem amigável em `updateAccount` (try/catch detecta code/constraint/msg, TRPCError BAD_REQUEST).


- **Rev. 2173** — HOTFIX BLOQUEANTE · Edição de código contábil no Plano de Contas era silenciosamente ignorada (zod do `updateAccount` não aceitava `codigo`; cliente também não enviava em edição). Fix: backend aceita `codigo` c/ validação do create; `onPickParent` sempre sugere próximo; `handleSave` envia.


- **Rev. 2172** — HOTFIX display · Data de Nascimento/validades do Funcionário Terceiro "sumiam" ao reabrir — `split("T")[0]` em `FuncionariosTerceiros.tsx` quebra com timestamp PG `"YYYY-MM-DD HH:MM:SS"` (espaço, sem T). Fix: `String(x).slice(0, 10)` em 3 inputs (L469/L769/L813).


- **Rev. 2171** — HOTFIX UX · Modal "Novo Lançamento" (Financeiro) com `DialogContent flex flex-col max-h-[90vh]` + header/footer `shrink-0` + body `flex-1 min-h-0` — footer (botão Salvar) agora sempre visível em viewports ~700px.


- **Rev. 2170** — DIAGNÓSTICO · `dbExecute` do Financeiro agora propaga causa real do PG (code/constraint/column/detail/hint) via try/catch + log `[dbExecute][PG ERROR]` + re-throw `Error("DB: <diag>")` com `.cause` preservada.


- **Rev. 2169** — MELHORIA UX · Campo "Função" no cadastro de Colaboradores virou combobox pesquisável (FuncaoCombobox no final de Colaboradores.tsx, mesmo padrão do PlanoDeContaCombobox/Rev.2165). Setor NÃO convertido (escopo enxuto).


- **Rev. 2168** — HOTFIX BLOQUEANTE · Cadastro de colaborador falhava com `Failed query: SELECT COALESCE(MAX(CAST(REGEXP_REPLACE("codigoInterno", ... AS INTEGER))` — `getMaxCodigoInternoNumero` em `server/db.ts:516` estourava INT4. Fix: CAST AS BIGINT + WHERE LENGTH BETWEEN 1 AND 9 + NULLIF + try/catch fail-open.


- **Rev. 2167** — HOTFIX iPad · Upload de NR-10 em Funcionários Terceiros falhava com toast "Arquivo muito grande (máx 10MB)" — novo `client/src/lib/imageCompress.ts` (canvas resize→1920px + JPEG q=0.82, HEIC funciona no Safari), `handleUpload`/`handlePickExtraFile` viraram async + cap 25MB.


- **Rev. 2166** — MELHORIA UX + NOVA AÇÃO · Plano de Contas: ordenação natural por código (`cmpCodigo`), combobox "Conta Pai" + `suggestNextCode` (herda tipo/natureza/nivel do pai), botões Pencil/Trash2 inline, novo backend `deleteAccount` (soft-delete + check refs). Hotfix pós-review: campo Nível liberado em edição.


- **Rev. 2165** — MELHORIA UX · Campo "Plano de Contas (opcional)" no dialog de Categoria virou combobox pesquisável (Popover + cmdk) — novo `PlanoDeContaCombobox` em `FinanceiroCategorias.tsx`, busca por código OU nome, case/acento-insensitive.


- **Rev. 2164** — MELHORIA UX · AlertDialog de excluir Centro de Custo mostra vínculos detalhados (novo procedure `getCostCenterLinks` + componente `DeleteCostCenterDialog` com tabela das categorias vinculadas; bloqueia exclusão se houver refs).


- **Rev. 2163** — HOTFIX · "Excluir Centro de Custo" devolvia `Unexpected end of JSON input` — `financial_recurring_entries.centro_custo_id` não existia; cada SELECT do `deleteCostCenter` agora em try/catch próprio (coluna ausente vira warn + 0 refs).

> Movido aqui na Rev. 2028 (faxina) — revisões 1903 → 2012.

- Rev. 2162 — NOVO CAMPO · Vincular Categoria ao Plano de Contas via `conta_pai_id` (reaproveitamento da coluna self-FK existente); update `financial.updateAccount` ganha `contaPaiId` no Zod; frontend novo select indentado por nível + badge indigo na lista. (movida na Rev. 2169)
- Rev. 2161 — HOTFIX BUILD · syntax error em `FinanceiroCategorias.tsx` (vírgula dupla `,,` no `createMut.mutate` depois da Rev. 2157). Quebra do objeto em múltiplas linhas + remoção da vírgula extra. (movida na Rev. 2168)
- Rev. 2160 — HOTFIX continuação da Rev. 2159 · filtrar contas inativas (`ativo:true`) na query de Plano de Contas (a órfã 3.3 soft-deletada continuava aparecendo). 1 linha em `FinanceiroPlanoDeConta.tsx`. (movida na Rev. 2167)
- Rev. 2159 — DATA-FIX · 219 lançamentos migrados de `3.3 DESPESAS COM MATERIAIS` (órfã) → `3.2 Materiais de Construção` (padrão); órfã soft-deletada (`ativo=0`). Aprovado pelo user. (movida na Rev. 2166)
- Rev. 2158 — HOTFIX continuação da Rev. 2157 · botão "Carregar Padrão" sempre visível + seed do plano contábil idempotente (skip por código OU nome); migração `db.execute(string, params)` → `sql\`...\`` template tag. (movida na Rev. 2165)
- Rev. 2157 — Separação Plano de Contas × Categorias (Opção C) — `financial.getAccounts`/`createAccount` ganham param `escopo: plano|categoria|all` + guard do `seedPlanoDeConta` muda pra `COUNT(*) WHERE codigo NOT LIKE 'AUTO-%'`. (movida na Rev. 2164)
- Rev. 2156 — NOVA AÇÃO ADM Master · Botão "Excluir" em Centros de Custo (hard-delete com gate `admin_master` + checagem de refs em `financial_recurring_entries`/`financial_accounts`; AlertDialog vermelho). (movida na Rev. 2163)
- Rev. 2155 — HOTFIX · "Imprimir Contrato de Experiência" pedia Endereço mesmo com a aba preenchida (fallback `form.endereco`/`form.logradouro`). (movida na Rev. 2162)
- Rev. 2154 — HOTFIX BUILD · Deploy quebrava porque `RichTextEditor.tsx` não exportava `stripHtml`/`sanitizeHtml`/`isHtmlContent` usados pelo `ComunicadosInternos.tsx`; helpers adicionados + DOMPurify top-level. (movida na Rev. 2161)
- Rev. 2153 — NOVA AÇÃO ADM Master · Botão "Zerar Termos" no Raio-X (aba "Termos Assinados") pra limpar termos de recebimento em bulk. (movida na Rev. 2160)
- Rev. 2152 — UX/CLEANUP · Sessões FCSign canceladas deixam de poluir a Timeline Cronológica do Raio-X (early-return em `controleDocumentos.raioX` no `fcsignRows.forEach`; soft, sem DELETE em prod). (movida na Rev. 2159)
- Rev. 2151 — UX POLISH · Dialog "Novo Termo de Recebimento" repaginado com a identidade FC (faixa azul #1B2A4A, uppercase letter-spacing 3px, avatar com iniciais). (movida na Rev. 2158)
- Rev. 2150 — Termos & Documentos Assinados (FCSign) no Raio-X do funcionário com Visualizar+Baixar (nova tab "Termos Assinados"). (movida na Rev. 2157)
- Rev. 2149 — Multi-seleção + exclusão em lote no painel "Termo de Recebimento" (checkbox col + barra de ação + bulkDelete sequencial via signatures.adminDelete; gate isAdminMaster). (movida na Rev. 2156)

- Rev. 2148 — HOTFIX UX² · Tabs de Controle de Documentos em iPad Pro 12.9" portrait — troca `lg:grid-cols-9` por `xl:grid-cols-9` (linha única só ≥1280px). (movida na Rev. 2155)

- Rev. 2147 — HOTFIX UX · Tabs de Controle de Documentos com grid responsivo `grid-cols-2 sm:3 md:5 lg:9` (depois refinado na Rev. 2148 trocando `lg:` por `xl:`). (movida na Rev. 2154)

- Rev. 2146 — Termo de Responsabilidade movido da ficha do colaborador pra nova aba "Termo de Recebimento" em Controle de Documentos (gestão centralizada + fix bug "tela não atualiza pós-assinatura"). (movida na Rev. 2153)

- Rev. 2145 — Documentos institucionais FC (buildFcDocument) · margens padronizadas 2,5cm topo / 1,5cm laterais / 2,5cm rodapé + aproveitamento máximo da área útil A4. (movida na Rev. 2152)

- Rev. 2144 — Termo de Responsabilidade · campo Quantidade agora permite apagar livremente (Input type=text inputMode=numeric, clamp movido pro onBlur). Fix UX da Rev. 2143. (movida na Rev. 2151)

- Rev. 2143 — Termo de Responsabilidade · novo campo "Quantidade" por item entregue (Input + coluna Qtd. na tabela HTML do termo FCSign, colspan fotos 3→4). (movida na Rev. 2150)

- Rev. 2142 — SECURITY/CONCORRÊNCIA · Hardening Templates Docs (Rev. 2141): race condition em save/restoreVersion (db.transaction + pg_advisory_xact_lock + SELECT FOR UPDATE) + XSS no preview (DOMPurify.sanitize). (movida na Rev. 2149)

- Rev. 2141 — NOVA FEATURE · Aba "Templates de Documentos" em Configurações (Fase 1 fundação): 2 tabelas novas + 5 procedures + editor TipTap WYSIWYG + UI 3 colunas com versionamento Rev. 1/2/3 e restaurar. (movida na Rev. 2148)

- Rev. 2140 — Documentos institucionais FC (`buildFcDocument`) · margens laterais padronizadas em 1,5cm (15mm). Aplica-se a TODOS os 7 docs institucionais. (movida na Rev. 2147)

- Rev. 2139 — Termo de Responsabilidade · corpo reescrito FIEL ao .docx + hardening fotos iOS (rejeita HEIC, valida toDataURL, helper fotosValidas). (movida na Rev. 2146)

- Rev. 2130 — FCSign · gate `enabled` do client relaxado p/ admin_master/admin sem email (complementa Rev. 2128). (movida na Rev. 2137)

- Rev. 2129 — HOTFIX iOS Safari · `fmtTs(ts)` no `FCSignContratoExperienciaPanel` (replace " "→"T" + isNaN guard) — toast falso "Erro ao alocar número do contrato" some. (movida na Rev. 2136)

- Rev. 2128 — FCSign · alerta global por PAPEL (admin_master/admin recebem todo pendente `empregador` nas empresas autorizadas, server-side). (movida na Rev. 2135)

- Rev. 2127 — FCSign · backfill de `signature_signers.email` (empregado via `employees.email`, demais via `users.name`-match) — pré-requisito da Rev. 2128 e ainda útil pro email-match de empregados/testemunhas. (movida na Rev. 2134)

- Rev. 2126 — RH · Contrato de Experiência HOTFIX: numeração reinicia em 001/2026 (removido seed=33 + UPDATE one-shot zerando counter + NULL no employee=34). (movida na Rev. 2133)

- Rev. 2125 — RH · Contrato de Experiência: numeração automática NNN/AAAA sequencial, atômica, idempotente por empresa (`contract_counters` + UPSERT + `allocateContratoExperienciaNumero` + closure builder client). (movida na Rev. 2132)

- Rev. 2133 — FCSign · Contrato de Experiência assinado também persistido em `employee_contracts` (INSERT/UPDATE quando `allSigned`) p/ aba "Contratos CLT" do RAIO-X. (movida na Rev. 2140)
- Rev. 2132 — HOTFIX FCSign · `pendingForCurrentUser` retornava zero: `sql\`...=ANY(${'$'}{array})\`` no Drizzle não serializa `number[]` como PG array — trocado por `inArray()` (3 ocorrências). (movida na Rev. 2139)
- Rev. 2131 — FCSign · alerta global virou popup MODAL `<Dialog>` bloqueante que reabre a cada navegação (useLocation wouter + dismissedAtLocationRef). (movida na Rev. 2138)
- Rev. 2124 — RH · Contrato de Experiência: prazo + datas da CLÁUSULA 5ª destacados em VERMELHO `#c1121f` inline (6 spans `<strong>`). (movida na Rev. 2131)

- Rev. 2123 — RH · Contrato de Experiência usa JORNADA REAL do colaborador + bloqueia geração se jornada não definida (toast.error) + nova CLÁUSULA 4ª (HE Art. 59 CLT como prerrogativa empregador) + renumeração 5-9. (movida na Rev. 2130)

- Rev. 2122 — FCSign · painel de status do Contrato de Experiência (sem sessão→botão / pendente→card âmbar + signers / completo→card emerald + visualizar/baixar) + admin_master pode apagar p/ nova emissão (soft-delete) + timeline RAIO-X com eventos FCSign. Hardening: CONFLICT no `create`, ACL via `getCompaniesForUser`. (movida na Rev. 2129)

- Rev. 2121 — FCSign · alerta GLOBAL automático de docs pendentes pra assinatura ao logar · nova `signatures.pendingForCurrentUser` (match por email, respeita ordem sequencial) + `FCSignPendingAlertGlobal` plugado no `DashboardLayout`. (movida na Rev. 2128)

- Rev. 2120 — FCSign · assinatura ESTAMPADA SOBRE a linha do contrato via placeholder HTML comment `<!--FCSIGN:SIG:{role}-->` + helper `stampSignaturesOnSlots` em `server/routers/signatures.ts` + fix sobreposição texto no painel sidebar `AssinarDocumento.tsx`. (movida na Rev. 2127)

- Rev. 2119 — FCSign · fluxo SEQUENCIAL de assinatura + preview parcial com assinaturas estampadas a cada assinatura; `renderFinalHtml` ganha `isPreview`; `getByToken` enriquece HTML + `canSignNow`/`aguardando`; `sign` valida ordem; UI ↑/↓ + card âmbar "Aguardando". (movida na Rev. 2126)

- Rev. 2118 — RH · `codigoInterno` agora SEMPRE é gerado · novo helper `getMaxCodigoInternoNumero` em `server/db.ts`; `createEmployee` faz `COALESCE(...,0)+1` e realinha se colidir; `updateEmployee` preenche código vazio retroativamente. (movida na Rev. 2125)

- Rev. 2117 — Documentos institucionais FC · margem superior da 2ª página ajustada de 40mm para 25mm em `client/src/lib/fcDocumentTemplate.ts` L188. (movida na Rev. 2124)

- Rev. 2116 — Documentos institucionais FC · margem superior de 40mm (4cm) na 2ª página em diante via `@page` + `@page :first` em `client/src/lib/fcDocumentTemplate.ts`. Valor depois ajustado pra 25mm na Rev. 2117. (movida na Rev. 2123)

- Rev. 2115 — RH · Contrato Experiência CLÁUSULA 2ª: valor em formato BR (R$ X.XXX,XX) + por extenso entre parênteses via novo helper `client/src/lib/numeroExtenso.ts` (`formatBRL` + `valorPorExtenso`).

- ~~Rev. 2114~~ — Documentos institucionais FC · template ÚNICO `buildFcDocument` (`client/src/lib/fcDocumentTemplate.ts`) substitui 108 linhas de HTML inline no Contrato de Experiência por 1 chamada. Ver `shared/changelog.ts`. (movida na Rev. 2121)
- ~~Rev. 2113~~ — RH · Contrato Experiência: botão "Salvar Experiência" emerald dedicado no card laranja + mutation `updateExperienciaMut` sem fechar modal. `Colaboradores.tsx`. Ver `shared/changelog.ts`. (movida na Rev. 2120)
- ~~Rev. 2112~~ — RH · Contrato Experiência micro-ajustes finais: Nº/Data sem indent + ASSUNTO indent 0.5cm. Substituído pela Rev. 2114. `Colaboradores.tsx`. Ver `shared/changelog.ts`. (movida na Rev. 2119)
- ~~Rev. 2111~~ — RH · Contrato Experiência faixa azul de volta DENTRO do corpo com `border-radius:4px` (sem `margin:-1.8cm` edge-to-edge). `Colaboradores.tsx` L1956-1958. Ver `shared/changelog.ts`. (movida na Rev. 2118)
- ~~Rev. 2110~~ — RH · Contrato Experiência cabeçalho ampliado pra bater proporcionalmente com Comunicado renderizado: logo 72→115px, razão social 13→19pt, CNPJ 9.5→11pt bold, faixa padding 11→18px texto 12→14pt. `Colaboradores.tsx`. Ver `shared/changelog.ts`. (movida na Rev. 2117)
- ~~Rev. 2109~~ — RH · Contrato Experiência refatorado pra Helvetica 10.5pt + faixa edge-to-edge + bloco ASSUNTO simples + cláusulas inline-bold + rodapé "| Por: userName". Padrão visual depois reajustado nas Rev. 2110/2111. `Colaboradores.tsx`. Ver `shared/changelog.ts`. (movida na Rev. 2116)
- ~~Rev. 2108~~ — RH · FCSign — viewer `max-w-5xl`→`max-w-[1400px]`, sidebar 360→340px, maxHeight 75→82vh + modo "Leitura em Tela Cheia" (`<Eye/>`) com CTA "Ir para Assinatura" emerald→teal no fim do doc + sticky footer. `AssinarDocumento.tsx`. Ver `shared/changelog.ts`. (movida na Rev. 2115)
- ~~Rev. 2107~~ — RH · Contrato de Experiência alinhado ao modelo do Comunicado Interno: adicionado bloco ASSUNTO (slate-50 + border-left navy) + rodapé institucional (`Colaboradores.tsx` L1960-1964/L2033-2037). Ver `shared/changelog.ts`. (movida na Rev. 2114)
- ~~Rev. 2106~~ — RH · Cabeçalho FC institucional centralizado vira REGRA DE OURO (logo + razão social uppercase + CNPJ + endereço + faixa azul #1B2A4A) + fix Contrato de Experiência no FCSign (logo fallback, `<style>` no body, inline styles, `onerror` removido). Ver `shared/changelog.ts`. (movida na Rev. 2113)
- ~~Rev. 2105~~ — RH · FCSign — modal "Enviar para Assinatura" refatorado pra wide/2-colunas (`sm:max-w-[960px]`): Empregado+Empregador lado a lado, card Testemunhas full-width com 2 sub-colunas. `FCSignSendDialog.tsx`. Ver `shared/changelog.ts`. (movida na Rev. 2112)
- ~~Rev. 2104~~ — RH · FCSign — sistema interno de assinatura digital eletrônica (MP 2.200-2/2001). Schema `signature_sessions` + `signature_signers` (token 64-char), router público `getByToken`/`sign`, rota `/assinar/:token`, `SignaturePad.tsx`. Ver `shared/changelog.ts`. (movida na Rev. 2111)
- ~~Rev. 2103~~ — RH · Controle de Documentos / modal "Novo Documento do Colaborador" redesenhada nas regras de ouro (`ControleDocumentos.tsx` ~L1411-1576): header gradient emerald→cyan, body slate-50 com 2 cards (Identificação + Arquivo dropzone), footer pill. A11y fixes (DialogTitle sr-only, htmlFor/id, tabIndex). Ver `shared/changelog.ts`. (movida na Rev. 2110)
- ~~Rev. 2102~~ — RH · Contrato de Experiência ganhou cabeçalho institucional FC (logo + faixa azul #1B2A4A) em `Colaboradores.tsx` ~L1909. Mesmo padrão de Carta MDO + Comunicado Interno. Ver `shared/changelog.ts`. (movida na Rev. 2109)
- ~~Rev. 2101~~ — Frota · `parseTollPdf` fix "require is not defined" trocando `require("pdf-parse")` por `await import("pdf-parse")` (`package.json` é ESM `type: module`). Interop CJS via `.default`. Ver `shared/changelog.ts`. (movida na Rev. 2108)
- ~~Rev. 2100~~ — Frota · Pedágios / botão DEDICADO "Importar PDF" (rose) na barra superior ao lado de "Importar (IA)". `pdfFileRef` + `<input accept="application/pdf">` reusa `handleIaFileSelect` e mesmo modal Rev. 2096. Ver `shared/changelog.ts`. (movida na Rev. 2107)
- ~~Rev. 2096~~ — Frota · modal "Importar Pedágio/Sem Parar com IA" redesenhado nas regras de ouro: DialogContent p-0, header gradient violet→fuchsia, KPI bar 3 cards pós-análise, toolbar Marcar todos/Limpar, footer pill com contador. Ver `shared/changelog.ts`. (movida na Rev. 2103)
- ~~Rev. 2095~~ — UX global · scrollbars sempre visíveis (12px) em todo o ERP. `scrollbar-gutter: stable` no html, `*::-webkit-scrollbar` slate-400/slate-100, `.scrollbar-thin`/`.scrollbar-none` re-declarados com `!important`. Único arquivo: `client/src/index.css`. Ver `shared/changelog.ts`. (movida na Rev. 2102)
- ~~Rev. 2094~~ — Financeiro · Configurações / página inteira redesenhada (header gradient blue→indigo + Settings pill; 4 cards de regime com auto-fill `REGIME_DEFAULTS`; 3 cards didáticos Federais/Municipais/Trabalhistas; KPI bar de sócios com alerta de % ≠ 100). Ver `shared/changelog.ts`. (movida na Rev. 2101)
- ~~Rev. 2093~~ — Financeiro · Configurações / modal "Novo Sócio" puxa sócios já cadastrados em Colaboradores. Backend `listSociosFromEmployees` com dedup CPF normalizado. Frontend com `<optgroup>` disabled "✓ já cadastrado". Ver `shared/changelog.ts`. (movida na Rev. 2100)
- ~~Rev. 2092~~ — Financeiro · Centros de Custo / modal Novo/Editar redesenhado no padrão Categorias (DialogContent `p-0 overflow-hidden`, header gradient + ícone Building2, labels uppercase, Input h-9, `<select>` nativo). Ver `shared/changelog.ts`. (movida na Rev. 2099)
- ~~Rev. 2091~~ — Compras · "Atender pelo Estoque" agora pergunta a OBRA DE ORIGEM. Modal `TransferenciaEstoqueDialog` com saldo na origem + badges; `criarOrdemDeCotacao` ganha `obraOrigemId` opcional. Ver `shared/changelog.ts`. (movida na Rev. 2098)
- ~~Rev. 2090~~ — Compras · Ordens (OC/OS) ganha filtro por Obra. Novo `<Select>` Building2 com "Todas/Sem obra/lista ordenada", reusa `obrasQ`. Botão X limpa, pill de resultados conta o novo filtro. Ver `shared/changelog.ts`. (movida na Rev. 2097)
- ~~Rev. 2089~~ — Compras · Solicitações / ordenação clicável por coluna (default `criadoEm DESC`). Headers viraram `<button>` com ArrowUp/Down, pill "Ordenado por" + reset "↻ mais recentes". `localeCompare(numeric: true)`. Ver `shared/changelog.ts`. (movida na Rev. 2096)
- ~~Rev. 2088~~ — Financeiro · Centros de Custo CRUD completo (editar/inativar/reativar). Backend: `getCostCenters` ganhou `includeInactive`, novo `updateCostCenter` (SET dinâmico, soft delete R-007). Frontend: reescrita pro padrão Categorias (header gradient, KPI bar 4 cards, AlertDialog). Ver `shared/changelog.ts`. (movida na Rev. 2095)
- ~~Rev. 2087~~ — Permissões · menu "Categorias" (Financeiro) não aparecia para grupos sem level=admin/viewer. Fix: adicionar feature em `shared/modules.ts` + `shared/modulePages.ts` (Categorias herda pageId `plano_contas`, irmãs em Cadastros). Ver `shared/changelog.ts`. (movida na Rev. 2094)
- ~~Rev. 2086~~ — Painel RH / Home · Aniversariantes (mês + empresa) ordem cronológica relativa ao HOJE: sort em 3 buckets (isHoje=0 / futuros=1 / jaPassou=2 com tie-break por dia asc) em `server/routers/homeData.ts`. Ver `shared/changelog.ts`. (movida na Rev. 2093)
- ~~Rev. 2085~~ — Almoxarifado · Smart Entry / modal "Receber Material" max-w-lg → max-w-2xl + KPI cards viraram `<button>` filtrando lista (ocFilter: all/pendentes/parciais/atrasadas, toggle ao clicar). Ver `shared/changelog.ts`. (movida na Rev. 2092)
- ~~Rev. 2084~~ — Financeiro · Centro de Custo / código auto-gerado (`CC-{nnnn}`). `createCostCenter`: `codigo` opcional, MAX(REGEXP_REPLACE) + filtro regex `^CC-[0-9]+$` → padded 4 dígitos. Frontend label sem `*`, placeholder "Gerado automaticamente". Ver `shared/changelog.ts`. (movida na Rev. 2091)
- ~~Rev. 2083~~ — Financeiro · Nova tela "Categorias" no sidebar (Cadastros) para CRUD completo de `financial_accounts`. Header gradient blue + KPI bar + filtros + AlertDialog inativar (sem DELETE, R-007). Registrado em 6 pontos. Ver `shared/changelog.ts`. (movida na Rev. 2090)
- ~~Rev. 2082~~ — Financeiro · Lançamentos / cadastro inline de Categoria no modal "Novo Lançamento" + link opcional a Centro de Custo. ColFix `centro_custo_id` + UNIQUE parcial + `createAccount` aceita `codigo` opcional (auto AUTO-{nnnn}) + dedup case-insensitive. Ver `shared/changelog.ts`. (movida na Rev. 2089)
- ~~Rev. 2081~~ — Almoxarifado · Smart Entry / modal "Receber Material" repaginado pelas regras de ouro (header gradient emerald, KPI bar 4 cards, busca, indicador atraso colorido, CTA gradient). Ver `shared/changelog.ts`. (movida na Rev. 2089)
- ~~Rev. 2080~~ — HOTFIX PROD · Cotação Parcial / Geração de OC quebrada (`pg_advisory_xact_lock(bigint, integer) does not exist`). Cast `::bigint, ::int` virou `::int, ::int`. Ver `shared/changelog.ts`. (movida na Rev. 2088)
- ~~Rev. 2079~~ — Comunicados Internos · botão "Lista para Assinatura" com modos digital (SignaturePad canvas DPR-aware) ou impressão. Nova tabela `comunicado_assinaturas` + 3 endpoints + sub-view com 3 KPIs + tabela imprimível institucional. Ver `shared/changelog.ts`. (movida na Rev. 2087)
- ~~Rev. 2078~~ — Aviso Prévio · foto do colaborador ao lado do nome + clique amplia em modal. Backend `avisoPrevioFerias.listar` SELECT + mapper devolvendo `fotoUrl`; client com Avatar 36px clicável + modal Dialog gradient. Ver `shared/changelog.ts`. (movida na Rev. 2085)
- ~~Rev. 2077~~ — Fechamento de Ponto · selo "⚠ Aviso Prévio" agora aparece nos 4 rankings (Pontuais/Atrasados/HE/Menos Dias Trabalhados). Backend já devolvia `emAvisoPrevio`, fix no map do client + render do badge. Ver `shared/changelog.ts`. (movida na Rev. 2086)
- ~~Rev. 2076~~ — Contratos de Terceiros · `confirm()` nativo do navegador substituído por `AlertDialog` shadcn (bulk delete + trash por linha) seguindo padrão de `OrcamentoLista.tsx`. Ver `shared/changelog.ts`. (movida na Rev. 2083)
- ~~Rev. 2075~~ — Fechamento de Ponto · PJ não deve aparecer em rankings/KPIs · guard `COALESCE(tipoContrato,'CLT') <> 'PJ'` em `listRecords`/`getSummary`/`getStats` (3 endpoints + 4 KPIs). Ver `shared/changelog.ts`. (movida na Rev. 2082)
- ~~Rev. 2074~~ — Cotações · botão "Aprovar e Gerar Contrato de Serviço" travava com "Defina o Prazo de Entrega" em MDO puro · fix em `terceiroContratos.aprovarEgerarContrato` + cards "PRAZO ENTREGA" omitidos em header/painel lateral. Ver `shared/changelog.ts`. (movida na Rev. 2081)
- ~~Rev. 2073~~ — Cotações · "Prazo de Entrega" obrigatório em MDO puro (`tipo='servico'`) mesmo o campo não existir — fix em `validarCondicoesVencedor` + banner amber + server `gerarOC`. Ver `shared/changelog.ts`. (movida na Rev. 2080)
- ~~Rev. 2072~~ — Fechamento de Ponto · sub-modal "Menos Dias Trabalhados" (calendário) repaginado pelas regras de ouro (fullscreen + gradient + 6 KPI cards). Ver `shared/changelog.ts`. (movida na Rev. 2079)
- ~~Rev. 2071~~ — Cotações · `handleSalvar` força `tipoPagamento="medicao"` quando MDO+modoEfetivo=medicao + parser `ValidacaoErro` parava bullet inline (`\n` antes do primeiro). Ver `shared/changelog.ts`. (movida na Rev. 2078)
- ~~Rev. 2070~~ — SST Integração · `dashboardKpis` agora espelha `getBadgeCounts` (CTEs last_ok+em_processo, terceiros sem doc, anti-fantasma) — card "Pendentes" não mostra mais 0 quando há pendências. Ver `shared/changelog.ts`. (movida na Rev. 2077)
- ~~Rev. 2069~~ — SST Integração · multiseleção + select-all + bulk delete nas abas Aprovados e Reprovados (espelha padrão da Pendentes, reusa endpoint `excluirRegistros`). Ver `shared/changelog.ts`. (movida na Rev. 2076)
- ~~Rev. 2068~~ — Fechamento de Ponto · fix "Voltar ao ranking" fechava a tela toda no iPad · `onInteractOutside={e.preventDefault()}` no Dialog externo. Ver `shared/changelog.ts`. (movida na Rev. 2075)
- ~~Rev. 2067~~ — Raio-X · fix `100vh`→`100dvh` no overlay (cards SST/Integração cortados no iPad Safari). Ver `shared/changelog.ts`. (movida na Rev. 2074)
- ~~Rev. 2066~~ — Raio-X · Timeline agora inclui TODAS as movimentações (Folha/VR/Adiantamentos/Rateio/Insumos/Desc Almox/Atrasos/PJ Pagamentos + Férias com 3 eventos por período). Ver `shared/changelog.ts`. (movida na Rev. 2073)
- ~~Rev. 2065~~ — Fechamento de Ponto: botão "Voltar ao ranking" nos 3 modais de memória (Atraso/HE/Faltas). Ver `shared/changelog.ts`. (introduziu bug — fixado na Rev. 2068.) (movida na Rev. 2072)
- ~~Rev. 2064~~ — SST badge do menu lateral REALMENTE funciona · `sql\`ANY(${ids})\`` do Drizzle não serializa array JS; fix em `getBadgeCounts` com `sql.raw(\`ANY(ARRAY[...]::int[])\`)` validado por Zod. Ver `shared/changelog.ts`. (movida na Rev. 2071)
- ~~Rev. 2063~~ — SST badge do menu lateral: contagem passa a incluir terceiros (`funcionarios_terceiros` SEM `integracaoDocUrl`). Ver `shared/changelog.ts`. (movida na Rev. 2070)
- ~~Rev. 2062~~ — Faxina do `replit.md`: convenção mudou de 5+10 pra 2+5 (compactos). Ver `shared/changelog.ts`. (movida na Rev. 2069)
- ~~Rev. 2061~~ — Raio-X · card SST · coluna Certificado ganha botões Ver + PDF para aprovados (cert gerado on-the-fly via `generateCertificadoIntegracaoSstPdf`). Ver `shared/changelog.ts`. (movida na Rev. 2068)
- ~~Rev. 2060~~ — Fechamento de Ponto: bug crítico de verificação de HE aprovada — ciclo 16→15 perdia HEs de mês anterior + contador não checava `status === "aprovada"`. Fix: BETWEEN no server + filtro de status no client. Ver `shared/changelog.ts`. (movida na Rev. 2067)
- ~~Rev. 2059~~ — SST Integração: +13 perguntas sobre Segurança na Obra (total 35) + botão "Editar Perguntas" com label visível. Ver `shared/changelog.ts`. (movida na Rev. 2066)
- ~~Rev. 2058~~ — SST Integração: badge vermelho piscante no menu lateral quando há colaboradores sem integração válida (procedure `getBadgeCounts` multi-company). Ver `shared/changelog.ts`. (movida na Rev. 2065)
- ~~Rev. 2057~~ — SST Integração aba Pendentes: badge âmbar "Nª tentativa" pra quem já reprovou antes (count POSTERIOR à última aprovação). Ver `shared/changelog.ts`. (movida na Rev. 2064)
- ~~Rev. 2056~~ — SST Integração: reprovado volta AUTOMATICAMENTE pra Pendentes + botão de editar configuração (título/nota mínima/validade/ativo). Ver `shared/changelog.ts`. (movida na Rev. 2063)
- ~~Rev. 2055~~ — SST Integração: nova aba "Reprovados" no menu (entre Aprovados e Histórico) com badge vermelho da nota e botão Raio-X. Ver `shared/changelog.ts`. (movida na Rev. 2063)
- ~~Rev. 2054~~ — Fechamento de Ponto: ranking "Menos Dias Trabalhados" exclui colaboradores em gozo de férias no período. Ver `shared/changelog.ts`. (movida na Rev. 2062)
- ~~Rev. 2053~~ — SST Integração: +10 perguntas sobre NRs e Segurança APPENDADAS ao banco-padrão (total 22). Ver `shared/changelog.ts`. (movida na Rev. 2062)
- ~~Rev. 2052~~ — SST Integração: assinatura digital do TST no certificado (canvas inline, PNG embutido no PDF). Ver `shared/changelog.ts`. (movida na Rev. 2062)
- ~~Rev. 2051~~ — Fechamento de Ponto: modais de Ranking ganham memória de cálculo clicável + responsivo mobile (2 procedures novos). Ver `shared/changelog.ts`. (movida na Rev. 2062)
- ~~Rev. 2050~~ — SST Integração: AUTO-MIGRAÇÃO no startup das 12 perguntas-padrão "Regras de Ouro" (idempotente, cross-tenant). Ver `shared/changelog.ts`. (movida na Rev. 2062)
- ~~Rev. 2049~~ — SST Integração: nova aba "Aprovados" com Visualizar/Baixar Certificado + atalho pro Raio-X. Ver `shared/changelog.ts`. (movida na Rev. 2062)
- ~~Rev. 2048~~ — SST Integração: certificado ganha logo da FC + cores da marca + headline "Parabéns!" + botão "Visualizar / Imprimir". Ver `shared/changelog.ts`. (movida na Rev. 2062)
- ~~Rev. 2047~~ — SST Integração: 12 perguntas-padrão REESCRITAS fiéis ao vídeo (cultura + 10 Regras de Ouro) + botão "🔄 Atualizar Regras de Ouro". Ver `shared/changelog.ts`. (movida na Rev. 2062)
- ~~Rev. 2046~~ — SST Integração: botão "Carregar Regras de Ouro" + 12 perguntas-padrão semeadas no módulo (cross-tenant idempotente). Ver `shared/changelog.ts`. (movida na Rev. 2062)
- ~~Rev. 2045~~ — SST Integração aba Histórico: confirmação de exclusão via AlertDialog (substitui window.confirm). Ver `shared/changelog.ts`. (movida na Rev. 2062)
- ~~Rev. 2044~~ — SST Integração aba Histórico: bulk-delete + soft-delete via `deletedAt` (preserva trilha de auditoria). Ver `shared/changelog.ts`. (movida na Rev. 2062)
- ~~Rev. 2043~~ — SST Integração "Iniciar agora": pula passo de CPF quando RH já selecionou o colaborador (link `?cpf=...&auto=1`). Ver `shared/changelog.ts`. (movida na Rev. 2058)
- ~~Rev. 2042~~ — SST Integração "Iniciar agora": CAUSA-RAIZ — SELECT usava `employees.nome` (correto é `nomeCompleto`); fix em 3 handlers + try/catch. Ver `shared/changelog.ts`. (movida na Rev. 2057)
- ~~Rev. 2041~~ — SST Integração "Iniciar agora": BUGFIX "abre e fecha sozinho" — janela de splash agora mostra mensagem de erro DENTRO dela em vez de fechar. Ver `shared/changelog.ts`. (movida na Rev. 2056)
- ~~Rev. 2040~~ — SST Integração "Iniciar agora": hardening try/catch + console.error pra capturar "Cannot convert undefined or null to object" no iniciarAgora. Ver `shared/changelog.ts`. (movida na Rev. 2055)
- ~~Rev. 2036~~ — SST Integração aba Pendentes (Rev. 2034) agora filtra "funcionários fantasma" — exclui soft-delete, lista negra e demitidos com status inconsistente. Ver `shared/changelog.ts`. (movida na Rev. 2051)
- ~~Rev. 2035~~ — SST Integração: pontuação vai pro Raio-X do Funcionário + certificado de aprovação em PDF (público e re-emissão no Raio-X). Ver `shared/changelog.ts`. (movida da Rev. 2050)
- ~~Rev. 2034~~ — SST Integração aba Pendentes: novo bloco "Sem integração válida" listando TODOS CLT/PJ/Terceiros que precisam fazer/renovar (24 meses). Ver `shared/changelog.ts`. (movida da Rev. 2049)
> Atualizado na Rev. 2050 — Rev. 2035 movida pra cá.
> Atualizado em 17/05/2026 (faxina) — revisões 2026 a 2030 movidas pra cá.

## Revisão 2030

- ~~Rev. 2030~~ — DP Fechamento de Ponto: calendário reconhece FÉRIAS em gozo e não conta como "Falta provável" (badge sky). Ver `shared/changelog.ts`.

## Revisão 2029

- ~~Rev. 2029~~ — DP Fechamento de Ponto: modal "Memória de cálculo · Atraso Acumulado" em FULL SCREEN com fontes maiores. Ver `shared/changelog.ts`.

## Revisão 2028

- ~~Rev. 2028~~ — Faxina do `replit.md`: cria `replit-history.md` (one-liners 1903→2012) + nova convenção top-5 + 10 one-liners. Ver `shared/changelog.ts`.

## Revisão 2027

- ~~Rev. 2027~~ — DP Fechamento de Ponto: BUGFIX divergência tabela vs modal — `getAtrasoDetalhe` agora soma `r.atrasos` (motor); garantia `SOMA(dias)===tabela`. Ver `shared/changelog.ts`.

## Revisão 2026

- ~~Rev. 2026~~ — SST Integração: Modal "Iniciar Integração" refeito sob a regra de ouro (header gradient emerald/teal, dropdown com avatares, 2-col Obra/Configuração). Ver `shared/changelog.ts`.

## Revisão 2025

- ~~Rev. 2025~~ — Terceiros aba DDS: READ-ONLY (remove formulário manual; registros vêm só de sessões coletivas via `sessao_id`). Ver `shared/changelog.ts`.

## Revisão 2024

- ~~Rev. 2024~~ — SST DDS: terceiros no detalhe da sessão + "Transferir colaborador" aceita terceiros. Ver `shared/changelog.ts`.

## Revisão 2023

- ~~Rev. 2023~~ — SST Integração: card de vídeo reproduz upload (mp4/mov/webm) inline com player HTML5 nativo, sem download. Ver `shared/changelog.ts`.

## Revisão 2022

- ~~Rev. 2022~~ — Infra: CompanyContext expõe `companyIdNum: number` + faxina do replit.md + auditoria de bug latente. Ver `shared/changelog.ts`.

## Revisão 2021

- ~~Rev. 2021~~ — SST DDS: funcionários TERCEIROS vinculados à obra entram na lista "Equipe da obra" do modal Nova Sessão. Ver `shared/changelog.ts`.

## Revisão 2020

- ~~Rev. 2020~~ — SST Integração: bugfix companyId coercion (Zod number). Ver `shared/changelog.ts`.

## Revisão 2019

- ~~Rev. 2019~~ — DP Fechamento de Ponto: modal "Memória de cálculo · Atraso Acumulado" (header gradient, tabela dia a dia, empty-state). Ver `shared/changelog.ts`.

## Revisões 2013 → 2018

- ~~Rev. 2018~~ — SST Integração: barra lateral (DashboardLayout) restaurada. Ver `shared/changelog.ts`.
- ~~Rev. 2017~~ — Terceiros aba Documentos: nova seção "Documentos Trabalhistas" (Ficha de EPI NR-06, OS de SST NR-01, Registro CLT art. 41). Ver `shared/changelog.ts`.
- ~~Rev. 2016~~ — SST Integração: modal de vídeo destrava criação de Config padrão inline (auto-seleção + empty-state com CTA). Ver `shared/changelog.ts`.
- ~~Rev. 2015~~ — DP Fechamento de Ponto: avatares clicáveis com foto + selo CIPA Ativo/Estabilidade em modais de ranking. Ver `shared/changelog.ts`.
- ~~Rev. 2014~~ — DP Fechamento de Ponto: feriados (federais/estaduais/municipais) deixam de contar como falta + chip âmbar no drill-down. Ver `shared/changelog.ts`.
- ~~Rev. 2013~~ — ver `shared/changelog.ts`.

## Revisões 2000 → 2012

- ~~Rev. 2012~~ — SST Integração: upload de vídeo até 600MB via multer. Ver `shared/changelog.ts`.
- ~~Rev. 2011~~ — ver `shared/changelog.ts`.
- ~~Rev. 2010~~ — ver `shared/changelog.ts`.
- ~~Rev. 2009~~ — SST Integração: modal de vídeo refeito sob a regra de ouro (4 seções numeradas). Ver `shared/changelog.ts`.
- ~~Rev. 2008~~ — ver `shared/changelog.ts`.
- ~~Rev. 2007~~ — ver `shared/changelog.ts`.
- ~~Rev. 2006~~ — ver `shared/changelog.ts`.
- ~~Rev. 2005~~ — ver `shared/changelog.ts`.
- ~~Rev. 2004~~ — ver `shared/changelog.ts`.
- ~~Rev. 2003~~ — ver `shared/changelog.ts`.
- ~~Rev. 2002~~ — ver `shared/changelog.ts`.
- ~~Rev. 2001~~ — ver `shared/changelog.ts`.
- ~~Rev. 2000~~ — ver `shared/changelog.ts`.

## Revisões 1903 → 1999

- ~~Rev. 1999~~ — ver `shared/changelog.ts`.
- ~~Rev. 1998~~ — Terceiros: número interno auto-gerado `[SIGLA]-[SEQ]` + upload de foto na criação. Ver `shared/changelog.ts`.
- ~~Rev. 1997~~ — ver `shared/changelog.ts`.
- ~~Rev. 1996~~ — ver `shared/changelog.ts`.
- ~~Rev. 1995~~ — ver `shared/changelog.ts`.
- ~~Rev. 1994~~ — ver `shared/changelog.ts`.
- ~~Rev. 1993~~ — ver `shared/changelog.ts`.
- ~~Rev. 1992~~ — ver `shared/changelog.ts`.
- ~~Rev. 1991~~ — ver `shared/changelog.ts`.
- ~~Rev. 1990~~ — ver `shared/changelog.ts`.
- ~~Rev. 1989~~ — ver `shared/changelog.ts`.
- ~~Rev. 1988~~ — ver `shared/changelog.ts`.
- ~~Rev. 1987~~ — ver `shared/changelog.ts`.
- ~~Rev. 1986~~ — ver `shared/changelog.ts`.
- ~~Rev. 1985~~ — ver `shared/changelog.ts`.
- ~~Rev. 1984~~ — Faxina do replit.md (1ª onda — convenção top-5 detalhado). Ver `shared/changelog.ts`.
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
- ~~Rev. 1958~~ — Faxina prévia (banir marcadores HTML do tipo `<!-- DETALHES REVS ANTIGAS -->`). Ver `shared/changelog.ts`.
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

- ~~Rev. 2037~~ — DP Biblioteca: NOVO artigo "Memorial de Cálculo — DSR". Ver `shared/changelog.ts`.

- ~~Rev. 2038~~ — SST Integração aba Pendentes: botão "Iniciar agora" inicia direto (cria registro + abre tela pública) + nova tela de Boas-vindas antes dos vídeos. Ver `shared/changelog.ts`.

- **Rev. 2039** — SST Integração "Iniciar agora": BUGFIX pop-up blocker Safari/iPad — window.open síncrono + splash inline + redirect no onSuccess. Detalhe completo em `shared/changelog.ts`.

- ~~Rev. 2044~~ — SST Integração aba Histórico: editar/apagar registros + múltipla seleção; ao excluir, colaborador volta automaticamente para "Pendentes" (soft-delete via deletedAt). Ver `shared/changelog.ts`.
- ~~Rev. 2097~~ — Frota · `parseTollPdf` fix "Erro ao interpretar resposta da IA" — `maxTokens` 1024→8192, parser em 3 etapas (`tryParse` → strip markdown → trecho `{...}`), mensagens úteis. Ver `shared/changelog.ts`.
- ~~Rev. 2098~~ — RH · alerta "Início de Férias" virou GLOBAL no módulo RH (não só `/ferias`) via novo `FeriasGozoPrompt` montado em `DashboardLayout`. Modal redesenhado nas regras de ouro. Limpeza em `Ferias.tsx`. Ver `shared/changelog.ts`.
- ~~Rev. 2135~~ — FCSign · Cancelar sessão de contrato_experiencia também REMOVE `employee_contracts` (criado em Rev. 2134) com filtro `criadoPor='FCSign'`.
- ~~Rev. 2136~~ — Contrato de Experiência · validação consolidada de pré-requisitos ANTES de gerar/enviar (toast.error listando bullets). Ver `shared/changelog.ts`.
- ~~Rev. 2137~~ — NOVO Termo de Responsabilidade (entrega equip/veículos/EPIs) com fluxo FCSign completo: lista livre + fotos + numeração sequencial 001/2026 + múltiplos termos ativos por colaborador.
- ~~Rev. 2138~~ — UX: TermoResponsabilidadeDialog migrado de <Dialog> shadcn para FullScreenDialog com header navy + zIndex=70 + footer sticky + thumbs maiores.
- ~~Rev. 2247~~ — FIX/CONSISTÊNCIA (1ª tentativa) · Unifica régua Previsto Acumulado topo↔REFIS via `refDateTop`. Insuficiente — corrigido em 2248. Ver `shared/changelog.ts`.

- ~~Rev. 2249~~ — FEATURE/CONSISTÊNCIA · Topo "Avanço Físico" lê DIRETO snapshot XML MSP (Texto10/Texto7) — Fase 1 pivot "ERP só lê, não calcula". Ver `shared/changelog.ts`.

- ~~Rev. 2250~~ — UX · Modal "Nova Revisão" auto-preenche Responsável com nome do usuário logado. Substituída pela 2251/2252/2253. Ver `shared/changelog.ts`.

- Rev. 2259 — REFACTOR · SE (Solicitação de Equipamento de locação) migra do Almoxarifado para o módulo Compras.
- Rev. 2260 — FIX · Importador MS Project lê % PREVISTO por atividade via Texto6 (FieldID 188743746) como fallback de Texto10.
- Rev. 2261 — BACKFILL · Propaga leitura MSP da Rev. 2260 para todas as obras antigas no startup (idempotente).
- Rev. 2262 — FIX/REGRA DE OURO · Card 'Avanço Físico' do topo (Planejamento → Detalhe) espelha snapshot MSP da raiz UID=0.
- Rev. 2263 — UX · Modal 'Editar Revisão' adota layout moderno FC, espelhando 'Nova Revisão do Cronograma'.
- Rev. 2264 — FIX/REGRA DE OURO · Cards 'PREVISTO (SEMANA)' / 'REALIZADO (ACUM.)' / 'AVANÇO GLOBAL PREVISTO' espelham snapshot MSP da raiz UID=0.
- Rev. 2265 — REGRA ABSOLUTA · Planejamento é READ-ONLY do MSP — SSOT mspReadOnly, 6 cards lendo snapshot direto.
- Rev. 2266 — FIX · Importer Avanço Semanal regrava snapshot MSP via parseMSProjectFull ao reimportar XML.
- Rev. 2267 — UX · Cards exibem snapshot MSP em semanas POSTERIORES ao StatusDate, com chip ambar 'Foto MSP de DD/MM'.
- Rev. 2268 — FIX · Card 'PREVISTO (SEMANA)' varia por semana via pctRaizMSP; chip 'Foto MSP' se refere SO ao Realizado.
- Rev. 2269 — FIX · Barra topo avancoAtual okSemana = semFimVis >= sd — Realizado deixa de regredir em semanas posteriores ao StatusDate.
- Rev. 2270 — FIX · Botões 'Limpar Avanços' também zeram snapshot MSP do calendarioJson (helper limparSnapshotMspDoProjeto).
- Rev. 2271 — FIX · Card 'PREVISTO (SEMANA)' deixa de cair pra '—' quando snapshot MSP é zerado; agora replica topo via pctRaizMSP.

- Rev. 2320 — HOTFIX/IA · `maxOutputTokens` 32k→65k + reparo de JSON truncado em PDF de locação. Ver `shared/changelog.ts`.

- Rev. 2321 — HOTFIX/INFRA · Importação PDF migrada pra polling; proxy Replit matava em 60s. Ver `shared/changelog.ts`.

- Rev. 2322 — HOTFIX/UX · Botão "Confirmar e cadastrar" da importação PDF — diálogo de erro substitui toast invisível. Ver `shared/changelog.ts`.

- Rev. 2323 — FEATURE · Equipamentos Locados — vínculo de obra visível + multi-seleção (limite 500 IDs). Ver `shared/changelog.ts`.

- Rev. 2324 — FEATURE · Dashboard consolidada Almoxarifado & Equipamentos (6 tabs). Ver `shared/changelog.ts`.

- Rev. 2325 — HOTFIX/UX · Exclusão/vinculação em lote — chunking 500 + modais bonitos. Ver `shared/changelog.ts`.

- Rev. 2326 — FEATURE · Importação PDF de locação cruza endereço com obras ativas (auto-match). Ver `shared/changelog.ts`.

- Rev. 2327 — UX · Cada aba do Dashboard Almox & Equip. vira item próprio na sidebar + tabela mês a mês (12m). Ver `shared/changelog.ts`.

- Rev. 2328 — HOTFIX/UX · Exclusão/vinculação em lote de locados — chunk 500→200 + spinner + tempo decorrido. Ver `shared/changelog.ts`.

- Rev. 2329 — PERF · Exclusão/vinculação em lote de locados ~50× mais rápida (bulk SQL). Ver `shared/changelog.ts`.

- **Rev. 2352** — CLEANUP/UX · Removida a subpágina "Parâmetros CAPEX" da UI (sidebar + card no hub + rota + page + mapeamento de módulo); backend procedures e tabela DB preservados.

- **Rev. 2384** — FIX/UX · Badges "X pra receber" do ENTRADA e RECEBER LOCAÇÃO contam só OCs da obra em contexto (ou das obras permitidas); `obraId` opcional + `getEffectiveAllowedObraIds` + FORBIDDEN se fora do allowed (IDOR).
- **Rev. 2383** — FEATURE · Multi-seleção também no view "Todos almoxarifados": Alterar categoria em lote (`atualizarCategoriaPorNomeEmLote` com `lower(nome) IN (...)`) + Próprio/Alugado no consolidado.
