import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useCompany } from "@/contexts/CompanyContext";
import MenuConfigPanel from "@/components/MenuConfigPanel";
import GoldenRulesPanel from "@/components/GoldenRulesPanel";
import { Settings, Users, Trash2, Key, Scale, Clock, FileText, AlertTriangle, Gift, Palmtree, UserX, RotateCcw, Save, ChevronRight, Info, LayoutDashboard, GripVertical, ArrowUp, ArrowDown, Eye, EyeOff, Shield, Bell, Mail, Plus, Check, X, ToggleLeft, ToggleRight, History, Send, CheckCheck, AlertCircle, RefreshCw, Pencil, Hash } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
  { key: "processos", label: "Processos Trabalhistas" },
  { key: "contratos_pj", label: "Contratos PJ" },
  { key: "cipa", label: "CIPA (Mandatos/Membros/Reuniões)" },
  { key: "epis", label: "EPIs (Cadastro)" },
  { key: "equipamentos", label: "Equipamentos" },
  { key: "veiculos", label: "Veículos" },
  { key: "extintores", label: "Extintores" },
  { key: "hidrantes", label: "Hidrantes" },
  { key: "riscos", label: "Riscos / Químicos" },
  { key: "dds", label: "DDS (Diálogo de Segurança)" },
  { key: "desvios", label: "Desvios" },
  { key: "planos_acao", label: "Planos de Ação" },
  { key: "ferias", label: "Férias" },
  { key: "seguros", label: "Seguros (Alertas/Config)" },
  { key: "auditoria", label: "Logs de Auditoria" },
  { key: "templates", label: "Templates de Documentos" },
  { key: "criterios", label: "Critérios do Sistema" },
  { key: "notificacoes", label: "Notificações" },
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

type TabKey = "criterios" | "senha" | "limpeza" | "painel" | "regras" | "notificacoes" | "contrato_pj";

