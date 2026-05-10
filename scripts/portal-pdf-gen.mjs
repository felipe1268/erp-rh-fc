/**
 * Gera o Manual do Portal do Cliente em PDF para NotebookLM.
 * - Captura prints anotados (círculos numerados sobre cada botão/elemento).
 * - Monta um HTML estilizado com logo FC, capa, sumário e tabelas explicativas.
 * - Converte HTML → PDF via Chromium headless.
 */
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const EMAIL = "Felipe1268@gmail.com";
const SENHA = "142168Fe@";
const OBRA_ID = 12;
const OUT_IMG = "docs/portal-prints-anotado";
const OUT_PDF = "docs/Manual_Portal_Cliente_FC.pdf";
const CHROMIUM = process.env.CHROMIUM_PATH ||
  "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";

fs.mkdirSync(OUT_IMG, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// CONFIGURAÇÃO DAS TELAS — anotações numeradas
// ============================================================================
// Cada finder: {text:"..."} | {selector:"..."} | {xy:[x,y,w,h]}
// placement: "tl" | "tr" | "bl" | "br" (canto onde o número fica)
const SCREENS = [
  {
    id: "01-login", title: "Tela de Login",
    rota: "/portal/cliente/login",
    intro: "Porta de entrada do Portal. Layout em duas colunas: à esquerda o branding institucional com pré-visualização das funcionalidades; à direita o card de autenticação.",
    annotations: [
      { num: 1, find: { text: "Acompanhe sua obra" }, label: "Banner institucional", desc: "Mensagem de marketing 'Acompanhe sua obra de ponta a ponta'. Comunica o propósito do portal." },
      { num: 2, find: { text: "Documentos" }, label: "Tile Documentos", desc: "Pré-visualização: o portal entrega contratos, ARTs e projetos." },
      { num: 3, find: { text: "Medições" }, label: "Tile Medições", desc: "Pré-visualização: boletins e faturamento." },
      { num: 4, find: { text: "RDO" }, label: "Tile RDO", desc: "Pré-visualização: diário de obra atualizado." },
      { num: 5, find: { text: "Andamento físico" }, label: "Tile Cronograma", desc: "Pré-visualização: andamento físico da obra." },
      { num: 6, find: { selector: "input" }, label: "Campo identificação", desc: "Aceita CNPJ do cliente, CPF do representante OU e-mail cadastrado. Backend detecta o formato automaticamente." },
      { num: 7, find: { selector: "input[type='password']" }, label: "Campo senha", desc: "Senha cadastrada. Botão olho permite mostrar/ocultar." },
      { num: 8, find: { text: "Entrar como cliente" }, label: "Botão entrar", desc: "Faz POST em portalExterno.loginCliente; em caso de sucesso recebe JWT (pc_token) e redireciona para /portal/cliente/hub." },
      { num: 9, find: { text: "Esqueci minha senha" }, label: "Recuperar senha", desc: "Vai para /portal/cliente/esqueci-senha (envio de link por e-mail)." },
      { num: 10, find: { text: "Entrar pelo portal externo" }, label: "Portal de terceiros", desc: "Atalho para terceirizados/parceiros — esses NÃO usam o Portal do Cliente." },
    ],
  },
  {
    id: "03-hub", title: "Hub do Cliente",
    rota: "/portal/cliente/hub",
    intro: "Tela inicial após o login. Mostra os módulos liberados para o cliente, módulos no roadmap e o status da pesquisa de avaliação. No exemplo, Felipe Alves tem 2 obras vinculadas.",
    full: true,
    annotations: [
      { num: 1, find: { text: "Portal do Cliente" }, label: "Identificação", desc: "Logo + 'Portal do Cliente' + revisão da plataforma (ex.: Rev. 1688)." },
      { num: 2, find: { text: "SANTUARIO" }, label: "Cliente ativo", desc: "Nome da empresa cliente associada ao usuário logado." },
      { num: 3, find: { text: "Ajuda" }, label: "Botão Ajuda", desc: "Abre menu de suporte / FAQ do portal." },
      { num: 4, find: { text: "Tour" }, label: "Botão Tour", desc: "Inicia tour guiado interativo pelas funcionalidades principais." },
      { num: 5, find: { text: "Sair" }, label: "Logout", desc: "Encerra a sessão (limpa pc_token) e volta para a tela de login." },
      { num: 6, find: { text: "FELIPE ALVES" }, label: "Saudação", desc: "Saudação dinâmica (Bom dia/tarde/noite) + nome do usuário + data por extenso." },
      { num: 7, find: { text: "Planejamento" }, label: "Card Planejamento", desc: "Módulo liberado. Clique abre seleção de obra → Visão Geral do cronograma." },
      { num: 8, find: { text: "Proj./Doc." }, label: "Card Proj./Doc.", desc: "Módulo liberado. Clique abre seleção de obra → lista de documentos técnicos." },
      { num: 9, find: { text: "Avaliação" }, label: "Card Avaliação (DESATIVADO)", desc: "Estado especial: badge ✓ OK + traçado pontilhado + texto 'Disponível em junho/2026' indicam que o cliente JÁ avaliou esse período. Clique exibe toast com a próxima janela." },
      { num: 10, find: { text: "EM DESENVOLVIMENTO" }, label: "Roadmap", desc: "Seção de módulos no roadmap (Galeria de Fotos, Boletins de Medição, Solicitações). Tiles cinza, clique não navega." },
    ],
  },
  {
    id: "04-selecionar-obra-planejamento", title: "Seleção de Obra (Planejamento)",
    rota: "/portal/cliente/modulo/planejamento",
    intro: "Tela intermediária quando o cliente tem mais de uma obra vinculada. Lista apenas as obras em que o cliente tem vínculo ativo (filtra deletedAt IS NOT NULL).",
    full: true,
    annotations: [
      { num: 1, find: { text: "Tela Inicial" }, label: "Voltar ao Hub", desc: "Retorna ao Hub do Cliente." },
      { num: 2, find: { text: "Planejamento da Obra" }, label: "Título do módulo", desc: "Indica em qual módulo o cliente está prestes a entrar." },
      { num: 3, find: { text: "REVTE-CIVIL" }, label: "Obra REVTE-CIVIL", desc: "Card de obra com código, badge de status (Em_Andamento) e link Acessar →." },
      { num: 4, find: { text: "VITRA" }, label: "Obra VITRA", desc: "Segunda obra vinculada ao mesmo cliente." },
    ],
  },
  {
    id: "05-planejamento-visao-geral", title: "Planejamento — Visão Geral",
    rota: `/portal/cliente/obra/${OBRA_ID}`,
    intro: "Tela principal do módulo Planejamento. Reúne KPIs estratégicos, atividades em atraso, previsão do tempo na obra e histórico de REFIs. É a visão executiva do andamento físico.",
    full: true,
    annotations: [
      { num: 1, find: { text: "FC Engenharia", scope: "sidebar" }, label: "Logo do Portal", desc: "Branding fixo no topo da sidebar." },
      { num: 2, find: { text: "Tela Inicial do Portal" }, label: "Voltar ao Hub", desc: "Atalho para retornar ao Hub do Cliente." },
      { num: 3, find: { text: "REVTE-CIVIL", scope: "sidebar" }, label: "Seletor de Obra", desc: "Combobox 'OBRA - clique para trocar'. Permite alternar entre as obras do cliente sem voltar ao Hub." },
      { num: 4, find: { text: "Visão Geral", scope: "sidebar" }, label: "Aba ativa", desc: "Indicador visual da aba selecionada na sidebar." },
      { num: 5, find: { text: "Imprimir" }, label: "Imprimir", desc: "Abre o diálogo de impressão do navegador para a aba atual." },
      { num: 6, find: { text: "Avanço Físico" }, label: "Bloco Avanço Físico", desc: "Barra dourada (Previsto 1,84%) sobre azul (Realizado 1,38%). Calculado ao vivo a partir do último REFIS oficial. Badge -0,46% atrasado é o desvio." },
      { num: 7, find: { text: "Atividades", scope: "kpi" }, label: "KPI Atividades", desc: "3/64 → atividades concluídas / total de folhas EAP que entram no cálculo." },
      { num: 8, find: { text: "SPI" }, label: "KPI SPI (prazo)", desc: "Schedule Performance Index = Realizado / Previsto. 0,75 indica execução abaixo do plano." },
      { num: 9, find: { text: "Atividades em Atraso" }, label: "Lista de atrasos", desc: "Atividades em execução abaixo do previsto até hoje. Cada linha mostra 'Deveria %' (cinza) vs 'Hoje %' (laranja)." },
      { num: 10, find: { text: "Previsão do Tempo" }, label: "Clima na obra", desc: "Integração OpenWeather localizada pelo endereço da obra (Aparecida-SP). Cards de seg→sex com chuva/vento/recomendações." },
      { num: 11, find: { text: "Histórico de REFIS" }, label: "Histórico oficial", desc: "Tabela cronológica de todos os REFIs emitidos (Nº, semana, Prev %, Real %, SPI, Status)." },
      { num: 12, find: { text: "Trocar de Obra" }, label: "Trocar obra", desc: "Volta para a tela de seleção de obra do módulo." },
    ],
  },
  {
    id: "06-planejamento-curva-s", title: "Planejamento — Curva S",
    rota: `/portal/cliente/obra/${OBRA_ID}`, click: "Curva",
    intro: "Curva S de avanço acumulado: compara Baseline (plano original), Realizado e Tendência. Suporta toggle entre Curva S de Trabalho (% físico) e Curva S Financeira (R$ acumulado). Em fases iniciais (<20%) mostra banner informativo para evitar projeções alarmistas.",
    full: true,
    annotations: [
      { num: 1, find: { text: "Curva S", scope: "sidebar" }, label: "Aba selecionada", desc: "Indica que o usuário está na Curva S." },
      { num: 2, find: { text: "PREVISTO", scope: "card" }, label: "Card Previsto", desc: "Avanço previsto até a data atual: 1,84%." },
      { num: 3, find: { text: "REALIZADO", scope: "card" }, label: "Card Realizado", desc: "Avanço realizado até a data atual: 1,38%." },
      { num: 4, find: { text: "DESVIO" }, label: "Card Desvio", desc: "-0,46% Atrasado. Diferença entre realizado e previsto." },
      { num: 5, find: { text: "Curva S de Trabalho" }, label: "Toggle Trabalho", desc: "Visualização padrão: avanço físico em % acumulado." },
      { num: 6, find: { text: "Curva S Financeira" }, label: "Toggle Financeira", desc: "Alterna para visão de medições em R$ acumulado." },
      { num: 7, find: { text: "Fase inicial" }, label: "Banner SPI fase inicial", desc: "Banner informativo (não alarmista). Aparece quando o avanço previsto < 20%, pois SPI puro extrapola conclusões absurdas nessa faixa (referência: PMBOK / Earned Schedule)." },
    ],
  },
  {
    id: "06-planejamento-avanco-semanal", title: "Planejamento — Avanço Semanal",
    rota: `/portal/cliente/obra/${OBRA_ID}`, click: "Avanço",
    intro: "Performance da semana corrente (segunda → domingo). Mostra o delta da Curva S nesta semana, atividades multi-semana contribuem proporcionalmente.",
    full: true,
    annotations: [
      { num: 1, find: { text: "Avanço Semanal", scope: "sidebar" }, label: "Aba selecionada", desc: "Aba ativa." },
      { num: 2, find: { text: "ATIVIDADES NA SEMANA" }, label: "KPI Atividades", desc: "13 atividades estão ativas na janela seg→dom da semana corrente." },
      { num: 3, find: { text: "PREVISTO NA SEMANA" }, label: "KPI Previsto", desc: "1,98% — quanto a obra deveria avançar nesta semana." },
      { num: 4, find: { text: "REALIZADO NA SEMANA" }, label: "KPI Realizado", desc: "1,38% — quanto efetivamente foi lançado." },
      { num: 5, find: { text: "ADERÊNCIA" }, label: "KPI Aderência (SPI semanal)", desc: "70% = Realizado / Previsto da semana." },
      { num: 6, find: { text: "Semana 04/05/2026" }, label: "Tabela da semana", desc: "Lista das 13 atividades com EAP, datas, % realizado e status (Concluída / Em execução / Prevista)." },
    ],
  },
  {
    id: "06-planejamento-gantt", title: "Planejamento — Gantt",
    rota: `/portal/cliente/obra/${OBRA_ID}`, click: "Gantt",
    intro: "Diagrama de Gantt interativo da EAP completa (116 itens, 426 dias de projeto). Mostra grupos, atividades, marcos e linha do 'hoje' em vermelho.",
    full: true,
    annotations: [
      { num: 1, find: { text: "Gantt", scope: "sidebar" }, label: "Aba selecionada", desc: "Aba ativa." },
      { num: 2, find: { text: "Semana", scope: "control" }, label: "Granularidade Semana", desc: "Eixo temporal por semanas." },
      { num: 3, find: { text: "Mês", scope: "control" }, label: "Granularidade Mês", desc: "Eixo temporal por meses (padrão no print)." },
      { num: 4, find: { text: "N1" }, label: "Filtro Nível 1", desc: "Mostra apenas grupos de nível 1 (visão executiva). N2/N3/Tudo expandem mais." },
      { num: 5, find: { text: "Recolher" }, label: "Recolher tudo", desc: "Recolhe todos os grupos para a visão mais alta." },
      { num: 6, find: { text: "Marco" }, label: "Legenda", desc: "Legenda visual: Grupo (preto), Atividade (azul), Marco (losango roxo), Concluída (verde), Hoje (linha vermelha)." },
    ],
  },
  {
    id: "06-planejamento-caminho-critico", title: "Planejamento — Caminho Crítico",
    rota: `/portal/cliente/obra/${OBRA_ID}`, click: "Caminho",
    intro: "Aplica o método CPM (Critical Path Method): atividades com float zerado definem o prazo contratual da obra. Atrasar uma delas atrasa a entrega.",
    full: true,
    annotations: [
      { num: 1, find: { text: "Caminho Crítico", scope: "sidebar" }, label: "Aba selecionada", desc: "Aba ativa." },
      { num: 2, find: { text: "Float = 0" }, label: "Caminho Crítico (vermelho)", desc: "3 atividades com float zero — qualquer atraso impacta direto a entrega final." },
      { num: 3, find: { text: "Float ≤ 14" }, label: "Quase Crítico (amarelo)", desc: "3 atividades em risco de virar críticas. Acompanhar semanalmente." },
      { num: 4, find: { text: "Float > 14" }, label: "Com Folga (azul)", desc: "58 atividades com folga confortável. Reserva de capacidade da rede." },
      { num: 5, find: { text: "Tratamento operacional" }, label: "Card operacional", desc: "Tratamento DIÁRIO para críticas: liberação prévia da frente, cobertura integral de insumos." },
      { num: 6, find: { text: "Final de obra" }, label: "Exemplo crítico", desc: "Lista das 3 atividades críticas: Retirada de divisória, Desmobilização, Final de obra." },
    ],
  },
  {
    id: "06-planejamento-refis", title: "Planejamento — REFIS",
    rota: `/portal/cliente/obra/${OBRA_ID}`, click: "REFIS",
    intro: "REFIS = Relatório de Fiscalização. Snapshot semanal oficial emitido pela gerenciadora. Cada REFIS congela os números do período.",
    full: true,
    annotations: [
      { num: 1, find: { text: "REFIS", scope: "sidebar" }, label: "Aba selecionada", desc: "Aba ativa." },
      { num: 2, find: { text: "Nº 001" }, label: "REFIS atual", desc: "Cabeçalho do REFIS expandido (Nº 001 — semana 04/05/2026)." },
      { num: 3, find: { text: "Curva S Física" }, label: "Curva Física", desc: "Avanço acumulado em % (Previsto vs Realizado)." },
      { num: 4, find: { text: "Curva S Financeira" }, label: "Curva Financeira", desc: "Faturamento acumulado em R$ (Previsto R$ 29.055,21 vs Realizado R$ 19.728,51)." },
      { num: 5, find: { text: "AVANÇOS FÍSICOS POR GRUPO" }, label: "Por Grupo EAP", desc: "Quebra detalhada por grupo da EAP (Serviços Preliminares, Nave Norte, Complementares, etc.) com previsto, realizado e desvio." },
    ],
  },
  {
    id: "06-planejamento-revisoes", title: "Planejamento — Revisões",
    rota: `/portal/cliente/obra/${OBRA_ID}`, click: "Revis",
    intro: "Histórico de revisões do cronograma. Rev 00 (Baseline) é imutável — referência permanente.",
    full: true,
    annotations: [
      { num: 1, find: { text: "Revisões", scope: "sidebar" }, label: "Aba selecionada", desc: "Aba ativa." },
      { num: 2, find: { text: "Baseline" }, label: "Rev 00 Baseline", desc: "Revisão inicial criada automaticamente em 05/05/2026. Status: ATIVA, aprovada." },
      { num: 3, find: { text: "ATIVA" }, label: "Badge ativa", desc: "Indica qual revisão é a oficial em uso por todos os módulos." },
      { num: 4, find: { text: "Sobre o controle" }, label: "Caixa explicativa", desc: "Bloco azul explica as regras: Baseline imutável; cada nova revisão exige upload de cronograma; criação/exclusão é feita pela gerenciadora." },
    ],
  },
  {
    id: "06-planejamento-efetivo", title: "Planejamento — Efetivo",
    rota: `/portal/cliente/obra/${OBRA_ID}`, click: "Efetivo",
    intro: "Efetivo da obra: mão de obra própria FC + terceiros alocados. Cada linha expande ASO + Treinamentos com PDF inline.",
    full: true,
    annotations: [
      { num: 1, find: { text: "Efetivo", scope: "sidebar" }, label: "Aba selecionada", desc: "Aba ativa." },
      { num: 2, find: { text: "PRÓPRIOS FC" }, label: "Card Próprios FC", desc: "8 funcionários CLT/PJ próprios da FC. Card é clicável e atua como filtro." },
      { num: 3, find: { text: "TOTAL TERCEIROS" }, label: "Card Terceiros", desc: "0 terceirizados alocados (ainda)." },
      { num: 4, find: { text: "TOTAL GERAL" }, label: "Card Total", desc: "Soma agregada. 'filtrando' aparece em verde quando algum card foi selecionado." },
      { num: 5, find: { text: "Buscar nome" }, label: "Busca", desc: "Busca por nome, função ou empresa." },
    ],
  },
  {
    id: "06-planejamento-diagrama-rede", title: "Planejamento — Diagrama de Rede",
    rota: `/portal/cliente/obra/${OBRA_ID}`, click: "Diagrama",
    intro: "Sequência lógica de execução: Hierarquia EAP ou Rede de Precedências. 65 de 67 atividades com predecessora cadastrada.",
    full: true,
    annotations: [
      { num: 1, find: { text: "Diagrama de Rede", scope: "sidebar" }, label: "Aba selecionada", desc: "Aba ativa." },
      { num: 2, find: { text: "Hierarquia EAP" }, label: "Toggle Hierarquia", desc: "Mostra a estrutura agrupada por EAP." },
      { num: 3, find: { text: "Rede de Precedências" }, label: "Toggle Rede", desc: "Mostra apenas as dependências (predecessoras → sucessoras)." },
      { num: 4, find: { text: "Em risco" }, label: "Filtro Em risco", desc: "7 atividades em risco. Filtros são clicáveis e filtram o diagrama." },
      { num: 5, find: { text: "Tela cheia" }, label: "Fullscreen", desc: "Expande o diagrama para tela cheia." },
    ],
  },
  {
    id: "08-projdoc-obra", title: "Módulo Projetos / Documentos Técnicos",
    rota: `/portal/cliente/projdoc/${OBRA_ID}`,
    intro: "Repositório de projetos técnicos da obra: arquitetura, estrutural, elétrica, hidráulica. Controle por revisão, status e arquivo (DWG/PDF).",
    full: true,
    annotations: [
      { num: 1, find: { text: "Hub" }, label: "Voltar ao Hub", desc: "Retorna ao Hub do Cliente." },
      { num: 2, find: { text: "Obras" }, label: "Voltar à seleção", desc: "Volta para a tela de seleção de obra do módulo." },
      { num: 3, find: { text: "TOTAL DOCUMENT" }, label: "KPI Total", desc: "7 documentos cadastrados." },
      { num: 4, find: { text: "APROVADOS" }, label: "KPI Aprovados", desc: "7 aprovados (todos)." },
      { num: 5, find: { text: "SEM ARQUIVO" }, label: "KPI Sem Arquivo", desc: "1 documento aprovado mas sem arquivo binário anexado (pendência)." },
      { num: 6, find: { text: "Pendências detectadas" }, label: "Banner pendência", desc: "Banner laranja: 1 documento sem arquivo anexado (DWG/PDF faltando). Botão 'Ver sem arquivo' filtra a lista." },
      { num: 7, find: { text: "Pastas" }, label: "Modo Pastas", desc: "Agrupa por disciplina (Arquitetura, Estrutural, etc.) e por tipo (DWG/PDF)." },
      { num: 8, find: { text: "Lista" }, label: "Modo Lista", desc: "Exibição plana em tabela única, sem agrupamento." },
      { num: 9, find: { text: "Arquitetura" }, label: "Disciplina", desc: "Pasta da disciplina Arquitetura. Subgrupos DWG e PDF, com contadores no canto direito." },
      { num: 10, find: { text: "Sem arquivo", scope: "badge" }, label: "Badge sem arquivo", desc: "Marca documentos aprovados sem binário. Visualizador inline (botão olho) abre PDFs sem permitir download." },
    ],
  },
  {
    id: "10-esqueci-senha", title: "Recuperação de Senha",
    rota: "/portal/cliente/login", click: "Esqueci",
    intro: "Fluxo de recuperação por e-mail. Resposta sempre genérica para evitar enumeração de contas.",
    annotations: [
      { num: 1, find: { text: "Recuperar Senha" }, label: "Título", desc: "Identificação da tela." },
      { num: 2, find: { selector: "input" }, label: "CNPJ ou CPF", desc: "Campo único: CNPJ do cliente OU CPF do representante. Aplica máscara automática." },
      { num: 3, find: { text: "Enviar link" }, label: "Botão enviar", desc: "Backend procura cadastro, gera token de uso único e dispara e-mail (SMTP da FC)." },
      { num: 4, find: { text: "Voltar ao login" }, label: "Voltar", desc: "Retorna para a tela de login sem enviar." },
    ],
  },
];

// ============================================================================
// CAPTURA DOS PRINTS ANOTADOS
// ============================================================================
async function annotate(page, items) {
  await page.evaluate((items) => {
    document.getElementById("__anno")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "__anno";
    overlay.style.cssText = "position:absolute;left:0;top:0;width:100%;height:" +
      Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) +
      "px;pointer-events:none;z-index:99999;";
    document.body.appendChild(overlay);

    function findEl(it) {
      const f = it.find;
      if (f.selector) return document.querySelector(f.selector);
      if (f.text) {
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
        const t = norm(f.text);
        // primeiro: elementos pequenos (botões, links, cards) que CONTÊM o texto
        const candidates = Array.from(document.querySelectorAll(
          "button, a, h1, h2, h3, h4, [role='tab'], [role='button'], label, span, div"
        ));
        // exact-ish match
        const exact = candidates.find((e) => {
          const txt = norm(e.innerText || e.textContent || "");
          return txt === t || txt.startsWith(t + " ") || txt.endsWith(" " + t);
        });
        if (exact) return exact;
        // contains, mas pega o MENOR elemento
        const contains = candidates
          .filter((e) => norm(e.innerText || e.textContent || "").includes(t))
          .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);
        return contains[0] || null;
      }
      return null;
    }

    for (const item of items) {
      const el = findEl(item);
      if (!el) { console.warn("MISS", item.num, JSON.stringify(item.find)); continue; }
      const r = el.getBoundingClientRect();
      const sx = window.scrollX, sy = window.scrollY;
      const left = r.left + sx, top = r.top + sy;

      const box = document.createElement("div");
      box.style.cssText = `position:absolute;left:${left - 4}px;top:${top - 4}px;` +
        `width:${r.width + 8}px;height:${r.height + 8}px;` +
        `border:3px solid #ef4444;border-radius:10px;` +
        `box-shadow:0 0 0 2px rgba(255,255,255,0.85),0 4px 12px rgba(0,0,0,0.2);`;
      overlay.appendChild(box);

      const num = document.createElement("div");
      const cx = left - 18, cy = top - 18;
      num.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;` +
        `width:34px;height:34px;border-radius:50%;background:#ef4444;color:#fff;` +
        `font-weight:800;font-family:system-ui,sans-serif;font-size:18px;` +
        `display:flex;align-items:center;justify-content:center;` +
        `box-shadow:0 3px 10px rgba(0,0,0,0.45);border:3px solid #fff;`;
      num.textContent = String(item.num);
      overlay.appendChild(num);
    }
  }, items);
}

