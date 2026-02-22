import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { UtensilsCrossed, Search, Upload, FileSpreadsheet, CalendarDays, Users, DollarSign } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { formatCPF } from "@/lib/formatters";
import RaioXFuncionario from "@/components/RaioXFuncionario";

export default function ValeAlimentacao() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
const now = new Date();
  const [mesAno, setMesAno] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [search, setSearch] = useState("");
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);

  // Buscar colaboradores para listar benefícios
  const employeesQ = trpc.employees.list.useQuery({ companyId }, { enabled: !!companyId });
  const employees = (employeesQ.data ?? []) as any[];
  const activeEmployees = employees.filter((e: any) => e.status === "Ativo");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Vale Alimentação</h1>
            <p className="text-muted-foreground text-sm">Gestão de vale alimentação e refeição - IFood Benefícios</p>
          </div>
          <div className="flex items-center gap-3">
            <PrintActions title="Vale Alimentação" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <input
              type="month"
              value={mesAno}
              onChange={e => setMesAno(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <Button variant="outline" onClick={() => toast("Em breve", { description: "Importação de planilha IFood em desenvolvimento." })}>
            <Upload className="h-4 w-4 mr-2" /> Importar IFood
          </Button>
          <Button variant="outline" onClick={() => toast("Em breve", { description: "Exportação em desenvolvimento." })}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Exportar
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeEmployees.length}</p>
                  <p className="text-xs text-muted-foreground">Colaboradores Ativos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <UtensilsCrossed className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">0</p>
                  <p className="text-xs text-muted-foreground">Beneficiários {mesAno}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">R$ 0,00</p>
                  <p className="text-xs text-muted-foreground">Total {mesAno}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar colaborador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Colaboradores - Vale Alimentação ({mesAno})</CardTitle>
          </CardHeader>
          <CardContent>
            {activeEmployees.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <UtensilsCrossed className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground text-sm">Nenhum colaborador ativo encontrado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium">Colaborador</th>
                      <th className="pb-2 font-medium">CPF</th>
                      <th className="pb-2 font-medium">Cargo</th>
                      <th className="pb-2 font-medium">Valor VA</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeEmployees
                      .filter((e: any) => {
                        if (!search) return true;
                        const s = search.toLowerCase();
                        return e.nomeCompleto?.toLowerCase().includes(s) || e.cpf?.includes(s);
                      })
                      .map((e: any) => (
                        <tr key={e.id} className="border-b last:border-0">
                          <td className="py-2 font-medium text-blue-700 cursor-pointer hover:underline" onClick={() => setRaioXEmployeeId(e.id)}>{e.nomeCompleto}</td>
                          <td className="py-2">{formatCPF(e.cpf)}</td>
                          <td className="py-2">{e.cargo || "-"}</td>
                          <td className="py-2">-</td>
                          <td className="py-2">
                            <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">Pendente</span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
    </DashboardLayout>
  );
}
