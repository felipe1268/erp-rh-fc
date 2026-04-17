/**
 * Utilitários de cálculo CLT — Rescisão Trabalhista
 *
 * Extraído para módulo compartilhado para permitir uso no startup (ColFix retroativo)
 * sem criar dependência circular com o router.
 *
 * Regras seguidas: CLT + Lei 12.506/2011
 */

import { parseBRL } from "./parseBRL";

export { parseBRL };

// ============================================================================
// Tabelas progressivas (espelhadas de payrollEngine.ts) — INSS e IRRF 2026
// ============================================================================

/** Calcula INSS pela tabela progressiva (Lei 8.212/91). Usado em rescisão para
 * cada verba com incidência separada (saldo de salário, 13º proporcional). */
export function calcularINSSProgressivo(baseMensal: number): number {
  if (baseMensal <= 0) return 0;
  const faixas = [
    { teto: 1621.0, aliquota: 0.075 },
    { teto: 2902.84, aliquota: 0.09 },
    { teto: 4354.0, aliquota: 0.12 },
    { teto: 8475.55, aliquota: 0.14 },
  ];
  let inss = 0;
  let anterior = 0;
  for (const f of faixas) {
    if (baseMensal <= anterior) break;
    const base = Math.min(baseMensal, f.teto) - anterior;
    inss += base * f.aliquota;
    anterior = f.teto;
  }
  return inss;
}

export const VALOR_DEPENDENTE_IR = 228.8;

/** Calcula IRRF pela tabela progressiva (Lei 11.482/07 + IN 2.141/23).
 * `semReducao=true` para incidência exclusiva (13º) — não aplica redutor simplificado. */
export function calcularIRRFProgressivo(
  baseIR: number,
  salarioBrutoMensal: number,
  semReducao = false,
): number {
  if (baseIR <= 0) return 0;
  const faixas = [
    { limite: 2428.8, aliquota: 0, deducao: 0 },
    { limite: 2826.65, aliquota: 0.075, deducao: 182.16 },
    { limite: 3751.05, aliquota: 0.15, deducao: 394.16 },
    { limite: 4664.68, aliquota: 0.225, deducao: 675.49 },
    { limite: Infinity, aliquota: 0.275, deducao: 908.73 },
  ];
  let irrfBruto = 0;
  for (const f of faixas) {
    if (baseIR <= f.limite) {
      irrfBruto = Math.max(0, baseIR * f.aliquota - f.deducao);
      break;
    }
  }
  if (irrfBruto <= 0) return 0;
  if (semReducao) return irrfBruto;
  let redutor = 0;
  if (salarioBrutoMensal <= 5000) {
    redutor = irrfBruto;
  } else if (salarioBrutoMensal <= 7350) {
    redutor = Math.max(0, 978.62 - 0.133145 * salarioBrutoMensal);
  }
  return Math.max(0, irrfBruto - redutor);
}

// ============================================================================
// Descontos da rescisão — orquestração
// ============================================================================

export interface DescontosRescisaoContext {
  numDependentes?: number;
  pensaoConfig?: {
    ativa: boolean;
    tipo?: "valor_fixo" | "percentual";
    valor?: number;
    percentual?: number;
    base?: "salario_minimo" | "bruto";
  } | null;
  salarioMinimo?: number;
  /** Contribuição sindical mensal cadastrada para o empregado. */
  contribuicaoSindical?: number;
  /** Soma de descontos por faltas + atrasos no mês corrente (já apurada do banco). */
  faltasAtrasosValor?: number;
  /** Soma de convênios aprovados no mês corrente. */
  conveniosValor?: number;
  /** Soma de EPIs com alerta aprovado no mês. */
  episValor?: number;
  /** Vales/adiantamentos já lançados no mês. */
  valesValor?: number;
  /** Outros descontos avulsos aprovados pelo RH. */
  outrosDescontosValor?: number;
}

