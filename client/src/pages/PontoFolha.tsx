import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Clock, Plus, Upload, FileSpreadsheet, DollarSign, CreditCard, Trash2,
  FileText, CheckCircle2, AlertCircle, Loader2, Settings, Download,
  Calculator, Utensils, TrendingUp, Ban, ThumbsUp, ThumbsDown, Eye
} from "lucide-react";

// ============================================================
// CATEGORIAS DE UPLOAD
// ============================================================
const UPLOAD_CATEGORIES = [
  { value: "cartao_ponto", label: "Cartão de Ponto (Dixi XLS)", icon: Clock, accept: ".xls,.xlsx" },
  { value: "espelho_adiantamento_analitico", label: "Espelho Adiantamento Analítico", icon: FileText, accept: ".pdf" },
  { value: "adiantamento_sintetico", label: "Adiantamento Sintético", icon: FileText, accept: ".pdf" },
  { value: "adiantamento_banco_cef", label: "Adiantamento por Banco - CEF", icon: CreditCard, accept: ".pdf" },
  { value: "adiantamento_banco_santander", label: "Adiantamento por Banco - Santander", icon: CreditCard, accept: ".pdf" },
  { value: "espelho_folha_analitico", label: "Espelho Folha Analítico", icon: FileSpreadsheet, accept: ".pdf" },
  { value: "folha_sintetico", label: "Folha Sintético", icon: FileSpreadsheet, accept: ".pdf" },
  { value: "pagamento_banco_cef", label: "Pagamento Folha - CEF", icon: DollarSign, accept: ".pdf" },
  { value: "pagamento_banco_santander", label: "Pagamento Folha - Santander", icon: DollarSign, accept: ".pdf" },
] as const;

