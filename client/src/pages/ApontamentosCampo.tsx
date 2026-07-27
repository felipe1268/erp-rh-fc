import React, { useState, useMemo, useRef } from "react";
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
  AlertCircle, Archive, Zap, MapPin, Pencil, Trash2, RotateCcw,
  MoreHorizontal, X as XIcon
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import DashboardLayout from "@/components/DashboardLayout";
import { fmtNum } from "@/lib/formatters";

function MaskedTimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current && ref.current !== document.activeElement) {
      ref.current.value = value;
    }
  }, [value]);
  return (
    <input ref={ref} type="text" inputMode="numeric" maxLength={5} placeholder="--:--"
      defaultValue={value}
      onFocus={(e) => {
        if (!e.target.value) e.target.value = '--:--';
        setTimeout(() => e.target.setSelectionRange(0, 0), 0);
      }}
      onBlur={(e) => {
        const val = e.target.value;
        if (!val || val === '--:--') { e.target.value = ''; onChange(''); return; }
        const clean = val.replace(/-/g, '0');
        const parts = clean.split(':');
        const h = Math.min(23, parseInt(parts[0] || '0', 10));
        const m = Math.min(59, parseInt(parts[1] || '0', 10));
        const fmt = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        e.target.value = fmt;
        onChange(fmt);
      }}
      onKeyDown={(e) => {
        if (['Tab','ArrowLeft','ArrowRight','Home','End','Delete'].includes(e.key)) return;
        if (e.key === 'Backspace') {
          e.preventDefault();
          const el = e.currentTarget;
          const pos = el.selectionStart ?? 0;
          if (pos <= 0) return;
          const slots = [0,1,3,4];
          const prev = slots.filter(s => s < pos);
          if (!prev.length) return;
          const t = prev[prev.length - 1];
          const c = el.value.split(''); c[t] = '-'; el.value = c.join('');
          el.setSelectionRange(t, t);
          return;
        }
        if (!/^[0-9]$/.test(e.key)) { e.preventDefault(); return; }
        e.preventDefault();
        const el = e.currentTarget;
        const pos = el.selectionStart ?? 0;
        let chars = el.value.split('');
        if (chars.length < 5) chars = ['-','-',':','-','-'];
        const slots = [0,1,3,4];
        const idx = slots.findIndex(s => s >= pos);
        const slot = idx >= 0 ? idx : slots.length - 1;
        chars[slots[slot]] = e.key;
        el.value = chars.join('');
        const next = slot + 1 < slots.length ? slots[slot + 1] : 5;
        el.setSelectionRange(next, next);
      }}
      onChange={() => {}}
      className="w-full border rounded px-2 py-1.5 text-sm font-mono mt-0.5 focus:outline-none focus:ring-2 focus:ring-blue-200" />
  );
}