export interface DescontosRescisaoResult {
  descontoINSS: string;
  descontoINSSSaldo: string;
  descontoINSS13: string;
  descontoIRRF: string;
  descontoIRRFSaldo: string;
  descontoIRRF13: string;
  descontoPensao: string;
  descontoSindical: string;
  descontoFaltasAtrasos: string;
  descontoConvenios: string;
  descontoEpis: string;
  descontoVales: string;
  descontoOutros: string;
  totalDescontos: string;
  totalLiquido: string;
}

/** Computa o bloco de descontos legais e descontos da folha incidentes na rescisão.
 *
 * Regras de incidência (CLT + Lei 8.212 + Lei 7.713):
 * - INSS: incide sobre saldo de salário e 13º proporcional (bases separadas).
 *   Férias indenizadas (proporcionais e vencidas), 1/3, aviso prévio indenizado e multa FGTS são ISENTOS.
 * - IRRF: incide sobre saldo de salário e 13º proporcional (incidência exclusiva sem redutor).
 *   Férias indenizadas e aviso prévio indenizado são ISENTOS (Lei 7.713/88 + STJ Súm. 386).
 * - Pensão alimentícia: cadastro do empregado (valor fixo OU percentual sobre base configurada).
 * - Demais descontos (sindical, faltas, atrasos, convênios, EPI, vales, outros) são repassados
 *   diretamente do banco — o contexto deve trazê-los já apurados do mês de competência da rescisão.
 */
export function calcularDescontosRescisao(
  rescisao: { saldoSalario: string; decimoTerceiroProporcional: string; total: string; descontoAvisoNaoCumprido: string },
  ctx: DescontosRescisaoContext,
): DescontosRescisaoResult {
  const saldo = parseFloat(rescisao.saldoSalario || "0");
  const decimoTerceiro = parseFloat(rescisao.decimoTerceiroProporcional || "0");

  const numDependentes = Math.max(0, ctx.numDependentes || 0);
  const baseDep = numDependentes * VALOR_DEPENDENTE_IR;

  // INSS — bases independentes
  const inssSaldo = calcularINSSProgressivo(saldo);
  const inss13 = calcularINSSProgressivo(decimoTerceiro);

  // IRRF — bases independentes; 13º com incidência exclusiva (semReducao)
  const baseIRSaldo = Math.max(0, saldo - inssSaldo - baseDep);
  const irrfSaldo = calcularIRRFProgressivo(baseIRSaldo, saldo);
  const baseIR13 = Math.max(0, decimoTerceiro - inss13 - baseDep);
  const irrf13 = calcularIRRFProgressivo(baseIR13, decimoTerceiro, true);

  // Pensão alimentícia
  let pensao = 0;
  const pConf = ctx.pensaoConfig;
  if (pConf?.ativa) {
    if (pConf.tipo === "valor_fixo") {
      pensao = pConf.valor || 0;
    } else if (pConf.tipo === "percentual") {
      // base="bruto": saldo + 13º (verbas tributáveis brutas)
      // base="salario_minimo": SM vigente
      const baseBruta = saldo + decimoTerceiro;
      const base = pConf.base === "salario_minimo" ? (ctx.salarioMinimo || 0) : Math.max(0, baseBruta);
      pensao = base * ((pConf.percentual || 0) / 100);
    }
  }

  const sindical = Math.max(0, ctx.contribuicaoSindical || 0);
  const faltas = Math.max(0, ctx.faltasAtrasosValor || 0);
  const convenios = Math.max(0, ctx.conveniosValor || 0);
  const epis = Math.max(0, ctx.episValor || 0);
  const vales = Math.max(0, ctx.valesValor || 0);
  const outros = Math.max(0, ctx.outrosDescontosValor || 0);

  const inssTotal = inssSaldo + inss13;
  const irrfTotal = irrfSaldo + irrf13;
  const totalDescontos = inssTotal + irrfTotal + pensao + sindical + faltas + convenios + epis + vales + outros;

  // O `rescisao.total` já vem com `descontoAvisoNaoCumprido` subtraído. Então o líquido é:
  const totalLiquido = parseFloat(rescisao.total || "0") - totalDescontos;

  return {
    descontoINSS: inssTotal.toFixed(2),
    descontoINSSSaldo: inssSaldo.toFixed(2),
    descontoINSS13: inss13.toFixed(2),
    descontoIRRF: irrfTotal.toFixed(2),
    descontoIRRFSaldo: irrfSaldo.toFixed(2),
    descontoIRRF13: irrf13.toFixed(2),
    descontoPensao: pensao.toFixed(2),
    descontoSindical: sindical.toFixed(2),
    descontoFaltasAtrasos: faltas.toFixed(2),
    descontoConvenios: convenios.toFixed(2),
    descontoEpis: epis.toFixed(2),
    descontoVales: vales.toFixed(2),
    descontoOutros: outros.toFixed(2),
    totalDescontos: totalDescontos.toFixed(2),
    totalLiquido: totalLiquido.toFixed(2),
  };
}

