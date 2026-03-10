import { z } from "zod";
import { inArray, eq, SQL } from "drizzle-orm";

/**
 * Schema padrão para input com suporte a companyIds (grupo empresarial).
 * Usar em todas as procedures que precisam filtrar por empresa.
 */
export const companyInput = z.object({
  companyId: z.number(),
  companyIds: z.array(z.number()).optional(),
});

/**
 * Resolve os IDs de empresa para queries.
 * Se companyIds estiver preenchido (grupo empresarial), usa todos.
 * Caso contrário, usa o companyId individual.
 */
export function resolveCompanyIds(input: { companyId: number; companyIds?: number[] }): number[] {
  if (input.companyIds && input.companyIds.length > 0) {
    return input.companyIds;
  }
  return [input.companyId];
}

/**
 * Cria condição WHERE para filtrar por empresa(s).
 * Usa inArray quando há múltiplos IDs, eq quando há apenas um.
 */
export function companyFilter(column: any, input: { companyId: number; companyIds?: number[] }): SQL {
  const ids = resolveCompanyIds(input);
  if (ids.length === 1) {
    return eq(column, ids[0]);
  }
  return inArray(column, ids);
}
