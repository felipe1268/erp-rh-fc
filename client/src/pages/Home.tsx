import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Users, Building2, UserCheck, Palmtree, UserX, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";

export default function Home() {
  const { user } = useAuth();
  const [selectedCompany, setSelectedCompany] = useState<string>("");

  const { data: companies, isLoading: loadingCompanies } = trpc.companies.list.useQuery();
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

  const statCards = [
    { title: "Total de Colaboradores", value: stats?.total ?? 0, icon: Users, color: "text-primary" },
    { title: "Ativos", value: stats?.ativos ?? 0, icon: UserCheck, color: "text-green-400" },
    { title: "Férias", value: stats?.ferias ?? 0, icon: Palmtree, color: "text-blue-400" },
    { title: "Afastados", value: stats?.afastados ?? 0, icon: AlertTriangle, color: "text-yellow-400" },
    { title: "Licença", value: stats?.licenca ?? 0, icon: UserX, color: "text-purple-400" },
    { title: "Desligados", value: stats?.desligados ?? 0, icon: UserX, color: "text-red-400" },
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

        {/* Stat Cards */}
        {companyId ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {statCards.map(card => (
              <Card key={card.title} className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {card.title}
                  </CardTitle>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
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

        {/* Quick Info */}
        {companyId && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Módulos Ativos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Core RH</span>
                    <span className="text-green-400 text-xs font-medium bg-green-400/10 px-2 py-0.5 rounded">Ativo</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Usuários e Permissões</span>
                    <span className="text-green-400 text-xs font-medium bg-green-400/10 px-2 py-0.5 rounded">Ativo</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Auditoria do Sistema</span>
                    <span className="text-green-400 text-xs font-medium bg-green-400/10 px-2 py-0.5 rounded">Ativo</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">SST</span>
                    <span className="text-yellow-400 text-xs font-medium bg-yellow-400/10 px-2 py-0.5 rounded">Em breve</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Ponto e Folha</span>
                    <span className="text-yellow-400 text-xs font-medium bg-yellow-400/10 px-2 py-0.5 rounded">Em breve</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Atividade Recente</CardTitle>
              </CardHeader>
              <CardContent>
                <RecentActivity companyId={companyId} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function RecentActivity({ companyId }: { companyId: number }) {
  const { data: logs } = trpc.audit.list.useQuery({ companyId, limit: 5 });

  if (!logs || logs.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>;
  }

  return (
    <div className="space-y-3">
      {logs.map(log => (
        <div key={log.id} className="flex items-start gap-3 text-sm">
          <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-foreground truncate">{log.details}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {log.userName} &middot; {new Date(log.createdAt).toLocaleString("pt-BR")}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