/** Calcula anos completos de serviço entre admissão e data de referência */
export function calcularAnosServico(dataAdmissao: string, dataRef?: string): number {
  const admissao = new Date(dataAdmissao + 'T00:00:00');
  const ref = dataRef ? new Date(dataRef + 'T00:00:00') : new Date();
  let anos = ref.getFullYear() - admissao.getFullYear();
  const mesRef = ref.getMonth();
  const mesAdm = admissao.getMonth();
  if (mesRef < mesAdm || (mesRef === mesAdm && ref.getDate() < admissao.getDate())) {
    anos--;
  }
  return Math.max(0, anos);
}

/** Calcula meses completos de serviço (para férias proporcionais) */
export function calcularMesesServico(dataAdmissao: string, dataRef?: string): number {
  const admissao = new Date(dataAdmissao + 'T00:00:00');
  const ref = dataRef ? new Date(dataRef + 'T00:00:00') : new Date();
  let meses = (ref.getFullYear() - admissao.getFullYear()) * 12 + (ref.getMonth() - admissao.getMonth());
  if (ref.getDate() < admissao.getDate()) {
    meses--;
  }
  return Math.max(0, meses);
}

/** Calcula meses trabalhados no ano corrente (para 13º proporcional) */
export function calcularMeses13o(dataAdmissao: string, dataDesligamento: string): number {
  const admissao = new Date(dataAdmissao + 'T00:00:00');
  const deslig = new Date(dataDesligamento + 'T00:00:00');
  const anoDeslig = deslig.getFullYear();

  const mesInicio = admissao.getFullYear() === anoDeslig ? admissao.getMonth() : 0;
  const mesFim = deslig.getMonth();

  let meses = mesFim - mesInicio + 1;

  if (admissao.getFullYear() === anoDeslig && admissao.getMonth() === mesInicio) {
    const diasNoMesAdmissao = new Date(anoDeslig, mesInicio + 1, 0).getDate() - admissao.getDate() + 1;
    if (diasNoMesAdmissao < 15) meses--;
  }

  if (deslig.getDate() < 15) meses--;

  return Math.max(0, Math.min(12, meses));
}

/** Calcula dias TOTAIS de aviso prévio proporcional (Art. 1º Lei 12.506/2011) */
export function calcularDiasAvisoTotal(anosServico: number): number {
  return Math.min(30 + (anosServico * 3), 90);
}

/** Calcula dias de aviso prévio conforme o tipo */
export function calcularDiasAviso(anosServico: number, tipo?: string): number {
  if (tipo === 'empregado_indenizado') return 0;
  if (tipo && tipo.includes('trabalhado')) return 30;
  if (tipo && tipo.startsWith('empregado_')) return 30;
  return calcularDiasAvisoTotal(anosServico);
}

/** Calcula dias extras do aviso prévio (Lei 12.506 — apenas os 3 dias por ano) */
export function calcularDiasExtrasAviso(anosServico: number): number {
  return Math.min(anosServico * 3, 60);
}

/** Calcula data fim do aviso prévio (dia de início conta como dia 1) */
export function calcularDataFim(dataInicio: string, diasAviso: number): string {
  const dt = new Date(dataInicio + 'T00:00:00');
  dt.setDate(dt.getDate() + diasAviso - 1);
  return dt.toISOString().split("T")[0];
}

