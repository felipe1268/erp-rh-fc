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

/** Calcula dias de aviso prévio CUMPRIDOS (período de trabalho efetivo).
 * Rev. 2423 — Reverte parcialmente Rev. 1965/1943: para QUALQUER modalidade
 * "trabalhada", o cumprimento físico é SEMPRE 30 dias (CLT Art. 487 caput +
 * Art. 488). Os +3d/ano da Lei 12.506/2011 NÃO viram obrigação de trabalhar
 * 36/60/90 dias — eles contam apenas como VERBA INDENIZATÓRIA COMPLEMENTAR
 * paga junto à rescisão (já tratada por `calcularRescisaoCompleta`, que para
 * tipo='empregador_trabalhado' calcula avisoIndenizado = salarioDia × diasExtras).
 * O TOTAL financeiro (30 + 3·ano) segue íntegro via `calcularDiasAvisoTotal`,
 * mas a DURAÇÃO do período cumprido fica em 30 fixos. Para INDENIZADO, idem
 * convenção CLT — empregado não cumpre nenhum dia, só recebe os 30+3·ano em
 * dinheiro. Pedido FC Engenharia 25/05/2026 (caso Myriélle: 2 anos exibiam
 * 36 dias de cumprimento — incorreto). */
export function calcularDiasAviso(anosServico: number, tipo?: string): number {
  if (tipo === 'empregado_indenizado') return 0;
  // Toda modalidade "trabalhada" (empregador OU empregado) cumpre 30 dias fixos.
  if (tipo && tipo.endsWith('_trabalhado')) return 30;
  // Indenizado pelo empregador: período NOMINAL (usado por dataFimAviso e
  // pelo cálculo de verbas proporcionais) é o total proporcional 30+3·ano.
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

/** Calcula meses de férias proporcionais (desde início do período aquisitivo atual).
 *
 * CLT Art. 146 §único: a fração ≥ 15 dias (superior a 14) do mês aquisitivo
 * corrente conta como mês INTEIRO de avo — a MESMA regra já aplicada ao 13º em
 * `calcularMeses13o`. Antes desta correção a função só contava MESES COMPLETOS
 * (`calcularMesesServico`), perdendo o último mês incompleto mesmo quando tinha
 * ≥15 dias. Caso real (Myriélle, adm. 07/05/2024 → projeção 30/06/2026):
 * 25 meses % 12 = 1 mês cheio + fração de 24 dias (07/06→30/06) ≥15 → 2/12
 * (antes exibia 1/12, subdimensionando férias + 1/3). */
export function calcularMesesFeriasProporcionais(dataAdmissao: string, dataDesligamento: string): number {
  const admissao = new Date(dataAdmissao + 'T00:00:00');
  const ref = new Date(dataDesligamento + 'T00:00:00');
  const mesesTotais = calcularMesesServico(dataAdmissao, dataDesligamento);
  const mesesProporcionais = mesesTotais % 12;
  // Período aquisitivo corrente JÁ COMPLETO (múltiplo exato de 12): este modelo de
  // rescisão paga o último período inteiro como PROPORCIONAL (12/12) e só conta os
  // anteriores como vencidas (`periodosVencidos = floor(meses/12) - 1`). A fração
  // residual do período seguinte NÃO acrescenta avo aqui (cap em 12).
  if (mesesProporcionais === 0 && mesesTotais > 0) return 12;
  // Período corrente INCOMPLETO: aplica a regra dos 15 dias (CLT Art. 146 §único) —
  // fração final (início do mês aquisitivo corrente = admissão + mesesTotais → data
  // ref) ≥ 15 dias soma +1 avo, igual ao 13º (`calcularMeses13o`).
  const inicioFracao = new Date(admissao.getFullYear(), admissao.getMonth() + mesesTotais, admissao.getDate());
  const diasFracao = Math.floor((ref.getTime() - inicioFracao.getTime()) / 86400000) + 1;
  const comFracao = diasFracao >= 15 ? mesesProporcionais + 1 : mesesProporcionais;
  return comFracao >= 12 ? 12 : comFracao;
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
  /** SALDO de dias de férias vencidas (30 − dias gozados − abono) somado de TODOS
   * os períodos aquisitivos COMPLETOS ainda não quitados. Quando informado, as
   * férias vencidas são pagas por DIA `(base/30)×dias`, refletindo gozos PARCIAIS
   * (ex.: período concluído com só 5 de 30 dias → saldo 25). Sem ele, cai no modelo
   * antigo de períodos INTEIROS (`periodosVencidos × 30`). */
  diasVencidosOverride?: number;
  mediaInsalubridade?: number;
  mediaHorasExtras?: number;
  /** Art. 487 §2º — quando empregado pede demissão e NÃO cumpre o aviso, o
   * empregador pode descontar do acerto o valor de até 30 dias de salário.
   * Se true, aplica o desconto. Default: false (empresa abre mão do desconto). */
  descontarAvisoNaoCumprido?: boolean;
  /** Rev. 3036 — Liga/desliga a Multa de 40% do FGTS (critério por empresa
   * "rescisao_aplicar_multa_fgts"). Default true = comportamento CLT padrão.
   * Quando false, a multa 40% é ZERADA (empresas que não pagam a multa). */
  incluirMultaFgts?: boolean;
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
  // SALDO de dias: quando o caller informa `diasVencidosOverride`, paga-se POR DIA
  // `(base/30)×dias` — refletindo gozos PARCIAIS (período concluído com só 5 de 30
  // dias deixa 25 dias em aberto). Sem o override de dias, mantém o modelo antigo de
  // períodos INTEIROS (`periodosVencidos × 30`), o que equivale a `(base/30)×(periodos×30)`.
  const diasVencidos = params.diasVencidosOverride !== undefined
    ? params.diasVencidosOverride
    : periodosVencidos * 30;
  const feriasVencidasBase = diasVencidos > 0 ? (baseFerias13 / 30) * diasVencidos : 0;
  const feriasVencidasTerco = feriasVencidasBase / 3;
  const feriasVencidas = feriasVencidasBase + feriasVencidasTerco;

  // 4. 13º proporcional — usa data real (não projeção fim-de-mês) para regra dos 15 dias
  const meses13o = calcularMeses13o(dataAdmissao, dataFimAviso);
  const decimoTerceiroProporcional = (baseFerias13 * meses13o) / 12;

  // 4b. SEPARAÇÃO GERENCIAL — incremento de férias/13º decorrente da PROJEÇÃO do aviso.
  // O que a projeção do aviso prévio adiciona (Súmula 371 / OJ 82 TST projeta o término do
  // contrato) é custo exclusivo da dispensa — no painel RH entra no "Grupo B" (custo adicional
  // da demissão), não na provisão (Grupo A). O baseline ("o que já era competência") depende
  // da MODALIDADE do aviso:
  //   • INDENIZADO → baseline = INÍCIO do aviso (`dataDesligamento`). Nenhum dia é trabalhado;
  //     TODO o período do aviso é projeção indenizada → vai pro Grupo B.
  //   • TRABALHADO → baseline = FIM do aviso trabalhado (`dataFimAviso`). Os dias efetivamente
  //     TRABALHADOS são competência REAL (Grupo A) e os avos ganhos nesse período NÃO são custo
  //     da demissão; só a projeção dos dias proporcionais INDENIZADOS (do fim do aviso até a
  //     projeção fim-de-mês) é custo adicional (Grupo B). Sem isso, avos ganhos trabalhando
  //     eram indevidamente jogados no Grupo B (caso Myriélle: incremento caía p/ 0).
  // Usa a contagem CRUA de avos do período aquisitivo corrente (sem o atalho "ano completo →
  // 12/12" de `calcularMesesFeriasProporcionais`), pois aqui interessa quantos avos a JANELA
  // da projeção acrescentou, não o tratamento de período inteiro como proporcional.
  const baselineProvisao = tipo.includes('trabalhado') ? dataFimAviso : dataDesligamento;
  const avosPeriodoCorrente = (adm: string, ref: string): number => {
    const m = calcularMesesServico(adm, ref);
    const a = new Date(adm + 'T00:00:00');
    const r = new Date(ref + 'T00:00:00');
    const ini = new Date(a.getFullYear(), a.getMonth() + m, a.getDate());
    const dias = Math.floor((r.getTime() - ini.getTime()) / 86400000) + 1;
    return Math.min(12, Math.max(0, (m % 12) + (dias >= 15 ? 1 : 0)));
  };
  const incAvosFerias = Math.max(0, avosPeriodoCorrente(dataAdmissao, dataProjecao) - avosPeriodoCorrente(dataAdmissao, baselineProvisao));
  const incAvos13 = Math.max(0, meses13o - calcularMeses13o(dataAdmissao, baselineProvisao));
  // Clamp ao valor exibido para garantir que o "Grupo A" (exibido − projeção) nunca fique negativo.
  const feriasProporcionalProjecao = Math.min(feriasProporcional, (baseFerias13 * incAvosFerias) / 12);
  const tercoConstitucionalProjecao = feriasProporcionalProjecao / 3;
  const decimoTerceiroProjecao = Math.min(decimoTerceiroProporcional, (baseFerias13 * incAvos13) / 12);

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

  // 8. Multa 40% FGTS (Rev. 3036 — gated pelo critério "rescisao_aplicar_multa_fgts",
  // default ON. Quando o critério está desligado p/ a empresa, a multa é zerada.)
  const incluirMultaFgts = params.incluirMultaFgts !== false;
  const multaFGTS = (incluirMultaFgts && tipo.includes('empregador')) ? fgtsEstimado * 0.4 : 0;

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
    feriasVencidasBase: feriasVencidasBase.toFixed(2),
    feriasVencidasTerco: feriasVencidasTerco.toFixed(2),
    periodosVencidos,
    diasVencidos,
    decimoTerceiroProporcional: decimoTerceiroProporcional.toFixed(2),
    incAvosFeriasProjecao: incAvosFerias,
    incAvos13Projecao: incAvos13,
    feriasProporcionalProjecao: feriasProporcionalProjecao.toFixed(2),
    tercoConstitucionalProjecao: tercoConstitucionalProjecao.toFixed(2),
    decimoTerceiroProjecao: decimoTerceiroProjecao.toFixed(2),
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

/**
 * RESCISÃO COMPLEMENTAR (uso interno, "por fora")
 *
 * Quando o funcionário recebe complemento salarial não-registrado, esta função
 * calcula uma previsão paralela usando APENAS o valor do complemento como base.
 * Não substitui a rescisão oficial — é um espelho para a empresa quitar o "extra".
 *
 * Diferenças vs. calcularRescisaoCompleta:
 * - Base = somente o valor do complemento (ex.: R$ 1.230,00), NÃO a soma com salário base.
 * - Não calcula FGTS nem multa 40% (não há recolhimento sobre o por-fora).
 * - Não inclui VR (já contemplado na rescisão oficial).
 * - Não soma médias de adicionais (insalubridade/HE).
 * - Mantém os mesmos critérios de tempo (meses, dias, períodos vencidos) da oficial.
 */
export function calcularRescisaoComplementar(params: {
  valorComplemento: number;
  dataAdmissao: string;
  dataDesligamento: string;
  dataFimAviso?: string;
  tipo: string;
  diasTrabalhadosMes: number;
  periodosVencidosOverride?: number;
  /** Mesmo conceito de `calcularRescisaoCompleta`: saldo de DIAS de férias vencidas. */
  diasVencidosOverride?: number;
}) {
  const { valorComplemento, dataAdmissao, dataDesligamento, tipo, diasTrabalhadosMes } = params;

  if (!valorComplemento || valorComplemento <= 0) return null;

  const dataFimAviso = params.dataFimAviso || dataDesligamento;
  const dtFimAviso = new Date(dataFimAviso + 'T00:00:00');
  const dtProjecao = new Date(dtFimAviso.getFullYear(), dtFimAviso.getMonth() + 1, 0);
  const dataProjecao = dtProjecao.toISOString().split('T')[0];
  const dataSaida = dataFimAviso;

  const DIVISOR_CLT = 30;
  const baseDia = valorComplemento / DIVISOR_CLT;
  const anosServico = calcularAnosServico(dataAdmissao, dataSaida);
  const diasAvisoTotal = calcularDiasAvisoTotal(anosServico);
  const diasExtrasAviso = calcularDiasExtrasAviso(anosServico);

  // 1. Saldo de Salário (proporcional aos dias trabalhados no mês)
  const saldoSalario = baseDia * diasTrabalhadosMes;

  // 2. Férias Proporcionais + 1/3
  const mesesFerias = calcularMesesFeriasProporcionais(dataAdmissao, dataProjecao);
  const feriasProporcional = (valorComplemento * mesesFerias) / 12;
  const tercoConstitucional = feriasProporcional / 3;
  const totalFerias = feriasProporcional + tercoConstitucional;

  // 3. Férias Vencidas + 1/3 (mesmo override do banco usado na oficial)
  const periodosVencidos = params.periodosVencidosOverride !== undefined
    ? params.periodosVencidosOverride
    : Math.max(0, calcularFeriasVencidas(dataAdmissao, dataProjecao) - 1);
  // SALDO de dias (reflete gozos PARCIAIS) — vide calcularRescisaoCompleta.
  const diasVencidos = params.diasVencidosOverride !== undefined
    ? params.diasVencidosOverride
    : periodosVencidos * 30;
  const feriasVencidasBase = diasVencidos > 0 ? (valorComplemento / 30) * diasVencidos : 0;
  const feriasVencidasTerco = feriasVencidasBase / 3;
  const feriasVencidas = feriasVencidasBase + feriasVencidasTerco;

  // 4. 13º Proporcional
  const meses13o = calcularMeses13o(dataAdmissao, dataFimAviso);
  const decimoTerceiroProporcional = (valorComplemento * meses13o) / 12;

  // 5. Aviso Prévio Indenizado (mesmo critério da oficial)
  let avisoPrevioIndenizado = 0;
  if (tipo === 'empregador_indenizado') {
    avisoPrevioIndenizado = baseDia * diasAvisoTotal;
  } else if (tipo === 'empregador_trabalhado') {
    avisoPrevioIndenizado = baseDia * diasExtrasAviso;
  }

  // SEM FGTS, SEM multa 40%, SEM VR, SEM médias.
  const total = saldoSalario + totalFerias + feriasVencidas + decimoTerceiroProporcional + avisoPrevioIndenizado;

  return {
    baseComplemento: valorComplemento.toFixed(2),
    baseDia: baseDia.toFixed(2),
    anosServico,
    diasAvisoTotal,
    diasExtrasAviso,
    diasTrabalhadosMes,
    mesesFerias,
    meses13o,
    periodosVencidos,
    diasVencidos,
    dataSaida,
    saldoSalario: saldoSalario.toFixed(2),
    feriasProporcional: feriasProporcional.toFixed(2),
    tercoConstitucional: tercoConstitucional.toFixed(2),
    totalFerias: totalFerias.toFixed(2),
    feriasVencidas: feriasVencidas.toFixed(2),
    feriasVencidasBase: feriasVencidasBase.toFixed(2),
    feriasVencidasTerco: feriasVencidasTerco.toFixed(2),
    decimoTerceiroProporcional: decimoTerceiroProporcional.toFixed(2),
    avisoPrevioIndenizado: avisoPrevioIndenizado.toFixed(2),
    total: total.toFixed(2),
    dataProjecao,
  };
}

/**
 * INDENIZAÇÃO DO PERÍODO DE ESTABILIDADE — CIPEIRO (Súmula 396 do TST)
 *
 * Quando um empregado com ESTABILIDADE PROVISÓRIA (membro da CIPA eleito pelos
 * empregados — CLT Art. 165 / CF/88 Art. 10, II, "a" do ADCT) é dispensado SEM
 * JUSTA CAUSA e a reintegração não é viável (ex.: período de estabilidade já no
 * fim), o empregador deve INDENIZAR o período de estabilidade restante.
 *
 * A indenização corresponde à REMUNERAÇÃO que o empregado receberia da data do
 * desligamento até o fim da estabilidade (Súmula 396, I, TST), composta por:
 *   • Salários do período restante
 *   • 13º salário proporcional ao período
 *   • Férias proporcionais + 1/3 constitucional ao período
 *   • FGTS (8%) sobre os salários do período
 *
 * Calculada de forma SEPARADA das verbas rescisórias normais (é um custo ADICIONAL
 * e eventual da dispensa de estável), apenas para análise gerencial antes da decisão.
 *
 * Observações:
 *   - `mesesRestantes` é fracionário (dias ÷ 30) para refletir o período exato.
 *   - Só faz sentido em dispensa do EMPREGADOR sem justa causa; em pedido de
 *     demissão / justa causa NÃO há indenização (o chamador deve gatear isso).
 */
export function calcularIndenizacaoEstabilidade(params: {
  salarioBase: number;
  /** Data base (início da contagem) — normalmente a data do aviso / desligamento. */
  dataDesligamento: string;
  /** Data em que termina a estabilidade provisória. */
  fimEstabilidade: string;
}) {
  const { salarioBase, dataDesligamento, fimEstabilidade } = params;
  const dtBase = new Date(dataDesligamento + 'T00:00:00');
  const dtFim = new Date(fimEstabilidade + 'T00:00:00');

  // Estabilidade já vencida (ou datas inválidas) → nada a indenizar.
  if (isNaN(dtBase.getTime()) || isNaN(dtFim.getTime()) || dtFim <= dtBase) {
    return {
      aplicavel: false,
      diasRestantes: 0,
      mesesRestantes: '0.00',
      salariosPeriodo: '0.00',
      decimoTerceiroProporcional: '0.00',
      feriasProporcional: '0.00',
      tercoConstitucional: '0.00',
      totalFerias: '0.00',
      fgtsPeriodo: '0.00',
      total: '0.00',
      dataBase: dataDesligamento,
      fimEstabilidade,
    };
  }

  const diasRestantes = Math.floor((dtFim.getTime() - dtBase.getTime()) / 86400000);
  const mesesRestantes = diasRestantes / 30;

  // 1. Salários do período restante
  const salariosPeriodo = salarioBase * mesesRestantes;

  // 2. 13º proporcional ao período
  const decimoTerceiroProporcional = (salarioBase * mesesRestantes) / 12;

  // 3. Férias proporcionais + 1/3 ao período
  const feriasProporcional = (salarioBase * mesesRestantes) / 12;
  const tercoConstitucional = feriasProporcional / 3;
  const totalFerias = feriasProporcional + tercoConstitucional;

  // 4. FGTS (8%) sobre os salários do período
  const fgtsPeriodo = salariosPeriodo * 0.08;

  const total = salariosPeriodo + decimoTerceiroProporcional + totalFerias + fgtsPeriodo;

  return {
    aplicavel: true,
    diasRestantes,
    mesesRestantes: mesesRestantes.toFixed(2),
    salariosPeriodo: salariosPeriodo.toFixed(2),
    decimoTerceiroProporcional: decimoTerceiroProporcional.toFixed(2),
    feriasProporcional: feriasProporcional.toFixed(2),
    tercoConstitucional: tercoConstitucional.toFixed(2),
    totalFerias: totalFerias.toFixed(2),
    fgtsPeriodo: fgtsPeriodo.toFixed(2),
    total: total.toFixed(2),
    dataBase: dataDesligamento,
    fimEstabilidade,
  };
}

