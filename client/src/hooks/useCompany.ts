import { useCompany as useCompanyContext } from "@/contexts/CompanyContext";

export function useCompany() {
  const { selectedCompanyId, selectedCompany, getCompanyIdsForQuery } = useCompanyContext();
  const companyId = parseInt(selectedCompanyId || "0") || 0;
  const companyIds = getCompanyIdsForQuery();

  return {
    companyId,
    companyIds,
    selectedCompanyId,
    selectedCompany,
    isConstrutoras: false as const,
    getCompanyIds: getCompanyIdsForQuery,
    getCompanyIdsForQuery,
    construtorasIds: [] as number[],
    queryInput: { companyId } as { companyId: number; companyIds?: number[] },
  };
}
