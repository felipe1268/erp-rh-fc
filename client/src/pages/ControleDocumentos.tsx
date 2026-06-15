import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import AdvAssinaturas from "./AdvAssinaturas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { buildFcDocument } from "@/lib/fcDocumentTemplate";
import { renderTemplate } from "@shared/documentTemplates";
import { formatCPF, fmtNum } from "@/lib/formatters";
import { nowBrasilia, todayBrasiliaLong } from "@/lib/dateUtils";
import { removeAccents } from "@/lib/searchUtils";
import {
  Search, FileText, AlertTriangle, ShieldAlert, GraduationCap, Stethoscope,
  Plus, Upload, Download, Eye, Trash2, FileUp, ClipboardList, Calendar, Pencil, Printer, FileDown, CheckSquare, Square, X, Paperclip, Clock, Shield, ExternalLink, Filter, CheckCircle2, Zap, Info, PenTool, Building2, BookOpen, Users, MessageSquare, Loader2, ChevronDown, ChevronRight, Lock, Sparkles, ClipboardCheck
} from "lucide-react";
import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import FullScreenDialog from "@/components/FullScreenDialog";
import DocumentPreviewDialog, { canPreviewFile } from "@/components/DocumentPreviewDialog";
import PersonPhoto from "@/components/PersonPhoto";
import { CipaBadge } from "@/components/CipaBadge";
import TermosResponsabilidadePanel from "@/components/controleDocumentos/TermosResponsabilidadePanel";
import { TRAINING_RULES, TRAINING_CATEGORIES, calcularDataValidade, type TrainingRule } from "../../../shared/trainingRules";

