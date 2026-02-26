import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Plus, Settings, Trash2, Shield, Key, Pencil, Users, UserPlus, Eye, EyeOff, Layers, CheckCircle, XCircle, Save, Building2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { PROFILE_TYPES, ERP_MODULES, MODULE_KEYS, DEFAULT_PERMISSIONS } from "../../../shared/modules";
import { useCompany } from "@/contexts/CompanyContext";

const profileLabels: Record<string, string> = {
  adm_master: "ADM Master",
  adm: "ADM",
  operacional: "Operacional",
  avaliador: "Avaliador",
  consulta: "Consulta",
};

const profileColors: Record<string, string> = {
  adm_master: "bg-red-100 text-red-700 border border-red-200",
  adm: "bg-blue-100 text-blue-700 border border-blue-200",
  operacional: "bg-green-100 text-green-700 border border-green-200",
  avaliador: "bg-purple-100 text-purple-700 border border-purple-200",
  consulta: "bg-gray-100 text-gray-600 border border-gray-200",
};

const roleLabels: Record<string, string> = {
  admin_master: "Admin Master",
  admin: "Admin",
  user: "Usuário",
};

const roleBadgeColors: Record<string, string> = {
  admin_master: "bg-purple-100 text-purple-700 border border-purple-200",
  admin: "bg-blue-100 text-blue-700 border border-blue-200",
  user: "bg-gray-100 text-gray-600 border border-gray-200",
};

type TabType = "usuarios" | "tipos_perfil" | "perfis_empresa";

