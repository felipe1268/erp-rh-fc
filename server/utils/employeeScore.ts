/**
 * Motor de Score de Funcionário — Rev. 2505 (Fase 2 — 6 pilares).
 *
 * 6 sub-scores determinísticos (0-100, MAIOR = MELHOR) calculados sobre dados
 * que JÁ existem no ERP. Sem IA, sem ML, sem rede neural. Cada score é uma
 * função pura `(inputs) => número`, fácil de auditar, explicar e ajustar.
 *
 *   • Frequência   → faltas + atrasos (tabela `ponto_descontos_resumo`).
 *   • Saúde        → atestados + acidentes (dias afastado).
 *   • Disciplina   → advertências formais (tabela `warnings`).
 *   • Segurança    → acidentes (gravidade) + presença em DDS.
 *   • Capacitação  → treinamentos válidos vs vencidos (tabela `trainings`). [NOVO Rev. 2505]
 *   • Lealdade     → tempo de casa em meses (employees.dataAdmissao).        [NOVO Rev. 2505]
 *
 * Score Geral = média ponderada (default: 20% cada pilar "core" + 10% cada
 * pilar "complementar" — RH ajusta no futuro). Total = 100%.
 *
 * REGRAS DE OURO (LGPD + CLT):
 *   1. NUNCA recomendar desligamento por idade.
 *   2. Decisão sempre humana — o sistema só sinaliza.
 *   3. Todos os pesos e fórmulas estão NESTE arquivo, auditável.
 *   4. Inputs zerados → score neutro 100 (não pune funcionário recém-admitido).
 *   5. Lealdade é PRÊMIO de retenção, não punição: funcionário com pouco tempo
 *      de casa começa em base neutra (60) e cresce, não cai abaixo disso.
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

// Rev. 2505 — Pilares novos
export interface CapacitacaoInputs {
  /** Treinamentos com dataValidade no futuro OU sem validade (vitalícios). */
  countTreinamentosValidos: number;
  /** Treinamentos com dataValidade < hoje (perdidos por falta de reciclagem). */
  countTreinamentosVencidos: number;
  /** Treinamentos realizados na janela do período (recência). */
  countTreinamentosRecentes: number;
}

export interface LealdadeInputs {
  /** Tempo de casa em meses, calculado de dataAdmissao até hoje. */
  mesesDeCasa: number;
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

/**
 * Capacitação — base 70 (qualquer funcionário recém-admitido começa "OK").
 *   +6 por treinamento válido (cap em 100).
 *   -12 por treinamento VENCIDO (reciclagem perdida = risco SST/operacional).
 *   +3 bônus por treinamento feito DENTRO da janela do período (recência).
 * Faixa típica: 40 (vários vencidos) a 100 (todos válidos + reciclagem em dia).
 */
export function scoreCapacitacao(i: CapacitacaoInputs): number {
  const score = 70
    + i.countTreinamentosValidos * 6
    + i.countTreinamentosRecentes * 3
    - i.countTreinamentosVencidos * 12;
  return clamp(Math.round(score));
}

/**
 * Lealdade — prêmio por tempo de casa (retenção). NUNCA pune: piso 60.
 *   <  6 meses → 60 (período de adaptação, score neutro positivo).
 *   6-12      → 75.
 *   1-3 anos  → 85.
 *   3-5 anos  → 92.
 *   5-10 anos → 97.
 *   10+ anos  → 100.
 * Funcionários sem dataAdmissao (raro) ficam em 60.
 */
export function scoreLealdade(i: LealdadeInputs): number {
  const m = i.mesesDeCasa;
  if (m < 6) return 60;
  if (m < 12) return 75;
  if (m < 36) return 85;
  if (m < 60) return 92;
  if (m < 120) return 97;
  return 100;
}

export interface SubScores {
  frequencia: number;
  saude: number;
  disciplina: number;
  seguranca: number;
  capacitacao: number;
  lealdade: number;
}

export interface PesosScore {
  frequencia: number;
  saude: number;
  disciplina: number;
  seguranca: number;
  capacitacao: number;
  lealdade: number;
}

// Rev. 2505 — 4 pilares "core" 20% cada + 2 pilares "complementares" 10% cada.
// Frequência/Saúde/Disciplina/Segurança seguem dominando o score (representam
// risco operacional/legal); Capacitação e Lealdade contextualizam sem
// dominar a decisão.
export const PESOS_DEFAULT: PesosScore = {
  frequencia: 0.20,
  saude: 0.20,
  disciplina: 0.20,
  seguranca: 0.20,
  capacitacao: 0.10,
  lealdade: 0.10,
};

export function scoreGeral(sub: SubScores, pesos: PesosScore = PESOS_DEFAULT): number {
  const total = pesos.frequencia + pesos.saude + pesos.disciplina + pesos.seguranca + pesos.capacitacao + pesos.lealdade;
  if (total <= 0) return 0;
  const soma =
    sub.frequencia * pesos.frequencia +
    sub.saude * pesos.saude +
    sub.disciplina * pesos.disciplina +
    sub.seguranca * pesos.seguranca +
    sub.capacitacao * pesos.capacitacao +
    sub.lealdade * pesos.lealdade;
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
  cap?: CapacitacaoInputs,
  leal?: LealdadeInputs,
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
  if (cap && cap.countTreinamentosVencidos >= 1) obs.push(`${cap.countTreinamentosVencidos} treinamento(s) vencido(s) — reciclagem pendente.`);
  if (cap && cap.countTreinamentosValidos === 0 && cap.countTreinamentosVencidos === 0) obs.push(`Nenhum treinamento formal registrado.`);
  if (leal) {
    const anos = Math.floor(leal.mesesDeCasa / 12);
    if (leal.mesesDeCasa >= 60) obs.push(`${anos} anos de casa — funcionário com forte retenção.`);
    else if (leal.mesesDeCasa < 6) obs.push(`Em período de adaptação (${leal.mesesDeCasa} meses de casa).`);
  }
  return obs;
}
