// Rev. 3823 — Taxonomia canônica de CUSTOS ("literatura") + classificador.
//
// A tela "Análise de Custos" exibia as categorias CRUAS (`conta_nome`), o que
// gerava DUPLICATAS visuais — ex.: "ENCARGOS SOCIAIS - FGTS/INSS" (origem
// `recorrente`) + "ENCARGOS SOCIAIS - FGTS/INSS" (origem manual) + "Encargos
// sobre Folha (Projeção)" + "Encargos 13º (Projeção)" são, todas, ENCARGOS.
//
// Este módulo normaliza cada lançamento (a partir de `contaNome` + `origemModulo`)
// num GRUPO canônico, deduplicando variantes e garantindo que os buckets que a
// literatura de custos manda existam de forma explícita: Salários, Encargos,
// Benefícios, Férias, 13º, Rescisões/Demissões, Pró-labore, Seguro de Vida,
// Impostos/Tributos, Ações & Acordos Trabalhistas, Terceiros/PJ, Material, Frota,
// Aluguéis, Despesas Financeiras e Administrativas.
//
// Determinístico e SEM dados inventados: um grupo só aparece se existir
// lançamento real que caia nele. 100% client-side (sem backend/schema).

export const GRUPOS_CUSTO_ORDEM = [
  "Salários e Folha",
  "Encargos sobre Folha",
  "Benefícios (VR/VA/Transporte)",
  "Férias",
  "13º Salário",
  "Rescisões e Demissões",
  "Pró-labore e Sócios",
  "Seguro de Vida",
  "Impostos e Tributos",
  "Ações e Acordos Trabalhistas",
  "Terceiros e PJ",
  "Material e Almoxarifado",
  "Frota e Veículos",
  "Aluguéis e Equipamentos",
  "Despesas Financeiras",
  "Despesas Administrativas",
  "Outros",
] as const;

export type GrupoCusto = (typeof GRUPOS_CUSTO_ORDEM)[number];

