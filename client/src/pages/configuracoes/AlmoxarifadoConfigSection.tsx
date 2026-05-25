import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Warehouse, Tag, ExternalLink, ChevronRight, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AlmoxarifadoConfigSection() {
  const [, navigate] = useLocation();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const { data: categorias = [] } = trpc.compras.listarCategorias.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: contagens = {} as Record<string, number>, refetch: refetchCount } =
    trpc.compras.contarItensPorCategoria.useQuery({ companyId }, { enabled: !!companyId });

  const utils = trpc.useUtils();
  const limparMut = trpc.compras.limparCategoriasOrfas.useMutation({
    onSuccess: (r: any) => {
      const n = Number(r?.itensMigrados ?? 0);
      if (n === 0) {
        toast.success("Nenhuma categoria órfã encontrada — tudo limpo!");
      } else {
        const cats = (r?.categoriasOrfas ?? []).map((o: any) => `"${o.categoria}"`).join(", ");
        toast.success(`${n} ${n === 1 ? "item movido" : "itens movidos"} para "Sem categoria". Categorias removidas: ${cats}.`);
      }
      refetchCount();
      utils.compras.listarCategoriasAlmoxarifado.invalidate({ companyId });
      utils.compras.listarItens.invalidate();
      utils.compras.listarItensConsolidado.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalItens = Object.values(contagens).reduce((a, b) => a + Number(b || 0), 0);
  const semCategoria = Number(contagens["__sem__"] ?? 0);
  const nomesCadastrados = new Set(categorias.map(c => c.nome));
  const orfas = Object.entries(contagens)
    .filter(([k]) => k !== "__sem__" && !nomesCadastrados.has(k))
    .map(([k, v]) => ({ categoria: k, total: Number(v) }))
    .sort((a, b) => b.total - a.total);
  const totalOrfaos = orfas.reduce((s, o) => s + o.total, 0);

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

      {/* Rev. 2395 — Banner de categorias órfãs (itens com string de categoria que não existe mais) */}
      {orfas.length > 0 && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                {totalOrfaos} {totalOrfaos === 1 ? "item está marcado" : "itens estão marcados"} com categoria que não existe mais
              </p>
              <p className="text-xs text-amber-800 mt-1">
                {orfas.slice(0, 5).map(o => `"${o.categoria}" (${o.total})`).join(", ")}
                {orfas.length > 5 && ` e mais ${orfas.length - 5}…`}
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Mover {totalOrfaos === 1 ? "este item" : "estes itens"} para "Sem categoria" para você reclassificar depois.
              </p>
            </div>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0"
              onClick={() => limparMut.mutate({ companyId })}
              disabled={limparMut.isPending}
            >
              {limparMut.isPending
                ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Movendo…</>
                : "Mover para Sem categoria"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
