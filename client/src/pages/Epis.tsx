import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { handleCurrencyInput, floatToCurrency, parseCurrencyToFloat } from "@/lib/currency";
import { removeAccents } from "@/lib/searchUtils";
import {
  Plus, Search, Pencil, Trash2, HardHat, Package, AlertTriangle,
  ShieldCheck, Calendar, ArrowRight, ChevronLeft, User, ClipboardList,
  DollarSign, Clock, Settings2, Printer, Upload, Eye, FileText,
  Glasses, Hand, Footprints, Ear, Shirt, Wind, Shield, Flame, Droplets, Wrench, Zap, HeartPulse, Umbrella, RefreshCw,
  Building2, ArrowLeftRight, Warehouse, TrendingUp,
  Brain, Sparkles, GraduationCap, Bell, BarChart3, PenTool, Users, Ban,
  ImagePlus, Camera, Link, X as XIcon
} from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import FornecedorDialog from "@/components/FornecedorDialog";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePermissions } from "@/contexts/PermissionsContext";

import EpiKitsConfig from "./EpiKitsConfig";
import EpiChecklist from "./EpiChecklist";
import EpiValidade from "./EpiValidade";
import EpiRelatorioCusto from "./EpiRelatorioCusto";
import EpiEstoqueMinimo from "./EpiEstoqueMinimo";
import EpiIA from "./EpiIA";
import EpiDrillDown, { type DrillDownType } from "./EpiDrillDown";
import EpiAssinatura from "./EpiAssinatura";
import EpiCapacidade from "./EpiCapacidade";
import EpiDescontos from "./EpiDescontos";

type ViewMode = "catalogo" | "entregas" | "novo_epi" | "editar_epi" | "nova_entrega" | "ficha_epi" | "estoque_obra" | "transferencias" | "config" | "checklist" | "validade" | "custos" | "minimo" | "ia" | "capacidade" | "descontos";

// Mapeamento de ícones dinâmicos por tipo de EPI
function getEpiIcon(nome: string, className: string = "h-4 w-4") {
  const n = (nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("capacete") || n.includes("helmet")) return <HardHat className={`${className} text-amber-600`} />;
  if (n.includes("luva")) return <Hand className={`${className} text-blue-600`} />;
  if (n.includes("oculos") || n.includes("viseira") || n.includes("protetor facial") || n.includes("face")) return <Glasses className={`${className} text-sky-600`} />;
  if (n.includes("bota") || n.includes("botina") || n.includes("calcado") || n.includes("sapato")) return <Footprints className={`${className} text-amber-800`} />;
  if (n.includes("auricular") || n.includes("abafador") || n.includes("ouvido") || n.includes("plug")) return <Ear className={`${className} text-purple-600`} />;
  if (n.includes("uniforme") || n.includes("camisa") || n.includes("calca") || n.includes("jaleco") || n.includes("avental") || n.includes("vestimenta") || n.includes("manga")) return <Shirt className={`${className} text-indigo-600`} />;
  if (n.includes("respirador") || n.includes("mascara") || n.includes("respiratoria") || n.includes("pff")) return <Wind className={`${className} text-teal-600`} />;
  if (n.includes("cinto") || n.includes("arnês") || n.includes("arnes") || n.includes("trava-queda") || n.includes("talabarte")) return <Shield className={`${className} text-red-600`} />;
  if (n.includes("soldador") || n.includes("solda") || n.includes("touca")) return <Flame className={`${className} text-orange-600`} />;
  if (n.includes("creme") || n.includes("protetor solar") || n.includes("filtro")) return <Droplets className={`${className} text-cyan-600`} />;
  if (n.includes("ferramenta") || n.includes("chave")) return <Wrench className={`${className} text-gray-600`} />;
  if (n.includes("eletric") || n.includes("isolante")) return <Zap className={`${className} text-yellow-600`} />;
  if (n.includes("primeiros") || n.includes("socorro") || n.includes("kit")) return <HeartPulse className={`${className} text-red-500`} />;
  if (n.includes("chuva") || n.includes("impermeavel")) return <Umbrella className={`${className} text-blue-500`} />;
  return <ShieldCheck className={`${className} text-emerald-600`} />;
}

// Cores de capacete padrão construção civil (NR-6 / NR-18)
const CORES_CAPACETE = [
  { value: "Branco", hex: "#FFFFFF", border: "#d1d5db", funcao: "Engenheiros, Mestres de Obras, Encarregados" },
  { value: "Azul", hex: "#2563EB", border: "#2563EB", funcao: "Pedreiros (alvenaria e estruturas)" },
  { value: "Verde", hex: "#16A34A", border: "#16A34A", funcao: "Serventes, Operários, Téc. Segurança, Armadores" },
  { value: "Amarelo", hex: "#EAB308", border: "#EAB308", funcao: "Visitantes" },
  { value: "Vermelho", hex: "#DC2626", border: "#DC2626", funcao: "Carpinteiros, Bombeiros" },
  { value: "Laranja", hex: "#EA580C", border: "#EA580C", funcao: "Eletricistas" },
  { value: "Cinza", hex: "#6B7280", border: "#6B7280", funcao: "Estagiários, Visitantes técnicos" },
  { value: "Marrom", hex: "#78350F", border: "#78350F", funcao: "Soldadores" },
  { value: "Preto", hex: "#1F2937", border: "#1F2937", funcao: "Operadores de máquinas pesadas" },
] as const;

