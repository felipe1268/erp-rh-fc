import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const STORAGE_KEY = "erp-rh-fc-default-company";

interface CompanyContextType {
  selectedCompanyId: string;
  setSelectedCompanyId: (id: string) => void;
  companies: any[] | undefined;
  isLoading: boolean;
  selectedCompany: any | undefined;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const companiesQuery = trpc.companies.list.useQuery();
  const companies = companiesQuery.data;
  const isLoading = companiesQuery.isLoading;

  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || "";
  });

  // When companies load, ensure we have a valid selection
  useEffect(() => {
    if (!companies || companies.length === 0) return;
    const ids = companies.map((c: any) => String(c.id));
    // If current selection is valid, keep it
    if (selectedCompanyId && ids.includes(selectedCompanyId)) return;
    // Otherwise use stored default or first company
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ids.includes(stored)) {
      setSelectedCompanyIdState(stored);
    } else {
      setSelectedCompanyIdState(ids[0]);
    }
  }, [companies]);

  const setSelectedCompanyId = (id: string) => {
    setSelectedCompanyIdState(id);
    // Don't overwrite the "default" star — just change the active selection
  };

  const selectedCompany = companies?.find((c: any) => String(c.id) === selectedCompanyId);

  return (
    <CompanyContext.Provider
      value={{
        selectedCompanyId,
        setSelectedCompanyId,
        companies,
        isLoading,
        selectedCompany,
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
