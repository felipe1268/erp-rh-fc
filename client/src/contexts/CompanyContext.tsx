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
  isConstrutoras: boolean;
  construtorasIds: number[];
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

  useEffect(() => {
    if (!companies || companies.length === 0) return;
    const ids = companies.map((c: any) => String(c.id));
    const validIds = [...ids, CONSTRUTORAS_ID];
    if (selectedCompanyId && validIds.includes(selectedCompanyId)) return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && validIds.includes(stored)) {
      setSelectedCompanyIdState(stored);
    } else {
      setSelectedCompanyIdState(ids[0]);
      localStorage.setItem(STORAGE_KEY, ids[0]);
    }
  }, [companies, selectedCompanyId]);

  const setSelectedCompanyId = (id: string) => {
    setSelectedCompanyIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const isConstrutoras = selectedCompanyId === CONSTRUTORAS_ID;

  const effectiveCompanyId = useMemo(() => {
    if (isConstrutoras) return CONSTRUTORAS_ID;
    if (!companies || companies.length === 0) return selectedCompanyId;
    const ids = companies.map((c: any) => String(c.id));
    if (ids.includes(selectedCompanyId)) return selectedCompanyId;
    return ids[0] || selectedCompanyId;
  }, [companies, selectedCompanyId, isConstrutoras]);

  const selectedCompany = isConstrutoras
    ? { id: CONSTRUTORAS_ID, razaoSocial: "CONSTRUTORAS", nomeFantasia: "CONSTRUTORAS", isConstrutoras: true }
    : companies?.find((c: any) => String(c.id) === effectiveCompanyId);

  const getCompanyIdsForQuery = useMemo(() => {
    return () => {
      if (isConstrutoras && construtorasIds.length > 0) {
        return construtorasIds;
      }
      const numId = parseInt(effectiveCompanyId);
      return isNaN(numId) ? [] : [numId];
    };
  }, [isConstrutoras, construtorasIds, effectiveCompanyId]);

  return (
    <CompanyContext.Provider
      value={{
        selectedCompanyId: effectiveCompanyId,
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
