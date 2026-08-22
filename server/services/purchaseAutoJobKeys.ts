/**
 * Build a persisted, daily key for a purchase alert.
 *
 * The resource identifier—not display text—anchors the key so a text change
 * during the same day cannot generate another notification. The date preserves
 * the previous daily reminder cadence.
 */
export function buildPurchaseAlertDedupKey(
  tipo: string,
  resourceKey: string | number,
  dateStr: string,
): string {
  return `purchase:${tipo}:${resourceKey}:${dateStr}`;
}