import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Plus, Sparkles, Loader2, X, Check, Search, ClipboardList, Users, BarChart3, Heart,
  ToggleLeft, ToggleRight, Trash2, Eye, Link2, Copy, ChevronDown, Star, UserPlus,
  FileText, Building, ThumbsUp, ThumbsDown, HelpCircle, Shield, TrendingUp,
  Briefcase, Award, AlertTriangle, ArrowRight, Play, Settings, ChevronRight,
} from "lucide-react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement, Title as ChartTitle, Tooltip as ChartTooltip, Legend, Filler,
} from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, ChartTitle, ChartTooltip, Legend, Filler);

// Categorias de clima organizacional
const CLIMA_CATEGORIAS: Record<string, { label: string; icon: any; cor: string }> = {
  empresa: { label: "Empresa", icon: Building, cor: "text-blue-600" },
  gestao: { label: "Gestão", icon: Users, cor: "text-purple-600" },
  ambiente: { label: "Ambiente", icon: Shield, cor: "text-green-600" },
  seguranca: { label: "Segurança", icon: Shield, cor: "text-orange-600" },
  crescimento: { label: "Crescimento", icon: TrendingUp, cor: "text-emerald-600" },
};

export default function AvaliacaoDesempenho() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const canView = user?.role === "admin" || user?.role === "admin_master";

  // ============================================================
  // STATES
  // ============================================================
  const [activeTab, setActiveTab] = useState("avaliacoes");
  const [searchTerm, setSearchTerm] = useState("");

  // Avaliações (templates)
  const [showCriarAvaliacao, setShowCriarAvaliacao] = useState(false);
  const [avalTitulo, setAvalTitulo] = useState("");
  const [avalDescricao, setAvalDescricao] = useState("");
  const [avalPerguntas, setAvalPerguntas] = useState<{ texto: string; tipo: string; obrigatoria: boolean }[]>([]);
  const [avalStep, setAvalStep] = useState<"info" | "perguntas" | "avaliadores" | "confirmar">("info");
  const [avalSelectedEvaluators, setAvalSelectedEvaluators] = useState<number[]>([]);
  const [iaSugerindo, setIaSugerindo] = useState(false);

  // Aplicar avaliação
  const [showAplicar, setShowAplicar] = useState<any>(null);
  const [aplicarEmployeeId, setAplicarEmployeeId] = useState<number | null>(null);
  const [aplicarEmployeeSearch, setAplicarEmployeeSearch] = useState("");
  const [aplicarEmployeeOpen, setAplicarEmployeeOpen] = useState(false);
  const [aplicarRespostas, setAplicarRespostas] = useState<Record<number, string>>({});
  const [showConfirmAplicar, setShowConfirmAplicar] = useState(false);

  // Gerenciar avaliadores de uma avaliação
  const [showGerenciarAvaliadores, setShowGerenciarAvaliadores] = useState<any>(null);
  const [addEvalSearch, setAddEvalSearch] = useState("");

  // Ver resultados
  const [showResultados, setShowResultados] = useState<any>(null);

  // Pesquisas customizadas
  const [showNovaPesquisa, setShowNovaPesquisa] = useState(false);
  const [pesquisaTitulo, setPesquisaTitulo] = useState("");
  const [pesquisaDescricao, setPesquisaDescricao] = useState("");
  const [pesquisaTipo, setPesquisaTipo] = useState<"setor" | "cliente" | "outro">("outro");
  const [pesquisaAnonima, setPesquisaAnonima] = useState(false);
  const [pesquisaPerguntas, setPesquisaPerguntas] = useState<{ texto: string; tipo: string; obrigatoria: boolean }[]>([]);
  const [showPesquisaLink, setShowPesquisaLink] = useState<any>(null);
  const [showPesquisaResultados, setShowPesquisaResultados] = useState<any>(null);

  // Clima organizacional
  const [showNovoClima, setShowNovoClima] = useState(false);
  const [climaTitulo, setClimaTitulo] = useState("");
  const [climaDescricao, setClimaDescricao] = useState("");
  const [climaPerguntas, setClimaPerguntas] = useState<{ texto: string; categoria: string; tipo: string }[]>([]);
  const [showClimaLink, setShowClimaLink] = useState<any>(null);
  const [showClimaResultados, setShowClimaResultados] = useState<any>(null);

  // ============================================================
  // QUERIES
  // ============================================================
  const avaliacoesList = trpc.avaliacao.pesquisas.list.useQuery(
    { companyId: companyId!, isEvaluation: true },
    { enabled: !!companyId }
  );
  const pesquisasList = trpc.avaliacao.pesquisas.list.useQuery(
    { companyId: companyId!, isEvaluation: false },
    { enabled: !!companyId }
  );
  const climaList = trpc.avaliacao.clima.listSurveys.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );
  const employeesList = trpc.employees.list.useQuery(
    { companyId: companyId!, status: "Ativo" },
    { enabled: !!companyId }
  );
  const usersList = trpc.userManagement.listUsers.useQuery(undefined, { enabled: !!companyId });

  // Dashboard queries
  const dashStats = trpc.avaliacao.dashboard.globalStats.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId && canView && activeTab === "dashboard" }
  );
  const pillarComparison = trpc.avaliacao.dashboard.pillarComparison.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId && canView && activeTab === "dashboard" }
  );
  const monthlyEvolution = trpc.avaliacao.dashboard.monthlyEvolution.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId && canView && activeTab === "dashboard" }
  );
  const topBottom = trpc.avaliacao.dashboard.topBottomEmployees.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId && canView && activeTab === "dashboard" }
  );
  const climaConsolidated = trpc.avaliacao.dashboard.climaConsolidated.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId && canView && activeTab === "dashboard" }
  );

  // Resultados
  const pesquisaResultados = trpc.avaliacao.pesquisas.getResults.useQuery(
    { surveyId: showPesquisaResultados?.id || showResultados?.id || 0 },
    { enabled: !!(showPesquisaResultados?.id || showResultados?.id) }
  );
  const climaResultados = trpc.avaliacao.clima.getResults.useQuery(
    { surveyId: showClimaResultados?.id || 0 },
    { enabled: !!showClimaResultados?.id }
  );

  // Avaliadores de uma avaliação
  const avaliadoresQuery = trpc.avaliacao.pesquisas.getEvaluators.useQuery(
    { surveyId: showGerenciarAvaliadores?.id || 0 },
    { enabled: !!showGerenciarAvaliadores?.id }
  );

  // Avaliação para aplicar - perguntas
  const avaliacaoDetalhe = trpc.avaliacao.pesquisas.getById.useQuery(
    { id: showAplicar?.id || 0 },
    { enabled: !!showAplicar?.id }
  );

  // ============================================================
  // MUTATIONS
  // ============================================================
  const criarAvaliacao = trpc.avaliacao.pesquisas.create.useMutation({
    onSuccess: (data) => {
      toast.success("Avaliação criada com sucesso!");
      // Adicionar avaliadores selecionados
      if (avalSelectedEvaluators.length > 0) {
        addEvaluators.mutate({ surveyId: data.id, userIds: avalSelectedEvaluators });
      }
      utils.avaliacao.pesquisas.list.invalidate();
      setShowCriarAvaliacao(false);
      resetFormAvaliacao();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleStatus = trpc.avaliacao.pesquisas.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado!");
      utils.avaliacao.pesquisas.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteSurvey = trpc.avaliacao.pesquisas.delete.useMutation({
    onSuccess: () => {
      toast.success("Excluído com sucesso!");
      utils.avaliacao.pesquisas.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const submitResponse = trpc.avaliacao.pesquisas.submitResponse.useMutation({
    onSuccess: () => {
      toast.success("Avaliação aplicada com sucesso!");
      setShowAplicar(null);
      setShowConfirmAplicar(false);
      resetFormAplicar();
      utils.avaliacao.pesquisas.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const addEvaluators = trpc.avaliacao.pesquisas.addEvaluators.useMutation({
    onSuccess: () => {
      toast.success("Avaliadores adicionados!");
      avaliadoresQuery.refetch();
      utils.avaliacao.pesquisas.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeEvaluator = trpc.avaliacao.pesquisas.removeEvaluator.useMutation({
    onSuccess: () => {
      toast.success("Avaliador removido!");
      avaliadoresQuery.refetch();
      utils.avaliacao.pesquisas.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const suggestQuestions = trpc.avaliacao.pesquisas.suggestQuestions.useMutation({
    onSuccess: (data) => {
      if (data.questions) {
        setPesquisaPerguntas(data.questions.map((q: any) => ({ texto: q.texto, tipo: q.tipo || "nota", obrigatoria: true })));
        toast.success(`${data.questions.length} perguntas sugeridas pela IA!`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  // Pesquisas customizadas
  const criarPesquisa = trpc.avaliacao.pesquisas.create.useMutation({
    onSuccess: () => {
      toast.success("Pesquisa criada com sucesso!");
      utils.avaliacao.pesquisas.list.invalidate();
      setShowNovaPesquisa(false);
      resetFormPesquisa();
    },
    onError: (e) => toast.error(e.message),
  });

  // Clima
  const criarClima = trpc.avaliacao.clima.createSurvey.useMutation({
    onSuccess: () => {
      toast.success("Pesquisa de clima criada!");
      utils.avaliacao.clima.listSurveys.invalidate();
      setShowNovoClima(false);
      resetFormClima();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleClimaStatus = trpc.avaliacao.clima.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado!");
      utils.avaliacao.clima.listSurveys.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteClima = trpc.avaliacao.clima.deleteSurvey.useMutation({
    onSuccess: () => {
      toast.success("Excluído!");
      utils.avaliacao.clima.listSurveys.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const suggestClimaQuestions = trpc.avaliacao.clima.suggestClimateQuestions.useMutation({
    onSuccess: (data) => {
      if (data.questions) {
        setClimaPerguntas(data.questions.map((q: any) => ({ texto: q.texto, categoria: q.categoria || "empresa", tipo: q.tipo || "nota" })));
        toast.success(`${data.questions.length} perguntas sugeridas!`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  // ============================================================
  // HELPERS
  // ============================================================
  function resetFormAvaliacao() {
    setAvalTitulo("");
    setAvalDescricao("");
    setAvalPerguntas([]);
    setAvalStep("info");
    setAvalSelectedEvaluators([]);
    setIaSugerindo(false);
  }

  function resetFormAplicar() {
    setAplicarEmployeeId(null);
    setAplicarEmployeeSearch("");
    setAplicarRespostas({});
  }

  function resetFormPesquisa() {
    setPesquisaTitulo("");
    setPesquisaDescricao("");
    setPesquisaTipo("outro");
    setPesquisaAnonima(false);
    setPesquisaPerguntas([]);
  }

  function resetFormClima() {
    setClimaTitulo("");
    setClimaDescricao("");
    setClimaPerguntas([]);
  }

  function getPublicLink(token: string, tipo: "pesquisa" | "clima") {
    return `${window.location.origin}/pesquisa-publica/${tipo}/${token}`;
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Link copiado!");
  }

  // Sugerir perguntas para avaliação via IA
  async function sugerirPerguntasAvaliacao() {
    setIaSugerindo(true);
    try {
      const result = await suggestQuestions.mutateAsync({
        tema: avalTitulo,
        tipo: "outro",
      });
      if (result.questions) {
        setAvalPerguntas(result.questions.map((q: any) => ({ texto: q.texto, tipo: q.tipo || "nota", obrigatoria: true })));
      }
    } catch (e) {
      // error handled by mutation
    }
    setIaSugerindo(false);
  }

  // Filtrar funcionários para autocomplete
  const filteredEmployees = useMemo(() => {
    if (!employeesList.data) return [];
    if (!aplicarEmployeeSearch) return employeesList.data.slice(0, 20);
    const s = aplicarEmployeeSearch.toLowerCase();
    return employeesList.data.filter((e: any) =>
      e.nomeCompleto?.toLowerCase().includes(s) || e.cpf?.includes(s) || e.funcao?.toLowerCase().includes(s)
    ).slice(0, 20);
  }, [employeesList.data, aplicarEmployeeSearch]);

  // Filtrar usuários para adicionar como avaliadores
  const filteredUsers = useMemo(() => {
    if (!usersList.data) return [];
    if (!addEvalSearch) return usersList.data;
    const s = addEvalSearch.toLowerCase();
    return usersList.data.filter((u: any) => u.name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s));
  }, [usersList.data, addEvalSearch]);

  // Funcionário selecionado
  const selectedEmployee = useMemo(() => {
    if (!aplicarEmployeeId || !employeesList.data) return null;
    return employeesList.data.find((e: any) => e.id === aplicarEmployeeId);
  }, [aplicarEmployeeId, employeesList.data]);

  // ============================================================
  // RENDER
  // ============================================================
  if (!companyId) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Selecione uma empresa para acessar o módulo de Avaliação.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Star className="w-6 h-6 text-amber-500" /> Avaliação de Desempenho
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Crie avaliações personalizadas, atribua avaliadores e acompanhe resultados
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="avaliacoes" className="gap-2"><ClipboardList className="w-4 h-4" /> Avaliações</TabsTrigger>
            <TabsTrigger value="pesquisas" className="gap-2"><FileText className="w-4 h-4" /> Pesquisas</TabsTrigger>
            <TabsTrigger value="clima" className="gap-2"><Heart className="w-4 h-4" /> Clima</TabsTrigger>
            {canView && <TabsTrigger value="dashboard" className="gap-2"><BarChart3 className="w-4 h-4" /> Dashboard</TabsTrigger>}
          </TabsList>

          {/* ============================================================ */}
          {/* TAB: AVALIAÇÕES */}
          {/* ============================================================ */}
          <TabsContent value="avaliacoes" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar avaliação..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
              <Button onClick={() => setShowCriarAvaliacao(true)}>
                <Plus className="w-4 h-4 mr-2" /> Nova Avaliação
              </Button>
            </div>

            {avaliacoesList.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !avaliacoesList.data?.length ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <ClipboardList className="w-12 h-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhuma avaliação criada</h3>
                  <p className="text-muted-foreground text-sm mb-4 max-w-md">
                    Crie sua primeira avaliação de desempenho. Defina as perguntas, atribua avaliadores e acompanhe os resultados.
                  </p>
                  <Button onClick={() => setShowCriarAvaliacao(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Criar Primeira Avaliação
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {avaliacoesList.data
                  .filter((a: any) => !searchTerm || a.titulo.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((avaliacao: any) => (
                    <Card key={avaliacao.id} className={`transition-all ${avaliacao.status === "ativa" ? "border-green-500/30" : avaliacao.status === "encerrada" ? "border-red-500/30 opacity-70" : "border-amber-500/30"}`}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-semibold text-lg">{avaliacao.titulo}</h3>
                              <Badge variant={avaliacao.status === "ativa" ? "default" : avaliacao.status === "encerrada" ? "destructive" : "secondary"}>
                                {avaliacao.status === "ativa" ? "Ativa" : avaliacao.status === "encerrada" ? "Encerrada" : "Rascunho"}
                              </Badge>
                            </div>
                            {avaliacao.descricao && (
                              <p className="text-sm text-muted-foreground mb-3">{avaliacao.descricao}</p>
                            )}
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <FileText className="w-3.5 h-3.5" /> {avaliacao.totalPerguntas} perguntas
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-3.5 h-3.5" /> {avaliacao.evaluatorNames?.length || 0} avaliadores
                              </span>
                              <span className="flex items-center gap-1">
                                <ClipboardList className="w-3.5 h-3.5" /> {avaliacao.totalRespostas} respostas
                              </span>
                              {avaliacao.evaluatorNames?.length > 0 && (
                                <span className="text-xs">
                                  ({avaliacao.evaluatorNames.slice(0, 3).join(", ")}{avaliacao.evaluatorNames.length > 3 ? ` +${avaliacao.evaluatorNames.length - 3}` : ""})
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {avaliacao.status === "ativa" && (
                              <Button size="sm" onClick={() => { setShowAplicar(avaliacao); resetFormAplicar(); }}>
                                <Play className="w-4 h-4 mr-1" /> Aplicar
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => setShowGerenciarAvaliadores(avaliacao)}>
                              <UserPlus className="w-4 h-4 mr-1" /> Avaliadores
                            </Button>
                            {canView && (
                              <Button variant="outline" size="sm" onClick={() => setShowResultados(avaliacao)}>
                                <Eye className="w-4 h-4 mr-1" /> Resultados
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleStatus.mutate({
                                id: avaliacao.id,
                                status: avaliacao.status === "ativa" ? "encerrada" : "ativa",
                              })}
                            >
                              {avaliacao.status === "ativa" ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => {
                              if (confirm("Excluir esta avaliação?")) deleteSurvey.mutate({ id: avaliacao.id });
                            }}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* TAB: PESQUISAS CUSTOMIZADAS */}
          {/* ============================================================ */}
          <TabsContent value="pesquisas" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pesquisas Customizadas</h2>
              <Button onClick={() => setShowNovaPesquisa(true)}>
                <Plus className="w-4 h-4 mr-2" /> Nova Pesquisa
              </Button>
            </div>

            {pesquisasList.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : !pesquisasList.data?.length ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="w-10 h-10 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">Nenhuma pesquisa customizada criada</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {pesquisasList.data.map((p: any) => (
                  <Card key={p.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium">{p.titulo}</h3>
                            <Badge variant={p.status === "ativa" ? "default" : "secondary"}>{p.status}</Badge>
                            {p.anonimo === 1 && <Badge variant="outline">Anônima</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{p.totalPerguntas} perguntas · {p.totalRespostas} respostas</p>
                        </div>
                        <div className="flex gap-1">
                          {p.publicToken && (
                            <Button variant="ghost" size="sm" onClick={() => setShowPesquisaLink(p)}>
                              <Link2 className="w-4 h-4" />
                            </Button>
                          )}
                          {canView && (
                            <Button variant="ghost" size="sm" onClick={() => setShowPesquisaResultados(p)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => toggleStatus.mutate({ id: p.id, status: p.status === "ativa" ? "encerrada" : "ativa" })}>
                            {p.status === "ativa" ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm("Excluir?")) deleteSurvey.mutate({ id: p.id }); }}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* TAB: CLIMA ORGANIZACIONAL */}
          {/* ============================================================ */}
          <TabsContent value="clima" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pesquisas de Clima Organizacional</h2>
              <Button onClick={() => setShowNovoClima(true)}>
                <Plus className="w-4 h-4 mr-2" /> Nova Pesquisa de Clima
              </Button>
            </div>

            {climaList.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : !climaList.data?.length ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Heart className="w-10 h-10 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">Nenhuma pesquisa de clima criada</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {climaList.data.map((c: any) => (
                  <Card key={c.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium">{c.titulo}</h3>
                            <Badge variant={c.status === "ativa" ? "default" : "secondary"}>{c.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{c.totalPerguntas} perguntas · {c.totalRespostas} respostas</p>
                        </div>
                        <div className="flex gap-1">
                          {c.publicToken && (
                            <Button variant="ghost" size="sm" onClick={() => setShowClimaLink(c)}>
                              <Link2 className="w-4 h-4" />
                            </Button>
                          )}
                          {canView && (
                            <Button variant="ghost" size="sm" onClick={() => setShowClimaResultados(c)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => toggleClimaStatus.mutate({ id: c.id, status: c.status === "ativa" ? "encerrada" : "ativa" })}>
                            {c.status === "ativa" ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm("Excluir?")) deleteClima.mutate({ id: c.id }); }}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* TAB: DASHBOARD */}
          {/* ============================================================ */}
          <TabsContent value="dashboard" className="space-y-6">
            {!canView ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Shield className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">Acesso restrito a ADM / ADM Master</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* KPIs */}
                {dashStats.data && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-4 text-center">
                        <p className="text-3xl font-bold text-primary">{dashStats.data.totalAvaliacoes}</p>
                        <p className="text-xs text-muted-foreground">Avaliações (12 critérios)</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 text-center">
                        <p className="text-3xl font-bold text-amber-600">{dashStats.data.mediaGeral?.toFixed(1) || "—"}</p>
                        <p className="text-xs text-muted-foreground">Média Geral</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 text-center">
                        <p className="text-3xl font-bold text-blue-600">{dashStats.data.totalPesquisas}</p>
                        <p className="text-xs text-muted-foreground">Pesquisas Ativas</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 text-center">
                        <p className="text-3xl font-bold text-green-600">{dashStats.data.totalAvaliadores}</p>
                        <p className="text-xs text-muted-foreground">Avaliadores</p>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Gráficos */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Evolução Mensal */}
                  {monthlyEvolution.data && monthlyEvolution.data.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Evolução Mensal das Avaliações</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div style={{ height: "280px" }}>
                          <Line
                            data={{
                              labels: monthlyEvolution.data.map((m: any) => m.mes),
                              datasets: [
                                {
                                  label: "Média Geral",
                                  data: monthlyEvolution.data.map((m: any) => m.mediaGeral),
                                  borderColor: "#3B82F6",
                                  backgroundColor: "rgba(59,130,246,0.1)",
                                  fill: true,
                                  tension: 0.4,
                                },
                              ],
                            }}
                            options={{ responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 5 } } }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Comparativo por Pilar */}
                  {pillarComparison.data && pillarComparison.data.labels?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Média por Critério de Avaliação</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div style={{ height: "280px" }}>
                          <Bar
                            data={{
                              labels: pillarComparison.data.labels,
                              datasets: [{
                                label: "Média",
                                data: pillarComparison.data.values,
                                backgroundColor: pillarComparison.data.values.map((_: any, i: number) => {
                                  if (i < 4) return "rgba(59,130,246,0.7)";
                                  if (i < 8) return "rgba(16,185,129,0.7)";
                                  return "rgba(168,85,247,0.7)";
                                }),
                              }],
                            }}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              indexAxis: "y" as const,
                              scales: { x: { min: 0, max: 5 } },
                              plugins: { legend: { display: false } },
                            }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Top 5 Melhores */}
                  {topBottom.data && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Award className="w-4 h-4 text-amber-500" /> Top 5 Melhores Avaliados
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {topBottom.data.top?.slice(0, 5).map((emp: any, i: number) => (
                            <div key={i} className="flex items-center gap-3">
                              <span className="text-lg font-bold text-amber-500 w-6">{i + 1}º</span>
                              <div className="flex-1">
                                <p className="font-medium text-sm">{emp.nome}</p>
                                <p className="text-xs text-muted-foreground">{emp.totalAvaliacoes} avaliações</p>
                              </div>
                              <Badge variant="outline" className="text-green-600">{emp.mediaGeral?.toFixed(1)}</Badge>
                            </div>
                          ))}
                          {(!topBottom.data.top || topBottom.data.top.length === 0) && (
                            <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Top 5 Atenção */}
                  {topBottom.data && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500" /> Necessitam Atenção
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {topBottom.data.bottom?.slice(0, 5).map((emp: any, i: number) => (
                            <div key={i} className="flex items-center gap-3">
                              <span className="text-lg font-bold text-red-500 w-6">{i + 1}º</span>
                              <div className="flex-1">
                                <p className="font-medium text-sm">{emp.nome}</p>
                                <p className="text-xs text-muted-foreground">{emp.totalAvaliacoes} avaliações</p>
                              </div>
                              <Badge variant="outline" className="text-red-600">{emp.mediaGeral?.toFixed(1)}</Badge>
                            </div>
                          ))}
                          {(!topBottom.data.bottom || topBottom.data.bottom.length === 0) && (
                            <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Clima Consolidado */}
                  {climaConsolidated.data && climaConsolidated.data.byCategory?.length > 0 && (
                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Heart className="w-4 h-4 text-red-500" /> Clima Organizacional Consolidado (Geral: {climaConsolidated.data.indiceGeral?.toFixed(1)}/5)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div style={{ height: "250px" }}>
                          <Bar
                            data={{
                              labels: climaConsolidated.data.byCategory.map((c: any) => c.label),
                              datasets: [{
                                label: "Média",
                                data: climaConsolidated.data.byCategory.map((c: any) => c.media),
                                backgroundColor: ["rgba(59,130,246,0.7)", "rgba(168,85,247,0.7)", "rgba(16,185,129,0.7)", "rgba(249,115,22,0.7)", "rgba(34,197,94,0.7)", "rgba(236,72,153,0.7)"],
                              }],
                            }}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              scales: { y: { min: 0, max: 5 } },
                              plugins: { legend: { display: false } },
                            }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ============================================================ */}
      {/* DIALOG: CRIAR NOVA AVALIAÇÃO (WIZARD) */}
      {/* ============================================================ */}
      <Dialog open={showCriarAvaliacao} onOpenChange={(open) => { if (!open) { setShowCriarAvaliacao(false); resetFormAvaliacao(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" /> Nova Avaliação de Desempenho
            </DialogTitle>
            <DialogDescription>
              {avalStep === "info" && "Defina o título e descrição da avaliação"}
              {avalStep === "perguntas" && "Adicione perguntas manualmente ou peça sugestões à IA"}
              {avalStep === "avaliadores" && "Selecione quem poderá aplicar esta avaliação"}
              {avalStep === "confirmar" && "Revise e confirme a criação da avaliação"}
            </DialogDescription>
          </DialogHeader>

          {/* Progress Steps */}
          <div className="flex items-center gap-2 mb-4">
            {["info", "perguntas", "avaliadores", "confirmar"].map((step, i) => (
              <div key={step} className="flex items-center gap-2 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  avalStep === step ? "bg-primary text-primary-foreground" :
                  ["info", "perguntas", "avaliadores", "confirmar"].indexOf(avalStep) > i ? "bg-green-600 text-white" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {["info", "perguntas", "avaliadores", "confirmar"].indexOf(avalStep) > i ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                {i < 3 && <div className="flex-1 h-0.5 bg-muted" />}
              </div>
            ))}
          </div>

          {/* Step 1: Info */}
          {avalStep === "info" && (
            <div className="space-y-4">
              <div>
                <Label>Título da Avaliação *</Label>
                <Input value={avalTitulo} onChange={(e) => setAvalTitulo(e.target.value)} placeholder="Ex: Avaliação Mensal - Obra Centro, Avaliação Trimestral de Desempenho..." />
              </div>
              <div>
                <Label>Descrição (opcional)</Label>
                <Textarea value={avalDescricao} onChange={(e) => setAvalDescricao(e.target.value)} placeholder="Descreva o objetivo desta avaliação..." rows={3} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowCriarAvaliacao(false); resetFormAvaliacao(); }}>Cancelar</Button>
                <Button onClick={() => setAvalStep("perguntas")} disabled={!avalTitulo.trim()}>
                  Próximo <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 2: Perguntas */}
          {avalStep === "perguntas" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Perguntas da Avaliação</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={sugerirPerguntasAvaliacao}
                  disabled={iaSugerindo || !avalTitulo}
                >
                  {iaSugerindo ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</> : <><Sparkles className="w-4 h-4 mr-2" /> IA Sugerir Perguntas</>}
                </Button>
              </div>

              {avalPerguntas.length > 0 ? (
                <ScrollArea className="max-h-[350px]">
                  <div className="space-y-2 pr-4">
                    {avalPerguntas.map((p, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
                        <span className="text-xs font-bold text-muted-foreground mt-2">{i + 1}.</span>
                        <div className="flex-1 space-y-2">
                          <Input
                            value={p.texto}
                            onChange={(e) => {
                              const updated = [...avalPerguntas];
                              updated[i].texto = e.target.value;
                              setAvalPerguntas(updated);
                            }}
                            placeholder="Texto da pergunta..."
                          />
                          <div className="flex items-center gap-3">
                            <Select value={p.tipo} onValueChange={(v) => {
                              const updated = [...avalPerguntas];
                              updated[i].tipo = v;
                              setAvalPerguntas(updated);
                            }}>
                              <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="nota">Nota (1-5)</SelectItem>
                                <SelectItem value="texto">Texto livre</SelectItem>
                                <SelectItem value="sim_nao">Sim/Não</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="flex items-center gap-1">
                              <Switch
                                checked={p.obrigatoria}
                                onCheckedChange={(v) => {
                                  const updated = [...avalPerguntas];
                                  updated[i].obrigatoria = v;
                                  setAvalPerguntas(updated);
                                }}
                              />
                              <span className="text-xs text-muted-foreground">Obrigatória</span>
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setAvalPerguntas(avalPerguntas.filter((_, j) => j !== i))}>
                          <X className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg border-dashed">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Clique em "IA Sugerir Perguntas" para gerar automaticamente</p>
                  <p className="text-xs mt-1">ou adicione manualmente abaixo</p>
                </div>
              )}

              <Button variant="outline" size="sm" onClick={() => setAvalPerguntas([...avalPerguntas, { texto: "", tipo: "nota", obrigatoria: true }])}>
                <Plus className="w-4 h-4 mr-2" /> Adicionar Pergunta
              </Button>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAvalStep("info")}>Voltar</Button>
                <Button onClick={() => setAvalStep("avaliadores")} disabled={avalPerguntas.length === 0 || avalPerguntas.some(p => !p.texto.trim())}>
                  Próximo <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 3: Avaliadores */}
          {avalStep === "avaliadores" && (
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold">Selecionar Avaliadores</Label>
                <p className="text-sm text-muted-foreground">Escolha os usuários que poderão aplicar esta avaliação aos funcionários</p>
              </div>

              <Input
                placeholder="Buscar usuário por nome ou email..."
                value={addEvalSearch}
                onChange={(e) => setAddEvalSearch(e.target.value)}
              />

              <ScrollArea className="max-h-[300px]">
                <div className="space-y-1 pr-4">
                  {filteredUsers.map((u: any) => {
                    const selected = avalSelectedEvaluators.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${selected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"}`}
                        onClick={() => {
                          if (selected) {
                            setAvalSelectedEvaluators(avalSelectedEvaluators.filter(id => id !== u.id));
                          } else {
                            setAvalSelectedEvaluators([...avalSelectedEvaluators, u.id]);
                          }
                        }}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${selected ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                          {selected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{u.name || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">{u.role}</Badge>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {avalSelectedEvaluators.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {avalSelectedEvaluators.length} avaliador(es) selecionado(s)
                </p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setAvalStep("perguntas")}>Voltar</Button>
                <Button onClick={() => setAvalStep("confirmar")}>
                  Próximo <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 4: Confirmar */}
          {avalStep === "confirmar" && (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Título</Label>
                    <p className="font-semibold">{avalTitulo}</p>
                  </div>
                  {avalDescricao && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Descrição</Label>
                      <p className="text-sm">{avalDescricao}</p>
                    </div>
                  )}
                  <Separator />
                  <div>
                    <Label className="text-xs text-muted-foreground">Perguntas ({avalPerguntas.length})</Label>
                    <div className="space-y-1 mt-1">
                      {avalPerguntas.map((p, i) => (
                        <p key={i} className="text-sm">{i + 1}. {p.texto} <Badge variant="outline" className="text-xs ml-1">{p.tipo}</Badge></p>
                      ))}
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <Label className="text-xs text-muted-foreground">Avaliadores ({avalSelectedEvaluators.length})</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {avalSelectedEvaluators.map(id => {
                        const u = usersList.data?.find((u: any) => u.id === id);
                        return u ? <Badge key={id} variant="secondary">{u.name}</Badge> : null;
                      })}
                      {avalSelectedEvaluators.length === 0 && <p className="text-sm text-muted-foreground">Nenhum (poderá adicionar depois)</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAvalStep("avaliadores")}>Voltar</Button>
                <Button
                  onClick={() => criarAvaliacao.mutate({
                    companyId: companyId!,
                    titulo: avalTitulo,
                    descricao: avalDescricao || undefined,
                    tipo: "outro",
                    anonimo: false,
                    isEvaluation: true,
                    allowEmployeeSelection: true,
                    questions: avalPerguntas.map((p, i) => ({ texto: p.texto, tipo: p.tipo as "nota" | "texto" | "sim_nao", ordem: i + 1, obrigatoria: p.obrigatoria })),
                  })}
                  disabled={criarAvaliacao.isPending}
                >
                  {criarAvaliacao.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando...</> : <><Check className="w-4 h-4 mr-2" /> Criar Avaliação</>}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: APLICAR AVALIAÇÃO */}
      {/* ============================================================ */}
      <Dialog open={!!showAplicar} onOpenChange={(open) => { if (!open) { setShowAplicar(null); resetFormAplicar(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="w-5 h-5 text-green-600" /> Aplicar Avaliação
            </DialogTitle>
            <DialogDescription>
              {showAplicar?.titulo} · Avaliador: <strong>{user?.name || "—"}</strong> (automático)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Selecionar Funcionário */}
            <div>
              <Label>Funcionário a ser avaliado *</Label>
              <Popover open={aplicarEmployeeOpen} onOpenChange={setAplicarEmployeeOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between mt-1">
                    {selectedEmployee ? (
                      <span>{selectedEmployee.nomeCompleto} — {selectedEmployee.funcao || "Sem função"}</span>
                    ) : (
                      <span className="text-muted-foreground">Buscar funcionário por nome, CPF ou função...</span>
                    )}
                    <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[500px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar funcionário..." value={aplicarEmployeeSearch} onValueChange={setAplicarEmployeeSearch} />
                    <CommandList>
                      <CommandEmpty>Nenhum funcionário encontrado</CommandEmpty>
                      <CommandGroup>
                        {filteredEmployees.map((emp: any) => (
                          <CommandItem
                            key={emp.id}
                            value={`${emp.nomeCompleto} ${emp.cpf} ${emp.funcao}`}
                            onSelect={() => {
                              setAplicarEmployeeId(emp.id);
                              setAplicarEmployeeOpen(false);
                            }}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <Check className={`w-4 h-4 ${aplicarEmployeeId === emp.id ? "opacity-100" : "opacity-0"}`} />
                              <div className="flex-1">
                                <p className="font-medium text-sm">{emp.nomeCompleto}</p>
                                <p className="text-xs text-muted-foreground">{emp.funcao || "—"} · CPF: {emp.cpf}</p>
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <Separator />

            {/* Perguntas */}
            {avaliacaoDetalhe.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : avaliacaoDetalhe.data?.questions ? (
              <div className="space-y-4">
                <Label className="text-base font-semibold">Perguntas</Label>
                {avaliacaoDetalhe.data.questions.map((q: any, i: number) => (
                  <div key={q.id} className="p-3 border rounded-lg space-y-2">
                    <p className="font-medium text-sm">{i + 1}. {q.texto} {q.obrigatoria === 1 && <span className="text-destructive">*</span>}</p>
                    {q.tipo === "nota" ? (
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(n => (
                          <Button
                            key={n}
                            variant={aplicarRespostas[q.id] === String(n) ? "default" : "outline"}
                            size="sm"
                            className="w-10 h-10"
                            onClick={() => setAplicarRespostas({ ...aplicarRespostas, [q.id]: String(n) })}
                          >
                            {n}
                          </Button>
                        ))}
                      </div>
                    ) : q.tipo === "sim_nao" ? (
                      <div className="flex gap-2">
                        <Button
                          variant={aplicarRespostas[q.id] === "Sim" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setAplicarRespostas({ ...aplicarRespostas, [q.id]: "Sim" })}
                        >
                          <ThumbsUp className="w-4 h-4 mr-1" /> Sim
                        </Button>
                        <Button
                          variant={aplicarRespostas[q.id] === "Não" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setAplicarRespostas({ ...aplicarRespostas, [q.id]: "Não" })}
                        >
                          <ThumbsDown className="w-4 h-4 mr-1" /> Não
                        </Button>
                      </div>
                    ) : (
                      <Textarea
                        value={aplicarRespostas[q.id] || ""}
                        onChange={(e) => setAplicarRespostas({ ...aplicarRespostas, [q.id]: e.target.value })}
                        placeholder="Sua resposta..."
                        rows={2}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAplicar(null); resetFormAplicar(); }}>Cancelar</Button>
            <Button
              onClick={() => setShowConfirmAplicar(true)}
              disabled={!aplicarEmployeeId || !avaliacaoDetalhe.data?.questions?.length}
            >
              Enviar Avaliação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de envio */}
      <AlertDialog open={showConfirmAplicar} onOpenChange={setShowConfirmAplicar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Envio da Avaliação</AlertDialogTitle>
            <AlertDialogDescription>
              Avaliação: <strong>{showAplicar?.titulo}</strong><br />
              Funcionário: <strong>{selectedEmployee?.nomeCompleto}</strong><br />
              Avaliador: <strong>{user?.name}</strong><br />
              Perguntas respondidas: <strong>{Object.keys(aplicarRespostas).length}</strong> de <strong>{avaliacaoDetalhe.data?.questions?.length || 0}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!showAplicar || !aplicarEmployeeId) return;
                const answers = Object.entries(aplicarRespostas).map(([qId, valor]) => ({
                  questionId: Number(qId),
                  valor: valor,
                }));
                submitResponse.mutate({
                  surveyId: showAplicar.id,
                  employeeId: aplicarEmployeeId,
                  evaluatorUserId: user?.id,
                  respondentName: user?.name || undefined,
                  answers,
                });
              }}
              disabled={submitResponse.isPending}
            >
              {submitResponse.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</> : "Confirmar Envio"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============================================================ */}
      {/* DIALOG: GERENCIAR AVALIADORES */}
      {/* ============================================================ */}
      <Dialog open={!!showGerenciarAvaliadores} onOpenChange={(open) => { if (!open) setShowGerenciarAvaliadores(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Avaliadores — {showGerenciarAvaliadores?.titulo}
            </DialogTitle>
            <DialogDescription>Gerencie quem pode aplicar esta avaliação</DialogDescription>
          </DialogHeader>

          {/* Avaliadores atuais */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Avaliadores Vinculados</Label>
            {avaliadoresQuery.isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : avaliadoresQuery.data?.length ? (
              <div className="space-y-1">
                {avaliadoresQuery.data.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <p className="text-sm font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeEvaluator.mutate({ surveyId: showGerenciarAvaliadores.id, userId: u.id })}>
                      <X className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum avaliador vinculado</p>
            )}
          </div>

          <Separator />

          {/* Adicionar avaliadores */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Adicionar Avaliador</Label>
            <Input placeholder="Buscar usuário..." value={addEvalSearch} onChange={(e) => setAddEvalSearch(e.target.value)} />
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-1">
                {filteredUsers
                  .filter((u: any) => !avaliadoresQuery.data?.some((a: any) => a.id === u.id))
                  .map((u: any) => (
                    <div key={u.id} className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer"
                      onClick={() => addEvaluators.mutate({ surveyId: showGerenciarAvaliadores.id, userIds: [u.id] })}
                    >
                      <div>
                        <p className="text-sm font-medium">{u.name || "Sem nome"}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      <Plus className="w-4 h-4 text-primary" />
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: RESULTADOS DA AVALIAÇÃO */}
      {/* ============================================================ */}
      <Dialog open={!!showResultados} onOpenChange={(open) => { if (!open) setShowResultados(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" /> Resultados — {showResultados?.titulo}
            </DialogTitle>
          </DialogHeader>
          {pesquisaResultados.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : pesquisaResultados.data ? (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold">{pesquisaResultados.data.totalRespondentes}</p>
                <p className="text-sm text-muted-foreground">Total de Avaliações Aplicadas</p>
              </div>

              {/* Respostas por funcionário */}
              {pesquisaResultados.data.responses?.length > 0 && (
                <div>
                  <Label className="text-sm font-semibold mb-2 block">Avaliações por Funcionário</Label>
                  <div className="space-y-2">
                    {pesquisaResultados.data.responses.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 border rounded text-sm">
                        <div>
                          <p className="font-medium">{r.employeeName || "—"}</p>
                          <p className="text-xs text-muted-foreground">Avaliado por: {r.evaluatorName || "—"}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("pt-BR")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Resultados por pergunta */}
              {pesquisaResultados.data.results.map((r: any, i: number) => (
                <Card key={i}>
                  <CardContent className="pt-4">
                    <p className="font-medium text-sm mb-2">{i + 1}. {r.question.texto}</p>
                    {r.question.tipo === "nota" ? (
                      <div className="flex items-center gap-3">
                        <Progress value={(r.avgNota / 5) * 100} className="flex-1 h-3" />
                        <span className="font-bold text-lg">{r.avgNota.toFixed(1)}/5</span>
                        <span className="text-xs text-muted-foreground">({r.totalRespostas} resp.)</span>
                      </div>
                    ) : r.question.tipo === "sim_nao" ? (
                      <div className="flex gap-4">
                        {(() => {
                          const sim = r.answers.filter((a: any) => a.valor?.toLowerCase() === "sim").length;
                          const nao = r.answers.filter((a: any) => a.valor?.toLowerCase() === "nao" || a.valor?.toLowerCase() === "não").length;
                          const total = sim + nao || 1;
                          return (
                            <>
                              <div className="flex items-center gap-2">
                                <ThumbsUp className="w-4 h-4 text-green-600" />
                                <span className="font-bold text-green-600">{sim}</span>
                                <span className="text-xs text-muted-foreground">({((sim / total) * 100).toFixed(0)}%)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <ThumbsDown className="w-4 h-4 text-red-600" />
                                <span className="font-bold text-red-600">{nao}</span>
                                <span className="text-xs text-muted-foreground">({((nao / total) * 100).toFixed(0)}%)</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {r.answers.slice(0, 5).map((a: any, j: number) => (
                          <p key={j} className="text-sm p-2 bg-muted/50 rounded">{a.textoLivre || a.valor || "—"}</p>
                        ))}
                        {r.answers.length > 5 && <p className="text-xs text-muted-foreground">+{r.answers.length - 5} respostas</p>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-center py-4 text-muted-foreground">Nenhum resultado disponível</p>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: NOVA PESQUISA CUSTOMIZADA */}
      {/* ============================================================ */}
      <Dialog open={showNovaPesquisa} onOpenChange={(open) => { if (!open) { setShowNovaPesquisa(false); resetFormPesquisa(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" /> Nova Pesquisa Customizada
            </DialogTitle>
            <DialogDescription>Crie uma pesquisa com perguntas personalizadas. A IA pode sugerir perguntas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Título *</Label>
                <Input value={pesquisaTitulo} onChange={(e) => setPesquisaTitulo(e.target.value)} placeholder="Ex: Pesquisa de Satisfação do Cliente" />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={pesquisaTipo} onValueChange={(v: any) => setPesquisaTipo(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="setor">Setor</SelectItem>
                    <SelectItem value="cliente">Cliente</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={pesquisaDescricao} onChange={(e) => setPesquisaDescricao(e.target.value)} placeholder="Descreva o objetivo..." rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={pesquisaAnonima} onCheckedChange={setPesquisaAnonima} />
              <Label>Pesquisa anônima</Label>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Perguntas</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => suggestQuestions.mutate({ tema: pesquisaTitulo, tipo: pesquisaTipo as "setor" | "cliente" | "outro" })}
                disabled={suggestQuestions.isPending || !pesquisaTitulo}
              >
                {suggestQuestions.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</> : <><Sparkles className="w-4 h-4 mr-2" /> IA Sugerir</>}
              </Button>
            </div>

            {pesquisaPerguntas.length > 0 ? (
              <div className="space-y-2">
                {pesquisaPerguntas.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
                    <span className="text-xs font-bold text-muted-foreground mt-2">{i + 1}.</span>
                    <div className="flex-1 space-y-2">
                      <Input value={p.texto} onChange={(e) => {
                        const updated = [...pesquisaPerguntas];
                        updated[i].texto = e.target.value;
                        setPesquisaPerguntas(updated);
                      }} />
                      <div className="flex items-center gap-3">
                        <Select value={p.tipo} onValueChange={(v) => {
                          const updated = [...pesquisaPerguntas];
                          updated[i].tipo = v;
                          setPesquisaPerguntas(updated);
                        }}>
                          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nota">Nota (1-5)</SelectItem>
                            <SelectItem value="texto">Texto livre</SelectItem>
                            <SelectItem value="sim_nao">Sim/Não</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1">
                          <Switch checked={p.obrigatoria} onCheckedChange={(v) => {
                            const updated = [...pesquisaPerguntas];
                            updated[i].obrigatoria = v;
                            setPesquisaPerguntas(updated);
                          }} />
                          <span className="text-xs text-muted-foreground">Obrigatória</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setPesquisaPerguntas(pesquisaPerguntas.filter((_, j) => j !== i))}>
                      <X className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-4 text-muted-foreground text-sm">Clique em "IA Sugerir" ou adicione manualmente</p>
            )}

            <Button variant="outline" size="sm" onClick={() => setPesquisaPerguntas([...pesquisaPerguntas, { texto: "", tipo: "nota", obrigatoria: true }])}>
              <Plus className="w-4 h-4 mr-2" /> Adicionar Pergunta
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNovaPesquisa(false); resetFormPesquisa(); }}>Cancelar</Button>
            <Button
              onClick={() => criarPesquisa.mutate({
                companyId: companyId!,
                titulo: pesquisaTitulo,
                descricao: pesquisaDescricao || undefined,
                tipo: pesquisaTipo,
                anonimo: pesquisaAnonima,
                isEvaluation: false,
                questions: pesquisaPerguntas.map((p, i) => ({ texto: p.texto, tipo: p.tipo as "nota" | "texto" | "sim_nao", ordem: i + 1, obrigatoria: p.obrigatoria })),
              })}
              disabled={criarPesquisa.isPending || !pesquisaTitulo || pesquisaPerguntas.length === 0}
            >
              {criarPesquisa.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando...</> : "Criar Pesquisa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: NOVA PESQUISA DE CLIMA */}
      {/* ============================================================ */}
      <Dialog open={showNovoClima} onOpenChange={(open) => { if (!open) { setShowNovoClima(false); resetFormClima(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" /> Nova Pesquisa de Clima Organizacional
            </DialogTitle>
            <DialogDescription>Pesquisa anônima para medir a satisfação da equipe.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input value={climaTitulo} onChange={(e) => setClimaTitulo(e.target.value)} placeholder="Ex: Pesquisa de Clima - 1º Semestre 2026" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={climaDescricao} onChange={(e) => setClimaDescricao(e.target.value)} placeholder="Descreva o objetivo..." rows={2} />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Perguntas por Categoria</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => suggestClimaQuestions.mutate({ tema: climaTitulo || undefined })}
                disabled={suggestClimaQuestions.isPending}
              >
                {suggestClimaQuestions.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</> : <><Sparkles className="w-4 h-4 mr-2" /> IA Sugerir Perguntas</>}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 mb-2">
              {Object.entries(CLIMA_CATEGORIAS).map(([key, cat]) => {
                const cnt = climaPerguntas.filter(p => p.categoria === key).length;
                return (
                  <Badge key={key} variant={cnt > 0 ? "default" : "outline"} className="gap-1">
                    <cat.icon className="w-3 h-3" /> {cat.label} ({cnt})
                  </Badge>
                );
              })}
            </div>

            {climaPerguntas.length > 0 ? (
              <div className="space-y-2">
                {climaPerguntas.map((p, i) => {
                  const cat = CLIMA_CATEGORIAS[p.categoria] || CLIMA_CATEGORIAS.empresa;
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
                      <Badge variant="outline" className="shrink-0 mt-1 text-xs gap-1">
                        <cat.icon className="w-3 h-3" /> {cat.label}
                      </Badge>
                      <div className="flex-1">
                        <Input value={p.texto} onChange={(e) => {
                          const updated = [...climaPerguntas];
                          updated[i].texto = e.target.value;
                          setClimaPerguntas(updated);
                        }} className="mb-1" />
                        <div className="flex gap-2">
                          <Select value={p.categoria} onValueChange={(v) => {
                            const updated = [...climaPerguntas];
                            updated[i].categoria = v;
                            setClimaPerguntas(updated);
                          }}>
                            <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(CLIMA_CATEGORIAS).map(([k, c]) => (
                                <SelectItem key={k} value={k}>{c.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={p.tipo} onValueChange={(v: any) => {
                            const updated = [...climaPerguntas];
                            updated[i].tipo = v;
                            setClimaPerguntas(updated);
                          }}>
                            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="nota">Nota (1-5)</SelectItem>
                              <SelectItem value="texto">Texto livre</SelectItem>
                              <SelectItem value="sim_nao">Sim/Não</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setClimaPerguntas(climaPerguntas.filter((_, j) => j !== i))}>
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center py-4 text-muted-foreground text-sm">Clique em "IA Sugerir Perguntas" para gerar automaticamente</p>
            )}

            <Button variant="outline" size="sm" onClick={() => setClimaPerguntas([...climaPerguntas, { texto: "", categoria: "empresa", tipo: "nota" }])}>
              <Plus className="w-4 h-4 mr-2" /> Adicionar Pergunta
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNovoClima(false); resetFormClima(); }}>Cancelar</Button>
            <Button
              onClick={() => criarClima.mutate({
                companyId: companyId!,
                titulo: climaTitulo,
                descricao: climaDescricao || undefined,
                questions: climaPerguntas.map((p, i) => ({
                  texto: p.texto,
                  categoria: p.categoria as "empresa" | "gestor" | "ambiente" | "seguranca" | "crescimento" | "recomendacao",
                  tipo: p.tipo as "nota" | "texto" | "sim_nao",
                  ordem: i + 1,
                })),
              })}
              disabled={criarClima.isPending || !climaTitulo || climaPerguntas.length === 0}
            >
              {criarClima.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando...</> : "Criar Pesquisa de Clima"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: LINK PÚBLICO */}
      {/* ============================================================ */}
      <Dialog open={!!showPesquisaLink} onOpenChange={() => setShowPesquisaLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Link2 className="w-5 h-5" /> Link Público da Pesquisa</DialogTitle>
          </DialogHeader>
          {showPesquisaLink && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Input value={getPublicLink(showPesquisaLink.publicToken, "pesquisa")} readOnly className="text-xs" />
                <Button size="sm" onClick={() => copyToClipboard(getPublicLink(showPesquisaLink.publicToken, "pesquisa"))}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Qualquer pessoa com este link poderá responder enquanto a pesquisa estiver ativa.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!showClimaLink} onOpenChange={() => setShowClimaLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Link2 className="w-5 h-5" /> Link Público - Clima</DialogTitle>
          </DialogHeader>
          {showClimaLink && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Input value={getPublicLink(showClimaLink.publicToken, "clima")} readOnly className="text-xs" />
                <Button size="sm" onClick={() => copyToClipboard(getPublicLink(showClimaLink.publicToken, "clima"))}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">As respostas são anônimas.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: RESULTADOS PESQUISA CUSTOMIZADA */}
      {/* ============================================================ */}
      <Dialog open={!!showPesquisaResultados} onOpenChange={() => setShowPesquisaResultados(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Resultados da Pesquisa</DialogTitle>
          </DialogHeader>
          {pesquisaResultados.isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Carregando...</p>
          ) : pesquisaResultados.data ? (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold">{pesquisaResultados.data.totalRespondentes}</p>
                <p className="text-sm text-muted-foreground">Respondentes</p>
              </div>
              {pesquisaResultados.data.results.map((r: any, i: number) => (
                <Card key={i}>
                  <CardContent className="pt-4">
                    <p className="font-medium text-sm mb-2">{i + 1}. {r.question.texto}</p>
                    {r.question.tipo === "nota" ? (
                      <div className="flex items-center gap-3">
                        <Progress value={(r.avgNota / 5) * 100} className="flex-1 h-3" />
                        <span className="font-bold text-lg">{r.avgNota.toFixed(1)}/5</span>
                      </div>
                    ) : r.question.tipo === "sim_nao" ? (
                      <div className="flex gap-4">
                        {(() => {
                          const sim = r.answers.filter((a: any) => a.valor?.toLowerCase() === "sim").length;
                          const nao = r.answers.filter((a: any) => ["nao", "não"].includes(a.valor?.toLowerCase())).length;
                          return (
                            <>
                              <span className="text-green-600 font-bold">Sim: {sim}</span>
                              <span className="text-red-600 font-bold">Não: {nao}</span>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {r.answers.slice(0, 5).map((a: any, j: number) => (
                          <p key={j} className="text-sm p-2 bg-muted/50 rounded">{a.textoLivre || a.valor || "—"}</p>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-center py-4 text-muted-foreground">Sem resultados</p>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: RESULTADOS CLIMA */}
      {/* ============================================================ */}
      <Dialog open={!!showClimaResultados} onOpenChange={() => setShowClimaResultados(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Heart className="w-5 h-5 text-red-500" /> Resultados - Clima Organizacional</DialogTitle>
          </DialogHeader>
          {climaResultados.isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Carregando...</p>
          ) : climaResultados.data ? (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold">{climaResultados.data.totalRespondentes}</p>
                <p className="text-sm text-muted-foreground">Respondentes</p>
              </div>
              {Object.entries(climaResultados.data.byCategory).map(([catKey, questions]: [string, any]) => {
                const cat = CLIMA_CATEGORIAS[catKey] || { label: catKey, icon: HelpCircle, cor: "text-gray-600" };
                const notaQs = questions.filter((q: any) => q.question.tipo === "nota");
                const avgCat = notaQs.length > 0 ? notaQs.reduce((s: number, q: any) => s + q.avgNota, 0) / notaQs.length : 0;
                return (
                  <Card key={catKey}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <cat.icon className={`w-4 h-4 ${cat.cor}`} /> {cat.label}
                        {avgCat > 0 && <Badge variant="outline" className="ml-auto">{avgCat.toFixed(1)}/5</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {questions.map((r: any, i: number) => (
                        <div key={i}>
                          <p className="text-sm font-medium mb-1">{r.question.texto}</p>
                          {r.question.tipo === "nota" ? (
                            <div className="flex items-center gap-3">
                              <Progress value={(r.avgNota / 5) * 100} className="flex-1 h-2" />
                              <span className="font-bold">{r.avgNota.toFixed(1)}</span>
                            </div>
                          ) : r.question.tipo === "sim_nao" ? (
                            <div className="flex gap-4">
                              {(() => {
                                const sim = r.answers.filter((a: any) => a.valor?.toLowerCase() === "sim").length;
                                const nao = r.answers.filter((a: any) => ["nao", "não"].includes(a.valor?.toLowerCase())).length;
                                return (
                                  <>
                                    <span className="text-sm text-green-600 font-bold">Sim: {sim}</span>
                                    <span className="text-sm text-red-600 font-bold">Não: {nao}</span>
                                  </>
                                );
                              })()}
                            </div>
                          ) : (
                            <div className="space-y-1 max-h-24 overflow-y-auto">
                              {r.answers.slice(0, 3).map((a: any, j: number) => (
                                <p key={j} className="text-xs p-1.5 bg-muted/50 rounded">{a.textoLivre || a.valor || "—"}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="text-center py-4 text-muted-foreground">Sem resultados</p>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
