import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { FolderOpen, Search, Users, FileText, AlertTriangle, Download } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

export default function ControleDocumentos() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const [search, setSearch] = useState("");

  const { data: employees = [] } = trpc.employees.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // Filtrar colaboradores com documentos pendentes (sem CPF, RG, etc.)
  const employeesWithMissingDocs = useMemo(() => {
    return (employees as any[]).filter((emp: any) => {
      const missing = [];
      if (!emp.cpf) missing.push("CPF");
      if (!emp.rg) missing.push("RG");
      if (!emp.ctps) missing.push("CTPS");
      if (!emp.pis) missing.push("PIS");
      if (!emp.tituloEleitor) missing.push("Título Eleitor");
      if (!emp.certReservista) missing.push("Cert. Reservista");
      return missing.length > 0;
    });
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    if (!search) return employees as any[];
    const s = search.toLowerCase();
    return (employees as any[]).filter((emp: any) =>
      emp.nomeCompleto?.toLowerCase().includes(s) ||
      emp.cpf?.toLowerCase().includes(s) ||
      emp.funcao?.toLowerCase().includes(s)
    );
  }, [employees, search]);

  const getMissingDocs = (emp: any) => {
    const missing = [];
    if (!emp.cpf) missing.push("CPF");
    if (!emp.rg) missing.push("RG");
    if (!emp.ctps) missing.push("CTPS");
    if (!emp.pis) missing.push("PIS");
    if (!emp.tituloEleitor) missing.push("Título Eleitor");
    if (!emp.certReservista && emp.sexo === "M") missing.push("Cert. Reservista");
    return missing;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Controle de Documentos</h1>
            <p className="text-muted-foreground text-sm">Acompanhamento de documentos dos colaboradores</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{(employees as any[]).length}</p>
                  <p className="text-xs text-muted-foreground">Total Colaboradores</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{(employees as any[]).length - employeesWithMissingDocs.length}</p>
                  <p className="text-xs text-muted-foreground">Docs Completos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{employeesWithMissingDocs.length}</p>
                  <p className="text-xs text-muted-foreground">Docs Pendentes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, CPF ou função..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Situação Documental dos Colaboradores</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredEmployees.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <FolderOpen className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground text-sm">
                  {!companyId ? "Selecione uma empresa." : "Nenhum colaborador encontrado."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium">Colaborador</th>
                      <th className="pb-2 font-medium">Função</th>
                      <th className="pb-2 font-medium">CPF</th>
                      <th className="pb-2 font-medium">RG</th>
                      <th className="pb-2 font-medium">CTPS</th>
                      <th className="pb-2 font-medium">PIS</th>
                      <th className="pb-2 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((emp: any) => {
                      const missing = getMissingDocs(emp);
                      return (
                        <tr key={emp.id} className="border-b last:border-0">
                          <td className="py-2 font-medium">{emp.nomeCompleto}</td>
                          <td className="py-2 text-muted-foreground">{emp.funcao || "-"}</td>
                          <td className="py-2">{emp.cpf ? <span className="text-green-600">OK</span> : <span className="text-red-500">Falta</span>}</td>
                          <td className="py-2">{emp.rg ? <span className="text-green-600">OK</span> : <span className="text-red-500">Falta</span>}</td>
                          <td className="py-2">{emp.ctps ? <span className="text-green-600">OK</span> : <span className="text-red-500">Falta</span>}</td>
                          <td className="py-2">{emp.pis ? <span className="text-green-600">OK</span> : <span className="text-red-500">Falta</span>}</td>
                          <td className="py-2">
                            {missing.length === 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">Completo</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">
                                {missing.length} pendência(s)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
