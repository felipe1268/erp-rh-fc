#!/usr/bin/env node
/**
 * Manual prático e didático do Portal do Cliente FC Engenharia.
 * Foco em INICIANTES, com tutoriais passo-a-passo, explicações
 * conceituais, FAQ por módulo e glossário expandido.
 *
 * Reaproveita os prints anotados de docs/portal-prints-anotado/
 * (gerados por scripts/portal-pdf-gen.mjs) e converte HTML → PDF
 * via Chromium headless.
 *
 * Saída: docs/Manual_Portal_Cliente_FC_Iniciante.pdf
 */

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const ROOT = process.cwd();
const PRINTS = path.join(ROOT, "docs", "portal-prints-anotado");
const OUT_HTML = path.join(ROOT, "docs", "_manual_iniciante.html");
const OUT_PDF = path.join(ROOT, "docs", "Manual_Portal_Cliente_FC_Iniciante.pdf");
const CHROMIUM = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";

function imgB64(file) {
  const p = path.join(PRINTS, file);
  if (!fs.existsSync(p)) return null;
  return `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}`;
}

const LOGO = imgB64("_logo-fc.jpg");

// ─────────────────────────────────────────────────────────────────
// CONTEÚDO — todas as seções como objetos. O HTML é renderizado
// no fim por uma função simples.
// ─────────────────────────────────────────────────────────────────

const CAPA = {
  titulo: "Manual Prático do Portal do Cliente",
  subtitulo: "Guia completo para iniciantes — FC Engenharia",
  tagline: "Acompanhe sua obra de ponta a ponta · Versão Iniciante (Rev. 1601)",
  cliente: "Cliente exemplo · Santuário Aparecida",
  obra: "Obra exemplo · REVTE-CIVIL",
  data: "Atualizado em 10/05/2026",
};

const BEM_VINDO = `
<h2>Bem-vindo ao Portal do Cliente</h2>
<p class="lead">Este manual foi escrito para você que está abrindo o Portal pela <b>primeira vez</b>. Não exige conhecimento técnico — em poucos minutos você vai conseguir acompanhar a sua obra como um engenheiro experiente.</p>

<div class="callout callout-blue">
  <p class="callout-title">Para que serve o Portal?</p>
  <p>O Portal do Cliente é a sua <b>janela transparente</b> para o que acontece na obra. Tudo que está acontecendo no nosso ERP interno fica disponível pra você de forma simplificada, em tempo real:</p>
  <ul>
    <li><b>Está atrasada?</b> O Portal mostra em uma única barra colorida.</li>
    <li><b>O que vai ser feito esta semana?</b> Uma aba dedicada com a lista completa.</li>
    <li><b>Quero ver os projetos técnicos?</b> Outro módulo permite baixar todos os PDFs.</li>
    <li><b>Quero dar feedback?</b> Avaliação anônima mensal (NPS).</li>
  </ul>
</div>

<div class="callout callout-amber">
  <p class="callout-title">O que NÃO está no Portal (ainda)?</p>
  <p>Algumas funcionalidades aparecem como <i>Em Breve</i> no Hub: Galeria de Fotos, Boletins de Medição e Solicitações. Elas estão no roadmap e serão liberadas em atualizações futuras.</p>
</div>

<h3>O que você vai encontrar neste manual</h3>
<ol>
  <li><b>Tutorial Primeiro Acesso</b> — entrar pela primeira vez em 5 minutos.</li>
  <li><b>Módulo Planejamento</b> — o coração do Portal: cronograma, avanço, atrasos, clima.</li>
  <li><b>Módulo Projetos / Documentos Técnicos</b> — biblioteca de projetos e ARTs.</li>
  <li><b>Módulo Avaliação (NPS)</b> — sua voz anônima sobre a obra.</li>
  <li><b>Recuperação de Senha</b> — quando esquece a senha.</li>
  <li><b>FAQ + Glossário + Quando contatar a FC</b>.</li>
</ol>
`;

const PRIMEIRO_ACESSO = `
<h2>Tutorial — Primeiro Acesso em 5 Minutos</h2>
<p class="lead">Siga estes 7 passos e em menos de 5 minutos você estará vendo a obra ao vivo.</p>

<div class="passo">
  <div class="passo-num">1</div>
  <div class="passo-corpo">
    <h4>Abra o link recebido</h4>
    <p>A FC Engenharia te envia um link como <code>https://erp-fc.replit.app/portal/cliente/login</code>. Clique nele em qualquer navegador moderno (Chrome, Edge, Safari, Firefox) — celular, tablet ou computador.</p>
  </div>
</div>

<div class="passo">
  <div class="passo-num">2</div>
  <div class="passo-corpo">
    <h4>Identifique-se</h4>
    <p>No campo <b>"CNPJ, CPF ou E-mail"</b> você pode usar QUALQUER UM dos três:</p>
    <ul>
      <li>CNPJ da sua empresa (ex.: 12.345.678/0001-99)</li>
      <li>Seu CPF (ex.: 123.456.789-00)</li>
      <li>O e-mail que você cadastrou junto à FC</li>
    </ul>
    <p>Não precisa formatar — só os números do CNPJ/CPF já funcionam. O sistema detecta automaticamente.</p>
  </div>
</div>

<div class="passo">
  <div class="passo-num">3</div>
  <div class="passo-corpo">
    <h4>Digite a senha</h4>
    <p>Senha enviada pela FC no primeiro acesso. Clique no <b>ícone de olho</b> para conferir o que está digitando. Se esqueceu, clique em <b>"Esqueci minha senha"</b> (instruções no final deste manual).</p>
  </div>
</div>

<div class="passo">
  <div class="passo-num">4</div>
  <div class="passo-corpo">
    <h4>Clique em "Entrar como cliente"</h4>
    <p>Você cai direto no <b>Hub do Cliente</b> — uma tela com cards coloridos para cada módulo liberado pra você.</p>
  </div>
</div>

<div class="passo">
  <div class="passo-num">5</div>
  <div class="passo-corpo">
    <h4>Clique no card "Planejamento"</h4>
    <p>Esse é o módulo principal. Se você tem mais de uma obra (caso do Santuário, que tem REVTE-CIVIL e VITRA), aparece uma tela intermediária para escolher qual obra quer acompanhar.</p>
  </div>
</div>

<div class="passo">
  <div class="passo-num">6</div>
  <div class="passo-corpo">
    <h4>Olhe primeiro a barra de Avanço Físico</h4>
    <p>Logo no topo da Visão Geral aparece uma barra dupla:</p>
    <ul>
      <li><b>Dourado (Previsto):</b> quanto a obra <i>deveria</i> estar.</li>
      <li><b>Azul (Realizado):</b> quanto está de verdade.</li>
    </ul>
    <p>O badge ao lado mostra o desvio (ex.: <span class="bad">-0,46% atrasado</span> ou <span class="good">+1,2% adiantado</span>).</p>
  </div>
</div>

<div class="passo">
  <div class="passo-num">7</div>
  <div class="passo-corpo">
    <h4>Explore as abas laterais</h4>
    <p>Na coluna esquerda você vê 10 abas: Visão Geral, Cronograma, Avanço Semanal, Prog. Semanal, Curva S, Revisões, Gantt, REFIS, Caminho Crítico, Efetivo, Diagrama de Rede. <b>Não precisa entender tudo agora</b> — este manual explica cada uma.</p>
  </div>
</div>

<div class="callout callout-green">
  <p class="callout-title">🎯 Dica de ouro para iniciante</p>
  <p>Se você só puder olhar <b>uma coisa por semana</b>, olhe a <b>Visão Geral</b>. Ela já te dá: avanço físico, atividades em atraso, clima da semana e histórico de REFIs. É o "raio-X" da obra.</p>
</div>
`;