async function clickByText(page, text) {
  const handle = await page.evaluateHandle((txt) => {
    const els = Array.from(document.querySelectorAll('button, a, [role="tab"], [role="button"]'));
    const norm = (s) => (s || "").trim().toLowerCase();
    const t = norm(txt);
    return els.find((e) => norm(e.innerText || e.textContent).includes(t));
  }, text);
  const el = handle.asElement();
  if (!el) return false;
  await el.click();
  return true;
}

async function captureAll() {
  const browser = await puppeteer.launch({
    headless: true, executablePath: CHROMIUM,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  // login uma vez
  await page.goto(`${BASE}/portal/cliente/login`, { waitUntil: "networkidle2" });
  await sleep(800);
  const inputs = await page.$$("input");
  await inputs[0].type(EMAIL, { delay: 15 });
  await inputs[1].type(SENHA, { delay: 15 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null),
    clickByText(page, "Entrar"),
  ]);
  await sleep(1500);

  for (const s of SCREENS) {
    console.log(`\n→ ${s.id} :: ${s.title}`);

    // login screens precisam fazer logout primeiro
    if (s.id === "01-login" || s.id === "10-esqueci-senha") {
      await page.evaluate(() => localStorage.clear());
    }
    await page.goto(`${BASE}${s.rota}`, { waitUntil: "networkidle2" });
    await sleep(s.id === "01-login" ? 700 : 1800);

    if (s.click) {
      await clickByText(page, s.click);
      await sleep(1800);
    }

    // re-login se foi para login screen acidentalmente após clear
    if (s.id !== "01-login" && s.id !== "10-esqueci-senha" && page.url().includes("/login")) {
      const ins = await page.$$("input");
      await ins[0].type(EMAIL, { delay: 10 });
      await ins[1].type(SENHA, { delay: 10 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => null),
        clickByText(page, "Entrar"),
      ]);
      await sleep(1500);
      await page.goto(`${BASE}${s.rota}`, { waitUntil: "networkidle2" });
      await sleep(1800);
      if (s.click) { await clickByText(page, s.click); await sleep(1800); }
    }

    await annotate(page, s.annotations);
    await sleep(400);
    const file = path.join(OUT_IMG, `${s.id}.jpg`);
    await page.screenshot({
      path: file, type: "jpeg", quality: 88,
      fullPage: !!s.full,
    });
    console.log(`  ✓ ${file}`);
  }

  await browser.close();
}

