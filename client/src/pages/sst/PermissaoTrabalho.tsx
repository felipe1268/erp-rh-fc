// Rev. 3900 — PT Permissão de Trabalho (NR-35) — 100% digital
// Wizard 4 passos: Solicitação → Descrição → Checklist → Envolvidos
// Assinaturas canvas pad (workers) + FCSign (liberação formal)
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/hooks/useConfirm";
import { toast } from "sonner";
import {
  ClipboardCheck, Plus, ChevronRight, ChevronLeft, Check, X as XIcon,
  Loader2, HardHat, Users, AlertTriangle, CheckCircle2, Clock,
  ShieldCheck, FileText, MapPin, User, PenLine, Eraser,
  ChevronDown, ChevronUp, Eye, Pencil, Ban, ArrowRight, Building2,
  RefreshCw, Printer, Send,
} from "lucide-react";

// ── Checklist NR-35 — 15 itens ────────────────────────────────────────────────
const CHECKLIST_ITENS = [
  "Todas as pessoas envolvidas no trabalho em altura possuem treinamento de trabalho em altura?",
  "Todas as pessoas envolvidas no trabalho em altura possuem Atestado de Saúde Ocupacional atualizado?",
  "As condições climáticas são propícias para o trabalho em altura?",
  "Foi determinado um supervisor para execução do serviço?",
  "Todos os recursos necessários para execução dos trabalhos em altura foram previstos e estão disponíveis?",
  "Foi estabelecida a firma de atendimento/resgate de emergência para o trabalho em altura?",
  "Foi estabelecido um plano de comunicação entre os envolvidos na execução do serviço?",
  "Os pontos de fixação dos sistemas de proteção contra quedas foram aprovados por pessoa autorizada?",
  "Foi elaborado plano de trabalho para prevenção do risco de queda de materiais e ferramentas?",
  "A proximidade com pontos de energia (elétrica, química, hidráulica, pneumática etc.) foi avaliada e os riscos controlados?",
  "O serviço de Contratada — a PT foi devidamente preenchida?",
  "Todos os EPIs da área de trabalho (cinto de segurança, talabarte, trava-quedas) foram inspecionados e possam ser utilizados com a cor proibida do mês?",
  "Todo local do serviço e área abaixo do local do serviço está isolado e sinalizado?",
  "Existe procedimento específico, escrito, testado e aprovado para realização deste trabalho?",
  "As pessoas envolvidas estão usando todos os EPIs necessários à área operacional?",
];

const TIPOS_TRABALHO = [
  { key: "telhado_coberturas",    label: "Telhado e coberturas" },
  { key: "plataforma_aerea",      label: "Plataforma de Trabalho Aéreo" },
  { key: "andaimes",              label: "Andaimes" },
  { key: "caixa_dagua",           label: "Caixa d'água" },
  { key: "escadas",               label: "Escadas" },
  { key: "outros",                label: "Outros" },
];

