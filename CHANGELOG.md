# ERP RH & DP - FC Engenharia | Changelog de Revisões

## Revisão 1334 — 05/05/2026
- **SMO — Carta de Encaminhamento (Conta Salário) com cabeçalho padronizado**: a "Carta de Encaminhamento para Abertura de Conta Salário" gerada pelo checklist de onboarding agora usa o **mesmo cabeçalho institucional do Comunicado Interno** — logo da empresa, nome (preferencialmente nomeFantasia), CNPJ, endereço/cidade/UF e a faixa azul-escura (`#1B2A4A`) com o título "CARTA DE ENCAMINHAMENTO". Linha de meta abaixo mostra "Abertura de Conta Salário" à esquerda e "Data de Emissão" à direita, idêntico ao Nº/Data do comunicado.
  - **Backend (`server/routers/smo.ts` → `gerarCartaBanco`)**: query passou a retornar `nomeFantasia`, `endereco`, `cidade`, `estado` e `logoUrl` da empresa (campos já existentes em `companies`). Corpo da carta inalterado.
  - **Frontend (`client/src/pages/SolicitacaoMDO.tsx` → `imprimirCarta`)**: HTML de impressão refeito com tipografia sans-serif (Helvetica Neue), wrapper `.doc max-width:780px`, cabeçalho com logo + nome + CNPJ + endereço, faixa de título azul-escura, e meta-linha. Corpo da carta (texto, dados do colaborador, assinatura) preservado integralmente. Fallback `onerror` na tag `<img>` esconde o logo se a URL falhar.

## Revisão 1333 — 05/05/2026
- **SST — Documentos do Colaborador agora mostra desligados/afastados (toggle "Incluir desligados/inativos")**: a aba **Documentos** (Controle de Documentos SST) usava um `<Select>` simples limitado a funcionários ativos, então não era possível cadastrar documento para colaborador desligado, afastado ou em férias. Agora o diálogo "Novo Documento do Colaborador" usa o mesmo `EmployeeSelect` já adotado nas abas **ASO**, **Treinamento**, **Atestado** e **Advertência** — com busca por nome/CPF/código JFC, badge colorido por status (Desligado / Afastado / Férias / Lista Negra) e checkbox **"Incluir desligados/inativos"** no topo do dropdown. Padrão visual idêntico ao "Novo ASO" (imagem 2 do reporte).
  - **Mudanças**: `DocumentosPanel` aceita prop opcional `EmployeeSelect`; o pai `ControleDocumentos` injeta o componente já existente. A lista `employees` passada ao panel mudou de `activeEmployees` para `allEmployees` para que o nome dos desligados também resolva nas listagens de documentos já cadastrados (ex.: doc cadastrado quando o funcionário estava ativo, e depois desligado, agora continua mostrando o nome correto).
  - **Sem regressão**: o fallback `<Select>` antigo permanece (nunca acionado em prática, pois a prop é sempre injetada — fica como rede de segurança caso o componente venha a ser reutilizado em outro contexto).

## Revisão 1332 — 05/05/2026
- **Folha de Pagamento — Diálogo de overrides aparece ANTES da simulação (não depois)**: ao clicar em "Resimular", o aviso "Existem alterações manuais nesta folha — descartar e recalcular do zero / manter alterações manuais" agora abre imediatamente, antes do progresso "Simulando Pagamento" iniciar. Antes, o usuário esperava o spinner de simulação rodar (~vários segundos), o backend retornava `OVERRIDES_EXIST:N`, o frontend abria o diálogo e o usuário só percebia a confirmação ao clicar em "Ver Resultado" — dando a impressão de que o valor não tinha mudado.
  - **Detecção client-side**: o `onClick` do botão Resimular agora conta `pagamentoResult.funcionarios.filter(f => Object.keys(f.descontosManuais ?? {}).length > 0)`. Se > 0, abre `overridesPrompt` direto e **não** dispara a mutation. Se = 0, dispara a mutation normal com `forcarRecalculoPonto: true`.
  - **Vantagem**: zero round-trip ao servidor para detectar overrides — a info já está no `pagamentoResult` carregado. O fluxo do diálogo (Descartar / Manter) permanece idêntico (cada botão dispara a mutation com seu flag, igual antes).
  - **Sem regressão**: a primeira simulação (botão verde "Simular Pagamento") não dispara o caminho do diálogo porque `pagamentoResult` é `null` antes da primeira execução. O backend continua tendo o guard `OVERRIDES_EXIST` como rede de segurança caso outra sessão tenha editado descontos no meio do caminho.

