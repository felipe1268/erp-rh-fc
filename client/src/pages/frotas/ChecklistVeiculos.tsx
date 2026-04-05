import { trpc } from "../../lib/trpc";
import { useCompany } from "../../contexts/CompanyContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  ClipboardCheck, Plus, Trash2, FileText, CheckCircle, XCircle, AlertCircle,
  ChevronDown, ChevronUp, Eye, Settings, Truck, Camera, ArrowLeft,
  Video, X, Image as ImageIcon, Loader2, Maximize2,
} from "lucide-react";
import { useState, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

function fmtDate(d: any) { if (!d) return "—"; return String(d).split("T")[0].split("-").reverse().join("/"); }

const CATEGORIAS_DEFAULT = [
  "Pneus", "Fluidos", "Iluminação", "Carroceria", "Interior", "Segurança", "Motor", "Freios", "Documentação",
];

type View = "checklists" | "templates" | "fill" | "detail";

export default function ChecklistVeiculos() {
  const { selectedCompany } = useCompany();
  const cId = selectedCompany?.id ?? 0;
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();

  const [view, setView] = useState<View>("checklists");
  const [filterVehicle, setFilterVehicle] = useState<string>("todos");
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  const [fillVehicleId, setFillVehicleId] = useState<number | null>(null);
  const [fillTemplateId, setFillTemplateId] = useState<number | null>(null);
  const [fillKm, setFillKm] = useState("");
  const [fillMotorista, setFillMotorista] = useState("");
  const [fillObs, setFillObs] = useState("");
  const [fillResponses, setFillResponses] = useState<{ templateItemId?: number; categoria: string; descricao: string; resposta: string; observacao: string; fotoUrl: string; midias: { url: string; tipo: string; preview?: string }[] }[]>([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [previewMedia, setPreviewMedia] = useState<{ url: string; tipo: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const [tplNome, setTplNome] = useState("");
  const [tplDescricao, setTplDescricao] = useState("");
  const [tplTipoVeiculo, setTplTipoVeiculo] = useState("");
  const [tplItems, setTplItems] = useState<{ categoria: string; descricao: string; fotoObrigatoria: boolean; ordem: number }[]>([]);
  const [tplNewCat, setTplNewCat] = useState("");
  const [tplNewDesc, setTplNewDesc] = useState("");
  const [tplNewFoto, setTplNewFoto] = useState(false);

  const { data: vehicles } = trpc.frotas.listVehicles.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const { data: checklists } = trpc.frotas.listChecklists.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const { data: templates } = trpc.frotas.listChecklistTemplates.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const { data: detail } = trpc.frotas.getChecklistDetail.useQuery({ companyId: cId, checklistId: detailId! }, { enabled: cId > 0 && !!detailId });
  const { data: selectedTemplate } = trpc.frotas.getChecklistTemplate.useQuery({ companyId: cId, templateId: fillTemplateId! }, { enabled: cId > 0 && !!fillTemplateId });

  const createChecklist = trpc.frotas.createChecklist.useMutation({
    onSuccess: () => { toast.success("Checklist salvo com sucesso!"); utils.frotas.listChecklists.invalidate(); setView("checklists"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteChecklist = trpc.frotas.deleteChecklist.useMutation({
    onSuccess: () => { toast.success("Checklist excluído"); utils.frotas.listChecklists.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const createTemplate = trpc.frotas.createChecklistTemplate.useMutation({
    onSuccess: () => { toast.success("Template criado!"); utils.frotas.listChecklistTemplates.invalidate(); setShowTemplateModal(false); resetTplForm(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteTemplate = trpc.frotas.deleteChecklistTemplate.useMutation({
    onSuccess: () => { toast.success("Template excluído"); utils.frotas.listChecklistTemplates.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const generateDefault = trpc.frotas.generateDefaultChecklistTemplate.useMutation({
    onSuccess: () => { toast.success("Template padrão gerado!"); utils.frotas.listChecklistTemplates.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const uploadMedia = trpc.frotas.uploadChecklistMedia.useMutation();

  const handleMediaCapture = useCallback(async (file: File, globalIdx: number) => {
    if (!file) return;
    const maxSize = file.type.startsWith('video') ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(file.type.startsWith('video') ? "Vídeo muito grande (máx 50MB)" : "Foto muito grande (máx 10MB)");
      return;
    }
    setUploadingIdx(globalIdx);
    try {
      const preview = file.type.startsWith('image') ? URL.createObjectURL(file) : undefined;
      const reader = new FileReader();
      const b64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const tipo = file.type.startsWith('video') ? 'video' : 'foto';
      const result = await uploadMedia.mutateAsync({
        companyId: cId,
        base64: b64,
        contentType: file.type,
        filename: file.name,
      });
      const copy = [...fillResponses];
      copy[globalIdx] = {
        ...copy[globalIdx],
        midias: [...copy[globalIdx].midias, { url: result.url, tipo, preview }],
      };
      setFillResponses(copy);
      toast.success(tipo === 'video' ? "Vídeo anexado!" : "Foto anexada!");
    } catch (e: any) {
      toast.error("Erro ao enviar: " + (e.message || "tente novamente"));
    } finally {
      setUploadingIdx(null);
    }
  }, [fillResponses, cId, uploadMedia]);

  function removeMedia(globalIdx: number, mediaIdx: number) {
    const copy = [...fillResponses];
    const newMidias = [...copy[globalIdx].midias];
    if (newMidias[mediaIdx]?.preview) URL.revokeObjectURL(newMidias[mediaIdx].preview!);
    newMidias.splice(mediaIdx, 1);
    copy[globalIdx] = { ...copy[globalIdx], midias: newMidias };
    setFillResponses(copy);
  }

  function resetTplForm() {
    setTplNome(""); setTplDescricao(""); setTplTipoVeiculo(""); setTplItems([]); setTplNewCat(""); setTplNewDesc("");
  }

  function startFillChecklist(templateId: number) {
    setFillTemplateId(templateId);
    setFillVehicleId(null);
    setFillKm(""); setFillMotorista(""); setFillObs("");
    setFillResponses([]);
    setView("fill");
  }

  const filteredChecklists = useMemo(() => {
    if (!checklists) return [];
    if (filterVehicle === "todos") return checklists;
    return (checklists as any[]).filter((c: any) => String(c.vehicle_id) === filterVehicle);
  }, [checklists, filterVehicle]);

  function handleSaveChecklist() {
    if (!fillVehicleId) return toast.error("Selecione o veículo");
    if (fillResponses.length === 0) return toast.error("Preencha ao menos um item");
    createChecklist.mutate({
      companyId: cId,
      vehicleId: fillVehicleId,
      templateId: fillTemplateId || undefined,
      motoristaNome: fillMotorista || undefined,
      dataChecklist: new Date().toISOString().split("T")[0],
      kmAtual: fillKm ? Number(fillKm) : undefined,
      observacoes: fillObs || undefined,
      responses: fillResponses.map(r => ({
        templateItemId: r.templateItemId,
        categoria: r.categoria,
        descricao: r.descricao,
        resposta: r.resposta,
        observacao: r.observacao || undefined,
        fotoUrl: r.fotoUrl || r.midias.find(m => m.tipo === 'foto')?.url || undefined,
        midiasUrls: r.midias.map(m => ({ url: m.url, tipo: m.tipo })),
      })),
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2c5282] text-white p-6 rounded-b-2xl shadow-lg">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => navigate("/frotas")} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors" title="Voltar">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="p-2 rounded-xl bg-white/10"><ClipboardCheck className="h-6 w-6" /></div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Checklist de Veículos</h1>
              <p className="text-cyan-100 text-sm">Inspeções periódicas com registro de km, fotos e vídeos</p>
            </div>
          </div>
          <div className="flex gap-1">
            {(["checklists", "templates"] as const).map(v => (
              <button key={v} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === v ? "bg-white text-[#1e3a5f] shadow-md" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
                onClick={() => setView(v)}>
                {v === "checklists" ? "Checklists Realizados" : "Templates"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-4">

        {view === "checklists" && (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Select value={filterVehicle} onValueChange={setFilterVehicle}>
                <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="Todos os veículos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os veículos</SelectItem>
                  {(vehicles || []).map((v: any) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.placa} — {v.modelo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                {templates && (templates as any[]).length > 0 && (
                  <Select onValueChange={(v) => startFillChecklist(Number(v))}>
                    <SelectTrigger className="h-8 text-xs w-[200px]"><SelectValue placeholder="Preencher checklist..." /></SelectTrigger>
                    <SelectContent>
                      {(templates as any[]).map((t: any) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {(filteredChecklists as any[]).map((c: any) => (
                <Card key={c.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${Number(c.score_geral) >= 80 ? "bg-gradient-to-br from-green-500 to-green-600" : Number(c.score_geral) >= 50 ? "bg-gradient-to-br from-amber-400 to-amber-500" : "bg-gradient-to-br from-red-500 to-red-600"}`}>
                        {Number(c.score_geral || 0).toFixed(0)}%
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-800 dark:text-white">{c.placa}</p>
                          <span className="text-xs text-slate-400">{c.marca} {c.modelo}</span>
                          {c.template_nome && <Badge variant="outline" className="text-[9px]">{c.template_nome}</Badge>}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{fmtDate(c.data_checklist)} • Motorista: {c.motorista_nome || "—"} • KM: {c.km_atual ? Number(c.km_atual).toLocaleString("pt-BR") : "—"}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-green-500" />
                            <span className="text-[10px] text-green-700">{c.ok_count}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <XCircle className="h-3 w-3 text-red-500" />
                            <span className="text-[10px] text-red-700">{(c.total_count || 0) - (c.ok_count || 0)}</span>
                          </div>
                          <span className="text-[10px] text-slate-400">de {c.total_count} itens</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setDetailId(c.id); setView("detail"); }}>
                          <Eye className="h-3.5 w-3.5 text-blue-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (confirm("Excluir este checklist?")) deleteChecklist.mutate({ companyId: cId, checklistId: c.id }); }}>
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredChecklists.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum checklist realizado ainda</p>
                  <p className="text-xs mt-1">Crie um template e comece a fazer inspeções periódicas</p>
                </div>
              )}
            </div>
          </>
        )}

        {view === "templates" && (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-slate-500">{(templates as any[])?.length || 0} template(s)</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => generateDefault.mutate({ companyId: cId })} disabled={generateDefault.isPending}>
                  <Settings className="h-3.5 w-3.5 mr-1" /> Gerar Template Padrão
                </Button>
                <Button size="sm" className="text-xs h-8 bg-[#1e3a5f] hover:bg-[#2c5282]" onClick={() => { resetTplForm(); setShowTemplateModal(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Novo Template
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(templates as any[] || []).map((t: any) => (
                <Card key={t.id} className="border-0 shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-white">{t.nome}</p>
                        {t.descricao && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{t.descricao}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-[9px]">{t.periodicidade}</Badge>
                          {t.tipo_veiculo && <Badge variant="outline" className="text-[9px]">{t.tipo_veiculo}</Badge>}
                          <span className="text-[10px] text-slate-400">{t.items_count} itens</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startFillChecklist(t.id)}>
                          <ClipboardCheck className="h-3.5 w-3.5 text-green-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (confirm("Excluir template?")) deleteTemplate.mutate({ companyId: cId, templateId: t.id }); }}>
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {(!templates || (templates as any[]).length === 0) && (
                <div className="col-span-2 text-center py-12 text-slate-400">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum template criado</p>
                  <p className="text-xs mt-1">Clique em "Gerar Template Padrão" para começar</p>
                </div>
              )}
            </div>
          </>
        )}

        {view === "fill" && selectedTemplate && (
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-green-500" />
                Preencher: {selectedTemplate.nome}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Veículo *</Label>
                  <Select value={fillVehicleId ? String(fillVehicleId) : ""} onValueChange={(v) => setFillVehicleId(Number(v))}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {(vehicles || []).filter((v: any) => v.statusVeiculo === "Ativo").map((v: any) => (
                        <SelectItem key={v.id} value={String(v.id)}>{v.placa} — {v.modelo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">KM Atual *</Label>
                  <Input type="number" className="h-9 text-xs" value={fillKm} onChange={e => setFillKm(e.target.value)} placeholder="Ex: 45.200" />
                </div>
                <div>
                  <Label className="text-xs">Motorista</Label>
                  <Input className="h-9 text-xs" value={fillMotorista} onChange={e => setFillMotorista(e.target.value)} placeholder="Nome do motorista" />
                </div>
              </div>

              {(() => {
                const items = selectedTemplate.items || [];
                if (fillResponses.length === 0 && items.length > 0) {
                  setTimeout(() => {
                    setFillResponses(items.map((it: any) => ({
                      templateItemId: it.id,
                      categoria: it.categoria,
                      descricao: it.descricao,
                      resposta: "conforme",
                      observacao: "",
                      fotoUrl: "",
                      midias: [],
                    })));
                  }, 0);
                }

                const categories = [...new Set(items.map((it: any) => it.categoria))];
                return categories.map((cat: string) => {
                  const catItems = fillResponses.filter(r => r.categoria === cat);
                  const catOk = catItems.filter(r => r.resposta === "conforme").length;
                  return (
                    <div key={cat} className="border rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-slate-700 dark:text-white">{cat}</p>
                        <span className="text-[10px] text-slate-400">{catOk}/{catItems.length} conformes</span>
                      </div>
                      <div className="space-y-2">
                        {catItems.map((resp, idx) => {
                          const globalIdx = fillResponses.indexOf(resp);
                          const isUploading = uploadingIdx === globalIdx;
                          return (
                            <div key={idx} className={`p-2 rounded-lg ${resp.resposta === "conforme" ? "bg-green-50 dark:bg-green-950" : resp.resposta === "nao_conforme" ? "bg-red-50 dark:bg-red-950" : "bg-gray-50 dark:bg-gray-800"}`}>
                              <div className="flex items-start gap-2">
                                <div className="flex-1">
                                  <p className="text-xs text-slate-700 dark:text-slate-300">{resp.descricao}</p>
                                  {resp.resposta === "nao_conforme" && (
                                    <Input className="mt-1 h-7 text-[10px]" placeholder="Observação da não conformidade..."
                                      value={resp.observacao}
                                      onChange={e => {
                                        const copy = [...fillResponses];
                                        copy[globalIdx] = { ...copy[globalIdx], observacao: e.target.value };
                                        setFillResponses(copy);
                                      }} />
                                  )}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button className={`p-1.5 rounded-lg transition-colors ${resp.resposta === "conforme" ? "bg-green-500 text-white" : "bg-white text-green-500 border border-green-200"}`}
                                    onClick={() => {
                                      const copy = [...fillResponses];
                                      copy[globalIdx] = { ...copy[globalIdx], resposta: "conforme" };
                                      setFillResponses(copy);
                                    }}>
                                    <CheckCircle className="h-4 w-4" />
                                  </button>
                                  <button className={`p-1.5 rounded-lg transition-colors ${resp.resposta === "nao_conforme" ? "bg-red-500 text-white" : "bg-white text-red-500 border border-red-200"}`}
                                    onClick={() => {
                                      const copy = [...fillResponses];
                                      copy[globalIdx] = { ...copy[globalIdx], resposta: "nao_conforme" };
                                      setFillResponses(copy);
                                    }}>
                                    <XCircle className="h-4 w-4" />
                                  </button>
                                  <button className={`p-1.5 rounded-lg transition-colors ${resp.resposta === "na" ? "bg-gray-500 text-white" : "bg-white text-gray-400 border border-gray-200"}`}
                                    onClick={() => {
                                      const copy = [...fillResponses];
                                      copy[globalIdx] = { ...copy[globalIdx], resposta: "na" };
                                      setFillResponses(copy);
                                    }}>
                                    <AlertCircle className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <button
                                  className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 border border-blue-200 dark:border-blue-800 transition-colors"
                                  disabled={isUploading}
                                  onClick={() => { setActiveItemIdx(globalIdx); fileInputRef.current?.click(); }}
                                >
                                  {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                                  Foto
                                </button>
                                <button
                                  className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-400 border border-purple-200 dark:border-purple-800 transition-colors"
                                  disabled={isUploading}
                                  onClick={() => { setActiveItemIdx(globalIdx); videoInputRef.current?.click(); }}
                                >
                                  {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Video className="h-3 w-3" />}
                                  Vídeo
                                </button>
                                {resp.midias.length > 0 && (
                                  <span className="text-[10px] text-slate-500 ml-1">
                                    {resp.midias.filter(m => m.tipo === 'foto').length > 0 && `${resp.midias.filter(m => m.tipo === 'foto').length} foto(s)`}
                                    {resp.midias.filter(m => m.tipo === 'foto').length > 0 && resp.midias.filter(m => m.tipo === 'video').length > 0 && ' · '}
                                    {resp.midias.filter(m => m.tipo === 'video').length > 0 && `${resp.midias.filter(m => m.tipo === 'video').length} vídeo(s)`}
                                  </span>
                                )}
                              </div>
                              {resp.midias.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {resp.midias.map((m, mi) => (
                                    <div key={mi} className="relative group">
                                      {m.tipo === 'foto' ? (
                                        <div
                                          className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer hover:ring-2 ring-blue-400 transition-all"
                                          onClick={() => setPreviewMedia({ url: m.preview || m.url, tipo: m.tipo })}
                                        >
                                          <img src={m.preview || m.url} alt="Evidência" className="w-full h-full object-cover" />
                                        </div>
                                      ) : (
                                        <div
                                          className="w-14 h-14 rounded-lg overflow-hidden border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-950 flex items-center justify-center cursor-pointer hover:ring-2 ring-purple-400 transition-all"
                                          onClick={() => setPreviewMedia({ url: m.url, tipo: m.tipo })}
                                        >
                                          <Video className="h-5 w-5 text-purple-500" />
                                        </div>
                                      )}
                                      <button
                                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => removeMedia(globalIdx, mi)}
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}

              <div>
                <Label className="text-xs">Observações Gerais</Label>
                <Textarea className="text-xs" rows={2} value={fillObs} onChange={e => setFillObs(e.target.value)} placeholder="Observações adicionais..." />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setView("checklists")}>Cancelar</Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleSaveChecklist} disabled={createChecklist.isPending}>
                  <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Salvar Checklist
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {view === "detail" && detail && (
          <Card className="border-0 shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-green-500" />
                  Detalhes do Checklist — {(detail as any).placa}
                </CardTitle>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setView("checklists")}>Voltar</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-center">
                  <p className="text-[10px] text-slate-500">Data</p>
                  <p className="text-sm font-bold">{fmtDate((detail as any).data_checklist)}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-center">
                  <p className="text-[10px] text-slate-500">Motorista</p>
                  <p className="text-sm font-bold">{(detail as any).motorista_nome || "—"}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-center">
                  <p className="text-[10px] text-slate-500">KM</p>
                  <p className="text-sm font-bold">{(detail as any).km_atual ? Number((detail as any).km_atual).toLocaleString("pt-BR") : "—"}</p>
                </div>
                <div className={`p-3 rounded-xl text-center text-white ${Number((detail as any).score_geral) >= 80 ? "bg-gradient-to-br from-green-500 to-green-600" : Number((detail as any).score_geral) >= 50 ? "bg-gradient-to-br from-amber-400 to-amber-500" : "bg-gradient-to-br from-red-500 to-red-600"}`}>
                  <p className="text-[10px]">Score</p>
                  <p className="text-lg font-black">{Number((detail as any).score_geral || 0).toFixed(0)}%</p>
                </div>
              </div>

              {(() => {
                const responses = (detail as any).responses || [];
                const categories = [...new Set(responses.map((r: any) => r.categoria))];
                return categories.map((cat: string) => {
                  const catItems = responses.filter((r: any) => r.categoria === cat);
                  const catOk = catItems.filter((r: any) => r.resposta === "conforme").length;
                  return (
                    <div key={cat} className="border rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-slate-700 dark:text-white">{cat}</p>
                        <Badge variant="outline" className={`text-[9px] ${catOk === catItems.length ? "border-green-300 text-green-700 bg-green-50" : "border-amber-300 text-amber-700 bg-amber-50"}`}>
                          {catOk}/{catItems.length}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {catItems.map((r: any, i: number) => {
                          const midias: any[] = r.midias_urls || (r.foto_url ? [{ url: r.foto_url, tipo: 'foto' }] : []);
                          return (
                            <div key={i} className={`p-2 rounded-lg ${r.resposta === "conforme" ? "bg-green-50 dark:bg-green-950" : r.resposta === "nao_conforme" ? "bg-red-50 dark:bg-red-950" : "bg-gray-50 dark:bg-gray-800"}`}>
                              <div className="flex items-center gap-2">
                                {r.resposta === "conforme" ? <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" /> : r.resposta === "nao_conforme" ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                                <div className="flex-1">
                                  <p className="text-xs text-slate-700 dark:text-slate-300">{r.descricao}</p>
                                  {r.observacao && <p className="text-[10px] text-red-600 mt-0.5">{r.observacao}</p>}
                                </div>
                                {midias.length > 0 && (
                                  <span className="text-[9px] text-blue-500 flex items-center gap-0.5">
                                    <Camera className="h-3 w-3" /> {midias.length}
                                  </span>
                                )}
                              </div>
                              {midias.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-1.5 ml-6">
                                  {midias.map((m: any, mi: number) => (
                                    <div key={mi} className="cursor-pointer" onClick={() => setPreviewMedia({ url: m.url, tipo: m.tipo || 'foto' })}>
                                      {(m.tipo || 'foto') === 'foto' ? (
                                        <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 hover:ring-2 ring-blue-400 transition-all">
                                          <img src={m.url} alt="Evidência" className="w-full h-full object-cover" />
                                        </div>
                                      ) : (
                                        <div className="w-12 h-12 rounded-lg overflow-hidden border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-950 flex items-center justify-center hover:ring-2 ring-purple-400 transition-all">
                                          <Video className="h-4 w-4 text-purple-500" />
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}

              {(detail as any).observacoes && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <p className="text-[10px] text-slate-500 font-semibold mb-1">Observações</p>
                  <p className="text-xs text-slate-700 dark:text-slate-300">{(detail as any).observacoes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-sm">Novo Template de Checklist</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome *</Label>
              <Input className="h-9 text-xs" value={tplNome} onChange={e => setTplNome(e.target.value)} placeholder="Ex: Inspeção Mensal Caminhão" />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea className="text-xs" rows={2} value={tplDescricao} onChange={e => setTplDescricao(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Tipo de Veículo</Label>
              <Input className="h-9 text-xs" value={tplTipoVeiculo} onChange={e => setTplTipoVeiculo(e.target.value)} placeholder="Ex: Veículo Leve, Caminhão, Van" />
            </div>

            <div className="border rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold">Itens do Checklist ({tplItems.length})</p>
              <div className="flex gap-2">
                <Select value={tplNewCat} onValueChange={setTplNewCat}>
                  <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_DEFAULT.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    <SelectItem value="Outra">Outra</SelectItem>
                  </SelectContent>
                </Select>
                <Input className="h-8 text-xs flex-1" placeholder="Descrição do item" value={tplNewDesc} onChange={e => setTplNewDesc(e.target.value)} />
                <div className="flex items-center gap-1">
                  <Camera className="h-3 w-3 text-slate-400" />
                  <Switch checked={tplNewFoto} onCheckedChange={setTplNewFoto} />
                </div>
                <Button size="icon" className="h-8 w-8" onClick={() => {
                  if (!tplNewCat || !tplNewDesc) return;
                  setTplItems([...tplItems, { categoria: tplNewCat, descricao: tplNewDesc, fotoObrigatoria: tplNewFoto, ordem: tplItems.length }]);
                  setTplNewDesc(""); setTplNewFoto(false);
                }}><Plus className="h-3.5 w-3.5" /></Button>
              </div>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {tplItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800">
                    <Badge variant="outline" className="text-[8px] shrink-0">{item.categoria}</Badge>
                    <span className="text-xs flex-1 truncate">{item.descricao}</span>
                    {item.fotoObrigatoria && <Camera className="h-3 w-3 text-blue-400 shrink-0" />}
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTplItems(tplItems.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowTemplateModal(false)}>Cancelar</Button>
            <Button size="sm" className="bg-[#1e3a5f]" onClick={() => {
              if (!tplNome) return toast.error("Nome obrigatório");
              createTemplate.mutate({
                companyId: cId,
                nome: tplNome,
                descricao: tplDescricao || undefined,
                tipoVeiculo: tplTipoVeiculo || undefined,
                items: tplItems.map(it => ({
                  categoria: it.categoria,
                  descricao: it.descricao,
                  obrigatorio: true,
                  fotoObrigatoria: it.fotoObrigatoria,
                  ordem: it.ordem,
                })),
              });
            }} disabled={createTemplate.isPending}>Salvar Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file && activeItemIdx !== null) handleMediaCapture(file, activeItemIdx);
          e.target.value = '';
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file && activeItemIdx !== null) handleMediaCapture(file, activeItemIdx);
          e.target.value = '';
        }}
      />

      {previewMedia && (
        <Dialog open={!!previewMedia} onOpenChange={() => setPreviewMedia(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] p-2 bg-black/95">
            <div className="flex justify-end mb-1">
              <button onClick={() => setPreviewMedia(null)} className="text-white/70 hover:text-white p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            {previewMedia.tipo === 'foto' ? (
              <img src={previewMedia.url} alt="Evidência" className="w-full max-h-[80vh] object-contain rounded" />
            ) : (
              <video src={previewMedia.url} controls autoPlay className="w-full max-h-[80vh] rounded" />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