/** Calcula data de início do aviso = último dia trabalhado + 1 dia */
export function calcularDataInicioAviso(ultimoDiaTrabalhado: string): string {
  const dt = new Date(ultimoDiaTrabalhado + 'T00:00:00');
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString().split("T")[0];
}

/** Calcula meses de férias proporcionais (desde início do período aquisitivo atual) */
export function calcularMesesFeriasProporcionais(dataAdmissao: string, dataDesligamento: string): number {
  const mesesTotais = calcularMesesServico(dataAdmissao, dataDesligamento);
  const mesesProporcionais = mesesTotais % 12;
  return mesesProporcionais === 0 && mesesTotais > 0 ? 12 : mesesProporcionais;
}

/** Calcula períodos de férias vencidas matematicamente (estimativa — prefira consulta ao banco) */
export function calcularFeriasVencidas(dataAdmissao: string, dataDesligamento: string): number {
  const mesesTotais = calcularMesesServico(dataAdmissao, dataDesligamento);
  return Math.floor(mesesTotais / 12);
}

/**
 * CÁLCULO COMPLETO DE RESCISÃO — CLT
 *
 * REGRA CRÍTICA (BUG-001 — Rev. 716):
 * Sempre passar `periodosVencidosOverride` com contagem real do banco (vacation_periods),
 * filtrando status NOT IN ('concluida','cancelada','em_gozo') com periodoConcessivoFim < dataFimAviso.
 * Nunca usar o cálculo matemático puro para determinar férias vencidas na rescisão.
 */
