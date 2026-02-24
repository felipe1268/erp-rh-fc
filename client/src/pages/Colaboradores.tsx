import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
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
import { Users, Plus, Search, Pencil, Trash2, Eye, Ban, GraduationCap, ShieldCheck, Scale, FileText, Building2, AlertTriangle, Upload, HardHat, Download, Printer, ArrowLeft, Hash, Lock, Camera, X as XIcon } from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { EMPLOYEE_STATUS } from "../../../shared/modules";
import { useCompany } from "@/contexts/CompanyContext";
import { formatCPF, formatRG, formatCEP, formatPIS, formatTelefone, formatTituloEleitor, formatMoedaInput, formatMoedaSemPrefixo, parseMoedaBR, formatMoeda } from "@/lib/formatters";
import RaioXFuncionario from "@/components/RaioXFuncionario";
import { useAuth } from "@/_core/hooks/useAuth";

const statusColors: Record<string, string> = {
  Ativo: "bg-green-400/10 text-green-400",
  Ferias: "bg-blue-400/10 text-blue-400",
  Afastado: "bg-yellow-400/10 text-yellow-400",
  Licenca: "bg-purple-400/10 text-purple-400",
  Desligado: "bg-red-400/10 text-red-400",
  Recluso: "bg-gray-400/10 text-gray-400",
  ListaNegra: "bg-red-600/20 text-red-600",
};

