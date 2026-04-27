import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, AlertTriangle, Search, Calendar, ShoppingCart,
  ChevronLeft, ChevronRight, CreditCard, Banknote, Clock
} from "lucide-react";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const ORIGEM_LABELS: Record<string, string> = {
  compras: "Compras",
  folha: "Folha CLT",
  pj: "Contrato PJ",
  terceiros: "Terceiros",
  frota: "Frota",
  beneficios: "Benefícios",
  tributario: "Tributário",
  juridico: "Jurídico",
  almoxarifado: "Almoxarifado",
  manual: "Manual",
};

function getMesFromDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  return d.getMonth() + 1;
}

type MesStatus = "sem_dados" | "lancamento" | "consolidado";

export default function FinanceiroContasAPagar() {
  const { companyId } = useCompany();
  const { toast } = useToast();

  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mesSel, setMesSel] = useState(hoje.getMonth() + 1);
  const [search, setSearch] = useState("");
  const [origemFilter, setOrigemFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pendentes");
  const [showPay, setShowPay] = useState<any | null>(null);
  const [dataPagamento, setDataPagamento] = useState(hoje.toISOString().split("T")[0]);
  const [formaPagamento, setFormaPagamento] = useState("pix");

  const { data: allContas, isLoading, refetch } = (trpc as any).financial.getContasAPagarByYear.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
  );

  const payMut = (trpc as any).financial.updateEntryStatus.useMutation({
    onSuccess: () => { toast({ title: "Pagamento registrado!" }); setShowPay(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const mesesStatus: Record<number, MesStatus> = useMemo(() => {
    const map: Record<number, MesStatus> = {};
    for (let m = 1; m <= 12; m++) map[m] = "sem_dados";
    if (!allContas) return map;
    for (const c of allContas) {
      const m = getMesFromDate(c.dataVencimento);
      if (!m) continue;
      const cur = map[m];
      const isPago = c.status === "pago";
      if (cur === "sem_dados") {
        map[m] = isPago ? "consolidado" : "lancamento";
      } else if (cur === "consolidado" && !isPago) {
        map[m] = "lancamento";
      }
    }
    return map;
  }, [allContas]);

  const mesData = useMemo(() => {
    if (!allContas) return [];
    return allContas.filter((c: any) => getMesFromDate(c.dataVencimento) === mesSel);
  }, [allContas, mesSel]);

  const hojeStr = hoje.toISOString().split("T")[0];

  const filtered = useMemo(() => {
    let list = mesData;
    if (statusFilter === "pendentes") list = list.filter((c: any) => c.status !== "pago");
    if (statusFilter === "pagos") list = list.filter((c: any) => c.status === "pago");
    if (origemFilter !== "all") list = list.filter((c: any) => c.origemModulo === origemFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c: any) =>
        (c.descricao ?? "").toLowerCase().includes(q) ||
        (c.contaNome ?? "").toLowerCase().includes(q) ||
        (c.obraNome ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [mesData, statusFilter, origemFilter, search]);

  const pendentes = mesData.filter((c: any) => c.status !== "pago");
  const pagos = mesData.filter((c: any) => c.status === "pago");
  const vencidos = pendentes.filter((c: any) => c.dataVencimento && c.dataVencimento < hojeStr);

  const totalMes = mesData.reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);
  const totalPago = pagos.reduce((s: number, c: any) => s + Number(c.valorRealizado ?? c.valorPrevisto ?? 0), 0);
  const totalPendente = pendentes.reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);
  const totalVencido = vencidos.reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);

  const origensDisponiveis = useMemo(() => {
    if (!mesData.length) return [];
    const s = new Set(mesData.map((c: any) => c.origemModulo).filter(Boolean));
    return Array.from(s) as string[];
  }, [mesData]);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-5">

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contas a Pagar</h1>
          <p className="text-sm text-gray-500 mt-1">Despesas e obrigações financeiras por mês</p>
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

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm border-l-4 border-l-gray-400">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Banknote className="w-3 h-3" />Total {MESES[mesSel-1]}</p>
              <p className="text-lg font-bold text-gray-800">{formatBRL(totalMes)}</p>
              <p className="text-xs text-gray-400">{mesData.length} conta(s)</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm border-l-4 border-l-orange-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Clock className="w-3 h-3" />A Pagar</p>
              <p className="text-lg font-bold text-orange-600">{formatBRL(totalPendente)}</p>
              <p className="text-xs text-gray-400">{pendentes.length} pendente(s)</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" />Vencidas</p>
              <p className="text-lg font-bold text-red-600">{formatBRL(totalVencido)}</p>
              <p className="text-xs text-gray-400">{vencidos.length} em atraso</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" />Pago</p>
              <p className="text-lg font-bold text-green-700">{formatBRL(totalPago)}</p>
              <p className="text-xs text-gray-400">{pagos.length} quitado(s)</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex flex-wrap gap-3 items-center">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[["pendentes","A Pagar"],["pagos","Pagos"],["all","Todos"]].map(([v,l]) => (
                <button key={v}
                  onClick={() => setStatusFilter(v)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === v ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {l}
                </button>
              ))}
            </div>
            {origensDisponiveis.length > 0 && (
              <Select value={origemFilter} onValueChange={setOrigemFilter}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas origens</SelectItem>
                  {origensDisponiveis.map((o: string) => (
                    <SelectItem key={o} value={o}>{ORIGEM_LABELS[o] ?? o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9 h-8 text-sm" placeholder="Buscar conta..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2 px-5 pt-4">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-orange-500" />
              {MESES[mesSel-1]} {ano} — {filtered.length} conta(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Nenhuma conta em {MESES[mesSel-1]} {ano}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Descrição / Obra","Origem","Vencimento","Valor","Status",""].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((c: any) => {
                      const vencida = c.dataVencimento && c.dataVencimento < hojeStr && c.status !== "pago";
                      return (
                        <tr key={c.id} className={`hover:bg-gray-50 ${vencida ? "bg-red-50/30" : ""}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-800 text-sm">{c.descricao ?? c.contaNome ?? "—"}</p>
                            </div>
                            {c.obraNome && <p className="text-xs text-gray-400 mt-0.5">{c.obraNome}</p>}
                          </td>
                          <td className="px-4 py-3">
                            {c.origemModulo && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 border border-gray-200">
                                {c.origemModulo === "compras" && <ShoppingCart className="w-2.5 h-2.5" />}
                                {ORIGEM_LABELS[c.origemModulo] ?? c.origemModulo}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {c.dataVencimento ? (
                              <span className={vencida ? "text-red-600 font-semibold" : "text-gray-600"}>
                                {c.dataVencimento}
                                {vencida && <span className="block text-red-500">{c.diasAtraso}d atraso</span>}
                              </span>
                            ) : <span className="text-gray-400">Sem data</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-semibold text-sm ${vencida ? "text-red-700" : c.status === "pago" ? "text-green-700" : "text-orange-700"}`}>
                              {formatBRL(Number(c.valorPrevisto ?? 0))}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {c.status === "pago" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <CheckCircle className="w-3 h-3" />Pago
                              </span>
                            ) : vencida ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                <AlertTriangle className="w-3 h-3" />Vencido
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                                <Clock className="w-3 h-3" />A Pagar
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {c.status !== "pago" && (
                              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 px-2 text-xs"
                                onClick={() => setShowPay(c)}>
                                <CheckCircle className="w-3 h-3 mr-1" />Pagar
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

        {/* Resumo anual */}
        {allContas && allContas.length > 0 && (
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
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Total</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Pago</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">A Pagar</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Vencido</th>
                      <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {MESES.map((m, i) => {
                      const num = i + 1;
                      const entries = allContas.filter((c: any) => getMesFromDate(c.dataVencimento) === num);
                      if (entries.length === 0) return null;
                      const totM = entries.reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);
                      const pgM = entries.filter((c: any) => c.status === "pago").reduce((s: number, c: any) => s + Number(c.valorRealizado ?? c.valorPrevisto ?? 0), 0);
                      const pdM = entries.filter((c: any) => c.status !== "pago").reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);
                      const vcM = entries.filter((c: any) => c.dataVencimento && c.dataVencimento < hojeStr && c.status !== "pago").reduce((s: number, c: any) => s + Number(c.valorPrevisto ?? 0), 0);
                      const st = mesesStatus[num];
                      return (
                        <tr key={m}
                          className={`hover:bg-gray-50 cursor-pointer ${mesSel === num ? "bg-blue-50/40" : ""}`}
                          onClick={() => setMesSel(num)}>
                          <td className="px-4 py-2.5 font-medium text-gray-700">{m}/{ano}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{formatBRL(totM)}</td>
                          <td className="px-4 py-2.5 text-right text-green-700">{formatBRL(pgM)}</td>
                          <td className="px-4 py-2.5 text-right text-orange-600">{formatBRL(pdM)}</td>
                          <td className="px-4 py-2.5 text-right text-red-600">{vcM > 0 ? formatBRL(vcM) : "—"}</td>
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

        {/* Modal pagar */}
        <Dialog open={!!showPay} onOpenChange={() => setShowPay(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
            {showPay && (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-800">{showPay.descricao ?? showPay.contaNome ?? "—"}</p>
                  {showPay.obraNome && <p className="text-xs text-gray-500">{showPay.obraNome}</p>}
                  <p className="text-lg font-bold text-orange-700 mt-1">{formatBRL(Number(showPay.valorPrevisto))}</p>
                </div>
                <div>
                  <Label>Data do Pagamento</Label>
                  <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
                </div>
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["pix","ted","boleto","cheque","dinheiro","cartao_credito","debito_automatico"].map(v => (
                        <SelectItem key={v} value={v}>{v.replace(/_/g," ").toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPay(null)}>Cancelar</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={payMut.isPending}
                onClick={() => payMut.mutate({ id: showPay.id, companyId, status: "pago", dataPagamento, formaPagamento })}>
                {payMut.isPending ? "Registrando..." : "Confirmar Pagamento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
