# ERP RH & DP - FC Engenharia | Changelog de Revisões

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
