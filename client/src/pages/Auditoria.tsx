import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/dateUtils";
import { FileText, Trash2, RotateCcw, AlertTriangle, Clock, User, Building2, Search, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";

const actionColors: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
  RESTORE: "bg-emerald-100 text-emerald-700",
  PERMANENT_DELETE: "bg-red-200 text-red-900",
};

const actionLabels: Record<string, string> = {
  CREATE: "Criação",
  UPDATE: "Atualização",
  DELETE: "Exclusão",
  RESTORE: "Restauração",
  PERMANENT_DELETE: "Exclusão Permanente",
};

function formatCPF(cpf: string | null | undefined): string {
  if (!cpf) return "-";
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return cpf;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

export default function Auditoria() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;
  const [activeTab, setActiveTab] = useState("logs");
  const [searchLogs, setSearchLogs] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState<number | null>(null);

  const { data: logs, isLoading: logsLoading } = trpc.audit.list.useQuery({ companyId, limit: 500 });
  const { data: deletedEmployees, isLoading: deletedLoading, refetch: refetchDeleted } = trpc.employees.listDeleted.useQuery({ companyId });
  const utils = trpc.useUtils();

  const restoreMut = trpc.employees.restore.useMutation({
    onSuccess: () => {
      toast.success("Colaborador restaurado com sucesso!");
      refetchDeleted();
      utils.employees.list.invalidate();
      utils.employees.stats.invalidate();
      utils.audit.list.invalidate();
      setConfirmRestore(null);
    },
    onError: (err) => toast.error(`Erro ao restaurar: ${err.message}`),
  });

  const permanentDeleteMut = trpc.employees.permanentDelete.useMutation({
    onSuccess: () => {
      toast.success("Colaborador excluído permanentemente.");
      refetchDeleted();
      utils.audit.list.invalidate();
      setConfirmPermanentDelete(null);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const filteredLogs = logs?.filter(log => {
    if (!searchLogs) return true;
    const s = searchLogs.toLowerCase();
    return (log.userName?.toLowerCase().includes(s) || log.details?.toLowerCase().includes(s) || log.module?.toLowerCase().includes(s) || log.action?.toLowerCase().includes(s));
  });

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Auditoria do Sistema</h1>
            <p className="text-muted-foreground text-sm mt-1">Registro de ações e lixeira de colaboradores excluídos</p>
          </div>
          <PrintActions title="Auditoria do Sistema" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="logs" className="gap-1.5">
              <FileText className="h-4 w-4" /> Logs de Auditoria
              {logs ? <Badge variant="secondary" className="ml-1 text-xs">{logs.length}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="lixeira" className="gap-1.5">
              <Trash2 className="h-4 w-4" /> Lixeira
              {deletedEmployees ? <Badge variant={deletedEmployees.length > 0 ? "destructive" : "secondary"} className="ml-1 text-xs">{deletedEmployees.length}</Badge> : null}
            </TabsTrigger>
          </TabsList>

          {/* ============ LOGS DE AUDITORIA ============ */}
          <TabsContent value="logs" className="mt-4">
            {/* Barra de busca */}
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar nos logs..."
                  value={searchLogs}
                  onChange={e => setSearchLogs(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-background"
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {filteredLogs?.length || 0} registros
              </span>
            </div>

            {logsLoading ? (
              <Card className="animate-pulse"><CardContent className="h-64" /></Card>
            ) : filteredLogs && filteredLogs.length > 0 ? (
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
                    {filteredLogs.map(log => (
                      <tr key={log.id} className="border-t border-border hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-medium">{log.userName ?? "Sistema"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${actionColors[log.action] ?? "bg-gray-100 text-gray-600"}`}>
                            {actionLabels[log.action] ?? log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{log.module}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell max-w-md truncate">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhum registro de auditoria</h3>
                  <p className="text-muted-foreground text-sm">As ações realizadas no sistema aparecerão aqui.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ============ LIXEIRA ============ */}
          <TabsContent value="lixeira" className="mt-4">
            {/* Aviso */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800 text-sm">Lixeira de Colaboradores</p>
                <p className="text-xs text-amber-700 mt-1">
                  Colaboradores excluídos ficam aqui por tempo indeterminado. Você pode <strong>restaurá-los</strong> a qualquer momento.
                  A exclusão permanente remove todos os dados e <strong>não pode ser desfeita</strong>.
                </p>
              </div>
            </div>

            {deletedLoading ? (
              <Card className="animate-pulse"><CardContent className="h-64" /></Card>
            ) : deletedEmployees && deletedEmployees.length > 0 ? (
              <div className="space-y-3">
                {deletedEmployees.map((emp: any) => (
                  <Card key={emp.id} className="border-red-200 bg-red-50/30">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="bg-red-100 p-2 rounded-lg shrink-0">
                            <User className="h-5 w-5 text-red-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-gray-900">{emp.nomeCompleto}</h3>
                              <Badge variant="destructive" className="text-[10px]">Excluído</Badge>
                              {emp.status === "Lista_Negra" ? <Badge className="bg-black text-white text-[10px]">Blacklist</Badge> : null}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 mt-2 text-xs text-gray-600">
                              <span><strong>CPF:</strong> {formatCPF(emp.cpf)}</span>
                              <span><strong>Função:</strong> {emp.funcao || emp.cargo || "-"}</span>
                              <span><strong>Status anterior:</strong> {emp.status}</span>
                              <span><strong>Admissão:</strong> {formatDate(emp.dataAdmissao)}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs text-red-600">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Excluído em: {formatDateTime(emp.deletedAt)}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                Por: {emp.deletedBy || "Sistema"}
                              </span>
                            </div>
                            {emp.deleteReason ? (
                              <p className="text-xs text-red-700 mt-1 bg-red-100 px-2 py-1 rounded">
                                <strong>Motivo:</strong> {emp.deleteReason}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          {confirmRestore === emp.id ? (
                            <div className="flex flex-col gap-1">
                              <p className="text-xs text-green-700 font-semibold">Confirmar restauração?</p>
                              <div className="flex gap-1">
                                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-xs h-7" onClick={() => restoreMut.mutate({ id: emp.id, companyId: emp.companyId })} disabled={restoreMut.isPending}>
                                  {restoreMut.isPending ? "..." : "Sim"}
                                </Button>
                                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setConfirmRestore(null)}>Não</Button>
                              </div>
                            </div>
                          ) : (
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1.5 text-xs" onClick={() => setConfirmRestore(emp.id)}>
                              <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                            </Button>
                          )}
                          {confirmPermanentDelete === emp.id ? (
                            <div className="flex flex-col gap-1">
                              <p className="text-xs text-red-700 font-semibold">Excluir PERMANENTEMENTE?</p>
                              <div className="flex gap-1">
                                <Button size="sm" variant="destructive" className="text-xs h-7" onClick={() => permanentDeleteMut.mutate({ id: emp.id, companyId: emp.companyId })} disabled={permanentDeleteMut.isPending}>
                                  {permanentDeleteMut.isPending ? "..." : "Sim, excluir"}
                                </Button>
                                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setConfirmPermanentDelete(null)}>Não</Button>
                              </div>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 gap-1.5 text-xs" onClick={() => setConfirmPermanentDelete(emp.id)}>
                              <Trash2 className="h-3.5 w-3.5" /> Excluir Permanente
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Trash2 className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Lixeira vazia</h3>
                  <p className="text-muted-foreground text-sm">Nenhum colaborador excluído. Colaboradores excluídos aparecerão aqui para possível restauração.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
