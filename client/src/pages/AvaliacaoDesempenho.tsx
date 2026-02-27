import { useState, useRef, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Star, Plus, Trash2, Edit, Eye, CheckCircle, Clock, Users, Trophy,
  FileText, BarChart3, Lock, AlertTriangle, ArrowUp, ArrowDown,
  ClipboardList, UserCheck, Timer, TrendingUp, TrendingDown,
  Brain, Search, ChevronDown, ChevronUp, Sparkles, Shield, Wrench, Heart,
  ChevronsUpDown, Check, X, Copy, ExternalLink, Loader2, Building2,
  MessageSquare, ThumbsUp, ThumbsDown, HelpCircle, Send, Link2
} from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";

// ============================================================
// CONSTANTES
// ============================================================
const PILARES = [
  {
    nome: "Postura e Disciplina",
    icon: Shield,
    cor: "blue",
    criterios: [
      { key: "comportamento", label: "Comportamento", desc: "Postura profissional, respeito às normas e aos colegas" },
      { key: "pontualidade", label: "Pontualidade", desc: "Cumprimento de horários de entrada, saída e intervalos" },
      { key: "assiduidade", label: "Assiduidade", desc: "Frequência e comprometimento com a presença no trabalho" },
      { key: "segurancaEpis", label: "Segurança e EPIs", desc: "Uso correto de EPIs e cumprimento das normas de segurança" },
    ],
  },
  {
    nome: "Desempenho Técnico",
    icon: Wrench,
    cor: "amber",
    criterios: [
      { key: "qualidadeAcabamento", label: "Qualidade e Acabamento", desc: "Nível de qualidade e acabamento dos serviços executados" },
      { key: "produtividadeRitmo", label: "Produtividade e Ritmo", desc: "Volume de trabalho entregue dentro do prazo esperado" },
      { key: "cuidadoFerramentas", label: "Cuidado com Ferramentas", desc: "Zelo e manutenção dos equipamentos e ferramentas" },
      { key: "economiaMateriais", label: "Economia de Materiais", desc: "Uso consciente e econômico dos materiais de trabalho" },
    ],
  },
  {
    nome: "Atitude e Crescimento",
    icon: Heart,
    cor: "green",
    criterios: [
      { key: "trabalhoEquipe", label: "Trabalho em Equipe", desc: "Colaboração e relacionamento com colegas de trabalho" },
      { key: "iniciativaProatividade", label: "Iniciativa e Proatividade", desc: "Capacidade de antecipar problemas e propor soluções" },
      { key: "disponibilidadeFlexibilidade", label: "Disponibilidade e Flexibilidade", desc: "Adaptação a mudanças e disponibilidade para novas tarefas" },
      { key: "organizacaoLimpeza", label: "Organização e Limpeza", desc: "Manutenção da organização e limpeza do ambiente de trabalho" },
    ],
  },
];

const NOTAS_LABELS: Record<number, { label: string; cor: string; bg: string }> = {
  1: { label: "Péssimo", cor: "text-red-600", bg: "bg-red-100 border-red-300" },
  2: { label: "Ruim", cor: "text-orange-600", bg: "bg-orange-100 border-orange-300" },
  3: { label: "Regular", cor: "text-yellow-600", bg: "bg-yellow-100 border-yellow-300" },
  4: { label: "Bom", cor: "text-blue-600", bg: "bg-blue-100 border-blue-300" },
  5: { label: "Ótimo", cor: "text-green-600", bg: "bg-green-100 border-green-300" },
};

const CLIMA_CATEGORIAS: Record<string, { label: string; icon: any; cor: string }> = {
  empresa: { label: "Empresa", icon: Building2, cor: "text-blue-600" },
  gestor: { label: "Gestão/Liderança", icon: UserCheck, cor: "text-purple-600" },
  ambiente: { label: "Ambiente de Trabalho", icon: Heart, cor: "text-green-600" },
  seguranca: { label: "Segurança", icon: Shield, cor: "text-amber-600" },
  crescimento: { label: "Crescimento", icon: TrendingUp, cor: "text-cyan-600" },
  recomendacao: { label: "Recomendação", icon: ThumbsUp, cor: "text-pink-600" },
};

function getRecomendacao(media: number) {
  if (media < 2.0) return { texto: "SUGERIR DEMISSÃO", cor: "bg-red-100 text-red-700 border-red-300" };
  if (media < 3.0) return { texto: "ATENÇÃO - ACOMPANHAR", cor: "bg-amber-100 text-amber-700 border-amber-300" };
  if (media < 4.0) return { texto: "TREINAMENTO", cor: "bg-blue-100 text-blue-700 border-blue-300" };
  return { texto: "PROMOÇÃO / PREMIAÇÃO", cor: "bg-green-100 text-green-700 border-green-300" };
}

function NotaSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-10 h-10 rounded-lg border-2 font-bold text-sm transition-all ${
            value === n
              ? NOTAS_LABELS[n].bg + " " + NOTAS_LABELS[n].cor + " scale-110 shadow-md"
              : "border-gray-200 text-gray-400 hover:border-gray-400"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function AvaliacaoDesempenho() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const [activeTab, setActiveTab] = useState("painel");
  const utils = trpc.useUtils();

  const userRole = (user as any)?.role || "user";
  const canViewResults = userRole === "admin" || userRole === "admin_master";

  // ============================================================
  // QUERIES
  // ============================================================
  const dashboardStats = trpc.avaliacao.dashboard.globalStats.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const employeeRanking = trpc.avaliacao.dashboard.employeeRanking.useQuery(
    { companyId, limit: 10 },
    { enabled: companyId > 0 }
  );
  const evaluatorStats = trpc.avaliacao.dashboard.evaluatorStats.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const avaliadores = trpc.avaliacao.avaliadores.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const avaliacoes = trpc.avaliacao.avaliacoes.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const pesquisas = trpc.avaliacao.pesquisas.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const climaSurveys = trpc.avaliacao.clima.listSurveys.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const employeesList = trpc.employees.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const obrasList = trpc.avaliacao.obras.listActive.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  // ============================================================
  // STATES - Avaliação
  // ============================================================
  const [showNovaAvaliacao, setShowNovaAvaliacao] = useState(false);
  const [showNovoAvaliador, setShowNovoAvaliador] = useState(false);
  const [showDetalheAvaliacao, setShowDetalheAvaliacao] = useState<number | null>(null);
  const [showAiSummary, setShowAiSummary] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [empPopoverOpen, setEmpPopoverOpen] = useState(false);
  const [avEmployeeId, setAvEmployeeId] = useState<number>(0);
  const [avObraId, setAvObraId] = useState<number>(0);
  const [avMesRef, setAvMesRef] = useState(new Date().toISOString().slice(0, 7));
  const [avObs, setAvObs] = useState("");
  const [notas, setNotas] = useState<Record<string, number>>({
    comportamento: 0, pontualidade: 0, assiduidade: 0, segurancaEpis: 0,
    qualidadeAcabamento: 0, produtividadeRitmo: 0, cuidadoFerramentas: 0, economiaMateriais: 0,
    trabalhoEquipe: 0, iniciativaProatividade: 0, disponibilidadeFlexibilidade: 0, organizacaoLimpeza: 0,
  });
  const [showConfirmacao, setShowConfirmacao] = useState(false);
  const avaliacaoStartTime = useRef<number>(0);

  // States - Avaliador
  const [avdNome, setAvdNome] = useState("");
  const [avdEmail, setAvdEmail] = useState("");
  const [avdFrequencia, setAvdFrequencia] = useState("monthly");

  // States - Pesquisas Customizadas
  const [showNovaPesquisa, setShowNovaPesquisa] = useState(false);
  const [pesquisaTitulo, setPesquisaTitulo] = useState("");
  const [pesquisaDescricao, setPesquisaDescricao] = useState("");
  const [pesquisaTipo, setPesquisaTipo] = useState<"setor" | "cliente" | "outro">("outro");
  const [pesquisaAnonima, setPesquisaAnonima] = useState(false);
  const [pesquisaPerguntas, setPesquisaPerguntas] = useState<Array<{ texto: string; tipo: "nota" | "texto" | "sim_nao"; obrigatoria: boolean }>>([]);
  const [showPesquisaResultados, setShowPesquisaResultados] = useState<number | null>(null);
  const [showPesquisaLink, setShowPesquisaLink] = useState<{ id: number; token: string } | null>(null);

  // States - Clima Organizacional
  const [showNovoClima, setShowNovoClima] = useState(false);
  const [climaTitulo, setClimaTitulo] = useState("");
  const [climaDescricao, setClimaDescricao] = useState("");
  const [climaPerguntas, setClimaPerguntas] = useState<Array<{ texto: string; categoria: string; tipo: "nota" | "texto" | "sim_nao" }>>([]);
  const [showClimaResultados, setShowClimaResultados] = useState<number | null>(null);
  const [showClimaLink, setShowClimaLink] = useState<{ id: number; token: string } | null>(null);

  // ============================================================
  // MUTATIONS
  // ============================================================
  const criarAvaliacao = trpc.avaliacao.avaliacoes.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Avaliação criada! Média: ${data.mediaGeral} - ${data.recomendacao}`);
      utils.avaliacao.avaliacoes.list.invalidate();
      utils.avaliacao.dashboard.globalStats.invalidate();
      utils.avaliacao.dashboard.employeeRanking.invalidate();
      setShowNovaAvaliacao(false);
      setShowConfirmacao(false);
      resetFormAvaliacao();
    },
    onError: (e) => toast.error(e.message),
  });
  const criarAvaliador = trpc.avaliacao.avaliadores.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Avaliador criado! Senha temporária: ${data.tempPassword}`);
      utils.avaliacao.avaliadores.list.invalidate();
      setShowNovoAvaliador(false);
      setAvdNome(""); setAvdEmail(""); setAvdFrequencia("monthly");
    },
    onError: (e) => toast.error(e.message),
  });
  const toggleAvaliador = trpc.avaliacao.avaliadores.toggleStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado"); utils.avaliacao.avaliadores.list.invalidate(); },
  });
  const resetSenha = trpc.avaliacao.avaliadores.resetPassword.useMutation({
    onSuccess: (data) => toast.success(`Nova senha temporária: ${data.tempPassword}`),
  });
  const deleteAvaliador = trpc.avaliacao.avaliadores.delete.useMutation({
    onSuccess: () => { toast.success("Avaliador excluído"); utils.avaliacao.avaliadores.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteAvaliacao = trpc.avaliacao.avaliacoes.delete.useMutation({
    onSuccess: () => {
      toast.success("Avaliação excluída");
      utils.avaliacao.avaliacoes.list.invalidate();
      utils.avaliacao.dashboard.globalStats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const gerarResumoIA = trpc.avaliacao.avaliacoes.generateAiSummary.useMutation({
    onSuccess: (data) => { setAiSummary(String(data.summary || '')); setShowAiSummary(true); },
    onError: (e) => toast.error(e.message),
  });

  // Pesquisas mutations
  const criarPesquisa = trpc.avaliacao.pesquisas.create.useMutation({
    onSuccess: (data) => {
      toast.success("Pesquisa criada com sucesso!");
      utils.avaliacao.pesquisas.list.invalidate();
      setShowNovaPesquisa(false);
      resetFormPesquisa();
      setShowPesquisaLink({ id: data.id, token: data.publicToken });
    },
    onError: (e) => toast.error(e.message),
  });
  const deletePesquisa = trpc.avaliacao.pesquisas.delete.useMutation({
    onSuccess: () => { toast.success("Pesquisa excluída"); utils.avaliacao.pesquisas.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updatePesquisaStatus = trpc.avaliacao.pesquisas.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado"); utils.avaliacao.pesquisas.list.invalidate(); },
  });
  const suggestQuestions = trpc.avaliacao.pesquisas.suggestQuestions.useMutation({
    onSuccess: (data: any) => {
      if (data && data.length > 0) {
        setPesquisaPerguntas(data.map((q: any, i: number) => ({
          texto: q.texto,
          tipo: q.tipo || "nota",
          obrigatoria: q.obrigatoria !== false,
        })));
        toast.success(`${data.length} perguntas sugeridas pela IA!`);
      } else {
        toast.error("Não foi possível gerar sugestões. Tente novamente.");
      }
    },
    onError: () => toast.error("Erro ao gerar sugestões"),
  });

  // Clima mutations
  const criarClima = trpc.avaliacao.clima.createSurvey.useMutation({
    onSuccess: (data) => {
      toast.success("Pesquisa de clima criada!");
      utils.avaliacao.clima.listSurveys.invalidate();
      setShowNovoClima(false);
      resetFormClima();
      setShowClimaLink({ id: data.id, token: data.publicToken });
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteClima = trpc.avaliacao.clima.deleteSurvey.useMutation({
    onSuccess: () => { toast.success("Pesquisa de clima excluída"); utils.avaliacao.clima.listSurveys.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateClimaStatus = trpc.avaliacao.clima.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status atualizado"); utils.avaliacao.clima.listSurveys.invalidate(); },
  });
  const suggestClimaQuestions = trpc.avaliacao.clima.suggestClimateQuestions.useMutation({
    onSuccess: (data: any) => {
      if (data && data.length > 0) {
        setClimaPerguntas(data.map((q: any) => ({
          texto: q.texto,
          categoria: q.categoria || "empresa",
          tipo: q.tipo || "nota",
        })));
        toast.success(`${data.length} perguntas sugeridas pela IA!`);
      } else {
        toast.error("Não foi possível gerar sugestões.");
      }
    },
    onError: () => toast.error("Erro ao gerar sugestões"),
  });

  // Resultados queries
  const pesquisaResultados = trpc.avaliacao.pesquisas.getResults.useQuery(
    { surveyId: showPesquisaResultados! },
    { enabled: !!showPesquisaResultados }
  );
  const climaResultados = trpc.avaliacao.clima.getResults.useQuery(
    { surveyId: showClimaResultados! },
    { enabled: !!showClimaResultados }
  );
  const avaliacaoDetalhe = trpc.avaliacao.avaliacoes.getById.useQuery(
    { id: showDetalheAvaliacao! },
    { enabled: !!showDetalheAvaliacao }
  );

  // ============================================================
  // HELPERS
  // ============================================================
  function resetFormAvaliacao() {
    setAvEmployeeId(0); setAvObraId(0); setAvObs("");
    setAvMesRef(new Date().toISOString().slice(0, 7));
    setNotas({
      comportamento: 0, pontualidade: 0, assiduidade: 0, segurancaEpis: 0,
      qualidadeAcabamento: 0, produtividadeRitmo: 0, cuidadoFerramentas: 0, economiaMateriais: 0,
      trabalhoEquipe: 0, iniciativaProatividade: 0, disponibilidadeFlexibilidade: 0, organizacaoLimpeza: 0,
    });
    setShowConfirmacao(false);
  }
  function resetFormPesquisa() {
    setPesquisaTitulo(""); setPesquisaDescricao(""); setPesquisaTipo("outro");
    setPesquisaAnonima(false); setPesquisaPerguntas([]);
  }
  function resetFormClima() {
    setClimaTitulo(""); setClimaDescricao(""); setClimaPerguntas([]);
  }

  function handlePreConfirmAvaliacao() {
    if (!avEmployeeId) { toast.error("Selecione o funcionário"); return; }
    const todasPreenchidas = Object.values(notas).every(n => n >= 1 && n <= 5);
    if (!todasPreenchidas) { toast.error("Preencha todas as 12 notas (1 a 5)"); return; }
    setShowConfirmacao(true);
  }

  function handleSubmitAvaliacao() {
    const duration = avaliacaoStartTime.current > 0 ? Math.round((Date.now() - avaliacaoStartTime.current) / 1000) : undefined;
    criarAvaliacao.mutate({
      companyId,
      employeeId: avEmployeeId,
      obraId: avObraId || undefined,
      ...notas as any,
      observacoes: avObs || undefined,
      mesReferencia: avMesRef,
      durationSeconds: duration,
      deviceType: /Mobi/.test(navigator.userAgent) ? "mobile" : "desktop",
    });
  }

  const avaliacoesFiltradas = useMemo(() => {
    if (!avaliacoes.data) return [];
    if (!searchTerm) return avaliacoes.data;
    const term = searchTerm.toLowerCase();
    return avaliacoes.data.filter((a: any) =>
      a.employeeName?.toLowerCase().includes(term) ||
      a.evaluatorName?.toLowerCase().includes(term) ||
      a.recomendacao?.toLowerCase().includes(term) ||
      a.obraNome?.toLowerCase().includes(term)
    );
  }, [avaliacoes.data, searchTerm]);

  const activeEmployees = useMemo(() => {
    return (employeesList.data || []).filter((e: any) => e.status === "Ativo");
  }, [employeesList.data]);

  const selectedEmployee = useMemo(() => {
    return activeEmployees.find((e: any) => e.id === avEmployeeId);
  }, [activeEmployees, avEmployeeId]);

  function getPublicLink(token: string, type: "pesquisa" | "clima") {
    return `${window.location.origin}/pesquisa-publica/${type}/${token}`;
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Link copiado!");
  }

  // ============================================================
  // GUARD: no company
  // ============================================================
  if (!companyId) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Selecione uma empresa para acessar as avaliações.</p>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Avaliação de Desempenho</h1>
            <p className="text-muted-foreground">12 Critérios | 3 Pilares | Sistema FC Engenharia</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setShowNovoAvaliador(true)}>
              <UserCheck className="w-4 h-4 mr-2" /> Novo Avaliador
            </Button>
            <Button onClick={() => { setShowNovaAvaliacao(true); avaliacaoStartTime.current = Date.now(); }}>
              <Plus className="w-4 h-4 mr-2" /> Nova Avaliação
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap w-full max-w-3xl">
            <TabsTrigger value="painel"><BarChart3 className="w-4 h-4 mr-1" /> Painel</TabsTrigger>
            <TabsTrigger value="avaliacoes"><ClipboardList className="w-4 h-4 mr-1" /> Avaliações</TabsTrigger>
            <TabsTrigger value="ranking"><Trophy className="w-4 h-4 mr-1" /> Ranking</TabsTrigger>
            <TabsTrigger value="avaliadores"><Users className="w-4 h-4 mr-1" /> Avaliadores</TabsTrigger>
            <TabsTrigger value="pesquisas"><FileText className="w-4 h-4 mr-1" /> Pesquisas</TabsTrigger>
            <TabsTrigger value="clima"><Heart className="w-4 h-4 mr-1" /> Clima</TabsTrigger>
          </TabsList>

          {/* ============ TAB PAINEL ============ */}
          <TabsContent value="painel" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <p className="text-3xl font-bold">{dashboardStats.data?.totalAvaliacoes || 0}</p>
                  <p className="text-sm text-muted-foreground">Total de Avaliações</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <Users className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                  <p className="text-3xl font-bold">{dashboardStats.data?.totalAvaliadores || 0}</p>
                  <p className="text-sm text-muted-foreground">Avaliadores</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  <p className="text-3xl font-bold">{dashboardStats.data?.totalPesquisas || 0}</p>
                  <p className="text-sm text-muted-foreground">Pesquisas</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <Star className="w-8 h-8 mx-auto mb-2 text-amber-500" />
                  <p className="text-3xl font-bold">
                    {canViewResults ? (dashboardStats.data?.mediaGeral?.toFixed(1) || "0.0") : "---"}
                  </p>
                  <p className="text-sm text-muted-foreground">Média Geral</p>
                  {!canViewResults && <p className="text-xs text-amber-600 mt-1">Restrito a RH/ADM</p>}
                </CardContent>
              </Card>
            </div>

            {/* Gráfico por mês */}
            {canViewResults && dashboardStats.data?.porMes && dashboardStats.data.porMes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Evolução por Mês</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2 h-32">
                    {dashboardStats.data.porMes.map((m: any, i: number) => {
                      const media = m.media ? parseFloat(String(m.media)) : 0;
                      const height = Math.max(10, (media / 5) * 100);
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-xs font-bold">{media.toFixed(1)}</span>
                          <div className="w-full bg-primary/80 rounded-t" style={{ height: `${height}%` }} />
                          <span className="text-xs text-muted-foreground">{m.mes?.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Distribuição por recomendação */}
            {canViewResults && dashboardStats.data?.porRecomendacao && dashboardStats.data.porRecomendacao.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Distribuição por Recomendação</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {dashboardStats.data.porRecomendacao.map((r: any, i: number) => {
                      const total = dashboardStats.data!.totalAvaliacoes || 1;
                      const pct = ((r.count / total) * 100);
                      const rec = getRecomendacao(r.recomendacao?.includes("DEMISSÃO") ? 1 : r.recomendacao?.includes("ATENÇÃO") ? 2.5 : r.recomendacao?.includes("TREINAMENTO") ? 3.5 : 4.5);
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <Badge className={rec.cor + " border text-xs min-w-[180px] justify-center"}>{r.recomendacao}</Badge>
                          <Progress value={pct} className="flex-1 h-2" />
                          <span className="text-sm font-mono w-12 text-right">{r.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ============ TAB AVALIAÇÕES ============ */}
          <TabsContent value="avaliacoes" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por funcionário, avaliador, obra ou recomendação..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>

            {avaliacoes.isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Carregando avaliações...</p>
            ) : !avaliacoesFiltradas.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma avaliação encontrada</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {avaliacoesFiltradas.map((av: any) => (
                  <Card key={av.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                            {(av.employeeName || "?").charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{av.employeeName}</p>
                            <p className="text-xs text-muted-foreground">
                              {av.employeeFuncao} {av.employeeSetor ? `• ${av.employeeSetor}` : ""}
                              {av.obraNome ? ` • Obra: ${av.obraNome}` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Avaliador: {av.evaluatorName} • {av.mesReferencia} • {new Date(av.createdAt).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {av._hidden ? (
                            <Badge variant="secondary"><Lock className="w-3 h-3 mr-1" /> Registrada</Badge>
                          ) : (
                            <>
                              <div className="text-center">
                                <p className="text-xl font-bold">{parseFloat(av.mediaGeral || "0").toFixed(1)}</p>
                                <Badge className={getRecomendacao(parseFloat(av.mediaGeral || "0")).cor + " border text-xs"}>
                                  {av.recomendacao}
                                </Badge>
                              </div>
                              <div className="flex flex-col gap-1">
                                <Button variant="ghost" size="sm" onClick={() => setShowDetalheAvaliacao(av.id)}>
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => gerarResumoIA.mutate({ id: av.id })} disabled={gerarResumoIA.isPending}>
                                  <Sparkles className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => { if (confirm("Excluir esta avaliação?")) deleteAvaliacao.mutate({ id: av.id }); }}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ============ TAB RANKING ============ */}
          <TabsContent value="ranking" className="space-y-4">
            {!canViewResults ? (
              <Card><CardContent className="py-12 text-center">
                <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-semibold">Acesso Restrito</p>
                <p className="text-muted-foreground">Apenas RH, ADM e ADM Master podem visualizar o ranking.</p>
              </CardContent></Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Ranking de Funcionários</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {employeeRanking.isLoading ? (
                      <p className="text-center py-4 text-muted-foreground">Carregando...</p>
                    ) : !employeeRanking.data?.length ? (
                      <p className="text-center py-4 text-muted-foreground">Nenhum dado disponível</p>
                    ) : (
                      <div className="space-y-2">
                        {employeeRanking.data.map((r: any, i: number) => (
                          <div key={r.employeeId} className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                              i === 0 ? "bg-amber-100 text-amber-700" :
                              i === 1 ? "bg-gray-100 text-gray-700" :
                              i === 2 ? "bg-orange-100 text-orange-700" :
                              "bg-muted text-muted-foreground"
                            }`}>{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate">{r.employeeName}</p>
                              <p className="text-xs text-muted-foreground">{r.employeeFuncao} {r.employeeSetor ? `• ${r.employeeSetor}` : ""}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-bold">{r.mediaGeral.toFixed(1)}</p>
                              <Badge className={getRecomendacao(r.mediaGeral).cor + " border text-xs"}>{r.recomendacao}</Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">{r.totalAvaliacoes} aval.</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Ranking de Avaliadores */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><UserCheck className="w-5 h-5" /> Atividade dos Avaliadores</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {evaluatorStats.isLoading ? (
                      <p className="text-center py-4 text-muted-foreground">Carregando...</p>
                    ) : !evaluatorStats.data?.length ? (
                      <p className="text-center py-4 text-muted-foreground">Nenhum dado disponível</p>
                    ) : (
                      <div className="space-y-2">
                        {evaluatorStats.data.map((e: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <p className="font-medium">{e.evaluatorName}</p>
                              <p className="text-xs text-muted-foreground">Tempo médio: {e.avgDuration > 0 ? `${Math.floor(e.avgDuration / 60)}min ${e.avgDuration % 60}s` : "N/A"}</p>
                            </div>
                            <Badge variant="outline">{e.totalAvaliacoes} avaliações</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ============ TAB AVALIADORES ============ */}
          <TabsContent value="avaliadores" className="space-y-4">
            {avaliadores.isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Carregando...</p>
            ) : !avaliadores.data?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                Nenhum avaliador cadastrado
              </CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {avaliadores.data.map((a: any) => (
                  <Card key={a.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">{a.nome}</p>
                          <p className="text-sm text-muted-foreground">{a.email}</p>
                          <div className="flex gap-2 mt-2">
                            <Badge variant={a.status === "ativo" ? "default" : "secondary"}>{a.status}</Badge>
                            <Badge variant="outline">{a.totalAvaliacoes} aval.</Badge>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => toggleAvaliador.mutate({ id: a.id })}>
                            {a.status === "ativo" ? <Lock className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => resetSenha.mutate({ id: a.id })}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm("Excluir avaliador?")) deleteAvaliador.mutate({ id: a.id }); }}>
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

          {/* ============ TAB PESQUISAS CUSTOMIZADAS ============ */}
          <TabsContent value="pesquisas" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Pesquisas Customizadas</h2>
                <p className="text-sm text-muted-foreground">Crie pesquisas para clientes, setores ou temas específicos. A IA sugere perguntas!</p>
              </div>
              <Button onClick={() => setShowNovaPesquisa(true)}>
                <Plus className="w-4 h-4 mr-2" /> Nova Pesquisa
              </Button>
            </div>

            {pesquisas.isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Carregando...</p>
            ) : !pesquisas.data?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
                Nenhuma pesquisa criada. Clique em "Nova Pesquisa" para começar.
              </CardContent></Card>
            ) : (
              <div className="space-y-3">
                {pesquisas.data.map((p: any) => (
                  <Card key={p.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{p.titulo}</p>
                            <Badge variant={p.status === "ativa" ? "default" : p.status === "encerrada" ? "secondary" : "outline"}>{p.status}</Badge>
                            {p.anonimo ? <Badge variant="outline"><Lock className="w-3 h-3 mr-1" /> Anônima</Badge> : null}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Tipo: {p.tipo} • {p.totalPerguntas} perguntas • {p.totalRespostas} respostas
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {p.publicToken && (
                            <Button variant="ghost" size="sm" onClick={() => setShowPesquisaLink({ id: p.id, token: p.publicToken })}>
                              <Link2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setShowPesquisaResultados(p.id)}>
                            <BarChart3 className="w-4 h-4" />
                          </Button>
                          {p.status === "rascunho" && (
                            <Button variant="ghost" size="sm" onClick={() => updatePesquisaStatus.mutate({ id: p.id, status: "ativa" })}>
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            </Button>
                          )}
                          {p.status === "ativa" && (
                            <Button variant="ghost" size="sm" onClick={() => updatePesquisaStatus.mutate({ id: p.id, status: "encerrada" })}>
                              <Lock className="w-4 h-4 text-amber-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm("Excluir pesquisa e todas as respostas?")) deletePesquisa.mutate({ id: p.id }); }}>
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

          {/* ============ TAB CLIMA ORGANIZACIONAL ============ */}
          <TabsContent value="clima" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Heart className="w-5 h-5 text-red-500" /> Pesquisa de Clima Organizacional
                </h2>
                <p className="text-sm text-muted-foreground">Pesquisas anônimas para medir satisfação da equipe. Categorias: Empresa, Gestão, Ambiente, Segurança, Crescimento.</p>
              </div>
              <Button onClick={() => setShowNovoClima(true)}>
                <Plus className="w-4 h-4 mr-2" /> Nova Pesquisa de Clima
              </Button>
            </div>

            {climaSurveys.isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Carregando...</p>
            ) : !climaSurveys.data?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Heart className="w-12 h-12 mx-auto mb-4 opacity-30" />
                Nenhuma pesquisa de clima criada. Clique em "Nova Pesquisa de Clima" para começar.
              </CardContent></Card>
            ) : (
              <div className="space-y-3">
                {climaSurveys.data.map((c: any) => (
                  <Card key={c.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{c.titulo}</p>
                            <Badge variant={c.status === "ativa" ? "default" : c.status === "encerrada" ? "secondary" : "outline"}>{c.status}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {c.totalPerguntas} perguntas • {c.totalRespostas} respostas
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {c.publicToken && (
                            <Button variant="ghost" size="sm" onClick={() => setShowClimaLink({ id: c.id, token: c.publicToken })}>
                              <Link2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setShowClimaResultados(c.id)}>
                            <BarChart3 className="w-4 h-4" />
                          </Button>
                          {c.status === "rascunho" && (
                            <Button variant="ghost" size="sm" onClick={() => updateClimaStatus.mutate({ id: c.id, status: "ativa" })}>
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            </Button>
                          )}
                          {c.status === "ativa" && (
                            <Button variant="ghost" size="sm" onClick={() => updateClimaStatus.mutate({ id: c.id, status: "encerrada" })}>
                              <Lock className="w-4 h-4 text-amber-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm("Excluir pesquisa de clima e todas as respostas?")) deleteClima.mutate({ id: c.id }); }}>
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
        </Tabs>
      </div>

      {/* ============================================================ */}
      {/* DIALOG: NOVA AVALIAÇÃO (com autocomplete + obra + confirmação) */}
      {/* ============================================================ */}
      <Dialog open={showNovaAvaliacao} onOpenChange={(open) => { if (!open) { setShowNovaAvaliacao(false); resetFormAvaliacao(); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" /> Nova Avaliação de Desempenho
            </DialogTitle>
            <DialogDescription>
              Avaliador: <strong>{user?.name || "Você"}</strong> (automático)
            </DialogDescription>
          </DialogHeader>

          {!showConfirmacao ? (
            <div className="space-y-6">
              {/* Funcionário - Autocomplete */}
              <div>
                <Label className="mb-2 block">Funcionário *</Label>
                <Popover open={empPopoverOpen} onOpenChange={setEmpPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      role="combobox"
                      aria-expanded={empPopoverOpen}
                      className={cn(
                        "flex w-full items-center justify-between border-2 rounded-lg px-4 py-3 bg-background text-sm transition-all",
                        empPopoverOpen ? "border-primary ring-2 ring-primary/20" : "border-input hover:border-primary/50",
                        !avEmployeeId && "text-muted-foreground"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Search className="h-5 w-5 text-primary shrink-0" />
                        {selectedEmployee ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                              {(selectedEmployee.nomeCompleto || '').charAt(0)}
                            </div>
                            <span className="font-semibold truncate">{selectedEmployee.nomeCompleto}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{selectedEmployee.funcao || ''}</span>
                          </div>
                        ) : (
                          <span>Buscar funcionário por nome, CPF ou função...</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {avEmployeeId > 0 && (
                          <span
                            className="p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
                            onClick={e => { e.stopPropagation(); e.preventDefault(); setAvEmployeeId(0); setEmpPopoverOpen(false); }}
                          >
                            <X className="h-4 w-4" />
                          </span>
                        )}
                        <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" sideOffset={4}>
                    <Command>
                      <CommandInput placeholder="Digite nome, CPF ou função..." />
                      <CommandList className="max-h-72">
                        <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                          <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          Nenhum colaborador encontrado
                        </CommandEmpty>
                        <CommandGroup>
                          {activeEmployees.map((e: any) => (
                            <CommandItem
                              key={e.id}
                              value={`${e.nomeCompleto || ''} ${e.cpf || ''} ${e.funcao || ''} ${e.setor || ''}`}
                              onSelect={() => {
                                setAvEmployeeId(e.id);
                                setEmpPopoverOpen(false);
                              }}
                              className="flex items-center justify-between py-2.5 cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                                  {(e.nomeCompleto || '').charAt(0)}
                                </div>
                                <div>
                                  <span className="font-semibold block text-sm">{e.nomeCompleto}</span>
                                  <span className="text-xs text-muted-foreground">{e.funcao || 'Sem função'} {e.setor ? `• ${e.setor}` : ''}</span>
                                </div>
                              </div>
                              {avEmployeeId === e.id && <Check className="h-4 w-4 text-primary" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Obra e Mês */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Obra (opcional)</Label>
                  <Select value={avObraId ? String(avObraId) : "none"} onValueChange={(v) => setAvObraId(v === "none" ? 0 : Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma obra</SelectItem>
                      {(obrasList.data || []).map((o: any) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.nome} {o.codigo ? `(${o.codigo})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Mês de Referência</Label>
                  <Input type="month" value={avMesRef} onChange={(e) => setAvMesRef(e.target.value)} />
                </div>
              </div>

              {/* Notas por pilar */}
              {PILARES.map((pilar) => (
                <Card key={pilar.nome}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <pilar.icon className="w-4 h-4" /> {pilar.nome}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {pilar.criterios.map((criterio) => (
                      <div key={criterio.key} className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{criterio.label}</p>
                          <p className="text-xs text-muted-foreground">{criterio.desc}</p>
                        </div>
                        <NotaSelector value={notas[criterio.key] || 0} onChange={(v) => setNotas(prev => ({ ...prev, [criterio.key]: v }))} />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}

              {/* Observações */}
              <div>
                <Label>Observações (opcional)</Label>
                <Textarea value={avObs} onChange={(e) => setAvObs(e.target.value)} placeholder="Observações adicionais sobre o funcionário..." rows={3} />
              </div>
            </div>
          ) : (
            /* TELA DE CONFIRMAÇÃO */
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-600" />
                <p className="font-bold text-amber-800">Confirme os dados antes de finalizar</p>
                <p className="text-sm text-amber-700">Após salvar, a avaliação não poderá ser editada.</p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">Funcionário</span>
                  <span className="font-semibold">{selectedEmployee?.nomeCompleto || "N/A"}</span>
                </div>
                <div className="flex justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">Avaliador</span>
                  <span className="font-semibold">{user?.name || "Você"}</span>
                </div>
                {avObraId > 0 && (
                  <div className="flex justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm text-muted-foreground">Obra</span>
                    <span className="font-semibold">{obrasList.data?.find((o: any) => o.id === avObraId)?.nome || "N/A"}</span>
                  </div>
                )}
                <div className="flex justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">Mês Referência</span>
                  <span className="font-semibold">{avMesRef}</span>
                </div>
              </div>

              <Separator />

              {/* Resumo das notas na confirmação */}
              <div className="space-y-2">
                {PILARES.map((pilar) => {
                  const pilarNotas = pilar.criterios.map(c => notas[c.key] || 0);
                  const media = pilarNotas.reduce((a, b) => a + b, 0) / pilarNotas.length;
                  return (
                    <div key={pilar.nome} className="flex items-center justify-between p-2 border rounded">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <pilar.icon className="w-4 h-4" /> {pilar.nome}
                      </span>
                      <span className="font-bold">{media.toFixed(1)}</span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between p-3 bg-primary/5 border-2 border-primary/20 rounded-lg">
                  <span className="font-bold">Média Geral</span>
                  <span className="text-2xl font-bold">
                    {(() => {
                      const p1 = (notas.comportamento + notas.pontualidade + notas.assiduidade + notas.segurancaEpis) / 4;
                      const p2 = (notas.qualidadeAcabamento + notas.produtividadeRitmo + notas.cuidadoFerramentas + notas.economiaMateriais) / 4;
                      const p3 = (notas.trabalhoEquipe + notas.iniciativaProatividade + notas.disponibilidadeFlexibilidade + notas.organizacaoLimpeza) / 4;
                      return ((p1 + p2 + p3) / 3).toFixed(1);
                    })()}
                  </span>
                </div>
              </div>

              {avObs && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Observações:</p>
                  <p className="text-sm">{avObs}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {!showConfirmacao ? (
              <>
                <Button variant="outline" onClick={() => { setShowNovaAvaliacao(false); resetFormAvaliacao(); }}>Cancelar</Button>
                <Button onClick={handlePreConfirmAvaliacao}>
                  Revisar e Confirmar
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowConfirmacao(false)}>
                  Voltar e Editar
                </Button>
                <Button onClick={handleSubmitAvaliacao} disabled={criarAvaliacao.isPending}>
                  {criarAvaliacao.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : "Confirmar e Salvar"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: NOVO AVALIADOR */}
      {/* ============================================================ */}
      <Dialog open={showNovoAvaliador} onOpenChange={setShowNovoAvaliador}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Avaliador</DialogTitle>
            <DialogDescription>Cadastre um novo avaliador para realizar avaliações</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input value={avdNome} onChange={(e) => setAvdNome(e.target.value)} placeholder="Nome completo do avaliador" />
            </div>
            <div>
              <Label>E-mail *</Label>
              <Input type="email" value={avdEmail} onChange={(e) => setAvdEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div>
              <Label>Frequência de Avaliação</Label>
              <Select value={avdFrequencia} onValueChange={setAvdFrequencia}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diária</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="quarterly">Trimestral</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovoAvaliador(false)}>Cancelar</Button>
            <Button onClick={() => criarAvaliador.mutate({ companyId, nome: avdNome, email: avdEmail, evaluationFrequency: avdFrequencia as any })} disabled={criarAvaliador.isPending || !avdNome || !avdEmail}>
              {criarAvaliador.isPending ? "Salvando..." : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: DETALHE DA AVALIAÇÃO */}
      {/* ============================================================ */}
      <Dialog open={!!showDetalheAvaliacao} onOpenChange={() => setShowDetalheAvaliacao(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" /> Detalhe da Avaliação
            </DialogTitle>
          </DialogHeader>
          {avaliacaoDetalhe.isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Carregando...</p>
          ) : avaliacaoDetalhe.data ? (() => {
            const av = avaliacaoDetalhe.data;
            const media = parseFloat(av.mediaGeral || "0");
            const rec = getRecomendacao(media);
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-bold text-lg">{av.employee?.nomeCompleto || "N/A"}</p>
                    <p className="text-sm text-muted-foreground">{av.employee?.funcao} • {av.employee?.setor}</p>
                    <p className="text-xs text-muted-foreground">
                      Avaliador: {av.evaluatorDisplayName || "N/A"} • Ref: {av.mesReferencia}
                      {av.obraNome ? ` • Obra: ${av.obraNome}` : ""}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold">{media.toFixed(1)}</p>
                    <Badge className={rec.cor + " border"}>{rec.texto}</Badge>
                  </div>
                </div>

                {PILARES.map((pilar) => (
                  <Card key={pilar.nome}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <pilar.icon className="w-4 h-4" /> {pilar.nome}
                        <Badge variant="outline" className="ml-auto">
                          {pilar.nome === "Postura e Disciplina" ? parseFloat(av.mediaPilar1 || "0").toFixed(1) :
                           pilar.nome === "Desempenho Técnico" ? parseFloat(av.mediaPilar2 || "0").toFixed(1) :
                           parseFloat(av.mediaPilar3 || "0").toFixed(1)}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2">
                        {pilar.criterios.map((c) => {
                          const nota = Number((av as any)[c.key] || 0);
                          const nl = NOTAS_LABELS[nota] || NOTAS_LABELS[1];
                          return (
                            <div key={c.key} className="flex items-center justify-between p-2 rounded border">
                              <span className="text-sm">{c.label}</span>
                              <span className={`font-bold ${nl.cor}`}>{nota} - {nl.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {av.observacoes && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Observações</CardTitle></CardHeader>
                    <CardContent><p className="text-sm">{av.observacoes}</p></CardContent>
                  </Card>
                )}

                <div className="flex gap-4 text-xs text-muted-foreground">
                  {av.durationSeconds && <span>Tempo: {Math.floor(av.durationSeconds / 60)}min {av.durationSeconds % 60}s</span>}
                  {av.deviceType && <span>Dispositivo: {av.deviceType}</span>}
                  <span>Criada em: {new Date(av.createdAt).toLocaleDateString("pt-BR")}</span>
                </div>
              </div>
            );
          })() : <p className="text-center py-4 text-muted-foreground">Avaliação não encontrada</p>}
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: RESUMO IA */}
      {/* ============================================================ */}
      <Dialog open={showAiSummary} onOpenChange={setShowAiSummary}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" /> Resumo IA da Avaliação
            </DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap">{aiSummary}</div>
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
            <DialogDescription>Crie uma pesquisa e a IA sugere perguntas baseadas no tema</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título da Pesquisa *</Label>
              <Input value={pesquisaTitulo} onChange={(e) => setPesquisaTitulo(e.target.value)} placeholder="Ex: Satisfação do Cliente - Obra Residencial" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={pesquisaDescricao} onChange={(e) => setPesquisaDescricao(e.target.value)} placeholder="Descreva o objetivo da pesquisa..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select value={pesquisaTipo} onValueChange={(v: any) => setPesquisaTipo(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="setor">Por Setor (interno)</SelectItem>
                    <SelectItem value="cliente">Para Clientes (externo)</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={pesquisaAnonima} onCheckedChange={setPesquisaAnonima} />
                <Label>Pesquisa anônima</Label>
              </div>
            </div>

            <Separator />

            {/* Botão IA */}
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Perguntas</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => suggestQuestions.mutate({ tema: pesquisaTitulo || "satisfação geral", tipo: pesquisaTipo })}
                disabled={suggestQuestions.isPending}
              >
                {suggestQuestions.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</> : <><Sparkles className="w-4 h-4 mr-2" /> IA Sugerir Perguntas</>}
              </Button>
            </div>

            {/* Lista de perguntas */}
            {pesquisaPerguntas.length > 0 ? (
              <div className="space-y-2">
                {pesquisaPerguntas.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
                    <span className="text-xs font-mono text-muted-foreground mt-1">{i + 1}</span>
                    <div className="flex-1">
                      <Input
                        value={p.texto}
                        onChange={(e) => {
                          const updated = [...pesquisaPerguntas];
                          updated[i].texto = e.target.value;
                          setPesquisaPerguntas(updated);
                        }}
                        className="mb-1"
                      />
                      <div className="flex gap-2">
                        <Select value={p.tipo} onValueChange={(v: any) => {
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
                          <Switch
                            checked={p.obrigatoria}
                            onCheckedChange={(v) => {
                              const updated = [...pesquisaPerguntas];
                              updated[i].obrigatoria = v;
                              setPesquisaPerguntas(updated);
                            }}
                          />
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
              <p className="text-center py-4 text-muted-foreground text-sm">
                Clique em "IA Sugerir Perguntas" ou adicione manualmente
              </p>
            )}

            <Button variant="outline" size="sm" onClick={() => setPesquisaPerguntas([...pesquisaPerguntas, { texto: "", tipo: "nota", obrigatoria: true }])}>
              <Plus className="w-4 h-4 mr-2" /> Adicionar Pergunta
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNovaPesquisa(false); resetFormPesquisa(); }}>Cancelar</Button>
            <Button
              onClick={() => criarPesquisa.mutate({
                companyId,
                titulo: pesquisaTitulo,
                descricao: pesquisaDescricao || undefined,
                tipo: pesquisaTipo,
                anonimo: pesquisaAnonima,
                questions: pesquisaPerguntas.map((p, i) => ({ texto: p.texto, tipo: p.tipo, ordem: i + 1, obrigatoria: p.obrigatoria })),
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
            <DialogDescription>Pesquisa anônima para medir a satisfação da equipe. A IA sugere perguntas por categoria.</DialogDescription>
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

            {/* Categorias de clima */}
            <div className="flex flex-wrap gap-2 mb-2">
              {Object.entries(CLIMA_CATEGORIAS).map(([key, cat]) => {
                const count = climaPerguntas.filter(p => p.categoria === key).length;
                return (
                  <Badge key={key} variant={count > 0 ? "default" : "outline"} className="gap-1">
                    <cat.icon className="w-3 h-3" /> {cat.label} ({count})
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
                        <Input
                          value={p.texto}
                          onChange={(e) => {
                            const updated = [...climaPerguntas];
                            updated[i].texto = e.target.value;
                            setClimaPerguntas(updated);
                          }}
                          className="mb-1"
                        />
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
              <p className="text-center py-4 text-muted-foreground text-sm">
                Clique em "IA Sugerir Perguntas" para gerar perguntas automaticamente
              </p>
            )}

            <Button variant="outline" size="sm" onClick={() => setClimaPerguntas([...climaPerguntas, { texto: "", categoria: "empresa", tipo: "nota" }])}>
              <Plus className="w-4 h-4 mr-2" /> Adicionar Pergunta
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNovoClima(false); resetFormClima(); }}>Cancelar</Button>
            <Button
              onClick={() => criarClima.mutate({
                companyId,
                titulo: climaTitulo,
                descricao: climaDescricao || undefined,
                questions: climaPerguntas.map((p, i) => ({
                  texto: p.texto,
                  categoria: p.categoria as any,
                  tipo: p.tipo,
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
      {/* DIALOG: LINK PÚBLICO DA PESQUISA */}
      {/* ============================================================ */}
      <Dialog open={!!showPesquisaLink} onOpenChange={() => setShowPesquisaLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" /> Link Público da Pesquisa
            </DialogTitle>
            <DialogDescription>Compartilhe este link para que pessoas respondam a pesquisa</DialogDescription>
          </DialogHeader>
          {showPesquisaLink && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Input value={getPublicLink(showPesquisaLink.token, "pesquisa")} readOnly className="text-xs" />
                <Button size="sm" onClick={() => copyToClipboard(getPublicLink(showPesquisaLink.token, "pesquisa"))}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Qualquer pessoa com este link poderá responder a pesquisa enquanto ela estiver ativa.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG: LINK PÚBLICO DO CLIMA */}
      <Dialog open={!!showClimaLink} onOpenChange={() => setShowClimaLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" /> Link Público - Pesquisa de Clima
            </DialogTitle>
            <DialogDescription>Compartilhe este link com os funcionários para responderem anonimamente</DialogDescription>
          </DialogHeader>
          {showClimaLink && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Input value={getPublicLink(showClimaLink.token, "clima")} readOnly className="text-xs" />
                <Button size="sm" onClick={() => copyToClipboard(getPublicLink(showClimaLink.token, "clima"))}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                As respostas são anônimas. Cada CPF pode responder apenas uma vez.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: RESULTADOS DA PESQUISA CUSTOMIZADA */}
      {/* ============================================================ */}
      <Dialog open={!!showPesquisaResultados} onOpenChange={() => setShowPesquisaResultados(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" /> Resultados da Pesquisa
            </DialogTitle>
          </DialogHeader>
          {pesquisaResultados.isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Carregando resultados...</p>
          ) : pesquisaResultados.data ? (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold">{pesquisaResultados.data.totalRespondentes}</p>
                <p className="text-sm text-muted-foreground">Total de Respondentes</p>
              </div>
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
      {/* DIALOG: RESULTADOS DO CLIMA ORGANIZACIONAL */}
      {/* ============================================================ */}
      <Dialog open={!!showClimaResultados} onOpenChange={() => setShowClimaResultados(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" /> Resultados - Clima Organizacional
            </DialogTitle>
          </DialogHeader>
          {climaResultados.isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Carregando resultados...</p>
          ) : climaResultados.data ? (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold">{climaResultados.data.totalRespondentes}</p>
                <p className="text-sm text-muted-foreground">Total de Respondentes</p>
              </div>

              {Object.entries(climaResultados.data.byCategory).map(([catKey, questions]: [string, any]) => {
                const cat = CLIMA_CATEGORIAS[catKey] || { label: catKey, icon: HelpCircle, cor: "text-gray-600" };
                const notaQuestions = questions.filter((q: any) => q.question.tipo === "nota");
                const avgCategoria = notaQuestions.length > 0
                  ? notaQuestions.reduce((sum: number, q: any) => sum + q.avgNota, 0) / notaQuestions.length
                  : 0;
                return (
                  <Card key={catKey}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <cat.icon className={`w-4 h-4 ${cat.cor}`} /> {cat.label}
                        {avgCategoria > 0 && (
                          <Badge variant="outline" className="ml-auto">{avgCategoria.toFixed(1)}/5</Badge>
                        )}
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
                              <span className="text-xs text-muted-foreground">({r.totalRespostas})</span>
                            </div>
                          ) : r.question.tipo === "sim_nao" ? (
                            <div className="flex gap-4">
                              {(() => {
                                const sim = r.answers.filter((a: any) => a.valor?.toLowerCase() === "sim").length;
                                const nao = r.answers.filter((a: any) => a.valor?.toLowerCase() === "nao" || a.valor?.toLowerCase() === "não").length;
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
                              {r.answers.length > 3 && <p className="text-xs text-muted-foreground">+{r.answers.length - 3} respostas</p>}
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
            <p className="text-center py-4 text-muted-foreground">Nenhum resultado disponível</p>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
