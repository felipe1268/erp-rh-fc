import { useCompany as useCompanyContext } from "@/contexts/CompanyContext";

/**
 * Hook de conveniência para obter companyId numérico e lista de IDs.
 * Suporta modo "CONSTRUTORAS" (todas as empresas) via getCompanyIds().
 */
export function useCompany() {
  const { selectedCompanyId, selectedCompany, getCompanyIdsForQuery } = useCompanyContext();
  const companyId = parseInt(selectedCompanyId || "0") || 0;
  return {
    companyId,
    selectedCompanyId,
    selectedCompany,
    getCompanyIds: getCompanyIdsForQuery,
  };
}
