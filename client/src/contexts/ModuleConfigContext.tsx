import { createContext, useContext, ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";

interface ModuleStatus {
  moduleKey: string;
  enabled: boolean;
  id: number | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface ModuleConfigContextType {
  modules: ModuleStatus[];
  isLoading: boolean;
  isModuleEnabled: (key: string) => boolean;
  refetch: () => void;
}

const ModuleConfigContext = createContext<ModuleConfigContextType>({
  modules: [],
  isLoading: true,
  isModuleEnabled: () => true,
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
    if (!companyId) return true; // Se não há empresa selecionada, mostra tudo
    const mod = modules.find((m: ModuleStatus) => m.moduleKey === key);
    return mod ? mod.enabled : true; // Default: habilitado
  };

  return (
    <ModuleConfigContext.Provider value={{ modules, isLoading, isModuleEnabled, refetch }}>
      {children}
    </ModuleConfigContext.Provider>
  );
}

export function useModuleConfig() {
  return useContext(ModuleConfigContext);
}
