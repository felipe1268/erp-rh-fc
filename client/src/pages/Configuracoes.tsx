import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
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
import GoldenRulesPanel from "@/components/GoldenRulesPanel";
import EmployeeCombobox from "@/components/EmployeeCombobox";
import BeneficiosAlimentacaoTab from "@/components/BeneficiosAlimentacaoTab";
import { ComprasConfigSection } from "@/pages/configuracoes/ComprasConfigSection";
import { FinanceiroConfigSection } from "@/pages/configuracoes/FinanceiroConfigSection";
import { AlmoxarifadoConfigSection } from "@/pages/configuracoes/AlmoxarifadoConfigSection";
import { PlanejamentoConfigSection } from "@/pages/configuracoes/PlanejamentoConfigSection";
import { IAConfigSection } from "@/pages/configuracoes/IAConfigSection";
import TemplatesDocsTab from "@/pages/configuracoes/TemplatesDocsTab";
import { Settings, Users, Trash2, Key, Scale, Clock, FileText, AlertTriangle, Gift, Palmtree, UserX, RotateCcw, Save, ChevronRight, ChevronDown, Info, GripVertical, ArrowUp, ArrowDown, Eye, EyeOff, Shield, Bell, Mail, Plus, Check, X, ToggleLeft, ToggleRight, History, Send, CheckCheck, AlertCircle, RefreshCw, Pencil, Hash, HardHat, ClipboardList, Database, Download, Loader2, TrendingUp, Landmark, PlayCircle, UtensilsCrossed, Coffee, MapPin, Gavel, Star, Handshake, BadgeCheck, BookOpen, Building2, CalendarCheck, HardDrive, ExternalLink, Calculator, ShoppingCart, Warehouse, DollarSign, FolderOpen, FileBarChart, Hammer, Truck, Megaphone, Briefcase, Brain, SlidersHorizontal, GitBranch, Upload, ShieldCheck, ShieldAlert, UserCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { removeAccents } from "@/lib/searchUtils";
import { fmtNum } from "@/lib/formatters";

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
  { key: "recontratacao", label: "Recontratação", icon: UserCheck, color: "text-lime-600", bgColor: "bg-lime-50", borderColor: "border-lime-200" },
  { key: "competencias", label: "Gestão de Competências", icon: CalendarCheck, color: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
  { key: "notificacoes_sistema", label: "Notificações do Sistema", icon: Bell, color: "text-pink-600", bgColor: "bg-pink-50", borderColor: "border-pink-200" },
];

type TabKey = "criterios" | "senha" | "limpeza" | "regras" | "notificacoes" | "contrato_pj" | "sync_he" | "sindical" | "beneficios_alimentacao" | "modulos" | "backup" | "terceiros" | "portal_cliente" | "templates_docs";

// Rev. 2403: mapa estático de cores das abas. CRÍTICO: Tailwind JIT só vê
// classes LITERAIS no source — interpolação tipo `bg-${c}-500` não gera CSS.
type TabColorStyle = { active: string; inactive: string; chip: string };
const TAB_COLOR_STYLES: Record<string, TabColorStyle> = {
  indigo:  { active: "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md shadow-indigo-500/30 ring-2 ring-indigo-400 ring-offset-1",   inactive: "bg-white text-gray-700 border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-sm",   chip: "bg-indigo-100 text-indigo-600" },
  amber:   { active: "bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/30 ring-2 ring-amber-400 ring-offset-1",         inactive: "bg-white text-gray-700 border border-gray-200 hover:border-amber-300 hover:bg-amber-50 hover:shadow-sm",         chip: "bg-amber-100 text-amber-600" },
  blue:    { active: "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-400 ring-offset-1",             inactive: "bg-white text-gray-700 border border-gray-200 hover:border-blue-300 hover:bg-blue-50 hover:shadow-sm",             chip: "bg-blue-100 text-blue-600" },
  sky:     { active: "bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-md shadow-sky-500/30 ring-2 ring-sky-400 ring-offset-1",                 inactive: "bg-white text-gray-700 border border-gray-200 hover:border-sky-300 hover:bg-sky-50 hover:shadow-sm",                 chip: "bg-sky-100 text-sky-600" },
  emerald: { active: "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400 ring-offset-1", inactive: "bg-white text-gray-700 border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-sm", chip: "bg-emerald-100 text-emerald-600" },
  violet:  { active: "bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-md shadow-violet-500/30 ring-2 ring-violet-400 ring-offset-1",     inactive: "bg-white text-gray-700 border border-gray-200 hover:border-violet-300 hover:bg-violet-50 hover:shadow-sm",     chip: "bg-violet-100 text-violet-600" },
  teal:    { active: "bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-md shadow-teal-500/30 ring-2 ring-teal-400 ring-offset-1",             inactive: "bg-white text-gray-700 border border-gray-200 hover:border-teal-300 hover:bg-teal-50 hover:shadow-sm",             chip: "bg-teal-100 text-teal-600" },
  orange:  { active: "bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-md shadow-orange-500/30 ring-2 ring-orange-400 ring-offset-1",     inactive: "bg-white text-gray-700 border border-gray-200 hover:border-orange-300 hover:bg-orange-50 hover:shadow-sm",     chip: "bg-orange-100 text-orange-600" },
  cyan:    { active: "bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/30 ring-2 ring-cyan-400 ring-offset-1",             inactive: "bg-white text-gray-700 border border-gray-200 hover:border-cyan-300 hover:bg-cyan-50 hover:shadow-sm",             chip: "bg-cyan-100 text-cyan-600" },
  lime:    { active: "bg-gradient-to-br from-lime-500 to-lime-600 text-white shadow-md shadow-lime-500/30 ring-2 ring-lime-400 ring-offset-1",             inactive: "bg-white text-gray-700 border border-gray-200 hover:border-lime-300 hover:bg-lime-50 hover:shadow-sm",             chip: "bg-lime-100 text-lime-700" },
  fuchsia: { active: "bg-gradient-to-br from-fuchsia-500 to-fuchsia-600 text-white shadow-md shadow-fuchsia-500/30 ring-2 ring-fuchsia-400 ring-offset-1", inactive: "bg-white text-gray-700 border border-gray-200 hover:border-fuchsia-300 hover:bg-fuchsia-50 hover:shadow-sm", chip: "bg-fuchsia-100 text-fuchsia-600" },
  purple:  { active: "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-md shadow-purple-500/30 ring-2 ring-purple-400 ring-offset-1",     inactive: "bg-white text-gray-700 border border-gray-200 hover:border-purple-300 hover:bg-purple-50 hover:shadow-sm",     chip: "bg-purple-100 text-purple-600" },
  rose:    { active: "bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-md shadow-rose-500/30 ring-2 ring-rose-400 ring-offset-1",             inactive: "bg-white text-gray-700 border border-gray-200 hover:border-rose-300 hover:bg-rose-50 hover:shadow-sm",             chip: "bg-rose-100 text-rose-600" },
  slate:   { active: "bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-md shadow-slate-500/30 ring-2 ring-slate-400 ring-offset-1",         inactive: "bg-white text-gray-700 border border-gray-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm",         chip: "bg-slate-100 text-slate-600" },
};

export default function Configuracoes() {
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";
  const isAdmin = user?.role === "admin" || isMaster;
  const { selectedCompanyId } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const [activeTab, setActiveTab] = useState<TabKey>(isAdmin ? "criterios" : "senha");
  const [, setLoc] = useLocation();

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
  const [numProibidos, setNumProibidos] = useState("13,17,22,24,69,171,666");
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
      setNumProibidos(numberingQuery.data.numerosProibidos || '13,17,22,24,69,171,666');
      setNumDirty(false);
    }
  }, [numberingQuery.data]);

  // Parse números proibidos para Set
  const proibidosSet = new Set(
    numProibidos.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0)
  );
  // Função para calcular próximo número válido (pulando proibidos)
  const proximoValido = (num: number): number => {
    while (proibidosSet.has(num)) num++;
    return num;
  };

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
    { key: "modulos" as TabKey, label: "Módulos do Sistema", icon: ToggleRight, minRole: "admin", color: "indigo" },
    { key: "regras" as TabKey, label: "Regras de Ouro", icon: Shield, minRole: "admin", color: "amber" },
    { key: "criterios" as TabKey, label: "Critérios do Sistema", icon: Scale, minRole: "admin", color: "blue" },
    { key: "templates_docs" as TabKey, label: "Templates de Documentos", icon: FileText, minRole: "admin", color: "sky" },
    { key: "senha" as TabKey, label: "Minha Senha", icon: Key, minRole: "user", color: "emerald" },
    { key: "notificacoes" as TabKey, label: "Notificações E-mail", icon: Bell, minRole: "admin", color: "violet" },
    { key: "contrato_pj" as TabKey, label: "Contrato PJ", icon: FileText, minRole: "admin", color: "teal" },
    { key: "sindical" as TabKey, label: "Sindical / Dissídio", icon: Landmark, minRole: "admin", color: "orange" },
    { key: "sync_he" as TabKey, label: "Sincronizar HE", icon: RefreshCw, minRole: "admin", color: "cyan" },
    { key: "beneficios_alimentacao" as TabKey, label: "Benefícios Alimentação", icon: UtensilsCrossed, minRole: "admin", color: "lime" },
    { key: "terceiros" as TabKey, label: "Terceiros / Gestores", icon: Building2, minRole: "admin", color: "fuchsia" },
    { key: "portal_cliente" as TabKey, label: "Portal do Cliente", icon: Shield, minRole: "admin", color: "purple" },
    { key: "limpeza" as TabKey, label: "Limpeza de Dados", icon: Trash2, minRole: "admin_master", color: "rose" },
    { key: "backup" as TabKey, label: "Backup & Sincronização", icon: Database, minRole: "admin", color: "slate" },
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

        {/* Tabs — Rev. 2403: grid de cards coloridos (cor por módulo).
            Cada tab tem ícone num "chip" colorido + label; ativo ganha gradient + ring.
            Auto-fit responsivo: muitas colunas no desktop, 2 no mobile.
            IMPORTANTE: Tailwind JIT só detecta classes LITERAIS — mapa estático abaixo. */}
        <div className="mb-6 grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            const styles = TAB_COLOR_STYLES[tab.color] ?? TAB_COLOR_STYLES.slate;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm font-medium transition-all duration-150 ${isActive ? styles.active : styles.inactive}`}
              >
                <span className={`flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${isActive ? "bg-white/20 text-white" : styles.chip}`}>
                  <tab.icon className="w-4 h-4" />
                </span>
                <span className="leading-tight line-clamp-2 break-words">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB: Módulos do Sistema */}
        {activeTab === "modulos" && (
          <ModulosTab companyId={companyId} isMaster={isMaster} />
        )}

        {/* TAB: Regras de Ouro */}
        {activeTab === "regras" && (
          <GoldenRulesPanel />
        )}

        {/* TAB: Templates de Documentos (Rev. 2141) */}
        {activeTab === "templates_docs" && (
          <TemplatesDocsTab />
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </div>

                  {/* Números Proibidos */}
                  <div className="mt-4">
                    <Label className="text-sm font-medium text-gray-700 mb-1 block flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Números Proibidos
                    </Label>
                    <Input
                      value={numProibidos}
                      onChange={e => { setNumProibidos(e.target.value); setNumDirty(true); }}
                      placeholder="Ex: 13,17,22,24,69,171,666"
                      className="font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-1">Separe os números por vírgula. Esses números serão automaticamente pulados na geração de códigos internos.</p>
                    {proibidosSet.size > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Array.from(proibidosSet).sort((a, b) => a - b).map(n => (
                          <span key={n} className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-mono font-medium">
                            {n}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Preview com números proibidos */}
                  <div className="mt-4">
                    <Label className="text-sm font-medium text-gray-700 mb-1 block">Preview (pulando proibidos)</Label>
                    <div className="flex items-center gap-2 h-10 px-3 bg-gray-50 border rounded-md overflow-x-auto">
                      {(() => {
                        const previews: number[] = [];
                        let n = numProximo;
                        for (let i = 0; i < 5 && n < 99999; i++) {
                          n = proximoValido(n);
                          previews.push(n);
                          n++;
                        }
                        return previews.map((p, i) => (
                          <span key={i} className="flex items-center gap-2">
                            {i > 0 && <span className="text-xs text-gray-400">→</span>}
                            <span className={`font-mono ${i === 0 ? 'text-lg font-bold text-cyan-700' : 'text-sm text-gray-500'}`}>
                              {numPrefixo}{String(p).padStart(3, '0')}
                            </span>
                          </span>
                        ));
                      })()}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Sequência dos próximos códigos (números proibidos são pulados automaticamente)</p>
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
                        updateNumberingMutation.mutate({ companyId, prefixoCodigo: numPrefixo.trim(), nextCodigoInterno: numProximo, numerosProibidos: numProibidos.trim() });
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

            {/* ========== CONFIGURAÇÕES POR MÓDULO ========== */}
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2">Configurações por Módulo</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="space-y-3">
                <IAConfigSection />
                <ComprasConfigSection />
                <AlmoxarifadoConfigSection />
                <FinanceiroConfigSection />
                <PlanejamentoConfigSection />
              </div>
            </div>

            {/* ========== CRITÉRIOS CLT ========== */}
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2">Parâmetros CLT e Trabalhistas</span>
                <div className="flex-1 h-px bg-gray-200" />
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

            {/* ============ RECONTRATAÇÃO · Suplentes de Aprovação ============ */}
            <RecontratacaoAprovadoresSection companyId={companyId} isMaster={isMaster} />

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

        {/* TAB: Terceiros - Gestores para Contratos */}
        {activeTab === "terceiros" && (
          <GestoresContratoTab companyId={companyId} />
        )}

        {/* TAB: Portal do Cliente */}
        {activeTab === "portal_cliente" && (
          <Card className="border-indigo-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-indigo-700">
                <Shield className="w-5 h-5" />
                Portal do Cliente
              </CardTitle>
              <CardDescription>
                Gerenciar acessos do Portal do Cliente, cadastrar usuários, liberar abas por usuário (Visão Geral, Cronograma, Curva S, etc.) e acompanhar comentários e satisfação (NPS).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Button onClick={() => setLoc("/clientes/portal")} className="bg-indigo-600 hover:bg-indigo-700 gap-2 justify-start h-auto py-3">
                  <Users className="w-5 h-5 shrink-0" />
                  <div className="text-left">
                    <div className="font-semibold">Acessos do Portal</div>
                    <div className="text-xs opacity-90 font-normal">Cadastrar usuários, liberar abas, comentários e NPS</div>
                  </div>
                </Button>
                <Button variant="outline" onClick={() => setLoc("/clientes")} className="gap-2 justify-start h-auto py-3">
                  <Building2 className="w-5 h-5 shrink-0 text-slate-600" />
                  <div className="text-left">
                    <div className="font-semibold">Cadastro de Clientes</div>
                    <div className="text-xs text-slate-500 font-normal">Empresas e CNPJs vinculados ao Portal</div>
                  </div>
                </Button>
                {/* Rev. 1595 — Editor do Questionário (perguntas extras NPS) */}
                <Button variant="outline" onClick={() => setLoc("/clientes/portal/questionario")} className="gap-2 justify-start h-auto py-3 border-indigo-200 hover:bg-indigo-50">
                  <SlidersHorizontal className="w-5 h-5 shrink-0 text-indigo-600" />
                  <div className="text-left">
                    <div className="font-semibold">Editor do Questionário</div>
                    <div className="text-xs text-slate-500 font-normal">Adicionar/editar perguntas personalizadas (mantém NPS)</div>
                  </div>
                </Button>
              </div>
              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border">
                <b>Dica:</b> em <b>Acessos do Portal</b>, na linha de cada cliente, use o botão indigo <b>"Abas"</b> para configurar quais abas cada usuário enxerga ao abrir uma obra (<code>/portal/cliente/obra/...</code>). A aba <b>Visão Geral</b> é obrigatória.
              </div>
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

        {/* TAB: Backup */}
        {activeTab === "backup" && (
          <BackupTab />
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
function GestoresContratoTab({ companyId }: { companyId: number }) {
  const utils = trpc.useUtils();
  const gestoresQuery = trpc.companies.getGestoresContrato.useQuery({ companyId }, { enabled: companyId > 0 });
  const empQuery = trpc.employees.list.useQuery({ companyId }, { enabled: companyId > 0 });
  const funcoesQuery = trpc.jobFunctions.list.useQuery({ companyId }, { enabled: companyId > 0 });
  const salvarMut = trpc.companies.salvarGestoresContrato.useMutation({
    onSuccess: () => { toast.success("Gestores salvos com sucesso!"); utils.companies.getGestoresContrato.invalidate(); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const [finId, setFinId] = useState<string>("");

  useEffect(() => {
    if (gestoresQuery.data) {
      setFinId(gestoresQuery.data.gestorFinanceiroId ? String(gestoresQuery.data.gestorFinanceiroId) : "");
    }
  }, [gestoresQuery.data]);

  const ativos = useMemo(() => (empQuery.data || []).filter((e: any) => (e.status || "").toLowerCase() === "ativo").sort((a: any, b: any) => (a.nomeCompleto || "").localeCompare(b.nomeCompleto || "", "pt-BR")), [empQuery.data]);

  // Rev. 2746 — Nestes seletores só se enquadram funções da categoria INDIRETA
  // (jobFunctions.categoriaMO = "indireta_obra" | "escritorio_central"). Mão de
  // obra direta (pedreiro, servente, armador...) não serve como gestor/testemunha.
  const catByFn = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of (funcoesQuery.data || []) as any[]) {
      if (f?.nome) m.set(String(f.nome).trim().toUpperCase(), String(f.categoriaMO || "").toLowerCase());
    }
    return m;
  }, [funcoesQuery.data]);
  const isIndireta = (funcao?: string | null) => {
    const c = catByFn.get(String(funcao || "").trim().toUpperCase()) || "";
    return c === "indireta_obra" || c === "escritorio_central";
  };
  const ativosIndiretos = useMemo(() => ativos.filter((e: any) => isIndireta(e.funcao || e.cargo)), [ativos, catByFn]);
  // Mantém o gestor já salvo visível mesmo que sua função não seja indireta.
  const withSelected = (base: any[], selId: string) => {
    if (!selId || base.some((e: any) => String(e.id) === selId)) return base;
    const sel = ativos.find((e: any) => String(e.id) === selId);
    return sel ? [sel, ...base] : base;
  };
  const optsFin = useMemo(() => withSelected(ativosIndiretos, finId), [ativosIndiretos, finId, ativos]);

  const handleSalvar = () => {
    const finEmp = ativos.find((e: any) => String(e.id) === finId);
    salvarMut.mutate({
      companyId,
      gestorFinanceiroId: finId ? Number(finId) : null,
      gestorFinanceiroNome: finEmp ? finEmp.nomeCompleto : null,
      // Gestor de Projeto (testemunha 2) deixou de ser configurado aqui — o ERP
      // adota SEMPRE o "Engenheiro / Responsável" do cadastro da obra.
      gestorProjetoId: null,
      gestorProjetoNome: null,
    });
  };

  return (
    <Card className="border-orange-200">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2 text-orange-600">
          <Building2 className="w-5 h-5" />
          Gestores para Contratos de Terceiros
        </CardTitle>
        <CardDescription>
          Defina o colaborador que será automaticamente preenchido como <strong>Testemunha Financeiro</strong> nos contratos de terceiros. Apenas funções da categoria <strong>indireta</strong> aparecem na lista; digite o nome para filtrar. A <strong>Testemunha Gestor de Projeto</strong> é adotada automaticamente como o <strong>Engenheiro / Responsável</strong> do cadastro de cada obra.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="font-semibold flex items-center gap-1">
              <DollarSign className="w-4 h-4 text-green-600" />
              Gestor Financeiro (Testemunha)
            </Label>
            <EmployeeCombobox
              value={finId}
              onChange={setFinId}
              options={optsFin}
              placeholder="Selecione o gestor financeiro..."
            />
            {gestoresQuery.data?.gestorFinanceiroNome && (
              <p className="text-xs text-muted-foreground">Atual: {gestoresQuery.data.gestorFinanceiroNome}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="font-semibold flex items-center gap-1">
              <Hammer className="w-4 h-4 text-blue-600" />
              Gestor de Projeto (Testemunha)
            </Label>
            <div className="rounded-md border border-dashed border-blue-200 bg-blue-50/50 px-3 py-2 text-xs text-blue-700">
              Preenchido automaticamente com o <strong>Engenheiro / Responsável</strong> do cadastro da obra vinculada ao contrato.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSalvar} disabled={salvarMut.isPending}>
            {salvarMut.isPending ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4 mr-1" /> Salvar Gestores</>}
          </Button>
          <p className="text-xs text-muted-foreground">
            O nome selecionado será usado automaticamente como Testemunha Financeiro ao gerar novos contratos de terceiros.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

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
    setNotifContratacao(Boolean(r.notificarContratacao)); setNotifDemissao(Boolean(r.notificarDemissao));
    setNotifTransferencia(Boolean(r.notificarTransferencia)); setNotifAfastamento(Boolean(r.notificarAfastamento));
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
    updateMut.mutate({ id: r.id, ativo: !Number(r.ativo) });
  }

  const recipients = recipientsQuery.data || [];
  const activeCount = recipients.filter((r: any) => Number(r.ativo)).length;

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
        <div className="flex gap-2">
          <Button variant="outline" size="sm"
            onClick={() => {
              const el = document.getElementById('notif-historico-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
              // Dispatch custom event to open preview
              window.dispatchEvent(new CustomEvent('open-notif-preview'));
            }}>
            <Send className="w-4 h-4 mr-1" /> Enviar Teste
          </Button>
          <Button onClick={() => { resetForm(); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-1" /> Novo Destinatário
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{fmtNum(recipients.length)}</p>
          <p className="text-xs text-gray-500">Total Cadastrados</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{fmtNum(activeCount)}</p>
          <p className="text-xs text-gray-500">Ativos</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-emerald-700">{fmtNum(recipients.filter((r: any) => Number(r.ativo) && Number(r.notificarContratacao)).length)}</p>
          <p className="text-xs text-gray-500">Recebem Contratação</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{fmtNum(recipients.filter((r: any) => Number(r.ativo) && Number(r.notificarDemissao)).length)}</p>
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
            <div key={r.id} className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${Number(r.ativo) ? "bg-white hover:bg-gray-50" : "bg-gray-50 opacity-60"}`}>
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${Number(r.ativo) ? "bg-blue-600" : "bg-gray-400"}`}>
                  {r.nome.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{r.nome}</p>
                  <p className="text-sm text-gray-500 truncate">{r.email}</p>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {!!r.notificarContratacao && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium">Contratação</span>}
                  {!!r.notificarDemissao && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">Demissão</span>}
                  {!!r.notificarTransferencia && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">Transferência</span>}
                  {!!r.notificarAfastamento && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">Afastamento</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleToggleActive(r)} title={Number(r.ativo) ? "Desativar" : "Ativar"}>
                  {Number(r.ativo) ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
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

  // Listen for custom event from parent to open preview
  useEffect(() => {
    const handler = () => {
      setShowPreview(true);
      setTimeout(() => {
        const el = document.getElementById('notif-preview-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    };
    window.addEventListener('open-notif-preview', handler);
    return () => window.removeEventListener('open-notif-preview', handler);
  }, []);

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
      if (data.enviados > 0) {
        toast.success(`Teste enviado para ${data.enviados} destinatário(s)!`);
      } else if (data.erros > 0) {
        toast.error(`Falha no envio: ${data.erroMensagem || "Erro SMTP. Verifique as configurações de e-mail."}`);
      } else {
        toast.error("Nenhum destinatário ativo para este tipo de notificação.");
      }
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
      // Se o timestamp do banco não tem 'Z' nem offset, é UTC do MySQL — forçar UTC
      if (typeof ts === "string" && !ts.includes("Z") && !ts.includes("+") && !ts.includes("-", 10)) {
        const utc = new Date(ts + "Z");
        return utc.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      }
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
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
          <p className="text-2xl font-bold text-indigo-700">{fmtNum(stats.total)}</p>
          <p className="text-xs text-gray-500">Total Enviadas</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{fmtNum(stats.enviados)}</p>
          <p className="text-xs text-gray-500">✓ Enviados</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{fmtNum(stats.erros)}</p>
          <p className="text-xs text-gray-500">✗ Erros</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{fmtNum(stats.lidos)}</p>
          <p className="text-xs text-gray-500">👁 Lidos</p>
        </div>
      </div>

      {/* Preview de texto */}
      {showPreview && (
        <Card id="notif-preview-section" className="border-indigo-200">
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
// Sub-itens de navegação por módulo (espelha DashboardLayout)
type ModPageItem = { label: string; path: string; section: string };
const MODULE_PAGES: Record<string, ModPageItem[]> = {
  rh: [
    { section: "Principal", label: "Painel RH", path: "/painel/rh" },
    { section: "Principal", label: "Colaboradores", path: "/colaboradores" },
    { section: "Operacional", label: "Fechamento de Ponto", path: "/fechamento-ponto" },
    { section: "Operacional", label: "Folha de Pagamento", path: "/folha-pagamento" },
    { section: "Operacional", label: "Controle de Documentos", path: "/controle-documentos" },
    { section: "Operacional", label: "Vale Alimentação", path: "/vale-alimentacao" },
    { section: "Operacional", label: "Solicitação de Hora Extra", path: "/solicitacao-he" },
    { section: "Operacional", label: "Apontamentos de Campo", path: "/apontamentos-campo" },
    { section: "Operacional", label: "Crachás", path: "/crachas" },
    { section: "Operacional", label: "Lançar Atestados", path: "/controle-documentos?tab=atestados" },
    { section: "Operacional", label: "Advertências", path: "/controle-documentos?tab=advertencias" },
    { section: "Gestão de Pessoas", label: "Aviso Prévio", path: "/aviso-previo" },
    { section: "Gestão de Pessoas", label: "Férias", path: "/ferias" },
    { section: "Gestão de Pessoas", label: "Contratos PJ", path: "/modulo-pj" },
    { section: "Gestão de Pessoas", label: "PJ Medições", path: "/pj-medicoes" },
    { section: "Relatórios", label: "Raio-X do Funcionário", path: "/relatorios/raio-x" },
    { section: "Relatórios", label: "Relatório de Ponto", path: "/relatorios/ponto" },
    { section: "Relatórios", label: "Relatório de Folha", path: "/relatorios/folha" },
    { section: "Relatórios", label: "Relatório de Divergências", path: "/relatorios/divergencias" },
    { section: "Relatórios", label: "Custo por Obra", path: "/relatorios/custo-obra" },
    { section: "Relatórios", label: "Habilidades por Obra", path: "/relatorios/habilidades-obra" },
    { section: "Dashboards", label: "Todos os Dashboards", path: "/dashboards" },
    { section: "Dashboards", label: "Funcionários", path: "/dashboards/funcionarios" },
    { section: "Dashboards", label: "Cartão de Ponto", path: "/dashboards/cartao-ponto" },
    { section: "Dashboards", label: "Folha de Pagamento", path: "/dashboards/folha-pagamento" },
    { section: "Dashboards", label: "Horas Extras", path: "/dashboards/horas-extras" },
    { section: "Dashboards", label: "Aviso Prévio", path: "/dashboards/aviso-previo" },
    { section: "Dashboards", label: "Férias", path: "/dashboards/ferias" },
    { section: "Dashboards", label: "Efetivo por Obra", path: "/dashboards/efetivo-obra" },
    { section: "Dashboards", label: "Perfil por Tempo de Casa", path: "/dashboards/perfil-tempo-casa" },
    { section: "Dashboards", label: "Controle de Documentos", path: "/dashboards/controle-documentos" },
    { section: "Dashboards", label: "Apontamentos de Campo", path: "/dashboards/apontamentos" },
    { section: "Dashboards", label: "Habilidades", path: "/dashboards/habilidades" },
    { section: "Tabelas e Config.", label: "Feriados", path: "/feriados" },
    { section: "Tabelas e Config.", label: "Dissídio", path: "/dissidio" },
    { section: "Inteligência Artificial", label: "Comparativo Convenções", path: "/comparativo-convencoes" },
  ],
  sst: [
    { section: "Principal", label: "Painel SST", path: "/painel/sst" },
    { section: "Segurança", label: "Controle de EPIs", path: "/epis" },
    { section: "Segurança", label: "Estoque por Obra", path: "/epis?tab=estoque_obra" },
    { section: "Segurança", label: "Checklists EPI", path: "/epis?tab=checklist" },
    { section: "Segurança", label: "Descontos EPI", path: "/epis?tab=descontos" },
    { section: "Segurança", label: "Transferências EPI", path: "/epis?tab=transferencias" },
    { section: "Segurança", label: "Config EPI", path: "/epis?tab=config" },
    { section: "Segurança", label: "CIPA", path: "/cipa" },
    { section: "Incidentes & Acidentes", label: "Registro de Acidentes", path: "/sst/acidentes" },
    { section: "Dashboards", label: "EPIs", path: "/dashboards/epis" },
    { section: "Dashboards", label: "Atestados & Acidentes", path: "/sst/dashboard-atestados-acidentes" },
  ],
  juridico: [
    { section: "Principal", label: "Painel Jurídico", path: "/painel/juridico" },
    { section: "Trabalhista", label: "Processos Trabalhistas", path: "/processos-trabalhistas" },
    { section: "Trabalhista", label: "Painel Trabalhista", path: "/painel/juridico-trabalhista" },
    { section: "Tributário", label: "Processos Tributários", path: "/processos-tributarios" },
    { section: "Tributário", label: "Painel Tributário", path: "/painel/tributario" },
    { section: "Cível", label: "Processos Cíveis", path: "/processos-civeis" },
    { section: "Cível", label: "Painel Cível", path: "/painel/civil" },
    { section: "Dashboards", label: "Dashboard Jurídico", path: "/dashboards/juridico" },
    { section: "Dashboards", label: "Dashboard Trabalhista", path: "/dashboards/trabalhista" },
    { section: "Dashboards", label: "Dashboard Tributário", path: "/dashboards/tributario" },
    { section: "Dashboards", label: "Dashboard Cível", path: "/dashboards/civil" },
  ],
  avaliacao: [
    { section: "Avaliação", label: "Dashboard", path: "/avaliacao-desempenho" },
    { section: "Avaliação", label: "Avaliar Funcionário", path: "/avaliacao-desempenho?tab=avaliar" },
    { section: "Avaliação", label: "Avaliações Realizadas", path: "/avaliacao-desempenho?tab=avaliacoes" },
    { section: "Avaliação", label: "Raio-X do Funcionário", path: "/avaliacao-desempenho?tab=raio-x" },
    { section: "Gestão", label: "Avaliadores", path: "/avaliacao-desempenho?tab=avaliadores" },
    { section: "Gestão", label: "Critérios", path: "/avaliacao-desempenho?tab=criterios" },
    { section: "Pesquisas", label: "Pesquisas Customizadas", path: "/avaliacao-desempenho?tab=pesquisas" },
    { section: "Pesquisas", label: "Clima Organizacional", path: "/avaliacao-desempenho?tab=clima" },
  ],
  terceiros: [
    { section: "Terceiros", label: "Painel Terceiros", path: "/terceiros/painel" },
    { section: "Terceiros", label: "Empresas Terceiras", path: "/compras/fornecedores" },
    { section: "Terceiros", label: "Funcionários Terceiros", path: "/terceiros/funcionarios" },
    { section: "Contratos", label: "Contratos de Serviço", path: "/terceiros/contratos" },
    { section: "Contratos", label: "Medições", path: "/terceiros/medicoes" },
    { section: "Contratos", label: "Previsão de Caixa", path: "/terceiros/previsao-caixa" },
    { section: "Conformidade", label: "Obrigações Mensais", path: "/terceiros/obrigacoes" },
    { section: "Conformidade", label: "Painel de Conformidade", path: "/terceiros/conformidade" },
    { section: "Conformidade", label: "Alertas e Cobranças", path: "/terceiros/alertas" },
    { section: "Conformidade", label: "Advertências", path: "/terceiros/advertencias" },
    { section: "Operacional", label: "Portal Externo", path: "/terceiros/portal" },
    { section: "IA", label: "Validação IA de Docs", path: "/terceiros/validacao-ia" },
  ],
  parceiros: [
    { section: "Parceiros", label: "Painel Parceiros", path: "/parceiros/painel" },
    { section: "Parceiros", label: "Parceiros Conveniados", path: "/parceiros/cadastro" },
    { section: "Operacional", label: "Lançamentos", path: "/parceiros/lancamentos" },
    { section: "Operacional", label: "Aprovações RH", path: "/parceiros/aprovacoes" },
    { section: "Operacional", label: "Portal Externo", path: "/parceiros/portal" },
    { section: "Financeiro", label: "Guia de Descontos", path: "/parceiros/guia-descontos" },
    { section: "Financeiro", label: "Pagamentos", path: "/parceiros/pagamentos" },
  ],
  orcamento: [
    { section: "Orçamento", label: "Painel Orçamento", path: "/orcamento/painel" },
    { section: "Orçamento", label: "Dashboard", path: "/orcamento/dash" },
    { section: "Orçamento", label: "Orçamentos", path: "/orcamento/lista" },
    { section: "Orçamento", label: "Composições", path: "/orcamento/composicoes" },
    { section: "Orçamento", label: "Insumos", path: "/orcamento/insumos" },
    { section: "Orçamento", label: "Encargos Sociais", path: "/orcamento/encargos" },
  ],
  planejamento: [
    { section: "Planejamento", label: "Projetos", path: "/planejamento" },
    { section: "Abas do Projeto", label: "Visão Geral",           path: "/planejamento?tab=visao-geral" },
    { section: "Abas do Projeto", label: "Cronograma",            path: "/planejamento?tab=cronograma" },
    { section: "Abas do Projeto", label: "Gantt",                 path: "/planejamento?tab=gantt" },
    { section: "Abas do Projeto", label: "Linha de Balanços",     path: "/planejamento?tab=lob" },
    { section: "Abas do Projeto", label: "Crono. Financeiro",     path: "/planejamento?tab=cronograma-financeiro" },
    { section: "Abas do Projeto", label: "Curva S",               path: "/planejamento?tab=curva-s" },
    { section: "Abas do Projeto", label: "Avanço Semanal",        path: "/planejamento?tab=avanco" },
    { section: "Abas do Projeto", label: "Caminho Crítico",       path: "/planejamento?tab=caminho-critico" },
    { section: "Abas do Projeto", label: "Cronograma de Compras", path: "/planejamento?tab=compras" },
    { section: "Abas do Projeto", label: "Prev. Medição",         path: "/planejamento?tab=prev-medicao" },
    { section: "Abas do Projeto", label: "Prog. Semanal",         path: "/planejamento?tab=prog-semanal" },
    { section: "Abas do Projeto", label: "Diagrama de Rede",      path: "/planejamento?tab=diagrama-rede" },
    { section: "Abas do Projeto", label: "Revisões",              path: "/planejamento?tab=revisoes" },
    { section: "Abas do Projeto", label: "REFIS",                 path: "/planejamento?tab=refis" },
    { section: "Abas do Projeto", label: "IA Gestora",            path: "/planejamento?tab=ia-gestora" },
    { section: "Abas do Projeto", label: "BIM 3D",               path: "/planejamento?tab=bim-3d" },
  ],
  "portal-cliente": [
    { section: "Administração", label: "Acessos do Portal", path: "/clientes/portal" },
    { section: "Administração", label: "Comentários", path: "/clientes/portal?tab=comentarios" },
    { section: "Administração", label: "Avaliações (NPS)", path: "/clientes/portal?tab=avaliacoes" },
    { section: "Cadastro", label: "Clientes", path: "/clientes" },
  ],
  cadastro: [
    { section: "Cadastro", label: "Empresas", path: "/empresas" },
    { section: "Cadastro", label: "Colaboradores", path: "/colaboradores" },
    { section: "Cadastro", label: "Clientes", path: "/clientes" },
    { section: "Cadastro", label: "Obras", path: "/obras" },
    { section: "Cadastro", label: "Efetivo por Obra", path: "/obras/efetivo" },
    { section: "Cadastro", label: "Setores", path: "/setores" },
    { section: "Cadastro", label: "Funções", path: "/funcoes" },
    { section: "Cadastro", label: "Relógios de Ponto", path: "/relogios-ponto" },
    { section: "Cadastro", label: "Convenções Coletivas", path: "/convencoes-coletivas" },
    { section: "Cadastro", label: "Habilidades", path: "/habilidades" },
    { section: "Cadastro", label: "Contas Bancárias", path: "/contas-bancarias" },
    { section: "Cadastro", label: "Empresas Terceiras", path: "/compras/fornecedores" },
  ],
  compras: [
    { section: "Painel", label: "Painel de Controle", path: "/compras/painel" },
    { section: "Fluxo", label: "Solicitações (SC)", path: "/compras/solicitacoes" },
    { section: "Fluxo", label: "Cotações", path: "/compras/cotacoes" },
    { section: "Fluxo", label: "Ordens (OC / OS)", path: "/compras/ordens" },
    { section: "Fluxo", label: "Recebimentos", path: "/compras/recebimentos" },
    { section: "Prioridade", label: "Compras Emergenciais", path: "/compras/emergencial" },
    { section: "Prioridade", label: "Aprovações Pendentes", path: "/compras/aprovacoes" },

    { section: "Financeiro", label: "Realocação de Verba", path: "/compras/realocacao" },
    { section: "Financeiro", label: "Comissões", path: "/compras/comissoes" },
    { section: "Cadastros", label: "Empresas Terceiras", path: "/compras/fornecedores" },
    { section: "Sistema", label: "Configurações", path: "/compras/configuracoes" },
    { section: "Sistema", label: "Mas Controle ERP", path: "/integracoes/mas-controle" },
  ],
  almoxarifado: [
    { section: "Almoxarifado", label: "Visão Geral", path: "/almoxarifado" },
    { section: "Almoxarifado", label: "Movimentações", path: "/almoxarifado/movimentacoes" },
    { section: "Almoxarifado", label: "Inventário Semanal", path: "/almoxarifado/inventario" },
    { section: "Ações Rápidas", label: "Nova Entrada", path: "/almoxarifado?modal=entrada" },
    { section: "Ações Rápidas", label: "Ferramentas", path: "/almoxarifado?modal=ferramentas" },
    { section: "Ações Rápidas", label: "Insumo", path: "/almoxarifado?modal=insumo" },
    { section: "Ações Rápidas", label: "Transferir", path: "/almoxarifado?modal=transferir" },
    { section: "Ações Rápidas", label: "Fechar Dia", path: "/almoxarifado?modal=fechardia" },
    { section: "Ações Rápidas", label: "Cadastros", path: "/almoxarifado?modal=cadastros" },
    { section: "Configurações", label: "Categorias", path: "/almoxarifado/categorias" },
  ],
  financeiro: [
    { section: "Painel", label: "Dashboard", path: "/financeiro" },
    { section: "Movimentações", label: "Lançamentos", path: "/financeiro/lancamentos" },
    { section: "Análise", label: "Análise CFO (Hackett/IFRS/AFP)", path: "/financeiro/analise-cfo" },
    { section: "Análise", label: "CFO Suite (3WM/Reconcil/DD/DRE Dual)", path: "/financeiro/cfo-suite" },
    { section: "Movimentações", label: "Previsão de Faturamento", path: "/financeiro/contas-a-receber" },
    { section: "Movimentações", label: "Contas a Pagar", path: "/financeiro/contas-a-pagar" },
    { section: "Movimentações", label: "Previsão de Faturamento", path: "/financeiro/contas-a-receber" },
    { section: "Análise", label: "DRE", path: "/financeiro/dre" },
    { section: "Análise", label: "Fluxo de Caixa", path: "/financeiro/fluxo-de-caixa" },
    { section: "Análise", label: "Obrigações Fiscais", path: "/financeiro/obrigacoes-fiscais" },
    { section: "Cadastros", label: "Plano de Contas", path: "/financeiro/plano-de-contas" },
    { section: "Cadastros", label: "Categorias", path: "/financeiro/categorias" },
    { section: "Cadastros", label: "Centros de Custo", path: "/financeiro/centros-de-custo" },
    { section: "Cadastros", label: "Conciliação Bancária", path: "/financeiro/conciliacao" },
    { section: "Movimentações", label: "Recorrentes", path: "/financeiro/recorrentes" },
    { section: "Cadastros", label: "Configurações", path: "/financeiro/configuracoes" },
  ],
  medicao: [
    { section: "Medição", label: "Contratos de Medição", path: "/medicao" },
    { section: "Medição", label: "Boletins de Medição", path: "/medicao?tab=boletins" },
    { section: "Medição", label: "Fundo de Despesas (FD)", path: "/medicao?tab=fd" },
    { section: "Medição", label: "Faturamento", path: "/medicao?tab=faturamento" },
  ],
  "gestao-documentos": [
    { section: "Principal", label: "Dashboard", path: "/gestao-documentos" },
    { section: "Principal", label: "Painel", path: "/gestao-documentos?tab=painel" },
    { section: "Documentos", label: "Documentos Técnicos", path: "/gestao-documentos?tab=documentos" },
    { section: "Documentos", label: "ARTs / RRTs", path: "/gestao-documentos?tab=arts" },
    { section: "Configurações", label: "Disciplinas e Tipos", path: "/gestao-documentos?tab=configuracoes" },
  ],
  operacional: [
    { section: "Painel", label: "Dashboard Operacional", path: "/operacional/painel" },
    { section: "Diário de Obra", label: "RDO", path: "/operacional/rdo" },
    { section: "Qualidade", label: "Checklists", path: "/operacional/checklists" },
    { section: "Qualidade", label: "Concretagem", path: "/operacional/concretagem" },
    { section: "Qualidade", label: "Não Conformidades", path: "/operacional/nc" },
    { section: "Registros", label: "Registro Fotográfico", path: "/operacional/fotos" },
  ],
  frotas: [
    { section: "Painel", label: "Dashboard Frotas", path: "/frotas/painel" },
    { section: "Painel", label: "Analítico", path: "/frotas/analitico" },
    { section: "Painel", label: "Dash Manutenção", path: "/frotas/manutencoes-dashboard" },
    { section: "Cadastro", label: "Veículos", path: "/frotas/veiculos" },
    { section: "Operacional", label: "Manutenções", path: "/frotas/manutencoes" },
    { section: "Operacional", label: "Combustível", path: "/frotas/combustivel" },
    { section: "Operacional", label: "Preços Combustível", path: "/frotas/precos-combustivel" },
    { section: "Operacional", label: "Pedágios", path: "/frotas/pedagios" },
    { section: "Obrigações", label: "Multas", path: "/frotas/multas" },
    { section: "Obrigações", label: "IPVA", path: "/frotas/ipva" },
    { section: "Obrigações", label: "Licenciamento", path: "/frotas/licenciamento" },
    { section: "Obrigações", label: "Seguros", path: "/frotas/seguros" },
    { section: "Relatórios", label: "Raio-X do Veículo", path: "/frotas/raio-x" },
    { section: "Relatórios", label: "Checklist Veicular", path: "/frotas/checklist" },
    { section: "Rastreamento", label: "Mapa e Trajetos", path: "/frotas/rastreamento" },
  ],
  "comunicados-internos": [
    { section: "Comunicados", label: "Comunicados Internos", path: "/comunicados-internos" },
  ],
  curriculos: [
    { section: "Currículos", label: "Banco de Currículos", path: "/curriculos" },
  ],
  oraculo: [
    { section: "Oráculo", label: "Assistente IA", path: "/oraculo" },
  ],
};

function ModulosTab({ companyId, isMaster }: { companyId: number; isMaster: boolean }) {
  const { modules, isLoading, refetch } = useModuleConfig();
  const toggleMut = trpc.moduleConfig.toggle.useMutation({
    onSuccess: () => { refetch(); toast.success("Módulo atualizado com sucesso!"); },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar módulo"),
  });
  const togglePageMut = trpc.moduleConfig.togglePage.useMutation({
    onSuccess: () => { refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar funcionalidade"),
  });

  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Acompanha a ordem definida na tela inicial
  const [moduleOrder, setModuleOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("fc-module-order") || "[]"); } catch { return []; }
  });
  useEffect(() => {
    const onCustom = (e: Event) => setModuleOrder((e as CustomEvent).detail ?? []);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "fc-module-order") { try { setModuleOrder(JSON.parse(e.newValue || "[]")); } catch {} }
    };
    window.addEventListener("fc-module-order-changed", onCustom);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("fc-module-order-changed", onCustom); window.removeEventListener("storage", onStorage); };
  }, []);

  const keyToHubId: Record<string, string> = { rh: "rh-dp" };

  const MODULE_INFO: Record<string, { label: string; subtitle: string; icon: any; color: string; bgColor: string; borderColor: string; description: string }> = {
    rh: { label: "RH & DP", subtitle: "Recursos Humanos e Departamento Pessoal", icon: Users, color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200", description: "Colaboradores, folha de pagamento, ponto eletrônico, férias, benefícios, advertências, rescisão e documentação trabalhista." },
    sst: { label: "SST", subtitle: "Segurança e Saúde do Trabalho", icon: Shield, color: "text-emerald-600", bgColor: "bg-emerald-50", borderColor: "border-emerald-200", description: "EPIs, ASOs, CIPA, treinamentos de segurança, DDS, desvios, planos de ação e conformidade com normas regulamentadoras." },
    juridico: { label: "Jurídico", subtitle: "Gestão Jurídica Trabalhista", icon: Scale, color: "text-slate-600", bgColor: "bg-slate-50", borderColor: "border-slate-200", description: "Processos trabalhistas, audiências, provisões, análise de risco jurídico e integração DataJud." },
    avaliacao: { label: "Avaliação", subtitle: "Avaliação de Desempenho", icon: ClipboardList, color: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-amber-200", description: "Questionários personalizáveis, ciclos de avaliação, ranking de desempenho, pesquisas e clima organizacional." },
    terceiros: { label: "Terceiros", subtitle: "Gestão de Empresas Terceirizadas", icon: HardHat, color: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200", description: "Cadastro, documentação, obrigações mensais, aptidão, conformidade e portal externo para terceiros." },
    parceiros: { label: "Parceiros", subtitle: "Portal de Convênios", icon: Coffee, color: "text-purple-600", bgColor: "bg-purple-50", borderColor: "border-purple-200", description: "Farmácia, posto, restaurante e outros convênios com lançamentos, aprovações e guia de descontos." },
    orcamento:      { label: "Orçamento",      subtitle: "Orçamento de Obras",                  icon: Calculator,    color: "text-cyan-600",   bgColor: "bg-cyan-50",   borderColor: "border-cyan-200",   description: "Importação de planilhas Excel com BDI, 3 versões de orçamento (Venda, Custo, Meta) e curva ABC de insumos." },
    planejamento:   { label: "Planejamento",   subtitle: "Planejamento e Controle de Obras",     icon: CalendarCheck, color: "text-green-600",  bgColor: "bg-green-50",  borderColor: "border-green-200",  description: "Cronograma MS Project, Curva S, Avanço Semanal, Caminho Crítico, Cronograma Financeiro, Compras e REFIS." },
    cadastro:       { label: "Cadastro",       subtitle: "Gestão de Cadastros",                  icon: BookOpen,      color: "text-indigo-600", bgColor: "bg-indigo-50", borderColor: "border-indigo-200", description: "Empresas, colaboradores, obras, setores, funções, relógios de ponto, convenções coletivas e habilidades." },
    compras:        { label: "Compras",        subtitle: "Suprimentos e Procurement",            icon: ShoppingCart,  color: "text-rose-600",   bgColor: "bg-rose-50",   borderColor: "border-rose-200",   description: "Solicitações de compra, cotações, ordens de compra, fornecedores e integração com MAS Controle." },
    almoxarifado:   { label: "Almoxarifado",   subtitle: "Controle de Estoque",                  icon: Warehouse,     color: "text-teal-600",   bgColor: "bg-teal-50",   borderColor: "border-teal-200",   description: "Gestão de materiais, entradas e saídas, inventário, requisições e transferências entre obras." },
    financeiro:     { label: "Financeiro",     subtitle: "Gestão Financeira",                    icon: DollarSign,    color: "text-yellow-600", bgColor: "bg-yellow-50", borderColor: "border-yellow-200", description: "Lançamentos, contas a pagar/receber, DRE, fluxo de caixa, plano de contas e obrigações fiscais." },
    medicao:        { label: "Medição",        subtitle: "Medição de Contratos",                 icon: FileBarChart,  color: "text-teal-600",   bgColor: "bg-teal-50",   borderColor: "border-teal-200",   description: "Boletins de medição por contrato, planilha EAP com avanço físico, faturamento direto e controle de FDs." },
    "gestao-documentos": { label: "Proj./Doc. Técnicos", subtitle: "Projetos e Documentos Técnicos", icon: FolderOpen, color: "text-indigo-600", bgColor: "bg-indigo-50", borderColor: "border-indigo-200", description: "Controle de documentos técnicos, revisões com aprovação, disciplinas, ARTs/RRTs e distribuição." },
    operacional: { label: "Operacional", subtitle: "Gestão Operacional de Obras", icon: Hammer, color: "text-orange-600", bgColor: "bg-orange-50", borderColor: "border-orange-200", description: "RDO, checklists de qualidade, mapa de concretagem, não conformidades, registro fotográfico e dashboard operacional." },
    frotas: { label: "Frotas", subtitle: "Controle de Frotas", icon: Truck, color: "text-cyan-600", bgColor: "bg-cyan-50", borderColor: "border-cyan-200", description: "Veículos, manutenções, combustível, multas, IPVA, licenciamento, seguros com análise IA e rastreamento." },
    "comunicados-internos": { label: "Comunicados Internos", subtitle: "Avisos Oficiais da Empresa", icon: Megaphone, color: "text-blue-600", bgColor: "bg-blue-50", borderColor: "border-blue-200", description: "Cadastro e arquivo de comunicados internos com numeração automática anual e anexos." },
    curriculos: { label: "Currículos", subtitle: "Banco de Currículos", icon: Briefcase, color: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-amber-200", description: "Banco de currículos recebidos organizado por função, com cadastro de novas funções e anexos." },
    oraculo: { label: "Oráculo", subtitle: "Assistente IA do Sistema", icon: Brain, color: "text-violet-600", bgColor: "bg-violet-50", borderColor: "border-violet-200", description: "Assistente inteligente com IA para consultas, análises e orientações sobre dados do sistema." },
    "portal-cliente": { label: "Portal do Cliente", subtitle: "Acesso Externo dos Clientes", icon: ExternalLink, color: "text-indigo-600", bgColor: "bg-indigo-50", borderColor: "border-indigo-200", description: "Administração das credenciais de acesso dos clientes ao portal externo, comentários e avaliações anônimas (NPS)." },
  };

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>;

  const sortedModules = moduleOrder.length === 0 ? modules : [...modules].sort((a: any, b: any) => {
    const aHub = keyToHubId[a.moduleKey] ?? a.moduleKey;
    const bHub = keyToHubId[b.moduleKey] ?? b.moduleKey;
    const ai = moduleOrder.indexOf(aHub);
    const bi = moduleOrder.indexOf(bHub);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Módulos do Sistema</h2>
          <p className="text-sm text-gray-500 mt-1">Habilite ou desabilite módulos inteiros ou funcionalidades específicas. Itens desabilitados ficam ocultos na barra lateral para todos os usuários.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <ToggleRight className="h-4 w-4" />
          <span>Apenas Admin pode alterar</span>
        </div>
      </div>

      <div className="grid gap-3">
        {sortedModules.map((mod: any) => {
          const info = MODULE_INFO[mod.moduleKey];
          if (!info) return null;
          const Icon = info.icon;
          const isExpanded = expandedModules.has(mod.moduleKey);
          const pages = MODULE_PAGES[mod.moduleKey] ?? [];
          const disabledPages: string[] = mod.disabledPages ?? [];
          const disabledCount = disabledPages.length;

          // Group pages by section
          const sections: Record<string, ModPageItem[]> = {};
          for (const p of pages) {
            if (!sections[p.section]) sections[p.section] = [];
            sections[p.section].push(p);
          }

          return (
            <div key={mod.moduleKey} className={`rounded-xl border-2 transition-all ${mod.enabled ? `${info.borderColor} ${info.bgColor}` : "border-gray-200 bg-gray-50 opacity-60"}`}>
              {/* Header row */}
              <div className="flex items-center gap-4 p-4">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${mod.enabled ? info.bgColor : "bg-gray-100"}`}>
                  <Icon className={`h-5 w-5 ${mod.enabled ? info.color : "text-gray-400"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`font-semibold text-sm ${mod.enabled ? "text-gray-900" : "text-gray-500"}`}>{info.label}</h3>
                    <span className="text-xs text-gray-400 hidden sm:inline">{info.subtitle}</span>
                    {disabledCount > 0 && mod.enabled && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {disabledCount} {disabledCount === 1 ? "item oculto" : "itens ocultos"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{info.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${mod.enabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {mod.enabled ? "Habilitado" : "Desabilitado"}
                  </span>
                  <Switch
                    checked={mod.enabled}
                    onCheckedChange={(checked: boolean) => toggleMut.mutate({ companyId, moduleKey: mod.moduleKey, enabled: checked })}
                    disabled={toggleMut.isPending}
                  />
                  {pages.length > 0 && (
                    <button
                      onClick={() => setExpandedModules(prev => {
                        const next = new Set(prev);
                        if (next.has(mod.moduleKey)) next.delete(mod.moduleKey);
                        else next.add(mod.moduleKey);
                        return next;
                      })}
                      className={`p-1 rounded-lg hover:bg-white/60 transition-colors ${mod.enabled ? info.color : "text-gray-400"}`}
                      title={isExpanded ? "Recolher funcionalidades" : "Expandir funcionalidades"}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded sub-items */}
              {isExpanded && pages.length > 0 && (
                <div className="border-t border-current/10 px-4 pb-4 pt-3">
                  <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5" />
                    Itens desabilitados ficam ocultos na barra lateral para todos os usuários. Os dados são preservados.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5">
                    {Object.entries(sections).map(([sectionTitle, items]) => (
                      <div key={sectionTitle} className="mb-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 pl-1">{sectionTitle}</p>
                        {items.map(item => {
                          const pageEnabled = !disabledPages.includes(item.path);
                          return (
                            <div key={item.path} className="flex items-center justify-between py-1 px-1 rounded-lg hover:bg-white/50 transition-colors group">
                              <span className={`text-xs ${pageEnabled ? "text-gray-700" : "text-gray-400 line-through"}`}>{item.label}</span>
                              <Switch
                                checked={pageEnabled}
                                onCheckedChange={(checked: boolean) => togglePageMut.mutate({ companyId, moduleKey: mod.moduleKey, pagePath: item.path, enabled: checked })}
                                disabled={togglePageMut.isPending || !mod.enabled}
                                className="scale-75 origin-right"
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
              <li>• <strong>Módulo desabilitado:</strong> todo o módulo fica oculto na tela inicial e barra lateral.</li>
              <li>• <strong>Funcionalidade desabilitada:</strong> apenas aquela tela fica oculta na barra lateral.</li>
              <li>• Os dados sempre são <strong>preservados</strong> — nada é excluído ao desabilitar.</li>
              <li>• Clique na seta <ChevronRight className="inline h-3 w-3 mx-0.5" /> ao lado do switch para ver e controlar funcionalidades individuais.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// COMPONENTE: Backup do Banco de Dados
// ============================================================
function BackupTab() {
  const [executando, setExecutando] = useState(false);
  const [horarioEdit, setHorarioEdit] = useState("");
  const [ativoEdit, setAtivoEdit] = useState(true);

  const backupsQuery = trpc.backup.listar.useQuery({ limit: 20 }, {
    // Enquanto houver backup "em_andamento", atualiza a cada 3s para o % avançar ao vivo.
    refetchInterval: (q: any) => {
      const d = q?.state?.data;
      return Array.isArray(d) && d.some((b: any) => b.status === "em_andamento") ? 3000 : false;
    },
  });
  const configQuery = (trpc as any).backup.obterConfig.useQuery();
  const [configInit, setConfigInit] = useState(false);

  const healthQuery = (trpc as any).backup.health.useQuery(undefined, { refetchOnWindowFocus: false });
  const githubQuery = (trpc as any).backup.githubStatus.useQuery(undefined, { refetchOnWindowFocus: false });
  const [enviandoSnapshot, setEnviandoSnapshot] = useState(false);
  const pushSnapshotMut = (trpc as any).backup.pushCodeSnapshot.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Cópia do código enviada ao GitHub (${data.shortSha}) — ${formatBytes(data.tamanhoBytes)}`);
      setEnviandoSnapshot(false);
      githubQuery.refetch();
    },
    onError: (err: any) => {
      toast.error("Erro ao enviar código: " + err.message);
      setEnviandoSnapshot(false);
    },
  });

  useEffect(() => {
    const d = configQuery.data as any;
    if (d && !configInit) {
      setHorarioEdit(d.horario || "00:00");
      setAtivoEdit(d.ativo !== false);
      setConfigInit(true);
    }
  }, [configQuery.data, configInit]);

  const salvarConfigMut = (trpc as any).backup.salvarConfig.useMutation({
    onSuccess: () => {
      toast.success("Horário do backup atualizado!");
      configQuery.refetch();
    },
    onError: (err: any) => toast.error("Erro: " + err.message),
  });

  const executarMutation = trpc.backup.executar.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Backup concluído! ${data.tabelasExportadas} tabelas, ${data.registrosExportados.toLocaleString("pt-BR")} registros`);
      } else {
        toast.error(`Erro no backup: ${data.erro}`);
      }
      setExecutando(false);
      backupsQuery.refetch();
    },
    onError: (err: any) => {
      toast.error("Erro: " + err.message);
      setExecutando(false);
    },
  });

  const handleExecutar = () => {
    setExecutando(true);
    executarMutation.mutate();
  };

  const handleSalvarConfig = () => {
    const match = horarioEdit.match(/^(\d{2}):(\d{2})$/);
    if (!match) { toast.error("Formato inválido. Use HH:MM"); return; }
    const h = parseInt(match[1]), m = parseInt(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) { toast.error("Horário inválido"); return; }
    salvarConfigMut.mutate({ horario: horarioEdit, ativo: ativoEdit });
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const backups = backupsQuery.data || [];
  const configData = (configQuery.data || {}) as any;

  const fmtDateBr = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

  return (
    <div className="space-y-4">
      {/* Banner de saúde (backup + código) */}
      {(() => {
        const h = healthQuery.data as any;
        const g = githubQuery.data as any;
        if (healthQuery.isLoading || githubQuery.isLoading) return null;
        const problemas: string[] = [];
        if (h?.alerta) {
          if (h.motivo === "ultimo_falhou") problemas.push("O último backup do banco falhou.");
          else if (h.motivo === "sem_backup") problemas.push("Nenhum backup concluído foi encontrado.");
          else if (h.motivo === "stale") problemas.push(`Backup atrasado: último concluído há ~${h.idadeHoras}h (limite ${h.staleLimiteHoras}h).`);
          else if (h.motivo === "sem_db") problemas.push("Banco indisponível para verificar o backup.");
        }
        if (g?.alerta) {
          if (g.status === "github_atrasado") problemas.push(`O código em execução é mais novo que o salvo no GitHub (último commit no GitHub há ${g.diasDesdeGithub ?? "?"} dia(s)).`);
          else if (g.status === "erro") problemas.push(g.conectado === false ? "GitHub não conectado neste ambiente." : `Não foi possível verificar o GitHub${g.erro ? ": " + g.erro : "."}`);
        }
        if (problemas.length === 0) {
          return (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-3 flex items-center gap-2 text-sm text-green-800">
                <ShieldCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
                Tudo certo: backup de dados em dia e código sincronizado com o GitHub.
              </CardContent>
            </Card>
          );
        }
        return (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 mb-1">
                <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" /> Atenção necessária
              </div>
              <ul className="text-xs text-amber-700 space-y-1 ml-6 list-disc">
                {problemas.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </CardContent>
          </Card>
        );
      })()}

      {/* Cabeçalho */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                Backup do Banco de Dados
              </CardTitle>
              <CardDescription>
                Backup automático diário com descoberta dinâmica de tabelas. Exporta 100% do banco em JSON comprimido com cópia redundante no Neon.
              </CardDescription>
            </div>
            <Button
              onClick={handleExecutar}
              disabled={executando}
              className="gap-1.5"
            >
              {executando ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Executando...</>
              ) : (
                <><Download className="w-4 h-4" /> Backup Manual</>
              )}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Configuração de Horário */}
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-800 text-sm">Horário do Backup Automático</p>
                <p className="text-xs text-green-600">
                  Horário de Brasília. Atual: <strong>{configData?.horario || "00:00"}</strong>
                  {configData?.ativo === false && <span className="text-red-600 ml-2 font-bold">(DESATIVADO)</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-green-700">
                <input
                  type="checkbox"
                  checked={ativoEdit}
                  onChange={e => setAtivoEdit(e.target.checked)}
                  className="rounded border-green-300"
                />
                Ativo
              </label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={horarioEdit}
                onChange={e => {
                  let v = e.target.value.replace(/[^\d:]/g, "");
                  if (v.length === 2 && !v.includes(":") && horarioEdit.length < v.length) v += ":";
                  setHorarioEdit(v.slice(0, 5));
                }}
                placeholder="HH:MM"
                className="w-20 text-center text-sm h-8"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleSalvarConfig}
                disabled={salvarConfigMut.isPending}
                className="h-8 border-green-300 text-green-700 hover:bg-green-100"
              >
                Salvar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info automático */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Proteção de Dados</p>
              <ul className="space-y-1 text-xs text-blue-700">
                <li>• Descobre automaticamente <strong>todas as tabelas</strong> do banco (novas tabelas entram no backup sem configuração).</li>
                <li>• Cópia 1: armazenada no <strong>S3</strong> (storage externo).</li>
                <li>• Cópia 2: armazenada no próprio <strong>Neon</strong> (últimos 7 backups retidos).</li>
                <li>• Arquivos e fotos (tabela uploaded_files) são inventariados no backup.</li>
                <li>• Notificações por e-mail e plataforma após cada backup.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sincronização de Código com o GitHub */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-gray-700" />
                Sincronização de Código (GitHub)
              </CardTitle>
              <CardDescription>
                Compara o código do ERP em execução com o que está salvo no GitHub e permite enviar uma cópia de segurança do código.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => githubQuery.refetch()}
              disabled={githubQuery.isFetching}
              className="gap-1.5 h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${githubQuery.isFetching ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {githubQuery.isLoading ? (
            <div className="text-center py-4 text-muted-foreground text-sm">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1" /> Verificando GitHub...
            </div>
          ) : (() => {
            const g = githubQuery.data as any;
            if (!g) return <p className="text-sm text-muted-foreground">Não foi possível carregar o status.</p>;
            const cfgMap: Record<string, { label: string; cls: string; icon: any }> = {
              em_dia: { label: "Em dia", cls: "bg-green-100 text-green-700", icon: <Check className="w-3.5 h-3.5" /> },
              github_atrasado: { label: "GitHub desatualizado", cls: "bg-amber-100 text-amber-700", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
              deploy_pendente: { label: "Deploy pendente", cls: "bg-blue-100 text-blue-700", icon: <Info className="w-3.5 h-3.5" /> },
              divergente: { label: "Divergente", cls: "bg-amber-100 text-amber-700", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
              erro: { label: g.conectado === false ? "GitHub não conectado" : "Erro ao verificar", cls: "bg-red-100 text-red-700", icon: <X className="w-3.5 h-3.5" /> },
              desconhecido: { label: "Desconhecido", cls: "bg-gray-100 text-gray-700", icon: <Info className="w-3.5 h-3.5" /> },
            };
            const cfg = cfgMap[g.status] || cfgMap.desconhecido;
            return (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${cfg.cls}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <a href={`https://github.com/${g.repo}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> {g.repo}
                  </a>
                </div>
                {g.status === "github_atrasado" && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    O código mais recente do ERP <strong>ainda não está no GitHub</strong>. Verifique a sincronização automática do Replit (painel Git) ou use o botão abaixo para enviar uma cópia manual.
                  </div>
                )}
                {g.status === "erro" && g.erro && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{g.erro}</div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="border rounded p-3">
                    <p className="text-xs text-muted-foreground mb-1">ERP em execução</p>
                    <p className="font-mono text-gray-900">{g.running?.shortSha || "—"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{fmtDateBr(g.running?.date)}</p>
                    {g.running?.message && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{g.running.message}</p>}
                  </div>
                  <div className="border rounded p-3">
                    <p className="text-xs text-muted-foreground mb-1">Último no GitHub (main)</p>
                    <p className="font-mono text-gray-900">{g.github?.shortSha || "—"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {fmtDateBr(g.github?.date)}{g.diasDesdeGithub != null && ` · há ${g.diasDesdeGithub} dia(s)`}
                    </p>
                    {g.github?.message && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{g.github.message}</p>}
                  </div>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                  <p className="text-xs text-muted-foreground">
                    {g.ultimoSnapshot?.date
                      ? <>Última cópia de segurança do código enviada em <strong>{fmtDateBr(g.ultimoSnapshot.date)}</strong>.</>
                      : "Nenhuma cópia de segurança do código enviada ainda."}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => { setEnviandoSnapshot(true); pushSnapshotMut.mutate(); }}
                    disabled={enviandoSnapshot || g.conectado === false}
                    className="gap-1.5 h-8"
                  >
                    {enviandoSnapshot
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                      : <><Upload className="w-4 h-4" /> Enviar cópia do código agora</>}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  A cópia de segurança envia um .zip do código-fonte para a branch <code>erp-code-snapshots</code> no GitHub. Funciona a partir do ambiente de desenvolvimento (onde o código-fonte completo está disponível).
                </p>
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-gray-600" />
            Histórico de Backups
          </CardTitle>
        </CardHeader>
        <CardContent>
          {backupsQuery.isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Carregando...
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8">
              <Database className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Nenhum backup encontrado</p>
              <p className="text-xs text-gray-400 mt-1">Execute o primeiro backup manual ou aguarde o backup automático.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/50">
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Data</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Tipo</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Iniciado por</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Tabelas</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Registros</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Tamanho</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Status</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-600">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {backups.map((b: any) => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-900">
                        {b.iniciadoEm ? new Date(b.iniciadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          b.tipo === "automatico" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                        }`}>
                          {b.tipo === "automatico" ? "Automático" : "Manual"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{b.iniciadoPor || "—"}</td>
                      <td className="px-3 py-2 text-center font-mono">{b.tabelasExportadas ?? "—"}</td>
                      <td className="px-3 py-2 text-center font-mono">{b.registrosExportados?.toLocaleString("pt-BR") ?? "—"}</td>
                      <td className="px-3 py-2 text-center font-mono">{b.tamanhoBytes ? formatBytes(b.tamanhoBytes) : "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {(() => {
                          const total = b.tabelasTotal ?? 0;
                          const feitas = b.tabelasExportadas ?? 0;
                          const pct = b.status === "concluido"
                            ? 100
                            : b.status === "em_andamento"
                              ? (total > 0 ? Math.min(100, Math.round((feitas / total) * 100)) : 0)
                              : (total > 0 ? Math.min(100, Math.round((feitas / total) * 100)) : 0);
                          return (
                            <div className="flex flex-col items-center gap-1">
                              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                                b.status === "concluido" ? "bg-green-100 text-green-700" :
                                b.status === "em_andamento" ? "bg-yellow-100 text-yellow-700" :
                                "bg-red-100 text-red-700"
                              }`}>
                                {b.status === "concluido" ? <><Check className="w-3 h-3" /> Concluído 100%</> :
                                 b.status === "em_andamento" ? <><Loader2 className="w-3 h-3 animate-spin" /> Em andamento {pct}%</> :
                                 <><X className="w-3 h-3" /> Erro {pct}%</>}
                              </span>
                              {b.status !== "concluido" && (
                                <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden" title={`${feitas}/${total} tabelas`}>
                                  <div
                                    className={`h-full rounded-full transition-all ${b.status === "em_andamento" ? "bg-yellow-500" : "bg-red-400"}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {b.s3Url && b.status === "concluido" && (
                          <a
                            href={b.s3Url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium inline-flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" /> Baixar
                          </a>
                        )}
                        {b.status === "erro" && b.erro && (
                          <span className="text-xs text-red-500 truncate max-w-[150px] inline-block" title={b.erro}>
                            {b.erro.slice(0, 40)}...
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Card de Migração */}
      <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <HardDrive className="w-5 h-5 text-purple-600" />
              <div>
                <p className="font-semibold text-purple-800 dark:text-purple-200">Migração Completa</p>
                <p className="text-sm text-purple-600 dark:text-purple-400">
                  Exporte ou importe todos os dados + documentos para migrar o ERP para outra plataforma
                </p>
              </div>
            </div>
            <Button variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-100" onClick={() => window.location.href = '/migracao'}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Abrir Migração
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ RECONTRATAÇÃO · Suplentes de Aprovação ============
// O sócio (Admin Master) é SEMPRE aprovador titular. Aqui ele indica usuários
// suplentes autorizados a liberar/recusar recontratações na sua ausência.
function RecontratacaoAprovadoresSection({ companyId, isMaster }: { companyId: number; isMaster: boolean }) {
  const utils = trpc.useUtils();
  const suplentesQuery = trpc.recontratacao.getSuplentes.useQuery({ companyId }, { enabled: companyId > 0 });
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (suplentesQuery.data) setSelecionados(suplentesQuery.data.suplenteIds || []);
  }, [suplentesQuery.data]);

  const salvarMut = trpc.recontratacao.setSuplentes.useMutation({
    onSuccess: () => { toast.success("Suplentes atualizados com sucesso!"); utils.recontratacao.getSuplentes.invalidate(); },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const usuarios = (suplentesQuery.data?.usuarios || []) as any[];
  // Os demais sócios (Admin Master) são SEMPRE aprovadores titulares — aparecem
  // numa lista só-leitura no topo (não precisam ser selecionados como suplentes).
  const titulares = useMemo(
    () => usuarios.filter((u: any) => u.role === "admin_master"),
    [usuarios],
  );
  const usuariosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = usuarios.filter((u: any) => u.role !== "admin_master");
    if (!q) return base;
    return base.filter((u: any) => `${u.name || ""} ${u.email || ""} ${u.username || ""}`.toLowerCase().includes(q));
  }, [usuarios, busca]);

  const toggle = (id: number) => setSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const dirty = useMemo(() => {
    const a = [...(suplentesQuery.data?.suplenteIds || [])].sort().join(",");
    const b = [...selecionados].sort().join(",");
    return a !== b;
  }, [suplentesQuery.data, selecionados]);

  return (
    <Card className="border-lime-200 mt-4">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2 text-lime-700">
          <UserCheck className="w-5 h-5" />
          Recontratação · Suplentes de Aprovação
        </CardTitle>
        <CardDescription>
          Os sócios (Admin Master) são sempre aprovadores titulares das recontratações e podem liberar ou recusar
          a qualquer momento — inclusive um na ausência do outro. Selecione abaixo os usuários autorizados a
          liberar ou recusar como suplentes. {isMaster ? "" : "Apenas o Admin Master pode alterar esta lista."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {suplentesQuery.isLoading ? (
          <div className="text-center py-6 text-gray-400">Carregando usuários...</div>
        ) : (
          <div className="space-y-3">
            {titulares.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-sm font-semibold text-amber-800">
                    Aprovadores titulares (sócios)
                  </span>
                </div>
                <p className="text-xs text-amber-700 mb-2.5 leading-relaxed">
                  Estes sócios podem liberar ou recusar recontratações a qualquer momento — inclusive um
                  na ausência do outro. São aprovadores automáticos e não precisam ser selecionados abaixo.
                </p>
                <div className="space-y-1.5">
                  {titulares.map((u: any) => (
                    <div key={u.id} className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold shrink-0">
                        TITULAR
                      </span>
                      <span className="text-sm font-medium truncate">
                        {u.name || u.username || `Usuário #${u.id}`}
                      </span>
                      <span className="text-xs text-gray-500 truncate">{u.email || u.username}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Input
              placeholder="Buscar usuário por nome, e-mail ou login..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-md"
            />
            <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
              {usuariosFiltrados.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400">Nenhum usuário encontrado.</div>
              ) : usuariosFiltrados.map((u: any) => {
                const checked = selecionados.includes(u.id);
                return (
                  <label key={u.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${checked ? "bg-lime-50" : "hover:bg-gray-50"} ${!isMaster ? "opacity-70 cursor-not-allowed" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!isMaster}
                      onChange={() => toggle(u.id)}
                      className="accent-lime-600 w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.name || u.username || `Usuário #${u.id}`}</div>
                      <div className="text-xs text-gray-500 truncate">{u.email || u.username} · {u.role}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-gray-500">{selecionados.length} suplente(s) selecionado(s)</span>
              <Button
                size="sm"
                onClick={() => salvarMut.mutate({ companyId, suplenteIds: selecionados })}
                disabled={!isMaster || !dirty || salvarMut.isPending}
                className={dirty && isMaster ? "bg-lime-600 hover:bg-lime-700" : ""}
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                {salvarMut.isPending ? "Salvando..." : "Salvar Suplentes"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