// ─── MÓDULO PLANEJAMENTO ──────────────────────────────────────────
const MOD_PLANEJAMENTO_INTRO = `
<h2>Módulo Planejamento — O Coração do Portal</h2>

<div class="callout callout-blue">
  <p class="callout-title">O que é "Planejamento" em uma obra?</p>
  <p>É a divisão da obra em centenas de pequenas tarefas (chamadas de <b>atividades</b>), cada uma com data de início, fim e percentual de execução. Esse plano é o "GPS" da obra: a cada semana, comparamos onde a obra <i>deveria</i> estar com onde ela <i>está</i>, e isso vira indicadores como <b>SPI</b>, <b>Avanço Físico</b>, <b>Curva S</b>, etc.</p>
</div>

<h3>Quando devo entrar no módulo Planejamento?</h3>
<table class="quando-tab">
  <thead><tr><th>Frequência</th><th>O que olhar</th></tr></thead>
  <tbody>
    <tr><td><b>Toda semana</b></td><td>Visão Geral + Avanço Semanal</td></tr>
    <tr><td><b>A cada 2 semanas</b></td><td>Curva S + Caminho Crítico</td></tr>
    <tr><td><b>1 vez por mês</b></td><td>Gantt completo + REFIS + Revisões</td></tr>
    <tr><td><b>Quando algo te preocupar</b></td><td>Diagrama de Rede + Efetivo</td></tr>
  </tbody>
</table>

<h3>Os 4 indicadores que você precisa entender</h3>
<div class="grid2">
  <div class="kpi-card">
    <h4>📊 Avanço Físico</h4>
    <p>Percentual da obra concluída. Vai de 0% (não começou) a 100% (entregue).</p>
    <p class="exemplo">Exemplo: 1,38% Realizado vs 1,84% Previsto = obra começando, está levemente atrás.</p>
  </div>
  <div class="kpi-card">
    <h4>⏱️ SPI (Schedule Performance Index)</h4>
    <p>Realizado dividido por Previsto. <b>1,00</b> = no prazo. <b>&lt;1</b> = atrasada. <b>&gt;1</b> = adiantada.</p>
    <p class="exemplo">SPI 0,75 = a obra fez 75% do que deveria ter feito até agora.</p>
  </div>
  <div class="kpi-card">
    <h4>💰 CPI (Cost Performance Index)</h4>
    <p>Indicador financeiro: valor agregado dividido pelo custo real. <b>1,00</b> = dentro do orçamento.</p>
    <p class="exemplo">CPI 1,00 = a obra está gastando exatamente o previsto.</p>
  </div>
  <div class="kpi-card">
    <h4>📋 REFIS</h4>
    <p>"Relatório de Fiscalização". Snapshot OFICIAL semanal emitido pela gerenciadora. Cada REFIS congela os números do período.</p>
    <p class="exemplo">REFIS Nº 001 da semana 04/05/2026 = retrato oficial dessa semana.</p>
  </div>
</div>
`;

function abaPlan({ num, titulo, print, paraQueServe, comoLer, exemploPratico, dicaIniciante, faq }) {
  const img = print ? imgB64(print) : null;
  return `
<section class="aba-planejamento">
  <h3><span class="aba-badge">Aba ${num}</span> ${titulo}</h3>
  <div class="aba-corpo">
    <div class="aba-explica">
      <h4>📖 Para que serve</h4>
      <p>${paraQueServe}</p>
      <h4>👁️ Como ler</h4>
      <div>${comoLer}</div>
      <h4>💡 Exemplo prático</h4>
      <p class="exemplo">${exemploPratico}</p>
      <h4>🎯 Dica para iniciante</h4>
      <p class="dica">${dicaIniciante}</p>
      ${faq ? `<h4>❓ FAQ</h4><div class="faq">${faq}</div>` : ""}
    </div>
    ${img ? `<div class="aba-print"><img src="${img}" alt="${titulo}" /></div>` : ""}
  </div>
</section>
`;
}

