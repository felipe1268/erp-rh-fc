import React, { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { popNavBack } from "@/lib/navHistory";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Search, Loader2, CalendarRange, Building2, User, DollarSign,
  TrendingUp, Clock, CheckCircle2, AlertTriangle, Trash2, Eye, MapPin, ArrowLeft, Pencil,
  Info, FolderPlus, FileText, CheckCircle, Sparkles, ChevronRight,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import EfetivoGlobalIA from "./EfetivoGlobalIA";

const n = (v: any) => parseFloat(v || "0") || 0;

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusBadge(status: string) {
  const s = status?.toLowerCase() ?? "";
  if (s.includes("conclu")) return "bg-emerald-100 text-emerald-700";
  if (s.includes("atraso") || s.includes("suspen")) return "bg-red-100 text-red-700";
  if (s.includes("parado")) return "bg-gray-100 text-gray-600";
  return "bg-blue-100 text-blue-700";
}
function statusIcon(status: string) {
  const s = status?.toLowerCase() ?? "";
  if (s.includes("conclu")) return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (s.includes("atraso") || s.includes("suspen")) return <AlertTriangle className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

const STATUS_OPTIONS = [
  "Em andamento", "Concluído", "Suspenso", "Atrasado", "Planejamento",
];

export default function PlanejamentoLista() {
  const [, setLocation] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;
  const { isAdminMaster, isSensitiveHidden, isSomenteVisualizacao, canCreatePage, canEditPage, canDeletePage } = usePermissions();
  const hideFinancial = !isAdminMaster && isSensitiveHidden("planejamento", "valores_planejamento");
  const canCreate = isAdminMaster || canCreatePage("planejamento", "projetos");
  const canEdit = isAdminMaster || canEditPage("planejamento", "projetos");
  const canDelete = isAdminMaster || canDeletePage("planejamento", "projetos");

  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [confirmExclusao, setConfirmExclusao] = useState<{ id: number; nome: string; cliente?: string | null } | null>(null);

  // Formulário novo projeto
  const [form, setForm] = useState({
    obraId: "",
    status: "Em andamento",
    descricao: "",
  });

  // Edição de projeto existente
  const [editandoProjeto, setEditandoProjeto] = useState<any | null>(null);
  const [formEdit, setFormEdit] = useState({
    nome: "",
    cliente: "",
    local: "",
    responsavel: "",
    dataInicio: "",
    dataTerminoContratual: "",
    valorContrato: "",
    status: "Em andamento",
    descricao: "",
  });

  function abrirEdicao(proj: any) {
    const obraVinculada = (obras as any[]).find((o: any) => o.id === proj.obraId);
    setFormEdit({
      nome:                  proj.nome ?? "",
      cliente:               proj.cliente || obraVinculada?.cliente || "",
      local:                 proj.local || (obraVinculada
                               ? [
                                   obraVinculada.endereco,
                                   [obraVinculada.cidade, obraVinculada.estado].filter(Boolean).join(" / "),
                                 ].filter(Boolean).join(", ")
                               : ""),
      responsavel:           proj.responsavel || obraVinculada?.responsavel || "",
      dataInicio:            proj.dataInicio ?? "",
      dataTerminoContratual: proj.dataTerminoContratual ?? "",
      valorContrato:         proj.valorContrato ? String(n(proj.valorContrato)) : (obraVinculada?.valorContrato ? String(n(obraVinculada.valorContrato)) : ""),
      status:                proj.status ?? "Em andamento",
      descricao:             proj.descricao ?? "",
    });
    setEditandoProjeto(proj);
  }

  const utils = trpc.useUtils();
  const { data: projetos = [], isLoading } = trpc.planejamento.listarProjetos.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: obras = [] } = trpc.obras.list.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: orcamentos = [] } = trpc.orcamento.list.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  // Obras que já possuem planejamento — filtradas do select
  const obraIdsComPlanejamento = useMemo(() =>
    new Set((projetos as any[]).map((p: any) => p.obraId).filter(Boolean)),
  [projetos]);

  // Apenas obras que possuem orçamento cadastrado
  const obraIdsComOrcamento = useMemo(() =>
    new Set((orcamentos as any[]).map((o: any) => o.obraId).filter(Boolean)),
  [orcamentos]);

  const obrasDisponiveis = useMemo(() =>
    (obras as any[]).filter((o: any) =>
      !obraIdsComPlanejamento.has(o.id) && obraIdsComOrcamento.has(o.id)
    ),
  [obras, obraIdsComPlanejamento, obraIdsComOrcamento]);

  const obraSelecionada = useMemo(() =>
    (obras as any[]).find((o: any) => String(o.id) === form.obraId) ?? null,
  [obras, form.obraId]);

  // Orçamento vinculado automaticamente pela obra selecionada
  const orcamentoAutoVinculado = useMemo(() => {
    if (!obraSelecionada) return null;
    return (orcamentos as any[]).find((o: any) => o.obraId === obraSelecionada.id) ?? null;
  }, [orcamentos, obraSelecionada]);

  const criarMutation = trpc.planejamento.criarProjeto.useMutation({
    onSuccess: () => { utils.planejamento.listarProjetos.invalidate(); setModalAberto(false); resetForm(); },
    onError: (err) => { alert(err.message || "Erro ao criar planejamento."); },
  });
  const excluirMutation = trpc.planejamento.excluirProjeto.useMutation({
    onSuccess: () => { utils.planejamento.listarProjetos.invalidate(); setExcluindo(null); setConfirmExclusao(null); },
    onError: (err) => { alert(err.message || "Erro ao excluir o projeto."); setConfirmExclusao(null); },
  });

  const editarMutation = trpc.planejamento.atualizarProjeto.useMutation({
    onSuccess: () => { utils.planejamento.listarProjetos.invalidate(); setEditandoProjeto(null); },
    onError: (err) => { alert(err.message || "Erro ao salvar as alterações."); },
  });

  function handleEditar() {
    if (!editandoProjeto) return;
    editarMutation.mutate({
      id:                    editandoProjeto.id,
      nome:                  formEdit.nome || undefined,
      cliente:               formEdit.cliente || undefined,
      local:                 formEdit.local || undefined,
      responsavel:           formEdit.responsavel || undefined,
      dataInicio:            formEdit.dataInicio || undefined,
      dataTerminoContratual: formEdit.dataTerminoContratual || undefined,
      valorContrato:         formEdit.valorContrato ? n(formEdit.valorContrato) : undefined,
      status:                formEdit.status || undefined,
      descricao:             formEdit.descricao || undefined,
    });
  }

  function resetForm() {
    setForm({ obraId: "", status: "Em andamento", descricao: "" });
  }

  function handleCriar() {
    if (!obraSelecionada) return;
    const local = [obraSelecionada.cidade, obraSelecionada.estado].filter(Boolean).join(" / ")
      || obraSelecionada.endereco || undefined;
    criarMutation.mutate({
      companyId,
      obraId:                obraSelecionada.id,
      nome:                  obraSelecionada.nome,
      cliente:               obraSelecionada.cliente || undefined,
      local:                 local,
      responsavel:           obraSelecionada.responsavel || undefined,
      dataInicio:            obraSelecionada.dataInicio || undefined,
      dataTerminoContratual: obraSelecionada.dataPrevisaoFim || undefined,
      valorContrato:         obraSelecionada.valorContrato ? parseFloat(obraSelecionada.valorContrato) : undefined,
      status:                form.status,
      descricao:             form.descricao || undefined,
      orcamentoId:           orcamentoAutoVinculado?.id ?? undefined,
    });
  }

  const [showEfetivoIA, setShowEfetivoIA] = useState(false);

  const filtrados = projetos.filter(p =>
    [p.nome, p.cliente, p.local, p.responsavel].some(v =>
      v?.toLowerCase().includes(busca.toLowerCase())
    )
  );

  return (
    <DashboardLayout>
      <div className="p-5">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Button
              variant="outline" size="sm"
              className="gap-1.5 text-slate-600"
              onClick={() => { const prev = popNavBack(); if (prev) setLocation(prev); else if (window.history.length > 1) window.history.back(); else setLocation("/planejamento"); }}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-blue-600" />
                Planejamento de Obras
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Cronograma · Curva S · REFIS · Controle de Avanço
              </p>
            </div>
          </div>
          <DraggableCommandBar barId="planejamento-lista" items={[
            ...(canCreate ? [{ id: "novo-projeto", node: <Button onClick={() => setModalAberto(true)} className="gap-2 bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4" /> Novo Projeto</Button> }] : []),
          ]} />
        </div>

        {/* KPIs rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total de Projetos", value: projetos.length, icon: <Building2 className="h-4 w-4" />, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Em Andamento", value: projetos.filter(p => p.status?.toLowerCase().replace(/_/g, " ").includes("andamento")).length, icon: <TrendingUp className="h-4 w-4" />, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Com Atraso", value: projetos.filter(p => {
              const st = (p.status || "").toLowerCase().replace(/_/g, " ");
              if (st.includes("conclu")) return false;
              const prazo = p.dataTerminoContratual;
              if (!prazo) return false;
              const hoje = new Date().toISOString().split("T")[0];
              return String(prazo).slice(0, 10) < hoje;
            }).length, icon: <AlertTriangle className="h-4 w-4" />, color: "text-red-600", bg: "bg-red-50" },
            ...(!hideFinancial ? [{ label: "Valor Total", value: formatBRL(projetos.reduce((s, p) => s + (n(p.valorContrato) || n((p as any).orcamentoValorNegociado) || n((p as any).orcamentoTotalVenda)), 0)), icon: <DollarSign className="h-4 w-4" />, color: "text-purple-600", bg: "bg-purple-50" }] : []),
          ].map((k, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg ${k.bg} ${k.color} flex items-center justify-center shrink-0`}>
                {k.icon}
              </div>
              <div>
                <p className="text-[10px] text-slate-500 leading-tight">{k.label}</p>
                <p className={`text-base font-bold ${k.color} leading-tight mt-0.5`}>{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Efetivo × IA — abre em tela própria (não fica sempre aberto p/ não poluir a lista).
            Guard: se a empresa for desmarcada/trocada com o painel aberto, volta pro modo lista. */}
        {showEfetivoIA && !!companyId ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Button
                variant="outline" size="sm"
                className="gap-1.5 text-slate-600"
                onClick={() => setShowEfetivoIA(false)}
              >
                <ArrowLeft className="h-4 w-4" /> Voltar aos projetos
              </Button>
            </div>
            {!!companyId && <EfetivoGlobalIA companyId={companyId} />}
          </div>
        ) : (
          <>
            {!!companyId && (
              <button
                onClick={() => setShowEfetivoIA(true)}
                className="w-full mb-5 text-left rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 flex items-center gap-3 hover:from-slate-800 hover:to-slate-700 transition-colors shadow-sm"
              >
                <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Sparkles className="h-5 w-5 text-sky-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-sky-300/90">Painel Gerencial</p>
                  <p className="text-sm font-bold leading-tight">Efetivo × IA — Todas as Obras</p>
                  <p className="text-[11px] text-slate-300 mt-0.5">Cruza o efetivo de cada obra com o cronograma de 8 semanas e indica realocação ou aviso prévio por equipe.</p>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-sky-200 shrink-0">Abrir análise <ChevronRight className="h-4 w-4" /></span>
                <ChevronRight className="sm:hidden h-5 w-5 text-slate-300 shrink-0" />
              </button>
            )}

            {/* Rev. 5155 — Panorama de Mão de Obra da semana em TODAS as obras */}
            {!!companyId && <PanoramaMaoObraTodasObras companyId={companyId} />}

            {/* Busca */}
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar projeto, cliente, local..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Carregando projetos...</span>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <CalendarRange className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">Nenhum projeto de planejamento encontrado</p>
            <Button variant="outline" size="sm" onClick={() => setModalAberto(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Criar primeiro projeto
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtrados.map(projeto => (
              <div key={projeto.id}
                className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
                onClick={() => setLocation(`/planejamento/${projeto.id}`)}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-slate-800 text-sm leading-tight line-clamp-2 flex-1">
                      {projeto.nome}
                    </h3>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${statusBadge(projeto.status ?? "")}`}>
                      {statusIcon(projeto.status ?? "")}
                      {projeto.status}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-500">
                    {projeto.cliente && (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{projeto.cliente}</span>
                      </div>
                    )}
                    {projeto.responsavel && (
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{projeto.responsavel}</span>
                      </div>
                    )}
                    {(projeto.dataInicio || projeto.dataTerminoContratual) && (
                      <div className="flex items-center gap-1.5">
                        <CalendarRange className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {projeto.dataInicio ?? "—"} → {projeto.dataTerminoContratual ?? "—"}
                        </span>
                      </div>
                    )}
                    {!hideFinancial && (n(projeto.valorContrato) > 0 || n((projeto as any).orcamentoValorNegociado) > 0 || n((projeto as any).orcamentoTotalVenda) > 0) && (
                      <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
                        <DollarSign className="h-3.5 w-3.5 shrink-0" />
                        <span>{formatBRL(n(projeto.valorContrato) || n((projeto as any).orcamentoValorNegociado) || n((projeto as any).orcamentoTotalVenda))}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 px-4 py-2 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    Criado {new Date(projeto.criadoEm ?? "").toLocaleDateString("pt-BR")}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => { e.stopPropagation(); setLocation(`/planejamento/${projeto.id}`); }}
                      className="p-1 rounded hover:bg-blue-50 text-blue-500"
                      title="Abrir"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {canEdit && (
                    <button
                      onClick={e => { e.stopPropagation(); abrirEdicao(projeto); }}
                      className="p-1 rounded hover:bg-amber-50 text-amber-500"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    )}
                    {canDelete && (
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmExclusao({ id: projeto.id, nome: projeto.nome, cliente: projeto.cliente }); }}
                      className="p-1 rounded hover:bg-red-50 text-red-400"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
          </>
        )}

        {/* ── Modal Editar Projeto ──────────────────────────────────────────── */}
        <Dialog open={!!editandoProjeto} onOpenChange={open => { if (!open) setEditandoProjeto(null); }}>
          <DialogContent className="max-w-lg" style={{ background: "#ffffff", color: "#111827" }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-amber-500" />
                Editar Projeto
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-4 mt-1">
              {/* Nome */}
              <div>
                <Label className="text-xs font-medium">Nome do Projeto</Label>
                <Input
                  value={formEdit.nome}
                  onChange={e => setFormEdit(f => ({ ...f, nome: e.target.value }))}
                  className="mt-1 text-sm"
                />
              </div>

              {/* Cliente + Responsável */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Cliente</Label>
                  <Input
                    value={formEdit.cliente}
                    onChange={e => setFormEdit(f => ({ ...f, cliente: e.target.value }))}
                    className="mt-1 text-sm"
                    placeholder="Nome do cliente"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium">Responsável</Label>
                  <Input
                    value={formEdit.responsavel}
                    onChange={e => setFormEdit(f => ({ ...f, responsavel: e.target.value }))}
                    className="mt-1 text-sm"
                    placeholder="Engenheiro responsável"
                  />
                </div>
              </div>

              {/* Local */}
              <div>
                <Label className="text-xs font-medium">Local / Endereço</Label>
                <Input
                  value={formEdit.local}
                  onChange={e => setFormEdit(f => ({ ...f, local: e.target.value }))}
                  className="mt-1 text-sm"
                  placeholder="Cidade / Estado ou endereço"
                />
              </div>

              {/* Datas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Data de Início</Label>
                  <Input
                    type="date"
                    value={formEdit.dataInicio}
                    onChange={e => setFormEdit(f => ({ ...f, dataInicio: e.target.value }))}
                    className="mt-1 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium">Término Contratual</Label>
                  <Input
                    type="date"
                    value={formEdit.dataTerminoContratual}
                    onChange={e => setFormEdit(f => ({ ...f, dataTerminoContratual: e.target.value }))}
                    className="mt-1 text-sm"
                  />
                </div>
              </div>

              {/* Valor do contrato + Status */}
              <div className={`grid ${hideFinancial ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                {!hideFinancial && (
                <div>
                  <Label className="text-xs font-medium">Valor do Contrato (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={formEdit.valorContrato}
                    onChange={e => setFormEdit(f => ({ ...f, valorContrato: e.target.value }))}
                    className="mt-1 text-sm"
                    placeholder="0,00"
                  />
                </div>
                )}
                <div>
                  <Label className="text-xs font-medium">Status da Obra</Label>
                  <select
                    value={formEdit.status}
                    onChange={e => setFormEdit(f => ({ ...f, status: e.target.value }))}
                    className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                  >
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Observações */}
              <div>
                <Label className="text-xs font-medium">Observações</Label>
                <textarea
                  value={formEdit.descricao}
                  onChange={e => setFormEdit(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Informações adicionais..."
                  className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background resize-none"
                  rows={2}
                />
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" onClick={() => setEditandoProjeto(null)}>Cancelar</Button>
                <Button
                  disabled={!formEdit.nome || editarMutation.isPending}
                  onClick={handleEditar}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {editarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Alterações"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ───────────────────────────────────────────────────────────────
            Modal novo projeto — Rev. 2428
            Identidade FC (faixa #1B2A4A no header), shadcn Select/Textarea,
            min-w-0 estratégico (mata scroll horizontal causado por nomes
            longos de obra), DialogFooter separado com border-t.
            ─────────────────────────────────────────────────────────────── */}
        <Dialog open={modalAberto} onOpenChange={open => { setModalAberto(open); if (!open) resetForm(); }}>
          <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
            {/* Faixa azul FC */}
            <div
              className="flex items-center gap-3 px-6 py-4 border-b border-[#0f1a30]"
              style={{
                background: "linear-gradient(135deg, #1B2A4A 0%, #243456 100%)",
                printColorAdjust: "exact",
              }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 border border-white/15">
                <FolderPlus className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-white text-base font-semibold leading-tight tracking-wide">
                  Novo Projeto de Planejamento
                </DialogTitle>
                <p className="text-[11px] text-white/60 mt-0.5 tracking-wider uppercase">
                  Cronograma · Curva S · REFIS · Controle de Avanço
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

              {obrasDisponiveis.length === 0 && (
                <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <Info className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-semibold mb-0.5">Nenhuma obra disponível para planejamento</p>
                    <p className="text-amber-700 leading-relaxed">
                      Para criar um planejamento, a obra precisa ter um <strong>orçamento cadastrado e vinculado</strong>.
                      Acesse <strong>Orçamento</strong> no menu, cadastre o orçamento da obra e volte aqui.
                    </p>
                  </div>
                </div>
              )}

              {/* Seleção da Obra */}
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Selecionar Obra <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={form.obraId}
                  onValueChange={v => setForm(f => ({ ...f, obraId: v }))}
                  disabled={obrasDisponiveis.length === 0}
                >
                  <SelectTrigger className="w-full min-w-0 h-10 bg-white">
                    <SelectValue placeholder="— Selecione uma obra —" className="truncate" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[min(28rem,var(--radix-select-content-available-width))]">
                    {obrasDisponiveis.map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)} className="items-start">
                        <span className="block min-w-0 whitespace-normal break-words leading-snug">
                          <span className="font-medium">{o.nome}</span>
                          {o.cliente ? <span className="text-muted-foreground"> · {o.cliente}</span> : null}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Preview dos dados da obra selecionada */}
              {obraSelecionada && (
                <div
                  className="rounded-lg border border-slate-200 p-3.5 space-y-2 text-xs text-slate-700 min-w-0"
                  style={{ background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)" }}
                >
                  {obraSelecionada.cliente && (
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="h-3.5 w-3.5 text-[#1B2A4A] shrink-0" />
                      <span className="truncate">{obraSelecionada.cliente}</span>
                    </div>
                  )}
                  {obraSelecionada.responsavel && (
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="h-3.5 w-3.5 text-[#1B2A4A] shrink-0" />
                      <span className="truncate">{obraSelecionada.responsavel}</span>
                    </div>
                  )}
                  {(obraSelecionada.cidade || obraSelecionada.estado || obraSelecionada.endereco) && (
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-3.5 w-3.5 text-[#1B2A4A] shrink-0" />
                      <span className="truncate">
                        {[obraSelecionada.cidade, obraSelecionada.estado].filter(Boolean).join(" / ")
                          || obraSelecionada.endereco}
                      </span>
                    </div>
                  )}
                  {(obraSelecionada.dataInicio || obraSelecionada.dataPrevisaoFim) && (
                    <div className="flex items-center gap-2 min-w-0">
                      <CalendarRange className="h-3.5 w-3.5 text-[#1B2A4A] shrink-0" />
                      <span className="truncate">
                        {obraSelecionada.dataInicio ?? "—"} → {obraSelecionada.dataPrevisaoFim ?? "—"}
                      </span>
                    </div>
                  )}
                  {!hideFinancial && obraSelecionada.valorContrato && n(obraSelecionada.valorContrato) > 0 && (
                    <div className="flex items-center gap-2 min-w-0 pt-1.5 border-t border-slate-200/70">
                      <DollarSign className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span className="font-semibold text-emerald-700">
                        {formatBRL(n(obraSelecionada.valorContrato))}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Orçamento auto-vinculado + Status */}
              <div className="grid grid-cols-2 gap-3 min-w-0">
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Orçamento vinculado
                  </Label>
                  <div className={`h-10 w-full border rounded-md px-3 flex items-center gap-2 text-xs min-w-0 ${
                    orcamentoAutoVinculado
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-slate-50 text-slate-400 italic"
                  }`}>
                    {orcamentoAutoVinculado
                      ? <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      : <FileText className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
                    <span className="truncate font-medium">
                      {orcamentoAutoVinculado
                        ? (orcamentoAutoVinculado.descricao ?? orcamentoAutoVinculado.codigo ?? `#${orcamentoAutoVinculado.id}`)
                        : "Nenhum orçamento"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Status
                  </Label>
                  <Select
                    value={form.status}
                    onValueChange={v => setForm(f => ({ ...f, status: v }))}
                  >
                    <SelectTrigger className="w-full h-10 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Observações */}
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Observações <span className="font-normal text-slate-400 normal-case">(opcional)</span>
                </Label>
                <Textarea
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Informações adicionais sobre o projeto..."
                  className="resize-none text-sm bg-white"
                  rows={2}
                />
              </div>
            </div>

            {/* Footer */}
            <DialogFooter className="px-6 py-4 border-t border-slate-200 bg-slate-50/60 gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={() => { setModalAberto(false); resetForm(); }}
                disabled={criarMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                disabled={!form.obraId || criarMutation.isPending}
                onClick={handleCriar}
                className="bg-[#1B2A4A] hover:bg-[#243456] text-white gap-2 min-w-[130px]"
              >
                {criarMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</>
                  : <><FolderPlus className="h-4 w-4" /> Criar Projeto</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── AlertDialog Excluir Projeto (substitui window.confirm nativo) ── */}
        <AlertDialog
          open={!!confirmExclusao}
          onOpenChange={(open) => { if (!open && !excluirMutation.isPending) setConfirmExclusao(null); }}
        >
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Excluir projeto
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 pt-1 text-sm text-slate-600">
                  <p>
                    Tem certeza de que deseja excluir o projeto{" "}
                    <span className="font-semibold text-slate-900">"{confirmExclusao?.nome}"</span>
                    {confirmExclusao?.cliente ? <> — <span className="text-slate-700">{confirmExclusao.cliente}</span></> : null}?
                  </p>
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <strong>Atenção:</strong> esta ação remove permanentemente o cronograma, curva S, REFIS e demais dados vinculados ao projeto. <span className="font-semibold">Não pode ser desfeita.</span>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={excluirMutation.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (confirmExclusao) excluirMutation.mutate({ id: confirmExclusao.id });
                }}
                disabled={excluirMutation.isPending}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                {excluirMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Excluindo...</>
                  : <><Trash2 className="h-4 w-4 mr-2" />Excluir projeto</>}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Rev. 5155 — Panorama de Mão de Obra (todas as obras). Mesma estimativa
// consultiva do painel da Programação Semanal, agregada por obra, janela dos
// próximos 7 dias. Mostra quem PRECISA de gente × quem tem SOBRA p/ realocar.
// ════════════════════════════════════════════════════════════════════════════
function PanoramaMaoObraTodasObras({ companyId }: { companyId: number }) {
  const [aberto, setAberto] = useState(false);
  // Rev. 5163 — Regras de apoio de equipamento (guincho → 2 serventes etc.)
  const [regrasAbertas, setRegrasAbertas] = useState(false);
  const [regrasDraft, setRegrasDraft] = useState<Array<{ termo: string; funcao: string; qtd: number }> | null>(null);
  const utils = trpc.useUtils();
  const regrasQ = trpc.planejamento.apoioEquipRegrasGet.useQuery({ companyId }, { enabled: aberto && companyId > 0 });
  const regras = regrasDraft ?? ((regrasQ.data as any)?.regras || []);
  const salvarRegras = trpc.planejamento.apoioEquipRegrasSet.useMutation({
    onSuccess: () => {
      toast.success("Regras de apoio salvas!");
      setRegrasDraft(null);
      utils.planejamento.apoioEquipRegrasGet.invalidate();
      utils.planejamento.estimativaMaoObraTodasObras.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const hoje = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fim = new Date(hoje); fim.setDate(fim.getDate() + 6);
  const semanaIni = iso(hoje), semanaFim = iso(fim);
  const q = trpc.planejamento.estimativaMaoObraTodasObras.useQuery(
    { companyId, semanaIni, semanaFim },
    { enabled: aberto && companyId > 0, staleTime: 120_000 }
  );
  const d: any = q.data;
  const obras: any[] = d?.obras || [];
  const precisam = obras.filter((o) => o.faltas.length > 0 || o.semCorresp.length > 0);
  const comSobra = obras.filter((o) => o.candidatos.length > 0);

  // Rev. 5162 — Sugestões automáticas de realocação entre obras (CONSULTIVO —
  // o gestor decide). Cruza a função em falta na obra A com pessoas SEM
  // atividade da mesma função nas outras obras. Match tolerante: "PEDREIRO II"
  // casa com "PEDREIRO" (base sem nível/números romanos).
  const normFn = (s: string) => String(s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+(I{1,3}|IV|V)$/g, "").replace(/\s+\d+$/g, "").trim();
  const normNome = (s: string) => String(s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const sugestoes: Array<{ de: string; para: string; funcao: string; pessoas: any[]; deficit: number; soIntegrados?: string; barrados?: number }> = [];
  const usados = new Set<string>(); // pessoa só é sugerida 1x (nome+obra)
  for (const alvo of obras) {
    // Rev. 5164 — obra cujo cliente exige integração: só sugere quem JÁ está
    // integrado naquele cliente (terceiros ficam de fora — integração deles é
    // documental, não dá pra verificar automaticamente).
    const exigeIntegracao = !!alvo.integracao?.requer;
    const integrados = exigeIntegracao ? new Set((alvo.integracao.integradosNomes || []).map(normNome)) : null;
    for (const falta of alvo.faltas as any[]) {
      const base = normFn(falta.funcao);
      let restante = falta.deficit;
      let barrados = 0;
      for (const origem of obras) {
        if (restante <= 0) break;
        if (origem.projetoId === alvo.projetoId) continue;
        const candidatosFn = (origem.candidatos as any[]).filter((c: any) => {
          const key = `${origem.projetoId}|${c.nome}`;
          return !usados.has(key) && normFn(c.funcao) === base;
        });
        const aptos = exigeIntegracao
          ? candidatosFn.filter((c: any) => !c.terceiro && integrados!.has(normNome(c.nome)))
          : candidatosFn;
        barrados += candidatosFn.length - aptos.length;
        const disponiveis = aptos.slice(0, restante);
        if (disponiveis.length === 0) continue;
        disponiveis.forEach((c: any) => usados.add(`${origem.projetoId}|${c.nome}`));
        sugestoes.push({
          de: origem.projetoNome, para: alvo.projetoNome, funcao: falta.funcao,
          pessoas: disponiveis, deficit: falta.deficit,
          soIntegrados: exigeIntegracao ? alvo.integracao.cliente : undefined,
        });
        restante -= disponiveis.length;
      }
      // registra caso a exigência de integração tenha barrado todo mundo
      if (exigeIntegracao && restante > 0 && barrados > 0 && !sugestoes.some(s => s.para === alvo.projetoNome && s.funcao === falta.funcao)) {
        sugestoes.push({ de: "", para: alvo.projetoNome, funcao: falta.funcao, pessoas: [], deficit: falta.deficit, soIntegrados: alvo.integracao.cliente, barrados });
      }
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white shadow-sm">
      <button className="w-full text-left p-4 flex items-center gap-3" onClick={() => setAberto(!aberto)}>
        <div className="h-10 w-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
          <User className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-600">Painel Gerencial · Consultivo</p>
          <p className="text-sm font-bold leading-tight text-slate-800">Mão de Obra da Semana — Todas as Obras</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Compara a demanda das atividades dos próximos 7 dias com o efetivo disponível (descontando férias, atestados e afastados) e sugere realocações entre obras.</p>
        </div>
        <ChevronRight className={`h-5 w-5 text-slate-400 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`} />
      </button>
      {aberto && (
        <div className="px-4 pb-4 space-y-3">
          {q.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-4"><Loader2 className="h-4 w-4 animate-spin" /> Calculando todas as obras...</div>
          ) : obras.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">Nenhum projeto em andamento com revisão aprovada.</p>
          ) : (
            <>
              {/* Resumo cruzado: falta × sobra */}
              {(precisam.length > 0 && comSobra.length > 0) && (
                <div className="rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-[11px] text-slate-700">
                  <p className="font-bold text-blue-800 uppercase tracking-wide text-[9px] mb-1">Cruzamento da semana</p>
                  <p>
                    {precisam.length} obra{precisam.length !== 1 ? "s" : ""} precisando de gente · {comSobra.length} obra{comSobra.length !== 1 ? "s" : ""} com pessoas sem atividade programada — avalie realocar antes de contratar.
                  </p>
                </div>
              )}
              {/* Rev. 5165 — Quadro-resumo NO TOPO (pedido do user) */}
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600 bg-slate-50 px-3 py-2 border-b border-slate-200">📋 Quadro-Resumo da Semana — todas as obras</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-[9px] uppercase tracking-wide">
                        <th className="text-left px-3 py-1.5 font-bold">Obra</th>
                        <th className="text-center px-2 py-1.5 font-bold">Precisa na semana</th>
                        <th className="text-center px-2 py-1.5 font-bold">Tem na obra</th>
                        <th className="text-center px-2 py-1.5 font-bold">Ocioso / Faltando</th>
                        <th className="text-left px-3 py-1.5 font-bold text-red-600">O que falta</th>
                        <th className="text-center px-2 py-1.5 font-bold text-blue-600">Sem atividade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...obras].sort((a, b) => {
                        const sa = a.efetivoTotal - Math.ceil(a.totalPessoas);
                        const sb = b.efetivoTotal - Math.ceil(b.totalPessoas);
                        return sa - sb; // mais negativo (obra mais carente) primeiro
                      }).map((o) => {
                        const precisa = Math.ceil(o.totalPessoas);
                        const saldo = o.efetivoTotal - precisa;
                        const semAtividade = o.candidatos.length;
                        return (
                          <tr key={o.projetoId} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 max-w-[200px]">
                              <p className="font-semibold text-slate-800 truncate">{o.projetoNome}</p>
                              {/* Rev. 5167 — transparência da fonte da estimativa */}
                              {(o.fontes?.tcpo > 0 || o.fontes?.semEstimativa > 0) && (
                                <p className="flex flex-wrap gap-1 mt-0.5">
                                  {o.fontes.tcpo > 0 && (
                                    <span className="inline-flex items-center text-[8px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-px" title={`${o.fontes.tcpo} atividade(s) estimada(s) por composição TCPO (produtividade média de mercado) porque a composição do orçamento não existe no seu catálogo`}>
                                      TCPO ×{o.fontes.tcpo}
                                    </span>
                                  )}
                                  {o.fontes.semEstimativa > 0 && (
                                    <span className="inline-flex items-center text-[8px] font-bold text-red-700 bg-red-50 border border-red-200 rounded px-1 py-px" title={`${o.fontes.semEstimativa} atividade(s) da semana sem estimativa de mão de obra — o "Precisa" está SUBESTIMADO`}>
                                      ⚠ incompleta ×{o.fontes.semEstimativa}
                                    </span>
                                  )}
                                </p>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center tabular-nums font-bold text-slate-700">{precisa}</td>
                            <td className="px-2 py-1.5 text-center tabular-nums font-bold text-slate-700">{o.efetivoTotal}</td>
                            <td className={`px-2 py-1.5 text-center tabular-nums font-bold ${saldo < 0 ? "text-red-600" : saldo > 0 ? "text-blue-600" : "text-emerald-600"}`}>
                              {saldo > 0 ? `+${saldo}` : saldo}
                            </td>
                            <td className="px-3 py-1.5">
                              {/* Rev. 5166 — inclui TAMBÉM as funções que a obra nem tem (semCorresp) */}
                              {(o.faltas.length > 0 || o.semCorresp.length > 0) ? (
                                (() => {
                                  // Rev. 5167 — quadro limpo: mostra até 3 pendências; o resto vira "+N"
                                  const todas = [
                                    ...o.faltas.map((f: any) => `${f.deficit} ${f.funcao}`),
                                    ...o.semCorresp.map((f: string) => `${f} (ninguém na obra)`),
                                  ];
                                  const vis = todas.slice(0, 3);
                                  const resto = todas.length - vis.length;
                                  return (
                                    <span className="text-red-700 font-semibold" title={todas.join(" · ")}>
                                      {vis.join(" · ")}{resto > 0 ? <span className="text-slate-400 font-normal"> +{resto} outras</span> : null}
                                    </span>
                                  );
                                })()
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 className="h-3 w-3" /> Nada</span>
                              )}
                            </td>
                            <td className={`px-2 py-1.5 text-center tabular-nums font-bold ${semAtividade > 0 ? "text-blue-600" : "text-slate-300"}`}>{semAtividade > 0 ? semAtividade : "—"}</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                        <td className="px-3 py-1.5 text-slate-700">TOTAL</td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-slate-800">{obras.reduce((s, o) => s + Math.ceil(o.totalPessoas), 0)}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-slate-800">{obras.reduce((s, o) => s + o.efetivoTotal, 0)}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-slate-800">
                          {(() => { const t = obras.reduce((s, o) => s + (o.efetivoTotal - Math.ceil(o.totalPessoas)), 0); return t > 0 ? `+${t}` : t; })()}
                        </td>
                        <td className="px-3 py-1.5 text-red-600">{obras.reduce((s, o) => s + o.faltas.reduce((x: number, f: any) => x + f.deficit, 0), 0)} pessoa(s) de funções específicas</td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-blue-600">{obras.reduce((s, o) => s + o.candidatos.length, 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[9px] text-slate-500 px-3 py-2 bg-slate-50 border-t border-slate-200">
                  <strong>Ocioso / Faltando</strong> = Tem − Precisa (vermelho = falta gente no total; azul = gente ociosa dá pra realocar).
                  <strong> O que falta</strong> = as funções específicas em falta, incluindo as que a obra nem tem (ex.: LUCIANA precisa de pintor/eletricista mas a equipe é de serventes).
                  <strong> Sem atividade</strong> = pessoas na obra sem tarefa da função delas na semana — primeiras candidatas a realocação.
                  <strong> TCPO</strong> = atividades estimadas por composição TCPO (produtividade média de mercado) porque a composição do orçamento não existe no seu catálogo.
                  <strong> ⚠ incompleta</strong> = atividades sem nenhuma estimativa de MO — o "Precisa" dessa obra está subestimado.
                </p>
              </div>
              {/* Rev. 5165 — Sugestões de realocação AGRUPADAS por obra de destino (layout limpo) */}
              {sugestoes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 flex items-center gap-1.5">
                    💡 Sugestões de realocação da semana <span className="font-normal normal-case text-slate-400">— decisão é do gestor</span>
                  </p>
                  {Array.from(sugestoes.reduce((m, s) => {
                    if (!m.has(s.para)) m.set(s.para, [] as typeof sugestoes);
                    m.get(s.para)!.push(s);
                    return m;
                  }, new Map<string, typeof sugestoes>()).entries()).map(([para, grupo]) => (
                    <div key={para} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gradient-to-r from-emerald-50 to-white border-b border-slate-100">
                        <p className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5 min-w-0">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] shrink-0">🎯</span>
                          <span className="truncate">{para}</span>
                        </p>
                        {grupo[0]?.soIntegrados && (
                          <span className="inline-flex items-center text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-1.5 py-0.5 shrink-0">🪪 só integrados</span>
                        )}
                      </div>
                      <div className="divide-y divide-slate-100">
                        {grupo.map((s, i) => (
                          <div key={i} className="px-3 py-2">
                            {s.pessoas.length > 0 ? (
                              <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3">
                                <div className="shrink-0 sm:w-44">
                                  <span className="inline-flex items-center text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">
                                    +{s.pessoas.length} {s.funcao}
                                  </span>
                                  {s.pessoas.length < s.deficit && (
                                    <p className="text-[9px] text-slate-400 mt-0.5">falta {s.deficit} no total</p>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[9px] uppercase tracking-wide text-slate-400 mb-1">vindo de <span className="font-bold text-slate-600">{s.de}</span></p>
                                  <div className="flex flex-wrap gap-1">
                                    {s.pessoas.map((p: any, j: number) => <PessoaChip key={j} p={p} tom="azul" />)}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-600">
                                Precisa de <strong>{s.deficit} {s.funcao}</strong>, mas os {s.barrados} disponível(is) em outras obras <strong className="text-indigo-700">não têm integração no cliente</strong> — integrar antes ou contratar.
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="text-[9px] text-slate-400">Sugestão automática: pessoa da MESMA função, sem atividade programada na semana, em outra obra. Não considera distância entre obras nem funções de apoio (betoneira, guincho, transporte) — avalie antes de mover.</p>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {obras.map((o) => <PanoramaObraCard key={o.projetoId} o={o} />)}
              </div>
              {/* Rev. 5163 — Regras de apoio de equipamento (configurável) */}
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <button className="w-full text-left px-3 py-2 flex items-center justify-between bg-slate-50" onClick={() => setRegrasAbertas(!regrasAbertas)}>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">⚙️ Regras de apoio de equipamento ({regras.length})</span>
                  <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${regrasAbertas ? "rotate-90" : ""}`} />
                </button>
                {regrasAbertas && (
                  <div className="p-3 space-y-2">
                    <p className="text-[10px] text-slate-500">Equipamento ATIVO na obra (almoxarifado/frota de equipamentos) → funções exigidas. Ex.: GUINCHO → 2 SERVENTE (NR-18: 1 embaixo + 1 em cima). Entra no painel como exigência consultiva.</p>
                    {regras.map((r: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input className="h-8 text-xs flex-1" placeholder="Equipamento (ex.: GUINCHO)" value={r.termo}
                          onChange={(e) => { const n = [...regras]; n[i] = { ...n[i], termo: e.target.value }; setRegrasDraft(n); }} />
                        <span className="text-slate-400 text-xs shrink-0">→</span>
                        <Input className="h-8 text-xs w-16 text-center" type="number" min={1} max={20} value={r.qtd}
                          onChange={(e) => { const n = [...regras]; n[i] = { ...n[i], qtd: Math.max(1, parseInt(e.target.value) || 1) }; setRegrasDraft(n); }} />
                        <Input className="h-8 text-xs flex-1" placeholder="Função (ex.: SERVENTE)" value={r.funcao}
                          onChange={(e) => { const n = [...regras]; n[i] = { ...n[i], funcao: e.target.value }; setRegrasDraft(n); }} />
                        <button className="text-red-500 shrink-0 p-1" onClick={() => setRegrasDraft(regras.filter((_: any, j: number) => j !== i))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRegrasDraft([...regras, { termo: "", funcao: "", qtd: 1 }])}>
                        <Plus className="h-3 w-3 mr-1" /> Adicionar regra
                      </Button>
                      {regrasDraft !== null && (
                        <Button size="sm" className="h-7 text-xs" disabled={salvarRegras.isPending}
                          onClick={() => {
                            const limpas = regras.filter((r: any) => r.termo.trim().length >= 2 && r.funcao.trim().length >= 2)
                              .map((r: any) => ({ termo: r.termo.trim().toUpperCase(), funcao: r.funcao.trim().toUpperCase(), qtd: r.qtd }));
                            salvarRegras.mutate({ companyId, regras: limpas });
                          }}>
                          {salvarRegras.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar regras"}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <p className="text-[9px] text-slate-400">Janela: hoje → +6 dias. Estimativa consultiva (orçamento/CPU ou TCPO/SINAPI) — não altera cronograma nem % previsto. O painel por obra fica na Programação Semanal de cada projeto.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Rev. 5157 — chip de pessoa com FOTO (miniatura ?w=128, lazy) p/ o panorama.
function PessoaChip({ p, tom }: { p: any; tom: "azul" | "laranja" }) {
  // Rev. 5158 — clique na foto amplia (overlay simples, toque fecha)
  const [zoom, setZoom] = useState(false);
  const cores = tom === "azul"
    ? "bg-white border-blue-200 text-slate-700"
    : "bg-orange-50 border-orange-200 text-orange-800";
  const foto = p.foto ? `${p.foto}${p.foto.includes("?") ? "&" : "?"}w=128` : null;
  const iniciais = String(p.nome || "?").trim().split(/\s+/).map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className={`inline-flex items-center gap-1.5 border rounded-full pl-0.5 pr-2 py-0.5 text-[10px] ${cores}`}>
      {zoom && p.foto && (
        <span className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-6 cursor-zoom-out" onClick={() => setZoom(false)}>
          <span className="flex flex-col items-center gap-2 max-w-full">
            <img src={p.foto} alt={p.nome} className="max-h-[70vh] max-w-full rounded-xl object-contain shadow-2xl" />
            <span className="text-white text-sm font-semibold text-center">{p.nome}</span>
            <span className="text-white/60 text-[10px]">toque para fechar</span>
          </span>
        </span>
      )}
      {foto ? (
        <img src={foto} loading="lazy" alt="" className="h-5 w-5 rounded-full object-cover shrink-0 cursor-zoom-in" onClick={() => setZoom(true)} />
      ) : (
        <span className="h-5 w-5 rounded-full bg-slate-200 text-slate-500 text-[8px] font-bold flex items-center justify-center shrink-0">{iniciais}</span>
      )}
      <span className="font-semibold truncate max-w-[130px]">{p.nome}</span>
      <span className="text-slate-400 whitespace-nowrap">{p.funcao}</span>
      {p.terceiro && <span className="text-blue-600 font-bold">3º</span>}
      {p.atestados12m > 0 && <span className={`font-bold ${p.atestados12m >= 3 ? "text-red-600" : "text-amber-600"}`}>{p.atestados12m} atest.</span>}
      {p.motivo && <span className="font-bold">{p.motivo}</span>}
    </span>
  );
}

// Rev. 5157 — card por obra do panorama: números grandes, frases curtas e
// fotos; listas longas fecham em "+N ver todos" (poka-yoke visual).
function PanoramaObraCard({ o }: { o: any }) {
  const [verTodos, setVerTodos] = useState(false);
  const precisa = o.faltas.length > 0 || o.semCorresp.length > 0;
  const LIM = 8;
  // Rev. 5161 — separa nossa equipe dos terceiros (pedido do user)
  const candProprios: any[] = (o.candidatos as any[]).filter((c: any) => !c.terceiro);
  const candTerceiros: any[] = (o.candidatos as any[]).filter((c: any) => c.terceiro);
  const propriosVis = verTodos ? candProprios : candProprios.slice(0, LIM);
  const terceirosVis = verTodos ? candTerceiros : candTerceiros.slice(0, LIM);
  const resto = (candProprios.length - propriosVis.length) + (candTerceiros.length - terceirosVis.length);
  return (
    <div className={`rounded-lg border p-3 ${precisa ? "border-red-200 bg-red-50/40" : o.candidatos.length > 0 ? "border-blue-200 bg-blue-50/30" : "border-emerald-200 bg-emerald-50/30"}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-bold text-slate-800 truncate">{o.projetoNome}</p>
        {o.integracao?.requer && (
          <span className="inline-flex items-center text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-1.5 py-0.5 shrink-0">🪪 Exige integração</span>
        )}
        {precisa ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 shrink-0"><AlertTriangle className="h-3 w-3" /> Precisa de gente</span>
        ) : o.candidatos.length > 0 ? (
          <span className="text-[10px] font-bold text-blue-700 shrink-0">Tem sobra</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 shrink-0"><CheckCircle2 className="h-3 w-3" /> Equilibrada</span>
        )}
      </div>
      {/* Números grandes: precisa × tem */}
      <div className="flex items-center gap-4 mb-2">
        <div>
          <p className="text-lg font-bold tabular-nums text-slate-800 leading-none">{Math.ceil(o.totalPessoas)}</p>
          <p className="text-[9px] text-slate-500 uppercase tracking-wide mt-0.5">Precisa</p>
        </div>
        <div>
          <p className="text-lg font-bold tabular-nums text-slate-800 leading-none">{o.efetivoTotal}</p>
          <p className="text-[9px] text-slate-500 uppercase tracking-wide mt-0.5">Disponível</p>
        </div>
        {o.faltas.length > 0 && (
          <div className="ml-auto text-right">
            <p className="text-lg font-bold tabular-nums text-red-600 leading-none">{o.faltas.reduce((s: number, f: any) => s + f.deficit, 0)}</p>
            <p className="text-[9px] text-red-600 uppercase tracking-wide mt-0.5 font-bold">Faltando</p>
          </div>
        )}
      </div>
      {o.faltas.length > 0 && (
        <p className="text-[11px] text-red-700 font-semibold mb-1">🔴 Contratar/realocar: {o.faltas.map((f: any) => `${f.deficit} ${f.funcao}`).join(" · ")}</p>
      )}
      {o.semCorresp.length > 0 && (
        <p className="text-[10px] text-amber-700 mb-1.5">⚠️ Ninguém dessas funções na obra: {o.semCorresp.join(", ")}</p>
      )}
      {(o.apoio?.length || 0) > 0 && (
        <p className="text-[10px] text-purple-700 mb-1.5">🛠 Apoio de equipamento (regra): {o.apoio.map((a: any) => `${a.equipamento} ativo → ${a.qtd} ${a.funcao}`).join(" · ")}</p>
      )}
      {o.candidatos.length > 0 && (
        <div className="mb-1">
          <p className="text-[10px] font-bold text-blue-800 mb-1">🔄 Sem atividade na semana — dá pra realocar ({o.candidatos.length}):</p>
          {candProprios.length > 0 && (
            <div className="mb-1">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">👷 Nossa equipe ({candProprios.length})</p>
              <div className="flex flex-wrap gap-1">
                {propriosVis.map((c: any, j: number) => <PessoaChip key={j} p={c} tom="azul" />)}
              </div>
            </div>
          )}
          {candTerceiros.length > 0 && (
            <div className="mb-1">
              <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wide mb-0.5">🔵 Terceiros ({candTerceiros.length})</p>
              <div className="flex flex-wrap gap-1">
                {terceirosVis.map((c: any, j: number) => <PessoaChip key={j} p={c} tom="azul" />)}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {resto > 0 && (
              <button className="text-[10px] font-bold text-blue-700 underline underline-offset-2 px-1" onClick={() => setVerTodos(true)}>+{resto} ver todos</button>
            )}
            {verTodos && (candProprios.length > LIM || candTerceiros.length > LIM) && (
              <button className="text-[10px] font-bold text-slate-500 underline underline-offset-2 px-1" onClick={() => setVerTodos(false)}>mostrar menos</button>
            )}
          </div>
        </div>
      )}
      {o.indisponiveis.length > 0 && (
        <div className="mt-1.5">
          <p className="text-[10px] font-bold text-orange-700 mb-1">🟠 Fora da conta (férias/atestado/afastado):</p>
          <div className="flex flex-wrap gap-1">
            {o.indisponiveis.map((i: any, j: number) => <PessoaChip key={j} p={i} tom="laranja" />)}
          </div>
        </div>
      )}
    </div>
  );
}
