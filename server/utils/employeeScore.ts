/**
 * Motor de Score de Funcionário — Rev. 1971 (Fase 1 MVP).
 *
 * 4 sub-scores determinísticos (0-100, MAIOR = MELHOR) calculados sobre dados
 * que JÁ existem no ERP. Sem IA, sem ML, sem rede neural. Cada score é uma
 * função pura `(inputs) => número`, fácil de auditar, explicar e ajustar.
 *
 *   • Frequência → faltas + atrasos (tabela `ponto_descontos_resumo`).
 *   • Saúde     → atestados + acidentes (dias afastado).
 *   • Disciplina → advertências formais (tabela `warnings`).
 *   • Segurança → acidentes (gravidade) + presença em DDS.
 *
 * Score Geral = média ponderada (default 25% cada — RH ajusta no futuro).
 *
 * REGRAS DE OURO (LGPD + CLT):
 *   1. NUNCA recomendar desligamento por idade.
 *   2. Decisão sempre humana — o sistema só sinaliza.
 *   3. Todos os pesos e fórmulas estão NESTE arquivo, auditável.
 *   4. Inputs zerados → score neutro 100 (não pune funcionário recém-admitido).
 */

export interface FrequenciaInputs {
  totalFaltasInjustificadas: number;
  totalAtrasos: number;
  totalSaidasAntecipadas: number;
  totalMinutosAtraso: number;
}

export interface SaudeInputs {
  countAtestados: number;
  diasAfastadoAtestado: number;
  countAcidentes: number;
  diasAfastadoAcidente: number;
}

export interface DisciplinaInputs {
  countAdvertenciasLeves: number;
  countAdvertenciasGraves: number;
  countSuspensoes: number;
  diasSuspensao: number;
}

export interface SegurancaInputs {
  countAcidentesLeves: number;
  countAcidentesGraves: number;
  countAcidentesQuase: number;
  ddsConvocados: number;
  ddsPresentes: number;
}

export const SCORE_LIMIAR = {
  excelente: 90,
  bom: 75,
  atencao: 60,
  critico: 40,
} as const;

export type Classificacao = 'Excelente' | 'Bom' | 'Atenção' | 'Crítico' | 'Alto Risco';

export function classificar(score: number): Classificacao {
  if (score >= SCORE_LIMIAR.excelente) return 'Excelente';
  if (score >= SCORE_LIMIAR.bom) return 'Bom';
  if (score >= SCORE_LIMIAR.atencao) return 'Atenção';
  if (score >= SCORE_LIMIAR.critico) return 'Crítico';
  return 'Alto Risco';
}

export function corClassificacao(c: Classificacao): string {
  switch (c) {
    case 'Excelente': return '#10B981';
    case 'Bom': return '#3B82F6';
    case 'Atenção': return '#F59E0B';
    case 'Crítico': return '#F97316';
    case 'Alto Risco': return '#EF4444';
  }
}

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

/** Frequência: faltas custam 10 pts; atrasos 2 pts; saída antecipada 3 pts. */
export function scoreFrequencia(i: FrequenciaInputs): number {
  const penalidade =
    i.totalFaltasInjustificadas * 10 +
    i.totalAtrasos * 2 +
    i.totalSaidasAntecipadas * 3;
  return clamp(100 - penalidade);
}

/** Saúde: dias afastados pesam mais que contagem; acidente conta dobro de atestado. */
export function scoreSaude(i: SaudeInputs): number {
  const penalidade =
    i.diasAfastadoAtestado * 1.0 +
    i.countAtestados * 2 +
    i.diasAfastadoAcidente * 2.0 +
    i.countAcidentes * 5;
  return clamp(100 - penalidade);
}

/** Disciplina: leve 15 pts, grave 35 pts, suspensão 50 pts + 5 por dia suspenso. */
export function scoreDisciplina(i: DisciplinaInputs): number {
  const penalidade =
    i.countAdvertenciasLeves * 15 +
    i.countAdvertenciasGraves * 35 +
    i.countSuspensoes * 50 +
    i.diasSuspensao * 5;
  return clamp(100 - penalidade);
}

/**
 * Segurança: combina gravidade dos acidentes com participação em DDS.
 * Base = 100 - penalidade acidentes. Multiplica por (0.7 + 0.3 * presença_DDS).
 * Quem participa de TODOS os DDS mantém base; quem some perde até 30%.
 */
export function scoreSeguranca(i: SegurancaInputs): number {
  const penalidadeAcidentes =
    i.countAcidentesGraves * 50 +
    i.countAcidentesLeves * 20 +
    i.countAcidentesQuase * 5;
  const base = clamp(100 - penalidadeAcidentes);
  const presencaPct = i.ddsConvocados > 0 ? i.ddsPresentes / i.ddsConvocados : 1;
  const fator = 0.7 + 0.3 * clamp(presencaPct, 0, 1);
  return clamp(Math.round(base * fator));
}

export interface SubScores {
  frequencia: number;
  saude: number;
  disciplina: number;
  seguranca: number;
}

export interface PesosScore {
  frequencia: number;
  saude: number;
  disciplina: number;
  seguranca: number;
}

export const PESOS_DEFAULT: PesosScore = {
  frequencia: 0.25,
  saude: 0.25,
  disciplina: 0.25,
  seguranca: 0.25,
};

export function scoreGeral(sub: SubScores, pesos: PesosScore = PESOS_DEFAULT): number {
  const total = pesos.frequencia + pesos.saude + pesos.disciplina + pesos.seguranca;
  if (total <= 0) return 0;
  const soma =
    sub.frequencia * pesos.frequencia +
    sub.saude * pesos.saude +
    sub.disciplina * pesos.disciplina +
    sub.seguranca * pesos.seguranca;
  return clamp(Math.round(soma / total));
}

/**
 * Gera observações curtas pra exibir no raio-x — explicabilidade LGPD.
 * Cada linha é UM motivo concreto extraído dos inputs (sem juízo de valor).
 */
export function gerarObservacoes(
  freq: FrequenciaInputs,
  saude: SaudeInputs,
  disc: DisciplinaInputs,
  seg: SegurancaInputs,
): string[] {
  const obs: string[] = [];
  if (freq.totalFaltasInjustificadas >= 3) obs.push(`${freq.totalFaltasInjustificadas} faltas injustificadas no período.`);
  if (freq.totalAtrasos >= 5) obs.push(`${freq.totalAtrasos} atrasos no período (${freq.totalMinutosAtraso} min totais).`);
  if (saude.countAtestados >= 4) obs.push(`${saude.countAtestados} atestados — possível tendência de afastamento.`);
  if (saude.diasAfastadoAcidente > 0) obs.push(`${saude.diasAfastadoAcidente} dias afastado por acidente.`);
  if (disc.countAdvertenciasGraves >= 1) obs.push(`${disc.countAdvertenciasGraves} advertência(s) grave(s) no período.`);
  if (disc.countSuspensoes >= 1) obs.push(`${disc.countSuspensoes} suspensão(ões) aplicada(s).`);
  if (seg.countAcidentesGraves >= 1) obs.push(`${seg.countAcidentesGraves} acidente(s) grave(s) — revisar análise SST.`);
  const pct = seg.ddsConvocados > 0 ? Math.round((seg.ddsPresentes / seg.ddsConvocados) * 100) : null;
  if (pct !== null && pct < 70) obs.push(`Presença em DDS abaixo do esperado: ${pct}%.`);
  return obs;
}