// Remove acentos e caixa pra casar variantes de digitação ("Férias"/"FERIAS").
function norm(s: any): string {
  return String(s ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Sinais FORTES por origem do lançamento (projeções e integrações são
// autoritativas — o nome livre pode estar vago). Tem precedência sobre o nome.
const ORIGEM_GRUPO: Record<string, GrupoCusto> = {
  folha_projetada: "Salários e Folha",
  folha_rh: "Salários e Folha",
  folha_clt: "Salários e Folha",
  folha: "Salários e Folha",
  payroll_agregado: "Salários e Folha",
  fechamento_ponto: "Salários e Folha",
  encargos_projetado: "Encargos sobre Folha",
  ferias_projetada: "Férias",
  decimo_terceiro_projetado: "13º Salário",
  rescisao_projetada: "Rescisões e Demissões",
  seguro_vida: "Seguro de Vida",
  beneficio_vr: "Benefícios (VR/VA/Transporte)",
  beneficio_vr_projetado: "Benefícios (VR/VA/Transporte)",
  beneficio_va: "Benefícios (VR/VA/Transporte)",
  beneficio_va_projetado: "Benefícios (VR/VA/Transporte)",
  guia_tributaria: "Impostos e Tributos",
  pj_projetado: "Terceiros e PJ",
  pagamento_pj: "Terceiros e PJ",
  parceiro_lancamento: "Terceiros e PJ",
  frota_manutencao: "Frota e Veículos",
  frota_abastecimento: "Frota e Veículos",
  almoxarifado_saida: "Material e Almoxarifado",
  compra_oc: "Material e Almoxarifado",
  compras: "Material e Almoxarifado",
};

/**
 * Classifica um lançamento de despesa num grupo de custo canônico.
 * A ordem das checagens de palavra-chave é por PRECEDÊNCIA (mais específico
 * primeiro), pra evitar que "VALE ADIANTAMENTO" caia em Benefícios ou que
 * "MÃO DE OBRA TERCERIZADA" caia em Salários.
 *
 * Rev. 3823 — adicionados keywords faltantes que jogavam tudo em "Outros":
 *   FOLHA → Salários; PRESTADORES PJ → Terceiros; TRANSPORTE DE EQUIPE → Benefícios;
 *   CHEQUE ESPECIAL/MUTUO → Desp.Financeiras; CARTORIO/ALOJAMENTO/HOSPEDAGEM/
 *   HOTEL/TREINAMENTO/CURSO/COMISSAO/REEMBOLSO/OUTRAS DESPESAS → Desp.Administrativas.
 */
export function classificarGrupoCusto(contaNome: any, origemModulo?: any): GrupoCusto {
  const om = String(origemModulo ?? "").toLowerCase().trim();
  if (om && ORIGEM_GRUPO[om]) return ORIGEM_GRUPO[om];

  const n = norm(contaNome);
  if (!n) return "Outros";

  const has = (...keys: string[]) => keys.some((k) => n.includes(k));

  if (has("SEGURO DE VIDA")) return "Seguro de Vida";
  if (has("RESCIS", "DEMISS")) return "Rescisões e Demissões";
  if (has("FERIAS")) return "Férias";
  if (has("DECIMO TERCEIRO") || /(^|[^0-9])13(?:[^0-9]|$)/.test(n)) return "13º Salário";
  if (has("ENCARGO", "FGTS", "INSS", "SEGURANCA DO TRABALHO", "SEGURANÇA DO TRABALHO")) return "Encargos sobre Folha";
  if (
    has("ACAO TRABALHISTA", "RECLAMATORIA", "RECLAMATORIO", "TRABALHISTA", "JURIDIC", "PENSAO ALIMENTICIA", "SINDIC", "DISSIDIO") ||
    has("ACORDO TRABALHISTA", "ACORDO JUDICIAL", "ACORDO DE RESCISAO", "ACORDO COLETIVO")
  )
    return "Ações e Acordos Trabalhistas";
  if (has("TRIBUTO", "IMPOSTO", "DARF", "DAS SIMPLES", "COFINS", "ICMS", "IRRF", "IPVA", "IPTU", "SIMPLES NACIONAL") || /\bISS\b/.test(n) || /\bPIS\b/.test(n))
    return "Impostos e Tributos";
  if (has("PRO LABORE", "PRO-LABORE", "RETIRADA SOCIO", "RETIRADA DE SOCIO", "RETIRADA SOCIOS", "SOCIOS"))
    return "Pró-labore e Sócios";
  // Rev. 3823 — TRANSPORTE DE EQUIPES antes do check geral de benefícios
  if (has("TRANSPORTE DE EQUIPE", "TRANSPORTE DE PESSOAL", "TRANSPORTE DE FUNCIONARIO"))
    return "Benefícios (VR/VA/Transporte)";
  if (has("VALE ALIMENTACAO", "VALE REFEICAO", "VALE-ALIMENTACAO", "VALE-REFEICAO", "VALE TRANSPORTE", "VALE-TRANSPORTE", "BENEFICIO", "PLANO MEDICO", "PLANO DE SAUDE", "ALIMENTACAO", "EXAMES OCUPACIONAIS"))
    return "Benefícios (VR/VA/Transporte)";
  // Rev. 3824 — MEDIÇÃO PJ e PRESTADORES PJ antes do check geral de terceiros
  if (has("PRESTADORES PJ", "PRESTADOR PJ", "MEDIÇÃO PJ", "MEDICAO PJ", "SUBEMPREITEIROS"))
    return "Terceiros e PJ";
  if (has("TERCERIZAD", "TERCEIRIZAD", "SUBEMPREITEIRO", "SERVICOS PJ", "PRESTACAO DE SERVICO", "SERVICOS DE TERCEIROS", "SERVICO DE TERCEIRO"))
    return "Terceiros e PJ";
  // Rev. 3823 — FOLHA antes do check de MAO DE OBRA (banco envia conta_nome = FOLHA DE PAGAMENTO sem origem)
  if (has("FOLHA", "SALARIO", "MAO DE OBRA", "ADIANTAMENTO"))
    return "Salários e Folha";
  if (has("VEICULO", "COMBUSTIVEL", "FROTA", "LOCACAO DE VEICULOS"))
    return "Frota e Veículos";
  if (has("MATERIAL", "MATERIAIS", "CONCRETO", "EPI", "UNIFORME", "FERRAMENTA", "COMPRA", "AQUISICAO", "FRETE", "RETIRADA DE ENTULHO", "ALMOXARIFADO"))
    return "Material e Almoxarifado";
  if (has("ALUGUEL", "LOCACAO"))
    return "Aluguéis e Equipamentos";
  // Rev. 3823 — CHEQUE ESPECIAL e MUTUO antes do check geral financeiro
  if (has("CHEQUE ESPECIAL", "MUTUO", "CONSORTIO", "CONSORCIOS", "TITULOS DE CAPITALIZACAO"))
    return "Despesas Financeiras";
  if (has("BANCARIA", "JUROS", "MORA", "FINANCIAMENTO", "EMPRESTIMO", "CARTAO", "CONSIGNADO", "APLICAC", "TARIFA", "TAXAS OPERACIONAIS", "CAPITALIZACAO", "FINANCEIRA"))
    return "Despesas Financeiras";
  // Rev. 3823 — keywords administrativos ampliados
  if (has(
    "CONTABILIDADE", "SOFTWARE", "MARKETING", "INTERNET", "AGUA", "ENERGIA",
    "CELULAR", "TELEFON", "LIMPEZA", "MONITORAMENTO", "VIAGEN", "DESLOCAMENTO",
    "ESCRITORIO", "SEGURANCA", "CORREIO", "SISTEMA DE PONTO", "DESPESA COM SOFTWARE",
    " TI", "DESPESAS VARIAVEIS", "MATERIAL DE LIMPEZA",
    // Rev. 3823 — novos
    "CARTORIO", "ALOJAMENTO", "HOSPEDAGEM", "HOTEL", "TREINAMENTO", "CURSO",
    "COMISSAO", "COMISSOES", "REEMBOLSO", "OUTRAS DESPESAS", "TOPOGRAFIA",
    "HONORARIO", "SERVICO DE CARTORIO", "SERVICOS DE CARTORIO",
  ))
    return "Despesas Administrativas";

  return "Outros";
}
