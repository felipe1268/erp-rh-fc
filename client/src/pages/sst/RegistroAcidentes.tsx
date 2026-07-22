import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  AlertTriangle, Plus, Search, Pencil, Trash2, FileWarning,
  Activity, Calendar, Clock, CheckCircle2, XCircle, X,
  User, MapPin, FileText, Stethoscope, ShieldAlert, Link2,
  Sparkles, ExternalLink, Briefcase, IdCard, FileCheck2, Hash,
} from "lucide-react";

const GRAVIDADES = [
  "Quase-acidente",
  "Primeiros Socorros",
  "Leve sem afastamento",
  "Leve com afastamento",
  "Moderado",
  "Grave",
  "Gravíssimo",
  "Fatal",
];
const TIPOS_ACIDENTE = [
  "Queda mesmo nível", "Queda diferente nível", "Choque elétrico", "Corte / Perfuração",
  "Esmagamento", "Queimadura", "Impacto / Batida", "Esforço repetitivo / LER",
  "Esforço excessivo", "Contato com produto químico", "Inalação / Asfixia",
  "Soterramento", "Trajeto", "Acidente com veículo", "Outro",
];
const PARTES_CORPO = [
  "Cabeça", "Olhos", "Face", "Pescoço", "Tronco", "Coluna",
  "Ombro", "Braço", "Cotovelo", "Antebraço", "Punho", "Mão", "Dedos da mão",
  "Quadril", "Coxa", "Joelho", "Perna", "Tornozelo", "Pé", "Dedos do pé",
  "Múltiplas regiões",
];
const STATUS_ACAO = ["Pendente", "Em andamento", "Concluída", "Cancelada"];

const GRAV_COLORS: Record<string, string> = {
  "Quase-acidente": "bg-blue-100 text-blue-700 border-blue-300",
  "Primeiros Socorros": "bg-cyan-100 text-cyan-700 border-cyan-300",
  "Leve sem afastamento": "bg-emerald-100 text-emerald-700 border-emerald-300",
  "Leve com afastamento": "bg-yellow-100 text-yellow-700 border-yellow-300",
  "Moderado": "bg-orange-100 text-orange-700 border-orange-300",
  "Grave": "bg-red-100 text-red-700 border-red-300",
  "Gravíssimo": "bg-rose-200 text-rose-900 border-rose-400",
  "Fatal": "bg-black text-white border-black",
};
const STATUS_COLORS: Record<string, string> = {
  "Pendente": "bg-amber-100 text-amber-700 border-amber-300",
  "Em andamento": "bg-blue-100 text-blue-700 border-blue-300",
  "Concluída": "bg-emerald-100 text-emerald-700 border-emerald-300",
  "Cancelada": "bg-gray-100 text-gray-600 border-gray-300",
};

// Gravidades que SUGEREM CAT automaticamente
const GRAV_SUGERE_CAT = new Set(["Moderado", "Grave", "Gravíssimo", "Fatal"]);
// Gravidades que NÃO exigem CAT
const GRAV_SEM_CAT = new Set(["Quase-acidente", "Primeiros Socorros"]);

function nowDate() { return new Date().toISOString().slice(0, 10); }
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function emptyForm(): any {
  return {
    employeeId: "", obraId: "",
    dataAcidente: nowDate(),
    horaAcidente: nowTime(),
    tipoAcidente: "Queda mesmo nível",
    tipoAcidenteOutro: "",
    gravidade: "Leve sem afastamento",
    localAcidente: "", parteCorpoAtingida: "", agenteCausador: "",
    descricao: "", testemunhas: "",
    diasAfastamento: 0,
    houveCAT: 0, catNumero: "", catData: "", motivoSemCAT: "",
    acaoCorretiva: "", statusAcaoCorretiva: "Pendente",
    prazoAcaoCorretiva: "", responsavelAcao: "",
    atestadoId: null,
  };
}

function diffDays(a: string, b: string) {
  const ms = new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}

