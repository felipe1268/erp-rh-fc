import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FullScreenDialog from "@/components/FullScreenDialog";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Users, Plus, Pencil, Trash2, Save, ArrowLeft, Shield, Eye, EyeOff,
  ChevronRight, Settings, UserPlus, UserMinus, Search, X, Check,
  LayoutDashboard, Building2, HardHat, FileText, Clock, Wallet,
  FolderOpen, Briefcase, Layers, Landmark, AlertTriangle, Palmtree,
  BarChart3, Gavel, Scale, ShieldCheck, Globe, Receipt, CheckCircle,
  Store, CreditCard, Star, TrendingUp, CalendarDays, UserSearch,
  Lock, Wifi, UtensilsCrossed, FileSignature, FileSpreadsheet, BookOpen,
  BellIcon, FileSearch, Handshake, ClipboardCheck, ClipboardList
} from "lucide-react";

// Todas as rotas disponíveis no sistema, agrupadas por seção
const ALL_ROUTES = [
  {
    section: "RH & DP - Principal",
    color: "blue",
    routes: [
      { path: "/painel/rh", label: "Painel RH", icon: "LayoutDashboard" },
    ],
  },
  {
    section: "RH & DP - Cadastro",
    color: "blue",
    routes: [
      { path: "/empresas", label: "Empresas", icon: "Building2" },
      { path: "/colaboradores", label: "Colaboradores", icon: "Users" },
      { path: "/obras", label: "Obras", icon: "Landmark" },
      { path: "/obras/efetivo", label: "Efetivo por Obra", icon: "HardHat" },
      { path: "/setores", label: "Setores", icon: "Layers" },
      { path: "/funcoes", label: "Funções", icon: "Briefcase" },
      { path: "/relogios-ponto", label: "Relógios de Ponto", icon: "Wifi" },
      { path: "/convencoes-coletivas", label: "Convenções Coletivas", icon: "Scale" },
    ],
  },
  {
    section: "RH & DP - Financeiro",
    color: "blue",
    routes: [
      { path: "/contas-bancarias", label: "Contas Bancárias", icon: "ClipboardList" },
    ],
  },
  {
    section: "RH & DP - Operacional",
    color: "blue",
    routes: [
      { path: "/fechamento-ponto", label: "Fechamento de Ponto", icon: "Clock" },
      { path: "/folha-pagamento", label: "Folha de Pagamento", icon: "Wallet" },
      { path: "/controle-documentos", label: "Controle de Documentos", icon: "FolderOpen" },
      { path: "/controle-documentos?tab=atestados", label: "Lançar Atestados", icon: "ClipboardPlus" },
      { path: "/controle-documentos?tab=advertencias", label: "Advertências", icon: "ShieldAlert" },
      { path: "/vale-alimentacao", label: "Vale Alimentação", icon: "UtensilsCrossed" },
      { path: "/solicitacao-he", label: "Solicitação de Hora Extra", icon: "Clock" },
      { path: "/apontamentos-campo", label: "Apontamentos de Campo", icon: "ClipboardList" },
      { path: "/crachas", label: "Crachás", icon: "CreditCard" },
    ],
  },
  {
    section: "RH & DP - Gestão de Pessoas",
    color: "blue",
    routes: [
      { path: "/aviso-previo", label: "Aviso Prévio", icon: "AlertTriangle" },
      { path: "/ferias", label: "Férias", icon: "Palmtree" },
      { path: "/modulo-pj", label: "Contratos PJ", icon: "FileSignature" },
      { path: "/pj-medicoes", label: "PJ Medições", icon: "FileSpreadsheet" },
    ],
  },
  {
    section: "RH & DP - Dashboards",
    color: "indigo",
    routes: [
      { path: "/dashboards", label: "Todos os Dashboards", icon: "BarChart3" },
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
    ],
  },
  {
    section: "RH & DP - Tabelas",
    color: "blue",
    routes: [
      { path: "/feriados", label: "Feriados", icon: "CalendarDays" },
      { path: "/dissidio", label: "Dissídio", icon: "TrendingUp" },
    ],
  },
  {
    section: "SST - Segurança do Trabalho",
    color: "green",
    routes: [
      { path: "/painel/sst", label: "Painel SST", icon: "LayoutDashboard" },
      { path: "/epis", label: "Controle de EPIs", icon: "HardHat" },
      { path: "/cipa", label: "CIPA", icon: "Shield" },
      { path: "/dashboards/epis", label: "Dashboard EPIs", icon: "HardHat" },
    ],
  },
  {
    section: "Jurídico",
    color: "amber",
    routes: [
      { path: "/painel/juridico", label: "Painel Jurídico", icon: "LayoutDashboard" },
      { path: "/processos-trabalhistas", label: "Processos Trabalhistas", icon: "Gavel" },
      { path: "/dashboards/juridico", label: "Dashboard Jurídico", icon: "Gavel" },
    ],
  },
  {
    section: "Avaliação de Desempenho",
    color: "amber",
    routes: [
      { path: "/avaliacao-desempenho", label: "Avaliação de Desempenho", icon: "Star" },
    ],
  },
  {
    section: "Terceiros",
    color: "orange",
    routes: [
      { path: "/terceiros/painel", label: "Painel Terceiros", icon: "LayoutDashboard" },
      { path: "/terceiros/empresas", label: "Empresas Terceiras", icon: "Building2" },
      { path: "/terceiros/funcionarios", label: "Funcionários Terceiros", icon: "Users" },
      { path: "/terceiros/obrigacoes", label: "Obrigações Mensais", icon: "ClipboardCheck" },
      { path: "/terceiros/conformidade", label: "Painel de Conformidade", icon: "ShieldCheck" },
      { path: "/terceiros/alertas", label: "Alertas e Cobranças", icon: "BellIcon" },
      { path: "/terceiros/portal", label: "Portal Externo", icon: "Globe" },
      { path: "/terceiros/validacao-ia", label: "Validação IA de Docs", icon: "FileSearch" },
    ],
  },
  {
    section: "Parceiros",
    color: "purple",
    routes: [
      { path: "/parceiros/painel", label: "Painel Parceiros", icon: "LayoutDashboard" },
      { path: "/parceiros/cadastro", label: "Parceiros Conveniados", icon: "Store" },
      { path: "/parceiros/lancamentos", label: "Lançamentos", icon: "Receipt" },
      { path: "/parceiros/aprovacoes", label: "Aprovações RH", icon: "CheckCircle" },
      { path: "/parceiros/guia-descontos", label: "Guia de Descontos", icon: "FileText" },
      { path: "/parceiros/pagamentos", label: "Pagamentos", icon: "Wallet" },
    ],
  },
  {
    section: "Relatórios e IA",
    color: "slate",
    routes: [
      { path: "/relatorios/raio-x", label: "Raio-X do Funcionário", icon: "UserSearch" },
      { path: "/comparativo-convencoes", label: "Comparativo Convenções", icon: "Scale" },
      { path: "/ajuda", label: "Biblioteca de Conhecimento", icon: "BookOpen" },
    ],
  },
];

