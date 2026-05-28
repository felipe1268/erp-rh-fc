/**
 * Classificador de natureza do item de almoxarifado (Rev. 2508).
 *
 * Migrado de `server/routers/compras.ts` pra `shared/` para que tanto o
 * BACKEND (gateway de OC→Almox e SmartEntry) quanto o FRONTEND (filtro
 * defensivo na timeline de Movimentações) usem A MESMA fonte de verdade.
 *
 * Heurística por palavras-chave no NOME do item + UNIDADE. Bloqueia
 * serviços, mão-de-obra, tributos, taxas e composições mistas
 * (material + MDO) que NÃO devem aparecer no almoxarifado nem
 * gerar movimentação de estoque.
 *
 * REGRA DE OURO: na dúvida, retorna `material: true` (não bloqueia).
 * Só bloqueia quando há ALTA confiança de não-material.
 *
 * Patterns ampliados na Rev. 2508 (relato user iPad — apareciam na
 * tela de Movimentações):
 *  - "Levantamento Topográfico para As Built"
 *  - "Serviços de Confecção de Placas Diversas" (já caía em /serviço/)
 *  - "Alçapão ( Material e Mão de Obra)" (já caía em /mão de obra/)
 *  - Topografia / sondagem / georreferenciamento em geral.
 */
export interface NaturezaItemAlmoxResult {
  /** true = é material estocável; false = serviço/tributo/MDO/etc. */
  material: boolean;
  /** Quando bloqueia, frase curta explicando o motivo (pra logs/UI). */
  motivo: string | null;
}

const PADROES: { rx: RegExp; motivo: string }[] = [
  // Serviços genéricos
  { rx: /\b(servi[cç]o|servi[cç]os)\b/i,            motivo: "descrição contém 'serviço'" },
  { rx: /\bmensalidade\b/i,                          motivo: "mensalidade (serviço recorrente)" },
  { rx: /\bassinatura\b/i,                           motivo: "assinatura (serviço recorrente)" },
  { rx: /\binternet\b/i,                             motivo: "Internet (serviço)" },
  { rx: /\bmanuten[cç][aã]o\b/i,                     motivo: "manutenção (serviço)" },
  { rx: /\bconsultoria\b/i,                          motivo: "consultoria (serviço)" },
  { rx: /\bhonor[aá]rio(s)?\b/i,                     motivo: "honorário (serviço)" },
  { rx: /\bhora[- ]?t[eé]cnica\b/i,                  motivo: "hora técnica (serviço)" },
  { rx: /\bm[aã]o[- ]de[- ]obra\b|\bmdo\b/i,         motivo: "mão de obra (serviço)" },
  // Tributos / encargos
  { rx: /\btaxa(s)?\b/i,                             motivo: "taxa (tributo/serviço)" },
  { rx: /\bimposto(s)?\b/i,                          motivo: "imposto (tributo)" },
  { rx: /\bmulta(s)?\b/i,                            motivo: "multa (tributo/penalidade)" },
  { rx: /\btarifa(s)?\b/i,                           motivo: "tarifa (serviço)" },
  { rx: /\bped[aá]gio\b/i,                           motivo: "pedágio (serviço)" },
  { rx: /\bseguro\b/i,                               motivo: "seguro (serviço)" },
  { rx: /\bcorreio(s)?\b|\bsedex\b/i,                motivo: "correios/sedex (serviço)" },
  { rx: /\bpapel\s+timbrado\b/i,                     motivo: "papel timbrado (gráfica/serviço)" },
  { rx: /\bponto\s+(facial|biom[eé]trico|eletr[oô]nico)\b/i, motivo: "ponto facial/biométrico (serviço)" },
  // TI / SaaS
  { rx: /\b(host(ing)?|hospedagem|dom[ií]nio|cloud|saas|software\s+como\s+servi[cç]o)\b/i, motivo: "TI/SaaS (serviço)" },
  { rx: /\b(licen[cç]a\s+de\s+software|licen[cç]a\s+anual)\b/i, motivo: "licença de software (serviço)" },
  { rx: /\b(loca[cç][aã]o\s+de\s+(software|sistema))\b/i, motivo: "locação de software (serviço)" },
  // Logística / técnico
  { rx: /\bfrete\b/i,                                motivo: "frete (serviço logístico)" },
  { rx: /\b(an[aá]lise|laudo|ensaio|inspe[cç][aã]o)\b/i, motivo: "ensaio/laudo (serviço técnico)" },
  { rx: /\bcurso(s)?\b|\btreinamento(s)?\b/i,        motivo: "curso/treinamento (serviço)" },
  // Rev. 2508 — NOVOS padrões: engenharia/levantamento (caso do user)
  { rx: /\btopogr[aá]f(ia|ico|ica)\b/i,              motivo: "topografia (serviço de engenharia)" },
  { rx: /\blevantamento(s)?\b/i,                     motivo: "levantamento (serviço de engenharia)" },
  { rx: /\bas[- ]built\b/i,                          motivo: "as built (serviço de engenharia)" },
  { rx: /\bgeorreferenc[ií]a(mento)?\b/i,            motivo: "georreferenciamento (serviço técnico)" },
  { rx: /\bsondagem\b|\bspt\b/i,                     motivo: "sondagem/SPT (serviço técnico)" },
  { rx: /\bprojeto\s+(arquitet[oô]nico|estrutural|el[eé]trico|hidr[aá]ulico|executivo)\b/i, motivo: "projeto (serviço de engenharia)" },
  { rx: /\bart\b.*\bcrea\b|\bart\s+crea\b/i,         motivo: "ART CREA (taxa profissional)" },
  // Locação / hora-máquina (vão pro controle de equipamentos, não almox)
  { rx: /\b(loca[cç][aã]o|aluguel)\s+de\s+(equipamento|m[aá]quina|caminh[aã]o|guindaste|grua|bomba|gerador|compressor|empilhadeira|retroescavadeira|escavadeira)\b/i, motivo: "locação de equipamento (controle de equipamentos)" },
  { rx: /\bhora[- ]?m[aá]quina\b/i,                  motivo: "hora-máquina (serviço/locação)" },
];

const UNIDADES_SERVICO = new Set([
  "h", "hora", "horas", "hr", "hrs",
  "mês", "mes", "meses", "mensal",
  "ano", "anos",
  "serv", "vb", "verba",
  "diária", "diaria", "diárias", "diarias",
  "hh", // homem-hora
]);

export function classificarNaturezaItemAlmox(
  descricao: string,
  unidade?: string | null,
): NaturezaItemAlmoxResult {
  const desc = (descricao ?? "").toLowerCase().trim();
  const un = (unidade ?? "").toLowerCase().trim();
  if (!desc) return { material: false, motivo: "descrição vazia" };

  for (const p of PADROES) {
    if (p.rx.test(desc)) return { material: false, motivo: p.motivo };
  }
  if (UNIDADES_SERVICO.has(un)) {
    return { material: false, motivo: `unidade '${un}' é de serviço/tempo` };
  }
  return { material: true, motivo: null };
}
