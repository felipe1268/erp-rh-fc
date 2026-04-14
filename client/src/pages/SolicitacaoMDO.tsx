import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Users, Plus, Search, ChevronRight, ArrowLeft,
  Clock, AlertTriangle, CheckCircle, XCircle, Send, Eye,
  HardHat, Building2, Calendar, TrendingUp, DollarSign,
  ArrowRight, RefreshCw, ClipboardList, Award, Briefcase,
  Shield, Package, UserCheck, Trash2, X, Upload, FileText, Phone, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import FullScreenDialog from "@/components/FullScreenDialog";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  rascunho: { label: "Rascunho", color: "text-gray-600", bg: "bg-gray-100", icon: ClipboardList },
  enviada: { label: "Enviada", color: "text-blue-700", bg: "bg-blue-100", icon: Send },
  aprovada_coord: { label: "Aprovada Coord.", color: "text-indigo-700", bg: "bg-indigo-100", icon: CheckCircle },
  aprovada_rh: { label: "Aprovada RH", color: "text-purple-700", bg: "bg-purple-100", icon: CheckCircle },
  aprovada_diretoria: { label: "Aprovada Diretoria", color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle },
  em_recrutamento: { label: "Em Recrutamento", color: "text-amber-700", bg: "bg-amber-100", icon: Users },
  concluida: { label: "Concluída", color: "text-green-700", bg: "bg-green-100", icon: UserCheck },
  rejeitada: { label: "Rejeitada", color: "text-red-700", bg: "bg-red-100", icon: XCircle },
};

const PRIORIDADE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  urgente: { label: "Urgente", color: "text-red-700", bg: "bg-red-100" },
  normal: { label: "Normal", color: "text-blue-700", bg: "bg-blue-100" },
  planejada: { label: "Planejada", color: "text-green-700", bg: "bg-green-100" },
};

function fmtMoney(v: number | string) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.rascunho;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function PrioridadeBadge({ prioridade }: { prioridade: string }) {
  const cfg = PRIORIDADE_CONFIG[prioridade] || PRIORIDADE_CONFIG.normal;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>;
}

