import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  ClipboardList, Plus, Filter, Search, AlertTriangle, CheckCircle2,
  Clock, Eye, MessageSquare, ChevronDown, ChevronUp, Building2,
  User, Calendar, FileText, Shield, ArrowLeft, RefreshCw,
  AlertCircle, Archive, Zap, MapPin
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { fmtNum } from "@/lib/formatters";

const TIPO_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  falta: { label: "Falta", color: "bg-red-100 text-red-700", icon: AlertCircle },
  atraso: { label: "Atraso", color: "bg-orange-100 text-orange-700", icon: Clock },
  saida_antecipada: { label: "Saída Antecipada", color: "bg-yellow-100 text-yellow-700", icon: ArrowLeft },
  abandono_posto: { label: "Abandono de Posto", color: "bg-red-100 text-red-800", icon: AlertTriangle },
  insubordinacao: { label: "Insubordinação", color: "bg-red-200 text-red-800", icon: Shield },
  acidente: { label: "Acidente", color: "bg-purple-100 text-purple-700", icon: Zap },
  atestado_medico: { label: "Atestado Médico", color: "bg-blue-100 text-blue-700", icon: FileText },
  desvio_conduta: { label: "Desvio de Conduta", color: "bg-gray-100 text-gray-700", icon: AlertTriangle },
  elogio: { label: "Elogio", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  outro: { label: "Outro", color: "bg-gray-100 text-gray-600", icon: ClipboardList },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  em_analise: { label: "Em Análise", color: "bg-blue-100 text-blue-700 border-blue-300" },
  resolvido: { label: "Resolvido", color: "bg-green-100 text-green-700 border-green-300" },
  arquivado: { label: "Arquivado", color: "bg-gray-100 text-gray-500 border-gray-300" },
};

const PRIORIDADE_LABELS: Record<string, { label: string; color: string }> = {
  baixa: { label: "Baixa", color: "text-gray-500" },
  media: { label: "Média", color: "text-blue-600" },
  alta: { label: "Alta", color: "text-orange-600 font-semibold" },
  urgente: { label: "Urgente", color: "text-red-600 font-bold" },
};

const ACAO_LABELS: Record<string, string> = {
  nenhuma: "Nenhuma ação",
  advertencia_verbal: "Advertência Verbal",
  advertencia_escrita: "Advertência Escrita",
  suspensao: "Suspensão",
  desconto_folha: "Desconto em Folha",
  ajuste_ponto: "Ajuste de Ponto",
  encaminhamento_medico: "Encaminhamento Médico",
  outro: "Outro",
};

