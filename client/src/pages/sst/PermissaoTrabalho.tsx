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
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/hooks/useConfirm";
import { toast } from "sonner";
import {
  ClipboardCheck, Plus, ChevronRight, ChevronLeft, Check, X as XIcon,
  Loader2, HardHat, Users, AlertTriangle, CheckCircle2, Clock,
  ShieldCheck, FileText, MapPin, User, PenLine, Eraser,
  ChevronDown, ChevronUp, Eye, Pencil, Ban, ArrowRight, Building2,
  RefreshCw, Printer, Wrench, Info, Trash2, SquarePen,
  Paperclip, Camera,
} from "lucide-react";

// ── Tipos de trabalho — 10 tipos com NR de referência ─────────────────────────
const TIPOS_TRABALHO = [
  { key: "altura",           label: "Trabalho em Altura",       emoji: "⬆️",  nr: "NR-35" },
  { key: "espaco_confinado", label: "Espaço Confinado",          emoji: "🕳️",  nr: "NR-33" },
  { key: "escavacao",        label: "Escavação / Fundação",      emoji: "⛏️",  nr: "NR-18" },
  { key: "andaime",          label: "Montagem de Andaime",       emoji: "🏗️",  nr: "NR-35/18" },
  { key: "eletrica",         label: "Instalação Elétrica",       emoji: "⚡",   nr: "NR-10" },
  { key: "demolicao",        label: "Demolição",                 emoji: "🔨",  nr: "NR-18" },
  { key: "icamento",         label: "Içamento de Cargas",        emoji: "🪝",  nr: "NR-11" },
  { key: "soldagem",         label: "Soldagem / Corte a Quente", emoji: "🔥",  nr: "NR-18" },
  { key: "cobertura",        label: "Cobertura / Telhado",       emoji: "🏚️",  nr: "NR-18/35" },
  { key: "geral",            label: "Atividade Geral",           emoji: "🦺",  nr: "NR-18" },
];

// ── Checklists por tipo de trabalho ───────────────────────────────────────────
const PT_CHECKLISTS: Record<string, string[]> = {
  altura: [
    "Todas as pessoas envolvidas no trabalho em altura possuem treinamento NR-35 válido (não vencido)?",
    "Todas as pessoas envolvidas possuem Atestado de Saúde Ocupacional (ASO) atualizado?",
    "As condições climáticas são propícias para o trabalho em altura (sem chuva, raio ou vento forte)?",
    "Foi determinado um supervisor para execução do serviço?",
    "Todos os recursos necessários para execução dos trabalhos em altura foram previstos e estão disponíveis?",
    "Foi estabelecida a firma de atendimento/resgate de emergência para o trabalho em altura?",
    "Foi estabelecido um plano de comunicação entre os envolvidos na execução do serviço?",
    "Os pontos de fixação dos sistemas de proteção contra quedas foram aprovados por pessoa autorizada?",
    "Foi elaborado plano de trabalho para prevenção do risco de queda de materiais e ferramentas?",
    "A proximidade com pontos de energia (elétrica, química, hidráulica, pneumática etc.) foi avaliada e os riscos controlados?",
    "O serviço de contratada — PT foi devidamente preenchida e entregue?",
    "Todos os EPIs (cinto de segurança, talabarte, trava-quedas) foram inspecionados e aprovados?",
    "Todo local do serviço e área abaixo está isolado e sinalizado?",
    "Existe procedimento específico, escrito, testado e aprovado para realização deste trabalho?",
    "As pessoas envolvidas estão usando todos os EPIs necessários à área operacional?",
  ],
  espaco_confinado: [
    "Permissão de Entrada e Trabalho (PET) emitida e assinada pelo supervisor responsável?",
    "Identificação e avaliação dos riscos atmosféricos realizada antes da entrada?",
    "Análise atmosférica (O₂, CO, H₂S, LEL) realizada com detector calibrado?",
    "Ventilação forçada instalada e operando continuamente durante o trabalho?",
    "Vigias treinados em NR-33 posicionados no exterior durante toda a operação?",
    "Sistema de resgate (tripé, talha, cabo de vida) preparado e testado antes da entrada?",
    "Bloqueio e etiquetagem (LOTO) de todas as energias perigosas aplicados?",
    "Comunicação entre equipe interna e vigia estabelecida (rádio ou sinal padronizado)?",
    "EPIs específicos (máscara SCBA ou adução de ar, arnês completo) disponíveis e inspecionados?",
    "Plano de resgate de emergência definido, documentado e comunicado a todos?",
  ],
  escavacao: [
    "Sondagem e análise do tipo de solo realizada por profissional habilitado (ART/RRT)?",
    "Levantamento de interferências (água, esgoto, gás, elétrica) concluído e sinalizado?",
    "Inclinação dos taludes ou escoramento adequado projetado e instalado?",
    "Sinalização, barricadas e telas de proteção instaladas ao redor da escavação?",
    "Plataformas de acesso (escadas) instaladas a cada 3 m de profundidade?",
    "Maquinário pesado posicionado a distância segura das bordas da escavação?",
    "Sistema de drenagem/esgotamento disponível (bomba d'água)?",
    "Inspeção visual das paredes e fundo realizada antes de cada turno?",
    "EPIs adequados disponíveis para todos (capacete, bota impermeável, colete refletivo)?",
    "Plano de emergência para solapamento/desmoronamento elaborado e comunicado?",
  ],
  andaime: [
    "Projeto ou esquema de montagem aprovado por responsável técnico (ART/RRT)?",
    "Materiais do andaime (tubos, abraçadeiras, plataformas) inspecionados e aprovados?",
    "Montagem realizada ou supervisionada por montador de andaime habilitado?",
    "Guarda-corpos (H ≥ 1,20 m), rodapés e travamentos instalados em todos os lados?",
    "Capacidade de carga calculada, documentada e respeitada durante o uso?",
    "Ancoragem ou contraventamento adequado à estrutura existente verificado?",
    "EPIs para trabalho em altura disponíveis para todos os montadores (NR-35)?",
    "Área abaixo do andaime isolada durante montagem, uso e desmontagem?",
    "Tag de inspeção preenchida, assinada e afixada de forma visível no andaime?",
    "Plano de resgate em caso de queda elaborado e comunicado à equipe?",
  ],
  eletrica: [
    "Trabalho pode ser realizado com o sistema elétrico desenergizado (preferível)?",
    "Bloqueio e etiquetagem (LOTO) dos circuitos aplicados por eletricista qualificado NR-10?",
    "Ausência de tensão confirmada com detector de tensão aprovado (antes de tocar)?",
    "Aterramento temporário aplicado nos pontos de trabalho?",
    "Todos os eletricistas possuem habilitação NR-10 (Módulo I e II) válida?",
    "Ferramentas isoladas e EPIs dielétricos (luvas classe adequada, capacete, óculos) disponíveis?",
    "Sinalização de área de risco elétrico instalada e acesso controlado?",
    "Condições ambientais (umidade, poeira condutora, temperatura) avaliadas e controladas?",
    "Plano de resgate para vítima de choque elétrico elaborado, comunicado e treinado?",
    "Laudos de inspeção das ferramentas e EPIs dielétricos dentro do prazo de validade?",
  ],
  demolicao: [
    "Projeto de demolição ou método executivo aprovado por responsável técnico (ART/RRT)?",
    "Levantamento de interferências ativas (instalações de energia, gás, água) concluído?",
    "Estruturas adjacentes avaliadas e escoradas se houver risco de colapso?",
    "Área de demolição isolada e sinalizada para acesso estritamente controlado?",
    "Supressão de poeira (aspersão de água) prevista e aplicada durante o processo?",
    "EPIs para demolição (capacete, óculos, respirador P2, luvas, calçado de segurança) disponíveis?",
    "Destinação, transporte e remoção de entulho planejados e autorizados?",
    "Verificação da presença de materiais perigosos (amianto, chumbo, aditivos) realizada?",
    "Plano de emergência estrutural elaborado e comunicado à equipe e vizinhança?",
    "Comunicado de demolição emitido para áreas vizinhas e órgão responsável, se necessário?",
  ],
  icamento: [
    "Plano de rigging (içamento) elaborado e aprovado por responsável técnico?",
    "Capacidade de carga dos equipamentos de içamento verificada e dentro do limite seguro?",
    "Inspeção de cabos, cintas, grilhetas, manilhas e acessórios realizada e documentada?",
    "Área de içamento isolada — raio de queda livre completamente livre de pessoas?",
    "Sinaleiro treinado e posicionado com visibilidade total durante toda a operação?",
    "Operador de guindaste/munck habilitado, com CNH e documentação do equipamento em dia?",
    "Condições de vento avaliadas e dentro do limite operacional do equipamento?",
    "Comunicação entre operador e sinaleiro estabelecida (rádio ou sinais padronizados)?",
    "Carga equilibrada, amarrada e testada (levantamento de prova) antes de içar?",
    "Plano de emergência para queda de carga elaborado e comunicado à equipe?",
  ],
  soldagem: [
    "Autorização para trabalho a quente emitida e assinada pelo responsável da área?",
    "Área de soldagem isolada e sinalizada com raio mínimo de 10 m?",
    "Materiais combustíveis removidos ou protegidos com biombos corta-fogo?",
    "Extintor de incêndio adequado posicionado imediatamente próximo ao local de trabalho?",
    "Vigilante de incêndio (firewatch) designado durante a soldagem e por 30 min após o término?",
    "Ventilação adequada para remoção de fumos metálicos e gases tóxicos?",
    "Soldador com habilitação e máquina/eletrodos inspecionados antes do início?",
    "EPIs para soldagem (máscara de solda, luvas raspa, avental, perneiras, calçado) disponíveis?",
    "Verificação de ausência de gases inflamáveis (explosimetro) no local realizada?",
    "Inspeção pós-trabalho (mínimo 30 min após término) prevista para detectar pontos quentes?",
  ],
  cobertura: [
    "Trabalhadores possuem treinamento NR-35 (trabalho em altura) válido e não vencido?",
    "Linha de vida ou sistema de ancoragem instalado e aprovado pelo responsável técnico?",
    "Redes de proteção ou guarda-corpo perimetral instalados nas bordas da cobertura?",
    "Telhas e estrutura do telhado inspecionadas quanto à capacidade de carga e estado geral?",
    "Plataforma de acesso (escada ou andaime) segura, estável e fixada?",
    "Área abaixo da cobertura isolada contra queda de materiais e ferramentas?",
    "Condições climáticas favoráveis (sem chuva, sem raio, sem vento forte) confirmadas?",
    "EPIs obrigatórios (capacete, cinturão tipo paraquedista, talabarte, calçado antiderrapante) disponíveis?",
    "Plano de resgate para queda na cobertura elaborado e comunicado a todos?",
    "Comunicação entre trabalhadores na cobertura e equipe no solo estabelecida?",
  ],
  geral: [
    "Todas as pessoas envolvidas possuem treinamentos obrigatórios para a atividade atualizados?",
    "Atestado de Saúde Ocupacional (ASO) atualizado para todos os envolvidos?",
    "Área de trabalho isolada, sinalizada e com acesso controlado?",
    "Riscos da atividade identificados e medidas de controle implementadas antes do início?",
    "EPIs necessários para a atividade disponíveis, inspecionados e em bom estado?",
    "Ferramentas e equipamentos inspecionados e aprovados antes do uso?",
    "Supervisor ou responsável pela execução designado e presente?",
    "Plano de emergência comunicado a todos os envolvidos antes do início?",
    "Interferências com outros serviços ou áreas adjacentes avaliadas e comunicadas?",
    "Condições ambientais (temperatura, iluminação, umidade, ventilação) favoráveis?",
  ],
};