export default function SolicitacaoMDO() {
  const { user } = useAuth();
  const { companyId, companyIds } = useCompany();
  const [, navigate] = useLocation();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterObra, setFilterObra] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectMotivo, setRejectMotivo] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [funcaoOutros, setFuncaoOutros] = useState("");
  const [curriculoFile, setCurriculoFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    obraId: 0,
    funcaoSolicitada: "",
    quantidade: 1,
    dataInicioNecessidade: "",
    duracaoMeses: 1,
    prioridade: "normal" as "urgente" | "normal" | "planejada",
    qualificacoes: [] as string[],
    observacao: "",
    atividadesEap: [] as Array<{ atividadeId: number; eapCodigo: string; nomeAtividade: string }>,
    candidatoIndicadoNome: "",
    candidatoIndicadoTelefone: "",
  });

  const [showEapPicker, setShowEapPicker] = useState(false);

  const list = trpc.smo.list.useQuery(
    { companyId, companyIds, status: filterStatus !== "all" ? filterStatus : undefined, obraId: filterObra !== "all" ? parseInt(filterObra) : undefined },
    { enabled: companyId > 0 }
  );
  const obrasQ = trpc.smo.obrasAtivas.useQuery({ companyId, companyIds }, { enabled: companyId > 0 });
  const funcoesQ = trpc.smo.funcoesDisponiveis.useQuery({ companyId, companyIds }, { enabled: companyId > 0 });
  const qualifsQ = trpc.smo.qualificacoesDisponiveis.useQuery();
  const dashQ = trpc.smo.dashboard.useQuery({ companyId, companyIds }, { enabled: companyId > 0 });

  const impactoQ = trpc.smo.calcularImpactoFinanceiro.useQuery(
    { companyId, companyIds, funcao: form.funcaoSolicitada, quantidade: form.quantidade, duracaoMeses: form.duracaoMeses, obraId: form.obraId },
    { enabled: showForm && !!form.funcaoSolicitada && form.funcaoSolicitada !== "__outros__" && form.obraId > 0 && form.quantidade > 0 && form.duracaoMeses > 0 }
  );

  const efetivoQ = trpc.smo.efetivoObra.useQuery(
    { companyId, companyIds, obraId: form.obraId },
    { enabled: showForm && form.obraId > 0 }
  );

  const eapQ = trpc.smo.atividadesEap.useQuery(
    { obraId: form.obraId, companyId, companyIds },
    { enabled: showEapPicker && form.obraId > 0 }
  );

  const realocQ = trpc.smo.sugerirRealocacao.useQuery(
    { companyId, companyIds, funcao: form.funcaoSolicitada, quantidade: form.quantidade, dataInicio: form.dataInicioNecessidade, obraIdDestino: form.obraId },
    { enabled: showForm && form.prioridade !== "urgente" && !!form.funcaoSolicitada && form.funcaoSolicitada !== "__outros__" && !!form.dataInicioNecessidade && form.obraId > 0 }
  );

  const selectedDetail = trpc.smo.getById.useQuery({ id: selectedId || 0, companyId, companyIds }, { enabled: showDetail && !!selectedId && companyId > 0 });
  const detailEfetivo = trpc.smo.efetivoObra.useQuery(
    { companyId, companyIds, obraId: selectedDetail.data?.obraId || 0 },
    { enabled: showDetail && !!selectedDetail.data?.obraId }
  );
  const detailCusto = trpc.smo.custoAtualObra.useQuery(
    { companyId, companyIds, obraId: selectedDetail.data?.obraId || 0 },
    { enabled: showDetail && !!selectedDetail.data?.obraId }
  );
  const detailTurnover = trpc.smo.historicoTurnover.useQuery(
    { companyId, companyIds, obraId: selectedDetail.data?.obraId || 0, funcao: selectedDetail.data?.funcaoSolicitada || "" },
    { enabled: showDetail && !!selectedDetail.data?.obraId && !!selectedDetail.data?.funcaoSolicitada }
  );
  const detailSimilares = trpc.smo.solicitacoesSimilares.useQuery(
    { companyId, companyIds, funcao: selectedDetail.data?.funcaoSolicitada || "", excludeId: selectedId || 0 },
    { enabled: showDetail && !!selectedDetail.data?.funcaoSolicitada }
  );

  const createMut = trpc.smo.create.useMutation({
    onSuccess: () => { toast.success("Solicitação criada!"); setShowForm(false); resetForm(); list.refetch(); dashQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const aprovarMut = trpc.smo.aprovar.useMutation({
    onSuccess: () => { toast.success("Aprovada!"); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const rejeitarMut = trpc.smo.rejeitar.useMutation({
    onSuccess: () => { toast.success("Rejeitada."); setShowRejectDialog(false); setRejectMotivo(""); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const recrutarMut = trpc.smo.iniciarRecrutamento.useMutation({
    onSuccess: () => { toast.success("Recrutamento iniciado! Checklist criado."); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const concluirMut = trpc.smo.concluir.useMutation({
    onSuccess: () => { toast.success("Solicitação concluída!"); selectedDetail.refetch(); list.refetch(); dashQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const checklistMut = trpc.smo.toggleChecklistItem.useMutation({
    onSuccess: () => selectedDetail.refetch(),
  });
  const deleteMut = trpc.smo.delete.useMutation({
    onSuccess: () => { toast.success("Excluída."); setShowDetail(false); list.refetch(); dashQ.refetch(); },
  });
  const uploadCurriculoMut = trpc.smo.uploadCurriculo.useMutation({
    onSuccess: () => { toast.success("Currículo anexado!"); selectedDetail.refetch(); },
    onError: (e) => toast.error("Erro ao enviar currículo: " + e.message),
  });
  const removerCurriculoMut = trpc.smo.removerCurriculo.useMutation({
    onSuccess: () => { toast.success("Currículo removido."); selectedDetail.refetch(); },
  });

  function resetForm() {
    setForm({ obraId: 0, funcaoSolicitada: "", quantidade: 1, dataInicioNecessidade: "", duracaoMeses: 1, prioridade: "normal", qualificacoes: [], observacao: "", atividadesEap: [], candidatoIndicadoNome: "", candidatoIndicadoTelefone: "" });
    setFuncaoOutros("");
    setCurriculoFile(null);
  }

  function getFuncaoFinal() {
    if (form.funcaoSolicitada === "__outros__") return funcaoOutros.trim();
    return form.funcaoSolicitada;
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function handleSubmit(status: "rascunho" | "enviada") {
    const funcaoFinal = getFuncaoFinal();
    if (!form.obraId || !funcaoFinal || !form.dataInicioNecessidade) {
      toast.error("Preencha obra, função e data de necessidade.");
      return;
    }
    createMut.mutate({
      companyId,
      obraId: form.obraId,
      solicitanteId: user?.id || 0,
      solicitanteNome: user?.name || "Usuário",
      funcaoSolicitada: funcaoFinal,
      quantidade: form.quantidade,
      dataInicioNecessidade: form.dataInicioNecessidade,
      duracaoMeses: form.duracaoMeses,
      prioridade: form.prioridade,
      qualificacoes: form.qualificacoes.length > 0 ? JSON.stringify(form.qualificacoes) : undefined,
      observacao: form.observacao || undefined,
      custoMensalEstimado: impactoQ.data ? String(impactoQ.data.custoMensalTotal) : undefined,
      custoTotalEstimado: impactoQ.data ? String(impactoQ.data.custoTotal) : undefined,
      detalheCustos: impactoQ.data ? JSON.stringify(impactoQ.data) : undefined,
      sugestaoRealocacao: realocQ.data && realocQ.data.length > 0 ? JSON.stringify(realocQ.data) : undefined,
      atividades: form.atividadesEap.length > 0 ? form.atividadesEap : undefined,
      candidatoIndicadoNome: form.candidatoIndicadoNome || undefined,
      candidatoIndicadoTelefone: form.candidatoIndicadoTelefone || undefined,
      status,
    }, {
      onSuccess: async (sol) => {
        if (curriculoFile && sol?.id) {
          try {
            const base64 = await fileToBase64(curriculoFile);
            uploadCurriculoMut.mutate({
              id: sol.id,
              companyId,
              companyIds,
              fileName: curriculoFile.name,
              fileBase64: base64,
              contentType: curriculoFile.type || "application/pdf",
            });
          } catch {
            toast.error("Erro ao processar arquivo do currículo.");
          }
        }
      },
    });
  }

  const filtered = useMemo(() => {
    if (!list.data) return [];
    if (!searchTerm) return list.data;
    const q = searchTerm.toLowerCase();
    return list.data.filter((s: any) =>
      s.funcaoSolicitada?.toLowerCase().includes(q) ||
      s.solicitanteNome?.toLowerCase().includes(q) ||
      s.obraNome?.toLowerCase().includes(q)
    );
  }, [list.data, searchTerm]);

  const d = selectedDetail.data;

  function getProximaEtapa(status: string): string | null {
    const flow: Record<string, string> = {
      enviada: "coord",
      aprovada_coord: "rh",
      aprovada_rh: "diretoria",
    };
    return flow[status] || null;
  }

  const obrasList = obrasQ.data || [];
  const funcoesList = funcoesQ.data || [];
  const selectedObra = obrasList.find((o: any) => o.id === form.obraId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2d4a7a] text-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-white/70 hover:text-white hover:bg-white/10 h-9 w-9">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
              <HardHat className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Solicitação de Mão de Obra</h1>
              <p className="text-white/60 text-sm">Gestão de contratações e realocações</p>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setShowForm(true); }} className="bg-[#D4A843] hover:bg-[#c49935] text-[#1B2A4A] font-semibold gap-2">
            <Plus className="h-4 w-4" /> Nova Solicitação
          </Button>
        </div>
      </div>

      {/* Dashboard Cards */}
      {dashQ.data && (
        <div className="px-6 -mt-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <DashCard icon={ClipboardList} label="Total" value={dashQ.data.total} color="text-slate-700" bg="bg-white" />
            <DashCard icon={Send} label="Pendentes" value={(dashQ.data.byStatus.enviada || 0) + (dashQ.data.byStatus.aprovada_coord || 0) + (dashQ.data.byStatus.aprovada_rh || 0)} color="text-blue-700" bg="bg-blue-50" />
            <DashCard icon={Users} label="Em Recrutamento" value={dashQ.data.byStatus.em_recrutamento || 0} color="text-amber-700" bg="bg-amber-50" />
            <DashCard icon={UserCheck} label="Concluídas" value={dashQ.data.byStatus.concluida || 0} color="text-green-700" bg="bg-green-50" />
            <DashCard icon={DollarSign} label="Impacto Total" value={fmtMoney(dashQ.data.totalCusto)} color="text-purple-700" bg="bg-purple-50" isText />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="px-6 mt-4 flex flex-wrap items-center gap-3">
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

      {/* List */}
      <div className="px-6 mt-4 pb-6">
        {list.isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <HardHat className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhuma solicitação encontrada</p>
            <Button variant="outline" onClick={() => { resetForm(); setShowForm(true); }} className="mt-3 gap-2">
              <Plus className="h-4 w-4" /> Criar primeira solicitação
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((s: any) => (
              <div
                key={s.id}
                onClick={() => { setSelectedId(s.id); setShowDetail(true); }}
                className="bg-white rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[#1B2A4A]">SMO-{String(s.id).padStart(4, "0")}</span>
                      <StatusBadge status={s.status} />
                      <PrioridadeBadge prioridade={s.prioridade} />
                      {s.prazoMinimoAlerta && <Badge variant="destructive" className="text-[10px] h-5">Prazo curto!</Badge>}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><HardHat className="h-3.5 w-3.5" /> {s.funcaoSolicitada}</span>
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {s.quantidade} vaga(s)</span>
                      <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {s.obraNome || "—"}</span>
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Início: {s.dataInicioNecessidade ? new Date(s.dataInicioNecessidade).toLocaleDateString("pt-BR") : "—"}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {s.duracaoMeses} mês(es)</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">Custo Total Estimado</div>
                    <div className="font-bold text-[#1B2A4A]">{fmtMoney(s.custoTotalEstimado || 0)}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs text-muted-foreground">
                  <span>Solicitado por {s.solicitanteNome} em {s.criadoEm ? new Date(s.criadoEm).toLocaleDateString("pt-BR") : "-"}</span>
                  <span className="text-[#D4A843] font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">Ver detalhes <ArrowRight className="h-3 w-3" /></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== FORM: Nova Solicitação ===== */}
      <FullScreenDialog open={showForm} onClose={() => setShowForm(false)} title="Nova Solicitação de Mão de Obra" icon={<HardHat className="h-5 w-5 text-white" />} headerClassName="bg-gradient-to-r from-[#1B2A4A] to-[#2d4a7a]">
        <div className="max-w-5xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Form */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-xl border p-5 space-y-4">
              <h3 className="font-bold text-[#1B2A4A] flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Dados da Solicitação</h3>

              {/* Obra */}
              <div>
                <Label className="text-xs font-semibold">Obra *</Label>
                {obrasList.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-3 bg-amber-50 border border-amber-200 rounded-lg mt-1">
                    <AlertTriangle className="h-4 w-4 inline mr-1 text-amber-600" />
                    Nenhuma obra ativa cadastrada. Cadastre uma obra antes de solicitar mão de obra.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {obrasList.map((o: any) => (
                      <div
                        key={o.id}
                        onClick={() => setForm(p => ({ ...p, obraId: o.id, atividadesEap: [] }))}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${form.obraId === o.id ? "border-[#1B2A4A] bg-[#1B2A4A]/5" : "border-transparent bg-slate-50 hover:bg-slate-100"}`}
                      >
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${form.obraId === o.id ? "bg-[#1B2A4A] text-white" : "bg-slate-200 text-slate-500"}`}>
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{o.nome}</div>
                          {o.codigo && <div className="text-xs text-muted-foreground">{o.codigo}</div>}
                        </div>
                        {form.obraId === o.id && <CheckCircle className="h-4 w-4 text-[#1B2A4A] shrink-0" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Função */}
              <div>
                <Label className="text-xs font-semibold">Função / Cargo *</Label>
                {funcoesList.length === 0 && form.funcaoSolicitada !== "__outros__" ? (
                  <div className="mt-2">
                    <Input placeholder="Digite a função desejada..." value={funcaoOutros} onChange={e => { setFuncaoOutros(e.target.value); setForm(p => ({ ...p, funcaoSolicitada: "__outros__" })); }} />
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {funcoesList.map((f: string) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => { setForm(p => ({ ...p, funcaoSolicitada: f })); setFuncaoOutros(""); }}
                          className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${form.funcaoSolicitada === f ? "bg-[#1B2A4A] text-white border-[#1B2A4A]" : "bg-white hover:bg-slate-50 border-slate-200"}`}
                        >
                          {f}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setForm(p => ({ ...p, funcaoSolicitada: "__outros__" }))}
                        className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${form.funcaoSolicitada === "__outros__" ? "bg-[#D4A843] text-white border-[#D4A843]" : "bg-white hover:bg-slate-50 border-dashed border-slate-300"}`}
                      >
                        + Outros
                      </button>
                    </div>
                    {form.funcaoSolicitada === "__outros__" && (
                      <div className="mt-2">
                        <Input placeholder="Digite a função desejada..." value={funcaoOutros} onChange={e => setFuncaoOutros(e.target.value)} autoFocus />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs font-semibold">Quantidade *</Label>
                  <Input type="number" min={1} value={form.quantidade} onChange={e => setForm(p => ({ ...p, quantidade: parseInt(e.target.value) || 1 }))} />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Início Necessidade *</Label>
                  <Input type="date" value={form.dataInicioNecessidade} onChange={e => setForm(p => ({ ...p, dataInicioNecessidade: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Duração (meses)</Label>
                  <Input type="number" min={1} value={form.duracaoMeses} onChange={e => setForm(p => ({ ...p, duracaoMeses: parseInt(e.target.value) || 1 }))} />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Prioridade</Label>
                  <Select value={form.prioridade} onValueChange={(v: any) => setForm(p => ({ ...p, prioridade: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgente">🔴 Urgente (SLA 24h)</SelectItem>
                      <SelectItem value="normal">🔵 Normal (SLA 48h)</SelectItem>
                      <SelectItem value="planejada">🟢 Planejada (SLA 5 dias)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Qualificações */}
              <div>
                <Label className="text-xs font-semibold mb-2 block">Qualificações Exigidas</Label>
                <div className="flex flex-wrap gap-2">
                  {(qualifsQ.data || []).map((q: string) => (
                    <label key={q} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-all ${form.qualificacoes.includes(q) ? "bg-[#1B2A4A] text-white border-[#1B2A4A]" : "bg-white hover:bg-slate-50"}`}>
                      <Checkbox checked={form.qualificacoes.includes(q)} onCheckedChange={checked => {
                        setForm(p => ({ ...p, qualificacoes: checked ? [...p.qualificacoes, q] : p.qualificacoes.filter(x => x !== q) }));
                      }} className="h-3 w-3" />
                      {q}
                    </label>
                  ))}
                </div>
              </div>

              {/* Atividades EAP */}
              <div>
                <Label className="text-xs font-semibold mb-2 block">Atividades da EAP (vinculação)</Label>
                {form.atividadesEap.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {form.atividadesEap.map(a => (
                      <Badge key={a.atividadeId} variant="secondary" className="gap-1">
                        {a.eapCodigo} - {a.nomeAtividade}
                        <button onClick={() => setForm(p => ({ ...p, atividadesEap: p.atividadesEap.filter(x => x.atividadeId !== a.atividadeId) }))}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <Button variant="outline" size="sm" onClick={() => setShowEapPicker(true)} disabled={!form.obraId} className="gap-1">
                  <Plus className="h-3 w-3" /> Vincular Atividades
                </Button>
              </div>

              {/* Observação */}
              <div>
                <Label className="text-xs font-semibold">Justificativa / Observação</Label>
                <Textarea value={form.observacao} onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))} placeholder="Descreva o motivo da necessidade de contratação..." rows={3} />
              </div>

              {/* Indicação de Candidato */}
              <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  Indicação de Candidato (opcional)
                </h4>
                <p className="text-xs text-blue-600">Tem alguém em mente? Preencha os dados abaixo para direcionar ao RH.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold flex items-center gap-1"><User className="h-3 w-3" /> Nome do candidato</Label>
                    <Input value={form.candidatoIndicadoNome} onChange={e => setForm(p => ({ ...p, candidatoIndicadoNome: e.target.value }))} placeholder="Nome completo" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold flex items-center gap-1"><Phone className="h-3 w-3" /> Telefone</Label>
                    <Input value={form.candidatoIndicadoTelefone} onChange={e => setForm(p => ({ ...p, candidatoIndicadoTelefone: e.target.value }))} placeholder="(00) 00000-0000" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold flex items-center gap-1"><FileText className="h-3 w-3" /> Currículo (PDF, DOC, DOCX)</Label>
                  <div className="mt-1">
                    {curriculoFile ? (
                      <div className="flex items-center gap-2 p-2 bg-white border rounded-lg">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="text-sm flex-1 truncate">{curriculoFile.name}</span>
                        <span className="text-xs text-gray-400">{(curriculoFile.size / 1024).toFixed(0)} KB</span>
                        <Button variant="ghost" size="sm" onClick={() => setCurriculoFile(null)} className="h-6 w-6 p-0">
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 p-3 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors">
                        <Upload className="h-5 w-5 text-blue-500" />
                        <span className="text-sm text-blue-600">Clique para selecionar arquivo</span>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 10 * 1024 * 1024) {
                                toast.error("Arquivo muito grande. Máximo 10MB.");
                                return;
                              }
                              setCurriculoFile(file);
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* Alerta prazo mínimo */}
              {form.prioridade !== "urgente" && form.dataInicioNecessidade && (() => {
                const diff = (new Date(form.dataInicioNecessidade).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                return diff < 15;
              })() && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>A data de início está a menos de 15 dias. Considere marcar como <strong>Urgente</strong> ou ajustar o prazo.</span>
                </div>
              )}
            </div>

            {/* Botões */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button variant="secondary" onClick={() => handleSubmit("rascunho")} disabled={createMut.isPending}>Salvar Rascunho</Button>
              <Button onClick={() => handleSubmit("enviada")} disabled={createMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660] gap-2">
                <Send className="h-4 w-4" /> Enviar para Aprovação
              </Button>
            </div>
          </div>

          {/* Right: Impact Panel */}
          <div className="space-y-4">
            {/* Obra Selecionada */}
            {selectedObra && (
              <div className="bg-white rounded-xl border p-4">
                <h4 className="font-semibold text-sm text-[#1B2A4A] mb-2 flex items-center gap-2"><Building2 className="h-4 w-4" /> Obra Selecionada</h4>
                <div className="text-sm font-medium">{selectedObra.nome}</div>
                {selectedObra.codigo && <div className="text-xs text-muted-foreground">{selectedObra.codigo}</div>}
                {selectedObra.responsavel && <div className="text-xs text-muted-foreground mt-1">Responsável: {selectedObra.responsavel}</div>}
              </div>
            )}

            {/* Efetivo Atual */}
            {efetivoQ.data && efetivoQ.data.length > 0 && (
              <div className="bg-white rounded-xl border p-4">
                <h4 className="font-semibold text-sm text-[#1B2A4A] mb-3 flex items-center gap-2"><Users className="h-4 w-4" /> Efetivo Atual da Obra</h4>
                <div className="space-y-1.5">
                  {efetivoQ.data.map((e: any) => (
                    <div key={e.funcao} className={`flex justify-between text-sm px-2 py-1 rounded ${e.funcao === form.funcaoSolicitada ? "bg-amber-50 font-semibold" : ""}`}>
                      <span>{e.funcao}</span>
                      <span className="font-mono">{e.quantidade}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Impacto Financeiro */}
            {impactoQ.data && (
              <div className="bg-white rounded-xl border p-4">
                <h4 className="font-semibold text-sm text-[#1B2A4A] mb-3 flex items-center gap-2"><DollarSign className="h-4 w-4" /> Impacto Financeiro</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Salário Base</span><span className="font-mono">{fmtMoney(impactoQ.data.salarioBase)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Encargos ({impactoQ.data.encargosPercentual.toFixed(1)}%)</span><span className="font-mono">{fmtMoney(impactoQ.data.encargosValor)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Vale Refeição</span><span className="font-mono">{fmtMoney(impactoQ.data.valeRefeicao)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Vale Alimentação</span><span className="font-mono">{fmtMoney(impactoQ.data.valeAlimentacao)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Vale Transporte</span><span className="font-mono">{fmtMoney(impactoQ.data.valeTransporte)}</span></div>
                  <div className="border-t pt-2 flex justify-between font-semibold"><span>Custo Mensal (unit.)</span><span className="font-mono">{fmtMoney(impactoQ.data.custoMensalUnitario)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Exame Admissional</span><span className="font-mono">{fmtMoney(impactoQ.data.exameAdmissional)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>EPIs</span><span className="font-mono">{fmtMoney(impactoQ.data.epiEstimado)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Uniformes</span><span className="font-mono">{fmtMoney(impactoQ.data.uniformeEstimado)}</span></div>
                  <div className="border-t pt-2 flex justify-between font-semibold"><span>Custo Mensal Total ({form.quantidade}x)</span><span className="font-mono text-[#1B2A4A]">{fmtMoney(impactoQ.data.custoMensalTotal)}</span></div>
                  <div className="bg-[#1B2A4A] text-white rounded-lg p-3 flex justify-between font-bold">
                    <span>CUSTO TOTAL ({form.duracaoMeses}m)</span><span className="font-mono">{fmtMoney(impactoQ.data.custoTotal)}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">Base: {impactoQ.data.baseSalarial} ({impactoQ.data.qtdReferencia} ref.)</div>
                </div>
              </div>
            )}

            {/* Sugestão de Realocação */}
            {realocQ.data && realocQ.data.length > 0 && (
              <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
                <h4 className="font-semibold text-sm text-emerald-800 mb-3 flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Sugestão de Realocação</h4>
                {realocQ.data.map((s: any, i: number) => (
                  <div key={i} className="mb-3 last:mb-0 bg-white rounded-lg p-3 text-sm">
                    <div className="font-semibold text-emerald-800">{s.obraNome}</div>
                    <div className="text-muted-foreground text-xs mt-1">{s.motivo}</div>
                    <div className="text-xs mt-1">{s.funcionarios.length} profissional(is) disponível(is)</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </FullScreenDialog>

      {/* ===== EAP Picker Dialog ===== */}
      <Dialog open={showEapPicker} onOpenChange={setShowEapPicker}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Selecionar Atividades da EAP</DialogTitle></DialogHeader>
          {eapQ.isLoading ? <div className="py-8 text-center text-muted-foreground">Carregando EAP...</div> : (
            <div className="space-y-1">
              {(eapQ.data || []).length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">Nenhuma EAP cadastrada para esta obra.</div>}
              {(eapQ.data || []).filter((a: any) => !a.isGrupo).map((a: any) => {
                const selected = form.atividadesEap.some(x => x.atividadeId === a.id);
                return (
                  <div
                    key={a.id}
                    onClick={() => {
                      if (selected) {
                        setForm(p => ({ ...p, atividadesEap: p.atividadesEap.filter(x => x.atividadeId !== a.id) }));
                      } else {
                        setForm(p => ({ ...p, atividadesEap: [...p.atividadesEap, { atividadeId: a.id, eapCodigo: a.eapCodigo || "", nomeAtividade: a.nome }] }));
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-all ${selected ? "bg-[#1B2A4A] text-white" : "hover:bg-slate-50"}`}
                    style={{ paddingLeft: `${(a.nivel || 1) * 16}px` }}
                  >
                    <Checkbox checked={selected} className="h-3.5 w-3.5" />
                    <span className="font-mono text-xs opacity-60">{a.eapCodigo}</span>
                    <span className="flex-1">{a.nome}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-end mt-3">
            <Button onClick={() => setShowEapPicker(false)}>Confirmar ({form.atividadesEap.length})</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== DETAIL / APPROVAL VIEW ===== */}
      <FullScreenDialog open={showDetail} onClose={() => setShowDetail(false)} title={d ? `SMO-${String(d.id).padStart(4, "0")} — ${d.funcaoSolicitada}` : "Detalhes"} icon={<Eye className="h-5 w-5 text-white" />} headerClassName="bg-gradient-to-r from-[#1B2A4A] to-[#2d4a7a]">
        {d && (
          <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Info */}
            <div className="lg:col-span-2 space-y-5">
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
                  <InfoField icon={Calendar} label="Início Necessidade" value={d.dataInicioNecessidade ? new Date(d.dataInicioNecessidade).toLocaleDateString("pt-BR") : "—"} />
                  <InfoField icon={Clock} label="Duração" value={`${d.duracaoMeses} mês(es)`} />
                  <InfoField icon={Briefcase} label="Solicitante" value={d.solicitanteNome} />
                </div>

                {d.qualificacoes && (
                  <div className="mt-4">
                    <span className="text-xs font-semibold text-muted-foreground">Qualificações Exigidas</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(() => { try { return JSON.parse(d.qualificacoes) as string[]; } catch { return []; } })().map((q: string) => (
                        <Badge key={q} variant="outline" className="gap-1 text-xs"><Shield className="h-3 w-3" /> {q}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {d.observacao && (
                  <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm">
                    <span className="text-xs font-semibold text-muted-foreground block mb-1">Justificativa</span>
                    {d.observacao}
                  </div>
                )}

                {(d.atividades || []).length > 0 && (
                  <div className="mt-4">
                    <span className="text-xs font-semibold text-muted-foreground">Atividades EAP Vinculadas</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {d.atividades.map((a: any) => (
                        <Badge key={a.id} variant="secondary" className="text-xs">{a.eapCodigo} - {a.nomeAtividade}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {d.motivoRejeicao && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                    <span className="font-semibold block mb-1">Motivo da Rejeição</span>
                    {d.motivoRejeicao}
                    <div className="text-xs mt-1 text-red-600">Rejeitado por {d.rejeitadoPor} em {d.rejeitadoEm ? new Date(d.rejeitadoEm).toLocaleDateString("pt-BR") : "-"}</div>
                  </div>
                )}
              </div>

              {/* Timeline Aprovação */}
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

              {/* Onboarding Checklist */}
              {d.checklist && d.checklist.length > 0 && (
                <div className="bg-white rounded-xl border p-5">
                  <h4 className="font-semibold text-sm text-[#1B2A4A] mb-3 flex items-center gap-2"><Package className="h-4 w-4" /> Checklist de Onboarding</h4>
                  <div className="space-y-2">
                    {d.checklist.map((c: any) => (
                      <div key={c.id} className={`flex items-center gap-3 p-2 rounded-lg transition-all ${c.concluido ? "bg-green-50" : "hover:bg-slate-50"}`}>
                        <Checkbox
                          checked={c.concluido}
                          onCheckedChange={(checked) => checklistMut.mutate({ id: c.id, companyId, companyIds, concluido: !!checked, concluidoPor: user?.name || "RH" })}
                        />
                        <span className={`text-sm flex-1 ${c.concluido ? "line-through text-muted-foreground" : ""}`}>{c.item}</span>
                        {c.concluido && <span className="text-[10px] text-green-600">{c.concluidoPor} em {c.concluidoEm ? new Date(c.concluidoEm).toLocaleDateString("pt-BR") : ""}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                {getProximaEtapa(d.status) && (
                  <Button
                    onClick={() => aprovarMut.mutate({ id: d.id, companyId, companyIds, etapa: getProximaEtapa(d.status) as any, aprovadorNome: user?.name || "Aprovador" })}
                    disabled={aprovarMut.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                  >
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
                    <UserCheck className="h-4 w-4" /> Concluir (Contratado)
                  </Button>
                )}
                {d.status === "rascunho" && (
                  <Button variant="outline" onClick={() => {
                    createMut.mutate({ companyId, obraId: d.obraId, solicitanteId: d.solicitanteId, solicitanteNome: d.solicitanteNome, funcaoSolicitada: d.funcaoSolicitada, quantidade: d.quantidade, dataInicioNecessidade: d.dataInicioNecessidade, duracaoMeses: d.duracaoMeses, prioridade: d.prioridade as any, status: "enviada" } as any);
                  }} className="gap-2">
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

            {/* Right: Contextual Info */}
            <div className="space-y-4">
              {/* Custo Financeiro Detalhado */}
              {d.detalheCustos && (() => {
                try {
                  const c = JSON.parse(d.detalheCustos);
                  return (
                    <div className="bg-white rounded-xl border p-4">
                      <h4 className="font-semibold text-sm text-[#1B2A4A] mb-3 flex items-center gap-2"><DollarSign className="h-4 w-4" /> Impacto Financeiro</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Salário Base</span><span className="font-mono">{fmtMoney(c.salarioBase)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Encargos</span><span className="font-mono">{fmtMoney(c.encargosValor)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">VR + VA + VT</span><span className="font-mono">{fmtMoney(c.valeRefeicao + c.valeAlimentacao + c.valeTransporte)}</span></div>
                        <div className="border-t pt-2 flex justify-between font-semibold"><span>Mensal ({d.quantidade}x)</span><span>{fmtMoney(c.custoMensalTotal)}</span></div>
                        <div className="flex justify-between text-muted-foreground"><span>Custos únicos</span><span>{fmtMoney(c.custoUnicoTotal)}</span></div>
                        <div className="bg-[#1B2A4A] text-white rounded-lg p-3 flex justify-between font-bold mt-2">
                          <span>TOTAL ({d.duracaoMeses}m)</span><span>{fmtMoney(c.custoTotal)}</span>
                        </div>
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}

              {/* Efetivo da Obra */}
              {detailEfetivo.data && detailEfetivo.data.length > 0 && (
                <div className="bg-white rounded-xl border p-4">
                  <h4 className="font-semibold text-sm text-[#1B2A4A] mb-3 flex items-center gap-2"><Users className="h-4 w-4" /> Efetivo Atual</h4>
                  <div className="space-y-1">
                    {detailEfetivo.data.map((e: any) => (
                      <div key={e.funcao} className={`flex justify-between text-sm px-2 py-1 rounded ${e.funcao === d.funcaoSolicitada ? "bg-amber-50 font-semibold" : ""}`}>
                        <span>{e.funcao}</span><span className="font-mono">{e.quantidade}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Custo Atual Obra */}
              {detailCusto.data && (
                <div className="bg-white rounded-xl border p-4">
                  <h4 className="font-semibold text-sm text-[#1B2A4A] mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Custo Atual da Obra</h4>
                  <div className="text-sm space-y-2">
                    <div className="flex justify-between"><span className="text-muted-foreground">Funcionários alocados</span><span className="font-semibold">{detailCusto.data.totalFuncionarios}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Folha bruta mensal</span><span className="font-semibold">{fmtMoney(detailCusto.data.folhaBrutaMensal)}</span></div>
                  </div>
                </div>
              )}

              {/* Turnover */}
              {detailTurnover.data && (detailTurnover.data.contratados > 0 || detailTurnover.data.desligados > 0) && (
                <div className={`rounded-xl border p-4 ${detailTurnover.data.desligados >= 3 ? "bg-red-50 border-red-200" : "bg-white"}`}>
                  <h4 className="font-semibold text-sm text-[#1B2A4A] mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Histórico de Turnover (6 meses)</h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between"><span>Contratados ({d.funcaoSolicitada})</span><span className="font-semibold">{detailTurnover.data.contratados}</span></div>
                    <div className="flex justify-between"><span>Desligados</span><span className="font-semibold text-red-600">{detailTurnover.data.desligados}</span></div>
                  </div>
                  {detailTurnover.data.desligados >= 3 && (
                    <div className="mt-2 text-xs text-red-700 bg-red-100 rounded p-2">Alto turnover nesta função! Investigar possíveis causas antes de aprovar.</div>
                  )}
                </div>
              )}

              {/* Solicitações Similares */}
              {detailSimilares.data && detailSimilares.data.length > 0 && (
                <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
                  <h4 className="font-semibold text-sm text-amber-800 mb-3 flex items-center gap-2"><Award className="h-4 w-4" /> Solicitações Similares (7 dias)</h4>
                  {detailSimilares.data.map((s: any) => (
                    <div key={s.id} className="text-sm mb-2 last:mb-0">
                      <div className="font-semibold">SMO-{String(s.id).padStart(4, "0")} — {s.quantidade}x {d.funcaoSolicitada}</div>
                      <div className="text-xs text-muted-foreground">{s.obraNome} | {s.solicitanteNome} | <StatusBadge status={s.status} /></div>
                    </div>
                  ))}
                  <div className="text-xs text-amber-700 mt-2 bg-amber-100 rounded p-2">Considere processo seletivo conjunto para otimizar recrutamento.</div>
                </div>
              )}

              {/* Sugestão de Realocação */}
              {d.sugestaoRealocacao && (() => {
                try {
                  const sug = JSON.parse(d.sugestaoRealocacao) as any[];
                  if (sug.length === 0) return null;
                  return (
                    <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
                      <h4 className="font-semibold text-sm text-emerald-800 mb-3 flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Sugestão de Realocação</h4>
                      {sug.map((s: any, i: number) => (
                        <div key={i} className="mb-2 last:mb-0 bg-white rounded-lg p-3 text-sm">
                          <div className="font-semibold text-emerald-800">{s.obraNome}</div>
                          <div className="text-xs text-muted-foreground mt-1">{s.motivo}</div>
                        </div>
                      ))}
                    </div>
                  );
                } catch { return null; }
              })()}

              {/* Indicação de Candidato */}
              {(d.candidatoIndicadoNome || d.candidatoIndicadoTelefone || d.curriculoArquivoNome) && (
                <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                  <h4 className="font-semibold text-sm text-blue-800 mb-3 flex items-center gap-2"><UserCheck className="h-4 w-4" /> Candidato Indicado</h4>
                  <div className="space-y-2">
                    {d.candidatoIndicadoNome && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">{d.candidatoIndicadoNome}</span>
                      </div>
                    )}
                    {d.candidatoIndicadoTelefone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-blue-600" />
                        <span>{d.candidatoIndicadoTelefone}</span>
                      </div>
                    )}
                    {d.curriculoArquivoNome && (
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        <span className="text-sm">{d.curriculoArquivoNome}</span>
                        <Button variant="ghost" size="sm" className="text-red-500 h-6 px-2 text-xs"
                          onClick={() => removerCurriculoMut.mutate({ id: d.id, companyId, companyIds })}>
                          <Trash2 className="h-3 w-3 mr-1" /> Remover
                        </Button>
                      </div>
                    )}
                    {!d.curriculoArquivoNome && (
                      <label className="flex items-center gap-2 p-2 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors mt-2">
                        <Upload className="h-4 w-4 text-blue-500" />
                        <span className="text-xs text-blue-600">Anexar currículo</span>
                        <input type="file" className="hidden"
                          accept=".pdf,.doc,.docx"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 10 * 1024 * 1024) { toast.error("Máximo 10MB."); return; }
                            try {
                              const base64 = await fileToBase64(file);
                              uploadCurriculoMut.mutate({ id: d.id, companyId, companyIds, fileName: file.name, fileBase64: base64, contentType: file.type || "application/pdf" });
                            } catch { toast.error("Erro ao processar arquivo."); }
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </FullScreenDialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Rejeitar Solicitação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Motivo da Rejeição *</Label>
            <Textarea value={rejectMotivo} onChange={e => setRejectMotivo(e.target.value)} placeholder="Descreva o motivo da rejeição..." rows={3} />
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