const ABAS_PLANEJAMENTO = [
  abaPlan({
    num: 1, titulo: "Visão Geral", print: "05-planejamento-visao-geral.jpg",
    paraQueServe: "Painel executivo da obra: avanço físico, KPIs principais, atividades em atraso, clima da semana e histórico de REFIs. É a tela mais importante do Portal — se for olhar UMA coisa, olhe esta.",
    comoLer: `<ul>
      <li><b>Barra dupla colorida no topo:</b> dourado é o previsto, azul é o realizado. Quanto mais próximas, melhor.</li>
      <li><b>Cartões coloridos (KPIs):</b> Atividades concluídas, Avanço Físico, SPI, CPI e nº de REFIs.</li>
      <li><b>Atividades em Atraso (banner laranja):</b> lista das atividades que estão executando abaixo do previsto até hoje.</li>
      <li><b>Previsão do Tempo:</b> integração com OpenWeather. Mostra chuva/sol/vento dos próximos 5 dias úteis na localização da obra.</li>
      <li><b>Histórico de REFIs (tabela inferior):</b> todos os relatórios oficiais já emitidos, do mais recente ao mais antigo.</li>
    </ul>`,
    exemploPratico: "REVTE-CIVIL: Previsto 1,84%, Realizado 1,38%, SPI 0,75. Lê-se: a obra está fazendo 75% do que deveria — leve atraso de 0,46%, normal em fase inicial. Há 8 atividades em atraso e 3 dias com chance de chuva esta semana.",
    dicaIniciante: "Não se assuste com SPI baixo nas <b>primeiras semanas</b> de obra. Quando o avanço previsto é menor que 20%, o SPI exagera os números. Há um banner azul informativo na Curva S explicando isso.",
    faq: `<p><b>Por que o SPI mudou hoje sem ninguém ter mexido?</b> Porque o SPI é calculado <i>ao vivo</i> a partir do calendário. A cada dia que passa, o "previsto até hoje" sobe; se o "realizado" não acompanhar, o SPI cai automaticamente.</p>
    <p><b>Os números do Portal batem com o que a gerenciadora me mandou?</b> Sim. O Portal é fonte única e usa as mesmas fórmulas do ERP interno (regra de paridade Portal × Planejamento).</p>`
  }),
  abaPlan({
    num: 2, titulo: "Cronograma", print: "06-planejamento-cronograma.jpg",
    paraQueServe: "Visão tabular completa de TODAS as atividades da obra organizadas pela hierarquia EAP (Estrutura Analítica do Projeto). Mostra datas, percentuais previstos/realizados, pesos financeiros e status de cada item — é o 'extrato' detalhado do cronograma.",
    comoLer: `<ul>
      <li><b>Cabeçalho:</b> código EAP, descrição, data início, data fim, peso financeiro (%), avanço previsto (%), avanço realizado (%), status (cor).</li>
      <li><b>Hierarquia:</b> linhas em negrito são <i>grupos</i> (níveis 1, 2, 3); linhas comuns são <i>atividades-folha</i> (onde o avanço é realmente apontado).</li>
      <li><b>Cores de status:</b> verde = concluída, azul = em execução, cinza = futura/prevista, vermelho = atrasada.</li>
      <li><b>Soma dos pesos:</b> no rodapé aparece "100,00%" (a EAP foi totalmente decomposta) ou um valor diferente (lacuna a investigar).</li>
    </ul>`,
    exemploPratico: "Buscar 'instalação' filtra todas as atividades de instalação elétrica/hidráulica de uma vez. Útil para ver, dentro de um pacote, o que está concluído (verde) vs. o que ainda não começou (cinza).",
    dicaIniciante: "Use esta aba quando precisar saber a <b>data prevista exata</b> de uma atividade (ex.: 'quando vai começar o reboco do 2º pavimento?'). É o equivalente ao 'gantt em tabela'.",
    faq: `<p><b>Por que algumas atividades aparecem com avanço 0% mas a data já passou?</b> São atividades planejadas mas não iniciadas. Elas entram nos cálculos de "atividades em atraso" da Visão Geral.</p>`
  }),
  abaPlan({
    num: 3, titulo: "Avanço Semanal", print: "06-planejamento-avanco-semanal.jpg",
    paraQueServe: "Mostra a performance da semana corrente (segunda → domingo): quantas atividades estão na janela, qual o avanço previsto vs realizado, e a Aderência (SPI semanal).",
    comoLer: `<ul>
      <li><b>4 cartões no topo:</b> Atividades ativas, Previsto da semana, Realizado da semana, Aderência (% que conseguiu cumprir).</li>
      <li><b>Tabela:</b> lista das atividades da semana com EAP, datas, % realizado e status (Concluída / Em execução / Prevista).</li>
      <li>Atividades multi-semana contribuem proporcionalmente — se uma atividade dura 4 semanas, ela conta 1/4 nesta semana.</li>
    </ul>`,
    exemploPratico: "Aderência 70% significa que a obra cumpriu 70% do plano semanal. Acima de 90% é excelente; entre 70-90% normal; abaixo de 70% acende alerta.",
    dicaIniciante: "Esta é a aba para responder <b>'o que está rolando ESTA SEMANA?'</b>. É a leitura semanal recomendada para quem não quer se aprofundar.",
    faq: `<p><b>Domingo aparece zerado, é normal?</b> Sim, a semana é seg→dom mas atividades raramente são lançadas no domingo. O cálculo se ajusta na segunda.</p>`
  }),
  abaPlan({
    num: 4, titulo: "Prog. Semanal", print: "06-planejamento-prog-semanal.jpg",
    paraQueServe: "Programação <b>antecipada</b> da semana com marcos, entregáveis e responsáveis. Diferente do Avanço Semanal (olha para trás, mostra o que foi feito), a Prog. Semanal olha para FRENTE — o que vai acontecer.",
    comoLer: `<ul>
      <li><b>Lista de atividades-folha</b> que TÊM apontamento previsto na janela seg→dom.</li>
      <li>Cada item mostra: código EAP, descrição, data início e fim na janela, % previsto da semana, equipe responsável.</li>
      <li>Marcos importantes ficam destacados (losango roxo).</li>
    </ul>`,
    exemploPratico: "Programação da semana 11→17 de maio: 'Conclusão de protensão laje 3º pav' (marco), 'Início de alvenaria 2º pav', 'Recebimento de esquadrias'. O cliente vê o que esperar antes de visitar a obra.",
    dicaIniciante: "Use esta aba na <b>segunda-feira de manhã</b> para ter a visão antecipada da semana e <b>planejar visitas técnicas</b> nos dias-chave (entregas, marcos, concretagens).",
    faq: `<p><b>Por que minha semana está vazia?</b> Pode ser que a obra esteja em pausa programada (recesso, paralisação por chuva) ou que ainda não haja apontamento. Confira a aba REFIS para ver a última semana com movimento oficial.</p>`
  }),
  abaPlan({
    num: 5, titulo: "Curva S", print: "06-planejamento-curva-s.jpg",
    paraQueServe: "Gráfico clássico de gerenciamento de projetos. Compara o Baseline (plano original), o Realizado e a Tendência ao longo do tempo. Permite ver visualmente se a obra está convergindo ou divergindo do plano.",
    comoLer: `<ul>
      <li><b>Linha azul (Baseline):</b> plano original aprovado.</li>
      <li><b>Linha verde (Realizado):</b> o que foi efetivamente executado.</li>
      <li><b>Linha tracejada (Tendência):</b> projeção do que vai acontecer se a velocidade atual continuar.</li>
      <li><b>Toggle Trabalho ↔ Financeira:</b> alterna entre % físico e R$ acumulado.</li>
    </ul>`,
    exemploPratico: "Se a linha verde está abaixo da azul e a tracejada cruza a azul mais à frente, significa: 'estamos atrasados, mas vamos recuperar'. Se a tracejada nunca cruza a azul, a obra vai atrasar.",
    dicaIniciante: "Não se assuste com a aparência. A Curva S vira uma curva em formato de 'S' porque obras começam devagar, aceleram no meio e desaceleram no fim. Isso é <b>normal</b>.",
    faq: `<p><b>Por que apareceu um banner azul "fase inicial"?</b> Quando o avanço é menor que 20%, o SPI puro produz números absurdos (ex.: SPI=0,3 não significa que vai atrasar 70%). O banner é um aviso técnico — referência: PMBOK / Earned Schedule.</p>`
  }),
  abaPlan({
    num: 6, titulo: "Revisões", print: "06-planejamento-revisoes.jpg",
    paraQueServe: "Histórico de TODAS as alterações no cronograma da obra. Cada vez que uma atividade muda de prazo, escopo ou peso, gera uma revisão registrada e datada.",
    comoLer: `<ul>
      <li>Lista cronológica das revisões com Nº da revisão, data, autor, motivo e principais mudanças.</li>
      <li>Permite o cliente entender <i>por quê</i> o prazo mudou (chuva, mudança de projeto, atraso de fornecedor, etc.).</li>
    </ul>`,
    exemploPratico: "Rev. 47 - 15/04/2026 - Motivo: 'Replanejamento devido a chuvas excepcionais em março'. Atividades afetadas: 23.",
    dicaIniciante: "Esta aba é seu <b>histórico de transparência</b>. Sempre que tiver dúvida 'mas o prazo não era outro?', confira aqui."
  }),
  abaPlan({
    num: 7, titulo: "Gantt", print: "06-planejamento-gantt.jpg",
    paraQueServe: "Diagrama de barras horizontais mostrando todas as atividades no tempo. Permite ver visualmente sobreposições, sequências e a 'cara' geral da obra.",
    comoLer: `<ul>
      <li><b>Eixo vertical:</b> atividades agrupadas por nível EAP.</li>
      <li><b>Eixo horizontal:</b> tempo (semanas ou meses).</li>
      <li><b>Cores:</b> Grupo (preto), Atividade (azul), Marco (losango roxo), Concluída (verde), Linha vermelha vertical = HOJE.</li>
      <li><b>Filtros:</b> Nível 1 (visão executiva), Nível 2/3 (mais detalhe), Tudo (completo).</li>
    </ul>`,
    exemploPratico: "Para uma obra de 426 dias com 116 itens, comece com 'Nível 1' para ver os grandes pacotes (Fundações, Estrutura, Alvenaria, Acabamento). Só expanda quando precisar.",
    dicaIniciante: "Comece sempre <b>recolhido</b>. Use 'Recolher Tudo' e vá expandindo só os grupos que te interessam — caso contrário a tela fica poluída."
  }),
  abaPlan({
    num: 8, titulo: "REFIS", print: "06-planejamento-refis.jpg",
    paraQueServe: "Lista TODOS os Relatórios de Fiscalização (REFIS) já emitidos pela gerenciadora. Cada REFIS é um snapshot oficial e congelado dos números da semana — funciona como o 'extrato bancário' da obra.",
    comoLer: `<ul>
      <li>Cada linha é um REFIS: Número, semana, % previsto, % realizado, SPI, status (consolidado/preliminar).</li>
      <li>Clicar em um REFIS abre o documento completo (PDF ou tela detalhada).</li>
    </ul>`,
    exemploPratico: "REFIS 001 - semana 04/05/2026 - Previsto 1,84%, Realizado 1,38%, SPI 0,75 - Consolidado. Esse é o ponto oficial usado pelo banco/gerenciadora.",
    dicaIniciante: "Os REFIS são a <b>base contratual</b>. Se o seu contrato menciona 'desvio máximo permitido', é a partir dos REFIS que isso é medido."
  }),
  abaPlan({
    num: 9, titulo: "Caminho Crítico", print: "06-planejamento-caminho-critico.jpg",
    paraQueServe: "Aplica o método CPM (Critical Path Method) para identificar quais atividades são <b>críticas</b> — ou seja, qualquer atraso nelas atrasa a entrega final da obra.",
    comoLer: `<ul>
      <li><b>Crítico (vermelho):</b> atividades com folga zero. Prioridade MÁXIMA.</li>
      <li><b>Quase crítico (amarelo):</b> com pouca folga, podem virar críticas se não forem cuidadas.</li>
      <li><b>Com folga (azul):</b> têm tempo de respiro, baixo risco.</li>
      <li>Card "Ação operacional" sugere o que fazer (ex.: tratamento diário, cobertura integral de insumos).</li>
    </ul>`,
    exemploPratico: "Se das 64 atividades, 3 estão no caminho crítico (Retirada de divisória, Desmobilização, Final de obra) e 1 atrasa 5 dias, a entrega final atrasa exatamente 5 dias.",
    dicaIniciante: "Foque sua atenção nos <b>vermelhos</b>. Eles são poucos mas são determinantes para a data de entrega. Os azuis você pode ignorar no dia-a-dia."
  }),
  abaPlan({
    num: 10, titulo: "Efetivo", print: "06-planejamento-efetivo.jpg",
    paraQueServe: "Mostra a quantidade de pessoas (mão de obra) alocadas na obra ao longo do tempo, separadas por função e tipo de contrato (próprio, terceirizado, PJ).",
    comoLer: `<ul>
      <li><b>Gráfico de barras:</b> efetivo por mês ou semana.</li>
      <li><b>Detalhamento por função:</b> pedreiro, servente, eletricista, encanador, mestre, etc.</li>
      <li>Permite ver picos e vales — a obra está com gente suficiente?</li>
    </ul>`,
    exemploPratico: "Pico esperado de 80 pessoas em junho/2026 mas o gráfico mostra só 45 hoje = pode ser sinal de subdimensionamento da equipe.",
    dicaIniciante: "Compare o efetivo real com o que estava previsto. Atrasos muitas vezes vêm de <b>poucas pessoas</b> alocadas, não de problemas de execução."
  }),
  abaPlan({
    num: 11, titulo: "Diagrama de Rede", print: "06-planejamento-diagrama-rede.jpg",
    paraQueServe: "Visão técnica avançada: mostra as DEPENDÊNCIAS entre atividades em forma de rede (nós e setas). Permite entender a lógica do plano: 'A vem antes de B, B vem antes de C'.",
    comoLer: `<ul>
      <li>Cada caixa é uma atividade.</li>
      <li>Setas indicam predecessoras → sucessoras.</li>
      <li>Cores indicam status (atrasada, em andamento, concluída).</li>
    </ul>`,
    exemploPratico: "Útil para entender por que uma atividade 'aparentemente atrasada' não é problema: ela depende de outra que ainda nem começou.",
    dicaIniciante: "Esta aba é <b>técnica</b>. Não se preocupe se não entender de primeira — peça pra equipe de planejamento da FC explicar usando o diagrama na tela."
  }),
];

const FAQ_PLANEJAMENTO = `
<h3>FAQ Geral do Módulo Planejamento</h3>
<dl class="faq-list">
  <dt>O Portal mostra os mesmos números que o ERP interno da FC?</dt>
  <dd><b>Sim, sempre.</b> Existe uma "Regra de Ouro": o Portal NUNCA pode divergir do módulo Planejamento. Mesmo universo de atividades, mesmas fórmulas. Se você ver discrepância, contate a FC imediatamente.</dd>
  <dt>Posso imprimir o que vejo?</dt>
  <dd>Sim, todas as telas têm botão "Imprimir" e "PDF" no canto superior direito. O PDF gera um documento limpo, sem menus, próprio pra envio interno.</dd>
  <dt>Como faço para mudar entre obras?</dt>
  <dd>Use o seletor "OBRA — clique para trocar" no topo da sidebar esquerda. Ou clique em "Trocar de Obra" no rodapé da sidebar.</dd>
  <dt>Os dados são em tempo real?</dt>
  <dd>Sim. Cada vez que a equipe da FC lança uma atualização (apontamento de atividade, novo REFIS, revisão de cronograma), o Portal atualiza imediatamente.</dd>
  <dt>Tem app pra celular?</dt>
  <dd>Não há app separado, mas o Portal é totalmente responsivo. Funciona perfeitamente em smartphone e tablet pelo navegador.</dd>
</dl>
`;

