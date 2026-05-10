# Manual do Portal do Cliente — FC Engenharia

**Versão**: Rev. 1570 · 11/05/2026
**Público-alvo**: Clientes da FC Engenharia (responsáveis técnicos, financeiros e de obra)
**Acesso**: https://erp.fcengenharia.com.br/portal/cliente

---

## Sumário

1. [Login e primeiro acesso](#1-login-e-primeiro-acesso)
2. [Dashboard inicial (Hub)](#2-dashboard-inicial-hub)
3. [Planejamento — Cronograma e Avanço](#3-planejamento--cronograma-e-avanço)
4. [Documentos & Projetos Técnicos](#4-documentos--projetos-técnicos)
5. [Avaliação NPS Anônima](#5-avaliação-nps-anônima)
6. [Configurações da conta](#6-configurações-da-conta)
7. [Perguntas frequentes (FAQ)](#7-perguntas-frequentes-faq)
8. [Glossário rápido](#8-glossário-rápido)

---

## 1. Login e primeiro acesso

### 1.1 O que é

A tela de login é o ponto de entrada exclusivo do **Portal do Cliente**. Ela é diferente do portal interno da FC — você acessa por um endereço próprio e vê apenas as obras vinculadas ao seu CNPJ/CPF.

### 1.2 Para que serve

- Entrar de forma segura com seu CNPJ, CPF ou e-mail cadastrado.
- Recuperar senha esquecida.
- Trocar senha temporária no primeiro acesso.

### 1.3 Como acessar (passo a passo)

1. Abra o navegador e acesse **`https://erp.fcengenharia.com.br/portal/cliente`**.
2. No campo **CNPJ, CPF ou E-mail**, informe seu identificador.
   - O sistema formata o CNPJ automaticamente (ex.: `00.000.000/0000-00`).
   - Se preferir, use o e-mail cadastrado pelo administrador.
3. Digite sua **senha**.
   - Use o ícone do olho (👁) para mostrar/ocultar a senha — funciona em iPad também.
4. Clique em **Entrar**.

> 💡 **Primeiro acesso?** A FC Engenharia envia uma **senha temporária** por e-mail. Ao logar pela primeira vez, o sistema **obriga** a troca por uma senha pessoal de no mínimo 6 caracteres.

### 1.4 Esqueci minha senha

1. Clique em **"Esqueci minha senha"** abaixo do campo de senha.
2. Informe **CNPJ ou CPF** cadastrado.
3. Você receberá um **link de redefinição válido por 1 hora** no e-mail cadastrado.
4. Abra o link, defina a nova senha (mínimo 6 caracteres) e faça login normalmente.

### 1.5 Tela inicial: o que aparece

- **Lado esquerdo (desktop)**: vitrine institucional com os módulos disponíveis (Documentos, Medições, RDO, Cronograma).
- **Lado direito**: formulário de login centralizado.
- **Rodapé**: ano corrente e identificação do portal.

### 1.6 Dicas e regras

- A senha **expira em 1 hora** após solicitar redefinição.
- Após **5 tentativas erradas**, sua conta é temporariamente bloqueada por 15 minutos.
- Múltiplos usuários podem ter acesso pelo mesmo CNPJ — cada um com seu próprio e-mail/senha.
- O portal **não compartilha** sua sessão com o portal interno da FC.

### 1.7 Print

📷 `attached_assets/manual-portal-cliente/01-login.png`
*Tela de login do Portal do Cliente. Áreas: (1) campo CNPJ/CPF/e-mail, (2) campo Senha + olho, (3) Esqueci a senha, (4) Botão Entrar.*

---

## 2. Dashboard inicial (Hub)

### 2.1 O que é

Após o login, você cai no **Hub** — uma tela em formato de "cards" com todos os módulos liberados pelo administrador. É a sua **tela inicial** dentro do portal.

### 2.2 Para que serve

- Ver rapidamente quais áreas você tem acesso.
- Navegar para cada módulo em 1 clique.
- Ver saudação personalizada e a data atual.

### 2.3 Cards disponíveis

| Card | Cor | O que faz |
|---|---|---|
| **Planejamento** | 🔵 Azul | Cronograma da obra, Curva S, KPIs (SPI, avanço físico) |
| **RH & Docs** | 🟢 Verde | Documentos trabalhistas dos colaboradores na obra (ASOs, EPIs etc.) |
| **Proj./Doc. Técnicos** | 🟣 Roxo | Projetos, ARTs, RRTs, documentos técnicos com revisão |
| **Avaliação** | 🟡 Amarelo | Avaliação anônima mensal (ou anual) — NPS |

> ⚠️ Você pode ver **menos** cards do que os listados acima — o administrador da FC libera apenas os módulos contratados/liberados para sua empresa.

### 2.4 Como navegar

1. Clique no card desejado.
2. Se você só tem **1 obra vinculada**, o portal entra direto na tela do módulo.
3. Se tem **2 ou mais**, o portal abre uma tela intermediária **"Selecione a obra"** com cards de cada obra. Toque na desejada.
4. Em qualquer tela, o botão **🏠 Tela Inicial** (canto superior esquerdo) volta ao Hub.

### 2.5 Saudação e contexto

- **Bom dia / Boa tarde / Boa noite** — varia conforme o horário do seu dispositivo.
- **Data por extenso** em português (ex.: "domingo, 11 de maio de 2026").
- **Nome da empresa** (razão social) sempre visível no canto superior direito.

### 2.6 Sair do portal

Use o botão **🚪 Sair** no canto superior direito. A sessão é encerrada e os dados locais (token, nome) são apagados do navegador.

### 2.7 Print

📷 `attached_assets/manual-portal-cliente/02-hub.png`
*Hub do cliente. Áreas: (1) saudação + data, (2) cards de módulos liberados, (3) botão Sair, (4) animação de fundo institucional.*

---

## 3. Planejamento — Cronograma e Avanço

### 3.1 O que é

O módulo **Planejamento** é a **central de acompanhamento físico-financeiro** da obra. Ele mostra exatamente o que mostramos internamente para nossa equipe, com clareza para o cliente.

### 3.2 Para que serve

- Acompanhar **avanço físico** real x previsto.
- Ver o **cronograma** completo (atividades e marcos).
- Entender o **SPI/CPI** (indicadores de prazo e custo).
- Ver **Curva S** de trabalho e financeira.
- Conferir efetivo, custos de mão de obra, previsão de medição, evolução de custo RH e modelo BIM 3D.

### 3.3 Anatomia da tela

#### Topo (cabeçalho)
- **Etiqueta "Planejamento"** + **Rev. NN** (número da revisão atual do cronograma).
- **Nome da obra** em destaque.
- **Cliente, responsável FC, cidade/estado**.
- **Dias restantes** (verde = > 30 dias, amarelo = < 30, vermelho = atrasado).
- **PrintActions**: botão para imprimir / gerar PDF da página.

#### Bloco "Avanço Físico" (sempre no topo)
- **Previsto** (barra dourada): % planejado para hoje, ponderado pelo peso financeiro de cada atividade.
- **Realizado** (barra azul): % efetivamente executado.
- **Pílula de status**:
  - 🟢 **Adiantado** — desvio positivo ≥ 0,1%
  - 🔴 **Atrasado** — desvio negativo ≥ 0,1%
  - ⚪ **No prazo** — diferença menor que 0,1%
- **💰 Peso Financeiro** — explica que o cálculo usa o valor de cada atividade.

#### KPIs principais (cards clicáveis)

| KPI | O que mede | Como ler |
|---|---|---|
| **Atividades** | Concluídas / total | Ex.: 142/300 |
| **Avanço Físico** | % executado x previsto | Igual ao bloco do topo |
| **SPI (prazo)** | Schedule Performance Index | 1,00 = no prazo · >1,00 = adiantado · <1,00 = atrasado |
| **CPI (custo)** | Cost Performance Index | 1,00 = no orçamento · >1,00 = abaixo · <1,00 = acima |
| **REFIs emitidos** | Relatórios Físicos enviados | Contador histórico |

> 💡 **Toque em qualquer KPI** para ver um popover com a explicação completa, fórmula e exemplo.

#### Banner de Tendência × Prazo Contratual

Aparece logo abaixo dos KPIs e mostra a **projeção de conclusão**:

- **🔵 Fase inicial** — "SPI X.XX (referência)". Aparece quando o avanço previsto ainda é menor que 20%. Nesta fase, o SPI é estatisticamente instável (referência: PMBOK / Earned Schedule / Walt Lipke 2003), então **não projetamos atraso** — apenas mostramos o número como referência.
- **🟢 No prazo** — SPI saudável, conclusão dentro do prazo contratual.
- **🟡 Atenção** — alguns dias de atraso projetado.
- **🟠 Alerta** — atraso projetado considerável.
- **🔴 Crítico** — estouro severo previsto. Mostra ETA (data estimada de término) e o prazo contratual.

#### Curva S de Trabalho

- Eixo X: tempo (semanas).
- Eixo Y: % de avanço acumulado.
- **Linha dourada (Previsto)**: planejamento contratual.
- **Linha azul (Realizado)**: o que foi efetivamente executado.
- A área entre as duas mostra o "buraco" (atraso) ou o "bônus" (adiantamento).

#### Curva S Financeira

- Mesma lógica, mas em **R$** acumulado.
- Permite comparar o financeiro previsto x realizado.

#### KPIs Semanais (delta)
- Mostra **quanto a obra deveria avançar de seg a dom** vs **quanto avançou efetivamente**.
- "Aderência (SPI sem.)" mede o desempenho da semana isolada — útil para entender se a tendência está melhorando ou piorando.

#### Outras seções
- **Atividades** — tabela completa do cronograma com SPI por linha.
- **Cronograma Financeiro** — desembolso mensal previsto.
- **Previsão de Medição** — quanto será faturado por mês.
- **Efetivo da Obra** — quantidade de pessoas no canteiro mês a mês.
- **Evolução do Custo RH** — gráfico de gastos com mão de obra.
- **Modelo BIM 3D** — visualização do modelo (quando disponível).

### 3.4 Como ler na prática (3 perguntas-chave)

1. **"Minha obra está no prazo?"** → Olhe o **bloco de Avanço Físico** + a **pílula de status**.
2. **"Vou conseguir entregar na data combinada?"** → Olhe o **banner de Tendência**. Se aparecer "Fase inicial", aguarde mais avanço para ter projeções confiáveis.
3. **"Estamos gastando dentro do orçado?"** → Olhe o **CPI** e a **Curva S Financeira**.

### 3.5 Dicas

- Tudo o que você vê é **idêntico ao que a equipe interna da FC vê** — total transparência.
- O cabeçalho da página fica **fixo no topo** ao rolar — você sempre sabe em qual obra está.
- Use **PrintActions** para gerar um PDF do estado atual e levar para reuniões.
- O menu lateral (esquerda) permite navegar entre seções da obra sem voltar ao Hub.

### 3.6 Print

📷 `attached_assets/manual-portal-cliente/03-planejamento.png`
*Tela de Planejamento. Áreas: (1) cabeçalho com obra, (2) Avanço Físico previsto/realizado, (3) KPIs SPI/CPI, (4) banner de tendência, (5) Curva S de Trabalho, (6) menu lateral.*

---

## 4. Documentos & Projetos Técnicos

### 4.1 O que é

Repositório oficial de **projetos, ARTs/RRTs, plantas, especificações e documentos técnicos** da obra. Cada documento tem **revisões**, **status** (aprovado, em revisão, etc.) e pode ser **visualizado inline** ou baixado.

### 4.2 Para que serve

- Consultar a versão **atual** de qualquer projeto ou documento técnico.
- Baixar arquivos PDF/DWG/DXF/imagens.
- Visualizar PDFs diretamente no navegador (sem baixar).
- Filtrar por **status**, **disciplina** e **formato**.
- Buscar rapidamente por **código**, **título** ou **disciplina**.

### 4.3 KPIs do topo

| Card | O que mede |
|---|---|
| **Total Documentos** | Quantos documentos a obra tem no total |
| **Aprovados** | Documentos liberados para uso |
| **Em Revisão** | Documentos em análise/revisão técnica |
| **Em Elaboração** | Em rascunho, ainda não enviado para revisão |
| **Reprovados** | Documentos com pendências/rejeitados |

### 4.4 Filtros e busca

- **Filtros de status** (linha de pílulas com contadores): Todos · Aprovados · Em Revisão · Em Elaboração · Reprovados.
- **Toggle de visualização**:
  - **📁 Pastas** (padrão) — agrupa por **Disciplina → Formato** (ex.: Estrutural → DWG, Estrutural → PDF).
  - **📋 Lista** — exibe todos os documentos numa tabela plana.
- **Busca** — campo no canto direito; busca em **código, título, tipo e disciplina**.

> 💡 Quando você digita uma busca ou aplica filtro, **todas as pastas abrem automaticamente** para mostrar os resultados.

### 4.5 Como abrir/baixar um documento

| Ação | Como fazer |
|---|---|
| **Visualizar PDF inline** | Clique no ícone **👁 (olho)** ao lado do documento. Abre num modal sem sair da página. |
| **Baixar arquivo** | Clique no ícone **⬇ (download)**. O arquivo é baixado com a versão atual. |
| **Ver código/revisão** | Cada linha mostra: código, título, tipo, disciplina, **revisão atual** (ex.: "R03"), data e status. |

### 4.6 Status de revisão (cores)

| Status | Cor | O que significa |
|---|---|---|
| **Aprovado** | 🟢 Verde | Liberado para uso na obra |
| **Em Revisão** | 🔵 Azul | Em análise pela equipe técnica |
| **Em Elaboração** | 🟡 Amarelo | Rascunho — ainda não enviado |
| **Reprovado** | 🔴 Vermelho | Tem pendências — não usar |
| **Cancelado** | ⚫ Cinza | Documento descontinuado |
| **Obsoleto** | ⚫ Cinza claro | Substituído por versão mais nova |

### 4.7 Formatos suportados

| Formato | Visualização inline | Comentário |
|---|---|---|
| **PDF** | ✅ Sim | Abre no visor do navegador |
| **JPG/PNG/WebP** | ✅ Sim | Imagens abrem como preview |
| **DWG/DXF/DWF** | ❌ Não | Vai direto para download — abrir no AutoCAD/Bricscad |

### 4.8 Print

📷 `attached_assets/manual-portal-cliente/04-projdoc.png`
*Documentos Técnicos. Áreas: (1) KPIs, (2) filtros de status, (3) toggle Pastas/Lista, (4) busca, (5) árvore Disciplina→Formato, (6) ícones visualizar/baixar.*

---

## 5. Avaliação NPS Anônima

### 5.1 O que é

Pesquisa de satisfação **100% anônima** que ajuda a FC Engenharia a melhorar continuamente. Você pode enviar **uma avaliação por mês** (ou por ano, se sua empresa estiver configurada assim).

### 5.2 Para que serve

- Dar feedback sobre **Equipe FC**, **Gestor responsável**, **Empresa**, **Obra**.
- Avaliar se você **recomendaria** a FC para outras empresas (clássico NPS).
- Ajudar a FC a identificar pontos de melhoria — sem expor sua identidade.

### 5.3 Anonimato e LGPD

- ✅ **Não armazenamos** sua identidade, CNPJ ou IP junto com as respostas.
- ✅ Apenas registramos que você **já enviou a avaliação** do mês — para evitar duplicidade — sem ligar isso ao conteúdo das respostas.
- ✅ A FC vê apenas **agregados** (médias, NPS) e os **textos livres** (sem identificar quem escreveu).

### 5.4 Como acessar

**Via Hub:** clique no card **⭐ Avaliação**.
**Via Dashboard:** clique na aba **"Avaliação Anônima"**.
**Via lembrete automático:** ao logar no portal, se você ainda não avaliou no período, aparece um **modal** convidando — você pode escolher "Avaliar agora" ou "Mais tarde".

### 5.5 Estrutura do formulário

#### Pergunta 1 — Nota geral (NPS) ⭐
- Escala de **0 a 10**.
- Cor automática: 0–6 vermelho, 7–8 amarelo, 9–10 verde.
- **Obrigatória** — sem ela, não é possível enviar.

#### Bloco 1 — Equipe FC na obra 👥
- **Nota Equipe FC** (técnica, relacionamento) — 0 a 10.
- **Nota Atendimento e comunicação** — 0 a 10.
- **Comentário sobre a equipe** *(opcional)* — postura, técnica, segurança, organização, pontualidade…

#### Bloco 2 — Gestor / Responsável FC 👨‍💼
- **Nota Gestor responsável** (liderança, decisões, proatividade) — 0 a 10.
- **Nome do gestor** *(opcional)* — campo de texto, ex.: "Eng. João da Silva".
- **Como o gestor pode evoluir?** *(opcional)* — clareza, proatividade, presença em obra, decisões técnicas…

#### Bloco 3 — FC Engenharia (Empresa) 🏢
- **Nota Empresa FC** (reputação, transparência, comunicação institucional) — 0 a 10.
- **Comentário sobre a Empresa** *(opcional)* — imagem da empresa, postura institucional, processos administrativos…

#### Bloco 4 — Obra / Execução 🏗️
- **Nota Andamento da obra** — 0 a 10.
- **Nota Cumprimento de prazos** — 0 a 10.
- **Nota Qualidade do serviço entregue** — 0 a 10.

#### Pergunta final — Recomendação
- "Recomendaria a FC para outras empresas?"
- Opções: **Sim · Talvez · Não**.

#### Comentários gerais (opcionais)
- **O que mais te agrada?** (positivo)
- **Sugestões de melhoria** (negativo)

### 5.6 Como enviar

1. Preencha pelo menos a **Nota Geral**.
2. Clique em **Enviar avaliação**.
3. Aparece a tela de agradecimento: **"Obrigado pela avaliação!"**.

### 5.7 "Já avaliei este mês — e agora?"

Se você já enviou no período (mês ou ano, conforme configurado):
- O formulário é substituído por uma tela: **"Avaliação deste mês já registrada"**.
- Para enviar uma nova no mesmo período, **solicite ao Admin Master da FC para cancelar** sua avaliação anterior.

### 5.8 Periodicidade (mensal x anual)

- A FC define se a periodicidade é **mensal** (padrão) ou **anual** por empresa.
- Mensagens da tela são **dinâmicas** ("deste mês" ou "deste ano").
- O contador de "uma avaliação por X" se ajusta automaticamente.

### 5.9 Print

📷 `attached_assets/manual-portal-cliente/05-avaliacao.png`
*Formulário de avaliação. Áreas: (1) selo de anonimato LGPD, (2) Nota Geral, (3-6) blocos Equipe/Gestor/Empresa/Obra, (7) recomendação, (8) botão Enviar.*

---

## 6. Configurações da conta

### 6.1 O que é

Conjunto de ações relacionadas à **sua conta de usuário** dentro do portal: trocar senha, fazer logout, recuperar acesso.

### 6.2 Trocar senha

#### Quando o portal força a troca
- Sempre no **primeiro acesso** (senha temporária precisa ser substituída).
- Após uma **redefinição de senha** via "Esqueci minha senha".

#### Como trocar (passo a passo)
1. O portal redireciona automaticamente para a tela **Trocar Senha**.
2. **Senha Atual** — digite a senha temporária (ou a antiga).
3. **Nova Senha** — mínimo 6 caracteres.
4. **Confirmar Nova Senha** — repita a senha.
5. Use o botão **"Mostrar senhas"** para conferir o que digitou.
6. Clique em **"Alterar Senha e Continuar"**.

> ⚠️ A senha precisa ter **no mínimo 6 caracteres** e as duas devem ser iguais.

### 6.3 Recuperar senha esquecida

Veja a seção **1.4 Esqueci minha senha**.

### 6.4 Sair do portal (Logout)

- Clique em **🚪 Sair** no canto superior direito de qualquer tela.
- Você é redirecionado para a tela de login.
- Todos os dados locais (token, nome, CNPJ salvo) são apagados do navegador.

> 💡 **Boas práticas**: sempre clique em "Sair" ao terminar de usar o portal em computadores compartilhados.

### 6.5 Multi-usuário no mesmo CNPJ

- Sua empresa pode ter **vários usuários** com acesso ao portal (ex.: financeiro, engenheiro, diretor).
- Cada um tem **seu próprio e-mail e senha**.
- O administrador da FC cadastra cada usuário individualmente.
- Quando você "Sai", isso não afeta os outros usuários.

### 6.6 Tempo de sessão

- Sua sessão fica ativa enquanto você estiver usando o portal.
- Se você ficar **muito tempo inativo** ou se a FC alterar permissões, a sessão expira e o portal mostra: **"Sessão expirada"** — basta logar novamente.

---

## 7. Perguntas frequentes (FAQ)

### Acesso

**1. Não recebi o e-mail de senha temporária. O que fazer?**
Verifique a caixa de spam/lixeira. Se não encontrar, peça ao administrador da FC para reenviar.

**2. Posso compartilhar minha senha com colegas?**
Não recomendamos. Solicite à FC um cadastro próprio para cada colaborador da sua empresa.

**3. Esqueci o CNPJ cadastrado. E agora?**
Use seu **e-mail corporativo** no campo de login (também aceito).

**4. Funciona no celular?**
Sim — o portal é totalmente responsivo (mobile-first). Funciona em iPhone, Android, iPad e desktop.

### Planejamento

**5. O que significa SPI = 0,57?**
A obra está executando apenas 57% do que deveria nesta data — atraso considerável.

**6. Por que o banner mostra "Fase inicial · SPI 1,02 (referência)" sem projetar atraso?**
Quando o avanço previsto é menor que 20%, o SPI é estatisticamente instável (referência: PMBOK / Earned Schedule). Por isso, não projetamos prazo nessa fase — apenas mostramos como referência.

**7. Posso imprimir a tela de Planejamento para reunião?**
Sim. Use o botão **"Imprimir / PDF"** no canto superior direito.

### Documentos

**8. Por que não consigo ver um arquivo DWG inline?**
Navegadores não têm visor nativo para DWG. O arquivo vai direto para download — abra no AutoCAD ou software equivalente.

**9. Aparece "Reprovado" em um documento — posso usar mesmo assim?**
Não. Documentos reprovados têm pendências. Aguarde a aprovação da próxima revisão.

**10. Como vejo todas as revisões anteriores de um documento?**
A lista mostra apenas a **revisão atual**. Para histórico completo, solicite à equipe da FC.

### Avaliação

**11. A FC consegue saber quem deu nota baixa?**
Não. A avaliação é **100% anônima** — não armazenamos vínculo entre o conteúdo das respostas e sua identidade.

**12. Já avaliei este mês mas mudei de opinião — posso refazer?**
Solicite ao Admin Master da FC que **cancele** sua avaliação. Após o cancelamento, você poderá enviar uma nova no mesmo período.

**13. Por que algumas perguntas têm "(opcional)"?**
Apenas a **Nota Geral** é obrigatória. Tudo o mais é opcional para respeitar o seu tempo.

### Conta

**14. Onde mudo meu e-mail de cadastro?**
Solicite à FC — apenas o administrador pode alterar e-mail vinculado ao CNPJ.

**15. Posso revogar o acesso de um colega que saiu da empresa?**
Sim — entre em contato com a FC e peça o **bloqueio** ou **remoção** do acesso.

---

## 8. Glossário rápido

| Termo | Significado |
|---|---|
| **SPI** | *Schedule Performance Index* — indicador de prazo. 1,00 = no prazo. |
| **CPI** | *Cost Performance Index* — indicador de custo. 1,00 = no orçamento. |
| **Curva S** | Gráfico cumulativo de avanço (físico ou financeiro) ao longo do tempo. |
| **Avanço Físico** | % de execução da obra ponderado pelo peso financeiro de cada atividade. |
| **NPS** | *Net Promoter Score* — métrica de satisfação. Promotores (9-10), Neutros (7-8), Detratores (0-6). |
| **REFI** | Relatório Físico — registro periódico de avanço da obra. |
| **ART/RRT** | Anotação/Registro de Responsabilidade Técnica (CREA/CAU). |
| **Disciplina** | Categoria técnica do documento (Arquitetura, Estrutural, Hidráulica, Elétrico…). |
| **Revisão** | Versão numerada de um documento (R00, R01, R02…). |
| **EAP** | Estrutura Analítica do Projeto — hierarquia de itens e atividades. |
| **PMBOK** | *Project Management Body of Knowledge* — guia de boas práticas de gerenciamento de projetos. |
| **Earned Schedule** | Técnica de Walt Lipke (2003) para corrigir distorções do SPI em fases iniciais. |

---

## Suporte

- **E-mail FC**: contato@fcengenharia.com.br
- **Telefone**: (XX) XXXX-XXXX
- **Horário comercial**: seg-sex, 8h às 18h

---

*Este manual é atualizado a cada revisão do portal. Versão atual: **Rev. 1570 · 11/05/2026**.*
