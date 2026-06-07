import { invokeLLM } from "../_core/llm";
import { calcularDRE } from "./financialKpiService";

// ============================================================
// ANÁLISE DE IA DO DRE — FC Engenharia
//
// Gera uma leitura inteligente da Demonstração de Resultado comparando os
// indicadores da empresa com BENCHMARKS REAIS do setor de construção/engenharia
// e fundamentando cada conclusão na literatura financeira. Toda afirmação
// referencia FONTES de um catálogo CURADO (sem URLs inventadas pela IA).
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

// Benchmarks de referência do setor de construção/engenharia (faixas), com a
// fonte que os fundamenta. Servem para a IA comparar a empresa com o mercado.
const BENCHMARKS_SETOR = [
  { indicador: "Margem Bruta", faixa: "15% a 30%", fontes: ["damodaran-margins", "ibge-paic"] },
  { indicador: "Margem EBITDA", faixa: "8% a 15%", fontes: ["damodaran-margins", "assaf-neto"] },
  { indicador: "Margem Líquida", faixa: "4% a 8%", fontes: ["damodaran-margins", "ibge-paic"] },
  { indicador: "Custos Diretos de Obra / Receita", faixa: "70% a 85%", fontes: ["ibge-paic", "incc-fgv"] },
  { indicador: "Despesas Operacionais / Receita", faixa: "8% a 18%", fontes: ["ibge-paic", "matarazzo"] },
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
  indicadores: IndicadorAnalise[];
  riscos: { texto: string; severidade: "alta" | "media" | "baixa"; fontes: string[] }[];
  recomendacoes: { texto: string; fontes: string[] }[];
  fontes: FonteDRE[];
  geradoEm: string;
  periodo: string;
  modeloAusente?: boolean;
}

function brl(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}

// Limpa cercas de código e extrai o primeiro objeto JSON do texto.
function parseJsonLoose(text: string): any {
  let t = (text || "").trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

const FONTE_IDS = new Set(FONTES_DRE.map((f) => f.id));
function sanitizeFontes(ids: any): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter((x) => typeof x === "string" && FONTE_IDS.has(x));
}

