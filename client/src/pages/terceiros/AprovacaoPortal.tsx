import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  UserCheck, UserX, Clock, CheckCircle, XCircle, Search, Filter,
  ChevronDown, ChevronUp, FileText, User, Building2, AlertTriangle,
  CheckSquare, Square, Eye
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function AprovacaoPortal() {
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [filterOrigem, setFilterOrigem] = useState<string>("todos");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [approveAction, setApproveAction] = useState<"apto" | "inapto">("apto");
  const [approveObs, setApproveObs] = useState("");
  const [approveSingleId, setApproveSingleId] = useState<number | null>(null);

  const pendentes = trpc.portalExterno.admin.listarPendentes.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );

  const aprovarMut = trpc.portalExterno.admin.aprovarFuncionario.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); pendentes.refetch(); setShowApproveDialog(false); setApproveObs(""); setApproveSingleId(null); },
    onError: (e) => toast.error(e.message),
  });

  const aprovarLoteMut = trpc.portalExterno.admin.aprovarEmLote.useMutation({
    onSuccess: (data) => { toast.success(`${data.count} funcionários atualizados!`); pendentes.refetch(); setSelectedIds([]); setShowApproveDialog(false); setApproveObs(""); },
    onError: (e) => toast.error(e.message),
  });

  const allFuncs = (pendentes.data || []) as any[];

  const filtered = useMemo(() => {
    return allFuncs.filter((f: any) => {
      const matchSearch = !search || 
        (f.nomeCompleto || f.nome || "").toLowerCase().includes(search.toLowerCase()) ||
        (f.cpf || "").includes(search) ||
        (f.nomeEmpresa || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === "todos" || f.statusAptidao === filterStatus;
      const matchOrigem = filterOrigem === "todos" || f.cadastradoPor === filterOrigem;
      return matchSearch && matchStatus && matchOrigem;
    });
  }, [allFuncs, search, filterStatus, filterOrigem]);

  const stats = useMemo(() => ({
    total: allFuncs.length,
    pendentes: allFuncs.filter((f: any) => f.statusAptidao === "pendente").length,
    aptos: allFuncs.filter((f: any) => f.statusAptidao === "apto").length,
    inaptos: allFuncs.filter((f: any) => f.statusAptidao === "inapto").length,
    portal: allFuncs.filter((f: any) => f.cadastradoPor === "portal").length,
    rh: allFuncs.filter((f: any) => f.cadastradoPor !== "portal").length,
  }), [allFuncs]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((f: any) => f.id));
    }
  };

  const openApprove = (action: "apto" | "inapto", singleId?: number) => {
    setApproveAction(action);
    setApproveSingleId(singleId || null);
    setApproveObs("");
    setShowApproveDialog(true);
  };

  const handleConfirmApprove = () => {
    if (approveSingleId) {
      aprovarMut.mutate({ id: approveSingleId, status: approveAction, observacao: approveObs || undefined });
    } else if (selectedIds.length > 0) {
      aprovarLoteMut.mutate({ ids: selectedIds, status: approveAction, observacao: approveObs || undefined });
    }
  };

  const statusBadge = (status: string | null | undefined) => {
    const st = status || "pendente";
    const map: Record<string, { bg: string; text: string; icon: any; label: string }> = {
      apto: { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle, label: "Apto" },
      inapto: { bg: "bg-red-100", text: "text-red-700", icon: XCircle, label: "Inapto" },
      pendente: { bg: "bg-amber-100", text: "text-amber-700", icon: Clock, label: "Pendente" },
    };
    const s = map[st] || map.pendente;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        <s.icon className="h-3 w-3" />{s.label}
      </span>
    );
  };

  const origemBadge = (origem: string | null | undefined) => {
    if (origem === "portal") {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Portal</span>;
    }
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">RH</span>;
  };

  return (
    <DashboardLayout activeModuleId="terceiros">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center">
              <UserCheck className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Aprovação Portal</h1>
              <p className="text-sm text-gray-500">Aprovar/rejeitar funcionários cadastrados pelo portal ou RH</p>
            </div>
          </div>
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 font-medium">{selectedIds.length} selecionado(s)</span>
              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600" onClick={() => openApprove("apto")}>
                <CheckCircle className="h-4 w-4 mr-1" /> Aprovar
              </Button>
              <Button size="sm" variant="destructive" onClick={() => openApprove("inapto")}>
                <XCircle className="h-4 w-4 mr-1" /> Rejeitar
              </Button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white rounded-xl border p-3 text-center cursor-pointer hover:shadow-sm" onClick={() => setFilterStatus("todos")}>
            <p className="text-xl font-bold">{stats.total}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 text-center cursor-pointer hover:shadow-sm" onClick={() => setFilterStatus("pendente")}>
            <p className="text-xl font-bold text-amber-600">{stats.pendentes}</p>
            <p className="text-xs text-amber-600">Pendentes</p>
          </div>
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-3 text-center cursor-pointer hover:shadow-sm" onClick={() => setFilterStatus("apto")}>
            <p className="text-xl font-bold text-emerald-600">{stats.aptos}</p>
            <p className="text-xs text-emerald-600">Aptos</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-3 text-center cursor-pointer hover:shadow-sm" onClick={() => setFilterStatus("inapto")}>
            <p className="text-xl font-bold text-red-600">{stats.inaptos}</p>
            <p className="text-xs text-red-600">Inaptos</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-3 text-center cursor-pointer hover:shadow-sm" onClick={() => setFilterOrigem("portal")}>
            <p className="text-xl font-bold text-blue-600">{stats.portal}</p>
            <p className="text-xs text-blue-600">Via Portal</p>
          </div>
          <div className="bg-gray-50 rounded-xl border p-3 text-center cursor-pointer hover:shadow-sm" onClick={() => setFilterOrigem("rh")}>
            <p className="text-xl font-bold text-gray-600">{stats.rh}</p>
            <p className="text-xs text-gray-600">Via RH</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, CPF ou empresa..." className="pl-10" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white">
            <option value="todos">Todos os Status</option>
            <option value="pendente">Pendentes</option>
            <option value="apto">Aptos</option>
            <option value="inapto">Inaptos</option>
          </select>
          <select value={filterOrigem} onChange={(e) => setFilterOrigem(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white">
            <option value="todos">Todas Origens</option>
            <option value="portal">Via Portal</option>
            <option value="rh">Via RH</option>
          </select>
        </div>

        {/* List */}
        <div className="bg-white rounded-xl border">
          <div className="p-3 border-b flex items-center gap-3">
            <button onClick={toggleSelectAll} className="text-gray-400 hover:text-gray-600">
              {selectedIds.length === filtered.length && filtered.length > 0 ? <CheckSquare className="h-5 w-5 text-orange-500" /> : <Square className="h-5 w-5" />}
            </button>
            <span className="text-sm text-gray-500">{filtered.length} funcionário(s)</span>
          </div>
          <div className="divide-y">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum funcionário encontrado</p>
              </div>
            ) : (
              filtered.map((f: any) => (
                <div key={f.id} className={`p-4 ${selectedIds.includes(f.id) ? "bg-orange-50" : ""}`}>
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleSelect(f.id)} className="text-gray-400 hover:text-gray-600 shrink-0">
                      {selectedIds.includes(f.id) ? <CheckSquare className="h-5 w-5 text-orange-500" /> : <Square className="h-5 w-5" />}
                    </button>
                    <div className="flex-1 cursor-pointer" onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                            <User className="h-4 w-4 text-gray-500" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{f.nomeCompleto || f.nome || "Sem nome"}</p>
                            <p className="text-xs text-gray-500">
                              CPF: {f.cpf || "N/A"} | {f.funcao || "Sem função"} | <Building2 className="h-3 w-3 inline" /> {f.nomeEmpresa}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {origemBadge(f.cadastradoPor)}
                          {statusBadge(f.statusAptidao)}
                          {expandedId === f.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                        </div>
                      </div>
                    </div>
                  </div>
                  {expandedId === f.id && (
                    <div className="mt-3 ml-12 space-y-3">
                      {f.observacaoAprovacao && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-sm text-amber-800">
                          <AlertTriangle className="h-3 w-3 inline mr-1" /> Obs: {f.observacaoAprovacao}
                          {f.aprovadoPor && <span className="text-xs ml-2">— por {f.aprovadoPor}</span>}
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                        {f.telefone && <div><span className="text-gray-500">Tel:</span> {f.telefone}</div>}
                        {f.email && <div><span className="text-gray-500">E-mail:</span> {f.email}</div>}
                        {f.dataAdmissao && <div><span className="text-gray-500">Admissão:</span> {new Date(f.dataAdmissao).toLocaleDateString("pt-BR")}</div>}
                        {f.asoValidade && <div><span className="text-gray-500">ASO até:</span> {new Date(f.asoValidade).toLocaleDateString("pt-BR")}</div>}
                        {f.nr35Validade && <div><span className="text-gray-500">NR-35 até:</span> {new Date(f.nr35Validade).toLocaleDateString("pt-BR")}</div>}
                        {f.nr10Validade && <div><span className="text-gray-500">NR-10 até:</span> {new Date(f.nr10Validade).toLocaleDateString("pt-BR")}</div>}
                        {f.nr33Validade && <div><span className="text-gray-500">NR-33 até:</span> {new Date(f.nr33Validade).toLocaleDateString("pt-BR")}</div>}
                        {f.createdAt && <div><span className="text-gray-500">Cadastrado em:</span> {new Date(f.createdAt).toLocaleDateString("pt-BR")}</div>}
                      </div>
                      {/* Document links */}
                      <div className="flex flex-wrap gap-2">
                        {f.asoDocUrl && <a href={f.asoDocUrl} target="_blank" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><FileText className="h-3 w-3" /> ASO</a>}
                        {f.nr35DocUrl && <a href={f.nr35DocUrl} target="_blank" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><FileText className="h-3 w-3" /> NR-35</a>}
                        {f.nr10DocUrl && <a href={f.nr10DocUrl} target="_blank" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><FileText className="h-3 w-3" /> NR-10</a>}
                        {f.nr33DocUrl && <a href={f.nr33DocUrl} target="_blank" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><FileText className="h-3 w-3" /> NR-33</a>}
                        {f.integracaoDocUrl && <a href={f.integracaoDocUrl} target="_blank" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><FileText className="h-3 w-3" /> Integração</a>}
                      </div>
                      {/* Action buttons */}
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600" onClick={() => openApprove("apto", f.id)}>
                          <CheckCircle className="h-3 w-3 mr-1" /> Aprovar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => openApprove("inapto", f.id)}>
                          <XCircle className="h-3 w-3 mr-1" /> Rejeitar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Approve/Reject Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {approveAction === "apto" ? (
                <><CheckCircle className="h-5 w-5 text-emerald-500" /> Aprovar Funcionário(s)</>
              ) : (
                <><XCircle className="h-5 w-5 text-red-500" /> Rejeitar Funcionário(s)</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {approveSingleId 
                ? `Confirma ${approveAction === "apto" ? "aprovação" : "rejeição"} deste funcionário?`
                : `Confirma ${approveAction === "apto" ? "aprovação" : "rejeição"} de ${selectedIds.length} funcionário(s)?`
              }
            </p>
            <div>
              <Label>Observação (opcional)</Label>
              <Textarea value={approveObs} onChange={(e) => setApproveObs(e.target.value)} placeholder="Motivo da aprovação/rejeição..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>Cancelar</Button>
            <Button
              className={approveAction === "apto" ? "bg-emerald-500 hover:bg-emerald-600" : ""}
              variant={approveAction === "inapto" ? "destructive" : "default"}
              onClick={handleConfirmApprove}
              disabled={aprovarMut.isPending || aprovarLoteMut.isPending}
            >
              {(aprovarMut.isPending || aprovarLoteMut.isPending) ? "Processando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
