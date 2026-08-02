import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Pencil, Trash2, Landmark, MapPin, Calendar, Loader2, Wifi, X, AlertCircle, CheckCircle, ArrowLeft, FileText, Brain, BookOpen, Wrench, UserCheck, ChevronDown, Merge, Upload, Image as ImageIcon, Building, PackageOpen, ArrowLeftRight, ShieldCheck, HardHat } from "lucide-react";
import ModalAprovadoresEstoque from "@/components/obras/ModalAprovadoresEstoque";
import { TimeCombobox, ENTRADA_OPTIONS, INTERVALO_OPTIONS, SAIDA_OPTIONS } from "@/components/TimeCombobox";
import { useLocation } from "wouter";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { removeAccents } from "@/lib/searchUtils";

// Converte qualquer representação de hora/duração ("HH:MM", "1 hora", "2 horas",
// "1h30", "30 min", "8") para minutos. Robusto contra dados gravados como RÓTULO
// (ex.: intervalo "1 hora" em vez do value "01:00"), que quebrava o cálculo.
// Retorna minutos ou `null` quando o valor é ausente/inválido (sentinela).
// `null` ≠ 0: 0 é um horário válido ("00:00"); `null` força o chamador a
// descartar o dia em vez de tratar lixo textual como meia-noite (inflaria a jornada).
const jornadaParaMinutos = (raw: string | undefined | null): number | null => {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "-") return null;
  let m = s.match(/^(\d{1,2}):(\d{2})$/);            // HH:MM
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(\d{1,2})h(\d{1,2})?$/);             // 1h30, 1h
  if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
  m = s.match(/^(\d{1,2})\s*horas?$/);               // 1 hora, 2 horas
  if (m) return Number(m[1]) * 60;
  m = s.match(/^(\d{1,3})\s*min/);                   // 30 min, 30min
  if (m) return Number(m[1]);
  m = s.match(/^(\d{1,2})$/);                        // só número = horas
  if (m) return Number(m[1]) * 60;
  return null;
};
const minutosParaHHMM = (min: number): string => {
  const h = Math.floor(min / 60), mm = min % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

const STATUS_OPTIONS = [
  { value: "Planejamento", label: "Planejamento", color: "bg-blue-100 text-blue-800" },
  { value: "Em_Andamento", label: "Em Andamento", color: "bg-green-100 text-green-800" },
  { value: "Paralisada", label: "Paralisada", color: "bg-yellow-100 text-yellow-800" },
  { value: "Concluida", label: "Concluída", color: "bg-gray-100 text-gray-800" },
  { value: "Cancelada", label: "Cancelada", color: "bg-red-100 text-red-800" },
];

type ObraForm = {
  nome: string; numOrcamento: string;
  numeroContrato: string;
  cliente: string;
  responsavel: string;
  responsavelId: number | null;
  tstId: number | null;
  tstNome: string;
  encarregadoId: number | null;
  encarregadoNome: string;
  status: string; cep: string; endereco: string;
  dataInicio: string; dataPrevisaoFim: string; observacoes: string;
  usarConvencaoMatriz: number; convencaoId: number | null;
  insalubridadeGrau: string;
  periculosidade: number;
  adicionalNoturnoAtivo: number;
  condicoesVigenciaInicio: string;
  gerenciadoraNome: string;
  gerenciadoraLogoUrl: string;
  clienteLogoUrl: string;
  databookLogoCliente: number;
  databookLogoGestora: number;
  databookLogoConstrutora: number;
  tipoContrato: string;
  percentualGerenciamentoMaterial: string;
  percentualAdm: string;
  terceiroDiaMedicao: number | null;
  terceiroDiaPagamento: number | null;
  terceiroPrazoAprovacaoDias: number | null;
  terceiroPagamentoConformeRecebimento: number;
};

const TIPO_CONTRATO_OPTIONS = [
  { value: "global", label: "Empreitada Global", color: "bg-blue-100 text-blue-800", desc: "MDO + Material + Equipamentos" },
  { value: "mdo", label: "Fornecimento de MDO", color: "bg-amber-100 text-amber-800", desc: "MDO + Gerenciamento de Material (% sobre compras)" },
  { value: "adm", label: "ADM Geral", color: "bg-purple-100 text-purple-800", desc: "% sobre tudo que foi gasto na obra" },
  { value: "projeto", label: "Projetos", color: "bg-green-100 text-green-800", desc: "Somente elaboração e entrega de projeto" },
];

const emptyForm: ObraForm = {
  nome: "", numOrcamento: "",
  numeroContrato: "",
  cliente: "",
  responsavel: "",
  responsavelId: null,
  tstId: null,
  tstNome: "",
  encarregadoId: null,
  encarregadoNome: "",
  status: "Planejamento", cep: "", endereco: "",
  dataInicio: "", dataPrevisaoFim: "", observacoes: "",
  usarConvencaoMatriz: 1, convencaoId: null,
  insalubridadeGrau: "none",
  periculosidade: 0,
  adicionalNoturnoAtivo: 0,
  condicoesVigenciaInicio: "",
  gerenciadoraNome: "",
  gerenciadoraLogoUrl: "",
  clienteLogoUrl: "",
  databookLogoCliente: 1,
  databookLogoGestora: 1,
  databookLogoConstrutora: 0,
  tipoContrato: "global",
  percentualGerenciamentoMaterial: "0",
  percentualAdm: "0",
  terceiroDiaMedicao: null,
  terceiroDiaPagamento: null,
  terceiroPrazoAprovacaoDias: null,
  terceiroPagamentoConformeRecebimento: 0,
};

export default function Obras() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const hasCompany = companyIds.length > 0;
  const obrasQ = trpc.obras.list.useQuery({ companyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasCompany });
  const obras = obrasQ.data ?? [];
  const allSnsQ = trpc.obras.listSnsByCompany.useQuery({ companyId }, { enabled: !!companyId });
  const allSns = allSnsQ.data ?? [];

  const availableSnsQ = trpc.obras.listAvailableSns.useQuery({ companyId }, { enabled: !!companyId });
  const availableSns = availableSnsQ.data ?? [];

  const liderancasQ = trpc.obras.listLiderancas.useQuery({ companyId }, { enabled: !!companyId });
  const liderancas = liderancasQ.data ?? [];

  const clientesQ = trpc.clientes.list.useQuery({ companyId }, { enabled: !!companyId });
  const clientes = clientesQ.data ?? [];

  const [clienteAdicionalOpen, setClienteAdicionalOpen] = useState(false);
  const [clienteAdicionalBusca, setClienteAdicionalBusca] = useState("");
  const clienteAdicionalRef = useRef<HTMLDivElement>(null);

  const criarClienteMut = trpc.clientes.criar.useMutation({
    onSuccess: (novo: any) => {
      clientesQ.refetch();
      setForm(f => ({ ...f, cliente: novo.razaoSocial }));
      setNovoClienteModal(false);
      setNovoClienteForm({ razaoSocial: "", nomeFantasia: "", telefone: "", email: "" });
      setClienteOpen(false);
      toast.success("Cliente cadastrado e selecionado!");
    },
    onError: (e: any) => toast.error(`Erro ao cadastrar cliente: ${e.message}`),
  });

  // Rev. 2606 — Cadastro reutilizável de gerenciadoras (nome + logo).
  const gerenciadorasQ = trpc.gerenciadoras.list.useQuery({ companyId }, { enabled: !!companyId });
  const gerenciadoras = gerenciadorasQ.data ?? [];
  const criarGerencMut = trpc.gerenciadoras.criar.useMutation({
    onSuccess: (nova: any) => {
      gerenciadorasQ.refetch();
      setForm(f => ({ ...f, gerenciadoraNome: nova.nome, gerenciadoraLogoUrl: nova.logoUrl || "" }));
      setNovaGerencModal(false);
      setNovaGerencForm({ nome: "", logoUrl: "", cnpj: "", telefone: "", email: "" });
      setGerencOpen(false);
      toast.success("Gerenciadora cadastrada e selecionada!");
    },
    onError: (e: any) => toast.error(`Erro ao cadastrar gerenciadora: ${e.message}`),
  });

  const [saving, setSaving] = useState(false);
  // Rev. 2429 — Modal de aprovadores delegados de auditoria do estoque por obra.
  const [aprovadoresModal, setAprovadoresModal] = useState<{ open: boolean; obraId: number; obraNome: string }>({ open: false, obraId: 0, obraNome: "" });
  const createMut = trpc.obras.create.useMutation({
    onSuccess: () => { obrasQ.refetch(); allSnsQ.refetch(); availableSnsQ.refetch(); setSaving(false); setDialogOpen(false); toast.success("Obra criada com sucesso!"); },
    onError: (err) => { setSaving(false); toast.error(err.message || "Erro ao criar obra"); },
  });
  const updateMut = trpc.obras.update.useMutation({
    onSuccess: () => { obrasQ.refetch(); allSnsQ.refetch(); availableSnsQ.refetch(); setSaving(false); setDialogOpen(false); toast.success("Obra atualizada com sucesso!"); },
    onError: (err) => { setSaving(false); toast.error(err.message || "Erro ao atualizar obra"); },
  });
  // Rev. 2391 — Pre-check de estoque antes de encerrar obra.
  const [, navigate] = useLocation();
  const [estoquePendModal, setEstoquePendModal] = useState<{ open: boolean; obraId: number; obraNome: string; statusAlvo: string; itens: Array<{ id: number; nome: string; quantidade: number; unidade: string }> }>({ open: false, obraId: 0, obraNome: "", statusAlvo: "", itens: [] });
  const checarEstoqueUtils = trpc.useUtils();
  const deleteMut = trpc.obras.delete.useMutation({ onSuccess: () => { obrasQ.refetch(); allSnsQ.refetch(); toast.success("Obra excluída!"); } });
  const mesclarMut = trpc.obras.mesclar.useMutation({
    onSuccess: () => { obrasQ.refetch(); allSnsQ.refetch(); setMesclarDialog({ open: false, sourceObra: null }); setMesclarTargetId(null); toast.success("Obras mescladas com sucesso! Todos os registros foram migrados."); },
    onError: (err) => toast.error(err.message || "Erro ao mesclar obras"),
  });
  const addSnMut = trpc.obras.addSn.useMutation({
    onSuccess: () => { allSnsQ.refetch(); obraSnQ.refetch(); toast.success("SN vinculado com sucesso!"); setNewSn(""); setNewSnApelido(""); },
    onError: (err) => toast.error(err.message),
  });
  const removeSnMut = trpc.obras.removeSn.useMutation({
    onSuccess: () => { allSnsQ.refetch(); obraSnQ.refetch(); toast.success("SN liberado!"); },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Rev. 3451 — Múltiplos clientes por obra (movido para após editingId — fix Rev. 3453)
  const obraClientesQ = (trpc as any).obras.listClientes.useQuery(
    { obraId: editingId ?? 0 },
    { enabled: !!editingId }
  );
  const obraClientesVinculados: { id: number; clienteId: number; razaoSocial: string; nomeFantasia?: string }[] = obraClientesQ.data ?? [];
  const addClienteObraMut = (trpc as any).obras.addCliente.useMutation({
    onSuccess: () => { obraClientesQ.refetch(); },
    onError: (e: any) => toast.error(`Erro ao vincular cliente: ${e.message}`),
  });
  const removeClienteObraMut = (trpc as any).obras.removeCliente.useMutation({
    onSuccess: () => { obraClientesQ.refetch(); },
    onError: (e: any) => toast.error(`Erro ao desvincular cliente: ${e.message}`),
  });

  const [mesclarDialog, setMesclarDialog] = useState<{ open: boolean; sourceObra: any | null }>({ open: false, sourceObra: null });
  const [mesclarTargetId, setMesclarTargetId] = useState<number | null>(null);
  // Rev. 3455 — confirmações sem window.confirm (feio no iOS)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmRemoveSnId, setConfirmRemoveSnId] = useState<number | null>(null);
  const [confirmMesclarOpen, setConfirmMesclarOpen] = useState(false);
  const [form, setForm] = useState<ObraForm>(emptyForm);
  // Jornada de Trabalho da OBRA (por dia da semana). Estado separado (chaves dinâmicas
  // jornada_<dia>_entrada/intervalo/saida) que vira JSON no submit e prevalece sobre a do funcionário.
  const [jornadaForm, setJornadaForm] = useState<Record<string, string>>({});
  const DIAS_JORNADA: { key: string; label: string }[] = [
    { key: "seg", label: "Segunda" }, { key: "ter", label: "Terça" },
    { key: "qua", label: "Quarta" }, { key: "qui", label: "Quinta" },
    { key: "sex", label: "Sexta" }, { key: "sab", label: "Sábado" }, { key: "dom", label: "Domingo" },
  ];
  const decomporJornadaObra = (raw: any): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!raw) return out;
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        DIAS_JORNADA.forEach(({ key }) => {
          if (parsed[key]) {
            out[`jornada_${key}_entrada`] = parsed[key].entrada || "";
            out[`jornada_${key}_intervalo`] = parsed[key].intervalo || "";
            out[`jornada_${key}_saida`] = parsed[key].saida || "";
          }
        });
      }
    } catch { /* formato inválido → vazio */ }
    return out;
  };
  const comporJornadaObra = (): string | null => {
    const obj: Record<string, { entrada: string; intervalo: string; saida: string }> = {};
    DIAS_JORNADA.forEach(({ key }) => {
      const entradaRaw = jornadaForm[`jornada_${key}_entrada`] || "";
      const intervaloRaw = jornadaForm[`jornada_${key}_intervalo`] || "";
      const saidaRaw = jornadaForm[`jornada_${key}_saida`] || "";
      if (entradaRaw && saidaRaw) {
        // Normaliza tudo p/ "HH:MM" canônico — evita gravar rótulo ("1 hora")
        // que depois quebra o cálculo de horas (badge e backend).
        const entMin = jornadaParaMinutos(entradaRaw);
        const saiMin = jornadaParaMinutos(saidaRaw);
        const intMin = jornadaParaMinutos(intervaloRaw);
        obj[key] = {
          // Inválido → mantém o raw (backward compat, não corrompe dado válido).
          entrada: entMin !== null ? minutosParaHHMM(entMin) : entradaRaw,
          intervalo: intMin !== null && intMin > 0 ? minutosParaHHMM(intMin) : "",
          saida: saiMin !== null ? minutosParaHHMM(saiMin) : saidaRaw,
        };
      }
    });
    return Object.keys(obj).length > 0 ? JSON.stringify(obj) : null;
  };
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Em_Andamento");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [newSn, setNewSn] = useState("");
  const [newSnApelido, setNewSnApelido] = useState("");
  const [snValidation, setSnValidation] = useState<{ checking: boolean; available?: boolean; usedByObra?: string }>({ checking: false });
  const [pendingSns, setPendingSns] = useState<{ sn: string; apelido?: string }[]>([]);
  const [snShareConfirm, setSnShareConfirm] = useState<{ open: boolean; sn: string; apelido?: string; usedByObra: string; mode: "add" | "pending" }>({ open: false, sn: "", usedByObra: "", mode: "add" });

  // Query SNs da obra sendo editada
  const obraSnQ = trpc.obras.listSns.useQuery({ obraId: editingId || 0 }, { enabled: !!editingId });
  const obraSns = obraSnQ.data ?? [];

  // Skills summary per obra (for obra cards)
  const skillsByObraQ = trpc.skills.skillsByAllObras.useQuery(
    { companyId, companyIds: isConstrutoras ? companyIds : undefined },
    { enabled: hasCompany }
  );
  const skillsByObraData = (skillsByObraQ.data ?? []) as any[];
  const obrasData = obrasQ.data;
  const skillsByObraMap = useMemo(() => {
    const map: Record<number, { skillNome: string; qtd: number }[]> = {};
    for (const r of skillsByObraData) {
      const oid = Number(r.obraId);
      if (!map[oid]) map[oid] = [];
      map[oid].push({ skillNome: r.skillNome, qtd: Number(r.qtd) });
    }
    // For consolidated obras (construtoras mode), merge skills from all obraIds
    if (obrasData) {
      for (const obra of obrasData as any[]) {
        if (obra.obraIds && obra.obraIds.length > 1) {
          const merged: Record<string, { skillNome: string; qtd: number }> = {};
          for (const oid of obra.obraIds) {
            for (const sk of (map[oid] || [])) {
              if (merged[sk.skillNome]) {
                merged[sk.skillNome].qtd += sk.qtd;
              } else {
                merged[sk.skillNome] = { ...sk };
              }
            }
          }
          map[obra.id] = Object.values(merged);
        }
      }
    }
    return map;
  }, [skillsByObraData, obrasData]);

  // Mapa de SNs por obra para exibição nos cards
  const snsByObra = useMemo(() => {
    const map: Record<number, { sn: string; apelido: string | null; status: string }[]> = {};
    for (const item of allSns) {
      const obraId = item.obraSn.obraId;
      if (obraId == null) continue;
      if (!map[obraId]) map[obraId] = [];
      map[obraId].push({ sn: item.obraSn.sn, apelido: item.obraSn.apelido, status: item.obraSn.status });
    }
    return map;
  }, [allSns]);

  const filtered = useMemo(() => {
    let list = obras;
    if (search) {
      const s = removeAccents(search);
      list = list.filter((o: any) => {
        const matchName = removeAccents(o.nome || '').includes(s);
        const matchOrc = removeAccents(o.numOrcamento || '').includes(s);
        const matchSn = (snsByObra[o.id] || []).some(sn => removeAccents(sn.sn || '').includes(s));
        return matchName || matchOrc || matchSn;
      });
    }
    if (statusFilter !== "Todos") {
      list = list.filter((o: any) => o.status === statusFilter);
    }
    return list;
  }, [obras, search, statusFilter, snsByObra]);

  const openNew = () => { setEditingId(null); setForm(emptyForm); setJornadaForm({}); setNewSn(""); setNewSnApelido(""); setSnValidation({ checking: false }); setPendingSns([]); setNomeError(false); setClienteOpen(false); setClienteBusca(""); setResponsavelOpen(false); setResponsavelBusca(""); setTstOpen(false); setTstBusca(""); setEncarregadoOpen(false); setEncarregadoBusca(""); setDialogOpen(true); };
  const openEdit = (obra: any) => {
    setEditingId(obra.id);
    setForm({
      nome: obra.nome || "", numOrcamento: obra.numOrcamento || obra.codigo || "",
      numeroContrato: obra.numeroContrato || "",
      cliente: obra.cliente || "",
      responsavel: obra.responsavel || "",
      responsavelId: obra.responsavelId ?? null,
      tstId: obra.tstId ?? null,
      tstNome: obra.tstNome || "",
      encarregadoId: obra.encarregadoId ?? null,
      encarregadoNome: obra.encarregadoNome || "",
      status: STATUS_OPTIONS.some(s => s.value === obra.status) ? obra.status : "Planejamento",
      cep: obra.cep || "", endereco: obra.endereco || "",
      dataInicio: obra.dataInicio || "", dataPrevisaoFim: obra.dataPrevisaoFim || "",
      observacoes: obra.observacoes || "",
      usarConvencaoMatriz: obra.usarConvencaoMatriz ?? 1,
      convencaoId: obra.convencaoId ?? null,
      insalubridadeGrau: obra.insalubridadeGrau || "none",
      periculosidade: obra.periculosidade ?? 0,
      adicionalNoturnoAtivo: obra.adicionalNoturnoAtivo ?? 0,
      condicoesVigenciaInicio: obra.condicoesVigenciaInicio || "",
      databookLogoCliente: obra.databookLogoCliente ?? 1,
      databookLogoGestora: obra.databookLogoGestora ?? 1,
      databookLogoConstrutora: obra.databookLogoConstrutora ?? 0,
      gerenciadoraNome: obra.gerenciadoraNome || "",
      gerenciadoraLogoUrl: obra.gerenciadoraLogoUrl || "",
      clienteLogoUrl: obra.clienteLogoUrl || "",
      tipoContrato: obra.tipoContrato || "global",
      percentualGerenciamentoMaterial: obra.percentualGerenciamentoMaterial || "0",
      percentualAdm: obra.percentualAdm || "0",
      terceiroDiaMedicao: obra.terceiroDiaMedicao ?? null,
      terceiroDiaPagamento: obra.terceiroDiaPagamento ?? null,
      terceiroPrazoAprovacaoDias: obra.terceiroPrazoAprovacaoDias ?? null,
      terceiroPagamentoConformeRecebimento: obra.terceiroPagamentoConformeRecebimento ?? 0,
    });
    setJornadaForm(decomporJornadaObra(obra.jornadaTrabalho));
    setNewSn(""); setNewSnApelido(""); setSnValidation({ checking: false }); setNomeError(false);
    setClienteOpen(false); setClienteBusca(""); setResponsavelOpen(false); setResponsavelBusca("");
    setDialogOpen(true);
  };

  const buscarCep = useCallback(async (cep: string) => {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await resp.json();
      if (data.erro) {
        toast.error("CEP não encontrado");
      } else {
        const enderecoCompleto = [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean).join(", ");
        setForm(f => ({ ...f, endereco: enderecoCompleto }));
        toast.success("Endereço preenchido automaticamente!");
      }
    } catch {
      toast.error("Erro ao buscar CEP");
    } finally {
      setBuscandoCep(false);
    }
  }, []);

  const handleCepChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    setForm(f => ({ ...f, cep: formatted }));
    if (digits.length === 8) {
      buscarCep(digits);
    }
  };

  const [nomeError, setNomeError] = useState(false);
  const [clienteOpen, setClienteOpen] = useState(false);
  const [clienteBusca, setClienteBusca] = useState("");
  const clienteRef = useRef<HTMLDivElement>(null);
  const [novoClienteModal, setNovoClienteModal] = useState(false);
  const [novoClienteForm, setNovoClienteForm] = useState({ razaoSocial: "", nomeFantasia: "", telefone: "", email: "" });

  // Rev. 2606 — Gerenciadora vira combobox reutilizável (igual Cliente).
  const [gerencOpen, setGerencOpen] = useState(false);
  const [gerencBusca, setGerencBusca] = useState("");
  const gerencRef = useRef<HTMLDivElement>(null);
  const [novaGerencModal, setNovaGerencModal] = useState(false);
  const [novaGerencForm, setNovaGerencForm] = useState({ nome: "", logoUrl: "", cnpj: "", telefone: "", email: "" });

  const [responsavelOpen, setResponsavelOpen] = useState(false);
  const [responsavelBusca, setResponsavelBusca] = useState("");
  const [tstOpen, setTstOpen] = useState(false);
  const [tstBusca, setTstBusca] = useState("");
  const [encarregadoOpen, setEncarregadoOpen] = useState(false);
  const [encarregadoBusca, setEncarregadoBusca] = useState("");
  const responsavelRef = useRef<HTMLDivElement>(null);
  const liderancasFiltradas = useMemo(() => {
    const q = responsavelBusca.toLowerCase();
    return q ? liderancas.filter((l: any) => l.nomeCompleto?.toLowerCase().includes(q) || (l.funcao || l.cargo || "").toLowerCase().includes(q)) : liderancas;
  }, [liderancas, responsavelBusca]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node)) {
        setClienteOpen(false);
      }
      if (responsavelRef.current && !responsavelRef.current.contains(e.target as Node)) {
        setResponsavelOpen(false);
      }
      if (gerencRef.current && !gerencRef.current.contains(e.target as Node)) {
        setGerencOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const clientesFiltrados = useMemo(() => {
    const q = clienteBusca.toLowerCase();
    return clientes.filter((c: any) =>
      (c.razaoSocial || "").toLowerCase().includes(q) ||
      (c.nomeFantasia || "").toLowerCase().includes(q)
    ).slice(0, 20);
  }, [clientes, clienteBusca]);

  const gerenciadorasFiltradas = useMemo(() => {
    const q = gerencBusca.toLowerCase();
    return gerenciadoras.filter((g: any) => (g.nome || "").toLowerCase().includes(q)).slice(0, 20);
  }, [gerenciadoras, gerencBusca]);

  // Rev. 2606 — Ao EDITAR uma obra cujo nome de gerenciadora bate com o cadastro
  // mas sem logo salvo na obra (criada antes do cadastro existir), resolve o logo
  // a partir do cadastro UMA VEZ por abertura do diálogo. O ref evita brigar com
  // o botão de remover (X) e com a digitação manual.
  const gerencLogoResolvedRef = useRef(false);
  useEffect(() => {
    if (!dialogOpen) { gerencLogoResolvedRef.current = false; return; }
    if (gerencLogoResolvedRef.current) return;
    if (gerenciadoras.length === 0) return;
    const nome = (form.gerenciadoraNome || "").trim().toLowerCase();
    if (!nome || form.gerenciadoraLogoUrl) { gerencLogoResolvedRef.current = true; return; }
    const match = gerenciadoras.find((g: any) => (g.nome || "").trim().toLowerCase() === nome);
    if (match?.logoUrl) setForm(f => (f.gerenciadoraLogoUrl ? f : { ...f, gerenciadoraLogoUrl: match.logoUrl }));
    gerencLogoResolvedRef.current = true;
  }, [dialogOpen, gerenciadoras, form.gerenciadoraNome, form.gerenciadoraLogoUrl]);

  // Rev. 2607 — Mesmo padrão para o CLIENTE: ao editar uma obra cujo cliente bate
  // com o cadastro mas sem logo salvo na obra, resolve o logo do cadastro de clientes
  // UMA VEZ por abertura. Cadastrar o logo do cliente uma vez = aparece em toda obra.
  const clienteLogoResolvedRef = useRef(false);
  useEffect(() => {
    if (!dialogOpen) { clienteLogoResolvedRef.current = false; return; }
    if (clienteLogoResolvedRef.current) return;
    if (clientes.length === 0) return;
    const nome = (form.cliente || "").trim().toLowerCase();
    if (!nome || form.clienteLogoUrl) { clienteLogoResolvedRef.current = true; return; }
    const match = clientes.find((c: any) => (c.razaoSocial || "").trim().toLowerCase() === nome || (c.nomeFantasia || "").trim().toLowerCase() === nome);
    if (match?.logoUrl) setForm(f => (f.clienteLogoUrl ? f : { ...f, clienteLogoUrl: match.logoUrl }));
    clienteLogoResolvedRef.current = true;
  }, [dialogOpen, clientes, form.cliente, form.clienteLogoUrl]);

  const handleSave = async () => {
    if (saving) return;
    const nomeEfetivo = form.nome.trim() || form.numOrcamento.trim();
    if (!nomeEfetivo) {
      setNomeError(true);
      toast.error("Informe o Nome da Obra ou o Nº do Orçamento");
      document.getElementById("input-nome-obra")?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById("input-nome-obra")?.focus();
      return;
    }
    setNomeError(false);
    // Rev. 2391 — Pre-check: se editando e mudando status pra encerrador, verifica estoque do almoxarifado.
    const STATUS_ENCERRADORES = ["Concluida", "Cancelada", "Paralisada"];
    if (editingId && STATUS_ENCERRADORES.includes(form.status)) {
      try {
        const pend = await checarEstoqueUtils.obras.checarEstoquePendente.fetch({ obraId: editingId });
        if (pend?.temPendente) {
          setEstoquePendModal({
            open: true,
            obraId: editingId,
            obraNome: nomeEfetivo,
            statusAlvo: form.status,
            itens: pend.itens,
          });
          return; // não salva; usuário precisa transferir o estoque primeiro
        }
      } catch (e) {
        // se a checagem falhar, deixa o backend decidir (ele também guarda)
      }
    }
    setSaving(true);
    const logoFields = ["clienteLogoUrl", "gerenciadoraLogoUrl", "gerenciadoraNome"];
    const cleanForm = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? (logoFields.includes(k) ? null : undefined) : v])
    ) as any;
    cleanForm.nome = nomeEfetivo;
    cleanForm.jornadaTrabalho = comporJornadaObra();
    if (cleanForm.status && !STATUS_OPTIONS.some((s: any) => s.value === cleanForm.status)) {
      cleanForm.status = "Planejamento";
    }
    if (editingId) {
      updateMut.mutate({ id: editingId, ...cleanForm } as any);
    } else {
      createMut.mutate({ companyId, ...cleanForm, sns: pendingSns.length > 0 ? pendingSns : undefined } as any);
    }
  };

  const handleDelete = (id: number) => {
    setConfirmDeleteId(id);
  };

  const handleAddSn = (forceShare?: boolean) => {
    if (!newSn.trim()) { toast.error("Informe o número do SN"); return; }
    if (!editingId) { toast.error("Salve a obra primeiro para vincular SNs"); return; }
    if (!forceShare && checkSnQ.data && !checkSnQ.data.available) {
      setSnShareConfirm({ open: true, sn: newSn.trim(), apelido: newSnApelido.trim() || undefined, usedByObra: checkSnQ.data.usedByObra || "outra obra", mode: "add" });
      return;
    }
    addSnMut.mutate({ companyId, obraId: editingId, sn: newSn.trim(), apelido: newSnApelido.trim() || undefined, forceShare: forceShare || false });
  };

  const handleRemoveSn = (id: number) => {
    setConfirmRemoveSnId(id);
  };

  // Validação em tempo real do SN
  const checkSnQ = trpc.obras.checkSnAvailability.useQuery(
    { companyId, sn: newSn.trim(), excludeObraId: editingId || undefined },
    { enabled: !!companyId && newSn.trim().length >= 2 }
  );

  const getStatusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find(s => s.value === status);
    return opt ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${opt.color}`}>{opt.label}</span> : status;
  };

  const getTipoContratoBadge = (tipo: string) => {
    const opt = TIPO_CONTRATO_OPTIONS.find(t => t.value === tipo);
    if (!opt || tipo === "global") return null;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${opt.color}`}>{opt.label}</span>;
  };

  const isObraInativa = form.status === "Concluida" || form.status === "Cancelada" || form.status === "Paralisada";

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Obras</h1>
            <p className="text-muted-foreground text-sm">Cadastro e gestão de obras e projetos</p>
          </div>
          <div className="flex items-center gap-2">
            <PrintActions title="Obras" />
            <Button onClick={openNew} className="bg-[#1B2A4A] hover:bg-[#243660]">
              <Plus className="h-4 w-4 mr-2" /> Nova Obra
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, nº orçamento ou SN..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos os Status</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Landmark className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-lg">Nenhuma obra encontrada</h3>
              <p className="text-muted-foreground text-sm mt-1">Cadastre a primeira obra.</p>
              <Button onClick={openNew} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                <Plus className="h-4 w-4 mr-2" /> Nova Obra
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((obra: any) => {
              const obraSnList = snsByObra[obra.id] || [];
              const activeSns = obraSnList.filter(s => s.status === "ativo");
              return (
                <Card key={obra.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="mb-3">
                      <div className="flex flex-wrap items-center gap-1 mb-1">
                        {getTipoContratoBadge(obra.tipoContrato)}
                        {getStatusBadge(obra.status)}
                      </div>
                      <h3 className="font-semibold text-base leading-tight">{obra.nome}</h3>
                      {(obra.numOrcamento || obra.codigo) && <p className="text-xs text-muted-foreground">Orç: {obra.numOrcamento || obra.codigo}</p>}
                      {obra.cliente && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <UserCheck className="h-3 w-3 text-blue-400 shrink-0" />
                          <p className="text-xs text-blue-700 font-medium truncate">{obra.cliente}</p>
                        </div>
                      )}
                    </div>
                    {/* Condições de trabalho */}
                    {(obra.insalubridadeGrau && obra.insalubridadeGrau !== "none") || obra.periculosidade === 1 || obra.adicionalNoturnoAtivo === 1 ? (
                      <div className="flex flex-wrap gap-1 mb-2 mt-1">
                        {obra.insalubridadeGrau && obra.insalubridadeGrau !== "none" && (
                          <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">
                            Insalubre ({obra.insalubridadeGrau === "minimo" ? "10%" : obra.insalubridadeGrau === "medio" ? "20%" : "40%"})
                          </Badge>
                        )}
                        {obra.periculosidade === 1 && (
                          <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                            Periculosa (30%)
                          </Badge>
                        )}
                        {obra.adicionalNoturnoAtivo === 1 && (
                          <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200">
                            Add. Noturno
                          </Badge>
                        )}
                      </div>
                    ) : null}
                    {/* SNs vinculados */}
                    {activeSns.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {activeSns.map((s, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
                            <Wifi className="h-2.5 w-2.5" />
                            {s.sn}{s.apelido ? ` (${s.apelido})` : ""}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {obra.endereco && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{obra.endereco}</span>
                      </div>
                    )}
                    {obra.dataInicio && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                        <Calendar className="h-3.5 w-3.5" /> Início: {obra.dataInicio.slice(8,10)}/{obra.dataInicio.slice(5,7)}/{obra.dataInicio.slice(0,4)}
                      </div>
                    )}
                    {/* Skills summary for this obra */}
                    {(skillsByObraMap[obra.id] || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(skillsByObraMap[obra.id] || []).slice(0, 3).map((sk: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-[10px] gap-1 bg-indigo-50 text-indigo-700 border-indigo-200">
                            <Wrench className="h-2.5 w-2.5" />
                            {sk.qtd} {sk.skillNome}
                          </Badge>
                        ))}
                        {(skillsByObraMap[obra.id] || []).length > 3 && (
                          <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-600">
                            +{(skillsByObraMap[obra.id] || []).length - 3} mais
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => openEdit(obra)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                      </Button>
                      <Button variant="outline" size="sm" className="text-amber-600 hover:text-amber-700 border-amber-200 hover:border-amber-300"
                        onClick={() => { setMesclarDialog({ open: true, sourceObra: obra }); setMesclarTargetId(null); }}>
                        <Merge className="h-3.5 w-3.5 mr-1" /> Mesclar
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(obra.id)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <FullScreenDialog open={dialogOpen} onClose={() => { setDialogOpen(false); setSaving(false); }} title={editingId ? "Editar Obra" : "Nova Obra"} icon={<Landmark className="h-5 w-5 text-white" />}>
        <div className="w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Nome da Obra <span className="text-muted-foreground text-xs">(ou preencha o Nº do Orçamento abaixo)</span></Label>
              <Input
                id="input-nome-obra"
                value={form.nome}
                onChange={e => { setForm(f => ({ ...f, nome: e.target.value })); setNomeError(false); }}
                placeholder="Ex: Hotel QIU 2 - 4ª Fase"
                className={nomeError ? "border-red-500 focus-visible:ring-red-400" : ""}
              />
              {nomeError && <p className="text-xs text-red-500 mt-1">Informe o nome da obra ou o Nº do Orçamento.</p>}
            </div>

            {/* ── TIPO DE CONTRATO ─────────────────── */}
            <div className="sm:col-span-2">
              <Label className="flex items-center gap-1.5 mb-1">
                <FileText className="h-3.5 w-3.5 text-indigo-500" />
                Tipo de Contrato
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {TIPO_CONTRATO_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, tipoContrato: opt.value }))}
                    className={`flex flex-col items-start p-3 rounded-lg border-2 transition-all text-left ${
                      form.tipoContrato === opt.value
                        ? "border-indigo-500 bg-indigo-50 shadow-sm"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <span className="font-medium text-sm">{opt.label}</span>
                    <span className="text-xs text-slate-500 mt-0.5">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {form.tipoContrato === "mdo" && (
              <div className="sm:col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <Label className="text-amber-800 font-medium text-sm mb-2 block">
                  Percentual de Gerenciamento de Material (%)
                </Label>
                <p className="text-xs text-amber-600 mb-2">
                  Taxa cobrada sobre o valor total de material comprado (ex: 8% a 12%). Esse percentual gera um recebível variável além do contrato de MDO.
                </p>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={form.percentualGerenciamentoMaterial}
                  onChange={e => setForm(f => ({ ...f, percentualGerenciamentoMaterial: e.target.value }))}
                  placeholder="Ex: 10"
                  className="max-w-[150px] bg-white"
                />
              </div>
            )}

            {form.tipoContrato === "adm" && (
              <div className="sm:col-span-2 bg-purple-50 border border-purple-200 rounded-lg p-4">
                <Label className="text-purple-800 font-medium text-sm mb-2 block">
                  Percentual ADM (%)
                </Label>
                <p className="text-xs text-purple-600 mb-2">
                  Percentual cobrado sobre tudo que foi gasto na obra no mês.
                </p>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={form.percentualAdm}
                  onChange={e => setForm(f => ({ ...f, percentualAdm: e.target.value }))}
                  placeholder="Ex: 15"
                  className="max-w-[150px] bg-white"
                />
              </div>
            )}

            {/* ── CLIENTE ────────────────────────────── */}
            <div className="sm:col-span-2" ref={clienteRef}>
              <Label className="flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-blue-500" />
                Cliente
                {!editingId && (
                  <button
                    type="button"
                    className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    onClick={() => {
                      setNovoClienteForm({ razaoSocial: clienteBusca || "", nomeFantasia: "", telefone: "", email: "" });
                      setClienteOpen(false);
                      setNovoClienteModal(true);
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Cadastrar cliente
                  </button>
                )}
              </Label>
              <div className="relative mt-1">
                <Input
                  value={clienteOpen ? clienteBusca : form.cliente}
                  onChange={e => {
                    setClienteBusca(e.target.value);
                    setForm(f => ({ ...f, cliente: e.target.value, clienteLogoUrl: "" }));
                    setClienteOpen(true);
                  }}
                  onFocus={() => { setClienteBusca(form.cliente); setClienteOpen(true); }}
                  placeholder={clientes.length === 0 ? "Nenhum cliente cadastrado" : "Selecione ou digite o nome do cliente..."}
                  className="pr-8"
                />
                <ChevronDown
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 cursor-pointer"
                  onClick={() => { setClienteBusca(""); setClienteOpen(o => !o); }}
                />
                {form.cliente && !clienteOpen && (
                  <button
                    type="button"
                    className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => { setForm(f => ({ ...f, cliente: "", clienteLogoUrl: "" })); setClienteBusca(""); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {clienteOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {clientesFiltrados.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
                        <span>{clientes.length === 0 ? "Nenhum cliente cadastrado ainda." : "Nenhum cliente encontrado."}</span>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md px-3 py-1.5 hover:bg-blue-50"
                          onClick={() => {
                            setNovoClienteForm({ razaoSocial: clienteBusca, nomeFantasia: "", telefone: "", email: "" });
                            setClienteOpen(false);
                            setNovoClienteModal(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Cadastrar "{clienteBusca || "novo cliente"}"
                        </button>
                      </div>
                    ) : (
                      <>
                        {clientesFiltrados.map((c: any) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2.5 hover:bg-blue-50 flex items-start gap-2.5 border-b border-slate-50 last:border-0"
                            onClick={() => {
                              setForm(f => ({ ...f, cliente: c.razaoSocial, clienteLogoUrl: c.logoUrl || "" }));
                              setClienteOpen(false);
                            }}
                          >
                            <UserCheck className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-slate-800">{c.razaoSocial}</p>
                              {c.nomeFantasia && c.nomeFantasia !== c.razaoSocial && (
                                <p className="text-xs text-slate-500">{c.nomeFantasia}</p>
                              )}
                            </div>
                          </button>
                        ))}
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 flex items-center gap-2 border-t border-slate-100 text-blue-600 hover:bg-blue-50 text-xs font-medium"
                          onClick={() => {
                            setNovoClienteForm({ razaoSocial: clienteBusca, nomeFantasia: "", telefone: "", email: "" });
                            setClienteOpen(false);
                            setNovoClienteModal(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Cadastrar novo cliente
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── CLIENTES ADICIONAIS (Rev. 3451 — múltiplos donos da obra) ── */}
            {editingId && (
              <div className="sm:col-span-2" ref={clienteAdicionalRef}>
                <Label className="flex items-center gap-1.5 mb-1">
                  <UserCheck className="h-3.5 w-3.5 text-indigo-500" />
                  Clientes adicionais
                  <span className="text-[10px] text-slate-400 font-normal ml-1">(quando há mais de um dono da obra)</span>
                </Label>
                {/* Chips dos clientes já vinculados */}
                {obraClientesVinculados.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {obraClientesVinculados.map((oc) => (
                      <span key={oc.id} className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-medium rounded-full px-2.5 py-0.5">
                        {oc.nomeFantasia && oc.nomeFantasia !== oc.razaoSocial ? oc.nomeFantasia : oc.razaoSocial}
                        <button
                          type="button"
                          className="ml-0.5 text-indigo-400 hover:text-red-500 transition-colors"
                          disabled={removeClienteObraMut.isPending}
                          onClick={() => removeClienteObraMut.mutate({ id: oc.id })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {/* Combobox para adicionar */}
                <div className="relative">
                  <Input
                    value={clienteAdicionalOpen ? clienteAdicionalBusca : ""}
                    onChange={e => { setClienteAdicionalBusca(e.target.value); setClienteAdicionalOpen(true); }}
                    onFocus={() => { setClienteAdicionalBusca(""); setClienteAdicionalOpen(true); }}
                    placeholder="Adicionar outro cliente…"
                    className="pr-8 text-sm"
                  />
                  <Plus
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 cursor-pointer"
                    onClick={() => setClienteAdicionalOpen(o => !o)}
                  />
                  {clienteAdicionalOpen && (() => {
                    const jaVinculados = new Set(obraClientesVinculados.map((c) => c.clienteId));
                    const q = clienteAdicionalBusca.toLowerCase();
                    const opts = clientes.filter((c: any) => {
                      if (jaVinculados.has(c.id)) return false;
                      if (!q) return true;
                      return (c.razaoSocial || "").toLowerCase().includes(q) || (c.nomeFantasia || "").toLowerCase().includes(q);
                    });
                    return (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {opts.length === 0 ? (
                          <div className="px-3 py-3 text-center text-sm text-slate-400">Nenhum cliente disponível.</div>
                        ) : opts.map((c: any) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 flex items-start gap-2 border-b border-slate-50 last:border-0"
                            disabled={addClienteObraMut.isPending}
                            onClick={() => {
                              addClienteObraMut.mutate({ obraId: editingId!, clienteId: c.id, companyId });
                              setClienteAdicionalOpen(false);
                              setClienteAdicionalBusca("");
                            }}
                          >
                            <UserCheck className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-slate-800">{c.razaoSocial}</p>
                              {c.nomeFantasia && c.nomeFantasia !== c.razaoSocial && (
                                <p className="text-xs text-slate-500">{c.nomeFantasia}</p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ── LOGO DO CLIENTE (somente leitura — replica o cadastro do Cliente) ── */}
            <div>
              <Label className="flex items-center gap-1.5 mb-1">
                <ImageIcon className="h-3.5 w-3.5 text-purple-500" />
                Logo do Cliente
              </Label>
              <div className="flex items-center gap-3">
                {form.clienteLogoUrl ? (
                  <img src={form.clienteLogoUrl} alt="Logo cliente" className="h-16 w-auto max-w-[120px] object-contain rounded border border-slate-200 bg-white p-1" />
                ) : (
                  <div className="h-16 w-20 rounded border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-0.5">
                    <ImageIcon className="h-5 w-5 text-slate-300" />
                  </div>
                )}
                <p className="text-[11px] text-slate-400 leading-tight max-w-[180px]">
                  {form.clienteLogoUrl
                    ? "Logo do cadastro do cliente."
                    : "Cadastre o logo em Clientes — ele aparece aqui automaticamente."}
                </p>
              </div>
            </div>

            {/* ── GERENCIADORA ── (Rev. 2606: combobox reutilizável c/ logo) */}
            <div ref={gerencRef}>
              <Label className="flex items-center gap-1.5 mb-1">
                <Building className="h-3.5 w-3.5 text-amber-600" />
                Gerenciadora <span className="text-xs text-slate-400 font-normal">(se houver)</span>
                {!editingId && (
                  <button
                    type="button"
                    className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    onClick={() => {
                      setNovaGerencForm({ nome: gerencBusca || form.gerenciadoraNome || "", logoUrl: "", cnpj: "", telefone: "", email: "" });
                      setGerencOpen(false);
                      setNovaGerencModal(true);
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Cadastrar gerenciadora
                  </button>
                )}
              </Label>
              <div className="relative">
                <Input
                  value={gerencOpen ? gerencBusca : form.gerenciadoraNome}
                  onChange={e => {
                    setGerencBusca(e.target.value);
                    // Ao digitar manualmente, o logo da gerenciadora selecionada
                    // é descartado para não persistir par nome/logo inconsistente.
                    setForm(f => ({ ...f, gerenciadoraNome: e.target.value, gerenciadoraLogoUrl: "" }));
                    setGerencOpen(true);
                  }}
                  onFocus={() => { setGerencBusca(form.gerenciadoraNome); setGerencOpen(true); }}
                  placeholder="Ex: Método Engenharia"
                  className="pr-8"
                />
                <ChevronDown
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 cursor-pointer"
                  onClick={() => { setGerencBusca(""); setGerencOpen(o => !o); }}
                />
                {form.gerenciadoraNome && !gerencOpen && (
                  <button
                    type="button"
                    className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => { setForm(f => ({ ...f, gerenciadoraNome: "", gerenciadoraLogoUrl: "" })); setGerencBusca(""); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {gerencOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {gerenciadorasFiltradas.length === 0 ? (
                      <div className="px-3 py-4 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
                        <span>{gerenciadoras.length === 0 ? "Nenhuma gerenciadora cadastrada ainda." : "Nenhuma gerenciadora encontrada."}</span>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md px-3 py-1.5 hover:bg-blue-50"
                          onClick={() => {
                            setNovaGerencForm({ nome: gerencBusca, logoUrl: "", cnpj: "", telefone: "", email: "" });
                            setGerencOpen(false);
                            setNovaGerencModal(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Cadastrar "{gerencBusca || "nova gerenciadora"}"
                        </button>
                      </div>
                    ) : (
                      <>
                        {gerenciadorasFiltradas.map((g: any) => (
                          <button
                            key={g.id}
                            type="button"
                            className="w-full text-left px-3 py-2.5 hover:bg-blue-50 flex items-center gap-2.5 border-b border-slate-50 last:border-0"
                            onClick={() => {
                              setForm(f => ({ ...f, gerenciadoraNome: g.nome, gerenciadoraLogoUrl: g.logoUrl || "" }));
                              setGerencOpen(false);
                            }}
                          >
                            {g.logoUrl ? (
                              <img src={g.logoUrl} alt="" className="h-7 w-7 object-contain rounded border border-slate-100 bg-white shrink-0" />
                            ) : (
                              <Building className="h-4 w-4 text-amber-400 shrink-0" />
                            )}
                            <p className="text-sm font-medium text-slate-800">{g.nome}</p>
                          </button>
                        ))}
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 flex items-center gap-2 border-t border-slate-100 text-blue-600 hover:bg-blue-50 text-xs font-medium"
                          onClick={() => {
                            setNovaGerencForm({ nome: gerencBusca, logoUrl: "", cnpj: "", telefone: "", email: "" });
                            setGerencOpen(false);
                            setNovaGerencModal(true);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Cadastrar nova gerenciadora
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {/* Logo da gerenciadora — somente leitura (replica o cadastro da Gerenciadora) */}
              <div className="flex items-center gap-3 mt-2">
                {form.gerenciadoraLogoUrl ? (
                  <img src={form.gerenciadoraLogoUrl} alt="Logo gerenciadora" className="h-16 w-auto max-w-[120px] object-contain rounded border border-slate-200 bg-white p-1" />
                ) : (
                  <div className="h-16 w-20 rounded border-2 border-dashed border-slate-200 flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-slate-300" />
                  </div>
                )}
                <p className="text-[11px] text-slate-400 leading-tight max-w-[180px]">
                  {form.gerenciadoraLogoUrl
                    ? "Logo do cadastro da gerenciadora."
                    : "Cadastre o logo ao criar a gerenciadora — ele aparece aqui automaticamente."}
                </p>
              </div>
            </div>

            {/* ── LOGOS NO DATABOOK (Rev. 2879) — quais logos aparecem nas fichas ── */}
            <div className="sm:col-span-2">
              <Label className="flex items-center gap-1.5 mb-1">
                <ImageIcon className="h-3.5 w-3.5 text-blue-500" />
                Logos no Databook
                <span className="text-xs text-slate-400 font-normal">(cabeçalho das fichas)</span>
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  { key: "databookLogoCliente", label: "Cliente", hint: "à esquerda" },
                  { key: "databookLogoConstrutora", label: "Construtora", hint: "ao centro (logo da empresa)" },
                  { key: "databookLogoGestora", label: "Gestora", hint: "à direita" },
                ] as const).map(opt => (
                  <label
                    key={opt.key}
                    className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-blue-600 cursor-pointer"
                      checked={(form as any)[opt.key] === 1}
                      onChange={e => setForm(f => ({ ...f, [opt.key]: e.target.checked ? 1 : 0 }))}
                    />
                    <span className="leading-tight">
                      <span className="block text-sm font-medium text-slate-700">{opt.label}</span>
                      <span className="block text-[11px] text-slate-400">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 leading-tight mt-1">
                Marque quais logos aparecem no topo das fichas técnicas. O logo da Construtora usa o logo da empresa; Cliente e Gestora usam os logos cadastrados acima.
              </p>
            </div>

            {/* ── ENGENHEIRO RESPONSÁVEL ── */}
            <div className="sm:col-span-2" ref={responsavelRef}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Engenheiro / Responsável
                  {!editingId && liderancas.length === 0 && <span className="text-xs text-slate-400 font-normal ml-1">(cadastre colaboradores com cargos de liderança em RH)</span>}
                </Label>
                {/* Rev. 2429 — Atalho pra gerenciar aprovadores de auditoria do estoque desta obra. */}
                {editingId && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1B2A4A] hover:text-[#243456] border border-slate-200 hover:border-[#1B2A4A] rounded-md px-2.5 py-1 hover:bg-slate-50"
                    onClick={() => setAprovadoresModal({ open: true, obraId: editingId, obraNome: form.nome || "" })}
                    title="Gerenciar quem pode aprovar exclusões e ajustes manuais de estoque desta obra"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Aprovadores de auditoria
                  </button>
                )}
              </div>
              <div className="relative mt-1">
                <Input
                  value={responsavelOpen ? responsavelBusca : form.responsavel}
                  onChange={e => { setResponsavelBusca(e.target.value); setForm(f => ({ ...f, responsavel: e.target.value, responsavelId: null })); setResponsavelOpen(true); }}
                  onFocus={() => { setResponsavelBusca(form.responsavel); setResponsavelOpen(true); }}
                  placeholder={liderancas.length === 0 ? "Nenhum colaborador de liderança encontrado" : "Selecione ou digite o nome..."}
                  className="pr-8"
                />
                <ChevronDown
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 cursor-pointer"
                  onClick={() => { setResponsavelBusca(""); setResponsavelOpen(o => !o); }}
                />
                {form.responsavel && !responsavelOpen && (
                  <button
                    type="button"
                    className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => { setForm(f => ({ ...f, responsavel: "" })); setResponsavelBusca(""); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {responsavelOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {liderancasFiltradas.length === 0 ? (
                      <div className="px-3 py-5 text-center text-sm text-slate-400">
                        {liderancas.length === 0
                          ? "Nenhum colaborador de liderança cadastrado. Acesse RH → Colaboradores e verifique os cargos."
                          : "Nenhum colaborador encontrado para esta busca."}
                      </div>
                    ) : (
                      liderancasFiltradas.map((l: any) => (
                        <button
                          key={l.id}
                          type="button"
                          className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 flex items-center gap-2.5 border-b border-slate-50 last:border-0"
                          onClick={() => { setForm(f => ({ ...f, responsavel: l.nomeCompleto, responsavelId: l.id })); setResponsavelOpen(false); }}
                        >
                          {l.fotoUrl
                            ? <img src={l.fotoUrl} className="h-7 w-7 rounded-full object-cover shrink-0" />
                            : <div className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><UserCheck className="h-3.5 w-3.5 text-emerald-600" /></div>
                          }
                          <div>
                            <p className="text-sm font-medium text-slate-800">{l.nomeCompleto}</p>
                            {(l.funcao || l.cargo) && <p className="text-xs text-slate-500">{l.funcao || l.cargo}</p>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── TST ── */}
            <div className="sm:col-span-2">
              <Label className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-orange-500" />
                Técnico de Segurança do Trabalho (TST)
              </Label>
              <div className="relative mt-1">
                <Input
                  value={tstOpen ? tstBusca : form.tstNome}
                  onChange={e => { setTstBusca(e.target.value); setForm(f => ({ ...f, tstNome: e.target.value, tstId: null })); setTstOpen(true); }}
                  onFocus={() => { setTstBusca(form.tstNome); setTstOpen(true); }}
                  placeholder="Selecione o TST..."
                  className="pr-8"
                />
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 cursor-pointer" onClick={() => { setTstBusca(""); setTstOpen(o => !o); }} />
                {form.tstNome && !tstOpen && (
                  <button type="button" className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => { setForm(f => ({ ...f, tstNome: "", tstId: null })); setTstBusca(""); }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {tstOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {liderancas.filter((l: any) => !tstBusca || l.nomeCompleto?.toLowerCase().includes(tstBusca.toLowerCase())).length === 0 ? (
                      <div className="px-3 py-5 text-center text-sm text-slate-400">Nenhum colaborador encontrado</div>
                    ) : liderancas.filter((l: any) => !tstBusca || l.nomeCompleto?.toLowerCase().includes(tstBusca.toLowerCase())).map((l: any) => (
                      <button key={l.id} type="button" className="w-full text-left px-3 py-2.5 hover:bg-orange-50 flex items-center gap-2.5 border-b border-slate-50 last:border-0"
                        onClick={() => { setForm(f => ({ ...f, tstNome: l.nomeCompleto, tstId: l.id })); setTstOpen(false); }}>
                        <div className="h-7 w-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0"><ShieldCheck className="h-3.5 w-3.5 text-orange-500" /></div>
                        <div><p className="text-sm font-medium text-slate-800">{l.nomeCompleto}</p>{(l.funcao || l.cargo) && <p className="text-xs text-slate-500">{l.funcao || l.cargo}</p>}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── ENCARREGADO ── */}
            <div className="sm:col-span-2">
              <Label className="flex items-center gap-1.5">
                <HardHat className="h-3.5 w-3.5 text-yellow-600" />
                Encarregado
              </Label>
              <div className="relative mt-1">
                <Input
                  value={encarregadoOpen ? encarregadoBusca : form.encarregadoNome}
                  onChange={e => { setEncarregadoBusca(e.target.value); setForm(f => ({ ...f, encarregadoNome: e.target.value, encarregadoId: null })); setEncarregadoOpen(true); }}
                  onFocus={() => { setEncarregadoBusca(form.encarregadoNome); setEncarregadoOpen(true); }}
                  placeholder="Selecione o encarregado..."
                  className="pr-8"
                />
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 cursor-pointer" onClick={() => { setEncarregadoBusca(""); setEncarregadoOpen(o => !o); }} />
                {form.encarregadoNome && !encarregadoOpen && (
                  <button type="button" className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => { setForm(f => ({ ...f, encarregadoNome: "", encarregadoId: null })); setEncarregadoBusca(""); }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {encarregadoOpen && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {liderancas.filter((l: any) => !encarregadoBusca || l.nomeCompleto?.toLowerCase().includes(encarregadoBusca.toLowerCase())).length === 0 ? (
                      <div className="px-3 py-5 text-center text-sm text-slate-400">Nenhum colaborador encontrado</div>
                    ) : liderancas.filter((l: any) => !encarregadoBusca || l.nomeCompleto?.toLowerCase().includes(encarregadoBusca.toLowerCase())).map((l: any) => (
                      <button key={l.id} type="button" className="w-full text-left px-3 py-2.5 hover:bg-yellow-50 flex items-center gap-2.5 border-b border-slate-50 last:border-0"
                        onClick={() => { setForm(f => ({ ...f, encarregadoNome: l.nomeCompleto, encarregadoId: l.id })); setEncarregadoOpen(false); }}>
                        <div className="h-7 w-7 rounded-full bg-yellow-100 flex items-center justify-center shrink-0"><HardHat className="h-3.5 w-3.5 text-yellow-600" /></div>
                        <div><p className="text-sm font-medium text-slate-800">{l.nomeCompleto}</p>{(l.funcao || l.cargo) && <p className="text-xs text-slate-500">{l.funcao || l.cargo}</p>}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label>N° do Orçamento</Label>
              <Input value={form.numOrcamento} onChange={e => setForm(f => ({ ...f, numOrcamento: e.target.value }))} placeholder="Ex: ORC-2026-001" />
            </div>
            <div>
              <Label>N° do Contrato</Label>
              <Input value={form.numeroContrato} onChange={e => setForm(f => ({ ...f, numeroContrato: e.target.value }))} placeholder="Ex: CT-2026-0214" />
              <p className="text-[11px] text-muted-foreground mt-1">Aparece no campo "Contrato nº" das fichas do Databook.</p>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status || "Planejamento"} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CEP</Label>
              <div className="relative">
                <Input value={form.cep} onChange={e => handleCepChange(e.target.value)} placeholder="00000-000" />
                {buscandoCep && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            </div>
            <div>
              <Label>Endereço</Label>
              <Input value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} placeholder="Preenchido automaticamente pelo CEP" />
            </div>
            <div>
              <Label>Data de Início</Label>
              <Input type="date" value={form.dataInicio} onChange={e => setForm(f => ({ ...f, dataInicio: e.target.value }))} />
            </div>
            <div>
              <Label>Data de Término</Label>
              <Input type="date" value={form.dataPrevisaoFim} onChange={e => setForm(f => ({ ...f, dataPrevisaoFim: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={3} />
            </div>

            {/* Rev. 4832 — Condição de Pagamento padrão de TERCEIROS (herdada pelos contratos) */}
            <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div>
                <h3 className="font-semibold text-sm text-slate-700">Condição de Pagamento — Terceiros (padrão da obra)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Todo contrato de terceiro novo desta obra herda estes valores automaticamente. Cada contrato pode sobrescrever em "Critérios do Contrato".</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Dia da Medição</Label>
                  <Input type="number" min={1} max={31} placeholder="25" value={form.terceiroDiaMedicao ?? ""} onChange={e => setForm(f => ({ ...f, terceiroDiaMedicao: e.target.value === "" ? null : Math.min(31, Math.max(1, parseInt(e.target.value) || 25)) }))} />
                </div>
                <div>
                  <Label className="text-xs">Aprovação (dias)</Label>
                  <Input type="number" min={1} max={60} placeholder="5" value={form.terceiroPrazoAprovacaoDias ?? ""} onChange={e => setForm(f => ({ ...f, terceiroPrazoAprovacaoDias: e.target.value === "" ? null : Math.min(60, Math.max(1, parseInt(e.target.value) || 5)) }))} />
                </div>
                <div>
                  <Label className="text-xs">Dia do Pagamento</Label>
                  <Input type="number" min={1} max={31} placeholder="10" disabled={form.terceiroPagamentoConformeRecebimento === 1} value={form.terceiroDiaPagamento ?? ""} onChange={e => setForm(f => ({ ...f, terceiroDiaPagamento: e.target.value === "" ? null : Math.min(31, Math.max(1, parseInt(e.target.value) || 10)) }))} />
                </div>
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={form.terceiroPagamentoConformeRecebimento === 1} onChange={e => setForm(f => ({ ...f, terceiroPagamentoConformeRecebimento: e.target.checked ? 1 : 0 }))} />
                <span className="text-xs text-slate-600 leading-relaxed"><span className="font-medium">Pagamento conforme recebimento do cliente</span> — sem dia fixo: os títulos entram com vencimento previsto no fim do mês seguinte e são pagos quando a medição do cliente for recebida.</span>
              </label>
              <p className="text-[11px] text-muted-foreground">Ex. do fluxo padrão: mede até o dia 25, aprova até o dia 1º e paga até o dia 10 do mês seguinte. Vazio = padrão do sistema (25 / 5 / 10). O vencimento do título no Contas a Pagar cai sempre no mês seguinte ao da medição.</p>
            </div>

            {/* Jornada de Trabalho da OBRA — prevalece sobre a do funcionário p/ alocados */}
            <div className="sm:col-span-2 border-t pt-4 mt-2">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-primary">Jornada de Trabalho da Obra</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Quando preenchida, esta jornada <b>prevalece sobre a do funcionário</b> para todos os
                    alocados (respeitando a data de alocação/transferência). Dia em branco = folga.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    let totalMin = 0;
                    DIAS_JORNADA.forEach(({ key }) => {
                      const ent = jornadaForm[`jornada_${key}_entrada`];
                      const sai = jornadaForm[`jornada_${key}_saida`];
                      const intv = jornadaForm[`jornada_${key}_intervalo`];
                      const entMin = jornadaParaMinutos(ent);
                      const saiMin = jornadaParaMinutos(sai);
                      // Entrada/saída inválidas → descarta o dia (não trata lixo como 00:00).
                      if (entMin !== null && saiMin !== null) {
                        let mins = saiMin - entMin;
                        // Intervalo inválido cai p/ 0 (não descarta o dia inteiro).
                        const intMin = jornadaParaMinutos(intv);
                        if (intMin !== null && intMin > 0) mins -= intMin;
                        if (mins > 0) totalMin += mins;
                      }
                    });
                    if (totalMin <= 0) return null;
                    const horas = Math.floor(totalMin / 60);
                    const minutos = totalMin % 60;
                    return (
                      <span className={`text-xs font-bold px-2 py-1 rounded ${totalMin === 2640 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                        {horas}h{minutos > 0 ? String(minutos).padStart(2, '0') : ''}/semana {totalMin === 2640 ? '✅' : ''}
                      </span>
                    );
                  })()}
                  <Button
                    type="button" variant="ghost" size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => setJornadaForm({})}
                  >
                    Limpar
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-border rounded-lg">
                  <thead>
                    <tr className="bg-secondary/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground w-24">Dia</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Entrada</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Intervalo</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Saída</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DIAS_JORNADA.map(({ key, label }) => (
                      <tr key={key} className="border-t">
                        <td className="px-3 py-1.5 font-medium">{label}</td>
                        <td className="px-1 py-1">
                          <TimeCombobox
                            value={jornadaForm[`jornada_${key}_entrada`] || ""}
                            onChange={(v) => setJornadaForm(prev => ({ ...prev, [`jornada_${key}_entrada`]: v }))}
                            options={ENTRADA_OPTIONS}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <TimeCombobox
                            value={jornadaForm[`jornada_${key}_intervalo`] || ""}
                            onChange={(v) => setJornadaForm(prev => ({ ...prev, [`jornada_${key}_intervalo`]: v }))}
                            options={INTERVALO_OPTIONS}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <TimeCombobox
                            value={jornadaForm[`jornada_${key}_saida`] || ""}
                            onChange={(v) => setJornadaForm(prev => ({ ...prev, [`jornada_${key}_saida`]: v }))}
                            options={SAIDA_OPTIONS}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Seção de SNs (Relógios de Ponto) - NOVA OBRA */}
            {!editingId && (
              <div className="sm:col-span-2 border-t pt-4 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Label className="text-base font-semibold">Relógios de Ponto (SNs)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Vincule relógios de ponto a esta obra</p>
                  </div>
                </div>

                {/* SNs já adicionados (pendentes) */}
                {pendingSns.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {pendingSns.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border bg-emerald-50/50 border-emerald-200">
                        <div className="flex items-center gap-3">
                          <Wifi className="h-4 w-4 text-emerald-600" />
                          <div>
                            <span className="font-mono font-semibold text-sm">{item.sn}</span>
                            {item.apelido && <span className="text-xs text-muted-foreground ml-2">({item.apelido})</span>}
                          </div>
                          <Badge className="text-[10px] bg-blue-100 text-blue-700">Será vinculado ao salvar</Badge>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setPendingSns(prev => prev.filter((_, i) => i !== idx))}>
                          <X className="h-3.5 w-3.5 mr-1" /> Remover
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Relógios disponíveis para realocação */}
                {availableSns.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-slate-600 mb-2">Relógios disponíveis para realocação:</p>
                    <div className="flex flex-wrap gap-2">
                      {availableSns.filter(s => !pendingSns.some(p => p.sn === s.sn)).map((s: any) => (
                        <Button key={s.id} variant="outline" size="sm" className="text-xs gap-1.5 border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => setPendingSns(prev => [...prev, { sn: s.sn, apelido: s.apelido || undefined }])}>
                          <Wifi className="h-3 w-3" />
                          {s.sn}{s.apelido ? ` (${s.apelido})` : ""}
                          <Plus className="h-3 w-3" />
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Adicionar novo SN manualmente */}
                <div className="bg-slate-50 rounded-lg border p-3 space-y-2">
                  <p className="text-xs font-medium text-slate-600">Adicionar novo SN</p>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label className="text-xs">Número de Série *</Label>
                      <div className="relative">
                        <Input
                          value={newSn}
                          onChange={e => setNewSn(e.target.value.toUpperCase())}
                          placeholder="Ex: 0001234567"
                          className="font-mono pr-8"
                        />
                        {newSn.trim().length >= 2 && checkSnQ.data && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2">
                            {checkSnQ.data.available ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-amber-500" />
                            )}
                          </div>
                        )}
                      </div>
                      {newSn.trim().length >= 2 && checkSnQ.data && !checkSnQ.data.available && (
                        <p className="text-xs text-amber-600 mt-1">
                          <AlertCircle className="h-3 w-3 inline mr-1" />
                          SN em uso na obra "{checkSnQ.data.usedByObra}" — será compartilhado
                        </p>
                      )}
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">Apelido (opcional)</Label>
                      <Input
                        value={newSnApelido}
                        onChange={e => setNewSnApelido(e.target.value)}
                        placeholder="Ex: Relógio Portaria"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!newSn.trim()) { toast.error("Informe o número do SN"); return; }
                        if (pendingSns.some(p => p.sn === newSn.trim())) { toast.error("SN já adicionado"); return; }
                        if (checkSnQ.data && !checkSnQ.data.available) {
                          setSnShareConfirm({ open: true, sn: newSn.trim(), apelido: newSnApelido.trim() || undefined, usedByObra: checkSnQ.data.usedByObra || "outra obra", mode: "pending" });
                          return;
                        }
                        setPendingSns(prev => [...prev, { sn: newSn.trim(), apelido: newSnApelido.trim() || undefined }]);
                        setNewSn(""); setNewSnApelido("");
                        toast.success("SN adicionado à lista");
                      }}
                      disabled={!newSn.trim() || pendingSns.some(p => p.sn === newSn.trim())}
                      className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Adicionar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Seção de SNs (Relógios de Ponto) - EDIÇÃO */}
            {editingId && (
              <div className="sm:col-span-2 border-t pt-4 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Label className="text-base font-semibold">Relógios de Ponto (SNs)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Vincule os números de série dos relógios DIXI desta obra</p>
                  </div>
                  {isObraInativa && (
                    <Badge variant="secondary" className="text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      SNs serão liberados ao salvar
                    </Badge>
                  )}
                </div>

                {/* Lista de SNs vinculados */}
                {obraSns.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {obraSns.map((sn: any) => (
                      <div key={sn.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${sn.status === "ativo" ? "bg-emerald-50/50 border-emerald-200" : "bg-gray-50 border-gray-200 opacity-60"}`}>
                        <div className="flex items-center gap-3">
                          <Wifi className={`h-4 w-4 ${sn.status === "ativo" ? "text-emerald-600" : "text-gray-400"}`} />
                          <div>
                            <span className="font-mono font-semibold text-sm">{sn.sn}</span>
                            {sn.apelido && <span className="text-xs text-muted-foreground ml-2">({sn.apelido})</span>}
                          </div>
                          <Badge variant={sn.status === "ativo" ? "default" : "secondary"} className="text-[10px]">
                            {sn.status === "ativo" ? "Ativo" : "Liberado"}
                          </Badge>
                        </div>
                        {sn.status === "ativo" && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleRemoveSn(sn.id)} disabled={removeSnMut.isPending}>
                            <X className="h-3.5 w-3.5 mr-1" /> Liberar
                          </Button>
                        )}
                        {sn.status === "inativo" && sn.dataLiberacao && (
                          <span className="text-[10px] text-muted-foreground">Liberado em {new Date(sn.dataLiberacao + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Adicionar novo SN */}
                {!isObraInativa && (
                  <div className="bg-slate-50 rounded-lg border p-3 space-y-2">
                    <p className="text-xs font-medium text-slate-600">Adicionar novo SN</p>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label className="text-xs">Número de Série *</Label>
                        <div className="relative">
                          <Input
                            value={newSn}
                            onChange={e => setNewSn(e.target.value.toUpperCase())}
                            placeholder="Ex: 0001234567"
                            className="font-mono pr-8"
                          />
                          {newSn.trim().length >= 2 && checkSnQ.data && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2">
                              {checkSnQ.data.available ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-amber-500" />
                              )}
                            </div>
                          )}
                        </div>
                        {newSn.trim().length >= 2 && checkSnQ.data && !checkSnQ.data.available && (
                          <p className="text-xs text-amber-600 mt-1">
                            <AlertCircle className="h-3 w-3 inline mr-1" />
                            SN em uso na obra "{checkSnQ.data.usedByObra}" — será compartilhado
                          </p>
                        )}
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">Apelido (opcional)</Label>
                        <Input
                          value={newSnApelido}
                          onChange={e => setNewSnApelido(e.target.value)}
                          placeholder="Ex: Relógio Portaria"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleAddSn()}
                        disabled={addSnMut.isPending || !newSn.trim()}
                        className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                      >
                        {addSnMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                        Vincular
                      </Button>
                    </div>
                  </div>
                )}

                {isObraInativa && obraSns.filter((s: any) => s.status === "ativo").length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                    <p className="text-xs text-amber-800">
                      <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                      Ao salvar com status "{STATUS_OPTIONS.find(s => s.value === form.status)?.label}", todos os SNs ativos serão automaticamente liberados e ficarão disponíveis para outras obras.
                    </p>
                  </div>
                )}
              </div>
            )}


          </div>

          {/* ═══════════ CONVENÇÃO COLETIVA ═══════════ */}
          <ConvencaoSection
            companyId={companyId}
            obraId={editingId}
            usarMatriz={form.usarConvencaoMatriz}
            convencaoId={form.convencaoId}
            onChangeMatriz={(v) => setForm(f => ({ ...f, usarConvencaoMatriz: v, convencaoId: v === 1 ? null : f.convencaoId }))}
            onChangeConvencao={(id) => setForm(f => ({ ...f, convencaoId: id }))}
          />

          {/* ═══════════ CONDIÇÕES DE TRABALHO ═══════════ */}
          <div className="mt-6 border border-slate-200 rounded-lg p-4 bg-slate-50">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-5 w-1 bg-orange-400 rounded-full" />
              <h3 className="font-semibold text-sm text-slate-700">Condições de Trabalho</h3>
              <span className="text-xs text-slate-400 ml-1">(Insalubridade · Periculosidade · Adicional Noturno)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Insalubridade */}
              <div>
                <Label className="text-xs font-medium text-slate-600 mb-1 block">Insalubridade</Label>
                <select
                  value={form.insalubridadeGrau}
                  onChange={e => setForm(f => ({ ...f, insalubridadeGrau: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="none">Não se aplica</option>
                  <option value="minimo">Grau Mínimo — 10% sal. mín.</option>
                  <option value="medio">Grau Médio — 20% sal. mín.</option>
                  <option value="maximo">Grau Máximo — 40% sal. mín.</option>
                </select>
                {form.insalubridadeGrau !== "none" && (
                  <p className="text-xs text-orange-600 mt-1">
                    ⚠ CLT Art. 192 — Laudo técnico obrigatório
                  </p>
                )}
              </div>

              {/* Periculosidade */}
              <div>
                <Label className="text-xs font-medium text-slate-600 mb-1 block">Periculosidade</Label>
                <div className="flex items-center gap-3 h-9">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, periculosidade: f.periculosidade === 1 ? 0 : 1 }))}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${form.periculosidade === 1 ? "bg-red-500" : "bg-slate-200"}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form.periculosidade === 1 ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                  <span className={`text-sm font-medium ${form.periculosidade === 1 ? "text-red-600" : "text-slate-400"}`}>
                    {form.periculosidade === 1 ? "Sim — 30% sal. base" : "Não"}
                  </span>
                </div>
                {form.periculosidade === 1 && form.insalubridadeGrau !== "none" && (
                  <p className="text-xs text-amber-600 mt-1">
                    ℹ Ambos ativos — sistema sugere o mais vantajoso por funcionário
                  </p>
                )}
                {form.periculosidade === 1 && (
                  <p className="text-xs text-orange-600 mt-1">⚠ CLT Art. 193 — Laudo técnico obrigatório</p>
                )}
              </div>

              {/* Adicional Noturno */}
              <div>
                <Label className="text-xs font-medium text-slate-600 mb-1 block">Adicional Noturno <span className="text-slate-400 font-normal">(22h–5h)</span></Label>
                <div className="flex items-center gap-3 h-9">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, adicionalNoturnoAtivo: f.adicionalNoturnoAtivo === 1 ? 0 : 1 }))}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${form.adicionalNoturnoAtivo === 1 ? "bg-indigo-500" : "bg-slate-200"}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form.adicionalNoturnoAtivo === 1 ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                  <span className={`text-sm font-medium ${form.adicionalNoturnoAtivo === 1 ? "text-indigo-600" : "text-slate-400"}`}>
                    {form.adicionalNoturnoAtivo === 1 ? "Ativo — 20% hora noturna" : "Não"}
                  </span>
                </div>
                {form.adicionalNoturnoAtivo === 1 && (
                  <p className="text-xs text-slate-500 mt-1">Calculado pelo ponto eletrônico (horas 22h–5h)</p>
                )}
              </div>
            </div>

            {/* Data de vigência */}
            {(form.insalubridadeGrau !== "none" || form.periculosidade === 1 || form.adicionalNoturnoAtivo === 1) && (
              <div className="mt-4 pt-3 border-t border-slate-200">
                <div className="flex items-center gap-4">
                  <div>
                    <Label className="text-xs font-medium text-slate-600 mb-1 block">Vigência das condições a partir de</Label>
                    <input
                      type="date"
                      value={form.condicoesVigenciaInicio}
                      onChange={e => setForm(f => ({ ...f, condicoesVigenciaInicio: e.target.value }))}
                      className="text-sm border border-slate-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <div className="flex-1 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-xs text-blue-700">
                    ℹ O sistema identificará os funcionários alocados nesta obra a partir desta data e gerará alertas para revisão dos meses afetados.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Rev. 4805 — PROJETOS PARA MEDIÇÃO (pavimentos) ─────────── */}
          {editingId ? (
            <ProjetosMedicaoSection companyId={companyId} obraId={editingId} />
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              📐 <b>Projetos para Medição</b> — salve a obra primeiro; depois volte em Editar para cadastrar os pavimentos e subir os projetos (DXF 1:100).
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => { setDialogOpen(false); setSaving(false); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#1B2A4A] hover:bg-[#243660] min-w-[100px]">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</> : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* ── MINI-MODAL: CADASTRO RÁPIDO DE CLIENTE ───────────────────── */}
      <Dialog open={novoClienteModal} onOpenChange={setNovoClienteModal}>
        <DialogContent style={{ background: '#ffffff', color: '#111827' }} className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-blue-500" />
              Cadastrar Novo Cliente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs font-medium">Razão Social / Nome <span className="text-red-500">*</span></Label>
              <Input
                value={novoClienteForm.razaoSocial}
                onChange={e => setNovoClienteForm(f => ({ ...f, razaoSocial: e.target.value }))}
                placeholder="Nome completo ou Razão Social"
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Nome Fantasia</Label>
              <Input
                value={novoClienteForm.nomeFantasia}
                onChange={e => setNovoClienteForm(f => ({ ...f, nomeFantasia: e.target.value }))}
                placeholder="Opcional"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Telefone</Label>
                <Input
                  value={novoClienteForm.telefone}
                  onChange={e => setNovoClienteForm(f => ({ ...f, telefone: e.target.value }))}
                  placeholder="(00) 00000-0000"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">E-mail</Label>
                <Input
                  value={novoClienteForm.email}
                  onChange={e => setNovoClienteForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemplo.com"
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400">O cliente será salvo no módulo Cadastro → Clientes e já selecionado na obra automaticamente.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoClienteModal(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!novoClienteForm.razaoSocial.trim()) { toast.error("Informe o nome/razão social do cliente."); return; }
                criarClienteMut.mutate({
                  companyId,
                  razaoSocial: novoClienteForm.razaoSocial.trim(),
                  nomeFantasia: novoClienteForm.nomeFantasia.trim() || undefined,
                  telefone: novoClienteForm.telefone.trim() || undefined,
                  email: novoClienteForm.email.trim() || undefined,
                });
              }}
              disabled={criarClienteMut.isPending}
              className="bg-[#1B2A4A] hover:bg-[#243660] min-w-[120px]"
            >
              {criarClienteMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</> : "Salvar Cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MINI-MODAL: CADASTRO RÁPIDO DE GERENCIADORA (Rev. 2606) ──────── */}
      <Dialog open={novaGerencModal} onOpenChange={setNovaGerencModal}>
        <DialogContent style={{ background: '#ffffff', color: '#111827' }} className="max-w-md w-[calc(100vw-2rem)] overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="h-5 w-5 text-amber-600" />
              Cadastrar Nova Gerenciadora
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs font-medium">Nome <span className="text-red-500">*</span></Label>
              <Input
                value={novaGerencForm.nome}
                onChange={e => setNovaGerencForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Método Engenharia"
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs font-medium mb-1 block">Logo</Label>
              <div className="flex items-center gap-3">
                {novaGerencForm.logoUrl ? (
                  <div className="relative group">
                    <img src={novaGerencForm.logoUrl} alt="Logo gerenciadora" className="h-16 w-auto max-w-[120px] object-contain rounded border border-slate-200 bg-white p-1" />
                    <button type="button" className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setNovaGerencForm(f => ({ ...f, logoUrl: "" }))}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-16 w-20 rounded border-2 border-dashed border-slate-200 flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-slate-300" />
                  </div>
                )}
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) { toast.error("Imagem muito grande (máx. 2MB)"); return; }
                    const reader = new FileReader();
                    reader.onload = () => { setNovaGerencForm(f => ({ ...f, logoUrl: reader.result as string })); };
                    reader.readAsDataURL(file);
                  }} />
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md px-3 py-1.5 hover:bg-blue-50">
                    <Upload className="h-3.5 w-3.5" />
                    {novaGerencForm.logoUrl ? "Trocar Logo" : "Enviar Logo"}
                  </span>
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <Label className="text-xs font-medium">CNPJ</Label>
                <Input
                  value={novaGerencForm.cnpj}
                  onChange={e => setNovaGerencForm(f => ({ ...f, cnpj: e.target.value }))}
                  placeholder="00.000.000/0000-00"
                  className="mt-1 w-full"
                />
              </div>
              <div className="min-w-0">
                <Label className="text-xs font-medium">Telefone</Label>
                <Input
                  value={novaGerencForm.telefone}
                  onChange={e => setNovaGerencForm(f => ({ ...f, telefone: e.target.value }))}
                  placeholder="(00) 00000-0000"
                  className="mt-1 w-full"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium">E-mail</Label>
              <Input
                value={novaGerencForm.email}
                onChange={e => setNovaGerencForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@exemplo.com"
                className="mt-1"
              />
            </div>
            <p className="text-xs text-slate-400">A gerenciadora ficará salva e disponível para reaproveitar em obras futuras, já selecionada nesta obra.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaGerencModal(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!novaGerencForm.nome.trim()) { toast.error("Informe o nome da gerenciadora."); return; }
                criarGerencMut.mutate({
                  companyId,
                  nome: novaGerencForm.nome.trim(),
                  logoUrl: novaGerencForm.logoUrl || undefined,
                  cnpj: novaGerencForm.cnpj.trim() || undefined,
                  telefone: novaGerencForm.telefone.trim() || undefined,
                  email: novaGerencForm.email.trim() || undefined,
                });
              }}
              disabled={criarGerencMut.isPending}
              className="bg-[#1B2A4A] hover:bg-[#243660] min-w-[120px]"
            >
              {criarGerencMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</> : "Salvar Gerenciadora"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rev. 2429 — Modal de aprovadores delegados de auditoria do estoque por obra. */}
      <ModalAprovadoresEstoque
        open={aprovadoresModal.open}
        onOpenChange={(v) => setAprovadoresModal((s) => ({ ...s, open: v }))}
        obraId={aprovadoresModal.obraId}
        obraNome={aprovadoresModal.obraNome}
      />

      {/* Diálogo de Mesclagem de Obras */}
      <Dialog open={mesclarDialog.open} onOpenChange={(open) => { if (!open) { setMesclarDialog({ open: false, sourceObra: null }); setMesclarTargetId(null); } }}>
        <DialogContent style={{ background: '#ffffff', color: '#111827' }} className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge className="h-5 w-5 text-amber-600" />
              Mesclar Obra Duplicada
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium mb-1">O que isso faz:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Todos os registros de ponto da obra abaixo serão migrados para a obra destino</li>
                <li>Todos os ajustes manuais, justificativas e aprovações são <strong>preservados</strong></li>
                <li>A obra de origem será excluída após a migração</li>
                <li>Esta ação <strong>não pode ser desfeita</strong></li>
              </ul>
            </div>

            <div>
              <Label className="text-xs font-medium text-slate-500">Obra de origem (será excluída)</Label>
              <div className="mt-1 rounded border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                {mesclarDialog.sourceObra?.nome ?? "—"}
                <span className="ml-2 text-xs text-slate-400">ID: {mesclarDialog.sourceObra?.id}</span>
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium">Obra destino (receberá todos os registros) <span className="text-red-500">*</span></Label>
              <Select
                value={mesclarTargetId?.toString() ?? ""}
                onValueChange={(v) => setMesclarTargetId(Number(v))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione a obra destino..." />
                </SelectTrigger>
                <SelectContent>
                  {obras
                    .filter((o: any) => o.id !== mesclarDialog.sourceObra?.id)
                    .map((o: any) => (
                      <SelectItem key={o.id} value={o.id.toString()}>
                        {o.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setMesclarDialog({ open: false, sourceObra: null }); setMesclarTargetId(null); }}>
              Cancelar
            </Button>
            <Button
              disabled={!mesclarTargetId || mesclarMut.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                if (!mesclarDialog.sourceObra || !mesclarTargetId) return;
                setConfirmMesclarOpen(true);
              }}
            >
              {mesclarMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Mesclando...</> : "Confirmar Mesclagem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={snShareConfirm.open} onOpenChange={(v) => { if (!v) setSnShareConfirm(s => ({ ...s, open: false })); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertCircle className="h-5 w-5" />
              Relógio Compartilhado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              O relógio <strong className="font-mono">{snShareConfirm.sn}</strong> já está vinculado à obra:
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-amber-800">{snShareConfirm.usedByObra}</p>
            </div>
            <p className="text-sm text-slate-600">
              Deseja compartilhar este relógio entre as duas obras? O mesmo equipamento atenderá ambas simultaneamente.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSnShareConfirm(s => ({ ...s, open: false }))}>Cancelar</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                const { sn, apelido, mode } = snShareConfirm;
                setSnShareConfirm(s => ({ ...s, open: false }));
                if (mode === "pending") {
                  setPendingSns(prev => [...prev, { sn, apelido }]);
                  setNewSn(""); setNewSnApelido("");
                  toast.success("SN adicionado (compartilhado)");
                } else {
                  addSnMut.mutate({ companyId, obraId: editingId!, sn, apelido, forceShare: true });
                }
              }}
            >
              Sim, Compartilhar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

          <PrintFooterLGPD />

      {/* Rev. 2391 — Modal: obra com estoque pendente não pode ser encerrada */}
      <Dialog open={estoquePendModal.open} onOpenChange={(v) => !v && setEstoquePendModal(s => ({ ...s, open: false }))}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-white/20 p-2"><PackageOpen className="h-5 w-5" /></div>
              <div>
                <DialogTitle className="text-white text-base font-semibold">Estoque pendente no Almoxarifado</DialogTitle>
                <p className="text-white/90 text-xs mt-0.5">Esta obra ainda tem itens em estoque e não pode ser encerrada.</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-4 space-y-3">
            <p className="text-sm text-gray-700">
              A obra <strong>{estoquePendModal.obraNome}</strong> não pode ter o status alterado para{" "}
              <strong>{STATUS_OPTIONS.find(s => s.value === estoquePendModal.statusAlvo)?.label ?? estoquePendModal.statusAlvo}</strong>{" "}
              porque ainda existem <strong>{estoquePendModal.itens.length} item(ns)</strong> em estoque.
              Transfira tudo para outro depósito (Central ou outra obra) antes de encerrar.
            </p>
            <div className="border border-amber-200 rounded-lg bg-amber-50/50 divide-y divide-amber-100 max-h-56 overflow-auto">
              {estoquePendModal.itens.map(it => (
                <div key={it.id} className="px-3 py-2 flex items-center justify-between text-sm">
                  <span className="truncate text-gray-800">{it.nome}</span>
                  <span className="text-amber-900 font-semibold whitespace-nowrap ml-3">{it.quantidade} {it.unidade}</span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="px-6 py-3 bg-gray-50 border-t flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setEstoquePendModal(s => ({ ...s, open: false }))}>
              Cancelar
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={() => {
                const obraId = estoquePendModal.obraId;
                setEstoquePendModal(s => ({ ...s, open: false }));
                setDialogOpen(false);
                navigate(`/almoxarifado?obra=${obraId}`);
              }}
            >
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              Ir ao Almoxarifado pra transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Rev. 3455 — AlertDialogs (substituem window.confirm) */}
      <AlertDialog open={confirmDeleteId !== null} onOpenChange={o => { if (!o) setConfirmDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir obra</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir esta obra? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDeleteId(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDeleteId != null) deleteMut.mutate({ id: confirmDeleteId }); setConfirmDeleteId(null); }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRemoveSnId !== null} onOpenChange={o => { if (!o) setConfirmRemoveSnId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar SN</AlertDialogTitle>
            <AlertDialogDescription>Deseja liberar este SN? Ele ficará disponível para outras obras.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmRemoveSnId(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmRemoveSnId != null) removeSnMut.mutate({ id: confirmRemoveSnId }); setConfirmRemoveSnId(null); }}>
              Liberar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmMesclarOpen} onOpenChange={o => { if (!o) setConfirmMesclarOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Mesclagem</AlertDialogTitle>
            <AlertDialogDescription>
              {mesclarDialog.sourceObra && <>Mesclar <strong>{mesclarDialog.sourceObra.nome}</strong> (ID {mesclarDialog.sourceObra.id}) → obra destino ID {mesclarTargetId}?<br /><br />Todos os registros de ponto serão migrados e a obra de origem será excluída. <strong>Esta ação não pode ser desfeita.</strong></>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmMesclarOpen(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => { setConfirmMesclarOpen(false); if (mesclarDialog.sourceObra && mesclarTargetId) mesclarMut.mutate({ sourceId: mesclarDialog.sourceObra.id, targetId: mesclarTargetId }); }}>
              Confirmar Mesclagem
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}


// ═══════════ CONVENÇÃO COLETIVA SECTION ═══════════
function ConvencaoSection({ companyId, obraId, usarMatriz, convencaoId, onChangeMatriz, onChangeConvencao }: {
  companyId: number; obraId: number | null;
  usarMatriz: number; convencaoId: number | null;
  onChangeMatriz: (v: number) => void;
  onChangeConvencao: (id: number | null) => void;
}) {
  const [comparando, setComparando] = useState(false);
  const [divergencias, setDivergencias] = useState<string | null>(null);
  const [showDivergencias, setShowDivergencias] = useState(false);

  // Buscar todas as convenções da empresa
  const convencoes = trpc.sprint1.convencao.listAll.useQuery({ companyId }, { enabled: !!companyId });
  const convencaoMatriz = (convencoes.data ?? []).find((c: any) => c.isMatriz === 1);
  const convencaoSelecionada = (convencoes.data ?? []).find((c: any) => c.id === convencaoId);

  // AI comparison
  const compararIA = trpc.sprint1.convencao.compararIA.useMutation({
    onSuccess: (data: any) => {
      setDivergencias(data.analise);
      setShowDivergencias(true);
      toast.success("Comparação concluída!");
    },
    onError: () => toast.error("Erro ao comparar convenções"),
  });

  const handleComparar = () => {
    if (!convencaoMatriz || !convencaoSelecionada) {
      toast.error("É necessário ter a convenção da matriz e uma convenção selecionada para comparar");
      return;
    }
    setComparando(true);
    compararIA.mutate({
      convencaoMatrizId: convencaoMatriz.id,
      convencaoLocalId: convencaoSelecionada.id,
    }, { onSettled: () => setComparando(false) });
  };

  // Salvar divergências na obra
  const updateObraMut = trpc.obras.update.useMutation({
    onSuccess: () => toast.success("Divergências registradas na obra!"),
  });

  const salvarDivergencias = () => {
    if (!obraId || !divergencias) return;
    updateObraMut.mutate({ id: obraId, convencaoDivergencias: divergencias } as any);
  };

  return (
    <div className="border-t pt-5 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen className="h-5 w-5 text-[#D4A843]" />
        <h3 className="text-base font-semibold">Convenção Coletiva</h3>
      </div>

      {/* Toggle: Usar Matriz ou Outra */}
      <div className="space-y-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onChangeMatriz(1)}
            className={`flex-1 p-3 rounded-lg border-2 text-left transition-all ${
              usarMatriz === 1
                ? "border-[#D4A843] bg-amber-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${usarMatriz === 1 ? "border-[#D4A843]" : "border-gray-300"}`}>
                {usarMatriz === 1 && <div className="w-2 h-2 rounded-full bg-[#D4A843]" />}
              </div>
              <span className="font-medium text-sm">Adotar Convenção da Matriz</span>
            </div>
            {convencaoMatriz && (
              <p className="text-xs text-muted-foreground mt-1 ml-6">
                {convencaoMatriz.nome} — {convencaoMatriz.sindicato || "Sindicato não informado"}
                {convencaoMatriz.vigenciaFim && <span className="ml-1">(até {convencaoMatriz.vigenciaFim})</span>}
              </p>
            )}
            {!convencaoMatriz && (
              <p className="text-xs text-red-500 mt-1 ml-6">Nenhuma convenção marcada como matriz. Cadastre em Empresas → Convenção Coletiva.</p>
            )}
          </button>

          <button
            type="button"
            onClick={() => onChangeMatriz(0)}
            className={`flex-1 p-3 rounded-lg border-2 text-left transition-all ${
              usarMatriz === 0
                ? "border-[#D4A843] bg-amber-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${usarMatriz === 0 ? "border-[#D4A843]" : "border-gray-300"}`}>
                {usarMatriz === 0 && <div className="w-2 h-2 rounded-full bg-[#D4A843]" />}
              </div>
              <span className="font-medium text-sm">Usar Outra Convenção</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6">Selecione uma convenção específica para esta obra</p>
          </button>
        </div>

        {/* Seletor de convenção quando não usa matriz */}
        {usarMatriz === 0 && (
          <div className="ml-1 space-y-3">
            <div>
              <Label className="text-sm">Convenção Coletiva da Obra</Label>
              <Select
                value={convencaoId?.toString() || ""}
                onValueChange={(v) => onChangeConvencao(v ? parseInt(v) : null)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione uma convenção..." />
                </SelectTrigger>
                <SelectContent>
                  {(convencoes.data ?? []).filter((c: any) => c.isMatriz !== 1).map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.nome} {c.sindicato ? `(${c.sindicato})` : ""} {c.status === "vigente" ? "✓" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Detalhes da convenção selecionada */}
            {convencaoSelecionada && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm space-y-1">
                <p className="font-medium text-blue-900">{convencaoSelecionada.nome}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-blue-800 text-xs">
                  {convencaoSelecionada.sindicato && <p>Sindicato: {convencaoSelecionada.sindicato}</p>}
                  {convencaoSelecionada.pisoSalarial && <p>Piso: R$ {convencaoSelecionada.pisoSalarial}</p>}
                  {convencaoSelecionada.percentualReajuste && <p>Reajuste: {convencaoSelecionada.percentualReajuste}%</p>}
                  {convencaoSelecionada.vigenciaInicio && <p>Vigência: {convencaoSelecionada.vigenciaInicio} a {convencaoSelecionada.vigenciaFim}</p>}
                </div>
              </div>
            )}

            {/* Botão de comparar com IA */}
            {convencaoSelecionada && convencaoMatriz && (
              <Button
                type="button"
                variant="outline"
                onClick={handleComparar}
                disabled={comparando}
                className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                {comparando ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Comparando com IA...</>
                ) : (
                  <><Brain className="h-4 w-4 mr-2" /> Comparar com Convenção da Matriz (IA)</>
                )}
              </Button>
            )}

            {/* Resultado da comparação */}
            {showDivergencias && divergencias && (
              <div className="p-4 rounded-lg bg-purple-50 border border-purple-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-purple-900 flex items-center gap-2">
                    <Brain className="h-4 w-4" /> Análise de Divergências (IA)
                  </h4>
                  {obraId && (
                    <Button size="sm" variant="outline" onClick={salvarDivergencias}
                      disabled={updateObraMut.isPending}
                      className="text-xs border-purple-300 text-purple-700 hover:bg-purple-100">
                      {updateObraMut.isPending ? "Salvando..." : "Registrar na Obra"}
                    </Button>
                  )}
                </div>
                <div className="text-sm text-purple-900 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                  {divergencias}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════ Rev. 4805 — PROJETOS PARA MEDIÇÃO (pavimentos da obra) ══════════
// Cadastro vive na OBRA e vale para os dois lados (cliente e terceiros): os
// levantamentos de qualquer contrato desta obra importam a planta com 1 toque.
// Pé-direito default 3,00 m vira a altura sugerida nas medições de parede.
function ProjetosMedicaoSection({ companyId, obraId }: { companyId: number; obraId: number }) {
  const utils = trpc.useUtils();
  const pavsQ = trpc.medicao.listarPavimentosObra.useQuery({ companyId, obraId }, { enabled: !!companyId && !!obraId });
  const pavimentos: any[] = (pavsQ.data as any[]) ?? [];

  const [novoNome, setNovoNome] = useState("");
  const [novoPe, setNovoPe] = useState("3,00");
  const [uploadingId, setUploadingId] = useState<number | "novo" | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null); // Rev. 4806 — % real do envio (0–100)
  const fileRef = useRef<HTMLInputElement | null>(null);
  const uploadAlvoRef = useRef<number | null>(null);

  const salvarMut = trpc.medicao.salvarPavimentoObra.useMutation({
    onSuccess: () => { utils.medicao.listarPavimentosObra.invalidate({ companyId, obraId }); },
    onError: (e: any) => toast.error(e.message),
  });
  const excluirMut = trpc.medicao.excluirPavimentoObra.useMutation({
    onSuccess: () => { utils.medicao.listarPavimentosObra.invalidate({ companyId, obraId }); },
    onError: (e: any) => toast.error(e.message),
  });

  const parsePe = (s: string) => {
    const v = parseFloat(String(s).replace(",", "."));
    return isFinite(v) && v > 0 ? v : 3;
  };

  const enviarArquivo = async (pavId: number, file: File) => {
    if (!file.name.toLowerCase().endsWith(".dxf")) {
      toast.error("O projeto deve ser um arquivo DXF (exporte do CAD em escala 1:100).");
      return;
    }
    setUploadingId(pavId);
    setUploadPct(0);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("companyId", String(companyId));
      // XHR p/ progresso REAL de upload (fetch não expõe onprogress do envio)
      const j: any = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload/levantamento-planta");
        xhr.withCredentials = true;
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploadPct(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
        };
        xhr.onload = () => {
          try {
            const body = JSON.parse(xhr.responseText || "{}");
            if (xhr.status >= 200 && xhr.status < 300 && body?.key) { setUploadPct(100); resolve(body); }
            else reject(new Error(body?.error || `Falha no envio (HTTP ${xhr.status}).`));
          } catch { reject(new Error(`Falha no envio (HTTP ${xhr.status}).`)); }
        };
        xhr.onerror = () => reject(new Error("Falha de rede no envio do arquivo."));
        xhr.send(fd);
      });
      const pav = pavimentos.find(p => p.id === pavId);
      await salvarMut.mutateAsync({
        companyId, obraId, id: pavId,
        nome: pav?.nome || file.name.replace(/\.dxf$/i, ""),
        arquivoKey: j.key, arquivoNome: file.name,
      });
      const jaTinha = !!pavimentos.find(p => p.id === pavId)?.arquivoKey;
      toast.success(jaTinha
        ? "Nova revisão do projeto salva. Medições anteriores continuam na planta antiga; as novas usam a nova revisão."
        : "Projeto enviado. O sistema confere a escala automaticamente na medição.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar o projeto.");
    } finally {
      setUploadingId(null);
      setUploadPct(null);
    }
  };

  return (
    <div className="mt-6 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="h-4 w-4 text-indigo-600" />
        <span className="font-semibold text-sm text-indigo-900">Projetos para Medição (pavimentos)</span>
      </div>
      <p className="text-xs text-slate-600 mb-3">
        Cada projeto é um pavimento (Térreo, 1º Pav...). Vale para <b>todas</b> as medições desta obra — cliente e terceiros.
        {" "}<b>Arquivo sempre em DXF, desenhado em escala real 1:100</b> — o sistema confere a escala automaticamente ao abrir na medição.
        O pé-direito vem preenchido como altura nas medições de parede (editável na hora, ex.: revestimento a meia altura).
      </p>

      {pavsQ.isLoading ? (
        <div className="text-xs text-slate-400 py-2"><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" />Carregando...</div>
      ) : pavimentos.length === 0 ? (
        <div className="text-xs text-slate-400 py-1">Nenhum pavimento cadastrado ainda.</div>
      ) : (
        <div className="space-y-2 mb-3">
          {pavimentos.map((p: any) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 bg-white rounded-md border border-slate-200 px-3 py-2">
              <Input
                className="h-8 text-sm flex-1 min-w-[140px]"
                defaultValue={p.nome}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== p.nome) salvarMut.mutate({ companyId, obraId, id: p.id, nome: v }); }}
              />
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-500">Pé-direito</span>
                <Input
                  className="h-8 w-20 text-sm text-right"
                  defaultValue={String(p.peDireito ?? "3.00").replace(".", ",")}
                  onBlur={e => { const v = parsePe(e.target.value); salvarMut.mutate({ companyId, obraId, id: p.id, nome: p.nome, peDireito: v }); }}
                />
                <span className="text-[11px] text-slate-500">m</span>
              </div>
              <button
                type="button"
                className={`text-xs px-2 py-1.5 rounded-md border flex items-center gap-1 ${p.arquivoKey ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}
                disabled={uploadingId !== null}
                onClick={() => { uploadAlvoRef.current = p.id; fileRef.current?.click(); }}
                title="Enviar/substituir o DXF (escala 1:100)"
              >
                {uploadingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {uploadingId === p.id
                  ? `Enviando... ${uploadPct ?? 0}%`
                  : p.arquivoKey ? (p.arquivoNome || "DXF enviado") : "Enviar DXF (1:100)"}
              </button>
              {(p.revisao ?? 1) > 1 && (
                <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">REV. {p.revisao}</Badge>
              )}
              <button type="button" className="text-slate-300 hover:text-red-500 ml-auto" title="Excluir pavimento"
                onClick={() => { if (excluirMut.isPending) return; excluirMut.mutate({ companyId, id: p.id }); }}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-indigo-100">
        <Input className="h-8 text-sm flex-1 min-w-[160px]" placeholder="Novo pavimento — ex.: 001 - TÉRREO" value={novoNome} onChange={e => setNovoNome(e.target.value)} />
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-slate-500">Pé-direito</span>
          <Input className="h-8 w-20 text-sm text-right" value={novoPe} onChange={e => setNovoPe(e.target.value)} />
          <span className="text-[11px] text-slate-500">m</span>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-indigo-700 border-indigo-300"
          disabled={!novoNome.trim() || salvarMut.isPending}
          onClick={() => salvarMut.mutate({ companyId, obraId, nome: novoNome.trim(), peDireito: parsePe(novoPe) }, { onSuccess: () => { setNovoNome(""); setNovoPe("3,00"); } })}>
          {salvarMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Adicionar
        </Button>
      </div>

      <input ref={fileRef} type="file" accept=".dxf" className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          const alvo = uploadAlvoRef.current;
          e.currentTarget.value = "";
          if (f && alvo) enviarArquivo(alvo, f);
        }} />
    </div>
  );
}