export async function analisarDRE(
  companyId: number,
  periodo: string,
  tipoPeriodo: TipoPeriodoDRE = "mensal",
): Promise<AnaliseDREResult> {
  const dre = await calcularDRE(companyId, periodo, tipoPeriodo);

  const custosPct = dre.receitaLiquida > 0 ? (dre.custosObra / dre.receitaLiquida) * 100 : 0;
  const despOpPct =
    dre.receitaLiquida > 0
      ? ((dre.despesasFixas + dre.despesasVariaveis) / dre.receitaLiquida) * 100
      : 0;

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
    despesasOperacionaisPctReceita: Number(despOpPct.toFixed(1)),
    ebitda: dre.ebitda,
    margemEbitda: Number(dre.margemEbitda.toFixed(1)),
    resultadoFinanceiro: dre.resultadoFinanceiro,
    lair: dre.lair,
    impostos: dre.impostos,
    lucroLiquido: dre.lucroLiquido,
    margemLiquida: Number(dre.margemLiquida.toFixed(1)),
  };

  // Sem receita no período → não há o que analisar; devolve esqueleto honesto.
  if (dre.receitaLiquida <= 0 && dre.lucroLiquido === 0 && dre.custosObra === 0) {
    return {
      resumoExecutivo:
        "Não há lançamentos financeiros suficientes neste período para uma análise de resultado. Lance receitas e despesas do período para habilitar a leitura inteligente.",
      saude: "atencao",
      indicadores: [],
      riscos: [],
      recomendacoes: [],
      fontes: [],
      geradoEm: new Date().toISOString(),
      periodo: dre.periodo,
      modeloAusente: false,
    };
  }

  const sys =
    "Você é um analista financeiro sênior (CFO) especializado no setor brasileiro de CONSTRUÇÃO CIVIL e ENGENHARIA. " +
    "Analise a DRE da empresa comparando com os BENCHMARKS DO SETOR fornecidos e fundamente CADA conclusão na literatura/indicadores do catálogo de fontes. " +
    "REGRAS RÍGIDAS: (1) Use APENAS os números fornecidos — JAMAIS invente valores. (2) Em 'fontes' cite SOMENTE ids existentes no catálogo (nunca invente fontes ou URLs). (3) Escreva em português do Brasil, direto e objetivo, linguagem de gestor. (4) Responda SOMENTE com JSON válido, sem texto fora do JSON.";

  const prompt =
    `NÚMEROS DA DRE DA EMPRESA (período ${dre.periodo}):\n` +
    JSON.stringify(numeros, null, 2) +
    `\n\nBENCHMARKS DO SETOR (faixas de referência):\n` +
    JSON.stringify(BENCHMARKS_SETOR, null, 2) +
    `\n\nCATÁLOGO DE FONTES (use só estes ids em "fontes"):\n` +
    JSON.stringify(
      FONTES_DRE.map((f) => ({ id: f.id, titulo: f.titulo, nota: f.nota })),
      null,
      2,
    ) +
    `\n\nProduza um JSON EXATAMENTE neste formato:\n` +
    `{
  "resumoExecutivo": "2 a 4 frases resumindo a saúde do resultado e o destaque do período",
  "saude": "excelente|boa|atencao|critica",
  "indicadores": [
    {
      "nome": "Margem Bruta",
      "valor": <number>,
      "unidade": "%",
      "benchmarkSetor": "15% a 30%",
      "status": "acima|dentro|abaixo",
      "leitura": "1-2 frases interpretando o valor x setor, fundamentado",
      "fontes": ["damodaran-margins","ibge-paic"]
    }
    // inclua: Margem Bruta, Margem EBITDA, Margem Líquida, Custos de Obra/Receita, e 1-2 outros relevantes
  ],
  "riscos": [ { "texto": "...", "severidade": "alta|media|baixa", "fontes": ["..."] } ],
  "recomendacoes": [ { "texto": "...", "fontes": ["..."] } ]
}\n` +
    `Gere de 4 a 6 indicadores, 2 a 4 riscos e 2 a 4 recomendações. Cada item DEVE citar ao menos uma fonte do catálogo.`;

  let parsed: any;
  try {
    const resp = await invokeLLM({
      fast: true,
      maxTokens: 4000,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
    });
    const content = resp?.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : JSON.stringify(content ?? "");
    parsed = parseJsonLoose(text);
  } catch (e: any) {
    return {
      resumoExecutivo:
        "Não foi possível gerar a análise de IA agora (" +
        String(e?.message ?? "erro").slice(0, 120) +
        "). Os números do DRE permanecem disponíveis na tabela abaixo.",
      saude: "atencao",
      indicadores: [],
      riscos: [],
      recomendacoes: [],
      fontes: [],
      geradoEm: new Date().toISOString(),
      periodo: dre.periodo,
      modeloAusente: true,
    };
  }

  const saudeValida = ["excelente", "boa", "atencao", "critica"];
  const saude = saudeValida.includes(parsed?.saude) ? parsed.saude : "atencao";

  const indicadores: IndicadorAnalise[] = Array.isArray(parsed?.indicadores)
    ? parsed.indicadores.slice(0, 8).map((i: any) => ({
        nome: String(i?.nome ?? "").slice(0, 60),
        valor: Number(i?.valor ?? 0),
        unidade: i?.unidade === "R$" ? "R$" : "%",
        benchmarkSetor: String(i?.benchmarkSetor ?? "").slice(0, 40),
        status: ["acima", "dentro", "abaixo"].includes(i?.status) ? i.status : "dentro",
        leitura: String(i?.leitura ?? "").slice(0, 400),
        fontes: sanitizeFontes(i?.fontes),
      }))
    : [];

  const riscos = Array.isArray(parsed?.riscos)
    ? parsed.riscos.slice(0, 6).map((r: any) => ({
        texto: String(r?.texto ?? "").slice(0, 400),
        severidade: ["alta", "media", "baixa"].includes(r?.severidade) ? r.severidade : "media",
        fontes: sanitizeFontes(r?.fontes),
      }))
    : [];

  const recomendacoes = Array.isArray(parsed?.recomendacoes)
    ? parsed.recomendacoes.slice(0, 6).map((r: any) => ({
        texto: String(r?.texto ?? "").slice(0, 400),
        fontes: sanitizeFontes(r?.fontes),
      }))
    : [];

  // Resolve só as fontes efetivamente referenciadas.
  const usados = new Set<string>();
  indicadores.forEach((i) => i.fontes.forEach((f) => usados.add(f)));
  riscos.forEach((r) => r.fontes.forEach((f) => usados.add(f)));
  recomendacoes.forEach((r) => r.fontes.forEach((f) => usados.add(f)));
  const fontes = FONTES_DRE.filter((f) => usados.has(f.id));

  return {
    resumoExecutivo: String(parsed?.resumoExecutivo ?? "").slice(0, 800) || `Resultado de ${brl(dre.lucroLiquido)} no período.`,
    saude,
    indicadores,
    riscos,
    recomendacoes,
    fontes,
    geradoEm: new Date().toISOString(),
    periodo: dre.periodo,
  };
}
