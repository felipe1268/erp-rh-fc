import { useState } from "react";
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
import { Plus, CheckCircle, AlertTriangle, Calendar } from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getMesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const TIPOS = [
  { value: "das_simples", label: "DAS - Simples Nacional" },
  { value: "darf_irpj", label: "DARF - IRPJ" },
  { value: "darf_csll", label: "DARF - CSLL" },
  { value: "darf_pis", label: "DARF - PIS" },
  { value: "darf_cofins", label: "DARF - COFINS" },
  { value: "gps_inss", label: "GPS - INSS" },
  { value: "guia_fgts", label: "Guia FGTS" },
  { value: "iss", label: "ISS" },
  { value: "icms", label: "ICMS" },
];

const STATUS_COLORS: Record<string, string> = {
  a_pagar: "bg-orange-100 text-orange-800",
  pago: "bg-green-100 text-green-800",
  atrasado: "bg-red-100 text-red-800",
  cancelado: "bg-gray-100 text-gray-600",
};

export default function FinanceiroObrigacoesFiscais() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [mesFilter, setMesFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [showPay, setShowPay] = useState<any | null>(null);
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split("T")[0]);

  const [form, setForm] = useState({
    tipo: "das_simples",
    mesCompetencia: getMesAtual(),
    baseCalculo: "",
    aliquota: "",
    valorPrincipal: "",
    valorMulta: "0",
    valorJuros: "0",
    dataVencimento: "",
    codigoReceita: "",
    status: "a_pagar",
  });

  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: obrigacoes, isLoading, refetch } = (trpc as any).financial.getTaxObligations.useQuery(
    {
      companyId,
      mesCompetencia: mesFilter !== "all" ? mesFilter : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
    },
    { enabled: !!companyId }
  );

  const createMut = (trpc as any).financial.createTaxObligation.useMutation({
    onSuccess: () => { toast({ title: "Obrigação criada!" }); setShowNew(false); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const payMut = (trpc as any).financial.payTaxObligation.useMutation({
    onSuccess: () => { toast({ title: "Pagamento registrado!" }); setShowPay(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const aPagar = (obrigacoes ?? []).filter((o: any) => o.status === "a_pagar");
  const pagas = (obrigacoes ?? []).filter((o: any) => o.status === "pago");
  const totalAPagar = aPagar.reduce((s: number, o: any) => s + Number(o.valorTotal ?? 0), 0);
  const totalPago = pagas.reduce((s: number, o: any) => s + Number(o.valorTotal ?? 0), 0);

  const hoje = new Date().toISOString().split("T")[0];
  const vencidas = aPagar.filter((o: any) => o.dataVencimento < hoje);

  function handleSave() {
    if (!form.valorPrincipal || !form.dataVencimento) {
      toast({ title: "Preencha valor e data de vencimento", variant: "destructive" });
      return;
    }
    createMut.mutate({
      companyId,
      tipo: form.tipo,
      mesCompetencia: form.mesCompetencia,
      baseCalculo: parseFloat(form.baseCalculo) || undefined,
      aliquota: parseFloat(form.aliquota) || undefined,
      valorPrincipal: parseFloat(form.valorPrincipal),
      valorMulta: parseFloat(form.valorMulta) || 0,
      valorJuros: parseFloat(form.valorJuros) || 0,
      dataVencimento: form.dataVencimento,
      codigoReceita: form.codigoReceita || undefined,
      status: form.status,
    });
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-orange-500" />Obrigações Fiscais
            </h1>
            <p className="text-sm text-gray-500 mt-1">Guias, DARF, DAS, FGTS e demais tributos</p>
          </div>
          <Button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" />Nova Obrigação
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm border-l-4 border-l-orange-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">A Pagar</p>
              <p className="text-xl font-bold text-orange-600">{formatBRL(totalAPagar)}</p>
              <p className="text-xs text-gray-400">{aPagar.length} guia(s)</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" />Vencidas</p>
              <p className="text-xl font-bold text-red-600">{formatBRL(vencidas.reduce((s: number, o: any) => s + Number(o.valorTotal ?? 0), 0))}</p>
              <p className="text-xs text-gray-400">{vencidas.length} guia(s)</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 mb-1">Pagas (período)</p>
              <p className="text-xl font-bold text-green-600">{formatBRL(totalPago)}</p>
              <p className="text-xs text-gray-400">{pagas.length} guia(s)</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex flex-wrap gap-3">
            <Select value={mesFilter} onValueChange={setMesFilter}>
              <SelectTrigger className="w-40">
                <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                <SelectValue placeholder="Competência" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Competências</SelectItem>
                {meses.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="a_pagar">A Pagar</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="atrasado">Atrasado</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Lista */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Carregando...</div>
            ) : (obrigacoes ?? []).length === 0 ? (
              <div className="p-8 text-center text-gray-400">Nenhuma obrigação encontrada.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {(obrigacoes ?? []).map((ob: any) => {
                  const isVencida = ob.status === "a_pagar" && ob.dataVencimento < hoje;
                  return (
                    <div key={ob.id} className={`px-5 py-4 flex items-center justify-between hover:bg-gray-50 ${isVencida ? "bg-red-50/30" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-800">
                            {TIPOS.find(t => t.value === ob.tipo)?.label ?? ob.tipo.toUpperCase().replace(/_/g, " ")}
                          </span>
                          <Badge className={`text-xs ${STATUS_COLORS[ob.status] ?? "bg-gray-100"}`}>
                            {ob.status === "pago" ? "Pago" : isVencida ? "VENCIDA" : "A Pagar"}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Comp.: {ob.mesCompetencia} • Venc.: {ob.dataVencimento}
                          {ob.dataPagamento ? ` • Pago: ${ob.dataPagamento}` : ""}
                          {ob.codigoReceita ? ` • Código: ${ob.codigoReceita}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 ml-3">
                        <div className="text-right">
                          <p className={`text-sm font-bold ${ob.status === "pago" ? "text-green-700" : isVencida ? "text-red-700" : "text-orange-700"}`}>
                            {formatBRL(Number(ob.valorTotal))}
                          </p>
                          {Number(ob.valorMulta ?? 0) > 0 && (
                            <p className="text-xs text-red-500">Multa: {formatBRL(Number(ob.valorMulta))}</p>
                          )}
                        </div>
                        {ob.status === "a_pagar" && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-7 px-2 text-xs"
                            onClick={() => setShowPay(ob)}>
                            <CheckCircle className="w-3 h-3 mr-1" />Pagar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal nova obrigação */}
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Nova Obrigação Fiscal</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Tipo de Obrigação</Label>
                <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Mês de Competência</Label>
                  <Input type="month" value={form.mesCompetencia} onChange={e => setForm(f => ({ ...f, mesCompetencia: e.target.value }))} />
                </div>
                <div>
                  <Label>Data de Vencimento *</Label>
                  <Input type="date" value={form.dataVencimento} onChange={e => setForm(f => ({ ...f, dataVencimento: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Base de Cálculo (R$)</Label>
                  <Input type="number" step="0.01" value={form.baseCalculo} onChange={e => setForm(f => ({ ...f, baseCalculo: e.target.value }))} />
                </div>
                <div>
                  <Label>Alíquota (%)</Label>
                  <Input type="number" step="0.01" value={form.aliquota} onChange={e => setForm(f => ({ ...f, aliquota: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Valor Principal *</Label>
                  <Input type="number" step="0.01" value={form.valorPrincipal} onChange={e => setForm(f => ({ ...f, valorPrincipal: e.target.value }))} />
                </div>
                <div>
                  <Label>Multa (R$)</Label>
                  <Input type="number" step="0.01" value={form.valorMulta} onChange={e => setForm(f => ({ ...f, valorMulta: e.target.value }))} />
                </div>
                <div>
                  <Label>Juros (R$)</Label>
                  <Input type="number" step="0.01" value={form.valorJuros} onChange={e => setForm(f => ({ ...f, valorJuros: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Código de Receita</Label>
                <Input value={form.codigoReceita} onChange={e => setForm(f => ({ ...f, codigoReceita: e.target.value }))} placeholder="Ex: 2089" />
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

        {/* Modal pagar */}
        <Dialog open={!!showPay} onOpenChange={() => setShowPay(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
            {showPay && (
              <div className="space-y-4">
                <div className="bg-orange-50 rounded-lg p-3">
                  <p className="text-sm font-medium">{TIPOS.find(t => t.value === showPay.tipo)?.label}</p>
                  <p className="text-sm text-gray-500">Comp.: {showPay.mesCompetencia}</p>
                  <p className="text-lg font-bold text-orange-700">{formatBRL(Number(showPay.valorTotal))}</p>
                </div>
                <div>
                  <Label>Data do Pagamento</Label>
                  <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPay(null)}>Cancelar</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={payMut.isPending}
                onClick={() => payMut.mutate({ id: showPay.id, companyId, dataPagamento })}>
                {payMut.isPending ? "Registrando..." : "Confirmar Pagamento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
