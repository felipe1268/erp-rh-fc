import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Pencil, Trash2, Landmark, MapPin, Calendar, Loader2, Wifi, X, AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
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
  nome: string; numOrcamento: string;
  status: string; cep: string; endereco: string;
  dataInicio: string; dataPrevisaoFim: string; observacoes: string;
};

const emptyForm: ObraForm = {
  nome: "", numOrcamento: "",
  status: "Planejamento", cep: "", endereco: "",
  dataInicio: "", dataPrevisaoFim: "", observacoes: "",
};

export default function Obras() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const obrasQ = trpc.obras.list.useQuery({ companyId }, { enabled: !!companyId });
  const obras = obrasQ.data ?? [];
  const allSnsQ = trpc.obras.listSnsByCompany.useQuery({ companyId }, { enabled: !!companyId });
  const allSns = allSnsQ.data ?? [];

  const createMut = trpc.obras.create.useMutation({ onSuccess: () => { obrasQ.refetch(); setDialogOpen(false); toast.success("Obra criada com sucesso!"); } });
  const updateMut = trpc.obras.update.useMutation({ onSuccess: () => { obrasQ.refetch(); allSnsQ.refetch(); setDialogOpen(false); toast.success("Obra atualizada!"); } });
  const deleteMut = trpc.obras.delete.useMutation({ onSuccess: () => { obrasQ.refetch(); allSnsQ.refetch(); toast.success("Obra excluída!"); } });
  const addSnMut = trpc.obras.addSn.useMutation({
    onSuccess: () => { allSnsQ.refetch(); obraSnQ.refetch(); toast.success("SN vinculado com sucesso!"); setNewSn(""); setNewSnApelido(""); },
    onError: (err) => toast.error(err.message),
  });
  const removeSnMut = trpc.obras.removeSn.useMutation({
    onSuccess: () => { allSnsQ.refetch(); obraSnQ.refetch(); toast.success("SN liberado!"); },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ObraForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [newSn, setNewSn] = useState("");
  const [newSnApelido, setNewSnApelido] = useState("");
  const [snValidation, setSnValidation] = useState<{ checking: boolean; available?: boolean; usedByObra?: string }>({ checking: false });

  // Query SNs da obra sendo editada
  const obraSnQ = trpc.obras.listSns.useQuery({ obraId: editingId || 0 }, { enabled: !!editingId });
  const obraSns = obraSnQ.data ?? [];

  // Mapa de SNs por obra para exibição nos cards
  const snsByObra = useMemo(() => {
    const map: Record<number, { sn: string; apelido: string | null; status: string }[]> = {};
    for (const item of allSns) {
      const obraId = item.obraSn.obraId;
      if (!map[obraId]) map[obraId] = [];
      map[obraId].push({ sn: item.obraSn.sn, apelido: item.obraSn.apelido, status: item.obraSn.status });
    }
    return map;
  }, [allSns]);

  const filtered = useMemo(() => {
    let list = obras;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((o: any) => {
        const matchName = o.nome?.toLowerCase().includes(s);
        const matchOrc = o.numOrcamento?.toLowerCase().includes(s);
        const matchSn = (snsByObra[o.id] || []).some(sn => sn.sn.toLowerCase().includes(s));
        return matchName || matchOrc || matchSn;
      });
    }
    if (statusFilter !== "Todos") {
      list = list.filter((o: any) => o.status === statusFilter);
    }
    return list;
  }, [obras, search, statusFilter, snsByObra]);

  const openNew = () => { setEditingId(null); setForm(emptyForm); setNewSn(""); setNewSnApelido(""); setSnValidation({ checking: false }); setDialogOpen(true); };
  const openEdit = (obra: any) => {
    setEditingId(obra.id);
    setForm({
      nome: obra.nome || "", numOrcamento: obra.numOrcamento || obra.codigo || "",
      status: obra.status || "Planejamento",
      cep: obra.cep || "", endereco: obra.endereco || "",
      dataInicio: obra.dataInicio || "", dataPrevisaoFim: obra.dataPrevisaoFim || "",
      observacoes: obra.observacoes || "",
    });
    setNewSn(""); setNewSnApelido(""); setSnValidation({ checking: false });
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

  const handleAddSn = () => {
    if (!newSn.trim()) { toast.error("Informe o número do SN"); return; }
    if (!editingId) { toast.error("Salve a obra primeiro para vincular SNs"); return; }
    addSnMut.mutate({ companyId, obraId: editingId, sn: newSn.trim(), apelido: newSnApelido.trim() || undefined });
  };

  const handleRemoveSn = (id: number) => {
    if (confirm("Deseja liberar este SN? Ele ficará disponível para outras obras.")) {
      removeSnMut.mutate({ id });
    }
  };

  // Validação em tempo real do SN
  const checkSnQ = trpc.obras.checkSnAvailability.useQuery(
    { companyId, sn: newSn.trim(), excludeObraId: editingId || undefined },
    { enabled: !!companyId && newSn.trim().length >= 2 }
  );

  const getStatusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find(s => s.value === status);
    return opt ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${opt.color}`}>{opt.label}</span> : status;
  };

  const isObraInativa = form.status === "Concluida" || form.status === "Cancelada" || form.status === "Paralisada";

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Obras</h1>
            <p className="text-muted-foreground text-sm">Cadastro e gestão de obras e projetos</p>
          </div>
          <div className="flex items-center gap-2">
            <PrintActions title="Obras" />
            <Button onClick={openNew} className="bg-[#1B2A4A] hover:bg-[#243660]">
              <Plus className="h-4 w-4 mr-2" /> Nova Obra
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, nº orçamento ou SN..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
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
            {filtered.map((obra: any) => {
              const obraSnList = snsByObra[obra.id] || [];
              const activeSns = obraSnList.filter(s => s.status === "ativo");
              return (
                <Card key={obra.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base truncate">{obra.nome}</h3>
                        {(obra.numOrcamento || obra.codigo) && <p className="text-xs text-muted-foreground">Orç: {obra.numOrcamento || obra.codigo}</p>}
                      </div>
                      {getStatusBadge(obra.status)}
                    </div>
                    {/* SNs vinculados */}
                    {activeSns.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {activeSns.map((s, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
                            <Wifi className="h-2.5 w-2.5" />
                            {s.sn}{s.apelido ? ` (${s.apelido})` : ""}
                          </Badge>
                        ))}
                      </div>
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
              );
            })}
          </div>
        )}
      </div>

      <FullScreenDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={editingId ? "Editar Obra" : "Nova Obra"} icon={<Landmark className="h-5 w-5 text-white" />}>
        <div className="max-w-2xl mx-auto">
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

            {/* Seção de SNs (Relógios de Ponto) */}
            {editingId && (
              <div className="col-span-2 border-t pt-4 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Label className="text-base font-semibold">Relógios de Ponto (SNs)</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Vincule os números de série dos relógios DIXI desta obra</p>
                  </div>
                  {isObraInativa && (
                    <Badge variant="secondary" className="text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      SNs serão liberados ao salvar
                    </Badge>
                  )}
                </div>

                {/* Lista de SNs vinculados */}
                {obraSns.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {obraSns.map((sn: any) => (
                      <div key={sn.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${sn.status === "ativo" ? "bg-emerald-50/50 border-emerald-200" : "bg-gray-50 border-gray-200 opacity-60"}`}>
                        <div className="flex items-center gap-3">
                          <Wifi className={`h-4 w-4 ${sn.status === "ativo" ? "text-emerald-600" : "text-gray-400"}`} />
                          <div>
                            <span className="font-mono font-semibold text-sm">{sn.sn}</span>
                            {sn.apelido && <span className="text-xs text-muted-foreground ml-2">({sn.apelido})</span>}
                          </div>
                          <Badge variant={sn.status === "ativo" ? "default" : "secondary"} className="text-[10px]">
                            {sn.status === "ativo" ? "Ativo" : "Liberado"}
                          </Badge>
                        </div>
                        {sn.status === "ativo" && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleRemoveSn(sn.id)} disabled={removeSnMut.isPending}>
                            <X className="h-3.5 w-3.5 mr-1" /> Liberar
                          </Button>
                        )}
                        {sn.status === "inativo" && sn.dataLiberacao && (
                          <span className="text-[10px] text-muted-foreground">Liberado em {new Date(sn.dataLiberacao + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Adicionar novo SN */}
                {!isObraInativa && (
                  <div className="bg-slate-50 rounded-lg border p-3 space-y-2">
                    <p className="text-xs font-medium text-slate-600">Adicionar novo SN</p>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label className="text-xs">Número de Série *</Label>
                        <div className="relative">
                          <Input
                            value={newSn}
                            onChange={e => setNewSn(e.target.value.toUpperCase())}
                            placeholder="Ex: 0001234567"
                            className="font-mono pr-8"
                          />
                          {newSn.trim().length >= 2 && checkSnQ.data && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2">
                              {checkSnQ.data.available ? (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-red-500" />
                              )}
                            </div>
                          )}
                        </div>
                        {newSn.trim().length >= 2 && checkSnQ.data && !checkSnQ.data.available && (
                          <p className="text-xs text-red-600 mt-1">
                            SN já em uso na obra "{checkSnQ.data.usedByObra}"
                          </p>
                        )}
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">Apelido (opcional)</Label>
                        <Input
                          value={newSnApelido}
                          onChange={e => setNewSnApelido(e.target.value)}
                          placeholder="Ex: Relógio Portaria"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={handleAddSn}
                        disabled={addSnMut.isPending || !newSn.trim() || (checkSnQ.data && !checkSnQ.data.available)}
                        className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
                      >
                        {addSnMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                        Vincular
                      </Button>
                    </div>
                  </div>
                )}

                {isObraInativa && obraSns.filter((s: any) => s.status === "ativo").length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                    <p className="text-xs text-amber-800">
                      <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                      Ao salvar com status "{STATUS_OPTIONS.find(s => s.value === form.status)?.label}", todos os SNs ativos serão automaticamente liberados e ficarão disponíveis para outras obras.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Aviso para obras novas */}
            {!editingId && (
              <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <Wifi className="h-3.5 w-3.5 inline mr-1" />
                  Após criar a obra, edite-a para vincular os relógios de ponto (SNs).
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
              {createMut.isPending || updateMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </FullScreenDialog>
    </DashboardLayout>
  );
}