export function calcularRescisaoCompleta(params: {
  salarioBase: number;
  dataAdmissao: string;
  dataDesligamento: string;
  dataFimAviso?: string;
  tipo: string;
  vrDiario: number;
  diasTrabalhadosMes: number;
  periodosVencidosOverride?: number;
  mediaInsalubridade?: number;
  mediaHorasExtras?: number;
  /** Art. 487 §2º — quando empregado pede demissão e NÃO cumpre o aviso, o
   * empregador pode descontar do acerto o valor de até 30 dias de salário.
   * Se true, aplica o desconto. Default: false (empresa abre mão do desconto). */
  descontarAvisoNaoCumprido?: boolean;
}) {
  const { salarioBase, dataAdmissao, dataDesligamento, tipo, vrDiario, diasTrabalhadosMes } = params;
  const descontarAvisoNaoCumprido = !!params.descontarAvisoNaoCumprido;
  const mediaInsalubridade = params.mediaInsalubridade || 0;
  const mediaHorasExtras = params.mediaHorasExtras || 0;
  const totalMediasAdicionais = mediaInsalubridade + mediaHorasExtras;

  const dataFimAviso = params.dataFimAviso || dataDesligamento;
  const dtFimAviso = new Date(dataFimAviso + 'T00:00:00');

  const dataSaida = dataFimAviso;

  const dtProjecao = new Date(dtFimAviso.getFullYear(), dtFimAviso.getMonth() + 1, 0);
  const dataProjecao = dtProjecao.toISOString().split('T')[0];

  const DIVISOR_CLT = 30;
  const salarioDia = salarioBase / DIVISOR_CLT;
  const anosServico = calcularAnosServico(dataAdmissao, dataSaida);
  const diasAvisoTotal = calcularDiasAvisoTotal(anosServico);
  const diasExtrasAviso = calcularDiasExtrasAviso(anosServico);

  // 1. Saldo de salário
  const saldoSalario = salarioDia * diasTrabalhadosMes;

  // 2. Férias proporcionais + 1/3 constitucional
  // CLT: médias de adicionais habituais (insalubridade, HE) integram a base de férias e 13º
  const baseFerias13 = salarioBase + totalMediasAdicionais;
  const mesesFerias = calcularMesesFeriasProporcionais(dataAdmissao, dataProjecao);
  const feriasProporcional = (baseFerias13 * mesesFerias) / 12;
  const tercoConstitucional = feriasProporcional / 3;
  const totalFerias = feriasProporcional + tercoConstitucional;

  // 3. Férias vencidas — usa contagem real do banco (BUG-001)
  const periodosVencidos = params.periodosVencidosOverride !== undefined
    ? params.periodosVencidosOverride
    : Math.max(0, calcularFeriasVencidas(dataAdmissao, dataProjecao) - 1);
  const feriasVencidas = periodosVencidos > 0 ? (baseFerias13 + baseFerias13 / 3) * periodosVencidos : 0;

  // 4. 13º proporcional — usa data real (não projeção fim-de-mês) para regra dos 15 dias
  const meses13o = calcularMeses13o(dataAdmissao, dataFimAviso);
  const decimoTerceiroProporcional = (baseFerias13 * meses13o) / 12;

  // 5. Aviso prévio indenizado
  let avisoPrevioIndenizado = 0;
  if (tipo === 'empregador_indenizado') {
    avisoPrevioIndenizado = salarioDia * diasAvisoTotal;
  } else if (tipo === 'empregador_trabalhado') {
    avisoPrevioIndenizado = salarioDia * diasExtrasAviso;
  }

  // 6. VR proporcional
  const vrProporcional = vrDiario * diasTrabalhadosMes;

  // 7. FGTS estimado
  const mesesTotais = calcularMesesServico(dataAdmissao, dataProjecao);
  const fgtsEstimado = salarioBase * 0.08 * mesesTotais;

  // 8. Multa 40% FGTS
  const multaFGTS = tipo.includes('empregador') ? fgtsEstimado * 0.4 : 0;

  // 9. Desconto Art. 487 §2º CLT — empregado pediu demissão e não cumpriu o aviso.
  // Empregador pode descontar do acerto o valor do aviso não cumprido (1 salário cheio).
  // Aplicado apenas se a empresa optar (descontarAvisoNaoCumprido=true) e tipo='empregado_indenizado'.
  const podeDescontarAviso = tipo === 'empregado_indenizado' && descontarAvisoNaoCumprido;
  const descontoAvisoNaoCumprido = podeDescontarAviso ? salarioBase : 0;

  const total = saldoSalario + totalFerias + feriasVencidas + decimoTerceiroProporcional + avisoPrevioIndenizado + vrProporcional + multaFGTS - descontoAvisoNaoCumprido;

  return {
    salarioBase: salarioBase.toFixed(2),
    salarioDia: salarioDia.toFixed(2),
    diasReaisMes: DIVISOR_CLT,
    anosServico,
    diasAvisoTotal,
    diasExtrasAviso,
    diasTrabalhadosMes,
    mesesFerias,
    meses13o,
    dataSaida,
    saldoSalario: saldoSalario.toFixed(2),
    feriasProporcional: feriasProporcional.toFixed(2),
    tercoConstitucional: tercoConstitucional.toFixed(2),
    totalFerias: totalFerias.toFixed(2),
    feriasVencidas: feriasVencidas.toFixed(2),
    periodosVencidos,
    decimoTerceiroProporcional: decimoTerceiroProporcional.toFixed(2),
    avisoPrevioIndenizado: avisoPrevioIndenizado.toFixed(2),
    vrProporcional: vrProporcional.toFixed(2),
    vrDiario: vrDiario.toFixed(2),
    fgtsEstimado: fgtsEstimado.toFixed(2),
    multaFGTS: multaFGTS.toFixed(2),
    descontoAvisoNaoCumprido: descontoAvisoNaoCumprido.toFixed(2),
    descontarAvisoNaoCumprido: podeDescontarAviso,
    total: total.toFixed(2),
    mesesTotais,
    dataRefCalculo: dataSaida,
    dataProjecao,
    mediaInsalubridade: mediaInsalubridade.toFixed(2),
    mediaHorasExtras: mediaHorasExtras.toFixed(2),
    baseFerias13: baseFerias13.toFixed(2),
    dataLimitePagamento: (() => {
      const dt = new Date(dataFimAviso + 'T00:00:00');
      dt.setDate(dt.getDate() + 10);
      return dt.toISOString().split("T")[0];
    })(),
  };
}
