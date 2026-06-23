import { createContext, useContext, ReactNode, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { MODULE_DEFINITIONS, SHARED_FEATURES, ADMIN_FEATURES, type ActiveModuleId } from "../../../shared/modules";
import { normalizeModulePerm, ROUTE_TO_PAGEID, MODULE_PAGE_CONFIG, type ModulePerm } from "../../../shared/modulePages";

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
  // Rev. 2207 — flag opt-in pra ver o status "Aviso Prévio" do colaborador
  verStatusAviso?: boolean;
}

interface GroupPermissions {
  groups: GroupInfo[];
  routes: GroupRoutePermission[];
  somenteVisualizacao: boolean;
  ocultarDadosSensiveis: boolean;
}

interface PermissionsContextType {
  isAdminMaster: boolean;
  // Rev. 2901 — role === 'admin' (NÃO master). Pra gates que liberam admin+master.
  isAdmin: boolean;
  isLoading: boolean;
  // ── Acesso por obra (data-row level) ──
  // null  => sem restrição (Admin Master)
  // []    => nenhuma obra liberada (não vê nada baseado em obra)
  // [..]  => apenas obras desta lista
  allowedObraIds: number[] | null;
  canAccessObra: (obraId: number | null | undefined) => boolean;
  // ── Acesso por módulo (novo sistema) ──
  moduleAccess: Record<string, unknown>;
  canAccessModule: (moduleId: ActiveModuleId | string) => boolean;
  isModuleAdmin: (moduleId: ActiveModuleId | string) => boolean;
  // ── Permissões de página (nível granular) ──
  canViewPage:   (moduleId: string, pageId: string) => boolean;
  canCreatePage: (moduleId: string, pageId: string) => boolean;
  canEditPage:   (moduleId: string, pageId: string) => boolean;
  canDeletePage: (moduleId: string, pageId: string) => boolean;
  // ── Dados sensíveis LGPD ──
  isSensitiveHidden: (moduleId: string, flagId: string) => boolean;
  // ── Features legadas ──
  canAccessFeature: (moduleId: ActiveModuleId, featureKey: string) => boolean;
  canAccessRoute: (route: string) => boolean;
  accessibleModules: ActiveModuleId[];
  getAccessibleFeatures: (moduleId: ActiveModuleId) => string[];
  // ── Grupo ──
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
  // Permissões especiais de módulo
  canEditEpiCentral: boolean;
}

