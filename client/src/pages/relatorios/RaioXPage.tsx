import DashboardLayout from "@/components/DashboardLayout";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { formatCPF } from "@/lib/formatters";
import { Search, UserSearch, Users } from "lucide-react";

export default function RaioXPage() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);

  const { data: allEmployees = [] } = trpc.employees.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const activeEmployees = useMemo(() => {
    return (allEmployees as any[]).filter((e: any) => e.status === "Ativo");
  }, [allEmployees]);

  const filtered = useMemo(() => {
    if (!search) return activeEmployees;
    const s = search.toLowerCase();
    return activeEmployees.filter(
      (e: any) =>
        e.nomeCompleto?.toLowerCase().includes(s) ||
        e.cpf?.includes(s) ||
        e.funcao?.toLowerCase().includes(s)
    );
  }, [activeEmployees, search]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center">
            <UserSearch className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Raio-X do Funcionário</h1>
            <p className="text-sm text-muted-foreground">
              Selecione um colaborador para visualizar o relatório completo
            </p>
          </div>
        </div>

        {/* Busca */}
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF ou função..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Lista de funcionários */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.length === 0 ? (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum colaborador encontrado</p>
            </div>
          ) : (
            filtered.map((emp: any) => (
              <button
                key={emp.id}
                onClick={() => setSelectedEmployeeId(emp.id)}
                className="text-left p-4 rounded-lg border hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                    {emp.nomeCompleto?.charAt(0) || "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate group-hover:text-blue-700 transition-colors">
                      {emp.nomeCompleto}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatCPF(emp.cpf)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{emp.funcao || "Sem função"}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Raio-X Full Screen */}
      <RaioXFuncionario
        employeeId={selectedEmployeeId}
        open={!!selectedEmployeeId}
        onClose={() => setSelectedEmployeeId(null)}
      />
    </DashboardLayout>
  );
}
