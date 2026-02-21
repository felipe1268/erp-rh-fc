import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "erp-rh-fc-default-company";

/**
 * Hook para gerenciar a empresa padrão do usuário.
 * Salva no localStorage para persistir entre sessões.
 * 
 * Retorna:
 * - defaultCompanyId: ID da empresa padrão (string) ou null
 * - setDefaultCompany: função para definir empresa padrão
 * - clearDefaultCompany: função para remover empresa padrão
 * - getInitialCompany: função que retorna o ID da empresa padrão ou a primeira empresa disponível
 */
export function useDefaultCompany() {
  const [defaultCompanyId, setDefaultCompanyIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setDefaultCompany = useCallback((companyId: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, companyId);
      setDefaultCompanyIdState(companyId);
    } catch {
      // localStorage indisponível
    }
  }, []);

  const clearDefaultCompany = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setDefaultCompanyIdState(null);
    } catch {
      // localStorage indisponível
    }
  }, []);

  /**
   * Retorna o ID da empresa que deve ser selecionada inicialmente.
   * Prioridade: empresa padrão > primeira empresa da lista.
   */
  const getInitialCompany = useCallback((companies: { id: number }[] | undefined): string => {
    if (defaultCompanyId && companies?.some(c => String(c.id) === defaultCompanyId)) {
      return defaultCompanyId;
    }
    if (companies && companies.length > 0) {
      return String(companies[0].id);
    }
    return "";
  }, [defaultCompanyId]);

  return {
    defaultCompanyId,
    setDefaultCompany,
    clearDefaultCompany,
    getInitialCompany,
    isDefault: (companyId: string | number) => String(companyId) === defaultCompanyId,
  };
}