// ─── MÓDULO PROJETOS / DOCUMENTOS ─────────────────────────────────
const PROJDOC_IMG = imgB64("08-projdoc-detalhado.jpg") || imgB64("08-projdoc-obra.jpg");
const MOD_PROJDOC = `
<h2>Módulo Projetos / Documentos Técnicos</h2>

<div class="callout callout-blue">
  <p class="callout-title">O que é este módulo?</p>
  <p>É a <b>biblioteca técnica</b> da sua obra. Aqui ficam todos os documentos oficiais: projetos arquitetônicos, estruturais, hidrossanitários, elétricos, ARTs, RRTs, memoriais, especificações, e qualquer documento técnico que precise ser entregue ao cliente.</p>
  <p>Tudo é versionado (Rev. 00, 01, 02…) e o Portal sempre mostra a <b>versão mais recente aprovada</b>.</p>
</div>

${PROJDOC_IMG ? `<div class="full-print"><img src="${PROJDOC_IMG}" alt="Tela completa do Proj/Doc"/></div>
<p class="legenda-print">Tela completa do módulo Proj./Doc. — REVTE-CIVIL · Santuário Aparecida</p>` : ""}

<h3>Anatomia da tela — elementos numerados</h3>
<table class="elementos-tab">
  <thead><tr><th>Nº</th><th>Elemento</th><th>Função detalhada</th></tr></thead>
  <tbody>
    <tr><td>1</td><td><b>Header com obra</b></td><td>Mostra nome da obra ativa, código e link "Trocar de obra" para voltar à seleção.</td></tr>
    <tr><td>2</td><td><b>KPIs de status</b></td><td>6 cards no topo: <b>Total</b> · <b>Aprovados</b> (verde) · <b>Em Revisão</b> (azul) · <b>Em Elaboração</b> (amarelo) · <b>Reprovados</b> (rosa) · <b>Sem arquivo</b> (laranja). Mostram a contagem por status.</td></tr>
    <tr><td>3</td><td><b>Banner "Falta arquivo"</b></td><td>(Rev. 1589) Aparece quando há documentos cadastrados mas SEM o PDF/DWG anexado. Indica pendência para o time da FC anexar o arquivo.</td></tr>
    <tr><td>4</td><td><b>Campo busca</b></td><td>Pesquisa instantânea em código, título, tipo e disciplina do documento.</td></tr>
    <tr><td>5</td><td><b>Filtros de status (chips)</b></td><td>Botões clicáveis em linha (não combobox): Todos · Em Elaboração · Em Revisão · Aprovado · Reprovado · Cancelado · Obsoleto · Sem Arquivo. Chip ativo fica destacado em azul.</td></tr>
    <tr><td>6</td><td><b>Toggle Árvore × Lista</b></td><td><b>Árvore</b> (padrão): agrupa por Disciplina → Formato (PDF/DWG/etc), com expandir/recolher. <b>Lista</b>: tabela plana com todos juntos.</td></tr>
    <tr><td>7</td><td><b>Linha de documento</b></td><td>Cada linha mostra: código, título, tipo, disciplina, revisão, data, badge de status colorido, e botões de ação à direita.</td></tr>
    <tr><td>8</td><td><b>Botão 👁 Visualizar</b></td><td>Abre PDF/imagem inline no visualizador embutido (sem sair do Portal). Para DWG/DXF não abre — vai direto pro download.</td></tr>
    <tr><td>9</td><td><b>Botão ⬇ Baixar</b></td><td>Faz download autenticado do arquivo da linha atual (a revisão exibida naquele item, qualquer que seja seu status, desde que tenha arquivo anexado).</td></tr>
    <tr><td>10</td><td><b>Badge "Rev. NN"</b></td><td>Apenas indicação visual do número da revisão atual do documento. (Não clicável — para histórico completo de revisões consulte o time da FC.)</td></tr>
    <tr><td>11</td><td><b>Visualizador inline (PDF)</b></td><td>Quando você clica em 👁, abre dentro de um modal com cabeçalho do Portal, sem barra de ferramentas do PDF (toolbar=0) — visual limpo para leitura técnica.</td></tr>
    <tr><td>12</td><td><b>Botão Imprimir</b></td><td>Gera PDF da própria tela (lista filtrada) com cabeçalho institucional + nome do cliente + data — ótimo para enviar pra equipe interna.</td></tr>
  </tbody>
</table>

<h3>Status dos documentos — entendendo as cores</h3>
<table class="quando-tab">
  <thead><tr><th>Status</th><th>Cor</th><th>O que significa</th></tr></thead>
  <tbody>
    <tr><td><b>Aprovado</b></td><td>🟢 Verde</td><td>Pronto para uso em obra. Versão oficial liberada para execução.</td></tr>
    <tr><td><b>Em Revisão</b></td><td>🔵 Azul</td><td>Está sendo revisado por um responsável técnico. Não use ainda.</td></tr>
    <tr><td><b>Em Elaboração</b></td><td>🟡 Amarelo</td><td>Ainda em desenvolvimento. NÃO use para execução.</td></tr>
    <tr><td><b>Reprovado</b></td><td>🔴 Rosa</td><td>Foi rejeitado. Volta para correção.</td></tr>
    <tr><td><b>Cancelado</b></td><td>⚪ Cinza</td><td>Documento descontinuado.</td></tr>
    <tr><td><b>Obsoleto</b></td><td>⚪ Cinza claro</td><td>Foi superado por uma revisão mais nova. Não usar.</td></tr>
  </tbody>
</table>

<h3>Tipos de documentos que você vai encontrar</h3>
<table class="quando-tab">
  <thead><tr><th>Tipo</th><th>O que é</th><th>Quando consultar</th></tr></thead>
  <tbody>
    <tr><td><b>Projetos (PDF)</b></td><td>Plantas, cortes, fachadas, detalhes</td><td>Antes de aprovar mudanças</td></tr>
    <tr><td><b>ART / RRT</b></td><td>Anotação/Registro de Responsabilidade Técnica</td><td>Para entrega ao banco/seguradora</td></tr>
    <tr><td><b>Memoriais</b></td><td>Texto descrevendo materiais, métodos e padrões</td><td>Para entender escopo e qualidade contratada</td></tr>
    <tr><td><b>Especificações</b></td><td>Listas de materiais com marca/modelo</td><td>Quando há dúvida sobre acabamento</td></tr>
    <tr><td><b>Memoriais de cálculo</b></td><td>Documentos de cálculo estrutural, hidráulico, elétrico</td><td>Engenheiros e fiscais</td></tr>
  </tbody>
</table>

<h3>Tutorial — Como baixar um projeto</h3>
<div class="passo">
  <div class="passo-num">1</div>
  <div class="passo-corpo">
    <h4>Vá ao Hub e clique no card "Proj./Doc."</h4>
    <p>O ícone roxo no Hub principal.</p>
  </div>
</div>
<div class="passo">
  <div class="passo-num">2</div>
  <div class="passo-corpo">
    <h4>Selecione a obra</h4>
    <p>Igual ao módulo Planejamento, escolha qual obra quer ver.</p>
  </div>
</div>
<div class="passo">
  <div class="passo-num">3</div>
  <div class="passo-corpo">
    <h4>Use os filtros laterais</h4>
    <p>Filtre por <b>Disciplina</b> (Arquitetura, Estrutural, Elétrico, Hidrossanitário…) ou por <b>Status</b> (Aprovado, Em Análise, Revisado).</p>
  </div>
</div>
<div class="passo">
  <div class="passo-num">4</div>
  <div class="passo-corpo">
    <h4>Localize o documento</h4>
    <p>Cada item da lista mostra: nome do documento, disciplina, revisão, data, autor e responsável técnico.</p>
  </div>
</div>
<div class="passo">
  <div class="passo-num">5</div>
  <div class="passo-corpo">
    <h4>Clique em "Baixar"</h4>
    <p>O PDF/DWG abre numa nova aba ou baixa direto. Sempre vem a <b>versão mais recente aprovada</b>.</p>
  </div>
</div>

<h3>Como saber se estou vendo a versão mais nova?</h3>
<p>Cada documento tem um número de revisão (Rev. 00, Rev. 01, Rev. 02…). O Portal mostra <b>SEMPRE a revisão mais recente aprovada</b>. Se você quiser comparar com versões anteriores, há um histórico clicando em "Ver revisões".</p>

<div class="callout callout-amber">
  <p class="callout-title">⚠️ Atenção</p>
  <p>Documentos marcados como <b>"Em Análise"</b> ou <b>"Preliminar"</b> AINDA NÃO devem ser usados para execução em campo. Sempre confira o status no canto superior direito do card do documento.</p>
</div>

<h3>FAQ do Módulo Documentos</h3>
<dl class="faq-list">
  <dt>O documento que preciso não está aqui, e agora?</dt>
  <dd>Pode ser que: (a) ainda não foi liberado para o cliente, (b) está em revisão técnica interna, ou (c) sua liberação não inclui esse pacote. Contate a FC pelo e-mail/WhatsApp do gerente da obra.</dd>
  <dt>Posso compartilhar o PDF com terceiros?</dt>
  <dd>Sim, os PDFs baixados são seus. Mas lembre-se: o link do Portal é pessoal e não deve ser compartilhado.</dd>
  <dt>O que é ART e RRT?</dt>
  <dd><b>ART</b> = Anotação de Responsabilidade Técnica (CREA, para engenheiros). <b>RRT</b> = Registro de Responsabilidade Técnica (CAU, para arquitetos). Ambos são obrigatórios por lei.</dd>
</dl>
`;

