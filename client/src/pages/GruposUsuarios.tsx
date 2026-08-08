import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import {
  Users, Plus, Pencil, Trash2, Save, Shield, Eye, EyeOff,
  ChevronRight, Settings, UserPlus, UserMinus, Search, X, Check,
  LayoutDashboard, Building2, HardHat, FileText, Clock, Wallet,
  FolderOpen, Briefcase, Layers, Landmark, AlertTriangle, Palmtree,
  BarChart3, Gavel, Scale, ShieldCheck, Globe, Receipt, CheckCircle,
  Store, CreditCard, Star, TrendingUp, CalendarDays, UserSearch,
  Lock, Wifi, UtensilsCrossed, FileSignature, FileSpreadsheet, BookOpen,
  BellIcon, FileSearch, Handshake, ClipboardCheck, ClipboardList,
  Calculator, CalendarRange, ShoppingCart, Banknote, Package, GraduationCap,
  ArrowLeftRight, Warehouse, ListChecks, PieChart, FileBarChart2,
  FilePen, DollarSign, BarChart2, LineChart, Tag, Copy, ChevronDown,
  ChevronUp, Info, UserCog, ShieldAlert, CheckSquare, Square
} from "lucide-react";

const ALL_ROUTES = [
  { section: "RH & DP - Principal", color: "blue", routes: [{ path: "/painel/rh", label: "Painel RH", icon: "LayoutDashboard" }] },
  { section: "RH & DP - Cadastro", color: "blue", routes: [
    { path: "/empresas", label: "Empresas", icon: "Building2" },
    { path: "/colaboradores", label: "Colaboradores", icon: "Users" },
    { path: "/obras", label: "Obras", icon: "Landmark" },
    { path: "/obras/efetivo", label: "Efetivo por Obra", icon: "HardHat" },
    { path: "/setores", label: "Setores", icon: "Layers" },
    { path: "/funcoes", label: "Funções", icon: "Briefcase" },
    { path: "/relogios-ponto", label: "Relógios de Ponto", icon: "Wifi" },
    { path: "/convencoes-coletivas", label: "Convenções Coletivas", icon: "Scale" },
    { path: "/contas-bancarias", label: "Contas Bancárias", icon: "ClipboardList" },
  ]},
  { section: "RH & DP - Operacional", color: "blue", routes: [
    { path: "/fechamento-ponto", label: "Fechamento de Ponto", icon: "Clock" },
    { path: "/folha-pagamento", label: "Folha de Pagamento", icon: "Wallet" },
    { path: "/controle-documentos", label: "Controle de Documentos", icon: "FolderOpen" },
    { path: "/vale-alimentacao", label: "Vale Alimentação", icon: "UtensilsCrossed" },
    { path: "/solicitacao-he", label: "Solicitação de Hora Extra", icon: "Clock" },
    { path: "/apontamentos-campo", label: "Apontamentos de Campo", icon: "ClipboardList" },
    { path: "/crachas", label: "Crachás", icon: "CreditCard" },
    { path: "/aviso-previo", label: "Aviso Prévio", icon: "AlertTriangle" },
    { path: "/ferias", label: "Férias", icon: "Palmtree" },
    { path: "/modulo-pj", label: "Contratos de Prestadores", icon: "FileSignature" },
    { path: "/pj-medicoes", label: "PJ Medições", icon: "FileSpreadsheet" },
    { path: "/feriados", label: "Feriados", icon: "CalendarDays" },
    { path: "/dissidio", label: "Dissídio", icon: "TrendingUp" },
  ]},
  { section: "RH & DP - Dashboards e Relatórios", color: "indigo", routes: [
    { path: "/dashboards/funcionarios", label: "Dashboard Funcionários", icon: "Users" },
    { path: "/dashboards/cartao-ponto", label: "Dashboard Cartão de Ponto", icon: "Clock" },
    { path: "/dashboards/folha-pagamento", label: "Dashboard Folha de Pagamento", icon: "Wallet" },
    { path: "/dashboards/horas-extras", label: "Dashboard Horas Extras", icon: "Clock" },
    { path: "/dashboards/aviso-previo", label: "Dashboard Aviso Prévio", icon: "AlertTriangle" },
    { path: "/dashboards/ferias", label: "Dashboard Férias", icon: "Palmtree" },
    { path: "/dashboards/efetivo-obra", label: "Dashboard Efetivo por Obra", icon: "Building2" },
    { path: "/dashboards/perfil-tempo-casa", label: "Dashboard Perfil Tempo de Casa", icon: "UserSearch" },
    { path: "/dashboards/controle-documentos", label: "Dashboard Controle de Documentos", icon: "ShieldCheck" },
    { path: "/dashboards/apontamentos", label: "Dashboard Apontamentos de Campo", icon: "ClipboardList" },
    { path: "/dashboards/visao-panoramica", label: "Dashboard Visão Panorâmica", icon: "BarChart3" },
    { path: "/relatorios/raio-x", label: "Raio-X do Funcionário", icon: "UserSearch" },
    { path: "/relatorios/ponto", label: "Relatório de Ponto", icon: "Clock" },
    { path: "/relatorios/folha", label: "Relatório de Folha", icon: "FileText" },
    { path: "/relatorios/divergencias", label: "Relatório de Divergências", icon: "AlertTriangle" },
    { path: "/relatorios/custo-obra", label: "Relatório Custo por Obra", icon: "Landmark" },
    { path: "/comparativo-convencoes", label: "Comparativo Convenções", icon: "Scale" },
  ]},
  { section: "SST - Segurança do Trabalho", color: "green", routes: [
    { path: "/painel/sst", label: "Painel SST", icon: "LayoutDashboard" },
    { path: "/epis", label: "Controle de EPIs", icon: "HardHat" },
    { path: "/cipa", label: "CIPA", icon: "Shield" },
    { path: "/dashboards/epis", label: "Dashboard EPIs", icon: "BarChart3" },
  ]},
  { section: "Jurídico", color: "amber", routes: [
    { path: "/painel/juridico", label: "Painel Jurídico", icon: "LayoutDashboard" },
    { path: "/processos-trabalhistas", label: "Processos Trabalhistas", icon: "Gavel" },
    { path: "/dashboards/juridico", label: "Dashboard Jurídico", icon: "BarChart3" },
  ]},
  { section: "Avaliação de Desempenho", color: "yellow", routes: [
    { path: "/avaliacao-desempenho", label: "Avaliação de Desempenho", icon: "Star" },
    { path: "/dashboards/competencias", label: "Dashboard Competências", icon: "BarChart3" },
  ]},
  { section: "Habilidades e Capacitações", color: "sky", routes: [
    { path: "/habilidades", label: "Habilidades", icon: "GraduationCap" },
    { path: "/habilidades/importacao", label: "Importação de Habilidades", icon: "FileBarChart2" },
    { path: "/relatorios/habilidades-obra", label: "Relatório Habilidades por Obra", icon: "ClipboardList" },
    { path: "/dashboards/habilidades", label: "Dashboard Habilidades", icon: "BarChart3" },
  ]},
  { section: "Orçamento", color: "teal", routes: [
    { path: "/orcamento/painel", label: "Painel de Orçamentos", icon: "LayoutDashboard" },
    { path: "/orcamento/lista", label: "Lista de Orçamentos", icon: "ClipboardList" },
    { path: "/orcamento/importar", label: "Importar Planilha", icon: "FileBarChart2" },
    { path: "/orcamento/biblioteca", label: "Biblioteca de Preços", icon: "BookOpen" },
  ]},
  { section: "Planejamento de Obras", color: "violet", routes: [
    { path: "/planejamento", label: "Lista de Planejamentos", icon: "CalendarRange" },
  ]},
  { section: "Compras", color: "rose", routes: [
    { path: "/compras/painel", label: "Painel de Compras", icon: "LayoutDashboard" },
    { path: "/compras/solicitacoes", label: "Solicitações de Compra", icon: "ClipboardList" },
    { path: "/compras/cotacoes", label: "Cotações", icon: "FileText" },
    { path: "/compras/ordens", label: "Ordens (OC / OS)", icon: "ShoppingCart" },
    { path: "/compras/recebimentos", label: "Recebimentos", icon: "Package" },
    { path: "/compras/fornecedores", label: "Fornecedores", icon: "Store" },
    { path: "/compras/aprovacoes", label: "Aprovações", icon: "CheckCircle" },
    { path: "/compras/emergencial", label: "Compra Emergencial", icon: "AlertTriangle" },

    { path: "/compras/realocacao", label: "Realocação de Itens", icon: "ArrowLeftRight" },
  ]},
  { section: "Almoxarifado", color: "orange", routes: [
    { path: "/almoxarifado", label: "Painel do Almoxarifado", icon: "LayoutDashboard" },
    { path: "/almoxarifado/movimentacoes", label: "Movimentações", icon: "ArrowLeftRight" },
    { path: "/almoxarifado/inventario", label: "Inventário Semanal", icon: "ClipboardCheck" },
    { path: "/almoxarifado/categorias", label: "Categorias de Materiais", icon: "Tag" },
  ]},
  { section: "Financeiro", color: "emerald", routes: [
    { path: "/financeiro", label: "Painel Financeiro", icon: "LayoutDashboard" },
    { path: "/financeiro/lancamentos", label: "Lançamentos", icon: "Receipt" },
    { path: "/financeiro/contas-a-receber", label: "Previsão de Faturamento", icon: "TrendingUp" },
    { path: "/financeiro/contas-a-pagar", label: "Contas a Pagar", icon: "Wallet" },
    { path: "/financeiro/contas-a-receber", label: "Previsão de Faturamento", icon: "Banknote" },
    { path: "/financeiro/dre", label: "DRE", icon: "BarChart2" },
    { path: "/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", icon: "LineChart" },
    { path: "/financeiro/obrigacoes-fiscais", label: "Obrigações Fiscais", icon: "FileText" },
    { path: "/financeiro/plano-de-contas", label: "Plano de Contas", icon: "ListChecks" },
    { path: "/financeiro/categorias", label: "Categorias", icon: "Tag" },
    { path: "/financeiro/centros-de-custo", label: "Centros de Custo", icon: "Layers" },
    { path: "/financeiro/conciliacao", label: "Conciliação Bancária", icon: "Scale" },
    { path: "/financeiro/recorrentes", label: "Recorrentes", icon: "Repeat" },
  ]},
  { section: "Terceiros - Gestão", color: "orange", routes: [
    { path: "/terceiros/painel", label: "Painel Terceiros", icon: "LayoutDashboard" },
    { path: "/terceiros/empresas", label: "Empresas Terceiras", icon: "Building2" },
    { path: "/terceiros/funcionarios", label: "Funcionários Terceiros", icon: "Users" },
    { path: "/terceiros/obrigacoes", label: "Obrigações Mensais", icon: "ClipboardCheck" },
    { path: "/terceiros/conformidade", label: "Painel de Conformidade", icon: "ShieldCheck" },
    { path: "/terceiros/alertas", label: "Alertas e Cobranças", icon: "BellIcon" },
    { path: "/terceiros/portal", label: "Portal Externo", icon: "Globe" },
    { path: "/terceiros/validacao-ia", label: "Validação IA de Docs", icon: "FileSearch" },
  ]},
  { section: "Terceiros - Contratos", color: "orange", routes: [
    { path: "/terceiros/contratos", label: "Contratos de Terceiros", icon: "FileSignature" },
    { path: "/terceiros/medicoes", label: "Medições de Contratos", icon: "ClipboardList" },
    { path: "/terceiros/previsao-caixa", label: "Previsão de Caixa", icon: "LineChart" },
  ]},
  { section: "Parceiros Conveniados", color: "purple", routes: [
    { path: "/parceiros/painel", label: "Painel Parceiros", icon: "LayoutDashboard" },
    { path: "/parceiros/cadastro", label: "Parceiros Conveniados", icon: "Store" },
    { path: "/parceiros/lancamentos", label: "Lançamentos", icon: "Receipt" },
    { path: "/parceiros/aprovacoes", label: "Aprovações RH", icon: "CheckCircle" },
    { path: "/parceiros/guia-descontos", label: "Guia de Descontos", icon: "FileText" },
    { path: "/parceiros/pagamentos", label: "Pagamentos", icon: "Wallet" },
  ]},
  { section: "Operacional", color: "cyan", routes: [
    { path: "/operacional/painel", label: "Dashboard Operacional", icon: "LayoutDashboard" },
    { path: "/operacional/rdo", label: "RDO", icon: "ClipboardList" },
    { path: "/operacional/checklists", label: "Checklists", icon: "ClipboardCheck" },
    { path: "/operacional/concretagem", label: "Concretagem", icon: "HardHat" },
    { path: "/operacional/nc", label: "Não Conformidades", icon: "AlertTriangle" },
    { path: "/operacional/fotos", label: "Registro Fotográfico", icon: "FileSearch" },
  ]},
  { section: "Proj./Doc. Técnicos", color: "sky", routes: [
    { path: "/gestao-documentos", label: "Documentos", icon: "FolderOpen" },
  ]},
  { section: "Frotas", color: "cyan", routes: [
    { path: "/frotas/painel", label: "Dashboard Frotas", icon: "LayoutDashboard" },
    { path: "/frotas/veiculos", label: "Veículos", icon: "Truck" },
    { path: "/frotas/manutencoes", label: "Manutenções", icon: "Wrench" },
    { path: "/frotas/combustivel", label: "Combustível", icon: "Fuel" },
    { path: "/frotas/multas", label: "Multas", icon: "AlertTriangle" },
    { path: "/frotas/ipva", label: "IPVA", icon: "Receipt" },
    { path: "/frotas/licenciamento", label: "Licenciamento", icon: "FileText" },
    { path: "/frotas/seguros", label: "Seguros", icon: "Shield" },
    { path: "/frotas/rastreamento", label: "Rastreamento", icon: "MapPin" },
    { path: "/frotas/analitico", label: "Analítico", icon: "BarChart3" },
  ]},
  { section: "Geral", color: "slate", routes: [
    { path: "/ajuda", label: "Biblioteca de Conhecimento", icon: "BookOpen" },
    { path: "/revisoes", label: "Revisões do Sistema", icon: "FileText" },
  ]},
];

