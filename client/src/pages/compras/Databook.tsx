import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo, Fragment } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { codigoFicha, ordemDisciplina } from "@shared/databookDisciplinas";
import {
  BookOpen, Search, Loader2, CheckCircle, Clock, AlertTriangle, AlertCircle, Eye,
  FileDown, Sparkles, Image, Edit, Trash2, Send, ThumbsUp, ThumbsDown,
  BarChart3, Filter, RefreshCw, FileText, Package, Building2, ChevronDown,
  ChevronRight, XCircle, Download, Wand2, HardHat
} from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; cls: string; icon: any }> = {
  pendente_ia: { label: "Pendente IA", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock },
  gerado:      { label: "Gerado",      cls: "bg-blue-50 text-blue-700 border-blue-200",     icon: Sparkles },
  revisado:    { label: "Revisado",    cls: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: Edit },
  enviado:     { label: "Enviado",     cls: "bg-purple-50 text-purple-700 border-purple-200", icon: Send },
  aprovado:    { label: "Aprovado",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle },
  reprovado:   { label: "Reprovado",   cls: "bg-red-50 text-red-700 border-red-200",         icon: XCircle },
};

const DISCIPLINAS = [
  "Estrutura", "Hidráulica", "Elétrica", "Acabamento", "Impermeabilização",
  "Esquadrias / Vidros", "Pintura", "Cobertura / Telhado", "Climatização / HVAC",
  "Incêndio / SPDA", "Paisagismo", "Equipamentos", "Outros",
];

// Rev. 2862 — paleta por disciplina (classes Tailwind LITERAIS p/ o JIT) usada
// nos cabeçalhos de grupo, chips e dots da lista de fichas.
const DISCIPLINA_CORES: Record<string, { bg: string; soft: string; hoverSoft: string; text: string; border: string; dot: string }> = {
  "Estrutura":            { bg: "bg-slate-600",   soft: "bg-slate-50",   hoverSoft: "hover:bg-slate-50",   text: "text-slate-700",   border: "border-slate-200",   dot: "bg-slate-500" },
  "Hidráulica":           { bg: "bg-sky-600",     soft: "bg-sky-50",     hoverSoft: "hover:bg-sky-50",     text: "text-sky-700",     border: "border-sky-200",     dot: "bg-sky-500" },
  "Elétrica":             { bg: "bg-amber-500",   soft: "bg-amber-50",   hoverSoft: "hover:bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500" },
  "Acabamento":           { bg: "bg-rose-500",    soft: "bg-rose-50",    hoverSoft: "hover:bg-rose-50",    text: "text-rose-700",    border: "border-rose-200",    dot: "bg-rose-500" },
  "Impermeabilização":    { bg: "bg-cyan-600",    soft: "bg-cyan-50",    hoverSoft: "hover:bg-cyan-50",    text: "text-cyan-700",    border: "border-cyan-200",    dot: "bg-cyan-500" },
  "Esquadrias / Vidros":  { bg: "bg-teal-600",    soft: "bg-teal-50",    hoverSoft: "hover:bg-teal-50",    text: "text-teal-700",    border: "border-teal-200",    dot: "bg-teal-500" },
  "Pintura":              { bg: "bg-fuchsia-600", soft: "bg-fuchsia-50", hoverSoft: "hover:bg-fuchsia-50", text: "text-fuchsia-700", border: "border-fuchsia-200", dot: "bg-fuchsia-500" },
  "Cobertura / Telhado":  { bg: "bg-orange-600",  soft: "bg-orange-50",  hoverSoft: "hover:bg-orange-50",  text: "text-orange-700",  border: "border-orange-200",  dot: "bg-orange-500" },
  "Climatização / HVAC":  { bg: "bg-blue-600",    soft: "bg-blue-50",    hoverSoft: "hover:bg-blue-50",    text: "text-blue-700",    border: "border-blue-200",    dot: "bg-blue-500" },
  "Incêndio / SPDA":      { bg: "bg-red-600",     soft: "bg-red-50",     hoverSoft: "hover:bg-red-50",     text: "text-red-700",     border: "border-red-200",     dot: "bg-red-500" },
  "Paisagismo":           { bg: "bg-green-600",   soft: "bg-green-50",   hoverSoft: "hover:bg-green-50",   text: "text-green-700",   border: "border-green-200",   dot: "bg-green-500" },
  "Equipamentos":         { bg: "bg-violet-600",  soft: "bg-violet-50",  hoverSoft: "hover:bg-violet-50",  text: "text-violet-700",  border: "border-violet-200",  dot: "bg-violet-500" },
  "Outros":               { bg: "bg-gray-500",    soft: "bg-gray-50",    hoverSoft: "hover:bg-gray-50",    text: "text-gray-600",    border: "border-gray-200",    dot: "bg-gray-400" },
};
const corDisciplina = (d?: string | null) => DISCIPLINA_CORES[d || "Outros"] || DISCIPLINA_CORES["Outros"];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABELS[status] || { label: status, cls: "bg-gray-100 text-gray-600", icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function ProgressBar({ value, max, color = "bg-emerald-500", showScale = false }: { value: number; max: number; color?: string; showScale?: boolean }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
            <div
              className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
              style={{ width: `${pct}%`, minWidth: pct > 0 ? '8px' : '0' }}
            />
          </div>
          {showScale && (
            <div className="flex justify-between mt-1 px-0.5">
              {[0, 25, 50, 75, 100].map(tick => (
                <span key={tick} className="text-[9px] text-gray-400">{tick}%</span>
              ))}
            </div>
          )}
        </div>
        <span className={`text-sm font-semibold min-w-[45px] text-right ${pct >= 100 ? 'text-emerald-600' : pct >= 50 ? 'text-blue-600' : 'text-gray-600'}`}>{pct}%</span>
      </div>
    </div>
  );
}

