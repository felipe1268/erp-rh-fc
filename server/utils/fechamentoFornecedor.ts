export type FechamentoRateioItem = {
  entryId: number;
  valorBaseCentavos: number;
};

/**
 * Distribui o total efetivamente pago entre os títulos do fechamento.
 * O rateio é proporcional aos snapshots e o resto de centavos segue a maior
 * fração, com desempate por entryId, para ser determinístico e auditável.
 */
export function distribuirTotalFechamentoCentavos(
  items: FechamentoRateioItem[],
  totalCentavos: number,
): Map<number, number> {
  const ordered = items
    .map((item) => ({
      entryId: Number(item.entryId),
      valorBaseCentavos: Math.round(Number(item.valorBaseCentavos)),
    }))
    .sort((a, b) => a.entryId - b.entryId);
  if (ordered.length === 0) throw new Error("Fechamento sem itens para ratear.");
  if (!Number.isInteger(totalCentavos) || totalCentavos <= 0) {
    throw new Error("O total do fechamento deve ser positivo.");
  }
  if (new Set(ordered.map((item) => item.entryId)).size !== ordered.length) {
    throw new Error("O fechamento contém lançamentos repetidos.");
  }
  if (ordered.some((item) => !Number.isInteger(item.entryId) || item.entryId <= 0 || item.valorBaseCentavos <= 0)) {
    throw new Error("O fechamento contém lançamento ou valor-base inválido.");
  }

  const baseTotal = ordered.reduce((sum, item) => sum + item.valorBaseCentavos, 0);
  const totalBig = BigInt(totalCentavos);
  const baseBig = BigInt(baseTotal);
  const parts = ordered.map((item) => {
    const numerator = totalBig * BigInt(item.valorBaseCentavos);
    return {
      entryId: item.entryId,
      cents: Number(numerator / baseBig),
      remainder: numerator % baseBig,
    };
  });
  let missing = totalCentavos - parts.reduce((sum, item) => sum + item.cents, 0);
  const remainderOrder = [...parts].sort((a, b) => {
    if (a.remainder === b.remainder) return a.entryId - b.entryId;
    return a.remainder > b.remainder ? -1 : 1;
  });
  for (let i = 0; i < missing; i++) remainderOrder[i].cents += 1;

  if (parts.some((item) => item.cents <= 0)) {
    throw new Error("O desconto torna a baixa de um dos títulos igual a zero. Revise os ajustes do fechamento.");
  }
  const allocated = parts.reduce((sum, item) => sum + item.cents, 0);
  if (allocated !== totalCentavos) throw new Error("Falha ao ratear o total do fechamento.");
  return new Map(parts.map((item) => [item.entryId, item.cents]));
}