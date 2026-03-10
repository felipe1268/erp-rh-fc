import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Loader2, Users } from "lucide-react";
import { useLocation } from "wouter";
import FullScreenDialog from "@/components/FullScreenDialog";

interface DrillDownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  filterType: string;
  filterValue: string;
}

const STATUS_BADGE: Record<string, string> = {
  Ativo: "bg-green-100 text-green-700",
  Ferias: "bg-blue-100 text-blue-700",
  Afastado: "bg-yellow-100 text-yellow-700",
  Licenca: "bg-purple-100 text-purple-700",
  Desligado: "bg-red-100 text-red-700",
  Recluso: "bg-gray-100 text-gray-700",
  Lista_Negra: "bg-black text-white",
};

export default function DrillDownModal({ open, onOpenChange, title, filterType, filterValue }: DrillDownModalProps) {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const [, navigate] = useLocation();

  const { data, isLoading } = trpc.dashboards.drillDown.useQuery(
    { companyId: queryCompanyId, filterType, filterValue, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: open && (isConstrutoras ? companyIds.length > 0 : companyId > 0) && !!filterType && !!filterValue }
  );

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
  };

  return (
    <FullScreenDialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      icon={<Users className="h-5 w-5 text-white" />}
    >
      <div className="w-full max-w-6xl mx-auto">
        {/* Header com contagem */}
        {data && (
          <div className="flex items-center gap-3 mb-4">
            <Badge variant="secondary" className="text-sm px-3 py-1">
              {data.length} funcionário{data.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-base">Nenhum funcionário encontrado para este filtro.</p>
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-xl border shadow-sm">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">#</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Nome</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">CPF</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Função</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Setor</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Admissão</th>
                  {filterType === "demissaoMes" && (
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Demissão</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.map((emp: any, i: number) => (
                  <tr
                    key={emp.id}
                    className="border-b border-gray-100 hover:bg-blue-50/50 cursor-pointer transition-colors"
                    onClick={() => { navigate(`/raio-x/${emp.id}`); onOpenChange(false); }}
                  >
                    <td className="py-3 px-4 text-xs text-gray-400 font-mono">{i + 1}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                          {emp.nome?.charAt(0) || "?"}
                        </div>
                        <span className="font-semibold text-sm text-gray-800">{emp.nome}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500 font-mono">{emp.cpf || "-"}</td>
                    <td className="py-3 px-4 text-xs text-gray-600">{emp.funcao || "-"}</td>
                    <td className="py-3 px-4 text-xs text-gray-600">{emp.setor || "-"}</td>
                    <td className="py-3 px-4">
                      <Badge className={`text-[10px] ${STATUS_BADGE[emp.status] || "bg-gray-100 text-gray-700"}`}>
                        {(emp.status || "").replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500 font-mono">{formatDate(emp.dataAdmissao)}</td>
                    {filterType === "demissaoMes" && (
                      <td className="py-3 px-4 text-xs text-red-600 font-mono">{formatDate(emp.dataDemissao)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length >= 100 && (
              <p className="text-xs text-muted-foreground text-center py-4 border-t">Mostrando os primeiros 100 resultados</p>
            )}
          </div>
        )}
      </div>
    </FullScreenDialog>
  );
}