export default function ApontamentosCampo() {
  const { selectedCompany, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const { user } = useAuth();
  const companyId = selectedCompany?.id;

  // States
  const [showNovoDialog, setShowNovoDialog] = useState(false);
  const [showResolverDialog, setShowResolverDialog] = useState(false);
  const [showDetalhesDialog, setShowDetalhesDialog] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("pendente");
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [filtroObra, setFiltroObra] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [expandedStats, setExpandedStats] = useState(true);

  // Form novo apontamento
  const [novoEmployeeId, setNovoEmployeeId] = useState<number | null>(null);
  const [novoObraId, setNovoObraId] = useState<number | null>(null);
  const [novoData, setNovoData] = useState(new Date().toISOString().split("T")[0]);
  const [novoTipo, setNovoTipo] = useState<string>("falta");
  const [novoPrioridade, setNovoPrioridade] = useState<string>("media");
  const [novoDescricao, setNovoDescricao] = useState("");

  // Form resolver
  const [resolverResposta, setResolverResposta] = useState("");
  const [resolverAcao, setResolverAcao] = useState<string>("nenhuma");

  // Queries
  const statsQ = trpc.fieldNotes.stats.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );

  const listQ = trpc.fieldNotes.list.useQuery(
    {
      companyId: companyId!,
      status: filtroStatus as any || undefined,
      obraId: filtroObra ? parseInt(filtroObra) : undefined,
      tipoOcorrencia: filtroTipo as any || undefined,
    },
    { enabled: !!companyId }
  );

  const empQ = trpc.employees.list.useQuery(
    { companyId: companyId!, excludeTerminated: true },
    { enabled: !!companyId }
  );

  const obrasQ = trpc.obras.list.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );

  const utils = trpc.useUtils();

  const createMut = trpc.fieldNotes.create.useMutation({
    onSuccess: () => {
      toast.success("Apontamento registrado com sucesso!");
      utils.fieldNotes.list.invalidate();
      utils.fieldNotes.stats.invalidate();
      setShowNovoDialog(false);
      resetNovoForm();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const resolveMut = trpc.fieldNotes.resolve.useMutation({
    onSuccess: (data: any) => {
      if (data?.vinculadoPonto) {
        toast.success("Apontamento resolvido e vinculado ao ponto do funcionário!", { duration: 5000 });
      } else {
        toast.success("Apontamento resolvido!");
      }
      utils.fieldNotes.list.invalidate();
      utils.fieldNotes.stats.invalidate();
      setShowResolverDialog(false);
      setSelectedNote(null);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const emAnaliseMut = trpc.fieldNotes.setEmAnalise.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado para Em Análise");
      utils.fieldNotes.list.invalidate();
      utils.fieldNotes.stats.invalidate();
    },
  });

  const deleteMut = trpc.fieldNotes.delete.useMutation({
    onSuccess: () => {
      toast.success("Apontamento removido");
      utils.fieldNotes.list.invalidate();
      utils.fieldNotes.stats.invalidate();
    },
  });

  function resetNovoForm() {
    setNovoEmployeeId(null);
    setNovoObraId(null);
    setNovoData(new Date().toISOString().split("T")[0]);
    setNovoTipo("falta");
    setNovoPrioridade("media");
    setNovoDescricao("");
  }

  // Filter list by search
  const filteredList = useMemo(() => {
    if (!listQ.data) return [];
    if (!busca) return listQ.data;
    const b = busca.toLowerCase();
    return listQ.data.filter((n: any) =>
      (n.nomeFunc || "").toLowerCase().includes(b) ||
      (n.descricao || "").toLowerCase().includes(b) ||
      (n.obraNome || "").toLowerCase().includes(b) ||
      (n.solicitanteNome || "").toLowerCase().includes(b)
    );
  }, [listQ.data, busca]);

  const employees = empQ.data?.filter((e: any) => e.status === "Ativo") || [];
  const obrasList = obrasQ.data || [];
  const stats = statsQ.data || { pendente: 0, em_analise: 0, resolvido: 0, arquivado: 0, urgentes: 0, altas: 0, total: 0 };

  if (!companyId) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Selecione uma empresa para continuar</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1B2A4A] flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-[#E8B931]" />
              Apontamentos de Campo
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Registro de ocorrências pelo gestor de campo para resolução pelo RH
            </p>
          </div>
          <Button onClick={() => setShowNovoDialog(true)} className="bg-[#1B2A4A] hover:bg-[#2a3d66]">
            <Plus className="h-4 w-4 mr-2" /> Novo Apontamento
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className={`cursor-pointer transition-all border-2 ${filtroStatus === 'pendente' ? 'border-yellow-400 shadow-md' : 'border-transparent hover:border-yellow-200'}`}
            onClick={() => setFiltroStatus('pendente')}>
            <CardContent className="p-3 text-center">
              <div className="flex items-center justify-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                <span className="text-2xl font-bold text-yellow-700">{fmtNum(stats.pendente)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Pendentes</p>
              {stats.urgentes > 0 && (
                <Badge variant="destructive" className="mt-1 text-[10px]">{stats.urgentes} urgente(s)</Badge>
              )}
            </CardContent>
          </Card>
          <Card className={`cursor-pointer transition-all border-2 ${filtroStatus === 'em_analise' ? 'border-blue-400 shadow-md' : 'border-transparent hover:border-blue-200'}`}
            onClick={() => setFiltroStatus('em_analise')}>
            <CardContent className="p-3 text-center">
              <div className="flex items-center justify-center gap-2">
                <Eye className="h-5 w-5 text-blue-600" />
                <span className="text-2xl font-bold text-blue-700">{fmtNum(stats.em_analise)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Em Análise</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer transition-all border-2 ${filtroStatus === 'resolvido' ? 'border-green-400 shadow-md' : 'border-transparent hover:border-green-200'}`}
            onClick={() => setFiltroStatus('resolvido')}>
            <CardContent className="p-3 text-center">
              <div className="flex items-center justify-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-2xl font-bold text-green-700">{fmtNum(stats.resolvido)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Resolvidos</p>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer transition-all border-2 ${filtroStatus === '' ? 'border-gray-400 shadow-md' : 'border-transparent hover:border-gray-200'}`}
            onClick={() => setFiltroStatus('')}>
            <CardContent className="p-3 text-center">
              <div className="flex items-center justify-center gap-2">
                <ClipboardList className="h-5 w-5 text-gray-600" />
                <span className="text-2xl font-bold text-gray-700">{fmtNum(stats.total)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Todos</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por funcionário, descrição, obra..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="flex-1 text-sm border rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/30"
                />
              </div>
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
                className="text-sm border rounded px-2 py-1.5">
                <option value="">Todos os tipos</option>
                {Object.entries(TIPO_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <select value={filtroObra} onChange={(e) => setFiltroObra(e.target.value)}
                className="text-sm border rounded px-2 py-1.5">
                <option value="">Todas as obras</option>
                {obrasList.map((o: any) => (
                  <option key={o.id} value={o.id}>{o.nome}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={() => { listQ.refetch(); statsQ.refetch(); }}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <div className="space-y-2">
          {listQ.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando apontamentos...</div>
          ) : filteredList.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">
                  {filtroStatus === 'pendente' ? 'Nenhum apontamento pendente' :
                    filtroStatus === 'em_analise' ? 'Nenhum apontamento em análise' :
                      'Nenhum apontamento encontrado'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredList.map((note: any) => {
              const tipo = TIPO_LABELS[note.tipoOcorrencia] || TIPO_LABELS.outro;
              const status = STATUS_LABELS[note.status] || STATUS_LABELS.pendente;
              const prio = PRIORIDADE_LABELS[note.prioridade] || PRIORIDADE_LABELS.media;
              const TipoIcon = tipo.icon;
              return (
                <Card key={note.id} className={`transition-all hover:shadow-md ${note.prioridade === 'urgente' ? 'border-l-4 border-l-red-500' : note.prioridade === 'alta' ? 'border-l-4 border-l-orange-400' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-start gap-3">
                      {/* Left: Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge className={tipo.color + " text-xs"}>
                            <TipoIcon className="h-3 w-3 mr-1" />{tipo.label}
                          </Badge>
                          <Badge variant="outline" className={status.color + " text-xs"}>
                            {status.label}
                          </Badge>
                          <span className={`text-xs ${prio.color}`}>{prio.label}</span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            #{note.id}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-sm mb-1">
                          <span className="font-semibold text-[#1B2A4A] flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />{note.nomeFunc || "—"}
                          </span>
                          {note.funcaoFunc && (
                            <span className="text-muted-foreground text-xs">({note.funcaoFunc})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {note.data ? new Date(note.data + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                          </span>
                          {note.obraNome && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />{note.obraNome}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />Registrado por: {note.solicitanteNome}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 line-clamp-2">{note.descricao}</p>
                        {note.respostaRH && (
                          <div className="mt-2 bg-green-50 border border-green-200 rounded p-2 text-xs">
                            <span className="font-semibold text-green-700">Resposta RH:</span> {note.respostaRH}
                            {note.acaoTomada && note.acaoTomada !== 'nenhuma' && (
                              <span className="ml-2 text-green-600">• Ação: {ACAO_LABELS[note.acaoTomada]}</span>
                            )}
                            {note.resolvidoPor && (
                              <span className="ml-2 text-muted-foreground">• Por: {note.resolvidoPor}</span>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Right: Actions */}
                      <div className="flex md:flex-col gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => { setSelectedNote(note); setShowDetalhesDialog(true); }}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                        </Button>
                        {(note.status === 'pendente' || note.status === 'em_analise') && (
                          <>
                            {note.status === 'pendente' && (
                              <Button variant="outline" size="sm" className="text-blue-600 border-blue-300"
                                onClick={() => emAnaliseMut.mutate({ id: note.id })}>
                                <Eye className="h-3.5 w-3.5 mr-1" /> Analisar
                              </Button>
                            )}
                            <Button size="sm" className="bg-green-600 hover:bg-green-700"
                              onClick={() => {
                                setSelectedNote(note);
                                setResolverResposta("");
                                setResolverAcao("nenhuma");
                                setShowResolverDialog(true);
                              }}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolver
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Dialog: Novo Apontamento */}
        <Dialog open={showNovoDialog} onOpenChange={setShowNovoDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-[#E8B931]" /> Novo Apontamento de Campo
              </DialogTitle>
              <DialogDescription>
                Registre uma ocorrência de campo para análise do RH
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Funcionário *</label>
                <select value={novoEmployeeId || ""} onChange={(e) => {
                  const empId = parseInt(e.target.value);
                  setNovoEmployeeId(empId);
                  // Auto-preencher obra do funcionário
                  const emp = employees.find((em: any) => em.id === empId);
                  if (emp?.obraAtualId) setNovoObraId(emp.obraAtualId);
                }}
                  className="w-full border rounded px-3 py-2 text-sm mt-1">
                  <option value="">Selecione...</option>
                  {employees.map((e: any) => (
                    <option key={e.id} value={e.id}>{e.nomeCompleto} — {e.funcao || "Sem função"}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Data *</label>
                  <input type="date" value={novoData} onChange={(e) => setNovoData(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Obra</label>
                  <select value={novoObraId || ""} onChange={(e) => setNovoObraId(parseInt(e.target.value) || null)}
                    className="w-full border rounded px-3 py-2 text-sm mt-1">
                    <option value="">Sem obra</option>
                    {obrasList.map((o: any) => (
                      <option key={o.id} value={o.id}>{o.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Tipo de Ocorrência *</label>
                  <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm mt-1">
                    {Object.entries(TIPO_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Prioridade</label>
                  <select value={novoPrioridade} onChange={(e) => setNovoPrioridade(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm mt-1">
                    {Object.entries(PRIORIDADE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Descrição Detalhada *</label>
                <Textarea
                  value={novoDescricao}
                  onChange={(e) => setNovoDescricao(e.target.value)}
                  placeholder="Descreva a ocorrência com o máximo de detalhes possível..."
                  rows={4}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNovoDialog(false)}>Cancelar</Button>
              <Button
                className="bg-[#1B2A4A] hover:bg-[#2a3d66]"
                disabled={!novoEmployeeId || !novoDescricao.trim() || createMut.isPending}
                onClick={() => {
                  if (!novoEmployeeId || !novoDescricao.trim()) return;
                  createMut.mutate({
                    companyId: companyId!,
                    employeeId: novoEmployeeId,
                    obraId: novoObraId || undefined,
                    data: novoData,
                    tipoOcorrencia: novoTipo as any,
                    prioridade: novoPrioridade as any,
                    descricao: novoDescricao.trim(),
                  });
                }}
              >
                {createMut.isPending ? "Registrando..." : "Registrar Apontamento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Resolver Apontamento */}
        <Dialog open={showResolverDialog} onOpenChange={setShowResolverDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" /> Resolver Apontamento
              </DialogTitle>
              <DialogDescription>
                {selectedNote && (
                  <span>
                    {TIPO_LABELS[selectedNote.tipoOcorrencia]?.label} — {selectedNote.nomeFunc} — {selectedNote.data ? new Date(selectedNote.data + "T12:00:00").toLocaleDateString("pt-BR") : ""}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            {selectedNote && (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded p-3 text-sm">
                  <p className="font-medium mb-1">Descrição da ocorrência:</p>
                  <p className="text-gray-700">{selectedNote.descricao}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Ação Tomada *</label>
                  <select value={resolverAcao} onChange={(e) => setResolverAcao(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm mt-1">
                    {Object.entries(ACAO_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Resposta / Parecer do RH *</label>
                  <Textarea
                    value={resolverResposta}
                    onChange={(e) => setResolverResposta(e.target.value)}
                    placeholder="Descreva a resolução, providências tomadas..."
                    rows={4}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowResolverDialog(false)}>Cancelar</Button>
              <Button variant="outline" className="text-gray-500"
                onClick={() => {
                  if (!resolverResposta.trim()) { toast.error("Informe a resposta do RH"); return; }
                  resolveMut.mutate({
                    id: selectedNote.id,
                    respostaRH: resolverResposta.trim(),
                    acaoTomada: resolverAcao as any,
                    status: 'arquivado',
                  });
                }}>
                <Archive className="h-3.5 w-3.5 mr-1" /> Arquivar
              </Button>
              <Button className="bg-green-600 hover:bg-green-700"
                disabled={!resolverResposta.trim() || resolveMut.isPending}
                onClick={() => {
                  if (!resolverResposta.trim()) { toast.error("Informe a resposta do RH"); return; }
                  resolveMut.mutate({
                    id: selectedNote.id,
                    respostaRH: resolverResposta.trim(),
                    acaoTomada: resolverAcao as any,
                    status: 'resolvido',
                  });
                }}>
                {resolveMut.isPending ? "Salvando..." : "Resolver"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Detalhes */}
        <Dialog open={showDetalhesDialog} onOpenChange={setShowDetalhesDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Detalhes do Apontamento #{selectedNote?.id}</DialogTitle>
              <DialogDescription>Informações completas da ocorrência</DialogDescription>
            </DialogHeader>
            {selectedNote && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Funcionário:</span><br /><span className="font-medium">{selectedNote.nomeFunc}</span></div>
                  <div><span className="text-muted-foreground">Função:</span><br /><span>{selectedNote.funcaoFunc || "—"}</span></div>
                  <div><span className="text-muted-foreground">Data:</span><br /><span>{selectedNote.data ? new Date(selectedNote.data + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</span></div>
                  <div><span className="text-muted-foreground">Obra:</span><br /><span>{selectedNote.obraNome || "—"}</span></div>
                  <div><span className="text-muted-foreground">Tipo:</span><br /><Badge className={TIPO_LABELS[selectedNote.tipoOcorrencia]?.color}>{TIPO_LABELS[selectedNote.tipoOcorrencia]?.label}</Badge></div>
                  <div><span className="text-muted-foreground">Prioridade:</span><br /><span className={PRIORIDADE_LABELS[selectedNote.prioridade]?.color}>{PRIORIDADE_LABELS[selectedNote.prioridade]?.label}</span></div>
                  <div><span className="text-muted-foreground">Status:</span><br /><Badge variant="outline" className={STATUS_LABELS[selectedNote.status]?.color}>{STATUS_LABELS[selectedNote.status]?.label}</Badge></div>
                  <div><span className="text-muted-foreground">Registrado por:</span><br /><span>{selectedNote.solicitanteNome}</span></div>
                </div>
                <div>
                  <span className="text-muted-foreground">Descrição:</span>
                  <p className="mt-1 bg-gray-50 rounded p-3">{selectedNote.descricao}</p>
                </div>
                {selectedNote.respostaRH && (
                  <div className="bg-green-50 border border-green-200 rounded p-3">
                    <span className="font-semibold text-green-700">Resposta RH:</span>
                    <p className="mt-1">{selectedNote.respostaRH}</p>
                    {selectedNote.acaoTomada && selectedNote.acaoTomada !== 'nenhuma' && (
                      <p className="mt-1 text-green-600">Ação: {ACAO_LABELS[selectedNote.acaoTomada]}</p>
                    )}
                    {selectedNote.resolvidoPor && (
                      <p className="mt-1 text-xs text-muted-foreground">Resolvido por: {selectedNote.resolvidoPor}</p>
                    )}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  Criado em: {selectedNote.createdAt ? new Date(selectedNote.createdAt).toLocaleString("pt-BR") : "—"}
                </div>
              </div>
            )}
            <DialogFooter>
              {selectedNote && (selectedNote.status === 'pendente' || selectedNote.status === 'em_analise') && (
                <Button className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    setShowDetalhesDialog(false);
                    setResolverResposta("");
                    setResolverAcao("nenhuma");
                    setShowResolverDialog(true);
                  }}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolver
                </Button>
              )}
              <Button variant="outline" onClick={() => setShowDetalhesDialog(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
