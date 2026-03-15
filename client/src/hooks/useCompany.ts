import { useCompany as useCompanyContext } from "@/contexts/CompanyContext";

/**
 * Hook de conveniência para obter companyId numérico.
 * Usado pelas páginas do Módulo Financeiro.
 */
export function useCompany() {
  const { selectedCompanyId, selectedCompany, getCompanyIds } = useCompanyContext();
  const companyId = parseInt(selectedCompanyId || "0") || 0;
  return { companyId, selectedCompanyId, selectedCompany, getCompanyIds };
}
