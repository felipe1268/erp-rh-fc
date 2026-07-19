/**
 * Rev. 4440 — Hook para buscar as margens configuradas de documentos da empresa.
 * Retorna o objeto FcDocumentMargins com os 4 valores em mm (default 10 cada).
 * Deve ser usado em todos os callers de buildFcDocument para aplicar as margens
 * configuradas em Configurações → Central de Documentos → Configurações de Página.
 */
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import type { FcDocumentMargins } from "@/lib/fcDocumentTemplate";

export function useDocumentMargins(): FcDocumentMargins {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const query = trpc.systemDocumentTemplates.getDocumentMargins.useQuery(
    { companyId },
    { enabled: companyId > 0, staleTime: 5 * 60 * 1000 }
  );
  return {
    top:    query.data?.top    ?? 10,
    right:  query.data?.right  ?? 10,
    bottom: query.data?.bottom ?? 10,
    left:   query.data?.left   ?? 10,
  };
}
