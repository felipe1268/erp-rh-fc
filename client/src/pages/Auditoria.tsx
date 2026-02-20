import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { FileText } from "lucide-react";
import { useState, useEffect } from "react";

const actionColors: Record<string, string> = {
  CREATE: "bg-green-400/10 text-green-400",
  UPDATE: "bg-blue-400/10 text-blue-400",
  DELETE: "bg-red-400/10 text-red-400",
};

const actionLabels: Record<string, string> = {
  CREATE: "Criação",
  UPDATE: "Atualização",
  DELETE: "Exclusão",
};

export default function Auditoria() {
  const [selectedCompany, setSelectedCompany] = useState<string>("all");
  const { data: companies } = trpc.companies.list.useQuery();
  const companyId = selectedCompany !== "all" ? parseInt(selectedCompany) : undefined;

  const { data: logs, isLoading } = trpc.audit.list.useQuery({ companyId, limit: 200 });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Auditoria do Sistema</h1>
            <p className="text-muted-foreground text-sm mt-1">Registro de todas as ações realizadas no sistema</p>
          </div>
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger className="w-56 bg-card border-border">
              <SelectValue placeholder="Filtrar por empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {companies?.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.nomeFantasia || c.razaoSocial}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <Card className="bg-card border-border animate-pulse"><CardContent className="h-64" /></Card>
        ) : logs && logs.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data/Hora</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Usuário</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ação</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Módulo</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-t border-border hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 font-medium">{log.userName ?? "Sistema"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${actionColors[log.action] ?? "bg-gray-400/10 text-gray-400"}`}>
                        {actionLabels[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{log.module}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell max-w-xs truncate">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum registro de auditoria</h3>
              <p className="text-muted-foreground text-sm">As ações realizadas no sistema aparecerão aqui.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