// ============ HELPERS ============
function StatusBadge({ status, diasRestantes }: { status: string; diasRestantes: number }) {
  if (status === "SUBSTITUÍDO") return <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100">SUBSTITUÍDO</Badge>;
  if (status === "VENCIDO") return <Badge variant="destructive">VENCIDO</Badge>;
  if (status.includes("DIAS PARA VENCER")) {
    const cor = diasRestantes <= 7 ? "bg-red-100 text-red-800" : diasRestantes <= 30 ? "bg-yellow-100 text-yellow-800" : "bg-orange-100 text-orange-800";
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cor}`}>{status}</span>;
  }
  return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">VÁLIDO</Badge>;
}

function formatTipoASO(tipo: string) {
  const map: Record<string, string> = { Admissional: "Admissional", Periodico: "Periódico", Retorno: "Retorno ao Trabalho", Mudanca_Funcao: "Mudança de Função", Demissional: "Demissional" };
  return map[tipo] || tipo;
}

function formatTipoAdv(tipo: string) {
  const map: Record<string, string> = { Verbal: "Verbal", Escrita: "Escrita", Suspensao: "Suspensão", JustaCausa: "Justa Causa", OSS: "OSS" };
  return map[tipo] || tipo;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

// ============ PAINEL DE INTEGRAÇÕES (Componente) ============
function IntegracoesPanel({ companyId, onClickEmployee }: { companyId: number; onClickEmployee: (id: number) => void }) {
  const [clienteFiltro, setClienteFiltro] = useState("todos");
  const [funcaoFiltro, setFuncaoFiltro] = useState("todos");
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [searchVal, setSearchVal] = useState("");
  // Rev. 1718 — Ordenação da tabela (alfabético, data, status).
  // Default mantém o que o servidor já devolve (mais recente primeiro).
  const [sortBy, setSortBy] = useState<"padrao" | "alfabetico" | "alfabetico_desc" | "realizacao_desc" | "realizacao_asc" | "validade_asc" | "validade_desc" | "status">("padrao");
  const [modalForm, setModalForm] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data: integracoes = [], isLoading } = trpc.integracoes.listar.useQuery(
    { companyId, clienteId: clienteFiltro !== "todos" ? parseInt(clienteFiltro) : undefined },
    { enabled: !!companyId }
  );
  const { data: clientesComInt = [] } = trpc.integracoes.clientesComIntegracao.useQuery({ companyId }, { enabled: !!companyId });
  const { data: kpis } = trpc.integracoes.kpis.useQuery({ companyId }, { enabled: !!companyId });
  const { data: allClientes = [] } = trpc.clientes.list.useQuery({ companyId }, { enabled: !!companyId });
  const { data: todosEmp = [] } = trpc.employees.list.useQuery({ companyId }, { enabled: !!companyId });
  // Inclui Ativo, Férias e Afastado (apenas Desligado/Inativo são excluídos)
  const empAtivos = useMemo(() => (todosEmp as any[]).filter((e: any) => {
    const s = String(e.status || "").toLowerCase();
    return s !== "desligado" && s !== "inativo";
  }), [todosEmp]);
  const [empSearch, setEmpSearch] = useState("");

  const criarMut = trpc.integracoes.criar.useMutation({
    onSuccess: () => { utils.integracoes.listar.invalidate(); utils.integracoes.kpis.invalidate(); setModalForm(null); setEmpSearch(""); toast.success("Integração registrada!"); },
    onError: (e) => toast.error(e.message || "Erro ao registrar"),
  });
  const criarLoteMut = trpc.integracoes.criarLote.useMutation({
    onSuccess: (r: any) => { utils.integracoes.listar.invalidate(); utils.integracoes.kpis.invalidate(); setModalForm(null); setEmpSearch(""); toast.success(`${r.criados} integraç${r.criados === 1 ? "ão registrada" : "ões registradas"}!`); },
    onError: (e) => toast.error(e.message || "Erro ao registrar em lote"),
  });

  // Helper: soma N meses a uma data "YYYY-MM-DD" e retorna no mesmo formato.
  function addMonthsISO(dateStr: string, meses: number): string {
    if (!dateStr || !meses) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return "";
    const dt = new Date(Date.UTC(y, m - 1 + meses, d));
    // Trata transbordo (ex.: 31/jan + 1 mês → 02/mar). Recua para o último dia do mês alvo se preciso.
    if (dt.getUTCMonth() !== ((m - 1 + meses) % 12 + 12) % 12) dt.setUTCDate(0);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }
  const excluirMut = trpc.integracoes.excluir.useMutation({
    onSuccess: () => { utils.integracoes.listar.invalidate(); utils.integracoes.kpis.invalidate(); toast.success("Integração removida."); },
  });
  const atualizarMut = trpc.integracoes.atualizar.useMutation({
    onSuccess: () => { utils.integracoes.listar.invalidate(); utils.integracoes.kpis.invalidate(); setModalForm(null); toast.success("Integração atualizada!"); },
    onError: (e) => toast.error(e.message || "Erro ao atualizar"),
  });

  // Lista de funções únicas presentes nas integrações (para popular o filtro).
  const funcoesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    (integracoes as any[]).forEach((i: any) => { if (i.funcao) set.add(i.funcao); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [integracoes]);

  const filtrados = useMemo(() => {
    let list = integracoes as any[];
    if (tipoFiltro !== "todos") list = list.filter(i => i.tipo === tipoFiltro);
    if (statusFiltro !== "todos") list = list.filter(i => i.statusCalc === statusFiltro);
    if (funcaoFiltro !== "todos") list = list.filter(i => (i.funcao || "") === funcaoFiltro);
    if (searchVal) {
      const s = searchVal.toLowerCase();
      list = list.filter(i =>
        (i.nomeCompleto || "").toLowerCase().includes(s) ||
        (i.clienteNome || "").toLowerCase().includes(s) ||
        (i.funcao || "").toLowerCase().includes(s)
      );
    }
    // Rev. 1718 — Ordenação aplicada após os filtros. Datas vazias vão pro
    // FINAL em qualquer ordenação (asc ou desc) pra não poluir o topo. Status
    // segue prioridade clínica: VENCIDA > A_VENCER > ATIVA > SEM_VENCIMENTO.
    if (sortBy !== "padrao") {
      const arr = [...list];
      const cmpStr = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
      const cmpDate = (a: string, b: string, dir: 1 | -1) => {
        if (!a && !b) return 0; if (!a) return 1; if (!b) return -1; // vazios sempre por último
        return a < b ? -dir : a > b ? dir : 0;
      };
      const statusRank: Record<string, number> = { VENCIDA: 0, A_VENCER: 1, ATIVA: 2, SEM_VENCIMENTO: 3 };
      arr.sort((a, b) => {
        switch (sortBy) {
          case "alfabetico":      return cmpStr(a.nomeCompleto || "", b.nomeCompleto || "");
          case "alfabetico_desc": return cmpStr(b.nomeCompleto || "", a.nomeCompleto || "");
          case "realizacao_desc": return cmpDate(a.dataRealizacao || "", b.dataRealizacao || "", -1);
          case "realizacao_asc":  return cmpDate(a.dataRealizacao || "", b.dataRealizacao || "",  1);
          case "validade_asc":    return cmpDate(a.dataVencimento || "", b.dataVencimento || "",  1);
          case "validade_desc":   return cmpDate(a.dataVencimento || "", b.dataVencimento || "", -1);
          case "status": {
            const ra = statusRank[a.statusCalc] ?? 99;
            const rb = statusRank[b.statusCalc] ?? 99;
            if (ra !== rb) return ra - rb;
            return cmpStr(a.nomeCompleto || "", b.nomeCompleto || "");
          }
          default: return 0;
        }
      });
      return arr;
    }
    return list;
  }, [integracoes, tipoFiltro, statusFiltro, funcaoFiltro, searchVal, sortBy]);

  const kpiCards = [
    { label: "Total", value: kpis?.total ?? 0, color: "slate" },
    { label: "Ativas", value: kpis?.ativas ?? 0, color: "emerald" },
    { label: "A Vencer (30d)", value: kpis?.aVencer ?? 0, color: "amber" },
    { label: "Vencidas", value: kpis?.vencidas ?? 0, color: "red" },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpiCards.map(c => (
          <Card key={c.label} className={`border-${c.color}-100 bg-${c.color}-50/50`}>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className={`h-5 w-5 text-${c.color}-500 shrink-0`} />
              <div>
                <p className={`text-2xl font-bold text-${c.color}-700`}>{c.value}</p>
                <p className="text-[11px] text-muted-foreground">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar colaborador ou cliente..." value={searchVal} onChange={e => setSearchVal(e.target.value)} className="pl-10" />
        </div>
        <Select value={clienteFiltro} onValueChange={setClienteFiltro}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todos os clientes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os clientes</SelectItem>
            {(clientesComInt as any[]).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.razaoSocial}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={funcaoFiltro} onValueChange={setFuncaoFiltro}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Todas as funções" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as funções</SelectItem>
            {funcoesDisponiveis.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="externa">Externa (PJ)</SelectItem>
            <SelectItem value="interna">Interna</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFiltro} onValueChange={setStatusFiltro}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ATIVA">Ativas</SelectItem>
            <SelectItem value="A_VENCER">A Vencer</SelectItem>
            <SelectItem value="VENCIDA">Vencidas</SelectItem>
            <SelectItem value="SEM_VENCIMENTO">Sem Vencimento</SelectItem>
          </SelectContent>
        </Select>
        {/* Rev. 1718 — Ordenação. "Padrão" = ordem do servidor (mais recente
            primeiro). Datas vazias sempre vão pro final. Status agrupa por
            urgência: Vencidas → A Vencer → Ativas → Sem Vencimento. */}
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Ordenar por" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="padrao">Ordenação padrão</SelectItem>
            <SelectItem value="alfabetico">Colaborador (A-Z)</SelectItem>
            <SelectItem value="alfabetico_desc">Colaborador (Z-A)</SelectItem>
            <SelectItem value="realizacao_desc">Realização (mais recente)</SelectItem>
            <SelectItem value="realizacao_asc">Realização (mais antiga)</SelectItem>
            <SelectItem value="validade_asc">Validade (vence antes)</SelectItem>
            <SelectItem value="validade_desc">Validade (vence depois)</SelectItem>
            <SelectItem value="status">Status (urgência)</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={() => setModalForm({ tipo: "externa", clienteId: "", clienteNome: "", employeeIds: [] as number[], employeeNomes: {} as Record<number, string>, validadeMeses: 12, dataRealizacao: "", dataVencimento: "", evidencia: "", observacoes: "" })}
          className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 ml-auto"
          size="sm"
        >
          <Plus className="h-4 w-4" /> Registrar Integração
        </Button>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Users className="h-10 w-10 opacity-20" />
              <p className="text-sm">Nenhuma integração encontrada para os filtros selecionados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs">
                    <th className="p-3 text-left font-medium">Colaborador</th>
                    <th className="p-3 text-left font-medium">Tipo</th>
                    <th className="p-3 text-left font-medium">Cliente / Referência</th>
                    <th className="p-3 text-left font-medium">Realização</th>
                    <th className="p-3 text-left font-medium">Validade</th>
                    <th className="p-3 text-center font-medium">Status</th>
                    <th className="p-3 text-left font-medium">Evidência</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((i: any) => {
                    const statusColor = i.statusCalc === "ATIVA" ? "bg-emerald-100 text-emerald-700" : i.statusCalc === "A_VENCER" ? "bg-amber-100 text-amber-700" : i.statusCalc === "VENCIDA" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500";
                    const statusLabel = i.statusCalc === "ATIVA" ? "Ativa" : i.statusCalc === "A_VENCER" ? `Vence em ${i.diasRestantes}d` : i.statusCalc === "VENCIDA" ? "Vencida" : "Sem vencimento";
                    return (
                      <tr key={i.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={() => onClickEmployee(i.employeeId)} className="font-medium text-left hover:text-indigo-600 hover:underline text-sm">
                              {i.nomeCompleto || "-"}
                            </button>
                            {i.funcao && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                {i.funcao}
                              </span>
                            )}
                          </div>
                          {i.matricula && <p className="text-[10px] text-muted-foreground">{i.matricula}</p>}
                        </td>
                        <td className="p-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${i.tipo === "interna" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                            {i.tipo === "interna" ? "Interna" : "Externa (PJ)"}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-sm">{i.clienteNome || "-"}</td>
                        <td className="p-3 text-xs">{i.dataRealizacao ? i.dataRealizacao.split("-").reverse().join("/") : "-"}</td>
                        <td className="p-3 text-xs">{i.dataVencimento ? i.dataVencimento.split("-").reverse().join("/") : "-"}</td>
                        <td className="p-3 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusColor}`}>{statusLabel}</span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground max-w-[140px] truncate">{i.evidencia || "-"}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              title="Editar integração"
                              onClick={() => setModalForm({
                                id: i.id,
                                editMode: true,
                                tipo: i.tipo,
                                clienteId: i.clienteId ? String(i.clienteId) : "",
                                clienteNome: i.clienteNome || "",
                                employeeIds: [i.employeeId],
                                employeeNomes: { [i.employeeId]: i.nomeCompleto },
                                validadeMeses: 0,
                                dataRealizacao: i.dataRealizacao || "",
                                dataVencimento: i.dataVencimento || "",
                                evidencia: i.evidencia || "",
                                observacoes: i.observacoes || "",
                              })}
                              className="p-1 rounded hover:bg-indigo-50 text-indigo-500"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              title="Remover integração"
                              onClick={() => { if (confirm(`Remover integração de "${i.nomeCompleto}"?`)) excluirMut.mutate({ id: i.id, companyId }); }}
                              className="p-1 rounded hover:bg-red-50 text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal registrar integração */}
      {modalForm && (
        <Dialog open={!!modalForm} onOpenChange={open => { if (!open) setModalForm(null); }}>
          <DialogContent className="max-w-2xl w-[96vw] max-h-[92vh] p-0 gap-0 flex flex-col" style={{ background: "#fff", color: "#111" }}>
            <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2 text-indigo-700">
                {modalForm.editMode ? <><Pencil className="h-4 w-4" /> Editar Integração</> : <><Users className="h-4 w-4" /> Registrar Integração de Pessoal</>}
              </DialogTitle>
            </DialogHeader>
            {(() => {
              const selIds: number[] = modalForm.employeeIds || [];
              const setVal = (updater: any) => setModalForm((f: any) => ({ ...f, ...(typeof updater === "function" ? updater(f) : updater) }));
              const onPickEmp = (e: any) => {
                const ids = new Set<number>(modalForm.employeeIds || []);
                const nomes = { ...(modalForm.employeeNomes || {}) };
                if (ids.has(e.id)) { ids.delete(e.id); delete nomes[e.id]; }
                else { ids.add(e.id); nomes[e.id] = e.nomeCompleto; }
                setVal({ employeeIds: Array.from(ids), employeeNomes: nomes });
              };
              const removerSel = (id: number) => {
                const ids = (modalForm.employeeIds || []).filter((x: number) => x !== id);
                const nomes = { ...(modalForm.employeeNomes || {}) }; delete nomes[id];
                setVal({ employeeIds: ids, employeeNomes: nomes });
              };
              const filteredEmps = empAtivos.filter((e: any) => (e.nomeCompleto || "").toLowerCase().includes(empSearch.toLowerCase()));
              const recalcVencimento = (dataReal: string, meses: number) => {
                if (dataReal && meses && meses > 0) return addMonthsISO(dataReal, meses);
                return modalForm.dataVencimento;
              };
              const submit = () => {
                if (!selIds.length) { toast.error("Selecione ao menos um colaborador"); return; }
                if (!modalForm.dataRealizacao) { toast.error("Data de realização obrigatória"); return; }
                if (modalForm.editMode && modalForm.id) {
                  atualizarMut.mutate({
                    id:             modalForm.id,
                    companyId,
                    employeeId:     selIds[0],
                    tipo:           modalForm.tipo,
                    clienteId:      modalForm.tipo === "externa"
                                      ? (modalForm.clienteId ? parseInt(modalForm.clienteId) : null)
                                      : null,
                    clienteNome:    modalForm.tipo === "externa"
                                      ? (modalForm.clienteNome ?? "")
                                      : (modalForm.clienteNome ?? ""),
                    dataRealizacao: modalForm.dataRealizacao,
                    dataVencimento: modalForm.dataVencimento || "",
                    evidencia:      modalForm.evidencia ?? "",
                    observacoes:    modalForm.observacoes ?? "",
                  });
                  return;
                }
                const payload = {
                  companyId,
                  tipo:           modalForm.tipo,
                  clienteId:      modalForm.clienteId ? parseInt(modalForm.clienteId) : undefined,
                  clienteNome:    modalForm.clienteNome || undefined,
                  dataRealizacao: modalForm.dataRealizacao,
                  dataVencimento: modalForm.dataVencimento || undefined,
                  evidencia:      modalForm.evidencia || undefined,
                  observacoes:    modalForm.observacoes || undefined,
                };
                if (selIds.length === 1) {
                  criarMut.mutate({ ...payload, employeeId: selIds[0] });
                } else {
                  criarLoteMut.mutate({ ...payload, employeeIds: selIds });
                }
              };
              const isPending = criarMut.isPending || criarLoteMut.isPending || atualizarMut.isPending;
              return <>
                <div className="space-y-3 px-5 py-4 overflow-y-auto flex-1 min-h-0">
                  {/* Seleção de colaboradores — em edição é single (substitui), em cadastro é múltipla */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium">
                        {modalForm.editMode ? "Colaborador *" : <>Colaboradores * <span className="text-muted-foreground">(seleção múltipla)</span></>}
                      </label>
                      <span className="text-[11px] text-indigo-700 font-semibold">{selIds.length} selecionado{selIds.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="relative mt-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="text"
                        value={empSearch}
                        onChange={e => setEmpSearch(e.target.value)}
                        className="w-full border border-gray-200 rounded-md pl-8 pr-3 py-1.5 text-sm"
                        placeholder="Buscar e marcar colaboradores..."
                      />
                    </div>

                    {/* Chips dos selecionados */}
                    {selIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-indigo-50/50 border border-indigo-100 rounded-md">
                        {selIds.map((id: number) => (
                          <span key={id} className="inline-flex items-center gap-1 bg-white border border-indigo-200 text-indigo-700 text-[11px] font-medium pl-2 pr-1 py-0.5 rounded-full">
                            {modalForm.employeeNomes?.[id] || `#${id}`}
                            <button type="button" onClick={() => removerSel(id)} className="hover:bg-indigo-100 rounded-full p-0.5">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        <button type="button" onClick={() => setVal({ employeeIds: [], employeeNomes: {} })}
                          className="text-[10px] text-rose-600 hover:underline ml-1">limpar todos</button>
                      </div>
                    )}

                    {/* Lista com checkboxes */}
                    {(empSearch.length >= 1 || selIds.length === 0) && (
                      <div className="mt-1 border rounded-md max-h-44 overflow-y-auto bg-white">
                        {filteredEmps.length > 0 && empSearch.length >= 1 && (
                          <div className="px-3 py-1.5 bg-slate-50 border-b flex items-center justify-between text-[11px] text-slate-600">
                            <span>{filteredEmps.length} encontrado{filteredEmps.length === 1 ? "" : "s"}</span>
                            <button type="button" className="text-indigo-600 hover:underline font-medium"
                              onClick={() => {
                                const ids = new Set<number>(modalForm.employeeIds || []);
                                const nomes = { ...(modalForm.employeeNomes || {}) };
                                filteredEmps.slice(0, 50).forEach((e: any) => { ids.add(e.id); nomes[e.id] = e.nomeCompleto; });
                                setVal({ employeeIds: Array.from(ids), employeeNomes: nomes });
                              }}>
                              + selecionar todos visíveis
                            </button>
                          </div>
                        )}
                        {filteredEmps.slice(0, 80).map((e: any) => {
                          const checked = selIds.includes(e.id);
                          const stTag = String(e.status || "").toLowerCase();
                          const stColor = stTag === "férias" || stTag === "ferias" ? "bg-amber-100 text-amber-700"
                            : stTag === "afastado" ? "bg-orange-100 text-orange-700"
                            : "bg-emerald-100 text-emerald-700";
                          return (
                            <label key={e.id} className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer border-b last:border-b-0 transition-colors ${checked ? "bg-indigo-50/70" : "hover:bg-slate-50"}`}>
                              <input
                                type={modalForm.editMode ? "radio" : "checkbox"}
                                name={modalForm.editMode ? "edit-emp" : undefined}
                                checked={checked}
                                onChange={() => {
                                  if (modalForm.editMode) {
                                    setVal({ employeeIds: [e.id], employeeNomes: { [e.id]: e.nomeCompleto } });
                                  } else {
                                    onPickEmp(e);
                                  }
                                }}
                                className="rounded text-indigo-600"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium truncate flex items-center gap-1.5">
                                  {e.nomeCompleto}
                                  {e.status && e.status !== "Ativo" && (
                                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${stColor}`}>{e.status}</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-muted-foreground">{e.matricula} · {e.funcao}</div>
                              </div>
                            </label>
                          );
                        })}
                        {filteredEmps.length === 0 && (
                          <p className="text-xs text-muted-foreground p-3 text-center">Nenhum colaborador encontrado</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium">Tipo de Integração</label>
                    <div className="flex gap-2 mt-1">
                      {["externa", "interna"].map(t => (
                        <button key={t} type="button" onClick={() => setVal({ tipo: t })}
                          className={`flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${modalForm.tipo === t ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500"}`}>
                          {t === "externa" ? "Cliente (PJ)" : "Reciclagem Interna"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-medium">{modalForm.tipo === "externa" ? "Cliente" : "Referência"}</label>
                      {modalForm.tipo === "externa" ? (
                        <Select value={modalForm.clienteId} onValueChange={v => {
                          const c = (allClientes as any[]).find((x: any) => String(x.id) === v);
                          setVal({ clienteId: v, clienteNome: c?.razaoSocial || "" });
                        }}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                          <SelectContent>
                            {(allClientes as any[]).filter((c: any) => c.tipo === "PJ").map((c: any) => (
                              <SelectItem key={c.id} value={String(c.id)}>{c.razaoSocial}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={modalForm.clienteNome} onChange={e => setVal({ clienteNome: e.target.value })} className="mt-1" placeholder="Ex: Reciclagem Anual 2025" />
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium">Data de Realização *</label>
                      <Input type="date" value={modalForm.dataRealizacao}
                        onChange={e => {
                          const v = e.target.value;
                          setVal({ dataRealizacao: v, dataVencimento: recalcVencimento(v, modalForm.validadeMeses || 0) });
                        }}
                        className="mt-1" />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Validade <span className="text-muted-foreground">(período)</span></label>
                      <Select value={String(modalForm.validadeMeses ?? 0)} onValueChange={v => {
                        const m = parseInt(v);
                        setVal({ validadeMeses: m, dataVencimento: recalcVencimento(modalForm.dataRealizacao, m) });
                      }}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Sem validade definida</SelectItem>
                          <SelectItem value="3">3 meses</SelectItem>
                          <SelectItem value="6">6 meses</SelectItem>
                          <SelectItem value="12">1 ano</SelectItem>
                          <SelectItem value="24">2 anos</SelectItem>
                          <SelectItem value="36">3 anos</SelectItem>
                          <SelectItem value="60">5 anos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium flex items-center gap-1.5">
                        Data de Validade
                        {modalForm.validadeMeses > 0 && modalForm.dataRealizacao && (
                          <span className="text-[10px] text-emerald-600 font-normal">(preenchida automaticamente — você pode ajustar)</span>
                        )}
                      </label>
                      <Input type="date" value={modalForm.dataVencimento}
                        onChange={e => setVal({ dataVencimento: e.target.value, validadeMeses: 0 })}
                        className="mt-1" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium">Evidência / Protocolo</label>
                      <Input value={modalForm.evidencia} onChange={e => setVal({ evidencia: e.target.value })} className="mt-1" placeholder="Número, link ou documento" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-medium">Observações</label>
                      <Textarea value={modalForm.observacoes} onChange={e => setVal({ observacoes: e.target.value })} rows={2} className="mt-1" />
                    </div>
                  </div>
                </div>
                <DialogFooter className="px-5 py-3 border-t bg-slate-50 shrink-0 sm:justify-between">
                  <div className="text-[11px] text-slate-500 hidden sm:block">
                    {modalForm.editMode
                      ? <>Editando integração <b className="text-indigo-700">#{modalForm.id}</b>.</>
                      : selIds.length > 0
                        ? <>Pronto para registrar <b className="text-indigo-700">{selIds.length}</b> integraç{selIds.length === 1 ? "ão" : "ões"}.</>
                        : "Selecione ao menos um colaborador para continuar."}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setModalForm(null); setEmpSearch(""); }}>Cancelar</Button>
                    <Button
                      disabled={!selIds.length || !modalForm.dataRealizacao || isPending}
                      onClick={submit}
                      className="bg-indigo-600 hover:bg-indigo-700 gap-1"
                    >
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {modalForm.editMode ? "Salvar alterações" : (selIds.length > 1 ? `Registrar ${selIds.length} integrações` : "Registrar")}
                    </Button>
                  </div>
                </DialogFooter>
              </>;
            })()}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ============ PAINEL DE VALIDADE (Componente) ============
function ValidadePanel({ companyId, companyIds, onClickEmployee, forceTipo, forceStatus }: { companyId: number; companyIds?: number[]; onClickEmployee: (id: number) => void; forceTipo?: string; forceStatus?: string }) {
  const { data, isLoading } = trpc.docs.painelValidade.useQuery({ companyId, companyIds }, { enabled: !!companyId || (companyIds && companyIds.length > 0) });
  const [filterStatus, setFilterStatus] = useState(forceStatus || "todos");
  const [filterTipo, setFilterTipo] = useState(forceTipo || "todos");

  useEffect(() => { setFilterTipo(forceTipo || "todos"); }, [forceTipo]);
  useEffect(() => { setFilterStatus(forceStatus || "todos"); }, [forceStatus]);
  const [searchVal, setSearchVal] = useState("");

  const filtered = useMemo(() => {
    if (!data?.documentos) return [];
    let list = data.documentos as any[];
    if (filterStatus === "vencido") list = list.filter(d => d.status === "VENCIDO");
    else if (filterStatus === "vencer30") list = list.filter(d => d.diasRestantes >= 0 && d.diasRestantes <= 30);
    else if (filterStatus === "vencer60") list = list.filter(d => d.diasRestantes > 30 && d.diasRestantes <= 60);
    else if (filterStatus === "valido") list = list.filter(d => d.diasRestantes > 60);
    if (filterTipo === "ASO") list = list.filter(d => d.tipoDoc === "ASO");
    else if (filterTipo === "Treinamento") list = list.filter(d => d.tipoDoc === "Treinamento");
    if (searchVal) {
      const s = removeAccents(searchVal);
      list = list.filter(d => removeAccents(d.nomeCompleto || '').includes(s) || removeAccents(d.descricao || '').includes(s));
    }
    return list;
  }, [data, filterStatus, filterTipo, searchVal]);

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Carregando painel de validade...</div>;
  if (!data) return <div className="py-12 text-center text-muted-foreground">Nenhum dado disponível</div>;

  const { stats } = data;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className={`cursor-pointer transition-all ${filterStatus === "vencido" ? "ring-2 ring-red-500" : ""}`} onClick={() => setFilterStatus(filterStatus === "vencido" ? "todos" : "vencido")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{fmtNum(stats.vencidos)}</p>
                <p className="text-xs text-muted-foreground">Vencidos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${filterStatus === "vencer30" ? "ring-2 ring-yellow-500" : ""}`} onClick={() => setFilterStatus(filterStatus === "vencer30" ? "todos" : "vencer30")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-600">{fmtNum(stats.aVencer30)}</p>
                <p className="text-xs text-muted-foreground">Vence em 30 dias</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${filterStatus === "vencer60" ? "ring-2 ring-orange-500" : ""}`} onClick={() => setFilterStatus(filterStatus === "vencer60" ? "todos" : "vencer60")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-600">{fmtNum(stats.aVencer60)}</p>
                <p className="text-xs text-muted-foreground">Vence em 60 dias</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${filterStatus === "valido" ? "ring-2 ring-green-500" : ""}`} onClick={() => setFilterStatus(filterStatus === "valido" ? "todos" : "valido")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Shield className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{fmtNum(stats.validos)}</p>
                <p className="text-xs text-muted-foreground">Válidos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou documento..." value={searchVal} onChange={e => setSearchVal(e.target.value)} className="pl-10" />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Tipos</SelectItem>
            <SelectItem value="ASO">ASO</SelectItem>
            <SelectItem value="Treinamento">Treinamento</SelectItem>
          </SelectContent>
        </Select>
        {(filterStatus !== "todos" || filterTipo !== "todos" || searchVal) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterStatus("todos"); setFilterTipo("todos"); setSearchVal(""); }}>
            <X className="h-4 w-4 mr-1" /> Limpar filtros
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Painel de Validade de Documentos
            <Badge variant="secondary" className="ml-2">{filtered.length} de {stats.total}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum documento encontrado com os filtros selecionados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium">Tipo</th>
                    <th className="text-left p-2 font-medium">Colaborador</th>
                    <th className="text-left p-2 font-medium">Descrição</th>
                    <th className="text-left p-2 font-medium">Validade</th>
                    <th className="text-left p-2 font-medium">Dias</th>
                    <th className="text-left p-2 font-medium">Doc</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((doc: any, i: number) => {
                    const rowBg = doc.status === "VENCIDO" ? "bg-red-50/60" : doc.diasRestantes <= 30 ? "bg-yellow-50/60" : doc.diasRestantes <= 60 ? "bg-orange-50/30" : "";
                    return (
                      <tr key={`${doc.tipoDoc}-${doc.id}`} className={`border-b hover:bg-muted/20 ${rowBg}`}>
                        <td className="p-2">
                          {doc.status === "VENCIDO" ? (
                            <Badge variant="destructive" className="text-[10px]">VENCIDO</Badge>
                          ) : doc.diasRestantes <= 7 ? (
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-[10px]">{doc.diasRestantes}d</Badge>
                          ) : doc.diasRestantes <= 30 ? (
                            <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-[10px]">{doc.diasRestantes}d</Badge>
                          ) : doc.diasRestantes <= 60 ? (
                            <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100 text-[10px]">{doc.diasRestantes}d</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-[10px]">OK</Badge>
                          )}
                        </td>
                        <td className="p-2">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${doc.tipoDoc === "ASO" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                            {doc.tipoDoc === "ASO" ? <Stethoscope className="h-3 w-3" /> : <GraduationCap className="h-3 w-3" />}
                            {doc.tipoDoc}
                          </span>
                        </td>
                        <td className="p-2">
                          <button className="text-blue-600 hover:underline font-medium text-left" onClick={() => onClickEmployee(doc.employeeId)}>
                            {doc.nomeCompleto}
                          </button>
                          <div className="text-[10px] text-muted-foreground">{doc.funcao || "-"}</div>
                        </td>
                        <td className="p-2 text-xs">{doc.tipoDoc === "ASO" ? formatTipoASO(doc.descricao) : doc.descricao}</td>
                        <td className="p-2 text-xs font-mono">{formatDate(doc.dataValidade)}</td>
                        <td className="p-2">
                          <span className={`text-xs font-bold ${doc.status === "VENCIDO" ? "text-red-600" : doc.diasRestantes <= 30 ? "text-yellow-600" : doc.diasRestantes <= 60 ? "text-orange-600" : "text-green-600"}`}>
                            {doc.status === "VENCIDO" ? `${Math.abs(doc.diasRestantes)}d atrás` : `${doc.diasRestantes}d`}
                          </span>
                        </td>
                        <td className="p-2">
                          {(doc.documentoUrl || doc.certificadoUrl) ? (
                            <a href={doc.documentoUrl || doc.certificadoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============ PAINEL SEM ASO (Componente) ============
function SemASOPanel({ companyId, companyIds, onClickEmployee, onCreateAso }: { companyId: number; companyIds?: number[]; onClickEmployee: (id: number) => void; onCreateAso: (empId: number) => void }) {
  const { data: empsSemAso = [], isLoading } = trpc.docs.listSemASO.useQuery({ companyId, companyIds }, { enabled: !!companyId || (companyIds && companyIds.length > 0) });
  const [searchSemAso, setSearchSemAso] = useState("");

  const filtered = useMemo(() => {
    if (!searchSemAso) return empsSemAso as any[];
    const s = removeAccents(searchSemAso);
    return (empsSemAso as any[]).filter((e: any) => removeAccents(e.nomeCompleto || '').includes(s) || e.cpf?.includes(s));
  }, [empsSemAso, searchSemAso]);

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Carregando...</div>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-500" />
              Funcionários Ativos Sem ASO
              <Badge className="bg-rose-100 text-rose-700 ml-2">{(empsSemAso as any[]).length} funcionário(s)</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Funcionários ativos que não possuem nenhum ASO cadastrado no sistema</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou CPF..." value={searchSemAso} onChange={e => setSearchSemAso(e.target.value)} className="pl-10" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>{(empsSemAso as any[]).length === 0 ? "Todos os funcionários ativos possuem ASO cadastrado!" : "Nenhum resultado para a busca."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-rose-50/50">
                  <th className="text-left p-2 font-medium">Funcionário</th>
                  <th className="text-left p-2 font-medium">CPF</th>
                  <th className="text-left p-2 font-medium">Função</th>
                  <th className="text-left p-2 font-medium">Obra</th>
                  <th className="text-left p-2 font-medium">Admissão</th>
                  <th className="text-left p-2 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp: any) => (
                  <tr key={emp.id} className="border-b hover:bg-muted/20">
                    <td className="p-2">
                      <button className="text-blue-600 hover:underline font-medium text-left" onClick={() => onClickEmployee(emp.id)}>
                        {emp.nomeCompleto}
                      </button>
                    </td>
                    <td className="p-2 text-xs font-mono">{emp.cpf ? formatCPF(emp.cpf) : "-"}</td>
                    <td className="p-2 text-xs">{emp.funcao || "-"}</td>
                    <td className="p-2 text-xs">{emp.obraNome || "-"}</td>
                    <td className="p-2 text-xs font-mono">{formatDate(emp.dataAdmissao)}</td>
                    <td className="p-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs border-rose-300 text-rose-700 hover:bg-rose-50" onClick={() => onCreateAso(emp.id)}>
                        <Plus className="h-3 w-3 mr-1" /> Cadastrar ASO
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============ COMPONENTE: MAPEAMENTO / COBERTURA DE EXAMES (Rev. 3117) ============
function MapeamentoPanel({ companyId, companyIds, onClickEmployee, empresaNome }: { companyId: number; companyIds?: number[]; onClickEmployee: (id: number) => void; empresaNome: string }) {
  const { data, isLoading } = trpc.docs.asos.mapaCobertura.useQuery({ companyId, companyIds }, { enabled: !!companyId || (companyIds && companyIds.length > 0) });
  const utils = trpc.useUtils();
  const [exameKey, setExameKey] = useState("psicossocial");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [search, setSearch] = useState("");
  const [showRevisao, setShowRevisao] = useState(false);
  const [iaLoadingId, setIaLoadingId] = useState<number | null>(null);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  // ===== IA (Fase 2) — leitura de laudo com revisão humana =====
  const revisaoQ = trpc.docs.asos.listExtracoesIA.useQuery({ companyId, companyIds, status: "aguardando_revisao" }, { enabled: showRevisao && !!companyId });
  const fila = (revisaoQ.data as any[]) || [];
  const lerComIA = trpc.docs.asos.lerComIA.useMutation({
    onSuccess: () => { toast.success("ASO lido pela IA. Confira em 'Revisão por IA'."); setShowRevisao(true); revisaoQ.refetch(); },
    onError: (e) => toast.error(e.message || "Falha ao ler o ASO com IA."),
    onSettled: () => setIaLoadingId(null),
  });
  const lerLoteIA = trpc.docs.asos.lerLoteIA.useMutation({
    onSuccess: (r: any) => { toast.success(`Lote processado: ${r.sucesso} ok, ${r.falha} falha(s).`); setShowRevisao(true); revisaoQ.refetch(); },
    onError: (e) => toast.error(e.message || "Falha ao processar o lote."),
  });
  const lerSelecionadosIA = trpc.docs.asos.lerSelecionadosIA.useMutation({
    onSuccess: (r: any) => { toast.success(`Selecionados processados: ${r.sucesso} ok, ${r.falha} falha(s).`); setSelecionados(new Set()); setShowRevisao(true); revisaoQ.refetch(); },
    onError: (e) => toast.error(e.message || "Falha ao processar os selecionados."),
  });
  const aprovarIA = trpc.docs.asos.aprovarExtracaoIA.useMutation({
    onSuccess: () => { toast.success("Extração aprovada e aplicada ao ASO."); revisaoQ.refetch(); utils.docs.asos.mapaCobertura.invalidate(); },
    onError: (e) => toast.error(e.message || "Falha ao aprovar."),
  });
  const rejeitarIA = trpc.docs.asos.rejeitarExtracaoIA.useMutation({
    onSuccess: () => { toast.success("Extração descartada."); revisaoQ.refetch(); },
    onError: (e) => toast.error(e.message || "Falha ao rejeitar."),
  });

  const exames = (data?.exames as { key: string; label: string; total: number }[]) || [];
  const colaboradores = (data?.colaboradores as any[]) || [];

  // Garante que o exame selecionado existe nas opções; senão cai no 1º disponível.
  useEffect(() => {
    if (exames.length === 0) return;
    if (!exames.some((e) => e.key === exameKey)) setExameKey(exames[0].key);
  }, [exames, exameKey]);

  const exameLabel = exames.find((e) => e.key === exameKey)?.label || "exame";

  // Classifica cada colaborador em relação ao exame selecionado.
  const classificar = (c: any): "fez_em_dia" | "fez_vencido" | "nao_fez" | "sem_aso" => {
    if (!c.temAso) return "sem_aso";
    const fez = (c.examesCanonicos || []).includes(exameKey);
    if (!fez) return "nao_fez";
    return c.status === "VENCIDO" ? "fez_vencido" : "fez_em_dia";
  };

  const enriquecidos = useMemo(() => colaboradores.map((c) => ({ ...c, _classe: classificar(c) })), [colaboradores, exameKey]);

  const kpis = useMemo(() => {
    const r = { total: enriquecidos.length, fezEmDia: 0, fezVencido: 0, naoFez: 0, semAso: 0 };
    for (const c of enriquecidos) {
      if (c._classe === "fez_em_dia") r.fezEmDia++;
      else if (c._classe === "fez_vencido") r.fezVencido++;
      else if (c._classe === "nao_fez") r.naoFez++;
      else r.semAso++;
    }
    return r;
  }, [enriquecidos]);

  const filtrados = useMemo(() => {
    let arr = enriquecidos;
    if (statusFiltro !== "todos") arr = arr.filter((c) => c._classe === statusFiltro);
    if (search) {
      const s = removeAccents(search);
      arr = arr.filter((c) => removeAccents(c.nomeCompleto || "").includes(s) || (c.cpf || "").includes(s));
    }
    return arr;
  }, [enriquecidos, statusFiltro, search]);

  // Pendentes do exame = não fez OU sem ASO (foco da cobrança).
  const pendentes = useMemo(() => enriquecidos.filter((c) => c._classe === "nao_fez" || c._classe === "sem_aso"), [enriquecidos]);

  // ===== Multi-seleção p/ "Ler com IA" em lote (só linhas com PDF) =====
  const selecionaveis = useMemo(() => filtrados.filter((c) => c.temPdf), [filtrados]);
  const todosSelecionados = selecionaveis.length > 0 && selecionaveis.every((c) => selecionados.has(c.asoId));
  const toggleSelecionado = (asoId: number) => setSelecionados((prev) => {
    const next = new Set(prev);
    if (next.has(asoId)) next.delete(asoId); else next.add(asoId);
    return next;
  });
  const toggleTodos = () => setSelecionados((prev) => {
    if (selecionaveis.every((c) => prev.has(c.asoId))) {
      const next = new Set(prev);
      selecionaveis.forEach((c) => next.delete(c.asoId));
      return next;
    }
    const next = new Set(prev);
    selecionaveis.forEach((c) => next.add(c.asoId));
    return next;
  });

  const imprimirPendentes = () => {
    const hoje = new Date().toLocaleDateString("pt-BR");
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const linhas = pendentes
      .map((c, i) => `<tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${esc(c.nomeCompleto)}</td>
        <td>${esc(c.cpf ? formatCPF(c.cpf) : "-")}</td>
        <td>${esc(c.funcao || "-")}</td>
        <td>${esc(c.obraNome || "-")}</td>
        <td style="text-align:center">${c._classe === "sem_aso" ? "Sem ASO cadastrado" : "Exame não realizado"}</td>
        <td style="text-align:center">${c.dataExame ? esc(formatDate(c.dataExame)) : "-"}</td>
      </tr>`)
      .join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pendentes — ${esc(exameLabel)}</title>
      <style>
        @page { size: A4 portrait; margin: 14mm 12mm 18mm 12mm; }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color:#111; }
        .logo-bar { background:#1e3a6e; -webkit-print-color-adjust:exact; print-color-adjust:exact; padding:12px 18px; display:flex; align-items:center; gap:14px; }
        .logo-bar img { height:46px; object-fit:contain; }
        .logo-bar h1 { color:#fff; font-size:15px; letter-spacing:2px; }
        .logo-bar p { color:#cdd8ef; font-size:9.5px; }
        .meta { padding:10px 4px; display:flex; justify-content:space-between; border-bottom:2px solid #1e3a6e; margin-bottom:10px; }
        .meta b { color:#1e3a6e; }
        table { width:100%; border-collapse:collapse; }
        th, td { border:1px solid #cbd5e1; padding:5px 6px; text-align:left; }
        thead th { background:#eef2f8; -webkit-print-color-adjust:exact; print-color-adjust:exact; color:#1e3a6e; font-size:10px; text-transform:uppercase; }
        tbody tr:nth-child(even) td { background:#f8fafc; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .footer { margin-top:14px; font-size:8.5px; color:#64748b; display:flex; justify-content:space-between; border-top:1px solid #e2e8f0; padding-top:6px; }
      </style></head><body>
      <div class="logo-bar">
        <img src="${window.location.origin}/logo-fc-branco-amarelo.png?v=1712" alt="FC Engenharia" />
        <div><h1>RELAÇÃO DE PENDÊNCIAS — ${esc(exameLabel.toUpperCase())}</h1><p>${esc(empresaNome)}</p></div>
      </div>
      <div class="meta"><span><b>Exame:</b> ${esc(exameLabel)}</span><span><b>Pendentes:</b> ${pendentes.length}</span><span><b>Emitido em:</b> ${hoje}</span></div>
      <table>
        <thead><tr><th style="width:28px">#</th><th>Colaborador</th><th>CPF</th><th>Função</th><th>Obra</th><th style="width:120px">Situação</th><th style="width:80px">Último ASO</th></tr></thead>
        <tbody>${linhas || `<tr><td colspan="7" style="text-align:center;padding:18px">Nenhum colaborador pendente para este exame.</td></tr>`}</tbody>
      </table>
      <div class="footer"><span>ERP FC Engenharia — Controle de Documentos / Mapeamento de Exames</span><span class="lgpd">LGPD (Lei 13.709/2018) — Uso restrito e confidencial.</span></div>
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
  };

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Carregando mapeamento...</div>;

  const kpiCards = [
    { label: "Colaboradores", valor: kpis.total, cor: "text-slate-700", bg: "bg-slate-50 border-slate-200", filtro: "todos" },
    { label: "Fez — em dia", valor: kpis.fezEmDia, cor: "text-green-700", bg: "bg-green-50 border-green-200", filtro: "fez_em_dia" },
    { label: "Fez — ASO vencido", valor: kpis.fezVencido, cor: "text-amber-700", bg: "bg-amber-50 border-amber-200", filtro: "fez_vencido" },
    { label: "Não fez o exame", valor: kpis.naoFez, cor: "text-red-700", bg: "bg-red-50 border-red-200", filtro: "nao_fez" },
    { label: "Sem ASO", valor: kpis.semAso, cor: "text-rose-700", bg: "bg-rose-50 border-rose-200", filtro: "sem_aso" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-teal-600" />
                Mapeamento / Cobertura de Exames
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Quem fez e quem não fez cada exame, com base no ASO vigente de cada colaborador. Foco: <strong>Avaliação Psicossocial</strong>.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-2 border-teal-300 text-teal-700 hover:bg-teal-50" onClick={imprimirPendentes} disabled={pendentes.length === 0}>
                <Printer className="h-4 w-4" /> Imprimir pendentes ({pendentes.length})
              </Button>
              {selecionados.size > 0 && (
                <Button size="sm" className="gap-2 bg-violet-600 hover:bg-violet-700" onClick={() => lerSelecionadosIA.mutate({ companyId, companyIds, asoIds: Array.from(selecionados) })} disabled={lerSelecionadosIA.isPending}>
                  {lerSelecionadosIA.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {lerSelecionadosIA.isPending ? "Processando..." : `Ler selecionados com IA (${selecionados.size})`}
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-50" onClick={() => lerLoteIA.mutate({ companyId, companyIds, limite: 10 })} disabled={lerLoteIA.isPending}>
                <Sparkles className="h-4 w-4" /> {lerLoteIA.isPending ? "Processando..." : "Ler ASOs com IA (lote)"}
              </Button>
              <Button size="sm" variant={showRevisao ? "default" : "outline"} className={`gap-2 ${showRevisao ? "bg-violet-600 hover:bg-violet-700" : "border-violet-300 text-violet-700 hover:bg-violet-50"}`} onClick={() => setShowRevisao((v) => !v)}>
                <ClipboardCheck className="h-4 w-4" /> Revisão por IA{fila.length > 0 ? ` (${fila.length})` : ""}
              </Button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="w-full sm:w-72">
              <Select value={exameKey} onValueChange={(v) => { setExameKey(v); setStatusFiltro("todos"); }}>
                <SelectTrigger><Filter className="h-4 w-4 mr-1 text-teal-600" /><SelectValue placeholder="Selecione o exame" /></SelectTrigger>
                <SelectContent>
                  {exames.map((e) => (
                    <SelectItem key={e.key} value={e.key}>{e.label} ({e.total})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* KPIs — clicáveis para filtrar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          {kpiCards.map((k) => (
            <button
              key={k.filtro}
              onClick={() => setStatusFiltro(k.filtro)}
              className={`text-left rounded-lg border-2 p-3 transition-all ${k.bg} ${statusFiltro === k.filtro ? "ring-2 ring-teal-400" : "hover:opacity-80"}`}
            >
              <div className={`text-2xl font-bold ${k.cor}`}>{k.valor}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{k.label}</div>
            </button>
          ))}
        </div>

        {/* ===== Fila de REVISÃO POR IA (Fase 2) ===== */}
        {showRevisao && (
          <div className="mb-4 rounded-lg border-2 border-violet-200 bg-violet-50/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-violet-800 flex items-center gap-2"><Sparkles className="h-4 w-4" /> Revisão das leituras da IA</h4>
              <span className="text-[11px] text-violet-700">A IA pré-preenche; nada é aplicado ao ASO sem sua aprovação.</span>
            </div>
            {revisaoQ.isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Carregando fila...</div>
            ) : fila.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Nenhuma leitura aguardando revisão. Use "Ler ASOs com IA (lote)" ou o botão IA de cada linha.</div>
            ) : (
              <div className="space-y-2">
                {fila.map((f: any) => (
                  <div key={f.id} className="rounded-md border bg-white p-3 text-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <PersonPhoto src={f.fotoUrl} alt={f.nomeCompleto} size="sm" />
                        <div>
                          <button className="text-blue-600 hover:underline font-medium" onClick={() => onClickEmployee(f.employeeId)}>{f.nomeCompleto}</button>
                          <div className="text-[11px] text-muted-foreground">{f.funcao || "-"} · ASO {f.dataExame ? formatDate(f.dataExame) : "-"}{typeof f.confianca === "number" ? ` · confiança ${f.confianca}%` : ""}</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700" onClick={() => aprovarIA.mutate({ extracaoId: f.id, companyId, companyIds })} disabled={aprovarIA.isPending}>
                          <CheckCircle2 className="h-4 w-4" /> Aprovar
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 border-red-300 text-red-700 hover:bg-red-50" onClick={() => rejeitarIA.mutate({ extracaoId: f.id, companyId, companyIds })} disabled={rejeitarIA.isPending}>
                          <X className="h-4 w-4" /> Descartar
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs">
                      <div className="rounded bg-violet-50 p-2"><span className="text-muted-foreground">Apto altura (NR-35): </span><strong>{f.aptoAltura || "—"}</strong>{f.aptoAlturaAtual ? <span className="text-muted-foreground"> (atual: {f.aptoAlturaAtual})</span> : null}</div>
                      <div className="rounded bg-violet-50 p-2"><span className="text-muted-foreground">Espaço confinado (NR-33): </span><strong>{f.aptoEspacoConfinado || "—"}</strong>{f.aptoEspacoConfinadoAtual ? <span className="text-muted-foreground"> (atual: {f.aptoEspacoConfinadoAtual})</span> : null}</div>
                      <div className="rounded bg-violet-50 p-2"><span className="text-muted-foreground">Resultado: </span><strong>{f.resultado || "—"}</strong></div>
                    </div>
                    {f.restricoes ? <div className="mt-1 text-xs"><span className="text-muted-foreground">Restrições: </span>{f.restricoes}</div> : null}
                    {f.fatoresRisco ? <div className="mt-1 text-xs"><span className="text-muted-foreground">Fatores de risco: </span>{f.fatoresRisco}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {exames.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Stethoscope className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum exame detectado nos ASOs cadastrados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-teal-50/50">
                  <th className="text-center p-2 font-medium w-8">
                    <input type="checkbox" className="h-4 w-4 accent-violet-600 cursor-pointer align-middle" checked={todosSelecionados} onChange={toggleTodos} disabled={selecionaveis.length === 0} title="Selecionar todos com PDF" />
                  </th>
                  <th className="text-left p-2 font-medium">Colaborador</th>
                  <th className="text-left p-2 font-medium">Função</th>
                  <th className="text-left p-2 font-medium">Obra</th>
                  <th className="text-left p-2 font-medium">Último ASO</th>
                  <th className="text-center p-2 font-medium">{exameLabel}</th>
                  <th className="text-left p-2 font-medium">Resultado</th>
                  <th className="text-center p-2 font-medium">IA</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c.employeeId} className={`border-b hover:bg-muted/20 ${c.temPdf && selecionados.has(c.asoId) ? "bg-violet-50/50" : ""}`}>
                    <td className="p-2 text-center">
                      {c.temPdf ? (
                        <input type="checkbox" className="h-4 w-4 accent-violet-600 cursor-pointer align-middle" checked={selecionados.has(c.asoId)} onChange={() => toggleSelecionado(c.asoId)} title="Selecionar para ler com IA" />
                      ) : null}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <PersonPhoto src={c.fotoUrl} alt={c.nomeCompleto} size="sm" />
                        <div>
                          <button className="text-blue-600 hover:underline font-medium text-left" onClick={() => onClickEmployee(c.employeeId)}>{c.nomeCompleto}</button>
                          <div className="text-[11px] text-muted-foreground font-mono">{c.cpf ? formatCPF(c.cpf) : "-"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-2 text-xs">{c.funcao || "-"}</td>
                    <td className="p-2 text-xs">{c.obraNome || "-"}</td>
                    <td className="p-2 text-xs">
                      {c.temAso ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono">{formatDate(c.dataExame)}</span>
                          <StatusBadge status={c.status} diasRestantes={c.diasRestantes ?? 0} />
                        </div>
                      ) : (
                        <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">SEM ASO</Badge>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {c._classe === "fez_em_dia" ? (
                        <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-4 w-4" /> Fez</span>
                      ) : c._classe === "fez_vencido" ? (
                        <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-4 w-4" /> Fez (vencido)</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600"><X className="h-4 w-4" /> Não fez</span>
                      )}
                    </td>
                    <td className="p-2 text-xs">{c.resultado ? c.resultado.replace("_", " ") : "-"}</td>
                    <td className="p-2 text-center">
                      {c.temPdf ? (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-violet-700 hover:bg-violet-50" title="Ler este ASO com IA" onClick={() => { setIaLoadingId(c.asoId); lerComIA.mutate({ asoId: c.asoId, companyId, companyIds }); }} disabled={lerComIA.isPending && iaLoadingId === c.asoId}>
                          {lerComIA.isPending && iaLoadingId === c.asoId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">sem PDF</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum colaborador para o filtro selecionado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============ LISTA DE EXAMES PADRÃO ============
const EXAMES_PADRAO = [
  "Audiometria", "Acuidade Visual", "Hemograma Completo", "Glicemia de Jejum",
  "EAS (Urina)", "ECG (Eletrocardiograma)", "Espirometria", "Raio-X de Tórax",
  "Raio-X de Coluna", "Hemoglobina Glicosilada", "Colesterol Total e Frações",
  "Triglicérides", "TGO/TGP (Hepático)", "Creatinina", "PSA",
  "Toxicológico", "Colinesterase", "Plumbemia (Chumbo)", "Reticulocitos",
  "Eletroencefalograma", "Exame Clínico"
];

// ============ COMPONENTE: AUTOCOMPLETE MÉDICO ============
function MedicoAutocomplete({ medicoValue, crmValue, onSelect, onChangeMedico, onChangeCrm, companyId, companyIds }: {
  medicoValue: string; crmValue: string;
  onSelect: (nome: string, crm: string) => void;
  onChangeMedico: (v: string) => void; onChangeCrm: (v: string) => void;
  companyId: number; companyIds?: number[];
}) {
  const [medicoSearch, setMedicoSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showNewMedico, setShowNewMedico] = useState(false);
  const [editingMedico, setEditingMedico] = useState<any>(null);
  const [newMedicoNome, setNewMedicoNome] = useState("");
  const [newMedicoCrm, setNewMedicoCrm] = useState("");
  const [newMedicoEsp, setNewMedicoEsp] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: medicosList = [] } = trpc.medicosClinicas.listarMedicos.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId || (companyIds && companyIds.length > 0) }
  );
  const criarMedico = trpc.medicosClinicas.criarMedico.useMutation();
  const atualizarMedico = trpc.medicosClinicas.atualizarMedico.useMutation();
  const utils = trpc.useUtils();

  const filtered = useMemo(() => {
    if (!medicoSearch) return (medicosList as any[]).filter((m: any) => Number(m.ativo) === 1);
    const term = medicoSearch.toLowerCase();
    return (medicosList as any[]).filter((m: any) => Number(m.ativo) === 1 && (m.nome.toLowerCase().includes(term) || m.crm.toLowerCase().includes(term)));
  }, [medicosList, medicoSearch]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectMedico = (m: any) => {
    onSelect(m.nome, m.crm);
    setMedicoSearch("");
    setShowSuggestions(false);
  };

  const openEditMedico = (e: React.MouseEvent, m: any) => {
    e.stopPropagation();
    setShowSuggestions(false);
    setEditingMedico(m);
    setShowNewMedico(true);
    setNewMedicoNome(m.nome);
    setNewMedicoCrm(m.crm);
    setNewMedicoEsp(m.especialidade || "");
  };

  const handleSave = async () => {
    if (!newMedicoNome.trim() || !newMedicoCrm.trim()) { toast.error("Nome e CRM são obrigatórios"); return; }
    try {
      if (editingMedico) {
        await atualizarMedico.mutateAsync({ id: editingMedico.id, companyId, nome: newMedicoNome.trim(), crm: newMedicoCrm.trim(), especialidade: newMedicoEsp.trim() || undefined });
        toast.success("Médico atualizado com sucesso!");
      } else {
        await criarMedico.mutateAsync({ companyId, nome: newMedicoNome.trim(), crm: newMedicoCrm.trim(), especialidade: newMedicoEsp.trim() || undefined });
        toast.success("Médico cadastrado com sucesso!");
      }
      utils.medicosClinicas.listarMedicos.invalidate();
      onSelect(newMedicoNome.trim(), newMedicoCrm.trim());
      setShowNewMedico(false);
      setEditingMedico(null);
      setNewMedicoNome(""); setNewMedicoCrm(""); setNewMedicoEsp("");
    } catch { toast.error(editingMedico ? "Erro ao atualizar médico" : "Erro ao cadastrar médico"); }
  };

  const cancelForm = () => {
    setShowNewMedico(false);
    setEditingMedico(null);
    setNewMedicoNome(""); setNewMedicoCrm(""); setNewMedicoEsp("");
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div ref={wrapperRef} className="relative">
        <label className="text-sm font-medium">Médico</label>
        <Input
          value={medicoValue || ""}
          onChange={e => { onChangeMedico(e.target.value); setMedicoSearch(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          placeholder="Digite para buscar..."
        />
        {showSuggestions && (filtered.length > 0 || medicoSearch) && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
            {filtered.map((m: any) => (
              <div key={m.id} className="flex items-center hover:bg-accent">
                <button type="button" className="flex-1 text-left px-3 py-2 text-sm flex justify-between items-center" onClick={() => selectMedico(m)}>
                  <span className="font-medium">{m.nome}</span>
                  <span className="text-xs text-muted-foreground">CRM: {m.crm}</span>
                </button>
                <button type="button" className="px-2 py-2 text-muted-foreground hover:text-blue-600" title="Editar médico" onClick={(e) => openEditMedico(e, m)}>
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm text-blue-600 border-t flex items-center gap-1" onClick={() => { setShowSuggestions(false); setEditingMedico(null); setShowNewMedico(true); setNewMedicoNome(medicoSearch); setNewMedicoCrm(""); setNewMedicoEsp(""); }}>
              <Plus className="h-3 w-3" /> Cadastrar novo médico
            </button>
          </div>
        )}
      </div>
      <div>
        <label className="text-sm font-medium">CRM</label>
        <Input value={crmValue || ""} onChange={e => onChangeCrm(e.target.value)} />
      </div>
      {showNewMedico && (
        <div className="col-span-1 sm:col-span-2 border rounded-lg p-3 bg-blue-50/50 space-y-2">
          <p className="text-sm font-medium text-blue-800">{editingMedico ? "Editar Médico" : "Cadastrar Novo Médico"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input placeholder="Nome completo *" value={newMedicoNome} onChange={e => setNewMedicoNome(e.target.value)} />
            <Input placeholder="CRM *" value={newMedicoCrm} onChange={e => setNewMedicoCrm(e.target.value)} />
            <Input placeholder="Especialidade" value={newMedicoEsp} onChange={e => setNewMedicoEsp(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={cancelForm}>Cancelar</Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={criarMedico.isPending || atualizarMedico.isPending}>
              {editingMedico ? "Atualizar" : "Salvar"} Médico
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ COMPONENTE: AUTOCOMPLETE CLÍNICA ============
function ClinicaAutocomplete({ value, onChange, companyId, companyIds }: {
  value: string; onChange: (v: string) => void; companyId: number; companyIds?: number[];
}) {
  const [search, setSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showNewClinica, setShowNewClinica] = useState(false);
  const [editingClinica, setEditingClinica] = useState<any>(null);
  const [newClinicaNome, setNewClinicaNome] = useState("");
  const [newClinicaEnd, setNewClinicaEnd] = useState("");
  const [newClinicaTel, setNewClinicaTel] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data: clinicasList = [] } = trpc.medicosClinicas.listarClinicas.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId || (companyIds && companyIds.length > 0) }
  );
  const criarClinica = trpc.medicosClinicas.criarClinica.useMutation();
  const atualizarClinica = trpc.medicosClinicas.atualizarClinica.useMutation();
  const utils = trpc.useUtils();

  const filtered = useMemo(() => {
    if (!search) return (clinicasList as any[]).filter((c: any) => Number(c.ativo) === 1);
    const term = search.toLowerCase();
    return (clinicasList as any[]).filter((c: any) => Number(c.ativo) === 1 && c.nome.toLowerCase().includes(term));
  }, [clinicasList, search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openEditClinica = (e: React.MouseEvent, c: any) => {
    e.stopPropagation();
    setShowSuggestions(false);
    setEditingClinica(c);
    setShowNewClinica(true);
    setNewClinicaNome(c.nome);
    setNewClinicaEnd(c.endereco || "");
    setNewClinicaTel(c.telefone || "");
  };

  const handleSave = async () => {
    if (!newClinicaNome.trim()) { toast.error("Nome da clínica é obrigatório"); return; }
    try {
      if (editingClinica) {
        await atualizarClinica.mutateAsync({ id: editingClinica.id, companyId, nome: newClinicaNome.trim(), endereco: newClinicaEnd.trim() || undefined, telefone: newClinicaTel.trim() || undefined });
        toast.success("Clínica atualizada com sucesso!");
      } else {
        await criarClinica.mutateAsync({ companyId, nome: newClinicaNome.trim(), endereco: newClinicaEnd.trim() || undefined, telefone: newClinicaTel.trim() || undefined });
        toast.success("Clínica cadastrada com sucesso!");
      }
      utils.medicosClinicas.listarClinicas.invalidate();
      onChange(newClinicaNome.trim());
      setShowNewClinica(false);
      setEditingClinica(null);
      setNewClinicaNome(""); setNewClinicaEnd(""); setNewClinicaTel("");
    } catch { toast.error(editingClinica ? "Erro ao atualizar clínica" : "Erro ao cadastrar clínica"); }
  };

  const cancelForm = () => {
    setShowNewClinica(false);
    setEditingClinica(null);
    setNewClinicaNome(""); setNewClinicaEnd(""); setNewClinicaTel("");
  };

  return (
    <div>
      <div ref={wrapperRef} className="relative">
        <label className="text-sm font-medium">Clínica</label>
        <Input
          value={value || ""}
          onChange={e => { onChange(e.target.value); setSearch(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          placeholder="Digite para buscar..."
        />
        {showSuggestions && (filtered.length > 0 || search) && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
            {filtered.map((c: any) => (
              <div key={c.id} className="flex items-center hover:bg-accent">
                <button type="button" className="flex-1 text-left px-3 py-2 text-sm" onClick={() => { onChange(c.nome); setSearch(""); setShowSuggestions(false); }}>
                  <span className="font-medium">{c.nome}</span>
                  {c.endereco && <span className="text-xs text-muted-foreground ml-2">{c.endereco}</span>}
                </button>
                <button type="button" className="px-2 py-2 text-muted-foreground hover:text-blue-600" title="Editar clínica" onClick={(e) => openEditClinica(e, c)}>
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button type="button" className="w-full text-left px-3 py-2 hover:bg-accent text-sm text-blue-600 border-t flex items-center gap-1" onClick={() => { setShowSuggestions(false); setEditingClinica(null); setShowNewClinica(true); setNewClinicaNome(search); setNewClinicaEnd(""); setNewClinicaTel(""); }}>
              <Plus className="h-3 w-3" /> Cadastrar nova clínica
            </button>
          </div>
        )}
      </div>
      {showNewClinica && (
        <div className="mt-2 border rounded-lg p-3 bg-blue-50/50 space-y-2">
          <p className="text-sm font-medium text-blue-800">{editingClinica ? "Editar Clínica" : "Cadastrar Nova Clínica"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input placeholder="Nome da clínica *" value={newClinicaNome} onChange={e => setNewClinicaNome(e.target.value)} />
            <Input placeholder="Endereço" value={newClinicaEnd} onChange={e => setNewClinicaEnd(e.target.value)} />
            <Input placeholder="Telefone" value={newClinicaTel} onChange={e => setNewClinicaTel(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={cancelForm}>Cancelar</Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={criarClinica.isPending || atualizarClinica.isPending}>
              {editingClinica ? "Atualizar" : "Salvar"} Clínica
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ COMPONENTE: EXAMES REALIZADOS (Checkboxes + Upload) ============
function ExamesRealizadosField({ value, onChange, companyId, companyIds }: { value: string; onChange: (v: string) => void; companyId: number; companyIds?: number[] }) {
  // Parse existing value: comma-separated string
  const selected = useMemo(() => {
    if (!value) return new Set<string>();
    return new Set(value.split(",").map(s => s.trim()).filter(Boolean));
  }, [value]);

  const [customExame, setCustomExame] = useState("");

  // Carregar exames customizados do banco de dados
  const { data: savedCustomExams = [] } = trpc.docs.customExams.list.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId || (companyIds && companyIds.length > 0) }
  );
  const addCustomExamMutation = trpc.docs.customExams.add.useMutation();

  // Merge: exames do banco + exames do valor atual que não estão no padrão nem no banco
  const customExamesFromDb = useMemo(() => (savedCustomExams as any[]).map((e: any) => e.nome), [savedCustomExams]);
  const customExamesFromValue = useMemo(() => {
    if (!value) return [];
    return value.split(",").map(s => s.trim()).filter(s => s && !EXAMES_PADRAO.includes(s) && !customExamesFromDb.includes(s));
  }, [value, customExamesFromDb]);

  const toggleExame = (exame: string) => {
    const newSet = new Set(selected);
    if (newSet.has(exame)) newSet.delete(exame);
    else newSet.add(exame);
    onChange(Array.from(newSet).join(", "));
  };

  const addCustom = () => {
    const trimmed = customExame.trim();
    if (!trimmed) return;
    // Salvar no banco para persistir para próximos ASOs
    addCustomExamMutation.mutate({ companyId, nome: trimmed });
    const newSet = new Set(selected);
    newSet.add(trimmed);
    onChange(Array.from(newSet).join(", "));
    setCustomExame("");
    toast.success(`Exame "${trimmed}" adicionado e salvo para próximos ASOs`);
  };

  const allExames = [...EXAMES_PADRAO, ...customExamesFromDb.filter(c => !EXAMES_PADRAO.includes(c)), ...customExamesFromValue.filter(c => !customExamesFromDb.includes(c))];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {allExames.map(exame => (
          <label key={exame} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
            selected.has(exame) 
              ? "bg-blue-50 border-blue-300 text-blue-800 font-medium" 
              : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
          }`}>
            <input type="checkbox" checked={selected.has(exame)} onChange={() => toggleExame(exame)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="truncate">{exame}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Adicionar outro exame..."
          value={customExame}
          onChange={e => setCustomExame(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={addCustom} disabled={!customExame.trim()}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </div>
      {selected.size > 0 && (
        <p className="text-xs text-muted-foreground">{selected.size} exame(s) selecionado(s)</p>
      )}
    </div>
  );
}

// ============ COMPONENTE: DOCUMENTOS DO FUNCIONÁRIO ============
const TIPOS_DOC_LABELS: Record<string, string> = {
  rg: "RG", cnh: "CNH", ctps: "CTPS", comprovante_residencia: "Comprovante de Residência",
  certidao_nascimento: "Certidão de Nascimento", titulo_eleitor: "Título de Eleitor",
  reservista: "Reservista", pis: "PIS/PASEP", foto_3x4: "Foto 3x4",
  contrato_trabalho: "Contrato de Trabalho", termo_rescisao: "Termo de Rescisão",
  atestado_medico: "Atestado Médico", diploma: "Diploma", certificado: "Certificado", outros: "Outros"
};

function DocumentosPanel({ companyId, companyIds, employees, onClickEmployee, EmployeeSelect }: { companyId: number; companyIds?: number[]; employees: any[]; onClickEmployee: (id: number) => void; EmployeeSelect?: React.FC<{ value: number | undefined; onChange: (id: number) => void }> }) {
  const { data: docs = [], refetch } = trpc.employeeDocuments.listar.useQuery({ companyId, companyIds }, { enabled: !!companyId || (companyIds && companyIds.length > 0) });
  const uploadDoc = trpc.employeeDocuments.upload.useMutation({ onSuccess: () => { refetch(); toast.success("Documento enviado!"); } });
  const deleteDoc = trpc.employeeDocuments.excluir.useMutation({ onSuccess: () => { refetch(); toast.success("Documento excluído!"); } });
  const updateDoc = trpc.employeeDocuments.atualizar.useMutation({ onSuccess: () => { refetch(); toast.success("Documento atualizado!"); } });

  const [showUpload, setShowUpload] = useState(false);
  const [docForm, setDocForm] = useState<any>({});
  const [editingDoc, setEditingDoc] = useState<any>(null);
  const [editForm, setEditForm] = useState<{ tipo: string; descricao: string; dataValidade: string }>({ tipo: "", descricao: "", dataValidade: "" });
  const [searchDoc, setSearchDoc] = useState("");
  const [filterTipo, setFilterTipo] = useState("todos");

  const openEdit = (d: any) => {
    setEditingDoc(d);
    setEditForm({
      tipo: d.tipo || "",
      descricao: d.descricao || "",
      dataValidade: d.dataValidade ? String(d.dataValidade).split("T")[0] : "",
    });
  };
  const handleSaveEdit = async () => {
    if (!editingDoc) return;
    await updateDoc.mutateAsync({
      companyId,
      companyIds,
      id: editingDoc.id,
      tipo: editForm.tipo as any,
      descricao: editForm.descricao || null,
      dataValidade: editForm.dataValidade || null,
    });
    setEditingDoc(null);
  };

  const filtered = useMemo(() => {
    let list = docs as any[];
    if (searchDoc) {
      const s = removeAccents(searchDoc);
      const emp = employees.find((e: any) => list.some(d => d.employeeId === e.id));
      list = list.filter(d => {
        const empName = employees.find((e: any) => e.id === d.employeeId)?.nomeCompleto || "";
        return removeAccents(empName || '').includes(s) || removeAccents(d.nome || '').includes(s) || (TIPOS_DOC_LABELS[d.tipo] || d.tipo).toLowerCase().includes(s);
      });
    }
    if (filterTipo !== "todos") list = list.filter(d => d.tipo === filterTipo);
    return list;
  }, [docs, searchDoc, filterTipo, employees]);

  const handleUploadSubmit = async () => {
    if (!docForm.employeeId || !docForm.tipo || !docForm._file) { toast.error("Preencha funcionário, tipo e selecione um arquivo"); return; }
    const file = docForm._file as File;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        await uploadDoc.mutateAsync({ companyId, companyIds, employeeId: docForm.employeeId,
          tipo: docForm.tipo,
          nome: file.name,
          descricao: docForm.descricao || undefined,
          fileBase64: base64,
          mimeType: file.type || "application/pdf",
          fileSize: file.size,
          dataValidade: docForm.dataValidade || undefined,
        });
        setShowUpload(false);
        setDocForm({});
      } catch { toast.error("Erro ao enviar documento"); }
    };
    reader.readAsDataURL(file);
  };

  // Group by employee
  const groupedByEmployee = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const d of filtered) {
      const arr = map.get(d.employeeId) || [];
      arr.push(d);
      map.set(d.employeeId, arr);
    }
    return map;
  }, [filtered]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Documentos dos Colaboradores</CardTitle>
        <Button size="sm" onClick={() => { setDocForm({}); setShowUpload(true); }}><Plus className="h-4 w-4 mr-1" /> Novo Documento</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou documento..." value={searchDoc} onChange={e => setSearchDoc(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {Object.entries(TIPOS_DOC_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p>Nenhum documento encontrado</p>
            <p className="text-xs">Clique em "Novo Documento" para adicionar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-2 font-medium">Colaborador</th>
                  <th className="text-left p-2 font-medium">Tipo</th>
                  <th className="text-left p-2 font-medium">Arquivo</th>
                  <th className="text-left p-2 font-medium">Validade</th>
                  <th className="text-left p-2 font-medium">Enviado em</th>
                  <th className="text-center p-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d: any) => {
                  const emp = employees.find((e: any) => e.id === d.employeeId);
                  const vencido = d.dataValidade && d.dataValidade < new Date().toISOString().split("T")[0];
                  return (
                    <tr key={d.id} className="border-b hover:bg-muted/20">
                      <td className="p-2">
                        <button className="text-blue-600 hover:underline text-left" onClick={() => onClickEmployee(d.employeeId)}>
                          {emp?.nomeCompleto || "Desconhecido"}
                        </button>
                      </td>
                      <td className="p-2"><Badge variant="outline">{TIPOS_DOC_LABELS[d.tipo] || d.tipo}</Badge></td>
                      <td className="p-2">
                        <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                          <FileText className="h-3 w-3" /> {d.nome}
                        </a>
                      </td>
                      <td className="p-2">
                        {d.dataValidade ? (
                          <span className={vencido ? "text-red-600 font-medium" : ""}>{formatDate(d.dataValidade)} {vencido && <Badge variant="destructive" className="ml-1 text-xs">Vencido</Badge>}</span>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="p-2 text-muted-foreground">{formatDate(d.createdAt?.split("T")[0] || d.createdAt?.split(" ")[0])}</td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50" title="Editar tipo, descrição e validade" onClick={() => openEdit(d)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" title="Excluir documento" onClick={() => { if (confirm("Excluir este documento?")) deleteDoc.mutate({ id: d.id, companyId, companyIds }); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Dialog de Upload */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent
          className="w-[100vw] h-[100dvh] max-w-none sm:w-[96vw] sm:h-auto sm:max-h-[92dvh] sm:max-w-[760px] p-0 overflow-hidden flex flex-col gap-0"
          resizable={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Novo Documento do Colaborador</DialogTitle>
          </DialogHeader>
          {/* Header gradient */}
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white px-6 py-5 shadow-md">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2.5 rounded-lg">
                <FileUp className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold leading-tight">Novo Documento do Colaborador</h2>
                <p className="text-emerald-50 text-sm mt-0.5">
                  Anexe ASOs, atestados, treinamentos, advertências e demais documentos do RAIO-X.
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            <div className="max-w-2xl mx-auto space-y-5">

              {/* Card: Identificação */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-600" />
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Identificação</span>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">
                      Colaborador <span className="text-rose-600">*</span>
                    </label>
                    {EmployeeSelect ? (
                      <EmployeeSelect value={docForm.employeeId} onChange={(id: number) => setDocForm({ ...docForm, employeeId: id })} />
                    ) : (
                      <Select value={docForm.employeeId?.toString() || ""} onValueChange={v => setDocForm({ ...docForm, employeeId: parseInt(v) })}>
                        <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                        <SelectContent>
                          {employees.map((e: any) => <SelectItem key={e.id} value={e.id.toString()}>{e.nomeCompleto}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">
                      Tipo de Documento <span className="text-rose-600">*</span>
                    </label>
                    <Select value={docForm.tipo || ""} onValueChange={v => setDocForm({ ...docForm, tipo: v })}>
                      <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TIPOS_DOC_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v as string}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="doc-descricao" className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block">Descrição</label>
                    <Input
                      id="doc-descricao"
                      value={docForm.descricao || ""}
                      onChange={e => setDocForm({ ...docForm, descricao: e.target.value })}
                      placeholder="Ex.: ASO admissional, certificado NR-35, atestado de 3 dias..."
                      className="h-9 bg-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="doc-validade" className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5 block flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-500" />
                      Data de Validade
                      <span className="text-[10px] font-normal text-slate-500 normal-case tracking-normal ml-1">(opcional — só para ASO, NR e similares)</span>
                    </label>
                    <Input
                      id="doc-validade"
                      type="date"
                      value={docForm.dataValidade || ""}
                      onChange={e => setDocForm({ ...docForm, dataValidade: e.target.value })}
                      className="h-9 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Card: Arquivo */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-slate-600" />
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Arquivo</span>
                  <span className="text-[10px] text-slate-500 ml-auto">PDF, JPG ou PNG — máx 10 MB</span>
                </div>
                <div className="p-4">
                  <label
                    htmlFor="doc-file-upload"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        (document.getElementById("doc-file-upload") as HTMLInputElement | null)?.click();
                      }
                    }}
                    className={`block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                      docForm._file
                        ? "border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50"
                        : "border-slate-300 bg-slate-50/50 hover:border-emerald-400 hover:bg-emerald-50/30"
                    }`}
                  >
                    {docForm._file ? (
                      <div className="flex items-center justify-center gap-3">
                        <div className="bg-emerald-100 p-2.5 rounded-full">
                          <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                        </div>
                        <div className="text-left min-w-0">
                          <p className="text-sm font-semibold text-emerald-800 truncate max-w-[400px]">{docForm._file.name}</p>
                          <p className="text-[11px] text-emerald-700">
                            {(docForm._file.size / 1024).toFixed(0)} KB · clique para trocar
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="bg-slate-100 p-3 rounded-full">
                          <Upload className="h-6 w-6 text-slate-500" />
                        </div>
                        <p className="text-sm font-medium text-slate-700">Clique para selecionar o arquivo</p>
                        <p className="text-[11px] text-slate-500">PDF, JPG ou PNG até 10 MB</p>
                      </div>
                    )}
                    <Input
                      id="doc-file-upload"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
                          setDocForm({ ...docForm, _file: file });
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

            </div>
          </div>

          {/* Footer pill */}
          <div className="border-t border-slate-200 bg-white px-6 py-3 flex items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-slate-400" />
              Documento ficará vinculado ao RAIO-X do colaborador.
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowUpload(false)} className="h-9">Cancelar</Button>
              <Button
                size="sm"
                onClick={handleUploadSubmit}
                disabled={uploadDoc.isPending || !docForm.employeeId || !docForm.tipo || !docForm._file}
                className="h-9 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold shadow-sm"
              >
                {uploadDoc.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Enviando...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-1.5" /> Enviar Documento</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Edição (full-screen, R-001) */}
      <Dialog open={!!editingDoc} onOpenChange={(o) => { if (!o) setEditingDoc(null); }}>
        <DialogContent
          className="w-[100vw] h-[100dvh] max-w-none sm:w-[98vw] sm:h-[96dvh] sm:max-w-[1400px] p-0 overflow-hidden flex flex-col gap-0"
          resizable={false}
        >
          <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white px-6 py-5 shadow-md">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2.5 rounded-lg">
                <Pencil className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold leading-tight">Editar Documento</h2>
                <p className="text-blue-100 text-sm mt-0.5 truncate">
                  {editingDoc?.nome || ""}
                  {editingDoc?.employeeId ? ` · ${employees.find((e: any) => e.id === editingDoc.employeeId)?.nomeCompleto || ""}` : ""}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            <div className="max-w-3xl mx-auto space-y-5">
              <div className="bg-white rounded-lg border p-5 space-y-4 shadow-sm">
                <div>
                  <label className="text-sm font-medium text-slate-700">Tipo de Documento</label>
                  <Select value={editForm.tipo} onValueChange={(v) => setEditForm({ ...editForm, tipo: v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPOS_DOC_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">Descrição</label>
                  <Input
                    className="mt-1"
                    value={editForm.descricao}
                    onChange={(e) => setEditForm({ ...editForm, descricao: e.target.value })}
                    placeholder="Descrição opcional"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">Data de Validade</label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      type="date"
                      value={editForm.dataValidade}
                      onChange={(e) => setEditForm({ ...editForm, dataValidade: e.target.value })}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="text-amber-700 border-amber-300 hover:bg-amber-50"
                      onClick={() => setEditForm({ ...editForm, dataValidade: "" })}
                      title="Limpar data de validade (documento sem prazo)"
                    >
                      <X className="h-4 w-4 mr-1" /> Limpar
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 flex items-start gap-1.5">
                    <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-blue-600" />
                    <span>Se o documento <b>não tem prazo de validade</b>, clique em "Limpar" para remover a data — o badge "Vencido" some.</span>
                  </p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">O arquivo enviado <b>NÃO é alterado</b> aqui.</p>
                    <p className="mt-1 text-amber-800">Para trocar o PDF/imagem, exclua este documento e faça um novo upload.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t bg-white px-6 py-4 flex items-center justify-end gap-2 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
            <Button variant="outline" onClick={() => setEditingDoc(null)}>Cancelar</Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateDoc.isPending || !editForm.tipo}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateDoc.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando...</> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Salvar alterações</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function ControleDocumentos() {
  const { selectedCompanyId, companies, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : !!companyId;
  const selectedCompany = companies?.find((c: any) => String(c.id) === selectedCompanyId);
  const nomeEmpresaCompleto = selectedCompany?.razaoSocial || selectedCompany?.nomeFantasia || "Empresa";
  const nomeEmpresaCurto = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "Empresa";
  const companyLogoUrl = selectedCompany?.logoUrl || "";
  // Rev. 2747 — Advertência consome o template Vigente (advertencia) quando existir.
  const advTplQ = trpc.systemDocumentTemplates.getVigente.useQuery({ tipo: "advertencia" });
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("aso");

  // ============ QUERIES ============
  const { data: resumo } = trpc.docs.resumo.useQuery({ companyId, companyIds }, { enabled: !!companyId || (companyIds && companyIds.length > 0) });
  const { data: asoList = [], refetch: refetchAso } = trpc.docs.asos.list.useQuery({ companyId, companyIds }, { enabled: !!companyId || (companyIds && companyIds.length > 0) });
  const { data: treinList = [], refetch: refetchTrein } = trpc.docs.treinamentos.list.useQuery({ companyId, companyIds }, { enabled: !!companyId || (companyIds && companyIds.length > 0) });
  const { data: atestList = [], refetch: refetchAtest } = trpc.docs.atestados.list.useQuery({ companyId, companyIds }, { enabled: !!companyId || (companyIds && companyIds.length > 0) });
  const { data: advList = [], refetch: refetchAdv } = trpc.docs.advertencias.list.useQuery({ companyId, companyIds }, { enabled: !!companyId || (companyIds && companyIds.length > 0) });
  const { data: allEmployees = [] } = trpc.employees.list.useQuery({ companyId, companyIds }, { enabled: !!companyId || (companyIds && companyIds.length > 0) });

  const activeEmployees = useMemo(() => {
    return (allEmployees as any[]).filter((e: any) => e.status === "Ativo");
  }, [allEmployees]);

  // ============ MUTATIONS ============
  const createAso = trpc.docs.asos.create.useMutation({ onSuccess: () => { refetchAso(); toast.success("ASO cadastrado!"); } });
  const updateAso = trpc.docs.asos.update.useMutation({ onSuccess: () => { refetchAso(); toast.success("ASO atualizado!"); } });
  const deleteAso = trpc.docs.asos.delete.useMutation({ onSuccess: () => { refetchAso(); toast.success("ASO excluído!"); } });
  const uploadAsoDoc = trpc.docs.asos.uploadDoc.useMutation({ onSuccess: () => { refetchAso(); } });

  const createTrein = trpc.docs.treinamentos.create.useMutation({ onSuccess: () => { refetchTrein(); toast.success("Treinamento cadastrado!"); } });
  const updateTrein = trpc.docs.treinamentos.update.useMutation({ onSuccess: () => { refetchTrein(); toast.success("Treinamento atualizado!"); } });
  const deleteTrein = trpc.docs.treinamentos.delete.useMutation({ onSuccess: () => { refetchTrein(); toast.success("Treinamento excluído!"); } });
  const uploadTreinDoc = trpc.docs.treinamentos.uploadDoc.useMutation({ onSuccess: () => { refetchTrein(); toast.success("Certificado anexado!"); } });

  const createAtest = trpc.docs.atestados.create.useMutation({ onSuccess: () => { refetchAtest(); toast.success("Atestado cadastrado!"); } });
  const updateAtest = trpc.docs.atestados.update.useMutation({ onSuccess: () => { refetchAtest(); toast.success("Atestado atualizado!"); } });
  const deleteAtest = trpc.docs.atestados.delete.useMutation({ onSuccess: () => { refetchAtest(); toast.success("Atestado excluído!"); } });
  const uploadAtestDoc = trpc.docs.atestados.uploadDoc.useMutation({ onSuccess: () => { refetchAtest(); toast.success("Documento anexado!"); } });

  const createAdv = trpc.docs.advertencias.create.useMutation({ onSuccess: (result: any) => { refetchAdv(); if (result?.alerta) { toast.warning(result.alerta, { duration: 8000 }); } else { toast.success(`Advertência cadastrada! (${result?.sequencia || ''}ª do colaborador)`); } if (result?.id) { setLastCreatedAdvId(result.id); } } });
  const [lastCreatedAdvId, setLastCreatedAdvId] = useState<number | null>(null);
  const deleteAtestBatch = trpc.docs.atestadosDeleteBatch.useMutation({ onSuccess: (r: any) => { refetchAtest(); toast.success(`${r.deletados} atestado(s) excluído(s)!`); setSelectedAtestIds([]); } });
  const { user: authUser } = useAuth();
  const updateAdv = trpc.docs.advertencias.update.useMutation({ onSuccess: () => { refetchAdv(); toast.success("Advertência atualizada!"); }, onError: (e: any) => { toast.error(e?.message || "Não foi possível atualizar a advertência."); } });
  const deleteAdv = trpc.docs.advertencias.delete.useMutation({ onSuccess: () => { refetchAdv(); toast.success("Advertência excluída!"); } });
  const uploadAdvDoc = trpc.docs.advertencias.uploadDoc.useMutation({ onSuccess: () => { refetchAdv(); toast.success("Documento anexado!"); } });

  const importAso = trpc.docs.asos.importBatch.useMutation({ onSuccess: (r) => { refetchAso(); toast.success(`${r.imported} ASOs importados!`); } });

  // ============ DIALOGS ============
  const [showAsoDialog, setShowAsoDialog] = useState(false);
  const [showTreinDialog, setShowTreinDialog] = useState(false);
  const [showAtestDialog, setShowAtestDialog] = useState(false);
  const [showAdvDialog, setShowAdvDialog] = useState(false);
  const [showImportAso, setShowImportAso] = useState(false);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [atestPreviewDoc, setAtestPreviewDoc] = useState<{ url: string; name: string; title: string } | null>(null);

  // ============ EDIT MODE (null = criação, number = edição) ============
  const [editingAsoId, setEditingAsoId] = useState<number | null>(null);
  const [editingTreinId, setEditingTreinId] = useState<number | null>(null);
  const [editingAtestId, setEditingAtestId] = useState<number | null>(null);
  const [editingAdvId, setEditingAdvId] = useState<number | null>(null);
  const [selectedAtestIds, setSelectedAtestIds] = useState<number[]>([]);
  const [advEmployeeCount, setAdvEmployeeCount] = useState<{total: number; proximaAcao: string; sugestaoTipo: string} | null>(null);
  const [showAdvPreview, setShowAdvPreview] = useState(false);
  const [previewAdvData, setPreviewAdvData] = useState<any>(null);
  const [showAdvAssinaturas, setShowAdvAssinaturas] = useState(false);
  const [advAssinaturasData, setAdvAssinaturasData] = useState<any>(null);
  const [asoUploadDialog, setAsoUploadDialog] = useState<{ id: number; nomeCompleto: string; file: File; base64: string } | null>(null);
  const [asoUploadDate, setAsoUploadDate] = useState("");
  const [asoUploadValidadeDias, setAsoUploadValidadeDias] = useState(365);

  // ============ FORM STATES ============
  const [asoForm, setAsoForm] = useState<any>({});
  const [treinForm, setTreinForm] = useState<any>({});
  const [nrSearch, setNrSearch] = useState("");
  const [nrDropdownOpen, setNrDropdownOpen] = useState(false);
  const nrContainerRef = useRef<HTMLDivElement>(null);
  const nrInputRef = useRef<HTMLInputElement>(null);
  const [atestForm, setAtestForm] = useState<any>({});
  const [advForm, setAdvForm] = useState<any>({});

  // ============ PRE-FILL FROM URL/SESSION PARAMS (sidebar shortcuts) ============
  const applyNavParams = useCallback(() => {
    // Check sessionStorage first (from sidebar navigation), then URL params (from direct link)
    const stored = sessionStorage.getItem('_navParams');
    const params = stored
      ? new URLSearchParams(stored)
      : new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const action = params.get("action");
    if (stored) sessionStorage.removeItem('_navParams');
    if (tab === "advertencias") {
      setActiveTab("advertencias");
      if (action === "nova") {
        // Read pre-fill data from sessionStorage
        const raw = sessionStorage.getItem("advPreFill");
        if (raw) {
          try {
            const preFill = JSON.parse(raw);
            setEditingAdvId(null);
            setAdvForm({
              employeeId: preFill.employeeId,
              dataOcorrencia: preFill.dataOcorrencia || "",
              motivo: preFill.motivo || "",
              descricao: preFill.descricao || "",
              tipoAdvertencia: "", // User must choose
            });
            setShowAdvDialog(true);
            sessionStorage.removeItem("advPreFill");
            toast.info(`Advertência para ${preFill.employeeName || "colaborador"} — preencha o tipo e confirme.`, { duration: 6000 });
          } catch { /* ignore parse errors */ }
        }
      }
      // Clean URL params without reload
      window.history.replaceState({}, "", window.location.pathname);
    } else if (tab === "atestados") {
      setActiveTab("atestados");
      // Clean URL params without reload
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Run on mount
  useEffect(() => {
    applyNavParams();
  }, [applyNavParams]);

  // Listen for sidebar re-clicks when already on this page
  useEffect(() => {
    const handler = () => applyNavParams();
    window.addEventListener('navParamsUpdated', handler);
    return () => window.removeEventListener('navParamsUpdated', handler);
  }, [applyNavParams]);

  // ============ FILTER ============
  const [statusFilter, setStatusFilter] = useState("todos");
  const [expandedAsoEmps, setExpandedAsoEmps] = useState<Set<number>>(new Set());
  const toggleAsoEmp = (empId: number) => setExpandedAsoEmps(prev => {
    const next = new Set(prev);
    next.has(empId) ? next.delete(empId) : next.add(empId);
    return next;
  });
  const [cardFilter, setCardFilter] = useState<string | null>(null);
  const [validadeForceTipo, setValidadeForceTipo] = useState<string | undefined>(undefined);
  const [validadeForceStatus, setValidadeForceStatus] = useState<string | undefined>(undefined);

  const handleCardClick = (filter: string) => {
    const resetAll = () => {
      setCardFilter(null);
      setStatusFilter("todos");
      setValidadeForceTipo(undefined);
      setValidadeForceStatus(undefined);
    };
    if (cardFilter === filter) {
      // Toggle off — volta ao tab padrão do grupo
      resetAll();
      if (filter === "asos" || filter === "vencido" || filter === "vencer" || filter === "semASO") setActiveTab("aso");
      else if (filter === "treinamentos" || filter === "treinVencido" || filter === "treinVencer") setActiveTab("treinamentos");
      else if (filter === "atestados") setActiveTab("atestados");
      else if (filter === "advertencias") setActiveTab("advertencias");
    } else {
      resetAll();
      setCardFilter(filter);
      if (filter === "asos") { setActiveTab("aso"); setStatusFilter("todos"); }
      else if (filter === "vencido") { setActiveTab("aso"); setStatusFilter("vencido"); }
      else if (filter === "vencer") { setActiveTab("aso"); setStatusFilter("vencer"); }
      else if (filter === "semASO") { setActiveTab("semASO"); setStatusFilter("todos"); }
      else if (filter === "treinamentos") { setActiveTab("treinamentos"); setStatusFilter("todos"); }
      else if (filter === "treinVencido") { setActiveTab("validade"); setValidadeForceTipo("Treinamento"); setValidadeForceStatus("vencido"); }
      else if (filter === "treinVencer") { setActiveTab("validade"); setValidadeForceTipo("Treinamento"); setValidadeForceStatus("vencer30"); }
      else if (filter === "atestados") { setActiveTab("atestados"); setStatusFilter("todos"); }
      else if (filter === "advertencias") { setActiveTab("advertencias"); setStatusFilter("todos"); }
    }
  };

  const filteredAso = useMemo(() => {
    let list = asoList as any[];
    if (search) {
      const s = removeAccents(search);
      list = list.filter((a: any) => removeAccents(a.nomeCompleto || '').includes(s) || a.cpf?.includes(s));
    }
    if (statusFilter === "valido") list = list.filter((a: any) => a.status === "VÁLIDO");
    else if (statusFilter === "vencer") list = list.filter((a: any) => a.status?.includes("DIAS PARA VENCER"));
    else if (statusFilter === "vencido") list = list.filter((a: any) => a.status === "VENCIDO");
    else if (statusFilter === "substituido") list = list.filter((a: any) => a.status === "SUBSTITUÍDO");
    return list;
  }, [asoList, search, statusFilter]);

  // Agrupa os ASOs por funcionário (vigentes em destaque + histórico recolhível)
  const groupedAso = useMemo(() => {
    const map = new Map<number, { employeeId: number; nomeCompleto: string; atuais: any[]; historicos: any[] }>();
    for (const a of filteredAso) {
      const key = a.employeeId ?? -1;
      if (!map.has(key)) map.set(key, { employeeId: key, nomeCompleto: a.nomeCompleto, atuais: [], historicos: [] });
      const g = map.get(key)!;
      (a.isHistorico ? g.historicos : g.atuais).push(a);
    }
    return Array.from(map.values());
  }, [filteredAso]);

  const filteredNrRules = useMemo(() => {
    if (!nrSearch.trim()) return null;
    const q = removeAccents(nrSearch.trim().toLowerCase());
    return TRAINING_RULES.filter(r =>
      removeAccents(r.nome.toLowerCase()).includes(q) ||
      (r.norma && removeAccents(r.norma.toLowerCase()).includes(q))
    );
  }, [nrSearch]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (nrContainerRef.current && !nrContainerRef.current.contains(e.target as Node)) {
        setNrDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredTrein = useMemo(() => {
    let list = treinList as any[];
    if (search) {
      const s = removeAccents(search);
      list = list.filter((t: any) => removeAccents(t.nomeCompleto || '').includes(s) || removeAccents(t.nome || '').includes(s));
    }
    return list;
  }, [treinList, search]);

  const filteredAtest = useMemo(() => {
    let list = atestList as any[];
    if (search) {
      const s = removeAccents(search);
      list = list.filter((a: any) => removeAccents(a.nomeCompleto || '').includes(s));
    }
    return list;
  }, [atestList, search]);

  const filteredAdv = useMemo(() => {
    let list = advList as any[];
    if (search) {
      const s = removeAccents(search);
      list = list.filter((a: any) => removeAccents(a.nomeCompleto || '').includes(s));
    }
    return list;
  }, [advList, search]);

  // ============ UPLOAD HANDLER ============
  const handleUploadDoc = async (type: string, id: number, asoRecord?: any) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png";
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        try {
          if (type === "aso") {
            setAsoUploadDate("");
            setAsoUploadValidadeDias(asoRecord?.validadeDias || 365);
            setAsoUploadDialog({ id, nomeCompleto: asoRecord?.nomeCompleto || "", file, base64 });
            return;
          }
          else if (type === "trein") await uploadTreinDoc.mutateAsync({ id, fileBase64: base64, fileName: file.name });
          else if (type === "atest") await uploadAtestDoc.mutateAsync({ id, fileBase64: base64, fileName: file.name });
          else if (type === "adv") await uploadAdvDoc.mutateAsync({ id, fileBase64: base64, fileName: file.name });
        } catch { toast.error("Erro ao enviar documento"); }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleConfirmAsoUpload = async () => {
    if (!asoUploadDialog) return;
    try {
      await uploadAsoDoc.mutateAsync({
        id: asoUploadDialog.id,
        fileBase64: asoUploadDialog.base64,
        fileName: asoUploadDialog.file.name,
        ...(asoUploadDate ? { dataExame: asoUploadDate, validadeDias: asoUploadValidadeDias } : {}),
      });
      toast.success(asoUploadDate ? "Documento anexado e data atualizada!" : "Documento anexado!");
    } catch { toast.error("Erro ao enviar documento"); }
    setAsoUploadDialog(null);
  };

  // ============ OPEN DIALOGS ============
  const openNewAso = () => { setEditingAsoId(null); setAsoForm({}); setShowAsoDialog(true); };
  const openEditAso = (a: any) => {
    setEditingAsoId(a.id);
    setAsoForm({ employeeId: a.employeeId, tipo: a.tipo, dataExame: a.dataExame, validadeDias: a.validadeDias || 365, resultado: a.resultado || "Apto", medico: a.medico || "", crm: a.crm || "", clinica: a.clinica || "", examesRealizados: a.examesRealizados || "", observacoes: a.observacoes || "" });
    setShowAsoDialog(true);
  };

  const openNewTrein = () => { setEditingTreinId(null); setTreinForm({}); setShowTreinDialog(true); };
  const openEditTrein = (t: any) => {
    setEditingTreinId(t.id);
    setTreinForm({ employeeId: t.employeeId, nome: t.nome || "", norma: t.norma || "", cargaHoraria: t.cargaHoraria || "", dataRealizacao: t.dataRealizacao || "", dataValidade: t.dataValidade || "", instrutor: t.instrutor || "", entidade: t.entidade || "", observacoes: t.observacoes || "" });
    setShowTreinDialog(true);
  };

  const openNewAtest = () => { setEditingAtestId(null); setAtestForm({}); setShowAtestDialog(true); };
  const openEditAtest = (a: any) => {
    setEditingAtestId(a.id);
    setAtestForm({ employeeId: a.employeeId, tipo: a.tipo || "", dataEmissao: a.dataEmissao || "", diasAfastamento: a.diasAfastamento || 0, horasAfastamento: Number(a.horasAfastamento) || 0, afastamentoTipo: a.afastamentoTipo || "dia", dataRetorno: a.dataRetorno || "", cid: a.cid || "", medico: a.medico || "", crm: a.crm || "", descricao: a.descricao || "", motivo: a.motivo || "", motivoOutro: a.motivoOutro || "" });
    setShowAtestDialog(true);
  };

  const openNewAdv = () => { setEditingAdvId(null); setAdvForm({}); setShowAdvDialog(true); };
  const openEditAdv = (a: any) => {
    setEditingAdvId(a.id);
    setAdvForm({ employeeId: a.employeeId, tipoAdvertencia: a.tipoAdvertencia || "", dataOcorrencia: a.dataOcorrencia || "", motivo: a.motivo || "", descricao: a.descricao || "", testemunhas: a.testemunhas || "" });
    setShowAdvDialog(true);
  };

  // ============ SUBMIT HANDLERS ============
  const handleSubmitAso = async () => {
    if (!asoForm.employeeId || !asoForm.tipo || !asoForm.dataExame) { toast.error("Preencha os campos obrigatórios"); return; }
    const { _file, ...formData } = asoForm;
    try {
      let asoId = editingAsoId;
      if (editingAsoId) {
        await updateAso.mutateAsync({ id: editingAsoId, ...formData, validadeDias: formData.validadeDias || 365 });
      } else {
        const result = await createAso.mutateAsync({ companyId, companyIds, ...formData, validadeDias: formData.validadeDias || 365 });
        asoId = (result as any)?.id || null;
      }
      if (_file && asoId) {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1];
          try {
            await uploadAsoDoc.mutateAsync({ id: asoId!, fileBase64: base64, fileName: _file.name });
            toast.success("Documento anexado com sucesso!");
          } catch { toast.error("ASO salvo, mas erro ao anexar documento"); }
        };
        reader.readAsDataURL(_file);
      }
    } catch { toast.error("Erro ao salvar ASO"); }
    setShowAsoDialog(false); setAsoForm({}); setEditingAsoId(null);
  };

  const handleSubmitTrein = async () => {
    if (!treinForm.employeeId || !treinForm.nome || !treinForm.dataRealizacao) { toast.error("Preencha os campos obrigatórios"); return; }
    const { _file, ...formData } = treinForm;
    try {
      let treinId = editingTreinId;
      if (editingTreinId) {
        await updateTrein.mutateAsync({ id: editingTreinId, ...formData });
      } else {
        const result = await createTrein.mutateAsync({ companyId, companyIds, ...formData });
        treinId = (result as any)?.id || null;
      }
      if (_file && treinId) {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1];
          try {
            await uploadTreinDoc.mutateAsync({ id: treinId!, fileBase64: base64, fileName: _file.name });
            toast.success("Certificado anexado com sucesso!");
          } catch { toast.error("Treinamento salvo, mas erro ao anexar certificado"); }
        };
        reader.readAsDataURL(_file);
      }
    } catch (err: any) {
      console.error("Erro ao salvar treinamento:", err);
      toast.error(err?.message || "Erro ao salvar treinamento");
      return;
    }
    setShowTreinDialog(false); setTreinForm({}); setEditingTreinId(null);
  };

  const handleSubmitAtest = async () => {
    if (!atestForm.employeeId || !atestForm.tipo || !atestForm.dataEmissao) { toast.error("Preencha os campos obrigatórios"); return; }
    const { _file, ...formData } = atestForm;
    try {
      let atestId = editingAtestId;
      if (editingAtestId) {
        await updateAtest.mutateAsync({ id: editingAtestId, ...formData, diasAfastamento: formData.diasAfastamento || 0, horasAfastamento: formData.horasAfastamento || 0, afastamentoTipo: formData.afastamentoTipo || "dia" });
      } else {
        const result = await createAtest.mutateAsync({ companyId, companyIds, ...formData, diasAfastamento: formData.diasAfastamento || 0, horasAfastamento: formData.horasAfastamento || 0, afastamentoTipo: formData.afastamentoTipo || "dia" });
        atestId = (result as any)?.id || null;
      }
      if (_file && atestId) {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1];
          try {
            await uploadAtestDoc.mutateAsync({ id: atestId!, fileBase64: base64, fileName: _file.name });
            toast.success("Documento anexado com sucesso!");
          } catch { toast.error("Atestado salvo, mas erro ao anexar documento"); }
        };
        reader.readAsDataURL(_file);
      }
    } catch { toast.error("Erro ao salvar atestado"); }
    setShowAtestDialog(false); setAtestForm({}); setEditingAtestId(null);
  };

  const handleSubmitAdv = async () => {
    if (!advForm.employeeId || !advForm.tipoAdvertencia || !advForm.dataOcorrencia || !advForm.motivo) { toast.error("Preencha os campos obrigatórios"); return; }
    // Montar testemunhas como string JSON estruturada para o backend
    const testemunhasArr = [1, 2, 3].map(n => ({
      nome: advForm[`testemunha${n}Nome`] || "",
      doc: advForm[`testemunha${n}Doc`] || "",
    })).filter(t => t.nome.trim());
    const testemunhasStr = JSON.stringify(testemunhasArr);
    const payload = { ...advForm, testemunhas: testemunhasStr };
    // Remover campos temporarios de testemunha individual
    delete payload.testemunha1Nome; delete payload.testemunha1Doc;
    delete payload.testemunha2Nome; delete payload.testemunha2Doc;
    delete payload.testemunha3Nome; delete payload.testemunha3Doc;
    let novaAdvId: number | null = null;
    try {
      if (editingAdvId) {
        await updateAdv.mutateAsync({ id: editingAdvId, ...payload });
      } else {
        const res: any = await createAdv.mutateAsync({ companyId, companyIds, ...payload, aplicadoPor: authUser?.name || authUser?.username || undefined });
        novaAdvId = res?.id || null;
        if (novaAdvId) setLastCreatedAdvId(novaAdvId);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar advertência.");
      return;
    }
    if (!editingAdvId && advForm.tipoAdvertencia !== "Verbal") {
      const emp = (allEmployees as any[]).find((e: any) => e.id === advForm.employeeId);
      const empAdvs = (advList as any[]).filter((x: any) => x.employeeId === advForm.employeeId);
      setPreviewAdvData({
        id: novaAdvId,
        nomeCompleto: emp?.nomeCompleto || "",
        cpf: emp?.cpf || "",
        funcao: emp?.funcao || "",
        setor: emp?.setor || "OBRA",
        tipoAdvertencia: advForm.tipoAdvertencia,
        dataOcorrencia: advForm.dataOcorrencia,
        motivo: advForm.motivo,
        descricao: advForm.descricao,
        testemunhasArr,
        diasSuspensao: advForm.diasSuspensao,
        sequencia: empAdvs.length + 1,
        anteriores: empAdvs.sort((a: any, b: any) => (a.dataOcorrencia || "").localeCompare(b.dataOcorrencia || "")),
        employeeId: advForm.employeeId,
      });
      setTimeout(() => setShowAdvPreview(true), 50);
    }
    setShowAdvDialog(false); setAdvForm({}); setEditingAdvId(null); setAdvEmployeeCount(null);
  };

  // Buscar contagem de advertências quando seleciona funcionário no dialog
  const { data: advCountData } = trpc.docs.contagemAdvertencias.useQuery(
    { employeeId: advForm.employeeId! },
    { enabled: !!advForm.employeeId && showAdvDialog && !editingAdvId }
  );

  const handleDeleteAtestBatch = () => {
    if (selectedAtestIds.length === 0) { toast.error("Selecione ao menos um atestado"); return; }
    if (confirm(`Excluir ${selectedAtestIds.length} atestado(s) selecionado(s)?`)) {
      deleteAtestBatch.mutate({ ids: selectedAtestIds });
    }
  };

  const toggleAtestSelection = (id: number) => {
    setSelectedAtestIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAllAtest = () => {
    if (selectedAtestIds.length === filteredAtest.length) setSelectedAtestIds([]);
    else setSelectedAtestIds(filteredAtest.map((a: any) => a.id));
  };

  // ============ IMPORT ASO ============
  const [importFile, setImportFile] = useState<File | null>(null);
  const handleImportAso = async () => {
    if (!importFile) { toast.error("Selecione um arquivo"); return; }
    const text = await importFile.text();
    const lines = text.split("\n").filter(l => l.trim());
    const records: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("\t");
      if (cols.length < 4) continue;
      const name = cols[1]?.trim();
      const tipo = cols[2]?.trim();
      const dataStr = cols[3]?.trim();
      if (!name || !tipo || !dataStr) continue;
      const parts = dataStr.split("/");
      let dataExame = dataStr;
      if (parts.length === 3) dataExame = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      const validadeDias = parseInt(cols[4]) || 365;
      const resultado = cols[7]?.trim() || "Apto";
      const medico = cols[8]?.trim() || "";
      const crm = cols[9]?.trim() || "";
      const jaAtualizou = cols[10]?.trim()?.toUpperCase() === "SIM";
      const examesRealizados = cols[11]?.trim() || "";
      records.push({ employeeName: name, tipo, dataExame, validadeDias, resultado, medico, crm, jaAtualizou, examesRealizados });
    }
    if (records.length === 0) { toast.error("Nenhum registro encontrado no arquivo"); return; }
    importAso.mutate({ companyId, records });
    setShowImportAso(false); setImportFile(null);
  };

  const EmployeeSelect = ({ value, onChange }: { value: number | undefined; onChange: (id: number) => void }) => {
    const [empSearch, setEmpSearch] = useState("");
    const [empFocused, setEmpFocused] = useState(false);
    const [incluirInativos, setIncluirInativos] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const baseList = incluirInativos ? (allEmployees as any[]) : activeEmployees;
    const selectedEmp = (allEmployees as any[]).find((e: any) => e.id === value);
    
    const filteredEmps = useMemo(() => {
      return baseList.filter((e: any) => {
        if (!empSearch) return true;
        const s = empSearch.toLowerCase().trim();
        if (!s) return true;
        const nome = (e.nomeCompleto || "").toLowerCase();
        const cpf = (e.cpf || "").replace(/\D/g, "");
        const codigo = (e.codigoInterno || "").toLowerCase();
        const searchClean = s.replace(/\D/g, "");
        return nome.includes(s) || (searchClean && cpf.includes(searchClean)) || codigo.includes(s);
      }).slice(0, 50);
    }, [baseList, empSearch]);

    // Close dropdown when clicking outside
    useEffect(() => {
      if (!empFocused) return;
      const handler = (e: MouseEvent | TouchEvent) => {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
          setEmpFocused(false);
          setEmpSearch("");
        }
      };
      document.addEventListener("mousedown", handler);
      document.addEventListener("touchstart", handler);
      return () => {
        document.removeEventListener("mousedown", handler);
        document.removeEventListener("touchstart", handler);
      };
    }, [empFocused]);

    return (
      <div ref={wrapperRef} className="relative">
        {/* Always show the input field - no toggling */}
        <div className={`flex items-center border ${empFocused ? 'border-2 border-blue-500' : 'border-gray-300'} rounded-md px-3 py-2 bg-background`}>
          <Search className={`h-4 w-4 ${empFocused ? 'text-blue-500' : 'text-muted-foreground'} mr-2 shrink-0`} />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            className="flex-1 bg-transparent outline-none text-sm text-foreground min-w-0 appearance-none"
            style={{ fontSize: '16px', WebkitAppearance: 'none' }}
            placeholder={selectedEmp ? `${selectedEmp.nomeCompleto} - ${formatCPF(selectedEmp.cpf)}` : "Digite nome, CPF ou código (JFC)..."}
            value={empSearch}
            onChange={e => {
              setEmpSearch(e.target.value);
              if (!empFocused) setEmpFocused(true);
            }}
            onFocus={() => setEmpFocused(true)}
            onKeyDown={e => { if (e.key === 'Escape') { setEmpFocused(false); setEmpSearch(''); inputRef.current?.blur(); } }}
          />
          {(value || empSearch) && (
            <button type="button" className="ml-2 text-muted-foreground hover:text-foreground p-1" onClick={e => { e.preventDefault(); e.stopPropagation(); onChange(undefined as any); setEmpSearch(""); setEmpFocused(false); }}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        
        {/* Selected employee badge */}
        {selectedEmp && !empFocused && !empSearch && (
          <div className={`mt-1 text-xs px-2 py-1 rounded inline-flex items-center gap-1 ${
            selectedEmp.status === "Desligado" ? "text-red-700 bg-red-50" :
            selectedEmp.status === "Afastado" ? "text-amber-700 bg-amber-50" :
            selectedEmp.status !== "Ativo" ? "text-gray-700 bg-gray-50" :
            "text-blue-600 bg-blue-50"
          }`}>
            <CheckCircle2 className="h-3 w-3" />
            {selectedEmp.nomeCompleto} - {formatCPF(selectedEmp.cpf)}
            {selectedEmp.status && selectedEmp.status !== "Ativo" && (
              <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                selectedEmp.status === "Desligado" ? "bg-red-100 text-red-700" :
                selectedEmp.status === "Afastado" ? "bg-amber-100 text-amber-700" :
                "bg-gray-100 text-gray-600"
              }`}>
                {selectedEmp.status === "Desligado" ? "Desligado" :
                 selectedEmp.status === "Lista_Negra" ? "Lista Negra" :
                 selectedEmp.status === "Ferias" ? "Férias" :
                 selectedEmp.status}
              </span>
            )}
          </div>
        )}

        {empFocused && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border rounded-lg shadow-xl max-h-72 overflow-y-auto" style={{ zIndex: 9999 }}>
            <div className="px-3 py-1.5 border-b bg-gray-50 dark:bg-gray-800 sticky top-0 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {empSearch ? `${filteredEmps.length} resultado(s)` : `${filteredEmps.length} colaborador(es)${!incluirInativos ? " ativo(s)" : ""}`}
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer select-none" onMouseDown={e => e.preventDefault()}>
                <input
                  type="checkbox"
                  checked={incluirInativos}
                  onChange={() => setIncluirInativos(!incluirInativos)}
                  className="h-3 w-3 rounded border-gray-300 accent-blue-600"
                />
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">Incluir desligados/inativos</span>
              </label>
            </div>
            {filteredEmps.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">
                {baseList.length === 0 
                  ? "Nenhum colaborador cadastrado nesta empresa" 
                  : empSearch 
                    ? `Nenhum resultado para "${empSearch}"`
                    : "Nenhum colaborador encontrado"}
              </div>
            ) : (
              <>
                {filteredEmps.map((e: any) => (
                  <div
                    key={e.id}
                    className={`px-3 py-2.5 text-sm cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 active:bg-blue-100 flex items-center justify-between ${value === e.id ? "bg-blue-100 dark:bg-blue-900/50 font-medium" : ""}`}
                    onMouseDown={e2 => { e2.preventDefault(); }}
                    onClick={() => { onChange(e.id); setEmpFocused(false); setEmpSearch(""); inputRef.current?.blur(); }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-gray-900 dark:text-gray-100 truncate">{e.nomeCompleto}</span>
                      {e.status && e.status !== "Ativo" && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                          e.status === "Desligado" ? "bg-red-100 text-red-700" :
                          e.status === "Afastado" ? "bg-amber-100 text-amber-700" :
                          e.status === "Ferias" ? "bg-blue-100 text-blue-700" :
                          e.status === "Lista_Negra" ? "bg-gray-800 text-white" :
                          "bg-gray-100 text-gray-600"
                        }`}>
                          {e.status === "Desligado" ? "Desligado" :
                           e.status === "Lista_Negra" ? "Lista Negra" :
                           e.status === "Ferias" ? "Férias" :
                           e.status}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground ml-2 shrink-0">
                      {e.codigoInterno && <span className="text-blue-600 font-medium mr-2">{e.codigoInterno}</span>}
                      {formatCPF(e.cpf)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Controle de Documentos</h1>
            <p className="text-muted-foreground text-sm">Gestão de ASOs, Treinamentos, Atestados e Advertências</p>
          </div>
          <PrintActions title="Controle de Documentos" />
        </div>

        {/* CARDS RESUMO */}
        {/* ALERTA DE DOCUMENTOS VENCIDOS */}
        {((resumo?.asosVencidos || 0) > 0 || (resumo?.treinVencidos || 0) > 0) && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-red-100 transition-colors" onClick={() => setActiveTab("validade")}>
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                Atenção: {((resumo?.asosVencidos || 0) + (resumo?.treinVencidos || 0))} documento(s) vencido(s)
                {(resumo?.asosVencidos || 0) > 0 && <span className="ml-1">({resumo?.asosVencidos} ASO{(resumo?.asosVencidos || 0) > 1 ? "s" : ""})</span>}
                {(resumo?.treinVencidos || 0) > 0 && <span className="ml-1">({resumo?.treinVencidos} Treinamento{(resumo?.treinVencidos || 0) > 1 ? "s" : ""})</span>}
              </p>
              <p className="text-xs text-red-600">Clique para ver o Painel de Validade</p>
            </div>
            <ExternalLink className="h-4 w-4 text-red-400" />
          </div>
        )}

        {/* ALERTA DE DOCUMENTOS A VENCER */}
        {((resumo?.asosAVencer || 0) > 0 || (resumo?.treinAVencer || 0) > 0) && !((resumo?.asosVencidos || 0) > 0 || (resumo?.treinVencidos || 0) > 0) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-yellow-100 transition-colors" onClick={() => setActiveTab("validade")}>
            <Clock className="h-5 w-5 text-yellow-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800">
                {((resumo?.asosAVencer || 0) + (resumo?.treinAVencer || 0))} documento(s) vencem nos próximos 30 dias
              </p>
              <p className="text-xs text-yellow-600">Clique para ver o Painel de Validade</p>
            </div>
            <ExternalLink className="h-4 w-4 text-yellow-400" />
          </div>
        )}

        {/* KPI Cards - Layout melhorado */}
        <div className="grid gap-3 grid-cols-3 sm:grid-cols-3 lg:grid-cols-9">
          {[
            { key: "asos", label: "ASOs", value: resumo?.totalASOs || 0, icon: Stethoscope, color: "blue" },
            { key: "vencido", label: "ASOs Vencidos", value: resumo?.asosVencidos || 0, icon: AlertTriangle, color: "red" },
            { key: "vencer", label: "ASOs A Vencer", value: resumo?.asosAVencer || 0, icon: Calendar, color: "yellow" },
            { key: "semASO", label: "Sem ASO", value: (resumo as any)?.semASO || 0, icon: ShieldAlert, color: "rose" },
            { key: "treinamentos", label: "Treinamentos", value: resumo?.totalTreinamentos || 0, icon: GraduationCap, color: "green" },
            { key: "treinVencido", label: "Trein. Vencidos", value: (resumo as any)?.treinVencidos || 0, icon: AlertTriangle, color: "red" },
            { key: "treinVencer", label: "Trein. A Vencer", value: (resumo as any)?.treinAVencer || 0, icon: Clock, color: "yellow" },
            { key: "atestados", label: "Atestados", value: resumo?.totalAtestados || 0, icon: ClipboardList, color: "purple" },
            { key: "advertencias", label: "Advertências", value: resumo?.totalAdvertencias || 0, icon: ShieldAlert, color: "orange" },
          ].map(c => (
            <Card key={c.key} className={`cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] ${cardFilter === c.key ? `ring-2 ring-${c.color}-500 shadow-lg` : ""} ${c.key === "semASO" && c.value > 0 ? "border-rose-300 bg-rose-50/40" : ""}`} onClick={() => handleCardClick(c.key)}>
              <CardContent className="p-3">
                <div className="flex flex-col items-center text-center gap-1">
                  <div className={`h-9 w-9 rounded-lg bg-${c.color}-100 flex items-center justify-center shrink-0`}>
                    <c.icon className={`h-4 w-4 text-${c.color}-600`} />
                  </div>
                  <p className={`text-xl font-bold leading-none ${c.color === "red" || c.color === "yellow" || c.color === "rose" ? `text-${c.color}-600` : ""}`}>{fmtNum(c.value)}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{c.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filtro ativo */}
        {cardFilter && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Filtro ativo:</span>
            <Badge variant="secondary" className="gap-1">
              {cardFilter === "asos" ? "Todos os ASOs" : cardFilter === "vencido" ? "ASOs Vencidos" : cardFilter === "vencer" ? "ASOs A Vencer" : cardFilter === "semASO" ? "Sem ASO" : cardFilter === "treinamentos" ? "Treinamentos" : cardFilter === "treinVencido" ? "Trein. Vencidos" : cardFilter === "treinVencer" ? "Trein. A Vencer" : cardFilter === "atestados" ? "Atestados" : "Advertências"}
              <button onClick={() => { setCardFilter(null); setStatusFilter("todos"); setValidadeForceTipo(undefined); setValidadeForceStatus(undefined); }} className="ml-1 hover:text-foreground">✕</button>
            </Badge>
          </div>
        )}

        {/* SEARCH + FILTER */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          {activeTab === "aso" && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="valido">Válidos</SelectItem>
                <SelectItem value="vencer">A Vencer</SelectItem>
                <SelectItem value="vencido">Vencidos</SelectItem>
                <SelectItem value="substituido">Substituídos</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* TABS */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Rev. 2148 — grid responsivo definitivo: 2 (mobile) → 3 (sm) → 5
              (md/lg = inclui iPad Pro 12.9" portrait 1024px) → 9 só em xl
              (≥1280px). Em qualquer iPad as 9 tabs ficam em 5×2 sem
              sobreposição; desktop wide volta pra linha única. */}
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10 h-auto xl:h-12 gap-1 bg-transparent p-0">
            <TabsTrigger value="validade" className={`gap-1.5 rounded-lg border-2 transition-all duration-200 font-medium ${activeTab === "validade" ? "border-red-500 bg-red-50 text-red-700 shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-red-50/50 hover:text-red-600"}`}>
              <AlertTriangle className="h-4 w-4" /> Validade
            </TabsTrigger>
            <TabsTrigger value="documentos" className={`gap-1.5 rounded-lg border-2 transition-all duration-200 font-medium ${activeTab === "documentos" ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-indigo-50/50 hover:text-indigo-600"}`}>
              <FileText className="h-4 w-4" /> Documentos
            </TabsTrigger>
            <TabsTrigger value="aso" className={`gap-1.5 rounded-lg border-2 transition-all duration-200 font-medium ${activeTab === "aso" ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-blue-50/50 hover:text-blue-600"}`}>
              <Stethoscope className="h-4 w-4" /> ASO
            </TabsTrigger>
            <TabsTrigger value="mapeamento" className={`gap-1.5 rounded-lg border-2 transition-all duration-200 font-medium ${activeTab === "mapeamento" ? "border-teal-500 bg-teal-50 text-teal-700 shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-teal-50/50 hover:text-teal-600"}`}>
              <CheckCircle2 className="h-4 w-4" /> Mapeamento
            </TabsTrigger>
            <TabsTrigger value="treinamentos" className={`gap-1.5 rounded-lg border-2 transition-all duration-200 font-medium ${activeTab === "treinamentos" ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-emerald-50/50 hover:text-emerald-600"}`}>
              <GraduationCap className="h-4 w-4" /> Treinamentos
            </TabsTrigger>
            <TabsTrigger value="atestados" className={`gap-1.5 rounded-lg border-2 transition-all duration-200 font-medium ${activeTab === "atestados" ? "border-purple-500 bg-purple-50 text-purple-700 shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-purple-50/50 hover:text-purple-600"}`}>
              <ClipboardList className="h-4 w-4" /> Atestados
            </TabsTrigger>
            <TabsTrigger value="advertencias" className={`gap-1.5 rounded-lg border-2 transition-all duration-200 font-medium ${activeTab === "advertencias" ? "border-orange-500 bg-orange-50 text-orange-700 shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-orange-50/50 hover:text-orange-600"}`}>
              <ShieldAlert className="h-4 w-4" /> Advertências
            </TabsTrigger>
            <TabsTrigger value="semASO" className={`gap-1.5 rounded-lg border-2 transition-all duration-200 font-medium ${activeTab === "semASO" ? "border-rose-500 bg-rose-50 text-rose-700 shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-rose-50/50 hover:text-rose-600"}`}>
              <ShieldAlert className="h-4 w-4" /> Sem ASO {(resumo as any)?.semASO > 0 && <Badge className="bg-rose-500 text-white text-[10px] px-1.5 py-0 ml-1">{(resumo as any)?.semASO}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="integracoes" className={`gap-1.5 rounded-lg border-2 transition-all duration-200 font-medium ${activeTab === "integracoes" ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-indigo-50/50 hover:text-indigo-600"}`}>
              <Users className="h-4 w-4" /> Integrações
            </TabsTrigger>
            <TabsTrigger value="termos-responsabilidade" className={`gap-1.5 rounded-lg border-2 transition-all duration-200 font-medium ${activeTab === "termos-responsabilidade" ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm" : "border-transparent bg-muted/50 text-muted-foreground hover:bg-blue-50/50 hover:text-blue-600"}`}>
              <FileText className="h-4 w-4" /> Termo de Recebimento
            </TabsTrigger>
          </TabsList>

          {/* ===================== ABA SEM ASO ===================== */}
          <TabsContent value="semASO">
            <SemASOPanel companyId={companyId} companyIds={companyIds} onClickEmployee={setRaioXEmployeeId} onCreateAso={(empId: number) => { setEditingAsoId(null); setAsoForm({ employeeId: empId }); setShowAsoDialog(true); }} />
          </TabsContent>

          {/* ===================== ABA MAPEAMENTO / COBERTURA ===================== */}
          <TabsContent value="mapeamento">
            <MapeamentoPanel companyId={companyId} companyIds={companyIds} onClickEmployee={setRaioXEmployeeId} empresaNome={nomeEmpresaCompleto} />
          </TabsContent>

          {/* ===================== ABA PAINEL DE VALIDADE ===================== */}
          <TabsContent value="validade">
            <ValidadePanel companyId={companyId} companyIds={companyIds} onClickEmployee={setRaioXEmployeeId} forceTipo={validadeForceTipo} forceStatus={validadeForceStatus} />
          </TabsContent>

          {/* ===================== ABA DOCUMENTOS DO FUNCIONÁRIO ===================== */}
          <TabsContent value="documentos">
            <DocumentosPanel companyId={companyId} companyIds={companyIds} employees={allEmployees as any[]} onClickEmployee={setRaioXEmployeeId} EmployeeSelect={EmployeeSelect} />
          </TabsContent>

          {/* ===================== ABA ASO ===================== */}
          <TabsContent value="aso">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Atestados de Saúde Ocupacional</CardTitle>
                <div className="flex gap-2">

                  <Button size="sm" onClick={openNewAso}><Plus className="h-4 w-4 mr-1" /> Novo ASO</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Nº</th>
                        <th className="pb-2 font-medium">Colaborador</th>
                        <th className="pb-2 font-medium">Tipo</th>
                        <th className="pb-2 font-medium">Data Exame</th>
                        <th className="pb-2 font-medium">Validade</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Vencimento</th>
                        <th className="pb-2 font-medium">Resultado</th>
                        <th className="pb-2 font-medium">Médico</th>
                        <th className="pb-2 font-medium">Exames</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedAso.length === 0 ? (
                        <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">Nenhum ASO cadastrado</td></tr>
                      ) : groupedAso.map((g, gi) => {
                        const principais = g.atuais.length > 0 ? g.atuais : g.historicos;
                        const ocultos = g.atuais.length > 0 ? g.historicos : [];
                        const expanded = expandedAsoEmps.has(g.employeeId);
                        const renderAsoRow = (a: any, opts: { isHist?: boolean; toggle?: boolean; num?: number } = {}) => (
                          <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/30 ${opts.isHist ? "opacity-60 bg-muted/20" : ""}`}>
                            <td className="py-2 text-muted-foreground">{opts.num ?? ""}</td>
                            <td className="py-2">
                              <div className="flex items-center gap-2.5">
                                {opts.isHist ? (
                                  <span className="w-8 shrink-0" />
                                ) : (
                                  <PersonPhoto src={a.fotoUrl} alt={a.nomeCompleto} size="sm" />
                                )}
                                <div className="min-w-0">
                                  {opts.isHist ? (
                                    <div className="text-xs text-muted-foreground italic flex items-center gap-1"><Clock className="h-3 w-3" /> Histórico</div>
                                  ) : (
                                    <>
                                      <div className="inline-flex items-center gap-1.5 flex-wrap"><span className="font-medium text-blue-700 cursor-pointer hover:underline truncate" onClick={() => setRaioXEmployeeId(a.employeeId)}>{a.nomeCompleto}</span><CipaBadge ativo={a.cipaAtivo} estabilidade={a.cipaEstabilidade} fim={a.cipaFimEstabilidade} cargo={a.cipaCargo} /></div>
                                      <div className="text-xs text-muted-foreground">{formatCPF(a.cpf)}</div>
                                      {opts.toggle && ocultos.length > 0 && (
                                        <button type="button" onClick={() => toggleAsoEmp(g.employeeId)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-blue-700">
                                          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                          {expanded ? "Ocultar histórico" : `Ver histórico (${ocultos.length})`}
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2">{formatTipoASO(a.tipo)}</td>
                            <td className="py-2">{formatDate(a.dataExame)}</td>
                            <td className="py-2">{a.validadeDias || 365} dias</td>
                            <td className="py-2"><StatusBadge status={a.status} diasRestantes={a.diasRestantes} /></td>
                            <td className="py-2">{formatDate(a.dataValidade)}</td>
                            <td className="py-2">
                              <span className={a.resultado === "Apto" ? "text-green-600 font-medium" : a.resultado === "Inapto" ? "text-red-600 font-medium" : "text-yellow-600 font-medium"}>
                                {a.resultado === "Apto_Restricao" ? "Apto c/ Restrição" : a.resultado}
                              </span>
                            </td>
                            <td className="py-2">
                              {a.medico && <div className="text-xs">{a.medico}</div>}
                              {a.crm && <div className="text-xs text-muted-foreground">CRM: {a.crm}</div>}
                            </td>
                            <td className="py-2 max-w-[200px]">
                              <div className="text-xs text-muted-foreground truncate" title={a.examesRealizados}>{a.examesRealizados || "-"}</div>
                            </td>
                            <td className="py-2">
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEditAso(a)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar PDF" onClick={() => handleUploadDoc("aso", a.id, a)}>
                                  <FileUp className="h-3.5 w-3.5" />
                                </Button>
                                {a.documentoUrl && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver documento" onClick={() => window.open(a.documentoUrl, "_blank")}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir este ASO?")) deleteAso.mutate({ id: a.id }); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                        return (
                          <Fragment key={g.employeeId}>
                            {principais.map((a: any, i: number) => renderAsoRow(a, { num: i === 0 ? gi + 1 : undefined, toggle: i === principais.length - 1 }))}
                            {expanded && ocultos.map((a: any) => renderAsoRow(a, { isHist: true }))}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===================== ABA TREINAMENTOS ===================== */}
          <TabsContent value="treinamentos">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Treinamentos e Capacitações</CardTitle>
                <Button size="sm" onClick={openNewTrein}><Plus className="h-4 w-4 mr-1" /> Novo Treinamento</Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Colaborador</th>
                        <th className="pb-2 font-medium">Treinamento</th>
                        <th className="pb-2 font-medium">Norma</th>
                        <th className="pb-2 font-medium">Carga Horária</th>
                        <th className="pb-2 font-medium">Realização</th>
                        <th className="pb-2 font-medium">Validade</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Instrutor/Entidade</th>
                        <th className="pb-2 font-medium">Certificado</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrein.length === 0 ? (
                        <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">Nenhum treinamento cadastrado</td></tr>
                      ) : filteredTrein.map((t: any) => (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2">
                            <div className="flex items-center gap-2.5">
                              <PersonPhoto src={t.fotoUrl} alt={t.nomeCompleto} size="sm" />
                              <div className="min-w-0">
                                <div className="inline-flex items-center gap-1.5 flex-wrap"><span className="font-medium text-blue-700 cursor-pointer hover:underline truncate" onClick={() => setRaioXEmployeeId(t.employeeId)}>{t.nomeCompleto}</span><CipaBadge ativo={t.cipaAtivo} estabilidade={t.cipaEstabilidade} fim={t.cipaFimEstabilidade} cargo={t.cipaCargo} /></div>
                                <div className="text-xs text-muted-foreground">{t.funcao || "-"}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 font-medium">{t.nome}</td>
                          <td className="py-2">{t.norma || "-"}</td>
                          <td className="py-2">{t.cargaHoraria || "-"}</td>
                          <td className="py-2">{formatDate(t.dataRealizacao)}</td>
                          <td className="py-2">{formatDate(t.dataValidade)}</td>
                          <td className="py-2">
                            {t.dataValidade ? <StatusBadge status={t.statusCalculado} diasRestantes={t.diasRestantes} /> : <span className="text-xs text-muted-foreground">Sem validade</span>}
                          </td>
                          <td className="py-2">
                            {t.instrutor && <div className="text-xs">{t.instrutor}</div>}
                            {t.entidade && <div className="text-xs text-muted-foreground">{t.entidade}</div>}
                          </td>
                          <td className="py-2">
                            {t.certificadoUrl ? (
                              <a href={t.certificadoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                                <FileText className="h-3.5 w-3.5" /> Ver
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEditTrein(t)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar certificado" onClick={() => handleUploadDoc("trein", t.id)}>
                                <FileUp className="h-3.5 w-3.5" />
                              </Button>
                              {t.certificadoUrl && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver certificado" onClick={() => window.open(t.certificadoUrl, "_blank")}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir este treinamento?")) deleteTrein.mutate({ id: t.id }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===================== ABA ATESTADOS ===================== */}
          <TabsContent value="atestados">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Atestados Médicos</CardTitle>
                  <div className="flex gap-2">
                    {selectedAtestIds.length > 0 && (
                      <Button size="sm" variant="destructive" onClick={handleDeleteAtestBatch} disabled={deleteAtestBatch.isPending}>
                        <Trash2 className="h-4 w-4 mr-1" /> Excluir {selectedAtestIds.length} selecionado(s)
                      </Button>
                    )}
                    <Button size="sm" onClick={openNewAtest}><Plus className="h-4 w-4 mr-1" /> Novo Atestado</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 w-8">
                          <button onClick={toggleAllAtest} className="p-1 hover:bg-muted rounded" title="Selecionar todos">
                            {selectedAtestIds.length === filteredAtest.length && filteredAtest.length > 0 ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                          </button>
                        </th>
                        <th className="pb-2 font-medium">Colaborador</th>
                        <th className="pb-2 font-medium">CPF</th>
                        <th className="pb-2 font-medium">Tipo</th>
                        <th className="pb-2 font-medium">Data Emissão</th>
                        <th className="pb-2 font-medium">Afastamento</th>
                        <th className="pb-2 font-medium">Data Retorno</th>
                        <th className="pb-2 font-medium">CID</th>
                        <th className="pb-2 font-medium">Médico</th>
                        <th className="pb-2 font-medium">Motivo</th>
                        <th className="pb-2 font-medium">Arquivo</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAtest.length === 0 ? (
                        <tr><td colSpan={12} className="py-8 text-center text-muted-foreground">Nenhum atestado cadastrado</td></tr>
                      ) : filteredAtest.map((a: any) => (
                        <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/30 ${selectedAtestIds.includes(a.id) ? "bg-blue-50" : ""}`}>
                          <td className="py-2">
                            <button onClick={() => toggleAtestSelection(a.id)} className="p-1 hover:bg-muted rounded">
                              {selectedAtestIds.includes(a.id) ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                            </button>
                          </td>
                          <td className="py-2">
                            <div className="flex items-center gap-2.5">
                              <PersonPhoto src={a.fotoUrl} alt={a.nomeCompleto} size="sm" />
                              <div className="inline-flex items-center gap-1.5 flex-wrap"><span className="font-medium text-blue-700 cursor-pointer hover:underline truncate" onClick={() => setRaioXEmployeeId(a.employeeId)}>{a.nomeCompleto}</span><CipaBadge ativo={a.cipaAtivo} estabilidade={a.cipaEstabilidade} fim={a.cipaFimEstabilidade} cargo={a.cipaCargo} /></div>
                            </div>
                          </td>
                          <td className="py-2">{formatCPF(a.cpf)}</td>
                          <td className="py-2">{a.tipo}</td>
                          <td className="py-2">{formatDate(a.dataEmissao)}</td>
                          <td className="py-2 text-center">
                            {a.afastamentoTipo === "horas"
                              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">{(() => { const h = Number(a.horasAfastamento || 0); const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); return mm > 0 ? `${hh}h${String(mm).padStart(2,"0")}` : `${hh}h`; })()}</span>
                              : <span>{a.diasAfastamento || 0} dia{(a.diasAfastamento || 0) !== 1 ? "s" : ""}</span>
                            }
                          </td>
                          <td className="py-2">{formatDate(a.dataRetorno)}</td>
                          <td className="py-2">{a.cid || "-"}</td>
                          <td className="py-2">
                            {a.medico && <div className="text-xs">{a.medico}</div>}
                            {a.crm && <div className="text-xs text-muted-foreground">CRM: {a.crm}</div>}
                          </td>
                          <td className="py-2">
                            <span className="text-xs">{a.motivo === "Outros" ? a.motivoOutro || "Outros" : a.motivo || "-"}</span>
                          </td>
                          <td className="py-2">
                            {a.documentoUrl ? (
                              canPreviewFile(a.documentoUrl) ? (
                                <button onClick={() => setAtestPreviewDoc({ url: a.documentoUrl, name: a.documentoUrl.split("/").pop() || "arquivo", title: `Atestado - ${a.nomeCompleto}` })} className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                                  <FileText className="h-3.5 w-3.5" /> Ver
                                </button>
                              ) : (
                                <a href={a.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                                  <FileText className="h-3.5 w-3.5" /> Ver
                                </a>
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEditAtest(a)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar Atestado" onClick={() => handleUploadDoc("atest", a.id)}>
                                <FileUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir este atestado?")) deleteAtest.mutate({ id: a.id }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===================== ABA ADVERTÊNCIAS ===================== */}
          <TabsContent value="advertencias">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Advertências e Suspensões</CardTitle>
                  <Button size="sm" onClick={openNewAdv}><Plus className="h-4 w-4 mr-1" /> Nova Advertência</Button>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3 text-sm text-amber-800">
                  <p className="font-semibold flex items-center gap-1"><ShieldAlert className="h-4 w-4" /> Fluxo Progressivo (CLT Art. 482)</p>
                  <p className="text-xs mt-1">1ª Advertência Verbal → 2ª Advertência Escrita → 3ª Advertência Escrita → Suspensão (1-30 dias) → Justa Causa</p>
                  <p className="text-xs mt-0.5 text-amber-600">O sistema sugere automaticamente o próximo passo com base no histórico do colaborador.</p>
                  <div className="flex items-center gap-4 mt-2 pt-2 border-t border-amber-200">
                    <span className="text-xs font-medium text-amber-900">Legenda Sequência:</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-5 h-5 rounded text-center text-[10px] font-bold leading-5 bg-green-100 text-green-700 border border-green-300">1ª</span><span className="text-xs">1ª Medida</span></span>
                    <span className="flex items-center gap-1"><span className="inline-block w-5 h-5 rounded text-center text-[10px] font-bold leading-5 bg-yellow-100 text-yellow-700 border border-yellow-300">2ª</span><span className="text-xs">2ª Medida</span></span>
                    <span className="flex items-center gap-1"><span className="inline-block w-5 h-5 rounded text-center text-[10px] font-bold leading-5 bg-orange-100 text-orange-700 border border-orange-300">3ª</span><span className="text-xs">3ª Medida</span></span>
                    <span className="flex items-center gap-1"><span className="inline-block w-5 h-5 rounded text-center text-[10px] font-bold leading-5 bg-red-100 text-red-700 border border-red-300">4ª+</span><span className="text-xs">4ª+ (Crítico)</span></span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Colaborador</th>
                        <th className="pb-2 font-medium">CPF</th>
                        <th className="pb-2 font-medium">Tipo</th>
                        <th className="pb-2 font-medium">Seq.</th>
                        <th className="pb-2 font-medium">Data</th>
                        <th className="pb-2 font-medium">Motivo</th>
                        <th className="pb-2 font-medium">Descrição</th>
                        <th className="pb-2 font-medium">Testemunhas</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAdv.length === 0 ? (
                        <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Nenhuma advertência cadastrada</td></tr>
                      ) : filteredAdv.map((a: any) => {
                        const empAdvCount = (advList as any[]).filter((x: any) => x.employeeId === a.employeeId).length;
                        const nextStep = empAdvCount >= 3 ? "Suspensão" : empAdvCount >= 4 ? "Justa Causa" : null;
                        return (
                        <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/30 ${a.tipoAdvertencia === "Suspensao" ? "bg-red-50/50" : a.tipoAdvertencia === "JustaCausa" ? "bg-red-100/50" : ""}`}>
                          <td className="py-2">
                            <div className="flex items-center gap-2.5">
                              <PersonPhoto src={a.fotoUrl} alt={a.nomeCompleto} size="sm" />
                              <div className="inline-flex items-center gap-1.5 flex-wrap"><span className="font-medium text-blue-700 cursor-pointer hover:underline truncate" onClick={() => setRaioXEmployeeId(a.employeeId)}>{a.nomeCompleto}</span><CipaBadge ativo={a.cipaAtivo} estabilidade={a.cipaEstabilidade} fim={a.cipaFimEstabilidade} cargo={a.cipaCargo} /></div>
                            </div>
                          </td>
                          <td className="py-2">{formatCPF(a.cpf)}</td>
                          <td className="py-2">
                            <Badge variant={a.tipoAdvertencia === "Suspensao" || a.tipoAdvertencia === "JustaCausa" ? "destructive" : a.tipoAdvertencia === "Escrita" ? "secondary" : "outline"}
                              className={a.tipoAdvertencia === "JustaCausa" ? "bg-red-800" : ""}>
                              {formatTipoAdv(a.tipoAdvertencia)}
                            </Badge>
                          </td>
                          <td className="py-2">
                            <span className={`text-xs px-2 py-0.5 rounded font-bold border ${
                              (a.sequencia || empAdvCount) >= 4 ? "bg-red-100 text-red-700 border-red-300" :
                              (a.sequencia || empAdvCount) === 3 ? "bg-orange-100 text-orange-700 border-orange-300" :
                              (a.sequencia || empAdvCount) === 2 ? "bg-yellow-100 text-yellow-700 border-yellow-300" :
                              "bg-green-100 text-green-700 border-green-300"
                            }`}>
                              {a.sequencia || empAdvCount}ª
                            </span>
                          </td>
                          <td className="py-2">{formatDate(a.dataOcorrencia)}</td>
                          <td className="py-2 max-w-[180px] truncate" title={a.motivo}>{a.motivo}</td>
                          <td className="py-2 max-w-[180px] truncate" title={a.descricao}>{a.descricao || "-"}</td>
                          <td className="py-2 max-w-[200px] truncate">{(() => { try { const arr = JSON.parse(a.testemunhas || "[]"); if (Array.isArray(arr) && arr.length > 0) { return arr.filter((t: any) => t.nome?.trim()).map((t: any) => t.nome).join(", ") || "-"; } return a.testemunhas || "-"; } catch { return a.testemunhas || "-"; } })()}</td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              {a.tipoAdvertencia !== "Verbal" && <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50" title="Visualizar Documento CLT" onClick={() => {
                                const empAdvs = (advList as any[]).filter((x: any) => x.employeeId === a.employeeId).sort((x: any, y: any) => (x.dataOcorrencia || "").localeCompare(y.dataOcorrencia || ""));
                                const idxAdv = empAdvs.findIndex((x: any) => x.id === a.id);
                                const anteriores = empAdvs.filter((_: any, i: number) => i < idxAdv);
                                let testemunhasArr: {nome: string; doc: string}[] = [];
                                try { testemunhasArr = JSON.parse(a.testemunhas || "[]"); } catch { testemunhasArr = []; }
                                setPreviewAdvData({
                                  nomeCompleto: a.nomeCompleto,
                                  cpf: a.cpf,
                                  funcao: a.funcao,
                                  setor: a.setor || "OBRA",
                                  tipoAdvertencia: a.tipoAdvertencia,
                                  dataOcorrencia: a.dataOcorrencia,
                                  motivo: a.motivo,
                                  descricao: a.descricao,
                                  testemunhasArr,
                                  diasSuspensao: a.diasSuspensao,
                                  sequencia: idxAdv + 1,
                                  anteriores,
                                  employeeId: a.employeeId,
                                  assinaturaFuncionarioUrl: (a as any).assinaturaFuncionarioUrl,
                                  assinaturaAplicadorUrl: (a as any).assinaturaAplicadorUrl,
                                });
                                setLastCreatedAdvId(a.id);
                                setShowAdvPreview(true);
                              }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>}
                              {a.tipoAdvertencia !== "Verbal" && <Button size="icon" variant="ghost" className="h-7 w-7 text-violet-600 hover:text-violet-800 hover:bg-violet-50" title="Assinaturas Digitais" onClick={() => {
                                let testemunhasArr: {nome: string; doc: string; assinaturaUrl?: string}[] = [];
                                try { testemunhasArr = JSON.parse(a.testemunhas || "[]"); } catch { testemunhasArr = []; }
                                setAdvAssinaturasData({
                                  advertenciaId: a.id,
                                  nomeFuncionario: a.nomeCompleto,
                                  nomeAplicador: a.aplicadoPor || authUser?.name || "Responsável",
                                  testemunhasIniciais: testemunhasArr,
                                  assinaturaFuncionarioUrl: (a as any).assinaturaFuncionarioUrl,
                                  assinaturaAplicadorUrl: (a as any).assinaturaAplicadorUrl,
                                });
                                setShowAdvAssinaturas(true);
                              }}>
                                <PenTool className="h-3.5 w-3.5" />
                              </Button>}
                              {a.tipoAdvertencia !== "Verbal" && <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50" title="Imprimir Documento CLT" onClick={() => {
                                const userName = authUser?.name || authUser?.username || "Usuário";
                                const dataEmissao = nowBrasilia();
                                const logoUrl = companyLogoUrl;
                                const tipo = a.tipoAdvertencia === "Suspensao" ? "Suspensão" : a.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : a.tipoAdvertencia;
                                const tipoTitulo = a.tipoAdvertencia === "Suspensao" ? "SUSPENSÃO DISCIPLINAR" : a.tipoAdvertencia === "JustaCausa" ? "RESCISÃO POR JUSTA CAUSA" : a.tipoAdvertencia === "Escrita" ? "ADVERTÊNCIA POR ESCRITO" : "ADVERTÊNCIA VERBAL";
                                const verbo = a.tipoAdvertencia === "Suspensao" ? "SUSPENDER" : a.tipoAdvertencia === "JustaCausa" ? "COMUNICAR A RESCISÃO POR JUSTA CAUSA de" : "ADVERTIR";
                                const empAdvs = (advList as any[]).filter((x: any) => x.employeeId === a.employeeId).sort((x: any, y: any) => (x.dataOcorrencia || "").localeCompare(y.dataOcorrencia || ""));
                                const idxAdv = empAdvs.findIndex((x: any) => x.id === a.id);
                                const anteriores = empAdvs.filter((_: any, i: number) => i < idxAdv);
                                const numAdv = idxAdv + 1;
                                let testemunhasArr: {nome: string; doc: string}[] = [];
                                try { testemunhasArr = JSON.parse(a.testemunhas || "[]"); } catch { testemunhasArr = []; }
                                const t1 = testemunhasArr[0] || { nome: "", doc: "" };
                                const t2 = testemunhasArr[1] || { nome: "", doc: "" };
                                const t3 = testemunhasArr[2] || { nome: "", doc: "" };
                                // Rev. 2747 — quando há template Vigente (advertencia), monta a partir dele
                                // (renderTemplate → buildFcDocument). Sem Vigente, cai no HTML CLT abaixo (fallback EXATO).
                                const advVigenteHtml = advTplQ.data?.vigente ? advTplQ.data.conteudoHtml : null;
                                if (advVigenteHtml) {
                                  const escA = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" } as any)[c]);
                                  const tipoAdvLbl = a.tipoAdvertencia === "Escrita" ? "POR ESCRITO" : a.tipoAdvertencia === "Suspensao" ? "— SUSPENSÃO DISCIPLINAR" : a.tipoAdvertencia === "JustaCausa" ? "— JUSTA CAUSA" : tipo.toUpperCase();
                                  const dadosA: Record<string, string> = {
                                    empresaRazaoSocial: escA(nomeEmpresaCompleto), empresaCnpj: escA((selectedCompany as any)?.cnpj || ""),
                                    empNome: escA(a.nomeCompleto), empCpf: escA(formatCPF(a.cpf)), empFuncao: escA(a.funcao || "N/I"),
                                    tipoAdv: escA(tipoAdvLbl), ocorrenciaData: escA(formatDate(a.dataOcorrencia)),
                                    motivo: escA(a.motivo + (a.descricao ? " — " + a.descricao : "")), baseLegal: "Art. 482 da CLT",
                                  };
                                  const htmlVig = buildFcDocument({
                                    empresa: { razaoSocial: nomeEmpresaCompleto, cnpj: (selectedCompany as any)?.cnpj || "", endereco: (selectedCompany as any)?.endereco, cidade: (selectedCompany as any)?.cidade, estado: (selectedCompany as any)?.estado, logoUrl: companyLogoUrl },
                                    titulo: tipoTitulo, numero: `${numAdv}ª MEDIDA`, dataEmissao,
                                    assunto: { label: "ASSUNTO:", valor: `${tipoTitulo} — ${a.nomeCompleto}` },
                                    corpoHtml: renderTemplate(advVigenteHtml, dadosA),
                                    assinaturas: { partes: [{ nome: "Empregador / Representante Legal", subtitulo: nomeEmpresaCompleto }, { nome: a.nomeCompleto, subtitulo: "Colaborador(a)" }] },
                                    geradoPor: userName, pageTitle: tipoTitulo,
                                  });
                                  const wv = window.open("", "_blank");
                                  if (wv) { wv.document.write(htmlVig); wv.document.write(`<script>setTimeout(function(){window.print()},500)<\/script>`); wv.document.close(); }
                                  return;
                                }
                                const printHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${tipoTitulo}</title>
                                <style>
                                  @page { size: A4 portrait; margin: 20mm 18mm 25mm 18mm; }
                                  * { margin: 0; padding: 0; box-sizing: border-box; }
                                  body { font-family: 'Times New Roman', serif; font-size: 12.5px; color: #000; line-height: 1.7; }
                                  .logo-bar { background: #1e3a6e; padding: 12px 20px; display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
                                  .logo-bar img { height: 50px; }
                                  .logo-bar .title { color: white; }
                                  .logo-bar .title h1 { font-size: 16px; font-weight: bold; letter-spacing: 2px; }
                                  .logo-bar .title p { font-size: 10px; opacity: 0.8; }
                                  .num-badge { background: #dc2626; color: white; font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 4px; margin-left: auto; }
                                  .doc-body { text-align: justify; padding: 0 10px; }
                                  .doc-body p { margin-bottom: 14px; text-indent: 35px; }
                                  .motivo-box { background: #f8f8f8; border-left: 4px solid #1e3a6e; padding: 10px 14px; margin: 14px 0; text-indent: 0 !important; font-style: italic; }
                                  .historico { margin: 14px 0; text-indent: 0 !important; }
                                  .historico li { margin-left: 35px; margin-bottom: 3px; }
                                  .signatures { margin-top: 50px; padding: 0 10px; }
                                  .sig-row { display: flex; justify-content: space-between; margin-bottom: 40px; }
                                  .sig-block { text-align: center; width: 45%; }
                                  .sig-block .line { border-top: 1px solid #000; padding-top: 4px; font-size: 10px; }
                                  .sig-row-3 { display: flex; justify-content: space-between; margin-bottom: 40px; }
                                  .sig-block-3 { text-align: center; width: 30%; }
                                  .sig-block-3 .line { border-top: 1px solid #000; padding-top: 4px; font-size: 10px; }
                                  .footer { position: fixed; bottom: 0; left: 0; right: 0; padding: 6px 18mm; border-top: 2px solid #1e3a6e; font-size: 8.5px; display: flex; justify-content: space-between; background: white; }
                                  .footer .lgpd { color: #dc2626; font-weight: 600; }
                                </style></head><body>
                                <div class="logo-bar">
                                  <img src="${window.location.origin}/logo-fc-branco-amarelo.png?v=1712" alt="FC Engenharia" />
                                  <div class="title"><h1>${tipoTitulo}</h1><p>${nomeEmpresaCompleto}</p></div>
                                  <span class="num-badge">${numAdv}ª MEDIDA</span>
                                </div>
                                <div class="doc-body">
                                  <p>Pelo presente instrumento, a empresa <strong>${nomeEmpresaCompleto}</strong>, vem por meio deste ${verbo} o(a) colaborador(a) <strong>${a.nomeCompleto}</strong>, portador(a) do CPF nº <strong>${formatCPF(a.cpf)}</strong>, ocupante do cargo de <strong>${a.funcao || "N/I"}</strong>, lotado(a) no setor <strong>${a.setor || "OBRA"}</strong>${a.tipoAdvertencia === "Suspensao" && a.diasSuspensao ? `, pelo período de <strong style="color: #dc2626; background: #fef2f2; padding: 2px 6px; border-radius: 3px;">${a.diasSuspensao} dia(s)</strong>, a contar de <strong style="color: #dc2626;">${a.dataInicio ? formatDate(a.dataInicio) : '___/___/______'}</strong> até <strong style="color: #dc2626;">${a.dataFim ? formatDate(a.dataFim) : '___/___/______'}</strong>,` : ""} pelo seguinte motivo:</p>
                                  <div class="motivo-box">${a.motivo}${a.descricao ? "<br/><br/>" + a.descricao : ""}</div>
                                  <p>Ocorrido em <strong>${formatDate(a.dataOcorrencia)}</strong>.</p>
                                  <p style="text-indent:0; font-weight:bold; color:#1e3a6e;">Esta é a ${numAdv}ª medida disciplinar aplicada a este(a) colaborador(a).</p>
                                  ${anteriores.length > 0 ? `<p>Registramos que o(a) colaborador(a) já recebeu as seguintes medidas disciplinares anteriores:</p><div class="historico"><ul>${anteriores.map((prev: any, pi: number) => `<li>${pi + 1}ª ${prev.tipoAdvertencia === "Suspensao" ? "Suspensão" : prev.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : prev.tipoAdvertencia} em ${formatDate(prev.dataOcorrencia)} — ${prev.motivo}</li>`).join("")}</ul></div>` : ""}
                                  <p>${a.tipoAdvertencia === "Suspensao" ? "A presente suspensão é aplicada com fundamento no Art. 474 da CLT, que limita a suspensão disciplinar a no máximo 30 (trinta) dias consecutivos. Durante o período de suspensão, o(a) colaborador(a) não deverá comparecer ao local de trabalho e terá os dias descontados de sua remuneração." : a.tipoAdvertencia === "JustaCausa" ? "Após esgotadas todas as medidas socioeducativas e disciplinares previstas, e diante da reincidência e/ou gravidade da falta cometida, a empresa não encontra outra alternativa senão a aplicação da penalidade máxima, com fundamento no Art. 482 da CLT." : "Esclarecemos que a presente advertência tem caráter educativo e visa orientar o(a) colaborador(a) sobre a conduta esperada, conforme previsto no Art. 482 da CLT e no regulamento interno da empresa."}</p>
                                  <p>${a.tipoAdvertencia !== "JustaCausa" ? "A reincidência poderá acarretar a aplicação de penalidades mais severas, incluindo " + (a.tipoAdvertencia === "Suspensao" ? "rescisão do contrato de trabalho por justa causa." : "advertência por escrito, suspensão disciplinar e, em último caso, rescisão do contrato de trabalho por justa causa.") : "O(A) colaborador(a) deverá comparecer ao Departamento Pessoal para as providências de rescisão contratual."}</p>
                                  <p>O(A) colaborador(a) declara estar ciente desta ${tipo.toLowerCase()} e compromete-se a adequar sua conduta.</p>
                                  <p style="text-indent:0; margin-top: 25px;">_________________, ${todayBrasiliaLong()}.</p>
                                </div>
                                <div class="signatures">
                                  <div class="sig-row">
                                    <div class="sig-block"><div class="line">Empregador / Representante Legal</div></div>
                                    <div class="sig-block"><div class="line">${a.nomeCompleto}<br/>Colaborador(a)</div></div>
                                  </div>
                                  <div class="sig-row-3">
                                    <div class="sig-block-3"><div class="line">Testemunha 1${t1.nome ? "<br/><strong>" + t1.nome + "</strong>" : ""}${t1.doc ? "<br/>" + t1.doc : ""}</div></div>
                                    <div class="sig-block-3"><div class="line">Testemunha 2${t2.nome ? "<br/><strong>" + t2.nome + "</strong>" : ""}${t2.doc ? "<br/>" + t2.doc : ""}</div></div>
                                    <div class="sig-block-3"><div class="line">Testemunha 3${t3.nome ? "<br/><strong>" + t3.nome + "</strong>" : ""}${t3.doc ? "<br/>" + t3.doc : ""}</div></div>
                                  </div>
                                </div>
                                <div class="footer">
                                  <span>ERP - Gestão Integrada</span>
                                  <span>Documento gerado por: <strong>${userName}</strong> em ${dataEmissao}</span>
                                  <span class="lgpd">LGPD (Lei 13.709/2018) — Uso restrito e confidencial.</span>
                                </div>
                                </body></html>`;
                                const w = window.open("", "_blank");
                                if (w) { w.document.write(printHtml); w.document.close(); setTimeout(() => w.print(), 500); }
                              }}>
                                <Printer className="h-3.5 w-3.5" />
                              </Button>}
                              {(() => {
                                const assinado = !!(a as any).assinaturaFuncionarioUrl;
                                return (
                                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={assinado}
                                    title={assinado ? "Documento assinado pelo colaborador — edição bloqueada (LGPD/auditoria). Para corrigir, cancele e emita uma nova advertência." : "Editar"}
                                    onClick={() => { if (assinado) { toast.error("Documento assinado pelo colaborador — não pode ser editado (LGPD/auditoria)."); return; } openEditAdv(a); }}>
                                    {assinado ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Pencil className="h-3.5 w-3.5" />}
                                  </Button>
                                );
                              })()}
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar PDF" onClick={() => handleUploadDoc("adv", a.id)}>
                                <FileUp className="h-3.5 w-3.5" />
                              </Button>
                              {a.documentoUrl && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver documento" onClick={() => window.open(a.documentoUrl, "_blank")}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir esta advertência?")) deleteAdv.mutate({ id: a.id }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===================== ABA INTEGRAÇÕES ===================== */}
          <TabsContent value="integracoes" className="mt-4">
            <IntegracoesPanel companyId={companyId} onClickEmployee={setRaioXEmployeeId} />
          </TabsContent>

          {/* ===================== ABA TERMO DE RECEBIMENTO (Rev. 2146) ===================== */}
          <TabsContent value="termos-responsabilidade" className="mt-4">
            <TermosResponsabilidadePanel companyId={companyId} companyIds={companyIds} onClickEmployee={setRaioXEmployeeId} />
          </TabsContent>

        </Tabs>
      </div>

      {/* ===================== DIALOG: Upload ASO com data ===================== */}
      {asoUploadDialog && (
        <Dialog open onOpenChange={() => setAsoUploadDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Anexar Documento ao ASO</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <strong>{asoUploadDialog.nomeCompleto}</strong> — Arquivo: {asoUploadDialog.file.name}
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 text-sm">
                Se este é um ASO renovado, preencha a nova data do exame para atualizar automaticamente a data e o vencimento.
              </div>
              <div>
                <Label>Nova Data do Exame (opcional)</Label>
                <Input type="date" value={asoUploadDate} onChange={(e) => setAsoUploadDate(e.target.value)} />
              </div>
              <div>
                <Label>Validade (dias)</Label>
                <Input type="number" value={asoUploadValidadeDias} onChange={(e) => setAsoUploadValidadeDias(Number(e.target.value) || 365)} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setAsoUploadDialog(null)}>Cancelar</Button>
                <Button onClick={handleConfirmAsoUpload} disabled={uploadAsoDoc.isPending}>
                  {uploadAsoDoc.isPending ? "Enviando..." : asoUploadDate ? "Anexar e Atualizar Data" : "Apenas Anexar Documento"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ===================== DIALOG: ASO (Criar/Editar) ===================== */}
      <FullScreenDialog open={showAsoDialog} onClose={() => { setShowAsoDialog(false); setEditingAsoId(null); }} title={editingAsoId ? "Editar ASO" : "Novo ASO"} icon={<Stethoscope className="h-5 w-5 text-white" />}>
        <div className="w-full max-w-3xl mx-auto space-y-5">

          <div className="rounded-xl border bg-gradient-to-r from-emerald-50 to-teal-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-emerald-600 flex items-center justify-center"><Search className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-emerald-900">Colaborador</h3>
            </div>
            <EmployeeSelect value={asoForm.employeeId} onChange={id => setAsoForm({ ...asoForm, employeeId: id })} />
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-teal-600 flex items-center justify-center"><ClipboardList className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Dados do Exame</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Tipo de Exame *</label>
                <Select value={asoForm.tipo || ""} onValueChange={v => setAsoForm({ ...asoForm, tipo: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Admissional">Admissional</SelectItem>
                    <SelectItem value="Periodico">Periódico</SelectItem>
                    <SelectItem value="Retorno">Retorno ao Trabalho</SelectItem>
                    <SelectItem value="Mudanca_Funcao">Mudança de Função</SelectItem>
                    <SelectItem value="Demissional">Demissional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Data do Exame *</label>
                <Input type="date" className="mt-1" value={asoForm.dataExame || ""} onChange={e => setAsoForm({ ...asoForm, dataExame: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Validade (dias)</label>
                <Input type="number" className="mt-1" value={asoForm.validadeDias || 365} onChange={e => setAsoForm({ ...asoForm, validadeDias: parseInt(e.target.value) || 365 })} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Resultado</label>
                <Select value={asoForm.resultado || "Apto"} onValueChange={v => setAsoForm({ ...asoForm, resultado: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Apto">Apto</SelectItem>
                    <SelectItem value="Inapto">Inapto</SelectItem>
                    <SelectItem value="Apto_Restricao">Apto com Restrição</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-cyan-600 flex items-center justify-center"><Stethoscope className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Profissional e Clínica</h3>
            </div>
            <div className="space-y-3">
              <MedicoAutocomplete
                medicoValue={asoForm.medico || ""}
                crmValue={asoForm.crm || ""}
                onSelect={(nome, crm) => setAsoForm((prev: any) => ({ ...prev, medico: nome, crm }))}
                onChangeMedico={v => setAsoForm((prev: any) => ({ ...prev, medico: v }))}
                onChangeCrm={v => setAsoForm((prev: any) => ({ ...prev, crm: v }))}
                companyId={companyId}
                companyIds={companyIds}
              />
              <ClinicaAutocomplete
                value={asoForm.clinica || ""}
                onChange={v => setAsoForm({ ...asoForm, clinica: v })}
                companyId={companyId}
                companyIds={companyIds}
              />
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center"><BookOpen className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Exames Realizados</h3>
            </div>
            <ExamesRealizadosField value={asoForm.examesRealizados || ""} onChange={v => setAsoForm({ ...asoForm, examesRealizados: v })} companyId={companyId} companyIds={companyIds} />
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-gray-600 flex items-center justify-center"><FileText className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Observações e Anexo</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Observações</label>
                <Textarea className="mt-1" value={asoForm.observacoes || ""} onChange={e => setAsoForm({ ...asoForm, observacoes: e.target.value })} rows={2} placeholder="Observações adicionais..." />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Anexar Documento ASO (PDF/Imagem)</label>
                <div className="mt-1.5 border-2 border-dashed border-gray-200 rounded-lg p-3 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors">
                  <Input type="file" accept=".pdf,.jpg,.jpeg,.png" className="border-0 shadow-none p-0" onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
                      setAsoForm({ ...asoForm, _file: file });
                    }
                  }} />
                </div>
                {asoForm._file && <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1"><Paperclip className="h-3 w-3" /> {asoForm._file.name}</p>}
                {editingAsoId && (() => { const aso = asoList.find((a: any) => a.id === editingAsoId); return aso?.documentoUrl ? <a href={aso.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1.5 flex items-center gap-1"><FileText className="h-3 w-3" /> Ver documento atual</a> : null; })()}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 pb-4">
            <Button variant="outline" size="lg" onClick={() => { setShowAsoDialog(false); setEditingAsoId(null); }}>Cancelar</Button>
            <Button size="lg" className="px-8 shadow-md" onClick={handleSubmitAso} disabled={createAso.isPending || updateAso.isPending}>
              {(createAso.isPending || updateAso.isPending) ? "Salvando..." : editingAsoId ? "Atualizar" : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* ===================== DIALOG: TREINAMENTO (Criar/Editar) ===================== */}
      <FullScreenDialog open={showTreinDialog} onClose={() => { setShowTreinDialog(false); setEditingTreinId(null); }} title={editingTreinId ? "Editar Treinamento" : "Novo Treinamento"} icon={<GraduationCap className="h-5 w-5 text-white" />}>
        <div className="w-full max-w-3xl mx-auto space-y-5">

          <div className="rounded-xl border bg-gradient-to-r from-purple-50 to-fuchsia-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-purple-600 flex items-center justify-center"><Search className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-purple-900">Colaborador</h3>
            </div>
            <EmployeeSelect value={treinForm.employeeId} onChange={id => setTreinForm({ ...treinForm, employeeId: id })} />
          </div>

          <div className="rounded-xl border bg-gradient-to-r from-amber-50 to-yellow-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-amber-500 flex items-center justify-center"><Zap className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-amber-900">Preenchimento Rápido por NR</h3>
              <span className="text-xs text-amber-600 font-normal">(selecione para preencher automaticamente)</span>
            </div>
            {/* Combobox com busca */}
            <div className="relative" ref={nrContainerRef}>
              <div
                className="flex items-center bg-white border border-amber-200 rounded-lg px-3 py-2 gap-2 cursor-text"
                onClick={() => { setNrDropdownOpen(true); nrInputRef.current?.focus(); }}
              >
                <Search className="h-4 w-4 text-amber-400 shrink-0" />
                <input
                  ref={nrInputRef}
                  value={nrSearch}
                  onChange={e => { setNrSearch(e.target.value); setNrDropdownOpen(true); }}
                  onFocus={() => setNrDropdownOpen(true)}
                  placeholder={
                    treinForm._selectedRule && treinForm._selectedRule !== "" && treinForm._selectedRule !== "_custom"
                      ? `✓ ${TRAINING_RULES[parseInt(treinForm._selectedRule)]?.nome || ""}`
                      : treinForm._selectedRule === "_custom"
                      ? "✏️ Preenchimento manual ativo"
                      : "Buscar por nome ou NR (ex: NR-35, Trabalho em Altura)..."
                  }
                  className="flex-1 text-sm outline-none bg-transparent min-w-0 placeholder:text-gray-500"
                />
                {(nrSearch || treinForm._selectedRule) && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setNrSearch(""); setNrDropdownOpen(false); setTreinForm({ ...treinForm, _selectedRule: "", nome: "", norma: "", cargaHoraria: "", _autoValidade: false }); }}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {nrDropdownOpen && (
                <div className="absolute z-50 w-full bg-white border rounded-xl shadow-lg mt-1 max-h-72 overflow-y-auto">
                  {/* Preencher manualmente */}
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent/60 flex items-center gap-2 border-b"
                    onMouseDown={e => { e.preventDefault(); setTreinForm({ ...treinForm, _selectedRule: "_custom", nome: "", norma: "", cargaHoraria: "", _autoValidade: false }); setNrSearch(""); setNrDropdownOpen(false); }}
                  >
                    ✏️ <span className="font-medium">Preencher manualmente</span>
                  </button>

                  {filteredNrRules !== null ? (
                    /* Lista filtrada pela busca */
                    filteredNrRules.length === 0 ? (
                      <p className="text-center text-sm text-muted-foreground py-6">Nenhum resultado para "{nrSearch}"</p>
                    ) : filteredNrRules.map(rule => {
                      const idx = TRAINING_RULES.indexOf(rule);
                      return (
                        <button
                          key={idx}
                          type="button"
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent/60 flex items-center gap-2"
                          onMouseDown={e => {
                            e.preventDefault();
                            const updates: any = { ...treinForm, _selectedRule: String(idx), nome: rule.nome, norma: rule.norma, cargaHoraria: rule.cargaHorariaInicial, _autoValidade: !!rule.validadeMeses, _validadeMeses: rule.validadeMeses };
                            if (treinForm.dataRealizacao && rule.validadeMeses) updates.dataValidade = calcularDataValidade(treinForm.dataRealizacao, rule.validadeMeses);
                            setTreinForm(updates);
                            toast.success(`Preenchido: ${rule.nome} (${rule.norma || "Sem NR"})${rule.validadeMeses ? ` — Validade: ${rule.validadeMeses} meses` : ""}`);
                            setNrSearch(""); setNrDropdownOpen(false);
                          }}
                        >
                          <span className="font-medium flex-1">{rule.nome}</span>
                          {rule.norma && <span className="text-xs text-muted-foreground">({rule.norma})</span>}
                          {rule.validadeMeses && <span className="text-xs text-amber-600 shrink-0">• {rule.validadeMeses}m</span>}
                        </button>
                      );
                    })
                  ) : (
                    /* Lista agrupada por categoria (sem busca) */
                    Object.entries(TRAINING_CATEGORIES).map(([key, label]) => {
                      const rules = TRAINING_RULES.filter(r => r.categoria === key);
                      if (rules.length === 0) return null;
                      return (
                        <div key={key}>
                          <div className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-t mt-1 bg-gray-50">{label}</div>
                          {rules.map(rule => {
                            const idx = TRAINING_RULES.indexOf(rule);
                            return (
                              <button
                                key={idx}
                                type="button"
                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent/60 flex items-center gap-2"
                                onMouseDown={e => {
                                  e.preventDefault();
                                  const updates: any = { ...treinForm, _selectedRule: String(idx), nome: rule.nome, norma: rule.norma, cargaHoraria: rule.cargaHorariaInicial, _autoValidade: !!rule.validadeMeses, _validadeMeses: rule.validadeMeses };
                                  if (treinForm.dataRealizacao && rule.validadeMeses) updates.dataValidade = calcularDataValidade(treinForm.dataRealizacao, rule.validadeMeses);
                                  setTreinForm(updates);
                                  toast.success(`Preenchido: ${rule.nome} (${rule.norma || "Sem NR"})${rule.validadeMeses ? ` — Validade: ${rule.validadeMeses} meses` : ""}`);
                                  setNrSearch(""); setNrDropdownOpen(false);
                                }}
                              >
                                <span className="font-medium flex-1">{rule.nome}</span>
                                {rule.norma && <span className="text-xs text-muted-foreground">({rule.norma})</span>}
                                {rule.validadeMeses && <span className="text-xs text-amber-600 shrink-0">• {rule.validadeMeses}m</span>}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-violet-600 flex items-center justify-center"><GraduationCap className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Dados do Treinamento</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Nome do Treinamento *</label>
                <Input className="mt-1" value={treinForm.nome || ""} onChange={e => setTreinForm({ ...treinForm, nome: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Norma Regulamentadora</label>
                <Input className="mt-1" value={treinForm.norma || ""} onChange={e => setTreinForm({ ...treinForm, norma: e.target.value })} placeholder="Ex: NR-35, NR-10" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Carga Horária</label>
                <Input className="mt-1" value={treinForm.cargaHoraria || ""} onChange={e => setTreinForm({ ...treinForm, cargaHoraria: e.target.value })} placeholder="Ex: 8h, 40h" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Instrutor</label>
                <Input className="mt-1" value={treinForm.instrutor || ""} onChange={e => setTreinForm({ ...treinForm, instrutor: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600">Entidade/Empresa</label>
                <Input className="mt-1" value={treinForm.entidade || ""} onChange={e => setTreinForm({ ...treinForm, entidade: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-orange-500 flex items-center justify-center"><Calendar className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Datas e Validade</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Data Realização *</label>
                <Input type="date" className="mt-1" value={treinForm.dataRealizacao || ""} onChange={e => {
                  const newDate = e.target.value;
                  const updates: any = { ...treinForm, dataRealizacao: newDate };
                  if (treinForm._autoValidade && treinForm._validadeMeses && newDate) {
                    updates.dataValidade = calcularDataValidade(newDate, treinForm._validadeMeses);
                  }
                  setTreinForm(updates);
                }} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                  Data Validade
                  {treinForm._autoValidade && <span className="text-xs text-amber-600 flex items-center gap-0.5"><Zap className="h-3 w-3" /> Auto ({treinForm._validadeMeses}m)</span>}
                </label>
                <Input type="date" className="mt-1" value={treinForm.dataValidade || ""} onChange={e => setTreinForm({ ...treinForm, dataValidade: e.target.value, _autoValidade: false })} />
                {treinForm._autoValidade && <p className="text-[10px] text-amber-600 mt-1">Calculada automaticamente pela norma. Você pode alterar.</p>}
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-gray-600 flex items-center justify-center"><FileText className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Observações e Certificado</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Observações</label>
                <Textarea className="mt-1" value={treinForm.observacoes || ""} onChange={e => setTreinForm({ ...treinForm, observacoes: e.target.value })} rows={2} placeholder="Observações adicionais..." />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Anexar Certificado (PDF/Imagem)</label>
                <div className="mt-1.5 border-2 border-dashed border-gray-200 rounded-lg p-3 hover:border-purple-300 hover:bg-purple-50/30 transition-colors">
                  <Input type="file" accept=".pdf,.jpg,.jpeg,.png" className="border-0 shadow-none p-0" onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
                      setTreinForm({ ...treinForm, _file: file });
                    }
                  }} />
                </div>
                {treinForm._file && <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1"><Paperclip className="h-3 w-3" /> {treinForm._file.name}</p>}
                {editingTreinId && (() => { const trein = treinList.find((t: any) => t.id === editingTreinId); return trein?.certificadoUrl ? <a href={trein.certificadoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1.5 flex items-center gap-1"><FileText className="h-3 w-3" /> Ver certificado atual</a> : null; })()}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 pb-4">
            <Button variant="outline" size="lg" onClick={() => { setShowTreinDialog(false); setEditingTreinId(null); }}>Cancelar</Button>
            <Button size="lg" className="px-8 shadow-md" onClick={handleSubmitTrein} disabled={createTrein.isPending || updateTrein.isPending}>
              {(createTrein.isPending || updateTrein.isPending) ? "Salvando..." : editingTreinId ? "Atualizar" : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* ===================== DIALOG: ATESTADO (Criar/Editar) ===================== */}
      <FullScreenDialog open={showAtestDialog} onClose={() => { setShowAtestDialog(false); setEditingAtestId(null); }} title={editingAtestId ? "Editar Atestado" : "Novo Atestado"} icon={<FileText className="h-5 w-5 text-white" />}>
        <div className="w-full max-w-3xl mx-auto space-y-5">

          <div className="rounded-xl border bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center"><Search className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-blue-900">Colaborador</h3>
            </div>
            <EmployeeSelect value={atestForm.employeeId} onChange={id => setAtestForm({ ...atestForm, employeeId: id })} />
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-violet-600 flex items-center justify-center"><Stethoscope className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Dados do Atestado</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Tipo *</label>
                <Select value={atestForm.tipo || ""} onValueChange={v => setAtestForm({ ...atestForm, tipo: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Atestado Médico">Atestado Médico</SelectItem>
                    <SelectItem value="Atestado Odontológico">Atestado Odontológico</SelectItem>
                    <SelectItem value="Declaração de Comparecimento">Declaração de Comparecimento</SelectItem>
                    <SelectItem value="Atestado de Acompanhamento">Atestado de Acompanhamento</SelectItem>
                    <SelectItem value="Acidente de Trabalho">Acidente de Trabalho</SelectItem>
                    <SelectItem value="Acidente de Trajeto">Acidente de Trajeto</SelectItem>
                    <SelectItem value="Licença Maternidade">Licença Maternidade</SelectItem>
                    <SelectItem value="Licença Paternidade">Licença Paternidade</SelectItem>
                    <SelectItem value="Outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Data Emissão *</label>
                <Input type="date" className="mt-1" value={atestForm.dataEmissao || ""} onChange={e => setAtestForm({ ...atestForm, dataEmissao: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">CID</label>
                <Input className="mt-1" value={atestForm.cid || ""} onChange={e => setAtestForm({ ...atestForm, cid: e.target.value })} placeholder="Ex: J11, M54.5" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Motivo *</label>
                <Select value={atestForm.motivo || ""} onValueChange={v => setAtestForm({ ...atestForm, motivo: v, motivoOutro: v !== "Outros" ? "" : atestForm.motivoOutro })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o motivo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Consulta Médica">Consulta Médica</SelectItem>
                    <SelectItem value="Doença">Doença</SelectItem>
                    <SelectItem value="Acidente">Acidente</SelectItem>
                    <SelectItem value="Cirurgia">Cirurgia</SelectItem>
                    <SelectItem value="Acompanhamento Familiar">Acompanhamento Familiar</SelectItem>
                    <SelectItem value="Exame">Exame</SelectItem>
                    <SelectItem value="Tratamento">Tratamento</SelectItem>
                    <SelectItem value="Saúde Mental">Saúde Mental</SelectItem>
                    <SelectItem value="Outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {atestForm.motivo === "Outros" && (
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600">Especifique o Motivo *</label>
                  <Input className="mt-1" value={atestForm.motivoOutro || ""} onChange={e => setAtestForm({ ...atestForm, motivoOutro: e.target.value })} placeholder="Descreva o motivo" />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-orange-500 flex items-center justify-center"><Calendar className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Tipo de Afastamento</h3>
            </div>
            <div className="flex gap-3 mb-4">
              <button type="button" onClick={() => setAtestForm({ ...atestForm, afastamentoTipo: "dia", horasAfastamento: 0 })}
                className={`flex-1 flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${(!atestForm.afastamentoTipo || atestForm.afastamentoTipo === "dia")
                  ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200 scale-[1.02]"
                  : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-gray-300"}`}>
                <Calendar className="h-4.5 w-4.5" />
                Dia(s) inteiro(s)
              </button>
              <button type="button" onClick={() => setAtestForm({ ...atestForm, afastamentoTipo: "horas", diasAfastamento: 0 })}
                className={`flex-1 flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${atestForm.afastamentoTipo === "horas"
                  ? "bg-gradient-to-br from-amber-500 to-orange-500 text-white border-orange-500 shadow-lg shadow-orange-200 scale-[1.02]"
                  : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:border-gray-300"}`}>
                <Clock className="h-4.5 w-4.5" />
                Horas (parcial)
              </button>
            </div>
            <div className={`rounded-lg p-4 ${(!atestForm.afastamentoTipo || atestForm.afastamentoTipo === "dia") ? "bg-blue-50/60 border border-blue-100" : "bg-amber-50/60 border border-amber-100"}`}>
              {(!atestForm.afastamentoTipo || atestForm.afastamentoTipo === "dia") ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-blue-700">Dias de Afastamento</label>
                      <Input
                        type="number" min={0}
                        inputMode="numeric"
                        placeholder="0"
                        className="mt-1 border-blue-200 focus:border-blue-400"
                        value={atestForm.diasAfastamento ? String(atestForm.diasAfastamento) : ""}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={e => {
                          const raw = e.target.value.replace(/^0+(?=\d)/, "");
                          const dias = raw === "" ? 0 : parseInt(raw) || 0;
                          const patch: any = { diasAfastamento: dias };
                          // Auto-calcula Data Retorno = Data Emissão + dias
                          if (atestForm.dataEmissao && dias > 0) {
                            const [y, m, d] = atestForm.dataEmissao.split("-").map(Number);
                            const base = new Date(Date.UTC(y, m - 1, d));
                            base.setUTCDate(base.getUTCDate() + dias);
                            patch.dataRetorno = base.toISOString().slice(0, 10);
                          } else if (dias === 0) {
                            patch.dataRetorno = "";
                          }
                          setAtestForm({ ...atestForm, ...patch });
                        }}
                      />
                      <p className="text-[10px] text-blue-500 mt-1">Calcula a Data de Retorno automaticamente.</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-blue-700">Data Retorno</label>
                      <Input
                        type="date"
                        className="mt-1 border-blue-200 focus:border-blue-400"
                        value={atestForm.dataRetorno || ""}
                        onChange={e => {
                          const ret = e.target.value;
                          const patch: any = { dataRetorno: ret };
                          // Auto-calcula Dias = Retorno − Emissão
                          if (atestForm.dataEmissao && ret) {
                            const [ey, em, ed] = atestForm.dataEmissao.split("-").map(Number);
                            const [ry, rm, rd] = ret.split("-").map(Number);
                            const ini = Date.UTC(ey, em - 1, ed);
                            const fim = Date.UTC(ry, rm - 1, rd);
                            const diff = Math.round((fim - ini) / 86400000);
                            patch.diasAfastamento = diff > 0 ? diff : 0;
                          }
                          setAtestForm({ ...atestForm, ...patch });
                        }}
                      />
                      <p className="text-[10px] text-blue-500 mt-1">Calcula os Dias de Afastamento automaticamente.</p>
                    </div>
                  </div>
                  {(atestForm.diasAfastamento || 0) > 15 && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded">INSS</span>
                        <span className="text-xs font-semibold text-red-700">Afastamento superior a 15 dias</span>
                      </div>
                      <p className="text-[10px] text-red-600 mt-1.5 leading-relaxed">
                        Lei 8.213/91, Art. 59-60: A partir do 16º dia, o pagamento é responsabilidade do INSS.
                        O RH deve providenciar o encaminhamento para perícia médica (auxílio-doença B31).
                      </p>
                    </div>
                  )}
                  {(atestForm.diasAfastamento || 0) > 0 && (atestForm.diasAfastamento || 0) <= 15 && (
                    <p className="text-[10px] text-blue-500 mt-2 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full inline-block" />
                      O status do funcionário será alterado automaticamente para "Afastado"
                    </p>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-amber-700">Horas de Afastamento</label>
                    {(() => {
                      const totalDec = Number(atestForm.horasAfastamento || 0);
                      const hhVal = Math.floor(totalDec);
                      const mmVal = Math.round((totalDec - hhVal) * 60);
                      const setHM = (h: number, m: number) => {
                        const hClamped = Math.max(0, Math.min(12, h));
                        const mClamped = Math.max(0, Math.min(59, m));
                        const dec = Math.round((hClamped + mClamped / 60) * 100) / 100;
                        setAtestForm({ ...atestForm, horasAfastamento: dec });
                      };
                      return (
                        <div className="mt-1 flex items-center gap-2">
                          <div className="flex-1">
                            <Input
                              type="number"
                              min={0}
                              max={12}
                              step={1}
                              className="border-amber-200 focus:border-amber-400 text-center"
                              value={hhVal === 0 && mmVal === 0 ? "" : hhVal}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={e => {
                                const h = parseInt(e.target.value) || 0;
                                setHM(h, mmVal);
                              }}
                              placeholder="0"
                            />
                            <p className="text-[9px] text-amber-600 text-center mt-0.5">horas</p>
                          </div>
                          <span className="text-amber-700 font-bold text-lg pb-4">:</span>
                          <div className="flex-1">
                            <Input
                              type="number"
                              min={0}
                              max={59}
                              step={1}
                              className="border-amber-200 focus:border-amber-400 text-center"
                              value={hhVal === 0 && mmVal === 0 ? "" : String(mmVal).padStart(2, "0")}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={e => {
                                const m = parseInt(e.target.value) || 0;
                                setHM(hhVal, m);
                              }}
                              placeholder="00"
                            />
                            <p className="text-[9px] text-amber-600 text-center mt-0.5">minutos</p>
                          </div>
                        </div>
                      );
                    })()}
                    <p className="text-[10px] text-amber-600 mt-1">
                      Informe horas (0–12) e minutos (0–59) separadamente. Aceita atestados curtos como <b>0h48min</b>.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-amber-700">Data Retorno</label>
                    <Input type="date" className="mt-1 border-amber-200 focus:border-amber-400" value={atestForm.dataRetorno || ""} onChange={e => setAtestForm({ ...atestForm, dataRetorno: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-teal-600 flex items-center justify-center"><Stethoscope className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Profissional de Saúde</h3>
            </div>
            <MedicoAutocomplete
              medicoValue={atestForm.medico || ""}
              crmValue={atestForm.crm || ""}
              onSelect={(nome, crm) => setAtestForm((prev: any) => ({ ...prev, medico: nome, crm }))}
              onChangeMedico={v => setAtestForm((prev: any) => ({ ...prev, medico: v }))}
              onChangeCrm={v => setAtestForm((prev: any) => ({ ...prev, crm: v }))}
              companyId={companyId}
              companyIds={companyIds}
            />
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-gray-600 flex items-center justify-center"><FileText className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Observações e Anexo</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Descrição</label>
                <Textarea className="mt-1" value={atestForm.descricao || ""} onChange={e => setAtestForm({ ...atestForm, descricao: e.target.value })} rows={2} placeholder="Observações adicionais..." />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Anexar Documento (PDF/Imagem)</label>
                <div className="mt-1.5 border-2 border-dashed border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
                  <Input type="file" accept=".pdf,.jpg,.jpeg,.png" className="border-0 shadow-none p-0" onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
                      setAtestForm({ ...atestForm, _file: file });
                    }
                  }} />
                </div>
                {atestForm._file && <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1"><Paperclip className="h-3 w-3" /> {atestForm._file.name}</p>}
                {editingAtestId && (() => { const at = atestList.find((a: any) => a.id === editingAtestId); return at?.documentoUrl ? <a href={at.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1.5 flex items-center gap-1"><FileText className="h-3 w-3" /> Ver documento atual</a> : null; })()}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 pb-4">
            <Button variant="outline" size="lg" onClick={() => { setShowAtestDialog(false); setEditingAtestId(null); }}>Cancelar</Button>
            <Button size="lg" className="px-8 shadow-md" onClick={handleSubmitAtest} disabled={createAtest.isPending || updateAtest.isPending}>
              {(createAtest.isPending || updateAtest.isPending) ? "Salvando..." : editingAtestId ? "Atualizar" : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* ===================== DIALOG: ADVERTÊNCIA (Criar/Editar) ===================== */}
      <FullScreenDialog open={showAdvDialog} onClose={() => { setShowAdvDialog(false); setEditingAdvId(null); setAdvEmployeeCount(null); }} title={editingAdvId ? "Editar Advertência" : "Nova Advertência"} icon={<ShieldAlert className="h-5 w-5 text-white" />}>
        <div className="w-full max-w-3xl mx-auto space-y-5">

          <div className="rounded-xl border bg-gradient-to-r from-red-50 to-rose-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-red-600 flex items-center justify-center"><Search className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-red-900">Colaborador</h3>
            </div>
            <EmployeeSelect value={advForm.employeeId} onChange={id => setAdvForm({ ...advForm, employeeId: id })} />
          </div>

          {advCountData && !editingAdvId && advForm.employeeId && (
            <div className={`rounded-xl border-2 p-4 ${
              advCountData.total >= 3 ? "bg-red-50 border-red-300" : advCountData.total >= 2 ? "bg-amber-50 border-amber-300" : "bg-blue-50 border-blue-200"
            }`}>
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${advCountData.total >= 3 ? "bg-red-200" : advCountData.total >= 2 ? "bg-amber-200" : "bg-blue-200"}`}>
                  <ShieldAlert className={`h-5 w-5 ${advCountData.total >= 3 ? "text-red-700" : advCountData.total >= 2 ? "text-amber-700" : "text-blue-700"}`} />
                </div>
                <div>
                  <p className={`text-sm font-bold ${advCountData.total >= 3 ? "text-red-800" : advCountData.total >= 2 ? "text-amber-800" : "text-blue-800"}`}>
                    Este colaborador já possui {advCountData.total} advertência(s)
                  </p>
                  <p className={`text-xs ${advCountData.total >= 3 ? "text-red-700" : advCountData.total >= 2 ? "text-amber-700" : "text-blue-700"}`}>
                    {advCountData.proximaAcao}
                  </p>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Verbais: {advCountData.verbais}</span>
                    <span>Escritas: {advCountData.escritas}</span>
                    <span>Suspensões: {advCountData.suspensoes}</span>
                  </div>
                </div>
              </div>
              {advCountData.total >= 3 && (
                <p className="text-xs font-bold text-red-700 mt-2 flex items-center gap-1 ml-[52px]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  APÓS A 3ª ADVERTÊNCIA O COLABORADOR ESTÁ APTO A RECEBER SUSPENSÃO (Art. 474 CLT)
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-rose-600 flex items-center justify-center"><ShieldAlert className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Dados da Ocorrência</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Tipo *</label>
                <Select value={advForm.tipoAdvertencia || ""} onValueChange={v => setAdvForm({ ...advForm, tipoAdvertencia: v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Verbal">Verbal</SelectItem>
                    <SelectItem value="Escrita">Escrita</SelectItem>
                    <SelectItem value="Suspensao">Suspensão</SelectItem>
                    <SelectItem value="JustaCausa">Justa Causa</SelectItem>
                    <SelectItem value="OSS">OSS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Data da Ocorrência *</label>
                <Input type="date" className="mt-1" value={advForm.dataOcorrencia || ""} onChange={e => setAdvForm({ ...advForm, dataOcorrencia: e.target.value })} />
              </div>
              {advForm.tipoAdvertencia === "Suspensao" && (
                <div>
                  <label className="text-xs font-medium text-gray-600">Dias de Suspensão *</label>
                  <Input type="number" min={1} max={30} className="mt-1" value={advForm.diasSuspensao || ""} onChange={e => setAdvForm({ ...advForm, diasSuspensao: parseInt(e.target.value) || 0 })} placeholder="1 a 30 dias (Art. 474 CLT)" />
                </div>
              )}
            </div>
            {advForm.tipoAdvertencia === "Verbal" && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 mt-4">
                <p className="font-medium">Advertência Verbal — Apenas Registro</p>
                <p className="text-xs mt-1">Registrada no sistema para controle, sem documento formal ou testemunhas.</p>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-lg bg-orange-500 flex items-center justify-center"><MessageSquare className="h-3.5 w-3.5 text-white" /></div>
              <h3 className="text-sm font-semibold text-gray-800">Motivo e Descrição</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Motivo *</label>
                <Textarea className="mt-1" value={advForm.motivo || ""} onChange={e => setAdvForm({ ...advForm, motivo: e.target.value })} rows={2} placeholder="Descreva o motivo da advertência..." />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Descrição Detalhada</label>
                <Textarea className="mt-1" value={advForm.descricao || ""} onChange={e => setAdvForm({ ...advForm, descricao: e.target.value })} rows={3} />
              </div>
            </div>
          </div>

          {advForm.tipoAdvertencia !== "Verbal" && (
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded-lg bg-slate-600 flex items-center justify-center"><Users className="h-3.5 w-3.5 text-white" /></div>
                <h3 className="text-sm font-semibold text-gray-800">Testemunhas</h3>
              </div>
              <div className="space-y-3">
                {[1, 2, 3].map(n => (
                  <div key={n} className="grid grid-cols-2 gap-3 p-3 bg-gray-50/80 rounded-lg border border-gray-100">
                    <div>
                      <label className="text-xs font-medium text-gray-500">Nome Testemunha {n}</label>
                      <Input
                        className="mt-1"
                        value={advForm[`testemunha${n}Nome`] || ""}
                        onChange={e => setAdvForm({ ...advForm, [`testemunha${n}Nome`]: e.target.value })}
                        placeholder={`Nome completo da testemunha ${n}`}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500">CPF ou RG</label>
                      <Input
                        className="mt-1"
                        value={advForm[`testemunha${n}Doc`] || ""}
                        onChange={e => setAdvForm({ ...advForm, [`testemunha${n}Doc`]: e.target.value })}
                        placeholder="CPF ou RG"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 pb-4">
            <Button variant="outline" size="lg" onClick={() => { setShowAdvDialog(false); setEditingAdvId(null); setAdvEmployeeCount(null); }}>Cancelar</Button>
            <Button size="lg" className="px-8 shadow-md" onClick={handleSubmitAdv} disabled={createAdv.isPending || updateAdv.isPending}>
              {(createAdv.isPending || updateAdv.isPending) ? "Salvando..." : editingAdvId ? "Atualizar" : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* ===================== DIALOG: IMPORTAR ASO ===================== */}

      {/* ===================== DIALOG: VISUALIZAR DOCUMENTO CLT ===================== */}
      {/* ===================== VISUALIZAÇÃO FULL SCREEN DO DOCUMENTO ===================== */}
      {showAdvPreview && previewAdvData && (() => {
        const a = previewAdvData;
        const logoUrl = "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/supdCjdqVnpMeKVZ.png";
        const tipo = a.tipoAdvertencia === "Suspensao" ? "Suspensão" : a.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : a.tipoAdvertencia;
        const tipoTitulo = a.tipoAdvertencia === "Suspensao" ? "SUSPENSÃO DISCIPLINAR" : a.tipoAdvertencia === "JustaCausa" ? "RESCISÃO POR JUSTA CAUSA" : a.tipoAdvertencia === "Escrita" ? "ADVERTÊNCIA POR ESCRITO" : "ADVERTÊNCIA VERBAL";
        const verbo = a.tipoAdvertencia === "Suspensao" ? "SUSPENDER" : a.tipoAdvertencia === "JustaCausa" ? "COMUNICAR A RESCISÃO POR JUSTA CAUSA de" : "ADVERTIR";
        const anteriores = a.anteriores || [];
        const numAdv = a.sequencia || (anteriores.length + 1);
        const testemunhasArr: {nome: string; doc: string}[] = a.testemunhasArr || ((): {nome: string; doc: string}[] => { try { return JSON.parse(a.testemunhas || "[]"); } catch { return []; } })();
        return (
          <div className="fixed inset-0 z-50 bg-white flex flex-col">
            {/* Header fixo */}
            <div className="bg-[#1e3a6e] text-white px-6 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <img src={logoUrl} alt="Logo da Empresa" className="h-12 object-contain" />
                <div>
                  <h2 className="text-lg font-bold">{tipoTitulo}</h2>
                  <p className="text-xs text-blue-200">{numAdv}ª medida disciplinar — {a.nomeCompleto}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" className="gap-2 bg-white text-blue-800 hover:bg-blue-50" onClick={() => {
                  const advId = a.id || lastCreatedAdvId;
                  if (!advId) {
                    toast.error("Aguarde o salvamento da advertência terminar antes de assinar.");
                    return;
                  }
                  setAdvAssinaturasData({
                    advertenciaId: advId,
                    nomeFuncionario: a.nomeCompleto,
                    nomeAplicador: a.aplicadoPor || authUser?.name || "Responsável",
                    testemunhasIniciais: testemunhasArr,
                    assinaturaFuncionarioUrl: a.assinaturaFuncionarioUrl,
                    assinaturaAplicadorUrl: a.assinaturaAplicadorUrl,
                  });
                  setShowAdvAssinaturas(true);
                }}>
                  <PenTool className="h-4 w-4" /> Assinaturas Digitais
                </Button>
                <Button size="sm" className="gap-2 bg-white text-blue-800 hover:bg-blue-50" onClick={() => {
                  const userName = authUser?.name || authUser?.username || "Usuário";
                  const dataEmissao = nowBrasilia();
                  const t1 = testemunhasArr[0] || { nome: "", doc: "" };
                  const t2 = testemunhasArr[1] || { nome: "", doc: "" };
                  const t3 = testemunhasArr[2] || { nome: "", doc: "" };
                  // Rev. 2747 — quando há template Vigente (advertencia), monta a partir dele; senão fallback EXATO.
                  const advVigenteHtml = advTplQ.data?.vigente ? advTplQ.data.conteudoHtml : null;
                  if (advVigenteHtml) {
                    const escA = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" } as any)[c]);
                    const tipoAdvLbl = a.tipoAdvertencia === "Escrita" ? "POR ESCRITO" : a.tipoAdvertencia === "Suspensao" ? "— SUSPENSÃO DISCIPLINAR" : a.tipoAdvertencia === "JustaCausa" ? "— JUSTA CAUSA" : tipo.toUpperCase();
                    const dadosA: Record<string, string> = {
                      empresaRazaoSocial: escA(nomeEmpresaCompleto), empresaCnpj: escA((selectedCompany as any)?.cnpj || ""),
                      empNome: escA(a.nomeCompleto), empCpf: escA(formatCPF(a.cpf)), empFuncao: escA(a.funcao || "N/I"),
                      tipoAdv: escA(tipoAdvLbl), ocorrenciaData: escA(formatDate(a.dataOcorrencia)),
                      motivo: escA(a.motivo + (a.descricao ? " — " + a.descricao : "")), baseLegal: "Art. 482 da CLT",
                    };
                    const htmlVig = buildFcDocument({
                      empresa: { razaoSocial: nomeEmpresaCompleto, cnpj: (selectedCompany as any)?.cnpj || "", endereco: (selectedCompany as any)?.endereco, cidade: (selectedCompany as any)?.cidade, estado: (selectedCompany as any)?.estado, logoUrl: companyLogoUrl },
                      titulo: tipoTitulo, numero: `${numAdv}ª MEDIDA`, dataEmissao,
                      assunto: { label: "ASSUNTO:", valor: `${tipoTitulo} — ${a.nomeCompleto}` },
                      corpoHtml: renderTemplate(advVigenteHtml, dadosA),
                      assinaturas: { partes: [{ nome: "Empregador / Representante Legal", subtitulo: nomeEmpresaCompleto }, { nome: a.nomeCompleto, subtitulo: "Colaborador(a)" }] },
                      geradoPor: userName, pageTitle: tipoTitulo,
                    });
                    const wv = window.open("", "_blank");
                    if (wv) { wv.document.write(htmlVig); wv.document.write(`<script>setTimeout(function(){window.print()},500)<\/script>`); wv.document.close(); }
                    return;
                  }
                  const printHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${tipoTitulo}</title>
                  <style>
                    @page { size: A4 portrait; margin: 20mm 18mm 25mm 18mm; }
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Times New Roman', serif; font-size: 12.5px; color: #000; line-height: 1.7; }
                    .logo-bar { background: #1e3a6e; padding: 12px 20px; display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
                    .logo-bar img { height: 50px; }
                    .logo-bar .title { color: white; }
                    .logo-bar .title h1 { font-size: 16px; font-weight: bold; letter-spacing: 2px; }
                    .logo-bar .title p { font-size: 10px; opacity: 0.8; }
                    .num-badge { background: #dc2626; color: white; font-size: 11px; font-weight: bold; padding: 3px 10px; border-radius: 4px; margin-left: auto; }
                    .doc-body { text-align: justify; padding: 0 10px; }
                    .doc-body p { margin-bottom: 14px; text-indent: 35px; }
                    .motivo-box { background: #f8f8f8; border-left: 4px solid #1e3a6e; padding: 10px 14px; margin: 14px 0; text-indent: 0 !important; font-style: italic; }
                    .historico { margin: 14px 0; text-indent: 0 !important; }
                    .historico li { margin-left: 35px; margin-bottom: 3px; }
                    .signatures { margin-top: 50px; padding: 0 10px; }
                    .sig-row { display: flex; justify-content: space-between; margin-bottom: 40px; }
                    .sig-block { text-align: center; width: 45%; }
                    .sig-block .line { border-top: 1px solid #000; padding-top: 4px; font-size: 10px; }
                    .sig-row-3 { display: flex; justify-content: space-between; margin-bottom: 40px; }
                    .sig-block-3 { text-align: center; width: 30%; }
                    .sig-block-3 .line { border-top: 1px solid #000; padding-top: 4px; font-size: 10px; }
                    .footer { position: fixed; bottom: 0; left: 0; right: 0; padding: 6px 18mm; border-top: 2px solid #1e3a6e; font-size: 8.5px; display: flex; justify-content: space-between; background: white; }
                    .footer .lgpd { color: #dc2626; font-weight: 600; }
                  </style></head><body>
                  <div class="logo-bar">
                    <img src="${window.location.origin}/logo-fc-branco-amarelo.png?v=1712" alt="FC Engenharia" />
                    <div class="title"><h1>${tipoTitulo}</h1><p>${nomeEmpresaCompleto}</p></div>
                    <span class="num-badge">${numAdv}ª MEDIDA</span>
                  </div>
                  <div class="doc-body">
                    <p>Pelo presente instrumento, a empresa <strong>${nomeEmpresaCompleto}</strong>, vem por meio deste ${verbo} o(a) colaborador(a) <strong>${a.nomeCompleto}</strong>, portador(a) do CPF nº <strong>${formatCPF(a.cpf)}</strong>, ocupante do cargo de <strong>${a.funcao || "N/I"}</strong>, lotado(a) no setor <strong>${a.setor || "OBRA"}</strong>${a.tipoAdvertencia === "Suspensao" && a.diasSuspensao ? `, pelo período de <strong style="color: #dc2626; background: #fef2f2; padding: 2px 6px; border-radius: 3px;">${a.diasSuspensao} dia(s)</strong>, a contar de <strong style="color: #dc2626;">${a.dataInicio ? formatDate(a.dataInicio) : '___/___/______'}</strong> até <strong style="color: #dc2626;">${a.dataFim ? formatDate(a.dataFim) : '___/___/______'}</strong>,` : ""} pelo seguinte motivo:</p>
                    <div class="motivo-box">${a.motivo}${a.descricao ? "<br/><br/>" + a.descricao : ""}</div>
                    <p>Ocorrido em <strong>${formatDate(a.dataOcorrencia)}</strong>.</p>
                    <p style="text-indent:0; font-weight:bold; color:#1e3a6e;">Esta é a ${numAdv}ª medida disciplinar aplicada a este(a) colaborador(a).</p>
                    ${anteriores.length > 0 ? `<p>Registramos que o(a) colaborador(a) já recebeu as seguintes medidas disciplinares anteriores:</p><div class="historico"><ul>${anteriores.map((prev: any, pi: number) => `<li>${pi + 1}ª ${prev.tipoAdvertencia === "Suspensao" ? "Suspensão" : prev.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : prev.tipoAdvertencia} em ${formatDate(prev.dataOcorrencia)} — ${prev.motivo}</li>`).join("")}</ul></div>` : ""}
                    <p>${a.tipoAdvertencia === "Suspensao" ? "A presente suspensão é aplicada com fundamento no Art. 474 da CLT, que limita a suspensão disciplinar a no máximo 30 (trinta) dias consecutivos. Durante o período de suspensão, o(a) colaborador(a) não deverá comparecer ao local de trabalho e terá os dias descontados de sua remuneração." : a.tipoAdvertencia === "JustaCausa" ? "Após esgotadas todas as medidas socioeducativas e disciplinares previstas, e diante da reincidência e/ou gravidade da falta cometida, a empresa não encontra outra alternativa senão a aplicação da penalidade máxima, com fundamento no Art. 482 da CLT." : "Esclarecemos que a presente advertência tem caráter educativo e visa orientar o(a) colaborador(a) sobre a conduta esperada, conforme previsto no Art. 482 da CLT e no regulamento interno da empresa."}</p>
                    <p>${a.tipoAdvertencia !== "JustaCausa" ? "A reincidência poderá acarretar a aplicação de penalidades mais severas, incluindo " + (a.tipoAdvertencia === "Suspensao" ? "rescisão do contrato de trabalho por justa causa." : "advertência por escrito, suspensão disciplinar e, em último caso, rescisão do contrato de trabalho por justa causa.") : "O(A) colaborador(a) deverá comparecer ao Departamento Pessoal para as providências de rescisão contratual."}</p>
                    <p>O(A) colaborador(a) declara estar ciente desta ${tipo.toLowerCase()} e compromete-se a adequar sua conduta.</p>
                    <p style="text-indent:0; margin-top: 25px;">_________________, ${todayBrasiliaLong()}.</p>
                  </div>
                  <div class="signatures">
                    <div class="sig-row">
                      <div class="sig-block"><div class="line">Empregador / Representante Legal</div></div>
                      <div class="sig-block"><div class="line">${a.nomeCompleto}<br/>Colaborador(a)</div></div>
                    </div>
                    <div class="sig-row-3">
                      <div class="sig-block-3"><div class="line">Testemunha 1${t1.nome ? "<br/><strong>" + t1.nome + "</strong>" : ""}${t1.doc ? "<br/>" + t1.doc : ""}</div></div>
                      <div class="sig-block-3"><div class="line">Testemunha 2${t2.nome ? "<br/><strong>" + t2.nome + "</strong>" : ""}${t2.doc ? "<br/>" + t2.doc : ""}</div></div>
                      <div class="sig-block-3"><div class="line">Testemunha 3${t3.nome ? "<br/><strong>" + t3.nome + "</strong>" : ""}${t3.doc ? "<br/>" + t3.doc : ""}</div></div>
                    </div>
                  </div>
                  <div class="footer">
                    <span>ERP - Gestão Integrada</span>
                    <span>Documento gerado por: <strong>${userName}</strong> em ${dataEmissao}</span>
                    <span class="lgpd">LGPD (Lei 13.709/2018) — Uso restrito e confidencial.</span>
                  </div>
                  </body></html>`;
                  const w = window.open("", "_blank");
                  if (w) { w.document.write(printHtml); w.document.close(); setTimeout(() => w.print(), 500); }
                }}>
                  <Printer className="h-4 w-4" /> Imprimir
                </Button>
                <Button size="sm" variant="outline" className="gap-2 bg-white/10 text-white border-white/30 hover:bg-white/20" onClick={() => {
                  if (lastCreatedAdvId) handleUploadDoc("adv", lastCreatedAdvId);
                  else toast.info("Salve a advertência primeiro para anexar o documento assinado.");
                }}>
                  <Upload className="h-4 w-4" /> Upload Assinado
                </Button>
                <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => { setShowAdvPreview(false); setPreviewAdvData(null); setLastCreatedAdvId(null); }}>
                  <X className="h-4 w-4" /> Fechar
                </Button>
              </div>
            </div>

            {/* Conteúdo scrollável */}
            <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
              <div className="max-w-[800px] mx-auto bg-white shadow-xl" style={{ fontFamily: "'Times New Roman', serif" }}>
                {/* Logo bar */}
                <div className="bg-[#1e3a6e] p-4 flex items-center gap-4">
                  <img src="/logo-fc-branco-amarelo.png?v=1712" alt="FC Engenharia" className="h-14 object-contain" />
                  <div className="text-white">
                    <h2 className="text-lg font-bold tracking-widest">{tipoTitulo}</h2>
                    <p className="text-xs text-blue-200">{nomeEmpresaCompleto}</p>
                  </div>
                  <span className="ml-auto bg-red-600 text-white text-xs font-bold px-3 py-1 rounded">{numAdv}ª MEDIDA</span>
                </div>

                {/* Corpo do documento */}
                <div className="p-8 text-justify leading-relaxed text-sm space-y-4">
                  <p className="indent-10">Pelo presente instrumento, a empresa <strong>{nomeEmpresaCompleto}</strong>, vem por meio deste {verbo} o(a) colaborador(a) <strong>{a.nomeCompleto}</strong>, portador(a) do CPF nº <strong>{formatCPF(a.cpf)}</strong>, ocupante do cargo de <strong>{a.funcao || "N/I"}</strong>, lotado(a) no setor <strong>{a.setor || "OBRA"}</strong>{a.tipoAdvertencia === "Suspensao" && a.diasSuspensao ? <>, pelo período de <strong className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{a.diasSuspensao} dia(s)</strong>, a contar de <strong className="text-red-600">{a.dataInicio ? formatDate(a.dataInicio) : '___/___/______'}</strong> até <strong className="text-red-600">{a.dataFim ? formatDate(a.dataFim) : '___/___/______'}</strong>,</> : null} pelo seguinte motivo:</p>
                  
                  <div className="bg-gray-50 border-l-4 border-[#1e3a6e] p-4 italic">
                    <p className="font-semibold">{a.motivo}</p>
                    {a.descricao && <p className="mt-2 text-gray-600">{a.descricao}</p>}
                  </div>

                  <p className="indent-10">Ocorrido em <strong>{formatDate(a.dataOcorrencia)}</strong>.</p>

                  <p className="font-bold text-[#1e3a6e]">Esta é a {numAdv}ª medida disciplinar aplicada a este(a) colaborador(a).</p>

                  {anteriores.length > 0 && (
                    <>
                      <p className="indent-10">Registramos que o(a) colaborador(a) já recebeu as seguintes medidas disciplinares anteriores:</p>
                      <ul className="ml-10 list-disc space-y-1">
                        {anteriores.map((prev: any, pi: number) => (
                          <li key={pi}>{pi + 1}ª {prev.tipoAdvertencia === "Suspensao" ? "Suspensão" : prev.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : prev.tipoAdvertencia} em {formatDate(prev.dataOcorrencia)} — {prev.motivo}</li>
                        ))}
                      </ul>
                    </>
                  )}

                  <p className="indent-10">
                    {a.tipoAdvertencia === "Suspensao" ? "A presente suspensão é aplicada com fundamento no Art. 474 da CLT, que limita a suspensão disciplinar a no máximo 30 (trinta) dias consecutivos. Durante o período de suspensão, o(a) colaborador(a) não deverá comparecer ao local de trabalho e terá os dias descontados de sua remuneração." : a.tipoAdvertencia === "JustaCausa" ? "Após esgotadas todas as medidas socioeducativas e disciplinares previstas, e diante da reincidência e/ou gravidade da falta cometida, a empresa não encontra outra alternativa senão a aplicação da penalidade máxima, com fundamento no Art. 482 da CLT." : "Esclarecemos que a presente advertência tem caráter educativo e visa orientar o(a) colaborador(a) sobre a conduta esperada, conforme previsto no Art. 482 da CLT e no regulamento interno da empresa."}
                  </p>
                  <p className="indent-10">
                    {a.tipoAdvertencia !== "JustaCausa" ? "A reincidência poderá acarretar a aplicação de penalidades mais severas, incluindo " + (a.tipoAdvertencia === "Suspensao" ? "rescisão do contrato de trabalho por justa causa." : "advertência por escrito, suspensão disciplinar e, em último caso, rescisão do contrato de trabalho por justa causa.") : "O(A) colaborador(a) deverá comparecer ao Departamento Pessoal para as providências de rescisão contratual."}
                  </p>
                  <p className="indent-10">O(A) colaborador(a) declara estar ciente desta {tipo.toLowerCase()} e compromete-se a adequar sua conduta.</p>
                  <p className="mt-6">_________________, {todayBrasiliaLong()}.</p>

                  {/* Assinaturas */}
                  <div className="mt-16 space-y-12">
                    <div className="flex justify-between">
                      <div className="text-center w-[45%]"><div className="border-t border-black pt-1 text-xs">Empregador / Representante Legal</div></div>
                      <div className="text-center w-[45%]"><div className="border-t border-black pt-1 text-xs">{a.nomeCompleto}<br />Colaborador(a)</div></div>
                    </div>
                    <div className="flex justify-between">
                      {[0, 1, 2].map(i => {
                        const t = testemunhasArr[i] || { nome: "", doc: "" };
                        return (
                          <div key={i} className="text-center w-[30%]">
                            <div className="border-t border-black pt-1 text-xs">
                              Testemunha {i + 1}
                              {t.nome && <><br /><strong>{t.nome}</strong></>}
                              {t.doc && <><br />{t.doc}</>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer LGPD */}
                  <div className="mt-8 pt-3 border-t-2 border-[#1e3a6e] flex justify-between text-[9px] text-gray-500">
                    <span>ERP - Gestão Integrada</span>
                    <span>Documento gerado por: <strong>{authUser?.name || authUser?.username || "Usuário"}</strong> em {nowBrasilia()}</span>
                    <span className="text-red-600 font-semibold">LGPD (Lei 13.709/2018) — Uso restrito e confidencial.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===================== PREVIEW ATESTADO ===================== */}
      <DocumentPreviewDialog
        open={!!atestPreviewDoc}
        onOpenChange={(open) => { if (!open) setAtestPreviewDoc(null); }}
        fileUrl={atestPreviewDoc?.url || null}
        fileName={atestPreviewDoc?.name || null}
        title={atestPreviewDoc?.title}
      />

      {/* ===================== RAIO-X DO FUNCIONÁRIO ===================== */}
      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />

      {/* ===================== ASSINATURAS DIGITAIS — ADVERTÊNCIA ===================== */}
      {showAdvAssinaturas && advAssinaturasData && (
        <AdvAssinaturas
          open={showAdvAssinaturas}
          onClose={() => { setShowAdvAssinaturas(false); setAdvAssinaturasData(null); }}
          advertenciaId={advAssinaturasData.advertenciaId}
          nomeFuncionario={advAssinaturasData.nomeFuncionario}
          nomeAplicador={advAssinaturasData.nomeAplicador}
          testemunhasIniciais={advAssinaturasData.testemunhasIniciais || []}
          assinaturaFuncionarioUrl={advAssinaturasData.assinaturaFuncionarioUrl}
          assinaturaAplicadorUrl={advAssinaturasData.assinaturaAplicadorUrl}
          onUpdate={() => refetchAdv()}
        />
      )}

          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
