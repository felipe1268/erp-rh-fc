import DashboardLayout from "@/components/DashboardLayout";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { formatCPF } from "@/lib/formatters";
import { Search, UserSearch, Users, UserCheck, UserX, Clock, Shield, Ban, AlertTriangle, Palmtree, FileWarning } from "lucide-react";
import { removeAccents } from "@/lib/searchUtils";

const STATUS_OPTIONS = [
  { value: "Todos", label: "Todos", icon: Users, color: "bg-gray-100 text-gray-700 border-gray-300", activeColor: "bg-gray-700 text-white border-gray-700" },
  { value: "Ativo", label: "Ativos", icon: UserCheck, color: "bg-green-50 text-green-700 border-green-300", activeColor: "bg-green-600 text-white border-green-600" },
  { value: "Desligado", label: "Desligados", icon: UserX, color: "bg-red-50 text-red-700 border-red-300", activeColor: "bg-red-600 text-white border-red-600" },
  { value: "Afastado", label: "Afastados", icon: Clock, color: "bg-amber-50 text-amber-700 border-amber-300", activeColor: "bg-amber-600 text-white border-amber-600" },
  { value: "Ferias", label: "Férias", icon: Palmtree, color: "bg-blue-50 text-blue-700 border-blue-300", activeColor: "bg-blue-600 text-white border-blue-600" },
  { value: "Licenca", label: "Licença", icon: Shield, color: "bg-purple-50 text-purple-700 border-purple-300", activeColor: "bg-purple-600 text-white border-purple-600" },
  { value: "AvisoPrevio", label: "Aviso Prévio", icon: FileWarning, color: "bg-orange-50 text-orange-700 border-orange-300", activeColor: "bg-orange-600 text-white border-orange-600" },
  { value: "Recluso", label: "Reclusos", icon: Ban, color: "bg-gray-50 text-gray-700 border-gray-400", activeColor: "bg-gray-600 text-white border-gray-600" },
  { value: "Lista_Negra", label: "Blacklist", icon: AlertTriangle, color: "bg-red-50 text-red-800 border-red-400", activeColor: "bg-red-800 text-white border-red-800" },
];

const STATUS_BADGE_COLORS: Record<string, string> = {
  "Ativo": "bg-green-100 text-green-700",
  "Desligado": "bg-red-100 text-red-700",
  "Afastado": "bg-amber-100 text-amber-700",
  "Ferias": "bg-blue-100 text-blue-700",
  "Licenca": "bg-purple-100 text-purple-700",
  "Recluso": "bg-gray-200 text-gray-700",
  "Lista_Negra": "bg-red-200 text-red-800",
};

const STATUS_AVATAR_COLORS: Record<string, string> = {
  "Ativo": "bg-green-100 text-green-700",
  "Desligado": "bg-red-100 text-red-700",
  "Afastado": "bg-amber-100 text-amber-700",
  "Ferias": "bg-blue-100 text-blue-700",
  "Licenca": "bg-purple-100 text-purple-700",
  "Recluso": "bg-gray-200 text-gray-700",
  "Lista_Negra": "bg-red-200 text-red-800",
};

