// ============================================================
// BIBLIOTECA DE CONHECIMENTO - CONTEÚDO COMPLETO
// Cada artigo tem: id, categoria, título, resumo, conteúdo (markdown), tags, icone
// ============================================================

export type ArtigoCategoria =
  | "inicio"
  | "cadastro"
  | "operacional"
  | "gestao-pessoas"
  | "sst"
  | "juridico"
  | "dashboards"
  | "memoriais"
  | "configuracoes"
  | "avaliacao"
  | "faq"
  | "glossario";

export interface Artigo {
  id: string;
  categoria: ArtigoCategoria;
  titulo: string;
  subtitulo?: string;
  resumo: string;
  conteudo: string;
  tags: string[];
  icone: string; // lucide icon name
  ordemCategoria: number;
  screenshots?: string[]; // URLs das imagens
}

export const CATEGORIAS: Record<ArtigoCategoria, { label: string; descricao: string; icone: string; cor: string }> = {
  "inicio": { label: "Primeiros Passos", descricao: "Como começar a usar o sistema", icone: "Rocket", cor: "blue" },
  "cadastro": { label: "Cadastros", descricao: "Empresas, colaboradores, obras, setores e funções", icone: "Database", cor: "emerald" },
  "operacional": { label: "Operacional", descricao: "Ponto, folha, documentos, vale alimentação, hora extra", icone: "Clock", cor: "amber" },
  "gestao-pessoas": { label: "Gestão de Pessoas", descricao: "Aviso prévio, férias, contratos PJ, medições", icone: "Users", cor: "purple" },
  "sst": { label: "SST", descricao: "EPIs, CIPA e segurança do trabalho", icone: "Shield", cor: "green" },
  "juridico": { label: "Jurídico", descricao: "Processos trabalhistas e gestão jurídica", icone: "Gavel", cor: "red" },
  "dashboards": { label: "Dashboards", descricao: "Gráficos, indicadores e relatórios visuais", icone: "BarChart3", cor: "cyan" },
  "memoriais": { label: "Memoriais de Cálculo", descricao: "Fórmulas, exemplos e bases legais dos cálculos", icone: "Calculator", cor: "orange" },
  "configuracoes": { label: "Configurações", descricao: "Usuários, permissões, auditoria e ajustes do sistema", icone: "Settings", cor: "slate" },
  "avaliacao": { label: "Avaliação de Desempenho", descricao: "Questionários, ciclos, ranking e avaliações de colaboradores", icone: "Star", cor: "yellow" },
  "faq": { label: "FAQ", descricao: "Perguntas frequentes sobre o sistema", icone: "MessageCircle", cor: "pink" },
  "glossario": { label: "Glossário", descricao: "Termos técnicos de RH e DP explicados", icone: "BookA", cor: "indigo" },
};


import { ARTIGOS_PARTE2 } from "./bibliotecaArtigos2";