// ─── MÓDULO AVALIAÇÃO ─────────────────────────────────────────────
const AVAL_FORM_IMG = imgB64("09-avaliacao-formulario-completo.jpg");
const AVAL_JA_IMG = imgB64("09-avaliacao-ja-respondida.jpg");
const MOD_AVALIACAO = `
<h2>Módulo Avaliação (NPS Anônima)</h2>

<div class="callout callout-blue">
  <p class="callout-title">Por que o seu feedback importa?</p>
  <p>A FC Engenharia leva a sério a percepção do cliente. O módulo Avaliação aplica metodologia <b>NPS (Net Promoter Score)</b> com periodicidade <b>mensal ou anual</b> (configurável). O formulário cobre <b>5 dimensões</b>: Equipe, Gestor, Empresa, Escritório Central e Obra/Execução — além da nota geral (NPS) e blocos abertos de pontos fortes/fracos.</p>
</div>

<h3>Anonimato real (LGPD)</h3>
<div class="callout callout-green">
  <p class="callout-title">🔒 Como funciona o anonimato</p>
  <p>O sistema NÃO armazena: identidade do respondente, CNPJ, IP, ou qualquer dado que ligue você à resposta. Apenas registramos uma <b>marcação</b> (cred_id + ano_mes) na tabela <code>cliente_avaliacao_marcacoes</code> dizendo "esta credencial já enviou no mês X" — para impedir múltiplos envios. Essa marcação NÃO se cruza com o conteúdo da avaliação (que vai para outra tabela <code>cliente_avaliacoes</code> sem ID do respondente).</p>
  <p>Resultado: nem a equipe, nem a diretoria, nem os DBAs conseguem rastrear quem respondeu o quê. Pode ser <b>100% honesto</b>.</p>
</div>

${AVAL_FORM_IMG ? `<div class="full-print"><img src="${AVAL_FORM_IMG}" alt="Formulário completo de avaliação NPS"/></div>
<p class="legenda-print">Formulário completo de Avaliação (capturado com a marcação do mês temporariamente desligada para fins de documentação)</p>` : ""}

<h3>Anatomia do formulário — elementos numerados</h3>
<table class="elementos-tab">
  <thead><tr><th>Nº</th><th>Bloco / Campo</th><th>Função detalhada</th></tr></thead>
  <tbody>
    <tr><td>1</td><td><b>Banner verde "100% anônima"</b></td><td>Selo de privacidade no topo do formulário, reforçando a promessa LGPD. Sempre visível durante o preenchimento.</td></tr>
    <tr><td>2</td><td><b>Sobre qual obra? (opcional)</b></td><td>Combobox para vincular a avaliação a uma obra específica OU deixar como "geral / não específica". Útil quando o cliente tem várias obras e quer dar feedback de uma só.</td></tr>
    <tr><td>3</td><td><b>Nota geral (NPS) ★</b></td><td>Campo OBRIGATÓRIO. Escala 0-10 em botões grandes. É a pergunta-síntese: "qual sua satisfação geral com a FC?". Esta é a nota que entra no cálculo numérico do NPS (Promotores 9-10 / Neutros 7-8 / Detratores 0-6).</td></tr>
    <tr><td>4</td><td><b>Bloco "Equipe FC na obra"</b></td><td>Avalia a equipe presente em campo: Equipe FC (técnica e relacionamento), Atendimento e Comunicação. + Comentário aberto sobre postura, técnica, segurança, pontualidade.</td></tr>
    <tr><td>5</td><td><b>Bloco "Gestor / Responsável FC"</b></td><td>Avalia o gestor responsável pela obra: liderança, decisões, proatividade. Permite informar o nome do gestor (opcional). + Comentário "como o gestor pode evoluir".</td></tr>
    <tr><td>6</td><td><b>Bloco "FC Engenharia (Empresa)"</b></td><td>Avalia a empresa como instituição: reputação, transparência, comunicação institucional. + Comentário sobre a postura da empresa.</td></tr>
    <tr><td>7</td><td><b>Bloco "Escritório Central / Backoffice"</b> (Rev. 1592)</td><td>Avalia o suporte administrativo (atendimento, retorno de e-mails, agilidade) e Faturamento/Contratos/Financeiro. + Comentário sobre suporte administrativo.</td></tr>
    <tr><td>8</td><td><b>Bloco "Obra / Execução"</b></td><td>3 notas: Andamento da Obra, Cumprimento de Prazos, Qualidade do Serviço Entregue.</td></tr>
    <tr><td>9</td><td><b>Recomendaria a FC?</b></td><td>Campo SEPARADO da nota geral. 3 opções com emoji: 😊 "Sim, com certeza" (verde) · 😐 "Talvez" (amarelo) · 😞 "Não" (vermelho). Complementa o NPS numérico do item 3 com uma resposta qualitativa rápida.</td></tr>
    <tr><td>10</td><td><b>Pontos fortes — o que mais te impressionou positivamente?</b></td><td>Texto longo (opcional). Vai para reconhecimento da equipe.</td></tr>
    <tr><td>11</td><td><b>Pontos fracos — o que precisa melhorar?</b></td><td>Texto longo (opcional). Vira plano de ação interno.</td></tr>
    <tr><td>12</td><td><b>Perguntas extras (Rev. 1595)</b></td><td>Bloco opcional de perguntas personalizadas configuradas pelo admin da FC. Podem ser do tipo: nota 0-10, sim/não/talvez, texto curto ou texto longo. Aparecem agrupadas por seção (ex.: "Pós-obra", "Sustentabilidade").</td></tr>
    <tr><td>13</td><td><b>Botão "Enviar avaliação anônima"</b></td><td>Verde, com ícone ✨. Bloqueado até preencher pelo menos a Nota Geral e as perguntas extras obrigatórias (marcadas com *).</td></tr>
  </tbody>
</table>

<h3>Tela "já avaliei este mês" (estado pós-envio)</h3>
${AVAL_JA_IMG ? `<div class="meio-print"><img src="${AVAL_JA_IMG}" alt="Estado já avaliou este mês"/></div>
<p class="legenda-print">Quando você já enviou a avaliação do período, o módulo fica desativado até a próxima janela.</p>` : ""}
<p>Após enviar, o card "Avaliação" no Hub fica marcado com <b>✓ OK</b> e tracejado, exibindo a data da próxima janela (ex.: "Disponível em junho/2026"). Se entrar no módulo, vê uma tela com o ícone verde 🛡 e a mensagem confirmando que o envio foi registrado anonimamente.</p>

<h3>Tutorial completo — Como avaliar (passo a passo)</h3>
<div class="passo">
  <div class="passo-num">1</div>
  <div class="passo-corpo">
    <h4>Entre pelo Hub e clique no card "Avaliação"</h4>
    <p>Se já avaliou este período, vai aparecer ✓ OK no card e a tela do módulo mostra a confirmação de envio.</p>
  </div>
</div>
<div class="passo">
  <div class="passo-num">2</div>
  <div class="passo-corpo">
    <h4>Leia o banner verde no topo</h4>
    <p>Reforça que é 100% anônimo. Você pode ser duro nas críticas — ninguém vai saber que foi você.</p>
  </div>
</div>
<div class="passo">
  <div class="passo-num">3</div>
  <div class="passo-corpo">
    <h4>(Opcional) Selecione a obra</h4>
    <p>Se quer avaliar especificamente uma obra (caso tenha várias), escolha no dropdown. Senão deixe "Avaliação geral".</p>
  </div>
</div>
<div class="passo">
  <div class="passo-num">4</div>
  <div class="passo-corpo">
    <h4>Dê a Nota Geral (★ obrigatório)</h4>
    <p>De 0 a 10. É a única pergunta realmente obrigatória — todas as outras são opcionais (a não ser que o admin tenha configurado perguntas extras com *).</p>
  </div>
</div>
<div class="passo">
  <div class="passo-num">5</div>
  <div class="passo-corpo">
    <h4>Avance pelos 5 blocos</h4>
    <p>Equipe → Gestor → Empresa → Escritório Central → Obra/Execução. Em cada um, dê notas e (se quiser) comentários abertos.</p>
  </div>
</div>
<div class="passo">
  <div class="passo-num">6</div>
  <div class="passo-corpo">
    <h4>Marque sua recomendação</h4>
    <p>😊 Sim · 😐 Talvez · 😞 Não. É um indicador qualitativo complementar — a nota numérica do NPS já foi a do passo 4 (Nota Geral 0-10).</p>
  </div>
</div>
<div class="passo">
  <div class="passo-num">7</div>
  <div class="passo-corpo">
    <h4>Use os campos abertos sem reservas</h4>
    <p>"Pontos fortes" vai para reconhecimento da equipe. "Pontos fracos" vira plano de ação interno. Seja específico — críticas vagas ajudam pouco.</p>
  </div>
</div>
<div class="passo">
  <div class="passo-num">8</div>
  <div class="passo-corpo">
    <h4>Clique em "Enviar avaliação anônima"</h4>
    <p>Aparece toast de "Obrigado! Sua avaliação foi enviada." e o módulo é bloqueado até a próxima janela.</p>
  </div>
</div>

<h3>As notas explicadas — o que cada nota mede</h3>
<table class="quando-tab">
  <thead><tr><th>Nota</th><th>O que significa</th><th>Exemplo de contexto</th></tr></thead>
  <tbody>
    <tr><td><b>Nota Geral</b></td><td>Sua satisfação global com a FC</td><td>Pergunta-chave do NPS — entra no cálculo de Promotores/Detratores</td></tr>
    <tr><td><b>Equipe</b></td><td>Time técnico em campo</td><td>Mestres de obra, encarregados, técnicos de campo</td></tr>
    <tr><td><b>Atendimento</b></td><td>Comunicação dia-a-dia</td><td>Retorno de WhatsApp, e-mail, telefone</td></tr>
    <tr><td><b>Gestor</b></td><td>Engenheiro/responsável da obra</td><td>Liderança, decisões técnicas, proatividade</td></tr>
    <tr><td><b>Empresa</b></td><td>FC como instituição</td><td>Reputação, postura, comunicação institucional</td></tr>
    <tr><td><b>Escritório</b></td><td>Backoffice administrativo</td><td>Suporte, retorno de e-mails do escritório</td></tr>
    <tr><td><b>Faturamento</b></td><td>Contratos e financeiro</td><td>Cobrança, notas fiscais, contratos administrativos</td></tr>
    <tr><td><b>Andamento</b></td><td>Como a obra está fluindo</td><td>Ritmo geral, organização do canteiro</td></tr>
    <tr><td><b>Prazo</b></td><td>Cumprimento de cronograma</td><td>SPI, atrasos, replanejamentos</td></tr>
    <tr><td><b>Qualidade</b></td><td>Acabamento entregue</td><td>Padrão técnico, retrabalhos, inspeções</td></tr>
  </tbody>
</table>

<h3>Como funciona o anonimato</h3>
<p>Suas respostas são <b>100% anônimas</b>. A equipe operacional da obra recebe apenas a nota agregada (média) e os comentários sem nome. Apenas a diretoria executiva e o time de qualidade têm acesso ao painel completo, e mesmo assim sem identificar o respondente individual.</p>

<div class="callout callout-green">
  <p class="callout-title">🔒 Promessa de anonimato</p>
  <p>Você pode escrever críticas duras sem medo de represália. Inclusive, <b>queremos</b> ouvir o que está incomodando — é assim que melhoramos.</p>
</div>

<h3>Periodicidade</h3>
<ul>
  <li><b>1 avaliação por mês</b>, sempre disponível a partir do dia 1º.</li>
  <li>Janela de 30 dias para responder. Após responder, o card no Hub fica marcado como ✓ OK e a próxima janela aparece no mês seguinte.</li>
  <li>Você recebe lembrete por e-mail no dia 1º se ainda não respondeu.</li>
</ul>

<h3>As 8 perguntas core</h3>
<ol class="perguntas-nps">
  <li><b>Comunicação:</b> "Como você avalia a comunicação da equipe FC com você este mês?"</li>
  <li><b>Qualidade técnica:</b> "Como você avalia a qualidade técnica do que está sendo executado?"</li>
  <li><b>Cumprimento de prazo:</b> "A obra está cumprindo os prazos prometidos?"</li>
  <li><b>Limpeza e organização:</b> "O canteiro está limpo e organizado?"</li>
  <li><b>Segurança:</b> "Você percebe que a segurança do trabalho está sendo levada a sério?"</li>
  <li><b>Resolução de problemas:</b> "Quando você reporta um problema, ele é resolvido com agilidade?"</li>
  <li><b>Transparência:</b> "Você se sente bem informado sobre o andamento da obra?"</li>
  <li><b>Satisfação geral (NPS):</b> "De 0 a 10, o quanto você recomendaria a FC Engenharia para outro empreendedor?"</li>
</ol>

<h3>Tutorial — Como avaliar</h3>
<div class="passo">
  <div class="passo-num">1</div>
  <div class="passo-corpo">
    <h4>No Hub, clique no card "Avaliação"</h4>
    <p>Se ele estiver marcado como ✓ OK, você já avaliou esse mês — só vai aparecer um aviso da próxima janela.</p>
  </div>
</div>
<div class="passo">
  <div class="passo-num">2</div>
  <div class="passo-corpo">
    <h4>Responda as 8 perguntas</h4>
    <p>Cada pergunta usa nota de 0 a 10 (escala NPS padrão). Há também caixas de texto livre para comentário se quiser detalhar.</p>
  </div>
</div>
<div class="passo">
  <div class="passo-num">3</div>
  <div class="passo-corpo">
    <h4>(Opcional) Deixe um comentário aberto</h4>
    <p>Há um campo final "Algo mais que você gostaria de dizer?" — use sem reservas.</p>
  </div>
</div>
<div class="passo">
  <div class="passo-num">4</div>
  <div class="passo-corpo">
    <h4>Clique em "Enviar avaliação"</h4>
    <p>Pronto. O Hub atualiza para ✓ OK e te agradece. Sua avaliação entra anonimizada na próxima leitura da diretoria.</p>
  </div>
</div>

<h3>Como interpretar o NPS</h3>
<table class="quando-tab">
  <thead><tr><th>Nota</th><th>Categoria</th><th>Significado</th></tr></thead>
  <tbody>
    <tr><td>9 ou 10</td><td>🟢 Promotor</td><td>Cliente muito satisfeito, recomendaria a FC</td></tr>
    <tr><td>7 ou 8</td><td>🟡 Neutro</td><td>Satisfeito mas não entusiasmado</td></tr>
    <tr><td>0 a 6</td><td>🔴 Detrator</td><td>Insatisfeito, não recomendaria</td></tr>
  </tbody>
</table>
<p class="exemplo">Exemplo: NPS = % Promotores − % Detratores. Acima de 50 é excelente; entre 30-50 muito bom; entre 0-30 normal; negativo é alerta vermelho.</p>

<h3>FAQ Avaliação</h3>
<dl class="faq-list">
  <dt>Posso avaliar mais de uma vez no mês?</dt>
  <dd>Não. Apenas 1 avaliação por mês para evitar viés. Se quiser dar feedback fora do ciclo, use o e-mail do gerente.</dd>
  <dt>Minha nota afeta o atendimento?</dt>
  <dd>Pelo contrário: notas baixas são revisadas pela diretoria e geram plano de ação. Você ajuda a obra <i>melhorando</i> dando feedback honesto.</dd>
  <dt>O que acontece com o comentário texto?</dt>
  <dd>É lido pela diretoria executiva e pela qualidade. Se for crítica acionável, vira tarefa interna. Se for elogio, vira reconhecimento da equipe.</dd>
</dl>
`;

