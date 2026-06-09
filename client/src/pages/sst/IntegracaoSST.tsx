import { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  LayoutDashboard, Settings, Clock, History, Users, Plus, Trash2, Edit, Copy,
  CheckCircle, XCircle, AlertTriangle, TrendingUp, GraduationCap, Eye, Video,
  ChevronDown, ChevronRight, Loader2, ClipboardList, BarChart3, RefreshCw, Search,
  Play, ExternalLink, Save, X, Film, UserPlus, Send, Link, Share2, MessageSquare,
  UploadCloud, FileVideo, ChevronUp, ShieldCheck, Building2, Sparkles, HardHat, Info,
  Award, Download, FileText, PenLine, CheckCircle2,
} from "lucide-react";
import { Link as WouterLink } from "wouter";
import { generateCertificadoIntegracaoSstPdf } from "@/lib/certificadoIntegracaoSstPdf";
import { PersonPhoto } from "@/components/PersonPhoto";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("pt-BR");
  } catch { return "-"; }
}

const statusLabels: Record<string, string> = {
  pendente: "Pendente", em_andamento: "Em Andamento", aprovado: "Aprovado",
  reprovado: "Reprovado", vencido: "Vencido",
};
const statusColors: Record<string, string> = {
  pendente: "bg-yellow-100 text-yellow-800", em_andamento: "bg-blue-100 text-blue-800",
  aprovado: "bg-green-100 text-green-800", reprovado: "bg-red-100 text-red-800",
  vencido: "bg-gray-100 text-gray-800",
};
const origemLabels: Record<string, string> = {
  manual: "Manual", smo: "SMO", reciclagem: "Reciclagem",
  advertencia: "Advertência", transferencia: "Transferência",
};