const PermissionsContext = createContext<PermissionsContextType>({
  isAdminMaster: false,
  isAdmin: false,
  isLoading: true,
  allowedObraIds: null,
  canAccessObra: () => false,
  moduleAccess: {},
  canAccessModule: () => false,
  isModuleAdmin: () => false,
  canViewPage:   () => false,
  canCreatePage: () => false,
  canEditPage:   () => false,
  canDeletePage: () => false,
  isSensitiveHidden: () => false,
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
  canEditEpiCentral: false,
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = trpc.userManagement.getMyPermissions.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const isAdminMaster = data?.isAdminMaster ?? false;
  const isAdmin = (data as any)?.isAdmin ?? false;
  const permissions = data?.permissions ?? [];
  const groupPermissions = (data?.groupPermissions as GroupPermissions | null | undefined) ?? null;
  const rawModuleAccess = (data?.moduleAccess ?? {}) as Record<string, unknown>;
  // null = sem restrição (admin master); array = obras liberadas (vazio = nada)
  const allowedObraIds: number[] | null = isAdminMaster
    ? null
    : (Array.isArray((data as any)?.allowedObraIds) ? ((data as any).allowedObraIds as number[]) : []);
  const canAccessObra = (obraId: number | null | undefined): boolean => {
    if (allowedObraIds === null) return true;
    if (obraId == null) return false;
    return allowedObraIds.includes(Number(obraId));
  };

  // Flag: o grupo do usuário tem permissões no novo sistema (module_access)
  const groupHasNewSystem = rawModuleAccess.__groupHasNewSystem === true;

  // Normaliza o mapa raw → Record<string, ModulePerm> (exclui flags internas)
  const normalizedAccess = useMemo<Record<string, ModulePerm | null>>(() => {
    const result: Record<string, ModulePerm | null> = {};
    for (const [moduleId, val] of Object.entries(rawModuleAccess)) {
      if (moduleId.startsWith("__")) continue;
      result[moduleId] = normalizeModulePerm(moduleId, val);
    }
    return result;
  }, [rawModuleAccess]);

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

  // ── Acesso ao módulo ──────────────────────────────────────────────────────
  const canAccessModule = (moduleId: ActiveModuleId | string): boolean => {
    if (isAdminMaster) return true;
    const perm = normalizedAccess[moduleId];
    if (perm != null) {
      if (perm.level === "admin" || perm.level === "viewer") return true;
      return Object.values(perm.pages || {}).some(p => p.view);
    }
    if (moduleId === 'juridico-trabalhista') {
      const parentPerm = normalizedAccess['juridico'];
      if (parentPerm != null) {
        if (parentPerm.level === "admin" || parentPerm.level === "viewer") return true;
        return Object.values(parentPerm.pages || {}).some(p => p.view);
      }
    }
    // Fallback grupo legado — apenas quando o grupo NÃO usa o novo sistema de module_access
    if (hasGroup && !groupHasNewSystem) {
      const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
      if (!mod) return false;
      return mod.features.some(f => groupRouteMap.has(f.route) && !!groupRouteMap.get(f.route)?.canView);
    }
    // Fallback legado (sem grupo)
    if (permissions.length === 0) return false;
    const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
    if (!mod) return false;
    return mod.features.some(f => permMap.get(`${moduleId}:${f.key}`) === true);
  };

  const isModuleAdmin = (moduleId: ActiveModuleId | string): boolean => {
    if (isAdminMaster) return true;
    const perm = normalizedAccess[moduleId];
    if (!perm) return false;
    return perm.level === "admin";
  };

  // ── Permissões por página ─────────────────────────────────────────────────
  const getPagePerm = (moduleId: string, pageId: string) => {
    const perm = normalizedAccess[moduleId]
      ?? (moduleId === 'juridico-trabalhista' ? normalizedAccess['juridico'] : null);
    if (!perm) return null;
    return perm.pages?.[pageId] ?? null;
  };

  const resolveModulePerm = (moduleId: string) => {
    const perm = normalizedAccess[moduleId];
    if (perm) return perm;
    if (moduleId === 'juridico-trabalhista') return normalizedAccess['juridico'] ?? null;
    return null;
  };

  const canViewPage = (moduleId: string, pageId: string): boolean => {
    if (isAdminMaster) return true;
    const perm = resolveModulePerm(moduleId);
    if (!perm) return false;
    if (perm.level === "admin" || perm.level === "viewer") return true;
    const page = getPagePerm(moduleId, pageId);
    // Rev. 2541 — Propagação de melhorias: página AUSENTE da perm custom = feature
    // nova adicionada DEPOIS que o acesso do usuário foi configurado. Como toda
    // perm custom nasce completa (defaultPagesForLevel grava todas as páginas
    // existentes na época), ausência ⇒ "feature nova", não "negada de propósito"
    // (negação intencional grava {view:false} e fica PRESENTE). Página PRESENTE
    // respeita o flag explícito. AUSENTE herda o acesso ao módulo — MAS só quando
    // o módulo está efetivamente acessível (mesma regra de canAccessModule:
    // ALGUMA página com view:true). Assim um custom com TUDO negado não ganha a
    // feature nova por URL direta (fecha brecha de sobre-exposição).
    if (page == null) return Object.values(perm.pages || {}).some(p => p.view);
    return page.view ?? false;
  };

  const canCreatePage = (moduleId: string, pageId: string): boolean => {
    if (isAdminMaster) return true;
    const perm = resolveModulePerm(moduleId);
    if (!perm) return false;
    if (perm.level === "admin") return true;
    if (perm.level === "viewer") return false;
    const page = getPagePerm(moduleId, pageId);
    return page?.create ?? false;
  };

  const canEditPage = (moduleId: string, pageId: string): boolean => {
    if (isAdminMaster) return true;
    const perm = resolveModulePerm(moduleId);
    if (!perm) return false;
    if (perm.level === "admin") return true;
    if (perm.level === "viewer") return false;
    const page = getPagePerm(moduleId, pageId);
    return page?.edit ?? false;
  };

  const canDeletePage = (moduleId: string, pageId: string): boolean => {
    if (isAdminMaster) return true;
    const perm = resolveModulePerm(moduleId);
    if (!perm) return false;
    if (perm.level === "admin") return true;
    if (perm.level === "viewer") return false;
    const page = getPagePerm(moduleId, pageId);
    return page?.delete ?? false;
  };

  // ── Permissões especiais de módulo ───────────────────────────────────────
  // true se o grupo do usuário concedeu explicitamente a permissão extra no módulo sst
  const canEditEpiCentral = !!(normalizedAccess['sst']?.extras?.['canEditEpiCentral']);

  // ── Dados sensíveis LGPD ──────────────────────────────────────────────────
  const isSensitiveHidden = (moduleId: string, flagId: string): boolean => {
    if (isAdminMaster) return false;
    const perm = normalizedAccess[moduleId];
    if (!perm) return false;
    return perm.sensitiveHidden?.includes(flagId) ?? false;
  };

  // ── Features legadas ──────────────────────────────────────────────────────
  const canAccessFeature = (moduleId: ActiveModuleId, featureKey: string): boolean => {
    if (isAdminMaster) return true;
    if (normalizedAccess[moduleId]) return true;
    if (permissions.length === 0) return false;
    return permMap.get(`${moduleId}:${featureKey}`) === true;
  };

  const accessibleModules = useMemo(() => {
    if (isAdminMaster) return MODULE_DEFINITIONS.map(m => m.id);
    return MODULE_DEFINITIONS.filter(m => canAccessModule(m.id)).map(m => m.id);
  }, [isAdminMaster, normalizedAccess, permMap, groupRouteMap, hasGroup, groupHasNewSystem]);

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
      if (feat) return canAccessModule(mod.id);
    }
    return false;
  };

  const getAccessibleFeatures = (moduleId: ActiveModuleId): string[] => {
    if (isAdminMaster) {
      const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
      return mod ? mod.features.map(f => f.key) : [];
    }
    if (normalizedAccess[moduleId]) {
      const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
      return mod ? mod.features.map(f => f.key) : [];
    }
    const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
    if (!mod) return [];
    return mod.features.filter(f => permMap.get(`${moduleId}:${f.key}`) === true).map(f => f.key);
  };

  // ── Grupo ─────────────────────────────────────────────────────────────────
  const getGroupPerm = (route: string) => {
    let perm = groupRouteMap.get(route);
    if (!perm && route.includes("?")) perm = groupRouteMap.get(route.split("?")[0]);
    return perm;
  };

  const resolveRouteToModulePage = (route: string): { moduleId: string; pageId: string } | null => {
    const basePath = route.split("?")[0];
    const tabMatch = route.match(/[?&]tab=([^&]+)/);
    for (const [moduleId, routeMap] of Object.entries(ROUTE_TO_PAGEID)) {
      if (!routeMap) continue;
      if (tabMatch) {
        const tabKey = `${basePath}?tab=${tabMatch[1]}`;
        for (const [routePattern, pageId] of Object.entries(routeMap)) {
          if (routePattern === tabKey || routePattern.endsWith(`?tab=${tabMatch[1]}`)) {
            return { moduleId, pageId };
          }
        }
      }
      const pageId = routeMap[basePath] ?? routeMap[route];
      if (pageId) return { moduleId, pageId };
    }
    for (const mod of MODULE_DEFINITIONS) {
      if (mod.features.some(f => f.route === basePath || f.route === route)) {
        return { moduleId: mod.id, pageId: "" };
      }
    }
    return null;
  };

  const groupCanAccessRoute = (route: string): boolean => {
    if (isAdminMaster) return true;
    if (!hasGroup) return true;

    const basePath = route.split("?")[0];

    // Novo sistema (module_access salvo via Usuarios.tsx): tem prioridade total
    if (groupHasNewSystem) {
      // Features compartilhadas (empresas, obras, setores…) — visíveis se houver ALGUM módulo liberado
      if (SHARED_FEATURES.some(f => f.route === route || f.route === basePath)) {
        return Object.keys(normalizedAccess).length > 0;
      }

      // Verifica qual módulo "dono" desta rota
      // Rev. 1763: compara também strippando query string das features cadastradas
      // (ex.: feature.route='/programas-sst?tab=PGR' precisa casar com basePath
      // '/programas-sst' quando o RouteGuard chama sem o ?tab=...).
      const mod = MODULE_DEFINITIONS.find(m =>
        m.features.some(f => {
          const fBase = (f.route || "").split("?")[0];
          return f.route === route || f.route === basePath || fBase === basePath;
        })
      );
      if (!mod) return false;

      const perm = normalizedAccess[mod.id]
        ?? (mod.id === 'juridico-trabalhista' ? normalizedAccess['juridico'] : null);
      if (!perm) return false;

      if (perm.level === "admin" || perm.level === "viewer") return true;

      const moduleRouteMap = ROUTE_TO_PAGEID[mod.id];
      if (!moduleRouteMap) {
        // Módulo sem mapeamento de rotas: permitir se o módulo estiver liberado
        return true;
      }
      // Tenta a rota completa (com query string) primeiro, depois o basePath
      // — query-tabs precisam de granularidade por aba quando registradas no mapa.
      const pageId = moduleRouteMap[route] ?? moduleRouteMap[basePath];
      if (!pageId) {
        // Rev. 1763: Se a rota base não tem entrada direta mas EXISTEM entradas de
        // tab pra ela (ex.: /programas-sst só está mapeado como ?tab=PGR/PCMSO/LTCAT),
        // libera quando QUALQUER aba dessa base estiver granted. Sem isso o
        // RouteGuard de /programas-sst nega tudo pra usuários custom.
        const tabPageIds = Object.entries(moduleRouteMap)
          .filter(([k]) => k.split("?")[0] === basePath && k.includes("?"))
          .map(([, v]) => v);
        if (tabPageIds.length > 0) {
          // Rev. 2541 — se NENHUMA das abas existe na perm (todas novas), herda o
          // acesso ao módulo SÓ quando o módulo está efetivamente acessível
          // (alguma página com view:true); caso contrário respeita os flags.
          const anyPresent = tabPageIds.some(pid => perm.pages?.[pid] != null);
          if (!anyPresent) return Object.values(perm.pages || {}).some(p => p.view === true);
          return tabPageIds.some(pid => perm.pages?.[pid]?.view === true);
        }
        // Rota dentro do módulo sem mapeamento de página específico → nega por segurança
        return false;
      }
      // Rev. 2541 — página AUSENTE (= feature nova) herda o acesso ao módulo SÓ
      // quando o módulo está efetivamente acessível (alguma página com view:true);
      // página PRESENTE respeita o flag explícito (deny intencional continua deny).
      // Sem o gate, um custom com TUDO negado abriria a rota nova por URL direta.
      if (perm.pages?.[pageId] == null) return Object.values(perm.pages || {}).some(p => p.view === true);
      return perm.pages[pageId].view === true;
    }

    // Sistema legado (user_group_permissions salvo via GruposUsuarios.tsx)
    if (groupRouteMap.has(route)) return !!groupRouteMap.get(route)?.canView;
    return groupRouteMap.has(basePath) && !!groupRouteMap.get(basePath)?.canView;
  };

  const groupCanEdit = (route: string): boolean => {
    if (isAdminMaster) return true;
    if (!hasGroup) return true;
    if (groupHasNewSystem) {
      const resolved = resolveRouteToModulePage(route);
      if (!resolved) return false;
      const perm = normalizedAccess[resolved.moduleId];
      if (!perm) return false;
      if (perm.level === "admin") return true;
      if (perm.level === "viewer") return false;
      if (!resolved.pageId) return false;
      return perm.pages?.[resolved.pageId]?.edit ?? false;
    }
    const perm = getGroupPerm(route);
    if (!perm) return !groupPermissions!.somenteVisualizacao;
    return perm.canEdit;
  };

  const groupCanCreate = (route: string): boolean => {
    if (isAdminMaster) return true;
    if (!hasGroup) return true;
    if (groupHasNewSystem) {
      const resolved = resolveRouteToModulePage(route);
      if (!resolved) return false;
      const perm = normalizedAccess[resolved.moduleId];
      if (!perm) return false;
      if (perm.level === "admin") return true;
      if (perm.level === "viewer") return false;
      if (!resolved.pageId) return false;
      return perm.pages?.[resolved.pageId]?.create ?? false;
    }
    const perm = getGroupPerm(route);
    if (!perm) return !groupPermissions!.somenteVisualizacao;
    return perm.canCreate;
  };

  const groupCanDelete = (route: string): boolean => {
    if (isAdminMaster) return true;
    if (!hasGroup) return true;
    if (groupHasNewSystem) {
      const resolved = resolveRouteToModulePage(route);
      if (!resolved) return false;
      const perm = normalizedAccess[resolved.moduleId];
      if (!perm) return false;
      if (perm.level === "admin") return true;
      if (perm.level === "viewer") return false;
      if (!resolved.pageId) return false;
      return perm.pages?.[resolved.pageId]?.delete ?? false;
    }
    const perm = getGroupPerm(route);
    if (!perm) return !groupPermissions!.somenteVisualizacao;
    return perm.canDelete;
  };

  const groupOcultarValores = (route: string): boolean => {
    if (isAdminMaster) return false;
    if (!hasGroup) return false;
    if (groupHasNewSystem) {
      const resolved = resolveRouteToModulePage(route);
      if (!resolved) return false;
      const perm = normalizedAccess[resolved.moduleId];
      if (!perm) return false;
      const config = MODULE_PAGE_CONFIG[resolved.moduleId];
      if (!config?.sensitiveFlags) return false;
      return config.sensitiveFlags.some(f => perm.sensitiveHidden?.includes(f.id));
    }
    const perm = getGroupPerm(route);
    if (perm) return perm.ocultarValores;
    return groupPermissions!.ocultarDadosSensiveis;
  };

  const groupOcultarDocumentos = (route: string): boolean => {
    if (isAdminMaster) return false;
    if (!hasGroup) return false;
    if (groupHasNewSystem) {
      const resolved = resolveRouteToModulePage(route);
      if (!resolved) return false;
      const perm = normalizedAccess[resolved.moduleId];
      if (!perm) return false;
      return perm.sensitiveHidden?.includes("documentos_confidenciais") ||
             perm.sensitiveHidden?.includes("documentos_rh") || false;
    }
    const perm = getGroupPerm(route);
    if (perm) return perm.ocultarDocumentos;
    return false;
  };

  const isSomenteVisualizacao = useMemo(() => {
    if (isAdminMaster) return false;
    if (!hasGroup) return false;
    if (groupHasNewSystem) {
      for (const perm of Object.values(normalizedAccess)) {
        if (!perm) continue;
        if (perm.level === "admin") return false;
        if (perm.level === "custom") {
          const hasWrite = Object.values(perm.pages || {}).some(p => p.create || p.edit || p.delete);
          if (hasWrite) return false;
        }
      }
      return true;
    }
    return !!groupPermissions?.somenteVisualizacao;
  }, [isAdminMaster, hasGroup, groupHasNewSystem, normalizedAccess, groupPermissions]);

  const isOcultarDadosSensiveis = useMemo(() => {
    if (isAdminMaster) return false;
    if (!hasGroup) return false;
    if (groupHasNewSystem) {
      for (const perm of Object.values(normalizedAccess)) {
        if (!perm) continue;
        if (perm.sensitiveHidden && perm.sensitiveHidden.length > 0) return true;
      }
      return false;
    }
    return !!groupPermissions?.ocultarDadosSensiveis;
  }, [isAdminMaster, hasGroup, groupHasNewSystem, normalizedAccess, groupPermissions]);

  return (
    <PermissionsContext.Provider
      value={{
        isAdminMaster,
        isAdmin,
        isLoading,
        allowedObraIds,
        canAccessObra,
        moduleAccess: rawModuleAccess,
        canAccessModule,
        isModuleAdmin,
        canViewPage,
        canCreatePage,
        canEditPage,
        canDeletePage,
        isSensitiveHidden,
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
        canEditEpiCentral,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
