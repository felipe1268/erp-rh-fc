# Histórico de revisões antigas — ERP RH & DP FC Engenharia

> Este arquivo guarda os one-liners das revisões antigas para manter o `replit.md` enxuto.
> O detalhamento completo (causa-raiz, stack traces, arquivos tocados, comentários longos) de TODAS as revisões — incluindo as listadas abaixo — vive em `shared/changelog.ts`.
> Movido aqui na Rev. 2028 (faxina) — revisões 1903 → 2012.

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
