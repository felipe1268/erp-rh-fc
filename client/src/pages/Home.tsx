import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Users, Building2, UserCheck, Palmtree, UserX, AlertTriangle, ShieldCheck, HardHat, Truck, ClipboardCheck, Activity, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const { user } = useAuth();
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [, navigate] = useLocation();

  const { data: companies } = trpc.companies.list.useQuery();
  const companyId = selectedCompany ? parseInt(selectedCompany) : companies?.[0]?.id;

  useEffect(() => {
    if (companies && companies.length > 0 && !selectedCompany) {
      setSelectedCompany(String(companies[0].id));
    }
  }, [companies, selectedCompany]);

  const { data: stats } = trpc.employees.stats.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );

  const { data: sstStats } = trpc.sst.stats.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );

  const { data: logs } = trpc.audit.list.useQuery(
    { companyId, limit: 8 },
    { enabled: !!companyId }
  );

  const rhCards = [
    { title: "Total", value: stats?.total ?? 0, icon: Users, color: "bg-blue-500", textColor: "text-blue-600" },
    { title: "Ativos", value: stats?.ativos ?? 0, icon: UserCheck, color: "bg-green-500", textColor: "text-green-600" },
    { title: "Férias", value: stats?.ferias ?? 0, icon: Palmtree, color: "bg-cyan-500", textColor: "text-cyan-600" },
    { title: "Afastados", value: stats?.afastados ?? 0, icon: AlertTriangle, color: "bg-yellow-500", textColor: "text-yellow-600" },
    { title: "Licença", value: stats?.licenca ?? 0, icon: UserX, color: "bg-purple-500", textColor: "text-purple-600" },
    { title: "Desligados", value: stats?.desligados ?? 0, icon: UserX, color: "bg-red-500", textColor: "text-red-600" },
  ];

  const sstCards = [
    { title: "ASOs Válidos", value: (sstStats as any)?.asosValidos ?? 0, icon: ShieldCheck, color: "bg-green-500", textColor: "text-green-600" },
    { title: "ASOs Vencidos", value: sstStats?.asosVencidos ?? 0, icon: AlertTriangle, color: "bg-red-500", textColor: "text-red-600", alert: (sstStats?.asosVencidos ?? 0) > 0 },
    { title: "Treinamentos Ativos", value: (sstStats as any)?.treinamentosAtivos ?? 0, icon: HardHat, color: "bg-blue-500", textColor: "text-blue-600" },
    { title: "Trein. a Vencer (30d)", value: sstStats?.treinamentosVencer ?? 0, icon: Clock, color: "bg-orange-500", textColor: "text-orange-600", alert: (sstStats?.treinamentosVencer ?? 0) > 0 },
    { title: "Acidentes no Mês", value: sstStats?.acidentesMes ?? 0, icon: Activity, color: "bg-red-500", textColor: "text-red-600" },
    { title: "Advertências no Mês", value: sstStats?.advertenciasMes ?? 0, icon: ClipboardCheck, color: "bg-yellow-500", textColor: "text-yellow-600" },
  ];

  const modules = [
    { title: "Core RH", desc: "Cadastro de colaboradores", status: "Ativo", path: "/colaboradores" },
    { title: "SST", desc: "Segurança e Saúde", status: "Ativo", path: "/sst" },
    { title: "Ponto e Folha", desc: "Controle de ponto e folha", status: "Ativo", path: "/ponto-folha" },
    { title: "Ativos", desc: "Frota e equipamentos", status: "Ativo", path: "/ativos" },
    { title: "Qualidade", desc: "Auditorias e desvios", status: "Ativo", path: "/auditoria-qualidade" },
    { title: "CIPA", desc: "Comissão interna", status: "Ativo", path: "/cipa" },
    { title: "Avaliação", desc: "Desempenho de equipe", status: "Em breve", path: "#" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Bem-vindo(a), {user?.name ?? "Usuário"}
            </p>
          </div>
          <div className="w-full sm:w-72">
            <Select value={selectedCompany} onValueChange={setSelectedCompany}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies?.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nomeFantasia || c.razaoSocial}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {companyId ? (
          <>
            {/* RH Stats */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recursos Humanos</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {rhCards.map(card => (
                  <Card key={card.title} className="bg-card border-border hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate("/colaboradores")}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-lg ${card.color}/10 flex items-center justify-center`}>
                          <card.icon className={`h-5 w-5 ${card.textColor}`} />
                        </div>
                        <div>
                          <p className={`text-2xl font-bold ${card.textColor}`}>{card.value}</p>
                          <p className="text-xs text-muted-foreground">{card.title}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* SST Stats */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Segurança e Saúde do Trabalho</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {sstCards.map(card => (
                  <Card key={card.title} className={`bg-card border-border hover:shadow-md transition-shadow cursor-pointer ${card.alert ? "border-red-300 bg-red-50" : ""}`} onClick={() => navigate("/sst")}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-lg ${card.color}/10 flex items-center justify-center`}>
                          <card.icon className={`h-5 w-5 ${card.textColor}`} />
                        </div>
                        <div>
                          <p className={`text-2xl font-bold ${card.textColor}`}>{card.value}</p>
                          <p className="text-xs text-muted-foreground">{card.title}</p>
                        </div>
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
                  <CardTitle className="text-sm font-semibold">Módulos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {modules.map(m => (
                      <div key={m.title} className="flex items-center justify-between cursor-pointer hover:bg-accent/50 rounded-lg px-2 py-1.5 transition-colors" onClick={() => m.path !== "#" && navigate(m.path)}>
                        <div>
                          <p className="text-sm font-medium">{m.title}</p>
                          <p className="text-xs text-muted-foreground">{m.desc}</p>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${m.status === "Ativo" ? "text-green-600 bg-green-100" : "text-yellow-600 bg-yellow-100"}`}>
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