function downloadBase64(base64: string, filename: string, mime: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBase64Pdf(base64: string, filename: string) {
  downloadBase64(base64, filename, "application/pdf");
}

export default function Databook() {
  const { companyId, getCompanyIds } = useCompany();
  const companyIds = getCompanyIds();
  const { user } = useAuth();
  const userName = (user as any)?.name || (user as any)?.email || "Usuário";

  const [obraId, setObraId] = useState<number>(0);
  const [abaAtiva, setAbaAtiva] = useState<"dashboard" | "fichas" | "terceiros">("dashboard");

  const obrasQ = trpc.obras.listActive.useQuery(
    { companyId, companyIds },
    { enabled: companyId > 0 }
  );
  const obrasLista = (obrasQ.data || []) as any[];
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroDisciplina, setFiltroDisciplina] = useState<string>("todas");
  const [filtroOrigem, setFiltroOrigem] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [fichaDialog, setFichaDialog] = useState<any>(null);
  const [editEspecificacoes, setEditEspecificacoes] = useState("");
  const [editObservacoes, setEditObservacoes] = useState("");
  const [editDisciplina, setEditDisciplina] = useState("");
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const [terceiroDialog, setTerceiroDialog] = useState(false);
  const [terceiroForm, setTerceiroForm] = useState({
    terceiroContratoId: 0,
    descricao: "",
    fabricante: "",
    modelo: "",
    especificacoes: "",
    observacoes: "",
  });

  const dashboard = trpc.databook.dashboardObra.useQuery(
    { companyId, obraId },
    { enabled: !!companyId && !!obraId }
  );

  const fichas = trpc.databook.listarFichas.useQuery(
    {
      companyId,
      obraId,
      disciplina: filtroDisciplina !== "todas" ? filtroDisciplina : undefined,
      status: filtroStatus !== "todos" ? filtroStatus : undefined,
      origem: filtroOrigem !== "todas" ? filtroOrigem : undefined,
      busca: busca || undefined,
    },
    { enabled: !!companyId && !!obraId }
  );

  const entregas = trpc.databook.listarEntregasTerceiro.useQuery(
    { companyId, obraId },
    { enabled: !!companyId && !!obraId && abaAtiva === "terceiros" }
  );

  const gerarFichasOC = trpc.databook.gerarFichasOC.useMutation({
    onSuccess: (data) => {
      const parts = [`${data.criadas} fichas criadas`];
      if (data.duplicadas > 0) parts.push(`${data.duplicadas} agrupadas`);
      if ((data as any).ignorados > 0) parts.push(`${(data as any).ignorados} serviços ignorados`);
      toast.success(parts.join(", "));
      fichas.refetch();
      dashboard.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const gerarEspecsLote = trpc.databook.gerarEspecificacoesLote.useMutation({
    onSuccess: (data) => {
      if ((data as any).erro) {
        toast.error((data as any).erro);
      } else {
        toast.success(`${data.processadas} fichas processadas pela IA`);
      }
      fichas.refetch();
      dashboard.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const gerarEspecIA = trpc.databook.gerarEspecificacoesIA.useMutation({
    onSuccess: () => {
      toast.success("Especificações geradas pela IA");
      fichas.refetch();
      if (fichaDialog) {
        fichaRefetch();
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const buscarFoto = trpc.databook.buscarFotoIA.useMutation({
    onSuccess: (data) => {
      if (data.fotoUrl) {
        toast.success("Foto encontrada pela IA");
      } else {
        toast.info(data.aviso || "Foto não encontrada");
      }
      fichas.refetch();
      if (fichaDialog) fichaRefetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const [loteProgress, setLoteProgress] = useState<{
    fase: string;
    faseNum: number;
    totalFases: number;
    current: number;
    total: number;
    successCount: number;
    failCount: number;
    running: boolean;
    currentDesc: string;
    fases: { nome: string; status: "pendente" | "rodando" | "concluido" | "erro"; resultado?: string }[];
  } | null>(null);

  const buscarFotoIA_single = trpc.databook.buscarFotoIA.useMutation();
  const gerarEspecIA_single = trpc.databook.gerarEspecificacoesIA.useMutation();

  const makeFases = () => [
    { nome: "Importar Materiais de OCs", status: "pendente" as const },
    { nome: "Gerar Especificações IA", status: "pendente" as const },
    { nome: "Gerar Fotos IA", status: "pendente" as const },
  ];

  const handleGerarCompleto = async () => {
    const fases = makeFases();
    const updateProgress = (patch: Partial<typeof loteProgress>) =>
      setLoteProgress((prev) => prev ? { ...prev, ...patch } : null);

    fases[0].status = "rodando";
    setLoteProgress({
      fase: fases[0].nome,
      faseNum: 1,
      totalFases: 3,
      current: 0,
      total: 1,
      successCount: 0,
      failCount: 0,
      running: true,
      currentDesc: "Importando materiais das ordens de compra...",
      fases: [...fases],
    });

    try {
      const importResult = await gerarFichasOC.mutateAsync({ companyId, obraId, userName });
      fases[0].status = "concluido";
      fases[0].resultado = `${(importResult as any).criadas || 0} criadas, ${(importResult as any).duplicadas || 0} duplicadas`;
    } catch (e: any) {
      fases[0].status = "erro";
      fases[0].resultado = e.message || "Erro";
    }

    const refetchResult = await fichas.refetch();
    const allFichas = refetchResult.data || fichas.data || [];

    const fichasSemEspec = allFichas.filter((f: any) => !f.especificacoes || f.especificacoes.trim() === "");
    fases[1].status = "rodando";
    setLoteProgress({
      fase: fases[1].nome,
      faseNum: 2,
      totalFases: 3,
      current: 0,
      total: fichasSemEspec.length || 1,
      successCount: 0,
      failCount: 0,
      running: true,
      currentDesc: fichasSemEspec.length > 0 ? "Iniciando..." : "Todas já possuem especificações",
      fases: [...fases],
    });

    if (fichasSemEspec.length > 0) {
      let specOk = 0, specFail = 0;
      for (let i = 0; i < fichasSemEspec.length; i++) {
        const f = fichasSemEspec[i];
        setLoteProgress((prev) => prev ? {
          ...prev,
          current: i,
          total: fichasSemEspec.length,
          successCount: specOk,
          failCount: specFail,
          currentDesc: f.descricao?.substring(0, 50) || "",
          fases: [...fases],
        } : null);
        // Rev. 2861 — "NÃO HAJA FALHAS": cada ficha é tentada até 3x com
        // backoff antes de contar como falha. Combinado com o fallback
        // Claude→Gemini do backend, sobrecarga transitória (429/529) deixa
        // de derrubar fichas.
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          try {
            await gerarEspecIA_single.mutateAsync({ companyId, fichaId: f.id });
            ok = true;
          } catch {
            if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
        if (ok) specOk++; else specFail++;
      }
      fases[1].resultado = `${specOk} geradas, ${specFail} falhas`;
    } else {
      fases[1].resultado = "Nenhuma pendente";
    }
    fases[1].status = "concluido";

    const refetchResult2 = await fichas.refetch();
    const allFichas2 = refetchResult2.data || fichas.data || [];

    const fichasSemFoto = allFichas2.filter((f: any) => !f.foto_url);
    fases[2].status = "rodando";
    setLoteProgress({
      fase: fases[2].nome,
      faseNum: 3,
      totalFases: 3,
      current: 0,
      total: fichasSemFoto.length || 1,
      successCount: 0,
      failCount: 0,
      running: true,
      currentDesc: fichasSemFoto.length > 0 ? "Iniciando..." : "Todas já possuem foto",
      fases: [...fases],
    });

    if (fichasSemFoto.length > 0) {
      let fotoOk = 0, fotoFail = 0;
      for (let i = 0; i < fichasSemFoto.length; i++) {
        const f = fichasSemFoto[i];
        setLoteProgress((prev) => prev ? {
          ...prev,
          current: i,
          total: fichasSemFoto.length,
          successCount: fotoOk,
          failCount: fotoFail,
          currentDesc: f.descricao?.substring(0, 50) || "",
          fases: [...fases],
        } : null);
        try {
          const result = await buscarFotoIA_single.mutateAsync({ companyId, fichaId: f.id });
          if (result.fotoUrl) fotoOk++;
          else fotoFail++;
        } catch {
          fotoFail++;
        }
      }
      fases[2].resultado = `${fotoOk} fotos, ${fotoFail} falhas`;
    } else {
      fases[2].resultado = "Nenhuma pendente";
    }
    fases[2].status = "concluido";

    setLoteProgress({
      fase: "Concluído",
      faseNum: 3,
      totalFases: 3,
      current: 1,
      total: 1,
      successCount: 0,
      failCount: 0,
      running: false,
      currentDesc: "",
      fases: [...fases],
    });

    fichas.refetch();
    dashboard.refetch();
    toast.success("Geração completa finalizada!");
    setTimeout(() => setLoteProgress(null), 10000);
  };

  const handleBuscarFotoLote = async () => {
    const fichasSemFoto = (fichas.data || []).filter((f: any) => !f.foto_url);
    if (fichasSemFoto.length === 0) {
      toast.info("Todas as fichas já possuem foto");
      return;
    }
    const fases = [{ nome: "Gerar Fotos IA", status: "rodando" as const }];
    setLoteProgress({
      fase: "Gerar Fotos IA",
      faseNum: 1,
      totalFases: 1,
      current: 0,
      total: fichasSemFoto.length,
      successCount: 0,
      failCount: 0,
      running: true,
      currentDesc: "",
      fases,
    });

    let successCount = 0, failCount = 0;
    for (let i = 0; i < fichasSemFoto.length; i++) {
      const f = fichasSemFoto[i];
      setLoteProgress((prev) => prev ? {
        ...prev,
        current: i,
        successCount,
        failCount,
        currentDesc: f.descricao?.substring(0, 50) || "",
      } : null);
      try {
        const result = await buscarFotoIA_single.mutateAsync({ companyId, fichaId: f.id });
        if (result.fotoUrl) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }
    fases[0].status = "concluido";
    setLoteProgress((prev) => prev ? {
      ...prev,
      current: fichasSemFoto.length,
      successCount,
      failCount,
      running: false,
      fases: [...fases],
    } : null);
    fichas.refetch();
    toast.success(`Fotos: ${successCount} ok, ${failCount} falhas`);
    setTimeout(() => setLoteProgress(null), 5000);
  };

  const uploadFoto = trpc.databook.uploadFotoFicha.useMutation({
    onSuccess: () => {
      toast.success("Foto enviada com sucesso");
      fichas.refetch();
      if (fichaDialog) fichaRefetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !fichaDialog) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo: 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      uploadFoto.mutate({ companyId, fichaId: fichaDialog.id, fotoBase64: base64 });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const atualizarFicha = trpc.databook.atualizarFicha.useMutation({
    onSuccess: () => {
      toast.success("Ficha atualizada");
      fichas.refetch();
      if (fichaDialog) fichaRefetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const alterarStatus = trpc.databook.alterarStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado");
      fichas.refetch();
      dashboard.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const alterarStatusLote = trpc.databook.alterarStatusLote.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.atualizadas} fichas atualizadas`);
      fichas.refetch();
      dashboard.refetch();
      setSelecionados([]);
    },
    onError: (e) => toast.error(e.message),
  });

  const excluirFicha = trpc.databook.excluirFicha.useMutation({
    onSuccess: () => {
      toast.success("Ficha excluída");
      fichas.refetch();
      dashboard.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // Rev. 2880 — exclusão DEFINITIVA em massa.
  const excluirLote = trpc.databook.excluirLote.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.excluidas} ficha(s) excluída(s) definitivamente`);
      fichas.refetch();
      dashboard.refetch();
      setSelecionados([]);
    },
    onError: (e) => toast.error(e.message),
  });

  // Rev. 2880 — cancelar aprovação (volta a ficha aprovada para "revisado").
  const cancelarAprovacaoLote = trpc.databook.cancelarAprovacaoLote.useMutation({
    onSuccess: (data) => {
      if (data.revertidas > 0) toast.success(`${data.revertidas} aprovação(ões) cancelada(s)`);
      else toast.info("Nenhuma ficha aprovada na seleção");
      fichas.refetch();
      dashboard.refetch();
      setSelecionados([]);
    },
    onError: (e) => toast.error(e.message),
  });

  const gerarPdfFicha = trpc.databook.gerarPdfFicha.useMutation({
    onSuccess: (data) => {
      downloadBase64Pdf(data.pdf, data.filename);
      toast.success("PDF gerado");
    },
    onError: (e) => toast.error(e.message),
  });

  const visualizarPdfFicha = trpc.databook.gerarPdfFicha.useMutation({
    onSuccess: (data) => {
      const bytes = atob(data.pdf);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPdfPreview(url);
    },
    onError: (e) => toast.error(e.message),
  });

  const gerarPdfIndice = trpc.databook.gerarPdfIndice.useMutation({
    onSuccess: (data) => {
      downloadBase64Pdf(data.pdf, data.filename);
      toast.success("Índice PDF gerado");
    },
    onError: (e) => toast.error(e.message),
  });

  // Rev. 2877 — download em massa em ZIP (pastas por disciplina, arquivo = nº do databook).
  const gerarZip = trpc.databook.gerarZipVersao.useMutation({
    onSuccess: (data) => {
      downloadBase64(data.zip, data.filename, "application/zip");
      toast.success(`ZIP gerado com ${data.total} ficha(s)`);
    },
    onError: (e) => toast.error(e.message),
  });

  const cadastrarEntrega = trpc.databook.cadastrarEntregaTerceiro.useMutation({
    onSuccess: () => {
      toast.success("Entrega cadastrada");
      entregas.refetch();
      setTerceiroDialog(false);
      setTerceiroForm({ terceiroContratoId: 0, descricao: "", fabricante: "", modelo: "", especificacoes: "", observacoes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const validarEntrega = trpc.databook.validarEntregaTerceiro.useMutation({
    onSuccess: (data) => {
      if (data.aprovado) {
        toast.success(`Validação IA: Aprovado (Score: ${data.score})`);
      } else {
        toast.warning(`Validação IA: Reprovado (Score: ${data.score})`);
      }
      entregas.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const aprovarEntrega = trpc.databook.aprovarEntregaTerceiro.useMutation({
    onSuccess: () => {
      toast.success("Entrega processada");
      entregas.refetch();
      fichas.refetch();
      dashboard.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const fichaDetalhe = trpc.databook.getFicha.useQuery(
    { companyId, fichaId: fichaDialog?.id || 0 },
    { enabled: !!fichaDialog?.id }
  );
  const fichaRefetch = fichaDetalhe.refetch;

  const obraNome = useMemo(() => {
    const obra = obrasLista.find((o: any) => o.id === obraId);
    return obra?.nome || "Selecione uma obra";
  }, [obraId, obrasLista]);

  const fichasList = (fichas.data as any[]) || [];
  const allSelected = fichasList.length > 0 && selecionados.length === fichasList.length;

  // Rev. 2861 — fichas agrupadas e SEPARADAS POR DISCIPLINA (ordem canônica),
  // numeradas dentro de cada grupo, para facilitar a busca.
  const fichasAgrupadas = useMemo(() => {
    const grupos = new Map<string, any[]>();
    for (const f of fichasList) {
      const disc = f.disciplina || "Outros";
      if (!grupos.has(disc)) grupos.set(disc, []);
      grupos.get(disc)!.push(f);
    }
    return Array.from(grupos.entries())
      .map(([disciplina, itens]) => ({
        disciplina,
        itens: [...itens].sort(
          (a, b) => (a.numero_sequencial || 0) - (b.numero_sequencial || 0),
        ),
      }))
      .sort((a, b) => ordemDisciplina(a.disciplina) - ordemDisciplina(b.disciplina));
  }, [fichasList]);

  if (!companyId) {
    return (
      <DashboardLayout title="Databook de Obra" subtitle="Selecione uma empresa">
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <BookOpen className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg font-medium">Selecione uma empresa no menu acima</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Databook de Obra" subtitle={obraId ? obraNome : "Selecione uma obra"}>
      <div className="space-y-5">
        {/* Obra Selector — faixa institucional FC */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-[#1B2A4A] to-[#2d4373] p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                <BookOpen className="h-6 w-6 text-white" />
              </div>
              <div className="leading-tight">
                <p className="text-[11px] uppercase tracking-widest text-white/60 font-semibold">Databook de Obra</p>
                <p className="text-sm font-bold text-white">{obraId ? obraNome : "Selecione uma obra"}</p>
              </div>
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium text-white/70 whitespace-nowrap hidden sm:block">Obra:</Label>
              <Select value={obraId ? String(obraId) : "none"} onValueChange={(v) => { setObraId(v === "none" ? 0 : parseInt(v)); setSelecionados([]); }}>
                <SelectTrigger className="w-full sm:w-80 h-10 bg-white/95 border-0 shadow-sm font-medium">
                  <SelectValue placeholder="Selecione a obra..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione uma obra...</SelectItem>
                  {obrasLista.map((o: any) => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {obrasQ.isLoading && <Loader2 className="w-4 h-4 animate-spin text-white/70" />}
            </div>
          </div>
        </div>

        {!obraId && (
          <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-slate-200 bg-white">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-100 mb-5">
              <BookOpen className="w-10 h-10 text-slate-300" />
            </div>
            <p className="text-lg font-semibold text-slate-700">Selecione uma obra para começar</p>
            <p className="text-sm mt-1 text-slate-400 max-w-md text-center">O Databook reúne e organiza por disciplina as fichas técnicas de todos os materiais da obra.</p>
          </div>
        )}

        {obraId > 0 && <>
        {/* Tabs — segmented control */}
        <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          {[
            { key: "dashboard" as const, label: "Dashboard", icon: BarChart3 },
            { key: "fichas" as const, label: "Fichas Técnicas", icon: FileText },
            { key: "terceiros" as const, label: "Entregas Terceiros", icon: Building2 },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setAbaAtiva(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                abaAtiva === tab.key
                  ? "bg-white text-[#1B2A4A] shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {abaAtiva === "dashboard" && (
          <div className="space-y-4">
            {/* Actions — destaque no topo */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3 flex-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                  <Wand2 className="h-5 w-5 text-blue-600" />
                </div>
                <div className="leading-tight">
                  <p className="text-sm font-semibold text-slate-800">Gerar Databook Completo</p>
                  <p className="text-xs text-slate-400">Importa materiais das OCs, gera especificações e fotos por IA.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleGerarCompleto}
                  disabled={!!loteProgress?.running}
                  className="bg-[#1B2A4A] hover:bg-[#243760]"
                >
                  {loteProgress?.running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
                  Gerar Completo
                </Button>
                <Button
                  onClick={() => gerarPdfIndice.mutate({ companyId, obraId })}
                  disabled={gerarPdfIndice.isPending}
                  variant="outline"
                >
                  {gerarPdfIndice.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}
                  Índice PDF
                </Button>
                <Button
                  onClick={() => gerarZip.mutate({ companyId, obraId })}
                  disabled={gerarZip.isPending}
                  variant="outline"
                  title="Baixa todas as fichas em um ZIP, separadas por disciplina, cada arquivo com o número do databook"
                >
                  {gerarZip.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Package className="w-4 h-4 mr-1" />}
                  Baixar Tudo (ZIP)
                </Button>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: "Total", value: dashboard.data?.totais?.total || 0, ring: "ring-slate-200", soft: "bg-slate-50", text: "text-slate-700", icon: FileText },
                { label: "Pendente IA", value: dashboard.data?.totais?.pendente_ia || 0, ring: "ring-amber-200", soft: "bg-amber-50", text: "text-amber-600", icon: Clock },
                { label: "Gerado", value: dashboard.data?.totais?.gerado || 0, ring: "ring-blue-200", soft: "bg-blue-50", text: "text-blue-600", icon: Sparkles },
                { label: "Revisado", value: dashboard.data?.totais?.revisado || 0, ring: "ring-indigo-200", soft: "bg-indigo-50", text: "text-indigo-600", icon: Edit },
                { label: "Enviado", value: dashboard.data?.totais?.enviado || 0, ring: "ring-purple-200", soft: "bg-purple-50", text: "text-purple-600", icon: Send },
                { label: "Aprovado", value: dashboard.data?.totais?.aprovado || 0, ring: "ring-emerald-200", soft: "bg-emerald-50", text: "text-emerald-600", icon: CheckCircle },
                { label: "Reprovado", value: dashboard.data?.totais?.reprovado || 0, ring: "ring-red-200", soft: "bg-red-50", text: "text-red-600", icon: XCircle },
              ].map(card => (
                <div key={card.label} className={`bg-white rounded-xl border border-slate-100 ring-1 ${card.ring} p-3 transition-shadow hover:shadow-md`}>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium text-slate-500">{card.label}</p>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${card.soft}`}>
                      <card.icon className={`h-3.5 w-3.5 ${card.text}`} />
                    </span>
                  </div>
                  <p className={`mt-1 text-2xl font-bold ${card.text}`}>{card.value}</p>
                </div>
              ))}
            </div>

            {/* Progress */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800">Progresso Geral</h3>
                <span className="text-xs text-slate-400">
                  {(dashboard.data?.totais?.aprovado || 0) + (dashboard.data?.totais?.enviado || 0) + (dashboard.data?.totais?.revisado || 0)} de {dashboard.data?.totais?.total || 0} fichas
                </span>
              </div>
              <ProgressBar
                value={(dashboard.data?.totais?.aprovado || 0) + (dashboard.data?.totais?.enviado || 0) + (dashboard.data?.totais?.revisado || 0)}
                max={dashboard.data?.totais?.total || 1}
                color="bg-emerald-500"
                showScale
              />
              <p className="text-xs text-slate-400 mt-2">
                {dashboard.data?.totais?.aprovado || 0} aprovados · {dashboard.data?.totais?.enviado || 0} enviados · {dashboard.data?.totais?.revisado || 0} revisados
              </p>
            </div>

            {/* Per Discipline */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Por Disciplina</h3>
              <div className="space-y-3">
                {((dashboard.data?.disciplinas || []) as any[]).map((d: any) => {
                  const c = corDisciplina(d.disciplina);
                  return (
                    <div key={d.disciplina} className="flex items-center gap-3">
                      <span className="flex items-center gap-2 w-44 shrink-0 min-w-0">
                        <span className={`h-2.5 w-2.5 rounded-full ${c.dot} shrink-0`} />
                        <span className="text-xs font-medium text-slate-700 truncate">{d.disciplina}</span>
                      </span>
                      <div className="flex-1">
                        <ProgressBar
                          value={parseInt(d.aprovado || "0") + parseInt(d.enviado || "0") + parseInt(d.revisado || "0")}
                          max={parseInt(d.total || "1")}
                          color={c.dot}
                        />
                      </div>
                      <span className="text-xs text-slate-400 w-14 text-right shrink-0">{d.total} itens</span>
                    </div>
                  );
                })}
              </div>
              {((dashboard.data?.disciplinas || []) as any[]).length === 0 && (
                <div className="flex flex-col items-center py-8 text-slate-300">
                  <Package className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm text-slate-400">Nenhuma ficha gerada ainda</p>
                </div>
              )}
            </div>

          {loteProgress && (
            <div className="bg-white border rounded-lg p-5 mt-3 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {loteProgress.running ? (
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  ) : (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                  <span className="text-sm font-semibold">
                    {loteProgress.running
                      ? `Fase ${loteProgress.faseNum} de ${loteProgress.totalFases}: ${loteProgress.fase}`
                      : "Geração completa finalizada!"}
                  </span>
                </div>
                {!loteProgress.running && (
                  <button onClick={() => setLoteProgress(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
                )}
              </div>

              <div className="space-y-2">
                {loteProgress.fases.map((fase, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                      {fase.status === "concluido" ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : fase.status === "erro" ? (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      ) : fase.status === "rodando" ? (
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${fase.status === "rodando" ? "font-semibold text-blue-700" : fase.status === "concluido" ? "text-green-700" : fase.status === "erro" ? "text-red-700" : "text-gray-400"}`}>
                          {fase.nome}
                        </span>
                        {fase.resultado && (
                          <span className="text-xs text-gray-500 ml-2">{fase.resultado}</span>
                        )}
                      </div>
                      {fase.status === "rodando" && loteProgress.total > 1 && (
                        <div className="mt-1">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span className="truncate max-w-[70%]">{loteProgress.currentDesc}</span>
                            <span>{loteProgress.current + 1} / {loteProgress.total}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-2 rounded-full bg-blue-500 transition-all duration-300"
                              style={{ width: `${Math.max(2, Math.round(((loteProgress.current) / loteProgress.total) * 100))}%` }}
                            />
                          </div>
                          <div className="flex gap-3 text-xs mt-1">
                            <span className="text-green-600">{loteProgress.successCount} ok</span>
                            {loteProgress.failCount > 0 && <span className="text-red-500">{loteProgress.failCount} falhas</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        )}

        {/* Fichas Tab */}
        {abaAtiva === "fichas" && (
          <div className="space-y-3">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Buscar produto..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={filtroDisciplina} onValueChange={setFiltroDisciplina}>
                <SelectTrigger className="w-48 h-9">
                  <SelectValue placeholder="Disciplina" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas Disciplinas</SelectItem>
                  {DISCIPLINAS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="w-40 h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Status</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas Origens</SelectItem>
                  <SelectItem value="oc">OC</SelectItem>
                  <SelectItem value="terceiro">Terceiro</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => fichas.refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {/* Batch Actions */}
            {selecionados.length > 0 && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2 flex-wrap">
                <span className="text-sm text-blue-700 font-medium">{selecionados.length} selecionados</span>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => alterarStatusLote.mutate({ companyId, fichaIds: selecionados, novoStatus: "revisado", userName })}>
                  <CheckCircle className="w-3 h-3 mr-1" /> Marcar Revisado
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => alterarStatusLote.mutate({ companyId, fichaIds: selecionados, novoStatus: "aprovado", userName })}>
                  <ThumbsUp className="w-3 h-3 mr-1" /> Aprovar
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs border-purple-200 text-purple-700 hover:bg-purple-50" onClick={() => alterarStatusLote.mutate({ companyId, fichaIds: selecionados, novoStatus: "enviado", userName })}>
                  <Send className="w-3 h-3 mr-1" /> Enviar ao Cliente
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={gerarZip.isPending} onClick={() => gerarZip.mutate({ companyId, obraId, fichaIds: selecionados })}>
                  {gerarZip.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Package className="w-3 h-3 mr-1" />} Baixar (ZIP)
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs border-amber-200 text-amber-700 hover:bg-amber-50" disabled={cancelarAprovacaoLote.isPending} onClick={() => cancelarAprovacaoLote.mutate({ companyId, fichaIds: selecionados, userName })}>
                  <XCircle className="w-3 h-3 mr-1" /> Cancelar Aprovação
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs border-red-200 text-red-700 hover:bg-red-50" disabled={excluirLote.isPending} onClick={() => {
                  if (confirm(`Excluir DEFINITIVAMENTE ${selecionados.length} ficha(s)? Esta ação NÃO pode ser desfeita.`)) {
                    excluirLote.mutate({ companyId, fichaIds: selecionados });
                  }
                }}>
                  {excluirLote.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />} Excluir
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelecionados([])}>
                  Limpar
                </Button>
              </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) => {
                          if (checked) setSelecionados(fichasList.map((f: any) => f.id));
                          else setSelecionados([]);
                        }}
                      />
                    </TableHead>
                    <TableHead className="w-24">Nº</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-40">Disciplina</TableHead>
                    <TableHead className="w-36">Fornecedor</TableHead>
                    <TableHead className="w-20">Origem</TableHead>
                    <TableHead className="w-14">Foto</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-32">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fichasAgrupadas.map((grupo) => {
                    const c = corDisciplina(grupo.disciplina);
                    return (
                    <Fragment key={grupo.disciplina}>
                      <TableRow className={`${c.soft} ${c.hoverSoft} border-0`}>
                        <TableCell colSpan={9} className="py-2">
                          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                            <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
                            <span className={c.text}>{grupo.disciplina}</span>
                            <span className={`${c.text} font-semibold normal-case rounded-full ${c.soft} ring-1 ${c.border} px-2 py-0.5`}>{grupo.itens.length}</span>
                          </span>
                        </TableCell>
                      </TableRow>
                      {grupo.itens.map((f: any) => (
                    <TableRow key={f.id} className="cursor-pointer hover:bg-slate-50">
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selecionados.includes(f.id)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelecionados(prev => [...prev, f.id]);
                            else setSelecionados(prev => prev.filter(id => id !== f.id));
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-md ${c.soft} ${c.text} ring-1 ${c.border} px-1.5 py-0.5 font-mono text-xs font-semibold`}>
                          {codigoFicha(f.disciplina, f.numero_sequencial)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm" onClick={() => {
                        setFichaDialog(f);
                        setEditEspecificacoes(f.especificacoes || "");
                        setEditObservacoes(f.observacoes || "");
                        setEditDisciplina(f.disciplina || "Outros");
                      }}>
                        {f.descricao}
                      </TableCell>
                      <TableCell className="text-xs">{f.disciplina || "—"}</TableCell>
                      <TableCell className="text-xs truncate max-w-[120px]">{f.fornecedor_nome || "—"}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${f.origem === "oc" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>
                          {f.origem === "oc" ? "OC" : "Terceiro"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {f.foto_url ? (
                          <Image className="w-4 h-4 text-green-500 mx-auto" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-400 mx-auto" title="Foto obrigatória" />
                        )}
                      </TableCell>
                      <TableCell><StatusBadge status={f.status} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Editar ficha" onClick={() => {
                            setFichaDialog(f);
                            setEditEspecificacoes(f.especificacoes || "");
                            setEditObservacoes(f.observacoes || "");
                            setEditDisciplina(f.disciplina || "Outros");
                            if (pdfPreview) { URL.revokeObjectURL(pdfPreview); setPdfPreview(null); }
                          }}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Visualizar PDF" onClick={() => visualizarPdfFicha.mutate({ companyId, fichaId: f.id })} disabled={visualizarPdfFicha.isPending}>
                            <Eye className="w-3.5 h-3.5 text-blue-500" />
                          </Button>
                          {f.status === "pendente_ia" && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Gerar specs IA" onClick={() => gerarEspecIA.mutate({ companyId, fichaId: f.id })} disabled={gerarEspecIA.isPending}>
                              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Baixar PDF" onClick={() => gerarPdfFicha.mutate({ companyId, fichaId: f.id })} disabled={gerarPdfFicha.isPending}>
                            <FileDown className="w-3.5 h-3.5 text-gray-500" />
                          </Button>
                          {f.status === "aprovado" && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Marcar como Enviado ao Cliente" onClick={() => alterarStatus.mutate({ companyId, fichaId: f.id, novoStatus: "enviado", userName })} disabled={alterarStatus.isPending}>
                              <Send className="w-3.5 h-3.5 text-purple-500" />
                            </Button>
                          )}
                          {f.status === "aprovado" && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Cancelar Aprovação (volta para Revisado)" onClick={() => cancelarAprovacaoLote.mutate({ companyId, fichaIds: [f.id], userName })} disabled={cancelarAprovacaoLote.isPending}>
                              <XCircle className="w-3.5 h-3.5 text-amber-500" />
                            </Button>
                          )}
                          {!["aprovado", "enviado"].includes(f.status) && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" title="Excluir" onClick={() => {
                              if (confirm("Excluir esta ficha?")) excluirFicha.mutate({ companyId, fichaId: f.id });
                            }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                      ))}
                    </Fragment>
                  );
                  })}
                  {fichasList.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-gray-400">
                        <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>Nenhuma ficha encontrada</p>
                        <p className="text-xs mt-1">Clique em "Importar Itens de OCs" no Dashboard para começar</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Terceiros Tab */}
        {abaAtiva === "terceiros" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Entregas de Terceiros</h3>
              <Button size="sm" onClick={() => setTerceiroDialog(true)}>
                <Package className="w-4 h-4 mr-1" />
                Nova Entrega
              </Button>
            </div>

            <div className="bg-white rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Terceiro</TableHead>
                    <TableHead>Fabricante</TableHead>
                    <TableHead>Score IA</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {((entregas.data || []) as any[]).map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm max-w-xs truncate">{e.descricao}</TableCell>
                      <TableCell className="text-xs">{e.terceiro_nome || "—"}</TableCell>
                      <TableCell className="text-xs">{e.fabricante || "—"}</TableCell>
                      <TableCell>
                        {e.ia_score != null ? (
                          <span className={`text-xs font-medium ${e.ia_score >= 70 ? "text-green-600" : "text-red-600"}`}>
                            {e.ia_score}/100
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          e.status === "aprovado" ? "bg-green-50 text-green-700" :
                          e.status === "reprovado" ? "bg-red-50 text-red-700" :
                          e.status === "validado_ia" ? "bg-blue-50 text-blue-700" :
                          "bg-amber-50 text-amber-700"
                        }`}>
                          {e.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {e.status === "pendente" && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => validarEntrega.mutate({ companyId, entregaId: e.id })} disabled={validarEntrega.isPending}>
                              <Sparkles className="w-3.5 h-3.5 mr-1" /> Validar IA
                            </Button>
                          )}
                          {(e.status === "validado_ia" || e.status === "pendente") && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600" onClick={() => aprovarEntrega.mutate({ companyId, entregaId: e.id, aprovado: true, userName })}>
                                <ThumbsUp className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={() => {
                                const motivo = prompt("Motivo da reprovação:");
                                if (motivo) aprovarEntrega.mutate({ companyId, entregaId: e.id, aprovado: false, userName, motivo });
                              }}>
                                <ThumbsDown className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {((entregas.data || []) as any[]).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-400">
                        <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>Nenhuma entrega de terceiro</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        </>}

        {/* Ficha Detail Dialog */}
        <Dialog open={!!fichaDialog} onOpenChange={(open) => { if (!open) setFichaDialog(null); }}>
          <DialogContent className="!max-w-[100vw] !w-[100vw] !h-[100vh] !max-h-[100vh] !rounded-none !border-0 m-0 p-0 overflow-hidden [&>button]:top-3 [&>button]:right-4 [&>button]:z-50">
            <div className="flex items-center gap-3 px-6 py-3 border-b bg-white shrink-0">
              <BookOpen className="w-5 h-5 text-blue-600" />
              <span className="text-lg font-bold text-gray-800">{codigoFicha(fichaDialog?.disciplina, fichaDialog?.numero_sequencial || 0)}</span>
              <span className="text-sm text-gray-400 ml-2 truncate max-w-[400px]">{fichaDialog?.descricao}</span>
            </div>
            {fichaDialog && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 flex-1 overflow-hidden" style={{ height: "calc(100vh - 52px)" }}>
                <div className="space-y-4 overflow-y-auto p-6">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-base font-semibold text-gray-800 mb-3">{fichaDialog.descricao}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-gray-500">Fornecedor</Label>
                        <p className="text-sm font-medium">{fichaDialog.fornecedor_nome || "—"}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">OC/Contrato</Label>
                        <p className="text-sm font-medium">{fichaDialog.contrato_numero || "—"}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Status</Label>
                        <div className="mt-1"><StatusBadge status={fichaDialog.status} /></div>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500">Item</Label>
                        <p className="text-sm font-mono">{fichaDialog.eap_codigo || "—"}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-500">Disciplina</Label>
                    <Select value={editDisciplina} onValueChange={setEditDisciplina}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DISCIPLINAS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-500">Especificações Técnicas</Label>
                    <Textarea
                      value={editEspecificacoes}
                      onChange={(e) => setEditEspecificacoes(e.target.value)}
                      rows={10}
                      className="mt-1 text-sm"
                      placeholder="Especificações técnicas do produto..."
                    />
                    <div className="flex gap-1 mt-2">
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => gerarEspecIA.mutate({ companyId, fichaId: fichaDialog.id })} disabled={gerarEspecIA.isPending}>
                        {gerarEspecIA.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                        Gerar com IA
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-500">Observações</Label>
                    <Textarea
                      value={editObservacoes}
                      onChange={(e) => setEditObservacoes(e.target.value)}
                      rows={4}
                      className="mt-1 text-sm"
                      placeholder="Observações adicionais..."
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-3 border-t sticky bottom-0 bg-white pb-2">
                    <Button onClick={() => {
                      atualizarFicha.mutate({
                        companyId,
                        fichaId: fichaDialog.id,
                        especificacoes: editEspecificacoes,
                        observacoes: editObservacoes,
                        disciplina: editDisciplina,
                      });
                      setFichaDialog(null);
                    }}>
                      Salvar Alterações
                    </Button>
                    {fichaDialog.status === "gerado" && (
                      <Button variant="outline" onClick={() => { alterarStatus.mutate({ companyId, fichaId: fichaDialog.id, novoStatus: "revisado", userName }); setFichaDialog(null); }}>
                        <CheckCircle className="w-4 h-4 mr-1" /> Marcar Revisado
                      </Button>
                    )}
                    {fichaDialog.status === "revisado" && (
                      <Button variant="outline" onClick={() => { alterarStatus.mutate({ companyId, fichaId: fichaDialog.id, novoStatus: "aprovado", userName }); setFichaDialog(null); }}>
                        <ThumbsUp className="w-4 h-4 mr-1" /> Aprovar
                      </Button>
                    )}
                    {fichaDialog.status === "aprovado" && (
                      <Button variant="outline" className="border-purple-200 text-purple-700 hover:bg-purple-50" onClick={() => { alterarStatus.mutate({ companyId, fichaId: fichaDialog.id, novoStatus: "enviado", userName }); setFichaDialog(null); }}>
                        <Send className="w-4 h-4 mr-1" /> Enviar ao Cliente
                      </Button>
                    )}
                    {fichaDialog.status === "enviado" && (
                      <Button variant="destructive" onClick={() => {
                        const motivo = prompt("Motivo da reprovação:");
                        if (motivo) { alterarStatus.mutate({ companyId, fichaId: fichaDialog.id, novoStatus: "reprovado", userName, motivo }); setFichaDialog(null); }
                      }}>
                        <ThumbsDown className="w-4 h-4 mr-1" /> Reprovar
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-4 overflow-y-auto p-6 border-l bg-gray-50/50">
                  <div>
                    <Label className="text-xs text-gray-500 mb-2 block flex items-center gap-1">
                      Foto do Produto
                      {!fichaDialog.foto_url && (
                        <span className="text-red-500 font-semibold text-[10px] bg-red-50 px-1.5 py-0.5 rounded">OBRIGATÓRIA</span>
                      )}
                      {fichaDialog.foto_url && (
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      )}
                    </Label>
                    {fichaDialog.foto_url ? (
                      <div className="border rounded-lg overflow-hidden bg-gray-50 p-4">
                        <img src={fichaDialog.foto_url} alt={fichaDialog.descricao} className="max-h-56 object-contain mx-auto" onError={(e) => { (e.target as any).style.display = "none"; }} />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 text-gray-400 border-2 border-dashed border-amber-300 rounded-lg bg-amber-50/30">
                        <Image className="w-10 h-10 mb-2 text-amber-400" />
                        <p className="text-sm text-amber-600 font-medium">Foto obrigatória</p>
                        <p className="text-xs text-gray-400 mt-1">Use a IA ou envie uma foto</p>
                      </div>
                    )}
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" size="sm" className="text-xs flex-1" onClick={() => buscarFoto.mutate({ companyId, fichaId: fichaDialog.id })} disabled={buscarFoto.isPending}>
                        {buscarFoto.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                        Buscar via IA
                      </Button>
                      <label className="flex-1">
                        <input type="file" accept="image/*" className="hidden" onChange={handleFotoUpload} />
                        <Button variant="outline" size="sm" className="text-xs w-full" onClick={(e) => { (e.currentTarget.previousElementSibling as HTMLInputElement)?.click(); }} disabled={uploadFoto.isPending}>
                          {uploadFoto.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Image className="w-3 h-3 mr-1" />}
                          Enviar Foto
                        </Button>
                      </label>
                    </div>
                    {fichaDialog.foto_url && (
                      <Button variant="ghost" size="sm" className="text-xs text-red-500 mt-1 w-full" onClick={() => {
                        atualizarFicha.mutate({ companyId, fichaId: fichaDialog.id, fotoUrl: null });
                      }}>
                        Remover Foto
                      </Button>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs text-gray-500 mb-2 block">Pré-visualização do PDF</Label>
                    <div className="flex gap-2 mb-3">
                      <Button variant="outline" size="sm" onClick={() => visualizarPdfFicha.mutate({ companyId, fichaId: fichaDialog.id })} disabled={visualizarPdfFicha.isPending}>
                        {visualizarPdfFicha.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />}
                        Visualizar PDF
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => gerarPdfFicha.mutate({ companyId, fichaId: fichaDialog.id })} disabled={gerarPdfFicha.isPending}>
                        <FileDown className="w-4 h-4 mr-1" /> Baixar PDF
                      </Button>
                    </div>
                    {pdfPreview && (
                      <iframe src={pdfPreview} className="w-full rounded-lg border flex-1" style={{ minHeight: "50vh", height: "calc(100vh - 380px)" }} />
                    )}
                    {!pdfPreview && !fichaDialog.foto_url && (
                      <div className="flex flex-col items-center justify-center py-16 text-gray-400 border rounded-lg bg-gray-50">
                        <FileText className="w-12 h-12 mb-3 opacity-30" />
                        <p className="text-sm">Clique em "Visualizar PDF" para pré-visualizar a ficha</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Terceiro Submission Dialog */}
        <Dialog open={terceiroDialog} onOpenChange={setTerceiroDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nova Entrega de Terceiro</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>ID Contrato Terceiro</Label>
                <Input type="number" value={terceiroForm.terceiroContratoId || ""} onChange={(e) => setTerceiroForm({ ...terceiroForm, terceiroContratoId: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Descrição do Material *</Label>
                <Textarea value={terceiroForm.descricao} onChange={(e) => setTerceiroForm({ ...terceiroForm, descricao: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fabricante</Label>
                  <Input value={terceiroForm.fabricante} onChange={(e) => setTerceiroForm({ ...terceiroForm, fabricante: e.target.value })} />
                </div>
                <div>
                  <Label>Modelo</Label>
                  <Input value={terceiroForm.modelo} onChange={(e) => setTerceiroForm({ ...terceiroForm, modelo: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Especificações Técnicas</Label>
                <Textarea value={terceiroForm.especificacoes} onChange={(e) => setTerceiroForm({ ...terceiroForm, especificacoes: e.target.value })} rows={4} />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={terceiroForm.observacoes} onChange={(e) => setTerceiroForm({ ...terceiroForm, observacoes: e.target.value })} rows={2} />
              </div>
              <Button className="w-full" onClick={() => {
                if (!terceiroForm.descricao || !terceiroForm.terceiroContratoId) {
                  toast.error("Preencha a descrição e o contrato");
                  return;
                }
                cadastrarEntrega.mutate({
                  companyId,
                  obraId,
                  ...terceiroForm,
                  userName,
                });
              }} disabled={cadastrarEntrega.isPending}>
                {cadastrarEntrega.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                Cadastrar Entrega
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* PDF Preview Dialog */}
        <Dialog open={!!pdfPreview} onOpenChange={(open) => { if (!open) { if (pdfPreview) URL.revokeObjectURL(pdfPreview); setPdfPreview(null); } }}>
          <DialogContent className="!max-w-[98vw] !w-[98vw] !h-[96vh] !max-h-[96vh] p-0 flex flex-col">
            <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Visualização da Ficha Databook
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 px-4 pb-4 min-h-0">
              {pdfPreview && (
                <iframe src={pdfPreview} className="w-full h-full rounded-lg border" />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
