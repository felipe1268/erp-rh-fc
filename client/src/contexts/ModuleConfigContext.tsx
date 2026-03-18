import { createContext, useContext, useMemo, ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";

interface ModuleStatus {
  moduleKey: string;
  enabled: boolean;
  id: number | null;
  updatedBy: string | null;
  updatedAt: string | null;
  disabledPages: string[];
}

interface ModuleConfigContextType {
  modules: ModuleStatus[];
  isLoading: boolean;
  isModuleEnabled: (key: string) => boolean;
  isPageEnabled: (path: string) => boolean;
  refetch: () => void;
}

const ModuleConfigContext = createContext<ModuleConfigContextType>({
  modules: [],
  isLoading: true,
  isModuleEnabled: () => true,
  isPageEnabled: () => true,
  refetch: () => {},
});

export function ModuleConfigProvider({ children }: { children: ReactNode }) {
  const { selectedCompanyId, isConstrutoras, construtorasIds } = useCompany();
  const companyId = isConstrutoras ? (construtorasIds[0] || undefined) : (selectedCompanyId ? parseInt(selectedCompanyId) : undefined);

  const { data: modules = [], isLoading, refetch } = trpc.moduleConfig.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId && companyId > 0 }
  );

  const isModuleEnabled = (key: string): boolean => {
    if (!companyId) return true;
    const mod = (modules as ModuleStatus[]).find((m) => m.moduleKey === key);
    return mod ? mod.enabled : true;
  };

  const disabledPagesSet = useMemo(() => {
    const set = new Set<string>();
    for (const mod of (modules as ModuleStatus[])) {
      if (mod.disabledPages && Array.isArray(mod.disabledPages)) {
        for (const p of mod.disabledPages) set.add(p);
      }
    }
    return set;
  }, [modules]);

  const isPageEnabled = (path: string): boolean => {
    if (!companyId) return true;
    return !disabledPagesSet.has(path);
  };

  return (
    <ModuleConfigContext.Provider value={{ modules: modules as ModuleStatus[], isLoading, isModuleEnabled, isPageEnabled, refetch }}>
      {children}
    </ModuleConfigContext.Provider>
  );
}

export function useModuleConfig() {
  return useContext(ModuleConfigContext);
}
