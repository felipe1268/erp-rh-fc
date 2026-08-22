import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import RichTextEditor, { stripHtml, sanitizeHtml, isHtmlContent } from "@/components/RichTextEditor";
import { renderTemplate } from "@shared/documentTemplates";
import { Megaphone, Plus, Trash2, Upload, FileText, Search, Loader2, ArrowLeft, Printer, Eye, ChevronLeft, Pencil, CheckCircle2, RotateCcw, Lock, X, Maximize2, Minimize2, ClipboardSignature, Eraser, MonitorSmartphone, Users, Signature, Building2, Filter, Send, Mail, UserCheck, Clock } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { formatCPF } from "@/lib/formatters";
import { formatDate, formatDateTime } from "@/lib/dateUtils";

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

// Rev. 2079 — SignaturePad canvas inline: assinatura desenhada pelo colaborador via
// mouse ou toque. Devolve PNG data URL no callback `onSave`. Sem libs externas.
function SignaturePad({ initial, onSave, onCancel, employeeName }: {
  initial?: string | null;
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  employeeName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(!!initial);
  const setup = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const parent = c.parentElement; if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(rect.width * dpr);
    c.height = Math.floor(420 * dpr);
    c.style.width = `${rect.width}px`;
    c.style.height = `420px`;
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1B2A4A";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    if (initial) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, rect.width, 420); setHasInk(true); };
      img.src = initial;
    }
  }, [initial]);
  useEffect(() => { setup(); }, [setup]);
  function pos(ev: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }
  function onDown(ev: React.PointerEvent<HTMLCanvasElement>) {
    (ev.target as HTMLCanvasElement).setPointerCapture(ev.pointerId);
    drawingRef.current = true; lastRef.current = pos(ev);
  }
  function onMove(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastRef.current) return;
    const c = canvasRef.current!; const ctx = c.getContext("2d"); if (!ctx) return;
    const p = pos(ev);
    ctx.beginPath(); ctx.moveTo(lastRef.current.x, lastRef.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastRef.current = p; setHasInk(true);
  }
  function onUp() { drawingRef.current = false; lastRef.current = null; }
  function clear() {
    const c = canvasRef.current!; const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    // Reset transform absoluto (evita acumular escala a cada clear — bug Rev. 2079).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width / dpr, c.height / dpr);
    ctx.strokeStyle = "#1B2A4A"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    setHasInk(false);
  }
  function save() {
    if (!hasInk) { toast.error("Assine no quadro antes de salvar."); return; }
    const c = canvasRef.current!;
    const dataUrl = c.toDataURL("image/png");
    if (!dataUrl || dataUrl.length < 200) { toast.error("Falha ao capturar assinatura."); return; }
    onSave(dataUrl);
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Assine no quadro abaixo com o mouse ou com o dedo (em tablets/celulares).
        Ao salvar, a assinatura fica vinculada a <span className="font-semibold">{employeeName}</span> com data/hora e registro do usuário responsável.
      </p>
      <div className="border-2 border-dashed border-slate-300 rounded-lg bg-white overflow-hidden touch-none select-none">
        <canvas
          ref={canvasRef}
          className="block w-full cursor-crosshair"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onPointerCancel={onUp}
        />
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={clear}>
          <Eraser className="h-4 w-4 mr-1" /> Limpar
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={!hasInk} onClick={save}>
          <CheckCircle2 className="h-4 w-4 mr-1" /> Salvar Assinatura
        </Button>
      </div>
    </div>
  );
}

