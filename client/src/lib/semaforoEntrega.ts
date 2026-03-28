export type SemaforoStatus = "no_prazo" | "proximo" | "atrasado" | "sem_data" | "entregue";

export interface SemaforoResult {
  status: SemaforoStatus;
  dias: number;
  dataReferencia: string | null;
}

const CLOSED_STATUSES = ["entregue", "cancelada", "recebido"];

export function calcularSemaforo(
  dataEntregaPrevista: string | null | undefined,
  dataEntregaReal: string | null | undefined,
  statusOC: string,
  proximaEntregaProgramada?: string | null,
): SemaforoResult {
  if (CLOSED_STATUSES.includes(statusOC)) {
    return { status: "entregue", dias: 0, dataReferencia: dataEntregaPrevista ?? null };
  }

  const dataRef = proximaEntregaProgramada || dataEntregaPrevista;
  if (!dataRef) {
    return { status: "sem_data", dias: 0, dataReferencia: null };
  }

  const dataComparacao = dataEntregaReal
    ? new Date(dataEntregaReal + "T00:00:00")
    : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

  const entrega = new Date(dataRef + "T00:00:00");
  const diffMs = entrega.getTime() - dataComparacao.getTime();
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDias < 0) {
    return { status: "atrasado", dias: Math.abs(diffDias), dataReferencia: dataRef };
  }
  if (diffDias <= 3) {
    return { status: "proximo", dias: diffDias, dataReferencia: dataRef };
  }
  return { status: "no_prazo", dias: diffDias, dataReferencia: dataRef };
}

export function semaforoCor(status: SemaforoStatus): string {
  switch (status) {
    case "atrasado": return "text-red-500";
    case "proximo": return "text-amber-500";
    case "no_prazo": return "text-emerald-500";
    case "entregue": return "text-gray-400";
    case "sem_data": return "text-gray-300";
  }
}

export function semaforoBgCor(status: SemaforoStatus): string {
  switch (status) {
    case "atrasado": return "bg-red-500";
    case "proximo": return "bg-amber-500";
    case "no_prazo": return "bg-emerald-500";
    case "entregue": return "bg-gray-400";
    case "sem_data": return "bg-gray-300";
  }
}

export function semaforoTooltip(result: SemaforoResult): string {
  if (result.status === "sem_data") return "Sem data de entrega prevista";
  if (result.status === "entregue") return "OC entregue/concluída";

  const dataFmt = result.dataReferencia
    ? new Date(result.dataReferencia + "T00:00:00").toLocaleDateString("pt-BR")
    : "—";

  switch (result.status) {
    case "atrasado":
      return `ATRASADA — ${result.dias} dia${result.dias !== 1 ? "s" : ""} de atraso\nPrevista: ${dataFmt}`;
    case "proximo":
      return result.dias === 0
        ? `Entrega HOJE\nPrevista: ${dataFmt}`
        : `Entrega em ${result.dias} dia${result.dias !== 1 ? "s" : ""}\nPrevista: ${dataFmt}`;
    case "no_prazo":
      return `No prazo — ${result.dias} dia${result.dias !== 1 ? "s" : ""} restantes\nPrevista: ${dataFmt}`;
    default:
      return "";
  }
}

export const CLOSED_OC_STATUSES = CLOSED_STATUSES;
