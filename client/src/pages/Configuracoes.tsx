import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import FullScreenDialog from "@/components/FullScreenDialog";

const MODULES_LIST = [
  { key: "colaboradores", label: "Colaboradores" },
  { key: "obras", label: "Obras" },
  { key: "setores", label: "Setores" },
  { key: "funcoes", label: "Funções" },
  { key: "registros_ponto", label: "Registros de Ponto" },
  { key: "folha_pagamento", label: "Folha de Pagamento" },
  { key: "uploads_folha", label: "Uploads Folha" },
  { key: "documentos", label: "Documentos" },
  { key: "historico", label: "Histórico Funcional" },
  { key: "pagamentos_extras", label: "Pagamentos Extras" },
  { key: "adiantamentos", label: "Adiantamentos" },
  { key: "vr_beneficios", label: "VR/Benefícios" },
];

export default function Configuracoes() {
  const [showCleanDialog, setShowCleanDialog] = useState(false);
  const [cleanPassword, setCleanPassword] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // Gerenciamento de usuários
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [newPassword, setNewPassword] = useState("");

  // Troca de senha
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const usersQuery = trpc.userManagement.listUsers.useQuery();
  const cleanMutation = trpc.settings.cleanDatabase.useMutation({
    onSuccess: (data) => {
      toast.success(`Limpeza concluída! ${data.tablesCleared} tabelas limpas.`);
      setShowCleanDialog(false);
      setCleanPassword("");
      setSelectedModules([]);
    },
    onError: (err) => toast.error(err.message),
  });

  const createUserMutation = trpc.userManagement.createLocalUser.useMutation({
    onSuccess: (data) => {
      toast.success(`Usuário ${data.username} criado! Senha padrão: ${data.defaultPassword}`);
      setShowCreateUser(false);
      setNewUsername(""); setNewName(""); setNewEmail(""); setNewPassword("");
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetPwdMutation = trpc.userManagement.resetPassword.useMutation({
    onSuccess: (data) => {
      toast.success(`Senha resetada! Nova senha padrão: ${data.defaultPassword}`);
      usersQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const changePwdMutation = trpc.userManagement.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Senha alterada com sucesso!");
      setShowChangePwd(false);
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleModule = (key: string) => {
    setSelectedModules(prev =>
      prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]
    );
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedModules([]);
    } else {
      setSelectedModules(MODULES_LIST.map(m => m.key));
    }
    setSelectAll(!selectAll);
  };

  const handleClean = () => {
    if (!cleanPassword) { toast.error("Digite a senha de confirmação"); return; }
    if (selectedModules.length === 0) { toast.error("Selecione pelo menos um módulo"); return; }
    cleanMutation.mutate({ confirmPassword: cleanPassword, modules: selectedModules });
  };

  const handleCreateUser = () => {
    if (!newUsername || !newName) { toast.error("Preencha usuário e nome"); return; }
    createUserMutation.mutate({
      username: newUsername, name: newName,
      email: newEmail || undefined, role: newRole,
      password: newPassword || undefined,
    });
  };

  const handleChangePwd = () => {
    if (newPwd !== confirmPwd) { toast.error("As senhas não coincidem"); return; }
    if (newPwd.length < 4) { toast.error("Mínimo 4 caracteres"); return; }
    changePwdMutation.mutate({ currentPassword: currentPwd, newPassword: newPwd });
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Configurações</h1>

        {/* Alterar Minha Senha */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
              Alterar Minha Senha
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!showChangePwd ? (
              <Button onClick={() => setShowChangePwd(true)} variant="outline">Alterar Senha</Button>
            ) : (
              <div className="space-y-3 max-w-sm">
                <Input type="password" placeholder="Senha atual" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} />
                <Input type="password" placeholder="Nova senha" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
                <Input type="password" placeholder="Confirmar nova senha" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
                <div className="flex gap-2">
                  <Button onClick={handleChangePwd} disabled={changePwdMutation.isPending}>
                    {changePwdMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                  <Button variant="outline" onClick={() => setShowChangePwd(false)}>Cancelar</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gerenciamento de Usuários */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  Usuários do Sistema
                </CardTitle>
                <CardDescription>Gerencie os usuários com acesso local (username/senha)</CardDescription>
              </div>
              <Button onClick={() => setShowCreateUser(true)} className="bg-green-600 hover:bg-green-700">
                + Novo Usuário
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 pr-4">Nome</th>
                    <th className="pb-2 pr-4">Username</th>
                    <th className="pb-2 pr-4">Email</th>
                    <th className="pb-2 pr-4">Método</th>
                    <th className="pb-2 pr-4">Perfil</th>
                    <th className="pb-2 pr-4">Último Acesso</th>
                    <th className="pb-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {usersQuery.data?.map((u: any) => (
                    <tr key={u.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 pr-4 font-medium">{u.name || "-"}</td>
                      <td className="py-2 pr-4">{u.username || "-"}</td>
                      <td className="py-2 pr-4">{u.email || "-"}</td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${u.loginMethod === "local" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                          {u.loginMethod || "OAuth"}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${u.role === "admin" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                          {u.role === "admin" ? "Admin" : "Usuário"}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-500">
                        {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString("pt-BR") : "-"}
                      </td>
                      <td className="py-2">
                        {u.loginMethod === "local" ? (
                          <Button size="sm" variant="outline" className="text-xs"
                            onClick={() => { if (confirm(`Resetar senha de ${u.name}?`)) resetPwdMutation.mutate({ userId: u.id }); }}>
                            Resetar Senha
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {usersQuery.isLoading ? <p className="text-center py-4 text-gray-400">Carregando...</p> : null}
              {usersQuery.data?.length === 0 ? <p className="text-center py-4 text-gray-400">Nenhum usuário cadastrado</p> : null}
            </div>
          </CardContent>
        </Card>

        {/* Limpeza do Banco de Dados */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-red-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Limpeza do Banco de Dados
            </CardTitle>
            <CardDescription className="text-red-500">
              Atenção: Esta ação é irreversível! Remove permanentemente todos os dados dos módulos selecionados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setShowCleanDialog(true)}>
              Abrir Painel de Limpeza
            </Button>
          </CardContent>
        </Card>

        {/* Dialog: Criar Usuário */}
        <FullScreenDialog open={showCreateUser} onClose={() => setShowCreateUser(false)} title="Novo Usuário Local" subtitle="Crie um usuário com acesso por username e senha">
          <div className="max-w-lg mx-auto">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Nome Completo *</label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do usuário" />
              </div>
              <div>
                <label className="text-sm font-medium">Username *</label>
                <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Ex: joao.silva" />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@empresa.com" />
              </div>
              <div>
                <label className="text-sm font-medium">Senha (padrão: fc2026)</label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Deixe vazio para senha padrão" />
              </div>
              <div>
                <label className="text-sm font-medium">Perfil</label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={newRole} onChange={e => setNewRole(e.target.value as "user" | "admin")}>
                  <option value="user">Usuário</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowCreateUser(false)}>Cancelar</Button>
              <Button onClick={handleCreateUser} disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? "Criando..." : "Criar Usuário"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>

        {/* Dialog: Limpeza do Banco */}
        <FullScreenDialog open={showCleanDialog} onClose={() => setShowCleanDialog(false)} title="Limpeza do Banco de Dados" subtitle="Selecione os módulos que deseja limpar. Todos os registros serão removidos permanentemente." headerColor="bg-gradient-to-r from-red-700 to-red-500">
          <div className="max-w-3xl mx-auto">
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <input type="checkbox" checked={selectAll} onChange={toggleSelectAll} className="w-4 h-4" />
                <span className="font-medium text-sm">Selecionar Todos</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {MODULES_LIST.map(mod => (
                  <label key={mod.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={selectedModules.includes(mod.key)}
                      onChange={() => toggleModule(mod.key)}
                      className="w-4 h-4"
                    />
                    {mod.label}
                  </label>
                ))}
              </div>
              <div className="pt-4 border-t">
                <label className="text-sm font-medium text-red-600 block mb-2">
                  Senha de Confirmação (LIMPAR2026)
                </label>
                <Input
                  type="password"
                  value={cleanPassword}
                  onChange={e => setCleanPassword(e.target.value)}
                  placeholder="Digite a senha de confirmação"
                  className="border-red-300 focus:border-red-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowCleanDialog(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleClean} disabled={cleanMutation.isPending}>
                {cleanMutation.isPending ? "Limpando..." : `Limpar ${selectedModules.length} módulo(s)`}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      </div>
    </DashboardLayout>
  );
}