## Revisão 1331 — 05/05/2026
- **Folha de Pagamento — "Resimular" agora recalcula de verdade (faltas/atrasos/HE do ponto)**: o botão "Resimular" do card Simular Pagamento (Cálculo Interno) deixou de ignorar mudanças no ponto. Antes, se o `timecard_daily` já tinha registros para o mês e o período não havia mudado, o backend pulava o reprocessamento e usava os dados derivados antigos — então qualquer ajuste em `time_records` (importação DIXI, edição em Fechamento de Ponto, mudança de jornada/critério) não chegava ao cálculo do líquido, mesmo o vale e os ajustes de escuro sendo lidos frescos.
  - **Backend (`server/routers/payrollEngine.ts` → `simularPagamento`)**: novo input `forcarRecalculoPonto: boolean?`. Quando `true` E já existem registros em `timecard_daily`, o engine agora reexecuta o auto-ponto a partir de `time_records` (faltas, atrasos, horas trabalhadas, horas extras, escuro) ao invés de confiar no cache.
  - **Preservação de edições manuais**: o `DELETE FROM timecard_daily` foi restringido a `origemRegistro NOT IN ('manual', 'ajuste_manual', 'ajusteManual', 'aferido') AND "resolucaoTipo" IS NULL`. Antes da reinserção, o engine carrega os pares `(employeeId, data)` preservados em um `Set` e o loop de auto-ponto pula essas chaves (tanto no laço de dias do período quanto no laço do "fechar no escuro"). Além de origens manuais/aferição, também são preservadas linhas com `resolucaoTipo` preenchido (atestado / justificar / abonar / feriado / bh marcadas pelo Fechamento de Ponto, que zeram `isFalta` sem trocar `origemRegistro`). Resultado: ajustes feitos em **Fechamento de Ponto** e divergências resolvidas em **Aferir Escuro** continuam intactos ao resimular.
  - **Edge case sem `time_records`**: se o usuário força recálculo (`forcarRecalculoPonto=true`) e não existe nenhum `time_record` no período, agora o engine ainda limpa as linhas não-manuais de `timecard_daily` (em vez de logar SKIP e deixar derivados antigos). Primeira simulação (`!pontoProcessado`) mantém o comportamento histórico de SKIP — não há nada para limpar.
  - **Frontend (`client/src/pages/FolhaPagamento.tsx`)**: o botão "Resimular" e os dois botões do diálogo de overrides ("Descartar e recalcular do zero" / "Manter alterações manuais") passam `forcarRecalculoPonto: true` na mutation. Primeira simulação (`Simular Pagamento`) não precisa do flag porque já cai no ramo `!pontoProcessado` que reprocessa naturalmente.
  - **Logs novos**: `[SimPag AUTO-PONTO] forcarRecalculoPonto=true (Resimular). Reprocessando timecard_daily a partir de time_records...` e `Preservando N dia(s) com edição manual/aferição.` para diagnóstico.

## Revisão 1330 — 05/05/2026
- **Proj./Doc. Técnicos — Ordenação crescente/decrescente por código**: o cabeçalho "Título / Código" da listagem de documentos (`client/src/pages/gestaodocumentos/index.tsx`) virou um botão clicável com seta (▲/▼) que alterna entre ordem crescente e decrescente, respeitando a numeração natural dos códigos (`HPAPA-ARQ-009` vem antes de `HPAPA-ARQ-010` e antes de `HPAPA-ARQ-100`). Implementado via `Array.sort` + `String.localeCompare(..., { numeric: true })`. Aplicado a `filteredDocs`, então preserva o filtro por disciplina/sub-pasta/busca. Default agora é **crescente** (antes era decrescente por data de atualização vinda do backend).

