import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  BookOpen, Search, Loader2, CheckCircle, Clock, AlertTriangle, Eye,
  FileDown, Sparkles, Image, Edit, Trash2, Send, ThumbsUp, ThumbsDown,
  BarChart3, Filter, RefreshCw, FileText, Package, Building2, ChevronDown,
  ChevronRight, XCircle, Download, Wand2
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

function ProgressBar({ value, max, color = "bg-blue-500" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-10 text-right">{pct}%</span>
    </div>
  );
}

function downloadBase64Pdf(base64: string, filename: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Databook() {
  const { selectedCompanyId, selectedObraId, obrasDisponiveis, user } = useCompany();
  const companyId = selectedCompanyId || 0;
  const obraId = selectedObraId || 0;
  const userName = (user as any)?.name || (user as any)?.email || "Usuário";

  const [abaAtiva, setAbaAtiva] = useState<"dashboard" | "fichas" | "terceiros">("dashboard");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroDisciplina, setFiltroDisciplina] = useState<string>("todas");
  const [filtroOrigem, setFiltroOrigem] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [fichaDialog, setFichaDialog] = useState<any>(null);
  const [editEspecificacoes, setEditEspecificacoes] = useState("");
  const [editObservacoes, setEditObservacoes] = useState("");
  const [editDisciplina, setEditDisciplina] = useState("");
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
      toast.success(`${data.criadas} fichas criadas, ${data.duplicadas} duplicadas ignoradas`);
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

  const atualizarFicha = trpc.databook.atualizarFicha.useMutation({
    onSuccess: () => {
      toast.success("Ficha atualizada");
      fichas.refetch();
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

  const gerarPdfFicha = trpc.databook.gerarPdfFicha.useMutation({
    onSuccess: (data) => {
      downloadBase64Pdf(data.pdf, data.filename);
      toast.success("PDF gerado");
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
    const obra = obrasDisponiveis?.find((o: any) => o.id === obraId);
    return obra?.nome || "Selecione uma obra";
  }, [obraId, obrasDisponiveis]);

  const fichasList = (fichas.data as any[]) || [];
  const allSelected = fichasList.length > 0 && selecionados.length === fichasList.length;

  if (!companyId || !obraId) {
    return (
      <DashboardLayout title="Databook de Obra" subtitle="Selecione uma empresa e obra">
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <BookOpen className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg font-medium">Selecione uma empresa e obra no menu acima</p>
          <p className="text-sm mt-1">O Databook agrupa fichas técnicas de todos os materiais da obra</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Databook de Obra" subtitle={obraNome}>
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b">
          {[
            { key: "dashboard" as const, label: "Dashboard", icon: BarChart3 },
            { key: "fichas" as const, label: "Fichas Técnicas", icon: FileText },
            { key: "terceiros" as const, label: "Entregas Terceiros", icon: Building2 },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setAbaAtiva(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                abaAtiva === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
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
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { label: "Total", value: dashboard.data?.totais?.total || 0, color: "text-gray-700" },
                { label: "Pendente IA", value: dashboard.data?.totais?.pendente_ia || 0, color: "text-amber-600" },
                { label: "Gerado", value: dashboard.data?.totais?.gerado || 0, color: "text-blue-600" },
                { label: "Revisado", value: dashboard.data?.totais?.revisado || 0, color: "text-indigo-600" },
                { label: "Enviado", value: dashboard.data?.totais?.enviado || 0, color: "text-purple-600" },
                { label: "Aprovado", value: dashboard.data?.totais?.aprovado || 0, color: "text-emerald-600" },
                { label: "Reprovado", value: dashboard.data?.totais?.reprovado || 0, color: "text-red-600" },
              ].map(card => (
                <div key={card.label} className="bg-white rounded-lg border p-3 text-center">
                  <p className="text-xs text-gray-500">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                </div>
              ))}
            </div>

            {/* Progress */}
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Progresso Geral</h3>
              <ProgressBar
                value={(dashboard.data?.totais?.aprovado || 0) + (dashboard.data?.totais?.enviado || 0) + (dashboard.data?.totais?.revisado || 0)}
                max={dashboard.data?.totais?.total || 1}
                color="bg-emerald-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {dashboard.data?.totais?.aprovado || 0} aprovados + {dashboard.data?.totais?.enviado || 0} enviados + {dashboard.data?.totais?.revisado || 0} revisados de {dashboard.data?.totais?.total || 0} fichas
              </p>
            </div>

            {/* Per Discipline */}
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Por Disciplina</h3>
              <div className="space-y-2">
                {((dashboard.data?.disciplinas || []) as any[]).map((d: any) => (
                  <div key={d.disciplina} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-40 truncate">{d.disciplina}</span>
                    <div className="flex-1">
                      <ProgressBar
                        value={parseInt(d.aprovado || "0") + parseInt(d.enviado || "0") + parseInt(d.revisado || "0")}
                        max={parseInt(d.total || "1")}
                        color="bg-blue-500"
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-12 text-right">{d.total} itens</span>
                  </div>
                ))}
              </div>
              {((dashboard.data?.disciplinas || []) as any[]).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Nenhuma ficha gerada ainda</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => gerarFichasOC.mutate({ companyId, obraId, userName })}
                disabled={gerarFichasOC.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {gerarFichasOC.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Package className="w-4 h-4 mr-1" />}
                Importar Itens de OCs
              </Button>
              <Button
                onClick={() => gerarEspecsLote.mutate({ companyId, obraId })}
                disabled={gerarEspecsLote.isPending}
                variant="outline"
              >
                {gerarEspecsLote.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
                Gerar Especificações IA (Lote)
              </Button>
              <Button
                onClick={() => gerarPdfIndice.mutate({ companyId, obraId })}
                disabled={gerarPdfIndice.isPending}
                variant="outline"
              >
                {gerarPdfIndice.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}
                Exportar Índice PDF
              </Button>
            </div>
          </div>
        )}

        {/* Fichas Tab */}
        {abaAtiva === "fichas" && (
          <div className="space-y-3">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-lg border">
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
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2">
                <span className="text-sm text-blue-700 font-medium">{selecionados.length} selecionados</span>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => alterarStatusLote.mutate({ companyId, fichaIds: selecionados, novoStatus: "revisado", userName })}>
                  Marcar Revisado
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => alterarStatusLote.mutate({ companyId, fichaIds: selecionados, novoStatus: "enviado", userName })}>
                  Marcar Enviado
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => alterarStatusLote.mutate({ companyId, fichaIds: selecionados, novoStatus: "aprovado", userName })}>
                  Aprovar
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelecionados([])}>
                  Limpar
                </Button>
              </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-lg border overflow-hidden">
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
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-32">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fichasList.map((f: any) => (
                    <TableRow key={f.id} className="cursor-pointer hover:bg-gray-50">
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selecionados.includes(f.id)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelecionados(prev => [...prev, f.id]);
                            else setSelecionados(prev => prev.filter(id => id !== f.id));
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        DATABOOK-{String(f.numero_sequencial).padStart(3, "0")}
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
                      <TableCell><StatusBadge status={f.status} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                            setFichaDialog(f);
                            setEditEspecificacoes(f.especificacoes || "");
                            setEditObservacoes(f.observacoes || "");
                            setEditDisciplina(f.disciplina || "Outros");
                          }}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {f.status === "pendente_ia" && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => gerarEspecIA.mutate({ companyId, fichaId: f.id })} disabled={gerarEspecIA.isPending}>
                              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => gerarPdfFicha.mutate({ companyId, fichaId: f.id })} disabled={gerarPdfFicha.isPending}>
                            <FileDown className="w-3.5 h-3.5 text-gray-500" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => {
                            if (confirm("Excluir esta ficha?")) excluirFicha.mutate({ companyId, fichaId: f.id });
                          }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {fichasList.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-gray-400">
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

        {/* Ficha Detail Dialog */}
        <Dialog open={!!fichaDialog} onOpenChange={(open) => { if (!open) setFichaDialog(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                DATABOOK-{String(fichaDialog?.numero_sequencial || 0).padStart(3, "0")}
              </DialogTitle>
            </DialogHeader>
            {fichaDialog && (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-gray-500">Descrição</Label>
                  <p className="text-sm font-medium">{fichaDialog.descricao}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Fornecedor</Label>
                    <p className="text-sm">{fichaDialog.fornecedor_nome || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">OC/Contrato</Label>
                    <p className="text-sm">{fichaDialog.contrato_numero || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Status</Label>
                    <div className="mt-1"><StatusBadge status={fichaDialog.status} /></div>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">EAP</Label>
                    <p className="text-sm font-mono">{fichaDialog.eap_codigo || "—"}</p>
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
                    rows={6}
                    className="mt-1 text-sm"
                    placeholder="Especificações técnicas do produto..."
                  />
                  <div className="flex gap-1 mt-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => gerarEspecIA.mutate({ companyId, fichaId: fichaDialog.id })} disabled={gerarEspecIA.isPending}>
                      {gerarEspecIA.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                      Gerar com IA
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => buscarFoto.mutate({ companyId, fichaId: fichaDialog.id })} disabled={buscarFoto.isPending}>
                      {buscarFoto.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Image className="w-3 h-3 mr-1" />}
                      Buscar Foto IA
                    </Button>
                  </div>
                </div>

                {fichaDialog.foto_url && (
                  <div>
                    <Label className="text-xs text-gray-500">Foto do Produto</Label>
                    <div className="mt-1 border rounded-lg overflow-hidden bg-gray-50 p-2">
                      <img src={fichaDialog.foto_url} alt={fichaDialog.descricao} className="max-h-48 object-contain mx-auto" onError={(e) => { (e.target as any).style.display = "none"; }} />
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-xs text-gray-500">Observações</Label>
                  <Textarea
                    value={editObservacoes}
                    onChange={(e) => setEditObservacoes(e.target.value)}
                    rows={3}
                    className="mt-1 text-sm"
                    placeholder="Observações adicionais..."
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button size="sm" onClick={() => {
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
                    <Button size="sm" variant="outline" onClick={() => { alterarStatus.mutate({ companyId, fichaId: fichaDialog.id, novoStatus: "revisado", userName }); setFichaDialog(null); }}>
                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> Marcar Revisado
                    </Button>
                  )}
                  {fichaDialog.status === "revisado" && (
                    <Button size="sm" variant="outline" onClick={() => { alterarStatus.mutate({ companyId, fichaId: fichaDialog.id, novoStatus: "enviado", userName }); setFichaDialog(null); }}>
                      <Send className="w-3.5 h-3.5 mr-1" /> Enviar ao Cliente
                    </Button>
                  )}
                  {fichaDialog.status === "enviado" && (
                    <>
                      <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => { alterarStatus.mutate({ companyId, fichaId: fichaDialog.id, novoStatus: "aprovado", userName }); setFichaDialog(null); }}>
                        <ThumbsUp className="w-3.5 h-3.5 mr-1" /> Aprovar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => {
                        const motivo = prompt("Motivo da reprovação:");
                        if (motivo) { alterarStatus.mutate({ companyId, fichaId: fichaDialog.id, novoStatus: "reprovado", userName, motivo }); setFichaDialog(null); }
                      }}>
                        <ThumbsDown className="w-3.5 h-3.5 mr-1" /> Reprovar
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" onClick={() => gerarPdfFicha.mutate({ companyId, fichaId: fichaDialog.id })} disabled={gerarPdfFicha.isPending}>
                    <FileDown className="w-3.5 h-3.5 mr-1" /> PDF
                  </Button>
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
      </div>
    </DashboardLayout>
  );
}
