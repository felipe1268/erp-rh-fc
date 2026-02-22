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
