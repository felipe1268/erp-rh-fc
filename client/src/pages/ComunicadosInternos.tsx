import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import RichTextEditor, { stripHtml, sanitizeHtml, isHtmlContent } from "@/components/RichTextEditor";
import { Megaphone, Plus, Trash2, Upload, FileText, Search, Loader2, ArrowLeft, Printer, Eye, ChevronLeft, Pencil, CheckCircle2, RotateCcw, Lock, X, Maximize2, Minimize2, ClipboardSignature, Eraser, MonitorSmartphone, Users, Signature } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { formatCPF } from "@/lib/formatters";

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
  const [form, setForm] = useState({ titulo: "", dataEmissao: new Date().toISOString().slice(0, 10), conteudo: "" });
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [viewComunicadoId, setViewComunicadoId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ titulo: "", conteudo: "" });
  const [pendingText, setPendingText] = useState<{ id: number; text: string } | null>(null);
  const [novoFullscreen, setNovoFullscreen] = useState(false);
  const [editFullscreen, setEditFullscreen] = useState(false);
  // Rev. 2079 — Lista de Assinatura: id do comunicado em foco + modo (imprimir/digital) + funcionário que está assinando agora
  const [listaAssinaturaId, setListaAssinaturaId] = useState<number | null>(null);
  const [assinaturaMode, setAssinaturaMode] = useState<"imprimir" | "digital">("digital");
  const [signingFuncionario, setSigningFuncionario] = useState<{ id: number; nome: string; initial?: string | null } | null>(null);
  const [searchFunc, setSearchFunc] = useState("");

  const listaAssinaturaQuery = trpc.comunicadosInternos.listarFuncionariosParaAssinatura.useQuery(
    { comunicadoId: listaAssinaturaId || 0, companyId },
    { enabled: !!listaAssinaturaId && companyId > 0 },
  );
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

  const { data: comunicados = [], isLoading } = trpc.comunicadosInternos.listar.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const criarMut = trpc.comunicadosInternos.criar.useMutation({
    onSuccess: () => {
      utils.comunicadosInternos.listar.invalidate();
      toast.success("Comunicado criado");
      setShowDialog(false);
      setForm({ titulo: "", dataEmissao: new Date().toISOString().slice(0, 10), conteudo: "" });
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
    onSuccess: () => { utils.comunicadosInternos.listar.invalidate(); toast.success("Comunicado concluído com sucesso"); },
    onError: (e) => toast.error(e.message),
  });
  const reverterMut = trpc.comunicadosInternos.reverter.useMutation({
    onSuccess: () => { utils.comunicadosInternos.listar.invalidate(); toast.success("Comunicado revertido para rascunho"); },
    onError: (e) => toast.error(e.message),
  });
  const excluirMut = trpc.comunicadosInternos.excluir.useMutation({
    onSuccess: () => { utils.comunicadosInternos.listar.invalidate(); toast.success("Comunicado excluído"); },
    onError: (e) => toast.error(e.message),
  });

  const viewComunicado = useMemo(() => {
    if (viewComunicadoId === null) return null;
    return comunicados.find((c: any) => c.id === viewComunicadoId) || null;
  }, [comunicados, viewComunicadoId]);

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
    const filtradosFunc = q
      ? funcionarios.filter((f: any) =>
          (f.nomeCompleto || "").toLowerCase().includes(q) ||
          (f.matricula || "").toLowerCase().includes(q) ||
          (f.cargo || "").toLowerCase().includes(q))
      : funcionarios;
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
            <Button variant="ghost" size="sm" onClick={() => { setListaAssinaturaId(null); setSearchFunc(""); }}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar ao Comunicado
            </Button>
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center shadow">
              <ClipboardSignature className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <h2 className="text-lg font-bold text-slate-800 leading-tight">Lista para Assinatura</h2>
              <p className="text-xs text-slate-500">Comunicado {comAtual?.numero} — {comAtual?.titulo}</p>
            </div>
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
              document.title = `Lista Assinatura - Comunicado ${comAtual?.numero}`;
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
                <Users className="h-3.5 w-3.5" /> Funcionários Ativos
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

          {/* Busca (não imprime) */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 mb-3 no-print">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input className="pl-9" placeholder="Buscar por nome, matrícula ou cargo..." value={searchFunc} onChange={(e) => setSearchFunc(e.target.value)} />
            </div>
          </div>

          {/* AREA IMPRIMÍVEL */}
          <div className="lista-assinatura-print bg-white rounded-xl shadow-sm border border-slate-200 p-6 print:border-0 print:shadow-none print:rounded-none print:p-0">
            {/* Cabeçalho da lista (imprime) */}
            <div className="mb-4 pb-4 border-b border-slate-200">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  {logoUrl ? (
                    <img src={logoUrl} alt={nomeEmpresa} className="h-12 object-contain" onError={(e: any) => e.target.style.display = 'none'} />
                  ) : (
                    <img src="/fc-logo.png" alt="FC" className="h-12 object-contain" onError={(e: any) => e.target.style.display = 'none'} />
                  )}
                  <div>
                    <h3 className="text-sm font-bold text-[#1B2A4A]">{nomeEmpresa}</h3>
                    {cnpj && <p className="text-[10px] text-slate-500">CNPJ: {cnpj}</p>}
                  </div>
                </div>
                <div className="text-right text-[10px] text-slate-500">
                  <p>Gerado em: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}</p>
                  <p>Funcionários ativos: <span className="font-semibold text-slate-700">{totalAtivos}</span></p>
                </div>
              </div>
              <div className="bg-[#1B2A4A] text-white py-2 px-3 text-center rounded-sm">
                <span className="text-xs font-bold tracking-wider">LISTA DE CIÊNCIA — COMUNICADO INTERNO Nº {comAtual?.numero}</span>
              </div>
              <div className="mt-2 text-xs text-slate-700">
                <p><span className="font-semibold">Assunto:</span> {comAtual?.titulo}</p>
                <p><span className="font-semibold">Data de Emissão:</span> {formatDateBR(comAtual?.dataEmissao || "")}</p>
                <p className="mt-1 text-[10px] text-slate-500 italic">
                  Declaro que recebi, li e estou ciente do conteúdo do comunicado acima identificado.
                </p>
              </div>
            </div>

            {listaAssinaturaQuery.isLoading ? (
              <div className="p-12 text-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
            ) : filtradosFunc.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500">{q ? "Nenhum funcionário corresponde à busca" : "Nenhum funcionário ativo nesta empresa"}</p>
              </div>
            ) : (
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-slate-50 print:bg-slate-100">
                  <tr className="border-b-2 border-slate-300">
                    <th className="text-left px-2 py-2 font-bold text-slate-700 w-10">#</th>
                    <th className="text-left px-2 py-2 font-bold text-slate-700 w-20">Matrícula</th>
                    <th className="text-left px-2 py-2 font-bold text-slate-700">Nome do Colaborador</th>
                    <th className="text-left px-2 py-2 font-bold text-slate-700 hidden sm:table-cell w-32">Cargo</th>
                    <th className="text-left px-2 py-2 font-bold text-slate-700" style={{ width: assinaturaMode === "digital" ? "260px" : "300px" }}>
                      Assinatura {assinaturaMode === "imprimir" && <span className="text-[9px] text-slate-400 font-normal">(assine no espaço)</span>}
                    </th>
                    <th className="text-left px-2 py-2 font-bold text-slate-700 w-24 hidden sm:table-cell">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradosFunc.map((f: any, idx: number) => {
                    const assinou = !!f.assinatura;
                    return (
                      <tr key={f.id} className={`border-b border-slate-200 ${assinou ? "bg-emerald-50/30 print:bg-white" : ""}`}>
                        <td className="px-2 py-2 text-slate-500 align-top">{idx + 1}</td>
                        <td className="px-2 py-2 text-slate-700 font-mono align-top">{f.matricula || "-"}</td>
                        <td className="px-2 py-2 text-slate-800 font-medium align-top">
                          {f.nomeCompleto}
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
                                <img src={f.assinatura.assinaturaBase64} alt={`Assinatura ${f.nomeCompleto}`} className="max-h-10 max-w-full object-contain" />
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
                            <Button size="sm" variant="outline" className="h-8 text-[10px] border-indigo-300 text-indigo-700 hover:bg-indigo-50 no-print"
                              onClick={() => setSigningFuncionario({ id: f.id, nome: f.nomeCompleto, initial: null })}>
                              <Signature className="h-3 w-3 mr-1" /> Assinar
                            </Button>
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
    const nomeEmpresa = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "FC ENGENHARIA PROJETOS E CONSULTORIA LTDA";
    const cnpj = selectedCompany?.cnpj || "";
    const logoUrl = selectedCompany?.logoUrl;
    const endereco = selectedCompany?.endereco || "";
    const cidade = selectedCompany?.cidade || "";
    const estado = selectedCompany?.estado || "";

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4 print:hidden flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setViewComunicadoId(null)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            {isConcluido && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                <Lock className="h-3 w-3" /> Concluído
              </span>
            )}
            <div className="flex-1" />
            {!isConcluido && (
              <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={concluirMut.isPending}
                onClick={() => { if (confirm("Concluir este comunicado? Após concluído, ele não poderá ser editado ou excluído.")) concluirMut.mutate({ id: c.id, companyId }); }}>
                {concluirMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Concluir
              </Button>
            )}
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

          <div className="comunicado-print-area bg-white border rounded-lg p-8 max-w-3xl mx-auto print:border-0 print:shadow-none print:p-4 print:max-w-none">
            <div className="mb-6">
              <div className="flex flex-col items-center justify-center mb-4">
                {logoUrl ? (
                  <img src={logoUrl} alt={nomeEmpresa} className="h-16 mb-2 object-contain" onError={(e: any) => e.target.style.display = 'none'} />
                ) : (
                  <img src="/fc-logo.png" alt="FC Engenharia" className="h-16 mb-2 object-contain" onError={(e: any) => e.target.style.display = 'none'} />
                )}
                <h2 className="text-lg font-bold text-[#1B2A4A] tracking-wide text-center">
                  {nomeEmpresa}
                </h2>
                {cnpj && <p className="text-[10px] text-gray-500">CNPJ: {cnpj}</p>}
                {(endereco || cidade) && (
                  <p className="text-[10px] text-gray-400">
                    {[endereco, cidade, estado].filter(Boolean).join(" - ")}
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
              {c.conteudo ? (
                isHtmlContent(c.conteudo) ? (
                  <div
                    className="comunicado-conteudo prose prose-sm max-w-none text-gray-800 leading-relaxed prose-headings:text-[#1B2A4A] prose-p:my-2"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.conteudo) }}
                  />
                ) : (
                  <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{c.conteudo}</div>
                )
              ) : null}
            </div>

            <div className="mt-12 pt-6">
              <div className="flex justify-between gap-12">
                <div className="flex-1 text-center">
                  {c.criadoPor && (
                    <p className="text-xs font-semibold text-[#1B2A4A] mb-1 mx-4">{c.criadoPor}</p>
                  )}
                  <div className="border-t border-gray-400 pt-2 mx-4">
                    <p className="text-[10px] text-gray-500">Departamento de Recursos Humanos</p>
                  </div>
                </div>
                <div className="flex-1 text-center">
                  <p className="text-xs font-semibold text-[#1B2A4A] mb-1 mx-4">&nbsp;</p>
                  <div className="border-t border-gray-400 pt-2 mx-4">
                    <p className="text-[10px] text-gray-500">Direção</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-200 flex justify-between text-[9px] text-gray-400">
              <span>Documento gerado pelo ERP - Gestão Integrada</span>
              <span>
                Emitido em: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                {c.criadoPor ? ` | Por: ${c.criadoPor}` : ""}
              </span>
            </div>
          </div>
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
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-24">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-28">Data</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 w-36">Documento</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600 w-36">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c: any) => {
                    const isConcluido = c.status === "concluido";
                    return (
                      <tr key={c.id} className={`border-b hover:bg-slate-50 ${isConcluido ? "bg-green-50/30" : ""}`}>
                        <td className="px-4 py-3 font-mono font-bold text-blue-700">{c.numero}</td>
                        <td className="px-4 py-3 overflow-hidden max-w-0">
                          <div className="font-medium text-slate-800 truncate">{c.titulo}</div>
                          {c.conteudo && (() => {
                            const preview = stripHtml(c.conteudo);
                            return preview ? <div className="text-xs text-slate-500 truncate">{preview.length > 100 ? preview.substring(0, 100) + "..." : preview}</div> : null;
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          {isConcluido ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
                              <Lock className="h-2.5 w-2.5" /> Concluído
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                              Rascunho
                            </span>
                          )}
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
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50" title="Visualizar / Imprimir"
                            onClick={() => setViewComunicadoId(c.id)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {!isConcluido && (
                            <>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-50" title="Editar"
                                onClick={() => { setEditId(c.id); setEditForm({ titulo: c.titulo, conteudo: c.conteudo || "" }); }}>
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
        <DialogContent className={`flex flex-col p-0 ${novoFullscreen ? "max-w-[98vw] w-[98vw] h-[96vh] max-h-[96vh]" : "max-w-3xl max-h-[88vh]"}`}>
          <DialogHeader className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-blue-600" /> Novo Comunicado Interno</DialogTitle>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 mr-6" title={novoFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                onClick={() => setNovoFullscreen(v => !v)}>
                {novoFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-3 px-6 overflow-y-auto flex-1 min-h-0">
            <div>
              <Label>Título *</Label>
              <Input className="mt-1" placeholder="Ex: Registro de Ponto" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div>
              <Label>Data de Emissão *</Label>
              <Input type="date" className="mt-1" value={form.dataEmissao} onChange={e => setForm({ ...form, dataEmissao: e.target.value })} />
              <p className="text-xs text-slate-500 mt-1">A numeração ({String((comunicados.filter((c:any)=>c.ano===new Date(form.dataEmissao+"T12:00:00").getFullYear()).length)+1).padStart(3,"0")}/{new Date(form.dataEmissao+"T12:00:00").getFullYear()}) é gerada automaticamente.</p>
            </div>
            <div className="flex flex-col">
              <Label className="mb-1">Conteúdo</Label>
              <RichTextEditor
                value={form.conteudo}
                onChange={(html) => setForm({ ...form, conteudo: html })}
                placeholder="Texto do comunicado..."
                minHeight={novoFullscreen ? "calc(96vh - 360px)" : "260px"}
              />
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 px-6 py-4 border-t border-slate-200">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!form.titulo.trim()) { toast.error("Informe o título"); return; }
              if (!companyId) { toast.error("Selecione a empresa"); return; }
              criarMut.mutate({ companyId, titulo: form.titulo.trim(), dataEmissao: form.dataEmissao, conteudo: form.conteudo || undefined });
            }} disabled={criarMut.isPending} className="bg-blue-600 hover:bg-blue-700">
              {criarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Criar Comunicado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editId !== null} onOpenChange={(open) => { if (!open) { setEditId(null); setEditFullscreen(false); } }}>
        <DialogContent className={`flex flex-col p-0 ${editFullscreen ? "max-w-[98vw] w-[98vw] h-[96vh] max-h-[96vh]" : "max-w-3xl max-h-[88vh]"}`}>
          <DialogHeader className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-amber-600" /> Editar Comunicado</DialogTitle>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 mr-6" title={editFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                onClick={() => setEditFullscreen(v => !v)}>
                {editFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-3 px-6 overflow-y-auto flex-1 min-h-0">
            <div>
              <Label>Título *</Label>
              <Input className="mt-1" value={editForm.titulo} onChange={e => setEditForm({ ...editForm, titulo: e.target.value })} />
            </div>
            <div className="flex flex-col">
              <Label className="mb-1">Conteúdo</Label>
              <RichTextEditor
                value={editForm.conteudo}
                onChange={(html) => setEditForm({ ...editForm, conteudo: html })}
                placeholder="Texto do comunicado..."
                minHeight={editFullscreen ? "calc(96vh - 280px)" : "320px"}
              />
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 px-6 py-4 border-t border-slate-200">
            <Button variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
            <Button onClick={() => {
              if (!editForm.titulo.trim()) { toast.error("Informe o título"); return; }
              if (!editId) return;
              atualizarMut.mutate({ id: editId, companyId, titulo: editForm.titulo.trim(), conteudo: editForm.conteudo || null });
            }} disabled={atualizarMut.isPending} className="bg-amber-600 hover:bg-amber-700">
              {atualizarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Pencil className="h-4 w-4 mr-1" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
