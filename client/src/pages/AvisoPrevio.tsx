import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { PersonPhoto } from "@/components/PersonPhoto";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import FullScreenDialog from "@/components/FullScreenDialog";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { formatCPF, formatMoeda, fmtNum } from "@/lib/formatters";
import { removeAccents } from "@/lib/searchUtils";
import { buildFcDocument } from "@/lib/fcDocumentTemplate";
import { renderTemplate } from "@shared/documentTemplates";
import {
  AlertTriangle, Plus, Search, Clock, Calendar, DollarSign,
  Users, Trash2, Pencil, Eye, X, FileText, ArrowRight,
  CheckCircle2, XCircle, Timer, Ban, ChevronsUpDown, Check, Download, Printer, RefreshCw, RotateCcw,
  UserX, ShieldAlert, Edit2, Briefcase, Save, MinusCircle, PlusCircle, Link, Upload, Loader2, FileCheck, TrendingUp,
  UserCheck, ImageOff,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

const TIPO_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  empregador_trabalhado: { label: "Empregador (Trabalhado)", color: "text-blue-700", bg: "bg-blue-100" },
  empregador_indenizado: { label: "Empregador (Indenizado)", color: "text-purple-700", bg: "bg-purple-100" },
  empregado_trabalhado: { label: "Empregado (Trabalhado)", color: "text-amber-700", bg: "bg-amber-100" },
  empregado_indenizado: { label: "Empregado (Indenizado)", color: "text-orange-700", bg: "bg-orange-100" },
};

const TIPO_LABELS_PEDIDO: Record<string, { label: string; color: string; bg: string }> = {
  empregado_trabalhado: { label: "Cumprindo Aviso", color: "text-blue-700", bg: "bg-blue-100" },
  empregado_indenizado: { label: "Não Cumpriu Aviso", color: "text-red-700", bg: "bg-red-100" },
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  em_andamento:         { label: "Em Andamento",         color: "text-blue-700",   bg: "bg-blue-100",   icon: Timer },
  aguardando_pagamento: { label: "Aguardando Baixa",      color: "text-amber-700",  bg: "bg-amber-100",  icon: Timer },
  concluido:            { label: "Concluído",             color: "text-green-700",  bg: "bg-green-100",  icon: CheckCircle2 },
  cancelado:            { label: "Cancelado",             color: "text-red-700",    bg: "bg-red-100",    icon: XCircle },
};

const REDUCAO_LABELS: Record<string, string> = {
  "2h_dia": "2 horas/dia (Art. 488 CLT)",
  "7_dias_corridos": "7 dias corridos (Art. 488 CLT)",
  nenhuma: "Nenhuma",
};

export type AvisoPrevioMode = "aviso_previo" | "pedido_demissao";

