import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  HardHat, Users, Search, ArrowRightLeft, UserPlus, AlertTriangle,
  Building2, CheckCircle, XCircle, Clock, MapPin, ChevronRight,
  Loader2, UserMinus, History, BarChart3,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

export default function ObraEfetivo() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;

  const [activeTab, setActiveTab] = useState("efetivo");
  const [search, setSearch] = useState("");
  const [selectedObraId, setSelectedObraId] = useState<number | null>(null);
  const [allocDialogOpen, setAllocDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [inconsistenciaDialogOpen, setInconsistenciaDialogOpen] = useState(false);
  const [selectedInconsistencia, setSelectedInconsistencia] = useState<any>(null);
  const [obsInconsistencia, setObsInconsistencia] = useState("");
  const [allocForm, setAllocForm] = useState({ employeeId: 0, obraId: 0, dataInicio: new Date().toISOString().split("T")[0], motivo: "" });
  const [historyEmployeeId, setHistoryEmployeeId] = useState<number | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  // Queries
  const obrasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: !!companyId });
  const obrasAtivas = obrasQ.data ?? [];
  const efetivoQ = trpc.obras.efetivoPorObra.useQuery({ companyId }, { enabled: !!companyId });
  const efetivo = efetivoQ.data ?? [];
  const semObraQ = trpc.obras.semObra.useQuery({ companyId }, { enabled: !!companyId });
  const semObra = semObraQ.data ?? [];
  const inconsistenciasQ = trpc.obras.inconsistencias.useQuery({ companyId }, { enabled: !!companyId });
  const inconsistencias = inconsistenciasQ.data ?? [];
  const inconsistenciasCountQ = trpc.obras.inconsistenciasCount.useQuery({ companyId }, { enabled: !!companyId });
  const inconsistenciasCount = inconsistenciasCountQ.data ?? 0;

  // Funcionários da obra selecionada
  const funcObraQ = trpc.obras.funcionarios.useQuery({ obraId: selectedObraId || 0 }, { enabled: !!selectedObraId });
  const funcObra = funcObraQ.data ?? [];

  // Histórico de alocações
  const historyQ = trpc.obras.employeeHistory.useQuery({ employeeId: historyEmployeeId || 0 }, { enabled: !!historyEmployeeId });
  const history = historyQ.data ?? [];

  // Mutations
  const allocMut = trpc.obras.allocateEmployee.useMutation({
    onSuccess: (data) => {
      toast.success(data.isTransferencia ? "Funcionário transferido com sucesso!" : "Funcionário alocado com sucesso!");
      efetivoQ.refetch(); semObraQ.refetch(); funcObraQ.refetch(); inconsistenciasQ.refetch(); inconsistenciasCountQ.refetch();
      setAllocDialogOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMut = trpc.obras.removeEmployee.useMutation({
    onSuccess: () => {
      toast.success("Funcionário removido da obra!");
      efetivoQ.refetch(); semObraQ.refetch(); funcObraQ.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const resolverEsporadicoMut = trpc.obras.resolverEsporadico.useMutation({
    onSuccess: () => {
      toast.success("Marcado como esporádico!");
      inconsistenciasQ.refetch(); inconsistenciasCountQ.refetch();
      setInconsistenciaDialogOpen(false);
    },
  });

  const resolverTransferirMut = trpc.obras.resolverTransferir.useMutation({
    onSuccess: () => {
      toast.success("Funcionário transferido com sucesso!");
      inconsistenciasQ.refetch(); inconsistenciasCountQ.refetch(); efetivoQ.refetch(); semObraQ.refetch();
      setInconsistenciaDialogOpen(false);
    },
  });

  // Totais
  const totalAlocados = efetivo.reduce((sum, e) => sum + (e.count || 0), 0);
  const totalObrasComEfetivo = efetivo.length;
  const totalSemObra = semObra.length;

  // Filtro
  const filteredEfetivo = useMemo(() => {
    if (!search) return efetivo;
    const s = search.toLowerCase();
    return efetivo.filter((e: any) => e.obraNome?.toLowerCase().includes(s) || e.obraCodigo?.toLowerCase().includes(s));
  }, [efetivo, search]);

  const filteredSemObra = useMemo(() => {
    if (!search) return semObra;
    const s = search.toLowerCase();
    return semObra.filter((e: any) => e.nomeCompleto?.toLowerCase().includes(s) || e.funcao?.toLowerCase().includes(s));
  }, [semObra, search]);

  const openAllocDialog = (employeeId?: number) => {
    setAllocForm({
      employeeId: employeeId || 0,
      obraId: 0,
      dataInicio: new Date().toISOString().split("T")[0],
      motivo: "",
    });
    setAllocDialogOpen(true);
  };

  const handleAlloc = () => {
    if (!allocForm.obraId) { toast.error("Selecione uma obra"); return; }
    if (!allocForm.employeeId) { toast.error("Selecione um funcionário"); return; }
    allocMut.mutate({
      obraId: allocForm.obraId,
      employeeId: allocForm.employeeId,
      companyId,
      dataInicio: allocForm.dataInicio,
      motivo: allocForm.motivo || undefined,
    });
  };

  const handleRemove = (employeeId: number, nome: string) => {
    if (confirm(`Remover ${nome} da obra atual?`)) {
      removeMut.mutate({ employeeId });
    }
  };

  const openInconsistenciaDialog = (inc: any) => {
    setSelectedInconsistencia(inc);
    setObsInconsistencia("");
    setInconsistenciaDialogOpen(true);
  };

  const openHistory = (employeeId: number) => {
    setHistoryEmployeeId(employeeId);
    setHistoryDialogOpen(true);
  };

  const tipoLabel: Record<string, string> = {
    alocacao: "Alocação",
    transferencia: "Transferência",
    retorno: "Retorno",
    saida: "Saída",
    temporario: "Temporário",
  };

  const tipoColor: Record<string, string> = {
    alocacao: "bg-green-100 text-green-800",
    transferencia: "bg-blue-100 text-blue-800",
    retorno: "bg-purple-100 text-purple-800",
    saida: "bg-red-100 text-red-800",
    temporario: "bg-yellow-100 text-yellow-800",
  };

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
              <HardHat className="h-6 w-6 text-[#1B2A4A]" />
              Efetivo por Obra
            </h1>
            <p className="text-muted-foreground text-sm">Gestão de alocação de mão de obra nas obras</p>
          </div>
          <div className="flex items-center gap-2">
            <PrintActions title="Efetivo por Obra" />
            <Button onClick={() => openAllocDialog()} className="bg-[#1B2A4A] hover:bg-[#243660]">
              <UserPlus className="h-4 w-4 mr-2" /> Alocar Funcionário
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalAlocados}</p>
                  <p className="text-xs text-muted-foreground">Alocados</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-green-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalObrasComEfetivo}</p>
                  <p className="text-xs text-muted-foreground">Obras com Efetivo</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <UserMinus className="h-5 w-5 text-amber-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalSemObra}</p>
                  <p className="text-xs text-muted-foreground">Sem Obra</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={inconsistenciasCount > 0 ? "border-red-200 bg-red-50/30" : ""}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${inconsistenciasCount > 0 ? "bg-red-100" : "bg-gray-100"}`}>
                  <AlertTriangle className={`h-5 w-5 ${inconsistenciasCount > 0 ? "text-red-700" : "text-gray-500"}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{inconsistenciasCount}</p>
                  <p className="text-xs text-muted-foreground">Inconsistências</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar obra ou funcionário..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="efetivo" className="gap-2">
              <BarChart3 className="h-4 w-4" /> Efetivo por Obra
            </TabsTrigger>
            <TabsTrigger value="sem-obra" className="gap-2">
              <UserMinus className="h-4 w-4" /> Sem Obra ({totalSemObra})
            </TabsTrigger>
            <TabsTrigger value="inconsistencias" className="gap-2 relative">
              <AlertTriangle className="h-4 w-4" /> Inconsistências
              {inconsistenciasCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full h-5 w-5 flex items-center justify-center font-bold">
                  {inconsistenciasCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Tab: Efetivo por Obra */}
          <TabsContent value="efetivo" className="space-y-4 mt-4">
            {filteredEfetivo.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <HardHat className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="font-semibold text-lg">Nenhum efetivo alocado</h3>
                  <p className="text-muted-foreground text-sm mt-1">Aloque funcionários nas obras para visualizar o efetivo.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredEfetivo.map((item: any) => (
                  <Card
                    key={item.obraId}
                    className={`cursor-pointer hover:shadow-md transition-shadow ${selectedObraId === item.obraId ? "ring-2 ring-[#1B2A4A]" : ""}`}
                    onClick={() => setSelectedObraId(selectedObraId === item.obraId ? null : item.obraId)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base truncate">{item.obraNome}</h3>
                          {item.obraCodigo && <p className="text-xs text-muted-foreground">{item.obraCodigo}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            item.obraStatus === "Em_Andamento" ? "bg-green-100 text-green-800" :
                            item.obraStatus === "Planejamento" ? "bg-blue-100 text-blue-800" :
                            "bg-gray-100 text-gray-800"
                          }`}>
                            {item.obraStatus?.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                      {item.obraCidade && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
                          <MapPin className="h-3.5 w-3.5" /> {item.obraCidade}
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-3 border-t">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-[#1B2A4A]" />
                          <span className="text-2xl font-bold text-[#1B2A4A]">{item.count}</span>
                          <span className="text-sm text-muted-foreground">funcionários</span>
                        </div>
                        <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform ${selectedObraId === item.obraId ? "rotate-90" : ""}`} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Lista de funcionários da obra selecionada */}
            {selectedObraId && (
              <Card className="mt-4">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      Funcionários em {efetivo.find((e: any) => e.obraId === selectedObraId)?.obraNome || ""}
                    </CardTitle>
                    <Button size="sm" onClick={() => { setAllocForm(f => ({ ...f, obraId: selectedObraId })); setAllocDialogOpen(true); }} className="bg-[#1B2A4A] hover:bg-[#243660]">
                      <UserPlus className="h-3.5 w-3.5 mr-1" /> Alocar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {funcObraQ.isLoading ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                  ) : funcObra.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum funcionário alocado nesta obra.</p>
                  ) : (
                    <div className="space-y-2">
                      {funcObra.map((f: any) => (
                        <div key={f.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-50">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{f.employee?.nomeCompleto || "—"}</p>
                            <p className="text-xs text-muted-foreground">
                              {f.funcaoNaObra || f.employee?.funcao || f.employee?.cargo || "—"}
                              {f.dataInicio && ` · Desde ${new Date(f.dataInicio + "T12:00:00").toLocaleDateString("pt-BR")}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openHistory(f.employeeId)}>
                              <History className="h-3.5 w-3.5 mr-1" /> Histórico
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setAllocForm({ employeeId: f.employeeId, obraId: 0, dataInicio: new Date().toISOString().split("T")[0], motivo: "" }); setAllocDialogOpen(true); }}>
                              <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Transferir
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => handleRemove(f.employeeId, f.employee?.nomeCompleto || "")}>
                              <UserMinus className="h-3.5 w-3.5 mr-1" /> Remover
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Sem Obra */}
          <TabsContent value="sem-obra" className="space-y-4 mt-4">
            {filteredSemObra.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <CheckCircle className="h-12 w-12 text-green-500/50 mb-4" />
                  <h3 className="font-semibold text-lg">Todos os funcionários estão alocados</h3>
                  <p className="text-muted-foreground text-sm mt-1">Nenhum funcionário ativo sem obra principal.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50">
                          <th className="text-left p-3 font-medium">Funcionário</th>
                          <th className="text-left p-3 font-medium">Função / Cargo</th>
                          <th className="text-left p-3 font-medium">Setor</th>
                          <th className="text-left p-3 font-medium">Admissão</th>
                          <th className="text-right p-3 font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSemObra.map((emp: any) => (
                          <tr key={emp.id} className="border-b hover:bg-slate-50">
                            <td className="p-3 font-medium">{emp.nomeCompleto}</td>
                            <td className="p-3 text-muted-foreground">{emp.funcao || emp.cargo || "—"}</td>
                            <td className="p-3 text-muted-foreground">{emp.setor || "—"}</td>
                            <td className="p-3 text-muted-foreground">
                              {emp.dataAdmissao ? new Date(emp.dataAdmissao + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                            </td>
                            <td className="p-3 text-right">
                              <Button size="sm" variant="outline" onClick={() => openAllocDialog(emp.id)}>
                                <UserPlus className="h-3.5 w-3.5 mr-1" /> Alocar
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Inconsistências */}
          <TabsContent value="inconsistencias" className="space-y-4 mt-4">
            {inconsistencias.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <CheckCircle className="h-12 w-12 text-green-500/50 mb-4" />
                  <h3 className="font-semibold text-lg">Nenhuma inconsistência pendente</h3>
                  <p className="text-muted-foreground text-sm mt-1">Todos os registros de ponto estão consistentes com as alocações.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-red-50">
                          <th className="text-left p-3 font-medium">Data</th>
                          <th className="text-left p-3 font-medium">Funcionário</th>
                          <th className="text-left p-3 font-medium">Obra Alocada</th>
                          <th className="text-left p-3 font-medium">Obra do Ponto</th>
                          <th className="text-left p-3 font-medium">SN</th>
                          <th className="text-right p-3 font-medium">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inconsistencias.map((inc: any) => (
                          <tr key={inc.id} className="border-b hover:bg-red-50/50">
                            <td className="p-3 font-mono text-xs">
                              {inc.dataPonto ? new Date(inc.dataPonto + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                            </td>
                            <td className="p-3">
                              <p className="font-medium">{inc.employeeName || "—"}</p>
                              <p className="text-xs text-muted-foreground">{inc.employeeFuncao || ""}</p>
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {inc.obraAlocadaNome || "Sem alocação"}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                {inc.obraPontoNome || "—"}
                              </Badge>
                            </td>
                            <td className="p-3 font-mono text-xs">{inc.snRelogio || "—"}</td>
                            <td className="p-3 text-right">
                              <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => openInconsistenciaDialog(inc)}>
                                Resolver
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog: Alocar/Transferir Funcionário */}
      <Dialog open={allocDialogOpen} onOpenChange={setAllocDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              {allocForm.employeeId ? "Alocar / Transferir Funcionário" : "Alocar Funcionário"}
            </DialogTitle>
            <DialogDescription>
              Selecione o funcionário e a obra de destino.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!allocForm.employeeId && (
              <div>
                <Label>Funcionário</Label>
                <Select value={allocForm.employeeId ? String(allocForm.employeeId) : "0"} onValueChange={v => setAllocForm(f => ({ ...f, employeeId: Number(v) }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {semObra.map((emp: any) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>{emp.nomeCompleto} - {emp.funcao || emp.cargo || "Sem função"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Obra de Destino</Label>
              <Select value={allocForm.obraId ? String(allocForm.obraId) : "0"} onValueChange={v => setAllocForm(f => ({ ...f, obraId: Number(v) }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
                <SelectContent>
                  {obrasAtivas.map((obra: any) => (
                    <SelectItem key={obra.id} value={String(obra.id)}>{obra.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data de Início</Label>
              <Input type="date" value={allocForm.dataInicio} onChange={e => setAllocForm(f => ({ ...f, dataInicio: e.target.value }))} />
            </div>
            <div>
              <Label>Motivo (opcional)</Label>
              <Textarea value={allocForm.motivo} onChange={e => setAllocForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Ex: Transferência por demanda da obra" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAlloc} disabled={allocMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
              {allocMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Resolver Inconsistência */}
      <Dialog open={inconsistenciaDialogOpen} onOpenChange={setInconsistenciaDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Resolver Inconsistência de Ponto
            </DialogTitle>
            <DialogDescription>
              O funcionário bateu ponto em uma obra diferente da sua alocação principal.
            </DialogDescription>
          </DialogHeader>
          {selectedInconsistencia && (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Funcionário:</span>
                  <span className="text-sm font-medium">{selectedInconsistencia.employeeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Data do Ponto:</span>
                  <span className="text-sm font-mono">{selectedInconsistencia.dataPonto ? new Date(selectedInconsistencia.dataPonto + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Obra Alocada:</span>
                  <Badge variant="outline" className="bg-blue-50 text-blue-700">{selectedInconsistencia.obraAlocadaNome}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Obra do Ponto:</span>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700">{selectedInconsistencia.obraPontoNome}</Badge>
                </div>
              </div>
              <div>
                <Label>Observações (opcional)</Label>
                <Textarea value={obsInconsistencia} onChange={e => setObsInconsistencia(e.target.value)} placeholder="Adicione uma observação..." rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="border-green-200 text-green-700 hover:bg-green-50 h-auto py-3"
                  onClick={() => resolverEsporadicoMut.mutate({ id: selectedInconsistencia.id, observacoes: obsInconsistencia || undefined })}
                  disabled={resolverEsporadicoMut.isPending}
                >
                  <div className="text-center">
                    <Clock className="h-5 w-5 mx-auto mb-1" />
                    <p className="font-medium text-sm">Foi Esporádico</p>
                    <p className="text-[10px] text-muted-foreground">Manter na obra atual</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="border-blue-200 text-blue-700 hover:bg-blue-50 h-auto py-3"
                  onClick={() => resolverTransferirMut.mutate({ id: selectedInconsistencia.id, observacoes: obsInconsistencia || undefined })}
                  disabled={resolverTransferirMut.isPending}
                >
                  <div className="text-center">
                    <ArrowRightLeft className="h-5 w-5 mx-auto mb-1" />
                    <p className="font-medium text-sm">Transferir</p>
                    <p className="text-[10px] text-muted-foreground">Mover para {selectedInconsistencia.obraPontoNome}</p>
                  </div>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Histórico de Alocações */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Alocações
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto py-2">
            {historyQ.isLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum histórico de alocação encontrado.</p>
            ) : (
              history.map((h: any) => (
                <div key={h.id} className="flex items-start gap-3 p-3 rounded-lg border">
                  <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 mt-0.5 ${tipoColor[h.tipo] || "bg-gray-100 text-gray-800"}`}>
                    {tipoLabel[h.tipo] || h.tipo}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{h.obraNome || "Obra desconhecida"}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.dataInicio ? new Date(h.dataInicio + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                      {h.dataFim ? ` → ${new Date(h.dataFim + "T12:00:00").toLocaleDateString("pt-BR")}` : " → Atual"}
                    </p>
                    {h.motivoTransferencia && <p className="text-xs text-muted-foreground mt-1">{h.motivoTransferencia}</p>}
                    {h.registradoPor && <p className="text-[10px] text-muted-foreground mt-0.5">Por: {h.registradoPor}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