const _ARTIGOS_BASE: Artigo[] = [
  // ============================================================
  // PRIMEIROS PASSOS
  // ============================================================
  {
    id: "visao-geral",
    categoria: "inicio",
    titulo: "Visão Geral do Sistema",
    subtitulo: "Conheça o ERP - Gestão Integrada",
    resumo: "Entenda a estrutura do sistema, seus módulos e como navegar entre eles.",
    conteudo: `## Visão Geral do Sistema

O **ERP RH & DP** é um sistema integrado de gestão de Recursos Humanos e Departamento Pessoal que centraliza todas as operações de RH em uma única plataforma.

### Módulos Disponíveis

O sistema é dividido em **3 grandes módulos**:

| Módulo | Descrição | Cor |
|--------|-----------|-----|
| **RH & DP** | Recursos Humanos e Departamento Pessoal — cadastros, ponto, folha, férias, rescisão | 🔵 Azul |
| **SST** | Saúde e Segurança do Trabalho — EPIs, CIPA, documentos de segurança | 🟢 Verde |
| **Jurídico** | Departamento Jurídico — processos trabalhistas | 🟡 Âmbar |

### Como Navegar

1. **Hub de Módulos**: Ao entrar no sistema, você verá o Hub com os 3 módulos. Clique em um para acessar.
2. **Menu Lateral**: Dentro de cada módulo, o menu lateral mostra todas as funcionalidades disponíveis.
3. **Seletor de Módulo**: No topo do menu lateral, você pode trocar de módulo sem voltar ao Hub.
4. **Seletor de Empresa**: No cabeçalho superior, selecione a empresa que deseja gerenciar.

### Perfis de Acesso

| Perfil | Descrição |
|--------|-----------|
| **ADM Master** | Acesso total ao sistema, cria outros administradores |
| **ADM** | Gerencia módulos, cadastra colaboradores, configura o sistema |
| **Operacional** | Acesso restrito aos módulos do dia a dia |
| **Avaliador** | Acesso exclusivo ao módulo de Avaliação de Desempenho |
| **Consulta** | Visualização de dashboards e relatórios sem edição |

> **Dica**: A empresa padrão pode ser definida clicando na estrela ⭐ na página de Empresas. Ao entrar no sistema, ela será selecionada automaticamente.`,
    tags: ["visão geral", "módulos", "navegação", "perfis", "acesso"],
    icone: "LayoutDashboard",
    ordemCategoria: 1,
  },
  {
    id: "primeiro-acesso",
    categoria: "inicio",
    titulo: "Primeiro Acesso ao Sistema",
    subtitulo: "Login, senha padrão e troca de senha",
    resumo: "Como fazer login pela primeira vez e configurar sua senha.",
    conteudo: `## Primeiro Acesso ao Sistema

### Login

1. Acesse o endereço do sistema no navegador
2. Na tela de login, insira seu **usuário** e **senha**
3. Clique em **Entrar**

### Senha Padrão

Ao ser cadastrado no sistema, todo novo usuário recebe a senha padrão:

> **Senha padrão**: \`fc2026\`

### Troca de Senha

É altamente recomendável trocar a senha no primeiro acesso:

1. Após fazer login, clique no seu **avatar** no canto inferior esquerdo do menu
2. Selecione **Trocar Senha**
3. Digite a senha atual e a nova senha
4. Confirme a nova senha
5. Clique em **Salvar**

### Problemas de Acesso

Se você esqueceu sua senha ou está com problemas para acessar:
- Solicite ao **Administrador** do sistema que redefina sua senha
- O administrador pode resetar a senha para a padrão (\`fc2026\`) na tela de **Usuários e Permissões**`,
    tags: ["login", "senha", "primeiro acesso", "trocar senha"],
    icone: "LogIn",
    ordemCategoria: 2,
  },
  {
    id: "hub-modulos",
    categoria: "inicio",
    titulo: "Hub de Módulos",
    subtitulo: "A tela inicial do sistema",
    resumo: "Como funciona a tela inicial com os cards dos módulos RH, SST e Jurídico.",
    conteudo: `## Hub de Módulos

O Hub de Módulos é a **tela inicial** do sistema. Ele apresenta os módulos disponíveis em formato de cards visuais.

### Como Funciona

Ao fazer login, você é direcionado ao Hub. Cada card representa um módulo:

- **RH & DP** (azul) — Clique para acessar Recursos Humanos e Departamento Pessoal
- **SST** (verde) — Clique para acessar Saúde e Segurança do Trabalho
- **Jurídico** (âmbar) — Clique para acessar o Departamento Jurídico

### Funcionalidades do Hub

- Cada card mostra o **nome do módulo**, uma **descrição** e a **quantidade de funcionalidades** disponíveis
- Módulos que você **não tem permissão** para acessar não serão exibidos
- Clique em qualquer card para entrar no módulo e ver o menu lateral completo

### Voltando ao Hub

Para voltar ao Hub a qualquer momento:
- Clique no **logo** no topo do menu lateral
- Ou clique no nome **"Gestão Integrada"** no cabeçalho do menu`,
    tags: ["hub", "módulos", "tela inicial", "cards"],
    icone: "Grid2X2",
    ordemCategoria: 3,
  },

  // ============================================================
  // CADASTROS
  // ============================================================
  {
    id: "cadastro-empresas",
    categoria: "cadastro",
    titulo: "Cadastro de Empresas",
    subtitulo: "Multi-tenant: gerenciando múltiplas empresas",
    resumo: "Como cadastrar, editar e gerenciar empresas no sistema.",
    conteudo: `## Cadastro de Empresas

O sistema é **multi-tenant**, ou seja, permite gerenciar múltiplas empresas em uma única instalação. Cada empresa tem seus próprios colaboradores, obras, setores e dados isolados.

### Como Cadastrar uma Nova Empresa

1. Acesse **Cadastro > Empresas** no menu lateral
2. Clique no botão **+ Nova Empresa**
3. Preencha os campos obrigatórios:
   - **CNPJ** — O sistema valida automaticamente os dígitos verificadores
   - **Razão Social** — Nome oficial da empresa
4. Campos opcionais: Nome Fantasia, Endereço, Cidade, Estado, CEP, Telefone, E-mail
5. Clique em **Salvar**

### Busca Automática por CNPJ

Ao digitar o CNPJ, o sistema consulta automaticamente a **BrasilAPI** e preenche os dados da empresa (razão social, endereço, etc.).

### Empresa Padrão

- Clique na **estrela ⭐** ao lado do nome da empresa para defini-la como padrão
- A empresa padrão será selecionada automaticamente ao entrar no sistema
- Você pode trocar a empresa ativa a qualquer momento pelo seletor no cabeçalho

### Logo da Empresa

- Cada empresa pode ter um **logo** que aparece no cabeçalho quando selecionada
- Para adicionar, edite a empresa e faça upload do logo

> **Importante**: Apenas usuários com perfil **ADM Master** podem criar e excluir empresas.`,
    tags: ["empresa", "CNPJ", "multi-tenant", "cadastro", "logo"],
    icone: "Building2",
    ordemCategoria: 1,
  },
  {
    id: "cadastro-colaboradores",
    categoria: "cadastro",
    titulo: "Cadastro de Colaboradores",
    subtitulo: "Ficha completa do funcionário",
    resumo: "Como cadastrar colaboradores com todos os dados pessoais, documentos e informações profissionais.",
    conteudo: `## Cadastro de Colaboradores

O cadastro de colaboradores é o **coração do sistema**. Todos os módulos utilizam a base de colaboradores para suas operações.

### Abas do Formulário

O formulário de cadastro é dividido em **5 abas**:

#### 1. Pessoal
- Nome Completo, CPF, RG, Data de Nascimento
- Sexo, Estado Civil, Nacionalidade
- Nome da Mãe, Nome do Pai
- Escolaridade, PIS/PASEP

#### 2. Documentos
- CTPS (Número e Série)
- Título de Eleitor
- Certificado de Reservista
- CNH (Número, Categoria, Validade)
- Passaporte

#### 3. Endereço
- CEP (busca automática via ViaCEP)
- Logradouro, Número, Complemento
- Bairro, Cidade, Estado

#### 4. Profissional
- Empresa (seletor)
- Data de Admissão
- Função (seletor vinculado à empresa)
- Setor (seletor vinculado à empresa)
- Tipo de Contrato (CLT, PJ, Temporário, Estagiário, Aprendiz)
- Salário Base, Valor da Hora
- Jornada de Trabalho (Entrada, Intervalo, Saída)
- Obra de Alocação

#### 5. Bancário
- Banco de Recebimento (Caixa, Santander, Bradesco, Itaú, BB, Nubank, Inter, C6)
- Tipo de Conta (Salário, Corrente, Poupança)
- Agência e Número da Conta
- Dados PIX (Tipo de Chave e Chave)

### Status do Colaborador

| Status | Descrição |
|--------|-----------|
| **Ativo** | Funcionário em atividade normal |
| **Férias** | Em período de férias |
| **Afastado** | Afastado por motivo médico ou outro |
| **Licença** | Em licença (maternidade, paternidade, etc.) |
| **Desligado** | Funcionário desligado da empresa |
| **Recluso** | Em situação de reclusão |

### Busca de Colaboradores

- Use o campo de busca para pesquisar por **Nome**, **CPF** ou **RG**
- A busca é instantânea e filtra a lista em tempo real

### Busca Automática de Endereço

Ao digitar o **CEP**, o sistema consulta automaticamente o **ViaCEP** e preenche: logradouro, bairro, cidade e estado.

> **Atenção**: O sistema verifica automaticamente se o CPF já está cadastrado e se o funcionário está na **Lista Negra** (proibido de recontratação).`,
    tags: ["colaborador", "funcionário", "cadastro", "CPF", "admissão", "ficha"],
    icone: "Users",
    ordemCategoria: 2,
  },
  {
    id: "cadastro-obras",
    categoria: "cadastro",
    titulo: "Cadastro de Obras",
    subtitulo: "Gerenciamento de obras e canteiros",
    resumo: "Como cadastrar obras, vincular funcionários e gerenciar canteiros.",
    conteudo: `## Cadastro de Obras

As obras são os **locais de trabalho** onde os colaboradores são alocados. Cada obra pertence a uma empresa.

### Como Cadastrar uma Obra

1. Acesse **Cadastro > Obras** no menu lateral
2. Clique em **+ Nova Obra**
3. Preencha:
   - **Nome da Obra** (obrigatório)
   - **Endereço** da obra
   - **Status**: Planejamento, Em Andamento, Concluída, Paralisada
   - **Data de Início** e **Previsão de Término**
   - **Responsável** pela obra
4. Clique em **Salvar**

### Vinculação de Funcionários

- Cada colaborador pode ser alocado a uma obra no seu cadastro (aba Profissional)
- A alocação é usada para:
  - Rateio de horas por obra
  - Controle de ponto por canteiro
  - Relatórios de custo por obra

### Relógios de Ponto (SN)

- Cada obra pode ter relógios de ponto vinculados pelo **número de série (SN)**
- O SN identifica de qual obra vieram as batidas de ponto`,
    tags: ["obra", "canteiro", "alocação", "SN", "relógio"],
    icone: "Landmark",
    ordemCategoria: 3,
  },
  {
    id: "cadastro-setores-funcoes",
    categoria: "cadastro",
    titulo: "Setores e Funções",
    subtitulo: "Organograma da empresa",
    resumo: "Como cadastrar setores e funções para organizar os colaboradores.",
    conteudo: `## Setores e Funções

Setores e Funções são cadastros auxiliares que organizam os colaboradores dentro da empresa.

### Setores

Os setores representam as **áreas/departamentos** da empresa:
- Administrativo, Engenharia, Produção, RH, Financeiro, etc.

**Como cadastrar:**
1. Acesse **Cadastro > Setores**
2. Clique em **+ Novo Setor**
3. Digite o nome do setor
4. Clique em **Salvar**

### Funções

As funções representam os **cargos/ocupações** dos colaboradores:
- Engenheiro Civil, Pedreiro, Eletricista, Coordenador, etc.

**Como cadastrar:**
1. Acesse **Cadastro > Funções**
2. Clique em **+ Nova Função**
3. Digite o nome da função
4. Clique em **Salvar**

### Vinculação

- Ao cadastrar um colaborador, os campos **Setor** e **Função** são seletores que puxam os cadastros acima
- Cada empresa tem seus próprios setores e funções
- Isso garante padronização e evita erros de digitação

> **Dica**: Cadastre os setores e funções **antes** de cadastrar os colaboradores para agilizar o processo.`,
    tags: ["setor", "função", "cargo", "departamento", "organograma"],
    icone: "Layers",
    ordemCategoria: 4,
  },

  // ============================================================
  // OPERACIONAL
  // ============================================================
  {
    id: "fechamento-ponto",
    categoria: "operacional",
    titulo: "Fechamento de Ponto",
    subtitulo: "Importação, visualização e ajuste do cartão de ponto",
    resumo: "Como importar batidas de ponto, visualizar inconsistências e fazer ajustes.",
    conteudo: `## Fechamento de Ponto

O módulo de Fechamento de Ponto permite importar, visualizar e ajustar os registros de ponto dos colaboradores.

### Importação de Dados

O sistema aceita arquivos de ponto no formato **XLS** (exportados do sistema Dixi ou similar):

1. Acesse **Operacional > Fechamento de Ponto**
2. Selecione o **mês de referência**
3. Clique em **Importar Arquivo**
4. Selecione o arquivo XLS do cartão de ponto
5. O sistema processa automaticamente as batidas

### Visualização do Ponto

Após a importação, você pode visualizar:

- **Lista de funcionários** com resumo do mês (horas trabalhadas, extras, faltas)
- **Detalhe por funcionário** — clique no nome para ver dia a dia
- **Jornada de trabalho** — exibe os horários de entrada/saída organizados por dia da semana

### Inconsistências

O sistema identifica automaticamente inconsistências:

| Tipo | Descrição |
|------|-----------|
| **Batida ímpar** | Número ímpar de batidas no dia |
| **Falta de batida** | Dia sem registro de ponto |
| **Horário divergente** | Batida fora do horário esperado |
| **Batida duplicada** | Duas batidas no mesmo horário |
| **Sem registro** | Dia útil sem nenhum registro |

### Ajuste Rápido

Ao clicar no badge **"Inconsistente"** na tabela de detalhe:

1. Abre um modal com os campos de horário **pré-preenchidos**
2. Campos faltantes são destacados em **amarelo**
3. Selecione o **motivo** (Esqueceu de bater, Saiu mais cedo, Ficou doente, etc.)
4. Adicione uma **descrição** se necessário
5. Clique em **Salvar Ajuste**

### Critério de Falta

> Uma **falta** é contabilizada quando o funcionário não tem **nenhuma batida** registrada em um dia útil completo (não é feriado nem fim de semana).`,
    tags: ["ponto", "batida", "inconsistência", "falta", "ajuste", "importação"],
    icone: "Clock",
    ordemCategoria: 1,
  },
  {
    id: "folha-pagamento",
    categoria: "operacional",
    titulo: "Folha de Pagamento",
    subtitulo: "Importação e visualização da folha",
    resumo: "Como importar e visualizar os dados da folha de pagamento.",
    conteudo: `## Folha de Pagamento

O módulo de Folha de Pagamento permite importar e visualizar os dados da folha processada pela contabilidade.

### Abas do Módulo

| Aba | Descrição |
|-----|-----------|
| **Uploads** | Upload de arquivos da contabilidade (9 categorias) |
| **Cartão de Ponto** | Visualização por funcionário/mês |
| **Folha de Pagamento** | Espelho analítico e sintético |
| **Pagamentos Extras** | Diferença de salário, horas extras com % acréscimo |
| **Vales/Adiantamentos** | Lista com aprovação, alerta para >10 faltas |
| **VR/iFood** | Benefícios de alimentação por funcionário |
| **Custo Total** | Previsão de desembolso (folha + extras + VR) |

### Categorias de Upload

O sistema aceita 9 tipos de arquivos:

1. Cartão de Ponto (XLS)
2. Espelho Adiantamento Analítico (PDF)
3. Adiantamento Sintético (PDF)
4. Adiantamento por Banco CEF (PDF)
5. Adiantamento por Banco Santander (PDF)
6. Espelho Folha Analítico (PDF)
7. Folha Sintético (PDF)
8. Pagamento por Banco CEF (PDF)
9. Pagamento por Banco Santander (PDF)

### Pagamentos Extras

Para registrar pagamentos extras (diferença de salário, horas extras):
1. Acesse a aba **Pagamentos Extras**
2. Clique em **+ Novo Pagamento**
3. Selecione o funcionário, tipo, valor e % de acréscimo
4. O sistema calcula automaticamente o valor final

> **Importante**: O cálculo de horas extras usa a fórmula: **Valor Hora × % Acréscimo × Quantidade de Horas**`,
    tags: ["folha", "pagamento", "upload", "holerite", "adiantamento", "vale"],
    icone: "Wallet",
    ordemCategoria: 2,
  },
  {
    id: "solicitacao-hora-extra",
    categoria: "operacional",
    titulo: "Solicitação de Hora Extra",
    subtitulo: "Como solicitar e aprovar horas extras",
    resumo: "Processo de solicitação, aprovação e controle de horas extras.",
    conteudo: `## Solicitação de Hora Extra

O módulo de Solicitação de Hora Extra permite registrar, aprovar e controlar as horas extras dos colaboradores.

### Como Solicitar

1. Acesse **Operacional > Solicitação de Hora Extra**
2. Clique em **+ Nova Solicitação**
3. Preencha:
   - **Funcionário** — selecione da lista
   - **Data** da hora extra
   - **Hora Início** e **Hora Fim**
   - **Motivo** da hora extra
   - **Obra** onde será realizada
4. Clique em **Salvar**

### Fluxo de Aprovação

| Status | Descrição |
|--------|-----------|
| **Pendente** | Aguardando aprovação do gestor |
| **Aprovada** | Hora extra aprovada |
| **Rejeitada** | Hora extra rejeitada com justificativa |

### Percentuais de Acréscimo

| Tipo | Percentual | Base Legal |
|------|-----------|------------|
| Hora Extra Comum (dia útil) | 50% | Art. 59, §1º CLT |
| Hora Extra Domingo/Feriado | 100% | Art. 70 CLT |
| Hora Noturna (22h às 5h) | 20% adicional | Art. 73 CLT |

### Cálculo

> **Valor HE** = Valor da Hora × (1 + % Acréscimo) × Quantidade de Horas

**Exemplo**: Funcionário com hora de R$ 15,00, fazendo 2h extras em dia útil:
- R$ 15,00 × 1,50 × 2 = **R$ 45,00**`,
    tags: ["hora extra", "HE", "solicitação", "aprovação", "percentual"],
    icone: "Clock",
    ordemCategoria: 3,
  },
  {
    id: "controle-documentos",
    categoria: "operacional",
    titulo: "Controle de Documentos",
    subtitulo: "Vencimentos, alertas e gestão documental",
    resumo: "Como controlar vencimentos de documentos e receber alertas automáticos.",
    conteudo: `## Controle de Documentos

O módulo de Controle de Documentos permite gerenciar todos os documentos dos colaboradores com alertas de vencimento.

### Tipos de Documentos

- ASOs (Atestados de Saúde Ocupacional)
- Treinamentos e Certificações (NR-10, NR-35, etc.)
- CNH
- Certificados diversos

### Como Funciona

1. Acesse **Operacional > Controle de Documentos**
2. Visualize a lista de documentos com seus **status de vencimento**:
   - 🟢 **Válido** — documento dentro da validade
   - 🟡 **Vencendo** — documento próximo do vencimento (30 dias)
   - 🔴 **Vencido** — documento com validade expirada

### Alertas

O sistema gera alertas automáticos para documentos próximos do vencimento, permitindo ação preventiva.

> **Dica**: Mantenha os documentos sempre atualizados para evitar problemas em fiscalizações e auditorias.`,
    tags: ["documento", "vencimento", "ASO", "treinamento", "certificado", "alerta"],
    icone: "FolderOpen",
    ordemCategoria: 4,
  },
  {
    id: "vale-alimentacao",
    categoria: "operacional",
    titulo: "Vale Alimentação",
    subtitulo: "Configuração e controle de VR/VA",
    resumo: "Como configurar e controlar os benefícios de alimentação por obra.",
    conteudo: `## Vale Alimentação

O módulo de Vale Alimentação permite configurar e controlar os benefícios de alimentação (VR/VA/iFood) por obra.

### Configuração por Obra

Os valores de VR são configurados por obra nas **Configurações > Benefícios de Alimentação**:

1. Acesse **Configurações** no menu lateral
2. Vá na aba **Benefícios de Alimentação**
3. Clique em **+ Novo Benefício**
4. Selecione a **Obra**, o **Tipo** (VR, VA, iFood) e o **Valor Diário**
5. Clique em **Salvar**

### Cálculo Proporcional

O VR é calculado proporcionalmente aos dias trabalhados:

> **VR Mensal** = Valor Diário × Dias Úteis Trabalhados no Mês

**Exemplo**: VR diário de R$ 30,00, funcionário trabalhou 22 dias:
- R$ 30,00 × 22 = **R$ 660,00**

Se o funcionário faltou 3 dias:
- R$ 30,00 × 19 = **R$ 570,00**

### Impacto na Rescisão

Na rescisão, o VR proporcional é calculado automaticamente com base nos dias trabalhados no último mês.`,
    tags: ["vale", "alimentação", "VR", "VA", "iFood", "benefício"],
    icone: "UtensilsCrossed",
    ordemCategoria: 5,
  },

  // ============================================================
  // GESTÃO DE PESSOAS
  // ============================================================
  {
    id: "aviso-previo",
    categoria: "gestao-pessoas",
    titulo: "Aviso Prévio e Rescisão",
    subtitulo: "Cálculo completo de rescisão CLT",
    resumo: "Como registrar aviso prévio e calcular a rescisão trabalhista completa.",
    conteudo: `## Aviso Prévio e Rescisão

O módulo de Aviso Prévio permite registrar o desligamento de colaboradores e calcular automaticamente todos os valores rescisórios conforme a CLT.

### Como Registrar

1. Acesse **Gestão de Pessoas > Aviso Prévio**
2. Clique em **+ Novo Aviso Prévio**
3. Selecione o **Colaborador**
4. Preencha:
   - **Data de Início** do aviso prévio (= data de desligamento)
   - **Tipo**: Trabalhado ou Indenizado
   - **Motivo**: Sem justa causa, Pedido de demissão, Justa causa, Acordo mútuo
   - **Dias Trabalhados** no último mês (ajuste opcional)
5. Clique em **Calcular Previsão**

### Valores Calculados Automaticamente

| Verba | Descrição |
|-------|-----------|
| **Saldo de Salário** | Proporcional aos dias trabalhados no mês |
| **Aviso Prévio Proporcional** | 30 dias + 3 dias por ano (Lei 12.506/2011) |
| **13º Proporcional** | Meses trabalhados no ano ÷ 12 |
| **Férias Proporcionais + 1/3** | Meses desde último período aquisitivo |
| **Férias Vencidas + 1/3** | Se houver período vencido |
| **VR Proporcional** | Dias trabalhados × VR diário |
| **FGTS + Multa 40%** | Estimativa informativa |

### Data Limite de Pagamento

Conforme **Art. 477, §6º da CLT**:
- **Aviso trabalhado**: até o 1º dia útil após o término
- **Aviso indenizado**: até 10 dias corridos após a notificação

> **Veja também**: [Memorial de Cálculo da Rescisão](#memorial-rescisao) para detalhes completos das fórmulas.`,
    tags: ["aviso prévio", "rescisão", "desligamento", "CLT", "FGTS", "multa"],
    icone: "AlertTriangle",
    ordemCategoria: 1,
  },
  {
    id: "ferias",
    categoria: "gestao-pessoas",
    titulo: "Férias",
    subtitulo: "Programação e controle de férias",
    resumo: "Como programar férias, calcular períodos aquisitivos e controlar vencimentos.",
    conteudo: `## Férias

O módulo de Férias permite programar, controlar e acompanhar os períodos de férias dos colaboradores.

### Período Aquisitivo

O período aquisitivo é o período de **12 meses** de trabalho que dá direito a férias:

- Após 12 meses de trabalho, o funcionário adquire o direito a **30 dias** de férias
- O empregador tem mais **12 meses** (período concessivo) para conceder as férias
- Se não conceder no prazo, deve pagar em **dobro** (Art. 137 CLT)

### Como Programar Férias

1. Acesse **Gestão de Pessoas > Férias**
2. Clique em **+ Programar Férias**
3. Selecione o **Colaborador**
4. Defina:
   - **Data de Início** das férias
   - **Quantidade de Dias** (mínimo 5 dias por período, conforme Reforma Trabalhista)
   - **Abono Pecuniário** (venda de até 1/3 das férias — 10 dias)
5. Clique em **Salvar**

### Fracionamento (Reforma Trabalhista - Lei 13.467/2017)

As férias podem ser fracionadas em até **3 períodos**:
- Um deles não pode ser inferior a **14 dias corridos**
- Os demais não podem ser inferiores a **5 dias corridos** cada

### Cálculo de Férias

> **Valor das Férias** = (Salário ÷ 30) × Dias de Férias + 1/3 Constitucional

**Exemplo**: Salário de R$ 3.000,00, 30 dias de férias:
- Férias: R$ 3.000,00
- 1/3: R$ 1.000,00
- **Total: R$ 4.000,00**`,
    tags: ["férias", "período aquisitivo", "abono", "fracionamento", "1/3"],
    icone: "Palmtree",
    ordemCategoria: 2,
  },
  {
    id: "modulo-pj",
    categoria: "gestao-pessoas",
    titulo: "Contratos PJ",
    subtitulo: "Gestão de prestadores de serviço",
    resumo: "Como gerenciar contratos PJ, medições e pagamentos.",
    conteudo: `## Contratos PJ

O módulo PJ permite gerenciar contratos com prestadores de serviço (Pessoa Jurídica).

### Cadastro de Contrato

1. Acesse **Gestão de Pessoas > Contratos PJ**
2. Clique em **+ Novo Contrato**
3. Preencha os dados do contrato:
   - Prestador (vinculado ao cadastro de colaboradores com tipo "PJ")
   - Valor mensal ou por medição
   - Vigência (início e fim)
   - Obra vinculada
4. Clique em **Salvar**

### Medições PJ

As medições são os registros de serviços prestados para pagamento:

1. Acesse **PJ Medições**
2. Clique em **+ Nova Medição**
3. Selecione o contrato, período e valor medido
4. Anexe documentos comprobatórios se necessário
5. Clique em **Salvar**

### Acompanhamento

- Visualize todos os contratos ativos e encerrados
- Acompanhe o histórico de medições e pagamentos
- Controle a vigência e renovações`,
    tags: ["PJ", "contrato", "prestador", "medição", "pagamento"],
    icone: "FileSignature",
    ordemCategoria: 3,
  },

  // ============================================================
  // SST
  // ============================================================
  {
    id: "controle-epis",
    categoria: "sst",
    titulo: "Controle de EPIs",
    subtitulo: "Catálogo, entregas, devoluções e descontos",
    resumo: "Como gerenciar EPIs, uniformes e calçados com controle de entregas e descontos.",
    conteudo: `## Controle de EPIs

O módulo de EPIs (Equipamentos de Proteção Individual) permite gerenciar todo o ciclo de vida dos equipamentos de segurança.

### Catálogo de EPIs

O catálogo contém todos os EPIs, uniformes e calçados disponíveis:

| Categoria | Exemplos |
|-----------|----------|
| **EPI** | Capacete, óculos, luvas, protetor auricular |
| **Uniforme** | Camisa, calça, jaleco, colete |
| **Calçado** | Botina, bota, sapato de segurança |

### Entregas

Para registrar uma entrega de EPI:
1. Selecione o **funcionário**
2. Selecione o **EPI** do catálogo
3. Informe a **quantidade** e **data de entrega**
4. O funcionário assina digitalmente o recebimento

### Devoluções

Quando o funcionário devolve um EPI:
1. Localize a entrega no histórico
2. Clique em **Registrar Devolução**
3. Informe a **data** e o **estado** do equipamento

### Descontos

Se o EPI for perdido ou danificado por negligência:
- O sistema permite registrar um **desconto** no valor do EPI
- Descontos **cancelados** aparecem com ~~tachado em cinza~~ e **NÃO** são deduzidos da folha

> **Importante**: Descontos cancelados nunca afetam o pagamento do funcionário. Apenas descontos com status "Ativo" são considerados na folha.

### Dashboard de EPIs

O dashboard mostra:
- Total de EPIs em estoque
- Entregas por período
- EPIs mais utilizados
- Custo total por obra`,
    tags: ["EPI", "uniforme", "calçado", "entrega", "devolução", "desconto", "segurança"],
    icone: "HardHat",
    ordemCategoria: 1,
  },
  {
    id: "cipa",
    categoria: "sst",
    titulo: "CIPA",
    subtitulo: "Comissão Interna de Prevenção de Acidentes",
    resumo: "Como gerenciar eleições, membros e mandatos da CIPA.",
    conteudo: `## CIPA

O módulo CIPA permite gerenciar as eleições, membros e mandatos da Comissão Interna de Prevenção de Acidentes.

### Eleições

Para registrar uma eleição CIPA:
1. Acesse **SST > CIPA**
2. Clique em **+ Nova Eleição**
3. Preencha:
   - Período de inscrição (início e fim)
   - Data da eleição
   - Mandato (início e fim)
4. Clique em **Salvar**

### Membros

Após a eleição, cadastre os membros:
1. Clique em **+ Novo Membro**
2. Selecione o **funcionário** e a **eleição**
3. Defina:
   - **Representação**: Empregados ou Empregador
   - **Cargo**: Presidente, Vice-Presidente, Secretário, Titular, Suplente
   - **Período de Estabilidade** (início e fim)

### Estabilidade CIPA

Os membros eleitos pelos empregados têm **estabilidade provisória** no emprego:
- Desde o registro da candidatura até **1 ano após o fim do mandato**
- O sistema registra automaticamente esse período na timeline do Raio-X do funcionário

> **Base Legal**: Art. 10, II, "a" do ADCT da Constituição Federal`,
    tags: ["CIPA", "eleição", "membro", "estabilidade", "mandato", "segurança"],
    icone: "Shield",
    ordemCategoria: 2,
  },

  // ============================================================
  // JURÍDICO
  // ============================================================
  {
    id: "processos-trabalhistas",
    categoria: "juridico",
    titulo: "Processos Trabalhistas",
    subtitulo: "Gestão de processos judiciais",
    resumo: "Como cadastrar e acompanhar processos trabalhistas.",
    conteudo: `## Processos Trabalhistas

O módulo de Processos Trabalhistas permite cadastrar e acompanhar todos os processos judiciais da empresa.

### Cadastro de Processo

1. Acesse **Jurídico > Processos Trabalhistas**
2. Clique em **+ Novo Processo**
3. Preencha:
   - **Número do Processo**
   - **Funcionário** (reclamante)
   - **Vara/Tribunal**
   - **Valor da Causa**
   - **Advogado Responsável**
   - **Status**: Em andamento, Acordo, Sentença, Arquivado
   - **Descrição/Observações**
4. Clique em **Salvar**

### Acompanhamento

- Visualize todos os processos com filtros por status
- Acompanhe valores envolvidos e provisões
- O processo aparece na **timeline do Raio-X** do funcionário

### Dashboard Jurídico

O dashboard mostra:
- Total de processos por status
- Valor total envolvido
- Processos por período
- Taxa de acordos vs sentenças`,
    tags: ["processo", "trabalhista", "judicial", "reclamação", "acordo"],
    icone: "Gavel",
    ordemCategoria: 1,
  },

  // ============================================================
  // DASHBOARDS
  // ============================================================
  {
    id: "dashboards-visao-geral",
    categoria: "dashboards",
    titulo: "Dashboards — Visão Geral",
    subtitulo: "Como interpretar os gráficos e indicadores",
    resumo: "Guia completo para entender e utilizar os dashboards do sistema.",
    conteudo: `## Dashboards — Visão Geral

O sistema possui **6 dashboards** interativos que apresentam indicadores visuais de todas as áreas.

### Dashboards Disponíveis

| Dashboard | Módulo | O que mostra |
|-----------|--------|-------------|
| **Funcionários** | RH | Headcount, admissões/demissões, turnover, distribuição por setor/função |
| **Cartão de Ponto** | RH | Horas trabalhadas, extras, faltas, ranking de faltas |
| **Folha de Pagamento** | RH | Custo total, evolução mensal, distribuição por rubrica |
| **Horas Extras** | RH | HE por obra, por pessoa, custo, evolução mensal |
| **EPIs** | SST | Estoque, entregas, custo, EPIs mais utilizados |
| **Jurídico** | Jurídico | Processos por status, valores, evolução |

### Como Usar

1. Acesse **Dashboards** no menu lateral
2. Selecione o dashboard desejado
3. Use os **filtros** no topo para ajustar:
   - **Empresa** (seletor global no cabeçalho)
   - **Período** (mês/ano de referência)

### Drill-Down (Detalhamento)

Ao clicar em qualquer **barra ou fatia** de um gráfico:
- Abre uma **tela cheia** com a tabela completa dos dados
- Mostra todos os funcionários que compõem aquele indicador
- Permite visualizar detalhes e exportar

### Paleta de Cores

Os gráficos utilizam uma paleta de cores **harmoniosa e acessível**:
- 🔵 Azul suave — dados primários
- 🟢 Verde menta — dados secundários
- 🟡 Pêssego dourado — destaques
- 🟣 Lavanda — categorias terciárias
- 🔵 Turquesa — complementar
- 🟠 Coral — alertas

> **Nota**: As cores foram escolhidas para serem acessíveis a pessoas com daltonismo.`,
    tags: ["dashboard", "gráfico", "indicador", "KPI", "drill-down", "filtro"],
    icone: "BarChart3",
    ordemCategoria: 1,
  },
  {
    id: "raio-x-funcionario",
    categoria: "dashboards",
    titulo: "Raio-X do Funcionário",
    subtitulo: "Ficha completa com timeline de eventos",
    resumo: "Como usar o Raio-X para visualizar toda a história do funcionário na empresa.",
    conteudo: `## Raio-X do Funcionário

O Raio-X é uma **visão 360°** do funcionário, reunindo todos os dados e eventos em uma única tela.

### Como Acessar

1. Acesse **Relatórios > Raio-X do Funcionário**
2. Selecione o funcionário na lista ou busque pelo nome
3. A ficha completa será exibida

### Informações Exibidas

- **Dados Pessoais**: Nome, CPF, idade, data de nascimento
- **Dados Profissionais**: Função, setor, obra, salário, data de admissão
- **Tempo de Empresa**: Calculado automaticamente
- **Status Atual**: Ativo, Férias, Afastado, etc.

### Timeline de Eventos

A timeline mostra **todos os eventos** do funcionário em ordem cronológica:

| Evento | Ícone | Cor |
|--------|-------|-----|
| Admissão | 🟢 | Verde |
| Advertência | 🟡 | Amarelo |
| Férias | 🔵 | Azul |
| CIPA (estabilidade) | 🟣 | Roxo |
| Contrato PJ | 🟤 | Marrom |
| Hora Extra | 🟠 | Laranja |
| Desconto EPI | ⚫ | Cinza |
| Processo Trabalhista | 🔴 | Vermelho |
| Aviso Prévio | 🔴 | Vermelho |
| Desligamento | ⬛ | Preto |

### Impressão

Clique no botão **Imprimir** para gerar uma versão impressa da ficha do funcionário, incluindo todos os dados e a timeline.

> **Dica**: O Raio-X é a melhor ferramenta para ter uma visão completa e rápida de qualquer funcionário.`,
    tags: ["raio-x", "ficha", "timeline", "eventos", "histórico", "impressão"],
    icone: "UserSearch",
    ordemCategoria: 2,
  },

  // ============================================================
  // MEMORIAIS DE CÁLCULO
  // ============================================================
  {
    id: "memorial-rescisao",
    categoria: "memoriais",
    titulo: "Memorial de Cálculo — Rescisão CLT",
    subtitulo: "Fórmulas completas com exemplos numéricos",
    resumo: "Detalhamento completo de todas as verbas rescisórias com fórmulas, bases legais e exemplos.",
    conteudo: `## Memorial de Cálculo — Rescisão CLT

Este memorial detalha todas as fórmulas utilizadas no cálculo de rescisão do sistema.

---

### 1. Saldo de Salário

Proporcional aos dias trabalhados no último mês.

> **Fórmula**: Saldo = (Salário Base ÷ 30) × Dias Trabalhados

**Exemplo**: Salário R$ 3.000,00, trabalhou 15 dias:
- R$ 3.000,00 ÷ 30 × 15 = **R$ 1.500,00**

**Base Legal**: Art. 457 CLT

---

### 2. Aviso Prévio Proporcional

Conforme a Lei 12.506/2011, o aviso prévio é proporcional ao tempo de serviço.

> **Fórmula**: Dias de Aviso = 30 + (3 × Anos Completos de Serviço)
> **Máximo**: 90 dias

| Anos de Serviço | Dias de Aviso |
|-----------------|---------------|
| Até 1 ano | 30 dias |
| 2 anos | 33 dias |
| 3 anos | 36 dias |
| 5 anos | 42 dias |
| 10 anos | 57 dias |
| 20 anos | 87 dias |
| 20+ anos | 90 dias (máximo) |

> **Valor do Aviso** = (Salário Base ÷ 30) × Dias de Aviso

**Exemplo**: Salário R$ 3.000,00, 5 anos de empresa:
- Dias: 30 + (3 × 5) = 42 dias
- Valor: R$ 3.000,00 ÷ 30 × 42 = **R$ 4.200,00**

**Base Legal**: Lei 12.506/2011 + Art. 487 CLT

---

### 3. 13º Salário Proporcional

Proporcional aos meses trabalhados no ano da rescisão.

> **Fórmula**: 13º Proporcional = (Salário Base ÷ 12) × Meses Trabalhados no Ano

**Exemplo**: Salário R$ 3.000,00, rescisão em agosto (8 meses):
- R$ 3.000,00 ÷ 12 × 8 = **R$ 2.000,00**

**Base Legal**: Lei 4.090/1962

---

### 4. Férias Proporcionais + 1/3 Constitucional

Proporcional aos meses desde o último período aquisitivo completo.

> **Fórmula**: Férias Proporcionais = (Salário Base ÷ 12) × Meses desde último período
> **1/3 Constitucional** = Férias Proporcionais ÷ 3
> **Total** = Férias Proporcionais + 1/3

**Exemplo**: Salário R$ 3.000,00, 7 meses desde último período:
- Férias: R$ 3.000,00 ÷ 12 × 7 = R$ 1.750,00
- 1/3: R$ 1.750,00 ÷ 3 = R$ 583,33
- **Total: R$ 2.333,33**

**Base Legal**: Art. 146 CLT + Art. 7º, XVII CF

---

### 5. Férias Vencidas + 1/3

Se o funcionário tem período aquisitivo vencido (não gozou férias no prazo).

> **Fórmula**: Férias Vencidas = Salário Base + (Salário Base ÷ 3)

**Exemplo**: Salário R$ 3.000,00:
- Férias: R$ 3.000,00
- 1/3: R$ 1.000,00
- **Total: R$ 4.000,00**

Se vencidas e não pagas no prazo concessivo, são pagas em **dobro**:
- **Total em dobro: R$ 8.000,00**

**Base Legal**: Art. 137 CLT

---

### 6. VR Proporcional

Proporcional aos dias trabalhados no último mês.

> **Fórmula**: VR Proporcional = VR Diário × Dias Trabalhados

**Exemplo**: VR diário R$ 30,00, trabalhou 15 dias:
- R$ 30,00 × 15 = **R$ 450,00**

---

### 7. FGTS + Multa 40% (Estimativa)

O FGTS é depositado mensalmente (8% do salário). Na rescisão sem justa causa, o empregador paga multa de 40% sobre o saldo.

> **Fórmula Estimativa**: FGTS Estimado = Salário Base × 8% × Meses Trabalhados
> **Multa 40%** = FGTS Estimado × 40%

**Exemplo**: Salário R$ 3.000,00, 24 meses de empresa:
- FGTS: R$ 3.000,00 × 0,08 × 24 = R$ 5.760,00
- Multa: R$ 5.760,00 × 0,40 = R$ 2.304,00
- **Total FGTS + Multa: R$ 8.064,00**

> **Nota**: Este é um valor **estimativo**. O saldo real do FGTS pode variar conforme reajustes, rendimentos e depósitos efetivos.

**Base Legal**: Art. 18 Lei 8.036/1990

---

### 8. Data Limite de Pagamento

Conforme Art. 477, §6º da CLT:

| Tipo de Aviso | Prazo |
|---------------|-------|
| **Aviso Trabalhado** | Até o 1º dia útil após o término do aviso |
| **Aviso Indenizado** | Até 10 dias corridos após a notificação |

> **Multa por atraso**: Se o empregador não pagar no prazo, deve pagar multa equivalente a **1 salário** do empregado (Art. 477, §8º CLT).`,
    tags: ["rescisão", "cálculo", "memorial", "fórmula", "CLT", "FGTS", "férias", "13º", "aviso prévio"],
    icone: "Calculator",
    ordemCategoria: 1,
  },
  {
    id: "memorial-horas-extras",
    categoria: "memoriais",
    titulo: "Memorial de Cálculo — Horas Extras",
    subtitulo: "Percentuais, DSR e exemplos práticos",
    resumo: "Como são calculadas as horas extras, adicional noturno e reflexo no DSR.",
    conteudo: `## Memorial de Cálculo — Horas Extras

### Valor da Hora Normal

> **Fórmula**: Valor Hora = Salário Mensal ÷ Horas Mensais (geralmente 220h)

**Exemplo**: Salário R$ 2.200,00:
- R$ 2.200,00 ÷ 220 = **R$ 10,00/hora**

---

### Hora Extra Comum (Dia Útil) — 50%

> **Fórmula**: HE 50% = Valor Hora × 1,50 × Quantidade de Horas

**Exemplo**: 2 horas extras em dia útil:
- R$ 10,00 × 1,50 × 2 = **R$ 30,00**

**Base Legal**: Art. 59, §1º CLT

---

### Hora Extra em Domingo/Feriado — 100%

> **Fórmula**: HE 100% = Valor Hora × 2,00 × Quantidade de Horas

**Exemplo**: 4 horas extras em feriado:
- R$ 10,00 × 2,00 × 4 = **R$ 80,00**

**Base Legal**: Art. 70 CLT + Súmula 146 TST

---

### Adicional Noturno — 20%

Trabalho entre 22h e 5h tem adicional de 20% e hora reduzida (52min30s).

> **Fórmula**: Hora Noturna = Valor Hora × 1,20

**Exemplo**: 3 horas noturnas:
- R$ 10,00 × 1,20 × 3 = **R$ 36,00**

**Base Legal**: Art. 73 CLT

---

### Reflexo no DSR (Descanso Semanal Remunerado)

As horas extras habituais refletem no DSR.

> **Fórmula**: Reflexo DSR = (Total HE no mês ÷ Dias úteis) × Domingos e Feriados

**Exemplo**: R$ 300,00 de HE no mês, 22 dias úteis, 8 domingos/feriados:
- R$ 300,00 ÷ 22 × 8 = **R$ 109,09**

**Base Legal**: Lei 605/1949 + Súmula 172 TST

---

### Tabela Resumo

| Tipo | Acréscimo | Fórmula |
|------|-----------|---------|
| HE Dia Útil | 50% | Hora × 1,50 × Qtd |
| HE Domingo/Feriado | 100% | Hora × 2,00 × Qtd |
| Adicional Noturno | 20% | Hora × 1,20 × Qtd |
| HE Noturna Dia Útil | 50% + 20% | Hora × 1,50 × 1,20 × Qtd |
| HE Noturna Feriado | 100% + 20% | Hora × 2,00 × 1,20 × Qtd |`,
    tags: ["hora extra", "cálculo", "noturno", "DSR", "percentual", "fórmula"],
    icone: "Calculator",
    ordemCategoria: 2,
  },
  {
    id: "memorial-ferias",
    categoria: "memoriais",
    titulo: "Memorial de Cálculo — Férias",
    subtitulo: "Período aquisitivo, abono e 1/3 constitucional",
    resumo: "Detalhamento do cálculo de férias com todas as variações.",
    conteudo: `## Memorial de Cálculo — Férias

### Férias Integrais (30 dias)

> **Fórmula**: Férias = Salário Base + (Salário Base ÷ 3)

**Exemplo**: Salário R$ 3.000,00:
- Férias: R$ 3.000,00
- 1/3: R$ 1.000,00
- **Total: R$ 4.000,00**

---

### Férias Proporcionais

> **Fórmula**: Férias Prop. = (Salário ÷ 12) × Meses Trabalhados + 1/3

**Exemplo**: Salário R$ 3.000,00, 8 meses:
- Férias: R$ 3.000,00 ÷ 12 × 8 = R$ 2.000,00
- 1/3: R$ 666,67
- **Total: R$ 2.666,67**

---

### Abono Pecuniário (Venda de 1/3)

O funcionário pode "vender" até 1/3 das férias (10 dias).

> **Fórmula**: Abono = (Salário ÷ 30) × 10 + 1/3 do Abono

**Exemplo**: Salário R$ 3.000,00:
- Abono: R$ 3.000,00 ÷ 30 × 10 = R$ 1.000,00
- 1/3 do Abono: R$ 333,33
- **Total do Abono: R$ 1.333,33**

Neste caso, o funcionário goza 20 dias de férias e recebe:
- Férias (20 dias): R$ 2.000,00 + 1/3 (R$ 666,67) = R$ 2.666,67
- Abono (10 dias): R$ 1.333,33
- **Total Geral: R$ 4.000,00**

**Base Legal**: Art. 143 CLT

---

### Férias em Dobro

Se o empregador não conceder férias dentro do período concessivo (12 meses após o aquisitivo):

> **Fórmula**: Férias em Dobro = (Salário + 1/3) × 2

**Exemplo**: Salário R$ 3.000,00:
- Normal: R$ 4.000,00
- **Em Dobro: R$ 8.000,00**

**Base Legal**: Art. 137 CLT

---

### Redução de Férias por Faltas

| Faltas no Período Aquisitivo | Dias de Férias |
|------------------------------|----------------|
| Até 5 faltas | 30 dias |
| 6 a 14 faltas | 24 dias |
| 15 a 23 faltas | 18 dias |
| 24 a 32 faltas | 12 dias |
| Mais de 32 faltas | Perde o direito |

**Base Legal**: Art. 130 CLT`,
    tags: ["férias", "cálculo", "1/3", "abono", "proporcional", "dobro", "faltas"],
    icone: "Calculator",
    ordemCategoria: 3,
  },
  {
    id: "memorial-13-salario",
    categoria: "memoriais",
    titulo: "Memorial de Cálculo — 13º Salário",
    subtitulo: "1ª parcela, 2ª parcela e proporcional",
    resumo: "Como é calculado o 13º salário integral e proporcional.",
    conteudo: `## Memorial de Cálculo — 13º Salário

### 13º Integral

> **Fórmula**: 13º = Salário Base (pago em 2 parcelas)

- **1ª Parcela** (até 30/nov): 50% do salário bruto (sem descontos)
- **2ª Parcela** (até 20/dez): 50% do salário bruto - INSS - IRRF

---

### 13º Proporcional

Para funcionários que não trabalharam o ano inteiro:

> **Fórmula**: 13º Proporcional = (Salário Base ÷ 12) × Meses Trabalhados

**Regra**: Considera-se mês integral quando o funcionário trabalhou **15 dias ou mais** naquele mês.

**Exemplo**: Salário R$ 3.600,00, admitido em abril (9 meses):
- R$ 3.600,00 ÷ 12 × 9 = **R$ 2.700,00**

---

### 13º na Rescisão

Na rescisão, o 13º proporcional é calculado até o mês da rescisão:

**Exemplo**: Salário R$ 3.600,00, rescisão em agosto:
- R$ 3.600,00 ÷ 12 × 8 = **R$ 2.400,00**

> **Exceção**: Na demissão por **justa causa**, o funcionário NÃO tem direito ao 13º proporcional.

**Base Legal**: Lei 4.090/1962 + Lei 4.749/1965`,
    tags: ["13º", "salário", "cálculo", "proporcional", "parcela", "gratificação"],
    icone: "Calculator",
    ordemCategoria: 4,
  },
  {
    id: "memorial-faltas",
    categoria: "memoriais",
    titulo: "Memorial de Cálculo — Faltas",
    subtitulo: "Critério de contagem e impacto na folha",
    resumo: "Como as faltas são contabilizadas e seu impacto nos cálculos trabalhistas.",
    conteudo: `## Memorial de Cálculo — Faltas

### Critério de Contagem

No sistema, uma **falta** é contabilizada quando:

> O funcionário **não tem nenhuma batida** de ponto registrada em um **dia útil completo** (que não seja feriado nem fim de semana).

### Desconto por Falta

> **Fórmula**: Desconto = (Salário ÷ 30) × Dias de Falta

**Exemplo**: Salário R$ 3.000,00, 3 faltas:
- R$ 3.000,00 ÷ 30 × 3 = **R$ 300,00 de desconto**

---

### Impacto no DSR

Faltas injustificadas causam perda do DSR (Descanso Semanal Remunerado) da semana:

> Se o funcionário faltou em qualquer dia da semana sem justificativa, perde o DSR daquela semana.

**Exemplo**: Faltou na quarta-feira sem justificativa → perde o domingo daquela semana.

**Base Legal**: Art. 6 da Lei 605/1949

---

### Impacto nas Férias

As faltas injustificadas no período aquisitivo reduzem os dias de férias:

| Faltas | Dias de Férias |
|--------|----------------|
| 0 a 5 | 30 dias |
| 6 a 14 | 24 dias |
| 15 a 23 | 18 dias |
| 24 a 32 | 12 dias |
| 33+ | Perde o direito |

**Base Legal**: Art. 130 CLT

---

### Faltas Justificadas (não descontam)

| Motivo | Dias |
|--------|------|
| Falecimento (cônjuge, pais, filhos) | 2 dias |
| Casamento | 3 dias |
| Nascimento de filho | 5 dias (pai) |
| Doação de sangue | 1 dia/ano |
| Alistamento eleitoral | 2 dias |
| Serviço militar | Período necessário |
| Vestibular | Dias das provas |
| Comparecimento em juízo | Período necessário |

**Base Legal**: Art. 473 CLT

---

### Ranking de Faltas no Dashboard

O dashboard de Cartão de Ponto exibe o **Ranking de Faltas — Top 10**, mostrando os funcionários com mais faltas no período selecionado. Ao clicar no nome, você é direcionado ao Raio-X do funcionário.`,
    tags: ["falta", "desconto", "DSR", "férias", "justificada", "ranking"],
    icone: "Calculator",
    ordemCategoria: 5,
  },

  // ============================================================
  // CONFIGURAÇÕES
  // ============================================================
  {
    id: "usuarios-permissoes",
    categoria: "configuracoes",
    titulo: "Usuários e Permissões",
    subtitulo: "Controle de acesso ao sistema",
    resumo: "Como gerenciar usuários, perfis de acesso e permissões granulares.",
    conteudo: `## Usuários e Permissões

### Perfis de Acesso

| Perfil | Pode criar | Pode editar | Pode excluir | Acesso |
|--------|-----------|------------|-------------|--------|
| **ADM Master** | ✅ Tudo | ✅ Tudo | ✅ Tudo | Total |
| **ADM** | ✅ Maioria | ✅ Maioria | ⚠️ Parcial | Quase total |
| **Operacional** | ✅ Módulos do dia a dia | ✅ Módulos do dia a dia | ❌ | Restrito |
| **Avaliador** | ✅ Avaliações | ✅ Avaliações | ❌ | Só avaliação |
| **Consulta** | ❌ | ❌ | ❌ | Só visualização |

### Permissões Granulares

Além do perfil, cada usuário pode ter permissões **granulares** por módulo e funcionalidade:
- Acesso a módulos específicos (RH, SST, Jurídico)
- Acesso a funcionalidades específicas dentro de cada módulo
- Vinculação a empresas específicas

### Como Gerenciar

1. Acesse **Administração > Usuários e Permissões**
2. Selecione o usuário
3. Defina o **perfil** e as **permissões granulares**
4. Vincule às **empresas** que o usuário pode acessar
5. Clique em **Salvar**

> **Importante**: Apenas **ADM Master** pode criar e gerenciar outros administradores.`,
    tags: ["usuário", "permissão", "perfil", "acesso", "admin", "segurança"],
    icone: "Lock",
    ordemCategoria: 1,
  },
  {
    id: "configuracoes-sistema",
    categoria: "configuracoes",
    titulo: "Configurações do Sistema",
    subtitulo: "Parâmetros gerais e benefícios",
    resumo: "Como configurar parâmetros do sistema, benefícios de alimentação e limpeza de dados.",
    conteudo: `## Configurações do Sistema

### Benefícios de Alimentação

Configure os valores de VR/VA/iFood por obra:

1. Acesse **Configurações > Benefícios de Alimentação**
2. Clique em **+ Novo Benefício**
3. Selecione a Obra, Tipo e Valor Diário
4. Clique em **Salvar**

### Limpeza de Dados

Para limpar dados do sistema (uso com cautela):

1. Acesse **Configurações > Limpeza de Dados**
2. Selecione os módulos que deseja limpar
3. Digite a senha de confirmação: **LIMPAR2026**
4. Confirme a operação

> **⚠️ ATENÇÃO**: A limpeza de dados é **irreversível**. Use apenas quando necessário e com autorização.

### Auditoria

Todas as ações no sistema são registradas automaticamente:
- Quem fez
- O que fez
- Quando fez
- Dados antes e depois da alteração

Acesse em **Administração > Auditoria do Sistema**.`,
    tags: ["configuração", "benefício", "limpeza", "auditoria", "parâmetro"],
    icone: "Settings",
    ordemCategoria: 2,
  },

  // ============================================================
  // GLOSSÁRIO
  // ============================================================
  {
    id: "glossario-rh",
    categoria: "glossario",
    titulo: "Glossário de RH e DP",
    subtitulo: "Termos técnicos explicados de forma simples",
    resumo: "Dicionário completo dos termos de Recursos Humanos e Departamento Pessoal.",
    conteudo: `## Glossário de RH e DP

| Termo | Significado |
|-------|-------------|
| **ADCT** | Ato das Disposições Constitucionais Transitórias |
| **ASO** | Atestado de Saúde Ocupacional |
| **CIPA** | Comissão Interna de Prevenção de Acidentes |
| **CLT** | Consolidação das Leis do Trabalho |
| **CNPJ** | Cadastro Nacional da Pessoa Jurídica |
| **CPF** | Cadastro de Pessoas Físicas |
| **CTPS** | Carteira de Trabalho e Previdência Social |
| **DSR** | Descanso Semanal Remunerado |
| **EPI** | Equipamento de Proteção Individual |
| **FGTS** | Fundo de Garantia do Tempo de Serviço |
| **HE** | Hora Extra |
| **INSS** | Instituto Nacional do Seguro Social |
| **IRRF** | Imposto de Renda Retido na Fonte |
| **NR** | Norma Regulamentadora (NR-10, NR-35, etc.) |
| **PIS/PASEP** | Programa de Integração Social / Programa de Formação do Patrimônio do Servidor Público |
| **PJ** | Pessoa Jurídica |
| **RG** | Registro Geral (identidade) |
| **SN** | Serial Number (número de série do relógio de ponto) |
| **SST** | Saúde e Segurança do Trabalho |
| **TST** | Tribunal Superior do Trabalho |
| **VR/VA** | Vale Refeição / Vale Alimentação |

### Termos do Sistema

| Termo | Significado |
|-------|-------------|
| **Hub** | Tela inicial com os módulos do sistema |
| **Raio-X** | Ficha completa do funcionário com timeline |
| **Drill-Down** | Detalhamento ao clicar em um gráfico |
| **Multi-Tenant** | Sistema que gerencia múltiplas empresas |
| **Timeline** | Linha do tempo com eventos do funcionário |
| **Dashboard** | Painel com gráficos e indicadores |
| **KPI** | Key Performance Indicator (indicador-chave) |`,
    tags: ["glossário", "termos", "siglas", "dicionário", "RH", "DP"],
    icone: "BookA",
    ordemCategoria: 1,
  },
];

export const ARTIGOS: Artigo[] = [..._ARTIGOS_BASE, ...ARTIGOS_PARTE2];

// Helper: buscar artigos por categoria
export function getArtigosByCategoria(categoria: ArtigoCategoria): Artigo[] {
  return ARTIGOS.filter(a => a.categoria === categoria).sort((a, b) => a.ordemCategoria - b.ordemCategoria);
}

// Helper: buscar artigo por ID
export function getArtigoById(id: string): Artigo | undefined {
  return ARTIGOS.find(a => a.id === id);
}

// Helper: buscar artigos por texto
export function buscarArtigos(termo: string): Artigo[] {
  const t = termo.toLowerCase();
  return ARTIGOS.filter(a =>
    a.titulo.toLowerCase().includes(t) ||
    a.resumo.toLowerCase().includes(t) ||
    a.tags.some(tag => tag.toLowerCase().includes(t)) ||
    a.conteudo.toLowerCase().includes(t)
  );
}
