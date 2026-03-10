import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

type SavedMenuItem = { label: string; path: string; visible: boolean; originalLabel?: string };
type SavedMenuSection = { title: string; items: SavedMenuItem[] };

/**
 * Hook centralizado para verificar visibilidade de itens do menu.
 * Consulta a configuração salva no Painel de Controle do Menu
 * e expõe funções para verificar se um path está visível.
 * 
 * Deve ser usado em conjunto com permissões de grupo (usePermissions)
 * para garantir que AMBAS as verificações sejam respeitadas.
 */
export function useMenuVisibility() {
  const menuConfigQuery = trpc.menuConfig.get.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // Cache por 5 min para não sobrecarregar
    refetchOnWindowFocus: false,
  });

  const savedMenuConfig = menuConfigQuery.data as SavedMenuSection[] | null;

  // Mapa de visibilidade: path -> visible
  const visibilityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!savedMenuConfig) return map; // Se não há config salva, tudo é visível (padrão)

    for (const section of savedMenuConfig) {
      for (const item of section.items) {
        map.set(item.path, item.visible !== false);
      }
    }
    return map;
  }, [savedMenuConfig]);

  /**
   * Verifica se um path está visível no Painel de Controle do Menu.
   * Se não há configuração salva, retorna true (padrão = tudo visível).
   * Se o path não está na configuração, retorna true (item novo).
   */
  const isMenuItemVisible = (path: string): boolean => {
    if (!savedMenuConfig) return true; // Sem config = tudo visível
    if (!visibilityMap.has(path)) return true; // Path não configurado = visível
    return visibilityMap.get(path) === true;
  };

  /**
   * Verifica se um path de dashboard está visível.
   * Verifica tanto o path do dashboard quanto o path do módulo relacionado.
   */
  const isDashboardVisible = (dashPath: string, relatedMainPath?: string): boolean => {
    // Verifica o próprio dashboard
    if (!isMenuItemVisible(dashPath)) return false;
    // Se tem um path principal relacionado, verifica também
    if (relatedMainPath && !isMenuItemVisible(relatedMainPath)) return false;
    return true;
  };

  /**
   * Filtra uma lista de itens com path, removendo os invisíveis.
   */
  const filterVisibleItems = <T extends { path: string }>(items: T[]): T[] => {
    if (!savedMenuConfig) return items; // Sem config = tudo visível
    return items.filter(item => isMenuItemVisible(item.path));
  };

  return {
    isMenuItemVisible,
    isDashboardVisible,
    filterVisibleItems,
    isLoading: menuConfigQuery.isLoading,
    hasConfig: !!savedMenuConfig,
  };
}