// ─── ESQUECI SENHA ────────────────────────────────────────────────
const ESQUECI = `
<h2>Recuperação de Senha</h2>
<p class="lead">Esqueceu a senha? Em 3 passos você recupera o acesso.</p>

<div class="passo">
  <div class="passo-num">1</div>
  <div class="passo-corpo">
    <h4>Na tela de login, clique em "Esqueci minha senha"</h4>
    <p>Logo abaixo do botão "Entrar como cliente".</p>
  </div>
</div>

<div class="passo">
  <div class="passo-num">2</div>
  <div class="passo-corpo">
    <h4>Digite seu CNPJ, CPF ou e-mail cadastrado</h4>
    <p>Mesmo identificador que você usa para entrar.</p>
  </div>
</div>

<div class="passo">
  <div class="passo-num">3</div>
  <div class="passo-corpo">
    <h4>Verifique seu e-mail</h4>
    <p>Você vai receber um link com validade de <b>30 minutos</b>. Clique nele, defina nova senha e pronto.</p>
  </div>
</div>

<div class="callout callout-amber">
  <p class="callout-title">Não chegou o e-mail?</p>
  <ul>
    <li>Confira a caixa de SPAM/Lixo eletrônico.</li>
    <li>Verifique se digitou o identificador correto (o e-mail vai pra caixa cadastrada na FC, não pra qualquer e-mail).</li>
    <li>Se persistir, contate a FC pelo gerente da obra ou pelo e-mail <b>contato@fcengenharia.com.br</b>.</li>
  </ul>
</div>
`;