export default function AvisoPrevio({ mode = "aviso_previo" }: { mode?: AvisoPrevioMode }) {
  const isPedidoDemissao = mode === "pedido_demissao";
  const { selectedCompanyId, selectedCompany, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const { user } = useAuth();
  // Rev. 2747 — geradores consomem o template Vigente quando existir (fallback HTML atual).
  const avisoTplQ = trpc.systemDocumentTemplates.getVigente.useQuery({ tipo: "aviso_previo" });
  const rescisaoTplQ = trpc.systemDocumentTemplates.getVigente.useQuery({ tipo: "termo_rescisao" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("em_andamento");
  const [showDialog, setShowDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [confirmEncerrar, setConfirmEncerrar] = useState<{ open: boolean; avisoId: number | null }>({ open: false, avisoId: null });
  const [confirmExcluir, setConfirmExcluir] = useState<{ open: boolean; avisoId: number | null }>({ open: false, avisoId: null });
  const [confirmCancelar, setConfirmCancelar] = useState<{ open: boolean; avisoId: number | null; nomeFunc: string }>({ open: false, avisoId: null, nomeFunc: '' });
  const [cancelarMotivo, setCancelarMotivo] = useState('');
  // Rev. 2078 — Foto do colaborador ao lado do nome + modal de ampliação ao clicar
  const [fotoZoom, setFotoZoom] = useState<{ url: string | null; nome: string } | null>(null);
  const [fotoLoadError, setFotoLoadError] = useState(false);
  useEffect(() => { setFotoLoadError(false); }, [fotoZoom?.url]);
  const getInitials = (nome: string): string => {
    if (!nome) return "?";
    const parts = nome.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Modal "Dar Baixa"
  const [darBaixaModal, setDarBaixaModal] = useState<{ open: boolean; avisoId: number | null; funcionarioNome: string; avisoData: any }>({ open: false, avisoId: null, funcionarioNome: '', avisoData: null });
  const [darBaixaForm, setDarBaixaForm] = useState({
    tipo: 'rescisao' as 'rescisao' | 'fgts' | 'complementar',
    valor: '',
    observacoes: '',
    desligarFuncionario: false,
    categoriaDesligamento: '',
    motivoDesligamento: '',
    incluirListaNegra: false,
    motivoListaNegra: '',
  });

  const isMaster = user?.role === 'admin_master';

  const [editarBaixaDialog, setEditarBaixaDialog] = useState<{ open: boolean; avisoId: number | null; tipo: 'rescisao' | 'fgts' | 'complementar'; valorAtual: string; obs: string }>({ open: false, avisoId: null, tipo: 'rescisao', valorAtual: '', obs: '' });
  const [estornarBaixaDialog, setEstornarBaixaDialog] = useState<{ open: boolean; avisoId: number | null; tipo: 'rescisao' | 'fgts' | 'complementar'; valor: string; motivo: string }>({ open: false, avisoId: null, tipo: 'rescisao', valor: '', motivo: '' });

  // Form state
  const [form, setForm] = useState<any>({});
  const [calculoPreview, setCalculoPreview] = useState<any>(null);

  // Queries
  // Query filtrada para a tabela
  const { data: avisosList = [], refetch, isLoading: isLoadingAvisos, isFetching: isFetchingAvisos } = trpc.avisoPrevio.avisoPrevio.list.useQuery(
    { companyId, companyIds, ...(statusFilter !== "todos" ? { status: statusFilter } : {}) },
    { enabled: !!companyId || (companyIds && companyIds.length > 0), placeholderData: (prev: any) => prev }
  );
  // Query sem filtro para os cards de resumo (totais globais)
  const { data: allAvisosForStats = [] } = trpc.avisoPrevio.avisoPrevio.list.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId || (companyIds && companyIds.length > 0) }
  );
  const modeFilter = useMemo(() => (list: any[]) => {
    if (!isPedidoDemissao) return list.filter((a: any) => !a.tipo?.startsWith('empregado_'));
    return list.filter((a: any) => a.tipo?.startsWith('empregado_'));
  }, [isPedidoDemissao]);
  const filteredAvisos = useMemo(() => modeFilter(avisosList as any[]), [avisosList, modeFilter]);
  const filteredAllForStats = useMemo(() => modeFilter(allAvisosForStats as any[]), [allAvisosForStats, modeFilter]);

  const { data: empList = [] } = trpc.employees.list.useQuery({ companyId, companyIds, excludeTerminated: true }, { enabled: !!companyId || companyIds?.length > 0 });
  // Rev. 1727: incluir todos os colaboradores não-desligados (Ativo, Ferias, Afastado, Licenca, Recluso)
  // pra permitir simulação de aviso prévio em qualquer cenário. Só corta Desligado/Lista_Negra e soft-deleted.
  const activeEmployees = useMemo(() => (empList as any[]).filter((e: any) => {
    if (e.deletedAt) return false;
    if (e.status === "Desligado" || e.status === "Lista_Negra" || e.status === "ListaNegra") return false;
    if (e.listaNegra === 1 || e.listaNegra === true) return false;
    return true;
  }), [empList]);

  const cipaCheckQ = trpc.cipa.checkEstabilidade.useQuery(
    { employeeId: form.employeeId! },
    { enabled: !!form.employeeId }
  );

  // tRPC utils for imperative queries & invalidation
  const utils = trpc.useUtils();

  // Mutations
  const createAviso = trpc.avisoPrevio.avisoPrevio.create.useMutation({
    onSuccess: (data: any) => {
      refetch();
      utils.obras.efetivoPorObra.invalidate();
      toast.success(`Aviso prévio criado! ${data.diasAviso} dias, término: ${formatDate(data.dataFim)}`);
      setShowDialog(false);
      setForm({});
      setCalculoPreview(null);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const updateAviso = trpc.avisoPrevio.avisoPrevio.update.useMutation({
    onSuccess: () => { refetch(); utils.obras.efetivoPorObra.invalidate(); toast.success("Aviso prévio atualizado!"); },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar aviso prévio"),
  });
  const deleteAviso = trpc.avisoPrevio.avisoPrevio.delete.useMutation({
    onSuccess: () => { refetch(); utils.obras.efetivoPorObra.invalidate(); toast.success("Aviso prévio excluído!"); },
  });
  const revertConcluido = trpc.avisoPrevio.avisoPrevio.revertConcluido.useMutation({
    onSuccess: () => { refetch(); utils.obras.efetivoPorObra.invalidate(); toast.success("Status revertido para Em Andamento!"); },
    onError: (err) => { toast.error(err.message || "Erro ao reverter status"); },
  });
  const revertAllConcluidos = trpc.avisoPrevio.avisoPrevio.revertAllConcluidos.useMutation({
    onSuccess: () => {
      refetch();
      utils.obras.efetivoPorObra.invalidate();
      toast.success("Todos os avisos foram reativados — aguardando baixa manual.");
      setStatusFilter("aguardando_pagamento");
    },
    onError: (err) => { toast.error(err.message || "Erro ao reativar avisos"); },
  });
  const editarBaixa = trpc.avisoPrevio.avisoPrevio.editarBaixa.useMutation({
    onSuccess: () => {
      refetch();
      setEditarBaixaDialog({ open: false, avisoId: null, tipo: 'rescisao', valorAtual: '', obs: '' });
      setShowDetailDialog(false);
      setSelectedItem(null);
      toast.success("Valor da baixa atualizado!");
    },
    onError: (err) => toast.error(err.message || "Erro ao editar baixa"),
  });
  const estornarBaixa = trpc.avisoPrevio.avisoPrevio.estornarBaixa.useMutation({
    onSuccess: (res: any) => {
      refetch();
      setEstornarBaixaDialog({ open: false, avisoId: null, tipo: 'rescisao', valor: '', motivo: '' });
      setShowDetailDialog(false);
      setSelectedItem(null);
      toast.success(res?.reabriu ? "Baixa estornada! Status voltou para Aguardando Pagamento." : "Baixa estornada com sucesso!");
    },
    onError: (err) => toast.error(err.message || "Erro ao estornar baixa"),
  });
  const darBaixa = trpc.avisoPrevio.avisoPrevio.darBaixa.useMutation({
    onSuccess: (res: any) => {
      refetch();
      utils.obras.efetivoPorObra.invalidate();
      utils.employees.list.invalidate();
      if (res?.concluido) {
        const msg = res?.desligouFuncionario
          ? "Baixa registrada e funcionário desligado com sucesso!"
          : "Processo concluído! Todas as baixas registradas.";
        toast.success(msg);
        setDarBaixaModal({ open: false, avisoId: null, funcionarioNome: '', avisoData: null });
      } else {
        toast.success(`Baixa da ${darBaixaForm.tipo === 'rescisao' ? 'rescisão' : darBaixaForm.tipo === 'fgts' ? 'multa FGTS' : 'rescisão complementar'} registrada! Aguardando demais baixas.`);
        setDarBaixaModal({ open: false, avisoId: null, funcionarioNome: '', avisoData: null });
      }
      setDarBaixaForm({ tipo: 'rescisao', valor: '', observacoes: '', desligarFuncionario: false, categoriaDesligamento: '', motivoDesligamento: '', incluirListaNegra: false, motivoListaNegra: '' });
    },
    onError: (err) => { toast.error(err.message || "Erro ao dar baixa"); },
  });

  // Novos: FGTS Real, Acerto, Novo Emprego
  const [fgtsEditDialog, setFgtsEditDialog] = useState<{ open: boolean; valor: string }>({ open: false, valor: '' });
  const [acertoForm, setAcertoForm] = useState<{ descontosAcerto: string; descontosAcertoDesc: string; acrescimosAcerto: string; acrescimosAcertoDesc: string; mediaInsalubridade: string; mediaHorasExtras: string }>({ descontosAcerto: '', descontosAcertoDesc: '', acrescimosAcerto: '', acrescimosAcertoDesc: '', mediaInsalubridade: '', mediaHorasExtras: '' });
  const [novoEmpregoForm, setNovoEmpregoForm] = useState<{ ativo: boolean; comunicadoEm: string; cartaUrl: string }>({ ativo: false, comunicadoEm: '', cartaUrl: '' });
  const [savingAcerto, setSavingAcerto] = useState(false);
  const [savingNovoEmprego, setSavingNovoEmprego] = useState(false);
  const [uploadingCarta, setUploadingCarta] = useState(false);
  const cartaFileRef = useRef<HTMLInputElement>(null);
  // Rev. 1806 — Anexo do AVISO ASSINADO pelo colaborador
  const [uploadingAvisoAssinado, setUploadingAvisoAssinado] = useState(false);
  const avisoAssinadoFileRef = useRef<HTMLInputElement>(null);

  const refreshSelectedItem = async (id: number) => {
    try {
      const detail = await utils.avisoPrevio.avisoPrevio.getById.fetch({ id });
      if (detail) {
        setSelectedItem(detail);
        // Sincronizar forms com dados frescos
        setAcertoForm({
          descontosAcerto: (detail as any).descontosAcerto || '',
          descontosAcertoDesc: (detail as any).descontosAcertoDesc || '',
          acrescimosAcerto: (detail as any).acrescimosAcerto || '',
          acrescimosAcertoDesc: (detail as any).acrescimosAcertoDesc || '',
          mediaInsalubridade: (detail as any).mediaInsalubridade || '',
          mediaHorasExtras: (detail as any).mediaHorasExtras || '',
        });
        setNovoEmpregoForm({
          ativo: !!(detail as any).novoEmpregoAtivo,
          comunicadoEm: (detail as any).novoEmpregoComunicadoEm || '',
          cartaUrl: (detail as any).novoEmpregoCartaUrl || '',
        });
      }
    } catch (e) { console.error('Erro ao recarregar detalhes:', e); }
  };

  const editarFgtsReal = trpc.avisoPrevio.avisoPrevio.editarFgtsReal.useMutation({
    onSuccess: async () => {
      toast.success('FGTS real atualizado!');
      setFgtsEditDialog({ open: false, valor: '' });
      if (selectedItem?.id) { refetch(); await refreshSelectedItem(selectedItem.id); }
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao salvar FGTS real'),
  });

  const editarAcerto = trpc.avisoPrevio.avisoPrevio.editarAcerto.useMutation({
    onSuccess: async () => {
      toast.success('Acerto atualizado!');
      setSavingAcerto(false);
      if (selectedItem?.id) { refetch(); await refreshSelectedItem(selectedItem.id); }
    },
    onError: (e: any) => { toast.error(e.message || 'Erro ao salvar acerto'); setSavingAcerto(false); },
  });

  const ativarNovoEmprego = trpc.avisoPrevio.avisoPrevio.ativarNovoEmprego.useMutation({
    onSuccess: async () => {
      toast.success('Situação de novo emprego atualizada!');
      setSavingNovoEmprego(false);
      if (selectedItem?.id) { refetch(); await refreshSelectedItem(selectedItem.id); }
    },
    onError: (e: any) => { toast.error(e.message || 'Erro ao salvar novo emprego'); setSavingNovoEmprego(false); },
  });

  const uploadCartaMutation = trpc.avisoPrevio.avisoPrevio.uploadCartaNovoEmprego.useMutation({
    onSuccess: async (result) => {
      toast.success('Arquivo enviado com sucesso!');
      setNovoEmpregoForm(f => ({ ...f, cartaUrl: result.url }));
      setUploadingCarta(false);
      if (selectedItem?.id) { refetch(); await refreshSelectedItem(selectedItem.id); }
    },
    onError: (e: any) => { toast.error(e.message || 'Erro ao enviar arquivo'); setUploadingCarta(false); },
  });

  // Rev. 1806 — Mutations Aviso Assinado pelo colaborador
  const uploadAvisoAssinadoMutation = trpc.avisoPrevio.avisoPrevio.uploadAvisoAssinado.useMutation({
    onSuccess: async () => {
      toast.success('Aviso assinado anexado com sucesso!');
      setUploadingAvisoAssinado(false);
      if (selectedItem?.id) { refetch(); await refreshSelectedItem(selectedItem.id); }
    },
    onError: (e: any) => { toast.error(e.message || 'Erro ao enviar aviso assinado'); setUploadingAvisoAssinado(false); },
  });
  const removerAvisoAssinadoMutation = trpc.avisoPrevio.avisoPrevio.removerAvisoAssinado.useMutation({
    onSuccess: async () => {
      toast.success('Anexo removido.');
      if (selectedItem?.id) { refetch(); await refreshSelectedItem(selectedItem.id); }
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao remover anexo'),
  });
  const handleAvisoAssinadoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedItem?.id) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Arquivo muito grande. Máximo 10MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setUploadingAvisoAssinado(true);
      uploadAvisoAssinadoMutation.mutate({
        id: selectedItem.id,
        fileBase64: base64,
        mimeType: file.type as any,
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCartaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedItem?.id) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Arquivo muito grande. Máximo 10MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setUploadingCarta(true);
      uploadCartaMutation.mutate({
        id: selectedItem.id,
        fileBase64: base64,
        mimeType: file.type as any,
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Cálculo automático via useEffect
  const [calculoLoading, setCalculoLoading] = useState(false);
  const calcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executarCalculo = useCallback(async (empId: number, tipo: string, dataDeslig: string, diasOverride?: string, descontarAviso?: boolean) => {
    setCalculoLoading(true);
    try {
      const result = await (utils as any).avisoPrevio.avisoPrevio.calcular.fetch({
        employeeId: empId,
        tipo,
        dataDesligamento: dataDeslig,
        diasTrabalhadosOverride: diasOverride ? Number(diasOverride) : undefined,
        descontarAvisoNaoCumprido: descontarAviso,
      });
      setCalculoPreview(result);
    } catch (e: any) {
      console.error("Erro ao calcular rescisão:", e);
      setCalculoPreview(null);
    } finally {
      setCalculoLoading(false);
    }
  }, [utils]);

  // Disparar cálculo automaticamente quando os 3 campos obrigatórios estão preenchidos
  useEffect(() => {
    if (calcTimerRef.current) clearTimeout(calcTimerRef.current);
    if (!form.employeeId || !form.tipo || !form.dataDesligamento) {
      setCalculoPreview(null);
      return;
    }
    // Debounce de 500ms para evitar chamadas excessivas
    calcTimerRef.current = setTimeout(() => {
      executarCalculo(form.employeeId, form.tipo, form.dataDesligamento, form.diasTrabalhadosOverride, form.descontarAvisoNaoCumprido);
    }, 500);
    return () => { if (calcTimerRef.current) clearTimeout(calcTimerRef.current); };
  }, [form.employeeId, form.tipo, form.dataDesligamento, form.diasTrabalhadosOverride, form.descontarAvisoNaoCumprido, executarCalculo]);

  // Filtered list
  const filtered = useMemo(() => {
    return (filteredAvisos as any[]).filter((a: any) => {
      if (search) {
        const s = removeAccents(search);
        if (!(a.employeeName || "").toLowerCase().includes(s) && !(a.employeeCpf || "").includes(s)) return false;
      }
      return true;
    });
  }, [filteredAvisos, search]);

  // Recalcular mutation
  const recalcularTodos = trpc.avisoPrevio.avisoPrevio.recalcularTodos.useMutation({
    onSuccess: (data: any) => {
      refetch();
      utils.obras.efetivoPorObra.invalidate();
      toast.success(`${data.recalculados} avisos recalculados com sucesso!${data.erros > 0 ? ` (${data.erros} erros)` : ''}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Stats - usa allAvisosForStats (sem filtro) para totais globais
  const stats = useMemo(() => {
    const list = filteredAllForStats as any[];
    const emAndamentoList = list.filter(a => a.status === "em_andamento");
    const aguardandoList  = list.filter(a => a.status === "aguardando_pagamento");
    const concluidosList  = list.filter(a => a.status === "concluido");
    const canceladosList  = list.filter(a => a.status === "cancelado");
    return {
      total: list.length,
      emAndamento: emAndamentoList.length,
      aguardandoPagamento: aguardandoList.length,
      concluidos: concluidosList.length,
      cancelados: canceladosList.length,
      valorTotal: emAndamentoList.reduce((sum, a) => sum + (Number(a.valorEstimadoTotal) || 0), 0),
      valorEmAndamento: emAndamentoList.reduce((sum, a) => sum + (Number(a.valorEstimadoTotal) || 0), 0),
      valorAguardando: aguardandoList.reduce((sum, a) => sum + (Number(a.valorEstimadoTotal) || 0), 0),
      valorConcluidos: concluidosList.reduce((sum, a) => sum + (Number(a.valorEstimadoTotal) || 0), 0),
    };
  }, [filteredAllForStats]);

  // Employee search for form (Popover + Command)
  const [empPopoverOpen, setEmpPopoverOpen] = useState(false);
  const selectedEmp = activeEmployees.find((e: any) => e.id === form.employeeId);

  const handleSubmit = () => {
    if (!form.employeeId || !form.tipo || !form.dataDesligamento) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (cipaCheckQ.data?.temEstabilidade) {
      const cipaMembro = cipaCheckQ.data.membros[0];
      const msg = `⚠️ ATENÇÃO: CIPEIRO COM ESTABILIDADE!\n\n` +
        `Este colaborador é membro da CIPA (${cipaMembro?.cargoCipa}) ` +
        `com estabilidade até ${cipaMembro?.fimEstabilidade || cipaMembro?.mandatoFim}.\n\n` +
        `Conforme CLT Art. 165 e CF Art. 10 ADCT, cipeiro eleito NÃO PODE ser dispensado sem justa causa.\n\n` +
        `Prosseguir pode gerar reintegração judicial e indenização.\n\n` +
        `Deseja REALMENTE continuar?`;
      if (!confirm(msg)) return;
    }
    if (editingItem) {
      // Modo edição
      updateAviso.mutate({
        id: editingItem.id,
        tipo: form.tipo,
        dataInicio: form.dataDesligamento,
        dataDesligamento: form.dataDesligamento,
        reducaoJornada: isPedidoDemissao ? "nenhuma" : (form.reducaoJornada || "nenhuma"),
        observacoes: form.observacoes,
        diasTrabalhados: form.diasTrabalhadosOverride ? Number(form.diasTrabalhadosOverride) : undefined,
        descontarAvisoNaoCumprido: !!form.descontarAvisoNaoCumprido,
        recalcular: true,
      });
      setShowDialog(false);
      setEditingItem(null);
      setForm({});
      setCalculoPreview(null);
    } else {
      createAviso.mutate({ companyId, companyIds, employeeId: form.employeeId,
        tipo: form.tipo,
        dataInicio: form.dataDesligamento,
        dataDesligamento: form.dataDesligamento,
        reducaoJornada: isPedidoDemissao ? "nenhuma" : (form.reducaoJornada || "nenhuma"),
        observacoes: form.observacoes,
        diasTrabalhados: form.diasTrabalhadosOverride ? Number(form.diasTrabalhadosOverride) : undefined,
        descontarAvisoNaoCumprido: !!form.descontarAvisoNaoCumprido,
      });
    }
  };

  // ======================================================================
  // GERAR DOCUMENTO DE AVISO PRÉVIO (Trabalhado segue PDF, Indenizado segue DOCX)
  // - Trabalhado: cabeçalho "AVISO PRÉVIO DO EMPREGADOR" + corpo CLT + bloco
  //   final "Declaro-me ciente, exercendo a opção por:" com 2 checkboxes EM
  //   BRANCO (a redução é decisão do colaborador, conforme pedido do user em
  //   14/05/2026: "preciso ter a opção de apenas gerar o documento, sem
  //   preencher se será com redução de 2hs ou de 7 dias").
  // - Indenizado: cabeçalho "AVISO PRÉVIO INDENIZADO DO EMPREGADO" + corpo
  //   curto + data de pagamento das verbas (Art. 477 §6º CLT — até 10 dias).
  // Funciona ANTES de salvar a aviso (somente leitura de form + emp + empresa).
  // ======================================================================
  // Rev.1804: extraído como função reutilizável para poder ser chamada também
  // do modal de Detalhes (após o aviso já ter sido salvo). Aceita um objeto
  // `emp` mínimo (nomeCompleto, cpf, ctps, serieCtps, cargo/funcao, dataAdmissao),
  // o `tipo` do aviso e a `dataAvisoStr` (YYYY-MM-DD).
  const gerarDocumentoCore = (emp: any, tipo: string, dataAvisoStr: string) => {
    const empresa: any = selectedCompany || {};
    if (!emp) { toast.error("Colaborador não encontrado."); return; }
    if (!empresa?.razaoSocial && !empresa?.nomeFantasia) {
      toast.error("Empresa selecionada não tem dados cadastrais (razão social/CNPJ).");
      return;
    }
    // Aviso (Rev.1803): documento oficial — alerta se faltar CNPJ/endereço/cidade,
    // mas não bloqueia (o user pode imprimir e completar à mão se preferir).
    const camposFaltando: string[] = [];
    if (!empresa.cnpj) camposFaltando.push("CNPJ");
    if (!empresa.endereco) camposFaltando.push("Endereço");
    if (!empresa.cidade) camposFaltando.push("Cidade");
    if (camposFaltando.length > 0) {
      toast.warning(`Atenção: empresa sem ${camposFaltando.join(" / ")}. O documento será gerado com esses campos em branco — preencha o cadastro da empresa para sair completo.`);
    }

    const isIndenizado = tipo.endsWith("_indenizado");
    const isTrabalhado = tipo.endsWith("_trabalhado");
    if (!isIndenizado && !isTrabalhado) {
      toast.error("Tipo de aviso inválido para gerar documento.");
      return;
    }

    // === Datas ===
    const dtAviso = new Date(dataAvisoStr + "T00:00:00");
    const fmtBR = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const fmtExtenso = (d: Date) => `${String(d.getDate()).padStart(2, "0")} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

    // Trabalhado: dataInicio = dia seguinte ao aviso; dataFim = dataInicio + (diasAviso-1)
    const anosServico = (() => {
      if (!emp.dataAdmissao) return 0;
      const diff = dtAviso.getTime() - new Date(emp.dataAdmissao + "T00:00:00").getTime();
      return Math.max(0, Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000)));
    })();
    // Rev. 2423 — CUMPRIMENTO físico do aviso trabalhado é SEMPRE 30 dias
    // (CLT Art. 487 caput + Art. 488). Os +3d/ano da Lei 12.506/2011 são
    // VERBA INDENIZATÓRIA paga junto à rescisão — não obrigação de trabalhar
    // 36/60/90 dias. Caso Myriélle (2 anos, 25/05/2026) mostrava 36d errado.
    // Para INDENIZADO, o período nominal usa o total proporcional 30+3·ano.
    const diasAviso = (isPedidoDemissao || isTrabalhado)
      ? 30
      : Math.min(30 + (anosServico * 3), 90);

    const dtInicio = new Date(dtAviso); dtInicio.setDate(dtInicio.getDate() + 1);
    const dtFim = new Date(dtInicio); dtFim.setDate(dtFim.getDate() + diasAviso - 1);
    const dt2hOpcao = new Date(dtFim);                                    // último dia se opção "2h diárias"
    const dt7DiasUltimoTrab = new Date(dtFim); dt7DiasUltimoTrab.setDate(dt7DiasUltimoTrab.getDate() - 7); // último dia trabalhado se opção "7 dias corridos"
    // Indenizado: pagamento das verbas em até 10 dias corridos (Art. 477 §6º CLT).
    // Regra do user (14/05/2026): se o 10º dia cair em sábado/domingo/feriado nacional,
    // antecipa para o último dia útil anterior — exemplo do DOCX modelo:
    // aviso 15/12/2025 → +10 = 25/12 (Natal, qui) → antecipa 24/12 (véspera, qua tratada como
    // não-útil pela contabilidade) → 23/12 (ter). Implementação: lista enxuta de feriados
    // nacionais fixos (CLT/Lei 9.093) + Natal/véspera + Ano Novo/véspera + Tiradentes +
    // Independência + N.Sra. Aparecida + Finados + Proclamação + Trabalho + Confraternização.
    // Páscoa, Carnaval e Corpus Christi são móveis e ficam de fora (variam por ano).
    const isFeriadoFixoBR = (d: Date) => {
      const m = d.getMonth() + 1;
      const dia = d.getDate();
      // 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 24/12, 25/12, 31/12
      const fixos: Array<[number, number]> = [
        [1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15],
        [12, 24], [12, 25], [12, 31],
      ];
      return fixos.some(([fm, fd]) => fm === m && fd === dia);
    };
    const isDiaUtil = (d: Date) => {
      const dow = d.getDay(); // 0=Dom, 6=Sab
      if (dow === 0 || dow === 6) return false;
      if (isFeriadoFixoBR(d)) return false;
      return true;
    };
    const dtPagamento = new Date(dtAviso); dtPagamento.setDate(dtPagamento.getDate() + 10);
    // Antecipa enquanto cair em fim-de-semana ou feriado fixo
    while (!isDiaUtil(dtPagamento)) {
      dtPagamento.setDate(dtPagamento.getDate() - 1);
    }

    // === Dados ===
    const empresaNome = (empresa.razaoSocial || empresa.nomeFantasia || "").toUpperCase();
    const empresaCnpj = empresa.cnpj || "";
    const empresaEndereco = empresa.endereco || "";
    const empresaCidade = empresa.cidade || "";
    const empresaUf = empresa.estado || "";
    const cidadeUf = [empresaCidade, empresaUf].filter(Boolean).join(" - ");

    const empNome = (emp.nomeCompleto || "").toUpperCase();
    const empCpf = emp.cpf || "";
    const empCtps = emp.ctps || "";
    const empSerie = emp.serieCtps || "";
    const empFuncao = (emp.cargo || emp.funcao || "").toUpperCase();
    const logoUrl = empresa.logoUrl || "";

    // Rev. 2747 — quando há template Vigente (aviso_previo), o documento é montado
    // a partir dele (renderTemplate → buildFcDocument). Sem Vigente, cai no HTML
    // hard-coded abaixo (fallback EXATO, trabalhado/indenizado). `dados` é escapado
    // (escV) porque o corpoHtml é injetado RAW por buildFcDocument.
    const avisoVigenteHtml = avisoTplQ.data?.vigente ? avisoTplQ.data.conteudoHtml : null;
    if (avisoVigenteHtml) {
      const escV = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" } as any)[c]);
      const modalidade = isIndenizado ? "INDENIZADO" : "TRABALHADO";
      // Rev. 2966 — Aviso Prévio TRABALHADO do empregador (não pedido de demissão):
      // o template Vigente (Central de Documentos) NÃO carrega a seção de opção de
      // redução do Art. 488 CLT (2h/dia OU 7 dias corridos), então o documento saía
      // sem o bloco de escolha. Anexamos ao corpoHtml (ambas as opções EM BRANCO —
      // escolha do colaborador, conforme regra de 14/05/2026), espelhando o fallback
      // hard-coded. Inline styles (REGRA DE OURO: DOMPurify/buildFcDocument). Indenizado
      // e pedido de demissão não têm redução (Art. 488 é exclusivo da dispensa pelo empregador).
      const reducaoOpcoesHtml = (isTrabalhado && !isPedidoDemissao)
        ? `<div style="border-top:1px solid #6b7280;margin:28px 0 16px 0"></div>
<p style="margin:0 0 8px 0">Declaro-me ciente, exercendo a opção por:</p>
<p style="margin:8px 0"><span style="display:inline-block;width:13px;height:13px;border:1px solid #1a1a1a;vertical-align:middle;margin-right:8px"></span>Redução de 2 (duas) horas diárias, (${fmtBR(dt2hOpcao)}).</p>
<p style="margin:8px 0"><span style="display:inline-block;width:13px;height:13px;border:1px solid #1a1a1a;vertical-align:middle;margin-right:8px"></span>Falta de 7 (sete) dias corridos, (${fmtBR(dt7DiasUltimoTrab)}).</p>
<p style="margin:8px 0">Em ambas as opções, não haverá redução do meu salário.</p>
<p style="margin:8px 0">Declaro ter recebido da empresa uma das vias deste aviso.</p>`
        : "";
      const dados: Record<string, string> = {
        empNome: escV(empNome), empCpf: escV(formatCPF(empCpf)),
        empCtps: escV(empCtps + (empSerie ? ` / ${empSerie}` : "")),
        empRg: "", empFuncao: escV(empFuncao), empMatricula: "", empAdmissao: "", empSalario: "",
        empresaRazaoSocial: escV(empresaNome), empresaCnpj: escV(empresaCnpj),
        empresaEndereco: escV([empresaEndereco, cidadeUf].filter(Boolean).join(" - ")),
        docNumero: "—", docData: escV(fmtBR(dtAviso)), docLocal: escV(cidadeUf || empresaCidade),
        modalidade, dataAviso: escV(fmtBR(dtAviso)),
        dataDesligamento: escV(isIndenizado ? fmtBR(dtPagamento) : fmtBR(dtFim)), diasAviso: String(diasAviso),
      };
      const htmlVig = buildFcDocument({
        empresa: { razaoSocial: empresaNome, cnpj: empresaCnpj, endereco: empresaEndereco, cidade: empresaCidade, estado: empresaUf, logoUrl },
        titulo: `AVISO PRÉVIO ${modalidade}`,
        numero: "—",
        dataEmissao: fmtBR(dtAviso),
        assunto: { label: "ASSUNTO:", valor: `Aviso Prévio ${modalidade} — ${empNome}` },
        corpoHtml: renderTemplate(avisoVigenteHtml, dados) + reducaoOpcoesHtml,
        assinaturas: {
          partes: [
            { nome: empresaNome, subtitulo: empresaCnpj ? `CNPJ: ${empresaCnpj}` : undefined },
            { nome: empNome, subtitulo: "Ciente — Empregado(a)" },
          ],
          localData: cidadeUf ? `${cidadeUf}, ${fmtExtenso(dtAviso)}` : fmtExtenso(dtAviso),
        },
        geradoPor: user?.name || "Sistema",
        pageTitle: `Aviso Prévio ${modalidade} — ${empNome}`,
      });
      const wv = window.open("", "_blank", "width=820,height=1100");
      if (!wv) { toast.error("Popup bloqueado. Permita popups para gerar o documento."); return; }
      wv.document.write(htmlVig);
      wv.document.write(`<script>setTimeout(function(){window.print()},500)<\/script>`);
      wv.document.close();
      return;
    }

    const w = window.open("", "_blank", "width=820,height=1100");
    if (!w) { toast.error("Popup bloqueado. Permita popups para gerar o documento."); return; }

    const escapeHtml = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" } as any)[c]);

    // ============================== TRABALHADO ==============================
    if (isTrabalhado) {
      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Aviso Prévio Trabalhado — ${escapeHtml(empNome)}</title>
<style>
  /* Rev. 1907 — force print of background colors (header azul + logo box branco + faixa amarela).
     Sem print-color-adjust:exact, Chrome/Edge/Firefox/Safari REMOVEM backgrounds e
     gradients por default (economia de tinta) → o cabeçalho azul some na impressão. */
  @media print {
    body { margin: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    @page { margin: 0 0 20mm 0; size: A4; }
    .no-print { display: none !important; }
    .doc-header, .doc-header * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  }
  body { font-family: "Times New Roman", Times, serif; font-size: 12pt; color: #000; margin: 0; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .doc { max-width: 760px; margin: 0 auto; padding: 0 32px 32px 32px; }
  /* Cabeçalho azul padrão dos demais documentos do ERP */
  .doc-header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #fff; padding: 18px 32px; display: flex; align-items: center; gap: 18px; margin-bottom: 28px; border-bottom: 4px solid #fbbf24; }
  .doc-header .logo-wrap { background: #fff; border-radius: 8px; padding: 6px 10px; display: flex; align-items: center; justify-content: center; min-width: 90px; min-height: 56px; }
  .doc-header .logo-wrap img { max-height: 50px; max-width: 140px; object-fit: contain; }
  .doc-header .titles { flex: 1; }
  .doc-header h1 { font-family: Arial, Helvetica, sans-serif; font-size: 16pt; margin: 0 0 4px 0; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #fff; }
  .doc-header .empresa-nome { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; font-weight: 600; opacity: 0.95; }
  .doc-header .empresa-cnpj { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; opacity: 0.85; }
  .bloco { margin-bottom: 18px; }
  .bloco .rotulo { font-weight: bold; }
  .corpo { text-align: justify; margin: 22px 0; }
  .destaque-trab { text-align: center; font-weight: bold; margin: 18px 0; letter-spacing: 1px; }
  .data-cidade { margin: 26px 0 18px 0; }
  .assinatura { text-align: center; margin: 50px 0 12px 0; }
  .assinatura .linha { display: inline-block; width: 60%; border-top: 1px solid #000; padding-top: 4px; }
  .divisor { border-top: 1px solid #000; margin: 32px 0 18px 0; }
  .opcoes p { margin: 8px 0; }
  .opcoes .check { display: inline-block; width: 14px; height: 14px; border: 1px solid #000; vertical-align: middle; margin-right: 8px; }
  .assinaturas-finais { display: flex; gap: 30px; margin-top: 60px; }
  .assinaturas-finais .col { flex: 1; text-align: center; border-top: 1px solid #000; padding-top: 4px; font-size: 10pt; }
  .no-print { text-align: center; margin-bottom: 16px; padding: 8px; background: #f3f4f6; border-radius: 6px; }
  .no-print button { padding: 8px 24px; font-size: 13px; cursor: pointer; background: #d97706; color: white; border: none; border-radius: 4px; font-weight: 600; }
</style></head><body>
<div class="no-print"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
<div class="doc-header">
  <div class="logo-wrap">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo">` : `<span style="color:#1e3a8a;font-weight:700;font-size:11pt;font-family:Arial,sans-serif;">${escapeHtml((empresaNome || "").slice(0, 14))}</span>`}</div>
  <div class="titles">
    <h1>Aviso Prévio do Empregador</h1>
    <div class="empresa-nome">${escapeHtml(empresaNome)}</div>
    ${empresaCnpj ? `<div class="empresa-cnpj">CNPJ: ${escapeHtml(empresaCnpj)}</div>` : ""}
  </div>
</div>
<div class="doc">

<div class="bloco">
  <p class="rotulo">De</p>
  <p>Empresa: ${escapeHtml(empresaNome)}<br>
  CNPJ: ${escapeHtml(empresaCnpj)}<br>
  Endereço: ${escapeHtml(empresaEndereco)}</p>
</div>

<div class="bloco">
  <p class="rotulo">Para</p>
  <p>Colaborador: ${escapeHtml(empNome)}<br>
  CTPS: ${escapeHtml(empCtps)}${empSerie ? ` / ${escapeHtml(empSerie)}` : ""}</p>
</div>

<p class="corpo">Pelo presente notificamos que a ${diasAviso} dias contados de ${fmtBR(dtInicio)}, não mais serão utilizados os seus serviços pela nossa empresa, e por isso, vimos avisá-lo(a) nos termos e para os efeitos do disposto da lei em vigor, da CONSOLIDAÇÃO DAS LEIS DO TRABALHO, e acréscimos pela instrução normativa Srt nº. 15 de 14/07/2010 e lei nº 12.506 de 11/10/2011.</p>

<p class="destaque-trab">O aviso prévio será TRABALHADO.</p>

<p class="corpo">Pedimos a devolução da presente com o seu "CIENTE".</p>

<p class="data-cidade">${escapeHtml(empresaCidade || "____________")}, ${fmtExtenso(dtAviso)}.</p>

<p>Atenciosamente,</p>

<div class="assinatura">
  <div class="linha">${escapeHtml(empresaNome)}<br>CNPJ: ${escapeHtml(empresaCnpj)}</div>
</div>

<div class="divisor"></div>

<div class="opcoes">
  <p>Declaro-me ciente, exercendo a opção por :</p>
  <p><span class="check"></span> Redução de 2 (duas) horas diárias, (${fmtBR(dt2hOpcao)}).</p>
  <p><span class="check"></span> Falta de 7 (sete) dias corridos, (${fmtBR(dt7DiasUltimoTrab)}).</p>
  <p>Em ambas as opções, não haverá redução do meu salário.</p>
  <p>Declaro ter recebido da empresa uma das vias deste aviso.</p>
</div>

<div class="assinaturas-finais">
  <div class="col">${escapeHtml(empNome)}<br>CPF: ${escapeHtml(formatCPF(empCpf))}</div>
  <div class="col">Assinatura do responsável se empregado menor de idade</div>
</div>

</div>
</body></html>`;
      w.document.write(html);
      w.document.close();
      toast.success("Documento de Aviso Prévio Trabalhado gerado!");
      return;
    }

    // ============================== INDENIZADO ==============================
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Aviso Prévio Indenizado — ${escapeHtml(empNome)}</title>
<style>
  /* Rev. 1907 — force print of background colors (header azul + logo box branco + faixa amarela). */
  @media print {
    body { margin: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    @page { margin: 0 0 22mm 0; size: A4; }
    .no-print { display: none !important; }
    .doc-header, .doc-header * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  }
  body { font-family: "Times New Roman", Times, serif; font-size: 12pt; color: #000; margin: 0; line-height: 1.6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .doc { max-width: 760px; margin: 0 auto; padding: 0 32px 32px 32px; }
  /* Cabeçalho azul padrão dos demais documentos do ERP */
  .doc-header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #fff; padding: 18px 32px; display: flex; align-items: center; gap: 18px; margin-bottom: 32px; border-bottom: 4px solid #fbbf24; }
  .doc-header .logo-wrap { background: #fff; border-radius: 8px; padding: 6px 10px; display: flex; align-items: center; justify-content: center; min-width: 90px; min-height: 56px; }
  .doc-header .logo-wrap img { max-height: 50px; max-width: 140px; object-fit: contain; }
  .doc-header .titles { flex: 1; }
  .doc-header h1 { font-family: Arial, Helvetica, sans-serif; font-size: 16pt; margin: 0 0 4px 0; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #fff; }
  .doc-header .empresa-nome { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; font-weight: 600; opacity: 0.95; }
  .doc-header .empresa-cnpj { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; opacity: 0.85; }
  .dados { margin: 18px 0 28px 0; }
  .dados p { margin: 6px 0; }
  .corpo { text-align: justify; margin: 18px 0; }
  .data-cidade { margin: 30px 0 14px 0; }
  .ciente { margin: 18px 0 50px 0; }
  .assinaturas-finais { display: flex; gap: 40px; margin-top: 60px; }
  .assinaturas-finais .col { flex: 1; text-align: center; border-top: 1px solid #000; padding-top: 4px; font-size: 11pt; font-weight: bold; }
  .assinaturas-finais .col small { display: block; font-weight: normal; font-size: 10pt; margin-top: 2px; }
  .no-print { text-align: center; margin-bottom: 16px; padding: 8px; background: #f3f4f6; border-radius: 6px; }
  .no-print button { padding: 8px 24px; font-size: 13px; cursor: pointer; background: #d97706; color: white; border: none; border-radius: 4px; font-weight: 600; }
</style></head><body>
<div class="no-print"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
<div class="doc-header">
  <div class="logo-wrap">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo">` : `<span style="color:#1e3a8a;font-weight:700;font-size:11pt;font-family:Arial,sans-serif;">${escapeHtml((empresaNome || "").slice(0, 14))}</span>`}</div>
  <div class="titles">
    <h1>Aviso Prévio Indenizado do Empregado</h1>
    <div class="empresa-nome">${escapeHtml(empresaNome)}</div>
    ${empresaCnpj ? `<div class="empresa-cnpj">CNPJ: ${escapeHtml(empresaCnpj)}</div>` : ""}
  </div>
</div>
<div class="doc">

<div class="dados">
  <p>Ao Sr(a). ${escapeHtml(empNome)}</p>
  <p>CPF: ${escapeHtml(formatCPF(empCpf))}</p>
  <p>Função: ${escapeHtml(empFuncao)}</p>
</div>

<p>Prezado Senhor(a):</p>

<p class="corpo">Comunicamos que será rescindido seu contrato de trabalho nesta data ${fmtExtenso(dtAviso)}, encontrando-se vossa senhoria dispensado do cumprimento do aviso prévio, que lhe será pago de forma indenizatória junto às demais verbas rescisórias.</p>

<p class="corpo">O recebimento das verbas rescisórias devidas e o cumprimento das formalidades legais exigidas para a Rescisão Contratual ocorrerá no dia ${fmtExtenso(dtPagamento)}.</p>

<p class="corpo">Solicitamos a devolução da cópia deste, com o seu ciente.</p>

<p class="data-cidade">${escapeHtml(cidadeUf || "____________")}, ${fmtExtenso(dtAviso)}.</p>

<p class="ciente">Ciente: ______/_______/________</p>

<div class="assinaturas-finais">
  <div class="col">${escapeHtml(empNome)}<small>CPF: ${escapeHtml(formatCPF(empCpf))}</small></div>
  <div class="col">${escapeHtml(empresaNome)}<small>CNPJ: ${escapeHtml(empresaCnpj)}</small></div>
</div>

</body></html>`;
    w.document.write(html);
    w.document.close();
    toast.success("Documento de Aviso Prévio Indenizado gerado!");
  };

  // Wrapper para o botão do modal de CRIAÇÃO (usa form + selectedEmp)
  const handleGerarDocumento = () => {
    if (!form.employeeId || !form.tipo || !form.dataDesligamento) {
      toast.error("Preencha Colaborador, Tipo de Aviso e Data do Aviso para gerar o documento.");
      return;
    }
    gerarDocumentoCore(selectedEmp, form.tipo as string, form.dataDesligamento as string);
  };

  // Wrapper para o botão do modal de DETALHES (usa selectedItem já salvo).
  // Reconstrói a `dataDesligamento` (Data do Aviso = dia anterior ao dataInicio) e
  // monta o objeto `emp` a partir dos campos employeeCtps/employeeSerieCtps/
  // employeeDataAdmissao retornados pelo getById (Rev.1804).
  const handleGerarDocumentoFromDetail = () => {
    if (!selectedItem) return;
    const item: any = selectedItem;
    if (!item.dataInicio) { toast.error("Aviso sem data de início."); return; }
    // dataAviso = dataInicio - 1 (mesma lógica do handleEdit)
    const dt = new Date(item.dataInicio + "T00:00:00");
    dt.setDate(dt.getDate() - 1);
    const dataAvisoStr = dt.toISOString().split("T")[0];
    // Tenta achar o empregado completo na lista; se não tiver (terminado/filtrado),
    // monta um emp mínimo a partir dos campos do detalhe.
    const empFromList = activeEmployees.find((e: any) => e.id === item.employeeId);
    const emp = empFromList || {
      id: item.employeeId,
      nomeCompleto: item.employeeName || item.funcionarioNome || "",
      cpf: item.employeeCpf || "",
      ctps: item.employeeCtps || "",
      serieCtps: item.employeeSerieCtps || "",
      cargo: item.employeeCargo || "",
      funcao: item.employeeCargo || "",
      dataAdmissao: item.employeeDataAdmissao || "",
    };
    gerarDocumentoCore(emp, item.tipo, dataAvisoStr);
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    // dataDesligamento = último dia trabalhado = dataInicio do aviso - 1 dia
    // Porque calcularDataInicioAviso(dataDesligamento) adiciona 1 dia
    const dtInicio = new Date(item.dataInicio + 'T00:00:00');
    dtInicio.setDate(dtInicio.getDate() - 1);
    const ultimoDiaTrab = dtInicio.toISOString().split('T')[0];
    setForm({
      employeeId: item.employeeId,
      tipo: item.tipo,
      dataDesligamento: ultimoDiaTrab,
      reducaoJornada: item.reducaoJornada || "nenhuma",
      observacoes: item.observacoes || "",
      diasTrabalhadosOverride: "",
      descontarAvisoNaoCumprido: !!item.descontarAvisoNaoCumprido,
    });
    setCalculoPreview(null);
    setShowDialog(true);
  };

  const handleEncerrarPeriodo = (id: number) => {
    setConfirmEncerrar({ open: true, avisoId: id });
  };

  const confirmarEncerramento = () => {
    if (confirmEncerrar.avisoId) {
      updateAviso.mutate({ id: confirmEncerrar.avisoId, status: "aguardando_pagamento" });
    }
    setConfirmEncerrar({ open: false, avisoId: null });
  };

  const handleDarBaixa = (id: number, funcionarioNome: string, avisoData?: any) => {
    const rescisaoJaFeita = !!(avisoData?.baixaRescisaoData);
    const fgtsJaFeita = !!(avisoData?.baixaFgtsData);
    const complementarJaFeita = !!(avisoData?.baixaComplementarData);
    // Default: primeira pendência na ordem rescisão → FGTS → complementar.
    const defaultTipo: 'rescisao' | 'fgts' | 'complementar' = !rescisaoJaFeita
      ? 'rescisao'
      : !fgtsJaFeita
        ? 'fgts'
        : !complementarJaFeita
          ? 'complementar'
          : 'rescisao';
    setDarBaixaForm({ tipo: defaultTipo, valor: '', observacoes: '', desligarFuncionario: false, categoriaDesligamento: '', motivoDesligamento: '', incluirListaNegra: false, motivoListaNegra: '' });
    setDarBaixaModal({ open: true, avisoId: id, funcionarioNome, avisoData: avisoData || null });
  };

  const handleConfirmarBaixa = () => {
    if (!darBaixaModal.avisoId) return;
    if (!darBaixaForm.valor.trim()) {
      toast.error("Informe o valor da baixa.");
      return;
    }
    if (darBaixaForm.desligarFuncionario && !darBaixaForm.categoriaDesligamento) {
      toast.error("Selecione a categoria do desligamento.");
      return;
    }
    if (darBaixaForm.incluirListaNegra && !darBaixaForm.motivoListaNegra.trim()) {
      toast.error("Informe o motivo da inclusão na blacklist.");
      return;
    }
    darBaixa.mutate({
      id: darBaixaModal.avisoId,
      tipo: darBaixaForm.tipo,
      valor: darBaixaForm.valor,
      observacoes: darBaixaForm.observacoes || undefined,
      desligarFuncionario: darBaixaForm.desligarFuncionario,
      categoriaDesligamento: darBaixaForm.categoriaDesligamento || undefined,
      motivoDesligamento: darBaixaForm.motivoDesligamento || undefined,
      incluirListaNegra: darBaixaForm.incluirListaNegra,
      motivoListaNegra: darBaixaForm.motivoListaNegra || undefined,
    });
  };

  const handleCancelar = (id: number, nomeFunc?: string) => {
    setCancelarMotivo('');
    setConfirmCancelar({ open: true, avisoId: id, nomeFunc: nomeFunc || '' });
  };

  const executarCancelamento = (novoStatus: 'Ativo' | 'Desligado') => {
    if (!confirmCancelar.avisoId || !cancelarMotivo.trim()) {
      toast.error("Informe o motivo do cancelamento");
      return;
    }
    updateAviso.mutate(
      { id: confirmCancelar.avisoId, status: "cancelado", motivoCancelamento: cancelarMotivo.trim(), novoStatusFuncionario: novoStatus },
      { onSuccess: () => {
          toast.success(novoStatus === 'Ativo' ? "Aviso cancelado — funcionário reativado!" : "Aviso cancelado — funcionário desligado!");
          setConfirmCancelar({ open: false, avisoId: null, nomeFunc: '' });
        },
        onError: (err: any) => {
          toast.error(err.message || "Erro ao cancelar aviso");
        }
      }
    );
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
              {isPedidoDemissao ? "Pedido de Demissão" : "Aviso Prévio"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isPedidoDemissao ? "Gestão de pedidos de demissão voluntária pelo empregado" : "Gestão de avisos prévios conforme CLT Art. 487-491 e Lei 12.506/2011"}
            </p>
          </div>
          <DraggableCommandBar barId="aviso-previo" items={[
            { id: "recalcular", node: <Button variant="outline" onClick={() => recalcularTodos.mutate({ companyId })} disabled={recalcularTodos.isPending || stats.emAndamento === 0}><RefreshCw className={`h-4 w-4 mr-2 ${recalcularTodos.isPending ? 'animate-spin' : ''}`} />{recalcularTodos.isPending ? 'Recalculando...' : 'Recalcular Todos'}</Button> },
            { id: "novo", node: <Button onClick={() => { setForm({}); setCalculoPreview(null); setEditingItem(null); setShowDialog(true); }}><Plus className="h-4 w-4 mr-2" /> {isPedidoDemissao ? "Novo Pedido" : "Novo Aviso Prévio"}</Button> },
          ]} />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("todos")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Total</p>
                  <p className="text-2xl font-bold">{fmtNum(stats.total)}</p>
                  <p className="text-xs text-muted-foreground mt-1 font-medium">Previsão: {formatMoeda(stats.valorTotal)}</p>
                </div>
                <FileText className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-blue-500" onClick={() => setStatusFilter("em_andamento")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Em Andamento</p>
                  <p className="text-2xl font-bold text-blue-600">{fmtNum(stats.emAndamento)}</p>
                  <p className="text-xs text-blue-600/70 mt-1 font-medium">{formatMoeda(stats.valorEmAndamento)}</p>
                </div>
                <Timer className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-amber-500" onClick={() => setStatusFilter("aguardando_pagamento")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Aguardando Baixa</p>
                  <p className="text-2xl font-bold text-amber-600">{fmtNum(stats.aguardandoPagamento)}</p>
                  <p className="text-xs text-amber-600/70 mt-1 font-medium">{formatMoeda(stats.valorAguardando)}</p>
                </div>
                <Timer className="h-8 w-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-green-500" onClick={() => setStatusFilter("concluido")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Concluídos</p>
                  <p className="text-2xl font-bold text-green-600">{fmtNum(stats.concluidos)}</p>
                  <p className="text-xs text-green-600/70 mt-1 font-medium">{formatMoeda(stats.valorConcluidos)}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-red-500" onClick={() => setStatusFilter("cancelado")}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Cancelados</p>
                  <p className="text-2xl font-bold text-red-600">{fmtNum(stats.cancelados)}</p>
                </div>
                <Ban className="h-8 w-8 text-red-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Legislação Aplicável
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2 text-xs text-amber-700">
            {isPedidoDemissao ? (
              <>
                <div>
                  <strong>Art. 487 §1º CLT:</strong> Empregado que pede demissão deve cumprir aviso prévio de 30 dias ao empregador.
                </div>
                <div>
                  <strong>Art. 487 §2º CLT:</strong> Se não cumprir aviso, o empregador pode descontar os salários do período.
                </div>
                <div>
                  <strong>Súmula 276 TST:</strong> Direito ao aviso prévio é irrenunciável pelo empregado.
                </div>
              </>
            ) : (
              <>
                <div>
                  <strong>Art. 487 CLT:</strong> Aviso prévio de 30 dias (mínimo) + 3 dias por ano de serviço (máx. 90 dias).
                </div>
                <div>
                  <strong>Art. 488 CLT:</strong> Redução de 2h/dia OU 7 dias corridos no final do aviso (escolha do empregado).
                </div>
                <div>
                  <strong>Lei 12.506/2011:</strong> Aviso prévio proporcional ao tempo de serviço.
                </div>
              </>
            )}
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou CPF..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="aguardando_pagamento">Aguardando Baixa</SelectItem>
              <SelectItem value="concluido">Concluídos</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Banner: Aguardando Baixa */}
        {statusFilter === "aguardando_pagamento" && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <div className="mt-0.5 shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-amber-900 text-sm">Funcionários aguardando pagamento das verbas rescisórias</p>
              <p className="text-amber-800 text-xs mt-1 leading-relaxed">
                Estes colaboradores já cumpriram integralmente o período de aviso prévio e <strong>não estão mais em atividade</strong>.
                Estão aguardando o pagamento das verbas rescisórias pelo financeiro. Após a confirmação do pagamento de cada um,
                dê baixa manualmente utilizando o botão <strong>"Dar Baixa"</strong> — o processo seguirá o fluxo de desligamento configurado.
              </p>
            </div>
          </div>
        )}

        {/* Banner: Concluídos — oferecer reativação em massa */}
        {statusFilter === "concluido" && stats.concluidos > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4">
            <div className="mt-0.5 shrink-0">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-rose-900 text-sm">
                {stats.concluidos} aviso{stats.concluidos !== 1 ? 's' : ''} marcado{stats.concluidos !== 1 ? 's' : ''} como Concluído incorretamente
              </p>
              <p className="text-rose-800 text-xs mt-1 leading-relaxed">
                Estes colaboradores <strong>não tiveram a baixa registrada</strong> — foram marcados como concluídos antes da confirmação do pagamento.
                Reative-os para <strong>"Aguardando Baixa"</strong> e então dê baixa manualmente em cada um após o pagamento ser confirmado.
              </p>
            </div>
            <button
              onClick={() => {
                if (confirm(`Reativar ${stats.concluidos} aviso${stats.concluidos !== 1 ? 's' : ''} para "Aguardando Baixa"?\n\nIsso permitirá dar baixa manualmente em cada um.`)) {
                  revertAllConcluidos.mutate({ companyId });
                }
              }}
              disabled={revertAllConcluidos.isPending}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              {revertAllConcluidos.isPending ? 'Reativando...' : `Reativar ${stats.concluidos} aviso${stats.concluidos !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className={`overflow-x-auto transition-opacity ${isFetchingAvisos && filtered.length > 0 ? 'opacity-60' : ''}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="p-3 text-left font-medium">Colaborador</th>
                    <th className="p-3 text-left font-medium">CPF</th>
                    <th className="p-3 text-center font-medium">Data Aviso</th>
                    {!isPedidoDemissao && <th className="p-3 text-center font-medium">Redução</th>}
                    <th className="p-3 text-center font-medium">Dia Trabalhado</th>
                    <th className="p-3 text-center font-medium">Último Dia</th>
                    <th className="p-3 text-center font-medium">Data Pagamento</th>
                    <th className="p-3 text-center font-medium">Dias Restantes</th>
                    <th className="p-3 text-right font-medium">Valor Estimado</th>
                    <th className="p-3 text-center font-medium">Status</th>
                    <th className="p-3 text-center font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingAvisos || (isFetchingAvisos && filtered.length === 0) ? (
                    <tr><td colSpan={isPedidoDemissao ? 10 : 11} className="py-12 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        <span>Carregando {isPedidoDemissao ? 'pedidos' : 'avisos'}...</span>
                      </div>
                    </td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={isPedidoDemissao ? 10 : 11} className="py-12 text-center text-muted-foreground">{isPedidoDemissao ? 'Nenhum pedido de demissão encontrado' : 'Nenhum aviso prévio encontrado'}</td></tr>
                  ) : filtered.map((a: any) => {
                    const st = STATUS_LABELS[a.status] || STATUS_LABELS.em_andamento;
                    const reducaoShort = a.reducaoJornada === '2h_dia' ? '2 HORAS' : a.reducaoJornada === '7_dias_corridos' ? '7 DIAS' : '-';
                    return (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            {/* Rev. 2078 — Foto clicável (amplia ao clicar) */}
                            <button
                              type="button"
                              aria-label={`Ampliar foto de ${a.employeeName || 'colaborador'}`}
                              className="shrink-0 rounded-full ring-2 ring-white hover:ring-blue-300 hover:scale-110 transition-all shadow-sm"
                              title={(a as any).employeeFotoUrl ? "Clique para ampliar a foto" : "Sem foto cadastrada"}
                              onClick={(ev) => { ev.stopPropagation(); setFotoZoom({ url: (a as any).employeeFotoUrl || null, nome: a.employeeName || "" }); }}
                            >
                              <Avatar className="size-9">
                                {(a as any).employeeFotoUrl && <AvatarImage src={(a as any).employeeFotoUrl} alt={a.employeeName} />}
                                <AvatarFallback className="bg-gradient-to-br from-blue-100 to-indigo-200 text-blue-900 text-[11px] font-bold">
                                  {getInitials(a.employeeName || "")}
                                </AvatarFallback>
                              </Avatar>
                            </button>
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                className="font-medium text-blue-700 text-left hover:underline cursor-pointer"
                                onClick={async () => {
                                  setSelectedItem(a);
                                  setShowDetailDialog(true);
                                  setAcertoForm({ descontosAcerto: (a as any).descontosAcerto || '', descontosAcertoDesc: (a as any).descontosAcertoDesc || '', acrescimosAcerto: (a as any).acrescimosAcerto || '', acrescimosAcertoDesc: (a as any).acrescimosAcertoDesc || '', mediaInsalubridade: (a as any).mediaInsalubridade || '', mediaHorasExtras: (a as any).mediaHorasExtras || '' });
                                  setNovoEmpregoForm({ ativo: !!(a as any).novoEmpregoAtivo, comunicadoEm: (a as any).novoEmpregoComunicadoEm || '', cartaUrl: (a as any).novoEmpregoCartaUrl || '' });
                                  try { const detail = await utils.avisoPrevio.avisoPrevio.getById.fetch({ id: a.id }); if (detail) { setSelectedItem(detail); setAcertoForm({ descontosAcerto: (detail as any).descontosAcerto || '', descontosAcertoDesc: (detail as any).descontosAcertoDesc || '', acrescimosAcerto: (detail as any).acrescimosAcerto || '', acrescimosAcertoDesc: (detail as any).acrescimosAcertoDesc || '', mediaInsalubridade: (detail as any).mediaInsalubridade || '', mediaHorasExtras: (detail as any).mediaHorasExtras || '' }); setNovoEmpregoForm({ ativo: !!(detail as any).novoEmpregoAtivo, comunicadoEm: (detail as any).novoEmpregoComunicadoEm || '', cartaUrl: (detail as any).novoEmpregoCartaUrl || '' }); } } catch(e) { console.error('Erro ao buscar detalhes:', e); }
                                }}
                              >
                                {a.employeeName}
                              </button>
                              <div className="flex gap-1 mt-0.5 flex-wrap">
                            {isPedidoDemissao && (() => {
                              const tp = TIPO_LABELS_PEDIDO[a.tipo];
                              return tp ? <span className={`text-[9px] ${a.tipo === 'empregado_indenizado' ? 'bg-red-600' : 'bg-blue-600'} text-white px-1.5 py-0.5 rounded-full font-semibold`}>{tp.label}</span> : null;
                            })()}
                            {!isPedidoDemissao && (a as any).novoEmpregoAtivo ? <span className="text-[9px] bg-orange-600 text-white px-1.5 py-0.5 rounded-full font-semibold">Novo Emprego · Súmula 276</span> : null}
                            {(a as any).fgtsEditadoManualmente ? <span className="text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-semibold">FGTS Real</span> : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-xs">{formatCPF(a.employeeCpf)}</td>
                        <td className="p-3 text-center">{formatDate(a.dataDiaTrabalhado)}</td>
                        {!isPedidoDemissao && <td className="p-3 text-center font-medium">{reducaoShort}</td>}
                        <td className="p-3 text-center">{formatDate(a.dataInicio)}</td>
                        <td className="p-3 text-center">{(() => {
                          if (!isPedidoDemissao && a.reducaoJornada === '7_dias_corridos' && a.dataFim) {
                            const dt = new Date(a.dataFim + 'T00:00:00');
                            dt.setDate(dt.getDate() - 7);
                            return formatDate(dt.toISOString().split('T')[0]);
                          }
                          return formatDate(a.dataFim);
                        })()}</td>
                        <td className="p-3 text-center font-semibold text-red-600">{formatDate(a.dataLimitePagamento)}</td>
                        <td className="p-3 text-center">{(() => {
                          if (a.status !== 'em_andamento') return <span className="text-xs text-muted-foreground">-</span>;
                          const ultimoDia = (!isPedidoDemissao && a.reducaoJornada === '7_dias_corridos' && a.dataFim)
                            ? (() => { const dt = new Date(a.dataFim + 'T00:00:00'); dt.setDate(dt.getDate() - 7); return dt; })()
                            : a.dataFim ? new Date(a.dataFim + 'T00:00:00') : null;
                          if (!ultimoDia) return '-';
                          const hoje = new Date(); hoje.setHours(0,0,0,0);
                          const diff = Math.ceil((ultimoDia.getTime() - hoje.getTime()) / (1000*60*60*24));
                          if (diff < 0) return <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">Vencido!</span>;
                          if (diff <= 7) return <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{diff}d restantes</span>;
                          return <span className="text-xs font-medium text-blue-600">{diff}d restantes</span>;
                        })()}</td>
                        <td className="p-3 text-right font-semibold">{formatMoeda(a.valorEstimadoTotal)}</td>
                        <td className="p-3 text-center">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                          {a.status === 'aguardando_pagamento' && (a.baixaRescisaoData || a.baixaFgtsData) && (
                            <div className="flex gap-1 mt-1 justify-center flex-wrap">
                              {a.baixaRescisaoData && <span className="text-[9px] bg-green-600 text-white px-1.5 py-0.5 rounded-full font-semibold">Rescisão OK</span>}
                              {a.baixaFgtsData && <span className="text-[9px] bg-amber-600 text-white px-1.5 py-0.5 rounded-full font-semibold">FGTS OK</span>}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Detalhes" onClick={async () => {
                              setSelectedItem(a);
                              setShowDetailDialog(true);
                              setAcertoForm({ descontosAcerto: (a as any).descontosAcerto || '', descontosAcertoDesc: (a as any).descontosAcertoDesc || '', acrescimosAcerto: (a as any).acrescimosAcerto || '', acrescimosAcertoDesc: (a as any).acrescimosAcertoDesc || '', mediaInsalubridade: (a as any).mediaInsalubridade || '', mediaHorasExtras: (a as any).mediaHorasExtras || '' });
                              setNovoEmpregoForm({ ativo: !!(a as any).novoEmpregoAtivo, comunicadoEm: (a as any).novoEmpregoComunicadoEm || '', cartaUrl: (a as any).novoEmpregoCartaUrl || '' });
                              try { const detail = await utils.avisoPrevio.avisoPrevio.getById.fetch({ id: a.id }); if (detail) { setSelectedItem(detail); setAcertoForm({ descontosAcerto: (detail as any).descontosAcerto || '', descontosAcertoDesc: (detail as any).descontosAcertoDesc || '', acrescimosAcerto: (detail as any).acrescimosAcerto || '', acrescimosAcertoDesc: (detail as any).acrescimosAcertoDesc || '', mediaInsalubridade: (detail as any).mediaInsalubridade || '', mediaHorasExtras: (detail as any).mediaHorasExtras || '' }); setNovoEmpregoForm({ ativo: !!(detail as any).novoEmpregoAtivo, comunicadoEm: (detail as any).novoEmpregoComunicadoEm || '', cartaUrl: (detail as any).novoEmpregoCartaUrl || '' }); } } catch(e) { console.error('Erro ao buscar detalhes:', e); }
                            }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {a.status === "em_andamento" && (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" title="Editar" onClick={() => handleEdit(a)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" title="Encerrar Período" onClick={() => handleEncerrarPeriodo(a.id)}>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Cancelar" onClick={() => handleCancelar(a.id, a.nomeCompleto)}>
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {a.status === "aguardando_pagamento" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                                  title="Dar Baixa — confirmar valores e registrar pagamento"
                                  onClick={() => handleDarBaixa(a.id, a.funcionarioNome ?? a.employeeName ?? '', a)}
                                  disabled={darBaixa.isPending}
                                >
                                  Dar Baixa
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500" title="Reverter para Em Andamento" onClick={() => {
                                  if (confirm('Reverter para Em Andamento?')) revertConcluido.mutate({ id: a.id });
                                }}>
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {a.status === "concluido" && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500" title="Reverter para Em Andamento" onClick={() => {
                                if (confirm('Reverter status de Concluído para Em Andamento?')) {
                                  revertConcluido.mutate({ id: a.id });
                                }
                              }}>
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => setConfirmExcluir({ open: true, avisoId: a.id })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/40">
                      <td className="p-3 font-bold" colSpan={8}>
                        Total ({filtered.length} aviso{filtered.length !== 1 ? 's' : ''})
                      </td>
                      <td className="p-3 text-right font-bold text-base">
                        {formatMoeda(filtered.reduce((sum: number, a: any) => sum + (Number(a.valorEstimadoTotal) || 0), 0))}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        {selectedItem && (
          <FullScreenDialog open={showDetailDialog} onClose={() => { setShowDetailDialog(false); setSelectedItem(null); }} title={isPedidoDemissao ? "Detalhes do Pedido de Demissão" : "Detalhes do Aviso Prévio"} icon={<AlertTriangle className="h-5 w-5 text-white" />}>
            <div className="w-full max-w-3xl mx-auto space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground uppercase">Colaborador</p>
                  <p className="font-semibold text-lg">{selectedItem.employeeName}</p>
                  <p className="text-sm text-muted-foreground">{formatCPF(selectedItem.employeeCpf)} — {selectedItem.employeeCargo}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground uppercase">Status</p>
                  <p className="font-semibold text-lg">{STATUS_LABELS[selectedItem.status]?.label}</p>
                  <p className="text-sm text-muted-foreground">{(isPedidoDemissao ? TIPO_LABELS_PEDIDO : TIPO_LABELS)[selectedItem.tipo]?.label || TIPO_LABELS[selectedItem.tipo]?.label}</p>
                </div>
              </div>

              {selectedItem.status === "cancelado" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <p className="text-sm font-bold text-red-700 uppercase">Aviso Cancelado</p>
                  </div>
                  {selectedItem.motivoCancelamento && (
                    <div>
                      <p className="text-xs text-red-500 font-medium">Motivo do Cancelamento</p>
                      <p className="text-sm text-red-800 font-medium">{selectedItem.motivoCancelamento}</p>
                    </div>
                  )}
                  <div className="flex gap-6 text-xs text-red-600">
                    {(selectedItem as any).canceladoPorNome && (
                      <span>Cancelado por: <strong>{(selectedItem as any).canceladoPorNome}</strong></span>
                    )}
                    {(selectedItem as any).dataCancelamento && (
                      <span>Em: <strong>{new Date((selectedItem as any).dataCancelamento).toLocaleDateString("pt-BR")} às {new Date((selectedItem as any).dataCancelamento).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</strong></span>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <Calendar className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                  <p className="text-xs text-blue-600 uppercase">Início</p>
                  <p className="font-bold text-lg">{formatDate(selectedItem.dataInicio)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4 text-center">
                  <Clock className="h-5 w-5 mx-auto text-amber-600 mb-1" />
                  <p className="text-xs text-amber-600 uppercase">Dias de Aviso</p>
                  <p className="font-bold text-lg">{selectedItem.diasAviso} dias</p>
                  <p className="text-xs text-amber-500">{(() => {
                    // Calcular anos, meses e dias de serviço usando dataAdmissao do previsaoRescisao
                    let admStr = '';
                    try {
                      const prev = JSON.parse(selectedItem.previsaoRescisao || '{}');
                      admStr = prev.dataAdmissao || '';
                    } catch {}
                    if (!admStr || !selectedItem.dataFim) return `${selectedItem.anosServico} anos de serviço`;
                    const adm = new Date(admStr + 'T00:00:00');
                    const fim = new Date(selectedItem.dataFim + 'T00:00:00');
                    let anos = fim.getFullYear() - adm.getFullYear();
                    let meses = fim.getMonth() - adm.getMonth();
                    let dias = fim.getDate() - adm.getDate();
                    if (dias < 0) {
                      meses--;
                      const mesAnterior = new Date(fim.getFullYear(), fim.getMonth(), 0);
                      dias += mesAnterior.getDate();
                    }
                    if (meses < 0) { anos--; meses += 12; }
                    const parts = [];
                    if (anos > 0) parts.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`);
                    if (meses > 0) parts.push(`${meses} ${meses === 1 ? 'mês' : 'meses'}`);
                    parts.push(`${dias} ${dias === 1 ? 'dia' : 'dias'}`);
                    return parts.join(', ') + ' de serviço';
                  })()}</p>
                  {!isPedidoDemissao && selectedItem.anosServico > 0 && selectedItem.tipo?.includes('trabalhado') && (
                    <p className="text-[10px] text-amber-600 mt-1">+ {Math.min(selectedItem.anosServico * 3, 60)} dias indenizados</p>
                  )}
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <Calendar className="h-5 w-5 mx-auto text-green-600 mb-1" />
                  <p className="text-xs text-green-600 uppercase">Término</p>
                  <p className="font-bold text-lg">{formatDate(selectedItem.dataFim)}</p>
                </div>
              </div>
              {!isPedidoDemissao && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-xs text-blue-600 uppercase font-semibold mb-2">Redução de Jornada (Art. 488 CLT)</p>
                  <p className="font-medium">{REDUCAO_LABELS[selectedItem.reducaoJornada] || "Nenhuma"}</p>
                </div>
              )}

              {isPedidoDemissao && (
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Informações do Pedido de Demissão</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-slate-400">Cumprimento do Aviso</span>
                      {selectedItem.tipo === 'empregado_trabalhado' ? (
                        <p className="font-medium text-blue-600">Cumprindo os 30 dias</p>
                      ) : selectedItem.descontarAvisoNaoCumprido ? (
                        <p className="font-medium text-red-600">Não cumpriu — desconto APLICADO (Art. 487 §2º)</p>
                      ) : (
                        <p className="font-medium text-amber-700">Não cumpriu — desconto NÃO aplicado (decisão da empresa)</p>
                      )}
                    </div>
                    <div>
                      <span className="text-xs text-slate-400">Redução de Jornada</span>
                      <p className="font-medium text-slate-600">Não se aplica (Art. 488 exclusivo do empregador)</p>
                    </div>
                    <div>
                      <span className="text-xs text-slate-400">Dias de Aviso</span>
                      <p className="font-medium text-slate-600">30 dias fixos (pedido pelo empregado — CLT Art. 487 §2º)</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-200 grid grid-cols-3 gap-2 text-[10px]">
                    <div className="text-red-500"><strong>Sem multa 40% FGTS</strong> — não se aplica</div>
                    <div className="text-red-500"><strong>Sem saque FGTS</strong> — saldo fica retido</div>
                    <div className="text-red-500"><strong>Sem seguro-desemprego</strong> — não tem direito</div>
                  </div>
                </div>
              )}

              {/* ===== NOVO EMPREGO — Súmula 276 TST ===== */}
              {!isPedidoDemissao && selectedItem.tipo?.includes('trabalhado') && (
                <div className={`rounded-lg border p-4 ${novoEmpregoForm.ativo ? 'bg-orange-50 border-orange-300' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Briefcase className={`h-4 w-4 ${novoEmpregoForm.ativo ? 'text-orange-600' : 'text-gray-400'}`} />
                      <p className={`text-xs font-bold uppercase ${novoEmpregoForm.ativo ? 'text-orange-700' : 'text-gray-500'}`}>
                        Novo Emprego durante o Aviso Prévio
                      </p>
                      {novoEmpregoForm.ativo && (
                        <span className="text-[10px] bg-orange-600 text-white px-2 py-0.5 rounded-full font-semibold">Súmula 276 TST</span>
                      )}
                    </div>
                    <Switch
                      checked={novoEmpregoForm.ativo}
                      onCheckedChange={(v) => setNovoEmpregoForm(f => ({ ...f, ativo: v }))}
                    />
                  </div>
                  {novoEmpregoForm.ativo && (
                    <div className="space-y-3">
                      <div className="bg-orange-100 border border-orange-200 rounded p-3 text-xs text-orange-800">
                        <strong>Súmula 276 TST:</strong> Funcionário encontrou novo emprego e apresentou comprovante. O empregador fica isento do pagamento dos dias restantes do aviso prévio. Saldo de salário calculado até a data da comunicação. Prazo de pagamento: 10 dias corridos a partir desta data.
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-orange-700 block mb-1">Data da Comunicação *</label>
                          <Input
                            type="date"
                            value={novoEmpregoForm.comunicadoEm}
                            min={selectedItem.dataInicio}
                            max={selectedItem.dataFim}
                            onChange={e => setNovoEmpregoForm(f => ({ ...f, comunicadoEm: e.target.value }))}
                            className="text-sm h-8 border-orange-300"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-orange-700 block mb-1">Carta / Comprovante</label>
                          <div className="flex gap-1">
                            <Input
                              value={novoEmpregoForm.cartaUrl}
                              onChange={e => setNovoEmpregoForm(f => ({ ...f, cartaUrl: e.target.value }))}
                              placeholder="URL ou envie o arquivo →"
                              className="text-sm h-8 border-orange-300"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 border-orange-300 text-orange-600 hover:bg-orange-100 flex-shrink-0"
                              title="Enviar PDF ou JPG"
                              disabled={uploadingCarta}
                              onClick={() => cartaFileRef.current?.click()}
                            >
                              {uploadingCarta ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            </Button>
                            {novoEmpregoForm.cartaUrl && (
                              <a href={novoEmpregoForm.cartaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center h-8 w-8 bg-orange-200 rounded hover:bg-orange-300 flex-shrink-0" title="Abrir documento">
                                <FileCheck className="h-3.5 w-3.5 text-orange-700" />
                              </a>
                            )}
                          </div>
                          <input
                            ref={cartaFileRef}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            onChange={handleCartaFileChange}
                          />
                          <p className="text-[10px] text-orange-500 mt-0.5">PDF, JPG ou PNG · máx. 10MB</p>
                        </div>
                      </div>
                      <div className="text-[10px] text-orange-600">
                        Efeitos: Aviso Prévio Indenizado = R$ 0,00 · Saldo salário recalculado até {formatDate(novoEmpregoForm.comunicadoEm) || '?'} · Prazo pagamento = data comunicação + 10 dias
                      </div>
                    </div>
                  )}
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      disabled={savingNovoEmprego || (novoEmpregoForm.ativo && !novoEmpregoForm.comunicadoEm)}
                      className="h-8 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                      onClick={() => {
                        setSavingNovoEmprego(true);
                        ativarNovoEmprego.mutate({
                          id: selectedItem.id,
                          ativo: novoEmpregoForm.ativo,
                          comunicadoEm: novoEmpregoForm.comunicadoEm || null,
                          cartaUrl: novoEmpregoForm.cartaUrl || null,
                        });
                      }}
                    >
                      <Save className="h-3 w-3 mr-1" />
                      {savingNovoEmprego ? 'Salvando...' : 'Salvar'}
                    </Button>
                  </div>
                </div>
              )}

              {selectedItem.previsaoRescisao && (() => {
                let prev: any;
                try { prev = JSON.parse(selectedItem.previsaoRescisao); } catch { prev = null; }
                if (!prev) return null;
                return (
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-xs text-green-600 uppercase font-semibold mb-3 flex items-center gap-1">
                      <DollarSign className="h-4 w-4" /> Previsão de Rescisão
                    </p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between py-1 border-b border-green-100"><span className="text-gray-600">Saldo de Salário ({prev.diasTrabalhadosMes}/{prev.diasReaisMes || 30} dias):</span><span className="font-semibold">{formatMoeda(prev.saldoSalario)}</span></div>
                      <div className="flex justify-between py-1 border-b border-green-100">
                        <span className="text-gray-600">
                          Férias Prop. + 1/3 ({prev.mesesFerias} meses)
                          {parseFloat(prev.mediaInsalubridade || '0') > 0 || parseFloat(prev.mediaHorasExtras || '0') > 0 ? <span className="text-violet-500 text-[10px] ml-1">(base: {formatMoeda(prev.baseFerias13)})</span> : null}
                        </span>
                        <span className="font-semibold">{formatMoeda(prev.totalFerias)}</span>
                      </div>
                      {parseFloat(prev.feriasVencidas) > 0 && (
                        <div className="flex justify-between py-1 border-b border-red-100 bg-red-50 px-1 rounded"><span className="text-red-600">Férias Vencidas ({prev.periodosVencidos} per.):</span><span className="font-semibold text-red-700">{formatMoeda(prev.feriasVencidas)}</span></div>
                      )}
                      <div className="flex justify-between py-1 border-b border-green-100"><span className="text-gray-600">VR Proporcional (R$ {prev.vrDiario}/dia × {prev.diasTrabalhadosMes}):</span><span className="font-semibold">{formatMoeda(prev.vrProporcional)}</span></div>
                      <div className="flex justify-between py-1 border-b border-green-100">
                        <span className="text-gray-600">
                          13º Proporcional ({prev.meses13o}/12)
                          {parseFloat(prev.mediaInsalubridade || '0') > 0 || parseFloat(prev.mediaHorasExtras || '0') > 0 ? <span className="text-violet-500 text-[10px] ml-1">(base: {formatMoeda(prev.baseFerias13)})</span> : null}
                        </span>
                        <span className="font-semibold">{formatMoeda(prev.decimoTerceiroProporcional)}</span>
                      </div>
                      {!isPedidoDemissao && (
                        <div className="flex justify-between py-1 border-b border-green-100"><span className="text-gray-600">Aviso Prévio Indenizado ({prev.diasExtrasAviso} dias extras):</span><span className="font-semibold">{formatMoeda(prev.avisoPrevioIndenizado)}</span></div>
                      )}
                      {!isPedidoDemissao && prev.novoEmpregoAplicado && (
                        <div className="flex items-center gap-2 py-1 px-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700 mt-1">
                          <Briefcase className="h-3 w-3" />
                          <span><strong>Súmula 276 TST aplicada:</strong> Aviso prévio indenizado zerado. Saldo de salário e prazo calculados até a comunicação do novo emprego.</span>
                        </div>
                      )}

                      {isPedidoDemissao ? (
                        <div className="mt-2 pt-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] text-gray-400 uppercase font-bold">FGTS (informativo)</p>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-xs text-gray-400">FGTS Estimado (sistema):</span>
                            <span className="text-xs text-gray-500">{formatMoeda(prev.fgtsEstimado)}</span>
                          </div>
                          <div className="flex justify-between py-0.5 bg-red-50 px-1 rounded">
                            <span className="text-xs text-red-500">Multa 40% FGTS:</span>
                            <span className="text-xs font-medium text-red-500">Não se aplica (pedido de demissão)</span>
                          </div>
                          <div className="flex justify-between py-0.5 bg-red-50 px-1 rounded mt-0.5">
                            <span className="text-xs text-red-500">Saque FGTS:</span>
                            <span className="text-xs font-medium text-red-500">Sem direito — saldo fica retido</span>
                          </div>
                          <div className="flex justify-between py-0.5 bg-red-50 px-1 rounded mt-0.5">
                            <span className="text-xs text-red-500">Seguro-Desemprego:</span>
                            <span className="text-xs font-medium text-red-500">Sem direito</span>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 pt-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] text-gray-400 uppercase font-bold">FGTS (informativo)</p>
                            {selectedItem.tipo?.includes('empregador') && (
                              <Button size="sm" variant="ghost" className="h-6 text-[10px] text-amber-600 hover:text-amber-700 px-2 gap-1" onClick={() => setFgtsEditDialog({ open: true, valor: selectedItem.fgtsReal || '' })}>
                                <Edit2 className="h-3 w-3" />
                                {selectedItem.fgtsEditadoManualmente ? 'Editar saldo real' : 'Informar saldo real'}
                              </Button>
                            )}
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-xs text-gray-400">FGTS Estimado (sistema):</span>
                            <span className="text-xs text-gray-500">{formatMoeda(prev.fgtsEstimado)}</span>
                          </div>
                          {selectedItem.fgtsEditadoManualmente ? (
                            <div className="flex justify-between py-0.5 bg-amber-50 px-1 rounded">
                              <span className="text-xs text-amber-600 flex items-center gap-1">
                                Saldo Real (editado manualmente)
                                <span className="text-[9px] text-amber-400">por {selectedItem.fgtsEditadoPor}</span>
                              </span>
                              <span className="text-xs font-semibold text-amber-700">{formatMoeda(selectedItem.fgtsReal)}</span>
                            </div>
                          ) : null}
                          <div className="flex justify-between py-0.5">
                            <span className="text-xs text-gray-400">Multa 40%{selectedItem.fgtsEditadoManualmente ? ' (sobre saldo real)' : ' (sobre estimado)'}:</span>
                            <span className="text-xs font-medium text-gray-600">{formatMoeda(prev.multaFGTS)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    {parseFloat(prev.descontoAvisoNaoCumprido || '0') > 0 && (
                      <div className="flex justify-between py-1 mt-2 px-2 bg-red-50 border border-red-200 rounded">
                        <span className="text-red-600 text-sm">
                          <strong>(–)</strong> Desconto Aviso não cumprido (Art. 487 §2º — 30 dias):
                        </span>
                        <span className="font-semibold text-red-700">– {formatMoeda(prev.descontoAvisoNaoCumprido)}</span>
                      </div>
                    )}
                    <div className="border-t-2 border-green-300 mt-3 pt-3 flex justify-between text-lg font-bold text-green-700">
                      <span>TOTAL BRUTO RESCISÃO:</span>
                      <span>{formatMoeda(prev.total)}</span>
                    </div>

                    {/* Descontos Legais e da Folha */}
                    {parseFloat(prev.totalDescontos || '0') > 0 && (
                      <div className="mt-3 pt-2 border-t border-red-200">
                        <p className="text-[10px] font-bold text-red-500 uppercase mb-1">Descontos Legais e da Folha</p>
                        <div className="text-xs space-y-0.5">
                          {parseFloat(prev.descontoINSS || '0') > 0 && (
                            <div className="flex justify-between text-red-700"><span>INSS (saldo + 13º):</span><span>– {formatMoeda(prev.descontoINSS)}</span></div>
                          )}
                          {parseFloat(prev.descontoIRRF || '0') > 0 && (
                            <div className="flex justify-between text-red-700"><span>IRRF (saldo + 13º):</span><span>– {formatMoeda(prev.descontoIRRF)}</span></div>
                          )}
                          {parseFloat(prev.descontoPensao || '0') > 0 && (
                            <div className="flex justify-between text-red-700"><span>Pensão Alimentícia:</span><span>– {formatMoeda(prev.descontoPensao)}</span></div>
                          )}
                          {parseFloat(prev.descontoSindical || '0') > 0 && (
                            <div className="flex justify-between text-red-700"><span>Contribuição Sindical:</span><span>– {formatMoeda(prev.descontoSindical)}</span></div>
                          )}
                          {parseFloat(prev.descontoFaltasAtrasos || '0') > 0 && (
                            <div className="flex justify-between text-red-700"><span>Faltas / Atrasos do mês:</span><span>– {formatMoeda(prev.descontoFaltasAtrasos)}</span></div>
                          )}
                          {parseFloat(prev.descontoConvenios || '0') > 0 && (
                            <div className="flex justify-between text-red-700"><span>Convênios:</span><span>– {formatMoeda(prev.descontoConvenios)}</span></div>
                          )}
                          {parseFloat(prev.descontoEpis || '0') > 0 && (
                            <div className="flex justify-between text-red-700"><span>EPIs:</span><span>– {formatMoeda(prev.descontoEpis)}</span></div>
                          )}
                          {parseFloat(prev.descontoVales || '0') > 0 && (
                            <div className="flex justify-between text-red-700"><span>Vales / Adiantamentos:</span><span>– {formatMoeda(prev.descontoVales)}</span></div>
                          )}
                          {parseFloat(prev.descontoOutros || '0') > 0 && (
                            <div className="flex justify-between text-red-700"><span>Outros (RH):</span><span>– {formatMoeda(prev.descontoOutros)}</span></div>
                          )}
                          <div className="flex justify-between font-semibold text-red-700 pt-1 border-t border-red-100">
                            <span>Subtotal Descontos:</span><span>– {formatMoeda(prev.totalDescontos)}</span>
                          </div>
                        </div>
                        <div className="border-t-2 border-emerald-400 mt-2 pt-2 flex justify-between text-base font-bold text-emerald-700">
                          <span>TOTAL LÍQUIDO A PAGAR:</span>
                          <span>{formatMoeda(prev.totalLiquido || prev.total)}</span>
                        </div>
                      </div>
                    )}

                    {prev.dataLimitePagamento && (
                      <p className="text-[10px] text-red-500 mt-1 text-right">Prazo pagamento: {formatDate(prev.dataLimitePagamento)} (Art. 477 §6º CLT)</p>
                    )}

                    {(selectedItem.status === 'aguardando_pagamento' || selectedItem.status === 'concluido') && ((selectedItem as any).baixaRescisaoData || (selectedItem as any).baixaFgtsData) && (
                      <div className="mt-3 pt-3 border-t-2 border-slate-200 space-y-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase">Registro de Baixas</p>
                        {(selectedItem as any).baixaRescisaoData && (
                          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              <div>
                                <span className="text-xs font-semibold text-green-700">Rescisão (Colaborador)</span>
                                <span className="text-[10px] text-green-600 ml-2">em {formatDate((selectedItem as any).baixaRescisaoData)} por {(selectedItem as any).baixaRescisaoPor}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-bold text-green-700">{formatMoeda((selectedItem as any).baixaRescisaoValor)}</span>
                              {isMaster && (
                                <>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-green-700 hover:bg-green-100" title="Editar valor" onClick={() => setEditarBaixaDialog({ open: true, avisoId: selectedItem.id, tipo: 'rescisao', valorAtual: (selectedItem as any).baixaRescisaoValor || '', obs: '' })}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:bg-red-100" title="Estornar baixa" onClick={() => setEstornarBaixaDialog({ open: true, avisoId: selectedItem.id, tipo: 'rescisao', valor: (selectedItem as any).baixaRescisaoValor || '', motivo: '' })}>
                                    <RotateCcw className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        {(selectedItem as any).baixaFgtsData && (
                          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-amber-600" />
                              <div>
                                <span className="text-xs font-semibold text-amber-700">Multa FGTS (Caixa)</span>
                                <span className="text-[10px] text-amber-600 ml-2">em {formatDate((selectedItem as any).baixaFgtsData)} por {(selectedItem as any).baixaFgtsPor}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-bold text-amber-700">{formatMoeda((selectedItem as any).baixaFgtsValor)}</span>
                              {isMaster && (
                                <>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-amber-700 hover:bg-amber-100" title="Editar valor" onClick={() => setEditarBaixaDialog({ open: true, avisoId: selectedItem.id, tipo: 'fgts', valorAtual: (selectedItem as any).baixaFgtsValor || '', obs: '' })}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:bg-red-100" title="Estornar baixa" onClick={() => setEstornarBaixaDialog({ open: true, avisoId: selectedItem.id, tipo: 'fgts', valor: (selectedItem as any).baixaFgtsValor || '', motivo: '' })}>
                                    <RotateCcw className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        {selectedItem.status === 'aguardando_pagamento' && !(selectedItem as any).baixaRescisaoData && (
                          <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                            <Clock className="h-3.5 w-3.5" /> Baixa da rescisão pendente
                          </div>
                        )}
                        {selectedItem.status === 'aguardando_pagamento' && !(selectedItem as any).baixaFgtsData && !isPedidoDemissao && (
                          <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                            <Clock className="h-3.5 w-3.5" /> Baixa da multa FGTS pendente
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ===== CARD 2: RESCISÃO COMPLEMENTAR (USO INTERNO) ===== */}
              {(selectedItem as any)?.previsaoRescisaoComplementar && (() => {
                let pc: any = null;
                try { pc = JSON.parse((selectedItem as any).previsaoRescisaoComplementar); } catch { pc = null; }
                if (!pc) return null;
                return (
                  <div className="rounded-xl border-2 border-violet-300 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-xs font-bold uppercase text-violet-700 tracking-wider">USO INTERNO</p>
                        <h3 className="text-base font-bold text-violet-900 mt-1">Rescisão Complementar</h3>
                        <p className="text-[11px] text-violet-700 mt-1">
                          Calculada apenas sobre o complemento salarial de {formatMoeda(pc.valorComplemento)} (não inclui FGTS, multa 40%, VR ou médias). Não substitui o TRCT oficial.
                        </p>
                      </div>
                      <span className="text-2xl font-extrabold text-violet-700 whitespace-nowrap">{formatMoeda(pc.total)}</span>
                    </div>
                    <div className="border border-violet-200 rounded-lg overflow-hidden bg-white/60">
                      <table className="w-full text-sm">
                        <tbody>
                          {parseFloat(pc.saldoSalario || '0') > 0 && (
                            <tr className="border-b border-violet-100"><td className="px-3 py-2 text-violet-900">Saldo de Salário ({pc.diasTrabalhadosMes || '?'}d)</td><td className="px-3 py-2 text-right font-semibold text-violet-800 whitespace-nowrap">{formatMoeda(pc.saldoSalario)}</td></tr>
                          )}
                          {parseFloat(pc.feriasProporcional || '0') > 0 && (
                            <tr className="border-b border-violet-100"><td className="px-3 py-2 text-violet-900">Férias Proporcionais ({pc.mesesFerias}/12)</td><td className="px-3 py-2 text-right font-semibold text-violet-800 whitespace-nowrap">{formatMoeda(pc.feriasProporcional)}</td></tr>
                          )}
                          {parseFloat(pc.tercoConstitucional || '0') > 0 && (
                            <tr className="border-b border-violet-100"><td className="px-3 py-2 text-violet-900">1/3 Constitucional</td><td className="px-3 py-2 text-right font-semibold text-violet-800 whitespace-nowrap">{formatMoeda(pc.tercoConstitucional)}</td></tr>
                          )}
                          {parseFloat(pc.feriasVencidas || '0') > 0 && (
                            <tr className="border-b border-violet-100"><td className="px-3 py-2 text-violet-900">Férias Vencidas{pc.periodosVencidos ? ` (${pc.periodosVencidos})` : ''}</td><td className="px-3 py-2 text-right font-semibold text-violet-800 whitespace-nowrap">{formatMoeda(pc.feriasVencidas)}</td></tr>
                          )}
                          {parseFloat(pc.tercoFeriasVencidas || '0') > 0 && (
                            <tr className="border-b border-violet-100"><td className="px-3 py-2 text-violet-900">1/3 Férias Vencidas</td><td className="px-3 py-2 text-right font-semibold text-violet-800 whitespace-nowrap">{formatMoeda(pc.tercoFeriasVencidas)}</td></tr>
                          )}
                          {parseFloat(pc.decimoTerceiroProporcional || '0') > 0 && (
                            <tr className="border-b border-violet-100"><td className="px-3 py-2 text-violet-900">13º Proporcional ({pc.meses13o}/12)</td><td className="px-3 py-2 text-right font-semibold text-violet-800 whitespace-nowrap">{formatMoeda(pc.decimoTerceiroProporcional)}</td></tr>
                          )}
                          {parseFloat(pc.avisoPrevioIndenizado || '0') > 0 && (
                            <tr className="border-b border-violet-100"><td className="px-3 py-2 text-violet-900">Aviso Prévio Indenizado</td><td className="px-3 py-2 text-right font-semibold text-violet-800 whitespace-nowrap">{formatMoeda(pc.avisoPrevioIndenizado)}</td></tr>
                          )}
                          <tr className="bg-violet-100 font-bold">
                            <td className="px-3 py-2 text-violet-900">TOTAL COMPLEMENTAR</td>
                            <td className="px-3 py-2 text-right text-violet-900 whitespace-nowrap">{formatMoeda(pc.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* ===== TOTAL GERAL (Oficial + Complementar) ===== */}
              {(selectedItem as any)?.previsaoRescisaoComplementar && (selectedItem as any)?.previsaoRescisao && (() => {
                let pc: any = null;
                let prev: any = null;
                try { pc = JSON.parse((selectedItem as any).previsaoRescisaoComplementar); } catch { pc = null; }
                try { prev = JSON.parse((selectedItem as any).previsaoRescisao); } catch { prev = null; }
                if (!pc || !prev) return null;
                const oficial = parseFloat(String(prev.totalLiquido || prev.total || '0'));
                const complementar = parseFloat(String(pc.total || '0'));
                const totalGeral = oficial + complementar;
                return (
                  <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-lg p-5 border-2 border-slate-700">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-lg font-bold text-white">TOTAL GERAL (Oficial + Complementar)</span>
                        <p className="text-[10px] text-slate-300">Soma do TRCT oficial com o cálculo interno sobre o complemento</p>
                      </div>
                      <span className="text-3xl font-extrabold text-white">{formatMoeda(totalGeral.toFixed(2))}</span>
                    </div>
                    <div className="flex justify-end gap-4 mt-2 text-[10px] text-slate-300">
                      <span>Oficial: {formatMoeda(oficial.toFixed(2))}</span>
                      <span>Complementar: {formatMoeda(complementar.toFixed(2))}</span>
                    </div>
                  </div>
                );
              })()}

              {/* ===== MÉDIAS DE ADICIONAIS (INSALUBRIDADE / HE) ===== */}
              <div className="rounded-lg border border-violet-200 p-4 bg-violet-50/50">
                <p className="text-xs font-bold uppercase text-violet-600 mb-1 flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Médias de Adicionais Habituais
                </p>
                <p className="text-[10px] text-violet-500 mb-3">
                  CLT Art. 142 §5º — Médias de insalubridade e horas extras habituais integram a base de cálculo de férias e 13º proporcional.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-violet-700">Média Insalubridade (R$/mês)</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      value={acertoForm.mediaInsalubridade}
                      onChange={e => setAcertoForm(f => ({ ...f, mediaInsalubridade: e.target.value }))}
                      className="h-8 text-sm border-violet-200"
                    />
                    <p className="text-[10px] text-violet-400">Média mensal recebida no período aquisitivo</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-violet-700">Média Horas Extras (R$/mês)</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      value={acertoForm.mediaHorasExtras}
                      onChange={e => setAcertoForm(f => ({ ...f, mediaHorasExtras: e.target.value }))}
                      className="h-8 text-sm border-violet-200"
                    />
                    <p className="text-[10px] text-violet-400">Média mensal de HE no período aquisitivo</p>
                  </div>
                </div>
                {(parseFloat(acertoForm.mediaInsalubridade || '0') > 0 || parseFloat(acertoForm.mediaHorasExtras || '0') > 0) && (
                  <div className="mt-3 pt-2 border-t border-violet-200 text-xs text-violet-700">
                    <span className="font-semibold">Base ampliada para férias/13º:</span> Salário + R$ {(parseFloat(acertoForm.mediaInsalubridade || '0') + parseFloat(acertoForm.mediaHorasExtras || '0')).toFixed(2).replace('.', ',')}
                  </div>
                )}
              </div>

              {/* ===== DESCONTOS E ACRÉSCIMOS DO ACERTO ===== */}
              <div className="rounded-lg border border-gray-200 p-4 bg-white">
                <p className="text-xs font-bold uppercase text-gray-500 mb-3 flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" /> Acerto de Rescisão — Descontos e Acréscimos
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {/* Descontos */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 text-xs font-semibold text-red-600">
                      <MinusCircle className="h-3.5 w-3.5" /> Descontos
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Valor R$..."
                      value={acertoForm.descontosAcerto}
                      onChange={e => setAcertoForm(f => ({ ...f, descontosAcerto: e.target.value }))}
                      className="h-8 text-sm border-red-200"
                    />
                    <Input
                      placeholder="Descrição (ex: dívida EPI, vale)..."
                      value={acertoForm.descontosAcertoDesc}
                      onChange={e => setAcertoForm(f => ({ ...f, descontosAcertoDesc: e.target.value }))}
                      className="h-8 text-xs border-red-200"
                    />
                  </div>
                  {/* Acréscimos */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 text-xs font-semibold text-green-600">
                      <PlusCircle className="h-3.5 w-3.5" /> Acréscimos
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Valor R$..."
                      value={acertoForm.acrescimosAcerto}
                      onChange={e => setAcertoForm(f => ({ ...f, acrescimosAcerto: e.target.value }))}
                      className="h-8 text-sm border-green-200"
                    />
                    <Input
                      placeholder="Descrição (ex: PLR, bônus)..."
                      value={acertoForm.acrescimosAcertoDesc}
                      onChange={e => setAcertoForm(f => ({ ...f, acrescimosAcertoDesc: e.target.value }))}
                      className="h-8 text-xs border-green-200"
                    />
                  </div>
                </div>
                {/* Total ajustado */}
                {(parseFloat(acertoForm.descontosAcerto || '0') > 0 || parseFloat(acertoForm.acrescimosAcerto || '0') > 0) && (() => {
                  let prev: any = null;
                  try { prev = JSON.parse(selectedItem.previsaoRescisao); } catch {}
                  if (!prev) return null;
                  const base = parseFloat(prev.total || '0');
                  const desc = parseFloat(acertoForm.descontosAcerto || '0');
                  const acr = parseFloat(acertoForm.acrescimosAcerto || '0');
                  const total = base - desc + acr;
                  return (
                    <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center">
                      <div className="text-xs text-gray-500">Total verbas: {formatMoeda(base.toFixed(2))} {desc > 0 ? `- ${formatMoeda(desc.toFixed(2))}` : ''} {acr > 0 ? `+ ${formatMoeda(acr.toFixed(2))}` : ''}</div>
                      <div className="font-bold text-base text-slate-800">= {formatMoeda(total.toFixed(2))}</div>
                    </div>
                  );
                })()}
                <div className="flex justify-end mt-3">
                  <Button
                    size="sm"
                    disabled={savingAcerto}
                    className="h-8 text-xs bg-slate-700 hover:bg-slate-800 text-white"
                    onClick={() => {
                      setSavingAcerto(true);
                      editarAcerto.mutate({
                        id: selectedItem.id,
                        descontosAcerto: acertoForm.descontosAcerto || null,
                        descontosAcertoDesc: acertoForm.descontosAcertoDesc || null,
                        acrescimosAcerto: acertoForm.acrescimosAcerto || null,
                        acrescimosAcertoDesc: acertoForm.acrescimosAcertoDesc || null,
                        mediaInsalubridade: acertoForm.mediaInsalubridade || null,
                        mediaHorasExtras: acertoForm.mediaHorasExtras || null,
                      });
                    }}
                  >
                    <Save className="h-3 w-3 mr-1" />
                    {savingAcerto ? 'Salvando...' : 'Salvar Acerto'}
                  </Button>
                </div>
              </div>

              {/* Rev. 1806 — Anexo do Aviso Assinado pelo colaborador (PDF/JPG/PNG, máx 10MB).
                  Oculto para Pedido de Demissão (não há aviso do empregador a ser assinado nesse fluxo). */}
              {!isPedidoDemissao && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-xs text-blue-700 uppercase font-semibold mb-3 flex items-center gap-1">
                    <FileCheck className="h-4 w-4" /> Aviso Assinado pelo Colaborador
                  </p>
                  {(selectedItem as any).avisoAssinadoUrl ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={(selectedItem as any).avisoAssinadoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
                      >
                        <FileText className="h-4 w-4" /> Abrir documento
                      </a>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-blue-300 text-blue-700 hover:bg-blue-100"
                        disabled={uploadingAvisoAssinado}
                        onClick={() => avisoAssinadoFileRef.current?.click()}
                      >
                        {uploadingAvisoAssinado ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                        Substituir
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50"
                        onClick={() => {
                          if (confirm('Remover o anexo do aviso assinado?')) {
                            removerAvisoAssinadoMutation.mutate({ id: selectedItem.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
                      </Button>
                      {(selectedItem as any).avisoAssinadoEnviadoEm && (
                        <span className="text-xs text-blue-600 ml-auto">
                          Enviado em {new Date((selectedItem as any).avisoAssinadoEnviadoEm).toLocaleString('pt-BR')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                        disabled={uploadingAvisoAssinado}
                        onClick={() => avisoAssinadoFileRef.current?.click()}
                      >
                        {uploadingAvisoAssinado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {uploadingAvisoAssinado ? 'Enviando...' : 'Anexar Aviso Assinado'}
                      </Button>
                      <span className="text-xs text-blue-600">PDF, JPG ou PNG · máx. 10MB</span>
                    </div>
                  )}
                  <input
                    ref={avisoAssinadoFileRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={handleAvisoAssinadoChange}
                  />
                </div>
              )}

              {selectedItem.observacoes && (
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground uppercase">Observações</p>
                  <p className="text-sm mt-1">{selectedItem.observacoes}</p>
                </div>
              )}
              {/* Botão Exportar PDF/TRCT */}
              <div className="flex gap-3 justify-center flex-wrap pt-4 border-t">
                {/* Rev.1804: Gerar Documento de Aviso (Trabalhado/Indenizado) — disponível
                    também após salvar. Oculto para Pedido de Demissão (não há aviso
                    formal a emitir pelo empregador nesse fluxo). */}
                {!isPedidoDemissao && (
                  <Button
                    variant="outline"
                    className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={handleGerarDocumentoFromDetail}
                    title="Gera o documento de Aviso Prévio (Trabalhado ou Indenizado) para impressão / PDF."
                  >
                    <FileText className="h-4 w-4" />
                    Gerar Documento de Aviso
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="gap-2 border-green-300 text-green-700 hover:bg-green-50"
                  onClick={async () => {
                    try {
                      toast.info('Gerando TRCT...');
                      const pdfDataRaw = await utils.avisoPrevio.avisoPrevio.gerarPdf.fetch({ id: selectedItem.id });
                      const pdfData = { ...pdfDataRaw, aviso: { ...pdfDataRaw.aviso, isPedidoDemissao } };

                      // Rev. 2747 — quando há template Vigente (termo_rescisao), o documento é
                      // montado a partir dele. {{verbasRescisao}} recebe a tabela de verbas
                      // construída a partir do pdfData (markup controlado). Sem Vigente, cai no
                      // TRCT hard-coded abaixo (fallback EXATO).
                      const rescVigenteHtml = rescisaoTplQ.data?.vigente ? rescisaoTplQ.data.conteudoHtml : null;
                      if (rescVigenteHtml) {
                        const escR = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" } as any)[c]);
                        const prev: any = pdfData.previsaoRescisao || {};
                        const tdL = 'style="border:1px solid #ccc;padding:4px 6px"';
                        const tdR = 'style="border:1px solid #ccc;padding:4px 6px;text-align:right"';
                        const rowV = (lbl: string, ref: string, val: string) => `<tr><td ${tdL}>${lbl}</td><td ${tdL}>${ref}</td><td ${tdR}>${val}</td></tr>`;
                        const verbasTabela = `<table style="width:100%;border-collapse:collapse;font-size:10.5pt">
  <thead><tr><th ${tdL}>Verba</th><th ${tdL}>Referência</th><th ${tdR}>Valor (R$)</th></tr></thead>
  <tbody>
    ${rowV("Saldo de Salário", `${prev.diasTrabalhadosMes || '-'}/${prev.diasReaisMes || 30} dias`, prev.saldoSalario || '0,00')}
    ${rowV("Férias Proporcionais + 1/3", `${prev.mesesFerias || '-'} meses`, prev.totalFerias || '0,00')}
    ${parseFloat(prev.feriasVencidas || '0') > 0 ? rowV("Férias Vencidas (em dobro)", `${prev.periodosVencidos || '-'} períodos`, prev.feriasVencidas) : ''}
    ${rowV("VR Proporcional", `${prev.diasTrabalhadosMes || '-'} dias`, prev.vrProporcional || '0,00')}
    ${rowV("13º Salário Proporcional", `${prev.meses13o || '-'}/12`, prev.decimoTerceiroProporcional || '0,00')}
    ${pdfData.aviso.isPedidoDemissao ? '' : rowV("Aviso Prévio Indenizado", `${prev.diasExtrasAviso || '0'} dias extras`, prev.avisoPrevioIndenizado || '0,00')}
    <tr style="font-weight:bold;background:#e8f5e9"><td colspan="2" ${tdL}>TOTAL BRUTO RESCISÃO</td><td ${tdR}>${prev.total || pdfData.valorEstimadoTotal || '0,00'}</td></tr>
    ${parseFloat(prev.totalDescontos || '0') > 0 ? `<tr style="color:#c00"><td ${tdL}>(–) Subtotal Descontos</td><td ${tdL}>-</td><td ${tdR}>– ${prev.totalDescontos}</td></tr><tr style="font-weight:bold;background:#e6f7ec"><td colspan="2" ${tdL}>TOTAL LÍQUIDO A PAGAR</td><td ${tdR}>${prev.totalLiquido || prev.total || '0,00'}</td></tr>` : ''}
  </tbody>
</table>`;
                        const dadosR: Record<string, string> = {
                          empNome: escR(pdfData.funcionario.nome), empCpf: escR(pdfData.funcionario.cpf), empRg: "",
                          empFuncao: escR(pdfData.funcionario.cargo), empMatricula: "",
                          empAdmissao: pdfData.funcionario.dataAdmissao ? pdfData.funcionario.dataAdmissao.split('-').reverse().join('/') : "", empSalario: "",
                          empresaRazaoSocial: escR(pdfData.empresa.nome), empresaCnpj: escR(pdfData.empresa.cnpj),
                          empresaEndereco: escR([pdfData.empresa.endereco, pdfData.empresa.cidade, pdfData.empresa.estado].filter(Boolean).join(" - ")),
                          docNumero: "—", docData: new Date().toLocaleDateString('pt-BR'), docLocal: escR(pdfData.empresa.cidade || ""),
                          motivoRescisao: escR(pdfData.aviso.tipoLabel || (pdfData.aviso.isPedidoDemissao ? "Pedido de demissão" : "Rescisão sem justa causa")),
                          dataRescisao: pdfData.aviso.dataFim ? pdfData.aviso.dataFim.split('-').reverse().join('/') : "",
                          verbasRescisao: verbasTabela,
                        };
                        const htmlVig = buildFcDocument({
                          empresa: { razaoSocial: pdfData.empresa.nome, cnpj: pdfData.empresa.cnpj, endereco: pdfData.empresa.endereco, cidade: pdfData.empresa.cidade, estado: pdfData.empresa.estado, logoUrl: (pdfData.empresa as any).logoUrl || "" },
                          titulo: "TERMO DE RESCISÃO DO CONTRATO DE TRABALHO",
                          numero: "—",
                          dataEmissao: new Date().toLocaleDateString('pt-BR'),
                          assunto: { label: "ASSUNTO:", valor: `Rescisão Contratual — ${pdfData.funcionario.nome}` },
                          corpoHtml: renderTemplate(rescVigenteHtml, dadosR),
                          assinaturas: {
                            partes: [
                              { nome: pdfData.empresa.nome, subtitulo: "Empregador" },
                              { nome: pdfData.funcionario.nome, subtitulo: "Empregado(a)" },
                            ],
                          },
                          geradoPor: user?.name || "Sistema",
                          pageTitle: `Termo de Rescisão — ${pdfData.funcionario.nome}`,
                        });
                        const wv = window.open('', '_blank', 'width=800,height=1100');
                        if (!wv) { toast.error('Popup bloqueado. Permita popups para gerar o PDF.'); return; }
                        wv.document.write(htmlVig);
                        wv.document.write(`<script>setTimeout(function(){window.print()},500)<\/script>`);
                        wv.document.close();
                        toast.success('Termo de rescisão gerado com sucesso!');
                        return;
                      }

                      const w = window.open('', '_blank', 'width=800,height=1100');
                      if (!w) { toast.error('Popup bloqueado. Permita popups para gerar o PDF.'); return; }
                      w.document.write(`<!DOCTYPE html><html><head><title>TRCT - ${pdfData.funcionario.nome}</title>
<style>
  @media print { body { margin: 0; } @page { margin: 15mm; size: A4; } }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; padding: 20px; max-width: 800px; margin: 0 auto; }
  h1 { text-align: center; font-size: 16px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; }
  h2 { text-align: center; font-size: 12px; font-weight: normal; color: #555; margin-top: 0; }
  .header-box { border: 2px solid #333; padding: 12px; margin-bottom: 12px; }
  .section { border: 1px solid #999; margin-bottom: 8px; }
  .section-title { background: #2d5016; color: white; padding: 4px 8px; font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .section-body { padding: 8px; }
  .row { display: flex; gap: 8px; margin-bottom: 4px; }
  .field { flex: 1; }
  .field-label { font-size: 8px; color: #666; text-transform: uppercase; }
  .field-value { font-weight: bold; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  table th, table td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; font-size: 10px; }
  table th { background: #f0f0f0; font-weight: bold; text-transform: uppercase; font-size: 9px; }
  .total-row { background: #e8f5e9; font-weight: bold; font-size: 12px; }
  .total-row td { border-top: 2px solid #2d5016; }
  .footer { margin-top: 30px; font-size: 9px; color: #666; text-align: center; }
  .signatures { display: flex; justify-content: space-between; margin-top: 50px; }
  .sig-line { width: 45%; text-align: center; border-top: 1px solid #333; padding-top: 4px; font-size: 10px; }
  .no-print { text-align: center; margin: 10px 0; }
  @media print { .no-print { display: none; } }
</style></head><body>
<div class="no-print"><button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;background:#2d5016;color:white;border:none;border-radius:4px;">Imprimir / Salvar PDF</button></div>
<h1>${pdfData.aviso.isPedidoDemissao ? 'Pedido de Demissão — Termo de Rescisão' : 'Termo de Rescisão do Contrato de Trabalho'}</h1>
<h2>${pdfData.aviso.isPedidoDemissao ? 'Rescisão por iniciativa do empregado — Art. 487 CLT' : 'TRCT - Conforme Art. 477 da CLT'}</h2>
<div class="section">
  <div class="section-title">Identificação do Empregador</div>
  <div class="section-body">
    <div class="row"><div class="field"><div class="field-label">Razão Social</div><div class="field-value">${pdfData.empresa.nome}</div></div><div class="field"><div class="field-label">CNPJ</div><div class="field-value">${pdfData.empresa.cnpj}</div></div></div>
    <div class="row"><div class="field"><div class="field-label">Endereço</div><div class="field-value">${pdfData.empresa.endereco || '-'}, ${pdfData.empresa.cidade || ''} - ${pdfData.empresa.estado || ''}</div></div></div>
  </div>
</div>
<div class="section">
  <div class="section-title">Identificação do Trabalhador</div>
  <div class="section-body">
    <div class="row"><div class="field"><div class="field-label">Nome</div><div class="field-value">${pdfData.funcionario.nome}</div></div><div class="field"><div class="field-label">CPF</div><div class="field-value">${pdfData.funcionario.cpf}</div></div></div>
    <div class="row"><div class="field"><div class="field-label">Cargo/Função</div><div class="field-value">${pdfData.funcionario.cargo}</div></div><div class="field"><div class="field-label">Data Admissão</div><div class="field-value">${pdfData.funcionario.dataAdmissao ? pdfData.funcionario.dataAdmissao.split('-').reverse().join('/') : '-'}</div></div></div>
    <div class="row"><div class="field"><div class="field-label">CTPS</div><div class="field-value">${pdfData.funcionario.ctps || '-'}</div></div><div class="field"><div class="field-label">Série</div><div class="field-value">${pdfData.funcionario.serieCtps || '-'}</div></div></div>
  </div>
</div>
<div class="section">
  <div class="section-title">Dados do Aviso Prévio</div>
  <div class="section-body">
    <div class="row"><div class="field"><div class="field-label">Tipo</div><div class="field-value">${pdfData.aviso.tipoLabel}</div></div><div class="field"><div class="field-label">Salário Base</div><div class="field-value">R$ ${pdfData.aviso.salarioBase}</div></div></div>
    <div class="row"><div class="field"><div class="field-label">Data Início</div><div class="field-value">${pdfData.aviso.dataInicio ? pdfData.aviso.dataInicio.split('-').reverse().join('/') : '-'}</div></div><div class="field"><div class="field-label">Data Término</div><div class="field-value">${pdfData.aviso.dataFim ? pdfData.aviso.dataFim.split('-').reverse().join('/') : '-'}</div></div><div class="field"><div class="field-label">Dias de Aviso</div><div class="field-value">${pdfData.aviso.diasAviso} dias</div></div></div>
    ${pdfData.aviso.isPedidoDemissao
      ? `<div class="row"><div class="field"><div class="field-label">Redução de Jornada</div><div class="field-value">Não se aplica (Art. 488 exclusivo do empregador)</div></div><div class="field"><div class="field-label">Anos de Serviço</div><div class="field-value">${pdfData.aviso.anosServico}</div></div></div>`
      : `<div class="row"><div class="field"><div class="field-label">Redução de Jornada</div><div class="field-value">${pdfData.aviso.reducaoLabel}</div></div><div class="field"><div class="field-label">Anos de Serviço</div><div class="field-value">${pdfData.aviso.anosServico}</div></div></div>`
    }
  </div>
</div>
<div class="section">
  <div class="section-title">Discriminação das Verbas Rescisórias</div>
  <div class="section-body">
    <table>
      <thead><tr><th>Verba</th><th>Referência</th><th style="text-align:right">Valor (R$)</th></tr></thead>
      <tbody>
        <tr><td>Saldo de Salário</td><td>${pdfData.previsaoRescisao.diasTrabalhadosMes || '-'}/${pdfData.previsaoRescisao.diasReaisMes || 30} dias</td><td style="text-align:right">${pdfData.previsaoRescisao.saldoSalario || '0,00'}</td></tr>
        <tr><td>Férias Proporcionais + 1/3</td><td>${pdfData.previsaoRescisao.mesesFerias || '-'} meses</td><td style="text-align:right">${pdfData.previsaoRescisao.totalFerias || '0,00'}</td></tr>
        ${parseFloat(pdfData.previsaoRescisao.feriasVencidas || '0') > 0 ? '<tr style="background:#fff3f3"><td>Férias Vencidas (em dobro)</td><td>' + (pdfData.previsaoRescisao.periodosVencidos || '-') + ' períodos</td><td style="text-align:right">' + pdfData.previsaoRescisao.feriasVencidas + '</td></tr>' : ''}
        <tr><td>VR Proporcional</td><td>R$ ${pdfData.previsaoRescisao.vrDiario || '0'}/dia × ${pdfData.previsaoRescisao.diasTrabalhadosMes || '-'} dias</td><td style="text-align:right">${pdfData.previsaoRescisao.vrProporcional || '0,00'}</td></tr>
        <tr><td>13º Salário Proporcional</td><td>${pdfData.previsaoRescisao.meses13o || '-'}/12</td><td style="text-align:right">${pdfData.previsaoRescisao.decimoTerceiroProporcional || '0,00'}</td></tr>
        ${pdfData.aviso.isPedidoDemissao ? '' : `<tr><td>Aviso Prévio Indenizado</td><td>${pdfData.previsaoRescisao.diasExtrasAviso || '0'} dias extras</td><td style="text-align:right">${pdfData.previsaoRescisao.avisoPrevioIndenizado || '0,00'}</td></tr>`}
        <tr><td colspan="3" style="background:#f5f5f5;font-size:9px;font-weight:bold;text-transform:uppercase">FGTS (Informativo)</td></tr>
        <tr style="color:#888"><td>FGTS Estimado</td><td>-</td><td style="text-align:right">${pdfData.previsaoRescisao.fgtsEstimado || '0,00'}</td></tr>
        ${pdfData.aviso.isPedidoDemissao
          ? '<tr style="color:#c00"><td>Multa 40% FGTS</td><td>-</td><td style="text-align:right">Não se aplica</td></tr><tr style="color:#c00"><td>Saque FGTS</td><td>-</td><td style="text-align:right">Sem direito</td></tr><tr style="color:#c00"><td>Seguro-Desemprego</td><td>-</td><td style="text-align:right">Sem direito</td></tr>'
          : `<tr style="color:#888"><td>Multa 40% FGTS</td><td>-</td><td style="text-align:right">${pdfData.previsaoRescisao.multaFGTS || '0,00'}</td></tr>`
        }
        ${parseFloat(pdfData.previsaoRescisao.descontoAvisoNaoCumprido || '0') > 0 ? '<tr style="background:#fff3f3;color:#c00"><td><strong>(–) Desconto Aviso não cumprido</strong></td><td>Art. 487 §2º CLT — 30 dias</td><td style="text-align:right"><strong>– ' + pdfData.previsaoRescisao.descontoAvisoNaoCumprido + '</strong></td></tr>' : ''}
        <tr class="total-row"><td colspan="2"><strong>TOTAL BRUTO RESCISÃO</strong></td><td style="text-align:right"><strong>${pdfData.previsaoRescisao.total || pdfData.valorEstimadoTotal || '0,00'}</strong></td></tr>
        ${parseFloat(pdfData.previsaoRescisao.totalDescontos || '0') > 0 ? `
        <tr><td colspan="3" style="background:#fff3f3;font-size:9px;font-weight:bold;text-transform:uppercase;color:#c00">Descontos Legais e da Folha</td></tr>
        ${parseFloat(pdfData.previsaoRescisao.descontoINSS || '0') > 0 ? '<tr style="color:#c00"><td>INSS</td><td>Saldo + 13º</td><td style="text-align:right">– ' + pdfData.previsaoRescisao.descontoINSS + '</td></tr>' : ''}
        ${parseFloat(pdfData.previsaoRescisao.descontoIRRF || '0') > 0 ? '<tr style="color:#c00"><td>IRRF</td><td>Saldo + 13º</td><td style="text-align:right">– ' + pdfData.previsaoRescisao.descontoIRRF + '</td></tr>' : ''}
        ${parseFloat(pdfData.previsaoRescisao.descontoPensao || '0') > 0 ? '<tr style="color:#c00"><td>Pensão Alimentícia</td><td>-</td><td style="text-align:right">– ' + pdfData.previsaoRescisao.descontoPensao + '</td></tr>' : ''}
        ${parseFloat(pdfData.previsaoRescisao.descontoSindical || '0') > 0 ? '<tr style="color:#c00"><td>Contribuição Sindical</td><td>-</td><td style="text-align:right">– ' + pdfData.previsaoRescisao.descontoSindical + '</td></tr>' : ''}
        ${parseFloat(pdfData.previsaoRescisao.descontoFaltasAtrasos || '0') > 0 ? '<tr style="color:#c00"><td>Faltas / Atrasos</td><td>Mês corrente</td><td style="text-align:right">– ' + pdfData.previsaoRescisao.descontoFaltasAtrasos + '</td></tr>' : ''}
        ${parseFloat(pdfData.previsaoRescisao.descontoConvenios || '0') > 0 ? '<tr style="color:#c00"><td>Convênios</td><td>Aprovados</td><td style="text-align:right">– ' + pdfData.previsaoRescisao.descontoConvenios + '</td></tr>' : ''}
        ${parseFloat(pdfData.previsaoRescisao.descontoEpis || '0') > 0 ? '<tr style="color:#c00"><td>EPIs</td><td>Aprovados</td><td style="text-align:right">– ' + pdfData.previsaoRescisao.descontoEpis + '</td></tr>' : ''}
        ${parseFloat(pdfData.previsaoRescisao.descontoVales || '0') > 0 ? '<tr style="color:#c00"><td>Vales / Adiantamentos</td><td>-</td><td style="text-align:right">– ' + pdfData.previsaoRescisao.descontoVales + '</td></tr>' : ''}
        ${parseFloat(pdfData.previsaoRescisao.descontoOutros || '0') > 0 ? '<tr style="color:#c00"><td>Outros (RH)</td><td>Aprovados</td><td style="text-align:right">– ' + pdfData.previsaoRescisao.descontoOutros + '</td></tr>' : ''}
        <tr style="color:#c00;font-weight:bold;border-top:1px solid #c00"><td>Subtotal Descontos</td><td>-</td><td style="text-align:right">– ${pdfData.previsaoRescisao.totalDescontos}</td></tr>
        <tr class="total-row" style="background:#e6f7ec"><td colspan="2"><strong>TOTAL LÍQUIDO A PAGAR</strong></td><td style="text-align:right"><strong>${pdfData.previsaoRescisao.totalLiquido || pdfData.previsaoRescisao.total || '0,00'}</strong></td></tr>
        ` : ''}
      </tbody>
    </table>
    ${pdfData.previsaoRescisao.dataLimitePagamento ? '<p style="font-size:9px;color:#c00;margin-top:4px;text-align:right">Prazo de pagamento: ' + pdfData.previsaoRescisao.dataLimitePagamento.split('-').reverse().join('/') + ' (Art. 477 §6º CLT)</p>' : ''}
  </div>
</div>
${pdfData.aviso.observacoes ? '<div class="section"><div class="section-title">Observações</div><div class="section-body">' + pdfData.aviso.observacoes + '</div></div>' : ''}
<div class="signatures">
  <div class="sig-line">${pdfData.empresa.nome}<br/><small>Empregador</small></div>
  <div class="sig-line">${pdfData.funcionario.nome}<br/><small>Empregado(a)</small></div>
</div>
<div class="footer">
  <p><strong>Documento gerado por:</strong> ${user?.name || user?.username || 'Usuário não identificado'} | <strong>Data/Hora:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} | <strong>Sistema:</strong> ERP - Gestão Integrada</p>
  <p>Este documento não substitui o TRCT homologado. Serve como previsão de verbas rescisórias.</p>
  <p style="font-size:7px;color:#aaa;margin-top:4px">Este documento contém dados pessoais protegidos pela Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD). É proibida a reprodução, distribuição ou compartilhamento sem autorização. O uso indevido está sujeito às sanções previstas na legislação vigente.</p>
</div>
</body></html>`);
                      w.document.close();
                      toast.success('TRCT gerado com sucesso!');
                    } catch (err) {
                      console.error(err);
                      toast.error('Erro ao gerar TRCT');
                    }
                  }}
                >
                  <FileText className="h-4 w-4" />
                  Exportar TRCT (PDF)
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    window.print();
                  }}
                >
                  <Printer className="h-4 w-4" />
                  Imprimir Detalhes
                </Button>
                {(selectedItem as any)?.previsaoRescisaoComplementar && (
                  <Button
                    variant="outline"
                    className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-50"
                    onClick={() => {
                      try {
                        let pc: any = null;
                        try { pc = JSON.parse((selectedItem as any).previsaoRescisaoComplementar); } catch {}
                        if (!pc) { toast.error('Sem dados de complemento.'); return; }
                        const w = window.open('', '_blank', 'width=800,height=1100');
                        if (!w) { toast.error('Popup bloqueado. Permita popups.'); return; }
                        const linha = (label: string, valor: any) =>
                          parseFloat(valor || '0') > 0
                            ? `<tr><td>${label}</td><td style="text-align:right">${formatMoeda(valor)}</td></tr>`
                            : '';
                        const nome = (selectedItem as any)?.employeeName || '-';
                        const cpf = (selectedItem as any)?.employeeCpf || '-';
                        const cargo = (selectedItem as any)?.employeeCargo || '-';
                        w.document.write(`<!DOCTYPE html><html><head><title>USO INTERNO - Rescisão Complementar - ${nome}</title>
<style>
  @media print { body { margin: 0; } @page { margin: 15mm; size: A4; } .no-print { display: none; } }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a1a1a; padding: 24px; max-width: 720px; margin: 0 auto; }
  .watermark { position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 80px; color: rgba(139, 92, 246, 0.12); font-weight: bold; pointer-events: none; z-index: -1; white-space: nowrap; }
  .alerta { background: #fef3ff; border: 2px solid #a855f7; padding: 12px; border-radius: 8px; margin-bottom: 16px; color: #6b21a8; }
  h1 { font-size: 16px; margin: 0 0 4px 0; color: #6b21a8; }
  h2 { font-size: 12px; margin: 0 0 16px 0; font-weight: normal; color: #555; }
  .info { background: #f9fafb; border: 1px solid #e5e7eb; padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 11px; }
  .info b { color: #111; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; font-size: 11px; }
  th { background: #f3e8ff; text-transform: uppercase; font-size: 10px; color: #6b21a8; }
  .total { background: #ede9fe; font-weight: bold; font-size: 13px; color: #581c87; }
  .footer { margin-top: 28px; font-size: 9px; color: #888; border-top: 1px dashed #aaa; padding-top: 8px; }
  .no-print { text-align: center; margin-bottom: 16px; }
</style></head><body>
<div class="watermark">USO INTERNO</div>
<div class="no-print"><button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;background:#7c3aed;color:white;border:none;border-radius:4px;">Imprimir / Salvar PDF</button></div>
<div class="alerta">
  <h1>USO INTERNO</h1>
  <h2>Rescisão Complementar — Não substitui o TRCT homologado</h2>
</div>
<div class="info">
  <div><b>Funcionário:</b> ${nome} &nbsp; | &nbsp; <b>CPF:</b> ${cpf} &nbsp; | &nbsp; <b>Cargo:</b> ${cargo}</div>
  <div><b>Base de cálculo (complemento "por fora"):</b> ${formatMoeda(pc.valorComplemento)}/mês</div>
  <div><b>Período:</b> Admissão ${pc.dataAdmissao ? pc.dataAdmissao.split('-').reverse().join('/') : '-'} &nbsp; → &nbsp; Desligamento ${pc.dataDesligamento ? pc.dataDesligamento.split('-').reverse().join('/') : '-'} &nbsp; (Fim aviso: ${pc.dataFimAviso ? pc.dataFimAviso.split('-').reverse().join('/') : '-'})</div>
</div>
<table>
  <thead><tr><th>Verba</th><th style="text-align:right">Valor (R$)</th></tr></thead>
  <tbody>
    ${linha(`Saldo de Salário (${pc.diasTrabalhadosMes || '?'} dias)`, pc.saldoSalario)}
    ${linha(`Férias Proporcionais (${pc.mesesFerias}/12)`, pc.feriasProporcional)}
    ${linha('1/3 Constitucional (Férias Proporcionais)', pc.tercoConstitucional)}
    ${linha(`Férias Vencidas${pc.periodosVencidos ? ` (${pc.periodosVencidos} per.)` : ''}`, pc.feriasVencidas)}
    ${linha('1/3 Constitucional (Férias Vencidas)', pc.tercoFeriasVencidas)}
    ${linha(`13º Proporcional (${pc.meses13o}/12)`, pc.decimoTerceiroProporcional)}
    ${linha('Aviso Prévio Indenizado', pc.avisoPrevioIndenizado)}
    <tr class="total"><td>TOTAL COMPLEMENTAR</td><td style="text-align:right">${formatMoeda(pc.total)}</td></tr>
  </tbody>
</table>
<div class="footer">
  <p><b>Observações:</b> Cálculo realizado SOMENTE sobre o complemento salarial pago "por fora" (R$ ${formatMoeda(pc.valorComplemento)}). Não inclui FGTS, multa de 40%, VR, médias de adicionais habituais nem descontos legais (INSS/IRRF). Documento de uso interno da empresa, sem valor legal.</p>
  <p>Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} por ${user?.name || user?.username || '-'}.</p>
</div>
</body></html>`);
                        w.document.close();
                      } catch (err) {
                        console.error(err);
                        toast.error('Erro ao gerar PDF complementar');
                      }
                    }}
                  >
                    <FileText className="h-4 w-4" />
                    Imprimir Complementar (uso interno)
                  </Button>
                )}
              </div>
            </div>
          </FullScreenDialog>
        )}

        {/* Create Dialog */}
        <FullScreenDialog open={showDialog} onClose={() => { setShowDialog(false); setForm({}); setCalculoPreview(null); setEditingItem(null); }} title={editingItem ? (isPedidoDemissao ? "Editar Pedido de Demissão" : "Editar Aviso Prévio") : (isPedidoDemissao ? "Novo Pedido de Demissão" : "Novo Aviso Prévio")} icon={<AlertTriangle className="h-5 w-5 text-white" />}>
          <div className="w-full max-w-4xl mx-auto px-2">
            {/* Card principal do formulário */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              {/* Header do card */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b px-6 py-4">
                <h3 className="text-lg font-bold text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Dados do Aviso Prévio
                </h3>
                <p className="text-xs text-amber-700 mt-1">Preencha os dados abaixo conforme CLT Art. 487-491 e Lei 12.506/2011</p>
              </div>

              {/* Rev. 2423 — Painel reescrito após esclarecimento FC Engenharia 25/05/2026:
                  separar CUMPRIMENTO (sempre 30 dias) de VERBA (30 + 3·ano).
                  Antes (Rev. 1943) o cumprimento físico do trabalhado herdava os +3d/ano,
                  exibindo "36 dias de aviso" para 2 anos de casa — errado na prática. */}
              <details className="border-b bg-blue-50/60 group" data-testid="aviso-base-legal">
                <summary className="cursor-pointer select-none px-6 py-3 text-xs font-semibold text-blue-900 hover:bg-blue-100/60 transition-colors flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-700" />
                    📚 Base Legal — Trabalhado: 30 dias fixos · Indenizado: 30 + 3/ano (verbas)
                  </span>
                  <span className="text-blue-700 text-[10px] group-open:hidden">▼ Expandir</span>
                  <span className="text-blue-700 text-[10px] hidden group-open:inline">▲ Recolher</span>
                </summary>
                <div className="px-6 pb-4 pt-1 text-xs text-blue-950 space-y-3">
                  <div className="bg-white border-2 border-blue-300 rounded p-3">
                    <div className="font-bold text-blue-900 mb-1.5">📜 Texto literal da Lei 12.506/2011 — Art. 1º</div>
                    <p className="text-[11px] leading-relaxed italic text-blue-800 mb-2">
                      "O aviso prévio será concedido na proporção de 30 (trinta) dias aos
                      empregados que contem até 1 (um) ano de serviço na mesma empresa.
                      <br /><b>Parágrafo único.</b> Ao aviso prévio previsto neste artigo
                      serão acrescidos 3 (três) dias por ano de serviço prestado na mesma
                      empresa, até o máximo de 60 (sessenta) dias, perfazendo um total de
                      até 90 (noventa) dias."
                    </p>
                    <p className="text-[11px] text-blue-700">
                      <b>Importante:</b> os +3d/ano da Lei 12.506 representam um
                      <b> direito patrimonial</b> do trabalhador (verba indenizatória),
                      não uma obrigação de cumprir mais do que 30 dias trabalhando. Na
                      prática FC: aviso TRABALHADO = 30 dias fixos cumpridos +
                      proporcional pago em pecúnia na rescisão.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-white border border-blue-200 rounded p-3">
                      <div className="font-bold text-blue-900 mb-1">🔵 Aviso Trabalhado — 30 dias fixos</div>
                      <div className="text-[11px] text-blue-800 mb-2">
                        Base: <b>CLT Art. 487 caput</b> + <b>CLT Art. 488</b>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        Empregado cumpre exatamente <b>30 dias trabalhando</b>,
                        com direito a redução de <b>2h/dia</b> ou <b>7 dias corridos</b>
                        ao final (Art. 488). Os <b>+3 dias/ano</b> não estendem a
                        jornada — são pagos como <b>aviso indenizado complementar</b>{" "}
                        no acerto da rescisão (Lei 12.506/2011).
                      </p>
                    </div>
                    <div className="bg-white border border-red-200 rounded p-3">
                      <div className="font-bold text-red-900 mb-1">🔴 Aviso Indenizado — 30 + 3/ano</div>
                      <div className="text-[11px] text-red-800 mb-2">
                        Base: <b>Lei 12.506/2011</b> + <b>CLT Art. 487 §1º</b>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        Empregado é dispensado de imediato e <b>não trabalha nenhum
                        dia</b>. Recebe o período proporcional <b>integral em pecúnia</b>{" "}
                        (30 + 3 dias/ano, teto 90). A projeção de férias / 13º também
                        usa o período total proporcional.
                      </p>
                    </div>
                  </div>
                  <div className="bg-white border border-blue-200 rounded overflow-hidden">
                    <div className="bg-blue-100 px-3 py-1.5 text-[11px] font-bold text-blue-900">
                      Tabela — Dias CUMPRIDOS (trabalho) vs Dias PAGOS (verbas)
                    </div>
                    <table className="w-full text-[11px]">
                      <thead className="bg-blue-50">
                        <tr>
                          <th className="text-left py-1.5 px-3 font-semibold text-blue-900">Tempo de Casa</th>
                          <th className="text-center py-1.5 px-3 font-semibold text-blue-900">Trabalhado<br/><span className="text-[9px] font-normal">(cumpre + paga)</span></th>
                          <th className="text-center py-1.5 px-3 font-semibold text-red-900">Indenizado<br/><span className="text-[9px] font-normal">(só paga)</span></th>
                          <th className="text-left py-1.5 px-3 font-semibold text-blue-900">Cálculo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-100">
                        <tr><td className="py-1 px-3">Até 1 ano</td><td className="text-center font-mono">30 + 0</td><td className="text-center font-mono text-red-700">30</td><td className="text-[10px] text-blue-700">base Art. 1º caput</td></tr>
                        <tr><td className="py-1 px-3">2 anos</td><td className="text-center font-mono">30 + 3</td><td className="text-center font-mono text-red-700">33</td><td className="text-[10px] text-blue-700">30 trabalha + 3 indeniz.</td></tr>
                        <tr><td className="py-1 px-3">5 anos</td><td className="text-center font-mono">30 + 12</td><td className="text-center font-mono text-red-700">42</td><td className="text-[10px] text-blue-700">30 trabalha + 12 indeniz.</td></tr>
                        <tr className="bg-yellow-50"><td className="py-1 px-3 font-semibold">10 anos</td><td className="text-center font-mono font-bold">30 + 30</td><td className="text-center font-mono text-red-700 font-bold">60</td><td className="text-[10px] text-blue-700">30 trabalha + 30 indeniz.</td></tr>
                        <tr><td className="py-1 px-3">15 anos</td><td className="text-center font-mono">30 + 45</td><td className="text-center font-mono text-red-700">75</td><td className="text-[10px] text-blue-700">30 trabalha + 45 indeniz.</td></tr>
                        <tr className="bg-red-50/40"><td className="py-1 px-3 font-semibold">20+ anos</td><td className="text-center font-mono font-bold">30 + 60</td><td className="text-center font-mono text-red-700 font-bold">90 (teto)</td><td className="text-[10px] text-blue-700">teto 60 dias extras</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-amber-50 border border-amber-300 rounded p-2.5 text-[11px] text-amber-900">
                    <b>⚖️ Distinção essencial (Rev. 2423):</b> a Lei 12.506/2011 garante
                    um <b>direito patrimonial</b> ao trabalhador (30 + 3·ano), mas <b>não
                    obriga o empregado a trabalhar mais de 30 dias</b> no aviso. O
                    cumprimento físico (CLT Art. 487 caput) é sempre 30 dias; a diferença
                    proporcional é quitada como <b>aviso indenizado complementar</b> na
                    rescisão, sem encargos patronais sobre os dias indenizados.
                  </div>
                  <div className="bg-blue-50 border border-blue-300 rounded p-2.5 text-[11px] text-blue-900">
                    <b>📌 Exceção — pedido pelo empregado:</b> quando o <b>empregado</b>{" "}
                    pede demissão e indeniza a empresa (não cumpre o aviso), aplicam-se{" "}
                    <b>30 dias fixos</b> (CLT Art. 487 §2º) — os +3d/ano são direito do
                    trabalhador, não obrigação dele com o empregador.
                  </div>
                  <div className="text-[10px] text-blue-700 italic pt-1 border-t border-blue-200">
                    Fontes oficiais: <a href="https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12506.htm" target="_blank" rel="noopener" className="underline hover:text-blue-900">Lei 12.506/2011</a>{" · "}
                    <a href="https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm#art487" target="_blank" rel="noopener" className="underline hover:text-blue-900">CLT Art. 487-491</a>{" · "}
                    <a href="https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm#art488" target="_blank" rel="noopener" className="underline hover:text-blue-900">CLT Art. 488 (redução 2h/7d)</a>{" · "}
                    <a href="https://www3.tst.jus.br/jurisprudencia/Sumulas_com_indice/Sumulas_Ind_421_440.html#SUM-441" target="_blank" rel="noopener" className="underline hover:text-blue-900">Súm. 441 TST</a>
                  </div>
                </div>
              </details>

              <div className="p-6 space-y-5">
                {/* Seção 1: Colaborador */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
                    <Users className="h-4 w-4 text-amber-600" />
                    Colaborador <span className="text-red-500">*</span>
                  </label>
                  <Popover open={empPopoverOpen} onOpenChange={setEmpPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        role="combobox"
                        aria-expanded={empPopoverOpen}
                        className={cn(
                          "flex w-full items-center justify-between border-2 rounded-lg px-4 py-3 bg-white text-sm transition-all",
                          empPopoverOpen ? "border-amber-400 ring-2 ring-amber-100" : "border-gray-200 hover:border-amber-400",
                          !form.employeeId && "text-gray-400"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Search className="h-5 w-5 text-amber-500 shrink-0" />
                          {selectedEmp ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <PersonPhoto src={selectedEmp.fotoUrl} alt={selectedEmp.nomeCompleto || ''} size="xs" clickable={false} className="h-7 w-7 text-xs shrink-0" />
                              <span className="font-semibold text-gray-900 truncate">{selectedEmp.nomeCompleto}</span>
                              <span className="text-xs text-gray-400 font-mono shrink-0">CPF: {formatCPF(selectedEmp.cpf)}</span>
                            </div>
                          ) : (
                            <span>Selecione o colaborador...</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {form.employeeId && (
                            <span
                              className="p-1 rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500 cursor-pointer"
                              onClick={e => { e.stopPropagation(); e.preventDefault(); setForm({ ...form, employeeId: undefined }); setCalculoPreview(null); setEmpPopoverOpen(false); }}
                            >
                              <X className="h-4 w-4" />
                            </span>
                          )}
                          <ChevronsUpDown className="h-4 w-4 text-gray-400" />
                        </div>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" sideOffset={4}>
                      {/* Rev. 1906 — Filtro custom por SUBSTRING (case-insensitive +
                          sem acentos). O `cmdk` (shadcn Command) usa por default
                          um filtro FUZZY que casa qualquer char em ordem (ex:
                          "ANA" casava com "ANDERSON", "ALEXANDRO" etc — qualquer
                          nome com A...N...A em ordem). User (16/05/2026) pediu
                          que o filtro mostre SÓ o que tem o texto digitado
                          literalmente. Normalizamos os dois lados (value+search)
                          via lowercase + NFD/strip-diacritics pra match estável
                          em "joão" vs "JOAO" etc. */}
                      <Command
                        filter={(value, search) => {
                          if (!search) return 1;
                          const norm = (s: string) =>
                            s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                          return norm(value).includes(norm(search)) ? 1 : 0;
                        }}
                      >
                        <CommandInput placeholder="Digite nome, CPF ou função..." />
                        <CommandList className="max-h-72">
                          <CommandEmpty className="py-6 text-center text-sm text-gray-400">
                            <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                            Nenhum colaborador encontrado
                          </CommandEmpty>
                          <CommandGroup>
                            {activeEmployees.map((e: any) => (
                              <CommandItem
                                key={e.id}
                                value={`${e.nomeCompleto || ''} ${e.cpf || ''} ${e.funcao || ''} ${e.setor || ''}`}
                                onSelect={() => {
                                  const avisoAtivo = (filteredAvisos as any[]).find((a: any) => a.employeeId === e.id && a.status === 'em_andamento');
                                  if (avisoAtivo && !editingItem) {
                                    toast.error(`${e.nomeCompleto} já possui aviso prévio em andamento (término: ${formatDate(avisoAtivo.dataFim)}). Conclua ou cancele o aviso existente antes de criar um novo.`);
                                    return;
                                  }
                                  setForm({ ...form, employeeId: e.id });
                                  setCalculoPreview(null);
                                  setEmpPopoverOpen(false);
                                }}
                                className="flex items-center justify-between py-2.5 cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <PersonPhoto src={e.fotoUrl} alt={e.nomeCompleto || ''} size="sm" clickable={false} className="h-8 w-8 text-xs shrink-0" />
                                  <div>
                                    <span className="font-semibold text-gray-800 block text-sm">{e.nomeCompleto}</span>
                                    <span className="text-xs text-gray-500">{e.funcao || 'Sem função'} {e.setor ? `• ${e.setor}` : ''}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-gray-400 font-mono">{formatCPF(e.cpf)}</span>
                                  {/* Rev. 1727: badge de status pra identificar Férias/Afastado/Licença/Recluso */}
                                  {e.status === 'Ferias' && (
                                    <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700 bg-blue-50">Férias</Badge>
                                  )}
                                  {e.status === 'Afastado' && (
                                    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">Afastado</Badge>
                                  )}
                                  {e.status === 'Licenca' && (
                                    <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-700 bg-violet-50">Licença</Badge>
                                  )}
                                  {e.status === 'Recluso' && (
                                    <Badge variant="outline" className="text-[10px] border-red-300 text-red-700 bg-red-50">Recluso</Badge>
                                  )}
                                  {(filteredAvisos as any[]).some((a: any) => a.employeeId === e.id && a.status === 'em_andamento') && !editingItem && (
                                    <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-600 bg-orange-50">Aviso ativo</Badge>
                                  )}
                                  {form.employeeId === e.id && <Check className="h-4 w-4 text-amber-600" />}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Rev. 1794 — Card Admissão / Tempo de empresa do colaborador selecionado */}
                {selectedEmp?.dataAdmissao && (() => {
                  const ref = form.dataAviso ? new Date(form.dataAviso + 'T00:00:00') : new Date();
                  const adm = new Date(selectedEmp.dataAdmissao + 'T00:00:00');
                  let anos = ref.getFullYear() - adm.getFullYear();
                  let meses = ref.getMonth() - adm.getMonth();
                  let dias = ref.getDate() - adm.getDate();
                  if (dias < 0) {
                    meses -= 1;
                    const ultDiaMesAnterior = new Date(ref.getFullYear(), ref.getMonth(), 0).getDate();
                    dias += ultDiaMesAnterior;
                  }
                  if (meses < 0) { anos -= 1; meses += 12; }
                  const partes: string[] = [];
                  if (anos > 0) partes.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`);
                  if (meses > 0) partes.push(`${meses} ${meses === 1 ? 'mês' : 'meses'}`);
                  if (dias > 0 || partes.length === 0) partes.push(`${dias} ${dias === 1 ? 'dia' : 'dias'}`);
                  const tempoStr = partes.join(', ');
                  const totalDias = Math.max(0, Math.floor((ref.getTime() - adm.getTime()) / (1000 * 60 * 60 * 24)));
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 -mt-2">
                      <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/50 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Calendar className="h-4 w-4 text-blue-600" />
                          <span className="text-[11px] font-semibold uppercase text-blue-700 tracking-wide">Data de Admissão</span>
                        </div>
                        <p className="text-xl font-bold text-blue-900">{formatDate(selectedEmp.dataAdmissao)}</p>
                        <p className="text-[11px] text-blue-600 mt-0.5">
                          {new Date(selectedEmp.dataAdmissao + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long' })}
                        </p>
                      </div>
                      <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="h-4 w-4 text-emerald-600" />
                          <span className="text-[11px] font-semibold uppercase text-emerald-700 tracking-wide">Tempo de Empresa</span>
                        </div>
                        <p className="text-xl font-bold text-emerald-900">{tempoStr}</p>
                        <p className="text-[11px] text-emerald-600 mt-0.5">
                          Total: {totalDias.toLocaleString('pt-BR')} dias
                          {form.dataAviso && <span className="text-emerald-500"> · até a data do aviso</span>}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Alerta CIPA - Estabilidade provisória (CLT Art. 165 + CF Art. 10 ADCT) */}
                {form.employeeId && cipaCheckQ.data?.temEstabilidade && (
                  <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shrink-0">
                        <ShieldAlert className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-red-800 uppercase tracking-wide">
                          CIPEIRO — Estabilidade Provisória
                        </h4>
                        <p className="text-xs text-red-700 mt-1 leading-relaxed">
                          Este colaborador é membro da <strong>CIPA</strong> e possui <strong>estabilidade provisória</strong> no emprego.
                          Conforme <strong>CLT Art. 165</strong> e <strong>CF/88 Art. 10, II, "a" do ADCT</strong>,
                          o cipeiro eleito pelos empregados <strong>não pode ser dispensado sem justa causa</strong> desde
                          o registro da candidatura até <strong>1 ano após o término do mandato</strong>.
                        </p>
                        <div className="mt-2 space-y-1">
                          {(cipaCheckQ.data?.membros ?? []).map((m: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px]">{
                                m.cargoCipa === "Presidente" ? "Presidente" :
                                m.cargoCipa === "Vice_Presidente" ? "Vice-Presidente" :
                                m.cargoCipa === "Secretario" ? "Secretário" :
                                m.cargoCipa === "Membro_Titular" ? "Membro Titular" :
                                m.cargoCipa === "Membro_Suplente" ? "Membro Suplente" :
                                m.cargoCipa
                              }</Badge>
                              <span className="text-red-600">
                                Mandato: {formatDate(m.mandatoInicio)} — {formatDate(m.mandatoFim)}
                              </span>
                              {m.fimEstabilidade && (
                                <span className="font-bold text-red-800">
                                  Estabilidade até: {formatDate(m.fimEstabilidade)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-red-600 mt-2 italic">
                          A dispensa de cipeiro com estabilidade só é permitida por <strong>justa causa</strong> (CLT Art. 482),
                          devidamente comprovada por inquérito judicial (Súmula 379 TST).
                          Prosseguir pode gerar reintegração judicial e indenização.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Seção 2: Tipo e Data */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
                      <FileText className="h-4 w-4 text-amber-600" />
                      {isPedidoDemissao ? "Cumprimento do Aviso" : "Tipo de Aviso Prévio"} <span className="text-red-500">*</span>
                    </label>
                    {isPedidoDemissao ? (
                      <Select value={form.tipo || ""} onValueChange={v => { setForm({ ...form, tipo: v }); setCalculoPreview(null); }}>
                        <SelectTrigger className="h-12 border-2 border-gray-200 hover:border-amber-400 transition-colors"><SelectValue placeholder="O empregado vai cumprir o aviso?" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="empregado_trabalhado">
                            <div className="flex flex-col">
                              <span className="font-medium">Vai cumprir o aviso (Trabalhado)</span>
                              <span className="text-[10px] text-muted-foreground">Empregado trabalha os 30 dias normalmente</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="empregado_indenizado">
                            <div className="flex flex-col">
                              <span className="font-medium">Não vai cumprir (Indenizado)</span>
                              <span className="text-[10px] text-muted-foreground">Empregador pode descontar 30 dias do acerto — Art. 487 §2º CLT</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={form.tipo || ""} onValueChange={v => { setForm({ ...form, tipo: v }); setCalculoPreview(null); }}>
                        <SelectTrigger className="h-12 border-2 border-gray-200 hover:border-amber-400 transition-colors"><SelectValue placeholder="Selecione o tipo..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="empregador_trabalhado">Empregador (Trabalhado)</SelectItem>
                          <SelectItem value="empregador_indenizado">Empregador (Indenizado)</SelectItem>
                          <SelectItem value="empregado_trabalhado">Empregado (Trabalhado)</SelectItem>
                          <SelectItem value="empregado_indenizado">Empregado (Indenizado)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {isPedidoDemissao && form.tipo === 'empregado_indenizado' && (
                      <>
                        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                          <strong>Art. 487 §2º CLT:</strong> Se o empregado não cumprir o aviso prévio, o empregador tem o direito de descontar os salários correspondentes ao prazo de 30 dias do acerto rescisório.
                        </div>
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start justify-between gap-3">
                          <div className="text-xs text-amber-900 flex-1">
                            <p className="font-semibold mb-0.5">A empresa irá aplicar o desconto do aviso?</p>
                            <p className="text-[11px] text-amber-800">
                              {form.descontarAvisoNaoCumprido
                                ? "SIM — será descontado 1 salário cheio (30 dias) do acerto rescisório."
                                : "NÃO — empresa abre mão do desconto. O acerto será calculado sem dedução do aviso."}
                            </p>
                          </div>
                          <Switch
                            checked={!!form.descontarAvisoNaoCumprido}
                            onCheckedChange={(v) => { setForm({ ...form, descontarAvisoNaoCumprido: v }); }}
                          />
                        </div>
                      </>
                    )}
                    {isPedidoDemissao && form.tipo === 'empregado_trabalhado' && (
                      <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                        <strong>Art. 487 §1º CLT:</strong> O empregado cumprirá os 30 dias de aviso prévio trabalhando normalmente, sem redução de jornada (Art. 488 é exclusivo da dispensa pelo empregador).
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-amber-600" />
                      {isPedidoDemissao ? "Data do Pedido" : "Data do Aviso"} <span className="text-red-500">*</span>
                    </label>
                    <Input type="date" className="h-12 border-2 border-gray-200 hover:border-amber-400 transition-colors" value={form.dataDesligamento || ""} onChange={e => setForm({ ...form, dataDesligamento: e.target.value })} />
                  </div>
                </div>

                {/* Seção 3: Redução e Dias Trabalhados */}
                <div className={`grid grid-cols-1 ${isPedidoDemissao ? '' : 'md:grid-cols-2'} gap-5`}>
                  {!isPedidoDemissao && (
                    <div>
                      <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
                        <Clock className="h-4 w-4 text-amber-600" />
                        Redução de Jornada (Art. 488 CLT)
                      </label>
                      <Select value={form.reducaoJornada || "nenhuma"} onValueChange={v => setForm({ ...form, reducaoJornada: v })}>
                        <SelectTrigger className="h-12 border-2 border-gray-200 hover:border-amber-400 transition-colors"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nenhuma">Nenhuma</SelectItem>
                          <SelectItem value="2h_dia">2 horas por dia</SelectItem>
                          <SelectItem value="7_dias_corridos">7 dias corridos no final</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-gray-400 mt-1">Opcional — escolha do colaborador (Art. 488 CLT). Pode ficar em branco e gerar o documento; o colaborador marca depois.</p>
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-2 block flex items-center gap-2">
                      <Timer className="h-4 w-4 text-amber-600" />
                      Dias Trabalhados no Mês
                    </label>
                    <Input
                      type="number"
                      className="h-12 border-2 border-gray-200 hover:border-amber-400 transition-colors"
                      value={form.diasTrabalhadosOverride || ""}
                      onChange={e => setForm({ ...form, diasTrabalhadosOverride: e.target.value })}
                      placeholder="Automático (dia da data)"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Se vazio, calcula pelo dia da data de desligamento. Futuramente integrado com fechamento de ponto.</p>
                  </div>
                </div>

                {/* Indicador de cálculo automático */}
                {calculoLoading && (
                  <div className="flex items-center gap-2 text-amber-600 text-sm">
                    <Clock className="h-4 w-4 animate-spin" />
                    <span>Calculando previsão de rescisão...</span>
                  </div>
                )}

                {/* Seção 3.5: Datas Calculadas - Último Dia Trabalhado e Data de Pagamento */}
                {(() => {
                  // Calcular no frontend assim que tiver Data do Aviso + Tipo
                  if (!form.dataDesligamento || !form.tipo) return null;
                  const dataAviso = form.dataDesligamento; // Data do Aviso informada pelo usuário
                  
                  // Calcular anos de serviço para determinar dias de aviso
                  const selectedEmp = activeEmployees.find((e: any) => e.id === form.employeeId);
                  const dataAdmissao = selectedEmp?.dataAdmissao;
                  let anosServico = 0;
                  if (dataAdmissao) {
                    const diff = new Date(dataAviso + 'T00:00:00').getTime() - new Date(dataAdmissao + 'T00:00:00').getTime();
                    anosServico = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
                  }
                  
                  // Empregado indenizado = não cumpre aviso, sai no dia do pedido
                  const isEmpregadoIndenizado = form.tipo === 'empregado_indenizado';
                  const isTrabalhado = form.tipo?.includes('trabalhado');
                  // Rev. 2423 — Cumprimento físico do aviso trabalhado = 30 dias FIXOS
                  // (CLT Art. 487 caput + Art. 488). Os +3d/ano (Lei 12.506) entram só
                  // como verba indenizatória na rescisão, não estendem o prazo de
                  // cumprimento. Indenizado pelo empregador segue total proporcional.
                  const diasAviso = isEmpregadoIndenizado
                    ? 0
                    : ((isPedidoDemissao || isTrabalhado) ? 30 : Math.min(30 + (anosServico * 3), 90));
                  
                  // Data início do aviso = dia seguinte à data do aviso (exceto indenizado pelo empregado)
                  const dtInicio = new Date(dataAviso + 'T00:00:00');
                  if (!isEmpregadoIndenizado) {
                    dtInicio.setDate(dtInicio.getDate() + 1);
                  }
                  
                  // Data fim do aviso: indenizado pelo empregado = mesma data do pedido
                  const dtFim = isEmpregadoIndenizado
                    ? new Date(dataAviso + 'T00:00:00')
                    : (() => { const d = new Date(dtInicio); d.setDate(d.getDate() + diasAviso - 1); return d; })();
                  
                  // Redução: se 7 dias corridos, último dia trabalhado = 7 dias antes do fim
                  // Pedido de demissão: sem redução (Art. 488 é exclusivo do empregador)
                  const reducao = isPedidoDemissao ? 'nenhuma' : (form.reducaoJornada || 'nenhuma');
                  let dtUltimoDiaTrab = new Date(dtFim);
                  if (!isPedidoDemissao && reducao === '7_dias_corridos') {
                    dtUltimoDiaTrab = new Date(dtFim);
                    dtUltimoDiaTrab.setDate(dtUltimoDiaTrab.getDate() - 7);
                  }
                  // Se 2h/dia, trabalha todos os dias mas sai 2h mais cedo - último dia = data fim
                  
                  // Data de pagamento = 10 dias corridos após término do aviso (Art. 477 §6º CLT)
                  const dtPagamento = new Date(dtFim);
                  dtPagamento.setDate(dtPagamento.getDate() + 10);
                  
                  const fmtDt = (dt: Date) => {
                    const d = dt.getDate().toString().padStart(2, '0');
                    const m = (dt.getMonth() + 1).toString().padStart(2, '0');
                    const y = dt.getFullYear();
                    return `${d}/${m}/${y}`;
                  };
                  
                  const fmtDtISO = (dt: Date) => dt.toISOString().split('T')[0];
                  const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
                  
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl">
                      <div className="text-center p-4 bg-white rounded-lg border border-blue-100 shadow-sm">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <Calendar className="h-5 w-5 text-blue-600" />
                          <p className="text-xs font-bold text-blue-600 uppercase tracking-wide">Último Dia Trabalhado</p>
                        </div>
                        <p className="text-2xl font-bold text-blue-800">{fmtDt(dtUltimoDiaTrab)}</p>
                        <p className="text-xs text-blue-500 mt-1">{diasSemana[dtUltimoDiaTrab.getDay()]}</p>
                        {!isPedidoDemissao && reducao === '7_dias_corridos' && (
                          <p className="text-[10px] text-amber-600 mt-1">7 dias de folga no final do aviso</p>
                        )}
                        {!isPedidoDemissao && reducao === '2h_dia' && (
                          <p className="text-[10px] text-amber-600 mt-1">Sai 2h mais cedo todos os dias</p>
                        )}
                      </div>
                      <div className="text-center p-4 bg-white rounded-lg border border-green-100 shadow-sm">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <p className="text-xs font-bold text-green-600 uppercase tracking-wide">Término do Aviso</p>
                        </div>
                        <p className="text-2xl font-bold text-green-800">{fmtDt(dtFim)}</p>
                        <p className="text-xs text-green-500 mt-1">{diasSemana[dtFim.getDay()]} | {isEmpregadoIndenizado ? 'Não cumpriu aviso' : `${diasAviso} dias de aviso`}</p>
                      </div>
                      <div className="text-center p-4 bg-white rounded-lg border border-red-100 shadow-sm">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <DollarSign className="h-5 w-5 text-red-600" />
                          <p className="text-xs font-bold text-red-600 uppercase tracking-wide">Data de Pagamento</p>
                        </div>
                        <p className="text-2xl font-bold text-red-700">{fmtDt(dtPagamento)}</p>
                        <p className="text-xs text-red-500 mt-1">{diasSemana[dtPagamento.getDay()]} | Art. 477 §6º CLT</p>
                        <p className="text-[10px] text-gray-400 mt-1">10 dias corridos após término</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Seção 4: Observações */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">Observações</label>
                  <Textarea
                    value={form.observacoes || ""}
                    onChange={e => setForm({ ...form, observacoes: e.target.value })}
                    rows={3}
                    className="border-2 border-gray-200 hover:border-amber-400 transition-colors resize-none"
                    placeholder={isPedidoDemissao ? "Observações adicionais sobre o pedido de demissão..." : "Observações adicionais sobre o aviso prévio..."}
                  />
                </div>
              </div>
            </div>

            {/* Preview do cálculo */}
            {calculoPreview && (
              <div className="mt-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-green-100 px-6 py-3 border-b border-green-200">
                  <p className="font-bold text-green-800 flex items-center gap-2">
                    <DollarSign className="h-5 w-5" /> Previsão de Rescisão — {calculoPreview.funcionario?.nome || ''}
                  </p>
                  <p className="text-xs text-green-700 mt-0.5">
                    Salário Base: {formatMoeda(calculoPreview.salarioBase)} | Admissão: {formatDate(calculoPreview.dataAdmissao)} | Término Aviso: {formatDate(calculoPreview.dataFim)}
                  </p>
                </div>
                <div className="p-6">
                  {/* Cards resumo */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                    <div className="text-center bg-white rounded-lg p-3 border border-green-100">
                      <p className="text-[10px] text-green-600 font-medium mb-1">Anos de Serviço</p>
                      <p className="text-xl font-bold text-green-800">{calculoPreview.anosServico}</p>
                    </div>
                    <div className="text-center bg-white rounded-lg p-3 border border-green-100">
                      <p className="text-[10px] text-green-600 font-medium mb-1">Dias Aviso</p>
                      <p className="text-xl font-bold text-green-800">{calculoPreview.diasAviso === 0 ? 'Não cumpriu' : `${calculoPreview.diasAviso} dias`}</p>
                      {!isPedidoDemissao && (calculoPreview.diasExtras || 0) > 0 && (
                        <p className="text-[9px] text-amber-600">+ {calculoPreview.diasExtras} dias indenizados</p>
                      )}
                    </div>
                    <div className="text-center bg-white rounded-lg p-3 border border-green-100">
                      <p className="text-[10px] text-green-600 font-medium mb-1">Meses Férias</p>
                      <p className="text-xl font-bold text-green-800">{calculoPreview.previsaoRescisao?.mesesFerias || 0}/12</p>
                    </div>
                    <div className="text-center bg-white rounded-lg p-3 border border-green-100">
                      <p className="text-[10px] text-green-600 font-medium mb-1">Meses 13º</p>
                      <p className="text-xl font-bold text-green-800">{calculoPreview.previsaoRescisao?.meses13o || 0}/12</p>
                    </div>
                    <div className="text-center bg-white rounded-lg p-3 border border-red-100">
                      <p className="text-[10px] text-red-600 font-medium mb-1">Limite Pgto</p>
                      <p className="text-lg font-bold text-red-700">{formatDate(calculoPreview.previsaoRescisao?.dataLimitePagamento)}</p>
                      <p className="text-[9px] text-red-500">Art. 477 §6º CLT</p>
                    </div>
                  </div>

                  {/* Tabela detalhada de verbas */}
                  {calculoPreview.previsaoRescisao && (
                    <div className="bg-white rounded-lg border border-green-100 p-4">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Verbas Rescisórias</p>
                      <div className="space-y-0">
                        {/* Saldo de Salário */}
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <div>
                            <span className="text-sm text-gray-700">Saldo de Salário</span>
                            <span className="text-[10px] text-gray-400 ml-2">({calculoPreview.previsaoRescisao.diasTrabalhadosMes}/{calculoPreview.previsaoRescisao.diasReaisMes || 30} dias do mês)</span>
                          </div>
                          <span className="font-semibold text-sm">{formatMoeda(calculoPreview.previsaoRescisao.saldoSalario)}</span>
                        </div>

                        {/* Férias Proporcionais + 1/3 */}
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <div>
                            <span className="text-sm text-gray-700">Férias Proporcionais + 1/3</span>
                            <span className="text-[10px] text-gray-400 ml-2">({calculoPreview.previsaoRescisao.mesesFerias} meses)</span>
                          </div>
                          <span className="font-semibold text-sm">{formatMoeda(calculoPreview.previsaoRescisao.totalFerias)}</span>
                        </div>
                        <div className="flex justify-between py-1 pl-6 border-b border-gray-50">
                          <span className="text-xs text-gray-400">Férias: {formatMoeda(calculoPreview.previsaoRescisao.feriasProporcional)} + 1/3: {formatMoeda(calculoPreview.previsaoRescisao.tercoConstitucional)}</span>
                        </div>

                        {/* Férias Vencidas (se houver) — Rev. 2205: lista os
                            períodos vencidos com data limite (Art. 134 CLT) */}
                        {parseFloat(calculoPreview.previsaoRescisao.feriasVencidas) > 0 && (
                          <>
                            <div className="flex justify-between py-2 border-b border-gray-100 bg-red-50">
                              <div>
                                <span className="text-sm text-red-700 font-medium">Férias Vencidas + 1/3</span>
                                <span className="text-[10px] text-red-400 ml-2">({calculoPreview.previsaoRescisao.periodosVencidos} período(s))</span>
                              </div>
                              <span className="font-semibold text-sm text-red-700">{formatMoeda(calculoPreview.previsaoRescisao.feriasVencidas)}</span>
                            </div>
                            <div className="flex justify-between py-1 pl-6 border-b border-gray-50 bg-red-50/40">
                              <span className="text-xs text-red-400">Férias: {formatMoeda(calculoPreview.previsaoRescisao.feriasVencidasBase ?? '0')} + 1/3: {formatMoeda(calculoPreview.previsaoRescisao.feriasVencidasTerco ?? '0')}</span>
                            </div>
                            {Array.isArray(calculoPreview.periodosVencidosDetalhes) && calculoPreview.periodosVencidosDetalhes.length > 0 && (
                              <div className="pl-6 pr-2 py-2 border-b border-gray-50 bg-red-50/30">
                                <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1">📅 Quando venceu (Art. 134 CLT)</p>
                                <div className="space-y-0.5">
                                  {calculoPreview.periodosVencidosDetalhes.map((p: any, i: number) => {
                                    const aqIni = p.periodoAquisitivoInicio ? p.periodoAquisitivoInicio.split('-').reverse().join('/') : '—';
                                    const aqFim = p.periodoAquisitivoFim ? p.periodoAquisitivoFim.split('-').reverse().join('/') : '—';
                                    const concFim = p.periodoConcessivoFim ? p.periodoConcessivoFim.split('-').reverse().join('/') : '—';
                                    // Há quantos dias venceu o prazo concessivo?
                                    const hoje = new Date().toISOString().slice(0,10);
                                    let diasVencido = 0;
                                    if (p.periodoConcessivoFim && p.periodoConcessivoFim < hoje) {
                                      diasVencido = Math.floor((new Date(hoje).getTime() - new Date(p.periodoConcessivoFim).getTime()) / (1000*60*60*24));
                                    }
                                    return (
                                      <div key={i} className="text-[11px] text-red-700 flex flex-wrap items-center gap-x-2">
                                        <span className="font-semibold">Período {i+1}:</span>
                                        <span>aquisitivo <strong>{aqIni} → {aqFim}</strong></span>
                                        <span className="text-red-500">·</span>
                                        <span>limite p/ conceder: <strong className="text-red-800">{concFim}</strong></span>
                                        {diasVencido > 0 && (
                                          <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-red-200 text-red-800">⚠ vencido há {diasVencido} dia(s)</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {/* VR Proporcional */}
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <div>
                            <span className="text-sm text-gray-700">VR Proporcional</span>
                            <span className="text-[10px] text-gray-400 ml-2">(R$ {calculoPreview.previsaoRescisao.vrDiario}/dia × {calculoPreview.previsaoRescisao.diasTrabalhadosMes} dias)</span>
                          </div>
                          <span className="font-semibold text-sm">{formatMoeda(calculoPreview.previsaoRescisao.vrProporcional)}</span>
                        </div>

                        {/* 13º Proporcional */}
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <div>
                            <span className="text-sm text-gray-700">13º Salário Proporcional</span>
                            <span className="text-[10px] text-gray-400 ml-2">({calculoPreview.previsaoRescisao.meses13o}/12 meses)</span>
                          </div>
                          <span className="font-semibold text-sm">{formatMoeda(calculoPreview.previsaoRescisao.decimoTerceiroProporcional)}</span>
                        </div>

                        {/* Aviso Prévio Indenizado — só aviso prévio do empregador */}
                        {!isPedidoDemissao && (
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <div>
                              <span className="text-sm text-gray-700">Aviso Prévio Indenizado</span>
                              <span className="text-[10px] text-gray-400 ml-2">(Lei 12.506/2011: {calculoPreview.previsaoRescisao.diasExtrasAviso} dias extras)</span>
                            </div>
                            <span className="font-semibold text-sm">{formatMoeda(calculoPreview.previsaoRescisao.avisoPrevioIndenizado)}</span>
                          </div>
                        )}

                        {/* FGTS */}
                        <div className="pt-3 mt-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">FGTS</p>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-gray-50 bg-gray-50 px-2 rounded">
                          <span className="text-xs text-gray-500">FGTS Estimado no período (8% × {calculoPreview.previsaoRescisao.mesesTotais || 0} meses)</span>
                          <span className="text-xs font-medium text-gray-500">{formatMoeda(calculoPreview.previsaoRescisao.fgtsEstimado)}</span>
                        </div>
                        {isPedidoDemissao ? (
                          <>
                            <div className="flex justify-between py-2 border-b border-gray-100 bg-red-50 px-2 rounded">
                              <span className="text-sm text-red-500">Multa 40% FGTS</span>
                              <span className="font-semibold text-sm text-red-500">Não se aplica</span>
                            </div>
                            <div className="flex justify-between py-1.5 bg-red-50 px-2 rounded mt-1">
                              <span className="text-xs text-red-500">Saque FGTS</span>
                              <span className="text-xs font-medium text-red-500">Sem direito — saldo fica retido</span>
                            </div>
                            <div className="flex justify-between py-1.5 bg-red-50 px-2 rounded mt-1">
                              <span className="text-xs text-red-500">Seguro-Desemprego</span>
                              <span className="text-xs font-medium text-red-500">Sem direito</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-sm text-gray-700">Multa 40% FGTS</span>
                            <span className="font-semibold text-sm">{formatMoeda(calculoPreview.previsaoRescisao.multaFGTS)}</span>
                          </div>
                        )}
                      </div>

                      {/* Desconto Aviso Não Cumprido (Art. 487 §2º) */}
                      {parseFloat(calculoPreview.previsaoRescisao.descontoAvisoNaoCumprido || '0') > 0 && (
                        <div className="flex justify-between py-2 mt-2 px-2 bg-red-50 border border-red-200 rounded">
                          <span className="text-sm text-red-700">
                            <strong>(–)</strong> Desconto Aviso não cumprido (Art. 487 §2º — 30 dias)
                          </span>
                          <span className="font-semibold text-sm text-red-700">– {formatMoeda(calculoPreview.previsaoRescisao.descontoAvisoNaoCumprido)}</span>
                        </div>
                      )}

                      {/* Total Verbas */}
                      <div className="mt-4 pt-3 border-t-2 border-green-300 flex justify-between items-center">
                        <div>
                          <span className="text-lg font-bold text-green-800">TOTAL ESTIMADO DA RESCISÃO</span>
                          <p className="text-[10px] text-green-600">{isPedidoDemissao ? 'Saldo + Férias + VR + 13º (sem multa FGTS)' : 'Saldo + Férias + VR + 13º + Aviso Prévio + Multa FGTS'}</p>
                        </div>
                        <span className="text-2xl font-bold text-green-700">{formatMoeda(calculoPreview.previsaoRescisao.total)}</span>
                      </div>

                      {/* Rev. 2203 — INFORMATIVO de Diluição de Caixa: se houver período(s)
                          de férias vencidas, sugerir conceder as férias ANTES da rescisão
                          (separa o pagamento das férias da rescisão e empurra a data de
                          desligamento, diluindo o impacto no fluxo de caixa). */}
                      {parseFloat(calculoPreview.previsaoRescisao.feriasVencidas || '0') > 0 && !isPedidoDemissao && (() => {
                        const valorFV = parseFloat(calculoPreview.previsaoRescisao.feriasVencidas || '0');
                        const totalBruto = parseFloat(calculoPreview.previsaoRescisao.total || '0');
                        const totalSemFV = Math.max(0, totalBruto - valorFV);
                        const periodos = calculoPreview.previsaoRescisao.periodosVencidos || 0;
                        const diasGozo = periodos * 30;
                        return (
                          <div className="mt-3 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3">
                            <p className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                              💡 Sugestão de Diluição de Caixa
                            </p>
                            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                              O colaborador tem <strong>{periodos} período(s) de férias vencidas ({diasGozo} dias) — {formatMoeda(valorFV)}</strong> já somados nesta rescisão.
                              Se compensar pro cronograma, considere <strong>conceder as férias ANTES de efetivar o desligamento</strong>:
                            </p>
                            <ul className="text-[11px] text-amber-800 mt-1.5 ml-4 list-disc space-y-0.5">
                              <li><strong>Férias</strong> são pagas até 2 dias antes do início do gozo (Art. 145 CLT) — separadas da rescisão.</li>
                              <li>O contrato fica suspenso durante o gozo, <strong>empurrando o desligamento em ~{diasGozo} dias</strong> e gerando + 13º/FGTS no período.</li>
                              <li>Caixa da rescisão cai de {formatMoeda(totalBruto)} para <strong>~{formatMoeda(totalSemFV)}</strong> (− {formatMoeda(valorFV)} pagos em outra data).</li>
                              <li>Risco evitado: dobra do Art. 137 CLT se o prazo concessivo já tiver estourado.</li>
                            </ul>
                            <p className="text-[10px] text-amber-700 mt-1.5 italic">
                              Análise meramente informativa — decisão sobre conceder ou indenizar é do RH/gestão conforme operação.
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Seção de Descontos Legais e da Folha (INSS, IRRF, Pensão, Sindical, etc) */}
                  {calculoPreview.previsaoRescisao && parseFloat(calculoPreview.previsaoRescisao.totalDescontos || '0') > 0 && (
                    <div className="bg-white rounded-lg border border-red-200 p-4 mt-4">
                      <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-3">Descontos Legais e da Folha</p>
                      <div className="space-y-0 text-sm">
                        {parseFloat(calculoPreview.previsaoRescisao.descontoINSS || '0') > 0 && (
                          <div className="flex justify-between py-1.5 border-b border-red-50">
                            <span className="text-red-700">INSS (sobre saldo + 13º)</span>
                            <span className="font-semibold text-red-700">– {formatMoeda(calculoPreview.previsaoRescisao.descontoINSS)}</span>
                          </div>
                        )}
                        {parseFloat(calculoPreview.previsaoRescisao.descontoIRRF || '0') > 0 && (
                          <div className="flex justify-between py-1.5 border-b border-red-50">
                            <span className="text-red-700">IRRF (sobre saldo + 13º)</span>
                            <span className="font-semibold text-red-700">– {formatMoeda(calculoPreview.previsaoRescisao.descontoIRRF)}</span>
                          </div>
                        )}
                        {parseFloat(calculoPreview.previsaoRescisao.descontoPensao || '0') > 0 && (
                          <div className="flex justify-between py-1.5 border-b border-red-50">
                            <span className="text-red-700">Pensão Alimentícia</span>
                            <span className="font-semibold text-red-700">– {formatMoeda(calculoPreview.previsaoRescisao.descontoPensao)}</span>
                          </div>
                        )}
                        {parseFloat(calculoPreview.previsaoRescisao.descontoSindical || '0') > 0 && (
                          <div className="flex justify-between py-1.5 border-b border-red-50">
                            <span className="text-red-700">Contribuição Sindical</span>
                            <span className="font-semibold text-red-700">– {formatMoeda(calculoPreview.previsaoRescisao.descontoSindical)}</span>
                          </div>
                        )}
                        {parseFloat(calculoPreview.previsaoRescisao.descontoFaltasAtrasos || '0') > 0 && (
                          <div className="flex justify-between py-1.5 border-b border-red-50">
                            <span className="text-red-700">Faltas / Atrasos do mês</span>
                            <span className="font-semibold text-red-700">– {formatMoeda(calculoPreview.previsaoRescisao.descontoFaltasAtrasos)}</span>
                          </div>
                        )}
                        {parseFloat(calculoPreview.previsaoRescisao.descontoConvenios || '0') > 0 && (
                          <div className="flex justify-between py-1.5 border-b border-red-50">
                            <span className="text-red-700">Convênios (aprovados)</span>
                            <span className="font-semibold text-red-700">– {formatMoeda(calculoPreview.previsaoRescisao.descontoConvenios)}</span>
                          </div>
                        )}
                        {parseFloat(calculoPreview.previsaoRescisao.descontoEpis || '0') > 0 && (
                          <div className="flex justify-between py-1.5 border-b border-red-50">
                            <span className="text-red-700">EPIs (aprovados)</span>
                            <span className="font-semibold text-red-700">– {formatMoeda(calculoPreview.previsaoRescisao.descontoEpis)}</span>
                          </div>
                        )}
                        {parseFloat(calculoPreview.previsaoRescisao.descontoVales || '0') > 0 && (
                          <div className="flex justify-between py-1.5 border-b border-red-50">
                            <span className="text-red-700">Vales / Adiantamentos</span>
                            <span className="font-semibold text-red-700">– {formatMoeda(calculoPreview.previsaoRescisao.descontoVales)}</span>
                          </div>
                        )}
                        {parseFloat(calculoPreview.previsaoRescisao.descontoOutros || '0') > 0 && (
                          <div className="flex justify-between py-1.5 border-b border-red-50">
                            <span className="text-red-700">Outros (aprovados RH)</span>
                            <span className="font-semibold text-red-700">– {formatMoeda(calculoPreview.previsaoRescisao.descontoOutros)}</span>
                          </div>
                        )}
                        <div className="flex justify-between py-2 mt-1 border-t border-red-200">
                          <span className="text-sm font-bold text-red-700">Subtotal Descontos Legais</span>
                          <span className="font-bold text-sm text-red-700">– {formatMoeda(calculoPreview.previsaoRescisao.totalDescontos)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Seção de Descontos avulsos (legado: adiantamentos antigos, EPIs pendentes, ponto) */}
                  {calculoPreview.descontos && calculoPreview.descontos.length > 0 && (
                    <div className="bg-white rounded-lg border border-red-200 p-4 mt-4">
                      <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-3">Outros Descontos Avulsos</p>
                      <div className="space-y-0">
                        {calculoPreview.descontos.map((d: any, i: number) => (
                          <div key={i} className="flex justify-between py-2 border-b border-red-50">
                            <span className="text-sm text-red-700">{d.descricao}</span>
                            <span className="font-semibold text-sm text-red-700">– {formatMoeda(d.valor)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between py-2 mt-1 border-t border-red-200">
                          <span className="text-sm font-bold text-red-700">Subtotal Avulsos</span>
                          <span className="font-bold text-sm text-red-700">– {formatMoeda(calculoPreview.totalDescontos)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Total Líquido (Card 1 — RESCISÃO OFICIAL) */}
                  <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg p-5 mt-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-lg font-bold text-white">TOTAL LÍQUIDO RESCISÃO</span>
                        <p className="text-[10px] text-green-200">Verbas Brutas – Descontos Legais – Outros (oficial)</p>
                      </div>
                      <span className="text-3xl font-bold text-white">{formatMoeda(calculoPreview.totalLiquido || calculoPreview.previsaoRescisao.totalLiquido || calculoPreview.previsaoRescisao.total)}</span>
                    </div>
                    {calculoPreview.previsaoRescisao?.dataLimitePagamento && (
                      <p className="text-[10px] text-green-200 mt-2 text-right">Prazo pagamento: {formatDate(calculoPreview.previsaoRescisao.dataLimitePagamento)} (Art. 477 §6º CLT)</p>
                    )}
                  </div>

                  {/* Card CIPEIRO: Indenização do Período de Estabilidade (Súmula 396 TST) */}
                  {calculoPreview.indenizacaoEstabilidade && calculoPreview.indenizacaoEstabilidade.aplicavel && (() => {
                    const ie = calculoPreview.indenizacaoEstabilidade;
                    return (
                      <div className="rounded-xl border-2 border-red-300 bg-gradient-to-br from-red-50 to-rose-50 p-4 mt-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shrink-0">
                              <ShieldAlert className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase text-red-700 tracking-wider">ALERTA — CUSTO ADICIONAL EVENTUAL</p>
                              <h4 className="text-sm font-bold text-red-900 mt-0.5">Indenização do Período de Estabilidade — Cipeiro</h4>
                              <p className="text-[11px] text-red-700 mt-0.5 leading-relaxed">
                                Súmula 396 do TST. Dispensa SEM justa causa de membro da CIPA com estabilidade.
                                Se a reintegração não for viável, o empregador indeniza o período de estabilidade restante.
                                <strong> Esta verba é SEPARADA</strong> da rescisão acima e não está somada no Total Líquido.
                              </p>
                            </div>
                          </div>
                          <span className="text-xl font-extrabold text-red-700 whitespace-nowrap">{formatMoeda(ie.total)}</span>
                        </div>

                        <div className="bg-white/70 rounded border border-red-200 px-3 py-2 mb-3 text-[11px] text-red-800 flex flex-wrap gap-x-4 gap-y-1">
                          <span>Estabilidade até: <strong>{formatDate(ie.fimEstabilidade)}</strong></span>
                          <span>Período restante: <strong>{ie.diasRestantes} dias (~{ie.mesesRestantes} meses)</strong></span>
                          <span>Base: salário de <strong>{formatMoeda(calculoPreview.previsaoRescisao?.salarioBase || calculoPreview.salarioBase)}</strong></span>
                        </div>

                        <div className="bg-white/60 rounded border border-red-200 divide-y divide-red-100 text-xs">
                          <div className="flex justify-between px-3 py-1.5">
                            <span className="text-red-900">Salários do período restante</span>
                            <span className="font-semibold text-red-800">{formatMoeda(ie.salariosPeriodo)}</span>
                          </div>
                          <div className="flex justify-between px-3 py-1.5">
                            <span className="text-red-900">13º salário proporcional</span>
                            <span className="font-semibold text-red-800">{formatMoeda(ie.decimoTerceiroProporcional)}</span>
                          </div>
                          <div className="flex justify-between px-3 py-1.5">
                            <span className="text-red-900">Férias proporcionais</span>
                            <span className="font-semibold text-red-800">{formatMoeda(ie.feriasProporcional)}</span>
                          </div>
                          <div className="flex justify-between px-3 py-1.5">
                            <span className="text-red-900">1/3 constitucional sobre férias</span>
                            <span className="font-semibold text-red-800">{formatMoeda(ie.tercoConstitucional)}</span>
                          </div>
                          <div className="flex justify-between px-3 py-1.5">
                            <span className="text-red-900">FGTS (8%) sobre os salários do período</span>
                            <span className="font-semibold text-red-800">{formatMoeda(ie.fgtsPeriodo)}</span>
                          </div>
                          <div className="flex justify-between px-3 py-2 bg-red-100/60">
                            <span className="font-bold text-red-800">TOTAL DA INDENIZAÇÃO DE ESTABILIDADE</span>
                            <span className="font-extrabold text-red-700">{formatMoeda(ie.total)}</span>
                          </div>
                        </div>

                        <p className="text-[10px] text-red-600 mt-2 italic">
                          Estimativa gerencial p/ análise da decisão. A dispensa de cipeiro só é permitida por justa causa
                          comprovada em inquérito judicial (Súmula 379 TST); prosseguir pode gerar reintegração + indenização.
                        </p>

                        {(() => {
                          const liquido = parseFloat(String(calculoPreview.totalLiquido || calculoPreview.previsaoRescisao?.totalLiquido || calculoPreview.previsaoRescisao?.total || '0'));
                          const estab = parseFloat(String(ie.total || '0'));
                          const totalGeral = liquido + estab;
                          return (
                            <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-lg p-4 mt-3 border-2 border-slate-700">
                              <div className="flex justify-between items-center gap-3">
                                <div>
                                  <span className="text-base font-bold text-white">TOTAL GERAL (Rescisão + Indenização Estabilidade)</span>
                                  <p className="text-[10px] text-slate-300">Soma do Total Líquido da rescisão com a indenização do período de estabilidade</p>
                                </div>
                                <span className="text-2xl font-extrabold text-white whitespace-nowrap">{formatMoeda(totalGeral.toFixed(2))}</span>
                              </div>
                              <div className="flex justify-end gap-4 mt-2 text-[10px] text-slate-300">
                                <span>Rescisão líquida: {formatMoeda(liquido.toFixed(2))}</span>
                                <span>Indenização estabilidade: {formatMoeda(estab.toFixed(2))}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}

                  {/* Card 2: Rescisão Complementar (uso interno) — abaixo do total líquido oficial */}
                  {calculoPreview.previsaoRescisaoComplementar && (() => {
                    const pc = calculoPreview.previsaoRescisaoComplementar;
                    return (
                      <div className="rounded-xl border-2 border-violet-300 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4 mt-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase text-violet-700 tracking-wider">USO INTERNO</p>
                            <h4 className="text-sm font-bold text-violet-900 mt-0.5">Rescisão Complementar</h4>
                            <p className="text-[10px] text-violet-700 mt-0.5">
                              Calculada apenas sobre o complemento de {formatMoeda(pc.valorComplemento)}/mês — não inclui FGTS, multa 40%, VR ou médias. Não substitui o TRCT.
                            </p>
                          </div>
                          <span className="text-xl font-extrabold text-violet-700 whitespace-nowrap">{formatMoeda(pc.total)}</span>
                        </div>
                        <div className="bg-white/60 rounded border border-violet-200 divide-y divide-violet-100 text-xs">
                          {parseFloat(pc.saldoSalario || '0') > 0 && (
                            <div className="flex justify-between px-3 py-1.5"><span className="text-violet-900">Saldo de Salário ({pc.diasTrabalhadosMes || '?'}d)</span><span className="font-semibold text-violet-800">{formatMoeda(pc.saldoSalario)}</span></div>
                          )}
                          {parseFloat(pc.feriasProporcional || '0') > 0 && (
                            <div className="flex justify-between px-3 py-1.5"><span className="text-violet-900">Férias Proporcionais ({pc.mesesFerias}/12)</span><span className="font-semibold text-violet-800">{formatMoeda(pc.feriasProporcional)}</span></div>
                          )}
                          {parseFloat(pc.tercoConstitucional || '0') > 0 && (
                            <div className="flex justify-between px-3 py-1.5"><span className="text-violet-900">1/3 Constitucional</span><span className="font-semibold text-violet-800">{formatMoeda(pc.tercoConstitucional)}</span></div>
                          )}
                          {parseFloat(pc.feriasVencidas || '0') > 0 && (
                            <div className="flex justify-between px-3 py-1.5"><span className="text-violet-900">Férias Vencidas{pc.periodosVencidos ? ` (${pc.periodosVencidos})` : ''}</span><span className="font-semibold text-violet-800">{formatMoeda(pc.feriasVencidas)}</span></div>
                          )}
                          {parseFloat(pc.tercoFeriasVencidas || '0') > 0 && (
                            <div className="flex justify-between px-3 py-1.5"><span className="text-violet-900">1/3 Férias Vencidas</span><span className="font-semibold text-violet-800">{formatMoeda(pc.tercoFeriasVencidas)}</span></div>
                          )}
                          {parseFloat(pc.decimoTerceiroProporcional || '0') > 0 && (
                            <div className="flex justify-between px-3 py-1.5"><span className="text-violet-900">13º Proporcional ({pc.meses13o}/12)</span><span className="font-semibold text-violet-800">{formatMoeda(pc.decimoTerceiroProporcional)}</span></div>
                          )}
                          {parseFloat(pc.avisoPrevioIndenizado || '0') > 0 && (
                            <div className="flex justify-between px-3 py-1.5"><span className="text-violet-900">Aviso Prévio Indenizado</span><span className="font-semibold text-violet-800">{formatMoeda(pc.avisoPrevioIndenizado)}</span></div>
                          )}
                          <div className="flex justify-between px-3 py-2 bg-violet-100 font-bold">
                            <span className="text-violet-900">TOTAL COMPLEMENTAR</span>
                            <span className="text-violet-900">{formatMoeda(pc.total)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* TOTAL GERAL: oficial + complementar (só se houver complementar) */}
                  {calculoPreview.previsaoRescisaoComplementar && (() => {
                    const oficial = parseFloat(String(calculoPreview.totalLiquido || calculoPreview.previsaoRescisao?.totalLiquido || calculoPreview.previsaoRescisao?.total || '0'));
                    const complementar = parseFloat(String(calculoPreview.previsaoRescisaoComplementar.total || '0'));
                    const totalGeral = oficial + complementar;
                    return (
                      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-lg p-5 mt-4 border-2 border-slate-700">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-lg font-bold text-white">TOTAL GERAL (Oficial + Complementar)</span>
                            <p className="text-[10px] text-slate-300">Soma do TRCT oficial com o cálculo interno sobre o complemento</p>
                          </div>
                          <span className="text-3xl font-extrabold text-white">{formatMoeda(totalGeral.toFixed(2))}</span>
                        </div>
                        <div className="flex justify-end gap-4 mt-2 text-[10px] text-slate-300">
                          <span>Oficial: {formatMoeda(oficial.toFixed(2))}</span>
                          <span>Complementar: {formatMoeda(complementar.toFixed(2))}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3 mt-6 pt-4">
              <Button variant="outline" className="h-11 px-6" onClick={() => { setShowDialog(false); setForm({}); setCalculoPreview(null); }}>Cancelar</Button>
              {!isPedidoDemissao && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 px-6 gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 font-semibold"
                  onClick={handleGerarDocumento}
                  title="Gera o documento de Aviso Prévio (Trabalhado ou Indenizado) sem precisar salvar nem preencher a Redução de Jornada."
                >
                  <FileText className="h-4 w-4" /> Gerar Documento
                </Button>
              )}
              <Button className="h-11 px-8 bg-amber-600 hover:bg-amber-700 text-white font-semibold" onClick={handleSubmit} disabled={createAviso.isPending || updateAviso.isPending}>
                {(createAviso.isPending || updateAviso.isPending)
                  ? "Salvando..."
                  : editingItem
                    ? "Salvar Alterações"
                    : (isPedidoDemissao ? "Registrar Pedido de Demissão" : "Criar Aviso Prévio")}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      </div>

      <Dialog open={confirmEncerrar.open} onOpenChange={(v) => { if (!v) setConfirmEncerrar({ open: false, avisoId: null }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <Clock className="h-5 w-5" /> Encerrar Período
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Encerrar período do aviso prévio? O funcionário ficará como <strong>'Aguardando Baixa'</strong> até a conferência de descontos e envio ao financeiro.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmEncerrar({ open: false, avisoId: null })}>Cancelar</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={confirmarEncerramento}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmExcluir.open} onOpenChange={(v) => { if (!v) setConfirmExcluir({ open: false, avisoId: null }); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" /> Excluir Aviso Prévio
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este aviso prévio? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmExcluir({ open: false, avisoId: null })}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { if (confirmExcluir.avisoId) deleteAviso.mutate({ id: confirmExcluir.avisoId }); setConfirmExcluir({ open: false, avisoId: null }); }}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmCancelar.open} onOpenChange={(v) => { if (!v) setConfirmCancelar({ open: false, avisoId: null, nomeFunc: '' }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" /> Cancelar Aviso Prévio
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {confirmCancelar.nomeFunc && (
              <p className="text-sm font-medium">{confirmCancelar.nomeFunc}</p>
            )}
            <div>
              <label className="text-sm font-medium">Motivo do cancelamento *</label>
              <Textarea
                value={cancelarMotivo}
                onChange={(e) => setCancelarMotivo(e.target.value)}
                placeholder="Informe o motivo do cancelamento..."
                className="mt-1"
              />
            </div>
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm">
              Escolha o que acontece com o funcionário após o cancelamento:
            </div>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full justify-start gap-2"
                variant="outline"
                disabled={updateAviso.isPending || !cancelarMotivo.trim()}
                onClick={() => executarCancelamento('Ativo')}
              >
                <RotateCcw className="h-4 w-4 text-green-600" />
                <div className="text-left">
                  <div className="font-medium">Cancelar e Reativar</div>
                  <div className="text-xs text-muted-foreground">O funcionário volta ao status Ativo</div>
                </div>
              </Button>
              <Button
                className="w-full justify-start gap-2"
                variant="outline"
                disabled={updateAviso.isPending || !cancelarMotivo.trim()}
                onClick={() => executarCancelamento('Desligado')}
              >
                <UserX className="h-4 w-4 text-red-600" />
                <div className="text-left">
                  <div className="font-medium">Cancelar e Desligar</div>
                  <div className="text-xs text-muted-foreground">O funcionário é desligado imediatamente</div>
                </div>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />

      {/* Modal: Editar FGTS Real */}
      <Dialog open={fgtsEditDialog.open} onOpenChange={(v) => { if (!editarFgtsReal.isPending) setFgtsEditDialog(s => ({ ...s, open: v })); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <Edit2 className="h-5 w-5" /> Saldo Real do FGTS
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
              Informe o saldo real do FGTS conforme extrato da CAIXA ou eSocial. A Multa 40% será recalculada com base neste valor.
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Saldo Real do FGTS (R$)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 5.230,45"
                value={fgtsEditDialog.valor}
                onChange={e => setFgtsEditDialog(s => ({ ...s, valor: e.target.value }))}
                className="text-sm"
                autoFocus
              />
            </div>
            {fgtsEditDialog.valor && (() => {
              const saldo = parseFloat(fgtsEditDialog.valor);
              if (isNaN(saldo)) return null;
              return (
                <div className="text-xs text-gray-600">
                  Multa 40% sobre este saldo: <span className="font-bold text-amber-700">{formatMoeda((saldo * 0.4).toFixed(2))}</span>
                </div>
              );
            })()}
          </div>
          <DialogFooter className="gap-2">
            {selectedItem?.fgtsEditadoManualmente && (
              <Button variant="ghost" size="sm" className="text-red-500 mr-auto" disabled={editarFgtsReal.isPending} onClick={() => editarFgtsReal.mutate({ id: selectedItem.id, fgtsReal: null })}>
                Remover edição manual
              </Button>
            )}
            <Button variant="outline" onClick={() => setFgtsEditDialog({ open: false, valor: '' })}>Cancelar</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!fgtsEditDialog.valor || editarFgtsReal.isPending}
              onClick={() => editarFgtsReal.mutate({ id: selectedItem!.id, fgtsReal: fgtsEditDialog.valor })}
            >
              {editarFgtsReal.isPending ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Dar Baixa no Aviso Prévio */}
      <Dialog open={darBaixaModal.open} onOpenChange={(v) => { if (!darBaixa.isPending) setDarBaixaModal(s => ({ ...s, open: v })); }}>
        {/* Rev. 1831 — modal "Dar Baixa": largura 3xl + altura cap 92dvh + body
            interno com scroll próprio (footer e header sempre visíveis sem
            barra de rolagem global no DialogContent). Resolve UX reportada na
            screenshot (modal ~470px de largura forçava scroll vertical). */}
        <DialogContent className="sm:max-w-3xl max-h-[92dvh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" />
              Dar Baixa no Aviso Prévio
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 px-6 py-4 flex-1 overflow-y-auto min-h-0">
            {darBaixaModal.funcionarioNome && (
              <p className="text-sm text-slate-600">
                Funcionário: <span className="font-semibold text-slate-800">{darBaixaModal.funcionarioNome}</span>
              </p>
            )}

            {(() => {
              const ad = darBaixaModal.avisoData;
              const rescisaoJaFeita = !!(ad?.baixaRescisaoData);
              const fgtsJaFeita = !!(ad?.baixaFgtsData);
              const complementarJaFeita = !!(ad?.baixaComplementarData);
              const isPedidoDemissaoModal = ad?.tipo === 'empregado_trabalhado' || ad?.tipo === 'empregado_indenizado';
              const fgtsNaoAplica = isPedidoDemissaoModal;
              let prev: any = null;
              try { prev = ad?.previsaoRescisao ? JSON.parse(ad.previsaoRescisao) : null; } catch {}
              // Rev. 1639 — Complementar (uso interno, "por fora").
              let prevComplementar: any = null;
              try { prevComplementar = ad?.previsaoRescisaoComplementar ? JSON.parse(ad.previsaoRescisaoComplementar) : null; } catch {}
              const totalComplementar = parseFloat(String(prevComplementar?.total ?? '0'));
              // Rev. 1719 — A 3ª tag "Rescisão Complementar" agora aparece SEMPRE
              // (antes só quando havia previsão pré-calculada > 0). Motivo: muitos
              // casos pagos "por fora" não têm previsão registrada, e ainda assim
              // o RH precisa dar baixa do valor real depois. Quando já existe baixa
              // gravada, prioriza esse valor pra exibir como sugerido.
              const temComplementar = true;
              const temPrevComplementar = totalComplementar > 0;
              const valorRescisaoSugerido = prev ? (prev.totalLiquido || prev.total || '0') : (ad?.valorEstimadoTotal || '0');
              const valorFgtsSugerido = prev ? (prev.multaFGTS || '0') : '0';
              const valorComplementarSugerido = complementarJaFeita
                ? String(parseFloat(String(ad?.baixaComplementarValor || '0')).toFixed(2))
                : (temPrevComplementar ? String(totalComplementar.toFixed(2)) : '0');

              return (
                <>
                  {(rescisaoJaFeita || fgtsJaFeita || complementarJaFeita) && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-green-700 uppercase">Baixas já registradas:</p>
                      {/* Rev. 1823 — botões Editar/Estornar ao lado de cada baixa */}
                      {rescisaoJaFeita && (
                        <div className="flex items-center justify-between gap-2 text-xs text-green-700">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">Rescisão: <strong>{formatMoeda(ad.baixaRescisaoValor)}</strong> em {formatDate(ad.baixaRescisaoData)} por {ad.baixaRescisaoPor}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-blue-700 hover:bg-blue-100" title="Editar valor"
                              onClick={() => setEditarBaixaDialog({ open: true, avisoId: ad.id, tipo: 'rescisao', valorAtual: String(ad.baixaRescisaoValor || ''), obs: '' })}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-700 hover:bg-red-100" title="Estornar baixa"
                              onClick={() => setEstornarBaixaDialog({ open: true, avisoId: ad.id, tipo: 'rescisao', valor: String(ad.baixaRescisaoValor || ''), motivo: '' })}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                      {fgtsJaFeita && (
                        <div className="flex items-center justify-between gap-2 text-xs text-green-700">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">Multa FGTS: <strong>{formatMoeda(ad.baixaFgtsValor)}</strong> em {formatDate(ad.baixaFgtsData)} por {ad.baixaFgtsPor}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-blue-700 hover:bg-blue-100" title="Editar valor"
                              onClick={() => setEditarBaixaDialog({ open: true, avisoId: ad.id, tipo: 'fgts', valorAtual: String(ad.baixaFgtsValor || ''), obs: '' })}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-700 hover:bg-red-100" title="Estornar baixa"
                              onClick={() => setEstornarBaixaDialog({ open: true, avisoId: ad.id, tipo: 'fgts', valor: String(ad.baixaFgtsValor || ''), motivo: '' })}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                      {complementarJaFeita && (
                        <div className="flex items-center justify-between gap-2 text-xs text-green-700">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">Rescisão Complementar: <strong>{formatMoeda(ad.baixaComplementarValor)}</strong> em {formatDate(ad.baixaComplementarData)} por {ad.baixaComplementarPor}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-blue-700 hover:bg-blue-100" title="Editar valor"
                              onClick={() => setEditarBaixaDialog({ open: true, avisoId: ad.id, tipo: 'complementar', valorAtual: String(ad.baixaComplementarValor || ''), obs: '' })}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-700 hover:bg-red-100" title="Estornar baixa"
                              onClick={() => setEstornarBaixaDialog({ open: true, avisoId: ad.id, tipo: 'complementar', valor: String(ad.baixaComplementarValor || ''), motivo: '' })}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3">
                    <p className="text-xs font-semibold text-blue-700 uppercase">Tipo da Baixa</p>
                    {!fgtsNaoAplica ? (
                      // Rev. 1719 — 3 cards SEMPRE: Rescisão + Multa FGTS + Rescisão Complementar.
                      // Antes (Rev. 1639) o 3º só aparecia quando havia previsão pré-calculada > 0,
                      // mas pagamentos "por fora" sem previsão também precisam de baixa.
                      <div className="grid gap-2 grid-cols-3">
                        <button
                          type="button"
                          disabled={rescisaoJaFeita}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${
                            darBaixaForm.tipo === 'rescisao' && !rescisaoJaFeita
                              ? 'border-green-500 bg-green-50 shadow-sm'
                              : rescisaoJaFeita
                                ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                                : 'border-gray-200 hover:border-blue-300 cursor-pointer'
                          }`}
                          onClick={() => { if (!rescisaoJaFeita) setDarBaixaForm(f => ({ ...f, tipo: 'rescisao', valor: '' })); }}
                        >
                          <div className="text-sm font-semibold text-slate-800">Rescisão</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">Pago ao colaborador</div>
                          {prev && <div className="text-xs text-green-700 font-semibold mt-1">Estimado: {formatMoeda(valorRescisaoSugerido)}</div>}
                          {rescisaoJaFeita && <div className="text-[10px] text-green-600 mt-1 font-semibold">Já registrada</div>}
                        </button>
                        <button
                          type="button"
                          disabled={fgtsJaFeita}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${
                            darBaixaForm.tipo === 'fgts' && !fgtsJaFeita
                              ? 'border-amber-500 bg-amber-50 shadow-sm'
                              : fgtsJaFeita
                                ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                                : 'border-gray-200 hover:border-blue-300 cursor-pointer'
                          }`}
                          onClick={() => { if (!fgtsJaFeita) setDarBaixaForm(f => ({ ...f, tipo: 'fgts', valor: '' })); }}
                        >
                          <div className="text-sm font-semibold text-slate-800">Multa FGTS</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">Pago à Caixa Econômica</div>
                          {prev && <div className="text-xs text-amber-700 font-semibold mt-1">Estimado: {formatMoeda(valorFgtsSugerido)}</div>}
                          {fgtsJaFeita && <div className="text-[10px] text-green-600 mt-1 font-semibold">Já registrada</div>}
                        </button>
                        <button
                          type="button"
                          disabled={complementarJaFeita}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${
                            darBaixaForm.tipo === 'complementar' && !complementarJaFeita
                              ? 'border-violet-500 bg-violet-50 shadow-sm'
                              : complementarJaFeita
                                ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                                : 'border-gray-200 hover:border-blue-300 cursor-pointer'
                          }`}
                          onClick={() => { if (!complementarJaFeita) setDarBaixaForm(f => ({ ...f, tipo: 'complementar', valor: '' })); }}
                        >
                          <div className="text-sm font-semibold text-slate-800">Rescisão Complementar</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">Uso interno — pago "por fora"</div>
                          {temPrevComplementar ? (
                            <div className="text-xs text-violet-700 font-semibold mt-1">Estimado: {formatMoeda(valorComplementarSugerido)}</div>
                          ) : (
                            <div className="text-[10px] text-violet-600 mt-1 italic">Sem previsão — informar valor pago</div>
                          )}
                          {complementarJaFeita && <div className="text-[10px] text-green-600 mt-1 font-semibold">Já registrada</div>}
                        </button>
                      </div>
                    ) : (
                      // Pedido de demissão: rescisão + complementar (sempre).
                      <div className="grid gap-2 grid-cols-2">
                        <button
                          type="button"
                          disabled={rescisaoJaFeita}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${
                            darBaixaForm.tipo === 'rescisao' && !rescisaoJaFeita
                              ? 'border-green-500 bg-green-50 shadow-sm'
                              : rescisaoJaFeita
                                ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                                : 'border-gray-200 hover:border-blue-300 cursor-pointer'
                          }`}
                          onClick={() => { if (!rescisaoJaFeita) setDarBaixaForm(f => ({ ...f, tipo: 'rescisao', valor: '' })); }}
                        >
                          <div className="text-sm font-semibold text-slate-800">Rescisão (pago ao colaborador)</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">Pedido de demissão — multa FGTS não se aplica</div>
                          {prev && <div className="text-xs text-green-700 font-semibold mt-1">Estimado: {formatMoeda(valorRescisaoSugerido)}</div>}
                          {rescisaoJaFeita && <div className="text-[10px] text-green-600 mt-1 font-semibold">Já registrada</div>}
                        </button>
                        <button
                          type="button"
                          disabled={complementarJaFeita}
                          className={`p-3 rounded-lg border-2 text-left transition-all ${
                            darBaixaForm.tipo === 'complementar' && !complementarJaFeita
                              ? 'border-violet-500 bg-violet-50 shadow-sm'
                              : complementarJaFeita
                                ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                                : 'border-gray-200 hover:border-blue-300 cursor-pointer'
                          }`}
                          onClick={() => { if (!complementarJaFeita) setDarBaixaForm(f => ({ ...f, tipo: 'complementar', valor: '' })); }}
                        >
                          <div className="text-sm font-semibold text-slate-800">Rescisão Complementar</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">Uso interno — pago "por fora"</div>
                          {temPrevComplementar ? (
                            <div className="text-xs text-violet-700 font-semibold mt-1">Estimado: {formatMoeda(valorComplementarSugerido)}</div>
                          ) : (
                            <div className="text-[10px] text-violet-600 mt-1 italic">Sem previsão — informar valor pago</div>
                          )}
                          {complementarJaFeita && <div className="text-[10px] text-green-600 mt-1 font-semibold">Já registrada</div>}
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-700">
                      Valor efetivo da {darBaixaForm.tipo === 'rescisao' ? 'rescisão' : darBaixaForm.tipo === 'fgts' ? 'multa FGTS' : 'rescisão complementar'} *
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-semibold text-slate-500">R$</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0,00"
                        value={darBaixaForm.valor}
                        onChange={e => setDarBaixaForm(f => ({ ...f, valor: e.target.value }))}
                        className="h-9 text-sm flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs whitespace-nowrap"
                        onClick={() => {
                          const sugerido = darBaixaForm.tipo === 'rescisao'
                            ? valorRescisaoSugerido
                            : darBaixaForm.tipo === 'fgts'
                              ? valorFgtsSugerido
                              : valorComplementarSugerido;
                          setDarBaixaForm(f => ({ ...f, valor: parseFloat(String(sugerido || '0')).toFixed(2) }));
                        }}
                      >
                        Usar Estimado
                      </Button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {darBaixaForm.tipo === 'rescisao'
                        ? 'Valor final pago ao colaborador (pode diferir do estimado por faltas, descontos de farmácia, etc.)'
                        : darBaixaForm.tipo === 'fgts'
                          ? 'Valor da multa 40% FGTS depositado na Caixa Econômica Federal'
                          : 'Valor pago "por fora" calculado sobre o complemento salarial — não substitui o TRCT oficial.'}
                    </p>
                  </div>
                </>
              );
            })()}

            <div>
              <label className="text-xs font-medium text-slate-700">Observações <span className="text-slate-400">(opcional)</span></label>
              <Textarea
                className="mt-1 text-sm"
                rows={2}
                placeholder="Descontos extras, faltas, farmácia, ajustes..."
                value={darBaixaForm.observacoes}
                onChange={e => setDarBaixaForm(f => ({ ...f, observacoes: e.target.value }))}
              />
            </div>

            <div className="border rounded-lg p-3 bg-slate-50 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-red-600"
                  checked={darBaixaForm.desligarFuncionario}
                  onChange={e => setDarBaixaForm(f => ({ ...f, desligarFuncionario: e.target.checked, categoriaDesligamento: '', incluirListaNegra: false, motivoListaNegra: '' }))}
                />
                <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
                  <UserX className="h-4 w-4 text-red-500" />
                  Desligar funcionário agora
                </span>
              </label>

              {darBaixaForm.desligarFuncionario && (
                <div className="space-y-3 pl-6 border-l-2 border-red-200">
                  <div>
                    <label className="text-xs font-medium text-red-700">Categoria do desligamento *</label>
                    <Select value={darBaixaForm.categoriaDesligamento || 'none'} onValueChange={v => setDarBaixaForm(f => ({ ...f, categoriaDesligamento: v === 'none' ? '' : v }))}>
                      <SelectTrigger className="mt-1 bg-white border-red-300 text-sm">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecione...</SelectItem>
                        <SelectItem value="Término de contrato">Término de contrato</SelectItem>
                        <SelectItem value="Fim do período de experiência">Fim do período de experiência (Art. 479/480 CLT)</SelectItem>
                        <SelectItem value="Rescisão antecipada - empregador">Rescisão antecipada pelo empregador (Art. 479 CLT)</SelectItem>
                        <SelectItem value="Rescisão antecipada - empregado">Rescisão antecipada pelo empregado (Art. 480 CLT)</SelectItem>
                        <SelectItem value="Justa causa">Justa causa</SelectItem>
                        <SelectItem value="Pedido de demissão">Pedido de demissão</SelectItem>
                        <SelectItem value="Acordo mútuo">Acordo mútuo (Art. 484-A CLT)</SelectItem>
                        <SelectItem value="Fim de obra">Fim de obra</SelectItem>
                        <SelectItem value="Baixo desempenho">Baixo desempenho</SelectItem>
                        <SelectItem value="Indisciplina">Indisciplina</SelectItem>
                        <SelectItem value="Outros">Outros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-600">Motivo / Observações do desligamento <span className="text-slate-400">(opcional)</span></label>
                    <Textarea
                      className="mt-1 text-sm"
                      rows={2}
                      placeholder="Detalhes adicionais sobre o desligamento..."
                      value={darBaixaForm.motivoDesligamento}
                      onChange={e => setDarBaixaForm(f => ({ ...f, motivoDesligamento: e.target.value }))}
                    />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-red-700"
                      checked={darBaixaForm.incluirListaNegra}
                      onChange={e => setDarBaixaForm(f => ({ ...f, incluirListaNegra: e.target.checked, motivoListaNegra: '' }))}
                    />
                    <span className="flex items-center gap-1 text-sm font-medium text-red-700">
                      <ShieldAlert className="h-4 w-4" />
                      Incluir na Blacklist
                    </span>
                  </label>

                  {darBaixaForm.incluirListaNegra && (
                    <div>
                      <label className="text-xs font-medium text-red-700">Motivo da blacklist *</label>
                      <Textarea
                        className="mt-1 text-sm border-red-300"
                        rows={2}
                        placeholder="Informe o motivo para inclusão na lista negra..."
                        value={darBaixaForm.motivoListaNegra}
                        onChange={e => setDarBaixaForm(f => ({ ...f, motivoListaNegra: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 px-6 py-4 border-t shrink-0 bg-white">
            <Button variant="outline" onClick={() => setDarBaixaModal(s => ({ ...s, open: false }))} disabled={darBaixa.isPending}>
              Cancelar
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleConfirmarBaixa}
              disabled={darBaixa.isPending}
            >
              {darBaixa.isPending ? "Processando..." : `Confirmar Baixa ${darBaixaForm.tipo === 'rescisao' ? 'Rescisão' : darBaixaForm.tipo === 'fgts' ? 'Multa FGTS' : 'Rescisão Complementar'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG: EDITAR VALOR DA BAIXA (ADM Master) ===== */}
      <Dialog open={editarBaixaDialog.open} onOpenChange={(v) => { if (!editarBaixa.isPending) setEditarBaixaDialog(s => ({ ...s, open: v })); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <Pencil className="h-5 w-5" /> Editar Valor da Baixa — {editarBaixaDialog.tipo === 'rescisao' ? 'Rescisão' : editarBaixaDialog.tipo === 'fgts' ? 'Multa FGTS' : 'Rescisão Complementar'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm font-medium text-blue-800">Alterar o valor registrado da baixa. O valor anterior será preservado no histórico.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Novo valor (R$) *</label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-semibold text-slate-500">R$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={editarBaixaDialog.valorAtual}
                  onChange={e => setEditarBaixaDialog(s => ({ ...s, valorAtual: e.target.value }))}
                  className="h-9 text-sm flex-1"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Motivo da edição <span className="text-slate-400">(opcional)</span></label>
              <Textarea
                className="mt-1 text-sm"
                rows={2}
                placeholder="Ex: Correção de valor, desconto adicional..."
                value={editarBaixaDialog.obs}
                onChange={e => setEditarBaixaDialog(s => ({ ...s, obs: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditarBaixaDialog(s => ({ ...s, open: false }))} disabled={editarBaixa.isPending}>Cancelar</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!editarBaixaDialog.valorAtual.trim() || editarBaixa.isPending}
              onClick={() => editarBaixa.mutate({ id: editarBaixaDialog.avisoId!, tipo: editarBaixaDialog.tipo, valor: editarBaixaDialog.valorAtual, observacoes: editarBaixaDialog.obs || undefined })}
            >
              {editarBaixa.isPending ? "Salvando..." : "Salvar Alteração"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG: ESTORNAR BAIXA (ADM Master) ===== */}
      <Dialog open={estornarBaixaDialog.open} onOpenChange={(v) => { if (!estornarBaixa.isPending) setEstornarBaixaDialog(s => ({ ...s, open: v })); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <RotateCcw className="h-5 w-5" /> Estornar Baixa — {estornarBaixaDialog.tipo === 'rescisao' ? 'Rescisão' : estornarBaixaDialog.tipo === 'fgts' ? 'Multa FGTS' : 'Rescisão Complementar'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-800">A baixa será completamente removida e o valor estornado.</p>
              <p className="text-xs text-red-600 mt-1">Se o processo estiver concluído, ele voltará para "Aguardando Pagamento".</p>
            </div>
            {estornarBaixaDialog.valor && (
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-sm text-muted-foreground">Valor a estornar: <span className="font-bold text-red-700">{formatMoeda(estornarBaixaDialog.valor)}</span></p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Motivo do estorno <span className="text-red-500">*</span></label>
              <Textarea
                placeholder="Ex: Valor incorreto, pagamento não realizado, duplicidade..."
                value={estornarBaixaDialog.motivo}
                onChange={e => setEstornarBaixaDialog(s => ({ ...s, motivo: e.target.value }))}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEstornarBaixaDialog(s => ({ ...s, open: false }))} disabled={estornarBaixa.isPending}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!estornarBaixaDialog.motivo.trim() || estornarBaixa.isPending}
              onClick={() => estornarBaixa.mutate({ id: estornarBaixaDialog.avisoId!, tipo: estornarBaixaDialog.tipo, motivo: estornarBaixaDialog.motivo.trim() })}
            >
              {estornarBaixa.isPending ? "Processando..." : "Confirmar Estorno"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

          <PrintFooterLGPD />
      {/* Rev. 2078 — Modal de foto ampliada do colaborador */}
      <Dialog open={!!fotoZoom} onOpenChange={(open) => { if (!open) setFotoZoom(null); }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700">
          <DialogHeader className="px-6 py-4 border-b border-slate-700">
            <DialogTitle className="text-white flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-blue-300" />
              {fotoZoom?.nome || "Colaborador"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-8 min-h-[400px]">
            {fotoZoom?.url && !fotoLoadError ? (
              <img
                src={fotoZoom.url}
                alt={fotoZoom.nome}
                className="max-w-full max-h-[70vh] rounded-xl shadow-2xl ring-4 ring-white/20 object-contain"
                onError={() => setFotoLoadError(true)}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-slate-300">
                <div className="rounded-full bg-slate-700/50 p-6 ring-4 ring-slate-600/40">
                  <ImageOff className="h-16 w-16 text-slate-400" />
                </div>
                <p className="text-sm font-medium">
                  {fotoZoom?.url && fotoLoadError ? "Falha ao carregar a foto" : "Sem foto cadastrada"}
                </p>
                <p className="text-xs text-slate-400 max-w-xs text-center">
                  {fotoZoom?.url && fotoLoadError
                    ? "O link da foto está quebrado ou inacessível. Reenvie a foto no módulo de Funcionários."
                    : "Cadastre a foto deste colaborador no módulo de Funcionários para facilitar a identificação visual."}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
