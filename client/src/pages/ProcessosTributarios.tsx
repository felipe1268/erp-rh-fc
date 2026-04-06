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
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import {
  Plus, Search, Scale, ArrowLeft, Calendar, AlertTriangle,
  Trash2, Pencil, Eye, ChevronDown, ChevronUp,
  FileText, DollarSign, X, Save, Receipt, Clock,
} from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  em_andamento: { label: "Em Andamento", color: "text-blue-700", bg: "bg-blue-100" },
  aguardando_julgamento: { label: "Aguardando Julgamento", color: "text-amber-700", bg: "bg-amber-100" },
  recurso_administrativo: { label: "Recurso Administrativo", color: "text-orange-700", bg: "bg-orange-100" },
  recurso: { label: "Recurso Judicial", color: "text-indigo-700", bg: "bg-indigo-100" },
  execucao_fiscal: { label: "Execução Fiscal", color: "text-red-700", bg: "bg-red-100" },
  sentenca: { label: "Sentença", color: "text-purple-700", bg: "bg-purple-100" },
  acordo: { label: "Acordo/Parcelamento", color: "text-green-700", bg: "bg-green-100" },
  arquivado: { label: "Arquivado", color: "text-gray-500", bg: "bg-gray-100" },
  encerrado: { label: "Encerrado", color: "text-gray-600", bg: "bg-gray-200" },
};

const RISCO_LABELS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  baixo: { label: "Baixo", color: "text-green-700", bg: "bg-green-100", icon: "🟢" },
  medio: { label: "Médio", color: "text-amber-700", bg: "bg-amber-100", icon: "🟡" },
  alto: { label: "Alto", color: "text-orange-700", bg: "bg-orange-100", icon: "🟠" },
  critico: { label: "Crítico", color: "text-red-700", bg: "bg-red-100", icon: "🔴" },
};

const TRIBUTO_LABELS: Record<string, string> = {
  icms: "ICMS",
  iss: "ISS",
  iptu: "IPTU",
  irpj: "IRPJ",
  csll: "CSLL",
  pis: "PIS",
  cofins: "COFINS",
  ipi: "IPI",
  inss: "INSS",
  fgts: "FGTS",
  itbi: "ITBI",
  itcmd: "ITCMD",
  taxa: "Taxa",
  contribuicao: "Contribuição",
  outros: "Outros",
};

const ESFERA_LABELS: Record<string, string> = {
  judicial: "Judicial",
  administrativa: "Administrativa",
  carf: "CARF",
  tit: "TIT",
  outros: "Outros",
};

