import Anthropic from "@anthropic-ai/sdk";
import { calcularDRE, calcularDRECustoPorConta } from "./financialKpiService";

// Rev. 3957 — Claude Opus 4-5 diretamente (mais poderoso da Anthropic).
// Não passa pelo invokeLLM genérico para evitar timeout iOS em ~95%:
// o roteador usava Sonnet 4-6 (lento p/ 6k tokens) e caia no timeout do proxy.
const OPUS_MODEL = "claude-opus-4-5";

function getAnthropicDirect(): Anthropic {
  if (process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL && process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) {
    return new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  throw new Error("Anthropic não configurado. Ative a integração Anthropic no Replit ou configure ANTHROPIC_API_KEY.");
}

async function callOpus(system: string, userMsg: string, maxTokens = 8000): Promise<string> {
  const client = getAnthropicDirect();
  const resp = await client.messages.create({
    model: OPUS_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMsg }],
  });
  const block = resp.content.find((c) => c.type === "text");
  return block && "text" in block ? block.text : "";
}

// ============================================================
// ANÁLISE DE IA DO DRE — FC Engenharia
//
// Gera um diagnóstico cirúrgico para EMPREITADA DE OBRA: indicadores x setor,
// análise Pareto de custos, plano de ação concreto com prioridade/prazo/impacto.
// Toda afirmação referencia FONTES de um catálogo CURADO.
// ============================================================

export type TipoPeriodoDRE = "mensal" | "trimestral" | "semestral" | "anual";

export interface FonteDRE {
  id: string;
  titulo: string;
  autor: string;
  tipo: "Dado de mercado" | "Indicador setorial" | "Indicador macro" | "Literatura" | "Norma";
  url: string;
  nota: string;
}

export interface ParetoCustoItem {
  conta: string;
  valor: number;
  pctReceita: number;
  pctCustoTotal: number;
  pctAcumulado: number;
  categoria: "custo_obra" | "despesa_fixa" | "despesa_variavel";
}

export interface PlanoAcaoItem {
  prioridade: number;
  prazo: "imediato" | "30d" | "90d" | "180d";
  acao: string;
  area: string;
  impacto: "alto" | "medio" | "baixo";
  probabilidadeEficacia: number;
  justificativa: string;
  fontes: string[];
}

// Catálogo CURADO de fontes reais e verificáveis. A IA só pode citar estes ids.
export const FONTES_DRE: FonteDRE[] = [
  {
    id: "damodaran-margins",
    titulo: "Operating & Net Margins by Industry (Engineering/Construction)",
    autor: "Aswath Damodaran — NYU Stern",
    tipo: "Dado de mercado",
    url: "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/margin.html",
    nota: "Base global de margens operacionais e líquidas por setor, atualizada anualmente. Engenharia/Construção: margem líquida típica ~4–8%, margem EBITDA ~8–14%.",
  },
  {
    id: "ibge-paic",
    titulo: "PAIC — Pesquisa Anual da Indústria da Construção",
    autor: "IBGE",
    tipo: "Indicador setorial",
    url: "https://www.ibge.gov.br/estatisticas/economicas/industria/9018-pesquisa-anual-da-industria-da-construcao.html",
    nota: "Receita, custos e margens das empresas de construção brasileiras. Custos+despesas costumam consumir 85–95% da receita do setor.",
  },
  {
    id: "cbic",
    titulo: "Indicadores e Banco de Dados da Construção",
    autor: "CBIC — Câmara Brasileira da Indústria da Construção",
    tipo: "Indicador setorial",
    url: "https://www.cbic.org.br/numeros/",
    nota: "PIB da construção, custos, emprego, atividade e expectativas do setor no Brasil.",
  },
  {
    id: "incc-fgv",
    titulo: "INCC — Índice Nacional de Custo da Construção",
    autor: "FGV IBRE",
    tipo: "Indicador setorial",
    url: "https://portalibre.fgv.br/incc",
    nota: "Evolução de custos de materiais e mão de obra da construção — pressão sobre os custos diretos de obra.",
  },
  {
    id: "sinduscon",
    titulo: "Benchmarks de Desempenho — Empreiteiras de Obra",
    autor: "SINDUSCON-SP / FGV",
    tipo: "Indicador setorial",
    url: "https://www.sindusconsp.com.br/indicadores/",
    nota: "Indicadores de margem, overhead e produtividade para empreiteiras brasileiras. Overhead / Receita máximo saudável: 12-15%. Folha indireta / CDO: até 18%. Subempreiteiros como % do CDO: 20-40%.",
  },
  {
    id: "bacen-selic",
    titulo: "Taxa Selic e indicadores macroeconômicos",
    autor: "Banco Central do Brasil",
    tipo: "Indicador macro",
    url: "https://www.bcb.gov.br/controleinflacao/taxaselic",
    nota: "Custo do dinheiro no Brasil — referência para resultado financeiro, custo da dívida e custo de capital.",
  },
  {
    id: "assaf-neto",
    titulo: "Finanças Corporativas e Valor (8ª ed., Atlas)",
    autor: "Alexandre Assaf Neto",
    tipo: "Literatura",
    url: "https://www.google.com/search?q=Assaf+Neto+Finan%C3%A7as+Corporativas+e+Valor",
    nota: "Referência brasileira para análise de margens, EBITDA, alavancagem e estrutura de resultado.",
  },
  {
    id: "matarazzo",
    titulo: "Análise Financeira de Balanços (Atlas)",
    autor: "Dante C. Matarazzo",
    tipo: "Literatura",
    url: "https://www.google.com/search?q=Matarazzo+An%C3%A1lise+Financeira+de+Balan%C3%A7os",
    nota: "Clássico brasileiro de índices de lucratividade e interpretação da DRE.",
  },
  {
    id: "brigham-houston",
    titulo: "Fundamentals of Financial Management (16ª ed.)",
    autor: "Brigham & Houston",
    tipo: "Literatura",
    url: "https://www.google.com/search?q=Brigham+Houston+Fundamentals+of+Financial+Management",
    nota: "Indicadores de rentabilidade, margens, EBITDA e análise de demonstrações (cap. 3–4).",
  },
  {
    id: "cpc26-lei6404",
    titulo: "Estrutura da DRE — Lei 6.404/76 art. 187 + CPC 26",
    autor: "CPC / Legislação societária",
    tipo: "Norma",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l6404consol.htm",
    nota: "Define a ordem e a composição da Demonstração do Resultado do Exercício.",
  },
];

