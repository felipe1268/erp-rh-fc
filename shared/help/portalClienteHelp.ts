// Rev. 1570 — Biblioteca de artigos de Ajuda do Portal do Cliente.
// Cada artigo é renderizado dentro do PortalHelpDrawer e também usado
// como base para o tour guiado (Joyride).
//
// Fonte de verdade: este arquivo. O MANUAL-PORTAL-CLIENTE.md (raiz) é
// gerado a partir do mesmo conteúdo organizado em capítulos.

export type HelpArticle = {
  id: string;
  titulo: string;
  resumo: string;
  emoji: string;
  // Markdown simples (renderizado por mini-renderer dentro do drawer).
  conteudo: string;
};

export const PORTAL_CLIENTE_ARTIGOS: HelpArticle[] = [
  {
    id: "login",
    emoji: "🔐",
    titulo: "Login e primeiro acesso",
    resumo: "Como entrar com CNPJ/CPF/e-mail, primeiro acesso, esqueci a senha.",
    conteudo: `
### Como entrar
1. Acesse **/portal/cliente** no navegador.
2. Informe seu **CNPJ, CPF ou e-mail** cadastrado.
3. Digite sua **senha** (use o ícone do olho para conferir).
4. Clique em **Entrar**.

### Primeiro acesso
A FC envia uma **senha temporária** por e-mail. Ao logar pela primeira vez, o portal força você a definir uma senha pessoal de **no mínimo 6 caracteres**.

### Esqueci minha senha
1. Clique em **"Esqueci minha senha"** na tela de login.
2. Informe **CNPJ ou CPF**.
3. Você recebe por e-mail um **link válido por 1 hora**.
4. Defina a nova senha e faça login.

### Dicas
- Múltiplos usuários no mesmo CNPJ: cada um tem e-mail/senha próprios.
- Após **5 tentativas erradas**, o acesso é bloqueado por 15 minutos.
- O portal funciona em celular, tablet e computador.
`.trim(),
  },
  {
    id: "hub",
    emoji: "🏠",
    titulo: "Tela inicial (Hub)",
    resumo: "Os cards do menu, navegação para módulos e troca de obra.",
    conteudo: `
### O que é
A tela inicial mostra os **módulos liberados** para sua empresa em formato de cards coloridos.

### Cards possíveis
- **🔵 Planejamento** — cronograma, Curva S, KPIs (SPI/CPI).
- **🟢 RH & Docs** — documentos trabalhistas dos colaboradores na obra.
- **🟣 Proj./Doc. Técnicos** — projetos, ARTs, RRTs com revisão.
- **🟡 Avaliação** — pesquisa NPS anônima.

> Você pode ver **menos cards** do que o total — depende do que a FC liberou para você.

### Navegação
1. Clique no card desejado.
2. Se você só tem **1 obra**, entra direto no módulo.
3. Com **2 ou mais obras**, abre uma tela "Selecione a obra".
4. Use o botão **🏠 Tela Inicial** (canto superior esquerdo) para voltar ao Hub.

### Saudação
- "Bom dia / Boa tarde / Boa noite" varia conforme o horário do seu dispositivo.
- A data por extenso (ex.: "domingo, 11 de maio de 2026") é exibida no topo.
`.trim(),
  },
  {
    id: "planejamento",
    emoji: "📅",
    titulo: "Planejamento — Cronograma e Avanço",
    resumo: "Curva S, SPI/CPI, Avanço Físico, banner de tendência.",
    conteudo: `
### O que é
Central de **acompanhamento físico-financeiro** da obra. O que você vê aqui é exatamente o que a equipe interna da FC vê — total transparência.

### Bloco "Avanço Físico"
- **Previsto** (barra dourada): % planejado para hoje, ponderado pelo **peso financeiro** de cada atividade.
- **Realizado** (barra azul): % efetivamente executado.
- Pílula de status:
  - 🟢 **Adiantado** · 🔴 **Atrasado** · ⚪ **No prazo**.

### KPIs principais
| KPI | O que mede |
|---|---|
| **SPI** | Prazo: 1,00 = no prazo · >1 adiantado · <1 atrasado |
| **CPI** | Custo: 1,00 = no orçamento · >1 abaixo · <1 acima |
| **Atividades** | Concluídas / total |
| **Avanço Físico** | % executado x previsto |
| **REFIs emitidos** | Relatórios físicos enviados |

> Toque em qualquer KPI para abrir o popover com explicação detalhada.

### Banner de Tendência
Aparece abaixo dos KPIs:
- 🔵 **Fase inicial** — SPI mostrado apenas como referência (avanço < 20%).
- 🟢 **No prazo** · 🟡 **Atenção** · 🟠 **Alerta** · 🔴 **Crítico**.

### Como ler em 3 perguntas
1. **No prazo?** → bloco Avanço Físico + pílula de status.
2. **Vou entregar no prazo?** → banner de Tendência.
3. **Estou no orçamento?** → CPI + Curva S Financeira.

### Outras seções da página
- Curva S de Trabalho · Curva S Financeira · KPIs Semanais
- Atividades (tabela completa) · Cronograma Financeiro
- Previsão de Medição · Efetivo da Obra · Custo RH · Modelo BIM 3D
`.trim(),
  },
  {
    id: "documentos",
    emoji: "📁",
    titulo: "Documentos & Projetos Técnicos",
    resumo: "Como buscar, visualizar e baixar PDFs/DWG/imagens com revisão.",
    conteudo: `
### O que é
Repositório de **projetos, ARTs/RRTs, plantas e documentos técnicos** da obra. Cada documento tem **revisões** (R00, R01...) e **status**.

### KPIs do topo
- **Total** · **Aprovados** · **Em Revisão** · **Em Elaboração** · **Reprovados**

### Filtros
- Pílulas de **status** com contadores (clique para filtrar).
- **Toggle de visualização**:
  - 📁 **Pastas** (padrão) — agrupa por **Disciplina → Formato**.
  - 📋 **Lista** — todos os documentos numa tabela única.
- **Busca** — código, título, tipo ou disciplina.

> Quando você busca/filtra, todas as pastas abrem automaticamente para mostrar resultados.

### Visualizar e baixar
- 👁 **Olho** → abre o PDF inline (sem baixar).
- ⬇ **Download** → baixa a versão atual do arquivo.

### Status de revisão
- 🟢 **Aprovado** — pode usar na obra.
- 🔵 **Em Revisão** — em análise.
- 🟡 **Em Elaboração** — rascunho.
- 🔴 **Reprovado** — tem pendências, **não usar**.
- ⚫ **Cancelado / Obsoleto** — descontinuado/substituído.

### Formatos
- **PDF, JPG, PNG, WebP** → visualização inline.
- **DWG, DXF, DWF** → baixar e abrir no AutoCAD/Bricscad (sem visor no navegador).
`.trim(),
  },
  {
    id: "avaliacao",
    emoji: "⭐",
    titulo: "Avaliação NPS Anônima",
    resumo: "Como avaliar Equipe, Gestor, Empresa e Obra de forma anônima.",
    conteudo: `
### O que é
Pesquisa de satisfação **100% anônima**. Você envia **uma avaliação por mês** (ou por ano, conforme configurado).

### LGPD / Anonimato
- ✅ Não armazenamos sua identidade, CNPJ ou IP junto com as respostas.
- ✅ Apenas registramos que você já avaliou no período — para evitar duplicidade.
- ✅ A FC vê apenas **médias agregadas** e **textos livres anônimos**.

### Estrutura do formulário
1. **Nota Geral (NPS) ★** — 0 a 10. **Obrigatória.**
2. **Bloco Equipe FC** — nota Equipe + nota Atendimento + comentário (opcional).
3. **Bloco Gestor responsável** — nota + nome do gestor (opcional) + texto "como pode evoluir" (opcional).
4. **Bloco Empresa FC** — nota + comentário sobre a empresa.
5. **Bloco Obra** — Andamento, Cumprimento de prazos, Qualidade.
6. **Recomendaria a FC?** — Sim · Talvez · Não.
7. **Comentários gerais** (opcionais) — positivo + sugestões de melhoria.

### Como enviar
1. Preencha pelo menos a **Nota Geral**.
2. Clique em **Enviar avaliação**.
3. Aparece a tela "Obrigado pela avaliação!".

### Já avaliei este período — quero refazer
Solicite ao **Admin Master da FC** para cancelar sua avaliação anterior. Após cancelar, você pode enviar uma nova.

### Lembrete automático
Se você ainda não avaliou no período, ao logar no portal aparece um **modal** convidando você a avaliar (você pode escolher "Mais tarde").
`.trim(),
  },
  {
    id: "conta",
    emoji: "👤",
    titulo: "Configurações da conta",
    resumo: "Trocar senha, sair, gerenciar acesso de múltiplos usuários.",
    conteudo: `
### Trocar senha
O portal força a troca em duas situações:
1. **Primeiro acesso** (senha temporária).
2. Após **redefinição via "Esqueci minha senha"**.

Passo a passo:
1. Informe a **senha atual** (a temporária).
2. Defina a **nova senha** (mínimo 6 caracteres).
3. **Confirme** a nova senha.
4. Use o botão "Mostrar senhas" para conferir.
5. Clique em **Alterar Senha e Continuar**.

### Esqueci minha senha
Veja o artigo **🔐 Login e primeiro acesso**.

### Sair (Logout)
- Botão **🚪 Sair** no canto superior direito.
- Apaga sua sessão local (token, nome, CNPJ).
- Sempre saia em computadores compartilhados.

### Multi-usuário
- Sua empresa pode ter vários usuários com acesso (financeiro, engenheiro, diretor...).
- Cada um com **seu próprio e-mail e senha**.
- Quando você sai, **não afeta** outros usuários.

### Sessão expirada
Se aparecer **"Sessão expirada"**, basta logar novamente. Pode acontecer se você ficar muito tempo inativo ou se a FC alterar suas permissões.

### Mudar e-mail / revogar acesso
Solicite à FC. Apenas o administrador pode alterar e-mail ou bloquear/remover usuários.
`.trim(),
  },
];

