import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
  FileText, BarChart3, Play, Lock, ChevronRight, AlertTriangle, ArrowUp, ArrowDown,
  ClipboardList, Settings, UserCheck, Calendar, Timer, TrendingUp, TrendingDown
} from "lucide-react";

// Empresa selecionada do localStorage
function getSelectedCompanyId(): number {
  try {
    const v = localStorage.getItem("selectedCompanyId");
    return v ? parseInt(v) : 0;
  } catch { return 0; }
}

export default function AvaliacaoDesempenho() {
  const { user } = useAuth();
  // toast importado de sonner
  const companyId = getSelectedCompanyId();
  const [activeTab, setActiveTab] = useState("painel");

  // ============================================================
  // QUERIES
  // ============================================================
  const questionarios = trpc.avaliacao.questionarios.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const ciclos = trpc.avaliacao.ciclos.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const ranking = trpc.avaliacao.ranking.useQuery(
    { companyId, limit: 10 },
    { enabled: companyId > 0 }
  );
  const statsAvaliador = trpc.avaliacao.statsAvaliador.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  // ============================================================
  // STATES
  // ============================================================
  const [showQuestionarioDialog, setShowQuestionarioDialog] = useState(false);
  const [showCicloDialog, setShowCicloDialog] = useState(false);
  const [showAvaliacaoDialog, setShowAvaliacaoDialog] = useState(false);
  const [showCicloDetalhe, setShowCicloDetalhe] = useState<number | null>(null);
  const [editingQuestionario, setEditingQuestionario] = useState<any>(null);

  // Form questionário
  const [qTitulo, setQTitulo] = useState("");
  const [qDescricao, setQDescricao] = useState("");
  const [qFrequencia, setQFrequencia] = useState("mensal");
  const [qPerguntas, setQPerguntas] = useState<{ texto: string; tipo: string; peso: number }[]>([
    { texto: "", tipo: "nota_1_5", peso: 1 },
  ]);

  // Form ciclo
  const [cTitulo, setCTitulo] = useState("");
  const [cQuestionarioId, setCQuestionarioId] = useState<number>(0);
  const [cDataInicio, setCDataInicio] = useState("");
  const [cDataFim, setCDataFim] = useState("");

  // Avaliação em andamento
  const [avaliacaoAtual, setAvaliacaoAtual] = useState<any>(null);
  const [respostas, setRespostas] = useState<Record<number, { valor: string; textoLivre: string }>>({});
  const [obsAvaliacao, setObsAvaliacao] = useState("");
  const avaliacaoStartTime = useRef<number>(0);

  // ============================================================
  // MUTATIONS
  // ============================================================
  const utils = trpc.useUtils();

  const createQuestionario = trpc.avaliacao.questionarios.create.useMutation({
    onSuccess: () => {
      toast.success("Questionário criado com sucesso!");
      utils.avaliacao.questionarios.list.invalidate();
      setShowQuestionarioDialog(false);
      resetQuestionarioForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateQuestionario = trpc.avaliacao.questionarios.update.useMutation({
    onSuccess: () => {
      toast.success("Questionário atualizado!");
      utils.avaliacao.questionarios.list.invalidate();
      setShowQuestionarioDialog(false);
      resetQuestionarioForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteQuestionario = trpc.avaliacao.questionarios.delete.useMutation({
    onSuccess: () => {
      toast.success("Questionário excluído!");
      utils.avaliacao.questionarios.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const createCiclo = trpc.avaliacao.ciclos.create.useMutation({
    onSuccess: () => {
      toast.success("Ciclo criado com sucesso!");
      utils.avaliacao.ciclos.list.invalidate();
      setShowCicloDialog(false);
      resetCicloForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateCicloStatus = trpc.avaliacao.ciclos.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Status do ciclo atualizado!");
      utils.avaliacao.ciclos.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCiclo = trpc.avaliacao.ciclos.delete.useMutation({
    onSuccess: () => {
      toast.success("Ciclo excluído!");
      utils.avaliacao.ciclos.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const salvarRespostas = trpc.avaliacao.avaliacoes.salvarRespostas.useMutation({
    onSuccess: () => {
      toast.success("Respostas salvas!");
    },
    onError: (e) => toast.error(e.message),
  });

  const finalizarAvaliacao = trpc.avaliacao.avaliacoes.finalizar.useMutation({
    onSuccess: (data) => {
      toast.success(`Avaliação finalizada! Nota: ${data.notaFinal}`);
      setShowAvaliacaoDialog(false);
      setAvaliacaoAtual(null);
      utils.avaliacao.ciclos.list.invalidate();
      utils.avaliacao.ranking.invalidate();
      utils.avaliacao.statsAvaliador.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // ============================================================
  // HELPERS
  // ============================================================
  function resetQuestionarioForm() {
    setQTitulo("");
    setQDescricao("");
    setQFrequencia("mensal");
    setQPerguntas([{ texto: "", tipo: "nota_1_5", peso: 1 }]);
    setEditingQuestionario(null);
  }

  function resetCicloForm() {
    setCTitulo("");
    setCQuestionarioId(0);
    setCDataInicio("");
    setCDataFim("");
  }

  function handleSaveQuestionario() {
    const perguntasValidas = qPerguntas.filter(p => p.texto.trim());
    if (!qTitulo.trim()) return toast.error("Informe o título");
    if (perguntasValidas.length === 0) return toast.error("Adicione pelo menos 1 pergunta");

    if (editingQuestionario) {
      updateQuestionario.mutate({
        id: editingQuestionario.id,
        titulo: qTitulo,
        descricao: qDescricao,
        frequencia: qFrequencia as any,
        perguntas: perguntasValidas.map(p => ({
          texto: p.texto,
          tipo: p.tipo as any,
          peso: p.peso,
        })),
      });
    } else {
      createQuestionario.mutate({
        companyId,
        titulo: qTitulo,
        descricao: qDescricao,
        frequencia: qFrequencia as any,
        perguntas: perguntasValidas.map(p => ({
          texto: p.texto,
          tipo: p.tipo as any,
          peso: p.peso,
        })),
      });
    }
  }

  function handleSaveCiclo() {
    if (!cTitulo.trim()) return toast.error("Informe o título");
    if (!cQuestionarioId) return toast.error("Selecione um questionário");
    if (!cDataInicio || !cDataFim) return toast.error("Informe as datas");

    createCiclo.mutate({
      companyId,
      questionarioId: cQuestionarioId,
      titulo: cTitulo,
      dataInicio: cDataInicio,
      dataFim: cDataFim,
    });
  }

  function abrirAvaliacao(avaliacao: any) {
    setAvaliacaoAtual(avaliacao);
    setRespostas({});
    setObsAvaliacao("");
    avaliacaoStartTime.current = Date.now();
    setShowAvaliacaoDialog(true);
  }

  function handleFinalizarAvaliacao() {
    if (!avaliacaoAtual) return;
    const tempoSeg = Math.round((Date.now() - avaliacaoStartTime.current) / 1000);
    const respostasArr = Object.entries(respostas).map(([perguntaId, r]) => ({
      perguntaId: parseInt(perguntaId),
      valor: r.valor,
      textoLivre: r.textoLivre,
    }));

    finalizarAvaliacao.mutate({
      avaliacaoId: avaliacaoAtual.id,
      respostas: respostasArr,
      observacoes: obsAvaliacao,
      tempoAvaliacao: tempoSeg,
    });
  }

  function handleSalvarRascunho() {
    if (!avaliacaoAtual) return;
    const respostasArr = Object.entries(respostas).map(([perguntaId, r]) => ({
      perguntaId: parseInt(perguntaId),
      valor: r.valor,
      textoLivre: r.textoLivre,
    }));
    salvarRespostas.mutate({
      avaliacaoId: avaliacaoAtual.id,
      respostas: respostasArr,
      observacoes: obsAvaliacao,
    });
  }

  const frequenciaLabels: Record<string, string> = {
    diaria: "Diária",
    semanal: "Semanal",
    mensal: "Mensal",
    trimestral: "Trimestral",
    semestral: "Semestral",
    anual: "Anual",
  };

  const statusColors: Record<string, string> = {
    rascunho: "bg-gray-500",
    aberto: "bg-green-500",
    fechado: "bg-red-500",
    pendente: "bg-yellow-500",
    em_andamento: "bg-blue-500",
    finalizada: "bg-green-600",
  };

  const statusLabels: Record<string, string> = {
    rascunho: "Rascunho",
    aberto: "Aberto",
    fechado: "Fechado",
    pendente: "Pendente",
    em_andamento: "Em Andamento",
    finalizada: "Finalizada",
  };

  if (!companyId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Selecione uma empresa para acessar as avaliações.</p>
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="h-6 w-6 text-yellow-500" />
            Avaliação de Desempenho
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie questionários, ciclos de avaliação e acompanhe o ranking dos colaboradores
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="painel" className="flex items-center gap-1">
            <BarChart3 className="h-4 w-4" /> Painel
          </TabsTrigger>
          <TabsTrigger value="questionarios" className="flex items-center gap-1">
            <ClipboardList className="h-4 w-4" /> Questionários
          </TabsTrigger>
          <TabsTrigger value="ciclos" className="flex items-center gap-1">
            <Calendar className="h-4 w-4" /> Ciclos
          </TabsTrigger>
          <TabsTrigger value="ranking" className="flex items-center gap-1">
            <Trophy className="h-4 w-4" /> Ranking
          </TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/* TAB: PAINEL */}
        {/* ============================================================ */}
        <TabsContent value="painel" className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <ClipboardList className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Questionários</p>
                    <p className="text-2xl font-bold">{questionarios.data?.length || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Calendar className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ciclos Ativos</p>
                    <p className="text-2xl font-bold">
                      {ciclos.data?.filter(c => c.status === "aberto").length || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/10">
                    <UserCheck className="h-5 w-5 text-yellow-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Suas Pendentes</p>
                    <p className="text-2xl font-bold">{statsAvaliador.data?.pendentes || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Timer className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tempo Médio</p>
                    <p className="text-2xl font-bold">
                      {statsAvaliador.data?.tempoMedio
                        ? `${Math.floor(statsAvaliador.data.tempoMedio / 60)}min`
                        : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ciclos abertos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Play className="h-5 w-5 text-green-500" />
                Ciclos Abertos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ciclos.data?.filter(c => c.status === "aberto").length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum ciclo de avaliação aberto no momento.
                </p>
              ) : (
                <div className="space-y-3">
                  {ciclos.data?.filter(c => c.status === "aberto").map(ciclo => (
                    <div key={ciclo.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div>
                        <p className="font-medium">{ciclo.titulo}</p>
                        <p className="text-sm text-muted-foreground">
                          {ciclo.questionarioTitulo} | {ciclo.dataInicio} a {ciclo.dataFim}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {ciclo.stats.finalizadas}/{ciclo.stats.total} avaliações
                          </p>
                          <div className="w-32 h-2 bg-muted rounded-full mt-1">
                            <div
                              className="h-2 bg-green-500 rounded-full transition-all"
                              style={{ width: `${ciclo.stats.total > 0 ? (ciclo.stats.finalizadas / ciclo.stats.total) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => { setShowCicloDetalhe(ciclo.id); setActiveTab("ciclos"); }}>
                          <Eye className="h-4 w-4 mr-1" /> Ver
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top 5 Ranking rápido */}
          {ranking.data && (ranking.data.melhores.length > 0 || ranking.data.piores.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    Top 5 — Melhores Notas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {ranking.data.melhores.slice(0, 5).map((r, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                        <div className="flex items-center gap-3">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${idx === 0 ? "bg-yellow-500 text-white" : idx === 1 ? "bg-gray-300 text-gray-700" : idx === 2 ? "bg-amber-600 text-white" : "bg-muted text-muted-foreground"}`}>
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-medium text-sm">{r.nome}</p>
                            <p className="text-xs text-muted-foreground">{r.funcao}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          {Number(r.notaFinal).toFixed(1)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-red-500" />
                    Top 5 — Menores Notas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {ranking.data.piores.slice(0, 5).map((r, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold bg-muted text-muted-foreground">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-medium text-sm">{r.nome}</p>
                            <p className="text-xs text-muted-foreground">{r.funcao}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-red-600 border-red-600">
                          {Number(r.notaFinal).toFixed(1)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB: QUESTIONÁRIOS */}
        {/* ============================================================ */}
        <TabsContent value="questionarios" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Questionários de Avaliação</h2>
            <Button onClick={() => { resetQuestionarioForm(); setShowQuestionarioDialog(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Novo Questionário
            </Button>
          </div>

          {questionarios.isLoading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : questionarios.data?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum questionário criado ainda.</p>
                <p className="text-sm text-muted-foreground mt-1">Crie um questionário para iniciar as avaliações.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {questionarios.data?.map(q => (
                <Card key={q.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{q.titulo}</h3>
                          <Badge variant={q.ativo ? "default" : "secondary"}>
                            {q.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                          <Badge variant="outline">{frequenciaLabels[q.frequencia]}</Badge>
                        </div>
                        {q.descricao && <p className="text-sm text-muted-foreground mt-1">{q.descricao}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={async () => {
                          // Carregar detalhes para editar
                          setEditingQuestionario(q);
                          setQTitulo(q.titulo);
                          setQDescricao(q.descricao || "");
                          setQFrequencia(q.frequencia);
                          // Perguntas serão carregadas via getById
                          setShowQuestionarioDialog(true);
                        }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => {
                          if (confirm("Excluir este questionário?")) deleteQuestionario.mutate({ id: q.id });
                        }}>
                          <Trash2 className="h-4 w-4" />
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
        {/* TAB: CICLOS */}
        {/* ============================================================ */}
        <TabsContent value="ciclos" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Ciclos de Avaliação</h2>
            <Button onClick={() => { resetCicloForm(); setShowCicloDialog(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Novo Ciclo
            </Button>
          </div>

          {ciclos.isLoading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : ciclos.data?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum ciclo criado ainda.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {ciclos.data?.map(ciclo => (
                <Card key={ciclo.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{ciclo.titulo}</h3>
                          <Badge className={`${statusColors[ciclo.status]} text-white`}>
                            {statusLabels[ciclo.status]}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Questionário: {ciclo.questionarioTitulo} | Período: {ciclo.dataInicio} a {ciclo.dataFim}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <span className="flex items-center gap-1">
                            <Users className="h-4 w-4" /> {ciclo.stats.total} total
                          </span>
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-4 w-4" /> {ciclo.stats.finalizadas} finalizadas
                          </span>
                          <span className="flex items-center gap-1 text-yellow-600">
                            <Clock className="h-4 w-4" /> {ciclo.stats.pendentes} pendentes
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {ciclo.status === "rascunho" && (
                          <Button size="sm" variant="default" onClick={() => updateCicloStatus.mutate({ id: ciclo.id, status: "aberto" })}>
                            <Play className="h-4 w-4 mr-1" /> Abrir
                          </Button>
                        )}
                        {ciclo.status === "aberto" && (
                          <Button size="sm" variant="outline" onClick={() => updateCicloStatus.mutate({ id: ciclo.id, status: "fechado" })}>
                            <Lock className="h-4 w-4 mr-1" /> Fechar
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setShowCicloDetalhe(showCicloDetalhe === ciclo.id ? null : ciclo.id)}>
                          <Eye className="h-4 w-4 mr-1" /> {showCicloDetalhe === ciclo.id ? "Ocultar" : "Detalhes"}
                        </Button>
                        {ciclo.status === "rascunho" && (
                          <Button size="sm" variant="destructive" onClick={() => {
                            if (confirm("Excluir este ciclo e todas as avaliações vinculadas?")) deleteCiclo.mutate({ id: ciclo.id });
                          }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Detalhe do ciclo: lista de avaliações */}
                    {showCicloDetalhe === ciclo.id && (
                      <CicloDetalhe cicloId={ciclo.id} onAvaliar={abrirAvaliacao} />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============================================================ */}
        {/* TAB: RANKING */}
        {/* ============================================================ */}
        <TabsContent value="ranking" className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" /> Ranking de Desempenho
          </h2>

          {!ranking.data || (ranking.data.melhores.length === 0 && ranking.data.piores.length === 0) ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma avaliação finalizada ainda.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Melhores */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-600">
                    <ArrowUp className="h-5 w-5" /> Melhores Avaliações
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {ranking.data.melhores.map((r, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${idx === 0 ? "bg-yellow-500 text-white" : idx === 1 ? "bg-gray-300 text-gray-800" : idx === 2 ? "bg-amber-600 text-white" : "bg-muted"}`}>
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-medium">{r.nome}</p>
                            <p className="text-xs text-muted-foreground">{r.funcao} | {r.setor}</p>
                            {r.avaliadorNome && <p className="text-xs text-muted-foreground">Avaliador: {r.avaliadorNome}</p>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-green-600">{Number(r.notaFinal).toFixed(1)}</p>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(s => (
                              <Star key={s} className={`h-3 w-3 ${s <= Math.round(Number(r.notaFinal)) ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`} />
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Piores */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-600">
                    <ArrowDown className="h-5 w-5" /> Menores Avaliações
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {ranking.data.piores.map((r, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-red-100 text-red-600">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-medium">{r.nome}</p>
                            <p className="text-xs text-muted-foreground">{r.funcao} | {r.setor}</p>
                            {r.avaliadorNome && <p className="text-xs text-muted-foreground">Avaliador: {r.avaliadorNome}</p>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-red-600">{Number(r.notaFinal).toFixed(1)}</p>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(s => (
                              <Star key={s} className={`h-3 w-3 ${s <= Math.round(Number(r.notaFinal)) ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`} />
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ============================================================ */}
      {/* DIALOG: NOVO/EDITAR QUESTIONÁRIO */}
      {/* ============================================================ */}
      <Dialog open={showQuestionarioDialog} onOpenChange={setShowQuestionarioDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingQuestionario ? "Editar Questionário" : "Novo Questionário"}</DialogTitle>
            <DialogDescription>Configure o questionário de avaliação com as perguntas desejadas.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input value={qTitulo} onChange={e => setQTitulo(e.target.value)} placeholder="Ex: Avaliação Mensal de Desempenho" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={qDescricao} onChange={e => setQDescricao(e.target.value)} placeholder="Descrição opcional..." />
            </div>
            <div>
              <Label>Frequência</Label>
              <Select value={qFrequencia} onValueChange={setQFrequencia}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diaria">Diária</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="semestral">Semestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base font-semibold">Perguntas</Label>
                <Button size="sm" variant="outline" onClick={() => setQPerguntas([...qPerguntas, { texto: "", tipo: "nota_1_5", peso: 1 }])}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
              </div>
              <div className="space-y-3">
                {qPerguntas.map((p, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground w-6">{idx + 1}.</span>
                      <Input
                        value={p.texto}
                        onChange={e => {
                          const novo = [...qPerguntas];
                          novo[idx].texto = e.target.value;
                          setQPerguntas(novo);
                        }}
                        placeholder="Texto da pergunta..."
                        className="flex-1"
                      />
                      {qPerguntas.length > 1 && (
                        <Button size="sm" variant="ghost" onClick={() => setQPerguntas(qPerguntas.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-4 ml-8">
                      <div className="flex-1">
                        <Label className="text-xs">Tipo de Resposta</Label>
                        <Select
                          value={p.tipo}
                          onValueChange={v => {
                            const novo = [...qPerguntas];
                            novo[idx].tipo = v;
                            setQPerguntas(novo);
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="nota_1_5">Nota 1 a 5</SelectItem>
                            <SelectItem value="nota_1_10">Nota 1 a 10</SelectItem>
                            <SelectItem value="sim_nao">Sim / Não</SelectItem>
                            <SelectItem value="texto_livre">Texto Livre</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-20">
                        <Label className="text-xs">Peso</Label>
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          value={p.peso}
                          onChange={e => {
                            const novo = [...qPerguntas];
                            novo[idx].peso = parseInt(e.target.value) || 1;
                            setQPerguntas(novo);
                          }}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuestionarioDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveQuestionario} disabled={createQuestionario.isPending || updateQuestionario.isPending}>
              {editingQuestionario ? "Salvar Alterações" : "Criar Questionário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: NOVO CICLO */}
      {/* ============================================================ */}
      <Dialog open={showCicloDialog} onOpenChange={setShowCicloDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Ciclo de Avaliação</DialogTitle>
            <DialogDescription>Defina o período e o questionário para este ciclo.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input value={cTitulo} onChange={e => setCTitulo(e.target.value)} placeholder="Ex: Avaliação Mensal - Fevereiro 2026" />
            </div>
            <div>
              <Label>Questionário *</Label>
              <Select value={cQuestionarioId ? String(cQuestionarioId) : ""} onValueChange={v => setCQuestionarioId(parseInt(v))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {questionarios.data?.filter(q => q.ativo).map(q => (
                    <SelectItem key={q.id} value={String(q.id)}>{q.titulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data Início *</Label>
                <Input type="date" value={cDataInicio} onChange={e => setCDataInicio(e.target.value)} />
              </div>
              <div>
                <Label>Data Fim *</Label>
                <Input type="date" value={cDataFim} onChange={e => setCDataFim(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCicloDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveCiclo} disabled={createCiclo.isPending}>Criar Ciclo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIALOG: REALIZAR AVALIAÇÃO */}
      {/* ============================================================ */}
      <Dialog open={showAvaliacaoDialog} onOpenChange={setShowAvaliacaoDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              Avaliar: {avaliacaoAtual?.nome}
            </DialogTitle>
            <DialogDescription>
              {avaliacaoAtual?.funcao} | {avaliacaoAtual?.setor}
            </DialogDescription>
          </DialogHeader>

          {avaliacaoAtual?.status === "finalizada" ? (
            <div className="text-center py-8">
              <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Avaliação Finalizada</p>
              <p className="text-muted-foreground">Esta avaliação já foi finalizada e não pode ser alterada.</p>
              <p className="text-2xl font-bold mt-4">Nota: {Number(avaliacaoAtual.notaFinal).toFixed(1)}</p>
            </div>
          ) : (
            <AvaliacaoFormulario
              avaliacaoId={avaliacaoAtual?.id}
              respostas={respostas}
              setRespostas={setRespostas}
              obsAvaliacao={obsAvaliacao}
              setObsAvaliacao={setObsAvaliacao}
            />
          )}

          {avaliacaoAtual?.status !== "finalizada" && (
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAvaliacaoDialog(false)}>Cancelar</Button>
              <Button variant="secondary" onClick={handleSalvarRascunho} disabled={salvarRespostas.isPending}>
                Salvar Rascunho
              </Button>
              <Button onClick={handleFinalizarAvaliacao} disabled={finalizarAvaliacao.isPending} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="h-4 w-4 mr-1" /> Finalizar Avaliação
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// COMPONENTE: DETALHE DO CICLO (lista de avaliações)
// ============================================================
function CicloDetalhe({ cicloId, onAvaliar }: { cicloId: number; onAvaliar: (av: any) => void }) {
  const avaliacoes = trpc.avaliacao.avaliacoes.listByCiclo.useQuery({ cicloId });

  if (avaliacoes.isLoading) return <p className="text-center py-4 text-muted-foreground">Carregando avaliações...</p>;

  return (
    <div className="mt-4 border-t pt-4">
      <h4 className="font-medium mb-3">Avaliações ({avaliacoes.data?.length || 0})</h4>
      {avaliacoes.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma avaliação neste ciclo. Abra o ciclo para gerar as avaliações automaticamente.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {avaliacoes.data?.map(av => (
            <div key={av.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${av.status === "finalizada" ? "bg-green-500" : av.status === "em_andamento" ? "bg-blue-500" : "bg-yellow-500"}`} />
                <div>
                  <p className="font-medium text-sm">{av.nome}</p>
                  <p className="text-xs text-muted-foreground">{av.funcao} | {av.setor}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {av.status === "finalizada" ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-green-600">
                      Nota: {Number(av.notaFinal).toFixed(1)}
                    </Badge>
                    {av.avaliadorNome && <span className="text-xs text-muted-foreground">por {av.avaliadorNome}</span>}
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </div>
                ) : (
                  <Button size="sm" onClick={() => onAvaliar(av)}>
                    <Star className="h-4 w-4 mr-1" /> Avaliar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// COMPONENTE: FORMULÁRIO DE AVALIAÇÃO
// ============================================================
function AvaliacaoFormulario({
  avaliacaoId,
  respostas,
  setRespostas,
  obsAvaliacao,
  setObsAvaliacao,
}: {
  avaliacaoId: number;
  respostas: Record<number, { valor: string; textoLivre: string }>;
  setRespostas: (r: Record<number, { valor: string; textoLivre: string }>) => void;
  obsAvaliacao: string;
  setObsAvaliacao: (v: string) => void;
}) {
  const avaliacao = trpc.avaliacao.avaliacoes.getById.useQuery(
    { id: avaliacaoId },
    { enabled: !!avaliacaoId }
  );

  // Preencher respostas existentes
  useEffect(() => {
    if (avaliacao.data?.respostas) {
      const map: Record<number, { valor: string; textoLivre: string }> = {};
      for (const r of avaliacao.data.respostas) {
        map[r.perguntaId] = { valor: r.valor || "", textoLivre: r.textoLivre || "" };
      }
      setRespostas(map);
      if (avaliacao.data.observacoes) setObsAvaliacao(avaliacao.data.observacoes);
    }
  }, [avaliacao.data?.respostas]);

  if (avaliacao.isLoading) return <p className="text-center py-4">Carregando formulário...</p>;
  if (!avaliacao.data) return null;

  const perguntas = avaliacao.data.perguntas || [];

  function setResposta(perguntaId: number, field: "valor" | "textoLivre", value: string) {
    setRespostas({
      ...respostas,
      [perguntaId]: {
        ...respostas[perguntaId],
        [field]: value,
      },
    });
  }

  return (
    <div className="space-y-6">
      {perguntas.map((p, idx) => (
        <div key={p.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-muted-foreground">{idx + 1}.</span>
            <p className="font-medium">{p.texto}</p>
            {p.peso > 1 && <Badge variant="outline" className="text-xs">Peso {p.peso}</Badge>}
          </div>

          {p.tipo === "nota_1_5" && (
            <div className="flex gap-2 ml-6">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setResposta(p.id, "valor", String(n))}
                  className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center font-bold transition-all ${
                    respostas[p.id]?.valor === String(n)
                      ? "border-yellow-500 bg-yellow-500 text-white"
                      : "border-muted hover:border-yellow-300"
                  }`}
                >
                  {n}
                </button>
              ))}
              <span className="text-xs text-muted-foreground self-center ml-2">
                (1 = Péssimo, 5 = Excelente)
              </span>
            </div>
          )}

          {p.tipo === "nota_1_10" && (
            <div className="flex gap-1.5 ml-6 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <button
                  key={n}
                  onClick={() => setResposta(p.id, "valor", String(n))}
                  className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center text-sm font-bold transition-all ${
                    respostas[p.id]?.valor === String(n)
                      ? "border-blue-500 bg-blue-500 text-white"
                      : "border-muted hover:border-blue-300"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {p.tipo === "sim_nao" && (
            <div className="flex gap-3 ml-6">
              <button
                onClick={() => setResposta(p.id, "valor", "sim")}
                className={`px-6 py-2 rounded-lg border-2 font-medium transition-all ${
                  respostas[p.id]?.valor === "sim"
                    ? "border-green-500 bg-green-500 text-white"
                    : "border-muted hover:border-green-300"
                }`}
              >
                Sim
              </button>
              <button
                onClick={() => setResposta(p.id, "valor", "nao")}
                className={`px-6 py-2 rounded-lg border-2 font-medium transition-all ${
                  respostas[p.id]?.valor === "nao"
                    ? "border-red-500 bg-red-500 text-white"
                    : "border-muted hover:border-red-300"
                }`}
              >
                Não
              </button>
            </div>
          )}

          {p.tipo === "texto_livre" && (
            <div className="ml-6">
              <Textarea
                value={respostas[p.id]?.textoLivre || ""}
                onChange={e => setResposta(p.id, "textoLivre", e.target.value)}
                placeholder="Digite sua resposta..."
                rows={3}
              />
            </div>
          )}
        </div>
      ))}

      <div>
        <Label className="font-medium">Observações Gerais</Label>
        <Textarea
          value={obsAvaliacao}
          onChange={e => setObsAvaliacao(e.target.value)}
          placeholder="Observações adicionais sobre o colaborador..."
          rows={3}
        />
      </div>
    </div>
  );
}
