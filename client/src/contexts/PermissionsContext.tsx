import { createContext, useContext, ReactNode, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { MODULE_DEFINITIONS, SHARED_FEATURES, ADMIN_FEATURES, type ActiveModuleId } from "../../../shared/modules";

interface PermissionsContextType {
  isAdminMaster: boolean;
  isLoading: boolean;
  // Verifica se o usuário pode acessar um módulo inteiro
  canAccessModule: (moduleId: ActiveModuleId) => boolean;
  // Verifica se o usuário pode acessar uma funcionalidade específica
  canAccessFeature: (moduleId: ActiveModuleId, featureKey: string) => boolean;
  // Verifica se pode acessar por rota
  canAccessRoute: (route: string) => boolean;
  // Retorna os módulos que o usuário pode acessar
  accessibleModules: ActiveModuleId[];
  // Retorna as features de um módulo que o usuário pode acessar
  getAccessibleFeatures: (moduleId: ActiveModuleId) => string[];
}

const PermissionsContext = createContext<PermissionsContextType>({
  isAdminMaster: false,
  isLoading: true,
  canAccessModule: () => false,
  canAccessFeature: () => false,
  canAccessRoute: () => false,
  accessibleModules: [],
  getAccessibleFeatures: () => [],
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = trpc.userManagement.getMyPermissions.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
    refetchOnWindowFocus: false,
  });

  const isAdminMaster = data?.isAdminMaster ?? false;
  const permissions = data?.permissions ?? [];

  // Construir mapa de permissões para lookup rápido
  const permMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of permissions) {
      map.set(`${p.moduleId}:${p.featureKey}`, p.canAccess);
    }
    return map;
  }, [permissions]);

  const canAccessModule = (moduleId: ActiveModuleId): boolean => {
    if (isAdminMaster) return true;
    // Se não tem nenhuma permissão definida, sem acesso
    if (permissions.length === 0) return false;
    // Verifica se tem pelo menos uma feature habilitada no módulo
    const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
    if (!mod) return false;
    return mod.features.some(f => permMap.get(`${moduleId}:${f.key}`) === true);
  };

  const canAccessFeature = (moduleId: ActiveModuleId, featureKey: string): boolean => {
    if (isAdminMaster) return true;
    if (permissions.length === 0) return false;
    return permMap.get(`${moduleId}:${featureKey}`) === true;
  };

  const canAccessRoute = (route: string): boolean => {
    if (isAdminMaster) return true;
    // Shared features são acessíveis se o usuário tem acesso a pelo menos um módulo
    if (SHARED_FEATURES.some(f => f.route === route)) {
      return accessibleModules.length > 0;
    }
    // Admin features são acessíveis apenas para admin/admin_master (tratado separadamente)
    if (ADMIN_FEATURES.some(f => f.route === route)) {
      return true; // Controlado pelo role no DashboardLayout
    }
    // Verificar em cada módulo
    for (const mod of MODULE_DEFINITIONS) {
      const feat = mod.features.find(f => f.route === route);
      if (feat) {
        return canAccessFeature(mod.id, feat.key);
      }
    }
    return false;
  };

  const accessibleModules = useMemo(() => {
    if (isAdminMaster) return MODULE_DEFINITIONS.map(m => m.id);
    return MODULE_DEFINITIONS.filter(m => canAccessModule(m.id)).map(m => m.id);
  }, [isAdminMaster, permMap]);

  const getAccessibleFeatures = (moduleId: ActiveModuleId): string[] => {
    if (isAdminMaster) {
      const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
      return mod ? mod.features.map(f => f.key) : [];
    }
    const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
    if (!mod) return [];
    return mod.features.filter(f => permMap.get(`${moduleId}:${f.key}`) === true).map(f => f.key);
  };

  return (
    <PermissionsContext.Provider
      value={{
        isAdminMaster,
        isLoading,
        canAccessModule,
        canAccessFeature,
        canAccessRoute,
        accessibleModules,
        getAccessibleFeatures,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