// Passos do tour guiado de boas-vindas (1ª visita).
// Cada step referencia uma classe `tour-XXX` colocada nos elementos da UI.
export type TourStep = {
  target: string;
  title: string;
  content: string;
};

export const PORTAL_CLIENTE_TOUR: TourStep[] = [
  {
    target: ".tour-hub-saudacao",
    title: "Bem-vindo ao Portal do Cliente! 👋",
    content:
      "Aqui você acompanha sua obra de ponta a ponta — cronograma, documentos e avaliação. Vou te mostrar em 30 segundos como tudo funciona.",
  },
  {
    target: ".tour-hub-cards",
    title: "Estes são os módulos liberados",
    content:
      "Cada card é uma área do portal. Clique para entrar. Você pode ver menos cards do que o total — depende do que a FC liberou para sua empresa.",
  },
  {
    target: ".tour-hub-ajuda",
    title: "Botão de Ajuda 🆘",
    content:
      "Sempre que tiver dúvida, clique aqui. Você abre uma biblioteca completa com tutoriais, busca e respostas para perguntas frequentes.",
  },
  {
    target: ".tour-hub-sair",
    title: "Sair do portal",
    content:
      "Quando terminar, use este botão. Em computadores compartilhados, sempre saia ao fim do uso.",
  },
];
