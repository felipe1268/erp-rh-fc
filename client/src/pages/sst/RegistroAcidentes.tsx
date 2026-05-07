import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  AlertTriangle, Plus, Search, Pencil, Trash2, FileWarning,
  Activity, Calendar, MapPin, Clock, CheckCircle2, XCircle,
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

function emptyForm(): any {
  return {
    employeeId: "", obraId: "",
    dataAcidente: new Date().toISOString().slice(0, 10),
    horaAcidente: "",
    tipoAcidente: "Queda mesmo nível",
    gravidade: "Leve sem afastamento",
    localAcidente: "", parteCorpoAtingida: "", agenteCausador: "",
    descricao: "", testemunhas: "",
    diasAfastamento: 0,
    houveCAT: 0, catNumero: "", catData: "", motivoSemCAT: "",
    acaoCorretiva: "", statusAcaoCorretiva: "Pendente",
    prazoAcaoCorretiva: "", responsavelAcao: "",
  };
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

  const list = trpc.acidentes.list.useQuery(
    {
      companyId: queryCompanyId,
      ...(isConstrutoras ? { companyIds } : {}),
      ...(filtroGrav !== "__all__" ? { gravidade: filtroGrav } : {}),
      ...(filtroObra !== "__all__" ? { obraId: parseInt(filtroObra, 10) } : {}),
    },
    { enabled: hasValidCompany },
  );

  const obrasQ = trpc.obras.list.useQuery({ companyId: queryCompanyId }, { enabled: hasValidCompany });
  const employeesQ = trpc.employees.list.useQuery(
    { companyId: queryCompanyId, ...(isConstrutoras ? { companyIds } : {}) } as any,
    { enabled: hasValidCompany },
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

  function openNovo() {
    setForm(emptyForm()); setEditId(null); setOpen(true);
  }
  function openEdit(r: any) {
    setEditId(r.id);
    setForm({
      employeeId: r.employeeId, obraId: r.obraId ?? "",
      dataAcidente: r.dataAcidente, horaAcidente: r.horaAcidente || "",
      tipoAcidente: r.tipoAcidente, gravidade: r.gravidade,
      localAcidente: r.localAcidente || "", parteCorpoAtingida: r.parteCorpoAtingida || "",
      agenteCausador: r.agenteCausador || "", descricao: r.descricao || "",
      testemunhas: r.testemunhas || "", diasAfastamento: r.diasAfastamento || 0,
      houveCAT: r.houveCAT || 0, catNumero: r.catNumero || "", catData: r.catData || "",
      motivoSemCAT: r.motivoSemCAT || "", acaoCorretiva: r.acaoCorretiva || "",
      statusAcaoCorretiva: r.statusAcaoCorretiva || "Pendente",
      prazoAcaoCorretiva: r.prazoAcaoCorretiva || "", responsavelAcao: r.responsavelAcao || "",
    });
    setOpen(true);
  }

  function submit() {
    if (!form.employeeId) { toast.error("Selecione o funcionário"); return; }
    if (!form.dataAcidente) { toast.error("Informe a data"); return; }
    if (!form.tipoAcidente) { toast.error("Informe o tipo"); return; }
    if (!form.gravidade) { toast.error("Informe a gravidade"); return; }
    const exigeCAT = !["Quase-acidente", "Primeiros Socorros"].includes(form.gravidade);
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
      tipoAcidente: form.tipoAcidente,
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
                    <th className="px-3 py-2 text-left">Ação</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.isLoading && (<tr><td colSpan={10} className="p-6 text-center text-gray-500">Carregando...</td></tr>)}
                  {!list.isLoading && rows.length === 0 && (<tr><td colSpan={10} className="p-6 text-center text-gray-500">Nenhum registro encontrado.</td></tr>)}
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

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Acidente" : "Novo Registro de Acidente"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <Label>Funcionário *</Label>
                  <Select value={form.employeeId ? String(form.employeeId) : ""} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {(employeesQ.data ?? []).map((e: any) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}{e.matricula ? ` · #${e.matricula}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Obra</Label>
                  <Select value={form.obraId ? String(form.obraId) : "__none__"} onValueChange={(v) => setForm({ ...form, obraId: v === "__none__" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— sem obra —</SelectItem>
                      {(obrasQ.data ?? []).map((o: any) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-4 gap-3">
                <div>
                  <Label>Data *</Label>
                  <Input type="date" value={form.dataAcidente} onChange={(e) => setForm({ ...form, dataAcidente: e.target.value })} />
                </div>
                <div>
                  <Label>Hora</Label>
                  <Input type="time" value={form.horaAcidente} onChange={(e) => setForm({ ...form, horaAcidente: e.target.value })} />
                </div>
                <div>
                  <Label>Tipo *</Label>
                  <Select value={form.tipoAcidente} onValueChange={(v) => setForm({ ...form, tipoAcidente: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIPOS_ACIDENTE.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Gravidade *</Label>
                  <Select value={form.gravidade} onValueChange={(v) => setForm({ ...form, gravidade: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{GRAVIDADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <Label>Local</Label>
                  <Input value={form.localAcidente} onChange={(e) => setForm({ ...form, localAcidente: e.target.value })} placeholder="Ex.: Pavimento 3, andaime A" />
                </div>
                <div>
                  <Label>Parte do Corpo</Label>
                  <Select value={form.parteCorpoAtingida || "__none__"} onValueChange={(v) => setForm({ ...form, parteCorpoAtingida: v === "__none__" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— não se aplica —</SelectItem>
                      {PARTES_CORPO.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Agente Causador</Label>
                  <Input value={form.agenteCausador} onChange={(e) => setForm({ ...form, agenteCausador: e.target.value })} placeholder="Ex.: Furadeira, escada, peça em queda" />
                </div>
              </div>

              <div>
                <Label>Descrição do Acidente</Label>
                <Textarea rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Como ocorreu, sequência de eventos, condições do ambiente..." />
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>Testemunhas</Label>
                  <Input value={form.testemunhas} onChange={(e) => setForm({ ...form, testemunhas: e.target.value })} placeholder="Nomes (separar por vírgula)" />
                </div>
                <div>
                  <Label>Dias de Afastamento</Label>
                  <Input type="number" min={0} value={form.diasAfastamento} onChange={(e) => setForm({ ...form, diasAfastamento: e.target.value })} />
                </div>
              </div>

              <div className="border rounded-lg p-3 bg-amber-50/50">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-base font-semibold flex items-center gap-2"><FileWarning className="h-4 w-4 text-amber-600" /> Comunicação de Acidente de Trabalho (CAT)</Label>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Houve CAT?</Label>
                    <Select value={form.houveCAT ? "1" : "0"} onValueChange={(v) => setForm({ ...form, houveCAT: v === "1" ? 1 : 0 })}>
                      <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="1">Sim</SelectItem><SelectItem value="0">Não</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                {form.houveCAT ? (
                  <div className="grid md:grid-cols-2 gap-3">
                    <div><Label className="text-xs">Nº CAT</Label><Input value={form.catNumero} onChange={(e) => setForm({ ...form, catNumero: e.target.value })} /></div>
                    <div><Label className="text-xs">Data CAT</Label><Input type="date" value={form.catData} onChange={(e) => setForm({ ...form, catData: e.target.value })} /></div>
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs">Justificativa para não emissão da CAT</Label>
                    <Textarea rows={2} value={form.motivoSemCAT} onChange={(e) => setForm({ ...form, motivoSemCAT: e.target.value })} placeholder="Obrigatório quando a gravidade não é 'Quase-acidente' nem 'Primeiros Socorros'" />
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-3 bg-blue-50/50">
                <Label className="text-base font-semibold flex items-center gap-2 mb-2"><Activity className="h-4 w-4 text-blue-600" /> Ação Corretiva</Label>
                <Textarea rows={2} value={form.acaoCorretiva} onChange={(e) => setForm({ ...form, acaoCorretiva: e.target.value })} placeholder="Descreva a ação para evitar recorrência" className="mb-2" />
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
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
