import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const STORAGE_KEY = "erp-rh-fc-default-company-screenshot-tmp";

interface CompanyContextType {
  selectedCompanyId: string;
  // Rev. 2022 — companyIdNum: coerção pronta pra inputs `z.number()` dos
  // routers tRPC. Evita o bug da Rev. 2020 (Zod estourando "expected number,
  // received string") quando a página esquece de fazer `Number(...)`. Usar
  // preferencialmente este em vez de `selectedCompanyId` quando o destino
  // for input numérico.
  companyIdNum: number;
  setSelectedCompanyId: (id: string) => void;
  companies: any[] | undefined;
  isLoading: boolean;
  selectedCompany: any | undefined;
  getCompanyIdsForQuery: () => number[];
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const companiesQuery = trpc.companies.list.useQuery();
  const companies = companiesQuery.data;
  const isLoading = companiesQuery.isLoading;

  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) || "";
    if (stored === "construtoras") return "";
    return stored;
  });

  useEffect(() => {
    if (!companies || companies.length === 0) return;
    const ids = companies.map((c: any) => String(c.id));
    if (selectedCompanyId && ids.includes(selectedCompanyId)) return;
    const firstValid = ids[0];
    if (firstValid) {
      setSelectedCompanyIdState(firstValid);
      localStorage.setItem(STORAGE_KEY, firstValid);
    }
  }, [companies, selectedCompanyId]);

  const setSelectedCompanyId = (id: string) => {
    if (id === "construtoras") return;
    setSelectedCompanyIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const validCompanyId = useMemo(() => {
    if (!companies || companies.length === 0) return selectedCompanyId;
    const ids = companies.map((c: any) => String(c.id));
    if (ids.includes(selectedCompanyId)) return selectedCompanyId;
    return ids[0] || selectedCompanyId;
  }, [companies, selectedCompanyId]);

  const selectedCompany = companies?.find((c: any) => String(c.id) === validCompanyId);

  const getCompanyIdsForQuery = useMemo(() => {
    return () => {
      const numId = parseInt(validCompanyId);
      return isNaN(numId) ? [] : [numId];
    };
  }, [validCompanyId]);

  // Rev. 2022 — número já coerced. Usa parseInt pra ser idêntico ao que
  // `hooks/useCompany.ts` já fazia (mantém retrocompatibilidade total).
  const companyIdNum = parseInt(validCompanyId || "0") || 0;

  return (
    <CompanyContext.Provider
      value={{
        selectedCompanyId: validCompanyId,
        companyIdNum,
        setSelectedCompanyId,
        companies,
        isLoading,
        selectedCompany,
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