export default function Configuracoes() {
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const isAdmin = user?.role === "admin" || isMaster;
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const [activeTab, setActiveTab] = useState<TabKey>(isAdmin ? "criterios" : "senha");

  // Limpeza
  const [showCleanDialog, setShowCleanDialog] = useState(false);
  const [cleanPassword, setCleanPassword] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);



  // Troca de senha
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  // Numeração Interna
  const [numPrefixo, setNumPrefixo] = useState("");
  const [numProximo, setNumProximo] = useState(1);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [numDirty, setNumDirty] = useState(false);

  const numberingQuery = trpc.companies.getNumbering.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const updateNumberingMutation = trpc.companies.updateNumbering.useMutation({
    onSuccess: () => {
      toast.success("Numeração atualizada com sucesso");
      numberingQuery.refetch();
      setNumDirty(false);
    },
    onError: (err: any) => toast.error(err.message),
  });
  const resetNumberingMutation = trpc.companies.resetNumbering.useMutation({
    onSuccess: () => {
      toast.success("Numeração resetada para 1");
      numberingQuery.refetch();
      setShowResetDialog(false);
      setResetPassword("");
      setNumProximo(1);
      setNumDirty(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  useEffect(() => {
    if (numberingQuery.data) {
      setNumPrefixo(numberingQuery.data.prefixoCodigo);
      setNumProximo(numberingQuery.data.nextCodigoInterno);
      setNumDirty(false);
    }
  }, [numberingQuery.data]);

  // Critérios
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [expandedCat, setExpandedCat] = useState<string | null>("horas_extras");


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

  const allTabs = [
    { key: "painel" as TabKey, label: "Painel de Controle", icon: LayoutDashboard, minRole: "user" },
    { key: "regras" as TabKey, label: "Regras de Ouro", icon: Shield, minRole: "admin" },
    { key: "criterios" as TabKey, label: "Critérios do Sistema", icon: Scale, minRole: "admin" },
    { key: "senha" as TabKey, label: "Minha Senha", icon: Key, minRole: "user" },
    { key: "notificacoes" as TabKey, label: "Notificações E-mail", icon: Bell, minRole: "admin" },
    { key: "contrato_pj" as TabKey, label: "Contrato PJ", icon: FileText, minRole: "admin" },
    { key: "limpeza" as TabKey, label: "Limpeza de Dados", icon: Trash2, minRole: "admin_master" },
  ];
  const tabs = allTabs.filter(tab => {
    if (tab.minRole === "user") return true;
    if (tab.minRole === "admin") return isAdmin;
    if (tab.minRole === "admin_master") return isMaster;
    return true;
  });

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
      <PrintHeader />
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Settings className="w-6 h-6" />
            Configurações
          </h1>
          <PrintActions title="Configurações" />
        </div>

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

        {/* TAB: Painel de Controle (Menu Configurável) */}
        {activeTab === "painel" && (
          <MenuConfigPanel />
        )}

        {/* TAB: Regras de Ouro */}
        {activeTab === "regras" && (
          <GoldenRulesPanel />
        )}

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

            {/* ========== NUMERAÇÃO INTERNA ========== */}
            <div className="border rounded-lg overflow-hidden border-cyan-200">
              <button
                onClick={() => setExpandedCat(expandedCat === "_numeracao" ? null : "_numeracao")}
                className="w-full flex items-center justify-between px-4 py-3 bg-cyan-50 hover:opacity-90 transition-opacity"
              >
                <div className="flex items-center gap-3">
                  <Hash className="w-5 h-5 text-cyan-600" />
                  <span className="font-semibold text-gray-800">Numeração Interna (Código do Colaborador)</span>
                  {numPrefixo && (
                    <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded text-xs font-medium">
                      Próximo: {numPrefixo}{String(numProximo).padStart(3, '0')}
                    </span>
                  )}
                </div>
                <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expandedCat === "_numeracao" ? "rotate-90" : ""}`} />
              </button>

              {expandedCat === "_numeracao" && (
                <div className="bg-white p-4 space-y-4">
                  <p className="text-sm text-gray-500">
                    Configure o prefixo alfanumérico e o próximo número sequencial para geração automática do código interno dos colaboradores.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Prefixo */}
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-1 block">Prefixo</Label>
                      <Input
                        value={numPrefixo}
                        onChange={e => { setNumPrefixo(e.target.value.toUpperCase()); setNumDirty(true); }}
                        placeholder="Ex: JFC, FC, HC"
                        maxLength={10}
                        className="font-mono text-lg"
                      />
                      <p className="text-xs text-gray-400 mt-1">Letras e números (máx. 10 caracteres)</p>
                    </div>

                    {/* Próximo Número */}
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-1 block">Próximo Número</Label>
                      <Input
                        type="number"
                        min={1}
                        value={numProximo}
                        onChange={e => { setNumProximo(Math.max(1, parseInt(e.target.value) || 1)); setNumDirty(true); }}
                        className="font-mono text-lg"
                      />
                      <p className="text-xs text-gray-400 mt-1">Próximo número a ser gerado automaticamente</p>
                    </div>

                    {/* Preview */}
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-1 block">Preview</Label>
                      <div className="flex items-center gap-2 h-10 px-3 bg-gray-50 border rounded-md">
                        <span className="font-mono text-lg font-bold text-cyan-700">
                          {numPrefixo}{String(numProximo).padStart(3, '0')}
                        </span>
                        <span className="text-xs text-gray-400">→</span>
                        <span className="font-mono text-sm text-gray-500">
                          {numPrefixo}{String(numProximo + 1).padStart(3, '0')}
                        </span>
                        <span className="text-xs text-gray-400">→</span>
                        <span className="font-mono text-sm text-gray-500">
                          {numPrefixo}{String(numProximo + 2).padStart(3, '0')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Sequência dos próximos códigos</p>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center justify-between pt-3 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowResetDialog(true)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      disabled={!isMaster}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" />
                      Resetar Numeração (Zerar)
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!numPrefixo.trim()) { toast.error("Prefixo não pode ser vazio"); return; }
                        updateNumberingMutation.mutate({ companyId, prefixoCodigo: numPrefixo.trim(), nextCodigoInterno: numProximo });
                      }}
                      disabled={!numDirty || updateNumberingMutation.isPending}
                      className={numDirty ? "bg-blue-600 hover:bg-blue-700" : ""}
                    >
                      <Save className="w-3.5 h-3.5 mr-1" />
                      {updateNumberingMutation.isPending ? "Salvando..." : "Salvar Numeração"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Dialog de Reset */}
            {showResetDialog && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                  <h3 className="text-lg font-bold text-red-600 flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5" />
                    Resetar Numeração Interna
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Esta ação vai zerar o contador de numeração interna para <strong>1</strong>.
                    Os códigos já atribuídos aos colaboradores existentes <strong>não serão alterados</strong>.
                    Novos colaboradores receberão códigos a partir de <strong>{numPrefixo}001</strong>.
                  </p>
                  <div className="mb-4">
                    <Label className="text-sm font-medium text-gray-700 mb-1 block">Digite a senha de confirmação:</Label>
                    <Input
                      type="text"
                      value={resetPassword}
                      onChange={e => setResetPassword(e.target.value.toUpperCase())}
                      placeholder="Digite RESETAR2026"
                      className="font-mono tracking-wider"
                    />
                    <p className="text-xs text-gray-400 mt-1">Digite exatamente: <span className="font-mono font-bold">RESETAR2026</span></p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setShowResetDialog(false); setResetPassword(""); }}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => resetNumberingMutation.mutate({ companyId, confirmPassword: resetPassword })}
                      disabled={resetNumberingMutation.isPending || !resetPassword}
                    >
                      {resetNumberingMutation.isPending ? "Resetando..." : "Confirmar Reset"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

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

        {/* TAB: Notificações E-mail */}
        {activeTab === "notificacoes" && (
          <NotificacoesEmailTab companyId={companyId} />
        )}

        {/* TAB: Contrato PJ */}
        {activeTab === "contrato_pj" && (
          <ContratoPJTab companyId={companyId} userName={user?.name || ''} />
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

// ============================================================
// COMPONENTE: Contrato PJ (Template Editável)
// ============================================================
function ContratoPJTab({ companyId, userName }: { companyId: number; userName: string }) {
  const [editing, setEditing] = useState(false);
  const [conteudo, setConteudo] = useState('');
  const [titulo, setTitulo] = useState('');

  const templateQuery = (trpc as any).docs.templates.getByTipo.useQuery(
    { companyId, tipo: 'contrato_pj' },
    { enabled: companyId > 0 }
  );
  const upsertMutation = (trpc as any).docs.templates.upsert.useMutation({
    onSuccess: () => {
      toast.success('Modelo do contrato PJ salvo com sucesso!');
      setEditing(false);
      templateQuery.refetch();
    },
    onError: () => toast.error('Erro ao salvar modelo'),
  });

  useEffect(() => {
    if (templateQuery.data) {
      setConteudo(templateQuery.data.conteudo || '');
      setTitulo(templateQuery.data.titulo || 'Contrato Particular de Prestação de Serviços');
    }
  }, [templateQuery.data]);

  const placeholders = [
    { tag: '[CONTRATANTE_NOME]', desc: 'Razão social da empresa contratante' },
    { tag: '[CONTRATANTE_CNPJ]', desc: 'CNPJ da empresa contratante' },
    { tag: '[CONTRATANTE_ENDERECO]', desc: 'Endereço da empresa contratante' },
    { tag: '[CONTRATANTE_CIDADE]', desc: 'Cidade da empresa contratante' },
    { tag: '[CONTRATANTE_ESTADO]', desc: 'Estado da empresa contratante' },
    { tag: '[CONTRATANTE_REPRESENTANTE]', desc: 'Nome do representante legal' },
    { tag: '[CONTRATADA_RAZAO_SOCIAL]', desc: 'Razão social do prestador PJ' },
    { tag: '[CONTRATADA_CNPJ]', desc: 'CNPJ do prestador PJ' },
    { tag: '[CONTRATADA_ENDERECO]', desc: 'Endereço do prestador PJ' },
    { tag: '[CONTRATADA_CIDADE]', desc: 'Cidade do prestador PJ' },
    { tag: '[CONTRATADA_ESTADO]', desc: 'Estado do prestador PJ' },
    { tag: '[OBJETO_CONTRATO]', desc: 'Descrição do serviço contratado' },
    { tag: '[VALOR_MENSAL]', desc: 'Valor mensal (R$)' },
    { tag: '[VALOR_EXTENSO]', desc: 'Valor por extenso' },
    { tag: '[DATA_INICIO]', desc: 'Data de início do contrato' },
    { tag: '[FORO_COMARCA]', desc: 'Comarca do foro' },
  ];

  if (templateQuery.isLoading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Modelo do Contrato PJ</h3>
          <p className="text-sm text-muted-foreground">Defina o texto padrão do contrato de prestação de serviços PJ. Os placeholders serão substituídos automaticamente pelos dados do colaborador.</p>
        </div>
        {templateQuery.data?.isDefault && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">Modelo Padrão</span>
        )}
      </div>

      {/* Placeholders disponíveis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Info className="h-4 w-4" /> Placeholders Disponíveis</CardTitle>
          <CardDescription className="text-xs">Use estes códigos no texto do contrato. Eles serão substituídos automaticamente ao gerar o contrato.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
            {placeholders.map(p => (
              <div key={p.tag} className="flex items-center gap-2 text-xs py-0.5">
                <code className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono text-[11px] whitespace-nowrap">{p.tag}</code>
                <span className="text-muted-foreground">{p.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Editor do contrato */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Título do Contrato</CardTitle>
            {!editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Editar Modelo
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {editing ? (
            <>
              <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título do contrato" />
              <div>
                <label className="text-sm font-medium mb-1 block">Texto do Contrato</label>
                <textarea
                  className="w-full border rounded-md p-3 text-sm font-mono min-h-[500px] resize-y bg-white"
                  value={conteudo}
                  onChange={e => setConteudo(e.target.value)}
                  placeholder="Digite o texto do contrato..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setEditing(false); if (templateQuery.data) { setConteudo(templateQuery.data.conteudo); setTitulo(templateQuery.data.titulo); } }}>
                  Cancelar
                </Button>
                <Button onClick={() => upsertMutation.mutate({ companyId, tipo: 'contrato_pj' as any, titulo, conteudo, userName })} disabled={upsertMutation.isPending}>
                  <Save className="h-4 w-4 mr-1" /> {upsertMutation.isPending ? 'Salvando...' : 'Salvar Modelo'}
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="font-medium">{titulo}</p>
              <div className="bg-gray-50 rounded-md p-4 max-h-[400px] overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap font-sans text-gray-700 leading-relaxed">{conteudo}</pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// COMPONENTE: Notificações por E-mail
// ============================================================
function NotificacoesEmailTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [notifContratacao, setNotifContratacao] = useState(true);
  const [notifDemissao, setNotifDemissao] = useState(true);
  const [notifTransferencia, setNotifTransferencia] = useState(false);
  const [notifAfastamento, setNotifAfastamento] = useState(false);

  const recipientsQuery = trpc.notifications.listRecipients.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const createMut = trpc.notifications.createRecipient.useMutation({
    onSuccess: () => { toast.success("Destinatário adicionado!"); resetForm(); recipientsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.notifications.updateRecipient.useMutation({
    onSuccess: () => { toast.success("Destinatário atualizado!"); resetForm(); recipientsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.notifications.deleteRecipient.useMutation({
    onSuccess: () => { toast.success("Destinatário removido!"); recipientsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setShowForm(false); setEditId(null); setNome(""); setEmail("");
    setNotifContratacao(true); setNotifDemissao(true);
    setNotifTransferencia(false); setNotifAfastamento(false);
  }

  function handleEdit(r: any) {
    setEditId(r.id); setNome(r.nome); setEmail(r.email);
    setNotifContratacao(r.notificarContratacao); setNotifDemissao(r.notificarDemissao);
    setNotifTransferencia(r.notificarTransferencia); setNotifAfastamento(r.notificarAfastamento);
    setShowForm(true);
  }

  function handleSave() {
    if (!nome.trim() || !email.trim()) { toast.error("Nome e e-mail são obrigatórios"); return; }
    if (editId) {
      updateMut.mutate({ id: editId, nome, email, notificarContratacao: notifContratacao, notificarDemissao: notifDemissao, notificarTransferencia: notifTransferencia, notificarAfastamento: notifAfastamento });
    } else {
      createMut.mutate({ companyId, nome, email, notificarContratacao: notifContratacao, notificarDemissao: notifDemissao, notificarTransferencia: notifTransferencia, notificarAfastamento: notifAfastamento });
    }
  }

  function handleToggleActive(r: any) {
    updateMut.mutate({ id: r.id, ativo: !r.ativo });
  }

  const recipients = recipientsQuery.data || [];
  const activeCount = recipients.filter((r: any) => r.ativo).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" />
            Notificações por E-mail
          </h2>
          <p className="text-sm text-gray-500">
            Cadastre os e-mails que devem receber avisos automáticos de contratação, demissão e outras movimentações.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-1" /> Novo Destinatário
        </Button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{recipients.length}</p>
          <p className="text-xs text-gray-500">Total Cadastrados</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{activeCount}</p>
          <p className="text-xs text-gray-500">Ativos</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-emerald-700">{recipients.filter((r: any) => r.ativo && r.notificarContratacao).length}</p>
          <p className="text-xs text-gray-500">Recebem Contratação</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{recipients.filter((r: any) => r.ativo && r.notificarDemissao).length}</p>
          <p className="text-xs text-gray-500">Recebem Demissão</p>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <Card className="border-blue-200">
          <CardContent className="p-5 space-y-4">
            <h3 className="font-semibold text-gray-800">{editId ? "Editar Destinatário" : "Novo Destinatário"}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-gray-700">Nome *</Label>
                <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: João da Silva" />
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700">E-mail *</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Ex: joao@empresa.com" />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">Tipos de Notificação</Label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-green-50 transition-colors">
                  <Switch checked={notifContratacao} onCheckedChange={setNotifContratacao} />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Contratação</p>
                    <p className="text-xs text-gray-400">Aviso quando novo funcionário for cadastrado</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-red-50 transition-colors">
                  <Switch checked={notifDemissao} onCheckedChange={setNotifDemissao} />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Demissão</p>
                    <p className="text-xs text-gray-400">Aviso quando funcionário for desligado</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-blue-50 transition-colors">
                  <Switch checked={notifTransferencia} onCheckedChange={setNotifTransferencia} />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Transferência</p>
                    <p className="text-xs text-gray-400">Aviso quando funcionário mudar de obra/setor</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-amber-50 transition-colors">
                  <Switch checked={notifAfastamento} onCheckedChange={setNotifAfastamento} />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Afastamento</p>
                    <p className="text-xs text-gray-400">Aviso quando funcionário for afastado</p>
                  </div>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-blue-600 hover:bg-blue-700">
                {(createMut.isPending || updateMut.isPending) ? "Salvando..." : editId ? "Atualizar" : "Adicionar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de destinatários */}
      {recipientsQuery.isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando destinatários...</div>
      ) : recipients.length === 0 ? (
        <Card className="border-dashed border-2 border-gray-300">
          <CardContent className="p-8 text-center">
            <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-2">Nenhum destinatário cadastrado</p>
            <p className="text-xs text-gray-400 mb-4">Adicione e-mails para receber notificações automáticas de movimentações de pessoal.</p>
            <Button onClick={() => { resetForm(); setShowForm(true); }} variant="outline">
              <Plus className="w-4 h-4 mr-1" /> Adicionar Primeiro Destinatário
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {recipients.map((r: any) => (
            <div key={r.id} className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${r.ativo ? "bg-white hover:bg-gray-50" : "bg-gray-50 opacity-60"}`}>
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${r.ativo ? "bg-blue-600" : "bg-gray-400"}`}>
                  {r.nome.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{r.nome}</p>
                  <p className="text-sm text-gray-500 truncate">{r.email}</p>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {r.notificarContratacao && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium">Contratação</span>}
                  {r.notificarDemissao && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">Demissão</span>}
                  {r.notificarTransferencia && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">Transferência</span>}
                  {r.notificarAfastamento && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">Afastamento</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleToggleActive(r)} title={r.ativo ? "Desativar" : "Ativar"}>
                  {r.ativo ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                </Button>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleEdit(r)}>
                  <Settings className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="text-xs text-red-500 hover:text-red-700" onClick={() => {
                  if (confirm(`Remover ${r.nome} da lista de notificações?`)) deleteMut.mutate({ id: r.id });
                }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Informação sobre funcionamento */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Como funciona?</p>
              <ul className="space-y-1 text-xs text-blue-700">
                <li>• <strong>Contratação:</strong> E-mail enviado automaticamente quando um novo funcionário é cadastrado com status "Ativo"</li>
                <li>• <strong>Demissão:</strong> E-mail enviado quando o status de um funcionário é alterado para "Desligado"</li>
                <li>• <strong>Transferência:</strong> E-mail enviado quando um funcionário muda de obra ou setor</li>
                <li>• <strong>Afastamento:</strong> E-mail enviado quando um funcionário é registrado como afastado</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* HISTÓRICO DE NOTIFICAÇÕES ENVIADAS */}
      <NotificacoesHistoricoSection companyId={companyId} />
    </div>
  );
}

// ============================================================
// COMPONENTE: Histórico de Notificações Enviadas
// ============================================================
function NotificacoesHistoricoSection({ companyId }: { companyId: number }) {
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "contratacao" | "demissao" | "transferencia" | "afastamento">("todos");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | "enviado" | "erro" | "pendente">("todos");
  const [showPreview, setShowPreview] = useState(false);
  const [previewTipo, setPreviewTipo] = useState<"contratacao" | "demissao" | "transferencia" | "afastamento">("contratacao");

  const logsQuery = trpc.notifications.listLogs.useQuery(
    { companyId, limit: 100, tipoFiltro, statusFiltro },
    { enabled: companyId > 0 }
  );
  const statsQuery = trpc.notifications.logStats.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const previewQuery = trpc.notifications.previewTexto.useQuery(
    { tipo: previewTipo },
    { enabled: showPreview }
  );
  const testeMut = trpc.notifications.testeEnvio.useMutation({
    onSuccess: (data) => {
      if (data.enviados > 0) toast.success(`Teste enviado para ${data.enviados} destinatário(s)!`);
      else toast.error("Nenhum destinatário ativo para este tipo");
      logsQuery.refetch();
      statsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const logs = logsQuery.data || [];
  const stats = statsQuery.data || { total: 0, enviados: 0, erros: 0, lidos: 0 };

  const tipoLabel: Record<string, string> = {
    contratacao: "Contratação",
    demissao: "Demissão",
    transferencia: "Transferência",
    afastamento: "Afastamento",
  };
  const tipoColor: Record<string, string> = {
    contratacao: "bg-green-100 text-green-700",
    demissao: "bg-red-100 text-red-700",
    transferencia: "bg-blue-100 text-blue-700",
    afastamento: "bg-amber-100 text-amber-700",
  };
  const statusIcon = (s: string) => {
    if (s === "enviado") return <CheckCheck className="w-4 h-4 text-green-600" />;
    if (s === "erro") return <AlertCircle className="w-4 h-4 text-red-600" />;
    return <Clock className="w-4 h-4 text-gray-400" />;
  };
  const statusLabel = (s: string) => {
    if (s === "enviado") return "Enviado";
    if (s === "erro") return "Erro";
    return "Pendente";
  };

  function formatDataHora(ts: string | null) {
    if (!ts) return "-";
    try {
      const d = new Date(ts);
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return ts; }
  }

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            Histórico de Notificações Enviadas
          </h3>
          <p className="text-sm text-gray-500">Registro de todas as notificações disparadas pelo sistema.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="w-4 h-4 mr-1" /> Preview
          </Button>
          <Button variant="outline" size="sm" onClick={() => { logsQuery.refetch(); statsQuery.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-indigo-700">{stats.total}</p>
          <p className="text-xs text-gray-500">Total Enviadas</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{stats.enviados}</p>
          <p className="text-xs text-gray-500">✓ Enviados</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{stats.erros}</p>
          <p className="text-xs text-gray-500">✗ Erros</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{stats.lidos}</p>
          <p className="text-xs text-gray-500">👁 Lidos</p>
        </div>
      </div>

      {/* Preview de texto */}
      {showPreview && (
        <Card className="border-indigo-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-medium text-gray-700">Preview do texto para:</p>
              {(["contratacao", "demissao", "transferencia", "afastamento"] as const).map(t => (
                <Button key={t} size="sm" variant={previewTipo === t ? "default" : "outline"}
                  className={`text-xs ${previewTipo === t ? "" : ""}`}
                  onClick={() => setPreviewTipo(t)}>
                  {tipoLabel[t]}
                </Button>
              ))}
            </div>
            {previewQuery.data ? (
              <div className="bg-gray-50 rounded-lg p-4 border">
                <p className="font-bold text-sm text-gray-800 mb-2">{previewQuery.data.titulo}</p>
                <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">{previewQuery.data.corpo}</pre>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-400 text-sm">Carregando preview...</div>
            )}
            <div className="flex justify-end mt-3">
              <Button size="sm" variant="outline" className="text-xs text-indigo-700"
                disabled={testeMut.isPending}
                onClick={() => testeMut.mutate({ companyId, tipo: previewTipo })}>
                <Send className="w-3 h-3 mr-1" />
                {testeMut.isPending ? "Enviando..." : "Enviar Teste"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <select className="text-xs border rounded-lg px-3 py-1.5 bg-white" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value as any)}>
          <option value="todos">Todos os tipos</option>
          <option value="contratacao">Contratação</option>
          <option value="demissao">Demissão</option>
          <option value="transferencia">Transferência</option>
          <option value="afastamento">Afastamento</option>
        </select>
        <select className="text-xs border rounded-lg px-3 py-1.5 bg-white" value={statusFiltro} onChange={e => setStatusFiltro(e.target.value as any)}>
          <option value="todos">Todos os status</option>
          <option value="enviado">Enviados</option>
          <option value="erro">Erros</option>
          <option value="pendente">Pendentes</option>
        </select>
      </div>

      {/* Tabela de logs */}
      {logsQuery.isLoading ? (
        <div className="text-center py-8 text-gray-400">Carregando histórico...</div>
      ) : logs.length === 0 ? (
        <Card className="border-dashed border-2 border-gray-300">
          <CardContent className="p-8 text-center">
            <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nenhuma notificação enviada ainda</p>
            <p className="text-xs text-gray-400 mt-1">As notificações aparecerão aqui automaticamente quando houver movimentações de funcionários.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Data/Hora</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Tipo</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Funcionário</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Destinatário</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Movimentação</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Disparado por</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1" title={log.statusEnvio === "erro" ? log.erroMensagem : ""}>
                      {statusIcon(log.statusEnvio)}
                      <span className={`text-xs font-medium ${
                        log.statusEnvio === "enviado" ? "text-green-700" :
                        log.statusEnvio === "erro" ? "text-red-700" : "text-gray-500"
                      }`}>{statusLabel(log.statusEnvio)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{formatDataHora(log.enviadoEm)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${tipoColor[log.tipoMovimentacao] || "bg-gray-100 text-gray-700"}`}>
                      {tipoLabel[log.tipoMovimentacao] || log.tipoMovimentacao}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-xs font-medium text-gray-800">{log.employeeName}</p>
                    {log.employeeCpf && <p className="text-[10px] text-gray-400">{log.employeeCpf}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-xs font-medium text-gray-800">{log.recipientName}</p>
                    <p className="text-[10px] text-gray-400">{log.recipientEmail}</p>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {log.statusAnterior && log.statusNovo ? (
                      <span>{log.statusAnterior} → {log.statusNovo}</span>
                    ) : log.statusNovo ? (
                      <span>Novo: {log.statusNovo}</span>
                    ) : "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{log.disparadoPor || "Sistema"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
