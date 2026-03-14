import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Plus, Shield, Key, Pencil, Users, UserPlus, Trash2, Building2, Save, ChevronRight, Search, X, ArrowLeft, CheckCircle2, XCircle, Mail, User, Lock, Eye, EyeOff, UsersRound } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { MODULE_DEFINITIONS, type ActiveModuleId } from "../../../shared/modules";
import { useCompany } from "@/contexts/CompanyContext";
import { removeAccents } from "@/lib/searchUtils";

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

const moduleColorMap: Record<string, { bg: string; border: string; text: string; activeBg: string }> = {
  "rh-dp": { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-700", activeBg: "bg-blue-100" },
  "sst": { bg: "bg-green-50", border: "border-green-300", text: "text-green-700", activeBg: "bg-green-100" },
  "juridico": { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700", activeBg: "bg-amber-100" },
};

export default function Usuarios() {
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const isAdmin = user?.role === "admin" || isMaster;
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();

  // States
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);

  // New user form
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin" | "admin_master">("user");
  const [newPassword, setNewPassword] = useState("");
  const [newCompanyIds, setNewCompanyIds] = useState<number[]>([]);
  const [newModulePerms, setNewModulePerms] = useState<Record<string, Record<string, boolean>>>({});
  const [newGroupId, setNewGroupId] = useState<number | null>(null);

  // Edit user form
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("user");
  const [editCompanyIds, setEditCompanyIds] = useState<number[]>([]);
  const [editModulePerms, setEditModulePerms] = useState<Record<string, Record<string, boolean>>>({});
  const [editPermsLoaded, setEditPermsLoaded] = useState(false);
  const [editGroupId, setEditGroupId] = useState<number | null>(null);
  const [editOriginalGroupId, setEditOriginalGroupId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // Queries
  const usersQuery = trpc.userManagement.listUsers.useQuery();
  const allCompaniesQuery = trpc.companies.list.useQuery();
  const groupsQuery = trpc.userGroups.list.useQuery();
  const allGroupMembersQuery = trpc.userGroups.listAllMembers.useQuery();

  // Load user permissions when selecting a user
  const editUserPermsQuery = trpc.userManagement.getUserPermissions.useQuery(
    { userId: selectedUser?.id ?? 0 },
    { enabled: !!selectedUser && selectedUser.role !== 'admin_master' && !editPermsLoaded }
  );

  useEffect(() => {
    if (editUserPermsQuery.data && selectedUser && !editPermsLoaded) {
      const permsMap: Record<string, Record<string, boolean>> = {};
      for (const p of editUserPermsQuery.data) {
        if (!permsMap[p.moduleId]) permsMap[p.moduleId] = {};
        permsMap[p.moduleId][p.featureKey] = p.canAccess;
      }
      setEditModulePerms(permsMap);
      setEditPermsLoaded(true);
    }
  }, [editUserPermsQuery.data, selectedUser, editPermsLoaded]);

  // Mutations
  const createUserMutation = trpc.userManagement.createLocalUser.useMutation({
    onSuccess: (data) => {
      toast.success(`Usuário ${data.username} criado! Senha padrão: ${data.defaultPassword}`);
      if (newRole !== 'admin_master' && Object.keys(newModulePerms).length > 0) {
        saveUserPermsFromState(data.id, newModulePerms);
      }
      setShowCreateUser(false);
      resetNewUserForm();
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateUserMutation = trpc.userManagement.updateUser.useMutation({
    onSuccess: () => {
      toast.success("Usuário atualizado com sucesso!");
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
      setSelectedUser(null);
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const setUserCompaniesMut = trpc.userManagement.setUserCompanies.useMutation({
    onSuccess: () => { toast.success("Empresas do usuário atualizadas!"); usersQuery.refetch(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const setUserPermsMut = trpc.userManagement.setUserPermissions.useMutation({
    onSuccess: () => { toast.success("Permissões de módulos atualizadas!"); },
    onError: (e) => toast.error("Erro ao salvar permissões: " + e.message),
  });

  const addMemberMut = trpc.userGroups.addMember.useMutation({
    onSuccess: () => { utils.userGroups.listAllMembers.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const removeMemberMut = trpc.userGroups.removeMember.useMutation({
    onSuccess: () => { utils.userGroups.listAllMembers.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // Helpers
  const toggleModulePerm = (perms: Record<string, Record<string, boolean>>, setPerms: (v: Record<string, Record<string, boolean>>) => void, moduleId: string, featureKey: string) => {
    const current = perms[moduleId]?.[featureKey] ?? false;
    setPerms({ ...perms, [moduleId]: { ...perms[moduleId], [featureKey]: !current } });
  };

  const toggleAllModuleFeatures = (perms: Record<string, Record<string, boolean>>, setPerms: (v: Record<string, Record<string, boolean>>) => void, moduleId: string, enable: boolean) => {
    const mod = MODULE_DEFINITIONS.find(m => m.id === moduleId);
    if (!mod) return;
    const updated = { ...perms };
    updated[moduleId] = {};
    for (const f of mod.features) {
      updated[moduleId][f.key] = enable;
    }
    setPerms(updated);
  };

  const saveUserPermsFromState = (userId: number, permsState: Record<string, Record<string, boolean>>) => {
    const permsList: { moduleId: string; featureKey: string; canAccess: boolean }[] = [];
    for (const mod of MODULE_DEFINITIONS) {
      for (const feat of mod.features) {
        permsList.push({
          moduleId: mod.id,
          featureKey: feat.key,
          canAccess: permsState[mod.id]?.[feat.key] ?? false,
        });
      }
    }
    setUserPermsMut.mutate({ userId, permissions: permsList });
  };

  const resetNewUserForm = () => {
    setNewUsername(""); setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("user"); setNewCompanyIds([]); setNewModulePerms({}); setNewGroupId(null);
  };

  const handleCreateUser = () => {
    if (!newUsername || !newName) { toast.error("Preencha usuário e nome"); return; }
    createUserMutation.mutate({
      username: newUsername, name: newName,
      email: newEmail || undefined, role: newRole,
      password: newPassword || undefined,
      companyIds: newCompanyIds.length > 0 ? newCompanyIds : undefined,
    }, {
      onSuccess: (data) => {
        if (newGroupId) {
          addMemberMut.mutate({ groupId: newGroupId, userId: data.id });
        }
      },
    });
  };

  const openUserConfig = (u: any) => {
    setSelectedUser(u);
    setEditName(u.name || "");
    setEditEmail(u.email || "");
    setEditUsername(u.username || "");
    setEditPassword("");
    setEditRole(u.role || "user");
    setEditCompanyIds(u.companyIds || []);
    setEditModulePerms({});
    setEditPermsLoaded(false);
    setShowPassword(false);
    // Find user's group
    const memberEntry = (allGroupMembersQuery.data || []).find((m: any) => m.userId === u.id);
    setEditGroupId(memberEntry?.groupId ?? null);
    setEditOriginalGroupId(memberEntry?.groupId ?? null);
  };

  const handleSaveUser = () => {
    if (!selectedUser) return;
    if (!editName.trim()) { toast.error("Nome é obrigatório"); return; }
    if (editPassword && editPassword.length < 6) { toast.error("A senha deve ter no mínimo 6 caracteres"); return; }

    updateUserMutation.mutate({
      userId: selectedUser.id,
      name: editName.trim(),
      email: editEmail.trim() || undefined,
      username: editUsername.trim() || undefined,
      newPassword: editPassword.trim() || undefined,
      role: ((isMaster || isAdmin) && selectedUser?.id !== user?.id) ? editRole as "user" | "admin" | "admin_master" : undefined,
    });

    if (isAdmin && editRole !== 'admin_master') {
      setUserCompaniesMut.mutate({ userId: selectedUser.id, companyIds: editCompanyIds });
    }

    if (editRole !== 'admin_master' && Object.keys(editModulePerms).length > 0) {
      saveUserPermsFromState(selectedUser.id, editModulePerms);
    }

    // Save group membership
    if (editGroupId !== editOriginalGroupId) {
      if (editOriginalGroupId) {
        removeMemberMut.mutate({ groupId: editOriginalGroupId, userId: selectedUser.id });
      }
      if (editGroupId) {
        addMemberMut.mutate({ groupId: editGroupId, userId: selectedUser.id });
      }
    }
  };

  // Filter users
  const filteredUsers = useMemo(() => {
    if (!usersQuery.data) return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return usersQuery.data;
    return usersQuery.data.filter((u: any) =>
      (u.name || "").toLowerCase().includes(term) ||
      (u.username || "").toLowerCase().includes(term) ||
      (u.email || "").toLowerCase().includes(term)
    );
  }, [usersQuery.data, searchTerm]);

  // Module permissions section component
  const ModulePermissionsSection = ({ perms, setPerms, role }: { perms: Record<string, Record<string, boolean>>; setPerms: (v: Record<string, Record<string, boolean>>) => void; role: string }) => {
    if (role === 'admin_master') {
      return (
        <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
          <Shield className="h-4 w-4 text-purple-600 shrink-0" />
          <span className="text-sm text-purple-700">Admin Master tem acesso automático a todos os módulos e funcionalidades.</span>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {MODULE_DEFINITIONS.map(mod => {
          const colors = moduleColorMap[mod.id] || moduleColorMap["rh-dp"];
          const allEnabled = mod.features.every(f => perms[mod.id]?.[f.key]);
          const someEnabled = mod.features.some(f => perms[mod.id]?.[f.key]);
          const enabledCount = mod.features.filter(f => perms[mod.id]?.[f.key]).length;

          return (
            <div key={mod.id} className={`rounded-lg border transition-all ${someEnabled ? `${colors.border} ${colors.bg}` : 'border-border bg-secondary/20'}`}>
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allEnabled}
                    onCheckedChange={(checked) => toggleAllModuleFeatures(perms, setPerms, mod.id, !!checked)}
                  />
                  <span className={`text-sm font-semibold ${someEnabled ? colors.text : ''}`}>{mod.label}</span>
                  <span className="text-xs text-muted-foreground">— {mod.description}</span>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${someEnabled ? `${colors.activeBg} ${colors.text}` : 'bg-gray-100 text-gray-500'}`}>
                  {enabledCount}/{mod.features.length}
                </span>
              </div>
              {someEnabled && (
                <div className="px-3 pb-3 grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  {mod.features.map(feat => (
                    <label key={feat.key} className={`flex items-center gap-1.5 text-xs p-1.5 rounded cursor-pointer transition-colors ${
                      perms[mod.id]?.[feat.key] ? 'bg-white/70 font-medium' : 'text-muted-foreground hover:bg-white/40'
                    }`}>
                      <Checkbox
                        checked={perms[mod.id]?.[feat.key] ?? false}
                        onCheckedChange={() => toggleModulePerm(perms, setPerms, mod.id, feat.key)}
                        className="h-3.5 w-3.5"
                      />
                      {feat.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Companies section component
  const CompaniesSection = ({ companyIds, setCompanyIds, role }: { companyIds: number[]; setCompanyIds: (v: number[]) => void; role: string }) => {
    // Extrair grupos únicos das empresas
    const grupos = useMemo(() => {
      if (!allCompaniesQuery.data) return [];
      const grupoSet = new Set<string>();
      allCompaniesQuery.data.forEach((c: any) => {
        if (c.grupoEmpresarial) grupoSet.add(c.grupoEmpresarial);
      });
      return Array.from(grupoSet).sort();
    }, [allCompaniesQuery.data]);

    const handleSelectGrupo = (grupo: string) => {
      if (grupo === '__all__') {
        setCompanyIds(allCompaniesQuery.data!.map((c: any) => c.id));
        return;
      }
      if (grupo === '__clear__') {
        setCompanyIds([]);
        return;
      }
      // Selecionar apenas as empresas do grupo escolhido
      const grupoIds = (allCompaniesQuery.data || []).filter((c: any) => c.grupoEmpresarial === grupo).map((c: any) => c.id);
      // Adicionar ao que já está selecionado (merge)
      const merged = Array.from(new Set([...companyIds, ...grupoIds]));
      setCompanyIds(merged);
    };

    if (role === 'admin_master') {
      return (
        <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
          <Building2 className="h-4 w-4 text-purple-600 shrink-0" />
          <span className="text-sm text-purple-700">Admin Master tem acesso automático a todas as empresas.</span>
        </div>
      );
    }

    return (
      <div>
        {/* Seleção rápida por grupo */}
        {grupos.length > 0 && (
          <div className="mb-3">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Selecionar por Grupo Empresarial</label>
            <div className="flex flex-wrap gap-2">
              {grupos.map(g => {
                const grupoIds = (allCompaniesQuery.data || []).filter((c: any) => c.grupoEmpresarial === g).map((c: any) => c.id);
                const allSelected = grupoIds.every((id: number) => companyIds.includes(id));
                return (
                  <Button
                    key={g}
                    type="button"
                    variant={allSelected ? "default" : "outline"}
                    size="sm"
                    className={`text-xs h-7 ${allSelected ? '' : 'hover:bg-blue-50'}`}
                    onClick={() => {
                      if (allSelected) {
                        // Desmarcar todas do grupo
                        setCompanyIds(companyIds.filter(id => !grupoIds.includes(id)));
                      } else {
                        handleSelectGrupo(g);
                      }
                    }}
                  >
                    {g} ({grupoIds.length})
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {allCompaniesQuery.data?.map((c: any) => (
            <label key={c.id} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
              companyIds.includes(c.id) ? 'bg-blue-50 border-blue-300 shadow-sm' : 'bg-secondary/20 border-border hover:bg-secondary/40'
            }`}>
              <Checkbox
                checked={companyIds.includes(c.id)}
                onCheckedChange={(checked) => {
                  if (checked) setCompanyIds([...companyIds, c.id]);
                  else setCompanyIds(companyIds.filter(id => id !== c.id));
                }}
              />
              <div className="min-w-0">
                <span className="text-sm font-medium block truncate">{c.nomeFantasia || c.razaoSocial}</span>
                <span className="text-xs text-muted-foreground">{c.cnpj}</span>
                {c.grupoEmpresarial && <span className="text-[10px] text-blue-600 font-medium">{c.grupoEmpresarial}</span>}
              </div>
            </label>
          ))}
        </div>
        {allCompaniesQuery.data && allCompaniesQuery.data.length > 1 && (
          <div className="flex gap-2 mt-2">
            <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => handleSelectGrupo('__all__')}>
              Selecionar Todas
            </Button>
            <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => handleSelectGrupo('__clear__')}>
              Limpar
            </Button>
          </div>
        )}
      </div>
    );
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
              Gerencie usuários do sistema, defina perfis de acesso, módulos e empresas
            </p>
          </div>
          <DraggableCommandBar barId="usuarios" items={[
            { id: "print", node: <PrintActions title="Usuários e Permissões" /> },
            ...(isAdmin ? [{ id: "novo", node: <Button onClick={() => { resetNewUserForm(); setShowCreateUser(true); }} className="gap-2 bg-green-600 hover:bg-green-700"><UserPlus className="h-4 w-4" /> Novo Usuário</Button> }] : []),
          ]} />
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, username ou email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Users List */}
        <div className="space-y-2">
          {usersQuery.isLoading && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Carregando usuários...</p>
              </CardContent>
            </Card>
          )}

          {filteredUsers.length === 0 && !usersQuery.isLoading && (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  {searchTerm ? "Nenhum usuário encontrado para esta busca." : "Nenhum usuário cadastrado."}
                </p>
              </CardContent>
            </Card>
          )}

          {filteredUsers.map((u: any) => {
            const moduleCount = (() => {
              if (u.role === 'admin_master') return MODULE_DEFINITIONS.length;
              return 0;
            })();
            const companyCount = u.role === 'admin_master' ? (allCompaniesQuery.data?.length || 0) : (u.companyIds?.length || 0);
            const userGroupMember = (allGroupMembersQuery.data || []).find((m: any) => m.userId === u.id);
            const userGroup = userGroupMember ? (groupsQuery.data || []).find((g: any) => g.id === userGroupMember.groupId) : null;

            return (
              <Card
                key={u.id}
                className={`cursor-pointer transition-all hover:shadow-md hover:border-blue-200 ${selectedUser?.id === u.id ? 'ring-2 ring-blue-500 border-blue-300' : ''}`}
                onClick={() => openUserConfig(u)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Avatar */}
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                        u.role === 'admin_master' ? 'bg-purple-600' : u.role === 'admin' ? 'bg-blue-600' : 'bg-gray-500'
                      }`}>
                        {(u.name || u.username || "?").charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{u.name || "Sem nome"}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${roleBadgeColors[u.role] || roleBadgeColors.user}`}>
                            {roleLabels[u.role] || "Usuário"}
                          </span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${u.loginMethod === "local" ? "bg-blue-50 text-blue-600" : u.loginMethod === "apple" ? "bg-gray-100 text-gray-600" : "bg-purple-50 text-purple-600"}`}>
                            {u.loginMethod === "local" ? "local" : u.loginMethod === "apple" ? "apple" : "OAuth"}
                          </span>
                          {userGroup && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border" style={{ backgroundColor: `${userGroup.cor}15`, color: userGroup.cor, borderColor: `${userGroup.cor}40` }}>
                              {userGroup.nome}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          {u.username && <span>@{u.username}</span>}
                          {u.email && <span className="truncate">{u.email}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Right side info */}
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Companies badge */}
                      <div className="hidden sm:flex items-center gap-1 text-xs">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className={companyCount > 0 ? "font-medium" : "text-muted-foreground"}>
                          {u.role === 'admin_master' ? 'Todas' : companyCount > 0 ? `${companyCount} empresa${companyCount > 1 ? 's' : ''}` : 'Nenhuma'}
                        </span>
                      </div>

                      {/* Last access */}
                      <div className="hidden md:block text-xs text-muted-foreground">
                        {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString("pt-BR") : "Nunca acessou"}
                      </div>

                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Summary */}
        {usersQuery.data && (
          <p className="text-xs text-muted-foreground text-center">
            {filteredUsers.length} de {usersQuery.data.length} usuário{usersQuery.data.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* ============================================================ */}
      {/* DIALOG: Novo Usuário */}
      {/* ============================================================ */}
      <FullScreenDialog open={showCreateUser} onClose={() => setShowCreateUser(false)} title="Novo Usuário" subtitle="Cadastre um novo usuário no sistema">
        <div className="w-full max-w-3xl space-y-6">
          {/* Dados Básicos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                Dados do Usuário
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Nome Completo *</label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do usuário" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Username *</label>
                  <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Login do usuário" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@empresa.com" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Senha (padrão: asdf1020)</label>
                  <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Deixe vazio para senha padrão" className="mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Perfil Global */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Perfil Global
              </CardTitle>
              <CardDescription>Define o nível de acesso geral do usuário no sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={newRole} onValueChange={v => setNewRole(v as "user" | "admin" | "admin_master")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário — Acesso básico ao sistema</SelectItem>
                  <SelectItem value="admin">Admin — Gerencia módulos e configurações</SelectItem>
                  {isMaster && <SelectItem value="admin_master">Admin Master — Acesso total ao sistema</SelectItem>}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Grupo de Usuário */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UsersRound className="h-4 w-4" />
                Grupo de Usuário
              </CardTitle>
              <CardDescription>Vincule a um grupo para herdar permissões de telas automaticamente</CardDescription>
            </CardHeader>
            <CardContent>
              {newRole === 'admin_master' ? (
                <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <Shield className="h-4 w-4 text-purple-600 shrink-0" />
                  <span className="text-sm text-purple-700">Admin Master não precisa de grupo.</span>
                </div>
              ) : (
                <Select value={newGroupId?.toString() || "none"} onValueChange={(v) => setNewGroupId(v === "none" ? null : parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um grupo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum grupo</SelectItem>
                    {(groupsQuery.data || []).map((g: any) => (
                      <SelectItem key={g.id} value={g.id.toString()}>
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.cor || '#6b7280' }} />
                          {g.nome}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          {/* Empresas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Empresas
              </CardTitle>
              <CardDescription>Selecione quais empresas este usuário poderá acessar</CardDescription>
            </CardHeader>
            <CardContent>
              <CompaniesSection companyIds={newCompanyIds} setCompanyIds={setNewCompanyIds} role={newRole} />
            </CardContent>
          </Card>

          {/* Módulos e Funcionalidades */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Módulos e Funcionalidades
              </CardTitle>
              <CardDescription>Defina quais módulos e funcionalidades este usuário pode acessar</CardDescription>
            </CardHeader>
            <CardContent>
              <ModulePermissionsSection perms={newModulePerms} setPerms={setNewModulePerms} role={newRole} />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowCreateUser(false)}>Cancelar</Button>
            <Button onClick={handleCreateUser} disabled={createUserMutation.isPending} className="bg-green-600 hover:bg-green-700 gap-2">
              {createUserMutation.isPending ? "Criando..." : <><UserPlus className="h-4 w-4" /> Criar Usuário</>}
            </Button>
          </div>
        </div>
      </FullScreenDialog>

      {/* ============================================================ */}
      {/* DIALOG: Configurar Usuário */}
      {/* ============================================================ */}
      <FullScreenDialog
        open={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        title="Configurar Usuário"
        subtitle={selectedUser?.name || ''}
      >
        {selectedUser && (
          <div className="w-full max-w-3xl space-y-6">
            {/* Dados do Usuário */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Dados do Usuário
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {selectedUser.loginMethod === "local" && isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 gap-1 text-amber-600 border-amber-300 hover:bg-amber-50"
                        onClick={() => {
                          if (confirm(`Resetar senha de ${selectedUser.name}? A nova senha será: asdf1020`)) {
                            resetPwdMutation.mutate({ userId: selectedUser.id });
                          }
                        }}
                      >
                        <Key className="h-3 w-3" /> Resetar Senha
                      </Button>
                    )}
                    {isMaster && selectedUser.id !== user?.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 gap-1 text-red-600 border-red-300 hover:bg-red-50"
                        onClick={() => {
                          if (confirm(`Excluir usuário ${selectedUser.name}? Esta ação não pode ser desfeita.`)) {
                            deleteUserMutation.mutate({ userId: selectedUser.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" /> Excluir
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Nome Completo</label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nome do usuário" className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="email@empresa.com" className="mt-1" />
                  </div>
                </div>
                {selectedUser.loginMethod === "local" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Username</label>
                      <Input value={editUsername} onChange={e => setEditUsername(e.target.value)} placeholder="Username" className="mt-1" />
                    </div>
                    {(isMaster || user?.role === "admin") && (
                      <div>
                        <label className="text-sm font-medium">Nova Senha</label>
                        <div className="relative mt-1">
                          <Input
                            type={showPassword ? "text" : "password"}
                            value={editPassword}
                            onChange={e => setEditPassword(e.target.value)}
                            placeholder="Deixe vazio para manter"
                            className="pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {editPassword && editPassword.length < 6 && (
                          <p className="text-xs text-red-500 mt-1">A senha deve ter no mínimo 6 caracteres</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Info box */}
                <div className="bg-secondary/30 border rounded-lg p-3 text-xs space-y-1">
                  <p className="text-muted-foreground"><strong>Método de Login:</strong> {selectedUser.loginMethod === "local" ? "Local (username/senha)" : selectedUser.loginMethod === "apple" ? "Apple ID" : "OAuth"}</p>
                  <p className="text-muted-foreground"><strong>Último Acesso:</strong> {selectedUser.lastSignedIn ? new Date(selectedUser.lastSignedIn).toLocaleDateString("pt-BR", { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "Nunca acessou"}</p>
                </div>
              </CardContent>
            </Card>

            {/* Perfil Global */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Perfil Global
                </CardTitle>
                <CardDescription>Define o nível de acesso geral do usuário no sistema</CardDescription>
              </CardHeader>
              <CardContent>
                {(isMaster || isAdmin) && selectedUser.id !== user?.id ? (
                  <Select value={editRole} onValueChange={setEditRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Usuário — Acesso básico ao sistema</SelectItem>
                      <SelectItem value="admin">Admin — Gerencia módulos e configurações</SelectItem>
                      {isMaster && <SelectItem value="admin_master">Admin Master — Acesso total ao sistema</SelectItem>}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium px-3 py-1.5 rounded ${roleBadgeColors[selectedUser.role] || roleBadgeColors.user}`}>
                      {roleLabels[selectedUser.role] || "Usuário"}
                    </span>
                    {selectedUser.id === user?.id && (
                      <span className="text-xs text-muted-foreground">(Você não pode alterar seu próprio perfil)</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Grupo de Usuário */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UsersRound className="h-4 w-4" />
                  Grupo de Usuário
                </CardTitle>
                <CardDescription>Vincule este usuário a um grupo para herdar permissões de telas</CardDescription>
              </CardHeader>
              <CardContent>
                {editRole === 'admin_master' ? (
                  <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <Shield className="h-4 w-4 text-purple-600 shrink-0" />
                    <span className="text-sm text-purple-700">Admin Master não precisa de grupo — tem acesso total.</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Select value={editGroupId?.toString() || "none"} onValueChange={(v) => setEditGroupId(v === "none" ? null : parseInt(v))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um grupo..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum grupo</SelectItem>
                        {(groupsQuery.data || []).map((g: any) => (
                          <SelectItem key={g.id} value={g.id.toString()}>
                            <div className="flex items-center gap-2">
                              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.cor || '#6b7280' }} />
                              {g.nome}
                              {g.somenteVisualizacao && <span className="text-[10px] text-amber-600">(somente vis.)</span>}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editGroupId && (() => {
                      const g = (groupsQuery.data || []).find((g: any) => g.id === editGroupId);
                      if (!g) return null;
                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {g.somenteVisualizacao && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Somente Visualização</span>}
                          {g.ocultarDadosSensiveis && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Oculta Dados Sensíveis</span>}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Empresas */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Empresas
                </CardTitle>
                <CardDescription>Selecione quais empresas este usuário poderá acessar</CardDescription>
              </CardHeader>
              <CardContent>
                <CompaniesSection companyIds={editCompanyIds} setCompanyIds={setEditCompanyIds} role={editRole} />
              </CardContent>
            </Card>

            {/* Módulos e Funcionalidades */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Módulos e Funcionalidades
                </CardTitle>
                <CardDescription>Defina quais módulos e funcionalidades este usuário pode acessar</CardDescription>
              </CardHeader>
              <CardContent>
                {editUserPermsQuery.isLoading && editRole !== 'admin_master' ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Carregando permissões...</p>
                ) : (
                  <ModulePermissionsSection perms={editModulePerms} setPerms={setEditModulePerms} role={editRole} />
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" onClick={() => setSelectedUser(null)} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button onClick={handleSaveUser} disabled={updateUserMutation.isPending} className="gap-2">
                {updateUserMutation.isPending ? "Salvando..." : <><Save className="h-4 w-4" /> Salvar Alterações</>}
              </Button>
            </div>
          </div>
        )}
      </FullScreenDialog>
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}