// ============================================================================
// GERAÇÃO DO HTML
// ============================================================================
function buildHTML() {
  const logoData = "data:image/jpeg;base64," +
    fs.readFileSync("client/public/logo-fc.jpg").toString("base64");

  const dataUri = (file) => "data:image/jpeg;base64," +
    fs.readFileSync(file).toString("base64");

  const screensHTML = SCREENS.map((s, i) => {
    const img = path.join(OUT_IMG, `${s.id}.jpg`);
    const imgData = fs.existsSync(img) ? dataUri(img) : "";
    const rows = s.annotations.map((a) => `
      <tr>
        <td class="num"><span class="badge">${a.num}</span></td>
        <td class="lbl">${a.label}</td>
        <td>${a.desc}</td>
      </tr>`).join("");
    return `
      <section class="screen ${i % 2 ? 'alt' : ''}">
        <h2><span class="cap-num">${String(i + 1).padStart(2, "0")}</span> ${s.title}</h2>
        ${s.rota ? `<div class="rota"><strong>Rota:</strong> <code>${s.rota}</code>${s.click ? ` &nbsp;|&nbsp; <strong>Aba clicada:</strong> ${s.click}` : ""}</div>` : ""}
        <p class="intro">${s.intro}</p>
        ${imgData ? `<div class="shot"><img src="${imgData}" alt="${s.title}"/></div>` : ""}
        <h3>Elementos numerados</h3>
        <table class="legend">
          <thead><tr><th>Nº</th><th>Elemento</th><th>Função</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Manual do Portal do Cliente — FC Engenharia</title>
<style>
  @page { size: A4; margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2937; line-height: 1.55; font-size: 11pt; margin: 0;
  }
  .cover {
    height: 250mm; display: flex; flex-direction: column; justify-content: center;
    align-items: center; text-align: center; padding: 30mm 20mm;
    background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%);
    color: #fff; page-break-after: always;
  }
  .cover img { width: 130px; height: 130px; border-radius: 28px; background:#fff; padding:10px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.25); margin-bottom: 28px; object-fit: contain; }
  .cover .kicker { font-size: 11pt; letter-spacing: 4px; opacity: 0.85; margin-bottom: 12px; text-transform: uppercase; }
  .cover h1 { font-size: 32pt; margin: 0 0 12px; font-weight: 800; line-height: 1.1; }
  .cover .sub { font-size: 14pt; opacity: 0.95; margin-bottom: 36px; max-width: 130mm; }
  .cover .meta { display: flex; gap: 18px; flex-wrap: wrap; justify-content: center; font-size: 10pt; }
  .cover .meta div { background: rgba(255,255,255,0.13); border:1px solid rgba(255,255,255,0.2);
    padding: 8px 16px; border-radius: 8px; }
  .cover .footer { position:absolute; bottom:18mm; left:0; right:0; text-align:center; font-size:9pt; opacity:.7; }

  .toc { page-break-after: always; padding: 14mm 4mm; }
  .toc h2 { color:#1e3a8a; border-bottom: 3px solid #2563eb; padding-bottom: 6px; }
  .toc ol { columns: 1; padding-left: 20px; }
  .toc li { padding: 4px 0; }

  .intro-block { padding: 4mm; page-break-after: always; }
  .intro-block h2 { color:#1e3a8a; }
  .intro-block .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: 4mm; }
  .intro-block .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 4mm; background: #f9fafb; }
  .intro-block .card h4 { margin: 0 0 4px; color: #1e3a8a; font-size: 11pt; }
  .intro-block .card p { margin: 0; font-size: 9.5pt; color: #4b5563; }

  section.screen { page-break-before: always; padding: 0 2mm; }
  section.screen h2 {
    color: #1e3a8a; border-bottom: 3px solid #2563eb;
    padding-bottom: 6px; margin: 0 0 8px; font-size: 18pt;
  }
  section.screen .cap-num {
    display: inline-block; background: #1e3a8a; color: #fff;
    width: 32px; height: 32px; border-radius: 50%; text-align: center;
    line-height: 32px; font-size: 14pt; margin-right: 8px;
  }
  .rota { font-size: 9.5pt; color: #4b5563; margin: 0 0 8px;
    background: #f3f4f6; padding: 6px 10px; border-radius: 6px; }
  .rota code { background: #fff; padding: 2px 6px; border-radius: 4px; color: #1e3a8a; font-weight: 600; }
  .intro { font-size: 10.5pt; color: #374151; margin: 0 0 10px; }
  .shot { text-align: center; margin: 10px 0; page-break-inside: avoid; }
  .shot img { max-width: 100%; max-height: 195mm; border: 1px solid #d1d5db;
    border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
  section.screen h3 { color: #1e3a8a; font-size: 13pt; margin: 14px 0 6px; }
  table.legend { width: 100%; border-collapse: collapse; font-size: 10pt; }
  table.legend th { background: #1e3a8a; color: #fff; text-align: left; padding: 6px 8px; }
  table.legend td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  table.legend tr:nth-child(even) td { background: #f9fafb; }
  table.legend td.num { text-align: center; width: 40px; }
  table.legend td.lbl { font-weight: 600; color: #1e3a8a; width: 50mm; }
  .badge { display: inline-block; background: #ef4444; color: #fff;
    width: 26px; height: 26px; border-radius: 50%; line-height: 26px;
    font-weight: 800; font-size: 11pt; }

  .closing { padding: 20mm 10mm; page-break-before: always; }
  .closing h2 { color: #1e3a8a; }
  .closing .rule {
    background: #fef3c7; border-left: 5px solid #f59e0b;
    padding: 10px 14px; margin: 8px 0; border-radius: 6px; font-size: 10pt;
  }
  .closing .rule strong { color: #92400e; }
  table.gloss { width:100%; border-collapse:collapse; font-size:9.5pt; margin-top:8px; }
  table.gloss th, table.gloss td { border:1px solid #e5e7eb; padding:5px 8px; text-align:left; }
  table.gloss th { background:#1e3a8a; color:#fff; }
</style>
</head>
<body>

<div class="cover">
  <img src="${logoData}" alt="FC Engenharia"/>
  <div class="kicker">Manual Técnico Completo</div>
  <h1>Portal do Cliente</h1>
  <div class="sub">FC Engenharia · Plataforma ERP<br/>
    Documentação visual com prints anotados de cada tela, botão e funcionalidade.</div>
  <div class="meta">
    <div><strong>Versão da plataforma:</strong> Rev. 1601</div>
    <div><strong>Captura ao vivo:</strong> 10/05/2026</div>
    <div><strong>Cliente exemplo:</strong> Santuário Aparecida</div>
    <div><strong>Obra exemplo:</strong> REVTE-CIVIL</div>
  </div>
  <div class="footer">Documento preparado para ingestão no NotebookLM</div>
</div>

<div class="toc">
  <h2>Sumário</h2>
  <ol>
    <li>Visão Geral e Arquitetura do Portal</li>
    ${SCREENS.map((s, i) => `<li>${s.title}</li>`).join("\n    ")}
    <li>Regras de Ouro · Glossário · Anexos</li>
  </ol>
</div>

<div class="intro-block">
  <h2>Visão Geral e Arquitetura</h2>
  <p>O <strong>Portal do Cliente</strong> é a vitrine externa controlada do ERP da FC Engenharia.
  Permite ao cliente contratante (e à gerenciadora) acompanhar em tempo real o andamento físico
  da obra, projetos técnicos, efetivo alocado e responder à pesquisa anônima de satisfação (NPS).
  Está separado do ERP interno (rota <code>/portal/cliente/*</code>), tem JWT próprio e
  isolamento de tenant rígido por <code>companyId</code>.</p>

  <div class="grid">
    <div class="card"><h4>Stack Frontend</h4><p>React 19 + Tailwind 4 + shadcn/ui + Wouter. Componentes em <code>client/src/pages/portal/</code>.</p></div>
    <div class="card"><h4>Stack Backend</h4><p>tRPC 11 + Express + Drizzle ORM. Router <code>portalExterno</code> com namespace <code>cliente.*</code>.</p></div>
    <div class="card"><h4>Autenticação</h4><p>CNPJ, CPF ou e-mail + senha. JWT armazenado em <code>localStorage</code> como <code>pc_token</code>.</p></div>
    <div class="card"><h4>Tenant Isolation</h4><p>Toda query carrega <code>companyId</code> + filtro de obras vinculadas. Soft-deletes filtrados.</p></div>
    <div class="card"><h4>Liberações</h4><p>Por cliente são definidos módulos (<code>mod_planejamento</code>, <code>mod_proj_doc</code>, <code>mod_avaliacao</code>) e abas internas.</p></div>
    <div class="card"><h4>Regra de Ouro</h4><p>O Portal NUNCA pode divergir do módulo Planejamento. Mesmo universo de atividades, mesmas fórmulas.</p></div>
  </div>

  <h3 style="color:#1e3a8a;margin-top:8mm">Endpoints principais consumidos</h3>
  <pre style="background:#1e3a8a;color:#a7f3d0;padding:6mm;border-radius:6px;font-size:9pt;overflow:auto">
portalExterno.cliente.meuPerfil
portalExterno.cliente.meusDados
portalExterno.cliente.minhasObras
portalExterno.cliente.liberacoes
portalExterno.cliente.planejamentoObra
portalExterno.cliente.efetivoObra
portalExterno.cliente.documentosRhObra
portalExterno.cliente.projDocObra
portalExterno.cliente.podeAvaliarEsteMes
portalExterno.cliente.criarAvaliacao
portalExterno.cliente.listarComentarios</pre>
</div>

${screensHTML}

<div class="closing">
  <h2>Regras de Ouro</h2>

  <div class="rule"><strong>Datas no padrão brasileiro.</strong> Toda data exibida ao usuário deve estar
  em <code>dd/MM/aaaa</code>. Nunca exibir <code>YYYY-MM-DD</code> cru vindo do banco.</div>

  <div class="rule"><strong>Paridade Portal × Planejamento.</strong> O Portal NUNCA pode divergir do
  módulo Planejamento (REFIS, Curva S, Avanço Físico, SPI). Planejamento é a fonte única da
  verdade. Mesmo universo de atividades (folhas com dataInicio &amp;&amp; dataFim), mesmo denominador,
  mesma convenção para indiretas (curva prevista linear no realizado).</div>

  <div class="rule"><strong>Limiar de 20% para SPI.</strong> Quando o avanço previsto até hoje for &lt; 20%,
  o sistema mostra o banner "Fase inicial · SPI X.XX (referência)" sem extrapolar ETA. Acima de 20%
  a projeção clássica volta a valer (referência: PMBOK / Earned Schedule, Walt Lipke 2003).</div>

  <div class="rule"><strong>Anonimato da Avaliação.</strong> A tabela <code>cliente_avaliacao_marcacoes</code>
  registra apenas o fato do envio. O conteúdo vai para <code>cliente_avaliacoes</code> sem o ID do usuário.</div>

  <h2 style="margin-top:12mm">Glossário Técnico</h2>
  <table class="gloss">
    <thead><tr><th>Sigla</th><th>Significado</th></tr></thead>
    <tbody>
      <tr><td><strong>CPM</strong></td><td>Critical Path Method — cálculo do caminho crítico</td></tr>
      <tr><td><strong>CPI</strong></td><td>Cost Performance Index = Custo Realizado / Previsto</td></tr>
      <tr><td><strong>EAP</strong></td><td>Estrutura Analítica do Projeto (WBS)</td></tr>
      <tr><td><strong>Float</strong></td><td>Folga, em dias, entre término planejado e prazo da obra</td></tr>
      <tr><td><strong>Marco</strong></td><td>Atividade de duração zero (entrega, evento)</td></tr>
      <tr><td><strong>NPS</strong></td><td>Net Promoter Score — métrica de satisfação</td></tr>
      <tr><td><strong>PMBOK</strong></td><td>Project Management Body of Knowledge — guia PMI</td></tr>
      <tr><td><strong>REFIS</strong></td><td>Relatório de Fiscalização — snapshot semanal oficial</td></tr>
      <tr><td><strong>SPI</strong></td><td>Schedule Performance Index = Realizado / Previsto</td></tr>
      <tr><td><strong>Tenant isolation</strong></td><td>Garantia de que dados de um cliente não vazam para outro</td></tr>
    </tbody>
  </table>

  <h2 style="margin-top:12mm">Anexos — Arquivos do Código</h2>
  <ul style="font-size:9.5pt">
    <li><code>client/src/pages/portal/PortalLoginCliente.tsx</code> — Tela de login</li>
    <li><code>client/src/pages/portal/PortalHubCliente.tsx</code> — Hub do cliente</li>
    <li><code>client/src/pages/portal/PortalPlanejamentoCliente.tsx</code> — Módulo Planejamento</li>
    <li><code>client/src/pages/portal/PortalProjDocCliente.tsx</code> — Módulo Proj./Doc.</li>
    <li><code>client/src/pages/portal/PortalDashboardCliente.tsx</code> — Avaliação Anônima</li>
    <li><code>server/routers/portalExterno.ts</code> — Backend tRPC do portal</li>
    <li><code>shared/portalPerguntasCore.ts</code> — 8 perguntas CORE da pesquisa NPS</li>
    <li><code>shared/portalAvaliacao.ts</code> — Helper de janelas de avaliação</li>
    <li><code>drizzle/schema.ts</code> — Tabelas <code>portal_clientes_*</code>, <code>cliente_avaliacoes</code></li>
  </ul>

  <p style="margin-top:14mm;font-size:9pt;color:#6b7280;text-align:center">
    Documento gerado em 10/05/2026 a partir de capturas ao vivo do ambiente Rev. 1601.<br/>
    Cliente exemplo: Felipe Alves (Santuário Aparecida) · Obras: REVTE-CIVIL e VITRA.
  </p>
</div>

</body>
</html>`;
}

// ============================================================================
// HTML → PDF via Chromium
// ============================================================================
async function htmlToPDF(html, outPath) {
  const tmpHTML = "/tmp/portal-manual.html";
  fs.writeFileSync(tmpHTML, html);
  const browser = await puppeteer.launch({
    headless: true, executablePath: CHROMIUM,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(`file://${tmpHTML}`, { waitUntil: "networkidle0" });
  await page.pdf({
    path: outPath, format: "A4", printBackground: true,
    margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
  });
  await browser.close();
}

// ============================================================================
// MAIN
// ============================================================================
(async () => {
  console.log("BASE:", BASE);
  console.log("\n[1/3] Capturando prints anotados…");
  await captureAll();
  console.log("\n[2/3] Montando HTML…");
  const html = buildHTML();
  console.log("\n[3/3] Gerando PDF…");
  await htmlToPDF(html, OUT_PDF);
  const stat = fs.statSync(OUT_PDF);
  console.log(`\n✅ PDF gerado: ${OUT_PDF} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
})();
