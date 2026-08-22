export function dataIsoReal(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [ano, mes, dia] = value.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano
    && data.getUTCMonth() === mes - 1
    && data.getUTCDate() === dia;
}

/**
 * Gera vencimentos mensais ancorados no dia da data inicial.
 * Quando o mês não possui esse dia, usa seu último dia (31/jan → 28/fev).
 * A data final é inclusiva: só entram vencimentos efetivamente <= fim.
 */
export function gerarVencimentosRecorrenciaMensal(dataInicio: string, dataFim: string): string[] {
  if (!dataIsoReal(dataInicio) || !dataIsoReal(dataFim) || dataFim < dataInicio) return [];
  const [anoInicio, mesInicio, diaInicio] = dataInicio.split("-").map(Number);
  const datas: string[] = [];
  let ano = anoInicio;
  let mes = mesInicio;
  for (let i = 0; i < 120; i++) {
    const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const dia = Math.min(diaInicio, ultimoDia);
    const data = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    if (data > dataFim) break;
    datas.push(data);
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  return datas;
}

export type LancamentoRecorrenciaExistente = {
  id: number;
  status: string | null;
  dataVencimento: string | null;
  temBaixaAtiva?: boolean;
};

export type CompetenciaRecorrenciaPlanejada = {
  vencimento: string;
  indice: number;
  existenteId: number | null;
  protegido: boolean;
  cancelado: boolean;
};

export function lancamentoRecorrenciaProtegido(entry: LancamentoRecorrenciaExistente): boolean {
  return entry.temBaixaAtiva === true || ["pago", "recebido"].includes(String(entry.status));
}

/**
 * Planeja a reconciliação sem efeitos colaterais:
 * - pagamento/baixa ativa tem prioridade e nunca é removido;
 * - lançamento aberto é reaproveitado para a mesma competência;
 * - cancelado bloqueia recriação automática daquela competência;
 * - projeções abertas fora do novo período (ou duplicadas) são removidas.
 */
export function planejarReconciliacaoRecorrencia(
  vencimentos: string[],
  existentes: LancamentoRecorrenciaExistente[],
): { competencias: CompetenciaRecorrenciaPlanejada[]; removerIds: number[] } {
  const porVencimento = new Map<string, LancamentoRecorrenciaExistente[]>();
  for (const entry of existentes) {
    const key = String(entry.dataVencimento || "").slice(0, 10);
    if (!key) continue;
    const lista = porVencimento.get(key) ?? [];
    lista.push(entry);
    porVencimento.set(key, lista);
  }
  const usados = new Set<number>();
  const competencias = vencimentos.map((vencimento, indice) => {
    const candidatos = porVencimento.get(vencimento) ?? [];
    const existente = candidatos.find(lancamentoRecorrenciaProtegido)
      ?? candidatos.find(entry => entry.status !== "cancelado")
      ?? candidatos[0];
    if (!existente) {
      return { vencimento, indice, existenteId: null, protegido: false, cancelado: false };
    }
    usados.add(existente.id);
    return {
      vencimento,
      indice,
      existenteId: existente.id,
      protegido: lancamentoRecorrenciaProtegido(existente),
      cancelado: existente.status === "cancelado",
    };
  });
  const removerIds = existentes
    .filter(entry =>
      !usados.has(entry.id)
      && entry.status !== "cancelado"
      && !lancamentoRecorrenciaProtegido(entry))
    .map(entry => entry.id);
  return { competencias, removerIds };
}

export function planejarLimpezaReedicaoRecorrencia(
  existentes: LancamentoRecorrenciaExistente[],
): { removerIds: number[]; protegidosIds: number[] } {
  return {
    removerIds: existentes
      .filter(entry => entry.status !== "cancelado" && !lancamentoRecorrenciaProtegido(entry))
      .map(entry => entry.id),
    protegidosIds: existentes.filter(lancamentoRecorrenciaProtegido).map(entry => entry.id),
  };
}