const TIPO_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  falta: { label: "Falta", color: "bg-red-100 text-red-700", icon: AlertCircle },
  atraso: { label: "Atraso", color: "bg-orange-100 text-orange-700", icon: Clock },
  saida_antecipada: { label: "Saída Antecipada", color: "bg-yellow-100 text-yellow-700", icon: ArrowLeft },
  abandono_posto: { label: "Abandono de Posto", color: "bg-red-100 text-red-800", icon: AlertTriangle },
  esqueceu_bater: { label: "Esqueceu de Bater", color: "bg-amber-100 text-amber-700", icon: Clock },
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
  reprovado: { label: "Reprovado", color: "bg-red-100 text-red-700 border-red-300" },
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

  const [showNovoDialog, setShowNovoDialog] = useState(false);
  const [showResolverDialog, setShowResolverDialog] = useState(false);
  const [showDetalhesDialog, setShowDetalhesDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("pendente");
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [filtroObra, setFiltroObra] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [expandedStats, setExpandedStats] = useState(true);

  const [novoEmployeeIds, setNovoEmployeeIds] = useState<number[]>([]);
  const [novoEmployeeSearch, setNovoEmployeeSearch] = useState("");
  const novoEmployeeSearchRef = useRef<HTMLInputElement>(null);
  const [novoObraId, setNovoObraId] = useState<number | null>(null);
  const [novoData, setNovoData] = useState(new Date().toISOString().split("T")[0]);
  const [novoTipo, setNovoTipo] = useState<string>("falta");
  const [novoPrioridade, setNovoPrioridade] = useState<string>("media");
  const [novoDescricao, setNovoDescricao] = useState("");
  const [novoEntrada1, setNovoEntrada1] = useState("");
  const [novoSaida1, setNovoSaida1] = useState("");
  const [novoEntrada2, setNovoEntrada2] = useState("");
  const [novoSaida2, setNovoSaida2] = useState("");

  const [editTipo, setEditTipo] = useState<string>("");
  const [editPrioridade, setEditPrioridade] = useState<string>("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editData, setEditData] = useState("");
  const [editObraId, setEditObraId] = useState<number | null>(null);

  const [resolverResposta, setResolverResposta] = useState("");
  const [resolverAcao, setResolverAcao] = useState<string>("nenhuma");
  const [resolverEntrada1, setResolverEntrada1] = useState("");
  const [resolverSaida1, setResolverSaida1] = useState("");
  const [resolverEntrada2, setResolverEntrada2] = useState("");
  const [resolverSaida2, setResolverSaida2] = useState("");

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

  const updateMut = trpc.fieldNotes.update.useMutation({
    onSuccess: () => {
      toast.success("Apontamento atualizado!");
      utils.fieldNotes.list.invalidate();
      utils.fieldNotes.stats.invalidate();
      setShowEditDialog(false);
      setSelectedNote(null);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const reopenMut = trpc.fieldNotes.reopen.useMutation({
    onSuccess: () => {
      toast.success("Apontamento reaberto (status: Pendente)");
      utils.fieldNotes.list.invalidate();
      utils.fieldNotes.stats.invalidate();
      setShowDetalhesDialog(false);
      setSelectedNote(null);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const deleteMut = trpc.fieldNotes.delete.useMutation({
    onSuccess: () => {
      toast.success("Apontamento excluído");
      utils.fieldNotes.list.invalidate();
      utils.fieldNotes.stats.invalidate();
      setShowDeleteConfirm(false);
      setShowDetalhesDialog(false);
      setSelectedNote(null);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  function resetNovoForm() {
    setNovoEmployeeIds([]);
    setNovoEmployeeSearch("");
    setNovoObraId(null);
    setNovoData(new Date().toISOString().split("T")[0]);
    setNovoTipo("falta");
    setNovoPrioridade("media");
    setNovoDescricao("");
    setNovoEntrada1(""); setNovoSaida1(""); setNovoEntrada2(""); setNovoSaida2("");
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
          <Button onClick={() => { resetNovoForm(); setShowNovoDialog(true); }} className="bg-[#1B2A4A] hover:bg-[#2a3d66]">
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
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => { setSelectedNote(note); setShowDetalhesDialog(true); }}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                        </Button>
                        {(note.status === 'pendente' || note.status === 'em_analise') && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700"
                            onClick={() => {
                              setSelectedNote(note);
                              setResolverResposta("");
                              setResolverAcao("nenhuma");
                              setResolverEntrada1(note.entrada1 || "");
                              setResolverSaida1(note.saida1 || "");
                              setResolverEntrada2(note.entrada2 || "");
                              setResolverSaida2(note.saida2 || "");
                              setShowResolverDialog(true);
                            }}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolver
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {note.status === 'pendente' && (
                              <DropdownMenuItem onClick={() => emAnaliseMut.mutate({ id: note.id })}>
                                <Eye className="h-3.5 w-3.5 mr-2 text-blue-600" /> Marcar Em Análise
                              </DropdownMenuItem>
                            )}
                            {(note.status === 'pendente' || note.status === 'em_analise') && (
                              <DropdownMenuItem onClick={() => {
                                setSelectedNote(note);
                                setEditTipo(note.tipoOcorrencia);
                                setEditPrioridade(note.prioridade);
                                setEditDescricao(note.descricao);
                                setEditData(note.data || "");
                                setEditObraId(note.obraId || null);
                                setShowEditDialog(true);
                              }}>
                                <Pencil className="h-3.5 w-3.5 mr-2 text-amber-600" /> Editar
                              </DropdownMenuItem>
                            )}
                            {(note.status === 'resolvido' || note.status === 'arquivado' || note.status === 'reprovado') && (
                              <DropdownMenuItem onClick={() => {
                                if (confirm(`Reabrir apontamento #${note.id}? O status voltará para Pendente.`)) {
                                  reopenMut.mutate({ id: note.id });
                                }
                              }}>
                                <RotateCcw className="h-3.5 w-3.5 mr-2 text-orange-600" /> Reabrir (Desaprovar)
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600" onClick={() => {
                              setSelectedNote(note);
                              setShowDeleteConfirm(true);
                            }}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
              <div className="relative">
                <label className="text-sm font-medium">
                  Funcionário(s) * {novoEmployeeIds.length > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">({novoEmployeeIds.length} selecionado{novoEmployeeIds.length > 1 ? "s" : ""})</span>
                  )}
                </label>
                {novoEmployeeIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1 mb-1.5">
                    {novoEmployeeIds.map((id) => {
                      const emp = employees.find((e: any) => e.id === id);
                      if (!emp) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-900 text-xs px-2 py-0.5 border border-blue-300">
                          <span className="font-medium truncate max-w-[160px]">{emp.nomeCompleto}</span>
                          <button type="button" className="hover:text-red-700"
                            onClick={() => setNovoEmployeeIds((prev) => prev.filter((x) => x !== id))}
                            aria-label={`Remover ${emp.nomeCompleto}`}>
                            <XIcon className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    ref={novoEmployeeSearchRef}
                    type="text"
                    value={novoEmployeeSearch}
                    onChange={(e) => setNovoEmployeeSearch(e.target.value)}
                    placeholder={novoEmployeeIds.length > 0 ? "Adicionar outro funcionário..." : "Digite o nome do funcionário..."}
                    className="w-full border rounded pl-8 pr-3 py-2 text-sm"
                    autoComplete="off"
                  />
                </div>
                {novoEmployeeSearch && (() => {
                  const s = novoEmployeeSearch.toLowerCase();
                  const filtered = employees.filter((e: any) =>
                    !novoEmployeeIds.includes(e.id) && (
                      e.nomeCompleto?.toLowerCase().includes(s) || e.funcao?.toLowerCase().includes(s) || e.cpf?.includes(s)
                    )
                  ).slice(0, 15);
                  return filtered.length > 0 ? (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filtered.map((e: any) => (
                        <button key={e.id} type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-0"
                          onClick={() => {
                            setNovoEmployeeIds((prev) => prev.includes(e.id) ? prev : [...prev, e.id]);
                            if (novoEmployeeIds.length === 0 && e.obraAtualId) setNovoObraId(e.obraAtualId);
                            setNovoEmployeeSearch("");
                            setTimeout(() => novoEmployeeSearchRef.current?.focus(), 0);
                          }}>
                          <span className="font-medium">{e.nomeCompleto}</span>
                          <span className="text-muted-foreground ml-2">— {e.funcao || "Sem função"}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg p-3 text-sm text-muted-foreground">
                      Nenhum funcionário encontrado
                    </div>
                  );
                })()}
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
              {['falta', 'atraso', 'saida_antecipada', 'abandono_posto', 'esqueceu_bater', 'outro'].includes(novoTipo) && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-800">Horários de Ponto do Dia</span>
                    <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">obrigatório</span>
                  </div>
                  <p className="text-xs text-blue-600">
                    Informe os horários do funcionário neste dia. Esses dados irão para o espelho de ponto caso o RH aprove. Se o DIXI já importou batidas, o sistema faz o merge automaticamente.
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "Entrada", val: novoEntrada1, set: setNovoEntrada1 },
                      { label: "Saída Int.", val: novoSaida1, set: setNovoSaida1 },
                      { label: "Retorno", val: novoEntrada2, set: setNovoEntrada2 },
                      { label: "Saída", val: novoSaida2, set: setNovoSaida2 },
                    ].map(({ label, val, set }) => (
                      <div key={label}>
                        <label className="text-xs font-medium text-gray-600">{label}</label>
                        <MaskedTimeInput value={val} onChange={set} />
                      </div>
                    ))}
                  </div>
                  {!novoEntrada1 && !novoSaida1 && !novoEntrada2 && !novoSaida2 && (
                    <p className="text-xs text-red-600">Preencha pelo menos um horário.</p>
                  )}
                </div>
              )}
              <div>
                <label className="text-sm font-medium">Descrição Detalhada *</label>
                <Textarea
                  value={novoDescricao}
                  onChange={(e) => setNovoDescricao(e.target.value)}
                  placeholder="Descreva a ocorrência com o máximo de detalhes possível..."
                  rows={3}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNovoDialog(false)}>Cancelar</Button>
              <Button
                className="bg-[#1B2A4A] hover:bg-[#2a3d66]"
                disabled={novoEmployeeIds.length === 0 || !novoDescricao.trim() || createMut.isPending || (
                  ['falta', 'atraso', 'saida_antecipada', 'abandono_posto', 'esqueceu_bater', 'outro'].includes(novoTipo) && !novoEntrada1 && !novoSaida1 && !novoEntrada2 && !novoSaida2
                )}
                onClick={async () => {
                  if (novoEmployeeIds.length === 0 || !novoDescricao.trim()) return;
                  const tiposComPonto = ['falta', 'atraso', 'saida_antecipada', 'abandono_posto', 'esqueceu_bater', 'outro'];
                  if (tiposComPonto.includes(novoTipo) && !novoEntrada1 && !novoSaida1 && !novoEntrada2 && !novoSaida2) {
                    toast.error("Preencha pelo menos um horário.");
                    return;
                  }
                  const payloadBase = {
                    companyId: companyId!,
                    obraId: novoObraId || undefined,
                    data: novoData,
                    tipoOcorrencia: novoTipo as any,
                    prioridade: novoPrioridade as any,
                    descricao: novoDescricao.trim(),
                    entrada1: novoEntrada1 || undefined,
                    saida1: novoSaida1 || undefined,
                    entrada2: novoEntrada2 || undefined,
                    saida2: novoSaida2 || undefined,
                  };
                  const results = await Promise.allSettled(
                    novoEmployeeIds.map((eid) => createMut.mutateAsync({ ...payloadBase, employeeId: eid }))
                  );
                  const ok = results.filter((r) => r.status === "fulfilled").length;
                  const fail = results.length - ok;
                  utils.fieldNotes.list.invalidate();
                  utils.fieldNotes.stats.invalidate();
                  if (ok > 0 && fail === 0) {
                    toast.success(ok === 1 ? "Apontamento registrado com sucesso!" : `${ok} apontamentos registrados com sucesso!`);
                    setShowNovoDialog(false);
                    resetNovoForm();
                  } else if (ok > 0 && fail > 0) {
                    toast.warning(`${ok} apontamento(s) registrado(s), ${fail} falhou(aram). Veja erros e tente novamente.`);
                  }
                }}
              >
                {createMut.isPending
                  ? (novoEmployeeIds.length > 1 ? `Registrando ${novoEmployeeIds.length}...` : "Registrando...")
                  : (novoEmployeeIds.length > 1 ? `Registrar ${novoEmployeeIds.length} Apontamentos` : "Registrar Apontamento")}
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
                {['falta', 'atraso', 'saida_antecipada', 'abandono_posto', 'esqueceu_bater', 'outro'].includes(selectedNote.tipoOcorrencia) && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-semibold text-blue-800">Horários de Ponto (correção)</span>
                    </div>
                    <p className="text-xs text-blue-600">Preencha para corrigir/completar o ponto do dia. Horários existentes do DIXI serão mantidos se deixar em branco.</p>
                    <div className="grid grid-cols-4 gap-2" key={`resolve-times-${selectedNote.id}`}>
                      {[
                        { label: "Entrada", val: resolverEntrada1, set: setResolverEntrada1 },
                        { label: "Saída Int.", val: resolverSaida1, set: setResolverSaida1 },
                        { label: "Retorno", val: resolverEntrada2, set: setResolverEntrada2 },
                        { label: "Saída", val: resolverSaida2, set: setResolverSaida2 },
                      ].map(({ label, val, set }) => (
                        <div key={label}>
                          <label className="text-xs text-muted-foreground">{label}</label>
                          <MaskedTimeInput value={val} onChange={set} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                    ...(resolverEntrada1 ? { entrada1: resolverEntrada1 } : {}),
                    ...(resolverSaida1 ? { saida1: resolverSaida1 } : {}),
                    ...(resolverEntrada2 ? { entrada2: resolverEntrada2 } : {}),
                    ...(resolverSaida2 ? { saida2: resolverSaida2 } : {}),
                  });
                }}>
                <Archive className="h-3.5 w-3.5 mr-1" /> Arquivar
              </Button>
              {/* Rev. 4690 — Reprovar: apontamento improcedente. NÃO grava nada no
                  ponto, desfaz o marcador criado na abertura e ALERTA quem criou. */}
              <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50"
                disabled={resolveMut.isPending}
                onClick={() => {
                  if (!resolverResposta.trim()) { toast.error("Informe o motivo da reprovação no campo Resposta / Parecer do RH"); return; }
                  resolveMut.mutate({
                    id: selectedNote.id,
                    respostaRH: resolverResposta.trim(),
                    acaoTomada: 'nenhuma' as any,
                    status: 'reprovado',
                  });
                }}>
                Reprovar
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
                    ...(resolverEntrada1 ? { entrada1: resolverEntrada1 } : {}),
                    ...(resolverSaida1 ? { saida1: resolverSaida1 } : {}),
                    ...(resolverEntrada2 ? { entrada2: resolverEntrada2 } : {}),
                    ...(resolverSaida2 ? { saida2: resolverSaida2 } : {}),
                  });
                }}>
                {resolveMut.isPending ? "Salvando..." : "Resolver"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Detalhes */}
        {/* Rev. 1755 — modal redesenhado: header com identidade destacada, chips coloridos
            de Status/Tipo/Prioridade, grid visual de batidas de ponto, descrição em card e
            footer com ações primárias (verde/azul) separadas das destrutivas (Excluir). */}
        <Dialog open={showDetalhesDialog} onOpenChange={setShowDetalhesDialog}>
          <DialogContent resizable={false} className="w-[min(1100px,96vw)] sm:max-w-[min(1100px,96vw)] max-h-[94dvh] overflow-y-auto overflow-x-hidden p-0 gap-0">
            {selectedNote && (() => {
              const isPendente = selectedNote.status === 'pendente' || selectedNote.status === 'em_analise';
              const isResolvido = selectedNote.status === 'resolvido' || selectedNote.status === 'arquivado' || selectedNote.status === 'reprovado';
              const iniciais = (selectedNote.nomeFunc || "?").split(" ").filter(Boolean).slice(0, 2).map((s: string) => s[0]).join("").toUpperCase();
              const dataFmt = selectedNote.data ? new Date(selectedNote.data + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : "—";
              const temBatidas = selectedNote.entrada1 || selectedNote.saida1 || selectedNote.entrada2 || selectedNote.saida2;
              const statusInfo = STATUS_LABELS[selectedNote.status] || { label: selectedNote.status, color: "" };
              const tipoInfo = TIPO_LABELS[selectedNote.tipoOcorrencia] || { label: selectedNote.tipoOcorrencia, color: "" };
              const prioInfo = PRIORIDADE_LABELS[selectedNote.prioridade] || { label: selectedNote.prioridade, color: "" };
              const headerBg = isResolvido
                ? "from-emerald-50 via-emerald-50 to-white"
                : isPendente
                ? "from-amber-50 via-amber-50 to-white"
                : "from-slate-50 via-slate-50 to-white";
              return (
                <>
                  {/* Header com gradiente, identidade do funcionário e chips de status */}
                  <div className={`bg-gradient-to-br ${headerBg} px-6 pt-6 pb-5 border-b`}>
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
                          Apontamento #{selectedNote.id}
                        </div>
                        <DialogTitle className="text-xl font-bold text-slate-900">Detalhes da ocorrência</DialogTitle>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[#1B2A4A] to-[#2C3E6A] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow">
                        {iniciais}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 leading-tight truncate">{selectedNote.nomeFunc}</div>
                        <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-2 flex-wrap">
                          {selectedNote.funcaoFunc && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{selectedNote.funcaoFunc}</span>}
                          {selectedNote.obraNome && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{selectedNote.obraNome}</span>}
                          <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{dataFmt}</span>
                        </div>
                      </div>
                    </div>
                    {/* Chips: Status / Tipo / Prioridade */}
                    <div className="flex flex-wrap gap-1.5 mt-4">
                      <Badge variant="outline" className={`${statusInfo.color} font-semibold`}>
                        Status: {statusInfo.label}
                      </Badge>
                      <Badge className={tipoInfo.color}>
                        Tipo: {tipoInfo.label}
                      </Badge>
                      <Badge variant="outline" className={prioInfo.color}>
                        Prioridade: {prioInfo.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="px-6 py-5 space-y-4 text-sm">
                    {/* Horário do ponto — grid visual 2x4 (Rev. 1841: largura folgada) */}
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                        <Clock className="h-3.5 w-3.5" /> Horário do ponto
                      </div>
                      {temBatidas ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { label: "Entrada 1", val: selectedNote.entrada1, on: "border-emerald-200 bg-emerald-50", txt: "text-emerald-700" },
                            { label: "Saída 1", val: selectedNote.saida1, on: "border-rose-200 bg-rose-50", txt: "text-rose-700" },
                            { label: "Entrada 2", val: selectedNote.entrada2, on: "border-emerald-200 bg-emerald-50", txt: "text-emerald-700" },
                            { label: "Saída 2", val: selectedNote.saida2, on: "border-rose-200 bg-rose-50", txt: "text-rose-700" },
                          ].map((b) => (
                            <div key={b.label} className={`rounded-lg border-2 ${b.val ? b.on : "border-slate-200 bg-slate-50"} px-3 py-2 text-center`}>
                              <div className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">{b.label}</div>
                              <div className={`font-mono text-base font-bold mt-0.5 ${b.val ? b.txt : "text-slate-300"}`}>{b.val || "—:—"}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center">
                          Sem batidas registradas para esta data
                        </div>
                      )}
                    </div>

                    {/* Descrição */}
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                        <FileText className="h-3.5 w-3.5" /> Descrição da ocorrência
                      </div>
                      <p className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {selectedNote.descricao}
                      </p>
                    </div>

                    {/* Resposta do RH (quando houver) */}
                    {selectedNote.respostaRH && (
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Resposta do RH
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1.5">
                          <p className="text-emerald-900 leading-relaxed whitespace-pre-wrap">{selectedNote.respostaRH}</p>
                          {selectedNote.acaoTomada && selectedNote.acaoTomada !== 'nenhuma' && (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-700 pt-1.5 border-t border-emerald-200">
                              <Zap className="h-3 w-3" /> Ação tomada: <strong>{ACAO_LABELS[selectedNote.acaoTomada]}</strong>
                            </div>
                          )}
                          {selectedNote.resolvidoPor && (
                            <div className="text-xs text-emerald-600/80">
                              Resolvido por: <strong>{selectedNote.resolvidoPor}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Metadados em rodapé do body */}
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" /> Registrado por: <strong className="text-slate-700">{selectedNote.solicitanteNome}</strong>
                      </span>
                      <span>
                        {selectedNote.createdAt ? new Date(selectedNote.createdAt).toLocaleString("pt-BR") : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Footer — ações primárias (esquerda) separadas de Excluir/Fechar (direita) */}
                  <DialogFooter className="px-6 py-4 bg-slate-50 border-t flex-row flex-wrap items-center justify-between gap-2 sm:gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isPendente && (
                        <>
                          <Button
                            className="bg-emerald-600 hover:bg-emerald-700 shadow"
                            onClick={() => {
                              setShowDetalhesDialog(false);
                              setResolverResposta("");
                              setResolverAcao("nenhuma");
                              setResolverEntrada1(selectedNote?.entrada1 || "");
                              setResolverSaida1(selectedNote?.saida1 || "");
                              setResolverEntrada2(selectedNote?.entrada2 || "");
                              setResolverSaida2(selectedNote?.saida2 || "");
                              setShowResolverDialog(true);
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Resolver
                          </Button>
                          <Button
                            variant="outline"
                            className="text-amber-700 border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                            onClick={() => {
                              setShowDetalhesDialog(false);
                              setEditTipo(selectedNote.tipoOcorrencia);
                              setEditPrioridade(selectedNote.prioridade);
                              setEditDescricao(selectedNote.descricao);
                              setEditData(selectedNote.data || "");
                              setEditObraId(selectedNote.obraId || null);
                              setShowEditDialog(true);
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-1.5" /> Editar
                          </Button>
                        </>
                      )}
                      {isResolvido && (
                        <Button
                          variant="outline"
                          className="text-orange-700 border-orange-300 hover:bg-orange-50 hover:text-orange-800"
                          onClick={() => {
                            if (confirm(`Reabrir apontamento #${selectedNote.id}? O status voltará para Pendente.`)) {
                              reopenMut.mutate({ id: selectedNote.id });
                            }
                          }}
                        >
                          <RotateCcw className="h-4 w-4 mr-1.5" /> Reabrir
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => {
                          setShowDetalhesDialog(false);
                          setShowDeleteConfirm(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1.5" /> Excluir
                      </Button>
                      <Button variant="outline" onClick={() => setShowDetalhesDialog(false)}>Fechar</Button>
                    </div>
                  </DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Dialog: Editar Apontamento */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-amber-600" /> Editar Apontamento #{selectedNote?.id}
              </DialogTitle>
              <DialogDescription>
                Altere os dados do apontamento
              </DialogDescription>
            </DialogHeader>
            {selectedNote && (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded p-3 text-sm">
                  <span className="text-muted-foreground">Funcionário:</span>{" "}
                  <span className="font-medium">{selectedNote.nomeFunc}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Data</label>
                    <input type="date" value={editData} onChange={(e) => setEditData(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Obra</label>
                    <select value={editObraId || ""} onChange={(e) => setEditObraId(parseInt(e.target.value) || null)}
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
                    <label className="text-sm font-medium">Tipo de Ocorrência</label>
                    <select value={editTipo} onChange={(e) => setEditTipo(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm mt-1">
                      {Object.entries(TIPO_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Prioridade</label>
                    <select value={editPrioridade} onChange={(e) => setEditPrioridade(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm mt-1">
                      {Object.entries(PRIORIDADE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Descrição</label>
                  <Textarea
                    value={editDescricao}
                    onChange={(e) => setEditDescricao(e.target.value)}
                    rows={4}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
              <Button
                className="bg-[#1B2A4A] hover:bg-[#2a3d66]"
                disabled={!editDescricao.trim() || updateMut.isPending}
                onClick={() => {
                  if (!selectedNote) return;
                  updateMut.mutate({
                    id: selectedNote.id,
                    tipoOcorrencia: editTipo as any,
                    prioridade: editPrioridade as any,
                    descricao: editDescricao.trim(),
                    data: editData || undefined,
                    obraId: editObraId || undefined,
                  });
                }}
              >
                {updateMut.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: Confirmar Exclusão */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" /> Excluir Apontamento
              </DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir o apontamento #{selectedNote?.id}?
                Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            {selectedNote && (
              <div className="bg-red-50 border border-red-200 rounded p-3 text-sm">
                <p><span className="font-medium">Funcionário:</span> {selectedNote.nomeFunc}</p>
                <p><span className="font-medium">Tipo:</span> {TIPO_LABELS[selectedNote.tipoOcorrencia]?.label}</p>
                <p><span className="font-medium">Data:</span> {selectedNote.data ? new Date(selectedNote.data + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancelar</Button>
              <Button variant="destructive" disabled={deleteMut.isPending}
                onClick={() => {
                  if (!selectedNote) return;
                  deleteMut.mutate({ id: selectedNote.id });
                }}>
                {deleteMut.isPending ? "Excluindo..." : "Excluir"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