// ─── GLOSSÁRIO ────────────────────────────────────────────────────
const GLOSSARIO = `
<h2>Glossário Expandido</h2>
<dl class="glossario">
  <dt>Avanço Físico</dt>
  <dd>Percentual da obra concluída em termos de execução real (cravação de fundação, alvenaria, instalações, acabamento). Vai de 0% a 100%.</dd>

  <dt>Avanço Financeiro</dt>
  <dd>Percentual da obra medido em termos monetários (R$ pago × R$ total). Pode divergir do físico em períodos onde se compra muito material mas se executa pouco (e vice-versa).</dd>

  <dt>Baseline</dt>
  <dd>Plano original aprovado e congelado. Toda comparação posterior usa o Baseline como referência. Mudanças no Baseline geram revisões formais.</dd>

  <dt>Caminho Crítico (CPM)</dt>
  <dd>Sequência de atividades sem folga, onde qualquer atraso impacta a data final da obra. Identificadas pelo método CPM (Critical Path Method).</dd>

  <dt>CPI (Cost Performance Index)</dt>
  <dd>Indicador financeiro: valor agregado / custo real. CPI 1,00 = no orçamento. <1 = estouro. >1 = economia.</dd>

  <dt>EAP (Estrutura Analítica do Projeto)</dt>
  <dd>Decomposição hierárquica da obra em pacotes e atividades. Ex: 1. Fundações → 1.1 Estaca → 1.1.1 Concretagem da estaca P1.</dd>

  <dt>Earned Schedule</dt>
  <dd>Técnica avançada de gerenciamento de prazo que corrige distorções do SPI tradicional, especialmente em obras quase concluídas ou em fase inicial.</dd>

  <dt>Float (Folga)</dt>
  <dd>Quantidade de dias que uma atividade pode atrasar sem impactar o prazo final. Atividades com float = 0 são críticas.</dd>

  <dt>Gantt</dt>
  <dd>Diagrama de barras horizontais mostrando atividades ao longo do tempo. Inventado por Henry Gantt (1910), até hoje o gráfico mais usado em planejamento de obra.</dd>

  <dt>JWT (JSON Web Token)</dt>
  <dd>Token de autenticação seguro que o navegador guarda quando você faz login. Permite reconhecer você nas próximas telas sem pedir senha de novo.</dd>

  <dt>NPS (Net Promoter Score)</dt>
  <dd>Métrica internacional de satisfação do cliente. Calculada como % Promotores − % Detratores, varia de −100 a +100.</dd>

  <dt>PMBOK</dt>
  <dd>Project Management Body of Knowledge, guia oficial de boas práticas em gerenciamento de projetos do PMI (Project Management Institute).</dd>

  <dt>Quase Crítico</dt>
  <dd>Atividade com pouca folga (geralmente <5 dias). Risco alto de virar crítica se sofrer qualquer atraso.</dd>

  <dt>REFIS (Relatório de Fiscalização)</dt>
  <dd>Documento oficial semanal emitido pela gerenciadora. Congela os números do período e serve como referência contratual.</dd>

  <dt>Revisão de Cronograma</dt>
  <dd>Atualização formal do plano. Cada revisão é numerada (Rev. 01, 02, 47…) e tem motivo registrado.</dd>

  <dt>SPI (Schedule Performance Index)</dt>
  <dd>Indicador de prazo: valor agregado / valor planejado. SPI 1,00 = no prazo. <1 = atrasada. >1 = adiantada.</dd>

  <dt>Tendência</dt>
  <dd>Projeção do término da obra baseada na velocidade atual. Se a velocidade não mudar, é quando a obra vai terminar de fato.</dd>

  <dt>Tenant Isolation</dt>
  <dd>Conceito de segurança: mesmo o sistema sendo compartilhado por vários clientes, cada cliente vê apenas seus próprios dados. No Portal, isso é garantido pelo filtro <code>companyId</code> em todas as consultas.</dd>
</dl>
`;

const FAQ_GERAL = `
<h2>FAQ Geral · Quando contatar a FC</h2>

<dl class="faq-list">
  <dt>O Portal não está abrindo, o que faço?</dt>
  <dd>1) Tente recarregar (F5). 2) Limpe o cache do navegador. 3) Tente outro navegador (Chrome → Edge, Safari → Chrome). 4) Se persistir, reporte ao gerente da obra ou para suporte@fcengenharia.com.br.</dd>

  <dt>Esqueci a senha e o e-mail de recuperação não chega.</dt>
  <dd>Confira SPAM. Se nada, contate a FC para reset manual.</dd>

  <dt>Os números que vejo são iguais aos do banco/seguradora?</dt>
  <dd>Sim. O Portal usa as mesmas fórmulas do ERP interno (Regra de Ouro). Os REFIS são a fonte oficial usada pelo banco/agente fiscalizador.</dd>

  <dt>Encontrei um número que parece errado, é bug?</dt>
  <dd>Pode ser. Antes de reportar: (a) confira se você está olhando a obra certa; (b) confira se a aba está atualizada (recarregue F5); (c) compare com o REFIS oficial. Se ainda parecer errado, reporte com print da tela.</dd>

  <dt>Posso convidar um sócio meu para ter acesso?</dt>
  <dd>Sim. Solicite à FC para criar um segundo usuário vinculado ao mesmo cliente. Cada pessoa terá seu próprio CPF/e-mail e senha.</dd>

  <dt>Posso usar no celular?</dt>
  <dd>Sim. O Portal é responsivo e funciona em qualquer navegador moderno. Recomendamos visualizar o Gantt e a Curva S em tela maior (tablet ou notebook) por causa do nível de detalhe.</dd>

  <dt>Os documentos são versionados?</dt>
  <dd>Sim. Cada documento tem revisão (Rev. 00, 01, 02…). O Portal sempre mostra a mais recente APROVADA.</dd>

  <dt>Como denuncio um problema sério (segurança, ética, qualidade)?</dt>
  <dd>Use a Avaliação NPS (anônima) para registro formal. Em paralelo, contate diretamente a diretoria pelo e-mail diretoria@fcengenharia.com.br.</dd>
</dl>

<h3>Quando contatar a FC</h3>
<table class="quando-tab">
  <thead><tr><th>Situação</th><th>Quem contatar</th></tr></thead>
  <tbody>
    <tr><td>Dúvida sobre execução / qualidade</td><td>Gerente da obra</td></tr>
    <tr><td>Documento faltando no Portal</td><td>Gerente da obra</td></tr>
    <tr><td>Erro técnico no Portal (bug)</td><td>suporte@fcengenharia.com.br</td></tr>
    <tr><td>Reset de senha não chega por e-mail</td><td>suporte@fcengenharia.com.br</td></tr>
    <tr><td>Insatisfação grave / questão ética</td><td>diretoria@fcengenharia.com.br</td></tr>
    <tr><td>Comunicação contratual / financeiro</td><td>Gerente da obra + cópia para diretoria</td></tr>
  </tbody>
</table>
`;

// ─────────────────────────────────────────────────────────────────
// CSS + HTML
// ─────────────────────────────────────────────────────────────────

