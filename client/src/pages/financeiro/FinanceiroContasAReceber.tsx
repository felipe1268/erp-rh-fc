import { useState, useMemo } from "react";
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
import { Plus, Search, CheckCircle, AlertTriangle, FileText, TrendingUp, Clock, ChevronLeft, ChevronRight, DollarSign, ReceiptText } from "lucide-react";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const STATUS_LABELS: Record<string, string> = {
  a_faturar: "A Faturar",
  faturado: "Faturado",
  a_receber: "A Receber",
  recebido_parcial: "Recebido Parcial",
  recebido_total: "Recebido Total",
  cancelado: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  a_faturar: "bg-yellow-100 text-yellow-800",
  faturado: "bg-blue-100 text-blue-800",
  a_receber: "bg-purple-100 text-purple-700",
  recebido_parcial: "bg-teal-100 text-teal-700",
  recebido_total: "bg-green-100 text-green-800",
  cancelado: "bg-red-100 text-red-700",
};

const FORM_EMPTY = {
  obraId: "", obraNome: "", clienteNome: "", clienteCnpj: "",
  valorContrato: "", valorMedicao: "", medicaoNumero: "",
  percentualMedicao: "", dataVencimento: "",
  retencaoISS: "0", retencaoINSS: "0", retencaoIR: "0", observacoes: "",
};

const UPDATE_EMPTY = {
  status: "", nfNumero: "", nfEmitidaEm: "",
  dataRecebimento: "", valorRecebido: "", formaPagamento: "",
};

function getMesFromDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  return d.getMonth() + 1;
}

type MesStatus = "sem_dados" | "lancamento" | "consolidado";

