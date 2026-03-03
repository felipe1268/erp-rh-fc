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
  // ====== GRUPO ======
  // Dados do grupo do usuário
  groupPermissions: GroupPermissions | null;
  // Verifica se o grupo pode acessar uma rota
  groupCanAccessRoute: (route: string) => boolean;
  // Verifica se o grupo pode editar na rota
  groupCanEdit: (route: string) => boolean;
  // Verifica se o grupo pode criar na rota
  groupCanCreate: (route: string) => boolean;
  // Verifica se o grupo pode excluir na rota
  groupCanDelete: (route: string) => boolean;
  // Verifica se deve ocultar valores na rota
  groupOcultarValores: (route: string) => boolean;
  // Verifica se deve ocultar documentos na rota
  groupOcultarDocumentos: (route: string) => boolean;
  // Flags globais do grupo
  isSomenteVisualizacao: boolean;
  isOcultarDadosSensiveis: boolean;
  // Verifica se o usuário pertence a algum grupo
  hasGroup: boolean;
}

const PermissionsContext = createContext<PermissionsContextType>({
  isAdminMaster: false,
  isLoading: true,
  canAccessModule: () => false,
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
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
    refetchOnWindowFocus: false,
  });

  const isAdminMaster = data?.isAdminMaster ?? false;
  const permissions = data?.permissions ?? [];
  const groupPermissions = (data?.groupPermissions as GroupPermissions | null | undefined) ?? null;

  // Construir mapa de permissões para lookup rápido
  const permMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of permissions) {
      map.set(`${p.moduleId}:${p.featureKey}`, p.canAccess);
    }
    return map;
  }, [permissions]);

  // Construir mapa de permissões de grupo por rota
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

  const canAccessModule = (moduleId: ActiveModuleId): boolean => {
    if (isAdminMaster) return true;
    // Se o usuário pertence a um grupo, usar rotas do grupo para determinar acesso ao módulo
    if (hasGroup) {
      const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
      if (!mod) return false;
      // Verificar se o grupo tem acesso a pelo menos uma rota deste módulo (qualquer rota, incluindo compartilhadas)
      return mod.features.some(f => groupRouteMap.has(f.route) && !!groupRouteMap.get(f.route)?.canView);
    }
    // Sem grupo: usar permissões individuais
    if (permissions.length === 0) return false;
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
  }, [isAdminMaster, permMap, groupRouteMap, hasGroup]);

  const getAccessibleFeatures = (moduleId: ActiveModuleId): string[] => {
    if (isAdminMaster) {
      const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
      return mod ? mod.features.map(f => f.key) : [];
    }
    const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
    if (!mod) return [];
    return mod.features.filter(f => permMap.get(`${moduleId}:${f.key}`) === true).map(f => f.key);
  };

  // ====== FUNÇÕES DE GRUPO ======
  const groupCanAccessRoute = (route: string): boolean => {
    if (isAdminMaster) return true;
    if (!hasGroup) return true; // Se não tem grupo, acesso controlado pelas permissões individuais
    // Primeiro verificar rota completa (com query params, ex: /controle-documentos?tab=advertencias)
    if (groupRouteMap.has(route)) {
      return !!groupRouteMap.get(route)?.canView;
    }
    // Fallback: verificar path base sem query params
    const basePath = route.split('?')[0];
    return groupRouteMap.has(basePath) && !!groupRouteMap.get(basePath)?.canView;
  };

  // Helper para buscar permissão de grupo: primeiro tenta rota completa, depois base path
  const getGroupPerm = (route: string) => {
    let perm = groupRouteMap.get(route);
    if (!perm && route.includes('?')) {
      perm = groupRouteMap.get(route.split('?')[0]);
    }
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
        canAccessModule,
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