const FASE_LABELS: Record<string, string> = {
  conhecimento: "Conhecimento",
  instrucao: "Instrução",
  decisoria: "Decisória",
  recursal: "Recursal",
  execucao: "Execução",
  encerrado: "Encerrado",
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
  let num: number;
  if (clean.includes(",")) {
    num = parseFloat(clean.replace(/\./g, "").replace(",", "."));
  } else {
    num = parseFloat(clean);
  }
  if (isNaN(num)) return val;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ProcessosTributarios() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId && !isConstrutoras ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = companyIds.length > 0 ? companyIds[0] : companyId;
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"lista" | "detalhe" | "novo">("lista");
  const [selectedProcessoId, setSelectedProcessoId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRisco, setFilterRisco] = useState("all");
  const [filterEntidade, setFilterEntidade] = useState("all");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);

  const [form, setForm] = useState({
    numeroProcesso: "",
    tipoTributo: "icms" as string,
    esfera: "judicial" as string,
    orgaoJulgador: "",
    vara: "",
    comarca: "",
    tribunal: "",
    autoInfracao: "",
    valorAutoInfracao: "",
    valorCausa: "",
    contribuinte: "",
    cnpjContribuinte: "",
    advogadoResponsavel: "",
    dataDistribuicao: "",
    dataAutoInfracao: "",
    dataAudiencia: "",
    status: "em_andamento" as string,
    fase: "conhecimento" as string,
    risco: "medio" as string,
    observacoes: "",
  });

  const processos = trpc.processosTributarios.listar.useQuery(
    { companyId: queryCompanyId, companyIds: companyIds.length > 0 ? companyIds : undefined },
    { enabled: queryCompanyId > 0 || companyIds.length > 0 }
  );
  const detalhe = trpc.processosTributarios.getById.useQuery(
    { id: selectedProcessoId!, companyId: queryCompanyId, companyIds: companyIds.length > 0 ? companyIds : undefined },
    { enabled: !!selectedProcessoId && viewMode === "detalhe" && queryCompanyId > 0 }
  );

  const criarMut = trpc.processosTributarios.criar.useMutation({
    onSuccess: () => {
      toast.success("Processo tributário cadastrado!");
      processos.refetch();
      setViewMode("lista"); resetForm();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const atualizarMut = trpc.processosTributarios.atualizar.useMutation({
    onSuccess: () => {
      toast.success("Processo atualizado!");
      detalhe.refetch(); processos.refetch();
      setEditingId(null);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const excluirMut = trpc.processosTributarios.excluir.useMutation({
    onSuccess: () => {
      toast.success("Processo excluído!");
      processos.refetch();
      setViewMode("lista"); setSelectedProcessoId(null);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const excluirLoteMut = trpc.processosTributarios.excluirLote.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.count} processo(s) excluído(s)!`);
      processos.refetch();
      setSelectedIds([]); setShowBatchDeleteDialog(false);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const [showAndamentoDialog, setShowAndamentoDialog] = useState(false);
  const [andamentoForm, setAndamentoForm] = useState({ data: new Date().toISOString().split("T")[0], tipo: "outros", descricao: "", resultado: "" });
  const [deleteAndamentoTarget, setDeleteAndamentoTarget] = useState<{ id: number; processoId: number; companyId: number; companyIds?: number[] } | null>(null);

  const criarAndamentoMut = trpc.processosTributarios.criarAndamento.useMutation({
    onSuccess: () => {
      toast.success("Andamento registrado!");
      detalhe.refetch();
      setShowAndamentoDialog(false);
      setAndamentoForm({ data: new Date().toISOString().split("T")[0], tipo: "outros", descricao: "", resultado: "" });
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });
  const excluirAndamentoMut = trpc.processosTributarios.excluirAndamento.useMutation({
    onSuccess: () => {
      toast.success("Andamento excluído!");
      detalhe.refetch();
      setDeleteAndamentoTarget(null);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const documentos = trpc.processosTributarios.listarDocumentos.useQuery(
    { processoId: selectedProcessoId!, companyId: queryCompanyId, companyIds: companyIds.length > 0 ? companyIds : undefined },
    { enabled: !!selectedProcessoId && viewMode === "detalhe" && queryCompanyId > 0 }
  );
  const excluirDocumentoMut = trpc.processosTributarios.excluirDocumento.useMutation({
    onSuccess: () => {
      toast.success("Documento excluído!");
      documentos.refetch();
    },
    onError: (err: { message: string }) => toast.error(`Erro: ${err.message}`),
  });
  const [deleteDocTarget, setDeleteDocTarget] = useState<{ id: number; processoId: number } | null>(null);

  function resetForm() {
    setForm({
      numeroProcesso: "", tipoTributo: "icms", esfera: "judicial",
      orgaoJulgador: "", vara: "", comarca: "", tribunal: "",
      autoInfracao: "", valorAutoInfracao: "", valorCausa: "",
      contribuinte: "", cnpjContribuinte: "", advogadoResponsavel: "",
      dataDistribuicao: "", dataAutoInfracao: "", dataAudiencia: "",
      status: "em_andamento", fase: "conhecimento", risco: "medio", observacoes: "",
    });
    setEditingId(null);
  }

  function handleSubmit() {
    if (!form.numeroProcesso.trim()) return toast.error("Informe o número do processo");
    if (!form.contribuinte.trim()) return toast.error("Informe o contribuinte");
    criarMut.mutate({
      companyId: queryCompanyId,
      numeroProcesso: form.numeroProcesso,
      contribuinte: form.contribuinte,
      cnpjContribuinte: form.cnpjContribuinte || undefined,
      orgaoJulgador: form.orgaoJulgador || undefined,
      vara: form.vara || undefined,
      comarca: form.comarca || undefined,
      tribunal: form.tribunal || undefined,
      autoInfracao: form.autoInfracao || undefined,
      valorAutoInfracao: form.valorAutoInfracao || undefined,
      valorCausa: form.valorCausa || undefined,
      advogadoResponsavel: form.advogadoResponsavel || undefined,
      dataDistribuicao: form.dataDistribuicao || undefined,
      dataAutoInfracao: form.dataAutoInfracao || undefined,
      dataAudiencia: form.dataAudiencia || undefined,
      observacoes: form.observacoes || undefined,
      tipoTributo: form.tipoTributo as "icms" | "iss" | "iptu" | "irpj" | "csll" | "pis" | "cofins" | "ipi" | "inss" | "fgts" | "itbi" | "itcmd" | "taxa" | "contribuicao" | "outros",
      esfera: form.esfera as "judicial" | "administrativa" | "carf" | "tit" | "outros",
      status: form.status as "em_andamento" | "aguardando_julgamento" | "recurso_administrativo" | "recurso" | "execucao_fiscal" | "sentenca" | "acordo" | "arquivado" | "encerrado",
      fase: form.fase as "conhecimento" | "instrucao" | "decisoria" | "recursal" | "execucao" | "encerrado",
      risco: form.risco as "baixo" | "medio" | "alto" | "critico",
      criadoPor: user?.name || undefined,
    });
  }

  const filtered = useMemo(() => {
    if (!processos.data) return [];
    let items = [...processos.data];
    if (searchTerm) {
      const term = searchTerm.toUpperCase();
      items = items.filter(p =>
        p.contribuinte.toUpperCase().includes(term) ||
        p.numeroProcesso.toUpperCase().includes(term) ||
        (p.autoInfracao || "").toUpperCase().includes(term)
      );
    }
    if (filterStatus !== "all") items = items.filter(p => p.status === filterStatus);
    if (filterRisco !== "all") items = items.filter(p => p.risco === filterRisco);
    if (filterEntidade !== "all") {
      items = items.filter(p => {
        const c = (p.contribuinte || "").toLowerCase();
        if (filterEntidade === "jf") return c.includes("julio ferraz");
        if (filterEntidade === "fc") return c.includes("fc engenharia") || c.includes("felipe costa");
        return true;
      });
    }
    return items;
  }, [processos.data, searchTerm, filterStatus, filterRisco, filterEntidade]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) setSelectedIds([]);
    else setSelectedIds(filtered.map(p => p.id));
  };

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
                  <Scale className="h-5 w-5 text-teal-600" />
                  Processo Tributário {p?.numeroProcesso || "..."}
                </h1>
                <p className="text-sm text-muted-foreground">{p?.contribuinte}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PrintActions title={`Processo Tributário - ${p?.numeroProcesso || ""}`} />
              <Button variant="destructive" size="sm" onClick={() => { setDeleteTargetId(selectedProcessoId); setShowDeleteDialog(true); }}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
              </Button>
            </div>
          </div>

          {detalhe.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : p ? (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_LABELS[p.status]?.bg} ${STATUS_LABELS[p.status]?.color}`}>
                  {STATUS_LABELS[p.status]?.label}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${RISCO_LABELS[p.risco]?.bg} ${RISCO_LABELS[p.risco]?.color}`}>
                  {RISCO_LABELS[p.risco]?.icon} Risco {RISCO_LABELS[p.risco]?.label}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-700">
                  {TRIBUTO_LABELS[p.tipoTributo] || p.tipoTributo}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                  {ESFERA_LABELS[p.esfera] || p.esfera}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Dados do Processo</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {editingId === p.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground">Tipo de Tributo</label>
                            <select className="w-full border rounded px-2 py-1 text-sm" value={form.tipoTributo} onChange={e => setForm(f => ({ ...f, tipoTributo: e.target.value }))}>
                              {Object.entries(TRIBUTO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Esfera</label>
                            <select className="w-full border rounded px-2 py-1 text-sm" value={form.esfera} onChange={e => setForm(f => ({ ...f, esfera: e.target.value }))}>
                              {Object.entries(ESFERA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground">Status</label>
                            <select className="w-full border rounded px-2 py-1 text-sm" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Risco</label>
                            <select className="w-full border rounded px-2 py-1 text-sm" value={form.risco} onChange={e => setForm(f => ({ ...f, risco: e.target.value }))}>
                              {Object.entries(RISCO_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Valor da Causa</label>
                          <input className="w-full border rounded px-2 py-1 text-sm" value={form.valorCausa} onChange={e => setForm(f => ({ ...f, valorCausa: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Observações</label>
                          <textarea className="w-full border rounded px-2 py-1 text-sm" rows={3} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => atualizarMut.mutate({ id: p.id, companyId: queryCompanyId, companyIds: companyIds.length > 0 ? companyIds : undefined, ...form })} disabled={atualizarMut.isPending}>
                            <Save className="h-3.5 w-3.5 mr-1" /> Salvar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Número</span><span className="font-mono">{p.numeroProcesso}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Contribuinte</span><span>{p.contribuinte}</span></div>
                        {p.cnpjContribuinte && <div className="flex justify-between"><span className="text-muted-foreground">CNPJ</span><span className="font-mono">{p.cnpjContribuinte}</span></div>}
                        <div className="flex justify-between"><span className="text-muted-foreground">Tributo</span><span>{TRIBUTO_LABELS[p.tipoTributo]}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Esfera</span><span>{ESFERA_LABELS[p.esfera]}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Fase</span><span>{FASE_LABELS[p.fase]}</span></div>
                        {p.autoInfracao && <div className="flex justify-between"><span className="text-muted-foreground">Auto de Infração</span><span className="font-mono">{p.autoInfracao}</span></div>}
                        {p.vara && <div className="flex justify-between"><span className="text-muted-foreground">Vara</span><span>{p.vara}</span></div>}
                        {p.comarca && <div className="flex justify-between"><span className="text-muted-foreground">Comarca</span><span>{p.comarca}</span></div>}
                        {p.tribunal && <div className="flex justify-between"><span className="text-muted-foreground">Tribunal</span><span>{p.tribunal}</span></div>}
                        {p.advogadoResponsavel && <div className="flex justify-between"><span className="text-muted-foreground">Advogado</span><span>{p.advogadoResponsavel}</span></div>}
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => {
                          setForm({ ...form, tipoTributo: p.tipoTributo, esfera: p.esfera, status: p.status, fase: p.fase, risco: p.risco, valorCausa: p.valorCausa || "", observacoes: p.observacoes || "" });
                          setEditingId(p.id);
                        }}><Pencil className="h-3 w-3 mr-1" /> Editar</Button>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Valores e Datas</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Valor da Causa</span><span className="font-semibold">{formatBRL(p.valorCausa)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Valor Auto Infração</span><span className="font-semibold">{formatBRL(p.valorAutoInfracao)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Valor Condenação</span><span className="font-semibold">{formatBRL(p.valorCondenacao)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Valor Pago</span><span className="font-semibold">{formatBRL(p.valorPago)}</span></div>
                    <hr />
                    <div className="flex justify-between"><span className="text-muted-foreground">Distribuição</span><span>{formatDate(p.dataDistribuicao)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Auto de Infração</span><span>{formatDate(p.dataAutoInfracao)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Audiência</span><span>{formatDate(p.dataAudiencia)}</span></div>
                    {p.dataEncerramento && <div className="flex justify-between"><span className="text-muted-foreground">Encerramento</span><span>{formatDate(p.dataEncerramento)}</span></div>}
                  </CardContent>
                </Card>
              </div>

              {p.observacoes && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Observações</CardTitle></CardHeader>
                  <CardContent><p className="text-sm whitespace-pre-wrap">{p.observacoes}</p></CardContent>
                </Card>
              )}

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
                    <div className="space-y-3">
                      {p.andamentos.map((a) => {
                        const tipoLabel: Record<string, string> = { audiencia: "Audiência", despacho: "Despacho", sentenca: "Sentença", recurso: "Recurso", pericia: "Perícia", acordo: "Acordo", pagamento: "Pagamento", citacao: "Citação", intimacao: "Intimação", peticao: "Petição", outros: "Outros" };
                        return (
                          <div key={a.id} className="flex gap-3 p-2 rounded-lg bg-muted/30">
                            <div className="flex-shrink-0 w-20 text-xs text-muted-foreground font-mono">{formatDate(a.data)}</div>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-teal-100 text-teal-700">{tipoLabel[a.tipo] || a.tipo}</span>
                              <p className="text-sm mt-1">{a.descricao}</p>
                              {a.resultado && <p className="text-xs text-muted-foreground mt-0.5">Resultado: {a.resultado}</p>}
                            </div>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setDeleteAndamentoTarget({ id: a.id, processoId: a.processoId, companyId: queryCompanyId, companyIds: companyIds.length > 0 ? companyIds : undefined })}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground text-sm py-6">Nenhum andamento registrado</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Documentos</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {documentos.data && documentos.data.length > 0 ? (
                    <div className="space-y-2">
                      {documentos.data.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                          <FileText className="h-4 w-4 text-teal-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-teal-700 hover:underline truncate block">{doc.nome}</a>
                            {doc.descricao && <p className="text-xs text-muted-foreground">{doc.descricao}</p>}
                            <p className="text-xs text-muted-foreground">{doc.tipo} • {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("pt-BR") : ""}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setDeleteDocTarget({ id: doc.id, processoId: doc.processoId })}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground text-sm py-6">Nenhum documento anexado</p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        <Dialog open={!!deleteDocTarget} onOpenChange={(o) => { if (!o) setDeleteDocTarget(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Excluir Documento</DialogTitle></DialogHeader>
            <p className="text-sm">Tem certeza que deseja excluir este documento?</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDocTarget(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => {
                if (deleteDocTarget) excluirDocumentoMut.mutate({ id: deleteDocTarget.id, processoId: deleteDocTarget.processoId, companyId: queryCompanyId, companyIds: companyIds.length > 0 ? companyIds : undefined });
                setDeleteDocTarget(null);
              }}>Excluir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showAndamentoDialog} onOpenChange={setShowAndamentoDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Andamento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Data</label>
                <input type="date" value={andamentoForm.data} onChange={e => setAndamentoForm(prev => ({ ...prev, data: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium">Tipo</label>
                <select value={andamentoForm.tipo} onChange={e => setAndamentoForm(prev => ({ ...prev, tipo: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm bg-background">
                  {["audiencia","despacho","sentenca","recurso","pericia","acordo","pagamento","citacao","intimacao","peticao","outros"].map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <textarea value={andamentoForm.descricao} onChange={e => setAndamentoForm(prev => ({ ...prev, descricao: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm bg-background min-h-[80px]" placeholder="Descreva o andamento..." />
              </div>
              <div>
                <label className="text-sm font-medium">Resultado (opcional)</label>
                <input type="text" value={andamentoForm.resultado} onChange={e => setAndamentoForm(prev => ({ ...prev, resultado: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm bg-background" placeholder="Ex: Deferido, Indeferido..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAndamentoDialog(false)}>Cancelar</Button>
              <Button onClick={() => {
                if (!andamentoForm.descricao.trim()) return toast.error("Informe a descrição");
                criarAndamentoMut.mutate({
                  processoId: selectedProcessoId!,
                  companyId: queryCompanyId,
                  companyIds: companyIds.length > 0 ? companyIds : undefined,
                  data: andamentoForm.data,
                  tipo: andamentoForm.tipo as "audiencia" | "despacho" | "sentenca" | "recurso" | "pericia" | "acordo" | "pagamento" | "citacao" | "intimacao" | "peticao" | "outros",
                  descricao: andamentoForm.descricao,
                  resultado: andamentoForm.resultado || undefined,
                  criadoPor: user?.name || undefined,
                });
              }} disabled={criarAndamentoMut.isPending}>
                {criarAndamentoMut.isPending ? "Salvando..." : "Registrar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deleteAndamentoTarget} onOpenChange={() => setDeleteAndamentoTarget(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Excluir andamento?</DialogTitle></DialogHeader>
            <p className="text-sm">Esta ação não pode ser desfeita.</p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteAndamentoTarget(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => {
                if (deleteAndamentoTarget) excluirAndamentoMut.mutate(deleteAndamentoTarget);
              }}>Excluir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Confirmar exclusão</DialogTitle></DialogHeader>
            <p className="text-sm">Deseja realmente excluir este processo tributário?</p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={() => { if (deleteTargetId) excluirMut.mutate({ id: deleteTargetId, companyId: queryCompanyId, companyIds: companyIds.length > 0 ? companyIds : undefined }); setShowDeleteDialog(false); }}>Excluir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <PrintFooterLGPD />
      </DashboardLayout>
    );
  }

  if (viewMode === "novo") {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setViewMode("lista"); resetForm(); }}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Scale className="h-5 w-5 text-teal-600" /> Novo Processo Tributário
            </h1>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Número do Processo *</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" value={form.numeroProcesso} onChange={e => setForm(f => ({ ...f, numeroProcesso: e.target.value }))} placeholder="0000000-00.0000.0.00.0000" />
                </div>
                <div>
                  <label className="text-sm font-medium">Contribuinte *</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" value={form.contribuinte} onChange={e => setForm(f => ({ ...f, contribuinte: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">CNPJ do Contribuinte</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" value={form.cnpjContribuinte} onChange={e => setForm(f => ({ ...f, cnpjContribuinte: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Tipo de Tributo</label>
                  <select className="w-full border rounded px-3 py-2 text-sm" value={form.tipoTributo} onChange={e => setForm(f => ({ ...f, tipoTributo: e.target.value }))}>
                    {Object.entries(TRIBUTO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Esfera</label>
                  <select className="w-full border rounded px-3 py-2 text-sm" value={form.esfera} onChange={e => setForm(f => ({ ...f, esfera: e.target.value }))}>
                    {Object.entries(ESFERA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Auto de Infração</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" value={form.autoInfracao} onChange={e => setForm(f => ({ ...f, autoInfracao: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Valor Auto de Infração</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" value={form.valorAutoInfracao} onChange={e => setForm(f => ({ ...f, valorAutoInfracao: e.target.value }))} placeholder="0,00" />
                </div>
                <div>
                  <label className="text-sm font-medium">Valor da Causa</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" value={form.valorCausa} onChange={e => setForm(f => ({ ...f, valorCausa: e.target.value }))} placeholder="0,00" />
                </div>
                <div>
                  <label className="text-sm font-medium">Vara</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" value={form.vara} onChange={e => setForm(f => ({ ...f, vara: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Comarca</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" value={form.comarca} onChange={e => setForm(f => ({ ...f, comarca: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Tribunal</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" value={form.tribunal} onChange={e => setForm(f => ({ ...f, tribunal: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Advogado Responsável</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" value={form.advogadoResponsavel} onChange={e => setForm(f => ({ ...f, advogadoResponsavel: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Data de Distribuição</label>
                  <input type="date" className="w-full border rounded px-3 py-2 text-sm" value={form.dataDistribuicao} onChange={e => setForm(f => ({ ...f, dataDistribuicao: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Data Auto de Infração</label>
                  <input type="date" className="w-full border rounded px-3 py-2 text-sm" value={form.dataAutoInfracao} onChange={e => setForm(f => ({ ...f, dataAutoInfracao: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Data Audiência</label>
                  <input type="date" className="w-full border rounded px-3 py-2 text-sm" value={form.dataAudiencia} onChange={e => setForm(f => ({ ...f, dataAudiencia: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <select className="w-full border rounded px-3 py-2 text-sm" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Fase</label>
                  <select className="w-full border rounded px-3 py-2 text-sm" value={form.fase} onChange={e => setForm(f => ({ ...f, fase: e.target.value }))}>
                    {Object.entries(FASE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Risco</label>
                  <select className="w-full border rounded px-3 py-2 text-sm" value={form.risco} onChange={e => setForm(f => ({ ...f, risco: e.target.value }))}>
                    {Object.entries(RISCO_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Observações</label>
                <textarea className="w-full border rounded px-3 py-2 text-sm" rows={3} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSubmit} disabled={criarMut.isPending}>
                  <Save className="h-4 w-4 mr-1" /> {criarMut.isPending ? "Salvando..." : "Cadastrar Processo"}
                </Button>
                <Button variant="ghost" onClick={() => { setViewMode("lista"); resetForm(); }}>Cancelar</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Scale className="h-5 w-5 text-teal-600" /> Processos Tributários
            </h1>
            <p className="text-sm text-muted-foreground">Gestão de processos tributários e fiscais</p>
          </div>
          <div className="flex items-center gap-2">
            <PrintActions title="Processos Tributários" />
            <Button size="sm" onClick={() => setViewMode("novo")}>
              <Plus className="h-4 w-4 mr-1" /> Novo Processo
            </Button>
          </div>
        </div>

        {processos.data && (() => {
          const isEnc = (s: string) => ["encerrado", "arquivado"].includes(s);
          const filtTotal = filtered.length;
          const filtEmAndamento = filtered.filter(p => !isEnc(p.status)).length;
          const filtEncerrados = filtered.filter(p => isEnc(p.status)).length;
          const altoCritico = filtered.filter(p => p.risco === "alto" || p.risco === "critico").length;
          const parseBRL2 = (v: any) => { if (!v) return 0; const s = String(v).replace(/[R$\s.]/g, "").replace(",", "."); return parseFloat(s) || 0; };
          const valorCausa = filtered.reduce((s, p) => s + parseBRL2(p.valorCausa), 0);
          const fBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-blue-700">{filtTotal}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-amber-700">{filtEmAndamento}</p>
                <p className="text-xs text-muted-foreground">Em Andamento</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-green-700">{filtEncerrados}</p>
                <p className="text-xs text-muted-foreground">Encerrados</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-red-700">{altoCritico}</p>
                <p className="text-xs text-muted-foreground">Alto/Crítico</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-orange-700">{fBRL(valorCausa)}</p>
                <p className="text-xs font-semibold text-orange-600">Valor em Causa</p>
              </div>
            </div>
          );
        })()}

        <div className="flex flex-col gap-3">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Buscar por número, contribuinte, auto de infração..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-background" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="all">Todos os Status</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterRisco} onChange={e => setFilterRisco(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="all">Todos os Riscos</option>
              {Object.entries(RISCO_LABELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={filterEntidade} onChange={e => setFilterEntidade(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="all">Todas as Entidades</option>
              <option value="jf">Julio Ferraz</option>
              <option value="fc">FC Engenharia</option>
            </select>
          </div>
        </div>

        {processos.isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando processos...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Scale className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Nenhum processo tributário encontrado</p>
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
                      <th className="p-2.5 font-medium">Contribuinte</th>
                      <th className="p-2.5 font-medium">Tributo</th>
                      <th className="p-2.5 font-medium">Esfera</th>
                      <th className="p-2.5 font-medium text-center">Status</th>
                      <th className="p-2.5 font-medium text-center">Risco</th>
                      <th className="p-2.5 font-medium text-center">Fase</th>
                      <th className="p-2.5 font-medium">Valor Causa</th>
                      <th className="p-2.5 font-medium">Próx. Audiência</th>
                      <th className="p-2.5 font-medium text-center w-24">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const statusInfo = STATUS_LABELS[p.status] || STATUS_LABELS.em_andamento;
                      const riscoInfo = RISCO_LABELS[p.risco] || RISCO_LABELS.medio;
                      return (
                        <tr key={p.id} className={`border-b hover:bg-muted/30 ${selectedIds.includes(p.id) ? "bg-blue-50" : ""}`}>
                          <td className="p-2.5" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} className="w-4 h-4 rounded" /></td>
                          <td className="p-2.5 font-mono text-xs cursor-pointer" onClick={() => { setSelectedProcessoId(p.id); setViewMode("detalhe"); }}>{p.numeroProcesso}</td>
                          <td className="p-2.5">
                            <p className="font-medium text-sm truncate max-w-[200px]" title={p.contribuinte}>{p.contribuinte}</p>
                          </td>
                          <td className="p-2.5">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">{TRIBUTO_LABELS[p.tipoTributo] || p.tipoTributo}</span>
                          </td>
                          <td className="p-2.5 text-xs">{ESFERA_LABELS[p.esfera] || p.esfera || "—"}</td>
                          <td className="p-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.bg} ${statusInfo.color}`}>{statusInfo.label}</span>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${riscoInfo.bg} ${riscoInfo.color}`}>{riscoInfo.icon} {riscoInfo.label}</span>
                          </td>
                          <td className="p-2.5 text-center text-xs">{FASE_LABELS[p.fase] || p.fase || "—"}</td>
                          <td className="p-2.5 text-xs">{formatBRL(p.valorCausa)}</td>
                          <td className="p-2.5 text-xs">{p.dataAudiencia ? formatDate(p.dataAudiencia) : "—"}</td>
                          <td className="p-2.5">
                            <div className="flex items-center gap-1">
                              <button onClick={(e) => { e.stopPropagation(); setSelectedProcessoId(p.id); setViewMode("detalhe"); }} className="p-1 hover:bg-blue-100 rounded" title="Ver"><Eye className="h-4 w-4 text-muted-foreground" /></button>
                              <button onClick={(e) => { e.stopPropagation(); setSelectedProcessoId(p.id); setViewMode("detalhe"); }} className="p-1 hover:bg-amber-100 rounded" title="Editar"><Pencil className="h-4 w-4 text-amber-600" /></button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteTargetId(p.id); setShowDeleteDialog(true); }} className="p-1 hover:bg-red-100 rounded" title="Excluir"><Trash2 className="h-4 w-4 text-red-500" /></button>
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
          </>
        )}
      </div>

      <Dialog open={showBatchDeleteDialog} onOpenChange={setShowBatchDeleteDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir {selectedIds.length} processo(s)?</DialogTitle></DialogHeader>
          <p className="text-sm">Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowBatchDeleteDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => excluirLoteMut.mutate({ ids: selectedIds, companyId: queryCompanyId, companyIds: companyIds.length > 0 ? companyIds : undefined })}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PrintFooterLGPD />
    </DashboardLayout>
  );
}
