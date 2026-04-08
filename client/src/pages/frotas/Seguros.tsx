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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Shield, Plus, Pencil, Trash2, Upload, Loader2, FileText, CheckCircle2, XCircle, AlertTriangle, Eye, Download, Car, ShieldAlert, ShieldCheck, ShieldX, ChevronDown, ChevronUp, Info } from "lucide-react";
import { useState, useRef, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

function fmt(v: any) {
  return parseFloat(v || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const s = d.includes("T") ? d.split("T")[0] : d;
  return s.split("-").reverse().join("/");
}

function parseJsonSafe(v: any): string[] {
  if (!v) return [];
  try { const arr = JSON.parse(v); return Array.isArray(arr) ? arr : []; } catch { return []; }
}

export default function Seguros() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [detailOpen, setDetailOpen] = useState<any>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

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
    onSuccess: () => { ins.refetch(); setDeleteConfirmId(null); toast.success("Seguro excluído"); },
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
      franquia: r.franquia, dataInicio: r.data_inicio ? (r.data_inicio.includes("T") ? r.data_inicio.split("T")[0] : r.data_inicio) : "",
      dataFim: r.data_fim ? (r.data_fim.includes("T") ? r.data_fim.split("T")[0] : r.data_fim) : "",
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

  const allIns = ins.data || [];
  const filteredIns = useMemo(() => {
    let list = allIns;
    if (filterStatus === "ativa") list = list.filter((r: any) => r.status === "ativa" && (!r.data_fim || (r.data_fim.includes("T") ? r.data_fim.split("T")[0] : r.data_fim) >= today));
    if (filterStatus === "vencendo") list = list.filter((r: any) => {
      const df = r.data_fim ? (r.data_fim.includes("T") ? r.data_fim.split("T")[0] : r.data_fim) : null;
      if (!df || r.status !== "ativa") return false;
      const diff = (new Date(df).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 30;
    });
    if (filterStatus === "vencida") list = list.filter((r: any) => {
      const df = r.data_fim ? (r.data_fim.includes("T") ? r.data_fim.split("T")[0] : r.data_fim) : null;
      return r.status === "ativa" && df && df < today;
    });
    return list;
  }, [allIns, filterStatus, today]);

  const activeCount = allIns.filter((r: any) => r.status === "ativa" && (!r.data_fim || (r.data_fim.includes("T") ? r.data_fim.split("T")[0] : r.data_fim) >= today)).length;
  const expiringSoon = allIns.filter((r: any) => {
    const df = r.data_fim ? (r.data_fim.includes("T") ? r.data_fim.split("T")[0] : r.data_fim) : null;
    if (r.status !== "ativa" || !df) return false;
    const diff = (new Date(df).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  }).length;
  const expired = allIns.filter((r: any) => {
    const df = r.data_fim ? (r.data_fim.includes("T") ? r.data_fim.split("T")[0] : r.data_fim) : null;
    return r.status === "ativa" && df && df < today;
  }).length;

  const vehicleList = vehicles.data || [];
  const insuredVehicleIds = new Set(allIns.filter((r: any) => r.status === "ativa").map((r: any) => r.vehicle_id));
  const vehiclesWithInsurance = vehicleList.filter((v: any) => insuredVehicleIds.has(v.id));
  const vehiclesWithoutInsurance = vehicleList.filter((v: any) => !insuredVehicleIds.has(v.id) && v.statusVeiculo === 'Ativo');

  const totalPremio = allIns.filter((r: any) => r.status === "ativa").reduce((s: number, r: any) => s + parseFloat(r.valor_premio || "0"), 0);

  function toggleExpand(id: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function getDataFim(r: any) {
    return r.data_fim ? (r.data_fim.includes("T") ? r.data_fim.split("T")[0] : r.data_fim) : null;
  }

  return (
    <DashboardLayout>
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-emerald-600" /> Seguros da Frota
          </h1>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Seguro</Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Card className="border-emerald-200 bg-emerald-50/50 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilterStatus(filterStatus === "ativa" ? "all" : "ativa")}>
            <CardContent className="py-2.5 px-3 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">Ativas</p>
                <p className="text-lg font-bold text-emerald-700">{activeCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/50 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilterStatus(filterStatus === "vencendo" ? "all" : "vencendo")}>
            <CardContent className="py-2.5 px-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">Vencem 30d</p>
                <p className="text-lg font-bold text-amber-700">{expiringSoon}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50/50 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilterStatus(filterStatus === "vencida" ? "all" : "vencida")}>
            <CardContent className="py-2.5 px-3 flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">Vencidas</p>
                <p className="text-lg font-bold text-red-700">{expired}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="py-2.5 px-3 flex items-center gap-2">
              <Car className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">Sem Seguro</p>
                <p className="text-lg font-bold text-blue-700">{vehiclesWithoutInsurance.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-slate-50/50">
            <CardContent className="py-2.5 px-3 flex items-center gap-2">
              <Shield className="h-5 w-5 text-slate-600" />
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">Custo Total/Ano</p>
                <p className="text-sm font-bold text-slate-700">{fmt(totalPremio)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {vehiclesWithoutInsurance.length > 0 && (
          <Card className="border-red-300 bg-red-50/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldX className="h-4 w-4 text-red-600" />
                <h3 className="text-sm font-bold text-red-700">Veículos SEM Seguro ({vehiclesWithoutInsurance.length})</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {vehiclesWithoutInsurance.map((v: any) => (
                  <Badge key={v.id} variant="destructive" className="text-xs py-1 px-2.5 bg-red-100 text-red-800 border-red-300 hover:bg-red-200 cursor-default">
                    <Car className="h-3 w-3 mr-1" />
                    {v.placa || v.modelo} — {v.modelo}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <Select value={filterVehicle} onValueChange={setFilterVehicle}>
            <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="Veículo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os veículos</SelectItem>
              {vehicleList.map((v: any) => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.placa || v.modelo} {insuredVehicleIds.has(v.id) ? "✓" : "⚠"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filterStatus !== "all" && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilterStatus("all")}>
              Limpar filtro
            </Button>
          )}
        </div>

        {ins.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        ) : filteredIns.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            {allIns.length > 0 ? "Nenhum seguro encontrado com os filtros aplicados" : "Nenhum seguro registrado — faça upload das apólices em PDF abaixo"}
          </CardContent></Card>
        ) : (
          <div className="space-y-0">
            {filteredIns.map((r: any) => {
              const df = getDataFim(r);
              const vencido = df && df < today && r.status === "ativa";
              const diasVencer = df ? Math.ceil((new Date(df).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
              const quaseVencendo = diasVencer !== null && diasVencer >= 0 && diasVencer <= 30;
              const expanded = expandedRows.has(r.id);
              const exclusoes = parseJsonSafe(r.ia_exclusoes);
              const coberturas = parseJsonSafe(r.ia_coberturas_detalhadas);
              const alertas = parseJsonSafe(r.ia_alertas_risco);
              const limites = parseJsonSafe(r.ia_limites_indenizacao);

              return (
                <Card key={r.id} className={`mb-2 border ${vencido ? "border-red-300 bg-red-50/30" : quaseVencendo ? "border-amber-300 bg-amber-50/30" : "border-slate-200"}`}>
                  <CardContent className="p-0">
                    <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => toggleExpand(r.id)}>
                      <div className="flex-shrink-0 w-20">
                        <p className="font-mono font-bold text-sm">{r.placa || r.modelo || "—"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{r.modelo || ""}</p>
                      </div>

                      <div className="flex-shrink-0 w-32">
                        <p className="text-xs font-semibold">{r.seguradora}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{r.numero_apolice || "—"}</p>
                      </div>

                      <div className="flex-shrink-0 w-20 text-center">
                        <Badge className={`text-[10px] ${r.tipo_cobertura?.toLowerCase().includes('compreen') ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-blue-100 text-blue-700 border-blue-300"}`}>
                          {(r.tipo_cobertura || "—").length > 15 ? (r.tipo_cobertura || "—").slice(0, 15) + "…" : (r.tipo_cobertura || "—")}
                        </Badge>
                      </div>

                      <div className="flex-shrink-0 w-24 text-right">
                        <p className="text-xs font-bold text-slate-800">{fmt(r.valor_premio)}</p>
                        <p className="text-[10px] text-muted-foreground">prêmio</p>
                      </div>

                      <div className="flex-shrink-0 w-24 text-right">
                        <p className={`text-xs font-bold ${parseFloat(r.franquia || "0") > 5000 ? "text-red-600" : "text-slate-800"}`}>
                          {parseFloat(r.franquia || "0") > 0 ? fmt(r.franquia) : "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">franquia</p>
                      </div>

                      <div className="flex-shrink-0 w-28 text-center">
                        <p className="text-[10px] font-mono">{fmtDate(r.data_inicio)} a {fmtDate(r.data_fim)}</p>
                        {quaseVencendo && !vencido && (
                          <p className="text-[10px] text-amber-600 font-bold">⚠ {diasVencer}d restantes</p>
                        )}
                        {vencido && <p className="text-[10px] text-red-600 font-bold">VENCIDA</p>}
                      </div>

                      <div className="flex-shrink-0 w-14 text-center">
                        <Badge variant={r.status === "ativa" ? (vencido ? "destructive" : "default") : "secondary"} className="text-[10px]">
                          {vencido ? "Vencida" : r.status}
                        </Badge>
                      </div>

                      <div className="flex-1 flex items-center justify-end gap-0.5">
                        {exclusoes.length > 0 && (
                          <Badge variant="outline" className="text-[9px] border-red-300 text-red-600 gap-0.5">
                            <ShieldAlert className="h-3 w-3" /> {exclusoes.length} exclusões
                          </Badge>
                        )}
                        {r.apolice_url && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" asChild title="Baixar apólice" onClick={(e: any) => e.stopPropagation()}>
                            <a href={r.apolice_url} target="_blank" rel="noopener noreferrer">
                              <Download className="h-3.5 w-3.5 text-blue-500" />
                            </a>
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(r); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(r.id); }}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t bg-slate-50/50 p-4 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {coberturas.length > 0 && (
                            <div>
                              <h4 className="text-xs font-bold text-emerald-700 mb-1.5 flex items-center gap-1">
                                <ShieldCheck className="h-3.5 w-3.5" /> Coberturas Contratadas
                              </h4>
                              <ul className="space-y-0.5">
                                {coberturas.map((c: string, i: number) => (
                                  <li key={i} className="text-[11px] text-slate-700 flex items-start gap-1">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                                    <span>{c}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {exclusoes.length > 0 && (
                            <div>
                              <h4 className="text-xs font-bold text-red-700 mb-1.5 flex items-center gap-1">
                                <ShieldX className="h-3.5 w-3.5" /> O Que NÃO Cobre
                              </h4>
                              <ul className="space-y-0.5">
                                {exclusoes.map((e: string, i: number) => (
                                  <li key={i} className="text-[11px] text-red-700 flex items-start gap-1 bg-red-50 rounded px-1.5 py-0.5">
                                    <XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                                    <span className="font-medium">{e}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="space-y-2">
                            {alertas.length > 0 && (
                              <div>
                                <h4 className="text-xs font-bold text-amber-700 mb-1.5 flex items-center gap-1">
                                  <AlertTriangle className="h-3.5 w-3.5" /> Alertas
                                </h4>
                                <ul className="space-y-0.5">
                                  {alertas.map((a: string, i: number) => (
                                    <li key={i} className="text-[11px] text-amber-700 flex items-start gap-1">
                                      <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                                      <span>{a}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {limites.length > 0 && (
                              <div>
                                <h4 className="text-xs font-bold text-blue-700 mb-1.5 flex items-center gap-1">
                                  <Info className="h-3.5 w-3.5" /> Limites / Franquias
                                </h4>
                                <ul className="space-y-0.5">
                                  {limites.map((l: string, i: number) => (
                                    <li key={i} className="text-[11px] text-slate-700 flex items-start gap-1">
                                      <span className="text-blue-500 font-bold">•</span>
                                      <span>{l}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>

                        {r.ia_resumo && (
                          <div className="bg-purple-50 rounded-lg p-2.5 text-[11px] text-purple-800 border border-purple-200">
                            <span className="font-bold">Resumo: </span>{r.ia_resumo}
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>Corretor: {r.corretor || "—"}</span>
                          {r.apolice_arquivo_nome && <span>• Arquivo: {r.apolice_arquivo_nome}</span>}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
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
              Faça upload dos PDFs das apólices. A IA extrai automaticamente: seguradora, veículo/placa, coberturas, franquias, prêmio, vigência e corretor. Suporta qualquer seguradora (Zurich, Suhai, Yelum, HDI, Porto Seguro, etc.).
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
                <Progress value={uploadProgress} className="h-3" />
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
                    {vehicleList.map((v: any) => (
                      <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo} — {v.modelo}</SelectItem>
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

        <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Excluir seguro?</DialogTitle>
              <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
              <Button variant="destructive" disabled={deleteMut.isPending} onClick={() => {
                if (deleteConfirmId) deleteMut.mutate({ id: deleteConfirmId, companyId: cId });
              }}>Excluir</Button>
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
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
