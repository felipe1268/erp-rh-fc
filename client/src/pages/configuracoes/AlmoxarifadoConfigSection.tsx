import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Warehouse, Tag, ExternalLink, ChevronRight } from "lucide-react";

export function AlmoxarifadoConfigSection() {
  const [, navigate] = useLocation();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const { data: categorias = [] } = trpc.compras.listarCategorias.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: contagens = {} as Record<string, number> } =
    trpc.compras.contarItensPorCategoria.useQuery({ companyId }, { enabled: !!companyId });

  const totalItens = Object.values(contagens).reduce((a, b) => a + Number(b || 0), 0);
  const semCategoria = Number(contagens["__sem__"] ?? 0);

  return (
    <div className="border rounded-lg overflow-hidden border-emerald-200">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-xs font-bold text-emerald-700 uppercase tracking-wider border-b border-emerald-200">
        <Warehouse className="w-4 h-4" />
        Almoxarifado
      </div>

      <button
        onClick={() => navigate("/almoxarifado/categorias")}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-emerald-50/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Tag className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-medium text-gray-800 text-sm flex items-center gap-2 flex-wrap">
              Categorias do Almoxarifado
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-mono">
                {categorias.length} {categorias.length === 1 ? "categoria" : "categorias"}
              </span>
              {semCategoria > 0 && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-mono">
                  ⚠ {semCategoria} sem categoria
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Criar, renomear e excluir categorias. Ao excluir, os itens vão para "Sem categoria".
              {totalItens > 0 && ` • ${totalItens} ${totalItens === 1 ? "item ativo" : "itens ativos"} no total.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-emerald-600 flex-shrink-0 ml-2">
          <ExternalLink className="w-3.5 h-3.5" />
          <ChevronRight className="w-4 h-4" />
        </div>
      </button>
    </div>
  );
}