export default function RegistroAcidentes() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const queryCompanyId = isConstrutoras ? (companyIds[0] || 0) : companyId;
  const hasValidCompany = isConstrutoras ? companyIds.length > 0 : companyId > 0;

  const [busca, setBusca] = useState("");
  const [filtroGrav, setFiltroGrav] = useState<string>("__all__");
  const [filtroObra, setFiltroObra] = useState<string>("__all__");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyForm());
  const [editId, setEditId] = useState<number | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [obraSearch, setObraSearch] = useState("");

  const list = trpc.acidentes.list.useQuery(
    {
      companyId: queryCompanyId,
      ...(isConstrutoras ? { companyIds } : {}),
      ...(filtroGrav !== "__all__" ? { gravidade: filtroGrav } : {}),
      ...(filtroObra !== "__all__" ? { obraId: parseInt(filtroObra, 10) } : {}),
    },
    { enabled: hasValidCompany },
  );

  const obrasQ = trpc.obras.list.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) },
    { enabled: hasValidCompany },
  );
  const employeesQ = trpc.employees.list.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) } as any,
    { enabled: hasValidCompany },
  );

  // Atestados do funcionário (para vincular)
  const empIdNum = form.employeeId ? parseInt(String(form.employeeId), 10) : 0;
  const atestadosFuncQ = trpc.acidentes.atestadosDoFuncionario.useQuery(
    {
      employeeId: empIdNum,
      companyId: queryCompanyId,
      ...(isConstrutoras ? { companyIds } : {}),
      ...(editId ? { excludeAccidentId: editId } : {}),
    },
    { enabled: hasValidCompany && empIdNum > 0 && open },
  );

  const save = trpc.acidentes.save.useMutation({
    onSuccess: () => { toast.success("Acidente salvo com sucesso"); list.refetch(); setOpen(false); },
    onError: (e) => toast.error(e.message || "Erro ao salvar"),
  });
  const del = trpc.acidentes.delete.useMutation({
    onSuccess: () => { toast.success("Registro excluído"); list.refetch(); },
    onError: (e) => toast.error(e.message || "Erro ao excluir"),
  });

  const rows = useMemo(() => {
    const all = list.data ?? [];
    if (!busca.trim()) return all;
    const q = busca.toLowerCase();
    return all.filter((r: any) =>
      (r.employeeNome || "").toLowerCase().includes(q) ||
      (r.tipoAcidente || "").toLowerCase().includes(q) ||
      (r.localAcidente || "").toLowerCase().includes(q) ||
      (r.parteCorpoAtingida || "").toLowerCase().includes(q) ||
      (r.obraNome || "").toLowerCase().includes(q),
    );
  }, [list.data, busca]);

  const kpis = useMemo(() => {
    const arr = list.data ?? [];
    const total = arr.length;
    const comAfast = arr.filter((r: any) => (r.diasAfastamento || 0) > 0).length;
    const semCAT = arr.filter((r: any) => !r.houveCAT && (r.gravidade !== "Quase-acidente" && r.gravidade !== "Primeiros Socorros")).length;
    const acoesPendentes = arr.filter((r: any) => r.statusAcaoCorretiva && r.statusAcaoCorretiva !== "Concluída" && r.statusAcaoCorretiva !== "Cancelada").length;
    return { total, comAfast, semCAT, acoesPendentes };
  }, [list.data]);

  // Funcionário selecionado (para mostrar dados na lateral)
  const empSelected = useMemo(() => {
    if (!form.employeeId) return null;
    return (employeesQ.data ?? []).find((e: any) => String(e.id) === String(form.employeeId)) || null;
  }, [form.employeeId, employeesQ.data]);

  // Obra selecionada (para mostrar o nome no campo)
  const obraSelected = useMemo(() => {
    if (!form.obraId) return null;
    return (obrasQ.data ?? []).find((o: any) => String(o.id) === String(form.obraId)) || null;
  }, [form.obraId, obrasQ.data]);

  // Lista de obras filtrada pela busca do form
  const obrasFiltered = useMemo(() => {
    const all = (obrasQ.data ?? []).filter((o: any) => !o.deletedAt);
    if (!obraSearch.trim()) return all.slice(0, 80);
    const q = obraSearch.toLowerCase();
    return all.filter((o: any) => (o.nome || "").toLowerCase().includes(q)).slice(0, 80);
  }, [obrasQ.data, obraSearch]);

  // Lista de funcionários filtrada pela busca do form
  const employeesFiltered = useMemo(() => {
    const all = employeesQ.data ?? [];
    if (!employeeSearch.trim()) return all.slice(0, 100);
    const q = employeeSearch.toLowerCase();
    return all.filter((e: any) =>
      (e.nomeCompleto || "").toLowerCase().includes(q) ||
      (e.matricula || "").toLowerCase().includes(q) ||
      (e.cpf || "").includes(q),
    ).slice(0, 100);
  }, [employeesQ.data, employeeSearch]);

  // Atestados sugeridos: ordenados por proximidade da data do acidente
  const atestadosSugeridos = useMemo(() => {
    const arr = atestadosFuncQ.data ?? [];
    if (!form.dataAcidente) return arr;
    return [...arr].sort((a: any, b: any) => {
      const da = Math.abs(diffDays(a.dataEmissao, form.dataAcidente));
      const db = Math.abs(diffDays(b.dataEmissao, form.dataAcidente));
      return da - db;
    });
  }, [atestadosFuncQ.data, form.dataAcidente]);

  // Auto-fill: ao mudar gravidade
  useEffect(() => {
    if (!open) return;
    const next: any = {};
    // Se gravidade exige CAT e ainda não marcou Sim, sugere Sim
    if (GRAV_SUGERE_CAT.has(form.gravidade) && !form.houveCAT) {
      next.houveCAT = 1;
    }
    if (GRAV_SEM_CAT.has(form.gravidade) && form.houveCAT) {
      next.houveCAT = 0;
    }
    if (Object.keys(next).length > 0) setForm((f: any) => ({ ...f, ...next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.gravidade]);

  function openNovo() {
    setForm(emptyForm()); setEditId(null); setEmployeeSearch(""); setObraSearch(""); setOpen(true);
  }
  function openEdit(r: any) {
    setEditId(r.id);
    // Se o tipo gravado for "Outro: <texto>", separa para o campo livre
    const rawTipo = r.tipoAcidente || "";
    const isOutroLivre = /^outro\s*:/i.test(rawTipo);
    const tipoSel = isOutroLivre ? "Outro" : (TIPOS_ACIDENTE.includes(rawTipo) ? rawTipo : "Outro");
    const tipoOutro = isOutroLivre ? rawTipo.replace(/^outro\s*:\s*/i, "").trim() : (tipoSel === "Outro" && !TIPOS_ACIDENTE.includes(rawTipo) ? rawTipo : "");
    setForm({
      employeeId: r.employeeId, obraId: r.obraId ?? "",
      dataAcidente: r.dataAcidente, horaAcidente: r.horaAcidente || "",
      tipoAcidente: tipoSel, tipoAcidenteOutro: tipoOutro, gravidade: r.gravidade,
      localAcidente: r.localAcidente || "", parteCorpoAtingida: r.parteCorpoAtingida || "",
      agenteCausador: r.agenteCausador || "", descricao: r.descricao || "",
      testemunhas: r.testemunhas || "", diasAfastamento: r.diasAfastamento || 0,
      houveCAT: r.houveCAT || 0, catNumero: r.catNumero || "", catData: r.catData || "",
      motivoSemCAT: r.motivoSemCAT || "", acaoCorretiva: r.acaoCorretiva || "",
      statusAcaoCorretiva: r.statusAcaoCorretiva || "Pendente",
      prazoAcaoCorretiva: r.prazoAcaoCorretiva || "", responsavelAcao: r.responsavelAcao || "",
      atestadoId: r.atestadoId ?? null,
    });
    setEmployeeSearch("");
    setObraSearch("");
    setOpen(true);
  }

  function aplicarAtestado(at: any) {
    setForm((f: any) => {
      const next: any = { ...f, atestadoId: at.id };
      // Auto-preenche data do acidente com a emissão
      if (at.dataEmissao) next.dataAcidente = at.dataEmissao;
      // Auto-preenche dias de afastamento
      const dias = at.afastamentoTipo === "horas" ? 0 : (at.diasAfastamento || 0);
      if (dias > 0) {
        next.diasAfastamento = dias;
        // Sugere gravidade mínima compatível
        if (GRAV_SEM_CAT.has(f.gravidade)) {
          next.gravidade = "Leve com afastamento";
        }
      }
      // Se o atestado tem CID/motivo, complementa a descrição
      const partes: string[] = [];
      if (f.descricao?.trim()) partes.push(f.descricao.trim());
      if (at.cid && !f.descricao?.includes(at.cid)) partes.push(`CID: ${at.cid}`);
      if (at.motivo && !f.descricao?.toLowerCase().includes(String(at.motivo).toLowerCase())) {
        partes.push(`Motivo do atestado: ${at.motivo}`);
      }
      if (at.medico && !f.descricao?.toLowerCase().includes(String(at.medico).toLowerCase())) {
        partes.push(`Médico: ${at.medico}${at.crm ? ` (CRM ${at.crm})` : ""}`);
      }
      next.descricao = partes.join(" • ");
      return next;
    });
    toast.success("Atestado vinculado e dados preenchidos");
  }

  function desvincularAtestado() {
    setForm((f: any) => ({ ...f, atestadoId: null }));
    toast.info("Atestado desvinculado");
  }

  const atestadoVinculado = useMemo(() => {
    if (!form.atestadoId) return null;
    return (atestadosFuncQ.data ?? []).find((a: any) => a.id === form.atestadoId) || null;
  }, [form.atestadoId, atestadosFuncQ.data]);

  const exigeCAT = !GRAV_SEM_CAT.has(form.gravidade);
  const formProgress = useMemo(() => {
    let done = 0; const total = 6;
    if (form.employeeId) done++;
    if (form.dataAcidente) done++;
    if (form.tipoAcidente && form.gravidade) done++;
    if (form.localAcidente || form.parteCorpoAtingida || form.agenteCausador) done++;
    if (form.descricao && form.descricao.length >= 10) done++;
    if (!exigeCAT || form.houveCAT || (form.motivoSemCAT && form.motivoSemCAT.length >= 5)) done++;
    return Math.round((done / total) * 100);
  }, [form, exigeCAT]);

  function submit() {
    if (!form.employeeId) { toast.error("Selecione o funcionário"); return; }
    if (!form.dataAcidente) { toast.error("Informe a data"); return; }
    if (!form.tipoAcidente) { toast.error("Informe o tipo"); return; }
    if (form.tipoAcidente === "Outro" && !form.tipoAcidenteOutro?.trim()) {
      toast.error("Descreva o tipo de acidente no campo 'Outro'"); return;
    }
    if (!form.gravidade) { toast.error("Informe a gravidade"); return; }
    const tipoFinal = form.tipoAcidente === "Outro"
      ? `Outro: ${form.tipoAcidenteOutro.trim()}`
      : form.tipoAcidente;
    if (exigeCAT && !form.houveCAT && !form.motivoSemCAT?.trim()) {
      toast.error("Informe a justificativa para 'Sem CAT'"); return;
    }
    save.mutate({
      id: editId ?? undefined,
      companyId: queryCompanyId,
      employeeId: parseInt(form.employeeId, 10),
      obraId: form.obraId ? parseInt(form.obraId, 10) : null,
      dataAcidente: form.dataAcidente,
      horaAcidente: form.horaAcidente || null,
      tipoAcidente: tipoFinal,
      gravidade: form.gravidade,
      localAcidente: form.localAcidente || null,
      parteCorpoAtingida: form.parteCorpoAtingida || null,
      agenteCausador: form.agenteCausador || null,
      descricao: form.descricao || null,
      testemunhas: form.testemunhas || null,
      diasAfastamento: parseInt(String(form.diasAfastamento || 0), 10) || 0,
      houveCAT: form.houveCAT ? 1 : 0,
      catNumero: form.houveCAT ? (form.catNumero || null) : null,
      catData: form.houveCAT ? (form.catData || null) : null,
      motivoSemCAT: !form.houveCAT ? (form.motivoSemCAT || null) : null,
      acaoCorretiva: form.acaoCorretiva || null,
      statusAcaoCorretiva: form.statusAcaoCorretiva || "Pendente",
      prazoAcaoCorretiva: form.prazoAcaoCorretiva || null,
      responsavelAcao: form.responsavelAcao || null,
      atestadoId: form.atestadoId ?? null,
    } as any);
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 md:p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="h-7 w-7 text-red-600" />
              Registro de Acidentes & Incidentes
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Cadastre acidentes, quase-acidentes, CATs, ações corretivas e acompanhe o histórico SST.
            </p>
          </div>
          <Button onClick={openNovo} className="gap-2"><Plus className="h-4 w-4" /> Novo Registro</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-red-50 border-red-200 border">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-xs uppercase text-gray-600">Total no Período</p><p className="text-2xl font-bold text-red-700">{kpis.total}</p></div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </CardContent>
          </Card>
          <Card className="bg-orange-50 border-orange-200 border">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-xs uppercase text-gray-600">Com Afastamento</p><p className="text-2xl font-bold text-orange-700">{kpis.comAfast}</p></div>
              <Clock className="h-8 w-8 text-orange-600" />
            </CardContent>
          </Card>
          <Card className="bg-amber-50 border-amber-200 border">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-xs uppercase text-gray-600">Sem CAT (exigida)</p><p className="text-2xl font-bold text-amber-700">{kpis.semCAT}</p></div>
              <FileWarning className="h-8 w-8 text-amber-600" />
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border-blue-200 border">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-xs uppercase text-gray-600">Ações em Aberto</p><p className="text-2xl font-bold text-blue-700">{kpis.acoesPendentes}</p></div>
              <Activity className="h-8 w-8 text-blue-600" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-3 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="h-4 w-4 absolute left-2.5 top-3 text-gray-400" />
              <Input placeholder="Buscar por funcionário, tipo, local, obra..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" />
            </div>
            <Select value={filtroGrav} onValueChange={setFiltroGrav}>
              <SelectTrigger className="w-full md:w-56"><SelectValue placeholder="Gravidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as gravidades</SelectItem>
                {GRAVIDADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroObra} onValueChange={setFiltroObra}>
              <SelectTrigger className="w-full md:w-56"><SelectValue placeholder="Obra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as obras</SelectItem>
                {(obrasQ.data ?? []).map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Registros ({rows.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Funcionário</th>
                    <th className="px-3 py-2 text-left">Obra</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Gravidade</th>
                    <th className="px-3 py-2 text-left">Parte Corpo</th>
                    <th className="px-3 py-2 text-right">Dias</th>
                    <th className="px-3 py-2 text-center">CAT</th>
                    <th className="px-3 py-2 text-center">Atestado</th>
                    <th className="px-3 py-2 text-left">Ação</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.isLoading && (<tr><td colSpan={11} className="p-6 text-center text-gray-500">Carregando...</td></tr>)}
                  {!list.isLoading && rows.length === 0 && (<tr><td colSpan={11} className="p-6 text-center text-gray-500">Nenhum registro encontrado.</td></tr>)}
                  {rows.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5"><Calendar className="h-3 w-3 text-gray-400" />{r.dataAcidente}</div>
                        {r.horaAcidente && <div className="text-[10px] text-gray-500 ml-4">{r.horaAcidente}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.employeeNome || `#${r.employeeId}`}</div>
                        <div className="text-[11px] text-gray-500">{r.employeeFuncao || r.employeeCargo || "—"}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{r.obraNome || "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{r.tipoAcidente}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className={GRAV_COLORS[r.gravidade] || ""}>{r.gravidade}</Badge></td>
                      <td className="px-3 py-2 text-gray-700">{r.parteCorpoAtingida || "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold">{r.diasAfastamento || 0}</td>
                      <td className="px-3 py-2 text-center">
                        {r.houveCAT
                          ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300" variant="outline"><CheckCircle2 className="h-3 w-3 mr-1" />{r.catNumero || "Sim"}</Badge>
                          : <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300"><XCircle className="h-3 w-3 mr-1" />Não</Badge>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.atestadoId
                          ? <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-300"><Link2 className="h-3 w-3 mr-1" />#{r.atestadoId}</Badge>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {r.statusAcaoCorretiva ? <Badge variant="outline" className={STATUS_COLORS[r.statusAcaoCorretiva] || ""}>{r.statusAcaoCorretiva}</Badge> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { if (confirm("Excluir este registro?")) del.mutate({ id: r.id, companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) } as any); }}><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ================== FORMULÁRIO TELA CHEIA ================== */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            resizable={false}
            className="max-w-none w-screen h-screen sm:w-[98vw] sm:h-[96vh] p-0 overflow-hidden flex flex-col gap-0 sm:rounded-xl border-0 sm:border"
            onInteractOutside={(e) => e.preventDefault()}
          >
            {/* Header fixo */}
            <div className="bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-white/20 rounded-lg p-2 backdrop-blur-sm">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold truncate">{editId ? "Editar Acidente" : "Novo Registro de Acidente"}</h2>
                  <p className="text-white/80 text-xs">Preencha as informações do acidente. Campos com * são obrigatórios.</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden md:flex items-center gap-2">
                  <div className="text-xs text-white/90 font-medium">{formProgress}% preenchido</div>
                  <div className="w-32 h-2 bg-white/30 rounded-full overflow-hidden">
                    <div className="h-full bg-white transition-all" style={{ width: `${formProgress}%` }} />
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10" aria-label="Fechar">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Corpo com 2 colunas */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_360px]">
              {/* COLUNA PRINCIPAL */}
              <div className="overflow-y-auto p-5 md:p-6 space-y-5 bg-gray-50">

                {/* Seção 1: Funcionário & Obra */}
                <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-transparent flex items-center gap-2">
                    <div className="bg-blue-100 rounded p-1.5"><User className="h-4 w-4 text-blue-600" /></div>
                    <h3 className="font-semibold text-gray-900">Funcionário & Obra</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <Label className="text-xs">Buscar funcionário *</Label>
                      <div className="relative">
                        <Search className="h-4 w-4 absolute left-2.5 top-3 text-gray-400" />
                        <Input
                          placeholder="Digite nome, matrícula ou CPF..."
                          value={employeeSearch}
                          onChange={(e) => setEmployeeSearch(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                      {employeeSearch && (
                        <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg divide-y bg-white">
                          {employeesFiltered.length === 0 && <div className="p-3 text-sm text-gray-500 text-center">Nenhum funcionário</div>}
                          {employeesFiltered.map((e: any) => (
                            <button
                              key={e.id}
                              type="button"
                              onClick={() => { setForm({ ...form, employeeId: String(e.id) }); setEmployeeSearch(""); }}
                              className={`w-full text-left p-2.5 hover:bg-blue-50 flex items-center gap-2 ${String(e.id) === String(form.employeeId) ? "bg-blue-50" : ""}`}
                            >
                              <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                                {(e.nomeCompleto || "?").slice(0, 1)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-sm truncate">{e.nomeCompleto}</div>
                                <div className="text-[11px] text-gray-500 truncate">
                                  {e.matricula ? `#${e.matricula} · ` : ""}{e.funcao || e.cargo || "—"}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {empSelected && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center font-bold">
                          {(empSelected.nomeCompleto || "?").slice(0, 1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-900 truncate">{empSelected.nomeCompleto}</div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700 mt-0.5">
                            {empSelected.matricula && <span className="flex items-center gap-1"><IdCard className="h-3 w-3" />#{empSelected.matricula}</span>}
                            {empSelected.funcao && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{empSelected.funcao}</span>}
                            {empSelected.cpf && <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{empSelected.cpf}</span>}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, employeeId: "" })}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}

                    <div>
                      <Label className="text-xs">Obra</Label>
                      {obraSelected ? (
                        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 flex items-center gap-2 mt-1">
                          <div className="h-6 w-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                            O
                          </div>
                          <div className="flex-1 min-w-0 font-semibold text-gray-900 text-sm truncate">{obraSelected.nome}</div>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setForm({ ...form, obraId: "" }); setObraSearch(""); }}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="relative mt-1">
                          <Search className="h-4 w-4 absolute left-2.5 top-3 text-gray-400" />
                          <Input
                            placeholder="Buscar obra pelo nome..."
                            value={obraSearch}
                            onChange={(e) => setObraSearch(e.target.value)}
                            className="pl-8"
                          />
                          {(obraSearch || true) && (
                            <div className="mt-1 max-h-48 overflow-y-auto border rounded-lg divide-y bg-white shadow-sm">
                              <button
                                type="button"
                                onClick={() => { setForm({ ...form, obraId: "" }); setObraSearch(""); }}
                                className="w-full text-left p-2.5 text-sm text-gray-400 hover:bg-gray-50 italic"
                              >
                                — sem obra —
                              </button>
                              {obrasFiltered.length === 0 && <div className="p-3 text-sm text-gray-500 text-center">Nenhuma obra encontrada</div>}
                              {obrasFiltered.map((o: any) => (
                                <button
                                  key={o.id}
                                  type="button"
                                  onClick={() => { setForm({ ...form, obraId: String(o.id) }); setObraSearch(""); }}
                                  className="w-full text-left p-2.5 hover:bg-blue-50 text-sm"
                                >
                                  {o.nome}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Seção 2: Quando & Como */}
                <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-orange-50 to-transparent flex items-center gap-2">
                    <div className="bg-orange-100 rounded p-1.5"><Calendar className="h-4 w-4 text-orange-600" /></div>
                    <h3 className="font-semibold text-gray-900">Quando & Como aconteceu</h3>
                  </div>
                  <div className="p-4 grid md:grid-cols-4 gap-3">
                    <div className="min-w-0">
                      <Label className="text-xs">Data *</Label>
                      <Input type="date" value={form.dataAcidente} onChange={(e) => setForm({ ...form, dataAcidente: e.target.value })} />
                    </div>
                    <div className="min-w-0">
                      <Label className="text-xs">Hora</Label>
                      <Input type="time" value={form.horaAcidente} onChange={(e) => setForm({ ...form, horaAcidente: e.target.value })} />
                    </div>
                    <div className="min-w-0">
                      <Label className="text-xs">Tipo *</Label>
                      <Select value={form.tipoAcidente} onValueChange={(v) => setForm({ ...form, tipoAcidente: v })}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{TIPOS_ACIDENTE.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-0">
                      <Label className="text-xs">Gravidade *</Label>
                      <Select value={form.gravidade} onValueChange={(v) => setForm({ ...form, gravidade: v })}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>{GRAVIDADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                      </Select>
                      <Badge variant="outline" className={`mt-1.5 max-w-full truncate inline-block ${GRAV_COLORS[form.gravidade] || ""}`}>{form.gravidade}</Badge>
                    </div>
                    {form.tipoAcidente === "Outro" && (
                      <div className="md:col-span-4">
                        <Label className="text-xs flex items-center gap-1">
                          Descreva o tipo de acidente <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          value={form.tipoAcidenteOutro || ""}
                          onChange={(e) => setForm({ ...form, tipoAcidenteOutro: e.target.value })}
                          placeholder="Ex.: Picada de animal peçonhento, contato com fios elétricos energizados, etc."
                          maxLength={120}
                          autoFocus
                        />
                        <p className="text-[11px] text-gray-500 mt-1">Será registrado como “Outro: {form.tipoAcidenteOutro || "..."}”.</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Seção 3: Local / Lesão / Agente */}
                <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-transparent flex items-center gap-2">
                    <div className="bg-purple-100 rounded p-1.5"><MapPin className="h-4 w-4 text-purple-600" /></div>
                    <h3 className="font-semibold text-gray-900">Local, Lesão e Agente Causador</h3>
                  </div>
                  <div className="p-4 grid md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Local do acidente</Label>
                      <Input value={form.localAcidente} onChange={(e) => setForm({ ...form, localAcidente: e.target.value })} placeholder="Ex.: Pavimento 3, andaime A" />
                    </div>
                    <div>
                      <Label className="text-xs">Parte do corpo atingida</Label>
                      <Select value={form.parteCorpoAtingida || "__none__"} onValueChange={(v) => setForm({ ...form, parteCorpoAtingida: v === "__none__" ? "" : v })}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— não se aplica —</SelectItem>
                          {PARTES_CORPO.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Agente causador</Label>
                      <Input value={form.agenteCausador} onChange={(e) => setForm({ ...form, agenteCausador: e.target.value })} placeholder="Ex.: Furadeira, escada, peça em queda" />
                    </div>
                  </div>
                </section>

                {/* Seção 4: Descrição & Testemunhas */}
                <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-transparent flex items-center gap-2">
                    <div className="bg-slate-100 rounded p-1.5"><FileText className="h-4 w-4 text-slate-600" /></div>
                    <h3 className="font-semibold text-gray-900">Descrição do Acidente</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <Label className="text-xs">Como ocorreu? Sequência de eventos, condições do ambiente</Label>
                      <Textarea rows={4} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Descreva detalhadamente o ocorrido..." />
                      <div className="text-[11px] text-gray-500 mt-1">{(form.descricao || "").length} caracteres</div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Testemunhas</Label>
                        <Input value={form.testemunhas} onChange={(e) => setForm({ ...form, testemunhas: e.target.value })} placeholder="Nomes (separar por vírgula)" />
                      </div>
                      <div>
                        <Label className="text-xs">Dias de afastamento</Label>
                        <Input type="number" min={0} value={form.diasAfastamento} onChange={(e) => setForm({ ...form, diasAfastamento: e.target.value })} />
                      </div>
                    </div>
                  </div>
                </section>

                {/* Seção 5: CAT */}
                <section className={`bg-white rounded-xl border shadow-sm ${exigeCAT ? "border-amber-300" : "border-gray-200"}`}>
                  <div className={`px-4 py-3 border-b flex items-center justify-between gap-2 ${exigeCAT ? "bg-amber-50" : "bg-gray-50"}`}>
                    <div className="flex items-center gap-2">
                      <div className={`rounded p-1.5 ${exigeCAT ? "bg-amber-100" : "bg-gray-100"}`}>
                        <ShieldAlert className={`h-4 w-4 ${exigeCAT ? "text-amber-700" : "text-gray-500"}`} />
                      </div>
                      <h3 className="font-semibold text-gray-900">Comunicação de Acidente de Trabalho (CAT)</h3>
                      {exigeCAT && <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">CAT exigida</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Houve CAT?</Label>
                      <Select value={form.houveCAT ? "1" : "0"} onValueChange={(v) => setForm({ ...form, houveCAT: v === "1" ? 1 : 0 })}>
                        <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="1">Sim</SelectItem><SelectItem value="0">Não</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="p-4">
                    {form.houveCAT ? (
                      <div className="grid md:grid-cols-2 gap-3">
                        <div><Label className="text-xs">Nº CAT</Label><Input value={form.catNumero} onChange={(e) => setForm({ ...form, catNumero: e.target.value })} placeholder="Ex.: 2026123456" /></div>
                        <div><Label className="text-xs">Data CAT</Label><Input type="date" value={form.catData} onChange={(e) => setForm({ ...form, catData: e.target.value })} /></div>
                      </div>
                    ) : (
                      <div>
                        <Label className="text-xs">Justificativa para não emissão da CAT {exigeCAT && <span className="text-red-600">*</span>}</Label>
                        <Textarea rows={2} value={form.motivoSemCAT} onChange={(e) => setForm({ ...form, motivoSemCAT: e.target.value })} placeholder={exigeCAT ? "Obrigatório (mínimo 5 caracteres)" : "Opcional"} />
                      </div>
                    )}
                  </div>
                </section>

                {/* Seção 6: Ação Corretiva */}
                <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="px-4 py-3 border-b bg-gradient-to-r from-emerald-50 to-transparent flex items-center gap-2">
                    <div className="bg-emerald-100 rounded p-1.5"><Activity className="h-4 w-4 text-emerald-600" /></div>
                    <h3 className="font-semibold text-gray-900">Ação Corretiva</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <Label className="text-xs">Descrição da ação para evitar recorrência</Label>
                      <Textarea rows={3} value={form.acaoCorretiva} onChange={(e) => setForm({ ...form, acaoCorretiva: e.target.value })} placeholder="O que será feito para que não se repita?" />
                    </div>
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Status</Label>
                        <Select value={form.statusAcaoCorretiva} onValueChange={(v) => setForm({ ...form, statusAcaoCorretiva: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{STATUS_ACAO.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-xs">Responsável</Label><Input value={form.responsavelAcao} onChange={(e) => setForm({ ...form, responsavelAcao: e.target.value })} /></div>
                      <div><Label className="text-xs">Prazo</Label><Input type="date" value={form.prazoAcaoCorretiva} onChange={(e) => setForm({ ...form, prazoAcaoCorretiva: e.target.value })} /></div>
                    </div>
                  </div>
                </section>
              </div>

              {/* COLUNA LATERAL: VÍNCULO COM ATESTADO */}
              <aside className="border-l border-gray-200 bg-white overflow-y-auto p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="bg-indigo-100 rounded p-1.5"><Stethoscope className="h-4 w-4 text-indigo-600" /></div>
                  <h3 className="font-semibold text-gray-900">Atestado vinculado</h3>
                </div>
                <p className="text-xs text-gray-600 -mt-2">
                  Vincule o atestado médico do funcionário (módulo <strong>Documentos</strong>) ao acidente para garantir o controle e auto-preenchimento de afastamento.
                </p>

                {!form.employeeId && (
                  <div className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                    <User className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                    Selecione o funcionário para ver os atestados disponíveis.
                  </div>
                )}

                {form.employeeId && atestadoVinculado && (
                  <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-indigo-600 text-white border-indigo-600"><Link2 className="h-3 w-3 mr-1" />Vinculado</Badge>
                      <Button variant="ghost" size="sm" onClick={desvincularAtestado} className="h-7 text-xs">
                        <X className="h-3 w-3 mr-1" />Desvincular
                      </Button>
                    </div>
                    <div className="font-semibold text-sm text-gray-900">Atestado #{atestadoVinculado.id} · {atestadoVinculado.tipo}</div>
                    <div className="text-xs text-gray-700 grid grid-cols-2 gap-y-1">
                      <span>Emissão: <strong>{atestadoVinculado.dataEmissao}</strong></span>
                      {atestadoVinculado.dataRetorno && <span>Retorno: <strong>{atestadoVinculado.dataRetorno}</strong></span>}
                      {(atestadoVinculado.diasAfastamento ?? 0) > 0 && <span>Dias: <strong>{atestadoVinculado.diasAfastamento}</strong></span>}
                      {atestadoVinculado.cid && <span>CID: <strong>{atestadoVinculado.cid}</strong></span>}
                    </div>
                    {atestadoVinculado.medico && (
                      <div className="text-xs text-gray-600">
                        Médico: {atestadoVinculado.medico}{atestadoVinculado.crm ? ` · CRM ${atestadoVinculado.crm}` : ""}
                      </div>
                    )}
                    {atestadoVinculado.documentoUrl && (
                      <a href={atestadoVinculado.documentoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline">
                        <ExternalLink className="h-3 w-3" /> Abrir documento
                      </a>
                    )}
                  </div>
                )}

                {form.employeeId && !atestadoVinculado && (
                  <>
                    {atestadosFuncQ.isLoading && <div className="text-xs text-gray-500">Carregando atestados...</div>}
                    {!atestadosFuncQ.isLoading && atestadosSugeridos.length === 0 && (
                      <div className="rounded-lg border-2 border-dashed border-gray-200 p-5 text-center">
                        <FileWarning className="h-7 w-7 mx-auto text-gray-300 mb-2" />
                        <div className="text-sm text-gray-600">Nenhum atestado encontrado para este funcionário.</div>
                        <div className="text-[11px] text-gray-500 mt-1">Crie o atestado no módulo Documentos para vincular aqui.</div>
                      </div>
                    )}
                    {atestadosSugeridos.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-medium text-gray-500 uppercase flex items-center gap-1">
                          <Sparkles className="h-3 w-3 text-indigo-500" />
                          Sugestões (mais próximos da data do acidente)
                        </div>
                        {atestadosSugeridos.map((at: any) => {
                          const dist = form.dataAcidente ? Math.abs(diffDays(at.dataEmissao, form.dataAcidente)) : null;
                          const proximo = dist !== null && dist <= 3;
                          return (
                            <div
                              key={at.id}
                              className={`rounded-lg border p-2.5 hover:shadow-md transition cursor-pointer ${proximo ? "border-indigo-300 bg-indigo-50/50" : "border-gray-200 bg-white"}`}
                              onClick={() => aplicarAtestado(at)}
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-1.5">
                                  <FileCheck2 className="h-3.5 w-3.5 text-indigo-600" />
                                  <span className="font-semibold text-sm">#{at.id}</span>
                                  <Badge variant="outline" className="text-[10px] py-0">{at.tipo}</Badge>
                                </div>
                                {proximo && <Badge className="bg-indigo-100 text-indigo-700 border-indigo-300 text-[10px]"><Sparkles className="h-2.5 w-2.5 mr-0.5" />sugerido</Badge>}
                                {at.jaVinculadoAoAcidenteId && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px]">já vinculado</Badge>}
                              </div>
                              <div className="text-xs text-gray-700 flex flex-wrap gap-x-3 gap-y-0.5">
                                <span>📅 {at.dataEmissao}</span>
                                {(at.diasAfastamento ?? 0) > 0 && <span>{at.diasAfastamento}d afast.</span>}
                                {at.cid && <span>CID {at.cid}</span>}
                                {dist !== null && <span className="text-gray-500">({dist}d {form.dataAcidente && new Date(at.dataEmissao) <= new Date(form.dataAcidente) ? "antes" : "depois"})</span>}
                              </div>
                              {at.motivo && <div className="text-[11px] text-gray-500 mt-1 truncate">{at.motivo}</div>}
                              <Button size="sm" variant="outline" className="w-full mt-2 h-7 text-xs">
                                <Link2 className="h-3 w-3 mr-1" /> Vincular este atestado
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </aside>
            </div>

            {/* Footer fixo */}
            <div className="border-t bg-white px-6 py-3 flex items-center justify-between gap-3">
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <span className="md:hidden">{formProgress}% preenchido</span>
                {form.atestadoId && (
                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-300">
                    <Link2 className="h-3 w-3 mr-1" />Atestado #{form.atestadoId} vinculado
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={submit} disabled={save.isPending} className="bg-red-600 hover:bg-red-700 min-w-32">
                  {save.isPending ? "Salvando..." : (editId ? "Salvar alterações" : "Registrar acidente")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
