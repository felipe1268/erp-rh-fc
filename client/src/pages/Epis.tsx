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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { handleCurrencyInput, floatToCurrency, parseCurrencyToFloat } from "@/lib/currency";
import { labelTamanhoEpi, labelTamanhoCalca } from "@/lib/epiTamanho";
import {
  Plus, Minus, Search, Pencil, Trash2, HardHat, Package, AlertTriangle,
  ShieldCheck, Calendar, ArrowRight, ChevronLeft, ChevronDown, ChevronUp, User, ClipboardList,
  DollarSign, Clock, Settings2, Printer, Upload, Eye, FileText, FileDown, Save,
  Glasses, Hand, Footprints, Ear, Shirt, Wind, Shield, Flame, Droplets, Wrench, Zap, HeartPulse, Umbrella, RefreshCw,
  Building2, ArrowLeftRight, Warehouse, TrendingUp, ShoppingCart, Loader2,
  Brain, Sparkles, GraduationCap, Bell, BarChart3, PenTool, Users, Ban,
  ImagePlus, Camera, Link, Lock, X as XIcon
} from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import FornecedorDialog from "@/components/FornecedorDialog";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

// Rev. 2191 — hoisted para uso fora da tabela (ex.: bloco de fotos anexadas no preview da ficha)
const MOTIVO_TROCA_LABEL: Record<string, string> = {
  perda: "Perda",
  mau_uso: "Mau Uso",
  desgaste_normal: "Desgaste",
  furto: "Furto",
};
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
import { generateFichaEpiPdf } from "@/lib/epiReceiptPdf";
import EpiCapacidade from "./EpiCapacidade";
import EpiDescontos from "./EpiDescontos";
import EpiNecessidade from "./EpiNecessidade";

type ViewMode = "catalogo" | "entregas" | "novo_epi" | "editar_epi" | "nova_entrega" | "ficha_epi" | "estoque_obra" | "transferencias" | "config" | "checklist" | "validade" | "custos" | "minimo" | "ia" | "capacidade" | "descontos" | "necessidade";

