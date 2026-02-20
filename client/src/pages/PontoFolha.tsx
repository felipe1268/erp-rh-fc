import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Clock, Plus, Search, DollarSign, Upload } from "lucide-react";

export default function PontoFolha() {
  const [companyId] = useState(() => {
    const saved = localStorage.getItem("selectedCompanyId");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [activeTab, setActiveTab] = useState("ponto");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ponto e Folha de Pagamento</h1>
          <p className="text-muted-foreground mt-1">Controle de ponto (Dixi) e espelho da folha de pagamento</p>
        </div>

        {companyId === 0 ? (
          <Card className="p-8 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Selecione uma empresa no Dashboard para acessar o módulo.</p>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-2 w-full max-w-md">
              <TabsTrigger value="ponto">Registro de Ponto</TabsTrigger>
              <TabsTrigger value="folha">Folha de Pagamento</TabsTrigger>
            </TabsList>
            <TabsContent value="ponto"><PontoTab companyId={companyId} /></TabsContent>
            <TabsContent value="folha"><FolhaTab companyId={companyId} /></TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

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
        <div className="pt-6">
          <Button variant="outline" onClick={() => toast("Importação Dixi", { description: "Funcionalidade de importação do Dixi em desenvolvimento." })}>
            <Upload className="h-4 w-4 mr-2" /> Importar Dixi
          </Button>
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
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum registro de ponto encontrado para este período</td></tr>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Selecione um colaborador para visualizar o registro de ponto.</p>
        </Card>
      )}
    </div>
  );
}

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

  return (
    <div className="space-y-4 mt-4">
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
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum registro para este mês</td></tr>
              ) : payrolls.map((p: any) => (
                <tr key={p.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{getEmpName(p.employeeId)}</td>
                  <td className="p-3">{p.tipo?.replace("_", " ")}</td>
                  <td className="p-3 text-right">R$ {p.salarioBruto ?? "-"}</td>
                  <td className="p-3 text-right text-green-600">R$ {p.totalProventos ?? "-"}</td>
                  <td className="p-3 text-right text-red-600">R$ {p.totalDescontos ?? "-"}</td>
                  <td className="p-3 text-right font-semibold">R$ {p.salarioLiquido ?? "-"}</td>
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate({ id: p.id })}>
                      <DollarSign className="h-4 w-4 text-destructive" />
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