type CategoryValue = typeof UPLOAD_CATEGORIES[number]["value"];

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
          <p className="text-muted-foreground mt-1">
            Upload de arquivos da contabilidade, cartão de ponto Dixi, vales, pagamentos extras e VR/iFood
          </p>
        </div>

        {companyId === 0 ? (
          <Card className="p-8 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Selecione uma empresa no Dashboard para acessar o módulo.</p>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex flex-wrap w-full gap-1">
              <TabsTrigger value="uploads" className="flex-1 min-w-[120px]">
                <Upload className="h-4 w-4 mr-1" /> Uploads
              </TabsTrigger>
              <TabsTrigger value="ponto" className="flex-1 min-w-[120px]">
                <Clock className="h-4 w-4 mr-1" /> Cartão de Ponto
              </TabsTrigger>
              <TabsTrigger value="folha" className="flex-1 min-w-[120px]">
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Folha
              </TabsTrigger>
              <TabsTrigger value="vale" className="flex-1 min-w-[120px]">
                <DollarSign className="h-4 w-4 mr-1" /> Vale/Adiantamento
              </TabsTrigger>
              <TabsTrigger value="extras" className="flex-1 min-w-[120px]">
                <Calculator className="h-4 w-4 mr-1" /> Pagamentos Extras
              </TabsTrigger>
              <TabsTrigger value="vr" className="flex-1 min-w-[120px]">
                <Utensils className="h-4 w-4 mr-1" /> VR/iFood
              </TabsTrigger>
              <TabsTrigger value="custos" className="flex-1 min-w-[120px]">
                <TrendingUp className="h-4 w-4 mr-1" /> Custo Funcionário
              </TabsTrigger>
            </TabsList>

            <TabsContent value="uploads"><UploadsTab companyId={companyId} /></TabsContent>
            <TabsContent value="ponto"><PontoTab companyId={companyId} /></TabsContent>
            <TabsContent value="folha"><FolhaTab companyId={companyId} /></TabsContent>
            <TabsContent value="vale"><ValeTab companyId={companyId} /></TabsContent>
            <TabsContent value="extras"><ExtrasTab companyId={companyId} /></TabsContent>
            <TabsContent value="vr"><VrTab companyId={companyId} /></TabsContent>
            <TabsContent value="custos"><CustosTab companyId={companyId} /></TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

// ============================================================
// ABA 1: UPLOADS (múltiplos arquivos)
// ============================================================
function UploadsTab({ companyId }: { companyId: number }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedCategory, setSelectedCategory] = useState<CategoryValue>("cartao_ponto");
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploads = trpc.payrollParsers.listUploads.useQuery({ companyId, month });
  const uploadMutation = trpc.payrollParsers.uploadAndParse.useMutation();
  const deleteMutation = trpc.payrollParsers.deleteUpload.useMutation();
  const batchDelete = trpc.batch.delete.useMutation();
  const utils = trpc.useUtils();

  const catInfo = UPLOAD_CATEGORIES.find(c => c.value === selectedCategory);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );

        await uploadMutation.mutateAsync({
          companyId,
          category: selectedCategory,
          month,
          fileName: file.name,
          fileBase64: base64,
          mimeType: file.type || "application/octet-stream",
        });
        successCount++;
      } catch (err: any) {
        errorCount++;
        toast.error(`Erro ao processar ${file.name}: ${err.message}`);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} arquivo(s) processado(s) com sucesso!`);
      utils.payrollParsers.listUploads.invalidate();
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} arquivo(s) com erro.`);
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [companyId, selectedCategory, month, uploadMutation, utils]);

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    try {
      await batchDelete.mutateAsync({ table: "payroll_uploads", ids: Array.from(selectedIds) });
      toast.success(`${selectedIds.size} arquivo(s) excluído(s)`);
      setSelectedIds(new Set());
      utils.payrollParsers.listUploads.invalidate();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!uploads.data) return;
    if (selectedIds.size === uploads.data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(uploads.data.map(u => u.id)));
    }
  };

  const categoryLabel = (cat: string) => UPLOAD_CATEGORIES.find(c => c.value === cat)?.label || cat;

  const statusBadge = (status: string) => {
    switch (status) {
      case "processado": return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Processado</Badge>;
      case "processando": return <Badge className="bg-blue-100 text-blue-800"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processando</Badge>;
      case "erro": return <Badge className="bg-red-100 text-red-800"><AlertCircle className="h-3 w-3 mr-1" />Erro</Badge>;
      default: return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
    }
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Upload de Arquivos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Mês de Referência</Label>
              <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
            </div>
            <div>
              <Label>Tipo de Documento</Label>
              <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as CategoryValue)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UPLOAD_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <div className="w-full">
                <Label>Arquivo(s) - Múltiplos permitidos</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept={catInfo?.accept || "*"}
                  multiple
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </div>
            </div>
          </div>

          {uploading && (
            <div className="flex items-center gap-2 text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Processando arquivo(s)...</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* List of Uploads */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Arquivos Enviados - {month}</CardTitle>
            {selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
                <Trash2 className="h-4 w-4 mr-1" /> Excluir ({selectedIds.size})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {uploads.isLoading ? (
            <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : !uploads.data?.length ? (
            <p className="text-center text-muted-foreground py-8">Nenhum arquivo enviado para este mês.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left w-10">
                      <Checkbox checked={selectedIds.size === uploads.data.length && uploads.data.length > 0} onCheckedChange={toggleSelectAll} />
                    </th>
                    <th className="p-2 text-left">Arquivo</th>
                    <th className="p-2 text-left">Tipo</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-right">Registros</th>
                    <th className="p-2 text-left">Data Upload</th>
                    <th className="p-2 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.data.map(u => (
                    <tr key={u.id} className="border-b hover:bg-muted/50">
                      <td className="p-2"><Checkbox checked={selectedIds.has(u.id)} onCheckedChange={() => toggleSelect(u.id)} /></td>
                      <td className="p-2 font-medium">{u.fileName}</td>
                      <td className="p-2">{categoryLabel(u.category)}</td>
                      <td className="p-2">{statusBadge(u.status)}</td>
                      <td className="p-2 text-right">{u.recordsProcessed || 0}</td>
                      <td className="p-2">{new Date(u.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td className="p-2 text-center">
                        <div className="flex gap-1 justify-center">
                          {u.fileUrl && (
                            <Button variant="ghost" size="sm" onClick={() => window.open(u.fileUrl, "_blank")}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={async () => {
                            await deleteMutation.mutateAsync({ id: u.id });
                            toast.success("Arquivo excluído");
                            utils.payrollParsers.listUploads.invalidate();
                          }}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// ABA 2: CARTÃO DE PONTO
// ============================================================
function PontoTab({ companyId }: { companyId: number }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [search, setSearch] = useState("");

  const timeRecords = trpc.timesheet.records.list.useQuery({ companyId, employeeId: 0 }) as any;
  const employees = trpc.employees.list.useQuery({ companyId });

  const filteredRecords = useMemo(() => {
    if (!timeRecords.data) return [];
    return timeRecords.data.filter((r: any) => {
      const dateStr = r.data ? new Date(r.data).toISOString().slice(0, 7) : "";
      const matchMonth = dateStr === month;
      if (!matchMonth) return false;
      if (!search) return true;
      const emp = employees.data?.find(e => e.id === r.employeeId);
      return emp?.nomeCompleto.toLowerCase().includes(search.toLowerCase());
    });
  }, [timeRecords.data, employees.data, month, search]);

  // Group by employee
  const grouped = useMemo(() => {
    const map: Record<number, any[]> = {};
    for (const r of filteredRecords) {
      if (!map[r.employeeId]) map[r.employeeId] = [];
      map[r.employeeId].push(r);
    }
    return map;
  }, [filteredRecords]);

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Mês de Referência</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <div>
          <Label>Buscar Funcionário</Label>
          <Input placeholder="Nome do funcionário..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-end">
          <div className="text-sm text-muted-foreground">
            {filteredRecords.length} registros de ponto no mês
          </div>
        </div>
      </div>

      {Object.entries(grouped).length === 0 ? (
        <Card className="p-8 text-center">
          <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">Nenhum registro de ponto para este mês. Faça upload de um arquivo Dixi na aba Uploads.</p>
        </Card>
      ) : (
        Object.entries(grouped).map(([empId, records]) => {
          const emp = employees.data?.find(e => e.id === Number(empId));
          const totalHoras = records.reduce((sum: number, r: any) => {
            if (!r.horasTrabalhadas) return sum;
            const [h, m] = r.horasTrabalhadas.split(":").map(Number);
            return sum + h * 60 + (m || 0);
          }, 0);
          const horasFormatted = `${Math.floor(totalHoras / 60)}:${String(totalHoras % 60).padStart(2, "0")}`;

          return (
            <Card key={empId}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{emp?.nomeCompleto || `Funcionário #${empId}`}</CardTitle>
                  <Badge>{horasFormatted} horas no mês</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="p-2 text-left">Data</th>
                        <th className="p-2 text-center">Entrada 1</th>
                        <th className="p-2 text-center">Saída 1</th>
                        <th className="p-2 text-center">Entrada 2</th>
                        <th className="p-2 text-center">Saída 2</th>
                        <th className="p-2 text-center">Horas</th>
                        <th className="p-2 text-left">Fonte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.sort((a: any, b: any) => new Date(a.data).getTime() - new Date(b.data).getTime()).map((r: any) => (
                        <tr key={r.id} className="border-b hover:bg-muted/50">
                          <td className="p-2">{new Date(r.data).toLocaleDateString("pt-BR")}</td>
                          <td className="p-2 text-center">{r.entrada1 || "-"}</td>
                          <td className="p-2 text-center">{r.saida1 || "-"}</td>
                          <td className="p-2 text-center">{r.entrada2 || "-"}</td>
                          <td className="p-2 text-center">{r.saida2 || "-"}</td>
                          <td className="p-2 text-center font-medium">{r.horasTrabalhadas || "-"}</td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-xs">{r.fonte || "manual"}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

// ============================================================
// ABA 3: FOLHA DE PAGAMENTO
// ============================================================
function FolhaTab({ companyId }: { companyId: number }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const payrollData = trpc.timesheet.payroll.list.useQuery({ companyId }) as any;
  const employees = trpc.employees.list.useQuery({ companyId });
  const batchDelete = trpc.batch.delete.useMutation();
  const utils = trpc.useUtils();

  const filtered = useMemo(() => {
    if (!payrollData.data) return [];
    return payrollData.data.filter((p: any) => p.mesReferencia === month);
  }, [payrollData.data, month]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p: any) => p.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    try {
      await batchDelete.mutateAsync({ table: "payroll", ids: Array.from(selectedIds) });
      toast.success(`${selectedIds.size} registro(s) excluído(s)`);
      setSelectedIds(new Set());
      utils.timesheet.payroll.list.invalidate();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Totals
  const totalBruto = filtered.reduce((s: number, p: any) => s + parseFloat(p.salarioBruto || "0"), 0);
  const totalLiquido = filtered.reduce((s: number, p: any) => s + parseFloat(p.salarioLiquido || "0"), 0);

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label>Mês de Referência</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Funcionários</p>
          <p className="text-xl font-bold">{filtered.length}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Bruto</p>
          <p className="text-xl font-bold text-green-600">R$ {totalBruto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Líquido</p>
          <p className="text-xl font-bold text-blue-600">R$ {totalLiquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </Card>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex gap-2">
          <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
            <Trash2 className="h-4 w-4 mr-1" /> Excluir Selecionados ({selectedIds.size})
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum registro de folha para este mês. Faça upload dos PDFs na aba Uploads.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 w-10"><Checkbox checked={selectedIds.size === filtered.length && filtered.length > 0} onCheckedChange={toggleSelectAll} /></th>
                    <th className="p-2 text-left">Funcionário</th>
                    <th className="p-2 text-left">Tipo</th>
                    <th className="p-2 text-right">Bruto</th>
                    <th className="p-2 text-right">Descontos</th>
                    <th className="p-2 text-right">Líquido</th>
                    <th className="p-2 text-left">Banco</th>
                    <th className="p-2 text-left">Pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p: any) => {
                    const emp = employees.data?.find((e: any) => e.id === p.employeeId);
                    return (
                      <tr key={p.id} className="border-b hover:bg-muted/50">
                        <td className="p-2"><Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} /></td>
                        <td className="p-2 font-medium">{emp?.nomeCompleto || `#${p.employeeId}`}</td>
                        <td className="p-2"><Badge variant="outline">{p.tipo}</Badge></td>
                        <td className="p-2 text-right">R$ {parseFloat(p.salarioBruto || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="p-2 text-right text-red-600">R$ {parseFloat(p.totalDescontos || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="p-2 text-right font-bold">R$ {parseFloat(p.salarioLiquido || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="p-2">{p.bancoDestino || "-"}</td>
                        <td className="p-2">{p.dataPagamento ? new Date(p.dataPagamento).toLocaleDateString("pt-BR") : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// ABA 4: VALE / ADIANTAMENTO (com aprovação)
// ============================================================
function ValeTab({ companyId }: { companyId: number }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const advancesData = trpc.payrollParsers.listAdvances.useQuery({ companyId, mesReferencia: month });
  const approveMutation = trpc.payrollParsers.approveAdvance.useMutation();
  const utils = trpc.useUtils();

  const pendentes = advancesData.data?.filter(a => a.aprovado === "Pendente") || [];
  const aprovados = advancesData.data?.filter(a => a.aprovado === "Aprovado") || [];
  const reprovados = advancesData.data?.filter(a => a.aprovado === "Reprovado") || [];

  // Regra: >10 faltas = alerta
  const alertas = advancesData.data?.filter(a => (a.diasFaltas || 0) > 10) || [];

  const handleApprove = async (id: number, aprovado: "Aprovado" | "Reprovado", motivo?: string) => {
    try {
      await approveMutation.mutateAsync({ id, aprovado, motivoReprovacao: motivo });
      toast.success(aprovado === "Aprovado" ? "Vale aprovado!" : "Vale reprovado!");
      utils.payrollParsers.listAdvances.invalidate();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <Label>Mês de Referência</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Pendentes</p>
          <p className="text-xl font-bold text-yellow-600">{pendentes.length}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Aprovados</p>
          <p className="text-xl font-bold text-green-600">{aprovados.length}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Reprovados</p>
          <p className="text-xl font-bold text-red-600">{reprovados.length}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Alertas (&gt;10 faltas)</p>
          <p className="text-xl font-bold text-orange-600">{alertas.length}</p>
        </Card>
      </div>

      {/* Alertas de faltas */}
      {alertas.length > 0 && (
        <Card className="border-orange-300 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-orange-700 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" /> Alertas: Funcionários com mais de 10 faltas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-orange-700 mb-2">
              Estes funcionários ultrapassaram 10 faltas no mês e, conforme a regra, <strong>não devem receber o vale</strong>.
              Revise e reprove os vales abaixo.
            </p>
            <div className="space-y-2">
              {alertas.map(a => (
                <div key={a.id} className="flex items-center justify-between bg-white p-3 rounded border border-orange-200">
                  <div>
                    <span className="font-medium">Funcionário #{a.employeeId}</span>
                    <Badge className="ml-2 bg-red-100 text-red-800">{a.diasFaltas} faltas</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={() => handleApprove(a.id, "Reprovado", "Mais de 10 faltas no mês")}>
                      <Ban className="h-4 w-4 mr-1" /> Reprovar Vale
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de vales */}
      <Card>
        <CardHeader>
          <CardTitle>Vales / Adiantamentos - {month}</CardTitle>
        </CardHeader>
        <CardContent>
          {!advancesData.data?.length ? (
            <p className="text-center text-muted-foreground py-8">Nenhum vale/adiantamento para este mês.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Funcionário</th>
                    <th className="p-2 text-right">Valor</th>
                    <th className="p-2 text-right">Líquido</th>
                    <th className="p-2 text-center">Faltas</th>
                    <th className="p-2 text-center">Status</th>
                    <th className="p-2 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {advancesData.data.map(a => (
                    <tr key={a.id} className={`border-b hover:bg-muted/50 ${(a.diasFaltas || 0) > 10 ? "bg-red-50" : ""}`}>
                      <td className="p-2 font-medium">Funcionário #{a.employeeId}</td>
                      <td className="p-2 text-right">R$ {parseFloat(a.valorAdiantamento || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right font-bold">R$ {parseFloat(a.valorLiquido || "0").toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-center">
                        <Badge className={(a.diasFaltas || 0) > 10 ? "bg-red-100 text-red-800" : ""}>{a.diasFaltas || 0}</Badge>
                      </td>
                      <td className="p-2 text-center">
                        {a.aprovado === "Aprovado" && <Badge className="bg-green-100 text-green-800"><ThumbsUp className="h-3 w-3 mr-1" />Aprovado</Badge>}
                        {a.aprovado === "Reprovado" && <Badge className="bg-red-100 text-red-800"><ThumbsDown className="h-3 w-3 mr-1" />Reprovado</Badge>}
                        {a.aprovado === "Pendente" && <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>}
                      </td>
                      <td className="p-2 text-center">
                        {a.aprovado === "Pendente" && (
                          <div className="flex gap-1 justify-center">
                            <Button size="sm" variant="ghost" className="text-green-600" onClick={() => handleApprove(a.id, "Aprovado")}>
                              <ThumbsUp className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleApprove(a.id, "Reprovado")}>
                              <ThumbsDown className="h-4 w-4" />
                            </Button>
                          </div>
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
    </div>
  );
}

// ============================================================
// ABA 5: PAGAMENTOS EXTRAS (diferença salário, horas extras)
// ============================================================
function ExtrasTab({ companyId }: { companyId: number }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({
    employeeId: "",
    tipo: "Horas_Extras" as string,
    valorHoraBase: "",
    percentualAcrescimo: "50",
    quantidadeHoras: "",
    valorTotal: "",
    descricao: "",
    bancoDestino: "",
  });

  const extras = trpc.payrollParsers.listExtraPayments.useQuery({ companyId, mesReferencia: month });
  const createMutation = trpc.payrollParsers.createExtraPayment.useMutation();
  const calcMutation = trpc.payrollParsers.calcularHorasExtras.useMutation();
  const employees = trpc.employees.list.useQuery({ companyId });
  const utils = trpc.useUtils();

  // Auto-calculate when hours extras fields change
  const handleCalcHorasExtras = async () => {
    if (!form.valorHoraBase || !form.percentualAcrescimo || !form.quantidadeHoras) return;
    try {
      const result = await calcMutation.mutateAsync({
        valorHora: parseFloat(form.valorHoraBase.replace(",", ".")),
        percentualAcrescimo: parseFloat(form.percentualAcrescimo),
        quantidadeHoras: parseFloat(form.quantidadeHoras.replace(",", ".")),
      });
      setForm(prev => ({ ...prev, valorTotal: result.valorTotal }));
    } catch (err) {
      // ignore
    }
  };

  const handleSave = async () => {
    if (!form.employeeId || !form.valorTotal) {
      toast.error("Preencha funcionário e valor total");
      return;
    }
    try {
      await createMutation.mutateAsync({
        companyId,
        employeeId: parseInt(form.employeeId),
        mesReferencia: month,
        tipo: form.tipo as any,
        valorHoraBase: form.valorHoraBase || undefined,
        percentualAcrescimo: form.percentualAcrescimo || undefined,
        quantidadeHoras: form.quantidadeHoras || undefined,
        valorTotal: form.valorTotal,
        descricao: form.descricao || undefined,
        bancoDestino: form.bancoDestino || undefined,
      });
      toast.success("Pagamento extra registrado!");
      setShowDialog(false);
      setForm({ employeeId: "", tipo: "Horas_Extras", valorHoraBase: "", percentualAcrescimo: "50", quantidadeHoras: "", valorTotal: "", descricao: "", bancoDestino: "" });
      utils.payrollParsers.listExtraPayments.invalidate();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Auto-fill valorHora from employee
  const selectedEmp = employees.data?.find(e => e.id === parseInt(form.employeeId));

  return (
    <div className="space-y-6 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 items-end">
          <div>
            <Label>Mês de Referência</Label>
            <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
          </div>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo Pagamento Extra
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          {!extras.data?.length ? (
            <p className="text-center text-muted-foreground py-8">Nenhum pagamento extra para este mês.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Funcionário</th>
                    <th className="p-2 text-left">Tipo</th>
                    <th className="p-2 text-right">Valor Hora</th>
                    <th className="p-2 text-center">% Acréscimo</th>
                    <th className="p-2 text-center">Qtd Horas</th>
                    <th className="p-2 text-right">Valor Total</th>
                    <th className="p-2 text-left">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {extras.data.map(e => {
                    const emp = employees.data?.find(emp => emp.id === e.employeeId);
                    return (
                      <tr key={e.id} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-medium">{emp?.nomeCompleto || `#${e.employeeId}`}</td>
                        <td className="p-2"><Badge variant="outline">{e.tipo.replace(/_/g, " ")}</Badge></td>
                        <td className="p-2 text-right">{e.valorHoraBase ? `R$ ${e.valorHoraBase}` : "-"}</td>
                        <td className="p-2 text-center">{e.percentualAcrescimo ? `${e.percentualAcrescimo}%` : "-"}</td>
                        <td className="p-2 text-center">{e.quantidadeHoras || "-"}</td>
                        <td className="p-2 text-right font-bold text-green-600">R$ {parseFloat(e.valorTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="p-2">{e.descricao || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog para novo pagamento extra */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Pagamento Extra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Funcionário</Label>
              <Select value={form.employeeId} onValueChange={v => {
                setForm(prev => ({ ...prev, employeeId: v }));
                const emp = employees.data?.find(e => e.id === parseInt(v));
                if (emp?.valorHora) setForm(prev => ({ ...prev, valorHoraBase: emp.valorHora || "" }));
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {employees.data?.map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedEmp?.valorHora && (
                <p className="text-xs text-muted-foreground mt-1">Valor hora cadastrado: R$ {selectedEmp.valorHora}</p>
              )}
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(prev => ({ ...prev, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Horas_Extras">Horas Extras</SelectItem>
                  <SelectItem value="Diferenca_Salario">Diferença de Salário</SelectItem>
                  <SelectItem value="Reembolso">Reembolso</SelectItem>
                  <SelectItem value="Bonus">Bônus</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.tipo === "Horas_Extras" && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Valor Hora (R$)</Label>
                    <Input value={form.valorHoraBase} onChange={e => setForm(prev => ({ ...prev, valorHoraBase: e.target.value }))} placeholder="12,61" />
                  </div>
                  <div>
                    <Label>% Acréscimo</Label>
                    <Input value={form.percentualAcrescimo} onChange={e => setForm(prev => ({ ...prev, percentualAcrescimo: e.target.value }))} placeholder="50" />
                  </div>
                  <div>
                    <Label>Qtd Horas</Label>
                    <Input value={form.quantidadeHoras} onChange={e => setForm(prev => ({ ...prev, quantidadeHoras: e.target.value }))} placeholder="10" />
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleCalcHorasExtras}>
                  <Calculator className="h-4 w-4 mr-1" /> Calcular Valor
                </Button>
              </>
            )}
            <div>
              <Label>Valor Total (R$)</Label>
              <Input value={form.valorTotal} onChange={e => setForm(prev => ({ ...prev, valorTotal: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={e => setForm(prev => ({ ...prev, descricao: e.target.value }))} placeholder="Motivo do pagamento..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// ABA 6: VR / IFOOD BENEFÍCIOS
// ============================================================
function VrTab({ companyId }: { companyId: number }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({
    employeeId: "",
    valorDiario: "",
    diasUteis: "",
    valorTotal: "",
    operadora: "iFood Benefícios",
  });

  const vrData = trpc.payrollParsers.listVrBenefits.useQuery({ companyId, mesReferencia: month });
  const createMutation = trpc.payrollParsers.createVrBenefit.useMutation();
  const employees = trpc.employees.list.useQuery({ companyId });
  const utils = trpc.useUtils();

  // Auto-calculate total
  const autoCalc = () => {
    const diario = parseFloat(form.valorDiario.replace(",", ".")) || 0;
    const dias = parseInt(form.diasUteis) || 0;
    setForm(prev => ({ ...prev, valorTotal: (diario * dias).toFixed(2) }));
  };

  const handleSave = async () => {
    if (!form.employeeId || !form.valorTotal) {
      toast.error("Preencha funcionário e valor total");
      return;
    }
    try {
      await createMutation.mutateAsync({
        companyId,
        employeeId: parseInt(form.employeeId),
        mesReferencia: month,
        valorDiario: form.valorDiario || undefined,
        diasUteis: form.diasUteis ? parseInt(form.diasUteis) : undefined,
        valorTotal: form.valorTotal,
        operadora: form.operadora || undefined,
      });
      toast.success("VR/iFood registrado!");
      setShowDialog(false);
      setForm({ employeeId: "", valorDiario: "", diasUteis: "", valorTotal: "", operadora: "iFood Benefícios" });
      utils.payrollParsers.listVrBenefits.invalidate();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const totalVR = vrData.data?.reduce((s, v) => s + parseFloat(v.valorTotal), 0) || 0;

  return (
    <div className="space-y-6 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 items-end">
          <div>
            <Label>Mês de Referência</Label>
            <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
          </div>
          <Card className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total VR/iFood</p>
            <p className="text-xl font-bold text-purple-600">R$ {totalVR.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </Card>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo VR/iFood
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          {!vrData.data?.length ? (
            <p className="text-center text-muted-foreground py-8">Nenhum VR/iFood registrado para este mês.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Funcionário</th>
                    <th className="p-2 text-right">Valor Diário</th>
                    <th className="p-2 text-center">Dias Úteis</th>
                    <th className="p-2 text-right">Valor Total</th>
                    <th className="p-2 text-left">Operadora</th>
                  </tr>
                </thead>
                <tbody>
                  {vrData.data.map(v => {
                    const emp = employees.data?.find(e => e.id === v.employeeId);
                    return (
                      <tr key={v.id} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-medium">{emp?.nomeCompleto || `#${v.employeeId}`}</td>
                        <td className="p-2 text-right">{v.valorDiario ? `R$ ${v.valorDiario}` : "-"}</td>
                        <td className="p-2 text-center">{v.diasUteis || "-"}</td>
                        <td className="p-2 text-right font-bold text-purple-600">R$ {parseFloat(v.valorTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="p-2">{v.operadora || "iFood Benefícios"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo VR / iFood Benefícios</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Funcionário</Label>
              <Select value={form.employeeId} onValueChange={v => setForm(prev => ({ ...prev, employeeId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {employees.data?.map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Valor Diário (R$)</Label>
                <Input value={form.valorDiario} onChange={e => setForm(prev => ({ ...prev, valorDiario: e.target.value }))} placeholder="30,00" />
              </div>
              <div>
                <Label>Dias Úteis</Label>
                <Input type="number" value={form.diasUteis} onChange={e => setForm(prev => ({ ...prev, diasUteis: e.target.value }))} placeholder="22" />
              </div>
              <div className="flex items-end">
                <Button variant="outline" className="w-full" onClick={autoCalc}>
                  <Calculator className="h-4 w-4 mr-1" /> Calcular
                </Button>
              </div>
            </div>
            <div>
              <Label>Valor Total (R$)</Label>
              <Input value={form.valorTotal} onChange={e => setForm(prev => ({ ...prev, valorTotal: e.target.value }))} placeholder="660.00" />
            </div>
            <div>
              <Label>Operadora</Label>
              <Input value={form.operadora} onChange={e => setForm(prev => ({ ...prev, operadora: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// ABA 7: CUSTO TOTAL DO FUNCIONÁRIO
// ============================================================
function CustosTab({ companyId }: { companyId: number }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const employees = trpc.employees.list.useQuery({ companyId });
  const payrollData = trpc.timesheet.payroll.list.useQuery({ companyId }) as any;
  const extras = trpc.payrollParsers.listExtraPayments.useQuery({ companyId, mesReferencia: month });
  const vrData = trpc.payrollParsers.listVrBenefits.useQuery({ companyId, mesReferencia: month });

  // Build cost summary per employee
  const costSummary = useMemo(() => {
    if (!employees.data) return [];

    return employees.data
      .filter(e => e.status === "Ativo")
      .map(emp => {
        const folha = payrollData.data?.find((p: any) => p.employeeId === emp.id && p.mesReferencia === month);
        const empExtras = extras.data?.filter(e => e.employeeId === emp.id) || [];
        const empVr = vrData.data?.filter(v => v.employeeId === emp.id) || [];

        const salarioLiquido = parseFloat(folha?.salarioLiquido || "0");
        const fgts = parseFloat(folha?.fgts || "0");
        const inss = parseFloat(folha?.inss || "0");
        const totalExtras = empExtras.reduce((s, e) => s + parseFloat(e.valorTotal), 0);
        const totalVr = empVr.reduce((s, v) => s + parseFloat(v.valorTotal), 0);
        const custoTotal = salarioLiquido + fgts + inss + totalExtras + totalVr;

        return {
          id: emp.id,
          nome: emp.nomeCompleto,
          cargo: emp.cargo || emp.funcao || "-",
          salarioLiquido,
          fgts,
          inss,
          totalExtras,
          totalVr,
          custoTotal,
        };
      })
      .sort((a, b) => b.custoTotal - a.custoTotal);
  }, [employees.data, payrollData.data, extras.data, vrData.data, month]);

  const totalGeral = costSummary.reduce((s, c) => s + c.custoTotal, 0);
  const totalFolha = costSummary.reduce((s, c) => s + c.salarioLiquido, 0);
  const totalExtrasGeral = costSummary.reduce((s, c) => s + c.totalExtras, 0);
  const totalVrGeral = costSummary.reduce((s, c) => s + c.totalVr, 0);

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <Label>Mês de Referência</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Efetivo</p>
          <p className="text-xl font-bold">{costSummary.length}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Folha</p>
          <p className="text-xl font-bold text-blue-600">R$ {totalFolha.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Total VR/iFood</p>
          <p className="text-xl font-bold text-purple-600">R$ {totalVrGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </Card>
        <Card className="p-3 text-center bg-primary/5">
          <p className="text-xs text-muted-foreground">Desembolso Total</p>
          <p className="text-xl font-bold text-primary">R$ {totalGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Custo por Funcionário - {month}</CardTitle>
        </CardHeader>
        <CardContent>
          {costSummary.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum dado de custo disponível. Faça upload dos arquivos da folha primeiro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Funcionário</th>
                    <th className="p-2 text-left">Cargo</th>
                    <th className="p-2 text-right">Salário Líq.</th>
                    <th className="p-2 text-right">FGTS</th>
                    <th className="p-2 text-right">INSS</th>
                    <th className="p-2 text-right">Extras</th>
                    <th className="p-2 text-right">VR/iFood</th>
                    <th className="p-2 text-right font-bold">Custo Total</th>
                  </tr>
                </thead>
                <tbody>
                  {costSummary.map(c => (
                    <tr key={c.id} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-medium">{c.nome}</td>
                      <td className="p-2">{c.cargo}</td>
                      <td className="p-2 text-right">R$ {c.salarioLiquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right">R$ {c.fgts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right">R$ {c.inss.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right text-orange-600">R$ {c.totalExtras.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right text-purple-600">R$ {c.totalVr.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right font-bold">R$ {c.custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-bold bg-muted/30">
                    <td className="p-2" colSpan={2}>TOTAL</td>
                    <td className="p-2 text-right">R$ {totalFolha.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="p-2 text-right">-</td>
                    <td className="p-2 text-right">-</td>
                    <td className="p-2 text-right text-orange-600">R$ {totalExtrasGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="p-2 text-right text-purple-600">R$ {totalVrGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="p-2 text-right">R$ {totalGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