export default function FinanceiroContasAReceber() {
  const { companyId } = useCompany();
  const { toast } = useToast();

  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [showUpdate, setShowUpdate] = useState<any | null>(null);
  const [form, setForm] = useState(FORM_EMPTY);
  const [updateForm, setUpdateForm] = useState(UPDATE_EMPTY);

  const { data: allReceitas, isLoading, refetch } = (trpc as any).financial.getRevenueByYear.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
  );

  const { data: obras } = (trpc as any).obras.getObras.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const createMut = (trpc as any).financial.createRevenue.useMutation({
    onSuccess: () => { toast({ title: "Receita registrada!" }); setShowNew(false); setForm(FORM_EMPTY); refetch(); },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const updateMut = (trpc as any).financial.updateRevenueStatus.useMutation({
    onSuccess: () => { toast({ title: "Status atualizado!" }); setShowUpdate(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const mesesStatus: Record<number, MesStatus> = useMemo(() => {
    const map: Record<number, MesStatus> = {};
    for (let m = 1; m <= 12; m++) map[m] = "sem_dados";
    if (!allReceitas) return map;
    for (const r of allReceitas) {
      const m = getMesFromDate(r.dataVencimento ?? r.createdAt);
      if (!m) continue;
      const cur = map[m];
      const isConc = r.status === "recebido_total" || r.status === "cancelado";
      if (cur === "sem_dados") {
        map[m] = isConc ? "consolidado" : "lancamento";
      } else if (cur === "consolidado" && !isConc) {
        map[m] = "lancamento";
      }
    }
    return map;
  }, [allReceitas]);

  const mesData = useMemo(() => {
    if (!allReceitas) return [];
    return allReceitas.filter((r: any) => {
      const m = getMesFromDate(r.dataVencimento ?? r.createdAt);
      return m === mesSel;
    });
  }, [allReceitas, mesSel]);

  const filtered = useMemo(() => {
    let list = mesData;
    if (statusFilter !== "all") list = list.filter((r: any) => r.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r: any) =>
        (r.obraNome ?? "").toLowerCase().includes(q) ||
        (r.clienteNome ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [mesData, statusFilter, search]);

  const hojeStr = hoje.toISOString().split("T")[0];

  const totalMes = mesData.filter((r: any) => r.status !== "cancelado").reduce((s: number, r: any) => s + Number(r.valorMedicao ?? 0), 0);
  const totalRecebido = mesData.reduce((s: number, r: any) => s + Number(r.valorRecebido ?? 0), 0);
  const totalPendente = mesData.filter((r: any) => !["recebido_total","cancelado"].includes(r.status)).reduce((s: number, r: any) => s + Number(r.valorMedicao ?? 0), 0);
  const vencidas = mesData.filter((r: any) => r.dataVencimento && r.dataVencimento < hojeStr && r.status !== "recebido_total" && r.status !== "cancelado");
  const totalVencido = vencidas.reduce((s: number, r: any) => s + Number(r.valorMedicao ?? 0), 0);

  function handleSave() {
    if (!form.valorMedicao) { toast({ title: "Informe o valor da medição", variant: "destructive" }); return; }
    createMut.mutate({
      companyId,
      obraId: parseInt(form.obraId) || 0,
      obraNome: form.obraNome || undefined,
      clienteNome: form.clienteNome || undefined,
      clienteCnpj: form.clienteCnpj || undefined,
      valorContrato: parseFloat(form.valorContrato) || undefined,
      valorMedicao: parseFloat(form.valorMedicao),
      medicaoNumero: parseInt(form.medicaoNumero) || undefined,
      percentualMedicao: parseFloat(form.percentualMedicao) || undefined,
      dataVencimento: form.dataVencimento || undefined,
      retencaoISS: parseFloat(form.retencaoISS) || 0,
      retencaoINSS: parseFloat(form.retencaoINSS) || 0,
      retencaoIR: parseFloat(form.retencaoIR) || 0,
      observacoes: form.observacoes || undefined,
    });
  }

  function handleUpdate() {
    updateMut.mutate({
      id: showUpdate.id,
      companyId,
      status: updateForm.status || showUpdate.status,
      nfNumero: updateForm.nfNumero || undefined,
      nfEmitidaEm: updateForm.nfEmitidaEm || undefined,
      dataRecebimento: updateForm.dataRecebimento || undefined,
      valorRecebido: parseFloat(updateForm.valorRecebido) || undefined,
      formaPagamento: updateForm.formaPagamento || undefined,
    });
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-5">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contas a Receber</h1>
            <p className="text-sm text-gray-500 mt-1">Medições, faturamento e recebimentos de obras</p>
          </div>
          <Button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" />Nova Receita
          </Button>
        </div>

        {/* Navegação Ano + Meses */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setAno(a => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
                <button onClick={() => setAno(a => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Consolidado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados</span>
              </div>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {MESES.map((m, i) => {
                const num = i + 1;
                const status = mesesStatus[num];
                const isSelected = mesSel === num;
                return (
                  <button
                    key={m}
                    onClick={() => setMesSel(num)}
                    className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                      ${isSelected
                        ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                  >
                    <span>{m}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      status === "consolidado" ? "bg-green-500" :
                      status === "lancamento" ? "bg-blue-500" :
                      "bg-gray-300"
                    }`} />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards do mês */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" />Total {MESES[mesSel-1]}</p>
              <p className="text-lg font-bold text-blue-700">{formatBRL(totalMes)}</p>
              <p className="text-xs text-gray-400">{mesData.filter((r: any) => r.status !== "cancelado").length} registro(s)</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm border-l-4 border-l-orange-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" />A Receber</p>
              <p className="text-lg font-bold text-orange-600">{formatBRL(totalPendente)}</p>
              <p className="text-xs text-gray-400">{mesData.filter((r: any) => !["recebido_total","cancelado"].includes(r.status)).length} pendente(s)</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" />Vencidas</p>
              <p className="text-lg font-bold text-red-600">{formatBRL(totalVencido)}</p>
              <p className="text-xs text-gray-400">{vencidas.length} em atraso</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" />Recebido</p>
              <p className="text-lg font-bold text-green-700">{formatBRL(totalRecebido)}</p>
              <p className="text-xs text-gray-400">{mesData.filter((r: any) => r.status === "recebido_total").length} finalizado(s)</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex flex-wrap gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Todos os Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9" placeholder="Buscar obra ou cliente..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-blue-500" />
              {MESES[mesSel-1]} {ano} — {filtered.length} registro(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <DollarSign className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Nenhuma receita em {MESES[mesSel-1]} {ano}</p>
                <p className="text-gray-400 text-sm mt-1">Clique em "Nova Receita" para registrar uma medição.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Obra / Cliente","Med.","Valor Medição","NF","Vencimento","Recebido","Status",""].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((r: any) => {
                      const vencida = r.dataVencimento && r.dataVencimento < hojeStr && r.status !== "recebido_total" && r.status !== "cancelado";
                      return (
                        <tr key={r.id} className={`hover:bg-gray-50 ${vencida ? "bg-red-50/30" : ""}`}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-800">{r.obraNome ?? "—"}</p>
                            {r.clienteNome && <p className="text-xs text-gray-400">{r.clienteNome}</p>}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{r.medicaoNumero ? `#${r.medicaoNumero}` : "—"}</td>
                          <td className="px-4 py-3 font-semibold text-green-700">{formatBRL(Number(r.valorMedicao ?? 0))}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{r.nfNumero ?? "—"}</td>
                          <td className="px-4 py-3 text-xs">
                            {r.dataVencimento ? (
                              <span className={vencida ? "text-red-600 font-semibold" : "text-gray-500"}>
                                {r.dataVencimento}
                                {vencida && <span className="block text-red-500">Em atraso</span>}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 text-blue-700 font-medium text-xs">
                            {r.valorRecebido ? formatBRL(Number(r.valorRecebido)) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={`text-xs ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                              {STATUS_LABELS[r.status] ?? r.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            {r.status !== "cancelado" && r.status !== "recebido_total" && (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                                onClick={() => {
                                  setShowUpdate(r);
                                  setUpdateForm({ ...UPDATE_EMPTY, status: r.status, nfNumero: r.nfNumero ?? "", nfEmitidaEm: r.nfEmitidaEm ?? "" });
                                }}>
                                <FileText className="w-3 h-3 mr-1" />Atualizar
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resumo anual por mês */}
        {allReceitas && allReceitas.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 px-5 pt-4">
              <CardTitle className="text-sm font-semibold text-gray-700">Resumo Anual {ano}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Mês</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Medições</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Recebido</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">A Receber</th>
                      <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {MESES.map((m, i) => {
                      const num = i + 1;
                      const entries = allReceitas.filter((r: any) => getMesFromDate(r.dataVencimento ?? r.createdAt) === num);
                      if (entries.length === 0) return null;
                      const totalM = entries.filter((r: any) => r.status !== "cancelado").reduce((s: number, r: any) => s + Number(r.valorMedicao ?? 0), 0);
                      const recebidoM = entries.reduce((s: number, r: any) => s + Number(r.valorRecebido ?? 0), 0);
                      const pendenteM = totalM - recebidoM;
                      const st = mesesStatus[num];
                      return (
                        <tr key={m}
                          className={`hover:bg-gray-50 cursor-pointer ${mesSel === num ? "bg-blue-50/40" : ""}`}
                          onClick={() => setMesSel(num)}>
                          <td className="px-4 py-2.5 font-medium text-gray-700">{m}/{ano}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{formatBRL(totalM)}</td>
                          <td className="px-4 py-2.5 text-right text-green-700">{formatBRL(recebidoM)}</td>
                          <td className="px-4 py-2.5 text-right text-orange-600">{formatBRL(pendenteM)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              st === "consolidado" ? "bg-green-100 text-green-700" :
                              st === "lancamento" ? "bg-blue-100 text-blue-700" :
                              "bg-gray-100 text-gray-500"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                st === "consolidado" ? "bg-green-500" :
                                st === "lancamento" ? "bg-blue-500" : "bg-gray-400"
                              }`} />
                              {st === "consolidado" ? "Consolidado" : st === "lancamento" ? "Lançamento" : "Sem dados"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Modal: nova receita */}
        <Dialog open={showNew} onOpenChange={v => { setShowNew(v); if (!v) setForm(FORM_EMPTY); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nova Receita / Medição</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Obra *</Label>
                  <Select value={form.obraId} onValueChange={v => {
                    const o = obras?.find((ob: any) => String(ob.id) === v);
                    setForm(f => ({ ...f, obraId: v, obraNome: o?.nome ?? "" }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                    <SelectContent>
                      {(obras ?? []).map((o: any) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nº da Medição</Label>
                  <Input type="number" value={form.medicaoNumero} onChange={e => setForm(f => ({ ...f, medicaoNumero: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cliente</Label>
                  <Input value={form.clienteNome} onChange={e => setForm(f => ({ ...f, clienteNome: e.target.value }))} />
                </div>
                <div>
                  <Label>CNPJ do Cliente</Label>
                  <Input value={form.clienteCnpj} onChange={e => setForm(f => ({ ...f, clienteCnpj: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valor do Contrato (R$)</Label>
                  <Input type="number" step="0.01" value={form.valorContrato} onChange={e => setForm(f => ({ ...f, valorContrato: e.target.value }))} />
                </div>
                <div>
                  <Label>Valor da Medição (R$) *</Label>
                  <Input type="number" step="0.01" value={form.valorMedicao} onChange={e => setForm(f => ({ ...f, valorMedicao: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>% da Medição</Label>
                  <Input type="number" step="0.01" value={form.percentualMedicao} onChange={e => setForm(f => ({ ...f, percentualMedicao: e.target.value }))} />
                </div>
                <div>
                  <Label>Data de Vencimento</Label>
                  <Input type="date" value={form.dataVencimento} onChange={e => setForm(f => ({ ...f, dataVencimento: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>ISS (R$)</Label><Input type="number" step="0.01" value={form.retencaoISS} onChange={e => setForm(f => ({ ...f, retencaoISS: e.target.value }))} /></div>
                <div><Label>INSS (R$)</Label><Input type="number" step="0.01" value={form.retencaoINSS} onChange={e => setForm(f => ({ ...f, retencaoINSS: e.target.value }))} /></div>
                <div><Label>IR (R$)</Label><Input type="number" step="0.01" value={form.retencaoIR} onChange={e => setForm(f => ({ ...f, retencaoIR: e.target.value }))} /></div>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={createMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {createMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: atualizar status */}
        <Dialog open={!!showUpdate} onOpenChange={v => { if (!v) setShowUpdate(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Atualizar Receita</DialogTitle></DialogHeader>
            {showUpdate && (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-semibold text-gray-800">{showUpdate.obraNome ?? "—"}</p>
                  <p className="text-xs text-gray-500">{showUpdate.clienteNome ?? ""}</p>
                  <p className="text-lg font-bold text-blue-700 mt-1">{formatBRL(Number(showUpdate.valorMedicao ?? 0))}</p>
                </div>
                <div>
                  <Label>Novo Status</Label>
                  <Select value={updateForm.status} onValueChange={v => setUpdateForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Nº da NF</Label><Input value={updateForm.nfNumero} onChange={e => setUpdateForm(f => ({ ...f, nfNumero: e.target.value }))} /></div>
                  <div><Label>Emissão NF</Label><Input type="date" value={updateForm.nfEmitidaEm} onChange={e => setUpdateForm(f => ({ ...f, nfEmitidaEm: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Data Recebimento</Label><Input type="date" value={updateForm.dataRecebimento} onChange={e => setUpdateForm(f => ({ ...f, dataRecebimento: e.target.value }))} /></div>
                  <div>
                    <Label>Valor Recebido (R$)</Label>
                    <Input type="number" step="0.01" placeholder={String(showUpdate.valorMedicao ?? "")} value={updateForm.valorRecebido} onChange={e => setUpdateForm(f => ({ ...f, valorRecebido: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select value={updateForm.formaPagamento} onValueChange={v => setUpdateForm(f => ({ ...f, formaPagamento: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {["pix","ted","boleto","cheque","dinheiro"].map(v => (
                        <SelectItem key={v} value={v}>{v.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUpdate(null)}>Cancelar</Button>
              <Button disabled={updateMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleUpdate}>
                {updateMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