export default function ComunicadosInternos() {
  const [, navigate] = useLocation();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { isAdminMaster } = usePermissions();
  const companyId = selectedCompanyId ? Number(selectedCompanyId) : 0;
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [anoFiltro, setAnoFiltro] = useState<number | "todos">("todos");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({
    titulo: "", dataEmissao: new Date().toISOString().slice(0, 10), conteudo: "",
    setor: "", emissorNome: "", emissorCargo: "", destinatariosIds: [] as number[],
  });
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [viewComunicadoId, setViewComunicadoId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ titulo: "", conteudo: "", setor: "", emissorNome: "", emissorCargo: "", destinatariosIds: [] as number[] });
  // Rev. 4264 — FCSign modal state
  const [fcSignDialog, setFcSignDialog] = useState<{ id: number; numero: string; titulo: string; emissorNome: string } | null>(null);
  const [fcSignEmail, setFcSignEmail] = useState("");
  // Rev. — assinatura da DIRETORIA junto com o emissor + links de assinatura p/ cópia
  const [fcSignCelular, setFcSignCelular] = useState("");
  const [fcSignDirNome, setFcSignDirNome] = useState("");
  const [fcSignDirEmail, setFcSignDirEmail] = useState("");
  const [fcSignDirCelular, setFcSignDirCelular] = useState("");
  // Rev. — Diretor da JF (empregador documental): aparece quando o comunicado tem colaboradores JF
  const [fcSignDirJfNome, setFcSignDirJfNome] = useState("");
  const [fcSignDirJfEmail, setFcSignDirJfEmail] = useState("");
  const [fcSignDirJfCelular, setFcSignDirJfCelular] = useState("");
  const [fcSignLinks, setFcSignLinks] = useState<{ emissor: string; emissorCel: string; diretoria: string | null; diretoriaCel: string; diretoriaJf: string | null; diretoriaJfCel: string } | null>(null);
  const resetFcSign = () => { setFcSignDialog(null); setFcSignEmail(""); setFcSignCelular(""); setFcSignDirNome(""); setFcSignDirEmail(""); setFcSignDirCelular(""); setFcSignDirJfNome(""); setFcSignDirJfEmail(""); setFcSignDirJfCelular(""); setFcSignLinks(null); };
  const abrirFcSignDialog = (c: any) => {
    setFcSignDirNome("FELIPE COSTA ALVES");
    setFcSignDirJfNome("JULIO CESAR FERRAZ DE ARAUJO");
    setFcSignDialog({ id: c.id, numero: c.numero, titulo: c.titulo, emissorNome: c.emissorNome || c.criadoPor || "" });
  };
  const abrirWhatsApp = (celular: string, url: string, titulo: string) => {
    const fone = celular.replace(/\D/g, "");
    const foneBr = fone.length <= 11 ? `55${fone}` : fone;
    const msg = `Olá! Segue o link para assinatura digital do comunicado "${titulo}" via FCSign:\n\n${url}\n\nO link é válido por 30 dias.`;
    window.open(`https://wa.me/${foneBr}?text=${encodeURIComponent(msg)}`, "_blank");
  };
  // Rev. 4264 — Destinatários picker: busca + filtro somente indiretos (compartilhado entre dialogs)
  const [buscaDest, setBuscaDest] = useState("");
  const [somentIndiretos, setSomentIndiretos] = useState(false);
  const [pendingText, setPendingText] = useState<{ id: number; text: string } | null>(null);
  const [novoFullscreen, setNovoFullscreen] = useState(false);
  const [editFullscreen, setEditFullscreen] = useState(false);
  // Rev. 2079 — Lista de Assinatura: id do comunicado em foco + modo (imprimir/digital) + funcionário que está assinando agora
  const [listaAssinaturaId, setListaAssinaturaId] = useState<number | null>(null);
  const [assinaturaMode, setAssinaturaMode] = useState<"imprimir" | "digital">("digital");
  const [signingFuncionario, setSigningFuncionario] = useState<{ id: number; nome: string; initial?: string | null } | null>(null);
  const [searchFunc, setSearchFunc] = useState("");
  // Filtros da Lista para Assinatura: por obra + por status de assinatura.
  const [filtroObra, setFiltroObra] = useState<string>("");
  const [filtroAssinatura, setFiltroAssinatura] = useState<"todos" | "assinados" | "pendentes">("todos");
  // Rev. 4546 — lista principal (admitidos até a emissão) x complementar (admitidos depois, sem assinatura)
  const [listaTipo, setListaTipo] = useState<"principal" | "complementar">("principal");

  const listaAssinaturaQuery = trpc.comunicadosInternos.listarFuncionariosParaAssinatura.useQuery(
    { comunicadoId: listaAssinaturaId || 0, companyId, lista: listaTipo },
    { enabled: !!listaAssinaturaId && companyId > 0 },
  );
  // Rev. 4985 — dados do empregador documental "JF" (Julio Ferraz) p/ separar
  // a lista de ciência em 2 quando houver colaboradores marcados como JF.
  const { data: jfEmpresa } = trpc.companies.empregadorJf.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    enabled: !!listaAssinaturaId || !!viewComunicadoId || fcSignDialog !== null,
  });
  // Rev. — detecção de colaboradores JF entre os destinatários do comunicado aberto
  // (duplicação do documento com a logo da JF + campo do Diretor JF no FCSign).
  const docFuncQ = trpc.comunicadosInternos.listarFuncionariosParaAssinatura.useQuery(
    { comunicadoId: viewComunicadoId || fcSignDialog?.id || 0, companyId, lista: "principal" },
    { enabled: (!!viewComunicadoId || fcSignDialog !== null) && companyId > 0, staleTime: 60_000 },
  );
  const temJfDest = (((docFuncQ.data as any)?.funcionarios || []) as any[]).some((f: any) => f.empregadorDocumentos === "JF");
  const assinarMut = trpc.comunicadosInternos.assinar.useMutation({
    onSuccess: () => {
      listaAssinaturaQuery.refetch();
      toast.success("Assinatura registrada");
      setSigningFuncionario(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const removerAssinaturaMut = trpc.comunicadosInternos.removerAssinatura.useMutation({
    onSuccess: () => { listaAssinaturaQuery.refetch(); toast.success("Assinatura removida"); },
    onError: (e) => toast.error(e.message),
  });

  // Rev. 2747 — Comunicado consome o template Vigente (comunicado_interno) quando existir.
  const comTplQ = trpc.systemDocumentTemplates.getVigente.useQuery({ tipo: "comunicado_interno" });
  // Rev. 4264 — funcionários para picker de emissor / destinatários (carrega quando dialog aberto)
  const funcionariosPickerQ = trpc.comunicadosInternos.listarFuncionariosSimples.useQuery(
    { companyId },
    { enabled: (showDialog || editId !== null) && companyId > 0, staleTime: 60_000 },
  );
  const funcionariosPicker = funcionariosPickerQ.data || [];
  const { data: comunicados = [], isLoading } = trpc.comunicadosInternos.listar.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const criarMut = trpc.comunicadosInternos.criar.useMutation({
    onSuccess: () => {
      utils.comunicadosInternos.listar.invalidate();
      toast.success("Comunicado criado");
      setShowDialog(false);
      setForm({ titulo: "", dataEmissao: new Date().toISOString().slice(0, 10), conteudo: "", setor: "", emissorNome: "", emissorCargo: "", destinatariosIds: [] });
    },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 4264 — solicita assinatura formal via FCSign
  const solicitarFCSignMut = trpc.comunicadosInternos.solicitarAssinaturaFCSign.useMutation({
    onSuccess: (data: any) => {
      utils.comunicadosInternos.listar.invalidate();
      toast.success("Convites FCSign enviados! Os links de assinatura estão disponíveis para cópia.");
      const base = window.location.origin;
      setFcSignLinks({
        emissor: `${base}${data.linkEmissor}`,
        emissorCel: fcSignCelular,
        diretoria: data.linkDiretoria ? `${base}${data.linkDiretoria}` : null,
        diretoriaCel: fcSignDirCelular,
        diretoriaJf: data.linkDiretoriaJf ? `${base}${data.linkDiretoriaJf}` : null,
        diretoriaJfCel: fcSignDirJfCelular,
      });
    },
    onError: (e) => toast.error(e.message),
  });
  const uploadMut = trpc.comunicadosInternos.uploadDoc.useMutation({
    onSuccess: (data, variables) => {
      utils.comunicadosInternos.listar.invalidate();
      toast.success("Documento anexado");
      setUploadingId(null);
      if (data.extractedText) {
        const currentCom = comunicados.find((c: any) => c.id === variables.id);
        const currentText = currentCom?.conteudo?.trim();
        if (!currentText) {
          atualizarMut.mutate({ id: variables.id, companyId, conteudo: data.extractedText });
          toast.success("Texto do documento preenchido automaticamente");
        } else {
          setPendingText({ id: variables.id, text: data.extractedText });
        }
      }
    },
    onError: (e) => { toast.error(e.message); setUploadingId(null); },
  });
  const removerAnexoMut = trpc.comunicadosInternos.removerAnexo.useMutation({
    onSuccess: () => { utils.comunicadosInternos.listar.invalidate(); toast.success("Anexo removido"); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarMut = trpc.comunicadosInternos.atualizar.useMutation({
    onSuccess: () => { utils.comunicadosInternos.listar.invalidate(); toast.success("Comunicado atualizado"); setEditId(null); },
    onError: (e) => toast.error(e.message),
  });
  const concluirMut = trpc.comunicadosInternos.concluir.useMutation({
    onSuccess: () => { utils.comunicadosInternos.listar.invalidate(); toast.success("Comunicado emitido — edição e exclusão bloqueadas"); },
    onError: (e) => toast.error(e.message),
  });
  const reverterMut = trpc.comunicadosInternos.reverter.useMutation({
    onSuccess: () => { utils.comunicadosInternos.listar.invalidate(); toast.success("Comunicado revertido para rascunho"); },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 4542 — Link público de leitura/ciência (WhatsApp) + download em PDF
  const gerarLinkMut = trpc.comunicadosInternos.gerarLinkLeitura.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfBaixando, setPdfBaixando] = useState(false);
  const baixarPdf = async (id: number, numero: string, titulo: string) => {
    if (pdfBaixando) return;
    setPdfBaixando(true);
    setPdfProgress(5);
    // Fase Puppeteer (não-determinística): progresso simulado até ~85%
    const timer = setInterval(() => setPdfProgress(p => (p < 85 ? p + 4 : p)), 350);
    try {
      const resp = await fetch(`/api/comunicado-pdf/${id}?companyId=${companyId}`, { credentials: "include" });
      if (!resp.ok) throw new Error(await resp.text().catch(() => "Erro ao gerar o PDF"));
      const blob = await resp.blob();
      setPdfProgress(100);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CI_${String(numero).replace(/\//g, "-")}_${titulo.replace(/[^a-zA-Z0-9À-ÿ ]/g, "-").replace(/\s+/g, "_").slice(0, 60)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success("PDF gerado — pronto para encaminhar no WhatsApp");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar o PDF");
    } finally {
      clearInterval(timer);
      setTimeout(() => { setPdfBaixando(false); setPdfProgress(0); }, 800);
    }
  };
  const copiarLinkCiencia = async (id: number) => {
    try {
      const { token } = await gerarLinkMut.mutateAsync({ id, companyId });
      const url = `${window.location.origin}/ciencia/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link de ciência copiado! Cole no grupo do WhatsApp.");
      } catch {
        window.prompt("Copie o link de ciência:", url);
      }
    } catch { /* onError já exibiu o toast */ }
  };
  const excluirMut = trpc.comunicadosInternos.excluir.useMutation({
    onSuccess: () => { utils.comunicadosInternos.listar.invalidate(); toast.success("Comunicado excluído"); },
    onError: (e) => toast.error(e.message),
  });

  const viewComunicado = useMemo(() => {
    if (viewComunicadoId === null) return null;
    return comunicados.find((c: any) => c.id === viewComunicadoId) || null;
  }, [comunicados, viewComunicadoId]);

  function getStatusEfetivo(c: any): "concluido" | "concluido_pendente" | "pendente_assinatura" | "rascunho" {
    const total = Number(c.totalDestinatarios ?? 0);
    const assinados = Number(c.totalAssinados ?? 0);
    if (c.status === "concluido") {
      if (total > 0 && assinados < total) return "concluido_pendente";
      return "concluido";
    }
    if (total > 0 && assinados < total) return "pendente_assinatura";
    return "rascunho";
  }

  const anos = useMemo(() => {
    const set = new Set<number>(comunicados.map((c: any) => c.ano));
    return Array.from(set).sort((a, b) => b - a);
  }, [comunicados]);

  const filtrados = useMemo(() => {
    const q = search.toLowerCase().trim();
    return comunicados.filter((c: any) => {
      if (anoFiltro !== "todos" && c.ano !== anoFiltro) return false;
      if (!q) return true;
      return c.numero.toLowerCase().includes(q) || c.titulo.toLowerCase().includes(q);
    });
  }, [comunicados, search, anoFiltro]);

  async function handleFileUpload(id: number, file: File) {
    setUploadingId(id);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMut.mutate({ id, companyId, fileBase64: base64, fileName: file.name });
    };
    reader.onerror = () => { toast.error("Erro ao ler arquivo"); setUploadingId(null); };
    reader.readAsDataURL(file);
  }

  // Rev. — Dialog FCSign extraído p/ constante: precisa renderizar TANTO na lista
  // quanto na visualização do comunicado (antes, clicar no botão dentro do comunicado
  // não abria nada porque o Dialog só existia no return da lista).
  const fcSignDialogNode = (
        <Dialog open={fcSignDialog !== null} onOpenChange={(open) => { if (!open) resetFcSign(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Send className="h-4 w-4 text-purple-600" />
                </div>
                Solicitar Assinatura FCSign
              </DialogTitle>
            </DialogHeader>
            {fcSignDialog && (
              <div className="space-y-4 py-1">
                <div className="bg-slate-50 rounded-lg p-3 text-sm">
                  <p className="font-semibold text-slate-700 truncate">CI Nº {fcSignDialog.numero} — {fcSignDialog.titulo}</p>
                  {fcSignDialog.emissorNome && <p className="text-slate-500 text-xs mt-0.5">Emissor: {fcSignDialog.emissorNome}</p>}
                </div>
                {fcSignLinks ? (
                  <div className="space-y-3">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700">
                      <p className="font-semibold mb-1">Links de assinatura gerados!</p>
                      <p>Envie por WhatsApp com um clique ou copie o link. Quem tinha e-mail informado também recebeu o convite por e-mail. Validade: 30 dias.</p>
                    </div>
                    {([["Link do Emissor", fcSignLinks.emissor, fcSignLinks.emissorCel], ...(fcSignLinks.diretoria ? [["Link da Diretoria FC", fcSignLinks.diretoria, fcSignLinks.diretoriaCel]] : []), ...(fcSignLinks.diretoriaJf ? [["Link da Diretoria JF", fcSignLinks.diretoriaJf, fcSignLinks.diretoriaJfCel]] : [])] as [string, string, string][]).map(([lbl, url, cel]) => (
                      <div key={lbl}>
                        <Label className="text-xs">{lbl}</Label>
                        <div className="flex gap-1.5 mt-1">
                          <Input readOnly className="text-xs h-8" value={url} onFocus={e => e.target.select()} />
                          <Button size="sm" variant="outline" className="h-8 shrink-0"
                            onClick={() => { navigator.clipboard.writeText(url).then(() => toast.success(`${lbl} copiado!`)).catch(() => toast.error("Não foi possível copiar — selecione e copie manualmente")); }}>
                            Copiar
                          </Button>
                          {cel.replace(/\D/g, "").length >= 10 && (
                            <Button size="sm" className="h-8 shrink-0 bg-green-600 hover:bg-green-700"
                              onClick={() => abrirWhatsApp(cel, url, fcSignDialog ? `CI Nº ${fcSignDialog.numero} — ${fcSignDialog.titulo}` : "Comunicado Interno")}>
                              WhatsApp
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-700">
                      <p className="font-semibold flex items-center gap-1.5 mb-1"><Mail className="h-3.5 w-3.5" /> Como funciona?</p>
                      <p>Informe e-mail e/ou celular de cada assinante. Com e-mail, o convite vai automaticamente; com celular, você envia o link por WhatsApp com um clique. Os links também ficam disponíveis para cópia. Validade: 30 dias.</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-600">Emissor Responsável *</p>
                      <div>
                        <Label className="text-xs">E-mail</Label>
                        <Input type="email" className="mt-1" placeholder="nome@fcengenharia.com.br" value={fcSignEmail} onChange={e => setFcSignEmail(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Celular (WhatsApp)</Label>
                        <Input type="tel" inputMode="tel" className="mt-1" placeholder="(12) 99999-9999" value={fcSignCelular} onChange={e => setFcSignCelular(e.target.value)} />
                      </div>
                    </div>
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-xs font-semibold text-slate-600">Assinatura da Diretoria — FC (opcional)</p>
                      <div>
                        <Label className="text-xs">Nome do Diretor(a)</Label>
                        <Input className="mt-1" placeholder="Ex.: FELIPE COSTA ALVES" value={fcSignDirNome} onChange={e => setFcSignDirNome(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">E-mail</Label>
                        <Input type="email" className="mt-1" placeholder="diretoria@fcengenharia.com.br" value={fcSignDirEmail} onChange={e => setFcSignDirEmail(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Celular (WhatsApp)</Label>
                        <Input type="tel" inputMode="tel" className="mt-1" placeholder="(12) 99999-9999" value={fcSignDirCelular} onChange={e => setFcSignDirCelular(e.target.value)} />
                      </div>
                    </div>
                    {temJfDest && (
                      <div className="border-t pt-3 space-y-2">
                        <p className="text-xs font-semibold text-slate-600">Assinatura da Diretoria — Julio Ferraz (opcional)</p>
                        <p className="text-[11px] text-slate-400 -mt-1">Este comunicado tem colaboradores da JF entre os destinatários.</p>
                        <div>
                          <Label className="text-xs">Nome do Diretor(a)</Label>
                          <Input className="mt-1" placeholder="Ex.: JULIO CESAR FERRAZ DE ARAUJO" value={fcSignDirJfNome} onChange={e => setFcSignDirJfNome(e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-xs">E-mail</Label>
                          <Input type="email" className="mt-1" placeholder="diretoria@julioferraz.com.br" value={fcSignDirJfEmail} onChange={e => setFcSignDirJfEmail(e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-xs">Celular (WhatsApp)</Label>
                          <Input type="tel" inputMode="tel" className="mt-1" placeholder="(12) 99999-9999" value={fcSignDirJfCelular} onChange={e => setFcSignDirJfCelular(e.target.value)} />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <DialogFooter>
              {fcSignLinks ? (
                <Button variant="outline" onClick={resetFcSign}>Fechar</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={resetFcSign}>Cancelar</Button>
                  <Button
                    className="bg-purple-600 hover:bg-purple-700"
                    disabled={solicitarFCSignMut.isPending || docFuncQ.isLoading || (!fcSignEmail.trim() && fcSignCelular.replace(/\D/g, "").length < 10)}
                    onClick={() => {
                      if (!fcSignDialog) return;
                      if (!fcSignEmail.trim() && fcSignCelular.replace(/\D/g, "").length < 10) { toast.error("Informe e-mail ou celular do emissor"); return; }
                      const dirContato = !!fcSignDirEmail.trim() || fcSignDirCelular.replace(/\D/g, "").length >= 10;
                      if (dirContato && !fcSignDirNome.trim()) { toast.error("Informe o nome do diretor(a) FC"); return; }
                      const dirJfContato = temJfDest && (!!fcSignDirJfEmail.trim() || fcSignDirJfCelular.replace(/\D/g, "").length >= 10);
                      if (dirJfContato && !fcSignDirJfNome.trim()) { toast.error("Informe o nome do diretor(a) JF"); return; }
                      solicitarFCSignMut.mutate({
                        id: fcSignDialog.id, companyId,
                        emissorEmail: fcSignEmail.trim() || undefined,
                        diretoriaNome: fcSignDirNome.trim() || undefined,
                        diretoriaEmail: fcSignDirEmail.trim() || undefined,
                        incluirDiretoria: dirContato && !!fcSignDirNome.trim(),
                        diretoriaJfNome: temJfDest ? (fcSignDirJfNome.trim() || undefined) : undefined,
                        diretoriaJfEmail: dirJfContato ? (fcSignDirJfEmail.trim() || undefined) : undefined,
                        incluirDiretoriaJf: dirJfContato && !!fcSignDirJfNome.trim(),
                      });
                    }}
                  >
                    {solicitarFCSignMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                    Gerar Links de Assinatura
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
  );

  // Rev. 2079 — Sub-view "Lista para Assinatura" (precede o viewComunicado).
  if (listaAssinaturaId) {
    const comAtual = comunicados.find((c: any) => c.id === listaAssinaturaId) || null;
    const data = listaAssinaturaQuery.data;
    const funcionarios = data?.funcionarios || [];
    const totalAtivos = data?.totalAtivos || 0;
    const totalAssinados = data?.totalAssinados || 0;
    const pct = totalAtivos > 0 ? Math.round((totalAssinados / totalAtivos) * 100) : 0;
    const nomeEmpresa = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "FC ENGENHARIA PROJETOS E CONSULTORIA LTDA";
    const cnpj = selectedCompany?.cnpj || "";
    const logoUrl = selectedCompany?.logoUrl;
    const q = searchFunc.toLowerCase().trim();
    const obrasDisponiveis: string[] = Array.from(
      new Set(funcionarios.map((f: any) => f.obraNome).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const temFuncSemObra = funcionarios.some((f: any) => !f.obraNome);
    const temFiltro = !!q || !!filtroObra || filtroAssinatura !== "todos";
    const filtradosFunc = funcionarios.filter((f: any) => {
      if (q) {
        const codigoExib = f.codigoInterno || "";
        const match =
          (f.nomeCompleto || "").toLowerCase().includes(q) ||
          codigoExib.toLowerCase().includes(q) ||
          (f.cargo || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filtroObra) {
        if (filtroObra === "__sem__") { if (f.obraNome) return false; }
        else if (f.obraNome !== filtroObra) return false;
      }
      if (filtroAssinatura === "assinados" && !f.assinatura) return false;
      if (filtroAssinatura === "pendentes" && f.assinatura) return false;
      return true;
    });
    // Rev. 4985 — separa a lista por EMPREGADOR documental: colaboradores
    // marcados como "JF" saem numa lista própria da Julio Ferraz. Se não houver
    // nenhum JF, permanece uma lista única (comportamento original).
    const funcJF = filtradosFunc.filter((f: any) => f.empregadorDocumentos === "JF");
    const funcFC = filtradosFunc.filter((f: any) => f.empregadorDocumentos !== "JF");
    const grupos: { key: string; nomeEmpresa: string; cnpj: string; logoUrl?: string | null; list: any[] }[] =
      funcJF.length > 0
        ? [
            { key: "FC", nomeEmpresa, cnpj, logoUrl, list: funcFC },
            {
              key: "JF",
              nomeEmpresa: (jfEmpresa as any)?.razaoSocial || (jfEmpresa as any)?.nomeFantasia || "JULIO FERRAZ PROJETOS E OBRAS LTDA",
              cnpj: (jfEmpresa as any)?.cnpj || "03.426.403/0001-95",
              logoUrl: (jfEmpresa as any)?.logoUrl || null,
              list: funcJF,
            },
          ].filter(g => g.list.length > 0)
        : [{ key: "FC", nomeEmpresa, cnpj, logoUrl, list: filtradosFunc }];
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 p-6">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            .lista-assinatura-print, .lista-assinatura-print * { visibility: visible; }
            .lista-assinatura-print { position: absolute; left: 0; top: 0; width: 100%; }
            .no-print { display: none !important; }
            @page { size: A4 portrait; margin: 14mm 10mm; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            thead { display: table-header-group; }
          }
        `}</style>
        <div className="max-w-6xl mx-auto">
          {/* Toolbar topo (não imprime) */}
          <div className="flex items-center gap-3 mb-4 flex-wrap no-print">
            <Button variant="ghost" size="sm" onClick={() => { setListaAssinaturaId(null); setSearchFunc(""); setFiltroObra(""); setFiltroAssinatura("todos"); setListaTipo("principal"); }}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar ao Comunicado
            </Button>
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center shadow">
              <ClipboardSignature className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <h2 className="text-lg font-bold text-slate-800 leading-tight">
                {listaTipo === "complementar" ? "Lista Complementar de Assinatura" : "Lista para Assinatura"}
              </h2>
              <p className="text-xs text-slate-500">Comunicado {comAtual?.numero} — {comAtual?.titulo}</p>
            </div>
            <Button
              variant={listaTipo === "complementar" ? "default" : "outline"}
              size="sm"
              className={listaTipo === "complementar" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-300 text-amber-700 hover:bg-amber-50"}
              onClick={() => { setListaTipo(listaTipo === "complementar" ? "principal" : "complementar"); setSearchFunc(""); setFiltroObra(""); setFiltroAssinatura("todos"); }}
            >
              <Users className="h-4 w-4 mr-1" />
              {listaTipo === "complementar" ? "Voltar à Lista Principal" : "Lista Complementar"}
            </Button>
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
              <button onClick={() => setAssinaturaMode("digital")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition ${assinaturaMode === "digital" ? "bg-indigo-600 text-white shadow" : "text-slate-600 hover:bg-slate-100"}`}>
                <MonitorSmartphone className="h-3.5 w-3.5" /> Assinatura Digital
              </button>
              <button onClick={() => setAssinaturaMode("imprimir")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition ${assinaturaMode === "imprimir" ? "bg-indigo-600 text-white shadow" : "text-slate-600 hover:bg-slate-100"}`}>
                <Printer className="h-3.5 w-3.5" /> Imprimir e Colher
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => {
              const oldTitle = document.title;
              document.title = `${listaTipo === "complementar" ? "Lista Complementar" : "Lista Assinatura"} - Comunicado ${comAtual?.numero}`;
              window.print();
              setTimeout(() => { document.title = oldTitle; }, 500);
            }}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir Lista
            </Button>
          </div>

          {/* KPIs (não imprime) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 no-print">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 mb-1">
                <Users className="h-3.5 w-3.5" /> {listaTipo === "complementar" ? "Pendentes (Lista Complementar)" : "Funcionários Ativos"}
              </div>
              <div className="text-2xl font-bold text-slate-800">{totalAtivos}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 mb-1">
                <Signature className="h-3.5 w-3.5" /> Já Assinaram
              </div>
              <div className="text-2xl font-bold text-emerald-600">{totalAssinados}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Cobertura</div>
              <div className="text-2xl font-bold text-indigo-600">{pct}%</div>
              <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>

          {/* Busca + filtros (não imprime) */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 mb-3 no-print">
            <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input className="pl-9" placeholder="Buscar por nome, matrícula ou cargo..." value={searchFunc} onChange={(e) => setSearchFunc(e.target.value)} />
              </div>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <select
                  value={filtroObra}
                  onChange={(e) => setFiltroObra(e.target.value)}
                  className="h-9 w-full lg:w-56 pl-9 pr-7 rounded-md border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 appearance-none"
                >
                  <option value="">Todas as obras</option>
                  {obrasDisponiveis.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                  {temFuncSemObra && <option value="__sem__">Sem obra</option>}
                </select>
              </div>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <select
                  value={filtroAssinatura}
                  onChange={(e) => setFiltroAssinatura(e.target.value as "todos" | "assinados" | "pendentes")}
                  className="h-9 w-full lg:w-48 pl-9 pr-7 rounded-md border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 appearance-none"
                >
                  <option value="todos">Todos</option>
                  <option value="assinados">Quem assinou</option>
                  <option value="pendentes">Quem falta assinar</option>
                </select>
              </div>
              {temFiltro && (
                <Button variant="ghost" size="sm" className="text-slate-500 shrink-0"
                  onClick={() => { setSearchFunc(""); setFiltroObra(""); setFiltroAssinatura("todos"); }}>
                  <X className="h-4 w-4 mr-1" /> Limpar
                </Button>
              )}
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              Exibindo <span className="font-semibold text-slate-700">{filtradosFunc.length}</span> de {funcionarios.length} colaborador(es).
            </div>
          </div>

          {/* AREA IMPRIMÍVEL — Rev. 4985: uma lista por EMPREGADOR documental (FC/JF) */}
          <div className="lista-assinatura-print bg-white rounded-xl shadow-sm border border-slate-200 p-6 print:border-0 print:shadow-none print:rounded-none print:p-0">
            {listaAssinaturaQuery.isLoading ? (
              <div className="p-12 text-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
            ) : filtradosFunc.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500">{temFiltro ? "Nenhum funcionário corresponde aos filtros" : listaTipo === "complementar" ? "Nenhum colaborador admitido após a emissão com assinatura pendente" : "Nenhum funcionário ativo nesta empresa"}</p>
              </div>
            ) : grupos.map((g, gi) => (
            <div key={g.key} className={gi > 0 ? "mt-8 pt-6 border-t-4 border-double border-slate-300" : ""} style={gi > 0 ? { pageBreakBefore: "always" } : undefined}>
            {/* Cabeçalho da lista (imprime) */}
            <div className="mb-4 pb-4 border-b border-slate-200">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  {g.logoUrl ? (
                    <img src={g.logoUrl} alt={g.nomeEmpresa} className="h-12 w-auto max-w-[150px] object-contain object-left shrink-0" style={{ height: 48, maxWidth: 150, width: "auto", objectFit: "contain" }} onError={(e: any) => e.target.style.display = 'none'} />
                  ) : (
                    <img src="/fc-logo.png" alt="FC" className="h-12 w-auto max-w-[150px] object-contain object-left shrink-0" style={{ height: 48, maxWidth: 150, width: "auto", objectFit: "contain" }} onError={(e: any) => e.target.style.display = 'none'} />
                  )}
                  <div>
                    <h3 className="text-sm font-bold text-[#1B2A4A]">{g.nomeEmpresa}</h3>
                    {g.cnpj && <p className="text-[10px] text-slate-500">CNPJ: {g.cnpj}</p>}
                  </div>
                </div>
                <div className="text-right text-[10px] text-slate-500">
                  <p>Gerado em: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}</p>
                  <p>Colaboradores desta lista: <span className="font-semibold text-slate-700">{g.list.length}</span></p>
                </div>
              </div>
              <div className="bg-[#1B2A4A] text-white py-2 px-3 text-center rounded-sm">
                <span className="text-xs font-bold tracking-wider">
                  {listaTipo === "complementar" ? "LISTA COMPLEMENTAR DE CIÊNCIA" : "LISTA DE CIÊNCIA"} — COMUNICADO INTERNO Nº {comAtual?.numero}
                  {grupos.length > 1 ? ` — ${g.key === "JF" ? "JULIO FERRAZ" : "FC ENGENHARIA"}` : ""}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-700">
                <p><span className="font-semibold">Assunto:</span> {comAtual?.titulo}</p>
                <p><span className="font-semibold">Data de Emissão:</span> {formatDateBR(comAtual?.dataEmissao || "")}</p>
                {listaTipo === "complementar" && (
                  <p className="mt-1 text-[10px] font-semibold text-amber-700">
                    Lista complementar: colaboradores admitidos APÓS a data de emissão do comunicado e que ainda não colheram assinatura.
                  </p>
                )}
                <p className="mt-1 text-[10px] text-slate-500 italic">
                  Declaro que recebi, li e estou ciente do conteúdo do comunicado acima identificado.
                </p>
              </div>
            </div>

            {(
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-slate-50 print:bg-slate-100">
                  <tr className="border-b-2 border-slate-300">
                    <th className="text-left px-2 py-2 font-bold text-slate-700 w-10">#</th>
                    <th className="text-left px-2 py-2 font-bold text-slate-700 w-20">N° Interno</th>
                    <th className="text-left px-2 py-2 font-bold text-slate-700">Nome do Colaborador</th>
                    <th className="text-left px-2 py-2 font-bold text-slate-700 hidden sm:table-cell w-32">Cargo</th>
                    <th className="text-left px-2 py-2 font-bold text-slate-700" style={{ width: assinaturaMode === "digital" ? "260px" : "300px" }}>
                      Assinatura {assinaturaMode === "imprimir" && <span className="text-[9px] text-slate-400 font-normal">(assine no espaço)</span>}
                    </th>
                    <th className="text-left px-2 py-2 font-bold text-slate-700 w-24 hidden sm:table-cell">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {g.list.map((f: any, idx: number) => {
                    const assinou = !!f.assinatura;
                    return (
                      <tr key={f.id} className={`border-b border-slate-200 ${assinou ? "bg-emerald-50/30 print:bg-white" : ""}`}>
                        <td className="px-2 py-2 text-slate-500 align-top">{idx + 1}</td>
                        <td className="px-2 py-2 text-slate-700 font-mono align-top">{f.codigoInterno || "—"}</td>
                        <td className="px-2 py-2 text-slate-800 font-medium align-top">
                          {f.nomeCompleto}
                          <div className="text-[10px] font-semibold text-indigo-600 flex items-center gap-1">
                            <Building2 className="h-2.5 w-2.5 shrink-0" />
                            {f.obraNome || "Sem obra"}
                          </div>
                          <div className="text-[9px] text-slate-400 print:hidden">CPF: {formatCPF(f.cpf)}</div>
                        </td>
                        <td className="px-2 py-2 text-slate-600 hidden sm:table-cell align-top">{f.cargo || f.funcao || "-"}</td>
                        <td className="px-2 py-2 align-top">
                          {assinaturaMode === "imprimir" ? (
                            // Linha em branco pra assinar manualmente
                            <div className="border-b-2 border-slate-400 h-10" />
                          ) : assinou ? (
                            <div className="flex items-center gap-2">
                              <div className="border border-slate-200 rounded bg-white p-1 flex-1 min-h-[44px] flex items-center justify-center overflow-hidden">
                                {f.assinatura.tipo === "ciencia_online" || f.assinatura.assinaturaBase64 === "ciencia_online" ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <CheckCircle2 className="h-3 w-3" /> Ciência online ✓
                                  </span>
                                ) : (
                                  <img src={f.assinatura.assinaturaBase64} alt={`Assinatura ${f.nomeCompleto}`} className="max-h-10 max-w-full object-contain" />
                                )}
                              </div>
                              <div className="flex flex-col gap-1 no-print">
                                <button title="Re-assinar" className="text-blue-600 hover:bg-blue-50 rounded p-1"
                                  onClick={() => setSigningFuncionario({ id: f.id, nome: f.nomeCompleto, initial: f.assinatura?.assinaturaBase64 })}>
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button title="Remover assinatura" className="text-red-600 hover:bg-red-50 rounded p-1"
                                  onClick={() => { if (confirm(`Remover a assinatura de ${f.nomeCompleto}?`)) removerAssinaturaMut.mutate({ comunicadoId: listaAssinaturaId, companyId, employeeId: f.id }); }}>
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button size="sm" variant="outline" className="h-8 text-[10px] border-indigo-300 text-indigo-700 hover:bg-indigo-50 no-print"
                                onClick={() => setSigningFuncionario({ id: f.id, nome: f.nomeCompleto, initial: null })}>
                                <Signature className="h-3 w-3 mr-1" /> Assinar
                              </Button>
                              {f.visualizadoEm && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 no-print"
                                  title={`Visualizou o comunicado pelo link em ${formatDateTime(f.visualizadoEm)}`}>
                                  <Eye className="h-2.5 w-2.5" /> visualizou {formatDate(f.visualizadoEm).slice(0, 5)}
                                </span>
                              )}
                            </div>
                          )}
                          {assinaturaMode === "digital" && !assinou && (
                            <div className="hidden print:block border-b-2 border-slate-400 h-10" />
                          )}
                        </td>
                        <td className="px-2 py-2 text-[10px] text-slate-500 hidden sm:table-cell align-top">
                          {assinou ? new Date(f.assinatura.assinadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "___ /___ /______"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            </div>
            ))}

            <div className="mt-6 pt-4 border-t border-slate-200 text-[9px] text-slate-400 flex justify-between">
              <span>Documento gerado pelo ERP — Lista de Ciência</span>
              <span>{totalAssinados} de {totalAtivos} colaborador(es) com assinatura registrada</span>
            </div>
          </div>
        </div>

        {/* Modal SignaturePad */}
        <Dialog open={!!signingFuncionario} onOpenChange={(open) => { if (!open) setSigningFuncionario(null); }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Signature className="h-5 w-5 text-indigo-600" />
                Assinatura Digital — {signingFuncionario?.nome}
              </DialogTitle>
            </DialogHeader>
            {signingFuncionario && (
              <SignaturePad
                key={signingFuncionario.id}
                initial={signingFuncionario.initial || null}
                employeeName={signingFuncionario.nome}
                onCancel={() => setSigningFuncionario(null)}
                onSave={(dataUrl) => assinarMut.mutate({
                  comunicadoId: listaAssinaturaId,
                  companyId,
                  employeeId: signingFuncionario.id,
                  assinaturaBase64: dataUrl,
                })}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (viewComunicado) {
    const c = viewComunicado;
    const isConcluido = c.status === "concluido";
    const _totalDestView = Number((c as any).totalDestinatarios ?? 0);
    const _totalAssView = Number((c as any).totalAssinados ?? 0);
    const _pctView = _totalDestView > 0 ? Math.round((_totalAssView / _totalDestView) * 100) : 0;
    const _hasPendingSignatures = _totalDestView > 0 && _totalAssView < _totalDestView;
    const _signPending = !isConcluido && _hasPendingSignatures;
    const nomeEmpresa = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "FC ENGENHARIA PROJETOS E CONSULTORIA LTDA";
    const cnpj = selectedCompany?.cnpj || "";
    const logoUrl = selectedCompany?.logoUrl;
    const endereco = selectedCompany?.endereco || "";
    const cidade = selectedCompany?.cidade || "";
    const estado = selectedCompany?.estado || "";
    // Rev. — quando há colaboradores JF entre os destinatários, o comunicado sai em
    // DUAS vias (FC e Julio Ferraz), cada uma com sua logo/CNPJ e seu diretor —
    // mesma regra da Lista de Ciência.
    const empresasDoc: Array<{ key: string; nome: string; cnpj: string; logoUrl: string | null; enderecoLinha: string; diretorNome: string }> = [
      { key: "fc", nome: nomeEmpresa, cnpj, logoUrl: logoUrl || null, enderecoLinha: [endereco, cidade, estado].filter(Boolean).join(" - "), diretorNome: temJfDest ? "FELIPE COSTA ALVES" : "" },
    ];
    if (temJfDest && jfEmpresa) {
      empresasDoc.push({
        key: "jf",
        nome: jfEmpresa.razaoSocial || jfEmpresa.nomeFantasia || "JULIO FERRAZ",
        cnpj: jfEmpresa.cnpj || "",
        logoUrl: (jfEmpresa as any).logoUrl || null,
        enderecoLinha: [(jfEmpresa as any).endereco, (jfEmpresa as any).cidade, (jfEmpresa as any).estado].filter(Boolean).join(" - "),
        diretorNome: "JULIO CESAR FERRAZ DE ARAUJO",
      });
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
        {fcSignDialogNode}
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4 print:hidden flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setViewComunicadoId(null)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            {isConcluido && !_hasPendingSignatures && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                <Lock className="h-3 w-3" /> Concluído
              </span>
            )}
            {c.fcsignEnvelopeId && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                <UserCheck className="h-3 w-3" /> FCSign Enviado
              </span>
            )}
            <div className="flex-1" />
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${_hasPendingSignatures ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-green-50 text-green-700 border-green-200"}`}>
              {_hasPendingSignatures ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              {_totalAssView}/{_totalDestView} assinaram ({_pctView}%)
            </span>
            {!isConcluido && (
              <Button size="sm"
                className="bg-green-600 hover:bg-green-700"
                disabled={concluirMut.isPending}
                title={_signPending ? `Assinaturas seguem sendo coletadas após a emissão (${_totalAssView} de ${_totalDestView} assinaram)` : ""}
                onClick={() => { if (confirm("Emitir este comunicado? Após emitido, ele NÃO poderá mais ser editado ou excluído. As assinaturas continuam sendo coletadas normalmente.")) concluirMut.mutate({ id: c.id, companyId }); }}>
                {concluirMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Emitir Comunicado
              </Button>
            )}
            <Button size="sm" variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50"
              onClick={() => {
                if (c.fcsignEnvelopeId && !confirm("Já existe um pacote FCSign enviado para este comunicado. Deseja enviar um novo pacote para todos os destinatários?")) return;
                abrirFcSignDialog(c);
              }}>
              <Send className="h-4 w-4 mr-1" /> {c.fcsignEnvelopeId ? "Reenviar FCSign" : "Solicitar Assinatura FCSign"}
            </Button>
            {isConcluido && isAdminMaster && (
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" disabled={reverterMut.isPending}
                onClick={() => { if (confirm("Reverter este comunicado para rascunho? Ele poderá ser editado novamente.")) reverterMut.mutate({ id: c.id, companyId }); }}>
                {reverterMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                Reverter
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => {
              const oldTitle = document.title;
              document.title = `Comunicado ${c.numero} - ${c.titulo}`;
              window.print();
              setTimeout(() => { document.title = oldTitle; }, 500);
            }}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir
            </Button>
            <Button variant="outline" size="sm" disabled={pdfBaixando}
              className="relative overflow-hidden border-slate-300"
              onClick={() => baixarPdf(c.id, c.numero, c.titulo)}>
              {pdfBaixando && (
                <span className="absolute inset-0 bg-slate-900/10 transition-all duration-300" style={{ width: `${pdfProgress}%` }} />
              )}
              <span className="relative flex items-center">
                {pdfBaixando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
                {pdfBaixando ? `Gerando PDF... ${pdfProgress}%` : "Baixar PDF"}
              </span>
            </Button>
            <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              disabled={gerarLinkMut.isPending}
              title="Gera um link público: o funcionário se identifica com CPF + data de nascimento, lê o comunicado e confirma ciência com 1 clique"
              onClick={() => copiarLinkCiencia(c.id)}>
              {gerarLinkMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Link de Ciência
            </Button>
            <Button variant="outline" size="sm" className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              onClick={() => { setListaAssinaturaId(c.id); setAssinaturaMode("digital"); }}>
              <ClipboardSignature className="h-4 w-4 mr-1" /> Lista para Assinatura
            </Button>
            {c.documentoUrl && (
              <>
                <Button variant="outline" size="sm" onClick={() => window.open(c.documentoUrl, '_blank')}>
                  <FileText className="h-4 w-4 mr-1" /> Ver Anexo
                </Button>
                {!isConcluido && (
                  <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50" disabled={removerAnexoMut.isPending}
                    onClick={() => { if (confirm("Remover o anexo deste comunicado?")) removerAnexoMut.mutate({ id: c.id, companyId }); }}>
                    {removerAnexoMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <X className="h-4 w-4 mr-1" />}
                    Remover Anexo
                  </Button>
                )}
              </>
            )}
            {!c.documentoUrl && !isConcluido && (
              <label className="cursor-pointer">
                <Button variant="outline" size="sm" asChild>
                  <span><Upload className="h-4 w-4 mr-1" /> Anexar Arquivo</span>
                </Button>
                <input type="file" className="hidden" accept=".pdf,.doc,.docx"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(c.id, f); }} />
              </label>
            )}
          </div>

          {empresasDoc.map((emp, empIdx) => (
          <div key={emp.key} className={`comunicado-print-area bg-white border rounded-lg p-8 max-w-3xl mx-auto print:border-0 print:shadow-none print:p-4 print:max-w-none ${empIdx > 0 ? "mt-6" : ""}`} style={empIdx < empresasDoc.length - 1 ? { breakAfter: "page", pageBreakAfter: "always" } : undefined}>
            <div className="mb-6">
              <div className="flex flex-col items-center justify-center mb-4">
                {emp.logoUrl ? (
                  <img src={emp.logoUrl} alt={emp.nome} className="h-16 mb-2 object-contain" onError={(e: any) => e.target.style.display = 'none'} />
                ) : (
                  <img src="/fc-logo.png" alt="FC Engenharia" className="h-16 mb-2 object-contain" onError={(e: any) => e.target.style.display = 'none'} />
                )}
                <h2 className="text-lg font-bold text-[#1B2A4A] tracking-wide text-center">
                  {emp.nome}
                </h2>
                {emp.cnpj && <p className="text-[10px] text-gray-500">CNPJ: {emp.cnpj}</p>}
                {emp.enderecoLinha && (
                  <p className="text-[10px] text-gray-400">
                    {emp.enderecoLinha}
                  </p>
                )}
              </div>

              <div className="bg-[#1B2A4A] text-white py-2.5 px-4 text-center rounded-sm">
                <span className="text-sm font-bold tracking-wider">COMUNICADO INTERNO</span>
              </div>

              <div className="flex justify-between mt-3 text-[11px] text-gray-600 px-1">
                <div>
                  <span className="font-semibold text-[#1B2A4A]">Nº {c.numero}</span>
                </div>
                <div className="text-right">
                  <span>Data de Emissão: {formatDateBR(c.dataEmissao)}</span>
                </div>
              </div>
            </div>

            <div className="border border-gray-300 rounded p-4 mb-6">
              <div className="mb-3">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Assunto:</span>
                <h3 className="text-base font-bold text-[#1B2A4A] mt-0.5">{c.titulo}</h3>
              </div>
            </div>

            <div className="border border-gray-200 rounded p-6 mb-6 min-h-[200px]">
              {(() => {
                // Rev. 2747 — quando há template Vigente (comunicado_interno), o corpo é
                // montado a partir dele (renderTemplate). {{corpoMsg}} recebe o conteúdo do
                // comunicado; comunicado é company-wide, então {{empNome}} fica vazio. Sem
                // Vigente, cai no render atual EXATO (fallback).
                const comVigente = comTplQ.data?.vigente ? comTplQ.data.conteudoHtml : null;
                if (comVigente && c.conteudo) {
                  const escC = (s: any) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" } as any)[ch]);
                  const corpoMsg = isHtmlContent(c.conteudo) ? c.conteudo : escC(c.conteudo).replace(/\n/g, "<br/>");
                  const rendered = renderTemplate(comVigente, {
                    empNome: "", corpoMsg, assunto: escC(c.titulo || ""),
                    empresaRazaoSocial: escC(emp.nome), empresaCnpj: escC(emp.cnpj),
                    docNumero: escC(String(c.numero || "")), docData: escC(formatDateBR(c.dataEmissao)),
                  });
                  return (
                    <div
                      className="comunicado-conteudo prose prose-sm max-w-none text-gray-800 leading-relaxed prose-headings:text-[#1B2A4A] prose-p:my-2"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(rendered) }}
                    />
                  );
                }
                return c.conteudo ? (
                  isHtmlContent(c.conteudo) ? (
                    <div
                      className="comunicado-conteudo prose prose-sm max-w-none text-gray-800 leading-relaxed prose-headings:text-[#1B2A4A] prose-p:my-2"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.conteudo) }}
                    />
                  ) : (
                    <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{c.conteudo}</div>
                  )
                ) : null;
              })()}
            </div>

            {/* Assinaturas — 1 bloco se emissor é da Direção/Sócio, 2 blocos caso contrário */}
            {(() => {
              const cargoLower = ((c as any).emissorCargo || "").toLowerCase();
              const setorLower = ((c as any).setor || "").toLowerCase();
              const ehDirecao = setorLower === "diretoria" || setorLower.includes("diretor")
                || cargoLower.includes("diretor") || cargoLower.includes("sócio")
                || cargoLower.includes("socio") || cargoLower.includes("administrador")
                || cargoLower.includes("ceo") || cargoLower.includes("presidente");
              return (
                <div className="mt-12 pt-6">
                  <div className={`flex gap-12 ${ehDirecao ? "justify-center" : "justify-between"}`}>
                    <div className={`text-center ${ehDirecao ? "w-72" : "flex-1"}`}>
                      {(c.emissorNome || c.criadoPor) && (
                        <p className="text-xs font-semibold text-[#1B2A4A] mb-1 mx-4">{(c as any).emissorNome || c.criadoPor}</p>
                      )}
                      <div className="border-t border-gray-400 pt-2 mx-4">
                        {(c as any).emissorCargo && <p className="text-[10px] text-gray-600 font-medium">{(c as any).emissorCargo}</p>}
                        <p className="text-[10px] text-gray-500">{(c as any).setor || "Departamento de Recursos Humanos"}</p>
                      </div>
                    </div>
                    {!ehDirecao && (
                      <div className="flex-1 text-center">
                        <p className="text-xs font-semibold text-[#1B2A4A] mb-1 mx-4">{emp.diretorNome || "\u00a0"}</p>
                        <div className="border-t border-gray-400 pt-2 mx-4">
                          <p className="text-[10px] text-gray-500">Direção</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="mt-8 pt-4 border-t border-gray-200 flex justify-between text-[9px] text-gray-400">
              <span>Documento gerado pelo ERP - Gestão Integrada</span>
              <span>
                Emitido em: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                {c.criadoPor ? ` | Por: ${c.criadoPor}` : ""}
              </span>
            </div>
          </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/painel/rh")}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg">
            <Megaphone className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Comunicados Internos</h1>
            <p className="text-sm text-slate-500">Numeração automática por ano (ex: 001/{new Date().getFullYear()})</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 mb-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Buscar por número ou título..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="border rounded-md px-3 py-2 text-sm" value={String(anoFiltro)} onChange={e => setAnoFiltro(e.target.value === "todos" ? "todos" : Number(e.target.value))}>
              <option value="todos">Todos os anos</option>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <Button onClick={() => setShowDialog(true)} className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-1" /> Novo Comunicado</Button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : filtrados.length === 0 ? (
            <div className="p-12 text-center">
              <Megaphone className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">Nenhum comunicado encontrado</p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[calc(100vh-220px)]">
              <table className="w-full text-sm table-fixed">
                <thead className="bg-slate-50 border-b sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-28">Nº</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Título</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-48">Status / Assinaturas</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-28">Data</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-36">Documento</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600 w-36">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c: any) => {
                    const isConcluido = c.status === "concluido";
                    const statusEf = getStatusEfetivo(c);
                    const totalDest = Number(c.totalDestinatarios ?? 0);
                    const totalAss = Number(c.totalAssinados ?? 0);
                    const pct = totalDest > 0 ? Math.round((totalAss / totalDest) * 100) : 0;
                    return (
                      <tr key={c.id} className={`border-b hover:bg-slate-50 ${statusEf === "concluido" ? "bg-green-50/30" : (statusEf === "pendente_assinatura" || statusEf === "concluido_pendente") ? "bg-amber-50/30" : ""}`}>
                        <td className="px-4 py-3 font-mono font-bold text-blue-700">{c.numero}</td>
                        <td className="px-4 py-3 overflow-hidden max-w-0">
                          <div className="font-medium text-slate-800 truncate">{c.titulo}</div>
                          {c.conteudo && (() => {
                            const preview = stripHtml(c.conteudo);
                            return preview ? <div className="text-xs text-slate-500 truncate">{preview.length > 100 ? preview.substring(0, 100) + "..." : preview}</div> : null;
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {statusEf === "concluido" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 w-fit">
                                <Lock className="h-2.5 w-2.5" /> Concluído
                              </span>
                            ) : statusEf === "concluido_pendente" ? (
                              <button
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 w-fit hover:bg-amber-200 transition-colors cursor-pointer"
                                title="Ver quem falta assinar"
                                onClick={() => { setListaAssinaturaId(c.id); setFiltroAssinatura("pendentes"); }}>
                                <Clock className="h-2.5 w-2.5" /> Assinaturas Pendentes
                              </button>
                            ) : statusEf === "pendente_assinatura" ? (
                              <button
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 w-fit hover:bg-amber-200 transition-colors cursor-pointer"
                                title="Ver quem falta assinar"
                                onClick={() => { setListaAssinaturaId(c.id); setFiltroAssinatura("pendentes"); }}>
                                <Clock className="h-2.5 w-2.5" /> Pendente por Assinatura
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 w-fit">
                                Rascunho
                              </span>
                            )}
                            {totalDest > 0 && (
                              <div>
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[10px] text-slate-500">{totalAss}/{totalDest} assinaram</span>
                                  <span className="text-[10px] font-bold" style={{ color: pct === 100 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626" }}>{pct}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden w-32">
                                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? "#16a34a" : pct >= 50 ? "#d97706" : "#ef4444" }} />
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{new Date(c.dataEmissao + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                        <td className="px-4 py-3">
                          {c.documentoUrl ? (
                            <div className="flex items-center gap-1">
                              <a href={c.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                                <FileText className="h-3 w-3 flex-shrink-0" /> <span className="truncate">{c.fileName || "Ver"}</span>
                              </a>
                              {!isConcluido && (
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:bg-red-50" title="Remover anexo"
                                  disabled={removerAnexoMut.isPending}
                                  onClick={() => { if (confirm("Remover o anexo?")) removerAnexoMut.mutate({ id: c.id, companyId }); }}>
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ) : !isConcluido ? (
                            <label className="cursor-pointer inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600">
                              {uploadingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              {uploadingId === c.id ? "Enviando..." : "Anexar"}
                              <input type="file" className="hidden" accept=".pdf,.doc,.docx" disabled={uploadingId === c.id}
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(c.id, f); }} />
                            </label>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-violet-600 hover:bg-violet-50" title="Lista de Assinaturas"
                            onClick={() => { setListaAssinaturaId(c.id); setFiltroAssinatura("pendentes"); }}>
                            <Users className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50" title="Visualizar / Imprimir"
                            onClick={() => setViewComunicadoId(c.id)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {!isConcluido && (
                            <>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50" title="Editar"
                                onClick={() => { setEditId(c.id); setEditForm({ titulo: c.titulo, conteudo: c.conteudo || "", setor: (c as any).setor || "", emissorNome: (c as any).emissorNome || "", emissorCargo: (c as any).emissorCargo || "", destinatariosIds: (() => { try { const d = JSON.parse((c as any).destinatariosJson || "[]"); return Array.isArray(d) ? d.map((x: any) => Number(typeof x === "object" ? x.id : x)).filter(Boolean) : []; } catch { return []; } })() }); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600 hover:bg-red-50" title="Excluir"
                                onClick={() => { if (confirm(`Excluir comunicado ${c.numero}?`)) excluirMut.mutate({ id: c.id, companyId }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) setNovoFullscreen(false); }}>
        <DialogContent className={`flex flex-col p-0 ${novoFullscreen ? "max-w-[98vw] w-[98vw] h-[96vh] max-h-[96vh]" : "max-w-3xl max-h-[90vh]"}`}>
          <DialogHeader className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-slate-200 bg-white rounded-t-lg">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Megaphone className="h-4 w-4 text-blue-600" />
                </div>
                Novo Comunicado Interno
              </DialogTitle>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 mr-6" title={novoFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                onClick={() => setNovoFullscreen(v => !v)}>
                {novoFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-4 px-6 overflow-y-auto flex-1 min-h-0">
            {/* Linha 1: Título + Data */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Label>Título *</Label>
                <Input className="mt-1" placeholder="Ex: Registro de Ponto" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
              </div>
              <div>
                <Label>Data de Emissão *</Label>
                <Input type="date" className="mt-1" value={form.dataEmissao} onChange={e => setForm({ ...form, dataEmissao: e.target.value })} />
                <p className="text-[10px] text-slate-400 mt-1">Nº {String((comunicados.filter((c:any)=>c.ano===new Date(form.dataEmissao+"T12:00:00").getFullYear()).length)+1).padStart(3,"0")}/{new Date(form.dataEmissao+"T12:00:00").getFullYear()} (automático)</p>
              </div>
            </div>
            {/* Linha 2: Setor + Emissor + Cargo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Setor / Departamento</Label>
                <input
                  list="setores-list"
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Ex: Departamento de RH"
                  value={form.setor}
                  onChange={e => setForm({ ...form, setor: e.target.value })}
                />
                <datalist id="setores-list">
                  <option value="Diretoria" />
                  <option value="Departamento de Recursos Humanos" />
                  <option value="Departamento Administrativo" />
                  <option value="Departamento Financeiro" />
                  <option value="Departamento de Compras" />
                  <option value="Departamento de Obras" />
                  <option value="Departamento Jurídico" />
                  <option value="Departamento Contábil" />
                  <option value="Departamento Comercial" />
                  <option value="Segurança do Trabalho" />
                </datalist>
              </div>
              <div>
                <Label>Emissor Responsável</Label>
                <select
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.emissorNome}
                  onChange={e => {
                    const emp = funcionariosPicker.find((f: any) => f.nomeCompleto === e.target.value);
                    setForm({ ...form, emissorNome: e.target.value, emissorCargo: emp ? (emp.cargo || emp.funcao || "") : form.emissorCargo });
                  }}
                >
                  <option value="">— Selecione —</option>
                  {funcionariosPicker.map((f: any) => (
                    <option key={f.id} value={f.nomeCompleto}>{f.nomeCompleto}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Cargo do Emissor</Label>
                <Input className="mt-1" placeholder="Ex: Gerente de RH" value={form.emissorCargo} onChange={e => setForm({ ...form, emissorCargo: e.target.value })} />
              </div>
            </div>
            {/* Linha 3: Destinatários para assinatura */}
            {(() => {
              const filtrados = funcionariosPicker.filter((f: any) => {
                const matchBusca = !buscaDest.trim() || f.nomeCompleto?.toLowerCase().includes(buscaDest.toLowerCase());
                const matchIndireto = !somentIndiretos || (f.categoriaMO === "indireta_obra" || f.categoriaMO === "escritorio_central");
                return matchBusca && matchIndireto;
              });
              const todosVisivelsSelecionados = filtrados.length > 0 && filtrados.every((f: any) => form.destinatariosIds.includes(f.id));
              return (
                <div>
                  <Label className="flex items-center gap-1.5 mb-1.5">
                    <Users className="h-3.5 w-3.5 text-slate-500" />
                    Destinatários para Assinatura
                    <span className="text-[10px] text-slate-400 font-normal">(opcional)</span>
                  </Label>
                  {/* Barra de busca + toggle indiretos */}
                  <div className="flex gap-2 mb-1.5">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        className="w-full pl-8 pr-3 h-8 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400"
                        placeholder="Buscar por nome..."
                        value={buscaDest}
                        onChange={e => setBuscaDest(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSomentIndiretos(v => !v)}
                      className={`flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs border font-medium transition-colors ${somentIndiretos ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-600"}`}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      Somente Indiretos
                    </button>
                  </div>
                  {funcionariosPickerQ.isLoading ? (
                    <div className="h-28 border rounded-md flex items-center justify-center text-slate-400 text-xs"><Loader2 className="h-4 w-4 animate-spin mr-1" /> Carregando...</div>
                  ) : (
                    <div className="border border-slate-200 rounded-md bg-slate-50">
                      {/* Selecionar todos */}
                      <div className="px-3 py-1.5 border-b border-slate-200 bg-white rounded-t-md flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                            checked={todosVisivelsSelecionados}
                            onChange={e => {
                              const idsVisiveis = filtrados.map((f: any) => f.id);
                              if (e.target.checked) {
                                const merged = Array.from(new Set([...form.destinatariosIds, ...idsVisiveis]));
                                setForm({ ...form, destinatariosIds: merged });
                              } else {
                                setForm({ ...form, destinatariosIds: form.destinatariosIds.filter(id => !idsVisiveis.includes(id)) });
                              }
                            }}
                          />
                          <span className="text-[11px] font-medium text-slate-600">Selecionar todos ({filtrados.length})</span>
                        </label>
                        {form.destinatariosIds.length > 0 && (
                          <span className="text-[10px] text-blue-600 font-medium">{form.destinatariosIds.length} selecionado(s)</span>
                        )}
                      </div>
                      <div className="overflow-y-auto max-h-32 divide-y divide-slate-100">
                        {filtrados.length === 0 ? (
                          <p className="text-xs text-slate-400 p-3">Nenhum resultado</p>
                        ) : filtrados.map((f: any) => (
                          <label key={f.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white cursor-pointer">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                              checked={form.destinatariosIds.includes(f.id)}
                              onChange={e => {
                                const ids = e.target.checked
                                  ? [...form.destinatariosIds, f.id]
                                  : form.destinatariosIds.filter(id => id !== f.id);
                                setForm({ ...form, destinatariosIds: ids });
                              }}
                            />
                            <span className="text-xs text-slate-700 flex-1 min-w-0 truncate">{f.nomeCompleto}</span>
                            <span className="text-[10px] text-slate-400 shrink-0">{f.cargo || f.funcao || ""}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* Conteúdo */}
            <div className="flex flex-col">
              <Label className="mb-1">Conteúdo</Label>
              <RichTextEditor
                value={form.conteudo}
                onChange={(html) => setForm({ ...form, conteudo: html })}
                placeholder="Texto do comunicado..."
                minHeight={novoFullscreen ? "calc(96vh - 520px)" : "220px"}
              />
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 px-6 py-4 border-t border-slate-200">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!form.titulo.trim()) { toast.error("Informe o título"); return; }
              if (!companyId) { toast.error("Selecione a empresa"); return; }
              const destinatariosJson = form.destinatariosIds.length > 0
                ? JSON.stringify(form.destinatariosIds.map(id => ({ id, nome: funcionariosPicker.find((f: any) => f.id === id)?.nomeCompleto || "" })))
                : undefined;
              criarMut.mutate({
                companyId,
                titulo: form.titulo.trim(),
                dataEmissao: form.dataEmissao,
                conteudo: form.conteudo || undefined,
                setor: form.setor.trim() || undefined,
                emissorNome: form.emissorNome.trim() || undefined,
                emissorCargo: form.emissorCargo.trim() || undefined,
                destinatariosJson,
              });
            }} disabled={criarMut.isPending} className="bg-blue-600 hover:bg-blue-700">
              {criarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Criar Comunicado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editId !== null} onOpenChange={(open) => { if (!open) { setEditId(null); setEditFullscreen(false); } }}>
        <DialogContent className={`flex flex-col p-0 ${editFullscreen ? "max-w-[98vw] w-[98vw] h-[96vh] max-h-[96vh]" : "max-w-3xl max-h-[90vh]"}`}>
          <DialogHeader className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-slate-200 bg-white rounded-t-lg">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Pencil className="h-4 w-4 text-amber-600" />
                </div>
                Editar Comunicado
              </DialogTitle>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 mr-6" title={editFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                onClick={() => setEditFullscreen(v => !v)}>
                {editFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-4 px-6 overflow-y-auto flex-1 min-h-0">
            <div>
              <Label>Título *</Label>
              <Input className="mt-1" value={editForm.titulo} onChange={e => setEditForm({ ...editForm, titulo: e.target.value })} />
            </div>
            {/* Setor + Emissor + Cargo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Setor / Departamento</Label>
                <input
                  list="setores-list-edit"
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Ex: Departamento de RH"
                  value={editForm.setor}
                  onChange={e => setEditForm({ ...editForm, setor: e.target.value })}
                />
                <datalist id="setores-list-edit">
                  <option value="Diretoria" />
                  <option value="Departamento de Recursos Humanos" />
                  <option value="Departamento Administrativo" />
                  <option value="Departamento Financeiro" />
                  <option value="Departamento de Compras" />
                  <option value="Departamento de Obras" />
                  <option value="Departamento Jurídico" />
                  <option value="Departamento Contábil" />
                  <option value="Departamento Comercial" />
                  <option value="Segurança do Trabalho" />
                </datalist>
              </div>
              <div>
                <Label>Emissor Responsável</Label>
                <select
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={editForm.emissorNome}
                  onChange={e => {
                    const emp = funcionariosPicker.find((f: any) => f.nomeCompleto === e.target.value);
                    setEditForm({ ...editForm, emissorNome: e.target.value, emissorCargo: emp ? (emp.cargo || emp.funcao || "") : editForm.emissorCargo });
                  }}
                >
                  <option value="">— Selecione —</option>
                  {funcionariosPicker.map((f: any) => (
                    <option key={f.id} value={f.nomeCompleto}>{f.nomeCompleto}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Cargo do Emissor</Label>
                <Input className="mt-1" placeholder="Ex: Gerente de RH" value={editForm.emissorCargo} onChange={e => setEditForm({ ...editForm, emissorCargo: e.target.value })} />
              </div>
            </div>
            {/* Destinatários */}
            {(() => {
              const filtradosEdit = funcionariosPicker.filter((f: any) => {
                const matchBusca = !buscaDest.trim() || f.nomeCompleto?.toLowerCase().includes(buscaDest.toLowerCase());
                const matchIndireto = !somentIndiretos || (f.categoriaMO === "indireta_obra" || f.categoriaMO === "escritorio_central");
                return matchBusca && matchIndireto;
              });
              const todosVisivelsSelecionados = filtradosEdit.length > 0 && filtradosEdit.every((f: any) => editForm.destinatariosIds.includes(f.id));
              return (
                <div>
                  <Label className="flex items-center gap-1.5 mb-1.5">
                    <Users className="h-3.5 w-3.5 text-slate-500" />
                    Destinatários para Assinatura
                    <span className="text-[10px] text-slate-400 font-normal">(opcional)</span>
                  </Label>
                  {/* Barra de busca + toggle indiretos */}
                  <div className="flex gap-2 mb-1.5">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        className="w-full pl-8 pr-3 h-8 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder:text-slate-400"
                        placeholder="Buscar por nome..."
                        value={buscaDest}
                        onChange={e => setBuscaDest(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSomentIndiretos(v => !v)}
                      className={`flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs border font-medium transition-colors ${somentIndiretos ? "bg-amber-600 text-white border-amber-600" : "bg-white text-slate-600 border-slate-200 hover:border-amber-400 hover:text-amber-600"}`}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      Somente Indiretos
                    </button>
                  </div>
                  {funcionariosPickerQ.isLoading ? (
                    <div className="h-28 border rounded-md flex items-center justify-center text-slate-400 text-xs"><Loader2 className="h-4 w-4 animate-spin mr-1" /> Carregando...</div>
                  ) : (
                    <div className="border border-slate-200 rounded-md bg-slate-50">
                      {/* Selecionar todos */}
                      <div className="px-3 py-1.5 border-b border-slate-200 bg-white rounded-t-md flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600"
                            checked={todosVisivelsSelecionados}
                            onChange={e => {
                              const idsVisiveis = filtradosEdit.map((f: any) => f.id);
                              if (e.target.checked) {
                                const merged = Array.from(new Set([...editForm.destinatariosIds, ...idsVisiveis]));
                                setEditForm({ ...editForm, destinatariosIds: merged });
                              } else {
                                setEditForm({ ...editForm, destinatariosIds: editForm.destinatariosIds.filter(id => !idsVisiveis.includes(id)) });
                              }
                            }}
                          />
                          <span className="text-[11px] font-medium text-slate-600">Selecionar todos ({filtradosEdit.length})</span>
                        </label>
                        {editForm.destinatariosIds.length > 0 && (
                          <span className="text-[10px] text-amber-600 font-medium">{editForm.destinatariosIds.length} selecionado(s)</span>
                        )}
                      </div>
                      <div className="overflow-y-auto max-h-32 divide-y divide-slate-100">
                        {filtradosEdit.length === 0 ? (
                          <p className="text-xs text-slate-400 p-3">Nenhum resultado</p>
                        ) : filtradosEdit.map((f: any) => (
                          <label key={f.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white cursor-pointer">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600"
                              checked={editForm.destinatariosIds.includes(f.id)}
                              onChange={e => {
                                const ids = e.target.checked
                                  ? [...editForm.destinatariosIds, f.id]
                                  : editForm.destinatariosIds.filter(id => id !== f.id);
                                setEditForm({ ...editForm, destinatariosIds: ids });
                              }}
                            />
                            <span className="text-xs text-slate-700 flex-1 min-w-0 truncate">{f.nomeCompleto}</span>
                            <span className="text-[10px] text-slate-400 shrink-0">{f.cargo || f.funcao || ""}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="flex flex-col">
              <Label className="mb-1">Conteúdo</Label>
              <RichTextEditor
                value={editForm.conteudo}
                onChange={(html) => setEditForm({ ...editForm, conteudo: html })}
                placeholder="Texto do comunicado..."
                minHeight={editFullscreen ? "calc(96vh - 520px)" : "240px"}
              />
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 px-6 py-4 border-t border-slate-200">
            <Button variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
            <Button onClick={() => {
              if (!editForm.titulo.trim()) { toast.error("Informe o título"); return; }
              if (!editId) return;
              const destinatariosJson = editForm.destinatariosIds.length > 0
                ? JSON.stringify(editForm.destinatariosIds.map(id => ({ id, nome: funcionariosPicker.find((f: any) => f.id === id)?.nomeCompleto || "" })))
                : null;
              atualizarMut.mutate({
                id: editId, companyId,
                titulo: editForm.titulo.trim(),
                conteudo: editForm.conteudo || null,
                setor: editForm.setor.trim() || null,
                emissorNome: editForm.emissorNome.trim() || null,
                emissorCargo: editForm.emissorCargo.trim() || null,
                destinatariosJson,
              });
            }} disabled={atualizarMut.isPending} className="bg-amber-600 hover:bg-amber-700">
              {atualizarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Pencil className="h-4 w-4 mr-1" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rev. 4264 — Dialog FCSign (definido em fcSignDialogNode p/ renderizar também na visualização do comunicado) */}
      {fcSignDialogNode}

      <Dialog open={pendingText !== null} onOpenChange={(open) => { if (!open) setPendingText(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Substituir texto do comunicado?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Este comunicado já possui texto. Deseja substituí-lo pelo conteúdo extraído do documento anexado?
          </p>
          <div className="max-h-32 overflow-y-auto border rounded p-3 bg-slate-50 text-xs text-slate-700 whitespace-pre-wrap">
            {pendingText?.text.substring(0, 500)}{(pendingText?.text.length ?? 0) > 500 ? "..." : ""}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingText(null)}>Manter texto atual</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => {
              if (pendingText) {
                atualizarMut.mutate({ id: pendingText.id, companyId, conteudo: pendingText.text });
                toast.success("Texto substituído pelo conteúdo do documento");
              }
              setPendingText(null);
            }}>
              Substituir texto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