// Benchmarks específicos para EMPREITADA DE OBRA (contratos por medição).
const BENCHMARKS_SETOR = [
  { indicador: "Margem Bruta", faixa: "20% a 35%", fontes: ["damodaran-margins", "sinduscon"], nota: "Empreiteira saudável mantém ≥20%; abaixo de 15% indica precificação insuficiente ou custos diretos fora de controle." },
  { indicador: "Margem EBITDA", faixa: "10% a 18%", fontes: ["damodaran-margins", "sinduscon"], nota: "Faixa para empreitadas. EBITDA negativo = estrutura operacional não sustentável no prazo." },
  { indicador: "Margem Líquida", faixa: "4% a 8%", fontes: ["damodaran-margins", "ibge-paic"], nota: "Margem líquida positiva exige rigor em custos diretos E overhead controlado." },
  { indicador: "Custos Diretos de Obra (CDO) / Receita", faixa: "65% a 80%", fontes: ["ibge-paic", "sinduscon"], nota: "Inclui mão de obra de campo, materiais e subempreiteiros. Acima de 80% comprime a margem bruta." },
  { indicador: "Overhead (Desp. Op.) / Receita", faixa: "8% a 15%", fontes: ["sinduscon", "ibge-paic"], nota: "Escritório central + administrativo + comercial. Acima de 15% é sinal de estrutura inchada para o faturamento atual." },
  { indicador: "Folha Indireta / CDO", faixa: "até 18%", fontes: ["sinduscon", "cbic"], nota: "Relação entre pessoal de escritório/supervisão e custo direto. Acima de 18% indica equipe indireta superdimensionada." },
];

export interface IndicadorAnalise {
  nome: string;
  valor: number;
  unidade: "%" | "R$";
  benchmarkSetor: string;
  status: "acima" | "dentro" | "abaixo";
  leitura: string;
  fontes: string[];
}

export interface AnaliseDREResult {
  resumoExecutivo: string;
  saude: "excelente" | "boa" | "atencao" | "critica";
  nota: number;
  indicadores: IndicadorAnalise[];
  riscos: { texto: string; severidade: "alta" | "media" | "baixa"; fontes: string[] }[];
  recomendacoes: { texto: string; fontes: string[] }[];
  planoAcao: PlanoAcaoItem[];
  paretoCustos: ParetoCustoItem[];
  fontes: FonteDRE[];
  geradoEm: string;
  periodo: string;
  modeloAusente?: boolean;
}

function brl(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}

