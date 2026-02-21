import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatCPF } from "@/lib/formatters";
import {
  Search, FileText, AlertTriangle, ShieldAlert, GraduationCap, Stethoscope,
  Plus, Upload, Download, Eye, Trash2, FileUp, ClipboardList, Calendar
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

// ============ HELPER: Status Badge ============
function StatusBadge({ status, diasRestantes }: { status: string; diasRestantes: number }) {
  if (status === "VENCIDO") return <Badge variant="destructive">VENCIDO</Badge>;
  if (status.includes("DIAS PARA VENCER")) {
    const cor = diasRestantes <= 7 ? "bg-red-100 text-red-800" : diasRestantes <= 30 ? "bg-yellow-100 text-yellow-800" : "bg-orange-100 text-orange-800";
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cor}`}>{status}</span>;
  }
  return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">VÁLIDO</Badge>;
}

// ============ HELPER: Tipo ASO formatado ============
function formatTipoASO(tipo: string) {
  const map: Record<string, string> = {
    Admissional: "Admissional",
    Periodico: "Periódico",
    Retorno: "Retorno ao Trabalho",
    Mudanca_Funcao: "Mudança de Função",
    Demissional: "Demissional",
  };
  return map[tipo] || tipo;
}

function formatTipoAdv(tipo: string) {
  const map: Record<string, string> = { Verbal: "Verbal", Escrita: "Escrita", Suspensao: "Suspensão", OSS: "OSS" };
  return map[tipo] || tipo;
}

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

export default function ControleDocumentos() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("aso");

  // ============ QUERIES ============
  const { data: resumo } = trpc.docs.resumo.useQuery({ companyId }, { enabled: !!companyId });
  const { data: asoList = [], refetch: refetchAso } = trpc.docs.asos.list.useQuery({ companyId }, { enabled: !!companyId });
  const { data: treinList = [], refetch: refetchTrein } = trpc.docs.treinamentos.list.useQuery({ companyId }, { enabled: !!companyId });
  const { data: atestList = [], refetch: refetchAtest } = trpc.docs.atestados.list.useQuery({ companyId }, { enabled: !!companyId });
  const { data: advList = [], refetch: refetchAdv } = trpc.docs.advertencias.list.useQuery({ companyId }, { enabled: !!companyId });
  const { data: employees = [] } = trpc.employees.list.useQuery({ companyId }, { enabled: !!companyId });

  // ============ MUTATIONS ============
  const createAso = trpc.docs.asos.create.useMutation({ onSuccess: () => { refetchAso(); toast.success("ASO cadastrado!"); } });
  const deleteAso = trpc.docs.asos.delete.useMutation({ onSuccess: () => { refetchAso(); toast.success("ASO excluído!"); } });
  const uploadAsoDoc = trpc.docs.asos.uploadDoc.useMutation({ onSuccess: () => { refetchAso(); toast.success("Documento anexado!"); } });

  const createTrein = trpc.docs.treinamentos.create.useMutation({ onSuccess: () => { refetchTrein(); toast.success("Treinamento cadastrado!"); } });
  const deleteTrein = trpc.docs.treinamentos.delete.useMutation({ onSuccess: () => { refetchTrein(); toast.success("Treinamento excluído!"); } });
  const uploadTreinDoc = trpc.docs.treinamentos.uploadDoc.useMutation({ onSuccess: () => { refetchTrein(); toast.success("Certificado anexado!"); } });

  const createAtest = trpc.docs.atestados.create.useMutation({ onSuccess: () => { refetchAtest(); toast.success("Atestado cadastrado!"); } });
  const deleteAtest = trpc.docs.atestados.delete.useMutation({ onSuccess: () => { refetchAtest(); toast.success("Atestado excluído!"); } });
  const uploadAtestDoc = trpc.docs.atestados.uploadDoc.useMutation({ onSuccess: () => { refetchAtest(); toast.success("Documento anexado!"); } });

  const createAdv = trpc.docs.advertencias.create.useMutation({ onSuccess: () => { refetchAdv(); toast.success("Advertência cadastrada!"); } });
  const deleteAdv = trpc.docs.advertencias.delete.useMutation({ onSuccess: () => { refetchAdv(); toast.success("Advertência excluída!"); } });
  const uploadAdvDoc = trpc.docs.advertencias.uploadDoc.useMutation({ onSuccess: () => { refetchAdv(); toast.success("Documento anexado!"); } });

  const importAso = trpc.docs.asos.importBatch.useMutation({ onSuccess: (r) => { refetchAso(); toast.success(`${r.imported} ASOs importados!`); } });

  // ============ DIALOGS ============
  const [showNewAso, setShowNewAso] = useState(false);
  const [showNewTrein, setShowNewTrein] = useState(false);
  const [showNewAtest, setShowNewAtest] = useState(false);
  const [showNewAdv, setShowNewAdv] = useState(false);
  const [showImportAso, setShowImportAso] = useState(false);

  // ============ FORM STATES ============
  const [asoForm, setAsoForm] = useState<any>({});
  const [treinForm, setTreinForm] = useState<any>({});
  const [atestForm, setAtestForm] = useState<any>({});
  const [advForm, setAdvForm] = useState<any>({});

  // ============ FILTER ============
  const [statusFilter, setStatusFilter] = useState("todos");

  const filteredAso = useMemo(() => {
    let list = asoList as any[];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((a: any) => a.nomeCompleto?.toLowerCase().includes(s) || a.cpf?.includes(s));
    }
    if (statusFilter === "valido") list = list.filter((a: any) => a.status === "VÁLIDO");
    else if (statusFilter === "vencer") list = list.filter((a: any) => a.status?.includes("DIAS PARA VENCER"));
    else if (statusFilter === "vencido") list = list.filter((a: any) => a.status === "VENCIDO");
    return list;
  }, [asoList, search, statusFilter]);

  const filteredTrein = useMemo(() => {
    let list = treinList as any[];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((t: any) => t.nomeCompleto?.toLowerCase().includes(s) || t.nome?.toLowerCase().includes(s));
    }
    return list;
  }, [treinList, search]);

  const filteredAtest = useMemo(() => {
    let list = atestList as any[];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((a: any) => a.nomeCompleto?.toLowerCase().includes(s));
    }
    return list;
  }, [atestList, search]);

  const filteredAdv = useMemo(() => {
    let list = advList as any[];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((a: any) => a.nomeCompleto?.toLowerCase().includes(s));
    }
    return list;
  }, [advList, search]);

  // ============ UPLOAD HANDLER ============
  const handleUploadDoc = async (type: string, id: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png";
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        try {
          if (type === "aso") await uploadAsoDoc.mutateAsync({ id, fileBase64: base64, fileName: file.name });
          else if (type === "trein") await uploadTreinDoc.mutateAsync({ id, fileBase64: base64, fileName: file.name });
          else if (type === "atest") await uploadAtestDoc.mutateAsync({ id, fileBase64: base64, fileName: file.name });
          else if (type === "adv") await uploadAdvDoc.mutateAsync({ id, fileBase64: base64, fileName: file.name });
        } catch { toast.error("Erro ao enviar documento"); }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // ============ SUBMIT HANDLERS ============
  const handleSubmitAso = () => {
    if (!asoForm.employeeId || !asoForm.tipo || !asoForm.dataExame) {
      toast.error("Preencha os campos obrigatórios"); return;
    }
    createAso.mutate({ companyId, ...asoForm, validadeDias: asoForm.validadeDias || 365 });
    setShowNewAso(false);
    setAsoForm({});
  };

  const handleSubmitTrein = () => {
    if (!treinForm.employeeId || !treinForm.nome || !treinForm.dataRealizacao) {
      toast.error("Preencha os campos obrigatórios"); return;
    }
    createTrein.mutate({ companyId, ...treinForm });
    setShowNewTrein(false);
    setTreinForm({});
  };

  const handleSubmitAtest = () => {
    if (!atestForm.employeeId || !atestForm.tipo || !atestForm.dataEmissao) {
      toast.error("Preencha os campos obrigatórios"); return;
    }
    createAtest.mutate({ companyId, ...atestForm, diasAfastamento: atestForm.diasAfastamento || 0 });
    setShowNewAtest(false);
    setAtestForm({});
  };

  const handleSubmitAdv = () => {
    if (!advForm.employeeId || !advForm.tipoAdvertencia || !advForm.dataOcorrencia || !advForm.motivo) {
      toast.error("Preencha os campos obrigatórios"); return;
    }
    createAdv.mutate({ companyId, ...advForm });
    setShowNewAdv(false);
    setAdvForm({});
  };

  // ============ IMPORT ASO ============
  const [importFile, setImportFile] = useState<File | null>(null);
  const handleImportAso = async () => {
    if (!importFile) { toast.error("Selecione um arquivo"); return; }
    const text = await importFile.text();
    const lines = text.split("\n").filter(l => l.trim());
    const records: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("\t");
      if (cols.length < 4) continue;
      const name = cols[1]?.trim();
      const tipo = cols[2]?.trim();
      const dataStr = cols[3]?.trim();
      if (!name || !tipo || !dataStr) continue;

      // Parse date dd/mm/yyyy to yyyy-mm-dd
      const parts = dataStr.split("/");
      let dataExame = dataStr;
      if (parts.length === 3) dataExame = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;

      const validadeDias = parseInt(cols[4]) || 365;
      const resultado = cols[7]?.trim() || "Apto";
      const medico = cols[8]?.trim() || "";
      const crm = cols[9]?.trim() || "";
      const jaAtualizou = cols[10]?.trim()?.toLowerCase() === "sim";
      const exames = cols[11]?.trim() || "";

      records.push({ employeeName: name, tipo, dataExame, validadeDias, resultado, medico, crm, jaAtualizou, examesRealizados: exames });
    }

    if (records.length === 0) { toast.error("Nenhum registro encontrado no arquivo"); return; }
    importAso.mutate({ companyId, records });
    setShowImportAso(false);
    setImportFile(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Controle de Documentos</h1>
            <p className="text-muted-foreground text-sm">Gestão de ASOs, Treinamentos, Atestados e Advertências</p>
          </div>
        </div>

        {/* CARDS RESUMO */}
        <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Stethoscope className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{resumo?.totalASOs || 0}</p>
                  <p className="text-xs text-muted-foreground">ASOs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{resumo?.asosVencidos || 0}</p>
                  <p className="text-xs text-muted-foreground">Vencidos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">{resumo?.asosAVencer || 0}</p>
                  <p className="text-xs text-muted-foreground">A Vencer</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <GraduationCap className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{resumo?.totalTreinamentos || 0}</p>
                  <p className="text-xs text-muted-foreground">Treinamentos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <ClipboardList className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{resumo?.totalAtestados || 0}</p>
                  <p className="text-xs text-muted-foreground">Atestados</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                  <ShieldAlert className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{resumo?.totalAdvertencias || 0}</p>
                  <p className="text-xs text-muted-foreground">Advertências</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* SEARCH + FILTER */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          {activeTab === "aso" && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrar status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="valido">Válidos</SelectItem>
                <SelectItem value="vencer">A Vencer</SelectItem>
                <SelectItem value="vencido">Vencidos</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* TABS */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="aso" className="gap-1"><Stethoscope className="h-4 w-4" /> ASO</TabsTrigger>
            <TabsTrigger value="treinamentos" className="gap-1"><GraduationCap className="h-4 w-4" /> Treinamentos</TabsTrigger>
            <TabsTrigger value="atestados" className="gap-1"><ClipboardList className="h-4 w-4" /> Atestados</TabsTrigger>
            <TabsTrigger value="advertencias" className="gap-1"><ShieldAlert className="h-4 w-4" /> Advertências</TabsTrigger>
          </TabsList>

          {/* ===================== ABA ASO ===================== */}
          <TabsContent value="aso">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Atestados de Saúde Ocupacional</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowImportAso(true)}><Upload className="h-4 w-4 mr-1" /> Importar</Button>
                  <Button size="sm" onClick={() => { setAsoForm({}); setShowNewAso(true); }}><Plus className="h-4 w-4 mr-1" /> Novo ASO</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Nº</th>
                        <th className="pb-2 font-medium">Colaborador</th>
                        <th className="pb-2 font-medium">Tipo</th>
                        <th className="pb-2 font-medium">Data Exame</th>
                        <th className="pb-2 font-medium">Validade</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Vencimento</th>
                        <th className="pb-2 font-medium">Resultado</th>
                        <th className="pb-2 font-medium">Médico</th>
                        <th className="pb-2 font-medium">Exames</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAso.length === 0 ? (
                        <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">Nenhum ASO cadastrado</td></tr>
                      ) : filteredAso.map((a: any, idx: number) => (
                        <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 text-muted-foreground">{idx + 1}</td>
                          <td className="py-2">
                            <div className="font-medium">{a.nomeCompleto}</div>
                            <div className="text-xs text-muted-foreground">{formatCPF(a.cpf)}</div>
                          </td>
                          <td className="py-2">{formatTipoASO(a.tipo)}</td>
                          <td className="py-2">{formatDate(a.dataExame)}</td>
                          <td className="py-2">{a.validadeDias || 365} dias</td>
                          <td className="py-2"><StatusBadge status={a.status} diasRestantes={a.diasRestantes} /></td>
                          <td className="py-2">{formatDate(a.dataValidade)}</td>
                          <td className="py-2">
                            <span className={a.resultado === "Apto" ? "text-green-600 font-medium" : a.resultado === "Inapto" ? "text-red-600 font-medium" : "text-yellow-600 font-medium"}>
                              {a.resultado === "Apto_Restricao" ? "Apto c/ Restrição" : a.resultado}
                            </span>
                          </td>
                          <td className="py-2">
                            {a.medico && <div className="text-xs">{a.medico}</div>}
                            {a.crm && <div className="text-xs text-muted-foreground">CRM: {a.crm}</div>}
                          </td>
                          <td className="py-2 max-w-[200px]">
                            <div className="text-xs text-muted-foreground truncate" title={a.examesRealizados}>{a.examesRealizados || "-"}</div>
                          </td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar PDF" onClick={() => handleUploadDoc("aso", a.id)}>
                                <FileUp className="h-3.5 w-3.5" />
                              </Button>
                              {a.documentoUrl && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver documento" onClick={() => window.open(a.documentoUrl, "_blank")}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir este ASO?")) deleteAso.mutate({ id: a.id }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===================== ABA TREINAMENTOS ===================== */}
          <TabsContent value="treinamentos">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Treinamentos e Capacitações</CardTitle>
                <Button size="sm" onClick={() => { setTreinForm({}); setShowNewTrein(true); }}><Plus className="h-4 w-4 mr-1" /> Novo Treinamento</Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Colaborador</th>
                        <th className="pb-2 font-medium">Treinamento</th>
                        <th className="pb-2 font-medium">Norma</th>
                        <th className="pb-2 font-medium">Carga Horária</th>
                        <th className="pb-2 font-medium">Realização</th>
                        <th className="pb-2 font-medium">Validade</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Instrutor/Entidade</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrein.length === 0 ? (
                        <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum treinamento cadastrado</td></tr>
                      ) : filteredTrein.map((t: any) => (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2">
                            <div className="font-medium">{t.nomeCompleto}</div>
                            <div className="text-xs text-muted-foreground">{t.funcao || "-"}</div>
                          </td>
                          <td className="py-2 font-medium">{t.nome}</td>
                          <td className="py-2">{t.norma || "-"}</td>
                          <td className="py-2">{t.cargaHoraria || "-"}</td>
                          <td className="py-2">{formatDate(t.dataRealizacao)}</td>
                          <td className="py-2">{formatDate(t.dataValidade)}</td>
                          <td className="py-2">
                            {t.dataValidade ? <StatusBadge status={t.statusCalculado} diasRestantes={t.diasRestantes} /> : <span className="text-xs text-muted-foreground">Sem validade</span>}
                          </td>
                          <td className="py-2">
                            {t.instrutor && <div className="text-xs">{t.instrutor}</div>}
                            {t.entidade && <div className="text-xs text-muted-foreground">{t.entidade}</div>}
                          </td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar certificado" onClick={() => handleUploadDoc("trein", t.id)}>
                                <FileUp className="h-3.5 w-3.5" />
                              </Button>
                              {t.certificadoUrl && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver certificado" onClick={() => window.open(t.certificadoUrl, "_blank")}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir este treinamento?")) deleteTrein.mutate({ id: t.id }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===================== ABA ATESTADOS ===================== */}
          <TabsContent value="atestados">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Atestados Médicos</CardTitle>
                <Button size="sm" onClick={() => { setAtestForm({}); setShowNewAtest(true); }}><Plus className="h-4 w-4 mr-1" /> Novo Atestado</Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Colaborador</th>
                        <th className="pb-2 font-medium">CPF</th>
                        <th className="pb-2 font-medium">Tipo</th>
                        <th className="pb-2 font-medium">Data Emissão</th>
                        <th className="pb-2 font-medium">Dias Afastamento</th>
                        <th className="pb-2 font-medium">Data Retorno</th>
                        <th className="pb-2 font-medium">CID</th>
                        <th className="pb-2 font-medium">Médico</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAtest.length === 0 ? (
                        <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum atestado cadastrado</td></tr>
                      ) : filteredAtest.map((a: any) => (
                        <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 font-medium">{a.nomeCompleto}</td>
                          <td className="py-2">{formatCPF(a.cpf)}</td>
                          <td className="py-2">{a.tipo}</td>
                          <td className="py-2">{formatDate(a.dataEmissao)}</td>
                          <td className="py-2 text-center">{a.diasAfastamento || 0}</td>
                          <td className="py-2">{formatDate(a.dataRetorno)}</td>
                          <td className="py-2">{a.cid || "-"}</td>
                          <td className="py-2">
                            {a.medico && <div className="text-xs">{a.medico}</div>}
                            {a.crm && <div className="text-xs text-muted-foreground">CRM: {a.crm}</div>}
                          </td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar PDF" onClick={() => handleUploadDoc("atest", a.id)}>
                                <FileUp className="h-3.5 w-3.5" />
                              </Button>
                              {a.documentoUrl && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver documento" onClick={() => window.open(a.documentoUrl, "_blank")}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir este atestado?")) deleteAtest.mutate({ id: a.id }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===================== ABA ADVERTÊNCIAS ===================== */}
          <TabsContent value="advertencias">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Advertências e Suspensões</CardTitle>
                <Button size="sm" onClick={() => { setAdvForm({}); setShowNewAdv(true); }}><Plus className="h-4 w-4 mr-1" /> Nova Advertência</Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium">Colaborador</th>
                        <th className="pb-2 font-medium">CPF</th>
                        <th className="pb-2 font-medium">Tipo</th>
                        <th className="pb-2 font-medium">Data</th>
                        <th className="pb-2 font-medium">Motivo</th>
                        <th className="pb-2 font-medium">Descrição</th>
                        <th className="pb-2 font-medium">Testemunhas</th>
                        <th className="pb-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAdv.length === 0 ? (
                        <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Nenhuma advertência cadastrada</td></tr>
                      ) : filteredAdv.map((a: any) => (
                        <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2 font-medium">{a.nomeCompleto}</td>
                          <td className="py-2">{formatCPF(a.cpf)}</td>
                          <td className="py-2">
                            <Badge variant={a.tipoAdvertencia === "Suspensao" ? "destructive" : a.tipoAdvertencia === "Escrita" ? "secondary" : "outline"}>
                              {formatTipoAdv(a.tipoAdvertencia)}
                            </Badge>
                          </td>
                          <td className="py-2">{formatDate(a.dataOcorrencia)}</td>
                          <td className="py-2 max-w-[200px] truncate" title={a.motivo}>{a.motivo}</td>
                          <td className="py-2 max-w-[200px] truncate" title={a.descricao}>{a.descricao || "-"}</td>
                          <td className="py-2">{a.testemunhas || "-"}</td>
                          <td className="py-2">
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Anexar PDF" onClick={() => handleUploadDoc("adv", a.id)}>
                                <FileUp className="h-3.5 w-3.5" />
                              </Button>
                              {a.documentoUrl && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver documento" onClick={() => window.open(a.documentoUrl, "_blank")}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir" onClick={() => { if (confirm("Excluir esta advertência?")) deleteAdv.mutate({ id: a.id }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ===================== DIALOG: NOVO ASO ===================== */}
      <Dialog open={showNewAso} onOpenChange={setShowNewAso}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo ASO</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">Colaborador *</label>
              <Select value={String(asoForm.employeeId || "")} onValueChange={v => setAsoForm({ ...asoForm, employeeId: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent>
                  {(employees as any[]).map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto} - {formatCPF(e.cpf)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Tipo de Exame *</label>
              <Select value={asoForm.tipo || ""} onValueChange={v => setAsoForm({ ...asoForm, tipo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Admissional">Admissional</SelectItem>
                  <SelectItem value="Periodico">Periódico</SelectItem>
                  <SelectItem value="Retorno">Retorno ao Trabalho</SelectItem>
                  <SelectItem value="Mudanca_Funcao">Mudança de Função</SelectItem>
                  <SelectItem value="Demissional">Demissional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Data do Exame *</label>
              <Input type="date" value={asoForm.dataExame || ""} onChange={e => setAsoForm({ ...asoForm, dataExame: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Validade (dias)</label>
              <Input type="number" value={asoForm.validadeDias || 365} onChange={e => setAsoForm({ ...asoForm, validadeDias: parseInt(e.target.value) || 365 })} />
            </div>
            <div>
              <label className="text-sm font-medium">Resultado</label>
              <Select value={asoForm.resultado || "Apto"} onValueChange={v => setAsoForm({ ...asoForm, resultado: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Apto">Apto</SelectItem>
                  <SelectItem value="Inapto">Inapto</SelectItem>
                  <SelectItem value="Apto_Restricao">Apto com Restrição</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Médico</label>
              <Input value={asoForm.medico || ""} onChange={e => setAsoForm({ ...asoForm, medico: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">CRM</label>
              <Input value={asoForm.crm || ""} onChange={e => setAsoForm({ ...asoForm, crm: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Clínica</label>
              <Input value={asoForm.clinica || ""} onChange={e => setAsoForm({ ...asoForm, clinica: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Exames Realizados</label>
              <Textarea value={asoForm.examesRealizados || ""} onChange={e => setAsoForm({ ...asoForm, examesRealizados: e.target.value })} placeholder="Ex: Acuidade Visual, Audiometria, Hemograma..." rows={2} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Observações</label>
              <Textarea value={asoForm.observacoes || ""} onChange={e => setAsoForm({ ...asoForm, observacoes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewAso(false)}>Cancelar</Button>
            <Button onClick={handleSubmitAso} disabled={createAso.isPending}>{createAso.isPending ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== DIALOG: NOVO TREINAMENTO ===================== */}
      <Dialog open={showNewTrein} onOpenChange={setShowNewTrein}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Treinamento</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">Colaborador *</label>
              <Select value={String(treinForm.employeeId || "")} onValueChange={v => setTreinForm({ ...treinForm, employeeId: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent>
                  {(employees as any[]).map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Nome do Treinamento *</label>
              <Input value={treinForm.nome || ""} onChange={e => setTreinForm({ ...treinForm, nome: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Norma Regulamentadora</label>
              <Input value={treinForm.norma || ""} onChange={e => setTreinForm({ ...treinForm, norma: e.target.value })} placeholder="Ex: NR-35, NR-10" />
            </div>
            <div>
              <label className="text-sm font-medium">Carga Horária</label>
              <Input value={treinForm.cargaHoraria || ""} onChange={e => setTreinForm({ ...treinForm, cargaHoraria: e.target.value })} placeholder="Ex: 8h, 40h" />
            </div>
            <div>
              <label className="text-sm font-medium">Data Realização *</label>
              <Input type="date" value={treinForm.dataRealizacao || ""} onChange={e => setTreinForm({ ...treinForm, dataRealizacao: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Data Validade</label>
              <Input type="date" value={treinForm.dataValidade || ""} onChange={e => setTreinForm({ ...treinForm, dataValidade: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Instrutor</label>
              <Input value={treinForm.instrutor || ""} onChange={e => setTreinForm({ ...treinForm, instrutor: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Entidade/Empresa</label>
              <Input value={treinForm.entidade || ""} onChange={e => setTreinForm({ ...treinForm, entidade: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Observações</label>
              <Textarea value={treinForm.observacoes || ""} onChange={e => setTreinForm({ ...treinForm, observacoes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTrein(false)}>Cancelar</Button>
            <Button onClick={handleSubmitTrein} disabled={createTrein.isPending}>{createTrein.isPending ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== DIALOG: NOVO ATESTADO ===================== */}
      <Dialog open={showNewAtest} onOpenChange={setShowNewAtest}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Atestado</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">Colaborador *</label>
              <Select value={String(atestForm.employeeId || "")} onValueChange={v => setAtestForm({ ...atestForm, employeeId: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent>
                  {(employees as any[]).map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Tipo *</label>
              <Select value={atestForm.tipo || ""} onValueChange={v => setAtestForm({ ...atestForm, tipo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Atestado Médico">Atestado Médico</SelectItem>
                  <SelectItem value="Atestado Odontológico">Atestado Odontológico</SelectItem>
                  <SelectItem value="Declaração de Comparecimento">Declaração de Comparecimento</SelectItem>
                  <SelectItem value="Atestado de Acompanhamento">Atestado de Acompanhamento</SelectItem>
                  <SelectItem value="Licença Maternidade">Licença Maternidade</SelectItem>
                  <SelectItem value="Licença Paternidade">Licença Paternidade</SelectItem>
                  <SelectItem value="Outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Data Emissão *</label>
              <Input type="date" value={atestForm.dataEmissao || ""} onChange={e => setAtestForm({ ...atestForm, dataEmissao: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Dias de Afastamento</label>
              <Input type="number" value={atestForm.diasAfastamento || 0} onChange={e => setAtestForm({ ...atestForm, diasAfastamento: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-sm font-medium">Data Retorno</label>
              <Input type="date" value={atestForm.dataRetorno || ""} onChange={e => setAtestForm({ ...atestForm, dataRetorno: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">CID</label>
              <Input value={atestForm.cid || ""} onChange={e => setAtestForm({ ...atestForm, cid: e.target.value })} placeholder="Ex: J11, M54.5" />
            </div>
            <div>
              <label className="text-sm font-medium">Médico</label>
              <Input value={atestForm.medico || ""} onChange={e => setAtestForm({ ...atestForm, medico: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">CRM</label>
              <Input value={atestForm.crm || ""} onChange={e => setAtestForm({ ...atestForm, crm: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Descrição</label>
              <Textarea value={atestForm.descricao || ""} onChange={e => setAtestForm({ ...atestForm, descricao: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewAtest(false)}>Cancelar</Button>
            <Button onClick={handleSubmitAtest} disabled={createAtest.isPending}>{createAtest.isPending ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== DIALOG: NOVA ADVERTÊNCIA ===================== */}
      <Dialog open={showNewAdv} onOpenChange={setShowNewAdv}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Advertência</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">Colaborador *</label>
              <Select value={String(advForm.employeeId || "")} onValueChange={v => setAdvForm({ ...advForm, employeeId: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent>
                  {(employees as any[]).map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Tipo *</label>
              <Select value={advForm.tipoAdvertencia || ""} onValueChange={v => setAdvForm({ ...advForm, tipoAdvertencia: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Verbal">Verbal</SelectItem>
                  <SelectItem value="Escrita">Escrita</SelectItem>
                  <SelectItem value="Suspensao">Suspensão</SelectItem>
                  <SelectItem value="OSS">OSS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Data da Ocorrência *</label>
              <Input type="date" value={advForm.dataOcorrencia || ""} onChange={e => setAdvForm({ ...advForm, dataOcorrencia: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Motivo *</label>
              <Textarea value={advForm.motivo || ""} onChange={e => setAdvForm({ ...advForm, motivo: e.target.value })} rows={2} placeholder="Descreva o motivo da advertência..." />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Descrição Detalhada</label>
              <Textarea value={advForm.descricao || ""} onChange={e => setAdvForm({ ...advForm, descricao: e.target.value })} rows={3} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Testemunhas</label>
              <Input value={advForm.testemunhas || ""} onChange={e => setAdvForm({ ...advForm, testemunhas: e.target.value })} placeholder="Nomes das testemunhas separados por vírgula" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewAdv(false)}>Cancelar</Button>
            <Button onClick={handleSubmitAdv} disabled={createAdv.isPending}>{createAdv.isPending ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== DIALOG: IMPORTAR ASO ===================== */}
      <Dialog open={showImportAso} onOpenChange={setShowImportAso}>
        <DialogContent>
          <DialogHeader><DialogTitle>Importar ASOs</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
              <p className="font-medium">Como funciona:</p>
              <p>Cole os dados da planilha de ASO (formato TSV/texto tabulado) em um arquivo .txt e faça o upload.</p>
              <p className="mt-1">Colunas esperadas: Nº, Nome, Tipo, Data, Validade(dias), Status, Vencimento, Resultado, Médico, CRM, Já Atualizou, Exames</p>
            </div>
            <Input type="file" accept=".txt,.csv,.tsv" onChange={e => setImportFile(e.target.files?.[0] || null)} />
            {importAso.data && (
              <div className="bg-green-50 p-3 rounded-lg text-sm">
                <p>Importados: <strong>{importAso.data.imported}</strong></p>
                <p>Não encontrados: <strong>{importAso.data.notFound}</strong></p>
                {importAso.data.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-red-600">Ver erros ({importAso.data.errors.length})</summary>
                    <ul className="mt-1 text-xs">{importAso.data.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
                  </details>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportAso(false)}>Fechar</Button>
            <Button onClick={handleImportAso} disabled={importAso.isPending || !importFile}>
              {importAso.isPending ? "Importando..." : "Importar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
