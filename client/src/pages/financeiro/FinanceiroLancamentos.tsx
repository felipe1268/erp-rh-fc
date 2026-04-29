import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, X, CheckCircle, AlertTriangle, TrendingUp, TrendingDown, Filter,
  Repeat, Pause, Play, Edit2, Calendar, Zap, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const STATUS_COLORS: Record<string, string> = {
  previsto: "bg-gray-100 text-gray-700",
  a_pagar: "bg-orange-100 text-orange-700",
  a_receber: "bg-blue-100 text-blue-700",
  pago: "bg-green-100 text-green-700",
  recebido: "bg-green-100 text-green-700",
  cancelado: "bg-red-100 text-red-700",
  provisionado: "bg-purple-100 text-purple-700",
};

const STATUS_LABELS: Record<string, string> = {
  previsto: "Previsto",
  a_pagar: "A Pagar",
  a_receber: "A Receber",
  pago: "Pago",
  recebido: "Recebido",
  cancelado: "Cancelado",
  provisionado: "Provisionado",
};

const FREQ_LABELS: Record<string, string> = {
  mensal: "Mensal", quinzenal: "Quinzenal", semanal: "Semanal",
  trimestral: "Trimestral", anual: "Anual",
};

const INITIAL_FORM = {
  modoRecorrente: false,
  tipo: "despesa" as string,
  natureza: "fixo",
  valorPrevisto: "",
  dataCompetencia: new Date().toISOString().split("T")[0],
  dataVencimento: "",
  descricao: "",
  contaNome: "",
  obraNome: "",
  formaPagamento: "",
  observacoes: "",
  status: "a_pagar",
  frequencia: "mensal",
  diaVencimento: "5",
  fornecedorNome: "",
};

