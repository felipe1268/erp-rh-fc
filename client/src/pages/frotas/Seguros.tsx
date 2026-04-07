import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Shield, Plus, Pencil, Trash2, Upload, Loader2, FileText, CheckCircle2, XCircle, AlertTriangle, Eye, Download } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

function fmt(v: any) {
  return parseFloat(v || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return d.split("-").reverse().join("/");
}

export default function Seguros() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [detailOpen, setDetailOpen] = useState<any>(null);

  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResults, setUploadResults] = useState<any[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const vehicles = trpc.frotas.listVehicles.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const ins = trpc.frotas.listInsurance.useQuery(
    { companyId: cId, vehicleId: filterVehicle !== "all" ? parseInt(filterVehicle) : undefined },
    { enabled: cId > 0 },
  );
  const createMut = trpc.frotas.createInsurance.useMutation({
    onSuccess: () => { ins.refetch(); setDialogOpen(false); toast.success("Seguro registrado"); },
  });
  const updateMut = trpc.frotas.updateInsurance.useMutation({
    onSuccess: () => { ins.refetch(); setDialogOpen(false); toast.success("Seguro atualizado"); },
  });
  const deleteMut = trpc.frotas.deleteInsurance.useMutation({
    onSuccess: () => { ins.refetch(); toast.success("Seguro excluído"); },
  });
  const uploadMut = trpc.frotas.uploadApolicesPdf.useMutation({
    onSuccess: (data) => {
      setUploadResults(data.results);
      setUploading(false);
      setUploadProgress(100);
      ins.refetch();
      toast.success(`${data.totalSuccess} de ${data.totalProcessed} apólice(s) processada(s) com sucesso`);
    },
    onError: (err) => {
      setUploading(false);
      toast.error(err.message);
    },
  });

  function openNew() {
    setEditing(null);
    setForm({ status: "ativa" });
    setDialogOpen(true);
  }

  function openEdit(r: any) {
    setEditing(r);
    setForm({
      vehicleId: r.vehicle_id, seguradora: r.seguradora, numeroApolice: r.numero_apolice,
      tipoCobertura: r.tipo_cobertura, valorPremio: r.valor_premio,
      franquia: r.franquia, dataInicio: r.data_inicio, dataFim: r.data_fim,
      status: r.status, corretor: r.corretor, observacoes: r.observacoes,
    });
    setDialogOpen(true);
  }

  function save() {
    if (!form.vehicleId || !form.seguradora || (!editing && (!form.dataInicio || !form.dataFim))) {
      toast.error("Preencha veículo, seguradora e período de vigência");
      return;
    }
    const payload = { ...form, companyId: cId, criadoPor: user?.name };
    if (editing) updateMut.mutate({ id: editing.id, ...payload });
    else createMut.mutate(payload);
  }

  const handleFilesSelected = useCallback((files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) {
      toast.error("Selecione apenas arquivos PDF");
      return;
    }
    if (pdfFiles.length > 20) {
      toast.error("Máximo de 20 arquivos por vez");
      return;
    }
    setUploadFiles(pdfFiles);
    setUploadResults(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  }, [handleFilesSelected]);

  async function processUpload() {
    if (uploadFiles.length === 0) return;
    setUploading(true);
    setUploadProgress(10);
    setUploadResults(null);

    try {
      const filesData: { filename: string; base64: string }[] = [];
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        filesData.push({ filename: file.name, base64 });
        setUploadProgress(10 + Math.round((i + 1) / uploadFiles.length * 30));
      }

      setUploadProgress(45);
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => prev < 90 ? prev + 1 : prev);
      }, 800);
      uploadMut.mutate({
        companyId: cId,
        files: filesData,
        criadoPor: user?.name,
      }, {
        onSettled: () => clearInterval(progressInterval),
      });
    } catch (err: any) {
      setUploading(false);
      toast.error("Erro ao ler os arquivos: " + err.message);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const activeCount = (ins.data || []).filter((r: any) => r.status === "ativa" && r.data_fim >= today).length;
  const expiringSoon = (ins.data || []).filter((r: any) => {
    if (r.status !== "ativa" || !r.data_fim) return false;
    const diff = (new Date(r.data_fim).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  }).length;
  const expired = (ins.data || []).filter((r: any) => r.status === "ativa" && r.data_fim && r.data_fim < today).length;

  return (
    <DashboardLayout>
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-emerald-600" /> Seguros
          </h1>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Seguro</Button>
        </div>

        {(ins.data || []).length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Apólices Ativas</p>
                  <p className="text-xl font-bold text-emerald-700">{activeCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Vencem em 30 dias</p>
                  <p className="text-xl font-bold text-amber-700">{expiringSoon}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <XCircle className="h-5 w-5 text-red-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Vencidas</p>
                  <p className="text-xl font-bold text-red-700">{expired}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Select value={filterVehicle} onValueChange={setFilterVehicle}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Veículo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(vehicles.data || []).map((v: any) => (
                <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {ins.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        ) : (ins.data || []).length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum seguro registrado</CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3">Veículo</th>
                  <th className="text-left p-3">Seguradora</th>
                  <th className="text-left p-3">Apólice</th>
                  <th className="text-left p-3">Cobertura</th>
                  <th className="text-right p-3">Prêmio</th>
                  <th className="text-right p-3">Franquia</th>
                  <th className="text-left p-3">Vigência</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Corretor</th>
                  <th className="text-right p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(ins.data || []).map((r: any) => {
                  const vencido = r.data_fim && r.data_fim < today && r.status === "ativa";
                  const diasVencer = r.data_fim ? Math.ceil((new Date(r.data_fim).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                  const quaseVencendo = diasVencer !== null && diasVencer >= 0 && diasVencer <= 30;
                  return (
                    <tr key={r.id} className={`border-t hover:bg-muted/30 ${vencido ? "bg-red-50/50" : quaseVencendo ? "bg-amber-50/50" : ""}`}>
                      <td className="p-3 font-mono">{r.placa || r.modelo || "—"}</td>
                      <td className="p-3">{r.seguradora}</td>
                      <td className="p-3">{r.numero_apolice || "—"}</td>
                      <td className="p-3 max-w-[150px] truncate">{r.tipo_cobertura || "—"}</td>
                      <td className="p-3 text-right">{fmt(r.valor_premio)}</td>
                      <td className="p-3 text-right">{fmt(r.franquia)}</td>
                      <td className="p-3 text-xs">
                        {fmtDate(r.data_inicio)} a {fmtDate(r.data_fim)}
                        {quaseVencendo && !vencido && (
                          <span className="ml-1 text-amber-600 font-medium">({diasVencer}d)</span>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant={r.status === "ativa" ? (vencido ? "destructive" : "default") : "secondary"}>
                          {vencido ? "Vencida" : r.status}
                        </Badge>
                      </td>
                      <td className="p-3">{r.corretor || "—"}</td>
                      <td className="p-3 text-right space-x-0.5">
                        {(r.ia_analisada || r.coberturas) && (
                          <Button variant="ghost" size="icon" onClick={() => setDetailOpen(r)} title="Ver detalhes">
                            <Eye className="h-4 w-4 text-purple-500" />
                          </Button>
                        )}
                        {r.apolice_url && (
                          <Button variant="ghost" size="icon" asChild title="Baixar apólice">
                            <a href={r.apolice_url} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4 text-blue-500" />
                            </a>
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm("Excluir?")) deleteMut.mutate({ id: r.id, companyId: cId }); }}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Card className="border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Upload className="h-4 w-4 text-blue-600" /> Upload de Apólices em Lote (PDF)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Faça upload dos PDFs das apólices de seguro. A IA extrai automaticamente: seguradora, veículo/placa, coberturas, franquias, valor do prêmio, vigência e corretor. As apólices ficam salvas no sistema para consulta rápida.
            </p>

            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
              />
              <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">
                Arraste e solte os PDFs aqui ou clique para selecionar
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Até 20 arquivos PDF por vez
              </p>
            </div>

            {uploadFiles.length > 0 && !uploading && !uploadResults && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{uploadFiles.length} arquivo(s) selecionado(s):</p>
                  <Button variant="ghost" size="sm" onClick={() => { setUploadFiles([]); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                    Limpar
                  </Button>
                </div>
                <div className="max-h-[120px] overflow-y-auto space-y-1">
                  {uploadFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 rounded px-3 py-1.5">
                      <FileText className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <span className="text-gray-400 ml-auto">{(f.size / 1024).toFixed(0)} KB</span>
                    </div>
                  ))}
                </div>
                <Button
                  onClick={processUpload}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={uploading}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Processar {uploadFiles.length} Apólice(s) com IA
                </Button>
              </div>
            )}

            {uploading && (
              <div className="space-y-3 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                    <span className="text-sm font-medium">Processando apólices com IA...</span>
                  </div>
                  <span className="text-sm font-bold text-blue-700">{Math.round(uploadProgress)}%</span>
                </div>
                <div className="relative">
                  <Progress value={uploadProgress} className="h-3" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Extraindo dados de {uploadFiles.length} arquivo(s). Isso pode levar alguns minutos.
                </p>
              </div>
            )}

            {uploadResults && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Resultado do Processamento</h4>
                  <Button variant="ghost" size="sm" onClick={() => { setUploadResults(null); setUploadFiles([]); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                    Novo Upload
                  </Button>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {uploadResults.map((r: any, i: number) => (
                    <div key={i} className={`rounded-lg border p-3 ${r.success ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}`}>
                      <div className="flex items-start gap-2">
                        {r.success ? <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" /> : <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{r.filename}</p>
                          {r.success && r.extracted ? (
                            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                              <p><span className="text-gray-500">Seguradora:</span> {r.extracted.seguradora || "—"}</p>
                              <p><span className="text-gray-500">Placa:</span> <span className="font-mono">{r.extracted.placa || "—"}</span></p>
                              <p><span className="text-gray-500">Veículo:</span> {r.extracted.veiculo || "—"}</p>
                              <p><span className="text-gray-500">Apólice:</span> {r.extracted.numeroApolice || "—"}</p>
                              <p><span className="text-gray-500">Prêmio:</span> {r.extracted.valorPremio ? fmt(r.extracted.valorPremio) : "—"}</p>
                              <p><span className="text-gray-500">Franquia:</span> {r.extracted.franquia ? fmt(r.extracted.franquia) : "—"}</p>
                              <p><span className="text-gray-500">Vigência:</span> {fmtDate(r.extracted.dataInicio)} a {fmtDate(r.extracted.dataFim)}</p>
                              <p><span className="text-gray-500">Corretor:</span> {r.extracted.corretor || "—"}</p>
                              {r.extracted.coberturas && Array.isArray(r.extracted.coberturas) && r.extracted.coberturas.length > 0 && (
                                <div className="col-span-2 mt-1">
                                  <p className="text-gray-500 mb-0.5">Coberturas:</p>
                                  <ul className="list-disc list-inside space-y-0.5 text-gray-700">
                                    {r.extracted.coberturas.slice(0, 6).map((c: string, ci: number) => (
                                      <li key={ci} className="truncate">{c}</li>
                                    ))}
                                    {r.extracted.coberturas.length > 6 && <li className="text-gray-400">+{r.extracted.coberturas.length - 6} mais...</li>}
                                  </ul>
                                </div>
                              )}
                              {r.vehicleMatched ? (
                                <p className="col-span-2 mt-1 text-green-700">
                                  <CheckCircle2 className="h-3 w-3 inline mr-1" />
                                  Vinculado ao veículo: {r.vehicleMatched.placa} ({r.vehicleMatched.modelo})
                                </p>
                              ) : (
                                <p className="col-span-2 mt-1 text-amber-600">
                                  <AlertTriangle className="h-3 w-3 inline mr-1" />
                                  Veículo não encontrado na frota — vincule manualmente
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-red-600 mt-1">{r.error || "Erro ao processar"}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar Seguro" : "Novo Seguro"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Veículo *</Label>
                <Select value={form.vehicleId ? String(form.vehicleId) : ""} onValueChange={v => setForm({ ...form, vehicleId: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(vehicles.data || []).map((v: any) => (
                      <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Seguradora *</Label><Input value={form.seguradora || ""} onChange={e => setForm({ ...form, seguradora: e.target.value })} /></div>
              <div><Label>Nº Apólice</Label><Input value={form.numeroApolice || ""} onChange={e => setForm({ ...form, numeroApolice: e.target.value })} /></div>
              <div><Label>Tipo de Cobertura</Label><Input value={form.tipoCobertura || ""} onChange={e => setForm({ ...form, tipoCobertura: e.target.value })} placeholder="Ex: Compreensivo, Terceiros..." /></div>
              <div><Label>Valor do Prêmio (R$)</Label><MoneyInput value={form.valorPremio} onChange={v => setForm({ ...form, valorPremio: v })} /></div>
              <div><Label>Valor da Franquia (R$)</Label><MoneyInput value={form.franquia} onChange={v => setForm({ ...form, franquia: v })} /></div>
              <div><Label>Data Início</Label><Input type="date" value={form.dataInicio || ""} onChange={e => setForm({ ...form, dataInicio: e.target.value })} /></div>
              <div><Label>Data Fim</Label><Input type="date" value={form.dataFim || ""} onChange={e => setForm({ ...form, dataFim: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status || "ativa"} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativa">Ativa</SelectItem>
                    <SelectItem value="vencida">Vencida</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2"><Label>Corretor</Label><Input value={form.corretor || ""} onChange={e => setForm({ ...form, corretor: e.target.value })} /></div>
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

        <Dialog open={!!detailOpen} onOpenChange={() => setDetailOpen(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-600" />
                Detalhes do Seguro — {detailOpen?.placa || detailOpen?.modelo || ""}
              </DialogTitle>
            </DialogHeader>
            {detailOpen && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3">
                  <p><span className="text-gray-500">Seguradora:</span> <strong>{detailOpen.seguradora}</strong></p>
                  <p><span className="text-gray-500">Apólice:</span> {detailOpen.numero_apolice || "—"}</p>
                  <p><span className="text-gray-500">Prêmio:</span> {fmt(detailOpen.valor_premio)}</p>
                  <p><span className="text-gray-500">Franquia:</span> {fmt(detailOpen.franquia)}</p>
                  <p><span className="text-gray-500">Vigência:</span> {fmtDate(detailOpen.data_inicio)} a {fmtDate(detailOpen.data_fim)}</p>
                  <p><span className="text-gray-500">Corretor:</span> {detailOpen.corretor || "—"}</p>
                  {detailOpen.apolice_arquivo_nome && (
                    <p className="col-span-2"><span className="text-gray-500">Arquivo:</span> {detailOpen.apolice_arquivo_nome}</p>
                  )}
                </div>

                {detailOpen.coberturas && (
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-1">Coberturas</h4>
                    <div className="bg-blue-50 rounded p-3 text-xs whitespace-pre-wrap">{detailOpen.coberturas}</div>
                  </div>
                )}

                {detailOpen.ia_analisada && (
                  <>
                    {detailOpen.ia_resumo && (
                      <div>
                        <h4 className="font-semibold text-gray-700 mb-1">Resumo da IA</h4>
                        <div className="bg-purple-50 rounded p-3 text-xs">{detailOpen.ia_resumo}</div>
                      </div>
                    )}
                    {detailOpen.ia_coberturas_detalhadas && (() => {
                      try { const arr = JSON.parse(detailOpen.ia_coberturas_detalhadas); return (
                        <div>
                          <h4 className="font-semibold text-gray-700 mb-1">Coberturas Detalhadas</h4>
                          <ul className="list-disc list-inside text-xs space-y-0.5 bg-blue-50 rounded p-3">
                            {arr.map((c: string, i: number) => <li key={i}>{c}</li>)}
                          </ul>
                        </div>
                      ); } catch { return null; }
                    })()}
                    {detailOpen.ia_alertas_risco && (() => {
                      try { const arr = JSON.parse(detailOpen.ia_alertas_risco); return (
                        <div>
                          <h4 className="font-semibold text-amber-700 mb-1">Alertas de Risco</h4>
                          <ul className="list-disc list-inside text-xs space-y-0.5 bg-amber-50 rounded p-3">
                            {arr.map((a: string, i: number) => <li key={i}>{a}</li>)}
                          </ul>
                        </div>
                      ); } catch { return null; }
                    })()}
                    {detailOpen.ia_regras_importantes && (() => {
                      try { const arr = JSON.parse(detailOpen.ia_regras_importantes); return (
                        <div>
                          <h4 className="font-semibold text-red-700 mb-1">Regras Importantes</h4>
                          <ul className="list-disc list-inside text-xs space-y-0.5 bg-red-50 rounded p-3">
                            {arr.map((r: string, i: number) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      ); } catch { return null; }
                    })()}
                    {detailOpen.ia_exclusoes && (() => {
                      try { const arr = JSON.parse(detailOpen.ia_exclusoes); return (
                        <div>
                          <h4 className="font-semibold text-gray-700 mb-1">Exclusões</h4>
                          <ul className="list-disc list-inside text-xs space-y-0.5 bg-gray-50 rounded p-3">
                            {arr.map((e: string, i: number) => <li key={i}>{e}</li>)}
                          </ul>
                        </div>
                      ); } catch { return null; }
                    })()}
                    {detailOpen.ia_limites_indenizacao && (() => {
                      try { const arr = JSON.parse(detailOpen.ia_limites_indenizacao); return (
                        <div>
                          <h4 className="font-semibold text-gray-700 mb-1">Limites de Indenização / Franquias</h4>
                          <ul className="list-disc list-inside text-xs space-y-0.5 bg-gray-50 rounded p-3">
                            {arr.map((l: string, i: number) => <li key={i}>{l}</li>)}
                          </ul>
                        </div>
                      ); } catch { return null; }
                    })()}
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