function isCapacete(nome: string) {
  const n = (nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return n.includes("capacete") || n.includes("helmet");
}

// Componente de seleção de cor do capacete com legenda
function CorCapaceteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="border border-dashed border-amber-300 rounded-lg p-3 bg-amber-50/40 space-y-3">
      <h4 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
        <HardHat className="h-4 w-4" /> Cor do Capacete
      </h4>
      <div className="flex flex-wrap gap-2">
        {CORES_CAPACETE.map(cor => (
          <button
            key={cor.value}
            type="button"
            onClick={() => onChange(value === cor.value ? "" : cor.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              value === cor.value
                ? "ring-2 ring-offset-1 ring-amber-500 shadow-md scale-105"
                : "hover:scale-105 opacity-80 hover:opacity-100"
            }`}
            style={{
              backgroundColor: cor.hex + (cor.value === "Branco" ? "" : "22"),
              border: `2px solid ${cor.border}`,
              color: ["Branco", "Amarelo"].includes(cor.value) ? "#374151" : cor.hex === "#FFFFFF" ? "#374151" : cor.hex,
            }}
          >
            <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: cor.hex, border: cor.value === "Branco" ? "1px solid #d1d5db" : "none" }} />
            {cor.value}
          </button>
        ))}
      </div>
      {/* Legenda de funções */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 pt-1">
        {CORES_CAPACETE.map(cor => (
          <div key={cor.value} className="flex items-center gap-1.5 text-[10px] text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cor.hex, border: cor.value === "Branco" ? "1px solid #d1d5db" : "none" }} />
            <span><strong className="text-gray-700">{cor.value}:</strong> {cor.funcao}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-amber-600 italic">Referência: NR-6 / NR-18 — Padrão de cores na construção civil</p>
    </div>
  );
}

export default function Epis() {
  const { selectedCompanyId, selectedCompany, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = isConstrutoras ? 0 : (selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0);
  const companyIds = getCompanyIdsForQuery();
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : !!companyId;
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const { hasGroup, groupOcultarValores, isAdminMaster, isSomenteVisualizacao } = usePermissions();
  const hideEpiValues = !isAdminMaster && hasGroup && groupOcultarValores('/epis');
  const readOnly = !isAdminMaster && hasGroup && isSomenteVisualizacao;

  // Suporte a ?tab= para links diretos da sidebar
  const validTabs: ViewMode[] = useMemo(() => ["catalogo", "entregas", "estoque_obra", "transferencias", "config", "checklist", "validade", "custos", "minimo", "ia", "capacidade", "descontos"], []);
  const initialTab = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    return (tab && validTabs.includes(tab as ViewMode)) ? tab as ViewMode : "catalogo";
  }, []);
  const [viewMode, setViewMode] = useState<ViewMode>(initialTab);

  // Escutar evento navParamsUpdated da sidebar para trocar aba sem recarregar
  useEffect(() => {
    const handleNavParams = () => {
      const raw = sessionStorage.getItem('_navParams');
      if (raw) {
        const sp = new URLSearchParams(raw);
        const tab = sp.get('tab');
        if (tab && validTabs.includes(tab as ViewMode)) {
          setViewMode(tab as ViewMode);
        }
        sessionStorage.removeItem('_navParams');
      }
    };
    window.addEventListener('navParamsUpdated', handleNavParams);
    return () => window.removeEventListener('navParamsUpdated', handleNavParams);
  }, [validTabs]);
  const [search, setSearch] = useState("");
  const [filterCondicao, setFilterCondicao] = useState<"Todos" | "Novo" | "Reutilizado">("Todos");
  const [filterCategoria, setFilterCategoria] = useState<"Todos" | "EPI" | "Uniforme" | "Calçado">("Todos");
  const [filterTamanho, setFilterTamanho] = useState<string>("Todos");
  const [editingEpi, setEditingEpi] = useState<any>(null);
  const [selectedEpis, setSelectedEpis] = useState<Set<number>>(new Set());
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
  const [fichaDelivery, setFichaDelivery] = useState<any>(null);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [drillDown, setDrillDown] = useState<DrillDownType>(null);
  const [showFichaSignPad, setShowFichaSignPad] = useState(false);
  const [fichaSignature, setFichaSignature] = useState<string | null>(null);

  // Queries
  // Quando Construtoras selecionado, companyId=0 mas companyIds tem os IDs do pool
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const episQ = trpc.epis.list.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany });
  const deliveriesQ = trpc.epis.listDeliveries.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany });
  const statsQ = trpc.epis.stats.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany });
  const employeesQ = trpc.employees.list.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined, status: "Ativo" }, { enabled: hasValidCompany });
  const bdiQ = trpc.epis.getBdi.useQuery({ companyId: queryCompanyId }, { enabled: hasValidCompany });
  const formTextQ = trpc.epis.getFormText.useQuery({ companyId: queryCompanyId }, { enabled: hasValidCompany });
  const fornecedoresQ = trpc.epis.fornecedoresList.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany });
  const obrasQ = trpc.obras.listActive.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany });
  const obrasList = obrasQ.data ?? [];

  // Capacidade de contratação (para card no dashboard)
  const capacidadeQ = trpc.epiAvancado.capacidadeContratacao.useQuery(
    { companyId: queryCompanyId },
    { enabled: hasValidCompany }
  );

  // Estoque por obra queries
  const estoqueObraQ = trpc.epis.estoqueObraList.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany });
  const estoqueObraResumoQ = trpc.epis.estoqueObraResumo.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany });
  const transferenciasQ = trpc.epis.listarTransferencias.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany });
  const estoqueObraList2 = estoqueObraQ.data ?? [];
  const estoqueResumo = estoqueObraResumoQ.data ?? [];
  const transferenciasList = transferenciasQ.data ?? [];

  const episList = episQ.data ?? [];
  const deliveriesList = deliveriesQ.data ?? [];
  const stats = statsQ.data;
  const employeesList = useMemo(() => (employeesQ.data ?? []).sort((a: any, b: any) => a.nomeCompleto.localeCompare(b.nomeCompleto)), [employeesQ.data]);
  const fornecedoresList = fornecedoresQ.data ?? [];

  // Fornecedor dialog state
  const [showFornecedorDialog, setShowFornecedorDialog] = useState(false);
  const [fornecedorForm, setFornecedorForm] = useState({ nome: "", cnpj: "", contato: "", telefone: "", email: "", endereco: "", observacoes: "" });
  const [editingFornecedor, setEditingFornecedor] = useState<any>(null);
  const [showFornecedorList, setShowFornecedorList] = useState(false);

  // Form state - EPI
  const [epiForm, setEpiForm] = useState({
    nome: "", ca: "", validadeCa: "", fabricante: "", fornecedor: "",
    fornecedorCnpj: "", fornecedorContato: "", fornecedorTelefone: "", fornecedorEmail: "", fornecedorEndereco: "",
    categoria: "EPI" as "EPI" | "Uniforme" | "Calcado",
    tamanho: "",
    quantidadeEstoque: 0, valorProduto: "", tempoMinimoTroca: "",
    corCapacete: "",
    condicao: "Novo" as "Novo" | "Reutilizado",
    fotoUrl: "" as string,
  });
  // Foto EPI state
  const [fotoEpiInput, setFotoEpiInput] = useState<"none" | "url" | "upload">("none");
  const [fotoEpiAiLoading, setFotoEpiAiLoading] = useState(false);
  const [fotoEpiAiResult, setFotoEpiAiResult] = useState<string | null>(null);
  const fotoEpiInputRef = useRef<HTMLInputElement>(null);

  // CNPJ fornecedor lookup
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjResult, setCnpjResult] = useState<any>(null);
  const buscarCnpjFornecedor = async (cnpj: string) => {
    const clean = cnpj.replace(/\D/g, "");
    if (clean.length !== 14) return;
    setCnpjLoading(true);
    setCnpjResult(null);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
      if (!res.ok) { setCnpjResult({ error: "CNPJ não encontrado" }); return; }
      const data = await res.json();
      const nome = data.nome_fantasia || data.razao_social || "";
      const tel = data.ddd_telefone_1 ? `(${data.ddd_telefone_1.substring(0,2)}) ${data.ddd_telefone_1.substring(2)}` : "";
      const end = [data.logradouro, data.numero, data.complemento, data.bairro, data.municipio, data.uf].filter(Boolean).join(", ");
      setEpiForm(f => ({
        ...f,
        fornecedor: nome,
        fornecedorCnpj: clean,
        fornecedorTelefone: tel,
        fornecedorEmail: data.email || "",
        fornecedorEndereco: end,
        fornecedorContato: data.razao_social || "",
      }));
      setCnpjResult({ success: true, razaoSocial: data.razao_social, nomeFantasia: data.nome_fantasia });
    } catch { setCnpjResult({ error: "Erro ao buscar CNPJ" }); }
    finally { setCnpjLoading(false); }
  };

  // Form state - Entrega
  const [entregaForm, setEntregaForm] = useState({
    epiId: "", employeeId: "", quantidade: 1, dataEntrega: new Date().toISOString().split("T")[0],
    motivo: "", observacoes: "", motivoTroca: "", obraId: "",
    origemEntrega: "central" as "central" | "obra",
    origemObraId: "", // obra da qual o estoque será retirado (quando origemEntrega === 'obra')
  });

  // Transferência form state
  const [transForm, setTransForm] = useState({
    epiId: "", quantidade: 1, tipoOrigem: "central" as "central" | "obra",
    origemObraId: "", tipoDestino: "obra" as "central" | "obra", destinoObraId: "", data: new Date().toISOString().split("T")[0], observacoes: "",
  });
  const [filterObraEstoque, setFilterObraEstoque] = useState<string>("todas");
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showObraConfirm, setShowObraConfirm] = useState(false);
  const [showEntradaDiretaDialog, setShowEntradaDiretaDialog] = useState(false);
  const [entradaDiretaForm, setEntradaDiretaForm] = useState({ epiId: "", obraId: "", quantidade: "", observacao: "" });

  // BDI config
  const [bdiValue, setBdiValue] = useState("");

  // CA lookup state
  const [caLookupLoading, setCaLookupLoading] = useState(false);
  const [caLookupResult, setCaLookupResult] = useState<any>(null);

  // AI lifespan suggestion state
  const [aiSuggestion, setAiSuggestion] = useState<{ vidaUtilDias: number; justificativa: string; confianca: string } | null>(null);
  const [aiSuggestionLoading, setAiSuggestionLoading] = useState(false);
  const suggestLifespanMut = trpc.epis.suggestLifespan.useMutation();
  const sugerirFotoIAMut = trpc.epis.sugerirFotoIA.useMutation();
  const [autoFotoBulkLoading, setAutoFotoBulkLoading] = useState(false);
  const autoFotoBulkMut = trpc.epis.autoFotoBulk.useMutation();
  const uploadFotoEpiMut = trpc.epis.uploadFotoEpi.useMutation({
    onSuccess: (data: any) => { episQ.refetch(); setEpiForm(f => ({ ...f, fotoUrl: data.url || "" })); toast.success("Foto salva!"); },
    onError: (err) => toast.error("Erro ao fazer upload da foto: " + err.message),
  });

  // Foto do estado do EPI (para troca)
  const [fotoEstado, setFotoEstado] = useState<{ file: File | null; preview: string }>({ file: null, preview: "" });
  const fotoInputRef = useRef<HTMLInputElement>(null);

  // Mutations
  const createEpiMut = trpc.epis.create.useMutation({
    onSuccess: () => { episQ.refetch(); statsQ.refetch(); setViewMode("catalogo"); toast.success("EPI cadastrado!"); resetEpiForm(); },
    onError: (err) => toast.error(err.message),
  });
  const updateEpiMut = trpc.epis.update.useMutation({
    onSuccess: () => { episQ.refetch(); statsQ.refetch(); setEditingEpi(null); setViewMode("catalogo"); resetEpiForm(); toast.success("EPI atualizado com sucesso!"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteEpiMut = trpc.epis.delete.useMutation({
    onSuccess: () => { episQ.refetch(); statsQ.refetch(); toast.success("EPI removido!"); },
    onError: (err) => toast.error(err.message),
  });
  const createDeliveryMut = trpc.epis.createDelivery.useMutation({
    onSuccess: (result: any) => {
      deliveriesQ.refetch(); episQ.refetch(); statsQ.refetch();
      if (result?.valorCobrado) {
        toast.success(`Entrega registrada! Valor cobrado: ${parseFloat(result.valorCobrado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
      } else {
        toast.success("Entrega registrada!");
      }
      // Abrir ficha de entrega automaticamente após registro
      const epi = episList.find((e: any) => String(e.id) === entregaForm.epiId);
      const emp = employeesList.find((e: any) => String(e.id) === entregaForm.employeeId);
      const obraSel = obrasList.find((o: any) => String(o.id) === entregaForm.obraId);
      setFichaDelivery({
        id: result.id,
        epiId: parseInt(entregaForm.epiId),
        employeeId: parseInt(entregaForm.employeeId),
        quantidade: entregaForm.quantidade,
        dataEntrega: entregaForm.dataEntrega,
        motivo: entregaForm.motivo,
        motivoTroca: entregaForm.motivoTroca,
        valorCobrado: result.valorCobrado,
        nomeEpi: epi?.nome || "",
        caEpi: epi?.ca || "",
        nomeFunc: emp?.nomeCompleto || "",
        funcaoFunc: emp?.funcao || "",
        obraNome: obraSel?.nome || emp?.obraAtualNome || "",
      });
      setViewMode("ficha_epi");
      resetEntregaForm();
      setFotoEstado({ file: null, preview: "" });
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteDeliveryMut = trpc.epis.deleteDelivery.useMutation({
    onSuccess: () => { deliveriesQ.refetch(); episQ.refetch(); statsQ.refetch(); toast.success("Entrega removida!"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteBatchMut = trpc.epis.deleteBatch.useMutation({
    onSuccess: (data: any) => { episQ.refetch(); statsQ.refetch(); setSelectedEpis(new Set()); setShowBatchDeleteDialog(false); toast.success(`${data.deleted} EPI(s) removido(s)!`); },
    onError: (err: any) => toast.error(err.message),
  });
  const setBdiMut = trpc.epis.setBdi.useMutation({
    onSuccess: () => { bdiQ.refetch(); toast.success("BDI atualizado!"); },
    onError: (err) => toast.error(err.message),
  });
  const createFornecedorMut = trpc.epis.fornecedoresCreate.useMutation({
    onSuccess: () => { fornecedoresQ.refetch(); setShowFornecedorDialog(false); resetFornecedorForm(); toast.success("Fornecedor cadastrado!"); },
    onError: (err) => toast.error(err.message),
  });
  const updateFornecedorMut = trpc.epis.fornecedoresUpdate.useMutation({
    onSuccess: () => { fornecedoresQ.refetch(); setShowFornecedorDialog(false); resetFornecedorForm(); setEditingFornecedor(null); toast.success("Fornecedor atualizado!"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteFornecedorMut = trpc.epis.fornecedoresDelete.useMutation({
    onSuccess: () => { fornecedoresQ.refetch(); toast.success("Fornecedor removido!"); },
    onError: (err) => toast.error(err.message),
  });
  const uploadFichaMut = trpc.epis.uploadFicha.useMutation({
    onSuccess: () => { deliveriesQ.refetch(); toast.success("Ficha assinada anexada!"); },
    onError: (err) => toast.error(err.message),
  });
  const transferirMut = trpc.epis.transferir.useMutation({
    onSuccess: () => { estoqueObraQ.refetch(); estoqueObraResumoQ.refetch(); transferenciasQ.refetch(); episQ.refetch(); statsQ.refetch(); setShowTransferDialog(false); resetTransForm(); toast.success("Transferência realizada com sucesso!"); },
    onError: (err) => toast.error(err.message),
  });
  const entradaEstoqueMut = trpc.epis.entradaEstoque.useMutation({
    onSuccess: () => { episQ.refetch(); statsQ.refetch(); toast.success("Entrada de estoque registrada!"); },
    onError: (err) => toast.error(err.message),
  });
  const entradaDiretaObraMut = trpc.epis.entradaDiretaObra.useMutation({
    onSuccess: () => {
      estoqueObraQ.refetch(); estoqueObraResumoQ.refetch(); transferenciasQ.refetch(); statsQ.refetch();
      setShowEntradaDiretaDialog(false);
      setEntradaDiretaForm({ epiId: "", obraId: "", quantidade: "", observacao: "" });
      toast.success("Entrada direta registrada com sucesso!");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleSelectEpi = (id: number) => {
    setSelectedEpis(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAllEpis = () => {
    if (selectedEpis.size === filteredEpis.length) {
      setSelectedEpis(new Set());
    } else {
      setSelectedEpis(new Set(filteredEpis.map((e: any) => e.id)));
    }
  };

  function resetEpiForm() {
    setEpiForm({ nome: "", ca: "", validadeCa: "", fabricante: "", fornecedor: "", fornecedorCnpj: "", fornecedorContato: "", fornecedorTelefone: "", fornecedorEmail: "", fornecedorEndereco: "", categoria: "EPI", tamanho: "", quantidadeEstoque: 0, valorProduto: "", tempoMinimoTroca: "", corCapacete: "", condicao: "Novo" as "Novo" | "Reutilizado", fotoUrl: "" }); setCnpjResult(null); setFotoEpiInput("none"); setFotoEpiAiResult(null);
    setAiSuggestion(null);
    setAiSuggestionLoading(false);
    setCaLookupResult(null);
  }
  function resetFornecedorForm() {
    setFornecedorForm({ nome: "", cnpj: "", contato: "", telefone: "", email: "", endereco: "", observacoes: "" });
  }
  function selectFornecedor(f: any) {
    const cnpjFormatted = f.cnpj ? f.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "";
    setEpiForm(prev => ({
      ...prev,
      fornecedor: f.nome,
      fornecedorCnpj: cnpjFormatted,
      fornecedorContato: f.contato || "",
      fornecedorTelefone: f.telefone || "",
      fornecedorEmail: f.email || "",
      fornecedorEndereco: f.endereco || "",
    }));
    toast.success(`Fornecedor "${f.nome}" selecionado`);
  }

  const TAMANHOS_ROUPA = ['Único', 'PP', 'P', 'M', 'G', 'GG', 'XGG', 'XXGG', 'XXXGG'];
  const TAMANHOS_CALCADO = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'];
  function resetEntregaForm() {
    setEntregaForm({ epiId: "", employeeId: "", quantidade: 1, dataEntrega: new Date().toISOString().split("T")[0], motivo: "", observacoes: "", motivoTroca: "", obraId: "", origemEntrega: "central", origemObraId: "" });
    setFotoEstado({ file: null, preview: "" });
  }
  function resetTransForm() {
    setTransForm({ epiId: "", quantidade: 1, tipoOrigem: "central", origemObraId: "", tipoDestino: "obra", destinoObraId: "", data: new Date().toISOString().split("T")[0], observacoes: "" });
  }

  // CA lookup function
  const caLookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeCaLookup = useCallback(async (caValue: string) => {
    const caClean = caValue.replace(/\D/g, "");
    if (!caClean || caClean.length < 3) return;
    setCaLookupLoading(true);
    setCaLookupResult(null);
    try {
      const resp = await fetch(`/api/trpc/epis.consultaCa?input=${encodeURIComponent(JSON.stringify({ json: { ca: caClean } }))}`, {
        credentials: 'include',
      });
      const json = await resp.json();
      const res = json?.result?.data?.json || json?.result?.data;
      if (res?.found) {
        setCaLookupResult(res);
        setEpiForm(f => ({
          ...f,
          nome: res.descricao || res.nome || f.nome,
          fabricante: res.fabricante || f.fabricante,
          validadeCa: res.validade || f.validadeCa,
        }));
        toast.success(`CA ${res.ca} encontrado!`);
        // Trigger AI lifespan suggestion
        const epiName = res.descricao || res.nome || '';
        if (epiName) {
          setAiSuggestionLoading(true);
          setAiSuggestion(null);
          try {
            const aiResp = await fetch(`/api/trpc/epis.suggestLifespan`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ json: { nomeEpi: epiName, aprovadoPara: res.aprovadoPara || '' } }),
            });
            const aiJson = await aiResp.json();
            const aiData = aiJson?.result?.data?.json || aiJson?.result?.data;
            if (aiData?.vidaUtilDias) {
              setAiSuggestion(aiData);
              setEpiForm(f => ({ ...f, tempoMinimoTroca: String(aiData.vidaUtilDias) }));
              toast.info(`🧠 IA sugeriu vida útil: ${aiData.vidaUtilDias} dias`);
            }
          } catch (e) {
            console.error('[AI Suggestion] Error:', e);
          } finally {
            setAiSuggestionLoading(false);
          }
        }
      } else {
        setCaLookupResult({ found: false, error: res?.error || 'CA não encontrado na base' });
      }
    } catch (err: any) {
      console.error('[CA Lookup] Error:', err);
      setCaLookupResult({ found: false, error: "Erro na consulta. Verifique sua conexão." });
    } finally {
      setCaLookupLoading(false);
    }
  }, []);

  // Auto-search: debounce 800ms after typing
  useEffect(() => {
    const caClean = epiForm.ca.replace(/\D/g, "");
    if (caClean.length < 3) {
      setCaLookupResult(null);
      return;
    }
    if (caLookupTimerRef.current) clearTimeout(caLookupTimerRef.current);
    caLookupTimerRef.current = setTimeout(() => {
      executeCaLookup(epiForm.ca);
    }, 800);
    return () => {
      if (caLookupTimerRef.current) clearTimeout(caLookupTimerRef.current);
    };
  }, [epiForm.ca, executeCaLookup]);

  async function handleCaLookup() {
    if (!epiForm.ca.trim()) return toast.error("Digite o número do CA");
    executeCaLookup(epiForm.ca);
  }

  const hoje = new Date().toISOString().split("T")[0];

  // Filtered lists
  const filteredEpis = useMemo(() => {
    let list = episList;
    if (filterCondicao !== "Todos") {
      list = list.filter((e: any) => (e.condicao || "Novo") === filterCondicao);
    }
    if (filterCategoria !== "Todos") {
      list = list.filter((e: any) => (e.categoria || "EPI") === filterCategoria);
    }
    if (filterTamanho !== "Todos") {
      list = list.filter((e: any) => (e.tamanho || "") === filterTamanho);
    }
    if (!search) return list;
    const s = removeAccents(search);
    return list.filter((e: any) =>
      removeAccents(e.nome || '').includes(s) ||
      (e.ca || "").toLowerCase().includes(s) ||
      (e.fabricante || "").toLowerCase().includes(s)
    );
  }, [episList, search, filterCondicao, filterCategoria, filterTamanho]);

  // Tamanhos disponíveis baseados na categoria selecionada
  const tamanhosFiltro = useMemo(() => {
    const TAMANHOS_ROUPA_LIST = ['Único', 'PP', 'P', 'M', 'G', 'GG', 'XGG', 'XXGG', 'XXXGG'];
    const TAMANHOS_CALCADO_LIST = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'];
    if (filterCategoria === "Uniforme") return TAMANHOS_ROUPA_LIST;
    if (filterCategoria === "Calçado") return TAMANHOS_CALCADO_LIST;
    // Para "Todos" ou "EPI", mostrar tamanhos que existem nos dados
    const tamanhos = new Set(episList.map((e: any) => e.tamanho).filter(Boolean));
    return Array.from(tamanhos).sort() as string[];
  }, [filterCategoria, episList]);

  const filteredDeliveries = useMemo(() => {
    if (!search) return deliveriesList;
    const s = removeAccents(search);
    return deliveriesList.filter((d: any) =>
      (d.nomeEpi || "").toLowerCase().includes(s) ||
      (d.nomeFunc || "").toLowerCase().includes(s)
    );
  }, [deliveriesList, search]);

  const formatCurrency = (val: any) => {
    if (!val) return "—";
    return parseFloat(String(val)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // BDI config agora fica em Configurações > Critérios do Sistema > EPIs / Segurança

  // Load EPI data into form for editing
  function loadEpiForEdit(epi: any) {
    setEpiForm({
      nome: epi.nome || "",
      ca: epi.ca || "",
      validadeCa: epi.validadeCa || "",
      fabricante: epi.fabricante || "",
      fornecedor: epi.fornecedor || "",
      fornecedorCnpj: epi.fornecedorCnpj ? epi.fornecedorCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "",
      fornecedorContato: epi.fornecedorContato || "",
      fornecedorTelefone: epi.fornecedorTelefone || "",
      fornecedorEmail: epi.fornecedorEmail || "",
      fornecedorEndereco: epi.fornecedorEndereco || "",
      categoria: epi.categoria || "EPI",
      tamanho: epi.tamanho || "",
      quantidadeEstoque: epi.quantidadeEstoque ?? 0,
      valorProduto: epi.valorProduto ? floatToCurrency(epi.valorProduto) : "",
      tempoMinimoTroca: epi.tempoMinimoTroca ? String(epi.tempoMinimoTroca) : "",
      corCapacete: epi.corCapacete || "",
      condicao: (epi.condicao || "Novo") as "Novo" | "Reutilizado",
      fotoUrl: epi.fotoUrl || "",
    });
    setCaLookupResult(null);
    setCnpjResult(null);
    setAiSuggestion(null);
    setFotoEpiInput("none");
    setFotoEpiAiResult(null);
  }

  // ============================================================
  // FORM: EDITAR EPI (tela completa igual ao cadastro)
  // ============================================================
  if (viewMode === "editar_epi" && editingEpi) {
    return (
      <DashboardLayout>
        <PrintHeader />
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setViewMode("catalogo"); setEditingEpi(null); resetEpiForm(); }}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h1 className="text-xl font-bold">Editar EPI: {editingEpi.nome}</h1>
          </div>

          <Card>
            <CardContent className="p-6 space-y-4 w-full">
              {/* ===== FOTO DO EPI ===== */}
              <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-slate-600" />
                  <Label className="text-sm font-semibold">Foto do EPI</Label>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-32 h-32 rounded-lg border-2 border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                    {epiForm.fotoUrl ? (
                      <img src={epiForm.fotoUrl} alt="Foto EPI" className="w-full h-full object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="text-center text-slate-400 p-2">
                        <ImagePlus className="h-8 w-8 mx-auto mb-1 opacity-40" />
                        <p className="text-[10px]">Sem foto</p>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline"
                        onClick={() => setFotoEpiInput(fotoEpiInput === "upload" ? "none" : "upload")}
                        className="text-xs h-7">
                        <Upload className="h-3 w-3 mr-1" /> Upload
                      </Button>
                      <Button type="button" size="sm" variant="outline"
                        onClick={() => setFotoEpiInput(fotoEpiInput === "url" ? "none" : "url")}
                        className="text-xs h-7">
                        <Link className="h-3 w-3 mr-1" /> URL
                      </Button>
                      <Button type="button" size="sm" variant="outline"
                        onClick={async () => {
                          if (!epiForm.nome) return toast.error("Preencha o nome do EPI primeiro.");
                          setFotoEpiAiLoading(true);
                          setFotoEpiAiResult(null);
                          try {
                            const res = await sugerirFotoIAMut.mutateAsync({ nomeEpi: epiForm.nome, ca: epiForm.ca || undefined });
                            if (res.url) {
                              setFotoEpiAiResult(res.url);
                              setEpiForm(f => ({ ...f, fotoUrl: res.url! }));
                              toast.success(`Foto sugerida pela IA${res.fonte ? ` (${res.fonte})` : ""}!`);
                            } else {
                              toast.error("IA não encontrou imagem para este EPI. Tente adicionar manualmente.");
                            }
                          } catch { toast.error("Erro ao buscar foto com IA."); }
                          setFotoEpiAiLoading(false);
                        }}
                        disabled={fotoEpiAiLoading || !epiForm.nome}
                        className="text-xs h-7 bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100">
                        <Sparkles className="h-3 w-3 mr-1" />
                        {fotoEpiAiLoading ? "Buscando..." : "Buscar com IA"}
                      </Button>
                      {epiForm.fotoUrl && (
                        <Button type="button" size="sm" variant="ghost"
                          onClick={() => setEpiForm(f => ({ ...f, fotoUrl: "" }))}
                          className="text-xs h-7 text-red-500 hover:text-red-700">
                          <XIcon className="h-3 w-3 mr-1" /> Remover
                        </Button>
                      )}
                    </div>
                    {fotoEpiInput === "url" && (
                      <Input
                        placeholder="Cole a URL da imagem (https://...)"
                        className="text-xs h-8"
                        value={epiForm.fotoUrl}
                        onChange={e => setEpiForm(f => ({ ...f, fotoUrl: e.target.value }))}
                      />
                    )}
                    {fotoEpiInput === "upload" && (
                      <div>
                        <input ref={fotoEpiInputRef} type="file" accept="image/*" className="hidden"
                          onChange={async e => {
                            const file = e.target.files?.[0];
                            if (!file || !editingEpi) return;
                            const reader = new FileReader();
                            reader.onload = async (ev) => {
                              const base64 = (ev.target?.result as string).split(',')[1];
                              uploadFotoEpiMut.mutate({ id: editingEpi.id, fileBase64: base64, mimeType: file.type });
                            };
                            reader.readAsDataURL(file);
                          }} />
                        <Button type="button" size="sm" variant="outline"
                          onClick={() => fotoEpiInputRef.current?.click()}
                          className="text-xs h-7" disabled={uploadFotoEpiMut.isPending}>
                          <Upload className="h-3 w-3 mr-1" />
                          {uploadFotoEpiMut.isPending ? "Enviando..." : "Selecionar arquivo"}
                        </Button>
                      </div>
                    )}
                    {epiForm.fotoUrl && (
                      <p className="text-[10px] text-slate-500 truncate max-w-xs">{epiForm.fotoUrl}</p>
                    )}
                  </div>
                </div>
              </div>
              {/* ===== FIM FOTO EPI ===== */}

              <div>
                <Label>Nome do EPI *</Label>
                <Input value={epiForm.nome} onChange={e => setEpiForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Capacete de Segurança, Luva de Proteção..." />
              </div>
              {isCapacete(epiForm.nome) && (
                <CorCapaceteField value={epiForm.corCapacete} onChange={v => setEpiForm(f => ({ ...f, corCapacete: v }))} />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label>Número do CA</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input value={epiForm.ca} onChange={e => setEpiForm(f => ({ ...f, ca: e.target.value }))}
                        placeholder="Digite o CA (ex: 15532)" onKeyDown={e => { if (e.key === 'Enter') handleCaLookup(); }} />
                      {caLookupLoading && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <span className="animate-spin text-sm">⏳</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {caLookupResult?.found && (
                    <div className="mt-2 bg-green-50 border border-green-200 rounded p-2 text-xs text-green-700">
                      <p className="font-semibold">✓ CA {caLookupResult.ca} encontrado</p>
                      {caLookupResult.descricao && <p>{caLookupResult.descricao.substring(0, 100)}</p>}
                      {caLookupResult.situacao && <p>Situação: <strong className={caLookupResult.situacao === 'VÁLIDO' ? 'text-green-700' : 'text-red-600'}>{caLookupResult.situacao}</strong></p>}
                      {caLookupResult.fabricante && <p>Fabricante: {caLookupResult.fabricante}</p>}
                      {caLookupResult.validade && <p>Validade: {caLookupResult.validade}</p>}
                      {caLookupResult.referencia && <p>Referência: {caLookupResult.referencia}</p>}
                    </div>
                  )}
                  {caLookupResult && !caLookupResult.found && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                      <p>⚠ {caLookupResult.error || 'CA não encontrado'}</p>
                    </div>
                  )}
                </div>
                <div>
                  <Label>Validade do CA</Label>
                  <Input type="date" value={epiForm.validadeCa} onChange={e => setEpiForm(f => ({ ...f, validadeCa: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label>Fabricante</Label>
                  <Input value={epiForm.fabricante} onChange={e => setEpiForm(f => ({ ...f, fabricante: e.target.value }))}
                    placeholder="Nome do fabricante" />
                </div>
                <div>
                  <Label>Fornecedor</Label>
                  <div className="flex gap-1">
                    <Select value={epiForm.fornecedor || "__manual__"} onValueChange={(v) => {
                      if (v === "__novo__") {
                        setEditingFornecedor(null); resetFornecedorForm(); setShowFornecedorDialog(true);
                      } else if (v === "__manual__") {
                        setEpiForm(f => ({ ...f, fornecedor: "", fornecedorCnpj: "", fornecedorContato: "", fornecedorTelefone: "", fornecedorEmail: "", fornecedorEndereco: "" }));
                      } else {
                        const found = fornecedoresList.find((f: any) => f.nome === v);
                        if (found) selectFornecedor(found);
                      }
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione o fornecedor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__manual__">Digitar manualmente</SelectItem>
                        {fornecedoresList.map((f: any) => (
                          <SelectItem key={f.id} value={f.nome}>
                            {f.nome} {f.cnpj ? `(${f.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")})` : ""}
                          </SelectItem>
                        ))}
                        <SelectItem value="__novo__">+ Cadastrar novo fornecedor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {!epiForm.fornecedor && (
                    <Input value={epiForm.fornecedor} onChange={e => setEpiForm(f => ({ ...f, fornecedor: e.target.value }))}
                      placeholder="Ou digite o nome" className="mt-1" />
                  )}
                </div>
              </div>


              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label className="flex items-center gap-1">
                    <Package className="h-3 w-3 text-indigo-600" />
                    Categoria
                  </Label>
                  <Select value={epiForm.categoria} onValueChange={(v: any) => setEpiForm(f => ({ ...f, categoria: v, tamanho: '' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EPI">EPI (Equipamento de Proteção)</SelectItem>
                      <SelectItem value="Uniforme">Uniforme (Roupa)</SelectItem>
                      <SelectItem value="Calcado">Calçado (Bota/Sapato)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {epiForm.categoria !== 'EPI' && (
                  <div>
                    <Label className="flex items-center gap-1">
                      {epiForm.categoria === 'Uniforme' ? (
                        <><Shirt className="h-3 w-3 text-indigo-600" /> Tamanho</>
                      ) : (
                        <><Footprints className="h-3 w-3 text-amber-800" /> Número do Calçado</>
                      )}
                    </Label>
                    <Select value={epiForm.tamanho || undefined} onValueChange={v => setEpiForm(f => ({ ...f, tamanho: v }))}>
                      <SelectTrigger><SelectValue placeholder={epiForm.categoria === 'Uniforme' ? 'Selecione o tamanho...' : 'Selecione o número...'} /></SelectTrigger>
                      <SelectContent>
                        {(epiForm.categoria === 'Uniforme' ? TAMANHOS_ROUPA : TAMANHOS_CALCADO).map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label className="flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 text-teal-600" />
                    Condição do EPI
                  </Label>
                  <Select value={epiForm.condicao} onValueChange={(v: any) => setEpiForm(f => ({ ...f, condicao: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Novo">Novo</SelectItem>
                      <SelectItem value="Reutilizado">Reutilizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <Label>Quantidade em Estoque</Label>
                  <Input type="number" min={0} value={epiForm.quantidadeEstoque}
                    onChange={e => setEpiForm(f => ({ ...f, quantidadeEstoque: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3 text-green-600" />
                    Valor do Produto (R$)
                  </Label>
                  <Input type="text" inputMode="numeric" value={epiForm.valorProduto}
                    onChange={e => setEpiForm(f => ({ ...f, valorProduto: handleCurrencyInput(e.target.value) }))}
                    placeholder="0,00" />
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-blue-600" />
                    Vida Útil (dias)
                    {aiSuggestionLoading && <span className="text-xs text-blue-500 animate-pulse ml-1">🧠 IA analisando...</span>}
                  </Label>
                  <Input type="number" min={0} value={epiForm.tempoMinimoTroca}
                    onChange={e => { setEpiForm(f => ({ ...f, tempoMinimoTroca: e.target.value })); if (aiSuggestion) setAiSuggestion(null); }}
                    placeholder="Ex: 180" />
                  {aiSuggestion && (
                    <div className="mt-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                      <span className="font-semibold">🧠 Sugestão IA:</span> {aiSuggestion.vidaUtilDias} dias
                      <span className="text-blue-500 ml-1">({aiSuggestion.confianca === 'alta' ? 'Alta confiança' : aiSuggestion.confianca === 'media' ? 'Média confiança' : 'Baixa confiança'})</span>
                      <p className="text-[10px] text-blue-500 mt-0.5">{aiSuggestion.justificativa}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => { setViewMode("catalogo"); setEditingEpi(null); resetEpiForm(); }}>Cancelar</Button>
                <Button onClick={() => {
                  if (!epiForm.nome.trim()) return toast.error("Nome do EPI é obrigatório");
                  updateEpiMut.mutate({
                    id: editingEpi.id,
                    nome: epiForm.nome,
                    ca: epiForm.ca || undefined,
                    validadeCa: epiForm.validadeCa || undefined,
                    fabricante: epiForm.fabricante || undefined,
                    fornecedor: epiForm.fornecedor || undefined,
                    fornecedorCnpj: epiForm.fornecedorCnpj?.replace(/\D/g, "") || undefined,
                    fornecedorContato: epiForm.fornecedorContato || undefined,
                    fornecedorTelefone: epiForm.fornecedorTelefone || undefined,
                    fornecedorEmail: epiForm.fornecedorEmail || undefined,
                    fornecedorEndereco: epiForm.fornecedorEndereco || undefined,
                    categoria: epiForm.categoria,
                    tamanho: epiForm.tamanho || undefined,
                    quantidadeEstoque: epiForm.quantidadeEstoque,
                    valorProduto: epiForm.valorProduto ? parseCurrencyToFloat(epiForm.valorProduto) : undefined,
                    tempoMinimoTroca: epiForm.tempoMinimoTroca ? parseInt(epiForm.tempoMinimoTroca) : undefined,
                    corCapacete: isCapacete(epiForm.nome) ? (epiForm.corCapacete || null) : null,
                    condicao: epiForm.condicao,
                    fotoUrl: epiForm.fotoUrl || null,
                  });
                }} disabled={updateEpiMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  {updateEpiMut.isPending ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        {showFornecedorDialog && <FornecedorDialog
          fornecedorForm={fornecedorForm} setFornecedorForm={setFornecedorForm}
          cnpjLoading={cnpjLoading} setCnpjLoading={setCnpjLoading}
          cnpjResult={cnpjResult} setCnpjResult={setCnpjResult}
          editingFornecedor={editingFornecedor}
          onClose={() => { setShowFornecedorDialog(false); resetFornecedorForm(); setEditingFornecedor(null); setCnpjResult(null); }}
          onSave={(cleanCnpj: string) => {
            if (editingFornecedor) {
              updateFornecedorMut.mutate({ id: editingFornecedor.id, nome: fornecedorForm.nome, cnpj: cleanCnpj || undefined, contato: fornecedorForm.contato || undefined, telefone: fornecedorForm.telefone || undefined, email: fornecedorForm.email || undefined, endereco: fornecedorForm.endereco || undefined, observacoes: fornecedorForm.observacoes || undefined });
            } else {
              createFornecedorMut.mutate({ companyId: queryCompanyId, nome: fornecedorForm.nome, cnpj: cleanCnpj || undefined, contato: fornecedorForm.contato || undefined, telefone: fornecedorForm.telefone || undefined, email: fornecedorForm.email || undefined, endereco: fornecedorForm.endereco || undefined, observacoes: fornecedorForm.observacoes || undefined });
            }
          }}
          isPending={createFornecedorMut.isPending || updateFornecedorMut.isPending}
        />}
      </DashboardLayout>
    );
  }

  // ============================================================
  // FORM: NOVO EPI
  // ============================================================
  if (viewMode === "novo_epi") {
    return (
      <DashboardLayout>
        <PrintHeader />
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("catalogo")}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h1 className="text-xl font-bold">Cadastrar Novo EPI</h1>
          </div>

          <Card>
            <CardContent className="p-6 space-y-4 w-full">
              <div>
                <Label>Nome do EPI *</Label>
                <Input value={epiForm.nome} onChange={e => setEpiForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Capacete de Segurança, Luva de Proteção..." />
              </div>
              {isCapacete(epiForm.nome) && (
                <CorCapaceteField value={epiForm.corCapacete} onChange={v => setEpiForm(f => ({ ...f, corCapacete: v }))} />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label>Número do CA</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input value={epiForm.ca} onChange={e => setEpiForm(f => ({ ...f, ca: e.target.value }))}
                        placeholder="Digite o CA (ex: 15532)" onKeyDown={e => { if (e.key === 'Enter') handleCaLookup(); }} />
                      {caLookupLoading && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <span className="animate-spin text-sm">⏳</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {caLookupResult?.found && (
                    <div className="mt-2 bg-green-50 border border-green-200 rounded p-2 text-xs text-green-700">
                      <p className="font-semibold">✓ CA {caLookupResult.ca} encontrado</p>
                      {caLookupResult.descricao && <p>{caLookupResult.descricao.substring(0, 100)}</p>}
                      {caLookupResult.situacao && <p>Situação: <strong className={caLookupResult.situacao === 'VÁLIDO' ? 'text-green-700' : 'text-red-600'}>{caLookupResult.situacao}</strong></p>}
                      {caLookupResult.fabricante && <p>Fabricante: {caLookupResult.fabricante}</p>}
                      {caLookupResult.validade && <p>Validade: {caLookupResult.validade}</p>}
                      {caLookupResult.referencia && <p>Referência: {caLookupResult.referencia}</p>}
                    </div>
                  )}
                  {caLookupResult && !caLookupResult.found && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                      <p>⚠ {caLookupResult.error || 'CA não encontrado'}</p>
                    </div>
                  )}
                  {epiForm.ca && epiForm.ca.replace(/\D/g, '').length >= 3 && !caLookupResult && !caLookupLoading && (
                    <p className="mt-1 text-xs text-muted-foreground">Buscando automaticamente...</p>
                  )}
                </div>
                <div>
                  <Label>Validade do CA</Label>
                  <Input type="date" value={epiForm.validadeCa} onChange={e => setEpiForm(f => ({ ...f, validadeCa: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label>Fabricante</Label>
                  <Input value={epiForm.fabricante} onChange={e => setEpiForm(f => ({ ...f, fabricante: e.target.value }))}
                    placeholder="Nome do fabricante" />
                </div>
                <div>
                  <Label>Fornecedor</Label>
                  <div className="flex gap-1">
                    <Select value={epiForm.fornecedor || "__manual__"} onValueChange={(v) => {
                      if (v === "__novo__") {
                        setEditingFornecedor(null); resetFornecedorForm(); setShowFornecedorDialog(true);
                      } else if (v === "__manual__") {
                        setEpiForm(f => ({ ...f, fornecedor: "", fornecedorCnpj: "", fornecedorContato: "", fornecedorTelefone: "", fornecedorEmail: "", fornecedorEndereco: "" }));
                      } else {
                        const found = fornecedoresList.find((f: any) => f.nome === v);
                        if (found) selectFornecedor(found);
                      }
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione o fornecedor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__manual__">Digitar manualmente</SelectItem>
                        {fornecedoresList.map((f: any) => (
                          <SelectItem key={f.id} value={f.nome}>
                            {f.nome} {f.cnpj ? `(${f.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")})` : ""}
                          </SelectItem>
                        ))}
                        <SelectItem value="__novo__">+ Cadastrar novo fornecedor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {!epiForm.fornecedor && (
                    <Input value={epiForm.fornecedor} onChange={e => setEpiForm(f => ({ ...f, fornecedor: e.target.value }))}
                      placeholder="Ou digite o nome" className="mt-1" />
                  )}
                </div>
              </div>


              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label className="flex items-center gap-1">
                    <Package className="h-3 w-3 text-indigo-600" />
                    Categoria
                  </Label>
                  <Select value={epiForm.categoria} onValueChange={(v: any) => setEpiForm(f => ({ ...f, categoria: v, tamanho: '' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EPI">EPI (Equipamento de Proteção)</SelectItem>
                      <SelectItem value="Uniforme">Uniforme (Roupa)</SelectItem>
                      <SelectItem value="Calcado">Calçado (Bota/Sapato)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {epiForm.categoria !== 'EPI' && (
                  <div>
                    <Label className="flex items-center gap-1">
                      {epiForm.categoria === 'Uniforme' ? (
                        <><Shirt className="h-3 w-3 text-indigo-600" /> Tamanho</>
                      ) : (
                        <><Footprints className="h-3 w-3 text-amber-800" /> Número do Calçado</>
                      )}
                    </Label>
                    <Select value={epiForm.tamanho || undefined} onValueChange={v => setEpiForm(f => ({ ...f, tamanho: v }))}>
                      <SelectTrigger><SelectValue placeholder={epiForm.categoria === 'Uniforme' ? 'Selecione o tamanho...' : 'Selecione o número...'} /></SelectTrigger>
                      <SelectContent>
                        {(epiForm.categoria === 'Uniforme' ? TAMANHOS_ROUPA : TAMANHOS_CALCADO).map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label className="flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 text-teal-600" />
                    Condição do EPI
                  </Label>
                  <Select value={epiForm.condicao} onValueChange={(v: any) => setEpiForm(f => ({ ...f, condicao: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Novo">Novo</SelectItem>
                      <SelectItem value="Reutilizado">Reutilizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <Label>Quantidade em Estoque</Label>
                  <Input type="number" min={0} value={epiForm.quantidadeEstoque}
                    onChange={e => setEpiForm(f => ({ ...f, quantidadeEstoque: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3 text-green-600" />
                    Valor do Produto (R$)
                  </Label>
                  <Input type="text" inputMode="numeric" value={epiForm.valorProduto}
                    onChange={e => setEpiForm(f => ({ ...f, valorProduto: handleCurrencyInput(e.target.value) }))}
                    placeholder="0,00" />
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-blue-600" />
                    Vida Útil (dias)
                    {aiSuggestionLoading && <span className="text-xs text-blue-500 animate-pulse ml-1">🧠 IA analisando...</span>}
                  </Label>
                  <Input type="number" min={0} value={epiForm.tempoMinimoTroca}
                    onChange={e => { setEpiForm(f => ({ ...f, tempoMinimoTroca: e.target.value })); if (aiSuggestion) setAiSuggestion(null); }}
                    placeholder="Ex: 180" />
                  {aiSuggestion && (
                    <div className="mt-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                      <span className="font-semibold">🧠 Sugestão IA:</span> {aiSuggestion.vidaUtilDias} dias
                      <span className="text-blue-500 ml-1">({aiSuggestion.confianca === 'alta' ? 'Alta confiança' : aiSuggestion.confianca === 'media' ? 'Média confiança' : 'Baixa confiança'})</span>
                      <p className="text-[10px] text-blue-500 mt-0.5">{aiSuggestion.justificativa}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => { setViewMode("catalogo"); resetEpiForm(); }}>Cancelar</Button>
                <Button onClick={() => {
                  if (!epiForm.nome.trim()) return toast.error("Nome do EPI é obrigatório");
                  createEpiMut.mutate({
                    companyId: queryCompanyId, nome: epiForm.nome,
                    ca: epiForm.ca || undefined, validadeCa: epiForm.validadeCa || undefined,
                    fabricante: epiForm.fabricante || undefined, fornecedor: epiForm.fornecedor || undefined,
                    fornecedorCnpj: epiForm.fornecedorCnpj?.replace(/\D/g, "") || undefined,
                    fornecedorContato: epiForm.fornecedorContato || undefined,
                    fornecedorTelefone: epiForm.fornecedorTelefone || undefined,
                    fornecedorEmail: epiForm.fornecedorEmail || undefined,
                    fornecedorEndereco: epiForm.fornecedorEndereco || undefined,
                    categoria: epiForm.categoria,
                    tamanho: epiForm.tamanho || undefined,
                    quantidadeEstoque: epiForm.quantidadeEstoque,
                    valorProduto: epiForm.valorProduto ? parseCurrencyToFloat(epiForm.valorProduto) : undefined,
                    tempoMinimoTroca: epiForm.tempoMinimoTroca ? parseInt(epiForm.tempoMinimoTroca) : undefined,
                    corCapacete: isCapacete(epiForm.nome) ? (epiForm.corCapacete || null) : null,
                    condicao: epiForm.condicao,
                  });
                }} disabled={createEpiMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  {createEpiMut.isPending ? "Salvando..." : "Cadastrar EPI"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        {showFornecedorDialog && <FornecedorDialog
          fornecedorForm={fornecedorForm} setFornecedorForm={setFornecedorForm}
          cnpjLoading={cnpjLoading} setCnpjLoading={setCnpjLoading}
          cnpjResult={cnpjResult} setCnpjResult={setCnpjResult}
          editingFornecedor={editingFornecedor}
          onClose={() => { setShowFornecedorDialog(false); resetFornecedorForm(); setEditingFornecedor(null); setCnpjResult(null); }}
          onSave={(cleanCnpj: string) => {
            if (editingFornecedor) {
              updateFornecedorMut.mutate({ id: editingFornecedor.id, nome: fornecedorForm.nome, cnpj: cleanCnpj || undefined, contato: fornecedorForm.contato || undefined, telefone: fornecedorForm.telefone || undefined, email: fornecedorForm.email || undefined, endereco: fornecedorForm.endereco || undefined, observacoes: fornecedorForm.observacoes || undefined });
            } else {
              createFornecedorMut.mutate({ companyId: queryCompanyId, nome: fornecedorForm.nome, cnpj: cleanCnpj || undefined, contato: fornecedorForm.contato || undefined, telefone: fornecedorForm.telefone || undefined, email: fornecedorForm.email || undefined, endereco: fornecedorForm.endereco || undefined, observacoes: fornecedorForm.observacoes || undefined });
            }
          }}
          isPending={createFornecedorMut.isPending || updateFornecedorMut.isPending}
        />}
      </DashboardLayout>
    );
  }

  // ============================================================
  // FORM: NOVA ENTREGA
  // ============================================================
  if (viewMode === "nova_entrega") {
    const selectedEpi = episList.find((e: any) => String(e.id) === entregaForm.epiId);
    const bdiPct = bdiQ.data?.bdiPercentual ?? 40;
    const showCharge = entregaForm.motivoTroca && ['perda', 'mau_uso', 'furto'].includes(entregaForm.motivoTroca) && selectedEpi?.valorProduto;
    const chargeValue = showCharge ? (parseFloat(String(selectedEpi.valorProduto)) * (1 + bdiPct / 100)).toFixed(2) : null;

    return (
      <DashboardLayout>
        <PrintHeader />
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("entregas")}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h1 className="text-xl font-bold">Registrar Entrega de EPI</h1>
          </div>

          <Card>
            <CardContent className="p-6 space-y-4 w-full">
              <div>
                <Label>EPI *</Label>
                <SearchableSelect
                  options={episList.map((e: any) => ({
                    value: String(e.id),
                    label: `${e.nome} ${e.ca ? `(CA: ${e.ca})` : ""}`,
                    subtitle: `Estoque: ${e.quantidadeEstoque ?? 0}${e.valorProduto ? ` — ${parseFloat(String(e.valorProduto)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ""}`,
                    searchExtra: `${e.ca || ""} ${e.nome || ""}`,
                  }))}
                  value={entregaForm.epiId || undefined}
                  onValueChange={v => {
                    // Auto-selecionar origem 'obra' se funcionário já selecionado está em obra com estoque
                    let origemEntrega = entregaForm.origemEntrega;
                    let origemObraId = entregaForm.origemObraId;
                    if (entregaForm.obraId && v) {
                      const temEstoqueObra = estoqueObraList2.some((e: any) => e.epiId === parseInt(v) && e.obraId === parseInt(entregaForm.obraId) && e.quantidade > 0);
                      if (temEstoqueObra) { origemEntrega = 'obra'; origemObraId = entregaForm.obraId; }
                    }
                    setEntregaForm(f => ({ ...f, epiId: v, origemEntrega, origemObraId }));
                  }}
                  placeholder="Selecione o EPI..."
                  searchPlaceholder="Buscar por nome ou CA..."
                  emptyMessage="Nenhum EPI encontrado."
                />
              </div>
              <div>
                <Label>Funcionário *</Label>
                <SearchableSelect
                  options={employeesList.map((e: any) => ({
                    value: String(e.id),
                    label: `${e.nomeCompleto} — ${e.funcao || "Sem função"}`,
                    subtitle: `${e.cpf || ""} ${e.codigoInterno ? `Mat: ${e.codigoInterno}` : ""}${e.obraAtualNome ? ` — ${e.obraAtualNome}` : ""}`,
                    searchExtra: `${e.cpf || ""} ${e.codigoInterno || ""} ${e.rg || ""} ${e.funcao || ""} ${e.obraAtualNome || ""}`,
                  }))}
                  value={entregaForm.employeeId || undefined}
                  onValueChange={v => {
                    const emp = employeesList.find((e: any) => String(e.id) === v);
                    const obraId = emp?.obraAtualId ? String(emp.obraAtualId) : "";
                    // Auto-selecionar origem 'obra' e origemObraId se funcionário está em obra com estoque do EPI
                    let origemEntrega = entregaForm.origemEntrega;
                    let origemObraId = entregaForm.origemObraId;
                    if (obraId && entregaForm.epiId) {
                      const temEstoqueObra = estoqueObraList2.some((e: any) => e.epiId === parseInt(entregaForm.epiId) && e.obraId === parseInt(obraId) && e.quantidade > 0);
                      if (temEstoqueObra) { origemEntrega = 'obra'; origemObraId = obraId; }
                    }
                    setEntregaForm(f => ({ ...f, employeeId: v, obraId, origemEntrega, origemObraId }));
                  }}
                  placeholder="Selecione o funcionário..."
                  searchPlaceholder="Buscar por nome, CPF, matrícula, função..."
                  emptyMessage="Nenhum funcionário encontrado."
                />
              </div>
              {/* ORIGEM DA ENTREGA */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <Label className="text-amber-800 font-semibold flex items-center gap-1.5"><Package className="h-4 w-4" /> Origem da Entrega *</Label>
                <div className="flex gap-3 mt-2">
                  <button type="button" onClick={() => setEntregaForm(f => ({ ...f, origemEntrega: 'central', origemObraId: '' }))}
                    className={`flex-1 p-3 rounded-lg border-2 text-center transition-all ${
                      entregaForm.origemEntrega === 'central' ? 'border-[#1B2A4A] bg-[#1B2A4A]/5 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <Package className={`h-5 w-5 mx-auto mb-1 ${entregaForm.origemEntrega === 'central' ? 'text-[#1B2A4A]' : 'text-gray-400'}`} />
                    <p className={`text-sm font-semibold ${entregaForm.origemEntrega === 'central' ? 'text-[#1B2A4A]' : 'text-gray-500'}`}>Escritório Central</p>
                    <p className="text-[10px] text-muted-foreground">Estoque central</p>
                  </button>
                  <button type="button" onClick={() => setEntregaForm(f => ({ ...f, origemEntrega: 'obra', origemObraId: '' }))}
                    className={`flex-1 p-3 rounded-lg border-2 text-center transition-all ${
                      entregaForm.origemEntrega === 'obra' ? 'border-[#1B2A4A] bg-[#1B2A4A]/5 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <HardHat className={`h-5 w-5 mx-auto mb-1 ${entregaForm.origemEntrega === 'obra' ? 'text-[#1B2A4A]' : 'text-gray-400'}`} />
                    <p className={`text-sm font-semibold ${entregaForm.origemEntrega === 'obra' ? 'text-[#1B2A4A]' : 'text-gray-500'}`}>Obra</p>
                    <p className="text-[10px] text-muted-foreground">Estoque do canteiro</p>
                  </button>
                </div>

                {/* Estoque central */}
                {entregaForm.origemEntrega === 'central' && entregaForm.epiId && (
                  <p className="text-xs text-blue-600 mt-2 font-medium">
                    Estoque Central: {episList.find((e: any) => String(e.id) === entregaForm.epiId)?.quantidadeEstoque ?? 0} unid.
                  </p>
                )}

                {/* Seleção de obra de origem */}
                {entregaForm.origemEntrega === 'obra' && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-amber-800 mb-2">
                      Selecione a obra de origem *
                      {!entregaForm.epiId && <span className="font-normal text-amber-600 ml-1">(selecione o EPI primeiro)</span>}
                    </p>
                    {entregaForm.epiId ? (() => {
                      const obrasComEstoque = estoqueObraList2.filter(
                        (e: any) => e.epiId === parseInt(entregaForm.epiId) && e.quantidade > 0
                      );
                      if (obrasComEstoque.length === 0) {
                        return (
                          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center gap-2">
                            <span>⚠️</span>
                            <span>Nenhuma obra possui estoque deste EPI. Transfira do estoque central primeiro.</span>
                          </div>
                        );
                      }
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {obrasComEstoque.map((e: any) => {
                            const obraInfo = obrasList.find((o: any) => o.id === e.obraId);
                            const isSelected = entregaForm.origemObraId === String(e.obraId);
                            const empObraId = entregaForm.employeeId
                              ? (employeesList.find((emp: any) => String(emp.id) === entregaForm.employeeId)?.obraAtualId)
                              : null;
                            const isEmpObra = empObraId && empObraId === e.obraId;
                            return (
                              <button
                                key={e.obraId}
                                type="button"
                                onClick={() => setEntregaForm(f => ({ ...f, origemObraId: String(e.obraId) }))}
                                className={`text-left p-2.5 rounded-lg border-2 transition-all ${
                                  isSelected
                                    ? 'border-green-600 bg-green-50 shadow-sm'
                                    : 'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50/50'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className={`text-xs font-semibold truncate ${isSelected ? 'text-green-800' : 'text-gray-700'}`}>
                                      {obraInfo?.nome || e.obraNome || `Obra #${e.obraId}`}
                                    </p>
                                    {isEmpObra && (
                                      <p className="text-[10px] text-blue-600 font-medium mt-0.5">← obra atual do funcionário</p>
                                    )}
                                  </div>
                                  <span className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                    isSelected ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {e.quantidade} un
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })() : null}
                  </div>
                )}
              </div>

              {/* OBRA DO FUNCIONÁRIO - informacional */}
              {entregaForm.employeeId && entregaForm.origemEntrega === 'central' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <Label className="text-blue-800 font-semibold">Local de Trabalho do Funcionário</Label>
                  <Select value={entregaForm.obraId || "sem_obra"} onValueChange={v => setEntregaForm(f => ({ ...f, obraId: v === "sem_obra" ? "" : v }))}>
                    <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sem_obra">Sem obra definida</SelectItem>
                      {obrasList.map((o: any) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {entregaForm.obraId && (() => {
                    const emp = employeesList.find((e: any) => String(e.id) === entregaForm.employeeId);
                    const obraDefault = emp?.obraAtualId ? String(emp.obraAtualId) : "";
                    if (entregaForm.obraId !== obraDefault) {
                      return <p className="text-xs text-amber-600 mt-1 font-medium">⚠️ Obra diferente da alocação atual do funcionário</p>;
                    }
                    return null;
                  })()}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <Label>Quantidade *</Label>
                  <Input type="number" min={1} value={entregaForm.quantidade}
                    onChange={e => setEntregaForm(f => ({ ...f, quantidade: parseInt(e.target.value) || 1 }))} />
                </div>
                <div>
                  <Label>Data da Entrega *</Label>
                  <Input type="date" value={entregaForm.dataEntrega}
                    onChange={e => setEntregaForm(f => ({ ...f, dataEntrega: e.target.value }))} />
                </div>
                <div>
                  <Label>Motivo da Troca</Label>
                  <Select value={entregaForm.motivoTroca || "nova_entrega"} onValueChange={v => setEntregaForm(f => ({ ...f, motivoTroca: v === "nova_entrega" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nova_entrega">Nova Entrega (sem troca)</SelectItem>
                      <SelectItem value="desgaste_normal">Desgaste Normal</SelectItem>
                      <SelectItem value="perda">Perda</SelectItem>
                      <SelectItem value="mau_uso">Mau Uso / Dano</SelectItem>
                      <SelectItem value="furto">Furto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Banner de custo dinâmico */}
              {entregaForm.motivoTroca || !entregaForm.motivoTroca ? (
                showCharge ? (
                  <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-red-700 font-bold text-sm mb-1">
                      <AlertTriangle className="h-5 w-5" />
                      ATENÇÃO: Este item gerará desconto em folha
                    </div>
                    <p className="text-sm text-red-600">
                      Valor a ser descontado: <strong className="text-lg">R$ {chargeValue}</strong>
                      <span className="text-xs ml-2">(valor + BDI {bdiPct}%)</span>
                    </p>
                    <p className="text-xs text-red-500 mt-1">
                      Base legal: Art. 462, §1º da CLT — desconto por dano causado pelo empregado.
                      O desconto será lançado automaticamente na folha do mês de referência.
                    </p>
                  </div>
                ) : (
                  entregaForm.epiId && (
                    <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 shadow-sm">
                      <div className="flex items-center gap-2 text-green-700 font-bold text-sm">
                        <Shield className="h-5 w-5" />
                        Troca sem custo para o colaborador
                      </div>
                      <p className="text-xs text-green-600 mt-1">
                        {!entregaForm.motivoTroca || entregaForm.motivoTroca === '' 
                          ? 'Entrega regular de EPI — sem cobrança.'
                          : 'Troca por desgaste natural de uso — sem cobrança ao colaborador.'}
                      </p>
                    </div>
                  )
                )
              ) : null}

              {/* Foto obrigatória para troca por desgaste/perda/mau uso */}
              {entregaForm.motivoTroca && ['desgaste_normal', 'perda', 'mau_uso', 'furto'].includes(entregaForm.motivoTroca) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <Label className="flex items-center gap-2 text-amber-800 font-semibold mb-2">
                    📷 Foto do Estado do EPI (Obrigatória)
                  </Label>
                  <p className="text-xs text-amber-600 mb-3">Para registrar troca por {entregaForm.motivoTroca === 'desgaste_normal' ? 'desgaste' : entregaForm.motivoTroca === 'mau_uso' ? 'mau uso/dano' : entregaForm.motivoTroca === 'perda' ? 'perda' : 'furto'}, é obrigatório anexar uma foto do estado atual do EPI.</p>
                  <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const preview = URL.createObjectURL(file);
                      setFotoEstado({ file, preview });
                    }
                  }} />
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => fotoInputRef.current?.click()}>
                      <Upload className="h-4 w-4 mr-1" /> {fotoEstado.file ? 'Trocar Foto' : 'Anexar Foto'}
                    </Button>
                    {fotoEstado.preview && (
                      <div className="relative">
                        <img src={fotoEstado.preview} alt="Foto EPI" className="h-20 w-20 object-cover rounded border" />
                        <button onClick={() => setFotoEstado({ file: null, preview: '' })} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">✕</button>
                      </div>
                    )}
                    {!fotoEstado.file && <span className="text-xs text-red-500">* Foto obrigatória</span>}
                  </div>
                </div>
              )}

              <div>
                <Label>Motivo / Observações</Label>
                <Input value={entregaForm.motivo} onChange={e => setEntregaForm(f => ({ ...f, motivo: e.target.value }))}
                  placeholder="Motivo da entrega ou observações" />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => { setViewMode("entregas"); resetEntregaForm(); }}>Cancelar</Button>
                <Button onClick={async () => {
                  if (!entregaForm.epiId || !entregaForm.employeeId) return toast.error("Selecione EPI e funcionário");
                  // Validar foto obrigatória para troca
                  const requiresFoto = entregaForm.motivoTroca && ['desgaste_normal', 'perda', 'mau_uso', 'furto'].includes(entregaForm.motivoTroca);
                  if (requiresFoto && !fotoEstado.file) return toast.error("Foto do estado do EPI é obrigatória para este tipo de troca");
                  
                  let fotoBase64: string | undefined;
                  let fotoFileName: string | undefined;
                  if (fotoEstado.file) {
                    const buffer = await fotoEstado.file.arrayBuffer();
                    const bytes = new Uint8Array(buffer);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); }
                    fotoBase64 = btoa(binary);
                    fotoFileName = fotoEstado.file.name;
                  }
                  if (entregaForm.origemEntrega === 'obra' && !entregaForm.origemObraId) return toast.error("Selecione a obra de origem do estoque");
                  createDeliveryMut.mutate({
                    companyId: queryCompanyId,
                    epiId: parseInt(entregaForm.epiId),
                    employeeId: parseInt(entregaForm.employeeId),
                    quantidade: entregaForm.quantidade,
                    dataEntrega: entregaForm.dataEntrega,
                    motivo: entregaForm.motivo || undefined,
                    observacoes: entregaForm.observacoes || undefined,
                    motivoTroca: entregaForm.motivoTroca || undefined,
                    fotoEstadoBase64: fotoBase64,
                    fotoEstadoFileName: fotoFileName,
                    origemEntrega: entregaForm.origemEntrega,
                    // quando origem=obra, usa a obra selecionada pelo usuário; senão usa a obra do funcionário
                    obraId: entregaForm.origemEntrega === 'obra'
                      ? parseInt(entregaForm.origemObraId)
                      : (entregaForm.obraId ? parseInt(entregaForm.obraId) : undefined),
                  });
                }} disabled={createDeliveryMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  {createDeliveryMut.isPending ? "Salvando..." : "Registrar Entrega"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // FICHA DE ENTREGA DE EPI (PRINTABLE)
  // ============================================================
  if (viewMode === "ficha_epi" && fichaDelivery) {
    const emp = employeesList.find((e: any) => e.id === fichaDelivery.employeeId);
    const epi = episList.find((e: any) => e.id === fichaDelivery.epiId);
    const textoFicha = formTextQ.data?.texto || '';

    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div className="flex items-center gap-3 print:hidden">
            <Button variant="ghost" size="sm" onClick={() => { setViewMode("entregas"); setFichaDelivery(null); }}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h1 className="text-xl font-bold">Ficha de Entrega de EPI</h1>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                const nomeFunc = fichaDelivery.nomeFunc || emp?.nomeCompleto || 'Funcionario';
                const oldTitle = document.title;
                document.title = `EPI - ${nomeFunc}`;
                window.print();
                setTimeout(() => { document.title = oldTitle; }, 500);
              }}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.pdf,.jpg,.jpeg,.png';
                input.onchange = async (e: any) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    uploadFichaMut.mutate({ deliveryId: fichaDelivery.id, fileBase64: base64, fileName: file.name });
                  };
                  reader.readAsDataURL(file);
                };
                input.click();
              }}>
                <Upload className="h-4 w-4 mr-1" /> Upload Assinada
              </Button>
              {fichaDelivery.fichaUrl && (
                <Button variant="outline" size="sm" onClick={() => window.open(fichaDelivery.fichaUrl, '_blank')}>
                  <Eye className="h-4 w-4 mr-1" /> Ver Assinada
                </Button>
              )}
            </div>
          </div>

          {/* Printable Form */}
          <div className="bg-white border rounded-lg p-8 max-w-3xl mx-auto print:border-0 print:shadow-none print:p-4">
            {/* Header - Logo centralizado no topo */}
            <div className="mb-6">
              {/* Logo + Nome da empresa centralizado */}
              <div className="flex flex-col items-center justify-center mb-4">
                {selectedCompany?.logoUrl ? (
                  <img src={selectedCompany.logoUrl} alt={selectedCompany?.razaoSocial || 'Empresa'} className="h-16 mb-2 object-contain" onError={(e: any) => e.target.style.display = 'none'} />
                ) : (
                  <img src="/fc-logo.png" alt="FC Engenharia" className="h-16 mb-2 object-contain" onError={(e: any) => e.target.style.display = 'none'} />
                )}
                <h2 className="text-lg font-bold text-[#1B2A4A] tracking-wide text-center">
                  {selectedCompany?.razaoSocial || 'FC ENGENHARIA PROJETOS E CONSULTORIA LTDA'}
                </h2>
                {selectedCompany?.cnpj && (
                  <p className="text-[10px] text-gray-500">CNPJ: {selectedCompany.cnpj}</p>
                )}
              </div>
              {/* Barra azul com título do documento */}
              <div className="bg-[#1B2A4A] text-white py-2 px-4 text-center">
                <span className="text-sm font-bold tracking-wider">FICHA DE ENTREGA DE EPI</span>
              </div>
              {/* Data de entrega e emissão */}
              <div className="flex justify-between mt-2 text-[10px] text-gray-500 px-1">
                <span>Data da Entrega: {fichaDelivery.dataEntrega ? new Date(fichaDelivery.dataEntrega + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</span>
                <div className="text-right">
                  <span>Emitido em: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}</span>
                  <br/>
                  <span>Emitido por: {user?.name || user?.email || "—"}</span>
                </div>
              </div>
            </div>

            {/* Employee Info - Box com borda */}
            <div className="border border-gray-300 rounded p-3 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
                <div><span className="text-gray-500 text-xs">Funcionário:</span><br/><strong className="text-[#1B2A4A]">{fichaDelivery.nomeFunc || emp?.nomeCompleto || "—"}</strong></div>
                <div><span className="text-gray-500 text-xs">Função:</span><br/><strong className="text-[#1B2A4A]">{fichaDelivery.funcaoFunc || emp?.funcao || "—"}</strong></div>
                <div><span className="text-gray-500 text-xs">CPF:</span><br/><strong>{emp?.cpf || "—"}</strong></div>
                <div><span className="text-gray-500 text-xs">Matrícula:</span><br/><strong>{emp?.codigoInterno || "—"}</strong></div>
                <div className="sm:col-span-2"><span className="text-gray-500 text-xs">Obra / Local de Trabalho:</span><br/><strong className="text-[#1B2A4A]">{fichaDelivery.obraNome || emp?.obraAtualNome || "—"}</strong></div>
              </div>
            </div>

            {/* EPI Table */}
            <table className="w-full text-sm border mb-6">
              <thead>
                <tr className="bg-[#1B2A4A] text-white">
                  <th className="p-2 text-left">EPI</th>
                  <th className="p-2 text-center">CA</th>
                  <th className="p-2 text-center">Qtd</th>
                  <th className="p-2 text-center">Vida Útil</th>
                  <th className="p-2 text-center">Valor Unit.</th>
                  <th className="p-2 text-center">Motivo</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="p-2">{fichaDelivery.nomeEpi || epi?.nome || "—"}</td>
                  <td className="p-2 text-center">{fichaDelivery.caEpi || epi?.ca || "—"}</td>
                  <td className="p-2 text-center">{fichaDelivery.quantidade}</td>
                  <td className="p-2 text-center">
                    {epi?.tempoMinimoTroca ? `${epi.tempoMinimoTroca} dias` : "—"}
                  </td>
                  <td className="p-2 text-center">
                    {epi?.valorProduto ? (() => {
                      const bdiPct = bdiQ.data?.bdiPercentual ?? 40;
                      const valorComBdi = parseFloat(String(epi.valorProduto)) * (1 + bdiPct / 100);
                      return valorComBdi.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    })() : "—"}
                  </td>
                  <td className="p-2 text-center">{fichaDelivery.motivo || "Entrega regular"}</td>
                </tr>
              </tbody>
            </table>

            {/* Policy Box - Vida Útil e Desconto */}
            <div className="border-2 border-[#1B2A4A] rounded p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-[#1B2A4A] text-white px-2 py-0.5 rounded text-[10px] font-bold">⚠️ IMPORTANTE</div>
                <p className="font-bold text-[#1B2A4A] text-xs">POLÍTICA DE CONSERVAÇÃO, TROCA E COBRANÇA DE EPI</p>
              </div>
              <div className="text-xs text-gray-700 leading-relaxed space-y-2">
                <p>
                  {epi?.tempoMinimoTroca ? (
                    <>O EPI acima possui <strong>vida útil mínima de {epi.tempoMinimoTroca} dias</strong> a partir da data de entrega. </>
                  ) : null}
                  A troca dentro do prazo de vida útil por <strong>desgaste natural de uso</strong> será realizada <strong>sem custo</strong> ao colaborador,
                  mediante apresentação do EPI danificado e registro fotográfico obrigatório.
                </p>
                <p className="bg-red-50 border border-red-200 rounded p-2 text-red-800">
                  <strong>💰 COBRANÇA:</strong> Em caso de <strong>perda, extravio, furto, dano por mau uso ou negligência</strong>,
                  o valor indicado na coluna "Valor Unit." será <strong>descontado
                  integralmente na folha de pagamento do mesmo mês</strong> em que ocorrer a solicitação de troca,
                  conforme Art. 462, §1º da CLT e acordo firmado neste documento.
                </p>
                <p className="bg-amber-50 border border-amber-200 rounded p-2 text-amber-800">
                  <strong>📷 FOTO OBRIGATÓRIA:</strong> Para qualquer solicitação de troca (desgaste, perda, mau uso ou furto),
                  é <strong>obrigatório</strong> o registro fotográfico do estado atual do EPI antigo como comprovação.
                  Sem a foto, a troca não será autorizada.
                </p>
              </div>
            </div>

            {/* Declaration Text */}
            <div className="text-sm text-justify mb-4 leading-relaxed">
              <p>{textoFicha || `Declaro ter recebido os Equipamentos de Proteção Individual (EPIs) acima descritos, comprometendo-me a utilizá-los corretamente durante a jornada de trabalho, conforme orientações recebidas. Estou ciente de que a não utilização, o uso inadequado ou a perda/dano por negligência poderá acarretar desconto em meu salário dentro do mesmo mês da ocorrência, conforme Art. 462, §1º da CLT e NR-6 do MTE. Declaro também estar ciente da obrigatoriedade de apresentação de registro fotográfico do EPI antigo para qualquer solicitação de troca.`}</p>
            </div>

            {/* Employee Obligations */}
            <div className="text-[10px] text-gray-600 mb-6 leading-relaxed border rounded p-2 bg-gray-50">
              <p className="font-semibold mb-1">Obrigações do Empregado (NR-6, item 6.7.1 do MTE):</p>
              <p>a) Usar o EPI apenas para a finalidade a que se destina;</p>
              <p>b) Responsabilizar-se pela guarda e conservação;</p>
              <p>c) Comunicar ao empregador qualquer alteração que o torne impróprio para uso;</p>
              <p>d) Cumprir as determinações do empregador sobre o uso adequado.</p>
            </div>

            {/* Signature Lines - Digital ou Impressa */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-16 mt-6 sm:mt-12 pt-4 sm:pt-8">
              <div className="text-center">
                {fichaDelivery.assinaturaUrl ? (
                  <div>
                    <img src={fichaDelivery.assinaturaUrl} alt="Assinatura" className="mx-auto h-16 object-contain mb-1" />
                    <div className="border-t border-black pt-1 text-sm">Assinatura do Funcionário</div>
                    <p className="text-[9px] text-green-600 mt-0.5">Assinatura digital coletada</p>
                  </div>
                ) : fichaSignature ? (
                  <div>
                    <img src={fichaSignature} alt="Assinatura" className="mx-auto h-16 object-contain mb-1" />
                    <div className="border-t border-black pt-1 text-sm">Assinatura do Funcionário</div>
                    <p className="text-[9px] text-green-600 mt-0.5">Assinatura digital coletada</p>
                  </div>
                ) : (
                  <div>
                    <div className="border-t border-black pt-2 text-sm">Assinatura do Funcionário</div>
                  </div>
                )}
              </div>
              <div className="text-center">
                <div className="border-t border-black pt-2 text-sm">
                  Responsável pela Entrega
                </div>
                <p className="text-[9px] text-gray-500 mt-0.5">{user?.name || ''}</p>
              </div>
            </div>

            {/* Botão Assinar Digitalmente - só aparece na tela, não na impressão */}
            {!fichaDelivery.assinaturaUrl && !fichaSignature && (
              <div className="mt-4 print:hidden">
                <Button
                  className="w-full bg-[#1B2A4A] hover:bg-[#243660] text-white"
                  onClick={() => setShowFichaSignPad(true)}
                >
                  <PenTool className="h-4 w-4 mr-2" /> Assinar Digitalmente pelo Celular
                </Button>
                <p className="text-[10px] text-center text-muted-foreground mt-1">
                  O funcionário assina na tela do celular/tablet — substitui a ficha de papel
                </p>
              </div>
            )}

            {/* Legal Footer */}
            <div className="mt-6 pt-4 border-t-2 border-[#1B2A4A] text-[10px] text-gray-400 text-center">
              <p>Conforme Art. 462, §1º da CLT e NR-6 (item 6.7.1) do MTE — Equipamentos de Proteção Individual</p>
              <p className="mt-1 text-[#1B2A4A] font-medium">{selectedCompany?.razaoSocial || 'FC Engenharia Projetos e Consultoria Ltda'}</p>
            </div>
          </div>
        </div>

        {/* Overlay de Assinatura Digital */}
        {showFichaSignPad && fichaDelivery && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden">
            <div className="max-w-lg w-full">
              <EpiAssinatura
                employeeId={fichaDelivery.employeeId}
                employeeName={fichaDelivery.nomeFunc || ''}
                deliveryId={fichaDelivery.id}
                tipo="entrega"
                epiNome={fichaDelivery.nomeEpi}
                onComplete={(url) => {
                  setShowFichaSignPad(false);
                  setFichaSignature(url);
                  // Atualizar o fichaDelivery com a URL da assinatura
                  setFichaDelivery((prev: any) => prev ? { ...prev, assinaturaUrl: url } : prev);
                  deliveriesQ.refetch();
                  toast.success("Assinatura digital coletada com sucesso!");
                }}
                onCancel={() => setShowFichaSignPad(false)}
              />
            </div>
          </div>
        )}
      </DashboardLayout>
    );
  }

  // ============================================================
  // MAIN VIEW
  // ============================================================
  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <HardHat className="h-6 w-6 text-amber-600" />
            <h1 className="text-lg sm:text-xl font-bold text-gray-800">Equipamentos de Proteção Individual</h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            {viewMode === "catalogo" && (
              <>
                {selectedEpis.size > 0 && (
                  <Button variant="destructive" size="sm" onClick={() => setShowBatchDeleteDialog(true)}>
                    <Trash2 className="h-4 w-4 mr-1" /> Excluir {selectedEpis.size}
                  </Button>
                )}
                {!readOnly && <Button size="sm" variant="outline" onClick={() => setShowFornecedorList(true)}>
                  <Package className="h-4 w-4 mr-1" /> Fornecedores
                </Button>}
                {!readOnly && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={autoFotoBulkLoading}
                    className="border-purple-400 text-purple-700 hover:bg-purple-50"
                    onClick={async () => {
                      setAutoFotoBulkLoading(true);
                      try {
                        const res = await autoFotoBulkMut.mutateAsync({ companyId: queryCompanyId });
                        if (res.total === 0) {
                          toast.success("Todos os EPIs já possuem foto!");
                        } else {
                          toast.success(`✓ ${res.atualizados} de ${res.total} EPIs atualizados com foto!`);
                        }
                        episQ.refetch();
                      } catch (e: any) {
                        toast.error("Erro ao buscar fotos: " + e.message);
                      } finally {
                        setAutoFotoBulkLoading(false);
                      }
                    }}
                  >
                    {autoFotoBulkLoading ? (
                      <><span className="animate-spin mr-1">⏳</span> Buscando fotos...</>
                    ) : (
                      <>🤖 Auto-foto EPIs</>
                    )}
                  </Button>
                )}
                {!readOnly && <Button size="sm" onClick={() => setViewMode("novo_epi")} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  <Plus className="h-4 w-4 mr-1" /> Novo EPI
                </Button>}
              </>
            )}
            {viewMode === "entregas" && (
              <Button size="sm" onClick={() => setViewMode("nova_entrega")} className="bg-[#1B2A4A] hover:bg-[#243660]">
                <Plus className="h-4 w-4 mr-1" /> Nova Entrega
              </Button>
            )}
          </div>
        </div>

        {/* Stats Cards - clicáveis com drill-down full screen */}
        {stats && (
          <div className="overflow-x-auto -mx-2 px-2 pb-1">
            <div className="flex gap-2 sm:gap-3 sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
              <Card className="border-l-4 border-l-blue-500 flex-shrink-0 w-[130px] sm:w-auto cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all" onClick={() => setDrillDown("totalEpis")}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground whitespace-nowrap">Total EPIs</p>
                  <p className="text-lg font-bold">{stats.totalItens.toLocaleString('pt-BR')}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500 flex-shrink-0 w-[130px] sm:w-auto cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all" onClick={() => setDrillDown("estoqueTotal")}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground whitespace-nowrap">Estoque Total</p>
                  <p className="text-lg font-bold">{stats.estoqueTotal.toLocaleString('pt-BR')}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500 flex-shrink-0 w-[130px] sm:w-auto cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all" onClick={() => setDrillDown("estoqueBaixo")}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground whitespace-nowrap">Estoque Baixo</p>
                  <p className="text-lg font-bold text-amber-600">{stats.estoqueBaixo.toLocaleString('pt-BR')}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-500 flex-shrink-0 w-[130px] sm:w-auto cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all" onClick={() => setDrillDown("caVencido")}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground whitespace-nowrap">CA Vencido</p>
                  <p className="text-lg font-bold text-red-600">{stats.caVencido.toLocaleString('pt-BR')}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-purple-500 flex-shrink-0 w-[130px] sm:w-auto cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all" onClick={() => setDrillDown("totalEntregas")}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground whitespace-nowrap">Total Entregas</p>
                  <p className="text-lg font-bold">{stats.totalEntregas.toLocaleString('pt-BR')}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-cyan-500 flex-shrink-0 w-[130px] sm:w-auto cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all" onClick={() => setDrillDown("entregasMes")}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground whitespace-nowrap">Entregas/Mês</p>
                  <p className="text-lg font-bold">{stats.entregasMes.toLocaleString('pt-BR')}</p>
                </CardContent>
              </Card>
              {!hideEpiValues && <Card className="border-l-4 border-l-emerald-500 flex-shrink-0 w-[150px] sm:w-auto cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all" onClick={() => setDrillDown("valorInventario")}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground whitespace-nowrap">Valor Inventário</p>
                  <p className="text-lg font-bold text-emerald-700">
                    {stats.valorTotalInventario > 0 ? stats.valorTotalInventario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : "—"}
                  </p>
                </CardContent>
              </Card>}
              <Card
                className={`border-l-4 flex-shrink-0 w-[150px] sm:w-auto cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all ${
                  !capacidadeQ.data?.kitConfigurado ? 'border-l-gray-400' :
                  (capacidadeQ.data?.capacidade ?? 0) === 0 ? 'border-l-red-500' :
                  (capacidadeQ.data?.capacidade ?? 0) <= 3 ? 'border-l-orange-500' :
                  (capacidadeQ.data?.capacidade ?? 0) <= 10 ? 'border-l-yellow-500' : 'border-l-green-500'
                }`}
                onClick={() => setViewMode("capacidade")}
              >
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                    <Users className="w-3 h-3" /> Cap. Contratação
                  </p>
                  {capacidadeQ.isLoading ? (
                    <p className="text-lg font-bold text-gray-400">...</p>
                  ) : !capacidadeQ.data?.kitConfigurado ? (
                    <p className="text-sm font-medium text-gray-400">Não config.</p>
                  ) : (
                    <p className={`text-lg font-bold ${
                      (capacidadeQ.data?.capacidade ?? 0) === 0 ? 'text-red-600' :
                      (capacidadeQ.data?.capacidade ?? 0) <= 3 ? 'text-orange-600' :
                      (capacidadeQ.data?.capacidade ?? 0) <= 10 ? 'text-yellow-600' : 'text-green-600'
                    }`}>
                      {capacidadeQ.data?.capacidade ?? 0}
                      <span className="text-xs font-normal text-muted-foreground ml-1">
                        {capacidadeQ.data?.nivel === 'critico' ? 'CRÍTICO' :
                         capacidadeQ.data?.nivel === 'baixo' ? 'BAIXO' :
                         capacidadeQ.data?.nivel === 'medio' ? 'MÉDIO' :
                         capacidadeQ.data?.nivel === 'bom' ? 'BOM' : 'ÓTIMO'}
                      </span>
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Tabs - multi-linha sem scroll */}
        <div className="bg-gray-100 p-1 rounded-lg flex flex-wrap gap-1">
          {(([
            { mode: "catalogo",      icon: <Package className="h-3.5 w-3.5" />,       label: "Catálogo" },
            { mode: "entregas",      icon: <ClipboardList className="h-3.5 w-3.5" />,  label: "Entregas" },
            { mode: "estoque_obra",  icon: <Warehouse className="h-3.5 w-3.5" />,      label: "Estoque Obra" },
            { mode: "transferencias",icon: <ArrowLeftRight className="h-3.5 w-3.5" />, label: "Transferências" },
            { mode: "checklist",     icon: <ClipboardList className="h-3.5 w-3.5" />,  label: "Checklists" },
            { mode: "validade",      icon: <Clock className="h-3.5 w-3.5" />,          label: "Validade" },
            { mode: "minimo",        icon: <Bell className="h-3.5 w-3.5" />,           label: "Mínimos" },
            { mode: "custos",        icon: <BarChart3 className="h-3.5 w-3.5" />,      label: "Custos" },
            { mode: "ia",            icon: <Brain className="h-3.5 w-3.5" />,          label: "IA" },
            { mode: "capacidade",    icon: <Users className="h-3.5 w-3.5" />,          label: "Capacidade" },
            { mode: "descontos",     icon: <Ban className="h-3.5 w-3.5" />,            label: "Descontos" },
            { mode: "config",        icon: <Settings2 className="h-3.5 w-3.5" />,      label: "Config" },
          ]) as { mode: typeof viewMode; icon: React.ReactNode; label: string }[]).map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${viewMode === mode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Search + Filters - ocultar nas novas abas que têm seus próprios filtros */}
        {!["config", "checklist", "validade", "custos", "minimo", "ia", "capacidade"].includes(viewMode) && (
        <div className="space-y-3">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 w-full" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Select value={filterCategoria} onValueChange={(v: any) => setFilterCategoria(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todas Categorias</SelectItem>
                <SelectItem value="EPI">EPI</SelectItem>
                <SelectItem value="Uniforme">Uniforme</SelectItem>
                <SelectItem value="Calçado">Calçado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCondicao} onValueChange={(v: any) => setFilterCondicao(v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Condição" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todas Condições</SelectItem>
                <SelectItem value="Novo">Novo</SelectItem>
                <SelectItem value="Reutilizado">Reutilizado</SelectItem>
              </SelectContent>
            </Select>
            {tamanhosFiltro.length > 0 && (
              <Select value={filterTamanho} onValueChange={(v: any) => setFilterTamanho(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Tamanho" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos Tamanhos</SelectItem>
                  {tamanhosFiltro.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        )}

        {/* ============================================================ */}
        {/* CATÁLOGO */}
        {/* ============================================================ */}
        {viewMode === "catalogo" && (
          filteredEpis.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <HardHat className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Nenhum EPI cadastrado</h3>
                <p className="text-muted-foreground text-sm mt-1">Cadastre os EPIs disponíveis para controle.</p>
                <Button onClick={() => setViewMode("novo_epi")} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                  <Plus className="h-4 w-4 mr-2" /> Cadastrar EPI
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-center w-10">
                          <input type="checkbox" checked={selectedEpis.size === filteredEpis.length && filteredEpis.length > 0}
                            onChange={toggleSelectAllEpis} className="rounded" />
                        </th>
                        <th className="p-3 text-center font-medium w-14">Foto</th>
                        <th className="p-3 text-left font-medium">EPI</th>
                        <th className="p-3 text-center font-medium">Categoria</th>
                        <th className="p-3 text-center font-medium">Tam.</th>
                        <th className="p-3 text-center font-medium">CA</th>
                        <th className="p-3 text-center font-medium">Validade CA</th>
                        <th className="p-3 text-center font-medium">Estoque</th>
                        {!hideEpiValues && <th className="p-3 text-center font-medium">Valor (R$)</th>}
                        <th className="p-3 text-center font-medium">Vida Útil</th>
                        <th className="p-3 text-left font-medium">Cadastrado por</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEpis.map((epi: any) => {
                        const caVencido = epi.validadeCa && epi.validadeCa < hoje;
                        const estoqueBaixo = (epi.quantidadeEstoque || 0) <= 5;
                        return (
                          <tr key={epi.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 text-center">
                              <input type="checkbox" checked={selectedEpis.has(epi.id)}
                                onChange={() => toggleSelectEpi(epi.id)} className="rounded" />
                            </td>
                            <td className="p-3 text-center">
                              {epi.fotoUrl ? (
                                <img src={epi.fotoUrl} alt={epi.nome} className="w-10 h-10 object-contain rounded mx-auto border bg-white"
                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              ) : (
                                <div className="w-10 h-10 rounded border bg-slate-50 flex items-center justify-center mx-auto">
                                  <ImagePlus className="h-4 w-4 text-slate-300" />
                                </div>
                              )}
                            </td>
                            <td className="p-3 cursor-pointer" onClick={() => { setEditingEpi(epi); loadEpiForEdit(epi); setViewMode("editar_epi"); }}>
                              <div className="flex items-center gap-2 hover:text-blue-700 transition-colors">
                                {getEpiIcon(epi.nome, "h-4 w-4 shrink-0")}
                                <div>
                                  <span className="font-medium hover:underline">{epi.nome}</span>
                                  {epi.fabricante && <span className="text-xs text-muted-foreground ml-1">({epi.fabricante})</span>}
                                  {epi.corCapacete && isCapacete(epi.nome) && (
                                    <span className="inline-flex items-center gap-1 ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 border border-amber-200 text-amber-700">
                                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CORES_CAPACETE.find(c => c.value === epi.corCapacete)?.hex || '#999' }} />
                                      {epi.corCapacete}
                                    </span>
                                  )}
                                  {epi.condicao === 'Reutilizado' ? (
                                    <span className="inline-flex items-center gap-1 ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 border border-orange-200 text-orange-700">
                                      <RefreshCw className="h-2.5 w-2.5" /> Reutilizado
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 border border-green-200 text-green-700">
                                      <ShieldCheck className="h-2.5 w-2.5" /> Novo
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <Badge variant="outline" className={`text-xs ${epi.categoria === 'Uniforme' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : epi.categoria === 'Calcado' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                {epi.categoria === 'Calcado' ? 'Calçado' : epi.categoria || 'EPI'}
                              </Badge>
                            </td>
                            <td className="p-3 text-center text-xs font-medium">
                              {epi.tamanho || '—'}
                            </td>
                            <td className="p-3 text-center">
                              {epi.ca ? <Badge variant="outline">{epi.ca}</Badge> : "—"}
                            </td>
                            <td className="p-3 text-center">
                              {epi.validadeCa ? (
                                <Badge variant={caVencido ? "destructive" : "outline"} className="text-xs">
                                  {new Date(epi.validadeCa + "T00:00:00").toLocaleDateString("pt-BR")}
                                </Badge>
                              ) : "—"}
                            </td>
                            <td className="p-3 text-center">
                              <Badge variant={estoqueBaixo ? "destructive" : "secondary"} className="text-xs">
                                {epi.quantidadeEstoque ?? 0}
                              </Badge>
                            </td>
                            {!hideEpiValues && <td className="p-3 text-center text-xs">
                              {epi.valorProduto ? parseFloat(String(epi.valorProduto)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : "—"}
                            </td>}
                            <td className="p-3 text-center text-xs">
                              {epi.tempoMinimoTroca ? `${epi.tempoMinimoTroca} dias` : "—"}
                            </td>
                            <td className="p-3 text-left">
                              <div className="text-xs">
                                <span className="font-medium">{epi.criadoPor || '—'}</span>
                                {epi.createdAt && <p className="text-[10px] text-muted-foreground">{new Date(epi.createdAt).toLocaleDateString('pt-BR')}</p>}
                                {epi.alteradoPor && <p className="text-[10px] text-blue-600 mt-0.5">Alt: {epi.alteradoPor}</p>}
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {!readOnly && <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar"
                                  onClick={() => { setEditingEpi(epi); loadEpiForEdit(epi); setViewMode("editar_epi"); }}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>}
                                {!readOnly && <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir"
                                  onClick={() => { if (confirm("Excluir este EPI?")) deleteEpiMut.mutate({ id: epi.id }); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t bg-muted/30 p-3 text-sm text-muted-foreground">
                  {filteredEpis.length} EPI{filteredEpis.length !== 1 ? "s" : ""} encontrado{filteredEpis.length !== 1 ? "s" : ""}
                </div>

                {/* Batch Delete Dialog */}
                {showBatchDeleteDialog && (
                  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowBatchDeleteDialog(false)}>
                    <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
                      <h3 className="text-lg font-bold text-red-700 mb-2">Confirmar Exclusão em Lote</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Tem certeza que deseja excluir <strong>{selectedEpis.size}</strong> EPI(s)?
                      </p>
                      <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setShowBatchDeleteDialog(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={() => deleteBatchMut.mutate({ ids: Array.from(selectedEpis) })} disabled={deleteBatchMut.isPending}>
                          {deleteBatchMut.isPending ? "Excluindo..." : `Excluir ${selectedEpis.size} EPI(s)`}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        )}

        {/* ============================================================ */}
        {/* ENTREGAS */}
        {/* ============================================================ */}
        {viewMode === "entregas" && (
          filteredDeliveries.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Nenhuma entrega registrada</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Registre as entregas de EPIs aos funcionários.
                </p>
                <Button onClick={() => setViewMode("nova_entrega")} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                  <Plus className="h-4 w-4 mr-2" /> Nova Entrega
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-left font-medium">Data</th>
                        <th className="p-3 text-left font-medium">Funcionário</th>
                        <th className="p-3 text-left font-medium">EPI</th>
                        <th className="p-3 text-center font-medium">Qtd</th>
                        <th className="p-3 text-left font-medium">Motivo Troca</th>
                        <th className="p-3 text-center font-medium">Cobrança</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeliveries.map((d: any) => {
                        const motivoLabel: Record<string, string> = {
                          perda: "Perda",
                          mau_uso: "Mau Uso",
                          desgaste_normal: "Desgaste",
                          furto: "Furto",
                        };
                        return (
                          <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 text-xs">
                              {d.dataEntrega ? new Date(d.dataEntrega + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-blue-600" />
                                <div>
                                  <span className="font-medium text-xs">{d.nomeFunc || "—"}</span>
                                  {d.funcaoFunc && <span className="text-[10px] text-muted-foreground ml-1">({d.funcaoFunc})</span>}
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {getEpiIcon(d.nomeEpi || "", "h-3.5 w-3.5")}
                                <span className="text-xs">{d.nomeEpi || "—"}</span>
                                {d.caEpi && <Badge variant="outline" className="text-[10px]">CA: {d.caEpi}</Badge>}
                              </div>
                            </td>
                            <td className="p-3 text-center font-bold">{d.quantidade}</td>
                            <td className="p-3 text-xs">
                              {d.motivoTroca ? (
                                <Badge variant={['perda', 'mau_uso', 'furto'].includes(d.motivoTroca) ? "destructive" : "secondary"} className="text-[10px]">
                                  {motivoLabel[d.motivoTroca] || d.motivoTroca}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">Entrega regular</span>
                              )}
                            </td>
                            <td className="p-3 text-center text-xs">
                              {d.valorCobrado ? (
                                <span className="text-red-600 font-semibold">R$ {parseFloat(String(d.valorCobrado)).toFixed(2)}</span>
                              ) : "—"}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Ficha de Entrega"
                                  onClick={() => { setFichaDelivery(d); setViewMode("ficha_epi"); }}>
                                  <FileText className="h-3.5 w-3.5 text-blue-600" />
                                </Button>
                                {d.fichaUrl && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver ficha assinada"
                                    onClick={() => window.open(d.fichaUrl, "_blank")}>
                                    <Eye className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Remover entrega" onClick={() => {
                                  if (confirm("Remover esta entrega? O estoque será devolvido.")) {
                                    deleteDeliveryMut.mutate({ id: d.id, epiId: d.epiId, quantidade: d.quantidade });
                                  }
                                }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t bg-muted/30 p-3 text-sm text-muted-foreground">
                  {filteredDeliveries.length} entrega{filteredDeliveries.length !== 1 ? "s" : ""} encontrada{filteredDeliveries.length !== 1 ? "s" : ""}
                </div>
              </CardContent>
            </Card>
          )
        )}

        {/* ============================================================ */}
        {/* ESTOQUE POR OBRA */}
        {/* ============================================================ */}
        {viewMode === "estoque_obra" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <h2 className="text-lg font-bold text-[#1B3A5C] flex items-center gap-2">
                  <Warehouse className="h-5 w-5" /> Estoque por Obra
                </h2>
                <Select value={filterObraEstoque} onValueChange={setFilterObraEstoque}>
                  <SelectTrigger className="w-full sm:w-[220px]"><SelectValue placeholder="Filtrar por obra..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as Obras</SelectItem>
                    {obrasList.map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={() => setShowEntradaDiretaDialog(true)} variant="outline" className="border-green-500 text-green-700 hover:bg-green-50">
                  <Plus className="h-4 w-4 mr-2" /> Entrada Direta
                </Button>
                <Button size="sm" onClick={() => setShowTransferDialog(true)} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  <ArrowLeftRight className="h-4 w-4 mr-2" /> Nova Transferência
                </Button>
              </div>
            </div>

            {/* Resumo por obra */}
            {estoqueResumo.length > 0 && (
              <>
              {/* Total geral de valor em obras */}
              <Card className="border-emerald-200 bg-emerald-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 rounded-lg">
                        <DollarSign className="h-5 w-5 text-emerald-700" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Valor Total em Estoque nas Obras</p>
                        <p className="text-xl font-bold text-emerald-700">R$ {estoqueResumo.filter((r: any) => filterObraEstoque === "todas" || String(r.obraId) === filterObraEstoque).reduce((s: number, r: any) => s + parseFloat(String(r.valorTotal || 0)), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{estoqueResumo.filter((r: any) => filterObraEstoque === "todas" || String(r.obraId) === filterObraEstoque).reduce((s: number, r: any) => s + (r.totalUnidades || 0), 0)} unid.</p>
                      <p className="text-xs text-muted-foreground">{estoqueResumo.filter((r: any) => filterObraEstoque === "todas" || String(r.obraId) === filterObraEstoque).length} obra(s)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {estoqueResumo
                  .filter((r: any) => filterObraEstoque === "todas" || String(r.obraId) === filterObraEstoque)
                  .map((r: any) => (
                  <Card key={r.obraId} className="border-l-4 border-l-blue-500">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-sm text-[#1B3A5C]">{r.nomeObra}</p>
                          <p className="text-xs text-muted-foreground mt-1">{r.totalItens} tipo(s) de EPI</p>
                          <p className="text-xs text-emerald-600 font-medium mt-0.5">R$ {parseFloat(String(r.valorTotal || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">
                          {r.totalUnidades} unid.
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              </>
            )}

            {/* Tabela detalhada */}
            <Card>
              <CardContent className="p-0">
                {estoqueObraList2.filter((e: any) => filterObraEstoque === "todas" || String(e.obraId) === filterObraEstoque).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Warehouse className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="font-semibold text-lg">Nenhum estoque em obra</h3>
                    <p className="text-muted-foreground text-sm mt-1">Faça transferências ou cadastre EPIs já existentes na obra.</p>
                    <div className="flex gap-2 mt-4">
                      <Button onClick={() => setShowEntradaDiretaDialog(true)} variant="outline" className="border-green-500 text-green-700 hover:bg-green-50">
                        <Plus className="h-4 w-4 mr-2" /> Entrada Direta
                      </Button>
                      <Button onClick={() => setShowTransferDialog(true)} className="bg-[#1B2A4A] hover:bg-[#243660]">
                        <ArrowLeftRight className="h-4 w-4 mr-2" /> Nova Transferência
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Obra</th>
                          <th className="p-3 text-left font-medium">EPI</th>
                          <th className="p-3 text-center font-medium">CA</th>
                          <th className="p-3 text-center font-medium">Categoria</th>
                          <th className="p-3 text-center font-medium">Quantidade</th>
                          <th className="p-3 text-right font-medium">Valor Unit.</th>
                          <th className="p-3 text-right font-medium">Valor Total</th>
                          <th className="p-3 text-center font-medium">Status</th>
                          <th className="p-3 text-center font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {estoqueObraList2
                          .filter((e: any) => filterObraEstoque === "todas" || String(e.obraId) === filterObraEstoque)
                          .map((e: any) => (
                          <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => {
                            const epi = episList.find((ep: any) => ep.id === e.epiId);
                            if (epi) { setEditingEpi(epi); loadEpiForEdit(epi); setViewMode('editar_epi'); }
                          }}>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-3.5 w-3.5 text-blue-600" />
                                <span className="font-medium text-xs">{e.nomeObra || 'Obra #' + e.obraId}</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {getEpiIcon(e.nomeEpi || '', 'h-3.5 w-3.5')}
                                <span className="text-xs font-medium">{e.nomeEpi || 'EPI #' + e.epiId}</span>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              {e.caEpi ? <Badge variant="outline" className="text-[10px]">CA: {e.caEpi}</Badge> : '—'}
                            </td>
                            <td className="p-3 text-center">
                              <Badge variant="outline" className="text-[10px]">{e.categoriaEpi || '—'}</Badge>
                            </td>
                            <td className="p-3 text-center font-bold text-lg">{e.quantidade}</td>
                            <td className="p-3 text-right text-xs">
                              {e.valorProdutoEpi ? `R$ ${parseFloat(String(e.valorProdutoEpi)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                            </td>
                            <td className="p-3 text-right text-xs font-semibold text-emerald-700">
                              {e.valorProdutoEpi ? `R$ ${(parseFloat(String(e.valorProdutoEpi)) * e.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                            </td>
                            <td className="p-3 text-center">
                              {e.quantidade > 0 ? (
                                <Badge className="bg-green-100 text-green-700 border-green-300">Disponível</Badge>
                              ) : (
                                <Badge variant="destructive">Zerado</Badge>
                              )}
                            </td>
                            <td className="p-3 text-center" onClick={(ev) => ev.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Editar EPI" onClick={() => {
                                  const epi = episList.find((ep: any) => ep.id === e.epiId);
                                  if (epi) { setEditingEpi(epi); loadEpiForEdit(epi); setViewMode('editar_epi'); }
                                }}>
                                  <Pencil className="h-3.5 w-3.5 text-blue-600" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Ver Entregas" onClick={() => setViewMode('entregas')}>
                                  <Eye className="h-3.5 w-3.5 text-gray-500" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============================================================ */}
        {/* TRANSFERÊNCIAS */}
        {/* ============================================================ */}
        {viewMode === "transferencias" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-[#1B3A5C] flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5" /> Histórico de Transferências
              </h2>
              <Button size="sm" onClick={() => setShowTransferDialog(true)} className="bg-[#1B2A4A] hover:bg-[#243660]">
                <Plus className="h-4 w-4 mr-2" /> Nova Transferência
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                {transferenciasList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <ArrowLeftRight className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="font-semibold text-lg">Nenhuma transferência registrada</h3>
                    <p className="text-muted-foreground text-sm mt-1">Transfira EPIs do escritório central para as obras.</p>
                    <Button onClick={() => setShowTransferDialog(true)} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                      <Plus className="h-4 w-4 mr-2" /> Nova Transferência
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Data</th>
                          <th className="p-3 text-left font-medium">EPI</th>
                          <th className="p-3 text-center font-medium">Qtd</th>
                          <th className="p-3 text-left font-medium">Origem</th>
                          <th className="p-3 text-center font-medium">→</th>
                          <th className="p-3 text-left font-medium">Destino</th>
                          <th className="p-3 text-left font-medium">Obs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transferenciasList.map((t: any) => (
                          <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 text-xs">
                              {t.data ? new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {getEpiIcon(t.nomeEpi || '', 'h-3.5 w-3.5')}
                                <span className="text-xs">{t.nomeEpi || 'EPI #' + t.epiId}</span>
                              </div>
                            </td>
                            <td className="p-3 text-center font-bold">{t.quantidade}</td>
                            <td className="p-3">
                              <Badge variant="outline" className={t.tipoOrigem === 'central' ? 'bg-blue-50 text-blue-700 border-blue-300' : t.tipoOrigem === 'entrada_direta' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-green-50 text-green-700 border-green-300'}>
                                {t.tipoOrigem === 'central' ? '🏢 Central' : t.tipoOrigem === 'entrada_direta' ? '📋 Entrada Direta' : `🏗️ ${t.origemNome || 'Obra'}`}
                              </Badge>
                            </td>
                            <td className="p-3 text-center"><ArrowRight className="h-4 w-4 text-muted-foreground mx-auto" /></td>
                            <td className="p-3">
                              <Badge variant="outline" className={t.destinoObraId ? 'bg-green-50 text-green-700 border-green-300' : 'bg-blue-50 text-blue-700 border-blue-300'}>
                                {t.destinoObraId ? `🏗️ ${t.destinoNome || 'Obra #' + t.destinoObraId}` : '🏢 Escritório Central'}
                              </Badge>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">{t.observacoes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="border-t bg-muted/30 p-3 text-sm text-muted-foreground">
                  {transferenciasList.length} transferência{transferenciasList.length !== 1 ? 's' : ''}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Dialog de Transferência */}
      {showTransferDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-[#1B3A5C] flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5" /> Nova Transferência
              </h3>
              <Button size="sm" variant="ghost" onClick={() => { setShowTransferDialog(false); resetTransForm(); }}>✕</Button>
            </div>

            <div className="space-y-3">
              <div>
                <Label>EPI *</Label>
                <Select value={transForm.epiId || undefined} onValueChange={v => setTransForm(f => ({ ...f, epiId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o EPI..." /></SelectTrigger>
                  <SelectContent>
                    {episList.map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.nome} {e.ca ? `(CA: ${e.ca})` : ''} — Estoque Central: {e.quantidadeEstoque ?? 0}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Origem *</Label>
                <div className="flex gap-2 mt-1">
                  <button type="button" onClick={() => setTransForm(f => ({ ...f, tipoOrigem: 'central', origemObraId: '' }))}
                    className={`flex-1 p-2 rounded-lg border-2 text-center text-sm transition-all ${
                      transForm.tipoOrigem === 'central' ? 'border-[#1B2A4A] bg-[#1B2A4A]/5' : 'border-gray-200'
                    }`}>
                    🏢 Escritório Central
                    {transForm.epiId && <span className="block text-[10px] text-blue-600 mt-0.5">Estoque: {episList.find((e: any) => String(e.id) === transForm.epiId)?.quantidadeEstoque ?? 0}</span>}
                  </button>
                  <button type="button" onClick={() => setTransForm(f => ({ ...f, tipoOrigem: 'obra' }))}
                    className={`flex-1 p-2 rounded-lg border-2 text-center text-sm transition-all ${
                      transForm.tipoOrigem === 'obra' ? 'border-[#1B2A4A] bg-[#1B2A4A]/5' : 'border-gray-200'
                    }`}>
                    🏗️ Outra Obra
                  </button>
                </div>
              </div>

              {transForm.tipoOrigem === 'obra' && (
                <div>
                  <Label>Obra de Origem *</Label>
                  <Select value={transForm.origemObraId || undefined} onValueChange={v => setTransForm(f => ({ ...f, origemObraId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a obra de origem..." /></SelectTrigger>
                    <SelectContent>
                      {obrasList.map((o: any) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {transForm.epiId && transForm.origemObraId && (
                    <p className="text-xs text-green-600 mt-1">Estoque nesta obra: {estoqueObraList2.find((e: any) => e.epiId === parseInt(transForm.epiId) && e.obraId === parseInt(transForm.origemObraId))?.quantidade ?? 0}</p>
                  )}
                </div>
              )}

              <div>
                <Label>Destino *</Label>
                <div className="flex gap-2 mt-1">
                  <button type="button" onClick={() => setTransForm(f => ({ ...f, tipoDestino: 'obra', destinoObraId: '' }))}
                    className={`flex-1 p-2 rounded-lg border-2 text-center text-sm transition-all ${
                      transForm.tipoDestino === 'obra' ? 'border-[#1B2A4A] bg-[#1B2A4A]/5' : 'border-gray-200'
                    }`}>
                    🏗️ Obra
                  </button>
                  {transForm.tipoOrigem === 'obra' && (
                    <button type="button" onClick={() => setTransForm(f => ({ ...f, tipoDestino: 'central', destinoObraId: '' }))}
                      className={`flex-1 p-2 rounded-lg border-2 text-center text-sm transition-all ${
                        transForm.tipoDestino === 'central' ? 'border-[#1B2A4A] bg-[#1B2A4A]/5' : 'border-gray-200'
                      }`}>
                      🏢 Escritório Central
                    </button>
                  )}
                </div>
              </div>

              {transForm.tipoDestino === 'obra' && (
                <div>
                  <Label>Obra de Destino *</Label>
                  <Select value={transForm.destinoObraId || undefined} onValueChange={v => setTransForm(f => ({ ...f, destinoObraId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a obra de destino..." /></SelectTrigger>
                    <SelectContent>
                      {obrasList.filter((o: any) => String(o.id) !== transForm.origemObraId).map((o: any) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Quantidade *</Label>
                  <Input type="number" min={1} value={transForm.quantidade}
                    onChange={e => setTransForm(f => ({ ...f, quantidade: parseInt(e.target.value) || 1 }))} />
                </div>
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={transForm.data}
                    onChange={e => setTransForm(f => ({ ...f, data: e.target.value }))} />
                </div>
              </div>

              <div>
                <Label>Observações</Label>
                <Input value={transForm.observacoes} onChange={e => setTransForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Motivo da transferência..." />
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setShowTransferDialog(false); resetTransForm(); }}>Cancelar</Button>
                <Button className="flex-1 bg-[#1B2A4A] hover:bg-[#243660]" disabled={transferirMut.isPending}
                  onClick={() => {
                    if (!transForm.epiId) return toast.error('Selecione o EPI');
                    if (transForm.tipoDestino === 'obra' && !transForm.destinoObraId) return toast.error('Selecione a obra de destino');
                    if (transForm.tipoOrigem === 'obra' && !transForm.origemObraId) return toast.error('Selecione a obra de origem');
                    if (transForm.tipoOrigem === 'central' && transForm.tipoDestino === 'central') return toast.error('Não é possível transferir do central para o central');
                    if (transForm.tipoOrigem === 'obra' && transForm.tipoDestino === 'obra' && transForm.origemObraId === transForm.destinoObraId) return toast.error('Origem e destino não podem ser a mesma obra');
                    transferirMut.mutate({
                      companyId: queryCompanyId,
                      epiId: parseInt(transForm.epiId),
                      quantidade: transForm.quantidade,
                      tipoOrigem: transForm.tipoOrigem,
                      origemObraId: transForm.origemObraId ? parseInt(transForm.origemObraId) : undefined,
                      tipoDestino: transForm.tipoDestino,
                      destinoObraId: transForm.destinoObraId ? parseInt(transForm.destinoObraId) : undefined,
                      data: transForm.data,
                      observacoes: transForm.observacoes || undefined,
                    });
                  }}>
                  {transferirMut.isPending ? 'Transferindo...' : 'Confirmar Transferência'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dialog Entrada Direta na Obra */}
      {showEntradaDiretaDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-[#1B3A5C] mb-4 flex items-center gap-2">
              <Plus className="h-5 w-5 text-green-600" /> Entrada Direta na Obra
            </h3>
            <p className="text-sm text-muted-foreground mb-4">Cadastre EPIs que já existem fisicamente na obra.</p>
            <div className="space-y-4">
              <div>
                <Label>EPI *</Label>
                <Select value={entradaDiretaForm.epiId} onValueChange={v => setEntradaDiretaForm(f => ({ ...f, epiId: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o EPI..." /></SelectTrigger>
                  <SelectContent>
                    {(episQ.data || []).map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.nome} {e.ca ? `(CA ${e.ca})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Obra *</Label>
                <Select value={entradaDiretaForm.obraId} onValueChange={v => setEntradaDiretaForm(f => ({ ...f, obraId: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
                  <SelectContent>
                    {obrasList.map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantidade *</Label>
                <Input type="number" min="1" value={entradaDiretaForm.quantidade}
                  onChange={e => setEntradaDiretaForm(f => ({ ...f, quantidade: e.target.value }))} placeholder="Ex: 10" />
              </div>
              <div>
                <Label>Observação</Label>
                <Input value={entradaDiretaForm.observacao}
                  onChange={e => setEntradaDiretaForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Ex: EPIs já existentes no almoxarifado da obra" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setShowEntradaDiretaDialog(false); setEntradaDiretaForm({ epiId: "", obraId: "", quantidade: "", observacao: "" }); }}>
                  Cancelar
                </Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" disabled={entradaDiretaObraMut.isPending || !entradaDiretaForm.epiId || !entradaDiretaForm.obraId || !entradaDiretaForm.quantidade}
                  onClick={() => {
                    entradaDiretaObraMut.mutate({
                      companyId: queryCompanyId,
                      epiId: parseInt(entradaDiretaForm.epiId),
                      obraId: parseInt(entradaDiretaForm.obraId),
                      quantidade: parseInt(entradaDiretaForm.quantidade),
                      observacao: entradaDiretaForm.observacao || undefined,
                    });
                  }}>
                  {entradaDiretaObraMut.isPending ? 'Registrando...' : 'Confirmar Entrada'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dialog para cadastrar/editar fornecedor */}
      {showFornecedorDialog && <FornecedorDialog
        fornecedorForm={fornecedorForm} setFornecedorForm={setFornecedorForm}
        cnpjLoading={cnpjLoading} setCnpjLoading={setCnpjLoading}
        cnpjResult={cnpjResult} setCnpjResult={setCnpjResult}
        editingFornecedor={editingFornecedor}
        onClose={() => { setShowFornecedorDialog(false); resetFornecedorForm(); setEditingFornecedor(null); setCnpjResult(null); }}
        onSave={(cleanCnpj: string) => {
          if (editingFornecedor) {
            updateFornecedorMut.mutate({ id: editingFornecedor.id, nome: fornecedorForm.nome, cnpj: cleanCnpj || undefined, contato: fornecedorForm.contato || undefined, telefone: fornecedorForm.telefone || undefined, email: fornecedorForm.email || undefined, endereco: fornecedorForm.endereco || undefined, observacoes: fornecedorForm.observacoes || undefined });
          } else {
            createFornecedorMut.mutate({ companyId: queryCompanyId, nome: fornecedorForm.nome, cnpj: cleanCnpj || undefined, contato: fornecedorForm.contato || undefined, telefone: fornecedorForm.telefone || undefined, email: fornecedorForm.email || undefined, endereco: fornecedorForm.endereco || undefined, observacoes: fornecedorForm.observacoes || undefined });
          }
        }}
        isPending={createFornecedorMut.isPending || updateFornecedorMut.isPending}
      />}

      {/* Dialog para listar fornecedores */}
      {showFornecedorList && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-[#1B3A5C]">Fornecedores Cadastrados</h3>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { setEditingFornecedor(null); resetFornecedorForm(); setShowFornecedorDialog(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Novo
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowFornecedorList(false)}>Fechar</Button>
              </div>
            </div>
            {fornecedoresList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum fornecedor cadastrado ainda.</p>
            ) : (
              <div className="space-y-2">
                {fornecedoresList.map((f: any) => (
                  <div key={f.id} className="border rounded-lg p-3 flex justify-between items-start hover:bg-gray-50">
                    <div>
                      <p className="font-medium text-sm">{f.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.cnpj ? f.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "Sem CNPJ"}
                        {f.telefone ? ` | ${f.telefone}` : ""}
                        {f.email ? ` | ${f.email}` : ""}
                      </p>
                      {f.endereco && <p className="text-xs text-muted-foreground">{f.endereco}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => {
                        setEditingFornecedor(f);
                        setFornecedorForm({ nome: f.nome, cnpj: f.cnpj ? f.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "", contato: f.contato || "", telefone: f.telefone || "", email: f.email || "", endereco: f.endereco || "", observacoes: f.observacoes || "" });
                        setShowFornecedorDialog(true);
                      }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => {
                        if (confirm(`Remover fornecedor "${f.nome}"?`)) deleteFornecedorMut.mutate({ id: f.id });
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {/* ============================================================ */}
      {/* NOVAS ABAS - COMPONENTES AVANÇADOS */}
      {/* ============================================================ */}
      {viewMode === "config" && <EpiKitsConfig />}
      {viewMode === "checklist" && <EpiChecklist />}
      {viewMode === "validade" && <EpiValidade />}
      {viewMode === "custos" && <EpiRelatorioCusto />}
      {viewMode === "minimo" && <EpiEstoqueMinimo />}
      {viewMode === "ia" && <EpiIA />}
      {viewMode === "capacidade" && <EpiCapacidade companyId={queryCompanyId} />}
      {viewMode === "descontos" && <EpiDescontos companyId={queryCompanyId} />}

      <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />

      {/* Drill-down full screen ao clicar nos cards */}
      {drillDown && <EpiDrillDown type={drillDown} onClose={() => setDrillDown(null)} />}

          <PrintFooterLGPD />
    </DashboardLayout>
  );
}

// ============================================================
// Inline Edit Component
// ============================================================
function EditEpiInline({ epi, onSave, onCancel, isPending }: { epi: any; onSave: (data: any) => void; onCancel: () => void; isPending: boolean }) {
  const [form, setForm] = useState({
    nome: epi.nome || "",
    ca: epi.ca || "",
    validadeCa: epi.validadeCa || "",
    fabricante: epi.fabricante || "",
    fornecedor: epi.fornecedor || "",
    quantidadeEstoque: epi.quantidadeEstoque ?? 0,
    valorProduto: epi.valorProduto ? parseFloat(String(epi.valorProduto)) : null,
    tempoMinimoTroca: epi.tempoMinimoTroca ?? null,
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="h-8 text-xs" placeholder="Nome" />
        <Input value={form.ca} onChange={e => setForm(f => ({ ...f, ca: e.target.value }))} className="h-8 text-xs" placeholder="CA" />
        <Input type="number" value={form.quantidadeEstoque} onChange={e => setForm(f => ({ ...f, quantidadeEstoque: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" placeholder="Estoque" />
        <Input type="text" inputMode="numeric" value={form.valorProduto !== null ? floatToCurrency(form.valorProduto) : ""} onChange={e => { const formatted = handleCurrencyInput(e.target.value); setForm(f => ({ ...f, valorProduto: formatted ? parseCurrencyToFloat(formatted) : null })); }} className="h-8 text-xs" placeholder="Valor R$" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Input value={form.fabricante} onChange={e => setForm(f => ({ ...f, fabricante: e.target.value }))} className="h-8 text-xs" placeholder="Fabricante" />
        <Input value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} className="h-8 text-xs" placeholder="Fornecedor" />
        <Input type="number" value={form.tempoMinimoTroca ?? ""} onChange={e => setForm(f => ({ ...f, tempoMinimoTroca: e.target.value ? parseInt(e.target.value) : null }))} className="h-8 text-xs" placeholder="Vida útil (dias)" />
        <div className="flex gap-1">
          <Button size="sm" className="h-8 text-xs flex-1" onClick={() => onSave(form)} disabled={isPending}>
            {isPending ? "..." : "Salvar"}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onCancel}>✕</Button>
        </div>
      </div>
    </div>
  );
}
