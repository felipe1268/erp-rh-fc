import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useCompany } from "@/contexts/CompanyContext";
import { useModuleConfig } from "@/contexts/ModuleConfigContext";
import MenuConfigPanel from "@/components/MenuConfigPanel";
import GoldenRulesPanel from "@/components/GoldenRulesPanel";
import BeneficiosAlimentacaoTab from "@/components/BeneficiosAlimentacaoTab";
import { Settings, Users, Trash2, Key, Scale, Clock, FileText, AlertTriangle, Gift, Palmtree, UserX, RotateCcw, Save, ChevronRight, Info, LayoutDashboard, GripVertical, ArrowUp, ArrowDown, Eye, EyeOff, Shield, Bell, Mail, Plus, Check, X, ToggleLeft, ToggleRight, History, Send, CheckCheck, AlertCircle, RefreshCw, Pencil, Hash, HardHat, ClipboardList, Database, Download, Loader2, TrendingUp, Landmark, PlayCircle, UtensilsCrossed, Coffee, MapPin, Gavel, Star, Handshake, BadgeCheck, BookOpen, Building2, CalendarCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { removeAccents } from "@/lib/searchUtils";

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
  { key: "epi", label: "EPIs / Segurança", icon: HardHat, color: "text-emerald-600", bgColor: "bg-emerald-50", borderColor: "border-emerald-200" },
  { key: "atestados", label: "Atestados", icon: ClipboardList, color: "text-violet-600", bgColor: "bg-violet-50", borderColor: "border-violet-200" },
  { key: "dissidio", label: "Dissídio Coletivo", icon: TrendingUp, color: "text-cyan-600", bgColor: "bg-cyan-50", borderColor: "border-cyan-200" },
  { key: "terceiros", label: "Terceiros", icon: Building2, color: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200" },
  { key: "parceiros", label: "Parceiros / Convênios", icon: Handshake, color: "text-purple-600", bgColor: "bg-purple-50", borderColor: "border-purple-200" },
  { key: "juridico", label: "Jurídico", icon: Gavel, color: "text-slate-600", bgColor: "bg-slate-50", borderColor: "border-slate-200" },
  { key: "sst", label: "SST / Segurança", icon: Shield, color: "text-emerald-600", bgColor: "bg-emerald-50", borderColor: "border-emerald-200" },
  { key: "avaliacao", label: "Avaliação de Desempenho", icon: Star, color: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
  { key: "crachas", label: "Crachás", icon: BadgeCheck, color: "text-sky-600", bgColor: "bg-sky-50", borderColor: "border-sky-200" },
  { key: "convencao", label: "Convenção Coletiva", icon: BookOpen, color: "text-rose-600", bgColor: "bg-rose-50", borderColor: "border-rose-200" },
  { key: "cadastro", label: "Cadastro", icon: Users, color: "text-indigo-600", bgColor: "bg-indigo-50", borderColor: "border-indigo-200" },
  { key: "competencias", label: "Gestão de Competências", icon: CalendarCheck, color: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
  { key: "notificacoes_sistema", label: "Notificações do Sistema", icon: Bell, color: "text-pink-600", bgColor: "bg-pink-50", borderColor: "border-pink-200" },
];

type TabKey = "criterios" | "senha" | "limpeza" | "painel" | "regras" | "notificacoes" | "contrato_pj" | "sync_he" | "sindical" | "beneficios_alimentacao" | "modulos";

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
    if (companyId > 0 && criteriaQuery.data) {
      // Auto-initialize if no criteria or if EPI category is missing
      const hasEpi = criteriaQuery.data.some((c: any) => c.categoria === 'epi');
      if (criteriaQuery.data.length === 0 || !hasEpi) {
        initDefaultsMutation.mutate({ companyId });
      }
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
    { key: "modulos" as TabKey, label: "Módulos do Sistema", icon: ToggleRight, minRole: "admin" },
    { key: "painel" as TabKey, label: "Painel de Controle", icon: LayoutDashboard, minRole: "user" },
    { key: "regras" as TabKey, label: "Regras de Ouro", icon: Shield, minRole: "admin" },
    { key: "criterios" as TabKey, label: "Critérios do Sistema", icon: Scale, minRole: "admin" },
    { key: "senha" as TabKey, label: "Minha Senha", icon: Key, minRole: "user" },
    { key: "notificacoes" as TabKey, label: "Notificações E-mail", icon: Bell, minRole: "admin" },
    { key: "contrato_pj" as TabKey, label: "Contrato PJ", icon: FileText, minRole: "admin" },
    { key: "sindical" as TabKey, label: "Sindical / Dissídio", icon: Landmark, minRole: "admin" },
    { key: "sync_he" as TabKey, label: "Sincronizar HE", icon: RefreshCw, minRole: "admin" },
    { key: "beneficios_alimentacao" as TabKey, label: "Benefícios Alimentação", icon: UtensilsCrossed, minRole: "admin" },
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

        {/* TAB: Módulos do Sistema */}
        {activeTab === "modulos" && (
          <ModulosTab companyId={companyId} isMaster={isMaster} />
        )}

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

            {/* ============ BASE CAEPI (Certificados de Aprovação) ============ */}
            <CaepiStatsSection />
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

        {/* TAB: Sindical / Dissídio */}
        {activeTab === "sindical" && (
          <SindicalDissidioTab companyId={companyId} isMaster={isMaster} />
        )}

        {/* TAB: Sincronizar HE */}
        {activeTab === "sync_he" && (
          <SyncHETab companyId={companyId} />
        )}

        {/* TAB: Benefícios de Alimentação */}
        {activeTab === "beneficios_alimentacao" && (
          <BeneficiosAlimentacaoTab companyId={companyId} />
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
          <PrintFooterLGPD />
    </DashboardLayout>
  );
}

// ============================================================
// COMPONENTE: Sindical / Dissídio Coletivo
// Cadastro de ano + percentual de reajuste
// Botão "Aplicar" para reajustar todos os CLT ativos
// ============================================================
function SindicalDissidioTab({ companyId, isMaster }: { companyId: number; isMaster: boolean }) {
  const [novoAno, setNovoAno] = useState<number>(new Date().getFullYear());
  const [novoPercentual, setNovoPercentual] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [confirmAplicar, setConfirmAplicar] = useState<number | null>(null);

  const listaQuery = trpc.sindical.listar.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const cadastrarMutation = trpc.sindical.cadastrar.useMutation({
    onSuccess: () => {
      toast.success("Dissídio cadastrado com sucesso!");
      setNovoPercentual("");
      setShowForm(false);
      listaQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const aplicarMutation = trpc.sindical.aplicar.useMutation({
    onSuccess: (data) => {
      toast.success(`Dissídio ${data.ano} aplicado! ${data.aplicados} funcionário(s) reajustado(s) em ${data.percentual}%`);
      setConfirmAplicar(null);
      listaQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const excluirMutation = trpc.sindical.excluir.useMutation({
    onSuccess: () => {
      toast.success("Dissídio excluído");
      listaQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const dissidios = listaQuery.data || [];
  const anosExistentes = new Set(dissidios.map((d: any) => d.anoReferencia));

  // Gerar lista de anos disponíveis para cadastro
  const anoAtual = new Date().getFullYear();
  const anosDisponiveis = [];
  for (let a = anoAtual + 1; a >= 2020; a--) {
    if (!anosExistentes.has(a)) anosDisponiveis.push(a);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Landmark className="w-5 h-5 text-blue-600" />
                Sindical — Dissídio Coletivo Anual
              </CardTitle>
              <CardDescription>
                Cadastre o percentual de reajuste por ano. Ao aplicar, <strong>todos os funcionários CLT ativos</strong> terão o salário reajustado automaticamente. É lei — não há exclusão individual.
              </CardDescription>
            </div>
            {isMaster && !showForm && (
              <Button onClick={() => setShowForm(true)} className="gap-1.5">
                <Plus className="w-4 h-4" /> Novo Ano
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Formulário de cadastro */}
          {showForm && (
            <div className="mb-6 p-4 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50/50">
              <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                <Plus className="w-4 h-4" /> Cadastrar Novo Dissídio
              </h4>
              <div className="flex items-end gap-4">
                <div>
                  <Label className="text-xs font-medium text-gray-600">Ano</Label>
                  <Select value={String(novoAno)} onValueChange={v => setNovoAno(Number(v))}>
                    <SelectTrigger className="w-[120px] bg-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {anosDisponiveis.map(a => (
                        <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-600">Percentual de Reajuste (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={novoPercentual}
                    onChange={e => setNovoPercentual(e.target.value)}
                    placeholder="Ex: 5.50"
                    className="w-[160px] bg-white mt-1"
                  />
                </div>
                <Button
                  onClick={() => cadastrarMutation.mutate({ companyId, anoReferencia: novoAno, percentualReajuste: novoPercentual })}
                  disabled={cadastrarMutation.isPending || !novoPercentual}
                  className="gap-1.5"
                >
                  {cadastrarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Cadastrar
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
              <p className="text-[10px] text-blue-600 mt-2">
                Art. 468 CLT — O percentual nunca pode ser menor que o ano anterior.
              </p>
            </div>
          )}

          {/* Lista de dissídios cadastrados */}
          {listaQuery.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Carregando...
            </div>
          ) : dissidios.length === 0 ? (
            <div className="text-center py-8">
              <Landmark className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Nenhum dissídio cadastrado</p>
              <p className="text-xs text-gray-400 mt-1">Clique em "Novo Ano" para cadastrar o primeiro reajuste.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dissidios.map((d: any) => {
                const isAplicado = d.status === 'aplicado';
                const isRascunho = d.status === 'rascunho';
                const isConfirmando = confirmAplicar === d.anoReferencia;

                return (
                  <div
                    key={d.id}
                    className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                      isAplicado
                        ? 'bg-green-50 border-green-200'
                        : 'bg-white border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center gap-6">
                      {/* Ano */}
                      <div className="text-center min-w-[60px]">
                        <p className={`text-2xl font-bold ${isAplicado ? 'text-green-700' : 'text-blue-700'}`}>
                          {d.anoReferencia}
                        </p>
                        <p className="text-[10px] text-gray-500 uppercase font-medium">Ano</p>
                      </div>

                      {/* Percentual */}
                      <div className="text-center min-w-[80px]">
                        <p className={`text-xl font-bold ${isAplicado ? 'text-green-700' : 'text-orange-600'}`}>
                          {parseFloat(d.percentualReajuste).toFixed(2)}%
                        </p>
                        <p className="text-[10px] text-gray-500 uppercase font-medium">Reajuste</p>
                      </div>

                      {/* Status */}
                      <div>
                        {isAplicado ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <Check className="w-3.5 h-3.5" /> Aplicado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            <Clock className="w-3.5 h-3.5" /> Pendente
                          </span>
                        )}
                        {d.dataAplicacao && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            Aplicado em {new Date(d.dataAplicacao + 'T00:00:00').toLocaleDateString('pt-BR')}
                            {d.aplicadoPor && ` por ${d.aplicadoPor}`}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2">
                      {isRascunho && isMaster && (
                        <>
                          {isConfirmando ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-red-600 font-medium">Confirmar aplicação?</span>
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 gap-1"
                                onClick={() => aplicarMutation.mutate({ companyId, anoReferencia: d.anoReferencia })}
                                disabled={aplicarMutation.isPending}
                              >
                                {aplicarMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                Sim, Aplicar
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setConfirmAplicar(null)}>
                                Cancelar
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 gap-1.5"
                                onClick={() => setConfirmAplicar(d.anoReferencia)}
                              >
                                <PlayCircle className="w-4 h-4" /> Aplicar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500 hover:text-red-700"
                                onClick={() => {
                                  if (confirm(`Excluir dissídio de ${d.anoReferencia}?`)) {
                                    excluirMutation.mutate({ companyId, anoReferencia: d.anoReferencia });
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informação legal */}
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Regras do Dissídio Coletivo</p>
              <ul className="space-y-1 text-xs text-amber-700">
                <li>• <strong>Obrigatório:</strong> O dissídio é lei — todos os funcionários CLT ativos são reajustados, sem exceção.</li>
                <li>• <strong>Nunca regredir:</strong> O percentual de um ano não pode ser menor que o do ano anterior (Art. 468 CLT).</li>
                <li>• <strong>Irreversível:</strong> Após aplicado, o reajuste não pode ser desfeito.</li>
                <li>• <strong>Valor da hora:</strong> O sistema recalcula automaticamente o valor/hora de cada funcionário (salário ÷ 220h).</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// COMPONENTE: Sincronizar HE com Critérios da Empresa
// ============================================================
function SyncHETab({ companyId }: { companyId: number }) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const utils = trpc.useUtils();

  const heQuery = trpc.criteria.listHEDivergentes.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const syncMutation = trpc.criteria.syncHE.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.updated} funcionário(s) sincronizado(s) com sucesso!`);
      setSelectedIds([]);
      heQuery.refetch();
    },
    onError: (err: any) => toast.error("Erro: " + err.message),
  });

  const criterios = heQuery.data?.criterios;
  const funcionarios = heQuery.data?.funcionarios || [];
  const filtered = funcionarios.filter(f =>
    !searchTerm || f.nomeCompleto?.toLowerCase().includes(removeAccents(searchTerm)) ||
    f.funcao?.toLowerCase().includes(removeAccents(searchTerm)) ||
    f.setor?.toLowerCase().includes(removeAccents(searchTerm))
  );

  const allSelected = filtered.length > 0 && filtered.every(f => selectedIds.includes(f.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !filtered.find(f => f.id === id)));
    } else {
      const newIds = filtered.map(f => f.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...newIds])));
    }
  };

  const toggleOne = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  if (heQuery.isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /><span className="ml-2 text-muted-foreground">Carregando...</span></div>;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-orange-600" />
            Sincronizar Percentuais de Horas Extras
          </CardTitle>
          <CardDescription>
            Funcionários cujos percentuais de HE diferem dos critérios atuais da empresa.
            Selecione quais deseja atualizar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Critérios atuais da empresa */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
              <Scale className="w-4 h-4" />
              Critérios Atuais da Empresa
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-700">{criterios?.heDiasUteis || '50'}%</p>
                <p className="text-xs text-blue-600">HE Dias Úteis</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-700">{criterios?.heDomingosFeriados || '100'}%</p>
                <p className="text-xs text-blue-600">HE Domingos/Feriados</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-700">{criterios?.heAdicionalNoturno || '20'}%</p>
                <p className="text-xs text-blue-600">Adicional Noturno</p>
              </div>
            </div>
          </div>

          {funcionarios.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Check className="w-12 h-12 mx-auto mb-3 text-green-500" />
              <p className="font-semibold text-green-700">Todos sincronizados!</p>
              <p className="text-sm mt-1">Todos os funcionários já estão com os percentuais de HE alinhados aos critérios da empresa.</p>
            </div>
          ) : (
            <>
              {/* Barra de ações */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-semibold">
                    {funcionarios.length} divergente{funcionarios.length !== 1 ? 's' : ''}
                  </div>
                  {selectedIds.length > 0 && (
                    <Button
                      size="sm"
                      className="bg-orange-600 hover:bg-orange-700"
                      onClick={() => syncMutation.mutate({ companyId, employeeIds: selectedIds })}
                      disabled={syncMutation.isPending}
                    >
                      {syncMutation.isPending ? (
                        <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Sincronizando...</>
                      ) : (
                        <><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Sincronizar {selectedIds.length} selecionado{selectedIds.length !== 1 ? 's' : ''}</>
                      )}
                    </Button>
                  )}
                </div>
                <Input
                  placeholder="Buscar por nome, função ou setor..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="max-w-xs text-sm"
                />
              </div>

              {/* Tabela */}
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          className="w-4 h-4 rounded"
                        />
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Funcionário</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Função</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600">HE Dias Úteis</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600">HE Dom/Fer</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600">Ad. Noturno</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(emp => {
                      const isSelected = selectedIds.includes(emp.id);
                      return (
                        <tr
                          key={emp.id}
                          className={`hover:bg-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-orange-50' : ''}`}
                          onClick={() => toggleOne(emp.id)}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleOne(emp.id)}
                              onClick={e => e.stopPropagation()}
                              className="w-4 h-4 rounded"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-gray-900 truncate max-w-[200px]">{emp.nomeCompleto}</p>
                            {emp.setor && <p className="text-xs text-muted-foreground">{emp.setor}</p>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{emp.funcao || '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`font-mono text-sm ${emp.heAtual.diasUteis !== criterios?.heDiasUteis ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                              {emp.heAtual.diasUteis}%
                            </span>
                            {emp.heAtual.diasUteis !== criterios?.heDiasUteis && (
                              <span className="text-xs text-muted-foreground ml-1">→ {criterios?.heDiasUteis}%</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`font-mono text-sm ${emp.heAtual.domingosFeriados !== criterios?.heDomingosFeriados ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                              {emp.heAtual.domingosFeriados}%
                            </span>
                            {emp.heAtual.domingosFeriados !== criterios?.heDomingosFeriados && (
                              <span className="text-xs text-muted-foreground ml-1">→ {criterios?.heDomingosFeriados}%</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`font-mono text-sm ${emp.heAtual.adicionalNoturno !== criterios?.heAdicionalNoturno ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                              {emp.heAtual.adicionalNoturno}%
                            </span>
                            {emp.heAtual.adicionalNoturno !== criterios?.heAdicionalNoturno && (
                              <span className="text-xs text-muted-foreground ml-1">→ {criterios?.heAdicionalNoturno}%</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              </div>

              <p className="text-xs text-muted-foreground mt-3">
                <Info className="w-3.5 h-3.5 inline mr-1" />
                Funcionários com <strong>acordo individual ativo</strong> não aparecem nesta lista, pois possuem valores personalizados.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
          <div className="overflow-x-auto"><table className="w-full text-sm">
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
          </table></div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SEÇÃO: Base de Dados CAEPI (Certificados de Aprovação)
// ============================================================
function CaepiStatsSection() {
  const caepiStats = trpc.epis.caepiStats.useQuery();
  const [updating, setUpdating] = useState(false);

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    try {
      const date = new Date(d);
      return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return d; }
  };

  return (
    <div className="mt-6 border rounded-lg overflow-hidden border-blue-200">
      <div className="flex items-center justify-between px-4 py-3 bg-blue-50">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-gray-800">Base de Dados CAEPI (Certificados de Aprovação)</span>
          {caepiStats.data && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
              {Number(caepiStats.data.totalCas).toLocaleString("pt-BR")} CAs cadastrados
            </span>
          )}
        </div>
      </div>
      <div className="bg-white p-4">
        <p className="text-sm text-gray-500 mb-4">
          Base de dados local com os Certificados de Aprovação (CA) do Ministério do Trabalho e Emprego (MTE).
          Utilizada para preenchimento automático dos dados do EPI ao digitar o número do CA.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 text-center border border-blue-100">
            <p className="text-3xl font-bold text-blue-700">
              {caepiStats.isLoading ? "..." : Number(caepiStats.data?.totalCas || 0).toLocaleString("pt-BR")}
            </p>
            <p className="text-xs text-blue-600 font-medium mt-1">CAs na Base Local</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 text-center border border-green-100">
            <p className="text-sm font-semibold text-green-700">
              {caepiStats.isLoading ? "..." : formatDate(caepiStats.data?.lastUpdate || null)}
            </p>
            <p className="text-xs text-green-600 font-medium mt-1">Última Atualização</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Portal de Dados Abertos</p>
            <p className="text-xs text-gray-500 font-medium mt-1">Fonte: Governo Federal (MTE)</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <RefreshCaepiButton onSuccess={() => caepiStats.refetch()} />
          <span className="text-xs text-gray-400">Baixa os dados mais recentes do Portal de Dados Abertos do Governo Federal</span>
        </div>
      </div>
    </div>
  );
}

function RefreshCaepiButton({ onSuccess }: { onSuccess: () => void }) {
  const refreshMutation = trpc.epis.refreshCaepiDatabase.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Base CAEPI atualizada! ${data.totalImported?.toLocaleString("pt-BR") || ""} CAs importados.`);
        onSuccess();
      } else {
        toast.error(data.error || "Erro ao atualizar base CAEPI");
      }
    },
    onError: (err) => toast.error("Erro ao atualizar: " + (err.message || "Tente novamente")),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50"
      onClick={() => refreshMutation.mutate()}
      disabled={refreshMutation.isPending}
    >
      {refreshMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {refreshMutation.isPending ? "Atualizando..." : "Atualizar Base CAEPI"}
    </Button>
  );
}


/* ═══════════ MÓDULOS DO SISTEMA ═══════════ */
function ModulosTab({ companyId, isMaster }: { companyId: number; isMaster: boolean }) {
  const { modules, isLoading, refetch } = useModuleConfig();
  const toggleMut = trpc.moduleConfig.toggle.useMutation({
    onSuccess: () => { refetch(); toast.success("Módulo atualizado com sucesso!"); },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar módulo"),
  });

  const MODULE_INFO: Record<string, { label: string; subtitle: string; icon: any; color: string; bgColor: string; borderColor: string; description: string }> = {
    rh: { label: "RH & DP", subtitle: "Recursos Humanos e Departamento Pessoal", icon: Users, color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200", description: "Colaboradores, folha de pagamento, ponto eletrônico, férias, benefícios, advertências, rescisão e documentação trabalhista." },
    sst: { label: "SST", subtitle: "Segurança e Saúde do Trabalho", icon: Shield, color: "text-emerald-600", bgColor: "bg-emerald-50", borderColor: "border-emerald-200", description: "EPIs, ASOs, CIPA, treinamentos de segurança, DDS, desvios, planos de ação e conformidade com normas regulamentadoras." },
    juridico: { label: "Jurídico", subtitle: "Gestão Jurídica Trabalhista", icon: Scale, color: "text-slate-600", bgColor: "bg-slate-50", borderColor: "border-slate-200", description: "Processos trabalhistas, audiências, provisões, análise de risco jurídico e integração DataJud." },
    avaliacao: { label: "Avaliação", subtitle: "Avaliação de Desempenho", icon: ClipboardList, color: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-amber-200", description: "Questionários personalizáveis, ciclos de avaliação, ranking de desempenho, pesquisas e clima organizacional." },
    terceiros: { label: "Terceiros", subtitle: "Gestão de Empresas Terceirizadas", icon: HardHat, color: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200", description: "Cadastro, documentação, obrigações mensais, aptidão, conformidade e portal externo para terceiros." },
    parceiros: { label: "Parceiros", subtitle: "Portal de Convênios", icon: Coffee, color: "text-purple-600", bgColor: "bg-purple-50", borderColor: "border-purple-200", description: "Farmácia, posto, restaurante e outros convênios com lançamentos, aprovações e guia de descontos." },
  };

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Módulos do Sistema</h2>
          <p className="text-sm text-gray-500 mt-1">Habilite ou desabilite módulos para controlar o acesso. Módulos desabilitados ficam ocultos na navegação e na tela inicial.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <ToggleRight className="h-4 w-4" />
          <span>Apenas Admin pode alterar</span>
        </div>
      </div>

      <div className="grid gap-4">
        {modules.map((mod: any) => {
          const info = MODULE_INFO[mod.moduleKey];
          if (!info) return null;
          const Icon = info.icon;
          return (
            <div key={mod.moduleKey} className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${mod.enabled ? `${info.borderColor} ${info.bgColor}` : "border-gray-200 bg-gray-50 opacity-60"}`}>
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${mod.enabled ? info.bgColor : "bg-gray-100"}`}>
                <Icon className={`h-6 w-6 ${mod.enabled ? info.color : "text-gray-400"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={`font-semibold ${mod.enabled ? "text-gray-900" : "text-gray-500"}`}>{info.label}</h3>
                  <span className="text-xs text-gray-400">{info.subtitle}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{info.description}</p>
                {mod.updatedBy && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Última alteração por {mod.updatedBy} {mod.updatedAt ? `em ${new Date(mod.updatedAt).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${mod.enabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {mod.enabled ? "Habilitado" : "Desabilitado"}
                </span>
                <Switch
                  checked={mod.enabled}
                  onCheckedChange={(checked: boolean) => toggleMut.mutate({ companyId, moduleKey: mod.moduleKey, enabled: checked })}
                  disabled={toggleMut.isPending}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-blue-800">Como funciona</h4>
            <ul className="text-xs text-blue-700 mt-1 space-y-1">
              <li>• Módulos <strong>desabilitados</strong> ficam ocultos na tela inicial e na barra lateral para todos os usuários.</li>
              <li>• Os dados do módulo desabilitado são <strong>preservados</strong> — nada é excluído.</li>
              <li>• Ao reabilitar, tudo volta ao normal imediatamente.</li>
              <li>• Ideal para controlar quais funcionalidades cada empresa contratante pode acessar.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
