import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import {
  Plus, Search, Gavel, ArrowLeft, Calendar, AlertTriangle,
  Trash2, Pencil, Eye, ChevronDown, ChevronUp, Clock,
  Scale, FileText, User, Building2, DollarSign, Shield,
  X, MessageSquare,
} from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  em_andamento: { label: "Em Andamento", color: "text-blue-700", bg: "bg-blue-100" },
  aguardando_audiencia: { label: "Aguardando Audiência", color: "text-amber-700", bg: "bg-amber-100" },
  aguardando_pericia: { label: "Aguardando Perícia", color: "text-orange-700", bg: "bg-orange-100" },
  acordo: { label: "Acordo", color: "text-green-700", bg: "bg-green-100" },
  sentenca: { label: "Sentença", color: "text-purple-700", bg: "bg-purple-100" },
  recurso: { label: "Recurso", color: "text-indigo-700", bg: "bg-indigo-100" },
  execucao: { label: "Execução", color: "text-red-700", bg: "bg-red-100" },
  arquivado: { label: "Arquivado", color: "text-gray-500", bg: "bg-gray-100" },
  encerrado: { label: "Encerrado", color: "text-gray-600", bg: "bg-gray-200" },
};

const RISCO_LABELS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  baixo: { label: "Baixo", color: "text-green-700", bg: "bg-green-100", icon: "🟢" },
  medio: { label: "Médio", color: "text-amber-700", bg: "bg-amber-100", icon: "🟡" },
  alto: { label: "Alto", color: "text-orange-700", bg: "bg-orange-100", icon: "🟠" },
  critico: { label: "Crítico", color: "text-red-700", bg: "bg-red-100", icon: "🔴" },
};

const TIPO_ACAO_LABELS: Record<string, string> = {
  reclamatoria: "Reclamatória Trabalhista",
  indenizatoria: "Indenizatória",
  rescisao_indireta: "Rescisão Indireta",
  acidente_trabalho: "Acidente de Trabalho",
  doenca_ocupacional: "Doença Ocupacional",
  assedio: "Assédio",
  outros: "Outros",
};

const FASE_LABELS: Record<string, string> = {
  conhecimento: "Conhecimento",
  recursal: "Recursal",
  execucao: "Execução",
  encerrado: "Encerrado",
};