## Revisão 1329 — 05/05/2026
- **Previsão de Medição — Sinal/Mobilização agora desconta o Faturamento Direto**: a fórmula passou de `Sinal = Contrato × %` para `Sinal = (Contrato − Faturamento Direto) × %`. O Sinal/Mobilização do contrato é pago sobre a parte da obra que efetivamente vai medir, excluindo os materiais/serviços faturados diretamente pelo cliente (curva ABC).
  - **Faturamento Direto editável**: novo campo "Faturamento Direto (R$)" no bloco "Parâmetros" da Configuração de Medição (5ª coluna do grid, ao lado de Dia de Corte / Sinal / Retenção / Data de Início). Vem pré-preenchido com a soma da aba **F.D.** do BDI do orçamento vinculado (`SUM(bdi_fd.total) WHERE orcamento_id = projeto.orcamentoId`), mas o usuário pode sobrescrever a qualquer momento.
  - **Persistência**: nova coluna `fd_valor NUMERIC(18,2)` em `planejamento_medicao_config` (criada via SyncSchema+ no boot). `NULL` = "usar sugestão automática do orçamento"; valor preenchido = override manual do usuário (inclusive `0`).
  - **Backend**: `getConfigMedicao` agora retorna `fdSugerido` (soma da aba F.D.) junto com o `cfg`, permitindo o fallback automático quando `fd_valor` é nulo. `salvarConfigMedicao` aceita `fdValor: number | null`.
  - **Cálculo no front (`PrevisaoMedicao` em `PlanejamentoDetalhe.tsx`)**: `sinalRaw = (baseV − fdEfetivo) × %sinal / 100` no modo "%". Modo "R$" (override manual em reais) continua sobrescrevendo o cálculo. Hint atualizado mostra "Base: Contrato − F.D. = R$ X · Sinal: R$ Y · Saldo: R$ Z".
  - Toggle "Resetar para sugerido" devolve o campo ao automático (volta a seguir mudanças no orçamento).

## Revisão 1328 — 05/05/2026
- **Cronograma — Desativar atividade individualmente (estilo MS Project "Inactive Task")**: novo 4º checkbox na coluna "Atividade / Grupo" do modo de edição (cinza-escuro, ao lado de Grupo / Marco / Indireta). Marcar a atividade como `disabled` faz ela:
  - Aparecer riscada (line-through) com opacidade reduzida em todas as visualizações.
  - **Sair do cálculo de Avanço Físico, Avanço Previsto e SPI** (`avancoAtual`, `avancoPrevistoDia` em `PlanejamentoDetalhe.tsx`, e também nos cálculos de Avanço Semanal e REFIS — `avancoPrevisto`, `avancoPrevAntes`, `avancoRealAtual`, `avancoRealAntes`, `refisPrevistoComInd`, `refisRealComInd`, `avancoPrevAntesComInd`, `avancoRealAntesComInd`, `grupos` para gráficos do REFIS).
  - **Sair do contador "Atividades concluídas / total"**, da lista de "Atividades em atraso" na Visão Geral e do contador de Indiretas no REFIS.
  - **Sair da soma do Peso%** (não conta nem para denominador nem para a soma 100%).
  - **Receber peso 0** automaticamente em `recalcularPesosFinanceiros` e no auto-cálculo dentro de `salvarAtividades` (tanto via custo do orçamento quanto via duração).
  - **Sair da Curva S Física** (`getCurvaS` — curvas baseline, planejada e realizada — e `getCurvasTodasRevisoes`).
  - **Sair da Curva S Financeira** (`getCurvaSFinanceira`).
  - **Sair do cruzamento Orçamento × Cronograma** (`obterCruzamentoOrcCronograma`: `norm_ativ` agora exige `NOT disabled`), de modo que o Cronograma Financeiro mensal não distribui mais venda/custo para atividades inativas.
  - Persistido em `salvarAtividades` (input zod, mapping de rows e UPDATE em batch passaram a incluir o campo `disabled`; e qualquer atividade com `disabled = true` tem o `pesoFinanceiro` forçado a `"0"` na hora de gravar, independente do que o cliente envia) e em `criarRevisao` (cópia de revisão anterior agora preserva `disabled` e `isMarco`).
  - Também filtrado em `metricsAtuais` (Simulador IA) e em `groupAvMap` (avanço agregado dos grupos no Gantt), evitando que disabled inflasse barras de progresso.
  - **Correção de segurança**: `toggleAtividadesDisabled` (mutation em massa do "Modo seleção") agora exige `projetoId` + `revisaoId` no input e escopa o UPDATE por essas duas colunas, impedindo que IDs de outros projetos/revisões sejam alterados via id-guessing. Além disso, ao desativar, força `peso_financeiro = '0'` para manter a invariante "disabled ⇒ peso 0".
  - **Escopo deliberadamente fora**: `propagateDates` (auto-shift de datas via predecessoras) e `CaminhoCritico` continuam considerando atividades disabled. O usuário pediu "não conte em peso, avanço, custo, curva S" — o scheduler de datas/CPM ficou intocado para evitar regressão silenciosa em planos já validados; pode ser ajustado em uma tarefa futura caso a aderência ao MS Project precise ser estendida.

