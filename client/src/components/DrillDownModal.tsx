import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Loader2, Users, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";

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
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const [, navigate] = useLocation();

  const { data, isLoading } = trpc.dashboards.drillDown.useQuery(
    { companyId, filterType, filterValue },
    { enabled: open && companyId > 0 && !!filterType && !!filterValue }
  );

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            {title}
            {data ? <Badge variant="secondary" className="text-xs">{data.length} funcionário{data.length !== 1 ? "s" : ""}</Badge> : null}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Nenhum funcionário encontrado para este filtro.</p>
          </div>
        ) : (
          <ScrollArea className="h-[60vh]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">#</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Nome</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Função</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Setor</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Status</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Admissão</th>
                    {(filterType === 'demissaoMes') ? (
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Demissão</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {data.map((emp: any, i: number) => (
                    <tr
                      key={emp.id}
                      className="border-b border-border/50 hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => { navigate(`/raio-x/${emp.id}`); onOpenChange(false); }}
                    >
                      <td className="py-2 px-3 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                            {emp.nome?.charAt(0) || "?"}
                          </div>
                          <span className="font-medium text-sm truncate max-w-[200px]">{emp.nome}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{emp.funcao || "-"}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{emp.setor || "-"}</td>
                      <td className="py-2 px-3">
                        <Badge className={`text-[10px] ${STATUS_BADGE[emp.status] || "bg-gray-100 text-gray-700"}`}>
                          {(emp.status || "").replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground font-mono">{formatDate(emp.dataAdmissao)}</td>
                      {(filterType === 'demissaoMes') ? (
                        <td className="py-2 px-3 text-xs text-red-600 font-mono">{formatDate(emp.dataDemissao)}</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.length >= 100 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Mostrando os primeiros 100 resultados</p>
            ) : null}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