// Tenta reparar JSON truncado fechando arrays/objetos abertos.
// Necessário quando max_tokens corta a resposta no meio de um array.
function repairTruncatedJson(raw: string): string {
  let t = raw.trimEnd();
  // Remove vírgula/colchete/chave pendurado no final
  t = t.replace(/,\s*$/, "");
  // Rastreia pilha de abertura
  const stack: string[] = [];
  let inStr = false;
  let escape = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (escape) { escape = false; continue; }
    if (c === "\\" && inStr) { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }
  // Fecha o que está aberto, na ordem inversa
  return t + stack.reverse().join("");
}

function parseJsonLoose(text: string): any {
  let t = (text || "").trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{");
  if (start >= 0) t = t.slice(start);
  // 1ª tentativa: JSON completo
  const endFull = t.lastIndexOf("}");
  if (endFull > 0) {
    try { return JSON.parse(t.slice(0, endFull + 1)); } catch {}
  }
  // 2ª tentativa: reparar truncamento
  try { return JSON.parse(repairTruncatedJson(t)); } catch (e2) {
    throw new Error(`JSON inválido mesmo após reparo: ${(e2 as any)?.message}`);
  }
}

const FONTE_IDS = new Set(FONTES_DRE.map((f) => f.id));
function sanitizeFontes(ids: any): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter((x) => typeof x === "string" && FONTE_IDS.has(x));
}

function sanitizePrazo(v: any): PlanoAcaoItem["prazo"] {
  const valid = ["imediato", "30d", "90d", "180d"];
  return valid.includes(v) ? v : "90d";
}

