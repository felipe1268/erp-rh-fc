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
import {
  ClipboardCheck, Plus, CheckCircle, XCircle, AlertCircle, ArrowLeft,
  Camera, Video, X, Loader2, Shield, ShieldCheck, ShieldX, Pen, FileText,
  Building2, MapPin, Layers, Eye, Play,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";

function fmtDate(d: any) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return "—"; }
}
function fmtDateTime(d: any) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("pt-BR"); } catch { return "—"; }
}

type View = "lista" | "templates" | "nova" | "preencher" | "detalhe";

interface MediaItem { url: string; tipo: string; preview?: string }

export default function LiberacaoServicos() {
  const { selectedCompany } = useCompany();
  const cId = selectedCompany?.id ?? 0;
  const utils = trpc.useUtils();

  const [view, setView] = useState<View>("lista");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [obraId, setObraId] = useState<number | null>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [novaLocal, setNovaLocal] = useState("");
  const [novaPavimento, setNovaPavimento] = useState("");
  const [novaElemento, setNovaElemento] = useState("");
  const [novaDesc, setNovaDesc] = useState("");

  const [liberacaoId, setLiberacaoId] = useState<number | null>(null);
  const [itemMidias, setItemMidias] = useState<Record<number, MediaItem[]>>({});
  const [uploadingItemId, setUploadingItemId] = useState<number | null>(null);
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [previewMedia, setPreviewMedia] = useState<{ url: string; tipo: string } | null>(null);

  const [showSignModal, setShowSignModal] = useState(false);
  const [signPapel, setSignPapel] = useState<"fiscal" | "encarregado" | "engenheiro">("fiscal");
  const [signNome, setSignNome] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const { data: obras } = trpc.obras.list.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const obrasList = (obras as any[]) || [];
  const activeObras = obrasList.filter((o: any) => o.status === "Em andamento" || o.status === "Ativo" || o.status === "ativo");

  const { data: templates } = trpc.operacional.listarLiberacaoTemplates.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const { data: liberacoes, refetch: refetchLib } = trpc.operacional.listarLiberacoes.useQuery(
    { companyId: cId, obraId: obraId!, tipoServico: filterTipo !== "todos" ? filterTipo : undefined, status: filterStatus !== "todos" ? filterStatus : undefined },
    { enabled: cId > 0 && !!obraId }
  );
  const { data: detalhe, refetch: refetchDetalhe } = trpc.operacional.getLiberacaoDetalhe.useQuery(
    { id: liberacaoId!, companyId: cId },
    { enabled: cId > 0 && !!liberacaoId }
  );

  const criarLib = trpc.operacional.criarLiberacao.useMutation({
    onSuccess: (d: any) => {
      toast.success("Liberação criada!");
      refetchLib();
      setLiberacaoId(d.id);
      setItemMidias({});
      setView("preencher");
    },
    onError: (e) => toast.error(e.message),
  });
  const responderItem = trpc.operacional.responderLiberacaoItem.useMutation({
    onSuccess: () => refetchDetalhe(),
    onError: (e) => toast.error(e.message),
  });
  const assinarLib = trpc.operacional.assinarLiberacao.useMutation({
    onSuccess: (data: any) => {
      if (data.primeiraAssinatura) {
        toast.success("Assinatura registrada! Memorial salvo para futuras verificações.");
      } else if (data.assinaturaDivergente) {
        toast.warning(`⚠️ ATENÇÃO: Assinatura divergente do memorial! Similaridade: ${data.similaridade}%. Verificar identidade.`, { duration: 8000 });
      } else if (data.similaridade !== null && data.similaridade !== undefined) {
        toast.success(`Assinatura registrada! Compatível com memorial (${data.similaridade}%).`);
      } else {
        toast.success("Assinatura registrada!");
      }
      refetchDetalhe(); setShowSignModal(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const finalizarLib = trpc.operacional.finalizarLiberacao.useMutation({
    onSuccess: () => { toast.success("Liberação finalizada!"); refetchDetalhe(); refetchLib(); },
    onError: (e) => toast.error(e.message),
  });
  const uploadMedia = trpc.operacional.uploadLiberacaoMedia.useMutation();

  const handleMediaCapture = useCallback(async (file: File, itemId: number) => {
    if (!file) return;
    const maxSize = file.type.startsWith('video') ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(file.type.startsWith('video') ? "Vídeo muito grande (máx 50MB)" : "Foto muito grande (máx 10MB)");
      return;
    }
    setUploadingItemId(itemId);
    try {
      const preview = file.type.startsWith('image') ? URL.createObjectURL(file) : undefined;
      const reader = new FileReader();
      const b64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const tipo = file.type.startsWith('video') ? 'video' : 'foto';
      const result = await uploadMedia.mutateAsync({ companyId: cId, base64: b64, contentType: file.type });
      setItemMidias(prev => ({
        ...prev,
        [itemId]: [...(prev[itemId] || []), { url: result.url, tipo, preview }],
      }));
      toast.success(tipo === 'video' ? "Vídeo anexado!" : "Foto anexada!");
    } catch (e: any) {
      toast.error("Erro ao enviar: " + (e.message || "tente novamente"));
    } finally {
      setUploadingItemId(null);
    }
  }, [cId, uploadMedia]);

  function removeMedia(itemId: number, mediaIdx: number) {
    setItemMidias(prev => {
      const arr = [...(prev[itemId] || [])];
      if (arr[mediaIdx]?.preview) URL.revokeObjectURL(arr[mediaIdx].preview!);
      arr.splice(mediaIdx, 1);
      return { ...prev, [itemId]: arr };
    });
  }

  function handleResponder(itemId: number, resposta: string, observacao?: string) {
    if (!liberacaoId) return;
    const midias = itemMidias[itemId] || [];
    responderItem.mutate({
      itemId,
      companyId: cId,
      liberacaoId,
      resposta,
      observacao,
      midiasUrls: midias.map(m => ({ url: m.url, tipo: m.tipo })),
    });
  }

  function startSign(papel: "fiscal" | "encarregado" | "engenheiro") {
    setSignPapel(papel);
    setSignNome("");
    setShowSignModal(true);
  }

  useEffect(() => {
    if (!showSignModal || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";

    function getPos(e: MouseEvent | TouchEvent) {
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function onStart(e: MouseEvent | TouchEvent) {
      e.preventDefault();
      isDrawing.current = true;
      const pos = getPos(e);
      ctx!.beginPath();
      ctx!.moveTo(pos.x, pos.y);
    }
    function onMove(e: MouseEvent | TouchEvent) {
      if (!isDrawing.current) return;
      e.preventDefault();
      const pos = getPos(e);
      ctx!.lineTo(pos.x, pos.y);
      ctx!.stroke();
    }
    function onEnd() { isDrawing.current = false; }

    canvas.addEventListener("mousedown", onStart);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onEnd);
    canvas.addEventListener("touchstart", onStart, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onEnd);

    return () => {
      canvas.removeEventListener("mousedown", onStart);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onEnd);
      canvas.removeEventListener("touchstart", onStart);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onEnd);
    };
  }, [showSignModal]);

  async function handleSaveSign() {
    if (!signNome.trim()) return toast.error("Informe o nome");
    if (!canvasRef.current || !liberacaoId) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const b64 = dataUrl.split(",")[1];
    try {
      const res = await uploadMedia.mutateAsync({ companyId: cId, base64: b64, contentType: "image/png" });
      await assinarLib.mutateAsync({
        liberacaoId,
        companyId: cId,
        papel: signPapel,
        nome: signNome.trim(),
        assinaturaUrl: res.url,
        assinaturaBase64: dataUrl,
      });
    } catch (e: any) {
      toast.error("Erro ao salvar assinatura: " + e.message);
    }
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const tiposServico = [...new Set((templates as any[])?.map((t: any) => t.tipo_servico) || [])];

  const det = detalhe as any;
  const libList = (liberacoes as any[]) || [];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {view !== "lista" && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setView("lista"); setLiberacaoId(null); }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-emerald-500" />
              Liberação de Serviços
            </h1>
            <p className="text-xs text-slate-500">Checklist de liberação com fotos, vídeos e assinaturas</p>
          </div>
        </div>
        {view === "lista" && (
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setView("nova")}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nova Liberação
          </Button>
        )}
      </div>

      {view === "lista" && (
        <Card className="border-0 shadow-md">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Obra</Label>
                <Select value={obraId ? String(obraId) : ""} onValueChange={v => setObraId(Number(v))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                  <SelectContent>
                    {activeObras.map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tipo de Serviço</Label>
                <Select value={filterTipo} onValueChange={setFilterTipo}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {tiposServico.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="liberado">Liberado</SelectItem>
                    <SelectItem value="reprovado">Reprovado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!obraId ? (
              <div className="text-center py-12 text-slate-400">
                <Building2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Selecione uma obra para ver as liberações</p>
              </div>
            ) : libList.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma liberação encontrada</p>
              </div>
            ) : (
              <div className="space-y-2">
                {libList.map((lib: any) => (
                  <div key={lib.id}
                    className="flex items-center gap-3 p-3 rounded-xl border hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                    onClick={() => { setLiberacaoId(lib.id); setView("detalhe"); }}
                  >
                    <div className={`p-2 rounded-lg ${lib.status === "liberado" ? "bg-green-100 dark:bg-green-950" : lib.status === "reprovado" ? "bg-red-100 dark:bg-red-950" : "bg-amber-100 dark:bg-amber-950"}`}>
                      {lib.status === "liberado" ? <ShieldCheck className="h-5 w-5 text-green-600" /> : lib.status === "reprovado" ? <ShieldX className="h-5 w-5 text-red-600" /> : <Shield className="h-5 w-5 text-amber-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{lib.tipo_servico}</p>
                        <Badge variant="outline" className={`text-[9px] ${lib.status === "liberado" ? "border-green-300 text-green-700 bg-green-50" : lib.status === "reprovado" ? "border-red-300 text-red-700 bg-red-50" : "border-amber-300 text-amber-700 bg-amber-50"}`}>
                          {lib.status === "liberado" ? "Liberado" : lib.status === "reprovado" ? "Reprovado" : "Pendente"}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">
                        {[lib.local, lib.pavimento, lib.elemento].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold">{lib.itens_ok}/{lib.total_itens}</p>
                      <p className="text-[10px] text-slate-400">{fmtDate(lib.data_criacao)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {view === "nova" && (
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="text-sm">Nova Liberação de Serviço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Obra *</Label>
                <Select value={obraId ? String(obraId) : ""} onValueChange={v => setObraId(Number(v))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                  <SelectContent>
                    {activeObras.map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Template de Liberação *</Label>
                <Select value={selectedTemplateId ? String(selectedTemplateId) : ""} onValueChange={v => setSelectedTemplateId(Number(v))}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>
                    {(templates as any[])?.map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.nome} ({t.total_itens} itens)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Local</Label>
                <Input className="h-9 text-xs" value={novaLocal} onChange={e => setNovaLocal(e.target.value)} placeholder="Ex: Bloco A, Torre 1" />
              </div>
              <div>
                <Label className="text-xs">Pavimento</Label>
                <Input className="h-9 text-xs" value={novaPavimento} onChange={e => setNovaPavimento(e.target.value)} placeholder="Ex: 3° Pavimento" />
              </div>
              <div>
                <Label className="text-xs">Elemento</Label>
                <Input className="h-9 text-xs" value={novaElemento} onChange={e => setNovaElemento(e.target.value)} placeholder="Ex: Laje L1, Viga V3" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Descrição / Observação</Label>
              <Textarea className="text-xs" rows={2} value={novaDesc} onChange={e => setNovaDesc(e.target.value)} placeholder="Detalhes adicionais..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setView("lista")}>Cancelar</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={criarLib.isPending}
                onClick={() => {
                  if (!obraId) return toast.error("Selecione a obra");
                  if (!selectedTemplateId) return toast.error("Selecione o template");
                  criarLib.mutate({
                    companyId: cId, obraId, templateId: selectedTemplateId,
                    local: novaLocal || undefined, pavimento: novaPavimento || undefined,
                    elemento: novaElemento || undefined, descricao: novaDesc || undefined,
                  });
                }}>
                <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Criar Liberação
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(view === "preencher" || view === "detalhe") && det && (
        <div className="space-y-4">
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <Badge className={`${det.status === "liberado" ? "bg-green-500" : det.status === "reprovado" ? "bg-red-500" : "bg-amber-500"} text-white`}>
                  {det.status === "liberado" ? "LIBERADO" : det.status === "reprovado" ? "REPROVADO" : "PENDENTE"}
                </Badge>
                <h2 className="text-sm font-bold">{det.tipo_servico}</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                {det.local && <div className="flex items-center gap-1 text-slate-500"><MapPin className="h-3 w-3" /> {det.local}</div>}
                {det.pavimento && <div className="flex items-center gap-1 text-slate-500"><Layers className="h-3 w-3" /> {det.pavimento}</div>}
                {det.elemento && <div className="flex items-center gap-1 text-slate-500"><Building2 className="h-3 w-3" /> {det.elemento}</div>}
                <div className="flex items-center gap-1 text-slate-500"><FileText className="h-3 w-3" /> {fmtDate(det.data_criacao)}</div>
              </div>
            </CardContent>
          </Card>

          {(() => {
            const itens = det.itens || [];
            const categories = [...new Set(itens.map((it: any) => it.categoria || "Geral"))];
            return categories.map((cat: string) => {
              const catItems = itens.filter((it: any) => (it.categoria || "Geral") === cat);
              const catOk = catItems.filter((it: any) => it.resposta === "conforme").length;
              return (
                <Card key={cat} className="border-0 shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold text-slate-700 dark:text-white">{cat}</p>
                      <Badge variant="outline" className={`text-[9px] ${catOk === catItems.length ? "border-green-300 text-green-700 bg-green-50" : "border-slate-300 text-slate-500"}`}>
                        {catOk}/{catItems.length} conformes
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {catItems.map((item: any) => {
                        const isUploading = uploadingItemId === item.id;
                        const midias = itemMidias[item.id] || [];
                        const savedMidias: any[] = item.midias_urls || [];
                        const allMidias = [...savedMidias, ...midias];
                        const isPendente = det.status === "pendente";

                        return (
                          <div key={item.id} className={`p-3 rounded-xl border ${
                            item.resposta === "conforme" ? "border-green-200 bg-green-50/50 dark:bg-green-950/30" :
                            item.resposta === "nao_conforme" ? "border-red-200 bg-red-50/50 dark:bg-red-950/30" :
                            "border-slate-200 bg-slate-50/50 dark:bg-slate-800/50"
                          }`}>
                            <div className="flex items-start gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">{item.descricao}</p>
                                  {item.foto_obrigatoria && <Camera className="h-3 w-3 text-blue-500 shrink-0" title="Foto obrigatória" />}
                                </div>
                                {item.observacao && <p className="text-[10px] text-red-600 mt-1">{item.observacao}</p>}
                              </div>
                              {isPendente && (
                                <div className="flex gap-1 shrink-0">
                                  <button className={`p-1.5 rounded-lg transition-colors ${item.resposta === "conforme" ? "bg-green-500 text-white" : "bg-white text-green-500 border border-green-200 hover:bg-green-50"}`}
                                    onClick={() => handleResponder(item.id, "conforme")}>
                                    <CheckCircle className="h-4 w-4" />
                                  </button>
                                  <button className={`p-1.5 rounded-lg transition-colors ${item.resposta === "nao_conforme" ? "bg-red-500 text-white" : "bg-white text-red-500 border border-red-200 hover:bg-red-50"}`}
                                    onClick={() => {
                                      const obs = prompt("Observação da não conformidade:");
                                      handleResponder(item.id, "nao_conforme", obs || undefined);
                                    }}>
                                    <XCircle className="h-4 w-4" />
                                  </button>
                                  <button className={`p-1.5 rounded-lg transition-colors ${item.resposta === "na" ? "bg-gray-500 text-white" : "bg-white text-gray-400 border border-gray-200 hover:bg-gray-50"}`}
                                    onClick={() => handleResponder(item.id, "na")}>
                                    <AlertCircle className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                              {!isPendente && (
                                <div className="shrink-0">
                                  {item.resposta === "conforme" ? <CheckCircle className="h-5 w-5 text-green-500" /> :
                                   item.resposta === "nao_conforme" ? <XCircle className="h-5 w-5 text-red-500" /> :
                                   <AlertCircle className="h-5 w-5 text-gray-400" />}
                                </div>
                              )}
                            </div>

                            {isPendente && (
                              <div className="flex items-center gap-1.5 mt-2">
                                <button className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
                                  disabled={isUploading}
                                  onClick={() => { setActiveItemId(item.id); fileInputRef.current?.click(); }}>
                                  {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />} Foto
                                </button>
                                <button className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-200 transition-colors"
                                  disabled={isUploading}
                                  onClick={() => { setActiveItemId(item.id); videoInputRef.current?.click(); }}>
                                  {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Video className="h-3 w-3" />} Vídeo
                                </button>
                                {allMidias.length > 0 && (
                                  <span className="text-[10px] text-slate-500 ml-1">{allMidias.length} arquivo(s)</span>
                                )}
                              </div>
                            )}

                            {allMidias.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {allMidias.map((m: any, mi: number) => (
                                  <div key={mi} className="relative group">
                                    {(m.tipo || 'foto') === 'foto' ? (
                                      <div className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 cursor-pointer hover:ring-2 ring-blue-400 transition-all"
                                        onClick={() => setPreviewMedia({ url: m.preview || m.url, tipo: 'foto' })}>
                                        <img src={m.preview || m.url} alt="Evidência" className="w-full h-full object-cover" />
                                      </div>
                                    ) : (
                                      <div className="w-14 h-14 rounded-lg overflow-hidden border border-purple-200 bg-purple-50 flex items-center justify-center cursor-pointer hover:ring-2 ring-purple-400 transition-all"
                                        onClick={() => setPreviewMedia({ url: m.url, tipo: 'video' })}>
                                        <Play className="h-5 w-5 text-purple-500" />
                                      </div>
                                    )}
                                    {isPendente && mi >= savedMidias.length && (
                                      <button className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => removeMedia(item.id, mi - savedMidias.length)}>
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            });
          })()}

          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <p className="text-xs font-bold text-slate-700 dark:text-white mb-3">Assinaturas</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(["fiscal", "encarregado", "engenheiro"] as const).map(papel => {
                  const nome = det[`assinatura_${papel}_nome`];
                  const url = det[`assinatura_${papel}_url`];
                  const data = det[`assinatura_${papel}_data`];
                  const label = papel === "fiscal" ? "Fiscal" : papel === "encarregado" ? "Encarregado" : "Engenheiro Responsável";
                  return (
                    <div key={papel} className={`p-3 rounded-xl border ${nome ? "border-green-200 bg-green-50/50 dark:bg-green-950/30" : "border-slate-200"}`}>
                      <p className="text-[10px] font-semibold text-slate-500 mb-1">{label}</p>
                      {nome ? (
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-white">{nome}</p>
                          <p className="text-[10px] text-slate-400">{fmtDateTime(data)}</p>
                          {url && <img src={url} alt="Assinatura" className="mt-1 h-12 object-contain rounded border bg-white" />}
                        </div>
                      ) : (
                        <div>
                          <p className="text-[10px] text-slate-400 mb-2">Aguardando assinatura</p>
                          {det.status === "pendente" && (
                            <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={() => startSign(papel)}>
                              <Pen className="h-3 w-3 mr-1" /> Assinar
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {det.status === "pendente" && (
            <Card className="border-0 shadow-md">
              <CardContent className="p-4">
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => {
                      const motivo = prompt("Motivo da reprovação:");
                      if (motivo !== null) {
                        finalizarLib.mutate({ liberacaoId: det.id, companyId: cId, status: "reprovado", motivoReprovacao: motivo || undefined });
                      }
                    }} disabled={finalizarLib.isPending}>
                    <ShieldX className="h-3.5 w-3.5 mr-1" /> Reprovar
                  </Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => finalizarLib.mutate({ liberacaoId: det.id, companyId: cId, status: "liberado" })}
                    disabled={finalizarLib.isPending}>
                    <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Liberar Serviço
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {det.status === "reprovado" && det.motivo_reprovacao && (
            <Card className="border-0 shadow-md border-red-200">
              <CardContent className="p-4">
                <p className="text-[10px] text-red-500 font-semibold mb-1">Motivo da Reprovação</p>
                <p className="text-xs text-slate-700 dark:text-slate-300">{det.motivo_reprovacao}</p>
                <p className="text-[10px] text-slate-400 mt-1">Reprovado em {fmtDateTime(det.data_reprovacao)}</p>
              </CardContent>
            </Card>
          )}

          {det.status === "liberado" && (
            <Card className="border-0 shadow-md border-green-200">
              <CardContent className="p-4 text-center">
                <ShieldCheck className="h-8 w-8 text-green-500 mx-auto mb-1" />
                <p className="text-sm font-bold text-green-700">Serviço Liberado</p>
                <p className="text-[10px] text-slate-400">Liberado em {fmtDateTime(det.data_liberacao)}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f && activeItemId !== null) handleMediaCapture(f, activeItemId); e.target.value = ''; }} />
      <input ref={videoInputRef} type="file" accept="video/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f && activeItemId !== null) handleMediaCapture(f, activeItemId); e.target.value = ''; }} />

      {previewMedia && (
        <Dialog open={!!previewMedia} onOpenChange={() => setPreviewMedia(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] p-2 bg-black/95">
            <div className="flex justify-end mb-1">
              <button onClick={() => setPreviewMedia(null)} className="text-white/70 hover:text-white p-1"><X className="h-5 w-5" /></button>
            </div>
            {previewMedia.tipo === 'foto' ? (
              <img src={previewMedia.url} alt="Evidência" className="w-full max-h-[80vh] object-contain rounded" />
            ) : (
              <video src={previewMedia.url} controls autoPlay className="w-full max-h-[80vh] rounded" />
            )}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showSignModal} onOpenChange={setShowSignModal}>
        <DialogContent className="max-w-md bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Pen className="h-4 w-4 text-emerald-500" />
              Assinatura — {signPapel === "fiscal" ? "Fiscal" : signPapel === "encarregado" ? "Encarregado" : "Engenheiro Responsável"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome completo *</Label>
              <Input className="h-9 text-xs" value={signNome} onChange={e => setSignNome(e.target.value)} placeholder="Nome do responsável" />
            </div>
            <div>
              <Label className="text-xs">Assinatura</Label>
              <div className="border rounded-xl p-1 bg-white">
                <canvas ref={canvasRef} width={380} height={150} className="w-full rounded-lg cursor-crosshair touch-none" />
              </div>
              <Button variant="ghost" size="sm" className="text-[10px] mt-1" onClick={clearCanvas}>Limpar assinatura</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowSignModal(false)}>Cancelar</Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSaveSign} disabled={assinarLib.isPending || uploadMedia.isPending}>
              {(assinarLib.isPending || uploadMedia.isPending) && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Confirmar Assinatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
