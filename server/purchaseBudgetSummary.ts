export type PurchaseHistoryRow = {
  ocItemId: number;
  ocId: number;
  ocNumero: string | null;
  ocStatus: string | null;
  cotacaoId?: number | null;
  scId: number | null;
  scNumero: string | null;
  scStatus: string | null;
  scItemId: number | null;
  orcamentoItemId: number | null;
  insumoCodigo: string | null;
  quantidade: unknown;
  valor: unknown;
  quantidadeSolicitada: unknown;
  quantidadeAtendida: unknown;
  statusItem: string | null;
};

const INVALID_HISTORY_STATUSES = new Set([
  "cancelada",
  "cancelado",
  "recusada",
  "recusado",
  "rejeitada",
  "rejeitado",
  "devolvida",
  "devolvido",
  "estornada",
  "estornado",
]);

export function isPurchaseHistoryEligible(
  row: Pick<PurchaseHistoryRow, "ocStatus" | "scStatus" | "cotacaoId">,
  currentCotacaoId?: number,
): boolean {
  if (currentCotacaoId && row.cotacaoId === currentCotacaoId) return false;
  const ocStatus = String(row.ocStatus ?? "").trim().toLowerCase();
  const scStatus = String(row.scStatus ?? "").trim().toLowerCase();
  return !INVALID_HISTORY_STATUSES.has(ocStatus) && !INVALID_HISTORY_STATUSES.has(scStatus);
}

export type PurchaseHistoryReference = {
  ocId: number;
  ocNumero: string;
  ocStatus: string;
  scId: number | null;
  scNumero: string | null;
  scStatus: string | null;
  quantidade: number;
  valor: number;
  atendimento: "parcial" | "total";
};

export type PurchaseHistorySummary = {
  quantidade: number;
  valor: number;
  referencias: PurchaseHistoryReference[];
};

function numberValue(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeInsumo(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

export function purchaseBudgetKey(input: {
  orcamentoItemId?: number | null;
  insumoCodigo?: string | null;
  solicitacaoItemId?: number | null;
  cotacaoItemId?: number | null;
}): string {
  const insumo = normalizeInsumo(input.insumoCodigo);
  if (input.orcamentoItemId) {
    return `orc:${input.orcamentoItemId}:ins:${insumo || "-"}`;
  }
  if (insumo) return `ins:${insumo}`;
  if (input.solicitacaoItemId) return `sc-item:${input.solicitacaoItemId}`;
  return `cot-item:${input.cotacaoItemId ?? 0}`;
}

export function aggregatePurchaseHistory(
  rows: PurchaseHistoryRow[],
  currentCotacaoId?: number,
): Map<string, PurchaseHistorySummary> {
  const summaries = new Map<string, PurchaseHistorySummary>();
  const seenOcItems = new Set<number>();

  for (const row of rows) {
    if (!isPurchaseHistoryEligible(row, currentCotacaoId)) continue;
    // Os joins de rastreabilidade podem repetir uma linha de OC. O item da OC é
    // a unidade financeira autoritativa e só pode consumir a meta uma vez.
    if (seenOcItems.has(row.ocItemId)) continue;
    seenOcItems.add(row.ocItemId);

    const key = purchaseBudgetKey({
      orcamentoItemId: row.orcamentoItemId,
      insumoCodigo: row.insumoCodigo,
      solicitacaoItemId: row.scItemId,
    });
    const quantidade = numberValue(row.quantidade);
    const valor = numberValue(row.valor);
    const solicitada = numberValue(row.quantidadeSolicitada);
    const atendida = numberValue(row.quantidadeAtendida);
    const totalByStatus = String(row.statusItem ?? "").toLowerCase() === "atendido_total";
    const atendimento = totalByStatus || (solicitada > 0 && atendida >= solicitada - 0.001)
      ? "total"
      : "parcial";

    let summary = summaries.get(key);
    if (!summary) {
      summary = { quantidade: 0, valor: 0, referencias: [] };
      summaries.set(key, summary);
    }
    summary.quantidade += quantidade;
    summary.valor += valor;

    const refKey = `${row.ocId}:${row.scId ?? 0}`;
    const existing = summary.referencias.find(
      (ref) => `${ref.ocId}:${ref.scId ?? 0}` === refKey,
    );
    if (existing) {
      existing.quantidade += quantidade;
      existing.valor += valor;
      if (atendimento === "total") existing.atendimento = "total";
    } else {
      summary.referencias.push({
        ocId: row.ocId,
        ocNumero: row.ocNumero ?? String(row.ocId),
        ocStatus: row.ocStatus ?? "",
        scId: row.scId,
        scNumero: row.scNumero,
        scStatus: row.scStatus,
        quantidade,
        valor,
        atendimento,
      });
    }
  }

  for (const summary of summaries.values()) {
    summary.quantidade = Math.round(summary.quantidade * 1000) / 1000;
    summary.valor = Math.round(summary.valor * 100) / 100;
    for (const ref of summary.referencias) {
      ref.quantidade = Math.round(ref.quantidade * 1000) / 1000;
      ref.valor = Math.round(ref.valor * 100) / 100;
    }
  }

  return summaries;
}

export function calculateBudgetDeficit(input: {
  metaOriginal: number;
  comprasAnteriores: number;
  cotacaoAtual: number;
}): { saldo: number; deficit: number } {
  const saldo = Math.round(
    (input.metaOriginal - input.comprasAnteriores - input.cotacaoAtual) * 100,
  ) / 100;
  return { saldo, deficit: saldo < 0 ? Math.abs(saldo) : 0 };
}