export default function FinanceiroLancamentos() {
  const { companyId } = useCompany();
  const { toast } = useToast();

  const [aba, setAba] = useState<"lancamentos" | "recorrencias">("lancamentos");
  const [mes, setMes] = useState(getMesAtual());
  const [tipo, setTipo] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showCancel, setShowCancel] = useState<{ id: number } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [editRecId, setEditRecId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...INITIAL_FORM });

  const { data, isLoading, refetch } = (trpc as any).financial.getEntries.useQuery(
    { companyId, mesCompetencia: mes, tipo: tipo !== "all" ? tipo : undefined, status: statusFilter !== "all" ? statusFilter : undefined, limit: 200, offset: 0 },
    { enabled: !!companyId }
  );

  const { data: recItems, isLoading: recLoading, refetch: recRefetch } = (trpc as any).financial.getRecurringEntries.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const createEntryMut = (trpc as any).financial.createEntry.useMutation({
    onSuccess: () => { toast({ title: "Lançamento criado!" }); setShowNew(false); resetForm(); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const createRecMut = (trpc as any).financial.createRecurringEntry.useMutation({
    onSuccess: () => { toast({ title: "Recorrência criada!" }); setShowNew(false); resetForm(); recRefetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateRecMut = (trpc as any).financial.updateRecurringEntry.useMutation({
    onSuccess: () => { toast({ title: "Recorrência atualizada!" }); setShowNew(false); resetForm(); recRefetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const generateMut = (trpc as any).financial.generateRecurringEntries.useMutation({
    onSuccess: (res: any) => {
      toast({ title: res.generated > 0 ? `${res.generated} lançamento(s) gerado(s)!` : "Nenhum lançamento pendente para gerar" });
      refetch();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const cancelMut = (trpc as any).financial.cancelEntry.useMutation({
    onSuccess: () => { toast({ title: "Lançamento cancelado" }); setShowCancel(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const paidMut = (trpc as any).financial.updateEntryStatus.useMutation({
    onSuccess: () => { toast({ title: "Status atualizado!" }); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setForm({ ...INITIAL_FORM });
    setEditRecId(null);
  }

  function openNew() {
    resetForm();
    setShowNew(true);
  }

  function openEditRec(item: any) {
    setEditRecId(item.id);
    setForm({
      ...INITIAL_FORM,
      modoRecorrente: true,
      descricao: item.descricao ?? "",
      valorPrevisto: String(item.valor ?? ""),
      tipo: item.tipo ?? "despesa",
      natureza: item.natureza ?? "fixo",
      contaNome: item.contaNome ?? "",
      obraNome: item.obraNome ?? "",
      frequencia: item.frequencia ?? "mensal",
      diaVencimento: String(item.diaVencimento ?? "5"),
      formaPagamento: item.formaPagamento ?? "",
      fornecedorNome: item.fornecedorNome ?? "",
      observacoes: item.observacoes ?? "",
    });
    setShowNew(true);
  }

  function toggleAtivo(item: any) {
    updateRecMut.mutate({ id: item.id, companyId, ativo: item.ativo === 1 ? 0 : 1 });
  }

  function handleSave() {
    if (!form.valorPrevisto || !form.descricao) {
      toast({ title: "Preencha descrição e valor", variant: "destructive" });
      return;
    }
    if (form.modoRecorrente) {
      const payload = {
        companyId,
        descricao: form.descricao,
        valor: parseFloat(form.valorPrevisto),
        tipo: form.tipo,
        natureza: form.natureza,
        contaNome: form.contaNome || undefined,
        obraNome: form.obraNome || undefined,
        frequencia: form.frequencia,
        diaVencimento: parseInt(form.diaVencimento) || 5,
        formaPagamento: form.formaPagamento || undefined,
        fornecedorNome: form.fornecedorNome || undefined,
        observacoes: form.observacoes || undefined,
      };
      if (editRecId) {
        updateRecMut.mutate({ ...payload, id: editRecId });
      } else {
        createRecMut.mutate(payload);
      }
    } else {
      if (!form.dataCompetencia) {
        toast({ title: "Preencha a data de competência", variant: "destructive" });
        return;
      }
      createEntryMut.mutate({
        companyId,
        tipo: form.tipo,
        natureza: form.natureza,
        valorPrevisto: parseFloat(form.valorPrevisto),
        dataCompetencia: form.dataCompetencia,
        dataVencimento: form.dataVencimento || undefined,
        descricao: form.descricao || undefined,
        contaNome: form.contaNome || undefined,
        obraNome: form.obraNome || undefined,
        formaPagamento: form.formaPagamento || undefined,
        observacoes: form.observacoes || undefined,
        status: form.tipo === "receita" ? "a_receber" : form.status,
      });
    }
  }

  const lancamentos = (data?.data ?? []).filter((l: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (l.descricao ?? "").toLowerCase().includes(q) || (l.obraNome ?? "").toLowerCase().includes(q) || (l.contaNome ?? "").toLowerCase().includes(q);
  });

  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const totalReceitas = lancamentos.filter((l: any) => l.tipo === "receita" && l.status !== "cancelado").reduce((s: number, l: any) => s + Number(l.valorPrevisto ?? 0), 0);
  const totalDespesas = lancamentos.filter((l: any) => l.tipo === "despesa" && l.status !== "cancelado").reduce((s: number, l: any) => s + Number(l.valorPrevisto ?? 0), 0);

  const recEntries = recItems ?? [];
  const recAtivos = recEntries.filter((e: any) => e.ativo === 1);
  const recInativos = recEntries.filter((e: any) => e.ativo !== 1);
  const totalMensal = recAtivos.reduce((s: number, e: any) => {
    const v = Number(e.valor ?? 0);
    if (e.frequencia === "mensal") return s + v;
    if (e.frequencia === "quinzenal") return s + v * 2;
    if (e.frequencia === "semanal") return s + v * 4;
    if (e.frequencia === "trimestral") return s + v / 3;
    if (e.frequencia === "anual") return s + v / 12;
    return s + v;
  }, 0);

  const isPending = createEntryMut.isPending || createRecMut.isPending || updateRecMut.isPending;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lançamentos Financeiros</h1>
            <p className="text-sm text-gray-500 mt-1">Receitas, despesas e recorrências da empresa</p>
          </div>
          <div className="flex items-center gap-2">
            {aba === "recorrencias" && (
              <Button variant="outline" size="sm" className="h-9"
                onClick={() => generateMut.mutate({ companyId })}
                disabled={generateMut.isPending}>
                <Zap className="w-3.5 h-3.5 mr-1.5" />Gerar Pendentes
              </Button>
            )}
            <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-2" />Novo Lançamento
            </Button>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 border-b border-gray-200">
          <button
            onClick={() => setAba("lancamentos")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${aba === "lancamentos" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            Lançamentos
          </button>
          <button
            onClick={() => setAba("recorrencias")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${aba === "recorrencias" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            <Repeat className="w-3.5 h-3.5" />Recorrências
            {recAtivos.length > 0 && (
              <span className="ml-1 bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{recAtivos.length}</span>
            )}
          </button>
        </div>

        {/* ABA LANÇAMENTOS */}
        {aba === "lancamentos" && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-gray-500">Total Receitas</span>
                  </div>
                  <p className="text-xl font-bold text-green-600">{formatBRL(totalReceitas)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                    <span className="text-xs text-gray-500">Total Despesas</span>
                  </div>
                  <p className="text-xl font-bold text-red-500">{formatBRL(totalDespesas)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-blue-600" />
                    <span className="text-xs text-gray-500">Resultado</span>
                  </div>
                  <p className={`text-xl font-bold ${totalReceitas - totalDespesas >= 0 ? "text-blue-600" : "text-red-600"}`}>
                    {formatBRL(totalReceitas - totalDespesas)}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-3">
                  <Select value={mes} onValueChange={setMes}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="Mês" /></SelectTrigger>
                    <SelectContent>
                      {meses.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={tipo} onValueChange={setTipo}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Tipos</SelectItem>
                      <SelectItem value="receita">Receita</SelectItem>
                      <SelectItem value="despesa">Despesa</SelectItem>
                      <SelectItem value="imposto">Imposto</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Status</SelectItem>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input className="pl-9" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  {lancamentos.length} lançamento(s)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-gray-500">Carregando...</div>
                ) : lancamentos.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">Nenhum lançamento encontrado.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {lancamentos.map((l: any) => (
                      <div key={l.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800 truncate">{l.descricao ?? l.contaNome ?? "—"}</span>
                            {l.obraNome && <span className="text-xs text-gray-400 hidden sm:inline">• {l.obraNome}</span>}
                            <Badge className={`text-xs ${STATUS_COLORS[l.status] ?? "bg-gray-100 text-gray-700"}`}>
                              {STATUS_LABELS[l.status] ?? l.status}
                            </Badge>
                            {l.origemModulo === "recorrente" && (
                              <Badge className="text-xs bg-purple-100 text-purple-700">
                                <Repeat className="w-2.5 h-2.5 mr-1" />Recorrente
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Comp.: {l.dataCompetencia}
                            {l.dataVencimento && ` • Venc.: ${l.dataVencimento}`}
                            {l.origemModulo && l.origemModulo !== "recorrente" && ` • Origem: ${l.origemModulo}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 ml-3">
                          <p className={`text-sm font-bold ${l.tipo === "receita" ? "text-green-600" : "text-red-500"}`}>
                            {l.tipo === "receita" ? "+" : "-"}{formatBRL(Number(l.valorPrevisto))}
                          </p>
                          {l.status === "a_pagar" && (
                            <Button size="sm" variant="outline" className="text-green-600 border-green-300 h-7 px-2 text-xs"
                              onClick={() => paidMut.mutate({ id: l.id, companyId, status: "pago", dataPagamento: new Date().toISOString().split("T")[0] })}>
                              <CheckCircle className="w-3 h-3 mr-1" />Pagar
                            </Button>
                          )}
                          {l.status === "a_receber" && (
                            <Button size="sm" variant="outline" className="text-blue-600 border-blue-300 h-7 px-2 text-xs"
                              onClick={() => paidMut.mutate({ id: l.id, companyId, status: "recebido", dataPagamento: new Date().toISOString().split("T")[0] })}>
                              <CheckCircle className="w-3 h-3 mr-1" />Receber
                            </Button>
                          )}
                          {l.status !== "cancelado" && (
                            <Button size="sm" variant="ghost" className="text-red-500 h-7 w-7 p-0"
                              onClick={() => setShowCancel({ id: l.id })}>
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ABA RECORRÊNCIAS */}
        {aba === "recorrencias" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 font-medium">Recorrências Ativas</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{recAtivos.length}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 font-medium">Custo Mensal Estimado</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{formatBRL(totalMensal)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 font-medium">Pausadas</p>
                  <p className="text-2xl font-bold text-gray-400 mt-1">{recInativos.length}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
                  <Repeat className="w-4 h-4" /> Recorrências Cadastradas
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                {recLoading ? (
                  <p className="text-center text-gray-400 py-8">Carregando...</p>
                ) : recEntries.length === 0 ? (
                  <div className="text-center py-10">
                    <Repeat className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">Nenhuma recorrência cadastrada</p>
                    <p className="text-xs text-gray-400 mt-1">Clique em "Novo Lançamento" e escolha "Recorrente"</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recEntries.map((item: any) => {
                      const isReceita = item.tipo === "receita";
                      const isAtivo = item.ativo === 1;
                      return (
                        <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border ${!isAtivo ? "bg-gray-50 border-gray-200 opacity-60" : "bg-white border-gray-100"}`}>
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isReceita ? "bg-green-100" : "bg-red-100"}`}>
                            {isReceita ? <ArrowUpRight className="w-4 h-4 text-green-600" /> : <ArrowDownRight className="w-4 h-4 text-red-600" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-800 truncate">{item.descricao}</p>
                              <Badge variant="outline" className="text-[10px] h-5">{FREQ_LABELS[item.frequencia] ?? item.frequencia}</Badge>
                              {!isAtivo && <Badge variant="secondary" className="text-[10px] h-5">Pausado</Badge>}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                              {item.fornecedorNome && <span>{item.fornecedorNome}</span>}
                              {item.contaNome && <span>{item.contaNome}</span>}
                              <span>Dia {item.diaVencimento}</span>
                              {item.proximoVencimento && (
                                <span className="flex items-center gap-0.5">
                                  <Calendar className="w-3 h-3" />
                                  Próximo: {new Date(item.proximoVencimento).toLocaleDateString("pt-BR")}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`text-sm font-bold ${isReceita ? "text-green-600" : "text-red-600"}`}>
                            {formatBRL(Number(item.valor ?? 0))}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditRec(item)}>
                              <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => toggleAtivo(item)}>
                              {isAtivo ? <Pause className="w-3.5 h-3.5 text-orange-400" /> : <Play className="w-3.5 h-3.5 text-green-500" />}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* MODAL NOVO / EDITAR LANÇAMENTO */}
        <Dialog open={showNew} onOpenChange={(v) => { if (!v) { setShowNew(false); resetForm(); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editRecId ? "Editar Recorrência" : "Novo Lançamento"}</DialogTitle>
            </DialogHeader>

            {/* Toggle Único / Recorrente */}
            {!editRecId && (
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, modoRecorrente: false }))}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${!form.modoRecorrente ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                >
                  Único
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, modoRecorrente: true }))}
                  className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${form.modoRecorrente ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                >
                  <Repeat className="w-3.5 h-3.5" />Recorrente
                </button>
              </div>
            )}

            {form.modoRecorrente && !editRecId && (
              <p className="text-xs text-gray-400 -mt-2 text-center">
                Será gerado automaticamente todo mês na data configurada.
              </p>
            )}

            <div className="space-y-3">
              <div>
                <Label>Descrição *</Label>
                <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Aluguel do escritório" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receita">Receita</SelectItem>
                      <SelectItem value="despesa">Despesa</SelectItem>
                      {!form.modoRecorrente && <SelectItem value="imposto">Imposto</SelectItem>}
                      {!form.modoRecorrente && <SelectItem value="transferencia">Transferência</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor (R$) *</Label>
                  <Input type="number" step="0.01" value={form.valorPrevisto} onChange={e => setForm(f => ({ ...f, valorPrevisto: e.target.value }))} placeholder="0,00" />
                </div>
              </div>

              {/* Campos exclusivos de Recorrente */}
              {form.modoRecorrente && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Frequência</Label>
                    <Select value={form.frequencia} onValueChange={v => setForm(f => ({ ...f, frequencia: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="quinzenal">Quinzenal</SelectItem>
                        <SelectItem value="mensal">Mensal</SelectItem>
                        <SelectItem value="trimestral">Trimestral</SelectItem>
                        <SelectItem value="anual">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Dia de Vencimento</Label>
                    <Input type="number" min={1} max={31} value={form.diaVencimento} onChange={e => setForm(f => ({ ...f, diaVencimento: e.target.value }))} />
                  </div>
                </div>
              )}

              {/* Campos exclusivos de Único */}
              {!form.modoRecorrente && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Data de Competência *</Label>
                    <Input type="date" value={form.dataCompetencia} onChange={e => setForm(f => ({ ...f, dataCompetencia: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Data de Vencimento</Label>
                    <Input type="date" value={form.dataVencimento} onChange={e => setForm(f => ({ ...f, dataVencimento: e.target.value }))} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Conta / Categoria</Label>
                  <Input value={form.contaNome} onChange={e => setForm(f => ({ ...f, contaNome: e.target.value }))} placeholder="Ex: Salários, Aluguel..." />
                </div>
                <div>
                  <Label>Obra (opcional)</Label>
                  <Input value={form.obraNome} onChange={e => setForm(f => ({ ...f, obraNome: e.target.value }))} placeholder="Nome da obra" />
                </div>
              </div>

              {form.modoRecorrente && (
                <div>
                  <Label>Fornecedor / Pagador</Label>
                  <Input value={form.fornecedorNome} onChange={e => setForm(f => ({ ...f, fornecedorNome: e.target.value }))} placeholder="Nome" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Natureza</Label>
                  <Select value={form.natureza} onValueChange={v => setForm(f => ({ ...f, natureza: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixo">Fixo</SelectItem>
                      <SelectItem value="variavel">Variável</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select value={form.formaPagamento || "none"} onValueChange={v => setForm(f => ({ ...f, formaPagamento: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="ted">TED</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                      <SelectItem value="debito_automatico">Débito Automático</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowNew(false); resetForm(); }}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isPending ? "Salvando..." : form.modoRecorrente ? (editRecId ? "Salvar Recorrência" : "Criar Recorrência") : "Salvar Lançamento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal cancelar */}
        <Dialog open={!!showCancel} onOpenChange={() => setShowCancel(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Cancelar Lançamento</DialogTitle>
            </DialogHeader>
            <div>
              <Label>Motivo do cancelamento (obrigatório)</Label>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} placeholder="Informe o motivo..." className="mt-1" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCancel(null)}>Voltar</Button>
              <Button variant="destructive" disabled={motivo.length < 5 || cancelMut.isPending}
                onClick={() => cancelMut.mutate({ id: showCancel!.id, companyId, motivoCancelamento: motivo })}>
                {cancelMut.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
