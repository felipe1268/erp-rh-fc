import { useCompany as useCompanyContext } from "@/contexts/CompanyContext";

/**
 * Hook de conveniência para obter companyId numérico e lista de IDs.
 * Suporta modo "CONSTRUTORAS" (todas as empresas) via getCompanyIds().
 * 
 * PADRÃO ÚNICO DE USO:
 *   const { companyId, isConstrutoras, getCompanyIds, queryInput } = useCompany();
 * 
 *   // Para queries que aceitam companyId + companyIds:
 *   trpc.xxx.list.useQuery(queryInput);
 * 
 *   // Para queries que aceitam apenas companyId:
 *   trpc.xxx.get.useQuery({ companyId });
 * 
 *   // Para mutations:
 *   mutation.mutate({ companyId, ...data });
 */
export function useCompany() {
  const { selectedCompanyId, selectedCompany, getCompanyIdsForQuery, isConstrutoras, construtorasIds } = useCompanyContext();
  const companyId = parseInt(selectedCompanyId || "0") || 0;
  const companyIds = getCompanyIdsForQuery();

  return {
    companyId,
    selectedCompanyId,
    selectedCompany,
    isConstrutoras,
    getCompanyIds: getCompanyIdsForQuery,
    queryInput: { companyId, companyIds: isConstrutoras ? companyIds : undefined } as { companyId: number; companyIds?: number[] },
  };
}
