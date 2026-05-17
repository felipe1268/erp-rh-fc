import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  LayoutDashboard, Settings, Clock, History, Users, Plus, Trash2, Edit, Copy,
  CheckCircle, XCircle, AlertTriangle, TrendingUp, GraduationCap, Eye, Video,
  ChevronDown, ChevronRight, Loader2, ClipboardList, BarChart3, RefreshCw, Search,
  Play, ExternalLink, Save, X, Film, UserPlus, Send, Link, Share2, MessageSquare,
} from "lucide-react";

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
  const companyId = selectedCompanyId ?? 0;
  const [tab, setTab] = useState("dashboard");

  // Rev. 2005 — Tabs alinhadas à regra de ouro: chip emerald, gradient header
  const tabs: { value: string; label: string; icon: any; desc: string }[] = [
    { value: "dashboard", label: "Dashboard", icon: LayoutDashboard, desc: "Visão geral" },
    { value: "videos", label: "Vídeos", icon: Film, desc: "Conteúdo de treinamento" },
    { value: "config", label: "Configurações", icon: Settings, desc: "Regras e fluxo" },
    { value: "pendentes", label: "Pendentes", icon: Clock, desc: "A concluir" },
    { value: "historico", label: "Histórico", icon: History, desc: "Concluídos" },
    { value: "sessoes", label: "Sessões", icon: Users, desc: "Turmas presenciais" },
  ];

  return (
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
          <TabsContent value="dashboard" className="mt-0"><DashboardTab companyId={companyId} /></TabsContent>
          <TabsContent value="videos" className="mt-0"><VideosTab companyId={companyId} /></TabsContent>
          <TabsContent value="config" className="mt-0"><ConfigTab companyId={companyId} /></TabsContent>
          <TabsContent value="pendentes" className="mt-0"><PendentesTab companyId={companyId} /></TabsContent>
          <TabsContent value="historico" className="mt-0"><HistoricoTab companyId={companyId} /></TabsContent>
          <TabsContent value="sessoes" className="mt-0"><SessoesTab companyId={companyId} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function DashboardTab({ companyId }: { companyId: number }) {
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
        <KpiCard label="Aprovados"      value={k?.aprovados ?? 0}        icon={CheckCircle}   accent="emerald" />
        <KpiCard label="Pendentes"      value={k?.pendentes ?? 0}        icon={Clock}         accent="amber" />
        <KpiCard label="Reprovados"     value={k?.reprovados ?? 0}       icon={XCircle}       accent="red" />
        <KpiCard label="Vencendo (30d)" value={k?.vencendoEm30Dias ?? 0} icon={AlertTriangle} accent="orange" />
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

function KpiCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent: "blue" | "emerald" | "amber" | "red" | "orange" }) {
  const accents: Record<string, { bg: string; chip: string; ring: string; icon: string; num: string; bar: string }> = {
    blue:    { bg: "bg-blue-50/40",    chip: "bg-blue-100",    ring: "ring-blue-200",    icon: "text-blue-600",    num: "text-blue-900",    bar: "bg-blue-500" },
    emerald: { bg: "bg-emerald-50/40", chip: "bg-emerald-100", ring: "ring-emerald-200", icon: "text-emerald-600", num: "text-emerald-900", bar: "bg-emerald-500" },
    amber:   { bg: "bg-amber-50/40",   chip: "bg-amber-100",   ring: "ring-amber-200",   icon: "text-amber-600",   num: "text-amber-900",   bar: "bg-amber-500" },
    red:     { bg: "bg-red-50/40",     chip: "bg-red-100",     ring: "ring-red-200",     icon: "text-red-600",     num: "text-red-900",     bar: "bg-red-500" },
    orange:  { bg: "bg-orange-50/40",  chip: "bg-orange-100",  ring: "ring-orange-200",  icon: "text-orange-600",  num: "text-orange-900",  bar: "bg-orange-500" },
  };
  const a = accents[accent];
  return (
    <div className={`relative rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow`}>
      <div className={`absolute inset-x-0 top-0 h-1 ${a.bar}`} />
      <div className={`${a.bg} px-3 pt-3.5 pb-3`}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[10px] sm:text-[11px] text-slate-600 uppercase tracking-wider font-semibold truncate">{label}</span>
          <span className={`inline-flex items-center justify-center h-7 w-7 rounded-lg ${a.chip} ring-1 ${a.ring} shrink-0`}>
            <Icon className={`h-3.5 w-3.5 ${a.icon}`} />
          </span>
        </div>
        <p className={`text-2xl sm:text-3xl font-extrabold tabular-nums ${a.num}`}>{value}</p>
      </div>
    </div>
  );
}

function getYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/);
  return match?.[1] || null;
}

function VideosTab({ companyId }: { companyId: number }) {
  const modulos = trpc.integracaoSST.listarTodosModulos.useQuery({ companyId }, { enabled: companyId > 0 });
  const configs = trpc.integracaoSST.listarConfigs.useQuery({ companyId }, { enabled: companyId > 0 });
  const criarModulo = trpc.integracaoSST.criarModulo.useMutation({ onSuccess: () => { modulos.refetch(); resetForm(); toast.success("Vídeo cadastrado com sucesso"); } });
  const atualizarModulo = trpc.integracaoSST.atualizarModulo.useMutation({ onSuccess: () => { modulos.refetch(); setEditingId(null); toast.success("Vídeo atualizado"); } });
  const excluirModulo = trpc.integracaoSST.excluirModulo.useMutation({ onSuccess: () => { modulos.refetch(); toast.success("Vídeo excluído"); } });

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

  const handleSave = () => {
    if (!titulo.trim()) { toast.error("Informe o título do vídeo"); return; }
    if (!configId) { toast.error("Selecione a configuração de integração"); return; }

    if (editingId) {
      atualizarModulo.mutate({
        id: editingId,
        companyId,
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
        videoUrl: videoUrl.trim() || undefined,
        videoTipo,
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
        videoUrl: videoUrl.trim() || undefined,
        videoTipo,
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
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-800">Nenhuma configuração criada</p>
              <p className="text-xs text-yellow-700">Crie uma configuração na aba "Configurações" antes de cadastrar vídeos.</p>
            </div>
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
            return (
              <Card key={mod.id} className="overflow-hidden group hover:shadow-md transition-shadow">
                <div className="relative aspect-video bg-gray-900 cursor-pointer" onClick={() => setPreviewId(isExpanded ? null : mod.id)}>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Vídeo" : "Novo Vídeo de Integração"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Configuração de Integração *</Label>
              <Select value={configId} onValueChange={setConfigId} disabled={!!editingId}>
                <SelectTrigger><SelectValue placeholder="Selecione a configuração" /></SelectTrigger>
                <SelectContent>
                  {configs.data?.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.titulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Título do Vídeo / Módulo *</Label>
              <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Uso de EPIs na Obra" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Breve descrição do conteúdo do vídeo..." rows={2} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>URL do Vídeo</Label>
                <Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
              </div>
              <div>
                <Label>Tipo</Label>
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
            </div>

            {videoUrl && videoTipo === "youtube" && ytPreviewUrl && (
              <div className="rounded-lg overflow-hidden border bg-black aspect-video">
                <img src={`https://img.youtube.com/vi/${ytPreviewUrl}/mqdefault.jpg`} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Duração (min)</Label>
                <Input type="number" value={duracaoMinutos} onChange={e => setDuracaoMinutos(e.target.value)} placeholder="10" min={1} />
              </div>
              <div>
                <Label>Ordem</Label>
                <Input type="number" value={ordem} onChange={e => setOrdem(e.target.value)} placeholder="1" min={1} />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={obrigatorio} onChange={e => setObrigatorio(e.target.checked)} className="accent-emerald-600 w-4 h-4" />
                  <span className="text-sm">Obrigatório</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            <Button
              disabled={!titulo.trim() || !configId || criarModulo.isPending || atualizarModulo.isPending}
              onClick={handleSave}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {(criarModulo.isPending || atualizarModulo.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              {editingId ? "Salvar Alterações" : "Cadastrar Vídeo"}
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
  const [showNew, setShowNew] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [notaMinima, setNotaMinima] = useState(70);
  const [validadeMeses, setValidadeMeses] = useState(12);
  const [expandedConfig, setExpandedConfig] = useState<number | null>(null);

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
                  <div className="flex gap-2">
                    <Badge variant={cfg.ativo ? "default" : "secondary"}>{cfg.ativo ? "Ativa" : "Inativa"}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => excluirConfig.mutate({ id: cfg.id, companyId })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
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
    </div>
  );
}

function ModulosEditor({ configId, companyId }: { configId: number; companyId: number }) {
  const modulos = trpc.integracaoSST.listarModulos.useQuery({ configId, companyId });
  const criarModulo = trpc.integracaoSST.criarModulo.useMutation({ onSuccess: () => { modulos.refetch(); setShowNew(false); toast.success("Módulo criado"); } });
  const excluirModulo = trpc.integracaoSST.excluirModulo.useMutation({ onSuccess: () => { modulos.refetch(); toast.success("Módulo excluído"); } });
  const salvarPerguntas = trpc.integracaoSST.salvarPerguntas.useMutation({ onSuccess: () => { modulos.refetch(); toast.success("Perguntas salvas"); } });

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
                    <Button size="sm" variant="ghost" onClick={() => startEditPerguntas(mod)}><ClipboardList className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => excluirModulo.mutate({ id: mod.id, companyId })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
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
    </div>
  );
}

function PendentesTab({ companyId }: { companyId: number }) {
  const registros = trpc.integracaoSST.listarRegistros.useQuery({ companyId, status: "pendente" }, { enabled: companyId > 0 });
  const emAndamento = trpc.integracaoSST.listarRegistros.useQuery({ companyId, status: "em_andamento" }, { enabled: companyId > 0 });
  const empList = trpc.employees.list.useQuery({ companyId, status: "Ativo" }, { enabled: companyId > 0 });
  const obras = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const configs = trpc.integracaoSST.listarConfigs.useQuery({ companyId }, { enabled: companyId > 0 });
  const criarRegistro = trpc.integracaoSST.criarRegistro.useMutation({
    onSuccess: (data) => {
      registros.refetch();
      emAndamento.refetch();
      const link = `${window.location.origin}/integracao/${data.token}`;
      setCreatedLink(link);
      setCreatedEmployee(data.employeeNome || "");
      toast.success("Integração criada com sucesso!");
    }
  });
  const criarLote = trpc.integracaoSST.criarRegistrosEmLote.useMutation({
    onSuccess: (data) => {
      registros.refetch();
      emAndamento.refetch();
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

  if (!companyId) return <p className="text-muted-foreground p-4">Selecione uma empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Integrações Pendentes</h3>
          <p className="text-xs text-muted-foreground">{allPending.length} colaborador(es) aguardando integração</p>
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

      {registros.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Nenhuma integração pendente</p>
            <p className="text-xs text-muted-foreground mt-1">Clique em "Iniciar Integração" para criar uma nova</p>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-emerald-600" />
              Iniciar Integração de Segurança
            </DialogTitle>
          </DialogHeader>

          {createdLink ? (
            <div className="space-y-4">
              <div className="text-center p-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 mx-auto mb-3 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-lg">Integração Criada!</h3>
                <p className="text-sm text-muted-foreground mt-1">Envie o link abaixo para <strong>{createdEmployee}</strong> realizar a integração</p>
              </div>

              <div className="bg-muted rounded-lg p-3">
                <Label className="text-xs text-muted-foreground mb-1 block">Link da Integração</Label>
                <div className="flex gap-2">
                  <Input value={createdLink} readOnly className="text-xs bg-white" />
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(createdLink); toast.success("Link copiado!"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" onClick={() => {
                  const msg = encodeURIComponent(`Olá ${createdEmployee}! Segue o link para realizar sua Integração de Segurança:\n\n${createdLink}\n\nAcesse o link e siga as instruções.`);
                  window.open(`https://wa.me/?text=${msg}`, "_blank");
                }}>
                  <MessageSquare className="h-4 w-4 mr-2" />Enviar WhatsApp
                </Button>
                <Button variant="outline" onClick={() => { resetForm(); }}>
                  <Plus className="h-4 w-4 mr-2" />Nova Integração
                </Button>
              </div>

              <DialogFooter>
                <Button onClick={() => { setShowNew(false); resetForm(); }}>Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Buscar Colaborador *</Label>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    value={empSearchTerm}
                    onChange={e => setEmpSearchTerm(e.target.value)}
                    placeholder="Digite o nome ou CPF do colaborador..."
                    className="pl-8"
                  />
                </div>
                {filteredEmps.length > 0 && (
                  <div className="border rounded-md mt-1 max-h-40 overflow-y-auto bg-white shadow-lg">
                    {filteredEmps.map((emp: any) => (
                      <div key={emp.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-0" onClick={() => addEmployee(emp)}>
                        <div>
                          <p className="text-sm font-medium">{emp.nomeCompleto || emp.nome}</p>
                          <p className="text-xs text-muted-foreground">{emp.funcao || "-"} · CPF: {emp.cpf || "-"}</p>
                        </div>
                        <Plus className="h-4 w-4 text-emerald-600" />
                      </div>
                    ))}
                  </div>
                )}
                {empSearchTerm.length >= 2 && filteredEmps.length === 0 && !empList.isLoading && (
                  <p className="text-xs text-muted-foreground mt-1">Nenhum colaborador encontrado</p>
                )}
              </div>

              {selectedEmps.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">{selectedEmps.length} colaborador(es) selecionado(s)</Label>
                  <div className="space-y-1 mt-1 max-h-32 overflow-y-auto">
                    {selectedEmps.map(emp => (
                      <div key={emp.id} className="flex items-center justify-between bg-emerald-50 rounded px-3 py-1.5 border border-emerald-200">
                        <div>
                          <span className="text-sm font-medium">{emp.nome}</span>
                          <span className="text-xs text-muted-foreground ml-2">{emp.funcao}</span>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removeEmployee(emp.id)}>
                          <X className="h-3 w-3 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Obra (opcional)</Label>
                  <Select value={selectedObraId} onValueChange={setSelectedObraId}>
                    <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem obra específica</SelectItem>
                      {(obras.data as any[])?.map((o: any) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Configuração</Label>
                  <Select value={selectedConfigId} onValueChange={setSelectedConfigId}>
                    <SelectTrigger><SelectValue placeholder="Automática" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Automática (padrão)</SelectItem>
                      {configs.data?.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.titulo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowNew(false); resetForm(); }}>Cancelar</Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={selectedEmps.length === 0 || criarRegistro.isPending || criarLote.isPending}
                  onClick={handleCriar}
                >
                  {(criarRegistro.isPending || criarLote.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
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

function HistoricoTab({ companyId }: { companyId: number }) {
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const registros = trpc.integracaoSST.listarRegistros.useQuery(
    { companyId, status: statusFiltro as any },
    { enabled: companyId > 0 }
  );
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = searchTerm
    ? (registros.data || []).filter(r => r.employeeNome?.toLowerCase().includes(searchTerm.toLowerCase()) || r.employeeCpf?.includes(searchTerm))
    : (registros.data || []);

  if (!companyId) return <p className="text-muted-foreground p-4">Selecione uma empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="font-semibold">Histórico de Integrações</h3>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar..." className="pl-8 w-48" />
          </div>
          <Select value={statusFiltro} onValueChange={setStatusFiltro}>
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
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
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
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={10} className="p-4 text-center text-muted-foreground">Nenhum registro encontrado</td></tr>}
              {filtered.map(r => (
                <tr key={r.id} className="border-b hover:bg-muted/20">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
