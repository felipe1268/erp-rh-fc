# ERP RH & DP - FC Engenharia - TODO

## Fase 1: Infraestrutura e Core RH

### Design e Tema
- [x] Configurar tema escuro azul (#0A192F) com design system corporativo
- [x] Configurar fontes (Roboto/Inter) e paleta de cores

### Multi-Tenant
- [x] Schema de empresas (tenants) com CNPJ, razão social, dados
- [x] Isolamento de dados por tenant em todas as queries

### Autenticação e Permissões
- [x] Schema de perfis: ADM Master, ADM, Operacional, Avaliador, Consulta
- [x] Tabela de permissões granulares por módulo e funcionalidade
- [x] Middleware de verificação de permissões no backend
- [x] Tela de gestão de usuários e atribuição de perfis

### Core RH - Cadastro de Colaboradores
- [x] Schema completo de colaboradores (dados pessoais, documentos, endereço, contato)
- [x] Controle de status: Ativo, Férias, Afastado, Licença, Desligado, Recluso
- [x] Histórico funcional (promoções, mudanças de setor/função)
- [x] CRUD completo de colaboradores com formulário detalhado
- [x] Pesquisa por Nome, CPF ou RG
- [x] Ficha do colaborador para visualização

### Layout e Navegação
- [x] DashboardLayout com sidebar de módulos
- [x] Rotas protegidas por perfil de acesso
- [x] Página inicial com resumo/dashboard geral

### Auditoria de Sistema
- [x] Tabela de log de ações (quem, o quê, quando)
- [x] Registro automático de alterações em registros críticos

### Testes
- [x] Testes unitários para rotas de autenticação
- [x] Testes para estrutura de rotas e permissões (10 testes passando)

## Fase 2: Módulos Operacionais (futuro)
- [ ] Módulo SST (ASO, Treinamentos, EPIs, Acidentes, Riscos, OSS, Advertências)
- [ ] Módulo Ponto e Folha (Integração Dixi, Espelho SCI)
- [ ] Módulo Gestão de Ativos (Frota, Equipamentos, Extintores, Hidrantes)
- [ ] Módulo Auditoria e Qualidade (Auditorias, Desvios, 5W2H, Químicos, DDS)
- [ ] Módulo CIPA (Cronograma Eleitoral, Estabilidade)
- [ ] Módulo Avaliação de Desempenho (integração do sistema existente)
- [ ] Módulo Dashboards (10 dashboards interativos + pendências)
- [ ] Manual de Utilização

## Fase 2: Desenvolvimento em Andamento
- [x] Ajustar tema para claro (branco/azul) igual ao sistema de avaliação
- [x] Adicionar logo FC Engenharia na sidebar
- [x] Criar páginas SST: ASO, Treinamentos, EPIs, Acidentes, Advertências, Riscos
- [x] Criar páginas Ponto e Folha
- [x] Criar páginas Gestão de Ativos: Veículos, Equipamentos, Extintores, Hidrantes
- [x] Criar páginas Auditoria e Qualidade: Auditorias, Desvios, 5W2H, Químicos, DDS
- [x] Criar páginas CIPA: Eleições e Membros
- [x] Criar rotas tRPC para todos os novos módulos
- [x] Atualizar Dashboard Home com cards de todos os módulos
- [x] Registrar versão com descrição clara das melhorias
- [x] Busca automática de dados pelo CNPJ (BrasilAPI) na tela de Empresas

## Fase 3: Redesenho Ponto e Folha
- [x] Corrigir erro removeChild na tela de Ponto e Folha
- [x] Redesenhar página com upload separado por categoria (Vale, Folha, Cartão de Ponto)
- [x] Implementar upload de arquivos XLS (cartão de ponto Dixi) - estrutura criada
- [x] Implementar upload de arquivos PDF (folha/adiantamento contabilidade) - estrutura criada
- [x] Vincular código Sn do cartão de ponto à obra para alocação automática do funcionário (aba Equipamentos Dixi)
- [ ] Criar backend de processamento e armazenamento dos arquivos enviados
- [ ] Tela de visualização dos dados processados por competência
- [x] BUG CRÍTICO: Erro removeChild em todas as telas - RESOLVIDO (cache Vite corrompido, restart resolveu)
- [x] Atualizar logo FC para versão em alta qualidade

## Novas Funcionalidades Solicitadas
- [x] Upload de documentos/certificados por treinamento do funcionário
- [x] Ficha completa do colaborador com histórico de treinamentos, ASOs, advertências
- [x] Busca por treinamento (pesquisar quem tem NR-35, NR-10, etc.)
- [x] Lista Negra de funcionários demitidos que não podem ser recontratados
- [x] Alerta automático ao tentar cadastrar funcionário da Lista Negra
- [x] Status "Lista Negra" com mensagem de proibição visível
- [x] BUG: Cards do Dashboard com texto cortado - corrigido layout vertical com bordas coloridas

## Bugs Reportados - Produção
- [x] BUG CRÍTICO: Erro removeChild persiste em produção - RESOLVIDO (import dinâmico do sonner no DashboardLayout convertido para estático, sonner.tsx corrigido para usar ThemeContext local ao invés de next-themes)
- [x] BUG: Layout confuso e sobreposto em telas - RESOLVIDO (layout do Dashboard verificado e funcionando corretamente)
- [x] BUG: Select com value vazio causando warnings - RESOLVIDO (corrigido para usar undefined)

## Fase 4: 10 Dashboards Interativos
- [x] Analisar planilha Excel original para mapear os 10 dashboards
- [x] Criar rotas tRPC de dados agregados para dashboards
- [x] Dashboard 1: Quadro de Pessoal (headcount por status, setor, cargo)
- [x] Dashboard 2: Pendências (ASOs, treinamentos, auditorias, extintores vencidos)
- [x] Dashboard 3: Treinamentos (realizados, vencidos por norma, evolução mensal)
- [x] Dashboard 4: EPI (estoque, movimentação mensal, top EPIs)
- [x] Dashboard 5: Acidentes (total, afastamentos, meta de dias, gravidade)
- [x] Dashboard 6: Auditorias (status, NC, tipos, desvios)
- [x] Dashboard 7: 5W2H (planos de ação, status, prioridades)
- [x] Dashboard 8: Riscos (tipo, grau, setor, filtro por setor)
- [x] Dashboard 9: Extintores e Hidrantes (status, validade, tipos)
- [x] Dashboard 10: Desvios (status, tipos, setores, taxa resolução)
- [x] Filtros dinâmicos por empresa e período em todos os dashboards
- [x] Navegação integrada no menu lateral
- [x] Testes unitários para rotas de dashboards (20 testes passando)

## Fase 5: Importação em Massa via Excel
- [x] Analisar schema de colaboradores para definir colunas da planilha modelo
- [ ] Criar geração de planilha modelo Excel (.xlsx) para download
- [ ] Criar rota tRPC de upload e parsing da planilha Excel
- [ ] Criar rota tRPC de importação em lote dos colaboradores
- [ ] Criar componente de importação no frontend (upload, preview, confirmação)
- [ ] Integrar botão de importação na página de Colaboradores
- [ ] Validação de dados (CPF, datas, campos obrigatórios)

## Fase 6: Redesign Dashboard Acidentes (igual planilha original)
- [ ] Atualizar backend com agregações: turno, tipo acidente, sexo, parte corpo, setor, lesão
- [ ] Calcular taxa de frequência e índice relativo
- [ ] Redesenhar frontend: meta circular, cards tipo/turno/sexo, top 5 setor, top 5 lesão, partes do corpo

## Fase 7: Correção Geral de Bugs - Todas as Telas
- [x] Corrigir erros de TypeScript pendentes (importExcel.ts)
- [x] Verificar e corrigir cadastro de colaboradores (todos os campos) - 83 testes passando
- [x] Verificar e corrigir todas as telas de CRUD (ASOs, Treinamentos, EPI, Acidentes, etc.) - TODOS PASSANDO
- [x] Criar testes automatizados para validar cada módulo CRUD (63 testes CRUD + 20 outros)
- [x] Verificar routers.ts por inconsistências de schema/input
- [x] Testar build de produção sem erros - BUILD LIMPO
- [x] Verificar formulários frontend para nomes de campos corretos
- [x] Corrigir Ativos.tsx: Veículos (anoFabricacao, renavam, chassi), Equipamentos (marca, modelo, numeroSerie, localizacao)
- [x] Corrigir SST.tsx: Acidentes (horaAcidente, parteCorpoAtingida, diasAfastamento, catData, testemunhas, acaoCorretiva)
- [x] Corrigir AuditoriaQualidade.tsx: Auditorias (titulo, tipo Certificadora, resultado Observacao)
- [x] Corrigir AuditoriaQualidade.tsx: Desvios (titulo, tipo NC_Maior/NC_Menor, responsavel, prazo)
- [x] Corrigir AuditoriaQualidade.tsx: 5W2H (oQue, porQue, quantoCusta)
- [x] Corrigir AuditoriaQualidade.tsx: DDS (dataRealizacao, descricao)
- [x] Corrigir Cipa.tsx: Membros (electionId, representacao, inicioEstabilidade, fimEstabilidade, status)
- [x] Corrigir Cipa.tsx: Eleições (mandatoInicio, mandatoFim, statusEleicao, dataInscricaoInicio, dataInscricaoFim)

## Fase 8: Seed de Dados Completos para Validação
- [x] Verificar/criar 4 empresas: FC Engenharia, Lock Naul, Hotel Consagrado, Júlio Ferraz
- [x] Criar 8 colaboradores fictícios (2 por empresa) com dados pessoais completos
- [x] Lançar treinamentos para todos os colaboradores (20 treinamentos)
- [x] Lançar ASOs para todos os colaboradores (16 ASOs)
- [x] Lançar advertências para alguns colaboradores (6 advertências)
- [x] Lançar EPIs e entregas de EPIs (24 EPIs + 24 entregas)
- [x] Lançar acidentes de trabalho (4 acidentes)
- [x] Lançar riscos por setor (8 riscos)
- [x] Lançar auditorias e desvios (5 auditorias + 5 desvios)
- [x] Lançar planos de ação 5W2H (5 planos)
- [x] Lançar DDS (5 DDS)
- [x] Lançar membros e eleições CIPA (3 eleições + 4 membros)
- [x] Lançar extintores e hidrantes (9 extintores + 5 hidrantes)
- [ ] Validar visualmente todos os módulos com os dados

## Fase 9: Seleção Múltipla, Ações em Lote e Upload Múltiplo
- [ ] Criar componente reutilizável de tabela com checkbox de seleção múltipla
- [ ] Barra de ações em lote (editar selecionados, excluir selecionados, selecionar todos)
- [ ] Aplicar em Colaboradores
- [ ] Aplicar em SST (ASOs, Treinamentos, Acidentes, Advertências, Riscos)
- [ ] Aplicar em Ativos (Veículos, Equipamentos, Extintores, Hidrantes)
- [ ] Aplicar em Auditoria e Qualidade (Auditorias, Desvios, 5W2H, DDS)
- [ ] Aplicar em CIPA (Membros, Eleições)
- [ ] Suporte a upload de múltiplos arquivos em Ponto e Folha
- [ ] Suporte a upload de múltiplos arquivos em Treinamentos (certificados)
- [x] Criar rota tRPC de exclusão em lote (deleteBatch)
- [x] Seleção múltipla com checkbox em Uploads e Folha de Pagamento
- [x] Upload de múltiplos arquivos simultaneamente (input multiple)

## Fase 10: Validação de CNPJ
- [x] Criar função de validação de CNPJ (algoritmo oficial de dígitos verificadores)
- [x] Aplicar validação no backend (rota de criação de empresa)
- [ ] Aplicar validação no frontend (formulário de cadastro de empresa)
- [ ] Formatar CNPJ automaticamente no campo de input (XX.XXX.XXX/XXXX-XX)

## Fase 11: Módulo Completo de Ponto e Folha de Pagamento
### Schema / Banco de Dados
- [x] Adicionar campo valorHora no employees (pessoal é horista)
- [x] Adicionar campo banco (Caixa/Santander) e dados bancários no employees
- [x] Criar tabela overtime_records (horas extras por pessoa/obra com % acréscimo)
- [x] Criar tabela advance_payments (vales/adiantamentos com aprovação)
- [x] Criar tabela vr_benefits (VR/iFood benefícios - custo separado)
- [x] Criar tabela payroll_files (upload de arquivos da contabilidade - payrollUploads ampliada com 9 categorias)
- [x] Criar tabela extra_payments (pagamentos por fora: diferença salário, HE)

### Regras de Negócio
- [x] Cálculo automático de horas extras (valor hora × % acréscimo × quantidade horas)
- [ ] Verificação automática de ano bissexto para cálculo correto de dias
- [x] Campo de % acréscimo de horas extras para cálculo correto
- [x] Validação de vale: se funcionário faltou >10 dias, alerta + campo aprovação sim/não
- [x] Separação vale vs pagamento na folha
- [x] Relatório de pagamento separado por banco (Caixa x Santander)
- [x] Upload múltiplo de arquivos de ponto (um por obra)

### Frontend - Abas do Módulo
- [x] Aba Uploads: upload múltiplo de arquivos por categoria (9 tipos)
- [x] Aba Cartão de Ponto: visualização por funcionário/mês
- [x] Aba Folha de Pagamento: espelho analítico + sintético da contabilidade
- [x] Aba Pagamentos Extras: diferença salário, horas extras (com % acréscimo e cálculo automático)
- [x] Aba Vales/Adiantamentos: lista com aprovação, alerta >10 faltas
- [x] Aba VR/iFood Benefícios: custo separado por funcionário
- [x] Aba Custo Total Funcionário: previsão desembolso (folha + extras + VR)

### Dashboards
- [ ] Dashboard de Horas Extras por obra
- [ ] Dashboard de Horas Extras por pessoa (campeão de HE)
- [ ] Dashboard de Previsão de Desembolso da folha

### Parsers de Arquivos
- [x] Parser Dixi XLS (cartão de ponto)
- [x] Parser Espelho Adiantamento Analítico PDF
- [x] Parser Adiantamento Sintético PDF
- [x] Parser Adiantamento por Banco (CEF/Santander) PDF
- [x] Parser Espelho Folha Analítico PDF
- [x] Parser Folha Sintético PDF
- [x] Parser Pagamento por Banco (CEF/Santander) PDF

## Fase 12: Dashboard de Horas Extras
- [x] Criar rota tRPC de dados agregados de horas extras (por obra, por pessoa, por mês)
- [x] Dashboard com gráfico de HE por obra (barras horizontais)
- [x] Ranking dos "campeões" de horas extras (top 10 por pessoa)
- [x] Impacto financeiro total (custo de HE por obra e por pessoa)
- [x] Evolução mensal de HE (gráfico de linha)
- [x] Filtros por empresa e período
- [x] Integrar na navegação dos dashboards

## Bugs Reportados - Produção (Fase 13)
- [ ] BUG: Erro removeChild na página de Colaboradores em produção
- [ ] BUG: Erro removeChild na página de Ponto e Folha em produção

## Fase 14: Correção removeChild + Seed Massivo
- [x] BUG CRÍTICO: Corrigir erro removeChild em TODAS as telas (produção)
- [x] Seed massivo: 15 funcionários por empresa (60 total)
- [x] Seed: treinamentos, ASOs, advertências, faltas, EPIs para todos
- [x] Seed: acidentes, riscos, auditorias, desvios, 5W2H, DDS
- [x] Seed: extintores, hidrantes, veículos, equipamentos
- [x] Seed: horas extras, folha de pagamento, vales
- [x] Seed: membros CIPA, eleições
- [x] Validar todas as telas no navegador sem erro
- [x] Validar todos os dashboards com dados populados

## Fase 15: Login + Seed Massivo
- [x] Corrigir erro removeChild (removido Portal do Select, Dialog e DropdownMenu)
- [x] Criar tela de login com usuário e senha
- [x] Senha padrão inicial para novos usuários (fc2026)
- [x] Funcionalidade de troca de senha
- [x] Seed massivo: 15 funcionários por empresa (60 total)
- [x] Seed: dados completos em todos os módulos para teste (2068 pontos, 150 ASOs, 184 treinamentos, 244 EPIs, etc.)
- [x] Criar opção de limpeza geral do banco de dados em Configurações
- [x] Proteger limpeza com senha de confirmação (LIMPAR2026)
- [x] Permitir limpeza seletiva por módulo (colaboradores, treinamentos, etc.)
- [x] Testes unitários para settings e userManagement (87 testes passando)

## Fase 16: Melhorias no Formulário de Colaboradores
- [x] Adicionar campo de seleção de empresa no formulário de cadastro/edição de colaborador
- [x] Redesenhar layout do formulário para ficar organizado e profissional (tabs com espaçamento correto)
- [x] Corrigir tabs sobrepostas (Pessoal, Documentos, Endereço, Profissional, Bancário)
- [x] Melhorar espaçamento e alinhamento dos campos em grid 2-3 colunas
- [x] BUG CRÍTICO: Erro React #31 (objeto Date renderizado no JSX) ao clicar em Ver funcionário
- [x] Corrigir dialog de visualização de funcionário para formatar datas corretamente
- [x] Adicionar campo Valor da Hora no formulário (base para cálculo da folha)
- [x] Melhorar aba Bancário: banco de recebimento (Caixa/Santander/Bradesco/Itaú/BB/Nubank/Inter/C6), tipo conta (Salário/Corrente/Poupança), dados PIX completos com tipo de chave

## Fase 17: Correção Bug removeChild na SST
- [x] BUG CRÍTICO: Erro removeChild na página /sst (produção)
- [x] Investigar e corrigir causa raiz em TODAS as páginas e componentes (44 padrões && convertidos para ternário ? : null)

## Fase 18: Correção Definitiva removeChild - Portais Radix UI
- [x] Diagnóstico: erro causado por Radix UI Portals montando no document.body e conflitando com React reconciler em produção
- [x] Criar container fixo #radix-portal no index.html para todos os portais
- [x] Corrigir Dialog Portal para usar container fixo
- [x] Corrigir Sheet Portal para usar container fixo (usado pelo Sidebar mobile)
- [x] Corrigir DropdownMenu Portal para usar container fixo
- [x] Corrigir Tooltip Portal para usar container fixo
- [x] Corrigir Popover Portal para usar container fixo
- [x] Corrigir AlertDialog Portal para usar container fixo
- [x] Corrigir ContextMenu Portal para usar container fixo
- [x] Corrigir HoverCard Portal para usar container fixo
- [x] Corrigir Menubar Portal para usar container fixo
- [x] Build de produção compilando sem erros

## Fase 19: Solução Definitiva removeChild - Abordagem Diferente
- [x] Investigar causa raiz real nos logs do browser (erro só em produção, não no dev)
- [x] Implementar patch no React DOM (dom-patch.ts) para ignorar removeChild/insertBefore em nós órfãos
- [x] Melhorar Error Boundary para recuperar automaticamente de erros de DOM
- [x] Build compilando sem erros, ficha do colaborador abrindo OK
- [ ] Testar em produção após publicação

## Fase 20: Expandir Ficha do Colaborador
- [ ] Expandir dialog de visualização da ficha para ser maior (max-w-4xl ou 5xl)
- [ ] Melhorar espaçamento entre campos para não parecer amontoado
- [ ] Layout em grid mais espaçado com labels e valores bem separados

## Fase 21: Cálculo Automático Valor da Hora
- [x] Calcular valor da hora automaticamente ao digitar salário base (salário ÷ horas mensais)
- [x] Campo valor da hora agora é somente leitura (calculado automaticamente)
- [x] Alterar horas mensais também recalcula o valor da hora

## Fase 22: Bug toISOString ao Editar Colaborador
- [x] BUG: Erro "value.toISOString is not a function" ao salvar edição de colaborador (mudar empresa)
- [x] Corrigido: openEdit agora trata datas como string e exclui createdAt/updatedAt
- [x] Corrigido: handleSubmit remove id, createdAt, updatedAt antes de enviar ao backend

## Fase 23: Expandir Dialog Edição + PDF/Impressão/WhatsApp
- [ ] Expandir grids do formulário de edição para 4 colunas
- [ ] Adicionar botões de PDF, Impressão e Compartilhar via WhatsApp na ficha de visualização
- [ ] Gerar PDF da ficha completa do colaborador
- [x] Adicionar checkbox de seleção múltipla na tabela de colaboradores
- [x] Botão "Excluir Selecionados" para exclusão em massa
- [x] Checkbox "Selecionar Todos" no cabeçalho da tabela
- [x] Endpoint de exclusão em massa no backend
- [x] Sidebar fixa (sticky) - já é fixa pelo componente Sidebar do shadcn/ui
- [x] Remover 5W2H do menu lateral (fora do escopo por enquanto)
- [x] Remover Extintores/Hidrantes do menu lateral (fora do escopo por enquanto)
- [x] Verificação de CPF duplicado ao cadastrar colaborador (BLOQUEAR cadastro, mostrar erro com nome e empresa)
- [x] Remover módulo Auditoria e Qualidade completo (menu, rota, página, dashboards)
- [x] Auto-preenchimento de dados ao digitar CPF - CANCELADO (CPF não tem API pública gratuita)

## Fase 24: Corrigir Dialog de Cadastro/Edição
- [x] Dialog cortando campos - ajustar para tela cheia responsiva (!max-w-7xl w-[95vw])
- [x] Importação em massa via Excel - planilha modelo para download
- [x] Endpoint backend para processar upload de Excel
- [x] Botão "Importar Excel" na tela de Colaboradores
- [x] Relatório de importação (sucesso/erros)

## Fase 25: Módulo de Obras + Rateio de Ponto
- [x] Tabela `obras` no schema (nome, endereço, cliente, status, datas)
- [x] Tabela `obra_funcionarios` para vincular funcionários à obra
- [x] Campo `obraAtualId` no employee para saber onde está alocado
- [x] Funções de banco (CRUD) para obras
- [x] Rotas tRPC para obras
- [x] Página frontend de Obras (cadastro, listagem, edição)
- [x] Menu "Obras" na sidebar (GESTÃO DE PESSOAL)
- [x] Campo "Obra Atual" no cadastro/edição de colaborador
- [ ] Rateio automático de horas por obra no upload de ponto (lê código do relógio)
- [x] Importação em massa via Excel - botão na tela de Colaboradores
- [x] Correção do dialog cortando campos (tamanho da tela)
- [x] Reorganizar menu OPERACIONAL: separar Ponto e Folha
- [x] Menu Fechamento de Ponto (substituir Ponto e Folha)
- [x] Menu Folha de Pagamento (com sub-itens Vale e Pagamento)
- [x] Menu Controle de Documentos (Treinamentos, Exames, etc.)
- [x] Menu Vale Alimentação (IFood Benefícios)
- [x] Remover Gestão de Ativos do menu OPERACIONAL
- [x] Remover categoria SST separada do menu (mover para Controle de Documentos)
- [x] Página de Fechamento de Ponto
- [x] Página de Folha de Pagamento (Vale + Pagamento)
- [x] Página de Controle de Documentos
- [x] Página de Vale Alimentação

## Fase 26: Controle de Revisões do ERP
- [x] Criar changelog completo de todas as revisões (CHANGELOG.md)
- [x] Adicionar indicador de versão/revisão no rodapé do sistema
- [x] Exibir número da revisão atual na sidebar ou footer
- [x] Seed: 131 funcionários reais da FC Engenharia cadastrados
- [x] Corrigir placeholder de busca: "carga" → "função"
- [x] Busca automática de endereço pelo CEP (ViaCEP) no formulário de Colaboradores
- [x] BUG: Erro ao salvar/editar colaborador - Failed query UPDATE employees

## Fase 28: Cadastro de Setores e Reorganização do Menu
- [ ] Criar tabela de setores no banco de dados (vinculada à empresa)
- [ ] CRUD backend de setores (listar, criar, editar, excluir)
- [ ] Página de gestão de Setores
- [ ] Reorganizar menu PRINCIPAL: Empresas, Setores, Colaboradores, Obras
- [ ] Remover campo "Cargo" do formulário de colaboradores (deixar só Função)
- [ ] Campo Setor no formulário de colaboradores como Select (puxando da tabela de setores)

## Fase 28: Cadastro de Setores/Funções e Reorganização do Menu
- [ ] Criar tabela de setores no banco (vinculada à empresa)
- [ ] Criar tabela de funções no banco (vinculada à empresa)
- [ ] CRUD backend de setores e funções
- [ ] Página de gestão de Setores
- [ ] Página de gestão de Funções
- [ ] Reorganizar menu: CADASTROS (Empresas, Setores, Funções, Colaboradores, Obras)
- [ ] Remover campo "Cargo" do formulário de colaboradores
- [ ] Campo Setor como Select no formulário de colaboradores
- [ ] Campo Função como Select no formulário de colaboradores
- [x] Empresa padrão: botão estrela para definir empresa padrão na página de Empresas
- [x] Empresa padrão: ao entrar no sistema abre na empresa definida como padrão (manter seletor para trocar)
- [x] Empresa padrão aplicada em: Home, Colaboradores, Usuários, DashboardFilters (todos os dashboards)
- [x] Bug: título do diálogo de edição mostra "Órgão" ao invés de "Editar Colaborador" - corrigido com DialogDescription
- [x] Jornada de Trabalho: separar em dois campos (Entrada e Saída) com seleção rápida de horários
- [x] Bug: erro SQL ao atualizar colaborador - corrigido com whitelist de campos e conversão de tipos
- [x] Bug: campo "Cargo" removido da aba Profissional (ficou apenas "Função")
- [x] Bug: Select "SelecioneCLT" concatenado no Tipo de Contrato - corrigido via sanitização
- [x] Lançar ~130 funcionários da FC Engenharia (CNPJ 29.353.906/0001-71) no sistema via script - 131 inseridos com sucesso
- [x] Reorganizar menu: criar grupo CADASTRO com Empresa, Colaboradores, Obras, Setores, Função
- [x] Criar página CRUD de Setores (por empresa)
- [x] Criar página CRUD de Funções (por empresa)
- [x] Registrar rotas de Setores e Funções no App.tsx
- [x] Bug: Selects concatenando placeholder com valor - corrigido usando value="none" ao invés de undefined
- [x] Jornada de Trabalho: separada em 3 campos (Entrada, Intervalo, Saída)
- [x] Reescrever Setores.tsx com layout padrão igual Obras (título, subtítulo, seletor empresa, busca, card)
- [x] Reescrever Funcoes.tsx com layout padrão igual Obras
- [x] Criar seletor de empresa global fixo no topo (header) que vale para todas as páginas
- [x] Remover seletores de empresa locais de cada página (usar Context global)
- [x] VARREDURA COMPLETA: corrigir TODOS os Selects com placeholder concatenado em TODAS as páginas do sistema
## Fase 29: Bugs Obras
- [x] BUG: Não é possível criar uma nova obra (erro ao salvar) - corrigido (cleanForm converte strings vazias para undefined)
- [x] BUG: Select de status da obra sobrepondo nomes - corrigido (valor padrão Planejamento em vez de "none")
- [x] BUG: Botão "Nova noite" - era tradução automática do Safari/iOS, adicionado lang=pt-BR e translate=no
- [x] VARREDURA: Verificar textos de botões e títulos em TODAS as páginas - todos corretos no código
## Fase 30: Limpeza de Módulos e Dados
- [x] Remover módulos fora do escopo: SST, CIPA, Ativos, Auditoria Qualidade, Químicos
- [x] Remover dashboards dos módulos removidos (mantidos: Colaboradores e Horas Extras)
- [x] Remover rotas tRPC e funções de banco dos módulos removidos
- [x] Limpar todos os funcionários cadastrados do banco de dados
- [x] Corrigir bug de criação de obra (strings vazias em campos date)
- [x] Corrigir bug de Select de status sobrepondo nomes
- [x] Atualizar menu lateral para refletir apenas módulos ativos
## Fase 31: Selects Dinâmicos de Setor e Função
- [x] Transformar campo Função em Select dinâmico (puxando da tabela funcoes da empresa selecionada)
- [x] Transformar campo Setor em Select dinâmico (puxando da tabela setores da empresa selecionada)
- [x] Atualizar ao trocar empresa no formulário
## Fase 32: Jornada de Trabalho Dia a Dia
- [x] Reestruturar campo jornada para tabela dia a dia (Seg-Dom) com Entrada, Intervalo (duração), Saída
- [x] Atualizar backend para salvar/carregar jornada como JSON
- [x] Atualizar visualização do colaborador para mostrar jornada dia a dia
## Fase 33: Simplificar Obras + Bug Select Setor
- [x] BUG: Select Setor concatenando valor duplicado - removido setor duplicado do banco + validação de duplicata
- [x] Simplificar formulário de Obras: Nome, Nº Orçamento, Sn, Status, Endereço (CEP), Data Início, Data Término, Observações
- [x] Remover campos desnecessários: Código, Cliente, Responsável, Cidade, Estado, Valor Contrato, Data Conclusão Real
- [x] Adicionar campo Sn (código de identificação do relógio de ponto)
- [x] Busca automática de endereço pelo CEP (ViaCEP)
## Fase 34: Linha Padrão na Jornada
- [x] Adicionar linha "Padrão" no topo da tabela de jornada que preenche todos os dias ao ser alterada
## Fase 35: Bug - Dados de Colaboradores não salvando
- [x] Investigar por que dados inseridos/editados nos colaboradores não estão sendo persistidos
- [x] Corrigir o problema de salvamento (create e update)
- [x] Verificar que a linha Padrão da jornada está funcionando corretamente
- [x] Formatar exibição da jornada na ficha do colaborador (resumida e bonita, não JSON bruto)
- [x] Formatar CPF (000.000.000-00) em TODAS as telas do sistema
- [x] Formatar RG, CEP, PIS, CNPJ, Telefone e demais documentos em TODAS as telas
- [x] REGRA PERMANENTE: Todos os números de documentos devem ser exibidos formatados conforme padrão brasileiro
## Fase 36: Bug - Importação de colaboradores via Excel não funciona
- [x] Investigar por que a importação retorna 0 importados e 0 erros
- [x] Corrigir o código de importação para funcionar com a planilha modelo
- [x] Criar rota uploadExcel unificada (parse + import em uma chamada)
- [x] Corrigir parseDate para não depender de XLSX.SSF.parse_date_code
- [x] Adicionar credentials: include nos fetch calls
- [x] Melhorar tratamento de erros no frontend (detectar erros tRPC)

## Fase 37: Módulo Completo de Tratamento de Cartão de Ponto
### Análise e Schema
- [x] Analisar estrutura dos 4 arquivos DIXI reais para mapear campos
- [x] Criar/atualizar schema de registros de ponto (time_records) com campos completos
- [x] Vincular SN do relógio à obra automaticamente (tabela obras.snRelogioPonto)

### Backend - Parser e Regras de Negócio
- [x] Parser DIXI robusto: ler múltiplos arquivos XLS e extrair batidas por funcionário/dia
- [x] Identificação automática de obra pelo número SN do relógio
- [x] Vincular funcionário pelo nome/CPF ao cadastro de colaboradores
- [x] Cálculo de horas trabalhadas por dia (entrada/saída, descontando intervalo)
- [x] Cálculo automático de horas extras (comparar com jornada cadastrada do colaborador)
- [x] Detecção de inconsistências: falta de batida, batida ímpar, horário fora do padrão
- [x] Gerar lista de inconsistências com status (pendente, justificado, advertência)

### Frontend - Tela de Fechamento de Ponto
- [x] Upload múltiplo de arquivos DIXI (um por obra)
- [x] Visualização por competência (mês/ano) com resumo geral
- [x] Tabela de funcionários com horas trabalhadas, HE, faltas, inconsistências
- [x] Detalhe por funcionário: batidas dia a dia com destaque de problemas
- [x] Lançamento manual de batidas (destacado visualmente como "ajuste RH")
- [x] Lista de inconsistências com link para gerar advertência
- [x] Exportação de relatório de ponto por funcionário/obra

### Integração
- [x] Base de dados pronta para consulta pela Folha de Pagamento
- [x] Funcionários com lançamento manual destacados para avaliação futura

## Fase 38: Redesign Controle de Documentos
### Schema e Backend
- [x] Atualizar tabela ASOs com campos: tipo exame, validade em dias, data vencimento, apto/não apto, médico, CRM, exames realizados, upload PDF
- [x] Criar tabela de Atestados (data, tipo, CID, dias afastamento, médico, upload PDF)
- [x] Atualizar tabela Advertências com upload PDF
- [x] Atualizar tabela Treinamentos com upload PDF de certificado
- [x] Cadastro de Tipos de ASO (Admissional, Periódico, Retorno ao Trabalho, Mudança de Função, Demissional)
- [x] Cálculo automático de status (Válido, X dias para vencer, Vencido)
- [x] Rotas tRPC para CRUD de cada tipo de documento com upload S3

### Frontend
- [x] Tela de Controle de Documentos com 4 abas: ASO, Treinamentos, Atestados, Advertências
- [x] Tabela de ASOs no estilo da planilha (NÚM, Colaborador, Tipo, Data Emissão, Validade, Status, Vencimento, Apto, Médico, CRM, Exames)
- [x] Status com cores: verde (Válido), amarelo (X dias para vencer), vermelho (Vencido)
- [x] Upload de PDF em cada registro (botão Anexar PDF + upload S3)
- [x] Botão de download/visualização do PDF (ícone olho quando PDF anexado)
- [x] Filtros por status, tipo de exame, colaborador
- [x] Importação em massa dos dados da planilha ASO enviada (110 ASOs importados com sucesso)

### Cadastro (menu lateral)
- [ ] Adicionar item "ASO" no menu Cadastro para gerenciar tipos de exame padrão

## Fase 39: Cards de Resumo Clicáveis e Responsivos
- [ ] Cards de resumo (ASOs, Vencidos, A Vencer, Treinamentos, Atestados, Advertências) clicáveis
- [ ] Ao clicar em um card, filtrar automaticamente a tabela/aba correspondente
- [ ] Feedback visual no card selecionado (borda, sombra ou destaque)
- [ ] Clicar novamente no card ativo remove o filtro (volta a mostrar todos)
- [ ] Layout responsivo dos cards em telas menores (empilhar em 2 ou 3 colunas)

## Fase 39b: Edição de ASOs e Vínculo com Cadastro de Colaboradores
- [ ] Botão de editar em cada linha da tabela de ASOs (ícone lápis)
- [ ] Dialog de edição de ASO com todos os campos preenchidos
- [ ] Rota tRPC de update para ASOs
- [ ] Seleção de colaborador vinculada ao cadastro de funcionários ATIVOS (não permitir inativos)
- [ ] Não permitir criar ASO para funcionário não cadastrado
- [ ] Aplicar mesma lógica para Treinamentos (edição + colaborador do cadastro)
- [ ] Aplicar mesma lógica para Atestados (edição + colaborador do cadastro)
- [ ] Aplicar mesma lógica para Advertências (edição + colaborador do cadastro)

## Fase 39c: Correção - Colaborador SEMPRE do cadastro + Edição
- [x] Backend: rotas update para Atestados, Treinamentos e Advertências
- [x] Frontend: dropdown de colaborador filtra APENAS ativos do cadastro (employees)
- [x] Frontend: botão editar (lápis) em cada linha de ASO, Treinamentos, Atestados, Advertências
- [x] Frontend: dialog de edição reutiliza mesmo formulário de criação preenchido com dados existentes
- [x] Frontend: mutation de update no frontend para todas as 4 abas

## REVISÃO_01: Melhorias Fechamento de Ponto e Controle de Documentos
### Fechamento de Ponto
- [x] Botão limpar base do mês (apenas ADM)
- [x] Rateio de mão de obra por obra com filtro por equipamento/obra
- [x] Indicadores/cards clicáveis como filtros
- [x] Verificação de duplicidade antes de importar dados (perguntar se quer sobrescrever)
- [x] Auditoria de ajustes manuais (salvar nome do usuário que fez o ajuste)
### Controle de Documentos
- [x] Abas coloridas para melhor identificação visual
- [x] Sistema de advertências progressivas conforme CLT (3 advertências → suspensão → justa causa)
- [x] Modelos de texto normatizados para advertência verbal, escrita, suspensão e justa causa
### Raio-X do Funcionário
- [x] Raio-X completo consolidando TODOS os módulos (ASOs, treinamentos, atestados, advertências, ponto, folha, EPIs)
- [x] Nome do colaborador clicável em TODAS as telas abrindo o Raio-X (Colaboradores, Controle de Documentos, Fechamento de Ponto, Vale Alimentação)
- [x] Desligados não aparecem nas contagens de vencidos/a vencer
### Pendente
- [ ] Geração de PDF por obra e por funcionário para análise ponto a ponto

## REVISÃO_01b: Rateio Automático por Obra no Upload DIXI
- [x] No upload DIXI, ler o número Sn do equipamento de cada registro
- [x] Cruzar Sn com a tabela de Equipamentos Dixi vinculados a Obras
- [x] Gerar rateio automático de horas por obra no momento do upload
- [x] Calcular custo por obra (horas × valor hora do funcionário)
- [x] Exibir rateio na aba "Rateio por Obra" com dados reais gerados automaticamente

## REVISÃO_02: Expandir Telas e Filtro por Obra
### Raio-X do Funcionário
- [x] Expandir modal Raio-X para fullscreen/maximizado (ocupa toda a tela)
- [x] Melhorar layout interno com mais espaço para tabelas e dados
- [x] Cards de resumo maiores e mais legíveis
### Fechamento de Ponto
- [x] Adicionar filtro/select por Obra (Todas as Obras ou obra específica)
- [x] Filtrar Resumo por Colaborador pela obra selecionada
- [x] Filtrar Rateio por Obra pela obra selecionada
### Regra Geral
- [x] SEMPRE expandir telas ao máximo para melhor visualização em todas as telas futuras

## REVISÃO_02b: Alerta Múltiplas Obras
- [x] Detectar funcionários que trabalharam em mais de uma obra no mês
- [x] Exibir alerta visual (amarelo/vermelho) no Resumo e no Rateio
- [x] Indicar quais obras o funcionário trabalhou para verificação

## REVISÃO_03: Upload DIXI Inteligente + Filtro Dinâmico + Validação SN
### Upload DIXI
- [ ] Upload não depende mais do mês selecionado - sistema lê as datas do arquivo e aloca na competência correta automaticamente
- [ ] Se arquivo contém dados de múltiplos meses, distribuir registros por competência correta
- [ ] Remover campo de competência do dialog de upload (botão serve apenas para subir arquivos)
### Filtro de Data
- [x] Substituir input type=month por seletor dinâmico com botões < > de navegação mês a mês
- [x] Design mais intuitivo e bonito para o filtro de competência
### Validação de SN
- [x] Bloquear upload se SN do arquivo não estiver vinculado a nenhuma obra cadastrada
- [x] Mensagem de erro clara solicitando cadastro prévio do SN antes do upload
- [x] Exibir número SN no rateio por obra
### Alerta de Alteração de SN
- [x] Ao alterar SN no cadastro de obras/equipamentos, exibir alerta sobre impacto no rateio
- [x] No relatório de rateio, indicar erro quando SN não tem obra definida

## REVISÃO_03: Upload DIXI Inteligente + Filtro Dinâmico + Validação SN + Detalhe por Obra
### Upload DIXI Inteligente (REGRA MÃE)
- [x] REGRA MÃE: NUNCA alocar registro no mês errado — sempre respeitar data do arquivo
- [x] Upload auto-detecta mês dos registros do arquivo (não depende do filtro de mês)
- [x] Distribuir registros por competência correta baseado na data do arquivo
- [x] Remover campo de competência do dialog de upload
- [x] Pré-validação: mostrar resumo de meses detectados antes de importar
- [x] Alerta informativo quando arquivo contém registros de múltiplos meses
### Filtro de Data Dinâmico
- [x] Substituir input type=month por seletor com botões < > de navegação mês a mês
- [x] Design intuitivo e bonito para o filtro de competência
### Validação de SN Obrigatória
- [x] Bloquear upload se SN do arquivo não estiver vinculado a nenhuma obra cadastrada
- [x] Mensagem de erro clara solicitando cadastro prévio do SN antes do upload
### Detalhe do Funcionário por Obra
- [x] Na tela de detalhe (Registro Diário), separar registros por obra
- [x] Mostrar nome da obra como header de cada grupo de registros
### SN no Rateio
- [x] Exibir número SN do equipamento no rateio por obra
### Alertas de Alteração de SN
- [x] Ao alterar SN no cadastro de obras, exibir alerta sobre impacto no rateio
- [x] No relatório de rateio, indicar erro quando SN não tem obra definida

## FIX: Dialog de Upload DIXI cortado
- [x] Expandir dialog de upload e adicionar scroll interno para conteúdo longo

## REVISÃO_04: Filtro Visual Ano/Mês + Consolidação Mensal
### Filtro Visual de Ano/Mês
- [x] Seletor de ano no topo
- [x] 12 botões de meses com cores: Azul (com lançamento), Cinza (sem lançamento), Verde (consolidado)
- [x] Substituir filtro atual por novo layout visual
### Consolidação Mensal
- [x] Criar tabela pontoConsolidacao no schema (companyId, mesReferencia, consolidadoPor, consolidadoEm, status)
- [x] Rota consolidar: marca mês como consolidado, registra quem e quando
- [x] Rota desconsolidar: apenas admin master pode desconsolidar
- [x] Bloqueio de upload DIXI quando mês consolidado
- [x] Bloqueio de lançamento manual quando mês consolidado
- [x] Bloqueio de limpar base quando mês consolidado
- [x] Botão "Consolidar Mês" visível na interface
- [x] Nome do responsável pela consolidação visível no filtro e relatório
- [x] Rota getMonthStatuses: retorna status de todos os meses de um ano (sem dados, com dados, consolidado)

## REVISÃO_04b: Conflito Obra/Dia + Consolidação + SN Vinculado
### Conflito de Obras no Mesmo Dia
- [x] Detectar funcionário com registro em 2+ obras na mesma data
- [x] Marcar como "Conflito de Obra" com alerta vermelho no detalhe
- [x] Card de alerta mostrando dias com conflito e quais obras
- [x] Opção de validar (deslocamento real) ou rejeitar (erro de lançamento)
### SN Sempre Vinculado
- [x] SN nunca digitado, sempre puxado da base de cadastro da obra
- [x] Exibir SN junto ao nome da obra em todas as telas (detalhe, rateio)
### Consolidação Mensal
- [x] Rotas consolidar/desconsolidar no backend
- [x] Bloqueio de upload/lançamento/limpar quando consolidado
- [x] Botão "Consolidar Mês" na interface
- [x] Nome do responsável pela consolidação visível
### Filtro Visual Ano/Mês
- [x] Seletor de ano + 12 botões de meses
- [x] Azul = com lançamento, Cinza = sem lançamento, Verde = consolidado
- [x] Rota getMonthStatuses retornando status de cada mês

## REVISÃO_05: Botão de Impressão/PDF
- [x] Adicionar botão de impressão na barra de ações do Fechamento de Ponto
- [x] Gerar PDF/imprimir do Resumo por Colaborador
- [x] Gerar PDF/imprimir do Rateio por Obra (separado por obra)
- [x] Gerar PDF/imprimir do Detalhe do Funcionário (registro diário)
- [x] Layout de impressão profissional com cabeçalho FC Engenharia, data, competência

## REVISÃO_05b: Resolução Fluida de Conflitos e Inconsistências

### Conflitos de Obra/Dia — Ações Inline
- [x] Cada conflito clicável expande inline mostrando registros lado a lado
- [x] Botão "Manter na Obra A" — remove registro da obra errada
- [x] Botão "Manter na Obra B" — remove registro da obra errada
- [x] Botão "Confirmar Deslocamento" — valida que esteve nas duas obras
- [x] Botão "Excluir Duplicado" — remove registro duplicado (erro de lançamento)
- [x] Backend: rota resolveConflito com ações (manter_obra, confirmar_deslocamento, excluir_duplicado)

### Inconsistências — Ações Inline
- [x] Cada inconsistência clicável expande inline com detalhes + ações rápidas
- [x] Ações rápidas: Justificar, Corrigir (lançar manual), Advertência — tudo inline
- [x] Sem dialog separado — fluxo fluido no mesmo lugar

### Botão de Impressão/PDF
- [x] Botão Imprimir/PDF na barra de ações
- [x] Impressão do Resumo por Colaborador
- [x] Impressão do Rateio por Obra
- [x] Impressão do Detalhe do Funcionário
- [x] Layout profissional A4 paisagem com header FC Engenharia

## FIX: Formatação de Valores Monetários
- [x] Formatar campos de Salário Base e Valor da Hora no padrão brasileiro (ponto milhares, vírgula centavos)
- [x] Aplicar formatação em todos os campos monetários do sistema

## REVISÃO_06: Impressão Ficha + Rodapé LGPD
- [x] Botão de impressão/PDF na Ficha do Colaborador
- [x] Rodapé LGPD em TODOS os documentos: nome do usuário, data/hora, aviso confidencialidade
- [x] Aplicar rodapé LGPD no Fechamento de Ponto (Resumo, Rateio, Detalhe)
- [x] Aplicar rodapé LGPD na Ficha do Colaborador

## REVISÃO_07: Melhoria de Navegação nas Inconsistências
- [x] Exibir registros do dia da inconsistência ao expandir (batidas registradas)
- [x] Adicionar link/botão para navegar ao detalhe do funcionário diretamente da inconsistência
- [x] Mostrar informações contextuais (obra, horários registrados) na área expandida
- [x] Melhorar layout da área expandida com mais informações úteis para resolução

## REVISÃO_08: Múltiplos SNs por Obra + Regras de Negócio
- [x] Criar tabela obra_sns (obraId, sn, status ativo/inativo, dataVinculo, dataLiberacao)
- [x] Migrar campo snRelogioPonto existente para nova tabela
- [x] Validação de unicidade: SN nunca pode estar em 2 obras "Em Andamento" ao mesmo tempo
- [x] Liberação automática: quando obra muda para Concluída/Paralisada/Cancelada, SNs ficam disponíveis
- [x] Backend: CRUD de SNs por obra com validação
- [x] Frontend: gerenciamento de múltiplos SNs no formulário de obras (adicionar/remover)
- [x] Frontend: exibir SNs na listagem de obras e no card da obra
- [x] Atualizar integração DIXI: lookup de SN busca na nova tabela obra_sns
- [x] Atualizar rateio por obra para exibir todos os SNs vinculados
- [x] Testes de validação de unicidade de SN

## REVISÃO_09: Raio-X Full Screen + Advertências CLT + Upload Atestados
- [x] Raio-X do Funcionário em tela cheia (full screen) com layout responsivo
- [x] Botões de Impressão e Gerar PDF no Raio-X com footer LGPD
- [x] Centralizar advertências: toda advertência vai para ficha do funcionário
- [x] Contador de advertências com alerta de suspensão após 3ª advertência
- [x] Modelo de Advertência conforme CLT, texto editável pelo Admin Master
- [x] Modelo de Suspensão conforme CLT, texto editável pelo Admin Master
- [x] Schema: tabela de modelos de documentos (advertência, suspensão, etc.)
- [x] Upload de atestado médico (arquivo) no formulário de atestados
- [x] Multi-seleção para deletar atestados em lote
- [x] Integração: advertências do Fechamento de Ponto aparecem no Raio-X

## REVISÃO_10: Seção Relatórios no Menu + Raio-X como Página Dedicada
- [x] Criar seção "Relatórios" no menu lateral (abaixo de Operacional ou Dashboards)
- [x] Criar página dedicada de Raio-X do Funcionário com seleção de colaborador
- [x] Registrar rota no App.tsx
- [x] Manter o Raio-X como componente reutilizável (dialog em outras telas + página dedicada)

## REVISÃO_11: Bug Fix - Integração Advertências + Modelo CLT para Impressão
- [x] Bug: botão Advertência nas inconsistências não cria registro no warnings do funcionário
- [x] Conectar advertência da inconsistência ao sistema de warnings (Controle de Documentos)
- [x] Criar modelo CLT padrão de advertência para impressão com campos de assinatura
- [x] Criar modelo CLT padrão de suspensão para impressão com campos de assinatura
- [x] Botão para imprimir/gerar PDF do documento de advertência formatado
- [x] Garantir que advertência criada em qualquer tela apareça no Raio-X e no Controle de Documentos
- [x] Tela de edição de modelos de documentos acessível pelo Admin Master

## REVISÃO_11B: Raio-X FULL SCREEN REAL + Impressão Advertência CLT
- [x] BUG: Raio-X abre como dialog pequeno, precisa ser FULL SCREEN (100vw x 100vh)
- [x] Reescrever RaioXFuncionario como overlay fixo ocupando tela inteira
- [x] Botão de imprimir documento CLT de advertência na tabela de advertências
- [x] Garantir que advertência das inconsistências cria registro no warnings

## REVISÃO_11C: Visualização Documento CLT + Upload Assinado
- [x] Dialog de visualização do documento CLT completo após salvar advertência
- [x] Botão de Imprimir para Assinatura direto do dialog de visualização
- [x] Botão de Upload do documento assinado para registro
- [x] Integrar no fluxo: salvar → visualizar → imprimir → upload assinado

## REVISÃO_12: 3 Testemunhas com Nome + CPF/RG
- [x] Substituir campo único de testemunhas por 3 campos individuais (Nome + CPF/RG)
- [x] Atualizar documento CLT de impressão com 3 testemunhas
- [x] Atualizar dialog de visualização com 3 testemunhas

## REVISÃO_12B: Dialog Advertência FULL SCREEN + Numeração
- [x] Dialog de visualização do documento CLT em FULL SCREEN (não dialog pequeno)
- [x] Incluir numeração da advertência no documento (1ª, 2ª, 3ª...)
- [x] Incluir 3 testemunhas com Nome e CPF/RG no documento CLT
- [x] Todas as telas/dialogs do sistema devem ser FULL SCREEN

## REVISÃO_12C: Logo FC Engenharia + FULL SCREEN + Numeração + 3 Testemunhas
- [x] Adicionar logo FC Engenharia no cabeçalho do documento de advertência
- [x] Dialog de visualização em FULL SCREEN
- [x] Numeração da advertência (1ª, 2ª, 3ª...) no documento
- [x] 3 testemunhas com Nome e CPF/RG no documento de impressão

## REVISÃO_13: Botão Voltar no Raio-X
- [x] Adicionar botão de voltar à tela de seleção no Raio-X do Funcionário (página Relatórios)

## REVISÃO_14: Remover redundância - Botão Advertência nas Inconsistências
- [x] Remover dialog "Gerar Advertência" do Fechamento de Ponto (redundante)
- [x] Botão Advertência deve navegar direto para Controle de Documentos > aba Advertências
- [x] Pré-preencher dados do colaborador e inconsistência ao navegar

## REVISÃO_15: Varredura Full Screen + Busca + Voltar + Legenda Cores + Verbal
- [x] Busca por nome/CPF no select de colaborador (advertência e outros formulários)
- [x] Varredura: converter TODOS os dialogs para FULL SCREEN em todas as telas (22 dialogs em 9 páginas)
- [x] Botão Voltar em todas as telas full screen para facilitar navegação
- [x] Remover dialog redundante de advertência no Fechamento de Ponto (navegar direto ao Controle de Documentos)
- [x] Legenda de cores por sequência de advertência (1ª verde/amarelo, 2ª laranja, 3ª+ vermelho)
- [x] Advertência Verbal: apenas registro, sem documento CLT/impressão/visualização
- [x] Componente FullScreenDialog reutilizável criado para padronizar todas as telas
- [x] Páginas convertidas: ControleDocumentos (5), FechamentoPonto (6), Colaboradores (3), Empresas (1), Obras (1), Funções (1), Setores (1), Usuários (2), Configurações (2)

## REVISÃO_16: Validação de Dados + Tempo de Empresa + Aniversário
- [x] Corrigir exibição de Salário (R$ 2,50 está errado — parseBRNumber para formato brasileiro)
- [x] Corrigir Valor/Hora: R$ NaN — parseBRNumber trata vírgula e ponto corretamente
- [x] Adicionar Tempo de Empresa (ex: "3 anos e 5 meses") no Raio-X
- [x] Adicionar Data de Aniversário e dias faltando para o próximo aniversário
- [x] Validação geral: tratar nulos, NaN, undefined antes de exibir qualquer dado
- [x] REGRA: Sempre verificar informações antes de exibir ao usuário
- [x] Varredura: corrigir Number() direto em valores monetários em FolhaPagamento e Raio-X (folha)

## REVISÃO_17: Aniversário em meses e dias
- [x] Alterar exibição de dias faltando para aniversário de "em X dias" para "em X meses e Y dias"

## REVISÃO_18: Módulo Folha de Pagamento Completo (Redesign)
- [x] Adicionar campo codigoContabil no schema do funcionário (+ campo no formulário de cadastro e visualização)
- [x] Criar tabelas: folha_lancamentos e folha_itens no banco de dados
- [x] Backend: parser de PDF analítico (espelho) para extrair dados por funcionário
- [x] Backend: parser de PDF sintético (líquido) para extrair lista resumida
- [x] Backend: parser de PDF resumo por banco (CEF/Santander)
- [x] Backend: router de importação com validação cruzada (cadastro, status, salário, ponto)
- [x] Frontend: redesenhar página Folha de Pagamento com layout similar ao Fechamento de Ponto
- [x] Frontend: seletor ano/mês com legenda de status (sem lançamentos, com lançamentos, consolidado)
- [x] Frontend: cards Vale/Adiantamento e Pagamento separados com resumo
- [x] Frontend: upload de 4 arquivos por lançamento (analítico, sintético, banco CEF, banco Santander)
- [x] Frontend: tela de detalhes com busca/filtro + tela de verificação cruzada
- [x] Verificação cruzada: funcionários da folha vs cadastro (match código contábil + nome)
- [x] Verificação cruzada: status ativo (alertar férias, afastado, demitido)
- [x] Verificação cruzada: salário base folha vs salário cadastrado
- [x] Verificação cruzada: horas ponto consolidado vs horas folha
- [x] Consolidar/desconsolidar lançamentos + excluir + re-match
- [x] FullScreenDialog para todos os dialogs (upload, detalhes, verificação cruzada)

## REVISÃO_19: Fluxo Intuitivo de Tratamento de Inconsistências
- [x] Backend: rota resolveBatchByType para resolver inconsistências em lote por tipo
- [x] Backend: rota resolveAllInconsistencies para resolver TODAS as inconsistências de uma vez
- [x] Backend: rota resolveAllConflitos para resolver todos os conflitos de obra em lote
- [x] Backend: rota resolveSelectedInconsistencies para resolver IDs selecionados
- [x] Frontend: organizar inconsistências por tópico/seção com cards coloridos por tipo (Batida Ímpar=vermelho, Falta Batida=âmbar, Horário Divergente=azul, Sem Registro=cinza)
- [x] Frontend: botões de ação rápida (Justificar/Corrigir/Advertência) direto na tabela + expandível com detalhes
- [x] Frontend: botão "Resolver Tipo (N)" em cada seção/tópico para resolver em lote por tipo
- [x] Frontend: botão "Resolver Todas (N)" geral no topo para resolver todas as inconsistências
- [x] Frontend: seção separada de Conflitos de Obra com botão "Resolver Todos" em lote
- [x] Frontend: filtros por status (Pendentes/Resolvidas/Todas) e por tipo de inconsistência
- [x] Frontend: resumo visual com contadores (pendentes, resolvidas, conflitos de obra)
- [x] Frontend: fluxo intuitivo de validação antes de permitir consolidar o mês

## REVISÃO_20: Redesenho Folha de Pagamento (Modelo Correto 4 Arquivos)
- [x] Simplificar modelo: apenas 4 arquivos (2 adiantamento dia 20 + 2 pagamento 5º dia útil)
- [x] Cada lançamento recebe: 1 Analítico (006 espelho detalhado) + 1 Sintético (007 lista resumida)
- [x] Remover categorias extras de upload (banco CEF, banco Santander, etc.)
- [x] Atualizar schema/enum de categorias de arquivo no banco de dados
- [x] Atualizar parser do PDF analítico (006) para extrair dados corretos por funcionário
- [x] Atualizar parser do PDF sintético (007) para extrair lista resumida
- [x] Atualizar routers de importação da folha
- [x] Redesenhar frontend: cards Adiantamento (dia 20) e Pagamento (5º dia útil) com 2 uploads cada
- [x] Verificação cruzada: funcionários da folha vs cadastro (match código contábil + nome)
- [x] Testar com PDFs reais (006 e 007 de janeiro)
- [x] Cadastro automático de código contábil nos funcionários ao importar folha
- [x] Verificação cruzada completa: salário, função, dados admissão, ponto
- [x] Teste real com PDFs 006 e 007 de janeiro via upload no sistema

## REVISÃO_21: Código Interno JFC (Identificação Única do Funcionário)
- [x] Schema: adicionar campo codigoInterno (varchar único) na tabela employees
- [x] Backend: gerar automaticamente JFC001, JFC002... ao criar funcionário
- [x] Backend: garantir que código é único e nunca reutilizado (mesmo após desligamento)
- [x] Backend: somente ADM Master pode alterar o código interno
- [x] Frontend: exibir campo JFC na aba Profissional (primeiro campo, antes da Matrícula)
- [x] Frontend: campo read-only para usuários normais, editável apenas por ADM Master com ícone Lock
- [x] Migração: gerar códigos JFC001-JFC132 para todos os 132 funcionários existentes
- [x] Teste visual: campo JFC002 aparecendo corretamente na edição do funcionário ACACIO LESCURA DE CAMARGO

## REVISÃO_22: Melhorias Massivas na Folha de Pagamento
### Layout e UX
- [ ] Redesenhar layout da tela de detalhes da folha - mais agradável e responsivo
- [ ] Adicionar coluna "Função" de cada colaborador na listagem
- [ ] Filtros avançados de inconsistências (por tipo, por status, por obra)
- [ ] Verificação dinâmica: ao atualizar dados, re-verificar se inconsistências persistem

### Custos por Obra
- [ ] Separar custos do funcionário por obra (baseado no controle de ponto)
- [ ] Filtro por obra na folha de pagamento (como no controle de ponto)
- [ ] Alocar custo de mão de obra no projeto correto (vale e pagamento)

### Horas Extras
- [ ] Separar valores de horas extras de cada funcionário
- [ ] Ranking de obra que mais faz horas extras por período (dia, semana, mês, trimestre, semestre, ano)
- [ ] Relatório de horas extras por funcionário e por obra

### Complemento Salarial (Pagamento por Fora)
- [ ] Schema: campos recebeComplemento (boolean) e valorComplemento (decimal) no cadastro do funcionário
- [ ] Frontend: botão/toggle no cadastro perguntando se recebe complemento
- [ ] Se sim, habilitar aba/campo para digitar o valor do complemento
- [ ] Somar complemento ao valor da contabilidade na folha

### Acordo Individual de Horas Extras
- [ ] Schema: campos acordoHoraExtra (boolean) e configuração de % por tipo de HE
- [ ] Frontend: botão/toggle no cadastro perguntando se tem acordo de HE
- [ ] Se sim, abrir janela para configurar critérios (% de acréscimo customizado)
- [ ] Valores padrão CLT congelados: HE 50%, HE 100%, Noturno 20%, etc.
- [ ] Se acordo marcado, liberar edição dos % para zerar ou reduzir
- [ ] Aplicar percentuais customizados no cálculo de horas extras do funcionário

## REVISÃO_23: Bloqueio de Consolidação + Resolução em Lote (Múltiplas Obras e Conflitos)
- [ ] Backend: bloquear consolidação se houver inconsistências pendentes, múltiplas obras ou conflitos não resolvidos
- [ ] Backend: rota para resolver todas as múltiplas obras de uma vez
- [ ] Backend: rota para resolver todos os conflitos de obra de uma vez
- [ ] Frontend: botão "Resolver Todas" na seção de Múltiplas Obras
- [ ] Frontend: botão "Resolver Todos" na seção de Conflitos de Obra/Dia
- [ ] Frontend: bloqueio visual do botão Consolidar com mensagem explicativa das pendências
- [ ] Frontend: seleção múltipla para resolver várias de uma vez

## REVISÃO_23: Correções Críticas Fechamento de Ponto + Folha
- [x] Fix: Total Líquido do Pagamento mostra R$ 0,00 (parser com fallback para Líquido standalone)
- [x] Fix: Botão "Confirmar Deslocamento Real" funciona corretamente (com validação de sobreposição)
- [ ] Implementar rateio proporcional por tempo em cada obra ao confirmar deslocamento real
- [ ] Botão "Resolver Todas" na seção de Múltiplas Obras (resolver em lote)
- [ ] Botão "Resolver Todos" na seção de Conflitos de Obra (resolver em lote)
- [ ] Bloqueio de consolidação se houver inconsistências pendentes, múltiplas obras ou conflitos não resolvidos

## Fase 23: Validação de Sobreposição de Horários em Conflitos de Obra
- [x] Validação de sobreposição de horários: barrar "Confirmar Deslocamento" quando horários se sobrepõem entre obras
- [x] Resolução em lote (resolveAllConflitos) deve pular conflitos com sobreposição e retornar lista dos que precisam resolução manual
- [x] Frontend: exibir erro claro quando há sobreposição, indicar que o usuário deve escolher manualmente qual obra manter
- [x] Frontend: diferenciar visualmente conflitos com sobreposição (vermelho) vs deslocamento real válido (verde)

## FIX: pdftotext not found em produção
- [x] Substituir comando pdftotext (sistema) por biblioteca Node.js pdf-parse para extração de texto de PDFs
- [x] Garantir compatibilidade com produção (sem dependência de binários do sistema)

## REVISÃO_24: Aba Critérios do Sistema em Configurações
### Schema e Backend
- [ ] Criar tabela system_criteria (chave-valor por empresa) no banco de dados
- [ ] Rotas tRPC: getCriteria, updateCriteria (protegidas por ADM/ADM Master)
- [ ] Valores padrão CLT pré-configurados ao criar empresa
### Categorias de Critérios
- [ ] Horas Extras: % HE dias úteis, % HE domingos/feriados, % adicional noturno, horário noturno (início/fim), limite mensal HE
- [ ] Jornada de Trabalho: horas diárias padrão, horas semanais, tolerância atraso (min), tolerância saída antecipada (min), intervalo almoço (min)
- [ ] Folha de Pagamento: dia do vale/adiantamento, dia do pagamento, % adiantamento sobre salário
- [ ] Advertências CLT: nº advertências para suspensão, dias de suspensão padrão, nº suspensões para justa causa
- [ ] Benefícios: valor padrão VR/VA diário, dias úteis para cálculo VR
- [ ] Ponto: tolerância batida ímpar (min), considerar falta após X min atraso
### Frontend
- [ ] Nova aba "Critérios" na página de Configurações com layout organizado por seções
- [ ] Formulário editável com valores atuais e indicação do padrão CLT
- [ ] Botão "Restaurar Padrão CLT" por seção
- [ ] Apenas ADM Master pode alterar critérios
### Integração
- [ ] Usar critérios de HE nos cálculos de horas extras (substituir valores hardcoded)
- [ ] Usar critérios de jornada no fechamento de ponto (tolerâncias, horário noturno)
- [ ] Usar critérios de advertência no fluxo CLT progressivo
### Fix pendente
- [x] Fix: pdftotext not found em produção (substituir por pdf-parse)

## REVISÃO_25: Nº Interno na tabela de Colaboradores
- [x] Adicionar coluna "Nº Interno" (codigoInterno JFC) na tabela de listagem de colaboradores
- [x] Incluir número interno na busca/pesquisa de colaboradores

## REVISÃO_26: Melhorar cores dos cards de métricas no Raio-X
- [x] Cards de ASOs, Treinamentos, Atestados, Advertências, Meses Ponto, EPIs com cores mais vibrantes e aparência de botão clicável

## FIX_27: Importação de PDFs mostra 0 funcionários e R$ 0,00
- [x] Analisar texto extraído dos PDFs reais com pdf-parse v2
- [x] Corrigir parser para funcionar com o formato de texto do pdf-parse v2
- [x] Testar com PDFs reais (006 analítico e 007 sintético de janeiro)
- [x] Destacar período de afastamento em vermelho no documento de suspensão

## REVISÃO_28: Integração Critérios de HE nos Cálculos
- [ ] Criar função helper getCriteriaForCompany() para buscar critérios do banco
- [ ] Substituir valores hardcoded de % HE no fechamento de ponto pelos critérios configurados
- [ ] Aplicar critérios de tolerância de atraso/saída antecipada no cálculo de ponto
- [ ] Aplicar critérios de horário noturno e adicional noturno nos cálculos
- [ ] Aplicar critérios na folha de pagamento (verificação cruzada)
- [ ] Respeitar acordo individual do funcionário (override dos critérios globais)
- [ ] Incrementar revisão para Rev. 37

## REVISÃO_28: Filtros clicáveis nos cards de resumo + Integração critérios HE
- [x] Cards de resumo da Folha de Pagamento (Total, Vinculados, Divergentes, Não Encontrados) como filtros clicáveis
- [ ] Criar helper getCriteriaMap() para buscar critérios do banco
- [ ] Integrar critérios de HE no cálculo do fechamento de ponto (tolerância, % HE, noturno)
- [ ] Respeitar acordo individual do funcionário (override dos critérios globais)
- [ ] Incrementar revisão para Rev. 37

## REVISÃO_29: Rateio proporcional de custos por obra baseado no ponto
- [x] Refatorar getCustosPorObra para cruzar time_records com folha de pagamento
- [x] Calcular horas trabalhadas por obra para cada funcionário usando time_records
- [x] Distribuir custo proporcionalmente (ex: 60% Obra A, 40% Obra B)
- [x] Funcionários sem ponto ficam em "Sem Obra Vinculada"
- [x] Exibir % de alocação e horas por obra no frontend

## REVISÃO_30: Detecção automática de mês na importação de PDF
- [x] Extrair data de referência do conteúdo do PDF (ex: "Adiantamento em: 20/01/2026")
- [x] Alocar automaticamente no mês correto, independente do mês selecionado pelo usuário
- [x] Exibir alerta quando o mês detectado for diferente do mês selecionado
- [x] Criar/buscar folha_lancamento do mês correto automaticamente

## Rev. 37: Detecção automática de mês + Percentual de alocação por obra
- [x] Implementar função detectMesReferencia() no backend (5 estratégias de detecção)
- [x] Integrar detecção automática na rota importarFolhaAuto
- [x] Redirecionar importação para o mês correto automaticamente
- [x] Exibir toast de alerta (warning) quando mês detectado difere do selecionado
- [x] Navegar automaticamente para o mês correto após importação redirecionada
- [x] Otimizar extração de texto PDF (extrair uma vez, reutilizar no loop)
- [x] Adicionar coluna "% Aloc." na tabela de custos por obra
- [x] Exibir percentual de alocação por funcionário em cada obra
- [x] Incrementar versão para Rev. 37

## FIX Rev. 37: Detecção de mês pegando data de admissão no PDF de pagamento
- [x] Analisar texto extraído do PDF de pagamento para identificar padrão correto
- [x] Priorizar padrão "referente ao mês de JANEIRO/2026" na detecção
- [x] Mover detecção de data DD/MM/YYYY genérica para último recurso (evitar pegar admissão)
- [x] Testar com PDFs de vale e pagamento

## Rev. 38: Botões Imprimir/PDF/Excel na tela de Custos por Obra
- [x] Botão Imprimir (window.print com CSS @media print)
- [x] Botão Gerar PDF (html2canvas + jsPDF ou print-to-pdf)
- [x] Botão Exportar Excel (xlsx com dados de custos por obra)
- [x] Rota backend para gerar Excel de custos por obra
- [x] Fix: detecção de mês no PDF de pagamento (priorizar "referente ao mês de NOME/ANO")

## Rev. 38: Vinculação manual de obra + Bloqueio consolidação + Exportações
- [x] Criar tabela manual_obra_assignments para vincular funcionário sem ponto a uma obra com justificativa
- [x] Rota backend vincularObrasManualmente (employeeIds[], obraId, justificativa, mesReferencia)
- [x] Rota backend removerVinculacaoManual
- [x] Rota backend listarVinculacoesManuais
- [x] UI: seleção múltipla com checkboxes + select de obra + justificativa na seção "Sem Obra Vinculada"
- [x] UI: botão Imprimir (window.print com CSS @media print)
- [x] UI: botão Gerar PDF
- [x] UI: botão Exportar Excel com dados de custos por obra
- [x] Fix: detecção de mês no PDF de pagamento (priorizar "referente ao mês de NOME/ANO")

## Rev. 38: Verificação Cruzada filtros + Vinculação obra + Exportações
- [x] Card "Sem Ponto" na Verificação Cruzada mostrando quantidade de funcionários sem registro de ponto
- [x] Transformar todos os cards (Total, OK, Com Alertas, Com Ponto, Sem Ponto) em filtros clicáveis
- [x] Vinculação manual de obra para funcionários sem obra (seleção múltipla + justificativa)
- [ ] Bloqueio de consolidação se houver funcionários sem obra (pendente integração no backend)
- [x] Botões Imprimir/PDF/Excel na tela de Custos por Obra
- [x] Fix detecção de mês no PDF de pagamento

## REGRA DE OURO: Botões Imprimir/PDF em TODAS as telas
- [x] Criar componente reutilizável PrintActions (Imprimir + PDF + Excel opcional)
- [x] Aplicar em: Colaboradores, Fechamento de Ponto, Folha de Pagamento (todas as sub-telas)
- [x] Aplicar em: Controle de Documentos, Obras, ValeAlimentacao
- [x] Aplicar em: Custos por Obra, Verificação Cruzada, Horas Extras
- [x] Aplicar em: Configurações, Empresas, Setores, Funções, Auditoria, Usuários
- [x] CSS @media print para ocultar sidebar, botões e elementos de UI

## Rev. 39: Bloqueio consolidação + Integração vinculações manuais + Excel
- [x] Integrar vinculações manuais no cálculo de custos por obra (funcionários vinculados manualmente saem de "Sem Obra")
- [x] Bloqueio de consolidação se houver funcionários sem obra vinculada
- [x] Rota backend para exportação Excel (.xlsx) de custos por obra
- [ ] Frontend: botão Excel na tela de custos chama rota backend dedicada
- [ ] Frontend: mensagem de bloqueio na consolidação quando há funcionários sem obra
- [x] Incrementar versão para Rev. 39

## Rev. 39 (atualizado): Filtro HE por obra + Botões responsivos + Bloqueio + Vinculações + Excel
- [x] Filtro por obra na tela de Horas Extras (clicar na obra no ranking filtra a tabela)
- [ ] Botões responsivos ao clique (feedback visual loading/active)
- [x] Integrar vinculações manuais no cálculo de custos por obra
- [x] Bloqueio de consolidação se houver funcionários sem obra vinculada
- [x] Rota backend para exportação Excel (.xlsx) de custos por obra
- [ ] Frontend: botão Excel chama rota backend dedicada
- [x] Incrementar versão para Rev. 39
- [x] Card Resumo Total do Mês abaixo dos cards Vale/Pagamento (Vale + Pagamento + HE = Total)
- [x] Rodapé somatório dinâmico nos Detalhes (Proventos, Descontos, Líquido) que atualiza com filtros
- [x] Cadastro de Contas Bancárias da empresa (schema + rotas backend)
- [x] Campo contaBancariaEmpresaId no cadastro do funcionário
- [ ] Separação/agrupamento por banco na folha de pagamento

## Rev. 40: Contas Bancárias + Excel funcional + Agrupamento por banco
- [x] Tela de Contas Bancárias no menu lateral (CRUD completo)
- [x] Adicionar rota /contas-bancarias no App.tsx
- [x] Adicionar item no menu lateral (DashboardLayout)
- [x] Botão Excel funcional na tela de Custos por Obra (conectar à rota backend)
- [x] Agrupamento/filtro por banco na tela de Detalhes da folha (enriquecido listarItens com info de conta bancária)
- [x] Incrementar versão para Rev. 40
- [x] Tela Relógios de Ponto (Sn) na seção Operacional com CRUD e vinculação à obra
- [ ] Mover Contas Bancárias para seção CADASTRO (não Financeiro)

## BUG Rev. 39: Horas Extras
- [x] BUG: Valor Estimado HE mostrando R$ 0,00 para todos os funcionários (corrigido cálculo no backend)
- [x] BUG: Obra mostrando "—" para todos os funcionários na tela de Horas Extras (corrigido)

## Rev. 40: Sistema de Perfis de Usuário (3 níveis)
- [ ] Expandir enum de roles para: usuario, adm, adm_master
- [ ] Criar tabela de permissões granulares por perfil (módulo, ação: visualizar/preencher/editar/excluir/aprovar)
- [ ] Tela de configuração de permissões por perfil (ADM Master define o que cada perfil pode fazer)
- [ ] Alçadas de aprovação configuráveis por perfil
- [ ] Middleware de verificação de permissões granulares no backend
- [ ] Frontend: ocultar/desabilitar ações conforme permissão do usuário logado
- [ ] Atualizar select de Perfil no cadastro de usuário (Usuário, ADM, ADM Master)

## Rev. 40: Módulo Processos Trabalhistas
- [x] Criar tabela processos_trabalhistas (funcionarioId, numeroProcesso, vara, comarca, advogado, valorCausa, status, dataDistribuicao, etc.)
- [x] Criar tabela processos_movimentacoes (processoId, data, descricao, tipo, anexo)
- [x] Vincular apenas a funcionários com status "Desligado"
- [x] CRUD completo de processos trabalhistas no backend
- [x] CRUD de movimentações/andamentos do processo
- [x] Tela de Processos Trabalhistas no menu lateral
- [x] Dashboard de processos (total ativo, valor total em risco, por status)
- [x] Alertas de prazos e audiências (próximas audiências destacadas)
- [x] Botões Imprimir/PDF (via PrintActions)

## Rev. 40: Liberdade nos campos de HE (sem restrição CLT)
- [x] Verificado: campos de HE já são livres (type=text sem max/min)
- [x] Verificado: backend aceita qualquer valor string sem validação numérica

## BUG Rev. 40: Valor Estimado HE incorreto
- [x] BUG: Valor Estimado de HE retornando valores absurdos (corrigido: folhaSalarioMap usava salárioBase como valorHora)
- [x] Investigar fórmula de cálculo no backend (horasExtrasPorFuncionario)
- [x] Corrigir cálculo: valorHora = salário / (jornada mensal em horas), valorHE = horas × valorHora × (1 + percentual)

## Rev. 40 fix: Contas Bancárias
- [x] Remover campo "Apelido (identificação interna)" da tela de Contas Bancárias
- [x] Remover campo "CNPJ do Titular" da tela de Contas Bancárias

## Rev. 40 fix: Conta da Empresa para Pagamento
- [x] Adicionar campo "Conta da Empresa para Pagamento" na aba Bancário do colaborador
- [x] Select com as contas bancárias ativas da empresa (módulo Contas Bancárias)
- [ ] Permitir gerar relatório agrupado por banco de pagamento

## Rev. 40 fix: Custos por Obra - Horas e Comparativos
- [x] Adicionar card de Total Horas Normais nos resumos de Custos por Obra
- [x] Adicionar percentual de horas normais e extras em relação ao total
- [x] Comparativo com mês anterior (acréscimo/redução)
- [x] Comparativo com mesmo mês do ano anterior (acréscimo/redução)

## Rev. 41: Melhorias Gerais - Home, EPIs, Dashboards, Processos Trabalhistas, Relógios de Ponto
### Schema e Backend
- [x] Adicionar campos clienteCnpj, clienteRazaoSocial, clienteNomeFantasia na tabela processos_trabalhistas
- [x] Atualizar rotas tRPC de processos trabalhistas para incluir campos de cliente
- [x] Criar router completo de EPIs (CRUD + entregas + stats)
- [x] Criar rota homeData para alimentar Home reestruturada (KPIs + alertas)
- [x] Criar 8 novos dashboards no backend (Pendências, Treinamentos, EPI, Acidentes, Auditorias, 5W2H, Extintores/Hidrantes, Desvios)

### Frontend
- [x] Corrigir bug de Relógios de Ponto (dados nested: sn.obraSn.xxx → acesso correto)
- [x] Reestruturar Home com KPIs acionáveis (RH, Operacional, Alertas, Aniversariantes, Movimentações)
- [x] Adicionar campos Cliente/CNPJ no form de criação e detalhe de Processos Trabalhistas
- [x] Criar página completa de EPIs (catálogo + entregas + stats)
- [x] Adicionar EPIs no menu lateral do DashboardLayout
- [x] Criar componente reutilizável DashChart (gráficos Chart.js + KPI cards)
- [x] Criar 8 páginas de dashboards (Pendências, Treinamentos, EPI, Acidentes, Auditorias, 5W2H, Extintores/Hidrantes, Desvios)
- [x] Dashboard de Riscos (placeholder - em desenvolvimento)
- [x] Registrar todas as rotas de dashboards no App.tsx

### Testes
- [x] Testes unitários para rotas de dashboards (10 procedures), EPIs e homeData (4 testes passando)

## Rev. 42: Menu Configurável, Logo da Empresa, Reorganização Sidebar
### Reorganização do Menu Lateral
- [x] Mover "Relógios de Ponto" da seção Operacional para Cadastro
- [x] Configuração personalizável do menu lateral (ADM Master pode reorganizar itens entre seções e reordenar)
- [x] Salvar configuração do menu no banco de dados por usuário
- [x] Tela de configuração do menu nas Configurações do sistema (tab Painel de Controle)

### Logo da Empresa
- [x] Adicionar campo logoUrl na tabela de empresas
- [x] Upload de logo da empresa no cadastro de empresas (S3)
- [x] Exibir logo da empresa selecionada no cabeçalho/sidebar do sistema
- [x] Usar logo da empresa em todos os relatórios e impressões automaticamente (PrintHeader)
- [x] Ao alterar o logo, todo o sistema reflete a mudança imediatamente

## Rev. 42: REFORMULAÇÃO COMPLETA DOS DASHBOARDS
### Apagar dashboards antigos que não funcionam
- [x] Remover DashPendencias, DashTreinamentos, DashEpi, DashAcidentes, DashAuditorias, Dash5w2h, DashExtintoresHidrantes, DashDesvios, DashRiscos
- [x] Remover rotas backend antigas dos dashboards que não funcionam

### Novos Dashboards (6 dashboards completos)
- [x] Dashboard Funcionários: idade, gênero, endereço (cidade/estado), função, tempo de empresa, mais velho/novo, ranking faltas, ranking advertências
- [x] Dashboard Cartão de Ponto: frequência, atrasos, faltas, horas trabalhadas, por período/obra
- [x] Dashboard Folha de Pagamento: custos totais, por empresa, por obra, evolução mensal, comparativos
- [x] Dashboard Horas Extras: por funcionário, por obra, por período, custo total, ranking, tendências, % sobre folha
- [x] Dashboard EPIs: entregas, vencimentos, por tipo, por funcionário, estoque
- [x] Dashboard Jurídico: processos trabalhistas, valores em risco, status, prazos, audiências próximas

### Atualizar sidebar e DashboardIndex
- [x] Atualizar menu lateral com os 6 novos dashboards
- [x] Recriar DashboardIndex como hub central com cards para cada dashboard
- [x] Limpar rotas antigas do App.tsx

## Rev. 43: Funções com IA + Demitidos
- [x] Campo descrição obrigatório no cadastro de funções
- [x] Botão IA "Gerar Descrição" no cadastro de funções (usa LLM para gerar descritivo baseado no nome/CBO)
- [x] Preencher descrições de todas as 40 funções existentes via IA (atividades, responsabilidades, requisitos conforme CBO)
- [x] Alterar campo descricao de varchar(255) para TEXT
- [x] Pente fino: unificar funções duplicadas e preencher CBOs de todas (32 funções únicas)
- [x] Inserir 102 funcionários demitidos (Out/2025 a Fev/2026) com código contábil e função (101 novos + 1 atualizado)
- [x] Cadastrar 18 funções novas que vieram nos PDFs de demitidos
- [x] Criar tabela e CRUD de Regras de Ouro da empresa em Configurações
- [x] IA consulta Regras de Ouro antes de gerar qualquer sugestão (nunca quebra regras da empresa)
- [x] Adicionar campo Ordem de Serviço (NR-1) no cadastro de funções (riscos, EPIs obrigatórios, procedimentos de segurança)
- [x] IA gera Ordem de Serviço automaticamente junto com a descrição da função

## Rev. 44: 13º Salário na Folha de Pagamento
- [ ] Novembro: campo adicional para upload da 1ª parcela do 13º (prazo até 30/11)
- [ ] Dezembro: campo adicional para upload da 2ª parcela do 13º (prazo até 20/12)
- [ ] Backend: suportar tipo de folha (normal, 13_primeira, 13_segunda)
- [ ] Frontend: exibir campos extras de 13º nos meses de Nov e Dez
- [ ] Dashboard Folha: incluir custos do 13º nos totais

## Rev. 44b: Corrigir Dashboard Funcionários (tela em branco)
- [ ] Diagnosticar e corrigir bug que faz dashboard aparecer em branco
- [ ] Status dos Colaboradores (Ativos, Afastados, Férias, Desligados) - gráfico de barras
- [ ] Setor dos Colaboradores (Obra, Escritório Central, Escritório Local)
- [ ] Gênero (Masculinos vs Femininos com destaque visual)
- [ ] Pirâmide etária por sexo e idade (14-20, 21-25, 26-30, 31-40, 41-50, 51-60, 61+)
- [ ] Estatísticas: mais tempo de empresa, menos tempo, maior idade, menor idade
- [ ] Ranking de funções (horizontal bars)
- [ ] Ranking de advertências e faltas

## Rev. 44c: Gráficos Interativos + Fix Dashboard Funcionários
- [ ] Corrigir Dashboard Funcionários (tela em branco)
- [ ] Tornar TODOS os gráficos interativos (clique filtra e atualiza KPIs/dados)
- [ ] Regra de ouro: gráficos responsivos com drill-down em todos os dashboards

## Rev. 45: Dashboard Horas Extras - Filtros Avançados
- [ ] Filtro por Ano
- [ ] Filtro por Mês
- [ ] Filtro por Semana
- [ ] Filtro por Dia
- [ ] Filtro por Trimestre
- [ ] Filtro por Semestre
- [ ] Filtro por Obra
- [ ] Filtro por Colaborador
- [ ] Layout responsivo para análise clara
- [ ] Gráficos interativos com drill-down
- [ ] KPIs atualizados dinamicamente conforme filtros

## Rev. 46: Raio-X do Funcionário - Dossiê Completo
- [ ] Aba Horas Extras: todas HE do funcionário com detalhes (data, obra, horas, valor, %)
- [ ] Descrição da Função completa no cabeçalho
- [ ] Fichas de EPIs assinadas (entregas com data, CA, quantidade)
- [ ] Histórico de Atrasos (dias, horários)
- [ ] Histórico de Aumentos de Salário
- [ ] Histórico de Faltas
- [ ] Histórico de Atestados detalhado
- [ ] Processos Trabalhistas vinculados
- [ ] Histórico Funcional completo (promoções, mudanças de setor/função)
- [ ] Timeline cronológica de TODOS os eventos
- [ ] Cards de métricas atualizados com todas as informações

## Rev. 47: Regras de Ouro - Seed no Banco
- [x] Inserir as 10 Regras de Ouro no banco de dados (tabela golden_rules)
- [x] Regras ficam disponíveis para uso futuro no Guia de Integração do Funcionário (40 registros: 10 por empresa)

## Rev. 48: Importação Lista de Funcionários Ativos (PDF)
- [x] Extrair dados do PDF de funcionários ativos (193 funcionários processados)
- [x] Cruzar com base atual: identificar novos e ausentes
- [x] Cadastrar funcionários novos que não estão no sistema
- [x] Marcar como "Desligado" os que não estão na lista de ativos
- [x] Preservar funcionários já marcados como Desligado/Lista_Negra

## Rev. 49: Remover campo Apelido dos Relógios de Ponto
- [x] Remover coluna "Apelido" da tabela de Relógios de Ponto no frontend

## Rev. 50: Editar Relógio de Ponto
- [x] Clicar na linha do relógio abre edição inline
- [x] Tela de edição com campos: SN, Obra Vinculada, Status (Ativo/Inativo)
- [x] Remover coluna Apelido da tabela
- [x] Criar rota tRPC para update de relógio de ponto (updateSnObra)

## Rev. 51: Funções clicáveis + Responsividade
- [x] Clicar na função abre tela com informações completas (CBO, Descrição, OS NR-1, funcionários vinculados)
- [ ] Garantir responsividade em todas as telas

## Rev. 52: CBO Autocomplete na Função
- [x] Campo Nome da Função digitável com autocomplete consultando base CBO do governo (2.450 ocupações)
- [x] Campo CBO travado (somente leitura) preenchido automaticamente conforme função selecionada

## Rev. 53: Cores suaves no Raio-X do Funcionário
- [x] Trocar cores dos cards de métricas para tons pastel/leves (azul claro, verde suave, cinza, etc.)
- [x] Manter visual agradável e profissional sem cores chamativas

## Rev. 54: Painel de Alertas Detalhado
- [x] Clicar no botão "X alertas requerem atenção" abre painel com todos os alertas
- [x] Painel responsivo (desktop, tablet, mobile)
- [x] Alertas categorizados (ASOs Vencidos, ASOs Vencendo, Sem ASO, Férias, Processos)
- [x] Possibilidade de navegar direto para o item do alerta (botão por categoria)
- [x] Botão Imprimir no painel de alertas

## Rev. 55: Correção de dados + Gráficos clicáveis
- [ ] Verificar e corrigir demissões erradas em março/2026
- [ ] Preencher sexo M/F automaticamente por análise de nome
- [ ] Definir setor OBRA para maioria, ESCRITÓRIO CENTRAL para funções administrativas
- [ ] Gráficos clicáveis: ao clicar em qualquer item, abre lista de nomes (responsivo)
- [ ] Aplicar em todos os gráficos do sistema (Dashboard Funcionários, Dashboard HE, etc.)

## Rev. 56: Folha Pagamento + Alertas Full Screen + Dados
- [ ] Diagnosticar por que não consolida folha de janeiro
- [ ] Diagnosticar por que Dashboard Folha não mostra dados de janeiro
- [ ] Central de Alertas converter para FULL SCREEN (não dialog pequeno)
- [ ] Todas as telas/modais devem ser FULL SCREEN
- [ ] Corrigir demissões erradas em março/2026
- [ ] Preencher sexo M/F automaticamente por análise de nome
- [ ] Definir setor OBRA/ESCRITÓRIO CENTRAL por função
- [ ] Gráficos clicáveis: ao clicar em qualquer item, abre lista de nomes (responsivo)

## Rev. 57: Alertas Automáticos de Seguro de Vida
- [ ] Criar tabela insurance_alert_config (configuração de alertas de seguro por empresa)
- [ ] Criar tabela insurance_alert_recipients (destinatários: corretor, diretoria, etc.)
- [ ] Criar tabela insurance_alerts_log (histórico de alertas enviados)
- [ ] Textos padrão editáveis para cada tipo de movimentação (Admissão, Afastamento, Reclusão, Desligamento)
- [ ] Backend: rotas tRPC CRUD para configuração de seguro de vida
- [ ] Backend: função de disparo automático de alerta ao mudar status do funcionário
- [ ] Backend: integração com notificações (notifyOwner + registro interno)
- [ ] Frontend: aba "Seguro de Vida" em Configurações → Critérios do Sistema
- [ ] Frontend: formulário de destinatários (Corretor, Usuário, Diretoria)
- [ ] Frontend: histórico de alertas enviados com filtros
- [ ] Integrar disparo automático em: updateEmployee (mudança de status)
- [ ] Integrar disparo automático em: createEmployee (admissão)
- [ ] Testes unitários para fluxo de alertas de seguro

## Rev. 58: Melhorar Dashboard Horas Extras - Filtros + Dados
- [ ] Redesenhar filtros do Dashboard HE: barra de meses estilo Cartão de Ponto (Jan-Dez + setas ano)
- [ ] Filtros avançados (Semestre, Trimestre, Semana, Dia) como opção secundária discreta
- [ ] Investigar e corrigir valores zerados no Dashboard HE (Total Horas, Total HE, Pessoas, Média)
- [ ] Manter filtros de Obra e Colaborador como selects compactos

## Rev. 59: Drag & Drop no Gerenciador de Menu
- [ ] Implementar arrastar e soltar itens do menu entre categorias (ex: Financeiro → Operacional)
- [ ] Implementar arrastar e soltar para reordenar itens dentro da mesma categoria
- [ ] Implementar arrastar e soltar para reordenar categorias inteiras
- [ ] Visual feedback durante arrasto (highlight da zona de destino)
- [ ] Remover botões "Mover para..." e setas, substituir por drag & drop intuitivo

## Rev. 60: Consulta Automática de CA (Certificado de Aprovação) do MTE
- [x] Pesquisar e integrar API/base do MTE para consulta de CA (site oficial caepi.mte.gov.br)
- [x] Criar rota tRPC para consultar CA no backend
- [x] Autopreenchimento no cadastro de EPI ao digitar número do CA (nome, fabricante, validade, natureza)
- [x] Feedback visual durante a consulta (loading, sucesso, erro)
- [ ] Cache de consultas CA para evitar requisições repetidas (futuro)

## Rev. 61: Tela de Login/Apresentação Profissional
- [ ] Redesenhar Home.tsx com layout split-screen profissional
- [ ] Formulário visual de login (e-mail + senha) com botão Entrar via OAuth
- [ ] Aba "Esqueci minha senha" com campo de e-mail e envio de recuperação
- [ ] Visual impactante com branding FC Engenharia (gradiente, logo, animações sutis)
- [ ] Responsivo para mobile

## Rev. 62: Todas as Telas Full Screen
-- [x] Auditar TODAS as páginas do sistema para verificar quais não são full screenn
- [ ] Corrigir Funções (detalhe/modal) para full screen
- [ ] Corrigir todas as demais páginas que não estão full screen
- [ ] Garantir padrão consistente em todas as telas

## Rev. 63: Funções - Filtro Incompletas + Responsivo
- [ ] Adicionar filtro "Incompletas" na tela de Funções (sem CBO, sem descrição, sem OS)
- [ ] Tornar tela de Funções responsiva (KPIs, tabela, formulários)
- [x] Remover max-w limitante dos formulários de Funções
- [x] Aplicar responsividade e full screen em todas as outras páginas com limitação (Colaboradores, ContasBancarias, ControleDocumentos, Empresas, Usuarios, FechamentoPonto, Configuracoes, Epis, Obras, RelogiosPonto, Setores)

## Rev. 64: Corrigir Status dos Funcionários
- [x] Colocar TODOS os funcionários da FC como Ativos (remover datas de demissão incorretas) — 170 corrigidos, total 295 ativos
- [ ] Aguardar lista atualizada do usuário para fazer baixas corretas (pendente)

## Rev. 65: Relógios de Ponto - Exclusão e SN Único
- [ ] Permitir exclusão de relógios de ponto (botão lixeira funcional com confirmação)
- [ ] Impedir SN duplicado — não permitir mesmo número SN vinculado a duas obras ativas
- [ ] Validação no backend ao criar/editar relógio

## Rev. 66: Upload DIXI - SN Não Identificado
- [ ] Investigar por que o upload DIXI não identifica o SN do arquivo XLS
- [ ] Corrigir lógica de extração de SN do arquivo DIXI

## Rev. 67: Conflitos de Obra - Melhorias
- [ ] Clicar na obra para ver ponto detalhado do dia (entrada/saída, horas)
- [ ] Restaurar botão "Dividir custos proporcional ao tempo" para obras sem sobreposição de horário
- [ ] Regra obrigatória: sobreposição de horário (mesmo dia + mesma hora em 2 obras) → usuário DEVE escolher uma obra ou marcar como falta
- [ ] Adicionar opção "Marcar como Falta" além de escolher obra

## Rev. 68: Ranking de Ponto + Score de Qualidade
- [ ] Backend: calcular ranking de ponto por funcionário (erros vs acertos)
- [ ] Backend: score de qualidade de ponto (% acerto, nota A-D)
- [ ] Dashboard Funcionários: cards "Melhor Ponto" e "Mais Erros de Ponto"
- [ ] Raio-X: seção "Qualidade de Ponto" com histórico mensal e score
- [ ] Registrar score na ficha do funcionário para tomada de decisão futura

## Rev. 69: Filtro de Período com Comparativo no Dashboard Funcionários
- [ ] Adicionar filtro discreto de período: Dia, Semana, Mês, Trimestre, Ano (toggle compacto)
- [ ] Backend: aceitar parâmetro de período e calcular dados para período atual + anterior
- [ ] KPIs com indicadores de variação (↑↓ % vs período anterior)
- [ ] Comparativo automático nos gráficos de turnover, advertências, atestados
- [ ] Manter dados estáticos (total geral, gênero, função) sem filtro de período
- [x] Substituir seletor de calendário complexo por setas simples ◀ ▶ em todos os dashboards
- [x] Adicionar % de HE vs Horas Normais no card de Horas Extras do Dashboard Cartão de Ponto
- [x] Ranking de Faltas em DIAS (não horas) no Dashboard Cartão de Ponto
- [x] Cards e rankings clicáveis no Dashboard Cartão de Ponto (navegar para origem dos dados)
- [x] Atrasos com tolerância CLT Art.58 §1º (10min/dia) no Dashboard Cartão de Ponto - formato hh:mm
- [x] Exibir nome completo do funcionário em todas as abas do cadastro (espelho da aba Pessoal)
- [x] Aumentar largura da coluna CPF na tabela de colaboradores
- [x] Adicionar campos de 13º Salário (1ª e 2ª parcela) na Folha de Pagamento
- [x] Corrigir número de revisão que não está atualizando (Rev. 49)
- [x] Ranking faltas/atrasos deve navegar para Fechamento de Ponto filtrado pelo funcionário (não para cadastro)
- [x] Cards 13º Salário na Folha de Pagamento (1ª parcela=Nov, 2ª parcela=Dez)
- [x] Notificações por e-mail de contratação/demissão em Configurações
- [x] Substituir filtros avançados do Dashboard Horas Extras por seletor simples de mês com setas (igual Folha de Pagamento)
- [ ] Nomes de funcionários clicáveis no Dashboard Funcionários (abre ficha de cadastro)
- [ ] Reformular Resumo Total do Mês na Folha para formato tabela profissional (Colaboradores/Empregadores/Autônomos/Estagiários + Ativos/Admitidos/Demitidos/etc)
- [ ] Nomes de funcionários clicáveis no Dashboard Funcionários (abre ficha de cadastro) - backend com employeeId
- [ ] Sistema completo de gestão de usuários (criar, editar, excluir, desativar, alterar senhas)
- [ ] Perfis de usuário com permissões granulares por módulo (Admin Master, Admin, Gestor, Operador, Consulta)
- [ ] E-mails automáticos humanizados com saudação por horário (Excelente dia/tarde/noite)
- [ ] Templates de e-mail editáveis na aba Notificações (Contratação, Demissão, Transferência, Afastamento)
- [ ] Disparo automático de e-mail ao criar/alterar status de funcionário
- [ ] Preview de e-mail na UI de Notificações
- [ ] Tabela de log de notificações enviadas (notification_logs) com status de envio/leitura
- [ ] Registro automático no log a cada disparo de notificação por mudança de status
- [ ] Pixel de rastreamento para confirmação de leitura
- [ ] Painel de histórico de notificações na aba Notificações E-mail com status visual (Enviado/Lido)
- [ ] Editor de labels/nomes do menu nos Critérios do Sistema (renomear itens do sidebar)
- [ ] Auto-refresh na tela de Detalhes da Folha (atualizar divergências sem sair da tela)
- [ ] Critério "Bloquear consolidação com inconsistências pendentes" nos Critérios do Sistema
- [ ] Validação no botão Consolidar com alerta de inconsistências
- [ ] Assistente IA de inconsistências com sugestões didáticas de resolução
- [ ] Melhorar textos de alerta de consolidação bloqueada com detalhes claros
- [ ] Botão "Analisar com IA" ao lado de cada divergência
- [ ] Campo de foto/avatar na tabela de Usuários do Sistema com upload e iniciais como fallback
- [ ] Foto 3x4 no cadastro de funcionários (upload + exibição)
- [ ] Foto 3x4 no relatório Raio-X do Funcionário
- [ ] Remover funcionários duplicados do banco de dados
- [ ] Regra-mãe de unicidade: CPF único global (todas empresas e status)
- [ ] Regra-mãe de unicidade: RG único global
- [ ] Regra-mãe de unicidade: cruzar dados pessoais (nome+nascimento) entre todas categorias
- [ ] Validação visual no frontend ao cadastrar/editar com dados duplicados
- [ ] Fluxo de desligamento com diálogo de Lista Negra (Blacklist)
- [ ] Campo obrigatório de motivo para Lista Negra
- [ ] Registro de auditoria: nome do usuário que desligou, data/hora, motivo
- [ ] Todo desligamento exige motivo obrigatório categorizado
- [ ] Workflow de reativação de Lista Negra com aprovação de 2 diretores
- [ ] Dashboard de desligamentos com análise de motivos e tendências
- [ ] Auditoria completa de desligamentos (quem, quando, motivo)
- [ ] Dashboard interativo: cards clicáveis abrindo lista de funcionários
- [ ] Dashboard interativo: gráficos clicáveis com drill-down
- [ ] Dashboard interativo: rankings clicáveis abrindo detalhes
- [ ] Dashboard interativo: cards de destaque clicáveis abrindo ficha
- [x] Bug: Impressão/PDF do Raio-X do Funcionário mostra tela branca (apenas cabeçalho e rodapé visíveis)
- [x] Soft Delete: Adicionar campo deletedAt no schema de employees (exclusão lógica)
- [x] Soft Delete: Alterar rota de exclusão para marcar deletedAt em vez de DELETE permanente
- [x] Soft Delete: Filtrar colaboradores excluídos em todas as queries (WHERE deletedAt IS NULL)
- [x] Lixeira: Criar rota backend para listar colaboradores excluídos
- [x] Lixeira: Criar rota backend para restaurar colaborador excluído
- [x] Lixeira: Implementar aba Lixeira na tela de Auditoria do Sistema
- [x] Lixeira: Botão Restaurar com confirmação e registro no log de auditoria
- [x] Bug: Impressão/PDF do Raio-X do Funcionário mostra tela branca (apenas cabeçalho e rodapé visíveis)
- [x] Filtro de status na tela Fechamento de Ponto (Todos / Conforme / Com Inconsistências)
- [x] Bug: Ao mudar status para Desligado, abrir dialog para selecionar categoria de desligamento (Término de contrato, Justa causa, Pedido de demissão, Acordo mútuo, Fim de obra, Baixo desempenho, Indisciplina, Outros), data e motivo
- [x] Melhorar layout de impressão do Raio-X: logo da empresa no cabeçalho + cores consistentes (#1B2A4A)
- [x] Sidebar: Mostrar logo e nome da empresa selecionada dinamicamente (não fixo FC Engenharia)
- [x] Converter TODOS os dialogs pequenos para FullScreenDialog (Consolidação Bloqueada, etc.)
- [x] Implementar 3 níveis de permissão: admin_master / admin / user no schema e backend
- [x] Dica do Sistema (configurações avançadas) só visível para admin_master
- [x] Promover usuário owner para admin_master automaticamente
- [ ] Número Interno: auto-geração sequencial por empresa (nunca repete, somente leitura)
- [ ] Número Interno: atualizar TODOS os colaboradores existentes que não possuem número interno
- [ ] Número Interno: tornar campo somente leitura no frontend (não editável)
- [ ] Número Interno: adicionar critério/configuração na aba Configurações
- [ ] Número do Contador: verificar e garantir que todos os colaboradores tenham o código correto
- [ ] Bug: ANDERSON BRAGA SILVA aparece na Folha mas não está cadastrado na base de Colaboradores
- [ ] Usuários: Adicionar botões Editar, Excluir e Alterar Perfil na tabela de Usuários
- [ ] Usuários: Melhorar layout da tabela - mais espaçamento, tela mais larga, sem texto encavalado
- [x] Desligamento: Motivo Detalhado só obrigatório quando marcar Lista Negra (opcional para desligamento normal)
- [x] E-mail desligamento: remover branding Manus, usar logo/dados da empresa do colaborador
- [x] E-mail desligamento: texto formal técnico RH focado em dar baixa no seguro de vida
- [ ] E-mail desligamento: template editável nos Critérios do Sistema (categoria rescisão)
- [x] Foto do colaborador: ajuste automático com object-fit cover e centralização no rosto (object-position top)
- [x] Foto do colaborador: formato circular ou arredondado com tamanho fixo
- [x] Foto do colaborador: mini avatar circular na tabela de listagem ao lado do nome
- [x] E-mail: remetente deve mostrar nome da empresa ao invés de Manus Team
- [x] E-mail: assunto deve conter nome da empresa ao invés de manus
- [x] Raio-X: adicionar foto circular do colaborador no cabeçalho da tela
- [x] Raio-X: adicionar foto circular do colaborador no PDF/impressão
- [ ] Desligamento: motivo opcional para fim de contrato normal, obrigatório apenas para Blacklist
- [ ] Renomear nomenclatura para "Blacklist" no código
- [x] E-mail desligamento: remover seção "Demais Providências Rescisórias"
- [x] E-mail desligamento: dados do funcionário em vermelho para destaque
- [x] E-mail desligamento: layout mais limpo e organizado visualmente
- [x] Ver Detalhes no alerta de divergências já abre na aba Detalhes com filtro Divergentes ativo
- [x] Bug: Admin Master não consegue alterar critérios do sistema (mostra "Apenas admin pode alterar critérios")
- [ ] Bug: Documentos (ASOs, Treinamentos, Atestados, Advertências) permanecem após exclusão do funcionário
- [ ] Implementar cascade delete ou filtro para documentos de funcionários excluídos/desligados
- [x] Bug: Limpeza do banco de dados falha por ordem de exclusão (FK constraints) - corrigir ordem
- [ ] Adicionar campo editável de texto padrão para cada tipo de notificação (Contratação, Demissão, Transferência, Afastamento) na aba E-mail

- [x] Refazer planilha modelo de importação de colaboradores com todos os campos corretos
- [x] Incluir campo "Código Contábil" na planilha modelo e no código de importação
- [x] Garantir que todos os campos da planilha modelo correspondem ao schema do banco de dados
- [x] Adicionar botão de impressão na página de detalhes da função (Descrição + Ordem de Serviço NR-1)
- [x] Adicionar botão de impressão da ficha da função (Descrição + OS NR-1) no Raio-X do colaborador
- [x] IA ao gerar Descrição/OS NR-1 deve incluir automaticamente dados da empresa selecionada no texto
- [x] Corrigir IA para usar dados reais da empresa (nome, CNPJ, data) ao gerar Descrição/OS NR-1 em vez de placeholders genéricos
- [x] Criar rota backend + botão frontend para gerar Descrição/OS NR-1 com IA em lote para todas as funções incompletas
- [x] Adicionar ações de editar, excluir e alterar perfil dos usuários na tela Configurações > Usuários
- [x] Corrigir verificações de permissão para reconhecer admin_master como tendo todas as permissões de admin
- [ ] Remover campo obrigatório de obra no cadastro de relógio de ponto (apenas cadastrar SN)
- [ ] Adicionar seleção de relógio de ponto no cadastro de obras (mostrar apenas relógios não vinculados)
- [x] Adicionar campo de alterar senha na tela de Editar Usuário
- [x] Implementar sistema de Lixeira/Recuperação com soft delete para Admin Master
- [x] Converter todas as operações DELETE para soft delete (set deletedAt/deletedBy/deletedByUserId)
- [x] Adicionar campos deletedAt/deletedBy/deletedByUserId em todas as tabelas (users, asos, atestados, trainings, warnings, goldenRules, documentTemplates, epiDeliveries)
- [x] Filtrar registros excluídos (isNull(deletedAt)) em todas as queries SELECT
- [x] Criar tela de Lixeira com listagem, filtros, restauração e exclusão permanente
- [x] Adicionar rota /lixeira no menu lateral (Administração)
- [ ] Corrigir TS errors no goldenRules batch generation (fn.nome -> fn.name)
- [x] Permitir renomear itens do menu na tela de Configurações > Menu (somente ADM Master)
- [x] BUG CRÍTICO: Login local corrigido - aceita username OU email, case-insensitive, senha resetada para asdf1020
- [x] Resetar senha do usuário felipe@fcengenhariacivil.com.br para asdf1020 (senha padrão oficial)
- [x] Adicionar botão "Resetar Senha" na tela de Configurações > Usuários (já existia, atualizado para senha asdf1020)
- [ ] BUG: Tela de login redireciona automaticamente para Manus OAuth após 5 segundos em vez de ficar no login local

## MISSÃO 1 — Correção Menu Cinza
- [x] Corrigir estilo cinza/tachado em itens renomeados no MenuConfigPanel

## MISSÃO 2 — Motivo do Atestado
- [x] Adicionar campo motivo (reason/reasonOther) na tabela atestados
- [x] Criar lista de causas pré-definidas + opção "Outros"
- [x] Adicionar critério de obrigatoriedade em Configurações (ADM Master)
- [x] Atualizar backend e frontend de atestados

## MISSÃO 3 — Aviso Prévio + Férias
- [x] Criar tabela termination_notices (aviso prévio)
- [x] Criar tabela vacation_periods (férias)
- [x] Backend: CRUD aviso prévio com cálculo proporcional CLT
- [x] Backend: opção 2h/dia ou 7 dias corridos
- [x] Backend: previsão data rescisão + estimativa pagamento
- [x] Backend: controle férias vencidas + alertas
- [x] Frontend: tela Aviso Prévio (full, responsiva, filtros)
- [x] Frontend: calendário férias mês a mês + fluxo caixa prévio
- [x] Frontend: alertas férias vencendo/2ª férias
- [ ] Integração com cartão de ponto (não gerar falta no aviso)

## MISSÃO 4 — CIPA
- [x] Criar tabelas cipa_mandates, cipa_members, cipa_meetings, cipa_minutes
- [x] Backend: CRUD mandato, membros, reuniões, atas
- [x] Backend: alerta automático por nº mínimo de funcionários (NR-5)
- [x] Backend: estabilidade (1 ano após mandato)
- [x] Frontend: tela CIPA (membros, mandato, eleição)
- [x] Frontend: calendário reuniões + upload atas
- [x] Frontend: alerta no painel quando precisa constituir CIPA

## MISSÃO 5 — Módulo PJ
- [x] Criar tabelas pj_contracts, pj_payments
- [x] Backend: CRUD contratos, modelo pré-definido, preenchimento auto
- [x] Backend: folha PJ (40% vale + 60% fechamento + bonificações)
- [x] Backend: alertas 30 dias antes vencimento contrato
- [x] Frontend: aba contrato automática ao cadastrar PJ
- [x] Frontend: modelo contrato com impressão + anexo assinado
- [x] Frontend: controle contratos (status, vencimento, renovação)

## FINALIZAÇÃO
- [x] Integrar tudo com Raio-X do Funcionário
- [x] Adicionar rotas e itens no menu lateral
- [x] Teste geral + checkpoint

## SUGESTÕES IMPLEMENTADAS

### Regra de Ouro — Atualizar Revisão
- [x] Atualizar Rev. 49 → Rev. 50 em shared/version.ts

### Sugestão 1 — Integrar Aviso Prévio com Cartão de Ponto
- [x] Backend: ao processar ponto, verificar se funcionário está em aviso prévio
- [x] Backend: não gerar falta automática durante período de aviso trabalhado
- [x] Backend: aplicar redução de jornada (2h/dia ou 7 dias corridos) no cálculo
- [x] Frontend: indicador visual no cartão de ponto quando em aviso prévio

### Sugestão 2 — Dashboard de Férias no Painel Principal
- [x] Backend: procedure para buscar férias vencendo nos próximos 30/60 dias
- [x] Frontend: card no Painel Principal com férias vencendo
- [x] Frontend: férias em andamento + agendadas + custo próximocer

### Sugestão 3 — Exportação PDF dos Pagamentos PJ
- [x] Backend: procedure para gerar relatório consolidado PJ
- [x] Frontend: botão de exportar PDF na página Módulo PJ
- [x] Frontend: relatório formatado com logo, dados da empresa, totais

## BUGS
- [x] Raio-X do Funcionário travado em "Carregando dados do funcionário..." após adição das queries de aviso prévio/férias/CIPA/PJ
- [x] Reorganizar aba Bancário: dados do funcionário primeiro, Conta da Empresa por último
- [x] BUG: Após login interno, sistema redireciona para Manus OAuth após 10-15 segundos — corrigido token SDK + redirect para /login
- [x] BUG: Erro "Please login (10001)" na página /login — corrigido: Login.tsx usa query direta + main.tsx ignora erro em /login
- [x] Menu lateral: não mudar posição do scroll ao clicar em item — salvar e restaurar scrollTop
- [x] BUG: vacation_periods query falha — coluna companyId não existe na tabela (recriadas 5 tabelas com camelCase)

## Rev. 56 - Correções Urgentes
- [x] Fix Raio-X do Funcionário travado em "Carregando dados do funcionário..."
- [x] Fix database schema mismatch (snake_case vs camelCase columns) em vacation_periods, termination_notices, cipa_meetings, pj_contracts, pj_payments
- [x] Fix coluna motivo_outro → motivoOutro na tabela atestados
- [x] Fix erros TypeScript em fechamentoPonto.ts, Obras.tsx e db.ts
- [x] Atualizar Rev. 55 → Rev. 56 em shared/version.ts

## Rev. 57 - Correção Scroll do Menu Lateral
- [x] Fix barra de rolagem do menu lateral não ficar fixa ao clicar em todos os itens (alguns resetam o scroll)
- [x] SidebarContent agora usa forwardRef para conectar ref ao DOM
- [x] Scroll position e estado de seções expandidas persistem via variáveis de módulo (sobrevive remount)
- [x] Atualizar Rev. 56 → Rev. 57

## Rev. 58 - Configuração de Numeração Interna (Código Interno)
- [x] Criar critérios de numeração interna em Configurações (Critérios do Sistema)
- [x] Campo para alterar prefixo alfanumérico (ex: JFC → FC ou outro)
- [x] Campo para definir próximo número sequencial
- [x] Botão para resetar numeração (zerar para começar do 1)
- [x] Preview da próxima numeração gerada (ex: "Próximo: FC001")
- [x] Backend: rotas para salvar/buscar configuração de numeração
- [x] Backend: rota para resetar numeração (atualizar próximo número para 1)
- [x] Integrar com geração automática de codigoInterno ao cadastrar colaborador (já existia)
- [x] Atualizar Rev. 57 → Rev. 58

## Rev. 59 - Auditoria Completa: Filtro deletedAt IS NULL em Todo o Sistema
- [x] BUG: Dashboard mostra 9 obras ativas quando só existem 5 (query não filtrava deletedAt)
- [x] Auditoria completa de TODAS as queries do sistema
- [x] homeData.ts: corrigido employees e obras queries
- [x] dashboards.ts: corrigidas 18+ queries (statusDist, sexDist, setorDist, funcaoDist, contratoDist, estadoCivilDist, cidadeDist, ageDist, tenureDist, admissoes, demissoes, oldest, youngest, longestTenure, shortestTenure, allEmps cartaoPonto, allEmps horasExtras, allEmps EPIs, allObras)
- [x] fechamentoPonto.ts: corrigidas 3 queries (employees import, obras import, obras preview)
- [x] folhaPagamento.ts: corrigidas 6 queries (3x employees matching, 3x obras listing)
- [x] controleDocumentos.ts: corrigida query de employees para import
- [x] processosTrabalhistas.ts: corrigida query de desligados
- [x] Verificado: avisoPrevioFerias.ts, cipa.ts, pjContracts.ts já tinham filtro correto
- [x] Verificado: db.ts getEmployees e getObras já tinham filtro correto
- [x] Atualizar Rev. 58 → Rev. 59

## Rev. 60 - Fix Senha Reset Numeração
- [x] BUG: Senha RESETAR2026 não é aceita ao resetar numeração interna
- [x] Campo alterado de password para text (usuário vê o que digita)
- [x] Auto-uppercase no input para evitar erro de maiúsculas/minúsculas
- [x] Trim no backend para evitar espaços acidentais
- [x] Atualizar Rev. 59 → Rev. 60

## Rev. 61 - Redesign Abas Raio-X
- [x] Redesenhar layout das abas do Raio-X do Funcionário (amontoadas/ilegíveis com 17 abas)
- [x] Implementar layout organizado em grid 2x2 com 4 categorias: Geral, SST, Financeiro, Disciplinar/Saída
- [x] Labels coloridos por categoria com bordas temáticas
- [x] Todas as 17 abas acessíveis e funcionais
- [x] Atualizar Rev. 60 → Rev. 61

## Rev. 62 - Correção Aba PJ no Raio-X
- [x] Ocultar aba PJ no Raio-X para colaboradores CLT (só mostrar para tipo_contrato = PJ)
- [x] Testado: CLT (Ademir) sem aba PJ / PJ (Ricardo) com aba PJ

## Rev. 63 - Contrato Formal PJ + Adicionais PJ
- [ ] Criar modelo de contrato formal PJ para impressão/PDF com dados dinâmicos do colaborador
- [ ] Renomear "Horas Extras" para "Adicionais" no Raio-X para colaboradores PJ
- [ ] Ocultar aba "Horas Extras" para PJ (PJ não tem HE por lei)
- [ ] Criar tabela/schema de adicionais PJ (comissões, pagamentos extras, horas adicionais)
- [ ] Criar CRUD de adicionais PJ no backend e frontend
- [ ] Integrar botão de gerar contrato PJ na aba PJ do Raio-X

## Rev. 63 - BUG CRÍTICO: Cálculo de Férias Errado
- [ ] Investigar e corrigir cálculo de férias (valores absurdos: R$ 400.000 para Técnico de Segurança)
- [ ] Provável erro de parsing do salário (formato BR com ponto/vírgula)
- [ ] Revisar TODOS os cálculos de férias no sistema
- [ ] Identificar automaticamente funcionários de férias na importação da folha de pagamento
- [ ] Separar valores de férias (salário + 1/3) da folha normal ao importar
- [ ] Sinalizar na folha que funcionário está de férias naquele mês
- [ ] Formatar jornada de trabalho no Raio-X (JSON bruto → tabela visual simples)
- [ ] Alterar labels da jornada de "Seg/Ter/Qua..." para "Segunda/Terça/Quarta..." por extenso

## Rev. 63 - Nova Abordagem: Contrato PJ como Página Dedicada
- [ ] Criar página /contrato-pj/:id como rota do sistema (sem popup/blob/window.open)
- [ ] Backend tRPC: rota para buscar dados completos do contrato PJ por ID
- [ ] Página renderiza contrato formal diretamente no app com CSS de impressão
- [ ] Botão "Imprimir" usa window.print() nativo (funciona em qualquer ambiente)
- [ ] Botão no Raio-X navega para a rota (useLocation do wouter)
- [ ] Remover código antigo de Blob URL do RaioXFuncionario.tsx
- [ ] Atualizar versão sidebar Rev. 60 → Rev. 63
- [ ] Banner visual de LISTA NEGRA no Raio-X (colaboradores blacklist)
- [ ] Corrigir filtro Blacklist (mostra 0 mas há colaborador no banco)
- [x] Corrigir formato de valores monetários nos Processos Trabalhistas (45000.00 → R$ 45.000,00)
- [x] Adicionar coluna Tipo de Contrato (CLT/PJ) na tabela de colaboradores ao lado do CPF
- [x] Recriar página Contrato PJ com layout profissional (logo empresa, cabeçalho bonito)
- [x] Usar texto exato do modelo DOCX fornecido pelo cliente
- [x] Criar aba "Contrato PJ" nas Configurações/Critérios do Sistema para editar texto padrão
- [x] Criar tabela no banco para armazenar template editável do contrato PJ
- [x] Busca de colaboradores filtrar por qualquer campo (tipo contrato, setor, função, status, etc)
- [x] Varredura completa: adicionar todos os módulos faltantes na tela de Limpeza de Dados
- [x] Processos Trabalhistas: adicionar botões editar/excluir na tabela
- [x] Processos Trabalhistas: seleção múltipla com checkbox para excluir em lote
- [x] Processos Trabalhistas: criar rota backend de exclusão (delete e deleteBatch)
- [x] CIPA: alerta só aparecer quando NÃO tem mandato ativo com membros suficientes (sumir quando CIPA já constituída)
- [x] EPIs: seleção múltipla com checkbox + exclusão em lote na tabela de Catálogo de EPIs
- [x] Funções/Cargos: corrigir filtros dos cards de estatísticas (Com CBO, Com Descrição, etc.) - não filtram ao clicar
- [x] Fluxo de Caixa Prévio: adicionar gráfico de barras abaixo do Total Estimado Anual

## ALINHAMENTO APRESENTAÇÃO vs SISTEMA — Gaps Identificados

### SLIDE 4 — Painel Principal (Widgets faltantes)
- [x] Widget "Afastados" no painel principal (JÁ EXISTE no homeData backend + Home.tsx)
- [x] Widget "Licença" no painel principal (JÁ EXISTE no homeData backend + Home.tsx)
- [x] Widget "Próximas Audiências" no painel principal (JÁ EXISTE no homeData backend + Home.tsx)
- [x] Widget "Movimentações 30 dias" com atividade recente (JÁ EXISTE no homeData backend + Home.tsx)

### SLIDE 6 — Cadastro de Empresas
- [x] Validação automática de CNPJ (JÁ IMPLEMENTADO - Fase 10)
- [x] Campos Inscrição Estadual e Inscrição Municipal no cadastro de empresas (ADICIONADO AGORA)

### SLIDE 7 — Perfis e Permissões (4 níveis)
- [ ] Implementar perfil "Operacional" (lançamentos diários, upload, sem configurações)
- [ ] Implementar perfil "Consulta" (somente leitura, ideal para auditores)
- [ ] Permissões granulares por módulo para cada perfil

### SLIDE 8 — Critérios do Sistema (Categorias faltantes)
- [ ] Critérios de Folha: regras de desconto, cálculo INSS/IRRF/FGTS
- [ ] Critérios de Benefícios: VT, VA/VR, Plano de Saúde (valores padrão)
- [ ] Referência CLT visível ao lado de cada valor configurado

### SLIDE 12 — Templates de Documentos
- [ ] Geração automática de PDF com variáveis preenchidas ({nome}, {cpf}, {função}, {data}, {empresa})
- [ ] Assinatura digital integrada nos documentos

### SLIDE 15 — Cadastro de Colaboradores (Campos faltantes)
- [x] Campo "Cargo" separado de "Função" no cadastro (JÁ EXISTE no schema - campo cargo)
- [x] Campo "Contato de Emergência" (nome, telefone) (JÁ EXISTE no schema) + parentesco ADICIONADO AGORA
- [x] Campo "CTPS" (número e série) (JÁ EXISTE no schema - ctps + serieCTPS)
- [x] Campo "Título de Eleitor" (JÁ EXISTE no schema - tituloEleitor)
- [x] Campo "CNH" (número, categoria, validade) (JÁ EXISTE no schema)
- [x] Campo "Chave PIX" na aba Bancário (JÁ EXISTE no schema - chavePix + tipoChavePix)

### SLIDE 16 — Raio-X do Colaborador (Informações faltantes)
- [ ] Histórico de salário/reajustes no Raio-X (timeline de aumentos)
- [ ] Ranking de faltas/atrasos individual no Raio-X

### SLIDE 17 — Lista Negra (Melhorias)
- [x] Consulta automática de CPF/RG ao cadastrar novo funcionário (JÁ IMPLEMENTADO - checkBlacklist no routers.ts)
- [x] Bloqueio automático de cadastro quando CPF está na lista negra (JÁ IMPLEMENTADO)

### SLIDE 26 — Férias (Melhorias)
- [ ] Controle de 1/3 constitucional no cálculo de férias
- [ ] Opção de abono pecuniário (venda de 10 dias)
- [ ] Status automático "Férias" ao iniciar período e retorno automático "Ativo"

### SLIDE 30 — Advertências
- [x] Sequência automática de advertências (JÁ IMPLEMENTADO - REVISÃO_01 advertencias progressivas CLT)

### SLIDE 32 — Controle de Entregas de EPI
- [x] Campo "Fornecedor" no cadastro de EPI (ADICIONADO AGORA)
- [ ] Assinatura digital na entrega de EPI
- [ ] Exportar Ficha de EPI completa em PDF (por funcionário)

### SLIDE 33 — Acidentes, DDS e CIPA
- [x] Registro fotográfico no DDS (campo fotosUrls ADICIONADO no schema)
- [ ] Calendário visual de reuniões CIPA

### SLIDE 34 — Segurança do Trabalho (FISPQ e Riscos)
- [ ] FISPQ: classificação de risco 1-5, EPI necessário, primeiros socorros, armazenamento
- [ ] Mapeamento de Riscos: 5 tipos (Físico, Químico, Biológico, Ergonômico, Acidente)
- [ ] Auditorias internas/externas com plano de ação (responsável + prazo)

### SLIDE 35 — Controle de PJ (Melhorias)
- [ ] Validação automática de CNPJ do PJ
- [ ] Renovação automática de contrato PJ (alerta + opção de renovar)
- [ ] Relatórios separados CLT vs PJ
- [ ] Dashboard de custos PJ

### SLIDE 36 — Processos Trabalhistas (Melhorias)
- [ ] Dashboard Jurídico completo (valor em risco, processos por status, por advogado)
- [ ] Alertas automáticos de audiências e prazos

### SLIDE 39 — IA Integrada (Funcionalidades avançadas)
- [ ] Análise Preditiva (padrões de vencimento, tendências de HE)
- [ ] Classificação Inteligente de documentos (upload → IA sugere tipo e preenche campos)
- [ ] Sugestões automáticas de resolução de inconsistências

### SLIDE 40 — Auditoria e Segurança
- [ ] Log de downloads/exportações na auditoria
- [ ] Log de tentativas de acesso negadas
- [ ] Log de alterações de permissão

## Correção do Sistema de Permissões e Roles
- [x] Corrigir getAllUsers para filtrar usuários excluídos (soft delete)
- [x] Corrigir auth.me para não retornar campo password
- [x] Corrigir Select nativo de role na tabela de usuários (substituir por shadcn Select)
- [x] Adicionar invalidação de cache auth.me após mudança de role
- [x] Corrigir label de role no sidebar footer (estava hardcoded "Admin Master")
- [x] Adicionar filtragem de menu baseada em role (admin-only paths)
- [x] Adicionar restrição admin-only nas mutations de profiles (create, update, delete)
- [x] Filtrar tabs de Configurações baseado no role do usuário
- [x] Corrigir inicialização do editRole (era string vazia, agora "user")
- [x] Simplificar condição de envio de role no updateUser
- [x] Melhorar badges de role na tabela de usuários (cores e bordas distintas)

## Unificação da Página de Usuários e Permissões
- [x] Unificar aba "Usuários" das Configurações com a página "Usuários e Permissões"
- [x] Página única com: criação de usuário, definição de role, perfil por empresa e permissões granulares
- [x] Remover aba "Usuários" das Configurações
- [x] Manter "Novo Usuário" (username/senha) e "Novo Perfil" na mesma página
- [x] Exibir tabela de usuários com role do sistema + perfil por empresa + permissões

## Bug: Desconsolidar Mês - Permissão Admin Master
- [x] BUG: Admin Master recebe erro "Apenas o Admin Master pode desconsolidar um mês" ao tentar desconsolidar
- [x] Investigar e corrigir verificação de role na rota de desconsolidação

## Bug: Relógio de Ponto - Auto-liberação quando obra muda de status
- [ ] Quando obra muda para "Concluída" ou "Paralisada", liberar relógio automaticamente para realocação
- [ ] Relógio deve ficar com status "Disponível" e sem obra vinculada

## Melhoria: Vincular Relógios na Tela de Nova Obra
- [x] Mostrar relógios disponíveis para alocação na tela de Nova Obra
- [x] Permitir adicionar múltiplos relógios diretamente no cadastro da obra
- [x] Relógios vinculados devem ser salvos automaticamente ao salvar a obra

## Bug: Painel de Controle - Texto cinza e Drag and Drop
- [x] BUG: Itens "Funções" e "Relógios de Ponto" aparecem com texto cinza sem motivo (verificado - não reproduzível, itens aparecem normais)
- [ ] Implementar drag and drop para reorganizar itens do menu no Painel de Controle (já implementado no MenuConfigPanel)

## Bug PERSISTENTE: Desconsolidar - Admin Master bloqueado
- [x] BUG: Admin Master continua recebendo erro "Apenas o Admin Master pode desconsolidar" em produção
- [x] Investigar TODAS as camadas: frontend, backend, e como o role é verificado
- [x] Corrigir definitivamente (permitir admin + admin_master desconsolidar)

## Módulo: Controle de Revisões do Sistema
- [x] Criar tabela system_revisions no schema (id, version, titulo, descricao, data, tipo)
- [x] Criar backend CRUD para revisões (apenas Admin Master)
- [x] Criar página de Controle de Revisões no frontend (visível apenas Admin Master)
- [x] Popular histórico de revisões existentes (12 revisões seed)
- [x] Exibir número da revisão atual no rodapé do sidebar

## Responsividade - Controle de Revisões
- [x] Corrigir layout dos cards de estatísticas para ser responsivo (não quebrar em 2 linhas)

## Bug CRÍTICO PERSISTENTE: Desconsolidar ainda bloqueado para Admin Master
- [x] Deep debug: verificar qual role o ctx.user realmente tem quando a rota é chamada
- [x] Verificar se há OUTRA verificação de permissão bloqueando (frontend ou middleware)
- [x] Corrigir definitivamente - adicionado fallback de owner + logging detalhado + includes('admin')

## Regra: Registrar TODA alteração como revisão
- [x] Registrar Rev. 65 com todas as mudanças feitas (responsividade, correções, etc.)
- [x] A partir de agora, SEMPRE registrar cada alteração no Controle de Revisões

## Rev. 66 - Fechamento de Ponto - Detalhe do Colaborador (em vez de Raio-X)
- [x] Remover redirecionamento para Raio-X ao clicar no nome do colaborador
- [x] Clique no nome agora abre visão detalhada de ponto do mês (viewMode detalhe)
- [x] Card totalizador no topo: Dias Trab., Horas Totais, Horas Extras, Atrasos, Obras, Inconsistências, Conflitos
- [x] Exibir competência, jornada e badge de múltiplas obras no card
- [x] Painel de inconsistências pendentes do funcionário na visão de detalhe com botão Resolver
- [x] Botão "Raio-X Completo" no header como opção secundária
- [x] Ícone Raio-X na coluna de ações das tabelas (substituindo ícone de olho)
- [x] Comportamento consistente em todas as abas: Resumo, Inconsistências, Conflitos, Rateio
- [x] Registrado Rev. 66 no banco + shared/version.ts
- [x] 41 testes passando (12 novos + 29 existentes)

## Rev. 67 - Corrigir Fluxo de Advertência nas Inconsistências
- [x] BUG: Botão de advertência nas inconsistências auto-resolve/cancela a inconsistência — CORRIGIDO
- [x] BUG: Botão de advertência não navega para o formulário correto — CORRIGIDO (navega para Controle de Documentos)
- [x] Advertência NÃO resolve a inconsistência automaticamente — são ações independentes
- [x] Botão abre formulário completo de advertência (tipo, motivo, testemunhas) pré-preenchido via sessionStorage
- [x] Usuário escolhe tipo (Verbal/Escrita/Suspensão/Justa Causa/OSS) e preenche todos os campos
- [x] Inconsistência permanece pendente até ser resolvida separadamente (Justificar ou Ajustar)
- [x] Dialog de Resolver Inconsistência agora só oferece Justificar e Ajustar (advertência é ação separada)
- [x] Registrada Rev. 67 no banco + shared/version.ts
- [x] 36 testes passando (6 novos + 30 existentes)

## Rev. 68 - Detecção Inteligente de Conflitos de Obra (Transferência vs Sobreposição)
- [x] Analisar lógica atual de detecção de conflitos de obra no backend e frontend
- [x] Distinguir entre SOBREPOSIÇÃO (horários iguais/muito próximos ≤5min) e TRANSFERÊNCIA (horários diferentes com gap >5min)
- [x] Para TRANSFERÊNCIA: exibir análise visual Obra A → Obra B com gap de tempo e sugestão de saída
- [x] Para SOBREPOSIÇÃO REAL: manter alerta vermelho "escolha qual obra manter"
- [x] Backend enriquecido com campo transferAnalysis (fromObra, toObra, gapMinutes, suggestedExit)
- [x] Badge visual: vermelho=Sobreposição, azul=Transferência, verde=Deslocamento Válido
- [x] Alerta principal com contagem separada de sobreposições, transferências e deslocamentos
- [x] Aplicado em aba Conflitos e visão Detalhe do Colaborador
- [x] O sistema apenas alerta e sugere — o usuário decide e ajusta via Lançar Manual
- [x] Registrada Rev. 68 no banco + shared/version.ts + 7 testes passando

## Rev. 69 - Funcionários Não Identificados como Inconsistência Tratável
- [x] Importar registros de funcionários não encontrados como pendentes (nova tabela unmatched_dixi_records)
- [x] Armazenar nome original do relógio, batidas brutas, entrada/saída, obra e competência
- [x] Nova aba "Não Identificados" no Fechamento de Ponto com badge de contagem
- [x] Interface de vinculação: busca colaboradores do cadastro e vincula ao nome do relógio
- [x] Ao vincular, reprocessa automaticamente (calcula horas, extras, atrasos, inconsistências)
- [x] Opção de descartar registros inválidos com registro de quem descartou
- [x] Agrupamento por nome com contagem de registros e datas
- [x] Toast de importação reposicionado para canto inferior esquerdo
- [x] 3 endpoints backend: listUnmatched, linkUnmatched, discardUnmatched
- [x] Registrada Rev. 69 no banco + shared/version.ts + 13 testes passando

## Rev. 70 - Salário/Hora Bidirecional + Código Interno Visível
- [x] Campos Salário Base e Valor da Hora ambos editáveis
- [x] Digitar Valor da Hora → calcula Salário Base automaticamente (hora × horas mensais)
- [x] Digitar Salário Base → calcula Valor da Hora automaticamente (salário ÷ horas mensais)
- [x] Código interno exibido em destaque grande ao lado direito do nome no header
- [x] Estruturar para horista: valor da hora como dado mestre (destaque azul + estrela), salário como referência
- [x] Formatação monetária correta (R$ com separadores de ponto e vírgula)
- [x] Registrada Rev. 70 no banco + shared/version.ts + 9 testes passando

## Rev. 71 - Memória de Vinculação DIXI + Simulador Folha + Tipo Contrato Horista
- [ ] Criar tabela dixi_name_mappings para salvar associação nome relógio ↔ colaborador
- [ ] Na importação DIXI, consultar memória antes de tentar match por nome
- [ ] Ao vincular nome não identificado, salvar automaticamente na memória
- [ ] Simulador de folha por mês: campo dias úteis → calcula salário previsto de cada horista
- [ ] Interface do simulador na Folha de Pagamento ou Fechamento de Ponto
- [ ] Tipo de contrato "Horista" no cadastro do colaborador
- [ ] Ao selecionar Horista, destacar automaticamente campo Valor da Hora
- [ ] Registrar Rev. 71

## Rev. 71 — Memória DIXI, Simulador Horistas, Tipo Horista

- [x] Tabela dixi_name_mappings no banco de dados
- [x] Tipo de contrato "Horista" adicionado ao enum
- [x] Memória DIXI: auto-save ao vincular nome não identificado
- [x] Memória DIXI: consulta de mapeamentos no import para auto-match
- [x] Memória DIXI: aba "Memória DIXI" no Fechamento de Ponto com CRUD
- [x] Memória DIXI: adicionar vinculação manual via dialog
- [x] Memória DIXI: remover vinculação
- [x] Simulador Horistas: endpoint backend com cálculo por dias úteis
- [x] Simulador Horistas: aba "Simulador Horistas" no Fechamento de Ponto
- [x] Simulador Horistas: cards de resumo (total horistas, horas/mês, total folha)
- [x] Simulador Horistas: tabela com valor/hora, horas mês e salário previsto
- [x] Tipo Horista: opção no Select de tipoContrato em Colaboradores
- [x] Tipo Horista: badge amarelo na listagem
- [x] Tipo Horista: destaque do campo Valor da Hora (amarelo) quando Horista selecionado
- [x] Tipo Horista: label dinâmico "⚡ HORISTA" no campo Valor da Hora

## Rev. 72 — Jornada de Trabalho Padrão e Cálculo de Horas Extras

- [x] Critério padrão de jornada 44h semanais (Seg-Sex 07:00-17:00 + Sáb 07:00-11:00)
- [x] Grid dia-a-dia no cadastro do colaborador (Padrão, Seg, Ter, Qua, Qui, Sex, Sáb, Dom)
- [x] Entrada/Intervalo/Saída por dia da semana
- [x] Sábado e Domingo = hora extra automática quando trabalhado
- [x] Lógica robusta de cálculo de HE baseada na jornada contratada vs ponto real
- [x] Integração do cálculo de HE na folha de pagamento
- [x] Configurações globais de percentuais de HE (50%, 100%, noturno)

## Rev. 73 — Contrato de Experiência CLT

- [x] Campos no cadastro: tipo de experiência (30+30 ou 45+45), data início experiência, status
- [x] Cálculo automático de datas de vencimento (1º período e 2º período)
- [x] Status automático: Em Experiência, Prorrogado, Efetivado, Desligado
- [x] Card na tela inicial (Dashboard) com colaboradores em experiência
- [x] Alertas visuais de vencimento próximo (7 dias, vencido)
- [x] Ações rápidas: Prorrogar, Efetivar, Desligar direto do painel
- [x] Endpoint backend para listar experiências e executar ações
- [ ] Testes unitários para lógica de prazos (futuro)

## Correção — Datas/Horas das Revisões (GMT-3)
- [x] Corrigir datas existentes no banco (UTC → Brasília GMT-3)
- [x] Ajustar exibição no frontend para usar horário de Brasília (dateUtils.ts centralizado)
- [x] Garantir que futuras inserções gravem no fuso correto (process.env.TZ = 'UTC' no servidor)
- [x] Migrar TODAS as chamadas toLocaleString/toLocaleDateString para dateUtils em todos os arquivos
- [x] Criar utilitários: formatDateTime, formatDate, formatTime, nowBrasilia, todayBrasiliaLong

## Rev. 74 — Modelo de Contrato de Experiência CLT (Impressão + Upload)
- [ ] Criar página /contrato-experiencia/:id para impressão do contrato formal CLT
- [ ] Modelo com cláusulas padrão CLT (Art. 443, 445, 451)
- [ ] Dados dinâmicos: empresa, colaborador, função, salário, jornada, datas
- [ ] Layout profissional com logo da empresa, cabeçalho e rodapé
- [ ] Botão "Imprimir Contrato" na seção de experiência do cadastro
- [ ] Botão "Upload Contrato Assinado" com armazenamento S3
- [ ] Campo para visualizar/baixar contrato assinado já enviado
- [ ] Integrar com Raio-X do Funcionário (aba de documentos)
- [x] Registrar Rev. 74

## Rev. 74 — Contrato de Experiência: Modelo Impressão + Desligamento Completo + Upload
- [ ] Melhorar dialog de desligamento na experiência (igual ao desligamento normal)
- [ ] Adicionar campo "Categoria do Desligamento" (Término contrato, Justa causa, Baixo desempenho, etc.)
- [ ] Adicionar checkbox "Adicionar à Lista Negra" com campo de motivo
- [ ] Atualizar backend para aceitar categoria, motivo e lista negra no desligamento por experiência
- [ ] Criar página /contrato-experiencia/:id para impressão do contrato formal CLT
- [ ] Modelo com cláusulas padrão CLT (Art. 443, 445, 451)
- [ ] Dados dinâmicos: empresa, colaborador, função, salário, jornada, datas
- [ ] Layout profissional com logo da empresa
- [ ] Botão "Imprimir Contrato" na seção de experiência do cadastro
- [ ] Botão "Upload Contrato Assinado" com armazenamento S3
- [x] Registrar Rev. 74

## Bug Fix — Exclusão de Advertências não remove da lista
- [x] Investigar por que a exclusão mostra sucesso mas o item não some
- [x] Corrigir invalidação do cache após exclusão

## Rev. 74 — Mega Atualização

### 1. Bug Fix — Exclusão de Advertências
- [x] Corrigir: exclusão mostra sucesso mas item não some da lista (filtro deletedAt adicionado)
- [x] Garantir invalidação correta do cache após mutação de delete

### 2. EPI — Campos de Custo e Vida Útil
- [x] Adicionar campo "Valor do Produto" (custo unitário) no cadastro de EPI
- [x] Adicionar campo "Tempo Mínimo de Troca" (vida útil em dias) no cadastro de EPI
- [x] Verificar parâmetro do MT para vida útil de EPIs
- [x] Configurações: campo "BDI sobre EPI (%)" para ADM Master (padrão 40%)
- [x] Lógica de cobrança: se troca antes do prazo por perda/mau uso = Custo + BDI%
- [x] Na ficha do funcionário: mostrar EPI com estimativa de troca, valor, alerta de cobrança
- [x] Citar lei que permite desconto (CLT Art. 462 §1º) no rodapé
- [x] Colaborador não vê o BDI, só o valor final de cobrança
- [x] Mostrar valor total de EPIs em estoque na listagem

### 3. EPI — Ficha Padronizada para Impressão
- [x] Gerar ficha formal ao distribuir EPI (logo + cores da empresa)
- [x] Texto padrão configurável nas Configurações
- [x] Botão "Imprimir Ficha" após registrar entrega
- [x] Upload da ficha assinada registrada no cadastro do funcionário

### 4. Rankings de Pontualidade — Dashboard Cartão de Ponto
- [x] Ranking Top 5 mais pontuais
- [x] Ranking Top 5 mais atrasados
- [x] Ranking Top 5 mais horas extras
- [x] Ranking Top 5 menos dias trabalhados

### 5. Preset "44h com Sábado"
- [x] Novo botão no grid de jornada (Seg-Sex 8h + Sáb 4h = 44h)

### 6. Dashboard de Horas Extras
- [x] Visão consolidada mensal por colaborador (cards de resumo)
- [x] Gráficos de HE 50% vs HE 100% (cards com totais e custo estimado)

### 7. Dialog Desligamento Experiência (melhorado)
- [x] Replicar padrão do desligamento normal com categorias de motivo (Art. 479, 480 CLT)
- [x] Checkbox "Colocar na Lista Negra"
- [x] Motivo detalhado + observações + cálculo automático de indenização

### 8. Modelo Contrato de Experiência para Impressão
- [x] Documento CLT formal (dados colaborador, empresa, datas, 8 cláusulas)
- [x] Botão "Imprimir Contrato" na seção de experiência
- [x] Upload do contrato assinado na ficha do funcionário

### 9. Reestruturação Perfis de Acesso
- [x] Tela "Tipos de Perfil": aba separada com cards visuais e checkboxes V/C/E/D por módulo
- [x] Tela "Usuários": aba com cadastro de usuário, dados e perfil global
- [x] Tela "Perfis por Empresa": aba com atribuição de tipo de perfil e personalização individual

## Rev. 74 — Ajustes
- [x] Adicionar botão de voltar na tela de Controle de Revisões

## Rev. 74 — Ajustes
- [x] Adicionar botão de voltar na tela de Controle de Revisões
- [x] Adicionar Domingo na grade de jornada de trabalho (com badge HE, já existia)
- [x] Bug: testemunhas na lista de advertências mostrando JSON bruto em vez de nomes formatados
- [x] Ícones dinâmicos por tipo de EPI (capacete, luva, óculos, bota, protetor auricular, etc.)
- [x] Busca automática de dados do EPI pelo número do CA (Ministério do Trabalho)
- [x] Foto obrigatória do EPI ao trocar por desgaste normal, mau uso/dano ou perda
- [x] Após registrar entrega, abrir ficha de entrega automaticamente para impressão
- [x] Upload da ficha assinada obrigatório para dar baixa no EPI
- [x] Critério nas Configurações para ativar/desativar obrigatoriedade do upload da ficha
- [x] Ficha EPI: adicionar coluna Valor (custo + BDI) na tabela da ficha
- [x] Ficha EPI: adicionar coluna Vida Útil (dias) na tabela da ficha
- [x] Ficha EPI: texto legal atualizado com política de troca sem custo dentro do prazo
- [x] Ficha EPI: base legal NR-6 item 6.7.1 sobre responsabilidade do empregado
- [x] Ficha EPI: data e hora de emissão da ficha
- [x] Ficha EPI: desconto claro dentro do mesmo mês
- [x] Ficha EPI: foto obrigatória destacada na ficha
- [x] Ficha EPI: layout padronizado com logo da empresa
- [x] Bug: site não responsivo ao virar celular (viewport meta + CSS landscape + padding responsivo)
- [x] Bug: consulta CA retorna erro "a[d] is not a function" - CORRIGIDO (migrado para site oficial CAEPI/MTE)
- [x] Busca automática do CA ao digitar (debounce 800ms), sem precisar clicar no botão

- [x] Simplificar exibição cobrança automática EPI: mostrar apenas valor final com BDI (sem detalhar cálculo)
- [x] Bug: consulta CA ainda retorna "Erro na consulta" para CA 48067 - adicionado timeout e logs detalhados
- [x] Melhorar formatação da ficha de entrega de EPI: logo no topo centralizado, cores padrão FC Engenharia
- [x] Nome do arquivo PDF da ficha EPI: "EPI - Nome do Colaborador" ao salvar/imprimir
- [x] Remover texto "(custo + encargos administrativos)" da seção de cobrança na ficha EPI
- [x] Tornar linhas de EPI clicáveis no Raio-X do funcionário para abrir ficha de entrega e visualizar arquivo assinado
- [x] Exibir nome do usuário que emitiu a ficha de EPI abaixo da data/hora de emissão
- [x] Mover configurações de EPI (BDI, texto ficha) da página de EPIs para a tela de Configurações geral

## Rev. 75 — Base CAEPI Local + Sistema de Descontos de EPI + Botão Atualizar Base CA

### Base CAEPI Local (eliminar scraping)
- [ ] Importar base CAEPI oficial do XLSX para tabela no banco de dados
- [ ] Reescrever consulta CA para usar banco local (instantânea)
- [x] Botão "Atualizar Base de CAs" nas Configurações para o usuário atualizar quando quiser (seção CAEPI com stats e botão refresh)

### Sistema de Descontos de EPI
- [x] Criar tabela epi_discount_alerts no schema (funcionarioId, epiDeliveryId, valor, status, validadoPor, dataValidacao, justificativa)
- [x] Backend: criar alerta de desconto automaticamente ao registrar entrega por mau uso/perda/furto
- [x] Backend: rotas CRUD para alertas de desconto (listar, validar, cancelar)
- [x] Backend: bloquear fechamento da folha se houver descontos pendentes de validação
- [x] Frontend: aba "Descontos" no Raio-X do funcionário com histórico completo
- [x] Frontend: alerta obrigatório na folha de pagamento para DP validar desconto
- [x] Frontend: botões "Confirmar Desconto" e "Cancelar Desconto" com justificativa
- [x] Registrar Rev. 75

### Uniformes e Controle de Tamanhos
- [ ] Adicionar campo "Categoria" no cadastro EPI (EPI, Uniforme, Calçado)
- [ ] Adicionar campo "Tamanho" para uniformes (PP, P, M, G, GG, XGG, XXGG) e calçados (34-48)
- [ ] Controle de estoque por tamanho (ex: P:10, M:25, G:30)
- [ ] Filtro por categoria e tamanho na listagem de EPIs/Uniformes
- [ ] Exibir tamanho na entrega e na ficha de EPI

## Correções Rev. 75
- [x] Fix: índice codigoInterno alterado de global para composto (companyId + codigoInterno) para evitar conflito entre empresas
- [x] Fix: createEmployee com retry automático em caso de duplicata de codigoInterno (até 5 tentativas)
- [x] Fix: getEmployeeById agora filtra soft-deleted (isNull deletedAt)
- [x] Fix: limpeza de dados de teste órfãos no banco de dados
- [x] Todos os 247 testes passando (21 arquivos de teste)

## Bug: Consulta CA + Erro insert epi_discount_alerts
- [x] Corrigir erro insert epi_discount_alerts ao registrar entrega EPI com mau uso/dano (colunas snake_case vs camelCase corrigidas)
- [x] Investigar e corrigir consulta CA no cadastro de EPI (CA 13211 e outros retornam erro) — corrigido fetch tRPC + schema caepiDatabase
- [x] Registrar Rev. 76
- [x] Adicionar categoria "EPI / Segurança" nos Critérios do Sistema com parâmetro BDI (%)
- [x] Base CAEPI mostrando 0 CAs na produção - corrigido (40.467 CAs carregados)
- [x] Bug: Raio-X do Funcionário travado em "Carregando dados do funcionário..." - corrigido (colunas epi_discount_alerts)
- [x] Remover "Tempo mín. troca padrão do EPI" dos Critérios globais (é por EPI individual, não regra global)
- [x] IA sugere vida útil (dias) automaticamente ao cadastrar EPI baseado no tipo de equipamento (com justificativa e nível de confiança)

## Rev. 77 — Bug Timeline + Responsividade Mobile
- [x] Bug CRÍTICO: Timeline mostrando itens excluídos (EPI, advertências, etc.) — filtrar deletedAt IS NULL em EPIs, Acidentes, Processos, Aviso Prévio, Férias
- [x] Responsividade mobile: Raio-X header, tabs, data grids, EPIs page — tudo responsivo para mobile portrait
- [x] Registrar Rev. 77

## Rev. 78 — Descontos EPI: Interface Completa + Banner de Custo Visual
- [x] Corrigir valor R$0,00 no desconto EPI — campos corrigidos (epiNome, valorUnitario, valorTotal, motivoCobranca, mesReferencia, validadoPor) mapeados corretamente do Drizzle schema
- [x] Adicionar botões "Confirmar Desconto" (verde) e "Cancelar Desconto" (vermelho com justificativa obrigatória) na aba Descontos EPI do Raio-X
- [x] Corrigir parâmetros da chamada validateDiscount (id/acao em vez de alertId/action) para corresponder ao backend
- [x] Tabela de descontos EPI agora exibe: EPI, Motivo, Qtd, Valor Unit., Valor Total, Mês Ref., Status e Ações
- [x] Resumo de descontos (Pendentes, Confirmados, Cancelados) com valores corretos
- [x] Banner verde "Troca sem custo para o colaborador" no formulário de entrega de EPI (entrega regular ou desgaste normal)
- [x] Banner vermelho "ATENÇÃO: Este item gerará desconto em folha" com valor + BDI quando motivo é mau uso/perda/furto
- [x] Seção de cancelados mostra justificativa de cada cancelamento
- [x] Fix: teste newModules.test.ts timeout aumentado para 15s (AppRouter integration)
- [x] 247 testes passando (21 arquivos de teste)
- [x] Registrar Rev. 78
## Bug: Erro ao cadastrar EPI com nome muito longo (CA query)
- [x] Nome do EPI vindo da consulta CAEPI excede limite da coluna varchar — coluna `nome` em epis e `epi_nome` em epi_discount_alerts aumentadas de 255/500 para 1000 caracteres
## Ordenação Alfabética de Colaboradores
- [x] Ordenar lista de colaboradores por nome em ordem alfabética por padrão (localeCompare pt-BR)
## Bug: Percentuais de Horas Extras não persistem
- [x] Percentuais HE (Dias Úteis, Domingos/Feriados, Adicional Noturno) voltam ao valor padrão após salvar e recarregar — frontend usava nomes errados (hePercentual50/100/Noturno), corrigido para nomes do banco (heNormal50, he100, heNoturna) em Colaboradores.tsx e db.ts
## Bug: Ordenação alfabética não funcionando em produção
- [x] Mateus aparecia fora de ordem — causa raiz: caractere TAB (0x09) no início do nome, limpado no banco e sanitização automática adicionada
## Rev. 79 — Auditoria Completa de Campos + Ordenação
- [x] Auditoria: comparados 89 campos do schema vs 67 do validFields vs 67 do frontend
- [x] 23 campos faltantes adicionados ao validFields (experiência, desligamento, HE feriado/interjornada, lista negra, obsAcordoHe, etc.)
- [x] 5 campos do frontend que eram silenciosamente descartados: categoriaDesligamento, codigoInterno, dataDesligamentoEfetiva, motivoDesligamento, parentescoEmergencia
- [x] complementoObs renomeado para descricaoComplemento (nome correto no banco)
- [x] booleanFields corrigido: recebeComplemento e acordoHoraExtra são tinyint (boolean), não int
- [x] Sanitização automática de nomeCompleto (remove TAB/\r/\n e espaços extras) no create e update
- [x] Dados limpos no banco (TRIM de todos os nomes com caracteres de controle)
- [x] 247 testes passando (21 arquivos)
## Fix: Ordenação alfabética confirmada
- [x] Backend já tinha orderBy(asc(nomeCompleto)) — problema era dado sujo (TAB no nome)
- [x] Frontend mantém .sort(localeCompare) como fallback
## HE Percentuais: Input manual livre
- [x] Trocar campos HE Dias Úteis, HE Domingos/Feriados e Adicional Noturno de spinner numérico para input texto livre (aceitar 60, 70, 80% etc.) — type=text com inputMode=numeric, sem limite max=100
## Jornada de Trabalho: Campos de horário com digitação livre
- [x] Converter selects de Entrada, Intervalo e Saída para combobox (opções pré-definidas + digitação manual livre, ex: 1h15 de intervalo) — componente TimeCombobox criado com dropdown + input texto, parse inteligente (1h15, 0730, 30min)
## Bug: Critérios globais de HE não refletem nos funcionários sem acordo individual
- [x] Quando altera HE nas Configurações (ex: 60%), funcionários sem acordo individual agora refletem o valor global da empresa em vez de CLT hardcoded (50%)
- [x] Frontend busca critérios globais via trpc.criteria.getByCategory e exibe "Empresa: 60% (CLT: 50%)" nos campos
- [x] Ao desmarcar acordo individual, valores resetam para os critérios da empresa (não mais para CLT)
- [x] Visualização do funcionário mostra "Padrão Empresa (60/100/20%)" em vez de "Padrão CLT (50/100/20%)"
## Central de Alertas: Fullscreen
- [x] Fazer a Central de Alertas abrir em tela cheia (fullscreen) em vez de popup pequeno — DialogContent com 100vw/100vh
## Controle de Revisões: Somente leitura + Registrar Rev. 75-80
- [x] Remover botão "Nova Revisão" e botão de excluir — página somente leitura
- [x] Inserir revisões 75 a 80 no banco com descrições detalhadas de cada atualização

## Fase 29: Filtros no Controle de Revisões
- [x] Cards de resumo (Total, Nova Funcionalidade, Correção de Bug, Melhoria, Segurança, Performance) devem funcionar como filtros clicáveis
- [x] Ao clicar em um card, filtrar a lista de revisões mostrando apenas as do tipo selecionado
- [x] Clicar novamente ou clicar em "Total" deve remover o filtro

## Fase 30: Correção de Dados Desatualizados nos Dashboards
- [x] Rankings e gráficos do Dashboard mostrando dados antigos (seed de teste) — corrigido: faltava filtro deletedAt
- [x] Verificar se dados de seed ainda existem no banco e limpar se necessário — causa: advertências soft-deleted não eram filtradas
- [x] Garantir que dashboards refletem apenas dados reais atuais — isNull(warnings.deletedAt) adicionado em 7 queries

## Fase 31: Correção HE Percentuais — Usar Critério da Empresa como Padrão
- [x] Tela dedicada em Configurações para sincronizar HE de funcionários com critérios da empresa
- [x] Backend: procedure para listar funcionários com HE diferente e bulk-sync
- [x] Frontend: tabela com checkboxes, selecionar todos, e botão sincronizar selecionados
- [x] Remover banner inline do formulário do funcionário (ficou fora do escopo)

## Fase 32: Módulo de Integração Dixi Ponto
- [x] Schema: tabelas dixi_afd_importacoes e dixi_afd_marcacoes
- [x] Backend: parser AFD (TypeScript) conforme Portaria 671 (Tipo 1=header, Tipo 3=marcação, Tipo 9=trailer)
- [x] Backend: procedure de importação AFD com validações (SN, CPF, duplicidade)
- [x] Backend: preview de importação (SN, período, marcações, CPFs identificados/não identificados)
- [x] Backend: listagem de marcações com filtros (importação, data, CPF)
- [x] Backend: histórico de importações com detalhes e exclusão
- [x] Backend: dashboard stats (obras ativas, relógios, funcionários, importações, marcações, alertas)
- [x] Frontend: página Dixi Ponto com 5 abas (Dashboard, Importar AFD, Histórico, Marcações, Alertas)
- [x] Frontend: aba Importar com upload AFD + preview detalhado + confirmar importação
- [x] Frontend: aba Histórico com log de importações expandível + exclusão
- [x] Frontend: aba Marcações com filtros (importação, data, CPF) + tabela paginada
- [x] Frontend: aba Alertas (CPFs não encontrados agrupados com contagem)
- [x] Frontend: Dashboard com 6 cards de métricas + última importação
- [x] Adicionar menu lateral "Dixi Ponto" na seção OPERACIONAL
- [x] Testes unitários do parser AFD (10 testes passando)
- [ ] API Dixi: autenticação OAuth2 não funcionou (endpoints retornam 404) — preparado para futuro
- [ ] Frontend: aba Relógios com vinculação SN→Obra (usar tela existente de Relógios de Ponto)
- [x] Bug: Dixi Ponto não aparece na lista de módulos configuráveis em Configurações (seção OPERACIONAL)

## Fase 33: Motor de Cálculo CLT - Descontos Automáticos no Fechamento de Ponto
- [x] Schema: tabela ponto_descontos para armazenar cálculos de descontos por funcionário/mês
- [x] Critérios do Sistema: adicionar parâmetros CLT (tolerância atraso, desconto DSR, limite atestados, etc.)
- [x] Backend: engine de cálculo CLT (atraso proporcional, falta, DSR, saída antecipada)
- [x] Backend: detecção automática de atrasos/faltas/saídas antecipadas a partir das marcações
- [x] Backend: cálculo de DSR perdido por semana (atraso > tolerância ou falta na semana)
- [x] Backend: reflexo de faltas nas férias (Art. 130 CLT)
- [x] Backend: procedure para gerar/recalcular descontos de um mês
- [x] Frontend: aba/painel de Descontos no Fechamento de Ponto com revisão antes de fechar
- [x] Frontend: status por funcionário (Pendente → Revisado → Fechado)
- [x] Frontend: possibilidade de abonar/ajustar manualmente descontos
- [ ] Folha de Pagamento: aba Descontos mostrando cálculos automáticos
- [ ] Folha de Pagamento: comparativo sistema vs contabilidade para auditoria
- [x] Testes unitários do motor de cálculo CLT

## Fase 34: Módulo de Solicitação de Horas Extras
- [x] Schema: tabela he_solicitacoes (obra, funcionários, data, horário, motivo, status, aprovador)
- [x] Backend: CRUD de solicitações + aprovar/rejeitar (somente admin master)
- [x] Backend: cruzamento automático batida vs solicitação aprovada no fechamento
- [x] Frontend: página Solicitação de HE no menu Operacional
- [x] Frontend: aba Solicitar (selecionar obra, funcionários, data, horário, motivo)
- [x] Frontend: aba Aprovações (admin master aprova/rejeita pendentes)
- [x] Frontend: aba Histórico (todas solicitações com status)
- [x] HE não autorizada: flag no fechamento + sugestão de advertência
- [x] Menu lateral: adicionar Solicitação de HE na seção Operacional
- [ ] Renomear campo Matrícula para eSocial no cadastro do funcionário (frontend label)
- [x] Campos rateáveis por obra: VA, VT, Seguro, Sindicato, FGTS, INSS, Dissídio, CCT, Pensão, DDS
- [x] Regra vale: admitidos após dia 10 não recebem vale no mês de admissão (critério configurável)

## Fase 35: Gap Analysis Completo - Reunião Gerencial RH (23/02/26)

### Sprint 2A: Template Aviso Prévio + Alerta 80 dias
- [x] Template de Aviso Prévio: gerar PDF/documento a partir da tela existente (tipo aviso_previo no documentTemplates)
- [x] Alerta automático 80 dias antes do fim da obra para planejar avisos prévios dos funcionários alocados
- [x] Exibir alerta no Painel Principal (Home) com lista de obras próximas do fim

### Sprint 2B: Campos VT/Pensão/Licença + Campos Rateáveis por Obra
- [x] Adicionar campos no employees: pensaoAlimenticia, valorPensao, tipoPensao, licencaMaternidade, dataInicioLicenca, dataFimLicenca
- [x] Adicionar campos no employees: seguroVida, contribuicaoSindical, dissidio, convencaoColetiva
- [x] Melhorar gestão de VT no cadastro (valor, tipo, operadora)
- [x] Criar tabela feriados (nacionais + estaduais + municipais) para cálculos de salário horista
- [x] Campos rateáveis por obra: VA, VT, Seguro, Sindicato, FGTS, INSS, Dissídio, CCT, Pensão, DDS

### Sprint 2C: Aba Descontos na Folha + Unificar HE
- [x] Aba Descontos na Folha de Pagamento: comparativo "sistema calculou" vs "contabilidade cobrou"
- [x] Unificar lançamentos de HE: cruzar HE calculadas pelo sistema com HE da folha (upload contabilidade)
- [x] Exibir divergências de HE para auditoria (sistema vs contabilidade)

### Sprint 3A: Feriados + Salário Horista + Diferenças Salariais
- [x] Tabela de feriados no banco (nacionais fixos + configuráveis por empresa)
- [x] Ajustar simulador de horistas para considerar feriados e dias úteis variáveis por mês
- [x] Critério de lançamento para diferenças salariais (dissídio, reajuste retroativo)
- [x] Verificar/corrigir horário padrão e cálculos de HE nos critérios

### Sprint 3B: PJ Medição Mensal + Upload Documentos Pessoais
- [x] PJ como medição mensal: adicionar conceito de medição (horas trabalhadas x valor hora) no módulo PJ
- [x] PJ: cálculo por horas trabalhadas/mês no pjPayments
- [x] Upload de documentos pessoais (RG, CNH, CTPS, etc.) no cadastro do funcionário (S3)
- [x] Visualização de documentos uploadados na ficha do funcionário

### Sprint 3C: Regra Vale + Recontratação + Cadastro JF + Advertências Ponto
- [x] Regra vale: admitidos após dia 10 não recebem vale no mês de admissão (critério configurável)
- [x] Recontratação: fluxo de novo cadastro com mesmo CPF mantendo histórico anterior
- [x] Cadastro manual de JF (campo justica adicionado ao módulo Processos)
- [x] Verificar advertências automáticas por falta de ponto batido (sugestão de advertências implementada no motor CLT)

### Futuro (não implementar agora)
- [ ] Histograma da obra (orçado/planejado x realizado) - comparar mão de obra
- [ ] Ficha de avaliação de desempenho → linkar com dossiê RH (Raio-X)
- [ ] Ponto por geolocalização (GPS)
- [ ] Nome/nº org igual em todos ERPs (TC e RDO) - padronizar nomenclatura

## Fase 36: Frontend Novos Módulos + Dissídio por Ano + Campos Cadastro

### Módulo Dissídio Separado por Ano
- [x] Schema: tabela dissidios com histórico por ano (ano_referencia, percentual, data_base, data_aplicacao, status)
- [x] Critérios CLT/MTE: data-base maio, percentual mínimo INPC, retroativo, piso salarial categoria
- [x] Backend: router dissidio com CRUD + aplicação em massa + simulação
- [x] Backend: aplicação automática do dissídio (reajuste salarial em massa por ano)
- [x] Frontend: tela Dissídio separada por ano com histórico e aplicação

### Campos Novos no Cadastro do Colaborador
- [x] Frontend: campos pensão alimentícia (tipo, valor, percentual) no formulário
- [x] Frontend: campos licença maternidade (data início, data fim, status) no formulário
- [x] Frontend: campos seguro vida, sindicato, dissídio, CCT, DDS no formulário
- [x] Frontend: campo VT melhorado (valor, tipo, operadora) no formulário

### Frontend Novos Módulos
- [x] Frontend: tela de Feriados (CRUD + seed nacionais)
- [x] Frontend: tela de PJ Medições (horas x valor hora)
- [x] Frontend: upload de documentos pessoais no cadastro do funcionário

### Aba Descontos e Cruzamento HE na Folha
- [x] Frontend: aba Descontos na Folha (comparativo sistema vs contabilidade)
- [x] Frontend: aba Cruzamento HE na Folha (divergências sistema vs contabilidade)

## Fase 37: Campo Fornecedor no Cadastro de EPIs
- [x] Adicionar campo 'fornecedor' no schema da tabela de EPIs (+ CNPJ, contato, telefone, email, endereço)
- [x] Atualizar backend (router) para aceitar e retornar campos do fornecedor
- [x] Atualizar frontend do formulário de EPIs com busca automática por CNPJ via BrasilAPI

## Fase 38: Reorganização das Abas do Cadastro de Colaboradores
- [x] Auditar todas as abas e campos existentes para identificar duplicações
- [x] Separar Benefícios (VT, VA/VR, Farmácia, Cesta Básica, Plano Saúde) de Obrigações Legais (Pensão, Licença, Seguro, DDS)
- [x] Eliminar campos duplicados entre abas (removida aba duplicada)
- [x] Criar aba Sindical separada (Sindicato, CCT, Contribuição, Dissídio)
- [x] Validar que nenhum campo ficou duplicado ou fora de contexto (0 erros TS)

## Fase 39: Limpeza de campos desnecessários no cadastro
- [x] Remover campo Cesta Básica da aba Benefícios (substituído por VA) — já removido em sessão anterior
- [x] Remover campo DDS da aba Obrigações (já existe módulo próprio na SST) — já removido em sessão anterior

## Fase 40: Dissídio - Regra "nunca regredir" + Critério anual
- [x] Regra: dissídio nunca pode regredir salário, só aumentar (validação backend criar + atualizar)
- [x] Critério de % dissídio anual nos Critérios do Sistema (categoria adicionada em Configurações)
- [x] Aplicação em massa do reajuste anual em todos os salários da base (tela Dissidio.tsx completa)
- [x] Remover Cesta Básica da aba Benefícios — já removido
- [x] Remover DDS da aba Obrigações — já removido
- [x] 26 testes unitários para dissídio (regra não regressão, cálculo reajuste, retroativo, simulação em massa)
- [x] Total: 300 testes passando (24 arquivos)

## Fase 41: Correção de ordem do gráfico Tempo de Empresa
- [x] Reorganizar barras do gráfico "Tempo de Empresa" em ordem crescente (< 3 meses → 3-6 meses → 6-12 meses → 1-2 anos → 2-5 anos → 5-10 anos)

## Fase 42: Refatorar Dissídio — mover para Configurações
- [x] Remover seção "Dissídio Coletivo" inteira da aba Sindical do cadastro de colaboradores
- [x] Manter apenas Sindicato, CCT e Contribuição Sindical na aba Sindical
- [x] Criar nova aba "Sindical / Dissídio" em Configurações com cadastro de ano + percentual de reajuste
- [x] Botão "Aplicar" ao lado de cada ano para reajustar todos os CLT da empresa de uma vez (com confirmação)
- [x] Regra: percentual nunca pode regredir (validação mantida no backend)
- [x] Sem exclusão individual — é lei, todos os CLT ativos são reajustados
- [x] 8 testes unitários para sindical router

## Fase 43: Melhorar Dashboard EPIs com mais insights
- [x] Corrigir formatação R$ para padrão brasileiro em todo o sistema (Epis.tsx e RaioXFuncionario.tsx)
- [x] Criar endpoint backend com analytics expandidos de EPIs (consumo mensal, custo por obra, distribuição por categoria, ranking)
- [x] Redesenhar dashboard EPIs com gráficos: consumo mensal, custo por obra, top EPIs consumidos, CAs vencendo, distribuição por categoria
- [x] Adicionar cards de insight: custo médio por funcionário, taxa de reposição, EPIs mais trocados, valor total investido
- [x] 308 testes passando (25 arquivos)

## Fase 44: Filtros responsivos no Dashboard EPIs
- [x] Adicionar filtros responsivos: período (De/Até), categoria, obra
- [x] Layout adaptável para mobile e desktop (grid 1→2→4 colunas)
- [x] Botão Filtros com indicador de filtros ativos
- [x] Tags de filtros ativos com remoção individual
- [x] Botão Limpar filtros
- [x] Gráficos e tabelas reagem aos filtros selecionados

## Fase 45: Botão de voltar na página Medições PJ
- [x] Adicionar botão de voltar no header da página Medições PJ

## Fase 46: Corrigir erro na atualização da Base CAEPI
- [x] Investigar e corrigir falha no download de dados do Portal de Dados Abertos do Governo Federal
- [x] Fonte primária alterada para FTP do MTE (ftp://ftp.mtps.gov.br) com arquivo pipe-delimited
- [x] Deduplicação por número de CA (124k linhas → ~40k CAs únicos)
- [x] Fallback para dados.gov.br API mantido
- [x] 308 testes passando

## Fase 47: Reestruturar como FC Gestão Integrada
- [x] Criar tela Hub de Módulos como página inicial (cards visuais para cada módulo)
- [x] Módulos atuais: RH & DP, SST (Segurança do Trabalho), Jurídico
- [x] Módulos futuros (Em breve): Planejamento, Financeiro, Orçamento, Compras
- [x] Reorganizar sidebar com botão voltar ao Hub (logo FC clicável)
- [x] Atualizar branding para "FC Gestão Integrada" (título, header, footer, HTML)
- [x] Preparar sistema de permissões por módulo (campo modulesAccess na tabela users)
- [x] Botão de voltar ao Hub de Módulos na sidebar
- [x] Rota / = Hub de Módulos, /painel = Dashboard principal
- [x] 308 testes passando (25 arquivos)

## Fase 48: Redesenhar Login + Hub com visual cinematográfico
- [x] Gerar imagem cinematográfica de engenharia civil para fundo
- [x] Atualizar tela de Login: trocar "Sistema de Gestão RH & DP" por "FC Gestão Integrada"
- [x] Logo FC em destaque na tela de login e hub
- [x] Redesenhar ModuleHub com visual premium, impactante e profissional
- [x] Cards de módulos com efeito glass/translúcido sobre a imagem

## Fase 49: Tela de edição de EPI + correção de salvamento
- [x] Criar tela de edição de EPI igual à de cadastro, preenchida com dados atuais
- [x] Corrigir bug: alterações no EPI não estão sendo salvas (updateEpiMut onSuccess agora navega de volta e reseta form)
- [x] Ao clicar no EPI no catálogo, abrir formulário de edição (nome clicável + botão editar)

## Fase 50: Reorganizar sidebar por módulo (RH & DP, SST, Jurídico)
- [x] Mapear itens atuais da sidebar e classificar por módulo
- [x] Criar seções separadas na sidebar: RH & DP, SST, Jurídico
- [x] Cada módulo mostra apenas seus itens pertinentes, sem duplicidade
- [x] Manter itens compartilhados (Cadastro: Empresas, Obras, etc.) em seção comum
- [x] Navegação entre módulos via Hub ou troca na sidebar (seletor de módulo na sidebar)

## Fase 51: Redesign Hub de Módulos - Tema Claro
- [ ] Gerar 3 amostras de design claro com cores FC sutis
- [x] Apresentar amostras ao usuário para escolha
- [x] Implementar o design escolhido pelo usuário

## Fase 52: Implementar Login split + Hub assimétrico
- [x] Upload foto viaduto (escolhida pelo usuário) para S3
- [x] Login: foto P&B à esquerda com "ERP - Gestão Integrada" + painel branco à direita com formulário
- [x] Hub: layout assimétrico (título grande à esquerda, cards empilhados à direita)
- [x] Sem logos (FC, etc) — apenas texto "ERP - Gestão Integrada"
- [x] Cores azul marinho e amarelo/dourado sutis

## Fase 53: Redesign Hub de Módulos - Visual mais impactante
- [ ] Redesenhar Hub com design mais criativo, moderno e impactante
- [ ] Melhorar hierarquia visual e apelo estético dos cards de módulos
- [ ] Manter tema claro, cores FC sutis (azul marinho + dourado)
- [ ] Título "ERP - Gestão Integrada" com mais destaque visual

## Fase 54: Cadastro de Fornecedores de EPIs
- [x] Criar tabela fornecedores_epi no banco (nome, cnpj, telefone, email, endereco, contato, observacoes)
- [x] Criar procedures CRUD no backend (listar, criar, editar, excluir fornecedores)
- [x] Integrar dropdown de fornecedores no formulário de cadastro/edição de EPI
- [x] Ao selecionar fornecedor, preencher automaticamente CNPJ, telefone, email, endereço
- [x] Botão "+" para cadastrar novo fornecedor direto do formulário de EPI
- [x] Botão "Fornecedores" no catálogo para gerenciar lista completa
- [x] Dialog de cadastro/edição de fornecedor com todos os campos
- [x] Dialog de listagem de fornecedores com edição e exclusão
- [ ] Testes vitest para as procedures de fornecedores

## Fase 55: Bug - Tela de Login em branco
- [ ] Investigar por que a tela de login não aparece nada ao acessar
- [ ] Corrigir o bug e garantir que o login funcione corretamente

## Fase 56: Hub Futurista tipo 2060
- [x] Pesquisar referências de interfaces futuristas e sci-fi dashboards (Apple Vision Pro, glassmorphism, sci-fi HUD)
- [x] Redesenhar Hub com visual futurista: mesh gradient animado, glassmorphism, cards com hover 3D, ícones flutuantes com glow
- [x] Manter funcionalidade e usabilidade apesar do design avançado
- [x] Tema claro com elementos futuristas (gradientes mesh, glassmorphism, animações staggered, accent glow)
- [x] Gerar robô de IA engenheiro com capacete branco FC + colete de segurança + tablet holografico
- [x] Implementar layout: robô à esquerda + título "Gestão Integrada" + cards glass à direita
- [x] Watermark "ERP" gigante, ondas decorativas animadas, sombra drop-shadow no robô

## Fase 57: Ajustar Hub para ficar idêntico ao mockup aprovado
- [ ] Cards de módulos com ícones coloridos arredondados (azul claro RH, verde SST, azul escuro Jurídico)
- [ ] Texto dos módulos em negrito grande como no mockup
- [ ] Cards "Em Breve" na parte inferior com ícone de cadeado e relógio
- [ ] Ondas douradas decorativas no fundo
- [ ] Watermark "ERP" gigante atrás do título
- [ ] Header com foto do usuário, ícone globo e seletor Company
- [ ] Título "Gestão Integrada" em negrito grande

## Fase 58: Corrigir Hub no mobile
- [x] Robô com fundo cinza feio no mobile - escondido no mobile
- [x] Robô ocupando tela toda no mobile - resolvido
- [x] Esconder robô no mobile (hidden lg:block) - robô só aparece em desktop
- [x] Focar nos cards de módulos no mobile - cards aparecem direto

## Fase 59: Adicionar revisões no rodapé do Hub
- [x] Adicionar rodapé no Hub de Módulos com número de revisão do sistema (Rev. 97)

## Fase 60: Campo Cor do Capacete no Cadastro de EPI
- [x] Pesquisar tabela padrão de cores de capacetes na construção civil (NR-6/NR-18)
- [x] Adicionar campo corCapacete no schema do banco (coluna opcional na tabela epis)
- [x] Exibir campo de cor condicionalmente quando EPI for tipo Capacete
- [x] Criar legenda visual ao lado do campo com cores e suas funções
- [x] Salvar cor do capacete no banco ao cadastrar/editar EPI
- [x] Testes unitários (9 testes passando)

## Fase 61: Controle de Acesso por Empresa (Permissões de Visibilidade)
- [x] Criar tabela user_companies no banco (vínculo N:N entre usuários e empresas)
- [x] Criar procedures backend para gerenciar permissões (listar, atribuir, remover)
- [x] Atualizar tela de gestão de usuários com seleção de empresas permitidas
- [x] Filtrar seletor de empresas no CompanyContext com base nas permissões
- [x] Admin Master vê todas as empresas automaticamente (sem restrição)
- [x] Testes unitários (12 testes, 329 total passando)

## Fase 62: Reformulação Completa - Sidebar e Dashboards por Módulo
- [x] Sidebar dinâmica: ao selecionar RH, mostrar APENAS itens de RH (Colaboradores, Obras, Setores, Funções, Ponto, Folha, etc.)
- [x] Sidebar dinâmica: ao selecionar SST, mostrar APENAS itens de SST (EPIs, ASOs, Treinamentos, Acidentes, Riscos, CIPA, etc.)
- [x] Sidebar dinâmica: ao selecionar Jurídico, mostrar APENAS itens de Jurídico (Processos Trabalhistas, Audiências, Provisões)
- [x] Dashboard RH: painel com dados pertinentes a RH (headcount, turnover, folha, etc.)
- [x] Dashboard SST: painel com dados pertinentes a SST (acidentes, treinamentos vencidos, EPIs, etc.)
- [x] Dashboard Jurídico: painel com dados pertinentes ao Jurídico (processos, audiências, provisões)
- [x] Admin Master vê tudo em todos os módulos (sem restrição)
- [x] Remover itens não pertinentes de cada módulo (ex: colaboradores não aparece no Jurídico)
- [x] Cada módulo com visual/identidade própria
- [x] Testes e verificação visual (340 testes passando)

## Fase 62b: Permissões Granulares por Módulo e Funcionalidade
- [x] Criar tabela user_permissions no banco (userId, moduleId, featureKey, canAccess)
- [x] Definir mapa de funcionalidades por módulo (RH: 14 features / SST: 3 features / Jurídico: 1 feature)
- [x] Criar procedures backend para gerenciar permissões (getUserPermissions, setUserPermissions, getMyPermissions)
- [x] Criar tela de configuração de permissões no cadastro de usuários (checkboxes por módulo e funcionalidade)
- [x] Filtrar sidebar com base nas permissões do usuário logado (PermissionsContext)
- [x] Bloquear módulos não permitidos no seletor da sidebar
- [x] Admin Master vê tudo sem restrição
- [x] Testes unitários (340 testes passando)

## Fase 63: Dashboard de EPIs Aprimorado
- [ ] Item mais utilizado
- [ ] Item menos utilizado
- [ ] Item mais caro
- [ ] Item mais barato
- [ ] Funcionário que mais recebe EPI
- [ ] Funcionário que recebe menos EPI
- [ ] Custo de EPI por funcionário
- [ ] Obra que mais solicita EPI
- [ ] EPI mais perdido/estragado
- [ ] Sugestões adicionais (taxa de reposição, previsão de consumo, validade média, etc.)

## Fase 64: Filtros Responsivos + Alerta de Desconto EPI
- [x] Analisar lógica do alerta de desconto na página de EPIs
- [x] Tornar alerta de desconto clicável com DescontosDialog (quem, qual EPI, valor, motivo)
- [x] Explicar lógica do alerta ao usuário
- [x] Tornar TODOS os filtros responsivos (8 páginas corrigidas: Epis, FechamentoPonto, ControleDocumentos, Ferias, Obras, Setores, Colaboradores, FolhaPagamento)
- [x] Testes e verificação visual (340 testes passando)

## Bug: Listagem de usuários travada em "Carregando..."
- [x] Investigar e corrigir bug na listagem de usuários após mudanças de permissões (schema Drizzle mapeava colunas camelCase mas tabela usava snake_case)

## Fase 65: Reorganizar Tela de Usuários + Corrigir Bug
- [x] Corrigir bug: aba "Usuários" travada em "Carregando..." (mapeamento de colunas snake_case no schema)
- [x] Reorganizar estrutura: remover abas "Tipos de Perfil" e "Perfis por Empresa"
- [x] Criar painel de configuração completo ao clicar no usuário (perfil, módulos, empresas)
- [x] Ao configurar usuário: definir perfil global, módulos acessíveis, empresas visíveis
- [x] Simplificar UX para fluxo mais intuitivo

## Fase 63: Dashboard de EPIs Aprimorado (implementação)
- [x] Criar queries backend para análises avançadas de EPI
- [x] Item mais utilizado (maior quantidade de entregas)
- [x] Item menos utilizado (menor quantidade de entregas)
- [x] Item mais caro (maior valor unitário)
- [x] Item mais barato (menor valor unitário)
- [x] Funcionário que mais recebe EPI (maior quantidade de entregas)
- [x] Funcionário que recebe menos EPI (menor quantidade de entregas)
- [x] Custo de EPI por funcionário (valor total gasto por pessoa)
- [x] Obra que mais solicita EPI (maior volume de entregas por obra)
- [x] EPI mais perdido/estragado (maior taxa de reposição por motivo)
- [x] Sugestões adicionais: taxa de reposição, previsão de consumo, evolução custo mensal, custo por obra detalhado, motivos de reposição
- [x] Redesenhar frontend do Dashboard de EPIs com novos cards e gráficos
- [x] Testar e validar todas as análises (340 testes passando)

## Fase 64: Correções na Tela de Fornecedores de EPI
- [x] Remover seção "Dados do Fornecedor" do formulário principal de EPI (novo e editar)
- [x] Corrigir botão "Cadastrar novo fornecedor" que não abria o dialog (dialog estava no return da MAIN VIEW mas não nos returns de novo_epi/editar_epi)
- [x] Extrair FornecedorDialog para componente reutilizável
- [x] Implementar autocompletar CNPJ via BrasilAPI no cadastro de fornecedor
- [x] Ao digitar CNPJ, preencher automaticamente nome, telefone, endereço, email
- [x] Testar e validar todas as correções

## Fase 65b: Mover Alerta de Desconto EPI para Folha de Pagamento
- [x] Remover alerta de desconto de EPI do Dashboard de EPIs (componente DescontosDialog e card removidos)
- [x] Criar view "Descontos EPI" na Folha de Pagamento com botão no header
- [x] Componente DescontosEPIView com filtros (Todos/Pendentes/Confirmados/Cancelados), cards de resumo e listagem
- [x] Corrigir backend: ao excluir entrega de EPI, cancelar desconto pendente associado automaticamente
- [x] Limpar descontos órfãos que referenciam entregas já excluídas no banco
- [x] Testar e validar (340 testes passando)

## Fase 66: Adicionar Tamanho U (Único) na Aba de Tamanhos de Camisa
- [x] Adicionar opção "U" (Único) nos tamanhos de camisa

## Fase 67: Alterar tamanho "U" para "Único"
- [x] Alterar label de "U" para "Único" na lista de tamanhos de uniforme

## Fase 68: Adicionar % em todos os gráficos dos dashboards
- [x] Atualizar componente DashChart para exibir valor + percentual em todos os tipos de gráfico (plugin chartjs-plugin-datalabels)
- [x] Verificar gráficos inline nos dashboards - todos 44 gráficos usam DashChart (6 dashboards)
- [x] Testar e validar - percentuais exibidos corretamente em doughnut, bar, horizontalBar, line

## Fase 69: Formatação automática de moeda no campo Valor do Produto (EPI)
- [x] Criar utilitário de máscara de moeda brasileira (ponto milhar, vírgula decimal)
- [x] Aplicar máscara nos campos de editar EPI, novo EPI e edição inline
- [x] Converter corretamente ao salvar (parseCurrencyToFloat)
- [x] Testado: 1055000 → 10.550,00 formatado automaticamente

## Fase 70: Corrigir exibição de percentuais nos gráficos
- [x] Remover labels fixos que sobrepõem textos em gráficos de barras (datalabels desativados para bar/line)
- [x] Manter % apenas no tooltip (hover) para bar/horizontalBar/line - tooltip escuro com valor + %
- [x] Em doughnut/pie: % dentro das fatias ≥5%, legenda com "Label: valor (%)" 
- [x] Testar e validar visual limpo em todos os dashboards (FC Engenharia com dados reais)

## Fase 71: Bug - Máscara de moeda não está funcionando no campo Valor do Produto
- [x] Corrigir campo Valor do Produto: trocar input type="number" por type="text" com máscara de moeda
- [x] Garantir formatação automática conforme digita (ex: 55454 → 554,54) - CONFIRMADO FUNCIONANDO

## Fase 72: Adicionar campo "Condição" (Novo/Reutilizado) no cadastro de EPI
- [x] Adicionar coluna `condicao` na tabela `epis` no schema do banco de dados
- [x] Migrar banco de dados (SQL direto + schema atualizado)
- [x] Atualizar rotas backend (create/update) para aceitar o campo condição
- [x] Adicionar campo select "Condição" (Novo/Reutilizado) nos formulários de cadastro e edição de EPI
- [x] Exibir condição na listagem/catálogo de EPIs (badge laranja "Reutilizado")
- [x] Marcar fase 71 como concluída (máscara de moeda já funcionava)

## Fase 73: Filtro de Condição (Novo/Reutilizado) no Catálogo de EPIs
- [x] Adicionar estado de filtro de condição (Todos/Novo/Reutilizado)
- [x] Adicionar Select de filtro ao lado da barra de busca no catálogo
- [x] Aplicar filtro na lista de EPIs exibidos

## Fase 74: Exibir badge "Novo" na listagem de EPIs (igual ao "Reutilizado")
- [x] Adicionar badge verde "Novo" na listagem do catálogo para EPIs com condição Novo

## Fase 75: Responsividade da página de EPIs
- [x] Tornar cards de estatísticas responsivos (flex com scroll horizontal em mobile)
- [x] Tornar barra de filtros (abas + busca + filtro condição) responsiva com flex-wrap
- [x] Tabela do catálogo já tinha overflow-x-auto (mantido)

## Fase 76: Tolerância de atraso e horas negativas no cartão de ponto
- [x] Implementar tolerância de 10 minutos para atraso (não desconta se atraso <= 10min)
- [x] Contabilizar chegada antecipada como hora extra (sem tolerância)
- [x] Adicionar coluna "Saldo" no relatório de ponto (detalhe por obra e resumo por colaborador)
- [x] Exibir saldo positivo em verde (+HH:MM) e negativo em vermelho (-HH:MM)
- [x] Aplicar mesma lógica nos dois blocos de cálculo (processRecords e vinculação)
- [x] Adicionar coluna Saldo nas tabelas de impressão/PDF

## Fase 77: Modal de ajuste rápido para inconsistências no cartão de ponto
- [x] Tornar badge "Inconsistente" clicável (abre modal de ajuste)
- [x] Criar modal com campos de horário pré-preenchidos, destacando faltantes em amarelo
- [x] Motivo obrigatório: Esqueceu de bater, Saiu mais cedo, Ficou doente, Falta justificada, Liberado pela chefia, Problema no relógio, Atraso justificado, Serviço externo, Outro
- [x] Campo de descrição obrigatório quando motivo = Outro
- [x] Backend atualizado para aceitar motivoAjuste e gravar na justificativa
- [x] Registro marcado como ajuste manual e inconsistência resolvida automaticamente

## Fase 78: Bug - Logout redireciona para tela de login OAuth ao invés da Home
- [x] Corrigir logout para redirecionar para /login (tela de login do sistema) após fazer logout

## Fase 79: Bug persistente - Logout não volta para tela inicial do sistema
- [x] Investigar todo o fluxo de logout (useAuth, DashboardLayout, ModuleHub, Login.tsx, App.tsx)
- [x] Corrigir ModuleHub.tsx: redirecionava para getLoginUrl() (OAuth Manus) quando !user, agora vai para /login
- [x] Verificar todos os window.location.href no projeto - todos apontam para /login
- [x] Único getLoginUrl() restante é o botão "Entrar com Manus OAuth" na tela de Login (correto)

## Fase 80: Bugs no Ranking de Faltas do Dashboard de Cartão de Ponto
- [x] Corrigir clique no colaborador do ranking: FechamentoPonto agora lê ?funcionario=X&mes=Y da URL
- [x] Corrigir critério de 0.5 dias de falta: agora falta = 1 dia inteiro (sem meio dia)

## Fase 81: Responsividade geral do sistema
- [x] Tornar todas as tabelas do sistema responsivas (min-width:600px global em mobile + overflow-x-auto)
- [x] Ajustar grids fixos (grid-cols-3/4/5/6) para responsivos com breakpoints sm/md em 10+ arquivos
- [x] Adicionar overflow-x-auto em tabelas (Configuracoes, Lixeira, PJMedicoes, SolicitacaoHE)
- [x] Grid de meses (12 colunas) agora 4 cols em mobile, 6 em tablet, 12 em desktop

## Fase 82: Remover módulo Dixi Ponto
- [x] Remover item "Dixi Ponto" do menu lateral (DashboardLayout, MenuConfigPanel, ModuleContext)
- [x] Remover rota /dixi-ponto do App.tsx e import
- [x] Arquivo DixiPonto.tsx mantido (desconectado)

## Fase 83: Padronizar cores dos gráficos em todos os dashboards
- [x] Criar paleta de cores padronizada (chartColors.ts) com CHART_PALETTE, SEMANTIC_COLORS e CHART_FILL
- [x] Aplicar paleta nos 6 dashboards: Funcionários, Cartão de Ponto, Folha, EPIs, Horas Extras, Jurídico

## Fase 84: Adicionar opções de Estado Civil no cadastro de colaboradores
- [x] Adicionar: Amasiado, Separado, Separado Judicialmente, Outro (União Estável já existia)
- [x] Atualizar enum no schema do banco de dados (ALTER TABLE employees)
- [x] Atualizar formulário de cadastro de colaboradores com novas opções

## Fase 85: Corrigir campo de busca de colaboradores em todas as telas
- [x] Corrigido campo de busca no Aviso Prévio (z-index do input/overlay/dropdown)
- [x] Corrigido campo de busca na CIPA
- [x] Corrigido campo de busca nas Férias
- [x] Corrigido campo de busca no Controle de Documentos
- [x] Corrigido campo de busca no Módulo PJ

## Fase 86: Reavaliação do cadastro de funcionários
- [x] Colocar todos os funcionários como status "Ativo" (160 funcionários)
- [x] Remover datas de desligamento futuro (dataDemissao, dataDesligamentoEfetiva)
- [x] Limpar campo de observação que contenha referência a desligamento (69 limpos)
- [x] Limpar campos de motivo/categoria de desligamento

## Fase 87: Adicionar idade atual na ficha Raio X do funcionário
- [x] Calcular e exibir idade atual baseada na data de nascimento (tela + impressão)

## Fase 88: Corrigir dropdown e melhorar layout do Novo Aviso Prévio
- [x] Remover limite de 20 itens no dropdown de colaboradores (mostrar todos os 160)
- [x] Aumentar altura do dropdown e adicionar contador de resultados
- [x] Melhorar layout geral do formulário (card com header, ícones, avatar, função/setor no dropdown)

## Fase 89: Corrigir filtro de busca de colaboradores no Aviso Prévio
- [x] Refatorado para usar Popover + Command (cmdk) do shadcn/ui
- [x] Corrigido value do CommandItem para incluir nome+CPF+função+setor (cmdk filtra pelo value)
- [x] Filtro agora funciona nativamente via cmdk (testado: "myrielle" filtra para 1 resultado)

## Fase 89b: Limpeza de deletedAt de todos os funcionários
- [x] Limpar deletedAt de todos os 299 funcionários no banco de dados

## Fase 90: Corrigir Cálculo de Previsão de Rescisão no Aviso Prévio
- [x] Botão "Calcular Previsão de Rescisão" agora exibe valores ao clicar (corrigido com trpc.useUtils())
- [x] Exibe valores detalhados: saldo salário, aviso prévio indenizado, 13º proporcional, férias + 1/3, FGTS, multa 40%, total
- [x] Exibe data limite de pagamento (Art. 477 §6º CLT - 10 dias úteis)

## Fase 91: Apontamentos de Campo + Solicitação de Aviso Prévio

### Módulo 1: Apontamentos de Campo
- [ ] Schema: tabela field_notes (employeeId, data, tipo ocorrência, descrição, solicitanteId, status pendente/resolvido, respostaRH)
- [ ] Backend: CRUD de apontamentos com filtro por empresa/status/data
- [ ] Frontend: Tela de registro de ocorrência (gestor seleciona funcionário, data, tipo, descrição obrigatória)
- [ ] Frontend: Painel RH com lista de pendências para resolver no fechamento do ponto
- [ ] Integração: Apontamentos aparecem na timeline do funcionário

### Módulo 2: Solicitação de Aviso Prévio (Fluxo de Aprovação)
- [ ] Schema: tabela termination_requests (employeeId, solicitanteId, dataDesejada, motivoDetalhado obrigatório, status pendente/aprovado/rejeitado, parecerRH obrigatório, analisadoPorId, dataAnalise)
- [ ] Backend: Criar solicitação (gestor), Analisar solicitação (RH aprovar/rejeitar com parecer)
- [ ] Frontend: Formulário de solicitação (gestor: funcionário, data desejada, motivo detalhado obrigatório)
- [ ] Frontend: Painel de análise RH (lista de solicitações pendentes, aprovar/rejeitar com parecer obrigatório)
- [ ] Se aprovado: cria aviso prévio automaticamente e registra na timeline
- [ ] Se rejeitado: registra na timeline do funcionário com motivo da rejeição
- [ ] Notificação para RH quando nova solicitação é criada
- [ ] Navegação: adicionar no menu lateral em Gestão de Pessoas

## Fase 92: Corrigir cálculos de rescisão completamente errados
- [x] Identificado: parseFloat("2.774,20") retornava 2.774 (R$2,77) em vez de 2774.20
- [x] Criado utilitário parseBRL() compartilhado em server/utils/parseBRL.ts
- [x] Corrigido em 5 arquivos: avisoPrevioFerias, dissidio, sindical, fechamentoPonto, folhaPagamento
- [x] 13 testes unitários passando para parseBRL

## Fase 93b: Estrutura de Benefícios de Alimentação por Obra
- [x] Criar tabela meal_benefits no banco (companyId, obraId, cafeManha, lancheTarde, valeAlimentacao, janta, totalVA_iFood)
- [x] Backend: CRUD de benefícios de alimentação por obra
- [x] Frontend: Tela de configuração nas Configurações para definir valores por obra/localidade
- [x] Integrar valores de VR/VA no cálculo de rescisão

## Fase 94: Reescrita Completa do Cálculo de Rescisão + Benefícios de Alimentação + Lei 12.506/2011
- [x] Criar tabela meal_benefit_configs no schema Drizzle (companyId, obraId, cafeManha, lancheTarde, valeAlimentacao, janta, ativo)
- [x] Sincronizar tabela no banco de dados (db:push)
- [x] Reescrever completamente a lógica de cálculo de rescisão no backend (avisoPrevioFerias.ts)
- [x] Implementar Lei 12.506/2011: aviso prévio proporcional (30 dias + 3 dias por ano de serviço, máximo 90 dias)
- [x] Calcular saldo de salário proporcional (dias trabalhados / 30 × salário)
- [x] Calcular férias proporcionais + 1/3 constitucional (meses trabalhados / 12 × salário × 4/3)
- [x] Calcular férias vencidas quando aplicável (períodos aquisitivos completos)
- [x] Calcular 13º salário proporcional (meses trabalhados no ano / 12 × salário)
- [x] Calcular VR proporcional (VR diário × dias trabalhados no mês)
- [x] Calcular aviso prévio indenizado (dias extras Lei 12.506 × salário diário)
- [x] Calcular FGTS estimado e multa 40% (informativo)
- [x] Calcular data limite de pagamento (Art. 477 §6º CLT: 10 dias corridos)
- [x] Criar componente BeneficiosAlimentacaoTab nas Configurações (CRUD de benefícios por obra)
- [x] Adicionar aba "Benefícios Alimentação" na página de Configurações
- [x] Atualizar frontend do Aviso Prévio com campos: Data Desligamento, Dias Trabalhados, VR Override
- [x] Atualizar preview de rescisão com detalhamento completo (verbas rescisórias, FGTS informativo, total)
- [x] Atualizar seção de detalhes do aviso prévio salvo com novo layout
- [x] Criar 23 testes unitários para validar cálculos de rescisão (todos passando)

## Fase 95: Simplificar formulário de Aviso Prévio
- [x] Remover campo "Data de Desligamento" (automática = data de início do aviso)
- [x] Remover campo "VR Diário (override)" — VR é calculado automaticamente pela config de benefícios × dias
- [x] Manter campo "Dias Trabalhados no Mês" como ajuste opcional
- [x] Reorganizar layout do formulário (grid 2 colunas em vez de 3)

## Fase 96: Reconstrução completa do fluxo de cálculo de rescisão
- [ ] BUG: Cálculo não reage à mudança de data — valores ficam estáticos
- [ ] Renomear campo "Data de Início" para "Último Dia Trabalhado" (data de desligamento efetiva)
- [ ] Investigar tabelas de descontos disponíveis (adiantamentos, EPIs, vales pendentes)
- [ ] Reescrever backend: calcular VR automático pela obra do funcionário
- [ ] Reescrever backend: buscar e somar descontos pendentes (adiantamentos, EPIs, etc)
- [ ] Reescrever backend: total = verbas rescisórias - descontos
- [ ] Refazer frontend com seção de verbas e seção de descontos separadas
- [ ] Testar com caso Isabela para validar valores

## Fase 97: Corrigir VR na rescisão e config de benefícios
- [ ] Atualizar config benefícios: checkbox ativar/desativar por item (café, lanche, VA, janta)
- [ ] Escritório Central: café ✅, lanche ❌, VA ✅, janta ❌
- [ ] Obra: café ✅, lanche ✅, VA ✅, janta ❌
- [ ] Corrigir cálculo VR rescisão: Total VA iFood = café(22d) + lanche(22d) + VA(485-5%), proporcional por dias/30
- [ ] Remover janta do cálculo de rescisão
- [ ] Aviso prévio: só pagar 3 dias extras com 1 ano COMPLETO de serviço (já está correto)
- [ ] Atualizar frontend da config de benefícios com checkboxes
- [ ] Testar cálculo Isabela: deve dar ~R$ 542 de VR (escritório, sem lanche)

## Fase 98: Alertas + Aviso Prévio no Dashboard + Gráficos Clicáveis
- [ ] Botão "198 alertas" deve abrir painel com TODOS os alertas pendentes organizados por tipo
- [ ] Cada alerta deve poder ser resolvido individualmente pelo usuário
- [ ] Card de Aviso Prévio no Dashboard: quem está de aviso, dias restantes
- [ ] Alerta grande no dia do vencimento do aviso prévio (não perder a data)
- [ ] Corrigir cálculo VR na rescisão (Total VA mensal / 30 × dias, com checkboxes ativo/desativo)
- [ ] Atualizar frontend BeneficiosAlimentacaoTab com checkboxes de ativação por item
- [ ] Gráficos clicáveis: ao clicar em barra/ponto, abrir painel com detalhes (nomes, cargos, datas)
- [ ] Aplicar gráficos clicáveis em Admissões x Demissões e todos os outros gráficos do Dashboard

## Fase 99: Cores dos Gráficos
- [x] Azul (#2563EB) para admitidos/ativos em TODOS os gráficos
- [x] Vermelho (#DC2626) para desligados/demissões em TODOS os gráficos
- [x] Cores criativas e vibrantes para os demais gráficos (laranja, roxo, âmbar, esmeralda, rosa, índigo)
- [x] Aplicar em Dashboard de Funcionários, Home, e todos os dashboards

## Fase 100: Correções Dashboard + Gráficos Clicáveis + Alertas + VR
- [ ] Corrigir contagem de obras ativas (13 no banco vs 8 na tela)
- [ ] Corrigir contagem de férias pendentes (78 no banco vs 42 na tela)
- [ ] Alertar sobre 156 funcionários sem ASO cadastrado
- [ ] Cores dos gráficos: azul=admissão, vermelho=demissão, paleta vibrante nos demais
- [ ] Gráficos clicáveis: ao clicar em barra/ponto, abrir painel com detalhes (nomes, cargos, datas)
- [ ] Card de Aviso Prévio no Dashboard (quem está de aviso, dias restantes, alerta no vencimento)
- [ ] Botão de alertas funcional com lista completa para resolver um a um
- [ ] Corrigir cálculo VR na rescisão (Total VA mensal / 30 × dias, sem janta, com checkboxes)
- [ ] Atualizar frontend BeneficiosAlimentacaoTab com checkboxes de ativação por item

## Fase 100: Correções Dashboard + Gráficos Clicáveis + VR + Banner Aviso Prévio
- [x] Banner vermelho de aviso prévio no Raio-X do funcionário (canto superior direito)
- [x] Só aparece quando status ativo/em_andamento/pendente (desaparece se cancelado/concluído)
- [x] Mostra tipo, datas, dias restantes, pulsa se urgente (≤3 dias), destaque se vencido
- [ ] Cores dos gráficos: azul=admissões, vermelho=demissões, paleta vibrante nos demais
- [ ] Card de Aviso Prévio no Dashboard (quem está de aviso, dias restantes)
- [ ] Alerta grande no dia do vencimento do aviso prévio
- [ ] Gráficos clicáveis: ao clicar em barra/ponto, abrir painel com detalhes (nomes, cargos, datas)
- [ ] Corrigir cálculo VR na rescisão (Total VA mensal / 30 × dias, sem janta, com checkboxes)
- [ ] Atualizar frontend BeneficiosAlimentacaoTab com checkboxes de ativação por item
- [ ] Aviso prévio: 3 dias extras só com 1 ano completo de serviço (Lei 12.506)

## Fase 104: Botão de Edição no Aviso Prévio
- [x] Adicionar botão de edição (ícone lápis) na coluna de Ações da tabela de Aviso Prévio
- [x] Implementar formulário de edição com campos preenchidos do registro existente
- [x] Criar/atualizar rota backend para update do aviso prévio

## Fase 104-B: Melhorias diversas
- [x] Renomear "Solicitação de HE" para "Solicitação de Hora Extra" no menu lateral
- [x] Expandir Timeline do Raio-X com TODOS os eventos do funcionário (aviso prévio cancelado/concluído, advertências, férias, mudanças de cargo/setor, alterações salariais, ASOs, treinamentos, CIPA, PJ, HE, desconto EPI, processos trabalhistas)
- [x] Adicionar botão de edição (ícone lápis) na coluna de Ações da tabela de Aviso Prévio

## Fase 104-C: Correções visuais
- [x] Corrigir paleta de cores dos gráficos do dashboard - cores mais suaves e harmoniosas
- [x] Tornar drill-down modal full screen em vez de popup pequeno

## Fase 105: Responsividade Dashboard EPIs + Catálogo EPI
- [ ] Tornar cards KPI do Dashboard de EPIs responsivos (grid adaptável)
- [ ] Tornar tabela Resumo por Categoria responsiva
- [ ] Tornar gráficos e demais seções responsivas
- [ ] Tornar cards KPI da tela de Catálogo EPI responsivos
- [ ] Tornar tabela e filtros do Catálogo EPI responsivos
- [ ] Adicionar filtro por categoria (EPI, Uniforme, Calçados) na tela de Catálogo EPI
- [ ] Desconto EPI cancelado NÃO pode ser descontado do funcionário na folha
- [ ] Adicionar filtro por categoria (EPI, Uniforme, Calçados) na tela de Catálogo EPI

## Fase 106: Módulo de Avaliação de Funcionários integrado ao ERP
- [ ] Criar schema de avaliações no banco (questionários, avaliações, respostas, rankings)
- [ ] Criar rotas backend para CRUD de avaliações vinculadas à base de funcionários
- [ ] Criar frontend do módulo de Avaliação integrado ao ERP (multi-avaliação, questionários personalizáveis)
- [ ] Vincular avaliações à base de funcionários existente (autocompletar, link direto)
- [ ] Implementar ranking de funcionários (melhor/pior por mês, trimestre, ano)
- [ ] Travar avaliação após finalização (não pode ser alterada)
- [ ] Permitir ADM gerar PDF de cada avaliação

## Fase 105-D: Melhorias na Solicitação de Hora Extra
- [ ] Opção de filtrar funcionários por "Funcionários da Obra" ou "Todos da Empresa"
- [ ] Alerta ao selecionar funcionário em Aviso Prévio (sugerir escolher outro)
- [ ] Análise de faltas do funcionário selecionado para HE
- [ ] Integração futura com Avaliação de Desempenho para aptidão de HE
- [ ] No fechamento do ponto, avaliar batidas em outras obras

## Fase 106: Módulo de Avaliação de Funcionários integrado ao ERP
- [ ] Criar schema de avaliações no banco (questionários, avaliações, respostas, rankings)
- [ ] Criar rotas backend para CRUD de avaliações vinculadas à base de funcionários
- [ ] Criar frontend do módulo de Avaliação integrado ao ERP
- [ ] Vincular avaliações à base de funcionários existente
- [ ] Implementar ranking de funcionários (melhor/pior por mês, trimestre, ano)
- [ ] Travar avaliação após finalização
- [ ] Permitir ADM gerar PDF de cada avaliação
- [ ] BUG: Drill-down do gráfico redireciona para /raio-x/ID que dá 404 - corrigir rota
- [x] Eliminar todas as datas de demissão futuras (a partir de hoje 26/02/2026) no banco de dados
- [ ] Formatar exibição da Jornada no Ponto - JSON bruto para tabela organizada por dia da semana

## Rev. 105 - Biblioteca de Conhecimento + Melhorias

- [x] Fase 1: Estrutura base, rotas, layout da Biblioteca de Conhecimento (/ajuda)
- [x] Fase 2: Unificar sistema de avaliação de desempenho como módulo adicional do ERP
- [x] Fase 3: Conteúdo dos módulos principais + complementares + memoriais adicionais
- [x] Fase 4: Artigos de Avaliação de Desempenho + FAQ + Dissídio + Feriados + Auditoria
- [x] Fase 5: Conteúdo dos módulos principais (Hub, Painel, Colaboradores, Ponto, Rescisão)
- [x] Fase 6: Conteúdo dos módulos complementares (EPI, HE, Férias, CIPA, PJ, etc.)
- [x] Fase 7: Memoriais de cálculo com fórmulas e exemplos práticos
- [x] Fase 8: Assistente IA com chatbot flutuante para tirar dúvidas
- [x] Fase 9: Busca global, favoritos, glossário e FAQ
- [x] Fase 10: Testar todo o sistema (gráficos, dados, páginas, erros)
- [x] Fase 11: Filtro no catálogo EPI para separar EPI/Uniforme/Calçados + filtro por tamanho
- [x] Fase 12: Testes finais e publicação

## Rev. 106 - Módulo Avaliação no Hub

- [x] Adicionar card de Avaliação de Desempenho na página inicial (Hub) como módulo adicional
- [x] Corrigir página Avaliação de Desempenho para usar empresa selecionada do cabeçalho (useCompany)

## Rev. 107 - Fusão Módulo Avaliação de Desempenho (fc-engenharia-avaliacao → ERP)

- [x] Criar tabelas no banco: evaluators, evaluations (12 critérios), criteria_revisions, evaluation_pillars, evaluation_criteria, evaluation_scores
- [x] Criar tabelas no banco: surveys, survey_questions, survey_responses, survey_answers, survey_evaluators
- [x] Criar tabelas no banco: climate_surveys, climate_questions, climate_responses, climate_answers
- [x] Criar tabelas no banco: external_participants, climate_external_tokens, audit_log
- [x] Backend: Router avaliadores (CRUD com login/senha, toggle status, reset senha)
- [x] Backend: Router avaliações (criar 12 critérios, listar, detalhe, ranking, IA summary, getByEmployee)
- [x] Backend: Router pesquisas customizadas (CRUD)
- [x] Backend: Router clima organizacional (CRUD)
- [x] Backend: Router dashboard stats (globalStats, employeeRanking, evaluatorStats)
- [x] Frontend: Dashboard admin com estatísticas globais
- [x] Frontend: Gestão de avaliadores (CRUD)
- [x] Frontend: Lista de avaliações + detalhe com 12 critérios
- [x] Frontend: Formulário de avaliação com 3 pilares e notas 1-5
- [x] Frontend: Pesquisas e Clima (abas)
- [x] Frontend: Ranking de funcionários
- [x] Integrar avaliação no Raio-X do funcionário (aba Avaliações com histórico, resumo, detalhes)

## Rev. 108 - Melhorias Formulário Avaliação

- [ ] Busca de funcionário por nome com autocomplete (digitar e já aparecer)
- [ ] Remover campo Avaliador - avaliador é o usuário logado automaticamente
- [ ] Adicionar campo Obra - mostrar apenas obras que o usuário é gestor/responsável + opção "Todas as Obras"
- [ ] Filtrar funcionários pela obra selecionada
- [ ] Remover resumo de notas/médias durante preenchimento (gestor não vê resultado)
- [ ] Adicionar tela de confirmação antes de enviar (resumo: funcionário, obra, mês)
- [ ] Visibilidade das avaliações: só RH, ADM e ADM Master veem resultados/notas
- [ ] Gestor que avaliou NÃO vê as notas depois de enviar

## Rev. 109 - Reformulação Módulo Avaliação

- [ ] Backend: avaliador automático (ctx.user.id/name) em vez de evaluatorId manual
- [ ] Backend: adicionar campo evaluatorName na tabela eval_avaliacoes
- [ ] Backend: pesquisas customizáveis com IA sugerindo perguntas por tema
- [ ] Backend: visibilidade de resultados só para RH/ADM/ADM Master
- [ ] Frontend: busca por nome com autocomplete no campo funcionário
- [ ] Frontend: remover campo avaliador (automático = usuário logado)
- [ ] Frontend: adicionar campo Obra (só obras do gestor + Todas as Obras)
- [ ] Frontend: remover resumo de notas durante preenchimento
- [ ] Frontend: tela de confirmação antes de enviar (resumo sem notas)
- [ ] Frontend: pesquisas customizáveis com criação/edição de perguntas + IA
- [ ] Frontend: visibilidade - gestor não vê notas após enviar

## Fase Avaliação: Reformulação Completa do Módulo de Avaliação
### Backend - Router Reescrito
- [x] Adicionar campo obraId e evaluatorName na tabela eval_avaliacoes
- [x] Adicionar campo publicToken nas tabelas eval_surveys e eval_climate_surveys
- [x] Reescrever router avaliacao.ts com sub-routers: avaliacoes, avaliadores, pesquisas, clima, dashboard, obras
- [x] Avaliador automático (ctx.user.name) no create de avaliação
- [x] Campo Obra (obraId) vinculado à avaliação
- [x] Dashboard com stats globais e ranking de funcionários
- [x] Pesquisas Customizadas: CRUD completo com token público
- [x] Clima Organizacional: CRUD completo com categorias (empresa, gestor, ambiente, segurança, crescimento, recomendação)
- [x] IA sugere perguntas para pesquisas customizadas e clima (via invokeLLM)
- [x] Visibilidade: apenas RH/ADM/ADM Master veem resultados

### Frontend - AvaliacaoDesempenho.tsx Reescrito
- [x] Autocomplete de funcionário com Command/Popover (busca por nome)
- [x] Avaliador automático (nome do usuário logado)
- [x] Campo Obra (select de obras ativas da empresa)
- [x] Sem resumo de notas durante preenchimento
- [x] Tela de confirmação antes de enviar
- [x] Aba Clima Organizacional (criar pesquisa, perguntas por categoria, link público, resultados)
- [x] Aba Pesquisas Customizadas (criar pesquisa, IA sugere perguntas, link público, respostas)
- [x] Aba Dashboard com estatísticas e ranking

### Páginas Públicas
- [x] PesquisaPublica.tsx: página pública para responder pesquisas customizadas via token
- [x] ClimaPublicoPage: página pública para responder pesquisa de clima via token
- [x] Rotas /pesquisa-publica/pesquisa/:token e /pesquisa-publica/clima/:token no App.tsx

### Testes
- [x] 15 testes unitários para o módulo de avaliação (router structure, avaliadores, avaliacoes, pesquisas, clima, dashboard, obras)

## Fase Avaliação - Dashboard com Gráficos Interativos

### Backend - Rotas de dados agregados
- [x] Rota pillarComparison: média por critério (12 critérios) + média por pilar (3 pilares)
- [x] Rota byObra: comparativo de médias por obra
- [x] Rota monthlyEvolution: evolução mensal com médias por pilar
- [x] Rota climaConsolidated: índice geral + média por categoria de clima
- [x] Rota topBottomEmployees: top 5 melhores e 5 que necessitam atenção
- [x] Rota scoreDistribution: histograma de distribuição de notas

### Frontend - Gráficos Chart.js
- [x] Gráfico de linha: Evolução mensal das avaliações com pilares (Line chart)
- [x] Gráfico de barras: Distribuição de notas / histograma colorido (Bar chart)
- [x] Gráfico de barras horizontais: Média por critério de avaliação (12 critérios)
- [x] Gráfico Doughnut + Cards: Média por pilar (3 pilares)
- [x] Gráfico de barras: Comparativo por obra (Bar chart)
- [x] Gráfico Doughnut: Distribuição por recomendação
- [x] Top 5 melhores avaliados (cards com ranking e medalhas)
- [x] Top 5 que necessitam atenção (cards com alertas)
- [x] Clima Organizacional consolidado (índice geral + barras por categoria)
- [x] Cards com KPIs: total avaliações, avaliadores, pesquisas, média geral

### Testes
- [x] 29 testes unitários passando (incluindo controle de acesso por role)
- [x] Controle de acesso: gráficos restritos a RH/ADM/ADM Master

## Fase Avaliação - Redesign Completo: Sistema Flexível de Avaliações

### Conceito Novo
- [x] Templates de avaliação customizáveis (título + perguntas definidas pelo usuário)
- [x] IA sugere perguntas baseadas no título da avaliação
- [x] Perguntas manuais: usuário cria suas próprias perguntas (escala 1-5)
- [x] Atribuir avaliadores: selecionar colaboradores que farão a avaliação
- [x] Avaliadores acessam base de funcionários para avaliar cada um
- [x] Múltiplas avaliações: ativar/desativar quando quiser
- [x] Dashboard com gráficos comparativos por avaliação

### Schema
- [x] Reutilizado eval_surveys com flags isEvaluation + allowEmployeeSelection
- [x] eval_survey_questions (perguntas customizáveis por avaliação)
- [x] eval_survey_evaluators (avaliadores atribuídos)
- [x] eval_survey_responses com employeeId + evaluatorUserId
- [x] eval_survey_response_answers (respostas por pergunta)

### Backend
- [x] CRUD de templates de avaliação (pesquisas.create com isEvaluation)
- [x] IA sugere perguntas via LLM baseado no título
- [x] CRUD de perguntas por template
- [x] Atribuir/remover avaliadores (addEvaluators/removeEvaluator/getEvaluators)
- [x] Ativar/desativar template (updateStatus)
- [x] Aplicar avaliação (submitResponse com employeeId + evaluatorUserId)
- [x] Resultados por template, por funcionário (getResults + getEvaluationByEmployee)

### Frontend
- [x] Tela de listagem de avaliações (cards com status ativo/inativo, toggle)
- [x] Wizard criar avaliação: título → IA sugere perguntas → avaliadores → confirmar
- [x] Tela de gerenciar avaliadores (adicionar/remover da base de usuários)
- [x] Tela de aplicar avaliação (avaliador escolhe funcionário → responde perguntas)
- [x] Dashboard com 10 gráficos Chart.js interativos
- [x] 29 testes unitários passando

## Bug: Módulo Avaliação faltando na sidebar
- [x] Adicionar módulo Avaliação no dropdown de módulos da sidebar (DashboardLayout)

## Bug: IA Sugerir Perguntas não funciona no módulo Avaliação
- [x] Diagnosticar por que o botão "IA Sugerir Perguntas" não gera perguntas (retorno incompatível)
- [x] Corrigir backend/frontend para gerar perguntas completas via IA (15 perguntas cobrindo 7 aspectos do colaborador)

## Melhoria: Perguntas da IA mais específicas e profissionais
- [ ] Melhorar prompt da IA para evitar perguntas vagas (ex: "sempre à disposição da empresa")
- [ ] Perguntas devem ser específicas, mensuráveis e práticas para construção civil