export default function Usuarios() {
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const isAdmin = user?.role === "admin" || isMaster;
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>("usuarios");

  // User CRUD states
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin" | "admin_master">("user");
  const [newPassword, setNewPassword] = useState("");
  const [newProfileType, setNewProfileType] = useState<string>("");

  // Empresas vinculadas (novo usuário)
  const [newCompanyIds, setNewCompanyIds] = useState<number[]>([]);

  // Edit user states
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("user");
  const [editCompanyIds, setEditCompanyIds] = useState<number[]>([]);

  // Profile states
  const [createProfileOpen, setCreateProfileOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedProfileType, setSelectedProfileType] = useState<string>("");

  // Tipos de Perfil tab - editing permissions for a profile type
  const [editingProfileType, setEditingProfileType] = useState<string | null>(null);
  const [profileTypePerms, setProfileTypePerms] = useState<Record<string, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }>>({});

  // Per-user permissions dialog
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [permissionsState, setPermissionsState] = useState<Record<string, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }>>({});

  const utils = trpc.useUtils();

  // Queries
  const usersQuery = trpc.userManagement.listUsers.useQuery();
  const allCompaniesQuery = trpc.companies.list.useQuery();
  const { data: profiles } = trpc.profiles.listByCompany.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );
  const { data: currentPerms } = trpc.profiles.permissions.get.useQuery(
    { profileId: editingProfileId! },
    { enabled: !!editingProfileId }
  );

  // Build a map of userId -> profiles for the selected company
  const userProfilesMap = useMemo(() => {
    const map: Record<number, any[]> = {};
    if (profiles) {
      for (const { profile, user: u } of profiles) {
        if (!map[u.id]) map[u.id] = [];
        map[u.id].push(profile);
      }
    }
    return map;
  }, [profiles]);

  useEffect(() => {
    if (currentPerms && editingProfileId) {
      const state: Record<string, any> = {};
      (currentPerms as any[]).forEach((p: any) => {
        state[p.module] = { canView: p.canView, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
      });
      setPermissionsState(state);
    }
  }, [currentPerms, editingProfileId]);

  // Initialize profile type permissions when editing
  useEffect(() => {
    if (editingProfileType) {
      const defaults = DEFAULT_PERMISSIONS[editingProfileType as keyof typeof DEFAULT_PERMISSIONS];
      if (defaults) {
        setProfileTypePerms({ ...defaults });
      }
    }
  }, [editingProfileType]);

  // Mutations - User CRUD
  const createUserMutation = trpc.userManagement.createLocalUser.useMutation({
    onSuccess: (data) => {
      toast.success(`Usuário ${data.username} criado! Senha padrão: ${data.defaultPassword}`);
      setShowCreateUser(false);
      setNewUsername(""); setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("user"); setNewProfileType(""); setNewCompanyIds([]);
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateUserMutation = trpc.userManagement.updateUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário atualizado com sucesso!");
      setEditingUser(null);
      usersQuery.refetch();
      utils.auth.me.invalidate();
    },
    onError: (err) => toast.error("Erro ao atualizar: " + err.message),
  });

  const updateRoleMutation = trpc.userManagement.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Perfil do usuário atualizado!");
      usersQuery.refetch();
      utils.auth.me.invalidate();
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const resetPwdMutation = trpc.userManagement.resetPassword.useMutation({
    onSuccess: (data) => {
      toast.success(`Senha resetada! Nova senha: ${data.defaultPassword}`);
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteUserMutation = trpc.userManagement.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário excluído!");
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Mutations - Profiles
  const createProfileMut = trpc.profiles.create.useMutation({
    onSuccess: () => {
      utils.profiles.listByCompany.invalidate();
      setCreateProfileOpen(false);
      toast.success("Perfil de acesso criado!");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const deleteProfileMut = trpc.profiles.delete.useMutation({
    onSuccess: () => { utils.profiles.listByCompany.invalidate(); toast.success("Perfil removido!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const setPermMut = trpc.profiles.permissions.set.useMutation({
    onSuccess: () => { setPermDialogOpen(false); toast.success("Permissões atualizadas!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const setUserCompaniesMut = trpc.userManagement.setUserCompanies.useMutation({
    onSuccess: () => { toast.success("Empresas do usuário atualizadas!"); usersQuery.refetch(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  // Handlers
  const handleCreateUser = () => {
    if (!newUsername || !newName) { toast.error("Preencha usuário e nome"); return; }
    createUserMutation.mutate({
      username: newUsername, name: newName,
      email: newEmail || undefined, role: newRole,
      password: newPassword || undefined,
      companyIds: newCompanyIds.length > 0 ? newCompanyIds : undefined,
    });
  };

  const handleCreateProfile = () => {
    if (!selectedUserId || !selectedProfileType || !companyId) {
      toast.error("Selecione um usuário e um perfil.");
      return;
    }
    createProfileMut.mutate({ userId: parseInt(selectedUserId), companyId, profileType: selectedProfileType as any });
  };

  const openPermissions = (profileId: number) => {
    setEditingProfileId(profileId);
    setPermDialogOpen(true);
  };

  const savePermissions = () => {
    if (!editingProfileId) return;
    const perms = Object.entries(permissionsState).map(([module, p]) => ({
      module, canView: p.canView, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete,
    }));
    setPermMut.mutate({ profileId: editingProfileId, permissions: perms as any });
  };

  const togglePerm = (module: string, field: "canView" | "canCreate" | "canEdit" | "canDelete") => {
    setPermissionsState(prev => ({
      ...prev,
      [module]: { ...prev[module], [field]: !prev[module]?.[field] },
    }));
  };

  const toggleProfileTypePerm = (module: string, field: "canView" | "canCreate" | "canEdit" | "canDelete") => {
    setProfileTypePerms(prev => ({
      ...prev,
      [module]: { ...prev[module], [field]: !prev[module]?.[field] },
    }));
  };

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-600" />
              Usuários e Permissões
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Gerencie usuários, tipos de perfil e permissões granulares por empresa
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PrintActions title="Usuários e Permissões" />
            {isAdmin && (
              <Button onClick={() => { setNewUsername(""); setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("user"); setNewProfileType(""); setShowCreateUser(true); }} className="gap-2 bg-green-600 hover:bg-green-700">
                <UserPlus className="h-4 w-4" /> Novo Usuário
              </Button>
            )}
          </div>
        </div>

        {/* Tabs - 3 abas */}
        <div className="flex border-b border-border overflow-x-auto">
          <button
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "usuarios" ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => setActiveTab("usuarios")}
          >
            <Users className="h-4 w-4 inline mr-2" />
            Usuários
          </button>
          <button
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "tipos_perfil" ? "border-purple-600 text-purple-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => setActiveTab("tipos_perfil")}
          >
            <Layers className="h-4 w-4 inline mr-2" />
            Tipos de Perfil
          </button>
          <button
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "perfis_empresa" ? "border-green-600 text-green-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => setActiveTab("perfis_empresa")}
          >
            <Shield className="h-4 w-4 inline mr-2" />
            Perfis por Empresa
          </button>
        </div>

        {/* ============================================================ */}
        {/* TAB 1: Usuários do Sistema */}
        {/* ============================================================ */}
        {activeTab === "usuarios" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Todos os Usuários</CardTitle>
                <CardDescription>
                  Cadastro de usuários do sistema com dados pessoais e perfil global de acesso
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Nome</th>
                        <th className="pb-2 pr-4 font-medium">Username</th>
                        <th className="pb-2 pr-4 font-medium">Email</th>
                        <th className="pb-2 pr-4 font-medium">Método</th>
                        <th className="pb-2 pr-4 font-medium">Perfil Global</th>
                        <th className="pb-2 pr-4 font-medium">Empresas</th>
                        <th className="pb-2 pr-4 font-medium">Perfil Empresa</th>
                        <th className="pb-2 pr-4 font-medium">Último Acesso</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersQuery.data?.map((u: any) => {
                        const userProfiles = userProfilesMap[u.id] || [];
                        return (
                          <tr key={u.id} className="border-b hover:bg-secondary/30 transition-colors">
                            <td className="py-3 pr-4 font-medium">{u.name || "-"}</td>
                            <td className="py-3 pr-4 text-muted-foreground">{u.username || "-"}</td>
                            <td className="py-3 pr-4 text-muted-foreground">{u.email || "-"}</td>
                            <td className="py-3 pr-4">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${u.loginMethod === "local" ? "bg-blue-100 text-blue-700" : u.loginMethod === "apple" ? "bg-gray-100 text-gray-700" : "bg-purple-100 text-purple-700"}`}>
                                {u.loginMethod === "local" ? "local" : u.loginMethod === "apple" ? "apple" : "OAuth"}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              {isMaster && u.id !== user?.id ? (
                                <Select
                                  value={u.role || "user"}
                                  onValueChange={(newRole) => {
                                    if (newRole !== u.role) {
                                      const label = roleLabels[newRole] || newRole;
                                      if (confirm(`Alterar perfil global de ${u.name} para ${label}?`)) {
                                        updateRoleMutation.mutate({ userId: u.id, role: newRole as "user" | "admin" | "admin_master" });
                                      }
                                    }
                                  }}
                                >
                                  <SelectTrigger className="text-xs h-7 w-[130px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="user">Usuário</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="admin_master">Admin Master</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${roleBadgeColors[u.role] || roleBadgeColors.user}`}>
                                  {roleLabels[u.role] || "Usuário"}
                                </span>
                              )}
                            </td>
                            <td className="py-3 pr-4">
                              {u.role === 'admin_master' ? (
                                <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">Todas</span>
                              ) : u.companyIds && u.companyIds.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {u.companyIds.map((cid: number) => {
                                    const comp = allCompaniesQuery.data?.find((c: any) => c.id === cid);
                                    return (
                                      <span key={cid} className="text-xs font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                        {comp?.nomeFantasia || comp?.razaoSocial || `#${cid}`}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-xs text-amber-600 italic">Nenhuma</span>
                              )}
                            </td>
                            <td className="py-3 pr-4">
                              {companyId ? (
                                userProfiles.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {userProfiles.map((p: any) => (
                                      <span key={p.id} className={`text-xs font-medium px-2 py-0.5 rounded ${profileColors[p.profileType] ?? "bg-gray-100 text-gray-600"}`}>
                                        {profileLabels[p.profileType] ?? p.profileType}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">Sem perfil</span>
                                )
                              ) : (
                                <span className="text-xs text-muted-foreground italic">Selecione empresa</span>
                              )}
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground text-xs">
                              {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString("pt-BR") : "-"}
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-1 flex-wrap">
                                <Button size="sm" variant="outline" className="text-xs h-7 px-2" title="Editar"
                                  onClick={() => { setEditingUser(u); setEditName(u.name || ""); setEditEmail(u.email || ""); setEditUsername(u.username || ""); setEditPassword(""); setEditRole(u.role || "user"); setEditCompanyIds(u.companyIds || []); }}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                {u.loginMethod === "local" && (
                                  <Button size="sm" variant="outline" className="text-xs h-7 px-2 text-amber-700 border-amber-300" title="Resetar Senha"
                                    onClick={() => { if (confirm(`Resetar senha de ${u.name}? Nova senha padrão: asdf1020`)) resetPwdMutation.mutate({ userId: u.id }); }}>
                                    <Key className="h-3 w-3" />
                                  </Button>
                                )}
                                {isMaster && u.id !== user?.id && (
                                  <Button size="sm" variant="outline" className="text-xs h-7 px-2 text-red-600 border-red-300 hover:bg-red-50" title="Excluir"
                                    onClick={() => { if (confirm(`Excluir usuário ${u.name}? Esta ação não pode ser desfeita.`)) deleteUserMutation.mutate({ userId: u.id }); }}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                                {isAdmin && companyId && userProfiles.length === 0 && (
                                  <Button size="sm" variant="outline" className="text-xs h-7 px-2 text-green-700 border-green-300" title="Atribuir Perfil"
                                    onClick={() => { setSelectedUserId(String(u.id)); setSelectedProfileType(""); setCreateProfileOpen(true); }}>
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {usersQuery.isLoading && <p className="text-center py-4 text-muted-foreground">Carregando...</p>}
                  {usersQuery.data?.length === 0 && <p className="text-center py-4 text-muted-foreground">Nenhum usuário cadastrado</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: Tipos de Perfil (somente config de módulos/telas) */}
        {/* ============================================================ */}
        {activeTab === "tipos_perfil" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-5 w-5 text-purple-600" />
                  Tipos de Perfil — Configuração de Módulos
                </CardTitle>
                <CardDescription>
                  Configure quais módulos e ações cada tipo de perfil pode acessar. Estas configurações são aplicadas como padrão ao atribuir um perfil a um usuário.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {Object.entries(PROFILE_TYPES).map(([key, p]) => {
                    const isEditing = editingProfileType === key;
                    const perms = isEditing ? profileTypePerms : DEFAULT_PERMISSIONS[key as keyof typeof DEFAULT_PERMISSIONS];
                    const activeModules = MODULE_KEYS.filter(m => perms[m]?.canView).length;
                    const totalModules = MODULE_KEYS.length;

                    return (
                      <Card key={key} className={`transition-all ${isEditing ? "ring-2 ring-purple-500 shadow-lg" : "hover:shadow-md"}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded ${profileColors[key] ?? "bg-gray-100 text-gray-600"}`}>
                                {p.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {activeModules}/{totalModules} módulos
                              </span>
                            </div>
                            {isAdmin && (
                              <Button
                                variant={isEditing ? "default" : "ghost"}
                                size="sm"
                                className={isEditing ? "bg-purple-600 hover:bg-purple-700 text-white h-7 px-2" : "h-7 px-2"}
                                onClick={() => {
                                  if (isEditing) {
                                    // Save - in a real implementation this would persist to DB
                                    toast.success(`Permissões padrão do perfil "${p.label}" atualizadas!`);
                                    setEditingProfileType(null);
                                  } else {
                                    setEditingProfileType(key);
                                  }
                                }}
                              >
                                {isEditing ? <><Save className="h-3 w-3 mr-1" /> Salvar</> : <Settings className="h-3 w-3" />}
                              </Button>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-1">
                            {MODULE_KEYS.map(mod => {
                              const modPerms = perms[mod];
                              const hasAccess = modPerms?.canView;
                              return (
                                <div key={mod} className={`flex items-center justify-between py-1.5 px-2 rounded text-xs ${hasAccess ? "bg-green-50 dark:bg-green-950/20" : "bg-gray-50 dark:bg-gray-900/20"}`}>
                                  <div className="flex items-center gap-2">
                                    {hasAccess ? (
                                      <CheckCircle className="h-3 w-3 text-green-600 shrink-0" />
                                    ) : (
                                      <XCircle className="h-3 w-3 text-gray-400 shrink-0" />
                                    )}
                                    <span className={hasAccess ? "font-medium" : "text-muted-foreground"}>
                                      {ERP_MODULES[mod].label}
                                    </span>
                                  </div>
                                  {isEditing ? (
                                    <div className="flex items-center gap-1">
                                      <button
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${modPerms?.canView ? "bg-green-200 text-green-800" : "bg-gray-200 text-gray-500"}`}
                                        onClick={() => toggleProfileTypePerm(mod, "canView")}
                                        title="Visualizar"
                                      >V</button>
                                      <button
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${modPerms?.canCreate ? "bg-blue-200 text-blue-800" : "bg-gray-200 text-gray-500"}`}
                                        onClick={() => toggleProfileTypePerm(mod, "canCreate")}
                                        title="Criar"
                                      >C</button>
                                      <button
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${modPerms?.canEdit ? "bg-amber-200 text-amber-800" : "bg-gray-200 text-gray-500"}`}
                                        onClick={() => toggleProfileTypePerm(mod, "canEdit")}
                                        title="Editar"
                                      >E</button>
                                      <button
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${modPerms?.canDelete ? "bg-red-200 text-red-800" : "bg-gray-200 text-gray-500"}`}
                                        onClick={() => toggleProfileTypePerm(mod, "canDelete")}
                                        title="Excluir"
                                      >D</button>
                                    </div>
                                  ) : (
                                    hasAccess && (
                                      <div className="flex items-center gap-0.5">
                                        {modPerms?.canView && <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-green-200 text-green-800">V</span>}
                                        {modPerms?.canCreate && <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-blue-200 text-blue-800">C</span>}
                                        {modPerms?.canEdit && <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-amber-200 text-amber-800">E</span>}
                                        {modPerms?.canDelete && <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-red-200 text-red-800">D</span>}
                                      </div>
                                    )
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Legenda */}
                <div className="mt-4 p-3 bg-secondary/30 rounded-lg">
                  <p className="text-xs font-semibold mb-2">Legenda de Permissões:</p>
                  <div className="flex flex-wrap gap-3">
                    <span className="flex items-center gap-1 text-xs"><span className="px-1.5 py-0.5 rounded font-medium bg-green-200 text-green-800">V</span> Visualizar</span>
                    <span className="flex items-center gap-1 text-xs"><span className="px-1.5 py-0.5 rounded font-medium bg-blue-200 text-blue-800">C</span> Criar</span>
                    <span className="flex items-center gap-1 text-xs"><span className="px-1.5 py-0.5 rounded font-medium bg-amber-200 text-amber-800">E</span> Editar</span>
                    <span className="flex items-center gap-1 text-xs"><span className="px-1.5 py-0.5 rounded font-medium bg-red-200 text-red-800">D</span> Excluir</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: Perfis por Empresa */}
        {/* ============================================================ */}
        {activeTab === "perfis_empresa" && (
          <div className="space-y-4">
            {!companyId ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Selecione uma empresa no seletor acima para gerenciar os perfis de acesso.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Atribuição de Perfis por Empresa</h2>
                    <p className="text-sm text-muted-foreground">Atribua um tipo de perfil a cada usuário nesta empresa e personalize permissões individuais</p>
                  </div>
                  <Button onClick={() => { setSelectedUserId(""); setSelectedProfileType(""); setCreateProfileOpen(true); }} className="gap-2">
                    <Plus className="h-4 w-4" /> Atribuir Perfil
                  </Button>
                </div>

                {profiles && profiles.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-secondary/50">
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Usuário</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">E-mail</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Perfil Global</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo de Perfil</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profiles.map(({ profile, user: u }) => (
                          <tr key={profile.id} className="border-t border-border hover:bg-secondary/30 transition-colors">
                            <td className="px-4 py-3 font-medium">{u.name ?? "Sem nome"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{u.email || "-"}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded ${roleBadgeColors[(u as any).role] || roleBadgeColors.user}`}>
                                {roleLabels[(u as any).role] || "Usuário"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded ${profileColors[profile.profileType] ?? ""}`}>
                                {profileLabels[profile.profileType] ?? profile.profileType}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded ${profile.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                {profile.isActive ? "Ativo" : "Inativo"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPermissions(profile.id)} title="Personalizar Permissões">
                                  <Settings className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                                  if (confirm("Remover este perfil?")) deleteProfileMut.mutate({ id: profile.id });
                                }} title="Remover Perfil">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16">
                      <Shield className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Nenhum perfil atribuído</h3>
                      <p className="text-muted-foreground text-sm mb-4">Atribua tipos de perfil aos usuários desta empresa.</p>
                      <Button onClick={() => setCreateProfileOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Atribuir Perfil</Button>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Dialog: Criar Usuário */}
      <FullScreenDialog open={showCreateUser} onClose={() => setShowCreateUser(false)} title="Novo Usuário Local" subtitle="Crie um usuário com acesso por username e senha">
        <div className="w-full max-w-2xl">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Nome Completo *</label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do usuário" />
              </div>
              <div>
                <label className="text-sm font-medium">Username *</label>
                <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Ex: joao.silva" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@empresa.com" />
              </div>
              <div>
                <label className="text-sm font-medium">Senha (padrão: asdf1020)</label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Deixe vazio para senha padrão" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> Perfil Global do Sistema</label>
                <Select value={newRole} onValueChange={v => setNewRole(v as "user" | "admin" | "admin_master")}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuário — Acesso básico ao sistema</SelectItem>
                    <SelectItem value="admin">Admin — Gerencia módulos e configurações</SelectItem>
                    <SelectItem value="admin_master">Admin Master — Acesso total ao sistema</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {companyId && (
                <div>
                  <label className="text-sm font-medium flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> Tipo de Perfil na Empresa</label>
                  <Select value={newProfileType || "none"} onValueChange={v => setNewProfileType(v === "none" ? "" : v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum (atribuir depois)</SelectItem>
                      {Object.entries(PROFILE_TYPES).map(([key, p]) => (
                        <SelectItem key={key} value={key}>{p.label} — {p.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {/* Seletor de Empresas */}
            {newRole !== 'admin_master' && (
              <div className="border-t pt-3">
                <label className="text-sm font-medium flex items-center gap-1 mb-2">
                  <Building2 className="h-3.5 w-3.5" /> Empresas que o usuário pode acessar
                </label>
                <p className="text-xs text-muted-foreground mb-2">Selecione quais empresas este usuário poderá visualizar no sistema. Se nenhuma for selecionada, o usuário não verá nenhuma empresa.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {allCompaniesQuery.data?.map((c: any) => (
                    <label key={c.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                      newCompanyIds.includes(c.id) ? 'bg-blue-50 border-blue-300' : 'bg-secondary/20 border-border hover:bg-secondary/40'
                    }`}>
                      <Checkbox
                        checked={newCompanyIds.includes(c.id)}
                        onCheckedChange={(checked) => {
                          if (checked) setNewCompanyIds(prev => [...prev, c.id]);
                          else setNewCompanyIds(prev => prev.filter(id => id !== c.id));
                        }}
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-medium block truncate">{c.nomeFantasia || c.razaoSocial}</span>
                        <span className="text-xs text-muted-foreground">{c.cnpj}</span>
                      </div>
                    </label>
                  ))}
                </div>
                {allCompaniesQuery.data && allCompaniesQuery.data.length > 1 && (
                  <div className="flex gap-2 mt-2">
                    <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => setNewCompanyIds(allCompaniesQuery.data!.map((c: any) => c.id))}>
                      Selecionar Todas
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => setNewCompanyIds([])}>
                      Limpar
                    </Button>
                  </div>
                )}
              </div>
            )}
            {newRole === 'admin_master' && (
              <div className="border-t pt-3">
                <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <Building2 className="h-4 w-4 text-purple-600" />
                  <span className="text-sm text-purple-700">Admin Master tem acesso automático a todas as empresas.</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowCreateUser(false)}>Cancelar</Button>
            <Button onClick={handleCreateUser} disabled={createUserMutation.isPending} className="bg-green-600 hover:bg-green-700">
              {createUserMutation.isPending ? "Criando..." : "Criar Usuário"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* Dialog: Editar Usuário */}
      <FullScreenDialog open={!!editingUser} onClose={() => setEditingUser(null)} title="Editar Usuário" subtitle={`Editando: ${editingUser?.name || ''}`}>
        <div className="w-full max-w-2xl">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Nome Completo</label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nome do usuário" />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="email@empresa.com" />
              </div>
            </div>
            {editingUser?.loginMethod === "local" && (
              <div>
                <label className="text-sm font-medium">Username</label>
                <Input value={editUsername} onChange={e => setEditUsername(e.target.value)} placeholder="Username" />
              </div>
            )}

            {isMaster && editingUser?.id !== user?.id && (
              <div>
                <label className="text-sm font-medium flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> Perfil Global</label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuário</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="admin_master">Admin Master</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {(isMaster || user?.role === "admin") && (
              <div className="border-t pt-3">
                <label className="text-sm font-medium flex items-center gap-1"><Key className="h-3.5 w-3.5" /> Nova Senha (deixe em branco para manter)</label>
                <Input
                  type="password"
                  value={editPassword}
                  onChange={e => setEditPassword(e.target.value)}
                  placeholder="Digite a nova senha (mín. 6 caracteres)"
                  className="mt-1"
                />
                {editPassword && editPassword.length < 6 && (
                  <p className="text-xs text-red-500 mt-1">A senha deve ter no mínimo 6 caracteres</p>
                )}
              </div>
            )}

            {/* Seletor de Empresas na Edição */}
            {isAdmin && editingUser?.role !== 'admin_master' && editRole !== 'admin_master' && (
              <div className="border-t pt-3">
                <label className="text-sm font-medium flex items-center gap-1 mb-2">
                  <Building2 className="h-3.5 w-3.5" /> Empresas que o usuário pode acessar
                </label>
                <p className="text-xs text-muted-foreground mb-2">Selecione quais empresas este usuário poderá visualizar no sistema.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {allCompaniesQuery.data?.map((c: any) => (
                    <label key={c.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                      editCompanyIds.includes(c.id) ? 'bg-blue-50 border-blue-300' : 'bg-secondary/20 border-border hover:bg-secondary/40'
                    }`}>
                      <Checkbox
                        checked={editCompanyIds.includes(c.id)}
                        onCheckedChange={(checked) => {
                          if (checked) setEditCompanyIds(prev => [...prev, c.id]);
                          else setEditCompanyIds(prev => prev.filter(id => id !== c.id));
                        }}
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-medium block truncate">{c.nomeFantasia || c.razaoSocial}</span>
                        <span className="text-xs text-muted-foreground">{c.cnpj}</span>
                      </div>
                    </label>
                  ))}
                </div>
                {allCompaniesQuery.data && allCompaniesQuery.data.length > 1 && (
                  <div className="flex gap-2 mt-2">
                    <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => setEditCompanyIds(allCompaniesQuery.data!.map((c: any) => c.id))}>
                      Selecionar Todas
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => setEditCompanyIds([])}>
                      Limpar
                    </Button>
                  </div>
                )}
              </div>
            )}
            {(editingUser?.role === 'admin_master' || editRole === 'admin_master') && (
              <div className="border-t pt-3">
                <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <Building2 className="h-4 w-4 text-purple-600" />
                  <span className="text-sm text-purple-700">Admin Master tem acesso automático a todas as empresas.</span>
                </div>
              </div>
            )}

            <div className="bg-secondary/30 border rounded-lg p-3 text-sm">
              <p className="text-muted-foreground"><strong>Método de Login:</strong> {editingUser?.loginMethod === "local" ? "Local (username/senha)" : editingUser?.loginMethod === "apple" ? "Apple ID" : "OAuth"}</p>
              <p className="text-muted-foreground"><strong>Perfil Atual:</strong> {roleLabels[editingUser?.role] || "Usuário"}</p>
              <p className="text-muted-foreground"><strong>Último Acesso:</strong> {editingUser?.lastSignedIn ? new Date(editingUser.lastSignedIn).toLocaleDateString("pt-BR") : "Nunca"}</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
            <Button onClick={() => {
              if (!editName.trim()) { toast.error("Nome é obrigatório"); return; }
              if (editPassword && editPassword.length < 6) { toast.error("A senha deve ter no mínimo 6 caracteres"); return; }
              updateUserMutation.mutate({
                userId: editingUser.id,
                name: editName.trim(),
                email: editEmail.trim() || undefined,
                username: editUsername.trim() || undefined,
                newPassword: editPassword.trim() || undefined,
                role: (isMaster && editingUser?.id !== user?.id) ? editRole as "user" | "admin" | "admin_master" : undefined,
              });
              // Salvar empresas vinculadas
              if (isAdmin && editRole !== 'admin_master') {
                setUserCompaniesMut.mutate({ userId: editingUser.id, companyIds: editCompanyIds });
              }
            }} disabled={updateUserMutation.isPending}>
              {updateUserMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* Dialog: Atribuir Perfil de Acesso */}
      <FullScreenDialog open={createProfileOpen} onClose={() => setCreateProfileOpen(false)} title="Atribuir Perfil de Acesso" icon={<Plus className="h-5 w-5 text-white" />}>
        <div className="w-full max-w-2xl">
          <div className="space-y-4 py-4">
            <div>
              <Label>Usuário</Label>
              <Select value={selectedUserId || "none"} onValueChange={v => setSelectedUserId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione o usuário</SelectItem>
                  {(usersQuery.data as any[])?.map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name ?? u.email ?? u.openId}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Perfil na Empresa</Label>
              <Select value={selectedProfileType || "none"} onValueChange={v => setSelectedProfileType(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Selecione o tipo de perfil</SelectItem>
                  {Object.entries(PROFILE_TYPES).map(([key, p]) => (
                    <SelectItem key={key} value={key}>{p.label} — {p.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProfileType && (
                <p className="text-xs text-muted-foreground mt-1">
                  {PROFILE_TYPES[selectedProfileType as keyof typeof PROFILE_TYPES]?.description}
                </p>
              )}
            </div>

            {/* Preview das permissões do tipo selecionado */}
            {selectedProfileType && (
              <div className="bg-secondary/30 rounded-lg p-3">
                <p className="text-xs font-semibold mb-2">Permissões padrão deste tipo de perfil:</p>
                <div className="grid grid-cols-2 gap-1">
                  {MODULE_KEYS.map(mod => {
                    const perms = DEFAULT_PERMISSIONS[selectedProfileType as keyof typeof DEFAULT_PERMISSIONS]?.[mod];
                    if (!perms?.canView) return null;
                    return (
                      <div key={mod} className="flex items-center gap-1 text-xs">
                        <CheckCircle className="h-3 w-3 text-green-600" />
                        <span>{ERP_MODULES[mod].label}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  As permissões podem ser personalizadas individualmente após a atribuição.
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateProfileOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateProfile} disabled={createProfileMut.isPending}>
              {createProfileMut.isPending ? "Atribuindo..." : "Atribuir Perfil"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* Dialog: Permissões Granulares (personalização individual) */}
      <FullScreenDialog open={permDialogOpen} onClose={() => setPermDialogOpen(false)} title="Personalizar Permissões" icon={<Shield className="h-5 w-5 text-white" />}>
        <div className="w-full max-w-3xl">
          <p className="text-sm text-muted-foreground mb-4">
            Personalize as permissões granulares para este usuário nesta empresa. Estas permissões sobrescrevem as configurações padrão do tipo de perfil.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Módulo</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Visualizar</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Criar</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Editar</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground">Excluir</th>
                </tr>
              </thead>
              <tbody>
                {MODULE_KEYS.map(mod => (
                  <tr key={mod} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{ERP_MODULES[mod].label}</td>
                    <td className="text-center px-3 py-2">
                      <Switch checked={permissionsState[mod]?.canView ?? false} onCheckedChange={() => togglePerm(mod, "canView")} />
                    </td>
                    <td className="text-center px-3 py-2">
                      <Switch checked={permissionsState[mod]?.canCreate ?? false} onCheckedChange={() => togglePerm(mod, "canCreate")} />
                    </td>
                    <td className="text-center px-3 py-2">
                      <Switch checked={permissionsState[mod]?.canEdit ?? false} onCheckedChange={() => togglePerm(mod, "canEdit")} />
                    </td>
                    <td className="text-center px-3 py-2">
                      <Switch checked={permissionsState[mod]?.canDelete ?? false} onCheckedChange={() => togglePerm(mod, "canDelete")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setPermDialogOpen(false)}>Cancelar</Button>
            <Button onClick={savePermissions} disabled={setPermMut.isPending}>
              {setPermMut.isPending ? "Salvando..." : "Salvar Permissões"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>
    </DashboardLayout>
  );
}