## Revisão 1327 — 05/05/2026
- **Importação BDI — suporte ao novo padrão da planilha (R06)**: o template `BDI_805_03_2026_R06_REVTE.xlsx` reorganizou as linhas-chave da aba BDI: `B - 02` deixou de ser o "%BDI total" e virou "Lucro líquido 02 - Mão de obra"; o BDI total agora vem do **fator multiplicativo do `PV1`** (col 7), com `BDI = 1 − 1/fator`. Códigos passaram a ter espaços ao redor do hífen (`B - 02`, `B - 04`, `B - 07`) e PV virou `PV1`/`PV2` sem hífen.
  - **Discriminador de formato**: códigos brutos `PV1`/`PV2` sem hífen só existem no R06 (legado tem `PV -1` / `PV - 2`). `parsearAbaBdi` (server/routers/orcamento.ts) usa essa diferença literal — em R06 deriva BDI do PV1; em legado usa B-02 direto. Sem fallback cruzado: planilhas legadas que tenham PV-1 com fator NÃO são confundidas com R06 (regressão evitada).
  - **Linha sintética `B-02`**: em modo R06 o backend acrescenta uma linha com `codigo='B-02'` carregando o BDI calculado, permitindo que `BdiView`, `OrcamentoBdiIndicadores` e `OrcamentoDashTab` (que filtram por `codigo === 'B-02'`) continuem funcionando sem precisar conhecer o R06.
  - **Preço de Venda = PV1**: `totalVendaBdi` agora prioriza o valor de `PV-1` (preço cheio, ex.: R$ 1.414.540,00 no R06), com fallback para `PV-2` (preço com impostos sobre MDO). Decisão da diretoria.
  - Nova função `normalizarCodigoBdi` colapsa espaços ao redor do hífen e insere hífen entre letra e dígito (`PV1` → `PV-1`) — usada apenas para matching interno; o codigo gravado no banco mantém o formato bruto da planilha.
  - Regex `BDI_COD_VALIDO` ampliada: aceita `B\s*-?\s*0?[1-9]` (cobre B-03/B-05/B-07 do novo template) e `PV\s*-?\s*[123]` (com ou sem hífen).
  - `BdiView.tsx`: regex `VALID_BDI` ampliada e helpers (`getGrupoKey`, `isGroupHeader`, `EDITABLE_PCT`, detecção de PV2) passam a normalizar o codigo internamente — assim os códigos R06 (`B - 04`, `PV2`, etc.) ficam visíveis na tabela e respeitam estilos/edição corretamente, sem alterar o que é exibido na coluna "Cód.".
  - Validação do frontend (`OrcamentoImportar.analisarBdi`) deixa de alertar "Linha B-02 não encontrada" quando a planilha nova traz `PV1`.
  - **Sem impacto em obras já cadastradas**: o parser só roda em novas importações; `bdi_percentual` e linhas BDI salvos das obras antigas não são alterados.