type ChecklistResp = "S" | "N" | "NA" | undefined;
type ChecklistState = Record<number, ChecklistResp>;

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  em_andamento: { label: "Em Andamento", color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",  icon: Clock },
  liberada:     { label: "Liberada",     color: "text-green-700",  bg: "bg-green-50 border-green-200",  icon: CheckCircle2 },
  concluida:    { label: "Concluída",    color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",    icon: Check },
  cancelada:    { label: "Cancelada",    color: "text-red-700",    bg: "bg-red-50 border-red-200",      icon: Ban },
  rascunho:     { label: "Rascunho",     color: "text-slate-600",  bg: "bg-slate-50 border-slate-200",  icon: FileText },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.rascunho;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ── Canvas Pad de assinatura (igual ao DDS) ───────────────────────────────────
function AssinaturaPad({
  open, onOpenChange, nome, posicao, ptId, companyId,
  temAssinaturaPrevia, podeEditar,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  nome: string; posicao: number; ptId: number; companyId: number;
  temAssinaturaPrevia: boolean; podeEditar: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [vazio, setVazio] = useState(true);
  const utils = trpc.useUtils();
  const { confirm, ConfirmDialog } = useConfirm();

  const imgQ = trpc.ptPermissoes.getAssinaturaImg.useQuery(
    { ptId, companyId, posicao },
    { enabled: open && temAssinaturaPrevia, staleTime: 0 },
  );
  const salvarMut  = trpc.ptPermissoes.addAssinatura.useMutation();
  const removerMut = trpc.ptPermissoes.removeAssinatura.useMutation();

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = c.clientWidth; const cssH = c.clientHeight;
    c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0f172a";
    const img = imgQ.data?.assinaturaImg;
    if (img) {
      const el = new Image();
      el.onload = () => { ctx.drawImage(el, 0, 0, cssW, cssH); setVazio(false); };
      el.src = img;
    } else { setVazio(true); }
  }, [open, imgQ.data?.assinaturaImg]);

  const getPos = (ev: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const onDown = (ev: React.PointerEvent) => {
    if (!podeEditar) return;
    ev.preventDefault();
    (ev.target as Element).setPointerCapture(ev.pointerId);
    drawingRef.current = true; lastRef.current = getPos(ev);
  };
  const onMove = (ev: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const pos = getPos(ev);
    ctx.beginPath();
    ctx.moveTo(lastRef.current!.x, lastRef.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastRef.current = pos;
    setVazio(false);
  };
  const onUp = () => { drawingRef.current = false; lastRef.current = null; };

  const limpar = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.clientWidth, c.clientHeight);
    setVazio(true);
  };

  const salvar = async () => {
    if (vazio) { toast.error("Desenhe a assinatura primeiro."); return; }
    const c = canvasRef.current!;
    const dataUrl = c.toDataURL("image/png");
    try {
      await salvarMut.mutateAsync({ ptId, companyId, posicao, assinaturaImg: dataUrl });
      utils.ptPermissoes.getById.invalidate({ ptId, companyId });
      toast.success("Assinatura salva!");
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao salvar assinatura."); }
  };

  const remover = async () => {
    const ok = await confirm("Remover assinatura?", "Esta ação remove a assinatura desta posição.");
    if (!ok) return;
    try {
      await removerMut.mutateAsync({ ptId, companyId, posicao });
      utils.ptPermissoes.getById.invalidate({ ptId, companyId });
      toast.success("Assinatura removida.");
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao remover."); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {ConfirmDialog}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-emerald-600" />
            Assinatura — {nome || `Envolvido ${posicao}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="border-2 border-dashed border-slate-200 rounded-lg overflow-hidden bg-white" style={{ height: 180 }}>
            <canvas
              ref={canvasRef}
              className="w-full h-full touch-none cursor-crosshair"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
            />
          </div>
          <p className="text-xs text-slate-400 text-center">
            {podeEditar ? "Assine acima com o dedo ou mouse" : "Modo visualização — assinatura bloqueada"}
          </p>
        </div>
        <DialogFooter className="flex gap-2">
          {podeEditar && (
            <Button variant="outline" size="sm" onClick={limpar} className="flex items-center gap-1">
              <Eraser className="h-4 w-4" /> Limpar
            </Button>
          )}
          {temAssinaturaPrevia && (
            <Button variant="outline" size="sm" onClick={remover} disabled={removerMut.isPending}
              className="flex items-center gap-1 text-red-600 border-red-200 hover:bg-red-50">
              <XIcon className="h-4 w-4" /> Remover
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {podeEditar && (
            <Button onClick={salvar} disabled={salvarMut.isPending || vazio}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {salvarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Wizard Nova PT ─────────────────────────────────────────────────────────────
interface NovaPTState {
  // Passo 1
  employeeId: number | null;
  obraId: number | null;
  dataEmissao: string;
  horaInicio: string;
  horaTermino: string;
  maoDeObra: string;
  supervisorNome: string;
  empresaExecutanteCnpj: string;
  empresaExecutanteNome: string;
  outrosFormularios: boolean;
  outrosFormulariosDesc: string;
  // Passo 2
  tiposTrabalho: string[];
  descricaoTrabalho: string;
  // Passo 3
  checklist: ChecklistState;
  // Passo 4
  envolvidos: { nome: string; funcao: string }[];
  empresaSetorExecutante: string;
  responsavelAreaNome: string;
  responsavelLiberacaoNome: string;
  executanteNome: string;
}

function initialState(): NovaPTState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    employeeId: null, obraId: null,
    dataEmissao: today, horaInicio: "", horaTermino: "",
    maoDeObra: "interna", supervisorNome: "",
    empresaExecutanteCnpj: "", empresaExecutanteNome: "",
    outrosFormularios: false, outrosFormulariosDesc: "",
    tiposTrabalho: [], descricaoTrabalho: "",
    checklist: {},
    envolvidos: Array.from({ length: 6 }, () => ({ nome: "", funcao: "" })),
    empresaSetorExecutante: "", responsavelAreaNome: "",
    responsavelLiberacaoNome: "", executanteNome: "",
  };
}

function WizardNovaPT({
  open, onOpenChange, companyId, onCreated,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  companyId: number; onCreated: (id: number) => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<NovaPTState>(initialState);
  const { user } = useAuth();

  const obrasQ = trpc.getObrasByCompanyActive.useQuery({ companyId }, { enabled: open });
  const empsQ  = trpc.getEmployees.useQuery({ companyId }, { enabled: open });
  const numQ   = trpc.ptPermissoes.proximoNumero.useQuery({ companyId }, { enabled: open });
  const createMut = trpc.ptPermissoes.create.useMutation();

  const upd = (patch: Partial<NovaPTState>) => setForm(f => ({ ...f, ...patch }));

  useEffect(() => {
    if (open) { setStep(0); setForm(s => ({ ...initialState(), employeeId: s.employeeId ?? (user?.employeeId ?? null) })); }
  }, [open]);

  useEffect(() => {
    if (user?.employeeId && !form.employeeId) upd({ employeeId: user.employeeId });
  }, [user?.employeeId]);

  // Checklist: conta respostas
  const checkCount = useMemo(() => {
    let s = 0, n = 0, na = 0, blank = 0;
    for (let i = 1; i <= 15; i++) {
      const v = form.checklist[i];
      if (v === "S") s++; else if (v === "N") n++; else if (v === "NA") na++; else blank++;
    }
    return { s, n, na, blank };
  }, [form.checklist]);

  const setCheck = (i: number, v: ChecklistResp) => {
    setForm(f => ({ ...f, checklist: { ...f.checklist, [i]: f.checklist[i] === v ? undefined : v } }));
  };

  const handleCreate = async () => {
    if (!form.employeeId) { toast.error("Selecione o solicitante."); return; }
    try {
      const pt = await createMut.mutateAsync({
        companyId,
        employeeId: form.employeeId,
        obraId: form.obraId,
        dataEmissao: form.dataEmissao || null,
        horaInicio: form.horaInicio || null,
        horaTermino: form.horaTermino || null,
        maoDeObra: form.maoDeObra || null,
        supervisorNome: form.supervisorNome || null,
        empresaExecutanteCnpj: form.empresaExecutanteCnpj || null,
        empresaExecutanteNome: form.empresaExecutanteNome || null,
        outrosFormularios: form.outrosFormularios ? 1 : 0,
        outrosFormulariosDesc: form.outrosFormulariosDesc || null,
        tiposTrabalhoJson: JSON.stringify(form.tiposTrabalho),
        descricaoTrabalho: form.descricaoTrabalho || null,
        checklistJson: JSON.stringify(form.checklist),
        envolvidosJson: JSON.stringify(form.envolvidos.filter(e => e.nome.trim())),
        empresaSetorExecutante: form.empresaSetorExecutante || null,
        responsavelAreaNome: form.responsavelAreaNome || null,
        responsavelLiberacaoNome: form.responsavelLiberacaoNome || null,
        executanteNome: form.executanteNome || null,
      });
      toast.success(`PT ${numQ.data?.numero ?? ""} criada com sucesso!`);
      onCreated(pt.id);
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao criar PT."); }
  };

  const steps = ["Solicitação", "Descrição", "Checklist", "Envolvidos"];
  const obras = (obrasQ.data as any[]) ?? [];
  const emps  = (empsQ.data as any[]) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <HardHat className="h-5 w-5 text-emerald-600" />
            Nova PT — {numQ.data?.numero ?? "PT-???"}
          </DialogTitle>
        </DialogHeader>

        {/* Indicador de passos */}
        <div className="flex items-center gap-1 mb-4">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 transition-all
                ${i < step ? "bg-emerald-600 border-emerald-600 text-white"
                  : i === step ? "bg-white border-emerald-600 text-emerald-700"
                  : "bg-white border-slate-200 text-slate-400"}`}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${i === step ? "text-emerald-700" : "text-slate-400"}`}>{s}</span>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${i < step ? "bg-emerald-500" : "bg-slate-200"}`} />}
            </div>
          ))}
        </div>

        {/* ── Passo 0: Solicitação ────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Solicitante *</label>
                <Select value={form.employeeId?.toString() ?? ""} onValueChange={v => upd({ employeeId: Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o solicitante" /></SelectTrigger>
                  <SelectContent>
                    {emps.map((e: any) => <SelectItem key={e.id} value={e.id.toString()}>{e.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Obra</label>
                <Select value={form.obraId?.toString() ?? "_none"} onValueChange={v => upd({ obraId: v === "_none" ? null : Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a obra (opcional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Sem obra vinculada —</SelectItem>
                    {obras.map((o: any) => <SelectItem key={o.id} value={o.id.toString()}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Data</label>
                <Input type="date" value={form.dataEmissao} onChange={e => upd({ dataEmissao: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Mão de Obra</label>
                <Select value={form.maoDeObra} onValueChange={v => upd({ maoDeObra: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interna">Interna — Setor Responsável</SelectItem>
                    <SelectItem value="externa">Externa — Empresa Executante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Hora de Início</label>
                <Input type="time" value={form.horaInicio} onChange={e => upd({ horaInicio: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Hora de Término</label>
                <Input type="time" value={form.horaTermino} onChange={e => upd({ horaTermino: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Supervisor responsável</label>
                <Input value={form.supervisorNome} onChange={e => upd({ supervisorNome: e.target.value })}
                  placeholder="Nome do supervisor" />
              </div>
              {form.maoDeObra === "externa" && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Empresa executante</label>
                    <Input value={form.empresaExecutanteNome} onChange={e => upd({ empresaExecutanteNome: e.target.value })}
                      placeholder="Nome da empresa" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">CNPJ</label>
                    <Input value={form.empresaExecutanteCnpj} onChange={e => upd({ empresaExecutanteCnpj: e.target.value })}
                      placeholder="00.000.000/0000-00" />
                  </div>
                </>
              )}
              <div className="col-span-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={form.outrosFormularios}
                    onChange={e => upd({ outrosFormularios: e.target.checked })}
                    className="rounded border-slate-300" />
                  Há outros formulários vinculados a este?
                </label>
                {form.outrosFormularios && (
                  <Input className="mt-2" value={form.outrosFormulariosDesc}
                    onChange={e => upd({ outrosFormulariosDesc: e.target.value })}
                    placeholder="Especifique os formulários vinculados" />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Passo 1: Descrição do trabalho ─────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Tipo de trabalho (selecione todos que se aplicam)</label>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS_TRABALHO.map(t => (
                  <label key={t.key}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-all text-sm
                      ${form.tiposTrabalho.includes(t.key)
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold"
                        : "border-slate-200 hover:border-slate-300 text-slate-700"}`}>
                    <input type="checkbox" className="hidden"
                      checked={form.tiposTrabalho.includes(t.key)}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...form.tiposTrabalho, t.key]
                          : form.tiposTrabalho.filter(x => x !== t.key);
                        upd({ tiposTrabalho: next });
                      }} />
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0
                      ${form.tiposTrabalho.includes(t.key) ? "bg-emerald-500 border-emerald-500" : "border-slate-300"}`}>
                      {form.tiposTrabalho.includes(t.key) && <Check className="h-3 w-3 text-white" />}
                    </div>
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">
                Descrição do trabalho, local e entorno
              </label>
              <Textarea value={form.descricaoTrabalho}
                onChange={e => upd({ descricaoTrabalho: e.target.value })}
                placeholder="Descreva detalhadamente o trabalho a ser executado, o local e as condições do entorno..."
                rows={5} className="text-sm resize-none" />
            </div>
          </div>
        )}

        {/* ── Passo 2: Checklist 15 itens ────────────────────── */}
        {step === 2 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-500">Avaliação e controle dos riscos de queda com diferença de nível</p>
              <div className="flex gap-2">
                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                  ✓ {checkCount.s} S
                </span>
                <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                  ✗ {checkCount.n} N
                </span>
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
                  {checkCount.na} NA
                </span>
                {checkCount.blank > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                    {checkCount.blank} pendentes
                  </span>
                )}
              </div>
            </div>
            {checkCount.n > 0 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  Se houver resposta "Não", regularize a situação antes de liberar a Permissão de Trabalho em Altura.
                </p>
              </div>
            )}
            {CHECKLIST_ITENS.map((item, idx) => {
              const i = idx + 1;
              const val = form.checklist[i];
              return (
                <div key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all
                    ${val === "S" ? "bg-green-50 border-green-200"
                      : val === "N" ? "bg-red-50 border-red-200"
                      : val === "NA" ? "bg-slate-50 border-slate-200"
                      : "bg-white border-slate-100 hover:border-slate-200"}`}>
                  <span className="text-xs font-bold text-slate-400 w-5 flex-shrink-0 mt-0.5">{i}.</span>
                  <p className="text-sm text-slate-700 flex-1 leading-relaxed break-words">{item}</p>
                  <div className="flex gap-1 flex-shrink-0">
                    {(["S", "N", "NA"] as const).map(opt => (
                      <button key={opt} onClick={() => setCheck(i, opt)}
                        className={`w-9 h-7 rounded text-xs font-bold border-2 transition-all
                          ${val === opt
                            ? opt === "S" ? "bg-green-500 border-green-500 text-white"
                              : opt === "N" ? "bg-red-500 border-red-500 text-white"
                              : "bg-slate-400 border-slate-400 text-white"
                            : "bg-white border-slate-200 text-slate-500 hover:border-slate-400"}`}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Passo 3: Envolvidos e liberação ────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-2 block flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> Envolvidos (até 6 pessoas)
              </label>
              <div className="space-y-2">
                {form.envolvidos.map((env, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <span className="text-xs text-slate-400 font-semibold w-5">{idx + 1}.</span>
                    <Input value={env.nome}
                      onChange={e => {
                        const next = [...form.envolvidos];
                        next[idx] = { ...next[idx], nome: e.target.value };
                        upd({ envolvidos: next });
                      }}
                      placeholder={`Nome do envolvido ${idx + 1}`}
                      className="flex-1 text-sm" />
                    <Input value={env.funcao}
                      onChange={e => {
                        const next = [...form.envolvidos];
                        next[idx] = { ...next[idx], funcao: e.target.value };
                        upd({ envolvidos: next });
                      }}
                      placeholder="Função"
                      className="w-32 text-sm" />
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                As assinaturas dos envolvidos serão coletadas após criar a PT.
              </p>
            </div>

            <div className="border-t pt-4">
              <label className="text-xs font-semibold text-slate-600 mb-2 block flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Liberação da Permissão
              </label>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Empresa / Setor executante do serviço</label>
                  <Input value={form.empresaSetorExecutante}
                    onChange={e => upd({ empresaSetorExecutante: e.target.value })}
                    placeholder="Empresa ou setor" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Responsável da área do serviço</label>
                  <Input value={form.responsavelAreaNome}
                    onChange={e => upd({ responsavelAreaNome: e.target.value })}
                    placeholder="Nome do responsável" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Responsável pela liberação</label>
                  <Input value={form.responsavelLiberacaoNome}
                    onChange={e => upd({ responsavelLiberacaoNome: e.target.value })}
                    placeholder="Nome do responsável pela liberação" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Responsável pela execução</label>
                  <Input value={form.executanteNome}
                    onChange={e => upd({ executanteNome: e.target.value })}
                    placeholder="Nome do responsável pela execução" />
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex gap-2 mt-4 pt-4 border-t">
          <Button variant="outline" onClick={() => step > 0 ? setStep(s => s - 1) : onOpenChange(false)}>
            {step > 0 ? <><ChevronLeft className="h-4 w-4" /> Anterior</> : "Cancelar"}
          </Button>
          <div className="flex-1" />
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(s => s + 1)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={createMut.isPending || !form.employeeId}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {createMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</> : <><Check className="h-4 w-4" /> Criar PT</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog de detalhes / assinaturas / liberação ──────────────────────────────
function PTDetalheDialog({
  ptId, companyId, open, onOpenChange, onRefresh,
}: {
  ptId: number | null; companyId: number; open: boolean;
  onOpenChange: (v: boolean) => void; onRefresh: () => void;
}) {
  const { confirm, ConfirmDialog } = useConfirm();
  const [assinarPad, setAssinarPad] = useState<{ posicao: number; nome: string } | null>(null);
  const [concluirOpen, setConcluirOpen] = useState(false);
  const [liberarOpen, setLiberarOpen] = useState(false);
  const [fcSignOpen, setFcSignOpen] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [fcSignSigners, setFcSignSigners] = useState([
    { role: "empregador" as const, label: "Responsável da Área", nome: "", cpf: "" },
    { role: "contratante" as const, label: "Responsável pela Liberação", nome: "", cpf: "" },
    { role: "contratado" as const, label: "Responsável pela Execução", nome: "", cpf: "" },
  ]);
  const [concluirForm, setConcluirForm] = useState({
    conclusaoSolicitanteNome: "", conclusaoData: new Date().toISOString().slice(0, 10),
    conclusaoHoraInicio: "", conclusaoHoraFim: "",
  });
  const [liberarForm, setLiberarForm] = useState({
    responsavelAreaNome: "", responsavelLiberacaoNome: "", executanteNome: "",
  });

  const ptQ = trpc.ptPermissoes.getById.useQuery(
    { id: ptId!, companyId },
    { enabled: open && ptId !== null },
  );
  const utils = trpc.useUtils();
  const liberarMut    = trpc.ptPermissoes.liberar.useMutation();
  const concluirMut   = trpc.ptPermissoes.concluir.useMutation();
  const cancelarMut   = trpc.ptPermissoes.cancelar.useMutation();
  const fcSignMut     = trpc.ptPermissoes.enviarFCSign.useMutation();

  const pt = ptQ.data as any;
  if (!open || ptId === null) return null;

  const handlePrint = async () => {
    if (!ptId) return;
    setPrintLoading(true);
    try {
      const res = await utils.ptPermissoes.gerarHtml.fetch({ id: ptId, companyId });
      const w = window.open("", "_blank");
      if (w) { w.document.write(res.html); w.document.close(); setTimeout(() => w.print(), 400); }
    } catch (e: any) { toast.error(e?.message ?? "Erro ao gerar PDF."); }
    finally { setPrintLoading(false); }
  };

  const handleFcSign = async () => {
    if (!pt) return;
    setFcSignSigners(s => s.map((sg, i) => ({
      ...sg,
      nome: i === 0 ? (pt.responsavelAreaNome ?? "") : i === 1 ? (pt.responsavelLiberacaoNome ?? "") : (pt.executanteNome ?? ""),
    })));
    setFcSignOpen(true);
  };

  const handleFcSignSubmit = async () => {
    const signers = fcSignSigners.filter(s => s.nome.trim());
    if (!signers.length) { toast.error("Informe ao menos um signatário."); return; }
    try {
      await fcSignMut.mutateAsync({ id: ptId, companyId, signers: signers.map(s => ({ role: s.role, nome: s.nome.trim(), cpf: s.cpf.trim() || null })) });
      toast.success("Sessão FCSign criada! Os responsáveis receberão o link para assinar.");
      setFcSignOpen(false);
      utils.ptPermissoes.getById.invalidate({ id: ptId, companyId });
    } catch (e: any) { toast.error(e?.message ?? "Erro ao enviar para FCSign."); }
  };

  const checklist: ChecklistState = pt?.checklist ?? {};
  const assinaturasMap = new Map<number, boolean>(
    ((pt?.assinaturas ?? []) as any[]).map((a: any) => [a.posicao, true])
  );

  const handleLiberar = async () => {
    try {
      await liberarMut.mutateAsync({ id: ptId, companyId, ...liberarForm });
      toast.success("PT liberada!");
      utils.ptPermissoes.getById.invalidate({ id: ptId, companyId });
      utils.ptPermissoes.list.invalidate({ companyId });
      utils.ptPermissoes.stats.invalidate({ companyId });
      setLiberarOpen(false);
      onRefresh();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao liberar."); }
  };

  const handleConcluir = async () => {
    try {
      await concluirMut.mutateAsync({ id: ptId, companyId, ...concluirForm });
      toast.success("PT concluída!");
      utils.ptPermissoes.getById.invalidate({ id: ptId, companyId });
      utils.ptPermissoes.list.invalidate({ companyId });
      utils.ptPermissoes.stats.invalidate({ companyId });
      setConcluirOpen(false);
      onRefresh();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao concluir."); }
  };

  const handleCancelar = async () => {
    const ok = await confirm("Cancelar PT?", "Esta ação marcará a PT como cancelada. Não é possível desfazer.");
    if (!ok) return;
    try {
      await cancelarMut.mutateAsync({ id: ptId, companyId });
      toast.success("PT cancelada.");
      utils.ptPermissoes.list.invalidate({ companyId });
      utils.ptPermissoes.stats.invalidate({ companyId });
      onOpenChange(false);
      onRefresh();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao cancelar."); }
  };

  const envolvidos: { nome: string; funcao: string }[] = pt?.envolvidos ?? [];

  return (
    <>
      {ConfirmDialog}
      {assinarPad && pt && (
        <AssinaturaPad
          open={!!assinarPad}
          onOpenChange={() => setAssinarPad(null)}
          nome={assinarPad.nome}
          posicao={assinarPad.posicao}
          ptId={ptId}
          companyId={companyId}
          temAssinaturaPrevia={assinaturasMap.has(assinarPad.posicao)}
          podeEditar={pt.status !== "cancelada" && pt.status !== "concluida"}
        />
      )}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {ptQ.isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
          )}
          {pt && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <HardHat className="h-5 w-5 text-emerald-600" />
                    {pt.numero}
                  </span>
                  <StatusBadge status={pt.status} />
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5">
                {/* Infos básicas */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-lg">
                  <InfoChip label="Data" value={pt.dataEmissao ?? "—"} />
                  <InfoChip label="Início" value={pt.horaInicio ?? "—"} />
                  <InfoChip label="Término" value={pt.horaTermino ?? "—"} />
                  <InfoChip label="Mão de Obra" value={pt.maoDeObra === "externa" ? "Externa" : "Interna"} />
                  {pt.obraNome && <InfoChip label="Obra" value={pt.obraNome} className="col-span-2" />}
                  {pt.solicitanteNome && <InfoChip label="Solicitante" value={pt.solicitanteNome} className="col-span-2" />}
                  {pt.supervisorNome && <InfoChip label="Supervisor" value={pt.supervisorNome} className="col-span-2" />}
                  {pt.empresaExecutanteNome && <InfoChip label="Empresa executante" value={pt.empresaExecutanteNome} className="col-span-2" />}
                </div>

                {/* Tipos de trabalho */}
                {pt.tiposTrabalho?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-2">TIPO DE TRABALHO</p>
                    <div className="flex flex-wrap gap-2">
                      {(pt.tiposTrabalho as string[]).map(t => {
                        const cfg = TIPOS_TRABALHO.find(x => x.key === t);
                        return <span key={t} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">{cfg?.label ?? t}</span>;
                      })}
                    </div>
                  </div>
                )}

                {pt.descricaoTrabalho && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-1">DESCRIÇÃO DO TRABALHO</p>
                    <p className="text-sm text-slate-700 break-words">{pt.descricaoTrabalho}</p>
                  </div>
                )}

                {/* Checklist resumido */}
                {Object.keys(checklist).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-2">CHECKLIST NR-35</p>
                    <div className="space-y-1">
                      {CHECKLIST_ITENS.map((item, idx) => {
                        const i = idx + 1;
                        const v = checklist[i];
                        if (!v) return null;
                        return (
                          <div key={i} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded
                            ${v === "S" ? "bg-green-50 text-green-700"
                              : v === "N" ? "bg-red-50 text-red-700"
                              : "bg-slate-50 text-slate-500"}`}>
                            <span className="font-bold w-4">{i}.</span>
                            <span className="flex-1 break-words">{item}</span>
                            <span className={`font-bold px-1.5 py-0.5 rounded text-xs
                              ${v === "S" ? "bg-green-200" : v === "N" ? "bg-red-200" : "bg-slate-200"}`}>{v}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Envolvidos + assinaturas */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> ENVOLVIDOS E ASSINATURAS
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(envolvidos.length > 0 ? envolvidos : Array.from({ length: 6 }, () => ({ nome: "", funcao: "" }))).map((env, idx) => {
                      const pos = idx + 1;
                      const signed = assinaturasMap.has(pos);
                      return (
                        <button
                          key={pos}
                          onClick={() => setAssinarPad({ posicao: pos, nome: env.nome || `Envolvido ${pos}` })}
                          className={`flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all
                            ${signed
                              ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                              : "border-dashed border-slate-200 hover:border-slate-300 bg-white"}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                            ${signed ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"}`}>
                            {signed ? <Check className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">
                              {env.nome || <span className="text-slate-400 italic">Posição {pos}</span>}
                            </p>
                            <p className="text-xs text-slate-400">{env.funcao || (signed ? "Assinado" : "Aguardando assinatura")}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Liberação */}
                {(pt.responsavelAreaNome || pt.responsavelLiberacaoNome || pt.executanteNome) && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <p className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" /> LIBERAÇÃO DA PERMISSÃO
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {pt.empresaSetorExecutante && <InfoChip label="Empresa/Setor" value={pt.empresaSetorExecutante} />}
                      {pt.responsavelAreaNome && <InfoChip label="Resp. da área" value={pt.responsavelAreaNome} />}
                      {pt.responsavelLiberacaoNome && <InfoChip label="Resp. liberação" value={pt.responsavelLiberacaoNome} />}
                      {pt.executanteNome && <InfoChip label="Resp. execução" value={pt.executanteNome} />}
                    </div>
                  </div>
                )}

                {/* Conclusão */}
                {pt.conclusaoData && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs font-semibold text-blue-700 mb-2">CONCLUSÃO</p>
                    <div className="grid grid-cols-3 gap-3">
                      <InfoChip label="Solicitante" value={pt.conclusaoSolicitanteNome ?? "—"} />
                      <InfoChip label="Data" value={pt.conclusaoData ?? "—"} />
                      <InfoChip label="Início" value={pt.conclusaoHoraInicio ?? "—"} />
                      <InfoChip label="Fim" value={pt.conclusaoHoraFim ?? "—"} />
                    </div>
                  </div>
                )}

                {/* Ações */}
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {/* Imprimir — disponível em qualquer status com dados carregados */}
                  <Button variant="outline" onClick={handlePrint} disabled={printLoading}
                    className="border-slate-200 text-slate-600 hover:bg-slate-50">
                    {printLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
                    {printLoading ? "Gerando..." : "Imprimir / PDF"}
                  </Button>
                  {(pt.status === "em_andamento" || pt.status === "liberada") && (<>
                    {pt.status === "em_andamento" && (<>
                      <Button onClick={() => {
                        setLiberarForm({
                          responsavelAreaNome: pt.responsavelAreaNome ?? "",
                          responsavelLiberacaoNome: pt.responsavelLiberacaoNome ?? "",
                          executanteNome: pt.executanteNome ?? "",
                        });
                        setLiberarOpen(true);
                      }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        <ShieldCheck className="h-4 w-4 mr-1" /> Liberar PT
                      </Button>
                      {/* FCSign — só mostra quando ainda não tem sessão */}
                      {!pt.fcSignSessionId && (
                        <Button variant="outline" onClick={handleFcSign}
                          className="border-violet-200 text-violet-700 hover:bg-violet-50">
                          <Send className="h-4 w-4 mr-1" /> Enviar FCSign
                        </Button>
                      )}
                      {pt.fcSignSessionId && (
                        <span className="inline-flex items-center gap-1 text-xs text-violet-600 font-medium px-2 py-1 bg-violet-50 border border-violet-200 rounded-md">
                          <CheckCircle2 className="h-3.5 w-3.5" /> FCSign enviado
                        </span>
                      )}
                    </>)}
                    {pt.status === "liberada" && (
                      <Button onClick={() => {
                        setConcluirForm({ conclusaoSolicitanteNome: pt.solicitanteNome ?? "", conclusaoData: new Date().toISOString().slice(0, 10), conclusaoHoraInicio: "", conclusaoHoraFim: "" });
                        setConcluirOpen(true);
                      }}
                        className="bg-blue-600 hover:bg-blue-700 text-white">
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Concluir PT
                      </Button>
                    )}
                    <Button variant="outline" onClick={handleCancelar}
                      disabled={cancelarMut.isPending}
                      className="border-red-200 text-red-600 hover:bg-red-50">
                      <Ban className="h-4 w-4 mr-1" /> Cancelar PT
                    </Button>
                  </>)}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog FCSign — Liberação Formal */}
      <Dialog open={fcSignOpen} onOpenChange={setFcSignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-700">
              <Send className="h-5 w-5" /> Enviar para Assinatura — FCSign
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500 -mt-1">Informe os responsáveis que assinarão digitalmente a liberação desta PT via FCSign.</p>
          <div className="space-y-3">
            {fcSignSigners.map((signer, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2 bg-slate-50">
                <p className="text-xs font-semibold text-slate-700">{signer.label}</p>
                <Input
                  placeholder="Nome completo"
                  value={signer.nome}
                  onChange={e => setFcSignSigners(s => s.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))}
                />
                <Input
                  placeholder="CPF (opcional)"
                  value={signer.cpf}
                  onChange={e => setFcSignSigners(s => s.map((x, j) => j === i ? { ...x, cpf: e.target.value } : x))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFcSignOpen(false)}>Cancelar</Button>
            <Button onClick={handleFcSignSubmit} disabled={fcSignMut.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white">
              {fcSignMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Enviar para FCSign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Liberar */}
      <Dialog open={liberarOpen} onOpenChange={setLiberarOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <ShieldCheck className="h-5 w-5" /> Liberar Permissão de Trabalho
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Responsável da área</label>
              <Input value={liberarForm.responsavelAreaNome}
                onChange={e => setLiberarForm(f => ({ ...f, responsavelAreaNome: e.target.value }))}
                placeholder="Nome" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Responsável pela liberação</label>
              <Input value={liberarForm.responsavelLiberacaoNome}
                onChange={e => setLiberarForm(f => ({ ...f, responsavelLiberacaoNome: e.target.value }))}
                placeholder="Nome" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Responsável pela execução</label>
              <Input value={liberarForm.executanteNome}
                onChange={e => setLiberarForm(f => ({ ...f, executanteNome: e.target.value }))}
                placeholder="Nome" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiberarOpen(false)}>Cancelar</Button>
            <Button onClick={handleLiberar} disabled={liberarMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {liberarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Confirmar Liberação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Concluir */}
      <Dialog open={concluirOpen} onOpenChange={setConcluirOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <CheckCircle2 className="h-5 w-5" /> Concluir Permissão de Trabalho
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Nome do solicitante</label>
              <Input value={concluirForm.conclusaoSolicitanteNome}
                onChange={e => setConcluirForm(f => ({ ...f, conclusaoSolicitanteNome: e.target.value }))}
                placeholder="Nome" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Data</label>
                <Input type="date" value={concluirForm.conclusaoData}
                  onChange={e => setConcluirForm(f => ({ ...f, conclusaoData: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Hora início</label>
                <Input type="time" value={concluirForm.conclusaoHoraInicio}
                  onChange={e => setConcluirForm(f => ({ ...f, conclusaoHoraInicio: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Hora fim</label>
                <Input type="time" value={concluirForm.conclusaoHoraFim}
                  onChange={e => setConcluirForm(f => ({ ...f, conclusaoHoraFim: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConcluirOpen(false)}>Cancelar</Button>
            <Button onClick={handleConcluir} disabled={concluirMut.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white">
              {concluirMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar Conclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InfoChip({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-700 break-words">{value}</p>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function PermissaoTrabalho() {
  const { companyId } = useCompany();
  const [novaPTOpen, setNovaPTOpen] = useState(false);
  const [selectedPT, setSelectedPT] = useState<number | null>(null);
  const [detalheOpen, setDetalheOpen] = useState(false);
  const [statusFiltro, setStatusFiltro] = useState<string>("");

  const statsQ = trpc.ptPermissoes.stats.useQuery({ companyId }, { staleTime: 30_000 });
  const listQ  = trpc.ptPermissoes.list.useQuery(
    { companyId, status: statusFiltro || undefined },
    { staleTime: 15_000 },
  );

  const pts = (listQ.data as any[]) ?? [];
  const stats = statsQ.data;

  const handleCreated = (id: number) => {
    listQ.refetch();
    statsQ.refetch();
    setSelectedPT(id);
    setDetalheOpen(true);
  };

  const STAT_CARDS = [
    { label: "Em Andamento", value: stats?.em_andamento ?? 0, color: "text-amber-700",  bg: "bg-amber-50 border-amber-200",  dot: "bg-amber-500",  filter: "em_andamento" },
    { label: "Liberadas",    value: stats?.liberada ?? 0,     color: "text-green-700",  bg: "bg-green-50 border-green-200",  dot: "bg-green-500",  filter: "liberada" },
    { label: "Concluídas",   value: stats?.concluida ?? 0,    color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",   dot: "bg-blue-500",   filter: "concluida" },
    { label: "Total",        value: stats?.total ?? 0,        color: "text-slate-700",  bg: "bg-white border-slate-200",    dot: "bg-slate-400",  filter: "" },
  ];

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <HardHat className="h-7 w-7 text-emerald-600" />
              Permissão de Trabalho (PT)
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Gestão digital de Permissões de Trabalho em Altura — NR-35. 100% paperless.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { listQ.refetch(); statsQ.refetch(); }}
              disabled={listQ.isFetching}
              className="border-slate-200">
              <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={() => setNovaPTOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4 mr-1" />
              Nova PT
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STAT_CARDS.map(s => (
            <button key={s.filter}
              onClick={() => setStatusFiltro(sf => sf === s.filter ? "" : s.filter)}
              className={`flex flex-col gap-1 p-4 rounded-xl border-2 text-left transition-all hover:shadow-md
                ${statusFiltro === s.filter ? s.bg + " ring-2 ring-offset-1 " + (s.dot.replace("bg-", "ring-")) : "bg-white border-slate-100 hover:border-slate-200"}`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                <span className="text-xs text-slate-500 font-medium">{s.label}</span>
              </div>
              <span className={`text-3xl font-bold ${s.color}`}>{s.value}</span>
            </button>
          ))}
        </div>

        {/* Filtro de status */}
        {statusFiltro && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Filtrando por:</span>
            <StatusBadge status={statusFiltro} />
            <button onClick={() => setStatusFiltro("")}
              className="text-xs text-slate-400 hover:text-slate-600 underline">limpar</button>
          </div>
        )}

        {/* Lista de PTs */}
        {listQ.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>
        ) : pts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <HardHat className="h-16 w-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Nenhuma PT encontrada</p>
            <p className="text-sm mt-1">Clique em "Nova PT" para emitir a primeira Permissão de Trabalho.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {pts.map((pt: any) => (
              <PTCard
                key={pt.id}
                pt={pt}
                onClick={() => { setSelectedPT(pt.id); setDetalheOpen(true); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Wizard nova PT */}
      <WizardNovaPT
        open={novaPTOpen}
        onOpenChange={setNovaPTOpen}
        companyId={companyId}
        onCreated={handleCreated}
      />

      {/* Detalhe / assinaturas */}
      <PTDetalheDialog
        ptId={selectedPT}
        companyId={companyId}
        open={detalheOpen}
        onOpenChange={setDetalheOpen}
        onRefresh={() => { listQ.refetch(); statsQ.refetch(); }}
      />
    </DashboardLayout>
  );
}

// ── Card de PT ─────────────────────────────────────────────────────────────────
function PTCard({ pt, onClick }: { pt: any; onClick: () => void }) {
  const assinados = (pt.envolvidos ?? []).filter((e: any) => e.nome).length;
  const tipos: string[] = pt.tiposTrabalho ?? [];

  return (
    <button onClick={onClick}
      className="group flex flex-col gap-3 p-4 bg-white rounded-xl border border-slate-100 shadow-sm
        hover:shadow-md hover:border-emerald-200 transition-all text-left">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <HardHat className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-bold text-slate-800 text-sm">{pt.numero}</p>
            <p className="text-xs text-slate-400">{pt.dataEmissao ?? "—"}</p>
          </div>
        </div>
        <StatusBadge status={pt.status} />
      </div>

      {/* Obra / solicitante */}
      {(pt.obraNome || pt.solicitanteNome) && (
        <div className="space-y-1">
          {pt.obraNome && (
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <MapPin className="h-3 w-3" />{pt.obraNome}
            </p>
          )}
          {pt.solicitanteNome && (
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <User className="h-3 w-3" />{pt.solicitanteNome}
            </p>
          )}
        </div>
      )}

      {/* Tipos de trabalho */}
      {tipos.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tipos.slice(0, 3).map(t => {
            const cfg = TIPOS_TRABALHO.find(x => x.key === t);
            return <span key={t} className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{cfg?.label ?? t}</span>;
          })}
          {tipos.length > 3 && <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">+{tipos.length - 3}</span>}
        </div>
      )}

      {/* Footer com envolvidos e horário */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-50">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" /> {assinados} envolvido{assinados !== 1 ? "s" : ""}
        </span>
        {(pt.horaInicio || pt.horaTermino) && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {pt.horaInicio ?? "—"} – {pt.horaTermino ?? "—"}
          </span>
        )}
        <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-emerald-500 transition-all" />
      </div>
    </button>
  );
}