export default function RaioXPage() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);

  const { data: allEmployees = [] } = trpc.employees.list.useQuery(
    { companyId: isConstrutoras ? (companyIds[0] || 0) : companyId, companyIds: isConstrutoras ? companyIds : undefined },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );

  // Buscar avisos prévios em andamento para identificar quem está em aviso prévio
  const { data: avisosAtivos = [] } = trpc.avisoPrevio.avisoPrevio.list.useQuery(
    { companyId: isConstrutoras ? (companyIds[0] || 0) : companyId },
    { enabled: isConstrutoras ? companyIds.length > 0 : companyId > 0 }
  );

  // IDs de funcionários com aviso prévio em andamento
  const avisoPrevioEmployeeIds = useMemo(() => {
    const ids = new Set<number>();
    (avisosAtivos as any[]).forEach((a: any) => {
      if (a.status === "em_andamento") {
        ids.add(a.employeeId);
      }
    });
    return ids;
  }, [avisosAtivos]);

  // Contadores por status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { Todos: 0, AvisoPrevio: 0 };
    (allEmployees as any[]).forEach((e: any) => {
      counts.Todos = (counts.Todos || 0) + 1;
      const st = e.status || "Ativo";
      counts[st] = (counts[st] || 0) + 1;
    });
    counts.AvisoPrevio = avisoPrevioEmployeeIds.size;
    return counts;
  }, [allEmployees, avisoPrevioEmployeeIds]);

  // Filtrar por status
  const statusFiltered = useMemo(() => {
    if (statusFilter === "Todos") return allEmployees as any[];
    if (statusFilter === "AvisoPrevio") {
      return (allEmployees as any[]).filter((e: any) => avisoPrevioEmployeeIds.has(e.id));
    }
    return (allEmployees as any[]).filter((e: any) => e.status === statusFilter);
  }, [allEmployees, statusFilter, avisoPrevioEmployeeIds]);

  // Filtrar por busca
  const filtered = useMemo(() => {
    if (!search) return statusFiltered;
    const s = removeAccents(search);
    return statusFiltered.filter(
      (e: any) =>
        removeAccents(e.nomeCompleto || '').includes(s) ||
        e.cpf?.includes(s) ||
        removeAccents(e.funcao || '').includes(s) ||
        removeAccents(e.codigoInterno || '').includes(s)
    );
  }, [statusFiltered, search]);

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

        {/* Filtros por Status */}
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const count = statusCounts[opt.value] || 0;
            const isActive = statusFilter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  isActive ? opt.activeColor : opt.color
                } hover:opacity-90`}
              >
                <Icon className="h-3.5 w-3.5" />
                {opt.label}
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive ? "bg-white/20" : "bg-black/5"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Busca */}
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF, função ou Nº interno..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Contador de resultados */}
        <div className="text-sm text-muted-foreground">
          {filtered.length} colaborador{filtered.length !== 1 ? "es" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
          {statusFilter !== "Todos" ? ` com status "${STATUS_OPTIONS.find(o => o.value === statusFilter)?.label}"` : ""}
        </div>

        {/* Lista de funcionários */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.length === 0 ? (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum colaborador encontrado</p>
            </div>
          ) : (
            filtered.map((emp: any) => {
              const isEmAvisoPrevio = avisoPrevioEmployeeIds.has(emp.id);
              const avatarColor = isEmAvisoPrevio 
                ? "bg-orange-100 text-orange-700 ring-2 ring-orange-400" 
                : (STATUS_AVATAR_COLORS[emp.status] || "bg-blue-100 text-blue-700");
              const badgeColor = STATUS_BADGE_COLORS[emp.status] || "bg-gray-100 text-gray-700";
              const statusLabel = emp.status === "Ferias" ? "Férias" 
                : emp.status === "Licenca" ? "Licença"
                : emp.status === "Lista_Negra" ? "Blacklist"
                : emp.status || "Ativo";
              return (
                <button
                  key={emp.id}
                  onClick={() => setSelectedEmployeeId(emp.id)}
                  className={`text-left p-4 rounded-lg border hover:border-blue-400 hover:bg-blue-50/50 transition-all group ${
                    isEmAvisoPrevio ? "border-orange-300 bg-orange-50/30" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-full ${avatarColor} flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden`}>
                      {emp.fotoUrl ? (
                        <img src={emp.fotoUrl} alt="" className="w-full h-full object-cover object-top" />
                      ) : (
                        <>{emp.nomeCompleto?.charAt(0) || "?"}</>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate group-hover:text-blue-700 transition-colors">
                        {emp.nomeCompleto}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatCPF(emp.cpf)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{emp.funcao || "Sem função"}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeColor}`}>
                          {statusLabel}
                        </span>
                        {isEmAvisoPrevio && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700">
                            <FileWarning className="h-2.5 w-2.5" />
                            Aviso Prévio
                          </span>
                        )}
                        {emp.codigoInterno ? (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {emp.codigoInterno}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Raio-X Full Screen */}
      <RaioXFuncionario
        employeeId={selectedEmployeeId}
        open={!!selectedEmployeeId}
        onClose={() => setSelectedEmployeeId(null)}
      />
    <PrintFooterLGPD />
    </DashboardLayout>
  );
}
