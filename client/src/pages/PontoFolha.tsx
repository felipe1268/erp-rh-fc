import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, Plus, Upload, FileSpreadsheet, DollarSign, CreditCard, Trash2, FileText, CheckCircle2, AlertCircle, Loader2, Settings } from "lucide-react";

export default function PontoFolha() {
  const [companyId] = useState(() => {
    const saved = localStorage.getItem("selectedCompanyId");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [activeTab, setActiveTab] = useState("uploads");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ponto e Folha de Pagamento</h1>
          <p className="text-muted-foreground mt-1">Upload de arquivos da contabilidade, cartão de ponto Dixi e espelho da folha</p>
        </div>

        {companyId === 0 ? (
          <Card className="p-8 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Selecione uma empresa no Dashboard para acessar o módulo.</p>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 w-full max-w-2xl">
              <TabsTrigger value="uploads">Uploads</TabsTrigger>
              <TabsTrigger value="ponto">Cartão de Ponto</TabsTrigger>
              <TabsTrigger value="folha">Folha de Pagamento</TabsTrigger>
              <TabsTrigger value="dixi">Equipamentos Dixi</TabsTrigger>
            </TabsList>
            <TabsContent value="uploads"><UploadsTab companyId={companyId} /></TabsContent>
            <TabsContent value="ponto"><PontoTab companyId={companyId} /></TabsContent>
            <TabsContent value="folha"><FolhaTab companyId={companyId} /></TabsContent>
            <TabsContent value="dixi"><DixiTab companyId={companyId} /></TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

// ============================================================
// ABA UPLOADS - Upload por categoria
// ============================================================
function UploadsTab({ companyId }: { companyId: number }) {
  const [month, setMonth] = useState(() => new Date().toISOString().substring(0, 7));
  const utils = trpc.useUtils();
  const { data: uploads = [], isLoading } = trpc.payrollUploads.list.useQuery({ companyId, month });
  const createMut = trpc.payrollUploads.create.useMutation({
    onSuccess: () => { utils.payrollUploads.list.invalidate(); toast.success("Arquivo registrado com sucesso!"); },
  });
  const deleteMut = trpc.payrollUploads.delete.useMutation({
    onSuccess: () => { utils.payrollUploads.list.invalidate(); toast.success("Arquivo removido!"); },
  });

  const categories = [
    {
      key: "cartao_ponto",
      title: "Cartão de Ponto (Dixi)",
      description: "Arquivos XLS exportados do sistema Dixi com as marcações de ponto dos colaboradores",
      icon: Clock,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-l-blue-500",
      accept: ".xls,.xlsx,.csv",
    },
    {
      key: "folha_pagamento",
      title: "Folha de Pagamento (Contabilidade)",
      description: "Espelhos analíticos e sintéticos da folha, resumos de pagamento por banco (CEF, Santander)",
      icon: DollarSign,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-l-green-500",
      accept: ".pdf,.xls,.xlsx,.csv",
    },
    {
      key: "vale_adiantamento",
      title: "Vale / Adiantamento",
      description: "Espelhos de adiantamento, resumos sintéticos e remessas bancárias de vale",
      icon: CreditCard,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      borderColor: "border-l-orange-500",
      accept: ".pdf,.xls,.xlsx,.csv",
    },
  ];

  const handleUpload = async (category: string, file: File) => {
    // Simula upload - em produção usaria storagePut
    const fakeUrl = `uploads/${companyId}/${month}/${category}/${file.name}`;
    createMut.mutate({
      companyId,
      category,
      month,
      fileName: file.name,
      fileUrl: fakeUrl,
      fileKey: fakeUrl,
      fileSize: file.size,
      mimeType: file.type,
      status: "pendente",
    });
  };

  const getUploadsByCategory = (cat: string) => uploads.filter((u: any) => u.category === cat);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "processado":
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100"><CheckCircle2 className="h-3 w-3 mr-1" /> Processado</Badge>;
      case "processando":
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processando</Badge>;
      case "erro":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><AlertCircle className="h-3 w-3 mr-1" /> Erro</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100"><Clock className="h-3 w-3 mr-1" /> Pendente</Badge>;
    }
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Month Selector */}
      <div className="flex items-center gap-4">
        <div className="w-48">
          <Label className="text-sm font-medium">Mês de Referência</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="mt-1" />
        </div>
        <div className="pt-5">
          <p className="text-sm text-muted-foreground">
            {uploads.length} arquivo(s) enviado(s) para {new Date(month + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Upload Cards by Category */}
      <div className="grid grid-cols-1 gap-6">
        {categories.map(cat => {
          const catUploads = getUploadsByCategory(cat.key);
          return (
            <Card key={cat.key} className={`border-l-4 ${cat.borderColor}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg ${cat.bgColor} flex items-center justify-center`}>
                      <cat.icon className={`h-5 w-5 ${cat.color}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">{cat.title}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                    </div>
                  </div>
                  <UploadButton accept={cat.accept} onUpload={(file) => handleUpload(cat.key, file)} />
                </div>
              </CardHeader>
              <CardContent>
                {catUploads.length === 0 ? (
                  <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-6 text-center">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhum arquivo enviado para esta categoria neste mês</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Clique em "Enviar Arquivo" para fazer upload</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {catUploads.map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between bg-muted/30 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <FileText className={`h-5 w-5 shrink-0 ${cat.color}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{u.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {u.fileSize ? `${(u.fileSize / 1024).toFixed(1)} KB` : ""} &middot; {new Date(u.createdAt).toLocaleString("pt-BR")}
                              {u.recordsProcessed > 0 && ` · ${u.recordsProcessed} registros`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {getStatusBadge(u.status)}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMut.mutate({ id: u.id })}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTE DE UPLOAD
// ============================================================
function UploadButton({ accept, onUpload }: { accept: string; onUpload: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => onUpload(file));
      e.target.value = "";
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept={accept} multiple className="hidden" onChange={handleChange} />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Upload className="h-4 w-4 mr-2" /> Enviar Arquivo
      </Button>
    </>
  );
}

// ============================================================
// ABA CARTÃO DE PONTO
// ============================================================
function PontoTab({ companyId }: { companyId: number }) {
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [month, setMonth] = useState(() => new Date().toISOString().substring(0, 7));
  const { data: employees = [] } = trpc.employees.list.useQuery({ companyId });
  const { data: records = [] } = trpc.timesheet.records.list.useQuery(
    { companyId, employeeId: parseInt(selectedEmployee), month },
    { enabled: !!selectedEmployee }
  );

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-64">
          <Label>Colaborador</Label>
          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger><SelectValue placeholder="Selecione um colaborador" /></SelectTrigger>
            <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Label>Mês</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
      </div>

      {selectedEmployee ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Data</th>
                  <th className="text-left p-3 font-medium">Entrada 1</th>
                  <th className="text-left p-3 font-medium">Saída 1</th>
                  <th className="text-left p-3 font-medium">Entrada 2</th>
                  <th className="text-left p-3 font-medium">Saída 2</th>
                  <th className="text-left p-3 font-medium">Horas Trab.</th>
                  <th className="text-left p-3 font-medium">H. Extras</th>
                  <th className="text-left p-3 font-medium">Faltas</th>
                  <th className="text-left p-3 font-medium">Equipamento (Sn)</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Nenhum registro de ponto encontrado para este período. Faça upload do arquivo Dixi na aba "Uploads".</td></tr>
                ) : records.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{r.data ? new Date(r.data).toLocaleDateString("pt-BR") : "-"}</td>
                    <td className="p-3">{r.entrada1 ?? "-"}</td>
                    <td className="p-3">{r.saida1 ?? "-"}</td>
                    <td className="p-3">{r.entrada2 ?? "-"}</td>
                    <td className="p-3">{r.saida2 ?? "-"}</td>
                    <td className="p-3 font-medium">{r.horasTrabalhadas ?? "-"}</td>
                    <td className="p-3 text-blue-600">{r.horasExtras ?? "-"}</td>
                    <td className="p-3 text-red-600">{r.faltas ?? "-"}</td>
                    <td className="p-3 text-muted-foreground text-xs">{r.dixiSn ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center">
          <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Selecione um colaborador para visualizar o registro de ponto.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Os dados são importados automaticamente dos arquivos Dixi enviados na aba "Uploads".</p>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// ABA FOLHA DE PAGAMENTO
// ============================================================
function FolhaTab({ companyId }: { companyId: number }) {
  const [month, setMonth] = useState(() => new Date().toISOString().substring(0, 7));
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const { data: payrolls = [], isLoading } = trpc.timesheet.payroll.list.useQuery({ companyId, month });
  const { data: employees = [] } = trpc.employees.list.useQuery({ companyId });
  const createMut = trpc.timesheet.payroll.create.useMutation({ onSuccess: () => { utils.timesheet.payroll.list.invalidate(); setShowForm(false); toast.success("Folha registrada!"); } });
  const deleteMut = trpc.timesheet.payroll.delete.useMutation({ onSuccess: () => { utils.timesheet.payroll.list.invalidate(); toast.success("Registro excluído!"); } });

  const [form, setForm] = useState<any>({ employeeId: "", tipo: "Mensal", salarioBruto: "", totalProventos: "", totalDescontos: "", salarioLiquido: "", inss: "", irrf: "", fgts: "" });
  const getEmpName = (id: number) => employees.find((e: any) => e.id === id)?.nomeCompleto ?? "-";

  const totalBruto = payrolls.reduce((sum: number, p: any) => sum + Number(p.salarioBruto || 0), 0);
  const totalLiquido = payrolls.reduce((sum: number, p: any) => sum + Number(p.salarioLiquido || 0), 0);
  const totalDescontos = payrolls.reduce((sum: number, p: any) => sum + Number(p.totalDescontos || 0), 0);

  return (
    <div className="space-y-4 mt-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Colaboradores</p>
            <p className="text-xl font-bold text-blue-600">{payrolls.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Bruto</p>
            <p className="text-xl font-bold text-green-600">R$ {totalBruto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Descontos</p>
            <p className="text-xl font-bold text-red-600">R$ {totalDescontos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Líquido</p>
            <p className="text-xl font-bold text-emerald-600">R$ {totalLiquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="w-48">
          <Label>Mês Referência</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <Button onClick={() => { setForm({ employeeId: "", tipo: "Mensal", salarioBruto: "", totalProventos: "", totalDescontos: "", salarioLiquido: "", inss: "", irrf: "", fgts: "" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Registro
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Colaborador</th>
                <th className="text-left p-3 font-medium">Tipo</th>
                <th className="text-right p-3 font-medium">Sal. Bruto</th>
                <th className="text-right p-3 font-medium">Proventos</th>
                <th className="text-right p-3 font-medium">Descontos</th>
                <th className="text-right p-3 font-medium">Líquido</th>
                <th className="text-right p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
              ) : payrolls.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum registro para este mês. Os dados são importados dos arquivos enviados na aba "Uploads".</td></tr>
              ) : payrolls.map((p: any) => (
                <tr key={p.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{getEmpName(p.employeeId)}</td>
                  <td className="p-3"><Badge variant="outline">{p.tipo?.replace("_", " ")}</Badge></td>
                  <td className="p-3 text-right">R$ {Number(p.salarioBruto || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td className="p-3 text-right text-green-600">R$ {Number(p.totalProventos || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td className="p-3 text-right text-red-600">R$ {Number(p.totalDescontos || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td className="p-3 text-right font-semibold">R$ {Number(p.salarioLiquido || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMut.mutate({ id: p.id })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Registro de Folha</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Colaborador</Label>
              <Select value={String(form.employeeId)} onValueChange={v => setForm({ ...form, employeeId: parseInt(v) })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mensal">Mensal</SelectItem>
                  <SelectItem value="Adiantamento">Adiantamento</SelectItem>
                  <SelectItem value="Ferias">Férias</SelectItem>
                  <SelectItem value="Rescisao">Rescisão</SelectItem>
                  <SelectItem value="PLR">PLR</SelectItem>
                  <SelectItem value="13_Salario">13º Salário</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Salário Bruto</Label><Input value={form.salarioBruto} onChange={e => setForm({ ...form, salarioBruto: e.target.value })} placeholder="0,00" /></div>
            <div><Label>Total Proventos</Label><Input value={form.totalProventos} onChange={e => setForm({ ...form, totalProventos: e.target.value })} /></div>
            <div><Label>Total Descontos</Label><Input value={form.totalDescontos} onChange={e => setForm({ ...form, totalDescontos: e.target.value })} /></div>
            <div><Label>Salário Líquido</Label><Input value={form.salarioLiquido} onChange={e => setForm({ ...form, salarioLiquido: e.target.value })} /></div>
            <div><Label>INSS</Label><Input value={form.inss} onChange={e => setForm({ ...form, inss: e.target.value })} /></div>
            <div><Label>IRRF</Label><Input value={form.irrf} onChange={e => setForm({ ...form, irrf: e.target.value })} /></div>
            <div><Label>FGTS</Label><Input value={form.fgts} onChange={e => setForm({ ...form, fgts: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ ...form, companyId, mesReferencia: month })} disabled={createMut.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// ABA EQUIPAMENTOS DIXI (Vinculação Sn -> Obra)
// ============================================================
function DixiTab({ companyId }: { companyId: number }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ serialNumber: "", obraName: "", location: "" });
  const utils = trpc.useUtils();
  const { data: devices = [] } = trpc.dixiDevices.list.useQuery({ companyId });
  const createMut = trpc.dixiDevices.create.useMutation({
    onSuccess: () => { utils.dixiDevices.list.invalidate(); setShowForm(false); toast.success("Equipamento Dixi cadastrado!"); },
  });
  const deleteMut = trpc.dixiDevices.delete.useMutation({
    onSuccess: () => { utils.dixiDevices.list.invalidate(); toast.success("Equipamento removido!"); },
  });

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Vincule o número serial (Sn) de cada equipamento Dixi à obra correspondente.
            Quando os arquivos de ponto forem importados, o sistema identificará automaticamente em qual obra o colaborador estava alocado.
          </p>
        </div>
        <Button onClick={() => { setForm({ serialNumber: "", obraName: "", location: "" }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo Equipamento
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Número Serial (Sn)</th>
                <th className="text-left p-3 font-medium">Obra</th>
                <th className="text-left p-3 font-medium">Localização</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">
                  <Settings className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                  Nenhum equipamento Dixi cadastrado. Cadastre os equipamentos para vincular automaticamente os registros de ponto às obras.
                </td></tr>
              ) : devices.map((d: any) => (
                <tr key={d.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-mono font-medium text-blue-600">{d.serialNumber}</td>
                  <td className="p-3 font-medium">{d.obraName}</td>
                  <td className="p-3 text-muted-foreground">{d.location || "-"}</td>
                  <td className="p-3">
                    <Badge className={d.isActive ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-gray-100 text-gray-600 hover:bg-gray-100"}>
                      {d.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMut.mutate({ id: d.id })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Cadastrar Equipamento Dixi</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Número Serial (Sn)</Label>
              <Input value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} placeholder="Ex: AYSJ14003241" className="font-mono" />
              <p className="text-xs text-muted-foreground mt-1">Encontre o Sn na coluna H do arquivo Dixi exportado</p>
            </div>
            <div>
              <Label>Nome da Obra</Label>
              <Input value={form.obraName} onChange={e => setForm({ ...form, obraName: e.target.value })} placeholder="Ex: Obra Residencial Centro" />
            </div>
            <div>
              <Label>Localização (opcional)</Label>
              <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Ex: Rua das Flores, 123" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate({ ...form, companyId, isActive: true })} disabled={createMut.isPending || !form.serialNumber || !form.obraName}>
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