type ChecklistResp = "S" | "N" | "NA" | undefined;
type ChecklistState = Record<string, ChecklistResp>;

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
      utils.ptPermissoes.getById.invalidate({ id: ptId, companyId });
      toast.success("Assinatura salva!");
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao salvar assinatura."); }
  };

  const remover = async () => {
    const ok = await confirm({ title: "Remover assinatura?", description: "Esta ação remove a assinatura desta posição.", tone: "destructive" });
    if (!ok) return;
    try {
      await removerMut.mutateAsync({ ptId, companyId, posicao });
      utils.ptPermissoes.getById.invalidate({ id: ptId, companyId });
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

// ── Utilitário: formata CNPJ enquanto o usuário digita ───────────────────────
const formatCNPJ = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2)  return d;
  if (d.length <= 5)  return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8)  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
};

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
  outrosFormulariosAnexoUrl: string;
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
  const now = new Date();
  const today = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
  const horaAtual = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo", hour12: false,
  });
  return {
    employeeId: null, obraId: null,
    dataEmissao: today, horaInicio: horaAtual, horaTermino: "",
    maoDeObra: "interna", supervisorNome: "",
    empresaExecutanteCnpj: "", empresaExecutanteNome: "",
    outrosFormularios: false, outrosFormulariosDesc: "", outrosFormulariosAnexoUrl: "",
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
  const { selectedCompany } = useCompany();

  const obrasQ    = trpc.obras.listActive.useQuery({ companyId }, { enabled: open });
  const empsQ     = trpc.getEmployees.useQuery({ companyId }, { enabled: open });
  const numQ      = trpc.ptPermissoes.proximoNumero.useQuery({ companyId }, { enabled: open });
  const obraSSTQ  = trpc.ptPermissoes.getObraSST.useQuery(
    { companyId, obraId: form.obraId! },
    { enabled: open && !!form.obraId }
  );
  const obraFuncsQ = trpc.obras.funcionarios.useQuery(
    { obraId: form.obraId! },
    { enabled: open && !!form.obraId }
  );
  const obraTerceirosQ = trpc.terceiros.funcionarios.list.useQuery(
    { companyId, obraId: form.obraId! },
    { enabled: open && !!form.obraId }
  );
  const createMut = trpc.ptPermissoes.create.useMutation();

  const upd = (patch: Partial<NovaPTState>) => setForm(f => ({ ...f, ...patch }));

  // ── CNPJ auto-fill ─────────────────────────────────────────────────────────
  const [cnpjAutoFilled, setCnpjAutoFilled] = useState(false);
  const cnpjLimpoW = form.empresaExecutanteCnpj.replace(/\D/g, "");
  const cnpjQ = trpc.compras.buscarCNPJ.useQuery(
    { cnpj: cnpjLimpoW },
    { enabled: form.maoDeObra === "externa" && cnpjLimpoW.length === 14, staleTime: 5 * 60 * 1000, retry: false },
  );

  const [aptUploading, setAptUploading] = useState(false);
  const aptFileRef = useRef<HTMLInputElement>(null);
  const aptCamRef  = useRef<HTMLInputElement>(null);

  const handleAptUpload = async (file: File) => {
    setAptUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipo", "apt");
      fd.append("companyId", String(companyId));
      const r = await fetch("/api/upload/sst-document", { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err?.error ?? "Falha no upload"); }
      const { url } = await r.json();
      upd({ outrosFormulariosAnexoUrl: url });
      toast.success("Documento APT anexado!");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar arquivo.");
    } finally {
      setAptUploading(false);
    }
  };

  useEffect(() => {
    if (open) {
      const companyName = (selectedCompany as any)?.nomeFantasia || (selectedCompany as any)?.razaoSocial || "";
      setStep(0);
      setForm(s => ({
        ...initialState(),
        employeeId: s.employeeId ?? (user?.employeeId ?? null),
        empresaSetorExecutante: companyName,
      }));
    }
  }, [open]);

  useEffect(() => {
    if (user?.employeeId && !form.employeeId) upd({ employeeId: user.employeeId });
  }, [user?.employeeId]);

  // Auto-fill supervisor + responsável da área com encarregado da obra
  useEffect(() => {
    const enc = (obraSSTQ.data as any)?.encarregadoNome ?? null;
    if (enc) upd({ supervisorNome: enc, responsavelAreaNome: enc });
  }, [(obraSSTQ.data as any)?.encarregadoNome]);

  // Auto-fill razão social quando o CNPJ completo retorna da API
  useEffect(() => {
    if (!cnpjQ.data) return;
    const nome = (cnpjQ.data as any).razaoSocial || (cnpjQ.data as any).nomeFantasia || "";
    if (nome && (!form.empresaExecutanteNome || cnpjAutoFilled)) {
      upd({ empresaExecutanteNome: nome });
      setCnpjAutoFilled(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpjQ.data]);

  // NR-33 nunca pode ser combinada com outros tipos (PET exclusiva por lei)
  const nr33Conflito = useMemo(() =>
    form.tiposTrabalho.includes("espaco_confinado") && form.tiposTrabalho.length > 1,
    [form.tiposTrabalho]
  );

  // Checklist: seções por tipo selecionado (uma por NR)
  const activeChecklistSections = useMemo(() => {
    if (form.tiposTrabalho.length === 0) {
      const t = TIPOS_TRABALHO.find(x => x.key === "geral")!;
      return [{ key: "geral", tipo: t, items: PT_CHECKLISTS.geral }];
    }
    return form.tiposTrabalho.map(key => {
      const t = TIPOS_TRABALHO.find(x => x.key === key) ?? TIPOS_TRABALHO[TIPOS_TRABALHO.length - 1];
      return { key, tipo: t, items: PT_CHECKLISTS[key] ?? PT_CHECKLISTS.geral };
    });
  }, [form.tiposTrabalho]);

  // Checklist: conta respostas em todas as seções ativas
  const checkCount = useMemo(() => {
    let s = 0, n = 0, na = 0, blank = 0;
    for (const sec of activeChecklistSections) {
      for (let i = 1; i <= sec.items.length; i++) {
        const v = form.checklist[`${sec.key}:${i}`];
        if (v === "S") s++; else if (v === "N") n++; else if (v === "NA") na++; else blank++;
      }
    }
    return { s, n, na, blank };
  }, [form.checklist, activeChecklistSections]);

  const setCheck = (typeKey: string, i: number, v: ChecklistResp) => {
    const k = `${typeKey}:${i}`;
    setForm(f => ({ ...f, checklist: { ...f.checklist, [k]: f.checklist[k] === v ? undefined : v } }));
  };

  // Seções do accordion: abertas por padrão ao entrar no checklist
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  // Dropdown customizado para "Responsável pela execução" (com foto)
  const [executanteDropOpen, setExecutanteDropOpen] = useState(false);
  const executanteDropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!executanteDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (executanteDropRef.current && !executanteDropRef.current.contains(e.target as Node)) {
        setExecutanteDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [executanteDropOpen]);
  useEffect(() => {
    if (step === 2) {
      setOpenSections(new Set(activeChecklistSections.map(s => s.key)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

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
        outrosFormulariosAnexoUrl: form.outrosFormulariosAnexoUrl || null,
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
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* ── Header gradiente ─────────────────────────────────── */}
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-500 px-6 py-4 rounded-t-xl flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg">
              <HardHat className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base leading-tight">Nova Permissão de Trabalho</p>
              <p className="text-emerald-100 text-xs">
                {numQ.data?.numero ?? "PT-???"} · {(() => {
                  const pk = form.tiposTrabalho[0];
                  const t = TIPOS_TRABALHO.find(x => x.key === pk);
                  return t ? `${t.emoji} ${t.nr}` : "Permissão de Trabalho";
                })()}
              </p>
            </div>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-white/70 hover:text-white transition-colors p-1">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* ── Stepper ──────────────────────────────────────────── */}
        <div className="px-6 pt-4 pb-0 shrink-0">
          <div className="flex items-center">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-0.5">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all shadow-sm
                    ${i < step ? "bg-emerald-600 text-white shadow-emerald-200"
                      : i === step ? "bg-emerald-50 border-2 border-emerald-500 text-emerald-700"
                      : "bg-slate-100 border border-slate-200 text-slate-400"}`}>
                    {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className={`text-[10px] font-semibold hidden sm:block whitespace-nowrap
                    ${i === step ? "text-emerald-700" : i < step ? "text-emerald-500" : "text-slate-400"}`}>{s}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 mb-3 rounded-full transition-all ${i < step ? "bg-emerald-400" : "bg-slate-200"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Conteúdo scrollável ──────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        {/* ── Passo 0: Solicitação ────────────────────────────── */}
        {step === 0 && (() => {
          const sst = obraSSTQ.data;
          const userEmpId = user?.employeeId ?? null;
          const isAuthorized = !sst || !form.obraId || (
            (sst.tstId && sst.tstId === userEmpId) ||
            (sst.responsavelId && sst.responsavelId === userEmpId)
          );
          return (
          <div className="space-y-4">
            {/* 1 — Obra (primeiro campo obrigatório) */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Obra <span className="text-red-500 normal-case font-bold">*</span>
              </p>
              <Select
                value={form.obraId?.toString() ?? "_none"}
                onValueChange={v => upd({ obraId: v === "_none" ? null : Number(v) })}
              >
                <SelectTrigger className="bg-white"><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Sem obra vinculada —</SelectItem>
                  {obras.map((o: any) => <SelectItem key={o.id} value={o.id.toString()}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* SST da obra: TST + Engenheiro auto-fill */}
              {form.obraId && (
                obraSSTQ.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-1"><Loader2 className="h-3 w-3 animate-spin" /> Carregando dados da obra…</div>
                ) : sst ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {[
                      { label: "Engenheiro Responsável", icon: <ShieldCheck className="h-3 w-3 text-emerald-600" />, nome: sst.responsavelNome, id: sst.responsavelId, color: "emerald" },
                      { label: "TST", icon: <ShieldCheck className="h-3 w-3 text-orange-500" />, nome: sst.tstNome, id: sst.tstId, color: "orange" },
                      { label: "Encarregado", icon: <HardHat className="h-3 w-3 text-yellow-600" />, nome: sst.encarregadoNome, id: sst.encarregadoId, color: "yellow" },
                    ].map(item => (
                      <div key={item.label} className={`rounded-lg border px-3 py-2 flex items-start gap-2 ${item.id ? "bg-white border-slate-200" : "bg-slate-50 border-dashed border-slate-200"}`}>
                        <div className="mt-0.5">{item.icon}</div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide leading-tight">{item.label}</p>
                          <p className={`text-xs font-medium mt-0.5 break-words ${item.nome ? "text-slate-800" : "text-slate-400 italic"}`}>{item.nome || "Não definido"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null
              )}

              {/* Gate NR-35: somente TST ou Engenheiro pode emitir */}
              {form.obraId && sst && !isAuthorized && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800">Atenção — NR-35</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Segundo a NR-35, a Permissão de Trabalho deve ser emitida pelo Engenheiro responsável ou pelo TST da obra.
                      Seu usuário não está configurado como TST nem como Engenheiro desta obra. A PT pode ser salva, mas pode requerer validação adicional.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 2 — Responsáveis */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Responsáveis
              </p>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 block">Solicitante <span className="text-red-500">*</span></label>
                {user?.employeeId ? (
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 min-h-[38px]">
                    <User className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span className="font-medium flex-1 min-w-0 truncate">
                      {emps.find((e: any) => e.id === user.employeeId)?.nome ?? (user as any).name ?? "Usuário logado"}
                    </span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">Você</span>
                  </div>
                ) : (
                  <Select value={form.employeeId?.toString() ?? ""} onValueChange={v => upd({ employeeId: Number(v) })}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Selecione o solicitante" /></SelectTrigger>
                    <SelectContent>
                      {emps.map((e: any) => <SelectItem key={e.id} value={e.id.toString()}>{e.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1.5 block">Supervisor responsável</label>
                <Input value={form.supervisorNome} onChange={e => upd({ supervisorNome: e.target.value })}
                  placeholder="Nome do supervisor" className="bg-white" />
              </div>
            </div>

            {/* 3 — Local e período */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Período
              </p>
              <div className="grid grid-cols-[1fr_132px_132px] gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">Data</label>
                  <Input type="date" value={form.dataEmissao} onChange={e => upd({ dataEmissao: e.target.value })} className="bg-white w-full" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">Início</label>
                  <Input type="time" value={form.horaInicio} onChange={e => upd({ horaInicio: e.target.value })} className="bg-white w-full" />
                  <p className="text-[10px] text-emerald-600 mt-0.5 leading-none">pré-preenchido</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">Término</label>
                  <Input type="time" value={form.horaTermino} onChange={e => upd({ horaTermino: e.target.value })} className="bg-white w-full" />
                </div>
              </div>
            </div>

            {/* 4 — Execução */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-4 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Quem vai executar o serviço?
              </p>

              {/* Cards de seleção de tipo de mão de obra */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  {
                    value: "interna",
                    title: "Equipe própria",
                    desc: "Funcionários da própria empresa (CLT / quadro próprio) executarão o trabalho em altura.",
                    icon: "👷",
                  },
                  {
                    value: "externa",
                    title: "Empresa contratada",
                    desc: "Uma empresa terceirizada ou contratada externa será responsável pela execução.",
                    icon: "🏗️",
                  },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => upd({ maoDeObra: opt.value })}
                    className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all
                      ${form.maoDeObra === opt.value
                        ? "border-emerald-500 bg-emerald-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300"}`}>
                    <span className="text-xl mt-0.5 select-none">{opt.icon}</span>
                    <div>
                      <p className={`text-sm font-semibold ${form.maoDeObra === opt.value ? "text-emerald-800" : "text-slate-700"}`}>
                        {opt.title}
                        {form.maoDeObra === opt.value && <span className="ml-1.5 text-xs font-normal text-emerald-600">✓ Selecionado</span>}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Campos da empresa contratada */}
              {form.maoDeObra === "externa" && (
                <div className="space-y-2.5">
                  <div className="sm:w-56">
                    <label className="text-xs font-medium text-slate-600 mb-1.5 block">CNPJ <span className="text-slate-400 font-normal">(preencha para buscar automaticamente)</span></label>
                    <div className="relative">
                      <Input
                        value={form.empresaExecutanteCnpj}
                        onChange={e => {
                          const formatted = formatCNPJ(e.target.value);
                          const prevClean = form.empresaExecutanteCnpj.replace(/\D/g, "");
                          const newClean  = formatted.replace(/\D/g, "");
                          if (newClean !== prevClean && cnpjAutoFilled) {
                            upd({ empresaExecutanteCnpj: formatted, empresaExecutanteNome: "" });
                            setCnpjAutoFilled(false);
                          } else {
                            upd({ empresaExecutanteCnpj: formatted });
                          }
                        }}
                        placeholder="00.000.000/0001-00"
                        className="bg-white pr-8"
                        maxLength={18}
                      />
                      {cnpjQ.isFetching && (
                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
                      )}
                      {cnpjAutoFilled && !cnpjQ.isFetching && (
                        <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                      )}
                    </div>
                    {cnpjQ.isError && cnpjLimpoW.length === 14 && (
                      <p className="text-xs text-rose-500 mt-1">CNPJ não encontrado na Receita Federal</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                      Nome da empresa contratada
                      {cnpjAutoFilled && <span className="ml-1.5 text-[10px] text-emerald-600 font-normal">✓ Preenchido automaticamente</span>}
                    </label>
                    <Input
                      value={form.empresaExecutanteNome}
                      onChange={e => { upd({ empresaExecutanteNome: e.target.value }); setCnpjAutoFilled(false); }}
                      placeholder="Razão social da empresa"
                      className="bg-white"
                    />
                  </div>
                </div>
              )}

              {/* Formulários complementares */}
              <div className="space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer bg-white rounded-lg px-3 py-3 border border-slate-200 hover:border-emerald-300 transition-colors">
                  <input type="checkbox" checked={form.outrosFormularios}
                    onChange={e => upd({ outrosFormularios: e.target.checked })}
                    className="mt-0.5 rounded border-slate-300 accent-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">A instalação/contratante exige PT ou documento próprio?</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      Marque se o local do serviço (ex.: indústria, refinaria, condomínio) exige que você
                      também preencha a PT ou APR <em>deles</em>. Você poderá registrar o número ou
                      identificação do documento deles aqui para vincular ao seu.
                    </p>
                  </div>
                </label>
                {form.outrosFormularios && (
                  <div className="space-y-2">
                    <Input value={form.outrosFormulariosDesc}
                      onChange={e => upd({ outrosFormulariosDesc: e.target.value })}
                      placeholder="Ex.: PT Petrobras nº 2024-001, APR da instalação nº 87-B…"
                      className="bg-white" />
                    {/* Anexo do documento APT da contratante */}
                    <input ref={aptFileRef} type="file" accept=".pdf,image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleAptUpload(f); e.target.value = ""; }} />
                    <input ref={aptCamRef} type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleAptUpload(f); e.target.value = ""; }} />
                    <div className="flex items-center gap-2 flex-wrap">
                      <button type="button" disabled={aptUploading}
                        onClick={() => aptFileRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors disabled:opacity-50">
                        <Paperclip className="h-3.5 w-3.5" />
                        Anexar PDF / imagem
                      </button>
                      <button type="button" disabled={aptUploading}
                        onClick={() => aptCamRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors disabled:opacity-50">
                        <Camera className="h-3.5 w-3.5" />
                        Tirar foto
                      </button>
                      {aptUploading && <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />}
                    </div>
                    {form.outrosFormulariosAnexoUrl && (
                      <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                        <FileText className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                        <a href={form.outrosFormulariosAnexoUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-emerald-700 underline truncate flex-1 min-w-0">
                          {decodeURIComponent(form.outrosFormulariosAnexoUrl.split("/").pop()?.split("?")[0] ?? "Ver documento")}
                        </a>
                        <button type="button" onClick={() => upd({ outrosFormulariosAnexoUrl: "" })}
                          className="p-0.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 flex-shrink-0">
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })()}

        {/* ── Passo 1: Descrição do trabalho ─────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5" /> Tipo de trabalho
              </p>
              <p className="text-xs text-slate-400">Selecione todos que se aplicam. Cada tipo terá sua <strong>seção de checklist própria</strong> na etapa seguinte.</p>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS_TRABALHO.map((t, idx) => {
                  const sel = form.tiposTrabalho.includes(t.key);
                  const isPrimary = form.tiposTrabalho[0] === t.key;
                  return (
                    <label key={t.key}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition-all text-sm
                        ${sel
                          ? isPrimary
                            ? "border-emerald-600 bg-emerald-50 text-emerald-800 font-semibold shadow-sm"
                            : "border-emerald-400 bg-emerald-50/60 text-emerald-700 font-medium"
                          : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"}`}>
                      <input type="checkbox" className="hidden"
                        checked={sel}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...form.tiposTrabalho, t.key]
                            : form.tiposTrabalho.filter(x => x !== t.key);
                          upd({ tiposTrabalho: next, checklist: {} });
                        }} />
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0
                        ${sel ? "bg-emerald-500 border-emerald-500" : "border-slate-300"}`}>
                        {sel && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <span className="text-base leading-none select-none">{t.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <span className="block leading-tight">{t.label}</span>
                        <span className={`text-[10px] font-mono ${sel ? "text-emerald-600" : "text-slate-400"}`}>{t.nr}</span>
                      </div>
                      {isPrimary && (
                        <span className="text-[9px] bg-emerald-600 text-white px-1 py-0.5 rounded font-bold shrink-0">Principal</span>
                      )}
                    </label>
                  );
                })}
              </div>
              {/* Alerta de conflito NR-33 */}
              {nr33Conflito && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border-2 border-red-400 rounded-xl mt-1">
                  <Ban className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                  <div className="space-y-1.5">
                    <p className="text-sm font-bold text-red-800">Combinação proibida — NR-33 exige PT exclusiva</p>
                    <p className="text-xs text-red-700 leading-relaxed break-words">
                      De acordo com o <strong>Ministério do Trabalho e Emprego (MTE)</strong>, o trabalho em
                      Espaço Confinado exige a emissão de uma <strong>Permissão de Entrada e Trabalho (PET)</strong> exclusiva,
                      específica por espaço, equipe e turno — não podendo ser combinada com outras atividades em uma única PT.
                    </p>
                    <p className="text-xs font-mono bg-red-100 text-red-700 rounded px-2 py-1.5 break-words">
                      NR-33, item 33.3.3.4 — "A PET deve ser específica para cada tipo de trabalho, equipe e turno de trabalho,
                      não podendo ser reutilizada ou estendida a outros espaços confinados ou equipes."
                    </p>
                    <p className="text-xs text-red-700 font-medium">
                      ← Desmarque os demais tipos e abra uma PT exclusiva para Espaço Confinado (NR-33).
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Descrição detalhada
              </p>
              <Textarea value={form.descricaoTrabalho}
                onChange={e => upd({ descricaoTrabalho: e.target.value })}
                placeholder="Descreva o trabalho a ser executado, o local e as condições do entorno..."
                rows={5} className="text-sm resize-none bg-white" />
            </div>
          </div>
        )}

        {/* ── Passo 2: Checklist por seções (uma seção por NR) ── */}
        {step === 2 && (
          <div className="space-y-2">
            {/* Totalizador global */}
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {activeChecklistSections.length} seção{activeChecklistSections.length > 1 ? "ões" : ""} de checklist
              </p>
              <div className="flex gap-2">
                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">✓ {checkCount.s} S</span>
                <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">✗ {checkCount.n} N</span>
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">{checkCount.na} NA</span>
                {checkCount.blank > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">{checkCount.blank} pendentes</span>
                )}
              </div>
            </div>

            {/* Banners de bloqueio */}
            {checkCount.blank > 0 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">{checkCount.blank} pergunta{checkCount.blank > 1 ? "s" : ""} sem resposta</p>
                  <p className="text-xs text-amber-700 mt-0.5">Responda todas as perguntas para continuar.</p>
                </div>
              </div>
            )}
            {checkCount.n > 0 && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-300 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-red-800">
                    PT não pode prosseguir — {checkCount.n} não conformidade{checkCount.n > 1 ? "s" : ""} detectada{checkCount.n > 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-red-700 mt-0.5">Regularize todas as respostas "Não" antes de liberar a Permissão de Trabalho.</p>
                </div>
              </div>
            )}

            {/* Seções por tipo/NR */}
            {activeChecklistSections.map(sec => {
              const secOpen = openSections.has(sec.key);
              const secCounts = sec.items.reduce((acc, _, idx) => {
                const v = form.checklist[`${sec.key}:${idx + 1}`];
                if (v === "S") acc.s++; else if (v === "N") acc.n++; else if (v === "NA") acc.na++; else acc.blank++;
                return acc;
              }, { s: 0, n: 0, na: 0, blank: 0 });
              const secDone = secCounts.blank === 0;
              return (
                <div key={sec.key} className={`rounded-xl border-2 overflow-hidden transition-colors
                  ${secCounts.n > 0 ? "border-red-300" : secDone ? "border-emerald-300" : "border-slate-200"}`}>
                  {/* Header da seção — clicável para abrir/fechar */}
                  <button type="button"
                    onClick={() => setOpenSections(prev => {
                      const next = new Set(prev);
                      next.has(sec.key) ? next.delete(sec.key) : next.add(sec.key);
                      return next;
                    })}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors
                      ${secCounts.n > 0 ? "bg-red-50" : secDone ? "bg-emerald-50" : "bg-slate-50"}`}>
                    <span className="text-base leading-none shrink-0">{sec.tipo.emoji}</span>
                    <span className="text-sm font-semibold text-slate-700 flex-1">{sec.tipo.label}</span>
                    <span className="text-[10px] font-mono bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded shrink-0">{sec.tipo.nr}</span>
                    {secDone
                      ? <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold shrink-0">✓ OK</span>
                      : <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold shrink-0">{secCounts.blank} pend.</span>
                    }
                    {secCounts.n > 0 && (
                      <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold shrink-0">{secCounts.n} N</span>
                    )}
                    {secOpen
                      ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
                  </button>

                  {/* Itens da seção */}
                  {secOpen && (
                    <div className="divide-y divide-slate-100 bg-white">
                      {sec.items.map((item, idx) => {
                        const i = idx + 1;
                        const val = form.checklist[`${sec.key}:${i}`];
                        return (
                          <div key={i}
                            className={`flex items-start gap-3 p-3 transition-colors
                              ${val === "S" ? "bg-green-50" : val === "N" ? "bg-red-50" : val === "NA" ? "bg-slate-50" : "bg-white"}`}>
                            <span className="text-xs font-bold text-slate-400 w-5 flex-shrink-0 mt-0.5">{i}.</span>
                            <p className="text-sm text-slate-700 flex-1 leading-relaxed break-words">{item}</p>
                            <div className="flex gap-1 flex-shrink-0">
                              {(["S", "N", "NA"] as const).map(opt => (
                                <button key={opt} onClick={() => setCheck(sec.key, i, opt)}
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
                </div>
              );
            })}
          </div>
        )}

        {/* ── Passo 3: Envolvidos e liberação ────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Envolvidos
                </p>
                {form.obraId ? (
                  <span className="text-xs text-emerald-600 font-medium">Efetivo da obra (próprios + terceiros)</span>
                ) : (
                  <span className="text-xs text-slate-400">até 6 pessoas</span>
                )}
              </div>

              {/* Com obra: checklist de funcionários próprios + terceiros */}
              {form.obraId ? (
                (obraFuncsQ.isLoading || obraTerceirosQ.isLoading) ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-2"><Loader2 className="h-3 w-3 animate-spin" /> Carregando efetivo da obra…</div>
                ) : (() => {
                  const proprios: any[] = (obraFuncsQ.data as any[] ?? []).map((emp: any) => {
                    const nr35 = (emp.nrs ?? []).find((n: any) => n.norma === "NR-35");
                    return {
                      key: `p-${emp.id}`,
                      nome: emp.employee?.nomeCompleto || emp.nomeCompleto || "",
                      funcao: emp.employee?.cargo || emp.cargo || emp.employee?.funcao || emp.funcao || "",
                      fotoUrl: emp.employee?.fotoUrl || null,
                      nr35Status: nr35 ? (nr35.vencida ? "vencida" : "ok") : "sem",
                      isCipa: !!emp.cipaAtivo,
                      emAviso: emp.employee?.status === "Aviso" || emp.employee?.status === "AvisoDispensado",
                      terceiro: false,
                    };
                  });
                  const terceiros: any[] = (obraTerceirosQ.data as any[] ?? []).map((t: any) => ({
                    key: `t-${t.id}`,
                    nome: t.nome,
                    funcao: t.funcao || "",
                    fotoUrl: null,
                    nr35Status: null,
                    isCipa: false,
                    emAviso: false,
                    terceiro: true,
                  }));
                  const todos = [...proprios, ...terceiros];
                  if (todos.length === 0) return (
                    <p className="text-xs text-slate-400 italic py-1">Nenhum efetivo alocado nesta obra.</p>
                  );
                  const renderItem = (item: any) => {
                    const isSelected = form.envolvidos.some(e => e.nome === item.nome);
                    // Bloquear seleção se NR-35 ausente ou vencida (só funcionários próprios)
                    const isBlocked = !item.terceiro && (item.nr35Status === "sem" || item.nr35Status === "vencida");
                    const bloqMsg = item.nr35Status === "vencida"
                      ? "NR-35 vencida — colaborador não habilitado para trabalho em altura"
                      : "Sem NR-35 — colaborador não habilitado para trabalho em altura";

                    return (
                      <div key={item.key}
                        title={isBlocked ? bloqMsg : undefined}
                        className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 border transition-colors
                          ${isBlocked
                            ? "bg-red-50 border-red-200 opacity-70 cursor-not-allowed"
                            : isSelected
                              ? "bg-emerald-50 border-emerald-300 cursor-pointer"
                              : "bg-white border-slate-200 hover:border-emerald-200 cursor-pointer"
                          }`}
                        onClick={() => {
                          if (isBlocked) return;
                          if (isSelected) {
                            upd({ envolvidos: form.envolvidos.filter(e => e.nome !== item.nome) });
                          } else {
                            const blanks = form.envolvidos.filter(e => !e.nome.trim());
                            const filled = form.envolvidos.filter(e => e.nome.trim());
                            upd({ envolvidos: [...filled, { nome: item.nome, funcao: item.funcao }, ...blanks].slice(0, 30) });
                          }
                        }}>
                        {/* Checkbox / ícone de bloqueio */}
                        <div className="shrink-0 mt-2.5">
                          {isBlocked ? (
                            <div className="w-4 h-4 rounded flex items-center justify-center">
                              <Ban className="h-4 w-4 text-red-400" />
                            </div>
                          ) : (
                            <input type="checkbox" checked={isSelected} readOnly
                              className="accent-emerald-600 rounded pointer-events-none" />
                          )}
                        </div>
                        {/* Avatar */}
                        <div className="shrink-0 mt-0.5">
                          {item.fotoUrl ? (
                            <img src={item.fotoUrl} alt="" className={`h-9 w-9 rounded-full object-cover border-2 shadow-sm ${isBlocked ? "border-red-200 grayscale" : "border-white"}`} />
                          ) : (
                            <div className={`h-9 w-9 rounded-full border flex items-center justify-center text-sm font-bold shadow-sm
                              ${isBlocked ? "bg-red-100 border-red-200 text-red-400" : "bg-slate-100 border-slate-200 text-slate-400"}`}>
                              {(item.nome || "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1 flex-wrap">
                            <p className={`text-sm font-medium truncate ${isBlocked ? "text-red-700 line-through" : "text-slate-800"}`}>{item.nome}</p>
                            {item.terceiro && (
                              <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-bold shrink-0">TERCEIRO</span>
                            )}
                            {item.isCipa && (
                              <span className="text-[9px] bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold shrink-0">CIPA</span>
                            )}
                            {item.emAviso && (
                              <span className="text-[9px] bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-bold shrink-0">AVISO PRÉVIO</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {item.funcao && <p className="text-xs text-slate-500">{item.funcao}</p>}
                            {item.nr35Status === "ok" && (
                              <span className="text-[9px] bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full font-bold shrink-0">✓ NR-35</span>
                            )}
                            {item.nr35Status === "vencida" && (
                              <span className="text-[9px] bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full font-bold shrink-0">⚠ NR-35 VENCIDA</span>
                            )}
                            {item.nr35Status === "sem" && (
                              <span className="text-[9px] bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full font-bold shrink-0">SEM NR-35</span>
                            )}
                          </div>
                          {/* Mensagem de bloqueio inline */}
                          {isBlocked && (
                            <p className="text-[10px] text-red-600 font-medium mt-1 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              Não habilitado para trabalho em altura — regularize o treinamento NR-35.
                            </p>
                          )}
                        </div>
                        {isSelected && !isBlocked && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-2.5" />}
                      </div>
                    );
                  };
                  return (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {proprios.length > 0 && (
                        <>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-1">Efetivo próprio ({proprios.length})</p>
                          {proprios.map(renderItem)}
                        </>
                      )}
                      {terceiros.length > 0 && (
                        <>
                          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide px-1 mt-2">Terceiros ({terceiros.length})</p>
                          {terceiros.map(renderItem)}
                        </>
                      )}
                    </div>
                  );
                })()
              ) : (
                /* Sem obra: campos de texto livres */
                <div className="space-y-2">
                  {form.envolvidos.map((env, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <span className="text-xs text-slate-400 font-bold w-5 shrink-0">{idx + 1}.</span>
                      <Input value={env.nome}
                        onChange={e => {
                          const next = [...form.envolvidos];
                          next[idx] = { ...next[idx], nome: e.target.value };
                          upd({ envolvidos: next });
                        }}
                        placeholder={`Nome do envolvido ${idx + 1}`}
                        className="flex-1 text-sm bg-white" />
                      <Input value={env.funcao}
                        onChange={e => {
                          const next = [...form.envolvidos];
                          next[idx] = { ...next[idx], funcao: e.target.value };
                          upd({ envolvidos: next });
                        }}
                        placeholder="Função"
                        className="w-32 text-sm bg-white" />
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Info className="h-3 w-3" /> Assinaturas coletadas após criar a PT.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Liberação da Permissão
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">Empresa / Setor executante</label>
                  <Input value={form.empresaSetorExecutante}
                    onChange={e => upd({ empresaSetorExecutante: e.target.value })}
                    placeholder="Empresa ou setor" className="bg-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">Responsável da área</label>
                  <Input value={form.responsavelAreaNome}
                    onChange={e => upd({ responsavelAreaNome: e.target.value })}
                    placeholder="Nome" className="bg-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">Responsável pela liberação</label>
                  {(() => {
                    const sst3 = obraSSTQ.data as any;
                    const opts = sst3 ? [
                      sst3.tstNome        ? { label: `TST — ${sst3.tstNome}`,                value: sst3.tstNome }        : null,
                      sst3.responsavelNome? { label: `Engenheiro — ${sst3.responsavelNome}`, value: sst3.responsavelNome } : null,
                    ].filter(Boolean) as { label: string; value: string }[] : [];
                    const isCustom = form.responsavelLiberacaoNome !== "" && !opts.some(o => o.value === form.responsavelLiberacaoNome);
                    return opts.length > 0 ? (
                      <div className="space-y-1.5">
                        <Select
                          value={isCustom ? "_outro" : (form.responsavelLiberacaoNome || "")}
                          onValueChange={v => { if (v !== "_outro") upd({ responsavelLiberacaoNome: v }); else upd({ responsavelLiberacaoNome: "" }); }}
                        >
                          <SelectTrigger className="bg-white"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {opts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            <SelectItem value="_outro">Outro (digitar)</SelectItem>
                          </SelectContent>
                        </Select>
                        {isCustom && (
                          <Input value={form.responsavelLiberacaoNome}
                            onChange={e => upd({ responsavelLiberacaoNome: e.target.value })}
                            placeholder="Nome" className="bg-white" autoFocus />
                        )}
                      </div>
                    ) : (
                      <Input value={form.responsavelLiberacaoNome}
                        onChange={e => upd({ responsavelLiberacaoNome: e.target.value })}
                        placeholder="Nome" className="bg-white" />
                    );
                  })()}
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Responsável pela execução
                    <span className="ml-1 font-normal text-slate-400">(líder / encarregado da equipe)</span>
                  </label>
                  {(() => {
                    // Monta mapa nome → fotoUrl cruzando envolvidos com o efetivo da obra
                    const fotoMap: Record<string, string | null> = {};
                    (obraFuncsQ.data as any[] ?? []).forEach((emp: any) => {
                      const nome = emp.employee?.nomeCompleto || emp.nomeCompleto || "";
                      if (nome) fotoMap[nome] = emp.employee?.fotoUrl ?? null;
                    });
                    const envolvidosOpts = form.envolvidos
                      .filter(e => e.nome.trim())
                      .map(e => ({ nome: e.nome, funcao: e.funcao, fotoUrl: fotoMap[e.nome] ?? null }));
                    const isCustom = form.executanteNome !== "" && !envolvidosOpts.some(o => o.nome === form.executanteNome);
                    const selectedOpt = envolvidosOpts.find(o => o.nome === form.executanteNome);

                    if (envolvidosOpts.length === 0) {
                      return (
                        <Input value={form.executanteNome}
                          onChange={e => upd({ executanteNome: e.target.value })}
                          placeholder="Nome do responsável pela execução" className="bg-white" />
                      );
                    }
                    return (
                      <div className="space-y-1.5">
                        {/* Trigger customizado com foto */}
                        <div ref={executanteDropRef} className="relative">
                          <button type="button"
                            onClick={() => setExecutanteDropOpen(o => !o)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 bg-white border border-slate-200 rounded-md hover:border-slate-300 transition-colors text-left">
                            {selectedOpt ? (
                              <>
                                {selectedOpt.fotoUrl ? (
                                  <img src={selectedOpt.fotoUrl} alt="" className="h-7 w-7 rounded-full object-cover border border-slate-200 shrink-0" />
                                ) : (
                                  <div className="h-7 w-7 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-xs font-bold text-emerald-700 shrink-0">
                                    {selectedOpt.nome.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-800 truncate">{selectedOpt.nome}</p>
                                  {selectedOpt.funcao && <p className="text-[10px] text-slate-400 truncate">{selectedOpt.funcao}</p>}
                                </div>
                              </>
                            ) : isCustom ? (
                              <>
                                <div className="h-7 w-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                                  {form.executanteNome.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm text-slate-700 flex-1 truncate">{form.executanteNome}</span>
                              </>
                            ) : (
                              <span className="text-sm text-slate-400 flex-1">Selecione o responsável…</span>
                            )}
                            <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                          </button>

                          {/* Lista dropdown */}
                          {executanteDropOpen && (
                            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                              {envolvidosOpts.map(opt => {
                                const isSel = form.executanteNome === opt.nome;
                                return (
                                  <button key={opt.nome} type="button"
                                    onClick={() => { upd({ executanteNome: opt.nome }); setExecutanteDropOpen(false); }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors
                                      ${isSel ? "bg-emerald-50 border-l-2 border-emerald-500" : "hover:bg-slate-50"}`}>
                                    {opt.fotoUrl ? (
                                      <img src={opt.fotoUrl} alt="" className="h-8 w-8 rounded-full object-cover border-2 border-white shadow shrink-0" />
                                    ) : (
                                      <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-500 shrink-0">
                                        {opt.nome.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm font-medium truncate ${isSel ? "text-emerald-800" : "text-slate-800"}`}>{opt.nome}</p>
                                      {opt.funcao && <p className="text-[10px] text-slate-400 truncate">{opt.funcao}</p>}
                                    </div>
                                    {isSel && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
                                  </button>
                                );
                              })}
                              <button type="button"
                                onClick={() => { upd({ executanteNome: "" }); setExecutanteDropOpen(false); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 border-t border-slate-100">
                                <div className="h-8 w-8 rounded-full bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center shrink-0">
                                  <PenLine className="h-3.5 w-3.5 text-slate-400" />
                                </div>
                                <span className="text-sm text-slate-500">Outro (digitar nome)</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Campo de texto livre quando "Outro" selecionado */}
                        {isCustom && (
                          <Input value={form.executanteNome}
                            onChange={e => upd({ executanteNome: e.target.value })}
                            placeholder="Nome do responsável pela execução" className="bg-white" autoFocus />
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        </div>{/* fim scroll */}

        {/* ── Footer fixo ──────────────────────────────────────── */}
        <div className="flex gap-2 px-6 py-4 border-t bg-white rounded-b-xl shrink-0">
          <Button variant="outline" onClick={() => step > 0 ? setStep(s => s - 1) : onOpenChange(false)}
            className="gap-1">
            {step > 0 ? <><ChevronLeft className="h-4 w-4" /> Anterior</> : "Cancelar"}
          </Button>
          <div className="flex-1" />
          <span className="text-xs text-slate-400 self-center">Passo {step + 1} de {steps.length}</span>
          <div className="flex-1" />
          {step < steps.length - 1 ? (() => {
            const isDescricao = step === 1;
            const isChecklist = step === 2;
            const blocked =
              (isDescricao && nr33Conflito) ||
              (isChecklist && (checkCount.blank > 0 || checkCount.n > 0));
            const tip = isDescricao && nr33Conflito
              ? "Espaço Confinado (NR-33) não pode ser combinado com outros tipos — abra uma PT exclusiva"
              : isChecklist
                ? checkCount.blank > 0
                  ? `${checkCount.blank} pergunta${checkCount.blank > 1 ? "s" : ""} sem resposta`
                  : checkCount.n > 0
                    ? `${checkCount.n} não conformidade${checkCount.n > 1 ? "s" : ""} — regularize antes de prosseguir`
                    : undefined
                : undefined;
            return (
              <Button onClick={() => setStep(s => s + 1)} disabled={blocked} title={tip}
                className={`gap-1 ${blocked ? "opacity-40 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"} text-white bg-emerald-600`}>
                Próximo <ChevronRight className="h-4 w-4" />
              </Button>
            );
          })() : (
            <Button onClick={handleCreate} disabled={createMut.isPending || !form.employeeId}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
              {createMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</> : <><Check className="h-4 w-4" /> Criar PT</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog de detalhes / assinaturas / liberação ──────────────────────────────
function PTDetalheDialog({
  ptId, companyId, open, onOpenChange, onRefresh, onEdit,
}: {
  ptId: number | null; companyId: number; open: boolean;
  onOpenChange: (v: boolean) => void; onRefresh: () => void;
  onEdit?: (id: number) => void;
}) {
  const { selectedCompany } = useCompany();
  const { confirm, ConfirmDialog } = useConfirm();
  const [assinarPad, setAssinarPad] = useState<{ posicao: number; nome: string } | null>(null);
  const [concluirOpen, setConcluirOpen] = useState(false);
  const [liberarOpen, setLiberarOpen] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
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
  const excluirMut    = trpc.ptPermissoes.excluir.useMutation();

  const pt = ptQ.data as any;
  if (!open || ptId === null) return null;

  const handlePrint = async () => {
    if (!ptId) return;
    setPrintLoading(true);
    try {
      const logoUrl = (import.meta as any).env?.VITE_APP_LOGO ?? null;
      const res = await utils.ptPermissoes.gerarHtml.fetch({ id: ptId, companyId, logoUrl });
      const w = window.open("", "_blank");
      if (w) { w.document.write(res.html); w.document.close(); setTimeout(() => w.print(), 400); }
    } catch (e: any) { toast.error(e?.message ?? "Erro ao gerar PDF."); }
    finally { setPrintLoading(false); }
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
    const ok = await confirm({ title: "Cancelar PT?", description: "Esta ação marcará a PT como cancelada. Não é possível desfazer.", tone: "destructive" });
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

  const handleExcluir = async () => {
    const ok = await confirm({
      title: "Excluir PT permanentemente?",
      description: `A PT ${pt?.numero ?? ""} será removida. Esta ação não pode ser desfeita.`,
      tone: "destructive",
      confirmText: "Excluir",
    });
    if (!ok) return;
    try {
      await excluirMut.mutateAsync({ id: ptId!, companyId });
      toast.success("PT excluída.");
      utils.ptPermissoes.list.invalidate({ companyId });
      utils.ptPermissoes.stats.invalidate({ companyId });
      onOpenChange(false);
      onRefresh();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao excluir."); }
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden p-0 flex flex-col gap-0">
          {ptQ.isLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
          )}
          {pt && (() => {
            const fcLogoUrl = (import.meta as any).env?.VITE_APP_LOGO ?? selectedCompany?.logoUrl ?? null;
            const companyName = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "";
            const tiposPt: string[] = (() => { try { return JSON.parse(pt.tiposTrabalhoJson ?? "[]"); } catch { return []; } })();
            const isNewFormat = Object.keys(checklist).some(k => k.includes(":"));
            const hasObraLogos = !!(pt.obraClienteLogoUrl || pt.obraGerenciadoraLogoUrl || pt.obraGerenciadoraNome);

            return (
              <>
                {/* ── Cabeçalho documento ─────────────────────────────────── */}
                <div className="bg-emerald-800 text-white shrink-0">
                  {/* Linha 1: Logo FC + Título + Status */}
                  <div className="flex items-center gap-4 px-6 py-4">
                    {/* Logo FC — container fixo 56×56 para não estourar */}
                    <div className="w-14 h-14 rounded-xl bg-white/15 border border-white/20 overflow-hidden shrink-0 flex items-center justify-center">
                      {fcLogoUrl
                        ? <img src={fcLogoUrl} alt="Logo FC" className="w-full h-full object-contain p-1.5" />
                        : <HardHat className="h-8 w-8 text-white/80" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-[0.2em]">Permissão de Trabalho</p>
                      <h1 className="text-2xl font-black tracking-tight leading-none mt-0.5">{pt.numero}</h1>
                      {companyName && <p className="text-xs text-emerald-300 mt-1 font-medium truncate">{companyName}</p>}
                    </div>
                    <div className="shrink-0">
                      <StatusBadge status={pt.status} />
                    </div>
                  </div>

                  {/* Linha 2: Logos cliente + gerenciadora — containers fixos para não estourar */}
                  {hasObraLogos && (
                    <div className="flex flex-wrap items-center gap-3 px-6 pb-3 border-t border-white/10 pt-3">
                      {(pt.obraClienteLogoUrl || pt.obraClienteNome) && (
                        <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2.5 py-2 border border-white/15">
                          {pt.obraClienteLogoUrl && (
                            <div className="w-10 h-8 rounded overflow-hidden shrink-0 bg-white flex items-center justify-center">
                              <img src={pt.obraClienteLogoUrl} alt="Cliente" className="w-full h-full object-contain p-0.5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider leading-none">Cliente</p>
                            {pt.obraClienteNome && <p className="text-[11px] text-white font-semibold truncate max-w-[120px] leading-tight mt-0.5">{pt.obraClienteNome}</p>}
                          </div>
                        </div>
                      )}
                      {(pt.obraGerenciadoraLogoUrl || pt.obraGerenciadoraNome) && (
                        <div className="flex items-center gap-2 bg-white/10 rounded-lg px-2.5 py-2 border border-white/15">
                          {pt.obraGerenciadoraLogoUrl && (
                            <div className="w-10 h-8 rounded overflow-hidden shrink-0 bg-white flex items-center justify-center">
                              <img src={pt.obraGerenciadoraLogoUrl} alt="Gerenciadora" className="w-full h-full object-contain p-0.5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-[9px] text-emerald-300 font-bold uppercase tracking-wider leading-none">Gerenciadora</p>
                            {pt.obraGerenciadoraNome && <p className="text-[11px] text-white font-semibold truncate max-w-[120px] leading-tight mt-0.5">{pt.obraGerenciadoraNome}</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tipos de trabalho em chips */}
                  {pt.tiposTrabalho?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-6 pb-4">
                      {(pt.tiposTrabalho as string[]).map((t: string) => {
                        const cfg = TIPOS_TRABALHO.find(x => x.key === t);
                        return (
                          <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/15 text-white rounded-full text-xs font-semibold border border-white/20">
                            {cfg?.emoji && <span>{cfg.emoji}</span>}
                            {cfg?.label ?? t}
                            {cfg?.nr && <span className="text-emerald-300 text-[10px] ml-0.5">{cfg.nr}</span>}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Faixa de segurança amarela */}
                <div className="h-1.5 bg-gradient-to-r from-yellow-500 via-yellow-300 to-yellow-500 shrink-0" />

                {/* ── Corpo scrollável ────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto">
                  {/* Tabela de dados da PT */}
                  <div className="border-b border-slate-200">
                    <div className="px-6 pt-4 pb-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dados da Permissão</p>
                    </div>
                    <table className="w-full text-sm border-collapse">
                      <tbody>
                        <tr className="border-b border-slate-100">
                          <td className="px-6 py-2.5 border-r border-slate-100 w-1/4">
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Data</p>
                            <p className="font-semibold text-slate-800">{pt.dataEmissao ?? "—"}</p>
                          </td>
                          <td className="px-6 py-2.5 border-r border-slate-100 w-1/4">
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Início</p>
                            <p className="font-semibold text-slate-800">{pt.horaInicio ?? "—"}</p>
                          </td>
                          <td className="px-6 py-2.5 border-r border-slate-100 w-1/4">
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Término</p>
                            <p className="font-semibold text-slate-800">{pt.horaTermino ?? "—"}</p>
                          </td>
                          <td className="px-6 py-2.5 w-1/4">
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Mão de Obra</p>
                            <p className="font-semibold text-slate-800">{pt.maoDeObra === "externa" ? "Externa" : "Interna"}</p>
                          </td>
                        </tr>
                        {(pt.obraNome || pt.solicitanteNome) && (
                          <tr className="border-b border-slate-100">
                            <td colSpan={2} className="px-6 py-2.5 border-r border-slate-100">
                              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Obra</p>
                              <p className="font-semibold text-slate-800 break-words">{pt.obraNome ?? "—"}</p>
                            </td>
                            <td colSpan={2} className="px-6 py-2.5">
                              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Solicitante</p>
                              <p className="font-semibold text-slate-800 break-words">{pt.solicitanteNome ?? "—"}</p>
                            </td>
                          </tr>
                        )}
                        {pt.supervisorNome && (
                          <tr className="border-b border-slate-100">
                            <td colSpan={4} className="px-6 py-2.5">
                              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Supervisor</p>
                              <p className="font-semibold text-slate-800 break-words">{pt.supervisorNome}</p>
                            </td>
                          </tr>
                        )}
                        {pt.empresaExecutanteNome && (
                          <tr>
                            <td colSpan={4} className="px-6 py-2.5">
                              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Empresa Executante</p>
                              <p className="font-semibold text-slate-800 break-words">{pt.empresaExecutanteNome}</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Descrição */}
                  {pt.descricaoTrabalho && (
                    <div className="px-6 py-4 border-b border-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Descrição do Trabalho</p>
                      <p className="text-sm text-slate-700 break-words leading-relaxed">{pt.descricaoTrabalho}</p>
                    </div>
                  )}

                  {/* Documento APT */}
                  {!!pt.outrosFormularios && (
                    <div className="mx-6 my-4 p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-1.5">
                      <p className="text-xs font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" /> Documento exigido pela instalação/contratante
                      </p>
                      {pt.outrosFormulariosDesc && (
                        <p className="text-sm text-slate-700 break-words">{pt.outrosFormulariosDesc}</p>
                      )}
                      {pt.outrosFormulariosAnexoUrl && (
                        <a href={pt.outrosFormulariosAnexoUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-blue-600 underline hover:text-blue-800">
                          <Paperclip className="h-3.5 w-3.5" />
                          {decodeURIComponent(pt.outrosFormulariosAnexoUrl.split("/").pop()?.split("?")[0] ?? "Ver documento APT")}
                        </a>
                      )}
                    </div>
                  )}

                  {/* Checklist de segurança */}
                  {Object.keys(checklist).length > 0 && (
                    <div className="border-b border-slate-200">
                      <div className="px-6 pt-4 pb-2 flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Checklist de Segurança</p>
                      </div>
                      {isNewFormat ? (() => {
                        const types = tiposPt.length > 0 ? tiposPt : ["geral"];
                        return (
                          <div className="pb-4 space-y-4">
                            {types.map(key => {
                              const tipoInfo = TIPOS_TRABALHO.find(t => t.key === key);
                              const items = PT_CHECKLISTS[key] ?? PT_CHECKLISTS.geral;
                              const hasAnswers = items.some((_, idx) => checklist[`${key}:${idx + 1}`]);
                              if (!hasAnswers) return null;
                              return (
                                <div key={key} className="px-6">
                                  <div className="flex items-center gap-2 mb-2">
                                    {tipoInfo && <span className="text-base">{tipoInfo.emoji}</span>}
                                    <span className="text-xs font-bold text-slate-600">{tipoInfo?.label ?? key}</span>
                                    {tipoInfo?.nr && <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{tipoInfo.nr}</span>}
                                  </div>
                                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <table className="w-full text-xs border-collapse">
                                      <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                          <th className="px-3 py-2 text-left font-semibold text-slate-500 w-8">#</th>
                                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Item</th>
                                          <th className="px-3 py-2 text-center font-semibold text-slate-500 w-12">Resp.</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {items.map((item, idx) => {
                                          const v = checklist[`${key}:${idx + 1}`];
                                          if (!v) return null;
                                          return (
                                            <tr key={idx} className={`border-b border-slate-100 last:border-0
                                              ${v === "S" ? "bg-emerald-50/50" : v === "N" ? "bg-red-50/50" : "bg-slate-50/50"}`}>
                                              <td className="px-3 py-2.5 text-slate-400 font-semibold align-top">{idx + 1}.</td>
                                              <td className={`px-3 py-2.5 break-words leading-relaxed ${v === "S" ? "text-emerald-800" : v === "N" ? "text-red-800" : "text-slate-600"}`}>{item}</td>
                                              <td className="px-3 py-2.5 text-center align-top">
                                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded font-bold text-xs
                                                  ${v === "S" ? "bg-emerald-500 text-white" : v === "N" ? "bg-red-500 text-white" : "bg-slate-300 text-slate-700"}`}>{v}</span>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })() : (() => {
                        const primaryKey = tiposPt[0];
                        const tipoInfo = TIPOS_TRABALHO.find(t => t.key === primaryKey);
                        const checklistItems = PT_CHECKLISTS[primaryKey ?? ""] ?? PT_CHECKLISTS.geral;
                        return (
                          <div className="px-6 pb-4">
                            <div className="flex items-center gap-2 mb-2">
                              {tipoInfo && <span className="text-base">{tipoInfo.emoji}</span>}
                              <span className="text-xs font-bold text-slate-600">{tipoInfo?.label ?? "Geral"}</span>
                              {tipoInfo?.nr && <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{tipoInfo.nr}</span>}
                            </div>
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="px-3 py-2 text-left font-semibold text-slate-500 w-8">#</th>
                                    <th className="px-3 py-2 text-left font-semibold text-slate-500">Item</th>
                                    <th className="px-3 py-2 text-center font-semibold text-slate-500 w-12">Resp.</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {checklistItems.map((item, idx) => {
                                    const i = idx + 1;
                                    const v = checklist[i];
                                    if (!v) return null;
                                    return (
                                      <tr key={i} className={`border-b border-slate-100 last:border-0
                                        ${v === "S" ? "bg-emerald-50/50" : v === "N" ? "bg-red-50/50" : "bg-slate-50/50"}`}>
                                        <td className="px-3 py-2.5 text-slate-400 font-semibold align-top">{i}.</td>
                                        <td className={`px-3 py-2.5 break-words leading-relaxed ${v === "S" ? "text-emerald-800" : v === "N" ? "text-red-800" : "text-slate-600"}`}>{item}</td>
                                        <td className="px-3 py-2.5 text-center align-top">
                                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded font-bold text-xs
                                            ${v === "S" ? "bg-emerald-500 text-white" : v === "N" ? "bg-red-500 text-white" : "bg-slate-300 text-slate-700"}`}>{v}</span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Envolvidos + assinaturas */}
                  {(() => {
                    const lista = envolvidos.length > 0 ? envolvidos : [] as any[];
                    const totalEnv = lista.length;
                    const totalSigned = lista.filter((_: any, i: number) => assinaturasMap.has(i + 1)).length;
                    const allSigned = totalEnv > 0 && totalSigned === totalEnv;
                    const pendentes = lista.filter((_: any, i: number) => !assinaturasMap.has(i + 1)).map((e: any) => e.nome || `Envolvido ${lista.indexOf(e) + 1}`);
                    if (lista.length === 0) return null;
                    return (
                      <div className="border-b border-slate-200">
                        <div className="px-6 pt-4 pb-3">
                          <div className="flex items-center gap-2 mb-3">
                            <Users className="h-4 w-4 text-slate-500" />
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Envolvidos e Assinaturas</p>
                          </div>

                          {/* Banner status */}
                          <div className={`rounded-xl border px-4 py-3 mb-4 ${allSigned ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-sm font-bold ${allSigned ? "text-emerald-700" : "text-amber-700"}`}>
                                {allSigned ? "✅ Todas as assinaturas coletadas" : `⏳ ${totalSigned} de ${totalEnv} assinatura${totalEnv > 1 ? "s" : ""} coletada${totalSigned !== 1 ? "s" : ""}`}
                              </span>
                              <span className={`text-xs font-black px-2.5 py-1 rounded-full ${allSigned ? "bg-emerald-200 text-emerald-800" : "bg-amber-200 text-amber-800"}`}>
                                {totalSigned}/{totalEnv}
                              </span>
                            </div>
                            <div className="w-full h-2 bg-white/70 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${allSigned ? "bg-emerald-500" : "bg-amber-400"}`}
                                style={{ width: `${(totalSigned / totalEnv) * 100}%` }} />
                            </div>
                            {!allSigned && pendentes.length > 0 && (
                              <p className="text-xs text-amber-700 mt-2">
                                <span className="font-semibold">Falta assinar: </span>{pendentes.join(" · ")}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {lista.map((env: any, idx: number) => {
                              const pos = idx + 1;
                              const signed = assinaturasMap.has(pos);
                              const assSig = pt.assinaturas?.find((a: any) => a.posicao === pos);
                              return (
                                <button key={pos}
                                  onClick={() => setAssinarPad({ posicao: pos, nome: env.nome || `Envolvido ${pos}` })}
                                  className={`flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all group
                                    ${signed ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100" : "border-dashed border-slate-200 hover:border-emerald-300 bg-white hover:bg-slate-50"}`}>
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors
                                    ${signed ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-600"}`}>
                                    {signed ? <Check className="h-5 w-5" /> : <PenLine className="h-4 w-4" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-800 truncate">
                                      {env.nome || <span className="text-slate-400 italic">Posição {pos}</span>}
                                    </p>
                                    {env.funcao && <p className="text-xs text-slate-400 truncate">{env.funcao}</p>}
                                    {signed && assSig?.assinadoEm ? (
                                      <p className="text-xs text-emerald-600 mt-0.5 font-medium">
                                        ✓ {new Date(assSig.assinadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                      </p>
                                    ) : (
                                      <p className="text-xs text-amber-500 mt-0.5">⏳ Aguardando assinatura</p>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Liberação */}
                  {(pt.responsavelAreaNome || pt.responsavelLiberacaoNome || pt.executanteNome) && (
                    <div className="border-b border-slate-200">
                      <div className="px-6 pt-4 pb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <ShieldCheck className="h-4 w-4 text-emerald-600" />
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Liberação da Permissão</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {pt.empresaSetorExecutante && (
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Empresa / Setor</p>
                              <p className="text-sm font-semibold text-slate-800 break-words">{pt.empresaSetorExecutante}</p>
                            </div>
                          )}
                          {pt.responsavelAreaNome && (
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Resp. da Área</p>
                              <p className="text-sm font-semibold text-slate-800 break-words">{pt.responsavelAreaNome}</p>
                            </div>
                          )}
                          {pt.responsavelLiberacaoNome && (
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-0.5">Resp. Liberação</p>
                              <p className="text-sm font-semibold text-slate-800 break-words">{pt.responsavelLiberacaoNome}</p>
                            </div>
                          )}
                          {pt.executanteNome && (
                            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                              <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide mb-0.5">Resp. Execução</p>
                              <p className="text-sm font-semibold text-emerald-800 break-words">{pt.executanteNome}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Conclusão */}
                  {pt.conclusaoData && (
                    <div className="px-6 py-4 border-b border-slate-200">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="h-4 w-4 text-blue-600" />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conclusão</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: "Solicitante", val: pt.conclusaoSolicitanteNome },
                          { label: "Data", val: pt.conclusaoData },
                          { label: "Início", val: pt.conclusaoHoraInicio },
                          { label: "Fim", val: pt.conclusaoHoraFim },
                        ].map(({ label, val }) => val ? (
                          <div key={label} className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                            <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wide mb-0.5">{label}</p>
                            <p className="text-sm font-semibold text-blue-900 break-words">{val}</p>
                          </div>
                        ) : null)}
                      </div>
                    </div>
                  )}

                  {/* Espaço inferior */}
                  <div className="h-4" />
                </div>

                {/* ── Barra de ações (fixa no rodapé) ────────────────────── */}
                <div className="shrink-0 flex flex-wrap gap-2 px-6 py-3.5 border-t border-slate-200 bg-white">
                  <Button variant="outline" onClick={handlePrint} disabled={printLoading}
                    className="border-slate-200 text-slate-600 hover:bg-slate-50">
                    {printLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Printer className="h-4 w-4 mr-1.5" />}
                    {printLoading ? "Gerando..." : "Imprimir / PDF"}
                  </Button>
                  {pt.status === "em_andamento" && (<>
                    <Button variant="outline" onClick={() => { onOpenChange(false); onEdit?.(ptId!); }}
                      className="border-blue-200 text-blue-700 hover:bg-blue-50">
                      <SquarePen className="h-4 w-4 mr-1.5" /> Editar PT
                    </Button>
                    <Button onClick={() => {
                      setLiberarForm({
                        responsavelAreaNome: pt.responsavelAreaNome ?? "",
                        responsavelLiberacaoNome: pt.responsavelLiberacaoNome ?? "",
                        executanteNome: pt.executanteNome ?? "",
                      });
                      setLiberarOpen(true);
                    }} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <ShieldCheck className="h-4 w-4 mr-1.5" /> Liberar PT
                    </Button>
                    <Button variant="outline" onClick={handleCancelar} disabled={cancelarMut.isPending}
                      className="border-red-200 text-red-600 hover:bg-red-50">
                      <Ban className="h-4 w-4 mr-1.5" /> Cancelar PT
                    </Button>
                    <Button variant="outline" onClick={handleExcluir} disabled={excluirMut.isPending}
                      className="border-red-300 text-red-700 hover:bg-red-50">
                      {excluirMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
                      Excluir PT
                    </Button>
                  </>)}
                  {pt.status === "liberada" && (
                    <Button onClick={() => {
                      setConcluirForm({ conclusaoSolicitanteNome: pt.solicitanteNome ?? "", conclusaoData: new Date().toISOString().slice(0, 10), conclusaoHoraInicio: "", conclusaoHoraFim: "" });
                      setConcluirOpen(true);
                    }} className="bg-blue-600 hover:bg-blue-700 text-white">
                      <CheckCircle2 className="h-4 w-4 mr-1.5" /> Concluir PT
                    </Button>
                  )}
                </div>
              </>
            );
          })()}
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
  const { companyIdNum: companyId } = useCompany();
  const [novaPTOpen, setNovaPTOpen] = useState(false);
  const [selectedPT, setSelectedPT] = useState<number | null>(null);
  const [detalheOpen, setDetalheOpen] = useState(false);
  const [statusFiltro, setStatusFiltro] = useState<string>("");
  // seleção múltipla
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // edição
  const [editPtId, setEditPtId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const { confirm, ConfirmDialog } = useConfirm();

  const statsQ = trpc.ptPermissoes.stats.useQuery({ companyId }, { staleTime: 30_000 });
  const listQ  = trpc.ptPermissoes.list.useQuery(
    { companyId, status: statusFiltro || undefined },
    { staleTime: 15_000 },
  );
  const excluirLoteMut = trpc.ptPermissoes.excluirLote.useMutation();

  const pts = (listQ.data as any[]) ?? [];
  const stats = statsQ.data;

  const toggleId = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selectedIds.size === pts.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(pts.map((p: any) => p.id)));
  };
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({
      title: `Excluir ${selectedIds.size} PT${selectedIds.size > 1 ? "s" : ""}?`,
      description: "As Permissões de Trabalho selecionadas serão removidas. Esta ação não pode ser desfeita.",
      tone: "destructive",
      confirmText: "Excluir",
    });
    if (!ok) return;
    try {
      await excluirLoteMut.mutateAsync({ ids: Array.from(selectedIds), companyId });
      toast.success(`${selectedIds.size} PT${selectedIds.size > 1 ? "s" : ""} excluída${selectedIds.size > 1 ? "s" : ""}.`);
      exitSelectMode();
      listQ.refetch(); statsQ.refetch();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao excluir."); }
  };

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
            {selectMode ? (
              <Button variant="outline" size="sm" onClick={exitSelectMode} className="border-slate-200 text-slate-600">
                <XIcon className="h-4 w-4 mr-1" /> Cancelar seleção
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setSelectMode(true)} className="border-slate-200 text-slate-600">
                <Checkbox className="h-4 w-4 mr-1 pointer-events-none" />
                Selecionar
              </Button>
            )}
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

        {/* Barra de ação em modo seleção */}
        {selectMode && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
            <button onClick={toggleAll} className="text-sm text-blue-700 font-medium hover:text-blue-900 underline">
              {selectedIds.size === pts.length ? "Desmarcar todos" : "Selecionar todos"}
            </button>
            <span className="text-sm text-blue-600">
              {selectedIds.size > 0 ? `${selectedIds.size} selecionada${selectedIds.size > 1 ? "s" : ""}` : "Nenhuma selecionada"}
            </span>
            <div className="flex-1" />
            {selectedIds.size > 0 && (
              <Button size="sm" onClick={handleBulkDelete} disabled={excluirLoteMut.isPending}
                className="bg-red-600 hover:bg-red-700 text-white">
                {excluirLoteMut.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  : <Trash2 className="h-4 w-4 mr-1" />}
                Excluir {selectedIds.size}
              </Button>
            )}
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
                selectMode={selectMode}
                selected={selectedIds.has(pt.id)}
                onToggle={toggleId}
                onEdit={(id) => { setEditPtId(id); setEditOpen(true); }}
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
        onEdit={(id) => { setEditPtId(id); setEditOpen(true); }}
      />

      {/* Edição */}
      <PTEditDialog
        ptId={editPtId}
        companyId={companyId}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => { listQ.refetch(); statsQ.refetch(); }}
      />

      {ConfirmDialog}
    </DashboardLayout>
  );
}

// ── Dialog de Edição de PT ──────────────────────────────────────────────────────
function PTEditDialog({ ptId, companyId, open, onOpenChange, onSaved }: {
  ptId: number | null; companyId: number;
  open: boolean; onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const ptQ = trpc.ptPermissoes.getById.useQuery(
    { id: ptId!, companyId },
    { enabled: open && ptId !== null, staleTime: 0 },
  );
  const atualizarMut = trpc.ptPermissoes.atualizar.useMutation();
  const [form, setForm] = useState({
    dataEmissao: "", horaInicio: "", horaTermino: "",
    maoDeObra: "interna", supervisorNome: "",
    descricaoTrabalho: "",
    empresaExecutanteCnpj: "", empresaExecutanteNome: "",
    outrosFormularios: false, outrosFormulariosDesc: "", outrosFormulariosAnexoUrl: "",
  });

  // ── CNPJ auto-fill (edit dialog) ───────────────────────────────────────────
  const [editCnpjAutoFilled, setEditCnpjAutoFilled] = useState(false);
  const editCnpjLimpo = form.empresaExecutanteCnpj.replace(/\D/g, "");
  const editCnpjQ = trpc.compras.buscarCNPJ.useQuery(
    { cnpj: editCnpjLimpo },
    { enabled: form.maoDeObra === "externa" && editCnpjLimpo.length === 14, staleTime: 5 * 60 * 1000, retry: false },
  );

  const pt = ptQ.data as any;
  useEffect(() => {
    if (!pt) return;
    setForm({
      dataEmissao:              pt.dataEmissao ?? "",
      horaInicio:               pt.horaInicio ?? "",
      horaTermino:              pt.horaTermino ?? "",
      maoDeObra:                pt.maoDeObra ?? "interna",
      supervisorNome:           pt.supervisorNome ?? "",
      descricaoTrabalho:        pt.descricaoTrabalho ?? "",
      empresaExecutanteCnpj:    pt.empresaExecutanteCnpj ?? "",
      empresaExecutanteNome:    pt.empresaExecutanteNome ?? "",
      outrosFormularios:        !!pt.outrosFormularios,
      outrosFormulariosDesc:    pt.outrosFormulariosDesc ?? "",
      outrosFormulariosAnexoUrl: pt.outrosFormulariosAnexoUrl ?? "",
    });
  }, [pt?.id, open]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Auto-fill razão social no dialog de edição
  useEffect(() => {
    if (!editCnpjQ.data) return;
    const nome = (editCnpjQ.data as any).razaoSocial || (editCnpjQ.data as any).nomeFantasia || "";
    if (nome && (!form.empresaExecutanteNome || editCnpjAutoFilled)) {
      setForm(f => ({ ...f, empresaExecutanteNome: nome }));
      setEditCnpjAutoFilled(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCnpjQ.data]);

  const [editAptUploading, setEditAptUploading] = useState(false);
  const editAptFileRef = useRef<HTMLInputElement>(null);
  const editAptCamRef  = useRef<HTMLInputElement>(null);

  const handleEditAptUpload = async (file: File) => {
    setEditAptUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipo", "apt");
      fd.append("companyId", String(companyId));
      const r = await fetch("/api/upload/sst-document", { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err?.error ?? "Falha no upload"); }
      const { url } = await r.json();
      setForm(f => ({ ...f, outrosFormulariosAnexoUrl: url }));
      toast.success("Documento APT anexado!");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar arquivo.");
    } finally {
      setEditAptUploading(false);
    }
  };

  const handleSave = async () => {
    if (!ptId) return;
    try {
      await atualizarMut.mutateAsync({
        id: ptId, companyId,
        data: {
          ...form,
          outrosFormularios: form.outrosFormularios ? 1 : 0,
          outrosFormulariosAnexoUrl: form.outrosFormulariosAnexoUrl || null,
        },
      });
      toast.success("PT atualizada com sucesso!");
      onSaved();
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao salvar."); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800">
            <SquarePen className="h-5 w-5 text-blue-600" />
            Editar PT {pt?.numero ?? "…"}
          </DialogTitle>
        </DialogHeader>
        {ptQ.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-[1fr_132px_132px] gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Data</label>
                <Input type="date" value={form.dataEmissao} onChange={set("dataEmissao")} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Início</label>
                <Input type="time" value={form.horaInicio} onChange={set("horaInicio")} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Término</label>
                <Input type="time" value={form.horaTermino} onChange={set("horaTermino")} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Tipo de mão de obra</label>
              <Select value={form.maoDeObra} onValueChange={v => setForm(f => ({ ...f, maoDeObra: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interna">Interna</SelectItem>
                  <SelectItem value="externa">Externa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Supervisor</label>
              <Input value={form.supervisorNome} onChange={set("supervisorNome")} placeholder="Nome do supervisor" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Descrição do trabalho</label>
              <Textarea value={form.descricaoTrabalho} onChange={set("descricaoTrabalho")}
                placeholder="Descreva o trabalho a ser executado" rows={3} />
            </div>
            {form.maoDeObra === "externa" && (
              <div className="space-y-2">
                <div className="sm:w-56">
                  <label className="text-xs font-medium text-slate-600 mb-1 block">CNPJ <span className="text-slate-400 font-normal">(busca automática)</span></label>
                  <div className="relative">
                    <Input
                      value={form.empresaExecutanteCnpj}
                      onChange={e => {
                        const formatted = formatCNPJ(e.target.value);
                        const newClean  = formatted.replace(/\D/g, "");
                        const prevClean = form.empresaExecutanteCnpj.replace(/\D/g, "");
                        if (newClean !== prevClean && editCnpjAutoFilled) {
                          setForm(f => ({ ...f, empresaExecutanteCnpj: formatted, empresaExecutanteNome: "" }));
                          setEditCnpjAutoFilled(false);
                        } else {
                          setForm(f => ({ ...f, empresaExecutanteCnpj: formatted }));
                        }
                      }}
                      placeholder="00.000.000/0001-00"
                      className="pr-8"
                      maxLength={18}
                    />
                    {editCnpjQ.isFetching && (
                      <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
                    )}
                    {editCnpjAutoFilled && !editCnpjQ.isFetching && (
                      <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                    )}
                  </div>
                  {editCnpjQ.isError && editCnpjLimpo.length === 14 && (
                    <p className="text-xs text-rose-500 mt-1">CNPJ não encontrado na Receita Federal</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">
                    Empresa executante (Nome)
                    {editCnpjAutoFilled && <span className="ml-1.5 text-[10px] text-emerald-600 font-normal">✓ Preenchido automaticamente</span>}
                  </label>
                  <Input
                    value={form.empresaExecutanteNome}
                    onChange={e => { setForm(f => ({ ...f, empresaExecutanteNome: e.target.value })); setEditCnpjAutoFilled(false); }}
                    placeholder="Razão social"
                  />
                </div>
              </div>
            )}
            {/* Documento APT da contratante */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={form.outrosFormularios}
                  onChange={e => setForm(f => ({ ...f, outrosFormularios: e.target.checked }))}
                  className="mt-0.5 rounded border-slate-300 accent-emerald-600 flex-shrink-0" />
                <span className="text-sm font-medium text-slate-700">A instalação/contratante exige PT ou documento próprio?</span>
              </label>
              {form.outrosFormularios && (
                <div className="space-y-2 pl-6">
                  <Input value={form.outrosFormulariosDesc} onChange={set("outrosFormulariosDesc")}
                    placeholder="Ex.: PT Petrobras nº 2024-001, APR da instalação nº 87-B…"
                    className="bg-white" />
                  <input ref={editAptFileRef} type="file" accept=".pdf,image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleEditAptUpload(f); e.target.value = ""; }} />
                  <input ref={editAptCamRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleEditAptUpload(f); e.target.value = ""; }} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" disabled={editAptUploading}
                      onClick={() => editAptFileRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors disabled:opacity-50">
                      <Paperclip className="h-3.5 w-3.5" /> Anexar PDF / imagem
                    </button>
                    <button type="button" disabled={editAptUploading}
                      onClick={() => editAptCamRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors disabled:opacity-50">
                      <Camera className="h-3.5 w-3.5" /> Tirar foto
                    </button>
                    {editAptUploading && <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />}
                  </div>
                  {form.outrosFormulariosAnexoUrl && (
                    <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                      <FileText className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      <a href={form.outrosFormulariosAnexoUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-emerald-700 underline truncate flex-1 min-w-0">
                        {decodeURIComponent(form.outrosFormulariosAnexoUrl.split("/").pop()?.split("?")[0] ?? "Ver documento")}
                      </a>
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, outrosFormulariosAnexoUrl: "" }))}
                        className="p-0.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 flex-shrink-0">
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={atualizarMut.isPending || ptQ.isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white">
            {atualizarMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Salvando…</> : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Card de PT ─────────────────────────────────────────────────────────────────
function PTCard({ pt, onClick, selectMode, selected, onToggle, onEdit }: {
  pt: any; onClick: () => void;
  selectMode?: boolean; selected?: boolean;
  onToggle?: (id: number) => void;
  onEdit?: (id: number, e: React.MouseEvent) => void;
}) {
  const assinados = (pt.envolvidos ?? []).filter((e: any) => e.nome).length;
  const tipos: string[] = pt.tiposTrabalho ?? [];

  const handleClick = (e: React.MouseEvent) => {
    if (selectMode && onToggle) { onToggle(pt.id); return; }
    onClick();
  };

  return (
    <div
      onClick={handleClick}
      className={`group relative flex flex-col gap-3 p-4 bg-white rounded-xl border-2 shadow-sm
        transition-all text-left cursor-pointer
        ${selected ? "border-blue-400 bg-blue-50 shadow-md" : "border-slate-100 hover:shadow-md hover:border-emerald-200"}`}>
      {/* Checkbox de seleção */}
      {selectMode && (
        <div className="absolute top-3 right-3" onClick={e => { e.stopPropagation(); onToggle?.(pt.id); }}>
          <Checkbox checked={!!selected} className="h-5 w-5 border-2 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
        </div>
      )}
      {/* Botões de ação (hover, só fora do modo seleção) */}
      {!selectMode && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); onEdit?.(pt.id, e); }}
            className="p-1.5 rounded-md bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 shadow-sm"
            title="Editar PT">
            <SquarePen className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2 pr-6">
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${selected ? "bg-blue-100" : "bg-emerald-100"}`}>
            <HardHat className={`h-5 w-5 ${selected ? "text-blue-600" : "text-emerald-600"}`} />
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
        {!selectMode && <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-emerald-500 transition-all" />}
      </div>
    </div>
  );
}
