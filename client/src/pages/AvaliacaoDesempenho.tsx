import { useState, useRef, useMemo } from "react";
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
import { toast } from "sonner";
import {
  Star, Plus, Trash2, Edit, Eye, CheckCircle, Clock, Users, Trophy,
  FileText, BarChart3, Lock, AlertTriangle, ArrowUp, ArrowDown,
  ClipboardList, UserCheck, Timer, TrendingUp, TrendingDown,
  Brain, Search, ChevronDown, ChevronUp, Sparkles, Shield, Wrench, Heart
} from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";

// ============================================================
// CONSTANTES DO SISTEMA ORIGINAL
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

export default function AvaliacaoDesempenho() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const [activeTab, setActiveTab] = useState("painel");

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

  // Buscar funcionários da empresa para o formulário
  const employeesList = trpc.employees.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  // ============================================================
  // STATES
  // ============================================================
  const [showNovaAvaliacao, setShowNovaAvaliacao] = useState(false);
  const [showNovoAvaliador, setShowNovoAvaliador] = useState(false);
  const [showDetalheAvaliacao, setShowDetalheAvaliacao] = useState<number | null>(null);
  const [showAiSummary, setShowAiSummary] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Form nova avaliação - 12 critérios
  const [avEmployeeId, setAvEmployeeId] = useState<number>(0);
  const [avEvaluatorId, setAvEvaluatorId] = useState<number>(0);
  const [avMesRef, setAvMesRef] = useState(new Date().toISOString().slice(0, 7));
  const [avObs, setAvObs] = useState("");
  const [notas, setNotas] = useState<Record<string, number>>({
    comportamento: 0, pontualidade: 0, assiduidade: 0, segurancaEpis: 0,
    qualidadeAcabamento: 0, produtividadeRitmo: 0, cuidadoFerramentas: 0, economiaMateriais: 0,
    trabalhoEquipe: 0, iniciativaProatividade: 0, disponibilidadeFlexibilidade: 0, organizacaoLimpeza: 0,
  });
  const avaliacaoStartTime = useRef<number>(0);

  // Form novo avaliador
  const [avdNome, setAvdNome] = useState("");
  const [avdEmail, setAvdEmail] = useState("");
  const [avdFrequencia, setAvdFrequencia] = useState("monthly");

  // ============================================================
  // MUTATIONS
  // ============================================================
  const utils = trpc.useUtils();

  const criarAvaliacao = trpc.avaliacao.avaliacoes.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Avaliação criada! Média: ${data.mediaGeral} - ${data.recomendacao}`);
      utils.avaliacao.avaliacoes.list.invalidate();
      utils.avaliacao.dashboard.globalStats.invalidate();
      utils.avaliacao.dashboard.employeeRanking.invalidate();
      setShowNovaAvaliacao(false);
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

  // ============================================================
  // HELPERS
  // ============================================================
  function resetFormAvaliacao() {
    setAvEmployeeId(0); setAvEvaluatorId(0); setAvObs("");
    setAvMesRef(new Date().toISOString().slice(0, 7));
    setNotas({
      comportamento: 0, pontualidade: 0, assiduidade: 0, segurancaEpis: 0,
      qualidadeAcabamento: 0, produtividadeRitmo: 0, cuidadoFerramentas: 0, economiaMateriais: 0,
      trabalhoEquipe: 0, iniciativaProatividade: 0, disponibilidadeFlexibilidade: 0, organizacaoLimpeza: 0,
    });
  }

  function handleSubmitAvaliacao() {
    if (!avEmployeeId || !avEvaluatorId) {
      toast.error("Selecione o funcionário e o avaliador");
      return;
    }
    const todasPreenchidas = Object.values(notas).every(n => n >= 1 && n <= 5);
    if (!todasPreenchidas) {
      toast.error("Preencha todas as 12 notas (1 a 5)");
      return;
    }
    const duration = avaliacaoStartTime.current > 0 ? Math.round((Date.now() - avaliacaoStartTime.current) / 1000) : undefined;
    criarAvaliacao.mutate({
      companyId,
      employeeId: avEmployeeId,
      evaluatorId: avEvaluatorId,
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
      a.recomendacao?.toLowerCase().includes(term)
    );
  }, [avaliacoes.data, searchTerm]);

  // Detalhe da avaliação selecionada
  const avaliacaoDetalhe = trpc.avaliacao.avaliacoes.getById.useQuery(
    { id: showDetalheAvaliacao! },
    { enabled: !!showDetalheAvaliacao }
  );

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
          <div className="flex gap-2">
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
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="painel"><BarChart3 className="w-4 h-4 mr-1" /> Painel</TabsTrigger>
            <TabsTrigger value="avaliacoes"><ClipboardList className="w-4 h-4 mr-1" /> Avaliações</TabsTrigger>
            <TabsTrigger value="ranking"><Trophy className="w-4 h-4 mr-1" /> Ranking</TabsTrigger>
            <TabsTrigger value="avaliadores"><Users className="w-4 h-4 mr-1" /> Avaliadores</TabsTrigger>
            <TabsTrigger value="pesquisas"><FileText className="w-4 h-4 mr-1" /> Pesquisas</TabsTrigger>
          </TabsList>

          {/* ============ TAB PAINEL ============ */}
          <TabsContent value="painel" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 rounded-lg"><ClipboardList className="w-6 h-6 text-blue-600" /></div>
                    <div>
                      <p className="text-2xl font-bold">{dashboardStats.data?.totalAvaliacoes || 0}</p>
                      <p className="text-sm text-muted-foreground">Total Avaliações</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-green-100 rounded-lg"><Users className="w-6 h-6 text-green-600" /></div>
                    <div>
                      <p className="text-2xl font-bold">{dashboardStats.data?.totalAvaliadores || 0}</p>
                      <p className="text-sm text-muted-foreground">Avaliadores</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-100 rounded-lg"><Star className="w-6 h-6 text-amber-600" /></div>
                    <div>
                      <p className="text-2xl font-bold">{dashboardStats.data?.mediaGeral?.toFixed(1) || "0.0"}</p>
                      <p className="text-sm text-muted-foreground">Média Geral</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-100 rounded-lg"><TrendingUp className="w-6 h-6 text-purple-600" /></div>
                    <div>
                      <p className="text-2xl font-bold">{dashboardStats.data?.porMes?.length || 0}</p>
                      <p className="text-sm text-muted-foreground">Meses Avaliados</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Distribuição por Recomendação */}
            {dashboardStats.data?.porRecomendacao && dashboardStats.data.porRecomendacao.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-lg">Distribuição por Recomendação</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {dashboardStats.data.porRecomendacao.map((r: any) => {
                      const rec = getRecomendacao(r.recomendacao?.includes("DEMISSÃO") ? 1 : r.recomendacao?.includes("ATENÇÃO") ? 2.5 : r.recomendacao?.includes("TREINAMENTO") ? 3.5 : 4.5);
                      return (
                        <div key={r.recomendacao} className={`p-3 rounded-lg border ${rec.cor}`}>
                          <p className="text-xl font-bold">{r.count}</p>
                          <p className="text-xs">{r.recomendacao}</p>
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
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar por funcionário, avaliador ou recomendação..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
              <Badge variant="outline">{avaliacoesFiltradas.length} avaliações</Badge>
            </div>

            {avaliacoes.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando avaliações...</div>
            ) : avaliacoesFiltradas.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">Nenhuma avaliação encontrada</p>
                  <p className="text-muted-foreground">Clique em "Nova Avaliação" para começar</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {avaliacoesFiltradas.map((av: any) => {
                  const media = parseFloat(av.mediaGeral || "0");
                  const rec = getRecomendacao(media);
                  return (
                    <Card key={av.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col items-center">
                              <span className="text-2xl font-bold">{media.toFixed(1)}</span>
                              <div className="flex gap-0.5">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <Star key={s} className={`w-3 h-3 ${s <= Math.round(media) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="font-semibold">{av.employeeName}</p>
                              <p className="text-sm text-muted-foreground">{av.employeeFuncao} {av.employeeSetor ? `• ${av.employeeSetor}` : ""}</p>
                              <p className="text-xs text-muted-foreground">Avaliador: {av.evaluatorName} • {av.mesReferencia}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={rec.cor + " border"}>{rec.texto}</Badge>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setShowDetalheAvaliacao(av.id)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => gerarResumoIA.mutate({ id: av.id })} disabled={gerarResumoIA.isPending}>
                                <Brain className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => { if (confirm("Excluir esta avaliação?")) deleteAvaliacao.mutate({ id: av.id }); }}>
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        {/* Mini barras dos 3 pilares */}
                        <div className="flex gap-4 mt-3">
                          {[
                            { label: "Postura", valor: av.mediaPilar1, cor: "bg-blue-500" },
                            { label: "Técnico", valor: av.mediaPilar2, cor: "bg-amber-500" },
                            { label: "Atitude", valor: av.mediaPilar3, cor: "bg-green-500" },
                          ].map((p) => (
                            <div key={p.label} className="flex-1">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-foreground">{p.label}</span>
                                <span className="font-medium">{parseFloat(p.valor || "0").toFixed(1)}</span>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full ${p.cor} rounded-full`} style={{ width: `${(parseFloat(p.valor || "0") / 5) * 100}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ============ TAB RANKING ============ */}
          <TabsContent value="ranking" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Ranking de Funcionários</CardTitle>
                <CardDescription>Classificação por média geral de todas as avaliações</CardDescription>
              </CardHeader>
              <CardContent>
                {employeeRanking.isLoading ? (
                  <p className="text-center py-8 text-muted-foreground">Carregando ranking...</p>
                ) : !employeeRanking.data?.length ? (
                  <p className="text-center py-8 text-muted-foreground">Nenhuma avaliação finalizada ainda</p>
                ) : (
                  <div className="space-y-2">
                    {employeeRanking.data.map((r: any, i: number) => (
                      <div key={r.employeeId} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-gray-100 text-gray-700" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"
                        }`}>
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{r.employeeName}</p>
                          <p className="text-sm text-muted-foreground">{r.employeeFuncao} {r.employeeSetor ? `• ${r.employeeSetor}` : ""}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">{r.mediaGeral.toFixed(1)}</p>
                          <Badge className={r.corRecomendacao ? "" : ""} style={{ backgroundColor: r.corRecomendacao + "20", color: r.corRecomendacao, borderColor: r.corRecomendacao }} variant="outline">
                            {r.recomendacao}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">{r.totalAvaliacoes} aval.</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ranking de Avaliadores */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Timer className="w-5 h-5 text-blue-500" /> Desempenho dos Avaliadores</CardTitle>
              </CardHeader>
              <CardContent>
                {evaluatorStats.isLoading ? (
                  <p className="text-center py-4 text-muted-foreground">Carregando...</p>
                ) : !evaluatorStats.data?.length ? (
                  <p className="text-center py-4 text-muted-foreground">Nenhum dado disponível</p>
                ) : (
                  <div className="space-y-2">
                    {evaluatorStats.data.map((e: any) => (
                      <div key={e.evaluatorId} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50">
                        <div>
                          <p className="font-medium">{e.evaluatorName}</p>
                          <p className="text-sm text-muted-foreground">{e.totalAvaliacoes} avaliações realizadas</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">Tempo médio: <span className="font-bold">{e.avgDuration > 0 ? `${Math.floor(e.avgDuration / 60)}min ${e.avgDuration % 60}s` : "N/A"}</span></p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ TAB AVALIADORES ============ */}
          <TabsContent value="avaliadores" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Avaliadores Cadastrados</h3>
              <Button onClick={() => setShowNovoAvaliador(true)}><Plus className="w-4 h-4 mr-2" /> Novo Avaliador</Button>
            </div>
            {avaliadores.isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Carregando...</p>
            ) : !avaliadores.data?.length ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <UserCheck className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">Nenhum avaliador cadastrado</p>
                  <p className="text-muted-foreground">Cadastre avaliadores para iniciar as avaliações</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {avaliadores.data.map((a: any) => (
                  <Card key={a.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">{a.nome}</p>
                          <p className="text-sm text-muted-foreground">{a.email}</p>
                          <div className="flex gap-2 mt-2">
                            <Badge variant={a.status === "ativo" ? "default" : "secondary"}>{a.status}</Badge>
                            <Badge variant="outline">{a.evaluationFrequency}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">{a.totalAvaliacoes} avaliações realizadas</p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button variant="ghost" size="sm" onClick={() => toggleAvaliador.mutate({ id: a.id })}>
                            {a.status === "ativo" ? <Lock className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => resetSenha.mutate({ id: a.id })}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm("Excluir avaliador?")) deleteAvaliador.mutate({ id: a.id }); }}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ============ TAB PESQUISAS ============ */}
          <TabsContent value="pesquisas" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pesquisas Customizadas */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" /> Pesquisas Customizadas</CardTitle>
                  <CardDescription>Pesquisas de satisfação por setor, cliente ou outro</CardDescription>
                </CardHeader>
                <CardContent>
                  {pesquisas.isLoading ? (
                    <p className="text-muted-foreground">Carregando...</p>
                  ) : !pesquisas.data?.length ? (
                    <p className="text-muted-foreground text-center py-4">Nenhuma pesquisa criada</p>
                  ) : (
                    <div className="space-y-2">
                      {pesquisas.data.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{p.titulo}</p>
                            <p className="text-xs text-muted-foreground">{p.tipo} • {p.totalRespostas} respostas</p>
                          </div>
                          <Badge variant={p.status === "ativa" ? "default" : "secondary"}>{p.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pesquisa de Clima */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Heart className="w-5 h-5 text-red-500" /> Pesquisa de Clima</CardTitle>
                  <CardDescription>Pesquisa de clima organizacional anônima</CardDescription>
                </CardHeader>
                <CardContent>
                  {climaSurveys.isLoading ? (
                    <p className="text-muted-foreground">Carregando...</p>
                  ) : !climaSurveys.data?.length ? (
                    <p className="text-muted-foreground text-center py-4">Nenhuma pesquisa de clima criada</p>
                  ) : (
                    <div className="space-y-2">
                      {climaSurveys.data.map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{c.titulo}</p>
                            <p className="text-xs text-muted-foreground">{c.totalRespostas} respostas</p>
                          </div>
                          <Badge variant={c.status === "ativa" ? "default" : "secondary"}>{c.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ============================================================ */}
      {/* DIALOG: NOVA AVALIAÇÃO (12 critérios / 3 pilares) */}
      {/* ============================================================ */}
      <Dialog open={showNovaAvaliacao} onOpenChange={setShowNovaAvaliacao}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" /> Nova Avaliação de Desempenho
            </DialogTitle>
            <DialogDescription>Avalie o funcionário nos 12 critérios (notas de 1 a 5)</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Seleção de funcionário e avaliador */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Funcionário *</Label>
                <Select value={avEmployeeId ? String(avEmployeeId) : undefined} onValueChange={(v) => setAvEmployeeId(Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(employeesList.data || []).map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Avaliador *</Label>
                <Select value={avEvaluatorId ? String(avEvaluatorId) : undefined} onValueChange={(v) => setAvEvaluatorId(Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(avaliadores.data || []).filter((a: any) => a.status === "ativo").map((a: any) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mês Referência</Label>
                <Input type="month" value={avMesRef} onChange={(e) => setAvMesRef(e.target.value)} />
              </div>
            </div>

            {/* 3 Pilares com 4 critérios cada */}
            {PILARES.map((pilar) => {
              const PilarIcon = pilar.icon;
              const mediaPilar = pilar.criterios.reduce((acc, c) => acc + (notas[c.key] || 0), 0) / 4;
              return (
                <Card key={pilar.nome} className={`border-l-4 ${pilar.cor === "blue" ? "border-l-blue-500" : pilar.cor === "amber" ? "border-l-amber-500" : "border-l-green-500"}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <PilarIcon className="w-5 h-5" /> {pilar.nome}
                      </span>
                      {mediaPilar > 0 && (
                        <Badge variant="outline" className="text-sm">
                          Média: {mediaPilar.toFixed(1)}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
              );
            })}

            {/* Resumo */}
            {Object.values(notas).some(n => n > 0) && (() => {
              const p1 = (notas.comportamento + notas.pontualidade + notas.assiduidade + notas.segurancaEpis) / 4;
              const p2 = (notas.qualidadeAcabamento + notas.produtividadeRitmo + notas.cuidadoFerramentas + notas.economiaMateriais) / 4;
              const p3 = (notas.trabalhoEquipe + notas.iniciativaProatividade + notas.disponibilidadeFlexibilidade + notas.organizacaoLimpeza) / 4;
              const mg = (p1 + p2 + p3) / 3;
              const allFilled = Object.values(notas).every(n => n >= 1);
              const rec = allFilled ? getRecomendacao(mg) : null;
              return (
                <Card className="bg-muted/50">
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Postura</p>
                        <p className="text-xl font-bold text-blue-600">{p1 > 0 ? p1.toFixed(1) : "-"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Técnico</p>
                        <p className="text-xl font-bold text-amber-600">{p2 > 0 ? p2.toFixed(1) : "-"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Atitude</p>
                        <p className="text-xl font-bold text-green-600">{p3 > 0 ? p3.toFixed(1) : "-"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Média Geral</p>
                        <p className="text-2xl font-bold">{allFilled ? mg.toFixed(1) : "-"}</p>
                      </div>
                    </div>
                    {rec && (
                      <div className={`mt-4 p-3 rounded-lg text-center font-bold border ${rec.cor}`}>
                        {rec.texto}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* Observações */}
            <div>
              <Label>Observações (opcional)</Label>
              <Textarea value={avObs} onChange={(e) => setAvObs(e.target.value)} placeholder="Observações adicionais sobre o funcionário..." rows={3} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNovaAvaliacao(false); resetFormAvaliacao(); }}>Cancelar</Button>
            <Button onClick={handleSubmitAvaliacao} disabled={criarAvaliacao.isPending}>
              {criarAvaliacao.isPending ? "Salvando..." : "Finalizar Avaliação"}
            </Button>
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
                {/* Cabeçalho */}
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-bold text-lg">{av.employee?.nomeCompleto || "N/A"}</p>
                    <p className="text-sm text-muted-foreground">{av.employee?.funcao} • {av.employee?.setor}</p>
                    <p className="text-xs text-muted-foreground">Avaliador: {av.evaluator?.nome || "N/A"} • Ref: {av.mesReferencia}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold">{media.toFixed(1)}</p>
                    <Badge className={rec.cor + " border"}>{rec.texto}</Badge>
                  </div>
                </div>

                {/* Notas por pilar */}
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

                {/* Observações */}
                {av.observacoes && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Observações</CardTitle></CardHeader>
                    <CardContent><p className="text-sm">{av.observacoes}</p></CardContent>
                  </Card>
                )}

                {/* Tempo e dispositivo */}
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
    </DashboardLayout>
  );
}
