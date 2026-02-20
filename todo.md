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