const ANDAMENTO_TIPO_LABELS: Record<string, { label: string; color: string }> = {
  audiencia: { label: "Audiência", color: "bg-blue-500" },
  despacho: { label: "Despacho", color: "bg-gray-500" },
  sentenca: { label: "Sentença", color: "bg-purple-500" },
  recurso: { label: "Recurso", color: "bg-indigo-500" },
  pericia: { label: "Perícia", color: "bg-orange-500" },
  acordo: { label: "Acordo", color: "bg-green-500" },
  pagamento: { label: "Pagamento", color: "bg-emerald-500" },
  citacao: { label: "Citação", color: "bg-amber-500" },
  intimacao: { label: "Intimação", color: "bg-yellow-500" },
  peticao: { label: "Petição", color: "bg-cyan-500" },
  outros: { label: "Outros", color: "bg-gray-400" },
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function formatBRL(val: string | null | undefined): string {
  if (!val) return "—";
  const clean = val.replace(/R\$\s*/g, "").trim();
  // Check if it's already in numeric format (e.g., "85000.00" from DB)
  // vs BRL format (e.g., "85.000,00" with dots as thousands separator)
  let num: number;
  if (clean.includes(",")) {
    // BRL format: dots are thousands, comma is decimal
    num = parseFloat(clean.replace(/\./g, "").replace(",", "."));
  } else {
    // Numeric format: dot is decimal separator
    num = parseFloat(clean);
  }
  if (isNaN(num)) return val;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function diasAte(d: string | null | undefined): number | null {
  if (!d) return null;
  const target = new Date(d + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function ProcessosTrabalhistas() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"lista" | "detalhe" | "novo">("lista");
  const [selectedProcessoId, setSelectedProcessoId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRisco, setFilterRisco] = useState("all");
  const [showAndamentoDialog, setShowAndamentoDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "processo" | "andamento"; id: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);

  // Form state
  const [form, setForm] = useState({
    employeeId: 0,
    numeroProcesso: "",
    vara: "",
    comarca: "",
    tribunal: "",
    tipoAcao: "reclamatoria" as string,
    reclamante: "",
    advogadoReclamante: "",
    advogadoEmpresa: "",
    valorCausa: "",
    dataDistribuicao: "",
    dataDesligamento: "",
    dataCitacao: "",
    dataAudiencia: "",
    status: "em_andamento" as string,
    fase: "conhecimento" as string,
    risco: "medio" as string,
    pedidos: [] as string[],
    clienteCnpj: "",
    clienteRazaoSocial: "",
    clienteNomeFantasia: "",
    observacoes: "",
  });
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [novoPedido, setNovoPedido] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  // Andamento form
  const [andamentoForm, setAndamentoForm] = useState({
    data: new Date().toISOString().split("T")[0],
    tipo: "outros" as string,
    descricao: "",
    resultado: "",
  });

  // Queries
  const processos = trpc.processos.listar.useQuery(
    { companyId, status: filterStatus !== "all" ? filterStatus : undefined },
    { enabled: companyId > 0 }
  );
  const stats = trpc.processos.estatisticas.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const detalhe = trpc.processos.getById.useQuery(
    { id: selectedProcessoId! },
    { enabled: !!selectedProcessoId && viewMode === "detalhe" }
  );
  const desligados = trpc.processos.funcionariosDesligados.useQuery(
    { companyId },
    { enabled: companyId > 0 && viewMode === "novo" }
  );

  // Mutations
  const criarMut = trpc.processos.criar.useMutation({
    onSuccess: () => {
      toast.success("Processo cadastrado com sucesso!");
      processos.refetch();
      stats.refetch();
      setViewMode("lista");
      resetForm();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const atualizarMut = trpc.processos.atualizar.useMutation({
    onSuccess: () => {
      toast.success("Processo atualizado!");
      detalhe.refetch();
      processos.refetch();
      stats.refetch();
      setEditingId(null);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const excluirMut = trpc.processos.excluir.useMutation({
    onSuccess: () => {
      toast.success("Processo excluído!");
      processos.refetch();
      stats.refetch();
      setViewMode("lista");
      setSelectedProcessoId(null);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const criarAndamentoMut = trpc.processos.criarAndamento.useMutation({
    onSuccess: () => {
      toast.success("Andamento registrado!");
      detalhe.refetch();
      setShowAndamentoDialog(false);
      setAndamentoForm({ data: new Date().toISOString().split("T")[0], tipo: "outros", descricao: "", resultado: "" });
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const excluirAndamentoMut = trpc.processos.excluirAndamento.useMutation({
    onSuccess: () => {
      toast.success("Andamento excluído!");
      detalhe.refetch();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const excluirLoteMut = trpc.processos.excluirLote.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.count} processo(s) excluído(s)!`);
      processos.refetch();
      stats.refetch();
      setSelectedIds([]);
      setShowBatchDeleteDialog(false);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) setSelectedIds([]);
    else setSelectedIds(filtered.map((p: any) => p.id));
  };

  function resetForm() {
    setForm({
      employeeId: 0, numeroProcesso: "", vara: "", comarca: "", tribunal: "",
      tipoAcao: "reclamatoria", reclamante: "", advogadoReclamante: "", advogadoEmpresa: "",
      valorCausa: "", dataDistribuicao: "", dataDesligamento: "", dataCitacao: "", dataAudiencia: "",
      status: "em_andamento", fase: "conhecimento", risco: "medio", pedidos: [],
      clienteCnpj: "", clienteRazaoSocial: "", clienteNomeFantasia: "", observacoes: "",
    });
    setNovoPedido("");
    setEditingId(null);
  }

  function handleSubmit() {
    if (!form.employeeId) return toast.error("Selecione o funcionário");
    if (!form.numeroProcesso.trim()) return toast.error("Informe o número do processo");
    if (!form.reclamante.trim()) return toast.error("Informe o nome do reclamante");

    criarMut.mutate({
      companyId,
      ...form,
      tipoAcao: form.tipoAcao as any,
      status: form.status as any,
      fase: form.fase as any,
      risco: form.risco as any,
      clienteCnpj: form.clienteCnpj || undefined,
      clienteRazaoSocial: form.clienteRazaoSocial || undefined,
      clienteNomeFantasia: form.clienteNomeFantasia || undefined,
      criadoPor: user?.name || undefined,
    });
  }

  function addPedido() {
    if (novoPedido.trim()) {
      setForm(prev => ({ ...prev, pedidos: [...prev.pedidos, novoPedido.trim()] }));
      setNovoPedido("");
    }
  }

  function removePedido(idx: number) {
    setForm(prev => ({ ...prev, pedidos: prev.pedidos.filter((_, i) => i !== idx) }));
  }

  // Filtered list
  const filtered = useMemo(() => {
    if (!processos.data) return [];
    let items = [...processos.data];
    if (searchTerm) {
      const term = searchTerm.toUpperCase();
      items = items.filter(p =>
        p.reclamante.toUpperCase().includes(term) ||
        p.numeroProcesso.toUpperCase().includes(term) ||
        (p.employee?.nomeCompleto || "").toUpperCase().includes(term) ||
        (p.vara || "").toUpperCase().includes(term)
      );
    }
    if (filterRisco !== "all") items = items.filter(p => p.risco === filterRisco);
    return items;
  }, [processos.data, searchTerm, filterRisco]);

  // ===== DETALHE VIEW =====
  if (viewMode === "detalhe" && selectedProcessoId) {
    const p = detalhe.data;
    return (
      <DashboardLayout>
      <PrintHeader />
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => { setViewMode("lista"); setSelectedProcessoId(null); }}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <Gavel className="h-5 w-5" />
                  Processo {p?.numeroProcesso || "..."}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {p?.reclamante} {p?.employee ? `(${p.employee.nomeCompleto})` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PrintActions title={`Processo Trabalhista - ${p?.numeroProcesso || ""}`} />
              <Button variant="destructive" size="sm" onClick={() => {
                setDeleteTarget({ type: "processo", id: selectedProcessoId });
                setShowDeleteDialog(true);
              }}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
              </Button>
            </div>
          </div>

          {detalhe.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : p ? (
            <>
              {/* Status + Risco badges */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_LABELS[p.status]?.bg} ${STATUS_LABELS[p.status]?.color}`}>
                  {STATUS_LABELS[p.status]?.label}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${RISCO_LABELS[p.risco]?.bg} ${RISCO_LABELS[p.risco]?.color}`}>
                  {RISCO_LABELS[p.risco]?.icon} Risco {RISCO_LABELS[p.risco]?.label}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  Fase: {FASE_LABELS[p.fase]}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  {TIPO_ACAO_LABELS[p.tipoAcao]}
                </span>
              </div>

              {/* Info cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Dados do Processo */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Scale className="h-4 w-4" /> Dados do Processo</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <EditableField label="Número" value={p.numeroProcesso} field="numeroProcesso" processoId={p.id} onSave={atualizarMut.mutate} />
                    <EditableField label="Vara" value={p.vara} field="vara" processoId={p.id} onSave={atualizarMut.mutate} />
                    <EditableField label="Comarca" value={p.comarca} field="comarca" processoId={p.id} onSave={atualizarMut.mutate} />
                    <EditableField label="Tribunal" value={p.tribunal} field="tribunal" processoId={p.id} onSave={atualizarMut.mutate} />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <select value={p.status} onChange={e => atualizarMut.mutate({ id: p.id, status: e.target.value as any })}
                        className="text-xs border rounded px-2 py-0.5 bg-background">
                        {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fase</span>
                      <select value={p.fase} onChange={e => atualizarMut.mutate({ id: p.id, fase: e.target.value as any })}
                        className="text-xs border rounded px-2 py-0.5 bg-background">
                        {Object.entries(FASE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Risco</span>
                      <select value={p.risco} onChange={e => atualizarMut.mutate({ id: p.id, risco: e.target.value as any })}
                        className="text-xs border rounded px-2 py-0.5 bg-background">
                        {Object.entries(RISCO_LABELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                      </select>
                    </div>
                  </CardContent>
                </Card>

                {/* Partes */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" /> Partes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Reclamante</span><span className="font-medium">{p.reclamante}</span></div>
                    {p.employee && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Funcionário</span><span className="font-medium">{p.employee.nomeCompleto}</span></div>
                    )}
                    <EditableField label="Adv. Reclamante" value={p.advogadoReclamante} field="advogadoReclamante" processoId={p.id} onSave={atualizarMut.mutate} />
                    <EditableField label="Adv. Empresa" value={p.advogadoEmpresa} field="advogadoEmpresa" processoId={p.id} onSave={atualizarMut.mutate} />
                  </CardContent>
                </Card>

                {/* Valores */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" /> Valores</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <EditableField label="Valor da Causa" value={p.valorCausa} field="valorCausa" processoId={p.id} onSave={atualizarMut.mutate} />
                    <EditableField label="Condenação" value={p.valorCondenacao} field="valorCondenacao" processoId={p.id} onSave={atualizarMut.mutate} />
                    <EditableField label="Acordo" value={p.valorAcordo} field="valorAcordo" processoId={p.id} onSave={atualizarMut.mutate} />
                    <EditableField label="Valor Pago" value={p.valorPago} field="valorPago" processoId={p.id} onSave={atualizarMut.mutate} />
                  </CardContent>
                </Card>

                {/* Datas */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4" /> Datas Importantes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <EditableDateField label="Distribuição" value={p.dataDistribuicao} field="dataDistribuicao" processoId={p.id} onSave={atualizarMut.mutate} />
                    <EditableDateField label="Desligamento" value={p.dataDesligamento} field="dataDesligamento" processoId={p.id} onSave={atualizarMut.mutate} />
                    <EditableDateField label="Citação" value={p.dataCitacao} field="dataCitacao" processoId={p.id} onSave={atualizarMut.mutate} />
                    <EditableDateField label="Próx. Audiência" value={p.dataAudiencia} field="dataAudiencia" processoId={p.id} onSave={atualizarMut.mutate} highlight />
                    <EditableDateField label="Encerramento" value={p.dataEncerramento} field="dataEncerramento" processoId={p.id} onSave={atualizarMut.mutate} />
                  </CardContent>
                </Card>

                {/* Pedidos */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Pedidos do Reclamante</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {(p.pedidos as string[] || []).map((ped: string, i: number) => (
                        <div key={i} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1 text-xs">
                          <span>{ped}</span>
                          <button onClick={() => {
                            const newPedidos = (p.pedidos as string[]).filter((_: string, idx: number) => idx !== i);
                            atualizarMut.mutate({ id: p.id, pedidos: newPedidos });
                          }} className="text-red-500 hover:text-red-700"><X className="h-3 w-3" /></button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1 mt-2">
                      <input type="text" placeholder="Novo pedido..." value={novoPedido} onChange={e => setNovoPedido(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (novoPedido.trim()) { atualizarMut.mutate({ id: p.id, pedidos: [...(p.pedidos as string[] || []), novoPedido.trim()] }); setNovoPedido(""); } } }}
                        className="flex-1 text-xs border rounded px-2 py-1 bg-background" />
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                        if (novoPedido.trim()) { atualizarMut.mutate({ id: p.id, pedidos: [...(p.pedidos as string[] || []), novoPedido.trim()] }); setNovoPedido(""); }
                      }}><Plus className="h-3 w-3" /></Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Cliente Corresponsável */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Cliente / Tomador</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <EditableField label="CNPJ" value={p.clienteCnpj} field="clienteCnpj" processoId={p.id} onSave={atualizarMut.mutate} />
                    <EditableField label="Razão Social" value={p.clienteRazaoSocial} field="clienteRazaoSocial" processoId={p.id} onSave={atualizarMut.mutate} />
                    <EditableField label="Nome Fantasia" value={p.clienteNomeFantasia} field="clienteNomeFantasia" processoId={p.id} onSave={atualizarMut.mutate} />
                  </CardContent>
                </Card>

                {/* Observações */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Observações</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <textarea value={p.observacoes || ""} onChange={e => atualizarMut.mutate({ id: p.id, observacoes: e.target.value })}
                      className="w-full text-xs border rounded p-2 bg-background min-h-[80px]" placeholder="Observações sobre o processo..." />
                  </CardContent>
                </Card>
              </div>

              {/* Timeline de Andamentos */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Andamentos do Processo</CardTitle>
                    <Button size="sm" onClick={() => setShowAndamentoDialog(true)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Novo Andamento
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {p.andamentos && p.andamentos.length > 0 ? (
                    <div className="relative">
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                      <div className="space-y-4">
                        {p.andamentos.map((a: any) => {
                          const tipoInfo = ANDAMENTO_TIPO_LABELS[a.tipo] || ANDAMENTO_TIPO_LABELS.outros;
                          return (
                            <div key={a.id} className="relative pl-10">
                              <div className={`absolute left-2.5 top-1 w-3 h-3 rounded-full ${tipoInfo.color} ring-2 ring-background`} />
                              <div className="bg-muted/30 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${tipoInfo.color} text-white`}>{tipoInfo.label}</span>
                                    <span className="text-xs text-muted-foreground">{formatDate(a.data)}</span>
                                  </div>
                                  <button onClick={() => {
                                    setDeleteTarget({ type: "andamento", id: a.id });
                                    setShowDeleteDialog(true);
                                  }} className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                                </div>
                                <p className="text-sm">{a.descricao}</p>
                                {a.resultado && <p className="text-xs text-muted-foreground mt-1">Resultado: {a.resultado}</p>}
                                {a.criadoPor && <p className="text-xs text-muted-foreground mt-1">Por: {a.criadoPor}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground text-sm py-6">Nenhum andamento registrado</p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        {/* Dialog Novo Andamento */}
        <Dialog open={showAndamentoDialog} onOpenChange={setShowAndamentoDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Novo Andamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Data *</label>
                <input type="date" value={andamentoForm.data} onChange={e => setAndamentoForm(prev => ({ ...prev, data: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm bg-background" />
              </div>
              <div>
                <label className="text-xs font-medium">Tipo *</label>
                <select value={andamentoForm.tipo} onChange={e => setAndamentoForm(prev => ({ ...prev, tipo: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm bg-background">
                  {Object.entries(ANDAMENTO_TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Descrição *</label>
                <textarea value={andamentoForm.descricao} onChange={e => setAndamentoForm(prev => ({ ...prev, descricao: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm bg-background min-h-[80px]" placeholder="Descreva o andamento..." />
              </div>
              <div>
                <label className="text-xs font-medium">Resultado (opcional)</label>
                <input type="text" value={andamentoForm.resultado} onChange={e => setAndamentoForm(prev => ({ ...prev, resultado: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm bg-background" placeholder="Ex: Audiência adiada, Acordo proposto..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAndamentoDialog(false)}>Cancelar</Button>
              <Button onClick={() => {
                if (!andamentoForm.data || !andamentoForm.descricao.trim()) return toast.error("Preencha data e descrição");
                criarAndamentoMut.mutate({
                  processoId: selectedProcessoId!,
                  ...andamentoForm,
                  tipo: andamentoForm.tipo as any,
                  criadoPor: user?.name || undefined,
                });
              }} disabled={criarAndamentoMut.isPending}>
                {criarAndamentoMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Confirmação Exclusão */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" /> Confirmar Exclusão
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm">
              {deleteTarget?.type === "processo"
                ? "Tem certeza que deseja excluir este processo e todos os seus andamentos? Esta ação não pode ser desfeita."
                : "Tem certeza que deseja excluir este andamento?"}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => {
                if (deleteTarget?.type === "processo") excluirMut.mutate({ id: deleteTarget.id });
                else if (deleteTarget?.type === "andamento") excluirAndamentoMut.mutate({ id: deleteTarget.id });
                setShowDeleteDialog(false);
              }}>Excluir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    );
  }

  // ===== NOVO PROCESSO =====
  if (viewMode === "novo") {
    return (
      <DashboardLayout>
      <PrintHeader />
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setViewMode("lista"); resetForm(); }}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold">Novo Processo Trabalhista</h1>
              <p className="text-sm text-muted-foreground">Cadastre um novo processo vinculado a um funcionário desligado</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Funcionário */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Funcionário Desligado *</CardTitle>
              </CardHeader>
              <CardContent>
                <select value={form.employeeId || ""} onChange={e => {
                  const empId = parseInt(e.target.value);
                  const emp = desligados.data?.find(d => d.id === empId);
                  setForm(prev => ({
                    ...prev,
                    employeeId: empId,
                    reclamante: emp?.nomeCompleto || prev.reclamante,
                    dataDesligamento: emp?.dataDemissao || prev.dataDesligamento,
                  }));
                }} className="w-full border rounded px-3 py-2 text-sm bg-background">
                  <option value="">Selecione o funcionário...</option>
                  {desligados.data?.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.nomeCompleto} — {d.funcao || "Sem função"} — CPF: {d.cpf || "N/I"} {d.dataDemissao ? `— Deslig: ${formatDate(d.dataDemissao)}` : ""}
                    </option>
                  ))}
                </select>
                {desligados.data?.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">Nenhum funcionário com status "Desligado" encontrado nesta empresa.</p>
                )}
              </CardContent>
            </Card>

            {/* Dados do Processo */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Dados do Processo</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs font-medium">Número do Processo *</label>
                  <input type="text" value={form.numeroProcesso} onChange={e => setForm(prev => ({ ...prev, numeroProcesso: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm bg-background" placeholder="0000000-00.0000.0.00.0000" />
                </div>
                <div>
                  <label className="text-xs font-medium">Tipo de Ação</label>
                  <select value={form.tipoAcao} onChange={e => setForm(prev => ({ ...prev, tipoAcao: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm bg-background">
                    {Object.entries(TIPO_ACAO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium">Vara</label>
                    <input type="text" value={form.vara} onChange={e => setForm(prev => ({ ...prev, vara: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm bg-background" placeholder="1ª Vara do Trabalho" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Comarca</label>
                    <input type="text" value={form.comarca} onChange={e => setForm(prev => ({ ...prev, comarca: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm bg-background" placeholder="São Paulo" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium">Tribunal</label>
                  <input type="text" value={form.tribunal} onChange={e => setForm(prev => ({ ...prev, tribunal: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm bg-background" placeholder="TRT-2" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium">Risco</label>
                    <select value={form.risco} onChange={e => setForm(prev => ({ ...prev, risco: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm bg-background">
                      {Object.entries(RISCO_LABELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium">Valor da Causa</label>
                    <input type="text" value={form.valorCausa} onChange={e => setForm(prev => ({ ...prev, valorCausa: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm bg-background" placeholder="R$ 50.000,00" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Partes e Advogados */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Partes e Advogados</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs font-medium">Nome do Reclamante *</label>
                  <input type="text" value={form.reclamante} onChange={e => setForm(prev => ({ ...prev, reclamante: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm bg-background" placeholder="Nome completo" />
                </div>
                <div>
                  <label className="text-xs font-medium">Advogado do Reclamante</label>
                  <input type="text" value={form.advogadoReclamante} onChange={e => setForm(prev => ({ ...prev, advogadoReclamante: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm bg-background" placeholder="Dr. Fulano de Tal — OAB/SP 123456" />
                </div>
                <div>
                  <label className="text-xs font-medium">Advogado da Empresa</label>
                  <input type="text" value={form.advogadoEmpresa} onChange={e => setForm(prev => ({ ...prev, advogadoEmpresa: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm bg-background" placeholder="Dr. Beltrano — OAB/SP 654321" />
                </div>
              </CardContent>
            </Card>

            {/* Cliente Corresponsável */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Cliente / Tomador (Corresponsável)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs font-medium">CNPJ do Cliente</label>
                  <div className="flex gap-1">
                    <input type="text" value={form.clienteCnpj} onChange={e => {
                      let v = e.target.value.replace(/\D/g, "");
                      if (v.length > 14) v = v.slice(0, 14);
                      if (v.length > 12) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, "$1.$2.$3/$4-$5");
                      else if (v.length > 8) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, "$1.$2.$3/$4");
                      else if (v.length > 5) v = v.replace(/(\d{2})(\d{3})(\d{1,3})/, "$1.$2.$3");
                      else if (v.length > 2) v = v.replace(/(\d{2})(\d{1,3})/, "$1.$2");
                      setForm(prev => ({ ...prev, clienteCnpj: v }));
                    }}
                      className="flex-1 border rounded px-3 py-2 text-sm bg-background font-mono" placeholder="00.000.000/0000-00" />
                    <Button size="sm" variant="outline" className="h-9 text-xs" disabled={buscandoCnpj || form.clienteCnpj.replace(/\D/g, "").length !== 14}
                      onClick={async () => {
                        const cnpjNum = form.clienteCnpj.replace(/\D/g, "");
                        if (cnpjNum.length !== 14) return toast.error("CNPJ deve ter 14 dígitos");
                        setBuscandoCnpj(true);
                        try {
                          const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjNum}`);
                          if (!resp.ok) throw new Error("CNPJ não encontrado");
                          const data = await resp.json();
                          setForm(prev => ({
                            ...prev,
                            clienteRazaoSocial: data.razao_social || "",
                            clienteNomeFantasia: data.nome_fantasia || "",
                          }));
                          toast.success("Dados do CNPJ carregados!");
                        } catch {
                          toast.error("Não foi possível consultar o CNPJ. Preencha manualmente.");
                        } finally {
                          setBuscandoCnpj(false);
                        }
                      }}>
                      {buscandoCnpj ? "..." : "Buscar"}
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium">Razão Social</label>
                  <input type="text" value={form.clienteRazaoSocial} onChange={e => setForm(prev => ({ ...prev, clienteRazaoSocial: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm bg-background" placeholder="Razão social do cliente" />
                </div>
                <div>
                  <label className="text-xs font-medium">Nome Fantasia</label>
                  <input type="text" value={form.clienteNomeFantasia} onChange={e => setForm(prev => ({ ...prev, clienteNomeFantasia: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm bg-background" placeholder="Nome fantasia do cliente" />
                </div>
              </CardContent>
            </Card>

            {/* Datas */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Datas</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium">Distribuição</label>
                    <input type="date" value={form.dataDistribuicao} onChange={e => setForm(prev => ({ ...prev, dataDistribuicao: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm bg-background" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Desligamento</label>
                    <input type="date" value={form.dataDesligamento} onChange={e => setForm(prev => ({ ...prev, dataDesligamento: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm bg-background" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium">Citação</label>
                    <input type="date" value={form.dataCitacao} onChange={e => setForm(prev => ({ ...prev, dataCitacao: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm bg-background" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Próx. Audiência</label>
                    <input type="date" value={form.dataAudiencia} onChange={e => setForm(prev => ({ ...prev, dataAudiencia: e.target.value }))}
                      className="w-full border rounded px-3 py-2 text-sm bg-background" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pedidos */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Pedidos do Reclamante</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1 mb-2">
                  {form.pedidos.map((ped, i) => (
                    <div key={i} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1 text-xs">
                      <span>{ped}</span>
                      <button onClick={() => removePedido(i)} className="text-red-500 hover:text-red-700"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input type="text" placeholder="Ex: Horas extras, Danos morais..." value={novoPedido} onChange={e => setNovoPedido(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPedido(); } }}
                    className="flex-1 text-xs border rounded px-2 py-1.5 bg-background" />
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addPedido}><Plus className="h-3 w-3" /></Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Observações */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Observações</CardTitle></CardHeader>
            <CardContent>
              <textarea value={form.observacoes} onChange={e => setForm(prev => ({ ...prev, observacoes: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm bg-background min-h-[80px]" placeholder="Observações gerais sobre o processo..." />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setViewMode("lista"); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={criarMut.isPending}>
              {criarMut.isPending ? "Salvando..." : "Cadastrar Processo"}
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ===== LISTA VIEW =====
  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Gavel className="h-5 w-5" /> Processos Trabalhistas</h1>
            <p className="text-sm text-muted-foreground">Acompanhamento de processos trabalhistas vinculados a funcionários desligados</p>
          </div>
          <div className="flex items-center gap-2">
            <PrintActions title="Processos Trabalhistas" />
            <Button onClick={() => setViewMode("novo")}><Plus className="h-4 w-4 mr-1" /> Novo Processo</Button>
          </div>
        </div>

        {/* Stats */}
        {stats.data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-blue-700">{stats.data.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-amber-700">{stats.data.emAndamento}</p>
              <p className="text-xs text-muted-foreground">Em Andamento</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-green-700">{stats.data.encerrados}</p>
              <p className="text-xs text-muted-foreground">Encerrados</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-red-700">{stats.data.porRisco.critico + stats.data.porRisco.alto}</p>
              <p className="text-xs text-muted-foreground">Alto/Crítico</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-purple-700">{formatBRL(String(stats.data.totalValorCausa))}</p>
              <p className="text-xs text-muted-foreground">Valor Causas</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-emerald-700">{formatBRL(String(stats.data.totalValorPago))}</p>
              <p className="text-xs text-muted-foreground">Total Pago</p>
            </div>
          </div>
        )}

        {/* Próximas Audiências */}
        {stats.data?.proximasAudiencias && stats.data.proximasAudiencias.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-3">
              <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Próximas Audiências</p>
              <div className="flex flex-wrap gap-2">
                {stats.data.proximasAudiencias.map((p: any) => {
                  const dias = diasAte(p.dataAudiencia);
                  return (
                    <button key={p.id} onClick={() => { setSelectedProcessoId(p.id); setViewMode("detalhe"); }}
                      className="bg-white rounded-lg px-3 py-1.5 text-xs border border-amber-200 hover:border-amber-400 cursor-pointer transition-all">
                      <span className="font-semibold">{formatDate(p.dataAudiencia)}</span>
                      <span className="text-muted-foreground ml-1">({dias != null && dias >= 0 ? `${dias}d` : "Passada"})</span>
                      <span className="block text-muted-foreground">{p.reclamante}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Buscar por nome, número do processo, vara..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-background" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-background">
            <option value="all">Todos os Status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterRisco} onChange={e => setFilterRisco(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-background">
            <option value="all">Todos os Riscos</option>
            {Object.entries(RISCO_LABELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
        </div>

        {/* Table */}
        {processos.isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando processos...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Gavel className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Nenhum processo trabalhista encontrado</p>
              <Button className="mt-3" onClick={() => setViewMode("novo")}><Plus className="h-4 w-4 mr-1" /> Cadastrar Primeiro Processo</Button>
            </CardContent>
          </Card>
        ) : (
          <>
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-3 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-sm font-medium text-blue-700">{selectedIds.length} processo(s) selecionado(s)</span>
              <Button variant="destructive" size="sm" onClick={() => setShowBatchDeleteDialog(true)}>
                <Trash2 className="h-4 w-4 mr-1" /> Excluir Selecionados
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedIds([])}>
                <X className="h-4 w-4 mr-1" /> Limpar Seleção
              </Button>
            </div>
          )}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left bg-muted/50">
                      <th className="p-2.5 w-10"><input type="checkbox" checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded" /></th>
                      <th className="p-2.5 font-medium">Nº Processo</th>
                      <th className="p-2.5 font-medium">Reclamante</th>
                      <th className="p-2.5 font-medium">Tipo</th>
                      <th className="p-2.5 font-medium text-center">Status</th>
                      <th className="p-2.5 font-medium text-center">Risco</th>
                      <th className="p-2.5 font-medium text-center">Fase</th>
                      <th className="p-2.5 font-medium">Valor Causa</th>
                      <th className="p-2.5 font-medium">Próx. Audiência</th>
                      <th className="p-2.5 font-medium text-center w-24">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p: any) => {
                      const statusInfo = STATUS_LABELS[p.status] || STATUS_LABELS.em_andamento;
                      const riscoInfo = RISCO_LABELS[p.risco] || RISCO_LABELS.medio;
                      const dias = diasAte(p.dataAudiencia);
                      return (
                        <tr key={p.id} className={`border-b hover:bg-muted/30 ${selectedIds.includes(p.id) ? "bg-blue-50" : ""}`}>
                          <td className="p-2.5" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} className="w-4 h-4 rounded" /></td>
                          <td className="p-2.5 font-mono text-xs cursor-pointer" onClick={() => { setSelectedProcessoId(p.id); setViewMode("detalhe"); }}>{p.numeroProcesso}</td>
                          <td className="p-2.5">
                            <p className="font-medium text-sm">{p.reclamante}</p>
                            {p.employee && <p className="text-xs text-muted-foreground">{p.employee.funcao || ""}</p>}
                          </td>
                          <td className="p-2.5 text-xs">{TIPO_ACAO_LABELS[p.tipoAcao] || p.tipoAcao}</td>
                          <td className="p-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.bg} ${statusInfo.color}`}>{statusInfo.label}</span>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${riscoInfo.bg} ${riscoInfo.color}`}>{riscoInfo.icon} {riscoInfo.label}</span>
                          </td>
                          <td className="p-2.5 text-center text-xs">{FASE_LABELS[p.fase]}</td>
                          <td className="p-2.5 text-xs">{formatBRL(p.valorCausa)}</td>
                          <td className="p-2.5 text-xs">
                            {p.dataAudiencia ? (
                              <span className={dias != null && dias <= 7 ? "text-red-600 font-semibold" : dias != null && dias <= 30 ? "text-amber-600" : ""}>
                                {formatDate(p.dataAudiencia)}
                                {dias != null && dias >= 0 && <span className="text-muted-foreground ml-1">({dias}d)</span>}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="p-2.5">
                            <div className="flex items-center gap-1">
                              <button onClick={(e) => { e.stopPropagation(); setSelectedProcessoId(p.id); setViewMode("detalhe"); }} className="p-1 hover:bg-blue-100 rounded" title="Ver"><Eye className="h-4 w-4 text-muted-foreground" /></button>
                              <button onClick={(e) => { e.stopPropagation(); setSelectedProcessoId(p.id); setViewMode("detalhe"); }} className="p-1 hover:bg-amber-100 rounded" title="Editar"><Pencil className="h-4 w-4 text-amber-600" /></button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "processo", id: p.id }); setShowDeleteDialog(true); }} className="p-1 hover:bg-red-100 rounded" title="Excluir"><Trash2 className="h-4 w-4 text-red-500" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Dialog de exclusão em lote */}
          <Dialog open={showBatchDeleteDialog} onOpenChange={setShowBatchDeleteDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5" /> Excluir {selectedIds.length} processo(s)?
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita. Os processos selecionados serão removidos permanentemente.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowBatchDeleteDialog(false)}>Cancelar</Button>
                <Button variant="destructive" onClick={() => excluirLoteMut.mutate({ ids: selectedIds })} disabled={excluirLoteMut.isPending}>
                  {excluirLoteMut.isPending ? "Excluindo..." : `Excluir ${selectedIds.length} processo(s)`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog de exclusão individual (tabela) */}
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5" /> Confirmar Exclusão
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm">Tem certeza que deseja excluir este processo e todos os seus andamentos? Esta ação não pode ser desfeita.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowDeleteDialog(false); setDeleteTarget(null); }}>Cancelar</Button>
                <Button variant="destructive" onClick={() => {
                  if (deleteTarget) {
                    if (deleteTarget.type === "processo") excluirMut.mutate({ id: deleteTarget.id });
                    else excluirAndamentoMut.mutate({ id: deleteTarget.id });
                  }
                  setShowDeleteDialog(false);
                  setDeleteTarget(null);
                }}>Excluir</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

// ===== COMPONENTES AUXILIARES =====

function EditableField({ label, value, field, processoId, onSave }: {
  label: string; value: string | null | undefined; field: string; processoId: number;
  onSave: (data: any) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");

  if (editing) {
    return (
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground text-xs">{label}</span>
        <div className="flex gap-1">
          <input type="text" value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { onSave({ id: processoId, [field]: val }); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
            className="text-xs border rounded px-2 py-0.5 w-36 bg-background" autoFocus />
          <button onClick={() => { onSave({ id: processoId, [field]: val }); setEditing(false); }} className="text-green-600"><Pencil className="h-3 w-3" /></button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-between items-center group cursor-pointer" onClick={() => { setVal(value || ""); setEditing(true); }}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-xs group-hover:text-blue-600">{field.startsWith("valor") ? formatBRL(value) : (value || "—")}</span>
    </div>
  );
}

function EditableDateField({ label, value, field, processoId, onSave, highlight }: {
  label: string; value: string | null | undefined; field: string; processoId: number;
  onSave: (data: any) => void; highlight?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");
  const dias = highlight ? diasAte(value) : null;

  if (editing) {
    return (
      <div className="flex justify-between items-center">
        <span className="text-muted-foreground text-xs">{label}</span>
        <div className="flex gap-1">
          <input type="date" value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { onSave({ id: processoId, [field]: val || null }); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
            className="text-xs border rounded px-2 py-0.5 bg-background" autoFocus />
          <button onClick={() => { onSave({ id: processoId, [field]: val || null }); setEditing(false); }} className="text-green-600"><Pencil className="h-3 w-3" /></button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-between items-center group cursor-pointer" onClick={() => { setVal(value || ""); setEditing(true); }}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`font-medium text-xs group-hover:text-blue-600 ${highlight && dias != null && dias <= 7 ? "text-red-600 font-bold" : highlight && dias != null && dias <= 30 ? "text-amber-600" : ""}`}>
        {formatDate(value)}
        {highlight && dias != null && dias >= 0 && <span className="text-muted-foreground ml-1">({dias}d)</span>}
      </span>
    </div>
  );
}
