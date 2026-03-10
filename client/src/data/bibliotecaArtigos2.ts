// ============================================================
// BIBLIOTECA DE CONHECIMENTO - ARTIGOS ADICIONAIS (Parte 2)
// Avaliação de Desempenho, FAQ, Dissídio, Feriados, Lixeira, PJ Medições
// ============================================================

import type { Artigo } from "./bibliotecaConteudo";

export const ARTIGOS_PARTE2: Artigo[] = [
  // ============================================================
  // AVALIAÇÃO DE DESEMPENHO
  // ============================================================
  {
    id: "avaliacao-visao-geral",
    categoria: "avaliacao",
    titulo: "Avaliação de Desempenho — Visão Geral",
    subtitulo: "Como funciona o módulo de avaliação de colaboradores",
    resumo: "Entenda a estrutura do módulo de avaliação: questionários, ciclos, respostas e ranking.",
    conteudo: `## Avaliação de Desempenho — Visão Geral

O módulo de **Avaliação de Desempenho** permite avaliar colaboradores de forma estruturada, com questionários personalizáveis e ranking automático.

### Estrutura do Módulo

O módulo é dividido em **4 abas** principais:

| Aba | Função |
|-----|--------|
| **Painel** | Visão geral com estatísticas: total de ciclos, avaliações realizadas, média geral e questionários ativos |
| **Questionários** | Criação e gestão de questionários com perguntas personalizáveis |
| **Ciclos** | Criação de ciclos de avaliação com período e questionário vinculado |
| **Ranking** | Classificação dos colaboradores por nota média |

### Fluxo de Trabalho

1. **Criar Questionário**: Defina título, descrição e adicione perguntas com peso de 1 a 5
2. **Criar Ciclo**: Vincule um questionário, defina período (data início e fim)
3. **Iniciar Ciclo**: Mude o status para "Em Andamento"
4. **Avaliar**: Selecione colaboradores e responda as perguntas (nota 1 a 5)
5. **Finalizar**: Ao finalizar, a nota é calculada automaticamente e a avaliação é **travada**
6. **Ranking**: O sistema gera automaticamente o ranking por nota média

### Regras Importantes

- Após **finalizar** uma avaliação, ela não pode ser alterada (travamento)
- O **nome do avaliador** é registrado em cada avaliação
- O sistema registra o **tempo médio** que cada avaliador leva
- O ADM Master pode excluir avaliações finalizadas
- Questionários podem ser reutilizados em múltiplos ciclos`,
    tags: ["avaliação", "desempenho", "questionário", "ciclo", "ranking", "nota"],
    icone: "Star",
    ordemCategoria: 1,
  },
  {
    id: "avaliacao-questionarios",
    categoria: "avaliacao",
    titulo: "Criando Questionários de Avaliação",
    subtitulo: "Passo a passo para criar questionários personalizáveis",
    resumo: "Como criar, editar e gerenciar questionários com perguntas e pesos.",
    conteudo: `## Criando Questionários de Avaliação

### Passo a Passo

1. Acesse o módulo **Avaliação de Desempenho** no menu lateral (Gestão de Pessoas)
2. Clique na aba **Questionários**
3. Clique em **Novo Questionário**
4. Preencha:
   - **Título**: Nome do questionário (ex: "Avaliação Trimestral Q1 2026")
   - **Descrição**: Detalhes sobre o propósito

### Adicionando Perguntas

Cada pergunta tem:

| Campo | Descrição |
|-------|-----------|
| **Texto** | A pergunta em si (ex: "O colaborador cumpre prazos?") |
| **Peso** | Importância da pergunta de 1 a 5 (padrão: 1) |
| **Ordem** | Posição da pergunta no questionário |

### Exemplos de Perguntas

**Pilar Técnico:**
- O colaborador demonstra conhecimento técnico adequado para sua função?
- Cumpre as normas de segurança (NRs) no dia a dia?
- Utiliza corretamente os EPIs fornecidos?

**Pilar Comportamental:**
- Trabalha bem em equipe?
- É pontual e assíduo?
- Comunica-se de forma clara com colegas e superiores?

**Pilar Resultados:**
- Entrega as tarefas dentro do prazo?
- Contribui para a produtividade da equipe?
- Apresenta soluções para problemas?

### Dicas

> **Dica**: Use pesos maiores (4-5) para perguntas críticas como segurança e assiduidade.

> **Atenção**: Após vincular um questionário a um ciclo em andamento, ele não pode ser excluído.`,
    tags: ["questionário", "perguntas", "peso", "avaliação", "criar"],
    icone: "ClipboardList",
    ordemCategoria: 2,
  },
  {
    id: "avaliacao-ciclos",
    categoria: "avaliacao",
    titulo: "Gerenciando Ciclos de Avaliação",
    subtitulo: "Como criar, iniciar e encerrar ciclos",
    resumo: "Ciclos definem o período de avaliação e vinculam questionários aos colaboradores.",
    conteudo: `## Gerenciando Ciclos de Avaliação

### O que é um Ciclo?

Um **ciclo de avaliação** é um período definido durante o qual os avaliadores podem avaliar os colaboradores usando um questionário específico.

### Criando um Ciclo

1. Acesse a aba **Ciclos**
2. Clique em **Novo Ciclo**
3. Preencha:

| Campo | Descrição |
|-------|-----------|
| **Título** | Nome do ciclo (ex: "Avaliação Mensal - Janeiro 2026") |
| **Questionário** | Selecione o questionário que será utilizado |
| **Data Início** | Quando as avaliações podem começar |
| **Data Fim** | Prazo final para realizar avaliações |

### Status do Ciclo

| Status | Significado |
|--------|-------------|
| **Rascunho** | Ciclo criado mas ainda não iniciado |
| **Em Andamento** | Avaliações podem ser realizadas |
| **Encerrado** | Prazo finalizado, não aceita novas avaliações |

### Fluxo de Status

\`\`\`
Rascunho → Em Andamento → Encerrado
\`\`\`

### Realizando Avaliações

Quando o ciclo está **Em Andamento**:

1. Clique no ciclo para ver os colaboradores
2. Selecione um colaborador para avaliar
3. Responda cada pergunta com nota de **1 a 5**:
   - 1 = Insatisfatório
   - 2 = Abaixo do esperado
   - 3 = Atende às expectativas
   - 4 = Acima do esperado
   - 5 = Excepcional
4. Clique em **Salvar** (pode continuar depois) ou **Finalizar** (trava a avaliação)

### Cálculo da Nota Final

> **Fórmula**: Nota Final = Σ (Nota × Peso) ÷ Σ Pesos

**Exemplo**: Questionário com 3 perguntas:

| Pergunta | Peso | Nota |
|----------|------|------|
| Conhecimento técnico | 3 | 4 |
| Pontualidade | 2 | 5 |
| Trabalho em equipe | 1 | 3 |

- Numerador: (4×3) + (5×2) + (3×1) = 12 + 10 + 3 = 25
- Denominador: 3 + 2 + 1 = 6
- **Nota Final: 25 ÷ 6 = 4,17**`,
    tags: ["ciclo", "avaliação", "período", "status", "nota", "cálculo"],
    icone: "Clock",
    ordemCategoria: 3,
  },
  {
    id: "avaliacao-ranking",
    categoria: "avaliacao",
    titulo: "Ranking de Colaboradores",
    subtitulo: "Classificação automática por desempenho",
    resumo: "Como funciona o ranking, premiação e identificação de destaques e pontos de atenção.",
    conteudo: `## Ranking de Colaboradores

### Como Funciona

O ranking é gerado automaticamente a partir das notas finais das avaliações. Ele classifica os colaboradores do melhor para o pior desempenho.

### Informações do Ranking

| Coluna | Descrição |
|--------|-----------|
| **Posição** | Classificação (1º, 2º, 3º...) |
| **Colaborador** | Nome completo |
| **Função** | Cargo do colaborador |
| **Nota Média** | Média ponderada de todas as avaliações |
| **Total Avaliações** | Quantas vezes foi avaliado |

### Indicadores Visuais

- 🏆 **Top 3**: Destaque dourado para os 3 melhores
- 🟢 **Nota ≥ 4.0**: Excelente desempenho
- 🟡 **Nota 3.0 - 3.9**: Desempenho satisfatório
- 🔴 **Nota < 3.0**: Atenção necessária

### Uso para Premiação

O ranking serve como base para:

1. **Funcionário do Mês**: Melhor nota no ciclo mensal
2. **Funcionário do Trimestre**: Melhor média nos 3 ciclos mensais
3. **Funcionário do Ano**: Melhor média acumulada no ano
4. **Plano de Desenvolvimento**: Identificar colaboradores que precisam de treinamento

### Filtros Disponíveis

- Por **ciclo** específico
- Por **empresa**
- Por **período** (mês, trimestre, ano)

> **Importante**: O ranking considera apenas avaliações **finalizadas**. Avaliações em rascunho não entram no cálculo.`,
    tags: ["ranking", "classificação", "premiação", "funcionário do mês", "desempenho"],
    icone: "BarChart3",
    ordemCategoria: 4,
  },
  // ============================================================
  // FAQ - PERGUNTAS FREQUENTES
  // ============================================================
  {
    id: "faq-geral",
    categoria: "faq",
    titulo: "Perguntas Frequentes — Geral",
    subtitulo: "Dúvidas mais comuns sobre o sistema",
    resumo: "Respostas para as perguntas mais frequentes sobre o ERP RH & DP.",
    conteudo: `## Perguntas Frequentes — Geral

### Como faço login no sistema?
Acesse o sistema pelo navegador e faça login com suas credenciais. Na primeira vez, use a senha padrão fornecida pelo administrador e altere-a no primeiro acesso.

### Esqueci minha senha, o que faço?
Entre em contato com o administrador do sistema (ADM Master ou ADM) para que ele redefina sua senha.

### Como troco de empresa?
No cabeçalho superior do sistema, há um **seletor de empresa**. Clique nele e selecione a empresa desejada. Todos os dados exibidos serão filtrados pela empresa selecionada.

### O que são os 3 módulos (RH, SST, Jurídico)?
O sistema é dividido em 3 grandes áreas:
- **RH & DP**: Tudo sobre funcionários, ponto, folha, férias, rescisão
- **SST**: Segurança do trabalho — EPIs, CIPA, documentos de segurança
- **Jurídico**: Processos trabalhistas

### Como acesso os dashboards?
No menu lateral, clique em **Dashboards** e escolha o dashboard desejado. Cada dashboard tem filtros por empresa e período.

### Posso acessar de celular?
Sim, o sistema é responsivo e funciona em dispositivos móveis, mas recomendamos o uso em computador para melhor experiência.

### O que é o Raio-X do Funcionário?
É uma ficha completa do colaborador com **timeline** de todos os eventos: admissão, treinamentos, ASOs, advertências, férias, etc. Acesse em Relatórios > Raio-X.

### Como exporto dados para PDF?
A maioria das telas possui um botão de **Imprimir/PDF** no canto superior. Clique nele para gerar o documento.

### O que é a Lista Negra?
É uma lista de funcionários desligados que **não devem ser recontratados**. Quando alguém tenta cadastrar um CPF da Lista Negra, o sistema exibe um alerta.`,
    tags: ["FAQ", "perguntas", "dúvidas", "login", "senha", "empresa", "módulo"],
    icone: "HelpCircle",
    ordemCategoria: 1,
  },
  {
    id: "faq-ponto-folha",
    categoria: "faq",
    titulo: "FAQ — Ponto e Folha de Pagamento",
    subtitulo: "Dúvidas sobre fechamento de ponto e folha",
    resumo: "Respostas sobre upload de arquivos, cálculos de ponto, folha e horas extras.",
    conteudo: `## FAQ — Ponto e Folha de Pagamento

### Como faço o upload do cartão de ponto?
1. Acesse **Fechamento de Ponto** no menu lateral
2. Clique na aba **Uploads**
3. Selecione a categoria **Cartão de Ponto (Dixi XLS)**
4. Arraste o arquivo ou clique para selecionar
5. O sistema processará automaticamente os dados

### Quais formatos de arquivo são aceitos?
| Tipo | Formato | Origem |
|------|---------|--------|
| Cartão de Ponto | .XLS | Sistema Dixi |
| Folha Analítica | .PDF | Contabilidade |
| Folha Sintética | .PDF | Contabilidade |
| Adiantamento | .PDF | Contabilidade |
| Pagamento por Banco | .PDF | Contabilidade |

### Como são calculadas as horas extras?
> **Fórmula**: Valor HE = Valor da Hora × % Acréscimo × Quantidade de Horas

Exemplo: Hora = R$ 15,00, Acréscimo = 50%, Horas = 10
- R$ 15,00 × 1,50 × 10 = **R$ 225,00**

### O que acontece se o funcionário tem mais de 10 faltas no mês?
O sistema exibe um **alerta automático** na aba de Vales/Adiantamentos, indicando que o funcionário faltou mais de 10 dias. O vale precisa de **aprovação** antes de ser liberado.

### Como vejo o custo total de um funcionário?
Acesse a aba **Custo Total Funcionário** no módulo de Ponto e Folha. Lá você verá a previsão de desembolso incluindo: folha + extras + VR/iFood.

### O que é a separação por banco?
O sistema separa os pagamentos por banco (Caixa Econômica e Santander) para facilitar a geração das remessas de pagamento.`,
    tags: ["FAQ", "ponto", "folha", "upload", "horas extras", "faltas", "banco"],
    icone: "HelpCircle",
    ordemCategoria: 2,
  },
  {
    id: "faq-rescisao-ferias",
    categoria: "faq",
    titulo: "FAQ — Rescisão e Férias",
    subtitulo: "Dúvidas sobre cálculos de rescisão e férias",
    resumo: "Respostas sobre aviso prévio, verbas rescisórias, programação de férias e cálculos.",
    conteudo: `## FAQ — Rescisão e Férias

### Como calculo uma rescisão?
1. Acesse **Aviso Prévio** no menu lateral
2. Selecione o colaborador
3. Preencha: tipo de desligamento, data, se o aviso é trabalhado ou indenizado
4. O sistema calcula automaticamente todas as verbas

### Quais verbas são calculadas na rescisão?
| Verba | Descrição |
|-------|-----------|
| Saldo de Salário | Dias trabalhados no último mês |
| Aviso Prévio | Proporcional ao tempo de serviço (30 + 3 dias/ano) |
| 13º Proporcional | Meses trabalhados no ano ÷ 12 |
| Férias Proporcionais + 1/3 | Meses desde último período aquisitivo |
| Férias Vencidas + 1/3 | Se houver período não gozado |
| FGTS + Multa 40% | Estimativa baseada no tempo de serviço |
| VR Proporcional | Dias trabalhados × valor diário |

### Qual a diferença entre aviso trabalhado e indenizado?
- **Trabalhado**: O funcionário cumpre o aviso trabalhando. Prazo de pagamento: 1º dia útil após o término.
- **Indenizado**: O funcionário é dispensado imediatamente. Prazo de pagamento: 10 dias corridos.

### Como programo férias?
1. Acesse **Férias** no menu lateral
2. Selecione o colaborador
3. Defina o período de gozo
4. O sistema calcula automaticamente os valores

### Posso dividir as férias?
Sim, conforme a Reforma Trabalhista (Lei 13.467/2017), as férias podem ser divididas em até **3 períodos**, desde que:
- Um período tenha no mínimo **14 dias corridos**
- Os demais tenham no mínimo **5 dias corridos** cada

### O que é abono pecuniário?
É a "venda" de até **1/3 das férias** (10 dias). O funcionário recebe o valor correspondente e goza apenas 20 dias.

> **Fórmula**: Abono = (Salário ÷ 30) × 10 + 1/3 do abono`,
    tags: ["FAQ", "rescisão", "férias", "aviso prévio", "FGTS", "abono", "cálculo"],
    icone: "HelpCircle",
    ordemCategoria: 3,
  },
  {
    id: "faq-epi-sst",
    categoria: "faq",
    titulo: "FAQ — EPIs e Segurança do Trabalho",
    subtitulo: "Dúvidas sobre controle de EPIs, CIPA e SST",
    resumo: "Respostas sobre catálogo de EPIs, entregas, devoluções, CIPA e documentos de segurança.",
    conteudo: `## FAQ — EPIs e Segurança do Trabalho

### Como cadastro um novo EPI?
1. Acesse **Controle de EPIs** no módulo SST
2. Clique em **Novo EPI**
3. Preencha: nome, categoria (EPI/Uniforme/Calçado), CA, tamanho, validade, estoque

### Qual a diferença entre EPI, Uniforme e Calçado?
| Tipo | Descrição | Exemplos |
|------|-----------|----------|
| **EPI** | Equipamento de Proteção Individual | Capacete, luva, óculos, protetor auricular |
| **Uniforme** | Vestimenta de trabalho | Camisa, calça, colete |
| **Calçado** | Calçado de segurança | Botina, bota, sapato de segurança |

### Como registro a entrega de um EPI?
Na ficha do EPI ou do colaborador, clique em **Registrar Entrega**. Informe: colaborador, quantidade, data e observações.

### O que é o CA (Certificado de Aprovação)?
É o número de certificação do Ministério do Trabalho que garante que o EPI foi testado e aprovado. Todo EPI deve ter CA válido.

### Como funciona a CIPA?
A **CIPA** (Comissão Interna de Prevenção de Acidentes) é obrigatória em empresas com mais de 20 funcionários. O módulo gerencia:
- **Eleições**: Processo eleitoral com datas, inscrições e votação
- **Membros**: Representantes eleitos e indicados
- **Mandato**: Período de atuação (geralmente 1 ano)
- **Estabilidade**: Membros eleitos têm estabilidade de 1 ano após o mandato

### O que é a NR (Norma Regulamentadora)?
São normas do Ministério do Trabalho que estabelecem requisitos de segurança. As mais comuns na construção civil:
- **NR-6**: EPIs
- **NR-10**: Segurança em instalações elétricas
- **NR-18**: Condições de trabalho na construção
- **NR-35**: Trabalho em altura`,
    tags: ["FAQ", "EPI", "uniforme", "calçado", "CIPA", "SST", "NR", "CA"],
    icone: "HelpCircle",
    ordemCategoria: 4,
  },
  // ============================================================
  // ARTIGOS ADICIONAIS - OPERACIONAL
  // ============================================================
  {
    id: "dissidio-reajuste",
    categoria: "operacional",
    titulo: "Dissídio e Reajuste Salarial",
    subtitulo: "Como funciona o módulo de dissídio coletivo",
    resumo: "Entenda como registrar e aplicar reajustes salariais por dissídio coletivo.",
    conteudo: `## Dissídio e Reajuste Salarial

### O que é Dissídio?

O **dissídio coletivo** é o reajuste salarial negociado entre sindicatos de trabalhadores e empregadores. Geralmente ocorre anualmente e define o novo piso salarial da categoria.

### Como Usar no Sistema

1. Acesse **Dissídio** no menu lateral (Tabelas e Configurações)
2. Registre o novo dissídio com:
   - **Data base**: Mês de referência do reajuste
   - **Percentual de reajuste**: % de aumento
   - **Novo piso salarial**: Valor mínimo da categoria
   - **Empresa**: A qual empresa se aplica

### Impacto nos Cálculos

O dissídio afeta diretamente:

| Item | Impacto |
|------|---------|
| **Salário base** | Reajustado pelo percentual |
| **Valor da hora** | Recalculado automaticamente |
| **Horas extras** | Base de cálculo atualizada |
| **Férias** | Valor proporcional reajustado |
| **13º salário** | Proporcional ao novo valor |
| **FGTS** | Depósito sobre novo salário |

### Memorial de Cálculo do Reajuste

> **Fórmula**: Novo Salário = Salário Atual × (1 + % Reajuste ÷ 100)

**Exemplo**: Salário R$ 2.500,00, reajuste de 5,8%:
- R$ 2.500,00 × 1,058 = **R$ 2.645,00**

> **Valor da Hora**: Novo Salário ÷ 220 (jornada mensal padrão)
- R$ 2.645,00 ÷ 220 = **R$ 12,02/hora**`,
    tags: ["dissídio", "reajuste", "salário", "piso", "sindicato", "cálculo"],
    icone: "Landmark",
    ordemCategoria: 6,
  },
  {
    id: "feriados-calendario",
    categoria: "operacional",
    titulo: "Feriados e Calendário",
    subtitulo: "Como gerenciar feriados nacionais e locais",
    resumo: "Cadastro de feriados que impactam o fechamento de ponto e cálculos trabalhistas.",
    conteudo: `## Feriados e Calendário

### Importância dos Feriados

Os feriados impactam diretamente:
- **Fechamento de ponto**: Feriados não são dias úteis
- **Horas extras**: Trabalho em feriado tem acréscimo de 100%
- **Contagem de prazos**: Aviso prévio, férias, etc.

### Como Cadastrar

1. Acesse **Feriados** no menu lateral (Tabelas e Configurações)
2. Clique em **Novo Feriado**
3. Preencha: nome, data, tipo (nacional/estadual/municipal)

### Feriados Nacionais Padrão

| Data | Feriado |
|------|---------|
| 01/01 | Confraternização Universal |
| 21/04 | Tiradentes |
| 01/05 | Dia do Trabalho |
| 07/09 | Independência do Brasil |
| 12/10 | Nossa Senhora Aparecida |
| 02/11 | Finados |
| 15/11 | Proclamação da República |
| 25/12 | Natal |

> **Nota**: Carnaval e Corpus Christi são feriados **facultativos** e dependem de acordo coletivo.

### Impacto no Cálculo de Horas Extras

> **Fórmula**: HE em Feriado = Valor da Hora × 2,0 × Quantidade de Horas

**Exemplo**: Hora = R$ 15,00, trabalhou 8h no feriado:
- R$ 15,00 × 2,0 × 8 = **R$ 240,00**`,
    tags: ["feriado", "calendário", "ponto", "hora extra", "feriado nacional"],
    icone: "Clock",
    ordemCategoria: 7,
  },
  // ============================================================
  // ARTIGOS ADICIONAIS - CONFIGURAÇÕES
  // ============================================================
  {
    id: "lixeira-recuperacao",
    categoria: "configuracoes",
    titulo: "Lixeira e Recuperação de Dados",
    subtitulo: "Como funciona a exclusão e recuperação de registros",
    resumo: "Entenda o sistema de lixeira e como recuperar dados excluídos acidentalmente.",
    conteudo: `## Lixeira e Recuperação de Dados

### Como Funciona

Quando você exclui um registro no sistema (colaborador, EPI, treinamento, etc.), ele não é removido permanentemente. Ele vai para a **Lixeira**, onde pode ser recuperado.

### Acessando a Lixeira

1. No menu lateral, clique em **Lixeira** (seção Administração)
2. Você verá todos os registros excluídos, organizados por tipo

### Ações Disponíveis

| Ação | Descrição |
|------|-----------|
| **Restaurar** | Recupera o registro para o estado original |
| **Excluir Permanentemente** | Remove definitivamente (apenas ADM Master) |

### Prazo de Retenção

Os registros ficam na lixeira por **90 dias**. Após esse período, são excluídos automaticamente.

### Limpeza Geral

Em **Configurações > Limpeza de Dados**, o ADM Master pode:
- Limpar toda a lixeira
- Limpar dados por módulo específico
- A limpeza requer confirmação com senha especial

> **Atenção**: A exclusão permanente é irreversível. Certifique-se antes de confirmar.`,
    tags: ["lixeira", "exclusão", "recuperação", "restaurar", "dados"],
    icone: "Settings",
    ordemCategoria: 3,
  },
  {
    id: "auditoria-sistema",
    categoria: "configuracoes",
    titulo: "Auditoria do Sistema",
    subtitulo: "Rastreamento de todas as ações dos usuários",
    resumo: "Como funciona o log de auditoria e como rastrear alterações no sistema.",
    conteudo: `## Auditoria do Sistema

### O que é Registrado

O sistema registra automaticamente **todas as ações** dos usuários:

| Tipo de Ação | Exemplos |
|--------------|----------|
| **Criação** | Novo colaborador cadastrado, novo EPI registrado |
| **Edição** | Salário alterado, dados pessoais atualizados |
| **Exclusão** | Registro enviado para lixeira |
| **Login/Logout** | Entrada e saída do sistema |
| **Upload** | Arquivos enviados (ponto, folha, documentos) |

### Informações do Log

Cada registro de auditoria contém:
- **Data e Hora**: Momento exato da ação
- **Usuário**: Quem realizou a ação
- **Ação**: O que foi feito (criar, editar, excluir)
- **Módulo**: Em qual parte do sistema
- **Detalhes**: Informações específicas da alteração

### Como Consultar

1. Acesse **Auditoria do Sistema** no menu lateral
2. Use os filtros: período, usuário, tipo de ação, módulo
3. Clique em um registro para ver os detalhes completos

### Quem Pode Acessar

| Perfil | Acesso |
|--------|--------|
| ADM Master | Total — todos os logs |
| ADM | Parcial — logs do seu módulo |
| Operacional | Sem acesso |

> **Importante**: Os logs de auditoria não podem ser alterados ou excluídos por nenhum usuário.`,
    tags: ["auditoria", "log", "rastreamento", "ações", "segurança", "histórico"],
    icone: "Settings",
    ordemCategoria: 4,
  },
  // ============================================================
  // MEMORIAL ADICIONAL - VALE ALIMENTAÇÃO
  // ============================================================
  {
    id: "memorial-vale-alimentacao",
    categoria: "memoriais",
    titulo: "Memorial de Cálculo — Vale Alimentação / VR",
    subtitulo: "Cálculo proporcional e regras de desconto",
    resumo: "Como é calculado o vale alimentação/refeição proporcional aos dias trabalhados.",
    conteudo: `## Memorial de Cálculo — Vale Alimentação / VR

### Cálculo Básico

O Vale Refeição (VR) ou Vale Alimentação (VA) é um benefício concedido por dia útil trabalhado.

> **Fórmula**: VR Mensal = Valor Diário × Dias Úteis Trabalhados

### Proporcionalidade

| Situação | Cálculo |
|----------|---------|
| Mês completo | Valor diário × dias úteis do mês |
| Admissão no meio do mês | Valor diário × dias úteis restantes |
| Demissão no meio do mês | Valor diário × dias úteis trabalhados |
| Faltas | Desconta o VR dos dias faltados |
| Férias | Não recebe VR durante as férias |
| Afastamento | Não recebe VR durante afastamento |

### Exemplo Prático

**Dados**: VR diário = R$ 35,00, mês com 22 dias úteis, funcionário faltou 3 dias

- VR integral: R$ 35,00 × 22 = R$ 770,00
- Desconto faltas: R$ 35,00 × 3 = R$ 105,00
- **VR líquido: R$ 770,00 - R$ 105,00 = R$ 665,00**

### Desconto em Folha

Conforme o PAT (Programa de Alimentação do Trabalhador), o empregador pode descontar até **20%** do valor do benefício do salário do funcionário.

> **Fórmula**: Desconto = VR Total × 20%

**Exemplo**: VR = R$ 770,00
- Desconto: R$ 770,00 × 0,20 = **R$ 154,00**
- Custo empresa: R$ 770,00 - R$ 154,00 = **R$ 616,00**

### Na Rescisão

> **Fórmula**: VR Rescisão = VR Diário × Dias Úteis Trabalhados no Último Mês

**Base Legal**: Lei 6.321/1976 (PAT) + Decreto 5/1991`,
    tags: ["vale", "VR", "VA", "alimentação", "refeição", "cálculo", "desconto", "PAT"],
    icone: "Calculator",
    ordemCategoria: 6,
  },
  // ============================================================
  // GESTÃO DE PESSOAS - PJ MEDIÇÕES
  // ============================================================
  {
    id: "pj-medicoes",
    categoria: "gestao-pessoas",
    titulo: "Medições de Contratos PJ",
    subtitulo: "Como registrar e acompanhar medições de prestadores",
    resumo: "Controle de medições mensais de contratos PJ com valores e status de pagamento.",
    conteudo: `## Medições de Contratos PJ

### O que são Medições?

As **medições** são os registros mensais de serviços prestados por empresas PJ (Pessoa Jurídica) contratadas. Cada medição corresponde a um período de trabalho e um valor a ser pago.

### Como Registrar

1. Acesse **PJ Medições** no menu lateral
2. Clique em **Nova Medição**
3. Preencha:

| Campo | Descrição |
|-------|-----------|
| **Contrato PJ** | Selecione o contrato vinculado |
| **Competência** | Mês/ano de referência |
| **Valor** | Valor da medição |
| **Descrição** | Detalhes dos serviços prestados |
| **Nota Fiscal** | Número da NF emitida |

### Status da Medição

| Status | Significado |
|--------|-------------|
| **Pendente** | Medição registrada, aguardando aprovação |
| **Aprovada** | Aprovada pelo gestor, aguardando pagamento |
| **Paga** | Pagamento realizado |
| **Cancelada** | Medição cancelada |

### Relatórios

O módulo gera relatórios de:
- Total de medições por contrato
- Evolução mensal de custos PJ
- Comparativo entre contratos
- Previsão de desembolso

> **Dica**: Vincule sempre a nota fiscal à medição para controle fiscal completo.`,
    tags: ["PJ", "medição", "contrato", "prestador", "nota fiscal", "pagamento"],
    icone: "FileSignature",
    ordemCategoria: 4,
  },
];
