import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useCompany } from "@/contexts/CompanyContext";
import { Settings, Users, Trash2, Key, Scale, Clock, FileText, AlertTriangle, Gift, Palmtree, UserX, RotateCcw, Save, ChevronRight, Info } from "lucide-react";

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

// Categorias de critérios com ícones e labels
const CATEGORIAS = [
  { key: "horas_extras", label: "Horas Extras", icon: Clock, color: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200" },
  { key: "jornada", label: "Jornada de Trabalho", icon: Clock, color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  { key: "ponto", label: "Ponto Eletrônico", icon: Clock, color: "text-indigo-600", bgColor: "bg-indigo-50", borderColor: "border-indigo-200" },
  { key: "folha", label: "Folha de Pagamento", icon: FileText, color: "text-green-600", bgColor: "bg-green-50", borderColor: "border-green-200" },
  { key: "advertencias", label: "Advertências / Disciplina", icon: AlertTriangle, color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-red-200" },
  { key: "beneficios", label: "Benefícios", icon: Gift, color: "text-purple-600", bgColor: "bg-purple-50", borderColor: "border-purple-200" },
  { key: "ferias", label: "Férias", icon: Palmtree, color: "text-teal-600", bgColor: "bg-teal-50", borderColor: "border-teal-200" },
  { key: "rescisao", label: "Rescisão", icon: UserX, color: "text-gray-600", bgColor: "bg-gray-50", borderColor: "border-gray-200" },
];

type TabKey = "criterios" | "usuarios" | "senha" | "limpeza";

export default function Configuracoes() {
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const [activeTab, setActiveTab] = useState<TabKey>("criterios");

  // Limpeza
  const [showCleanDialog, setShowCleanDialog] = useState(false);
  const [cleanPassword, setCleanPassword] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // Usuários
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

  // Critérios
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [expandedCat, setExpandedCat] = useState<string | null>("horas_extras");

  const usersQuery = trpc.userManagement.listUsers.useQuery();
  const criteriaQuery = trpc.criteria.getAll.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const initDefaultsMutation = trpc.criteria.initDefaults.useMutation({
    onSuccess: (data) => {
      if (data.created > 0) {
        toast.success(`${data.created} critérios padrão CLT inicializados!`);
      }
      criteriaQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const updateBatchMutation = trpc.criteria.updateBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.updated} critério(s) atualizado(s)!`);
      setEditedValues({});
      criteriaQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const resetMutation = trpc.criteria.resetToDefault.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.reset} critério(s) restaurado(s) ao padrão CLT!`);
      setEditedValues({});
      criteriaQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Auto-inicializar critérios quando empresa selecionada
  useEffect(() => {
    if (companyId > 0 && criteriaQuery.data && criteriaQuery.data.length === 0) {
      initDefaultsMutation.mutate({ companyId });
    }
  }, [companyId, criteriaQuery.data]);

  // Agrupar critérios por categoria
  const criteriosByCategoria = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const c of criteriaQuery.data || []) {
      if (!map[c.categoria]) map[c.categoria] = [];
      map[c.categoria].push(c);
    }
    return map;
  }, [criteriaQuery.data]);

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

  const handleSaveCriteria = (categoria: string) => {
    const criteriosToUpdate = Object.entries(editedValues)
      .filter(([chave]) => {
        const criterio = criteriaQuery.data?.find((c: any) => c.chave === chave);
        return criterio?.categoria === categoria;
      })
      .map(([chave, valor]) => ({ chave, valor }));

    if (criteriosToUpdate.length === 0) {
      toast.info("Nenhuma alteração para salvar nesta categoria");
      return;
    }
    updateBatchMutation.mutate({ companyId, criterios: criteriosToUpdate });
  };

  const handleResetCategory = (categoria: string) => {
    if (!confirm(`Restaurar todos os critérios de "${CATEGORIAS.find(c => c.key === categoria)?.label}" ao padrão CLT?`)) return;
    resetMutation.mutate({ companyId, categoria });
  };

  const hasChangesInCategory = (categoria: string) => {
    return Object.entries(editedValues).some(([chave]) => {
      const criterio = criteriaQuery.data?.find((c: any) => c.chave === chave);
      return criterio?.categoria === categoria;
    });
  };

  const isValueDifferentFromDefault = (criterio: any) => {
    const currentVal = editedValues[criterio.chave] ?? criterio.valor;
    return currentVal !== criterio.valorPadraoClt;
  };

  const tabs = [
    { key: "criterios" as TabKey, label: "Critérios do Sistema", icon: Scale },
    { key: "usuarios" as TabKey, label: "Usuários", icon: Users },
    { key: "senha" as TabKey, label: "Minha Senha", icon: Key },
    { key: "limpeza" as TabKey, label: "Limpeza de Dados", icon: Trash2 },
  ];

  const renderUnitLabel = (unidade: string) => {
    switch (unidade) {
      case "%": return "%";
      case "horas": return "h";
      case "min": return "min";
      case "dias": return "dias";
      case "meses": return "meses";
      case "qtd": return "qtd";
      case "R$": return "R$";
      case "hora": return "";
      case "mm:ss": return "";
      case "dia": return "dia";
      case "dia_util": return "dia útil";
      case "bool": return "";
      case "tipo": return "";
      default: return unidade;
    }
  };

  const renderCriterioInput = (criterio: any) => {
    const currentValue = editedValues[criterio.chave] ?? criterio.valor;
    const isDifferent = isValueDifferentFromDefault(criterio);

    if (criterio.unidade === "bool") {
      return (
        <div className="flex items-center gap-3">
          <button
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              currentValue === "1" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            onClick={() => setEditedValues(prev => ({ ...prev, [criterio.chave]: "1" }))}
          >
            Sim
          </button>
          <button
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              currentValue === "0" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
            onClick={() => setEditedValues(prev => ({ ...prev, [criterio.chave]: "0" }))}
          >
            Não
          </button>
          {isDifferent && (
            <span className="text-xs text-amber-600 font-medium">Personalizado</span>
          )}
        </div>
      );
    }

    if (criterio.unidade === "tipo") {
      const options = criterio.descricao.match(/\(([^)]+)\)/)?.[1]?.split(",").map((s: string) => s.trim()) || [];
      return (
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-3 py-1.5 text-sm bg-white"
            value={currentValue}
            onChange={e => setEditedValues(prev => ({ ...prev, [criterio.chave]: e.target.value }))}
          >
            {options.map((opt: string) => (
              <option key={opt} value={opt}>{opt.replace(/_/g, " ")}</option>
            ))}
          </select>
          {isDifferent && (
            <span className="text-xs text-amber-600 font-medium">Personalizado</span>
          )}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Input
          type="text"
          className={`w-24 text-right ${isDifferent ? "border-amber-400 bg-amber-50" : ""}`}
          value={currentValue}
          onChange={e => setEditedValues(prev => ({ ...prev, [criterio.chave]: e.target.value }))}
        />
        {criterio.unidade && (
          <span className="text-sm text-gray-500 min-w-[30px]">{renderUnitLabel(criterio.unidade)}</span>
        )}
        {isDifferent && (
          <span className="text-xs text-amber-600 font-medium whitespace-nowrap">
            CLT: {criterio.valorPadraoClt}{renderUnitLabel(criterio.unidade)}
          </span>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Configurações
        </h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB: Critérios do Sistema */}
        {activeTab === "criterios" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Critérios e Parâmetros do Sistema</h2>
                <p className="text-sm text-gray-500">
                  Defina os critérios padrão que serão aplicados a todos os funcionários. 
                  Valores individuais podem ser sobrescritos no cadastro de cada funcionário.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Info className="w-3.5 h-3.5" />
                Baseado na CLT e convenções coletivas
              </div>
            </div>

            {criteriaQuery.isLoading ? (
              <div className="text-center py-12 text-gray-400">Carregando critérios...</div>
            ) : (
              <div className="space-y-3">
                {CATEGORIAS.map(cat => {
                  const criterios = criteriosByCategoria[cat.key] || [];
                  if (criterios.length === 0) return null;
                  const isExpanded = expandedCat === cat.key;
                  const hasChanges = hasChangesInCategory(cat.key);
                  const customCount = criterios.filter((c: any) => c.valor !== c.valorPadraoClt).length;

                  return (
                    <div key={cat.key} className={`border rounded-lg overflow-hidden ${cat.borderColor}`}>
                      {/* Header da categoria */}
                      <button
                        onClick={() => setExpandedCat(isExpanded ? null : cat.key)}
                        className={`w-full flex items-center justify-between px-4 py-3 ${cat.bgColor} hover:opacity-90 transition-opacity`}
                      >
                        <div className="flex items-center gap-3">
                          <cat.icon className={`w-5 h-5 ${cat.color}`} />
                          <span className="font-semibold text-gray-800">{cat.label}</span>
                          <span className="text-xs text-gray-500">({criterios.length} parâmetros)</span>
                          {customCount > 0 && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                              {customCount} personalizado{customCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </button>

                      {/* Conteúdo expandido */}
                      {isExpanded && (
                        <div className="bg-white">
                          <div className="divide-y">
                            {criterios.map((criterio: any) => (
                              <div key={criterio.chave} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                                <div className="flex-1 min-w-0 pr-4">
                                  <div className="text-sm font-medium text-gray-700">{criterio.descricao}</div>
                                  <div className="text-xs text-gray-400 mt-0.5">
                                    Chave: {criterio.chave}
                                    {criterio.valorPadraoClt && (
                                      <span className="ml-2">• CLT padrão: {criterio.valorPadraoClt}{renderUnitLabel(criterio.unidade)}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex-shrink-0">
                                  {renderCriterioInput(criterio)}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Ações da categoria */}
                          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResetCategory(cat.key)}
                              disabled={resetMutation.isPending}
                              className="text-gray-500 hover:text-gray-700"
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1" />
                              Restaurar Padrão CLT
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveCriteria(cat.key)}
                              disabled={!hasChanges || updateBatchMutation.isPending}
                              className={hasChanges ? "bg-blue-600 hover:bg-blue-700" : ""}
                            >
                              <Save className="w-3.5 h-3.5 mr-1" />
                              {updateBatchMutation.isPending ? "Salvando..." : "Salvar Alterações"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB: Usuários */}
        {activeTab === "usuarios" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="w-5 h-5 text-green-600" />
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
          </div>
        )}

        {/* TAB: Minha Senha */}
        {activeTab === "senha" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Key className="w-5 h-5 text-blue-600" />
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
        )}

        {/* TAB: Limpeza */}
        {activeTab === "limpeza" && (
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-red-600">
                <Trash2 className="w-5 h-5" />
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
        )}

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
