import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Lock, Plus, Settings, Trash2, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PROFILE_TYPES, ERP_MODULES, MODULE_KEYS } from "../../../shared/modules";
import { useDefaultCompany } from "@/hooks/useDefaultCompany";

const profileLabels: Record<string, string> = {
  adm_master: "ADM Master",
  adm: "ADM",
  operacional: "Operacional",
  avaliador: "Avaliador",
  consulta: "Consulta",
};

const profileColors: Record<string, string> = {
  adm_master: "bg-red-400/10 text-red-400",
  adm: "bg-blue-400/10 text-blue-400",
  operacional: "bg-green-400/10 text-green-400",
  avaliador: "bg-purple-400/10 text-purple-400",
  consulta: "bg-gray-400/10 text-gray-400",
};

export default function Usuarios() {
  const { getInitialCompany } = useDefaultCompany();
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [permDialogOpen, setPermDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedProfileType, setSelectedProfileType] = useState<string>("");
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [permissionsState, setPermissionsState] = useState<Record<string, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }>>({});

  const { data: companies } = trpc.companies.list.useQuery();
  const companyId = selectedCompany ? parseInt(selectedCompany) : undefined;

  useEffect(() => {
    if (companies && companies.length > 0 && !selectedCompany) {
      setSelectedCompany(getInitialCompany(companies));
    }
  }, [companies, selectedCompany, getInitialCompany]);

  const utils = trpc.useUtils();
  const { data: allUsers } = trpc.profiles.listUsers.useQuery();
  const { data: profiles, isLoading } = trpc.profiles.getByCompany.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId }
  );

  const createMut = trpc.profiles.create.useMutation({
    onSuccess: () => { utils.profiles.getByCompany.invalidate(); setCreateDialogOpen(false); toast.success("Perfil criado!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const deleteMut = trpc.profiles.delete.useMutation({
    onSuccess: () => { utils.profiles.getByCompany.invalidate(); toast.success("Perfil removido!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const setPermMut = trpc.profiles.setPermissions.useMutation({
    onSuccess: () => { setPermDialogOpen(false); toast.success("Permissões atualizadas!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const { data: currentPerms } = trpc.profiles.getPermissions.useQuery(
    { profileId: editingProfileId! },
    { enabled: !!editingProfileId }
  );

  useEffect(() => {
    if (currentPerms && editingProfileId) {
      const state: Record<string, any> = {};
      currentPerms.forEach(p => {
        state[p.module] = { canView: p.canView, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
      });
      setPermissionsState(state);
    }
  }, [currentPerms, editingProfileId]);

  const handleCreateProfile = () => {
    if (!selectedUserId || !selectedProfileType || !companyId) {
      toast.error("Selecione um usuário e um perfil.");
      return;
    }
    createMut.mutate({ userId: parseInt(selectedUserId), companyId, profileType: selectedProfileType as any });
  };

  const openPermissions = (profileId: number) => {
    setEditingProfileId(profileId);
    setPermDialogOpen(true);
  };

  const savePermissions = () => {
    if (!editingProfileId) return;
    const perms = Object.entries(permissionsState).map(([module, p]) => ({
      module,
      canView: p.canView,
      canCreate: p.canCreate,
      canEdit: p.canEdit,
      canDelete: p.canDelete,
    }));
    setPermMut.mutate({ profileId: editingProfileId, permissions: perms });
  };

  const togglePerm = (module: string, field: "canView" | "canCreate" | "canEdit" | "canDelete") => {
    setPermissionsState(prev => ({
      ...prev,
      [module]: { ...prev[module], [field]: !prev[module]?.[field] },
    }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Usuários e Permissões</h1>
            <p className="text-muted-foreground text-sm mt-1">Gerencie perfis de acesso por empresa</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedCompany} onValueChange={setSelectedCompany}>
              <SelectTrigger className="w-56 bg-card border-border">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies?.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nomeFantasia || c.razaoSocial}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => { setSelectedUserId(""); setSelectedProfileType(""); setCreateDialogOpen(true); }} disabled={!companyId} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Perfil
            </Button>
          </div>
        </div>

        {/* Profiles Table */}
        {!companyId ? (
          <Card className="bg-card border-border">
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground">Selecione uma empresa.</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <Card className="bg-card border-border animate-pulse"><CardContent className="h-48" /></Card>
        ) : profiles && profiles.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Usuário</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">E-mail</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Perfil</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(({ profile, user }) => (
                  <tr key={profile.id} className="border-t border-border hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{user.name ?? "Sem nome"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${profileColors[profile.profileType] ?? ""}`}>
                        {profileLabels[profile.profileType] ?? profile.profileType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${profile.isActive ? "bg-green-400/10 text-green-400" : "bg-red-400/10 text-red-400"}`}>
                        {profile.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPermissions(profile.id)} title="Permissões">
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                          if (confirm("Remover este perfil?")) deleteMut.mutate({ id: profile.id });
                        }}>
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
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Shield className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum perfil configurado</h3>
              <p className="text-muted-foreground text-sm mb-4">Adicione perfis de acesso para os usuários desta empresa.</p>
              <Button onClick={() => setCreateDialogOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Novo Perfil</Button>
            </CardContent>
          </Card>
        )}

        {/* Profile Types Legend */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Tipos de Perfil</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {Object.entries(PROFILE_TYPES).map(([key, p]) => (
                <div key={key} className="p-3 rounded-lg bg-secondary/30">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${profileColors[key] ?? ""}`}>{p.label}</span>
                  <p className="text-xs text-muted-foreground mt-2">{p.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Profile Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-3xl w-[85vw] max-h-[90vh] overflow-y-auto bg-card p-6">
          <DialogHeader>
            <DialogTitle>Novo Perfil de Acesso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Usuário</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="bg-input"><SelectValue placeholder="Selecione o usuário" /></SelectTrigger>
                <SelectContent>
                  {allUsers?.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name ?? u.email ?? u.openId}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Perfil</Label>
              <Select value={selectedProfileType} onValueChange={setSelectedProfileType}>
                <SelectTrigger className="bg-input"><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PROFILE_TYPES).map(([key, p]) => (
                    <SelectItem key={key} value={key}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProfileType ? (
                <p className="text-xs text-muted-foreground mt-1">
                  {PROFILE_TYPES[selectedProfileType as keyof typeof PROFILE_TYPES]?.description}
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateProfile} disabled={createMut.isPending}>
              {createMut.isPending ? "Criando..." : "Criar Perfil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={permDialogOpen} onOpenChange={setPermDialogOpen}>
        <DialogContent className="max-w-3xl w-[85vw] max-h-[90vh] overflow-y-auto bg-card p-6">
          <DialogHeader>
            <DialogTitle>Configurar Permissões</DialogTitle>
          </DialogHeader>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermDialogOpen(false)}>Cancelar</Button>
            <Button onClick={savePermissions} disabled={setPermMut.isPending}>
              {setPermMut.isPending ? "Salvando..." : "Salvar Permissões"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