export default function IntegracaoSST() {
  const { selectedCompanyId } = useCompany();
  // Rev. 2020 — CompanyContext entrega string ("12"); routers integracaoSST esperam number.
  // Sem coerção, Zod estoura "Invalid input: expected number, received string" e a aba
  // Vídeos fica travada com toast de erro.
  const companyId = Number(selectedCompanyId) || 0;
  const [tab, setTab] = useState("dashboard");

  // Rev. 2005 — Tabs alinhadas à regra de ouro: chip emerald, gradient header
  const tabs: { value: string; label: string; icon: any; desc: string }[] = [
    { value: "dashboard", label: "Dashboard", icon: LayoutDashboard, desc: "Visão geral" },
    { value: "videos", label: "Vídeos", icon: Film, desc: "Conteúdo de treinamento" },
    { value: "config", label: "Configurações", icon: Settings, desc: "Regras e fluxo" },
    { value: "pendentes", label: "Pendentes", icon: Clock, desc: "A concluir" },
    { value: "aprovados", label: "Aprovados", icon: Award, desc: "Certificados emitidos · ficam salvos no Raio-X do colaborador" },
    { value: "reprovados", label: "Reprovados", icon: XCircle, desc: "Colaboradores que não atingiram a nota mínima · precisam refazer" },
    { value: "historico", label: "Histórico", icon: History, desc: "Concluídos" },
    { value: "sessoes", label: "Sessões", icon: Users, desc: "Turmas presenciais" },
  ];

  return (
    <DashboardLayout>
    <div className="min-h-screen bg-slate-50/40">
      {/* Header gradient full-width — regra de ouro */}
      <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 text-white shadow-md">
        <div className="px-4 sm:px-6 py-4 sm:py-5 flex items-center gap-3 sm:gap-4">
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-white/15 ring-2 ring-white/30 backdrop-blur flex items-center justify-center shrink-0">
            <GraduationCap className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Integração de Segurança</h1>
            <p className="text-xs sm:text-sm text-emerald-50/90 leading-snug">
              Treinamento de novos colaboradores · vídeos, questionários e certificados
            </p>
          </div>
        </div>
      </div>

      {/* Tabs em chip — barra horizontal scroll em mobile */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="px-2 sm:px-4 overflow-x-auto">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-transparent h-auto p-0 gap-1 sm:gap-2 flex flex-nowrap justify-start">
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = tab === t.value;
                return (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className={`group rounded-lg px-3 sm:px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap data-[state=active]:shadow-none border-b-2 ${
                      active
                        ? "border-emerald-600 text-emerald-700 bg-emerald-50/60"
                        : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center h-6 w-6 rounded-md mr-1.5 ring-1 transition-colors ${
                      active ? "bg-white ring-emerald-200 text-emerald-600" : "bg-slate-100 ring-slate-200 text-slate-500 group-hover:bg-white"
                    }`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {t.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <div className="hidden sm:block pt-1.5 pb-2 px-1">
              <p className="text-[11px] text-slate-500">
                {tabs.find((t) => t.value === tab)?.desc}
              </p>
            </div>
          </Tabs>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-3 sm:p-5">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsContent value="dashboard" className="mt-0"><DashboardTab companyId={companyId} onNavigate={setTab} /></TabsContent>
          <TabsContent value="videos" className="mt-0"><VideosTab companyId={companyId} /></TabsContent>
          <TabsContent value="config" className="mt-0"><ConfigTab companyId={companyId} /></TabsContent>
          <TabsContent value="pendentes" className="mt-0"><PendentesTab companyId={companyId} /></TabsContent>
          <TabsContent value="aprovados" className="mt-0"><AprovadosTab companyId={companyId} /></TabsContent>
          <TabsContent value="reprovados" className="mt-0"><ReprovadosTab companyId={companyId} /></TabsContent>
          <TabsContent value="historico" className="mt-0"><HistoricoTab companyId={companyId} /></TabsContent>
          <TabsContent value="sessoes" className="mt-0"><SessoesTab companyId={companyId} /></TabsContent>
        </Tabs>
      </div>
    </div>
    </DashboardLayout>
  );
}

function DashboardTab({ companyId, onNavigate }: { companyId: number; onNavigate: (tab: string) => void }) {
  const kpis = trpc.integracaoSST.dashboardKpis.useQuery({ companyId }, { enabled: companyId > 0 });
  const alertas = trpc.integracaoSST.alertas.useQuery({ companyId }, { enabled: companyId > 0 });

  if (!companyId) return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
      <Users className="h-10 w-10 text-slate-300 mx-auto mb-2" />
      <p className="text-sm text-slate-500">Selecione uma empresa para visualizar os indicadores.</p>
    </div>
  );
  if (kpis.isLoading) return <div className="flex items-center gap-2 p-8 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Carregando indicadores...</div>;

  const k = kpis.data;
  const taxa = k?.taxaAprovacao ?? 0;
  const taxaCor = taxa >= 80 ? "from-emerald-500 to-green-600" : taxa >= 60 ? "from-amber-500 to-orange-500" : "from-red-500 to-rose-600";

  return (
    <div className="space-y-4">
      {/* KPIs principais — cards coloridos com chip de ícone */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        <KpiCard label="Total"          value={k?.total ?? 0}            icon={BarChart3}     accent="blue" />
        <KpiCard label="Aprovados"      value={k?.aprovados ?? 0}        icon={CheckCircle}   accent="emerald" onClick={() => onNavigate("aprovados")} />
        <KpiCard label="Pendentes"      value={k?.pendentes ?? 0}        icon={Clock}         accent="amber"   onClick={() => onNavigate("pendentes")} />
        <KpiCard label="Reprovados"     value={k?.reprovados ?? 0}       icon={XCircle}       accent="red"     onClick={() => onNavigate("reprovados")} />
        <KpiCard label="Vencendo (30d)" value={k?.vencendoEm30Dias ?? 0} icon={AlertTriangle} accent="orange"  onClick={() => onNavigate("pendentes")} />
      </div>

      <div className="grid md:grid-cols-2 gap-3 sm:gap-4">
        {/* Indicadores */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="bg-gradient-to-r from-slate-50 to-white px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-50 ring-1 ring-emerald-200 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">Indicadores</h3>
              <p className="text-[11px] text-slate-500">Performance da integração</p>
            </div>
          </div>
          <div className="p-4 space-y-4">
            {/* Taxa de aprovação destacada */}
            <div>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-xs text-slate-600 uppercase tracking-wider font-semibold">Taxa de Aprovação</span>
                <span className="text-2xl font-extrabold tabular-nums text-slate-900">{taxa}<span className="text-sm text-slate-500">%</span></span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div className={`bg-gradient-to-r ${taxaCor} rounded-full h-full transition-all`} style={{ width: `${taxa}%` }} />
              </div>
            </div>
            {/* Dois KPIs secundários */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <div className="rounded-lg bg-indigo-50/60 p-3">
                <div className="text-[10px] text-indigo-600 uppercase tracking-wider font-semibold">Média de Nota</div>
                <div className="text-lg font-bold text-indigo-900 tabular-nums">{k?.mediaNota ?? "—"}</div>
              </div>
              <div className="rounded-lg bg-blue-50/60 p-3">
                <div className="text-[10px] text-blue-600 uppercase tracking-wider font-semibold">Em Andamento</div>
                <div className="text-lg font-bold text-blue-900 tabular-nums">{k?.emAndamento ?? 0}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Alertas */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="bg-gradient-to-r from-orange-50 to-white px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-orange-50 ring-1 ring-orange-200 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-sm text-slate-800">Alertas</h3>
              <p className="text-[11px] text-slate-500">{alertas.data?.length ?? 0} pendência{(alertas.data?.length ?? 0) === 1 ? "" : "s"}</p>
            </div>
          </div>
          <div className="p-2 max-h-72 overflow-y-auto">
            {alertas.isLoading ? (
              <div className="p-4 flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
            ) : (alertas.data?.length ?? 0) === 0 ? (
              <div className="p-6 text-center">
                <CheckCircle className="h-8 w-8 text-emerald-300 mx-auto mb-1.5" />
                <p className="text-sm text-slate-500">Nenhum alerta — tudo em dia!</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {alertas.data?.map((a, i) => {
                  const cor = a.tipo === "advertencia" || a.tipo === "reprovado" ? "red" : a.tipo === "vencendo" ? "orange" : "amber";
                  return (
                    <div key={i} className="flex items-start gap-2 p-2.5">
                      <Badge variant="outline" className={`shrink-0 text-[10px] capitalize ${cor === "red" ? "bg-red-50 text-red-700 border-red-200" : cor === "orange" ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                        {a.tipo}
                      </Badge>
                      <span className="text-xs text-slate-700 leading-snug">{a.mensagem}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, accent, onClick }: { label: string; value: number; icon: any; accent: "blue" | "emerald" | "amber" | "red" | "orange"; onClick?: () => void }) {
  const accents: Record<string, { bg: string; chip: string; ring: string; icon: string; num: string; bar: string }> = {
    blue:    { bg: "bg-blue-50/40",    chip: "bg-blue-100",    ring: "ring-blue-200",    icon: "text-blue-600",    num: "text-blue-900",    bar: "bg-blue-500" },
    emerald: { bg: "bg-emerald-50/40", chip: "bg-emerald-100", ring: "ring-emerald-200", icon: "text-emerald-600", num: "text-emerald-900", bar: "bg-emerald-500" },
    amber:   { bg: "bg-amber-50/40",   chip: "bg-amber-100",   ring: "ring-amber-200",   icon: "text-amber-600",   num: "text-amber-900",   bar: "bg-amber-500" },
    red:     { bg: "bg-red-50/40",     chip: "bg-red-100",     ring: "ring-red-200",     icon: "text-red-600",     num: "text-red-900",     bar: "bg-red-500" },
    orange:  { bg: "bg-orange-50/40",  chip: "bg-orange-100",  ring: "ring-orange-200",  icon: "text-orange-600",  num: "text-orange-900",  bar: "bg-orange-500" },
  };
  const a = accents[accent];
  const clickable = !!onClick;
  return (
    <div
      className={`relative rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow ${clickable ? "cursor-pointer hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
      title={clickable ? `Ver ${label}` : undefined}
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${a.bar}`} />
      <div className={`${a.bg} px-3 pt-3.5 pb-3`}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[10px] sm:text-[11px] text-slate-600 uppercase tracking-wider font-semibold truncate">{label}</span>
          <span className={`inline-flex items-center justify-center h-7 w-7 rounded-lg ${a.chip} ring-1 ${a.ring} shrink-0`}>
            <Icon className={`h-3.5 w-3.5 ${a.icon}`} />
          </span>
        </div>
        <p className={`text-2xl sm:text-3xl font-extrabold tabular-nums ${a.num}`}>{value}</p>
        {clickable && (
          <span className={`mt-1 inline-flex items-center gap-0.5 text-[10px] font-semibold ${a.icon}`}>
            Ver lista <ChevronRight className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}

function getYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/);
  return match?.[1] || null;
}

// Rev. 2924 — player de vídeo de ARQUIVO para o card admin "Vídeos da Integração".
// Espelha a Rev. 2920 (portal público): vídeo SEMPRE centralizado (object-contain) dentro
// da caixa 16:9, com spinner de "carregando", estado de ERRO e fallback "abrir em nova aba"
// quando o player inline não consegue carregar (arquivo grande / metadata no fim do mp4 /
// proxy do deploy). Antes ficava só o "buraco preto" sem feedback nem alternativa.
function VideoCardPlayer({ url }: { url: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [slow, setSlow] = useState(false);
  const slowRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setSlow(false);
    // se em 12s não carregou (e sem onError), some o spinner e oferece "abrir em nova aba".
    slowRef.current = setTimeout(() => { setLoading(false); setSlow(true); }, 12000);
    return () => { if (slowRef.current) clearTimeout(slowRef.current); };
  }, [url]);

  const clearSlow = () => { if (slowRef.current) clearTimeout(slowRef.current); };

  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center px-3">
        <Video className="h-8 w-8 text-gray-500 mb-2" />
        <p className="text-xs text-gray-300 mb-2">Não foi possível exibir o vídeo aqui.</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs underline text-blue-300 hover:text-blue-200"
        >
          <ExternalLink className="h-3 w-3" /> Abrir em nova aba
        </a>
      </div>
    );
  }

  return (
    <>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10 pointer-events-none">
          <Loader2 className="h-6 w-6 text-white animate-spin" />
        </div>
      )}
      {/* w-full h-full + object-contain garante o vídeo CENTRALIZADO na caixa, sem corte e sem distorção. */}
      <video
        key={url}
        src={url}
        controls
        playsInline
        preload="metadata"
        controlsList="nodownload"
        onContextMenu={(e) => e.preventDefault()}
        onLoadedMetadata={() => { clearSlow(); setLoading(false); setSlow(false); }}
        onCanPlay={() => { clearSlow(); setLoading(false); setSlow(false); }}
        onError={() => { clearSlow(); setLoading(false); setError(true); }}
        className="w-full h-full object-contain bg-black"
      >
        Seu navegador não suporta a tag de vídeo HTML5.
      </video>
      {slow && (
        <div className="absolute bottom-2 left-2 right-2 flex justify-center z-10">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[11px] bg-black/80 text-blue-200 px-2 py-1 rounded underline hover:text-blue-100"
          >
            <ExternalLink className="h-3 w-3" /> Demorando? Abrir em nova aba
          </a>
        </div>
      )}
    </>
  );
}

function VideosTab({ companyId }: { companyId: number }) {
  const modulos = trpc.integracaoSST.listarTodosModulos.useQuery({ companyId }, { enabled: companyId > 0 });
  const configs = trpc.integracaoSST.listarConfigs.useQuery({ companyId }, { enabled: companyId > 0 });
  const criarModulo = trpc.integracaoSST.criarModulo.useMutation({ onSuccess: () => { modulos.refetch(); resetForm(); toast.success("Vídeo cadastrado com sucesso"); } });
  const atualizarModulo = trpc.integracaoSST.atualizarModulo.useMutation({ onSuccess: () => { modulos.refetch(); setEditingId(null); toast.success("Vídeo atualizado"); } });
  const excluirModulo = trpc.integracaoSST.excluirModulo.useMutation({ onSuccess: () => { modulos.refetch(); toast.success("Vídeo excluído"); } });
  // Rev. 2016 — criar config padrão de dentro do modal de vídeo (UX: usuário não fica travado)
  const criarConfigInline = trpc.integracaoSST.criarConfig.useMutation({
    onSuccess: (cfg: any) => {
      configs.refetch();
      if (cfg?.id) setConfigId(String(cfg.id));
      toast.success("Configuração padrão criada — já selecionada");
    },
    onError: (err) => toast.error(err?.message || "Falha ao criar configuração padrão"),
  });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTipo, setVideoTipo] = useState<"youtube" | "upload" | "vimeo" | "url">("youtube");
  const [duracaoMinutos, setDuracaoMinutos] = useState("");
  const [configId, setConfigId] = useState("");
  const [ordem, setOrdem] = useState("1");
  const [obrigatorio, setObrigatorio] = useState(true);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // Rev. 2012 — Upload de arquivo de vídeo (até 600MB)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Rev. 2016 — auto-selecionar quando há exatamente 1 configuração (caso mais comum)
  useEffect(() => {
    if (!configId && !editingId && configs.data && configs.data.length === 1) {
      setConfigId(String(configs.data[0].id));
    }
  }, [configs.data, configId, editingId]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setTitulo("");
    setDescricao("");
    setVideoUrl("");
    setVideoTipo("youtube");
    setDuracaoMinutos("");
    setConfigId("");
    setOrdem("1");
    setObrigatorio(true);
    setSelectedFile(null);
    setUploadProgress(0);
    setUploading(false);
    setShowAdvanced(false);
  };

  // Upload via XHR pra ter progresso em tempo real
  const uploadVideoFile = (file: File): Promise<{ url: string }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const fd = new FormData();
      fd.append("file", file);
      fd.append("companyId", String(companyId));
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error("Resposta inválida do servidor")); }
        } else {
          let msg = `Falha no upload (HTTP ${xhr.status})`;
          try { msg = JSON.parse(xhr.responseText).error || msg; } catch {}
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error("Erro de rede durante o upload"));
      xhr.open("POST", "/api/upload/sst-integracao-video");
      xhr.send(fd);
    });
  };

  const handlePickFile = (file: File | null) => {
    if (!file) return;
    setSelectedFile(file);
    setVideoTipo("upload");
    if (!titulo.trim()) {
      const nameNoExt = file.name.replace(/\.[^/.]+$/, "");
      setTitulo(nameNoExt);
    }
  };

  const startEdit = (mod: any) => {
    setEditingId(mod.id);
    setTitulo(mod.titulo || "");
    setDescricao(mod.descricao || "");
    setVideoUrl(mod.videoUrl || "");
    setVideoTipo(mod.videoTipo || "youtube");
    setDuracaoMinutos(mod.duracaoMinutos ? String(mod.duracaoMinutos) : "");
    setConfigId(String(mod.configId));
    setOrdem(String(mod.ordem || 1));
    setObrigatorio(mod.obrigatorio !== false);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!titulo.trim()) { toast.error("Informe o título do vídeo"); return; }
    if (!configId) { toast.error("Selecione a configuração de integração"); return; }

    // Rev. 2012: se houver arquivo selecionado, faz upload primeiro e usa a URL retornada
    let finalVideoUrl = videoUrl.trim() || undefined;
    let finalVideoTipo = videoTipo;
    if (selectedFile) {
      try {
        setUploading(true);
        setUploadProgress(0);
        const { url } = await uploadVideoFile(selectedFile);
        finalVideoUrl = url;
        finalVideoTipo = "upload";
        setUploadProgress(100);
      } catch (e: any) {
        setUploading(false);
        toast.error(e?.message || "Falha no upload do vídeo");
        return;
      }
      setUploading(false);
    }

    if (editingId) {
      atualizarModulo.mutate({
        id: editingId,
        companyId,
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        videoUrl: finalVideoUrl,
        videoTipo: finalVideoTipo,
        duracaoMinutos: duracaoMinutos ? Number(duracaoMinutos) : null,
        ordem: Number(ordem) || 1,
        obrigatorio,
      });
    } else {
      criarModulo.mutate({
        configId: Number(configId),
        companyId,
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        videoUrl: finalVideoUrl,
        videoTipo: finalVideoTipo,
        duracaoMinutos: duracaoMinutos ? Number(duracaoMinutos) : undefined,
        ordem: Number(ordem) || (modulos.data?.filter(m => m.configId === Number(configId)).length || 0) + 1,
        obrigatorio,
      });
    }
  };

  const ytPreviewUrl = videoUrl ? getYoutubeId(videoUrl) : null;

  const filtered = searchTerm
    ? (modulos.data || []).filter(m =>
        m.titulo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.configTitulo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.videoUrl?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : (modulos.data || []);

  if (!companyId) return <p className="text-muted-foreground p-4">Selecione uma empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Vídeos da Integração</h3>
          <p className="text-xs text-muted-foreground">Cadastre e gerencie os vídeos de treinamento de segurança</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar vídeo..." className="pl-8 w-48" />
          </div>
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}><Plus className="h-4 w-4 mr-1" />Novo Vídeo</Button>
        </div>
      </div>

      {(configs.data?.length ?? 0) === 0 && (
        <Card className="border-dashed border-yellow-300 bg-yellow-50/50">
          <CardContent className="p-4 flex items-center gap-3 flex-wrap">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium text-yellow-800">Nenhuma configuração criada</p>
              <p className="text-xs text-yellow-700">
                Toda integração precisa de 1 configuração (nota mínima do questionário + validade do treinamento). Crie a padrão num clique ou ajuste na aba "Configurações".
              </p>
            </div>
            <Button
              size="sm"
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
              disabled={criarConfigInline.isPending || companyId <= 0}
              onClick={() => criarConfigInline.mutate({ companyId, titulo: "Integração Geral", notaMinima: 70, validadeMeses: 12 })}
            >
              {criarConfigInline.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Criar configuração padrão
            </Button>
          </CardContent>
        </Card>
      )}

      {modulos.isLoading ? (
        <div className="flex items-center gap-2 p-8"><Loader2 className="h-5 w-5 animate-spin" />Carregando vídeos...</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Film className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">{searchTerm ? "Nenhum vídeo encontrado" : "Nenhum vídeo cadastrado ainda"}</p>
            {!searchTerm && <p className="text-xs text-muted-foreground mt-1">Clique em "Novo Vídeo" para começar</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(mod => {
            const ytId = mod.videoUrl ? getYoutubeId(mod.videoUrl) : null;
            const isExpanded = previewId === mod.id;
            // Rev. 2023 — detecta vídeo arquivo (upload direto OU URL terminando em
            // mp4/mov/webm/etc) pra renderizar <video> nativo no card, sem download.
            // Pega tanto `videoTipo === "upload"` quanto links externos diretos.
            const isFileVideo = !ytId && !!mod.videoUrl && (
              mod.videoTipo === "upload" ||
              /\.(mp4|mov|webm|avi|mkv|m4v|ogv)(\?|#|$)/i.test(mod.videoUrl)
            );
            return (
              <Card key={mod.id} className="overflow-hidden group hover:shadow-md transition-shadow">
                <div
                  className={`relative aspect-video bg-gray-900 ${ytId ? "cursor-pointer" : ""}`}
                  onClick={ytId ? () => setPreviewId(isExpanded ? null : mod.id) : undefined}
                >
                  {ytId ? (
                    isExpanded ? (
                      <iframe
                        src={`https://www.youtube.com/embed/${ytId}?rel=0&autoplay=1`}
                        className="w-full h-full"
                        allowFullScreen
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      />
                    ) : (
                      <>
                        <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt={mod.titulo} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                          <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                            <Play className="h-7 w-7 text-emerald-600 ml-1" />
                          </div>
                        </div>
                      </>
                    )
                  ) : isFileVideo ? (
                    // Rev. 2924 — player de arquivo robusto: centralizado (object-contain),
                    // com loading/erro e fallback "abrir em nova aba" (fim do buraco preto).
                    <VideoCardPlayer url={mod.videoUrl!} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center">
                        <Video className="h-10 w-10 mx-auto text-gray-500 mb-2" />
                        <p className="text-xs text-gray-400">{mod.videoUrl ? "Vídeo externo" : "Sem vídeo"}</p>
                      </div>
                    </div>
                  )}
                  {mod.duracaoMinutos && (
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded">
                      {mod.duracaoMinutos} min
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{mod.titulo}</p>
                      {mod.descricao && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{mod.descricao}</p>}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant="outline" className="text-xs">{mod.configTitulo || "Config #" + mod.configId}</Badge>
                        <span className="text-xs text-muted-foreground">Ordem: {mod.ordem}</span>
                        {mod.totalPerguntas > 0 && <span className="text-xs text-muted-foreground">{mod.totalPerguntas} pergunta(s)</span>}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        {mod.obrigatorio && <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Obrigatório</Badge>}
                        <Badge variant="outline" className="text-[10px] h-5">{mod.videoTipo === "youtube" ? "YouTube" : mod.videoTipo === "vimeo" ? "Vimeo" : mod.videoTipo === "upload" ? "Upload" : "URL"}</Badge>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(mod)} title="Editar">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      {mod.videoUrl && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.open(mod.videoUrl!, "_blank")} title="Abrir vídeo">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { if (confirm("Excluir este vídeo?")) excluirModulo.mutate({ id: mod.id, companyId }); }} title="Excluir">
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(v) => { if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl lg:max-w-4xl xl:max-w-5xl p-0 gap-0 overflow-hidden">
          {/* Rev. 2009 — Header gradient (regra de ouro) */}
          <DialogHeader className="px-6 py-4 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 text-white space-y-1">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 ring-2 ring-white/40 backdrop-blur shrink-0">
                <Film className="h-5 w-5 text-white" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-white text-base sm:text-lg font-semibold leading-tight">
                  {editingId ? "Editar Vídeo de Integração" : "Novo Vídeo de Integração"}
                </DialogTitle>
                <p className="text-[12px] text-white/85 leading-snug mt-0.5">
                  Cadastre um módulo de treinamento — YouTube, Vimeo, URL direta ou upload. Os colaboradores assistirão na ordem definida.
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Rev. 2012 — Modal SIMPLIFICADO: foco em Título + Upload. Resto vai pra "Mais opções". */}
          <div className="px-6 py-5 max-h-[calc(100vh-220px)] overflow-y-auto space-y-4">
            {/* Configuração (obrigatória, mas compacta) */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <Label className="text-xs text-slate-600">
                  Configuração de Integração <span className="text-red-500">*</span>
                  <span className="ml-1 text-[10px] font-normal text-slate-400">(nota mínima + validade do treinamento)</span>
                </Label>
              </div>
              {/* Rev. 2016 — Empty-state inline: cria config padrão sem sair do modal */}
              {(configs.data?.length ?? 0) === 0 && !editingId ? (
                <div className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/60 p-3 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-amber-900 leading-snug">
                      Você ainda não tem nenhuma configuração ativa.
                    </p>
                    <p className="text-[11px] text-amber-800/80 leading-snug mt-0.5">
                      Posso criar a padrão "Integração Geral" (nota mínima 70%, validade 12 meses). Você pode ajustar depois na aba <strong>Configurações</strong>.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2 h-7 bg-amber-600 hover:bg-amber-700 text-white text-xs"
                      disabled={criarConfigInline.isPending}
                      onClick={() => criarConfigInline.mutate({ companyId, titulo: "Integração Geral", notaMinima: 70, validadeMeses: 12 })}
                    >
                      {criarConfigInline.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                      Criar configuração padrão agora
                    </Button>
                  </div>
                </div>
              ) : (
                <Select value={configId} onValueChange={setConfigId} disabled={!!editingId || (configs.data?.length ?? 0) === 0}>
                  <SelectTrigger><SelectValue placeholder={(configs.data?.length ?? 0) === 0 ? "Nenhuma configuração ativa" : "Selecione a configuração ativa"} /></SelectTrigger>
                  <SelectContent>
                    {configs.data?.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.titulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(configs.data?.length ?? 0) === 1 && !editingId && configId && (
                <p className="text-[10px] text-emerald-700 mt-1">✓ Configuração única auto-selecionada.</p>
              )}
            </div>

            {/* Título — destaque */}
            <div>
              <Label className="text-sm font-semibold text-slate-800">Nome do vídeo <span className="text-red-500">*</span></Label>
              <Input
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Ex: Uso de EPIs na Obra"
                className="mt-1 text-base h-11"
                autoFocus
              />
            </div>

            {/* Upload — destaque visual grande */}
            <div>
              <Label className="text-sm font-semibold text-slate-800">Arquivo de vídeo</Label>
              <p className="text-[11px] text-slate-500 mb-2">Envie um vídeo do seu computador, sem limite de tamanho — ou preencha uma URL externa em "Mais opções".</p>
              {!selectedFile ? (
                <label className="flex flex-col items-center justify-center gap-2 cursor-pointer rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-400 transition-colors py-8 px-4">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 ring-2 ring-emerald-200">
                    <UploadCloud className="h-6 w-6 text-emerald-700" />
                  </span>
                  <span className="text-sm font-semibold text-emerald-800">Clique para selecionar o vídeo</span>
                  <span className="text-[11px] text-slate-500">MP4, MOV, WebM, AVI · sem limite de tamanho</span>
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={e => handlePickFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              ) : (
                <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/40 p-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 ring-1 ring-emerald-200 shrink-0">
                      <FileVideo className="h-5 w-5 text-emerald-700" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{selectedFile.name}</p>
                      <p className="text-[11px] text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    {!uploading && (
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 shrink-0" onClick={() => { setSelectedFile(null); setUploadProgress(0); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {uploading && (
                    <div className="mt-3">
                      <div className="h-2 rounded-full bg-emerald-100 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                      </div>
                      <p className="text-[11px] text-emerald-700 mt-1 text-center font-medium">Enviando… {uploadProgress}%</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mais opções — colapsado */}
            <div className="border-t pt-3">
              <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
              >
                {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Mais opções (URL externa, descrição, duração, ordem, obrigatoriedade)
              </button>
              {showAdvanced && (
                <div className="mt-3 space-y-3 rounded-lg bg-slate-50/60 p-3 border border-slate-200">
                  <div>
                    <Label className="text-xs text-slate-600">URL externa (YouTube / Vimeo / link direto)</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
                      </div>
                      <Select value={videoTipo} onValueChange={(v: any) => setVideoTipo(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="youtube">YouTube</SelectItem>
                          <SelectItem value="vimeo">Vimeo</SelectItem>
                          <SelectItem value="url">URL Direta</SelectItem>
                          <SelectItem value="upload">Upload</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">Se você selecionou um arquivo acima, esta URL é ignorada.</p>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600">Descrição (opcional)</Label>
                    <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Breve descrição do conteúdo..." rows={2} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-slate-600">Duração (min)</Label>
                      <Input type="number" value={duracaoMinutos} onChange={e => setDuracaoMinutos(e.target.value)} placeholder="10" min={1} />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">Ordem</Label>
                      <Input type="number" value={ordem} onChange={e => setOrdem(e.target.value)} placeholder="1" min={1} />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">Obrigatório?</Label>
                      <label className={`flex items-center gap-2 cursor-pointer rounded-md border-2 px-2 py-1.5 transition-colors ${obrigatorio ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                        <input type="checkbox" checked={obrigatorio} onChange={e => setObrigatorio(e.target.checked)} className="accent-emerald-600 w-4 h-4" />
                        <span className={`text-xs font-medium ${obrigatorio ? "text-emerald-800" : "text-slate-700"}`}>
                          {obrigatorio ? "Sim" : "Não"}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-3 border-t bg-slate-50/60 gap-2">
            <Button variant="outline" onClick={resetForm} disabled={uploading}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button
              disabled={!titulo.trim() || !configId || uploading || criarModulo.isPending || atualizarModulo.isPending}
              onClick={handleSave}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md"
            >
              {(uploading || criarModulo.isPending || atualizarModulo.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              {uploading ? `Enviando vídeo… ${uploadProgress}%` : editingId ? "Salvar Alterações" : "Cadastrar Vídeo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConfigTab({ companyId }: { companyId: number }) {
  const configs = trpc.integracaoSST.listarConfigs.useQuery({ companyId }, { enabled: companyId > 0 });
  const criarConfig = trpc.integracaoSST.criarConfig.useMutation({ onSuccess: () => { configs.refetch(); setShowNew(false); toast.success("Configuração criada"); } });
  const excluirConfig = trpc.integracaoSST.excluirConfig.useMutation({ onSuccess: () => { configs.refetch(); toast.success("Configuração excluída"); } });
  // Rev. 2056 — pedido do usuário (IMG_0943): "Quero poder editar a validade".
  // Backend já tem `atualizarConfig` (suporta titulo/notaMinima/validadeMeses/
  // ativo) — só faltava UI. Modal de edição reusa o padrão do criarConfig.
  const atualizarConfig = trpc.integracaoSST.atualizarConfig.useMutation({
    onSuccess: () => { configs.refetch(); setEditingConfig(null); toast.success("Configuração atualizada"); },
    onError: (err: any) => toast.error(err?.message || "Erro ao atualizar configuração"),
  });
  const [showNew, setShowNew] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [notaMinima, setNotaMinima] = useState(70);
  const [validadeMeses, setValidadeMeses] = useState(12);
  const [expandedConfig, setExpandedConfig] = useState<number | null>(null);
  // Rev. 2056 — estado do modal de edição
  const [editingConfig, setEditingConfig] = useState<{ id: number; titulo: string; notaMinima: number; validadeMeses: number; ativo: boolean } | null>(null);

  const abrirEdicao = (cfg: any) => {
    setEditingConfig({
      id: cfg.id,
      titulo: cfg.titulo || "",
      notaMinima: Number(cfg.notaMinima ?? 70),
      validadeMeses: Number(cfg.validadeMeses ?? 12),
      ativo: !!cfg.ativo,
    });
  };
  const salvarEdicao = () => {
    if (!editingConfig) return;
    atualizarConfig.mutate({
      companyId,
      id: editingConfig.id,
      titulo: editingConfig.titulo.trim() || undefined,
      notaMinima: editingConfig.notaMinima,
      validadeMeses: editingConfig.validadeMeses,
      ativo: editingConfig.ativo,
    });
  };

  if (!companyId) return <p className="text-muted-foreground p-4">Selecione uma empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Configurações de Integração</h3>
        <Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1" />Nova Configuração</Button>
      </div>

      {configs.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className="space-y-3">
          {configs.data?.length === 0 && <p className="text-muted-foreground text-sm">Nenhuma configuração cadastrada. Crie uma para começar.</p>}
          {configs.data?.map(cfg => (
            <Card key={cfg.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedConfig(expandedConfig === cfg.id ? null : cfg.id)}>
                    {expandedConfig === cfg.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div>
                      <p className="font-medium">{cfg.titulo}</p>
                      <p className="text-xs text-muted-foreground">Nota mínima: {cfg.notaMinima}% · Validade: {cfg.validadeMeses} meses · {cfg.ativo ? "Ativa" : "Inativa"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Badge variant={cfg.ativo ? "default" : "secondary"}>{cfg.ativo ? "Ativa" : "Inativa"}</Badge>
                    {/* Rev. 2056 — botão Editar (nota mínima, validade, título, ativo) */}
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); abrirEdicao(cfg); }} title="Editar configuração">
                      <Edit className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); excluirConfig.mutate({ id: cfg.id, companyId }); }} title="Excluir configuração">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
                {expandedConfig === cfg.id && <ModulosEditor configId={cfg.id} companyId={companyId} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Configuração de Integração</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Integração Geral" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nota Mínima (%)</Label><Input type="number" value={notaMinima} onChange={e => setNotaMinima(Number(e.target.value))} min={1} max={100} /></div>
              <div><Label>Validade (meses)</Label><Input type="number" value={validadeMeses} onChange={e => setValidadeMeses(Number(e.target.value))} min={1} max={60} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button disabled={!titulo.trim() || criarConfig.isPending} onClick={() => criarConfig.mutate({ companyId, titulo, notaMinima, validadeMeses })}>
              {criarConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rev. 2056 — Modal de edição (validade, nota mínima, título, ativo) */}
      <Dialog open={!!editingConfig} onOpenChange={(o) => !o && !atualizarConfig.isPending && setEditingConfig(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Configuração de Integração</DialogTitle></DialogHeader>
          {editingConfig && (
            <div className="space-y-3">
              <div>
                <Label>Título</Label>
                <Input
                  value={editingConfig.titulo}
                  onChange={(e) => setEditingConfig({ ...editingConfig, titulo: e.target.value })}
                  placeholder="Ex: Integração Geral"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nota Mínima (%)</Label>
                  <Input
                    type="number"
                    value={editingConfig.notaMinima}
                    onChange={(e) => setEditingConfig({ ...editingConfig, notaMinima: Number(e.target.value) })}
                    min={1}
                    max={100}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">% mínimo pra ser aprovado.</p>
                </div>
                <div>
                  <Label>Validade (meses)</Label>
                  <Input
                    type="number"
                    value={editingConfig.validadeMeses}
                    onChange={(e) => setEditingConfig({ ...editingConfig, validadeMeses: Number(e.target.value) })}
                    min={1}
                    max={60}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Quanto tempo o certificado é válido.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  id="cfg-ativo"
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer"
                  checked={editingConfig.ativo}
                  onChange={(e) => setEditingConfig({ ...editingConfig, ativo: e.target.checked })}
                />
                <Label htmlFor="cfg-ativo" className="cursor-pointer text-sm">Configuração ativa</Label>
              </div>
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Mudanças valem para <strong>novas integrações</strong>. Certificados já emitidos preservam a validade calculada no momento da aprovação.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingConfig(null)} disabled={atualizarConfig.isPending}>Cancelar</Button>
            <Button
              disabled={!editingConfig?.titulo.trim() || atualizarConfig.isPending}
              onClick={salvarEdicao}
            >
              {atualizarConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModulosEditor({ configId, companyId }: { configId: number; companyId: number }) {
  const modulos = trpc.integracaoSST.listarModulos.useQuery({ configId, companyId });
  const criarModulo = trpc.integracaoSST.criarModulo.useMutation({ onSuccess: () => { modulos.refetch(); setShowNew(false); toast.success("Módulo criado"); } });
  const excluirModulo = trpc.integracaoSST.excluirModulo.useMutation({ onSuccess: () => { modulos.refetch(); toast.success("Módulo excluído"); } });
  const salvarPerguntas = trpc.integracaoSST.salvarPerguntas.useMutation({ onSuccess: () => { modulos.refetch(); toast.success("Perguntas salvas"); } });
  // Rev. 2047 — botão "Carregar/Atualizar Regras de Ouro" (substitui via AlertDialog)
  const semearPadrao = trpc.integracaoSST.semearPerguntasPadrao.useMutation({
    onSuccess: (res) => {
      modulos.refetch();
      setConfirmSubstituir(null);
      toast.success(res.substituido > 0
        ? `${res.total} perguntas atualizadas (${res.substituido} antigas substituídas)`
        : `${res.total} perguntas-padrão carregadas`);
    },
    onError: (err) => { toast.error(err.message || "Falha ao carregar perguntas-padrão"); },
  });
  const [confirmSubstituir, setConfirmSubstituir] = useState<{ moduloId: number; titulo: string; atual: number } | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [newTitulo, setNewTitulo] = useState("");
  const [newVideo, setNewVideo] = useState("");
  const [newDuracao, setNewDuracao] = useState("");
  const [editingModuloId, setEditingModuloId] = useState<number | null>(null);
  const [perguntasEdit, setPerguntasEdit] = useState<any[]>([]);

  const startEditPerguntas = (modulo: any) => {
    setEditingModuloId(modulo.id);
    setPerguntasEdit(modulo.perguntas?.length > 0 ? modulo.perguntas.map((p: any) => ({
      id: p.id, texto: p.texto, ordem: p.ordem,
      alternativas: p.alternativas?.map((a: any) => ({ id: a.id, texto: a.texto, correta: a.correta, ordem: a.ordem })) || [],
    })) : [{ texto: "", ordem: 1, alternativas: [{ texto: "", correta: true, ordem: 1 }, { texto: "", correta: false, ordem: 2 }] }]);
  };

  const addPergunta = () => {
    setPerguntasEdit([...perguntasEdit, { texto: "", ordem: perguntasEdit.length + 1, alternativas: [{ texto: "", correta: true, ordem: 1 }, { texto: "", correta: false, ordem: 2 }] }]);
  };

  const addAlternativa = (pi: number) => {
    const updated = [...perguntasEdit];
    updated[pi].alternativas.push({ texto: "", correta: false, ordem: updated[pi].alternativas.length + 1 });
    setPerguntasEdit(updated);
  };

  const removePergunta = (pi: number) => {
    setPerguntasEdit(perguntasEdit.filter((_, i) => i !== pi).map((p, i) => ({ ...p, ordem: i + 1 })));
  };

  const removeAlternativa = (pi: number, ai: number) => {
    const updated = [...perguntasEdit];
    updated[pi].alternativas = updated[pi].alternativas.filter((_: any, i: number) => i !== ai).map((a: any, i: number) => ({ ...a, ordem: i + 1 }));
    setPerguntasEdit(updated);
  };

  return (
    <div className="mt-4 border-t pt-4 space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-sm">Módulos de Treinamento</h4>
        <Button size="sm" variant="outline" onClick={() => setShowNew(true)}><Plus className="h-3 w-3 mr-1" />Módulo</Button>
      </div>

      {modulos.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <div className="space-y-2">
          {modulos.data?.map((mod, idx) => (
            <Card key={mod.id} className="bg-muted/30">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{idx + 1}</Badge>
                    <Video className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium">{mod.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {mod.videoUrl ? "Vídeo configurado" : "Sem vídeo"} · {mod.perguntas?.length || 0} pergunta(s)
                        {mod.duracaoMinutos ? ` · ${mod.duracaoMinutos} min` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {(mod.perguntas?.length || 0) === 0 ? (
                      <Button
                        size="sm" variant="outline"
                        className="text-xs h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        disabled={semearPadrao.isPending}
                        onClick={() => semearPadrao.mutate({ companyId, moduloId: mod.id, substituir: false })}
                        title="Carregar perguntas-padrão (Regras de Ouro + Segurança na Obra)"
                      >
                        {semearPadrao.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : "🎯 "}
                        Carregar Regras de Ouro
                      </Button>
                    ) : (
                      <Button
                        size="sm" variant="outline"
                        className="text-xs h-8 border-amber-300 text-amber-700 hover:bg-amber-50"
                        disabled={semearPadrao.isPending}
                        onClick={() => setConfirmSubstituir({ moduloId: mod.id, titulo: mod.titulo, atual: mod.perguntas?.length || 0 })}
                        title="Substituir perguntas atuais pelas perguntas-padrão atualizadas (Regras de Ouro + Segurança na Obra)"
                      >
                        🔄 Atualizar Regras de Ouro
                      </Button>
                    )}
                    {/* Rev. 2059 — botão de editar/incluir perguntas com label
                        visível (antes era só o ícone ClipboardList — usuário
                        não achava). Texto muda conforme tem perguntas ou não
                        pra deixar a ação clara. */}
                    <Button
                      size="sm" variant="outline"
                      className="text-xs h-8 border-blue-300 text-blue-700 hover:bg-blue-50"
                      onClick={() => startEditPerguntas(mod)}
                      title="Editar ou incluir novas perguntas neste módulo"
                    >
                      <ClipboardList className="h-3.5 w-3.5 mr-1" />
                      {(mod.perguntas?.length || 0) === 0 ? "Adicionar Perguntas" : "Editar Perguntas"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => excluirModulo.mutate({ id: mod.id, companyId })} title="Excluir módulo"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </div>

                {editingModuloId === mod.id && (
                  <div className="mt-3 border-t pt-3 space-y-3">
                    <h5 className="text-sm font-medium">Perguntas do Módulo</h5>
                    {perguntasEdit.map((p, pi) => (
                      <Card key={pi} className="bg-white">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">P{pi + 1}</span>
                            <Input value={p.texto} onChange={e => { const u = [...perguntasEdit]; u[pi].texto = e.target.value; setPerguntasEdit(u); }} placeholder="Texto da pergunta" className="text-sm" />
                            <Button size="sm" variant="ghost" onClick={() => removePergunta(pi)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                          </div>
                          <div className="ml-6 space-y-1">
                            {p.alternativas.map((a: any, ai: number) => (
                              <div key={ai} className="flex items-center gap-2">
                                <input type="radio" name={`correta_${pi}`} checked={a.correta}
                                  onChange={() => {
                                    const u = [...perguntasEdit];
                                    u[pi].alternativas = u[pi].alternativas.map((alt: any, j: number) => ({ ...alt, correta: j === ai }));
                                    setPerguntasEdit(u);
                                  }} className="accent-emerald-600" />
                                <Input value={a.texto} onChange={e => { const u = [...perguntasEdit]; u[pi].alternativas[ai].texto = e.target.value; setPerguntasEdit(u); }} placeholder={`Alternativa ${ai + 1}`} className="text-sm h-8" />
                                {p.alternativas.length > 2 && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeAlternativa(pi, ai)}><Trash2 className="h-3 w-3 text-red-400" /></Button>}
                              </div>
                            ))}
                            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => addAlternativa(pi)}><Plus className="h-3 w-3 mr-1" />Alternativa</Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={addPergunta}><Plus className="h-3 w-3 mr-1" />Pergunta</Button>
                      <Button size="sm"
                        disabled={salvarPerguntas.isPending || perguntasEdit.some(p => !p.texto.trim() || p.alternativas.some((a: any) => !a.texto.trim()))}
                        onClick={() => salvarPerguntas.mutate({ moduloId: mod.id, companyId, perguntas: perguntasEdit })}>
                        {salvarPerguntas.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Salvar Perguntas
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingModuloId(null)}>Fechar</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Módulo de Treinamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={newTitulo} onChange={e => setNewTitulo(e.target.value)} placeholder="Ex: Uso de EPIs" /></div>
            <div><Label>URL do Vídeo (YouTube)</Label><Input value={newVideo} onChange={e => setNewVideo(e.target.value)} placeholder="https://youtube.com/watch?v=..." /></div>
            <div><Label>Duração (minutos)</Label><Input type="number" value={newDuracao} onChange={e => setNewDuracao(e.target.value)} placeholder="10" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button disabled={!newTitulo.trim() || criarModulo.isPending}
              onClick={() => criarModulo.mutate({ configId, companyId, titulo: newTitulo, videoUrl: newVideo || undefined, duracaoMinutos: newDuracao ? Number(newDuracao) : undefined, ordem: (modulos.data?.length || 0) + 1 })}>
              {criarModulo.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmSubstituir} onOpenChange={(o) => !o && !semearPadrao.isPending && setConfirmSubstituir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Atualizar Regras de Ouro?</AlertDialogTitle>
            <AlertDialogDescription>
              O módulo <strong>{confirmSubstituir?.titulo}</strong> tem <strong>{confirmSubstituir?.atual} pergunta(s)</strong> cadastrada(s).
              Elas serão <strong>apagadas e substituídas</strong> pelas 12 perguntas-padrão das Regras de Ouro da FC ENGENHARIA.
              <br /><br />
              <span className="text-muted-foreground text-xs">Respostas e pontuações dos colaboradores que já fizeram a integração NÃO são afetadas (essas ficam no histórico do registro).</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={semearPadrao.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={semearPadrao.isPending}
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => confirmSubstituir && semearPadrao.mutate({ companyId, moduloId: confirmSubstituir.moduloId, substituir: true })}
            >
              {semearPadrao.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Substituir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PendentesTab({ companyId }: { companyId: number }) {
  const registros = trpc.integracaoSST.listarRegistros.useQuery({ companyId, status: "pendente" }, { enabled: companyId > 0 });
  const emAndamento = trpc.integracaoSST.listarRegistros.useQuery({ companyId, status: "em_andamento" }, { enabled: companyId > 0 });
  // Rev. 2034 — Lista TODOS CLT/PJ/Terceiros sem integração válida (24m).
  const pendentesAuto = trpc.integracaoSST.listarPendentesAuto.useQuery({ companyId }, { enabled: companyId > 0 });
  const empList = trpc.employees.list.useQuery({ companyId, status: "Ativo" }, { enabled: companyId > 0 });
  const obras = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const configs = trpc.integracaoSST.listarConfigs.useQuery({ companyId }, { enabled: companyId > 0 });
  // Rev. 2038/2039 — janela pré-aberta no click pra escapar do pop-up blocker do Safari.
  const pendingWindowRef = useRef<Window | null>(null);
  const criarRegistro = trpc.integracaoSST.criarRegistro.useMutation({
    onSuccess: (data) => {
      registros.refetch();
      emAndamento.refetch();
      pendentesAuto.refetch();
      // Rev. 2043 — se RH iniciou (janela pré-aberta), passa CPF na URL
      // pra tela pública pular o passo de identificação.
      const cpfLimpo = (data.employeeCpf || "").replace(/\D/g, "");
      const linkBase = `${window.location.origin}/integracao/${data.token}`;
      const link = pendingWindowRef.current && cpfLimpo
        ? `${linkBase}?cpf=${cpfLimpo}&auto=1`
        : linkBase;
      if (pendingWindowRef.current) {
        const w = pendingWindowRef.current;
        pendingWindowRef.current = null;
        try { w.location.href = link; } catch { /* janela fechada antes */ }
        if (w.closed) {
          setCreatedLink(link);
          setCreatedEmployee(data.employeeNome || "");
          toast.warning("Pop-up bloqueado — copie o link abaixo pra abrir manualmente");
        } else {
          toast.success(`Integração de ${data.employeeNome || "colaborador"} iniciada em nova aba`);
        }
        return;
      }
      setCreatedLink(link);
      setCreatedEmployee(data.employeeNome || "");
      toast.success("Integração criada com sucesso!");
    },
    onError: (err: any) => {
      // Rev. 2041 — não fecha mais a janela; mostra o erro DENTRO dela
      // (no Safari iPad fechar dava impressão de "abre e fecha sozinho").
      const msg = err?.message || err?.data?.message || "Erro ao criar integração";
      console.error("[criarRegistro] erro:", err);
      if (pendingWindowRef.current) {
        const w = pendingWindowRef.current;
        pendingWindowRef.current = null;
        try {
          if (!w.closed) {
            w.document.open();
            w.document.write(
              `<!doctype html><meta charset="utf-8"><title>Erro</title>` +
              `<style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fef2f2;color:#7f1d1d;padding:24px}.box{max-width:480px;text-align:center;background:#fff;border:1px solid #fecaca;border-radius:12px;padding:24px;box-shadow:0 4px 12px rgba(0,0,0,0.06)}.ico{font-size:48px;line-height:1;margin-bottom:12px}h2{margin:0 0 8px;font-size:18px;color:#991b1b}p{margin:0 0 16px;color:#7f1d1d;font-size:14px}button{background:#dc2626;color:#fff;border:0;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer}button:hover{background:#b91c1c}</style>` +
              `<div class="box"><div class="ico">⚠️</div><h2>Não foi possível iniciar a integração</h2><p>${String(msg).replace(/[<>&]/g, "")}</p><button onclick="window.close()">Fechar</button></div>`
            );
            w.document.close();
          }
        } catch (e) {
          console.warn("[criarRegistro] falha ao escrever erro na janela:", e);
        }
      }
      toast.error(msg);
    }
  });
  const criarLote = trpc.integracaoSST.criarRegistrosEmLote.useMutation({
    onSuccess: (data) => {
      registros.refetch();
      emAndamento.refetch();
      pendentesAuto.refetch();
      setShowNew(false);
      resetForm();
      toast.success(`${data.count} integração(ões) criada(s) com sucesso!`);
    }
  });

  const [showNew, setShowNew] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [empSearchTerm, setEmpSearchTerm] = useState("");
  const [selectedEmps, setSelectedEmps] = useState<{ id: number; nome: string; cpf: string; funcao: string }[]>([]);
  const [selectedObraId, setSelectedObraId] = useState("");
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [createdLink, setCreatedLink] = useState("");
  const [createdEmployee, setCreatedEmployee] = useState("");

  const resetForm = () => {
    setEmpSearchTerm("");
    setSelectedEmps([]);
    setSelectedObraId("");
    setSelectedConfigId("");
    setCreatedLink("");
    setCreatedEmployee("");
  };

  const filteredEmps = useMemo(() => {
    if (!empSearchTerm || empSearchTerm.length < 2) return [];
    const term = empSearchTerm.toLowerCase();
    const selectedIds = new Set(selectedEmps.map(e => e.id));
    return (empList.data || [])
      .filter((e: any) => !selectedIds.has(e.id) && (
        e.nomeCompleto?.toLowerCase().includes(term) ||
        e.nome?.toLowerCase().includes(term) ||
        e.cpf?.includes(empSearchTerm.replace(/\D/g, ""))
      ))
      .slice(0, 10);
  }, [empSearchTerm, empList.data, selectedEmps]);

  const addEmployee = (emp: any) => {
    setSelectedEmps([...selectedEmps, { id: emp.id, nome: emp.nomeCompleto || emp.nome, cpf: emp.cpf || "", funcao: emp.funcao || "" }]);
    setEmpSearchTerm("");
  };

  const removeEmployee = (id: number) => {
    setSelectedEmps(selectedEmps.filter(e => e.id !== id));
  };

  const handleCriar = () => {
    if (selectedEmps.length === 0) { toast.error("Selecione pelo menos um colaborador"); return; }

    const obraId = selectedObraId && selectedObraId !== "none" ? Number(selectedObraId) : undefined;
    const obraNome = obraId ? (obras.data as any[])?.find((o: any) => o.id === obraId)?.nome : undefined;
    const configId = selectedConfigId && selectedConfigId !== "auto" ? Number(selectedConfigId) : undefined;

    if (selectedEmps.length === 1) {
      criarRegistro.mutate({
        companyId,
        employeeId: selectedEmps[0].id,
        configId,
        obraId,
        obraNome,
      });
    } else {
      criarLote.mutate({
        companyId,
        employeeIds: selectedEmps.map(e => e.id),
        configId,
        obraId,
        obraNome,
      });
    }
  };

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/integracao/${token}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado!");
  };

  const shareWhatsApp = (token: string, nome: string) => {
    const link = `${window.location.origin}/integracao/${token}`;
    const msg = encodeURIComponent(`Olá ${nome}! Segue o link para realizar sua Integração de Segurança:\n\n${link}\n\nAcesse o link e siga as instruções.`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  const allPending = [...(registros.data || []), ...(emAndamento.data || [])];
  const filtered = searchTerm ? allPending.filter(r => r.employeeNome?.toLowerCase().includes(searchTerm.toLowerCase()) || r.employeeCpf?.includes(searchTerm)) : allPending;

  // Rev. 2034 — Lista de colaboradores SEM integração válida (24m).
  const pendentesAutoData = pendentesAuto.data || [];
  const filteredAuto = searchTerm
    ? pendentesAutoData.filter(p => p.nome?.toLowerCase().includes(searchTerm.toLowerCase()) || p.cpf?.includes(searchTerm))
    : pendentesAutoData;
  const countVencido = pendentesAutoData.filter(p => p.estado === "vencido").length;
  const countNunca = pendentesAutoData.filter(p => p.estado === "nunca_fez").length;
  const countVencendo = pendentesAutoData.filter(p => p.estado === "vencendo").length;

  const iniciarParaEmployee = (emp: { id: number; nome: string; cpf: string | null; funcao: string | null }) => {
    resetForm();
    setSelectedEmps([{ id: emp.id, nome: emp.nome, cpf: emp.cpf || "", funcao: emp.funcao || "" }]);
    setShowNew(true);
  };

  // Rev. 2038/2039/2040 — "Iniciar agora": ABRE a janela SÍNCRONA no click (escapa pop-up
  // blocker Safari/iPad), depois cria o registro e seta a URL no onSuccess.
  // Rev. 2040: blindado contra emp null/undefined e try/catch geral pra logar erro real.
  const iniciarAgora = (emp: { id: number; nome: string | null; cpf: string | null; funcao: string | null } | null | undefined) => {
    try {
      if (!emp || !emp.id) {
        toast.error("Colaborador inválido");
        return;
      }
      if (criarRegistro.isPending) return;
      const nome = String(emp.nome || "Colaborador").trim();
      const primeiroNome = (nome.split(" ")[0] || nome).replace(/[<>&"]/g, "");

      let w: Window | null = null;
      try {
        w = window.open("about:blank", "_blank");
      } catch (e) {
        console.warn("[iniciarAgora] window.open falhou:", e);
      }
      if (w) {
        try {
          w.document.write(
            `<!doctype html><meta charset="utf-8"><title>Iniciando integracao</title>` +
            `<style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:linear-gradient(180deg,#ecfdf5,#fff);color:#065f46}.box{text-align:center}.spin{width:48px;height:48px;border:4px solid #d1fae5;border-top-color:#059669;border-radius:50%;animation:s 1s linear infinite;margin:0 auto 16px}@keyframes s{to{transform:rotate(360deg)}}</style>` +
            `<div class="box"><div class="spin"></div><h2>Preparando a integracao de ${primeiroNome}...</h2><p>Aguarde um instante.</p></div>`
          );
        } catch (e) {
          console.warn("[iniciarAgora] document.write falhou:", e);
        }
        pendingWindowRef.current = w;
      }
      criarRegistro.mutate({ companyId, employeeId: emp.id });
    } catch (e: any) {
      console.error("[iniciarAgora] erro:", e);
      toast.error(`Erro ao iniciar: ${e?.message || String(e)}`);
      if (pendingWindowRef.current) {
        try { pendingWindowRef.current.close(); } catch { /* ignore */ }
        pendingWindowRef.current = null;
      }
    }
  };

  if (!companyId) return <p className="text-muted-foreground p-4">Selecione uma empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Integrações Pendentes</h3>
          <p className="text-xs text-muted-foreground">{allPending.length} em processo · {pendentesAutoData.length} sem integração válida (24 meses)</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar pendente..." className="pl-8 w-48" />
          </div>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { resetForm(); setShowNew(true); }}>
            <UserPlus className="h-4 w-4 mr-1" />Iniciar Integração
          </Button>
        </div>
      </div>

      {/* Rev. 2034 — Bloco "Sem integração válida": CLT/PJ/Terceiros que nunca
          fizeram OU vencidos OU vencem em ≤60d. Cada item tem botão de ação
          direta para abrir o modal com o colaborador pré-selecionado. */}
      <Card className="border-amber-200">
        <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 py-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-amber-900">Sem integração válida</h4>
                <p className="text-xs text-amber-800/80">A integração tem validade de 24 meses · Renove ou inicie quando for nova contratação</p>
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {countVencido > 0 && <Badge className="bg-red-100 text-red-800 border-red-200">{countVencido} vencida(s)</Badge>}
              {countNunca > 0 && <Badge className="bg-amber-100 text-amber-800 border-amber-200">{countNunca} nunca realizou</Badge>}
              {countVencendo > 0 && <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">{countVencendo} vence(m) em ≤60d</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {pendentesAuto.isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-amber-600" /></div>
          ) : filteredAuto.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
              <p className="text-sm font-medium text-emerald-700">Todos os colaboradores estão com integração em dia</p>
              <p className="text-xs text-muted-foreground mt-1">Nenhuma renovação ou nova integração pendente</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[480px] overflow-y-auto">
              {filteredAuto.map(p => {
                const estadoMeta =
                  p.estado === "vencido" ? { label: "Vencida", cls: "bg-red-100 text-red-800 border-red-200", ring: "ring-red-200" }
                  : p.estado === "vencendo" ? { label: `Vence em ${p.diasParaVencer}d`, cls: "bg-yellow-100 text-yellow-800 border-yellow-200", ring: "ring-yellow-200" }
                  : { label: "Nunca realizou", cls: "bg-amber-100 text-amber-800 border-amber-200", ring: "ring-amber-200" };
                const tipoMeta =
                  p.kind === "terceiro" ? { label: "Terceiro", cls: "bg-purple-100 text-purple-800 border-purple-200" }
                  : p.tipoContrato?.toLowerCase().includes("pj") ? { label: "PJ", cls: "bg-indigo-100 text-indigo-800 border-indigo-200" }
                  : { label: "CLT", cls: "bg-sky-100 text-sky-800 border-sky-200" };
                return (
                  <div key={`${p.kind}-${p.id}`} className={`flex items-center justify-between gap-2 flex-wrap rounded-lg border bg-white px-3 py-2 ring-1 ${estadoMeta.ring}`}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Rev. 2297 — foto clicável (lightbox global) */}
                      <PersonPhoto src={p.fotoUrl} alt={p.nome} size="sm" caption={[p.funcao, p.cpf && `CPF: ${p.cpf}`, p.obraNome].filter(Boolean).join(" · ") || undefined} />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{p.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.funcao || "—"} · CPF: {p.cpf || "—"}
                          {p.obraNome && <> · <span className="text-slate-700">{p.obraNome}</span></>}
                          {p.ultimaRealizacao && <> · Última: {formatDate(p.ultimaRealizacao)}</>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-xs ${tipoMeta.cls}`}>{tipoMeta.label}</Badge>
                      <Badge className={`text-xs ${estadoMeta.cls}`}>{estadoMeta.label}</Badge>
                      {/* Rev. 2057 — Badge "Nª tentativa" quando o colaborador
                          já reprovou antes da última aprovação. Tentativa N
                          significa "N-1 reprovações anteriores"; aqui é o
                          próximo passo, então N = reprovações + 1. */}
                      {p.kind === "employee" && (p as any).tentativasAnteriores > 0 && (
                        <Badge variant="outline" className="text-xs bg-orange-50 text-orange-800 border-orange-300" title={`Reprovou ${(p as any).tentativasAnteriores}× desde a última aprovação`}>
                          <RefreshCw className="h-3 w-3 mr-1" />{((p as any).tentativasAnteriores + 1)}ª tentativa
                        </Badge>
                      )}
                      {p.kind === "employee" ? (
                        <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" disabled={criarRegistro.isPending} onClick={() => iniciarAgora({ id: p.id, nome: p.nome, cpf: p.cpf, funcao: p.funcao })}>
                          {criarRegistro.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <UserPlus className="h-3 w-3 mr-1" />}Iniciar agora
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { window.location.href = "/terceiros/funcionarios"; }}>
                          <ExternalLink className="h-3 w-3 mr-1" />Cadastrar doc
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="pt-2">
        <h4 className="font-semibold text-sm text-slate-700 mb-2">Em processo · Aguardando colaborador concluir</h4>
      </div>

      {registros.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Nenhuma integração em processo</p>
            <p className="text-xs text-muted-foreground mt-1">Clique em "Iniciar agora" acima ou em "Iniciar Integração" para criar uma nova</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <Card key={r.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="h-4 w-4 text-emerald-700" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{r.employeeNome || "-"}</p>
                      <p className="text-xs text-muted-foreground">{r.employeeFuncao || "-"} · CPF: {r.employeeCpf || "-"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.obraNome && <Badge variant="outline" className="text-xs">{r.obraNome}</Badge>}
                    <Badge className={statusColors[r.status] || ""}>{statusLabels[r.status] || r.status}</Badge>
                    <Badge variant="outline" className="text-xs">{origemLabels[r.origem] || r.origem}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                    {r.token && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyLink(r.token!)}>
                          <Link className="h-3 w-3 mr-1" />Link
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50" onClick={() => shareWhatsApp(r.token!, r.employeeNome || "")}>
                          <MessageSquare className="h-3 w-3 mr-1" />WhatsApp
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={(v) => { if (!v) { setShowNew(false); resetForm(); } }}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
          {/* Rev. 2026 — Regra de ouro: header gradient emerald + ícone em badge branco,
              microcopy explicativa, body p-5, CTA destacado. */}
          <DialogHeader className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 px-5 py-4 border-b border-emerald-800/20">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-white/95 ring-1 ring-white/40 shadow-sm flex items-center justify-center shrink-0">
                {createdLink ? <CheckCircle className="h-6 w-6 text-emerald-600" /> : <ShieldCheck className="h-6 w-6 text-emerald-700" />}
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-white text-lg font-bold leading-tight">
                  {createdLink ? "Integração Criada!" : "Iniciar Integração de Segurança"}
                </DialogTitle>
                <p className="text-emerald-50/90 text-xs mt-0.5">
                  {createdLink
                    ? <>Envie o link para <strong className="text-white">{createdEmployee}</strong> realizar a integração</>
                    : "Selecione colaborador(es), defina obra e configuração, e gere o link de acesso ao treinamento"}
                </p>
              </div>
            </div>
          </DialogHeader>

          {createdLink ? (
            <div className="p-5 space-y-4 bg-white">
              <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/60 p-4">
                <Label className="text-[11px] uppercase tracking-wider text-emerald-700 font-bold mb-2 block flex items-center gap-1.5">
                  <Link className="h-3.5 w-3.5" /> Link da Integração
                </Label>
                <div className="flex gap-2">
                  <Input value={createdLink} readOnly className="text-xs bg-white font-mono" />
                  <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => { navigator.clipboard.writeText(createdLink); toast.success("Link copiado!"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11 text-green-700 border-green-300 hover:bg-green-50 hover:border-green-400" onClick={() => {
                  const msg = encodeURIComponent(`Olá ${createdEmployee}! Segue o link para realizar sua Integração de Segurança:\n\n${createdLink}\n\nAcesse o link e siga as instruções.`);
                  window.open(`https://wa.me/?text=${msg}`, "_blank");
                }}>
                  <MessageSquare className="h-4 w-4 mr-2" />Enviar WhatsApp
                </Button>
                <Button variant="outline" className="h-11" onClick={() => { resetForm(); }}>
                  <Plus className="h-4 w-4 mr-2" />Nova Integração
                </Button>
              </div>

              <DialogFooter className="pt-2 border-t">
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setShowNew(false); resetForm(); }}>Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="p-5 space-y-5 bg-white">
              {/* Bloco 1 — Buscar colaborador */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-white ring-1 ring-slate-200 flex items-center justify-center">
                    <Users className="h-4 w-4 text-emerald-700" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-sm text-slate-800">Colaborador(es) *</h4>
                    <p className="text-[11px] text-slate-600">Pode marcar vários — criamos 1 integração por pessoa</p>
                  </div>
                  {selectedEmps.length > 0 && (
                    <Badge className="bg-emerald-600 text-white text-xs">{selectedEmps.length}</Badge>
                  )}
                </div>
                <div className="p-3 space-y-2.5">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                    <Input
                      value={empSearchTerm}
                      onChange={e => setEmpSearchTerm(e.target.value)}
                      placeholder="Digite o nome ou CPF do colaborador..."
                      className="pl-9 h-10"
                      autoFocus
                    />
                  </div>
                  {filteredEmps.length > 0 && (
                    <div className="border rounded-md max-h-44 overflow-y-auto bg-white shadow-sm">
                      {filteredEmps.map((emp: any) => (
                        <div key={emp.id} className="flex items-center justify-between px-3 py-2 hover:bg-emerald-50/60 cursor-pointer border-b last:border-0 transition-colors" onClick={() => addEmployee(emp)}>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 ring-1 ring-emerald-200 flex items-center justify-center text-[11px] font-bold text-emerald-700 shrink-0">
                              {(emp.nomeCompleto || emp.nome || "?").split(" ").slice(0, 2).map((s: string) => s[0]).join("").toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{emp.nomeCompleto || emp.nome}</p>
                              <p className="text-xs text-muted-foreground truncate">{emp.funcao || "—"} · CPF: {emp.cpf || "—"}</p>
                            </div>
                          </div>
                          <div className="h-7 w-7 rounded-full bg-emerald-100 ring-1 ring-emerald-300 flex items-center justify-center shrink-0">
                            <Plus className="h-3.5 w-3.5 text-emerald-700" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {empSearchTerm.length >= 2 && filteredEmps.length === 0 && !empList.isLoading && (
                    <p className="text-xs text-muted-foreground italic">Nenhum colaborador encontrado para "{empSearchTerm}"</p>
                  )}

                  {selectedEmps.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1">
                      {selectedEmps.map(emp => (
                        <div key={emp.id} className="flex items-center justify-between gap-2 bg-gradient-to-r from-emerald-50 to-teal-50/40 rounded-lg px-2.5 py-1.5 border border-emerald-200">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                              {emp.nome.split(" ").slice(0, 2).map(s => s[0]).join("").toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-800 truncate">{emp.nome}</div>
                              <div className="text-[11px] text-slate-600 truncate">{emp.funcao || "—"}</div>
                            </div>
                          </div>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-red-100 shrink-0" onClick={() => removeEmployee(emp.id)}>
                            <X className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Bloco 2 — Obra e Configuração */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <HardHat className="h-3.5 w-3.5 text-amber-600" /> Obra <span className="text-slate-400 font-normal">(opcional)</span>
                  </Label>
                  <Select value={selectedObraId} onValueChange={setSelectedObraId}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                    {/* Rev. 2033 — popover com largura controlada (não estoura à esquerda em viewports estreitos);
                        items com whitespace-normal pra nomes longos de obra quebrarem em 2 linhas em vez de serem cortados. */}
                    <SelectContent className="max-w-[min(92vw,480px)]">
                      <SelectItem value="none" className="whitespace-normal break-words pr-2">Sem obra específica</SelectItem>
                      {(obras.data as any[])?.map((o: any) => (
                        <SelectItem key={o.id} value={String(o.id)} className="whitespace-normal break-words pr-2">{o.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-500 mt-1 flex items-start gap-1">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                    Vincula a integração à obra (aparece no histórico e relatórios).
                  </p>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" /> Configuração
                  </Label>
                  <Select value={selectedConfigId} onValueChange={setSelectedConfigId}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Automática" /></SelectTrigger>
                    {/* Rev. 2033 — mesmo tratamento de largura/quebra do dropdown de Obra. */}
                    <SelectContent className="max-w-[min(92vw,480px)]">
                      <SelectItem value="auto" className="whitespace-normal break-words pr-2">Automática (padrão)</SelectItem>
                      {configs.data?.map(c => (
                        <SelectItem key={c.id} value={String(c.id)} className="whitespace-normal break-words pr-2">{c.titulo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-500 mt-1 flex items-start gap-1">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                    Define vídeos, nota mínima e validade. "Automática" usa a config padrão da empresa.
                  </p>
                </div>
              </div>

              <DialogFooter className="pt-3 border-t flex-row justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowNew(false); resetForm(); }}>Cancelar</Button>
                <Button
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm h-10 px-5"
                  disabled={selectedEmps.length === 0 || criarRegistro.isPending || criarLote.isPending}
                  onClick={handleCriar}
                >
                  {(criarRegistro.isPending || criarLote.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
                  {selectedEmps.length > 1 ? `Criar ${selectedEmps.length} Integrações` : "Criar Integração"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Rev. 2049 — Nova aba "Aprovados" dedicada aos certificados emitidos.
// Pedido do usuário (IMG_0935): "Coloca um campo de aprovados tbm e quero que
// o certificado fique salvo no raio x do funcionário para registro".
// O certificado é gerado client-side (Rev. 2048) e é REGENERÁVEL a partir do
// próprio registro (mesma fonte da verdade) — já fica "salvo" no Raio-X do
// colaborador via botões da Rev. 2035/2048. Esta aba expõe os mesmos botões
// (Visualizar/Baixar) lado a lado e oferece atalho direto pro Raio-X.
function AprovadosTab({ companyId }: { companyId: number }) {
  const registros = trpc.integracaoSST.listarRegistros.useQuery(
    { companyId, status: "aprovado" },
    { enabled: companyId > 0 }
  );
  const [searchTerm, setSearchTerm] = useState("");
  // Rev. 2052 — modal de assinatura digital do TST (FCSign canvas)
  const [assinandoReg, setAssinandoReg] = useState<any | null>(null);
  // Rev. 2922 — assinatura em lote (lista de registros a assinar de uma vez).
  const [assinandoLote, setAssinandoLote] = useState<any[] | null>(null);
  const [confirmRemoverAss, setConfirmRemoverAss] = useState<any | null>(null);
  const removerAssMut = trpc.integracaoSST.removerAssinaturaTst.useMutation({
    onSuccess: () => {
      toast.success("Assinatura removida");
      registros.refetch();
      setConfirmRemoverAss(null);
    },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 2069 — multiseleção + bulk delete (espelha Pendentes/Reprovados).
  // Pedido do usuário (IMG_0971+0972): "faltou a multi seleção para apagar
  // tudo, selecionado todos de uma vez nas duas abas".
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [confirmExcluir, setConfirmExcluir] = useState<{ ids: number[]; titulo: string; descricao: string } | null>(null);
  // Rev. 2069 follow-up architect: reset seleção em troca de empresa
  // (companyId vem por prop e pode mudar sem remount) pra evitar
  // exclusão indevida de IDs órfãos.
  useEffect(() => { setSelecionados(new Set()); }, [companyId]);
  const excluirMut = trpc.integracaoSST.excluirRegistros.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} certificado(s) excluído(s). Colaborador(es) voltam para "Pendentes" pra refazer a integração.`);
      registros.refetch();
      setSelecionados(new Set());
      setConfirmExcluir(null);
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao excluir registros"),
  });

  const filtered = useMemo(() => {
    const list = registros.data || [];
    if (!searchTerm) return list;
    const q = searchTerm.toLowerCase();
    return list.filter((r: any) =>
      r.employeeNome?.toLowerCase().includes(q) ||
      r.employeeCpf?.includes(searchTerm) ||
      r.obraNome?.toLowerCase().includes(q)
    );
  }, [registros.data, searchTerm]);

  const certParamsFromRegistro = (r: any) => ({
    registroId: r.id,
    employeeNome: r.employeeNome ?? "",
    employeeCpf: r.employeeCpf ?? "",
    employeeFuncao: r.employeeFuncao ?? null,
    obraNome: r.obraNome ?? null,
    // Rev. 2049 follow-up architect: usa título/notaMinima reais da
    // configuração (server faz leftJoin em listarRegistros) — antes
    // notaMinima era 70 hardcoded e o título ficava null.
    configNome: r.configTitulo ?? null,
    dataRealizacao: r.dataRealizacao ?? null,
    dataValidade: r.dataValidade ?? null,
    nota: Number(r.nota || 0),
    notaMinima: Number(r.configNotaMinima ?? 70),
    acertos: null,
    totalPerguntas: null,
    tentativa: r.tentativas ?? null,
    // Rev. 2052 — assinatura digital do TST (FCSign) — quando presente, embute
    // a imagem PNG sobre a linha de assinatura no PDF + nome + data.
    assinaturaTstBase64: r.assinaturaTstBase64 ?? null,
    assinaturaTstNome: r.assinaturaTstNome ?? null,
    assinaturaTstAssinadaEm: r.assinaturaTstAssinadaEm ?? null,
  });

  const visualizar = async (r: any) => {
    const winRef = window.open("about:blank", "_blank");
    try {
      await generateCertificadoIntegracaoSstPdf({ ...certParamsFromRegistro(r), mode: "preview", winRef });
    } catch (e: any) {
      try { winRef?.close(); } catch {}
      toast.error(e?.message || "Erro ao gerar certificado");
    }
  };
  const baixar = async (r: any) => {
    try {
      await generateCertificadoIntegracaoSstPdf(certParamsFromRegistro(r));
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar certificado");
    }
  };

  if (!companyId) return <p className="text-muted-foreground p-4">Selecione uma empresa.</p>;

  const total = (registros.data || []).length;
  const allSelected = filtered.length > 0 && filtered.every((r: any) => selecionados.has(r.id));
  const someSelected = filtered.some((r: any) => selecionados.has(r.id));
  // Rev. 2922 — selecionados que AINDA não têm assinatura do TST (alvos do lote).
  const naoAssinadosSel = filtered.filter((r: any) => selecionados.has(r.id) && !r.assinaturaTstBase64);
  const toggleAll = () => {
    if (allSelected) setSelecionados(new Set());
    else setSelecionados(new Set(filtered.map((r: any) => r.id)));
  };
  const toggleOne = (id: number) => {
    const next = new Set(selecionados);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelecionados(next);
  };
  const excluirSelecionados = () => {
    const ids = Array.from(selecionados);
    if (ids.length === 0) return;
    setConfirmExcluir({
      ids,
      titulo: `Excluir ${ids.length} certificado${ids.length > 1 ? "s" : ""}?`,
      descricao: `${ids.length === 1 ? "O colaborador volta" : "Os colaboradores voltam"} para "Pendentes" pra refazer a integração. O certificado emitido será removido. Esta ação não pode ser desfeita.`,
    });
  };
  const excluirUm = (id: number, nome: string) => {
    setConfirmExcluir({
      ids: [id],
      titulo: `Excluir certificado de ${nome}?`,
      descricao: `O colaborador volta para "Pendentes" pra refazer a integração. O certificado emitido será removido.`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Banner explicativo */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 flex gap-3 items-start">
        <Award className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
        <div className="text-sm text-emerald-900">
          <p className="font-semibold">Certificados emitidos</p>
          <p className="text-emerald-800/90">
            Todo colaborador aprovado ganha um certificado, que fica registrado no <strong>Raio-X do colaborador</strong> e pode ser
            visualizado / impresso / baixado a qualquer momento (também direto aqui).
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="font-semibold">Aprovados {total > 0 && <span className="text-muted-foreground font-normal">· {total}</span>}</h3>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Rev. 2922 — Assinatura em lote: aparece quando há selecionados
              SEM assinatura. Assina todos de uma vez (uma assinatura só). */}
          {naoAssinadosSel.length > 0 && (
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => setAssinandoLote(naoAssinadosSel)}
            >
              <PenLine className="h-4 w-4 mr-1" />
              Assinar {naoAssinadosSel.length} selecionado{naoAssinadosSel.length > 1 ? "s" : ""}
            </Button>
          )}
          {selecionados.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={excluirSelecionados}
              disabled={excluirMut.isPending}
            >
              {excluirMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Excluir {selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}
            </Button>
          )}
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar nome, CPF, obra..." className="pl-8 w-64" />
          </div>
        </div>
      </div>

      {/* Rev. 2049 follow-up architect: estado de erro explícito (com retry)
          pra não mascarar falha operacional como "lista vazia". */}
      {registros.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-red-900">Falha ao carregar aprovados</p>
            <p className="text-sm text-red-800/90">{(registros.error as any)?.message || "Erro desconhecido."}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => registros.refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Tentar novamente
          </Button>
        </div>
      ) : registros.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="p-2 text-left w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                  onChange={toggleAll}
                  aria-label="Selecionar todos"
                />
              </th>
              <th className="p-2 text-left">Colaborador</th>
              <th className="p-2 text-left">CPF</th>
              <th className="p-2 text-left">Função</th>
              <th className="p-2 text-left">Obra</th>
              <th className="p-2 text-center">Nota</th>
              <th className="p-2 text-left">Realização</th>
              <th className="p-2 text-left">Validade</th>
              <th className="p-2 text-left">Assinatura TST</th>
              <th className="p-2 text-left">Certificado</th>
              <th className="p-2 text-left w-24">Raio-X</th>
              <th className="p-2 text-left w-16">Ações</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">
                  {searchTerm ? "Nenhum aprovado encontrado para a busca." : "Nenhuma integração aprovada ainda."}
                </td></tr>
              )}
              {filtered.map((r: any) => {
                const venceu = r.dataValidade && new Date(r.dataValidade) < new Date();
                return (
                  <tr key={r.id} className={`border-b hover:bg-emerald-50/30 ${selecionados.has(r.id) ? "bg-emerald-50/60" : ""}`}>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer"
                        checked={selecionados.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Selecionar ${r.employeeNome || "registro"}`}
                      />
                    </td>
                    <td className="p-2 font-medium">{r.employeeNome || "-"}</td>
                    <td className="p-2 text-xs">{r.employeeCpf || "-"}</td>
                    <td className="p-2 text-xs">{r.employeeFuncao || "-"}</td>
                    <td className="p-2 text-xs">{r.obraNome || "-"}</td>
                    <td className="p-2 text-center">
                      <Badge className="bg-emerald-100 text-emerald-800">{r.nota ? `${r.nota}%` : "-"}</Badge>
                    </td>
                    <td className="p-2 text-xs">{formatDate(r.dataRealizacao)}</td>
                    <td className="p-2 text-xs">
                      {r.dataValidade ? (
                        <span className={venceu ? "text-red-600 font-semibold" : "text-emerald-700"}>
                          {formatDate(r.dataValidade)}{venceu ? " (vencido)" : ""}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="p-2">
                      {r.assinaturaTstBase64 ? (
                        <div className="flex items-center gap-1.5">
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Assinado
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-red-600 hover:bg-red-50"
                            onClick={() => setConfirmRemoverAss(r)}
                            title="Remover assinatura (reassinar)"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-blue-300 text-blue-700 hover:bg-blue-50"
                          onClick={() => setAssinandoReg(r)}
                          title="Assinar digitalmente como TST"
                        >
                          <PenLine className="h-3.5 w-3.5 mr-1" /> Assinar
                        </Button>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => visualizar(r)}
                          title="Visualizar / Imprimir certificado"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => baixar(r)}
                          title="Baixar certificado em PDF"
                        >
                          <Download className="h-3.5 w-3.5 mr-1" /> PDF
                        </Button>
                      </div>
                    </td>
                    <td className="p-2">
                      {r.employeeId ? (
                        <WouterLink href={`/raio-x/${r.employeeId}`}>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" title="Abrir Raio-X do colaborador">
                            <FileText className="h-3.5 w-3.5 mr-1" /> Abrir
                          </Button>
                        </WouterLink>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => excluirUm(r.id, r.employeeNome || "Colaborador")}
                        disabled={excluirMut.isPending}
                        title="Excluir certificado — colaborador volta para Pendentes"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Rev. 2069 — confirmação de exclusão (multi/single) */}
      <AlertDialog open={!!confirmExcluir} onOpenChange={(o) => !o && !excluirMut.isPending && setConfirmExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmExcluir?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{confirmExcluir?.descricao}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluirMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={excluirMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!confirmExcluir) return;
                excluirMut.mutate({ companyId, ids: confirmExcluir.ids });
              }}
            >
              {excluirMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rev. 2052 — Modal de assinatura digital do TST (FCSign canvas) */}
      {assinandoReg && (
        <AssinarTstDialog
          registro={assinandoReg}
          companyId={companyId}
          onClose={() => setAssinandoReg(null)}
          onSigned={() => { setAssinandoReg(null); registros.refetch(); }}
        />
      )}

      {/* Rev. 2922 — Modal de assinatura em LOTE (uma assinatura → vários certificados) */}
      {assinandoLote && assinandoLote.length > 0 && (
        <AssinarTstLoteDialog
          registros={assinandoLote}
          companyId={companyId}
          onClose={() => setAssinandoLote(null)}
          onSigned={() => { setAssinandoLote(null); setSelecionados(new Set()); registros.refetch(); }}
        />
      )}

      <AlertDialog open={!!confirmRemoverAss} onOpenChange={(open) => !open && !removerAssMut.isPending && setConfirmRemoverAss(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover assinatura?</AlertDialogTitle>
            <AlertDialogDescription>
              A assinatura digital de <strong>{confirmRemoverAss?.assinaturaTstNome || "—"}</strong> em "{confirmRemoverAss?.employeeNome}" será apagada.
              Você poderá assinar novamente. Esta ação não afeta a aprovação nem a nota do colaborador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removerAssMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={removerAssMut.isPending}
              onClick={() => confirmRemoverAss && removerAssMut.mutate({ companyId, registroId: confirmRemoverAss.id })}
              className="bg-red-600 hover:bg-red-700"
            >
              {removerAssMut.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Rev. 2055 — Aba "Reprovados" — pedido do usuário (IMG_0942): "Liste os
// reprovados também". Espelha AprovadosTab (Rev. 2049) mas SEM certificado/
// assinatura/raio-x-de-certificado: reprovado não recebe certificado.
// Mostra nota (vermelho), tentativas, datas + badge "Pendente · refazer"
// + atalho Raio-X. Rev. 2056: removi botão "Liberar" porque o servidor
// já considera só status='aprovado' como integração válida — reprovado
// já reaparece automaticamente em Pendentes (esta aba virou só
// consulta/histórico das reprovações).
function ReprovadosTab({ companyId }: { companyId: number }) {
  const registros = trpc.integracaoSST.listarRegistros.useQuery(
    { companyId, status: "reprovado" },
    { enabled: companyId > 0 }
  );
  const [searchTerm, setSearchTerm] = useState("");
  // Rev. 2069 — multiseleção + bulk delete (espelha Pendentes/Aprovados).
  // Pedido IMG_0971+0972: "faltou a multi seleção para apagar tudo".
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [confirmExcluir, setConfirmExcluir] = useState<{ ids: number[]; titulo: string; descricao: string } | null>(null);
  // Rev. 2069 follow-up architect: reset seleção em troca de empresa.
  useEffect(() => { setSelecionados(new Set()); }, [companyId]);
  const excluirMut = trpc.integracaoSST.excluirRegistros.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} reprovação(ões) excluída(s). Colaborador(es) voltam para "Pendentes" pra refazer a integração.`);
      registros.refetch();
      setSelecionados(new Set());
      setConfirmExcluir(null);
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao excluir registros"),
  });

  const filtered = useMemo(() => {
    const list = registros.data || [];
    if (!searchTerm) return list;
    const q = searchTerm.toLowerCase();
    return list.filter((r: any) =>
      r.employeeNome?.toLowerCase().includes(q) ||
      r.employeeCpf?.includes(searchTerm) ||
      r.obraNome?.toLowerCase().includes(q)
    );
  }, [registros.data, searchTerm]);

  if (!companyId) return <p className="text-muted-foreground p-4">Selecione uma empresa.</p>;

  const total = (registros.data || []).length;
  const allSelected = filtered.length > 0 && filtered.every((r: any) => selecionados.has(r.id));
  const someSelected = filtered.some((r: any) => selecionados.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelecionados(new Set());
    else setSelecionados(new Set(filtered.map((r: any) => r.id)));
  };
  const toggleOne = (id: number) => {
    const next = new Set(selecionados);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelecionados(next);
  };
  const excluirSelecionados = () => {
    const ids = Array.from(selecionados);
    if (ids.length === 0) return;
    setConfirmExcluir({
      ids,
      titulo: `Excluir ${ids.length} reprovação${ids.length > 1 ? "ões" : ""}?`,
      descricao: `${ids.length === 1 ? "O registro de reprovação será apagado" : "Os registros de reprovação serão apagados"}. ${ids.length === 1 ? "O colaborador continua" : "Os colaboradores continuam"} em "Pendentes" pra refazer. Esta ação não pode ser desfeita.`,
    });
  };
  const excluirUm = (id: number, nome: string) => {
    setConfirmExcluir({
      ids: [id],
      titulo: `Excluir reprovação de ${nome}?`,
      descricao: `O registro será apagado. O colaborador continua em "Pendentes" pra refazer a integração.`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Banner explicativo vermelho — Rev. 2056: reprovado volta AUTOMATICAMENTE
          pra Pendentes (a regra de "última integração válida" no servidor só
          considera status=aprovado, então quem reprovou já reaparece sozinho
          na fila de Pendentes pra refazer). Esta aba virou consulta/histórico. */}
      <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 flex gap-3 items-start">
        <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
        <div className="text-sm text-red-900">
          <p className="font-semibold">Colaboradores reprovados</p>
          <p className="text-red-800/90">
            Não atingiram a nota mínima do questionário. Reprovados <strong>não recebem certificado</strong> e
            <strong> voltam automaticamente para "Pendentes"</strong> para refazer a integração — não é preciso liberar manualmente.
            Esta aba é a consulta/histórico de quem reprovou.
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="font-semibold">Reprovados {total > 0 && <span className="text-muted-foreground font-normal">· {total}</span>}</h3>
        <div className="flex gap-2 flex-wrap items-center">
          {selecionados.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={excluirSelecionados}
              disabled={excluirMut.isPending}
            >
              {excluirMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Excluir {selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}
            </Button>
          )}
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar nome, CPF, obra..." className="pl-8 w-64" />
          </div>
        </div>
      </div>

      {registros.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-red-900">Falha ao carregar reprovados</p>
            <p className="text-sm text-red-800/90">{(registros.error as any)?.message || "Erro desconhecido."}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => registros.refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Tentar novamente
          </Button>
        </div>
      ) : registros.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="p-2 text-left w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                  onChange={toggleAll}
                  aria-label="Selecionar todos"
                />
              </th>
              <th className="p-2 text-left">Colaborador</th>
              <th className="p-2 text-left">CPF</th>
              <th className="p-2 text-left">Função</th>
              <th className="p-2 text-left">Obra</th>
              <th className="p-2 text-center">Nota</th>
              <th className="p-2 text-center">Mínima</th>
              <th className="p-2 text-center">Tentativas</th>
              <th className="p-2 text-left">Reprovação</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left w-24">Raio-X</th>
              <th className="p-2 text-left w-16">Ações</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">
                  {searchTerm ? "Nenhum reprovado encontrado para a busca." : "Nenhum colaborador reprovado. Bom sinal!"}
                </td></tr>
              )}
              {filtered.map((r: any) => {
                const notaMin = Number(r.configNotaMinima ?? 70);
                const nota = Number(r.nota || 0);
                return (
                  <tr key={r.id} className={`border-b hover:bg-red-50/30 ${selecionados.has(r.id) ? "bg-red-50/60" : ""}`}>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer"
                        checked={selecionados.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Selecionar ${r.employeeNome || "registro"}`}
                      />
                    </td>
                    <td className="p-2 font-medium">{r.employeeNome || "-"}</td>
                    <td className="p-2 text-xs">{r.employeeCpf || "-"}</td>
                    <td className="p-2 text-xs">{r.employeeFuncao || "-"}</td>
                    <td className="p-2 text-xs">{r.obraNome || "-"}</td>
                    <td className="p-2 text-center">
                      <Badge className="bg-red-100 text-red-800 border-red-300">
                        {r.nota != null ? `${nota}%` : "-"}
                      </Badge>
                    </td>
                    <td className="p-2 text-center text-xs text-muted-foreground">{notaMin}%</td>
                    <td className="p-2 text-center">
                      <Badge variant="outline" className="text-xs">{r.tentativas ?? 0}</Badge>
                    </td>
                    <td className="p-2 text-xs">{formatDate(r.dataRealizacao)}</td>
                    <td className="p-2">
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1 text-[10px]">
                        <Clock className="h-3 w-3" /> Pendente · refazer
                      </Badge>
                    </td>
                    <td className="p-2">
                      {r.employeeId ? (
                        <WouterLink href={`/raio-x/${r.employeeId}`}>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" title="Abrir Raio-X do colaborador">
                            <FileText className="h-3.5 w-3.5 mr-1" /> Abrir
                          </Button>
                        </WouterLink>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => excluirUm(r.id, r.employeeNome || "Colaborador")}
                        disabled={excluirMut.isPending}
                        title="Excluir reprovação"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Rev. 2069 — confirmação de exclusão (multi/single) */}
      <AlertDialog open={!!confirmExcluir} onOpenChange={(o) => !o && !excluirMut.isPending && setConfirmExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmExcluir?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{confirmExcluir?.descricao}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluirMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={excluirMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!confirmExcluir) return;
                excluirMut.mutate({ companyId, ids: confirmExcluir.ids });
              }}
            >
              {excluirMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Rev. 2052 — Modal de captura de assinatura digital do TST (FCSign).
// Reusa o padrão de canvas signature pad de EpiAssinatura.tsx: HTML5 Canvas
// com handlers de touch+mouse, exporta PNG base64 via canvas.toDataURL.
function AssinarTstDialog({ registro, companyId, onClose, onSigned }: {
  registro: any; companyId: number; onClose: () => void; onSigned: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [nomeTst, setNomeTst] = useState("");

  const assinarMut = trpc.integracaoSST.assinarComoTst.useMutation({
    onSuccess: () => {
      toast.success("Assinatura registrada no certificado!");
      onSigned();
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };
  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  };
  const stopDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return toast.error("Assine antes de confirmar");
    if (nomeTst.trim().length < 2) return toast.error("Informe o nome do TST");
    const dataUrl = canvas.toDataURL("image/png");
    assinarMut.mutate({
      companyId,
      registroId: registro.id,
      assinaturaBase64: dataUrl,
      nomeTst: nomeTst.trim(),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !assinarMut.isPending && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-blue-600" />
            Assinatura Digital do TST
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-sm">
            <p className="font-semibold text-blue-900">{registro.employeeNome}</p>
            <p className="text-blue-800/90 text-xs">
              CPF {registro.employeeCpf || "—"} · Nota {registro.nota || 0}% · Realização {formatDate(registro.dataRealizacao)}
            </p>
            <p className="text-blue-800/80 text-xs mt-1">
              Sua assinatura será embutida no certificado e ficará disponível no Raio-X do colaborador.
            </p>
          </div>

          <div>
            <Label htmlFor="nomeTst">Nome do Técnico de Segurança do Trabalho *</Label>
            <Input
              id="nomeTst"
              value={nomeTst}
              onChange={(e) => setNomeTst(e.target.value)}
              placeholder="Ex: João da Silva — TST 12345"
              maxLength={255}
              disabled={assinarMut.isPending}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Assinatura *</Label>
            <div className="mt-1 border-2 border-dashed border-slate-300 rounded-lg bg-white">
              <canvas
                ref={canvasRef}
                className="w-full h-48 touch-none rounded-lg cursor-crosshair"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Desenhe sua assinatura com o mouse ou dedo (iPad/celular).
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={clearCanvas} disabled={assinarMut.isPending} className="sm:mr-auto">
            <RefreshCw className="h-4 w-4 mr-1" /> Limpar
          </Button>
          <Button variant="outline" onClick={onClose} disabled={assinarMut.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={assinarMut.isPending || !hasSignature || nomeTst.trim().length < 2}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {assinarMut.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando...</> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar Assinatura</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Rev. 2922 — Modal de assinatura do TST EM LOTE. Reusa o mesmo canvas-pad
// do AssinarTstDialog, mas a MESMA assinatura/nome é aplicada a TODOS os
// registros selecionados de uma vez (pedido do usuário: "selecionar todos e
// assinar de uma vez pra ganhar tempo"). Chama assinarComoTstEmLote.
function AssinarTstLoteDialog({ registros, companyId, onClose, onSigned }: {
  registros: any[]; companyId: number; onClose: () => void; onSigned: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [nomeTst, setNomeTst] = useState("");

  const assinarMut = trpc.integracaoSST.assinarComoTstEmLote.useMutation({
    onSuccess: (data) => {
      if (data.count === 0) {
        toast.info("Nenhum certificado elegível (os selecionados já estavam assinados).");
      } else {
        toast.success(`${data.count} certificado(s) assinado(s) de uma vez!`);
      }
      onSigned();
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };
  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };
  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  };
  const stopDraw = () => setIsDrawing(false);
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return toast.error("Assine antes de confirmar");
    if (nomeTst.trim().length < 2) return toast.error("Informe o nome do TST");
    const dataUrl = canvas.toDataURL("image/png");
    assinarMut.mutate({
      companyId,
      registroIds: registros.map(r => r.id),
      assinaturaBase64: dataUrl,
      nomeTst: nomeTst.trim(),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !assinarMut.isPending && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-blue-600" />
            Assinatura em Lote — {registros.length} colaborador{registros.length > 1 ? "es" : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-sm">
            <p className="font-semibold text-blue-900">
              Sua assinatura será aplicada de uma vez a {registros.length} certificado{registros.length > 1 ? "s" : ""}:
            </p>
            <div className="mt-2 max-h-32 overflow-y-auto rounded border border-blue-100 bg-white/70 p-2 text-xs text-blue-800/90 space-y-0.5">
              {registros.map(r => (
                <div key={r.id} className="flex justify-between gap-2">
                  <span className="truncate">{r.employeeNome || "—"}</span>
                  <span className="text-blue-700/70 shrink-0">{r.employeeCpf || ""}</span>
                </div>
              ))}
            </div>
            <p className="text-blue-800/80 text-xs mt-2">
              Cada certificado recebe a MESMA assinatura e o MESMO nome de TST. Colaboradores já assinados não são alterados.
            </p>
          </div>

          <div>
            <Label htmlFor="nomeTstLote">Nome do Técnico de Segurança do Trabalho *</Label>
            <Input
              id="nomeTstLote"
              value={nomeTst}
              onChange={(e) => setNomeTst(e.target.value)}
              placeholder="Ex: João da Silva — TST 12345"
              maxLength={255}
              disabled={assinarMut.isPending}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Assinatura *</Label>
            <div className="mt-1 border-2 border-dashed border-slate-300 rounded-lg bg-white">
              <canvas
                ref={canvasRef}
                className="w-full h-48 touch-none rounded-lg cursor-crosshair"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Desenhe sua assinatura com o mouse ou dedo (iPad/celular).
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={clearCanvas} disabled={assinarMut.isPending} className="sm:mr-auto">
            <RefreshCw className="h-4 w-4 mr-1" /> Limpar
          </Button>
          <Button variant="outline" onClick={onClose} disabled={assinarMut.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={assinarMut.isPending || !hasSignature || nomeTst.trim().length < 2}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {assinarMut.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Assinando...</> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Assinar {registros.length} certificado{registros.length > 1 ? "s" : ""}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoricoTab({ companyId }: { companyId: number }) {
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const registros = trpc.integracaoSST.listarRegistros.useQuery(
    { companyId, status: statusFiltro as any },
    { enabled: companyId > 0 }
  );
  // Rev. 2044 — obras pra edição do registro
  const obrasQuery = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const [searchTerm, setSearchTerm] = useState("");
  // Rev. 2044 — múltipla seleção
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  // Rev. 2044 — edição de obra
  const [editando, setEditando] = useState<{ id: number; nome: string; obraId: number | null } | null>(null);
  const [editObraId, setEditObraId] = useState<string>("none");
  // Rev. 2045 — confirmação de exclusão via AlertDialog (sem URL do replit.dev no window.confirm)
  const [confirmExcluir, setConfirmExcluir] = useState<{ ids: number[]; titulo: string; descricao: string } | null>(null);

  const refetchAll = () => {
    registros.refetch();
    setSelecionados(new Set());
  };

  const excluirMut = trpc.integracaoSST.excluirRegistros.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} registro(s) excluído(s). Colaborador(es) voltam para "Pendentes" pra refazer a integração.`);
      refetchAll();
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao excluir registros"),
  });

  const atualizarMut = trpc.integracaoSST.atualizarRegistro.useMutation({
    onSuccess: () => {
      toast.success("Registro atualizado");
      setEditando(null);
      registros.refetch();
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao atualizar"),
  });

  const filtered = searchTerm
    ? (registros.data || []).filter(r => r.employeeNome?.toLowerCase().includes(searchTerm.toLowerCase()) || r.employeeCpf?.includes(searchTerm))
    : (registros.data || []);

  const allSelected = filtered.length > 0 && filtered.every(r => selecionados.has(r.id));
  const someSelected = filtered.some(r => selecionados.has(r.id));

  const toggleAll = () => {
    if (allSelected) setSelecionados(new Set());
    else setSelecionados(new Set(filtered.map(r => r.id)));
  };
  const toggleOne = (id: number) => {
    const next = new Set(selecionados);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelecionados(next);
  };

  const excluirSelecionados = () => {
    const ids = Array.from(selecionados);
    if (ids.length === 0) return;
    setConfirmExcluir({
      ids,
      titulo: `Excluir ${ids.length} registro${ids.length > 1 ? "s" : ""}?`,
      descricao: `${ids.length === 1 ? "O colaborador volta" : "Os colaboradores voltam"} para "Pendentes" pra refazer a integração. Esta ação não pode ser desfeita.`,
    });
  };
  const excluirUm = (id: number, nome: string) => {
    setConfirmExcluir({
      ids: [id],
      titulo: `Excluir registro de ${nome}?`,
      descricao: `O colaborador volta para "Pendentes" pra refazer a integração.`,
    });
  };
  const abrirEdicao = (r: any) => {
    setEditando({ id: r.id, nome: r.employeeNome || "Colaborador", obraId: r.obraId ?? null });
    setEditObraId(r.obraId ? String(r.obraId) : "none");
  };
  const salvarEdicao = () => {
    if (!editando) return;
    atualizarMut.mutate({
      companyId,
      id: editando.id,
      obraId: editObraId === "none" ? null : Number(editObraId),
    });
  };

  if (!companyId) return <p className="text-muted-foreground p-4">Selecione uma empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="font-semibold">Histórico de Integrações</h3>
        <div className="flex gap-2 flex-wrap">
          {selecionados.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={excluirSelecionados}
              disabled={excluirMut.isPending}
            >
              {excluirMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Excluir {selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}
            </Button>
          )}
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar..." className="pl-8 w-48" />
          </div>
          <Select value={statusFiltro} onValueChange={(v) => { setStatusFiltro(v); setSelecionados(new Set()); }}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="aprovado">Aprovado</SelectItem>
              <SelectItem value="reprovado">Reprovado</SelectItem>
              <SelectItem value="vencido">Vencido</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {registros.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="p-2 text-left w-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                  onChange={toggleAll}
                  aria-label="Selecionar todos"
                />
              </th>
              <th className="p-2 text-left">Colaborador</th>
              <th className="p-2 text-left">CPF</th>
              <th className="p-2 text-left">Função</th>
              <th className="p-2 text-left">Obra</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Nota</th>
              <th className="p-2 text-left">Tentativas</th>
              <th className="p-2 text-left">Origem</th>
              <th className="p-2 text-left">Realização</th>
              <th className="p-2 text-left">Validade</th>
              <th className="p-2 text-left w-24">Ações</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={12} className="p-4 text-center text-muted-foreground">Nenhum registro encontrado</td></tr>}
              {filtered.map(r => (
                <tr key={r.id} className={`border-b hover:bg-muted/20 ${selecionados.has(r.id) ? "bg-emerald-50/60" : ""}`}>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer"
                      checked={selecionados.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      aria-label={`Selecionar ${r.employeeNome || "registro"}`}
                    />
                  </td>
                  <td className="p-2 font-medium">{r.employeeNome || "-"}</td>
                  <td className="p-2 text-xs">{r.employeeCpf || "-"}</td>
                  <td className="p-2 text-xs">{r.employeeFuncao || "-"}</td>
                  <td className="p-2 text-xs">{r.obraNome || "-"}</td>
                  <td className="p-2"><Badge className={statusColors[r.status] || ""}>{statusLabels[r.status] || r.status}</Badge></td>
                  <td className="p-2 text-center">{r.nota ? `${r.nota}%` : "-"}</td>
                  <td className="p-2 text-center">{r.tentativas}</td>
                  <td className="p-2"><Badge variant="outline" className="text-xs">{origemLabels[r.origem] || r.origem}</Badge></td>
                  <td className="p-2 text-xs">{formatDate(r.dataRealizacao)}</td>
                  <td className="p-2 text-xs">{formatDate(r.dataValidade)}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => abrirEdicao(r)} title="Editar obra">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => excluirUm(r.id, r.employeeNome || "Colaborador")}
                        disabled={excluirMut.isPending}
                        title="Excluir — colaborador volta para Pendentes"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!confirmExcluir} onOpenChange={(o) => !o && !excluirMut.isPending && setConfirmExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmExcluir?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{confirmExcluir?.descricao}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluirMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={excluirMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!confirmExcluir) return;
                excluirMut.mutate(
                  { companyId, ids: confirmExcluir.ids },
                  { onSettled: () => setConfirmExcluir(null) }
                );
              }}
            >
              {excluirMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Registro</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Colaborador</Label>
                <p className="font-medium">{editando.nome}</p>
              </div>
              <div>
                <Label>Obra</Label>
                <Select value={editObraId} onValueChange={setEditObraId}>
                  <SelectTrigger><SelectValue placeholder="Sem obra" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem obra —</SelectItem>
                    {(obrasQuery.data || []).map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Para refazer a integração deste colaborador, exclua o registro — ele volta automaticamente para a aba "Pendentes".
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={atualizarMut.isPending}>
              {atualizarMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessoesTab({ companyId }: { companyId: number }) {
  const sessoes = trpc.integracaoSST.listarSessoes.useQuery({ companyId }, { enabled: companyId > 0 });
  const criarSessao = trpc.integracaoSST.criarSessao.useMutation({ onSuccess: () => { sessoes.refetch(); setShowNew(false); toast.success("Sessão criada"); } });
  const [showNew, setShowNew] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [dataSessao, setDataSessao] = useState("");
  const [tipo, setTipo] = useState<"individual" | "grupo">("grupo");

  if (!companyId) return <p className="text-muted-foreground p-4">Selecione uma empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">Sessões de Integração</h3>
        <Button size="sm" onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1" />Nova Sessão</Button>
      </div>

      {sessoes.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sessoes.data?.length === 0 && <p className="text-muted-foreground text-sm col-span-full">Nenhuma sessão cadastrada</p>}
          {sessoes.data?.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium">{s.titulo || "Sessão sem título"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(s.dataSessao)} · {s.tipo === "grupo" ? "Grupo" : "Individual"}</p>
                  </div>
                  <Badge variant={s.status === "agendada" ? "outline" : s.status === "concluida" ? "default" : "secondary"}>{s.status}</Badge>
                </div>
                <div className="flex gap-4 text-sm">
                  <span><Users className="h-3 w-3 inline mr-1" />{s.participantes ?? 0} participantes</span>
                  <span><CheckCircle className="h-3 w-3 inline mr-1 text-green-500" />{s.aprovados ?? 0} aprovados</span>
                </div>
                {s.responsavel && <p className="text-xs text-muted-foreground mt-1">Responsável: {s.responsavel}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Sessão de Integração</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Turma Janeiro/2026" /></div>
            <div><Label>Data da Sessão</Label><Input type="date" value={dataSessao} onChange={e => setDataSessao(e.target.value)} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v: "individual" | "grupo") => setTipo(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grupo">Grupo</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button disabled={criarSessao.isPending}
              onClick={() => criarSessao.mutate({ companyId, titulo: titulo || undefined, dataSessao: dataSessao || undefined, tipo })}>
              {criarSessao.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
