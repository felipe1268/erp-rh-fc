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