const sectionColorMap: Record<string, { bg: string; border: string; text: string; headerBg: string; dot: string }> = {
  blue:    { bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-700",    headerBg: "bg-blue-100",    dot: "bg-blue-500" },
  indigo:  { bg: "bg-indigo-50",  border: "border-indigo-200",  text: "text-indigo-700",  headerBg: "bg-indigo-100",  dot: "bg-indigo-500" },
  green:   { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", headerBg: "bg-emerald-100", dot: "bg-emerald-500" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", headerBg: "bg-emerald-100", dot: "bg-emerald-500" },
  amber:   { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   headerBg: "bg-amber-100",   dot: "bg-amber-500" },
  yellow:  { bg: "bg-yellow-50",  border: "border-yellow-200",  text: "text-yellow-700",  headerBg: "bg-yellow-100",  dot: "bg-yellow-500" },
  orange:  { bg: "bg-orange-50",  border: "border-orange-200",  text: "text-orange-700",  headerBg: "bg-orange-100",  dot: "bg-orange-500" },
  rose:    { bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-700",    headerBg: "bg-rose-100",    dot: "bg-rose-500" },
  purple:  { bg: "bg-purple-50",  border: "border-purple-200",  text: "text-purple-700",  headerBg: "bg-purple-100",  dot: "bg-purple-500" },
  violet:  { bg: "bg-violet-50",  border: "border-violet-200",  text: "text-violet-700",  headerBg: "bg-violet-100",  dot: "bg-violet-500" },
  teal:    { bg: "bg-teal-50",    border: "border-teal-200",    text: "text-teal-700",    headerBg: "bg-teal-100",    dot: "bg-teal-500" },
  sky:     { bg: "bg-sky-50",     border: "border-sky-200",     text: "text-sky-700",     headerBg: "bg-sky-100",     dot: "bg-sky-500" },
  slate:   { bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-700",   headerBg: "bg-slate-100",   dot: "bg-slate-500" },
  cyan:    { bg: "bg-cyan-50",    border: "border-cyan-200",    text: "text-cyan-700",    headerBg: "bg-cyan-100",    dot: "bg-cyan-500" },
};

type RoutePermission = {
  rota: string;
  canView: boolean;
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
  ocultarValores: boolean;
  ocultarDocumentos: boolean;
};

type Tab = "info" | "permissoes" | "membros";

const COLOR_OPTIONS = [
  { value: "#ef4444", label: "Vermelho" },
  { value: "#f59e0b", label: "Âmbar" },
  { value: "#10b981", label: "Verde" },
  { value: "#3b82f6", label: "Azul" },
  { value: "#6366f1", label: "Índigo" },
  { value: "#8b5cf6", label: "Roxo" },
  { value: "#ec4899", label: "Rosa" },
  { value: "#6b7280", label: "Cinza" },
  { value: "#f97316", label: "Laranja" },
  { value: "#14b8a6", label: "Teal" },
];

export default function GruposUsuarios() {
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const isAdmin = user?.role === "admin" || isMaster;

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("info");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showNewForm, setShowNewForm] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Edit / new form state
  const [editNome, setEditNome] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editCor, setEditCor] = useState("#6b7280");
  const [editSomenteVis, setEditSomenteVis] = useState(true);
  const [editOcultarDados, setEditOcultarDados] = useState(true);
  const [editAcessoTodasObras, setEditAcessoTodasObras] = useState(false);
  // Rev. 2207 — controla se o grupo enxerga o status "Aviso Prévio" do
  // colaborador (sigilo sensível). Default false: por padrão é oculto.
  const [editVerStatusAviso, setEditVerStatusAviso] = useState(false);

  // Permissions state
  const [routePerms, setRoutePerms] = useState<Record<string, RoutePermission>>({});
  const [permsDirty, setPermsDirty] = useState(false);

  // Member search
  const [memberSearch, setMemberSearch] = useState("");

  const utils = trpc.useUtils();

  const groupsQuery = trpc.userGroups.list.useQuery();
  const usersQuery = trpc.userManagement.listUsers.useQuery();
  const allMembersQuery = trpc.userGroups.listAllMembers.useQuery();

  const groupPermsQuery = trpc.userGroups.getPermissions.useQuery(
    { groupId: selectedGroupId ?? 0 },
    { enabled: !!selectedGroupId && activeTab === "permissoes" }
  );
  const groupMembersQuery = trpc.userGroups.getMembers.useQuery(
    { groupId: selectedGroupId ?? 0 },
    { enabled: !!selectedGroupId && activeTab === "membros" }
  );

  const createMut = trpc.userGroups.create.useMutation({
    onSuccess: () => {
      toast.success("Grupo criado com sucesso!");
      setShowNewForm(false);
      setEditNome(""); setEditDescricao(""); setEditCor("#6b7280");
      setEditSomenteVis(true); setEditOcultarDados(true); setEditAcessoTodasObras(false); setEditVerStatusAviso(false);
      utils.userGroups.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.userGroups.update.useMutation({
    onSuccess: () => { toast.success("Grupo salvo!"); utils.userGroups.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.userGroups.delete.useMutation({
    onSuccess: () => {
      toast.success("Grupo excluído!");
      setSelectedGroupId(null);
      setSelectedIds(new Set());
      utils.userGroups.list.invalidate();
      utils.userGroups.listAllMembers.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteManyMut = trpc.userGroups.deleteMany.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.deleted} grupo${r.deleted !== 1 ? 's' : ''} excluído${r.deleted !== 1 ? 's' : ''}!`);
      setSelectedIds(new Set());
      if (selectedGroupId && selectedIds.has(selectedGroupId)) setSelectedGroupId(null);
      utils.userGroups.list.invalidate();
      utils.userGroups.listAllMembers.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteDupsMut = trpc.userGroups.deleteDuplicates.useMutation({
    onSuccess: (r) => {
      if (r.deleted === 0) toast.info("Nenhum grupo duplicado encontrado.");
      else toast.success(`${r.deleted} grupo${r.deleted !== 1 ? 's' : ''} duplicado${r.deleted !== 1 ? 's' : ''} removido${r.deleted !== 1 ? 's' : ''}!`);
      utils.userGroups.list.invalidate();
      utils.userGroups.listAllMembers.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const setPermsMut = trpc.userGroups.setPermissions.useMutation({
    onSuccess: () => {
      toast.success("Permissões salvas!");
      setPermsDirty(false);
      utils.userGroups.getPermissions.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const addMemberMut = trpc.userGroups.addMember.useMutation({
    onSuccess: () => {
      utils.userGroups.getMembers.invalidate();
      utils.userGroups.listAllMembers.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMemberMut = trpc.userGroups.removeMember.useMutation({
    onSuccess: () => {
      utils.userGroups.getMembers.invalidate();
      utils.userGroups.listAllMembers.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const groups = groupsQuery.data ?? [];
  const selectedGroup = groups.find((g: any) => g.id === selectedGroupId) ?? null;

  // Member counts per group
  const memberCountMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const row of (allMembersQuery.data ?? [])) {
      const gid = (row as any).groupId;
      map[gid] = (map[gid] ?? 0) + 1;
    }
    return map;
  }, [allMembersQuery.data]);

  // Map userId → { groupId, groupName } para regra de 1 grupo por usuário
  const userToGroupMap = useMemo(() => {
    const map: Record<number, { groupId: number; groupName: string }> = {};
    for (const row of (allMembersQuery.data ?? [])) {
      const gid = (row as any).groupId;
      const uid = (row as any).userId;
      const gName = groups.find((g: any) => g.id === gid)?.nome ?? "Grupo desconhecido";
      map[uid] = { groupId: gid, groupName: gName };
    }
    return map;
  }, [allMembersQuery.data, groups]);

  const filteredGroups = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return groups;
    return groups.filter((g: any) => (g.nome || "").toLowerCase().includes(term));
  }, [groups, searchTerm]);

  // Load permissions when tab opens
  useEffect(() => {
    if (activeTab === "permissoes" && selectedGroupId) {
      setRoutePerms({});
      setPermsDirty(false);
    }
  }, [activeTab, selectedGroupId]);

  useEffect(() => {
    if (groupPermsQuery.data && activeTab === "permissoes" && !permsDirty) {
      const map: Record<string, RoutePermission> = {};
      for (const p of groupPermsQuery.data) map[p.rota] = p;
      setRoutePerms(map);
    }
  }, [groupPermsQuery.data]);

  // Load group data into edit form when selected
  const selectGroup = (g: any) => {
    setSelectedGroupId(g.id);
    setActiveTab("info");
    setEditNome(g.nome);
    setEditDescricao(g.descricao || "");
    setEditCor(g.cor || "#6b7280");
    setEditSomenteVis(g.somenteVisualizacao);
    setEditOcultarDados(g.ocultarDadosSensiveis);
    setEditAcessoTodasObras(!!g.acessoTodasObras);
    setEditVerStatusAviso(!!g.verStatusAviso);
    setShowNewForm(false);
    setMemberSearch("");
  };

  // Permission helpers
  const toggleRoutePerm = (path: string, field: keyof RoutePermission) => {
    setPermsDirty(true);
    setRoutePerms(prev => {
      const existing = prev[path] || { rota: path, canView: false, canEdit: false, canCreate: false, canDelete: false, ocultarValores: false, ocultarDocumentos: false };
      const updated = { ...existing, [field]: !(existing as any)[field] };
      if (field === 'canView' && !updated.canView) { updated.canEdit = false; updated.canCreate = false; updated.canDelete = false; }
      if ((field === 'canEdit' || field === 'canCreate' || field === 'canDelete') && updated[field]) updated.canView = true;
      return { ...prev, [path]: updated };
    });
  };

  const toggleSectionView = (sectionRoutes: { path: string }[], enable: boolean) => {
    setPermsDirty(true);
    setRoutePerms(prev => {
      const updated = { ...prev };
      for (const r of sectionRoutes) {
        if (enable) {
          updated[r.path] = { ...(updated[r.path] || { rota: r.path, canView: false, canEdit: false, canCreate: false, canDelete: false, ocultarValores: false, ocultarDocumentos: false }), canView: true };
        } else {
          updated[r.path] = { rota: r.path, canView: false, canEdit: false, canCreate: false, canDelete: false, ocultarValores: false, ocultarDocumentos: false };
        }
      }
      return updated;
    });
  };

  const toggleColumnAll = (sectionRoutes: { path: string }[], field: keyof RoutePermission, enable: boolean) => {
    setPermsDirty(true);
    setRoutePerms(prev => {
      const updated = { ...prev };
      for (const r of sectionRoutes) {
        const existing = updated[r.path] || { rota: r.path, canView: false, canEdit: false, canCreate: false, canDelete: false, ocultarValores: false, ocultarDocumentos: false };
        const newPerm = { ...existing, [field]: enable };
        if (enable && (field === 'canEdit' || field === 'canCreate' || field === 'canDelete')) newPerm.canView = true;
        if (field === 'canView' && !enable) { newPerm.canEdit = false; newPerm.canCreate = false; newPerm.canDelete = false; }
        updated[r.path] = newPerm;
      }
      return updated;
    });
  };

  const savePermissions = () => {
    if (!selectedGroupId) return;
    const perms = Object.values(routePerms).filter(p => p.canView);
    setPermsMut.mutate({ groupId: selectedGroupId, permissions: perms });
  };

  const enabledRouteCount = Object.values(routePerms).filter(p => p.canView).length;
  const totalRouteCount = ALL_ROUTES.reduce((acc, s) => acc + s.routes.length, 0);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredGroups.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredGroups.map((g: any) => g.id)));
    }
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Members for current group
  const memberIds = useMemo(() => new Set((groupMembersQuery.data || []).map((m: any) => m.userId)), [groupMembersQuery.data]);
  const allUsers = usersQuery.data ?? [];
  const filteredUsersForMembers = useMemo(() => {
    const term = memberSearch.toLowerCase().trim();
    if (!term) return allUsers;
    return allUsers.filter((u: any) => (u.name || "").toLowerCase().includes(term) || (u.username || "").toLowerCase().includes(term));
  }, [allUsers, memberSearch]);

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  };

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden -m-6">

        {/* ─── LEFT SIDEBAR ───────────────────────────────────────────── */}
        <div className="w-72 min-w-[260px] flex flex-col border-r bg-white">
          {/* Sidebar header */}
          <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-300" />
              <span className="font-semibold text-sm">Grupos de Acesso</span>
              <span className="bg-blue-500/30 text-blue-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {groups.length}
              </span>
            </div>
            {isAdmin && (
              <button
                onClick={() => { setShowNewForm(true); setSelectedGroupId(null); setEditNome(""); setEditDescricao(""); setEditCor("#6b7280"); setEditSomenteVis(true); setEditOcultarDados(true); setEditAcessoTodasObras(false); setEditVerStatusAviso(false); }}
                className="h-7 w-7 rounded-lg bg-green-500 hover:bg-green-400 flex items-center justify-center transition-colors"
                title="Novo Grupo"
              >
                <Plus className="h-4 w-4 text-white" />
              </button>
            )}
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                placeholder="Buscar grupo..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Bulk actions */}
          {selectedIds.size > 0 && isAdmin && (
            <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center justify-between shrink-0">
              <span className="text-xs font-medium text-red-700">{selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}</span>
              <button
                onClick={() => {
                  if (confirm(`Excluir ${selectedIds.size} grupo${selectedIds.size !== 1 ? 's' : ''}? Esta ação não pode ser desfeita.`))
                    deleteManyMut.mutate({ ids: Array.from(selectedIds) });
                }}
                disabled={deleteManyMut.isPending}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Excluir selecionados
              </button>
            </div>
          )}

          {/* Select all row */}
          {filteredGroups.length > 0 && isAdmin && (
            <div className="px-3 py-1.5 border-b flex items-center gap-2 shrink-0 bg-slate-50">
              <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
                {selectedIds.size === filteredGroups.length && filteredGroups.length > 0
                  ? <CheckSquare className="h-3.5 w-3.5 text-blue-500" />
                  : <Square className="h-3.5 w-3.5" />}
                Selecionar todos
              </button>
            </div>
          )}

          {/* Group list */}
          <div className="flex-1 overflow-y-auto">
            {groupsQuery.isLoading ? (
              <div className="p-4 text-center text-sm text-slate-400">Carregando...</div>
            ) : filteredGroups.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-400">
                {searchTerm ? "Nenhum grupo encontrado" : "Nenhum grupo cadastrado"}
              </div>
            ) : (
              filteredGroups.map((g: any) => {
                const isSelected = g.id === selectedGroupId && !showNewForm;
                const isChecked = selectedIds.has(g.id);
                const memberCount = memberCountMap[g.id] ?? 0;
                return (
                  <div
                    key={g.id}
                    onClick={() => selectGroup(g)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-slate-100 group ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-slate-50 border-l-2 border-l-transparent'}`}
                  >
                    {isAdmin && (
                      <div onClick={(e) => toggleSelect(g.id, e)} className="shrink-0">
                        <Checkbox checked={isChecked} className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-bold shadow-sm" style={{ backgroundColor: g.cor || '#6b7280' }}>
                      {(g.nome || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>{g.nome}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Users className="h-2.5 w-2.5" />
                        {memberCount} membro{memberCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-colors ${isSelected ? 'text-blue-400' : 'text-slate-300 group-hover:text-slate-400'}`} />
                  </div>
                );
              })
            )}
          </div>

          {/* Footer actions */}
          {isAdmin && (
            <div className="px-3 py-2.5 border-t bg-slate-50 shrink-0 space-y-1.5">
              <button
                onClick={() => { if (confirm("Isso vai excluir grupos com nomes repetidos, mantendo apenas o primeiro de cada. Continuar?")) deleteDupsMut.mutate(); }}
                disabled={deleteDupsMut.isPending}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <Copy className="h-3 w-3" />
                {deleteDupsMut.isPending ? "Removendo..." : "Remover grupos duplicados"}
              </button>
            </div>
          )}
        </div>

        {/* ─── RIGHT PANEL ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

          {/* New group form */}
          {showNewForm ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-xl mx-auto">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-xl bg-green-500 flex items-center justify-center shadow">
                    <Plus className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">Novo Grupo de Acesso</h2>
                    <p className="text-sm text-slate-500">Configure as informações básicas do grupo</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nome do Grupo *</label>
                    <Input value={editNome} onChange={e => setEditNome(e.target.value)} placeholder="Ex: Gestor de Obras, Analista RH..." className="text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                    <Input value={editDescricao} onChange={e => setEditDescricao(e.target.value)} placeholder="Descreva as responsabilidades deste grupo..." className="text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Cor de identificação</label>
                    <div className="flex gap-2 flex-wrap">
                      {COLOR_OPTIONS.map(c => (
                        <button key={c.value} onClick={() => setEditCor(c.value)} title={c.label}
                          className={`h-8 w-8 rounded-full border-4 transition-all ${editCor === c.value ? 'border-slate-800 scale-110' : 'border-transparent hover:scale-105'}`}
                          style={{ backgroundColor: c.value }} />
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 pt-1">
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors">
                      <Checkbox checked={editSomenteVis} onCheckedChange={(c) => setEditSomenteVis(!!c)} className="mt-0.5" />
                      <div>
                        <span className="text-sm font-medium text-slate-800">Somente Visualização</span>
                        <p className="text-xs text-slate-500">Membros não podem criar, editar ou excluir registros</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors">
                      <Checkbox checked={editOcultarDados} onCheckedChange={(c) => setEditOcultarDados(!!c)} className="mt-0.5" />
                      <div>
                        <span className="text-sm font-medium text-slate-800">Ocultar Dados Sensíveis</span>
                        <p className="text-xs text-slate-500">Oculta salários, CPF, RG, dados bancários e valores financeiros</p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg border-2 border-blue-200 bg-blue-50/40 cursor-pointer hover:bg-blue-50 transition-colors">
                      <Checkbox checked={editAcessoTodasObras} onCheckedChange={(c) => setEditAcessoTodasObras(!!c)} className="mt-0.5" />
                      <div>
                        <span className="text-sm font-medium text-slate-800">🏗️ Acesso a todas as obras em andamento</span>
                        <p className="text-xs text-slate-500">Membros enxergam <strong>automaticamente</strong> todas as obras ativas (de qualquer empresa que tenham acesso), sem precisar liberar obra por obra. Ideal para o <strong>Escritório Central</strong> (Compras, Adm, Planejamento, Projetos, RH, Orçamento).</p>
                      </div>
                    </label>
                    {/* Rev. 2207 — sigilo opt-in do status "Aviso Prévio" */}
                    <label className="flex items-start gap-3 p-3 rounded-lg border-2 border-yellow-300 bg-yellow-50/40 cursor-pointer hover:bg-yellow-50 transition-colors">
                      <Checkbox checked={editVerStatusAviso} onCheckedChange={(c) => setEditVerStatusAviso(!!c)} className="mt-0.5" />
                      <div>
                        <span className="text-sm font-medium text-slate-800">⚠️ Ver Status de Aviso Prévio do colaborador</span>
                        <p className="text-xs text-slate-500">Por padrão o status <strong>"Aviso Prévio"</strong> é <strong>sigiloso</strong> — todos os usuários veem o colaborador como "Ativo". Marque esta opção para que membros deste grupo (geralmente <strong>RH/DP</strong>) consigam enxergar o badge real "Aviso Prévio" no badge da lista, KPI, ficha e PDF.</p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3 mt-5">
                  <Button variant="outline" onClick={() => setShowNewForm(false)} className="flex-1">Cancelar</Button>
                  <Button
                    onClick={() => {
                      if (!editNome.trim()) { toast.error("Nome é obrigatório"); return; }
                      createMut.mutate({ nome: editNome.trim(), descricao: editDescricao.trim() || undefined, cor: editCor, somenteVisualizacao: editSomenteVis, ocultarDadosSensiveis: editOcultarDados, acessoTodasObras: editAcessoTodasObras, verStatusAviso: editVerStatusAviso });
                    }}
                    disabled={createMut.isPending}
                    className="flex-1 bg-green-600 hover:bg-green-700 gap-2"
                  >
                    {createMut.isPending ? "Criando..." : <><Plus className="h-4 w-4" />Criar Grupo</>}
                  </Button>
                </div>
              </div>
            </div>
          ) : !selectedGroup ? (
            /* Empty state */
            <div className="flex-1 flex items-center justify-center flex-col gap-4 text-slate-400">
              <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Shield className="h-8 w-8 text-slate-300" />
              </div>
              <div className="text-center">
                <p className="text-base font-medium text-slate-600">Selecione um grupo para configurar</p>
                <p className="text-sm text-slate-400 mt-1">Clique em um grupo na lista para editar suas permissões e membros</p>
              </div>
              {isAdmin && (
                <Button onClick={() => { setShowNewForm(true); setEditNome(""); setEditDescricao(""); setEditCor("#6b7280"); setEditSomenteVis(true); setEditOcultarDados(true); setEditAcessoTodasObras(false); setEditVerStatusAviso(false); }} className="gap-2 bg-green-600 hover:bg-green-700 mt-2">
                  <Plus className="h-4 w-4" /> Criar Primeiro Grupo
                </Button>
              )}
            </div>
          ) : (
            /* Group detail panel */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Group header */}
              <div className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm" style={{ backgroundColor: selectedGroup.cor || '#6b7280' }}>
                    {(selectedGroup.nome || "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-800">{selectedGroup.nome}</h2>
                    <div className="flex items-center gap-2">
                      {selectedGroup.somenteVisualizacao ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Somente Visualização</span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Pode Editar</span>
                      )}
                      {selectedGroup.ocultarDadosSensiveis && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Oculta Dados Sensíveis</span>
                      )}
                      {selectedGroup.acessoTodasObras && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">🏗️ Todas as Obras</span>
                      )}
                    </div>
                  </div>
                </div>
                {isMaster && (
                  <button
                    onClick={() => { if (confirm(`Excluir grupo "${selectedGroup.nome}"? Todos os membros perderão as permissões.`)) deleteMut.mutate({ id: selectedGroup.id }); }}
                    disabled={deleteMut.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir Grupo
                  </button>
                )}
              </div>

              {/* Tabs */}
              <div className="bg-white border-b px-6 shrink-0">
                <div className="flex gap-0">
                  {([
                    { id: "info" as Tab, label: "Informações", icon: <Info className="h-3.5 w-3.5" /> },
                    { id: "permissoes" as Tab, label: `Permissões de Telas`, icon: <ShieldCheck className="h-3.5 w-3.5" />, badge: activeTab === "permissoes" ? `${enabledRouteCount}/${totalRouteCount}` : undefined },
                    { id: "membros" as Tab, label: "Membros", icon: <Users className="h-3.5 w-3.5" />, badge: activeTab === "membros" ? String(memberIds.size) : undefined },
                  ] as { id: Tab; label: string; icon: JSX.Element; badge?: string }[]).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                      {tab.icon}
                      {tab.label}
                      {tab.badge && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>{tab.badge}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto">

                {/* ── Tab: Info ────────────────────────────────────────── */}
                {activeTab === "info" && (
                  <div className="p-6 max-w-xl">
                    <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nome do Grupo</label>
                        <Input value={editNome} onChange={e => setEditNome(e.target.value)} className="text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                        <Input value={editDescricao} onChange={e => setEditDescricao(e.target.value)} placeholder="Descrição opcional..." className="text-sm" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Cor de identificação</label>
                        <div className="flex gap-2 flex-wrap">
                          {COLOR_OPTIONS.map(c => (
                            <button key={c.value} onClick={() => setEditCor(c.value)} title={c.label}
                              className={`h-8 w-8 rounded-full border-4 transition-all ${editCor === c.value ? 'border-slate-800 scale-110' : 'border-transparent hover:scale-105'}`}
                              style={{ backgroundColor: c.value }} />
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 pt-1">
                        <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors">
                          <Checkbox checked={editSomenteVis} onCheckedChange={(c) => setEditSomenteVis(!!c)} className="mt-0.5" />
                          <div>
                            <span className="text-sm font-medium text-slate-800">Somente Visualização</span>
                            <p className="text-xs text-slate-500">Membros não podem criar, editar ou excluir registros em nenhuma tela</p>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-slate-50 transition-colors">
                          <Checkbox checked={editOcultarDados} onCheckedChange={(c) => setEditOcultarDados(!!c)} className="mt-0.5" />
                          <div>
                            <span className="text-sm font-medium text-slate-800">Ocultar Dados Sensíveis</span>
                            <p className="text-xs text-slate-500">Oculta salários, CPF, RG, dados bancários e valores financeiros para membros deste grupo</p>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 p-3 rounded-lg border-2 border-blue-200 bg-blue-50/40 cursor-pointer hover:bg-blue-50 transition-colors">
                          <Checkbox checked={editAcessoTodasObras} onCheckedChange={(c) => setEditAcessoTodasObras(!!c)} className="mt-0.5" />
                          <div>
                            <span className="text-sm font-medium text-slate-800">🏗️ Acesso a todas as obras em andamento</span>
                            <p className="text-xs text-slate-500">Membros enxergam <strong>automaticamente</strong> todas as obras ativas (de qualquer empresa que tenham acesso), sem precisar liberar obra por obra na tela de cada usuário. Ideal para o <strong>Escritório Central</strong> (Compras, Adm, Planejamento, Projetos, RH, Orçamento).</p>
                          </div>
                        </label>
                        {/* Rev. 2207 — sigilo opt-in do status "Aviso Prévio" */}
                        <label className="flex items-start gap-3 p-3 rounded-lg border-2 border-yellow-300 bg-yellow-50/40 cursor-pointer hover:bg-yellow-50 transition-colors">
                          <Checkbox checked={editVerStatusAviso} onCheckedChange={(c) => setEditVerStatusAviso(!!c)} className="mt-0.5" />
                          <div>
                            <span className="text-sm font-medium text-slate-800">⚠️ Ver Status de Aviso Prévio do colaborador</span>
                            <p className="text-xs text-slate-500">Por padrão o status <strong>"Aviso Prévio"</strong> é <strong>sigiloso</strong> — todos os usuários veem o colaborador como "Ativo". Marque esta opção para que membros deste grupo (geralmente <strong>RH/DP</strong>) consigam enxergar o badge real "Aviso Prévio" na lista, KPI, ficha individual e PDF.</p>
                          </div>
                        </label>
                      </div>
                    </div>
                    {isAdmin && (
                      <Button
                        onClick={() => {
                          if (!editNome.trim()) { toast.error("Nome é obrigatório"); return; }
                          updateMut.mutate({ id: selectedGroup.id, nome: editNome.trim(), descricao: editDescricao.trim() || undefined, cor: editCor, somenteVisualizacao: editSomenteVis, ocultarDadosSensiveis: editOcultarDados, acessoTodasObras: editAcessoTodasObras, verStatusAviso: editVerStatusAviso });
                        }}
                        disabled={updateMut.isPending}
                        className="mt-4 gap-2"
                      >
                        {updateMut.isPending ? "Salvando..." : <><Save className="h-4 w-4" />Salvar Alterações</>}
                      </Button>
                    )}
                  </div>
                )}

                {/* ── Tab: Permissões ──────────────────────────────────── */}
                {activeTab === "permissoes" && (
                  <div className="p-4">
                    {groupPermsQuery.isLoading ? (
                      <div className="text-center py-10 text-slate-400">Carregando permissões...</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm text-slate-500">
                            <span className="font-semibold text-slate-700">{enabledRouteCount}</span> de <span className="font-semibold text-slate-700">{totalRouteCount}</span> telas habilitadas
                          </p>
                          <div className="flex gap-2">
                            <button onClick={() => { ALL_ROUTES.forEach(s => toggleSectionView(s.routes, false)); }} className="text-xs px-2.5 py-1 border rounded-lg text-slate-600 hover:bg-slate-50">Desmarcar todas</button>
                            <button onClick={() => { ALL_ROUTES.forEach(s => toggleSectionView(s.routes, true)); }} className="text-xs px-2.5 py-1 border rounded-lg text-slate-600 hover:bg-slate-50">Marcar todas</button>
                          </div>
                        </div>

                        <div className="space-y-2 pb-24">
                          {ALL_ROUTES.map(section => {
                            const colors = sectionColorMap[section.color] || sectionColorMap.slate;
                            const allViewed = section.routes.every(r => routePerms[r.path]?.canView);
                            const someViewed = section.routes.some(r => routePerms[r.path]?.canView);
                            const viewedCount = section.routes.filter(r => routePerms[r.path]?.canView).length;
                            const isCollapsed = collapsedSections.has(section.section);

                            return (
                              <div key={section.section} className={`rounded-xl border overflow-hidden ${someViewed ? colors.border : 'border-slate-200'}`}>
                                {/* Section header */}
                                <div
                                  className={`flex items-center justify-between px-4 py-2.5 cursor-pointer select-none ${someViewed ? colors.headerBg : 'bg-slate-50'}`}
                                  onClick={() => toggleSection(section.section)}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <div onClick={e => e.stopPropagation()}>
                                      <Checkbox checked={allViewed} onCheckedChange={(checked) => toggleSectionView(section.routes, !!checked)} className="h-4 w-4" />
                                    </div>
                                    <div className={`h-2 w-2 rounded-full ${colors.dot}`} />
                                    <span className={`text-sm font-semibold ${someViewed ? colors.text : 'text-slate-600'}`}>{section.section}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${someViewed ? `${colors.bg} ${colors.text}` : 'bg-slate-100 text-slate-500'}`}>
                                      {viewedCount}/{section.routes.length}
                                    </span>
                                    {isCollapsed ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
                                  </div>
                                </div>

                                {/* Routes table */}
                                {!isCollapsed && (
                                  <div className="bg-white">
                                    {/* Column headers */}
                                    <div className="grid grid-cols-12 gap-1 px-4 py-2 bg-slate-50 border-t border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                      <div className="col-span-4">Tela / Rota</div>
                                      {[
                                        { field: 'canView' as const, label: 'Ver' },
                                        { field: 'canEdit' as const, label: 'Editar' },
                                        { field: 'canCreate' as const, label: 'Criar' },
                                        { field: 'canDelete' as const, label: 'Excluir' },
                                      ].map(col => {
                                        const allChecked = section.routes.every(r => !!(routePerms[r.path] as any)?.[col.field]);
                                        return (
                                          <div key={col.field} className="col-span-1 flex flex-col items-center gap-0.5">
                                            <Checkbox checked={allChecked} onCheckedChange={(c) => toggleColumnAll(section.routes, col.field, !!c)} className="h-3 w-3" title={`${allChecked ? 'Desmarcar' : 'Marcar'} todos — ${col.label}`} />
                                            <span>{col.label}</span>
                                          </div>
                                        );
                                      })}
                                      {(() => {
                                        const allR = section.routes.every(r => !!(routePerms[r.path] as any)?.ocultarValores);
                                        const allD = section.routes.every(r => !!(routePerms[r.path] as any)?.ocultarDocumentos);
                                        return (
                                          <>
                                            <div className="col-span-2 flex flex-col items-center gap-0.5">
                                              <Checkbox checked={allR} onCheckedChange={(c) => toggleColumnAll(section.routes, 'ocultarValores', !!c)} className="h-3 w-3" />
                                              <span>Ocultar R$</span>
                                            </div>
                                            <div className="col-span-2 flex flex-col items-center gap-0.5">
                                              <Checkbox checked={allD} onCheckedChange={(c) => toggleColumnAll(section.routes, 'ocultarDocumentos', !!c)} className="h-3 w-3" />
                                              <span>Ocultar Docs</span>
                                            </div>
                                          </>
                                        );
                                      })()}
                                    </div>
                                    {/* Route rows */}
                                    {section.routes.map((route, idx) => {
                                      const perm = routePerms[route.path];
                                      const isActive = perm?.canView;
                                      return (
                                        <div key={route.path} className={`grid grid-cols-12 gap-1 items-center px-4 py-1.5 border-t border-slate-50 hover:bg-blue-50/30 transition-colors ${isActive ? 'bg-blue-50/20' : ''}`}>
                                          <div className={`col-span-4 text-xs font-medium flex items-center gap-1.5 ${isActive ? 'text-blue-700' : 'text-slate-500'}`}>
                                            {isActive && <div className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />}
                                            <span className="truncate">{route.label}</span>
                                          </div>
                                          <div className="col-span-1 flex justify-center"><Checkbox checked={!!perm?.canView} onCheckedChange={() => toggleRoutePerm(route.path, 'canView')} className="h-4 w-4" /></div>
                                          <div className="col-span-1 flex justify-center"><Checkbox checked={!!perm?.canEdit} onCheckedChange={() => toggleRoutePerm(route.path, 'canEdit')} className="h-4 w-4" /></div>
                                          <div className="col-span-1 flex justify-center"><Checkbox checked={!!perm?.canCreate} onCheckedChange={() => toggleRoutePerm(route.path, 'canCreate')} className="h-4 w-4" /></div>
                                          <div className="col-span-1 flex justify-center"><Checkbox checked={!!perm?.canDelete} onCheckedChange={() => toggleRoutePerm(route.path, 'canDelete')} className="h-4 w-4" /></div>
                                          <div className="col-span-2 flex justify-center"><Checkbox checked={!!perm?.ocultarValores} onCheckedChange={() => toggleRoutePerm(route.path, 'ocultarValores')} className="h-4 w-4" /></div>
                                          <div className="col-span-2 flex justify-center"><Checkbox checked={!!perm?.ocultarDocumentos} onCheckedChange={() => toggleRoutePerm(route.path, 'ocultarDocumentos')} className="h-4 w-4" /></div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Sticky save bar */}
                        {isAdmin && (
                          <div className="fixed bottom-0 right-0 left-72 bg-white border-t shadow-lg px-6 py-3 flex items-center justify-between">
                            <div className="text-sm text-slate-500">
                              {permsDirty ? <span className="text-amber-600 font-medium">Há alterações não salvas</span> : <span className="text-green-600">{enabledRouteCount} tela{enabledRouteCount !== 1 ? 's' : ''} habilitada{enabledRouteCount !== 1 ? 's' : ''}</span>}
                            </div>
                            <Button onClick={savePermissions} disabled={setPermsMut.isPending || !permsDirty} className="gap-2">
                              {setPermsMut.isPending ? "Salvando..." : <><Save className="h-4 w-4" />Salvar Permissões</>}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* ── Tab: Membros ─────────────────────────────────────── */}
                {activeTab === "membros" && (() => {
                  const currentMembers = allUsers.filter((u: any) => memberIds.has(u.id));
                  const availableUsers = allUsers.filter((u: any) => !memberIds.has(u.id));
                  const term = memberSearch.toLowerCase().trim();
                  const filteredCurrent = term
                    ? currentMembers.filter((u: any) =>
                        (u.name || "").toLowerCase().includes(term) ||
                        (u.username || "").toLowerCase().includes(term))
                    : currentMembers;
                  const filteredAvailable = term
                    ? availableUsers.filter((u: any) =>
                        (u.name || "").toLowerCase().includes(term) ||
                        (u.username || "").toLowerCase().includes(term))
                    : availableUsers;
                  return (
                  <div className="p-6 max-w-2xl space-y-4">
                    {/* ── Busca unificada ── */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Digite o nome ou login do usuário para filtrar..."
                        value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        className="pl-9 text-sm"
                        autoFocus
                      />
                      {memberSearch && (
                        <button
                          onClick={() => setMemberSearch("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >✕</button>
                      )}
                    </div>

                    {/* ── Membros Atuais ── */}
                    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-slate-500" />
                          <span className="text-sm font-semibold text-slate-700">Membros Atuais</span>
                          <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">{memberIds.size}</span>
                        </div>
                      </div>
                      {groupMembersQuery.isLoading ? (
                        <div className="py-8 text-center text-sm text-slate-400">Carregando membros...</div>
                      ) : memberIds.size === 0 ? (
                        <div className="py-8 text-center text-sm text-slate-400">Nenhum membro neste grupo ainda</div>
                      ) : filteredCurrent.length === 0 ? (
                        <div className="py-6 text-center text-sm text-slate-400">Nenhum membro encontrado para "{memberSearch}"</div>
                      ) : (
                        <div className="divide-y">
                          {filteredCurrent.map((u: any) => (
                            <div key={u.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                  {(u.name || "?").charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-slate-800">{u.name}</div>
                                  {u.username && <div className="text-xs text-slate-400">@{u.username}</div>}
                                </div>
                              </div>
                              {isAdmin && (
                                <button
                                  onClick={() => removeMemberMut.mutate({ groupId: selectedGroup.id, userId: u.id })}
                                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                                >
                                  <UserMinus className="h-3.5 w-3.5" /> Remover
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── Adicionar / Mover Membros ── */}
                    {isAdmin && (
                      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b bg-slate-50">
                          <UserPlus className="h-4 w-4 text-slate-500" />
                          <span className="text-sm font-semibold text-slate-700">
                            {filteredAvailable.length > 0 ? "Adicionar / Mover para este grupo" : "Usuários disponíveis"}
                          </span>
                          {filteredAvailable.length > 0 && (
                            <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">{filteredAvailable.length}</span>
                          )}
                        </div>
                        <div className="max-h-72 overflow-y-auto divide-y">
                          {filteredAvailable.length === 0 ? (
                            <div className="py-6 text-center text-sm text-slate-400">
                              {memberSearch
                                ? "Nenhum usuário encontrado para esta busca"
                                : "Todos os usuários já são membros deste grupo"}
                            </div>
                          ) : (
                            filteredAvailable.map((u: any) => {
                              const jaNoGrupo = userToGroupMap[u.id];
                              const isMove = !!jaNoGrupo;
                              return (
                                <div key={u.id} className={`flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors ${isMove ? "bg-amber-50/40" : ""}`}>
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${isMove ? "bg-amber-500" : "bg-slate-400"}`}>
                                      {(u.name || "?").charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium text-slate-800 truncate">{u.name}</div>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {u.username && <span className="text-xs text-slate-400">@{u.username}</span>}
                                        {isMove && (
                                          <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                                            em: {jaNoGrupo.groupName}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => addMemberMut.mutate({ groupId: selectedGroup.id, userId: u.id })}
                                    disabled={addMemberMut.isPending}
                                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors shrink-0 ml-2 disabled:opacity-50
                                      ${isMove
                                        ? "text-amber-700 hover:text-amber-900 hover:bg-amber-100 border-amber-300"
                                        : "text-green-600 hover:text-green-800 hover:bg-green-50 border-green-200"}`}
                                  >
                                    {isMove
                                      ? <><UserPlus className="h-3.5 w-3.5" /> Mover</>
                                      : <><UserPlus className="h-3.5 w-3.5" /> Adicionar</>}
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })()}

              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