## Revisão 1263 — 21/04/2026
- **Botão "Recalcular Período" no Espelho de Ponto**: reaplica em lote a regra de cálculo (HE, atrasos e total trabalhado) em todos os dias do período exibido, sem alterar as batidas. Resolve o caso de dias importados pelo Dixi (especialmente os incompletos / com batidas ímpares) que ficaram com `atrasos = 0:00` por terem sido importados antes da lógica completa rodar — não é mais necessário abrir cada dia, clicar no lápis e salvar manualmente.
  - Nova mutation `fechamentoPonto.recalcularPeriodo` (server) percorre os time_records do período, recomputa `horasTrabalhadas`, `horasExtras` e `atrasos` a partir das batidas existentes e usa a mesma fórmula do `manualEntry`.
  - Respeita ciclos consolidados (não toca em datas dentro de período já fechado) e retorna estatísticas: `recalculados`, `pulados` (já corretos) e `lockedSkipped` (bloqueados).
  - Botão azul "Recalcular Período" adicionado ao lado do "Limpar Ponto" no Espelho de Ponto. Ao concluir, exibe um toast com o resumo e recarrega a tabela.

## Revisão 1262 — 21/04/2026
- **Correção crítica no módulo Horas Extras — desconto de atrasos no pagamento**: o cálculo do HE estava pagando o valor BRUTO (somente excedentes), ignorando os atrasos do mesmo período. O Espelho de Ponto já mostrava o saldo correto (HE − Atrasos), mas o pagamento ia para folha sem o desconto.
  - `computeHEForPeriod` (server/routers/horasExtras.ts) agora soma também os atrasos do período por funcionário e aplica netting: `HE_líquido = max(0, HE_bruto − Atrasos)`. Quando há desconto, o valor é rateado proporcionalmente entre HE de dias úteis (50%) e HE de fim de semana / domingo (100%).
  - `memorialCalculo` retorna campos novos (`totalHEUtilGrossMins`, `totalHEFimGrossMins`, `totalHEGrossMins`, `totalAtrasoMins`, `descontoAtrasoMins`) com o detalhamento bruto × líquido e a lista `diasAtraso` para auditoria.
  - Memorial detalhado da Folha de Pagamento (FolhaPagamento.tsx) agora exibe três linhas no rodapé quando há atrasos: **HE Bruto**, **(−) Atrasos descontados** (em âmbar) e **TOTAL LÍQUIDO** (consolidado). Quando não há atraso, mantém o layout antigo.

## Revisão 1261 — 21/04/2026
- **Reorganização visual da Rescisão Complementar**: card violeta movido para baixo do "TOTAL LÍQUIDO RESCISÃO" (oficial). Estrutura agora é: Card 1 (Rescisão Oficial: verbas + descontos legais + total líquido), Card 2 (Rescisão Complementar uso interno) e nova faixa preta **TOTAL GERAL (Oficial + Complementar)** somando os dois. Aplicado no preview do formulário (AvisoPrevio.tsx), na aba Detalhes do aviso e no Painel RH.

## Revisão 1260 — 21/04/2026
- **Correção crítica no parseBRL**: valores como "1.230" (sem centavos) eram interpretados como 1,23 em vez de 1.230,00, causando rescisões complementares com valores absurdamente baixos. Heurística adicionada distingue separador de milhar (3 dígitos após o ponto) de decimal (1, 2 ou 4+ dígitos).

## Revisão 1259 — 21/04/2026
- **Rescisão Complementar (uso interno)** para funcionários com complemento salarial "por fora":
  - Card violeta ao lado da rescisão oficial mostrando verbas calculadas SOMENTE sobre o complemento (saldo, férias prop. + 1/3, férias vencidas, 13º prop., aviso indenizado).
  - Não inclui FGTS, multa 40%, VR nem médias de adicionais — não substitui o TRCT homologado.
  - Botão "Imprimir Complementar (uso interno)" gera PDF separado com marca d'água "USO INTERNO" em violeta.
  - Calculado/atualizado automaticamente em criação, edição, recálculo em massa e visualização.

## Revisão 26 — 20/02/2026
- Cadastro de 131 funcionários reais da FC Engenharia
- Controle de revisões do ERP (changelog + indicador de versão)
- Placeholder de busca corrigido para "função"

