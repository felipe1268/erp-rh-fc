import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Users, Building2, UserCheck, Palmtree, UserX, AlertTriangle, Clock, BarChart3, Landmark, FolderOpen, UtensilsCrossed, Layers, Briefcase } from "lucide-react";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { selectedCompanyId, companies: companiesList } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;

  const { data: stats } = trpc.employees.stats.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );
  const { data: logs } = trpc.audit.list.useQuery(
    { companyId, limit: 8 },
    { enabled: !!companyId }
  );

  const rhCards = [
    { title: "Total Colaboradores", value: stats?.total ?? 0, icon: Users, color: "bg-blue-50", iconColor: "text-blue-600", borderColor: "border-l-blue-500" },
    { title: "Ativos", value: stats?.ativos ?? 0, icon: UserCheck, color: "bg-green-50", iconColor: "text-green-600", borderColor: "border-l-green-500" },
    { title: "Férias", value: stats?.ferias ?? 0, icon: Palmtree, color: "bg-cyan-50", iconColor: "text-cyan-600", borderColor: "border-l-cyan-500" },
    { title: "Afastados", value: stats?.afastados ?? 0, icon: AlertTriangle, color: "bg-yellow-50", iconColor: "text-yellow-600", borderColor: "border-l-yellow-500" },
    { title: "Licença", value: stats?.licenca ?? 0, icon: UserX, color: "bg-purple-50", iconColor: "text-purple-600", borderColor: "border-l-purple-500" },
    { title: "Desligados", value: stats?.desligados ?? 0, icon: UserX, color: "bg-red-50", iconColor: "text-red-600", borderColor: "border-l-red-500" },
  ];

  const modules = [
    { title: "Colaboradores", desc: "Cadastro e gestão de funcionários", status: "Ativo", path: "/colaboradores" },
    { title: "Obras", desc: "Controle de obras e alocação", status: "Ativo", path: "/obras" },
    { title: "Setores", desc: "Cadastro de setores", status: "Ativo", path: "/setores" },
    { title: "Funções", desc: "Cadastro de funções/cargos", status: "Ativo", path: "/funcoes" },
    { title: "Fechamento de Ponto", desc: "Upload e controle de ponto", status: "Ativo", path: "/fechamento-ponto" },
    { title: "Folha de Pagamento", desc: "Gestão de folha e extras", status: "Ativo", path: "/folha-pagamento" },
    { title: "Controle de Documentos", desc: "Documentos dos colaboradores", status: "Ativo", path: "/controle-documentos" },
    { title: "Vale Alimentação", desc: "Gestão de VR/VA", status: "Ativo", path: "/vale-alimentacao" },
    { title: "Dashboards", desc: "Relatórios interativos", status: "Ativo", path: "/dashboards" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Bem-vindo(a), {user?.name ?? "Usuário"}
            </p>
          </div>
        </div>

        {companyId ? (
          <>
            {/* RH Stats */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recursos Humanos</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {rhCards.map(card => (
                  <Card
                    key={card.title}
                    className={`bg-card border border-border border-l-4 ${card.borderColor} hover:shadow-md transition-shadow cursor-pointer`}
                    onClick={() => navigate("/colaboradores")}
                  >
                    <CardContent className="p-4 flex flex-col items-start gap-3">
                      <div className={`h-10 w-10 rounded-lg ${card.color} flex items-center justify-center shrink-0`}>
                        <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                      </div>
                      <div className="w-full">
                        <p className={`text-2xl font-bold ${card.iconColor}`}>{card.value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{card.title}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Modules */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Módulos do Sistema</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {modules.map(m => (
                      <div key={m.title} className="flex items-center justify-between cursor-pointer hover:bg-accent/50 rounded-lg px-3 py-2 transition-colors" onClick={() => m.path !== "#" && navigate(m.path)}>
                        <div>
                          <p className="text-sm font-medium text-foreground">{m.title}</p>
                          <p className="text-xs text-muted-foreground">{m.desc}</p>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${m.status === "Ativo" ? "text-green-600 bg-green-100" : "text-yellow-600 bg-yellow-100"}`}>
                          {m.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              {/* Recent Activity */}
              <Card className="bg-card border-border lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Atividade Recente</CardTitle>
                </CardHeader>
                <CardContent>
                  {!logs || logs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
                  ) : (
                    <div className="space-y-3">
                      {logs.map((log: any) => (
                        <div key={log.id} className="flex items-start gap-3 text-sm">
                          <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${log.action === "DELETE" ? "bg-red-500" : log.action === "CREATE" ? "bg-green-500" : "bg-blue-500"}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate">{log.details}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {log.userName} &middot; {new Date(log.createdAt).toLocaleString("pt-BR")}
                            </p>
                          </div>
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${log.action === "CREATE" ? "bg-green-100 text-green-700" : log.action === "UPDATE" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
                            {log.action === "CREATE" ? "Criou" : log.action === "UPDATE" ? "Editou" : "Excluiu"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma empresa cadastrada</h3>
              <p className="text-muted-foreground text-sm text-center max-w-md">
                Para começar, cadastre uma empresa no menu "Empresas" na barra lateral.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