const CSS = `
@page { size: A4; margin: 18mm 14mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #1f2937; line-height: 1.55; font-size: 11pt; }
h1 { font-size: 28pt; color: #0a3d62; margin: 0 0 6pt; }
h2 { font-size: 20pt; color: #0a3d62; margin: 24pt 0 12pt; padding-bottom: 6pt; border-bottom: 2pt solid #2563eb; page-break-before: always; }
h2:first-of-type { page-break-before: auto; }
h3 { font-size: 14pt; color: #1e40af; margin: 18pt 0 8pt; }
h4 { font-size: 11.5pt; color: #1e3a8a; margin: 10pt 0 4pt; }
p { margin: 6pt 0; }
ul, ol { margin: 6pt 0 6pt 18pt; }
li { margin: 3pt 0; }
code { background: #f1f5f9; padding: 1pt 4pt; border-radius: 3pt; font-size: 9.5pt; }
.lead { font-size: 12pt; color: #475569; }
.good { color: #15803d; font-weight: 600; }
.bad { color: #b91c1c; font-weight: 600; }
.exemplo { background: #eff6ff; border-left: 3pt solid #2563eb; padding: 6pt 10pt; border-radius: 4pt; margin: 6pt 0; font-style: italic; color: #1e40af; }
.dica { background: #f0fdf4; border-left: 3pt solid #16a34a; padding: 6pt 10pt; border-radius: 4pt; margin: 6pt 0; color: #15803d; }

/* Capa */
.capa { page-break-after: always; min-height: 240mm; background: linear-gradient(135deg, #0a3d62 0%, #1e3a8a 100%); color: #fff; padding: 40mm 20mm; display: flex; flex-direction: column; justify-content: space-between; }
.capa h1 { color: #fff; font-size: 36pt; line-height: 1.2; }
.capa .sub { color: #fbbf24; font-size: 16pt; margin-top: 10pt; }
.capa .tag { color: #cbd5e1; font-size: 11pt; margin-top: 8pt; }
.capa .footer { margin-top: 40pt; }
.capa .footer p { color: #cbd5e1; margin: 2pt 0; font-size: 10pt; }
.capa .logo-box { background: rgba(255,255,255,0.95); padding: 8pt 16pt; border-radius: 8pt; display: inline-block; margin-bottom: 30pt; }
.capa .logo-box img { height: 36pt; }

/* Sumário */
.sumario { padding: 10pt 0; }
.sumario h2 { page-break-before: auto; }
.sumario ol { font-size: 11pt; margin-left: 24pt; }
.sumario li { margin: 5pt 0; }

/* Callouts */
.callout { padding: 10pt 14pt; border-radius: 6pt; margin: 10pt 0; border-left: 4pt solid; }
.callout-blue { background: #eff6ff; border-color: #2563eb; }
.callout-amber { background: #fffbeb; border-color: #d97706; }
.callout-green { background: #f0fdf4; border-color: #16a34a; }
.callout-title { font-weight: 700; margin: 0 0 4pt; color: #0a3d62; }

/* Passos */
.passo { display: flex; gap: 10pt; margin: 10pt 0; align-items: flex-start; page-break-inside: avoid; }
.passo-num { flex-shrink: 0; width: 28pt; height: 28pt; border-radius: 50%; background: #2563eb; color: #fff; font-weight: 700; font-size: 13pt; display: flex; align-items: center; justify-content: center; }
.passo-corpo { flex: 1; }
.passo-corpo h4 { margin-top: 0; color: #1e3a8a; }
.passo-corpo p, .passo-corpo ul { margin-top: 3pt; }

/* KPI cards */
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; margin: 10pt 0; }
.kpi-card { border: 1pt solid #e5e7eb; border-radius: 6pt; padding: 10pt; background: #fff; page-break-inside: avoid; }
.kpi-card h4 { margin-top: 0; color: #0a3d62; }
.kpi-card p { font-size: 10pt; }

/* Aba Planejamento */
.aba-planejamento { margin: 16pt 0 24pt; }
.aba-planejamento .aba-print img { max-height: 720pt; object-fit: contain; object-position: top; }
.aba-badge { display: inline-block; background: #2563eb; color: #fff; padding: 2pt 8pt; border-radius: 4pt; font-size: 10pt; margin-right: 6pt; }
.aba-corpo { display: grid; grid-template-columns: 1fr 1fr; gap: 14pt; margin-top: 8pt; }
.aba-explica h4 { margin: 8pt 0 3pt; font-size: 10.5pt; color: #1e3a8a; }
.aba-explica p, .aba-explica ul { font-size: 10pt; }
.aba-print img { width: 100%; border: 1pt solid #cbd5e1; border-radius: 4pt; }
.faq { font-size: 9.5pt; background: #f8fafc; padding: 6pt 10pt; border-radius: 4pt; }
.faq p { margin: 3pt 0; }

/* Glossário e FAQ list */
.glossario, .faq-list { margin: 10pt 0; }
.glossario dt, .faq-list dt { font-weight: 700; color: #0a3d62; margin-top: 8pt; }
.glossario dd, .faq-list dd { margin: 2pt 0 6pt 14pt; color: #374151; }

/* Prints fullPage (módulos detalhados) — sem avoid pra deixar quebrar entre páginas se for alto */
.full-print { margin: 14pt 0 4pt; }
.full-print img { width: 100%; max-height: 920pt; object-fit: contain; object-position: top; border: 1pt solid #94a3b8; border-radius: 6pt; box-shadow: 0 2pt 6pt rgba(0,0,0,0.08); }
.meio-print { margin: 12pt 0 4pt; max-width: 70%; page-break-inside: avoid; }
.meio-print img { width: 100%; border: 1pt solid #94a3b8; border-radius: 6pt; }
.legenda-print { font-size: 9pt; color: #64748b; font-style: italic; text-align: center; margin: 0 0 12pt; }

/* Tabela detalhada de elementos numerados */
.elementos-tab { width: 100%; border-collapse: collapse; margin: 8pt 0 14pt; font-size: 9.5pt; }
.elementos-tab th { background: #1e3a8a; color: #fff; text-align: left; padding: 6pt 8pt; }
.elementos-tab td { border: 1pt solid #e5e7eb; padding: 5pt 8pt; vertical-align: top; }
.elementos-tab td:first-child { width: 28pt; text-align: center; font-weight: 700; background: #eff6ff; color: #1e3a8a; }
.elementos-tab td:nth-child(2) { width: 30%; }
.elementos-tab tr:nth-child(even) td:not(:first-child) { background: #f8fafc; }

/* Tabela "quando" */
.quando-tab { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 10pt; }
.quando-tab th { background: #0a3d62; color: #fff; text-align: left; padding: 6pt 8pt; }
.quando-tab td { border: 1pt solid #e5e7eb; padding: 5pt 8pt; vertical-align: top; }
.quando-tab tr:nth-child(even) td { background: #f8fafc; }

/* Perguntas NPS */
.perguntas-nps { background: #f0f9ff; border: 1pt solid #bae6fd; border-radius: 6pt; padding: 10pt 24pt; }
.perguntas-nps li { margin: 4pt 0; font-size: 10.5pt; }
`;

const SUMARIO = `
<div class="sumario">
  <h2>Sumário</h2>
  <ol>
    <li>Bem-vindo ao Portal do Cliente</li>
    <li>Tutorial — Primeiro Acesso em 5 Minutos</li>
    <li>Módulo Planejamento — O Coração do Portal
      <ol>
        <li>Os 4 indicadores essenciais (Avanço Físico, SPI, CPI, REFIS)</li>
        <li>Aba 1 · Visão Geral</li>
        <li>Aba 2 · Cronograma</li>
        <li>Aba 3 · Avanço Semanal</li>
        <li>Aba 4 · Prog. Semanal</li>
        <li>Aba 5 · Curva S</li>
        <li>Aba 6 · Revisões</li>
        <li>Aba 7 · Gantt</li>
        <li>Aba 8 · REFIS</li>
        <li>Aba 9 · Caminho Crítico</li>
        <li>Aba 10 · Efetivo</li>
        <li>Aba 11 · Diagrama de Rede</li>
        <li>FAQ Geral do Planejamento</li>
      </ol>
    </li>
    <li>Módulo Projetos / Documentos Técnicos</li>
    <li>Módulo Avaliação (NPS)</li>
    <li>Recuperação de Senha</li>
    <li>Glossário Expandido</li>
    <li>FAQ Geral · Quando contatar a FC</li>
  </ol>
</div>
`;

const HTML = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>${CAPA.titulo}</title><style>${CSS}</style></head>
<body>

<!-- CAPA -->
<section class="capa">
  <div>
    ${LOGO ? `<div class="logo-box"><img src="${LOGO}" alt="FC Engenharia" /></div>` : ""}
    <h1>${CAPA.titulo}</h1>
    <p class="sub">${CAPA.subtitulo}</p>
    <p class="tag">${CAPA.tagline}</p>
  </div>
  <div class="footer">
    <p>${CAPA.cliente}</p>
    <p>${CAPA.obra}</p>
    <p style="margin-top:14pt; opacity:0.7;">${CAPA.data}</p>
  </div>
</section>

${SUMARIO}

<section>${BEM_VINDO}</section>
<section>${PRIMEIRO_ACESSO}</section>

<section>
  ${MOD_PLANEJAMENTO_INTRO}
  ${ABAS_PLANEJAMENTO.join("\n")}
  ${FAQ_PLANEJAMENTO}
</section>

<section>${MOD_PROJDOC}</section>
<section>${MOD_AVALIACAO}</section>
<section>${ESQUECI}</section>
<section>${GLOSSARIO}</section>
<section>${FAQ_GERAL}</section>

</body></html>`;

// ─────────────────────────────────────────────────────────────────
// EXECUÇÃO
// ─────────────────────────────────────────────────────────────────
console.log("[1/2] Gravando HTML…");
fs.writeFileSync(OUT_HTML, HTML, "utf8");
console.log(`  ✓ ${OUT_HTML} (${(fs.statSync(OUT_HTML).size / 1024).toFixed(1)} KB)`);

console.log("[2/2] Convertendo HTML → PDF via Chromium…");
await execFileP(CHROMIUM, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--no-pdf-header-footer",
  `--print-to-pdf=${OUT_PDF}`,
  `file://${OUT_HTML}`,
], { maxBuffer: 200 * 1024 * 1024 });

console.log(`\n✅ PRONTO: ${OUT_PDF}`);
console.log(`   Tamanho: ${(fs.statSync(OUT_PDF).size / 1024 / 1024).toFixed(2)} MB`);
