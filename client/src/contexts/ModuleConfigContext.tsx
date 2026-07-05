import { createContext, useContext, useMemo, ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";

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
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;

  const { data: modules = [], isLoading, refetch } = trpc.moduleConfig.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId && companyId > 0 }
  );

  // Rev. 4045 — T005: módulos NÃO contratados na assinatura SaaS da empresa
  // (quando ela tem uma — empresas legadas internas ficam de fora, ver
  // server/_core/moduleGating.ts) também devem ficar indisponíveis na sidebar,
  // além do toggle manual "Módulos do Sistema" já tratado acima.
  const { data: contracted } = trpc.billing.getContractedModules.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId && companyId > 0 && !!user }
  );

  // Sub-variantes de um módulo faturável (ex.: as 3 abas de Jurídico, ou
  // Medição-Terceiros) devem checar o billing moduleId BASE, não a chave
  // literal da sidebar (que não existe em shared/billingModules.ts).
  const BILLING_KEY_ALIASES: Record<string, string> = {
    "juridico-trabalhista": "juridico",
    "juridico-tributario": "juridico",
    "juridico-civil": "juridico",
    "medicao-terceiros": "medicao",
  };

  const isModuleEnabled = (key: string): boolean => {
    if (!companyId) return true;
    const mod = (modules as ModuleStatus[]).find((m) => m.moduleKey === key);
    if (mod && !mod.enabled) return false;
    if (contracted && !contracted.legacy) {
      const billingKey = BILLING_KEY_ALIASES[key] ?? key;
      if (!contracted.moduleIds.includes(billingKey)) return false;
    }
    return true;
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
    if (disabledPagesSet.has(path)) return false;
    // Dynamic planejamento project tabs: /planejamento/{id}?tab=X
    // Store as /planejamento?tab=X (without project ID) so the toggle applies to ALL projects
    const planTabMatch = path.match(/^\/planejamento\/\d+(\?tab=.+)$/);
    if (planTabMatch) {
      if (disabledPagesSet.has(`/planejamento${planTabMatch[1]}`)) return false;
    }
    return true;
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
