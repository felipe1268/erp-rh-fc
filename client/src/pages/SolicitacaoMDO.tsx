import { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Users, Plus, Search, ChevronRight, ArrowLeft,
  Clock, AlertTriangle, CheckCircle, XCircle, Send, Eye,
  HardHat, Building2, Calendar, TrendingUp, DollarSign,
  ArrowRight, RefreshCw, ClipboardList, Award, Briefcase,
  Shield, Package, UserCheck, Trash2, X, Upload, FileText, Phone, User,
  Scale, ThumbsUp, ThumbsDown, BarChart3, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  rascunho: { label: "Rascunho", color: "text-gray-600", bg: "bg-gray-100", icon: ClipboardList },
  enviada: { label: "Enviada", color: "text-blue-700", bg: "bg-blue-100", icon: Send },
  aprovada_coord: { label: "Aprovada Coord.", color: "text-indigo-700", bg: "bg-indigo-100", icon: CheckCircle },
  aprovada_rh: { label: "Aprovada RH", color: "text-purple-700", bg: "bg-purple-100", icon: CheckCircle },
  aprovada_diretoria: { label: "Aprovada Diretoria", color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle },
  em_recrutamento: { label: "Em Recrutamento", color: "text-amber-700", bg: "bg-amber-100", icon: Users },
  concluida: { label: "Concluída", color: "text-green-700", bg: "bg-green-100", icon: UserCheck },
  rejeitada: { label: "Rejeitada", color: "text-red-700", bg: "bg-red-100", icon: XCircle },
  cancelada: { label: "Cancelada", color: "text-gray-500", bg: "bg-gray-50", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] || { label: status, color: "text-gray-600", bg: "bg-gray-100", icon: Clock };
  const Icon = c.icon;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.bg} ${c.color}`}><Icon className="h-3 w-3" />{c.label}</span>;
}

function PrioridadeBadge({ prioridade }: { prioridade: string }) {
  const map: Record<string, string> = { urgente: "🔴 Urgente", normal: "🔵 Normal", planejada: "🟢 Planejada" };
  return <span className="text-[10px] font-medium">{map[prioridade] || prioridade}</span>;
}

function fmtMoney(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type ViewMode = "list" | "form" | "detail";
type FormItem = { id: string; funcao: string; quantidade: number; duracaoMeses: number };

export default function SolicitacaoMDO() {
  const { user } = useAuth();
  const { companyId, companyIds } = useCompany();
  const [, navigate] = useLocation();

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterObra, setFilterObra] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectMotivo, setRejectMotivo] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const [formObraId, setFormObraId] = useState(0);
  const [formItens, setFormItens] = useState<FormItem[]>([{ id: "1", funcao: "", quantidade: 1, duracaoMeses: 1 }]);
  const [formDataInicio, setFormDataInicio] = useState("");
  const [formPrioridade, setFormPrioridade] = useState("normal");
  const [formMotivo, setFormMotivo] = useState("");
  const [formAtividades, setFormAtividades] = useState("");

  const [funcaoDropdownIdx, setFuncaoDropdownIdx] = useState<string | null>(null);
  const [funcaoBusca, setFuncaoBusca] = useState("");
  const funcaoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (funcaoRef.current && !funcaoRef.current.contains(e.target as Node)) {
        setFuncaoDropdownIdx(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const list = trpc.smo.list.useQuery(
    { companyId, companyIds, status: filterStatus !== "all" ? filterStatus : undefined, obraId: filterObra !== "all" ? parseInt(filterObra) : undefined },
    { enabled: companyId > 0 }
  );
  const obrasQ = trpc.smo.obrasAtivas.useQuery({ companyId, companyIds }, { enabled: companyId > 0 });
  const funcoesQ = trpc.smo.funcoesDisponiveis.useQuery({ companyId, companyIds }, { enabled: companyId > 0 });
  const dashQ = trpc.smo.dashboard.useQuery({ companyId, companyIds }, { enabled: companyId > 0 });

  const selectedDetail = trpc.smo.getById.useQuery({ id: selectedId || 0, companyId, companyIds }, { enabled: viewMode === "detail" && !!selectedId && companyId > 0 });

  const detailEfetivo = trpc.smo.efetivoAtualObra.useQuery(
    { companyId, companyIds, obraId: selectedDetail.data?.obraId || 0 },
    { enabled: viewMode === "detail" && !!selectedDetail.data?.obraId }
  );
  const detailCusto = trpc.smo.custoAtualObra.useQuery(
    { companyId, companyIds, obraId: selectedDetail.data?.obraId || 0 },
    { enabled: viewMode === "detail" && !!selectedDetail.data?.obraId }
  );

  const validItensForAnalise = formItens.filter(i => i.funcao.trim() && i.quantidade > 0 && i.duracaoMeses > 0);
  const analiseQ = trpc.smo.analiseComparativa.useQuery(
    { companyId, companyIds, obraId: formObraId, itens: validItensForAnalise.map(i => ({ funcao: i.funcao, quantidade: i.quantidade, duracaoMeses: i.duracaoMeses })) },
    { enabled: viewMode === "form" && formObraId > 0 && validItensForAnalise.length > 0 && companyId > 0 }
  );

  const createMut = trpc.smo.create.useMutation({
    onSuccess: (data) => { toast.success(`${data.count} solicitação(ões) criada(s)!`); list.refetch(); dashQ.refetch(); setViewMode("list"); },
    onError: (e) => toast.error(e.message),
  });
  const aprovarMut = trpc.smo.aprovar.useMutation({
    onSuccess: () => { toast.success("Aprovado!"); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); },
  });
  const rejeitarMut = trpc.smo.rejeitar.useMutation({
    onSuccess: () => { toast.success("Rejeitado."); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); setShowRejectDialog(false); setRejectMotivo(""); },
  });
  const recrutarMut = trpc.smo.iniciarRecrutamento.useMutation({
    onSuccess: () => { toast.success("Recrutamento iniciado!"); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); },
  });
  const concluirMut = trpc.smo.concluir.useMutation({
    onSuccess: () => { toast.success("Solicitação concluída!"); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); },
  });
  const updateMut = trpc.smo.update.useMutation({
    onSuccess: () => { toast.success("Atualizado!"); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMut = trpc.smo.delete.useMutation({
    onSuccess: () => { toast.success("Excluída."); list.refetch(); dashQ.refetch(); setViewMode("list"); },
  });
  const checklistMut = trpc.smo.updateChecklist.useMutation({
    onSuccess: () => selectedDetail.refetch(),
  });
  const uploadCurriculoMut = trpc.smo.uploadCurriculo.useMutation({
    onSuccess: () => { toast.success("Currículo enviado!"); selectedDetail.refetch(); },
  });
  const removerCurriculoMut = trpc.smo.removerCurriculo.useMutation({
    onSuccess: () => { toast.success("Currículo removido."); selectedDetail.refetch(); },
  });

  function resetForm() {
    setFormObraId(0);
    setFormItens([{ id: "1", funcao: "", quantidade: 1, duracaoMeses: 1 }]);
    setFormDataInicio("");
    setFormPrioridade("normal");
    setFormMotivo("");
    setFormAtividades("");
    setFuncaoDropdownIdx(null);
    setFuncaoBusca("");
  }

  function addItem() {
    setFormItens(prev => [...prev, { id: String(Date.now()), funcao: "", quantidade: 1, duracaoMeses: 1 }]);
  }

  function removeItem(id: string) {
    if (formItens.length <= 1) return;
    setFormItens(prev => prev.filter(i => i.id !== id));
  }

  function updateItem(id: string, field: keyof FormItem, value: any) {
    setFormItens(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  function handleSubmit(status: "rascunho" | "enviada") {
    const validItens = formItens.filter(i => i.funcao.trim());
    if (!formObraId || validItens.length === 0 || !formDataInicio) {
      toast.error("Preencha a obra, pelo menos uma função e a data de início.");
      return;
    }
    createMut.mutate({
      companyId,
      obraId: formObraId,
      solicitanteId: user?.id || 0,
      solicitanteNome: user?.name || "Usuário",
      itens: validItens.map(i => ({ funcao: i.funcao, quantidade: i.quantidade, duracaoMeses: i.duracaoMeses })),
      dataInicioNecessidade: formDataInicio,
      prioridade: formPrioridade as any,
      observacao: formMotivo || undefined,
      atividadesDescricao: formAtividades || undefined,
      status,
    });
  }

  const filtered = useMemo(() => {
    if (!list.data) return [];
    const q = searchTerm.toLowerCase();
    return list.data.filter((s: any) =>
      !q ||
      s.funcaoSolicitada?.toLowerCase().includes(q) ||
      s.obraNome?.toLowerCase().includes(q) ||
      s.solicitanteNome?.toLowerCase().includes(q) ||
      String(s.id).includes(q)
    );
  }, [list.data, searchTerm]);

  const d = selectedDetail.data;

  function getProximaEtapa(status: string): string | null {
    const flow: Record<string, string> = { enviada: "coord", aprovada_coord: "rh", aprovada_rh: "diretoria" };
    return flow[status] || null;
  }

  const obrasList = obrasQ.data || [];
  const funcoesList = funcoesQ.data || [];
  const selectedObra = obrasList.find((o: any) => o.id === formObraId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2d4a7a] text-white px-6 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => viewMode === "list" ? navigate("/") : setViewMode("list")} className="text-white/70 hover:text-white hover:bg-white/10 h-9 w-9">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
              <HardHat className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Solicitação de Mão de Obra</h1>
              <p className="text-white/60 text-xs">
                {viewMode === "list" && "Gestão de contratações e realocações"}
                {viewMode === "form" && "Nova solicitação"}
                {viewMode === "detail" && d && `SMO-${String(d.id).padStart(4, "0")} — ${d.funcaoSolicitada}`}
              </p>
            </div>
          </div>
          {viewMode === "list" && (
            <Button onClick={() => { resetForm(); setViewMode("form"); }} className="bg-[#D4A843] hover:bg-[#c49935] text-[#1B2A4A] font-semibold gap-2">
              <Plus className="h-4 w-4" /> Nova Solicitação
            </Button>
          )}
        </div>
      </div>

      {/* ===== LIST VIEW ===== */}
      {viewMode === "list" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {dashQ.data && (
            <div className="px-6 py-3 shrink-0">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <DashCard icon={ClipboardList} label="Total" value={dashQ.data.total} color="text-slate-700" bg="bg-white" />
                <DashCard icon={Send} label="Pendentes" value={(dashQ.data.byStatus.enviada || 0) + (dashQ.data.byStatus.aprovada_coord || 0) + (dashQ.data.byStatus.aprovada_rh || 0)} color="text-blue-700" bg="bg-blue-50" />
                <DashCard icon={Users} label="Em Recrutamento" value={dashQ.data.byStatus.em_recrutamento || 0} color="text-amber-700" bg="bg-amber-50" />
                <DashCard icon={UserCheck} label="Concluídas" value={dashQ.data.byStatus.concluida || 0} color="text-green-700" bg="bg-green-50" />
                <DashCard icon={DollarSign} label="Impacto Total" value={fmtMoney(dashQ.data.totalCusto)} color="text-purple-700" bg="bg-purple-50" isText />
              </div>
            </div>
          )}

          <div className="px-6 pb-3 flex flex-wrap items-center gap-3 shrink-0">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por função, obra ou solicitante..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterObra} onValueChange={setFilterObra}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Obra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as obras</SelectItem>
                {obrasList.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.codigo ? `${o.codigo} - ` : ""}{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {list.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <HardHat className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">Nenhuma solicitação encontrada</p>
                <Button variant="outline" onClick={() => { resetForm(); setViewMode("form"); }} className="mt-3 gap-2">
                  <Plus className="h-4 w-4" /> Criar primeira solicitação
                </Button>
              </div>
            ) : (
              <div className="grid gap-3">
                {filtered.map((s: any) => (
                  <div
                    key={s.id}
                    onClick={() => { setSelectedId(s.id); setViewMode("detail"); }}
                    className="bg-white rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-[#1B2A4A]">SMO-{String(s.id).padStart(4, "0")}</span>
                          <StatusBadge status={s.status} />
                          <PrioridadeBadge prioridade={s.prioridade} />
                          {s.prazoMinimoAlerta && <Badge variant="destructive" className="text-[10px] h-5">Prazo curto!</Badge>}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><HardHat className="h-3.5 w-3.5" /> {s.funcaoSolicitada}</span>
                          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {s.quantidade} vaga(s)</span>
                          <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {s.obraNome || "—"}</span>
                          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {s.dataInicioNecessidade ? new Date(s.dataInicioNecessidade).toLocaleDateString("pt-BR") : "—"}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {s.duracaoMeses}m</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">Custo Estimado</div>
                        <div className="font-bold text-[#1B2A4A]">{fmtMoney(s.custoTotalEstimado || 0)}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs text-muted-foreground">
                      <span>Por {s.solicitanteNome} em {s.criadoEm ? new Date(s.criadoEm).toLocaleDateString("pt-BR") : "-"}</span>
                      <span className="text-[#D4A843] font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">Ver detalhes <ArrowRight className="h-3 w-3" /></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== FORM VIEW ===== */}
      {viewMode === "form" && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 space-y-5">

            {/* Obra + Info */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-bold text-[#1B2A4A] flex items-center gap-2 mb-4"><Building2 className="h-5 w-5" /> Obra</h3>
              <Select value={formObraId ? String(formObraId) : ""} onValueChange={v => setFormObraId(parseInt(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione a obra..." />
                </SelectTrigger>
                <SelectContent>
                  {obrasList.map((o: any) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.codigo ? `${o.codigo} — ` : ""}{o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedObra && (
                <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground bg-slate-50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-[#1B2A4A]" />
                    <span className="font-semibold text-[#1B2A4A]">{selectedObra.nome}</span>
                  </div>
                  {selectedObra.responsavel && (
                    <div className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      <span>Responsável: <strong>{selectedObra.responsavel}</strong></span>
                    </div>
                  )}
                  {selectedObra.codigo && (
                    <div className="text-xs">Código: {selectedObra.codigo}</div>
                  )}
                </div>
              )}
            </div>

            {/* Itens — tabela dinâmica */}
            <div className="bg-white rounded-xl border p-6" ref={funcaoRef}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#1B2A4A] flex items-center gap-2"><Users className="h-5 w-5" /> Funções Solicitadas</h3>
                <Button variant="outline" size="sm" onClick={addItem} className="gap-1 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Adicionar função
                </Button>
              </div>

              <div className="space-y-3">
                {/* Header */}
                <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                  <div className="col-span-6">Função / Cargo</div>
                  <div className="col-span-2 text-center">Qtd</div>
                  <div className="col-span-3 text-center">Duração (meses)</div>
                  <div className="col-span-1"></div>
                </div>

                {formItens.map((item, idx) => (
                  <div key={item.id} className="grid grid-cols-12 gap-3 items-center">
                    {/* Função com autocomplete */}
                    <div className="col-span-6 relative">
                      {item.funcao ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1B2A4A]/30 bg-[#1B2A4A]/5 text-sm font-medium text-[#1B2A4A]">
                          <HardHat className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 truncate">{item.funcao}</span>
                          <button type="button" onClick={() => updateItem(item.id, "funcao", "")} className="text-red-400 hover:text-red-600 shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <Input
                            placeholder="Buscar função..."
                            value={funcaoDropdownIdx === item.id ? funcaoBusca : ""}
                            onChange={e => { setFuncaoBusca(e.target.value); setFuncaoDropdownIdx(item.id); }}
                            onFocus={() => { setFuncaoDropdownIdx(item.id); setFuncaoBusca(""); }}
                            className="pl-9 text-sm"
                          />
                          {funcaoDropdownIdx === item.id && (
                            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {funcoesList
                                .filter((f: string) => !funcaoBusca || f.toLowerCase().includes(funcaoBusca.toLowerCase()))
                                .slice(0, 20)
                                .map((f: string) => (
                                  <button
                                    key={f}
                                    type="button"
                                    onClick={() => { updateItem(item.id, "funcao", f); setFuncaoDropdownIdx(null); setFuncaoBusca(""); }}
                                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2"
                                  >
                                    <HardHat className="h-3 w-3 text-slate-400" />
                                    {f}
                                  </button>
                                ))}
                              {funcoesList.filter((f: string) => !funcaoBusca || f.toLowerCase().includes(funcaoBusca.toLowerCase())).length === 0 && funcaoBusca && (
                                <button
                                  type="button"
                                  onClick={() => { updateItem(item.id, "funcao", funcaoBusca); setFuncaoDropdownIdx(null); setFuncaoBusca(""); }}
                                  className="w-full text-left px-3 py-2 text-sm text-[#D4A843] font-medium hover:bg-amber-50 flex items-center gap-2"
                                >
                                  <Plus className="h-3 w-3" />
                                  Usar: "{funcaoBusca}"
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Quantidade */}
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min={1}
                        value={item.quantidade}
                        onChange={e => updateItem(item.id, "quantidade", parseInt(e.target.value) || 1)}
                        className="text-center text-sm"
                      />
                    </div>

                    {/* Duração */}
                    <div className="col-span-3">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          value={item.duracaoMeses}
                          onChange={e => updateItem(item.id, "duracaoMeses", parseInt(e.target.value) || 1)}
                          className="text-center text-sm"
                        />
                        <span className="text-xs text-muted-foreground shrink-0">mês(es)</span>
                      </div>
                    </div>

                    {/* Remover */}
                    <div className="col-span-1 flex justify-center">
                      {formItens.length > 1 && (
                        <button type="button" onClick={() => removeItem(item.id)} className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Resumo */}
                {formItens.filter(i => i.funcao).length > 0 && (
                  <div className="mt-2 pt-3 border-t flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-semibold text-[#1B2A4A]">
                      {formItens.filter(i => i.funcao).length} função(ões), {formItens.filter(i => i.funcao).reduce((s, i) => s + i.quantidade, 0)} profissional(is)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Detalhes */}
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <h3 className="font-bold text-[#1B2A4A] flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Detalhes</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold">Data de Início *</Label>
                  <Input type="date" value={formDataInicio} onChange={e => setFormDataInicio(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-semibold">Prioridade</Label>
                  <Select value={formPrioridade} onValueChange={setFormPrioridade}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgente">🔴 Urgente (SLA 24h)</SelectItem>
                      <SelectItem value="normal">🔵 Normal (SLA 48h)</SelectItem>
                      <SelectItem value="planejada">🟢 Planejada (SLA 5 dias)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold">Atividades que serão executadas</Label>
                <Textarea value={formAtividades} onChange={e => setFormAtividades(e.target.value)} placeholder="Descreva quais atividades a equipe irá executar na obra..." rows={2} className="mt-1" />
              </div>

              <div>
                <Label className="text-sm font-semibold">Motivo / Justificativa</Label>
                <Textarea value={formMotivo} onChange={e => setFormMotivo(e.target.value)} placeholder="Por que precisa dessa mão de obra? (ex: aumento de produção, substituição, nova etapa...)" rows={2} className="mt-1" />
              </div>

              {formPrioridade !== "urgente" && formDataInicio && (() => {
                const diff = (new Date(formDataInicio).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                return diff < 15;
              })() && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Início em menos de 15 dias. Considere marcar como <strong>Urgente</strong>.</span>
                </div>
              )}
            </div>

            {/* Análise Financeira Comparativa */}
            {analiseQ.data && (
              <div className="bg-white rounded-xl border border-indigo-200 p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Scale className="h-5 w-5 text-indigo-700" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#1B2A4A]">Análise Financeira Detalhada — CLT vs Terceirização</h3>
                    <p className="text-xs text-muted-foreground">Encargos: {analiseQ.data.parametros.encargosPerc.toFixed(1)}% | BDI Terc.: {((analiseQ.data.parametros.fatorBDI - 1) * 100).toFixed(0)}%</p>
                  </div>
                </div>

                {/* Detalhamento por função */}
                {analiseQ.data.itens.map((item: any, idx: number) => {
                  const det = item.clt.detalhamento;
                  const adm = item.clt.custosAdmissao;
                  const dem = item.clt.custosDemissao;
                  return (
                    <div key={idx} className="border rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2 flex items-center justify-between border-b">
                        <div className="flex items-center gap-3">
                          <HardHat className="h-4 w-4 text-[#1B2A4A]" />
                          <span className="font-bold text-sm text-[#1B2A4A]">{item.funcao}</span>
                          <span className="text-xs text-muted-foreground">({item.quantidade} profissional(is) × {item.duracaoMeses} meses)</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.comparativo.recomendacao === "terceirizar" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}>
                          {item.comparativo.recomendacao === "terceirizar" ? "⇒ Terceirizar" : "⇒ Contratar CLT"}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x">
                        {/* CLT */}
                        <div className="p-4 space-y-3">
                          <div className="text-xs font-bold text-blue-800 uppercase tracking-wide flex items-center gap-1.5">
                            <Briefcase className="h-3.5 w-3.5" /> Contratação CLT
                          </div>
                          <div className="text-[10px] text-muted-foreground italic">Base salarial: {fmtMoney(item.salarioBase)} ({item.baseSalarial}{item.qtdReferencia > 0 ? `, ${item.qtdReferencia} ref.` : ""})</div>

                          <div className="space-y-0.5 text-xs">
                            <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Custos Mensais (por profissional)</div>
                            <CostLine label="Salário Bruto" value={det?.salarioBruto || item.salarioBase} />
                            <CostLine label="INSS Patronal (20%)" value={det?.inss} sub />
                            <CostLine label="FGTS (8%)" value={det?.fgts} sub />
                            <CostLine label="RAT/SAT (3%)" value={det?.rat} sub />
                            <CostLine label="Sistema S (5,8%)" value={det?.sistemaS} sub />
                            <CostLine label="Prov. Férias + 1/3" value={det?.provisaoFerias} sub />
                            <CostLine label="Prov. 13º Salário" value={det?.provisao13} sub />
                            <CostLine label="Prov. Multa FGTS" value={det?.provisaoMultaFGTS} sub />
                            <div className="border-t pt-1 flex justify-between font-semibold text-blue-800">
                              <span>Total Encargos ({item.clt.encargosPerc.toFixed(1)}%)</span>
                              <span className="font-mono">{fmtMoney(det?.totalEncargos || item.clt.encargosValor)}</span>
                            </div>
                            <div className="mt-2 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">Benefícios Mensais</div>
                            <CostLine label={`Vale Refeição (22 dias)`} value={det?.valeRefeicao} />
                            <CostLine label="Vale Alimentação" value={det?.valeAlimentacao} />
                            <CostLine label="Vale Transporte (6%)" value={det?.valeTransporte} />
                            <CostLine label="Seguro de Vida Grupo" value={det?.seguroVidaGrupo} />
                            {det?.planoSaude > 0 && <CostLine label="Plano de Saúde" value={det?.planoSaude} />}

                            <div className="border-t border-blue-200 pt-1.5 mt-2">
                              <div className="flex justify-between font-bold text-blue-900 text-sm">
                                <span>Custo Mensal/profissional</span>
                                <span className="font-mono">{fmtMoney(item.clt.custoMensalUnit)}</span>
                              </div>
                              {item.quantidade > 1 && (
                                <div className="flex justify-between font-bold text-blue-800 text-xs mt-0.5">
                                  <span>× {item.quantidade} = Custo Mensal Total</span>
                                  <span className="font-mono">{fmtMoney(item.clt.custoMensalTotal)}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-0.5 text-xs">
                            <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">Custos de Admissão (únicos)</div>
                            <CostLine label="Exame Admissional" value={adm?.exameAdmissional} />
                            <CostLine label="EPIs" value={adm?.epiEstimado} />
                            <CostLine label="Uniformes" value={adm?.uniformeEstimado} />
                            <CostLine label="Treinamento / Integração" value={adm?.treinamentoIntegracao} />
                            <div className="flex justify-between font-semibold text-blue-700 border-t pt-1">
                              <span>Total Admissão ({item.quantidade}x)</span>
                              <span className="font-mono">{fmtMoney(adm?.totalGeral)}</span>
                            </div>
                          </div>

                          <div className="space-y-0.5 text-xs">
                            <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">Custos de Demissão</div>
                            <CostLine label="Exame Demissional" value={dem?.exameDemissional} />
                            <div className="flex justify-between font-semibold text-blue-700 border-t pt-1">
                              <span>Total Demissão ({item.quantidade}x)</span>
                              <span className="font-mono">{fmtMoney(dem?.totalGeral)}</span>
                            </div>
                          </div>

                          <div className="bg-blue-100 rounded-lg p-3 flex justify-between items-center">
                            <div>
                              <div className="text-[10px] font-bold text-blue-800 uppercase">Custo CLT Total</div>
                              <div className="text-[10px] text-blue-600">{item.duracaoMeses}m × {fmtMoney(item.clt.custoMensalTotal)} + admissão + demissão</div>
                            </div>
                            <div className="text-lg font-bold text-blue-900 font-mono">{fmtMoney(item.clt.custoPeriodo)}</div>
                          </div>
                        </div>

                        {/* Terceirização */}
                        <div className="p-4 space-y-3">
                          <div className="text-xs font-bold text-purple-800 uppercase tracking-wide flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" /> Terceirização
                          </div>
                          <div className="text-[10px] text-muted-foreground italic">BDI de {((item.terceirizacao.fatorBDI - 1) * 100).toFixed(0)}% sobre o salário base</div>

                          <div className="space-y-0.5 text-xs">
                            <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">Custos Mensais (por profissional)</div>
                            <CostLine label="Salário Base (ref.)" value={item.salarioBase} />
                            <CostLine label={`BDI (${((item.terceirizacao.fatorBDI - 1) * 100).toFixed(0)}%)`} value={item.salarioBase * (item.terceirizacao.fatorBDI - 1)} sub />
                            <div className="border-t pt-1 flex justify-between font-bold text-purple-800">
                              <span>Custo Mensal/profissional</span>
                              <span className="font-mono">{fmtMoney(item.terceirizacao.custoMensalUnit)}</span>
                            </div>
                            {item.quantidade > 1 && (
                              <div className="flex justify-between font-semibold text-purple-700 text-xs mt-0.5">
                                <span>× {item.quantidade} = Custo Mensal Total</span>
                                <span className="font-mono">{fmtMoney(item.terceirizacao.custoMensalTotal)}</span>
                              </div>
                            )}

                            <div className="mt-3 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">Custos Únicos</div>
                            <CostLine label="Mobilização / Desmobilização" value={item.terceirizacao.mobilizacao} />

                            <div className="mt-3 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">O que está incluso no BDI</div>
                            <div className="text-[10px] text-muted-foreground space-y-0.5 ml-2">
                              <div>✓ Encargos sociais e trabalhistas</div>
                              <div>✓ Benefícios (VR, VA, VT)</div>
                              <div>✓ EPIs e uniformes</div>
                              <div>✓ Exames médicos</div>
                              <div>✓ Treinamento e integração</div>
                              <div>✓ Férias, 13º e provisões</div>
                              <div>✓ Gestão e administração</div>
                              <div>✓ Lucro da empresa terceirizada</div>
                            </div>
                          </div>

                          <div className="bg-purple-100 rounded-lg p-3 flex justify-between items-center">
                            <div>
                              <div className="text-[10px] font-bold text-purple-800 uppercase">Custo Terc. Total</div>
                              <div className="text-[10px] text-purple-600">{item.duracaoMeses}m × {fmtMoney(item.terceirizacao.custoMensalTotal)} + mobilização</div>
                            </div>
                            <div className="text-lg font-bold text-purple-900 font-mono">{fmtMoney(item.terceirizacao.custoPeriodo)}</div>
                          </div>

                          {/* Diferença */}
                          <div className={`rounded-lg p-3 border ${item.comparativo.economiaPeriodo > 0 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-semibold">{item.comparativo.economiaPeriodo > 0 ? "Economia terceirizando" : "Economia contratando CLT"}</span>
                              <span className={`text-sm font-bold font-mono ${item.comparativo.economiaPeriodo > 0 ? "text-green-700" : "text-amber-700"}`}>
                                {fmtMoney(Math.abs(item.comparativo.economiaPeriodo))}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Resumo Consolidado */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="h-4 w-4 text-amber-700" />
                      <span className="text-xs font-bold text-amber-800 uppercase tracking-wide">Impacto na Folha</span>
                    </div>
                    <div className="text-xl font-bold text-amber-900">{fmtMoney(analiseQ.data.resumo.impactoFolhaProximoMes)}</div>
                    <p className="text-[10px] text-amber-700 mt-1">Acréscimo mensal na folha (salários + encargos + benefícios)</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Briefcase className="h-4 w-4 text-blue-700" />
                      <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">CLT Total Período</span>
                    </div>
                    <div className="text-xl font-bold text-blue-900">{fmtMoney(analiseQ.data.resumo.clt.periodo)}</div>
                    <p className="text-[10px] text-blue-700 mt-1">Mensal + admissão + demissão</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-purple-700" />
                      <span className="text-xs font-bold text-purple-800 uppercase tracking-wide">Terceirização Total</span>
                    </div>
                    <div className="text-xl font-bold text-purple-900">{fmtMoney(analiseQ.data.resumo.terceirizacao.periodo)}</div>
                    <p className="text-[10px] text-purple-700 mt-1">Mensal + mobilização</p>
                  </div>
                </div>

                {/* Recomendação */}
                <div className={`rounded-xl p-4 flex items-start gap-3 ${analiseQ.data.resumo.recomendacaoGeral === "terceirizar" ? "bg-purple-100 border border-purple-300" : "bg-blue-100 border border-blue-300"}`}>
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${analiseQ.data.resumo.recomendacaoGeral === "terceirizar" ? "bg-purple-200" : "bg-blue-200"}`}>
                    <BarChart3 className={`h-5 w-5 ${analiseQ.data.resumo.recomendacaoGeral === "terceirizar" ? "text-purple-800" : "text-blue-800"}`} />
                  </div>
                  <div>
                    <div className={`font-bold text-sm ${analiseQ.data.resumo.recomendacaoGeral === "terceirizar" ? "text-purple-900" : "text-blue-900"}`}>
                      Recomendação: {analiseQ.data.resumo.recomendacaoGeral === "terceirizar" ? "Terceirizar" : "Contratar via CLT"}
                    </div>
                    <p className={`text-xs mt-1 ${analiseQ.data.resumo.recomendacaoGeral === "terceirizar" ? "text-purple-700" : "text-blue-700"}`}>
                      {analiseQ.data.resumo.economiaPeriodo > 0
                        ? `Terceirizar economizaria ${fmtMoney(analiseQ.data.resumo.economiaPeriodo)} no período total. Para contratações de curta duração, terceirizar evita custos de admissão/demissão e reduz encargos trabalhistas.`
                        : `Contratar via CLT economizaria ${fmtMoney(Math.abs(analiseQ.data.resumo.economiaPeriodo))} no período total. Para contratações de longa duração, o custo CLT compensa os custos iniciais de admissão.`
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}
            {analiseQ.isLoading && validItensForAnalise.length > 0 && formObraId > 0 && (
              <div className="bg-white rounded-xl border p-6 text-center text-sm text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                Calculando análise financeira detalhada...
              </div>
            )}

            {/* Botões */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setViewMode("list")} className="text-muted-foreground">
                Cancelar
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => handleSubmit("rascunho")} disabled={createMut.isPending}>
                  Salvar Rascunho
                </Button>
                <Button onClick={() => handleSubmit("enviada")} disabled={createMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660] gap-2 px-6">
                  <Send className="h-4 w-4" /> Enviar para Aprovação
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== DETAIL VIEW ===== */}
      {viewMode === "detail" && d && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white rounded-xl border p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <StatusBadge status={d.status} />
                    <PrioridadeBadge prioridade={d.prioridade} />
                    {d.prazoMinimoAlerta && <Badge variant="destructive" className="text-[10px]">Prazo curto!</Badge>}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <InfoField icon={Building2} label="Obra" value={d.obraNome || "-"} />
                    <InfoField icon={HardHat} label="Função" value={d.funcaoSolicitada} />
                    <InfoField icon={Users} label="Quantidade" value={`${d.quantidade} vaga(s)`} />
                    <InfoField icon={Calendar} label="Início" value={d.dataInicioNecessidade ? new Date(d.dataInicioNecessidade).toLocaleDateString("pt-BR") : "—"} />
                    <InfoField icon={Clock} label="Duração" value={`${d.duracaoMeses} mês(es)`} />
                    <InfoField icon={Briefcase} label="Solicitante" value={d.solicitanteNome} />
                  </div>

                  {d.qualificacoes && (
                    <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm">
                      <span className="text-xs font-semibold text-muted-foreground block mb-1">Atividades</span>
                      {d.qualificacoes}
                    </div>
                  )}

                  {d.observacao && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm">
                      <span className="text-xs font-semibold text-muted-foreground block mb-1">Motivo / Justificativa</span>
                      {d.observacao}
                    </div>
                  )}

                  {d.motivoRejeicao && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                      <span className="font-semibold block mb-1">Motivo da Rejeição</span>
                      {d.motivoRejeicao}
                      <div className="text-xs mt-1 text-red-600">Por {d.rejeitadoPor} em {d.rejeitadoEm ? new Date(d.rejeitadoEm).toLocaleDateString("pt-BR") : "-"}</div>
                    </div>
                  )}
                </div>

                {/* Timeline */}
                <div className="bg-white rounded-xl border p-5">
                  <h4 className="font-semibold text-sm text-[#1B2A4A] mb-3">Fluxo de Aprovação</h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ApprovalStep label="Enviada" done={d.status !== "rascunho"} date={d.criadoEm} by={d.solicitanteNome} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <ApprovalStep label="Coord." done={!!d.aprovadoPorCoord} date={d.aprovadoPorCoordEm} by={d.aprovadoPorCoord} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <ApprovalStep label="RH" done={!!d.aprovadoPorRh} date={d.aprovadoPorRhEm} by={d.aprovadoPorRh} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <ApprovalStep label="Diretoria" done={!!d.aprovadoPorDiretoria} date={d.aprovadoPorDiretoriaEm} by={d.aprovadoPorDiretoria} />
                  </div>
                </div>

                {/* Onboarding */}
                {d.checklist && d.checklist.length > 0 && (
                  <div className="bg-white rounded-xl border p-5">
                    <h4 className="font-semibold text-sm text-[#1B2A4A] mb-3 flex items-center gap-2"><Package className="h-4 w-4" /> Checklist de Onboarding</h4>
                    <div className="space-y-2">
                      {d.checklist.map((c: any) => (
                        <div key={c.id} className={`flex items-center gap-3 p-2 rounded-lg transition-all ${c.concluido ? "bg-green-50" : "hover:bg-slate-50"}`}>
                          <Checkbox checked={c.concluido} onCheckedChange={(checked) => checklistMut.mutate({ id: c.id, companyId, companyIds, concluido: !!checked, concluidoPor: user?.name || "RH" })} />
                          <span className={`text-sm flex-1 ${c.concluido ? "line-through text-muted-foreground" : ""}`}>{c.item}</span>
                          {c.concluido && <span className="text-[10px] text-green-600">{c.concluidoPor}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-3">
                  {getProximaEtapa(d.status) && (
                    <Button onClick={() => aprovarMut.mutate({ id: d.id, companyId, companyIds, etapa: getProximaEtapa(d.status) as any, aprovadorNome: user?.name || "Aprovador" })} disabled={aprovarMut.isPending} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                      <CheckCircle className="h-4 w-4" /> Aprovar ({getProximaEtapa(d.status) === "coord" ? "Coordenação" : getProximaEtapa(d.status) === "rh" ? "RH" : "Diretoria"})
                    </Button>
                  )}
                  {["enviada", "aprovada_coord", "aprovada_rh"].includes(d.status) && (
                    <Button variant="destructive" onClick={() => { setRejectingId(d.id); setShowRejectDialog(true); }} className="gap-2">
                      <XCircle className="h-4 w-4" /> Rejeitar
                    </Button>
                  )}
                  {["aprovada_rh", "aprovada_diretoria"].includes(d.status) && (
                    <Button onClick={() => recrutarMut.mutate({ id: d.id, companyId, companyIds })} disabled={recrutarMut.isPending} className="bg-amber-600 hover:bg-amber-700 gap-2">
                      <Users className="h-4 w-4" /> Iniciar Recrutamento
                    </Button>
                  )}
                  {d.status === "em_recrutamento" && (
                    <Button onClick={() => concluirMut.mutate({ id: d.id, companyId, companyIds })} disabled={concluirMut.isPending} className="bg-green-600 hover:bg-green-700 gap-2">
                      <UserCheck className="h-4 w-4" /> Concluir
                    </Button>
                  )}
                  {d.status === "rascunho" && (
                    <Button variant="outline" onClick={() => {
                      updateMut.mutate({ id: d.id, companyId, companyIds, status: "enviada" });
                    }} disabled={updateMut.isPending} className="gap-2">
                      <Send className="h-4 w-4" /> Enviar para Aprovação
                    </Button>
                  )}
                  {["rascunho", "rejeitada"].includes(d.status) && (
                    <Button variant="ghost" className="text-red-600 gap-2" onClick={() => { if (confirm("Excluir esta solicitação?")) deleteMut.mutate({ id: d.id, companyId, companyIds }); }}>
                      <Trash2 className="h-4 w-4" /> Excluir
                    </Button>
                  )}
                </div>
              </div>

              {/* Right sidebar */}
              <div className="space-y-4">
                {d.detalheCustos && (() => {
                  try {
                    const c = JSON.parse(d.detalheCustos);
                    return (
                      <>
                        <div className="bg-white rounded-xl border p-4">
                          <h4 className="font-semibold text-xs text-[#1B2A4A] mb-3 flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" /> Impacto Financeiro</h4>
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between"><span className="text-muted-foreground">Salário Base</span><span className="font-mono">{fmtMoney(c.salarioBase)}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Encargos ({(c.encargosPerc || 79.3).toFixed(1)}%)</span><span className="font-mono">{fmtMoney(c.encargosValor)}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Benefícios</span><span className="font-mono">{fmtMoney(c.beneficios || 0)}</span></div>
                            <div className="border-t pt-1.5 flex justify-between font-semibold"><span>Mensal CLT ({d.quantidade}x)</span><span className="text-blue-700">{fmtMoney(c.custoMensalTotal)}</span></div>
                            <div className="bg-blue-50 text-blue-900 rounded-lg p-2 flex justify-between font-bold">
                              <span>CLT Total ({d.duracaoMeses}m)</span><span>{fmtMoney(c.custoTotal)}</span>
                            </div>
                          </div>
                        </div>

                        {c.tercMensalTotal && (
                          <div className={`rounded-xl border p-4 ${c.recomendacao === "terceirizar" ? "bg-purple-50 border-purple-200" : "bg-blue-50 border-blue-200"}`}>
                            <h4 className="font-semibold text-xs mb-2 flex items-center gap-2">
                              <Scale className="h-3.5 w-3.5" /> CLT vs Terceirização
                            </h4>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between"><span>Terc. mensal</span><span className="font-mono text-purple-700">{fmtMoney(c.tercMensalTotal)}</span></div>
                              <div className="flex justify-between"><span>Terc. total ({d.duracaoMeses}m)</span><span className="font-mono text-purple-700 font-semibold">{fmtMoney(c.tercTotal)}</span></div>
                              <div className="border-t pt-1.5">
                                <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg font-bold text-xs ${c.recomendacao === "terceirizar" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}>
                                  {c.recomendacao === "terceirizar" ? <ThumbsUp className="h-3.5 w-3.5" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                                  {c.recomendacao === "terceirizar" ? "Recomendado: Terceirizar" : "Recomendado: Contratar CLT"}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  {c.recomendacao === "terceirizar"
                                    ? `Economia de ${fmtMoney(c.custoTotal - c.tercTotal)} no período.`
                                    : `Economia de ${fmtMoney(c.tercTotal - c.custoTotal)} no período.`
                                  }
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  } catch { return null; }
                })()}

                {detailEfetivo.data && detailEfetivo.data.length > 0 && (
                  <div className="bg-white rounded-xl border p-4">
                    <h4 className="font-semibold text-xs text-[#1B2A4A] mb-2 flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Efetivo Atual</h4>
                    <div className="space-y-1">
                      {detailEfetivo.data.map((e: any) => (
                        <div key={e.funcao} className={`flex justify-between text-xs px-2 py-0.5 rounded ${e.funcao === d.funcaoSolicitada ? "bg-amber-50 font-semibold" : ""}`}>
                          <span>{e.funcao}</span><span className="font-mono">{e.quantidade}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detailCusto.data && (
                  <div className="bg-white rounded-xl border p-4">
                    <h4 className="font-semibold text-xs text-[#1B2A4A] mb-2 flex items-center gap-2"><TrendingUp className="h-3.5 w-3.5" /> Custo da Obra</h4>
                    <div className="text-xs space-y-1.5">
                      <div className="flex justify-between"><span className="text-muted-foreground">Funcionários</span><span className="font-semibold">{detailCusto.data.totalFuncionarios}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Folha mensal</span><span className="font-semibold">{fmtMoney(detailCusto.data.folhaBrutaMensal)}</span></div>
                    </div>
                  </div>
                )}

                {(d.candidatoIndicadoNome || d.candidatoIndicadoTelefone || d.curriculoArquivoNome) && (
                  <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                    <h4 className="font-semibold text-xs text-blue-800 mb-2 flex items-center gap-2"><UserCheck className="h-3.5 w-3.5" /> Candidato</h4>
                    <div className="space-y-1.5 text-xs">
                      {d.candidatoIndicadoNome && <div className="flex items-center gap-2"><User className="h-3 w-3 text-blue-600" /><span>{d.candidatoIndicadoNome}</span></div>}
                      {d.candidatoIndicadoTelefone && <div className="flex items-center gap-2"><Phone className="h-3 w-3 text-blue-600" /><span>{d.candidatoIndicadoTelefone}</span></div>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Rejeitar Solicitação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Motivo da Rejeição *</Label>
            <Textarea value={rejectMotivo} onChange={e => setRejectMotivo(e.target.value)} placeholder="Descreva o motivo..." rows={3} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRejectDialog(false)}>Cancelar</Button>
              <Button variant="destructive" disabled={!rejectMotivo.trim() || rejeitarMut.isPending}
                onClick={() => { if (rejectingId) rejeitarMut.mutate({ id: rejectingId, companyId, companyIds, rejeitadoPor: user?.name || "Aprovador", motivoRejeicao: rejectMotivo }); }}>
                Confirmar Rejeição
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DashCard({ icon: Icon, label, value, color, bg, isText }: { icon: any; label: string; value: any; color: string; bg: string; isText?: boolean }) {
  return (
    <div className={`${bg} rounded-xl border p-3 shadow-sm`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={`text-lg font-bold ${color} mt-1 ${isText ? "text-sm" : ""}`}>{value}</div>
    </div>
  );
}

function InfoField({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}

function CostLine({ label, value, sub }: { label: string; value: number | undefined | null; sub?: boolean }) {
  if (value === undefined || value === null) return null;
  return (
    <div className={`flex justify-between ${sub ? "ml-3 text-muted-foreground" : ""}`}>
      <span>{sub ? "├ " : ""}{label}</span>
      <span className="font-mono">{fmtMoney(value)}</span>
    </div>
  );
}

function ApprovalStep({ label, done, date, by }: { label: string; done: boolean; date?: string | null; by?: string | null }) {
  return (
    <div className={`flex flex-col items-center px-3 py-2 rounded-lg text-xs ${done ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-muted-foreground"}`}>
      {done ? <CheckCircle className="h-4 w-4 text-emerald-600 mb-1" /> : <Clock className="h-4 w-4 mb-1" />}
      <span className="font-semibold">{label}</span>
      {done && by && <span className="text-[10px]">{by}</span>}
      {done && date && <span className="text-[10px]">{new Date(date).toLocaleDateString("pt-BR")}</span>}
    </div>
  );
}
