import { createContext, useContext, ReactNode, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { MODULE_DEFINITIONS, SHARED_FEATURES, ADMIN_FEATURES, type ActiveModuleId } from "../../../shared/modules";

interface GroupRoutePermission {
  rota: string;
  canView: boolean;
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
  ocultarValores: boolean;
  ocultarDocumentos: boolean;
}

interface GroupInfo {
  id: number;
  nome: string;
  cor: string | null;
  icone: string | null;
}

interface GroupPermissions {
  groups: GroupInfo[];
  routes: GroupRoutePermission[];
  somenteVisualizacao: boolean;
  ocultarDadosSensiveis: boolean;
}

interface PermissionsContextType {
  isAdminMaster: boolean;
  isLoading: boolean;
  // Novo sistema simplificado: acesso por módulo
  moduleAccess: Record<string, "admin" | "viewer">;
  canAccessModule: (moduleId: ActiveModuleId | string) => boolean;
  isModuleAdmin: (moduleId: ActiveModuleId | string) => boolean;
  // Verifica se o usuário pode acessar uma funcionalidade específica
  canAccessFeature: (moduleId: ActiveModuleId, featureKey: string) => boolean;
  // Verifica se pode acessar por rota
  canAccessRoute: (route: string) => boolean;
  // Retorna os módulos que o usuário pode acessar
  accessibleModules: ActiveModuleId[];
  // Retorna as features de um módulo que o usuário pode acessar
  getAccessibleFeatures: (moduleId: ActiveModuleId) => string[];
  // ====== GRUPO ======
  groupPermissions: GroupPermissions | null;
  groupCanAccessRoute: (route: string) => boolean;
  groupCanEdit: (route: string) => boolean;
  groupCanCreate: (route: string) => boolean;
  groupCanDelete: (route: string) => boolean;
  groupOcultarValores: (route: string) => boolean;
  groupOcultarDocumentos: (route: string) => boolean;
  isSomenteVisualizacao: boolean;
  isOcultarDadosSensiveis: boolean;
  hasGroup: boolean;
}

const PermissionsContext = createContext<PermissionsContextType>({
  isAdminMaster: false,
  isLoading: true,
  moduleAccess: {},
  canAccessModule: () => false,
  isModuleAdmin: () => false,
  canAccessFeature: () => false,
  canAccessRoute: () => false,
  accessibleModules: [],
  getAccessibleFeatures: () => [],
  groupPermissions: null,
  groupCanAccessRoute: () => false,
  groupCanEdit: () => false,
  groupCanCreate: () => false,
  groupCanDelete: () => false,
  groupOcultarValores: () => false,
  groupOcultarDocumentos: () => false,
  isSomenteVisualizacao: false,
  isOcultarDadosSensiveis: false,
  hasGroup: false,
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = trpc.userManagement.getMyPermissions.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const isAdminMaster = data?.isAdminMaster ?? false;
  const permissions = data?.permissions ?? [];
  const groupPermissions = (data?.groupPermissions as GroupPermissions | null | undefined) ?? null;
  const moduleAccess = (data?.moduleAccess ?? {}) as Record<string, "admin" | "viewer">;

  // Mapa de permissões granulares (sistema legado)
  const permMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of permissions) {
      map.set(`${p.moduleId}:${p.featureKey}`, p.canAccess);
    }
    return map;
  }, [permissions]);

  // Mapa de permissões de grupo por rota
  const groupRouteMap = useMemo(() => {
    const map = new Map<string, GroupRoutePermission>();
    if (groupPermissions?.routes) {
      for (const r of groupPermissions.routes) {
        map.set(r.rota, r);
      }
    }
    return map;
  }, [groupPermissions]);

  const hasGroup = !!groupPermissions && groupPermissions.groups.length > 0;

  // Novo: verifica se tem acesso ao módulo pelo sistema simplificado
  const canAccessModule = (moduleId: ActiveModuleId | string): boolean => {
    if (isAdminMaster) return true;
    // Novo sistema: verificar moduleAccess JSON
    if (moduleAccess[moduleId]) return true;
    // Fallback: sistema legado por grupo
    if (hasGroup) {
      const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
      if (!mod) return false;
      return mod.features.some(f => groupRouteMap.has(f.route) && !!groupRouteMap.get(f.route)?.canView);
    }
    // Fallback: sistema legado por permissões granulares
    if (permissions.length === 0) return false;
    const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
    if (!mod) return false;
    return mod.features.some(f => permMap.get(`${moduleId}:${f.key}`) === true);
  };

  // Novo: verifica se é admin no módulo (vs somente visualizador)
  const isModuleAdmin = (moduleId: ActiveModuleId | string): boolean => {
    if (isAdminMaster) return true;
    return moduleAccess[moduleId] === "admin";
  };

  const canAccessFeature = (moduleId: ActiveModuleId, featureKey: string): boolean => {
    if (isAdminMaster) return true;
    // Se tem acesso ao módulo pelo novo sistema, pode acessar a feature
    if (moduleAccess[moduleId]) return true;
    // Fallback: sistema legado
    if (permissions.length === 0) return false;
    return permMap.get(`${moduleId}:${featureKey}`) === true;
  };

  const accessibleModules = useMemo(() => {
    if (isAdminMaster) return MODULE_DEFINITIONS.map(m => m.id);
    return MODULE_DEFINITIONS.filter(m => canAccessModule(m.id)).map(m => m.id);
  }, [isAdminMaster, moduleAccess, permMap, groupRouteMap, hasGroup]);

  const canAccessRoute = (route: string): boolean => {
    if (isAdminMaster) return true;
    if (SHARED_FEATURES.some(f => f.route === route)) {
      return accessibleModules.length > 0;
    }
    if (ADMIN_FEATURES.some(f => f.route === route)) {
      return true;
    }
    for (const mod of MODULE_DEFINITIONS) {
      const feat = mod.features.find(f => f.route === route);
      if (feat) {
        return canAccessModule(mod.id);
      }
    }
    return false;
  };

  const getAccessibleFeatures = (moduleId: ActiveModuleId): string[] => {
    if (isAdminMaster) {
      const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
      return mod ? mod.features.map(f => f.key) : [];
    }
    // Novo sistema: se tem acesso ao módulo, tem acesso a todas as features
    if (moduleAccess[moduleId]) {
      const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
      return mod ? mod.features.map(f => f.key) : [];
    }
    // Fallback legado
    const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
    if (!mod) return [];
    return mod.features.filter(f => permMap.get(`${moduleId}:${f.key}`) === true).map(f => f.key);
  };

  // ====== FUNÇÕES DE GRUPO ======
  const groupCanAccessRoute = (route: string): boolean => {
    if (isAdminMaster) return true;
    if (!hasGroup) return true;
    if (groupRouteMap.has(route)) return !!groupRouteMap.get(route)?.canView;
    const basePath = route.split('?')[0];
    return groupRouteMap.has(basePath) && !!groupRouteMap.get(basePath)?.canView;
  };

  const getGroupPerm = (route: string) => {
    let perm = groupRouteMap.get(route);
    if (!perm && route.includes('?')) perm = groupRouteMap.get(route.split('?')[0]);
    return perm;
  };

  const groupCanEdit = (route: string): boolean => {
    if (isAdminMaster) return true;
    if (!hasGroup) return true;
    const perm = getGroupPerm(route);
    if (!perm) return !groupPermissions!.somenteVisualizacao;
    return perm.canEdit;
  };

  const groupCanCreate = (route: string): boolean => {
    if (isAdminMaster) return true;
    if (!hasGroup) return true;
    const perm = getGroupPerm(route);
    if (!perm) return !groupPermissions!.somenteVisualizacao;
    return perm.canCreate;
  };

  const groupCanDelete = (route: string): boolean => {
    if (isAdminMaster) return true;
    if (!hasGroup) return true;
    const perm = getGroupPerm(route);
    if (!perm) return !groupPermissions!.somenteVisualizacao;
    return perm.canDelete;
  };

  const groupOcultarValores = (route: string): boolean => {
    if (isAdminMaster) return false;
    if (!hasGroup) return false;
    const perm = getGroupPerm(route);
    if (perm) return perm.ocultarValores;
    return groupPermissions!.ocultarDadosSensiveis;
  };

  const groupOcultarDocumentos = (route: string): boolean => {
    if (isAdminMaster) return false;
    if (!hasGroup) return false;
    const perm = getGroupPerm(route);
    if (perm) return perm.ocultarDocumentos;
    return false;
  };

  const isSomenteVisualizacao = !isAdminMaster && hasGroup && !!groupPermissions?.somenteVisualizacao;
  const isOcultarDadosSensiveis = !isAdminMaster && hasGroup && !!groupPermissions?.ocultarDadosSensiveis;

  return (
    <PermissionsContext.Provider
      value={{
        isAdminMaster,
        isLoading,
        moduleAccess,
        canAccessModule,
        isModuleAdmin,
        canAccessFeature,
        canAccessRoute,
        accessibleModules,
        getAccessibleFeatures,
        groupPermissions,
        groupCanAccessRoute,
        groupCanEdit,
        groupCanCreate,
        groupCanDelete,
        groupOcultarValores,
        groupOcultarDocumentos,
        isSomenteVisualizacao,
        isOcultarDadosSensiveis,
        hasGroup,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