const statusLabels: Record<string, string> = {
  Ativo: "Ativo", Ferias: "Férias", Afastado: "Afastado",
  Licenca: "Licença", Desligado: "Desligado", Recluso: "Recluso",
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
      // Agrupar dias com mesma jornada
      const groups: { dias: string[]; entrada: string; intervalo: string; saida: string }[] = [];
      for (const d of ["seg","ter","qua","qui","sex","sab","dom"]) {
        if (!parsed[d]) continue;
        const { entrada, intervalo, saida } = parsed[d];
        const existing = groups.find(g => g.entrada === entrada && g.intervalo === intervalo && g.saida === saida);
        if (existing) {
          existing.dias.push(DIAS_LABELS[d] || d);
        } else {
          groups.push({ dias: [DIAS_LABELS[d] || d], entrada, intervalo, saida });
        }
      }
      if (groups.length === 0) return "-";
      return groups.map(g => {
        const diasStr = g.dias.length > 2
          ? `${g.dias[0]} a ${g.dias[g.dias.length - 1]}`
          : g.dias.join(", ");
        const intLabel = g.intervalo === "00:30" ? "30min" : g.intervalo === "01:00" ? "1h" : g.intervalo === "01:30" ? "1h30" : g.intervalo === "02:00" ? "2h" : g.intervalo || "";
        return `${diasStr}: ${g.entrada} - ${g.saida}${intLabel ? " (int. " + intLabel + ")" : ""}`;
      }).join(" | ");
    }
  } catch { /* not JSON */ }
  return s;
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
  const { selectedCompanyId, companies } = useCompany();
  const { user } = useAuth();
  const selectedCompany = selectedCompanyId;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<any>(null);
  const [raioXEmployeeId, setRaioXEmployeeId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [blacklistAlert, setBlacklistAlert] = useState<string | null>(null);
  const [cpfDuplicateAlert, setCpfDuplicateAlert] = useState<string | null>(null);
  const [desligamentoDialogOpen, setDesligamentoDialogOpen] = useState(false);
  const [previousStatus, setPreviousStatus] = useState<string>("");

  // Seleção múltipla
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const companyId = selectedCompany ? parseInt(selectedCompany) : undefined;
  const { data: obras } = trpc.obras.list.useQuery({ companyId: companyId ?? 0 }, { enabled: !!companyId });
  // Setores e Funções dinâmicos vinculados à empresa do formulário
  const formCompanyIdNum = form.companyId ? parseInt(form.companyId) : companyId;
  const { data: setoresList } = trpc.sectors.list.useQuery({ companyId: formCompanyIdNum ?? 0 }, { enabled: !!formCompanyIdNum });
  const { data: funcoesList } = trpc.jobFunctions.list.useQuery({ companyId: formCompanyIdNum ?? 0 }, { enabled: !!formCompanyIdNum });
  const { data: contasBancariasEmpresa } = trpc.folha.listarContasBancarias.useQuery({ companyId: formCompanyIdNum ?? 0 }, { enabled: !!formCompanyIdNum });
  const contasAtivas = (contasBancariasEmpresa || []).filter((c: any) => c.ativo !== 0);

  // Import Excel
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);


  const utils = trpc.useUtils();
  const { data: employees, isLoading } = trpc.employees.list.useQuery(
    { companyId: companyId!, search: search || undefined, status: statusFilter !== "Todos" ? statusFilter : undefined },
    { enabled: !!companyId }
  );

  const createMut = trpc.employees.create.useMutation({
    onSuccess: () => { utils.employees.list.invalidate(); utils.employees.stats.invalidate(); setDialogOpen(false); toast.success("Colaborador cadastrado!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const updateMut = trpc.employees.update.useMutation({
    onSuccess: () => { utils.employees.list.invalidate(); utils.employees.stats.invalidate(); setDialogOpen(false); toast.success("Colaborador atualizado!"); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const deleteMut = trpc.employees.delete.useMutation({
    onSuccess: () => { utils.employees.list.invalidate(); utils.employees.stats.invalidate(); toast.success("Colaborador excluído!"); },
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
        // Para novo funcionário, salvar base64 temporariamente no form
        set("fotoUrl", reader.result as string);
        set("_fotoBase64", base64);
        set("_fotoMimeType", file.type);
        set("_fotoFileName", file.name);
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

  // Verificação de lista negra (desativado - módulo removido)
  const checkBlacklistMut = { data: null } as any;

  // Verificação de CPF duplicado
  const cpfClean = useMemo(() => (form.cpf ?? "").replace(/\D/g, ""), [form.cpf]);
  const checkDuplicateCpf = trpc.employees.checkDuplicateCpf.useQuery(
    { cpf: cpfClean, companyId: companyId ?? 0 },
    { enabled: cpfClean.length >= 11 }
  );

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
      const msgs = duplicates.map((d: any) => `"${d.nomeCompleto}" na empresa ${d.empresa} (Status: ${statusLabels[d.status] ?? d.status})`);
      setCpfDuplicateAlert(`CPF já cadastrado no grupo: ${msgs.join("; ")}`);
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
      Object.entries(rest).forEach(([k, v]) => { if (!k.startsWith("jornada_")) data[k] = v; });
      // Tratar obraAtualId "none" como null
      if (data.obraAtualId === "none") data.obraAtualId = "" as any;
      // Limpar valores "none" dos selects
      Object.keys(data).forEach(k => { if ((data as any)[k] === "none") (data as any)[k] = ""; });
      (data as any).jornadaTrabalho = jornadaStr;
      updateMut.mutate({ id: editingId, companyId: targetCompanyId, data });
    } else {
      const { empresa: _emp, ...restCreate } = form;
      // Remover campos temporários de jornada dia a dia do form
      const createData: Record<string, any> = {};
      Object.entries(restCreate).forEach(([k, v]) => { if (!k.startsWith("jornada_")) createData[k] = v; });
      if (createData.obraAtualId === "none") delete (createData as any).obraAtualId;
      Object.keys(createData).forEach(k => { if ((createData as any)[k] === "none") (createData as any)[k] = ""; });
      (createData as any).jornadaTrabalho = jornadaStr;
      createMut.mutate({ ...createData, companyId: targetCompanyId } as any);
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
    if (!employees) return;
    if (selectedIds.size === employees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(employees.map(e => e.id)));
    }
  };
  const isAllSelected = employees && employees.length > 0 && selectedIds.size === employees.length;
  const hasSelection = selectedIds.size > 0;

  const handleBulkDelete = () => {
    if (!companyId || selectedIds.size === 0) return;
    deleteManyMut.mutate({ table: "employees" as any, ids: Array.from(selectedIds) });
  };

  const handlePrintFicha = () => {
    if (!viewingEmployee) return;
    const empresa = getCompanyName(viewingEmployee.companyId);
    const dataEmissao = new Date().toLocaleString("pt-BR");
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
        ["Matrícula", safeDisplay(viewingEmployee.matricula)],
        ["Função", safeDisplay(viewingEmployee.funcao)],
        ["Setor", safeDisplay(viewingEmployee.setor)],
        ["Admissão", formatDate(viewingEmployee.dataAdmissao)],
        ["Contrato", safeDisplay(viewingEmployee.tipoContrato)],
        ["Jornada", formatJornada(viewingEmployee.jornadaTrabalho)],
        ["Cód. Contábil", safeDisplay(viewingEmployee.codigoContabil)],
        ["Salário Base", viewingEmployee.salarioBase ? formatMoeda(viewingEmployee.salarioBase) : "-"],
        ["Valor da Hora", viewingEmployee.valorHora ? formatMoeda(viewingEmployee.valorHora) : "-"],
        ["Horas/Mês", safeDisplay(viewingEmployee.horasMensais)],
        ["Complemento Salarial", viewingEmployee.recebeComplemento ? `Sim — R$ ${viewingEmployee.valorComplemento || "0"}` : "Não"],
        ["Acordo HE", viewingEmployee.acordoHoraExtra ? `Sim — ${viewingEmployee.hePercentual50 ?? 50}% / ${viewingEmployee.hePercentual100 ?? 100}% / ${viewingEmployee.hePercentualNoturno ?? 20}%` : "Padrão CLT (50/100/20%)"],
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
      <span style="display:inline-block;background:${viewingEmployee.status === 'Ativo' ? '#dcfce7' : viewingEmployee.status === 'ListaNegra' ? '#fecaca' : '#fef3c7'};color:${viewingEmployee.status === 'Ativo' ? '#166534' : viewingEmployee.status === 'ListaNegra' ? '#991b1b' : '#92400e'};padding:2px 10px;border-radius:4px;font-size:10px;font-weight:600;margin-top:4px;">${statusLabels[viewingEmployee.status] ?? viewingEmployee.status}</span>
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
      <div class="header-bar"><div><h1>FC ENGENHARIA PROJETOS E CONSTRUÇÕES</h1><div class="sub">Ficha do Colaborador</div></div><div class="sub">Emitido em: ${dataEmissao}</div></div>
      ${conteudo}
      <div class="footer">
        <span>ERP RH & DP — FC Engenharia</span>
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
          <div className="flex items-center gap-3">
            <PrintActions title="Colaboradores" />
            <Button variant="outline" onClick={() => setImportDialogOpen(true)} disabled={!companyId} className="gap-2">
              <Upload className="h-4 w-4" /> Importar Excel
            </Button>
            <Button onClick={openNew} disabled={!companyId} className="gap-2">
              <Plus className="h-4 w-4" /> Novo
            </Button>
          </div>
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos</SelectItem>
              {EMPLOYEE_STATUS.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {!companyId ? (
          <Card className="bg-card border-border">
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground">Selecione uma empresa para visualizar os colaboradores.</p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <Card className="bg-card border-border animate-pulse"><CardContent className="h-64" /></Card>
        ) : employees && employees.length > 0 ? (
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
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
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
                        <span className="font-medium text-blue-700 hover:underline">{emp.nomeCompleto}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground min-w-[180px] whitespace-nowrap font-mono text-sm">{formatCPF(emp.cpf)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${emp.tipoContrato === 'PJ' ? 'bg-purple-100 text-purple-700' : emp.tipoContrato === 'Temporario' ? 'bg-amber-100 text-amber-700' : emp.tipoContrato === 'Estagio' ? 'bg-cyan-100 text-cyan-700' : emp.tipoContrato === 'Aprendiz' ? 'bg-pink-100 text-pink-700' : emp.tipoContrato === 'Horista' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                        {emp.tipoContrato || 'CLT'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{emp.funcao ?? "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{emp.setor ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded ${statusColors[emp.status] ?? ""}`}>
                        {statusLabels[emp.status] ?? emp.status}
                      </span>
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
                {search ? "Tente outra busca." : "Cadastre o primeiro colaborador."}
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
                      set("fotoUrl", ""); set("_fotoBase64", ""); set("_fotoMimeType", ""); set("_fotoFileName", "");
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
              <TabsTrigger value="bancario" className="flex-1 text-xs sm:text-sm">Bancário</TabsTrigger>
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
                {cpfDuplicateAlert && !editingId ? (
                  <div className="sm:col-span-2 lg:col-span-3 bg-red-600/10 border border-red-600/30 rounded-lg p-3 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                    <p className="text-sm font-medium text-red-600">⛔ {cpfDuplicateAlert}. Cadastro bloqueado.</p>
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
                                set("cidade", d.localidade || "");
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
                  <Input value={form.cidade ?? ""} onChange={e => set("cidade", e.target.value)} className="bg-input mt-1" />
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
                  <Label className="text-xs font-medium text-muted-foreground">Matrícula</Label>
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
                      {EMPLOYEE_STATUS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Função</Label>
                  <Select value={form.funcao || "none"} onValueChange={v => set("funcao", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione a função</SelectItem>
                      {(funcoesList ?? []).filter((f: any) => f.isActive !== false).map((f: any) => (
                        <SelectItem key={f.id} value={f.nome}>{f.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Select value={form.obraAtualId || "none"} onValueChange={v => set("obraAtualId", v)}>
                    <SelectTrigger className="bg-input mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem obra vinculada</SelectItem>
                      {(obras ?? []).map((o: any) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.nome} {o.codigo ? `(${o.codigo})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Label className={`text-xs font-medium font-semibold ${form.tipoContrato === 'Horista' ? 'text-yellow-700' : 'text-blue-700'}`}>Valor da Hora (R$) {form.tipoContrato === 'Horista' ? '⚡ HORISTA' : '⭐'}</Label>
                  <Input value={form.valorHora ?? ""} onChange={e => {
                    const formatted = formatMoedaInput(e.target.value);
                    set("valorHora", formatted);
                    const horaNum = parseMoedaBR(formatted);
                    const horasNum = parseFloat(String(form.horasMensais || "220").replace(",", "."));
                    if (horaNum > 0 && !isNaN(horasNum) && horasNum > 0) {
                      set("salarioBase", formatMoedaSemPrefixo(horaNum * horasNum));
                    }
                  }} placeholder="11,36" className={`bg-input mt-1 ${form.tipoContrato === 'Horista' ? 'border-yellow-400 ring-2 ring-yellow-200 bg-yellow-50' : 'border-blue-300 ring-1 ring-blue-100'}`} />
                  <span className={`text-[10px] mt-0.5 block font-medium ${form.tipoContrato === 'Horista' ? 'text-yellow-700' : 'text-blue-600'}`}>
                    {form.tipoContrato === 'Horista' ? 'Campo obrigatório para horistas — base do simulador de folha' : 'Dado mestre — base para cálculo da folha'}
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
                      <SelectItem value="Horista">Horista</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Jornada de Trabalho - Dia a Dia */}
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-primary mb-3">Jornada de Trabalho</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border border-border rounded-lg">
                    <thead>
                      <tr className="bg-secondary/50">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground w-20">Dia</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Entrada</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Intervalo</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Saída</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Linha Padrão - preenche todos os dias */}
                      <tr className="border-t-2 border-primary/30 bg-primary/5">
                        <td className="px-3 py-1.5 font-bold text-primary text-xs">Padrão</td>
                        <td className="px-1 py-1">
                          <Select value={form.jornada_padrao_entrada || "none"} onValueChange={v => {
                            const val = v === "none" ? "" : v;
                            setForm(prev => {
                              const updated: Record<string, string> = { ...prev, jornada_padrao_entrada: val };
                              ["seg","ter","qua","qui","sex","sab","dom"].forEach(d => { updated[`jornada_${d}_entrada`] = val; });
                              return updated;
                            });
                          }}>
                            <SelectTrigger className="bg-primary/10 h-8 text-xs border-primary/30"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">-</SelectItem>
                              {["05:00","05:30","06:00","06:30","07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00"].map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1">
                          <Select value={form.jornada_padrao_intervalo || "none"} onValueChange={v => {
                            const val = v === "none" ? "" : v;
                            setForm(prev => {
                              const updated: Record<string, string> = { ...prev, jornada_padrao_intervalo: val };
                              ["seg","ter","qua","qui","sex","sab","dom"].forEach(d => { updated[`jornada_${d}_intervalo`] = val; });
                              return updated;
                            });
                          }}>
                            <SelectTrigger className="bg-primary/10 h-8 text-xs border-primary/30"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">-</SelectItem>
                              <SelectItem value="00:30">30 min</SelectItem>
                              <SelectItem value="01:00">1 hora</SelectItem>
                              <SelectItem value="01:30">1h30</SelectItem>
                              <SelectItem value="02:00">2 horas</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1">
                          <Select value={form.jornada_padrao_saida || "none"} onValueChange={v => {
                            const val = v === "none" ? "" : v;
                            setForm(prev => {
                              const updated: Record<string, string> = { ...prev, jornada_padrao_saida: val };
                              ["seg","ter","qua","qui","sex","sab","dom"].forEach(d => { updated[`jornada_${d}_saida`] = val; });
                              return updated;
                            });
                          }}>
                            <SelectTrigger className="bg-primary/10 h-8 text-xs border-primary/30"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">-</SelectItem>
                              {["11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00","22:00","23:00"].map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
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
                      ].map(dia => (
                        <tr key={dia.key} className="border-t border-border">
                          <td className="px-3 py-1.5 font-medium text-foreground">{dia.label}</td>
                          <td className="px-1 py-1">
                            <Select value={form[`jornada_${dia.key}_entrada`] || "none"} onValueChange={v => set(`jornada_${dia.key}_entrada`, v === "none" ? "" : v)}>
                              <SelectTrigger className="bg-input h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">-</SelectItem>
                                {["05:00","05:30","06:00","06:30","07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00"].map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-1 py-1">
                            <Select value={form[`jornada_${dia.key}_intervalo`] || "none"} onValueChange={v => set(`jornada_${dia.key}_intervalo`, v === "none" ? "" : v)}>
                              <SelectTrigger className="bg-input h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">-</SelectItem>
                                <SelectItem value="00:30">30 min</SelectItem>
                                <SelectItem value="01:00">1 hora</SelectItem>
                                <SelectItem value="01:30">1h30</SelectItem>
                                <SelectItem value="02:00">2 horas</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-1 py-1">
                            <Select value={form[`jornada_${dia.key}_saida`] || "none"} onValueChange={v => set(`jornada_${dia.key}_saida`, v === "none" ? "" : v)}>
                              <SelectTrigger className="bg-input h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">-</SelectItem>
                                {["11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00","22:00","23:00"].map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      ))}
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
                          value={form.complementoObs ?? ""}
                          onChange={e => set("complementoObs", e.target.value)}
                          placeholder="Ex: Bônus de produtividade, ajuste salarial..."
                          className="bg-white mt-1 border-amber-300 focus:border-amber-500"
                        />
                      </div>
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
                          set("hePercentual50", "50");
                          set("hePercentual100", "100");
                          set("hePercentualNoturno", "20");
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
                          type="number"
                          min="0"
                          max="100"
                          value={form.hePercentual50 ?? "50"}
                          onChange={e => set("hePercentual50", e.target.value)}
                          className={`bg-white ${String(form.acordoHoraExtra) === "1" ? 'border-blue-300' : 'opacity-60'}`}
                          readOnly={String(form.acordoHoraExtra) !== "1"}
                        />
                        <span className="text-sm font-medium text-muted-foreground">%</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">CLT padrão: 50%</span>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">HE Domingos/Feriados (%)</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={form.hePercentual100 ?? "100"}
                          onChange={e => set("hePercentual100", e.target.value)}
                          className={`bg-white ${String(form.acordoHoraExtra) === "1" ? 'border-blue-300' : 'opacity-60'}`}
                          readOnly={String(form.acordoHoraExtra) !== "1"}
                        />
                        <span className="text-sm font-medium text-muted-foreground">%</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">CLT padrão: 100%</span>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Adicional Noturno (%)</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={form.hePercentualNoturno ?? "20"}
                          onChange={e => set("hePercentualNoturno", e.target.value)}
                          className={`bg-white ${String(form.acordoHoraExtra) === "1" ? 'border-blue-300' : 'opacity-60'}`}
                          readOnly={String(form.acordoHoraExtra) !== "1"}
                        />
                        <span className="text-sm font-medium text-muted-foreground">%</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block">CLT padrão: 20%</span>
                    </div>
                  </div>
                  {String(form.acordoHoraExtra) === "1" && (
                    <div className="mt-3 p-2 bg-blue-100/50 rounded text-xs text-blue-800">
                      <strong>Acordo ativo:</strong> Os percentuais acima serão usados no cálculo de horas extras deste funcionário ao invés dos valores padrão da CLT.
                    </div>
                  )}
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
                      <SelectItem value="Justa causa">Justa causa</SelectItem>
                      <SelectItem value="Pedido de demissão">Pedido de demissão</SelectItem>
                      <SelectItem value="Acordo mútuo">Acordo mútuo</SelectItem>
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
              disabled={createMut.isPending || updateMut.isPending || (!editingId && !!cpfDuplicateAlert)}
            >
              {createMut.isPending || updateMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
      </FullScreenDialog>

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
                <div className="w-[90px] h-[90px] rounded-full border-3 border-primary/40 overflow-hidden bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shrink-0 shadow-lg">
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
                    <span className={`text-sm font-medium px-3 py-1 rounded ${statusColors[viewingEmployee.status] ?? ""}`}>
                      {statusLabels[viewingEmployee.status] ?? viewingEmployee.status}
                    </span>
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
                  ["Matrícula", safeDisplay(viewingEmployee.matricula)],
                  ["Função", safeDisplay(viewingEmployee.funcao)],
                  ["Setor", safeDisplay(viewingEmployee.setor)],
                  ["Admissão", formatDate(viewingEmployee.dataAdmissao)],
                  ["Contrato", viewingEmployee.tipoContrato === 'Horista' ? '⚡ Horista' : safeDisplay(viewingEmployee.tipoContrato)],
                  ["Jornada", formatJornada(viewingEmployee.jornadaTrabalho)],
                  ["Salário Base", viewingEmployee.salarioBase ? formatMoeda(viewingEmployee.salarioBase) : "-"],
                  [viewingEmployee.tipoContrato === 'Horista' ? '⚡ Valor da Hora' : "Valor da Hora", viewingEmployee.valorHora ? formatMoeda(viewingEmployee.valorHora) : "-"],
                  ["Horas/Mês", safeDisplay(viewingEmployee.horasMensais)],
                  ["Complemento Salarial", viewingEmployee.recebeComplemento ? `Sim — R$ ${viewingEmployee.valorComplemento || "0"}` : "Não"],
                  ["Acordo HE", viewingEmployee.acordoHoraExtra ? `Sim — ${viewingEmployee.hePercentual50 ?? 50}% / ${viewingEmployee.hePercentual100 ?? 100}% / ${viewingEmployee.hePercentualNoturno ?? 20}%` : "Padrão CLT (50/100/20%)"],
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
    </DashboardLayout>
  );
}
// Seções SST removidas - módulos não fazem parte do escopo
