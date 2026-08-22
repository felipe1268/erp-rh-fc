import { useState, useMemo } from "react";
import { useCompany } from "../../contexts/CompanyContext";
import { trpc } from "../../lib/trpc";
import DashboardLayout from "../../components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FlaskConical, Plus, Search, Filter, Trash2, Edit2, Eye, CheckCircle,
  XCircle, Clock, AlertTriangle, Building2, Beaker, ArrowLeft, Loader2,
  TrendingUp, BarChart3, X,
} from "lucide-react";

function fmtDate(d: any) {
  if (!d) return "—";
  const s = typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  const [y, m, day] = s.split("-");
  return `${day}/${m}/${y}`;
}

const TIPOS_ENSAIO = [
  { value: "concreto", label: "Concreto", subtipos: ["Resistência à compressão (fck)", "Resistência à tração", "Módulo de elasticidade"] },
  { value: "solo", label: "Solo", subtipos: ["Compactação (Proctor)", "CBR", "Granulometria", "Limite de Atterberg", "Densidade in situ"] },
  { value: "asfalto", label: "Asfalto", subtipos: ["Marshall", "Grau de compactação", "Extração de betume", "Granulometria"] },
  { value: "aco", label: "Aço", subtipos: ["Tração", "Dobramento", "Alongamento"] },
  { value: "agregado", label: "Agregados", subtipos: ["Granulometria", "Absorção", "Massa específica", "Abrasão Los Angeles"] },
  { value: "argamassa", label: "Argamassa", subtipos: ["Resistência à compressão", "Consistência"] },
  { value: "outro", label: "Outro", subtipos: [] },
];

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  pendente: { label: "Pendente", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  em_andamento: { label: "Em andamento", color: "bg-blue-100 text-blue-700", icon: Beaker },
  concluido: { label: "Concluído", color: "bg-green-100 text-green-700", icon: CheckCircle },
};

const RESULTADO_MAP: Record<string, { label: string; color: string }> = {
  aprovado: { label: "Aprovado", color: "bg-green-100 text-green-700 border-green-300" },
  reprovado: { label: "Reprovado", color: "bg-red-100 text-red-700 border-red-300" },
};

const IDADES_PADRAO = [
  { dias: 3, label: "3 dias" },
  { dias: 7, label: "7 dias" },
  { dias: 14, label: "14 dias" },
  { dias: 28, label: "28 dias" },
  { dias: 63, label: "63 dias" },
  { dias: 91, label: "91 dias" },
];

