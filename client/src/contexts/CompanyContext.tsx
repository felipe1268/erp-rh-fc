import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const STORAGE_KEY = "erp-rh-fc-default-company";
export const CONSTRUTORAS_ID = "construtoras";

interface CompanyContextType {
  selectedCompanyId: string;
  setSelectedCompanyId: (id: string) => void;
  companies: any[] | undefined;
  isLoading: boolean;
  selectedCompany: any | undefined;
  /** true quando "CONSTRUTORAS" está selecionado */
  isConstrutoras: boolean;
  /** IDs das empresas do pool Construtoras (para queries) */
  construtorasIds: number[];
  /** Retorna o array de companyIds para usar em queries:
   *  - Se Construtoras selecionado: retorna todos os IDs do pool
   *  - Se empresa individual: retorna [companyId] */
  getCompanyIdsForQuery: () => number[];
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const companiesQuery = trpc.companies.list.useQuery();
  const construtorasQuery = trpc.companies.construtorasIds.useQuery();
  const companies = companiesQuery.data;
  const isLoading = companiesQuery.isLoading;
  const construtorasIds = construtorasQuery.data ?? [];

  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || "";
  });

  // When companies load, ensure we have a valid selection
  useEffect(() => {
    if (!companies || companies.length === 0) return;
    const ids = companies.map((c: any) => String(c.id));
    const validIds = [...ids, CONSTRUTORAS_ID];
    // If current selection is valid, keep it
    if (selectedCompanyId && validIds.includes(selectedCompanyId)) return;
    // Otherwise use stored default or first company
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && validIds.includes(stored)) {
      setSelectedCompanyIdState(stored);
    } else {
      setSelectedCompanyIdState(ids[0]);
    }
  }, [companies]);

  const setSelectedCompanyId = (id: string) => {
    setSelectedCompanyIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const isConstrutoras = selectedCompanyId === CONSTRUTORAS_ID;

  const selectedCompany = isConstrutoras
    ? { id: CONSTRUTORAS_ID, razaoSocial: "CONSTRUTORAS", nomeFantasia: "CONSTRUTORAS", isConstrutoras: true }
    : companies?.find((c: any) => String(c.id) === selectedCompanyId);

  const getCompanyIdsForQuery = useMemo(() => {
    return () => {
      if (isConstrutoras && construtorasIds.length > 0) {
        return construtorasIds;
      }
      const numId = parseInt(selectedCompanyId);
      return isNaN(numId) ? [] : [numId];
    };
  }, [isConstrutoras, construtorasIds, selectedCompanyId]);

  return (
    <CompanyContext.Provider
      value={{
        selectedCompanyId,
        setSelectedCompanyId,
        companies,
        isLoading,
        selectedCompany,
        isConstrutoras,
        construtorasIds,
        getCompanyIdsForQuery,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider");
  return ctx;
}
