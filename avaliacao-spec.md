# Especificação - Reformulação Módulo de Avaliação

## Requisitos do Felipe (do documento):
1. REFORMULAR o sistema de avaliação atual - não está bom
2. Fazer EXATAMENTE igual ao sistema anterior que já tinham desenvolvido
3. Duas modificações:
   - Avaliador cadastrado diretamente no ERP (mesmo login do ERP)
   - Pesquisa de cada funcionário fica salva no RAIO-X do funcionário (não criar outro Raio-X)
4. Manter a lógica do sistema anterior: critérios e fluxo de pesquisa
5. NÃO INVENTAR NADA - apenas unificar

## Fluxo do Sistema Anterior (das screenshots):

### TELA DO AVALIADOR (Pág. 3-8):
- Header: FC ENGENHARIA | Avaliação de Desempenho | Nome do avaliador | Início | Sair
- Cards resumo: Total na Obra (140) | Avaliados (0) | Pendentes (140) | Barra % concluído
- Stepper com 5 etapas: 1.Funcionário → 2.Postura e... → 3.Desempenh... → 4.Atitude e... → 5.Finalizar
- **Etapa 1 - Selecione o Funcionário**: Lista de funcionários com busca, botão "Mostrando Pendentes", avatar com inicial, nome, função, CPF
- **Etapa 2 - Postura e Disciplina** (Pilar 1 de 3): Critérios com notas 1-5 em círculos coloridos
  - Comportamento e Respeito (Postura profissional, respeito aos colegas e superiores)
  - Pontualidade (Cumprimento de horários de entrada, saída e intervalos)
  - Assiduidade (Frequência no trabalho, ausência de faltas injustificadas)
  - Segurança e Uso de EPIs (Uso correto de equipamentos de proteção individual)
  - Botões: < Voltar | Próximo >
- **Etapa 3 - Desempenho Técnico** (Pilar 2 de 3): Critérios 1-5
  - Qualidade e Acabamento (Qualidade do trabalho entregue e nível de acabamento)
  - Produtividade e Ritmo (Volume de trabalho e ritmo de execução)
  - Cuidado com Ferramentas (Conservação e uso adequado de ferramentas e equipamentos)
  - Economia de Materiais (Uso consciente de materiais, evitando desperdício)
- **Etapa 4 - Atitude e Crescimento** (Pilar 3 de 3): Critérios 1-5
  - Trabalho em Equipe (Colaboração, comunicação e espírito de equipe)
  - Iniciativa e Proatividade (Capacidade de antecipar problemas e propor soluções)
  - Disponibilidade e Flexibilidade (Disposição para ajudar e adaptar-se a mudanças)
  - Organização e Limpeza (Manutenção do ambiente de trabalho organizado e limpo)
- **Etapa 5 - Finalizar**: Timer, Observações (opcional), Resumo das Notas por pilar, aviso "Após enviar, a avaliação será travada e não poderá ser alterada", botão "Enviar Avaliação"
- **Tela de Confirmação**: "Avaliação Registrada", tempo de avaliação, dados do funcionário, contagem atualizada, botão "Avaliar Próximo (X restantes)" | Sair

### Escala de Notas (círculos coloridos):
- 1 = Péssimo (vermelho claro)
- 2 = Ruim (laranja)
- 3 = Regular (amarelo/verde)
- 4 = Bom (verde)
- 5 = Ótimo (azul escuro)

### TELA DO ADM (Pág. 9-10):
- Dashboard com sidebar (igual ERP)
- Cards: KPIs de avaliação
- Seções: Solicitar Avaliação, Avaliação Recente, Avaliações Ativas, Avaliação Geral, Comunicação RH, Desempenho RH, Atitude e Crescimento
- **Critérios de Avaliação**: Gerenciar pilares e critérios, Versão 1 (Versão inicial - 12 critérios padrão), 3 pilares com 4 critérios cada, botão "Editar Critério", Histórico
- **Participantes Externos**: Clientes e fornecedores para pesquisa de clima, botão "Novo Participante"

### TELA DO ADM - Detalhes (Pág. 11-12):
- Tela de gerenciamento de critérios com pilares editáveis
- Versão de critérios (V1 = 12 critérios padrão, 3 pilares × 4 critérios)
- Cada critério: nome, descrição, peso
- Histórico de versões de critérios
- Participantes externos (clientes/fornecedores para pesquisa de clima)

### TELA NO RAIO-X (Pág. 13-15):
- Aba "Avaliação de Desempenho" dentro do Raio-X do funcionário
- Card com nota geral do funcionário (ex: 4.2/5.0 = Bom)
- Gráfico radar com os 3 pilares
- Histórico de avaliações em timeline (data, avaliador, nota)
- Detalhamento por pilar com notas individuais de cada critério
- Observações do avaliador
- Dados sigilosos: visíveis apenas para ADM/ADM Master
- Comparativo com média da obra/empresa
