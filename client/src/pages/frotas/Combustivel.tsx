import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Fuel, Plus, Pencil, Trash2, Upload, Search, FileText, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";

function fmt(v: any) {
  return parseFloat(v || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const COMBUSTIVEIS = ["Gasolina", "Etanol", "Diesel", "Diesel S10", "GNV", "Flex"];

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function Combustivel() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [search, setSearch] = useState("");
  const [importResult, setImportResult] = useState<any>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<number | null>(null);
  const [pdfProgressLabel, setPdfProgressLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const vehicles = trpc.frotas.listVehicles.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const fuel = trpc.frotas.listFuelRecords.useQuery(
    { companyId: cId, vehicleId: filterVehicle !== "all" ? parseInt(filterVehicle) : undefined },
    { enabled: cId > 0 },
  );
  const createMut = trpc.frotas.createFuelRecord.useMutation({
    onSuccess: () => { fuel.refetch(); setDialogOpen(false); toast.success("Abastecimento registrado"); },
  });
  const updateMut = trpc.frotas.updateFuelRecord.useMutation({
    onSuccess: () => { fuel.refetch(); setDialogOpen(false); toast.success("Registro atualizado"); },
  });
  const deleteMut = trpc.frotas.deleteFuelRecord.useMutation({
    onSuccess: () => { fuel.refetch(); toast.success("Registro excluído"); },
  });
  const importCsvMut = trpc.frotas.importFuelCsv.useMutation({
    onSuccess: (data) => { fuel.refetch(); toast.success(`${data.inserted} registros importados`); },
    onError: (err) => toast.error(err.message),
  });
  const importPdfMut = trpc.frotas.importFuelPdf.useMutation({
    onSuccess: (data) => {
      fuel.refetch();
      setImportResult(data);
      setImportDialogOpen(true);
    },
    onError: (err) => toast.error("Erro ao importar PDF: " + err.message),
  });

  function openNew() {
    setEditing(null);
    setForm({ data: new Date().toISOString().slice(0, 10), tipoCombustivel: "Diesel" });
    setDialogOpen(true);
  }

  function openEdit(r: any) {
    setEditing(r);
    setForm({
      vehicleId: r.vehicle_id, data: r.data, tipoCombustivel: r.tipo_combustivel,
      litros: r.litros, precoLitro: r.preco_litro, valorTotal: r.valor_total,
      kmAtual: r.km_atual, posto: r.posto, motorista: r.motorista, observacoes: r.observacoes,
    });
    setDialogOpen(true);
  }

  function save() {
    if (!form.vehicleId || !form.data || !form.litros) {
      toast.error("Preencha veículo, data e litros");
      return;
    }
    const payload = { ...form, companyId: cId, criadoPor: user?.name };
    if (editing) updateMut.mutate({ id: editing.id, ...payload });
    else createMut.mutate(payload);
  }

  function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      importCsvMut.mutate({ companyId: cId, csvContent: ev.target?.result as string, criadoPor: user?.name || "" } as any);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handlePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error("Selecione um arquivo PDF");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 10MB)");
      return;
    }

    setPdfProgress(0);
    setPdfProgressLabel("Lendo arquivo...");

    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) {
        const pct = Math.round((ev.loaded / ev.total) * 30);
        setPdfProgress(pct);
      }
    };
    reader.onload = (ev) => {
      setPdfProgress(30);
      setPdfProgressLabel("Preparando envio...");

      const result = ev.target?.result as ArrayBuffer;
      const base64 = btoa(
        new Uint8Array(result).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      setPdfProgress(40);
      setPdfProgressLabel("Enviando ao servidor...");

      let progressInterval: ReturnType<typeof setInterval>;
      let current = 40;
      progressInterval = setInterval(() => {
        current = Math.min(current + 2, 85);
        setPdfProgress(current);
        if (current >= 60 && current < 85) {
          setPdfProgressLabel("Processando PDF...");
        }
      }, 300);

      importPdfMut.mutate(
        { companyId: cId, pdfBase64: base64, criadoPor: user?.name || "" },
        {
          onSuccess: () => {
            clearInterval(progressInterval);
            setPdfProgress(95);
            setPdfProgressLabel("Finalizando...");
            setTimeout(() => {
              setPdfProgress(100);
              setPdfProgressLabel("Concluído!");
              setTimeout(() => { setPdfProgress(null); setPdfProgressLabel(""); }, 800);
            }, 400);
          },
          onError: () => {
            clearInterval(progressInterval);
            setPdfProgress(null);
            setPdfProgressLabel("");
          },
        }
      );
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  const allRecords = fuel.data || [];

  const availableMonths = (() => {
    const months = new Set<string>();
    allRecords.forEach((r: any) => {
      if (r.data) {
        const [y, m] = r.data.split('-');
        months.add(`${y}-${m}`);
      }
    });
    return [...months].sort().reverse();
  })();

  const list = allRecords.filter((r: any) => {
    if (filterMonth !== "all" && r.data) {
      const [y, m] = r.data.split('-');
      if (`${y}-${m}` !== filterMonth) return false;
    }
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (r.placa || "").toLowerCase().includes(s) ||
      (r.posto || "").toLowerCase().includes(s) ||
      (r.motorista || "").toLowerCase().includes(s)
    );
  });

  const resumo = (() => {
    const totalLitros = list.reduce((s: number, r: any) => s + parseFloat(r.litros || "0"), 0);
    const totalValor = list.reduce((s: number, r: any) => s + parseFloat(r.valor_total || "0"), 0);
    const totalDesc = list.reduce((s: number, r: any) => s + parseFloat(r.desconto || "0"), 0);
    const veiculosSet = new Set(list.map((r: any) => r.vehicle_id));
    const motoristasSet = new Set(list.filter((r: any) => r.motorista).map((r: any) => r.motorista));
    return { totalLitros, totalValor, totalDesc, veiculos: veiculosSet.size, motoristas: motoristasSet.size, registros: list.length };
  })();

  const byVehicle = (() => {
    const map: Record<string, { placa: string; litros: number; valor: number; count: number }> = {};
    list.forEach((r: any) => {
      const key = r.vehicle_id;
      if (!map[key]) map[key] = { placa: r.placa || r.modelo || "—", litros: 0, valor: 0, count: 0 };
      map[key].litros += parseFloat(r.litros || "0");
      map[key].valor += parseFloat(r.valor_total || "0");
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.valor - a.valor);
  })();

  const byDriver = (() => {
    const map: Record<string, { litros: number; valor: number; count: number }> = {};
    list.forEach((r: any) => {
      const key = r.motorista || "Não informado";
      if (!map[key]) map[key] = { litros: 0, valor: 0, count: 0 };
      map[key].litros += parseFloat(r.litros || "0");
      map[key].valor += parseFloat(r.valor_total || "0");
      map[key].count++;
    });
    return Object.entries(map).sort((a, b) => b[1].valor - a[1].valor);
  })();

  function formatMonth(ym: string) {
    const [y, m] = ym.split('-');
    return `${MESES[parseInt(m) - 1]} ${y}`;
  }

  return (
    <DashboardLayout>
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Fuel className="h-6 w-6 text-amber-600" /> Combustível
          </h1>
          <div className="flex gap-2">
            <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={handleCsv} />
            <input type="file" accept=".pdf" ref={pdfRef} className="hidden" onChange={handlePdf} />
            <Button variant="outline" onClick={() => pdfRef.current?.click()} disabled={importPdfMut.isPending || pdfProgress !== null}>
              <FileText className="h-4 w-4 mr-1" />
              {pdfProgress !== null ? "Processando..." : "Importar PDF Posto"}
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importCsvMut.isPending}>
              <Upload className="h-4 w-4 mr-1" /> Importar CSV
            </Button>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Abastecimento</Button>
          </div>
        </div>

        {pdfProgress !== null && (
          <div className="bg-card border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{pdfProgressLabel}</span>
              <span className="font-bold text-primary">{pdfProgress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${pdfProgress}%`,
                  background: pdfProgress === 100
                    ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                    : 'linear-gradient(90deg, #3b82f6, #6366f1)',
                }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar placa, posto, motorista..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os meses</SelectItem>
              {availableMonths.map(m => (
                <SelectItem key={m} value={m}>{formatMonth(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterVehicle} onValueChange={setFilterVehicle}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Veículo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os veículos</SelectItem>
              {(vehicles.data || []).map((v: any) => (
                <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo} - {v.marca}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {list.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{resumo.registros}</p>
                <p className="text-xs text-amber-600">Abastecimentos</p>
              </CardContent>
            </Card>
            <Card className="bg-green-50 dark:bg-green-950 border-green-200">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-green-700">{fmt(resumo.totalValor)}</p>
                <p className="text-xs text-green-600">Valor Total</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-blue-700">{resumo.totalLitros.toFixed(1)}L</p>
                <p className="text-xs text-blue-600">Litros Total</p>
              </CardContent>
            </Card>
            <Card className="bg-cyan-50 dark:bg-cyan-950 border-cyan-200">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-cyan-700">{resumo.veiculos}</p>
                <p className="text-xs text-cyan-600">Veículos</p>
              </CardContent>
            </Card>
            <Card className="bg-purple-50 dark:bg-purple-950 border-purple-200">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-purple-700">{resumo.motoristas}</p>
                <p className="text-xs text-purple-600">Motoristas</p>
              </CardContent>
            </Card>
          </div>
        )}

        {list.length > 0 && (byVehicle.length > 1 || byDriver.length > 1) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {byVehicle.length > 1 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-sm mb-2">Consumo por Veículo</h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {byVehicle.map((v, i) => (
                      <div key={i} className="flex justify-between items-center text-sm border-b pb-1">
                        <span className="font-mono text-xs">{v.placa}</span>
                        <span className="text-muted-foreground">{v.litros.toFixed(1)}L</span>
                        <span className="font-medium">{fmt(v.valor)}</span>
                        <Badge variant="outline" className="text-xs">{v.count}x</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {byDriver.length > 1 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-sm mb-2">Consumo por Motorista</h3>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {byDriver.map(([name, d], i) => (
                      <div key={i} className="flex justify-between items-center text-sm border-b pb-1">
                        <span className="truncate max-w-[140px] text-xs">{name}</span>
                        <span className="text-muted-foreground">{d.litros.toFixed(1)}L</span>
                        <span className="font-medium">{fmt(d.valor)}</span>
                        <Badge variant="outline" className="text-xs">{d.count}x</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {fuel.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-amber-600 border-t-transparent rounded-full" />
          </div>
        ) : list.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum abastecimento registrado</CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Data</th>
                  <th className="text-left p-3">Veículo</th>
                  <th className="text-left p-3">Combustível</th>
                  <th className="text-right p-3">Litros</th>
                  <th className="text-right p-3">R$/L</th>
                  <th className="text-right p-3">Total</th>
                  <th className="text-right p-3">KM</th>
                  <th className="text-left p-3">Motorista</th>
                  <th className="text-left p-3">Posto</th>
                  <th className="text-right p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r: any) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 whitespace-nowrap">{r.data ? r.data.split('-').reverse().join('/') : "—"}</td>
                    <td className="p-3 font-mono">{r.placa || "—"}</td>
                    <td className="p-3"><Badge variant="outline">{r.tipo_combustivel}</Badge></td>
                    <td className="p-3 text-right">{parseFloat(r.litros || 0).toFixed(2)}</td>
                    <td className="p-3 text-right">{r.preco_litro ? `R$ ${parseFloat(r.preco_litro).toFixed(3)}` : "—"}</td>
                    <td className="p-3 text-right font-medium">{fmt(r.valor_total)}</td>
                    <td className="p-3 text-right">{r.km_atual ? parseFloat(r.km_atual).toLocaleString("pt-BR") : "—"}</td>
                    <td className="p-3 text-xs max-w-[150px] truncate">{r.motorista || "—"}</td>
                    <td className="p-3 text-xs">{r.posto || "—"}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("Excluir?")) deleteMut.mutate({ id: r.id, companyId: cId }); }}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar Abastecimento" : "Novo Abastecimento"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Veículo *</Label>
                <Select value={form.vehicleId ? String(form.vehicleId) : ""} onValueChange={v => setForm({ ...form, vehicleId: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(vehicles.data || []).map((v: any) => (
                      <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo} - {v.marca}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Data *</Label><Input type="date" value={form.data || ""} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
              <div>
                <Label>Tipo Combustível</Label>
                <Select value={form.tipoCombustivel || "Diesel"} onValueChange={v => setForm({ ...form, tipoCombustivel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COMBUSTIVEIS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Litros *</Label><Input type="number" step="0.01" value={form.litros || ""} onChange={e => setForm({ ...form, litros: e.target.value })} /></div>
              <div><Label>Valor por Litro (R$)</Label><Input type="number" step="0.001" value={form.precoLitro || ""} onChange={e => setForm({ ...form, precoLitro: e.target.value })} /></div>
              <div><Label>Valor Total (R$)</Label><Input type="number" step="0.01" value={form.valorTotal || ""} onChange={e => setForm({ ...form, valorTotal: e.target.value })} /></div>
              <div><Label>KM Atual</Label><Input type="number" value={form.kmAtual || ""} onChange={e => setForm({ ...form, kmAtual: e.target.value })} /></div>
              <div><Label>Posto</Label><Input value={form.posto || ""} onChange={e => setForm({ ...form, posto: e.target.value })} /></div>
              <div><Label>Motorista</Label><Input value={form.motorista || ""} onChange={e => setForm({ ...form, motorista: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Observações</Label><Textarea value={form.observacoes || ""} onChange={e => setForm({ ...form, observacoes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent className="w-screen h-screen max-w-none m-0 rounded-none flex flex-col">
            <DialogHeader className="flex-shrink-0 flex flex-row items-center justify-between border-b pb-4">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Resultado da Importação PDF
              </DialogTitle>
              <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Fechar</Button>
            </DialogHeader>
            {importResult && (
              <div className="flex-1 overflow-y-auto space-y-6 py-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl">
                  <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950 rounded-xl border border-green-200">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold text-green-700">{importResult.inserted}</p>
                      <p className="text-xs text-green-600">Importados</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-950 rounded-xl border border-amber-200">
                    <AlertTriangle className="h-8 w-8 text-amber-600" />
                    <div>
                      <p className="text-2xl font-bold text-amber-700">{importResult.duplicates}</p>
                      <p className="text-xs text-amber-600">Duplicados (ignorados)</p>
                    </div>
                  </div>
                  {importResult.noVehicle > 0 && (
                    <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950 rounded-xl border border-red-200">
                      <XCircle className="h-8 w-8 text-red-600" />
                      <div>
                        <p className="text-2xl font-bold text-red-700">{importResult.noVehicle}</p>
                        <p className="text-xs text-red-600">Sem veículo</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-xl border border-blue-200">
                    <FileText className="h-8 w-8 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold text-blue-700">{importResult.totalParsed}</p>
                      <p className="text-xs text-blue-600">Total no PDF</p>
                    </div>
                  </div>
                </div>

                {importResult.totalParsed === 0 && importResult.inserted === 0 && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 max-w-3xl">
                    <p className="font-medium mb-1">Nenhum registro encontrado no PDF</p>
                    <p className="text-xs">Verifique se o PDF é do sistema do posto de combustível (Posto Gestor) e contém as placas cadastradas no sistema.</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl">
                  {importResult.matchedDrivers?.length > 0 && (
                    <div className="border rounded-xl overflow-hidden">
                      <div className="bg-green-50 dark:bg-green-950 px-4 py-2.5 border-b border-green-200">
                        <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4" />
                          Motoristas vinculados a funcionários ({importResult.matchedDrivers.length})
                        </p>
                      </div>
                      <div className="divide-y max-h-[300px] overflow-y-auto">
                        {importResult.matchedDrivers.map((m: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/30">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                            <span>{m}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {importResult.unmatchedDrivers?.length > 0 && (
                    <div className="border rounded-xl overflow-hidden">
                      <div className="bg-amber-50 dark:bg-amber-950 px-4 py-2.5 border-b border-amber-200">
                        <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Motoristas não encontrados no cadastro ({importResult.unmatchedDrivers.length})
                        </p>
                      </div>
                      <div className="divide-y max-h-[300px] overflow-y-auto">
                        {importResult.unmatchedDrivers.map((d: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted/30">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                            <span>{d}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