// Mapeamento de ícones dinâmicos por tipo de EPI
function getEpiIcon(nome: string, className: string = "h-4 w-4") {
  const n = (nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Vestuário/roupa deve ser verificado ANTES de óculos, pois descrições longas podem conter "face" ou "solda"
  if (n.includes("jardineira") || n.includes("macacao") || n.includes("macacão")) return <Shirt className={`${className} text-indigo-600`} />;
  if (n.includes("uniforme") || n.includes("camisa") || n.includes("calca") || n.includes("jaleco") || n.includes("avental") || n.includes("vestimenta") || n.includes("manga")) return <Shirt className={`${className} text-indigo-600`} />;
  if (n.includes("capacete") || n.includes("helmet")) return <HardHat className={`${className} text-amber-600`} />;
  if (n.includes("luva")) return <Hand className={`${className} text-blue-600`} />;
  // "protetor de face" / "protetor facial" são óculos/viseira; evitar match em "ambas as faces" de roupas
  if (n.includes("oculos") || n.includes("viseira") || n.includes("protetor facial") || n.includes("protetor de face")) return <Glasses className={`${className} text-sky-600`} />;
  if (n.includes("bota") || n.includes("botina") || n.includes("calcado") || n.includes("sapato")) return <Footprints className={`${className} text-amber-800`} />;
  if (n.includes("auricular") || n.includes("abafador") || n.includes("ouvido") || n.includes("plug")) return <Ear className={`${className} text-purple-600`} />;
  if (n.includes("respirador") || n.includes("mascara") || n.includes("respiratoria") || n.includes("pff")) return <Wind className={`${className} text-teal-600`} />;
  if (n.includes("cinto") || n.includes("arnes") || n.includes("trava-queda") || n.includes("talabarte")) return <Shield className={`${className} text-red-600`} />;
  if (n.includes("soldador") || n.includes("touca balacla")) return <Flame className={`${className} text-orange-600`} />;
  if (n.includes("creme") || n.includes("protetor solar") || n.includes("filtro solar")) return <Droplets className={`${className} text-cyan-600`} />;
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
  const { hasGroup, groupOcultarValores, isAdminMaster, isAdmin, isSomenteVisualizacao, allowedObraIds, canAccessObra } = usePermissions();
  const hideEpiValues = !isAdminMaster && hasGroup && groupOcultarValores('/epis');
  const readOnly = !isAdminMaster && hasGroup && isSomenteVisualizacao;
  // Rev. 2950 — escrita no Almoxarifado Central só p/ acesso TOTAL (admin/master ou
  // sem restrição de obra); usuários restritos só cadastram/ajustam nas suas obras.
  const canWriteCentral = isAdminMaster || isAdmin || allowedObraIds === null;

  // Suporte a ?tab= para links diretos da sidebar
  const validTabs: ViewMode[] = useMemo(() => ["catalogo", "entregas", "estoque_obra", "transferencias", "config", "checklist", "validade", "custos", "minimo", "ia", "capacidade", "necessidade", "descontos"], []);
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
  const [filterCategoria, setFilterCategoria] = useState<"Todos" | "EPI" | "Uniforme" | "Calcado">("Todos");
  const [filterTamanho, setFilterTamanho] = useState<string>("Todos");
  const [filterEstoque, setFilterEstoque] = useState<"todos" | "zerado" | "critico" | "baixo">("todos");
  const [editingEpi, setEditingEpi] = useState<any>(null);
  const [selectedEpis, setSelectedEpis] = useState<Set<number>>(new Set());
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
  const [fichaDelivery, setFichaDelivery] = useState<any>(null);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [drillDown, setDrillDown] = useState<DrillDownType>(null);
  const [showFichaSignPad, setShowFichaSignPad] = useState(false);
  const [fichaSignature, setFichaSignature] = useState<string | null>(null);
  const [showResponsavelSignPad, setShowResponsavelSignPad] = useState(false);
  const [responsavelSignature, setResponsavelSignature] = useState<string | null>(null);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState<Set<number>>(new Set());
  const [editingDelivery, setEditingDelivery] = useState<any>(null);
  const [editDeliveryForm, setEditDeliveryForm] = useState<any>({});
  // Itens da entrega agrupada em edição (null = edição de item único). Em grupo,
  // só data/motivo/observações são aplicados a TODOS os itens (qtd/EPI intactos).
  const [editGroupItems, setEditGroupItems] = useState<any[] | null>(null);

  // Queries
  // Quando Construtoras selecionado, companyId=0 mas companyIds tem os IDs do pool
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const [episPage, setEpisPage] = useState(0);
  const [deliveriesPage, setDeliveriesPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => { setEpisPage(0); setDeliveriesPage(0); }, [queryCompanyId]);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setEpisPage(0); setDeliveriesPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setEpisPage(0); }, [filterCategoria, filterCondicao, filterTamanho, filterEstoque]);

  // Rev. 2950 — local de estoque ativo no Catálogo ("central" = Almoxarifado Central;
  // senão o id da obra). Declarado ANTES de episQ p/ evitar TDZ.
  const [catalogoObraId, setCatalogoObraId] = useState<string>("central");
  const [estoqueLocalId, setEstoqueLocalId] = useState<string>("central");
  useEffect(() => { setEpisPage(0); }, [catalogoObraId]);

  const episQ = trpc.epis.list.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined, limit: PAGE_SIZE, offset: episPage * PAGE_SIZE, search: debouncedSearch || undefined, categoria: filterCategoria !== "Todos" ? filterCategoria : undefined, condicao: filterCondicao !== "Todos" ? filterCondicao : undefined, tamanho: filterTamanho !== "Todos" ? filterTamanho : undefined, filtroEstoque: filterEstoque !== "todos" ? filterEstoque : undefined, obraId: catalogoObraId !== "central" ? parseInt(catalogoObraId) : undefined }, { enabled: hasValidCompany });
  const episAllQ = trpc.epis.list.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined, limit: 2000, offset: 0 }, { enabled: hasValidCompany && (viewMode === "nova_entrega" || viewMode === "ficha_epi" || viewMode === "estoque_obra" || viewMode === "transferencias") });
  const deliveriesQ = trpc.epis.listDeliveries.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined, search: debouncedSearch || undefined, limit: PAGE_SIZE, offset: deliveriesPage * PAGE_SIZE }, { enabled: hasValidCompany && (viewMode === "entregas" || viewMode === "nova_entrega" || viewMode === "ficha_epi") });
  const statsQ = trpc.epis.stats.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany });
  const employeesQ = trpc.employees.list.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined, excludeTerminated: true }, { enabled: hasValidCompany && (viewMode === "nova_entrega" || viewMode === "ficha_epi") });
  const bdiQ = trpc.epis.getBdi.useQuery({ companyId: queryCompanyId }, { enabled: hasValidCompany && (viewMode === "nova_entrega" || viewMode === "ficha_epi" || viewMode === "config") });
  const formTextQ = trpc.epis.getFormText.useQuery({ companyId: queryCompanyId }, { enabled: hasValidCompany && (viewMode === "ficha_epi" || viewMode === "config") });
  const fornecedoresQ = trpc.epis.fornecedoresList.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany && (viewMode === "novo_epi" || viewMode === "editar_epi" || viewMode === "config") });
  const obrasQ = trpc.obras.listActive.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany });
  const obrasList = obrasQ.data ?? [];
  // Rev. 2950 — obras nas quais o usuário pode ESCREVER (cadastrar/ajustar/transferir).
  // Admin/full-access (canAccessObra sempre true) vê todas; restrito vê só as suas.
  const obrasPermitidas = useMemo(() => (
    (isAdminMaster || isAdmin || allowedObraIds === null)
      ? (obrasList as any[])
      : (obrasList as any[]).filter((o: any) => canAccessObra(o.id))
  ), [obrasList, allowedObraIds, isAdminMaster, isAdmin]);

  const capacidadeQ = trpc.epiAvancado.capacidadeContratacao.useQuery(
    { companyId: queryCompanyId },
    { enabled: hasValidCompany && viewMode === "capacidade" }
  );

  const estoqueObraQ = trpc.epis.estoqueObraList.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany && (viewMode === "estoque_obra" || viewMode === "nova_entrega" || viewMode === "transferencias") });
  const estoqueObraResumoQ = trpc.epis.estoqueObraResumo.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany && viewMode === "estoque_obra" });
  const transferenciasQ = trpc.epis.listarTransferencias.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany && viewMode === "transferencias" });
  const estoqueCentralQ = trpc.epis.estoqueCentralResumo.useQuery({ companyId: queryCompanyId, companyIds: isConstrutoras ? companyIds : undefined }, { enabled: hasValidCompany && viewMode === "estoque_obra" });
  const estoqueCentral = estoqueCentralQ.data ?? { totalItens: 0, totalUnidades: 0, valorTotal: 0 };
  const estoqueObraList2 = estoqueObraQ.data ?? [];
  const estoqueResumo = estoqueObraResumoQ.data ?? [];
  const transferenciasList = transferenciasQ.data ?? [];

  const episList = episQ.data?.items ?? [];
  const episTotal = episQ.data?.total ?? 0;
  const episAllList = episAllQ.data?.items ?? episList;

  // Rev. 2963 — mapa de estoque por (epiId|obraId) p/ exibir disponibilidade real
  // da ORIGEM na tela de Transferência (evita escolher uma obra sem estoque).
  const estoqueObraTransferMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of (estoqueObraList2 as any[])) m.set(`${r.epiId}|${r.obraId}`, Number(r.quantidade || 0));
    return m;
  }, [estoqueObraList2]);

  // Rev. 2773 — declarado aqui (antes dos memos abaixo) pra evitar TDZ.
  const [filterObraEstoque, setFilterObraEstoque] = useState<string>("todas");

  // Rev. 2773 — Itens do Estoque Central derivados do catálogo (epis c/ quantidadeEstoque > 0),
  // normalizados no MESMO formato das linhas de obra pra alimentar a tabela detalhada.
  const centralItensList = useMemo(() => (episAllList as any[])
    .filter((e: any) => Number(e.quantidadeEstoque || 0) > 0)
    .map((e: any) => ({
      id: `central-${e.id}`,
      obraId: "central",
      nomeObra: "Almoxarifado Central",
      epiId: e.id,
      nomeEpi: e.nome,
      caEpi: e.ca,
      categoriaEpi: e.categoria,
      tamanhoEpi: e.tamanho, // Rev. 2776 — mostrar numeração/tamanho na tela
      quantidade: Number(e.quantidadeEstoque || 0),
      valorProdutoEpi: e.valorProduto,
    })), [episAllList]);

  // Rev. 2773 — Lista que alimenta a tabela detalhada conforme o card/obra selecionado:
  // "central" → itens do central; obraId → itens daquela obra; "todas" → todos os de obra.
  const tabelaEstoqueList = useMemo(() => {
    if (filterObraEstoque === "central") return centralItensList;
    return (estoqueObraList2 as any[]).filter((e: any) => filterObraEstoque === "todas" || String(e.obraId) === filterObraEstoque);
  }, [filterObraEstoque, estoqueObraList2, centralItensList]);
  const deliveriesList = deliveriesQ.data?.items ?? [];
  const deliveriesTotal = deliveriesQ.data?.total ?? 0;
  const stats = statsQ.data;
  const employeesList = useMemo(() => (employeesQ.data ?? []).filter((e: any) => e.status !== 'Afastado').sort((a: any, b: any) => a.nomeCompleto.localeCompare(b.nomeCompleto)), [employeesQ.data]);
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

  // Form state - Entrega (multi-EPI)
  const [entregaForm, setEntregaForm] = useState({
    epiId: "", employeeId: "", quantidade: 1, dataEntrega: new Date().toISOString().split("T")[0],
    motivo: "", observacoes: "", motivoTroca: "", obraId: "",
    origemEntrega: "central" as "central" | "obra",
    origemObraId: "",
    fotoEntregaUrl: "",
  });
  const [entregaItens, setEntregaItens] = useState<Array<{ epiId: string; quantidade: number; motivoTroca: string }>>([]);
  const [entregaSaving, setEntregaSaving] = useState(false);

  // Rev. 2927 — estoque da OBRA de origem (mapa epiId→qtd) p/ o picker de entrega mostrar
  // o estoque CERTO quando a origem é "obra" (antes mostrava sempre o central → "qtd não bate").
  const estoqueObraMap = useMemo(() => {
    const m: Record<string, number> = {};
    if (entregaForm.origemEntrega === "obra" && entregaForm.origemObraId) {
      for (const r of (estoqueObraList2 as any[])) {
        if (String(r.obraId) === entregaForm.origemObraId) m[String(r.epiId)] = Number(r.quantidade || 0);
      }
    }
    return m;
  }, [estoqueObraList2, entregaForm.origemEntrega, entregaForm.origemObraId]);

  // Transferência form state (multi-EPI)
  const [transForm, setTransForm] = useState({
    epiId: "", quantidade: 1, tipoOrigem: (canWriteCentral ? "central" : "obra") as "central" | "obra",
    origemObraId: "", tipoDestino: "obra" as "central" | "obra", destinoObraId: "", data: new Date().toISOString().split("T")[0], observacoes: "",
  });
  const [transItens, setTransItens] = useState<Array<{ epiId: string; quantidade: number }>>([]);
  const [transSaving, setTransSaving] = useState(false);
  // Rev. 2186 — filtro de assinatura na lista de Entregas de EPI
  const [filterAssinatura, setFilterAssinatura] = useState<"todas" | "assinadas" | "nao_assinadas">("todas");
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [epiPickerOpen, setEpiPickerOpen] = useState(false);
  const [epiPickerSearch, setEpiPickerSearch] = useState("");
  const [showObraConfirm, setShowObraConfirm] = useState(false);
  const [showEntradaDiretaDialog, setShowEntradaDiretaDialog] = useState(false);
  const [entradaDiretaForm, setEntradaDiretaForm] = useState({ epiId: "", obraId: "", quantidade: "", observacao: "" });
  const [ajusteObraRow, setAjusteObraRow] = useState<any>(null);
  const [ajusteObraQtd, setAjusteObraQtd] = useState<string>("");
  // Rev. 2998 — "Estoque por Obra": o painel de cards de locais ocupava muito
  // espaço vertical. Por padrão recolhido (mostra só os 1ºs locais); botão expande
  // p/ ver todos. O filtro segue disponível no dropdown do topo.
  const [estoqueCardsOpen, setEstoqueCardsOpen] = useState<boolean>(false);

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
    onError: (err) => toast.error(err.message),
  });
  const deleteDeliveryMut = trpc.epis.deleteDelivery.useMutation({
    onSuccess: () => { deliveriesQ.refetch(); episQ.refetch(); statsQ.refetch(); toast.success("Entrega removida!"); setSelectedDeliveryIds(new Set()); },
    onError: (err) => toast.error(err.message),
  });
  const updateDeliveryMut = trpc.epis.updateDelivery.useMutation({
    onSuccess: () => { deliveriesQ.refetch(); episQ.refetch(); statsQ.refetch(); toast.success("Entrega atualizada!"); setEditingDelivery(null); },
    onError: (err: any) => toast.error(err.message),
  });
  const deleteBatchMut = trpc.epis.deleteBatch.useMutation({
    onSuccess: (data: any) => { episQ.refetch(); statsQ.refetch(); setSelectedEpis(new Set()); setShowBatchDeleteDialog(false); toast.success(`${data.deleted} EPI(s) removido(s)!`); },
    onError: (err: any) => toast.error(err.message),
  });
  const gerarSCMut = trpc.epis.gerarSCEstoqueMinimo.useMutation({
    onSuccess: (data: any) => {
      if (data.ok) { toast.success(data.mensagem); } else { toast.error(data.mensagem); }
    },
    onError: (err) => toast.error("Erro ao gerar SC: " + err.message),
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
    onSuccess: () => { estoqueObraQ.refetch(); estoqueObraResumoQ.refetch(); estoqueCentralQ.refetch(); episAllQ.refetch(); transferenciasQ.refetch(); episQ.refetch(); statsQ.refetch(); setShowTransferDialog(false); resetTransForm(); toast.success("Transferência realizada com sucesso!"); },
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
  const ajustarEstoqueObraMut = trpc.epis.ajustarEstoqueObra.useMutation({
    onSuccess: () => {
      estoqueObraQ.refetch(); estoqueObraResumoQ.refetch(); statsQ.refetch();
      setAjusteObraRow(null); setAjusteObraQtd("");
      toast.success("Estoque da obra ajustado!");
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
    setEntregaForm({ epiId: "", employeeId: "", quantidade: 1, dataEntrega: new Date().toISOString().split("T")[0], motivo: "", observacoes: "", motivoTroca: "", obraId: "", origemEntrega: "central", origemObraId: "", fotoEntregaUrl: "" });
    setEntregaItens([]);
    setFotoEstado({ file: null, preview: "" });
  }
  function resetTransForm() {
    setTransForm({ epiId: "", quantidade: 1, tipoOrigem: canWriteCentral ? "central" : "obra", origemObraId: "", tipoDestino: "obra", destinoObraId: "", data: new Date().toISOString().split("T")[0], observacoes: "" });
    setTransItens([]);
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
          nome: f.nome || res.descricao || res.nome,
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
    return episList;
  }, [episList]);

  // Tamanhos disponíveis baseados na categoria selecionada
  const tamanhosFiltro = useMemo(() => {
    const TAMANHOS_ROUPA_LIST = ['Único', 'PP', 'P', 'M', 'G', 'GG', 'XGG', 'XXGG', 'XXXGG'];
    const TAMANHOS_CALCADO_LIST = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'];
    if (filterCategoria === "Uniforme") return TAMANHOS_ROUPA_LIST;
    if (filterCategoria === "Calcado") return TAMANHOS_CALCADO_LIST;
    // Para "Todos" ou "EPI", mostrar tamanhos que existem nos dados
    const tamanhos = new Set(episList.map((e: any) => e.tamanho).filter(Boolean));
    return Array.from(tamanhos).sort() as string[];
  }, [filterCategoria, episList]);

  const filteredDeliveries = useMemo(() => {
    let arr = deliveriesList as any[];
    // Rev. 2186 — filtro por status de assinatura (fonte de verdade: assinaturaUrl do funcionário)
    if (filterAssinatura === "assinadas") {
      arr = arr.filter((d: any) => !!d.assinaturaUrl);
    } else if (filterAssinatura === "nao_assinadas") {
      arr = arr.filter((d: any) => !d.assinaturaUrl);
    }
    // Rev. 2911 — a busca por texto agora é SERVER-SIDE (varre todas as páginas).
    // Não re-filtramos por `search` aqui pra não esconder resultados do servidor.
    return arr;
  }, [deliveriesList, filterAssinatura]);

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
                            // Comprime a imagem antes de enviar (max 500px, JPEG 0.75)
                            // Isso garante que a foto cabe no banco e persiste entre redeploys
                            const MAX_PX = 500;
                            const QUALITY = 0.75;
                            const img = new Image();
                            const objectUrl = URL.createObjectURL(file);
                            img.onload = () => {
                              let { width, height } = img;
                              if (width > MAX_PX || height > MAX_PX) {
                                if (width > height) { height = Math.round(height * MAX_PX / width); width = MAX_PX; }
                                else { width = Math.round(width * MAX_PX / height); height = MAX_PX; }
                              }
                              const canvas = document.createElement('canvas');
                              canvas.width = width; canvas.height = height;
                              const ctx = canvas.getContext('2d')!;
                              ctx.drawImage(img, 0, 0, width, height);
                              const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
                              URL.revokeObjectURL(objectUrl);
                              const base64 = dataUrl.split(',')[1];
                              uploadFotoEpiMut.mutate({ id: editingEpi.id, fileBase64: base64, mimeType: 'image/jpeg' });
                            };
                            img.src = objectUrl;
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
                  <Label>Estoque (Almoxarifado Central)</Label>
                  <Input type="number" min={0} value={epiForm.quantidadeEstoque} disabled={!canWriteCentral}
                    onChange={e => setEpiForm(f => ({ ...f, quantidadeEstoque: parseInt(e.target.value) || 0 }))} />
                  {!canWriteCentral && (
                    <p className="text-[11px] text-muted-foreground mt-1">Apenas administradores podem alterar o estoque do Almoxarifado Central. Para ajustar o estoque de uma obra específica, use a aba "Estoque por Obra" e clique no lápis da linha correspondente.</p>
                  )}
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
                    Vida Útil (dias) <span className="text-red-500">*</span>
                    {aiSuggestionLoading && <span className="text-xs text-blue-500 animate-pulse ml-1">🧠 IA analisando...</span>}
                  </Label>
                  <Input type="number" min={1} value={epiForm.tempoMinimoTroca}
                    onChange={e => { setEpiForm(f => ({ ...f, tempoMinimoTroca: e.target.value })); if (aiSuggestion) setAiSuggestion(null); }}
                    placeholder="Ex: 180" className={!epiForm.tempoMinimoTroca ? "border-red-300" : ""} />
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
                  if (!epiForm.tempoMinimoTroca || parseInt(epiForm.tempoMinimoTroca) <= 0) return toast.error("Vida Útil (dias) é obrigatório para análise de durabilidade");
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
                    Vida Útil (dias) <span className="text-red-500">*</span>
                    {aiSuggestionLoading && <span className="text-xs text-blue-500 animate-pulse ml-1">🧠 IA analisando...</span>}
                  </Label>
                  <Input type="number" min={1} value={epiForm.tempoMinimoTroca}
                    onChange={e => { setEpiForm(f => ({ ...f, tempoMinimoTroca: e.target.value })); if (aiSuggestion) setAiSuggestion(null); }}
                    placeholder="Ex: 180" className={!epiForm.tempoMinimoTroca ? "border-red-300" : ""} />
                  {aiSuggestion && (
                    <div className="mt-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                      <span className="font-semibold">🧠 Sugestão IA:</span> {aiSuggestion.vidaUtilDias} dias
                      <span className="text-blue-500 ml-1">({aiSuggestion.confianca === 'alta' ? 'Alta confiança' : aiSuggestion.confianca === 'media' ? 'Média confiança' : 'Baixa confiança'})</span>
                      <p className="text-[10px] text-blue-500 mt-0.5">{aiSuggestion.justificativa}</p>
                    </div>
                  )}
                </div>
              </div>
              {/* Rev. 2950 — Local do estoque: define ONDE a quantidade inicial entra.
                  Central só p/ acesso total; restrito escolhe entre suas obras. */}
              <div>
                <Label className="flex items-center gap-1">
                  <Warehouse className="h-3.5 w-3.5 text-[#1B2A4A]" /> Local do estoque
                </Label>
                <Select value={estoqueLocalId} onValueChange={setEstoqueLocalId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o local..." /></SelectTrigger>
                  <SelectContent>
                    {canWriteCentral && <SelectItem value="central">🏢 Almoxarifado Central</SelectItem>}
                    {obrasPermitidas.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>🏗️ {o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  A quantidade informada acima entra no local selecionado.
                  {!canWriteCentral && " Você só pode cadastrar nas obras que gerencia."}
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => { setViewMode("catalogo"); resetEpiForm(); }}>Cancelar</Button>
                <Button onClick={() => {
                  if (!epiForm.nome.trim()) return toast.error("Nome do EPI é obrigatório");
                  if (!epiForm.tempoMinimoTroca || parseInt(epiForm.tempoMinimoTroca) <= 0) return toast.error("Vida Útil (dias) é obrigatório para análise de durabilidade");
                  if (estoqueLocalId === "central" && !canWriteCentral) return toast.error("Você não tem permissão para cadastrar no Almoxarifado Central. Selecione uma obra.");
                  if (estoqueLocalId !== "central" && !canAccessObra(parseInt(estoqueLocalId))) return toast.error("Você não tem permissão para cadastrar nesta obra.");
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
                    obraLocalId: estoqueLocalId !== "central" ? parseInt(estoqueLocalId) : undefined,
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
    const bdiPct = bdiQ.data?.bdiPercentual ?? 40;

    const addEntregaItem = () => {
      if (!entregaForm.epiId) return toast.error("Selecione o EPI primeiro");
      if (entregaItens.some(i => i.epiId === entregaForm.epiId)) return toast.error("Este EPI já foi adicionado à lista");
      setEntregaItens(prev => [...prev, { epiId: entregaForm.epiId, quantidade: entregaForm.quantidade, motivoTroca: entregaForm.motivoTroca }]);
      setEntregaForm(f => ({ ...f, epiId: "", quantidade: 1, motivoTroca: "" }));
    };

    const removeEntregaItem = (epiId: string) => {
      setEntregaItens(prev => prev.filter(i => i.epiId !== epiId));
    };

    const updateEntregaItemQtd = (epiId: string, qtd: number) => {
      setEntregaItens(prev => prev.map(i => i.epiId === epiId ? { ...i, quantidade: Math.max(1, qtd) } : i));
    };

    const handleSubmitEntrega = async () => {
      const allItens = entregaForm.epiId
        ? [...entregaItens, { epiId: entregaForm.epiId, quantidade: entregaForm.quantidade, motivoTroca: entregaForm.motivoTroca }]
        : entregaItens;
      if (allItens.length === 0) return toast.error("Adicione pelo menos um EPI");
      if (!entregaForm.employeeId) return toast.error("Selecione o funcionário");
      if (entregaForm.origemEntrega === 'obra' && !entregaForm.origemObraId) return toast.error("Selecione a obra de origem do estoque");

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

      const grupoEntregaId = allItens.length > 1 ? crypto.randomUUID() : undefined;

      setEntregaSaving(true);
      let successCount = 0;
      let lastError = "";
      const createdResults: any[] = [];
      for (const item of allItens) {
        try {
          const result = await createDeliveryMut.mutateAsync({
            companyId: queryCompanyId,
            epiId: parseInt(item.epiId),
            employeeId: parseInt(entregaForm.employeeId),
            quantidade: item.quantidade,
            dataEntrega: entregaForm.dataEntrega,
            motivo: entregaForm.motivo || undefined,
            observacoes: entregaForm.observacoes || undefined,
            motivoTroca: item.motivoTroca || undefined,
            fotoEstadoBase64: fotoBase64,
            fotoEstadoFileName: fotoFileName,
            origemEntrega: entregaForm.origemEntrega,
            obraId: entregaForm.origemEntrega === 'obra'
              ? parseInt(entregaForm.origemObraId)
              : (entregaForm.obraId ? parseInt(entregaForm.obraId) : undefined),
            grupoEntregaId,
          });
          createdResults.push({ ...result, item });
          successCount++;
        } catch (err: any) {
          lastError = err?.message || "Erro desconhecido";
        }
      }
      setEntregaSaving(false);
      deliveriesQ.refetch(); episQ.refetch(); statsQ.refetch();
      if (successCount > 0) {
        toast.success(`${successCount} EPI(s) entregue(s) com sucesso!`);
        setFichaSignature(null);
        setResponsavelSignature(null);
        const emp = employeesList.find((e: any) => String(e.id) === entregaForm.employeeId);
        const obraSel = obrasList.find((o: any) => String(o.id) === entregaForm.obraId);
        if (allItens.length === 1) {
          const r = createdResults[0];
          const epi = episAllList.find((e: any) => e.id === parseInt(allItens[0].epiId));
          setFichaDelivery({
            id: r?.id,
            epiId: parseInt(allItens[0].epiId),
            employeeId: parseInt(entregaForm.employeeId),
            quantidade: allItens[0].quantidade,
            dataEntrega: entregaForm.dataEntrega,
            motivo: entregaForm.motivo,
            motivoTroca: allItens[0].motivoTroca,
            valorCobrado: r?.valorCobrado,
            nomeEpi: epi?.nome || "",
            caEpi: epi?.ca || "",
            nomeFunc: emp?.nomeCompleto || "",
            funcaoFunc: emp?.funcao || "",
            obraNome: obraSel?.nome || emp?.obraAtualNome || "",
          });
        } else {
          const first = createdResults[0];
          const firstEpi = episAllList.find((e: any) => e.id === parseInt(allItens[0].epiId));
          const grupoItems = createdResults.map((r, i) => {
            const epi = episAllList.find((e: any) => e.id === parseInt(allItens[i].epiId));
            return {
              id: r?.id,
              epiId: parseInt(allItens[i].epiId),
              quantidade: allItens[i].quantidade,
              motivoTroca: allItens[i].motivoTroca,
              motivo: entregaForm.motivo,
              nomeEpi: epi?.nome || "",
              caEpi: epi?.ca || "",
              valorCobrado: r?.valorCobrado,
            };
          });
          setFichaDelivery({
            id: first?.id,
            epiId: parseInt(allItens[0].epiId),
            employeeId: parseInt(entregaForm.employeeId),
            quantidade: allItens[0].quantidade,
            dataEntrega: entregaForm.dataEntrega,
            motivo: entregaForm.motivo,
            motivoTroca: allItens[0].motivoTroca,
            valorCobrado: first?.valorCobrado,
            nomeEpi: firstEpi?.nome || "",
            caEpi: firstEpi?.ca || "",
            nomeFunc: emp?.nomeCompleto || "",
            funcaoFunc: emp?.funcao || "",
            obraNome: obraSel?.nome || emp?.obraAtualNome || "",
            _grupoItems: grupoItems,
          });
        }
        setViewMode("ficha_epi");
        resetEntregaForm();
        setEntregaItens([]);
        setFotoEstado({ file: null, preview: "" });
      }
      if (successCount < allItens.length) {
        toast.error(`${successCount}/${allItens.length} entregas realizadas. Erro: ${lastError}`);
      }
    };

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
                    setEntregaForm(f => ({ ...f, employeeId: v, obraId }));
                  }}
                  placeholder="Selecione o funcionário..."
                  searchPlaceholder="Buscar por nome, CPF, matrícula, função..."
                  emptyMessage="Nenhum funcionário encontrado."
                />
                {entregaForm.employeeId && (() => {
                  const empSel = employeesList.find((e: any) => String(e.id) === entregaForm.employeeId);
                  if (!empSel) return null;
                  return (
                    <div className="mt-2 flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                      {empSel.fotoUrl ? (
                        <img src={empSel.fotoUrl} alt={empSel.nomeCompleto} className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-sm flex-shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 border-2 border-white shadow-sm">
                          <span className="text-xl font-bold text-gray-400">{empSel.nomeCompleto?.charAt(0)?.toUpperCase() || "?"}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate">{empSel.nomeCompleto}</p>
                        <p className="text-xs text-gray-500 truncate">{empSel.funcao || empSel.cargo || "Sem função"}</p>
                        {empSel.obraAtualNome && <p className="text-xs text-blue-600 mt-0.5 truncate">📍 {empSel.obraAtualNome}</p>}
                        {(() => {
                          const tCamisa = empSel.tamanhoCamisa ? String(empSel.tamanhoCamisa).trim() : "";
                          const tCalca = empSel.tamanhoCalca ? String(empSel.tamanhoCalca).trim() : "";
                          const tCalcado = empSel.tamanhoCalcado ? String(empSel.tamanhoCalcado).trim() : "";
                          const temAlgum = tCamisa || tCalca || tCalcado;
                          const chip = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[11px] font-medium text-gray-600";
                          return (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {tCamisa && <span className={chip}>Camisa: <strong className="text-[#1B2A4A]">{tCamisa}</strong></span>}
                              {tCalca && <span className={chip}>Calça: <strong className="text-[#1B2A4A]">{labelTamanhoCalca(tCalca)}</strong></span>}
                              {tCalcado && <span className={chip}>Calçado: <strong className="text-[#1B2A4A]">{tCalcado}</strong></span>}
                              {!temAlgum && <span className="text-[11px] text-amber-600 font-medium">Tamanhos não cadastrados — preencha no cadastro do funcionário</span>}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <Label className="text-amber-800 font-semibold flex items-center gap-1.5"><Package className="h-4 w-4" /> Origem da Entrega *</Label>
                <div className="flex gap-3 mt-2">
                  <button type="button" onClick={() => setEntregaForm(f => ({ ...f, origemEntrega: 'central', origemObraId: '' }))}
                    className={`flex-1 p-3 rounded-lg border-2 text-center transition-all ${entregaForm.origemEntrega === 'central' ? 'border-[#1B2A4A] bg-[#1B2A4A]/5 shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}>
                    <Package className={`h-5 w-5 mx-auto mb-1 ${entregaForm.origemEntrega === 'central' ? 'text-[#1B2A4A]' : 'text-gray-400'}`} />
                    <p className={`text-sm font-semibold ${entregaForm.origemEntrega === 'central' ? 'text-[#1B2A4A]' : 'text-gray-500'}`}>Almoxarifado Central</p>
                    <p className="text-[10px] text-muted-foreground">Estoque central</p>
                  </button>
                  <button type="button" onClick={() => setEntregaForm(f => ({ ...f, origemEntrega: 'obra', origemObraId: '' }))}
                    className={`flex-1 p-3 rounded-lg border-2 text-center transition-all ${entregaForm.origemEntrega === 'obra' ? 'border-[#1B2A4A] bg-[#1B2A4A]/5 shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}>
                    <HardHat className={`h-5 w-5 mx-auto mb-1 ${entregaForm.origemEntrega === 'obra' ? 'text-[#1B2A4A]' : 'text-gray-400'}`} />
                    <p className={`text-sm font-semibold ${entregaForm.origemEntrega === 'obra' ? 'text-[#1B2A4A]' : 'text-gray-500'}`}>Obra</p>
                    <p className="text-[10px] text-muted-foreground">Estoque do canteiro</p>
                  </button>
                </div>
                {entregaForm.origemEntrega === 'obra' && (
                  <div className="mt-3">
                    <Label className="text-amber-800 text-xs font-semibold">Obra de Origem *</Label>
                    <Select value={entregaForm.origemObraId || undefined} onValueChange={v => setEntregaForm(f => ({ ...f, origemObraId: v }))}>
                      <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
                      <SelectContent>
                        {obrasList.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {entregaForm.employeeId && entregaForm.origemEntrega === 'central' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <Label className="text-blue-800 font-semibold">Local de Trabalho do Funcionário</Label>
                  <Select value={entregaForm.obraId || "sem_obra"} onValueChange={v => setEntregaForm(f => ({ ...f, obraId: v === "sem_obra" ? "" : v }))}>
                    <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sem_obra">Sem obra definida</SelectItem>
                      {obrasList.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Data da Entrega *</Label>
                  <Input type="date" value={entregaForm.dataEntrega} onChange={e => setEntregaForm(f => ({ ...f, dataEntrega: e.target.value }))} />
                </div>
                <div>
                  <Label>Motivo / Observações</Label>
                  <Input value={entregaForm.motivo} onChange={e => setEntregaForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Observações gerais" />
                </div>
              </div>

              <div>
                <Label className="flex items-center gap-2">
                  <Camera className="h-4 w-4" /> Foto do Registro de Entrega
                </Label>
                {fotoEstado.preview ? (
                  <div className="flex items-center gap-3 mt-1">
                    <img src={fotoEstado.preview} alt="Foto" className="h-20 w-20 object-cover rounded border" />
                    <Button type="button" variant="outline" size="sm" onClick={() => setFotoEstado({ file: null, preview: "" })}>
                      <Trash2 className="h-3 w-3 mr-1" /> Remover
                    </Button>
                  </div>
                ) : (
                  <Input type="file" accept="image/*" capture="environment" className="mt-1" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setFotoEstado({ file, preview: URL.createObjectURL(file) });
                    }
                  }} />
                )}
                <p className="text-[10px] text-muted-foreground mt-1">Tire uma foto do EPI sendo entregue para comprovação</p>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Plus className="h-4 w-4" /> Adicionar EPI</p>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_160px_auto] gap-2 items-end">
                  <div>
                    <Label className="text-xs">EPI</Label>
                    <SearchableSelect
                      options={episAllList.filter((e: any) => !entregaItens.some(i => i.epiId === String(e.id))).map((e: any) => {
                        const estoqueDisp = entregaForm.origemEntrega === "obra" ? (estoqueObraMap[String(e.id)] ?? 0) : (e.quantidadeEstoque ?? 0);
                        return {
                          value: String(e.id),
                          label: `${e.nome}${e.tamanho ? ` (${labelTamanhoEpi(e)})` : ""} ${e.ca ? `CA: ${e.ca}` : ""}`,
                          subtitle: `${entregaForm.origemEntrega === "obra" ? "Estoque na obra" : "Estoque central"}: ${estoqueDisp}`,
                          searchExtra: `${e.ca || ""} ${e.nome || ""} ${e.tamanho || ""}`,
                          imageUrl: e.fotoUrl || undefined,
                        };
                      })}
                      value={entregaForm.epiId || undefined}
                      onValueChange={v => setEntregaForm(f => ({ ...f, epiId: v }))}
                      placeholder="Selecione..."
                      searchPlaceholder="Buscar EPI..."
                      emptyMessage="Nenhum EPI encontrado."
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Qtd</Label>
                    <Input type="number" min={1} value={entregaForm.quantidade} onChange={e => setEntregaForm(f => ({ ...f, quantidade: parseInt(e.target.value) || 1 }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Motivo Troca</Label>
                    <Select value={entregaForm.motivoTroca || "nova_entrega"} onValueChange={v => setEntregaForm(f => ({ ...f, motivoTroca: v === "nova_entrega" ? "" : v }))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nova_entrega">Sem troca</SelectItem>
                        <SelectItem value="desgaste_normal">Desgaste</SelectItem>
                        <SelectItem value="perda">Perda</SelectItem>
                        <SelectItem value="mau_uso">Mau Uso</SelectItem>
                        <SelectItem value="furto">Furto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" size="sm" onClick={addEntregaItem} disabled={!entregaForm.epiId} className="bg-green-600 hover:bg-green-700 h-9">
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
              </div>

              {entregaItens.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-[#1B2A4A] text-white px-4 py-2 text-sm font-semibold flex items-center gap-2">
                    <Package className="h-4 w-4" /> EPIs para Entrega ({entregaItens.length})
                  </div>
                  <div className="divide-y">
                    {entregaItens.map((item) => {
                      const epi = episAllList.find((e: any) => String(e.id) === item.epiId);
                      if (!epi) return null;
                      const isCharge = item.motivoTroca && ['perda', 'mau_uso', 'furto'].includes(item.motivoTroca);
                      return (
                        <div key={item.epiId} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                          {epi.fotoUrl ? (
                            <img src={epi.fotoUrl} alt={epi.nome} className="w-10 h-10 rounded object-cover border flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center border flex-shrink-0"><HardHat className="h-4 w-4 text-gray-400" /></div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{epi.nome}{epi.tamanho ? ` (${labelTamanhoEpi(epi)})` : ""}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              {epi.ca && <span>CA: {epi.ca}</span>}
                              {isCharge && <span className="text-red-600 font-medium">Desconto</span>}
                              {item.motivoTroca && !isCharge && <span className="text-gray-400">{item.motivoTroca === 'desgaste_normal' ? 'Desgaste' : 'Sem troca'}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => updateEntregaItemQtd(item.epiId, item.quantidade - 1)} className="w-7 h-7 rounded border flex items-center justify-center hover:bg-gray-100"><Minus className="h-3 w-3" /></button>
                            <Input type="number" min={1} value={item.quantidade} onChange={e => updateEntregaItemQtd(item.epiId, parseInt(e.target.value) || 1)} className="w-14 h-7 text-center text-sm px-1" />
                            <button type="button" onClick={() => updateEntregaItemQtd(item.epiId, item.quantidade + 1)} className="w-7 h-7 rounded border flex items-center justify-center hover:bg-gray-100"><Plus className="h-3 w-3" /></button>
                          </div>
                          <button type="button" onClick={() => removeEntregaItem(item.epiId)} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => { setViewMode("entregas"); resetEntregaForm(); }}>Cancelar</Button>
                <Button onClick={handleSubmitEntrega} disabled={entregaSaving || (entregaItens.length === 0 && !entregaForm.epiId)} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  {entregaSaving ? "Salvando..." : `Registrar ${entregaItens.length > 0 ? entregaItens.length + (entregaForm.epiId ? 1 : 0) : 1} Entrega(s)`}
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
    const epi = episAllList.find((e: any) => e.id === fichaDelivery.epiId);
    const textoFicha = formTextQ.data?.texto || '';

    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div className="flex items-center gap-3 print:hidden">
            <Button variant="ghost" size="sm" onClick={() => { setViewMode("entregas"); setFichaDelivery(null); }}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h1 className="text-xl font-bold">Ficha de Entrega de EPI</h1>
            <div className="ml-auto flex gap-2 flex-wrap justify-end">
              <Button
                size="sm"
                className="bg-[#1B2A4A] hover:bg-[#243660] text-white"
                disabled={isSavingPdf || uploadFichaMut.isPending}
                onClick={async () => {
                  setIsSavingPdf(true);
                  try {
                    const bdiPct = bdiQ.data?.bdiPercentual ?? 40;
                    const valorUnit = epi?.valorProduto
                      ? (parseFloat(String(epi.valorProduto)) * (1 + bdiPct / 100))
                          .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : undefined;
                    const vidaUtil = epi?.tempoMinimoTroca
                      ? `${epi.tempoMinimoTroca} dias`
                      : undefined;
                    const grupoItems = fichaDelivery._grupoItems as any[] | undefined;
                    const itensGrupo = grupoItems ? grupoItems.map((item: any) => {
                      const itemEpi = episAllList.find((e: any) => e.id === item.epiId);
                      const itemValor = itemEpi?.valorProduto
                        ? (parseFloat(String(itemEpi.valorProduto)) * (1 + (bdiQ.data?.bdiPercentual ?? 40) / 100))
                            .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : undefined;
                      return {
                        nomeEpi: item.nomeEpi || itemEpi?.nome || "",
                        caEpi: item.caEpi || itemEpi?.ca,
                        quantidade: item.quantidade,
                        vidaUtil: itemEpi?.tempoMinimoTroca ? `${itemEpi.tempoMinimoTroca} dias` : undefined,
                        valorUnit: itemValor,
                        motivo: item.motivo || "Entrega regular",
                      };
                    }) : undefined;
                    const base64 = await generateFichaEpiPdf({
                      nomeFunc: fichaDelivery.nomeFunc || emp?.nomeCompleto || "",
                      funcaoFunc: fichaDelivery.funcaoFunc || emp?.funcao,
                      cpfFunc: emp?.cpf,
                      matriculaFunc: emp?.codigoInterno,
                      obraNome: fichaDelivery.obraNome || emp?.obraAtualNome,
                      nomeEpi: fichaDelivery.nomeEpi || epi?.nome || "",
                      caEpi: fichaDelivery.caEpi || epi?.ca,
                      quantidade: fichaDelivery.quantidade,
                      vidaUtil,
                      valorUnit,
                      motivo: fichaDelivery.motivo || "Entrega regular",
                      dataEntrega: fichaDelivery.dataEntrega,
                      emitidoPor: user?.name || user?.email,
                      empresaNome: selectedCompany?.razaoSocial,
                      empresaCnpj: selectedCompany?.cnpj,
                      textoDeclaracao: formTextQ.data?.texto,
                      assinaturaFuncUrl: fichaDelivery.assinaturaUrl || fichaSignature,
                      assinaturaResponsavelUrl: fichaDelivery.assinaturaResponsavelUrl || responsavelSignature,
                      itensGrupo,
                    });
                    const nomeFunc = fichaDelivery.nomeFunc || emp?.nomeCompleto || "Funcionario";
                    const fileName = `Ficha_EPI_${nomeFunc.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
                    uploadFichaMut.mutate(
                      { deliveryId: fichaDelivery.id, fileBase64: base64, fileName },
                      { onSuccess: () => toast.success("Ficha salva com sucesso no sistema!") }
                    );
                  } catch (err: any) {
                    toast.error("Erro ao gerar PDF: " + (err?.message || "tente novamente"));
                  } finally {
                    setIsSavingPdf(false);
                  }
                }}
              >
                <Save className="h-4 w-4 mr-1" />
                {isSavingPdf || uploadFichaMut.isPending ? "Salvando..." : "Salvar PDF"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                const nomeFunc = fichaDelivery.nomeFunc || emp?.nomeCompleto || 'Funcionario';
                const oldTitle = document.title;
                document.title = `EPI - ${nomeFunc}`;
                window.print();
                setTimeout(() => { document.title = oldTitle; }, 500);
              }}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir
              </Button>
              {fichaDelivery.fichaUrl && (
                <Button variant="outline" size="sm" onClick={() => window.open(fichaDelivery.fichaUrl, '_blank')}>
                  <Eye className="h-4 w-4 mr-1" /> Ver PDF Salvo
                </Button>
              )}
            </div>
          </div>

          {/* Printable Form */}
          <div className="epi-ficha-print print-only bg-white border rounded-lg p-8 max-w-3xl mx-auto print:border-0 print:shadow-none print:p-4 print:max-w-none">
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
                {(fichaDelivery._grupoItems || [fichaDelivery]).map((item: any) => {
                  const itemEpi = episAllList.find((e: any) => e.id === item.epiId) || epi;
                  return (
                    <tr key={item.id} className="border-b">
                      <td className="p-2">{item.nomeEpi || itemEpi?.nome || "—"}</td>
                      <td className="p-2 text-center">{item.caEpi || itemEpi?.ca || "—"}</td>
                      <td className="p-2 text-center">{item.quantidade}</td>
                      <td className="p-2 text-center">
                        {itemEpi?.tempoMinimoTroca ? `${itemEpi.tempoMinimoTroca} dias` : "—"}
                      </td>
                      <td className="p-2 text-center">
                        {itemEpi?.valorProduto ? (() => {
                          const bdiPct = bdiQ.data?.bdiPercentual ?? 40;
                          const valorComBdi = parseFloat(String(itemEpi.valorProduto)) * (1 + bdiPct / 100);
                          return valorComBdi.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                        })() : "—"}
                      </td>
                      <td className="p-2 text-center">{item.motivo || "Entrega regular"}</td>
                    </tr>
                  );
                })}
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
                  <strong>📷 FOTO OBRIGATÓRIA:</strong> Para troca por desgaste normal ou mau uso/dano,
                  é <strong>obrigatório</strong> o registro fotográfico do estado atual do EPI danificado como comprovação.
                  Em caso de perda ou furto, a foto não é necessária.
                </p>
              </div>
            </div>

            {/* Declaration Text */}
            <div className="text-sm text-justify mb-4 leading-relaxed">
              <p>{textoFicha || `Declaro ter recebido os Equipamentos de Proteção Individual (EPIs) acima descritos, comprometendo-me a utilizá-los corretamente durante a jornada de trabalho, conforme orientações recebidas. Estou ciente de que a não utilização, o uso inadequado ou a perda/dano por negligência poderá acarretar desconto em meu salário dentro do mesmo mês da ocorrência, conforme Art. 462, §1º da CLT e NR-6 do MTE. Declaro também estar ciente da obrigatoriedade de apresentação de registro fotográfico do EPI danificado para troca por desgaste normal ou mau uso.`}</p>
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
              {/* Assinatura do Funcionário — Rev. 2192: nome em destaque
                  abaixo da linha (assinatura manual nem sempre legível) */}
              <div className="text-center">
                {fichaDelivery.assinaturaUrl || fichaSignature ? (
                  <div>
                    <img src={fichaDelivery.assinaturaUrl || fichaSignature!} alt="Assinatura" className="mx-auto h-16 object-contain mb-1" />
                    <div className="border-t border-black pt-1 text-sm font-semibold text-[#1B2A4A]">
                      {fichaDelivery.nomeFunc || emp?.nomeCompleto || "—"}
                    </div>
                    <p className="text-[10px] text-gray-600">Assinatura do Funcionário</p>
                    <p className="text-[9px] text-green-600 mt-0.5">✓ Assinatura digital coletada</p>
                  </div>
                ) : (
                  <div>
                    <div className="h-16" />
                    <div className="border-t border-black pt-2 text-sm font-semibold text-[#1B2A4A]">
                      {fichaDelivery.nomeFunc || emp?.nomeCompleto || "—"}
                    </div>
                    <p className="text-[10px] text-gray-600">Assinatura do Funcionário</p>
                  </div>
                )}
              </div>
              {/* Assinatura do Responsável — Rev. 2192: nome em destaque
                  abaixo da linha. Prioridade: nome salvo no momento da
                  coleta (`assinaturaResponsavelNome`) > usuário atual. */}
              <div className="text-center">
                {fichaDelivery.assinaturaResponsavelUrl || responsavelSignature ? (
                  <div>
                    <img src={fichaDelivery.assinaturaResponsavelUrl || responsavelSignature!} alt="Assinatura Responsável" className="mx-auto h-16 object-contain mb-1" />
                    <div className="border-t border-black pt-1 text-sm font-semibold text-[#1B2A4A]">
                      {fichaDelivery.assinaturaResponsavelNome || user?.name || "—"}
                    </div>
                    <p className="text-[10px] text-gray-600">Responsável pela Entrega</p>
                    <p className="text-[9px] text-green-600 mt-0.5">✓ Assinatura digital coletada</p>
                  </div>
                ) : (
                  <div>
                    <div className="h-16" />
                    <div className="border-t border-black pt-2 text-sm font-semibold text-[#1B2A4A]">
                      {user?.name || "—"}
                    </div>
                    <p className="text-[10px] text-gray-600">Responsável pela Entrega</p>
                  </div>
                )}
              </div>
            </div>

            {/* Rev. 2193 — Fotos anexadas movidas pra DEPOIS das assinaturas
                (Lilian: "documento unico, documento, assinatura e depois fotos").
                Bloco renderiza `fotoEstadoUrl` de cada item do grupo como
                evidência fotográfica do estado do EPI no momento da
                entrega/troca, após o bloco de assinaturas para encerrar o
                documento como anexo de provas. */}
            {(() => {
              const itensComFoto = (fichaDelivery._grupoItems || [fichaDelivery]).filter(
                (it: any) => it.fotoEstadoUrl
              );
              if (itensComFoto.length === 0) return null;
              return (
                <div className="mt-8 pt-6 border-t-2 border-gray-300">
                  <div className="mb-3">
                    <p className="text-xs font-bold text-[#1B2A4A] uppercase tracking-wider">
                      📷 Evidência Fotográfica — EPIs ({itensComFoto.length})
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      Registro do estado do EPI no momento da entrega/troca, conforme política de cobrança (Art. 462, §1º CLT).
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {itensComFoto.map((it: any) => (
                      <div key={it.id} className="text-center">
                        <a href={it.fotoEstadoUrl} target="_blank" rel="noreferrer">
                          <img
                            src={it.fotoEstadoUrl}
                            alt={`Foto ${it.nomeEpi || ""}`}
                            className="w-full h-40 object-cover rounded border border-gray-300 hover:opacity-90"
                          />
                        </a>
                        <p className="text-[10px] text-gray-600 mt-1 truncate">
                          {it.nomeEpi || "EPI"}
                          {it.motivoTroca ? ` — ${MOTIVO_TROCA_LABEL[it.motivoTroca] || it.motivoTroca}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Botões de Assinatura Digital - só aparece na tela, não na impressão */}
            <div className="mt-4 print:hidden space-y-2">
              {!fichaDelivery.assinaturaUrl && !fichaSignature && (
                <Button
                  className="w-full bg-[#1B2A4A] hover:bg-[#243660] text-white"
                  onClick={() => setShowFichaSignPad(true)}
                >
                  <PenTool className="h-4 w-4 mr-2" /> Funcionário Assinar Digitalmente
                </Button>
              )}
              {!fichaDelivery.assinaturaResponsavelUrl && !responsavelSignature && (
                <Button
                  variant="outline"
                  className="w-full border-orange-400 text-orange-700 hover:bg-orange-50"
                  onClick={() => setShowResponsavelSignPad(true)}
                >
                  <PenTool className="h-4 w-4 mr-2" /> Responsável Assinar Digitalmente
                </Button>
              )}
              {(!fichaDelivery.assinaturaUrl && !fichaSignature) || (!fichaDelivery.assinaturaResponsavelUrl && !responsavelSignature) ? (
                <p className="text-[10px] text-center text-muted-foreground">
                  Colete as assinaturas no celular ou tablet — substituem a ficha de papel
                </p>
              ) : null}
            </div>

            {/* Legal Footer */}
            <div className="mt-6 pt-4 border-t-2 border-[#1B2A4A] text-[10px] text-gray-400 text-center">
              <p>Conforme Art. 462, §1º da CLT e NR-6 (item 6.7.1) do MTE — Equipamentos de Proteção Individual</p>
              <p className="mt-1 text-[#1B2A4A] font-medium">{selectedCompany?.razaoSocial || 'FC Engenharia Projetos e Consultoria Ltda'}</p>
            </div>
          </div>
        </div>

        {/* Overlay de Assinatura Digital — Funcionário */}
        {showFichaSignPad && fichaDelivery && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden overflow-y-auto">
            <div className="max-w-lg w-full my-auto">
              <EpiAssinatura
                employeeId={fichaDelivery.employeeId}
                employeeName={fichaDelivery.nomeFunc || ''}
                deliveryId={fichaDelivery.id}
                tipo="entrega"
                tipoAssinante="funcionario"
                epiNome={fichaDelivery.nomeEpi}
                onComplete={(url) => {
                  setShowFichaSignPad(false);
                  setFichaSignature(url);
                  setFichaDelivery((prev: any) => prev ? { ...prev, assinaturaUrl: url } : prev);
                  deliveriesQ.refetch();
                  toast.success("Assinatura do funcionário coletada com sucesso!");
                }}
                onCancel={() => setShowFichaSignPad(false)}
              />
            </div>
          </div>
        )}

        {/* Overlay de Assinatura Digital — Responsável pela Entrega */}
        {showResponsavelSignPad && fichaDelivery && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden overflow-y-auto">
            <div className="max-w-lg w-full my-auto">
              <EpiAssinatura
                employeeId={fichaDelivery.employeeId}
                employeeName={fichaDelivery.nomeFunc || ''}
                deliveryId={fichaDelivery.id}
                tipo="entrega"
                tipoAssinante="responsavel"
                epiNome={fichaDelivery.nomeEpi}
                onComplete={(url) => {
                  setShowResponsavelSignPad(false);
                  setResponsavelSignature(url);
                  setFichaDelivery((prev: any) => prev ? { ...prev, assinaturaResponsavelUrl: url } : prev);
                  deliveriesQ.refetch();
                  toast.success("Assinatura do responsável coletada com sucesso!");
                }}
                onCancel={() => setShowResponsavelSignPad(false)}
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
                {/* Rev. 2950 — local de estoque do Catálogo: Central (todos veem) + obras permitidas */}
                <Select value={catalogoObraId} onValueChange={setCatalogoObraId}>
                  <SelectTrigger className="h-9 w-[210px]">
                    <Warehouse className="h-4 w-4 mr-1 text-[#1B2A4A]" />
                    <SelectValue placeholder="Local do estoque" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="central">🏢 Almoxarifado Central</SelectItem>
                    {obrasPermitidas.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>🏗️ {o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                {!readOnly && <Button size="sm" onClick={() => { setEstoqueLocalId(catalogoObraId !== "central" ? catalogoObraId : (canWriteCentral ? "central" : (obrasPermitidas[0] ? String(obrasPermitidas[0].id) : "central"))); setViewMode("novo_epi"); }} className="bg-[#1B2A4A] hover:bg-[#243660]">
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
                  <p className="text-xs text-muted-foreground whitespace-nowrap">Inventário Total</p>
                  <p className="text-lg font-bold text-emerald-700">
                    {(stats.valorTotalGeral || stats.valorTotalInventario) > 0 ? (stats.valorTotalGeral || stats.valorTotalInventario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Central: {stats.valorTotalInventario > 0 ? stats.valorTotalInventario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : "R$ 0"}
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
            { mode: "necessidade",   icon: <ShoppingCart className="h-3.5 w-3.5" />,   label: "Necessidade" },
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
        {!["config", "checklist", "validade", "custos", "minimo", "ia", "capacidade", "necessidade", "descontos"].includes(viewMode) && (
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
                <SelectItem value="Calcado">Calçado</SelectItem>
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
              {([
                { key: "todos", label: "Todos", icon: Package, color: "" },
                { key: "zerado", label: "Zerado", icon: Ban, color: "text-red-600" },
                { key: "critico", label: "Crítico", icon: AlertTriangle, color: "text-amber-600" },
                { key: "baixo", label: "Baixo", icon: TrendingUp, color: "text-orange-500" },
              ] as const).map(opt => (
                <button key={opt.key}
                  onClick={() => setFilterEstoque(opt.key)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${filterEstoque === opt.key ? 'bg-white shadow-sm border text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                  <opt.icon className={`h-3 w-3 ${filterEstoque === opt.key ? opt.color : ''}`} />
                  {opt.label}
                </button>
              ))}
            </div>
            {!readOnly && (
              <Button size="sm" variant="outline"
                className="text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                disabled={gerarSCMut.isPending}
                onClick={() => {
                  if (!confirm("Gerar Solicitação de Compra automática para todos os EPIs abaixo do estoque mínimo?")) return;
                  gerarSCMut.mutate({ companyId: queryCompanyId || companyId, companyIds: isConstrutoras ? companyIds : undefined, userId: user?.id, userName: user?.name || user?.nome });
                }}>
                {gerarSCMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShoppingCart className="h-3 w-3" />}
                Gerar SC (Estoque Mínimo)
              </Button>
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
                <Button onClick={() => { setEstoqueLocalId(catalogoObraId !== "central" ? catalogoObraId : (canWriteCentral ? "central" : (obrasPermitidas[0] ? String(obrasPermitidas[0].id) : "central"))); setViewMode("novo_epi"); }} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
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
                        <th className="p-3 text-center font-medium">{catalogoObraId === "central" ? "Estoque (Central)" : `Estoque (${(obrasList as any[]).find((o: any) => String(o.id) === catalogoObraId)?.nome || "Obra"})`}</th>
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
                                <img src={epi.fotoUrl} alt={epi.nome} className="w-20 h-20 object-contain rounded mx-auto border bg-white"
                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              ) : (
                                <div className="w-20 h-20 rounded border bg-slate-50 flex items-center justify-center mx-auto">
                                  <ImagePlus className="h-6 w-6 text-slate-300" />
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
                              {labelTamanhoEpi(epi)}
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
                <div className="border-t bg-muted/30 p-3 text-sm text-muted-foreground flex items-center justify-between">
                  <span>{filteredEpis.length} EPI{filteredEpis.length !== 1 ? "s" : ""} nesta página (total: {episTotal})</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={episPage === 0} onClick={() => setEpisPage(p => p - 1)}>Anterior</Button>
                    <span className="text-xs">Página {episPage + 1} de {Math.max(1, Math.ceil(episTotal / PAGE_SIZE))}</span>
                    <Button variant="outline" size="sm" disabled={(episPage + 1) * PAGE_SIZE >= episTotal} onClick={() => setEpisPage(p => p + 1)}>Próxima</Button>
                  </div>
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
              {/* Rev. 2186 — filtro rápido por status de assinatura */}
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b bg-slate-50/60">
                <span className="text-xs font-medium text-slate-600 mr-1">Assinatura:</span>
                {([
                  { key: "todas", label: "Todas", cls: "bg-slate-200 text-slate-800 border-slate-300" },
                  { key: "assinadas", label: "✓ Assinadas", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" },
                  { key: "nao_assinadas", label: "⚠ Não assinadas", cls: "bg-amber-100 text-amber-800 border-amber-300" },
                ] as const).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setFilterAssinatura(opt.key as any)}
                    className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                      filterAssinatura === opt.key ? opt.cls : "bg-white text-slate-500 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {opt.label}
                    {opt.key !== "todas" && (
                      <span className="ml-1.5 text-[10px] opacity-80">
                        ({deliveriesList.filter((d: any) => opt.key === "assinadas" ? !!d.assinaturaUrl : !d.assinaturaUrl).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {selectedDeliveryIds.size > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-b">
                  <span className="text-sm font-medium text-blue-800">{selectedDeliveryIds.size} selecionada{selectedDeliveryIds.size !== 1 ? "s" : ""}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedDeliveryIds(new Set())}>
                    Limpar seleção
                  </Button>
                  <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => {
                    if (confirm(`Remover ${selectedDeliveryIds.size} entrega${selectedDeliveryIds.size !== 1 ? "s" : ""}? O estoque será devolvido.`)) {
                      const toDelete = filteredDeliveries.filter((d: any) => selectedDeliveryIds.has(d.id));
                      toDelete.forEach((d: any) => deleteDeliveryMut.mutate({ id: d.id, epiId: d.epiId, quantidade: d.quantidade }));
                      setSelectedDeliveryIds(new Set());
                    }
                  }}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir selecionadas
                  </Button>
                </div>
              )}
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-center w-10">
                          <input type="checkbox"
                            className="rounded border-gray-300 h-4 w-4 cursor-pointer accent-[#1B2A4A]"
                            checked={filteredDeliveries.length > 0 && filteredDeliveries.every((d: any) => selectedDeliveryIds.has(d.id))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDeliveryIds(new Set(filteredDeliveries.map((d: any) => d.id)));
                              } else {
                                setSelectedDeliveryIds(new Set());
                              }
                            }}
                          />
                        </th>
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
                      {(() => {
                        const motivoLabel: Record<string, string> = {
                          perda: "Perda",
                          mau_uso: "Mau Uso",
                          desgaste_normal: "Desgaste",
                          furto: "Furto",
                        };
                        const toggleSelect = (id: number) => {
                          setSelectedDeliveryIds(prev => {
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            return next;
                          });
                        };
                        const canEdit = (d: any) => !d.assinaturaUrl;
                        const openEdit = (d: any) => {
                          setEditGroupItems(null);
                          setEditingDelivery(d);
                          setEditDeliveryForm({
                            dataEntrega: d.dataEntrega || "",
                            quantidade: d.quantidade || 1,
                            motivo: d.motivo || "",
                            observacoes: d.observacoes || "",
                            motivoTroca: d.motivoTroca || "",
                            epiId: d.epiId,
                            employeeId: d.employeeId,
                          });
                        };
                        // Edição de entrega AGRUPADA: aplica data/motivo/observações a
                        // TODOS os itens do grupo (qtd/EPI de cada item ficam intactos).
                        const openEditGroup = (items: any[]) => {
                          const first = items[0];
                          setEditGroupItems(items);
                          setEditingDelivery(first);
                          setEditDeliveryForm({
                            dataEntrega: first.dataEntrega || "",
                            quantidade: first.quantidade || 1,
                            motivo: first.motivo || "",
                            observacoes: first.observacoes || "",
                            motivoTroca: first.motivoTroca || "",
                            epiId: first.epiId,
                            employeeId: first.employeeId,
                          });
                        };
                        const grouped: any[] = [];
                        const grupoMap = new Map<string, any[]>();
                        filteredDeliveries.forEach((d: any) => {
                          if (d.grupoEntregaId) {
                            if (!grupoMap.has(d.grupoEntregaId)) {
                              grupoMap.set(d.grupoEntregaId, []);
                              grouped.push({ type: 'group', grupoEntregaId: d.grupoEntregaId });
                            }
                            grupoMap.get(d.grupoEntregaId)!.push(d);
                          } else {
                            grouped.push({ type: 'single', delivery: d });
                          }
                        });
                        return grouped.map((entry: any, idx: number) => {
                          if (entry.type === 'group') {
                            const items = grupoMap.get(entry.grupoEntregaId)!;
                            const first = items[0];
                            const allIds = items.map((d: any) => d.id);
                            const allSelected = allIds.every((id: number) => selectedDeliveryIds.has(id));
                            const groupSigned = items.some((d: any) => d.fichaUrl || d.assinaturaUrl);
                            return (
                              <tr key={`grp-${entry.grupoEntregaId}`} className={`border-b last:border-0 hover:bg-muted/30 ${allSelected ? "bg-blue-50/50" : ""}`}>
                                <td className="p-3 text-center">
                                  <input type="checkbox" className="rounded border-gray-300 h-4 w-4 cursor-pointer accent-[#1B2A4A]"
                                    checked={allSelected}
                                    onChange={() => {
                                      setSelectedDeliveryIds(prev => {
                                        const next = new Set(prev);
                                        if (allSelected) allIds.forEach((id: number) => next.delete(id));
                                        else allIds.forEach((id: number) => next.add(id));
                                        return next;
                                      });
                                    }}
                                  />
                                </td>
                                <td className="p-3 text-xs">
                                  {first.dataEntrega ? new Date(first.dataEntrega + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                                </td>
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <User className="h-3.5 w-3.5 text-blue-600" />
                                    <div>
                                      <span className="font-medium text-xs">{first.nomeFunc || "—"}</span>
                                      {first.funcaoFunc && <span className="text-[10px] text-muted-foreground ml-1">({first.funcaoFunc})</span>}
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3">
                                  <div className="space-y-1">
                                    {items.map((d: any) => (
                                      <div key={d.id} className="flex items-center gap-2">
                                        {getEpiIcon(d.nomeEpi || "", "h-3.5 w-3.5")}
                                        <span className="text-xs">{d.nomeEpi || "—"}</span>
                                        {d.caEpi && <Badge variant="outline" className="text-[10px]">CA: {d.caEpi}</Badge>}
                                        <span className="text-[10px] text-muted-foreground">×{d.quantidade}</span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                                <td className="p-3 text-center font-bold">{items.reduce((s: number, d: any) => s + (d.quantidade || 1), 0)}</td>
                                <td className="p-3 text-xs">
                                  {first.motivoTroca ? (
                                    <Badge variant={['perda', 'mau_uso', 'furto'].includes(first.motivoTroca) ? "destructive" : "secondary"} className="text-[10px]">
                                      {motivoLabel[first.motivoTroca] || first.motivoTroca}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">Entrega regular</span>
                                  )}
                                </td>
                                <td className="p-3 text-center text-xs">
                                  {items.some((d: any) => d.valorCobrado) ? (
                                    <span className="text-red-600 font-semibold">R$ {items.reduce((s: number, d: any) => s + (d.valorCobrado ? parseFloat(String(d.valorCobrado)) * (d.quantidade || 1) : 0), 0).toFixed(2)}</span>
                                  ) : "—"}
                                </td>
                                <td className="p-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {!items.some((d: any) => d.assinaturaUrl) && (
                                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar entrega (data/motivo)"
                                        onClick={() => openEditGroup(items)}>
                                        <Pencil className="h-3.5 w-3.5 text-amber-600" />
                                      </Button>
                                    )}
                                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Ficha de Entrega"
                                      onClick={() => { setFichaSignature(null); setResponsavelSignature(null); setFichaDelivery({ ...first, _grupoItems: items }); setViewMode("ficha_epi"); }}>
                                      <FileText className="h-3.5 w-3.5 text-blue-600" />
                                    </Button>
                                    {/* Rev. 2186 — eye/aguardando em linhas agrupadas (paridade com linhas únicas)
                                        Rev. 2190 — eye abre o PREVIEW IN-APP (que sobrepõe
                                        `assinaturaUrl` como <img>), não `window.open(fichaUrl)`.
                                        Causa: `fichaUrl` é o PDF gerado ANTES da assinatura;
                                        abrir esse PDF mostrava ficha em branco e usuário
                                        acreditava que a assinatura tinha "sumido". */}
                                    {items.some((d: any) => d.assinaturaUrl) ? (
                                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver ficha assinada"
                                        onClick={() => { setFichaSignature(null); setResponsavelSignature(null); setFichaDelivery({ ...first, _grupoItems: items }); setViewMode("ficha_epi"); }}>
                                        <Eye className="h-3.5 w-3.5 text-green-600" />
                                      </Button>
                                    ) : (
                                      <span title="Aguardando assinatura do funcionário" className="inline-flex items-center justify-center h-7 w-7 text-amber-500">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                      </span>
                                    )}
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Remover entrega" onClick={() => {
                                      if (confirm(`Remover ${items.length} EPIs desta entrega? O estoque será devolvido.`)) {
                                        items.forEach((d: any) => deleteDeliveryMut.mutate({ id: d.id, epiId: d.epiId, quantidade: d.quantidade }));
                                      }
                                    }}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }
                          const d = entry.delivery;
                          const isSigned = !canEdit(d);
                          return (
                          <tr key={d.id} className={`border-b last:border-0 hover:bg-muted/30 ${selectedDeliveryIds.has(d.id) ? "bg-blue-50/50" : ""}`}>
                            <td className="p-3 text-center">
                              <input type="checkbox" className="rounded border-gray-300 h-4 w-4 cursor-pointer accent-[#1B2A4A]"
                                checked={selectedDeliveryIds.has(d.id)}
                                onChange={() => toggleSelect(d.id)}
                              />
                            </td>
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
                                {!isSigned && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar entrega"
                                    onClick={() => openEdit(d)}>
                                    <Pencil className="h-3.5 w-3.5 text-amber-600" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Ficha de Entrega"
                                  onClick={() => { setFichaSignature(null); setResponsavelSignature(null); setFichaDelivery(d); setViewMode("ficha_epi"); }}>
                                  <FileText className="h-3.5 w-3.5 text-blue-600" />
                                </Button>
                                {/* Rev. 2186 — eye só aparece quando há assinatura do funcionário
                                    (antes usava d.fichaUrl, que passou a ser populado também
                                    para fichas SEM assinatura, criando falso-positivo visual).
                                    Rev. 2190 — eye abre o PREVIEW IN-APP (que sobrepõe
                                    `assinaturaUrl` como <img>), não `window.open(fichaUrl)`.
                                    Causa: `fichaUrl` é o PDF gerado ANTES da assinatura;
                                    abrir esse PDF mostrava ficha em branco e usuário
                                    acreditava que a assinatura tinha "sumido". O botão
                                    "Ver PDF Salvo" segue disponível DENTRO do dialog
                                    pra quem quiser o arquivo. */}
                                {d.assinaturaUrl && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver ficha assinada"
                                    onClick={() => { setFichaSignature(null); setResponsavelSignature(null); setFichaDelivery(d); setViewMode("ficha_epi"); }}>
                                    <Eye className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                )}
                                {!d.assinaturaUrl && (
                                  <span title="Aguardando assinatura do funcionário" className="inline-flex items-center justify-center h-7 w-7 text-amber-500">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                  </span>
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
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
                <div className="border-t bg-muted/30 p-3 text-sm text-muted-foreground flex items-center justify-between">
                  <span>{filteredDeliveries.length} entrega{filteredDeliveries.length !== 1 ? "s" : ""} nesta página (total: {deliveriesTotal})</span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={deliveriesPage === 0} onClick={() => setDeliveriesPage(p => p - 1)}>Anterior</Button>
                    <span className="text-xs">Página {deliveriesPage + 1} de {Math.max(1, Math.ceil(deliveriesTotal / PAGE_SIZE))}</span>
                    <Button variant="outline" size="sm" disabled={(deliveriesPage + 1) * PAGE_SIZE >= deliveriesTotal} onClick={() => setDeliveriesPage(p => p + 1)}>Próxima</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        )}

        {editingDelivery && (
          <FullScreenDialog
            open={!!editingDelivery}
            onClose={() => { setEditingDelivery(null); setEditGroupItems(null); }}
            title="Editar Entrega de EPI"
          >
            <div className="space-y-4 p-4">
              <div>
                <Label>Funcionário</Label>
                <p className="text-sm font-medium mt-1">{editingDelivery.nomeFunc || "—"}</p>
              </div>
              {editGroupItems && editGroupItems.length > 1 ? (
                <div>
                  <Label>EPIs desta entrega ({editGroupItems.length})</Label>
                  <div className="mt-1 space-y-0.5">
                    {editGroupItems.map((it: any) => (
                      <p key={it.id} className="text-xs text-muted-foreground">
                        • {it.nomeEpi || "—"}{it.caEpi ? ` (CA: ${it.caEpi})` : ""} ×{it.quantidade || 1}
                      </p>
                    ))}
                  </div>
                  <p className="text-[11px] text-amber-700 mt-1">A data/motivo/observações serão aplicados a todos os itens acima.</p>
                </div>
              ) : (
                <div>
                  <Label>EPI</Label>
                  <p className="text-sm font-medium mt-1">{editingDelivery.nomeEpi || "—"} {editingDelivery.caEpi ? `(CA: ${editingDelivery.caEpi})` : ""}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data da Entrega</Label>
                  <Input type="date" value={editDeliveryForm.dataEntrega || ""}
                    onChange={(e) => setEditDeliveryForm((f: any) => ({ ...f, dataEntrega: e.target.value }))} />
                </div>
                {!editGroupItems && (
                  <div>
                    <Label>Quantidade</Label>
                    <Input type="number" min={1} value={editDeliveryForm.quantidade || 1}
                      onChange={(e) => setEditDeliveryForm((f: any) => ({ ...f, quantidade: parseInt(e.target.value) || 1 }))} />
                  </div>
                )}
              </div>
              <div>
                <Label>Motivo da Troca</Label>
                <Select value={editDeliveryForm.motivoTroca || "none"} onValueChange={(v) => setEditDeliveryForm((f: any) => ({ ...f, motivoTroca: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Entrega regular (sem troca)</SelectItem>
                    <SelectItem value="desgaste_normal">Desgaste normal</SelectItem>
                    <SelectItem value="perda">Perda</SelectItem>
                    <SelectItem value="mau_uso">Mau uso</SelectItem>
                    <SelectItem value="furto">Furto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Motivo / Justificativa</Label>
                <Input value={editDeliveryForm.motivo || ""}
                  onChange={(e) => setEditDeliveryForm((f: any) => ({ ...f, motivo: e.target.value }))}
                  placeholder="Ex: Entrega regular, substituição..." />
              </div>
              <div>
                <Label>Observações</Label>
                <Input value={editDeliveryForm.observacoes || ""}
                  onChange={(e) => setEditDeliveryForm((f: any) => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Observações adicionais..." />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setEditingDelivery(null); setEditGroupItems(null); }}>Cancelar</Button>
                <Button
                  className="bg-[#1B2A4A] hover:bg-[#243660]"
                  disabled={updateDeliveryMut.isPending}
                  onClick={async () => {
                    if (editGroupItems && editGroupItems.length) {
                      // Entrega agrupada: aplica data/motivo/observações a TODOS os itens
                      // (sem tocar em quantidade/EPI → não mexe no estoque).
                      try {
                        for (const it of editGroupItems) {
                          await updateDeliveryMut.mutateAsync({
                            id: it.id,
                            dataEntrega: editDeliveryForm.dataEntrega,
                            motivo: editDeliveryForm.motivo,
                            observacoes: editDeliveryForm.observacoes,
                            motivoTroca: editDeliveryForm.motivoTroca || null,
                          });
                        }
                        setEditGroupItems(null);
                        setEditingDelivery(null);
                      } catch { /* erro já exibido pelo onError da mutation */ }
                      return;
                    }
                    updateDeliveryMut.mutate({
                      id: editingDelivery.id,
                      dataEntrega: editDeliveryForm.dataEntrega,
                      quantidade: editDeliveryForm.quantidade,
                      motivo: editDeliveryForm.motivo,
                      observacoes: editDeliveryForm.observacoes,
                      motivoTroca: editDeliveryForm.motivoTroca || null,
                    });
                  }}
                >
                  {updateDeliveryMut.isPending ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </div>
          </FullScreenDialog>
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
                    <SelectItem value="central">🏢 Almoxarifado Central</SelectItem>
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
            {(estoqueResumo.length > 0 || estoqueCentral.totalUnidades > 0) && (() => {
              // Rev. 2780 — cards e resumo SEMPRE mostram TODOS os locais (painel fixo completo);
              // o clique só destaca o card e filtra a TABELA abaixo (tabelaEstoqueList), não some com os cards.
              const filteredObras = estoqueResumo;
              const valorObras = filteredObras.reduce((s: number, r: any) => s + parseFloat(String(r.valorTotal || 0)), 0);
              const unidObras = filteredObras.reduce((s: number, r: any) => s + Number(r.totalUnidades || 0), 0); // Rev. 2777 — Number() evita concatenação de string (SUM do pg vem string)
              const valorCentral = parseFloat(String(estoqueCentral.valorTotal || 0));
              const unidCentral = Number(estoqueCentral.totalUnidades || 0);
              const showCentral = true;
              const valorTotal = showCentral ? valorCentral + valorObras : valorObras;
              const unidTotal = showCentral ? unidCentral + unidObras : unidObras;
              const totalLocais = filteredObras.length + (showCentral ? 1 : 0);
              return (
              <>
              {/* Rev. 2993 — SEM sticky: a tela inteira rola junto (resumo + cards + tabela),
                  não congela as obras no topo deixando só os itens rolarem por baixo. */}
              <div className="pt-1 pb-3 space-y-3 border-b mb-1">
              <Card className="border-emerald-200 bg-emerald-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 rounded-lg">
                        <DollarSign className="h-5 w-5 text-emerald-700" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Valor Total em Estoque (Central + Obras)</p>
                        <p className="text-xl font-bold text-emerald-700">R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{unidTotal.toLocaleString('pt-BR')} unid.</p>
                      <p className="text-xs text-muted-foreground">{Number(totalLocais || 0).toLocaleString('pt-BR')} local(is)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {showCentral && (
                  <Card
                    onClick={() => setFilterObraEstoque(filterObraEstoque === "central" ? "todas" : "central")}
                    className={`border-l-4 border-l-emerald-500 cursor-pointer transition hover:shadow-md ${filterObraEstoque === "central" ? "ring-2 ring-amber-500 bg-amber-100/70 shadow-md" : ""}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-sm text-emerald-700 flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5" /> Almoxarifado Central
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">{Number(estoqueCentral.totalItens || 0).toLocaleString('pt-BR')} tipo(s) de EPI</p>
                          <p className="text-xs text-emerald-600 font-medium mt-0.5">R$ {valorCentral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">
                          {unidCentral.toLocaleString('pt-BR')} unid.
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {(estoqueCardsOpen ? filteredObras : filteredObras.slice(0, showCentral ? 2 : 3)).map((r: any) => (
                  <Card
                    key={r.obraId}
                    onClick={() => setFilterObraEstoque(filterObraEstoque === String(r.obraId) ? "todas" : String(r.obraId))}
                    className={`border-l-4 border-l-blue-500 cursor-pointer transition hover:shadow-md ${filterObraEstoque === String(r.obraId) ? "ring-2 ring-amber-500 bg-amber-100/70 shadow-md" : ""}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-sm text-[#1B3A5C]">{r.nomeObra}</p>
                          <p className="text-xs text-muted-foreground mt-1">{Number(r.totalItens || 0).toLocaleString('pt-BR')} tipo(s) de EPI</p>
                          <p className="text-xs text-emerald-600 font-medium mt-0.5">R$ {parseFloat(String(r.valorTotal || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">
                          {Number(r.totalUnidades || 0).toLocaleString('pt-BR')} unid.
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {filteredObras.length > (showCentral ? 2 : 3) && (
                <div className="flex justify-center">
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setEstoqueCardsOpen(v => !v)}>
                    {estoqueCardsOpen
                      ? <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Recolher locais</>
                      : <><ChevronDown className="h-3.5 w-3.5 mr-1" /> Ver todos os {totalLocais} locais</>}
                  </Button>
                </div>
              )}
              </div>
              </>
              );
            })()}

            {/* Tabela detalhada */}
            <Card>
              <CardContent className="p-0">
                {tabelaEstoqueList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Warehouse className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="font-semibold text-lg">{filterObraEstoque === "central" ? "Nenhum item no Estoque Central" : "Nenhum estoque em obra"}</h3>
                    <p className="text-muted-foreground text-sm mt-1">{filterObraEstoque === "central" ? "Cadastre EPIs com quantidade em estoque ou faça uma entrada direta." : "Faça transferências ou cadastre EPIs já existentes na obra."}</p>
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
                        {tabelaEstoqueList
                          .map((e: any) => (
                          <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => {
                            // Rev. 2928 — linha do Almoxarifado Central NÃO usa o ajuste de obra
                            // (id sintético "central-*" / obraId "central"): vai ao catálogo central.
                            if (e.obraId === "central") {
                              const epi = episAllList.find((ep: any) => ep.id === e.epiId);
                              if (epi) { setEditingEpi(epi); loadEpiForEdit(epi); setViewMode('editar_epi'); }
                              return;
                            }
                            setAjusteObraRow(e); setAjusteObraQtd(String(e.quantidade ?? 0));
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
                                <div className="flex flex-col">
                                  <span className="text-xs font-medium">{e.nomeEpi || 'EPI #' + e.epiId}</span>
                                  {e.tamanhoEpi && (
                                    <span className="text-[10px] font-semibold text-blue-700 mt-0.5">
                                      {e.categoriaEpi === 'Calcado' ? `Nº ${e.tamanhoEpi}` : `Tam. ${e.tamanhoEpi}`}
                                    </span>
                                  )}
                                </div>
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
                                {e.obraId !== "central" && (
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Ajustar estoque na obra" onClick={() => {
                                    setAjusteObraRow(e); setAjusteObraQtd(String(e.quantidade ?? 0));
                                  }}>
                                    <Pencil className="h-3.5 w-3.5 text-blue-600" />
                                  </Button>
                                )}
                                {e.obraId === "central" && canWriteCentral && (
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Ajustar estoque central" onClick={() => {
                                    const epi = episAllList.find((ep: any) => ep.id === e.epiId);
                                    if (epi) { setEditingEpi(epi); loadEpiForEdit(epi); setViewMode('editar_epi'); }
                                  }}>
                                    <Pencil className="h-3.5 w-3.5 text-emerald-600" />
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Editar cadastro do EPI (catálogo central)" onClick={() => {
                                  const epi = episAllList.find((ep: any) => ep.id === e.epiId);
                                  if (epi) { setEditingEpi(epi); loadEpiForEdit(epi); setViewMode('editar_epi'); }
                                }}>
                                  <Package className="h-3.5 w-3.5 text-gray-600" />
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
                    <p className="text-muted-foreground text-sm mt-1">Transfira EPIs do almoxarifado central para as obras.</p>
                    <Button onClick={() => setShowTransferDialog(true)} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                      <Plus className="h-4 w-4 mr-2" /> Nova Transferência
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Data / Hora</th>
                          <th className="p-3 text-left font-medium">EPI</th>
                          <th className="p-3 text-center font-medium">Qtd</th>
                          <th className="p-3 text-left font-medium">Origem</th>
                          <th className="p-3 text-center font-medium">→</th>
                          <th className="p-3 text-left font-medium">Destino</th>
                          <th className="p-3 text-left font-medium">Usuário</th>
                          <th className="p-3 text-left font-medium">Obs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transferenciasList.map((t: any) => (
                          <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 text-xs whitespace-nowrap">
                              {(() => {
                                const d = t.createdAt ? new Date(t.createdAt) : (t.data ? new Date(t.data + 'T00:00:00') : null);
                                if (!d || isNaN(d.getTime())) return '—';
                                return (
                                  <div className="flex flex-col leading-tight">
                                    <span className="font-medium">{d.toLocaleDateString('pt-BR')}</span>
                                    <span className="text-[10px] text-muted-foreground">{t.createdAt ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {getEpiIcon(t.nomeEpi || '', 'h-3.5 w-3.5')}
                                <div className="flex flex-col leading-tight">
                                  <span className="text-xs font-medium">{t.nomeEpi || 'EPI #' + t.epiId}</span>
                                  {t.tamanhoEpi ? (
                                    <span className="text-[10px] text-muted-foreground">
                                      {t.categoriaEpi === 'Calcado' ? `Nº ${t.tamanhoEpi}` : `Tam. ${t.tamanhoEpi}`}
                                    </span>
                                  ) : null}
                                </div>
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
                                {t.destinoObraId ? `🏗️ ${t.destinoNome || 'Obra #' + t.destinoObraId}` : '🏢 Almoxarifado Central'}
                              </Badge>
                            </td>
                            <td className="p-3 text-xs whitespace-nowrap">
                              {t.criadoPor ? (
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                  <User className="h-3 w-3" /> {t.criadoPor}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
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
      {showTransferDialog && (() => {
        const addTransItem = () => {
          if (!transForm.epiId) return toast.error('Selecione o EPI primeiro');
          if (transItens.some(i => i.epiId === transForm.epiId)) return toast.error('Este EPI já foi adicionado');
          setTransItens(prev => [...prev, { epiId: transForm.epiId, quantidade: transForm.quantidade }]);
          setTransForm(f => ({ ...f, epiId: '', quantidade: 1 }));
        };
        // Rev. 2963 — disponibilidade da ORIGEM escolhida (central = estoque do catálogo;
        // obra = epi_estoque_obra). null = origem ainda não definida.
        const dispOrigem = (epiId: string): number | null => {
          if (!epiId) return null;
          if (transForm.tipoOrigem === 'central') {
            const e = episAllList.find((x: any) => String(x.id) === epiId);
            return Number(e?.quantidadeEstoque || 0);
          }
          if (!transForm.origemObraId) return null;
          return estoqueObraTransferMap.get(`${epiId}|${transForm.origemObraId}`) ?? 0;
        };
        const handleSubmitTransfer = async () => {
          const allItens = transForm.epiId
            ? [...transItens, { epiId: transForm.epiId, quantidade: transForm.quantidade }]
            : transItens;
          if (allItens.length === 0) return toast.error('Adicione pelo menos um EPI');
          if (transForm.tipoDestino === 'obra' && !transForm.destinoObraId) return toast.error('Selecione a obra de destino');
          if (transForm.tipoOrigem === 'obra' && !transForm.origemObraId) return toast.error('Selecione a obra de origem');
          if (transForm.tipoOrigem === 'central' && transForm.tipoDestino === 'central') return toast.error('Não é possível transferir do central para o central');
          if (transForm.tipoOrigem === 'obra' && transForm.tipoDestino === 'obra' && transForm.origemObraId === transForm.destinoObraId) return toast.error('Origem e destino não podem ser a mesma obra');
          setTransSaving(true);
          let ok = 0, lastErr = "";
          for (const item of allItens) {
            try {
              await transferirMut.mutateAsync({
                companyId: queryCompanyId, epiId: parseInt(item.epiId), quantidade: item.quantidade,
                tipoOrigem: transForm.tipoOrigem, origemObraId: transForm.origemObraId ? parseInt(transForm.origemObraId) : undefined,
                tipoDestino: transForm.tipoDestino, destinoObraId: transForm.destinoObraId ? parseInt(transForm.destinoObraId) : undefined,
                data: transForm.data, observacoes: transForm.observacoes || undefined,
              });
              ok++;
            } catch (err: any) { lastErr = err?.message || "Erro"; }
          }
          setTransSaving(false);
          estoqueObraQ.refetch(); estoqueObraResumoQ.refetch(); estoqueCentralQ.refetch(); episAllQ.refetch(); transferenciasQ.refetch(); episQ.refetch(); statsQ.refetch();
          if (ok === allItens.length) {
            toast.success(`${ok} EPI(s) transferido(s) com sucesso!`);
            setShowTransferDialog(false); resetTransForm();
          } else {
            toast.error(`${ok}/${allItens.length} transferidos. Erro: ${lastErr}`);
          }
        };
        return (
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
                <Label>Origem *</Label>
                <div className="flex gap-2 mt-1">
                  <button type="button" disabled={!canWriteCentral}
                    onClick={() => { if (!canWriteCentral) return toast.error('Almoxarifado Central disponível apenas para administradores.'); setTransForm(f => ({ ...f, tipoOrigem: 'central', origemObraId: '', ...(f.tipoDestino === 'central' ? { tipoDestino: 'obra' as const, destinoObraId: '' } : {}) })); }}
                    title={!canWriteCentral ? 'Apenas administradores podem usar o Almoxarifado Central' : undefined}
                    className={`flex-1 p-2 rounded-lg border-2 text-center text-sm transition-all flex items-center justify-center gap-1 ${transForm.tipoOrigem === 'central' ? 'border-[#1B2A4A] bg-[#1B2A4A]/5' : 'border-gray-200'} ${!canWriteCentral ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}>
                    {!canWriteCentral && <Lock className="h-3 w-3" />} 🏢 Almoxarifado Central
                  </button>
                  <button type="button" onClick={() => setTransForm(f => ({ ...f, tipoOrigem: 'obra' }))}
                    className={`flex-1 p-2 rounded-lg border-2 text-center text-sm transition-all ${transForm.tipoOrigem === 'obra' ? 'border-[#1B2A4A] bg-[#1B2A4A]/5' : 'border-gray-200'}`}>
                    🏗️ Obra
                  </button>
                </div>
                {!canWriteCentral && (
                  <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1"><Lock className="h-3 w-3" /> Almoxarifado Central é exclusivo de administradores. Você transfere entre as obras que gerencia.</p>
                )}
              </div>

              {transForm.tipoOrigem === 'obra' && (
                <div>
                  <Label>Obra de Origem *</Label>
                  <Select value={transForm.origemObraId || undefined} onValueChange={v => setTransForm(f => ({ ...f, origemObraId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a obra de origem..." /></SelectTrigger>
                    <SelectContent>
                      {obrasPermitidas.map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Destino *</Label>
                <div className="flex gap-2 mt-1">
                  <button type="button" onClick={() => setTransForm(f => ({ ...f, tipoDestino: 'obra', destinoObraId: '' }))}
                    className={`flex-1 p-2 rounded-lg border-2 text-center text-sm transition-all ${transForm.tipoDestino === 'obra' ? 'border-[#1B2A4A] bg-[#1B2A4A]/5' : 'border-gray-200'}`}>
                    🏗️ Obra
                  </button>
                  {(() => {
                    const centralDestDisabled = !canWriteCentral || transForm.tipoOrigem === 'central';
                    return (
                      <button type="button" disabled={centralDestDisabled}
                        onClick={() => {
                          if (!canWriteCentral) return toast.error('Almoxarifado Central disponível apenas para administradores.');
                          if (transForm.tipoOrigem === 'central') return toast.error('Não é possível transferir do Central para o Central.');
                          setTransForm(f => ({ ...f, tipoDestino: 'central', destinoObraId: '' }));
                        }}
                        title={!canWriteCentral ? 'Apenas administradores podem usar o Almoxarifado Central' : (transForm.tipoOrigem === 'central' ? 'Origem e destino não podem ser o Central' : undefined)}
                        className={`flex-1 p-2 rounded-lg border-2 text-center text-sm transition-all flex items-center justify-center gap-1 ${transForm.tipoDestino === 'central' ? 'border-[#1B2A4A] bg-[#1B2A4A]/5' : 'border-gray-200'} ${centralDestDisabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}>
                        {!canWriteCentral && <Lock className="h-3 w-3" />} 🏢 Almoxarifado Central
                      </button>
                    );
                  })()}
                </div>
              </div>

              {transForm.tipoDestino === 'obra' && (
                <div>
                  <Label>Obra de Destino *</Label>
                  <Select value={transForm.destinoObraId || undefined} onValueChange={v => setTransForm(f => ({ ...f, destinoObraId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a obra de destino..." /></SelectTrigger>
                    <SelectContent>
                      {obrasPermitidas.filter((o: any) => String(o.id) !== transForm.origemObraId).map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={transForm.data} onChange={e => setTransForm(f => ({ ...f, data: e.target.value }))} />
                </div>
                <div>
                  <Label>Observações</Label>
                  <Input value={transForm.observacoes} onChange={e => setTransForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Motivo..." />
                </div>
              </div>

              {transItens.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-[#1B2A4A] text-white px-3 py-1.5 text-sm font-semibold flex items-center gap-2">
                    <ArrowLeftRight className="h-3.5 w-3.5" /> EPIs para Transferência ({transItens.length})
                  </div>
                  <div className="divide-y">
                    {transItens.map((item) => {
                      const epi = episAllList.find((e: any) => String(e.id) === item.epiId);
                      if (!epi) return null;
                      return (
                        <div key={item.epiId} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50">
                          {epi.fotoUrl ? (
                            <img src={epi.fotoUrl} alt={epi.nome} className="w-8 h-8 rounded object-cover border flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center border flex-shrink-0"><HardHat className="h-3.5 w-3.5 text-gray-400" /></div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{epi.nome}{epi.tamanho ? ` (${epi.tamanho})` : ""}</p>
                            {epi.ca && <p className="text-xs text-gray-500">CA: {epi.ca}</p>}
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => setTransItens(prev => prev.map(i => i.epiId === item.epiId ? { ...i, quantidade: Math.max(1, i.quantidade - 1) } : i))} className="w-6 h-6 rounded border flex items-center justify-center hover:bg-gray-100"><Minus className="h-3 w-3" /></button>
                            <Input type="number" min={1} value={item.quantidade} onChange={e => setTransItens(prev => prev.map(i => i.epiId === item.epiId ? { ...i, quantidade: Math.max(1, parseInt(e.target.value) || 1) } : i))} className="w-14 h-6 text-center text-sm px-1" />
                            <button type="button" onClick={() => setTransItens(prev => prev.map(i => i.epiId === item.epiId ? { ...i, quantidade: i.quantidade + 1 } : i))} className="w-6 h-6 rounded border flex items-center justify-center hover:bg-gray-100"><Plus className="h-3 w-3" /></button>
                          </div>
                          <button type="button" onClick={() => setTransItens(prev => prev.filter(i => i.epiId !== item.epiId))} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 space-y-2">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Plus className="h-4 w-4" /> Adicionar EPI</p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Popover open={epiPickerOpen} onOpenChange={setEpiPickerOpen}>
                      <PopoverTrigger asChild>
                        <button type="button" className="w-full flex items-center gap-2 border rounded-md px-3 py-2 text-sm text-left hover:bg-muted/30 transition-colors">
                          {transForm.epiId ? (() => {
                            const sel = episAllList.find((e: any) => String(e.id) === transForm.epiId);
                            return sel ? <span className="truncate">{sel.nome}{sel.tamanho ? ` (${sel.tamanho})` : ''}</span> : <span className="text-muted-foreground">Selecione...</span>;
                          })() : <span className="text-muted-foreground flex-1">Selecione o EPI...</span>}
                          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[420px] p-0" align="start">
                        <div className="flex items-center border-b px-3 py-2 gap-2">
                          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                          <input autoFocus value={epiPickerSearch} onChange={e => setEpiPickerSearch(e.target.value)} placeholder="Buscar por nome, tamanho, CA..." className="flex-1 text-sm outline-none bg-transparent placeholder:text-muted-foreground" />
                          {epiPickerSearch && <button type="button" onClick={() => setEpiPickerSearch("")} className="text-muted-foreground hover:text-foreground"><XIcon className="h-3.5 w-3.5" /></button>}
                        </div>
                        <div className="max-h-[320px] overflow-y-auto p-1">
                          {episAllList
                            .filter((e: any) => !transItens.some(i => i.epiId === String(e.id)))
                            .filter((e: any) => {
                              if (!epiPickerSearch.trim()) return true;
                              const term = epiPickerSearch.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                              const text = `${e.nome} ${e.tamanho || ''} ${e.ca || ''}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                              return text.includes(term);
                            })
                            .map((e: any) => (
                              <button key={e.id} type="button" onClick={() => { setTransForm(f => ({ ...f, epiId: String(e.id) })); setEpiPickerOpen(false); setEpiPickerSearch(""); }}
                                className={`w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent text-left transition-colors ${String(e.id) === transForm.epiId ? "bg-accent" : ""}`}>
                                {e.fotoUrl ? <img src={e.fotoUrl} alt={e.nome} className="h-10 w-10 rounded object-cover border flex-shrink-0" /> : <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center flex-shrink-0"><HardHat className="h-4 w-4 text-muted-foreground" /></div>}
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{e.nome}</p>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                    {e.tamanho && <span className="text-xs text-blue-700 font-semibold">Tam: {e.tamanho}</span>}
                                    {e.ca && <span className="text-xs text-muted-foreground">CA: {e.ca}</span>}
                                    {(() => {
                                      const d = dispOrigem(String(e.id));
                                      const v = d == null ? Number(e.quantidadeEstoque ?? 0) : d;
                                      const lbl = d == null ? 'Central' : 'Disponível';
                                      return <span className={`text-xs font-medium ${v === 0 ? "text-red-600" : "text-green-700"}`}>{lbl}: {v}</span>;
                                    })()}
                                  </div>
                                </div>
                              </button>
                            ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="w-20">
                    <Input type="number" min={1} value={transForm.quantidade} onChange={e => setTransForm(f => ({ ...f, quantidade: parseInt(e.target.value) || 1 }))} placeholder="Qtd" />
                  </div>
                  <Button type="button" size="sm" onClick={addTransItem} disabled={!transForm.epiId} className="bg-green-600 hover:bg-green-700 h-9">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {transForm.epiId && (() => {
                  const d = dispOrigem(transForm.epiId);
                  if (d == null) return <p className="text-[11px] text-amber-600">Selecione a obra de origem para ver o estoque disponível.</p>;
                  const falta = d < transForm.quantidade;
                  return <p className={`text-[11px] ${falta ? 'text-red-600 font-medium' : 'text-gray-500'}`}>Disponível na origem: {d}{falta ? ` — maior que a quantidade pedida (${transForm.quantidade})` : ''}</p>;
                })()}
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setShowTransferDialog(false); resetTransForm(); }}>Cancelar</Button>
                <Button className="flex-1 bg-[#1B2A4A] hover:bg-[#243660]" disabled={transSaving || (transItens.length === 0 && !transForm.epiId)}
                  onClick={handleSubmitTransfer}>
                  {transSaving ? 'Transferindo...' : `Transferir ${transItens.length > 0 ? transItens.length + (transForm.epiId ? 1 : 0) : 1} EPI(s)`}
                </Button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

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
                    {(episAllList || []).map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.nome}{e.tamanho ? ` (Tam: ${e.tamanho})` : ''} {e.ca ? `(CA ${e.ca})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Obra *</Label>
                <Select value={entradaDiretaForm.obraId} onValueChange={v => setEntradaDiretaForm(f => ({ ...f, obraId: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecione a obra..." /></SelectTrigger>
                  <SelectContent>
                    {obrasPermitidas.map((o: any) => (
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

      {/* Dialog de Ajuste de Estoque na Obra (Rev. 2928) — caixa da obra independente do central */}
      {ajusteObraRow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-[#1B3A5C] mb-1 flex items-center gap-2">
              <Warehouse className="h-5 w-5 text-[#1B2A4A]" /> Ajustar Estoque na Obra
            </h3>
            <p className="text-sm text-muted-foreground mb-4">Corrige a quantidade física deste EPI <strong>nesta obra</strong>.</p>
            <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1 mb-3">
              <p><span className="text-muted-foreground">Obra:</span> <span className="font-medium">{ajusteObraRow.nomeObra || 'Obra #' + ajusteObraRow.obraId}</span></p>
              <p>
                <span className="text-muted-foreground">EPI:</span>{' '}
                <span className="font-medium">
                  {ajusteObraRow.nomeEpi || 'EPI #' + ajusteObraRow.epiId}
                  {ajusteObraRow.tamanhoEpi ? (ajusteObraRow.categoriaEpi === 'Calcado' ? ` (Nº ${ajusteObraRow.tamanhoEpi})` : ` (Tam. ${ajusteObraRow.tamanhoEpi})`) : ''}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">Estoque atual nesta obra: <span className="font-semibold text-foreground">{ajusteObraRow.quantidade ?? 0}</span></p>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 mb-3">
              Este ajuste altera <strong>somente o estoque desta obra</strong>. O Almoxarifado Central <strong>não</strong> é afetado.
            </div>
            <div>
              <Label>Nova quantidade *</Label>
              <Input type="number" min="0" value={ajusteObraQtd} autoFocus
                onChange={e => setAjusteObraQtd(e.target.value)} placeholder="Ex: 12" />
            </div>
            <div className="flex gap-3 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => { setAjusteObraRow(null); setAjusteObraQtd(""); }}>
                Cancelar
              </Button>
              <Button className="flex-1 bg-[#1B2A4A] hover:bg-[#243660]"
                disabled={ajustarEstoqueObraMut.isPending || ajusteObraQtd === "" || isNaN(parseInt(ajusteObraQtd)) || parseInt(ajusteObraQtd) < 0}
                onClick={() => ajustarEstoqueObraMut.mutate({ id: ajusteObraRow.id, quantidade: parseInt(ajusteObraQtd), epiId: ajusteObraRow.epiId, obraId: ajusteObraRow.obraId })}>
                {ajustarEstoqueObraMut.isPending ? 'Salvando...' : 'Salvar Ajuste'}
              </Button>
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
      {viewMode === "necessidade" && <EpiNecessidade companyId={queryCompanyId} companyIds={isConstrutoras ? companyIds : undefined} readOnly={readOnly} aggregate={isConstrutoras} />}
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
