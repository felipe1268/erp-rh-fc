import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { buildFcDocument } from "@/lib/fcDocumentTemplate";
import { renderTemplate } from "@shared/documentTemplates";
import { formatBRL, valorPorExtenso } from "@/lib/numeroExtenso";
import { Users, UsersRound, Plus, Search, Pencil, Trash2, Eye, Ban, GraduationCap, ShieldCheck, Shield, ShieldX, Scale, FileText, Building2, AlertTriangle, Upload, HardHat, Download, Printer, ArrowLeft, Hash, Lock, Camera, X as XIcon, Wrench, Star, Award, CalendarDays, UserCheck, UserX, Palmtree, HeartPulse, Clock, Save, ChevronsUpDown, Check, RefreshCw, Footprints, Shirt, Ruler } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import FullScreenDialog from "@/components/FullScreenDialog";
import { FuncaoCombobox } from "@/components/FuncaoCombobox";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { EMPLOYEE_STATUS, EMPLOYEE_STATUS_MANUAL } from "../../../shared/modules";
import { normalizeCidadeInput } from "../../../shared/normalizeCidade";
import { useCompany } from "@/contexts/CompanyContext";
import { formatCPF, formatRG, formatCEP, formatPIS, formatTelefone, formatTituloEleitor, formatMoedaInput, formatMoedaSemPrefixo, parseMoedaBR, formatMoeda } from "@/lib/formatters";
import { nowBrasilia } from "@/lib/dateUtils";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePermissions } from "@/contexts/PermissionsContext";
import { TimeCombobox, ENTRADA_OPTIONS, INTERVALO_OPTIONS, SAIDA_OPTIONS } from "@/components/TimeCombobox";
import FCSignSendDialog from "@/components/FCSignSendDialog";
import FCSignContratoExperienciaPanel from "@/components/FCSignContratoExperienciaPanel";

// Rev. 2855 — Listas prontas de tamanhos (EPI/uniforme) — usuário só seleciona
const TAMANHOS_CALCADO = ["33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48"];
const TAMANHOS_CAMISA = ["PP", "P", "M", "G", "GG", "XG", "XGG", "EXG"];
const TAMANHOS_CALCA = ["36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58"];

// Rev. 2856 — config das cartelas interativas de tamanho (EPI/Uniforme)
const EPI_CARDS = [
  {
    key: "tamanhoCalcado",
    label: "Calçado",
    sub: "Número do pé",
    emoji: "👟",
    Icon: Footprints,
    opts: TAMANHOS_CALCADO,
    ring: "border-sky-200 dark:border-sky-800",
    headBg: "bg-gradient-to-br from-sky-500 to-sky-700",
    softBg: "bg-sky-50/60 dark:bg-sky-950/20",
    accentText: "text-sky-700 dark:text-sky-300",
    chipOn: "bg-sky-600 border-sky-600 text-white shadow-md scale-105",
    chipOff: "bg-white dark:bg-zinc-900 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40 hover:border-sky-400",
  },
  {
    key: "tamanhoCamisa",
    label: "Camisa",
    sub: "Parte de cima",
    emoji: "👕",
    Icon: Shirt,
    opts: TAMANHOS_CAMISA,
    ring: "border-emerald-200 dark:border-emerald-800",
    headBg: "bg-gradient-to-br from-emerald-500 to-emerald-700",
    softBg: "bg-emerald-50/60 dark:bg-emerald-950/20",
    accentText: "text-emerald-700 dark:text-emerald-300",
    chipOn: "bg-emerald-600 border-emerald-600 text-white shadow-md scale-105",
    chipOff: "bg-white dark:bg-zinc-900 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:border-emerald-400",
  },
  {
    key: "tamanhoCalca",
    label: "Calça",
    sub: "Parte de baixo",
    emoji: "👖",
    Icon: Ruler,
    opts: TAMANHOS_CALCA,
    ring: "border-amber-200 dark:border-amber-800",
    headBg: "bg-gradient-to-br from-amber-500 to-amber-700",
    softBg: "bg-amber-50/60 dark:bg-amber-950/20",
    accentText: "text-amber-700 dark:text-amber-300",
    chipOn: "bg-amber-600 border-amber-600 text-white shadow-md scale-105",
    chipOff: "bg-white dark:bg-zinc-900 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 hover:border-amber-400",
  },
] as const;

const statusColors: Record<string, string> = {
  Ativo: "bg-green-400/10 text-green-400",
  Ferias: "bg-blue-400/10 text-blue-400",
  Afastado: "bg-yellow-400/10 text-yellow-400",
  Licenca: "bg-purple-400/10 text-purple-400",
  Aviso: "bg-yellow-500/15 text-yellow-700",
  Desligado: "bg-red-400/10 text-red-400",
  Recluso: "bg-gray-400/10 text-gray-400",
  ListaNegra: "bg-red-600/20 text-red-600",
};

const statusLabels: Record<string, string> = {
  Ativo: "Ativo", Ferias: "Férias", Afastado: "Afastado",
  Licenca: "Licença", Aviso: "Aviso Prévio", Desligado: "Desligado", Recluso: "Recluso",
  ListaNegra: "Blacklist",
};

