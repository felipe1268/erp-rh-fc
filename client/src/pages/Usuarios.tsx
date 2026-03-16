import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Shield, Search, X, UserPlus, Users, Building2, Lock, Eye, EyeOff,
  ChevronRight, Save, Trash2, RefreshCw, User, Mail, KeyRound,
  LayoutGrid, ArrowLeft
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { removeAccents } from "@/lib/searchUtils";

// ================================================================
// Definição dos 12 módulos do sistema
// ================================================================
const ALL_MODULES = [
  { id: "rh-dp",         label: "RH / DP",          description: "Folha, admissões e desligamentos",          dot: "bg-blue-500",    badge: "bg-blue-100 text-blue-700 border-blue-200" },
  { id: "sst",           label: "SST",               description: "Saúde e segurança do trabalho",             dot: "bg-green-500",   badge: "bg-green-100 text-green-700 border-green-200" },
  { id: "juridico",      label: "Jurídico",           description: "Contratos e obrigações legais",             dot: "bg-amber-500",   badge: "bg-amber-100 text-amber-700 border-amber-200" },
  { id: "avaliacao",     label: "Avaliação",          description: "Avaliação de desempenho",                   dot: "bg-purple-500",  badge: "bg-purple-100 text-purple-700 border-purple-200" },
  { id: "terceiros",     label: "Terceiros",          description: "Empresas e trabalhadores terceirizados",    dot: "bg-orange-500",  badge: "bg-orange-100 text-orange-700 border-orange-200" },
  { id: "parceiros",     label: "Parceiros",          description: "Gestão de parceiros e comissões",           dot: "bg-teal-500",    badge: "bg-teal-100 text-teal-700 border-teal-200" },
  { id: "orcamento",     label: "Orçamento",          description: "Orçamentos e composições de custo",         dot: "bg-indigo-500",  badge: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { id: "planejamento",  label: "Planejamento",       description: "Obras e cronogramas",                       dot: "bg-violet-500",  badge: "bg-violet-100 text-violet-700 border-violet-200" },
  { id: "cadastro",      label: "Cadastro",           description: "Cadastro de obras e colaboradores",         dot: "bg-slate-500",   badge: "bg-slate-100 text-slate-700 border-slate-200" },
  { id: "compras",       label: "Compras",            description: "Gestão de compras e fornecedores",          dot: "bg-rose-500",    badge: "bg-rose-100 text-rose-700 border-rose-200" },
  { id: "almoxarifado",  label: "Almoxarifado",       description: "Controle de estoque e materiais",           dot: "bg-lime-600",    badge: "bg-lime-100 text-lime-700 border-lime-200" },
  { id: "financeiro",    label: "Financeiro",         description: "Fluxo de caixa e gestão financeira",        dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
];

const ROLE_LABELS: Record<string, string> = {
  admin_master: "Admin Master",
  admin: "Admin",
  user: "Usuário",
};

const ROLE_BADGE: Record<string, string> = {
  admin_master: "bg-purple-100 text-purple-700 border-purple-200",
  admin: "bg-blue-100 text-blue-700 border-blue-200",
  user: "bg-gray-100 text-gray-600 border-gray-200",
};

// ================================================================
// Componente Principal
// ================================================================
export default function Usuarios() {
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const isAdmin = user?.role === "admin" || isMaster;
  const { getCompanyIdsForQuery } = useCompany();

  // Painel ativo: "list" ou "detail"
  const [panel, setPanel] = useState<"list" | "detail">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showNewUserForm, setShowNewUserForm] = useState(false);

  // Formulário de edição
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [editRole, setEditRole] = useState("user");
  const [editCompanyIds, setEditCompanyIds] = useState<number[]>([]);
  const [editModuleAccess, setEditModuleAccess] = useState<Record<string, "admin" | "viewer" | null>>({});

  // Formulário de novo usuário
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin" | "admin_master">("user");
  const [newPassword, setNewPassword] = useState("");
  const [newCompanyIds, setNewCompanyIds] = useState<number[]>([]);

  const utils = trpc.useUtils();

  // Queries
  const usersQuery = trpc.userManagement.listUsers.useQuery();
  const allCompaniesQuery = trpc.companies.list.useQuery();

  // Mutations
  const createUserMut = trpc.userManagement.createLocalUser.useMutation({
    onSuccess: (data) => {
      toast.success(`Usuário "${data.username}" criado! Senha padrão: ${data.defaultPassword}`);
      setShowNewUserForm(false);
      resetNewForm();
      usersQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateUserMut = trpc.userManagement.updateUser.useMutation({
    onSuccess: () => {
      toast.success("Dados do usuário salvos!");
      usersQuery.refetch();
      utils.auth.me.invalidate();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const setCompaniesMut = trpc.userManagement.setUserCompanies.useMutation({
    onSuccess: () => { usersQuery.refetch(); },
    onError: (e) => toast.error("Erro ao salvar empresas: " + e.message),
  });

  const setModuleAccessMut = trpc.userManagement.setUserModuleAccess.useMutation({
    onSuccess: () => {
      toast.success("Permissões de módulos salvas!");
      utils.userManagement.getMyPermissions.invalidate();
    },
    onError: (e) => toast.error("Erro ao salvar permissões: " + e.message),
  });

  const resetPwdMut = trpc.userManagement.resetPassword.useMutation({
    onSuccess: (data) => toast.success(`Senha resetada! Nova senha: ${data.defaultPassword}`),
    onError: (e) => toast.error(e.message),
  });

  const deleteUserMut = trpc.userManagement.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário excluído!");
      setSelectedUser(null);
      setPanel("list");
      usersQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // Usuários filtrados
  const filteredUsers = useMemo(() => {
    if (!usersQuery.data) return [];
    const term = removeAccents(searchTerm.toLowerCase().trim());
    if (!term) return usersQuery.data;
    return usersQuery.data.filter((u: any) =>
      removeAccents((u.name || "").toLowerCase()).includes(term) ||
      removeAccents((u.username || "").toLowerCase()).includes(term) ||
      removeAccents((u.email || "").toLowerCase()).includes(term)
    );
  }, [usersQuery.data, searchTerm]);

  // Resetar formulário de novo usuário
  const resetNewForm = () => {
    setNewUsername(""); setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("user"); setNewCompanyIds([]);
  };

  // Abrir detalhe de usuário
  const openUser = (u: any) => {
    setSelectedUser(u);
    setEditName(u.name || "");
    setEditEmail(u.email || "");
    setEditUsername(u.username || "");
    setEditPassword("");
    setShowPassword(false);
    setEditRole(u.role || "user");
    setEditCompanyIds(u.companyIds || []);
    // Carregar moduleAccess do usuário
    let ma: Record<string, "admin" | "viewer" | null> = {};
    try {
      if (u.modulesAccess) ma = JSON.parse(u.modulesAccess);
    } catch {}
    setEditModuleAccess(ma);
    setShowNewUserForm(false);
    setPanel("detail");
  };

  // Salvar tudo
  const handleSave = () => {
    if (!selectedUser) return;
    if (!editName.trim()) { toast.error("Nome é obrigatório"); return; }
    if (editPassword && editPassword.length < 6) { toast.error("Senha deve ter mínimo 6 caracteres"); return; }

    updateUserMut.mutate({
      userId: selectedUser.id,
      name: editName.trim(),
      email: editEmail.trim() || undefined,
      username: editUsername.trim() || undefined,
      newPassword: editPassword.trim() || undefined,
      role: (isAdmin && selectedUser.id !== user?.id) ? editRole as any : undefined,
    });

    if (isAdmin && editRole !== "admin_master") {
      setCompaniesMut.mutate({ userId: selectedUser.id, companyIds: editCompanyIds });
    }

    if (editRole !== "admin_master") {
      setModuleAccessMut.mutate({ userId: selectedUser.id, moduleAccess: editModuleAccess });
    }
  };

  // Toggle de módulo
  const toggleModule = (moduleId: string, enabled: boolean) => {
    setEditModuleAccess(prev => ({
      ...prev,
      [moduleId]: enabled ? (prev[moduleId] === "viewer" ? "viewer" : "admin") : null,
    }));
  };

  // Mudar nível (admin / viewer)
  const setModuleLevel = (moduleId: string, level: "admin" | "viewer") => {
    setEditModuleAccess(prev => ({ ...prev, [moduleId]: level }));
  };

  // Criar usuário
  const handleCreate = () => {
    if (!newUsername || !newName) { toast.error("Preencha usuário e nome"); return; }
    createUserMut.mutate({
      username: newUsername,
      name: newName,
      email: newEmail || undefined,
      role: newRole,
      password: newPassword || undefined,
      companyIds: newCompanyIds.length > 0 ? newCompanyIds : undefined,
    });
  };

  // Contagem de módulos com acesso
  const moduleAccessCount = (u: any) => {
    if (u.role === "admin_master") return ALL_MODULES.length;
    try {
      const ma = u.modulesAccess ? JSON.parse(u.modulesAccess) : {};
      return Object.values(ma).filter(v => v != null).length;
    } catch { return 0; }
  };

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* ============================================================
            PAINEL ESQUERDO — Lista de usuários
        ============================================================ */}
        <div className={`${panel === "detail" ? "hidden lg:flex" : "flex"} flex-col w-full lg:w-80 xl:w-96 border-r bg-background shrink-0`}>
          {/* Header */}
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                Usuários
              </h1>
              {isAdmin && (
                <Button
                  size="sm"
                  className="gap-1.5 bg-green-600 hover:bg-green-700 h-8"
                  onClick={() => { setShowNewUserForm(true); setSelectedUser(null); setPanel("detail"); }}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Novo
                </Button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar usuário..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 pr-8 h-8 text-sm"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {usersQuery.isLoading && (
              <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
            )}
            {!usersQuery.isLoading && filteredUsers.length === 0 && (
              <div className="p-8 text-center">
                <Users className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum usuário encontrado</p>
              </div>
            )}
            {filteredUsers.map((u: any) => {
              const count = moduleAccessCount(u);
              const isSelected = selectedUser?.id === u.id && !showNewUserForm;
              return (
                <button
                  key={u.id}
                  onClick={() => openUser(u)}
                  className={`w-full text-left px-4 py-3 border-b transition-colors flex items-center gap-3 hover:bg-muted/50 ${isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                >
                  {/* Avatar */}
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                    u.role === "admin_master" ? "bg-purple-600" : u.role === "admin" ? "bg-blue-600" : "bg-gray-500"
                  }`}>
                    {(u.name || u.username || "?").charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium truncate">{u.name || u.username}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${ROLE_BADGE[u.role]}`}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{u.email || u.username}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {u.role === "admin_master" ? "Acesso total" : `${count} módulo${count !== 1 ? "s" : ""}`}
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </div>

        {/* ============================================================
            PAINEL DIREITO — Detalhe / Novo Usuário
        ============================================================ */}
        <div className={`${panel === "list" && !showNewUserForm ? "hidden lg:flex" : "flex"} flex-1 flex-col overflow-hidden`}>
          {/* ——— FORMULÁRIO DE NOVO USUÁRIO ——— */}
          {showNewUserForm && (
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 max-w-xl mx-auto space-y-6">
                {/* Botão voltar mobile */}
                <button
                  className="lg:hidden flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => { setShowNewUserForm(false); setPanel("list"); }}
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </button>
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-green-600" />
                    Novo Usuário
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">Preencha os dados básicos para criar o usuário. As permissões podem ser configuradas depois.</p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Username *</label>
                      <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="ex: joao.silva" className="h-9" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Nome *</label>
                      <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome completo" className="h-9" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">E-mail</label>
                    <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@empresa.com" type="email" className="h-9" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Perfil</label>
                      <Select value={newRole} onValueChange={v => setNewRole(v as any)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">Usuário</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          {isMaster && <SelectItem value="admin_master">Admin Master</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Senha (opcional)</label>
                      <Input value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Deixe em branco para padrão" type="password" className="h-9" />
                    </div>
                  </div>

                  {/* Empresas */}
                  {newRole !== "admin_master" && allCompaniesQuery.data && allCompaniesQuery.data.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-2">Empresas com acesso</label>
                      <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto">
                        {allCompaniesQuery.data.map((c: any) => (
                          <label key={c.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm transition-colors ${
                            newCompanyIds.includes(c.id) ? "bg-blue-50 border-blue-300" : "bg-secondary/20 border-border hover:bg-secondary/40"
                          }`}>
                            <input type="checkbox" className="rounded" checked={newCompanyIds.includes(c.id)}
                              onChange={e => setNewCompanyIds(e.target.checked ? [...newCompanyIds, c.id] : newCompanyIds.filter(id => id !== c.id))}
                            />
                            {c.nomeFantasia || c.razaoSocial}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button
                    className="gap-2 bg-green-600 hover:bg-green-700"
                    onClick={handleCreate}
                    disabled={createUserMut.isPending}
                  >
                    <UserPlus className="h-4 w-4" />
                    {createUserMut.isPending ? "Criando..." : "Criar Usuário"}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowNewUserForm(false); setPanel("list"); }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ——— DETALHE DO USUÁRIO ——— */}
          {selectedUser && !showNewUserForm && (
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6">
                {/* Botão voltar mobile */}
                <button
                  className="lg:hidden flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setPanel("list")}
                >
                  <ArrowLeft className="h-4 w-4" /> Todos os usuários
                </button>

                {/* Header do usuário */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={`h-14 w-14 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0 ${
                      selectedUser.role === "admin_master" ? "bg-purple-600" : selectedUser.role === "admin" ? "bg-blue-600" : "bg-gray-500"
                    }`}>
                      {(selectedUser.name || selectedUser.username || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">{selectedUser.name || selectedUser.username}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${ROLE_BADGE[selectedUser.role]}`}>
                          {ROLE_LABELS[selectedUser.role] || selectedUser.role}
                        </span>
                        <span className="text-sm text-muted-foreground">{selectedUser.email || selectedUser.username}</span>
                      </div>
                    </div>
                  </div>
                  {/* Ações rápidas */}
                  <div className="flex gap-2 shrink-0">
                    {isAdmin && selectedUser.id !== user?.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs h-8"
                        onClick={() => {
                          if (confirm(`Resetar senha de ${selectedUser.name}?`)) {
                            resetPwdMut.mutate({ userId: selectedUser.id });
                          }
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Resetar senha
                      </Button>
                    )}
                    {isMaster && selectedUser.id !== user?.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs h-8 text-red-600 hover:text-red-700 hover:border-red-300"
                        onClick={() => {
                          if (confirm(`Excluir usuário "${selectedUser.name}"? Esta ação não pode ser desfeita.`)) {
                            deleteUserMut.mutate({ userId: selectedUser.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </Button>
                    )}
                  </div>
                </div>

                {/* ---- SEÇÃO 1: Dados básicos ---- */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <User className="h-4 w-4" /> Dados do Usuário
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Nome</label>
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-9" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">E-mail</label>
                      <div className="relative">
                        <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} className="pl-8 h-9" type="email" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Username</label>
                      <Input value={editUsername} onChange={e => setEditUsername(e.target.value)} className="h-9" />
                    </div>
                    {isAdmin && selectedUser.id !== user?.id && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1">Perfil de acesso</label>
                        <Select value={editRole} onValueChange={setEditRole}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">Usuário</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            {isMaster && <SelectItem value="admin_master">Admin Master</SelectItem>}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="md:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Nova senha (deixe em branco para manter)</label>
                      <div className="relative max-w-sm">
                        <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={editPassword}
                          onChange={e => setEditPassword(e.target.value)}
                          type={showPassword ? "text" : "password"}
                          className="pl-8 pr-9 h-9"
                          placeholder="Nova senha..."
                        />
                        <button
                          type="button"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* ---- SEÇÃO 2: Empresas ---- */}
                {editRole !== "admin_master" && isAdmin && allCompaniesQuery.data && allCompaniesQuery.data.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <Building2 className="h-4 w-4" /> Empresas com Acesso
                      </h3>
                      <div className="flex gap-1.5">
                        <button
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => setEditCompanyIds(allCompaniesQuery.data!.map((c: any) => c.id))}
                        >
                          Todas
                        </button>
                        <span className="text-muted-foreground text-xs">·</span>
                        <button
                          className="text-xs text-muted-foreground hover:underline"
                          onClick={() => setEditCompanyIds([])}
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {allCompaniesQuery.data.map((c: any) => (
                        <label key={c.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm transition-colors ${
                          editCompanyIds.includes(c.id) ? "bg-blue-50 border-blue-300" : "bg-secondary/20 border-border hover:bg-secondary/40"
                        }`}>
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={editCompanyIds.includes(c.id)}
                            onChange={e => setEditCompanyIds(e.target.checked ? [...editCompanyIds, c.id] : editCompanyIds.filter(id => id !== c.id))}
                          />
                          <div className="min-w-0">
                            <span className="font-medium truncate block">{c.nomeFantasia || c.razaoSocial}</span>
                            {c.grupoEmpresarial && <span className="text-[10px] text-blue-600">{c.grupoEmpresarial}</span>}
                          </div>
                        </label>
                      ))}
                    </div>
                  </section>
                )}

                {/* ---- SEÇÃO 3: Permissões de Módulos ---- */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4" /> Acesso a Módulos
                    </h3>
                    {editRole === "admin_master" && (
                      <span className="text-xs text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                        Acesso total automático
                      </span>
                    )}
                    {editRole !== "admin_master" && (
                      <div className="flex gap-1.5">
                        <button
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => {
                            const all: Record<string, "admin" | "viewer" | null> = {};
                            ALL_MODULES.forEach(m => { all[m.id] = "admin"; });
                            setEditModuleAccess(all);
                          }}
                        >
                          Todos admin
                        </button>
                        <span className="text-muted-foreground text-xs">·</span>
                        <button
                          className="text-xs text-muted-foreground hover:underline"
                          onClick={() => setEditModuleAccess({})}
                        >
                          Limpar
                        </button>
                      </div>
                    )}
                  </div>

                  {editRole === "admin_master" ? (
                    <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <Shield className="h-4 w-4 text-purple-600 shrink-0" />
                      <span className="text-sm text-purple-700">Admin Master tem acesso automático a todos os módulos e funcionalidades sem restrições.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {ALL_MODULES.map(mod => {
                        const access = editModuleAccess[mod.id] ?? null;
                        const isOn = access != null;
                        return (
                          <div
                            key={mod.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                              isOn ? "border-border bg-card shadow-sm" : "border-dashed border-border/60 bg-secondary/10"
                            }`}
                          >
                            {/* Dot colorido */}
                            <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${isOn ? mod.dot : "bg-gray-300"}`} />

                            {/* Nome + descrição */}
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm font-medium ${isOn ? "" : "text-muted-foreground"}`}>{mod.label}</span>
                              {isOn && (
                                <div className="mt-1">
                                  <Select value={access} onValueChange={v => setModuleLevel(mod.id, v as "admin" | "viewer")}>
                                    <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 shadow-none focus:ring-0 w-auto gap-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="admin">
                                        <span className="flex items-center gap-1.5">
                                          <Lock className="h-3 w-3" /> Administrador
                                        </span>
                                      </SelectItem>
                                      <SelectItem value="viewer">
                                        <span className="flex items-center gap-1.5">
                                          <Eye className="h-3 w-3" /> Somente visualização
                                        </span>
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>

                            {/* Toggle */}
                            <Switch
                              checked={isOn}
                              onCheckedChange={checked => toggleModule(mod.id, checked)}
                              className="shrink-0"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Botão de salvar */}
                <div className="flex gap-3 pt-2 border-t">
                  <Button
                    className="gap-2 bg-blue-600 hover:bg-blue-700"
                    onClick={handleSave}
                    disabled={updateUserMut.isPending || setModuleAccessMut.isPending || setCompaniesMut.isPending}
                  >
                    <Save className="h-4 w-4" />
                    {(updateUserMut.isPending || setModuleAccessMut.isPending) ? "Salvando..." : "Salvar Alterações"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setSelectedUser(null); setPanel("list"); }}
                    className="lg:hidden"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ——— PLACEHOLDER quando nada selecionado ——— */}
          {!selectedUser && !showNewUserForm && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Shield className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">Selecione um usuário</p>
                <p className="text-sm mt-1">Clique em um usuário à esquerda para gerenciar suas permissões</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