export default function Ensaios() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id || 0;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("lista");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroObra, setFiltroObra] = useState("");
  const [busca, setBusca] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [showRupturaDialog, setShowRupturaDialog] = useState(false);
  const [selectedCp, setSelectedCp] = useState<any>(null);
  const [rupturaForm, setRupturaForm] = useState({ resistenciaMpa: "", tipoRuptura: "", massaKg: "", observacoes: "" });

  const [form, setForm] = useState({
    tipo: "concreto", subtipo: "", obraId: "", obraNome: "", dataColeta: new Date().toISOString().slice(0, 10),
    localColeta: "", elementoEstrutural: "", peca: "", fornecedorConcreto: "", notaFiscal: "",
    traco: "", fckProjeto: "", slumpPrevisto: "", slumpRealizado: "", temperatura: "", volumeM3: "",
    laboratorio: "", responsavel: "", observacoes: "", lancamentoId: "",
    cps: [
      { numeroCp: "CP-1", idadeDias: 7 },
      { numeroCp: "CP-2", idadeDias: 7 },
      { numeroCp: "CP-3", idadeDias: 28 },
      { numeroCp: "CP-4", idadeDias: 28 },
    ] as { numeroCp: string; idadeDias: number }[],
  });

  const ensaiosQuery = trpc.operacional.listarEnsaios.useQuery(
    { companyId, tipo: filtroTipo && filtroTipo !== "all" ? filtroTipo : undefined, status: filtroStatus && filtroStatus !== "all" ? filtroStatus : undefined },
    { enabled: !!companyId }
  );
  const dashQuery = trpc.operacional.dashboardEnsaios.useQuery(
    { companyId },
    { enabled: !!companyId && activeTab === "dashboard" }
  );
  const detailQuery = trpc.operacional.getEnsaio.useQuery(
    { id: viewId!, companyId },
    { enabled: !!viewId && !!companyId }
  );
  const obrasQuery = trpc.operacional.listarObrasUnificadas.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  // Caminhões (lançamentos de concreto) da obra — rastreabilidade CP ↔ caminhão ↔ trecho
  const lancamentosQuery = trpc.operacional.listarLancamentosObra.useQuery(
    { companyId, obraId: parseInt(form.obraId) || 0 },
    { enabled: !!companyId && !!form.obraId && form.tipo === "concreto" && showForm }
  );

  const criarMut = trpc.operacional.criarEnsaio.useMutation({
    onSuccess: () => { toast({ title: "Ensaio criado com sucesso" }); setShowForm(false); resetForm(); ensaiosQuery.refetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const atualizarMut = trpc.operacional.atualizarEnsaio.useMutation({
    onSuccess: () => { toast({ title: "Ensaio atualizado" }); ensaiosQuery.refetch(); if (viewId) detailQuery.refetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deletarMut = trpc.operacional.deletarEnsaio.useMutation({
    onSuccess: () => { toast({ title: "Ensaio excluído" }); ensaiosQuery.refetch(); setViewId(null); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const rupturaMut = trpc.operacional.registrarRuptura.useMutation({
    onSuccess: () => { toast({ title: "Ruptura registrada" }); setShowRupturaDialog(false); detailQuery.refetch(); ensaiosQuery.refetch(); },
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const addCpMut = trpc.operacional.adicionarCorpoProva.useMutation({
    onSuccess: () => { toast({ title: "CP adicionado" }); detailQuery.refetch(); },
  });
  const delCpMut = trpc.operacional.deletarCorpoProva.useMutation({
    onSuccess: () => { toast({ title: "CP removido" }); detailQuery.refetch(); },
  });

  const resetForm = () => {
    setForm({
      tipo: "concreto", subtipo: "", obraId: "", obraNome: "", dataColeta: new Date().toISOString().slice(0, 10),
      localColeta: "", elementoEstrutural: "", peca: "", fornecedorConcreto: "", notaFiscal: "",
      traco: "", fckProjeto: "", slumpPrevisto: "", slumpRealizado: "", temperatura: "", volumeM3: "",
      laboratorio: "", responsavel: "", observacoes: "", lancamentoId: "",
      cps: [
        { numeroCp: "CP-1", idadeDias: 7 },
        { numeroCp: "CP-2", idadeDias: 7 },
        { numeroCp: "CP-3", idadeDias: 28 },
        { numeroCp: "CP-4", idadeDias: 28 },
      ],
    });
    setEditingId(null);
  };

  const allObras = useMemo(() => {
    const p = obrasQuery.data?.principais || [];
    const i = obrasQuery.data?.importadas || [];
    return [...p, ...i];
  }, [obrasQuery.data]);

  const filteredEnsaios = useMemo(() => {
    let list = ensaiosQuery.data || [];
    if (busca) {
      const q = busca.toLowerCase();
      list = list.filter((e: any) =>
        e.numero_ensaio?.toLowerCase().includes(q) ||
        e.obra_nome?.toLowerCase().includes(q) ||
        e.elemento_estrutural?.toLowerCase().includes(q) ||
        e.local_coleta?.toLowerCase().includes(q) ||
        e.laboratorio?.toLowerCase().includes(q)
      );
    }
    if (filtroObra) list = list.filter((e: any) => String(e.obra_id) === filtroObra);
    return list;
  }, [ensaiosQuery.data, busca, filtroObra]);

  const handleSubmit = () => {
    const obra = allObras.find((o: any) => String(o.id) === form.obraId);
    criarMut.mutate({
      companyId,
      tipo: form.tipo,
      subtipo: form.subtipo || undefined,
      obraId: form.obraId ? parseInt(form.obraId) : undefined,
      obraNome: obra?.nome || form.obraNome || undefined,
      dataColeta: form.dataColeta,
      localColeta: form.localColeta || undefined,
      elementoEstrutural: form.elementoEstrutural || undefined,
      peca: form.peca || undefined,
      fornecedorConcreto: form.fornecedorConcreto || undefined,
      notaFiscal: form.notaFiscal || undefined,
      traco: form.traco || undefined,
      fckProjeto: form.fckProjeto ? parseFloat(form.fckProjeto) : undefined,
      slumpPrevisto: form.slumpPrevisto ? parseFloat(form.slumpPrevisto) : undefined,
      slumpRealizado: form.slumpRealizado ? parseFloat(form.slumpRealizado) : undefined,
      temperatura: form.temperatura ? parseFloat(form.temperatura) : undefined,
      volumeM3: form.volumeM3 ? parseFloat(form.volumeM3) : undefined,
      laboratorio: form.laboratorio || undefined,
      responsavel: form.responsavel || undefined,
      observacoes: form.observacoes || undefined,
      lancamentoId: form.lancamentoId ? parseInt(form.lancamentoId) : undefined,
      corposProva: form.cps.filter(c => c.numeroCp).map(c => ({
        numeroCp: c.numeroCp,
        idadeDias: c.idadeDias,
      })),
    });
  };

  const handleRuptura = () => {
    if (!selectedCp || !rupturaForm.resistenciaMpa) return;
    rupturaMut.mutate({
      cpId: selectedCp.id,
      companyId,
      resistenciaMpa: parseFloat(rupturaForm.resistenciaMpa),
      tipoRuptura: rupturaForm.tipoRuptura || undefined,
      massaKg: rupturaForm.massaKg ? parseFloat(rupturaForm.massaKg) : undefined,
      observacoes: rupturaForm.observacoes || undefined,
    });
  };

  const detail = detailQuery.data;

  if (viewId && detail) {
    const statusInfo = STATUS_MAP[detail.status] || STATUS_MAP.pendente;
    const resultadoInfo = detail.resultado ? RESULTADO_MAP[detail.resultado] : null;
    const cps = detail.corpos_prova || [];
    const mediaRes = cps.filter((c: any) => c.resistencia_mpa).reduce((s: number, c: any) => s + parseFloat(c.resistencia_mpa), 0) / (cps.filter((c: any) => c.resistencia_mpa).length || 1);
    const fck = detail.fck_projeto ? parseFloat(detail.fck_projeto) : null;

    return (
      <DashboardLayout title={`Ensaio ${detail.numero_ensaio}`}>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setViewId(null)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-red-600" onClick={() => { if (confirm("Excluir este ensaio?")) deletarMut.mutate({ id: detail.id, companyId }); }}>
                <Trash2 className="h-4 w-4 mr-1" /> Excluir
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-blue-600" />
                    {detail.numero_ensaio} — {TIPOS_ENSAIO.find(t => t.value === detail.tipo)?.label || detail.tipo}
                  </span>
                  <div className="flex gap-2">
                    <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                    {resultadoInfo && <Badge className={resultadoInfo.color}>{resultadoInfo.label}</Badge>}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  {detail.obra_nome && <div><span className="text-gray-400">Obra</span><p className="font-medium">{detail.obra_nome}</p></div>}
                  <div><span className="text-gray-400">Data Coleta</span><p className="font-medium">{fmtDate(detail.data_coleta)}</p></div>
                  {detail.subtipo && <div><span className="text-gray-400">Subtipo</span><p className="font-medium">{detail.subtipo}</p></div>}
                  {detail.local_coleta && <div><span className="text-gray-400">Local</span><p className="font-medium">{detail.local_coleta}</p></div>}
                  {detail.elemento_estrutural && <div><span className="text-gray-400">Elemento Estrutural</span><p className="font-medium">{detail.elemento_estrutural}</p></div>}
                  {detail.peca && <div><span className="text-gray-400">Peça</span><p className="font-medium">{detail.peca}</p></div>}
                  {detail.fornecedor_concreto && <div><span className="text-gray-400">Fornecedor</span><p className="font-medium">{detail.fornecedor_concreto}</p></div>}
                  {detail.nota_fiscal && <div><span className="text-gray-400">Nota Fiscal</span><p className="font-medium">{detail.nota_fiscal}</p></div>}
                  {detail.traco && <div><span className="text-gray-400">Traço</span><p className="font-medium">{detail.traco}</p></div>}
                  {fck && <div><span className="text-gray-400">fck Projeto</span><p className="font-medium text-blue-600 font-bold">{fck} MPa</p></div>}
                  {detail.slump_previsto && <div><span className="text-gray-400">Slump Previsto</span><p className="font-medium">{parseFloat(detail.slump_previsto)} ± 1 cm</p></div>}
                  {detail.slump_realizado && <div><span className="text-gray-400">Slump Realizado</span><p className="font-medium">{parseFloat(detail.slump_realizado)} cm</p></div>}
                  {detail.temperatura && <div><span className="text-gray-400">Temperatura</span><p className="font-medium">{parseFloat(detail.temperatura)}°C</p></div>}
                  {detail.volume_m3 && <div><span className="text-gray-400">Volume</span><p className="font-medium">{parseFloat(detail.volume_m3)} m³</p></div>}
                  {detail.laboratorio && <div><span className="text-gray-400">Laboratório</span><p className="font-medium">{detail.laboratorio}</p></div>}
                  {detail.responsavel && <div><span className="text-gray-400">Responsável</span><p className="font-medium">{detail.responsavel}</p></div>}
                </div>
                {detail.observacoes && <div className="mt-4 p-3 bg-gray-50 rounded text-sm"><span className="text-gray-400">Obs:</span> {detail.observacoes}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Resumo dos Resultados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {fck && (
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-xs text-blue-500">fck Projeto</div>
                      <div className="text-2xl font-bold text-blue-700">{fck} MPa</div>
                    </div>
                  )}
                  {cps.filter((c: any) => c.resistencia_mpa).length > 0 && (
                    <div className={`text-center p-3 rounded-lg ${fck && mediaRes >= fck ? "bg-green-50" : fck ? "bg-red-50" : "bg-gray-50"}`}>
                      <div className="text-xs text-gray-500">Média Resistência</div>
                      <div className={`text-2xl font-bold ${fck && mediaRes >= fck ? "text-green-700" : fck ? "text-red-700" : "text-gray-700"}`}>
                        {mediaRes.toFixed(1)} MPa
                      </div>
                      {fck && (
                        <div className={`text-xs mt-1 ${mediaRes >= fck ? "text-green-600" : "text-red-600"}`}>
                          {mediaRes >= fck ? "Atende ao fck" : `Abaixo do fck (${((mediaRes / fck - 1) * 100).toFixed(0)}%)`}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500">Corpos de Prova</div>
                    <div className="text-lg font-bold">{cps.filter((c: any) => c.status === 'rompido').length} / {cps.length} rompidos</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Corpos de Prova ({cps.length})</span>
                <Button size="sm" variant="outline" onClick={() => {
                  const nextNum = cps.length + 1;
                  addCpMut.mutate({ ensaioId: detail.id, companyId, numeroCp: `CP-${nextNum}`, idadeDias: 28 });
                }}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar CP
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-400 text-xs">
                      <th className="py-2 px-3">CP</th>
                      <th className="py-2 px-3 text-center">Idade (dias)</th>
                      <th className="py-2 px-3 text-center">Data Ruptura</th>
                      <th className="py-2 px-3 text-center">Resistência (MPa)</th>
                      <th className="py-2 px-3 text-center">Tipo Ruptura</th>
                      <th className="py-2 px-3 text-center">Status</th>
                      <th className="py-2 px-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cps.map((cp: any) => {
                      const resOk = cp.resistencia_mpa && fck ? parseFloat(cp.resistencia_mpa) >= fck : null;
                      return (
                        <tr key={cp.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium">{cp.numero_cp}</td>
                          <td className="py-2 px-3 text-center">{cp.idade_dias}</td>
                          <td className="py-2 px-3 text-center">{fmtDate(cp.data_ruptura)}</td>
                          <td className="py-2 px-3 text-center">
                            {cp.resistencia_mpa ? (
                              <span className={`font-bold ${resOk === true ? "text-green-600" : resOk === false ? "text-red-600" : ""}`}>
                                {parseFloat(cp.resistencia_mpa).toFixed(1)}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="py-2 px-3 text-center text-gray-500">{cp.tipo_ruptura || "—"}</td>
                          <td className="py-2 px-3 text-center">
                            <Badge variant="outline" className={cp.status === 'rompido' ? "bg-green-50 text-green-600" : "bg-yellow-50 text-yellow-600"}>
                              {cp.status === 'rompido' ? "Rompido" : "Pendente"}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex justify-center gap-1">
                              {cp.status !== 'rompido' && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                                  setSelectedCp(cp);
                                  setRupturaForm({ resistenciaMpa: "", tipoRuptura: "", massaKg: "", observacoes: "" });
                                  setShowRupturaDialog(true);
                                }}>
                                  <Beaker className="h-3 w-3 mr-1" /> Registrar
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => {
                                if (confirm("Remover este CP?")) delCpMut.mutate({ cpId: cp.id, companyId });
                              }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
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

          <Dialog open={showRupturaDialog} onOpenChange={setShowRupturaDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar Ruptura — {selectedCp?.numero_cp}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Resistência (MPa) *</Label>
                  <Input type="number" step="0.1" value={rupturaForm.resistenciaMpa} onChange={e => setRupturaForm(p => ({ ...p, resistenciaMpa: e.target.value }))} placeholder="Ex: 32.5" />
                </div>
                <div>
                  <Label>Tipo de Ruptura</Label>
                  <Select value={rupturaForm.tipoRuptura} onValueChange={v => setRupturaForm(p => ({ ...p, tipoRuptura: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conica">Cônica</SelectItem>
                      <SelectItem value="conica_bipartida">Cônica bipartida</SelectItem>
                      <SelectItem value="colunar">Colunar</SelectItem>
                      <SelectItem value="cisalhamento">Cisalhamento</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Massa (kg)</Label>
                  <Input type="number" step="0.001" value={rupturaForm.massaKg} onChange={e => setRupturaForm(p => ({ ...p, massaKg: e.target.value }))} placeholder="Ex: 12.350" />
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea value={rupturaForm.observacoes} onChange={e => setRupturaForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRupturaDialog(false)}>Cancelar</Button>
                <Button onClick={handleRuptura} disabled={!rupturaForm.resistenciaMpa || rupturaMut.isPending}>
                  {rupturaMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                  Confirmar Ruptura
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Ensaios Tecnológicos">
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-blue-600" />
              Ensaios Tecnológicos
            </h1>
            <p className="text-sm text-gray-500 mt-1">Controle de ensaios de concreto, solo, aço e outros materiais</p>
          </div>
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Novo Ensaio
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="lista">Lista de Ensaios</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="mt-4">
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input className="pl-9" placeholder="Buscar por número, obra, local..." value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {TIPOS_ENSAIO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {ensaiosQuery.isLoading ? (
              <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" /></div>
            ) : filteredEnsaios.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FlaskConical className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Nenhum ensaio encontrado</p>
                  <Button className="mt-4" onClick={() => { resetForm(); setShowForm(true); }}>
                    <Plus className="h-4 w-4 mr-1" /> Criar Primeiro Ensaio
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredEnsaios.map((e: any) => {
                  const tipoInfo = TIPOS_ENSAIO.find(t => t.value === e.tipo);
                  const statusInfo = STATUS_MAP[e.status] || STATUS_MAP.pendente;
                  const resultadoInfo = e.resultado ? RESULTADO_MAP[e.resultado] : null;
                  const media = e.media_resistencia ? parseFloat(e.media_resistencia) : null;
                  const fck = e.fck_projeto ? parseFloat(e.fck_projeto) : null;
                  return (
                    <Card key={e.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setViewId(e.id)}>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                              <FlaskConical className="h-5 w-5 text-blue-600" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-gray-900">{e.numero_ensaio}</span>
                                <Badge variant="outline" className="text-xs">{tipoInfo?.label || e.tipo}</Badge>
                                <Badge className={`text-xs ${statusInfo.color}`}>{statusInfo.label}</Badge>
                                {resultadoInfo && <Badge className={`text-xs ${resultadoInfo.color}`}>{resultadoInfo.label}</Badge>}
                              </div>
                              <div className="text-sm text-gray-500 truncate">
                                {e.obra_nome && <span>{e.obra_nome} • </span>}
                                {e.elemento_estrutural && <span>{e.elemento_estrutural} • </span>}
                                {fmtDate(e.data_coleta)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            {fck && (
                              <div className="text-center">
                                <div className="text-xs text-gray-400">fck</div>
                                <div className="font-bold text-blue-600">{fck} MPa</div>
                              </div>
                            )}
                            {media && (
                              <div className="text-center">
                                <div className="text-xs text-gray-400">Média</div>
                                <div className={`font-bold ${fck && media >= fck ? "text-green-600" : fck ? "text-red-600" : "text-gray-700"}`}>
                                  {media.toFixed(1)} MPa
                                </div>
                              </div>
                            )}
                            <div className="text-center">
                              <div className="text-xs text-gray-400">CPs</div>
                              <div className="font-medium">{e.cps_rompidos || 0}/{e.total_cps || 0}</div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="dashboard" className="mt-4">
            {dashQuery.isLoading ? (
              <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" /></div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Total", value: dashQuery.data?.totais?.reduce((s: number, t: any) => s + parseInt(t.count), 0) || 0, color: "blue", icon: FlaskConical },
                    { label: "Pendentes", value: dashQuery.data?.totais?.find((t: any) => t.status === 'pendente')?.count || 0, color: "yellow", icon: Clock },
                    { label: "Aprovados", value: dashQuery.data?.resultados?.find((r: any) => r.resultado === 'aprovado')?.count || 0, color: "green", icon: CheckCircle },
                    { label: "Reprovados", value: dashQuery.data?.resultados?.find((r: any) => r.resultado === 'reprovado')?.count || 0, color: "red", icon: XCircle },
                  ].map((card, i) => (
                    <Card key={i} className={`bg-gradient-to-br from-${card.color}-50 to-white border-${card.color}-200`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`text-xs text-${card.color}-600 font-medium`}>{card.label}</div>
                            <div className={`text-2xl font-bold text-${card.color}-700`}>{card.value}</div>
                          </div>
                          <card.icon className={`h-8 w-8 text-${card.color}-300`} />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Por Tipo</CardTitle></CardHeader>
                    <CardContent>
                      {(dashQuery.data?.porTipo || []).map((t: any) => (
                        <div key={t.tipo} className="flex justify-between items-center py-1.5 border-b last:border-0">
                          <span className="text-sm">{TIPOS_ENSAIO.find(tp => tp.value === t.tipo)?.label || t.tipo}</span>
                          <Badge variant="outline">{t.count}</Badge>
                        </div>
                      ))}
                      {(!dashQuery.data?.porTipo?.length) && <p className="text-gray-400 text-sm text-center py-4">Nenhum dado</p>}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Por Obra</CardTitle></CardHeader>
                    <CardContent>
                      {(dashQuery.data?.porObra || []).map((o: any) => (
                        <div key={o.obra_nome} className="flex justify-between items-center py-1.5 border-b last:border-0">
                          <span className="text-sm truncate max-w-[200px]">{o.obra_nome}</span>
                          <div className="flex gap-2">
                            {parseInt(o.aprovados) > 0 && <Badge className="bg-green-50 text-green-600 text-xs">{o.aprovados} ok</Badge>}
                            {parseInt(o.reprovados) > 0 && <Badge className="bg-red-50 text-red-600 text-xs">{o.reprovados} nc</Badge>}
                            <Badge variant="outline">{o.count}</Badge>
                          </div>
                        </div>
                      ))}
                      {(!dashQuery.data?.porObra?.length) && <p className="text-gray-400 text-sm text-center py-4">Nenhum dado</p>}
                    </CardContent>
                  </Card>
                </div>

                {dashQuery.data?.recentes?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Últimos Ensaios</CardTitle></CardHeader>
                    <CardContent>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-gray-400 text-xs">
                            <th className="py-2 px-2">Número</th>
                            <th className="py-2 px-2">Tipo</th>
                            <th className="py-2 px-2">Obra</th>
                            <th className="py-2 px-2">Data</th>
                            <th className="py-2 px-2 text-center">fck</th>
                            <th className="py-2 px-2 text-center">Média</th>
                            <th className="py-2 px-2 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashQuery.data.recentes.map((e: any) => {
                            const media = e.media_resistencia ? parseFloat(e.media_resistencia) : null;
                            const fck = e.fck_projeto ? parseFloat(e.fck_projeto) : null;
                            return (
                              <tr key={e.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setViewId(e.id)}>
                                <td className="py-2 px-2 font-medium">{e.numero_ensaio}</td>
                                <td className="py-2 px-2">{TIPOS_ENSAIO.find(t => t.value === e.tipo)?.label || e.tipo}</td>
                                <td className="py-2 px-2 text-gray-500 truncate max-w-[150px]">{e.obra_nome || "—"}</td>
                                <td className="py-2 px-2">{fmtDate(e.data_coleta)}</td>
                                <td className="py-2 px-2 text-center">{fck ? `${fck}` : "—"}</td>
                                <td className="py-2 px-2 text-center">
                                  {media ? <span className={fck && media >= fck ? "text-green-600 font-bold" : fck ? "text-red-600 font-bold" : ""}>{media.toFixed(1)}</span> : "—"}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  {e.resultado && <Badge className={`text-xs ${RESULTADO_MAP[e.resultado]?.color}`}>{RESULTADO_MAP[e.resultado]?.label}</Badge>}
                                  {!e.resultado && <Badge variant="outline" className="text-xs">{STATUS_MAP[e.status]?.label}</Badge>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo Ensaio Tecnológico</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Ensaio *</Label>
                  <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v, subtipo: "" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_ENSAIO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Subtipo</Label>
                  <Select value={form.subtipo} onValueChange={v => setForm(p => ({ ...p, subtipo: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {(TIPOS_ENSAIO.find(t => t.value === form.tipo)?.subtipos || []).map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Obra</Label>
                  <Select value={form.obraId} onValueChange={v => {
                    const obra = allObras.find((o: any) => String(o.id) === v);
                    setForm(p => ({ ...p, obraId: v, obraNome: obra?.nome || "" }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
                    <SelectContent>
                      {allObras.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Data da Coleta *</Label>
                  <Input type="date" value={form.dataColeta} onChange={e => setForm(p => ({ ...p, dataColeta: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Local da Coleta</Label>
                  <Input value={form.localColeta} onChange={e => setForm(p => ({ ...p, localColeta: e.target.value }))} placeholder="Ex: Bloco A, Pavimento 3" />
                </div>
                <div>
                  <Label>Elemento Estrutural</Label>
                  <Input value={form.elementoEstrutural} onChange={e => setForm(p => ({ ...p, elementoEstrutural: e.target.value }))} placeholder="Ex: Pilar P12, Viga V5, Laje L3" />
                </div>
              </div>

              {form.tipo === 'concreto' && (
                <>
                  {!!form.obraId && (
                    <div>
                      <Label>Caminhão (lançamento do Mapa de Concretagem)</Label>
                      <Select value={form.lancamentoId} onValueChange={v => {
                        const l = (lancamentosQuery.data as any[])?.find((x: any) => String(x.id) === v);
                        setForm(p => ({
                          ...p, lancamentoId: v,
                          fornecedorConcreto: l?.fornecedor || p.fornecedorConcreto,
                          notaFiscal: l?.nota_fiscal || p.notaFiscal,
                          fckProjeto: l?.fck_elemento != null ? String(l.fck_elemento) : p.fckProjeto,
                          slumpPrevisto: l?.slump_previsto != null ? String(l.slump_previsto) : p.slumpPrevisto,
                          volumeM3: l?.volume_entregue != null ? String(l.volume_entregue) : p.volumeM3,
                          elementoEstrutural: p.elementoEstrutural || [l?.pavimento, l?.elemento].filter(Boolean).join(" — "),
                        }));
                      }}>
                        <SelectTrigger><SelectValue placeholder={(lancamentosQuery.data as any[])?.length ? "Vincular ao caminhão…" : "Nenhum lançamento nesta obra"} /></SelectTrigger>
                        <SelectContent>
                          {((lancamentosQuery.data as any[]) || []).map((l: any) => (
                            <SelectItem key={l.id} value={String(l.id)}>
                              {new Date(String(l.data_lancamento).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR")} — {[l.pavimento, l.elemento].filter(Boolean).join(" ")} • {l.fornecedor || "s/ fornecedor"} {l.nota_fiscal ? `• NF ${l.nota_fiscal}` : ""} • {l.volume_entregue} m³
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground mt-1">Vincular o caminhão preenche fornecedor, NF, fck e volume — e o resultado do ensaio aparece no Mapa de Concretagem e na planta.</p>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>fck Projeto (MPa)</Label>
                      <Input type="number" step="0.1" value={form.fckProjeto} onChange={e => setForm(p => ({ ...p, fckProjeto: e.target.value }))} placeholder="Ex: 25" />
                    </div>
                    <div>
                      <Label>Slump Previsto (cm)</Label>
                      <Input type="number" step="0.5" value={form.slumpPrevisto} onChange={e => setForm(p => ({ ...p, slumpPrevisto: e.target.value }))} placeholder="Ex: 10" />
                    </div>
                    <div>
                      <Label>Slump Realizado (cm)</Label>
                      <Input type="number" step="0.5" value={form.slumpRealizado} onChange={e => setForm(p => ({ ...p, slumpRealizado: e.target.value }))} placeholder="Ex: 9.5" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Fornecedor Concreto</Label>
                      <Input value={form.fornecedorConcreto} onChange={e => setForm(p => ({ ...p, fornecedorConcreto: e.target.value }))} placeholder="Ex: Votorantim" />
                    </div>
                    <div>
                      <Label>Traço</Label>
                      <Input value={form.traco} onChange={e => setForm(p => ({ ...p, traco: e.target.value }))} placeholder="Ex: 1:2:3" />
                    </div>
                    <div>
                      <Label>Volume (m³)</Label>
                      <Input type="number" step="0.01" value={form.volumeM3} onChange={e => setForm(p => ({ ...p, volumeM3: e.target.value }))} placeholder="Ex: 8.5" />
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Laboratório</Label>
                  <Input value={form.laboratorio} onChange={e => setForm(p => ({ ...p, laboratorio: e.target.value }))} placeholder="Ex: Falcão Bauer" />
                </div>
                <div>
                  <Label>Responsável</Label>
                  <Input value={form.responsavel} onChange={e => setForm(p => ({ ...p, responsavel: e.target.value }))} />
                </div>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} />
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-base font-semibold">Corpos de Prova</Label>
                  <div className="flex gap-2">
                    {IDADES_PADRAO.filter(i => [7, 28].includes(i.dias)).map(i => (
                      <Button key={i.dias} variant="outline" size="sm" className="text-xs h-7" onClick={() => {
                        const nextNum = form.cps.length + 1;
                        setForm(p => ({ ...p, cps: [...p.cps, { numeroCp: `CP-${nextNum}`, idadeDias: i.dias }] }));
                      }}>
                        + CP {i.dias}d
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {form.cps.map((cp, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-gray-50 rounded-lg p-2">
                      <Input className="w-24 h-8 text-sm" value={cp.numeroCp} onChange={e => {
                        const newCps = [...form.cps]; newCps[idx].numeroCp = e.target.value; setForm(p => ({ ...p, cps: newCps }));
                      }} />
                      <Select value={String(cp.idadeDias)} onValueChange={v => {
                        const newCps = [...form.cps]; newCps[idx].idadeDias = parseInt(v); setForm(p => ({ ...p, cps: newCps }));
                      }}>
                        <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {IDADES_PADRAO.map(i => <SelectItem key={i.dias} value={String(i.dias)}>{i.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" className="h-7 text-red-500" onClick={() => {
                        setForm(p => ({ ...p, cps: p.cps.filter((_, i) => i !== idx) }));
                      }}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={criarMut.isPending}>
                {criarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FlaskConical className="h-4 w-4 mr-1" />}
                Criar Ensaio
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
