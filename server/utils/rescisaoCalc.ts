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