export async function analisarDRE(
  companyId: number,
  periodo: string,
  tipoPeriodo: TipoPeriodoDRE = "mensal",
): Promise<AnaliseDREResult> {
  const [dre, paretoCustos] = await Promise.all([
    calcularDRE(companyId, periodo, tipoPeriodo),
    calcularDRECustoPorConta(companyId, periodo, tipoPeriodo, 15),
  ]);

  const custosPct = dre.receitaLiquida > 0 ? (dre.custosObra / dre.receitaLiquida) * 100 : 0;
  const despOpPct =
    dre.receitaLiquida > 0
      ? ((dre.despesasFixas + dre.despesasVariaveis) / dre.receitaLiquida) * 100
      : 0;
  const overheadTotal = dre.despesasFixas + dre.despesasVariaveis;
  const folhaIndiretaPct = dre.custosObra > 0 ? (overheadTotal / dre.custosObra) * 100 : 0;

  const numeros = {
    periodo: dre.periodo,
    receitaBruta: dre.receitaBruta,
    receitaLiquida: dre.receitaLiquida,
    custosObra: dre.custosObra,
    custosObraPctReceita: Number(custosPct.toFixed(1)),
    lucroBruto: dre.lucroBruto,
    margemBruta: Number(dre.margemBruta.toFixed(1)),
    despesasFixas: dre.despesasFixas,
    despesasVariaveis: dre.despesasVariaveis,
    overheadTotal,
    despesasOperacionaisPctReceita: Number(despOpPct.toFixed(1)),
    overheadPctCDO: Number(folhaIndiretaPct.toFixed(1)),
    ebitda: dre.ebitda,
    margemEbitda: Number(dre.margemEbitda.toFixed(1)),
    resultadoFinanceiro: dre.resultadoFinanceiro,
    lair: dre.lair,
    impostos: dre.impostos,
    lucroLiquido: dre.lucroLiquido,
    margemLiquida: Number(dre.margemLiquida.toFixed(1)),
  };

  if (dre.receitaLiquida <= 0 && dre.lucroLiquido === 0 && dre.custosObra === 0) {
    return {
      resumoExecutivo:
        "Não há lançamentos financeiros suficientes neste período para uma análise de resultado. Lance receitas e despesas do período para habilitar a leitura inteligente.",
      saude: "atencao",
      nota: 0,
      indicadores: [],
      riscos: [],
      recomendacoes: [],
      planoAcao: [],
      paretoCustos,
      fontes: [],
      geradoEm: new Date().toISOString(),
      periodo: dre.periodo,
      modeloAusente: false,
    };
  }

  // Formata o Pareto para o prompt (limite 12 itens p/ não explodir tokens)
  const paretoPrompt = paretoCustos.slice(0, 12).map((p) => ({
    conta: p.conta,
    valor: brl(p.valor),
    pctReceita: `${p.pctReceita}%`,
    pctCustoTotal: `${p.pctCustoTotal}%`,
    pctAcumulado: `${p.pctAcumulado}%`,
    categoria: p.categoria,
  }));

  const sys =
    "Você é um CFO sênior com 20 anos de experiência em EMPREITADA DE OBRAS no Brasil " +
    "(construção civil pesada e edificações — contratos por empreitada, medições mensais, " +
    "mão de obra direta e terceirizada, consórcios de obra). " +
    "MISSÃO: produzir um diagnóstico CIRÚRGICO com linguagem direta de gestor de obra. " +
    "Seja ESPECÍFICO: não escreva 'reduzir custos' — escreva 'reduzir quadro de serventes em 15-20% " +
    "via não-renovação de contratos de prazo fixo' ou 'o escritório central consome X% da receita, " +
    "acima do limite setorial de 12-15%; renegociar aluguel e fusão de postos administrativos podem " +
    "recuperar 3-5 pontos de EBITDA'. " +
    "Fundamente CADA conclusão nos dados fornecidos + catálogo de fontes. " +
    "REGRAS RÍGIDAS: (1) Use SOMENTE os números fornecidos — JAMAIS invente valores. " +
    "(2) Em 'fontes' cite SOMENTE ids existentes no catálogo (nunca invente). " +
    "(3) Português do Brasil, direto, sem rodeios, linguagem de gestor. " +
    "(4) Responda SOMENTE com JSON válido, sem texto fora do JSON.";

  const prompt =
    `NÚMEROS DA DRE DA EMPRESA (período ${dre.periodo}):\n` +
    JSON.stringify(numeros, null, 2) +
    `\n\nPARETO DE CUSTOS OPERACIONAIS (Top ${paretoPrompt.length} contas por valor — excluídas financeiras e impostos):\n` +
    JSON.stringify(paretoPrompt, null, 2) +
    `\n\nBENCHMARKS PARA EMPREITADA DE OBRA (faixas de referência):\n` +
    JSON.stringify(BENCHMARKS_SETOR, null, 2) +
    `\n\nCATÁLOGO DE FONTES (use SOMENTE estes ids em "fontes"):\n` +
    JSON.stringify(
      FONTES_DRE.map((f) => ({ id: f.id, titulo: f.titulo, nota: f.nota })),
      null,
      2,
    ) +
    `\n\nProduza um JSON EXATAMENTE neste formato (sem campos extras, sem comentários):\n` +
    `{
  "resumoExecutivo": "3-5 frases — diagnóstico preciso: o que está puxando o resultado pra baixo, qual o maior ofensor no Pareto, qual a urgência",
  "saude": "excelente|boa|atencao|critica",
  "nota": <0-100 coerente com 'saude' (crítica 0-39, atenção 40-59, boa 60-84, excelente 85-100)>,
  "indicadores": [
    {
      "nome": "Margem Bruta",
      "valor": <number>,
      "unidade": "%",
      "benchmarkSetor": "20% a 35%",
      "status": "acima|dentro|abaixo",
      "leitura": "1-2 frases interpretando o valor vs setor, citando o ofensor principal do Pareto quando relevante",
      "fontes": ["sinduscon","ibge-paic"]
    }
    // inclua: Margem Bruta, Margem EBITDA, Margem Líquida, CDO/Receita, Overhead/Receita, e 1-2 outros relevantes
  ],
  "riscos": [
    { "texto": "Texto ESPECÍFICO: ex 'Se o overhead (X% da receita) não for reduzido nos próximos 90 dias, a empresa corre risco de...'", "severidade": "alta|media|baixa", "fontes": ["..."] }
    // 3-5 riscos
  ],
  "recomendacoes": [
    { "texto": "Recomendação ESPECÍFICA: ex 'Mapear e renegociar os contratos com os 3 maiores fornecedores (respondem por Y% do CDO) — potencial de redução de 5-8%'", "fontes": ["..."] }
    // 3-5 recomendações
  ],
  "planoAcao": [
    {
      "prioridade": 1,
      "prazo": "imediato|30d|90d|180d",
      "acao": "Ação CONCRETA e MENSURÁVEL: 'Reduzir equipe administrativa em 2 postos (hoje overhead/CDO = X%, benchmark máx 18%) — economia estimada de R$ Y/mês'",
      "area": "Mão de obra direta|Mão de obra indireta|Materiais|Escritório central|Terceiros/Subempreiteiros|Financeiro|Tributário|Processos internos",
      "impacto": "alto|medio|baixo",
      "probabilidadeEficacia": <50-95, baseado em evidências setoriais — não invente, use literatura>,
      "justificativa": "1-2 frases: qual dado do Pareto ou DRE justifica esta ação e qual resultado esperado",
      "fontes": ["..."]
    }
    // 5-8 itens de plano de ação, em ordem decrescente de prioridade/impacto
  ]
}\n` +
    `Gere de 5-6 indicadores, 3-5 riscos, 3-5 recomendações e 5-8 itens de plano de ação. ` +
    `Cada item DEVE citar ao menos uma fonte do catálogo. ` +
    `Nos itens do plano de ação e riscos, referencie explicitamente os dados do Pareto ` +
    `(ex: 'conta X representa Y% da receita') e os benchmarks do setor. ` +
    `Se houver conta com >10% de receita no Pareto, ela DEVE aparecer no plano de ação.`;

  let parsed: any;
  try {
    const text = await callOpus(sys, prompt); // usa default 8000 tokens
    parsed = parseJsonLoose(text);
  } catch (e: any) {
    return {
      resumoExecutivo:
        "Não foi possível gerar a análise de IA agora (" +
        String(e?.message ?? "erro").slice(0, 120) +
        "). Os números do DRE permanecem disponíveis na tabela abaixo.",
      saude: "atencao",
      nota: 0,
      indicadores: [],
      riscos: [],
      recomendacoes: [],
      planoAcao: [],
      paretoCustos,
      fontes: [],
      geradoEm: new Date().toISOString(),
      periodo: dre.periodo,
      modeloAusente: true,
    };
  }

  const saudeValida = ["excelente", "boa", "atencao", "critica"];
  const saude = saudeValida.includes(parsed?.saude) ? parsed.saude : "atencao";

  const saudeNotaPadrao: Record<string, number> = { excelente: 90, boa: 72, atencao: 45, critica: 20 };
  const notaIA = Number(parsed?.nota);
  const nota = Number.isFinite(notaIA)
    ? Math.max(0, Math.min(100, Math.round(notaIA)))
    : (saudeNotaPadrao[saude] ?? 45);

  const indicadores: IndicadorAnalise[] = Array.isArray(parsed?.indicadores)
    ? parsed.indicadores.slice(0, 8).map((i: any) => ({
        nome: String(i?.nome ?? "").slice(0, 60),
        valor: Number(i?.valor ?? 0),
        unidade: i?.unidade === "R$" ? "R$" : "%",
        benchmarkSetor: String(i?.benchmarkSetor ?? "").slice(0, 40),
        status: ["acima", "dentro", "abaixo"].includes(i?.status) ? i.status : "dentro",
        leitura: String(i?.leitura ?? "").slice(0, 500),
        fontes: sanitizeFontes(i?.fontes),
      }))
    : [];

  const riscos = Array.isArray(parsed?.riscos)
    ? parsed.riscos.slice(0, 6).map((r: any) => ({
        texto: String(r?.texto ?? "").slice(0, 600),
        severidade: ["alta", "media", "baixa"].includes(r?.severidade) ? r.severidade : "media",
        fontes: sanitizeFontes(r?.fontes),
      }))
    : [];

  const recomendacoes = Array.isArray(parsed?.recomendacoes)
    ? parsed.recomendacoes.slice(0, 6).map((r: any) => ({
        texto: String(r?.texto ?? "").slice(0, 600),
        fontes: sanitizeFontes(r?.fontes),
      }))
    : [];

  const planoAcao: PlanoAcaoItem[] = Array.isArray(parsed?.planoAcao)
    ? parsed.planoAcao.slice(0, 8).map((a: any, idx: number) => ({
        prioridade: Number(a?.prioridade ?? idx + 1),
        prazo: sanitizePrazo(a?.prazo),
        acao: String(a?.acao ?? "").slice(0, 700),
        area: String(a?.area ?? "").slice(0, 80),
        impacto: ["alto", "medio", "baixo"].includes(a?.impacto) ? a.impacto : "medio",
        probabilidadeEficacia: Math.max(0, Math.min(100, Math.round(Number(a?.probabilidadeEficacia ?? 65)))),
        justificativa: String(a?.justificativa ?? "").slice(0, 500),
        fontes: sanitizeFontes(a?.fontes),
      }))
    : [];

  const usados = new Set<string>();
  indicadores.forEach((i) => i.fontes.forEach((f) => usados.add(f)));
  riscos.forEach((r) => r.fontes.forEach((f) => usados.add(f)));
  recomendacoes.forEach((r) => r.fontes.forEach((f) => usados.add(f)));
  planoAcao.forEach((a) => a.fontes.forEach((f) => usados.add(f)));
  const fontes = FONTES_DRE.filter((f) => usados.has(f.id));

  return {
    resumoExecutivo: String(parsed?.resumoExecutivo ?? "").slice(0, 1000) || `Resultado de ${brl(dre.lucroLiquido)} no período.`,
    saude,
    nota,
    indicadores,
    riscos,
    recomendacoes,
    planoAcao,
    paretoCustos,
    fontes,
    geradoEm: new Date().toISOString(),
    periodo: dre.periodo,
  };
}