function safeDisplay(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (value instanceof Date) return value.toLocaleDateString("pt-BR");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const DIAS_LABELS: Record<string, string> = {
  seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex", sab: "Sáb", dom: "Dom"
};

function formatJornada(val: unknown): string {
  if (!val) return "-";
  const s = String(val);
  try {
    const parsed = JSON.parse(s);
    if (typeof parsed === "object" && parsed !== null) {
      // Calcular total de horas semanais
      let totalMin = 0;
      const groups: { dias: string[]; entrada: string; intervalo: string; saida: string }[] = [];
      for (const d of ["seg","ter","qua","qui","sex","sab","dom"]) {
        if (!parsed[d]) continue;
        const { entrada, intervalo, saida } = parsed[d];
        if (entrada && saida) {
          const [eh, em2] = entrada.split(":").map(Number);
          const [sh, sm] = saida.split(":").map(Number);
          let mins = (sh * 60 + sm) - (eh * 60 + em2);
          if (intervalo) {
            const [ih, im] = intervalo.split(":").map(Number);
            mins -= (ih * 60 + im);
          }
          if (mins > 0) totalMin += mins;
        }
        const existing = groups.find(g => g.entrada === entrada && g.intervalo === intervalo && g.saida === saida);
        if (existing) {
          existing.dias.push(DIAS_LABELS[d] || d);
        } else {
          groups.push({ dias: [DIAS_LABELS[d] || d], entrada, intervalo, saida });
        }
      }
      if (groups.length === 0) return "-";
      const totalH = Math.floor(totalMin / 60);
      const totalM = totalMin % 60;
      const totalStr = `${totalH}h${totalM > 0 ? String(totalM).padStart(2, '0') : ''}/sem`;
      const detail = groups.map(g => {
        const diasStr = g.dias.length > 2
          ? `${g.dias[0]} a ${g.dias[g.dias.length - 1]}`
          : g.dias.join(", ");
        const intLabel = g.intervalo === "00:30" ? "30min" : g.intervalo === "01:00" ? "1h" : g.intervalo === "01:30" ? "1h30" : g.intervalo === "02:00" ? "2h" : g.intervalo || "";
        return `${diasStr}: ${g.entrada}-${g.saida}${intLabel ? " (" + intLabel + ")" : ""}`;
      }).join(" | ");
      return `${totalStr} — ${detail}`;
    }
  } catch { /* not JSON */ }
  return s;
}

function calcIdadeAnos(dataNascimento: unknown): number | null {
  if (!dataNascimento || typeof dataNascimento !== "string") return null;
  const m = dataNascimento.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const ano = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  const dia = parseInt(m[3], 10);
  if (!ano || !mes || !dia) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - ano;
  const mesHoje = hoje.getMonth() + 1;
  const diaHoje = hoje.getDate();
  if (mesHoje < mes || (mesHoje === mes && diaHoje < dia)) idade -= 1;
  return idade >= 0 && idade < 130 ? idade : null;
}

function calcTempoEmpresaTexto(dataAdmissao: unknown, dataDesligamento?: unknown): string {
  if (!dataAdmissao || typeof dataAdmissao !== "string") return "";
  const m = dataAdmissao.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const inicio = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  let fim = new Date();
  if (dataDesligamento && typeof dataDesligamento === "string") {
    const md = dataDesligamento.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (md) fim = new Date(parseInt(md[1], 10), parseInt(md[2], 10) - 1, parseInt(md[3], 10));
  }
  if (fim < inicio) return "";
  let anos = fim.getFullYear() - inicio.getFullYear();
  let meses = fim.getMonth() - inicio.getMonth();
  if (fim.getDate() < inicio.getDate()) meses -= 1;
  if (meses < 0) { anos -= 1; meses += 12; }
  if (anos <= 0 && meses <= 0) {
    const diffDias = Math.floor((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDias <= 0) return "Hoje";
    return `${diffDias} dia${diffDias !== 1 ? "s" : ""}`;
  }
  if (anos <= 0) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
  if (meses <= 0) return `${anos} ano${anos !== 1 ? "s" : ""}`;
  return `${anos} ano${anos !== 1 ? "s" : ""} e ${meses} ${meses === 1 ? "mês" : "meses"}`;
}

// Há quanto tempo uma data ocorreu (ex.: "há 3 meses", "há 2 anos").
function tempoDesdeTexto(data: unknown): string {
  if (!data || typeof data !== "string") return "";
  const m = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const inicio = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const hoje = new Date();
  if (hoje < inicio) return "";
  let anos = hoje.getFullYear() - inicio.getFullYear();
  let meses = hoje.getMonth() - inicio.getMonth();
  if (hoje.getDate() < inicio.getDate()) meses -= 1;
  if (meses < 0) { anos -= 1; meses += 12; }
  if (anos <= 0 && meses <= 0) {
    const diffDias = Math.floor((hoje.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDias <= 0) return "hoje";
    if (diffDias === 1) return "ontem";
    return `há ${diffDias} dias`;
  }
  if (anos <= 0) return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  if (meses <= 0) return `há ${anos} ano${anos !== 1 ? "s" : ""}`;
  return `há ${anos} ano${anos !== 1 ? "s" : ""} e ${meses} ${meses === 1 ? "mês" : "meses"}`;
}

function formatDate(val: unknown): string {
  if (!val) return "-";
  if (val instanceof Date) return val.toLocaleDateString("pt-BR");
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s + "T12:00:00");
    return d.toLocaleDateString("pt-BR");
  }
  return s;
}

export default function Colaboradores() {
  const { selectedCompanyId, companies, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const { user } = useAuth();
  const isAdminMaster = user?.role === "admin_master";
  // Rev. 2206/2207 — Sigilo do status "Aviso Prévio".
  // Rev. 2206: hardcoded por regex no nome do grupo (RH/DP).
  // Rev. 2207: agora controlado por flag explícito `verStatusAviso` no
  // próprio grupo (configurável em /grupos-usuarios → Informações →
  // checkbox "Ver Status de Aviso Prévio"). Admin Master sempre vê.
  const { groupPermissions } = usePermissions();
  const canSeeAviso = isAdminMaster || (groupPermissions?.groups || []).some((g: any) => !!g?.verStatusAviso);
  // Helper centralizado pra usar nos badges/labels (substitui Aviso → Ativo).
  const maskedStatus = (s: string | null | undefined): string => (!canSeeAviso && s === 'Aviso') ? 'Ativo' : (s || '');
  const selectedCompany = selectedCompanyId;
  const [search, setSearch] = useState("");
  const [skillFilter, setSkillFilter] = useState<string>("all");
  const [gradeOpen, setGradeOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("status") || "Todos";
  });
  const [desligDe, setDesligDe] = useState("");
  const [desligAte, setDesligAte] = useState("");
  const [idadeFilter, setIdadeFilter] = useState<string>("Todas");
  const [funcaoFilter, setFuncaoFilter] = useState<string>("Todas");
  // Rev. 1725 — filtro por presença de foto (Todas / Com foto / Sem foto)
  const [fotoFilter, setFotoFilter] = useState<string>("Todas");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<any>(null);
  const [fotoExpandida, setFotoExpandida] = useState<string | null>(null);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [blacklistAlert, setBlacklistAlert] = useState<string | null>(null);
  const [cpfDuplicateAlert, setCpfDuplicateAlert] = useState<string | null>(null);
  const pendingFotoRef = useRef<{ base64: string; mimeType: string; fileName: string } | null>(null);
  const [desligamentoDialogOpen, setDesligamentoDialogOpen] = useState(false);
  const [previousStatus, setPreviousStatus] = useState<string>("");

  // === Recontratação (Rev. 2755) — staging com liberação do sócio ===
  const [recontratacaoMode, setRecontratacaoMode] = useState(false);
  const [recontratacaoVinculo, setRecontratacaoVinculo] = useState<any>(null);
  const [recontratacaoPickerOpen, setRecontratacaoPickerOpen] = useState(false);
  const [recontratacaoPickEmployeeId, setRecontratacaoPickEmployeeId] = useState<number | null>(null);
  const [blocosCopiados, setBlocosCopiados] = useState<string[]>([]);

  // === FCSign — assinatura digital interna (Rev. 2104) ===
  const [fcsignOpen, setFcsignOpen] = useState(false);
  const [fcsignPayload, setFcsignPayload] = useState<{
    companyId: number; employeeId: number; tipo: string; documentTitle: string;
    documentHtml: string; empregadoNome: string; empregadoCpf?: string;
  } | null>(null);
  // Rev. 2146 — Termo de Responsabilidade migrou pra Controle de Documentos
  // → aba "Termo de Recebimento". Estado/dialog removidos da ficha.

  // Seleção múltipla
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const companyId = selectedCompany && !isConstrutoras ? parseInt(selectedCompany) : undefined;
  const queryCompanyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (queryCompanyIds[0] ?? 0) : (companyId ?? 0);
  const hasValidSelection = isConstrutoras ? queryCompanyIds.length > 0 : !!companyId;
  const { data: obras } = trpc.obras.list.useQuery({ companyId: queryCompanyId }, { enabled: hasValidSelection });
  // Setores e Funções dinâmicos vinculados à empresa do formulário
  const formCompanyIdNum = form.companyId ? parseInt(form.companyId) : companyId;
  const { data: setoresList } = trpc.sectors.list.useQuery({ companyId: formCompanyIdNum ?? 0 }, { enabled: !!formCompanyIdNum });
  const { data: funcoesList } = trpc.jobFunctions.list.useQuery({ companyId: formCompanyIdNum ?? 0 }, { enabled: !!formCompanyIdNum });
  const { data: contasBancariasEmpresa } = trpc.folha.listarContasBancarias.useQuery({ companyId: formCompanyIdNum ?? 0 }, { enabled: !!formCompanyIdNum });
  const contasAtivas = (contasBancariasEmpresa || []).filter((c: any) => c.ativo !== 0);

  // Rev. 2747 — template VIGENTE do Contrato de Experiência (Central de Docs ISO).
  // Se aprovado/vigente, o corpo do contrato passa a sair deste template; senão,
  // cai no HTML hard-coded abaixo (fallback). Garante continuidade total.
  const contratoVigenteQ = trpc.systemDocumentTemplates.getVigente.useQuery({ tipo: "contrato_experiencia" });

  // Buscar critérios globais de HE da empresa
  const { data: criteriosHE } = trpc.criteria.getByCategory.useQuery(
    { companyId: companyId ?? 0, categoria: 'horas_extras' },
    { enabled: !!companyId }
  );
  const globalHE = useMemo(() => {
    const map = new Map<string, string>((criteriosHE || []).map((c: any) => [c.chave, c.valor]));
    return {
      heDiasUteis: map.get('he_dias_uteis') || '50',
      heDomingosFeriados: map.get('he_domingos_feriados') || '100',
      heAdicionalNoturno: map.get('he_adicional_noturno') || '20',
    };
  }, [criteriosHE]);

  // Import Excel
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);


  const utils = trpc.useUtils();
  const statsQ = trpc.employees.stats.useQuery(
    { companyId: queryCompanyId, companyIds: isConstrutoras ? queryCompanyIds : undefined },
    { enabled: hasValidSelection }
  );
  const serverStatus = statusFilter !== "Todos" && statusFilter !== "NaEmpresa" && statusFilter !== "CLT" && statusFilter !== "PJ" && statusFilter !== "Socio" && statusFilter !== "ListaNegra" ? statusFilter : undefined;
  const { data: employees, isLoading } = trpc.employees.list.useQuery(
    { companyId: queryCompanyId, companyIds: isConstrutoras ? queryCompanyIds : undefined, search: search || undefined, status: serverStatus },
    { enabled: hasValidSelection }
  );

  // Skill filter: get employee IDs that have the selected skill
  const skillFilterId = skillFilter !== "all" ? Number(skillFilter) : null;
  const employeesBySkillQ = trpc.skills.searchBySkill.useQuery(
    { companyId: queryCompanyId, companyIds: isConstrutoras ? queryCompanyIds : undefined, skillId: skillFilterId! },
    { enabled: !!skillFilterId && hasValidSelection }
  );
  const skillEmployeeIds = useMemo(() => {
    if (!skillFilterId) return null;
    return new Set((employeesBySkillQ.data ?? []).map((r: any) => r.employeeId));
  }, [skillFilterId, employeesBySkillQ.data]);

  // Lista de funções únicas derivada dos colaboradores carregados
  const funcaoOptions = useMemo(() => {
    const set = new Set<string>();
    (employees ?? []).forEach(e => { const f = (e as any).funcao; if (f) set.add(f); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [employees]);

  // Rev. 2854 — Grade de Tamanhos (EPI): agrega calçado/camisa/calça dos
  // colaboradores ATIVOS (exclui desligados/blacklist) para mapear compra e estoque.
  const gradeTamanhos = useMemo(() => {
    const ativos = (employees ?? []).filter((e: any) =>
      e.status !== "Desligado" && e.status !== "Lista_Negra" && e.status !== "Inativo"
      && e.listaNegra !== 1 && e.listaNegra !== true);
    const ordenar = (a: string, b: string) => {
      const na = parseFloat(a.replace(",", ".")); const nb = parseFloat(b.replace(",", "."));
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b, "pt-BR");
    };
    const contar = (campo: string) => {
      const map = new Map<string, number>();
      let semInfo = 0;
      ativos.forEach((e: any) => {
        const raw = (e[campo] ?? "").toString().trim().toUpperCase();
        if (!raw) { semInfo++; return; }
        map.set(raw, (map.get(raw) || 0) + 1);
      });
      const itens = Array.from(map.entries()).map(([tamanho, qtd]) => ({ tamanho, qtd }))
        .sort((x, y) => ordenar(x.tamanho, y.tamanho));
      return { itens, semInfo };
    };
    const blank = (v: any) => !(v ?? "").toString().trim();
    const semInfoList = ativos
      .map((e: any) => ({
        emp: e,
        faltaCalcado: blank(e.tamanhoCalcado),
        faltaCamisa: blank(e.tamanhoCamisa),
        faltaCalca: blank(e.tamanhoCalca),
      }))
      .filter((x) => x.faltaCalcado || x.faltaCamisa || x.faltaCalca)
      .sort((a, b) => (a.emp.nomeCompleto || "").localeCompare(b.emp.nomeCompleto || "", "pt-BR"));
    return {
      total: ativos.length,
      calcado: contar("tamanhoCalcado"),
      camisa: contar("tamanhoCamisa"),
      calca: contar("tamanhoCalca"),
      semInfoList,
    };
  }, [employees]);

  // Apply skill filter to employees
  const displayEmployees = useMemo(() => {
    let list = employees ?? [];
    // Usuários não-master nunca veem colaboradores da lista negra
    if (!isAdminMaster) {
      list = list.filter(e => e.status !== "Lista_Negra" && (e as any).listaNegra !== 1 && (e as any).listaNegra !== true);
    }
    if (skillEmployeeIds) list = list.filter(e => skillEmployeeIds.has(e.id));
    const isInativo = (e: any) => e.status === "Desligado" || e.status === "Lista_Negra" || e.listaNegra === 1 || e.listaNegra === true;
    // "Na Empresa" = todos que ainda têm vínculo (exclui desligados e blacklist)
    if (statusFilter === "NaEmpresa") list = list.filter(e => !isInativo(e));
    if (statusFilter === "CLT") list = list.filter(e => (e as any).tipoContrato === "CLT" && !isInativo(e));
    if (statusFilter === "PJ") list = list.filter(e => (e as any).tipoContrato === "PJ" && !isInativo(e));
    if (statusFilter === "Socio") list = list.filter(e => (e as any).tipoContrato === "Socio" && !isInativo(e));
    if (statusFilter === "ListaNegra") list = list.filter(e => (e as any).listaNegra === 1 || (e as any).listaNegra === true);
    // Filtro "Desligado" mostra apenas desligamentos normais — exclui quem está na lista negra
    if (statusFilter === "Desligado") {
      list = list.filter(e => e.status !== "Lista_Negra" && (e as any).listaNegra !== 1 && (e as any).listaNegra !== true);
    }
    if (statusFilter === "Desligado" && (desligDe || desligAte)) {
      list = list.filter(e => {
        const d = (e as any).dataDesligamentoEfetiva;
        if (!d) return false;
        if (desligDe && d < desligDe) return false;
        if (desligAte && d > desligAte) return false;
        return true;
      });
    }
    if (idadeFilter && idadeFilter !== "Todas") {
      list = list.filter(e => {
        const idade = calcIdadeAnos((e as any).dataNascimento);
        if (idade === null) return idadeFilter === "Sem data";
        if (idadeFilter === "Sem data") return false;
        if (idadeFilter === "60+") return idade >= 60;
        const m = idadeFilter.match(/^(\d+)-(\d+)$/);
        if (!m) return true;
        const min = parseInt(m[1], 10);
        const max = parseInt(m[2], 10);
        return idade >= min && idade <= max;
      });
    }
    if (funcaoFilter && funcaoFilter !== "Todas") {
      list = list.filter(e => (e as any).funcao === funcaoFilter);
    }
    // Rev. 1725 — filtro por foto: considera "sem foto" quando fotoUrl
    // está vazio/null/data-URL incompleto (mesma checagem usada no render).
    if (fotoFilter === "ComFoto") {
      list = list.filter(e => !!(e as any).fotoUrl && String((e as any).fotoUrl).trim() !== "");
    } else if (fotoFilter === "SemFoto") {
      list = list.filter(e => !((e as any).fotoUrl && String((e as any).fotoUrl).trim() !== ""));
    }
    return list;
  }, [employees, skillEmployeeIds, statusFilter, desligDe, desligAte, idadeFilter, funcaoFilter, fotoFilter]);

  const createMut = trpc.employees.create.useMutation({
    onSuccess: (result: any) => {
      const newId = result?.id;
      if (newId && pendingFotoRef.current && companyId) {
        const { base64, mimeType, fileName } = pendingFotoRef.current;
        pendingFotoRef.current = null;
        uploadFotoMut.mutate({ employeeId: newId, companyId, base64, mimeType, fileName });
      }
      utils.employees.list.invalidate();
      utils.employees.stats.invalidate();
      setDialogOpen(false);
      toast.success("Colaborador cadastrado!");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  // Recontratação — cria a SOLICITAÇÃO (staging); NÃO cria funcionário.
  const criarSolicitacaoMut = trpc.recontratacao.criarSolicitacao.useMutation({
    onSuccess: () => {
      utils.recontratacao.contarPendentes.invalidate();
      utils.recontratacao.listarSolicitacoes.invalidate();
      setDialogOpen(false);
      setRecontratacaoMode(false);
      setRecontratacaoVinculo(null);
      toast.success("Solicitação de recontratação enviada para liberação do sócio.");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const updateMut = trpc.employees.update.useMutation({
    onSuccess: () => { utils.employees.list.invalidate(); utils.employees.stats.invalidate(); utils.obras.efetivoPorObra.invalidate(); utils.obras.semObra.invalidate(); setDialogOpen(false); toast.success("Colaborador atualizado!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  // Rev. 2113: salvamento parcial dos dados do Contrato de Experiência (NÃO fecha o modal)
  const updateExperienciaMut = trpc.employees.update.useMutation({
    onSuccess: () => {
      utils.employees.list.invalidate();
      if (editingId) utils.employees.getById.invalidate();
      toast.success("Dados do Contrato de Experiência salvos!");
    },
    onError: (e) => toast.error("Erro ao salvar experiência: " + e.message),
  });
  // Rev. 2125 — alocação atômica do número NNN/AAAA do Contrato de Experiência.
  // Idempotente: se já alocado, retorna o existente; senão consome o counter.
  const allocateContratoExpMut = trpc.employees.allocateContratoExperienciaNumero.useMutation({
    onSuccess: () => { if (editingId) utils.employees.getById.invalidate(); },
    onError: (e) => toast.error("Erro ao alocar número do contrato: " + e.message),
  });
  const deleteMut = trpc.employees.delete.useMutation({
    onSuccess: () => { utils.employees.list.invalidate(); utils.employees.stats.invalidate(); utils.obras.efetivoPorObra.invalidate(); utils.obras.semObra.invalidate(); toast.success("Colaborador excluído!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const uploadFotoMut = trpc.employees.uploadFoto.useMutation({
    onSuccess: (data: any) => {
      utils.employees.list.invalidate();
      if (editingId) utils.employees.getById.invalidate();
      toast.success("Foto 3x4 atualizada!");
      set("fotoUrl", data.url);
    },
    onError: (e: any) => toast.error("Erro ao enviar foto: " + e.message),
  });
  const removeFotoMut = trpc.employees.removeFoto.useMutation({
    onSuccess: () => {
      utils.employees.list.invalidate();
      if (editingId) utils.employees.getById.invalidate();
      toast.success("Foto removida!");
      set("fotoUrl", "");
    },
    onError: (e: any) => toast.error("Erro ao remover foto: " + e.message),
  });

  // Rev. 1878 — Termo de Isenção de Controle de Jornada (Art. 62 CLT).
  // Rev. 2684 — Upload manual do termo removido: a assinatura é coletada
  // ONLINE via FCSign. Mantemos só o removedor p/ termos anexados antigamente.
  const removerTermoArt62Mut = trpc.employees.removerTermoArt62.useMutation({
    onSuccess: () => {
      utils.employees.list.invalidate();
      if (editingId) utils.employees.getById.invalidate();
      set("cargoConfiancaTermoUrl", "");
      set("cargoConfiancaTermoNomeArquivo", "");
      set("cargoConfiancaTermoAssinadoEm", "");
      toast.success("Termo removido.");
    },
    onError: (e: any) => toast.error("Erro ao remover termo: " + e.message),
  });
  // Rev. 2682 — valida pré-requisitos do Termo de Isenção (Art. 62 CLT) antes
  // de gerar/enviar p/ assinatura. Espelha o padrão do Contrato de Experiência.
  const validarTermoArt62 = (): string[] => {
    const faltando: string[] = [];
    const comp = companies?.find(c => String(c.id) === (form.companyId || selectedCompanyId || ""));
    if (!comp) faltando.push("Empresa do colaborador");
    if (!String(form.cargoConfiancaInciso || "").trim()) faltando.push("Inciso de enquadramento (I/II/III)");
    if (!String(form.nomeCompleto || "").trim()) faltando.push("Nome completo");
    if (!String(form.cpf || "").trim()) faltando.push("CPF");
    if (!String(form.funcao || "").trim()) faltando.push("Função/cargo");
    if (!String(form.salarioBase || "").trim()) faltando.push("Salário base");
    if (!String(form.cargoConfiancaDesde || "").trim()) faltando.push("Data de enquadramento (desde)");
    return faltando;
  };

  // Rev. 2682 — Gera o Termo de Isenção (Art. 62 CLT). Antes só gerava o HTML
  // p/ impressão (nova aba). Agora `buildTermoArt62` retorna a string HTML e
  // serve a DOIS consumidores:
  //  - forFcsign=false → janela de impressão/PDF (comportamento original).
  //  - forFcsign=true  → payload do FCSign (assinatura online), com placeholders
  //    `<!--FCSIGN:SIG:{role}-->` ACIMA das linhas de assinatura (o servidor
  //    estampa a <img> da assinatura ali via stampSignaturesOnSlots).
  // O texto se adapta ao inciso selecionado (I/II/III) — cada um tem fundamentação
  // legal diferente e o termo deve refletir isso para ter validade probatória.
  // IMPORTANTE: usa SOMENTE estilos inline no corpo (sem <style> com seletores
  // globais tipo body{}/.clausula{}) — a página /assinar renderiza via
  // dangerouslySetInnerHTML + DOMPurify (que PRESERVA <style>), então um <style>
  // global VAZARIA na UI da tela de assinatura. (REGRA DE OURO Rev. 2106+.)
  const buildTermoArt62 = (forFcsign: boolean): string | null => {
    const comp = companies?.find(c => String(c.id) === (form.companyId || selectedCompanyId || ""));
    const inciso = String(form.cargoConfiancaInciso || "").toUpperCase();
    if (!inciso) { toast.error("Selecione o inciso de enquadramento antes de gerar o termo."); return null; }
    // Escape HTML em TODOS os campos dinâmicos — nome/função/endereço/razão
    // social vêm de input livre e seriam vetores de XSS. Centralizado num helper local.
    const esc = (v: any) => String(v ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const empNome = esc(form.nomeCompleto || "________________________________");
    const empCpfRaw = form.cpf || "";
    const empCpf = esc(formatCPF(empCpfRaw) || "___.___.___-__");
    const empRg = esc(form.rg || "____________");
    const empCtps = esc(form.ctps || "____________");
    const empFuncao = esc(form.funcao || "________________");
    const empSalario = esc(form.salarioBase || "______");
    const empEnderecoRaw = form.endereco || form.logradouro || "";
    const empCidade = esc(form.cidade || "________");
    const empEstado = esc(form.estado || "__");
    const empEnderecoFmt = empEnderecoRaw
      ? `${esc(empEnderecoRaw)}, ${empCidade}/${empEstado}`
      : "________________________________";
    const grat = esc(form.cargoConfiancaGratificacao || "");
    const desde = form.cargoConfiancaDesde || "";
    const obs = form.cargoConfiancaObservacao || "";
    const compRazao = esc(comp?.razaoSocial || "________________________________");
    const compRazaoOrEmpresa = esc(comp?.razaoSocial || "Empresa");
    const compCnpj = esc(comp?.cnpj || "___.___.___/____-__");
    const compCnpjPlain = esc(comp?.cnpj || "___");
    const compEndereco = esc(comp?.endereco || "________________");
    const compCidade = esc(comp?.cidade || "________");
    const compEstado = esc(comp?.estado || "__");
    const fmt = (d: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "___/___/______";
    const hoje = new Date().toLocaleDateString("pt-BR");
    const tituloInciso = inciso === "I"
      ? "Inciso I — Atividade Externa Incompatível com Fixação de Horário"
      : inciso === "II"
        ? "Inciso II — Cargo de Gestão / Confiança"
        : "Inciso III — Teletrabalho em Regime de Produção ou Tarefa";
    const fundamentoInciso = inciso === "I"
      ? "exerce atividade externa incompatível com a fixação de horário de trabalho, devendo tal condição estar anotada na Carteira de Trabalho e Previdência Social (CTPS) e no respectivo registro de empregados, nos termos do inciso I do Art. 62 da CLT"
      : inciso === "II"
        ? `ocupa cargo de gestão, equiparado a cargo de confiança (gerente/diretor), com poderes de mando e gestão, percebendo gratificação de função não inferior a 40% (quarenta por cento) sobre o salário efetivo do cargo, conforme parágrafo único do Art. 62 da CLT${grat ? ` (gratificação fixada em ${grat}%)` : ""}` // grat já escapado
        : "presta serviços em regime de teletrabalho por produção ou tarefa, sem controle de jornada, nos termos do inciso III do Art. 62 da CLT, incluído pela Lei nº 14.442/2022";

    // Slot de assinatura: 50px ACIMA da linha. No FCSign o servidor injeta a
    // <img> da assinatura no placeholder; na impressão fica espaço em branco
    // (assinatura manual). Mesmo markup em ambos os modos (comentário é inócuo).
    const slot = (role: string) =>
      `<div style="height:50px;display:flex;align-items:flex-end;justify-content:center;margin-bottom:-2px"><!--FCSIGN:SIG:${role}--></div>`;

    const inner = `<div style="font-family:'Times New Roman',serif;font-size:11.5pt;line-height:1.6;color:#000;max-width:21cm;margin:0 auto">
<h1 style="text-align:center;font-size:15pt;margin:0 0 4px;text-transform:uppercase">Termo de Ciência e Anuência</h1>
<h2 style="text-align:center;font-size:12pt;margin:0 0 24px;font-weight:normal;font-style:italic">Isenção de Controle de Jornada — Art. 62 da CLT — ${esc(tituloInciso)}</h2>
<div style="text-align:center;margin-bottom:20px;font-size:10pt;color:#333">${compRazaoOrEmpresa} — CNPJ: ${compCnpjPlain}</div>

<div style="margin-top:14px;text-align:justify">
<p><span style="font-weight:bold">EMPREGADOR:</span> ${compRazao}, inscrita no CNPJ sob nº ${compCnpj}, com sede em ${compEndereco}, ${compCidade}/${compEstado}, doravante denominada simplesmente <strong>EMPREGADOR</strong>.</p>
</div>

<div style="margin-top:14px;text-align:justify">
<p><span style="font-weight:bold">EMPREGADO(A):</span> ${empNome}, portador(a) do CPF nº ${empCpf}, RG nº ${empRg}, CTPS nº ${empCtps}, ocupante do cargo/função de <strong>${empFuncao}</strong>, residente em ${empEnderecoFmt}, doravante denominado(a) simplesmente <strong>EMPREGADO(A)</strong>.</p>
</div>

<p style="text-align:justify">As partes acima qualificadas, no exercício pleno de sua autonomia da vontade, declaram e ajustam o que se segue:</p>

<div style="margin-top:14px;text-align:justify">
<p style="font-weight:bold;text-transform:uppercase;margin-bottom:4px;font-size:11pt">Cláusula 1ª — Do Enquadramento Legal</p>
<p>O(A) EMPREGADO(A) declara estar ciente e de pleno acordo que, a partir de <strong>${esc(fmt(desde))}</strong>, ${esc(fundamentoInciso)}, razão pela qual <strong>NÃO está sujeito(a) ao controle de jornada de trabalho</strong> previsto no Capítulo II do Título II da CLT.</p>
</div>

<div style="margin-top:14px;text-align:justify">
<p style="font-weight:bold;text-transform:uppercase;margin-bottom:4px;font-size:11pt">Cláusula 2ª — Dos Efeitos da Isenção</p>
<p>Em decorrência do enquadramento descrito na cláusula anterior, o(a) EMPREGADO(A) declara estar ciente de que <strong>NÃO faz jus</strong>, durante a vigência da presente condição, às seguintes parcelas/garantias relacionadas à jornada:</p>
<p style="margin-left:1cm">a) horas extras (Art. 59 da CLT) e respectivos reflexos;<br>
b) banco de horas e compensações de jornada;<br>
c) adicional noturno padrão (Art. 73 da CLT) decorrente do mero cumprimento de horário noturno;<br>
d) indenização do intervalo intrajornada suprimido (Art. 71, §4º da CLT);<br>
e) registro/marcação de ponto eletrônico ou manual (Art. 74 da CLT), salvo por liberalidade do EMPREGADOR para fins meramente gerenciais.</p>
</div>

<div style="margin-top:14px;text-align:justify">
<p style="font-weight:bold;text-transform:uppercase;margin-bottom:4px;font-size:11pt">Cláusula 3ª — Da Remuneração</p>
<p>O(A) EMPREGADO(A) perceberá a remuneração mensal de <strong>R$ ${empSalario}</strong>${inciso === "II" && grat ? `, acrescida da gratificação de função de <strong>${grat}%</strong> do salário efetivo, em estrita observância ao parágrafo único do Art. 62 da CLT` : ""}.</p>
</div>

<div style="margin-top:14px;text-align:justify">
<p style="font-weight:bold;text-transform:uppercase;margin-bottom:4px;font-size:11pt">Cláusula 4ª — Da Reversibilidade</p>
<p>Cessada a condição que ensejou o enquadramento no Art. 62 da CLT (transferência para função distinta, perda dos poderes de gestão, retorno ao controle de horário, etc.), o(a) EMPREGADO(A) voltará automaticamente ao regime ordinário de controle de jornada, com todos os direitos correlatos, mediante simples comunicação por escrito do EMPREGADOR e respectiva anotação na CTPS, quando cabível.</p>
</div>

<div style="margin-top:14px;text-align:justify">
<p style="font-weight:bold;text-transform:uppercase;margin-bottom:4px;font-size:11pt">Cláusula 5ª — Da Boa-Fé e Ciência Plena</p>
<p>O(A) EMPREGADO(A) declara que <strong>leu, compreendeu e está de pleno acordo</strong> com os termos do presente instrumento, que lhe foi devidamente explicado, tendo ciência dos efeitos jurídicos da isenção do controle de jornada, ora pactuada de forma livre e consciente.</p>
</div>

${obs ? `<div style="border:1px solid #999;padding:10px;margin-top:12px;background:#f6f6f6;font-size:10pt"><strong>Observações / Justificativa do Enquadramento:</strong><br>${esc(obs).replace(/\n/g, "<br>")}</div>` : ""}

<p style="margin-top:18px;text-align:justify">E por estarem assim justos e acordados, firmam o presente <strong>Termo de Ciência e Anuência</strong> em 2 (duas) vias de igual teor e forma, na presença das testemunhas abaixo qualificadas.</p>

<p style="text-align:center;margin-top:24px">${compCidade}/${compEstado}, ${esc(hoje)}.</p>

<div style="margin-top:60px;display:flex;justify-content:space-between;gap:40px">
<div style="text-align:center;flex:1">${slot("empregador")}<div style="border-top:1px solid #000;padding-top:4px;font-size:10pt">${compRazao}<br><small>CNPJ: ${compCnpj}</small></div></div>
<div style="text-align:center;flex:1">${slot("empregado")}<div style="border-top:1px solid #000;padding-top:4px;font-size:10pt">${empNome}<br><small>CPF: ${empCpf}</small></div></div>
</div>

<div style="margin-top:30px;display:flex;justify-content:space-between;gap:40px">
<div style="text-align:center;flex:1">${slot("testemunha_1")}<div style="border-top:1px solid #000;padding-top:4px;font-size:10pt">Testemunha 1<br><small>Nome: _________________ CPF: _______________</small></div></div>
<div style="text-align:center;flex:1">${slot("testemunha_2")}<div style="border-top:1px solid #000;padding-top:4px;font-size:10pt">Testemunha 2<br><small>Nome: _________________ CPF: _______________</small></div></div>
</div>
</div>`;

    // Impressão: doc completo com <style> SÓ de @page/print (escopo é a janela
    // nova, não vaza). FCSign: doc com <body> (renderFinalHtml injeta o rodapé
    // de auditoria antes de </body>) e SEM <style> global.
    const printStyle = `<style>@page{size:A4;margin:2cm}body{padding:2cm;margin:0}@media print{body{padding:0}}</style>`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Termo de Isenção de Controle de Jornada - ${empNome}</title>${forFcsign ? "" : printStyle}</head><body>${inner}</body></html>`;
  };

  const imprimirTermoArt62 = () => {
    const html = buildTermoArt62(false);
    if (!html) return;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Popup bloqueado — libere e tente novamente."); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  // Rev. — Imprimir/PDF da lista de colaboradores ATIVOS sem dados de EPI
  // (tamanho de calçado/camisa/calça em branco), com foto e nome.
  const imprimirSemInfoEpi = () => {
    const lista = gradeTamanhos.semInfoList;
    if (!lista.length) { toast.error("Todos os colaboradores ativos já têm os tamanhos de EPI preenchidos."); return; }
    const w = window.open("", "_blank");
    if (!w) { toast.error("Popup bloqueado — libere e tente novamente."); return; }
    const comp = companies?.find((c) => String(c.id) === String(selectedCompany));
    const nomeEmpresa = (comp?.nomeFantasia || comp?.razaoSocial || "FC Engenharia").toUpperCase();
    const cnpjEmpresa = comp?.cnpj || "";
    const hoje = new Date().toLocaleDateString("pt-BR");
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escAttr = (s: any) => esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const safeImgUrl = (u: any) => {
      const s = String(u ?? "").trim();
      return /^(https?:|blob:|data:image\/)/i.test(s) ? s : "";
    };
    const rows = lista.map((x, i) => {
      const e: any = x.emp;
      const iniciais = `${(e.nomeCompleto || "").charAt(0)}${((e.nomeCompleto || "").split(" ").pop() || "").charAt(0)}`.toUpperCase();
      const fotoOk = safeImgUrl(e.fotoUrl);
      const fotoCell = fotoOk
        ? `<img class="foto" src="${escAttr(fotoOk)}" alt="" />`
        : `<div class="foto ph">${esc(iniciais)}</div>`;
      const faltam = [x.faltaCalcado && "Calçado", x.faltaCamisa && "Camisa", x.faltaCalca && "Calça"].filter(Boolean);
      const faltaTags = faltam.map((f) => `<span class="tag">${f}</span>`).join(" ");
      const sub = [e.funcao, e.obraAtualNome].filter(Boolean).map(esc).join(" • ");
      return `<tr>
        <td class="idx">${i + 1}</td>
        <td class="cod">${esc(e.codigoInterno || "—")}</td>
        <td class="nome-cell">${fotoCell}<div class="nome-wrap"><div class="nome">${esc(e.nomeCompleto || "—")}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div></td>
        <td class="falta">${faltaTags}</td>
      </tr>`;
    }).join("");
    const css = `@page{size:A4 portrait;margin:12mm 14mm 16mm 14mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1a1a1a}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    .logo-bar{background:#1B2A4A;padding:12px 18px;display:flex;align-items:center;gap:14px;border-radius:6px;margin-bottom:12px;print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .logo-bar img{height:46px;object-fit:contain}.logo-bar .t{color:#fff;flex:1}.logo-bar .t h1{font-size:15px;font-weight:bold;letter-spacing:1px}.logo-bar .t p{font-size:9px;opacity:.85;margin-top:2px}.logo-bar .r{color:#fff;text-align:right;font-size:9px;opacity:.9}
    .subtitle{font-size:11px;color:#374151;margin-bottom:10px}.subtitle b{color:#1B2A4A}
    table{width:100%;border-collapse:collapse}th{background:#e8edf4;color:#1B2A4A;font-weight:600;text-align:left;padding:6px 8px;border:1px solid #d1d9e6;font-size:10px;print-color-adjust:exact;-webkit-print-color-adjust:exact}td{padding:6px 8px;border:1px solid #e5e7eb;vertical-align:middle}tr{page-break-inside:avoid}tr:nth-child(even) td{background:#f9fafb}
    .idx{width:26px;text-align:center;color:#6b7280;font-size:10px}.cod{width:60px;font-family:monospace;font-weight:bold;color:#1B2A4A;font-size:10px}
    .nome-cell{display:flex;align-items:center;gap:10px}.foto{width:36px;height:36px;border-radius:50%;object-fit:cover;object-position:top;border:2px solid #c7d2fe;flex-shrink:0}.foto.ph{display:flex;align-items:center;justify-content:center;background:#dbeafe;color:#1e40af;font-weight:bold;font-size:11px}
    .nome{font-weight:600}.sub{font-size:9px;color:#6b7280;margin-top:1px}
    .falta{width:190px}.tag{display:inline-block;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;border-radius:4px;padding:1px 6px;font-size:9px;font-weight:600;margin:1px 2px 1px 0;print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .foot{margin-top:12px;font-size:9px;color:#9ca3af;text-align:right}`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Colaboradores sem dados de EPI</title><style>${css}</style></head><body>
      <div class="logo-bar"><img src="${window.location.origin}/logo-fc.jpg" alt="FC" /><div class="t"><h1>COLABORADORES SEM DADOS DE EPI</h1><p>${esc(nomeEmpresa)}${cnpjEmpresa ? " — CNPJ: " + esc(cnpjEmpresa) : ""}</p></div><div class="r"><p>Emitido em ${hoje}</p><p>${lista.length} colaborador(es)</p></div></div>
      <div class="subtitle">Lista de colaboradores <b>ativos</b> com tamanho de calçado, camisa e/ou calça <b>não informado</b>. Total: <b>${lista.length}</b> de ${gradeTamanhos.total} ativos.</div>
      <table><thead><tr><th class="idx">#</th><th>Cód.</th><th>Colaborador</th><th>Falta informar</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="foot">Gerado pelo ERP — ${esc(nomeEmpresa)}</div>
    </body></html>`;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  };

  const handleFotoUpload = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem válida."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo 5MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      if (editingId && companyId) {
        uploadFotoMut.mutate({ employeeId: editingId, companyId, base64, mimeType: file.type, fileName: file.name });
      } else {
        // Para novo funcionário, armazenar no ref (não mandar base64 para o banco)
        pendingFotoRef.current = { base64, mimeType: file.type, fileName: file.name };
        // Mostrar preview usando data URL apenas no form visual, mas não será enviada ao servidor
        set("fotoUrl", reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const deleteManyMut = trpc.batch.delete.useMutation({
    onSuccess: (data: any) => {
      utils.employees.list.invalidate();
      utils.employees.stats.invalidate();
      setSelectedIds(new Set());
      setDeleteConfirmOpen(false);
      toast.success(`${data.deleted} colaborador(es) excluído(s)!`);
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });
  const normalizarCidadesMut = trpc.employees.normalizarCidades.useMutation({
    onSuccess: (data: any) => {
      utils.employees.list.invalidate();
      toast.success(`Cidades normalizadas: ${data.corrigidos} corrigidas, ${data.ignorados} já estavam corretas.`);
    },
    onError: (e: any) => toast.error("Erro ao normalizar: " + e.message),
  });

  // Verificação de lista negra (desativado - módulo removido)
  const checkBlacklistMut = { data: null } as any;

  // Verificação de CPF duplicado
  const cpfClean = useMemo(() => (form.cpf ?? "").replace(/\D/g, ""), [form.cpf]);
  // Rev. 2756 — a detecção (duplicidade + recontratação) DEVE usar a EMPRESA do
  // FORMULÁRIO (o destino real do cadastro/save), não o company global do header.
  // Quando os dois divergem (header em outra empresa/grupo), as queries rodavam
  // contra a empresa errada → nenhum banner aparecia, mas o SAVE batia na empresa
  // do form e era bloqueado pelo servidor (beco sem saída). Fallback p/ o global.
  const formCompanyId = useMemo(() => {
    const n = parseInt(String(form.companyId || selectedCompany || ""), 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [form.companyId, selectedCompany]);
  const checkDuplicateCpf = trpc.employees.checkDuplicateCpf.useQuery(
    { cpf: cpfClean, companyId: formCompanyId ?? 0 },
    { enabled: cpfClean.length >= 11 && !!formCompanyId }
  );

  // Recontratação — detecta vínculos DESLIGADOS (mesma empresa/grupo) e sinais jurídicos.
  const verificarRecontratacao = trpc.recontratacao.verificarCpf.useQuery(
    { cpf: cpfClean, companyId: formCompanyId ?? 0, funcao: form.funcao || undefined },
    { enabled: cpfClean.length >= 11 && !editingId && !!formCompanyId }
  );
  const recontratacaoVinculos: any[] = (verificarRecontratacao.data as any)?.vinculos ?? [];
  const temVinculoDesligado = recontratacaoVinculos.length > 0;
  const ativoMesmaEmpresa = (verificarRecontratacao.data as any)?.ativoMesmaEmpresa ?? null;
  const solicitacaoPendente = (verificarRecontratacao.data as any)?.solicitacaoPendente ?? null;
  // Rev. 2757/2758 — veredito EXPLÍCITO da verificação de CPF ao terminar de digitar.
  // FONTE ÚNICA = recontratacao.verificarCpf (já devolve ativoMesmaEmpresa, vínculos
  // desligados e solicitação pendente). NÃO dependemos mais de checkDuplicateCpf resolver
  // (Rev. 2757 travava o spinner quando aquela query demorava/falhava). checkDuplicateCpf
  // continua só como reforço do bloqueio (duplicado ATIVO em coligada).
  const cpfCompleto = cpfClean.length >= 11;
  const podeVerificarCpf = cpfCompleto && !editingId && !!formCompanyId;
  const verificandoCpf = podeVerificarCpf && (verificarRecontratacao.isLoading || verificarRecontratacao.isFetching);
  // Veredito SEMPRE conclusivo após o loading: sucesso (data) OU erro da query.
  const cpfQueryConcluiu = podeVerificarCpf && !verificarRecontratacao.isFetching && !verificarRecontratacao.isLoading;
  const cpfVerificado = cpfQueryConcluiu && verificarRecontratacao.data !== undefined;
  const cpfErro = cpfQueryConcluiu && verificarRecontratacao.data === undefined && !!verificarRecontratacao.error;
  // Veredito mutuamente exclusivo: erro (falha na verificação) > ativo (já cadastrado)
  // > pendente (em recontratação) > desligado (oferecer recontratação) > novo (CPF livre).
  const cpfVeredito: "erro" | "ativo" | "pendente" | "desligado" | "novo" | null =
    recontratacaoMode || blacklistAlert ? null
    : cpfErro ? "erro"
    : !cpfVerificado ? null
    : (ativoMesmaEmpresa || cpfDuplicateAlert) ? "ativo"
    : solicitacaoPendente ? "pendente"
    : temVinculoDesligado ? "desligado"
    : "novo";
  const pickedVinculo = recontratacaoVinculos.find((v: any) => v.employeeId === recontratacaoPickEmployeeId)
    || (recontratacaoVinculos.length === 1 ? recontratacaoVinculos[0] : null);
  const dadosCopia = trpc.recontratacao.getDadosCopia.useQuery(
    { employeeId: pickedVinculo?.employeeId ?? 0, companyId: pickedVinculo?.companyId ?? 0 },
    { enabled: recontratacaoPickerOpen && !!pickedVinculo }
  );

  // Blocos copiáveis do vínculo anterior. NUNCA copiamos salário/função/cargo/setor/obra/código/status/datas.
  const BLOCOS_RECONTRATACAO = [
    { key: "pessoais", label: "Dados pessoais (com foto)", icon: UserCheck, fields: ["nomeCompleto", "dataNascimento", "sexo", "estadoCivil", "nacionalidade", "naturalidade", "nomeMae", "nomePai", "fotoUrl"] },
    { key: "documentos", label: "Documentos", icon: FileText, fields: ["rg", "orgaoEmissor", "ctps", "serieCtps", "pis", "tituloEleitor", "certificadoReservista", "cnh", "categoriaCnh", "validadeCnh"] },
    { key: "contato", label: "Contato", icon: HeartPulse, fields: ["celular", "email", "contatoEmergencia", "telefoneEmergencia", "parentescoEmergencia"] },
    { key: "endereco", label: "Endereço", icon: Building2, fields: ["cep", "logradouro", "numero", "complemento", "bairro", "cidade", "estado"] },
    { key: "bancarios", label: "Dados bancários / PIX", icon: ShieldCheck, fields: ["banco", "bancoNome", "agencia", "conta", "tipoConta", "tipoChavePix", "chavePix", "bancoPix"] },
    { key: "dependentes", label: "Dependentes IR", icon: UsersRound, fields: ["dependentesIR"] },
  ];

  const abrirPickerRecontratacao = () => {
    setBlocosCopiados(BLOCOS_RECONTRATACAO.map(b => b.key));
    setRecontratacaoPickEmployeeId(recontratacaoVinculos.length === 1 ? recontratacaoVinculos[0].employeeId : null);
    setRecontratacaoPickerOpen(true);
  };

  const aplicarRecontratacao = () => {
    const vinc = pickedVinculo;
    if (!vinc) { toast.error("Selecione o vínculo anterior."); return; }
    const dados = dadosCopia.data as any;
    // Rev. 2756 — preserva a EMPRESA do formulário (destino real do cadastro), não o
    // company global do header; senão a solicitação de recontratação sairia no CNPJ errado
    // quando header≠form (mesma divergência que ocultava o banner).
    const novo: Record<string, string> = { status: "Ativo", companyId: String(formCompanyId ?? companyId ?? ""), cpf: form.cpf ?? "" };
    if (dados) {
      for (const bloco of BLOCOS_RECONTRATACAO) {
        if (!blocosCopiados.includes(bloco.key)) continue;
        for (const f of bloco.fields) {
          const v = dados[f];
          if (v !== null && v !== undefined && typeof v !== "object") {
            novo[f] = /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).split("T")[0] : String(v);
          }
        }
      }
      if (!novo.cpf && dados.cpf) novo.cpf = String(dados.cpf);
    }
    setForm(novo);
    setRecontratacaoVinculo(vinc);
    setRecontratacaoMode(true);
    setRecontratacaoPickerOpen(false);
    toast.info("Modo recontratação ativo. Preencha salário/função/obra e envie para liberação do sócio.");
  };

  useEffect(() => {
    const d = checkBlacklistMut.data as any;
    if (d && d.status === "ListaNegra") {
      setBlacklistAlert(`⛔ ATENÇÃO: CPF encontrado na BLACKLIST! Funcionário "${d.nomeCompleto}" está proibido de ser contratado. Motivo: ${d.motivoListaNegra ?? "Não informado"}`);
    } else {
      setBlacklistAlert(null);
    }
  }, [checkBlacklistMut.data]);

  useEffect(() => {
    const duplicates = checkDuplicateCpf.data as any[];
    if (duplicates && duplicates.length > 0) {
      // Só BLOQUEIA se houver vínculo ATIVO (não-desligado). Desligados acionam
      // o fluxo de RECONTRATAÇÃO (banner próprio), não o bloqueio de duplicidade.
      const ativos = duplicates.filter((d: any) => d.status !== "Desligado" && d.status !== "Inativo");
      if (ativos.length > 0) {
        const msgs = ativos.map((d: any) => `"${d.nomeCompleto}" na empresa ${d.empresa} (Status: ${statusLabels[d.status] ?? d.status})`);
        setCpfDuplicateAlert(`CPF já cadastrado no grupo: ${msgs.join("; ")}`);
      } else {
        setCpfDuplicateAlert(null);
      }
    } else {
      setCpfDuplicateAlert(null);
    }
  }, [checkDuplicateCpf.data]);

  // Limpar seleção quando mudar empresa ou filtro
  useEffect(() => { setSelectedIds(new Set()); }, [selectedCompany, statusFilter, search]);

  const openNew = () => {
    setEditingId(null);
    setForm({ status: "Ativo", companyId: selectedCompany });
    setBlacklistAlert(null);
    setCpfDuplicateAlert(null);
    setRecontratacaoMode(false);
    setRecontratacaoVinculo(null);
    setRecontratacaoPickerOpen(false);
    pendingFotoRef.current = null;
    setDialogOpen(true);
  };

  const openEdit = (emp: any) => {
    setEditingId(emp.id);
    const f: Record<string, string> = {};
    const skipFields = ["createdAt", "updatedAt"];
    Object.entries(emp).forEach(([k, v]) => {
      if (v !== null && v !== undefined && !skipFields.includes(k)) {
        if (v instanceof Date) {
          f[k] = v.toISOString().split("T")[0];
        } else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
          f[k] = v.split("T")[0];
        } else if (typeof v !== "object") {
          f[k] = String(v);
        }
      }
    });
    if (!f.companyId && companyId) f.companyId = String(companyId);
    // Decompor jornadaTrabalho - suporta formato JSON dia a dia e formato legado
    if (f.jornadaTrabalho) {
      try {
        const parsed = JSON.parse(f.jornadaTrabalho);
        if (typeof parsed === "object" && !Array.isArray(parsed)) {
          // Formato JSON dia a dia: { seg: { entrada, intervalo, saida }, ... }
          const DIAS_KEYS = ["seg","ter","qua","qui","sex","sab","dom"];
          DIAS_KEYS.forEach(d => {
            if (parsed[d]) {
              f[`jornada_${d}_entrada`] = parsed[d].entrada || "";
              f[`jornada_${d}_intervalo`] = parsed[d].intervalo || "";
              f[`jornada_${d}_saida`] = parsed[d].saida || "";
            }
          });
        }
      } catch {
        // Formato legado: "08:00 - 12:00 - 17:00" - migrar para todos os dias
        const dashParts = f.jornadaTrabalho.split(" - ");
        if (dashParts.length === 3) {
          const DIAS_KEYS = ["seg","ter","qua","qui","sex","sab","dom"];
          DIAS_KEYS.forEach(d => {
            f[`jornada_${d}_entrada`] = dashParts[0];
            f[`jornada_${d}_intervalo`] = dashParts[1];
            f[`jornada_${d}_saida`] = dashParts[2];
          });
        }
      }
    }
    // Normalizar sexo antigo ("masculino"/"feminino" minúsculo) para "M"/"F"
    if (f.sexo) {
      const sexoMap: Record<string, string> = { masculino: "M", feminino: "F", m: "M", f: "F" };
      f.sexo = sexoMap[f.sexo.toLowerCase()] || f.sexo;
    }
    setForm(f);
    setCpfDuplicateAlert(null);
    setDialogOpen(true);
  };

  const openView = (emp: any) => {
    setViewingEmployee(emp);
    setViewDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.nomeCompleto || !form.cpf) {
      toast.error("Nome e CPF são obrigatórios.");
      return;
    }
    // Bloquear se CPF duplicado (exceto edição do mesmo)
    if (cpfDuplicateAlert && !editingId) {
      toast.error("Não é possível cadastrar: " + cpfDuplicateAlert);
      return;
    }
    const targetCompanyId = form.companyId ? parseInt(form.companyId) : companyId!;
    // Compor jornadaTrabalho como JSON dia a dia
    const DIAS_KEYS = ["seg","ter","qua","qui","sex","sab","dom"];
    const jornadaObj: Record<string, { entrada: string; intervalo: string; saida: string }> = {};
    DIAS_KEYS.forEach(d => {
      const entrada = form[`jornada_${d}_entrada`] || "";
      const intervalo = form[`jornada_${d}_intervalo`] || "";
      const saida = form[`jornada_${d}_saida`] || "";
      if (entrada || saida) {
        jornadaObj[d] = { entrada, intervalo, saida };
      }
    });
    const jornadaStr = Object.keys(jornadaObj).length > 0 ? JSON.stringify(jornadaObj) : "";
    if (editingId) {
      const { companyId: _cid, id: _id, createdAt: _ca, updatedAt: _ua, empresa: _emp, ...rest } = form;
      // Remover campos temporários de jornada dia a dia do form
      const data: Record<string, any> = {};
      Object.entries(rest).forEach(([k, v]) => {
        if (!k.startsWith("jornada_") && !k.startsWith("_foto")) data[k] = v;
      });
      // Limpar valores "none" dos selects
      delete data.obraAtualId; // obraAtualId removido - alocação via obra_funcionarios
      // Nunca enviar data URL de foto para o servidor
      if (typeof data.fotoUrl === "string" && data.fotoUrl.startsWith("data:")) delete data.fotoUrl;
      Object.keys(data).forEach(k => { if ((data as any)[k] === "none") (data as any)[k] = ""; });
      (data as any).jornadaTrabalho = jornadaStr;
      updateMut.mutate({ id: editingId, companyId: targetCompanyId, data });
    } else {
      const { empresa: _emp, ...restCreate } = form;
      // Remover campos temporários de jornada dia a dia do form
      const createData: Record<string, any> = {};
      Object.entries(restCreate).forEach(([k, v]) => {
        if (!k.startsWith("jornada_") && !k.startsWith("_foto")) createData[k] = v;
      });
      delete (createData as any).obraAtualId; // obraAtualId removido - alocação via obra_funcionarios
      // Nunca enviar data URL de foto para o servidor — upload é feito após criar (via pendingFotoRef)
      if (typeof createData.fotoUrl === "string" && createData.fotoUrl.startsWith("data:")) delete createData.fotoUrl;
      Object.keys(createData).forEach(k => { if ((createData as any)[k] === "none") (createData as any)[k] = ""; });
      (createData as any).jornadaTrabalho = jornadaStr;
      if (recontratacaoMode) {
        // Staging: vira SOLICITAÇÃO; NÃO cria funcionário até a liberação do sócio.
        criarSolicitacaoMut.mutate({
          companyId: targetCompanyId,
          ficha: { ...createData, companyId: targetCompanyId },
          vinculoAnteriorEmployeeId: recontratacaoVinculo?.employeeId,
          vinculoAnteriorCompanyId: recontratacaoVinculo?.companyId,
          blocosCopiados,
        });
      } else {
        createMut.mutate({ ...createData, companyId: targetCompanyId } as any);
      }
    }
  };

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const getCompanyName = (cId: number) => {
    const c = companies?.find(c => c.id === cId);
    return c ? (c.nomeFantasia || c.razaoSocial) : "-";
  };

  // Seleção múltipla helpers
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (!displayEmployees || displayEmployees.length === 0) return;
    if (selectedIds.size === displayEmployees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayEmployees.map(e => e.id)));
    }
  };
  const isAllSelected = displayEmployees && displayEmployees.length > 0 && selectedIds.size === displayEmployees.length;
  const hasSelection = selectedIds.size > 0;

  const handleBulkDelete = () => {
    if (!companyId || selectedIds.size === 0) return;
    deleteManyMut.mutate({ table: "employees" as any, ids: Array.from(selectedIds) });
  };

  const handlePrintFicha = () => {
    if (!viewingEmployee) return;
    const empresa = getCompanyName(viewingEmployee.companyId);
    const dataEmissao = nowBrasilia();
    const nomeUsuario = user?.name || user?.username || "Usuário";

    const sections = [
      { title: "Dados Pessoais", fields: [
        ["CPF", formatCPF(viewingEmployee.cpf)],
        ["RG", formatRG(viewingEmployee.rg)],
        ["Nascimento", formatDate(viewingEmployee.dataNascimento)],
        ["Sexo", viewingEmployee.sexo === "M" ? "Masculino" : viewingEmployee.sexo === "F" ? "Feminino" : safeDisplay(viewingEmployee.sexo)],
        ["Estado Civil", safeDisplay(viewingEmployee.estadoCivil)],
        ["Nacionalidade", safeDisplay(viewingEmployee.nacionalidade)],
        ["Naturalidade", safeDisplay(viewingEmployee.naturalidade)],
        ["Celular", formatTelefone(viewingEmployee.celular)],
        ["E-mail", safeDisplay(viewingEmployee.email)],
        ["Nome da Mãe", safeDisplay(viewingEmployee.nomeMae)],
        ["Nome do Pai", safeDisplay(viewingEmployee.nomePai)],
        ["Contato Emergência", safeDisplay(viewingEmployee.contatoEmergencia)],
        ["Tel. Emergência", formatTelefone(viewingEmployee.telefoneEmergencia)],
        ["Parentesco", safeDisplay(viewingEmployee.parentescoEmergencia)],
      ]},
      { title: "Profissional", fields: [
        ["Cód. Interno (JFC)", viewingEmployee.codigoInterno ? `🔒 ${viewingEmployee.codigoInterno}` : "-"],
        ["eSocial", safeDisplay(viewingEmployee.matricula)],
         ["Função", safeDisplay(viewingEmployee.funcao)],
        ["Setor", safeDisplay(viewingEmployee.setor)],
        ["Admissão", formatDate(viewingEmployee.dataAdmissao)],
        ["Contrato", safeDisplay(viewingEmployee.tipoContrato)],
        ["Jornada", formatJornada(viewingEmployee.jornadaTrabalho)],
        ["Cód. Contábil", safeDisplay(viewingEmployee.codigoContabil)],
        ["Salário Base", viewingEmployee.salarioBase ? formatMoeda(viewingEmployee.salarioBase) : "-"],
        ["Valor da Hora", viewingEmployee.valorHora ? formatMoeda(viewingEmployee.valorHora) : "-"],
        ["Horas/Mês", safeDisplay(viewingEmployee.horasMensais)],
        ["Calçado (EPI)", safeDisplay((viewingEmployee as any).tamanhoCalcado)],
        ["Camisa (EPI)", safeDisplay((viewingEmployee as any).tamanhoCamisa)],
        ["Calça (EPI)", safeDisplay((viewingEmployee as any).tamanhoCalca)],
        ["Complemento Salarial", viewingEmployee.recebeComplemento ? `Sim — R$ ${viewingEmployee.valorComplemento || "0"}` : "Não"],
        ["Acordo HE", viewingEmployee.acordoHoraExtra ? `Sim — ${viewingEmployee.heNormal50 ?? globalHE.heDiasUteis}% / ${viewingEmployee.he100 ?? globalHE.heDomingosFeriados}% / ${viewingEmployee.heNoturna ?? globalHE.heAdicionalNoturno}%` : `Padrão Empresa (${globalHE.heDiasUteis}/${globalHE.heDomingosFeriados}/${globalHE.heAdicionalNoturno}%)`],
        ["Isenção Art. 62 CLT", viewingEmployee.cargoConfianca ? `Sim — Art. 62${(viewingEmployee as any).cargoConfiancaInciso ? `, ${(viewingEmployee as any).cargoConfiancaInciso}` : ' (inciso não informado)'} CLT${viewingEmployee.cargoConfiancaGratificacao ? ` (grat. ${viewingEmployee.cargoConfiancaGratificacao}%)` : ''}${(viewingEmployee as any).cargoConfiancaObservacao ? ` — ${(viewingEmployee as any).cargoConfiancaObservacao}` : ''}` : "Não"],
      ]},
      { title: "Documentos", fields: [
        ["CTPS", safeDisplay(viewingEmployee.ctps)],
        ["Série CTPS", safeDisplay(viewingEmployee.serieCtps)],
        ["PIS", formatPIS(viewingEmployee.pis)],
        ["Título Eleitor", formatTituloEleitor(viewingEmployee.tituloEleitor)],
        ["Reservista", safeDisplay(viewingEmployee.certificadoReservista)],
        ["CNH", safeDisplay(viewingEmployee.cnh)],
        ["Cat. CNH", safeDisplay(viewingEmployee.categoriaCnh)],
        ["Val. CNH", formatDate(viewingEmployee.validadeCnh)],
      ]},
      { title: "Endereço", fields: [
        ["Logradouro", safeDisplay(viewingEmployee.logradouro)],
        ["Nº", safeDisplay(viewingEmployee.numero)],
        ["Complemento", safeDisplay(viewingEmployee.complemento)],
        ["Bairro", safeDisplay(viewingEmployee.bairro)],
        ["Cidade/UF", `${viewingEmployee.cidade ?? ""}${viewingEmployee.estado ? " - " + viewingEmployee.estado : ""}` || "-"],
        ["CEP", formatCEP(viewingEmployee.cep)],
      ]},
      { title: "Dados Bancários", fields: [
        ["Banco", safeDisplay(viewingEmployee.banco)],
        ["Agência", safeDisplay(viewingEmployee.agencia)],
        ["Conta", safeDisplay(viewingEmployee.conta)],
        ["Tipo Conta", safeDisplay(viewingEmployee.tipoConta)],
        ["Tipo Chave PIX", safeDisplay(viewingEmployee.tipoChavePix)],
        ["Chave PIX", safeDisplay(viewingEmployee.chavePix)],
        ["Banco PIX", safeDisplay(viewingEmployee.bancoPix)],
      ]},
    ];

    let conteudo = `<div style="display:flex;align-items:center;gap:20px;padding-bottom:16px;border-bottom:3px solid #1B2A4A;margin-bottom:20px;">
      ${viewingEmployee.fotoUrl 
        ? `<img src="${viewingEmployee.fotoUrl}" alt="Foto" style="width:80px;height:80px;object-fit:cover;object-position:top;border-radius:50%;border:3px solid #1B2A4A;box-shadow:0 2px 8px rgba(0,0,0,0.15);" />`
        : `<div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#dbeafe,#e0e7ff);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#1B2A4A;border:3px solid #c5cdd8;box-shadow:0 2px 8px rgba(0,0,0,0.1);">${(viewingEmployee.nomeCompleto?.charAt(0) || "?") + (viewingEmployee.nomeCompleto?.split(' ').pop()?.charAt(0) || "")}</div>`
      }
      <div><h2 style="font-size:18px;font-weight:700;color:#1B2A4A;margin:0;">${safeDisplay(viewingEmployee.nomeCompleto)}</h2>
      <p style="font-size:12px;color:#666;margin:4px 0 0;">${safeDisplay(viewingEmployee.funcao)} · ${safeDisplay(viewingEmployee.setor)}</p>
      <span style="display:inline-block;background:${maskedStatus(viewingEmployee.status) === 'Ativo' ? '#dcfce7' : maskedStatus(viewingEmployee.status) === 'ListaNegra' ? '#fecaca' : '#fef3c7'};color:${maskedStatus(viewingEmployee.status) === 'Ativo' ? '#166534' : maskedStatus(viewingEmployee.status) === 'ListaNegra' ? '#991b1b' : '#92400e'};padding:2px 10px;border-radius:4px;font-size:10px;font-weight:600;margin-top:4px;">${statusLabels[maskedStatus(viewingEmployee.status)] ?? maskedStatus(viewingEmployee.status)}</span>
      <span style="font-size:11px;color:#888;margin-left:12px;">Empresa: ${empresa}</span></div></div>`;

    if (viewingEmployee.status === "ListaNegra") {
      conteudo += `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px 14px;margin-bottom:16px;">
        <strong style="color:#dc2626;">FUNCIONÁRIO NA BLACKLIST</strong>
        <p style="font-size:11px;color:#dc2626;margin:4px 0 0;">Este funcionário está proibido de ser contratado novamente.${viewingEmployee.motivoListaNegra ? " Motivo: " + viewingEmployee.motivoListaNegra : ""}</p></div>`;
    }

    sections.forEach(section => {
      const validFields = section.fields.filter(([, v]) => v && v !== "-");
      if (validFields.length === 0) return;
      conteudo += `<div style="margin-top:20px;"><h3 style="font-size:13px;font-weight:600;color:#1B2A4A;border-bottom:2px solid #e2e8f0;padding-bottom:6px;margin-bottom:10px;">${section.title}</h3>`;
      conteudo += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px 16px;">`;
      validFields.forEach(([label, value]) => {
        conteudo += `<div style="margin-bottom:4px;"><span style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#888;display:block;">${label}</span><span style="font-size:12px;font-weight:600;">${value}</span></div>`;
      });
      conteudo += `</div></div>`;
    });

    if (viewingEmployee.observacoes) {
      conteudo += `<div style="margin-top:20px;"><h3 style="font-size:13px;font-weight:600;color:#1B2A4A;border-bottom:2px solid #e2e8f0;padding-bottom:6px;margin-bottom:10px;">Observações</h3><p style="font-size:11px;background:#f8fafc;padding:8px 12px;border-radius:4px;">${safeDisplay(viewingEmployee.observacoes)}</p></div>`;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Popup bloqueado. Permita popups para imprimir.");
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ficha do Colaborador — ${safeDisplay(viewingEmployee.nomeCompleto)}</title><style>
      @media print { @page { margin: 15mm 12mm; size: A4 portrait; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 24px; }
      .header-bar { background: #1B2A4A; color: white; padding: 12px 20px; border-radius: 6px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
      .header-bar h1 { font-size: 16px; font-weight: 700; }
      .header-bar .sub { font-size: 10px; opacity: 0.8; }
      .footer { margin-top: 30px; border-top: 2px solid #e2e8f0; padding-top: 10px; font-size: 9px; color: #999; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px; }
      .footer .lgpd { font-style: italic; color: #b91c1c; }
    </style></head><body>
      <div class="header-bar"><div><h1>${empresa}</h1><div class="sub">Ficha do Colaborador</div></div><div class="sub">Emitido em: ${dataEmissao}</div></div>
      ${conteudo}
      <div class="footer">
        <span>ERP - Gestão Integrada</span>
        <span>Documento gerado por: <strong>${nomeUsuario}</strong> em ${dataEmissao}</span>
        <span class="lgpd">Este documento contém dados pessoais protegidos pela LGPD (Lei 13.709/2018). Uso restrito e confidencial.</span>
      </div>
    </body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Colaboradores</h1>
            <p className="text-muted-foreground text-sm mt-1">Cadastro e gestão de colaboradores</p>
          </div>
          <DraggableCommandBar barId="colaboradores" items={[
            { id: "print", node: <PrintActions title="Colaboradores" /> },
            { id: "importar", node: <Button variant="outline" onClick={() => setImportDialogOpen(true)} disabled={!hasValidSelection} className="gap-2"><Upload className="h-4 w-4" /> Importar Excel</Button> },
            { id: "gradeEpi", node: <Button variant="outline" onClick={() => setGradeOpen(true)} disabled={!hasValidSelection} className="gap-2 text-sky-700 border-sky-300 hover:bg-sky-50"><HardHat className="h-4 w-4" /> Grade de Tamanhos</Button> },
            ...(user?.role === "admin" || user?.role === "admin_master" ? [{ id: "normalizarCidades", node: <Button variant="outline" onClick={() => { if (confirm("Corrigir caixa e acentos de todas as cidades cadastradas? Esta ação atualiza o banco de dados.")) normalizarCidadesMut.mutate({ companyId: companyId!, companyIds: queryCompanyIds }); }} disabled={normalizarCidadesMut.isPending || !hasValidSelection} className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"><Wrench className="h-4 w-4" /> {normalizarCidadesMut.isPending ? "Corrigindo..." : "Padronizar Cidades"}</Button> }] : []),
            { id: "novo", node: <Button onClick={openNew} disabled={!hasValidSelection} className="gap-2"><Plus className="h-4 w-4" /> Novo</Button> },
          ]} />
        </div>

        {/* Barra de ações em massa */}
        {hasSelection ? (
          <div className="flex items-center gap-4 bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3">
            <span className="text-sm font-medium text-destructive">
              {selectedIds.size} colaborador(es) selecionado(s)
            </span>
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Excluir Selecionados
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Limpar Seleção
            </Button>
          </div>
        ) : null}

        {/* Rev. 2639 — fileira de filtros por status SEMPRE visível quando há empresa
            selecionada. Antes era gated por `statsQ.data` e sumia inteira durante o
            carregamento/refetch do stats (ex.: reload de HMR), levando o usuário a achar
            que os filtros foram removidos. Agora os contadores caem pra "—" enquanto o
            stats carrega, mas os botões de filtro continuam clicáveis. */}
        {hasValidSelection && (
          <div className="space-y-2 print:hidden">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-9 gap-2.5">
              {[
                { label: "Total", value: statsQ.data?.total ?? "—", icon: Users, color: "text-slate-700", bg: "bg-slate-50 border-slate-200", filter: "Todos" },
                { label: "Na Empresa", value: statsQ.data ? (statsQ.data.naEmpresa ?? (statsQ.data.total - statsQ.data.desligados - (statsQ.data.blacklist || 0))) : "—", icon: UsersRound, color: "text-teal-700", bg: "bg-teal-50 border-teal-200", filter: "NaEmpresa" },
                { label: "Ativos", value: statsQ.data?.ativos ?? "—", icon: UserCheck, color: "text-green-700", bg: "bg-green-50 border-green-200", filter: "Ativo" },
                { label: "CLT", value: statsQ.data?.clt ?? "—", icon: FileText, color: "text-sky-700", bg: "bg-sky-50 border-sky-200", filter: "CLT" },
                { label: "PJ", value: statsQ.data?.pj ?? "—", icon: Building2, color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200", filter: "PJ" },
                { label: "Férias", value: statsQ.data?.ferias ?? "—", icon: Palmtree, color: "text-blue-700", bg: "bg-blue-50 border-blue-200", filter: "Ferias" },
                { label: "Afastados", value: statsQ.data?.afastados ?? "—", icon: HeartPulse, color: "text-amber-700", bg: "bg-amber-50 border-amber-200", filter: "Afastado" },
                { label: "Licença", value: statsQ.data?.licenca ?? "—", icon: Clock, color: "text-purple-700", bg: "bg-purple-50 border-purple-200", filter: "Licenca" },
                ...(canSeeAviso ? [{ label: "Aviso", value: (statsQ.data as any)?.aviso ?? "—", icon: AlertTriangle, color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-300", filter: "Aviso" }] : []),
                { label: "Desligados", value: statsQ.data?.desligados ?? "—", icon: UserX, color: "text-red-700", bg: "bg-red-50 border-red-200", filter: "Desligado" },
                ...(isAdminMaster ? [{ label: "Blacklist", value: statsQ.data ? (statsQ.data.blacklist || 0) : "—", icon: ShieldX, color: "text-red-800", bg: "bg-red-100 border-red-300", filter: "ListaNegra" }] : []),
                { label: "Reclusos", value: statsQ.data?.reclusos ?? "—", icon: Ban, color: "text-gray-700", bg: "bg-gray-50 border-gray-200", filter: "Recluso" },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={() => item.filter && setStatusFilter(item.filter)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all text-left hover:shadow-sm ${item.bg} ${item.filter && statusFilter === item.filter ? 'ring-2 ring-primary ring-offset-1 shadow-sm' : ''} ${!item.filter ? 'cursor-default' : ''}`}
                >
                  <item.icon className={`h-4 w-4 ${item.color} shrink-0`} />
                  <div className="min-w-0">
                    <p className={`text-lg font-bold leading-none ${item.color}`}>{item.value}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">{item.label}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CPF, RG, função, setor, obra, tipo (CLT/PJ) ou Nº interno..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 bg-card border-border"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); if (v !== "Desligado") { setDesligDe(""); setDesligAte(""); } }}>
            <SelectTrigger className="w-full sm:w-40 bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos</SelectItem>
              <SelectItem value="NaEmpresa">Na Empresa</SelectItem>
              <SelectItem value="CLT">CLT</SelectItem>
              <SelectItem value="PJ">PJ</SelectItem>
              <SelectItem value="Socio">Sócio</SelectItem>
              {EMPLOYEE_STATUS.filter(s => canSeeAviso || s.value !== 'Aviso').map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
              {isAdminMaster && <SelectItem value="ListaNegra">Blacklist</SelectItem>}
            </SelectContent>
          </Select>
          <Select value={funcaoFilter} onValueChange={setFuncaoFilter}>
            <SelectTrigger className="w-full sm:w-48 bg-card border-border" title="Filtrar por função">
              <SelectValue placeholder="Todas as funções" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="Todas">Todas as funções</SelectItem>
              {funcaoOptions.map(f => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={idadeFilter} onValueChange={setIdadeFilter}>
            <SelectTrigger className="w-full sm:w-36 bg-card border-border" title="Filtrar por faixa de idade">
              <SelectValue placeholder="Idade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas">Todas as idades</SelectItem>
              <SelectItem value="18-30">18 a 30 anos</SelectItem>
              <SelectItem value="31-40">31 a 40 anos</SelectItem>
              <SelectItem value="41-50">41 a 50 anos</SelectItem>
              <SelectItem value="51-60">51 a 60 anos</SelectItem>
              <SelectItem value="60+">60 anos ou mais</SelectItem>
              <SelectItem value="Sem data">Sem data de nasc.</SelectItem>
            </SelectContent>
          </Select>
          {/* Rev. 1725 — filtro por foto (auxilia a localizar quem ainda não tem foto cadastrada) */}
          <Select value={fotoFilter} onValueChange={setFotoFilter}>
            <SelectTrigger className="w-full sm:w-36 bg-card border-border" title="Filtrar por foto">
              <SelectValue placeholder="Foto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas">Todas (foto)</SelectItem>
              <SelectItem value="ComFoto">Com foto</SelectItem>
              <SelectItem value="SemFoto">Sem foto</SelectItem>
            </SelectContent>
          </Select>
          <SkillFilterDropdown value={skillFilter} onChange={setSkillFilter} companyId={queryCompanyId} companyIds={isConstrutoras ? queryCompanyIds : undefined} />
        </div>
        {statusFilter === "Desligado" && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-lg bg-orange-50 border border-orange-200">
            <CalendarDays className="h-4 w-4 text-orange-600 flex-shrink-0" />
            <span className="text-sm font-medium text-orange-800">Período de desligamento:</span>
            <div className="flex items-center gap-2">
              <Input type="date" value={desligDe} onChange={e => setDesligDe(e.target.value)} className="h-8 w-40 text-sm bg-white border-orange-300" placeholder="De" />
              <span className="text-sm text-orange-600">até</span>
              <Input type="date" value={desligAte} onChange={e => setDesligAte(e.target.value)} className="h-8 w-40 text-sm bg-white border-orange-300" placeholder="Até" />
            </div>
            {(desligDe || desligAte) && (
              <Button variant="ghost" size="sm" onClick={() => { setDesligDe(""); setDesligAte(""); }} className="h-7 px-2 text-orange-600 hover:text-orange-800 hover:bg-orange-100">
                <XIcon className="h-3 w-3 mr-1" /> Limpar
              </Button>
            )}
            {(desligDe || desligAte) && displayEmployees.length > 0 && (
              <span className="text-xs text-orange-600 ml-auto">{displayEmployees.length} colaborador{displayEmployees.length !== 1 ? "es" : ""} no período</span>
            )}
          </div>
        )}

        {/* Table */}
        {!hasValidSelection ? (
          <Card className="bg-card border-border">
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground">Selecione uma empresa para visualizar os colaboradores.</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <Card className="bg-card border-border animate-pulse"><CardContent className="h-64" /></Card>
        ) : displayEmployees && displayEmployees.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/50">
                  <th className="text-left px-3 py-3 w-10">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Selecionar todos"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground w-24">Nº Interno</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground min-w-[180px] whitespace-nowrap">CPF</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground w-20">Tipo</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Função</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Setor</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell w-20">Idade</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell whitespace-nowrap">Tempo de Empresa</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {[...displayEmployees].sort((a, b) => (a.nomeCompleto || '').localeCompare(b.nomeCompleto || '', 'pt-BR')).map(emp => (
                  <tr key={emp.id} className={`border-t border-border hover:bg-secondary/30 transition-colors ${selectedIds.has(emp.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-3">
                      <Checkbox
                        checked={selectedIds.has(emp.id)}
                        onCheckedChange={() => toggleSelect(emp.id)}
                        aria-label={`Selecionar ${emp.nomeCompleto}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{emp.codigoInterno || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 cursor-pointer" onClick={() => setRaioXEmployeeId(emp.id)}>
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-blue-100 flex items-center justify-center shrink-0 border-2 border-blue-200">
                          {emp.fotoUrl ? (
                            <img src={emp.fotoUrl} alt="" className="w-full h-full object-cover object-top" />
                          ) : (
                            <span className="text-xs font-bold text-blue-700">{emp.nomeCompleto?.charAt(0)}{emp.nomeCompleto?.split(' ').pop()?.charAt(0)}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-blue-700 hover:underline truncate">{emp.nomeCompleto}</div>
                          {(() => {
                            const isSaiu = emp.status === "Desligado" || emp.status === "Lista_Negra" || (emp as any).listaNegra === 1 || (emp as any).listaNegra === true;
                            const idade = calcIdadeAnos((emp as any).dataNascimento);
                            const dataFim = isSaiu ? (emp as any).dataDesligamentoEfetiva : undefined;
                            const tempo = calcTempoEmpresaTexto((emp as any).dataAdmissao, dataFim);
                            const funcao = (emp as any).funcao;
                            const partes: string[] = [];
                            if (funcao) partes.push(String(funcao));
                            if (idade !== null) partes.push(`${idade} anos`);
                            if (tempo) partes.push(isSaiu ? `Trabalhou: ${tempo}` : `Empresa: ${tempo}`);
                            const linha1 = partes.length > 0
                              ? <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{partes.join(" • ")}</div>
                              : null;
                            const obraNome = (emp as any).obraAtualNome as string | null;
                            const linhaObra = !isSaiu && obraNome
                              ? (
                                <div className="mt-1 flex">
                                  <span className="inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-medium leading-none">
                                    <Building2 className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{obraNome}</span>
                                  </span>
                                </div>
                              )
                              : !isSaiu
                              ? (
                                <div className="mt-1 flex">
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-medium leading-none">
                                    <Building2 className="w-3 h-3" />
                                    Sem obra
                                  </span>
                                </div>
                              )
                              : null;
                            let linha2: ReactNode = null;
                            if (isSaiu && (emp as any).dataDesligamentoEfetiva) {
                              const dt = formatDate((emp as any).dataDesligamentoEfetiva);
                              const desde = tempoDesdeTexto((emp as any).dataDesligamentoEfetiva);
                              linha2 = (
                                <div className="text-[11px] text-red-600 mt-0.5 truncate">
                                  Saiu em {dt}{desde ? ` (${desde})` : ""}
                                </div>
                              );
                            }
                            return <>{linha1}{linhaObra}{linha2}</>;
                          })()}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground min-w-[180px] whitespace-nowrap font-mono text-sm">{formatCPF(emp.cpf)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${emp.tipoContrato === 'PJ' ? 'bg-purple-100 text-purple-700' : emp.tipoContrato === 'Temporario' ? 'bg-amber-100 text-amber-700' : emp.tipoContrato === 'Estagio' ? 'bg-cyan-100 text-cyan-700' : emp.tipoContrato === 'Aprendiz' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                        {emp.tipoContrato || 'CLT'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      <span>{emp.funcao ?? "-"}</span>
                      {emp.cargoConfianca ? <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-semibold rounded-full" title="Isento de controle de jornada — Art. 62 CLT">Art.62{(emp as any).cargoConfiancaInciso ? `, ${(emp as any).cargoConfiancaInciso}` : ''}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{emp.setor ?? "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {(() => {
                        const idade = calcIdadeAnos((emp as any).dataNascimento);
                        return idade !== null ? `${idade} anos` : "-";
                      })()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden xl:table-cell whitespace-nowrap">
                      {calcTempoEmpresaTexto((emp as any).dataAdmissao, (emp.status === "Desligado" || emp.status === "Lista_Negra" || (emp as any).listaNegra === 1) ? (emp as any).dataDesligamentoEfetiva : undefined) || "-"}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const isBlacklist = emp.status === "Lista_Negra" || (emp as any).listaNegra === 1 || (emp as any).listaNegra === true;
                        if (isBlacklist) {
                          return (
                            <div className="flex flex-col gap-0.5 items-start">
                              <span className={`text-xs font-medium px-2.5 py-1 rounded ${statusColors["Desligado"]}`}>
                                Desligado
                              </span>
                              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-300">
                                ⚑ Blacklist
                              </span>
                            </div>
                          );
                        }
                        // Rev. 2206 — mascara Aviso → Ativo p/ usuários sem clearance
                        const dispStatus = maskedStatus(emp.status);
                        return (
                          <span className={`text-xs font-medium px-2.5 py-1 rounded ${statusColors[dispStatus] ?? ""}`}>
                            {statusLabels[dispStatus] ?? dispStatus}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openView(emp)} title="Ver ficha"><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(emp)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Excluir" onClick={() => {
                          if (confirm("Excluir este colaborador?")) deleteMut.mutate({ id: emp.id, companyId: companyId! });
                        }}><Trash2 className="h-3.5 w-3.5" /></Button>
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
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum colaborador encontrado</h3>
              <p className="text-muted-foreground text-sm mb-4">
                {search ? "Tente outra busca." : skillFilter !== "all" ? "Nenhum colaborador com esta habilidade." : "Cadastre o primeiro colaborador."}
              </p>
              {!search ? <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Novo Colaborador</Button> : null}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ============================================================ */}
      {/* CONFIRMAÇÃO DE EXCLUSÃO EM MASSA */}
      {/* ============================================================ */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão em Massa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{selectedIds.size}</strong> colaborador(es)?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteManyMut.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============================================================ */}
      {/* Rev. 2854 — GRADE DE TAMANHOS (EPI) — mapeamento de compra */}
      {/* ============================================================ */}
      <Dialog open={gradeOpen} onOpenChange={setGradeOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HardHat className="h-5 w-5 text-sky-600" /> Grade de Tamanhos (EPI)</DialogTitle>
            <DialogDescription>
              Resumo dos tamanhos de calçado, camisa e calça dos {gradeTamanhos.total} colaborador(es) ativo(s) — use para mapear a compra de EPI/uniforme e garantir o estoque.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {([
              { titulo: "Calçado", dados: gradeTamanhos.calcado },
              { titulo: "Camisa", dados: gradeTamanhos.camisa },
              { titulo: "Calça", dados: gradeTamanhos.calca },
            ] as const).map(({ titulo, dados }) => (
              <div key={titulo} className="rounded-lg border border-border bg-card">
                <div className="px-3 py-2 border-b border-border bg-muted/50 text-sm font-bold text-primary">{titulo}</div>
                <div className="p-3">
                  {dados.itens.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhum tamanho informado.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground">
                          <th className="text-left font-medium pb-1">Tamanho</th>
                          <th className="text-right font-medium pb-1">Qtd</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dados.itens.map((it) => (
                          <tr key={it.tamanho} className="border-t border-border/50">
                            <td className="py-1 font-mono">{it.tamanho}</td>
                            <td className="py-1 text-right font-semibold">{it.qtd}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {dados.semInfo > 0 && (
                    <p className="text-[10px] text-amber-600 mt-2">{dados.semInfo} sem informação</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Lista de colaboradores ATIVOS sem dados de EPI (com foto e nome) */}
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/40">
            <div className="px-3 py-2 border-b border-amber-200 flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-amber-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Sem informação de EPI — {gradeTamanhos.semInfoList.length}
              </div>
              {gradeTamanhos.semInfoList.length > 0 && (
                <Button size="sm" variant="outline" onClick={imprimirSemInfoEpi} className="gap-1.5 h-8 text-amber-800 border-amber-300 hover:bg-amber-100">
                  <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
                </Button>
              )}
            </div>
            {gradeTamanhos.semInfoList.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground italic">Todos os colaboradores ativos têm os tamanhos preenchidos. 🎉</p>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-amber-100">
                {gradeTamanhos.semInfoList.map((x) => {
                  const e: any = x.emp;
                  const sub = [e.funcao, e.obraAtualNome].filter(Boolean).join(" • ");
                  const faltam = [x.faltaCalcado && "Calçado", x.faltaCamisa && "Camisa", x.faltaCalca && "Calça"].filter(Boolean) as string[];
                  return (
                    <div key={e.id} className="flex items-center gap-3 px-3 py-2 hover:bg-amber-50">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-blue-100 flex items-center justify-center shrink-0 border-2 border-blue-200">
                        {e.fotoUrl ? (
                          <img src={e.fotoUrl} alt="" className="w-full h-full object-cover object-top" />
                        ) : (
                          <span className="text-xs font-bold text-blue-700">{e.nomeCompleto?.charAt(0)}{e.nomeCompleto?.split(" ").pop()?.charAt(0)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm text-gray-800 truncate">{e.nomeCompleto}</div>
                        {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end shrink-0">
                        {faltam.map((f) => (
                          <span key={f} className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-semibold">{f}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGradeOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* FORM DIALOG - CADASTRO / EDIÇÃO */}
      {/* ============================================================ */}
      <FullScreenDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingId ? "Editar Colaborador" : "Novo Colaborador"} icon={<Users className="h-5 w-5 text-white" />}>

          {/* EMPRESA */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-2">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-5 w-5 text-primary" />
              <Label className="text-base font-semibold text-primary">Empresa</Label>
            </div>
            <Select value={form.companyId || selectedCompany} onValueChange={v => set("companyId", v)}>
              <SelectTrigger className="bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {companies?.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nomeFantasia || c.razaoSocial}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* FOTO 3x4 + NOME DO FUNCIONÁRIO */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg px-4 py-3 mb-2 flex items-center gap-4">
            {/* Foto 3x4 - Circular com centralização no rosto */}
            <div className="relative shrink-0">
              <div className="w-[80px] h-[80px] rounded-full border-3 border-blue-400 overflow-hidden bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center cursor-pointer group shadow-lg"
                onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = (e: any) => { if (e.target.files?.[0]) handleFotoUpload(e.target.files[0]); }; inp.click(); }}
              >
                {form.fotoUrl ? (
                  <img src={form.fotoUrl} alt="Foto" className="w-full h-full object-cover object-top" />
                ) : (
                  <div className="flex flex-col items-center justify-center text-blue-400 group-hover:text-blue-600 transition-colors">
                    <Camera className="h-7 w-7" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                  <Camera className="h-5 w-5 text-white" />
                </div>
              </div>
              {form.fotoUrl && (
                <button
                  type="button"
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 shadow-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (editingId && companyId) {
                      removeFotoMut.mutate({ employeeId: editingId, companyId });
                    } else {
                      set("fotoUrl", "");
                      pendingFotoRef.current = null;
                    }
                  }}
                >
                  <XIcon className="h-3 w-3" />
                </button>
              )}
            </div>
            {/* Nome e info */}
            <div className="flex-1 min-w-0">
              {form.nomeCompleto ? (
                <span className="text-sm font-bold text-blue-900 tracking-wide uppercase block truncate">{form.nomeCompleto}</span>
              ) : (
                <span className="text-sm text-muted-foreground italic">Novo Colaborador</span>
              )}
              {form.funcao && <span className="text-xs text-muted-foreground block mt-0.5">{form.funcao}</span>}
              {(uploadFotoMut.isPending || removeFotoMut.isPending) && <span className="text-xs text-blue-500 animate-pulse mt-1 block">Processando foto...</span>}
            </div>
            {/* Código Interno em destaque */}
            {form.codigoInterno && (
              <div className="flex items-center gap-2 ml-auto pl-4">
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg px-4 py-2 text-center">
                  <span className="text-[10px] text-blue-500 font-medium block leading-none mb-0.5">CÓD. INTERNO</span>
                  <span className="text-2xl font-black text-blue-800 tracking-wider leading-none">{form.codigoInterno}</span>
                </div>
              </div>
            )}
          </div>

          <Tabs defaultValue="pessoal" className="w-full">
            <TabsList className="w-full flex bg-secondary/80 rounded-lg p-1 gap-1">
              <TabsTrigger value="pessoal" className="flex-1 text-xs sm:text-sm">Pessoal</TabsTrigger>
              <TabsTrigger value="documentos" className="flex-1 text-xs sm:text-sm">Documentos</TabsTrigger>
              <TabsTrigger value="endereco" className="flex-1 text-xs sm:text-sm">Endereço</TabsTrigger>
              <TabsTrigger value="profissional" className="flex-1 text-xs sm:text-sm">Profissional</TabsTrigger>
              <TabsTrigger value="uniforme" className="flex-1 text-xs sm:text-sm">🦺 Uniforme / EPI</TabsTrigger>
              <TabsTrigger value="bancario" className="flex-1 text-xs sm:text-sm">Bancário</TabsTrigger>
              <TabsTrigger value="beneficios" className="flex-1 text-xs sm:text-sm">Benefícios</TabsTrigger>
              <TabsTrigger value="obrigacoes" className="flex-1 text-xs sm:text-sm">Obrigações</TabsTrigger>
              <TabsTrigger value="sindical" className="flex-1 text-xs sm:text-sm">Sindical</TabsTrigger>
              {editingId && <TabsTrigger value="hist_status" className="flex-1 text-xs sm:text-sm">📋 Hist. Status</TabsTrigger>}
              {editingId && <TabsTrigger value="hist_alteracoes" className="flex-1 text-xs sm:text-sm">🔍 Alterações</TabsTrigger>}
            </TabsList>

            {/* ===== ABA PESSOAL ===== */}
            <TabsContent value="pessoal" className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
                  <Label className="text-xs font-medium text-muted-foreground">Nome Completo *</Label>
                  <Input value={form.nomeCompleto ?? ""} onChange={e => set("nomeCompleto", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">CPF *</Label>
                  <Input
                    value={form.cpf ?? ""}
                    onChange={e => {
                      let v = e.target.value.replace(/\D/g, "").slice(0, 11);
                      if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
                      else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
                      else if (v.length > 3) v = v.replace(/(\d{3})(\d{0,3})/, "$1.$2");
                      set("cpf", v);
                    }}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className={`bg-input mt-1 ${blacklistAlert || cpfDuplicateAlert ? "border-red-600 ring-1 ring-red-600" : ""}`}
                  />
                </div>
                {blacklistAlert ? (
                  <div className="sm:col-span-2 lg:col-span-3 bg-red-600/10 border border-red-600/30 rounded-lg p-3 flex items-center gap-2">
                    <Ban className="h-5 w-5 text-red-600 shrink-0" />
                    <p className="text-sm font-medium text-red-600">{blacklistAlert}</p>
                  </div>
                ) : null}
                {verificandoCpf ? (
                  <div className="sm:col-span-2 lg:col-span-3 bg-muted/40 border border-border rounded-lg p-3 flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-muted-foreground shrink-0 animate-spin" />
                    <p className="text-sm font-medium text-muted-foreground">Verificando CPF na base (cadastro ativo, desligamento e recontratação)…</p>
                  </div>
                ) : null}
                {cpfVeredito === "erro" ? (
                  <div className="sm:col-span-2 lg:col-span-3 bg-orange-500/10 border-2 border-orange-500/40 rounded-lg p-4 flex items-start gap-3">
                    <Ban className="h-6 w-6 text-orange-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-base font-bold text-orange-700 uppercase tracking-wide">Não foi possível verificar o CPF</p>
                      <p className="text-sm text-orange-700/90 mt-1">A verificação na base falhou (conexão ou servidor). O CPF NÃO foi confirmado como novo nem como existente.</p>
                      <Button type="button" size="sm" className="mt-2 bg-orange-600 hover:bg-orange-700 text-white" onClick={() => verificarRecontratacao.refetch()}>
                        <RefreshCw className="h-4 w-4 mr-1" /> Tentar novamente
                      </Button>
                    </div>
                  </div>
                ) : null}
                {cpfVeredito === "ativo" ? (
                  <div className="sm:col-span-2 lg:col-span-3 bg-red-600/10 border-2 border-red-600/40 rounded-lg p-4 flex items-start gap-3">
                    <Ban className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-base font-bold text-red-700 uppercase tracking-wide">CPF já cadastrado</p>
                      <p className="text-sm text-red-700/90 mt-1">
                        {cpfDuplicateAlert
                          ? `${cpfDuplicateAlert}.`
                          : `Já existe um colaborador ATIVO com este CPF nesta empresa${ativoMesmaEmpresa?.nomeCompleto ? `: "${ativoMesmaEmpresa.nomeCompleto}"` : ""}.`}
                      </p>
                      <p className="text-xs text-red-700/80 mt-1">Cadastro bloqueado — não é possível criar um novo colaborador com o mesmo CPF ativo.</p>
                    </div>
                  </div>
                ) : null}
                {cpfVeredito === "pendente" ? (
                  <div className="sm:col-span-2 lg:col-span-3 bg-indigo-500/10 border-2 border-indigo-500/40 rounded-lg p-4 flex items-start gap-3">
                    <Clock className="h-6 w-6 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-base font-bold text-indigo-700 uppercase tracking-wide">Já em processo de recontratação</p>
                      <p className="text-sm text-indigo-700/90 mt-1">
                        {solicitacaoPendente.nomeCompleto || "—"}
                        {solicitacaoPendente.companyNome ? ` · ${solicitacaoPendente.companyNome}` : ""}
                        {solicitacaoPendente.createdAt ? ` · enviada em ${new Date(solicitacaoPendente.createdAt).toLocaleDateString("pt-BR")}` : ""}
                        {solicitacaoPendente.solicitadoPor ? ` por ${solicitacaoPendente.solicitadoPor}` : ""}.
                      </p>
                      <p className="text-xs text-indigo-700/80 mt-1">Aguardando a liberação do sócio. Não é preciso abrir outra — acompanhe em <span className="font-medium">Recontratações Pendentes</span>.</p>
                    </div>
                  </div>
                ) : null}
                {cpfVeredito === "desligado" ? (
                  <div className="sm:col-span-2 lg:col-span-3 bg-amber-500/10 border-2 border-amber-500/40 rounded-lg p-4 flex items-start gap-3">
                    <RefreshCw className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-base font-bold text-amber-700 uppercase tracking-wide">Já foi colaborador (desligado)</p>
                      <p className="text-sm text-amber-700/90 mt-1">
                        Encontramos {recontratacaoVinculos.length} vínculo(s) desligado(s) neste grupo para este CPF
                        {pickedVinculo?.nomeCompleto ? `: "${pickedVinculo.nomeCompleto}"` : ""}.
                      </p>
                      <p className="text-xs text-amber-700/80 mt-1">Deseja realizar a RECONTRATAÇÃO? Os dados anteriores são reaproveitados e a solicitação vai para a liberação do sócio. Nada é cadastrado até a aprovação.</p>
                      <Button type="button" size="sm" className="mt-2 bg-amber-600 hover:bg-amber-700 text-white" onClick={abrirPickerRecontratacao}>
                        <RefreshCw className="h-4 w-4 mr-1" /> Realizar recontratação
                      </Button>
                    </div>
                  </div>
                ) : null}
                {cpfVeredito === "novo" ? (
                  <div className="sm:col-span-2 lg:col-span-3 bg-emerald-500/10 border-2 border-emerald-500/40 rounded-lg p-4 flex items-start gap-3">
                    <UserCheck className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-base font-bold text-emerald-700 uppercase tracking-wide">Novo colaborador — CPF livre</p>
                      <p className="text-sm text-emerald-700/90 mt-1">Nenhum cadastro ativo, desligamento ou recontratação encontrado para este CPF neste grupo. Pode prosseguir com o cadastro.</p>
                    </div>
                  </div>
                ) : null}
                {recontratacaoMode && recontratacaoVinculo ? (
                  <div className="sm:col-span-2 lg:col-span-3 bg-lime-500/10 border border-lime-500/40 rounded-lg p-3 flex items-start gap-3">
                    <UserCheck className="h-5 w-5 text-lime-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-lime-700">Modo recontratação ativo</p>
                      <p className="text-xs text-lime-700/80 mt-0.5">
                        Vínculo anterior: {recontratacaoVinculo.codigoInterno || "—"} · {recontratacaoVinculo.companyNome} · desligado em {recontratacaoVinculo.dataDesligamento ? new Date(recontratacaoVinculo.dataDesligamento).toLocaleDateString("pt-BR") : "—"}
                        {recontratacaoVinculo.diasFora != null ? ` (${recontratacaoVinculo.diasFora} dias fora)` : ""}
                      </p>
                      {recontratacaoVinculo.alertaJuridico ? (
                        <p className={`text-xs mt-1 font-medium ${recontratacaoVinculo.experienciaPermitida ? "text-amber-700" : "text-red-600"}`}>{recontratacaoVinculo.alertaJuridico}</p>
                      ) : null}
                      <p className="text-xs text-lime-700/80 mt-1">Ao salvar, será criada uma SOLICITAÇÃO pendente — não um funcionário.</p>
                      <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 text-xs text-muted-foreground" onClick={() => { setRecontratacaoMode(false); setRecontratacaoVinculo(null); }}>
                        <XIcon className="h-3 w-3 mr-1" /> Cancelar recontratação
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Data de Nascimento</Label>
                  <Input type="date" value={form.dataNascimento ?? ""} onChange={e => set("dataNascimento", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Sexo</Label>
                  <Select value={form.sexo || "none"} onValueChange={v => set("sexo", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione</SelectItem>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Feminino</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Estado Civil</Label>
                  <Select value={form.estadoCivil || "none"} onValueChange={v => set("estadoCivil", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione</SelectItem>
                      <SelectItem value="Solteiro">Solteiro(a)</SelectItem>
                      <SelectItem value="Casado">Casado(a)</SelectItem>
                      <SelectItem value="Divorciado">Divorciado(a)</SelectItem>
                      <SelectItem value="Viuvo">Viúvo(a)</SelectItem>
                      <SelectItem value="Uniao_Estavel">União Estável</SelectItem>
                      <SelectItem value="Amasiado">Amasiado(a)</SelectItem>
                      <SelectItem value="Separado">Separado(a)</SelectItem>
                      <SelectItem value="Separado_Judicialmente">Separado(a) Judicialmente</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Nacionalidade</Label>
                  <Input value={form.nacionalidade ?? ""} onChange={e => set("nacionalidade", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Naturalidade</Label>
                  <Input value={form.naturalidade ?? ""} onChange={e => set("naturalidade", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Nome da Mãe</Label>
                  <Input value={form.nomeMae ?? ""} onChange={e => set("nomeMae", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Nome do Pai</Label>
                  <Input value={form.nomePai ?? ""} onChange={e => set("nomePai", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Celular</Label>
                  <Input value={form.celular ?? ""} onChange={e => {
                      let v = e.target.value.replace(/\D/g, "").slice(0, 11);
                      if (v.length > 6) v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
                      else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, "($1) $2");
                      set("celular", v);
                    }} placeholder="(00) 00000-0000" maxLength={15} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">E-mail</Label>
                  <Input value={form.email ?? ""} onChange={e => set("email", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Contato de Emergência</Label>
                  <Input value={form.contatoEmergencia ?? ""} onChange={e => set("contatoEmergencia", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Tel. Emergência</Label>
                  <Input value={form.telefoneEmergencia ?? ""} onChange={e => {
                      let v = e.target.value.replace(/\D/g, "").slice(0, 11);
                      if (v.length > 6) v = v.replace(/(\d{2})(\d{4,5})(\d{0,4})/, "($1) $2-$3");
                      else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, "($1) $2");
                      set("telefoneEmergencia", v);
                    }} placeholder="(00) 00000-0000" maxLength={15} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Parentesco</Label>
                  <Input value={form.parentescoEmergencia ?? ""} onChange={e => set("parentescoEmergencia", e.target.value)} placeholder="Ex: Esposa, Mãe, Pai" className="bg-input mt-1" />
                </div>
              </div>
            </TabsContent>

            {/* ===== ABA DOCUMENTOS ===== */}
            <TabsContent value="documentos" className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">RG</Label>
                  <Input value={form.rg ?? ""} onChange={e => {
                      let v = e.target.value.replace(/\D/g, "").slice(0, 10);
                      if (v.length > 8) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
                      else if (v.length > 5) v = v.replace(/(\d{2})(\d{3})(\d{0,3})/, "$1.$2.$3");
                      else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,3})/, "$1.$2");
                      set("rg", v);
                    }} placeholder="00.000.000-0" maxLength={13} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Órgão Emissor</Label>
                  <Input value={form.orgaoEmissor ?? ""} onChange={e => set("orgaoEmissor", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">CTPS</Label>
                  <Input value={form.ctps ?? ""} onChange={e => set("ctps", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Série CTPS</Label>
                  <Input value={form.serieCtps ?? ""} onChange={e => set("serieCtps", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">PIS</Label>
                  <Input value={form.pis ?? ""} onChange={e => {
                      let v = e.target.value.replace(/\D/g, "").slice(0, 11);
                      if (v.length > 10) v = v.replace(/(\d{3})(\d{5})(\d{2})(\d{1})/, "$1.$2.$3-$4");
                      else if (v.length > 8) v = v.replace(/(\d{3})(\d{5})(\d{0,2})/, "$1.$2.$3");
                      else if (v.length > 3) v = v.replace(/(\d{3})(\d{0,5})/, "$1.$2");
                      set("pis", v);
                    }} placeholder="000.00000.00-0" maxLength={14} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Título de Eleitor</Label>
                  <Input value={form.tituloEleitor ?? ""} onChange={e => {
                      let v = e.target.value.replace(/\D/g, "").slice(0, 12);
                      if (v.length > 8) v = v.replace(/(\d{4})(\d{4})(\d{0,4})/, "$1 $2 $3");
                      else if (v.length > 4) v = v.replace(/(\d{4})(\d{0,4})/, "$1 $2");
                      set("tituloEleitor", v);
                    }} placeholder="0000 0000 0000" maxLength={14} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Certificado de Reservista</Label>
                  <Input value={form.certificadoReservista ?? ""} onChange={e => set("certificadoReservista", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">CNH</Label>
                  <Input value={form.cnh ?? ""} onChange={e => set("cnh", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Categoria CNH</Label>
                  <Input value={form.categoriaCnh ?? ""} onChange={e => set("categoriaCnh", e.target.value)} placeholder="A, B, AB..." className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Validade CNH</Label>
                  <Input type="date" value={form.validadeCnh ?? ""} onChange={e => set("validadeCnh", e.target.value)} className="bg-input mt-1" />
                </div>
              </div>

              {/* Upload de Documentos Pessoais */}
              {editingId && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Documentos
                  </h4>
                  <DocumentUploadSection employeeId={editingId!} companyId={formCompanyIdNum || companyId || 0} />
                </div>
              )}

              {/* Rev. 2146 — O fluxo de Termo de Responsabilidade foi movido pra
                  Controle de Documentos → aba "Termo de Recebimento" (lista
                  centralizada, criação para qualquer colaborador, visualizar/
                  baixar/excluir, com fix do refetch pós-assinatura). */}
              {editingId && (
                <div className="mt-6">
                  <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Termo de Responsabilidade
                  </h4>
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 dark:bg-slate-900/20 p-4">
                    <p className="text-xs text-muted-foreground">
                      Os Termos de Responsabilidade (entrega de equipamentos, ferramentas,
                      EPIs e veículos) foram movidos para{" "}
                      <strong>Controle de Documentos → aba "Termo de Recebimento"</strong>,
                      onde você pode emitir, visualizar, baixar e excluir termos de
                      qualquer colaborador em um só lugar.
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ===== ABA ENDEREÇO ===== */}
            <TabsContent value="endereco" className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                <div className="sm:col-span-2">
                  <Label className="text-xs font-medium text-muted-foreground">CEP</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      value={form.cep ?? ""}
                      onChange={e => {
                        const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
                        const formatted = raw.length > 5 ? raw.slice(0, 5) + "-" + raw.slice(5) : raw;
                        set("cep", formatted);
                        if (raw.length === 8) {
                          fetch(`https://viacep.com.br/ws/${raw}/json/`)
                            .then(r => r.json())
                            .then(d => {
                              if (!d.erro) {
                                set("logradouro", d.logradouro || "");
                                set("bairro", d.bairro || "");
                                set("cidade", normalizeCidadeInput(d.localidade || ""));
                                set("estado", d.uf || "");
                                toast.success("Endereço encontrado!");
                              } else {
                                toast.error("CEP não encontrado");
                              }
                            })
                            .catch(() => toast.error("Erro ao buscar CEP"));
                        }
                      }}
                      placeholder="00000-000"
                      className="bg-input"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
                  <Label className="text-xs font-medium text-muted-foreground">Logradouro</Label>
                  <Input value={form.logradouro ?? ""} onChange={e => set("logradouro", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Número</Label>
                  <Input value={form.numero ?? ""} onChange={e => set("numero", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Complemento</Label>
                  <Input value={form.complemento ?? ""} onChange={e => set("complemento", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Bairro</Label>
                  <Input value={form.bairro ?? ""} onChange={e => set("bairro", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Cidade</Label>
                  <Input
                    value={form.cidade ?? ""}
                    onChange={e => set("cidade", e.target.value)}
                    onBlur={e => { const n = normalizeCidadeInput(e.target.value); if (n !== e.target.value) set("cidade", n); }}
                    className="bg-input mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">UF</Label>
                  <Input value={form.estado ?? ""} onChange={e => set("estado", e.target.value)} maxLength={2} placeholder="PE" className="bg-input mt-1" />
                </div>
              </div>
            </TabsContent>

            {/* ===== ABA PROFISSIONAL ===== */}
            <TabsContent value="profissional" className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Hash className="h-3.5 w-3.5" /> Código Interno (JFC)
                    {form.codigoInterno && <Lock className="h-3 w-3 text-amber-500" />}
                  </Label>
                  {editingId && form.codigoInterno ? (
                    <div className="relative">
                      <Input
                        value={form.codigoInterno ?? ""}
                        onChange={e => set("codigoInterno", e.target.value.toUpperCase())}
                        className="bg-input mt-1 font-mono font-bold text-primary"
                        readOnly={user?.role !== 'admin' && user?.role !== 'admin_master'}
                        disabled={user?.role !== 'admin' && user?.role !== 'admin_master'}
                      />
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">
                        {(user?.role === 'admin' || user?.role === 'admin_master') ? 'Somente ADM Master pode alterar' : 'Gerado automaticamente • Imutável'}
                      </span>
                    </div>
                  ) : (
                    <div className="bg-muted/50 border border-dashed border-muted-foreground/30 rounded-md px-3 py-2 mt-1 text-sm text-muted-foreground italic">
                      Gerado automaticamente ao salvar
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">eSocial</Label>
                  <Input value={form.matricula ?? ""} onChange={e => set("matricula", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Status</Label>
                  <Select value={form.status ?? "Ativo"} onValueChange={v => {
                    if (v === "Desligado" && (form.status || "Ativo") !== "Desligado") {
                      setPreviousStatus(form.status || "Ativo");
                      set("status", v);
                      setDesligamentoDialogOpen(true);
                    } else {
                      set("status", v);
                    }
                  }}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYEE_STATUS_MANUAL.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {['Ferias', 'Afastado', 'Licenca'].includes(form.status || '') && (
                    <p className="text-xs text-blue-600 mt-1">Status calculado automaticamente pelo sistema</p>
                  )}
                </div>
                {form.status === 'Afastado' && (
                  <>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        🏥 Data de Afastamento <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        type="date"
                        value={form.licencaDataInicio ?? ""}
                        onChange={e => set("licencaDataInicio", e.target.value)}
                        className="bg-input mt-1"
                      />
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">
                        Início do afastamento (INSS, atestado, etc.) — usado p/ regra dos 180 dias (CLT Art. 133, IV)
                      </span>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Tipo de Afastamento</Label>
                      <Select value={form.licencaTipo || "none"} onValueChange={v => set("licencaTipo", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          <SelectItem value="auxilio_doenca">Auxílio-Doença (INSS)</SelectItem>
                          <SelectItem value="acidente_trabalho">Acidente de Trabalho (INSS)</SelectItem>
                          <SelectItem value="atestado_medico">Atestado Médico</SelectItem>
                          <SelectItem value="suspensao">Suspensão Disciplinar</SelectItem>
                          <SelectItem value="outros">Outros</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Previsão de Retorno</Label>
                      <Input
                        type="date"
                        value={form.licencaDataFim ?? ""}
                        onChange={e => set("licencaDataFim", e.target.value)}
                        className="bg-input mt-1"
                      />
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">Opcional</span>
                    </div>
                  </>
                )}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Função</Label>
                  {/* Rev. 2169 — combobox pesquisável (Popover + cmdk) substitui o Select
                      pra facilitar busca em listas longas. Mesmo padrão do PlanoDeContaCombobox. */}
                  <FuncaoCombobox
                    value={form.funcao || ""}
                    onChange={(v) => set("funcao", v)}
                    options={(funcoesList ?? []).filter((f: any) => f.isActive !== false)}
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Setor</Label>
                  <Select value={form.setor || "none"} onValueChange={v => set("setor", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione o setor</SelectItem>
                      {(setoresList ?? []).filter((s: any) => s.isActive !== false).map((s: any) => (
                        <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><HardHat className="h-3.5 w-3.5" /> Obra Atual</Label>
                  <div className="bg-muted/50 border rounded-md px-3 py-2 mt-1 text-sm text-muted-foreground">
                    {form.obraAtualId && form.obraAtualId !== "0" ? (
                      (obras ?? []).find((o: any) => String(o.id) === String(form.obraAtualId))?.nome || "Obra #" + form.obraAtualId
                    ) : (
                      <span className="italic">Não alocado — use Efetivo por Obra</span>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Código Contábil</Label>
                  <Input value={form.codigoContabil ?? ""} onChange={e => set("codigoContabil", e.target.value)} placeholder="Ex: 128" className="bg-input mt-1" />
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">Nº de identificação no sistema da contabilidade</span>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Data de Admissão</Label>
                  <Input type="date" value={form.dataAdmissao ?? ""} onChange={e => set("dataAdmissao", e.target.value)} className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Salário Base (R$)</Label>
                  <Input value={form.salarioBase ?? ""} onChange={e => {
                    const formatted = formatMoedaInput(e.target.value);
                    set("salarioBase", formatted);
                    const salarioNum = parseMoedaBR(formatted);
                    const horasNum = parseFloat(String(form.horasMensais || "220").replace(",", "."));
                    if (salarioNum > 0 && !isNaN(horasNum) && horasNum > 0) {
                      set("valorHora", formatMoedaSemPrefixo(salarioNum / horasNum));
                    }
                  }} placeholder="2.500,00" className="bg-input mt-1" />
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">Referência mensal (varia conforme dias úteis)</span>
                </div>
                <div>
                  <Label className="text-xs font-medium font-semibold text-blue-700">Valor da Hora (R$) ⭐</Label>
                  <Input value={form.valorHora ?? ""} onChange={e => {
                    const formatted = formatMoedaInput(e.target.value);
                    set("valorHora", formatted);
                    const horaNum = parseMoedaBR(formatted);
                    const horasNum = parseFloat(String(form.horasMensais || "220").replace(",", "."));
                    if (horaNum > 0 && !isNaN(horasNum) && horasNum > 0) {
                      set("salarioBase", formatMoedaSemPrefixo(horaNum * horasNum));
                    }
                  }} placeholder="11,36" className="bg-input mt-1 border-blue-300 ring-1 ring-blue-100" />
                  <span className="text-[10px] mt-0.5 block font-medium text-blue-600">
                    Dado mestre — base para cálculo da folha (todos CLT são horistas)
                  </span>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Horas Mensais</Label>
                  <Input value={form.horasMensais ?? ""} onChange={e => {
                    const horas = e.target.value;
                    set("horasMensais", horas);
                    const horaNum = parseMoedaBR(String(form.valorHora || "0"));
                    const horasNum = parseFloat(horas.replace(",", "."));
                    if (horaNum > 0 && !isNaN(horasNum) && horasNum > 0) {
                      set("salarioBase", formatMoedaSemPrefixo(horaNum * horasNum));
                    }
                  }} placeholder="220" className="bg-input mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Tipo de Contrato</Label>
                  <Select value={form.tipoContrato || "none"} onValueChange={v => set("tipoContrato", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione</SelectItem>
                      <SelectItem value="CLT">CLT</SelectItem>
                      <SelectItem value="PJ">PJ</SelectItem>
                      <SelectItem value="Temporario">Temporário</SelectItem>
                      <SelectItem value="Estagio">Estágio</SelectItem>
                      <SelectItem value="Aprendiz">Aprendiz</SelectItem>
                      <SelectItem value="Socio">Sócio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Rev. 2502 — Tipo de Remuneração (Mensalista / Horista). Determina o
                    texto da CLÁUSULA 2ª do Contrato de Experiência e o regime de cálculo
                    da folha (campo já consumido por payrollEngine.ts / financial.ts). */}
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Tipo de Remuneração</Label>
                  <Select value={(form as any).tipoRemuneracao || "horista"} onValueChange={v => set("tipoRemuneracao" as any, v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="horista">Horista</SelectItem>
                      <SelectItem value="mensalista">Mensalista</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">
                    Horista: remuneração por hora trabalhada. Mensalista: salário mensal fixo.
                  </span>
                </div>
              </div>

              {/* Contrato de Experiência CLT */}
              {(form.tipoContrato === 'CLT' || !form.tipoContrato) && (
                <div className="mt-4 p-4 rounded-lg border-2 border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-800">
                  <h4 className="text-sm font-bold text-orange-700 dark:text-orange-400 mb-3 flex items-center gap-2">
                    <span className="text-lg">📋</span> Contrato de Experiência
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Tipo de Experiência</Label>
                      <Select value={(form as any).experienciaTipo || 'none'} onValueChange={v => {
                        set('experienciaTipo' as any, v === 'none' ? '' : v);
                        // Auto-calcular datas quando tipo é selecionado e tem data de admissão
                        const inicio = (form as any).experienciaInicio || form.dataAdmissao;
                        if (inicio && v !== 'none') {
                          const dias1 = v === '30_30' ? 30 : 45;
                          const dias2 = v === '30_30' ? 60 : 90;
                          const dtInicio = new Date(inicio + 'T12:00:00');
                          // Rev. 2500 — CLT: dia do início conta como dia 1 (30 dias a partir de 04/05 → fim 02/06).
                          const dtFim1 = new Date(dtInicio); dtFim1.setDate(dtFim1.getDate() + dias1 - 1);
                          const dtFim2 = new Date(dtInicio); dtFim2.setDate(dtFim2.getDate() + dias2 - 1);
                          set('experienciaFim1' as any, dtFim1.toISOString().split('T')[0]);
                          set('experienciaFim2' as any, dtFim2.toISOString().split('T')[0]);
                          if (!(form as any).experienciaInicio) set('experienciaInicio' as any, inicio);
                        }
                      }}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem experiência</SelectItem>
                          <SelectItem value="30_30">30 + 30 = 60 dias</SelectItem>
                          <SelectItem value="45_45">45 + 45 = 90 dias</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Início da Experiência</Label>
                      <Input type="date" value={(form as any).experienciaInicio ?? form.dataAdmissao ?? ''} onChange={e => {
                        set('experienciaInicio' as any, e.target.value);
                        const tipo = (form as any).experienciaTipo;
                        if (tipo && e.target.value) {
                          const dias1 = tipo === '30_30' ? 30 : 45;
                          const dias2 = tipo === '30_30' ? 60 : 90;
                          const dtInicio = new Date(e.target.value + 'T12:00:00');
                          // Rev. 2500 — CLT: dia do início conta como dia 1 (ver Tipo de Experiência acima).
                          const dtFim1 = new Date(dtInicio); dtFim1.setDate(dtFim1.getDate() + dias1 - 1);
                          const dtFim2 = new Date(dtInicio); dtFim2.setDate(dtFim2.getDate() + dias2 - 1);
                          set('experienciaFim1' as any, dtFim1.toISOString().split('T')[0]);
                          set('experienciaFim2' as any, dtFim2.toISOString().split('T')[0]);
                        }
                      }} className="bg-input mt-1" />
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">Geralmente igual à data de admissão</span>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Status da Experiência</Label>
                      <Select value={(form as any).experienciaStatus || 'em_experiencia'} onValueChange={v => set('experienciaStatus' as any, v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="em_experiencia">Em Experiência (1º período)</SelectItem>
                          <SelectItem value="prorrogado">Prorrogado (2º período)</SelectItem>
                          <SelectItem value="efetivado">Efetivado</SelectItem>
                          <SelectItem value="desligado_experiencia">Desligado na Experiência</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {(form as any).experienciaTipo && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-2 rounded bg-orange-100 dark:bg-orange-900/30">
                        <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">Fim do 1º Período:</span>
                        <span className="text-sm font-bold text-orange-800 dark:text-orange-300 ml-2">
                          {(form as any).experienciaFim1 ? new Date((form as any).experienciaFim1 + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                        </span>
                        <span className="text-xs text-orange-600 dark:text-orange-500 ml-1">({(form as any).experienciaTipo === '30_30' ? '30' : '45'} dias)</span>
                      </div>
                      <div className="p-2 rounded bg-orange-100 dark:bg-orange-900/30">
                        <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">Fim do 2º Período (Efetivação):</span>
                        <span className="text-sm font-bold text-orange-800 dark:text-orange-300 ml-2">
                          {(form as any).experienciaFim2 ? new Date((form as any).experienciaFim2 + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                        </span>
                        <span className="text-xs text-orange-600 dark:text-orange-500 ml-1">({(form as any).experienciaTipo === '30_30' ? '60' : '90'} dias)</span>
                      </div>
                    </div>
                  )}
                  <div className="mt-3">
                    <Label className="text-xs font-medium text-muted-foreground">Observações da Experiência</Label>
                    <Input value={(form as any).experienciaObs ?? ''} onChange={e => set('experienciaObs' as any, e.target.value)} placeholder="Observações sobre o período de experiência..." className="bg-input mt-1" />
                  </div>
                  {(form as any).experienciaTipo && (form as any).experienciaTipo !== 'none' && (() => {
                    // XSS hardening — escapa qualquer dado de form antes de interpolar no template HTML
                    const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                    const comp = companies?.find(c => String(c.id) === selectedCompanyId);
                    const empNomeRaw = form.nomeCompleto || 'Funcionário';
                    const empNome = esc(empNomeRaw);
                    const empCpf = form.cpf || '';
                    const empRg = esc(form.rg || '');
                    const empCtps = esc(form.ctps || '');
                    const empFuncao = esc(form.funcao || '');
                    const empSalarioBRL = formatBRL(form.salarioBase);
                    const empSalarioExtenso = valorPorExtenso(form.salarioBase);
                    // Rev. 2155 — fallback p/ logradouro (aba Endereço usa esse campo).
                    const empEndereco = esc(form.endereco || (form as any).logradouro || '');
                    const empCidade = esc(form.cidade || '');
                    const empEstado = esc(form.estado || '');
                    const inicio = (form as any).experienciaInicio || form.dataAdmissao || '';
                    const tipo = (form as any).experienciaTipo;
                    const dias1 = tipo === '30_30' ? 30 : 45;
                    const dias2 = tipo === '30_30' ? 60 : 90;
                    // Rev. 2664 — o contrato RECALCULA o término pela regra CLT (o dia do início
                    // conta como dia 1 → término = início + dias − 1), em vez de confiar nos valores
                    // gravados em experienciaFim1/Fim2 (cadastros antigos foram salvos antes da
                    // Rev. 2500, sem o −1, e ficaram 1 dia à frente). Mesma régua do Painel RH /
                    // homeData. Vale p/ TODOS os colaboradores em experiência (ex.: Lilian 18/05 +
                    // 45 dias = 01/07, e não 02/07). Sem `inicio`, cai no valor gravado (fallback).
                    const calcFimExp = (base: string, dias: number, fallback: string) => {
                      if (!base) return fallback || '';
                      const d = new Date(base + 'T12:00:00');
                      if (isNaN(d.getTime())) return fallback || ''; // data inválida → fallback (nunca quebra a geração)
                      d.setDate(d.getDate() + dias - 1);
                      return d.toISOString().split('T')[0];
                    };
                    const fim1 = calcFimExp(inicio, dias1, (form as any).experienciaFim1 || '');
                    const fim2 = calcFimExp(inicio, dias2, (form as any).experienciaFim2 || '');
                    const fmtDate = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '___/___/______';
                    // Rev. 2123 — jornadaDesc construída a partir DOS DADOS REAIS
                      // do cadastro (campos jornada_{dia}_entrada/saida/intervalo). Se
                      // nenhum dia útil estiver definido retorna `null` → o clique nos
                      // botões "Imprimir" / "Enviar para Assinatura" bloqueia com toast.
                    const jornadaInfo = (() => {
                      const j = form as any;
                      const dias = [
                        { key: 'seg', label: 'Segunda-feira' },
                        { key: 'ter', label: 'Terça-feira' },
                        { key: 'qua', label: 'Quarta-feira' },
                        { key: 'qui', label: 'Quinta-feira' },
                        { key: 'sex', label: 'Sexta-feira' },
                        { key: 'sab', label: 'Sábado' },
                        { key: 'dom', label: 'Domingo' },
                      ];
                      const linhas: Array<{ label: string; entrada: string; saida: string; intervalo: string; minutos: number }> = [];
                      let totalMin = 0;
                      const hhmm = /^\d{1,2}:\d{2}$/;
                      for (const d of dias) {
                        const ent = j[`jornada_${d.key}_entrada`];
                        const sai = j[`jornada_${d.key}_saida`];
                        const intv = j[`jornada_${d.key}_intervalo`] || '';
                        if (!ent || !sai || ent === 'none' || sai === 'none') continue;
                        if (!hhmm.test(ent) || !hhmm.test(sai)) continue;
                        const [eh, em] = ent.split(':').map(Number);
                        const [sh, sm] = sai.split(':').map(Number);
                        let mins = (sh * 60 + sm) - (eh * 60 + em);
                        let intvLabel = '—';
                        if (intv && intv !== 'none' && hhmm.test(intv)) {
                          const [ih, im] = intv.split(':').map(Number);
                          mins -= (ih * 60 + im);
                          intvLabel = intv;
                        }
                        if (mins <= 0) continue;
                        linhas.push({ label: d.label, entrada: ent, saida: sai, intervalo: intvLabel, minutos: mins });
                        totalMin += mins;
                      }
                      if (linhas.length === 0) return null;
                      const totalH = Math.floor(totalMin / 60);
                      const totalRest = totalMin % 60;
                      const totalStr = `${totalH}h${totalRest > 0 ? String(totalRest).padStart(2, '0') : ''}`;
                      const diasUteis = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];
                      const semana = linhas.filter(l => diasUteis.includes(l.label));
                      const sabado = linhas.find(l => l.label === 'Sábado');
                      const domingo = linhas.find(l => l.label === 'Domingo');
                      const semanaUniforme = semana.length === 5
                        && semana.every(l => l.entrada === semana[0].entrada && l.saida === semana[0].saida && l.intervalo === semana[0].intervalo);
                      let resumo: string;
                      if (semanaUniforme && !sabado && !domingo) {
                        resumo = `de Segunda a Sexta-feira, das ${semana[0].entrada} às ${semana[0].saida}, com intervalo de ${semana[0].intervalo} para repouso e alimentação`;
                      } else if (semanaUniforme && sabado && !domingo) {
                        resumo = `de Segunda a Sexta-feira, das ${semana[0].entrada} às ${semana[0].saida} (intervalo de ${semana[0].intervalo}), e aos Sábados das ${sabado.entrada} às ${sabado.saida}${sabado.intervalo !== '—' ? ` (intervalo de ${sabado.intervalo})` : ''}`;
                      } else {
                        resumo = linhas.map(l => `${l.label}: das ${l.entrada} às ${l.saida}${l.intervalo !== '—' ? ` (intervalo ${l.intervalo})` : ''}`).join('; ');
                      }
                      return { resumo, totalStr, totalMin };
                    })();
                    const jornadaDesc = jornadaInfo
                      ? `${jornadaInfo.resumo}, totalizando ${jornadaInfo.totalStr} semanais`
                      : null;
                    const jornadaDefinida = !!jornadaInfo;
                    // Logo: usa comp.logoUrl se for URL absoluta, senão fallback para o logo público da FC.
                    // Para HTML renderizado dentro do app (FCSign /assinar/:token) e na impressão,
                    // SEMPRE serializa com URL absoluta pra funcionar mesmo em window.open() vazio.
                    const logoSrc = (comp?.logoUrl && /^https?:\/\//.test(comp.logoUrl))
                      ? comp.logoUrl
                      : `${window.location.origin}/logo-fc.jpg`;
                    // IMPORTANTE: <style> precisa ficar DENTRO do <body> porque o DOMPurify
                    // do /assinar/:token (FCSign) descarta tudo fora do body (default).
                    // Rev. 2114: refatoração estrutural — TODOS os documentos
                    // institucionais agora usam o template único `buildFcDocument`
                    // (client/src/lib/fcDocumentTemplate.ts), com medidas calibradas
                    // a partir do Comunicado Interno React real (logo 64px,
                    // razão social 13pt navy, faixa azul 11pt letter-spacing 1.5px,
                    // bloco ASSUNTO com border cinza, corpo com border cinza,
                    // container max-w 760px). Acabou a era das 10 micro-revisões.
                    const userName = (user as any)?.nome || (user as any)?.name || 'Sistema';
                    const dataHoje = new Date().toLocaleDateString('pt-BR');
                    const localDataStr = `${(comp?.cidade || '________')}/${(comp?.estado || '__')}, ${fmtDate(inicio)}`;
                    const corpoHtml = `
<p><strong>Pelo presente instrumento particular de CONTRATO DE TRABALHO POR PRAZO DETERMINADO (EXPERIÊNCIA), que entre si fazem:</strong></p>

<p style="margin-top:12px"><strong>EMPREGADOR:</strong> ${esc(comp?.razaoSocial || '________________________________')}, inscrita no CNPJ sob nº ${esc(comp?.cnpj || '___.___.___/____-__')}, com sede em ${esc(comp?.endereco || '________________')}, ${esc(comp?.cidade || '________')}/${esc(comp?.estado || '__')}, doravante denominada simplesmente <strong>EMPREGADOR</strong>.</p>

<p style="margin-top:8px"><strong>EMPREGADO(A):</strong> ${esc(empNome)}, portador(a) do CPF nº ${esc(formatCPF(empCpf)) || '___.___.___-__'}, RG nº ${esc(empRg || '____________')}, CTPS nº ${esc(empCtps || '____________')}, residente em ${empEndereco ? esc(empEndereco + ', ' + (empCidade || '') + '/' + (empEstado || '')) : '________________________________'}, doravante denominado(a) simplesmente <strong>EMPREGADO(A)</strong>.</p>

<p style="margin-top:10px">Têm entre si justo e contratado o seguinte:</p>

<p style="margin-top:14px"><strong>CLÁUSULA 1ª — DA FUNÇÃO.</strong> O(A) EMPREGADO(A) é admitido(a) para exercer a função de <strong>${esc(empFuncao || '________________')}</strong>, obrigando-se a executar as tarefas inerentes à função para a qual foi contratado(a), bem como as que forem compatíveis com a sua condição pessoal.</p>

${(() => {
  // Rev. 2502 — CLÁUSULA 2ª varia conforme tipoRemuneracao.
  //  - Horista: remuneração POR HORA (valorHora).
  //  - Mensalista (default legado): remuneração MENSAL (salarioBase).
  const tipoRem = ((form as any).tipoRemuneracao || 'horista').toLowerCase();
  if (tipoRem === 'horista') {
    const valorHoraBRL = formatBRL(form.valorHora);
    const valorHoraExtenso = valorPorExtenso(form.valorHora);
    return `<p style="margin-top:8px"><strong>CLÁUSULA 2ª — DA REMUNERAÇÃO.</strong> O(A) EMPREGADO(A) receberá a título de remuneração por hora no valor de <strong>R$ ${esc(valorHoraBRL)}</strong> (${esc(valorHoraExtenso)}), pago até o 5º dia útil do mês subsequente ao trabalhado, com os descontos legais previstos em lei.</p>`;
  }
  return `<p style="margin-top:8px"><strong>CLÁUSULA 2ª — DA REMUNERAÇÃO.</strong> O(A) EMPREGADO(A) receberá a título de remuneração mensal o valor de <strong>R$ ${esc(empSalarioBRL)}</strong> (${esc(empSalarioExtenso)}), pago até o 5º dia útil do mês subsequente ao trabalhado, com os descontos legais previstos em lei.</p>`;
})()}

<p style="margin-top:8px"><strong>CLÁUSULA 3ª — DA JORNADA DE TRABALHO.</strong> A jornada ordinária de trabalho do(a) EMPREGADO(A) será cumprida <strong>${esc(jornadaDesc || '________________')}</strong>, respeitados os intervalos legais para repouso e alimentação, nos termos do Art. 71 da CLT.</p>

<p style="margin-top:8px"><strong>CLÁUSULA 4ª — DA PRORROGAÇÃO DA JORNADA E HORAS EXTRAORDINÁRIAS.</strong> Nos termos do <strong>Art. 59 da Consolidação das Leis do Trabalho (CLT)</strong> e da <strong>Convenção Coletiva de Trabalho da categoria profissional</strong> vigente, a jornada normal estabelecida na CLÁUSULA 3ª poderá ser acrescida de <strong>até 2 (duas) horas suplementares diárias</strong>, mediante prévia solicitação do EMPREGADOR, sempre que assim exigirem as necessidades operacionais da obra, do serviço ou do contrato com o cliente. O(A) EMPREGADO(A) declara, neste ato, expressa e formal ciência de que a prestação de horas extraordinárias, dentro do limite legal supracitado, constitui <strong>prerrogativa do EMPREGADOR</strong> e parte integrante das condições do presente contrato, comprometendo-se a manter disponibilidade compatível com a possível convocação para tais demandas, ressalvadas as hipóteses de impossibilidade justificada. As horas extras eventualmente prestadas serão integralmente <strong>remuneradas com o adicional legal/convencional aplicável</strong>, ou, alternativamente, <strong>compensadas mediante banco de horas</strong>, na forma do §2º do Art. 59 da CLT e do acordo individual ou coletivo vigente. A presente cláusula constitui aviso prévio formal e inequívoco ao(à) EMPREGADO(A), afastando, para todos os efeitos, qualquer alegação posterior de desconhecimento da referida prerrogativa empresarial.</p>

<p style="margin-top:8px"><strong>CLÁUSULA 5ª — DO PRAZO.</strong> O presente contrato é firmado por prazo determinado de <strong style="color:#c1121f">${dias1} (${dias1 === 30 ? 'trinta' : 'quarenta e cinco'}) dias</strong>, com início em <strong style="color:#c1121f">${esc(fmtDate(inicio))}</strong> e término previsto em <strong style="color:#c1121f">${esc(fmtDate(fim1))}</strong>, podendo ser prorrogado por mais <strong style="color:#c1121f">${dias1} dias</strong>, totalizando <strong style="color:#c1121f">${dias2} dias</strong>, com término final em <strong style="color:#c1121f">${esc(fmtDate(fim2))}</strong>, conforme Art. 445 da CLT.</p>

<p style="margin-top:8px"><strong>CLÁUSULA 6ª — DA RESCISÃO ANTECIPADA.</strong> Caso o EMPREGADOR rescinda o contrato antes do prazo estipulado, sem justa causa, ficará obrigado a pagar ao EMPREGADO(A), a título de indenização, metade da remuneração a que teria direito até o término do contrato, conforme <strong>Art. 479 da CLT</strong>. Caso o(a) EMPREGADO(A) se desligue antes do prazo, poderá ser obrigado(a) a indenizar o EMPREGADOR nos termos do <strong>Art. 480 da CLT</strong>, limitada a indenização àquela a que teria direito o empregado em idênticas condições (§1º).</p>

<p style="margin-top:8px"><strong>CLÁUSULA 7ª — DAS OBRIGAÇÕES.</strong> O(A) EMPREGADO(A) se obriga a cumprir o regulamento interno da empresa, manter sigilo sobre informações confidenciais e zelar pelos equipamentos e materiais que lhe forem confiados.</p>

<p style="margin-top:8px"><strong>CLÁUSULA 8ª — DO LOCAL DE TRABALHO.</strong> O(A) EMPREGADO(A) prestará serviços nas dependências do EMPREGADOR ou em obras/projetos por ele designados, podendo ser transferido(a) conforme necessidade do serviço.</p>

<p style="margin-top:8px"><strong>CLÁUSULA 9ª — DAS DISPOSIÇÕES GERAIS.</strong> As partes elegem o foro da Comarca de ${esc(comp?.cidade || '________')}/${esc(comp?.estado || '__')} para dirimir quaisquer dúvidas oriundas do presente contrato. Fica assegurado ao(a) EMPREGADO(A) todos os direitos previstos na CLT e legislação trabalhista vigente.</p>

<p style="margin-top:16px">E por estarem assim justos e contratados, firmam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença de 2 (duas) testemunhas.</p>
`;
                    // Rev. 2125 — número agora é alocado ATOMICAMENTE no backend
                    // (`employees.allocateContratoExperienciaNumero`) só quando o
                    // usuário clica em Imprimir / Enviar p/ Assinatura. Aqui montamos
                    // apenas um closure que recebe a string já formatada.
                    // Para preview na tela usamos o número já alocado, se houver,
                    // ou um placeholder "___/AAAA" antes da 1ª alocação.
                    const empAtualPreview: any = employees?.find((x: any) => x.id === editingId);
                    const numeroJaAlocado: number | null = empAtualPreview?.numeroContratoExperiencia ?? null;
                    const anoJaAlocado: number | null = empAtualPreview?.numeroContratoExperienciaAno ?? null;
                    const numeroPreviewStr = (numeroJaAlocado && anoJaAlocado)
                      ? `${String(numeroJaAlocado).padStart(3, '0')}/${anoJaAlocado}`
                      : `___/${new Date().getFullYear()}`;
                    // Rev. 2747 — se houver template VIGENTE na Central de Documentos,
                    // o corpo sai dele (renderizado com os dados deste contrato);
                    // senão usa o `corpoHtml` hard-coded acima (fallback intacto).
                    const tipoRemDados = ((form as any).tipoRemuneracao || 'horista').toLowerCase();
                    const clausulaRemuneracaoHtml = tipoRemDados === 'horista'
                      ? `<p style="margin-top:8px"><strong>CLÁUSULA 2ª — DA REMUNERAÇÃO.</strong> O(A) EMPREGADO(A) receberá a título de remuneração por hora no valor de <strong>R$ ${esc(formatBRL(form.valorHora))}</strong> (${esc(valorPorExtenso(form.valorHora))}), pago até o 5º dia útil do mês subsequente ao trabalhado, com os descontos legais previstos em lei.</p>`
                      : `<p style="margin-top:8px"><strong>CLÁUSULA 2ª — DA REMUNERAÇÃO.</strong> O(A) EMPREGADO(A) receberá a título de remuneração mensal o valor de <strong>R$ ${esc(empSalarioBRL)}</strong> (${esc(empSalarioExtenso)}), pago até o 5º dia útil do mês subsequente ao trabalhado, com os descontos legais previstos em lei.</p>`;
                    const dadosContrato: Record<string, string> = {
                      empresaRazaoSocial: esc(comp?.razaoSocial || '________________________________'),
                      empresaCnpj: esc(comp?.cnpj || '___.___.___/____-__'),
                      empresaEndereco: esc(`${comp?.endereco || '________________'}, ${comp?.cidade || '________'}/${comp?.estado || '__'}`),
                      empNome: esc(empNome),
                      empCpf: esc(formatCPF(empCpf)) || '___.___.___-__',
                      empRg: esc(empRg || '____________'),
                      empCtps: esc(empCtps || '____________'),
                      empEndereco: empEndereco ? esc(`${empEndereco}, ${empCidade || ''}/${empEstado || ''}`) : '________________________________',
                      empFuncao: esc(empFuncao || '________________'),
                      clausulaRemuneracao: clausulaRemuneracaoHtml,
                      jornadaSemanal: esc(jornadaDesc || '________________'),
                      prazo1: String(dias1),
                      prazo2: String(dias1),
                      prazoTotal: String(dias2),
                      dataInicio: esc(fmtDate(inicio)),
                      dataFim: esc(fmtDate(fim1)),
                      dataFimFinal: esc(fmtDate(fim2)),
                      docLocal: esc(`${comp?.cidade || '________'}/${comp?.estado || '__'}`),
                    };
                    const vigenteHtml = contratoVigenteQ.data?.vigente ? contratoVigenteQ.data.conteudoHtml : null;
                    const corpoHtmlFinal = vigenteHtml ? renderTemplate(vigenteHtml, dadosContrato) : corpoHtml;
                    const buildContratoHtmlWithNumero = (numeroStr: string) => buildFcDocument({
                      empresa: {
                        razaoSocial: comp?.razaoSocial || 'FC Engenharia',
                        cnpj: comp?.cnpj || undefined,
                        endereco: comp?.endereco || undefined,
                        cidade: comp?.cidade || undefined,
                        estado: comp?.estado || undefined,
                        logoUrl: logoSrc,
                      },
                      titulo: 'CONTRATO DE EXPERIÊNCIA',
                      numero: numeroStr,
                      dataEmissao: dataHoje,
                      assunto: {
                        valor: `CONTRATO DE EXPERIÊNCIA — ${empNome}${empFuncao ? ' (' + empFuncao + ')' : ''}`,
                      },
                      corpoHtml: corpoHtmlFinal,
                      assinaturas: {
                        partes: [
                          {
                            role: 'empregador',
                            nome: comp?.razaoSocial || 'EMPREGADOR',
                            subtitulo: comp?.cnpj ? `CNPJ: ${comp.cnpj}` : undefined,
                          },
                          {
                            role: 'empregado',
                            nome: empNome,
                            subtitulo: formatCPF(empCpf) ? `CPF: ${formatCPF(empCpf)}` : undefined,
                          },
                        ],
                        testemunhas: true,
                        localData: localDataStr,
                      },
                      geradoPor: userName,
                      pageTitle: `Contrato de Experiência - ${empNome}`,
                      logoSrc,
                    });
                    const empCpfFmt = formatCPF(empCpf);
                    // Rev. 2136 — validação consolidada de pré-requisitos do Contrato
                    // de Experiência. Antes só Jornada bloqueava — agora qualquer
                    // campo essencial faltando dispara toast listando TODAS as
                    // pendências de uma vez (evita doc com '________________').
                    // Usado tanto no Imprimir quanto no Enviar p/ Assinatura.
                    const validarPreReqsContratoExperiencia = (): string[] => {
                      const faltando: string[] = [];
                      // Empresa
                      if (!comp?.razaoSocial) faltando.push('Empresa: Razão Social');
                      if (!comp?.cnpj) faltando.push('Empresa: CNPJ');
                      if (!comp?.endereco) faltando.push('Empresa: Endereço');
                      if (!comp?.cidade) faltando.push('Empresa: Cidade');
                      if (!comp?.estado) faltando.push('Empresa: Estado (UF)');
                      // Empregado — identificação
                      if (!form.nomeCompleto?.trim()) faltando.push('Empregado: Nome Completo');
                      if (!form.cpf?.trim()) faltando.push('Empregado: CPF');
                      if (!form.rg?.trim()) faltando.push('Empregado: RG');
                      if (!form.ctps?.trim()) faltando.push('Empregado: CTPS');
                      // Empregado — endereço (Rev. 2155: aceita logradouro como fallback,
                      // alinhado ao empEnderecoRaw da L466 — a aba "Endereço" preenche o
                      // campo `logradouro`, então checar só `endereco` falava em vazio mesmo
                      // com tudo preenchido na UI).
                      if (!(form.endereco?.trim() || (form as any).logradouro?.trim())) faltando.push('Empregado: Endereço');
                      if (!form.cidade?.trim()) faltando.push('Empregado: Cidade');
                      if (!form.estado?.trim()) faltando.push('Empregado: Estado (UF)');
                      // Empregado — profissional / remuneração
                      if (!form.funcao?.trim()) faltando.push('Empregado: Função');
                      const sb = parseFloat(String(form.salarioBase || '0').replace(',', '.'));
                      if (!sb || sb <= 0) faltando.push('Empregado: Salário Base');
                      // Experiência (tipo é garantido pelo IIFE wrapper)
                      if (!((form as any).experienciaTipo)) faltando.push('Experiência: Tipo (30+30 ou 45+45)');
                      if (!inicio) faltando.push('Experiência: Data de Início');
                      if (!fim1) faltando.push('Experiência: Fim do 1º Período');
                      if (!fim2) faltando.push('Experiência: Fim do 2º Período (Efetivação)');
                      // Jornada
                      if (!jornadaDefinida) faltando.push('Jornada de Trabalho (entrada/saída/intervalo dos dias úteis)');
                      return faltando;
                    };
                    const exibirToastPreReqsFaltando = (faltando: string[], acao: 'imprimir' | 'enviar') => {
                      const label = acao === 'imprimir' ? 'imprimir' : 'enviar para assinatura';
                      const lista = faltando.map(f => `• ${f}`).join('\n');
                      toast.error(
                        `Preencha os campos abaixo antes de ${label} o Contrato de Experiência:\n\n${lista}`,
                        { duration: 12000, style: { whiteSpace: 'pre-line', maxWidth: 480 } }
                      );
                    };
                    return (
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={updateExperienciaMut.isPending || !editingId || !comp?.id}
                          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white border-0 disabled:opacity-60"
                          onClick={() => {
                            const empId = editingId;
                            const compId = comp?.id;
                            if (!empId || !compId) { toast.error('Salve o cadastro do colaborador antes de salvar a experiência.'); return; }
                            updateExperienciaMut.mutate({
                              id: Number(empId),
                              companyId: Number(compId),
                              data: {
                                experienciaTipo: (form as any).experienciaTipo || null,
                                experienciaInicio: (form as any).experienciaInicio || null,
                                experienciaFim1: (form as any).experienciaFim1 || null,
                                experienciaFim2: (form as any).experienciaFim2 || null,
                                experienciaStatus: (form as any).experienciaStatus || null,
                                experienciaObs: (form as any).experienciaObs || null,
                              } as any,
                            });
                          }}
                        >
                          <Save className="h-4 w-4 mr-1" /> {updateExperienciaMut.isPending ? 'Salvando...' : 'Salvar Experiência'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={allocateContratoExpMut.isPending}
                          className="border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-60"
                          onClick={async () => {
                            if (!editingId || !comp?.id) {
                              toast.error('Salve o cadastro do colaborador antes de gerar o Contrato.');
                              return;
                            }
                            // Rev. 2136 — validação consolidada (substitui o check
                            // único de Jornada). Bloqueia se QUALQUER campo essencial
                            // estiver vazio e mostra a lista completa de uma vez.
                            const faltando = validarPreReqsContratoExperiencia();
                            if (faltando.length > 0) {
                              exibirToastPreReqsFaltando(faltando, 'imprimir');
                              return;
                            }
                            // Rev. 2125 — aloca número ANTES de gerar o HTML.
                            // Se já foi alocado p/ este employee, o backend devolve o mesmo (idempotente).
                            const res = await allocateContratoExpMut.mutateAsync({
                              employeeId: Number(editingId),
                              companyId: Number(comp.id),
                            });
                            const numeroStr = `${String(res.numero).padStart(3, '0')}/${res.ano}`;
                            const html = buildContratoHtmlWithNumero(numeroStr);
                            const w = window.open('', '_blank');
                            if (!w) return toast.error('Popup bloqueado');
                            w.document.write(html);
                            w.document.close();
                            setTimeout(() => w.print(), 500);
                          }}
                        >
                          <FileText className="h-4 w-4 mr-1" /> Imprimir Contrato de Experiência {numeroPreviewStr && numeroJaAlocado ? `(Nº ${numeroPreviewStr})` : ''}
                        </Button>
                        {editingId && comp?.id ? (
                          <FCSignContratoExperienciaPanel
                            companyId={Number(comp.id)}
                            employeeId={Number(editingId)}
                            empNome={empNome}
                            isAdminMaster={isAdminMaster}
                            onEnviar={async () => {
                              // Rev. 2136 — mesma validação consolidada do botão Imprimir.
                              const faltando = validarPreReqsContratoExperiencia();
                              if (faltando.length > 0) {
                                exibirToastPreReqsFaltando(faltando, 'enviar');
                                return;
                              }
                              // Rev. 2125 — aloca número ANTES de abrir o modal FCSign.
                              const res = await allocateContratoExpMut.mutateAsync({
                                employeeId: Number(editingId),
                                companyId: Number(comp!.id),
                              });
                              const numeroStr = `${String(res.numero).padStart(3, '0')}/${res.ano}`;
                              const html = buildContratoHtmlWithNumero(numeroStr);
                              setFcsignPayload({
                                companyId: Number(comp!.id),
                                employeeId: Number(editingId),
                                tipo: 'contrato_experiencia',
                                documentTitle: `Contrato de Experiência ${numeroStr} - ${empNome}`,
                                documentHtml: html,
                                empregadoNome: empNome,
                                empregadoCpf: empCpfFmt || undefined,
                              });
                              setFcsignOpen(true);
                            }}
                          />
                        ) : (
                          <Button
                            type="button" size="sm" disabled
                            className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white border-0 opacity-60"
                          >
                            <ShieldCheck className="h-4 w-4 mr-1" /> Enviar para Assinatura (FCSign)
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Jornada de Trabalho - Dia a Dia */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-primary">Jornada de Trabalho</h4>
                  <div className="flex items-center gap-2">
                    {(() => {
                      // Calcular total de horas semanais
                      const DIAS = ["seg","ter","qua","qui","sex","sab","dom"];
                      let totalMin = 0;
                      DIAS.forEach(d => {
                        const ent = form[`jornada_${d}_entrada`];
                        const sai = form[`jornada_${d}_saida`];
                        const intv = form[`jornada_${d}_intervalo`];
                        if (ent && sai && ent !== "none" && sai !== "none") {
                          const [eh, em2] = ent.split(":").map(Number);
                          const [sh, sm] = sai.split(":").map(Number);
                          let mins = (sh * 60 + sm) - (eh * 60 + em2);
                          if (intv && intv !== "none") {
                            const [ih, im] = intv.split(":").map(Number);
                            mins -= (ih * 60 + im);
                          }
                          if (mins > 0) totalMin += mins;
                        }
                      });
                      const horas = Math.floor(totalMin / 60);
                      const minutos = totalMin % 60;
                      const totalStr = `${horas}h${minutos > 0 ? String(minutos).padStart(2, '0') : ''}`;
                      const isOk = totalMin >= 2640 && totalMin <= 2640; // 44h = 2640min
                      const isClose = totalMin >= 2580 && totalMin <= 2700; // ~43h-45h
                      return totalMin > 0 ? (
                        <span className={`text-xs font-bold px-2 py-1 rounded ${totalMin === 2640 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : isClose ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {totalStr}/semana {totalMin === 2640 ? '✅' : ''}
                        </span>
                      ) : null;
                    })()}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
                      onClick={() => {
                        // Jornada padrão CLT 44h semanais (Opção C):
                        // Seg-Qui: 07:00 - 17:00 (1h intervalo) = 9h/dia × 4 = 36h
                        // Sex: 07:00 - 16:00 (1h intervalo) = 8h/dia
                        // Sáb: Folga (qualquer hora trabalhada = HE 50%)
                        // Dom: Folga (qualquer hora trabalhada = HE 100%)
                        // Total: 36 + 8 = 44h semanais
                        setForm(prev => ({
                          ...prev,
                          jornada_seg_entrada: "07:00", jornada_seg_intervalo: "01:00", jornada_seg_saida: "17:00",
                          jornada_ter_entrada: "07:00", jornada_ter_intervalo: "01:00", jornada_ter_saida: "17:00",
                          jornada_qua_entrada: "07:00", jornada_qua_intervalo: "01:00", jornada_qua_saida: "17:00",
                          jornada_qui_entrada: "07:00", jornada_qui_intervalo: "01:00", jornada_qui_saida: "17:00",
                          jornada_sex_entrada: "07:00", jornada_sex_intervalo: "01:00", jornada_sex_saida: "16:00",
                          jornada_sab_entrada: "", jornada_sab_intervalo: "", jornada_sab_saida: "",
                          jornada_dom_entrada: "", jornada_dom_intervalo: "", jornada_dom_saida: "",
                          jornada_padrao_entrada: "", jornada_padrao_intervalo: "", jornada_padrao_saida: "",
                        }));
                        toast.success("Jornada 44h semanais aplicada! Seg-Qui 07-17h (9h), Sex 07-16h (8h), Sáb/Dom = Folga (HE)");
                      }}
                    >
                      ⏰ 44h (Seg-Sex)
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                      onClick={() => {
                        // Jornada 44h com Sábado:
                        // Seg-Sex: 07:00 - 16:00 (1h intervalo) = 8h/dia × 5 = 40h
                        // Sáb: 07:00 - 11:00 (sem intervalo) = 4h
                        // Dom: Folga (qualquer hora = HE 100%)
                        // Total: 40 + 4 = 44h semanais
                        setForm(prev => ({
                          ...prev,
                          jornada_seg_entrada: "07:00", jornada_seg_intervalo: "01:00", jornada_seg_saida: "16:00",
                          jornada_ter_entrada: "07:00", jornada_ter_intervalo: "01:00", jornada_ter_saida: "16:00",
                          jornada_qua_entrada: "07:00", jornada_qua_intervalo: "01:00", jornada_qua_saida: "16:00",
                          jornada_qui_entrada: "07:00", jornada_qui_intervalo: "01:00", jornada_qui_saida: "16:00",
                          jornada_sex_entrada: "07:00", jornada_sex_intervalo: "01:00", jornada_sex_saida: "16:00",
                          jornada_sab_entrada: "07:00", jornada_sab_intervalo: "", jornada_sab_saida: "11:00",
                          jornada_dom_entrada: "", jornada_dom_intervalo: "", jornada_dom_saida: "",
                          jornada_padrao_entrada: "", jornada_padrao_intervalo: "", jornada_padrao_saida: "",
                        }));
                        toast.success("Jornada 44h com Sábado aplicada! Seg-Sex 07-16h (8h), Sáb 07-11h (4h), Dom = Folga");
                      }}
                    >
                      ⏰ 44h (c/ Sábado)
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => {
                        setForm(prev => {
                          const updated = { ...prev };
                          ["seg","ter","qua","qui","sex","sab","dom"].forEach(d => {
                            updated[`jornada_${d}_entrada`] = "";
                            updated[`jornada_${d}_intervalo`] = "";
                            updated[`jornada_${d}_saida`] = "";
                          });
                          updated.jornada_padrao_entrada = "";
                          updated.jornada_padrao_intervalo = "";
                          updated.jornada_padrao_saida = "";
                          return updated;
                        });
                      }}
                    >
                      Limpar
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border border-border rounded-lg">
                    <thead>
                      <tr className="bg-secondary/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground w-20">Dia</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Entrada</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Intervalo</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Saída</th>
                        <th className="px-3 py-2 text-center font-medium text-muted-foreground w-16">Horas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Linha Padrão - preenche todos os dias */}
                      <tr className="border-t-2 border-primary/30 bg-primary/5">
                        <td className="px-3 py-1.5 font-bold text-primary text-xs">Padrão</td>
                        <td className="px-1 py-1">
                          <TimeCombobox
                            value={form.jornada_padrao_entrada || ""}
                            onChange={(v) => {
                              setForm(prev => {
                                const updated: Record<string, string> = { ...prev, jornada_padrao_entrada: v };
                                ["seg","ter","qua","qui","sex","sab","dom"].forEach(d => { updated[`jornada_${d}_entrada`] = v; });
                                return updated;
                              });
                            }}
                            options={ENTRADA_OPTIONS}
                            triggerClassName="bg-primary/10 border-primary/30"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <TimeCombobox
                            value={form.jornada_padrao_intervalo || ""}
                            onChange={(v) => {
                              setForm(prev => {
                                const updated: Record<string, string> = { ...prev, jornada_padrao_intervalo: v };
                                ["seg","ter","qua","qui","sex","sab","dom"].forEach(d => { updated[`jornada_${d}_intervalo`] = v; });
                                return updated;
                              });
                            }}
                            options={INTERVALO_OPTIONS}
                            triggerClassName="bg-primary/10 border-primary/30"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <TimeCombobox
                            value={form.jornada_padrao_saida || ""}
                            onChange={(v) => {
                              setForm(prev => {
                                const updated: Record<string, string> = { ...prev, jornada_padrao_saida: v };
                                ["seg","ter","qua","qui","sex","sab","dom"].forEach(d => { updated[`jornada_${d}_saida`] = v; });
                                return updated;
                              });
                            }}
                            options={SAIDA_OPTIONS}
                            triggerClassName="bg-primary/10 border-primary/30"
                          />
                        </td>
                        <td className="px-1 py-1 text-center text-xs text-muted-foreground">-</td>
                      </tr>
                      {/* Dias individuais */}
                      {[
                        { key: "seg", label: "Segunda" },
                        { key: "ter", label: "Terça" },
                        { key: "qua", label: "Quarta" },
                        { key: "qui", label: "Quinta" },
                        { key: "sex", label: "Sexta" },
                        { key: "sab", label: "Sábado" },
                        { key: "dom", label: "Domingo" },
                      ].map(dia => {
                        const ent = form[`jornada_${dia.key}_entrada`];
                        const sai = form[`jornada_${dia.key}_saida`];
                        const intv = form[`jornada_${dia.key}_intervalo`];
                        let horasDia = "";
                        if (ent && sai && ent !== "none" && sai !== "none") {
                          const [eh, em2] = ent.split(":").map(Number);
                          const [sh, sm] = sai.split(":").map(Number);
                          let mins = (sh * 60 + sm) - (eh * 60 + em2);
                          if (intv && intv !== "none") {
                            const [ih, im] = intv.split(":").map(Number);
                            mins -= (ih * 60 + im);
                          }
                          if (mins > 0) horasDia = `${Math.floor(mins / 60)}h${(mins % 60) > 0 ? String(mins % 60).padStart(2, '0') : ''}`;
                        }
                        const isFolga = !ent || ent === "none" || !sai || sai === "none";
                        const isWeekend = dia.key === "sab" || dia.key === "dom";
                        return (
                        <tr key={dia.key} className={`border-t border-border ${isWeekend && isFolga ? 'bg-orange-50/50 dark:bg-orange-950/10' : isWeekend && !isFolga ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}`}>
                          <td className="px-3 py-1.5 font-medium text-foreground">
                            {dia.label}
                            {isWeekend && isFolga && <span className="ml-1 text-[10px] text-orange-500 font-bold">HE</span>}
                          </td>
                          <td className="px-1 py-1">
                            <TimeCombobox
                              value={form[`jornada_${dia.key}_entrada`] || ""}
                              onChange={(v) => set(`jornada_${dia.key}_entrada`, v)}
                              options={ENTRADA_OPTIONS}
                              triggerClassName="bg-input"
                            />
                          </td>
                          <td className="px-1 py-1">
                            <TimeCombobox
                              value={form[`jornada_${dia.key}_intervalo`] || ""}
                              onChange={(v) => set(`jornada_${dia.key}_intervalo`, v)}
                              options={INTERVALO_OPTIONS}
                              triggerClassName="bg-input"
                            />
                          </td>
                          <td className="px-1 py-1">
                            <TimeCombobox
                              value={form[`jornada_${dia.key}_saida`] || ""}
                              onChange={(v) => set(`jornada_${dia.key}_saida`, v)}
                              options={SAIDA_OPTIONS}
                              triggerClassName="bg-input"
                            />
                          </td>
                          <td className="px-1 py-1 text-center">
                            {horasDia ? (
                              <span className={`text-xs font-semibold ${isWeekend ? 'text-orange-600 dark:text-orange-400' : 'text-foreground'}`}>{horasDia}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">{isFolga && isWeekend ? 'Folga' : '-'}</span>
                            )}
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Complemento Salarial */}
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-3">
                  <h4 className="text-sm font-semibold text-primary">Complemento Salarial</h4>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={String(form.recebeComplemento) === "1"}
                      onCheckedChange={(checked) => {
                        set("recebeComplemento", checked ? "1" : "0");
                        if (!checked) set("valorComplemento", "");
                      }}
                    />
                    <Label className="text-xs text-muted-foreground cursor-pointer">Funcionário recebe complemento salarial (por fora)</Label>
                  </div>
                </div>
                {String(form.recebeComplemento) === "1" && (
                  <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs font-medium text-amber-800">Valor do Complemento (R$)</Label>
                        <Input
                          value={form.valorComplemento ?? ""}
                          onChange={e => set("valorComplemento", formatMoedaInput(e.target.value))}
                          placeholder="500,00"
                          className="bg-white mt-1 border-amber-300 focus:border-amber-500"
                        />
                        <span className="text-[10px] text-amber-700 mt-0.5 block">Este valor será somado ao líquido da folha para o financeiro</span>
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs font-medium text-amber-800">Observação</Label>
                        <Input
                          value={form.descricaoComplemento ?? ""}
                          onChange={e => set("descricaoComplemento", e.target.value)}
                          placeholder="Ex: Bônus de produtividade, ajuste salarial..."
                          className="bg-white mt-1 border-amber-300 focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Isenção de Controle de Jornada — CLT Art. 62 (Rev. 1874: inciso I/II/III + observação) */}
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <h4 className="text-sm font-semibold text-primary">Isenção de Controle de Jornada (Art. 62 CLT)</h4>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={String(form.cargoConfianca) === "1"}
                      onCheckedChange={(checked) => {
                        set("cargoConfianca", checked ? "1" : "0");
                        if (!checked) { set("cargoConfiancaInciso", ""); }
                        // Default sensato: se já tem inciso II e grat vazia, semeia 40 (mín. legal)
                        if (checked && form.cargoConfiancaInciso === "II" && !form.cargoConfiancaGratificacao) {
                          set("cargoConfiancaGratificacao", "40");
                        }
                      }}
                    />
                    <Label className="text-xs text-muted-foreground cursor-pointer">
                      Funcionário sem controle de jornada / horas extras (isento — Art. 62 CLT)
                    </Label>
                  </div>
                </div>
                {String(form.cargoConfianca) === "1" && (
                  <div className="border border-indigo-200 bg-indigo-50/50 rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-2 text-xs text-indigo-700 bg-indigo-100 rounded-lg p-2">
                      <Shield className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        <strong>CLT Art. 62:</strong> Funcionário não sujeito a controle de jornada — sem horas extras, banco de horas, adicional noturno padrão, intervalo intrajornada indenizado nem inconsistências de ponto.
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <Label className="text-xs font-medium">Inciso de enquadramento <span className="text-red-500">*</span></Label>
                        <Select value={form.cargoConfiancaInciso || ""} onValueChange={(v) => {
                          set("cargoConfiancaInciso", v);
                          // Inciso II exige grat ≥ 40% — semeia o mínimo legal se vazio.
                          if (v === "II" && !form.cargoConfiancaGratificacao) {
                            set("cargoConfiancaGratificacao", "40");
                          }
                        }}>
                          <SelectTrigger className="bg-white mt-1"><SelectValue placeholder="Selecione o inciso do Art. 62" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="I">I — Atividade externa incompatível com controle de horário (exige anotação CTPS)</SelectItem>
                            <SelectItem value="II">II — Cargo de gestão / confiança (gerente, diretor) — grat. mín. 40%</SelectItem>
                            <SelectItem value="III">III — Teletrabalho por produção ou tarefa (Lei 14.442/2022)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Data de enquadramento</Label>
                        <Input type="date" value={form.cargoConfiancaDesde ?? ""} onChange={e => set("cargoConfiancaDesde", e.target.value)} className="bg-white mt-1" />
                      </div>
                      {form.cargoConfiancaInciso === "II" && (
                        <div>
                          <Label className="text-xs">Gratificação de função (%) <span className="text-red-500">*</span></Label>
                          <Input type="text" inputMode="numeric" value={form.cargoConfiancaGratificacao ?? ""} onChange={e => set("cargoConfiancaGratificacao", e.target.value.replace(/[^0-9.,]/g, ''))} className="bg-white mt-1" placeholder="Mín. 40% (CLT)" />
                          <span className="text-[10px] text-muted-foreground">Mínimo legal: 40% sobre o salário efetivo (Parágrafo único Art. 62)</span>
                        </div>
                      )}
                      <div className="sm:col-span-2">
                        <Label className="text-xs">
                          Observação / Justificativa
                          {form.cargoConfiancaInciso === "I" && <span className="text-red-500"> *</span>}
                        </Label>
                        <textarea
                          value={form.cargoConfiancaObservacao ?? ""}
                          onChange={e => set("cargoConfiancaObservacao", e.target.value)}
                          rows={3}
                          className="w-full bg-white mt-1 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          placeholder={
                            form.cargoConfiancaInciso === "I"
                              ? "Obrigatório — descreva: cargo, tipo de atividade externa, anotação na CTPS e ficha de registro."
                              : form.cargoConfiancaInciso === "II"
                              ? "Opcional — descreva os poderes de gestão (admitir, demitir, advertir, representar) que caracterizam o cargo."
                              : form.cargoConfiancaInciso === "III"
                              ? "Opcional — descreva o regime de produção/tarefa e a forma de remuneração."
                              : "Descreva a justificativa do enquadramento."
                          }
                        />
                      </div>
                    </div>
                    <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                      ⚠️ <strong>Atenção legal:</strong> O TST exige PROVA de que o enquadramento é real (poderes efetivos de gestão p/ inciso II; condição anotada na CTPS p/ inciso I). Enquadramento incorreto pode gerar passivo trabalhista (horas extras retroativas até 5 anos).
                    </div>

                    {/* Rev. 1878 / 2684 — Termo formal de Isenção (Art. 62 CLT).
                        Permite GERAR PDF/imprimir (texto adaptado ao inciso) p/
                        conferência; a assinatura é coletada ONLINE via FCSign
                        (upload manual removido na Rev. 2684). A prova documental
                        é a defesa primária em fiscalização do TST/MPT. */}
                    <div className="bg-white border border-indigo-200 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-indigo-800">
                        <FileText className="h-4 w-4" /> Termo formal de Ciência e Anuência
                      </div>
                      {/* Rev. 2684 — Upload manual do termo removido: a assinatura
                          é coletada online via FCSign (não precisa de upload). */}
                      <p className="text-[11px] text-indigo-700/80">
                        Gere o termo (com o texto correto para o inciso {form.cargoConfiancaInciso || "I/II/III"}) para conferir o conteúdo e envie para <strong>assinatura digital (FCSign)</strong> abaixo — não é necessário fazer upload, a assinatura é coletada online.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" size="sm"
                          onClick={imprimirTermoArt62}
                          disabled={!form.cargoConfiancaInciso}
                          className="border-indigo-300 text-indigo-700 hover:bg-indigo-50">
                          <Printer className="h-4 w-4 mr-1.5" /> Gerar / Imprimir Termo
                        </Button>
                      </div>
                      {/* Rev. 2682 — Assinatura online (FCSign) do Termo Art. 62,
                          mesmos meios/critérios do Contrato de Experiência. */}
                      {(() => {
                        const cId = parseInt(String(form.companyId || selectedCompanyId || ""), 10);
                        if (!editingId || !cId) {
                          return (
                            <Button
                              type="button" size="sm" disabled
                              className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white border-0 opacity-60"
                            >
                              <ShieldCheck className="h-4 w-4 mr-1" /> Enviar para Assinatura (FCSign)
                            </Button>
                          );
                        }
                        return (
                          <FCSignContratoExperienciaPanel
                            companyId={cId}
                            employeeId={Number(editingId)}
                            empNome={String(form.nomeCompleto || "Colaborador")}
                            isAdminMaster={isAdminMaster}
                            tipo="termo_art62"
                            docLabel="Termo de Isenção (Art. 62)"
                            onEnviar={() => {
                              const faltando = validarTermoArt62();
                              if (faltando.length > 0) {
                                toast.error("Preencha antes de enviar: " + faltando.join(", "));
                                return;
                              }
                              const html = buildTermoArt62(true);
                              if (!html) return;
                              setFcsignPayload({
                                companyId: cId,
                                employeeId: Number(editingId),
                                tipo: "termo_art62",
                                documentTitle: `Termo de Isenção Art. 62 - ${String(form.nomeCompleto || "Colaborador")}`,
                                documentHtml: html,
                                empregadoNome: String(form.nomeCompleto || "Colaborador"),
                                empregadoCpf: formatCPF(String(form.cpf || "")) || undefined,
                              });
                              setFcsignOpen(true);
                            }}
                          />
                        );
                      })()}
                      {form.cargoConfiancaTermoUrl ? (
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5 text-xs">
                          <FileText className="h-4 w-4 text-emerald-700 shrink-0" />
                          <a href={form.cargoConfiancaTermoUrl} target="_blank" rel="noreferrer" className="text-emerald-800 font-medium hover:underline truncate flex-1">
                            {form.cargoConfiancaTermoNomeArquivo || "Termo assinado anexado"}
                          </a>
                          {form.cargoConfiancaTermoAssinadoEm && (
                            <span className="text-[10px] text-emerald-700">
                              em {new Date(String(form.cargoConfiancaTermoAssinadoEm)).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                          <button type="button"
                            onClick={() => {
                              if (!editingId) return;
                              const cId = parseInt(String(form.companyId || selectedCompany || ""), 10);
                              if (!cId) return;
                              if (!confirm("Remover o termo anexado?")) return;
                              removerTermoArt62Mut.mutate({ employeeId: editingId, companyId: cId });
                            }}
                            className="p-1 rounded hover:bg-emerald-100 text-emerald-700"
                            title="Remover anexo"
                          >
                            <XIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-500 italic">Nenhum termo assinado anexado.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Acordo Individual de Horas Extras */}
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-3">
                  <h4 className="text-sm font-semibold text-primary">Horas Extras — Percentuais</h4>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={String(form.acordoHoraExtra) === "1"}
                       onCheckedChange={(checked) => {
                         set("acordoHoraExtra", checked ? "1" : "0");
                         if (!checked) {
                           set("heNormal50", globalHE.heDiasUteis);
                           set("he100", globalHE.heDomingosFeriados);
                           set("heNoturna", globalHE.heAdicionalNoturno);
                         }
                      }}
                    />
                    <Label className="text-xs text-muted-foreground cursor-pointer">Acordo individual de hora extra (valores diferenciados)</Label>
                  </div>
                </div>
                <div className={`border rounded-lg p-4 ${String(form.acordoHoraExtra) === "1" ? 'bg-blue-50/50 border-blue-200' : 'bg-muted/30 border-border'}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">HE Dias Úteis (%)</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="Ex: 60"
                          value={form.heNormal50 ?? globalHE.heDiasUteis}
                          onChange={e => set("heNormal50", e.target.value.replace(/[^0-9.,]/g, ''))}
                          className={`bg-white ${String(form.acordoHoraExtra) === "1" ? 'border-blue-300' : 'opacity-60'}`}
                          readOnly={String(form.acordoHoraExtra) !== "1"}
                        />
                        <span className="text-sm font-medium text-muted-foreground">%</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">Empresa: {globalHE.heDiasUteis}% (CLT: 50%)</span>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">HE Domingos/Feriados (%)</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="Ex: 100"
                          value={form.he100 ?? globalHE.heDomingosFeriados}
                          onChange={e => set("he100", e.target.value.replace(/[^0-9.,]/g, ''))}
                          className={`bg-white ${String(form.acordoHoraExtra) === "1" ? 'border-blue-300' : 'opacity-60'}`}
                          readOnly={String(form.acordoHoraExtra) !== "1"}
                        />
                        <span className="text-sm font-medium text-muted-foreground">%</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">Empresa: {globalHE.heDomingosFeriados}% (CLT: 100%)</span>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Adicional Noturno (%)</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="Ex: 20"
                          value={form.heNoturna ?? globalHE.heAdicionalNoturno}
                          onChange={e => set("heNoturna", e.target.value.replace(/[^0-9.,]/g, ''))}
                          className={`bg-white ${String(form.acordoHoraExtra) === "1" ? 'border-blue-300' : 'opacity-60'}`}
                          readOnly={String(form.acordoHoraExtra) !== "1"}
                        />
                        <span className="text-sm font-medium text-muted-foreground">%</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">Empresa: {globalHE.heAdicionalNoturno}% (CLT: 20%)</span>
                    </div>
                  </div>
                  {String(form.acordoHoraExtra) === "1" && (
                    <div className="mt-3 p-2 bg-blue-100/50 rounded text-xs text-blue-800">
                      <strong>Acordo ativo:</strong> Os percentuais acima serão usados no cálculo de horas extras deste funcionário ao invés dos valores padrão da empresa.
                    </div>
                  )}

                </div>
              </div>
            </TabsContent>

            {/* ===== ABA UNIFORME / EPI (Rev. 2856) — cartelas interativas, toque pra selecionar ===== */}
            <TabsContent value="uniforme" className="pt-4">
              <div className="space-y-5">
                {/* Faixa institucional FC (regra de ouro) */}
                <div
                  className="rounded-xl overflow-hidden border-2 shadow-sm"
                  style={{ borderColor: "#1B2A4A" }}
                >
                  <div
                    className="px-5 py-4 flex items-center gap-3"
                    style={{ background: "linear-gradient(135deg, #1B2A4A 0%, #2c4470 100%)", printColorAdjust: "exact" as any }}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-2xl">🦺</span>
                    <div>
                      <h4 className="text-white font-bold text-base tracking-wide uppercase" style={{ letterSpacing: "1.5px" }}>
                        Tamanhos de Uniforme / EPI
                      </h4>
                      <p className="text-white/70 text-xs">
                        Toque no tamanho desejado — sem digitar. Usado para mapear a compra e garantir o estoque por tamanho.
                      </p>
                    </div>
                  </div>

                  {/* Cartelas interativas */}
                  <div className="p-4 bg-muted/30 grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {EPI_CARDS.map((card) => {
                      const Icon = card.Icon;
                      const selected = ((form as any)[card.key] || "").toString();
                      return (
                        <div
                          key={card.key}
                          className={`rounded-xl border-2 ${card.ring} ${card.softBg} overflow-hidden transition-shadow hover:shadow-md`}
                        >
                          {/* Cabeçalho da cartela */}
                          <div className={`${card.headBg} px-4 py-3 flex items-center justify-between`} style={{ printColorAdjust: "exact" as any }}>
                            <div className="flex items-center gap-2.5">
                              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
                                <Icon className="h-5 w-5 text-white" />
                              </span>
                              <div className="leading-tight">
                                <div className="text-white font-bold text-sm flex items-center gap-1.5">
                                  <span>{card.emoji}</span> {card.label}
                                </div>
                                <div className="text-white/70 text-[11px]">{card.sub}</div>
                              </div>
                            </div>
                            {/* Selo do valor atual */}
                            <div className="text-right">
                              {selected ? (
                                <span className="inline-flex items-center justify-center min-w-[44px] h-9 px-2 rounded-lg bg-white text-base font-extrabold shadow-sm" style={{ color: "#1B2A4A" }}>
                                  {selected}
                                </span>
                              ) : (
                                <span className="text-white/60 text-[11px] italic">a definir</span>
                              )}
                            </div>
                          </div>

                          {/* Grade de chips */}
                          <div className="p-3">
                            <div className="flex flex-wrap gap-2">
                              {card.opts.map((t) => {
                                const isOn = selected.toUpperCase() === t.toUpperCase();
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    aria-pressed={isOn}
                                    onClick={() => set(card.key as any, isOn ? "" : t)}
                                    className={`min-w-[42px] h-9 px-2.5 rounded-lg border-2 text-sm font-semibold transition-all duration-150 ${isOn ? card.chipOn : card.chipOff}`}
                                  >
                                    {t}
                                  </button>
                                );
                              })}
                            </div>
                            {/* Limpar */}
                            <button
                              type="button"
                              onClick={() => set(card.key as any, "")}
                              disabled={!selected}
                              className={`mt-3 inline-flex items-center gap-1 text-[11px] font-medium transition-colors ${selected ? `${card.accentText} hover:underline` : "text-muted-foreground/40 cursor-not-allowed"}`}
                            >
                              <XIcon className="h-3 w-3" /> Limpar / Não informado
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Resumo da seleção */}
                  <div className="px-4 py-3 bg-background border-t flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground mr-1">Resumo:</span>
                    {EPI_CARDS.map((card) => {
                      const v = ((form as any)[card.key] || "").toString();
                      return (
                        <span
                          key={card.key}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${v ? card.ring + " " + card.accentText : "border-dashed border-muted-foreground/30 text-muted-foreground/60"}`}
                        >
                          <span>{card.emoji}</span>
                          {card.label}: <strong>{v || "—"}</strong>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ===== ABA BANCÁRIO ===== */}
            <TabsContent value="bancario" className="pt-4">
              <div className="space-y-5">
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3">Conta para Recebimento (Folha/Vale)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Banco</Label>
                      <Select value={form.banco || "none"} onValueChange={v => set("banco", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione o banco</SelectItem>
                          <SelectItem value="Caixa">Caixa Econômica Federal</SelectItem>
                          <SelectItem value="Santander">Santander</SelectItem>
                          <SelectItem value="Bradesco">Bradesco</SelectItem>
                          <SelectItem value="Itau">Itaú</SelectItem>
                          <SelectItem value="BB">Banco do Brasil</SelectItem>
                          <SelectItem value="Nubank">Nubank</SelectItem>
                          <SelectItem value="Inter">Inter</SelectItem>
                          <SelectItem value="C6">C6 Bank</SelectItem>
                          <SelectItem value="Outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.banco === "Outro" ? (
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground">Nome do Banco</Label>
                        <Input value={form.bancoNome ?? ""} onChange={e => set("bancoNome", e.target.value)} className="bg-input mt-1" />
                      </div>
                    ) : null}
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Agência</Label>
                      <Input value={form.agencia ?? ""} onChange={e => set("agencia", e.target.value)} className="bg-input mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Conta</Label>
                      <Input value={form.conta ?? ""} onChange={e => set("conta", e.target.value)} className="bg-input mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Tipo de Conta</Label>
                      <Select value={form.tipoConta || "none"} onValueChange={v => set("tipoConta", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          <SelectItem value="Corrente">Corrente</SelectItem>
                          <SelectItem value="Poupanca">Poupança</SelectItem>
                          <SelectItem value="Salario">Conta Salário</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3">Dados PIX</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Tipo de Chave PIX</Label>
                      <Select value={form.tipoChavePix || "none"} onValueChange={v => set("tipoChavePix", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          <SelectItem value="CPF">CPF</SelectItem>
                          <SelectItem value="Celular">Celular</SelectItem>
                          <SelectItem value="Email">E-mail</SelectItem>
                          <SelectItem value="Aleatoria">Chave Aleatória</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Chave PIX</Label>
                      <Input value={form.chavePix ?? ""} onChange={e => set("chavePix", e.target.value)} placeholder="Informe a chave PIX" className="bg-input mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Banco do PIX (se diferente)</Label>
                      <Input value={form.bancoPix ?? ""} onChange={e => set("bancoPix", e.target.value)} placeholder="Ex: Nubank, Inter..." className="bg-input mt-1" />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3">Conta da Empresa para Pagamento</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Conta Bancária da Empresa</Label>
                      <Select value={String(form.contaBancariaEmpresaId || "none")} onValueChange={v => set("contaBancariaEmpresaId", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma (não definida)</SelectItem>
                          {contasAtivas.map((c: any) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.banco} — Ag: {c.agencia} / Cc: {c.conta}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">Define por qual conta da construtora este colaborador será pago</p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ===== ABA BENEFÍCIOS (VT, VA/VR, Farmácia, Plano Saúde) ===== */}
            <TabsContent value="beneficios" className="pt-4">
              <div className="space-y-5">
                {/* Vale Transporte */}
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">🚌 Vale Transporte (VT)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Recebe VT?</Label>
                      <Select value={form.vtRecebe || "none"} onValueChange={v => set("vtRecebe", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          <SelectItem value="sim">Sim</SelectItem>
                          <SelectItem value="nao">Não</SelectItem>
                          <SelectItem value="optou_nao">Optou por não receber</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Valor VT Diário (R$)</Label>
                      <Input value={form.vtValorDiario ?? ""} onChange={e => set("vtValorDiario", e.target.value)} className="bg-input mt-1" placeholder="0,00" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Tipo VT</Label>
                      <Select value={form.vtTipo || "none"} onValueChange={v => set("vtTipo", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          <SelectItem value="bilhete_unico">Bilhete Único</SelectItem>
                          <SelectItem value="cartao_empresa">Cartão Empresa</SelectItem>
                          <SelectItem value="dinheiro">Dinheiro</SelectItem>
                          <SelectItem value="pix">PIX</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Operadora VT</Label>
                      <Input value={form.vtOperadora ?? ""} onChange={e => set("vtOperadora", e.target.value)} className="bg-input mt-1" placeholder="Ex: SPTrans, BOM" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Nº Cartão VT</Label>
                      <Input value={form.vtNumeroCartao ?? ""} onChange={e => set("vtNumeroCartao", e.target.value)} className="bg-input mt-1" />
                    </div>
                  </div>
                </div>

                {/* Vale Alimentação / Refeição */}
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">🍽️ Vale Alimentação / Refeição</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Recebe VA/VR?</Label>
                      <Select value={form.vaRecebe || "none"} onValueChange={v => set("vaRecebe", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          <SelectItem value="va">VA (Alimentação)</SelectItem>
                          <SelectItem value="vr">VR (Refeição)</SelectItem>
                          <SelectItem value="ambos">VA + VR</SelectItem>
                          <SelectItem value="nao">Não recebe</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Valor VA/VR Mensal (R$)</Label>
                      <Input value={form.vaValor ?? ""} onChange={e => set("vaValor", e.target.value)} className="bg-input mt-1" placeholder="0,00" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Operadora VA/VR</Label>
                      <Input value={form.vaOperadora ?? ""} onChange={e => set("vaOperadora", e.target.value)} className="bg-input mt-1" placeholder="Ex: Alelo, Sodexo, VR" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Nº Cartão VA/VR</Label>
                      <Input value={form.vaNumeroCartao ?? ""} onChange={e => set("vaNumeroCartao", e.target.value)} className="bg-input mt-1" />
                    </div>
                  </div>
                </div>

                {/* Outros Benefícios */}
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">🎁 Outros Benefícios</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Auxílio Farmácia</Label>
                      <Select value={form.auxFarmacia || "none"} onValueChange={v => set("auxFarmacia", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          <SelectItem value="sim">Sim</SelectItem>
                          <SelectItem value="nao">Não</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.auxFarmacia === "sim" && (
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground">Valor Farmácia (R$)</Label>
                        <Input value={form.auxFarmaciaValor ?? ""} onChange={e => set("auxFarmaciaValor", e.target.value)} className="bg-input mt-1" placeholder="0,00" />
                      </div>
                    )}
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Plano de Saúde</Label>
                      <Select value={form.planoSaude || "none"} onValueChange={v => set("planoSaude", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          <SelectItem value="sim">Sim</SelectItem>
                          <SelectItem value="nao">Não</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.planoSaude === "sim" && (
                      <>
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground">Operadora</Label>
                          <Input value={form.planoSaudeOperadora ?? ""} onChange={e => set("planoSaudeOperadora", e.target.value)} className="bg-input mt-1" placeholder="Ex: Unimed, Amil" />
                        </div>
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground">Valor Plano (R$)</Label>
                          <Input value={form.planoSaudeValor ?? ""} onChange={e => set("planoSaudeValor", e.target.value)} className="bg-input mt-1" placeholder="0,00" />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ===== ABA OBRIGAÇÕES LEGAIS (Pensão, Licença, Seguro de Vida) ===== */}
            <TabsContent value="obrigacoes" className="pt-4">
              <div className="space-y-5">
                {/* Dependentes IR */}
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">👥 Dependentes para IR</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Qtd. Dependentes</Label>
                      <Input type="number" min="0" max="20" value={form.dependentesIR ?? "0"} onChange={e => set("dependentesIR", e.target.value)} className="bg-input mt-1" placeholder="0" />
                      <p className="text-xs text-muted-foreground mt-1">Dedução de R$ 228,80 por dependente na base do IRRF</p>
                    </div>
                  </div>
                </div>

                {/* Pensão Alimentícia */}
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">⚖️ Pensão Alimentícia</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Possui Pensão?</Label>
                      <Select value={form.pensaoAlimenticia || "none"} onValueChange={v => set("pensaoAlimenticia", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          <SelectItem value="sim">Sim</SelectItem>
                          <SelectItem value="nao">Não</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.pensaoAlimenticia === "sim" && (
                      <>
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground">Tipo de Pensão</Label>
                          <Select value={form.pensaoTipo || "none"} onValueChange={v => set("pensaoTipo", v === "none" ? "" : v)}>
                            <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Selecione</SelectItem>
                              <SelectItem value="percentual">Percentual do Salário</SelectItem>
                              <SelectItem value="valor_fixo">Valor Fixo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground">{form.pensaoTipo === 'percentual' ? 'Percentual (%)' : 'Valor (R$)'}</Label>
                          <Input value={form.pensaoValor ?? ""} onChange={e => set("pensaoValor", e.target.value)} className="bg-input mt-1" placeholder="0,00" />
                        </div>
                        {form.pensaoTipo === 'percentual' && (
                          <div>
                            <Label className="text-xs font-medium text-muted-foreground">Base do Percentual</Label>
                            <Select value={form.pensaoBase || "salario_bruto"} onValueChange={v => set("pensaoBase", v)}>
                              <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="salario_bruto">Salário Bruto do mês (inclui HE/Ad. Noturno)</SelectItem>
                                <SelectItem value="salario_minimo">Salário Mínimo Vigente</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              {form.pensaoBase === 'salario_minimo'
                                ? 'Calcula sobre o salário mínimo (valor fixo, atualizado anualmente)'
                                : 'Calcula sobre o bruto real do mês (varia conforme HE/faltas)'}
                            </p>
                          </div>
                        )}
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground">Nº Processo Judicial</Label>
                          <Input value={form.pensaoProcesso ?? ""} onChange={e => set("pensaoProcesso", e.target.value)} className="bg-input mt-1" />
                        </div>
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground">Beneficiário</Label>
                          <Input value={form.pensaoBeneficiario ?? ""} onChange={e => set("pensaoBeneficiario", e.target.value)} className="bg-input mt-1" />
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4 mt-1">
                          <Label className="text-xs font-medium text-muted-foreground block mb-2">Incidência da Pensão (conforme decisão judicial)</Label>
                          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={form.pensaoIncideFerias !== false && form.pensaoIncideFerias !== 0}
                                onChange={e => set("pensaoIncideFerias", e.target.checked)}
                                className="h-4 w-4 accent-primary"
                              />
                              <span>Desconta de <strong>Férias</strong> (incl. 1/3 constitucional)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={form.pensaoIncideDecimoTerceiro !== false && form.pensaoIncideDecimoTerceiro !== 0}
                                onChange={e => set("pensaoIncideDecimoTerceiro", e.target.checked)}
                                className="h-4 w-4 accent-primary"
                              />
                              <span>Desconta de <strong>13º Salário</strong></span>
                            </label>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Padrão: ambos marcados (regra geral). Desmarque conforme o que constar na sentença/acordo judicial deste funcionário.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Licença Maternidade / Paternidade */}
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">👶 Licença Maternidade / Paternidade</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Em Licença?</Label>
                      <Select value={form.licencaMaternidade || "none"} onValueChange={v => set("licencaMaternidade", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          <SelectItem value="sim">Sim</SelectItem>
                          <SelectItem value="nao">Não</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.licencaMaternidade === "sim" && (
                      <>
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground">Tipo</Label>
                          <Select value={form.licencaTipo || "none"} onValueChange={v => set("licencaTipo", v === "none" ? "" : v)}>
                            <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Selecione</SelectItem>
                              <SelectItem value="maternidade_120">Maternidade 120 dias (CLT Art. 392)</SelectItem>
                              <SelectItem value="maternidade_180">Maternidade 180 dias (Empresa Cidadã)</SelectItem>
                              <SelectItem value="paternidade_5">Paternidade 5 dias (CF Art. 7º XIX)</SelectItem>
                              <SelectItem value="paternidade_20">Paternidade 20 dias (Empresa Cidadã)</SelectItem>
                              <SelectItem value="adocao">Adoção (CLT Art. 392-A)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground">Data Início</Label>
                          <Input type="date" value={form.licencaDataInicio ?? ""} onChange={e => set("licencaDataInicio", e.target.value)} className="bg-input mt-1" />
                        </div>
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground">Data Fim Prevista</Label>
                          <Input type="date" value={form.licencaDataFim ?? ""} onChange={e => set("licencaDataFim", e.target.value)} className="bg-input mt-1" />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Seguro de Vida */}
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">🛡️ Seguro de Vida</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Possui Seguro de Vida?</Label>
                      <Select value={form.seguroVida || "none"} onValueChange={v => set("seguroVida", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          <SelectItem value="sim">Sim</SelectItem>
                          <SelectItem value="nao">Não</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.seguroVida === "sim" && (
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground">Valor Seguro (R$)</Label>
                        <Input value={form.seguroVidaValor ?? ""} onChange={e => set("seguroVidaValor", e.target.value)} className="bg-input mt-1" placeholder="0,00" />
                      </div>
                    )}
                  </div>
                </div>


              </div>
            </TabsContent>

            {/* ===== ABA SINDICAL (Sindicato, CCT, Dissídio) ===== */}
            <TabsContent value="sindical" className="pt-4">
              <div className="space-y-5">
                {/* Sindicato */}
                <div>
                  <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">🏛️ Sindicato e Convenção Coletiva</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Sindicato</Label>
                      <Input value={form.sindicato ?? ""} onChange={e => set("sindicato", e.target.value)} className="bg-input mt-1" placeholder="Ex: SINTRACON-SP" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Convenção Coletiva (CCT)</Label>
                      <Input value={form.convencaoColetiva ?? ""} onChange={e => set("convencaoColetiva", e.target.value)} className="bg-input mt-1" placeholder="Nº ou referência da CCT" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Contribuição Sindical</Label>
                      <Select value={form.contribuicaoSindical || "none"} onValueChange={v => set("contribuicaoSindical", v === "none" ? "" : v)}>
                        <SelectTrigger className="bg-input mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione</SelectItem>
                          <SelectItem value="sim">Sim — Autorizado pelo funcionário</SelectItem>
                          <SelectItem value="nao">Não — Sem autorização</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">Reforma Trabalhista (Lei 13.467/2017): contribuição sindical é facultativa</span>
                    </div>
                    {form.contribuicaoSindical === "sim" && (
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground">Valor Contribuição (R$)</Label>
                        <Input value={form.contribuicaoSindicalValor ?? ""} onChange={e => set("contribuicaoSindicalValor", e.target.value)} className="bg-input mt-1" placeholder="0,00" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Dissídio removido — agora é gerenciado em Configurações > Sindical */}
              </div>
            </TabsContent>

            {editingId && (
              <TabsContent value="hist_status" className="pt-4">
                <HistoricoStatusTab employeeId={editingId} companyId={selectedCompany} />
              </TabsContent>
            )}
            {editingId && (
              <TabsContent value="hist_alteracoes" className="pt-4">
                <HistoricoAlteracoesTab employeeId={editingId} />
              </TabsContent>
            )}
          </Tabs>

          {/* Observações */}
          <div className="pt-2">
            <Label className="text-xs font-medium text-muted-foreground">Observações</Label>
            <textarea
              value={form.observacoes ?? ""}
              onChange={e => set("observacoes", e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring mt-1"
            />
          </div>

          {/* Bloco de Desligamento (visível quando status = Desligado) */}
          {form.status === "Desligado" && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="text-sm font-bold text-red-800 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Dados do Desligamento
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs font-medium text-red-700">Categoria do Desligamento *</Label>
                  <Select value={form.categoriaDesligamento || "none"} onValueChange={v => set("categoriaDesligamento", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-white mt-1 border-red-300"><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione...</SelectItem>
                      <SelectItem value="Término de contrato">Término de contrato</SelectItem>
                      <SelectItem value="Fim do período de experiência">Fim do período de experiência (Art. 479/480 CLT)</SelectItem>
                      <SelectItem value="Rescisão antecipada - empregador">Rescisão antecipada pelo empregador (Art. 479 CLT)</SelectItem>
                      <SelectItem value="Rescisão antecipada - empregado">Rescisão antecipada pelo empregado (Art. 480 CLT)</SelectItem>
                      <SelectItem value="Justa causa">Justa causa</SelectItem>
                      <SelectItem value="Pedido de demissão">Pedido de demissão</SelectItem>
                      <SelectItem value="Acordo mútuo">Acordo mútuo (Art. 484-A CLT)</SelectItem>
                      <SelectItem value="Fim de obra">Fim de obra</SelectItem>
                      <SelectItem value="Baixo desempenho">Baixo desempenho</SelectItem>
                      <SelectItem value="Indisciplina">Indisciplina</SelectItem>
                      <SelectItem value="Outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-red-700">Data Efetiva do Desligamento *</Label>
                  <Input type="date" value={form.dataDesligamentoEfetiva ?? new Date().toISOString().split("T")[0]} onChange={e => set("dataDesligamentoEfetiva", e.target.value)} className="bg-white mt-1 border-red-300" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-red-700">Data Demissão (Registro)</Label>
                  <Input type="date" value={form.dataDemissao ?? new Date().toISOString().split("T")[0]} onChange={e => set("dataDemissao", e.target.value)} className="bg-white mt-1 border-red-300" />
                </div>
              </div>
              {/* Alerta CLT para rescisão em período de experiência */}
              {(form.categoriaDesligamento?.includes("Rescisão antecipada") || form.categoriaDesligamento?.includes("Fim do período de experiência")) && (
                <div className="mt-3 bg-amber-50 border border-amber-300 rounded-lg p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-800 mb-1">Atenção — Direitos na Rescisão em Período de Experiência</p>
                      {form.categoriaDesligamento === "Fim do período de experiência" && (
                        <div className="text-amber-700 space-y-1">
                          <p><strong>Art. 479/480 CLT</strong> — Término normal do contrato de experiência.</p>
                          <p>Direitos: Saldo de salário + 13º proporcional + Férias proporcionais + 1/3 + Saque FGTS (sem multa 40%).</p>
                          <p className="text-xs">Não há aviso prévio nem multa do Art. 479.</p>
                        </div>
                      )}
                      {form.categoriaDesligamento === "Rescisão antecipada - empregador" && (
                        <div className="text-amber-700 space-y-1">
                          <p><strong>Art. 479 CLT</strong> — Rescisão antecipada pelo empregador.</p>
                          <p>Direitos: Saldo de salário + 13º proporcional + Férias proporcionais + 1/3 + FGTS + Multa 40% FGTS + <strong>Indenização Art. 479</strong> (metade dos dias restantes).</p>
                          {(() => {
                            const fim2 = (form as any).experienciaFim2;
                            const dataDesl = form.dataDesligamentoEfetiva;
                            if (fim2 && dataDesl) {
                              const diasRestantes = Math.max(0, Math.ceil((new Date(fim2 + 'T12:00:00').getTime() - new Date(dataDesl + 'T12:00:00').getTime()) / 86400000));
                              return diasRestantes > 0 ? (
                                <p className="font-bold text-red-700">Dias restantes do contrato: {diasRestantes} → Indenização = {Math.ceil(diasRestantes / 2)} dia(s) de salário</p>
                              ) : null;
                            }
                            return null;
                          })()}
                        </div>
                      )}
                      {form.categoriaDesligamento === "Rescisão antecipada - empregado" && (
                        <div className="text-amber-700 space-y-1">
                          <p><strong>Art. 480 CLT</strong> — Rescisão antecipada pelo empregado.</p>
                          <p>Direitos: Saldo de salário + 13º proporcional + Férias proporcionais + 1/3.</p>
                          <p>O empregado <strong>pode ser obrigado a indenizar</strong> o empregador (Art. 480, §1º), limitado ao que o empregador teria direito (Art. 479).</p>
                          <p className="text-xs">Sem saque FGTS, sem multa 40%.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div className="mt-3">
                <Label className="text-xs font-medium text-red-700">Motivo Detalhado do Desligamento {form.listaNegra === "1" && <span className="text-red-500">*</span>}</Label>
                <textarea
                  value={form.motivoDesligamento ?? ""}
                  onChange={e => set("motivoDesligamento", e.target.value)}
                  rows={3}
                  placeholder="Opcional — descreva o motivo do desligamento (obrigatório apenas se incluir na Blacklist)"
                  className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 mt-1"
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Checkbox
                  id="listaNegra"
                  checked={form.listaNegra === "1"}
                  onCheckedChange={(checked) => set("listaNegra", checked ? "1" : "0")}
                />
                <Label htmlFor="listaNegra" className="text-xs font-medium text-red-700 cursor-pointer">
                  Incluir na Blacklist (não recontratar)
                </Label>
              </div>
              {form.listaNegra === "1" && (
                <div className="mt-2">
                  <Label className="text-xs font-medium text-red-700">Motivo da Blacklist *</Label>
                  <textarea
                    value={form.motivoListaNegra ?? ""}
                    onChange={e => set("motivoListaNegra", e.target.value)}
                    rows={2}
                    placeholder="Descreva por que este funcionário não poderá ser recontratado (obrigatório)..."
                    className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 mt-1"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              className={recontratacaoMode ? "bg-lime-600 hover:bg-lime-700 text-white" : ""}
              disabled={createMut.isPending || updateMut.isPending || criarSolicitacaoMut.isPending || (!editingId && !!cpfDuplicateAlert)}
            >
              {criarSolicitacaoMut.isPending
                ? "Enviando..."
                : createMut.isPending || updateMut.isPending
                  ? "Salvando..."
                  : recontratacaoMode
                    ? "Enviar para liberação do sócio"
                    : "Salvar"}
            </Button>
          </div>
      </FullScreenDialog>

      {/* Recontratação — seletor do vínculo anterior + blocos a copiar */}
      <Dialog open={recontratacaoPickerOpen} onOpenChange={setRecontratacaoPickerOpen}>
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-x-hidden overflow-y-auto p-0 gap-0">
          {/* Cabeçalho com faixa âmbar */}
          <DialogHeader className="space-y-1.5 border-b bg-gradient-to-br from-amber-50 to-orange-50 px-6 py-5 dark:from-amber-950/30 dark:to-orange-950/20">
            <DialogTitle className="flex items-center gap-2.5 text-lg">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-800">
                <RefreshCw className="h-5 w-5" />
              </span>
              Iniciar recontratação
            </DialogTitle>
            <DialogDescription className="text-sm">
              Escolha o vínculo anterior e os blocos a reaproveitar. <span className="font-medium text-foreground/80">Salário, função, cargo e obra</span> são sempre preenchidos do zero.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 px-6 py-5">
            {/* Vínculo anterior */}
            <section>
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-white">1</span>
                <Label className="text-sm font-semibold">Vínculo anterior</Label>
              </div>
              <div className="space-y-2">
                {recontratacaoVinculos.map((v: any) => {
                  const ativo = pickedVinculo?.employeeId === v.employeeId;
                  return (
                    <button
                      key={v.employeeId}
                      type="button"
                      onClick={() => setRecontratacaoPickEmployeeId(v.employeeId)}
                      className={`relative w-full overflow-hidden rounded-xl border p-3.5 text-left transition-all ${ativo ? "border-amber-500 bg-amber-500/10 shadow-sm ring-1 ring-amber-500/30" : "border-border hover:border-amber-300 hover:bg-muted/40"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-semibold text-sm">{v.nomeCompleto}</span>
                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{v.codigoInterno || "s/ código"}</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{v.companyNome}</p>
                        </div>
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${ativo ? "border-amber-500 bg-amber-500 text-white" : "border-muted-foreground/30"}`}>
                          {ativo ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Wrench className="h-3 w-3" /> {v.funcaoAnterior || "—"}</span>
                        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Desligado em {v.dataDesligamento ? new Date(v.dataDesligamento).toLocaleDateString("pt-BR") : "—"}</span>
                        {v.diasFora != null ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {v.diasFora} dias fora</span> : null}
                      </div>
                      {v.alertaJuridico ? (
                        <div className={`mt-2 flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium ${v.experienciaPermitida ? "bg-amber-100/70 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" : "bg-red-100/70 text-red-700 dark:bg-red-900/30 dark:text-red-300"}`}>
                          <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="break-words">{v.alertaJuridico}</span>
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Blocos a copiar */}
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lime-600 text-[11px] font-bold text-white">2</span>
                  <Label className="text-sm font-semibold">Blocos a copiar</Label>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <button type="button" onClick={() => setBlocosCopiados(BLOCOS_RECONTRATACAO.map(b => b.key))} className="rounded px-1.5 py-0.5 font-medium text-lime-700 hover:bg-lime-500/10 dark:text-lime-400">Selecionar tudo</button>
                  <span className="text-muted-foreground/40">·</span>
                  <button type="button" onClick={() => setBlocosCopiados([])} className="rounded px-1.5 py-0.5 font-medium text-muted-foreground hover:bg-muted">Limpar</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {BLOCOS_RECONTRATACAO.map(b => {
                  const checked = blocosCopiados.includes(b.key);
                  const Icon = b.icon;
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setBlocosCopiados(prev => prev.includes(b.key) ? prev.filter(k => k !== b.key) : [...prev, b.key])}
                      className={`group relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all ${checked ? "border-lime-500 bg-lime-500/10 shadow-sm" : "border-border hover:border-lime-300 hover:bg-muted/40"}`}
                    >
                      <span className={`absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full border transition ${checked ? "border-lime-500 bg-lime-500 text-white" : "border-muted-foreground/30 group-hover:border-lime-400"}`}>
                        {checked ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${checked ? "bg-lime-500/20 text-lime-700 dark:text-lime-400" : "bg-muted text-muted-foreground"}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-medium leading-tight">{b.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                Documentos do colaborador devem ser sempre revalidados após a recontratação.
              </p>
            </section>
          </div>

          <DialogFooter className="gap-2 border-t bg-muted/30 px-6 py-4">
            <Button variant="outline" onClick={() => setRecontratacaoPickerOpen(false)}>Cancelar</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={aplicarRecontratacao} disabled={!pickedVinculo || dadosCopia.isLoading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${dadosCopia.isLoading ? "animate-spin" : ""}`} />
              {dadosCopia.isLoading ? "Carregando..." : "Aplicar e preencher ficha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE CONFIRMAÇÃO DE DESLIGAMENTO */}
      <AlertDialog open={desligamentoDialogOpen} onOpenChange={setDesligamentoDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" /> Confirmar Desligamento
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              Você está alterando o status deste colaborador para <strong className="text-red-700">Desligado</strong>.
              <br /><br />
              Preencha os campos obrigatórios de desligamento (<strong>categoria</strong> e <strong>data</strong>) que aparecerão no formulário abaixo e clique em <strong>Salvar</strong>.
              <br /><br />
              <span className="text-xs">O motivo detalhado é opcional, exceto quando incluir na <strong>Blacklist</strong>.</span>
              <br /><br />
              <span className="text-xs text-muted-foreground">Esta ação será registrada na auditoria do sistema.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              set("status", previousStatus);
              setDesligamentoDialogOpen(false);
            }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => setDesligamentoDialogOpen(false)}
            >
              Preencher Dados de Desligamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============================================================ */}
      {/* VIEW DIALOG - FICHA DO COLABORADOR */}
      {/* ============================================================ */}
      <FullScreenDialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} title="Ficha do Colaborador" subtitle={viewingEmployee?.nomeCompleto || ""} icon={<Eye className="h-5 w-5 text-white" />}>
          {viewingEmployee ? (
            <div className="space-y-8">
              {/* Header */}
              <div className="flex items-center gap-6 pb-6 border-b-2 border-primary/20">
                <div
                  className={`w-[90px] h-[90px] rounded-full border-3 border-primary/40 overflow-hidden bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shrink-0 shadow-lg ${viewingEmployee.fotoUrl ? "cursor-pointer hover:ring-4 hover:ring-primary/30 transition-all" : ""}`}
                  onClick={() => viewingEmployee.fotoUrl && setFotoExpandida(viewingEmployee.fotoUrl)}
                  title={viewingEmployee.fotoUrl ? "Clique para ampliar a foto" : undefined}
                >
                  {viewingEmployee.fotoUrl ? (
                    <img src={viewingEmployee.fotoUrl} alt="Foto" className="w-full h-full object-cover object-top" />
                  ) : (
                    <span className="text-2xl font-bold text-primary">
                      {viewingEmployee.nomeCompleto?.charAt(0)}{viewingEmployee.nomeCompleto?.split(' ').pop()?.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold">{safeDisplay(viewingEmployee.nomeCompleto)}</h2>
                  <p className="text-base text-muted-foreground mt-1">
                    {safeDisplay(viewingEmployee.funcao)} · {safeDisplay(viewingEmployee.setor)}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    {(() => {
                      // Rev. 2206 — sigilo Aviso na ficha
                      const ds = maskedStatus(viewingEmployee.status);
                      return (
                        <span className={`text-sm font-medium px-3 py-1 rounded ${statusColors[ds] ?? ""}`}>
                          {statusLabels[ds] ?? ds}
                        </span>
                      );
                    })()}
                    <span className="text-sm text-muted-foreground">
                      Empresa: {getCompanyName(viewingEmployee.companyId)}
                    </span>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handlePrintFicha} className="gap-2 shrink-0">
                  <Printer className="h-4 w-4" /> Imprimir Ficha
                </Button>
              </div>

              {/* ALERTA BLACKLIST */}
              {viewingEmployee.status === "ListaNegra" ? (
                <div className="bg-red-600/10 border border-red-600/30 rounded-lg p-4 flex items-center gap-3">
                  <Ban className="h-6 w-6 text-red-600 shrink-0" />
                  <div>
                    <p className="font-bold text-red-600">FUNCIONÁRIO NA BLACKLIST</p>
                    <p className="text-sm text-red-500">Este funcionário está proibido de ser contratado novamente.</p>
                    {viewingEmployee.motivoListaNegra ? <p className="text-sm text-red-500 mt-1"><strong>Motivo:</strong> {safeDisplay(viewingEmployee.motivoListaNegra)}</p> : null}
                  </div>
                </div>
              ) : null}

              {/* Seções de dados */}
              {[
                { title: "Dados Pessoais", fields: [
                  ["CPF", formatCPF(viewingEmployee.cpf)],
                  ["RG", formatRG(viewingEmployee.rg)],
                  ["Nascimento", formatDate(viewingEmployee.dataNascimento)],
                  ["Sexo", viewingEmployee.sexo === "M" ? "Masculino" : viewingEmployee.sexo === "F" ? "Feminino" : safeDisplay(viewingEmployee.sexo)],
                  ["Estado Civil", safeDisplay(viewingEmployee.estadoCivil)],
                  ["Nacionalidade", safeDisplay(viewingEmployee.nacionalidade)],
                  ["Naturalidade", safeDisplay(viewingEmployee.naturalidade)],
                  ["Celular", formatTelefone(viewingEmployee.celular)],
                  ["E-mail", safeDisplay(viewingEmployee.email)],
                  ["Nome da Mãe", safeDisplay(viewingEmployee.nomeMae)],
                  ["Nome do Pai", safeDisplay(viewingEmployee.nomePai)],
                  ["Contato Emergência", safeDisplay(viewingEmployee.contatoEmergencia)],
                  ["Tel. Emergência", formatTelefone(viewingEmployee.telefoneEmergencia)],
                  ["Parentesco", safeDisplay(viewingEmployee.parentescoEmergencia)],
                ]},
                { title: "Profissional", fields: [
                  ["Cód. Interno (JFC)", viewingEmployee.codigoInterno ? `🔒 ${viewingEmployee.codigoInterno}` : "-"],
                 ["eSocial", safeDisplay(viewingEmployee.matricula)],
                   ["Função", safeDisplay(viewingEmployee.funcao)],
                  ["Setor", safeDisplay(viewingEmployee.setor)],
                  ["Admissão", formatDate(viewingEmployee.dataAdmissao)],
                  ["Contrato", safeDisplay(viewingEmployee.tipoContrato)],
                  ["Jornada", formatJornada(viewingEmployee.jornadaTrabalho)],
                  ["Salário Base", viewingEmployee.salarioBase ? formatMoeda(viewingEmployee.salarioBase) : "-"],
                  ["Valor da Hora", viewingEmployee.valorHora ? formatMoeda(viewingEmployee.valorHora) : "-"],
                  ["Horas/Mês", safeDisplay(viewingEmployee.horasMensais)],
                  ["Complemento Salarial", viewingEmployee.recebeComplemento ? `Sim — R$ ${viewingEmployee.valorComplemento || "0"}` : "Não"],
                  ["Acordo HE", viewingEmployee.acordoHoraExtra ? `Sim — ${viewingEmployee.heNormal50 ?? globalHE.heDiasUteis}% / ${viewingEmployee.he100 ?? globalHE.heDomingosFeriados}% / ${viewingEmployee.heNoturna ?? globalHE.heAdicionalNoturno}%` : `Padrão Empresa (${globalHE.heDiasUteis}/${globalHE.heDomingosFeriados}/${globalHE.heAdicionalNoturno}%)`],
                ]},
                { title: "Documentos", fields: [
                  ["CTPS", safeDisplay(viewingEmployee.ctps)],
                  ["Série CTPS", safeDisplay(viewingEmployee.serieCtps)],
                  ["PIS", formatPIS(viewingEmployee.pis)],
                  ["Título Eleitor", formatTituloEleitor(viewingEmployee.tituloEleitor)],
                  ["Reservista", safeDisplay(viewingEmployee.certificadoReservista)],
                  ["CNH", safeDisplay(viewingEmployee.cnh)],
                  ["Cat. CNH", safeDisplay(viewingEmployee.categoriaCnh)],
                  ["Val. CNH", formatDate(viewingEmployee.validadeCnh)],
                ]},
                { title: "Endereço", fields: [
                  ["Logradouro", safeDisplay(viewingEmployee.logradouro)],
                  ["Nº", safeDisplay(viewingEmployee.numero)],
                  ["Complemento", safeDisplay(viewingEmployee.complemento)],
                  ["Bairro", safeDisplay(viewingEmployee.bairro)],
                  ["Cidade/UF", `${viewingEmployee.cidade ?? ""}${viewingEmployee.estado ? " - " + viewingEmployee.estado : ""}` || "-"],
                  ["CEP", formatCEP(viewingEmployee.cep)],
                ]},
                { title: "Dados Bancários", fields: [
                  ["Banco", safeDisplay(viewingEmployee.banco)],
                  ["Agência", safeDisplay(viewingEmployee.agencia)],
                  ["Conta", safeDisplay(viewingEmployee.conta)],
                  ["Tipo Conta", safeDisplay(viewingEmployee.tipoConta)],
                  ["Tipo Chave PIX", safeDisplay(viewingEmployee.tipoChavePix)],
                  ["Chave PIX", safeDisplay(viewingEmployee.chavePix)],
                  ["Banco PIX", safeDisplay(viewingEmployee.bancoPix)],
                ]},
              ].map(section => (
                <div key={section.title}>
                  <h3 className="text-base font-semibold text-primary mb-4 pb-2 border-b-2 border-primary/20">{section.title}</h3>
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-4">
                    {section.fields.filter(([, v]) => v && v !== "-").map(([label, value]) => (
                      <div key={label as string} className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
                        <span className="text-sm font-semibold">{value as string}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {viewingEmployee.observacoes ? (
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-2">Observações</h3>
                  <p className="text-sm text-muted-foreground bg-secondary/30 rounded-lg p-3">{safeDisplay(viewingEmployee.observacoes)}</p>
                </div>
              ) : null}

              {/* HABILIDADES DO FUNCIONÁRIO */}
              {viewingEmployee?.id && <EmployeeSkillsSection employeeId={viewingEmployee.id} />}

              {/* HISTÓRICOS */}
              {/* Seções SST removidas - módulos não fazem parte do escopo */}
            </div>
          ) : null}
      </FullScreenDialog>
      {/* ============================================================ */}
      {/* IMPORT EXCEL DIALOG */}
      {/* ============================================================ */}
      <FullScreenDialog open={importDialogOpen} onClose={() => { setImportDialogOpen(false); setImportFile(null); setImportResult(null); }} title="Importar Colaboradores via Excel" icon={<Upload className="h-5 w-5 text-white" />}>
        <div className="w-full">
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-300 mb-2">
                <strong>Como funciona:</strong> Baixe a planilha modelo, preencha os dados dos colaboradores e faça o upload.
              </p>
              <Button variant="outline" size="sm" className="gap-2" onClick={async () => {
                try {
                  const res = await fetch(`/api/trpc/import.downloadTemplate?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`, { credentials: 'include' });
                  const json = await res.json();
                  const b64 = json?.result?.data?.json?.base64;
                  if (!b64) { toast.error("Erro ao gerar planilha"); return; }
                  const bin = atob(b64);
                  const arr = new Uint8Array(bin.length);
                  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                  const blob = new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = "modelo_colaboradores.xlsx"; a.click();
                  URL.revokeObjectURL(url);
                } catch { toast.error("Erro ao baixar planilha"); }
              }}>
                <Download className="h-4 w-4" /> Baixar Planilha Modelo
              </Button>
            </div>

            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                id="excel-upload"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setImportFile(file);
                }}
              />
              <label htmlFor="excel-upload" className="cursor-pointer">
                <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium">{importFile ? importFile.name : "Clique para selecionar o arquivo Excel"}</p>
                <p className="text-xs text-muted-foreground mt-1">Formatos aceitos: .xlsx, .xls</p>
              </label>
            </div>

            {importResult && (
              <div className={`rounded-lg p-4 ${importResult.errors?.length > 0 ? 'bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800' : 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'}`}>
                <p className="text-sm font-semibold mb-2">
                  Importados: {importResult.imported ?? 0} | Erros: {importResult.errors?.length ?? 0}
                </p>
                {importResult.errors?.length > 0 && (
                  <div className="max-h-40 overflow-y-auto">
                    {importResult.errors.map((err: any, i: number) => (
                      <p key={i} className="text-xs text-red-600 dark:text-red-400">Linha {err.row}: {err.error}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Fechar</Button>
            <Button
              disabled={!importFile || importing}
              onClick={async () => {
                if (!importFile || !companyId) return;
                setImporting(true);
                try {
                  const reader = new FileReader();
                  reader.onload = async (e) => {
                    try {
                      const base64 = (e.target?.result as string).split(',')[1];
                      const res = await fetch('/api/trpc/import.uploadExcel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ json: { companyId, fileBase64: base64, fileName: importFile.name } }),
                      });
                      const json = await res.json();
                      if (json?.error) {
                        const errMsg = json.error?.json?.message || json.error?.message || 'Erro desconhecido';
                        toast.error('Erro ao importar: ' + errMsg);
                        setImporting(false);
                        return;
                      }
                      const result = json?.result?.data?.json ?? json?.result?.data ?? json;
                      setImportResult(result);
                      if (result.imported > 0) {
                        toast.success(`${result.imported} colaborador(es) importado(s)!`);
                        utils.employees.list.invalidate();
                        utils.employees.stats.invalidate();
                      } else if (result.errors?.length > 0) {
                        toast.error(`${result.errors.length} erro(s) encontrado(s) na importação`);
                      }
                    } catch (err: any) {
                      toast.error('Erro ao importar: ' + err.message);
                    } finally {
                      setImporting(false);
                    }
                  };
                  reader.readAsDataURL(importFile);
                } catch (err: any) {
                  toast.error('Erro ao ler arquivo: ' + err.message);
                  setImporting(false);
                }
              }}
            >
              {importing ? "Importando..." : "Importar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>
       <RaioXFuncionario employeeId={raioXEmployeeId} open={!!raioXEmployeeId} onClose={() => setRaioXEmployeeId(null)} />
          <PrintFooterLGPD />

      {fotoExpandida && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setFotoExpandida(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh] animate-in zoom-in-95 duration-200">
            <img
              src={fotoExpandida}
              alt="Foto do colaborador"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={() => setFotoExpandida(null)}
              className="absolute -top-3 -right-3 bg-white rounded-full p-1.5 shadow-lg hover:bg-gray-100 transition-colors"
            >
              <XIcon className="h-5 w-5 text-gray-700" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
              {viewingEmployee?.nomeCompleto || "Colaborador"}
            </div>
          </div>
        </div>
      )}

      {/* FCSign — modal de envio para assinatura digital (Rev. 2104) */}
      {fcsignPayload && (
        <FCSignSendDialog
          open={fcsignOpen}
          onOpenChange={(v) => {
            setFcsignOpen(v);
            if (!v) {
              setFcsignPayload(null);
              // Rev. 2122 — ao fechar dialog, invalida status FCSign p/ painel refletir
              utils.signatures.getForEmployeeTipo.invalidate();
              utils.signatures.listByEmployee.invalidate();
            }
          }}
          companyId={fcsignPayload.companyId}
          employeeId={fcsignPayload.employeeId}
          tipo={fcsignPayload.tipo}
          documentTitle={fcsignPayload.documentTitle}
          documentHtml={fcsignPayload.documentHtml}
          empregadoNome={fcsignPayload.empregadoNome}
          empregadoCpf={fcsignPayload.empregadoCpf}
        />
      )}

      {/* Rev. 2146 — TermoResponsabilidadeDialog movido pra
          TermosResponsabilidadePanel (Controle de Documentos). */}
    </DashboardLayout>
  );
}
// ===== Document Upload Section Component =====
function DocumentUploadSection({ employeeId, companyId }: { employeeId: number; companyId: number }) {
  const [uploading, setUploading] = useState(false);
  const TIPOS_DOC: { label: string; value: 'rg'|'cnh'|'ctps'|'comprovante_residencia'|'certidao_nascimento'|'titulo_eleitor'|'reservista'|'pis'|'foto_3x4'|'contrato_trabalho'|'termo_rescisao'|'atestado_medico'|'diploma'|'certificado'|'outros' }[] = [
    { label: 'RG', value: 'rg' },
    { label: 'CNH', value: 'cnh' },
    { label: 'CTPS', value: 'ctps' },
    { label: 'PIS', value: 'pis' },
    { label: 'Título Eleitor', value: 'titulo_eleitor' },
    { label: 'Reservista', value: 'reservista' },
    { label: 'Comp. Residência', value: 'comprovante_residencia' },
    { label: 'Certidão Nasc.', value: 'certidao_nascimento' },
    { label: 'Foto 3x4', value: 'foto_3x4' },
    { label: 'Contrato Trabalho', value: 'contrato_trabalho' },
    { label: 'Termo Rescisão', value: 'termo_rescisao' },
    { label: 'Atestado Médico', value: 'atestado_medico' },
    { label: 'Diploma', value: 'diploma' },
    { label: 'Certificado', value: 'certificado' },
    { label: 'Outros', value: 'outros' },
  ];

  const { data: docs, refetch } = trpc.employeeDocuments.listar.useQuery(
    { employeeId, companyId },
    { enabled: employeeId > 0 }
  );

  // Rev. 2683 — Documentos que JÁ TÊM assinatura digital (FCSign) não precisam
  // de upload manual. Buscamos as sessões FCSign do colaborador e exibimos as
  // CONCLUÍDAS num bloco próprio (read-only, com "Ver"); o slot de upload
  // correspondente fica marcado como "Assinado digitalmente".
  const { data: fcSessions } = trpc.signatures.listByEmployee.useQuery(
    { companyId, employeeId },
    { enabled: employeeId > 0 && companyId > 0 }
  );

  const uploadMut = trpc.employeeDocuments.upload.useMutation({
    onSuccess: () => { toast.success('Documento enviado!'); refetch(); setUploading(false); },
    onError: (e: any) => { toast.error(e.message || 'Erro ao enviar'); setUploading(false); },
  });

  const excluirMut = trpc.employeeDocuments.excluir.useMutation({
    onSuccess: () => { toast.success('Documento excluído'); refetch(); },
    onError: (e: any) => toast.error(e.message || 'Erro ao excluir'),
  });

  const handleUpload = (tipoDoc: typeof TIPOS_DOC[number]['value']) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*,.pdf';
    inp.multiple = true;
    inp.onchange = async (e: any) => {
      const files = Array.from(e.target.files || []) as File[];
      if (!files.length) return;
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name}: Arquivo muito grande (máx 10MB)`); continue; }
        setUploading(true);
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = (ev.target?.result as string).split(',')[1];
          uploadMut.mutate({
            employeeId,
            companyId,
            tipo: tipoDoc,
            nome: file.name,
            fileBase64: base64,
            mimeType: file.type,
            fileSize: file.size,
          });
        };
        reader.readAsDataURL(file);
      }
    };
    inp.click();
  };

  // Rótulo humano dos tipos FCSign + mapa FCSign→slot de upload coberto.
  const FCSIGN_LABELS: Record<string, string> = {
    contrato_experiencia: 'Contrato de Experiência',
    termo_art62: 'Termo de Isenção de Jornada (Art. 62 CLT)',
    termo_responsabilidade: 'Termo de Responsabilidade',
    aviso_previo: 'Aviso Prévio',
    advertencia: 'Advertência',
  };
  const fcsignLabel = (tipo: string, title?: string | null) => FCSIGN_LABELS[tipo] || title || 'Documento assinado';
  // FCSign tipo → slot de upload que ele "cobre" (dispensa o upload manual).
  const FCSIGN_COBRE_SLOT: Record<string, string> = { contrato_experiencia: 'contrato_trabalho' };

  // Sessões FCSign concluídas (com documento final) — fonte da verdade.
  const assinados = useMemo(
    () => (fcSessions || []).filter((s: any) => s.status === 'completo' && s.finalDocumentUrl),
    [fcSessions]
  );
  // Slots de upload cobertos por um FCSign concluído.
  const slotsCobertos = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of assinados) {
      const slot = FCSIGN_COBRE_SLOT[s.tipo];
      if (slot && !m.has(slot)) m.set(slot, s);
    }
    return m;
  }, [assinados]);
  // Uploads manuais agrupados por tipo.
  const docsByTipo = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const d of (docs || []) as any[]) {
      const arr = m.get(d.tipo) || [];
      arr.push(d);
      m.set(d.tipo, arr);
    }
    return m;
  }, [docs]);

  const fmtDataBR = (v: any) => {
    if (!v) return null;
    try {
      const safe = typeof v === 'string' ? v.replace(' ', 'T') : v;
      const d = new Date(safe);
      return isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR');
    } catch { return null; }
  };

  // Rev. 2685 — ícone temático por tipo, p/ deixar a lista mais amigável.
  const DOC_ICONS: Record<string, any> = {
    foto_3x4: Camera,
    diploma: GraduationCap,
    certificado: Award,
    atestado_medico: HeartPulse,
    contrato_trabalho: FileText,
    termo_rescisao: FileText,
  };

  const totalEnviados = (docs || []).length;

  return (
    <div className="space-y-5">
      {/* ── Bloco A: já assinados digitalmente (FCSign) — sem upload ── */}
      {assinados.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-900 p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Assinados digitalmente (FCSign)</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">{assinados.length}</span>
          </div>
          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mb-3">
            Estes documentos já possuem assinatura digital válida — não é necessário fazer upload.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {assinados.map((s: any) => (
              <div key={s.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-emerald-950/30">
                <div className="shrink-0 w-8 h-8 rounded-md bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{fcsignLabel(s.tipo, s.documentTitle)}</div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    Assinado{fmtDataBR(s.completedAt) ? ` em ${fmtDataBR(s.completedAt)}` : ''}
                  </div>
                </div>
                <a
                  href={s.finalDocumentUrl}
                  target="_blank"
                  rel="noopener"
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
                >
                  <Eye className="w-3.5 h-3.5" /> Ver
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bloco B: upload manual — lista amigável de documentos por tipo ── */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Documentos digitalizados</span>
            {totalEnviados > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">{totalEnviados} enviado{totalEnviados > 1 ? 's' : ''}</span>
            )}
          </div>
          {uploading && <span className="text-xs text-blue-500 animate-pulse">Enviando documento(s)…</span>}
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">Anexe uma foto ou PDF de cada documento. Aceita imagens e PDF (até 10 MB).</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {TIPOS_DOC.map(tipo => {
            const enviados = docsByTipo.get(tipo.value) || [];
            const coberto = slotsCobertos.get(tipo.value);
            const Icon = DOC_ICONS[tipo.value] || FileText;
            const estado: 'assinado' | 'enviado' | 'pendente' = coberto ? 'assinado' : enviados.length > 0 ? 'enviado' : 'pendente';

            const iconWrap =
              estado === 'assinado'
                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400'
                : estado === 'enviado'
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500';

            return (
              <div
                key={tipo.value}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                  estado === 'pendente'
                    ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 hover:border-blue-300 hover:bg-blue-50/30 dark:hover:bg-blue-950/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40'
                }`}
              >
                {/* Ícone temático */}
                <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${iconWrap}`}>
                  {estado === 'assinado' ? <ShieldCheck className="w-[18px] h-[18px]" /> : <Icon className="w-[18px] h-[18px]" />}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Título + status */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{tipo.label}</span>
                    {estado === 'assinado' ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                        <ShieldCheck className="w-3 h-3" /> Assinado
                      </span>
                    ) : estado === 'enviado' ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                        <Check className="w-3 h-3" /> {enviados.length} arquivo{enviados.length > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">Pendente</span>
                    )}
                  </div>

                  {/* Coberto por assinatura digital */}
                  {coberto && (
                    <a
                      href={coberto.finalDocumentUrl}
                      target="_blank"
                      rel="noopener"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300 hover:underline"
                    >
                      <Eye className="w-3 h-3" /> Ver assinatura digital
                    </a>
                  )}

                  {/* Uploads manuais já enviados */}
                  {enviados.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {enviados.map((d: any) => {
                        const validade = fmtDataBR(d.dataValidade);
                        const vencido = d.dataValidade ? new Date(d.dataValidade) < new Date() : false;
                        return (
                          <div key={d.id} className="flex items-center gap-1.5 text-[11px] bg-slate-50 dark:bg-slate-800/60 rounded-md px-2 py-1">
                            <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="flex-1 min-w-0 truncate text-slate-600 dark:text-slate-300" title={d.nome}>{d.nome}</span>
                            {validade && (
                              <span className={vencido ? 'text-red-500 font-semibold' : 'text-muted-foreground'}>{validade}</span>
                            )}
                            <a href={d.fileUrl} target="_blank" rel="noopener" className="text-primary hover:underline shrink-0">Ver</a>
                            <button
                              type="button"
                              className="shrink-0 text-destructive hover:opacity-70"
                              onClick={() => { if (confirm('Excluir este documento?')) excluirMut.mutate({ id: d.id, companyId }); }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Ação de upload (some quando coberto por FCSign sem upload manual) */}
                  {!(coberto && enviados.length === 0) && (
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => handleUpload(tipo.value)}
                      className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1 transition-colors disabled:opacity-50 ${
                        enviados.length > 0
                          ? 'text-slate-600 hover:text-blue-600 hover:bg-blue-50/60 dark:text-slate-300 dark:hover:bg-blue-950/30'
                          : 'text-blue-600 bg-blue-50 hover:bg-blue-100 dark:text-blue-300 dark:bg-blue-950/40 dark:hover:bg-blue-900/50'
                      }`}
                    >
                      {enviados.length > 0 ? <><Plus className="w-3.5 h-3.5" /> Adicionar mais</> : <><Upload className="w-3.5 h-3.5" /> Enviar arquivo</>}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
// Seções SST removidas - módulos não fazem parte do escopo

// ─── Employee Skills Section (inside Ficha do Colaborador) ──────────
const nivelLabelsMap: Record<string, string> = {
  Basico: "Básico",
  Intermediario: "Intermediário",
  Avancado: "Avançado",
};
const nivelColorsMap: Record<string, string> = {
  Basico: "bg-blue-100 text-blue-800",
  Intermediario: "bg-amber-100 text-amber-800",
  Avancado: "bg-green-100 text-green-800",
};

function SkillFilterDropdown({ value, onChange, companyId, companyIds }: {
  value: string;
  onChange: (v: string) => void;
  companyId: number;
  companyIds?: number[];
}) {
  const skillsQ = trpc.skills.list.useQuery(
    { companyId, companyIds },
    { enabled: !!companyId || (companyIds && companyIds.length > 0) }
  );
  const skillsList = skillsQ.data ?? [];
  if (skillsList.length === 0 && !skillsQ.isLoading) return null;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-48 bg-card border-border">
        <div className="flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue placeholder="Habilidade" />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todas Habilidades</SelectItem>
        {skillsList.map((s: any) => (
          <SelectItem key={s.id} value={String(s.id)}>{s.nome}{s.categoria ? ` (${s.categoria})` : ''}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EmployeeSkillsSection({ employeeId }: { employeeId: number }) {
  const skillsQ = trpc.skills.employeeSkills.useQuery({ employeeId }, { enabled: !!employeeId });
  const skills = skillsQ.data ?? [];

  return (
    <div>
      <h3 className="text-base font-semibold text-primary mb-4 pb-2 border-b-2 border-primary/20 flex items-center gap-2">
        <Wrench className="h-4 w-4" /> Habilidades e Competências
      </h3>
      {skillsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : skills.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Nenhuma habilidade cadastrada para este colaborador</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {skills.map((sk: any) => (
            <div key={sk.id} className="flex items-start gap-3 p-3 border rounded-lg bg-muted/20">
              <Award className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{sk.skillNome}</div>
                {sk.skillCategoria && <div className="text-xs text-muted-foreground">{sk.skillCategoria}</div>}
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={`text-xs ${nivelColorsMap[sk.nivel] || ""}`}>
                    {nivelLabelsMap[sk.nivel] || sk.nivel}
                  </Badge>
                  {sk.tempoExperiencia && (
                    <span className="text-xs text-muted-foreground">{sk.tempoExperiencia}</span>
                  )}
                </div>
                {sk.observacao && <p className="text-xs text-muted-foreground mt-1">{sk.observacao}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoricoStatusTab({ employeeId, companyId }: { employeeId: number; companyId: number }) {
  const { data: logs, isLoading } = trpc.employees.statusLog.useQuery(
    { companyId, employeeId },
    { enabled: !!employeeId && !!companyId }
  );

  const statusColors: Record<string, string> = {
    Ativo: "bg-green-100 text-green-800",
    Ferias: "bg-blue-100 text-blue-800",
    Afastado: "bg-yellow-100 text-yellow-800",
    Recluso: "bg-orange-100 text-orange-800",
    Desligado: "bg-red-100 text-red-800",
    Lista_Negra: "bg-red-200 text-red-900",
    Licenca: "bg-purple-100 text-purple-800",
  };

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Carregando histórico...</div>;

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Nenhuma alteração de status registrada.</p>
        <p className="text-xs text-muted-foreground mt-1">A partir de agora, toda mudança de status será registrada aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Histórico de Alterações de Status</h3>
        <Badge variant="secondary" className="text-xs">{logs.length} registro(s)</Badge>
      </div>
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        {logs.map((log: any) => (
          <div key={log.id} className="border rounded-lg p-3 bg-card hover:bg-accent/50 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[log.statusAnterior] || "bg-gray-100 text-gray-800"}`}>
                  {log.statusAnterior}
                </span>
                <span className="text-muted-foreground text-xs">→</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[log.statusNovo] || "bg-gray-100 text-gray-800"}`}>
                  {log.statusNovo}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {log.createdAt ? new Date(log.createdAt).toLocaleString("pt-BR") : "-"}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
              <span><strong>Por:</strong> {log.alteradoPor}</span>
              <span><strong>Módulo:</strong> {log.origemModulo}</span>
            </div>
            {log.motivo && (
              <p className="text-xs text-muted-foreground mt-1 italic">{log.motivo}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const fieldLabels: Record<string, string> = {
  nomeCompleto: "Nome Completo", cpf: "CPF", rg: "RG", dataNascimento: "Data Nascimento",
  dataAdmissao: "Data Admissão", funcao: "Função", funcaoRegistro: "Função Registro",
  setor: "Setor", salarioBase: "Salário Base", status: "Status", tipoContrato: "Tipo Contrato",
  sexo: "Sexo", estadoCivil: "Estado Civil", nacionalidade: "Nacionalidade",
  naturalidade: "Naturalidade", nomeMae: "Nome da Mãe", nomePai: "Nome do Pai",
  celular: "Celular", email: "E-mail", contatoEmergencia: "Contato Emergência",
  telefoneEmergencia: "Tel. Emergência", parentesco: "Parentesco",
  cep: "CEP", rua: "Rua", numero: "Número", complemento: "Complemento",
  bairro: "Bairro", cidade: "Cidade", estado: "Estado",
  banco: "Banco", agencia: "Agência", conta: "Conta", tipoConta: "Tipo Conta",
  pixChave: "Chave PIX", pixTipo: "Tipo PIX",
  pis: "PIS", ctps: "CTPS", ctpsSerie: "CTPS Série",
  tituloEleitor: "Título Eleitor", zonaEleitoral: "Zona Eleitoral", secaoEleitoral: "Seção Eleitoral",
  cnh: "CNH", cnhCategoria: "CNH Categoria", cnhValidade: "CNH Validade",
  reservista: "Reservista", grauInstrucao: "Grau de Instrução",
  vaRecebe: "Recebe VA", vaValor: "Valor VA", vaOperadora: "Operadora VA", vaNumeroCartao: "Nº Cartão VA",
  vrRecebe: "Recebe VR", vrValor: "Valor VR",
  valeTransporte: "Vale Transporte", vtValor: "Valor VT", vtPercDesconto: "% Desconto VT",
  planoSaude: "Plano de Saúde", planoSaudeDesconto: "Desconto Plano",
  observacoes: "Observações", codigoInterno: "Código Interno JFC",
  categoriaDesligamento: "Categoria Desligamento", motivoDesligamento: "Motivo Desligamento",
  dataDesligamento: "Data Desligamento", dataDesligamentoEfetiva: "Data Desligamento Efetiva",
  dataDemissao: "Data Demissão", listaNegra: "Blacklist", motivoListaNegra: "Motivo Blacklist",
  sindicato: "Sindicato", contribuicaoSindical: "Contribuição Sindical",
  horarioTrabalho: "Horário Trabalho", jornadaSemanal: "Jornada Semanal",
  experienciaInicio: "Experiência Início", experienciaFim1: "Experiência 1ª Fase",
  experienciaFim2: "Experiência 2ª Fase",
};

function HistoricoAlteracoesTab({ employeeId }: { employeeId: number }) {
  const { data: logs, isLoading } = trpc.employees.changeLog.useQuery(
    { employeeId },
    { enabled: !!employeeId }
  );

  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Carregando histórico...</div>;

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>
        <p className="text-xs text-muted-foreground mt-1">A partir de agora, toda alteração será registrada com nome do usuário, data e hora.</p>
      </div>
    );
  }

  const actionLabels: Record<string, { label: string; color: string }> = {
    CREATE: { label: "Cadastro", color: "bg-green-100 text-green-800" },
    UPDATE: { label: "Alteração", color: "bg-blue-100 text-blue-800" },
    DELETE: { label: "Exclusão", color: "bg-red-100 text-red-800" },
    RESTORE: { label: "Restauração", color: "bg-purple-100 text-purple-800" },
  };

  const formatVal = (v: any) => {
    if (v === null || v === undefined || v === '') return '(vazio)';
    if (v === true || v === 1) return 'Sim';
    if (v === false || v === 0) return 'Não';
    return String(v);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Histórico de Alterações</h3>
        <Badge variant="secondary" className="text-xs">{logs.length} registro(s)</Badge>
      </div>
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        {logs.map((log: any) => {
          const al = actionLabels[log.action] || { label: log.action, color: "bg-gray-100 text-gray-800" };
          const changes = log.changes as Record<string, { de: any; para: any }> | null;
          const isExpanded = expandedId === log.id;
          const changesArr = changes ? Object.entries(changes) : [];
          return (
            <div key={log.id} className="border rounded-lg bg-card hover:bg-accent/50 transition-colors">
              <button
                className="w-full text-left p-3"
                onClick={() => setExpandedId(isExpanded ? null : log.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${al.color}`}>
                      {al.label}
                    </span>
                    <span className="text-xs font-medium text-foreground">{log.userName}</span>
                    {changesArr.length > 0 && (
                      <span className="text-xs text-muted-foreground">({changesArr.length} campo{changesArr.length > 1 ? 's' : ''})</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString("pt-BR") : "-"}
                  </span>
                </div>
                {!isExpanded && log.action === 'CREATE' && (
                  <p className="text-xs text-muted-foreground mt-1">{log.summary}</p>
                )}
                {!isExpanded && changesArr.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {changesArr.slice(0, 3).map(([k]) => fieldLabels[k] || k).join(', ')}
                    {changesArr.length > 3 ? ` +${changesArr.length - 3} mais` : ''}
                  </p>
                )}
              </button>
              {isExpanded && changesArr.length > 0 && (
                <div className="px-3 pb-3 border-t pt-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left py-1 font-medium">Campo</th>
                        <th className="text-left py-1 font-medium">Antes</th>
                        <th className="text-left py-1 font-medium">Depois</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changesArr.map(([field, { de, para }]) => (
                        <tr key={field} className="border-b border-dashed last:border-0">
                          <td className="py-1.5 font-medium text-foreground">{fieldLabels[field] || field}</td>
                          <td className="py-1.5 text-red-600 line-through">{formatVal(de)}</td>
                          <td className="py-1.5 text-green-700 font-medium">{formatVal(para)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {isExpanded && log.action === 'CREATE' && (
                <div className="px-3 pb-3 border-t pt-2">
                  <p className="text-xs text-muted-foreground">{log.summary}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Rev. 2169 → Rev. 2493 — FuncaoCombobox extraído pra `@/components/FuncaoCombobox`
// (reuso no form de Terceiros). Implementação idêntica vive lá.
