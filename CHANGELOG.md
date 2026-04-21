# ERP RH & DP - FC Engenharia | Changelog de Revisões

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
