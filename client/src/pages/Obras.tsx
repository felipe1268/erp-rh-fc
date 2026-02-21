import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Pencil, Trash2, Landmark, MapPin, Calendar, Loader2 } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

const STATUS_OPTIONS = [
  { value: "Planejamento", label: "Planejamento", color: "bg-blue-100 text-blue-800" },
  { value: "Em_Andamento", label: "Em Andamento", color: "bg-green-100 text-green-800" },
  { value: "Paralisada", label: "Paralisada", color: "bg-yellow-100 text-yellow-800" },
  { value: "Concluida", label: "Concluída", color: "bg-gray-100 text-gray-800" },
  { value: "Cancelada", label: "Cancelada", color: "bg-red-100 text-red-800" },
];

type ObraForm = {
  nome: string; numOrcamento: string; snRelogioPonto: string;
  status: string; cep: string; endereco: string;
  dataInicio: string; dataPrevisaoFim: string; observacoes: string;
};

const emptyForm: ObraForm = {
  nome: "", numOrcamento: "", snRelogioPonto: "",
  status: "Planejamento", cep: "", endereco: "",
  dataInicio: "", dataPrevisaoFim: "", observacoes: "",
};

export default function Obras() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const obrasQ = trpc.obras.list.useQuery({ companyId }, { enabled: !!companyId });
  const obras = obrasQ.data ?? [];

  const createMut = trpc.obras.create.useMutation({ onSuccess: () => { obrasQ.refetch(); setDialogOpen(false); toast.success("Obra criada com sucesso!"); } });
  const updateMut = trpc.obras.update.useMutation({ onSuccess: () => { obrasQ.refetch(); setDialogOpen(false); toast.success("Obra atualizada!"); } });
  const deleteMut = trpc.obras.delete.useMutation({ onSuccess: () => { obrasQ.refetch(); toast.success("Obra excluída!"); } });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ObraForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [buscandoCep, setBuscandoCep] = useState(false);

  const filtered = useMemo(() => {
    let list = obras;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((o: any) => o.nome?.toLowerCase().includes(s) || o.numOrcamento?.toLowerCase().includes(s) || o.snRelogioPonto?.toLowerCase().includes(s));
    }
    if (statusFilter !== "Todos") {
      list = list.filter((o: any) => o.status === statusFilter);
    }
    return list;
  }, [obras, search, statusFilter]);

  const openNew = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (obra: any) => {
    setEditingId(obra.id);
    setForm({
      nome: obra.nome || "", numOrcamento: obra.numOrcamento || obra.codigo || "",
      snRelogioPonto: obra.snRelogioPonto || "", status: obra.status || "Planejamento",
      cep: obra.cep || "", endereco: obra.endereco || "",
      dataInicio: obra.dataInicio || "", dataPrevisaoFim: obra.dataPrevisaoFim || "",
      observacoes: obra.observacoes || "",
    });
    setDialogOpen(true);
  };

  const buscarCep = useCallback(async (cep: string) => {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await resp.json();
      if (data.erro) {
        toast.error("CEP não encontrado");
      } else {
        const enderecoCompleto = [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean).join(", ");
        setForm(f => ({ ...f, endereco: enderecoCompleto }));
        toast.success("Endereço preenchido automaticamente!");
      }
    } catch {
      toast.error("Erro ao buscar CEP");
    } finally {
      setBuscandoCep(false);
    }
  }, []);

  const handleCepChange = (value: string) => {
    // Formatar CEP: 00000-000
    const digits = value.replace(/\D/g, "").slice(0, 8);
    const formatted = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    setForm(f => ({ ...f, cep: formatted }));
    if (digits.length === 8) {
      buscarCep(digits);
    }
  };

  const handleSave = () => {
    if (!form.nome.trim()) { toast.error("Nome da obra é obrigatório"); return; }
    const cleanForm = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? undefined : v])
    ) as any;
    cleanForm.nome = form.nome;
    if (editingId) {
      updateMut.mutate({ id: editingId, ...cleanForm } as any);
    } else {
      createMut.mutate({ companyId, ...cleanForm } as any);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir esta obra?")) {
      deleteMut.mutate({ id });
    }
  };

  const getStatusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find(s => s.value === status);
    return opt ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${opt.color}`}>{opt.label}</span> : status;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Obras</h1>
            <p className="text-muted-foreground text-sm">Cadastro e gestão de obras e projetos</p>
          </div>
          <Button onClick={openNew} className="bg-[#1B2A4A] hover:bg-[#243660]">
            <Plus className="h-4 w-4 mr-2" /> Nova Obra
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, nº orçamento ou Sn..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos os Status</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Landmark className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-lg">Nenhuma obra encontrada</h3>
              <p className="text-muted-foreground text-sm mt-1">Cadastre a primeira obra.</p>
              <Button onClick={openNew} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                <Plus className="h-4 w-4 mr-2" /> Nova Obra
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((obra: any) => (
              <Card key={obra.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base truncate">{obra.nome}</h3>
                      {(obra.numOrcamento || obra.codigo) && <p className="text-xs text-muted-foreground">Orç: {obra.numOrcamento || obra.codigo}</p>}
                    </div>
                    {getStatusBadge(obra.status)}
                  </div>
                  {obra.snRelogioPonto && (
                    <p className="text-xs text-muted-foreground mb-1">Sn: {obra.snRelogioPonto}</p>
                  )}
                  {obra.endereco && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{obra.endereco}</span>
                    </div>
                  )}
                  {obra.dataInicio && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Calendar className="h-3.5 w-3.5" /> Início: {obra.dataInicio}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                    <Button variant="outline" size="sm" onClick={() => openEdit(obra)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(obra.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Obra" : "Nova Obra"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Nome da Obra *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Edifício Residencial Aurora" />
            </div>
            <div>
              <Label>N° do Orçamento</Label>
              <Input value={form.numOrcamento} onChange={e => setForm(f => ({ ...f, numOrcamento: e.target.value }))} placeholder="Ex: ORC-2026-001" />
            </div>
            <div>
              <Label>Sn (Relógio de Ponto)</Label>
              <Input value={form.snRelogioPonto} onChange={e => setForm(f => ({ ...f, snRelogioPonto: e.target.value }))} placeholder="Código de identificação do relógio" />
            </div>
            <div className="col-span-2">
              <Label>Status</Label>
              <Select value={form.status || "Planejamento"} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CEP</Label>
              <div className="relative">
                <Input value={form.cep} onChange={e => handleCepChange(e.target.value)} placeholder="00000-000" />
                {buscandoCep && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            </div>
            <div>
              <Label>Endereço</Label>
              <Input value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} placeholder="Preenchido automaticamente pelo CEP" />
            </div>
            <div>
              <Label>Data de Início</Label>
              <Input type="date" value={form.dataInicio} onChange={e => setForm(f => ({ ...f, dataInicio: e.target.value }))} />
            </div>
            <div>
              <Label>Data de Término</Label>
              <Input type="date" value={form.dataPrevisaoFim} onChange={e => setForm(f => ({ ...f, dataPrevisaoFim: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
              {createMut.isPending || updateMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