## Revisão 25 — 20/02/2026
- Módulo de Obras (CRUD completo com banco de dados)
- Campo "Obra Atual" no cadastro de colaboradores
- Reorganização do menu OPERACIONAL:
  - Fechamento de Ponto (separado da Folha)
  - Folha de Pagamento (Vale e Pagamento)
  - CIPA
  - Controle de Documentos (Treinamentos, Exames, ASOs, EPIs)
  - Vale Alimentação (IFood Benefícios)
- Remoção de SST - Geral (migrado para Controle de Documentos)
- Remoção de Gestão de Ativos do menu

## Revisão 24 — 20/02/2026
- Importação em massa via Excel (planilha modelo + upload + processamento)
- Botão "Importar Excel" na tela de Colaboradores
- Relatório de importação (sucesso/erros)
- Correção do dialog de cadastro (tamanho da tela)

## Revisão 23 — 20/02/2026
- Seleção múltipla de colaboradores com checkbox
- Exclusão em massa com diálogo de confirmação
- Verificação de CPF duplicado (bloqueia cadastro, mostra empresa existente)
- Remoção do módulo 5W2H do menu
- Remoção do módulo Extintores/Hidrantes do menu
- Remoção do módulo Auditoria e Qualidade (menu, rotas, páginas, dashboards)

## Revisão 22 — 20/02/2026
- Correções de bugs gerais e estabilização

## Revisão 21 — 19/02/2026
- Dashboard de Pendências (documentos vencidos/a vencer)
- Dashboard de Treinamentos (status por colaborador)

## Revisão 20 — 19/02/2026
- Dashboard de Colaboradores (estatísticas, gráficos por setor/função/status)
- Painel "Todos os Dashboards" com visão consolidada

## Revisão 19 — 19/02/2026
- Módulo CIPA completo (membros, mandatos, atas, plano de ação)

## Revisão 18 — 19/02/2026
- Módulo SST - Geral (ASOs, EPIs, Treinamentos)
- Controle de vencimentos e alertas

## Revisão 17 — 19/02/2026
- Módulo Ponto e Folha (upload DIXI, registros de ponto)
- Integração com relógio DIXI

## Revisão 16 — 19/02/2026
- Módulo Gestão de Ativos (equipamentos, veículos, ferramentas)

## Revisão 15 — 19/02/2026
- Cadastro completo de colaboradores com abas:
  - Dados Pessoais
  - Documentos
  - Endereço
  - Profissional
  - Bancário

## Revisão 14 — 19/02/2026
- Filtro por status (Ativo, Afastado, Férias, Desligado, Recluso)
- Busca por nome, CPF, RG ou função

## Revisão 13 — 18/02/2026
- Visualização detalhada do colaborador em dialog

## Revisão 12 — 18/02/2026
- Edição de colaboradores com formulário completo

## Revisão 11 — 18/02/2026
- Exclusão individual de colaboradores com confirmação

## Revisão 10 — 18/02/2026
- Listagem de colaboradores por empresa

## Revisão 9 — 18/02/2026
- Seletor de empresa no topo da página de Colaboradores

## Revisão 8 — 18/02/2026
- Módulo de Empresas (CRUD completo com CNPJ, razão social, etc.)
- Consulta automática de CNPJ via BrasilAPI

## Revisão 7 — 18/02/2026
- Lista negra de funcionários (blacklist)

## Revisão 6 — 18/02/2026
- Sidebar com navegação por categorias (Principal, Gestão de Pessoal, Operacional, etc.)

## Revisão 5 — 18/02/2026
- Dashboard principal com métricas do grupo

## Revisão 4 — 18/02/2026
- Tema visual FC Engenharia (azul escuro #0F2A4A + dourado #C8A45C)
- Logo FC Engenharia na sidebar

## Revisão 3 — 18/02/2026
- Autenticação via Manus OAuth
- Sistema de roles (admin/user)

## Revisão 2 — 18/02/2026
- Estrutura base do projeto (React + Express + tRPC + Drizzle)
- Banco de dados TiDB configurado

## Revisão 1 — 18/02/2026
- Projeto inicializado
- Scaffold inicial do ERP RH & DP

---

**Total de Revisões: 26**
**Versão Atual: Rev. 26**