const sectionColorMap: Record<string, { bg: string; border: string; text: string; headerBg: string }> = {
  blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", headerBg: "bg-blue-100" },
  green: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", headerBg: "bg-emerald-100" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", headerBg: "bg-amber-100" },
  orange: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", headerBg: "bg-orange-100" },
  purple: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", headerBg: "bg-purple-100" },
  indigo: { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", headerBg: "bg-indigo-100" },
  slate: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", headerBg: "bg-slate-100" },
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

export default function GruposUsuarios() {
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const isAdmin = user?.role === "admin" || isMaster;

  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  // Create form
  const [newNome, setNewNome] = useState("");
  const [newDescricao, setNewDescricao] = useState("");
  const [newCor, setNewCor] = useState("#6b7280");
  const [newSomenteVis, setNewSomenteVis] = useState(true);
  const [newOcultarDados, setNewOcultarDados] = useState(true);

  // Edit form
  const [editNome, setEditNome] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editCor, setEditCor] = useState("#6b7280");
  const [editSomenteVis, setEditSomenteVis] = useState(true);
  const [editOcultarDados, setEditOcultarDados] = useState(true);

  // Permissions state
  const [routePerms, setRoutePerms] = useState<Record<string, RoutePermission>>({});

  // Member management
  const [memberSearch, setMemberSearch] = useState("");

  const utils = trpc.useUtils();

  // Queries
  const groupsQuery = trpc.userGroups.list.useQuery();
  const usersQuery = trpc.userManagement.listUsers.useQuery();
  const groupPermsQuery = trpc.userGroups.getPermissions.useQuery(
    { groupId: selectedGroup?.id ?? 0 },
    { enabled: !!selectedGroup && showPermissions }
  );
  const groupMembersQuery = trpc.userGroups.getMembers.useQuery(
    { groupId: selectedGroup?.id ?? 0 },
    { enabled: !!selectedGroup && showMembers }
  );

  // Mutations
  const createMut = trpc.userGroups.create.useMutation({
    onSuccess: () => { toast.success("Grupo criado!"); setShowCreateGroup(false); utils.userGroups.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.userGroups.update.useMutation({
    onSuccess: () => { toast.success("Grupo atualizado!"); utils.userGroups.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.userGroups.delete.useMutation({
    onSuccess: () => { toast.success("Grupo excluído!"); setSelectedGroup(null); utils.userGroups.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const setPermsMut = trpc.userGroups.setPermissions.useMutation({
    onSuccess: () => { toast.success("Permissões do grupo salvas!"); utils.userGroups.getPermissions.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const addMemberMut = trpc.userGroups.addMember.useMutation({
    onSuccess: () => { toast.success("Membro adicionado!"); utils.userGroups.getMembers.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const removeMemberMut = trpc.userGroups.removeMember.useMutation({
    onSuccess: () => { toast.success("Membro removido!"); utils.userGroups.getMembers.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // Load permissions into state when query loads
  const loadPermsIntoState = () => {
    if (!groupPermsQuery.data) return;
    const map: Record<string, RoutePermission> = {};
    for (const p of groupPermsQuery.data) {
      map[p.rota] = p;
    }
    setRoutePerms(map);
  };

  // Toggle route permission
  const toggleRoutePerm = (path: string, field: keyof RoutePermission) => {
    setRoutePerms(prev => {
      const existing = prev[path] || { rota: path, canView: false, canEdit: false, canCreate: false, canDelete: false, ocultarValores: false, ocultarDocumentos: false };
      const updated = { ...existing, [field]: !(existing as any)[field] };
      // If canView is turned off, turn off everything
      if (field === 'canView' && !updated.canView) {
        updated.canEdit = false;
        updated.canCreate = false;
        updated.canDelete = false;
      }
      // If any action is turned on, ensure canView is on
      if ((field === 'canEdit' || field === 'canCreate' || field === 'canDelete') && updated[field]) {
        updated.canView = true;
      }
      return { ...prev, [path]: updated };
    });
  };

  // Toggle all routes in a section
  const toggleSectionView = (sectionRoutes: { path: string }[], enable: boolean) => {
    setRoutePerms(prev => {
      const updated = { ...prev };
      for (const r of sectionRoutes) {
        if (enable) {
          updated[r.path] = updated[r.path] || { rota: r.path, canView: true, canEdit: false, canCreate: false, canDelete: false, ocultarValores: false, ocultarDocumentos: false };
          updated[r.path] = { ...updated[r.path], canView: true };
        } else {
          updated[r.path] = { rota: r.path, canView: false, canEdit: false, canCreate: false, canDelete: false, ocultarValores: false, ocultarDocumentos: false };
        }
      }
      return updated;
    });
  };

  const savePermissions = () => {
    if (!selectedGroup) return;
    // Only save routes with canView=true to keep the database clean
    const perms = Object.values(routePerms).filter(p => p.canView);
    setPermsMut.mutate({ groupId: selectedGroup.id, permissions: perms });
  };

  const openGroupConfig = (g: any) => {
    setSelectedGroup(g);
    setEditNome(g.nome);
    setEditDescricao(g.descricao || "");
    setEditCor(g.cor || "#6b7280");
    setEditSomenteVis(g.somenteVisualizacao);
    setEditOcultarDados(g.ocultarDadosSensiveis);
    setShowPermissions(false);
    setShowMembers(false);
  };

  const openPermissions = (g: any) => {
    setSelectedGroup(g);
    setShowPermissions(true);
    setShowMembers(false);
    setRoutePerms({});
  };

  const openMembers = (g: any) => {
    setSelectedGroup(g);
    setShowMembers(true);
    setShowPermissions(false);
    setMemberSearch("");
  };

  // When perms query loads, populate state
  // Note: we also need to handle the case where groupPermsQuery.data is empty (new group with no permissions)
  if (groupPermsQuery.data && showPermissions && Object.keys(routePerms).length === 0) {
    if (groupPermsQuery.data.length > 0) {
      loadPermsIntoState();
    }
    // For groups with no permissions yet, routePerms stays empty which is correct
    // The toggleRoutePerm function creates entries on demand
  }

  // Members data
  const memberIds = useMemo(() => new Set((groupMembersQuery.data || []).map((m: any) => m.userId)), [groupMembersQuery.data]);
  const allUsers = usersQuery.data || [];
  const filteredUsersForMembers = useMemo(() => {
    const term = memberSearch.toLowerCase().trim();
    if (!term) return allUsers;
    return allUsers.filter((u: any) =>
      (u.name || "").toLowerCase().includes(term) ||
      (u.username || "").toLowerCase().includes(term)
    );
  }, [allUsers, memberSearch]);

  const colorOptions = [
    { value: "#ef4444", label: "Vermelho" },
    { value: "#f59e0b", label: "Amarelo" },
    { value: "#10b981", label: "Verde" },
    { value: "#3b82f6", label: "Azul" },
    { value: "#8b5cf6", label: "Roxo" },
    { value: "#ec4899", label: "Rosa" },
    { value: "#6b7280", label: "Cinza" },
    { value: "#f97316", label: "Laranja" },
  ];

  const enabledRouteCount = Object.values(routePerms).filter(p => p.canView).length;
  const totalRouteCount = ALL_ROUTES.reduce((acc, s) => acc + s.routes.length, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Users className="h-6 w-6 text-blue-600" />
              Grupos de Usuários
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gerencie grupos e defina permissões que serão herdadas por todos os membros
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => { setNewNome(""); setNewDescricao(""); setNewCor("#6b7280"); setNewSomenteVis(true); setNewOcultarDados(true); setShowCreateGroup(true); }} className="gap-2 bg-green-600 hover:bg-green-700">
              <Plus className="h-4 w-4" /> Novo Grupo
            </Button>
          )}
        </div>

        {/* Groups List */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groupsQuery.isLoading && (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Carregando grupos...</p>
              </CardContent>
            </Card>
          )}

          {groupsQuery.data?.map((g: any) => (
            <Card key={g.id} className="hover:shadow-md transition-all border-l-4" style={{ borderLeftColor: g.cor || '#6b7280' }}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${g.cor}20` }}>
                      <Users className="h-4 w-4" style={{ color: g.cor }} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{g.nome}</CardTitle>
                      {g.descricao && <CardDescription className="text-xs mt-0.5 line-clamp-1">{g.descricao}</CardDescription>}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Flags */}
                <div className="flex flex-wrap gap-1.5">
                  {g.somenteVisualizacao ? (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                      Somente Visualização
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                      Pode Editar
                    </span>
                  )}
                  {g.ocultarDadosSensiveis ? (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                      Oculta Dados Sensíveis
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                      Vê Dados Sensíveis
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-8 gap-1" onClick={() => openGroupConfig(g)}>
                    <Pencil className="h-3 w-3" /> Editar
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-8 gap-1" onClick={() => openPermissions(g)}>
                    <Shield className="h-3 w-3" /> Telas
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-8 gap-1" onClick={() => openMembers(g)}>
                    <Users className="h-3 w-3" /> Membros
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {groupsQuery.data && (
          <p className="text-xs text-muted-foreground text-center">
            {groupsQuery.data.length} grupo{groupsQuery.data.length !== 1 ? 's' : ''} cadastrado{groupsQuery.data.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* ============================================================ */}
      {/* DIALOG: Criar Grupo */}
      {/* ============================================================ */}
      <FullScreenDialog open={showCreateGroup} onClose={() => setShowCreateGroup(false)} title="Novo Grupo" subtitle="Crie um grupo de usuários com permissões compartilhadas">
        <div className="w-full max-w-2xl space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Dados do Grupo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Nome do Grupo *</label>
                  <Input value={newNome} onChange={e => setNewNome(e.target.value)} placeholder="Ex: TST, Gestor de Obras..." className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Cor</label>
                  <div className="flex gap-2 mt-1">
                    {colorOptions.map(c => (
                      <button
                        key={c.value}
                        className={`h-8 w-8 rounded-full border-2 transition-all ${newCor === c.value ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: c.value }}
                        onClick={() => setNewCor(c.value)}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Input value={newDescricao} onChange={e => setNewDescricao(e.target.value)} placeholder="Descrição do grupo..." className="mt-1" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" /> Configurações Globais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-secondary/30 transition-colors">
                <Checkbox checked={newSomenteVis} onCheckedChange={(c) => setNewSomenteVis(!!c)} />
                <div>
                  <span className="text-sm font-medium">Somente Visualização</span>
                  <p className="text-xs text-muted-foreground">Membros não podem criar, editar ou excluir registros</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-secondary/30 transition-colors">
                <Checkbox checked={newOcultarDados} onCheckedChange={(c) => setNewOcultarDados(!!c)} />
                <div>
                  <span className="text-sm font-medium">Ocultar Dados Sensíveis</span>
                  <p className="text-xs text-muted-foreground">Oculta salários, CPF, RG, dados bancários e valores financeiros</p>
                </div>
              </label>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowCreateGroup(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!newNome.trim()) { toast.error("Nome é obrigatório"); return; }
              createMut.mutate({ nome: newNome.trim(), descricao: newDescricao.trim() || undefined, cor: newCor, somenteVisualizacao: newSomenteVis, ocultarDadosSensiveis: newOcultarDados });
            }} disabled={createMut.isPending} className="bg-green-600 hover:bg-green-700 gap-2">
              {createMut.isPending ? "Criando..." : <><Plus className="h-4 w-4" /> Criar Grupo</>}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* ============================================================ */}
      {/* DIALOG: Editar Grupo */}
      {/* ============================================================ */}
      <FullScreenDialog
        open={!!selectedGroup && !showPermissions && !showMembers}
        onClose={() => setSelectedGroup(null)}
        title="Editar Grupo"
        subtitle={selectedGroup?.nome || ''}
      >
        {selectedGroup && (
          <div className="w-full max-w-2xl space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" /> Dados do Grupo
                  </CardTitle>
                  {isMaster && (
                    <Button variant="outline" size="sm" className="text-xs h-7 gap-1 text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => { if (confirm(`Excluir grupo "${selectedGroup.nome}"? Todos os membros perderão as permissões.`)) deleteMut.mutate({ id: selectedGroup.id }); }}>
                      <Trash2 className="h-3 w-3" /> Excluir
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Nome do Grupo</label>
                    <Input value={editNome} onChange={e => setEditNome(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Cor</label>
                    <div className="flex gap-2 mt-1">
                      {colorOptions.map(c => (
                        <button
                          key={c.value}
                          className={`h-8 w-8 rounded-full border-2 transition-all ${editCor === c.value ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                          style={{ backgroundColor: c.value }}
                          onClick={() => setEditCor(c.value)}
                          title={c.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Descrição</label>
                  <Input value={editDescricao} onChange={e => setEditDescricao(e.target.value)} className="mt-1" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Configurações Globais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-secondary/30 transition-colors">
                  <Checkbox checked={editSomenteVis} onCheckedChange={(c) => setEditSomenteVis(!!c)} />
                  <div>
                    <span className="text-sm font-medium">Somente Visualização</span>
                    <p className="text-xs text-muted-foreground">Membros não podem criar, editar ou excluir registros</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-secondary/30 transition-colors">
                  <Checkbox checked={editOcultarDados} onCheckedChange={(c) => setEditOcultarDados(!!c)} />
                  <div>
                    <span className="text-sm font-medium">Ocultar Dados Sensíveis</span>
                    <p className="text-xs text-muted-foreground">Oculta salários, CPF, RG, dados bancários e valores financeiros</p>
                  </div>
                </label>
              </CardContent>
            </Card>

            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" onClick={() => setSelectedGroup(null)} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button onClick={() => {
                if (!editNome.trim()) { toast.error("Nome é obrigatório"); return; }
                updateMut.mutate({ id: selectedGroup.id, nome: editNome.trim(), descricao: editDescricao.trim() || undefined, cor: editCor, somenteVisualizacao: editSomenteVis, ocultarDadosSensiveis: editOcultarDados });
              }} disabled={updateMut.isPending} className="gap-2">
                {updateMut.isPending ? "Salvando..." : <><Save className="h-4 w-4" /> Salvar</>}
              </Button>
            </div>
          </div>
        )}
      </FullScreenDialog>

      {/* ============================================================ */}
      {/* DIALOG: Permissões de Telas */}
      {/* ============================================================ */}
      <FullScreenDialog
        open={showPermissions && !!selectedGroup}
        onClose={() => { setShowPermissions(false); setSelectedGroup(null); }}
        title={`Permissões de Telas — ${selectedGroup?.nome || ''}`}
        subtitle={`Defina quais telas e dashboards os membros deste grupo podem acessar (${enabledRouteCount}/${totalRouteCount} habilitadas)`}
      >
        {selectedGroup && showPermissions && (
          <div className="w-full max-w-4xl space-y-4">
            {groupPermsQuery.isLoading ? (
              <p className="text-center text-muted-foreground py-8">Carregando permissões...</p>
            ) : (
              <>
                {ALL_ROUTES.map(section => {
                  const colors = sectionColorMap[section.color] || sectionColorMap.slate;
                  const allViewed = section.routes.every(r => routePerms[r.path]?.canView);
                  const someViewed = section.routes.some(r => routePerms[r.path]?.canView);
                  const viewedCount = section.routes.filter(r => routePerms[r.path]?.canView).length;

                  return (
                    <div key={section.section} className={`rounded-lg border ${someViewed ? colors.border : 'border-border'}`}>
                      {/* Section header */}
                      <div className={`flex items-center justify-between p-3 rounded-t-lg ${someViewed ? colors.headerBg : 'bg-secondary/30'}`}>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={allViewed}
                            onCheckedChange={(checked) => toggleSectionView(section.routes, !!checked)}
                          />
                          <span className={`text-sm font-semibold ${someViewed ? colors.text : ''}`}>{section.section}</span>
                        </div>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${someViewed ? `${colors.bg} ${colors.text}` : 'bg-gray-100 text-gray-500'}`}>
                          {viewedCount}/{section.routes.length}
                        </span>
                      </div>

                      {/* Routes - always show so user can toggle checkboxes */}
                      <div className="p-3 space-y-1">
                          {/* Column headers */}
                          <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-1 border-b mb-1">
                            <div className="col-span-4">Tela</div>
                            <div className="col-span-1 text-center">Ver</div>
                            <div className="col-span-1 text-center">Editar</div>
                            <div className="col-span-1 text-center">Criar</div>
                            <div className="col-span-1 text-center">Excluir</div>
                            <div className="col-span-2 text-center">Ocultar R$</div>
                            <div className="col-span-2 text-center">Ocultar Docs</div>
                          </div>
                          {section.routes.map(route => {
                            const perm = routePerms[route.path];
                            return (
                              <div key={route.path} className="grid grid-cols-12 gap-2 items-center py-1 hover:bg-secondary/20 rounded px-1">
                                <div className="col-span-4 text-xs font-medium truncate">{route.label}</div>
                                <div className="col-span-1 flex justify-center">
                                  <Checkbox checked={!!perm?.canView} onCheckedChange={() => toggleRoutePerm(route.path, 'canView')} className="h-4 w-4" />
                                </div>
                                <div className="col-span-1 flex justify-center">
                                  <Checkbox checked={!!perm?.canEdit} onCheckedChange={() => toggleRoutePerm(route.path, 'canEdit')} className="h-4 w-4" />
                                </div>
                                <div className="col-span-1 flex justify-center">
                                  <Checkbox checked={!!perm?.canCreate} onCheckedChange={() => toggleRoutePerm(route.path, 'canCreate')} className="h-4 w-4" />
                                </div>
                                <div className="col-span-1 flex justify-center">
                                  <Checkbox checked={!!perm?.canDelete} onCheckedChange={() => toggleRoutePerm(route.path, 'canDelete')} className="h-4 w-4" />
                                </div>
                                <div className="col-span-2 flex justify-center">
                                  <Checkbox checked={!!perm?.ocultarValores} onCheckedChange={() => toggleRoutePerm(route.path, 'ocultarValores')} className="h-4 w-4" />
                                </div>
                                <div className="col-span-2 flex justify-center">
                                  <Checkbox checked={!!perm?.ocultarDocumentos} onCheckedChange={() => toggleRoutePerm(route.path, 'ocultarDocumentos')} className="h-4 w-4" />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}

                <div className="flex justify-between items-center pt-4 border-t sticky bottom-0 bg-background pb-4">
                  <Button variant="outline" onClick={() => { setShowPermissions(false); setSelectedGroup(null); }} className="gap-1">
                    <ArrowLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <Button onClick={savePermissions} disabled={setPermsMut.isPending} className="gap-2">
                    {setPermsMut.isPending ? "Salvando..." : <><Save className="h-4 w-4" /> Salvar Permissões</>}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </FullScreenDialog>

      {/* ============================================================ */}
      {/* DIALOG: Membros do Grupo */}
      {/* ============================================================ */}
      <FullScreenDialog
        open={showMembers && !!selectedGroup}
        onClose={() => { setShowMembers(false); setSelectedGroup(null); }}
        title={`Membros — ${selectedGroup?.nome || ''}`}
        subtitle="Adicione ou remova usuários deste grupo"
      >
        {selectedGroup && showMembers && (
          <div className="w-full max-w-2xl space-y-6">
            {/* Current members */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Membros Atuais
                  <span className="text-xs font-normal text-muted-foreground">({memberIds.size})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {groupMembersQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
                ) : memberIds.size === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum membro neste grupo</p>
                ) : (
                  <div className="space-y-1">
                    {allUsers.filter((u: any) => memberIds.has(u.id)).map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/30">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                            {(u.name || "?").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-sm font-medium">{u.name}</span>
                            {u.username && <span className="text-xs text-muted-foreground ml-2">@{u.username}</span>}
                          </div>
                        </div>
                        {isAdmin && (
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 text-xs gap-1"
                            onClick={() => removeMemberMut.mutate({ groupId: selectedGroup.id, userId: u.id })}>
                            <UserMinus className="h-3 w-3" /> Remover
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Add members */}
            {isAdmin && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserPlus className="h-4 w-4" /> Adicionar Membros
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar usuário..."
                      value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {filteredUsersForMembers.filter((u: any) => !memberIds.has(u.id)).map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/30">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-bold">
                            {(u.name || "?").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-sm font-medium">{u.name}</span>
                            {u.username && <span className="text-xs text-muted-foreground ml-2">@{u.username}</span>}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="text-green-600 border-green-300 hover:bg-green-50 h-7 text-xs gap-1"
                          onClick={() => addMemberMut.mutate({ groupId: selectedGroup.id, userId: u.id })}>
                          <UserPlus className="h-3 w-3" /> Adicionar
                        </Button>
                      </div>
                    ))}
                    {filteredUsersForMembers.filter((u: any) => !memberIds.has(u.id)).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {memberSearch ? "Nenhum usuário encontrado" : "Todos os usuários já são membros"}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-start pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowMembers(false); setSelectedGroup(null); }} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
            </div>
          </div>
        )}
      </FullScreenDialog>
    </DashboardLayout>
  );
}
